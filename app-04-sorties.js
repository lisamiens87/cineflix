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
  { id:'bluray',  label:'Blu-ray / 4K', type:TYPE_PHYS, icone:'disque',
    titre:'Sorties physiques', avant:-21, apres:260 }
];
const modeCourant = ()=> MODES.find(m=>m.id === ui.sorties.mode) || MODES[2];
let sortiesSeq = 0;

async function chargerSorties(){
  const s = ui.sorties, m = modeCourant();
  /* Sorties physiques : le NAS relève le calendrier français (4K UHD /
     Blu-ray, édition, prix) — bien plus complet et plus précis que le type 5
     de TMDB, qui ignore le 4K et oublie la moitié des sorties françaises.
     Aucune requête réseau ici : la liste arrive avec le catalogue. */
  if(m.id === 'bluray' && SORTIES.charge && SORTIES.l.length){
    const gte = isoDecale(m.avant), lte = isoDecale(m.apres);
    s.res = SORTIES.l
      .filter(x => x.date && x.date >= gte && x.date <= lte)
      .map(x => ({ quand:x.date, source:'FR', disque:x,
                   film:{ id:x.tmdb_id || null, title:x.titre || x.vo || '',
                          poster_path:x.poster || '' } }))
      .sort((a,b) => a.quand.localeCompare(b.quand) ||
                     (a.film.title||'').localeCompare(b.film.title||'', 'fr'));
    s.loading = false; s.charge = true; s.err = '';
    render();
    return;
  }
  if(!db.apiKey){ toast('Ajoute ta clé TMDB dans les réglages');
    return go('reglages', {from: view === 'liste' ? 'liste' : 'sorties'}); }
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

/* ---------- La grille d'affiches (volet Sorties de « Pour moi ») ----------
   Maquette validée par Alexandre le 19/08 (3008d) : fini les petites lignes
   datées — la même grille d'affiches que Favoris, groupée par mois. La date
   vit en badge sur l'affiche (suivie de « 4K » quand l'édition l'est), le
   prix et l'édition dessous. Le bureau, lui, garde sa liste (corpsSorties). */
const MOIS_PLEIN = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet',
                    'Août','Septembre','Octobre','Novembre','Décembre'];
function carteSortie(x){
  const r = x.film, d2 = x.disque;
  const chez = r.id && surCineflix('movie', r.id);
  const sous = d2
    ? [d2.prix ? d2.prix+' €' : '', d2.edition || ''].filter(Boolean).join(' · ')
    : relatif(x.quand);
  const corps = '<div class="wrapimg">'+posterEl(r.poster_path,'w342','',r.title||'')+
      '<div class="sgdate">'+esc(fmtDateCourt(x.quand))+
        (d2 && d2.uhd ? ' · 4K' : '')+'</div>'+
      (chez ? '<div class="tag dispo mini" aria-label="Sur Cinéflix">'+I.check+'</div>' : '')+
    '</div>'+
    '<div class="gname">'+esc(r.title||'')+'</div>'+
    '<div class="gyear">'+esc(sous)+'</div>';
  return r.id
    ? '<button class="gcard" onclick="ouvrirFiche('+r.id+',\'movie\',\'liste\')">'+corps+'</button>'
    : '<div class="gcard inerte">'+corps+'</div>';
}
function corpsSortiesGrille(){
  const s = ui.sorties;
  if(s.loading)
    return '<div class="empty"><span class="spin"></span>'+
      '<p style="margin-top:12px">Lecture des dates de sortie…</p></div>';
  if(s.err)
    return '<div class="empty">'+I.cal+'<h3>'+esc(s.err)+'</h3>'+
      '<p>Vérifie ta connexion, puis réessaie.</p>'+
      '<button class="btn ghost" onclick="chargerSorties()">Réessayer</button></div>';
  if(!s.res.length)
    return '<div class="empty">'+I.cal+'<h3>Aucune date annoncée</h3>'+
      '<p>Rien de notable sur cette période pour ce type de sortie.</p></div>';

  const t = todayISO();
  const venir  = s.res.filter(x => x.quand >= t);
  const passes = s.res.filter(x => x.quand < t).slice().reverse();
  let html = '', mois = '';
  venir.forEach(x=>{
    const km = String(x.quand).slice(0,7);
    if(km !== mois){
      if(mois) html += '</div>';
      mois = km;
      const dte = new Date(x.quand+'T12:00:00');
      html += '<div class="sectitle">'+MOIS_PLEIN[dte.getMonth()]+
        (dte.getFullYear() !== new Date().getFullYear() ? ' '+dte.getFullYear() : '')+
        '</div><div class="pgrid">';
    }
    html += carteSortie(x);
  });
  if(mois) html += '</div>';
  if(passes.length)
    html += '<div class="sectitle">Déjà sorti<span class="cnt">'+passes.length+'</span></div>'+
      '<div class="pgrid">'+passes.map(carteSortie).join('')+'</div>';
  const m = modeCourant();
  const source = (m.id === 'bluray' && s.res.length && s.res[0].disque)
    ? 'Calendrier des sorties physiques françaises (4k-ultra-hd.fr), affiches et fiches TMDB.'
    : 'Dates fournies par TMDB, région '+esc(db.region||'FR')+'.';
  return html + '<div class="credit">'+source+'</div><div style="height:24px"></div>';
}

