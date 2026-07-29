"use strict";

/* ============================ Icônes ============================ */
const I = {
  boussole:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>',
  coeur:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 5.6a5.2 5.2 0 0 0-7.4 0L12 7l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4l1.4 1.4L12 21.2l7.4-7.4 1.4-1.4a5.2 5.2 0 0 0 0-6.8z"/></svg>',
  coeurPlein:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.8 5.6a5.2 5.2 0 0 0-7.4 0L12 7l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4l1.4 1.4L12 21.2l7.4-7.4 1.4-1.4a5.2 5.2 0 0 0 0-6.8z"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  dots:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>',
  filtre:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M7 12h10M10 17h4"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
  envoi:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8z"/></svg>',
  horloge:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  /* Les trois sorties ont chacune leur pictogramme : écran, nuage, disque. */
  salle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  nuage:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 0 0 .3-9 6 6 0 0 0-11.6 1.5A3.8 3.8 0 0 0 6.8 19z"/><path d="M12 12v5m0 0-2-2m2 2 2-2"/></svg>',
  disque:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.6"/></svg>',
  serveur:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>',
  film:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 12h18M3 8h4M3 16h4M17 8h4M17 16h4"/></svg>',
  frame:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.4"/><path d="m21 16-5-5-4.5 4.5L9 13l-6 6"/></svg>'
};

/* ============================ Stockage ============================ */
/* Même principe que « Mes Séries » : IndexedDB en base principale, miroir
   localStorage écrit EN PREMIER car c'est la seule écriture synchrone —
   la seule qui aboutisse si iOS gèle l'app au moment où on la referme. */
const KEY = 'cineflix.v1';
const IDB_NAME = 'cineflix', IDB_STORE = 'kv', IDB_KEY = 'db';
let memoryOnly = false, storageKO = false;

/* Les valeurs du serveur (config.js) servent de défaut ; l'appareil peut les
   remplacer dans les réglages. Un config.js absent ne casse rien : l'app
   retombe sur la saisie manuelle de la clé, comme au premier jour. */
const CFG = Object.assign(
  { tmdbKey:'', jellyfinHosts:[], catalogue:'./cineflix.json', region:'FR', nom:'Cinéflix' },
  window.CINEFLIX || {}
);

let db = {
  pseudo:'', apiKey:'', lang:'fr-FR', region:'',
  vue:'',                   // affichage : '' grille normale, 'compacte', 'liste'
  notifs:false,             // notifications push activées sur cet appareil
  jellyfin:'',              // adresse choisie à la main ; sinon on prend celle qui répond
  catalogueUrl:'',
  cleServeur:'', catServeur:'',   // dernières valeurs vues dans config.js — voir appliquerConfig()
  items:{},                 // « movie:603 » → {type,id,titre,poster,date,fav,req}
  /* Les profils déjà connectés SUR CET APPAREIL : prénom, avatar, e-mail.
     Jamais de code. C'est cette liste — et elle seule — qui alimente la
     grille d'avatars, pour ne pas avoir à exposer les prénoms du foyer
     à qui trouverait l'adresse de l'app. */
  foyer:[],
  /* À QUI appartient le cache `items`. Un navigateur = UN stockage, partagé
     par tous les onglets : sans cette marque, le cache d'Alexandre peut être
     réécrit sous l'identité d'un compte connecté dans un autre onglet.
     Arrivé pour de vrai le 29/07. */
  itemsUid:'',
  onboarde:false, v:1
};

/* Distingue « l'utilisateur a choisi sa valeur » de « il suit celle du serveur ».
   Sans cette distinction, changer la clé dans config.js ne toucherait jamais
   ceux qui ont déjà ouvert l'app une fois — et les révoquer serait impossible. */
function appliquerConfig(){
  if(CFG.tmdbKey && (!db.apiKey || db.apiKey === db.cleServeur)) db.apiKey = CFG.tmdbKey;
  db.cleServeur = CFG.tmdbKey || '';
  if(!db.catalogueUrl || db.catalogueUrl === db.catServeur) db.catalogueUrl = CFG.catalogue;
  db.catServeur = CFG.catalogue || '';
  if(!db.region) db.region = CFG.region || 'FR';
}
const cleFournie = ()=> !!CFG.tmdbKey && db.apiKey === CFG.tmdbKey;

