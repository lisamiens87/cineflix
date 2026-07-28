"use strict";
/* ============================ Compte & serveur ============================
   Supabase porte trois choses : les comptes, les favoris et demandes de
   chacun, et le catalogue poussé par le NAS. Sans Supabase configuré, l'app
   retombe sur le mode local du prototype — rien ne casse, les demandes
   restent simplement sur l'appareil. */

const SB = { url:(CFG.supabase||{}).url || '', key:(CFG.supabase||{}).key || '' };
const sbPret   = ()=> !!(SB.url && SB.key);
const connecte = ()=> !!(db.auth && db.auth.token && db.auth.uid);
const sbBase   = ()=> String(SB.url).replace(/\/+$/,'');

let estAdmin = false;
let file = { lignes:[], charge:false, occupe:false, err:'', filtre:'demande' };

async function sbFetch(path, opt, retry){
  opt = opt || {};
  const h = Object.assign({ apikey: SB.key, 'Content-Type':'application/json' }, opt.headers||{});
  if(connecte() && !opt.noAuth) h.Authorization = 'Bearer ' + db.auth.token;
  const r = await fetch(sbBase()+path, Object.assign({}, opt, {headers:h}));
  /* Un jeton expiré ne doit pas ressembler à une panne : on le renouvelle
     une fois, en silence, et on rejoue la requête. Si même le renouvellement
     échoue, la session est morte — compte supprimé, par exemple — et la
     garder ferait de l'app un zombie où plus rien ne répond : on déconnecte
     proprement, direction l'écran de connexion. */
  if(r.status === 401 && connecte() && !opt.noAuth){
    if(!retry && await sbRefresh()) return sbFetch(path, opt, true);
    sessionMorte();
  }
  const txt = await r.text();
  let body = null;
  try{ body = txt ? JSON.parse(txt) : null; }catch(e){ body = txt; }
  if(!r.ok){
    const msg = (body && (body.msg || body.message || body.error_description || body.error))
                || ('erreur '+r.status);
    const err = new Error(msg); err.status = r.status; throw err;
  }
  return body;
}

/* ---------- Session ---------- */
function appliquerSession(d){
  if(!d || !d.access_token) throw new Error('réponse inattendue du serveur');
  db.auth = { token:d.access_token, refresh:d.refresh_token,
              uid:(d.user&&d.user.id) || (db.auth&&db.auth.uid),
              email:(d.user&&d.user.email) || (db.auth&&db.auth.email) };
  saveDB();
  return db.auth;
}
async function sbSignUp(email, mdp){
  const d = await sbFetch('/auth/v1/signup', {method:'POST', noAuth:true,
    body: JSON.stringify({email, password:mdp})});
  if(d && d.access_token) return appliquerSession(d);
  throw new Error('CONFIRM');            // confirmation par e-mail activée côté Supabase
}
async function sbSignIn(email, mdp){
  const d = await sbFetch('/auth/v1/token?grant_type=password', {method:'POST', noAuth:true,
    body: JSON.stringify({email, password:mdp})});
  return appliquerSession(d);
}
async function sbRefresh(){
  try{
    const d = await sbFetch('/auth/v1/token?grant_type=refresh_token', {method:'POST', noAuth:true,
      body: JSON.stringify({refresh_token: db.auth.refresh})});
    appliquerSession(d); return true;
  }catch(e){ return false; }
}
/* La session ne peut plus être sauvée (jeton mort, compte supprimé…) :
   on purge et on ramène à la connexion avec un mot d'explication, plutôt
   que de laisser chaque écran échouer en silence. */
function sessionMorte(){
  db.auth = null; db.items = {};
  estAdmin = false; file.charge = false;
  saveDB();
  ui.auth = { mode:'connexion', err:'Ta session a expiré — reconnecte-toi.', occupe:false };
  if(typeof view !== 'undefined' && view !== 'auth'){
    view = 'auth'; params = {};
    try{ render(); }catch(e){}
  }
}

