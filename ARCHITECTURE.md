# Architecture

Ce document décrit **comment le code est organisé** : les technologies
retenues, le rôle de chaque fichier, et les quelques règles de structure
qu'il ne faut pas casser. Pour la mise en service (Supabase, `config.js`,
GitHub Pages, export du NAS), voir le [README](README.md).

---

## 1. En un coup d'œil

Premier Rang (dossier historique `cineflix`) est le catalogue de la
médiathèque familiale : il dit ce qui est **déjà sur le serveur**, ce qui
**sort bientôt**, et permet de **demander** ce qui manque.

C'est une **PWA statique** — aucun serveur applicatif, aucune étape de
compilation. Le dépôt *est* le site : GitHub Pages sert les fichiers tels
quels, et un `git push` sur `main` suffit à livrer.

```
   iPhone / Android            GitHub Pages              Supabase
   ┌──────────────┐            ┌──────────┐            ┌──────────────┐
   │ Premier Rang │──── charge ─▶ l'app    │            │  comptes     │
   │  (installée) │◀───────────────────────┘            │  demandes    │
   │              │──── comptes, demandes, catalogue ───▶│  catalogue   │
   │              │──── affiches, dates ───▶ TMDB        └──────▲───────┘
   └──────┬───────┘                                            │ pousse
          │ « Regarder » (Tailscale)                    ┌──────┴───────┐
          └────────────────────────────────────────────▶│ NAS Jellyfin │
                                                        └──────────────┘
```

Le NAS ne reçoit **aucune connexion entrante** : il pousse son inventaire
vers Supabase. Seuls les appareils du tailnet peuvent lancer une lecture ;
les autres consultent et demandent.

---

## 2. Technologies

| Domaine | Choix | Pourquoi |
|---|---|---|
| Langage | JavaScript ES2017+, `"use strict"`, aucun module ES | Chargement par `<script>` successifs, portée globale partagée |
| Framework | **aucun** | Pas de build, pas de `node_modules` à livrer, lisible tel quel |
| Rendu | Chaînes HTML + `innerHTML`, une fonction `render()` unique | Un seul chemin d'affichage, pas de DOM virtuel à synchroniser |
| Style | CSS pur, variables `:root`, mobile-first | Trois feuilles en cascade, pas de préprocesseur |
| Stockage local | IndexedDB (base) + miroir `localStorage` (écriture synchrone) | iOS peut geler l'app à la fermeture : seule l'écriture synchrone aboutit |
| Hors-ligne | Service worker (`sw.js`), réseau d'abord | Recevoir les mises à jour, survivre à la coupure |
| Données films | API **TMDB** v3 (fiches, dates de sortie, plateformes, vidéos) | Seule source qui expose les dates numérique / Blu-ray |
| Backend | **Supabase** (Auth + PostgREST + RLS) | Comptes, demandes partagées, catalogue — sans serveur à maintenir |
| Média | **Jellyfin** sur NAS TrueNAS, joint par **Tailscale** | Aucun port ouvert sur Internet |
| Export NAS | **Python 3**, bibliothèque standard uniquement | Tourne en cron TrueNAS sans dépendance à installer |
| Tests | **Playwright** (Node), TMDB et Supabase simulés | Le vrai code de l'app, seuls les réseaux sont doublés |
| Hébergement | GitHub Pages via GitHub Actions | Livraison à chaque push sur `main` |

**Pas de gestionnaire de paquets côté app** : il n'y a ni `package.json` ni
`node_modules`. Playwright est la seule dépendance, et elle ne sert qu'aux
tests.

---

## 3. Arborescence

Le projet est **plat par choix** : les fichiers de l'application vivent à la
racine, parce que c'est aussi la racine du site publié. Un seul dossier de
code (`outils-nas/`) et un dossier de configuration CI (`.github/`).