/* Les pastilles de mode (salle / numérique / physique), servies telles
   quelles à la vue Sorties du bureau et au volet Sorties de Ma liste. */
function chipsModes(sous){
  return '<div class="chips'+(sous ? ' souschips' : '')+'">'+MODES.map(x=>
    '<button class="chip '+(ui.sorties.mode===x.id?'on':'')+'" onclick="setMode(\''+x.id+'\')">'+
    x.label+'</button>').join('')+'</div>';
}

function viewSorties(){
  let html = header('Sorties', {sub:chipsModes(false)}) + banniereCle();
  return html + corpsSorties();
}

/* Le corps seul — chargement, erreur, calendrier — sans en-tête ni
   pastilles : Ma liste l'affiche sous ses propres volets (3007y). */
function corpsSorties(){
  const s = ui.sorties, m = modeCourant();
  let html = '';

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
  const source = (m.id === 'bluray' && s.res.length && s.res[0].disque)
    ? 'Calendrier des sorties physiques françaises (4k-ultra-hd.fr), '+
      'affiches et fiches TMDB.'
    : 'Dates fournies par TMDB, région '+esc(db.region||'FR')+
      ' (repli États-Unis quand la France n\'est pas renseignée).';
  return html + '<div class="credit">'+source+'</div>'+
    '<div style="height:24px"></div>';
}

function ligneSortie(x, m){
  const r = x.film, d = x.disque;
  const st = r.id ? statut('movie', r.id) : null;
  let marque = '';
  if(st === 'obtenu')       marque = '<span class="pastille dispo">'+I.check+' Sur Cinéflix</span>';
  else if(st === 'demande') marque = '<span class="pastille demande">'+I.horloge+' Demandé</span>';
  else if(st === 'encours') marque = '<span class="pastille encours">'+I.horloge+' En cours</span>';
  else if(st === 'fav')     marque = '<span class="pastille encours">'+I.coeurPlein+' Favori</span>';

  /* Sur une sortie disque, la deuxième ligne dit ce qui compte pour décider :
     quand, quelle édition, à quel prix. */
  const sous = d
    ? esc(relatif(x.quand)) + (d.edition ? ' · '+esc(d.edition) : '') +
      (d.prix ? ' · '+esc(d.prix)+' €' : '')
    : esc(relatif(x.quand)) +
      (x.source && x.source !== (db.region||'FR') ? ' · date '+esc(x.source) : '');

  const corps =
    (r.poster_path
      ? '<img class="cposter" loading="lazy" src="'+IMG(r.poster_path,'w154')+'" alt="">'
      : '<div class="cposter"></div>')+
    '<div class="cinfo">'+
      '<div class="cname2">'+esc(r.title||'')+
        (d && d.uhd ? ' <span class="b4k">4K</span>' : '')+
        /* La coche verte suit le titre partout : ici aussi, on voit d'un
           coup d'œil ce qui est déjà sur le serveur. */
        (r.id && surCineflix('movie', r.id)
          ? ' <span class="cfx" aria-label="Sur Cinéflix">'+I.check+'</span>' : '')+
      '</div>'+
      '<div class="csub">'+sous+'</div>'+
      marque+
    '</div>';

  /* Une sortie que TMDB n'a pas su identifier reste au calendrier — elle ne
     mène simplement nulle part. Le retour de la fiche revient là d'où l'on
     vient : la vue Sorties du bureau, ou le volet Sorties de Ma liste. */
  const de = (view === 'liste') ? 'liste' : 'sorties';
  return r.id
    ? '<button class="crow" onclick="ouvrirFiche('+r.id+',\'movie\',\''+de+'\')">'+corps+'</button>'
    : '<div class="crow inerte">'+corps+'</div>';
}
