"use strict";
/* ============================ Profils du foyer ============================
   Trois choses vivent ici : les avatars, l'écran « qui regarde ce soir ? »,
   et le parcours d'inscription qui recueille les goûts.

   Un choix structurant : la grille d'avatars est alimentée par l'APPAREIL
   (db.foyer), jamais par le serveur. Lire la liste des profils avant d'être
   connecté supposerait de la rendre publique — donc d'exposer les prénoms du
   foyer à qui trouve l'adresse de l'app. L'appareil se souvient de qui s'y est
   connecté, ce qui donne le même résultat en pratique : sur la tablette du
   salon, après un passage de chacun, tout le monde a sa tête. */

/* ---------- Avatars ---------- */
/* Aucun fichier à héberger : soit un cercle coloré avec un emoji, soit une
   affiche déjà servie par TMDB. */
const AV_COULEURS = ['#e11d48','#f97316','#f59e0b','#84cc16','#10b981','#14b8a6',
                     '#06b6d4','#3b82f6','#6366f1','#8b5cf6','#d946ef','#ec4899'];
const AV_EMOJIS = ['🍿','🎬','🎥','⭐','🎯','🦊','🐼','🐯','🦁','🚀','🎸','🌵'];

function avatarDefaut(pseudo){
  /* Une couleur stable par prénom : deux personnes différentes n'ont pas la
     même, et la même personne garde la sienne d'un appareil à l'autre. */
  const s = String(pseudo||'?');
  let n = 0;
  for(let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) % 997;
  return { type:'couleur', c: AV_COULEURS[n % AV_COULEURS.length], e:'' };
}

function avatarHtml(av, cls, pseudo){
  av = (av && av.type) ? av : avatarDefaut(pseudo);
  if(av.type === 'poster' && av.p)
    return '<span class="av '+(cls||'')+'"><img src="'+IMG(av.p,'w185')+'" alt=""></span>';
  const dedans = av.e || (String(pseudo||'?').trim().charAt(0).toUpperCase() || '?');
  return '<span class="av '+(cls||'')+'" style="background:'+esc(av.c || AV_COULEURS[0])+'">'+
         esc(dedans)+'</span>';
}

/* ---------- Le foyer, côté appareil ---------- */
/* On ne stocke jamais de code ici : e-mail, prénom, avatar, dernière venue. */
function foyerListe(){
  return (db.foyer||[]).slice().sort((a,b)=> (b.vu||0) - (a.vu||0));
}
function foyerNoter(e){
  if(!e || !e.email) return;
  if(!Array.isArray(db.foyer)) db.foyer = [];
  const bas = String(e.email).toLowerCase();
  const dej = db.foyer.find(x => String(x.email||'').toLowerCase() === bas);
  if(dej) Object.assign(dej, e, { vu: Date.now() });
  else db.foyer.push(Object.assign({}, e, { vu: Date.now() }));
  if(db.foyer.length > 8) db.foyer = foyerListe().slice(0,8);
  saveDB();
}
function foyerOublier(email){
  const bas = String(email||'').toLowerCase();
  db.foyer = (db.foyer||[]).filter(x => String(x.email||'').toLowerCase() !== bas);
  saveDB();
  toast('Profil retiré de cet appareil');
  render();
}