function seDeconnecter(){
  openSheet('<h3>Se déconnecter ?</h3>'+
    '<p class="small muted" style="margin:0 0 8px">Tes favoris et tes demandes restent '+
    'sur le serveur : tu les retrouveras en te reconnectant.</p>'+
    '<button class="opt danger" onclick="closeSheet();deconnexionConfirmee()">Se déconnecter</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}
function deconnexionConfirmee(){
  db.auth = null; db.items = {};
  estAdmin = false; file.charge = false;
  saveDB();
  ui.auth = { mode:'connexion', err:'', occupe:false };
  go('auth');
}

/* ---------- Notifications push ---------- */
/* L'appareil s'abonne auprès de son navigateur (clé publique VAPID de
   config.js) et dépose l'abonnement dans Supabase ; c'est le NAS qui s'en
   sert pour prévenir quand un titre demandé arrive. */
function b64versUint8(s){
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const raw = atob((s + pad).replace(/-/g,'+').replace(/_/g,'/'));
  const t = new Uint8Array(raw.length);
  for(let i = 0; i < raw.length; i++) t[i] = raw.charCodeAt(i);
  return t;
}
const notifsPossibles = ()=> !!(CFG.pushCle && sbPret() &&
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);

async function activerNotifs(){
  if(!notifsPossibles() || !connecte()) return;
  try{
    const perm = await Notification.requestPermission();
    if(perm !== 'granted') return toast('Notifications refusées par l\'appareil');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub) sub = await reg.pushManager.subscribe({
      userVisibleOnly:true, applicationServerKey: b64versUint8(CFG.pushCle) });
    const j = sub.toJSON();
    await sbFetch('/rest/v1/push_abonnements', {method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ endpoint: sub.endpoint, user_id: db.auth.uid,
        p256dh: j.keys.p256dh, auth: j.keys.auth })});
    db.notifs = true; saveDB();
    toast('Notifications activées ✓');
  }catch(e){
    toast('Activation impossible — '+(e.message || 'réessaie'));
  }
  if(view === 'profil') render();
}

async function couperNotifs(){
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub){
      await sbFetch('/rest/v1/push_abonnements?endpoint=eq.'+
        encodeURIComponent(sub.endpoint),
        {method:'DELETE', headers:{ Prefer:'return=minimal' }}).catch(()=>{});
      await sub.unsubscribe();
    }
  }catch(e){}
  db.notifs = false; saveDB();
  toast('Notifications coupées');
  if(view === 'profil') render();
}

/* ---------- Profil public ---------- */
async function majProfil(){
  if(!connecte()) return;
  const pseudo = (db.pseudo||'').trim() || (db.auth.email||'').split('@')[0];
  db.pseudo = pseudo; saveDB();
  try{
    await sbFetch('/rest/v1/profils', {method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: db.auth.uid, pseudo: pseudo, maj: new Date().toISOString() })});
  }catch(e){}
}

/* ---------- Catalogue ---------- */
async function catalogueDepuisSupabase(){
  const r = await sbFetch('/rest/v1/catalogue?select=movies,tv,maj,items&id=eq.1', {});
  const d = (Array.isArray(r) && r[0]) || {};
  CAT.movie = new Set((d.movies||[]).map(Number));
  CAT.tv    = new Set((d.tv||[]).map(Number));
  CAT.items = Array.isArray(d.items) ? d.items : [];
  CAT.maj   = d.maj ? String(d.maj).slice(0,10) : null;
  CAT.charge = true; CAT.erreur = '';
}

/* ---------- Éléments : favoris et demandes ---------- */
/* Le serveur fait foi. On remplace le cache local à chaque chargement plutôt
   que de fusionner : un utilisateur, quelques dizaines de titres, toujours en
   ligne au moment d'agir — la machinerie de fusion de « Mes Séries » serait
   ici de la complexité sans contrepartie. */
