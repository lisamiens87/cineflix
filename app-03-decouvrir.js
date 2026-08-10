"use strict";
/* ============================ Découvrir ============================ */

/* Chaque bouton de tête porte sa couleur (classe c-…) : un contour teinté
   au repos, la couleur pleine quand il est actif. */
const TYPES = [ {id:'movie', label:'Films', cl:'c-films'}, {id:'tv', label:'Séries', cl:'c-series'} ];

/* Les trois sources, réparties sur la largeur de l'écran :
   « Cinéma »      — tout le catalogue TMDB ;
   « Plateformes » — ce qui est en streaming par abonnement en France
                     (Canal+, Netflix, Prime Video, Disney+) ;
   « Cinéflix »    — la bibliothèque du serveur, et elle seule. */
const PRESENCES = [
  { id:'tout',  cl:'c-cinema' },                    // « Cinéma » / « Séries »
  { id:'plats', label:'Plateformes', cl:'c-plats' },
  { id:'dispo', label:'Cinéflix',    cl:'c-flix' }
];
const labelTout = ()=> ui.disc.type === 'movie' ? 'Cinéma' : 'Séries';

/* Les plateformes retenues, avec leur identifiant TMDB (données JustWatch)
   et l'adresse de leur recherche — pour ouvrir un titre directement chez elles. */
const PLATEFORMES = [
  { id:8,   nom:'Netflix',     cl:'p-netflix', lien:t=>'https://www.netflix.com/search?q='+encodeURIComponent(t) },
  { id:119, nom:'Prime Video', cl:'p-prime',   lien:t=>'https://www.primevideo.com/search/?phrase='+encodeURIComponent(t) },
  { id:337, nom:'Disney+',     cl:'p-disney',  lien:t=>'https://www.disneyplus.com/search?q='+encodeURIComponent(t) },
  { id:381, nom:'Canal+',      cl:'p-canal',   lien:t=>'https://www.canalplus.com/recherche?q='+encodeURIComponent(t) }
];
const FOURNISSEURS = PLATEFORMES.map(p=>p.id).join('|');

/* Affichage : compacte (4 colonnes), normale (3), ou liste. Réglable,
   mémorisé par appareil. « Grandes » a existé : sur un téléphone elle
   donnait le même rendu que la normale, remplacée par la liste. */
const VUES = [
  { id:'compacte', label:'Compactes' },
  { id:'',         label:'Normales'  },
  { id:'liste',    label:'Liste'     }
];

/* Sur le modèle de Jellyfin : un critère + un sens, séparés. Les critères
   sont ceux que les données permettent — TMDB sait trier par titre, note,
   date de sortie et popularité ; l'aléatoire se fait ici. Date d'ajout,
   durée, classification, note des critiques et tris de lecture demandent
   d'enrichir l'export du NAS (aujourd'hui il n'envoie que les identifiants). */
const TRIS = [
  { id:'populaire', label:'Popularité',            court:'populaires' },
  { id:'nom',       label:'Nom',                   court:'nom' },
  { id:'note',      label:'Note de la communauté', court:'note' },
  { id:'sortie',    label:'Date de sortie',        court:'date de sortie' },
  { id:'aleatoire', label:'Aléatoire',             court:'aléatoire' }
];
const ORDRES = [
  { id:'desc', label:'Décroissant' },
  { id:'asc',  label:'Croissant'   }
];

/* Les tris qui n'existent que sur la vue « Cinéflix » : ils lisent les fiches
   envoyées par le NAS (CAT.items), pas TMDB. C'est toute la bibliothèque,
   triée d'un coup en mémoire — exactement ce que fait Jellyfin chez lui. */
const TRIS_LOCAUX = [
  { id:'ajout', label:'Date d’ajout',          court:'date d’ajout' },
  { id:'lu',    label:'Date de lecture',            court:'date de lecture' },
  { id:'vu',    label:'Nombre de lectures',         court:'nb de lectures' },
  { id:'noteK', label:'Note des critiques',         court:'note des critiques' },
  { id:'noteT', label:'Note Télérama',              court:'note Télérama' },
  { id:'cert',  label:'Classification parentale',   court:'classification' },
  { id:'duree', label:'Durée',                 court:'durée' }
];
const TRI_LOCAL = t => TRIS_LOCAUX.some(x => x.id === t);
/* La vue Cinéflix trie localement dès que le NAS a fourni les fiches —
   sauf « Popularité », donnée que seul TMDB possède. */
const modeLocal = ()=> ui.presence === 'dispo' && (CAT.items||[]).length > 0 &&
                       ui.disc.tri !== 'populaire';
const PERIMETRES = [
  { id:'tout',   label:'Tout le catalogue', court:'tout le catalogue' },
  { id:'recent', label:'Sortis récemment',  court:'sorties récentes' }
];
const NOTES = [ {v:0,label:'Toutes'}, {v:6,label:'6 et +'}, {v:7,label:'7 et +'}, {v:8,label:'8 et +'} ];
/* Les décennies, de 1920 à la décennie en cours — la liste s'allonge
   toute seule au passage de 2030. Une seule active à la fois : TMDB ne
   sait filtrer que sur une plage de dates continue. */
const DECENNIES = (()=>{ const l = [];
  for(let a = 1920; a <= Math.floor(new Date().getFullYear()/10)*10; a += 10) l.push(a);
  return l; })();
const FENETRE = 120;                 // « récemment » = les 120 derniers jours

/* Le filtre « Origine » : des groupes de pays de production. TMDB filtre
   par pays d'origine (with_origin_country, codes ISO séparés par |) ; la
   vue Cinéflix filtre localement sur les pays que le NAS met dans les
   fiches (champ pays). Par défaut Europe + Amérique du Nord : le tri par
   date de sortie mondial noyait les listes sous des sorties lointaines. */
const PAYS_EUROPE = ['FR','GB','DE','IT','ES','PT','BE','NL','LU','IE','AT','CH',
  'SE','NO','DK','FI','IS','PL','CZ','SK','HU','RO','BG','GR','HR','SI','RS',
  'UA','EE','LV','LT'];
const PAYS_AMNORD = ['US','CA','MX'];
const REGIONS = [
  {id:'eurna',   label:'Europe + Amér. N', pays: PAYS_EUROPE.concat(PAYS_AMNORD)},
  {id:'fr',      label:'France',           pays:['FR']},
  {id:'europe',  label:'Europe',           pays: PAYS_EUROPE},
  {id:'amnord',  label:'Amérique du Nord', pays: PAYS_AMNORD},
  {id:'asie',    label:'Asie',             pays:['JP','KR','CN','HK','TW','IN','TH',
    'ID','PH','VN','MY','SG','TR','IL','IR','SA','AE','KZ','PK','BD','LK','NP','KH','MN']},
  {id:'afrique', label:'Afrique',          pays:['ZA','NG','EG','MA','DZ','TN','SN',
    'KE','GH','CI','CM','CD','ET','AO','MZ','BF','ML','RW','UG','TZ','LY']},
  {id:'amsud',   label:'Amérique du Sud',  pays:['BR','AR','CL','CO','PE','VE','UY',
    'EC','BO','PY','GY','SR']},
  {id:'monde',   label:'Monde',            pays:null},   // pas de filtre
];
const regionActive = ()=> REGIONS.find(r => r.id === (ui.disc.origine || 'eurna')) || REGIONS[0];

