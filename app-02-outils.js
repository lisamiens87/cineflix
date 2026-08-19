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
  presence:'tout',                       // tout | dispo — le filtre maison
  disc:{ type:'movie', genres:[], tri:'sortie', sens:'desc', noteMin:0, perimetre:'tout',
         plats:[],                            // plateformes cochées (vide = toutes)
         decennie:0,                          // 0 = toutes, sinon 1920, 1930…
         origine:'eurna',                     // groupe de pays (REGIONS) — défaut Europe + Amér. du Nord
         /* NB : disc est commun aux trois vues (Cinéma / Plateformes /
            Cinéflix) — un filtre posé reste posé quand on en change. */
         page:1, pages:1, res:[], loading:false, err:'', charge:false },
  champOuvert:false, focusSearch:false,
  searchQ:'', searchRes:null, searchPers:null, searching:false, searchErr:'',
  sorties:{ mode:'bluray', res:[], loading:false, err:'', charge:false },
  listeTab:'favoris',
  listeVolet:'liste',                    // Ma liste | Sorties | Suggestions (3007y)
  sugg:{ l:[], plie:{}, loading:false, err:'', charge:false },
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
const LISTES = { decouvrir:1, sorties:1, liste:1, personne:1, saison:1 };
const memDefil = {};

function go(v, p, dir){
  if(view === v && JSON.stringify(params) === JSON.stringify(p||{})){ window.scrollTo(0,0); render(); return; }
  if(LISTES[view]) memDefil[view] = window.scrollY || 0;
  if(v === 'decouvrir' && !(ui.searchQ||'').trim()) ui.champOuvert = false;
  const a = DEPTH[view]||0, b = DEPTH[v]||0;
  navDir = dir || (b > a ? 'enter' : b < a ? 'back' : 'none');
  view = v; params = p||{};
  render();
  const y = LISTES[v] ? (memDefil[v] || 0) : 0;
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
  if(view === 'guide') return params.from || 'decouvrir';
  return null;
}
function goBack(){
  if(document.getElementById('sheet').classList.contains('show')) return closeSheet();
  /* Depuis la fiche d'une personne, on revient sur la fiche du titre qui
     l'a ouverte — ses coordonnées sont rangées dans l'état de la personne,
     et survivent donc aux allers-retours vers les films de la filmographie. */
  const navP = view === 'personne' ? ((ui.personne||{}).nav || {})
             : view === 'saison'   ? ((ui.saison||{}).nav   || {}) : null;
  if(navP && navP.fid) return ouvrirFiche(navP.fid, navP.ftype, navP.ffrom);
  const t = currentBack();
  if(t) go(t, {}, 'back');
}

/* Balayage depuis le bord gauche : le doigt entraîne l'écran, et au
   relâchement soit on part en arrière, soit la page reprend sa place. */
(function swipeBack(){
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
    if(t.clientX <= 28 && currentBack()){ x0=t.clientX; y0=t.clientY; t0=Date.now(); } else x0=null;
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
  /* Ma liste porte désormais les volets Sorties et Suggestions (3007y) :
     revenir sur l'écran doit relancer le chargement qui manque. */
  if(view === 'liste'){
    if(ui.listeVolet === 'sorties' && !ui.sorties.charge && !ui.sorties.loading && db.apiKey) chargerSorties();
    if(ui.listeVolet === 'sugg' && !ui.sugg.charge && !ui.sugg.loading) chargerSuggestions();
  }
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
            : (view === 'reglages' || view === 'file' || view === 'acces') ? 'profil'
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
  const items = [
    { cl:'t-decouvrir', on: cur === 'decouvrir' && !exp, act:'go2Decouvrir()',
      ic:I.boussole, lab:'Découvrir' },
    { cl:'t-guide tel', on: cur === 'guide', act:'allerGuide()',
      ic:I.etincelle, lab:'Guide-moi' },
    { cl:'t-films dsk', on: cur === 'decouvrir' && exp && ui.disc.type === 'movie',
      act:"ouvrirCatalogue('movie')", ic:'', lab:'Films' },
    { cl:'t-series dsk', on: cur === 'decouvrir' && exp && ui.disc.type === 'tv',
      act:"ouvrirCatalogue('tv')", ic:'', lab:'Séries' },
    /* Sorties a rejoint Ma liste sur téléphone (volet, 3007y) : l'onglet ne
       subsiste que sur le bureau — la classe dsk le retire de la barre. */
    { cl:'t-sorties dsk', on: cur === 'sorties', act:"go('sorties')", ic:I.cal, lab:'Sorties' },
    { cl:'t-liste', on: cur === 'liste', act:"go('liste')", ic:I.coeur, lab:'Ma liste', badge:n },
    { cl:'t-profil', on: cur === 'profil', act:"go('profil')", ic:I.user, lab:'Profil' }
  ];
  document.getElementById('nav').innerHTML =
    '<button class="navlogo" onclick="go2Decouvrir()">CINÉ<i>FLIX</i></button>' +
    items.map(t=>'<button class="tab '+t.cl+(t.on ? ' on' : '')+'" onclick="'+t.act+'">'+t.ic+
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
   on prévient simplement que la distinction « sur Cinéflix » ne marche pas. */
function banniereCatalogue(){
  if(!CAT.erreur) return '';
  return '<div class="banner"><b>Catalogue Cinéflix introuvable.</b><br>'+
    'Impossible de savoir ce qui est déjà sur le serveur. Vérifie l\'adresse du '+
    'catalogue dans les réglages.</div>';
}