async function chargerElements(){
  if(!connecte()) return;
  const l = await sbFetch('/rest/v1/elements?select=*&user_id=eq.'+
                          encodeURIComponent(db.auth.uid), {});
  const neuf = {};
  (l||[]).forEach(e=>{
    neuf[cle(e.type, e.tmdb_id)] = {
      type:e.type, id:e.tmdb_id, titre:e.titre, poster:e.poster, date:e.sortie,
      fav:!!e.fav, req: e.demande ? { statut:e.statut, le:Date.parse(e.cree_le)||Date.now() } : null,
      ajoute: Date.parse(e.cree_le) || Date.now()
    };
  });
  db.items = neuf;
  saveDB();
}

async function verifierAdmin(){
  if(!connecte()) return false;
  try{
    const r = await sbFetch('/rest/v1/admins?select=user_id&user_id=eq.'+
                            encodeURIComponent(db.auth.uid), {});
    estAdmin = Array.isArray(r) && r.length > 0;
  }catch(e){ estAdmin = false; }
  return estAdmin;
}

/* Écriture immédiate, et marquage en cas d'échec pour réessayer plus tard :
   un geste fait hors réseau ne doit pas disparaître en silence. */
async function pousser(it){
  if(!sbPret() || !connecte() || !it) return;
  try{
    await sbFetch('/rest/v1/elements', {method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: db.auth.uid, type: it.type, tmdb_id: it.id,
        titre: it.titre, poster: it.poster, sortie: it.date,
        fav: !!it.fav, demande: !!it.req,
        statut: (it.req && it.req.statut) || 'demande'
      })});
    delete it.aPousser;
  }catch(e){ it.aPousser = true; }
  saveDB();
}
async function retirer(type, id){
  if(!sbPret() || !connecte()) return;
  try{
    await sbFetch('/rest/v1/elements?user_id=eq.'+encodeURIComponent(db.auth.uid)+
                  '&type=eq.'+type+'&tmdb_id=eq.'+id,
                  {method:'DELETE', headers:{ Prefer:'return=minimal' }});
  }catch(e){}
}
/* Rattrapage au démarrage des gestes faits hors ligne. */
async function pousserEnAttente(){
  const restes = Object.values(db.items).filter(it => it.aPousser);
  for(const it of restes) await pousser(it);
}

/* ============================ Écran : connexion ============================ */
function setAuthMode(m){ ui.auth = Object.assign(ui.auth||{}, {mode:m, err:''}); render(); }

async function envoyerAuth(){
  const email = (document.getElementById('acmail')||{}).value || '';
  const mdp   = (document.getElementById('acpass')||{}).value || '';
  const mode  = (ui.auth||{}).mode || 'connexion';
  if(!email.trim() || !mdp) return setAuthErr('Renseigne ton e-mail et ton mot de passe.');
  if(mode === 'creation' && mdp.length < 6)
    return setAuthErr('Le mot de passe doit faire au moins 6 caractères.');

  ui.auth.occupe = true; ui.auth.err = ''; render();
  try{
    if(mode === 'creation') await sbSignUp(email.trim(), mdp);
    else                    await sbSignIn(email.trim(), mdp);
    ui.auth.occupe = false;
    await apresConnexion();
  }catch(e){
    ui.auth.occupe = false;
    const m = String(e.message||'');
    if(m === 'CONFIRM')
      setAuthErr('Compte créé. Confirme l\'e-mail que tu viens de recevoir, puis connecte-toi.');
    else if(/invalid login/i.test(m))
      setAuthErr('E-mail ou mot de passe incorrect.');
    else if(/already registered|already been registered/i.test(m))
      setAuthErr('Un compte existe déjà avec cet e-mail. Connecte-toi plutôt.');
    else setAuthErr(m || 'Échec de la connexion.');
  }
}
function setAuthErr(t){ ui.auth = Object.assign(ui.auth||{}, {err:t, occupe:false}); render(); }

async function apresConnexion(){
  await majProfil();
  await Promise.all([ catalogueDepuisSupabase().catch(e=>{ CAT.erreur = e.message; }),
                      chargerElements().catch(()=>{}),
                      verifierAdmin() ]);
  await pousserEnAttente();
  db.onboarde = true; saveDB();
  choisirJellyfin();
  go('decouvrir');
}

