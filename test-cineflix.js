/* Test de bout en bout : TMDB est simulé, le reste est le vrai code. */
const { chromium } = require('playwright');

const CAT_MOVIES = [550, 27205, 155, 603, 680];   // extrait du cineflix.json livré
const dansCat = id => CAT_MOVIES.includes(id);

/* La sortie Blu-ray doit rester À VENIR : elle était écrite en dur (2026-08-12)
   et le test se périmait tout seul le jour venu — « date future en couleur
   d'accent » devenait faux sans que rien n'ait bougé dans l'app. */
const dansNJours = n => new Date(Date.now() + n*86400000).toISOString();

/* Un titre absent du serveur ET d'aucune plateforme : c'est le seul cas où
   « Demander » est vraiment la bonne proposition (3007d). */
const SANS_PLAT = [999001];

function film(id, titre){
  return { id, title: titre, name: titre, poster_path:'/p'+id+'.jpg',
           backdrop_path:'/b'+id+'.jpg', release_date:'2024-03-0'+((id%9)+1),
           first_air_date:'2024-03-01', vote_average:7.5, vote_count:1200,
           overview:'Synopsis de '+titre, genres:[{id:28,name:'Action'}],
           /* /discover rend des `genre_ids` ; sans eux un candidat venu des
              plateformes arrive sans genre et traverse le filtre des goûts. */
           genre_ids:[28],
           runtime:124, number_of_seasons:3, number_of_episodes:30, status:'Released' };
}

