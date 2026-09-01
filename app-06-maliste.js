"use strict";
/* ============================ Ma liste ============================ */
/* Ici vit l'axe personnel — favori, demandé, en cours, obtenu — par
   opposition à l'axe « présence » qui, lui, est le même pour tout le monde.
   Un titre demandé qui apparaît dans le catalogue bascule tout seul en
   « arrivé » : c'est le catalogue qui fait foi, jamais un clic. */

const ONGLETS = [
  { id:'favoris',  label:'Favoris' },
  { id:'demandes', label:'Demandes' },
  { id:'arrives',  label:'Arrivés' }
];

function tousLesItems(){ return Object.values(db.items); }

function lots(){
  const tout = tousLesItems();
  const arrives  = tout.filter(it => it.req && surCineflix(it.type, it.id));
  const demandes = tout.filter(it => it.req && !surCineflix(it.type, it.id))
                       .sort((a,b)=> (b.req.le||0) - (a.req.le||0));
  const favoris  = tout.filter(it => it.fav).sort((a,b)=> (b.ajoute||0) - (a.ajoute||0));
  return { favoris, demandes, arrives };
}

function setListeTab(id){ ui.listeTab = id; render(); }

/* ---------- Ma liste, redevenue Ma liste (3008p) ----------
   L'écran avait fini par tout héberger : le calendrier des Sorties (3007y),
   puis les Suggestions. Les deux sont partis dans l'onglet Cinéma, qui a
   maintenant sa place en bas à droite. Il ne reste que ce que le nom promet,
   avec les mêmes sous-catégories qu'avant : Favoris, Demandes, Arrivés. */
function viewListe(){
  const L = lots();
  const compte = { favoris:L.favoris.length, demandes:L.demandes.length, arrives:L.arrives.length };
  if(!ONGLETS.some(o => o.id === ui.listeTab)) ui.listeTab = 'favoris';

  const sub = '<div class="chips souschips">'+ONGLETS.map(o=>
    '<button class="chip '+(ui.listeTab===o.id?'on':'')+'" onclick="setListeTab(\''+o.id+'\')">'+
    o.label+' <span style="opacity:.65">'+compte[o.id]+'</span></button>').join('')+'</div>';

  /* Le doublon de 3008d (« Ma liste » dans la barre du bas ET en volet) n'a
     plus lieu d'être : le volet a disparu, le nom revient. */
  let html = header('Ma liste', {sub:sub,
    right:'<button class="iconbtn" onclick="menuListe()">'+I.dots+'</button>'});

  if(ui.listeTab === 'favoris'){
    html += L.favoris.length
      ? '<div class="pgrid">'+L.favoris.map(carteItem).join('')+'</div>'
      : vide(I.coeur, 'Aucun favori',
             'Appuie sur le cœur d\'un film ou d\'une série pour le retrouver ici, sans rien demander.');
  }
  else if(ui.listeTab === 'demandes'){
    if(!L.demandes.length)
      html += vide(I.envoi, 'Aucune demande en attente',
                   'Sur la fiche d\'un titre absent de Premier Rang, « Demander » l\'ajoute à cette liste.');
    else{
      /* On sépare ce qui est encore en attente de ce qui a été refusé :
         sinon les refus s'accumulent en tête et donnent l'impression que
         rien n'avance. */
      const attente = L.demandes.filter(it => it.req.statut !== 'refuse');
      const refus   = L.demandes.filter(it => it.req.statut === 'refuse');
      if(attente.length)
        html += '<div class="list">'+attente.map(ligneItem).join('')+'</div>';
      if(refus.length)
        html += '<div class="sectitle">Refusées<span class="cnt">'+refus.length+'</span></div>'+
                '<div class="list">'+refus.map(ligneItem).join('')+'</div>';
    }
  }
  else {
    html += L.arrives.length
      ? '<div class="sectitle">Tes demandes qui sont arrivées</div>'+
        '<div class="pgrid">'+L.arrives.map(carteItem).join('')+'</div>'
      : vide(I.check, 'Rien n\'est encore arrivé',
             'Les titres que tu as demandés apparaîtront ici dès qu\'ils seront sur Premier Rang.');
  }
  return html + '<div style="height:26px"></div>';
}

