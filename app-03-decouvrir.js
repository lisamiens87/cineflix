"use strict";
/* ============================ Découvrir ============================ */

const TYPES = [ {id:'movie', label:'Films'}, {id:'tv', label:'Séries'} ];

/* Les deux puces qui n'existent nulle part ailleurs : le même catalogue,
   vu selon qu'on possède le titre ou non. « Tous les films » (ou « Toutes
   les séries ») montre tout TMDB, « Cinéflix » ne garde que la bibliothèque.
   Il y a eu une troisième puce, « Pas encore » (l'inverse de Cinéflix) :
   retirée — dans « tous les films », la pastille suffit à distinguer. */
const PRESENCES = [
  { id:'tout' },                            // label calculé selon le type
  { id:'dispo', label:'Cinéflix', pt:'ok' }
];
const labelTout = ()=> ui.disc.type === 'movie' ? 'Tous les films' : 'Toutes les séries';

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
const PERIMETRES = [
  { id:'tout',   label:'Tout le catalogue', court:'tout le catalogue' },
  { id:'recent', label:'Sortis récemment',  court:'sorties récentes' }
];
const NOTES = [ {v:0,label:'Toutes'}, {v:6,label:'6 et +'}, {v:7,label:'7 et +'}, {v:8,label:'8 et +'} ];
const FENETRE = 120;                 // « récemment » = les 120 derniers jours

const genresTMDB = { movie:null, tv:null };
let discSeq = 0;

const CIBLE_GRILLE = 24;             // combien de vignettes on vise par chargement
const MAX_PAGES_PAR_TOUR = 6;        // garde-fou quand le filtre laisse peu de résultats

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
  const p = { include_adult:'false', page:String(d.page), region: db.region || 'FR' };
  const ids = d.genres.map(n => genreParNom(type, n)).filter(x => x != null);
  if(ids.length) p.with_genres = ids.join(',');

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
  return p;
}

/* Le filtre de présence s'applique côté client : le catalogue est en mémoire,
   TMDB n'a évidemment aucune idée de ce qu'il y a sur le NAS. Conséquence :
   une page TMDB peut ne rien donner après filtrage, donc on enchaîne les
   pages jusqu'à remplir la grille — sinon l'utilisateur voit trois vignettes
   et croit que sa bibliothèque est vide. */
function garderPresence(liste, type){
  if(ui.presence === 'tout') return liste;
  const veutDispo = ui.presence === 'dispo';
  return liste.filter(r => surCineflix(type, r.id) === veutDispo);
}