const genresTMDB = { movie:null, tv:null };
let discSeq = 0;

/* 250 vignettes par chargement (demande d'Alexandre) : les images sont en
   loading="lazy", seules celles à l'écran se chargent vraiment. TMDB livre
   par pages de 20 → un chargement enchaîne ~13 pages. */
const CIBLE_GRILLE = 250;            // combien de vignettes on vise par chargement
const MAX_PAGES_PAR_TOUR = 30;       // garde-fou quand le filtre laisse peu de résultats

function genreParNom(type, nom){
  const l = genresTMDB[type] || [];
  const g = l.find(x => (x.nom||'').toLowerCase() === nom.toLowerCase());
  return g ? g.id : null;
}
async function chargerGenres(type){
  if(genresTMDB[type]) return genresTMDB[type];
  const d = await tmdb('/genre/'+type+'/list');
  genresTMDB[type] = (d.genres||[]).map(g=>({id:g.id, nom:g.name}));
  return genresTMDB[type];
}

function discParams(){
  const d = ui.disc, type = d.type;
  /* Pas de paramètre region ici : avec lui, TMDB renvoie et trie les dates de
     sortie FRANÇAISES (un film de 1999 ressorti en 2021 s'affiche « 2021 »),
     ce qui rendait le filtre décennie incohérent avec le tri par date. Les
     dates affichées sont donc les originales — comme dans la filmographie.
     La région reste utilisée là où elle a un sens : watch_region (plateformes)
     et l'onglet Sorties (dates salle/numérique/Blu-ray françaises). */
  const p = { include_adult:'false', page:String(d.page) };
  /* Vue « Plateformes » : TMDB filtre lui-même sur l'abonnement en France.
     Si l'utilisateur a coché des plateformes précises, on ne demande qu'elles. */
  if(ui.presence === 'plats'){
    p.watch_region = db.region || 'FR';
    p.with_watch_providers = (d.plats && d.plats.length) ? d.plats.join('|') : FOURNISSEURS;
    p.with_watch_monetization_types = 'flatrate';
  }
  const ids = d.genres.map(n => genreParNom(type, n)).filter(x => x != null);
  if(ids.length) p.with_genres = ids.join(',');

  /* Le filtre Origine, sur toutes les vues qui interrogent TMDB (la vue
     Cinéflix triée localement a son équivalent dans catalogueFiltre). */
  const reg = regionActive();
  if(reg.pays) p.with_origin_country = reg.pays.join('|');

  const champDate = type === 'movie' ? 'primary_release_date' : 'first_air_date';
  const sens = d.sens === 'asc' ? 'asc' : 'desc';
  if(d.tri === 'note'){ p.sort_by = 'vote_average.'+sens; p['vote_count.gte'] = '300'; }
  else if(d.tri === 'sortie'){
    p.sort_by = champDate+'.'+sens;
    /* Le fond de TMDB regorge de fiches quasi vides ; un minimum de votes
       garde les vrais titres. Et sans borne haute, le sens décroissant
       remonterait des films annoncés pour dans deux ans dont on ne sait rien. */
    p['vote_count.gte'] = '20';
    if(sens === 'desc') p[champDate+'.lte'] = todayISO();
  }
  else if(d.tri === 'nom'){
    /* TMDB trie sur le titre ORIGINAL (« The Godfather », pas « Le Parrain »),
       c'est sa seule option. Même garde-fou de votes : sans lui, l'alphabet
       commence par des fiches vides aux titres numériques. */
    p.sort_by = (type === 'movie' ? 'original_title.' : 'name.')+sens;
    p['vote_count.gte'] = '100';
  }
  /* aléatoire : TMDB ne le propose pas — on pioche large côté popularité
     et on mélange à l'arrivée, dans chargerDecouverte(). */
  else p.sort_by = 'popularity.'+(d.tri === 'aleatoire' ? 'desc' : sens);

  if(d.perimetre === 'recent'){
    const champ = type === 'movie' ? 'primary_release_date' : 'first_air_date';
    p[champ+'.gte'] = isoDecale(-FENETRE);
    p[champ+'.lte'] = todayISO();
  }
  if(d.noteMin){
    p['vote_average.gte'] = String(d.noteMin);
    if(!p['vote_count.gte']) p['vote_count.gte'] = '100';
  }
  /* La décennie borne la plage de dates — elle prime sur les bornes posées
     plus haut. Seule exception : en tri « date de sortie » décroissant, la
     décennie en cours reste plafonnée à aujourd'hui, sinon les films
     annoncés pour dans deux ans squattent le haut de la grille. */
  if(d.decennie){
    p[champDate+'.gte'] = d.decennie+'-01-01';
    let fin = (d.decennie+9)+'-12-31';
    if(d.tri === 'sortie' && sens === 'desc' && fin > todayISO()) fin = todayISO();
    p[champDate+'.lte'] = fin;
  }
  return p;
}

/* Le filtre de présence s'applique côté client : le catalogue est en mémoire,
   TMDB n'a évidemment aucune idée de ce qu'il y a sur le NAS. Conséquence :
   une page TMDB peut ne rien donner après filtrage, donc on enchaîne les
   pages jusqu'à remplir la grille — sinon l'utilisateur voit trois vignettes
   et croit que sa bibliothèque est vide. */
function garderPresence(liste, type){
  /* Seule la vue « Cinéflix » filtre côté client ; « Cinéma » montre tout,
     « Plateformes » est déjà filtrée par TMDB. */
  if(ui.presence !== 'dispo') return liste;
  return liste.filter(r => surCineflix(type, r.id));
}

/* ---------- La vue Cinéflix triée localement ---------- */
function melanger(l){
  for(let i = l.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const t = l[i]; l[i] = l[j]; l[j] = t;
  }
  return l;
}

function catalogueFiltre(){
  const d = ui.disc, type = d.type;
  /* Les genres de Jellyfin et ceux de TMDB s'écrivent presque pareil
     (« Science-Fiction » / « Science Fiction ») : on compare des versions
     réduites aux seules lettres. */
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[^a-z]/g,'');
  const voulus = d.genres.map(norm).filter(Boolean);
  let l = (CAT.items||[]).filter(i => i && i.t === type);
  if(voulus.length)
    l = l.filter(i => {
      const g = (i.genres||[]).map(norm);
      return voulus.every(v => g.some(x => x === v || x.includes(v) || v.includes(x)));
    });
  if(d.noteMin) l = l.filter(i => (i.note||0) >= d.noteMin);
  if(d.perimetre === 'recent') l = l.filter(i => (i.sortie||'') >= isoDecale(-FENETRE));
  if(d.decennie){
    const de = d.decennie+'-01-01', a = (d.decennie+9)+'-12-31';
    l = l.filter(i => (i.sortie||'') >= de && (i.sortie||'') <= a);
  }
  /* Origine : les pays viennent des fiches du NAS (métadonnées Jellyfin).
     Un titre sans pays connu reste visible — mieux vaut montrer trop que
     faire disparaître la moitié de la bibliothèque sur une lacune. */
  const reg = regionActive();
  if(reg.pays)
    l = l.filter(i => !i.pays || !i.pays.length ||
                      i.pays.some(c => reg.pays.indexOf(c) >= 0));
  return l;
}

