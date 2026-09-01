"use strict";
/* ============================ Utilitaires ============================ */
const todayISO = ()=> new Date().toISOString().slice(0,10);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const year = iso => iso ? iso.slice(0,4) : '';
const isoDecale = j => new Date(Date.now() + j*86400000).toISOString().slice(0,10);

const MOIS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const JOURS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

function fmtDate(iso){
  if(!iso) return 'Date inconnue';
  const d = new Date(iso.slice(0,10)+'T12:00:00');
  return d.getDate()+' '+MOIS[d.getMonth()]+' '+d.getFullYear();
}
function fmtDateCourt(iso){
  if(!iso) return '';
  const d = new Date(iso.slice(0,10)+'T12:00:00');
  return d.getDate()+' '+MOIS[d.getMonth()];
}
function fmtJour(iso){
  const t = todayISO();
  if(iso === t) return "Aujourd'hui";
  if(iso === isoDecale(-1)) return 'Hier';
  if(iso === isoDecale(1)) return 'Demain';
  const d = new Date(iso+'T12:00:00');
  return JOURS[d.getDay()]+' '+d.getDate()+' '+MOIS[d.getMonth()]+
         (d.getFullYear() !== new Date().getFullYear() ? ' '+d.getFullYear() : '');
}
/* « dans 3 jours », « il y a 2 semaines » — plus parlant qu'une date brute
   quand on regarde quand un film arrive. */
function relatif(iso){
  if(!iso) return '';
  const j = Math.round((Date.parse(iso.slice(0,10)+'T12:00:00') - Date.parse(todayISO()+'T12:00:00')) / 86400000);
  if(j === 0) return "aujourd'hui";
  const n = Math.abs(j), futur = j > 0;
  let q;
  if(n === 1) q = futur ? 'demain' : 'hier';
  else if(n < 7)   q = (futur?'dans ':'il y a ')+n+' jours';
  else if(n < 31)  { const s = Math.round(n/7); q = (futur?'dans ':'il y a ')+s+' semaine'+(s>1?'s':''); }
  else if(n < 365) { const m = Math.round(n/30); q = (futur?'dans ':'il y a ')+m+' mois'; }
  else             { const a = Math.round(n/365); q = (futur?'dans ':'il y a ')+a+' an'+(a>1?'s':''); }
  return q;
}
function fmtDuree(min){
  if(!min) return '—';
  const h = Math.floor(min/60), m = min%60;
  return h ? h+'h'+(m?String(m).padStart(2,'0'):'') : m+' min';
}

function posterEl(path, size, cls, alt){
  if(path) return '<img class="poster '+(cls||'')+'" loading="lazy" onerror="posterFail(this)" src="'+
    IMG(path,size)+'" alt="'+esc(alt||'')+'">';
  return '<div class="poster ph '+(cls||'')+'">'+esc((alt||'?').slice(0,20))+'</div>';
}
function posterFail(img){
  const d = document.createElement('div');
  d.className = img.className + ' ph';
  d.textContent = (img.getAttribute('alt')||'?').slice(0,20);
  img.replaceWith(d);
}

/* ============================ UI ============================ */
let toastTimer;
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
}
function openSheet(html){
  document.getElementById('sheetin').innerHTML = html;
  document.getElementById('sheet').classList.add('show');
}
function closeSheet(){ document.getElementById('sheet').classList.remove('show'); }
document.getElementById('sheet').addEventListener('click', e=>{ if(e.target.id === 'sheet') closeSheet(); });

function header(title, opts){
  opts = opts||{};
  return '<header><div class="hbar">'+
    (opts.back ? '<button class="iconbtn" onclick="'+opts.back+'">'+I.back+'</button>' : '')+
    '<div class="htitle">'+esc(title)+'</div>'+
    (opts.right||'')+ avatarBouton() +
  '</div>'+(opts.sub||'')+'</header>';
}

