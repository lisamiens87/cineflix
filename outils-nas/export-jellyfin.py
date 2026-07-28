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
import base64
import hashlib
import hmac
import json
import os
import re
import struct
import sys
import unicodedata
import tempfile
import time
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
          "CommunityRating,PremiereDate,Genres,ProductionLocations")

# Jellyfin donne les pays de production en toutes lettres (souvent en
# anglais) ; l'app filtre par codes ISO-2 — même langage que TMDB.
PAYS_ISO = {
    "united states of america": "US", "united states": "US", "usa": "US",
    "états-unis": "US", "etats-unis": "US",
    "canada": "CA", "mexico": "MX", "mexique": "MX",
    "france": "FR", "united kingdom": "GB", "royaume-uni": "GB", "uk": "GB",
    "germany": "DE", "allemagne": "DE", "italy": "IT", "italie": "IT",
    "spain": "ES", "espagne": "ES", "portugal": "PT",
    "belgium": "BE", "belgique": "BE", "netherlands": "NL", "pays-bas": "NL",
    "luxembourg": "LU", "ireland": "IE", "irlande": "IE",
    "austria": "AT", "autriche": "AT", "switzerland": "CH", "suisse": "CH",
    "sweden": "SE", "suède": "SE", "norway": "NO", "norvège": "NO",
    "denmark": "DK", "danemark": "DK", "finland": "FI", "finlande": "FI",
    "iceland": "IS", "islande": "IS", "poland": "PL", "pologne": "PL",
    "czech republic": "CZ", "czechia": "CZ", "slovakia": "SK",
    "hungary": "HU", "hongrie": "HU", "romania": "RO", "roumanie": "RO",
    "bulgaria": "BG", "greece": "GR", "grèce": "GR", "croatia": "HR",
    "slovenia": "SI", "serbia": "RS", "ukraine": "UA",
    "estonia": "EE", "latvia": "LV", "lithuania": "LT", "russia": "RU",
    "japan": "JP", "japon": "JP", "south korea": "KR", "korea": "KR",
    "corée du sud": "KR", "china": "CN", "chine": "CN", "hong kong": "HK",
    "taiwan": "TW", "india": "IN", "inde": "IN", "thailand": "TH",
    "thaïlande": "TH", "indonesia": "ID", "philippines": "PH",
    "vietnam": "VN", "malaysia": "MY", "singapore": "SG", "singapour": "SG",
    "turkey": "TR", "turquie": "TR", "israel": "IL", "israël": "IL",
    "iran": "IR", "saudi arabia": "SA", "united arab emirates": "AE",
    "kazakhstan": "KZ", "pakistan": "PK", "bangladesh": "BD",
    "sri lanka": "LK", "nepal": "NP", "cambodia": "KH", "mongolia": "MN",
    "south africa": "ZA", "afrique du sud": "ZA", "nigeria": "NG",
    "egypt": "EG", "égypte": "EG", "morocco": "MA", "maroc": "MA",
    "algeria": "DZ", "algérie": "DZ", "tunisia": "TN", "tunisie": "TN",
    "senegal": "SN", "sénégal": "SN", "kenya": "KE", "ghana": "GH",
    "ivory coast": "CI", "côte d'ivoire": "CI", "cameroon": "CM",
    "ethiopia": "ET", "angola": "AO", "libya": "LY",
    "brazil": "BR", "brésil": "BR", "argentina": "AR", "argentine": "AR",
    "chile": "CL", "chili": "CL", "colombia": "CO", "colombie": "CO",
    "peru": "PE", "pérou": "PE", "venezuela": "VE", "uruguay": "UY",
    "ecuador": "EC", "équateur": "EC", "bolivia": "BO", "paraguay": "PY",
    "australia": "AU", "australie": "AU", "new zealand": "NZ",
    "nouvelle-zélande": "NZ",
}