```
/
├── index.html                 point d'entrée : ordre de chargement + numéro de BUILD
├── config.js                  le SEUL fichier à remplir (clés, adresses, région)
├── manifest.json              manifeste PWA (nom, icônes, mode standalone)
├── sw.js                      service worker : coquille hors-ligne
│
├── app-01-noyau.js …          les 15 modules de l'application (voir §4)
├── app-15-videotheque.js
│
├── app-base.css               tronc commun, mobile-first
├── app-mobile.css             affinages petits écrans (max-width)
├── app-site.css               grand écran (min-width), chargé en dernier
├── app.css                    vestige : ne contient plus qu'une note de découpage
│
├── cineflix.json              catalogue d'exemple (identifiants TMDB + fiches)
├── suggestions-n4.json        suggestions éditoriales (~140 Ko, servi avec l'app)
├── suggestions-historique.json  identifiants déjà proposés, pour ne pas se répéter
│
├── supabase-cineflix.sql      schéma Supabase : tables, vues, politiques RLS
├── outils-nas/
│   └── export-jellyfin.py     l'export du NAS vers Supabase (cron horaire)
│
├── test-cineflix.js           suite Playwright — mode local
├── test-supabase.js           suite Playwright — mode compte
├── banc-guide.js              banc d'essai du guide (pertinence, pas mécanismes)
│
├── icon.svg, icon-192.png, icon-512*.png    icônes PWA
└── .github/workflows/pages.yml              publication GitHub Pages
```

---

## 4. Les modules de l'application

Les quatorze fichiers `app-NN-*.js` sont chargés **dans l'ordre** par
`index.html` et partagent une seule portée globale. Le numéro n'est pas
décoratif : c'est une dépendance. Un module peut appeler ce qui le précède ;
l'inverse n'est vrai que par appel différé (`render()`, un `onclick`).

