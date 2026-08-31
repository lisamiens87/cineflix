/* Mode Supabase : comptes, file partagée, catalogue distant.
   Supabase et TMDB sont simulés ; tout le reste est le vrai code. */
const { chromium } = require('playwright');

const SB = 'https://demo.supabase.co';
const UID = '11111111-2222-3333-4444-555555555555';
const CAT_MOVIES = [550, 27205, 155, 603, 680];

function film(id, titre){
  return { id, title:titre, name:titre, poster_path:'/p'+id+'.jpg', backdrop_path:'/b'+id+'.jpg',
    release_date:'2024-03-01', first_air_date:'2024-03-01', vote_average:7.5, vote_count:900,
    overview:'Synopsis', genres:[{id:28,name:'Action'}], runtime:120,
    number_of_seasons:2, number_of_episodes:16, status:'Released' };
}

const echecs = [];
const appels = [];                       // trace des écritures vers Supabase

/* Les trois tables de Ma vidéothèque, aux VRAIES tailles : c'est le seul
   moyen de prouver que la pagination franchit le plafond de PostgREST. */
const VTH_FILMS = 2307, VTH_EDTS = 18113;
const PALIERS = ['DVD','BLURAY','HD_COMPRESSE','UHD4K'];
function ligneVth(table, i){
  const cle = 'film ' + i + '|2000';
  if(table === '/rest/v1/videotheque')
    return { cle:cle, titre:'Film ' + i, annee:'2000', palier:PALIERS[i % 4],
             dossier:PALIERS[i % 4], chemin:'\\\\nas\\Films\\f' + i + '.mkv',
             taille_octets: 1073741824, date_modif:'2026-01-01' };
  /* Une édition pour un film sur trois : le reste alimente la file rouge. */
  return { cle:(i % 3 === 0 ? 'film ' + i + '|2000' : 'edition ' + i),
           titre:'Film ' + i, annee:'2000', realisateur:'R. Realisateur',
           editeur:'Editeur', meilleur_support:'UHD4K' };
}
let preferVth = '';                      // l'en-tête Prefer du dernier POST correction
let refusVth  = true;                    // le premier POST est refusé en douce
let refusSuppr = true;                   // le premier DELETE aussi

/* La file d'un proche, telle que la base la rendrait — et qu'elle CHANGE
   quand l'administrateur traite une demande. */
const file = [
  { user_id:'autre-uid', type:'movie', tmdb_id:990001, titre:'Demande d\'un proche',
    poster:'/x.jpg', sortie:'2025-01-01', statut:'demande', pseudo:'Camille',
    cree_le:new Date(Date.now()-2*86400000).toISOString() },
  { user_id:'autre-uid', type:'movie', tmdb_id:550, titre:'Fight Club',
    poster:'/y.jpg', sortie:'1999-10-15', statut:'demande', pseudo:'Camille',
    cree_le:new Date(Date.now()-9*86400000).toISOString() }
];

