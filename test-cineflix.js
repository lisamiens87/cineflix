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
let dernierOrigine = null;         // le with_origin_country du dernier /discover

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
      dernierOrigine = u.searchParams.get('with_origin_country');
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
        { type:5, release_date:'2026-08-12T00:00:00.000Z' } ]}] };
      d['watch/providers'] = { results:{ FR:{ link:'https://x',
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
  await page.waitForSelector('.gcard', {timeout:8000});

  const ok = (nom, cond) => { if(!cond) echecs.push('ÉCHEC — '+nom); else console.log('  ok  '+nom); };

  // 1. Grille et onglets
  ok('4 onglets de navigation', await page.locator('nav .tab').count() === 4);
  ok('grille remplie', await page.locator('.gcard').count() >= 20);
  ok('le tri par défaut est la date de sortie',
     dernierTri === 'primary_release_date.desc');
  ok('une demande arrivée est annoncée au démarrage',
     (await page.locator('.toast').textContent()).includes('disponible') &&
     await page.evaluate(() => db.items['movie:550'].notifie === 1));
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
  ok('la rangée des décennies se recentre sur la sélection',
     await page.evaluate(() => document.getElementById('fdec').scrollLeft > 0));
  ok('le titre du groupe affiche la décennie choisie',
     /Décennie — 1990/i.test(await page.locator('#sheetin').innerText()));
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
  await page.click('.souschips .chip:has-text("Plateformes")');   // changement de catégorie
  await page.waitForTimeout(900);
  ok('le filtre France survit au passage Cinéma → Plateformes', dernierOrigine === 'FR');
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
  await page.click('.souschips .chip:has-text("Cinéma")');
  await page.waitForTimeout(900);
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

  // 6 bis. Le calendrier des sorties physiques FR relevé par le NAS
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
  ok('parcours d\'accueil : 8 étapes quand la clé vient du serveur',
     await p2.locator('.puces i').count() === 8);
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
  ok('étape 6 : les quatre plateformes',
     await p2.locator('.gchips .chip.plat').count() === 4);
  await p2.click('.gchips .chip.plat:has-text("Netflix")');
  ok('un abonnement se coche',
     await p2.evaluate(() => BROUILLON.plats.indexOf(8) >= 0));
  await p2.click('.accliens button:has-text("Passer")');
  await p2.waitForTimeout(150);
  ok('étape 7 : les comptes Jellyfin déclarés sont proposés',
     (await p2.locator('.rgbloc').last().innerText()).includes('Je ne sais pas'));
  await p2.click('.accliens button:has-text("Passer")');
  await p2.waitForTimeout(150);
  ok('l\'écran final propose le guide',
     (await p2.locator('.acc .btn.block').innerText()).includes('guide'));
  ok('le prénom saisi a bien été retenu',
     await p2.evaluate(() => BROUILLON.pseudo === 'Lolo'));
  await p2.click('.accliens button:has-text("Explorer par moi-même")');
  await p2.waitForSelector('.gcard', {timeout:8000});
  ok('le catalogue se charge sans que l\'utilisateur ait saisi de clé',
     await p2.locator('.gcard').count() >= 1);
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
  await page.click('.avcase .avbtn');
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


  ok('l’écran d’invitation ne souffle jamais le vrai code', await page.evaluate(()=>{
     ui.auth = { mode:'inscription', pas:'invit', err:'', occupe:false };
     const h = viewInscription(ui.auth);
     return h.indexOf('acinv') >= 0 && h.indexOf(CFG.invitation || 'CINEFLIX87') < 0;
  }));

  // 11. Le moteur : comprendre l'humeur
  ok('« rire sans me prendre la tête » donne la comédie', await page.evaluate(()=>{
     const r = lireHumeur("j'ai envie de rire sans me prendre la tête");
     return !!r && r.titre === 'Rire un bon coup' && r.genres.indexOf(35) >= 0;
  }));
  ok('« action sans se poser de questions » donne l’action', await page.evaluate(()=>{
     const r = lireHumeur("un film d'action sans se poser de questions");
     return !!r && r.genres.indexOf(28) >= 0 && r.genres.indexOf(12) >= 0;
  }));
  ok('« quelque chose de court » raccourcit la sélection', await page.evaluate(()=>{
     const r = lireHumeur("une comédie mais quelque chose de court");
     return !!r && r.duree <= 110 && r.dits.indexOf('court') >= 0;
  }));
  ok('« une série récente » bascule sur les séries', await page.evaluate(()=>{
     const r = lireHumeur("une série récente");
     return !!r && r.type === 'tv' && r.apres >= 2018;
  }));
  ok('« un film français » restreint l’origine', await page.evaluate(()=>{
     const r = lireHumeur("un thriller français");
     return !!r && r.pays === 'FR' && r.genres.indexOf(53) >= 0;
  }));
  ok('un texte incompris ne bluffe pas et se déclare', await page.evaluate(()=>
     lireHumeur('azerty qwerty foobar') === null));
  ok('« un film sur la guerre » ne déclenche pas « valeur sûre »', await page.evaluate(()=>{
     const r = lireHumeur('un film sur la guerre');
     return !r || r.titre !== 'Une valeur sûre';
  }));

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
  ok('sans abonnement déclaré, le périmètre se limite à Cinéflix', await page.evaluate(()=>{
     GOUTS.d = { aimes:[], fuis:[], plats:[], totems:[] };
     return platsProfil().length === 0;
  }));


  ok('le filtre « français » écarte vraiment les films étrangers', await page.evaluate(()=>{
     CAT.items = [
       {t:'movie', id:1, nom:'Comédie FR', sortie:'1985-01-01', note:7.5, duree:100,
        genres:['Comédie'], pays:['FR'], vu:0, noteCrit:80},
       {t:'movie', id:2, nom:'Comédie US', sortie:'1960-01-01', note:8.2, duree:125,
        genres:['Comédie','Drame'], pays:['US'], vu:0, noteCrit:93}
     ];
     const r = lireHumeur('film français drole');
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
  ok('« un film de braquage » devient un sujet, pas un genre', await page.evaluate(()=>{
     const r = lireHumeur('un film de braquage');
     return !!r && r.mc.indexOf(10051) >= 0 && r.genres.length === 0 &&
            /braquage/i.test(r.titre);
  }));
  ok('« un huis clos » et « une histoire vraie » sont reconnus', await page.evaluate(()=>{
     const a = lireHumeur('un huis clos'), b = lireHumeur('une histoire vraie');
     return !!a && a.mc.indexOf(162914) >= 0 && !!b && b.mc.indexOf(9672) >= 0;
  }));
  ok('un sujet se combine à une humeur', await page.evaluate(()=>{
     const r = lireHumeur('une comédie de braquage');
     return !!r && r.genres.indexOf(35) >= 0 && r.mc.indexOf(10051) >= 0;
  }));
  ok('un sujet se combine à un modificateur', await page.evaluate(()=>{
     const r = lireHumeur('un film de vengeance français');
     return !!r && r.mc.indexOf(9748) >= 0 && r.pays === 'FR';
  }));
  ok('le sujet filtre la bibliothèque quand elle est couverte', await page.evaluate(()=>{
     CAT.items = [
       {t:'movie', id:1, nom:'Le Casse', sortie:'2014-01-01', note:7, duree:100,
        genres:['Thriller'], pays:['FR'], vu:0, noteCrit:0, mc:[10051]},
       {t:'movie', id:2, nom:'Autre chose', sortie:'2014-01-01', note:8, duree:100,
        genres:['Thriller'], pays:['FR'], vu:0, noteCrit:0, mc:[6054]}
     ];
     const v = vivierCineflix(lireHumeur('un film de braquage'), false);
     return v.length === 1 && v[0].titre === 'Le Casse';
  }));
  ok('un film pas encore enrichi n’est pas puni tant que la collecte est en cours',
     await page.evaluate(()=>{
     CAT.items = [
       {t:'movie', id:1, nom:'Enrichi', sortie:'2014-01-01', note:7, duree:100,
        genres:['Thriller'], pays:['FR'], vu:0, noteCrit:0, mc:[10051]},
       {t:'movie', id:2, nom:'Pas encore', sortie:'2014-01-01', note:8, duree:100,
        genres:['Thriller'], pays:['FR'], vu:0, noteCrit:0}
     ];
     /* Couverture 50 % : sous le seuil, on garde les deux. */
     return couvertureMC() === 0.5 &&
            vivierCineflix(lireHumeur('un film de braquage'), false).length === 2;
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
  await page.waitForSelector('.chip.humeur');
  ok('le guide propose dix humeurs plus « selon mes goûts »',
     await page.locator('.chip.humeur').count() === 11);
  await page.click('.chip.humeur:has-text("Rire")');
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

  await browser.close();

  console.log('');
  if(echecs.length){ console.log('ÉCHECS :'); echecs.forEach(e=>console.log('  - '+e)); process.exit(1); }
  console.log('Tout est vert.');
})();