| Fichier | Rôle |
|---|---|
| `app-01-noyau.js` | **Le socle.** Jeu d'icônes SVG, persistance (IndexedDB + miroir `localStorage`), client TMDB, chargement du catalogue, notes Télérama, choix de l'hôte Jellyfin, et les opérations sur un titre : `statut()`, `basculerFavori()`, `demander()`. |
| `app-02-outils.js` | **Le châssis.** Formats de date et de durée, toasts et feuilles modales, en-têtes, puis le **routeur** : `go()`, `goBack()`, la pile de navigation, la mémoire de défilement, `render()` et la barre d'onglets. |
| `app-03-decouvrir.js` | **Découvrir** — grille, recherche, filtres (genre, décennie, origine, note, plateformes), vitrine d'accueil, rangées thématiques et **puces de présence**. Le plus gros module. |
| `app-04-sorties.js` | Les **dates de sortie** TMDB (types 3 salle / 4 numérique / 5 physique) et l'écran Cinéma : calendrier des sorties. |
| `app-05-fiche.js` | La **fiche** d'un titre : synopsis, tableau des trois sorties, séances, plateformes, bande-annonce, casting, saisons, recommandations, et les écrans **Personne** et **Saison**. |
| `app-06-maliste.js` | **Ma liste** : favoris, demandes, arrivés — plus le volet Suggestions (lecture de `suggestions-n4.json`, gestion des écarts). |
| `app-07-profil.js` | **Profil** et **Réglages** (clé TMDB, région, import/export, remise à zéro), et le **démarrage** de l'app : `boot()`, `lancer()`. |
| `app-08-compte.js` | **Supabase.** Client `sbFetch()` (jeton renouvelé en silence), inscription/connexion, synchronisation des favoris et demandes, catalogue distant, notes Télérama, sorties physiques, notifications push, **file d'administration** et gestion des accès. |
| `app-09-profils.js` | Les **profils du foyer** : avatars, écran « qui regarde ce soir ? », parcours d'accueil qui recueille les goûts. La grille d'avatars vient de l'appareil, jamais du serveur. |
| `app-10-guide.js` | **« Laisse-moi te guider »** : humeurs, catégories et goûts → une recette, un vivier (bibliothèque + plateformes de la personne), un classement, cinq propositions. |
| `app-11-taxo.js` | La **taxonomie** : 20 genres et 43 sous-catégories, écrits comme des *recettes* (genres, mots-clés, pays, durée, note) pour s'appliquer aussi bien au catalogue local qu'à une requête `/discover`. |
| `app-12-citation.js` | La **citation d'ouverture** : au démarrage à froid *et* au retour d'arrière-plan après une heure d'inactivité. Liste embarquée, fonctionne hors ligne. |
| `app-13-affiche.js` | La **visionneuse d'affiche** : pincer-zoomer, écrit à la main parce que l'app interdit volontairement le zoom du navigateur. Trois définitions successives, jamais d'écran vide. |
| `app-15-videotheque.js` | **Ma vidéothèque**, troisième volet de l'écran Cinéma, réservé à l'administration : les films du NAS confrontés au catalogue des éditions physiques. Trois tables Supabase lues une fois et gardées en mémoire, une couleur par film (au maximum / améliorable / à rapprocher / non référencé), et les corrections manuelles, saisies en deux étapes numérotées (chercher dans DVDFr, puis déclarer ce que l'on sait de son propre exemplaire), réversibles et retrouvables par un cinquième compteur — la seule écriture de l'app hors `elements`, `profils` et `gouts`. |
| `app-14-cache.js` | Le **cache des données lourdes** (IndexedDB) : catalogue, notes Télérama, sorties physiques. Ne change rien à l'affichage, seulement le moment où l'app redemande — né d'un dépassement de quota Supabase. |

### État global

Trois objets portent tout l'état, et il faut savoir lequel on touche :

- **`db`** (`app-01`) — ce qui **survit à la fermeture** : pseudo, clé TMDB,
  réglages, `items` (favoris et demandes), `foyer`, `ecartes`. Persisté par
  `saveDB()`.
- **`ui`** (`app-02`) — ce qui **meurt avec la page** : filtres en cours,
  onglet actif, résultats chargés, écran du guide.
- **`CAT`** (`app-01`) — le **catalogue du serveur** : deux `Set`
  d'identifiants TMDB (`movie`, `tv`) plus les fiches compactes du NAS.
  `surCineflix(type, id)` est la seule question qu'on lui pose.

### Le modèle, à ne jamais confondre

- **Présence** — le titre est-il sur le serveur ? Un fait, identique pour
  tout le monde, qui vient de `CAT`.
- **Statut personnel** — favori, demandé, en cours, refusé. Propre à chacun,
  stocké dans `db.items` et dans la table `elements`.

`statut()` dans `app-01` est la **seule source de vérité**, et le catalogue
l'emporte toujours : une demande bascule seule en « arrivé » le jour où le
titre entre au catalogue. C'est pourquoi `elements` n'a pas de statut
« obtenu » — il y aurait deux vérités, et elles divergeraient.

### Navigation

Pas de routeur d'URL : `view` (nom de l'écran) + `params`, et une table
`DEPTH` qui donne la profondeur de chaque écran pour animer les transitions
et gérer le retour. `render()` fait le dispatch vers `viewXxx()` et réécrit
`#app` d'un bloc.

---

## 5. Les feuilles de style

L'ordre de chargement **fait** la cascade et ne doit pas changer :

1. `app-base.css` — le tronc commun, écrit mobile-first. Sans media query,
   ces règles *sont* l'app de poche. Toucher ici = toucher partout.
2. `app-mobile.css` — uniquement des `@media (max-width:…)`.
3. `app-site.css` — uniquement des `@media (min-width:…)`, trois paliers
   (860 tablette, 1200 barre en haut, 1600 très grand). Chargé en dernier
   pour gagner la cascade.

`app.css` ne contient plus que la note expliquant ce découpage : ne rien y
remettre.

---

## 6. Le versionnement des livraisons

`index.html` porte une constante `window.BUILD` qui **versionne les adresses**
de tous les fichiers (`?b=…`) : une nouvelle version a des adresses neuves,
qu'aucun cache — navigateur, CDN, service worker — n'a jamais vues. Le même
numéro est repris dans `sw.js` (nom du cache et liste de la coquille) et
s'affiche en bas du profil.