function viewAuth(){
  const a = ui.auth || (ui.auth = {mode:'connexion', err:'', occupe:false});
  const creation = a.mode === 'creation';
  let h = '<div class="acc">'+
    '<div class="acclogo">'+I.film+'</div>'+
    '<h1>'+esc(CFG.nom||'Cinéflix')+'</h1>'+
    '<p class="accsub">'+(creation
      ? 'Crée ton compte : tes favoris et tes demandes te suivront sur tous tes appareils.'
      : 'Connecte-toi pour retrouver tes favoris et tes demandes.')+'</p>'+
    '<label class="fld" style="margin-top:24px"><span>Adresse e-mail</span>'+
      '<input type="text" id="acmail" inputmode="email" autocapitalize="off" autocorrect="off" '+
      'spellcheck="false" placeholder="toi@exemple.fr" '+
      'value="'+esc((db.auth&&db.auth.email)||'')+'"></label>'+
    '<label class="fld"><span>Mot de passe</span>'+
      '<input type="password" id="acpass" placeholder="'+
      (creation?'au moins 6 caractères':'ton mot de passe')+'" '+
      'onkeydown="if(event.key===\'Enter\'){this.blur();envoyerAuth()}">'+
      (creation ? '<em>Choisis un mot de passe dédié à cette app.</em>' : '')+'</label>'+
    (a.err ? '<div class="accerr">'+esc(a.err)+'</div>' : '')+
    '<button class="btn block" style="margin-top:16px" '+(a.occupe?'disabled':'')+
      ' onclick="envoyerAuth()">'+
      (a.occupe ? '<span class="spin"></span> Un instant…'
                : (creation ? 'Créer mon compte' : 'Se connecter'))+'</button>'+
    '<div class="accliens">'+
      (creation
        ? '<button onclick="setAuthMode(\'connexion\')">J\'ai déjà un compte</button>'
        : '<button onclick="setAuthMode(\'creation\')">Créer un compte</button>')+
    '</div>';
  return h + '</div>';
}

/* ============================ Écran : la file (admin) ============================ */
const LIB_FILE = { demande:'En attente', encours:'En cours', refuse:'Refusée' };

async function chargerFile(){
  if(!estAdmin) return;
  file.occupe = true; file.err = '';
  if(view === 'file') render();
  try{
    const l = await sbFetch('/rest/v1/file_demandes?select=*&order=cree_le.desc', {});
    file.lignes = l || [];
    file.charge = true;
  }catch(e){ file.err = e.message || 'lecture impossible'; }
  file.occupe = false;
  if(view === 'file') render();
}

async function changerStatut(uid, type, id, statut){
  closeSheet();
  try{
    await sbFetch('/rest/v1/elements?user_id=eq.'+encodeURIComponent(uid)+
                  '&type=eq.'+type+'&tmdb_id=eq.'+id,
                  {method:'PATCH', headers:{ Prefer:'return=minimal' },
                   body: JSON.stringify({ statut: statut })});
    const l = file.lignes.find(x => x.user_id === uid && x.type === type && x.tmdb_id === id);
    if(l) l.statut = statut;
    render();
    toast('Marqué « '+LIB_FILE[statut]+' »');
  }catch(e){ toast('Échec : '+e.message); }
}

