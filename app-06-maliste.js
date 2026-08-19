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

/* ---------- Les trois volets (3007y) ----------
   Ma liste a absorbé le calendrier des Sorties (l'onglet a quitté la barre
   du bas du téléphone) et gagné les Suggestions — les idées d'achat tirées
   de l'analyse de la vidéothèque N4, visibles par le seul administrateur.
   Choix d'Alexandre sur maquette : trois volets « Ma liste · Sorties ·
   Suggestions », et les anciens onglets Favoris / Demandes / Arrivés
   deviennent la seconde rangée du premier volet. */
function voletsListe(){
  const volets = [ {id:'liste', label:'Ma liste'}, {id:'sorties', label:'Sorties'} ];
  if(typeof estAdmin !== 'undefined' && estAdmin)
    volets.push({id:'sugg', label:'Suggestions'});
  if(!volets.some(v => v.id === ui.listeVolet)) ui.listeVolet = 'liste';
  return '<div class="chips">'+volets.map(v=>
    '<button class="chip '+(ui.listeVolet===v.id?'on':'')+'" onclick="setListeVolet(\''+v.id+'\')">'+
    v.label+'</button>').join('')+'</div>';
}
function setListeVolet(id){
  if(ui.listeVolet === id) return;
  ui.listeVolet = id;
  window.scrollTo(0,0);
  render();
  if(id === 'sorties' && !ui.sorties.charge && !ui.sorties.loading && db.apiKey) chargerSorties();
  if(id === 'sugg' && !ui.sugg.charge && !ui.sugg.loading) chargerSuggestions();
}

function viewListe(){
  const volets = voletsListe();

  /* ---- Volet Sorties : le calendrier d'app-04, sous nos volets ---- */
  if(ui.listeVolet === 'sorties'){
    return header('Ma liste', {sub: volets + chipsModes(true)}) +
      banniereCle() + corpsSorties();
  }

  /* ---- Volet Suggestions ---- */
  if(ui.listeVolet === 'sugg'){
    return header('Ma liste', {sub: volets}) + corpsSuggestions();
  }

  /* ---- Volet Ma liste : l'écran historique ---- */
  const L = lots();
  const compte = { favoris:L.favoris.length, demandes:L.demandes.length, arrives:L.arrives.length };
  if(!ONGLETS.some(o => o.id === ui.listeTab)) ui.listeTab = 'favoris';

  const sub = volets + '<div class="chips souschips">'+ONGLETS.map(o=>
    '<button class="chip '+(ui.listeTab===o.id?'on':'')+'" onclick="setListeTab(\''+o.id+'\')">'+
    o.label+' <span style="opacity:.65">'+compte[o.id]+'</span></button>').join('')+'</div>';

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
                   'Sur la fiche d\'un titre absent de Cinéflix, « Demander » l\'ajoute à cette liste.');
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
             'Les titres que tu as demandés apparaîtront ici dès qu\'ils seront sur Cinéflix.');
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
  if(st === 'obtenu')       tag = '<div class="tag dispo">'+I.check+'Cinéflix</div>';
  else if(st === 'demande') tag = '<div class="tag demande">'+I.horloge+'</div>';
  else if(st === 'encours') tag = '<div class="tag encours">'+I.horloge+'</div>';
  return '<button class="gcard" onclick="ouvrirFiche('+it.id+',\''+it.type+'\',\'liste\')">'+
    '<div class="wrapimg">'+posterEl(it.poster,'w342','',it.titre)+tag+'</div>'+
    '<div class="gname">'+esc(it.titre)+'</div>'+
    '<div class="gyear">'+esc(year(it.date))+
      (it.type === 'tv' ? ' · série' : '')+'</div>'+
  '</button>';
}

function ligneItem(it){
  const st = statut(it.type, it.id);
  const lib = { demande:'En attente', encours:'En cours d\'ajout', refuse:'Refusée', obtenu:'Sur Cinéflix' };
  const cls = st === 'refuse' ? 'refuse' : st === 'encours' ? 'encours' : 'demande';
  return '<div class="lrow" onclick="ouvrirFiche('+it.id+',\''+it.type+'\',\'liste\')">'+
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
  const txt = 'Demandes Cinéflix'+(db.pseudo?' — '+db.pseudo:'')+'\n'+
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
  if(view === 'liste') render();
}