def pays_codes(it):
    """ProductionLocations → codes ISO-2 (liste vide si rien de connu)."""
    codes = []
    for nom in it.get("ProductionLocations") or []:
        c = PAYS_ISO.get(str(nom).strip().lower())
        # Certaines installations stockent déjà le code ISO — on le garde.
        if not c and len(str(nom).strip()) == 2:
            c = str(nom).strip().upper()
        if c and c not in codes:
            codes.append(c)
    return codes


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
        "pays": pays_codes(it),
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


# ---------- Notes Télérama ----------
# La recherche publique de telerama.fr donne, pour chaque œuvre critiquée,
# une note (notation-N.svg) et son verdict (« Bof », « Bien », « Très Bien »,
# « Bravo »). On interroge un LOT de titres par passage (cache dans la table
# `telerama`) : la bibliothèque entière est couverte en quelques heures, puis
# seuls les nouveaux titres coûtent une requête. Politesse : une pause entre
# chaque appel, et jamais plus d'un lot par passage.
TLR_LOT = 40        # budget de titres vérifiés à chaque passage du cron
TLR_LOT_BIB = 28    # dont, au plus, pour la bibliothèque : le reste va au
                    # semis, pour que Cinéma et Plateformes se remplissent
                    # sans attendre la fin de l'inventaire du NAS
TLR_PAUSE = 0.8
TLR_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
          "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")


