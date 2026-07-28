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


def utilisateur_principal(base, token):
    """L'identifiant d'utilisateur à joindre aux requêtes.

    C'est lui qui débloque les données de lecture (nombre de lectures, dernière
    lecture) — Jellyfin les tient par utilisateur, pas par serveur. On prend le
    premier administrateur, sauf si JELLYFIN_USER désigne quelqu'un d'autre.
    """
    voulu = (os.environ.get("JELLYFIN_USER") or "").strip().lower()
    try:
        users = appel(base, token, "/Users", {})
    except Exception:
        return None
    if voulu:
        for u in users:
            if voulu in ((u.get("Name") or "").lower(), (u.get("Id") or "").lower()):
                return u.get("Id")
    admins = [u for u in users if (u.get("Policy") or {}).get("IsAdministrator")]
    return (admins or users or [{}])[0].get("Id")


CHAMPS = ("ProviderIds,DateCreated,RunTimeTicks,OfficialRating,CriticRating,"
          "CommunityRating,PremiereDate,Genres")


def resume(it, genre, tmdb_id):
    """La fiche compacte d'un titre — ce que l'app trie sans appeler personne."""
    ud = it.get("UserData") or {}
    return {
        "t": "movie" if genre == "Movie" else "tv",
        "id": tmdb_id,
        "nom": it.get("Name") or "",
        "sortie": (it.get("PremiereDate") or "")[:10],
        "ajout": (it.get("DateCreated") or "")[:10],
        # RunTimeTicks est en unités de 100 ns : 600 000 000 ticks = 1 minute.
        "duree": int(round((it.get("RunTimeTicks") or 0) / 600000000)),
        "cert": it.get("OfficialRating") or "",
        "note": it.get("CommunityRating"),
        "noteCrit": it.get("CriticRating"),
        "vu": ud.get("PlayCount") or 0,
        "lu": (ud.get("LastPlayedDate") or "")[:10],
        "genres": it.get("Genres") or [],
    }


def recuperer(base, token, genre, user_id):
    """Parcourt la bibliothèque page par page.

    On demande explicitement ProviderIds : sans ce champ Jellyfin renvoie une
    fiche allégée, et on n'aurait aucun moyen de faire le lien avec TMDB.
    Les autres champs nourrissent les tris de l'app (date d'ajout, durée,
    classification, notes, lectures).
    """
    ids, fiches, debut = set(), [], 0
    sans_tmdb = 0
    while True:
        params = {
            "IncludeItemTypes": genre,
            "Recursive": "true",
            "Fields": CHAMPS,
            "StartIndex": debut,
            "Limit": PAGE,
            "EnableTotalRecordCount": "true",
        }
        if user_id:
            params["userId"] = user_id
        d = appel(base, token, "/Items", params)
        lot = d.get("Items", [])
        if not lot:
            break
        for it in lot:
            tmdb = (it.get("ProviderIds") or {}).get("Tmdb")
            try:
                tmdb = int(tmdb)
            except (TypeError, ValueError):
                sans_tmdb += 1
                continue
            if tmdb not in ids:
                ids.add(tmdb)
                fiches.append(resume(it, genre, tmdb))
        debut += len(lot)
        if debut >= d.get("TotalRecordCount", debut):
            break
    return sorted(ids), fiches, sans_tmdb