/* ---------- Profil, en haut à droite ----------
   Sur téléphone, Profil a quitté la barre du bas : quatre places, et il y
   occupait un quart de la zone que le pouce atteint sans effort pour un
   écran qu'on ouvre trois fois par mois. Il vit maintenant ici, dans l'EN-TÊTE
   PARTAGÉ — donc sur tous les écrans d'un coup, ce qui est la condition pour
   qu'il reste atteignable. Le bouton est éteint dans app-base et allumé par
   app-mobile : le bureau garde son onglet Profil, rien n'y change. */
/* L'avatar se lisait dans `ui.monProfil` SEUL, qui n'est rempli qu'une fois le
   profil redescendu du serveur. Au premier dessin de l'écran il était vide, le
   repli tirait alors une couleur au hasard d'un pseudo absent et affichait
   « ? » : d'où la pastille verte fluo, vue sur capture le 01/08.
   On prend maintenant, dans l'ordre : l'avatar du serveur, celui que
   l'APPAREIL garde pour cette identité (`db.foyer`, la même source que
   « Qui regarde ce soir ? »), l'initiale du pseudo, et à défaut une
   silhouette dans la palette de l'app. Jamais de point d'interrogation, et
   jamais une couleur tirée de rien. */
function avatarBouton(){
  const p = ui.monProfil || {};
  const pseudo = db.pseudo || '';
  let av = (p.avatar && p.avatar.type) ? p.avatar : null;
  if(!av && pseudo){
    const e = (db.foyer||[]).find(x => String(x.pseudo||'') === pseudo);
    if(e && e.avatar && e.avatar.type) av = e.avatar;
  }
  let dedans;
  if(typeof avatarHtml === 'function' && (av || pseudo))
    dedans = avatarHtml(av, 'avnav', pseudo);
  else
    dedans = '<span class="av avnav avvide">'+I.user+'</span>';
  return '<button class="avbtn" onclick="go(\'profil\')" aria-label="Profil">'+dedans+'</button>';
}

/* ============================ Navigation ============================ */
let view = 'decouvrir';
let params = {};
let ui = {
  presence:'tout',                       // soir | cine | tout — le filtre maison (3008b)
  disc:{ type:'movie', genres:[], tri:'sortie', sens:'desc', noteMin:0, perimetre:'tout',
         plats:[],                            // plateformes cochées (vide = toutes)
         decennie:0,                          // 0 = toutes, sinon 1920, 1930…
         origine:'eurna',                     // groupe de pays (REGIONS) — défaut Europe + Amér. du Nord
         /* NB : disc est commun aux trois vues (Cinéma / Plateformes /
            Premier Rang) — un filtre posé reste posé quand on en change. */
         page:1, pages:1, res:[], loading:false, err:'', charge:false },
  champOuvert:false, focusSearch:false,
  searchQ:'', searchRes:null, searchPers:null, searching:false, searchErr:'',
  sorties:{ mode:'bluray', res:[], loading:false, err:'', charge:false },
  listeTab:'favoris',
  cineVolet:'sorties',                   // écran Cinéma : Sorties | Suggestions | Ma vidéothèque
  sugg:{ l:[], plie:{}, loading:false, err:'', charge:false, onglet:'cat' },
  /* « Absents en 4K » (app-16) : 884 films lus une fois depuis le dépôt et
     gardés ici pour la session, avec leur titre normalisé et la liste des
     décennies dans l'ordre du fichier. */
  a4k:{ l:[], decs:[], genere:'', q:'', dec:'', page:0,
        loading:false, err:'', charge:false },
  /* Ma vidéothèque (app-15) : les trois tables sont lourdes, elles sont donc
     lues une fois et gardées ici pour toute la session. */
  vth:{ films:[], edts:[], edtsParCle:{}, corr:{}, dossiers:[], compte:null,
        filtre:'', q:'', dossier:'', page:0, ouvert:-1, qDvd:'', carte:'', carteSup:'',
        loading:false, err:'', charge:false },
  fiche:null,
  saison:null,
  auth:{ mode:'connexion', err:'', occupe:false },
  accueil:{ gere:false },                // l'écran « qui regarde ce soir ? »
  monProfil:null,                        // avatar + compte Jellyfin, lus au démarrage
  bienv:{ pas:0, err:'', occupe:false, q:'', res:[], cherche:false },
  guide:{ txt:'', recette:null, res:[], loading:false, err:'', charge:false,
          vus:{}, repli:false, source:'' }
};