def _tlr_norm(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return "".join(c for c in s if c.isalnum())


# « 3 hommes et un couffin » chez Jellyfin, « Trois hommes et un couffin »
# chez Télérama : on compare aussi les titres avec leurs nombres en lettres.
_TLR_CHIFFRES = {"1": "un", "2": "deux", "3": "trois", "4": "quatre",
                 "5": "cinq", "6": "six", "7": "sept", "8": "huit",
                 "9": "neuf", "10": "dix", "11": "onze", "12": "douze",
                 "13": "treize", "15": "quinze", "20": "vingt"}


def _tlr_lettres(s):
    return re.sub(r'\b(\d+)\b',
                  lambda m: _TLR_CHIFFRES.get(m.group(1), m.group(1)), str(s or ""))


def _tlr_egal(a, b):
    return (_tlr_norm(a) == _tlr_norm(b)
            or _tlr_norm(_tlr_lettres(a)) == _tlr_norm(_tlr_lettres(b)))


def _tlr_cle(t, nom, annee):
    return "%s|%s|%s" % (t, _tlr_norm(nom)[:80], annee or "")


TLR_VERDICTS = {1: "Bof", 2: "Bien", 3: "Très Bien", 4: "Bravo"}


def _tlr_get(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": TLR_UA, "Accept-Language": "fr"})
    return urllib.request.urlopen(req, timeout=TIMEOUT).read().decode("utf-8", "ignore")


def telerama_note(nom, annee, type_):
    """Cherche la critique Télérama d'un titre. Renvoie (nb_de_T, verdict)
    ou None si le titre n'y est pas (ou pas identifiable sans ambiguïté).

    Deux temps : la recherche publique donne les titres et l'adresse de
    l'article ; la note elle-même n'apparaît qu'aux abonnés SAUF dans les
    données de mesure de l'article (data-note-t="TTT") et son JSON-LD
    (reviewRating.ratingValue, où 4/5 = TTT) — publics, eux.
    """
    html = _tlr_get("https://www.telerama.fr/recherche/critiques?q="
                    + urllib.parse.quote(str(nom)))
    voulu = "movie" if type_ == "movie" else "series"
    cartes = [(m.start(), m.group(1), m.group(2)) for m in re.finditer(
        r'href="([^"]+)"\s+class="search__card-content-img-link\s*([a-z]*)"', html)]
    lien, repli = None, None
    for k, (pos, href, genre) in enumerate(cartes):
        if genre in ("book", "album", "show"):
            continue
        if genre and genre != voulu:
            continue
        if not genre and voulu == "movie" and "/cinema/" not in href:
            continue
        fin = cartes[k+1][0] if k+1 < len(cartes) else pos + 6000
        bloc = html[pos:fin]
        t = re.search(r'title-link[^>]*>\s*([^<]+?)\s*</a>', bloc)
        if not t or not _tlr_egal(t.group(1), nom):
            continue
        if annee and re.search(r'[ >(]%s[ <)]' % annee, bloc):
            lien = href
            break                            # titre ET année : certitude
        if repli is None:
            repli = href                     # titre seul : faute de mieux
    lien = lien or repli
    if not lien:
        return None
    if lien.startswith("/"):
        lien = "https://www.telerama.fr" + lien
    time.sleep(TLR_PAUSE)
    art = _tlr_get(lien)
    m = re.search(r'data-note-t="(T+)"', art)
    n = len(m.group(1)) if m else None
    if n is None:
        # Repli : le JSON-LD public de la critique (ratingValue 2..5 = T..TTTT)
        m = re.search(r'"@type"\s*:\s*"Review"[\s\S]{0,600}?"ratingValue"\s*:\s*(\d)', art)
        n = (int(m.group(1)) - 1) if m else None
    if not n or n < 1:
        return None
    n = min(4, n)
    return (n, TLR_VERDICTS.get(n, ""))


def _pousser_telerama(base, key, lignes):
    if not lignes:
        return
    req = urllib.request.Request(
        base.rstrip("/") + "/rest/v1/telerama",
        data=json.dumps(lignes).encode("utf-8"), method="POST",
        headers={"apikey": key, "Authorization": "Bearer " + key,
                 "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=minimal"})
    urllib.request.urlopen(req, timeout=TIMEOUT)


# ---------- Semis : les titres HORS bibliothèque ----------
# L'app affiche aussi les notes sur Cinéma et Plateformes, où les titres ne
# sont pas sur le NAS. Quand la bibliothèque est couverte, le budget restant
# sert donc à noter ce que ces vues montrent : les titres les plus populaires
# et les plus récents d'Europe et d'Amérique du Nord. La progression est
# gardée dans la table elle-même (ligne __semis__, t=0 : l'app l'ignore).
TLR_SEMIS = "__semis__"
TLR_PAYS = ("US|CA|MX|FR|GB|DE|IT|ES|PT|BE|NL|LU|IE|AT|CH|SE|NO|DK|FI|IS|"
            "PL|CZ|SK|HU|RO|BG|GR|HR|SI|RS|UA|EE|LV|LT")
TLR_PHASES = [
    ("movie", "popularity.desc",           {"vote_count.gte": "100"}),
    ("movie", "primary_release_date.desc", {"vote_count.gte": "20"}),
    ("tv",    "popularity.desc",           {"vote_count.gte": "50"}),
]

_cle_tmdb = [None]


def cle_tmdb():
    """La clé TMDB publique de l'app, lue dans son config.js — rien à
    configurer de plus sur le NAS."""
    if _cle_tmdb[0] is None:
        try:
            src = _tlr_get("https://lisamiens87.github.io/cineflix/config.js")
            m = re.search(r"tmdbKey\s*:\s*'([^']+)'", src)
            _cle_tmdb[0] = m.group(1) if m else ""
        except Exception:
            _cle_tmdb[0] = ""
    return _cle_tmdb[0]


def semis_telerama(base, key, cache, budget):
    ck = cle_tmdb()
    if not ck or budget <= 0:
        return 0
    etat = {}
    try:
        r = lire_supabase(base, key,
                          "/rest/v1/telerama?select=verdict&cle=eq." + TLR_SEMIS)
        if r:
            etat = json.loads(r[0].get("verdict") or "{}")
    except Exception:
        pass
    ph = int(etat.get("ph", 0)) % len(TLR_PHASES)
    page = max(1, int(etat.get("p", 1)))
    type_, tri, extra = TLR_PHASES[ph]
    params = {"api_key": ck, "language": "fr-FR", "sort_by": tri, "page": str(page),
              "include_adult": "false", "with_origin_country": TLR_PAYS}
    params.update(extra)
    if tri.startswith("primary_release_date"):
        params["primary_release_date.lte"] = date.today().isoformat()
    try:
        d = json.loads(_tlr_get("https://api.themoviedb.org/3/discover/" + type_
                                + "?" + urllib.parse.urlencode(params)))
    except Exception as e:
        print("Semis : TMDB injoignable (%s)" % e)
        return 0
    faits, nouveaux = 0, []
    for it in d.get("results") or []:
        if faits >= budget:
            break
        nom = it.get("title") or it.get("name") or ""
        annee = (it.get("release_date") or it.get("first_air_date") or "")[:4]
        if not nom:
            continue
        c = _tlr_cle(type_, nom, annee)
        if c in cache:
            continue
        faits += 1
        try:
            trouve = telerama_note(nom, annee, type_)
        except Exception:
            continue                     # réseau : on repassera par cette page
        r = {"cle": c, "t": trouve[0] if trouve else 0,
             "verdict": trouve[1] if trouve else ""}
        cache[c] = r
        nouveaux.append(dict(r, maj=date.today().isoformat()))
        time.sleep(TLR_PAUSE)
    # Page épuisée sans avoir consommé le budget : on passe à la suivante,
    # et à la phase suivante quand TMDB n'a plus rien à donner.
    if faits < budget:
        page += 1
        if page > min(500, int(d.get("total_pages") or 1)):
            page, ph = 1, (ph + 1) % len(TLR_PHASES)
    _pousser_telerama(base, key, nouveaux)
    _pousser_telerama(base, key, [{"cle": TLR_SEMIS, "t": 0,
                                   "verdict": json.dumps({"ph": ph, "p": page}),
                                   "maj": date.today().isoformat()}])
    return faits


def enrichir_telerama(base, key, fiches):
    """Pose jt (nombre de T) et jv (verdict) sur les fiches, via le cache."""
    cache = {r["cle"]: r for r in lire_supabase(base, key,
        "/rest/v1/telerama?select=cle,t,verdict&limit=100000")}
    nouveaux, faits = [], 0
    for f in fiches:
        annee = (f.get("sortie") or "")[:4]
        cle = _tlr_cle(f["t"], f["nom"], annee)
        r = cache.get(cle)
        if r is None and faits < TLR_LOT_BIB:
            faits += 1
            try:
                trouve = telerama_note(f["nom"], annee, f["t"])
            except Exception:
                trouve = None                # réseau : on retentera plus tard
            else:
                r = {"cle": cle, "t": trouve[0] if trouve else 0,
                     "verdict": trouve[1] if trouve else ""}
                cache[cle] = r
                nouveaux.append(dict(r, maj=date.today().isoformat()))
            time.sleep(TLR_PAUSE)
        if r and r.get("t"):
            f["jt"] = r["t"]
            f["jv"] = r.get("verdict") or ""
    _pousser_telerama(base, key, nouveaux)
    reste = sum(1 for f in fiches
                if _tlr_cle(f["t"], f["nom"], (f.get("sortie") or "")[:4]) not in cache)
    if nouveaux:
        print("Télérama : %d titre(s) de la bibliothèque vérifié(s), reste %d"
              % (len(nouveaux), reste))
    # La bibliothèque est couverte : le budget qui reste sert aux autres vues.
    if faits < TLR_LOT:
        n = semis_telerama(base, key, cache, TLR_LOT - faits)
        if n:
            print("Télérama : %d titre(s) hors bibliothèque vérifié(s)" % n)


def _b64u_dec(s):
    s = s.strip()
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _b64u_enc(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _hkdf(sel, ikm, info, longueur):
    """HKDF-SHA256 (extract + expand), un seul bloc — suffit pour ≤ 32 octets."""
    prk = hmac.new(sel, ikm, hashlib.sha256).digest()
    return hmac.new(prk, info + b"\x01", hashlib.sha256).digest()[:longueur]


def envoyer_push(endpoint, p256dh, auth, corps, prive, sub):
    """Web Push sans dépendance : chiffrement aes128gcm (RFC 8291/8188) et
    signature VAPID ES256 (RFC 8292), avec la bibliothèque `cryptography`
    livrée avec TrueNAS. Le python du NAS n'a pas pip : rien à installer.

    Lève urllib.error.HTTPError si le service de push refuse (404/410 =
    abonnement mort, à purger côté appelant)."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    ua_pub = _b64u_dec(p256dh)      # clé publique du navigateur (point P-256)
    secret_auth = _b64u_dec(auth)   # secret d'authentification (16 octets)

    # Secret partagé : ECDH entre une clé éphémère et celle du navigateur.
    eph = ec.generate_private_key(ec.SECP256R1())
    eph_pub = eph.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    cle_nav = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_pub)
    partage = eph.exchange(ec.ECDH(), cle_nav)

    # Dérivations RFC 8291 puis RFC 8188.
    sel = os.urandom(16)
    ikm = _hkdf(secret_auth, partage, b"WebPush: info\x00" + ua_pub + eph_pub, 32)
    cle = _hkdf(sel, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf(sel, ikm, b"Content-Encoding: nonce\x00", 12)
    chiffre = AESGCM(cle).encrypt(nonce, corps.encode("utf-8") + b"\x02", None)
    corps_http = sel + struct.pack("!IB", 4096, len(eph_pub)) + eph_pub + chiffre

    # Jeton VAPID : JWT ES256 signé avec la clé privée du serveur.
    o = urllib.parse.urlparse(endpoint)
    entete = _b64u_enc(json.dumps({"typ": "JWT", "alg": "ES256"}).encode())
    revend = _b64u_enc(json.dumps({"aud": o.scheme + "://" + o.netloc,
                                   "exp": int(time.time()) + 12 * 3600,
                                   "sub": sub}).encode())
    cle_vapid = ec.derive_private_key(
        int.from_bytes(_b64u_dec(prive), "big"), ec.SECP256R1())
    der = cle_vapid.sign((entete + "." + revend).encode(), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    jwt = "%s.%s.%s" % (entete, revend,
                        _b64u_enc(r.to_bytes(32, "big") + s.to_bytes(32, "big")))
    pub_vapid = _b64u_enc(cle_vapid.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))

    req = urllib.request.Request(endpoint, data=corps_http, method="POST", headers={
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "TTL": "86400",
        "Urgency": "normal",
        "Authorization": "vapid t=%s, k=%s" % (jwt, pub_vapid)})
    urllib.request.urlopen(req, timeout=TIMEOUT).read()


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
        # Web Push implémenté sur place (RFC 8291/8188/8292) : le python de
        # TrueNAS n'a ni pip ni pywebpush, mais `cryptography` est déjà là.
        from cryptography.hazmat.primitives.asymmetric import ec  # noqa: F401
    except ImportError:
        print("module cryptography introuvable : notifications sautées")
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
                envoyer_push(ab["endpoint"], ab["p256dh"], ab["auth"], corps,
                             prive, "mailto:alexandre.mesnier@cabinet-ekinox.fr")
                envoyees += 1
            except urllib.error.HTTPError as e:
                code = e.code
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
                else:
                    print("push refusé (%s) : %s" % (code, ab["endpoint"][:50]))
            except Exception as e:
                # un abonné en panne ne doit pas priver les autres
                print("push en échec : %s" % e)
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

    if a.supabase:
        # Notes Télérama (cache en base, un petit lot de recherches par
        # passage) : une panne ici ne doit pas empêcher l'export.
        try:
            enrichir_telerama(a.supabase_url, a.supabase_key, fiches_f + fiches_s)
        except Exception as e:
            print("Télérama sauté : %s" % e)

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
