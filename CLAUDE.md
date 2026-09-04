# Règles de travail

Ce fichier dit **comment on travaille sur Premier Rang**. Pour comprendre
comment le code est organisé — les modules `app-NN`, l'état global, le schéma
Supabase — voir [ARCHITECTURE.md](ARCHITECTURE.md). Ici, seulement les règles
qu'on applique en écrivant.

Elles ne sont pas des préférences : chacune vient d'un incident. Les en-têtes
des fichiers concernés portent la version longue, avec la date et la décision.

---

## 1. Livrer : toujours une PR, jamais de push direct sur `main`

**`main` est en production.** `.github/workflows/pages.yml` publie sur GitHub
Pages à chaque push sur `main` : un commit poussé directement est en ligne, sur
tous les téléphones du foyer, en moins d'une minute. Il n'y a pas d'étape de
recette entre les deux.

Donc, sans exception :

```bash
git checkout -b <branche>        # jamais de commit sur main
# … le travail, un commit par étape …
git push -u origin <branche>
# puis ouvrir une PR vers main
```

- **On ne pousse jamais sur `main`.** Pas de « c'est juste une virgule » : la
  virgule part sur les téléphones comme le reste.
- **Une PR par sujet.** Deux sujets sans rapport font deux PR, quitte à ce que
  la seconde attende la première.
- **La PR dit ce qui a été vérifié**, pas seulement ce qui a changé. « Testé »
  n'est pas une vérification ; « les deux suites passent, tout est vert » en est
  une, et nommer le contrôle qu'on a ajouté vaut mieux encore.
- **La fusion se fait par commit de fusion** (`Merge pull request #N from …`),
  jamais en squash : c'est la convention de l'historique.

### Le message de commit

La convention de l'historique, sur les quatre derniers builds :

```
Build 3108e (1/5) : les tetes de l'accueil ont leur propre nom de classe
Build 3108e (2/5) : l'accueil redevient visible sur grand ecran
Build 3108e (3/5) : le test suit le renommage
Build 3108e (4/5) : index.html
Build 3108e (5/5) : sw.js
```

Un commit par étape logique, numéroté sur le total. **`index.html` et `sw.js`
viennent toujours en dernier, dans cet ordre** : le numéro de build ne bascule
qu'une fois le contenu en place, sinon une version publiée à mi-chemin porterait
un numéro neuf pour un contenu incomplet.

Les commits qui ne livrent pas de build (documentation, outillage) prennent un
sujet libre : `Documentation : ARCHITECTURE.md`.

---

## 2. Le CSS : trois feuilles, et qui a le droit de toucher quoi

C'est **la** règle du projet. Le découpage date du 30/07 et il tient parce que
personne ne le contourne.

| Feuille | Périmètre | Contient |
|---|---|---|
| `app-base.css` | **Le tronc commun** | Palette, typographies, boutons, vignettes, chips, héros, écrans. Écrit mobile-first : **sans media query, ces règles *sont* l'app de poche.** |
| `app-mobile.css` | **Les petits écrans** | **Uniquement** des `@media (max-width:…)`. |
| `app-site.css` | **Le grand écran** | **Uniquement** des `@media (min-width:…)`. Trois paliers : 860 (tablette), 1200 (la barre passe en haut), 1600 (très grand). |

### Les deux interdits

Ils sont écrits en toutes lettres dans les en-têtes des fichiers :

> La conversation « **app mobile** » travaille dans `app-mobile.css` et
> `app-base.css` ; elle ne touche **JAMAIS** `app-site.css`.

> La conversation « **site web** » travaille dans `app-site.css` ; elle ne
> touche **JAMAIS** `app-mobile.css`.

Le partage est net : `max-width` d'un côté, `min-width` de l'autre, aucun
recouvrement. Une règle qui vaut pour les deux n'a rien à faire dans l'une des
deux feuilles — elle descend dans `app-base.css`.

### Toucher `app-base.css`, c'est toucher partout

Une modification du tronc se voit sur le téléphone **et** sur le bureau. Avant
d'y écrire, se demander si la règle ne serait pas mieux dans l'une des deux
feuilles d'affinage. Si elle doit vraiment vivre dans le tronc, la vérifier aux
deux bouts : un écran étroit, et un écran large.

### `app.css` est un vestige

Il ne contient que le panneau expliquant le découpage. **Ne rien y remettre.**

---

## 3. L'ordre de la cascade

Dans `index.html` :

```html
<link rel="stylesheet" href="./app-base.css?b=…">    <!-- 1. commun -->
<link rel="stylesheet" href="./app-mobile.css?b=…">  <!-- 2. petits écrans -->
<link rel="stylesheet" href="./app-site.css?b=…">    <!-- 3. grand écran -->
```

**Cet ordre fait la cascade. NE PAS le changer.** `app-site.css` est chargé en
dernier pour gagner : à spécificité égale, c'est la dernière déclaration qui
l'emporte, et c'est ainsi que le grand écran reprend la main sur le tronc.