const DEPTH = { auth:0, accueil:0, bienvenue:0, attente:0, decouvrir:0, sorties:0,
                liste:0, profil:0, fiche:1, reglages:1, file:1, acces:1, guide:1,
                personne:2, saison:2 };
let navDir = 'none';
/* Les vues dont on mémorise le défilement : ouvrir un titre puis revenir
   doit ramener exactement où on en était. La filmographie d'une personne
   en fait partie — elle peut faire des centaines de vignettes. */
const LISTES = { decouvrir:1, sorties:1, liste:1, personne:1, saison:1, guide:1 };
const memDefil = {};

/* « Guide-moi » est DEUX pages sous un seul nom (l'écran des envies, et
   « Par catégorie ») : elles ne se lisent pas à la même hauteur, donc elles
   ne partagent pas leur mémoire de défilement. D'où une clé, et non le seul
   nom de la vue. */
function cleDefil(v){
  return (v === 'guide' && ((ui.guide||{}).ecran === 'cat')) ? 'guide:cat' : v;
}
function noterDefil(cle){ memDefil[cle] = window.scrollY || 0; }
function rendreDefil(cle){
  const y = memDefil[cle] || 0;
  window.scrollTo(0, y);
  if(y) requestAnimationFrame(()=> window.scrollTo(0, y));
}

/* ---------- La pile de navigation (3008r) ----------
   « Revenir en arrière » ne se DEVINE plus. Jusqu'ici chaque écran déclarait
   un parent supposé — la fiche disait « je viens de Ma liste » parce qu'à
   l'époque le calendrier des sorties y vivait. Le calendrier a déménagé dans
   Cinéma, la déclaration est restée, et le retour renvoyait sur Ma liste.
   Alexandre, le 20/08 : « quand je suis dans Cinéma et que je reviens en
   arrière ça m'amène à Ma liste. C'est incohérent et de manière générale
   c'est souvent le cas. » Il a raison, et le vice est dans la méthode : une
   origine écrite à la main dans une carte devient fausse au premier
   déménagement, sans que rien ne le signale.

   On garde donc la trace de ce qu'on quitte VRAIMENT : l'écran, ses
   paramètres, la hauteur de lecture, et l'état interne qui ne tient pas dans
   le nom de la vue (la page du guide, le volet de Cinéma). Le retour rejoue
   cette trace. Les parents déclarés ne servent plus que de filet, quand la
   pile est vide — arrivée directe sur un écran profond. */
const pileNav = [];
const PILE_MAX = 25;

function etatNav(){
  return { v:view, p:params, y:window.scrollY || 0,
           ecran:((ui.guide||{}).ecran || ''), volet:(ui.cineVolet || '') };
}
function empiler(){
  /* Avant d'être entré, il n'y a rien où revenir. */
  if(view === 'auth' || view === 'accueil' || view === 'attente') return;
  const e = etatNav();
  const d = pileNav[pileNav.length - 1];
  /* Deux fois le même écran d'affilée : on met à jour, on n'empile pas —
     sinon trois retours seraient nécessaires pour quitter une page. */
  if(d && d.v === e.v && d.ecran === e.ecran &&
     JSON.stringify(d.p) === JSON.stringify(e.p)){ pileNav[pileNav.length-1] = e; return; }
  pileNav.push(e);
  if(pileNav.length > PILE_MAX) pileNav.shift();
  /* Une entrée d'historique par étage : le bouton « retour » d'Android tombe
     alors sur notre `popstate` au lieu de sortir de l'app. */
  try{ history.pushState({cf:pileNav.length}, ''); }catch(e2){}
}
/* Le vrai retour, celui que tout le monde appelle : la flèche, le balayage,
   et le geste système via popstate. */
function reculer(){
  const e = pileNav.pop();
  if(!e){
    const t = currentBack();
    if(t) go(t, {}, 'back');
    return;
  }
  if(ui.guide) ui.guide.ecran = e.ecran;
  if(e.volet)  ui.cineVolet   = e.volet;
  view = e.v; params = e.p || {};
  navDir = 'back';
  render();
  window.scrollTo(0, e.y);
  if(e.y) requestAnimationFrame(()=> window.scrollTo(0, e.y));
}