/* ============================ Écran : qui regarde ? ============================ */
function viewAccueil(){
  const l = foyerListe();
  const gere = !!(ui.accueil && ui.accueil.gere);

  let h = '<div class="acc large">'+
    '<div class="acclogo">'+I.film+'</div>'+
    '<h1>'+esc(CFG.nom||'Premier Rang')+'</h1>'+
    '<p class="accsub">Qui regarde ce soir ?</p>'+
    '<div class="avgrid">';

  l.forEach(p=>{
    h += '<div class="avcase">'+
      '<button class="avchoix" onclick="'+(gere
        ? 'foyerOublier(\''+esc(p.email).replace(/'/g,"\\'")+'\')'
        : 'choisirProfil(\''+esc(p.email).replace(/'/g,"\\'")+'\')')+'">'+
        avatarHtml(p.avatar, 'grand', p.pseudo)+
        (gere ? '<span class="avx">'+I.close+'</span>' : '')+
      '</button>'+
      '<div class="avnom">'+esc(p.pseudo || String(p.email||'').split('@')[0])+'</div>'+
    '</div>';
  });

  if(!gere)
    h += '<div class="avcase">'+
      '<button class="avchoix" onclick="nouveauProfil()">'+
        '<span class="av grand vide">'+I.plus+'</span></button>'+
      '<div class="avnom muted">Ajouter</div>'+
    '</div>';

  h += '</div>';

  if(l.length)
    h += '<div class="accliens"><button onclick="basculerGestion()">'+
      (gere ? 'Terminé' : 'Gérer les profils')+'</button></div>';

  return h + '</div>';
}
function basculerGestion(){
  ui.accueil = { gere: !(ui.accueil && ui.accueil.gere) };
  render();
}
function choisirProfil(email){
  const p = foyerListe().find(x => String(x.email||'').toLowerCase() === String(email).toLowerCase());
  ui.auth = { mode:'code', email:email, pseudo:(p&&p.pseudo)||'', avatar:(p&&p.avatar)||null,
              code:'', motdepasse:false, err:'', occupe:false };
  go('auth');
}
function nouveauProfil(){
  ui.auth = { mode:'inscription', code:'', err:'', occupe:false };
  go('auth');
}
function changerDeProfil(){
  /* On quitte la session mais on garde la liste des têtes : le but est
     justement de revenir vite à une autre. */
  db.auth = null; db.items = {}; db.itemsUid = '';
  estAdmin = false; file.charge = false;
  GOUTS.d = null; GOUTS.charge = false;
  if(typeof oublierAccueil === 'function') oublierAccueil();
  saveDB();
  ui.accueil = { gere:false };
  go(foyerListe().length ? 'accueil' : 'auth');
}

/* ============================ Les goûts ============================ */
/* Table à part de `profils` : celle-ci n'est lisible que par son propriétaire.
   Le prénom et l'avatar restent publics au foyer — la file admin en a besoin —
   mais ce que quelqu'un aime ne regarde que lui. */
const GOUTS = { d:null, charge:false };

const GENRES_FILM = [
  {id:28,n:'Action'},      {id:12,n:'Aventure'},    {id:16,n:'Animation'},
  {id:35,n:'Comédie'},     {id:80,n:'Crime'},       {id:99,n:'Documentaire'},
  {id:18,n:'Drame'},       {id:10751,n:'Familial'}, {id:14,n:'Fantastique'},
  {id:36,n:'Histoire'},    {id:27,n:'Horreur'},     {id:10402,n:'Musique'},
  {id:9648,n:'Mystère'},   {id:10749,n:'Romance'},  {id:878,n:'Science-Fiction'},
  {id:53,n:'Thriller'},    {id:10752,n:'Guerre'},   {id:37,n:'Western'}
];
const nomGenre = id => (GENRES_FILM.find(g=>g.id===id)||{}).n || '';

async function chargerGouts(){
  if(!connecte()) return;
  try{
    const l = await sbFetch('/rest/v1/gouts?select=data&user_id=eq.'+
                            encodeURIComponent(db.auth.uid), {});
    GOUTS.d = (Array.isArray(l) && l[0] && l[0].data) ? l[0].data : null;
    GOUTS.charge = true;
  }catch(e){ GOUTS.d = null; GOUTS.charge = true; }
}
async function enregistrerGouts(d){
  GOUTS.d = d; GOUTS.charge = true;
  /* Changer ses goûts doit se voir tout de suite sur l'accueil, pas au
     prochain rechargement de la page. */
  if(typeof oublierAccueil === 'function'){
    oublierAccueil();
    if(typeof view !== 'undefined' && view === 'decouvrir'){ try{ render(); }catch(e){} }
  }
  if(!connecte()) return;
  try{
    await sbFetch('/rest/v1/gouts', {method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: db.auth.uid, data: d, maj: new Date().toISOString() })});
  }catch(e){ /* les goûts sont un confort : leur perte ne bloque rien */ }
}
const aGouts = ()=> !!(GOUTS.d && ((GOUTS.d.aimes||[]).length || (GOUTS.d.totems||[]).length));

/* ============================ Parcours d'inscription ============================ */
/* Sautable de bout en bout. Un parcours entièrement passé laisse les goûts
   vides : le guide fonctionne quand même, mais par l'humeur seule, et il le dit. */
let BROUILLON = null;

function etapesBienvenue(){
  /* 3008a — l'écran « Deux ou trois détails » est supprimé (verdict
     d'Alexandre : aucune de ses questions ne valait d'être posée, et la VO
     n'était branchée sur rien). Le parcours tient en sept écrans. */
  const l = ['hello','avatar','aimes','fuis','totems','plats','fin'];
  if(!cleFournie() && !db.apiKey) l.splice(1, 0, 'cle');
  return l;
}
/* « Mes goûts » depuis le profil : quand ils existent déjà, on ne rejoue
   PAS le parcours (reproche d'Alexandre du 11/08 — « il me propose de
   refaire la manip ») : on montre les choix, plateformes modifiables SUR
   PLACE, et une porte « Refaire mon guide » pour qui veut tout reprendre.
   Premier passage : le parcours, comme avant. */
function ouvrirGouts(){
  if(!aGouts()) return demarrerBienvenue();
  ficheGouts();
}
function basculerPlatGout(id){
  const g = GOUTS.d || (GOUTS.d = {});
  const l = g.plats || (g.plats = []);
  const i = l.indexOf(id);
  if(i >= 0) l.splice(i, 1); else l.push(id);
  /* Toucher une pastille EST une réponse : zéro coché veut alors dire
     « aucun abonnement », pas « je n'ai rien dit » (3008h). */
  g.platsDit = true;
  enregistrerGouts(g);
  ficheGouts();
}
function ficheGouts(){
  const g = GOUTS.d || {};
  const plats = g.plats || [];
  openSheet('<h3>Mes goûts</h3>'+
    '<div class="fgrp">Où je peux regarder'+
      (plats.length ? ' — Premier Rang + '+plats.length
        : (g.platsDit ? ' — Premier Rang seul' : ' — Premier Rang + toutes les plateformes'))+'</div>'+
    '<div class="fchips">'+
      '<button class="chip c-flix on" onclick="toast(\'Ta bibliothèque Premier Rang est toujours incluse.\')">'+
        'Premier Rang ✓</button>'+
      PLATEFORMES.map(pf=>
      '<button class="chip '+pf.cl+' '+(plats.indexOf(pf.id) >= 0 ? 'on' : '')+
      '" onclick="basculerPlatGout('+pf.id+')">'+pf.nom+'</button>').join('')+'</div>'+
    '<div class="fgrp">Ce que j\'aime</div>'+
    '<div class="small muted">'+esc((g.aimes||[]).join(' · ') || '—')+'</div>'+
    '<div class="fgrp">Ce que je fuis</div>'+
    '<div class="small muted">'+esc((g.fuis||[]).join(' · ') || '—')+'</div>'+
    '<div class="fgrp">Mes films totems</div>'+
    '<div class="small muted">'+
      esc((g.totems||[]).map(t => t.title || t.nom || '').filter(Boolean).join(' · ') || '—')+'</div>'+
    '<button class="opt" style="margin-top:12px" onclick="closeSheet();demarrerBienvenue()">'+
      'Refaire mon guide (tout le parcours)</button>'+
    '<button class="opt" onclick="closeSheet()">Fermer</button>');
}

function demarrerBienvenue(){
  const g = GOUTS.d || {};
  BROUILLON = {
    pseudo: db.pseudo || '',
    avatar: (ui.monProfil && ui.monProfil.avatar) || null,
    aimes: (g.aimes||[]).slice(), fuis: (g.fuis||[]).slice(),
    totems: (g.totems||[]).slice(), plats: (g.plats||[]).slice(),
    vo: g.vo || 'peu', duree: g.duree || 0,
    vieux: g.vieux === undefined ? true : !!g.vieux,
    jellyfin: (ui.monProfil && ui.monProfil.jellyfin) || ''
  };
  ui.bienv = { pas:0, err:'', occupe:false, q:'', res:[], cherche:false };
  go('bienvenue');
}
function bienvSuivant(){
  const e = etapesBienvenue()[ui.bienv.pas];
  if(e === 'hello'){
    const v = (document.getElementById('bvnom')||{}).value || '';
    if(v.trim()) BROUILLON.pseudo = v.trim();
  }
  ui.bienv.pas = Math.min(etapesBienvenue().length - 1, ui.bienv.pas + 1);
  ui.bienv.err = '';
  render(); window.scrollTo(0,0);
}
function bienvPrecedent(){
  ui.bienv.pas = Math.max(0, ui.bienv.pas - 1);
  ui.bienv.err = '';
  render(); window.scrollTo(0,0);
}
function bascListe(champ, val){
  const l = BROUILLON[champ];
  const i = l.indexOf(val);
  if(i >= 0) l.splice(i,1); else l.push(val);
  render();
}
function bienvRegler(champ, val){ BROUILLON[champ] = val; render(); }
function choisirAvatar(c, e){ BROUILLON.avatar = { type:'couleur', c:c, e:e||'' }; render(); }
function choisirAvatarEmoji(e){
  const a = BROUILLON.avatar || avatarDefaut(BROUILLON.pseudo);
  BROUILLON.avatar = { type:'couleur', c: a.c || AV_COULEURS[0], e: (a.e === e ? '' : e) };
  render();
}

/* Les trois films adorés : la donnée la plus rentable du parcours. TMDB en
   tire directement ses recommandations et ses mots-clés. */
let bienvSeq = 0;
async function chercherTotem(){
  const q = (document.getElementById('bvq')||{}).value || '';
  ui.bienv.q = q;
  if(q.trim().length < 2){ ui.bienv.res = []; return peindreBienv(); }
  const seq = ++bienvSeq;
  ui.bienv.cherche = true; peindreBienv();
  try{
    const d = await tmdb('/search/movie', { query:q.trim(), include_adult:'false', page:'1' });
    if(seq !== bienvSeq) return;
    ui.bienv.res = (d.results||[]).filter(r=>r.poster_path).slice(0,12);
  }catch(e){ if(seq === bienvSeq) ui.bienv.res = []; }
  if(seq !== bienvSeq) return;
  ui.bienv.cherche = false; peindreBienv();
}
function ajouterTotem(id){
  const r = (ui.bienv.res||[]).find(x=>x.id === id);
  if(!r) return;
  if(BROUILLON.totems.some(t=>t.id === id)) return;
  if(BROUILLON.totems.length >= 3) return toast('Trois, c\'est déjà beaucoup');
  BROUILLON.totems.push({ id:r.id, t:'movie', titre:r.title||r.name,
                          poster:r.poster_path||'', annee:(r.release_date||'').slice(0,4) });
  ui.bienv.q = ''; ui.bienv.res = [];
  render();
}
function retirerTotem(id){
  BROUILLON.totems = BROUILLON.totems.filter(t=>t.id !== id);
  render();
}
function peindreBienv(){
  const el = document.getElementById('bvres');
  if(!el) return render();
  el.innerHTML = corpsTotems();
}

async function finirBienvenue(guider){
  ui.bienv.occupe = true; render();
  db.pseudo = (BROUILLON.pseudo||'').trim() || db.pseudo || '';
  db.onboarde = true; saveDB();
  ui.monProfil = Object.assign(ui.monProfil||{}, {
    avatar: BROUILLON.avatar, jellyfin: BROUILLON.jellyfin });
  try{ await majProfil(); }catch(e){}
  await enregistrerGouts({
    aimes: BROUILLON.aimes, fuis: BROUILLON.fuis, totems: BROUILLON.totems,
    /* platsDit : la personne EST passée par l'écran des abonnements, donc
       « aucun coché » est une réponse, pas un silence (3008h). */
    plats: BROUILLON.plats, platsDit: true,
    vo: BROUILLON.vo, duree: BROUILLON.duree,
    vieux: BROUILLON.vieux
  });
  ui.bienv.occupe = false;
  if(guider && typeof ouvrirGuide === 'function') return ouvrirGuide();
  go('decouvrir');
}

/* ---------- Le rendu du parcours ---------- */
function pucesBienv(){
  const t = etapesBienvenue().length;
  let h = '<div class="puces">';
  for(let i=0;i<t;i++) h += '<i class="'+(i === ui.bienv.pas ? 'on':'')+'"></i>';
  return h+'</div>';
}
function piedBienv(opts){
  opts = opts||{};
  return '<button class="btn block" style="margin-top:18px" onclick="'+
      (opts.action||'bienvSuivant()')+'">'+esc(opts.label||'Continuer')+'</button>'+
    '<div class="accliens">'+
      (ui.bienv.pas ? '<button onclick="bienvPrecedent()">Retour</button>' : '')+
      (opts.passer === false ? '' : '<button onclick="bienvSuivant()">Passer</button>')+
    '</div>';
}
function chipsGenres(champ, cls){
  return '<div class="gchips">'+GENRES_FILM.map(g=>
    '<button class="chip '+cls+' '+(BROUILLON[champ].indexOf(g.id)>=0?'on':'')+
    '" onclick="bascListe(\''+champ+'\','+g.id+')">'+esc(g.n)+'</button>').join('')+'</div>';
}
function corpsTotems(){
  let h = '';
  if(BROUILLON.totems.length)
    h += '<div class="totems">'+BROUILLON.totems.map(t=>
      '<button class="totem" onclick="retirerTotem('+t.id+')">'+
        (t.poster ? '<img src="'+IMG(t.poster,'w185')+'" alt="">' : '<span class="ph"></span>')+
        '<span class="totemx">'+I.close+'</span>'+
        '<span class="totemn">'+esc(t.titre)+'</span>'+
      '</button>').join('')+'</div>';
  if(ui.bienv.cherche) h += '<div class="center" style="padding:14px"><span class="spin"></span></div>';
  else if((ui.bienv.res||[]).length)
    h += '<div class="totems res">'+ui.bienv.res.map(r=>
      '<button class="totem" onclick="ajouterTotem('+r.id+')">'+
        '<img src="'+IMG(r.poster_path,'w185')+'" alt="">'+
        '<span class="totemn">'+esc(r.title||r.name)+'</span>'+
      '</button>').join('')+'</div>';
  return h;
}

function viewBienvenue(){
  if(!BROUILLON) demarrerBienvenue();
  const e = etapesBienvenue()[ui.bienv.pas] || 'fin';
  let h = '<div class="acc large">';
  /* Relancé volontairement (les goûts existent déjà) : on peut en SORTIR
     sans le finir — être enfermé dans le parcours forçait à tuer l'app
     (vécu Alexandre, 11/08). Au premier passage, pas de porte : le
     parcours se saute étape par étape, il ne s'abandonne pas. */
  if(db.onboarde)
    h += '<button class="iconbtn accquitte" onclick="go(\'profil\',{},\'back\')" '+
         'aria-label="Quitter sans changer">'+I.back+'</button>';

  if(e === 'hello'){
    h += '<div class="acclogo">'+I.film+'</div>'+
      '<h1>Bienvenue sur '+esc(CFG.nom||'Premier Rang')+'</h1>'+
      '<p class="accsub">Quelques questions rapides, et l\'app saura quoi te proposer '+
      'au lieu de te laisser devant une grille de milliers de titres.</p>'+
      '<label class="fld" style="margin-top:22px"><span>Comment tu t\'appelles ?</span>'+
        '<input type="text" id="bvnom" value="'+esc(BROUILLON.pseudo||'')+'" '+
        'placeholder="Ton prénom" autocomplete="given-name" '+
        'onkeydown="if(event.key===\'Enter\'){this.blur();bienvSuivant()}">'+
        '<em>Sert à signer tes demandes.</em></label>'+
      piedBienv({label:'Commencer', passer:false});
  }

  else if(e === 'cle'){
    h += '<h1>Une clé, une seule fois</h1>'+
      '<p class="accsub">Les affiches et les résumés viennent de <b>TMDB</b>. '+
      'C\'est gratuit, mais il faut une clé personnelle.</p>'+
      '<label class="fld"><span>Ta clé TMDB</span>'+
        '<input type="text" id="cle" value="'+esc(db.apiKey||'')+'" placeholder="Colle ta clé ici" '+
        'autocomplete="off" autocapitalize="off" spellcheck="false"></label>'+
      (ui.cleErr ? '<div class="accerr">'+esc(ui.cleErr)+'</div>' : '')+
      '<button class="btn block" id="btncle" style="margin-top:16px" onclick="validerCle()">'+
        'Vérifier et continuer</button>'+
      '<div class="accliens"><button onclick="bienvPrecedent()">Retour</button>'+
        '<button onclick="bienvSuivant()">Plus tard</button></div>';
  }

  else if(e === 'avatar'){
    const a = BROUILLON.avatar || avatarDefaut(BROUILLON.pseudo);
    h += '<h1>Ta tête</h1>'+
      '<p class="accsub">C\'est elle qui apparaîtra sur l\'écran d\'accueil, et à côté '+
      'de tes demandes.</p>'+
      '<div class="avapercu">'+avatarHtml(a, 'grand', BROUILLON.pseudo)+'</div>'+
      '<div class="avcouls">'+AV_COULEURS.map(c=>
        '<button class="avcoul'+(a.c === c ? ' on':'')+'" style="background:'+c+'" '+
        'onclick="choisirAvatar(\''+c+'\',\''+esc(a.e||'')+'\')" aria-label="couleur"></button>').join('')+
      '</div>'+
      '<div class="avemos">'+AV_EMOJIS.map(x=>
        '<button class="avemo'+(a.e === x ? ' on':'')+'" onclick="choisirAvatarEmoji(\''+x+'\')">'+
        x+'</button>').join('')+'</div>'+
      '<div class="tiny muted center" style="margin-top:10px">'+
        'Sans emoji, c\'est l\'initiale de ton prénom qui s\'affiche.</div>'+
      piedBienv({});
  }

  else if(e === 'aimes'){
    h += '<h1>Qu\'est-ce que tu aimes ?</h1>'+
      '<p class="accsub">Choisis-en autant que tu veux. Rien n\'est définitif — '+
      'tu pourras revenir là-dessus quand tu veux.</p>'+
      chipsGenres('aimes','aime')+
      piedBienv({});
  }

  else if(e === 'fuis'){
    h += '<h1>Et ce que tu fuis ?</h1>'+
      '<p class="accsub">Ces genres seront écartés de tes suggestions. '+
      'Ils resteront visibles si tu les cherches toi-même.</p>'+
      chipsGenres('fuis','fuis')+
      piedBienv({});
  }

  else if(e === 'totems'){
    h += '<h1>Trois films que tu as adorés</h1>'+
      '<p class="accsub">C\'est la question qui compte le plus : de trois titres, '+
      'on déduit bien mieux tes goûts que de dix cases cochées.</p>'+
      '<label class="fld"><span>Cherche un film</span>'+
        '<input type="text" id="bvq" value="'+esc(ui.bienv.q||'')+'" '+
        'placeholder="Un titre…" autocomplete="off" spellcheck="false" '+
        'oninput="chercherTotem()"></label>'+
      '<div id="bvres">'+corpsTotems()+'</div>'+
      piedBienv({});
  }

  else if(e === 'plats'){
    h += '<h1>Tes abonnements</h1>'+
      '<p class="accsub">On ne te proposera que ce que tu peux regarder ce soir : '+
      'la bibliothèque du serveur, et ces plateformes-là.</p>'+
      '<div class="gchips">'+
        '<button class="chip plat c-flix on" onclick="toast(\'Ta bibliothèque Premier Rang est toujours incluse.\')">'+
          'Premier Rang ✓</button>'+
        PLATEFORMES.map(p=>
        /* Aux couleurs de marque, comme dans les filtres et Mes goûts :
           onze pastilles grises se ressemblent toutes (3008f). */
        '<button class="chip plat '+p.cl+' '+(BROUILLON.plats.indexOf(p.id)>=0?'on':'')+
        '" onclick="bascListe(\'plats\','+p.id+')">'+esc(p.nom)+'</button>').join('')+
      '</div>'+
      '<div class="tiny muted center" style="margin-top:12px">'+
        'Aucun abonnement coché ? Les suggestions se limiteront à Premier Rang.</div>'+
      piedBienv({});
  }

  else{
    const n = BROUILLON.totems.length, g = BROUILLON.aimes.length;
    h += '<div class="acclogo ok">'+I.check+'</div>'+
      '<h1>'+(BROUILLON.pseudo ? 'Tout est prêt, '+esc(BROUILLON.pseudo) : 'Tout est prêt')+'</h1>'+
      '<p class="accsub">'+
        (g || n ? 'On sait quoi te proposer'+
            (n ? ' — à commencer par ce qui ressemble à '+esc(BROUILLON.totems[0].titre) : '')+'.'
              : 'Tu as tout passé, et c\'est très bien : le guide marchera à l\'humeur.')+
      '</p>'+
      /* 3008a — demande d'Alexandre : plus de choix abstrait entre « guider »
         et « explorer » à la toute fin. Un seul bouton qui ouvre l'app, et un
         retour discret. Le guide reste à un doigt, dans la barre du bas. */
      '<button class="btn block" style="margin-top:20px" '+(ui.bienv.occupe?'disabled':'')+
        ' onclick="finirBienvenue(false)">'+
        (ui.bienv.occupe ? '<span class="spin"></span> Un instant…' : '🍿 C\'est parti, bonne séance !')+
      '</button>'+
      '<div class="accliens"><button onclick="bienvPrecedent()">Retour</button></div>';
  }

  return h + pucesBienv() + '</div>';
}