function vide(icone, titre, sous){
  return '<div class="empty">'+icone+'<h3>'+esc(titre)+'</h3><p>'+esc(sous)+'</p>'+
    '<button class="btn ghost" onclick="go(\'decouvrir\')">Parcourir le catalogue</button></div>';
}

function carteItem(it){
  const st = statut(it.type, it.id);
  let tag = '';
  if(st === 'obtenu')       tag = '<div class="tag dispo">'+I.check+'Premier Rang</div>';
  else if(st === 'demande') tag = '<div class="tag demande">'+I.horloge+'</div>';
  else if(st === 'encours') tag = '<div class="tag encours">'+I.horloge+'</div>';
  return '<button class="gcard" onclick="ouvrirFiche('+it.id+',\''+it.type+'\')">'+
    '<div class="wrapimg">'+posterEl(it.poster,'w342','',it.titre)+tag+'</div>'+
    '<div class="gname">'+esc(it.titre)+'</div>'+
    '<div class="gyear">'+esc(year(it.date))+
      (it.type === 'tv' ? ' · série' : '')+'</div>'+
  '</button>';
}

function ligneItem(it){
  const st = statut(it.type, it.id);
  const lib = { demande:'En attente', encours:'En cours d\'ajout', refuse:'Refusée', obtenu:'Sur Premier Rang' };
  const cls = st === 'refuse' ? 'refuse' : st === 'encours' ? 'encours' : 'demande';
  return '<div class="lrow" onclick="ouvrirFiche('+it.id+',\''+it.type+'\')">'+
    (it.poster ? '<img class="lposter" loading="lazy" src="'+IMG(it.poster,'w154')+'" alt="">'
               : '<div class="lposter"></div>')+
    '<div class="cinfo">'+
      '<div class="cname2">'+esc(it.titre)+'</div>'+
      '<div class="csub">'+esc(year(it.date))+(it.type === 'tv' ? ' · série' : '')+
        ' · demandé '+esc(relatif(new Date(it.req.le||Date.now()).toISOString().slice(0,10)))+'</div>'+
      '<span class="pastille '+cls+'">'+(lib[st]||'En attente')+'</span>'+
    '</div>'+
    '<button class="iconbtn" onclick="event.stopPropagation();menuDemande('+it.id+',\''+it.type+'\')">'+
      I.dots+'</button>'+
  '</div>';
}