async function chargerDecouverte(suite){
  const d = ui.disc;
  if(!db.apiKey){ toast('Ajoute ta clé TMDB dans les réglages'); return go('reglages', {from:'decouvrir'}); }
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
    ui.searchRes = null; ui.searching = false; ui.searchErr = '';
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
  ui.searchQ = ''; ui.searchRes = null; ui.searching = false; ui.searchErr = '';
  render();
}
async function runSearch(q){
  if(!db.apiKey){ ui.searching = false; peindre(); return go('reglages', {from:'decouvrir'}); }
  const seq = ++searchSeq;
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  searchAbort = ctrl;
  try{
    const d = await tmdb('/search/'+ui.disc.type, {query:q, include_adult:'false'},
                         ctrl ? {signal:ctrl.signal} : null);
    if(seq !== searchSeq) return;
    /* La recherche par titre ignore volontairement le filtre de présence :
       quand on cherche un film précis, on veut le trouver, et c'est la
       pastille qui répond à « est-ce que je l'ai ? ». */
    ui.searchRes = (d.results||[]).slice(0, SEARCH_MAX);
    ui.searching = false; ui.searchErr = '';
    peindre();
  }catch(e){
    if((e && e.name === 'AbortError') || seq !== searchSeq) return;
    ui.searching = false;
    ui.searchErr = (e.message === 'BADKEY') ? 'Clé TMDB refusée' : 'Pas de connexion';
    ui.searchRes = [];
    peindre();
  }
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

  const sous = st === 'obtenu'  ? '<div class="gsub dispo">À regarder maintenant</div>'
             : st === 'demande' ? '<div class="gsub demande">Demandé</div>'
             : st === 'encours' ? '<div class="gsub encours">En cours</div>'
             : '';

  return '<button class="gcard" onclick="ouvrirFiche('+r.id+',\''+type+'\')">'+
    '<div class="wrapimg">'+ posterEl(r.poster_path,'w342','',titre) + tag +
      (note ? '<div class="gnote">'+I.star+note.toFixed(1)+'</div>' : '')+
    '</div>'+
    '<div class="gname">'+esc(titre)+'</div>'+
    '<div class="gyear">'+esc(year(date))+'</div>'+ sous +
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
  if(!ui.searchRes || !ui.searchRes.length)
    return '<div class="empty"><h3>Rien trouvé</h3>'+
      '<p>Essaie une autre orthographe, ou change de type juste au-dessus.</p></div>';
  return '<div class="grid">'+ui.searchRes.map(r=>carteTitre(r, ui.disc.type)).join('')+'</div>';
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
  render();
  if(!enRecherche()) chargerDecouverte();
}
function setVue(v){
  db.vue = v; saveDB();
  appliquerVue();
  ouvrirFiltres();          // redessine la feuille, la grille suit toute seule (CSS)
}
function setTri(t){ ui.disc.tri = t; ouvrirFiltres(); chargerDecouverte(); }
function setSens(s){ ui.disc.sens = s; ouvrirFiltres(); chargerDecouverte(); }
function setPerimetre(p){ ui.disc.perimetre = p; ouvrirFiltres(); chargerDecouverte(); }
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
  d.genres = []; d.perimetre = 'tout'; d.tri = 'populaire'; d.sens = 'desc'; d.noteMin = 0;
  ouvrirFiltres(); chargerDecouverte();
}
function filtresActifs(){
  const d = ui.disc;
  return d.genres.length > 0 || d.noteMin > 0 || d.perimetre !== 'tout' ||
         d.tri !== 'populaire' || (d.sens||'desc') !== 'desc';
}
function resumeFiltres(){
  const d = ui.disc;
  const bouts = [];
  const pres = PRESENCES.find(p=>p.id === ui.presence);
  if(ui.presence !== 'tout') bouts.push(pres.label.toLowerCase());
  const tri = TRIS.find(t=>t.id===d.tri) || {};
  bouts.push(tri.court + (d.tri !== 'aleatoire' && d.sens === 'asc' ? ' croissant' : ''));
  if(d.perimetre === 'recent') bouts.push('sorties récentes');
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
  h += '<div class="fgrp">Quoi</div><div class="fchips">'+
    PERIMETRES.map(p=>'<button class="chip '+(d.perimetre===p.id?'on':'')+
      '" onclick="setPerimetre(\''+p.id+'\')">'+p.label+'</button>').join('')+'</div>';
  h += '<div class="fgrp">Trier par</div><div class="fchips">'+
    TRIS.map(t=>'<button class="chip '+(d.tri===t.id?'on':'')+
      '" onclick="setTri(\''+t.id+'\')">'+t.label+'</button>').join('')+'</div>';
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

function viewDecouvrir(){
  const d = ui.disc, cherche = enRecherche();
  const sub =
    (ui.champOuvert ? champRecherche() : '') +
    '<div class="chips types">'+
      '<button class="chip chipico '+(ui.champOuvert?'ouvert':'')+'" onclick="ouvrirChamp()" '+
        'aria-label="Chercher">'+(ui.champOuvert ? I.close : I.search)+'</button>'+
      TYPES.map(t=>'<button class="chip '+(d.type===t.id?'on':'')+
        '" onclick="setType(\''+t.id+'\')">'+t.label+'</button>').join('')+
    '</div>'+
    /* La rangée de présence est la deuxième, toujours visible : c'est le
       geste central de l'app, il ne se cache pas derrière un panneau. */
    '<div class="souschips">'+
      PRESENCES.map(p=>'<button class="chip '+(ui.presence===p.id?'on'+(p.id==='dispo'?' vert':''):'')+
        '" onclick="setPresence(\''+p.id+'\')">'+
        (p.pt ? '<i class="pt '+p.pt+'"></i>' : '')+(p.label || labelTout())+'</button>').join('')+
    '</div>'+
    '<div class="resume">'+(cherche ? esc(resumeRecherche()) : '<b>'+esc(resumeFiltres())+'</b>')+'</div>';

  const bouton = '<button class="iconbtn '+(filtresActifs()?'actif ':'')+(cherche?'masque':'')+
    '" id="fbtn" onclick="ouvrirFiltres()">'+I.filtre+'</button>';

  return header('Découvrir', {right:bouton, sub:sub}) + banniereCle() + banniereCatalogue() +
    '<div id="dres">'+(cherche ? corpsRecherche() : corpsDecouverte())+'</div>'+
    '<div style="height:20px"></div>';
}