(async () => {
  const browser = await chromium.launch();
  /* Service worker désactivé : ses requêtes échappent à l'interception de
     Playwright, il resservirait le vrai config.js au lieu du faux. */
  const page = await browser.newPage({ viewport:{width:390,height:844},
                                       serviceWorkers:'block' });
  page.on('console', m => { if(m.type() === 'error') echecs.push('console: '+m.text()); });
  page.on('pageerror', e => echecs.push('pageerror: '+e.message));

  // les polices : servies vides, pour que le banc tourne aussi hors ligne
  await page.route('**://fonts.googleapis.com/**', r =>
    r.fulfill({status:200, contentType:'text/css', body:''}));
  await page.route('**://fonts.gstatic.com/**', r =>
    r.fulfill({status:200, contentType:'font/woff2', body:''}));

  // --- TMDB ---
  await page.route('**://api.themoviedb.org/**', route => {
    const u = new URL(route.request().url()); const p = u.pathname.replace('/3','');
    let body;
    if(p.startsWith('/genre/')) body = { genres:[{id:28,name:'Action'}] };
    else if(p.startsWith('/discover/')){
      const pg = Number(u.searchParams.get('page')||1); const res = [];
      for(let i=0;i<20;i++){ const id = pg===1 && i<5 ? CAT_MOVIES[i] : 900000+pg*100+i;
        res.push(film(id,'Titre '+id)); }
      body = { page:pg, total_pages:3, results:res };
    }
    else if(/\/(movie|tv)\/\d+$/.test(p)){
      const d = film(Number(p.split('/').pop()), 'Titre');
      d.credits = {cast:[]}; d.release_dates = {results:[]}; d['watch/providers'] = {results:{}};
      body = d;
    }
    else body = {};
    route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(body)});
  });
  await page.route('**://image.tmdb.org/**', r => r.fulfill({status:200, contentType:'image/gif',
    body: Buffer.from('R0lGODlhAQABAAAAACw=','base64')}));

  // --- Supabase ---
  let elements = [];
  await page.route(SB+'/**', route => {
    const req = route.request();
    const u = new URL(req.url());
    const p = u.pathname, m = req.method();
    appels.push(m+' '+p);
    const j = (o, s) => route.fulfill({status:s||200, contentType:'application/json',
      body: JSON.stringify(o)});

    if(p === '/auth/v1/token')
      return j({ access_token:'jeton', refresh_token:'refresh', user:{id:UID, email:'alex@exemple.fr'} });
    if(p === '/rest/v1/profils'){
      /* Un profil déjà enregistré, et déjà passé par le parcours d'accueil.
         Sans lui, la connexion enchaîne sur l'inscription — couverte par
         test-cineflix — et ce banc-ci n'atteint jamais son sujet. */
      if(m === 'GET') return j([{ user_id:UID, pseudo:'Alex', avatar:'',
                                  jellyfin:'', onboarde:true, statut:'valide' }]);
      return route.fulfill({status:204, body:''});
    }
    if(p === '/rest/v1/catalogue')
      return j([{ movies:CAT_MOVIES, tv:[1396], maj:'2026-07-27T08:00:00Z',
        /* fiches façon export enrichi : durées croissantes avec l'id, pour
           tester le tri local — la plus longue est 680 */
        items: CAT_MOVIES.map((id,k)=>({ t:'movie', id, nom:'Film '+id,
          sortie:'200'+k+'-01-01', ajout:'2026-07-'+(10+k), duree:90+k*10,
          cert:'FR-'+(k?k*4+2:12), note:6+k*0.5, noteCrit:50+k*10, vu:k,
          lu:k?'2026-07-0'+k:'', genres:['Action'] }))
          .concat([{ t:'tv', id:1396, nom:'Série', sortie:'2008-01-20',
            ajout:'2026-07-01', duree:47, cert:'FR-16', note:9,
            noteCrit:96, vu:3, lu:'2026-07-10', genres:['Drame'] }]) }]);
    /* Un profil qui a DÉJÀ répondu. Sans goûts en base, la connexion enchaîne
       sur le parcours d'inscription — couvert par test-cineflix — et ce
       banc-ci n'atteint jamais son sujet : les comptes, la file, le catalogue
       distant. Zéro abonnement déclaré, pour que « Cinémathèque » se limite à
       la bibliothèque (3008z) et que les comptes soient exacts. */
    if(p === '/rest/v1/gouts')
      return j([{ data:{ aimes:[28], fuis:[], totems:[], plats:[], platsDit:true } }]);
    if(p === '/rest/v1/admins')   return j([{ user_id:UID }]);       // on teste le cas admin
    if(p === '/rest/v1/elements'){
      if(m === 'GET') return j(elements);
      if(m === 'POST'){ elements.push(JSON.parse(req.postData()||'{}')); return route.fulfill({status:201, body:''}); }
      if(m === 'PATCH'){
        /* Deux raisons de faire vrai ici. La base APPLIQUE le changement — un
           banc qui répond toujours la même chose ferait revenir la demande
           traitée « en attente ». Et `changerStatut` demande
           `Prefer: return=representation` puis COMPTE les lignes rendues :
           « une écriture bloquée par une règle de sécurité répond 200 avec une
           liste vide » (app-08-compte.js). Un 204 sans corps était donc lu
           comme un refus, et rien ne bougeait à l'écran. */
        const cible = Number((u.searchParams.get('tmdb_id')||'').replace('eq.',''));
        const corps = JSON.parse(req.postData()||'{}');
        const touchees = file.filter(d => d.tmdb_id === cible);
        touchees.forEach(d => { if(corps.statut) d.statut = corps.statut; });
        return j(touchees);
      }
      if(m === 'DELETE') return route.fulfill({status:204, body:''});
    }
    if(p === '/rest/v1/file_demandes') return j(file);

    /* Le banc IMITE le plafond de PostgREST : 1 000 lignes par réponse au
       maximum, quelle que soit la tranche demandée, et un 200 tout ce qu'il y
       a de normal. C'est cette troncature muette que la pagination doit
       franchir — sans le plafond ici, le test ne prouverait rien. */
    if(p === '/rest/v1/videotheque' || p === '/rest/v1/editions_dvdfr'){
      const total = (p === '/rest/v1/videotheque') ? VTH_FILMS : VTH_EDTS;
      const rg = String(req.headers()['range'] || '0-999').split('-');
      const d = Number(rg[0]) || 0;
      const f = Math.min(Number(rg[1]) || (d + 999), d + 999);
      const out = [];
      for(let i = d; i <= f && i < total; i++) out.push(ligneVth(p, i));
      return j(out);
    }
    if(p === '/rest/v1/videotheque_corrections'){
      if(m === 'GET') return j([]);
      if(m === 'DELETE'){
        preferVth = String(req.headers()['prefer'] || '');
        /* Le meme piege qu'a l'ecriture, joue une fois : 200, liste vide. */
        if(refusSuppr){ refusSuppr = false; return j([]); }
        return j([{ cle:'efface' }]);
      }
      if(m === 'POST'){
        preferVth = String(req.headers()['prefer'] || '');
        /* Le piège maison, joué pour de vrai : une écriture bloquée par RLS
           répond 200 avec une LISTE VIDE. L'app doit compter les lignes. */
        if(refusVth){ refusVth = false; return j([]); }
        return j([ JSON.parse(req.postData() || '{}') ]);
      }
    }
    return j({});
  });

  // config.js branché sur le faux Supabase
  await page.route('**/config.js*', r => r.fulfill({status:200, contentType:'application/javascript',
    body: "window.CINEFLIX={tmdbKey:'cle',jellyfinHosts:[],catalogue:'./cineflix.json',"+
          "region:'FR',nom:'Cinéflix',pushCle:'BCleDeTest',supabase:{url:'"+SB+"',key:'anon'}};"}));

  const ok = (nom, cond) => { if(!cond) echecs.push('ÉCHEC — '+nom); else console.log('  ok  '+nom); };
  const url = 'http://localhost:8123/index.html';

  await page.goto(url);
  await page.waitForSelector('.acc', {timeout:8000});

  // 1. Porte d'entrée
  /* Première visite : l'app n'ouvre plus sur le formulaire de connexion mais
     sur un accueil qui explique le parcours en trois pas et propose de créer
     son profil ; la connexion est derrière « J'ai déjà un profil »
     (viewPremiereVisite, app-08-compte.js). */
  ok('sans session, l\'app ouvre sur l\'accueil de première visite',
     /bienvenue chez nous/i.test(await page.locator('.acc h1').innerText()) &&
     /cinéflix/i.test(await page.locator('.motacc').innerText()));
  ok('la barre de navigation est masquée', !(await page.locator('nav').isVisible()));
  ok('la porte principale est la création de profil',
     /créer mon profil/i.test(await page.locator('.acc .btn').innerText()));
  await page.click('.accliens button:has-text("J\'ai déjà un profil")');
  await page.waitForTimeout(400);
  ok('« J\'ai déjà un profil » mène à la connexion',
     await page.locator('#acmail').count() === 1 &&
     /se connecter/i.test(await page.locator('.acc .btn').innerText()));
  ok('et la création reste à portée depuis la connexion',
     await page.locator('.accliens button:has-text("Créer un profil")').count() === 1);

  // 2. Refus des champs vides
  await page.click('.acc .btn');
  await page.waitForTimeout(200);
  ok('un formulaire vide est refusé sans appel réseau',
     (await page.locator('.accerr').innerText()).length > 10 &&
     !appels.some(a => a.startsWith('POST /auth')));

  // 3. Connexion
  await page.fill('#acmail', 'alex@exemple.fr');
  await page.fill('#acpass', 'motdepasse');
  await page.click('.acc .btn');
  /* La connexion ouvre la COUVERTURE — le grand visuel — et la grille vit
     derrière les pilules Films et Séries (`ouvrirCatalogue`, app-02-outils.js). */
  await page.waitForSelector('.vsl, .pilules', {timeout:20000});
  ok('la connexion mène à l\'app, pas à l\'écran de connexion',
     await page.locator('.acc').count() === 0);
  await page.click('.pilules .pil:has-text("Films")');
  await page.waitForSelector('.gcard', {timeout:15000});
  ok('la connexion mène au catalogue', await page.locator('.gcard').count() >= 20);
  ok('le catalogue vient de Supabase, pas du fichier',
     appels.includes('GET /rest/v1/catalogue'));
  ok('les pastilles « Cinéflix » utilisent le catalogue distant',
     await page.locator('.tag.dispo').count() === 5);

  // 3 bis. Les tris de bibliothèque sur « Cinémathèque » (données du NAS)
  /* La source « Cinéflix » n'existe plus : « Cinémathèque » mêle bibliothèque
     et abonnements, et c'est en n'en déclarant AUCUN qu'on la réduit au
     serveur seul — « zéro abonnement veut dire zéro » (3008z). C'est aussi ce
     qui rend les comptes exacts : cinq titres, ceux du NAS. */
  await page.evaluate(() => { GOUTS.d = { aimes:[], fuis:[], totems:[],
    plats:[], platsDit:true }; GOUTS.charge = true; });
  await page.click('.presdeux button:has-text("Cinémathèque")');
  await page.waitForTimeout(1200);
  await page.click('#fbtn');
  await page.waitForTimeout(400);
  ok('les tris de bibliothèque apparaissent sur la vue Cinéflix',
     await page.locator('.chip:text-is("Durée")').count() === 1 &&
     await page.locator('.chip:has-text("Date d’ajout")').count() === 1 &&
     await page.locator('.chip:has-text("Nombre de lectures")').count() === 1);
  await page.click('.chip:text-is("Durée")');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Voir les résultats")');
  await page.waitForTimeout(600);
  ok('le tri par durée liste toute la bibliothèque', await page.locator('.gcard').count() === 5);
  ok('le plus long en premier (durée décroissante)',
     ((await page.locator('.gcard').first().getAttribute('onclick'))||'').includes('ouvrirFiche(680'));
  await page.click('#fbtn');
  await page.waitForTimeout(400);
  await page.click('.chip:text-is("Croissant")');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Voir les résultats")');
  await page.waitForTimeout(600);
  ok('l\'ordre croissant inverse la bibliothèque',
     ((await page.locator('.gcard').first().getAttribute('onclick'))||'').includes('ouvrirFiche(550'));
  /* Retour à l'état attendu par la suite. La popularité ne se choisit PAS sur
     « Cinémathèque » — « la seule donnée que la bibliothèque n'a pas ; sur Ce
     soir on trie sur ce que les deux mondes partagent » (setPresence) — on
     repasse donc sur « Tout » avant de la reprendre. */
  await page.click('#fbtn'); await page.waitForTimeout(400);
  await page.click('.chip:text-is("Décroissant")'); await page.waitForTimeout(400);
  await page.click('button:has-text("Voir les résultats")'); await page.waitForTimeout(400);
  await page.click('.presdeux button:has-text("Tout")');
  await page.waitForTimeout(1200);
  await page.click('#fbtn'); await page.waitForTimeout(400);
  ok('la popularité n\'est proposée qu\'en dehors de la Cinémathèque',
     await page.locator('.chip:has-text("Popularité")').count() === 1);
  await page.click('.chip:has-text("Popularité")'); await page.waitForTimeout(600);
  await page.click('button:has-text("Voir les résultats")'); await page.waitForTimeout(600);

  // 4. Une demande part vers le serveur — une carte absente du catalogue
  await page.locator('.gcard:not(:has(.tag.dispo))').first().click();
  await page.waitForSelector('.actions', {timeout:5000});
  await page.locator('.actions .btn').first().click();
  await page.waitForTimeout(500);
  ok('la demande est écrite sur le serveur',
     appels.filter(a => a === 'POST /rest/v1/elements').length === 1);
  const env = elements[elements.length-1] || {};
  ok('la demande porte le bon utilisateur et le bon titre',
     env.user_id === UID && env.demande === true && env.statut === 'demande');
  ok('le bouton passe à « Demandé »',
     /demandé/i.test(await page.locator('.actions .btn').first().innerText()));

  // 5. Le favori aussi
  await page.locator('.actions .btn').nth(1).click();
  await page.waitForTimeout(400);
  ok('le favori est écrit sur le serveur',
     appels.filter(a => a === 'POST /rest/v1/elements').length === 2 &&
     elements[elements.length-1].fav === true);

  // 6. La file, côté administrateur
  await page.locator('.avbtn:visible').first().click();
  await page.waitForTimeout(400);
  ok('l\'administrateur voit l\'entrée « File de demandes »',
     (await page.locator('.btn:has-text("File de demandes")').count()) === 1);
  ok('le profil affiche le compte connecté',
     (await page.locator('.card').last().innerText()).includes('alex@exemple.fr'));
  ok('le profil propose d\'activer les notifications',
     await page.locator('.btn:has-text("prévenu quand une demande arrive")').count() === 1);
  await page.click('.btn:has-text("File de demandes")');
  await page.waitForSelector('.lrow', {timeout:6000});
  /* Deux demandes remontent, mais « Fight Club » est déjà au catalogue :
     il doit sortir de la file active et se ranger dans « Résolues ». */
  ok('la file n\'affiche que les demandes non résolues',
     await page.locator('.lrow').count() === 2);
  ok('la demande résolue est rangée à part',
     (await page.locator('.sectitle:has-text("Résolues")').count()) === 1);
  ok('chaque ligne indique qui a demandé',
     (await page.locator('.lrow').first().innerText()).includes('Camille'));

  await page.locator('.lrow').first().locator('.iconbtn').click();
  await page.waitForSelector('.sheet.show', {timeout:3000});
  await page.click('.opt:has-text("en cours")');
  await page.waitForTimeout(400);
  ok('changer le statut appelle le serveur',
     appels.some(a => a === 'PATCH /rest/v1/elements'));
  /* Traitée, la demande quitte « En attente » et se retrouve sous « En cours » :
     la file ne montre que ce qui reste à faire. */
  ok('la demande traitée quitte la file d\'attente',
     await page.locator('.lrow').count() === 1);
  await page.click('.chips .chip:has-text("En cours")');
  await page.waitForTimeout(300);
  ok('elle réapparaît sous « En cours »',
     (await page.locator('.pastille.encours').count()) === 1);

  // 6 bis. Ma vidéothèque : lire 2 307 et 18 113 lignes, pas 1 000
  await page.evaluate(()=>{ ui.cineVolet = 'vth'; go('sorties'); });
  await page.waitForSelector('.vtrow', {timeout:60000});
  ok('la vidéothèque est lue en entier malgré le plafond de 1 000 lignes',
     await page.evaluate(()=> ui.vth.films.length) === VTH_FILMS);
  ok('le catalogue des éditions aussi',
     await page.evaluate(()=> ui.vth.edts.length) === VTH_EDTS);
  ok('chaque table est demandée par tranches successives',
     appels.filter(a => a === 'GET /rest/v1/videotheque').length === 3 &&
     appels.filter(a => a === 'GET /rest/v1/editions_dvdfr').length === 19);
  ok('cent lignes rendues, pas deux mille trois cents',
     await page.locator('.vtrow').count() === 100);

  // 6 ter. L'écriture : la seule table que l'app touche
  const cleVth = await page.evaluate(async ()=>{
     const f = ui.vth.films.filter(x => x._cl === 'rouge')[0];
     ui.vth.ouvert = ui.vth.films.indexOf(f);
     ui.vth.carte = 'B';
     await vthEnregistrerEtape2();
     return f.cle;
  });
  ok('l\'écriture demande la représentation et un upsert',
     preferVth.includes('return=representation') && preferVth.includes('merge-duplicates'));
  ok('un refus silencieux (200 + liste vide) ne passe pas pour un succès',
     await page.evaluate(c => !ui.vth.corr[c], cleVth) &&
     /refus/i.test(await page.locator('.toast').innerText()));
  await page.evaluate(async ()=>{ await vthEnregistrerEtape2(); });
  await page.waitForTimeout(200);
  ok('acceptée, la correction est retenue et le film passe au vert',
     await page.evaluate(c => (ui.vth.corr[c]||{}).statut === 'VERIFIE_MAX' &&
       ui.vth.films[ui.vth.ouvert]._cl === 'vert', cleVth));
  ok('et la date du verdict est posée',
     await page.evaluate(c => !!(ui.vth.corr[c]||{}).verifie_le, cleVth));

  // 6 quater. Annuler une correction : la ligne est effacee, pas videe
  await page.evaluate(async ()=>{ await vthAnnulerCorrection(); });
  await page.waitForTimeout(200);
  ok('la suppression demande la representation, elle aussi',
     preferVth.includes('return=representation'));
  ok('un refus silencieux ne fait pas disparaitre la correction',
     await page.evaluate(c => !!ui.vth.corr[c], cleVth) &&
     /refus/i.test(await page.locator('.toast').innerText()));
  await page.evaluate(async ()=>{ await vthAnnulerCorrection(); });
  await page.waitForTimeout(200);
  ok('acceptee, la correction disparait et le film reprend sa couleur calculee',
     await page.evaluate(c => !ui.vth.corr[c], cleVth) &&
     await page.evaluate(()=> ui.vth.films[ui.vth.ouvert]._cl === 'rouge'));
  ok('et il revient dans la file a traiter',
     await page.evaluate(()=> fileVth().indexOf(ui.vth.films[ui.vth.ouvert]) >= 0));

  await page.evaluate(()=>{ ui.cineVolet = 'sorties'; go('sorties'); });
  await page.waitForTimeout(300);

  // 7. La session survit au rechargement
  await page.reload();
  await page.waitForSelector('.vsl, .pilules', {timeout:20000});
  ok('la session est retrouvée sans redemander le mot de passe',
     await page.locator('.acc').count() === 0);

  // 8. Déconnexion
  await page.locator('.avbtn:visible').first().click();
  await page.waitForTimeout(400);
  await page.click('.btn:has-text("Se déconnecter")');
  await page.waitForSelector('.sheet.show', {timeout:3000});
  await page.click('.opt.danger');
  await page.waitForSelector('.acc', {timeout:5000});
  /* L'appareil se souvient des profils du foyer : se déconnecter rend la main
     au choix du profil, plus au formulaire de connexion. */
  ok('la déconnexion ramène au choix du profil',
     /qui regarde ce soir/i.test(await page.locator('.acc').innerText()) &&
     await page.evaluate(() => !(db.auth && db.auth.jeton)));

  // 9. Session zombie : le compte a été supprimé côté serveur.
  //    L'app présente un jeton mort, le renouvellement échoue aussi —
  //    elle doit ramener à la connexion avec un message, pas rester plantée.
  const ctxZ = await browser.newContext({ viewport:{width:390,height:844},
                                          serviceWorkers:'block' });
  const pz = await ctxZ.newPage();
  pz.on('pageerror', e => echecs.push('pageerror(zombie): '+e.message));
  await pz.route('**://api.themoviedb.org/**', r => r.fulfill({status:200,
    contentType:'application/json', body:'{"results":[],"genres":[]}'}));
  await pz.route(SB+'/**', route => {
    const p = new URL(route.request().url()).pathname;
    if(p === '/auth/v1/token')
      return route.fulfill({status:400, contentType:'application/json',
        body:'{"error_description":"Invalid Refresh Token"}'});
    return route.fulfill({status:401, contentType:'application/json',
      body:'{"message":"JWT expired"}'});
  });
  await pz.route('**/config.js*', r => r.fulfill({status:200, contentType:'application/javascript',
    body:"window.CINEFLIX={tmdbKey:'k',jellyfinHosts:[],catalogue:'./cineflix.json',region:'FR',"+
         "supabase:{url:'"+SB+"',key:'anon'}};"}));
  await pz.addInitScript(([uid])=>{
    localStorage.setItem('cineflix.v1', JSON.stringify({
      apiKey:'k', pseudo:'Alex', onboarde:true, region:'FR', items:{},
      auth:{ token:'jeton-mort', refresh:'refresh-mort', uid:uid, email:'a@b.fr' } }));
  }, [UID]);
  await pz.goto(url);
  await pz.waitForSelector('.acc', {timeout:8000});
  ok('une session morte ramène à l\'écran de connexion',
     await pz.locator('.acc .btn').count() === 1);
  ok('avec une explication visible',
     (await pz.locator('.accerr').innerText()).includes('expiré'));
  await pz.waitForTimeout(500);        // la sauvegarde locale est différée de 150 ms
  ok('la session morte a été purgée du stockage',
     await pz.evaluate(() => !(JSON.parse(localStorage.getItem('cineflix.v1')||'{}').auth)));
  await ctxZ.close();

  await browser.close();
  console.log('');
  if(echecs.length){ console.log('ÉCHECS :'); echecs.forEach(e=>console.log('  - '+e)); process.exit(1); }
  console.log('Tout est vert.');
})();