Les trois feuilles arrivent sans attribut `media` : tout le monde télécharge
tout. C'est voulu — trois fichiers, une seule requête chacun, et aucun risque
qu'un appareil se retrouve sans la feuille dont il a besoin après une rotation.

**À l'intérieur de `app-site.css`, l'ordre des blocs compte aussi** : les
derniers réécrivent les premiers. C'est le journal des décisions (rail → barre
du haut → un seul bandeau…). On ajoute donc **à la fin**, on ne réordonne pas.

---

## 4. La séparation mobile / site ne vit pas que dans le CSS

Trois endroits du JS décident eux aussi, et il faut les connaître avant de
croire que tout se règle en CSS :

| Fichier | Fonction | Effet |
|---|---|---|
| `app-04-sorties.js` | `cineEtroit()` | Sous 860 px, l'écran Cinéma rend `corpsSortiesGrille()` (affiches en grille) ; au-dessus, `corpsSorties()` (calendrier en lignes). **Deux fonctions de rendu différentes.** |
| `app-10-guide.js` | `catEtroit()` | Sous 860 px, « Par catégorie » passe en accordéon ; au-dessus, deux colonnes. |
| `app-03-decouvrir.js` | `parRangee()` | Au-delà de 1200 px, calcule combien de vignettes tiennent et **demande plus de fiches à TMDB**. Neutre en dessous. |

Les seuils **860** et **1200** sont donc écrits à deux endroits : dans les media
queries d'`app-site.css`, et dans ces trois `matchMedia`. Déplacer un palier
dans le CSS sans toucher au JS désaccorde les deux.

⚠️ Ces trois fonctions lisent `matchMedia` **au moment du rendu**, et rien ne
déclenche de `render()` au redimensionnement — le seul écouteur `resize` du
projet (`app-13-affiche.js`) ne sert qu'à recadrer la visionneuse d'affiche.
Franchir un palier en tournant une tablette adapte donc le CSS instantanément,
mais laisse ces trois écrans dans la structure décidée au rendu précédent,
jusqu'à la navigation suivante. Sur un téléphone, le seuil n'est jamais franchi.

---

## 5. Le numéro de build

`window.BUILD` versionne les adresses de tous les fichiers (`?b=…`) : une
nouvelle version a des adresses neuves, qu'aucun cache — navigateur, CDN,
service worker — n'a jamais vues.

**Deux fichiers à changer ensemble, à chaque livraison :**

1. `index.html` — la constante `window.BUILD`, **et** le `?b=` de chaque
   `<script>` et `<link>`.
2. `sw.js` — la constante `BUILD` (qui nomme le cache) **et** la liste `SHELL`,
   à compléter si un fichier a été ajouté.

`sw.js` le dit lui-même : « suivre le BUILD d'index.html. Changer les deux
ensemble. » Un `sw.js` en retard sert l'ancienne version hors ligne ; une
`SHELL` incomplète casse l'installation du service worker — et c'est
volontaire, il n'y a pas de `.catch()` : mieux vaut que l'ancienne version
reste utilisable.

---

## 6. Avant d'ouvrir la PR

```bash
python3 -m http.server 8123 &     # dans le dossier de l'app
node test-cineflix.js             # mode local
node test-supabase.js             # mode compte
```

Chaque contrôle s'affiche au passage ; la suite finit sur « Tout est vert. » et
sort en erreur au premier échec. **Aucun chiffre n'est donné ici à dessein** :
le nombre de contrôles monte à presque chaque build, et c'est le signe qu'on
veut — un correctif s'accompagne du test qui l'aurait vu.

Les deux suites simulent TMDB et Supabase et exécutent le vrai code de l'app.
Elles vérifient des **mécanismes**. Pour le guide, la pertinence se mesure
autrement : `banc-guide.js`, à coller dans la console de l'app — une version
peut être entièrement verte en Playwright tout en répondant « Toy Story » à
« film français drôle ».

Toucher au CSS demande en plus un coup d'œil aux deux bouts : un écran étroit,
un écran large. Les trois `matchMedia` ci-dessus font que le redimensionnement
ne suffit pas — recharger la page à la largeur visée.

---

## 7. Les invariants

Le détail est dans [ARCHITECTURE.md §11](ARCHITECTURE.md). En bref, ne jamais
casser :

1. L'**ordre de chargement** des `app-NN-*.js` dans `index.html` — c'est la
   chaîne de dépendances, les fichiers partagent une seule portée globale.
2. L'**ordre des trois CSS** : base → mobile → site.
3. Le **`BUILD`** synchronisé entre `index.html` et `sw.js`.
4. **`statut()` reste la seule source de vérité** sur l'état d'un titre ; le
   catalogue l'emporte toujours.
5. **`localStorage` écrit avant IndexedDB** — la seule écriture synchrone, donc
   la seule qui aboutisse si iOS gèle l'app.
6. **Aucune clé `service_role` dans `config.js`** : elle reste sur le NAS.
7. **Ne jamais mettre le catalogue en cache** dans le service worker : une liste
   périmée afficherait « déjà sur le serveur » pour un titre qui n'y est plus.