/* L'ordre des classifications : Tous publics avant -10, -12, -16, -18.
   Les libellés varient (« FR-12 », « 12 », « TP », « U ») : on lit le nombre,
   et « tous publics » vaut zéro. Inconnu → à la fin, quel que soit le sens. */
function rangCert(c){
  c = String(c||'').toUpperCase();
  if(!c) return null;
  if(/TP|TOUS|^U$|^G$|APPROVED|PASSED/.test(c)) return 0;
  const m = c.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function comparerLocal(tri, sens){
  const dir = sens === 'asc' ? 1 : -1;
  const val = i =>
    tri === 'nom'    ? (i.nom||'') :
    tri === 'sortie' ? (i.sortie||'') :
    tri === 'ajout'  ? (i.ajout||'') :
    tri === 'lu'     ? (i.lu||'') :
    tri === 'vu'     ? (i.vu||0) :
    tri === 'duree'  ? (i.duree||0) :
    tri === 'noteK'  ? (i.noteCrit == null ? null : i.noteCrit) :
    tri === 'noteT'  ? (i.jt || null) :
    tri === 'cert'   ? rangCert(i.cert) :
    tri === 'note'   ? (i.note == null ? null : i.note) : 0;
  return (a,b)=>{
    const va = val(a), vb = val(b);
    const vida = va == null || va === '', vidb = vb == null || vb === '';
    if(vida && vidb) return 0;
    if(vida) return 1;                       // les fiches muettes vont à la fin
    if(vidb) return -1;
    if(typeof va === 'string') return dir * va.localeCompare(vb, 'fr');
    return dir * (va - vb);
  };
}

/* TMDB ne fournit ici que l'affiche : tout le reste (titre, date, note) est
   déjà dans la fiche du NAS. Chaque affiche n'est demandée qu'une fois. */
const cacheTitres = {};
async function detailsTitre(type, i){
  const k = type+':'+i.id;
  if(cacheTitres[k]) return cacheTitres[k];
  let r = null;
  try{ r = await tmdb('/'+type+'/'+i.id); }
  catch(e){ if(e.message === 'BADKEY') throw e; }
  const o = {
    id: i.id,
    title: (r && r.title) || i.nom,  name: (r && r.name) || i.nom,
    poster_path: (r && r.poster_path) || '',
    release_date: (r && r.release_date) || i.sortie,
    first_air_date: (r && r.first_air_date) || i.sortie,
    vote_average: (r && r.vote_average) || i.note || 0
  };
  cacheTitres[k] = o;
  return o;
}

async function chargerLocale(suite){
  const d = ui.disc;
  const seq = ++discSeq;
  if(!suite){
    d.page = 0; d.res = [];
    d.locale = catalogueFiltre();
    if(d.tri === 'aleatoire') melanger(d.locale);
    else d.locale.sort(comparerLocal(d.tri, d.sens === 'asc' ? 'asc' : 'desc'));
    d.pages = Math.max(1, Math.ceil(d.locale.length / CIBLE_GRILLE));
    oublierDefil('decouvrir');
    if(view === 'decouvrir' && !enRecherche()) window.scrollTo(0,0);
  }
  d.loading = true; d.err = '';
  peindre();
  const part = (d.locale||[]).slice(d.page * CIBLE_GRILLE, (d.page + 1) * CIBLE_GRILLE);
  try{
    const fiches = await Promise.all(part.map(i => detailsTitre(d.type, i)));
    if(seq !== discSeq) return;
    d.page += 1;
    d.res = d.res.concat(fiches.filter(Boolean));
    d.loading = false; d.err = ''; d.charge = true;
  }catch(e){
    if(seq !== discSeq) return;
    d.loading = false; d.charge = true;
    d.err = (e.message === 'BADKEY') ? 'Clé TMDB refusée' : 'Pas de connexion';
  }
  peindre();
}

async function chargerDecouverte(suite){
  const d = ui.disc;
  if(!db.apiKey){ toast('Ajoute ta clé TMDB dans les réglages'); return go('reglages', {from:'decouvrir'}); }
  if(modeLocal()) return chargerLocale(suite);
  const seq = ++discSeq;
  if(!suite){
    d.page = 0; d.res = []; d.pages = 1;
    oublierDefil('decouvrir');
    if(view === 'decouvrir' && !enRecherche()) window.scrollTo(0,0);
  }
  d.loading = true; d.err = '';
  peindre();
  try{
    const type = d.type;
    await chargerGenres(type);
    const perdus = d.genres.filter(n => genreParNom(type, n) == null);
    if(perdus.length){
      d.genres = d.genres.filter(n => genreParNom(type, n) != null);
      toast(perdus.length > 1 ? 'Genres sans équivalent ici : '+perdus.join(', ')
                              : '« '+perdus[0]+' » n\'existe pas pour ce type');
    }
    const avant = d.res.length;
    let tours = 0;
    do{
      d.page += 1;
      const data = await tmdb('/discover/'+type, discParams());
      if(seq !== discSeq) return;
      d.pages = data.total_pages || 1;
      const trouves = garderPresence((data.results||[]).filter(r => r.poster_path), type);
      /* Aléatoire : TMDB ne sait pas mélanger, on le fait nous-mêmes sur
         chaque fournée reçue (Fisher-Yates). */
      if(d.tri === 'aleatoire'){
        for(let i = trouves.length - 1; i > 0; i--){
          const j = Math.floor(Math.random() * (i + 1));
          const t = trouves[i]; trouves[i] = trouves[j]; trouves[j] = t;
        }
      }
      d.res = d.res.concat(trouves);
      tours++;
    } while(d.res.length - avant < CIBLE_GRILLE && d.page < d.pages && tours < MAX_PAGES_PAR_TOUR);

    d.loading = false; d.err = ''; d.charge = true;
    peindre();
  }catch(e){
    if(seq !== discSeq) return;
    d.loading = false; d.charge = true;
    d.err = (e.message === 'BADKEY') ? 'Clé TMDB refusée' : 'Pas de connexion';
    peindre();
  }
}

/* ---------- Recherche ---------- */
const SEARCH_MIN = 2, SEARCH_WAIT = 300, SEARCH_MAX = 20;
let searchTimer = null, searchAbort = null, searchSeq = 0;

const enRecherche = ()=> (ui.searchQ||'').trim().length >= SEARCH_MIN;
function abortSearch(){ if(searchAbort){ try{ searchAbort.abort(); }catch(e){} searchAbort = null; } }

function onSearchInput(v){
  const avant = enRecherche();
  ui.searchQ = v;
  clearTimeout(searchTimer); abortSearch();
  const q = v.trim();
  if(enRecherche() !== avant){ oublierDefil('decouvrir'); window.scrollTo(0,0); }
  if(q.length < SEARCH_MIN){
    ui.searchRes = null; ui.searchPers = null; ui.searching = false; ui.searchErr = '';
    peindre(); return;
  }
  ui.searching = true; ui.searchErr = '';
  peindre();
  searchTimer = setTimeout(()=> runSearch(q), SEARCH_WAIT);
}
function searchNow(){
  clearTimeout(searchTimer);
  const q = (ui.searchQ||'').trim();
  if(q.length < SEARCH_MIN) return;
  ui.searching = true; ui.searchErr = ''; peindre();
  runSearch(q);
}
function viderRecherche(){
  clearTimeout(searchTimer); abortSearch();
  ui.searchQ = ''; ui.searchRes = null; ui.searchPers = null;
  ui.searching = false; ui.searchErr = '';
  render();
}
async function runSearch(q){
  if(!db.apiKey){ ui.searching = false; peindre(); return go('reglages', {from:'decouvrir'}); }
  const seq = ++searchSeq;
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  searchAbort = ctrl;
  try{
    /* Titres ET personnes, en parallèle : taper « sean connery » remonte sa
       fiche au-dessus des films. Si la recherche de personnes échoue seule,
       elle disparaît en silence — les titres restent. */
    const res = await Promise.all([
      tmdb('/search/'+ui.disc.type, {query:q, include_adult:'false'},
           ctrl ? {signal:ctrl.signal} : null),
      tmdb('/search/person', {query:q, include_adult:'false'},
           ctrl ? {signal:ctrl.signal} : null).catch(()=>null)
    ]);
    if(seq !== searchSeq) return;
    /* La recherche par titre ignore volontairement le filtre de présence :
       quand on cherche un film précis, on veut le trouver, et c'est la
       pastille qui répond à « est-ce que je l'ai ? ». */
    ui.searchRes  = (res[0].results||[]).slice(0, SEARCH_MAX);
    ui.searchPers = res[1] ? (res[1].results||[]).slice(0, 10) : [];
    ui.searching = false; ui.searchErr = '';
    peindre();
  }catch(e){
    if((e && e.name === 'AbortError') || seq !== searchSeq) return;
    ui.searching = false;
    ui.searchErr = (e.message === 'BADKEY') ? 'Clé TMDB refusée' : 'Pas de connexion';
    ui.searchRes = []; ui.searchPers = [];
    peindre();
  }
}

/* La rangée « Personnes » des résultats — mêmes vignettes rondes que le
   casting, un appui ouvre la filmographie complète. */
function rangeePersonnes(){
  const l = ui.searchPers || [];
  if(!l.length) return '';
  const roles = { Acting:'Acteur / actrice', Directing:'Réalisation',
                  Writing:'Scénario', Production:'Production' };
  return '<div class="sectitle">Personnes</div><div class="cast">'+
    l.map(p=>'<button class="cperson" onclick="ouvrirPersonne('+p.id+')">'+
      (p.profile_path ? '<img loading="lazy" src="'+IMG(p.profile_path,'w185')+'" alt="">'
                      : '<div class="ph2">'+esc((p.name||'?')[0])+'</div>')+
      '<div class="cname">'+esc(p.name||'')+'</div>'+
      '<div class="crole">'+esc(roles[p.known_for_department] || p.known_for_department || '')+'</div>'+
    '</button>').join('')+'</div>';
}

/* ---------- Vignette ---------- */
function carteTitre(r, type){
  const titre = type === 'movie' ? (r.title || r.name) : (r.name || r.title);
  const date  = type === 'movie' ? r.release_date : r.first_air_date;
  const st    = statut(type, r.id);
  const note  = r.vote_average ? Math.round(r.vote_average*10)/10 : null;

  let tag = '';
  /* La pastille verte est volontairement minuscule : sur une grille entière
     de titres possédés, une étiquette « Cinéflix » par affiche criait. Une
     coche suffit — le texte sous le titre dit déjà le reste. */
  if(st === 'obtenu')       tag = '<div class="tag dispo mini" aria-label="Sur Cinéflix">'+I.check+'</div>';
  else if(st === 'demande') tag = '<div class="tag demande">'+I.horloge+'Demandé</div>';
  else if(st === 'encours') tag = '<div class="tag encours">'+I.horloge+'En cours</div>';
  else if(st === 'fav')     tag = '<div class="tag fav">'+I.coeurPlein+'</div>';

  /* « À regarder maintenant » sous CHAQUE affiche possédée : sur une grille
     entière de titres possédés, la même phrase répétée cinquante fois n'est
     plus une information, c'est du bruit. La coche verte suffit. Les deux
     autres états restent : eux sont rares, donc signifiants. */
  const sous = st === 'demande' ? '<div class="gsub demande">Demandé</div>'
             : st === 'encours' ? '<div class="gsub encours">En cours</div>'
             : '';

  return '<button class="gcard" onclick="ouvrirFiche('+r.id+',\''+type+'\')">'+
    '<div class="wrapimg">'+ posterEl(r.poster_path,'w342','',titre) + tag +
      (note ? '<div class="gnote">'+I.star+note.toFixed(1)+'</div>' : '')+
    '</div>'+
    '<div class="gname">'+esc(titre)+'</div>'+
    '<div class="gyear">'+esc(year(date))+
      (function(){ const n = noteDe(type, r.id, titre, date);
        return n && n.jt ? ' '+tlrHtml(n, true) : ''; })()+'</div>'+ sous +
  '</button>';
}

/* ---------- Peinture partielle ---------- */
/* On ne redessine que la zone de résultats : les puces gardent leur position
   de défilement et le champ de recherche ne perd pas le focus pendant la frappe. */
function peindre(){
  if(view !== 'decouvrir') return;
  const el = document.getElementById('dres');
  if(!el) return render();
  const cherche = enRecherche();
  el.innerHTML = cherche ? corpsRecherche() : corpsDecouverte();
  const r = document.querySelector('.resume');
  if(r) r.innerHTML = cherche ? esc(resumeRecherche()) : '<b>'+esc(resumeFiltres())+'</b>';
  const b = document.getElementById('fbtn');
  if(b){ b.classList.toggle('actif', filtresActifs()); b.classList.toggle('masque', cherche); }
  const c = document.querySelector('.qclear');
  if(c) c.classList.toggle('masque', !ui.searchQ);
}

function corpsRecherche(){
  if(ui.searching)
    return '<div class="empty"><span class="spin"></span><p style="margin-top:12px">Recherche…</p></div>';
  if(ui.searchErr)
    return '<div class="empty">'+I.search+'<h3>'+esc(ui.searchErr)+'</h3>'+
      '<p>Vérifie ta connexion, puis réessaie.</p>'+
      '<button class="btn ghost" onclick="searchNow()">Réessayer</button></div>';
  const pers = rangeePersonnes();
  if((!ui.searchRes || !ui.searchRes.length) && !pers)
    return '<div class="empty"><h3>Rien trouvé</h3>'+
      '<p>Essaie une autre orthographe, ou change de type juste au-dessus.</p></div>';
  let h = pers;
  if(ui.searchRes && ui.searchRes.length)
    h += (pers ? '<div class="sectitle">'+(ui.disc.type === 'movie' ? 'Films' : 'Séries')+'</div>' : '')+
      '<div class="grid">'+ui.searchRes.map(r=>carteTitre(r, ui.disc.type)).join('')+'</div>';
  return h;
}

function corpsDecouverte(){
  const d = ui.disc;
  if(!db.apiKey)
    return '<div class="empty">'+I.boussole+'<h3>Clé TMDB manquante</h3>'+
      '<p>Le catalogue vient de TMDB : ajoute ta clé dans les réglages.</p>'+
      '<button class="btn ghost" onclick="go(\'reglages\',{from:\'decouvrir\'})">Ouvrir les réglages</button></div>';
  if(d.loading && !d.res.length)
    return '<div class="empty"><span class="spin"></span><p style="margin-top:12px">Chargement…</p></div>';
  if(d.err)
    return '<div class="empty">'+I.boussole+'<h3>'+esc(d.err)+'</h3>'+
      '<p>Vérifie ta connexion, puis réessaie.</p>'+
      '<button class="btn ghost" onclick="chargerDecouverte()">Réessayer</button></div>';
  if(!d.res.length){
    if(ui.presence === 'dispo')
      return '<div class="empty">'+I.serveur+'<h3>Rien de Cinéflix ici</h3>'+
        '<p>Aucun titre de ces filtres n\'est sur le serveur. Élargis les filtres, '+
        'ou repasse sur « '+labelTout()+' » pour voir ce qui existe.</p>'+
        '<button class="btn ghost" onclick="setPresence(\'tout\')">'+labelTout()+'</button></div>';
    return '<div class="empty">'+I.boussole+'<h3>Rien avec ces filtres</h3>'+
      '<p>Élargis la note minimale ou retire un genre.</p>'+
      '<button class="btn ghost" onclick="ouvrirFiltres()">Ouvrir les filtres</button></div>';
  }
  return '<div class="grid">'+d.res.map(r=>carteTitre(r, d.type)).join('')+'</div>'+
    (d.page < d.pages
      ? '<div class="plus"><button class="btn ghost" onclick="chargerDecouverte(true)"'+
        (d.loading?' disabled':'')+'>'+
        (d.loading?'<span class="spin"></span> Chargement…':'Voir plus')+'</button></div>'
      : '');
}

/* ---------- Actions ---------- */
function setType(t){
  if(ui.disc.type === t) return;
  ui.disc.type = t;
  if(enRecherche()){
    clearTimeout(searchTimer); abortSearch();
    ui.searchRes = null; ui.searchErr = ''; ui.searching = true;
  }
  render();
  chargerDecouverte();
  if(enRecherche()) searchNow();
}
function setPresence(p){
  if(ui.presence === p) return;
  ui.presence = p;
  /* Les tris de bibliothèque n'ont pas de sens sur « tous les films » :
     TMDB ignore quand un titre est arrivé sur le NAS ou combien de fois
     il a été vu. On retombe sur la popularité. */
  if(p !== 'dispo' && TRI_LOCAL(ui.disc.tri)){
    ui.disc.tri = 'sortie'; ui.disc.sens = 'desc';
    toast('Ce tri n\'existe que sur la vue Cinéflix');
  }
  render();
  if(!enRecherche()) chargerDecouverte();
}
function bascPlateforme(id){
  const sel = ui.disc.plats || (ui.disc.plats = []);
  const k = sel.indexOf(id);
  if(k < 0) sel.push(id); else sel.splice(k,1);
  ouvrirFiltres(); chargerDecouverte();
}
function setVue(v){
  db.vue = v; saveDB();
  appliquerVue();
  ouvrirFiltres();          // redessine la feuille, la grille suit toute seule (CSS)
}
function setTri(t){ ui.disc.tri = t; ouvrirFiltres(); chargerDecouverte(); }
function setSens(s){ ui.disc.sens = s; ouvrirFiltres(); chargerDecouverte(); }
/* Décennie et « sortis récemment » se contredisent : activer l'un éteint
   l'autre. Réappuyer sur la décennie active la désactive. */
function setDecennie(a){
  const d = ui.disc;
  d.decennie = (d.decennie === a) ? 0 : a;
  if(d.decennie) d.perimetre = 'tout';
  ouvrirFiltres(); chargerDecouverte();
}
function setPerimetre(p){
  ui.disc.perimetre = p;
  if(p === 'recent') ui.disc.decennie = 0;
  ouvrirFiltres(); chargerDecouverte();
}
function setOrigine(id){
  ui.disc.origine = id;
  ouvrirFiltres(); chargerDecouverte();
}
function setNote(n){ ui.disc.noteMin = n; ouvrirFiltres(); chargerDecouverte(); }
function bascGenre(i){
  const g = (genresTMDB[ui.disc.type] || [])[i];
  if(!g) return;
  const sel = ui.disc.genres, k = sel.indexOf(g.nom);
  if(k < 0) sel.push(g.nom); else sel.splice(k,1);
  ouvrirFiltres(); chargerDecouverte();
}
function resetFiltres(){
  const d = ui.disc;
  d.genres = []; d.perimetre = 'tout'; d.tri = 'sortie'; d.sens = 'desc'; d.noteMin = 0;
  d.plats = []; d.decennie = 0; d.origine = 'eurna';
  ouvrirFiltres(); chargerDecouverte();
}
function filtresActifs(){
  const d = ui.disc;
  return d.genres.length > 0 || d.noteMin > 0 || d.perimetre !== 'tout' ||
         d.tri !== 'sortie' || (d.sens||'desc') !== 'desc' || !!d.decennie ||
         (d.origine||'eurna') !== 'eurna' ||
         (ui.presence === 'plats' && (d.plats||[]).length > 0);
}
function resumeFiltres(){
  const d = ui.disc;
  const bouts = [];
  const pres = PRESENCES.find(p=>p.id === ui.presence);
  if(ui.presence !== 'tout') bouts.push((pres.label||'').toLowerCase());
  if(ui.presence === 'plats' && (d.plats||[]).length)
    bouts.push(d.plats.map(id => (PLATEFORMES.find(p=>p.id===id)||{}).nom).filter(Boolean).join(' + '));
  const tri = TRIS.concat(TRIS_LOCAUX).find(t=>t.id===d.tri) || {};
  bouts.push(tri.court + (d.tri !== 'aleatoire' && d.sens === 'asc' ? ' croissant' : ''));
  if(d.perimetre === 'recent') bouts.push('sorties récentes');
  if(d.decennie) bouts.push('années '+(d.decennie < 2000 ? String(d.decennie).slice(2) : d.decennie));
  if((d.origine||'eurna') !== 'eurna') bouts.push(regionActive().label.toLowerCase());
  if(d.noteMin) bouts.push('note '+d.noteMin+' et +');
  d.genres.forEach(n=> bouts.push(n.toLowerCase()));
  return bouts.filter(Boolean).join(' · ');
}
function resumeRecherche(){
  return 'Recherche dans '+(ui.disc.type === 'movie' ? 'les films' : 'les séries')+
         ' · « '+(ui.searchQ||'').trim()+' »';
}

function ouvrirFiltres(){
  const d = ui.disc;
  const genres = genresTMDB[d.type] || [];
  let h = '<h3>Filtres</h3><div class="small muted" style="margin-top:-4px">Appliqués aux '+
    (d.type === 'movie' ? 'films' : 'séries')+'.</div>';
  /* Sur la vue Plateformes : choisir lesquelles. Rien de coché = toutes. */
  if(ui.presence === 'plats'){
    h += '<div class="fgrp">Plateformes'+((d.plats||[]).length?' ('+d.plats.length+')':'')+'</div><div class="fchips">'+
      PLATEFORMES.map(pf=>'<button class="chip '+pf.cl+' '+((d.plats||[]).indexOf(pf.id)>=0?'on':'')+
        '" onclick="bascPlateforme('+pf.id+')">'+pf.nom+'</button>').join('')+'</div>';
  }
  h += '<div class="fgrp">Quoi</div><div class="fchips">'+
    PERIMETRES.map(p=>'<button class="chip '+(d.perimetre===p.id?'on':'')+
      '" onclick="setPerimetre(\''+p.id+'\')">'+p.label+'</button>').join('')+'</div>';
  h += '<div class="fgrp">Décennie'+(d.decennie?' — '+d.decennie:'')+'</div>'+
    '<div class="fchips defil" id="fdec">'+
    '<button class="chip '+(!d.decennie?'on':'')+'" onclick="setDecennie(0)">Toutes</button>'+
    DECENNIES.map(a=>'<button class="chip '+(d.decennie===a?'on':'')+
      '" onclick="setDecennie('+a+')">'+a+'</button>').join('')+'</div>';
  /* L'origine des films — une seule région à la fois, « Monde » = tout. */
  h += '<div class="fgrp">Origine — '+regionActive().label+'</div>'+
    '<div class="fchips defil" id="forig">'+
    REGIONS.map(r=>'<button class="chip '+(regionActive().id===r.id?'on':'')+
      '" onclick="setOrigine(\''+r.id+'\')">'+r.label+'</button>').join('')+'</div>';
  const bibli = ui.presence === 'dispo' && (CAT.items||[]).length > 0;
  const tris = bibli ? TRIS.concat(TRIS_LOCAUX) : TRIS;
  h += '<div class="fgrp">Trier par</div><div class="fchips">'+
    tris.map(t=>'<button class="chip '+(d.tri===t.id?'on':'')+
      '" onclick="setTri(\''+t.id+'\')">'+t.label+'</button>').join('')+'</div>';
  if(!bibli)
    h += '<div class="small muted" style="margin:6px 2px 0">'+
      (ui.presence === 'dispo'
        ? 'Date d\'ajout, durée, lectures… arrivent avec la prochaine mise à jour du serveur (toutes les heures).'
        : 'Date d\'ajout, durée, lectures… : ces tris s\'appliquent à la vue « Cinéflix », '+
          'où l\'app connaît ta bibliothèque.')+'</div>';
  if(d.tri !== 'aleatoire')
    h += '<div class="fgrp">Ordre de tri</div><div class="fchips">'+
      ORDRES.map(o=>'<button class="chip '+((d.sens||'desc')===o.id?'on':'')+
        '" onclick="setSens(\''+o.id+'\')">'+o.label+'</button>').join('')+'</div>';
  h += '<div class="fgrp">Note minimale</div><div class="fchips">'+
    NOTES.map(n=>'<button class="chip '+(d.noteMin===n.v?'on':'')+
      '" onclick="setNote('+n.v+')">'+n.label+'</button>').join('')+'</div>';
  h += '<div class="fgrp">Affichage</div><div class="fchips">'+
    VUES.map(v=>'<button class="chip '+((db.vue||'')===v.id?'on':'')+
      '" onclick="setVue(\''+v.id+'\')">'+v.label+'</button>').join('')+'</div>';
  h += '<div class="fgrp">Genres'+(d.genres.length?' ('+d.genres.length+')':'')+'</div>';
  h += genres.length
    ? '<div class="fchips">'+genres.map((g,i)=>'<button class="chip '+
        (d.genres.indexOf(g.nom)>=0?'on':'')+'" onclick="bascGenre('+i+')">'+esc(g.nom)+'</button>').join('')+'</div>'
    : '<div class="small muted">Les genres arrivent avec les premiers résultats.</div>';
  h += '<button class="btn block" style="margin-top:18px" onclick="closeSheet()">Voir les résultats</button>';
  if(filtresActifs()) h += '<button class="opt" onclick="resetFiltres()">Tout effacer</button>';
  openSheet(h);
  /* Chaque sélection redessine la feuille et la rangée des décennies repart
     à gauche — la décennie choisie sortait de l'écran et on croyait le geste
     raté. On recentre la rangée sur la puce active à chaque rendu. */
  ['fdec','forig'].forEach(id => {
    const rd = document.getElementById(id);
    if(!rd) return;
    const on = rd.querySelector('.chip.on');
    if(on) rd.scrollLeft = Math.max(0,
      (on.offsetLeft - rd.offsetLeft) - (rd.clientWidth - on.offsetWidth) / 2);
  });
}

function ouvrirChamp(){
  if(ui.champOuvert) return fermerChamp();
  ui.champOuvert = true; ui.focusSearch = true; render();
}
function fermerChamp(){ ui.champOuvert = false; viderRecherche(); }

function champRecherche(){
  const quoi = ui.disc.type === 'movie' ? 'Chercher un film…' : 'Chercher une série…';
  return '<div class="qbar">'+I.search+
    '<input type="search" id="q" enterkeyhint="search" autocomplete="off" autocorrect="off" '+
    'placeholder="'+quoi+'" value="'+esc(ui.searchQ)+'" oninput="onSearchInput(this.value)" '+
    'onkeydown="if(event.key===\'Enter\'){this.blur();searchNow()}">'+
    '<button class="qclear '+(ui.searchQ?'':'masque')+'" onclick="viderRecherche()">'+I.close+'</button>'+
  '</div>';
}

/* ---------- Le choix du soir ----------
   L'écran ne s'ouvre plus sur une grille anonyme : il met UN film en scène —
   jamais lancé, très bien noté, tiré au hasard dans le haut du panier pour
   changer à chaque session. C'est la promesse d'une bibliothèque personnelle,
   dite en une image plutôt qu'en deux mille vignettes. */
let heroTente = false;
function assurerHeroSoir(){
  if(ui.heroSoirs || heroTente) return;
  const l = (CAT.items||[]).filter(i => i && i.t === 'movie' && !i.vu &&
                                        (i.noteCrit||0) >= 75);
  if(!l.length) return;
  heroTente = true;
  l.sort((a,b)=>(b.noteCrit||0)-(a.noteCrit||0));
  /* CINQ propositions, pas une : sur téléphone elles se balayent du doigt.
     Tirées sans doublon dans le haut du panier, elles changent à chaque
     session. On garde l'AFFICHE en plus du décor — c'est elle qui remplit un
     écran debout, le décor est fait pour un écran couché. */
  const bassin = l.slice(0, 40), choisis = [];
  while(choisis.length < 5 && bassin.length)
    choisis.push(bassin.splice(Math.floor(Math.random()*bassin.length), 1)[0]);
  Promise.all(choisis.map(c => tmdb('/movie/'+c.id).catch(()=>null))).then(fs=>{
    const prets = choisis.map((c,i)=>{
      const f = fs[i] || {};
      let txt = (f.overview||'').split('. ').slice(0,2).join('. ');
      if(txt && !/[.!?]$/.test(txt)) txt += '.';
      return { id:c.id, nom:c.nom,
        annee:String(c.sortie||'').slice(0,4), crit:c.noteCrit||0, jt:c.jt||0,
        fond:f.backdrop_path || f.poster_path || '',
        aff:f.poster_path || f.backdrop_path || '',
        date:f.release_date || c.sortie || '', txt:txt };
    }).filter(x => x.fond || x.aff);
    if(!prets.length) return;
    ui.heroSoirs = prets;
    ui.heroSoir  = prets[0];   /* le bandeau du bureau n'en montre qu'un */
    if(view === 'decouvrir') render();
  }).catch(()=>{});
}
function heroSoirHtml(){
  const h = ui.heroSoir;
  if(!h || !h.fond) return '';
  const meta = [h.annee, h.crit ? 'critiques '+h.crit+' %' : '',
                h.jt >= 2 ? 'T'.repeat(h.jt)+' Télérama' : ''].filter(Boolean).join(' · ');
  return '<div class="herosoir">'+ hsBarre() +
    '<div class="hsfond"><img loading="lazy" src="'+IMG(h.fond,'w1280')+'" alt=""></div>'+
    '<div class="hstxt">'+
      '<div class="hssur">Le choix du soir · jamais lancé</div>'+
      '<h2>'+esc(h.nom)+'</h2>'+
      (meta ? '<div class="hsmeta">'+esc(meta)+'</div>' : '')+
      (h.txt ? '<p>'+esc(h.txt)+'</p>' : '')+
      '<div class="hsactions">'+
        '<button class="btn" onclick="regarderSoir()">▶ Regarder</button>'+
        '<button class="btn ghost" onclick="ouvrirGuide()">Laisse-moi te guider</button>'+
      '</div>'+
    '</div>'+
  '</div>';
}

/* ---------- La vitrine (téléphone) ----------
   Un téléphone se tient debout : c'est l'AFFICHE qui remplit son écran, pas
   l'image large du décor — celle-ci est cadrée pour un écran couché, et la
   faire tenir dans un bandeau presque carré coûtait 28 % de sa largeur.
   Cinq propositions, une par écran, qu'on balaye du doigt.

   Le bureau ne voit JAMAIS ce bloc : app-base l'éteint, app-mobile l'allume
   et masque en échange le bandeau .herosoir, qui reste tel quel au-dessus
   pour les grands écrans. Aucune règle de app-site.css n'est touchée. */
function vitrineHtml(){
  const l = ui.heroSoirs;
  if(!l || !l.length) return '';
  return '<div class="vitrine">'+
    '<div class="vcar" id="vcar" onscroll="vitrinePoint()">'+
      l.map((h,i)=>{
        const meta = [h.annee, h.crit ? 'critiques '+h.crit+' %' : '',
                      h.jt >= 2 ? 'T'.repeat(h.jt)+' Télérama' : ''].filter(Boolean).join(' · ');
        return '<div class="vsl">'+
          '<img src="'+IMG(h.aff || h.fond,'w780')+'" alt="">'+
          '<div class="vgr"></div>'+
          '<div class="vtx">'+
            '<div class="hssur">Le choix du soir · jamais lancé</div>'+
            '<h2>'+esc(h.nom)+'</h2>'+
            (meta ? '<div class="hsmeta">'+esc(meta)+'</div>' : '')+
            '<div class="vbt">'+
              '<button class="vb1" onclick="regarderSoir('+i+')">▶ Regarder</button>'+
              '<button class="vb2" onclick="listerSoir('+i+')">+ Ma liste</button>'+
            '</div>'+
          '</div>'+
        '</div>';
      }).join('')+
    '</div>'+
    '<div class="vpts" id="vpts">'+
      l.map((x,i)=>'<i'+(i ? '' : ' class="on"')+'></i>').join('')+
    '</div>'+
  '</div>';
}
/* Le point actif suit le doigt. On mesure le pas réel (largeur d'une carte
   plus l'écart) : diviser par la largeur du cadre décalerait d'un cran au
   bout de trois cartes. */
function vitrinePoint(){
  const c = document.getElementById('vcar'), p = document.getElementById('vpts');
  if(!c || !p || !c.firstChild) return;
  const pas = c.firstChild.getBoundingClientRect().width + 12;
  const n = Math.max(0, Math.min(p.children.length - 1, Math.round(c.scrollLeft / pas)));
  for(let i = 0; i < p.children.length; i++) p.children[i].className = i === n ? 'on' : '';
}
function listerSoir(i){
  const h = (ui.heroSoirs||[])[i||0];
  if(!h) return;
  basculerFavori({ id:h.id, title:h.nom, poster_path:h.aff || null,
                   release_date:h.date || '' }, 'movie');
}

/* Les pilules : où l'on est, et par où l'on sort. « Tout » est la couverture
   elle-même — elle ne mène nulle part, elle dit seulement qu'on y est. */
function pilulesHtml(){
  return '<div class="pilules">'+
    '<button class="pil pico" onclick="ouvrirChamp()" aria-label="Chercher">'+I.search+'</button>'+
    '<button class="pil on">Tout</button>'+
    '<button class="pil" onclick="ouvrirCatalogue(\'movie\')">Films</button>'+
    '<button class="pil" onclick="ouvrirCatalogue(\'tv\')">Séries</button>'+
  '</div>';
}

/* « Regarder » sur la couverture tient sa promesse : il ouvre le film DANS
   Jellyfin, par son identifiant — plus la fiche Cinéflix. Si l'identifiant
   manque (catalogue pas encore réexporté), on retombe sur la fiche. */
function regarderSoir(i){
  const h = (ui.heroSoirs||[])[i||0] || ui.heroSoir;
  if(!h) return;
  const f = ficheDe('movie', h.id);
  if(f && f.jf && typeof ouvrirJellyfin === 'function')
    return ouvrirJellyfin(h.nom, f.jf);
  ouvrirFiche(h.id, 'movie');
}

/* La petite barre posée sur l'image : le logo, rien d'autre. Sur le bureau
   elle disparaît — la vraie barre de navigation est déjà en haut. Sur
   téléphone elle est reposée à plat (.minihaut) au-dessus des pilules :
   depuis la vitrine, ce sont elles qui portent Films et Séries. */
function hsBarre(){
  return '<div class="hsbar"><div class="hslogo">CINÉ<i>FLIX</i></div>'+
    avatarBouton()+'</div>';
}

/* ---------- Le Top de la bibliothèque ----------
   Sept affiches numérotées, façon couverture de magazine. Le classement est
   celui des critiques et de Télérama — pas le mien. Les affiches manquent aux
   fiches du NAS : on les demande à TMDB une fois par session. */
let topReq = false;
function assurerTopBib(){
  if(ui.topBib || topReq) return;
  /* Le vivier : les 30 meilleurs films, toujours jugés pareil — presse à
     80 et plus, bonus Télérama, note du public. Jusqu'en 3007j on affichait
     éternellement les 7 premiers : un tableau d'honneur figé, la même
     vitrine tous les matins, qu'on finit par ne plus voir. Depuis 3007k
     (demande d'Alexandre) on pioche les 7 DU JOUR dans ce vivier : la
     sélection change chaque matin, la qualité jamais. Le tirage est semé
     par la DATE : stable toute la journée, et identique sur le téléphone,
     la tablette et le bureau. */
  const vivier = (CAT.items||[]).filter(i => i && i.t === 'movie' && (i.noteCrit||0) >= 80)
    .sort((a,b)=>((b.noteCrit||0)+(b.jt||0)*5+(b.note||0)) -
                 ((a.noteCrit||0)+(a.jt||0)*5+(a.note||0)))
    .slice(0, 30);
  if(vivier.length < 5) return;
  let graine = Number(todayISO().replace(/-/g, ''));
  const alea = ()=>{ graine = (graine * 1103515245 + 12345) % 2147483648;
                     return graine / 2147483648; };
  for(let i = vivier.length - 1; i > 0; i--){
    const j = Math.floor(alea() * (i + 1));
    const t = vivier[i]; vivier[i] = vivier[j]; vivier[j] = t;
  }
  const l = vivier.slice(0, 7);
  topReq = true;
  Promise.all(l.map(c => tmdb('/movie/'+c.id).catch(()=>null))).then(fs=>{
    ui.topBib = l.map((c,i)=>({ id:c.id, nom:c.nom,
      poster:(fs[i] && fs[i].poster_path) || '' })).filter(x=>x.poster);
    if(view === 'decouvrir') render();
  });
}
function topBibHtml(){
  const t = ui.topBib;
  if(!t || t.length < 5) return '';
  return '<div class="sectitle">Top de ta bibliothèque</div>'+
    '<div class="top7">'+t.map((x,i)=>
      '<button class="t7c" onclick="ouvrirFiche('+x.id+',\'movie\')">'+
        '<div class="chiffre">'+(i+1)+'</div>'+
        '<div class="aff">'+posterEl(x.poster,'w342','',x.nom)+'</div>'+
      '</button>').join('')+'</div>';
}

/* ---------- Les deux rangées sous le Top ----------
   « Ajouts récents » et « Continuer la lecture » : même forme que le Top,
   sans les chiffres — un ajout n'est pas un classement. Les affiches
   manquent aux fiches du NAS ; on les demande à TMDB une fois par session,
   comme pour le Top, et jamais plus de dix par rangée.

   « Continuer la lecture » repose sur le champ `pos` (minutes déjà lues),
   ajouté à l'export du NAS. Tant qu'aucune fiche ne le porte, la rangée
   n'existe simplement pas : rien à afficher, rien à expliquer. */
const RANGS = {};
function assurerRangee(nom, choisir){
  if(ui[nom] || RANGS[nom]) return;
  const l = choisir();
  if(!l.length) return;
  RANGS[nom] = true;
  Promise.all(l.map(c => tmdb('/'+(c.t === 'tv' ? 'tv' : 'movie')+'/'+c.id).catch(()=>null)))
    .then(fs=>{
      ui[nom] = l.map((c,i)=>({ id:c.id, t:c.t, nom:c.nom,
        pos:c.pos||0, duree:c.duree||0,
        poster:(fs[i] && fs[i].poster_path) || '' })).filter(x=>x.poster);
      if(view === 'decouvrir') render();
    });
}
function assurerRecents(){
  assurerRangee('recents', ()=> (CAT.items||[])
    .filter(i => i && i.ajout)
    .sort((a,b)=> String(b.ajout).localeCompare(String(a.ajout)))
    .slice(0,10));
}
function assurerReprises(){
  /* « En cours » = commencé, pas fini. On laisse deux minutes de marge au
     bout : un générique qu'on coupe ne doit pas ressortir toute la semaine. */
  assurerRangee('reprises', ()=> (CAT.items||[])
    .filter(i => i && (i.pos||0) > 0 && (i.duree||0) > 0 && i.pos < i.duree - 2)
    .sort((a,b)=> String(b.lu||'').localeCompare(String(a.lu||'')))
    .slice(0,10));
}
function rangeeHtml(titre, l, jauge){
  if(!l || !l.length) return '';
  return '<div class="sectitle">'+titre+'</div>'+
    '<div class="top7 plate">'+l.map(x=>
      '<button class="t7c" onclick="ouvrirFiche('+x.id+',\''+x.t+'\')">'+
        '<div class="aff">'+posterEl(x.poster,'w342','',x.nom)+
          (jauge && x.duree
            ? '<i class="jauge" style="width:'+
              Math.max(3, Math.min(100, Math.round(x.pos / x.duree * 100)))+'%"></i>'
            : '')+
        '</div>'+
      '</button>').join('')+'</div>';
}

function viewDecouvrir(){
  const d = ui.disc, cherche = enRecherche();
  /* Deux pages sous un même nom. La COUVERTURE : le grand visuel, le Top,
     rien d'autre — c'est la page d'accueil. Le CATALOGUE (ui.exploration) :
     les trois sources, les filtres, la grille — on y entre par Films ou
     Séries. La recherche bascule d'office côté catalogue. */
  const catalogue = ui.exploration || cherche || ui.champOuvert;

  if(catalogue){
    ui.exploration = true;
    const bouton = '<button class="iconbtn '+(filtresActifs()?'actif ':'')+(cherche?'masque':'')+
      '" id="fbtn" onclick="ouvrirFiltres()">'+I.filtre+'</button>';
    const rangees =
      (ui.champOuvert ? champRecherche() : '') +
      '<div class="chips types">'+
        '<button class="chip chipico '+(ui.champOuvert?'ouvert':'')+'" onclick="ouvrirChamp()" '+
          'aria-label="Chercher">'+(ui.champOuvert ? I.close : I.search)+'</button>'+
        TYPES.map(t=>'<button class="chip '+t.cl+' '+(d.type===t.id?'on':'')+
          '" onclick="setType(\''+t.id+'\')">'+t.label+'</button>').join('')+
      '</div>'+
      '<div class="souschips">'+
        PRESENCES.map(p=>'<button class="chip '+p.cl+' '+(ui.presence===p.id?'on':'')+
          '" onclick="setPresence(\''+p.id+'\')">'+(p.label || labelTout())+'</button>').join('')+
      '</div>'+
      '<div class="resume">'+(cherche ? esc(resumeRecherche()) : '<b>'+esc(resumeFiltres())+'</b>')+'</div>';
    return header(d.type === 'movie' ? 'Films' : 'Séries', {right:bouton, sub:rangees}) +
      banniereCle() + banniereCatalogue() +
      '<div id="dres">'+(cherche ? corpsRecherche() : corpsDecouverte())+'</div>'+
      '<div style="height:20px"></div>';
  }

  /* ---- La couverture ---- */
  assurerHeroSoir(); assurerTopBib(); assurerRecents(); assurerReprises();
  const haut = heroSoirHtml() || '<div class="herosoir vide">'+hsBarre()+'</div>';
  /* Les entrées vers le catalogue : indispensables sur téléphone (la barre du
     bas n'a pas Films/Séries), inoffensives sur le bureau. */
  const entrees = '<div class="entrees wrap">'+
    '<button class="btn ghost" onclick="ouvrirCatalogue(\'movie\')">Films</button>'+
    '<button class="btn ghost" onclick="ouvrirCatalogue(\'tv\')">Séries</button>'+
  '</div>';
  /* Le téléphone : logo à plat, pilules, vitrine. Le bureau : le bandeau
     ci-dessus. Les deux jeux de blocs sont dans la page, la feuille de
     style n'en montre qu'un — c'est ce qui permet de refaire l'accueil du
     téléphone sans toucher une ligne du grand écran. */
  const tel = '<div class="minihaut">'+hsBarre()+'</div>'+
              pilulesHtml() + vitrineHtml();
  return haut + tel + banniereCle() + banniereCatalogue() + topBibHtml() +
    rangeeHtml('Ajouts récents', ui.recents, false) +
    rangeeHtml('Continuer la lecture', ui.reprises, true) +
    entrees + '<div style="height:20px"></div>';
}


