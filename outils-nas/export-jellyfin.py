#!/usr/bin/env python3
"""
export-jellyfin.py — produit le catalogue Cinéflix lu par l'application.

Interroge Jellyfin, ne garde que l'identifiant TMDB de chaque film et série,
et publie la liste. C'est elle qui permet à l'app de filtrer « Sur Cinéflix /
Pas encore » instantanément, sans interroger le serveur titre par titre.

Deux destinations, cumulables :

  --supabase   pousse la liste dans la table `catalogue` (l'app est en ligne,
               le NAS ne reçoit aucune connexion entrante)
  --sortie     écrit un cineflix.json local (app servie depuis le NAS)

    export JELLYFIN_URL="http://100.95.13.53:30013"
    export JELLYFIN_TOKEN="xxxxxxxxxxxxxxxx"      # Tableau de bord → Clés API
    export SUPABASE_URL="https://xxxx.supabase.co"
    export SUPABASE_KEY="…service_role…"          # Project Settings → API
    python3 export-jellyfin.py --supabase

La clé service_role contourne les règles RLS : elle ne doit jamais quitter le
NAS ni figurer dans config.js.

À poser en tâche planifiée toutes les heures (TrueNAS : Système → Tâches
planifiées → Cron Jobs).
"""

import argparse
import json
import os
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

TIMEOUT = 30
PAGE = 500


def appel(base, token, chemin, params):
    url = base.rstrip("/") + chemin + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "Authorization": 'MediaBrowser Token="%s"' % token,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def recuperer(base, token, genre):
    """Parcourt la bibliothèque page par page.

    On demande explicitement ProviderIds : sans ce champ Jellyfin renvoie une
    fiche allégée, et on n'aurait aucun moyen de faire le lien avec TMDB.
    """
    ids, debut = set(), 0
    sans_tmdb = 0
    while True:
        d = appel(base, token, "/Items", {
            "IncludeItemTypes": genre,
            "Recursive": "true",
            "Fields": "ProviderIds",
            "StartIndex": debut,
            "Limit": PAGE,
            "EnableTotalRecordCount": "true",
        })
        lot = d.get("Items", [])
        if not lot:
            break
        for it in lot:
            tmdb = (it.get("ProviderIds") or {}).get("Tmdb")
            if tmdb:
                try:
                    ids.add(int(tmdb))
                except ValueError:
                    sans_tmdb += 1
            else:
                sans_tmdb += 1
        debut += len(lot)
        if debut >= d.get("TotalRecordCount", debut):
            break
    return sorted(ids), sans_tmdb


def pousser_supabase(base, key, contenu):
    """Écrase l'unique ligne de la table `catalogue`.

    Un seul appel, une seule ligne : l'app lit un enregistrement ou rien, elle
    ne peut jamais tomber sur un catalogue à moitié remplacé.
    """
    url = base.rstrip("/") + "/rest/v1/catalogue"
    corps = json.dumps({
        "id": 1,
        "movies": contenu["movies"],
        "tv": contenu["tv"],
        "maj": contenu["maj"],
    }).encode("utf-8")
    req = urllib.request.Request(url, data=corps, method="POST", headers={
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser(description="Exporte le catalogue Jellyfin au format Cinéflix.")
    ap.add_argument("--url", default=os.environ.get("JELLYFIN_URL"),
                    help="URL du serveur Jellyfin (ou variable JELLYFIN_URL)")
    ap.add_argument("--token", default=os.environ.get("JELLYFIN_TOKEN"),
                    help="Clé API Jellyfin (ou variable JELLYFIN_TOKEN)")
    ap.add_argument("--sortie", help="Fichier cineflix.json à écrire")
    ap.add_argument("--supabase", action="store_true",
                    help="Pousser dans la table catalogue de Supabase")
    ap.add_argument("--supabase-url", default=os.environ.get("SUPABASE_URL"))
    ap.add_argument("--supabase-key", default=os.environ.get("SUPABASE_KEY"),
                    help="Clé service_role — ne quitte jamais le NAS")
    a = ap.parse_args()

    if not a.url or not a.token:
        sys.exit("Il manque --url ou --token (voir l'en-tête du script).")
    if not a.supabase and not a.sortie:
        sys.exit("Choisis au moins une destination : --supabase et/ou --sortie.")
    if a.supabase and not (a.supabase_url and a.supabase_key):
        sys.exit("--supabase demande SUPABASE_URL et SUPABASE_KEY.")

    try:
        films, films_ko = recuperer(a.url, a.token, "Movie")
        series, series_ko = recuperer(a.url, a.token, "Series")
    except urllib.error.HTTPError as e:
        sys.exit("Jellyfin a répondu %s — vérifie la clé API." % e.code)
    except urllib.error.URLError as e:
        sys.exit("Serveur injoignable : %s" % e.reason)

    if not films and not series:
        # Écraser un catalogue valide par un fichier vide ferait disparaître
        # toute la bibliothèque de l'app : mieux vaut ne rien écrire.
        sys.exit("Aucun titre trouvé — le fichier existant n'a pas été touché.")

    contenu = {
        "maj": date.today().isoformat(),
        "source": "jellyfin",
        "movies": films,
        "tv": series,
    }

    if a.sortie:
        # Écriture atomique : une coupure en plein milieu ne doit pas laisser un
        # JSON tronqué que l'app refuserait de lire.
        dossier = os.path.dirname(os.path.abspath(a.sortie)) or "."
        fd, tmp = tempfile.mkstemp(dir=dossier, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(contenu, f, ensure_ascii=False, separators=(",", ":"))
            os.replace(tmp, a.sortie)
        except Exception:
            os.path.exists(tmp) and os.unlink(tmp)
            raise
        print("%s écrit" % a.sortie)

    if a.supabase:
        try:
            pousser_supabase(a.supabase_url, a.supabase_key, contenu)
            print("Supabase mis à jour")
        except urllib.error.HTTPError as e:
            sys.exit("Supabase a répondu %s : %s" % (e.code, e.read().decode("utf-8", "ignore")[:300]))
        except urllib.error.URLError as e:
            sys.exit("Supabase injoignable : %s" % e.reason)

    print("%d films, %d séries" % (len(films), len(series)))
    if films_ko or series_ko:
        print("%d titre(s) sans identifiant TMDB — ils apparaîtront comme absents. "
              "Lance une analyse de la bibliothèque dans Jellyfin pour les identifier."
              % (films_ko + series_ko))


if __name__ == "__main__":
    main()
