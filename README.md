# Cinéflix

Le catalogue de la médiathèque, installable sur iPhone et Android. Il répond à
trois questions, dans cet ordre :

1. **Qu'est-ce qui est déjà sur le serveur ?** — un filtre, pas des badges à
   déchiffrer un par un.
2. **Quand est-ce que ça sort ?** — en salle, en numérique, en Blu-ray.
3. **Comment demander ce qui manque ?** — un bouton, une file partagée.

JavaScript sans framework ni étape de compilation, huit fichiers chargés à la
suite — même architecture que « Mes Séries ». C'est une PWA : elle s'installe
sur l'écran d'accueil, a son icône et son nom, et démarre hors-ligne.

---

## Ce qui la distingue de Jellyseerr

| | Jellyseerr | Cinéflix |
|---|---|---|
| Filtrer sur « ce que je possède » | non ([#808](https://github.com/seerr-team/seerr/issues/808), [#336](https://github.com/Fallenbagel/jellyseerr/issues/336)) | oui, instantané |
| Dates numérique / Blu-ray | non | oui, région configurable |
| Favori distinct de la demande | non | oui |
| Automatisation Radarr/Sonarr | oui | non |
| Quotas, permissions fines | oui | non |

Ce n'est pas un remplaçant de Jellyseerr : c'est la vitrine qui lui manque.

---

## L'architecture

```
   iPhone / Android            GitHub Pages              Supabase
   ┌──────────────┐            ┌──────────┐            ┌──────────────┐
   │   Cinéflix   │──── charge ─▶ l'app    │            │  comptes     │
   │  (installée) │◀───────────────────────┘            │  demandes    │
   │              │──── comptes, demandes, catalogue ───▶│  catalogue   │
   │              │──── affiches, dates ───▶ TMDB        └──────▲───────┘
   └──────┬───────┘                                            │ pousse
          │ « Regarder » (Tailscale)                    ┌──────┴───────┐
          └────────────────────────────────────────────▶│ NAS Jellyfin │
                                                        └──────────────┘
```

Le NAS ne reçoit **aucune connexion entrante** : il pousse sa liste vers
Supabase, c'est tout. Seuls les appareils sur le tailnet peuvent lancer un
film ; les autres voient le catalogue et peuvent demander.

---

## Mise en service

### 1. Supabase

SQL Editor → New query → coller **`supabase-cineflix.sql`** → Run. Ça crée les
tables `profils`, `elements`, `catalogue`, `admins`, la vue `file_demandes` et
toutes les règles RLS.

Puis, dans Authentication → Providers → Email, décider si la confirmation par
e-mail est exigée. Activée, chaque proche doit cliquer un lien avant de pouvoir
se connecter ; l'app le lui dit clairement.

Enfin, **se désigner administrateur** : ouvrir l'app, créer son compte, lire
son identifiant dans Profil → Compte (il se sélectionne d'un appui), puis :

```sql
insert into public.admins (user_id) values ('<ton-uuid>');
```

L'entrée « File de demandes » apparaît alors dans le profil — pour toi seul.

### 2. `config.js`

Le seul fichier à remplir :

```js
window.CINEFLIX = {
  tmdbKey: '…',                            // themoviedb.org → Paramètres → API
  supabase: {
    url: 'https://xxxx.supabase.co',       // Project Settings → API
    key: 'eyJhbGciOi…'                     // la clé « anon / publishable »
  },
  jellyfinHosts: ['http://100.95.13.53:30013'],
  region: 'FR'
};
```

La clé anon est **faite** pour vivre dans le client : ce qui protège les
données, ce sont les règles RLS, pas le secret de la clé. La clé
`service_role`, elle, ne doit jamais figurer ici — elle reste sur le NAS.

Renseigner `tmdbKey` fait disparaître l'écran qui demande une clé : tes proches
ouvrent l'app, créent leur compte, et c'est tout. `db.cleServeur` distingue
« l'utilisateur suit le serveur » de « il a mis la sienne », donc changer la
clé ici bascule tout le monde sauf ceux qui ont choisi la leur.

### 3. Publier

Dépôt GitHub public → Settings → Pages → Source : `main`, dossier `/`. L'app
est en ligne en HTTPS sous une minute, et se met à jour à chaque `git push`.

> Un dépôt **privé** demanderait GitHub Pro. Pour rester privé sans payer :
> Cloudflare Pages ou Netlify, qui se branchent gratuitement sur un dépôt
> privé.

### 4. L'export du NAS

Créer une clé API dans Jellyfin (Tableau de bord → Clés API → +), puis :

```bash
export JELLYFIN_URL="http://100.95.13.53:30013"
export JELLYFIN_TOKEN="…"
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_KEY="…service_role…"
python3 outils-nas/export-jellyfin.py --supabase
```

Puis en tâche planifiée toutes les heures (TrueNAS : Système → Tâches
planifiées → Cron Jobs).

Le script écrit une seule ligne en un seul appel : l'app lit un catalogue
complet ou l'ancien, jamais un état intermédiaire. Il refuse aussi de publier
une liste vide — une panne de Jellyfin ne fait pas disparaître la bibliothèque.

**Pourquoi un instantané plutôt qu'un appel direct à Jellyfin ?** Parce que
c'est ce qui rend le filtre possible. Quelques milliers d'entiers tiennent en
mémoire dans le téléphone ; croiser une page de résultats TMDB avec la
bibliothèque devient immédiat. Un service qui interroge le serveur titre par
titre ne peut pas offrir ce filtre — c'est exactement ce qui bloque Jellyseerr
depuis des années. Bénéfice secondaire : la clé API Jellyfin ne quitte jamais
le NAS, et la liste publiée ne révèle rien du serveur.

### 5. Installer sur le téléphone

- **iPhone** — ouvrir l'adresse dans Safari → Partager → « Sur l'écran d'accueil »
- **Android** — ouvrir dans Chrome → menu → « Installer l'application »

Ensuite Cinéflix se lance depuis l'écran d'accueil comme n'importe quelle app :
icône, plein écran, pas de barre de navigateur.

---

## Comment c'est organisé

| Fichier | Rôle |
|---|---|
| `config.js` | tout ce qui se règle : clés, adresses, région |
| `app-01-noyau.js` | icônes, stockage local, client TMDB, catalogue, favoris et demandes |
| `app-02-outils.js` | dates, formats, routeur, balayage retour, rendu général |
| `app-03-decouvrir.js` | grille, recherche, filtres, **puces de présence** |
| `app-04-sorties.js` | dates de sortie TMDB (types 3/4/5) et calendrier |
| `app-05-fiche.js` | fiche détaillée, tableau des trois sorties, boutons d'action |
| `app-06-maliste.js` | favoris, demandes, arrivés |
| `app-07-profil.js` | profil, réglages, mise en route, démarrage |
| `app-08-compte.js` | comptes Supabase, synchronisation, file d'administration |

### Les deux axes

Le cœur du modèle, à ne jamais confondre :

- **Présence** — le titre est-il sur Cinéflix ? Un fait, identique pour tout le
  monde, qui vient du catalogue. C'est l'axe des puces `Tout · Sur Cinéflix ·
  Pas encore`.
- **Statut personnel** — favori, demandé, en cours, refusé. Propre à chacun.

Un titre demandé bascule tout seul en « arrivé » le jour où il entre dans le
catalogue. Personne ne coche rien : `statut()` dans `app-01` est la seule
source de vérité, et le catalogue l'emporte toujours. C'est pourquoi la table
`elements` n'a pas de statut « obtenu » — il n'y aurait plus une vérité mais
deux, et elles finiraient par diverger.

### Le filtre de présence

TMDB ignore tout du contenu du NAS : le filtrage se fait côté client, après
réception de chaque page. Une page de vingt résultats peut n'en laisser que
trois — `chargerDecouverte()` enchaîne alors les pages jusqu'à remplir la
grille, sinon on croirait la bibliothèque vide.

La recherche par titre ignore volontairement ce filtre : quand on cherche un
film précis, on veut le trouver, et c'est la pastille qui répond à « est-ce que
je l'ai ? ».

### Vie privée

L'administrateur voit **les demandes** de tout le monde, jamais les simples
favoris : une liste d'envies reste privée. C'est écrit dans la politique RLS
de `elements`, pas seulement dans l'interface.

---

## Tests

Deux suites Playwright, TMDB et Supabase simulés, le reste est le vrai code :

```bash
python3 -m http.server 8123 &     # dans le dossier de l'app
node test-cineflix.js             # mode local  — 22 vérifications
node test-supabase.js             # mode compte — 21 vérifications
```

---

## Ce qui manque encore

- **Pas de notification** quand un titre arrive : il faut ouvrir l'app.
- **Pas de quotas** : rien n'empêche quelqu'un de demander cinquante films.
- **« Regarder »** ouvre la recherche Jellyfin sur le titre, faute de lien
  direct par identifiant TMDB.
- **Séries** : la demande porte sur la série entière, pas saison par saison.
- **Pas de lien avec Radarr/Sonarr** : accepter une demande la marque « en
  cours », le téléchargement reste manuel.

---

Données films et séries fournies par [TMDB](https://www.themoviedb.org/).
Disponibilité en streaming fournie par JustWatch via TMDB.

