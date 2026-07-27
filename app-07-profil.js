"use strict";
/* ============================ Profil ============================ */

function viewProfil(){
  const L = lots();
  const nom = (db.pseudo||'').trim();
  const ini = (nom || '?').charAt(0).toUpperCase();
  const tailleCat = CAT.movie.size + CAT.tv.size;

  let html = header('Profil', {
    right:'<button class="iconbtn" onclick="go(\'reglages\',{from:\'profil\'})">'+I.dots+'</button>'});

  html += '<div class="phead"><div class="avatar">'+esc(ini)+'</div>'+
    '<div><div style="font-size:18px;font-weight:700">'+esc(nom || 'Sans nom')+'</div>'+
    '<div class="small muted">Cinéflix</div></div></div>';

  html += '<div class="stats">'+
    '<div class="stat"><b>'+L.favoris.length+'</b><span>favori'+(L.favoris.length>1?'s':'')+'</span></div>'+
    '<div class="stat"><b>'+L.demandes.length+'</b><span>demande'+(L.demandes.length>1?'s':'')+'</span></div>'+
    '<div class="stat"><b>'+L.arrives.length+'</b><span>arrivé'+(L.arrives.length>1?'s':'')+'</span></div>'+
  '</div>';

  /* L'état du catalogue est la première chose à vérifier quand quelque chose
     paraît faux : on l'affiche en clair plutôt que de le cacher. */
  html += '<div class="sectitle">Le serveur Cinéflix</div><div class="wrap" style="padding-top:0">'+
    '<div class="card" style="padding:14px">'+
      (CAT.erreur
        ? '<div style="font-weight:660;color:var(--warn)">Catalogue introuvable</div>'+
          '<div class="small muted" style="margin-top:4px">'+esc(CAT.erreur)+
          '. Le filtre « Sur Cinéflix » ne peut pas fonctionner.</div>'
        : '<div style="font-weight:660">'+CAT.movie.size+' film'+(CAT.movie.size>1?'s':'')+
          ' · '+CAT.tv.size+' série'+(CAT.tv.size>1?'s':'')+'</div>'+
          '<div class="small muted" style="margin-top:4px">'+
            (tailleCat ? 'Catalogue chargé' : 'Catalogue vide')+
            (CAT.maj ? ', mis à jour le '+esc(fmtDate(CAT.maj)) : '')+'.</div>')+
      /* Deux voyants distincts : le catalogue (ce que je sais du serveur) et
         l'accès (est-ce que je peux vraiment lire un film maintenant). Ils
         tombent en panne séparément, ils s'affichent séparément. */
      '<div class="kv" style="padding:10px 0 0;border:0;margin-top:10px;'+
        'border-top:1px solid var(--line)">'+
        '<span class="small muted">Accès au serveur</span>'+
        '<span class="small" style="color:'+(jellyBase?'var(--ok)':'var(--muted)')+'">'+
          (jellyBase ? 'joignable' : 'hors de portée')+'</span></div>'+
      '<button class="btn ghost block" style="margin-top:12px" onclick="rafraichirCatalogue()">'+
        'Actualiser le catalogue</button>'+
    '</div></div>';

  /* La file n'apparaît que pour qui la traite : les autres n'ont pas à savoir
     qu'elle existe, et surtout pas à voir les demandes des autres. */
  if(estAdmin){
    const enAttente = file.charge
      ? file.lignes.filter(l => l.statut === 'demande' && !surCineflix(l.type, l.tmdb_id)).length
      : null;
    html += '<div class="sectitle">Administration</div><div class="wrap" style="padding-top:0">'+
      '<button class="btn block" onclick="go(\'file\');chargerFile()">'+I.envoi+
        ' File de demandes'+(enAttente ? ' ('+enAttente+')' : '')+'</button>'+
      '<div class="tiny muted center" style="margin-top:8px">'+
        'Les demandes de tout le monde, à accepter ou refuser.</div>'+
    '</div>';
  }

  if(sbPret() && connecte()){
    html += '<div class="sectitle">Compte</div><div class="wrap" style="padding-top:0">'+
      '<div class="card" style="padding:14px">'+
        '<div class="small muted">Connecté en tant que</div>'+
        '<div style="font-weight:660;margin-top:2px">'+esc(db.auth.email||'—')+'</div>'+
        '<div class="tiny muted" style="margin-top:8px;-webkit-user-select:all;user-select:all">'+
          esc(db.auth.uid||'')+'</div>'+
      '</div>'+
      '<button class="btn ghost block" style="margin-top:10px;color:#ff5a5a" '+
        'onclick="seDeconnecter()">Se déconnecter</button>'+
    '</div>';
  }

  html += '<div class="sectitle">Raccourcis</div><div class="wrap" style="padding-top:0">'+
    '<button class="btn ghost block" style="margin-bottom:10px" onclick="ui.presence=\'dispo\';ui.disc.charge=false;go(\'decouvrir\')">'+
      I.serveur+' Parcourir ce qui est sur Cinéflix</button>'+
    '<button class="btn ghost block" style="margin-bottom:10px" onclick="ui.sorties.mode=\'bluray\';ui.sorties.charge=false;go(\'sorties\')">'+
      I.disque+' Prochaines sorties Blu-ray</button>'+
    '<button class="btn ghost block" onclick="go(\'reglages\',{from:\'profil\'})">Réglages</button>'+
  '</div>';

  return html + '<div class="wrap tiny muted center" style="padding-bottom:30px">'+
    'Cinéflix · données films et séries fournies par TMDB'+
    /* Le numéro de version, posé par index.html : quand un téléphone semble
       afficher une vieille version, ce numéro tranche en un coup d'œil. */
    (window.BUILD ? ' · v'+esc(window.BUILD) : '')+'</div>';
}

