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
let dernierFournisseurs = null;    // le paramètre with_watch_providers du dernier /discover
let dernierTri = null;             // le sort_by du dernier /discover
let derniereBorne = null;          // le primary_release_date.gte du dernier /discover
let dernierRegion = null;          // le paramètre region du dernier /discover

(async () => {
  const browser = await chromium.launch();
  /* Cette suite vérifie le MODE LOCAL : config.js est remplacé par une version
     sans Supabase, sinon l'app démarrerait sur l'écran de connexion. Le service
     worker est bloqué car ses requêtes échappent à l'interception. */
  const page = await browser.newPage({ viewport:{width:390,height:844},
                                       serviceWorkers:'block' });
  await page.route('**/config.js*', r => r.fulfill({status:200, contentType:'application/javascript',
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
      dernierFournisseurs = u.searchParams.get('with_watch_providers');
      dernierTri = u.searchParams.get('sort_by');
      derniereBorne = u.searchParams.get('primary_release_date.gte');
      dernierRegion = u.searchParams.get('region');
      const page_ = Number(u.searchParams.get('page')||1);
      // 20 résultats par page ; seuls les 5 premiers ids de la page 1 sont au catalogue
      const res = [];
      for(let i=0;i<20;i++){
        const id = page_ === 1 && i < 5 ? CAT_MOVIES[i] : 900000 + page_*100 + i;
        res.push(film(id, 'Titre '+id));
      }
      body = { page:page_, total_pages:5, results:res };
    }
    else if(p.startsWith('/search/person'))
      body = { results:[{ id:777, name:'Sean Connery', profile_path:'/sc.jpg',
                          known_for_department:'Acting' }] };
    else if(p.startsWith('/search/')) body = { results:[film(550,'Fight Club'), film(999001,'Inconnu')] };
    else if(/\/movie\/\d+\/release_dates$/.test(p)){
      body = { results:[{ iso_3166_1:'FR', release_dates:[
        { type:3, release_date:'2024-03-06T00:00:00.000Z' },
        { type:4, release_date:'2024-05-14T00:00:00.000Z' },
        { type:5, release_date:'2026-08-12T00:00:00.000Z' } ]}] };
    }
    else if(/\/person\/\d+$/.test(p)){
      /* Une longue carrière : assez de vignettes pour que la page défile,
         c'est ce qui permet de tester la mémoire de défilement. */
      const oeuvres = [];
      const f1 = film(550,'Fight Club');  f1.media_type = 'movie';   // au catalogue
      oeuvres.push(f1);
      for(let i=0;i<30;i++){ const f = film(910000+i,'Œuvre '+i); f.media_type='movie'; oeuvres.push(f); }
      body = { id:777, name:'A. Acteur', profile_path:'/a.jpg',
               known_for_department:'Acting', birthday:'1970-01-01',
               biography:'Une carrière bien remplie.',
               combined_credits:{ cast:oeuvres, crew:[] } };
    }
    else if(/\/(movie|tv)\/\d+$/.test(p)){
      const id = Number(p.split('/').pop());
      const d = film(id, 'Titre '+id);
      d.credits = { cast:[{id:777, name:'A. Acteur', character:'Rôle', profile_path:'/a.jpg'}],
                    crew:[{id:888, name:'R. Réalisateur', job:'Director', profile_path:''}] };
      d.release_dates = { results:[{ iso_3166_1:'FR', release_dates:[
        { type:3, release_date:'2024-03-06T00:00:00.000Z' },
        { type:5, release_date:'2026-08-12T00:00:00.000Z' } ]}] };
      d['watch/providers'] = { results:{ FR:{ link:'https://x',
        flatrate:[{provider_id:8, provider_name:'Netflix', logo_path:'/n.jpg'}] } } };
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
  ok('le tri par défaut est la date de sortie',
     dernierTri === 'primary_release_date.desc');
  ok('pastille « Cinéflix » sur les titres du catalogue',
     await page.locator('.tag.dispo').count() === 5);

  // 2. Les trois sources — le geste central
  ok('trois puces : Cinéma / Plateformes / Cinéflix',
     await page.locator('.souschips .chip').count() === 3 &&
     (await page.locator('.souschips .chip').first().innerText()).trim() === 'Cinéma' &&
     await page.locator('.souschips .chip:has-text("Plateformes")').count() === 1);

  await page.click('.souschips .chip:has-text("Plateformes")');
  await page.waitForTimeout(900);
  ok('« Plateformes » interroge TMDB avec les fournisseurs français',
     dernierFournisseurs === '8|119|337|381');
  ok('« Plateformes » remplit la grille', await page.locator('.gcard').count() >= 20);

  // 2 a. Couleurs et libellés des puces
  ok('plus de point vert — des contours colorés à la place',
     await page.locator('.souschips .pt').count() === 0 &&
     await page.locator('.souschips .chip.c-flix').count() === 1 &&
     await page.locator('.souschips .chip.c-plats').count() === 1 &&
     await page.locator('.chips.types .chip.c-films').count() === 1 &&
     await page.locator('.chips.types .chip.c-series').count() === 1);
  await page.click('.chips.types .chip:has-text("Séries")');
  await page.waitForTimeout(700);
  ok('en mode séries, la puce du bas dit « Séries » (plus « Cinéma »)',
     (await page.locator('.souschips .chip').first().innerText()).trim() === 'Séries');
  await page.click('.chips.types .chip:has-text("Films")');
  await page.waitForTimeout(900);

  // 2 b. Fiche ouverte depuis Plateformes : boutons des plateformes
  await page.locator('.gcard:not(:has(.tag.dispo))').first().click();
  await page.waitForSelector('.actions', {timeout:5000});
  ok('les boutons des plateformes remplacent « Demander »',
     await page.locator('.btn.plat').count() === 1 &&
     (await page.locator('.btn.plat').innerText()).includes('Netflix') &&
     !(await page.locator('#app').innerText()).includes('Demander'));
  ok('le bouton porte le sigle et la couleur Netflix',
     await page.locator('.btn.plat.p-netflix').count() === 1 &&
     await page.locator('.btn.plat .plogo').count() === 1);
  ok('« Aussi en streaming » a disparu sur cette vue',
     !(await page.locator('#app').innerText()).includes('Aussi en streaming'));

  // 2 b'. La filmographie : réalisateur en tête, personnes cliquables
  ok('la réalisation apparaît avec le casting',
     (await page.locator('.cast').innerText()).includes('Réalisation'));
  await page.locator('.cperson').first().click();
  await page.waitForSelector('.grid', {timeout:5000});
  ok('la fiche de la personne liste sa filmographie',
     /filmographie/i.test(await page.locator('#app').innerText()) &&
     await page.locator('.gcard').count() === 31);
  ok('la coche verte marque ce qui est déjà sur Cinéflix',
     await page.locator('.tag.dispo').count() === 1);

  // 2 b''. Le défilement de la filmographie survit à l'aller-retour sur un film
  await page.locator('.gcard').nth(25).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const yFilmo = await page.evaluate(() => window.scrollY);
  await page.locator('.gcard').nth(25).click();
  await page.waitForSelector('.actions', {timeout:5000});
  await page.click('header .iconbtn');                 // retour vers la filmographie
  await page.waitForTimeout(700);
  const yRetour = await page.evaluate(() => window.scrollY);
  ok('le défilement de la filmographie est retrouvé au retour ('+yFilmo+' → '+yRetour+')',
     yFilmo > 300 && Math.abs(yRetour - yFilmo) < 8);

  await page.click('header .iconbtn');                 // retour vers la fiche du film
  await page.waitForSelector('.actions', {timeout:5000});
  ok('le retour rouvre la fiche du titre',
     await page.locator('.btn.plat').count() === 1);
  await page.click('header .iconbtn');                 // retour vers la grille
  await page.waitForTimeout(700);

  // 2 c. Filtrer par plateforme
  await page.click('#fbtn');
  await page.waitForTimeout(400);
  ok('le filtre par plateforme est proposé',
     await page.locator('.chip:text-is("Disney+")').count() === 1 &&
     await page.locator('.chip:text-is("Canal+")').count() === 1);
  await page.click('.chip:text-is("Netflix")');
  await page.waitForTimeout(900);
  ok('cocher Netflix ne demande que Netflix à TMDB', dernierFournisseurs === '8');
  await page.click('.chip:text-is("Netflix")');          // on décoche
  await page.waitForTimeout(900);

  // 2 d. Décennies, façon Infuse — et le filtre SUIT le changement de catégorie
  ok('les décennies vont de 1920 à 2020',
     await page.locator('.chip:text-is("1920")').count() === 1 &&
     await page.locator('.chip:text-is("2020")').count() === 1);
  await page.click('.chip:text-is("1990")');
  await page.waitForTimeout(900);
  ok('choisir 1990 borne la requête TMDB à la décennie',
     derniereBorne === '1990-01-01');
  ok('la découverte n\'envoie plus region= (dates originales, pas françaises)',
     dernierRegion === null);
  await page.click('button:has-text("Voir les résultats")');
  await page.waitForTimeout(400);
  await page.click('.souschips .chip:has-text("Cinéma")');   // changement de catégorie
  await page.waitForTimeout(900);
  ok('le filtre années 90 survit au passage Plateformes → Cinéma',
     derniereBorne === '1990-01-01');
  ok('le résumé l\'affiche', /années 90/.test(await page.locator('.resume').innerText()));
  await page.click('#fbtn');
  await page.waitForTimeout(400);
  await page.click('.chip:text-is("1990")');               // on désactive
  await page.waitForTimeout(900);
  ok('réappuyer sur la décennie la désactive', derniereBorne === null);
  await page.click('button:has-text("Voir les résultats")');
  await page.waitForTimeout(400);

  // 2 e. Chercher une personne depuis la loupe
  await page.click('.chip.chipico');
  await page.waitForTimeout(300);
  await page.fill('#q', 'sean connery');
  await page.waitForTimeout(900);
  ok('la recherche remonte une rangée « Personnes »',
     await page.locator('.cperson').count() === 1 &&
     (await page.locator('.cperson').innerText()).includes('Sean Connery'));
  await page.locator('.cperson').first().click();
  await page.waitForSelector('.grid', {timeout:5000});
  ok('un appui ouvre sa filmographie complète', await page.locator('.gcard').count() === 31);
  await page.click('header .iconbtn');                 // retour vers la recherche
  await page.waitForTimeout(600);
  ok('le retour retombe sur les résultats de recherche',
     await page.locator('.cperson').count() === 1 &&
     (await page.locator('#q').inputValue()) === 'sean connery');
  await page.click('.qclear');                          // on referme la recherche
  await page.waitForTimeout(400);

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
  ok('la feuille de filtres sait défiler (plus haute que l\'écran)',
     await page.evaluate(() => {
       const s = document.querySelector('.sheetin');
       return getComputedStyle(s).overflowY === 'auto' &&
              s.getBoundingClientRect().top >= 0;
     }));
  ok('les tris façon Jellyfin sont proposés',
     await page.locator('.chip:has-text("Nom")').count() === 1 &&
     await page.locator('.chip:has-text("Aléatoire")').count() === 1 &&
     await page.locator('.chip:has-text("Date de sortie")').count() === 1);
  ok('le sens croissant / décroissant est proposé',
     await page.locator('.chip:text-is("Croissant")').count() === 1 &&
     await page.locator('.chip:text-is("Décroissant")').count() === 1);
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
  await page.click('.souschips .chip:has-text("Cinéma")');
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

  // 4. Demander un titre absent — depuis « Cinéma », une carte sans pastille
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

  // 4 bis. Annuler la demande — a déjà cassé (arguments inversés), reste testé
  await page.locator('.actions .btn').first().click();       // menu « Demandé »
  await page.waitForSelector('.sheet.show', {timeout:3000});
  await page.click('.opt.danger');                            // Annuler ma demande
  await page.waitForTimeout(400);
  ok('annuler la demande rend le bouton « Demander »',
     (await page.locator('.actions .btn').first().innerText()).includes('Demander'));
  ok('la pastille de navigation s\'éteint',
     await page.locator('nav .pastille-nav').count() === 0);
  await page.locator('.actions .btn').first().click();       // on la redemande
  await page.waitForTimeout(400);

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
  ok('la coche verte marque les sorties déjà sur Cinéflix',
     await page.locator('.crow .cfx').count() > 0);
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
  await p2.route('**/config.js*', r => r.fulfill({status:200, contentType:'application/javascript',
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