**Trois endroits à garder synchrones à chaque livraison** :
`index.html` (le `BUILD` et les `?b=` des `<script>`/`<link>`), `sw.js` (la
constante `BUILD` et la liste `SHELL`), et la liste de scripts d'`index.html`
si un module est ajouté.

Le service worker est **réseau d'abord** sur les fichiers de l'app, repli sur
le cache hors ligne. Il ne met jamais en cache les appels TMDB ni le
catalogue : une liste périmée afficherait « déjà sur le serveur » pour un
titre qui n'y est plus.

---

## 7. Le backend Supabase

`supabase-cineflix.sql` pose le schéma. Tout est protégé par **RLS** — c'est
là qu'est le verrou, pas dans l'interface : un compte en attente ne voit
rien, même en trafiquant l'app.

| Table / vue | Contenu |
|---|---|
| `profils` | Un prénom, une tête, un compte serveur, et le `statut` qui ouvre ou ferme l'accès. Lisible par les connectés (la file affiche un nom). |
| `admins` | Qui traite la file. Fonction `est_admin()` en `security definer` pour éviter la récursion entre politiques. |
| `elements` | Favoris et demandes, un par utilisateur et par titre. |
| `catalogue` | Une seule ligne : les identifiants TMDB présents sur le NAS, plus les fiches compactes (`items`) qui font le tri de la Cinémathèque. |
| `gouts` | Les réponses du parcours d'accueil. |
| `file_demandes` | Vue : la file d'administration, demandes groupées par titre. |

**Vie privée** : l'administrateur voit les **demandes** de tout le monde,
jamais les simples favoris. C'est écrit dans la politique RLS d'`elements`.

La clé `anon` vit dans `config.js` — c'est fait pour. La clé `service_role`
ne quitte jamais le NAS.

Six autres tables complètent le tableau, alimentées par l'export du NAS et
lues par l'app :

| Table | Contenu |
|---|---|
| `ecartes` | Les suggestions écartées, datées : le film revient de lui-même à six mois. |
| `telerama` | Les notes qui font les « T » sur les vignettes. La ligne `__semis__` n'est pas une note : elle range la progression du balayage TMDB. |
| `sorties_phys` | Le calendrier Blu-ray / 4K, apparié à TMDB quand c'est possible. |
| `push_abonnements` | Un appareil, une ligne. L'endpoint du navigateur fait la clé. |
| `journal_nas` | Bloc-notes clé → valeur écrit par l'export, dont `comptes_jf`. |
| `motscles_films` | Cache des mots-clés TMDB pour la taxonomie. L'app ne le lit jamais. |

Deux règles de lecture traversent tout le schéma :

- **Ce qui vient du NAS se lit, ne s'écrit pas.** `catalogue`, `telerama`,
  `sorties_phys` et `motscles_films` n'ont aucune politique d'écriture : seule
  la clé `service_role`, restée sur le NAS, les alimente.
- **Effacer n'est pas lire.** L'administrateur peut supprimer les goûts et les
  écarts d'un membre qui s'en va — la fenêtre de confirmation le promet — sans
  jamais pouvoir les consulter.

Un **déclencheur** sur `profils` complète les politiques RLS : un nouveau
compte naît toujours en attente, et seul un administrateur peut changer
`statut`. Sans lui, chacun pourrait se valider soi-même d'un simple PATCH — la
politique RLS autorise chacun à modifier sa ligne, et elle ne sait pas
distinguer une colonne d'une autre.

> ℹ️ Le fichier est **rejouable** : `if not exists` partout, `drop policy if
> exists` avant chaque politique. Le rejouer sur une base en service n'écrase
> aucune donnée. L'ordre compte en revanche — la vue `file_demandes` est
> définie en fin de fichier, après les colonnes qu'elle sélectionne.

---

## 8. L'export du NAS

`outils-nas/export-jellyfin.py` (~1 500 lignes, bibliothèque standard seule)
tourne en cron sur le NAS. Il interrogue Jellyfin et pousse vers Supabase :

