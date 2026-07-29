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
  /* Si le cache local appartient à un AUTRE compte, il part à la poubelle
     avant que quoi que ce soit puisse être réécrit sous cette identité. */
  changerDIdentite(db.auth.uid);
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
  db.auth = null; db.items = {}; db.itemsUid = '';
  estAdmin = false; file.charge = false;
  if(typeof GOUTS === 'object'){ GOUTS.d = null; GOUTS.charge = false; }
  saveDB();
  ui.auth = { mode:'connexion', err:'Ta session a expiré — reconnecte-toi.', occupe:false, code:'' };
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
  db.auth = null; db.items = {}; db.itemsUid = '';
  estAdmin = false; file.charge = false;
  if(typeof GOUTS === 'object'){ GOUTS.d = null; GOUTS.charge = false; }
  saveDB();
  ui.auth = { mode:'connexion', err:'', occupe:false, code:'' };
  /* On garde les têtes mémorisées : se déconnecter, dans une app familiale,
     c'est presque toujours pour laisser la place à quelqu'un d'autre. */
  go((typeof foyerListe === 'function' && foyerListe().length) ? 'accueil' : 'auth');
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
/* Ce qui est ici est lisible par tout le foyer : le prénom et l'avatar, parce
   que la file de demandes en a besoin pour dire qui a demandé quoi. Ce qu'on
   AIME vit ailleurs, dans la table `gouts`, lisible par son seul propriétaire. */
async function majProfil(){
  if(!connecte()) return;
  const pseudo = (db.pseudo||'').trim() || (db.auth.email||'').split('@')[0];
  db.pseudo = pseudo; saveDB();
  const mp = ui.monProfil || {};
  const corps = { user_id: db.auth.uid, pseudo: pseudo, email: db.auth.email || null,
                  maj: new Date().toISOString() };
  if(mp.avatar) corps.avatar = mp.avatar;
  if(mp.jellyfin !== undefined) corps.jellyfin = mp.jellyfin || null;
  if(db.onboarde) corps.onboarde = true;
  try{
    await sbFetch('/rest/v1/profils', {method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(corps)});
  }catch(e){}
  /* L'appareil retient la tête : c'est elle qui fera la grille d'accueil. */
  if(typeof foyerNoter === 'function')
    foyerNoter({ email: db.auth.email, uid: db.auth.uid, pseudo: pseudo,
                 avatar: mp.avatar || null });
}

/* Un compte en attente (ou refusé) ne voit pas l'app. Ce test n'est que
   l'habillage : le catalogue lui est fermé par Supabase, pas par ce booléen. */
const accesValide = ()=> !ui.monProfil || ui.monProfil.statut === 'valide';
const accesRefuse = ()=> !!(ui.monProfil && ui.monProfil.statut === 'refuse');