async function rafraichirCatalogue(){
  toast('Actualisation…');
  await chargerCatalogue();
  render();
  toast(CAT.erreur ? 'Catalogue introuvable' : 'Catalogue à jour');
}

/* ============================ Réglages ============================ */
function viewReglages(){
  let html = header('Réglages', {back:'goBack()'});

  html += '<div class="sectitle">Moi</div><div class="wrap" style="padding-top:0">'+
    '<label class="fld"><span>Mon prénom</span>'+
      '<input type="text" id="rgpseudo" value="'+esc(db.pseudo||'')+'" placeholder="Ton prénom" '+
      'autocomplete="given-name">'+
      '<em>Sert à signer tes demandes.</em></label>'+
  '</div>';

  html += '<div class="sectitle">Connexion TMDB</div><div class="wrap" style="padding-top:0">'+
    '<label class="fld"><span>Clé API TMDB</span>'+
      '<input type="password" id="rgcle" value="'+esc(db.apiKey||'')+'" placeholder="Colle ta clé ici" '+
      'autocomplete="off">'+
      '<em>'+(cleFournie()
        ? 'Fournie par le serveur : tu n\'as rien à faire. Tu peux la remplacer '+
          'par la tienne si tu préfères ; vider le champ rétablit celle du serveur.'
        : 'Clé API (v3) ou jeton v4. Gratuite sur '+
          '<a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org</a>.')+
      '</em></label>'+
    '<label class="fld"><span>Région des dates de sortie</span>'+
      '<select id="rgregion">'+
        ['FR','BE','CH','CA','US','GB'].map(r=>'<option value="'+r+'" '+
          (db.region===r?'selected':'')+'>'+r+'</option>').join('')+
      '</select>'+
      '<em>Les dates cinéma, numérique et Blu-ray dépendent du pays.</em></label>'+
  '</div>';

  html += '<div class="sectitle">Le serveur Cinéflix</div><div class="wrap" style="padding-top:0">'+
    '<label class="fld"><span>Adresse du catalogue</span>'+
      '<input type="text" id="rgcat" value="'+esc(db.catalogueUrl||'')+'" '+
      'placeholder="./cineflix.json" autocapitalize="off" autocorrect="off" spellcheck="false">'+
      '<em>Le fichier produit par le script d\'export sur le NAS. '+
      'Une adresse relative (./cineflix.json) suffit s\'il est posé à côté de l\'app.</em></label>'+
    '<label class="fld"><span>Adresse de Jellyfin</span>'+
      '<input type="text" id="rgjelly" value="'+esc(db.jellyfin||'')+'" '+
      'placeholder="'+esc((CFG.jellyfinHosts||[])[0]||'http://100.x.y.z:8096')+'" '+
      'autocapitalize="off" autocorrect="off" spellcheck="false">'+
      '<em>'+((CFG.jellyfinHosts||[]).length
        ? 'Laisse vide pour utiliser les adresses du serveur, essayées dans l\'ordre. '+
          (jellyBase ? 'Actuellement joignable : <b>'+esc(jellyBase)+'</b>.'
                     : 'Aucune ne répond pour l\'instant — hors tailnet ?')
        : 'Utilisée par le bouton « Regarder ».')+'</em></label>'+
    '<button class="btn block" onclick="enregistrerReglages()">Enregistrer</button>'+
  '</div>';

  html += '<div class="sectitle">Mes données</div><div class="wrap" style="padding-top:0">'+
    (memoryOnly ? '<div class="banner" style="margin:0 0 14px">Le stockage du navigateur est '+
      'indisponible ici : <b>tes favoris seront perdus à la fermeture</b>.</div>' : '')+
    '<button class="btn ghost block" style="margin-bottom:10px" onclick="exportData()">'+
      'Exporter mes favoris et demandes</button>'+
    '<button class="btn ghost block" style="margin-bottom:10px" onclick="document.getElementById(\'imp\').click()">'+
      'Importer un fichier</button>'+
    '<input type="file" id="imp" accept="application/json,.json" style="display:none" onchange="importData(this)">'+
    '<button class="btn ghost block" style="color:#ff5a5a" onclick="toutEffacer()">Tout effacer</button>'+
  '</div>';

  return html + '<div style="height:30px"></div>';
}

