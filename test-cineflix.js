/* Test de bout en bout : TMDB est simulé, le reste est le vrai code. */
const { chromium } = require('playwright');

const CAT_MOVIES = [550, 27205, 155, 603, 680];   // extrait du cineflix.json livré
const dansCat = id => CAT_MOVIES.includes(id);

function film(id, titre){
  return { id, title: titre, name: titre, poster_path:'/p'+id+'.jpg',
           backdrop_path:'/b'+id+'.jpg', release_date:'2024-03-0'+((id%9)+1),
           first_air_date:'2024-03-01', vote_average:7.5, vote_count:1200,
           overview:'Synopsis de '+titre, genres:[{id:28,name:'Action'}],
           runtime:124, number_of_seasons:3, number_of_episodes:30, status:'Released' };
}

const echecs = [];

(async () => {
  const browser = await chromium.launch();
  /* Cette suite vérifie le MODE LOCAL : config.js est remplacé par une version
     sans Supabase, sinon l'app démarrerait sur l'écran de connexion. Le service
     worker est bloqué car ses requêtes échappent à l'interception. */
  const page = await browser.newPage({ viewport:{width:390,height:844},
                                       serviceWorkers:'block' });
  await page.route('**/config.js', r => r.fulfill({status:200, contentType:'application/javascript',
    body: "window.CINEFLIX={tmdbKey:'',jellyfinHosts:['http://100.95.13.53:30013'],"+
          "catalogue:'./cineflix.json',region:'FR',nom:'Cinéflix',supabase:{url:'',key:''}};"}));

  page.on('console', m => { if(m.type() === 'error') echecs.push('console: '+m.text()); });
  page.on('pageerror', e => echecs.push('pageerror: '+e.message));

  await page.route('**://api.themoviedb.org/**', route => {
    const u = new URL(route.request().url());
    const p = u.pathname.replace('/3','');
    let body;
    if(p === '/configuration') body = { images:{} };
    else if(p.startsWith('/genre/')) body = { genres:[{id:28,name:'Action'},{id:35,name:'Comédie'}] };
    else if(p.startsWith('/discover/')){
      const page_ = Number(u.searchParams.get('page')||1);
      // 20 résultats par page ; seuls les 5 premiers ids de la page 1 sont au catalogue
      const res = [];
      for(let i=0;i<20;i++){
        const id = page_ === 1 && i < 5 ? CAT_MOVIES[i] : 900000 + page_*100 + i;
        res.push(film(id, 'Titre '+id));
      }
      body = { page:page_, total_pages:5, results:res };
    }
    else if(p.startsWith('/search/')) body = { results:[film(550,'Fight Club'), film(999001,'Inconnu')] };
    else if(/\/movie\/\d+\/release_dates$/.test(p)){
      body = { results:[{ iso_3166_1:'FR', release_dates:[
        { type:3, release_date:'2024-03-06T00:00:00.000Z' },
        { type:4, release_date:'2024-05-14T00:00:00.000Z' },
        { type:5, release_date:'2026-08-12T00:00:00.000Z' } ]}] };
    }
    else if(/\/(movie|tv)\/\d+$/.test(p)){
      const id = Number(p.split('/').pop());
      const d = film(id, 'Titre '+id);
      d.credits = { cast:[{name:'A. Acteur', character:'Rôle', profile_path:'/a.jpg'}] };
      d.release_dates = { results:[{ iso_3166_1:'FR', release_dates:[
        { type:3, release_date:'2024-03-06T00:00:00.000Z' },
        { type:5, release_date:'2026-08-12T00:00:00.000Z' } ]}] };
      d['watch/providers'] = { results:{ FR:{ link:'https://x', flatrate:[{provider_name:'Netflix', logo_path:'/n.jpg'}] } } };
      /* Volontairement en désordre : le teaser anglais arrive avant la
         bande-annonce VF, c'est le tri qui doit choisir la seconde. */
      d.videos = { results:[
        { site:'YouTube', key:'enTeaser01', type:'Teaser',  iso_639_1:'en', official:true,  name:'Teaser' },
        { site:'Vimeo',   key:'vimeoIgnore', type:'Trailer', iso_639_1:'fr', official:true, name:'Vimeo' },
        { site:'YouTube', key:'frTrailer01', type:'Trailer', iso_639_1:'fr', official:true,  name:'Bande-annonce VF' },
        { site:'YouTube', key:'enTrailer01', type:'Trailer', iso_639_1:'en', official:true,  name:'Official Trailer' }
      ] };
      body = d;
    }
    else body = {};
    route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(body) });
  });
  await page.route('**://image.tmdb.org/**', r => r.fulfill({status:200, contentType:'image/gif',
    body: Buffer.from('R0lGODlhAQABAAAAACw=','base64')}));

  // le lecteur YouTube : simulé, pour que la suite reste hermétique au réseau
  await page.route('**://www.youtube-nocookie.com/**', r => r.fulfill({status:200,
    contentType:'text/html', body:'<!doctype html><title>bande-annonce</title>'}));

  // le sondage du serveur Jellyfin : on simule une réponse
  await page.route('**://100.95.13.53*/**', r => r.fulfill({status:200, body:'{}'}));

  await page.addInitScript(() => {
    localStorage.setItem('cineflix.v1', JSON.stringify({
      apiKey:'cle-de-test', pseudo:'Alexandre', onboarde:true, region:'FR', items:{}
    }));
  });

  const url = 'http://localhost:8123/index.html';
  await page.goto(url);
  await page.waitForSelector('.gcard', {timeout:8000});

  const ok = (nom, cond) => { if(!cond) echecs.push('ÉCHEC — '+nom); else console.log('  ok  '+nom); };

  // 1. Grille et onglets
  ok('4 onglets de navigation', await page.locator('nav .tab').count() === 4);
  ok('grille remplie', await page.locator('.gcard').count() >= 20);
  ok('pastille « Cinéflix » sur les titres du catalogue',
     await page.locator('.tag.dispo').count() === 5);

  // 2. Filtre de présence — le geste central
  ok('deux puces de présence — « Pas encore » a disparu',
     await page.locator('.souschips .chip').count() === 2);
  ok('la première puce dit « Tous les films »',
     (await page.locator('.souschips .chip').first().innerText()).trim() === 'Tous les films');
  await page.click('.chips.types .chip:has-text("Séries")');
  await page.waitForTimeout(600);
  ok('en mode séries, elle devient « Toutes les séries »',
     (await page.locator('.souschips .chip').first().innerText()).trim() === 'Toutes les séries');
  await page.click('.chips.types .chip:has-text("Films")');
  await page.waitForTimeout(900);

  await page.click('.souschips .chip:has-text("Cinéflix")');
  await page.waitForTimeout(900);
  const nDispo = await page.locator('.gcard').count();
  const nTagDispo = await page.locator('.tag.dispo').count();
  ok('« Cinéflix » ne montre que le catalogue ('+nDispo+' titres)', nDispo > 0 && nDispo === nTagDispo);
  ok('la pastille verte est la version discrète (coche seule)',
     await page.locator('.tag.dispo.mini').count() === nTagDispo);

  // 2 bis. Affichage : liste, compacte, et les nouveaux tris
  await page.click('#fbtn');
  await page.waitForTimeout(400);
  ok('six ordres de tri sont proposés',
     await page.locator('.chip:has-text("Titre de A à Z")').count() === 1 &&
     await page.locator('.chip:has-text("Les plus anciens")').count() === 1);
  await page.click('.chip:has-text("Liste")');
  await page.waitForTimeout(300);
  ok('« Liste » bascule la grille en liste',
     await page.evaluate(() => document.body.classList.contains('vue-liste')));
  await page.click('.chip:has-text("Compactes")');
  await page.waitForTimeout(300);
  ok('« Compactes » pose la classe de vue sur la page',
     await page.evaluate(() => document.body.classList.contains('vue-compacte') &&
                               !document.body.classList.contains('vue-liste')));
  await page.click('button:has-text("Voir les résultats")');
  await page.waitForTimeout(300);

  // 3. Fiche + dates de sortie
  await page.click('.souschips .chip:has-text("Tous les films")');
  await page.waitForTimeout(900);
  await page.locator('.gcard').first().click();
  await page.waitForSelector('.sorties', {timeout:5000});
  const lignes = await page.locator('.sorties .srt').count();
  ok('les trois lignes de sortie sont affichées', lignes === 3);
  ok('date Blu-ray future en couleur d\'accent', await page.locator('.srt.futur').count() >= 1);
  ok('titre déjà sur Cinéflix → bouton Regarder', await page.locator('.btn.vert').count() === 1);

  // 3 bis. Bande-annonce : vignette d'abord, lecteur seulement au clic
  ok('la vignette de bande-annonce est affichée', await page.locator('.ba').count() === 1);
  ok('la VF est préférée au teaser anglais',
     (await page.locator('.balbl').innerText()).startsWith('VF · Bande-annonce VF'));
  ok('aucun lecteur YouTube avant le clic', await page.locator('.ba iframe').count() === 0);
  await page.locator('.ba').click();
  await page.waitForTimeout(300);
  const src = await page.locator('.ba iframe').getAttribute('src');
  ok('le clic insère le lecteur sur la bonne vidéo',
     !!src && src.includes('youtube-nocookie.com/embed/frTrailer01'));

  // 4. Demander un titre absent — depuis « Tous les films », une carte sans pastille
  await page.click('header .iconbtn');           // retour
  await page.waitForTimeout(600);
  await page.locator('.gcard:not(:has(.tag.dispo))').first().click();
  await page.waitForSelector('.actions', {timeout:5000});
  ok('titre absent → bouton Demander',
     (await page.locator('.actions .btn').first().innerText()).includes('Demander'));
  await page.locator('.actions .btn').first().click();
  await page.waitForTimeout(400);
  ok('après demande, le bouton dit « Demandé »',
     (await page.locator('.actions .btn').first().innerText()).includes('Demandé'));
  ok('la pastille de navigation compte la demande',
     (await page.locator('nav .pastille-nav').innerText()) === '1');

  // 5. Favori
  await page.locator('.actions .btn').nth(1).click();
  await page.waitForTimeout(300);
  await page.click('nav .tab:has-text("Ma liste")');
  await page.waitForTimeout(500);
  ok('le favori est dans Ma liste', await page.locator('.gcard').count() === 1);
  await page.click('.chips .chip:has-text("Demandes")');
  await page.waitForTimeout(300);
  ok('la demande est dans l\'onglet Demandes', await page.locator('.lrow').count() === 1);

  // 6. Sorties
  await page.click('nav .tab:has-text("Sorties")');
  await page.waitForSelector('.crow, .empty h3', {timeout:15000});
  ok('le calendrier des sorties se remplit', await page.locator('.crow').count() > 0);
  ok('les modes de sortie sont proposés', await page.locator('.chips .chip').count() === 3);

  // 7. Persistance
  await page.reload();
  await page.waitForSelector('.gcard, .empty', {timeout:8000});
  ok('la demande survit au rechargement',
     (await page.locator('nav .pastille-nav').innerText()) === '1');
  ok('la taille d\'affiches choisie survit aussi',
     await page.evaluate(() => document.body.classList.contains('vue-compacte')));

  // 8. Profil
  await page.click('nav .tab:has-text("Profil")');
  await page.waitForTimeout(400);
  ok('le profil annonce la taille du catalogue',
     (await page.locator('.card').first().innerText()).includes('50 films'));

  ok('le profil signale le serveur joignable',
     (await page.locator('.card').first().innerText()).includes('joignable'));

  // 9. La clé fournie par le serveur : nouvel appareil, aucune donnée locale
  const ctx2 = await browser.newContext({ viewport:{width:390,height:844} });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => echecs.push('pageerror(2): '+e.message));
  await p2.route('**://api.themoviedb.org/**', r =>
    r.fulfill({status:200, contentType:'application/json',
      body: JSON.stringify({page:1,total_pages:1,results:[film(550,'Fight Club')],genres:[],images:{}})}));
  await p2.route('**://image.tmdb.org/**', r => r.fulfill({status:200, contentType:'image/gif',
    body: Buffer.from('R0lGODlhAQABAAAAACw=','base64')}));
  await p2.route('**/config.js', r => r.fulfill({status:200, contentType:'application/javascript',
    body: "window.CINEFLIX={tmdbKey:'cle-du-serveur',jellyfinHosts:[],catalogue:'./cineflix.json',region:'FR'};"}));
  await p2.goto(url);
  await p2.waitForSelector('.acc', {timeout:8000});
  ok('mise en route : 2 étapes quand la clé vient du serveur',
     await p2.locator('.puces i').count() === 2);
  await p2.click('.acc .btn');                    // « Commencer »
  await p2.waitForTimeout(400);
  ok('l\'étape « clé TMDB » est bien sautée',
     !(await p2.locator('.acc h1').innerText()).includes('clé'));
  await p2.click('.acc .btn');                    // « Explorer le catalogue »
  await p2.waitForSelector('.gcard', {timeout:8000});
  ok('le catalogue se charge sans que l\'utilisateur ait saisi de clé',
     await p2.locator('.gcard').count() >= 1);
  await ctx2.close();

  await browser.close();

  console.log('');
  if(echecs.length){ console.log('ÉCHECS :'); echecs.forEach(e=>console.log('  - '+e)); process.exit(1); }
  console.log('Tout est vert.');
})();