async function chargerMonProfil(){
  if(!connecte()) return;
  try{
    const l = await sbFetch('/rest/v1/profils?select=pseudo,avatar,jellyfin,onboarde,statut'+
                            '&user_id=eq.'+encodeURIComponent(db.auth.uid), {});
    const p = (Array.isArray(l) && l[0]) || null;
    if(!p) return;
    /* Statut inconnu = on laisse passer : le vrai verrou est en base (politique
       RLS + déclencheur), cet écran n'est qu'une politesse. Bloquer ici sur une
       lecture ratée ferait un faux positif désagréable. */
    ui.monProfil = { avatar: (p.avatar && p.avatar.type) ? p.avatar : null,
                     jellyfin: p.jellyfin || '', onboarde: !!p.onboarde,
                     statut: p.statut || 'valide' };
    if(p.pseudo && p.pseudo !== 'Sans nom' && !(db.pseudo||'').trim()) db.pseudo = p.pseudo;
    /* Le serveur fait foi sur « a-t-il déjà fait le parcours » : un nouvel
       appareil ne doit pas le redemander à quelqu'un qui l'a déjà fait. */
    if(p.onboarde) db.onboarde = true;
    saveDB();
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
  await notesTelerama();
  await sortiesPhysiques();
}

/* Le calendrier des sorties physiques FR relevé par le NAS. Quelques
   centaines de lignes au plus : on prend tout d'un coup. */
async function sortiesPhysiques(){
  try{
    const l = await lireTout('/rest/v1/sorties_phys?select=titre,vo,annee,date,'+
      'edition,uhd,prix,tmdb_id,poster&order=date.asc');
    if(!Array.isArray(l)) return;
    SORTIES.l = l; SORTIES.charge = true;
  }catch(e){ /* sans calendrier, l'onglet Sorties retombe sur TMDB */ }
}

/* Lit une table ENTIÈRE, par pages.

   PIÈGE : PostgREST plafonne ses réponses à 1000 lignes, en silence. Un
   `limit=50000` ne provoque aucune erreur — il renvoie une liste tronquée.
   Passé les 1000 notes Télérama, l'app n'en aurait affiché qu'une partie,
   sans que rien ne le signale. */
async function lireTout(chemin, taille){
  taille = taille || 1000;
  const sep = chemin.indexOf('?') >= 0 ? '&' : '?';
  let out = [], debut = 0;
  for(;;){
    const lot = await sbFetch(chemin + sep + 'limit='+taille+'&offset='+debut, {});
    if(!Array.isArray(lot) || !lot.length) return out;
    out = out.concat(lot);
    if(lot.length < taille) return out;
    debut += taille;
    if(debut > 100000) return out;          // garde-fou
  }
}

/* Les notes Télérama : une table à part, indépendante de la bibliothèque —
   c'est elle qui permet d'afficher les T sur Cinéma et Plateformes. On ne
   charge que les titres NOTÉS (les autres n'ont rien à montrer). Une panne
   ici ne doit rien casser : l'app marche exactement pareil, sans les T. */
async function notesTelerama(){
  try{
    const l = await lireTout('/rest/v1/telerama?select=cle,t,verdict&t=gt.0');
    if(!Array.isArray(l)) return;
    const m = new Map();
    l.forEach(r => { if(r && r.cle) m.set(r.cle, { jt:r.t, jv:r.verdict||'' }); });
    TLR.m = m; TLR.charge = true;
  }catch(e){ /* sans notes, l'app fonctionne à l'identique */ }
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
  db.itemsUid = db.auth.uid;
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
  /* Garde-fou : ne JAMAIS écrire le cache d'un utilisateur sous l'identité
     d'un autre. Un onglet resté ouvert sur une session périmée s'arrête ici. */
  if(db.itemsUid && db.itemsUid !== db.auth.uid) return;
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
  if(db.itemsUid && db.itemsUid !== db.auth.uid) return;
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
/* Trois modes, volontairement distincts :
     code        — une tête a été choisie sur l'accueil : pavé à six chiffres ;
     connexion   — appareil neuf ou « ce n'est pas moi » : e-mail + code ;
     inscription — code d'invitation du foyer, puis création, puis parcours.
   Le code À SIX CHIFFRES est le mot de passe Supabase : rien de nouveau côté
   serveur, et donc aucune baisse de sécurité du protocole. Les comptes plus
   anciens ont un mot de passe alphanumérique — d'où la bascule « j'ai un mot
   de passe », sans laquelle cette refonte les verrouillerait dehors. */
function setAuthMode(m){
  ui.auth = Object.assign({}, ui.auth||{}, {mode:m, err:'', occupe:false, code:''});
  render();
}
function setAuthErr(t){ ui.auth = Object.assign(ui.auth||{}, {err:t, occupe:false}); render(); }
function authMotDePasse(){
  ui.auth.motdepasse = !ui.auth.motdepasse;
  ui.auth.code = ''; ui.auth.err = '';
  render();
}

function ptsHtml(){
  const c = (ui.auth.code||'');
  let h = '';
  for(let i=0;i<6;i++) h += '<i class="'+(i < c.length ? 'on' : '')+'"></i>';
  return h;
}
function peindrePts(){
  const el = document.getElementById('pts');
  if(!el) return render();
  el.innerHTML = ptsHtml();
}
function authTape(n){
  const a = ui.auth;
  if(a.occupe || (a.code||'').length >= 6) return;
  a.code = (a.code||'') + n;
  peindrePts();
  if(a.code.length === 6) setTimeout(()=>envoyerAuth(), 80);
}
function authEfface(){
  const a = ui.auth;
  if(a.occupe) return;
  a.code = (a.code||'').slice(0,-1);
  peindrePts();
}
function padHtml(){
  let h = '<div class="pts" id="pts">'+ptsHtml()+'</div><div class="pad">';
  for(let n=1;n<=9;n++) h += '<button onclick="authTape(\''+n+'\')">'+n+'</button>';
  h += '<button class="vide" tabindex="-1"></button>'+
       '<button onclick="authTape(\'0\')">0</button>'+
       '<button class="eff" onclick="authEfface()" aria-label="Effacer">⌫</button>';
  return h+'</div>';
}

async function envoyerAuth(){
  const a = ui.auth || {};
  const mode = a.mode || 'connexion';
  const champ = id => (document.getElementById(id)||{}).value || '';
  const email = (mode === 'code') ? (a.email||'') : champ('acmail');
  const secret = a.motdepasse ? champ('acpass') : (a.code||'');

  if(!String(email).trim()) return setAuthErr('Renseigne ton adresse e-mail.');
  if(!secret) return setAuthErr(a.motdepasse ? 'Renseigne ton mot de passe.'
                                             : 'Compose ton code à six chiffres.');

  ui.auth.occupe = true; ui.auth.err = ''; render();
  try{
    await sbSignIn(String(email).trim(), secret);
    ui.auth.occupe = false;
    await apresConnexion();
  }catch(e){
    ui.auth.code = '';
    const m = String(e.message||'');
    if(/invalid login/i.test(m))
      setAuthErr(a.motdepasse ? 'E-mail ou mot de passe incorrect.'
                              : 'Ce code ne correspond pas. Réessaie.');
    else setAuthErr(m || 'Échec de la connexion.');
  }
}

/* ---------- Inscription ---------- */
/* Plus de code d'invitation : n'importe qui peut DEMANDER un compte, et c'est
   l'administrateur qui ouvre la porte. Un secret partagé finissait de toute
   façon par circuler — et il était lisible dans le source de la page. */
async function creerCompte(){
  const champ = id => ((document.getElementById(id)||{}).value || '').trim();
  const prenom = champ('acnom'), email = champ('acmail');
  const c1 = champ('accode'), c2 = champ('accode2');
  if(!prenom) return setAuthErr('Dis-nous ton prénom.');
  if(!email)  return setAuthErr('Renseigne ton adresse e-mail.');
  if(!/^\d{6}$/.test(c1)) return setAuthErr('Le code doit faire exactement six chiffres.');
  if(c1 !== c2) return setAuthErr('Les deux codes ne sont pas identiques.');

  ui.auth.occupe = true; ui.auth.err = ''; render();
  try{
    await sbSignUp(email, c1);
    db.pseudo = prenom; db.onboarde = false; saveDB();
    ui.auth.occupe = false;
    /* Le profil est créé en attente (le déclencheur y veille) : on va droit
       à l'écran d'attente, sans passer par le parcours de goûts — il aura
       tout le temps une fois entré. */
    ui.monProfil = { avatar:null, jellyfin:'', onboarde:false, statut:'attente' };
    await majProfil();
    go('attente');
  }catch(e){
    ui.auth.occupe = false;
    const m = String(e.message||'');
    if(m === 'CONFIRM')
      setAuthErr('Compte créé. Confirme l\'e-mail que tu viens de recevoir, puis connecte-toi.');
    else if(/already registered|already been registered/i.test(m))
      setAuthErr('Un compte existe déjà avec cet e-mail. Connecte-toi plutôt.');
    else if(/password/i.test(m))
      setAuthErr('Code refusé par le serveur : il doit faire au moins six caractères.');
    else setAuthErr(m || 'Création impossible.');
  }
}

/* ---------- Écran d'attente ---------- */
async function rafraichirAcces(){
  ui.attenteOccupe = true; render();
  await chargerMonProfil();
  ui.attenteOccupe = false;
  if(accesValide()){ toast('Accès ouvert — bienvenue !'); return apresConnexion(); }
  render();
  if(accesRefuse()) return;
  toast('Toujours en attente');
}

function viewAttente(){
  const refuse = accesRefuse();
  let h = '<div class="acc">'+
    '<div class="acclogo'+(refuse?'':' ok')+'">'+(refuse ? I.close : I.horloge)+'</div>'+
    '<h1>'+(refuse ? 'Demande refusée' : 'Demande envoyée')+'</h1>'+
    '<p class="accsub">'+(refuse
      ? 'L\'administrateur n\'a pas donné suite à ta demande. '+
        'Si c\'est une erreur, parle-lui directement.'
      : 'Ton profil est créé. L\'administrateur de Cinéflix a été prévenu : '+
        'il ouvrira ton accès, et tu recevras une notification.')+'</p>'+
    '<div class="card" style="padding:14px;margin-top:20px;text-align:left">'+
      '<div class="small muted">Ton profil</div>'+
      '<div style="font-weight:660;margin-top:2px">'+esc(db.pseudo||'—')+'</div>'+
      '<div class="tiny muted" style="margin-top:4px">'+esc((db.auth&&db.auth.email)||'')+'</div>'+
    '</div>';
  if(!refuse)
    h += '<button class="btn block" style="margin-top:16px" '+(ui.attenteOccupe?'disabled':'')+
      ' onclick="rafraichirAcces()">'+
      (ui.attenteOccupe ? '<span class="spin"></span> Vérification…' : 'Vérifier maintenant')+
      '</button>';
  h += '<div class="accliens"><button onclick="deconnexionConfirmee()">Se déconnecter</button></div>';
  return h + '</div>';
}

async function apresConnexion(){
  await chargerMonProfil();
  /* Rien à charger tant que l'accès n'est pas ouvert — et de toute façon
     Supabase ne renverrait rien. */
  if(!accesValide()){ await majProfil(); return go('attente'); }
  await majProfil();
  await Promise.all([ catalogueDepuisSupabase().catch(e=>{ CAT.erreur = e.message; }),
                      chargerElements().catch(()=>{}),
                      chargerGouts().catch(()=>{}),
                      verifierAdmin() ]);
  await pousserEnAttente();
  choisirJellyfin();
  /* Quelqu'un qui n'a jamais fait le parcours y va maintenant : c'est lui qui
     donne au guide de quoi travailler. */
  if(!db.onboarde) return demarrerBienvenue();
  go('decouvrir');
}

/* ---------- Le rendu ---------- */
function viewAuth(){
  const a = ui.auth || (ui.auth = {mode:'connexion', err:'', occupe:false, code:''});

  if(a.mode === 'inscription') return viewInscription(a);

  const parTete = a.mode === 'code' && a.email;
  let h = '<div class="acc">';

  if(parTete){
    h += '<div class="avapercu">'+avatarHtml(a.avatar, 'grand', a.pseudo)+'</div>'+
      '<h1>'+esc(a.pseudo || String(a.email).split('@')[0])+'</h1>'+
      '<p class="accsub">'+(a.motdepasse ? 'Ton mot de passe' : 'Compose ton code')+'</p>';
  }else{
    h += '<div class="acclogo">'+I.film+'</div>'+
      '<h1>'+esc(CFG.nom||'Cinéflix')+'</h1>'+
      '<p class="accsub">Connecte-toi pour retrouver ta liste et tes demandes.</p>'+
      '<label class="fld" style="margin-top:22px"><span>Adresse e-mail</span>'+
        '<input type="text" id="acmail" inputmode="email" autocapitalize="off" '+
        'autocorrect="off" spellcheck="false" placeholder="toi@exemple.fr" '+
        'value="'+esc(a.email || (db.auth&&db.auth.email) || '')+'"></label>';
  }

  if(a.motdepasse){
    h += '<label class="fld"><span>Mot de passe</span>'+
      '<input type="password" id="acpass" placeholder="ton mot de passe" '+
      'onkeydown="if(event.key===\'Enter\'){this.blur();envoyerAuth()}"></label>';
  }else if(parTete){
    h += padHtml();
  }else{
    h += '<label class="fld"><span>Ton code</span>'+
      '<input type="password" id="acpass" inputmode="numeric" maxlength="6" '+
      'placeholder="six chiffres" '+
      'onkeydown="if(event.key===\'Enter\'){this.blur();ui.auth.motdepasse=true;envoyerAuth()}"></label>';
  }

  if(a.err) h += '<div class="accerr">'+esc(a.err)+'</div>';

  if(a.occupe)
    h += '<div class="center" style="margin-top:14px"><span class="spin"></span></div>';
  else if(!parTete || a.motdepasse)
    h += '<button class="btn block" style="margin-top:14px" onclick="'+
      (a.motdepasse ? 'envoyerAuth()' : 'ui.auth.motdepasse=true;envoyerAuth()')+
      '">Se connecter</button>';

  h += '<div class="accliens">'+
    (parTete ? '<button onclick="go(\'accueil\')">Ce n\'est pas moi</button>' : '')+
    '<button onclick="authMotDePasse()">'+
      (a.motdepasse ? 'J\'ai un code à six chiffres' : 'J\'ai un mot de passe')+'</button>'+
    '<button onclick="nouveauProfil()">Créer un profil</button>'+
  '</div>'+
  '<div class="tiny muted center" style="margin-top:14px">'+
    'Code oublié ? Demande à l\'administrateur de le réinitialiser.</div>';

  return h + '</div>';
}

function viewInscription(a){
  return '<div class="acc">'+
    '<div class="acclogo">'+I.user+'</div>'+
    '<h1>Demander un accès</h1>'+
    '<p class="accsub">Cinéflix est privé. Ta demande part à l\'administrateur du '+
    'foyer, qui ouvrira ton accès. Le code à six chiffres remplace le mot de passe : '+
    'plus simple à retenir, plus rapide à taper sur un canapé.</p>'+
    '<label class="fld" style="margin-top:20px"><span>Ton prénom</span>'+
      '<input type="text" id="acnom" placeholder="Ton prénom" autocomplete="given-name" '+
      'value="'+esc(db.pseudo||'')+'"></label>'+
    '<label class="fld"><span>Adresse e-mail</span>'+
      '<input type="text" id="acmail" inputmode="email" autocapitalize="off" '+
      'autocorrect="off" spellcheck="false" placeholder="toi@exemple.fr"></label>'+
    '<label class="fld"><span>Ton code</span>'+
      '<input type="password" id="accode" inputmode="numeric" maxlength="6" '+
      'placeholder="six chiffres"></label>'+
    '<label class="fld"><span>Confirme ton code</span>'+
      '<input type="password" id="accode2" inputmode="numeric" maxlength="6" '+
      'placeholder="les mêmes six chiffres" '+
      'onkeydown="if(event.key===\'Enter\'){this.blur();creerCompte()}"></label>'+
    (a.err ? '<div class="accerr">'+esc(a.err)+'</div>' : '')+
    '<button class="btn block" style="margin-top:14px" '+(a.occupe?'disabled':'')+
      ' onclick="creerCompte()">'+
      (a.occupe ? '<span class="spin"></span> Un instant…' : 'Envoyer ma demande')+'</button>'+
    '<div class="accliens">'+
      '<button onclick="setAuthMode(\'connexion\')">J\'ai déjà un profil</button>'+
    '</div>'+
  '</div>';
}

/* ============================ Demandes d'accès (admin) ============================ */
let acces = { lignes:[], charge:false, occupe:false, err:'' };

async function chargerAcces(){
  if(!estAdmin) return;
  acces.occupe = true; acces.err = '';
  if(view === 'acces') render();
  try{
    acces.lignes = await sbFetch('/rest/v1/profils?select=user_id,pseudo,email,statut,maj'+
                                 '&statut=eq.attente&order=maj.asc', {}) || [];
    acces.charge = true;
  }catch(e){ acces.err = e.message || 'lecture impossible'; }
  acces.occupe = false;
  if(view === 'acces' || view === 'profil') render();
}

async function deciderAcces(uid, decision, qui){
  closeSheet();
  try{
    /* return=representation, et PAS return=minimal : quand une règle de
       sécurité interdit l'écriture, Supabase répond 200 avec une liste VIDE,
       sans la moindre erreur. C'est exactement comme ça qu'une validation a
       pu paraître réussie tout en ne changeant rien du tout. On compte les
       lignes, et on le dit. */
    const r = await sbFetch('/rest/v1/profils?user_id=eq.'+encodeURIComponent(uid),
      {method:'PATCH', headers:{ Prefer:'return=representation' },
       body: JSON.stringify({ statut: decision, maj: new Date().toISOString() })});
    if(!Array.isArray(r) || !r.length)
      return toast('Refusé par le serveur — rien n\'a changé.');
    acces.lignes = acces.lignes.filter(l => l.user_id !== uid);
    render();
    toast(decision === 'valide' ? 'Accès ouvert à '+(qui||'ce profil')
                                : 'Demande refusée');
  }catch(e){ toast('Échec : '+(e.message||'réessaie')); }
}

function menuAcces(uid, qui){
  openSheet('<h3>'+esc(qui||'Demande d\'accès')+'</h3>'+
    '<p class="small muted" style="margin:0 0 8px">Une fois l\'accès ouvert, cette '+
    'personne voit tout le catalogue et peut demander des titres.</p>'+
    '<button class="opt" onclick="deciderAcces(\''+uid+'\',\'valide\',\''+
      esc(qui||'').replace(/'/g,"\\'")+'\')">Ouvrir l\'accès</button>'+
    '<button class="opt danger" onclick="deciderAcces(\''+uid+'\',\'refuse\',\''+
      esc(qui||'').replace(/'/g,"\\'")+'\')">Refuser</button>'+
    '<button class="opt" onclick="closeSheet()">Annuler</button>');
}

function viewAcces(){
  let html = header('Demandes d\'accès', {back:'goBack()',
    right:'<button class="iconbtn" onclick="chargerAcces()">'+I.horloge+'</button>'});

  if(acces.occupe && !acces.charge)
    return html + '<div class="empty"><span class="spin"></span>'+
      '<p style="margin-top:12px">Chargement…</p></div>';
  if(acces.err)
    return html + '<div class="empty"><h3>Lecture impossible</h3><p>'+esc(acces.err)+'</p>'+
      '<button class="btn ghost" onclick="chargerAcces()">Réessayer</button></div>';
  if(!acces.lignes.length)
    return html + '<div class="empty">'+I.user+'<h3>Aucune demande</h3>'+
      '<p>Personne n\'attend d\'accès à Cinéflix pour le moment.</p></div>';

  html += '<div class="list">'+acces.lignes.map(l =>
    '<div class="lrow">'+
      avatarHtml(null, 'moyen', l.pseudo)+
      '<div class="cinfo" style="margin-left:12px">'+
        '<div class="cname2">'+esc(l.pseudo||'Sans nom')+'</div>'+
        '<div class="csub">'+esc(l.email||'—')+' · '+
          esc(relatif(String(l.maj||'').slice(0,10)))+'</div>'+
      '</div>'+
      '<button class="iconbtn" onclick="menuAcces(\''+l.user_id+'\',\''+
        esc(l.pseudo||'').replace(/'/g,"\\'")+'\')">'+I.dots+'</button>'+
    '</div>').join('')+'</div>';

  return html + '<div class="wrap tiny muted center" style="padding-bottom:26px">'+
    'Tant que tu n\'as pas ouvert l\'accès, ces personnes ne voient rien de '+
    'Cinéflix — le catalogue leur est fermé côté serveur.</div>';
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
      '<div class="csub">'+avatarHtml(l.avatar, 'mini', l.pseudo)+' '+
        esc(l.pseudo||'?')+' · '+
        esc(relatif(String(l.cree_le||'').slice(0,10)))+
        (l.type === 'tv' ? ' · série' : '')+'</div>'+
      '<span class="pastille '+cls+'">'+lib+'</span>'+
    '</div>'+
    '<button class="iconbtn" onclick="menuFile(\''+l.user_id+'\',\''+l.type+'\','+l.tmdb_id+')">'+
      I.dots+'</button>'+
  '</div>';
}