function idbOpen(){
  return new Promise((res,rej)=>{
    if(!self.indexedDB) return rej(new Error('no idb'));
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = ()=>{ if(!r.result.objectStoreNames.contains(IDB_STORE)) r.result.createObjectStore(IDB_STORE); };
    r.onsuccess = ()=> res(r.result);
    r.onerror = ()=> rej(r.error || new Error('idb error'));
    r.onblocked = ()=> rej(new Error('idb blocked'));
  });
}
function idbReq(mode, fn){
  return idbOpen().then(conn => new Promise((res,rej)=>{
    const tx = conn.transaction(IDB_STORE, mode);
    const rq = fn(tx.objectStore(IDB_STORE));
    rq.onsuccess = ()=> res(rq.result);
    rq.onerror = ()=> rej(rq.error);
    tx.oncomplete = ()=> conn.close();
  }));
}
const idbGet = ()=> idbReq('readonly', st => st.get(IDB_KEY));
const idbSet = v => idbReq('readwrite', st => st.put(v, IDB_KEY));

async function askPersist(){
  try{
    if(navigator.storage && navigator.storage.persist){
      if(!(await navigator.storage.persisted())) await navigator.storage.persist();
    }
  }catch(e){}
}

/* La taille des affiches est une classe sur <body> : toutes les grilles de
   l'app (Découvrir, Ma liste) suivent d'un coup, sans re-rendu. */
function appliquerVue(){
  const b = document.body;
  if(!b) return;
  if(db.vue === 'grande') db.vue = '';      // valeur d'une ancienne version
  b.classList.toggle('vue-compacte', db.vue === 'compacte');
  b.classList.toggle('vue-liste',    db.vue === 'liste');
}

async function loadDB(){
  let loaded = null;
  try{ loaded = await idbGet(); }catch(e){}
  if(!loaded){
    try{ const raw = localStorage.getItem(KEY); if(raw) loaded = JSON.parse(raw); }catch(e){}
  }
  if(loaded && typeof loaded === 'object') db = Object.assign(db, loaded);
  if(!db.items) db.items = {};
  appliquerConfig();
  appliquerVue();
  try{ await writeNow(); }
  catch(e){
    try{ localStorage.setItem(KEY, JSON.stringify(db)); }
    catch(e2){ memoryOnly = true; }
  }
}

let saveTimer = null, dirty = false;
function saveDB(){
  dirty = true;
  if(memoryOnly) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{ writeNow().catch(()=>{}); }, 150);
}
async function writeNow(){
  if(memoryOnly) return;
  const snapshot = JSON.parse(JSON.stringify(db));
  let okLS = false, okIDB = false;
  try{ localStorage.setItem(KEY, JSON.stringify(snapshot)); okLS = true; }catch(e){}
  try{ await idbSet(snapshot); okIDB = true; }catch(e){}
  if(!okLS && !okIDB){
    if(!storageKO){ storageKO = true; try{ toast('Sauvegarde impossible sur cet appareil'); }catch(e2){} }
    throw new Error('aucun stockage disponible');
  }
  storageKO = false; dirty = false;
}
function flushDB(){ if(dirty){ clearTimeout(saveTimer); writeNow().catch(()=>{}); } }

/* ---------- Deux onglets, deux comptes ----------
   Le stockage est commun à tous les onglets d'un même navigateur. Ouvrir un
   second compte dans un second onglet écrase donc la session du premier — qui
   continue pourtant de fonctionner, et écrit désormais SOUS LA MAUVAISE
   IDENTITÉ. C'est exactement ce qui s'est produit le 29/07.

   On ne peut pas cloisonner deux sessions dans un seul stockage. Ce qu'on peut
   faire, c'est refuser de mentir : l'onglet devenu obsolète se recharge. */
window.addEventListener('storage', e => {
  if(e.key !== KEY || !e.newValue) return;
  let autre = null;
  try{ autre = JSON.parse(e.newValue); }catch(x){ return; }
  const ici = (db.auth || {}).uid || '';
  const la  = ((autre || {}).auth || {}).uid || '';
  if(ici === la) return;
  try{ toast('Compte changé dans un autre onglet — rechargement'); }catch(x){}
  setTimeout(()=>{ try{ location.reload(); }catch(x){} }, 600);
});

/* Le cache local appartenait à quelqu'un d'autre : on le jette. Mieux vaut un
   écran vide une seconde que la liste de souhaits du voisin. */
function changerDIdentite(uid){
  if(db.itemsUid && uid && db.itemsUid !== uid){
    db.items = {};
    if(typeof GOUTS === 'object'){ GOUTS.d = null; GOUTS.charge = false; }
    if(typeof ui === 'object') ui.monProfil = null;
  }
  db.itemsUid = uid || '';
  saveDB();
}
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) flushDB(); });
window.addEventListener('pagehide', flushDB);
window.addEventListener('blur', flushDB);