- le **catalogue** (identifiants TMDB + fiches compactes) ;
- les **notes Télérama** et les **mots-clés TMDB** qui alimentent le guide ;
- les **sorties physiques** appariées aux titres ;
- les **comptes Jellyfin** et les points de reprise de lecture ;
- les **notifications push** (VAPID signé à la main) quand un titre demandé
  arrive ou qu'un accès est validé.

Deux garde-fous : il écrit **une seule ligne en un seul appel** (l'app lit un
catalogue complet ou l'ancien, jamais un état intermédiaire), et il **refuse
de publier une liste vide** (une panne de Jellyfin ne fait pas disparaître la
bibliothèque).

**Pourquoi un instantané plutôt qu'un appel direct à Jellyfin ?** C'est ce
qui rend le filtre de présence possible. Quelques milliers d'entiers tiennent
en mémoire dans le téléphone ; croiser une page TMDB avec la bibliothèque
devient immédiat. Un service qui interroge le serveur titre par titre ne peut
pas offrir ce filtre. Bénéfice secondaire : la clé API Jellyfin ne quitte
jamais le NAS.

---

## 9. Tests

Deux natures de vérification, complémentaires :

```bash
python3 -m http.server 8123 &     # dans le dossier de l'app
node test-cineflix.js             # mode local  — ~173 vérifications
node test-supabase.js             # mode compte — ~29 vérifications
```

Les deux suites lancent Chromium via Playwright, **simulent TMDB et
Supabase** (et remplacent `config.js` à la volée), bloquent le service worker
— dont les requêtes échappent à l'interception — et exécutent le vrai code de
l'app.

`banc-guide.js` mesure l'autre moitié : la **pertinence** du guide, pas ses
mécanismes. Il se colle dans la console de l'app et ne fait aucun appel
réseau. Une version peut être entièrement verte en Playwright tout en
répondant « Toy Story » à « film français drôle » — c'est ce banc qui
l'attrape.

---

## 10. Publication

`.github/workflows/pages.yml` publie le dépôt entier sur GitHub Pages à
chaque push sur `main`. Deux particularités assumées :

- **Trois tentatives** de `deploy-pages`. L'action abandonne au bout de
  10 minutes (plafond GitHub, non modifiable) et *annule* la publication en
  cours, même quand elle avançait normalement.
- **`cancel-in-progress: false`** : plusieurs commits d'affilée font la
  queue au lieu de se tuer entre eux.

---

## 11. Les règles à ne pas casser

1. **L'ordre de chargement** des `app-NN-*.js` dans `index.html` : c'est la
   chaîne de dépendances.
2. **L'ordre des trois CSS** : base → mobile → site.
3. **Le `BUILD`** synchronisé entre `index.html` et `sw.js`, et la liste
   `SHELL` du service worker tenue à jour.
4. **`statut()` reste la seule source de vérité** sur l'état d'un titre ; le
   catalogue l'emporte toujours.
5. **`localStorage` écrit avant IndexedDB** : c'est la seule écriture
   synchrone, donc la seule qui aboutisse si iOS gèle l'app.
6. **Aucune clé `service_role` dans `config.js`.**
7. **Ne jamais mettre en cache le catalogue** dans le service worker.
8. `app-mobile.css` et `app-site.css` ne se touchent jamais l'un l'autre.

---

## 12. Ce que l'architecture ne fait pas

- **Aucune étape de compilation** — pas de bundler, pas de minification, pas
  de transpilation. Le fichier livré est le fichier écrit.
- **Aucun serveur applicatif** — tout est statique ; la logique métier vit
  dans le navigateur, les règles de sécurité dans Supabase.
- **Aucun lien Radarr/Sonarr** — accepter une demande la marque « en cours »,
  le téléchargement reste manuel.
- **Aucun quota** — rien n'empêche quelqu'un de demander cinquante films.

---

Données films et séries fournies par [TMDB](https://www.themoviedb.org/).
Disponibilité en streaming fournie par JustWatch via TMDB.
