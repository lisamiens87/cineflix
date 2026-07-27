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

function viewListe(){
  const L = lots();
  const compte = { favoris:L.favoris.length, demandes:L.demandes.length, arrives:L.arrives.length };
  if(!ONGLETS.some(o => o.id === ui.listeTab)) ui.listeTab = 'favoris';

  const sub = '<div class="chips">'+ONGLETS.map(o=>
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
