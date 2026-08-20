"use strict";
/* ============================ Profil ============================ */

function viewProfil(){
  const L = lots();
  const nom = (db.pseudo||'').trim();
  const mp = ui.monProfil || {};
  const tailleCat = CAT.movie.size + CAT.tv.size;

  let html = header('Profil', {
    right:'<button class="iconbtn" onclick="go(\'reglages\',{from:\'profil\'})">'+I.dots+'</button>'});

  html += '<div class="phead">'+avatarHtml(mp.avatar, 'moyen', nom)+
    '<div><div style="font-size:18px;font-weight:700">'+esc(nom || 'Sans nom')+'</div>'+
    '<div class="small muted">'+
      (mp.jellyfin ? 'Compte serveur : '+esc(mp.jellyfin) : 'Premier Rang')+'</div></div></div>';

  /* Deux gestes qu'on cherche là, et nulle part ailleurs : refaire le tour de
     ses goûts, et rendre l'app à quelqu'un d'autre. */
  html += '<div class="wrap" style="padding-top:0">'+
    '<button class="btn ghost block" style="margin-bottom:8px" onclick="ouvrirGuide()">'+
      '✨ Laisse-moi te guider</button>'+
    '<div class="deuxbtn">'+
      '<button class="btn ghost" onclick="ouvrirGouts()">Mes goûts</button>'+
      '<button class="btn ghost" onclick="changerDeProfil()">Changer de profil</button>'+
    '</div>'+
  '</div>';

  html += '<div class="stats">'+
    '<div class="stat"><b>'+L.favoris.length+'</b><span>favori'+(L.favoris.length>1?'s':'')+'</span></div>'+
    '<div class="stat"><b>'+L.demandes.length+'</b><span>demande'+(L.demandes.length>1?'s':'')+'</span></div>'+
    '<div class="stat"><b>'+L.arrives.length+'</b><span>arrivé'+(L.arrives.length>1?'s':'')+'</span></div>'+
  '</div>';

  /* L'état du catalogue est la première chose à vérifier quand quelque chose
     paraît faux : on l'affiche en clair plutôt que de le cacher. */
  html += '<div class="sectitle">Le serveur Premier Rang</div><div class="wrap" style="padding-top:0">'+
    '<div class="card" style="padding:14px">'+
      (CAT.erreur
        ? '<div style="font-weight:660;color:var(--warn)">Catalogue introuvable</div>'+
          '<div class="small muted" style="margin-top:4px">'+esc(CAT.erreur)+
          '. Le filtre « Sur Premier Rang » ne peut pas fonctionner.</div>'
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
      /* Prévenu quand une demande arrive — même app fermée. Le bouton
         n'apparaît que si l'appareil et la configuration le permettent. */
      (typeof notifsPossibles === 'function' && notifsPossibles() && connecte()
        ? '<button class="btn ghost block" style="margin-top:8px" onclick="'+
            (db.notifs ? 'couperNotifs()' : 'activerNotifs()')+'">'+
            (db.notifs ? '🔕 Couper les notifications' : '🔔 Être prévenu quand une demande arrive')+
          '</button>'
        : '')+
    '</div></div>';

  /* La file n'apparaît que pour qui la traite : les autres n'ont pas à savoir
     qu'elle existe, et surtout pas à voir les demandes des autres. */
  if(estAdmin){
    const enAttente = file.charge
      ? file.lignes.filter(l => l.statut === 'demande' && !surCineflix(l.type, l.tmdb_id)).length
      : null;
    const nAcces = acces.charge ? acces.lignes.length : null;
    html += '<div class="sectitle">Administration</div><div class="wrap" style="padding-top:0">'+
      '<button class="btn block" onclick="go(\'file\');chargerFile()">'+I.envoi+
        ' File de demandes'+(enAttente ? ' ('+enAttente+')' : '')+'</button>'+
      /* Les demandes d'ACCÈS sont d'une autre nature que les demandes de
         titres : quelqu'un attend derrière, et il ne voit rien tant que tu
         n'as pas tranché. Le bouton se teinte quand il y en a. */
      '<button class="btn '+(nAcces ? '' : 'ghost ')+'block" style="margin-top:8px" '+
        'onclick="go(\'acces\');chargerAcces()">'+I.user+
        ' Demandes d\'accès'+(nAcces ? ' ('+nAcces+')' : '')+'</button>'+
      /* Les membres déjà validés : attribuer leur compte serveur, retirer un
         accès, supprimer un profil (3008j). */
      '<button class="btn ghost block" style="margin-top:8px" '+
        'onclick="go(\'membres\');chargerMembres()">'+I.user+
        ' Membres du foyer</button>'+
      /* Inviter quelqu'un : tout le début de la procédure (envoyer le lien
         et les trois étapes) tient dans un message WhatsApp prérempli.
         Il ne reste à l'admin que la validation, dans Demandes d'accès. */
      '<button class="btn ghost block" style="margin-top:8px" onclick="inviterWhatsApp()">'+
        '💬 Inviter quelqu\'un (WhatsApp)</button>'+
      '<div class="tiny muted center" style="margin-top:8px">'+
        'Les titres réclamés, les personnes qui veulent entrer, '+
        'et l\'invitation prête à envoyer.</div>'+
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
    /* « Ce soir » a remplacé la vue Premier Rang seule (fusion 3008b). */
    '<button class="btn ghost block" style="margin-bottom:10px" onclick="ui.presence=\'soir\';ui.disc.charge=false;go(\'decouvrir\')">'+
      I.serveur+' Parcourir ce que je peux regarder ce soir</button>'+
    /* Le calendrier a son écran depuis 3008p : le raccourci ouvre l'onglet
       Cinéma, sur téléphone comme sur bureau. */
    '<button class="btn ghost block" style="margin-bottom:10px" onclick="ui.sorties.mode=\'bluray\';ui.sorties.charge=false;ui.cineVolet=\'sorties\';allerCinema()">'+
      I.disque+' Prochaines sorties Blu-ray</button>'+
    '<button class="btn ghost block" onclick="go(\'reglages\',{from:\'profil\'})">Réglages</button>'+
  '</div>';

  return html + '<div class="wrap tiny muted center" style="padding-bottom:30px">'+
    'Premier Rang · données films et séries fournies par TMDB'+
    /* Le numéro de version, posé par index.html : quand un téléphone semble
       afficher une vieille version, ce numéro tranche en un coup d'œil. */
    (window.BUILD ? ' · v'+esc(window.BUILD) : '')+'</div>';
}

/* Inviter quelqu'un sur WhatsApp : wa.me sans numéro ouvre WhatsApp sur le
   choix du destinataire, le message déjà écrit. Les trois étapes collent au
   vrai parcours (Créer un profil : prénom, e-mail, code à six chiffres,
   puis « Envoyer ma demande » que l'admin valide). */
function inviterWhatsApp(){
  const msg =
    "🍿 Je t'invite sur Premier Rang, notre cinéma à la maison !\n\n"+
    "1️⃣ Ouvre ce lien sur ton téléphone :\n"+location.origin+location.pathname+"\n"+
    "2️⃣ Touche « Créer un profil » : ton prénom, ton e-mail et un code à six chiffres.\n"+
    "3️⃣ Touche « Envoyer ma demande » — je la valide de mon côté et tu entres.\n\n"+
    "💡 Astuce : dans le menu du navigateur, « Ajouter à l'écran d'accueil » "+
    "pour l'avoir comme une vraie appli.";
  window.open('https://wa.me/?text='+encodeURIComponent(msg), '_blank');
}

async function lierJellyfin(u){
  ui.monProfil = Object.assign(ui.monProfil||{}, {jellyfin: u});
  render();
  try{ await majProfil(); toast(u ? 'Relié à « '+u+' »' : 'Lien retiré'); }
  catch(e){ toast('Enregistrement impossible'); }
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

  const mp = ui.monProfil || {};
  html += '<div class="sectitle">Moi</div><div class="wrap" style="padding-top:0">'+
    '<label class="fld"><span>Mon prénom</span>'+
      '<input type="text" id="rgpseudo" value="'+esc(db.pseudo||'')+'" placeholder="Ton prénom" '+
      'autocomplete="given-name">'+
      '<em>Sert à signer tes demandes.</em></label>'+
    /* ⚠️ LE COMPTE SERVEUR NE SE CHOISIT PAS SOI-MÊME (3008j). Jusqu'ici
       chacun pouvait cocher n'importe lequel — Caroline pouvait se déclarer
       « Dad » et hériter de ses reprises. C'est l'administrateur qui
       attribue, au moment d'ouvrir l'accès ; ici on ne fait que le dire. */
    '<div class="rgbloc" style="margin-top:4px">'+
      '<div class="rglbl" style="text-align:left">Mon compte sur le serveur</div>'+
      '<div class="card" style="padding:12px;margin-top:6px">'+
        (mp.jellyfin
          ? '<div style="font-weight:660">'+esc(mp.jellyfin)+'</div>'+
            '<div class="tiny muted" style="margin-top:4px">C\'est ce compte qui '+
              'reprend un film là où tu l\'avais laissé, et c\'est lui que tu '+
              'choisis dans Swiftfin ou Jellyfin sur ta télé.</div>'
          : '<div style="font-weight:660">Aucun</div>'+
            '<div class="tiny muted" style="margin-top:4px">Tout Premier Rang '+
              'fonctionne, sauf « Continuer la lecture ». Demande à '+
              'l\'administrateur du foyer s\'il t\'en faut un.</div>')+
      '</div>'+
    '</div>'+
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

  html += '<div class="sectitle">Le serveur Premier Rang</div><div class="wrap" style="padding-top:0">'+
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
    '<label class="fld"><span>Ta ville</span>'+
      '<input type="text" id="rgville" value="'+esc(db.ville||'')+'" placeholder="ex. Limoges">'+
      '<em>Sert au bouton « Séances près de chez moi » des films à l\'affiche. '+
      'Reste sur cet appareil, comme les autres réglages.</em></label>'+
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
  db.ville = v('rgville');
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
    if(!objetSimple(d) || !objetSimple(d.items)) return toast('Ce fichier n\'est pas une sauvegarde Premier Rang');
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
/* Le parcours d'accueil vit désormais dans app-09 (viewBienvenue) : il ne
   demande plus seulement un prénom, il recueille les goûts. Ne restent ici
   que la validation de la clé TMDB, qui en est une étape possible. */

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
    saveDB(); ui.cleErr = ''; bienvSuivant();
  }catch(e){
    db.apiKey = avant;
    ui.cleErr = (e.message === 'BADKEY')
      ? 'TMDB refuse cette clé. Vérifie que tu as bien copié la ligne « Clé de l\'API (v3) ».'
      : 'Impossible de joindre TMDB. Vérifie ta connexion, puis réessaie.';
    render();
  }
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
    /* Des têtes déjà connues sur cet appareil ? On montre la grille plutôt
       qu'un formulaire : c'est tout le principe de l'écran d'accueil. */
    view = foyerListe().length ? 'accueil' : 'auth';
    ui.accueil = { gere:false };
    render();
    return;
  }

  /* Le statut d'accès AVANT tout le reste : un compte en attente n'a rien à
     charger, et Supabase ne lui renverrait de toute façon rien. */
  if(sbPret() && connecte()){
    await chargerMonProfil();
    if(!accesValide()){
      document.body.classList.remove('booting');
      view = 'attente'; params = {}; render();
      return;
    }
  }

  // Le catalogue passe avant le premier rendu : les pastilles doivent être justes d'emblée.
  await chargerCatalogue();
  if(sbPret() && connecte()){
    await Promise.all([ chargerElements().catch(()=>{}), chargerGouts().catch(()=>{}),
                        verifierAdmin() ]);
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
  if(estAdmin) chargerAcces();
  if(!db.onboarde) demarrerBienvenue();
  else if(!db.apiKey) go('reglages', {from:'decouvrir'});
  if(memoryOnly) toast('Stockage indisponible sur cet appareil');
}
/* Un démarrage qui échoue ne doit jamais laisser un écran noir : le voile
   « booting » est retiré quoi qu'il arrive, on affiche ce qu'on peut et on le
   dit. C'est arrivé en vrai avec une session dont le compte n'existait plus. */
function secours(e){
  /* On GARDE la trace : un démarrage muet a coûté une soirée de recherche.
     Elle est lisible dans la console et dans window.__bootErr. */
  window.__bootErr = (e && (e.stack || e.message)) || String(e);
  try{ console.error('Premier Rang — démarrage interrompu :', e); }catch(x){}
  document.body.classList.remove('booting');
  /* Chaque étape à part : si l'une échoue, les suivantes doivent quand même
     s'exécuter — sinon l'écran reste noir, exactement ce qu'on veut éviter. */
  try{
    const hs = (typeof sbPret === 'function') && sbPret();
    const co = (typeof connecte === 'function') && connecte();
    view = (hs && !co) ? ((db.foyer||[]).length ? 'accueil' : 'auth') : 'decouvrir';
  }catch(x){ view = 'decouvrir'; }
  try{ render(); }catch(x){
    try{ document.getElementById('app').innerHTML =
      '<div class="empty"><h3>Démarrage impossible</h3>'+
      '<p>Recharge la page. Si ça persiste, préviens l\'administrateur.</p>'+
      '<button class="btn ghost" onclick="location.reload()">Recharger</button></div>';
    }catch(y){}
  }
  try{ toast('Démarrage incomplet — recharge la page'); }catch(x){}
}

/* Le démarrage attend que TOUS les fichiers de l'app soient exécutés.
   Sans cette attente, boot() partait à la fin de app-07 et pouvait reprendre
   — dès la première microtâche, quand le stockage répond instantanément —
   avant que app-08 à app-10 aient posé leurs fonctions. */
function lancer(){ try{ boot().catch(secours); }catch(e){ secours(e); } }
if(document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', lancer, {once:true});
else
  lancer();

if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('./sw.js').catch(()=>{}); });
}