function enregistrerReglages(){
  const v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  db.pseudo = v('rgpseudo');
  const cleAvant = db.apiKey, catAvant = db.catalogueUrl, jellyAvant = db.jellyfin;
  /* Un champ vidé ne veut pas dire « plus de clé » mais « reprends celle du
     serveur » — sinon on casse l'app en essayant de la remettre par défaut. */
  db.apiKey = v('rgcle') || CFG.tmdbKey || '';
  db.region = (document.getElementById('rgregion')||{}).value || 'FR';
  db.catalogueUrl = v('rgcat') || CFG.catalogue || './cineflix.json';
  db.jellyfin = v('rgjelly');
  saveDB();
  toast('Réglages enregistrés');
  if(db.jellyfin !== jellyAvant) choisirJellyfin().then(()=>{ if(view === 'reglages') render(); });
  /* Un changement de clé ou de catalogue invalide ce qui est affiché :
     on recharge plutôt que de laisser des résultats périmés à l'écran. */
  if(db.apiKey !== cleAvant){ ui.disc.charge = false; ui.sorties.charge = false; if(db.apiKey) verifierCle(); }
  if(db.catalogueUrl !== catAvant) chargerCatalogue().then(render);
}

async function verifierCle(){
  try{ await tmdb('/configuration'); toast('Clé TMDB valide ✓'); }
  catch(e){ toast(e.message === 'BADKEY' ? 'Clé refusée par TMDB' : 'Impossible de vérifier la clé'); }
}