/* ============================ TMDB ============================ */
const IMG = (p,size)=> p ? 'https://image.tmdb.org/t/p/'+size+p : '';
const isBearer = ()=> db.apiKey.startsWith('eyJ') || db.apiKey.length > 60;

async function tmdb(path, params, extra){
  if(!db.apiKey) throw new Error('NOKEY');
  const u = new URL('https://api.themoviedb.org/3'+path);
  u.searchParams.set('language', db.lang || 'fr-FR');
  for(const k in (params||{})) u.searchParams.set(k, params[k]);
  const opt = {};
  if(extra && extra.signal) opt.signal = extra.signal;
  if(isBearer()) opt.headers = { Authorization:'Bearer '+db.apiKey };
  else u.searchParams.set('api_key', db.apiKey);
  /* Sans délai maximal, un réseau qui ne répond plus laisse l'écran
     en « chargement » indéfiniment. */
  let minuteur = null;
  if(!opt.signal && typeof AbortController !== 'undefined'){
    const ctrl = new AbortController();
    opt.signal = ctrl.signal;
    minuteur = setTimeout(()=>{ try{ ctrl.abort(); }catch(e){} }, 15000);
  }
  let r;
  try{ r = await fetch(u.toString(), opt); }
  finally{ if(minuteur) clearTimeout(minuteur); }
  if(r.status === 401) throw new Error('BADKEY');
  if(r.status === 429){
    const essai = (extra && extra.essai) || 0;
    if(essai >= 3) throw new Error('TROP_DE_REQUETES');
    await sleep(1200 * (essai + 1));
    return tmdb(path, params, Object.assign({}, extra, {essai: essai + 1}));
  }
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));

/* ============================ Catalogue Cinéflix ============================ */
/* La bibliothèque du NAS, réduite à des identifiants TMDB. Un export tourne
   sur le serveur (voir outils-nas/) et dépose ce fichier à côté de l'app.
   Tout tient en mémoire : quelques milliers d'entiers, quelques dizaines de
   Ko. C'est ce qui rend le filtre « Sur Cinéflix » instantané, là où un
   service qui interroge le serveur titre par titre ne peut pas suivre. */
/* items : les fiches compactes envoyées par le NAS (nom, dates, durée,
   classification, notes, lectures). C'est ce qui permet de trier la vue
   « Cinéflix » comme Jellyfin le fait — l'app a toute la bibliothèque
   en mémoire, aucun serveur ne sait faire ce tri à sa place. */
const CAT = { movie:new Set(), tv:new Set(), items:[], maj:null, charge:false, erreur:'' };

const cle = (type,id) => type+':'+id;
const surCineflix = (type,id) => CAT[type === 'movie' ? 'movie' : 'tv'].has(Number(id));

/* Retrouver la fiche NAS d'un titre — index construit à la première demande,
   reconstruit dès que le catalogue change (la référence CAT.items bouge). */
let _fIdx = null, _fSrc = null;
function ficheDe(type, id){
  if(_fSrc !== CAT.items){
    _fSrc = CAT.items; _fIdx = new Map();
    (CAT.items||[]).forEach(i => { if(i) _fIdx.set(i.t+':'+i.id, i); });
  }
  return _fIdx.get(type+':'+Number(id)) || null;
}

/* ---------- Notes Télérama ----------
   Le NAS tient une table de notes indexée par type + titre + année. L'app la
   charge une fois et s'en sert PARTOUT — y compris sur les titres absents de
   la bibliothèque, c'est-à-dire les vues Cinéma et Plateformes. */
const TLR = { m:new Map(), charge:false };

/* Le calendrier des sorties physiques françaises (4K UHD / Blu-ray), relevé
   par le NAS. TMDB ne sait pas dire si une édition est 4K, et ses dates
   françaises sont trouées : c'est cette table qui alimente l'onglet Sorties. */
const SORTIES = { l:[], charge:false };

/* Même normalisation que le script du NAS : minuscules, accents retirés,
   on ne garde que lettres et chiffres. */
function tlrNorm(s){
  /* NFD sépare l'accent de sa lettre, et le filtre suivant — qui ne garde
     que lettres et chiffres — l'emporte avec la ponctuation et les espaces. */
  return String(s||'').toLowerCase().normalize('NFD').replace(/[^\p{L}\p{N}]/gu,'');
}
/* « 3 hommes et un couffin » chez Jellyfin, « Trois hommes… » chez TMDB :
   on cherche la note sous les deux orthographes. */
