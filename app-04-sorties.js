"use strict";
/* ============================ Dates de sortie ============================ */
/* TMDB range les dates par pays et par type :
     1 première · 2 sortie limitée · 3 salle · 4 numérique · 5 physique · 6 TV
   C'est la donnée que ni Jellyseerr ni Jellyfin n'exposent, et c'est elle
   qui répond à la seule question qui compte ici : « quand est-ce que je
   peux espérer l'avoir ? ». On cherche d'abord la France ; à défaut on
   retombe sur les États-Unis, en le disant clairement. */

const TYPE_SALLE = 3, TYPE_NUM = 4, TYPE_PHYS = 5;
const cacheDates = {};                      // id film → {3,4,5,source}

function extraireDates(resultats, region){
  const parPays = {};
  (resultats||[]).forEach(p => { parPays[p.iso_3166_1] = p.release_dates || []; });
  const ordre = [region || 'FR', 'US'].concat(Object.keys(parPays));
  for(const pays of ordre){
    const l = parPays[pays];
    if(!l || !l.length) continue;
    const out = { source: pays };
    let trouve = false;
    l.forEach(e=>{
      const t = e.type;
      if(t !== TYPE_SALLE && t !== TYPE_NUM && t !== TYPE_PHYS && t !== 2) return;
      const k = (t === 2) ? TYPE_SALLE : t;          // sortie limitée = salle
      const iso = (e.release_date||'').slice(0,10);
      if(!iso) return;
      /* Pour un même type, on garde la date la plus précoce : c'est celle à
         laquelle le film devient réellement accessible. */
      if(!out[k] || iso < out[k]) out[k] = iso;
      trouve = true;
    });
    if(trouve) return out;
  }
  return { source:null };
}

async function datesFilm(id){
  if(cacheDates[id]) return cacheDates[id];
  try{
    const d = await tmdb('/movie/'+id+'/release_dates');
    cacheDates[id] = extraireDates(d.results, db.region);
  }catch(e){ cacheDates[id] = { source:null }; }
  return cacheDates[id];
}

/* Résout N films en parallèle, mais pas tous à la fois : TMDB coupe au-delà
   d'une cinquantaine de requêtes par seconde, et le téléphone n'aime pas
   quarante connexions simultanées. */
async function enLots(liste, taille, fn){
  const out = [];
  for(let i=0;i<liste.length;i+=taille){
    out.push(...await Promise.all(liste.slice(i,i+taille).map(fn)));
  }
  return out;
}

/* ============================ Vue : Sorties ============================ */
const MODES = [
  { id:'cine',    label:'Au cinéma',  type:TYPE_SALLE, icone:'salle',
    titre:'Sorties en salle',  avant:-10, apres:45 },
  { id:'numerique', label:'Numérique', type:TYPE_NUM,  icone:'nuage',
    titre:'Sorties numériques', avant:-21, apres:60 },
  { id:'bluray',  label:'Blu-ray / DVD', type:TYPE_PHYS, icone:'disque',
    titre:'Sorties physiques', avant:-21, apres:90 }
];
const modeCourant = ()=> MODES.find(m=>m.id === ui.sorties.mode) || MODES[2];
let sortiesSeq = 0;

async function chargerSorties(){
  const s = ui.sorties, m = modeCourant();
  if(!db.apiKey){ toast('Ajoute ta clé TMDB dans les réglages'); return go('reglages', {from:'sorties'}); }
  const seq = ++sortiesSeq;
  s.loading = true; s.err = ''; s.res = [];
  render();
  try{
    const gte = isoDecale(m.avant), lte = isoDecale(m.apres);
    /* Deux pages de candidats, triés par popularité : un calendrier
       exhaustif de toutes les sorties physiques mondiales serait illisible. */
    const pages = await Promise.all([1,2].map(p => tmdb('/discover/movie', {
      region: db.region || 'FR', with_release_type: String(m.type),
      'release_date.gte': gte, 'release_date.lte': lte,
      sort_by:'popularity.desc', include_adult:'false', page:String(p)
    })));
    if(seq !== sortiesSeq) return;
    const cands = pages.flatMap(p => p.results||[]).filter(r => r.poster_path);

    /* La date renvoyée par /discover est la sortie principale (la salle) :
       pour dater vraiment le Blu-ray il faut interroger chaque film. */
    const enrichis = await enLots(cands, 6, async r => {
      const d = await datesFilm(r.id);
      return { film:r, quand: d[m.type] || null, source: d.source };
    });
    if(seq !== sortiesSeq) return;

    s.res = enrichis
      .filter(x => x.quand && x.quand >= gte && x.quand <= lte)
      .sort((a,b)=> a.quand.localeCompare(b.quand));
    s.loading = false; s.charge = true;
    render();
  }catch(e){
    if(seq !== sortiesSeq) return;
    s.loading = false; s.charge = true;
    s.err = (e.message === 'BADKEY') ? 'Clé TMDB refusée' : 'Pas de connexion';
    render();
  }
}