const echecs = [];
let dernierFournisseurs = null;    // le paramètre with_watch_providers du dernier /discover
let dernierTri = null;             // le sort_by du dernier /discover
let derniereBorne = null;          // le primary_release_date.gte du dernier /discover
let dernierRegion = null;          // le paramètre region du dernier /discover
let dernierOrigine = null;         // le with_origin_country du dernier /discover
let dernierWatchRegion = null;     // le watch_region du dernier /discover
let dernierMonet = null;           // le with_watch_monetization_types du dernier /discover
let nbDiscover = 0;                // combien de /discover ont été demandés en tout

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

  /* suggestions-4k.json n'est pas versionne (Alexandre le depose lui-meme) :
     le banc le sert, avec de quoi exercer chaque regle - deux decennies dans
     un ordre NON alphabetique pour verifier qu'on suit le fichier, un film
     sans affiche, et un film present au catalogue qui doit disparaitre. */
  const F4K = { source:'banc', genere_le:'2026-09-01', total:7, films:[
    { id:9314, titre:'Mille neuf cent quatre-vingt-quatre', annee:1984,
      affiche:'/a.jpg', decennie:'Annees 1980' },
    { id:9315, titre:'Brazil', annee:1985, affiche:'/b.jpg', decennie:'Annees 1980' },
    { id:9316, titre:'Sans affiche du tout', annee:1988, affiche:'',
      decennie:'Annees 1980' },
    { id:9317, titre:'Elephant Man', annee:1980, affiche:'/d.jpg',
      decennie:'Annees 1980' },
    { id:9318, titre:'Alien', annee:1979, affiche:'/e.jpg', decennie:'Annees 1970' },
    { id:9319, titre:'Orange mecanique', annee:1971, affiche:'/f.jpg',
      decennie:'Annees 1970' },
    /* Celui-ci est au catalogue du banc : il doit sortir du mur tout seul. */
    { id:550, titre:'Fight Club', annee:1999, affiche:'/g.jpg',
      decennie:'Annees 1990' },
    /* Deux defauts du VRAI fichier livre le 01/09 : 21 coffrets sans
       identifiant TMDb, et une fiche repetee quatre fois. */
    /* Rangees par decennie comme le vrai fichier, qui va de « Avant 1950 » a
       « Sans annee » sans jamais revenir en arriere. */
    { id:null, titre:'Hellraiser - Tetralogie', annee:null, affiche:null,
      decennie:'Annees 1970' },
    { id:null, titre:'Trois couleurs : Bleu, Blanc, Rouge', annee:1993,
      affiche:null, decennie:'Annees 1990' },
    { id:9320, titre:'Justice League', annee:2024, affiche:'/h.jpg',
      decennie:'Annees 1990' },
    { id:9320, titre:'Justice League', annee:2024, affiche:'/h.jpg',
      decennie:'Annees 1990' }
  ]};
  await page.route('**/suggestions-4k.json*', r => r.fulfill({status:200,
    contentType:'application/json', body: JSON.stringify(F4K)}));
  /* Sans cette route, aucune affiche ne charge (le bac a sable ne sort pas
     vers image.tmdb.org), posterFail() les remplace TOUTES par un cadre vide,
     et « un film sans affiche garde son cadre » passerait pour la mauvaise
     raison - il n'y aurait plus que des cadres vides. */
  await page.route('**://image.tmdb.org/**', r => r.fulfill({status:200,
    contentType:'image/svg+xml',
    body:'<svg xmlns="http://www.w3.org/2000/svg" width="4" height="6"/>'}));

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
      dernierOrigine = u.searchParams.get('with_origin_country');
      dernierWatchRegion = u.searchParams.get('watch_region');
      dernierMonet = u.searchParams.get('with_watch_monetization_types');
      nbDiscover++;
      const page_ = Number(u.searchParams.get('page')||1);
      // 20 résultats par page ; seuls les 5 premiers ids de la page 1 sont au catalogue
      const res = [];
      for(let i=0;i<20;i++){
        const id = page_ === 1 && i < 5 ? CAT_MOVIES[i] : 900000 + page_*100 + i;
        res.push(film(id, 'Titre '+id));
      }
      /* TMDB filtre lui-même sur les genres demandés : tous les titres du banc
         sont de l'action, une requête qui demande autre chose ne doit donc
         rien rendre. Sans ça, le versant plateformes renvoyait des titres qui
         ne correspondaient pas à l'envie, et les contrôles de goûts passaient
         sur des candidats que le vrai TMDB n'aurait jamais rendus. */
      const gDem = (u.searchParams.get('with_genres')||'').split(',').filter(Boolean);
      const gardes = gDem.length && gDem.indexOf('28') < 0 ? [] : res;
      body = { page:page_, total_pages: gardes.length ? 5 : 1, results:gardes };
    }
    else if(p.startsWith('/search/person'))
      body = { results:[{ id:777, name:'Sean Connery', profile_path:'/sc.jpg',
                          known_for_department:'Acting' }] };
    else if(p.startsWith('/search/')) body = { results:[film(550,'Fight Club'), film(999001,'Inconnu')] };
    else if(/\/movie\/\d+\/release_dates$/.test(p)){
      body = { results:[{ iso_3166_1:'FR', release_dates:[
        { type:3, release_date:'2024-03-06T00:00:00.000Z' },
        { type:4, release_date:'2024-05-14T00:00:00.000Z' },
        { type:5, release_date: dansNJours(180) } ]}] };
    }
    else if(/\/tv\/\d+\/season\/\d+$/.test(p)){
      const n = Number(p.split('/').pop());
      const eps = [];
      for(let i=1;i<=6;i++) eps.push({ episode_number:i, name:'Épisode '+i,
        air_date:'2019-04-0'+i, runtime:52, still_path:'/e'+i+'.jpg',
        overview:'Résumé de l’épisode '+i });
      body = { id:100+n, name:'Saison '+n, season_number:n, air_date:'2019-04-01',
               poster_path:'/s'+n+'.jpg', overview:'La saison '+n+' en résumé.', episodes:eps };
    }
    else if(/\/person\/\d+\/combined_credits$/.test(p)){
      /* L'œuvre d'un acteur : des films, une série, et le titre d'où l'on
         vient (550) — qui ne doit pas se retrouver dans ses propres suggestions. */
      const l = [];
      for(let i=0;i<15;i++){ const f = film(920000+i,'Avec lui '+i); f.media_type='movie'; f.popularity=100-i; l.push(f); }
      const memeTitre = film(550,'Fight Club'); memeTitre.media_type='movie'; memeTitre.popularity=999;
      const serie = film(930001,'Série de lui'); serie.media_type='tv'; serie.popularity=80;
      body = { cast:[memeTitre].concat(l).concat([serie]), crew:[] };
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
        { type:5, release_date: dansNJours(180) } ]}] };
      d['watch/providers'] = SANS_PLAT.includes(id) ? { results:{} }
        : { results:{ FR:{ link:'https://x',
            flatrate:[{provider_id:8, provider_name:'Netflix', logo_path:'/n.jpg'}] } } };
      /* Une saison sans épisode et des « Spéciaux » en tête : l'app doit
         écarter la première et renvoyer les seconds à la fin. */
      d.seasons = [
        { season_number:0, name:'Spéciaux',    episode_count:2,  air_date:'2023-01-01', poster_path:'/s0.jpg' },
        { season_number:1, name:'Saison 1',    episode_count:10, air_date:'2019-04-01', poster_path:'/s1.jpg' },
        { season_number:2, name:'Saison 2',    episode_count:8,  air_date:'2020-04-01', poster_path:'/s2.jpg' },
        { season_number:3, name:'Saison vide', episode_count:0,  air_date:'',           poster_path:'' }
      ];
      /* Les recommandations contiennent le titre lui-même : il ne doit pas
         se retrouver dans ses propres suggestions. */
      d.recommendations = { results:[ film(801,'Reco A'), film(802,'Reco B'), film(id,'Lui-même') ] };
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

  // les polices : servies vides, pour que la suite tourne aussi hors ligne
  await page.route('**://fonts.googleapis.com/**', r =>
    r.fulfill({status:200, contentType:'text/css', body:''}));
  await page.route('**://fonts.gstatic.com/**', r =>
    r.fulfill({status:200, contentType:'font/woff2', body:''}));

  // le lecteur YouTube : simulé, pour que la suite reste hermétique au réseau
  await page.route('**://www.youtube-nocookie.com/**', r => r.fulfill({status:200,
    contentType:'text/html', body:'<!doctype html><title>bande-annonce</title>'}));

  // le sondage du serveur Jellyfin : on simule une réponse
  await page.route('**://100.95.13.53*/**', r => r.fulfill({status:200, body:'{}'}));

  await page.addInitScript(() => {
    localStorage.setItem('cineflix.v1', JSON.stringify({
      apiKey:'cle-de-test', pseudo:'Alexandre', onboarde:true, region:'FR',
      /* Une demande dont le titre est au catalogue (550) : au démarrage,
         l'app doit annoncer la bonne nouvelle. */
      items:{ 'movie:550': { type:'movie', id:550, titre:'Fight Club',
                             fav:false, req:{ statut:'demande', le: 1 } } }
    }));
  });

  const url = 'http://localhost:8123/index.html';
  await page.goto(url);

  const ok = (nom, cond) => { if(!cond) echecs.push('ÉCHEC — '+nom); else console.log('  ok  '+nom); };

  // 1. La couverture, puis le catalogue
  /* Découvrir s'ouvre désormais sur la COUVERTURE — le grand visuel, la
     vitrine, le Top — et la grille vit derrière les pilules Films et Séries
     (`ouvrirCatalogue`, app-02-outils.js). Cette suite attendait `.gcard` dès
     le chargement : elle mourait là, et tout ce qui suit devenait
     inatteignable. Elle passe donc la porte, comme une vraie personne. */

  /* L'annonce au démarrage a été RETIRÉE le 01/08 : son drapeau `notifie` est
     local alors que db.items est resynchronisé depuis Supabase, donc le
     bandeau revenait à CHAQUE démarrage (« Chasse gardée », signalé par
     Alexandre — app-01-noyau.js). La bonne nouvelle passe désormais par
     l'onglet « Arrivés » de Ma liste. On vérifie donc la bascule elle-même —
     « c'est le catalogue qui fait foi, jamais un clic » — et l'écran qui la
     montre est vérifié plus bas, section 5. */
  await page.waitForFunction(() => typeof lots === 'function' && CAT.charge,
                             null, {timeout:15000});
  ok('une demande dont le titre est au catalogue bascule en « arrivée »',
     await page.evaluate(() => lots().arrives.some(it => it.id === 550) &&
                               !lots().demandes.some(it => it.id === 550)));

  await page.waitForSelector('.vsl', {timeout:20000});
  ok('l\'accueil est une couverture, pas une grille',
     await page.locator('.gcard').count() === 0 &&
     await page.locator('.vsl').count() === 5 &&
     /top de ta biblioth/i.test(await page.locator('#app').innerText()));

  /* Sept onglets dans le DOM, jamais les mêmes à l'écran : `tel` et `dsk`
     (app-02-outils.js) donnent Guide-moi au téléphone, et Films, Séries et
     Profil au bureau. Compter les nœuds revenait à tester le DOM ; ce sont
     les onglets VISIBLES qui font la navigation. */
  const ongletsVus = async () =>
    (await page.locator('nav .tab:visible').allInnerTexts()).join(' | ').replace(/\s+/g,' ');
  ok('quatre onglets sur le téléphone, dont Guide-moi',
     await page.locator('nav .tab:visible').count() === 4 &&
     (await ongletsVus()).includes('Guide-moi'));
  await page.setViewportSize({width:1280, height:900});
  await page.waitForTimeout(500);
  const dsk = await ongletsVus();
  ok('le bureau échange Guide-moi contre Films, Séries et Profil',
     await page.locator('nav .tab:visible').count() === 6 &&
     dsk.includes('Films') && dsk.includes('Séries') && dsk.includes('Profil') &&
     !dsk.includes('Guide-moi'));
  await page.setViewportSize({width:390, height:844});
  await page.waitForTimeout(500);

  await page.click('.pilules .pil:has-text("Films")');
  await page.waitForSelector('.gcard', {timeout:15000});
  ok('grille remplie', await page.locator('.gcard').count() >= 20);
  ok('le tri par défaut est la date de sortie',
     dernierTri === 'primary_release_date.desc');
  ok('pastille « Cinéflix » sur les titres du catalogue',
     await page.locator('.tag.dispo').count() === 5);

  // 2. Les deux volets — le geste central
  /* Les trois sources (Cinéma / Plateformes / Cinéflix) sont devenues deux
     volets, « Cinémathèque » et « Tout », portés par l'interrupteur
     `.presdeux` : « à deux choix exclusifs, la forme doit dire l'un OU
     l'autre » (PRESENCES, app-03-decouvrir.js). */
  ok('deux volets : Cinémathèque et Tout',
     await page.locator('.presdeux button').count() === 2 &&
     (await page.locator('.presdeux button').allInnerTexts()).join('|') ===
       'Cinémathèque|Tout');
  ok('« Tout » est le volet ouvert par défaut',
     (await page.locator('.presdeux button.on').innerText()).trim() === 'Tout');
  ok('chaque type garde sa couleur',
     await page.locator('.chips.types .chip.c-films').count() === 1 &&
     await page.locator('.chips.types .chip.c-series').count() === 1);

  // 2 a. Les plateformes viennent du PROFIL, plus de la navigation
  /* 3008h et 3008z : le filtrage par fournisseur n'est plus un mode de
     navigation. Il s'applique sur « Cinémathèque », à partir des abonnements
     déclarés dans Mes goûts — et zéro abonnement veut dire zéro, sans quoi
     TMDB répond « tout ce qui est en illimité en France ». */
  const auVolet = async lab => {
    await page.click('.presdeux button:has-text("'+lab+'")');
    await page.waitForTimeout(1000);
  };
  await page.evaluate(() => { GOUTS.d = { aimes:[], fuis:[], totems:[],
    plats:[8,119,337,381], platsDit:true }; GOUTS.charge = true; });
  await auVolet('Cinémathèque');
  ok('« Cinémathèque » interroge TMDB avec les abonnements du profil',
     dernierFournisseurs === '8|119|337|381' &&
     dernierWatchRegion === 'FR' && dernierMonet === 'flatrate');
  ok('« Cinémathèque » remplit la grille',
     await page.locator('.gcard').count() >= 20);

  await auVolet('Tout');
  await page.evaluate(() => { GOUTS.d = { aimes:[], fuis:[], totems:[],
    plats:[], platsDit:true }; });
  dernierFournisseurs = null;
  const discAvant = nbDiscover;
  await auVolet('Cinémathèque');
  await page.waitForTimeout(600);
  ok('zéro abonnement veut dire zéro : aucun /discover, aucun fournisseur',
     dernierFournisseurs === null && nbDiscover === discAvant);
  ok('sans abonnement, la grille se remplit de la seule bibliothèque',
     await page.locator('.gcard').count() > 0 &&
     await page.locator('.gcard:not(:has(.tag.dispo))').count() === 0);

  // 2 b. Le bouton de la fiche suit le FILM, plus la porte d'entrée
  /* Jusqu'en 3007d, « Netflix » ou « Demander sur Premier Rang » dépendait de
     l'onglet ouvert en dernier : le même film changeait de bouton selon la
     porte. Vérifié le 06/08 sur « The Debt Collector ». Ce test-ci ouvre donc
     le MÊME titre par deux portes et attend le même bouton. */
  await page.evaluate(() => { GOUTS.d = { aimes:[], fuis:[], totems:[],
    plats:[8,119,337,381], platsDit:true }; });
  await auVolet('Tout');
  const absent = page.locator('.gcard:not(:has(.tag.dispo))').first();
  const idAbsent = Number((((await absent.getAttribute('onclick'))||'')
    .match(/ouvrirFiche\((\d+)/)||[])[1]);
  ok('la grille propose un titre absent du serveur', idAbsent > 0);
  await absent.click();
  await page.waitForSelector('.actions', {timeout:5000});
  /* La plateforme prend le bouton PRINCIPAL — mais la demande reste offerte
     juste en dessous (« Le demander aussi sur Premier Rang », app-05-fiche.js).
     Le contrôle d'origine disait « les plateformes remplacent Demander » et ne
     passait que parce qu'il comparait « Demander » à un libellé mis en
     capitales par la CSS : il était vrai pour une mauvaise raison. */
  ok('un titre absent mais disponible en abonnement montre la plateforme',
     await page.locator('.btn.plat').count() === 1 &&
     /netflix/i.test(await page.locator('.btn.plat').innerText()) &&
     /netflix/i.test(await page.locator('.actions .btn').first().innerText()));
  ok('la demande reste offerte, en second',
     /le demander aussi sur premier rang/i.test(
       await page.locator('#app').innerText()));
  ok('le bouton porte le sigle et la couleur Netflix',
     await page.locator('.btn.plat.p-netflix').count() === 1 &&
     await page.locator('.btn.plat .plogo').count() === 1);
  ok('« Aussi en streaming » a disparu sur cette vue',
     !/aussi en streaming/i.test(await page.locator('#app').innerText()));

  await page.evaluate(() => go2Decouvrir());
  await page.waitForSelector('.vsl', {timeout:10000});
  await page.evaluate(id => ouvrirFiche(id, 'movie'), idAbsent);
  await page.waitForSelector('.actions', {timeout:5000});
  ok('le même titre montre le même bouton depuis la couverture',
     await page.locator('.btn.plat.p-netflix').count() === 1 &&
     /netflix/i.test(await page.locator('.actions .btn').first().innerText()));

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
  /* Revenir jusqu'à un REPÈRE plutôt que de compter les crans : depuis que la
     couverture et le catalogue sont deux pages, le retour a un niveau de plus,
     et un test de navigation ne devrait pas se casser à chaque niveau ajouté.
     `#fbtn`, le bouton des filtres, ne vit que dans le catalogue. */
  const auCatalogue = async (type) => {
    for(let n = 0; n < 5 && !(await page.locator('#fbtn').count()); n++){
      await page.evaluate(() => goBack());
      await page.waitForTimeout(500);
    }
    if(!(await page.locator('#fbtn').count()) || type){
      await page.evaluate(t => ouvrirCatalogue(t || 'movie'), type || null);
      await page.waitForSelector('.gcard', {timeout:15000});
    }
  };
  await auCatalogue();

  // 2 c. Les plateformes se cochent depuis les filtres, et le profil suit
  /* Le panneau ne montre les plateformes que sur « Cinémathèque » : ailleurs,
     filtrer par abonnement n'a pas de sens. Et une puce n'est plus une case à
     cocher passagère — elle modifie le PROFIL (`bascPlateforme`), pour qu'on
     puisse retirer une plateforme le jour où on s'en désabonne. Décocher est
     donc le geste à vérifier, pas cocher. */
  await auVolet('Cinémathèque');
  await page.click('#fbtn');
  await page.waitForTimeout(400);
  ok('le filtre par plateforme est proposé',
     await page.locator('.chip:text-is("Disney+")').count() === 1 &&
     await page.locator('.chip:text-is("Canal+")').count() === 1);
  await page.click('.chip:text-is("Disney+")');
  await page.waitForTimeout(1000);
  ok('décocher Disney+ le retire de la requête TMDB',
     dernierFournisseurs === '8|119|381');
  ok('et le retire du profil, pas seulement de l\'écran',
     await page.evaluate(() => (GOUTS.d.plats||[]).indexOf(337) < 0 &&
                               GOUTS.d.platsDit === true));
  /* Retirée du profil, la plateforme quitte aussi la liste courte : on ne
     garde sous les yeux que ses propres abonnements, et « + Ajouter » ouvre
     le catalogue complet pour en reprendre une. */
  ok('la plateforme retirée quitte la liste courte',
     await page.locator('.chip:text-is("Disney+")').count() === 0 &&
     await page.locator('.chip:text-is("+ Ajouter")').count() === 1);
  await page.click('.chip:text-is("+ Ajouter")');
  await page.waitForTimeout(400);
  await page.click('.chip:text-is("Disney+")');          // on la reprend
  await page.waitForTimeout(1000);
  ok('la reprendre la rend à la requête',
     dernierFournisseurs.split('|').sort().join('|') === '119|337|381|8');
  /* La feuille des filtres reste ouverte : la section suivante y travaille. */

  // 2 d. Décennies, façon Infuse — et le filtre SUIT le changement de catégorie
  ok('les décennies vont de 1920 à 2020',
     await page.locator('.chip:text-is("1920")').count() === 1 &&
     await page.locator('.chip:text-is("2020")').count() === 1);
  await page.click('.chip:text-is("1990")');
  await page.waitForTimeout(900);
  ok('choisir 1990 borne la requête TMDB à la décennie',
     derniereBorne === '1990-01-01');
  ok('la rangée des décennies se recentre sur la sélection',
     await page.evaluate(() => document.getElementById('fdec').scrollLeft > 0));
  ok('le titre du groupe affiche la décennie choisie',
     /Décennie — 1990/i.test(await page.locator('#sheetin').innerText()));
  ok('la découverte n\'envoie plus region= (dates originales, pas françaises)',
     dernierRegion === null);
  await page.click('button:has-text("Voir les résultats")');
  await page.waitForTimeout(400);
  await auVolet('Tout');                                   // changement de volet
  ok('le filtre années 90 survit au passage Cinémathèque → Tout',
     derniereBorne === '1990-01-01');
  ok('le résumé l\'affiche', /années 90/.test(await page.locator('.resume').innerText()));
  await page.click('#fbtn');
  await page.waitForTimeout(400);
  await page.click('.chip:text-is("1990")');               // on désactive
  await page.waitForTimeout(900);
  ok('réappuyer sur la décennie la désactive', derniereBorne === null);

  // 2 d bis. Origine — Europe + Amérique du Nord par défaut, filtre par région
  ok('par défaut, TMDB ne reçoit que l\'Europe et l\'Amérique du Nord',
     !!dernierOrigine && dernierOrigine.includes('FR') &&
     dernierOrigine.includes('US') && !dernierOrigine.includes('JP'));
  ok('le titre du groupe affiche la région par défaut',
     /Origine — Europe \+ Amér\. N/i.test(await page.locator('#sheetin').innerText()));
  await page.click('#forig .chip:text-is("France")');
  await page.waitForTimeout(900);
  ok('choisir France ne demande que FR à TMDB', dernierOrigine === 'FR');
  await page.click('#forig .chip:text-is("Monde")');
  await page.waitForTimeout(900);
  ok('Monde retire le filtre d\'origine', dernierOrigine === null);
  await page.click('#forig .chip:text-is("France")');
  await page.waitForTimeout(900);
  await page.click('button:has-text("Voir les résultats")');
  await page.waitForTimeout(400);
  await auVolet('Cinémathèque');                                 // changement de volet
  ok('le filtre France survit au passage Tout → Cinémathèque', dernierOrigine === 'FR');
  ok('le résumé affiche la région', /france/.test(await page.locator('.resume').innerText()));
  // Le filtre local de la vue Cinéflix (les pays viennent des fiches du NAS)
  const orig = await page.evaluate(() => {
    const memo = { items: CAT.items, presence: ui.presence, origine: ui.disc.origine };
    CAT.items = [ {t:'movie', id:1, nom:'Américain', pays:['US'], genres:[]},
                  {t:'movie', id:2, nom:'Japonais',  pays:['JP'], genres:[]},
                  {t:'movie', id:3, nom:'Mystère',   pays:[],     genres:[]} ];
    ui.presence = 'dispo';
    ui.disc.origine = 'asie';
    const asie = catalogueFiltre().map(i=>i.id);
    ui.disc.origine = 'monde';
    const monde = catalogueFiltre().map(i=>i.id);
    CAT.items = memo.items; ui.presence = memo.presence; ui.disc.origine = memo.origine;
    return { asie, monde };
  });
  ok('vue Cinéflix : « Asie » garde le titre japonais et les pays inconnus',
     JSON.stringify(orig.asie) === '[2,3]');
  ok('vue Cinéflix : « Monde » garde tout', orig.monde.length === 3);

  // 2 d ter. Notes Télérama (jt/jv fournies par le NAS)
  const tlr = await page.evaluate(() => {
    const f3 = { t:'movie', id:9, nom:'X', jt:3, jv:'Très Bien' };
    const html = tlrHtml(f3);
    const mini = tlrHtml(f3, true);
    const memo = CAT.items;
    CAT.items = [ { t:'movie', id:550, nom:'Fight Club', jt:2, jv:'Bien' } ];
    const carte = carteTitre({ id:550, title:'Fight Club', release_date:'1999-10-27' }, 'movie');
    CAT.items = memo;
    const ordre = [ {jt:1}, {jt:4}, {}, {jt:3} ]
      .sort(comparerLocal('noteT','desc')).map(i => i.jt || 0);
    return { nb: (html.match(/tsq/g)||[]).length, verdict: /Très Bien/.test(html),
             miniSansVerdict: !/Très Bien<\/span>/.test(mini.replace(/title="[^"]*"/,'')),
             carteAvecT: /tsq/.test(carte),
             ordre, triPropose: TRIS_LOCAUX.some(t => t.id === 'noteT') };
  });
  ok('la note Télérama s\'affiche en carrés T + verdict',
     tlr.nb === 3 && tlr.verdict && tlr.miniSansVerdict);
  ok('les vignettes de la bibliothèque portent les T', tlr.carteAvecT);
  ok('le tri « Note Télérama » existe et classe les fiches muettes à la fin',
     tlr.triPropose && JSON.stringify(tlr.ordre) === '[4,3,1,0]');

  // 2 d quater. Les notes hors bibliothèque (vues Cinéma et Plateformes)
  const tlrHors = await page.evaluate(() => {
    TLR.m = new Map([
      ['movie|fightclub|1999',              { jt:3, jv:'Très Bien' }],
      ['movie|troishommesetuncouffin|1985', { jt:1, jv:'Bof' }]
    ]);
    const r = {
      exact:  (noteTlr('movie','Fight Club','1999-10-15')||{}).jt,
      voisin: (noteTlr('movie','Fight Club','2000-01-01')||{}).jt,
      chiffr: (noteTlr('movie','3 hommes et un couffin','1985-09-18')||{}).jt,
      accent: (noteTlr('movie','FIGHT  CLUB !','1999-01-01')||{}).jt,
      rien:   noteTlr('movie','Titre jamais critiqué','2001-01-01'),
      serie:  noteTlr('tv','Fight Club','1999-10-15'),
      /* une vignette de la vue Cinéma : le titre n'est pas sur le NAS */
      carteT: (carteTitre({id:999777, title:'Fight Club', release_date:'1999-10-15'},
                          'movie').match(/tsq/g)||[]).length
    };
    TLR.m = new Map();
    return r;
  });
  ok('la note se retrouve par titre + année, hors bibliothèque', tlrHors.exact === 3);
  ok('un an d\'écart Jellyfin / TMDB ne fait pas perdre la note', tlrHors.voisin === 3);
  ok('« 3 hommes… » retrouve « Trois hommes… »', tlrHors.chiffr === 1);
  ok('casse et ponctuation sont ignorées', tlrHors.accent === 3);
  ok('un titre jamais critiqué n\'affiche rien', tlrHors.rien === null);
  ok('une série ne récupère pas la note du film homonyme', tlrHors.serie === null);
  ok('les vignettes de Cinéma portent les T', tlrHors.carteT === 3);
  await auVolet('Tout');
  await page.click('#fbtn');
  await page.waitForTimeout(400);
  await page.click('#forig .chip:text-is("Europe + Amér. N")');   // retour au défaut
  await page.waitForTimeout(900);
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

  /* La source « Cinéflix », qui ne montrait QUE le serveur, n'existe plus
     comme choix de navigation : « Cinémathèque » mêle les deux versants —
     la bibliothèque et les abonnements — « les titres déjà chez soi sont
     retirés du versant plateformes, ils arrivent par l'autre, avec de
     meilleures données » (chargerSoir). Le cas « rien que la bibliothèque »
     reste couvert, section 2 a : il survient quand on n'a aucun abonnement. */
  await auVolet('Cinémathèque');
  const nDispo = await page.locator('.gcard').count();
  const nTagDispo = await page.locator('.tag.dispo').count();
  ok('« Cinémathèque » mêle la bibliothèque et les plateformes ('+nDispo+' titres)',
     nTagDispo > 0 && nDispo > nTagDispo);
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
     await page.locator('.chip:text-is("Nom")').count() === 1 &&
     await page.locator('.chip:text-is("Aléatoire")').count() === 1 &&
     await page.locator('.chip:text-is("Date de sortie")').count() === 1);
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
  await auVolet('Tout');
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

  // 3 ter. Suggestions en bas de fiche : recommandations + œuvre de la vedette
  await page.waitForTimeout(900);          // la rangée « Avec … » arrive après le rendu
  const txtFiche = await page.locator('#app').innerText();
  ok('la fiche propose « Dans le même esprit »', /dans le m[êe]me esprit/i.test(txtFiche));
  ok('les recommandations excluent le titre lui-même',
     await page.locator('.sectitle:has-text("Dans le même esprit") + .grid.rangee .gcard').count() === 2);
  ok('la fiche propose aussi les autres films de la tête d\'affiche',
     /avec a\. acteur/i.test(txtFiche) && await page.locator('#fsug .gcard').count() > 0);
  ok('cette rangée n\'inclut ni le film courant ni ses séries',
     await page.evaluate(() => {
       const a = (ui.fiche.avec||[])[0] || {};
       return (a.l||[]).length === 15 && !(a.l||[]).some(w => w.id === 550);
     }));
  await page.locator('#fsug .secbtn').first().click();
  await page.waitForSelector('.grid', {timeout:5000});
  ok('le titre « Avec … » ouvre la filmographie de l\'acteur',
     /filmographie/i.test(await page.locator('#app').innerText()));
  await page.click('header .iconbtn');                 // retour sur la fiche du film
  await page.waitForSelector('.actions', {timeout:5000});

  // 3 quater. Séries : saisons puis épisodes
  await page.evaluate(() => ouvrirFiche(1399, 'tv', 'decouvrir'));
  await page.waitForSelector('.grid.rangee', {timeout:5000});
  const cartesS = page.locator('.sectitle:has-text("Saisons") + .grid.rangee .gcard');
  ok('la fiche série liste ses saisons, la saison vide écartée', await cartesS.count() === 3);
  ok('les Spéciaux passent après les saisons numérotées',
     /saison 1/i.test(await cartesS.first().innerText()) &&
     /sp[ée]ciaux/i.test(await cartesS.last().innerText()));
  await cartesS.first().click();
  await page.waitForSelector('.eps', {timeout:5000});
  ok('la saison s\'ouvre sur la liste de ses épisodes', await page.locator('.ep').count() === 6);
  const ep1 = await page.locator('.ep').first().innerText();
  ok('chaque épisode porte son numéro, sa date, sa durée et son résumé',
     /[ée]pisode 1/i.test(ep1) && /2019/.test(ep1) && /52\s*min/i.test(ep1) &&
     /r[ée]sum[ée] de l’[ée]pisode 1/i.test(ep1));
  await page.click('header .iconbtn');                 // retour
  await page.waitForSelector('.actions', {timeout:5000});
  ok('le retour depuis une saison rouvre la fiche de la série',
     await page.evaluate(() => view === 'fiche' && ui.fiche.type === 'tv'));

  // 4. Demander un titre absent de partout
  /* Depuis 3007d, un titre absent du serveur mais disponible en abonnement
     montre la PLATEFORME, pas « Demander » (cf. section 2 b). Pour vérifier
     « Demander », il faut donc un titre qu'on ne peut voir nulle part : c'est
     « Inconnu » (SANS_PLAT), qu'on atteint par la recherche. */
  await auCatalogue('movie');
  await page.click('.chip.chipico');
  await page.waitForTimeout(300);
  await page.fill('#q', 'inconnu');
  await page.waitForTimeout(1000);
  await page.locator('.gcard:not(:has(.tag.dispo))').first().click();
  await page.waitForSelector('.actions', {timeout:5000});
  ok('titre absent de partout → bouton Demander',
     /demander/i.test(await page.locator('.actions .btn').first().innerText()));
  await page.locator('.actions .btn').first().click();
  await page.waitForTimeout(400);
  ok('après demande, le bouton dit « Demandé »',
     /demandé/i.test(await page.locator('.actions .btn').first().innerText()));
  ok('la pastille de navigation compte la demande',
     (await page.locator('nav .pastille-nav').innerText()) === '1');

  // 4 bis. Annuler la demande — a déjà cassé (arguments inversés), reste testé
  await page.locator('.actions .btn').first().click();       // menu « Demandé »
  await page.waitForSelector('.sheet.show', {timeout:3000});
  await page.click('.opt.danger');                            // Annuler ma demande
  await page.waitForTimeout(400);
  ok('annuler la demande rend le bouton « Demander »',
     /demander/i.test(await page.locator('.actions .btn').first().innerText()));
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
  /* L'autre moitié du contrôle du démarrage (cf. section 1) : la bonne
     nouvelle a un écran, et c'est celui-ci. */
  await page.click('.chips .chip:has-text("Arrivés")');
  await page.waitForTimeout(300);
  ok('le titre demandé puis arrivé s\'affiche dans « Arrivés »',
     await page.locator('.lrow, .gcard').count() >= 1 &&
     (await page.locator('#app').innerText()).includes('Fight Club'));

  // 6. Sorties
  /* Le téléphone montre les sorties en GRILLE d'affiches (app-04-sorties.js) ;
     les lignes `.crow` sont la forme du grand écran — et celle du calendrier
     physique du NAS, vérifié juste après. */
  await page.click('nav .tab:has-text("Cinéma")');
  await page.waitForSelector('.pgrid .gcard, .crow, .empty h3', {timeout:15000});
  ok('le calendrier des sorties se remplit',
     await page.locator('.pgrid .gcard, .crow').count() > 0);
  ok('la coche verte marque les sorties déjà sur Cinéflix',
     await page.locator('.pgrid .tag.dispo, .crow .cfx').count() > 0);
  ok('les modes de sortie sont proposés', await page.locator('.chips .chip').count() === 3);

  // 6 bis. Le calendrier des sorties physiques FR relevé par le NAS
  /* Édition, prix, badge 4K, ligne inerte, source : tout cela vit dans les
     LIGNES du calendrier, que seul le grand écran affiche (`cineEtroit`,
     app-04-sorties.js — le téléphone, lui, montre les affiches en grille).
     On passe donc au bureau le temps de cette section. */
  await page.setViewportSize({width:1280, height:900});
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    SORTIES.l = [
      { titre:'Le Comte de Monte-Cristo', vo:'', annee:'2024', date:isoDecale(7),
        edition:'Fourreau 4K UHD + Blu-ray', uhd:true, prix:'19,99', tmdb_id:550, poster:'/p550.jpg' },
      { titre:'La Prisonnière du désert', vo:'The Searchers', annee:'1956', date:isoDecale(14),
        edition:'Standard Blu-ray', uhd:false, prix:'24,99', tmdb_id:999321, poster:'/p9.jpg' },
      { titre:'Édition non identifiée', vo:'', annee:'2001', date:isoDecale(21),
        edition:'Collector', uhd:false, prix:'', tmdb_id:null, poster:'' },
      { titre:'Trop loin dans le temps', vo:'', annee:'2000', date:isoDecale(900),
        edition:'Standard', uhd:false, prix:'', tmdb_id:1, poster:'' }
    ];
    SORTIES.charge = true;
    ui.sorties.mode = 'bluray'; ui.sorties.charge = false;
    chargerSorties();
  });
  await page.waitForTimeout(600);
  ok('le calendrier physique vient du NAS, sans requête TMDB',
     await page.locator('.crow').count() === 3);
  const l1 = await page.locator('.crow').first().innerText();
  ok('la ligne annonce l\'édition et le prix',
     /fourreau 4k uhd/i.test(l1) && /19,99/.test(l1));
  ok('les éditions 4K portent un badge', await page.locator('.b4k').count() === 1);
  ok('un titre déjà sur Cinéflix garde sa coche verte',
     await page.locator('.crow .cfx').count() === 1);
  ok('une sortie que TMDB n\'a pas identifiée reste listée, mais inerte',
     await page.locator('.crow.inerte').count() === 1 &&
     await page.locator('button.crow').count() === 2);
  ok('la source affichée est bien le calendrier français',
     /4k-ultra-hd\.fr/.test(await page.locator('.credit').innerText()));
  await page.evaluate(() => { SORTIES.l = []; SORTIES.charge = false; });
  await page.setViewportSize({width:390, height:844});
  await page.waitForTimeout(400);

  // 7. Persistance
  /* Au rechargement, l'app revient sur la COUVERTURE : c'est la vitrine qui
     dit que le démarrage est allé au bout, plus la grille. */
  await page.reload();
  await page.waitForSelector('.vsl, .empty', {timeout:20000});
  ok('la demande survit au rechargement',
     (await page.locator('nav .pastille-nav').innerText()) === '1');
  ok('la taille d\'affiches choisie survit aussi',
     await page.evaluate(() => document.body.classList.contains('vue-compacte')));

  // 8. Profil
  /* Sur téléphone, Profil n'est pas dans la barre du bas : c'est l'avatar,
     en haut à droite, qui y mène (l'onglet n'existe qu'au bureau). */
  /* Deux avatars dans le DOM — celui de la couverture et celui du bandeau
     compact — dont un seul est à l'écran selon la largeur. */
  await page.locator('.avbtn:visible').first().click();
  await page.waitForTimeout(600);
  ok('le profil annonce la taille du catalogue',
     (await page.locator('.card').first().innerText()).includes('50 films'));

  ok('le profil signale le serveur joignable',
     (await page.locator('.card').first().innerText()).includes('joignable'));

  // 9. La clé fournie par le serveur : nouvel appareil, aucune donnée locale
  const ctx2 = await browser.newContext({ viewport:{width:390,height:844} });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => echecs.push('pageerror(2): '+e.message));
  /* Un corps qui répond à tout : la liste des genres, une page de résultats,
     et une vraie fiche de film — sans quoi la couverture reste sans image et
     la vitrine ne peut pas se construire. */
  await p2.route('**://api.themoviedb.org/**', r => {
    const f = film(550, 'Fight Club');
    r.fulfill({status:200, contentType:'application/json',
      body: JSON.stringify(Object.assign({page:1, total_pages:1, results:[f],
                                          genres:[], images:{}}, f))});
  });
  await p2.route('**://image.tmdb.org/**', r => r.fulfill({status:200, contentType:'image/gif',
    body: Buffer.from('R0lGODlhAQABAAAAACw=','base64')}));
  await p2.route('**/config.js*', r => r.fulfill({status:200, contentType:'application/javascript',
    body: "window.CINEFLIX={tmdbKey:'cle-du-serveur',jellyfinHosts:[],catalogue:'./cineflix.json',region:'FR'};"}));
  await p2.goto(url);
  await p2.waitForSelector('.acc', {timeout:8000});
  /* Sept écrans depuis 3008a, plus huit : « Deux ou trois détails » a été
     supprimé — « aucune de ses questions ne valait d'être posée, et la VO
     n'était branchée sur rien » (etapesBienvenue, app-09-profils.js). */
  ok('parcours d\'accueil : 7 étapes quand la clé vient du serveur',
     await p2.locator('.puces i').count() === 7);
  ok('la première étape demande le prénom',
     await p2.locator('#bvnom').count() === 1);
  await p2.fill('#bvnom', 'Lolo');
  await p2.click('.acc .btn.block');               // « Commencer »
  await p2.waitForTimeout(250);
  ok('l\'étape « clé TMDB » est bien sautée',
     !(await p2.locator('.acc h1').innerText()).toLowerCase().includes('clé'));
  ok('étape 2 : le choix de l\'avatar',
     await p2.locator('.avcoul').count() === 12 && await p2.locator('.avemo').count() === 12);
  await p2.click('.avcoul:nth-child(3)');
  await p2.click('.avemo:nth-child(1)');
  await p2.click('.accliens button:has-text("Passer")');
  await p2.waitForTimeout(150);
  ok('étape 3 : les 18 genres sont proposés',
     await p2.locator('.gchips .chip.aime').count() === 18);
  await p2.click('.gchips .chip.aime:has-text("Comédie")');
  ok('un genre aimé se coche',
     await p2.evaluate(() => BROUILLON.aimes.indexOf(35) >= 0));
  await p2.click('.accliens button:has-text("Passer")');
  await p2.waitForTimeout(150);
  await p2.click('.gchips .chip.fuis:has-text("Horreur")');
  ok('un genre fui se coche',
     await p2.evaluate(() => BROUILLON.fuis.indexOf(27) >= 0));
  await p2.click('.accliens button:has-text("Passer")');
  await p2.waitForTimeout(150);
  ok('étape 5 : la recherche des films totems',
     await p2.locator('#bvq').count() === 1);
  await p2.click('.accliens button:has-text("Passer")');
  await p2.waitForTimeout(150);
  /* Onze plateformes aujourd'hui, quatre à l'époque : on compte ce que la
     table PLATEFORMES contient, plus Premier Rang, plutôt qu'un nombre écrit
     en dur qui se périme à chaque abonnement ajouté. */
  ok('étape 6 : Premier Rang et toutes les plateformes',
     await p2.locator('.gchips .chip.plat').count() ===
       await p2.evaluate(() => PLATEFORMES.length + 1));
  await p2.click('.gchips .chip.plat:has-text("Netflix")');
  ok('un abonnement se coche',
     await p2.evaluate(() => BROUILLON.plats.indexOf(8) >= 0));
  await p2.click('.accliens button:has-text("Passer")');
  await p2.waitForTimeout(150);
  /* L'écran des réglages n'existe plus : des abonnements, on va droit à la
     fin. Les deux contrôles qui l'inspectaient (trois blocs, « oui / non »
     plutôt que « j'adore ») sont donc remplacés par celui-ci. */
  ok('le parcours ne pose plus les réglages',
     await p2.locator('.rgbloc').count() === 0);
  /* 3008a encore : « plus de choix abstrait entre guider et explorer à la
     toute fin ». Un seul bouton ouvre l'app, le guide reste à un doigt dans
     la barre du bas. */
  ok('l\'écran final n\'a qu\'un bouton, et il ouvre l\'app',
     /c.est parti/i.test(await p2.locator('.acc .btn.block').innerText()) &&
     await p2.locator('.acc .btn.block').count() === 1);
  ok('le prénom saisi a bien été retenu',
     await p2.evaluate(() => BROUILLON.pseudo === 'Lolo'));
  await p2.click('.acc .btn.block');
  await p2.waitForSelector('.vsl, .gcard', {timeout:20000});
  ok('le catalogue se charge sans que l\'utilisateur ait saisi de clé',
     await p2.evaluate(() => CAT.charge && CAT.items.length > 0) &&
     await p2.locator('.vsl, .gcard').count() >= 1);
  ok('les goûts déclarés sont conservés en mémoire',
     await p2.evaluate(() => (GOUTS.d||{}).aimes.indexOf(35) >= 0 &&
                             (GOUTS.d||{}).fuis.indexOf(27) >= 0 &&
                             (GOUTS.d||{}).plats.indexOf(8) >= 0));
  await ctx2.close();


  // 10. Profils du foyer : avatars, accueil, pavé de code
  ok('un avatar sans image affiche l’initiale du prénom', await page.evaluate(()=>
     avatarHtml(null,'','Alexandre').indexOf('>A<') >= 0));
  ok('deux prénoms différents reçoivent deux couleurs', await page.evaluate(()=>
     avatarDefaut('Lolo').c !== avatarDefaut('Dad').c));
  ok('un même prénom garde toujours sa couleur', await page.evaluate(()=>
     avatarDefaut('Lolo').c === avatarDefaut('Lolo').c));

  ok('le foyer dédoublonne par e-mail, casse comprise', await page.evaluate(()=>{
     db.foyer = [];
     foyerNoter({email:'a@x.fr', pseudo:'Alex'});
     foyerNoter({email:'A@X.FR', pseudo:'Alexandre'});
     return db.foyer.length === 1 && db.foyer[0].pseudo === 'Alexandre';
  }));
  ok('le foyer ne retient jamais de code ni de mot de passe', await page.evaluate(()=>
     !/code|pass|mdp/i.test(JSON.stringify(db.foyer))));

  await page.evaluate(()=>{
     db.foyer = [];
     foyerNoter({email:'a@x.fr', pseudo:'Alexandre'});
     foyerNoter({email:'l@x.fr', pseudo:'Lolo'});
     foyerNoter({email:'d@x.fr', pseudo:'Dad'});
     go('accueil');
  });
  await page.waitForSelector('.avgrid');
  ok('l’accueil montre une tête par profil, plus « Ajouter »',
     await page.locator('.avcase').count() === 4);
  ok('la barre du bas disparaît sur l’accueil',
     await page.evaluate(()=> document.body.classList.contains('accueil')));
  await page.click('.accliens button:has-text("Gérer")');
  await page.waitForTimeout(150);
  ok('en mode gestion, chaque tête porte une croix',
     await page.locator('.avx').count() === 3);
  await page.click('.avcase .avchoix');
  await page.waitForTimeout(200);
  ok('retirer un profil le retire de cet appareil',
     await page.evaluate(()=> db.foyer.length === 2));

  await page.evaluate(()=> choisirProfil('l@x.fr'));
  await page.waitForSelector('.pad');
  ok('la tête choisie est rappelée sur l’écran de code',
     (await page.locator('.acc h1').innerText()).toLowerCase().includes('lolo'));
  ok('le pavé numérique compte douze touches',
     await page.locator('.pad button').count() === 12);
  await page.click('.pad button:nth-child(1)');
  await page.click('.pad button:nth-child(2)');
  ok('le code se remplit point par point',
     await page.locator('.pts i.on').count() === 2);
  await page.click('.pad button.eff');
  ok('la touche effacer retire un chiffre',
     await page.locator('.pts i.on').count() === 1);
  await page.click('.accliens button:has-text("mot de passe")');
  await page.waitForTimeout(150);
  ok('la bascule « j’ai un mot de passe » ouvre un champ classique',
     await page.locator('#acpass').count() === 1);
  ok('« Ce n’est pas moi » ramène à l’accueil',
     await page.locator('.accliens button:has-text("Ce n")').count() === 1);


  ok('l’inscription demande un accès, sans aucun code partagé', await page.evaluate(()=>{
     ui.auth = { mode:'inscription', err:'', occupe:false };
     const h = viewInscription(ui.auth);
     return h.indexOf('acinv') < 0 && h.indexOf('CINEFLIX87') < 0 &&
            h.indexOf('acnom') >= 0 && h.indexOf('accode2') >= 0 &&
            /demande/i.test(h);
  }));
  ok('un compte en attente ne voit qu’un écran d’attente', await page.evaluate(()=>{
     ui.monProfil = { statut:'attente' };
     const bloque = !accesValide();
     const h = viewAttente();
     ui.monProfil = { statut:'valide' };
     return bloque && accesValide() && /envoy/i.test(h) && h.indexOf('rafraichirAcces') >= 0;
  }));
  ok('un compte refusé le sait, et ne réessaie pas en boucle', await page.evaluate(()=>{
     ui.monProfil = { statut:'refuse' };
     const h = viewAttente();
     const ok2 = accesRefuse() && !accesValide() &&
                 /refus/i.test(h) && h.indexOf('rafraichirAcces') < 0;
     ui.monProfil = { statut:'valide' };
     return ok2;
  }));
  ok('statut inconnu = on laisse passer (le verrou est en base)',
     await page.evaluate(()=>{ ui.monProfil = null; return accesValide(); }));

  // 11. Le moteur : les envies
  /* Le guide ne lit plus une phrase : « une puce dit exactement ce qu'elle
     fait ; une phrase promettait ce qu'elle ne tenait pas » (app-10-guide.js).
     `lireHumeur` est parti avec elle, et les sept contrôles qui l'exerçaient
     n'ont plus d'objet. Ce qui les remplace vérifie les trois règles
     « apprises à trois reprises, sur verdicts d'Alexandre » — c'est là que ce
     moteur est fragile, et c'est là qu'il a déjà cédé.

     RÈGLE 1 — une envie qui NOMME un genre l'exige (`g`, un ET) au lieu de
     l'offrir (`genres`, un OU) : « horreur OU thriller » laissait entrer
     Le Pont des espions dans « Me faire peur ». */
  ok('« Rire un bon coup » exige la comédie, il ne l\'offre pas',
     await page.evaluate(()=>{
       const r = recetteHumeur(HUMEURS.find(h=>h.id==='rire'));
       return r.g.indexOf(35) >= 0 && r.genres.length === 0;
     }));
  /* RÈGLE 2 — ce qui gâche une envie, c'est le genre VOISIN qu'on n'a pas
     exclu : le drame dans la comédie, la guerre dans les pleurs. */
  ok('« Rire un bon coup » écarte le drame, la guerre et l\'horreur',
     await page.evaluate(()=>{
       const r = recetteHumeur(HUMEURS.find(h=>h.id==='rire'));
       return [18,10752,27].every(g => r.sans.indexOf(g) >= 0);
     }));
  ok('« Pleurer un bon coup » écarte la guerre, le western et le polar',
     await page.evaluate(()=>{
       const r = recetteHumeur(HUMEURS.find(h=>h.id==='pleurer'));
       return [10752,37,80].every(g => r.sans.indexOf(g) >= 0);
     }));
  ok('toute envie sauf « valeur sûre » exclut ses voisins',
     await page.evaluate(()=> HUMEURS.every(h =>
       h.id === 'sure' || (h.sans||[]).length > 0)));
  /* RÈGLE 3 — sur une envie qui promet du PLAISIR et non de la qualité, le
     classement par acclamation la retourne : « Rire un bon coup » rendait
     The Truman Show. `simple` annule ces primes. */
  ok('les envies de plaisir annulent la prime aux films acclamés',
     await page.evaluate(()=> ['rire','action'].every(id =>
       recetteHumeur(HUMEURS.find(h=>h.id===id)).simple === true)));
  ok('« Une valeur sûre » ne juge que la note, jamais le genre',
     await page.evaluate(()=>{
       const r = recetteHumeur(HUMEURS.find(h=>h.id==='sure'));
       return r.genres.length === 0 && r.g.length === 0 &&
              r.note >= 7.5 && r.votes >= 1000;
     }));
  ok('chaque envie a son libellé et son émoji, pour la puce qui la porte',
     await page.evaluate(()=> HUMEURS.length >= 10 &&
       HUMEURS.every(h => !!h.id && !!h.label && !!h.emo)));

  // 12. Le moteur : score et périmètre
  ok('les genres de la bibliothèque sont reconnus', await page.evaluate(()=>{
     const l = idsDepuisNoms(['Comédie','Science-Fiction']);
     return l.indexOf(35) >= 0 && l.indexOf(878) >= 0;
  }));
  ok('à égalité, ce qui est sur Cinéflix passe devant', await page.evaluate(()=>{
     GOUTS.d = { aimes:[28], fuis:[27], plats:[], totems:[] };
     const r = { genres:[28], sans:[] };
     const base = { genres:[28], note:7, jt:0, duree:0, annee:2020, reco:null };
     return scorerCandidat(Object.assign({},base,{flix:true}), r) >
            scorerCandidat(Object.assign({},base,{flix:false}), r);
  }));
  ok('un genre fui plombe le score même sur un très bon film', await page.evaluate(()=>{
     GOUTS.d = { aimes:[28], fuis:[27], plats:[], totems:[] };
     const r = { genres:[], sans:[] };
     const fui  = {genres:[27],principal:27,flix:true,vu:0,note:9,jt:4,noteCrit:95,duree:0,annee:2020,reco:null};
     const sain = {genres:[18],principal:18,flix:true,vu:0,note:7,jt:0,noteCrit:0,duree:0,annee:2020,reco:null};
     return scorerCandidat(fui, r) < scorerCandidat(sain, r);
  }));
  ok('un film jamais lancé passe devant un film déjà vu', await page.evaluate(()=>{
     GOUTS.d = { aimes:[], fuis:[], plats:[], totems:[] };
     const b = {genres:[18],principal:18,flix:true,note:7,jt:0,noteCrit:0,duree:0,annee:2020,reco:null};
     return scorerCandidat(Object.assign({},b,{vu:0}), {genres:[],sans:[]}) >
            scorerCandidat(Object.assign({},b,{vu:3}), {genres:[],sans:[]});
  }));
  ok('le genre PRINCIPAL pèse plus qu’un genre secondaire', await page.evaluate(()=>{
     GOUTS.d = { aimes:[], fuis:[], plats:[], totems:[] };
     const r = { genres:[35], sans:[] };
     const vraie = {genres:[35,18],principal:35,flix:true,vu:0,note:7,jt:0,noteCrit:0,duree:0,annee:2020,reco:null};
     const anim  = {genres:[16,35],principal:16,flix:true,vu:0,note:7,jt:0,noteCrit:0,duree:0,annee:2020,reco:null};
     return scorerCandidat(vraie, r) > scorerCandidat(anim, r);
  }));
  ok('une saga ne remplit pas la grille', await page.evaluate(()=>{
     const l = ['Toy Story','Toy Story 2','Toy Story 3','Le Prénom','Intouchables']
       .map((t,i)=>({titre:t, id:i, type:'movie', _s:10-i}));
     const out = choisirSuggestions(l, 5);
     return out.length === 3 && out.filter(c=>/Toy Story/.test(c.titre)).length === 1;
  }));
  ok('la raison cite le film aimé quand elle en vient un', await page.evaluate(()=>
     raisonDe({reco:'Heat', genres:[], flix:false}).indexOf('Heat') >= 0));
  /* Le guide ne choisit plus sa source : il suit les abonnements du profil,
     et 3008h en distingue TROIS cas — j'ai des abonnements, je n'en ai aucun
     (choix assumé), je n'ai pas encore répondu. C'est ce que la phrase de
     portée doit dire, « rien n'agace plus qu'un guide dont on ignore la
     portée » (app-10-guide.js). */
  ok('la portée annoncée suit les abonnements, en trois cas',
     await page.evaluate(()=>{
       const memo = GOUTS.d;
       GOUTS.d = { aimes:[], fuis:[], totems:[], plats:[8], platsDit:true };
       const avec = portee();
       GOUTS.d = { aimes:[], fuis:[], totems:[], plats:[], platsDit:true };
       const sans = portee();
       GOUTS.d = { aimes:[], fuis:[], totems:[], plats:[] };
       const muet = portee();
       GOUTS.d = memo;
       return /abonnements/i.test(avec) && /aucun abonnement/i.test(sans) &&
              /toutes les/i.test(muet) && avec !== sans && sans !== muet;
     }));
  ok('hors Cinéflix, la raison annonce « à demander »', await page.evaluate(()=>
     raisonDe({genres:[18], principal:18, flix:false, plat:null, vu:0,
               annee:2020, pays:[], mc:null}, {}).indexOf('à demander') >= 0));
  ok('sur une plateforme, la raison la nomme', await page.evaluate(()=>
     raisonDe({genres:[18], principal:18, flix:false, plat:8, vu:0,
               annee:2020, pays:[], mc:null}, {}).indexOf('Netflix') >= 0));


  ok('le filtre « français » écarte vraiment les films étrangers', await page.evaluate(()=>{
     CAT.items = [
       {t:'movie', id:1, nom:'Comédie FR', sortie:'1985-01-01', note:7.5, duree:100,
        genres:['Comédie'], pays:['FR'], vu:0, noteCrit:80},
       {t:'movie', id:2, nom:'Comédie US', sortie:'1960-01-01', note:8.2, duree:125,
        genres:['Comédie','Drame'], pays:['US'], vu:0, noteCrit:93}
     ];
     /* « Comédie française » est un rangement de la taxonomie : c'est lui qui
        porte le pays, depuis que le guide ne lit plus de phrase. */
     const r = taxoRecette('comedie-francaise');
     const v = vivierCineflix(r, false);
     return r.pays === 'FR' && v.length === 1 && v[0].titre === 'Comédie FR';
  }));
  ok('un dessin animé ne répond pas à « je veux rire »', await page.evaluate(()=>{
     CAT.items = [
       {t:'movie', id:1, nom:'Vraie comédie', sortie:'2014-01-01', note:7.5, duree:100,
        genres:['Comédie'], pays:['FR'], vu:0, noteCrit:80},
       {t:'movie', id:2, nom:'Toy Story 2', sortie:'1999-01-01', note:7.6, duree:92,
        genres:['Animation','Comédie','Familial'], pays:['US'], vu:0, noteCrit:100}
     ];
     const v = vivierCineflix(recetteHumeur(HUMEURS.find(h=>h.id==='rire')), false);
     return v.length === 1 && v[0].titre === 'Vraie comédie';
  }));
  ok('« en famille » laisse l’animation entrer', await page.evaluate(()=>{
     const v = vivierCineflix(recetteHumeur(HUMEURS.find(h=>h.id==='famille')), false);
     return v.some(c => c.titre === 'Toy Story 2');
  }));
  ok('un film déjà lancé n’est pas reproposé', await page.evaluate(()=>{
     CAT.items = [
       {t:'movie', id:1, nom:'Jamais vu', sortie:'2014-01-01', note:7.5, duree:100,
        genres:['Comédie'], pays:['FR'], vu:0, noteCrit:80},
       {t:'movie', id:2, nom:'Déjà vu', sortie:'2015-01-01', note:8.5, duree:100,
        genres:['Comédie'], pays:['FR'], vu:4, noteCrit:95}
     ];
     const v = vivierCineflix(recetteHumeur(HUMEURS.find(h=>h.id==='rire')), false);
     return v.length === 1 && v[0].titre === 'Jamais vu';
  }));


  // 12 bis. Les sujets (mots-clés TMDB) — du genre au SUJET
  /* Un sujet ne s'attrape plus dans une phrase mais dans la TAXONOMIE
     (app-11-taxo.js), où chaque rangement porte ses mots-clés. Le lexique
     SUJETS n'a plus de porte d'entrée par le texte ; ce qu'il fallait
     protéger — un sujet est un mot-clé, pas un genre — se vérifie sur la
     recette que produit le rangement. */
  ok('« Casse et braquage » est un sujet, pas un genre', await page.evaluate(()=>{
     const r = taxoRecette('casse-braquage');
     return !!r && r.mc.indexOf(10051) >= 0 && r.g.length === 0 &&
            /braquage/i.test(r.titre);
  }));
  ok('« Histoire vraie » demande le fait et refuse la biographie',
     await page.evaluate(()=>{
       const r = taxoRecette('histoire-vraie');
       return !!r && r.mc.indexOf(9672) >= 0 && r.sansMc.indexOf(5565) >= 0;
     }));
  /* La règle délibérée du document : « Militaire » vit sous Action, mais Zero
     Dark Thirty porte Drame/Thriller/Histoire — hériter du genre du parent le
     ferait disparaître. */
  ok('une sous-catégorie n\'hérite PAS du genre qui la contient',
     await page.evaluate(()=>{
       const parent = taxoRecette('action'), enfant = taxoRecette('militaire');
       return parent.g.indexOf(28) >= 0 && enfant.g.length === 0 &&
              enfant.gUn.indexOf(28) >= 0;
     }));
  ok('le sujet filtre la bibliothèque quand elle est couverte', await page.evaluate(()=>{
     CAT.items = [
       {t:'movie', id:1, nom:'Le Casse', sortie:'2014-01-01', note:7, duree:100,
        genres:['Thriller'], pays:['FR'], vu:0, noteCrit:0, mc:[10051]},
       {t:'movie', id:2, nom:'Autre chose', sortie:'2014-01-01', note:8, duree:100,
        genres:['Thriller'], pays:['FR'], vu:0, noteCrit:0, mc:[6054]}
     ];
     const v = vivierCineflix(taxoRecette('casse-braquage'), false);
     return v.length === 1 && v[0].titre === 'Le Casse';
  }));
  ok('un film pas encore enrichi n\'est pas puni tant que la collecte est en cours',
     await page.evaluate(()=>{
     CAT.items = [
       {t:'movie', id:1, nom:'Enrichi', sortie:'2014-01-01', note:7, duree:100,
        genres:['Thriller'], pays:['FR'], vu:0, noteCrit:0, mc:[10051]},
       {t:'movie', id:2, nom:'Pas encore', sortie:'2014-01-01', note:8, duree:100,
        genres:['Thriller'], pays:['FR'], vu:0, noteCrit:0}
     ];
     /* Couverture 50 % : sous le seuil, on garde les deux. */
     return couvertureMC() === 0.5 &&
            vivierCineflix(taxoRecette('casse-braquage'), false).length === 2;
  }));
  ok('le sujet pèse plus que le genre dans le score', await page.evaluate(()=>{
     GOUTS.d = { aimes:[], fuis:[], plats:[], totems:[] };
     const r = { genres:[53], sans:[], mc:[10051] };
     const sujet = {genres:[18],principal:18,mc:[10051],flix:true,vu:0,note:7,jt:0,noteCrit:0,duree:0,annee:2020,reco:null};
     const genre = {genres:[53],principal:53,mc:[6054], flix:true,vu:0,note:7,jt:0,noteCrit:0,duree:0,annee:2020,reco:null};
     return scorerCandidat(sujet, r) > scorerCandidat(genre, r);
  }));
  ok('la raison annonce le sujet plutôt que le genre', await page.evaluate(()=>
     raisonDe({genres:[18],principal:18,mc:[10051],flix:true,vu:0,annee:2020,pays:[]},
              {mc:[10051]}).indexOf('Braquage') === 0));

  // 13. Le guide de bout en bout
  await page.evaluate(()=>{
     CAT.items = [
       {t:'movie', id:550,   nom:'Comédie A', sortie:'2015-01-01', note:7.6, duree:100, genres:['Comédie'], jt:3},
       {t:'movie', id:27205, nom:'Comédie B', sortie:'2018-01-01', note:6.9, duree:95,  genres:['Comédie'], jt:0},
       {t:'movie', id:155,   nom:'Horreur C', sortie:'2012-01-01', note:8.1, duree:130, genres:['Horreur'], jt:0}
     ];
     CAT.movie = new Set([550,27205,155]);
     GOUTS.d = { aimes:[35], fuis:[27], plats:[], totems:[] };
     db.items = {};
     ouvrirGuide();
  });
  /* Les envies ne sont plus des puces parmi d'autres : elles ont leur propre
     forme (`.envie`), « dix envies, vingt genres et quarante-trois rayons
     disent exactement ce qu'ils font » (app-10-guide.js). */
  await page.waitForSelector('.envie');
  ok('le guide propose dix envies plus « selon mes goûts »',
     await page.locator('.envie').count() === 11);
  await page.click('.envie:has-text("Rire")');
  await page.waitForSelector('.grid .gcard', {timeout:8000});
  ok('toutes les suggestions sont dans le périmètre', await page.evaluate(()=>
     ui.guide.res.length > 0 && ui.guide.res.every(c => c.flix)));
  ok('le genre fui est écarté des suggestions', await page.evaluate(()=>
     !ui.guide.res.some(c => c.id === 155)));
  ok('chaque suggestion porte sa raison',
     await page.locator('.graison').count() === await page.locator('.grid .gcard').count());
  const dejaVus = await page.evaluate(()=> ui.guide.res.map(c=>c.id).join(','));
  await page.click('button:has-text("Autre chose")');
  await page.waitForTimeout(1200);
  ok('« Autre chose » ne repropose jamais les mêmes titres',
     await page.evaluate(prev =>
       ui.guide.res.every(c => prev.split(',').indexOf(String(c.id)) < 0), dejaVus));
  ok('le guide ne propose pas ce qui est déjà demandé', await page.evaluate(async ()=>{
     ouvrirGuide();
     db.items = { 'movie:550': {type:'movie', id:550, fav:true} };
     await guider('rire','');
     return !ui.guide.res.some(c => c.id === 550);
  }));


  // 14. Démarrage : le piège qui a coûté une livraison
  /* boot() partait à la fin de app-07, donc AVANT que app-08 à app-10 soient
     exécutés. Quand le stockage répond en microtâche — IndexedDB indisponible,
     par exemple — le démarrage reprenait trop tôt et appelait une fonction pas
     encore définie ; le filet de secours échouait pareil et avalait l'erreur.
     Résultat en production : écran noir, aucun message. */
  const ctx3 = await browser.newContext({ viewport:{width:390,height:844} });
  const p3 = await ctx3.newPage();
  await p3.addInitScript(() => {
    try{ Object.defineProperty(window, 'indexedDB', {get(){ return null; }}); }catch(e){}
    localStorage.setItem('cineflix.v1', JSON.stringify({
      apiKey:'k', pseudo:'Alexandre', onboarde:true, region:'FR', items:{} }));
  });
  await p3.route('**://api.themoviedb.org/**', r => r.fulfill({status:200,
    contentType:'application/json',
    body: JSON.stringify({page:1,total_pages:1,results:[film(550,'Fight Club')],genres:[],images:{}})}));
  await p3.route('**://image.tmdb.org/**', r => r.fulfill({status:200, contentType:'image/gif',
    body: Buffer.from('R0lGODlhAQABAAAAACw=','base64')}));
  await p3.route('**://100.95.13.53*/**', r => r.fulfill({status:200, body:'{}'}));
  await p3.route('**/config.js*', r => r.fulfill({status:200, contentType:'application/javascript',
    body: "window.CINEFLIX={tmdbKey:'',jellyfinHosts:[],catalogue:'./cineflix.json',"+
          "region:'FR',nom:'Cinéflix',supabase:{url:'',key:''}};"}));
  await p3.goto(url);
  await p3.waitForTimeout(3000);
  const dem = await p3.evaluate(()=>({ voile: document.body.classList.contains('booting'),
    app: document.getElementById('app').innerHTML.length,
    cat: CAT.charge, err: window.__bootErr || null }));
  ok('sans IndexedDB, l’app démarre quand même', !dem.voile && dem.app > 300);
  ok('sans IndexedDB, le catalogue se charge', dem.cat === true);
  ok('aucune erreur de démarrage avalée en silence', dem.err === null);
  await ctx3.close();


  // 15. Deux comptes, un seul navigateur — le piège du 29/07
  ok('changer d’identité jette le cache de l’ancien', await page.evaluate(()=>{
     db.items = { 'movie:1': {type:'movie', id:1, fav:true} };
     db.itemsUid = 'utilisateur-A';
     changerDIdentite('utilisateur-B');
     return Object.keys(db.items).length === 0 && db.itemsUid === 'utilisateur-B';
  }));
  ok('la même identité garde son cache', await page.evaluate(()=>{
     db.items = { 'movie:1': {type:'movie', id:1, fav:true} };
     db.itemsUid = 'utilisateur-A';
     changerDIdentite('utilisateur-A');
     return Object.keys(db.items).length === 1;
  }));
  ok('un onglet périmé n’écrit jamais sous la mauvaise identité',
     await page.evaluate(async ()=>{
     /* Le cache appartient à A, la session est passée à B : pousser() doit
        se taire plutôt que d'attribuer les favoris de A au compte de B. */
     let appels = 0;
     const vrai = window.fetch;
     window.fetch = function(){ appels++; return vrai.apply(this, arguments); };
     db.itemsUid = 'utilisateur-A';
     db.auth = { token:'x', uid:'utilisateur-B', email:'b@x.fr' };
     await pousser({type:'movie', id:9, titre:'X'});
     window.fetch = vrai;
     db.auth = null; db.itemsUid = '';
     return appels === 0;
  }));


  // 16. La file : un titre = une ligne, quel que soit le nombre de demandeurs
  ok('deux demandeurs du même film ne font qu’une seule ligne', await page.evaluate(()=>{
     const l = [
       {user_id:'a', pseudo:'Lolotte', type:'movie', tmdb_id:77, titre:'Spider-Man',
        poster:'/p.jpg', statut:'demande', cree_le:'2026-07-29T09:00:00Z'},
       {user_id:'b', pseudo:'Admin', type:'movie', tmdb_id:77, titre:'Spider-Man',
        poster:'/p.jpg', statut:'demande', cree_le:'2026-07-29T10:00:00Z'},
       {user_id:'b', pseudo:'Admin', type:'movie', tmdb_id:88, titre:'Leur vérité',
        poster:'', statut:'encours', cree_le:'2026-07-29T10:00:00Z'}
     ];
     const g = groupesFile(l);
     const sp = g.find(x=>x.tmdb_id===77);
     return g.length === 2 && sp.qui.length === 2 &&
            nomsDemandeurs(sp.qui) === 'Lolotte et Admin' &&
            sp.le === '2026-07-29T09:00:00Z';       // la plus ancienne demande
  }));
  ok('le groupe prend le statut le MOINS avancé', await page.evaluate(()=>{
     const g = groupesFile([
       {user_id:'a', pseudo:'A', type:'movie', tmdb_id:5, statut:'encours', cree_le:'2026-01-01'},
       {user_id:'b', pseudo:'B', type:'movie', tmdb_id:5, statut:'demande', cree_le:'2026-01-01'}
     ]);
     return g[0].statut === 'demande';
  }));
  ok('au-delà de deux, on résume', await page.evaluate(()=>
     nomsDemandeurs([{pseudo:'A'},{pseudo:'B'},{pseudo:'C'},{pseudo:'D'}])
       === 'A, B et 2 autres'));

  // 17. Le bouton « Ma liste » de la vitrine dit où en est le film
  /* Il ajoutait sans jamais le dire : le toast passait, le bouton restait
     « + Ma liste », et un film déjà en favori s'ouvrait comme les autres.
     La vitrine a son propre contexte parce qu'elle a besoin d'un catalogue
     avec de vraies fiches (`items`) — le fichier d'exemple du dépôt n'en a
     pas — et de cinq titres exactement, pour que le tirage au sort des cinq
     propositions du soir soit sans surprise. */
  const ctx4 = await browser.newContext({ viewport:{width:390,height:844},
                                          serviceWorkers:'block' });
  const p4 = await ctx4.newPage();
  const fiches = [];
  for(let i=0;i<5;i++) fiches.push({ t:'movie', id:700000+i, nom:'Film du soir '+i,
    sortie:'2021-05-0'+(i+1), duree:110, note:7.8, noteCrit:88, vu:0,
    genres:['Drame'], pays:['FR'], jf:'jf'+i });
  await p4.addInitScript(() => {
    localStorage.setItem('cineflix.v1', JSON.stringify({
      apiKey:'k', pseudo:'Alexandre', onboarde:true, region:'FR', items:{} }));
  });
  await p4.route('**/cineflix.json*', r => r.fulfill({status:200, contentType:'application/json',
    body: JSON.stringify({ maj:'2026-08-29', movies:fiches.map(f=>f.id), tv:[], items:fiches })}));
  await p4.route('**://api.themoviedb.org/**', r => {
    /* Un corps qui répond à tout : la liste des genres, une page de résultats,
       et la fiche du film que la vitrine va chercher pour son décor. */
    const f = film(700000, 'Film du soir 0');
    r.fulfill({status:200, contentType:'application/json',
      body: JSON.stringify(Object.assign({page:1, total_pages:1, results:[f],
                                          genres:[], images:{}}, f))});
  });
  await p4.route('**://image.tmdb.org/**', r => r.fulfill({status:200, contentType:'image/gif',
    body: Buffer.from('R0lGODlhAQABAAAAACw=','base64')}));
  await p4.route('**://100.95.13.53*/**', r => r.fulfill({status:200, body:'{}'}));
  await p4.route('**/config.js*', r => r.fulfill({status:200, contentType:'application/javascript',
    body: "window.CINEFLIX={tmdbKey:'',jellyfinHosts:[],catalogue:'./cineflix.json',"+
          "region:'FR',nom:'Cinéflix',supabase:{url:'',key:''}};"}));
  await p4.goto(url);
  await p4.waitForSelector('.vsl', {timeout:15000});

  const vb = p4.locator('.vsl .vb2').nth(2);          // la troisième proposition
  ok('au repos, le bouton de la vitrine dit « Ma liste »',
     (await vb.innerText()).trim() === 'Ma liste' &&
     (await vb.getAttribute('aria-pressed')) === 'false');

  /* On se place sur la troisième carte : l'appui ne doit pas ramener le
     carrousel au début — c'est ce qu'un render() ferait. */
  await p4.evaluate(() => { const c = document.getElementById('vcar');
    c.scrollLeft = c.firstChild.getBoundingClientRect().width * 2 + 24; });
  await p4.waitForTimeout(300);
  const posAvant = await p4.evaluate(() => document.getElementById('vcar').scrollLeft);

  await vb.click();
  await p4.waitForTimeout(300);
  ok('après l’appui, le bouton passe à « Dans ma liste »',
     (await vb.innerText()).trim() === 'Dans ma liste' &&
     (await vb.getAttribute('class')).includes('on') &&
     (await vb.getAttribute('aria-pressed')) === 'true');
  ok('le cœur du bouton se remplit',
     await vb.locator('svg[fill="currentColor"]').count() === 1);
  ok('le film est bien passé en favori',
     await p4.evaluate(() => Object.values(db.items).filter(i => i.fav).length === 1));
  ok('le carrousel n’a pas bougé sous le doigt',
     Math.abs((await p4.evaluate(() => document.getElementById('vcar').scrollLeft)) - posAvant) < 2);
  ok('les autres propositions restent au repos',
     await p4.locator('.vsl .vb2.on').count() === 1);

  await vb.click();
  await p4.waitForTimeout(300);
  ok('un second appui retire le film et rend le bouton au repos',
     (await vb.innerText()).trim() === 'Ma liste' &&
     !(await vb.getAttribute('class')).includes('on') &&
     await p4.evaluate(() => Object.values(db.items).every(i => !i.fav)));

  await vb.click();
  await p4.waitForTimeout(300);
  await p4.reload();
  await p4.waitForSelector('.vsl', {timeout:15000});
  ok('au rechargement, un film déjà dans la liste s’affiche marqué',
     await p4.locator('.vsl .vb2.on').count() === 1);
  await ctx4.close();


  // 18. Ma videtheque : la couleur d'abord, le rendu par lots ensuite
  /* Le calcul de la couleur est une fonction PURE : elle ne lit que ses trois
     arguments. C'est ce qui permet de l'eprouver ici, en mode local, sans
     Supabase ni les 2 300 lignes — la lecture des tables, elle, est verifiee
     par test-supabase.js. */
  const vthCouleur = async (film, edition, corr) => await page.evaluate(
    a => couleurFilm(a[0], a[1], a[2]).cl, [film, edition, corr]);

  const DVD   = { palier:'DVD' },        BR = { palier:'BLURAY' };
  const HD    = { palier:'HD_COMPRESSE' }, BAS = { palier:'BAS' };
  const UHD   = { palier:'UHD4K' };
  const edDVD = { meilleur_support:'DVD' }, edBR = { meilleur_support:'BLURAY' };
  const edUHD = { meilleur_support:'UHD4K' };

  ok('le support egal au palier est au maximum',
     await vthCouleur(BR, edBR, null) === 'vert');
  ok('un support meilleur que le palier est ameliorable',
     await vthCouleur(BR, edUHD, null) === 'orange');
  ok('un support moins bon que le palier reste au maximum',
     await vthCouleur(BR, edDVD, null) === 'vert');
  /* DVD et HD_COMPRESSE partagent le rang 1 : un DVD du commerce n'ameliore
     pas un 1080p compresse. */
  ok('DVD et HD_COMPRESSE sont au meme rang',
     await vthCouleur(HD, edDVD, null) === 'vert' &&
     await vthCouleur(DVD, edDVD, null) === 'vert');
  ok('« verifie, qualite maximum » gagne sur tout le reste',
     await vthCouleur(DVD, edUHD, {statut:'VERIFIE_MAX'}) === 'vert');
  ok('la pastille d\'un film verifie ne porte pas le support du marche',
     await page.evaluate(()=> couleurFilm({palier:'DVD'}, {meilleur_support:'UHD4K'},
       {statut:'VERIFIE_MAX'}).libelle) === 'Au maximum');
  ok('le support force prime la jointure',
     await vthCouleur(DVD, edUHD, {support_force:'DVD'}) === 'vert');
  ok('« a revoir plus tard » ne change pas la couleur',
     await vthCouleur(BR, null, {statut:'A_REVOIR'}) === 'rouge');
  /* Regle 4, la file de travail : sans edition connue, seuls les paliers
     BLURAY et HD_COMPRESSE partent en rouge. */
  ok('sans edition, Blu-ray et HD partent a rapprocher',
     await vthCouleur(BR, null, null) === 'rouge' &&
     await vthCouleur(HD, null, null) === 'rouge');
  ok('sans edition, les autres paliers restent non references',
     await vthCouleur(BAS, null, null) === 'gris' &&
     await vthCouleur(DVD, null, null) === 'gris');
  /* La 4K n'a rien au-dessus d'elle : un film range en UHD4K est au maximum
     par construction, et le catalogue des editions n'a pas son mot a dire.
     C'est ce qui envoyait a tort des films du dossier 4K en « non
     reference » quand DVDFr ne les connaissait pas. */
  ok('un palier UHD4K est vert meme sans edition connue',
     await vthCouleur(UHD, null, null) === 'vert');
  ok('et sa pastille dit « 4K », quel que soit le support du marche',
     await page.evaluate(()=> couleurFilm({palier:'UHD4K'}, {meilleur_support:'DVD'}, null).libelle) === '4K' &&
     await page.evaluate(()=> couleurFilm({palier:'UHD4K'}, null, null).libelle) === '4K');
  ok('la 4K passe meme avant le verdict humain',
     await page.evaluate(()=> couleurFilm({palier:'UHD4K'}, null,
       {statut:'A_REVOIR'}).cl) === 'vert' &&
     await page.evaluate(()=> couleurFilm({palier:'UHD4K'}, null,
       {statut:'VERIFIE_MAX'}).libelle) === '4K');
  ok('un palier inconnu ne passe pas pour un maximum',
     await vthCouleur({palier:'ZZZ'}, edDVD, null) === 'orange');

  /* 18 ter bis. La sortie annoncee.
     Un film AMELIORABLE dont la meilleure edition n'est pas encore sortie
     n'a rien a traiter : il attend dans sa propre pile. Une date passee l'en
     fait ressortir SANS ECRITURE - c'est tout l'interet de la regle. */
  const dansNJoursISO = n => {
     const d = new Date(); d.setDate(d.getDate() + n);
     return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+
            String(d.getDate()).padStart(2,'0');
  };
  const FUTUR = dansNJoursISO(40), PASSE = dansNJoursISO(-40), HIER = dansNJoursISO(-1);
  ok('une date future sort le film des ameliorables',
     await vthCouleur(DVD, edBR, { dispo_le: FUTUR }) === 'prevu');
  ok('une mention de sortie suffit, sans date',
     await vthCouleur(DVD, edBR, { dispo_texte:'T4 2026' }) === 'prevu');
  ok('une date passee le laisse ameliorable, sans rien effacer',
     await vthCouleur(DVD, edBR, { dispo_le: PASSE }) === 'orange' &&
     await vthCouleur(DVD, edBR, { dispo_le: HIER }) === 'orange');
  ok('aujourd\'hui n\'est pas posterieur a aujourd\'hui',
     await vthCouleur(DVD, edBR, { dispo_le: dansNJoursISO(0) }) === 'orange');
  ok('sans les deux colonnes, rien ne change',
     await vthCouleur(DVD, edBR, {}) === 'orange' &&
     await vthCouleur(DVD, edBR, { dispo_le:null, dispo_texte:'' }) === 'orange');
  /* La regle ne s'applique qu'a ce qui serait AMELIORABLE : elle ne doit
     voler ni un vert, ni un rouge, ni un gris. */
  ok('un film deja au maximum n\'est pas capture par une date',
     await vthCouleur(BR, edBR, { dispo_le: FUTUR }) === 'vert');
  ok('la 4K et le verdict humain passent toujours devant',
     await vthCouleur(UHD, edBR, { dispo_le: FUTUR }) === 'vert' &&
     await vthCouleur(DVD, edBR, { statut:'VERIFIE_MAX', dispo_le: FUTUR }) === 'vert');
  ok('un film non rapproche reste dans sa file malgre une date',
     await vthCouleur(BR, null, { dispo_le: FUTUR }) === 'rouge' &&
     await vthCouleur(DVD, null, { dispo_le: FUTUR }) === 'gris');
  ok('la pastille annonce l\'attente, pas le support',
     await page.evaluate(a => couleurFilm({palier:'DVD'}, {meilleur_support:'BLURAY'},
       {dispo_le:a}).libelle, FUTUR) === 'Amélioration prévue');

  /* 18 quater. La cle de rapprochement.
     cleVth() est le miroir JS de Get-TitreNormalise (scripts-nas). Ce qui la
     distingue de normVth(), et ce qui se casserait en silence si les deux
     versions divergeaient, c'est le retrait d'UN article initial. */
  const cle = async (t, a) => await page.evaluate(x => cleVth(x[0], x[1]), [t, a]);
  ok('la cle retire l\'article initial francais',
     await cle('Le Parrain', '1972') === 'parrain|1972' &&
     await cle('La Haine', '1995') === 'haine|1995' &&
     await cle('Les Choristes', '2004') === 'choristes|2004');
  ok('elle retire aussi l\'article anglais',
     await cle('The Matrix', '1999') === 'matrix|1999' &&
     await cle('A Serious Man', '2009') === 'serious man|2009');
  ok('l\'apostrophe est un separateur, et « l » un article',
     await cle('L\'Etranger', '1942') === 'etranger|1942' &&
     await cle('L\u2019\u00c9tranger', '1942') === 'etranger|1942');
  ok('un seul article, jamais deux',
     await cle('Le Un', '2020') === 'un|2020' &&
     await cle('The Last Emperor', '1987') === 'last emperor|1987');
  ok('un titre reduit a un article reste ce mot',
     await cle('Le', '2020') === 'le|2020');
  /* Les ligatures ne se decomposent pas en NFD : sans traitement explicite,
     le \u0153 tomberait avec la ponctuation et « C\u0153ur » donnerait « c ur »
     quand la base ecrit « coeur ». La reference est Normalize-Titre, dans
     Pousser_Videotheque_Supabase.ps1, le script qui ECRIT les cles. */
  ok('les ligatures sont developpees, pas jetees',
     await cle('C\u0153ur de tonnerre', '1992') === 'coeur de tonnerre|1992' &&
     await cle('S\u0153urs', '2020') === 'soeurs|2020' &&
     await cle('\u0152il pour \u0153il', '1957') === 'oeil pour oeil|1957' &&
     await cle('L\u2019\u00c6uvre au noir', '1988') === 'aeuvre au noir|1988');
  ok('la recherche developpe les ligatures elle aussi',
     await page.evaluate(()=> normVth('C\u0153ur')) === 'coeur' &&
     await page.evaluate(()=> normVth('\u0152uvre')) === 'oeuvre');
  ok('les accents et la ponctuation tombent comme dans normVth',
     await cle('Am\u00e9lie', '2001') === 'amelie|2001' &&
     await cle('Wall\u00b7E !', '2008') === 'wall e|2008');
  ok('sans titre lisible, pas de cle du tout',
     await cle('', '2020') === '' && await cle('!!!', '2020') === '');
  /* Sans annee, la cle garde sa barre : c'est la forme que la base ecrit. */
  ok('une annee absente laisse la barre',
     await cle('Le Parrain', '') === 'parrain|');

  /* 18 quinquies. Les quatre tentatives de rapprochement, dans l'ordre. */
  const edPour = async (film, edts, corr) => await page.evaluate(a => {
     ui.vth.edts = a[1];
     ui.vth.edtsParCle = {};
     a[1].forEach(e => { ui.vth.edtsParCle[e.cle] = e; });
     ui.vth.corr = a[2] ? { [a[0].cle]: a[2] } : {};
     const e = editionVth(a[0]);
     return e ? e.editeur : null;
  }, [film, edts, corr]);
  const filmTmdb = { cle:'zzz introuvable|1972', annee:'1972',
                     _cleFr:'parrain|1972', _cleOrig:'godfather|1972' };
  ok('le titre du fichier reste la premiere tentative',
     await edPour({ cle:'parrain|1972', _cleFr:'', _cleOrig:'' },
                  [{cle:'parrain|1972', editeur:'FICHIER'}], null) === 'FICHIER');
  ok('a defaut, le titre francais de TMDb rapproche',
     await edPour(filmTmdb, [{cle:'parrain|1972', editeur:'TMDB_FR'}], null) === 'TMDB_FR');
  ok('a defaut encore, le titre original',
     await edPour(filmTmdb, [{cle:'godfather|1972', editeur:'TMDB_VO'}], null) === 'TMDB_VO');
  ok('le titre du fichier passe AVANT les titres TMDb',
     await edPour({ cle:'parrain|1972', _cleFr:'godfather|1972', _cleOrig:'godfather|1972' },
                  [{cle:'parrain|1972', editeur:'FICHIER'},
                   {cle:'godfather|1972', editeur:'TMDB'}], null) === 'FICHIER');
  ok('et le titre francais passe avant l\'original',
     await edPour(filmTmdb, [{cle:'parrain|1972', editeur:'TMDB_FR'},
                             {cle:'godfather|1972', editeur:'TMDB_VO'}], null) === 'TMDB_FR');
  /* Le rattachement manuel est un fait : il bat les trois jointures. */
  ok('un rattachement manuel bat le rapprochement par titre TMDb',
     await edPour(filmTmdb, [{cle:'parrain|1972', editeur:'TMDB_FR'},
                             {cle:'godfather|1972', editeur:'TMDB_VO'},
                             {cle:'choisi|1972', editeur:'MAIN'}],
                  {cle_dvdfr:'choisi|1972'}) === 'MAIN');
  ok('un film sans titre TMDb ne rapproche toujours rien',
     await edPour({ cle:'inconnu|1972', _cleFr:'', _cleOrig:'' },
                  [{cle:'parrain|1972', editeur:'X'}], null) === null);

  // 17 quater. Absents en 4K : le mur, ses filtres, et le refus definitif
  await page.evaluate(()=>{
     estAdmin = true; ui.cineVolet = 'sugg'; ui.sugg.onglet = 'cat';
     ui.sorties.charge = true; ui.sorties.loading = false;
     ui.sugg.charge = true; ui.sugg.l = [];
     db.refus = {}; saveDB();
     go('sorties');
  });
  await page.waitForTimeout(400);
  ok('Suggestions porte trois sous-onglets, le Blu-ray inerte',
     await page.locator('.souschips .chip').count() === 3 &&
     await page.locator('.souschips .chip.off').count() === 1 &&
     await page.locator('.souschips .chip.off[disabled]').count() === 1);
  /* Le premier rendu a lieu AVANT que le fichier ne soit lu : le select des
     decennies est donc vide, et c'est le repeint qui doit le remplir. C'est
     la panne qui avait laisse le select des dossiers vide a vie (3108k). */
  await page.evaluate(()=> setSuggOnglet('q4k'));
  await page.waitForFunction(()=> ui.a4k.charge === true, null, {timeout:8000});
  await page.waitForTimeout(400);
  const optTxt = ()=> page.evaluate(()=>
     [...document.querySelectorAll('#a4kdec option')].map(o => o.textContent).join('|'));
  ok('le select des decennies porte les decennies du fichier',
     await optTxt() === 'Toutes les décennies|Annees 1980|Annees 1970|Annees 1990');
  /* Le select vit HORS de la zone repeinte - c'est ce qui protege le curseur
     du champ de recherche - mais ses options dependent des donnees. On le vide
     a la main pour verifier que le repeint sait les refaire : c'est la panne
     qui avait laisse le select des dossiers vide a vie (3108k). Un test de
     course de temps ne prouverait rien, le fichier arrivant en 150 ms. */
  await page.evaluate(()=>{ document.getElementById('a4kdec').innerHTML = ''; });
  ok('un select vide est reconstruit par le repeint',
     await optTxt() === '' &&
     await page.evaluate(()=>{ peindre4kTout();
       return [...document.querySelectorAll('#a4kdec option')].length; }) === 4);
  ok('les decennies suivent l\'ordre du fichier, pas l\'alphabet',
     await page.evaluate(()=> ui.a4k.decs.join('|')) ===
       'Annees 1980|Annees 1970|Annees 1990');
  /* 7 films au fichier, mais Fight Club est au catalogue du banc. */
  ok('un film deja au catalogue ne s\'affiche pas',
     await page.locator('.a4kc').count() === 9 &&
     (await page.locator('#a4kres').innerText()).indexOf('Fight Club') < 0);
  const titresDec = ()=> page.evaluate(()=>
     [...document.querySelectorAll('#a4kres .a4ktitre')].map(o => o.textContent).join('|'));
  ok('le mur est groupe par decennie, titres en tete',
     await titresDec() === 'Annees 1980|Annees 1970|Annees 1990' &&
     await page.locator('.a4kgrid').count() === 3);
  /* Juge le marquage que la carte PRODUIT, pas ce qui survit a l'ecran : le
     bac a sable ne sort pas vers image.tmdb.org, posterFail() a donc deja
     remplace chaque <img> par un cadre vide dans le DOM vivant. Lire l'ecran
     ne prouverait rien ; la fonction, si. */
  const cartes = await page.evaluate(()=> ({
     avec: carte4kHtml(ui.a4k.l.find(f => f.id === 9314)),
     sans: carte4kHtml(ui.a4k.l.find(f => f.id === 9316))
  }));
  ok('une affiche est demandee a la bonne taille et au bon chemin',
     cartes.avec.indexOf('https://image.tmdb.org/t/p/w342/a.jpg') >= 0 &&
     cartes.avec.indexOf('loading="lazy"') >= 0);
  ok('et le film sans affiche garde un cadre portant son titre, pas un trou',
     cartes.sans.indexOf('<img') < 0 &&
     /class="poster ph[^"]*">Sans affiche du tout</.test(cartes.sans));
  /* Sept cartes agissantes sur neuf : les deux coffrets sans identifiant
     restent au mur mais sans gestes - on ne sait pas les designer. */
  ok('chaque affiche identifiable porte les deux gestes, visibles sans survol',
     await page.locator('.a4kc .sgact.sgg button').count() === 7 &&
     await page.locator('.a4kc .sgact button.no').count() === 7);
  ok('une fiche repetee n\'est montree qu\'une fois',
     await page.evaluate(()=> ui.a4k.l.filter(f => f.id === 9320).length) === 1);
  ok('un coffret sans identifiant reste visible, mais muet',
     await page.locator('.a4kc.muet').count() === 2 &&
     await page.locator('.a4kc.muet button').count() === 0 &&
     await page.evaluate(()=> carte4kHtml({id:null,titre:'X',annee:null,affiche:null}))
       .then(h => h.indexOf('ouvrirFiche') < 0) === true);

  /* Recherche et decennie travaillent sur le tableau COMPLET en memoire. */
  await page.fill('#a4kq', 'orange');
  await page.waitForTimeout(300);
  ok('la recherche porte sur toute la liste, pas sur le lot affiche',
     await page.locator('.a4kc').count() === 1 &&
     (await page.locator('.a4kc .sgnom').innerText()).indexOf('Orange') === 0);
  ok('et le champ de recherche garde le curseur',
     await page.evaluate(()=> document.activeElement &&
                              document.activeElement.id === 'a4kq'));
  await page.fill('#a4kq', '');
  await page.waitForTimeout(250);
  await page.selectOption('#a4kdec', 'Annees 1970');
  await page.waitForTimeout(250);
  ok('le filtre de decennie ne garde que la sienne',
     await page.locator('.a4kc').count() === 3 &&
     await page.locator('#a4kres .a4ktitre').count() === 1);
  ok('et il survit au repeint suivant',
     await page.evaluate(()=>{ peindre4kTout();
       return document.getElementById('a4kdec').value; }) === 'Annees 1970');
  await page.selectOption('#a4kdec', '');
  await page.waitForTimeout(250);

  /* Le coeur : meme mecanisme que Categories, et le film RESTE au mur. */
  await page.evaluate(()=> coeur4k(9318));
  await page.waitForTimeout(250);
  ok('le coeur cree un favori sans faire disparaitre le film',
     await page.evaluate(()=> !!(item('movie', 9318)||{}).fav) &&
     await page.locator('.a4kc').count() === 9 &&
     await page.locator('.a4kc .sgact.sgg button.on').count() === 1);

  /* La croix : refus DEFINITIF. Le banc tourne sans Supabase, donc rien
     n'est pousse - mais le film doit quitter le mur et y rester etranger. */
  await page.evaluate(()=> refuser4k(9319));
  await page.waitForTimeout(300);
  ok('la croix retire le film du mur',
     await page.locator('.a4kc').count() === 8 &&
     (await page.locator('#a4kres').innerText()).indexOf('Orange') < 0);
  ok('et un bandeau permet de revenir sur le geste',
     await page.locator('#refusbar').count() === 1 &&
     /annuler/i.test(await page.locator('#refusbar button').innerText()));
  ok('le refus est range par liste, pas en vrac',
     await page.evaluate(()=> !!(db.refus && db.refus['4k'] && db.refus['4k'][9319])));
  await page.click('#refusbar button');
  await page.waitForTimeout(300);
  ok('annuler le rend au mur, et efface le refus',
     await page.locator('.a4kc').count() === 9 &&
     await page.evaluate(()=> !(db.refus['4k']||{})[9319]) &&
     await page.locator('#refusbar').count() === 0);

  /* Retour a Categories : l'ecran d'origine ne doit pas avoir bouge. */
  await page.evaluate(()=> setSuggOnglet('cat'));
  await page.waitForTimeout(250);
  ok('revenir a Categories rend l\'ecran d\'origine',
     await page.locator('.a4kc').count() === 0 &&
     await page.locator('.souschips .chip.on').count() === 1 &&
     (await page.locator('.souschips .chip.on').innerText())
       .toLowerCase().indexOf('cat') === 0);

  // 18 bis. L'ecran : 2 300 lignes ne se rendent pas d'un coup
  await page.evaluate(()=>{
     estAdmin = true;
     const films = [], edts = [];
     /* Les cinq dossiers reels du NAS. « 720p & 1080p » porte une esperluette :
        il verifie du meme coup que les options sont echappees. */
     const DOSSIERS = ['4K','Full Bluray','720p & 1080p','DVD','Rip 700mo'];
     for(let i = 0; i < 250; i++){
       const cle = 'film ' + i + '|2020';
       films.push({ cle:cle, titre:'Film ' + String(i).padStart(3,'0'), annee:'2020',
                    palier: i % 2 ? 'BLURAY' : 'DVD', dossier: DOSSIERS[i % 5],
                    chemin:'\\\\nas\\Films\\f' + i + '.mkv', taille_octets: 2147483648 });
       if(i % 2 === 0) edts.push({ cle:cle, titre:'Film ' + String(i).padStart(3,'0'),
                                   annee:'2020', editeur:'Editeur', meilleur_support:'UHD4K' });
     }
     /* Un titre accentue, pour verifier que la recherche ignore les accents. */
     films.push({ cle:'amelie|2001', titre:'Amélie', annee:'2001', palier:'BLURAY',
                  dossier:'Full Bluray', chemin:'\\\\nas\\Films\\a.mkv',
                  taille_octets: 1073741824 });
     ui.vth.films = films; ui.vth.edts = edts;
     ui.vth.edtsParCle = {}; edts.forEach(e => { e._n = normVth(e.titre);
                                                 ui.vth.edtsParCle[e.cle] = e; });
     /* L'ORDRE REEL : le premier rendu a lieu AVANT que les trois tables ne
        soient revenues, donc la liste des dossiers est encore vide. La
        pre-remplir ici testerait l'ordre inverse, celui qui ne se produit
        jamais - c'est ce qui avait laisse passer un select vide a vie. */
     ui.vth.corr = {}; ui.vth.dossiers = [];
     /* Deux films dont la meilleure edition est annoncee : l'un par date,
        l'autre par mention. Le second force le support pour verifier que la
        phrase dit « 4K » et non le support de l'edition. */
     const j = n => { const d = new Date(); d.setDate(d.getDate()+n);
       return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+
              String(d.getDate()).padStart(2,'0'); };
     /* Le premier force le support : la phrase doit dire « Blu-ray ». Le
        second n'en force aucun, le mot vient donc de l'edition rapprochee
        (UHD4K) et doit dire « 4K » - c'est le support RESOLU qui parle. */
     ui.vth.corr['film 0|2020'] = { cle:'film 0|2020', dispo_le: j(40),
                                    support_force:'BLURAY' };
     ui.vth.corr['film 2|2020'] = { cle:'film 2|2020', dispo_texte:'T4 2026' };
     films.forEach(f => { f._n = normVth(f.titre); });
     films.sort((a,b)=> String(a.titre).localeCompare(String(b.titre), 'fr'));
     ui.vth.filtre = ''; ui.vth.q = ''; ui.vth.dossier = ''; ui.vth.page = 0;
     ui.vth.charge = true; ui.vth.loading = false; ui.vth.err = '';
     /* Sorties est marque charge : sans ca, son chargement se termine pendant
        le test et appelle render(), ce qui reconstruit TOUT le corps - et
        remplit le select des dossiers par accident. En vrai, Sorties a fini
        depuis longtemps quand on ouvre ce volet, et ce render() n'arrive
        jamais. C'est ce render() parasite qui rendait le banc aveugle. */
     ui.sorties.charge = true; ui.sorties.loading = false;
     recalculerCouleursVth();
     ui.cineVolet = 'vth';
     go('sorties');
  });
  await page.waitForSelector('.vtrow', {timeout:10000});
  ok('le volet Ma videotheque s\'affiche pour un administrateur',
     (await page.locator('.chips.volets .chip').allInnerTexts()).join(' ').toLowerCase()
       .indexOf('vid') >= 0);
  ok('cent lignes rendues sur 251, pas les 251',
     await page.locator('.vtrow').count() === 100 &&
     await page.locator('.plus .btn').count() === 1);

  /* Le select des dossiers vit dans .vtfiltres, VOLONTAIREMENT hors de la
     zone repeinte : c'est ce qui protege le curseur du champ de recherche.
     Mais ses options, elles, dependent des donnees. Il faut donc que le
     repeint les reecrive, sinon le select garde a vie ce qu'il avait au
     premier rendu - c'est-a-dire rien. */
  /* La nouvelle pile et sa phrase de fin de ligne. */
  ok('le compteur « Amélioration prévue » est en 2e position',
     (await page.locator('#vthcpt .chip').allInnerTexts()).length === 6 &&
     /prevue/i.test((await page.locator('#vthcpt .chip').nth(1).innerText())
       .normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
  ok('et il compte les deux films annonces',
     await page.evaluate(()=> ui.vth.compte.prevu) === 2);
  const phrases = (await page.locator('.vtrow .vtdispo').allInnerTexts())
     .map(t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  ok('une date future donne « prevue le JJ Mmm prochain »',
     phrases.some(t => /^sortie prochaine en Blu-ray prevue le \d{2} [A-Z][a-z]{2} prochain$/.test(t)));
  ok('une mention donne « annoncee pour ... », avec le support force',
     phrases.some(t => t === 'sortie prochaine en 4K annoncee pour T4 2026'));
  ok('seule la date est en accent, pas toute la phrase',
     await page.locator('.vtrow .vtdispo b').count() === 2 &&
     /^\d{2} [A-Z][a-z]{2}$/.test(await page.locator('.vtrow .vtdispo b').first().innerText()));
  ok('aucun autre film ne porte de phrase de sortie',
     await page.locator('.vtrow .vtdispo').count() === 2);
  /* Un film annonce est un film RAPPROCHE : son panneau est celui du haut,
     pas la file de travail en deux etapes. */
  /* Le panneau, si tant est qu'un film soit passe dans la nouvelle pile :
     sans ce garde, l'absence de film ferait PLANTER le banc au lieu de le
     faire compter rouge, et le rapport d'echecs ne s'afficherait jamais. */
  const ouvert = await page.evaluate(()=>{
     const f = ui.vth.films.filter(x => x._cl === 'prevu')[0];
     if(!f) return false;
     ouvrirFilmVth(ui.vth.films.indexOf(f));
     return true;
  });
  if(ouvert) await page.waitForSelector('.sheet.show', {timeout:5000});
  ok('le panneau d\'un film annonce est celui d\'un film rapproche',
     ouvert &&
     await page.locator('#sheetin .vtetape').count() === 0 &&
     await page.locator('#sheetin #vthsup').count() === 1);
  ok('et le rappel de correction annonce la sortie',
     ouvert &&
     /sortie annoncee/i.test((await page.locator('#sheetin .vtcorr').innerText())
       .normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
  if(ouvert){ await page.evaluate(()=> closeSheet()); await page.waitForTimeout(200); }
  await page.evaluate(()=> setFiltreVth('prevu'));
  await page.waitForTimeout(200);
  ok('le filtre ne garde que les films annonces',
     await page.locator('.vtrow').count() === 2 &&
     await page.locator('.vtrow .vtp.prevu').count() === 2);
  await page.evaluate(()=> setFiltreVth('prevu'));   /* on eteint le filtre */
  await page.waitForTimeout(200);
  ok('et l\'eteindre rend toute la liste',
     await page.evaluate(()=> ui.vth.filtre) === '' &&
     await page.locator('.vtrow').count() === 100);

  ok('au premier rendu, le select n\'a que « Tous les dossiers »',
     await page.locator('#vthdos option').count() === 1);
  /* On simule la fin du chargement exactement comme chargerVideotheque() :
     distinct sur le tableau COMPLET, tri, puis repeint. */
  await page.evaluate(()=>{
     const v = ui.vth, d = [];
     for(let i = 0; i < v.films.length; i++)
       if(v.films[i].dossier && d.indexOf(v.films[i].dossier) < 0) d.push(v.films[i].dossier);
     d.sort();
     v.dossiers = d;
     peindreVthTout();
  });
  await page.waitForTimeout(200);
  const dosRemplis = await page.locator('#vthdos option').count() === 6 &&
     (await page.locator('#vthdos option').allInnerTexts()).join('|') ===
       'Tous les dossiers|4K|720p & 1080p|DVD|Full Bluray|Rip 700mo';
  ok('le chargement remplit le select des cinq dossiers', dosRemplis);
  /* Les deux controles suivants manipulent le select : sans options, ils ne
     planteraient pas le banc, ils compteraient rouge comme le premier. */
  if(dosRemplis){
    await page.selectOption('#vthdos', 'Rip 700mo');
    await page.waitForTimeout(200);
    ok('le filtre par dossier ne garde que ce dossier',
       await page.locator('.vtrow').count() === 50 &&
       await page.evaluate(()=> ui.vth.dossier) === 'Rip 700mo');
    /* Un repeint ne doit pas ramener le select a « Tous les dossiers » : la
       valeur choisie est relue avant reecriture, et reappliquee apres. */
    await page.evaluate(()=> peindreVthTout());
    await page.waitForTimeout(200);
    ok('et il survit au repeint suivant',
       await page.evaluate(()=> document.getElementById('vthdos').value) === 'Rip 700mo' &&
       await page.evaluate(()=> ui.vth.dossier) === 'Rip 700mo');
    await page.selectOption('#vthdos', '');
    await page.waitForTimeout(200);
  }else{
    ok('le filtre par dossier ne garde que ce dossier', false);
    ok('et il survit au repeint suivant', false);
  }
  await page.click('.plus .btn');
  await page.waitForTimeout(200);
  ok('« Voir plus » ajoute un lot de cent',
     await page.locator('.vtrow').count() === 200);
  /* Six piles depuis « Amélioration prévue ». Deux des 125 ameliorables ont
     une sortie annoncee en fixture : ils comptent desormais ailleurs, et le
     total des six doit toujours retomber sur les 251 films. */
  ok('les six compteurs sont la, et comptent tout le catalogue',
     await page.locator('#vthcpt .chip').count() === 6 &&
     await page.evaluate(()=> ui.vth.compte.ameli === 123 &&
                              ui.vth.compte.prevu === 2 &&
                              ui.vth.compte.rappr === 126) &&
     await page.evaluate(()=> { const c = ui.vth.compte;
       return c.max + c.prevu + c.ameli + c.rappr + c.nonref === ui.vth.films.length; }));
  await page.click('#vthcpt .chip:has-text("Ameliorable"), #vthcpt .chip:has-text("Améliorable")');
  await page.waitForTimeout(200);
  ok('un filtre de couleur ne garde que sa couleur',
     await page.locator('.vtrow .vtp.orange').count() === 100 &&
     await page.locator('.vtrow .vtp.rouge').count() === 0);
  await page.click('#vthcpt .chip.on');
  await page.waitForTimeout(200);
  ok('un second appui sur le meme filtre l\'annule',
     await page.evaluate(()=> ui.vth.filtre === '') &&
     await page.locator('.vtrow .vtp.rouge').count() > 0);
  await page.fill('#vthq', 'amelie');
  await page.waitForTimeout(300);
  ok('la recherche ignore les accents',
     await page.locator('.vtrow').count() === 1 &&
     (await page.locator('.vtrow .cname2').innerText()).indexOf('Am') === 0);
  ok('le champ de recherche garde le curseur pendant la frappe',
     await page.evaluate(()=> document.activeElement && document.activeElement.id === 'vthq'));
  await page.fill('#vthq', '');
  await page.waitForTimeout(200);

  /* Le panneau d'un film a traiter offre TROIS issues : le rapprocher a une
     fiche DVDFr, forcer un support a la main quand la base ne le connait
     pas, ou declarer qu'on a deja le maximum. */
  await page.evaluate(()=>{
     const f = ui.vth.films.filter(x => x._cl === 'rouge')[0];
     ouvrirFilmVth(ui.vth.films.indexOf(f));
  });
  await page.waitForSelector('.sheet.show', {timeout:5000});
  /* Le panneau est un ENCHAINEMENT : l'etape 2 ne s'ouvre qu'une fois la
     recherche DVDFr epuisee. Forcer un support n'a de sens que la, puisqu'une
     fiche rapprochee porte deja le sien. */
  ok('l\'etape 1 est ouverte, la 2 est annoncee mais fermee',
     await page.locator('#sheetin .vtetape').count() === 2 &&
     await page.locator('#sheetin .vtetape.muet').count() === 1 &&
     await page.locator('#sheetin .vtcarte').count() === 0 &&
     await page.locator('#sheetin #vthsup').count() === 0);
  await page.fill('#sheetin #vthqd', 'film 0');
  await page.waitForTimeout(250);
  ok('une recherche qui aboutit laisse l\'etape 2 fermee',
     await page.locator('#sheetin .opt').count() > 0 &&
     await page.locator('#sheetin .vtcarte').count() === 0);
  await page.fill('#sheetin #vthqd', 'zzzzintrouvable');
  await page.waitForTimeout(250);
  ok('une recherche vide invite a passer a l\'etape 2, et l\'ouvre',
     /passe a l.etape 2/i.test((await page.locator('#sheetin #vthdvd').innerText())
       .normalize('NFD').replace(/[\u0300-\u036f]/g, '')) &&
     await page.locator('#sheetin .vtcarte').count() === 2 &&
     await page.locator('#sheetin .vtetape.muet').count() === 0);
  ok('un seul bouton Enregistrer, et un bouton Passer a cote',
     (await page.locator('#sheetin .vtact .btn').allInnerTexts()).join('|')
       .toLowerCase() === 'enregistrer|passer');
  /* L'annonce du resultat est calculee par la meme fonction que la couleur
     reelle : elle ne peut pas diverger du verdict. */
  await page.selectOption('#sheetin #vthsup', 'UHD4K');
  await page.waitForTimeout(200);
  ok('choisir un support selectionne la carte A et annonce le resultat',
     await page.locator('#sheetin .vtcarte.on').count() === 1 &&
     /ameliorable/i.test((await page.locator('#sheetin .vtapercu').innerText())
       .normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
  await page.selectOption('#sheetin #vthsup', 'DVD');
  await page.waitForTimeout(200);
  ok('un support au rang du palier annonce « Au maximum »',
     /au maximum/i.test(await page.locator('#sheetin .vtapercu').innerText()));
  await page.locator('#sheetin .vtcarte').nth(1).click();
  await page.waitForTimeout(200);
  ok('les deux cartes sont exclusives',
     await page.locator('#sheetin .vtcarte.on').count() === 1 &&
     await page.evaluate(()=> ui.vth.carte) === 'B');
  await page.evaluate(()=> closeSheet());
  await page.waitForTimeout(200);

  // 18 ter. Revenir sur une decision
  /* Un film traite quitte sa file : sans un moyen de relire et d'annuler la
     correction, une erreur devenait definitive. */
  await page.evaluate(()=>{
     /* Ardoise propre : les sorties annoncees posees en 18 bis compteraient
        elles aussi comme corrections et fausseraient les deux mesures. */
     ui.vth.corr = {};
     recalculerCouleursVth();
     const rouge = ui.vth.films.filter(x => x._cl === 'rouge')[0];
     const orange = ui.vth.films.filter(x => x._cl === 'orange')[0];
     ui.vth.corr[rouge.cle]  = { cle:rouge.cle, statut:'VERIFIE_MAX',
                                 verifie_le:'2026-08-30T10:00:00Z' };
     ui.vth.corr[orange.cle] = { cle:orange.cle, support_force:'BLURAY' };
     ui.vth._essaiRouge = rouge.cle; ui.vth._essaiOrange = orange.cle;
     recalculerCouleursVth(); ui.vth.page = 0; peindreVthTout();
  });
  await page.waitForTimeout(200);
  ok('le compteur de provenance compte les films corriges',
     await page.locator('#vthcpt .chip').count() === 6 &&
     await page.evaluate(()=> ui.vth.compte.corrige) === 2);
  ok('un film marque « verifie » passe au vert et quitte la file',
     await page.evaluate(()=> {
        const f = ui.vth.films.filter(x => x.cle === ui.vth._essaiRouge)[0];
        return f._cl === 'vert' && fileVth().indexOf(f) < 0;
     }));
  await page.click('#vthcpt .chip:has-text("Corrig")');
  await page.waitForTimeout(200);
  /* Le filtre « Corrige » n'est pas une couleur : il garde les deux films
     touches a la main, l'un vert et l'autre orange. */
  ok('le filtre « Corrige » retrouve les films traites, toutes couleurs melees',
     await page.locator('.vtrow').count() === 2 &&
     await page.locator('.vtrow .vtp.vert').count() === 1 &&
     await page.locator('.vtrow .vtp.orange').count() === 1);

  /* Point 3 : le panneau s'ouvre bien sur un film deja traite - vert compris. */
  await page.evaluate(()=>{
     const f = ui.vth.films.filter(x => x.cle === ui.vth._essaiRouge)[0];
     ouvrirFilmVth(ui.vth.films.indexOf(f));
  });
  await page.waitForSelector('.sheet.show', {timeout:5000});
  ok('le panneau s\'ouvre sur un film vert deja traite',
     (await page.locator('#sheetin').innerText()).toLowerCase()
       .indexOf('correction en place') >= 0 &&
     await page.locator('#sheetin .vtcorr .btn').count() === 1);
  ok('et il rappelle CE qui a ete decide, avec la date',
     /verifie au maximum le 30\/08\/2026/i.test(
       (await page.locator('#sheetin .vtcorr').innerText())
         .normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
  await page.evaluate(()=> closeSheet());
  await page.waitForTimeout(150);

  await page.evaluate(()=>{
     const f = ui.vth.films.filter(x => x.cle === ui.vth._essaiOrange)[0];
     ouvrirFilmVth(ui.vth.films.indexOf(f));
  });
  await page.waitForSelector('.sheet.show', {timeout:5000});
  ok('un support force est annonce lui aussi, et annulable',
     /support force : blu-ray/i.test((await page.locator('#sheetin .vtcorr').innerText())
       .normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
  await page.evaluate(()=> closeSheet());
  await page.waitForTimeout(150);
  await page.evaluate(()=>{ ui.vth.corr = {}; ui.vth.filtre = '';
                            recalculerCouleursVth(); peindreVthTout(); });
  await page.waitForTimeout(200);
  ok('sans correction, le cinquieme compteur retombe a zero',
     await page.evaluate(()=> ui.vth.compte.corrige) === 0);


  await browser.close();

  console.log('');
  if(echecs.length){ console.log('ÉCHECS :'); echecs.forEach(e=>console.log('  - '+e)); process.exit(1); }
  console.log('Tout est vert.');
})();