const TLR_CHIFFRES = {1:'un',2:'deux',3:'trois',4:'quatre',5:'cinq',6:'six',7:'sept',
                      8:'huit',9:'neuf',10:'dix',11:'onze',12:'douze',13:'treize',
                      15:'quinze',20:'vingt'};
function tlrVariantes(titre){
  const l = String(titre||'').replace(/\b(\d+)\b/g, m => TLR_CHIFFRES[m] || m);
  return l === titre ? [titre] : [titre, l];
}
function tlrCle(type, titre, annee){
  return type+'|'+tlrNorm(titre).slice(0,80)+'|'+(annee||'');
}
/* L'année peut différer d'un an entre Jellyfin et TMDB (tournage / sortie) :
   on regarde les années voisines plutôt que de perdre la note pour si peu. */
function noteTlr(type, titre, date){
  if(!TLR.m.size || !titre) return null;
  const a = Number(String(date||'').slice(0,4)) || 0;
  const annees = a ? [a, a-1, a+1] : [''];
  for(const t of tlrVariantes(titre))
    for(const an of annees){
      const r = TLR.m.get(tlrCle(type, t, an));
      if(r) return r;
    }
  return null;
}
/* La note d'un titre, d'où qu'il vienne : celle poussée par le NAS s'il est
   dans la bibliothèque, sinon la table des notes. */
function noteDe(type, id, titre, date){
  const f = ficheDe(type, id);
  if(f && f.jt) return f;
  return noteTlr(type, titre, date);
}

/* La note Télérama d'une fiche (jt = nombre de T, jv = verdict), dans le
   style du journal : des carrés rouges frappés d'un T. */
function tlrHtml(f, mini){
  if(!f || !f.jt) return '';
  let t = '';
  for(let i = 0; i < Math.min(4, f.jt); i++) t += '<span class="tsq">T</span>';
  return '<span class="tlr'+(mini ? ' mini' : '')+'" title="Note Télérama'+
    (f.jv ? ' — '+esc(f.jv) : '')+'">'+t+
    (f.jv && !mini ? '<span class="tverdict">'+esc(f.jv)+'</span>' : '')+'</span>';
}

/* Une demande dont le titre vient d'entrer au catalogue : on le dit tout de
   suite, en plus de la notification push envoyée par le NAS — comme ça la
   bonne nouvelle arrive aussi à ceux qui n'ont pas activé les notifications. */
function signalerArrivees(){
  let venus = [];
  try{
    venus = Object.values(db.items).filter(it =>
      it && it.req && !it.notifie && surCineflix(it.type, it.id));
  }catch(e){ return; }
  if(!venus.length) return;
  venus.forEach(it => { it.notifie = 1; });
  saveDB();
  try{
    toast(venus.length === 1
      ? 'Bonne nouvelle : « '+(venus[0].titre || 'votre demande')+' » est disponible !'
      : 'Bonne nouvelle : '+venus.length+' de vos demandes sont arrivées !');
  }catch(e){}
}