def lire_supabase(base, key, chemin):
    req = urllib.request.Request(base.rstrip("/") + chemin, headers={
        "apikey": key, "Authorization": "Bearer " + key, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def notifier_arrivees(base, key, anciens_m, anciens_t, films, series):
    """Prévenir ceux dont une demande vient d'arriver — notification push.

    N'agit que si VAPID_PRIVATE est posée dans l'environnement de la tâche.
    Toute panne ici est avalée : les notifications ne doivent jamais faire
    échouer l'export du catalogue.
    """
    prive = os.environ.get("VAPID_PRIVATE", "").strip()
    if not prive:
        return
    if not anciens_m and not anciens_t:
        # Ancien état illisible (ou premier passage) : impossible de savoir ce
        # qui est nouveau — mieux vaut se taire que noyer tout le monde.
        return
    nm = sorted(set(films) - set(anciens_m))
    nt = sorted(set(series) - set(anciens_t))
    if not nm and not nt:
        return
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "--quiet",
                        "--break-system-packages", "pywebpush"], check=False)
        try:
            from pywebpush import webpush, WebPushException
        except ImportError:
            print("pywebpush introuvable : notifications sautées")
            return
    ids = ",".join(str(i) for i in (nm + nt))
    demandes = lire_supabase(base, key,
        "/rest/v1/elements?select=user_id,titre,tmdb_id,type,poster"
        "&demande=is.true&statut=in.(demande,encours)&tmdb_id=in.(%s)" % ids)
    demandes = [d for d in demandes
                if (d["type"] == "movie" and d["tmdb_id"] in nm)
                or (d["type"] == "tv" and d["tmdb_id"] in nt)]
    if not demandes:
        return
    users = sorted({d["user_id"] for d in demandes})
    abos = lire_supabase(base, key,
        "/rest/v1/push_abonnements?select=endpoint,p256dh,auth,user_id"
        "&user_id=in.(%s)" % ",".join(users))
    par_user = {}
    for ab in abos:
        par_user.setdefault(ab["user_id"], []).append(ab)
    envoyees = 0
    for d in demandes:
        quoi = "film" if d["type"] == "movie" else "série"
        # Une ligne + la jaquette, façon « Mes Séries » : le titre porte tout,
        # l'affiche TMDB sert de vignette.
        corps = json.dumps({
            "titre": "%s est disponible !" % (d.get("titre") or "Votre demande"),
            "corps": "Bonne nouvelle : votre %s est sur Cinéflix — regardez maintenant." % quoi,
            "ic": ("https://image.tmdb.org/t/p/w185" + d["poster"])
                  if d.get("poster") else "",
            "url": "https://lisamiens87.github.io/cineflix/"})
        for ab in par_user.get(d["user_id"], []):
            try:
                webpush(subscription_info={"endpoint": ab["endpoint"],
                        "keys": {"p256dh": ab["p256dh"], "auth": ab["auth"]}},
                        data=corps, vapid_private_key=prive,
                        vapid_claims={"sub": "mailto:alexandre.mesnier@cabinet-ekinox.fr"})
                envoyees += 1
            except WebPushException as e:
                code = getattr(getattr(e, "response", None), "status_code", None)
                if code in (404, 410):
                    # abonnement mort (app désinstallée…) : on le retire
                    try:
                        req = urllib.request.Request(
                            base.rstrip("/") + "/rest/v1/push_abonnements?endpoint=eq."
                            + urllib.parse.quote(ab["endpoint"], safe=""),
                            method="DELETE",
                            headers={"apikey": key, "Authorization": "Bearer " + key})
                        urllib.request.urlopen(req, timeout=TIMEOUT)
                    except Exception:
                        pass
    if envoyees:
        print("%d notification(s) envoyée(s)" % envoyees)


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
        "items": contenu["items"],
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
        uid = utilisateur_principal(a.url, a.token)
        films, fiches_f, films_ko = recuperer(a.url, a.token, "Movie", uid)
        series, fiches_s, series_ko = recuperer(a.url, a.token, "Series", uid)
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
        "items": fiches_f + fiches_s,
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
        # L'état AVANT écrasement : c'est lui qui dit ce qui vient d'arriver.
        anciens_m, anciens_t = [], []
        try:
            r = lire_supabase(a.supabase_url, a.supabase_key,
                              "/rest/v1/catalogue?select=movies,tv&id=eq.1")
            if r:
                anciens_m = r[0].get("movies") or []
                anciens_t = r[0].get("tv") or []
        except Exception:
            pass
        try:
            pousser_supabase(a.supabase_url, a.supabase_key, contenu)
            print("Supabase mis à jour")
            try:
                notifier_arrivees(a.supabase_url, a.supabase_key,
                                  anciens_m, anciens_t, films, series)
            except Exception as e:
                print("Notifications sautées : %s" % e)
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