function setMode(id){
  if(ui.sorties.mode === id) return;
  ui.sorties.mode = id;
  ui.sorties.charge = false;
  oublierDefil('sorties');
  window.scrollTo(0,0);
  chargerSorties();
}

function viewSorties(){
  const s = ui.sorties, m = modeCourant();
  const sub = '<div class="chips">'+MODES.map(x=>
    '<button class="chip '+(s.mode===x.id?'on':'')+'" onclick="setMode(\''+x.id+'\')">'+
    x.label+'</button>').join('')+'</div>';

  let html = header('Sorties', {sub:sub}) + banniereCle();

  if(s.loading)
    return html + '<div class="empty"><span class="spin"></span>'+
      '<p style="margin-top:12px">Lecture des dates de sortie…</p></div>';
  if(s.err)
    return html + '<div class="empty">'+I.cal+'<h3>'+esc(s.err)+'</h3>'+
      '<p>Vérifie ta connexion, puis réessaie.</p>'+
      '<button class="btn ghost" onclick="chargerSorties()">Réessayer</button></div>';
  if(!s.res.length)
    return html + '<div class="empty">'+I.cal+'<h3>Aucune date annoncée</h3>'+
      '<p>Rien de notable sur cette période pour ce type de sortie.</p></div>';

  const t = todayISO();
  const passes = s.res.filter(x => x.quand < t);
  const venir  = s.res.filter(x => x.quand >= t);

  const bloc = (liste, passe)=>{
    let out = '<div class="day">', cur = '';
    liste.forEach(x=>{
      if(x.quand !== cur){
        cur = x.quand;
        out += '<div class="daylbl'+(passe?' past':'')+'">'+fmtJour(cur)+'</div>';
      }
      out += ligneSortie(x, m);
    });
    return out + '</div>';
  };

  if(venir.length){
    html += '<div class="sectitle">À venir<span class="cnt">'+venir.length+'</span></div>' + bloc(venir, false);
  }
  if(passes.length){
    html += '<div class="sectitle">Déjà sorti<span class="cnt">'+passes.length+'</span></div>' +
            bloc(passes.slice().reverse(), true);
  }
  return html + '<div class="credit">Dates fournies par TMDB, région '+
    esc(db.region||'FR')+' (repli États-Unis quand la France n\'est pas renseignée).</div>'+
    '<div style="height:24px"></div>';
}

function ligneSortie(x, m){
  const r = x.film;
  const st = statut('movie', r.id);
  const dispo = st === 'obtenu';
  let marque = '';
  if(dispo)                 marque = '<span class="pastille dispo">'+I.check+' Sur Cinéflix</span>';
  else if(st === 'demande') marque = '<span class="pastille demande">'+I.horloge+' Demandé</span>';
  else if(st === 'encours') marque = '<span class="pastille encours">'+I.horloge+' En cours</span>';
  else if(st === 'fav')     marque = '<span class="pastille encours">'+I.coeurPlein+' Favori</span>';

  return '<button class="crow" onclick="ouvrirFiche('+r.id+',\'movie\',\'sorties\')">'+
    (r.poster_path
      ? '<img class="cposter" loading="lazy" src="'+IMG(r.poster_path,'w154')+'" alt="">'
      : '<div class="cposter"></div>')+
    '<div class="cinfo">'+
      '<div class="cname2">'+esc(r.title||'')+'</div>'+
      '<div class="csub">'+esc(relatif(x.quand))+
        (x.source && x.source !== (db.region||'FR') ? ' · date '+esc(x.source) : '')+'</div>'+
      marque+
    '</div>'+
  '</button>';
}
