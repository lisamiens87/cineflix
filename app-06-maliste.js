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

function suggVisibles(){
  const acquis = db.acquis || [];
  return (ui.sugg.l||[]).filter(f =>
    !surCineflix('movie', f.id) && acquis.indexOf(f.id) < 0);
}

/* L'émoji de chaque catégorie — ceux de la maquette validée. */
const EMO_CAT = { 'Crime & Mafia':'🕴️', 'Action':'💥', 'Comédie':'🎭',
  'Guerre':'🪖', 'Science-fiction':'🚀', 'Thriller':'🔪', 'Western':'🤠',
  'Drame & Biopic':'🏆', 'Animation':'🎨', 'Américains années 90':'📼',
  'Comédies françaises':'🇫🇷' };

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
      '<p>Tout est acquis ou déjà sur Premier Rang. Beau travail.</p>'+
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

  const nMasques = masquesAcquis + Math.max(0, masquesCat);
  if(nMasques)
    html += '<div class="credit">'+nMasques+' film'+(nMasques>1?'s':'')+' masqué'+(nMasques>1?'s':'')+
      ' (acquis ou déjà sur Premier Rang)'+
      (masquesAcquis ? ' · <a href="#" onclick="event.preventDefault();retablirAcquis()">rétablir les acquis</a>' : '')+
      '</div>';
  return html + '<div style="height:26px"></div>';
}

function carteSugg(f){
  const it = item('movie', f.id);
  const fav = !!(it && it.fav);
  return '<div class="sgc" onclick="ouvrirFiche('+f.id+',\'movie\')">'+
    '<div class="wrapimg">'+posterEl(f.poster,'w342','',f.titre)+
      '<div class="sgact">'+
        '<button onclick="event.stopPropagation();marquerAcquis('+f.id+')" aria-label="Marquer acquis">✓</button>'+
        '<button class="'+(fav?'on':'')+'" onclick="event.stopPropagation();coeurSugg('+f.id+')" aria-label="Favori">'+
          (fav ? '♥' : '♡')+'</button>'+
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