function go(v, p, dir){
  if(view === v && JSON.stringify(params) === JSON.stringify(p||{})){ window.scrollTo(0,0); render(); return; }
  if(dir !== 'back') empiler();
  if(LISTES[view]) memDefil[cleDefil(view)] = window.scrollY || 0;
  if(v === 'decouvrir' && !(ui.searchQ||'').trim()) ui.champOuvert = false;
  const a = DEPTH[view]||0, b = DEPTH[v]||0;
  navDir = dir || (b > a ? 'enter' : b < a ? 'back' : 'none');
  view = v; params = p||{};
  render();
  const y = LISTES[v] ? (memDefil[cleDefil(v)] || 0) : 0;
  window.scrollTo(0, y);
  if(y) requestAnimationFrame(()=> window.scrollTo(0, y));
}
function oublierDefil(v){ delete memDefil[v]; }

function currentBack(){
  if(view === 'personne') return ((ui.personne||{}).nav||{}).ffrom || 'decouvrir';
  if(view === 'saison')   return ((ui.saison||{}).nav||{}).ffrom   || 'decouvrir';
  if(view === 'fiche') return params.from || 'decouvrir';
  if(view === 'reglages') return params.from || 'profil';
  if(view === 'bienvenue') return db.onboarde ? 'profil' : null;
  if(view === 'file') return 'profil';
  if(view === 'acces') return 'profil';
  if(view === 'membres') return 'profil';
  if(view === 'guide') return params.from || 'decouvrir';
  return null;
}
function goBack(){
  /* Une affiche ouverte se referme AVANT tout : la flèche et le geste retour
     doivent sortir de l'image, pas de la fiche qu'on était en train de lire. */
  if(typeof afficheOuverte === 'function' && afficheOuverte()) return fermerAffiche();
  if(document.getElementById('sheet').classList.contains('show')) return closeSheet();
  /* Depuis la fiche d'une personne, on revient sur la fiche du titre qui
     l'a ouverte — ses coordonnées sont rangées dans l'état de la personne,
     et survivent donc aux allers-retours vers les films de la filmographie. */
  const navP = view === 'personne' ? ((ui.personne||{}).nav || {})
             : view === 'saison'   ? ((ui.saison||{}).nav   || {}) : null;
  if(navP && navP.fid) return ouvrirFiche(navP.fid, navP.ftype, navP.ffrom);
  /* Une entrée d'historique nous attend : on la consomme, et c'est `popstate`
     qui fera le retour. Sans quoi le geste système et la flèche se
     décaleraient l'un de l'autre, et un retour sur deux serait avalé. */
  if(pileNav.length && histoireLiee){ history.back(); return; }
  reculer();
}

/* ---------- Le bouton « retour » du téléphone (3008r) ----------
   L'app ne changeait jamais d'adresse : le geste système d'Android n'avait
   aucune entrée à dépiler et sortait de l'app — ou pire, atterrissait
   n'importe où. On pose maintenant une entrée par étage (voir `empiler`), et
   on rattrape le geste ici pour le traiter comme la flèche de l'app. Quand
   la pile est vide, on ne retient plus rien : quitter l'app est alors le
   comportement attendu. */
let histoireLiee = false;
try{
  history.replaceState({cf:0}, '');
  window.addEventListener('popstate', ()=>{
    /* Un panneau ouvert se ferme AVANT de naviguer — sinon le menu d'un écran
       reste posé sur l'écran suivant (constaté à l'audit du 20/08). La flèche
       le faisait déjà ; le geste du système, non, puisqu'il arrive ici sans
       passer par `goBack`. On remet aussitôt une entrée : une entrée
       d'historique par étage de la pile, c'est ce qui garde les deux comptes
       alignés. */
    if(typeof afficheOuverte === 'function' && afficheOuverte()){
      fermerAffiche();
      try{ history.pushState({cf:pileNav.length}, ''); }catch(e2){}
      return;
    }
    const sh = document.getElementById('sheet');
    if(sh && sh.classList.contains('show')){
      closeSheet();
      try{ history.pushState({cf:pileNav.length}, ''); }catch(e2){}
      return;
    }
    if(pileNav.length) reculer();
  });
  histoireLiee = true;
}catch(e){}