function suggVisibles(){
  const acquis = db.acquis || [];
  return (ui.sugg.l||[]).filter(f =>
    !surCineflix('movie', f.id) && acquis.indexOf(f.id) < 0);
}

function basculerCatSugg(nom){
  ui.sugg.plie[nom] = !ui.sugg.plie[nom];
  render();
}

function marquerAcquis(id){
  db.acquis = db.acquis || [];
  if(db.acquis.indexOf(id) < 0) db.acquis.push(id);
  saveDB(); render();
  toast('Marqué acquis — retiré des suggestions');
}
function retablirAcquis(){
  db.acquis = [];
  saveDB(); render();
  toast('Suggestions rétablies');
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

function corpsSuggestions(){
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
  const masquesCat = (s.l||[]).length - vis.length - masquesAcquis;

  if(!vis.length)
    return '<div class="empty">'+I.check+'<h3>Plus rien à suggérer</h3>'+
      '<p>Tout est acquis ou déjà sur Cinéflix. Beau travail.</p>'+
      (masquesAcquis ? '<button class="btn ghost" onclick="retablirAcquis()">Rétablir les films marqués acquis</button>' : '')+
      '</div>';

  /* Regroupé catégorie → sous-rayon, dans l'ordre du fichier (voulu :
     il va des évidences vers les curiosités). Les catégories se replient,
     la première arrive ouverte. */
  const cats = [];
  vis.forEach(f=>{
    let c = cats.find(x => x.nom === f.cat);
    if(!c){ c = { nom:f.cat, films:[] }; cats.push(c); }
    c.films.push(f);
  });

  let html = '<div class="wrap sgintro">'+vis.length+' idées pour la vidéothèque, '+
    'd\'après l\'analyse du N4 du 18/08. Un film acquis disparaît au scan suivant.</div>';

  cats.forEach((c,i)=>{
    if(!(c.nom in s.plie)) s.plie[c.nom] = i > 0;
    const plie = s.plie[c.nom];
    /* Le nom passe encodé dans l'attribut : « Crime & Mafia » ou un futur
       rayon avec apostrophe ne doivent pas casser l'onclick. */
    html += '<button class="sgcat" onclick="basculerCatSugg(decodeURIComponent(\''+
      encodeURIComponent(c.nom)+'\'))">'+
      '<span>'+esc(c.nom)+'</span>'+
      '<span class="sgn">'+c.films.length+' film'+(c.films.length>1?'s':'')+
      ' <i class="sgfl'+(plie?'':' ouv')+'">'+I.back+'</i></span></button>';
    if(plie) return;
    let sous = '';
    c.films.forEach(f=>{
      if(f.sous !== sous){
        sous = f.sous;
        html += '<div class="sgsous">'+esc(sous)+'</div>';
      }
      html += carteSugg(f);
    });
  });

  const nMasques = masquesAcquis + Math.max(0, masquesCat);
  if(nMasques)
    html += '<div class="credit">'+nMasques+' film'+(nMasques>1?'s':'')+' masqué'+(nMasques>1?'s':'')+
      ' (acquis ou déjà sur Cinéflix)'+
      (masquesAcquis ? ' · <a href="#" onclick="event.preventDefault();retablirAcquis()">rétablir les acquis</a>' : '')+
      '</div>';
  return html + '<div style="height:26px"></div>';
}

function carteSugg(f){
  const it = item('movie', f.id);
  const fav = !!(it && it.fav);
  return '<div class="sgfilm">'+
    '<button class="sgaff" onclick="ouvrirFiche('+f.id+',\'movie\',\'liste\')" aria-label="'+esc(f.titre)+'">'+
      posterEl(f.poster,'w154','',f.titre)+'</button>'+
    '<div class="sginfo" onclick="ouvrirFiche('+f.id+',\'movie\',\'liste\')">'+
      '<div class="sgt">'+esc(f.titre)+' <span class="sgy">'+esc(String(f.annee||''))+'</span></div>'+
      '<div class="sgwhy">'+esc(f.pourquoi)+'</div>'+
    '</div>'+
    '<div class="sgbt">'+
      '<button class="sgb" onclick="marquerAcquis('+f.id+')">Acquis ✓</button>'+
      '<button class="sgb'+(fav?' sgbon':'')+'" onclick="coeurSugg('+f.id+')" aria-label="Favori">'+
        (fav ? I.coeurPlein : I.coeur)+'</button>'+
    '</div>'+
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