function exportData(){
  const blob = new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cineflix-'+todayISO()+'.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  toast('Sauvegarde générée');
}
const objetSimple = o => !!o && typeof o === 'object' && !Array.isArray(o);
function importData(input){
  const f = input.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ()=>{
    let d;
    try{ d = JSON.parse(r.result); }catch(e){ return toast('Fichier illisible'); }
    if(!objetSimple(d) || !objetSimple(d.items)) return toast('Ce fichier n\'est pas une sauvegarde Cinéflix');
    db.items = d.items;
    if(d.pseudo) db.pseudo = d.pseudo;
    if(d.apiKey) db.apiKey = d.apiKey;
    if(d.jellyfin) db.jellyfin = d.jellyfin;
    if(d.catalogueUrl) db.catalogueUrl = d.catalogueUrl;
    saveDB(); render(); toast('Données importées');
  };
  r.readAsText(f);
  input.value = '';
}
function toutEffacer(){
  openSheet('<h3>Tout effacer ?</h3>'+
    '<p class="small muted" style="margin:0 0 8px">Favoris et demandes seront supprimés '+
    'définitivement de cet appareil.</p>'+
    '<button class="opt danger" onclick="closeSheet();db.items={};saveDB();render();toast(\'Données effacées\')">'+
      'Oui, tout effacer</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}

/* ============================ Mise en route ============================ */
/* Quand la clé vient du serveur, l'écran qui l'explique n'a plus lieu d'être :
   on passe de trois étapes à deux, et l'arrivant n'entend jamais parler de TMDB. */
const ETAPES = ()=> cleFournie() ? ['nom','fin'] : ['nom','cle','fin'];
function demarrerAccueil(){ ui.pas = 0; ui.cleErr = ''; go('accueil'); }
function finirAccueil(dest){
  db.onboarde = true; saveDB();
  document.body.classList.remove('accueil');
  go(dest || 'decouvrir');
}
function pasSuivant(){
  if(ETAPES()[ui.pas||0] === 'nom'){
    const el = document.getElementById('prenom');
    const v = el ? el.value.trim() : '';
    if(v){ db.pseudo = v; saveDB(); }
  }
  ui.pas = Math.min(ETAPES().length-1, (ui.pas||0)+1);
  ui.cleErr = '';
  render();
}
function pasPrecedent(){ ui.pas = Math.max(0, (ui.pas||0)-1); ui.cleErr = ''; render(); }

/* La clé est vérifiée auprès de TMDB avant de laisser passer : mieux vaut
   une erreur ici qu'un catalogue vide sans explication. */
async function validerCle(){
  const el = document.getElementById('cle');
  const v = el ? el.value.trim() : '';
  if(!v){ ui.cleErr = 'Colle ta clé dans le champ ci-dessus.'; return render(); }
  const btn = document.getElementById('btncle');
  if(btn){ btn.setAttribute('disabled',''); btn.innerHTML = '<span class="spin"></span> Vérification…'; }
  const avant = db.apiKey;
  db.apiKey = v;
  try{
    await tmdb('/configuration');
    saveDB(); ui.cleErr = ''; pasSuivant();
  }catch(e){
    db.apiKey = avant;
    ui.cleErr = (e.message === 'BADKEY')
      ? 'TMDB refuse cette clé. Vérifie que tu as bien copié la ligne « Clé de l\'API (v3) ».'
      : 'Impossible de joindre TMDB. Vérifie ta connexion, puis réessaie.';
    render();
  }
}
function puces(n){
  let h = '<div class="puces">';
  const total = ETAPES().length;
  for(let i=0;i<total;i++) h += '<i class="'+(i===n?'on':'')+'"></i>';
  return h+'</div>';
}
function viewAccueil(){
  const n = ui.pas || 0;
  const etape = ETAPES()[n] || 'fin';
  let h = '<div class="acc">';
  if(etape === 'nom'){
    h += '<div class="acclogo">'+I.film+'</div>'+
      '<h1>Cinéflix</h1>'+
      '<p class="accsub">Tu parcours les films et les séries, tu vois d\'un coup d\'œil '+
      'ce qui est déjà sur le serveur, et tu demandes le reste.</p>'+
      '<label class="fld" style="margin-top:26px"><span>Comment tu t\'appelles ?</span>'+
        '<input type="text" id="prenom" value="'+esc(db.pseudo||'')+'" placeholder="Ton prénom" '+
        'autocomplete="given-name" onkeydown="if(event.key===\'Enter\'){this.blur();pasSuivant()}">'+
        '<em>Sert à signer tes demandes.</em></label>'+
      '<button class="btn block" style="margin-top:20px" onclick="pasSuivant()">Commencer</button>';
  }
  else if(etape === 'cle'){
    h += '<h1>Une clé, une seule fois</h1>'+
      '<p class="accsub">Les affiches, les résumés et les dates de sortie viennent de '+
      '<b>TMDB</b>. C\'est gratuit, mais il faut une clé personnelle. Trois minutes, '+
      'une fois pour toutes.</p>'+
      '<ol class="etapes">'+
        '<li>Crée un compte sur <a href="https://www.themoviedb.org/signup" target="_blank" rel="noopener">themoviedb.org</a></li>'+
        '<li>Ouvre <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">Paramètres → API</a>'+
          ' et demande une clé pour un <i>usage personnel</i></li>'+
        '<li>Copie la ligne <b>Clé de l\'API (v3)</b> et colle-la ici</li>'+
      '</ol>'+
      '<label class="fld"><span>Ta clé TMDB</span>'+
        '<input type="text" id="cle" value="'+esc(db.apiKey||'')+'" placeholder="Colle ta clé ici" '+
        'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" '+
        'onkeydown="if(event.key===\'Enter\'){this.blur();validerCle()}"></label>'+
      (ui.cleErr ? '<div class="accerr">'+esc(ui.cleErr)+'</div>' : '')+
      '<button class="btn block" id="btncle" style="margin-top:16px" onclick="validerCle()">'+
        'Vérifier et continuer</button>'+
      '<div class="accliens"><button onclick="pasPrecedent()">Retour</button>'+
        '<button onclick="pasSuivant()">Plus tard</button></div>';
  }
  else{
    const qui = (db.pseudo||'').trim();
    const n2 = CAT.movie.size + CAT.tv.size;
    h += '<div class="acclogo ok">'+I.check+'</div>'+
      '<h1>'+(qui ? 'Tout est prêt, '+esc(qui) : 'Tout est prêt')+'</h1>'+
      '<p class="accsub">'+
        (n2 ? 'Cinéflix contient '+n2+' titres. Les puces <b>Tout · Sur Cinéflix · Pas encore</b> '+
              'en haut de l\'écran filtrent le catalogue selon ce que tu peux déjà regarder.'
            : 'Le catalogue du serveur n\'est pas encore accessible : tu pourras quand même '+
              'parcourir et mettre en favori, mais sans savoir ce qui est déjà là.')+
      '</p>'+
      '<button class="btn block" style="margin-top:22px" onclick="finirAccueil(\'decouvrir\')">'+
        'Explorer le catalogue</button>';
  }
  return h + puces(n) + '</div>';
}

/* ============================ Démarrage ============================ */
async function boot(){
  await loadDB();
  askPersist();

  /* Avec Supabase, tout part du compte : le catalogue, les favoris et les
     demandes vivent derrière l'authentification. Sans session valide, il n'y
     a rien à afficher — on va droit à l'écran de connexion. */
  if(sbPret() && !connecte()){
    document.body.classList.remove('booting');
    view = 'auth'; render();
    return;
  }

  // Le catalogue passe avant le premier rendu : les pastilles doivent être justes d'emblée.
  await chargerCatalogue();
  if(sbPret() && connecte()){
    await Promise.all([ chargerElements().catch(()=>{}), verifierAdmin() ]);
    pousserEnAttente();
    majProfil();
  }
  document.body.classList.remove('booting');
  render();
  /* La recherche du serveur ne bloque pas l'affichage : elle ne sert qu'au
     bouton « Regarder », qui n'apparaît que sur une fiche. */
  choisirJellyfin();
  /* La mise en route se déroule au premier lancement même quand la clé vient
     du serveur : elle sert aussi à demander le prénom et à expliquer les
     puces de présence. Seule l'étape de la clé disparaît. */
  if(!db.onboarde) demarrerAccueil();
  else if(!db.apiKey) go('reglages', {from:'decouvrir'});
  if(memoryOnly) toast('Stockage indisponible sur cet appareil');
}
/* Un démarrage qui échoue ne doit jamais laisser un écran noir : le voile
   « booting » est retiré quoi qu'il arrive, on affiche ce qu'on peut et on le
   dit. C'est arrivé en vrai avec une session dont le compte n'existait plus. */
boot().catch(()=>{
  document.body.classList.remove('booting');
  try{
    view = (sbPret() && !connecte()) ? 'auth' : 'decouvrir';
    render();
    toast('Démarrage incomplet — recharge la page');
  }catch(e){}
});

if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('./sw.js').catch(()=>{}); });
}