/* iOS ou iPadOS ? Le test du `platform` suffit pour l'iPhone ; l'iPad moderne
   se présente comme un Mac, d'où le second test sur le nombre de doigts. */
const surIOS = ()=> {
  try{
    const ua = navigator.userAgent || '', pf = navigator.platform || '';
    return /iPad|iPhone|iPod/.test(pf) || /iPhone|iPad|iPod/.test(ua) ||
           (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
  }catch(e){ return false; }
};

/* Balayage depuis le bord gauche : le doigt entraîne l'écran, et au
   relâchement soit on part en arrière, soit la page reprend sa place. */
(function swipeBack(){
  /* ⚠️ PAS SUR iOS (3008u). Le balayage depuis le bord gauche y est un geste
     du SYSTÈME : Safari et les apps posées sur l'écran d'accueil reculent
     d'elles-mêmes dans l'historique, et nos écouteurs sont passifs — on ne
     peut pas les en empêcher. Résultat mesuré à l'audit : un seul geste
     partait deux fois, le sien et le nôtre, et on sautait un écran. Alexandre,
     le 20/08 : « les retours en arrière sont aléatoires, surtout sur iOS. »
     C'était exactement ça. On laisse donc iOS conduire : son geste dépile une
     entrée d'historique, notre `popstate` la reçoit et rejoue la pile. */
  if(surIOS()) return;
  const SEUIL = 60, COURSE = 90;
  let x0=null, y0=null, t0=0, actif=false;
  const app = ()=> document.getElementById('app');

  function suivre(dx){
    const el = app(); if(!el) return;
    const d = Math.max(0, Math.min(dx, COURSE));
    el.style.transition = 'none';
    el.style.transform = 'translate3d('+d+'px,0,0)';
    el.style.opacity = String(1 - (d / COURSE) * 0.3);
  }
  function relacher(part){
    const el = app(); if(!el) return;
    if(part){ el.style.transition=''; el.style.transform=''; el.style.opacity=''; return; }
    el.style.transition = 'transform .22s cubic-bezier(.16,.72,.24,1), opacity .22s';
    el.style.transform = ''; el.style.opacity = '';
    setTimeout(()=>{ const e2 = app(); if(e2) e2.style.transition=''; }, 240);
  }
  document.addEventListener('touchstart', e=>{
    const t = e.touches[0];
    actif = false;
    /* Sur la pile, pas sur `currentBack()` : ce dernier ne connaît que les
       parents déclarés, et laissait le geste inerte sur Découvrir, Cinéma,
       Ma liste et Profil — alors qu'il y avait bien où revenir. */
    if(t.clientX <= 28 && (pileNav.length || currentBack())){ x0=t.clientX; y0=t.clientY; t0=Date.now(); } else x0=null;
  }, {passive:true});
  document.addEventListener('touchmove', e=>{
    if(x0===null) return;
    const t = e.touches[0];
    const dx = t.clientX-x0, dy = Math.abs(t.clientY-y0);
    if(!actif && (dy > 20 || dx < 6)){ if(dy > 20) x0 = null; return; }
    actif = true; suivre(dx);
  }, {passive:true});
  document.addEventListener('touchend', e=>{
    if(x0===null){ if(actif) relacher(false); actif=false; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX-x0, dy = Math.abs(t.clientY-y0);
    const part = dx > SEUIL && dy < 45 && Date.now()-t0 < 700;
    relacher(part);
    if(part) goBack();
    x0=null; actif=false;
  }, {passive:true});
})();

/* ============================ Rendu ============================ */
function render(){
  const app = document.getElementById('app');
  let html = '';
  if(view === 'auth')           html = viewAuth();
  else if(view === 'accueil')   html = viewAccueil();
  else if(view === 'bienvenue') html = viewBienvenue();
  else if(view === 'attente')   html = viewAttente();
  else if(view === 'acces')     html = viewAcces();
  else if(view === 'membres')   html = viewMembres();
  else if(view === 'guide')     html = viewGuide();
  else if(view === 'file')      html = viewFile();
  else if(view === 'decouvrir') html = viewDecouvrir();
  else if(view === 'sorties')   html = viewSorties();
  else if(view === 'liste')     html = viewListe();
  else if(view === 'profil')    html = viewProfil();
  else if(view === 'reglages')  html = viewReglages();
  else if(view === 'fiche')     html = viewFiche();
  else if(view === 'personne')  html = viewPersonne();
  else if(view === 'saison')    html = viewSaison();
  app.innerHTML = html;

  /* La barre du bas disparaît sur les écrans qui n'ont qu'une chose à faire :
     la mise en route, et la connexion. */
  document.body.classList.toggle('accueil',
    view === 'accueil' || view === 'auth' || view === 'bienvenue' || view === 'attente');
  app.classList.remove('enter','back');
  if(navDir === 'enter' || navDir === 'back'){
    void app.offsetWidth;
    const sens = navDir;
    app.classList.add(sens);
    app.addEventListener('animationend', function fini(){
      app.classList.remove(sens);
      app.removeEventListener('animationend', fini);
    });
  }
  navDir = 'none';
  renderNav();

  if(view === 'decouvrir'){
    const inp = document.getElementById('q');
    if(inp && ui.focusSearch){ inp.focus(); ui.focusSearch = false; }
    if(!ui.disc.charge && !ui.disc.loading && db.apiKey) chargerDecouverte();
  }
  if(view === 'sorties' && !ui.sorties.charge && !ui.sorties.loading && db.apiKey) chargerSorties();
  /* L'accordéon « Par catégorie » a une rangée de films qui défile du doigt :
     revenir doit la retrouver où elle était, pas la ramener au premier film. */
  if(view === 'guide' && typeof restaurerDefilCat === 'function') restaurerDefilCat();
  /* L'écran Cinéma porte les Sorties ET les Suggestions (3008p) : y revenir
     doit relancer le chargement qui manque, selon le volet ouvert. */
  if(view === 'sorties' && ui.cineVolet === 'sugg' && ui.sugg.onglet === 'cat' &&
     !ui.sugg.charge && !ui.sugg.loading)
    chargerSuggestions();
  if(view === 'sorties' && ui.cineVolet === 'sugg' && ui.sugg.onglet === 'q4k' &&
     !ui.a4k.charge && !ui.a4k.loading)
    chargerAbsents4k();
  if(view === 'sorties' && ui.cineVolet === 'vth' && !ui.vth.charge && !ui.vth.loading)
    chargerVideotheque();
}

/* La page principale est une COUVERTURE (le grand visuel, rien d'autre) ;
   le catalogue — les trois sources, les filtres, la grille — vit derrière
   l'onglet Films ou Séries. C'est le découpage demandé par Alexandre :
   « je veux qu'on laisse le grand visuel en page principale ». */
function go2Decouvrir(){
  ui.exploration = false;
  if(view === 'decouvrir') render(); else go('decouvrir');
}
function ouvrirCatalogue(t){
  ui.exploration = true;
  if(ui.disc.type !== t){
    ui.disc.type = t;
    ui.disc.page = 1; ui.disc.charge = false; ui.disc.res = [];
  }
  if(view === 'decouvrir') render(); else go('decouvrir');
  if(!ui.disc.charge && !ui.disc.loading && db.apiKey) chargerDecouverte();
}

function renderNav(){
  const n = nbDemandes();
  const depuis = params.from === 'file' ? 'profil'
    : params.from === 'guide' ? 'decouvrir'
    : (params.from || (view === 'personne' ? ((ui.personne||{}).nav||{}).ffrom : ''));
  const cur = (view === 'fiche' || view === 'personne') ? (depuis || 'decouvrir')
            : (view === 'reglages' || view === 'file' || view === 'acces' ||
               view === 'membres') ? 'profil'
            : view;
  const exp = !!ui.exploration;

  /* Films et Séries n'existent que sur le bureau (classe dsk) : la barre du
     bas d'un téléphone n'a que quatre places, et la couverture y propose ses
     propres entrées. La typo des liens est celle de la maquette — pas de
     majuscules forcées, pas de soulignement. */
  /* Guide-moi prend la place laissée par Profil, et se range juste après
     Découvrir : les deux répondent à la même question — qu'est-ce que je
     regarde ce soir. La classe `tel` est l'inverse de `dsk` : allumée par
     app-mobile seulement, elle laisse la barre du bureau intacte. */
  /* `emo` : la version émoji, colorée, des icônes — celle de la maquette
     validée. Le bureau garde ses traits monochromes (`ic`) : app-base cache
     .icemo, app-mobile inverse les deux (3007z). */
  const items = [
    { cl:'t-decouvrir', on: cur === 'decouvrir' && !exp, act:'go2Decouvrir()',
      ic:I.boussole, emo:'🧭', lab:'Découvrir' },
    { cl:'t-guide tel', on: cur === 'guide', act:'allerGuide()',
      ic:I.etincelle, emo:'✨', lab:'Guide-moi' },
    { cl:'t-films dsk', on: cur === 'decouvrir' && exp && ui.disc.type === 'movie',
      act:"ouvrirCatalogue('movie')", ic:'', lab:'Films' },
    { cl:'t-series dsk', on: cur === 'decouvrir' && exp && ui.disc.type === 'tv',
      act:"ouvrirCatalogue('tv')", ic:'', lab:'Séries' },
    /* Le quatrième onglet, demandé le 20/08 : les sorties et les suggestions
       réunies sous le nom qui les rassemble. Il remplace l'onglet Sorties du
       bureau — même écran, même vue `sorties`, un titre plus large.

       ⚠️ Sa place dans CE tableau est celle qu'avait Sorties, et elle ne doit
       pas bouger : la feuille du bureau accroche `t-sorties` (marge
       automatique qui pousse la fin de barre à droite, icône seule) et
       app-site.css ne s'édite pas depuis cette conversation. Sur téléphone,
       Alexandre veut le cœur en 3 et Cinéma en 4 : c'est app-mobile.css qui
       intervertit les deux, avec `order`. */
    { cl:'t-sorties t-cinema', on: cur === 'sorties', act:"allerCinema()",
      ic:I.cal, emo:'🎬', lab:'Cinéma' },
    /* « Ma liste » reprend son nom (3008p) : le volet qui le portait en
       double est parti dans Cinéma. */
    { cl:'t-liste', on: cur === 'liste', act:"go('liste')", ic:I.coeur, emo:'❤️', lab:'Ma liste', badge:n },
    { cl:'t-profil', on: cur === 'profil', act:"go('profil')", ic:I.user, lab:'Profil' }
  ];
  document.getElementById('nav').innerHTML =
    '<button class="navlogo" onclick="go2Decouvrir()">Premier Rang</button>' +
    items.map(t=>'<button class="tab '+t.cl+(t.on ? ' on' : '')+'" onclick="'+t.act+'">'+
      (t.emo ? '<span class="icsvg">'+t.ic+'</span><span class="icemo">'+t.emo+'</span>' : t.ic)+
      (t.badge ? '<span class="pastille-nav">'+t.badge+'</span>' : '')+
      '<span>'+t.lab+'</span></button>').join('');

  /* La couverture veut une barre transparente : l'image file jusqu'en haut. */
  try{
    document.body.classList.toggle('couverture',
      view === 'decouvrir' && !exp && !ui.champOuvert && !enRecherche());
  }catch(e){}
}


function banniereCle(){
  if(db.apiKey) return '';
  return '<div class="banner">Ajoute ta clé TMDB dans <b>Profil → Réglages</b> pour voir le catalogue.</div>';
}
/* Le catalogue absent n'est pas une erreur bloquante : l'app reste utilisable,
   on prévient simplement que la distinction « sur Premier Rang » ne marche pas. */
function banniereCatalogue(){
  if(!CAT.erreur) return '';
  return '<div class="banner"><b>Catalogue Premier Rang introuvable.</b><br>'+
    'Impossible de savoir ce qui est déjà sur le serveur. Vérifie l\'adresse du '+
    'catalogue dans les réglages.</div>';
}