async function chargerCatalogue(){
  /* Supabase d'abord quand il est configuré : c'est là que le NAS pousse le
     catalogue, et l'app servie en HTTPS ne pourrait de toute façon pas lire un
     fichier sur le NAS en HTTP. Le fichier local reste le mode de secours. */
  if(typeof sbPret === 'function' && sbPret() && connecte()){
    try{ await catalogueDepuisSupabase(); signalerArrivees(); return; }
    catch(e){ CAT.charge = true; CAT.erreur = e.message || 'lecture impossible'; return; }
  }
  const url = db.catalogueUrl || './cineflix.json';
  try{
    const r = await fetch(url, {cache:'no-cache'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const d = await r.json();
    CAT.movie = new Set((d.movies||d.films||[]).map(Number));
    CAT.tv    = new Set((d.tv||d.series||[]).map(Number));
    CAT.items = Array.isArray(d.items) ? d.items : [];
    CAT.maj   = d.maj || d.updated || null;
    CAT.charge = true; CAT.erreur = '';
    signalerArrivees();
  }catch(e){
    CAT.charge = true;
    CAT.erreur = e.message || 'illisible';
  }
}

/* ============================ Adresse du serveur ============================ */
/* Avec Tailscale, l'adresse qui marche dépend d'où on ouvre l'app : l'IP du
   tailnet quand on y est, l'adresse publique sinon. Plutôt que d'en figer une
   qui échouera la moitié du temps, on essaie chaque candidate et on garde la
   première qui répond. */
let jellyBase = '';

function joignable(h){
  return new Promise(res=>{
    if(!h) return res(false);
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const t = setTimeout(()=>{ if(ctrl) try{ ctrl.abort(); }catch(e){} res(false); }, 2500);
    /* mode:'no-cors' — on ne lit pas la réponse, on veut seulement savoir si
       l'hôte répond. Ça évite d'exiger des en-têtes CORS côté Jellyfin, qui
       ne sont pas garantis selon l'installation. */
    fetch(String(h).replace(/\/+$/,'')+'/System/Info/Public',
          {mode:'no-cors', cache:'no-store', signal: ctrl ? ctrl.signal : undefined})
      .then(()=>{ clearTimeout(t); res(true); })
      .catch(()=>{ clearTimeout(t); res(false); });
  });
}

async function choisirJellyfin(){
  const candidats = (db.jellyfin ? [db.jellyfin] : []).concat(CFG.jellyfinHosts || []);
  for(const h of candidats){
    if(await joignable(h)){ jellyBase = String(h).replace(/\/+$/,''); return jellyBase; }
  }
  /* Aucune ne répond : on retient quand même la première, pour que le bouton
     « Regarder » ouvre quelque chose plutôt que de rester muet. */
  jellyBase = String(candidats[0] || '').replace(/\/+$/,'');
  return jellyBase;
}

/* ============================ Favoris & demandes ============================ */
/* Deux axes indépendants, jamais confondus :
     - la PRÉSENCE dans Cinéflix : un fait, identique pour tout le monde,
       qui vient du catalogue ci-dessus ;
     - mon STATUT personnel : favori, demandé, en cours, obtenu.
   Un titre demandé bascule tout seul en « obtenu » le jour où il apparaît
   dans le catalogue — personne n'a à cocher quoi que ce soit. */
const STATUTS = { fav:'Favori', demande:'Demandé', encours:'En cours', obtenu:'Sur Cinéflix', refuse:'Refusé' };

function item(type,id){ return db.items[cle(type,id)] || null; }

function fiche(o, type){
  return { type:type, id:o.id,
    titre: type === 'movie' ? (o.title || o.name) : (o.name || o.title),
    poster: o.poster_path || null,
    date: (type === 'movie' ? o.release_date : o.first_air_date) || null };
}

function assurerItem(o, type){
  const k = cle(type, o.id);
  if(!db.items[k]) db.items[k] = Object.assign(fiche(o,type), {fav:false, req:null, ajoute:Date.now()});
  else Object.assign(db.items[k], fiche(o,type));   // rafraîchit titre/affiche au passage
  return db.items[k];
}

/* Statut affichable d'un titre, source unique de vérité pour toutes les vues. */
function statut(type,id){
  if(surCineflix(type,id)) return 'obtenu';
  const it = item(type,id);
  if(!it) return null;
  if(it.req && it.req.statut) return it.req.statut;   // demande / encours / refuse
  if(it.fav) return 'fav';
  return null;
}

/* Chaque geste écrit d'abord en local — l'écran répond immédiatement — puis
   part vers le serveur. `pousser` et `retirer` ne sont définis que si Supabase
   est configuré ; sans lui, l'app fonctionne exactement comme le prototype. */
function synchroniser(it, type, id, supprime){
  if(supprime){ if(typeof retirer === 'function') retirer(type, id); }
  else        { if(typeof pousser === 'function') pousser(it); }
}

function basculerFavori(o, type){
  const it = assurerItem(o, type);
  it.fav = !it.fav;
  const orphelin = !it.fav && !it.req;
  if(orphelin) delete db.items[cle(type,o.id)];
  saveDB();
  synchroniser(it, type, o.id, orphelin);
  toast(it.fav ? 'Ajouté aux favoris' : 'Retiré des favoris');
}

function demander(o, type){
  if(surCineflix(type,o.id)) return toast('Déjà sur Cinéflix');
  const it = assurerItem(o, type);
  if(it.req) return toast('Demande déjà envoyée');
  it.req = { statut:'demande', le:Date.now() };
  saveDB();
  synchroniser(it, type, o.id, false);
  toast('Demande envoyée ✓');
}

function annulerDemande(type,id){
  const it = item(type,id);
  if(!it) return;
  it.req = null;
  const orphelin = !it.fav;
  if(orphelin) delete db.items[cle(type,id)];
  saveDB();
  synchroniser(it, type, id, orphelin);
  toast('Demande annulée');
}

const nbDemandes = ()=> Object.values(db.items)
  .filter(it => it.req && !surCineflix(it.type, it.id) &&
                (it.req.statut === 'demande' || it.req.statut === 'encours')).length;
