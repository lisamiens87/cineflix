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

(async () => {
  const browser = await chromium.launch();
  /* Service worker désactivé : ses requêtes échappent à l'interception de
     Playwright, il resservirait le vrai config.js au lieu du faux. */
  const page = await browser.newPage({ viewport:{width:390,height:844},
                                       serviceWorkers:'block' });
  page.on('console', m => { if(m.type() === 'error') echecs.push('console: '+m.text()); });
  page.on('pageerror', e => echecs.push('pageerror: '+e.message));

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
    if(p === '/rest/v1/profils')  return route.fulfill({status:204, body:''});
    if(p === '/rest/v1/catalogue')
      return j([{ movies:CAT_MOVIES, tv:[1396], maj:'2026-07-27T08:00:00Z' }]);
    if(p === '/rest/v1/admins')   return j([{ user_id:UID }]);       // on teste le cas admin
    if(p === '/rest/v1/elements'){
      if(m === 'GET') return j(elements);
      if(m === 'POST'){ elements.push(JSON.parse(req.postData()||'{}')); return route.fulfill({status:201, body:''}); }
      if(m === 'PATCH' || m === 'DELETE') return route.fulfill({status:204, body:''});
    }
    if(p === '/rest/v1/file_demandes')
      return j([{ user_id:'autre-uid', type:'movie', tmdb_id:990001, titre:'Demande d\'un proche',
                  poster:'/x.jpg', sortie:'2025-01-01', statut:'demande', pseudo:'Camille',
                  cree_le:new Date(Date.now()-2*86400000).toISOString() },
                { user_id:'autre-uid', type:'movie', tmdb_id:550, titre:'Fight Club',
                  poster:'/y.jpg', sortie:'1999-10-15', statut:'demande', pseudo:'Camille',
                  cree_le:new Date(Date.now()-9*86400000).toISOString() }]);
    return j({});
  });

  // config.js branché sur le faux Supabase
  await page.route('**/config.js', r => r.fulfill({status:200, contentType:'application/javascript',
    body: "window.CINEFLIX={tmdbKey:'cle',jellyfinHosts:[],catalogue:'./cineflix.json',"+
          "region:'FR',nom:'Cinéflix',supabase:{url:'"+SB+"',key:'anon'}};"}));

  const ok = (nom, cond) => { if(!cond) echecs.push('ÉCHEC — '+nom); else console.log('  ok  '+nom); };
  const url = 'http://localhost:8123/index.html';

  await page.goto(url);
  await page.waitForSelector('.acc', {timeout:8000});

  // 1. Porte d'entrée
  ok('sans session, l\'app ouvre sur la connexion',
     (await page.locator('.acc h1').innerText()).includes('Cinéflix'));
  ok('la barre de navigation est masquée', !(await page.locator('nav').isVisible()));
  await page.click('.accliens button');                 // « Créer un compte »
  ok('on peut basculer vers la création de compte',
     (await page.locator('.acc .btn').innerText()).includes('Créer'));
  await page.click('.accliens button');                 // retour connexion

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
  await page.waitForSelector('.gcard', {timeout:8000});
  ok('la connexion mène au catalogue', await page.locator('.gcard').count() >= 20);
  ok('le catalogue vient de Supabase, pas du fichier',
     appels.includes('GET /rest/v1/catalogue'));
  ok('les pastilles « Cinéflix » utilisent le catalogue distant',
     await page.locator('.tag.dispo').count() === 5);

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
     (await page.locator('.actions .btn').first().innerText()).includes('Demandé'));

  // 5. Le favori aussi
  await page.locator('.actions .btn').nth(1).click();
  await page.waitForTimeout(400);
  ok('le favori est écrit sur le serveur',
     appels.filter(a => a === 'POST /rest/v1/elements').length === 2 &&
     elements[elements.length-1].fav === true);

  // 6. La file, côté administrateur
  await page.click('nav .tab:has-text("Profil")');
  await page.waitForTimeout(400);
  ok('l\'administrateur voit l\'entrée « File de demandes »',
     (await page.locator('.btn:has-text("File de demandes")').count()) === 1);
  ok('le profil affiche le compte connecté',
     (await page.locator('.card').last().innerText()).includes('alex@exemple.fr'));
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

  // 7. La session survit au rechargement
  await page.reload();
  await page.waitForSelector('.gcard', {timeout:8000});
  ok('la session est retrouvée sans redemander le mot de passe',
     await page.locator('.acc').count() === 0);

  // 8. Déconnexion
  await page.click('nav .tab:has-text("Profil")');
  await page.waitForTimeout(400);
  await page.click('.btn:has-text("Se déconnecter")');
  await page.waitForSelector('.sheet.show', {timeout:3000});
  await page.click('.opt.danger');
  await page.waitForSelector('.acc', {timeout:5000});
  ok('la déconnexion ramène à l\'écran de connexion',
     await page.locator('.acc .btn').count() === 1);

  await browser.close();
  console.log('');
  if(echecs.length){ console.log('ÉCHECS :'); echecs.forEach(e=>console.log('  - '+e)); process.exit(1); }
  console.log('Tout est vert.');
})();