function menuFile(uid, type, id){
  const l = file.lignes.find(x => x.user_id === uid && x.type === type && x.tmdb_id === id) || {};
  const b = (s, lib)=> l.statut === s ? '' :
    '<button class="opt" onclick="changerStatut(\''+uid+'\',\''+type+'\','+id+',\''+s+'\')">'+lib+'</button>';
  openSheet('<h3>'+esc(l.titre||'')+'</h3>'+
    '<p class="small muted" style="margin:0 0 8px">Demandé par '+esc(l.pseudo||'?')+
    ' · '+esc(relatif(String(l.cree_le||'').slice(0,10)))+'</p>'+
    b('encours','Marquer « en cours d\'ajout »')+
    b('demande','Remettre en attente')+
    b('refuse','Refuser la demande')+
    '<button class="opt" onclick="closeSheet();ouvrirFiche('+id+',\''+type+'\',\'file\')">'+
      'Ouvrir la fiche</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}

function setFiltreFile(f){ file.filtre = f; render(); }

function viewFile(){
  const FILTRES = [ {id:'demande',label:'En attente'}, {id:'encours',label:'En cours'},
                    {id:'refuse',label:'Refusées'},    {id:'tout',label:'Tout'} ];
  /* Les demandes déjà présentes sur le serveur n'ont plus rien à faire dans
     une file de traitement : le catalogue les a résolues. */
  const actives = file.lignes.filter(l => !surCineflix(l.type, l.tmdb_id));
  const arrivees = file.lignes.filter(l => surCineflix(l.type, l.tmdb_id));
  const compte = {
    demande: actives.filter(l=>l.statut==='demande').length,
    encours: actives.filter(l=>l.statut==='encours').length,
    refuse:  actives.filter(l=>l.statut==='refuse').length,
    tout:    actives.length
  };
  const sub = '<div class="chips">'+FILTRES.map(f=>
    '<button class="chip '+(file.filtre===f.id?'on':'')+'" onclick="setFiltreFile(\''+f.id+'\')">'+
    f.label+' <span style="opacity:.65">'+compte[f.id]+'</span></button>').join('')+'</div>';

  let html = header('File de demandes', {back:'goBack()', sub:sub,
    right:'<button class="iconbtn" onclick="chargerFile()">'+I.horloge+'</button>'});

  if(file.occupe && !file.charge)
    return html + '<div class="empty"><span class="spin"></span>'+
      '<p style="margin-top:12px">Chargement…</p></div>';
  if(file.err)
    return html + '<div class="empty"><h3>Lecture impossible</h3><p>'+esc(file.err)+'</p>'+
      '<button class="btn ghost" onclick="chargerFile()">Réessayer</button></div>';

  const liste = file.filtre === 'tout' ? actives : actives.filter(l => l.statut === file.filtre);
  if(!liste.length)
    html += '<div class="empty">'+I.envoi+'<h3>Rien ici</h3>'+
      '<p>Aucune demande dans cette catégorie.</p></div>';
  else
    html += '<div class="list">'+liste.map(ligneFile).join('')+'</div>';

  if(arrivees.length)
    html += '<div class="sectitle">Résolues<span class="cnt">'+arrivees.length+'</span></div>'+
      '<div class="list">'+arrivees.slice(0,20).map(ligneFile).join('')+'</div>';

  return html + '<div style="height:26px"></div>';
}

function ligneFile(l){
  const dispo = surCineflix(l.type, l.tmdb_id);
  const cls = dispo ? 'dispo' : l.statut === 'refuse' ? 'refuse'
            : l.statut === 'encours' ? 'encours' : 'demande';
  const lib = dispo ? 'Sur Cinéflix' : LIB_FILE[l.statut] || 'En attente';
  return '<div class="lrow">'+
    (l.poster ? '<img class="lposter" loading="lazy" src="'+IMG(l.poster,'w154')+'" alt="">'
              : '<div class="lposter"></div>')+
    '<div class="cinfo" onclick="ouvrirFiche('+l.tmdb_id+',\''+l.type+'\',\'file\')">'+
      '<div class="cname2">'+esc(l.titre||'')+'</div>'+
      '<div class="csub">'+esc(l.pseudo||'?')+' · '+
        esc(relatif(String(l.cree_le||'').slice(0,10)))+
        (l.type === 'tv' ? ' · série' : '')+'</div>'+
      '<span class="pastille '+cls+'">'+lib+'</span>'+
    '</div>'+
    '<button class="iconbtn" onclick="menuFile(\''+l.user_id+'\',\''+l.type+'\','+l.tmdb_id+')">'+
      I.dots+'</button>'+
  '</div>';
}