function menuListe(){
  const L = lots();
  openSheet('<h3>Ma liste</h3>'+
    '<p class="small muted" style="margin:0 0 8px">'+
      L.favoris.length+' favori'+(L.favoris.length>1?'s':'')+' · '+
      L.demandes.length+' demande'+(L.demandes.length>1?'s':'')+' en attente</p>'+
    '<button class="opt" onclick="closeSheet();exporterDemandes()">Exporter mes demandes</button>'+
    '<button class="opt danger" onclick="closeSheet();viderRefus()">Effacer les demandes refusées</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}

/* Tant que la file n'est pas branchée sur un serveur, l'export donne une
   liste lisible que tu peux coller où tu veux — y compris dans Jellyseerr. */
function exporterDemandes(){
  const L = lots();
  if(!L.demandes.length) return toast('Aucune demande à exporter');
  const lignes = L.demandes.map(it =>
    (it.type === 'movie' ? 'Film' : 'Série')+' · '+it.titre+' ('+year(it.date)+') · '+
    'https://www.themoviedb.org/'+it.type+'/'+it.id);
  const txt = 'Demandes Premier Rang'+(db.pseudo?' — '+db.pseudo:'')+'\n'+
              fmtDate(todayISO())+'\n\n'+lignes.join('\n')+'\n';
  const blob = new Blob([txt], {type:'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'demandes-cineflix-'+todayISO()+'.txt';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  toast('Liste exportée');
}

/* ============================ Suggestions N4 ============================ */
/* Les 97 idées d'achat issues de l'analyse de la vidéothèque (scan du
   18/08/2026) : chaque film a été vérifié absent de la base, et porte une
   justification écrite pour Alexandre. Le fichier suggestions-n4.json vit
   dans le dépôt, affiches TMDB pré-résolues — l'ouverture du volet ne coûte
   qu'une requête, vers notre propre serveur.

   Un film s'efface de lui-même dans deux cas : marqué « Acquis » à la main
   (db.acquis, propre à l'appareil), ou apparu dans le catalogue au fil des
   scans du NAS — c'est le catalogue qui fait foi, comme partout. */

async function chargerSuggestions(){
  const s = ui.sugg;
  s.loading = true; s.err = '';
  render();
  try{
    const r = await fetch('./suggestions-n4.json?b='+(window.BUILD||''), {cache:'no-cache'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    s.l = await r.json();
    s.loading = false; s.charge = true;
  }catch(e){
    s.loading = false; s.charge = false;
    s.err = 'Impossible de charger les suggestions';
  }
  /* Le rendu de fin. Cette ligne testait `view === 'liste'` : l'écran vivait
     sous Ma liste jusqu'en 3008p, il est passé sous Cinéma (vue `sorties`)
     et le test est resté en arrière. Résultat : la liste arrivait bien, mais
     rien ne la dessinait et le voile « Lecture des suggestions… » ne se
     levait jamais. Panne signalée par Alexandre le 26/08.
     On redessine dès que l'écran affiché est l'un de ceux qui la montrent. */
  if(view === 'sorties' || view === 'liste') render();
}

/* ---------- Les films écartés ----------
   Demande d'Alexandre le 29/08 : « il y a des films qui ne m'intéressent pas,
   tout du moins pour le moment ; rajoute une croix, mais on peut les
   reproposer dans six mois ». D'où une DATE et pas un simple drapeau : c'est
   elle qui fait revenir le film toute seule, sans que personne y pense.

   Le serveur fait foi (table `ecartes`), parce qu'écarter un film sur le
   téléphone et le revoir sur le bureau n'aurait aucun sens. Le cache local
   sert d'écho immédiat : le geste se voit avant l'aller-retour réseau. */
const ECART_DUREE = 183 * 24 * 3600 * 1000;   /* six mois */

const ecarteJusqua = ts => ts + ECART_DUREE;
const encoreEcarte = ts => (Date.now() - ts) < ECART_DUREE;

/* Le jour où le PREMIER film écarté revient — c'est celui-là qu'on annonce,
   pas le dernier : c'est la prochaine date qui intéresse. */
function prochainRetour(){
  const t = Object.values(db.ecartes||{}).filter(encoreEcarte);
  if(!t.length) return null;
  return new Date(ecarteJusqua(Math.min.apply(null, t)));
}
const enFrancais = d => d.toLocaleDateString('fr-FR',
  {day:'numeric', month:'long', year:'numeric'});

function suggVisibles(){
  const acquis = db.acquis || [];
  const ec = db.ecartes || {};
  return (ui.sugg.l||[]).filter(f =>
    !surCineflix('movie', f.id) && acquis.indexOf(f.id) < 0 &&
    !(ec[f.id] && encoreEcarte(ec[f.id])));
}
const estUneSuggestion = id => !!(ui.sugg.l||[]).find(x => Number(x.id) === Number(id));

/* L'émoji de chaque catégorie — ceux de la maquette validée. */
const EMO_CAT = { 'Crime & Mafia':'🕴️', 'Action':'💥', 'Comédie':'🎭',
  'Guerre':'🪖', 'Science-fiction':'🚀', 'Thriller':'🔪', 'Western':'🤠',
  'Drame & Biopic':'🏆', 'Animation':'🎨', 'Américains années 90':'📼',
  'Comédies françaises':'🇫🇷' };

/* Le bouton ✓ « Acquis » a disparu en 3009a. Alexandre : « suggestion =
   films que je n'ai pas, donc le coche ne doit pas exister, c'est cœur ou
   croix ». Il avait raison : le jour où il achète le film, le scan du NAS
   le fait sortir tout seul. `retablirAcquis` reste pour défaire les
   marquages faits avant, sinon ils resteraient masqués pour toujours. */
function retablirAcquis(){
  db.acquis = [];
  saveDB(); render();
  toast('Films acquis rétablis');
}

/* Écarter, annuler, tout rétablir. Chaque geste écrit d'abord en local pour
   que l'écran réponde tout de suite, puis pousse vers le serveur. */
function ecarter(id){
  id = Number(id);
  db.ecartes = db.ecartes || {};
  db.ecartes[id] = Date.now();
  saveDB(); render();
  pousserEcart(id).catch(()=>{});
  bandeauAnnuler(id);
}
function annulerEcart(id){
  id = Number(id);
  if(db.ecartes) delete db.ecartes[id];
  saveDB(); fermerBandeau(); render();
  retirerEcart(id).catch(()=>{});
}
function retablirEcartes(){
  const n = Object.keys(db.ecartes||{}).length;
  db.ecartes = {};
  saveDB(); render();
  viderEcarts().catch(()=>{});
  toast(n ? n+' film'+(n>1?'s':'')+' rétabli'+(n>1?'s':'') : 'Rien à rétablir');
}

/* Le garde-fou. Une croix touchée au pouce dans une rangée qui défile, ça
   arrive ; sans ce bandeau le film disparaîtrait pour six mois sans recours. */
let bandeauMinuteur = null;
function fermerBandeau(){
  const el = document.getElementById('ecartbar');
  if(el) el.remove();
  if(bandeauMinuteur){ clearTimeout(bandeauMinuteur); bandeauMinuteur = null; }
}
function bandeauAnnuler(id){
  fermerBandeau();
  const f = (ui.sugg.l||[]).find(x => Number(x.id) === id);
  const el = document.createElement('div');
  el.id = 'ecartbar'; el.className = 'ecartbar';
  el.innerHTML = '<span>' + esc((f && f.titre) || 'Film') +
    ' écarté — revient dans six mois</span>' +
    '<button onclick="annulerEcart(' + id + ')">Annuler</button>';
  document.body.appendChild(el);
  void el.offsetWidth;
  el.classList.add('on');
  bandeauMinuteur = setTimeout(fermerBandeau, 6000);
}

/* ---------- Le va-et-vient avec le serveur ---------- */
async function chargerEcartes(){
  if(!sbPret() || !connecte()) return;
  const l = await sbFetch('/rest/v1/ecartes?select=tmdb_id,ecarte_le&user_id=eq.'+
                          encodeURIComponent(db.auth.uid), {});
  const neuf = {};
  (l||[]).forEach(e => { neuf[e.tmdb_id] = Date.parse(e.ecarte_le) || Date.now(); });
  db.ecartes = neuf;
  saveDB();
}
async function pousserEcart(id){
  if(!sbPret() || !connecte()) return;
  await sbFetch('/rest/v1/ecartes', {method:'POST',
    headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: db.auth.uid, tmdb_id: id,
                           ecarte_le: new Date(db.ecartes[id]).toISOString() })});
}
async function retirerEcart(id){
  if(!sbPret() || !connecte()) return;
  await sbFetch('/rest/v1/ecartes?user_id=eq.'+encodeURIComponent(db.auth.uid)+
                '&tmdb_id=eq.'+id, {method:'DELETE', headers:{ Prefer:'return=minimal' }});
}
async function viderEcarts(){
  if(!sbPret() || !connecte()) return;
  await sbFetch('/rest/v1/ecartes?user_id=eq.'+encodeURIComponent(db.auth.uid),
                {method:'DELETE', headers:{ Prefer:'return=minimal' }});
}

/* Le cœur d'une suggestion fait exactement ce qu'il fait ailleurs : le film
   rejoint (ou quitte) les favoris — donc le volet Ma liste. */
function coeurSugg(id){
  const f = (ui.sugg.l||[]).find(x => x.id === id);
  if(!f) return;
  basculerFavori({ id:f.id, title:f.titre, poster_path:f.poster||null,
                   release_date:String(f.annee||'')+'-01-01' }, 'movie');
  render();
}

/* Les trois sous-onglets de Suggestions. « Catégories » est l'écran
   d'origine, intact ; « Absents en 4K » vit dans app-16 ; « Absents en
   Blu-ray » est annoncé mais sans données, donc inerte plutôt qu'absent —
   dire ce qui vient vaut mieux que le cacher. */
const SUGG_ONGLETS = [
  { id:'cat', label:'Catégories' },
  { id:'q4k', label:'Absents en 4K' },
  { id:'bd',  label:'Absents en Blu-ray', off:true }
];

function setSuggOnglet(id){
  const o = SUGG_ONGLETS.find(x => x.id === id);
  if(!o || o.off) return;
  ui.sugg.onglet = id;
  render();
}

function sousOngletsSuggHtml(){
  return '<div class="chips souschips">'+SUGG_ONGLETS.map(o=>
    '<button class="chip '+(ui.sugg.onglet===o.id?'on':'')+(o.off?' off':'')+'"'+
    (o.off ? ' disabled aria-disabled="true"' : ' onclick="setSuggOnglet(\''+o.id+'\')"')+
    '>'+esc(o.label)+'</button>').join('')+'</div>';
}

function corpsSuggestions(){
  if(!SUGG_ONGLETS.some(o => o.id === ui.sugg.onglet && !o.off)) ui.sugg.onglet = 'cat';
  return sousOngletsSuggHtml() +
    (ui.sugg.onglet === 'q4k' ? corpsAbsents4k() : corpsCategories());
}

function corpsCategories(){
  const s = ui.sugg;
  if(s.loading || (!s.charge && !s.err))
    return '<div class="empty"><span class="spin"></span>'+
      '<p style="margin-top:12px">Lecture des suggestions…</p></div>';
  if(s.err)
    return '<div class="empty">'+I.etincelle+'<h3>'+esc(s.err)+'</h3>'+
      '<p>Vérifie ta connexion, puis réessaie.</p>'+
      '<button class="btn ghost" onclick="chargerSuggestions()">Réessayer</button></div>';

  const vis = suggVisibles();
  const masquesAcquis = (db.acquis||[]).length;
  const ecartes = Object.values(db.ecartes||{}).filter(encoreEcarte).length;
  const masquesCat = (s.l||[]).length - vis.length - masquesAcquis - ecartes;
  const retour = prochainRetour();

  /* Un écran vide sans explication laisse croire à une panne. On dit
     pourquoi il n'y a rien, et quand ça revient. */
  if(!vis.length)
    return '<div class="empty">'+I.check+'<h3>Plus rien à suggérer</h3>'+
      '<p>Tout est déjà sur Premier Rang, ou écarté pour le moment.'+
      (retour ? '<br>Les films écartés reviendront à partir du '+esc(enFrancais(retour))+'.' : '')+
      '</p>'+
      (ecartes ? '<button class="btn ghost" onclick="retablirEcartes()">Rétablir les films écartés</button>' : '')+
      (masquesAcquis ? '<button class="btn ghost" onclick="retablirAcquis()">Rétablir les films marqués acquis</button>' : '')+
      '</div>';

  /* Une rangée horizontale PAR SOUS-RAYON, façon Netflix — maquette validée
     le 19/08 (3008d) : l'affiche d'abord, le « pourquoi » en deux lignes
     dessous, et les deux gestes (acquis, cœur) posés sur l'affiche. */
  const rayons = [];
  vis.forEach(f=>{
    let r = rayons.find(x => x.cat === f.cat && x.sous === f.sous);
    if(!r){ r = { cat:f.cat, sous:f.sous, films:[] }; rayons.push(r); }
    r.films.push(f);
  });

  /* Le texte ne porte plus de date : il en portait une (« du 18/08 »), écrite
     en dur, qui est devenue fausse à la fournée suivante. Ce qui compte tient
     dans la phrase, pas dans le jour du scan. */
  let html = '<div class="wrap sgintro">'+vis.length+' idées pour la vidéothèque, '+
    'd\'après l\'analyse de ta bibliothèque N4. Un film acquis disparaît au scan '+
    'suivant.</div>';
  rayons.forEach(r=>{
    html += '<div class="sgrt"><span>'+(EMO_CAT[r.cat] ? EMO_CAT[r.cat]+' ' : '')+
      esc(r.sous)+'</span><i>'+esc(r.cat)+'</i></div>'+
      '<div class="sgrow">'+r.films.map(carteSugg).join('')+'</div>';
  });

  /* Deux lignes distinctes en bas d'écran, parce que ce sont deux choses
     différentes : ce qui est masqué pour toujours (le film est chez toi) et
     ce qui est écarté pour six mois (le film ne te disait rien ce jour-là). */
  const nMasques = masquesAcquis + Math.max(0, masquesCat);
  if(nMasques)
    html += '<div class="credit">'+nMasques+' film'+(nMasques>1?'s':'')+' masqué'+(nMasques>1?'s':'')+
      ' (acquis ou déjà sur Premier Rang)'+
      (masquesAcquis ? ' · <a href="#" onclick="event.preventDefault();retablirAcquis()">rétablir les acquis</a>' : '')+
      '</div>';
  if(ecartes)
    html += '<div class="credit">'+ecartes+' film'+(ecartes>1?'s':'')+' écarté'+(ecartes>1?'s':'')+
      (retour ? ' · le premier revient le '+esc(enFrancais(retour)) : '')+
      ' · <a href="#" onclick="event.preventDefault();retablirEcartes()">tout rétablir maintenant</a>'+
      '</div>';
  return html + '<div style="height:26px"></div>';
}

function carteSugg(f){
  const it = item('movie', f.id);
  const fav = !!(it && it.fav);
  return '<div class="sgc" onclick="ouvrirFiche('+f.id+',\'movie\')">'+
    '<div class="wrapimg">'+posterEl(f.poster,'w342','',f.titre)+
      /* Cœur à GAUCHE, croix à DROITE, aux deux bords de l'affiche : le
         geste positif d'un côté, le négatif de l'autre, cent six pixels
         entre les deux. Collés, on écarte au pouce un film qu'on voulait
         aimer — c'est la raison d'être de cet écartement. */
      '<div class="sgact sgg">'+
        '<button class="'+(fav?'on':'')+'" onclick="event.stopPropagation();coeurSugg('+f.id+')" aria-label="Je le veux">'+
          (fav ? '♥' : '♡')+'</button>'+
      '</div>'+
      '<div class="sgact">'+
        '<button class="no" onclick="event.stopPropagation();ecarter('+f.id+')" aria-label="Pas celui-là">✕</button>'+
      '</div>'+
    '</div>'+
    '<div class="sgnom">'+esc(f.titre)+' <span class="sgy">'+esc(String(f.annee||''))+'</span></div>'+
    '<div class="sgwhy2">'+esc(f.pourquoi)+'</div>'+
  '</div>';
}

function viderRefus(){
  let n = 0;
  Object.keys(db.items).forEach(k=>{
    const it = db.items[k];
    if(it.req && it.req.statut === 'refuse'){
      it.req = null; n++;
      if(!it.fav) delete db.items[k];
    }
  });
  if(!n) return toast('Aucune demande refusée');
  saveDB(); render();
  toast(n+' demande'+(n>1?'s':'')+' effacée'+(n>1?'s':''));
}
