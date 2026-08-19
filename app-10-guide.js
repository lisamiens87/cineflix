"use strict";
/* ============================ Laisse-moi te guider ============================
   Trois entrées, toutes explicites : une HUMEUR (dix puces), une CATÉGORIE
   (les 20 genres et 43 sous-catégories de la taxonomie, app-11), ou les GOÛTS
   déclarés. Le champ de texte libre a été retiré — il prétendait comprendre
   une phrase et ne faisait que repérer des mots.

   Un seul périmètre, la règle d'or de cet écran :

     on ne propose que ce que cette personne peut regarder CE SOIR,
     c'est-à-dire la bibliothèque du serveur et les plateformes
     auxquelles ELLE est abonnée.

   Proposer un chef-d'œuvre qu'on ne peut pas lancer, c'est une frustration,
   pas une suggestion. Cette règle a été relâchée le 30/07 (portées « au
   cinéma » et « partout ») puis RESTAURÉE le 10/08 par Alexandre : « le
   guide, c'est choisir le film du soir ». Explorer le reste, c'est le
   travail de Découvrir et de ses quatre onglets — pas du guide. */

const gLettres = s => String(s||'').toLowerCase().normalize('NFD').replace(/[^a-z]/g,'');

/* ---------- Les dix humeurs ----------
   Elles ne portent plus de mots déclencheurs : le champ de texte libre a été
   retiré. Ce qui restait était du repérage de mots-clés déguisé en
   compréhension — « un film d'action simple et détendu » rendait Casino
   Royale. Une puce dit exactement ce qu'elle fait ; une phrase promettait ce
   qu'elle ne tenait pas. */
/* ---------- Les envies ----------
   RÈGLE APPRISE À TROIS REPRISES, sur verdicts d'Alexandre :

   1. `genres` est un OU, `g` un ET. « horreur OU thriller » laissait entrer
      Le Pont des espions dans « Me faire peur ». Quand l'envie NOMME un
      genre, c'est `g`.
   2. Le classement récompense les films acclamés. Sur une envie qui promet du
      plaisir et non de la qualité, ça la retourne : « Rire un bon coup »
      rendait The Truman Show et The Descendants. `simple` annule ces primes.
   3. Ce qui gâche une envie, c'est presque toujours un genre VOISIN qu'on
      n'a pas exclu : le drame dans la comédie, la guerre dans les pleurs,
      le polar dans le suspense, la science-fiction dans le voyage.

   Toute modification ici se REVÉRIFIE sur le vrai catalogue, envie par
   envie — le 30/07, six recettes sur dix rendaient autre chose que ce
   qu'elles promettaient, et ça ne se voit qu'en lisant les listes. */
const HUMEURS = [
  /* Le drame exclu (il faisait entrer Little Miss Sunshine, The Descendants,
     Hippocrate) et `simple` posé : on veut rire, pas admirer. */
  { id:'rire', label:'Rire un bon coup', emo:'😄',
    g:[35], sans:[27,10752,18], duree:115, note:6.2, simple:true },
  /* Cette humeur a été refaite après un verdict d'Alexandre : elle rendait
     Casino Royale, Inception, Le Seigneur des anneaux et Seul au monde.
     Trois fautes, aucune subtile. « genres:[28,12] » est un OU, donc une
     aventure sans une once d'action passait (Seul au monde). Le drame n'était
     pas écarté. Et surtout le CLASSEMENT primait les films acclamés — Casino
     Royale sortait à 12 points, Fast & Furious 4 à 7 : l'inverse exact de ce
     que la puce promet. « simple » corrige le troisième point. */
  { id:'action', label:'Action, sans réfléchir', emo:'💥',
    g:[28], sans:[99,36,10752,18,9648], apres:1995, note:5.6, noteMax:7.2,
    simple:true },
  /* L'horreur devient obligatoire : « horreur OU thriller » rendait Mystic
     River, Le Pont des espions et Les 3 Jours du Condor. */
  { id:'peur', label:'Me faire peur', emo:'😱',
    g:[27], sans:[35,10751], note:6 },
  /* Guerre, western, polar et action dehors : ils rendaient Apocalypse Now,
     Django Unchained et Voyage au bout de l'enfer — de grands films, mais on
     ne pleure pas devant. */
  { id:'pleurer', label:'Pleurer un bon coup', emo:'😢',
    genres:[18,10749], sans:[27,10752,37,80,28], note:7.2 },
  { id:'reflechir', label:'Réfléchir', emo:'🧠',
    genres:[18,878,9648], sans:[10751], note:7.3 },
  /* La guerre dehors : La Grande Évasion n'est pas une soirée en famille. */
  { id:'famille', label:'En famille', emo:'👨‍👩‍👧',
    genres:[16,10751,12], sans:[27,53,80,10752], note:6.5 },
  /* Thriller, polar et guerre dehors : Full Metal Jacket et Usual Suspects
     ne sont ni beaux ni lents. */
  { id:'beau', label:'Beau et lent', emo:'🎞️',
    genres:[18,36], sans:[27,28,53,80,10752], note:7.4 },
  /* Le POLAR retiré : à lui seul il faisait entrer Pulp Fiction et Taxi
     Driver, qui ne tiennent personne en haleine. */
  { id:'suspense', label:'Suspense', emo:'🔎',
    genres:[53,9648], sans:[10751], note:6.8 },
  /* La science-fiction dehors : Ready Player One et Avengers ne font pas
     voyager, ils font décoller. */
  { id:'voyager', label:'Voyager', emo:'🌍',
    genres:[12,99,36], sans:[27,878], note:6.5 },
  { id:'sure', label:'Une valeur sûre', emo:'⭐',
    genres:[], sans:[], note:7.8, votes:2000 }
];

/* ---------- Le lexique des SUJETS ----------
   Les genres sont dix-neuf cases ; les mots-clés TMDB disent de quoi parle le
   film. C'est ce qui sépare « une comédie » de « un film de braquage ».

   PIÈGE STRUCTUREL : les mots-clés de TMDB sont en ANGLAIS et le resteront
   (« heist », « road trip », « based on true story »). Ce tableau est le pont.
   Les identifiants ont été résolus contre /search/keyword, pas devinés. */
const SUJETS = [
  { dit:'braquage',        mots:['braquage','casse','hold up','holdup','cambriolage'], mc:[10051,642,15363] },
  { dit:'road movie',      mots:['road movie','road trip','sur la route','voyage en voiture'], mc:[7312] },
  { dit:'histoire vraie',  mots:['histoire vraie','faits reels','tire de la realite','biopic','biographie'], mc:[9672,5565] },
  { dit:'vengeance',       mots:['vengeance','venger','revanche'], mc:[9748] },
  { dit:'post-apocalyptique', mots:['post apocalyptique','apocalyptique','fin du monde','dystopie','dystopique'], mc:[4458,4565,12332] },
  { dit:'guerre',          mots:['seconde guerre','deuxieme guerre','39 45','premiere guerre','14 18','nazis'], mc:[1956,2504,375138] },
  { dit:'espionnage',      mots:['espionnage','espion','agent secret','barbouze'], mc:[470,5265,1568] },
  { dit:'tueur en série',  mots:['tueur en serie','serial killer','psychopathe'], mc:[10714] },
  { dit:'super-héros',     mots:['super heros','superheros','superhero','comics'], mc:[9715] },
  { dit:'zombies',         mots:['zombie','zombies','morts vivants'], mc:[12377] },
  { dit:'extraterrestres', mots:['extraterrestre','extraterrestres','alien','aliens','ovni'], mc:[9951] },
  { dit:'voyage dans le temps', mots:['voyage dans le temps','remonter le temps','boucle temporelle'], mc:[4379] },
  { dit:'prison',          mots:['prison','prisonnier','evasion','s evader','taule'], mc:[378,10685] },
  { dit:'procès',          mots:['proces','tribunal','avocat','justice','pretoire'], mc:[33519] },
  { dit:'mafia',           mots:['mafia','mafieux','gangster','pegre','parrain'], mc:[10391,3149] },
  { dit:'amitié',          mots:['amitie','copains','potes','entre amis'], mc:[6054] },
  { dit:'apprentissage',   mots:['adolescence','adolescent','passage a l age adulte','jeunesse','initiatique'], mc:[10683] },
  { dit:'lycée',           mots:['lycee','college','ecole','etudiants','fac'], mc:[6270] },
  { dit:'boxe',            mots:['boxe','boxeur','ring'], mc:[209476] },
  { dit:'sport',           mots:['sport','sportif','competition','entrainement'], mc:[333328] },
  { dit:'musique',         mots:['musique','musicien','groupe de rock','chanteur','concert','jazz'], mc:[4048] },
  { dit:'Noël',            mots:['noel','fetes de fin d annee','pere noel'], mc:[207317] },
  { dit:'enquête',         mots:['enquete','detective','inspecteur','investigation'], mc:[703] },
  { dit:'survie',          mots:['survie','survivre','naufrage','perdu en pleine nature'], mc:[10349,2580] },
  { dit:'espace',          mots:['espace','spatial','astronaute','cosmos','vaisseau'], mc:[3801,14626,161176] },
  { dit:'intelligence artificielle', mots:['intelligence artificielle','robot','robots','androide','ia'], mc:[378084,14544] },
  { dit:'addiction',       mots:['drogue','addiction','toxicomane','alcoolisme','dependance'], mc:[1803] },
  { dit:'hôpital',         mots:['hopital','medecin','chirurgien','maladie','soignants'], mc:[11612] },
  { dit:'journalisme',     mots:['journalisme','journaliste','presse','reporter'], mc:[917] },
  { dit:'politique',       mots:['politique','president','election','pouvoir','campagne'], mc:[6078] },
  { dit:'danse',           mots:['danse','danseur','danseuse','ballet'], mc:[1691] },
  { dit:'enlèvement',      mots:['enlevement','kidnapping','rapt','otage'], mc:[1930] },
  { dit:'amnésie',         mots:['amnesie','perte de memoire','memoire effacee','se souvenir de rien'], mc:[1453] },
  { dit:'jumeaux',         mots:['jumeaux','jumelles','sosie'], mc:[15016] },
  { dit:'sous-marin',      mots:['sous marin','submersible'], mc:[339] },
  { dit:'avion',           mots:['avion','aviation','pilote de chasse','crash aerien'], mc:[3800] },
  { dit:'train',           mots:['train','ferroviaire','gare'], mc:[13008] },
  { dit:'vampires',        mots:['vampire','vampires'], mc:[3133] },
  { dit:'sorcellerie',     mots:['sorciere','sorcier','sorcellerie','magie'], mc:[616,2343] },
  { dit:'arts martiaux',   mots:['arts martiaux','kung fu','karate','samourai','ninja'], mc:[779,1462] },
  { dit:'course-poursuite',mots:['course poursuite','poursuite en voiture','cascades'], mc:[9844] },
  { dit:'complot',         mots:['complot','conspiration','manipulation d etat'], mc:[10410] },
  { dit:'épidémie',        mots:['epidemie','pandemie','virus','contagion'], mc:[188973] },
  { dit:'montagne',        mots:['montagne','alpinisme','escalade','sommet'], mc:[8624] },
  { dit:'mariage',         mots:['mariage','noces','se marier'], mc:[13027] },
  { dit:'divorce',         mots:['divorce','separation','rupture'], mc:[15160] },
  { dit:'adoption',        mots:['adoption','adopter','famille d accueil'], mc:[2393] },
  { dit:'immigration',     mots:['immigration','immigre','exil','clandestin'], mc:[1900] },
  { dit:'racisme',         mots:['racisme','discrimination','segregation'], mc:[12425] },
  { dit:'résistance',      mots:['resistance','maquis','occupation'], mc:[357283] },
  { dit:'dictature',       mots:['dictature','dictateur','totalitaire','regime'], mc:[7606] },
  { dit:'dinosaures',      mots:['dinosaure','dinosaures','jurassique'], mc:[12616] },
  { dit:'secte',           mots:['secte','gourou','communaute fermee'], mc:[6158] },
  { dit:'pirates',         mots:['pirate','pirates','corsaire','flibustier'], mc:[12988] },
  /* « Huis clos » est mal servi par TMDB : le concept existe mais il est très
     peu étiqueté. On prend l'union de toutes les variantes plausibles — ça
     restera la moins bonne entrée du lexique, autant le savoir. */
  { dit:'huis clos',       mots:['huis clos','une seule nuit','en vase clos','confine','enferme'],
    mc:[162914,18029,348145,377474,301728,186527,2147,18233,2321] },
  { dit:'province',        mots:['province','petite ville','campagne','village'], mc:[1415] }
];

/* Quelle part de la bibliothèque a déjà reçu ses mots-clés ? Le NAS les
   collecte par lots ; tant que la couverture est faible, un filtre dur ferait
   disparaître des titres qui n'ont simplement pas encore été interrogés. */
let _couvMC = null, _couvSrc = null;
function couvertureMC(){
  if(_couvSrc !== CAT.items){
    _couvSrc = CAT.items;
    const l = CAT.items || [];
    _couvMC = l.length ? l.filter(i => i && i.mc).length / l.length : 0;
  }
  return _couvMC;
}

/* ---------- Le périmètre ---------- */
/* Le guide n'était braqué que sur la bibliothèque. Les trois sources de
   Découvrir s'appliquent tout aussi bien ici — avec une conséquence assumée :
   hors Cinéflix, une suggestion n'est pas regardable ce soir, elle devient
   une demande. L'écran le dit plutôt que de le cacher. */
/* Plus de choix de portée ici (10/08) : la banque du guide est UNE, et
   c'est la réunion de la bibliothèque et des plateformes cochées dans
   « Mes goûts » (les quatre connues si rien n'est coché). */

const platsProfil = ()=> {
  const g = GOUTS.d || {};
  return Array.isArray(g.plats) ? g.plats.filter(Boolean) : [];
};

/* Un titre venu des recommandations n'est pas forcément regardable : on
   vérifie chez quelles plateformes il est en illimité en France. Une requête
   par titre, mise en cache, et plafonnée — c'est le seul coût réseau
   supplémentaire de cet écran. */
const cacheProv = {};
async function fournisseursFR(type, id){
  const k = type+':'+id;
  if(cacheProv[k]) return cacheProv[k];
  try{
    const d = await tmdb('/'+type+'/'+id+'/watch/providers');
    const fr = ((d.results||{})[db.region||'FR'] || {});
    cacheProv[k] = (fr.flatrate||[]).map(p=>p.provider_id);
  }catch(e){ cacheProv[k] = []; }
  return cacheProv[k];
}

/* ---------- Traduction genres ↔ noms ---------- */
function idsDepuisNoms(noms){
  const l = (noms||[]).map(gLettres);
  return GENRES_FILM.filter(g => {
    const n = gLettres(g.n);
    return l.some(x => x === n || (x.length > 3 && n.indexOf(x) >= 0) ||
                                  (n.length > 3 && x.indexOf(n) >= 0));
  }).map(g=>g.id);
}

/* ---------- Construire la recette ---------- */
function recetteVide(){
  return { genres:[], sans:[], note:0, votes:0, duree:0, apres:0, avant:0,
           pays:'', type:'movie', titre:'', dits:[], mc:[],
           g:[], gUn:[], sansMc:[], dureeMin:0, noteMax:0, locNoms:[], taxo:'',
           simple:false };
}
function recetteHumeur(h){
  const r = recetteVide();
  r.genres = (h.genres||[]).slice(); r.sans = (h.sans||[]).slice();
  r.g = (h.g||[]).slice(); r.gUn = (h.gUn||[]).slice();
  r.note = h.note || 0; r.votes = h.votes || 0;
  r.noteMax = h.noteMax || 0;
  r.duree = h.duree || 0; r.apres = h.apres || 0;
  r.simple = !!h.simple;
  r.titre = h.label;
  return r;
}
function recetteGouts(){
  const g = GOUTS.d || {};
  const r = recetteVide();
  r.genres = (g.aimes||[]).slice();
  r.sans = (g.fuis||[]).slice();
  r.note = 6.2; r.votes = 200;
  r.duree = g.duree || 0;
  if(g.vieux === false) r.apres = 1990;
  r.titre = 'D\'après tes goûts';
  return r;
}
/* ---------- Les viviers ---------- */
/* 1. La bibliothèque : aucune requête, tout est déjà en mémoire — et le NAS
   y met bien plus que des titres. Le pays, la note des critiques, la note
   Télérama, la durée, la classification, et surtout : COMBIEN DE FOIS tu l'as
   lancé. C'est cette dernière colonne qui fait la différence entre un guide et
   une grille — 2 179 de tes 2 270 films n'ont jamais été ouverts. */
function fiche2candidat(i, t){
  const noms = i.genres || [];
  return { type:t, id:i.id, titre:i.nom, poster:'', date:i.sortie,
           annee: Number(String(i.sortie||'').slice(0,4)) || 0,
           note: i.note || 0, duree: i.duree || 0,
           genres: idsDepuisNoms(noms),
           /* Jellyfin liste le genre PRINCIPAL en premier : c'est lui qui
              sépare une comédie d'un dessin animé qui fait rire. */
           principal: idsDepuisNoms(noms.slice(0,1))[0] || 0,
           /* Les NOMS de genres, tels que Jellyfin les ecrit : Concert et
              Theatre n'existent pas chez TMDB et ne se retrouvent que la. */
           nomsG: noms.map(x => gLettres(x)),
           /* Cette fiche VIENT de la bibliothèque : elle est chez soi par
              construction. Sans cette étiquette, la règle d'or « regardable
              ce soir » (3007o) jetait toute la bibliothèque — vécu, guide
              vide dès la première vérification. */
           flix: true,
           pays: i.pays || [], vu: i.vu || 0, ajout: i.ajout || '',
           mc: i.mc || null,
           noteCrit: i.noteCrit || 0, cert: i.cert || '',
           flix:true, plat:null, reco:null, jt: i.jt || 0 };
}

function vivierCineflix(r, revoir){
  const t = r.type;
  const dem0 = r.genres.concat(r.g, r.gUn);
  /* L'animation n'entre que si on l'a demandée : sans cette garde, « je veux
     rire » remonte Toy Story, qui porte bien le genre Comédie. */
  const veutAnim = dem0.indexOf(16) >= 0 || dem0.indexOf(10751) >= 0;
  return (CAT.items||[]).filter(i => i && i.t === t).map(i => fiche2candidat(i, t))
    .filter(c=>{
      if(r.pays && (c.pays||[]).indexOf(r.pays) < 0) return false;
      /* Un rayon propre au serveur (Concert, Théâtre) : il se lit sur le nom
         du genre, pas sur un identifiant TMDB qui n'existe pas. */
      if(r.locNoms.length && !r.locNoms.some(n => (c.nomsG||[]).indexOf(n) >= 0))
        return false;
      /* Le sujet demandé. Tant que le NAS n'a pas couvert la bibliothèque, un
         film sans mots-clés connus reste dans la course : l'écarter reviendrait
         à punir un titre pour une collecte en retard. */
      /* Les mots-clés ne s'appliquent PAS quand le rayon a déjà été reconnu
         par son nom : Concert et Théâtre sont des genres du serveur, aucun de
         ces films ne porte de mot-clé TMDB, et le filtre les effaçait. Les
         mots-clés restent la porte d'entrée hors Cinéflix, où le nom du rayon
         n'existe pas. */
      if(r.mc.length && !r.locNoms.length){
        if(c.mc){ if(!r.mc.some(id => c.mc.indexOf(id) >= 0)) return false; }
        else if(couvertureMC() > 0.6) return false;
      }
      if(r.sansMc.length && c.mc && r.sansMc.some(id => c.mc.indexOf(id) >= 0)) return false;
      if(r.genres.length && !r.genres.some(g => c.genres.indexOf(g) >= 0)) return false;
      /* `g` est un ET : tous ces genres doivent etre la. */
      if(r.g.length && !r.g.every(g => c.genres.indexOf(g) >= 0)) return false;
      if(r.gUn.length && !r.gUn.some(g => c.genres.indexOf(g) >= 0)) return false;
      if(r.sans.length && r.sans.some(g => c.genres.indexOf(g) >= 0)) return false;
      if(!veutAnim && c.genres.indexOf(16) >= 0) return false;
      if(veutAnim && typeof rangCert === 'function'){
        const rg = rangCert(c.cert);
        if(rg != null && rg > 10) return false;      // « en famille » = tous publics
      }
      /* Le NAS note plus sévèrement que TMDB : on desserre un peu le seuil. */
      if(r.note && c.note && c.note < r.note - 0.6) return false;
      /* Le plafond de note sert « action décomplexée » : un film que les
         critiques ont adoré n'est plus, par définition, de la série B.
         PAS de tolérance ici, contrairement au plancher : la marge de +0,4
         existait parce que le NAS note plus sévèrement que TMDB — argument qui
         vaut pour un minimum, pas pour un maximum. Avec elle, Casino Royale
         (7,57) passait sous un plafond de 7,2. */
      if(r.noteMax && c.note && c.note > r.noteMax) return false;
      if(r.duree && c.duree && c.duree > r.duree + 10) return false;
      if(r.dureeMin && c.duree && c.duree < r.dureeMin - 10) return false;
      if(r.apres && c.annee && c.annee < r.apres) return false;
      if(r.avant && c.annee && c.annee > r.avant) return false;
      if(!revoir && c.vu > 0) return false;
      return true;
    });
}

/* 2. Hors bibliothèque : TMDB fait le tri lui-même.
   mode « plats » restreint aux abonnements du profil (à défaut, les quatre
   plateformes connues) ; mode « tout » n'impose aucune disponibilité. */
async function vivierTmdb(r, pages, mode){
  const plats = platsFilms();   /* 3008h : zéro abonnement veut dire zéro */
  const champ = r.type === 'movie' ? 'primary_release_date' : 'first_air_date';
  const dem = r.genres.concat(r.g, r.gUn);
  const veutAnim = dem.indexOf(16) >= 0 || dem.indexOf(10751) >= 0;
  /* Le tri fait plus de dégâts qu'on ne croit. « popularity.desc » remonte ce
     qui sort CETTE SEMAINE : « Action d'auteur » rendait L'Odyssée, Supergirl
     et Les Maîtres de l'univers. Pour une catégorie, ce qu'on veut ce sont les
     films qui la DÉFINISSENT — donc les plus vus. Le même essai en
     « vote_count.desc » rend Inception, The Dark Knight, Le Parrain.
     Les humeurs gardent la popularité : là, la nouveauté est un plus. */
  const base = { include_adult:'false',
                 sort_by: r.taxo ? 'vote_count.desc' : 'popularity.desc' };
  if(plats.length){
    base.watch_region = db.region || 'FR';
    base.with_watch_providers = plats.join('|');
    base.with_watch_monetization_types = 'flatrate';
  }else{
    /* Sans contrainte de disponibilité, le fond de TMDB remonte des fiches
       quasi vides : un minimum de votes garde les vrais titres. */
    base['vote_count.gte'] = String(r.votes || 150);
  }
  /* TMDB ne sait pas melanger ET et OU dans with_genres : la virgule est un
     ET, la barre un OU, et les deux ne se combinent pas. On envoie le ET (`g`)
     a la requete, et le OU (`gUn`) est applique au retour sur les genre_ids
     que /discover renvoie de toute facon. */
  if(r.g.length) base.with_genres = r.g.join(',');
  else if(r.genres.length) base.with_genres = r.genres.join('|');
  else if(r.gUn.length) base.with_genres = r.gUn.join('|');
  const exclus = r.sans.slice();
  if(!veutAnim) exclus.push(16);
  if(exclus.length) base.without_genres = exclus.join(',');
  if(r.note){ base['vote_average.gte'] = String(r.note);
              base['vote_count.gte'] = String(r.votes || 150); }
  if(r.noteMax){ base['vote_average.lte'] = String(r.noteMax);
                 base['vote_count.gte'] = String(r.votes || 150); }
  if(r.votes && !base['vote_count.gte']) base['vote_count.gte'] = String(r.votes);
  if(r.duree) base['with_runtime.lte'] = String(r.duree);
  if(r.dureeMin) base['with_runtime.gte'] = String(r.dureeMin);
  if(r.apres) base[champ+'.gte'] = r.apres+'-01-01';
  if(r.avant) base[champ+'.lte'] = r.avant+'-12-31';
  if(r.pays)  base.with_origin_country = r.pays;
  if(r.mc && r.mc.length) base.with_keywords = r.mc.join('|');
  if(r.sansMc && r.sansMc.length) base.without_keywords = r.sansMc.join(',');

  const lots = await Promise.all([1,2,3].slice(0, pages||2).map(p =>
    tmdb('/discover/'+r.type, Object.assign({}, base, {page:String(p)})).catch(()=>({results:[]}))));
  const out = [];
  lots.forEach(d => (d.results||[]).forEach(x=>{
    if(!x.poster_path) return;
    const date = r.type === 'movie' ? x.release_date : x.first_air_date;
    const g = x.genre_ids || [];
    /* Le OU de genres, que la requete n'a pas pu porter. */
    if(r.gUn.length && r.g.length && !r.gUn.some(id => g.indexOf(id) >= 0)) return;
    out.push({ type:r.type, id:x.id, titre:(x.title||x.name||''), poster:x.poster_path,
               date:date, annee: Number(String(date||'').slice(0,4)) || 0,
               note: x.vote_average || 0, duree:0, genres:g, principal:g[0]||0,
               pays:(x.origin_country||[]), vu:0, ajout:'', noteCrit:0, cert:'',
               flix: surCineflix(r.type, x.id), plat: plats[0] || null, reco:null, jt:0 });
  }));
  return out;
}

/* 3. Les recommandations des trois films adorés — la source la plus fine, et
   la seule à porter une vraie raison (« parce que tu as aimé … »). Elles ne
   respectent pas le périmètre par construction : on les y ramène. */
async function vivierTotems(r){
  const g = GOUTS.d || {};
  const totems = (g.totems||[]).slice(0,3);
  if(!totems.length || r.type !== 'movie') return [];
  const plats = platsFilms();   /* 3008h : zéro abonnement veut dire zéro */
  const lots = await Promise.all(totems.map(t =>
    tmdb('/movie/'+t.id+'/recommendations', {page:'1'})
      .then(d => ({ src:t.titre, l:(d.results||[]) }))
      .catch(()=>({ src:t.titre, l:[] }))));

  const bruts = [];
  lots.forEach(x => x.l.forEach(y=>{
    if(!y.poster_path) return;
    const g2 = y.genre_ids || [];
    bruts.push({ type:'movie', id:y.id, titre:y.title||y.name||'', poster:y.poster_path,
                 date:y.release_date, annee:Number(String(y.release_date||'').slice(0,4))||0,
                 note:y.vote_average||0, duree:0, genres:g2, principal:g2[0]||0,
                 pays:[], vu:0, ajout:'', noteCrit:0, cert:'',
                 flix: surCineflix('movie', y.id), plat:null, reco:x.src, jt:0 });
  }));

  /* Celles qui sont déjà sur le serveur passent sans vérification. Pour les
     autres, on interroge les fournisseurs — mais pas indéfiniment : vingt
     titres au maximum, sinon l'écran met dix secondes à s'afficher. */
  const dedans = bruts.filter(c => c.flix);
  const aTester = plats.length ? bruts.filter(c => !c.flix).slice(0, 20) : [];
  for(let i = 0; i < aTester.length; i += 5){
    const bout = aTester.slice(i, i+5);
    const rep = await Promise.all(bout.map(c => fournisseursFR('movie', c.id)));
    bout.forEach((c,k)=>{
      const commun = (rep[k]||[]).find(p => plats.indexOf(p) >= 0);
      if(commun){ c.plat = commun; dedans.push(c); }
    });
  }
  return dedans;
}

/* ---------- Le score ---------- */
/* Deux familles de points, et elles ne disent pas la même chose :
   ce que la personne aime (ses goûts, son humeur du moment) et ce que
   l'objet vaut (les critiques, Télérama) — plus un signal que seule une
   bibliothèque personnelle possède : « tu ne l'as jamais lancé ». */
function scorerCandidat(c, r){
  const g = GOUTS.d || {};
  let s = 0;
  if(c.reco) s += 3;

  let bonus = 0;
  (g.aimes||[]).forEach(id => { if(c.genres.indexOf(id) >= 0) bonus += 2; });
  s += Math.min(4, bonus);
  (g.fuis||[]).forEach(id => { if(c.genres.indexOf(id) >= 0) s -= 6; });

  /* Le sujet est ce qu'on a demandé de plus précis : il pèse plus que le
     genre, qui n'est qu'une famille. */
  if(r.mc && r.mc.length && c.mc){
    const n = r.mc.filter(id => c.mc.indexOf(id) >= 0).length;
    if(n) s += Math.min(8, 4 + 2 * n);
  }

  /* Le genre demandé compte double quand c'est le genre PRINCIPAL du film :
     une comédie l'emporte sur un film d'aventure qui a aussi fait rire. */
  const dm = r.genres.concat(r.g || [], r.gUn || []);
  if(dm.length){
    if(dm.indexOf(c.principal) >= 0) s += 4;
    else if(dm.some(id => c.genres.indexOf(id) >= 0)) s += 1;
  }

  if(c.flix) s += c.vu ? 1 : 3;              // jamais lancé : la vraie trouvaille
  if(c.noteCrit >= 85) s += 2; else if(c.noteCrit >= 70) s += 1;
  if(c.jt >= 3) s += 2; else if(c.jt) s += 1;
  if(c.note >= 7.5) s += 1;

  /* Quand la demande est « sans réfléchir » ou « décomplexé », les primes à la
     reconnaissance ci-dessus jouent CONTRE la demande : elles remontaient
     Inception et The Dark Knight en tête d'une puce qui promet le contraire.
     On les annule — on ne les inverse pas : « sans réfléchir » ne veut pas
     dire « mauvais », et récompenser la médiocrité serait une autre faute. */
  if(r.simple){
    if(c.noteCrit >= 85) s -= 2; else if(c.noteCrit >= 70) s -= 1;
    if(c.jt >= 3) s -= 2; else if(c.jt) s -= 1;
    if(c.note >= 7.5) s -= 1;
  }

  if(g.duree && c.duree && c.duree > g.duree) s -= 3;
  if(g.vieux === false && c.annee && c.annee < 1990) s -= 2;
  return s;
}

/* Une saga alignée n'est pas une suggestion : « Toy Story 1, 2, 3 » compte
   pour un. On réduit le titre à sa racine — sans numéro, sans sous-titre. */
function racineTitre(t){
  return gLettres(String(t||'')
    .replace(/\s*[:\-–—].*$/,'')
    .replace(/\s+(\d+|[ivx]+)\s*$/i,'')).slice(0,14);
}

/* Le tri final. Un peu de hasard PAR-DESSUS le score : deux visites de suite
   ne doivent pas donner la même liste, sans pour autant remonter n'importe
   quoi — l'écart de trois points ne renverse que des candidats voisins. */
function choisirSuggestions(liste, n){
  liste.forEach(c => { c._r = c._s + Math.random() * 3; });
  liste.sort((a,b)=> b._r - a._r);
  const out = [], vues = new Set();
  for(const c of liste){
    if(out.length >= n) break;
    const rc = racineTitre(c.titre);
    if(rc && vues.has(rc)) continue;
    vues.add(rc);
    out.push(c);
  }
  return out;
}

function raisonDe(c, r){
  if(c.reco) return 'Parce que tu as aimé ' + c.reco;
  const bits = [];
  /* Quand un sujet a été demandé et que le film le porte, c'est LA raison :
     elle est plus parlante que son genre. */
  if(r && r.mc && r.mc.length && c.mc){
    const s = SUJETS.find(x => x.mc.some(id => c.mc.indexOf(id) >= 0 && r.mc.indexOf(id) >= 0));
    if(s) bits.push(s.dit.charAt(0).toUpperCase() + s.dit.slice(1));
  }
  const g = nomGenre(c.principal) || c.genres.map(nomGenre).filter(Boolean)[0];
  if(g && bits.indexOf(g) < 0) bits.push(g);
  if((c.pays||[]).indexOf('FR') >= 0) bits.push('France');
  if(c.annee) bits.push(String(c.annee));
  if(c.jt >= 3) bits.push(c.jt + ' T Télérama');
  else if(c.noteCrit >= 85) bits.push('critiques ' + c.noteCrit + '%');
  if(c.flix && !c.vu) bits.push('jamais lancé');
  else if(c.flix && c.vu) bits.push('déjà vu');
  else if(c.plat){
    const p = PLATEFORMES.find(x => x.id === c.plat);
    bits.push(p ? 'sur ' + p.nom : 'en streaming');
  }
  else bits.push('à demander');
  return bits.slice(0,4).join(' · ');
}

/* ---------- L'orchestration ---------- */
let guideSeq = 0;

async function guider(source, txt){
  const g = ui.guide;
  let r = null;

  if(source === 'gouts'){
    r = recetteGouts();
  }else if(source.indexOf('taxo:') === 0){
    r = taxoRecette(source.slice(5)) || recetteGouts();
  }else{
    const h = HUMEURS.find(x => x.id === source);
    r = h ? recetteHumeur(h) : recetteGouts();
  }
  /* Les goûts s'appliquent toujours par-dessus l'humeur : ce qu'on fuit reste
     écarté, même quand on a envie de rire. */
  /* Ce qu'on fuit reste ecarte — sauf si c'est precisement ce qu'on vient de
     demander : cliquer « Horreur » dans la taxonomie est une demande
     explicite, elle gagne sur le gout declare. */
  const gt = GOUTS.d || {};
  const voulus = r.genres.concat(r.g, r.gUn);
  (gt.fuis||[]).forEach(id => {
    if(r.sans.indexOf(id) < 0 && voulus.indexOf(id) < 0) r.sans.push(id);
  });

  if(source === 'gouts' && !aGouts()){
    g.err = 'Je ne connais pas encore tes goûts. Renseigne-les dans '+
            'Profil → Mes goûts, ou choisis une catégorie ci-dessus.';
    g.res = []; g.loading = false; g.charge = true; return render();
  }

  const seq = ++guideSeq;
  g.loading = true; g.err = ''; g.recette = r; g.source = source;
  render();

  try{
    const [externes, totems] = await Promise.all([
      vivierTmdb(r, 3, 'plats').catch(()=>[]),
      source === 'gouts' ? vivierTotems(r).catch(()=>[]) : Promise.resolve([])
    ]);
    if(seq !== guideSeq) return;

    /* Sur la bibliothèque, on n'exhume que ce qui n'a jamais été lancé — c'est
       tout l'intérêt d'un guide posé sur SA collection. Si la moisson est trop
       maigre, on rouvre aux films déjà vus plutôt que de rendre une page vide. */
    let cine = vivierCineflix(r, false);
    if(cine.length < 12) cine = vivierCineflix(r, true);
    const tout = totems.concat(cine, externes);

    /* Dédoublonnage : un même titre peut venir des trois viviers. On garde la
       version la plus informée — celle qui porte une raison, ou l'affiche. */
    const par = new Map();
    tout.forEach(c=>{
      const k = c.type+':'+c.id;
      const d = par.get(k);
      if(!d){ par.set(k, c); return; }
      if(!d.reco && c.reco) d.reco = c.reco;
      if(!d.poster && c.poster) d.poster = c.poster;
      if(!d.plat && c.plat) d.plat = c.plat;
      if(c.flix) d.flix = true;
      if(!d.duree && c.duree) d.duree = c.duree;
      if(!d.jt && c.jt) d.jt = c.jt;
      if(!d.genres.length && c.genres.length) d.genres = c.genres;
    });

    let liste = Array.from(par.values()).filter(c=>{
      if(g.vus[c.type+':'+c.id]) return false;             // déjà montré cette session
      const it = item(c.type, c.id);
      if(it && (it.fav || it.req)) return false;           // déjà vu passer, déjà demandé
      /* La règle d'or : regardable CE SOIR — chez soi, ou sur un
         abonnement. Tout le reste appartient à Découvrir. */
      return c.flix || !!c.plat;
    });

    /* La note Télérama, récupérée après coup : elle pèse dans le score et
       s'affiche dans la raison. */
    liste.forEach(c=>{
      if(c.jt) return;
      const n = noteDe(c.type, c.id, c.titre, c.date);
      if(n && n.jt) c.jt = n.jt;
    });

    liste.forEach(c => { c._s = scorerCandidat(c, r); });
    /* Moitié-moitié (10/08, choix d'Alexandre) : sans quota, la bibliothèque
       raflait TOUTES les places — ses fiches portent la presse et Télérama,
       les candidats plateformes n'ont que la note du public, ils perdaient à
       chaque fois. Dix places pour chaque monde ; si l'un manque de matière,
       l'autre complète, et l'écran reste plein. Le passage final par
       choisirSuggestions mélange les deux moitiés en un seul classement et
       écarte les doublons de saga. */
    const duServeur = liste.filter(c => c.flix);
    const desPlats  = liste.filter(c => !c.flix && c.plat);
    const s10 = choisirSuggestions(duServeur, 10);
    const p10 = choisirSuggestions(desPlats, 10);
    const manque = 20 - s10.length - p10.length;
    const complement = manque <= 0 ? []
      : s10.length < 10
        ? choisirSuggestions(desPlats.filter(c => p10.indexOf(c) < 0), manque)
        : choisirSuggestions(duServeur.filter(c => s10.indexOf(c) < 0), manque);
    liste = choisirSuggestions(s10.concat(p10, complement), 20);

    /* Les titres venus de la bibliothèque n'ont pas d'affiche : le NAS
       n'envoie que des identifiants. On va la chercher. */
    const sansImage = liste.filter(c => !c.poster);
    if(sansImage.length){
      const fiches = await Promise.all(sansImage.map(c =>
        tmdb('/'+c.type+'/'+c.id).catch(()=>null)));
      if(seq !== guideSeq) return;
      sansImage.forEach((c,i)=>{
        const f = fiches[i];
        if(!f) return;
        c.poster = f.poster_path || '';
        if(!c.duree) c.duree = f.runtime || 0;
        if(!c.note) c.note = f.vote_average || 0;
        if(!c.genres.length) c.genres = (f.genres||[]).map(x=>x.id);
      });
      liste = liste.filter(c => c.poster);
    }

    liste.forEach(c => { g.vus[c.type+':'+c.id] = 1; });
    g.res = liste; g.loading = false; g.charge = true;
    if(!liste.length)
      g.err = platsFilms().length
        ? 'Rien trouvé dans ce registre sur Cinéflix ni sur tes plateformes.'
        : 'Rien trouvé sur Cinéflix. Ajoute tes abonnements dans « Mes goûts » '+
          'pour élargir les propositions.';
    render();
  }catch(e){
    if(seq !== guideSeq) return;
    g.loading = false; g.charge = true;
    g.err = (e.message === 'BADKEY') ? 'Clé TMDB refusée' : 'Pas de connexion';
    render();
  }
}

function ouvrirGuide(){
  ui.guide = { txt:'', recette:null, res:[], loading:false, err:'', charge:false,
               vus:{}, source:'', taxoG:'', taxoSel:'' };
  guideAmorce = false;
  go('guide');
}
/* L'onglet, lui, ne remet pas les compteurs à zéro : on revient au guide tel
   qu'on l'avait laissé. Repartir de rien à chaque visite serait punir celui
   qui va juste vérifier un titre ailleurs. */
function allerGuide(){
  if(!ui.guide) return ouvrirGuide();
  go('guide');
}

/* ---------- Plus jamais d'écran vide ----------
   L'app a une règle : on ne montre que ce qui est regardable ce soir, et
   chaque vignette dit pourquoi elle est là. Un écran qui s'ouvre en demandant
   « choisis une entrée » contredit cette règle. On rejoue donc tout de suite
   la dernière humeur utilisée. La toute première fois — et seulement
   celle-là — les tuiles restent seules à l'écran : imposer une humeur au
   hasard quand on ne sait rien serait pire que de laisser choisir. */
let guideAmorce = false;
function assurerGuide(){
  const g = ui.guide;
  if(guideAmorce || !g || g.charge || g.loading || g.err || g.source) return;
  if(!db.humeur) return;
  guideAmorce = true;
  setTimeout(()=>{ if(view === 'guide') guiderHumeur(db.humeur); }, 0);
}
function guiderHumeur(id){
  ui.guide.txt = '';
  ui.guide.taxoSel = '';
  /* On retient la dernière humeur : c'est elle qui remplira l'écran la
     prochaine fois. Se souvenir, ce n'est pas deviner. */
  if(id){ db.humeur = id; saveDB(); }
  guider(id, '');
}
/* « Ou entrer par catégorie » ouvre un ÉCRAN, pas un dépliant : c'est une
   autre étape — on ne choisit plus une envie, on ouvre un rangement — et une
   étape mérite sa page, avec son titre et sa flèche de retour. */
function ouvrirCategories(){ ui.guide.ecran = 'cat'; render(); }
function fermerCategories(){ ui.guide.ecran = ''; render(); }

/* Deux colonnes : les vingt genres à gauche, les rayons et les films à
   droite. Chaque colonne a son propre défilement — c'est tout l'intérêt de
   la formule : changer de genre ne doit jamais obliger à remonter la page.
   Les affiches y sont plus GRANDES qu'ailleurs (deux par ligne dans 298 px
   contre trois dans 388), ce qui compense la colonne perdue. */
/* ---------- Deux mises en page pour le même écran (3008m) ----------
   Sur téléphone, la colonne de gauche mangeait 122 px des 390 — un tiers de
   l'écran pour un geste qu'on fait une fois — et les affiches s'y trouvaient
   à l'étroit : titres sur deux lignes, sous-titre coupé, quatre films
   visibles. Alexandre a retenu la maquette « accordéon » : la liste des
   genres tient toute la largeur, celui qu'on ouvre déplie ses rayons et une
   rangée de films qui défile. Sur grand écran, les deux colonnes restent la
   meilleure formule — elles ne bougent pas. */
const catEtroit = ()=> {
  try{ return !matchMedia('(min-width:860px)').matches; }catch(e){ return true; }
};

function corpsCatAccordeon(g){
  const ouvert = taxoGenreOuvert();
  return '<div class="catacc">'+TAXO.map(x=>{
    const on = ouvert === x.id;
    let h = '<button class="caccg'+(on?' on':'')+'" onclick="setTaxoGenre(\''+x.id+'\')">'+
      '<span class="cacce">'+x.emo+'</span><b>'+esc(x.nom)+'</b>'+
      '<i class="caccf">'+(on ? '⌄' : '›')+'</i></button>';
    if(!on) return h;
    let d = '<div class="caccray">'+
      (x.sous||[]).map(s=>'<button class="chip'+(g.taxoSel === s.id ? ' on' : '')+
        '" onclick="guiderTaxo(\''+s.id+'\')">'+esc(s.nom)+'</button>').join('')+
      '<button class="chip'+(g.taxoSel === x.id ? ' on' : '')+
        '" onclick="guiderTaxo(\''+x.id+'\')">Tout le genre</button>'+
    '</div>';
    if(g.loading)      d += '<div class="catvide"><span class="spin"></span></div>';
    else if(g.err)     d += '<div class="catvide">'+esc(g.err)+'</div>';
    else if(!g.charge) d += '<div class="catvide">Choisis un rayon.</div>';
    else {
      const l = g.res.filter(c => !rejete(c.id));
      d += l.length
        ? '<div class="caccrow">'+l.map(carteGuide).join('')+'</div>'
        : '<div class="catvide">Rien dans ce rayon. Essaie un rayon voisin.</div>';
    }
    return h + '<div class="caccbloc">'+d+'</div>';
  }).join('')+'</div>';
}

function viewCategories(){
  const g = ui.guide;
  const ouvert = taxoGenreOuvert();
  const e = TAXO.find(x => x.id === ouvert);
  let h = header('Par catégorie', {back:'fermerCategories()'});
  if(catEtroit()) return h + corpsCatAccordeon(g);

  let droite = '';
  if(!e){
    droite = '<div class="catvide">Choisis un genre à gauche.<br>'+
      'Les rayons et les films s\'afficheront ici.</div>';
  } else {
    droite = '<div class="catray">'+
      (e.sous||[]).map(s=>'<button class="chip'+(g.taxoSel === s.id ? ' on' : '')+
        '" onclick="guiderTaxo(\''+s.id+'\')">'+esc(s.nom)+'</button>').join('')+
      '<button class="chip'+(g.taxoSel === e.id ? ' on' : '')+
        '" onclick="guiderTaxo(\''+e.id+'\')">Tout le genre</button>'+
    '</div>';
    if(g.loading)      droite += '<div class="catvide"><span class="spin"></span></div>';
    else if(g.err)     droite += '<div class="catvide">'+esc(g.err)+'</div>';
    else if(!g.charge) droite += '<div class="catvide">Choisis un rayon.</div>';
    else if(!g.res.length)
      droite += '<div class="catvide">Rien dans ce rayon. Essaie un rayon voisin, '+
        'ou élargis la recherche au-dessus.</div>';
    else droite += '<div class="grid">'+g.res.filter(c => !rejete(c.id)).map(carteGuide).join('')+'</div>';
  }

  return h + '<div class="catdeux">'+
    '<div class="catg">'+
      TAXO.map(x=>'<button class="catgi'+(ouvert === x.id ? ' on' : '')+
        '" onclick="setTaxoGenre(\''+x.id+'\')">'+esc(x.nom)+'</button>').join('')+
    '</div>'+
    '<div class="catd">'+droite+'</div>'+
  '</div>';
}
function guiderEncore(){
  const g = ui.guide;
  guider(g.source || 'gouts', g.txt || '');
}

/* ---------- Le verdict ----------
   Le guide se trompe environ une fois sur deux, et jusqu'ici PERSONNE ne
   savait lesquelles. Un geste par affiche — « pas pour cette envie » — et
   deux choses arrivent : le film sort de cette envie tout de suite, et on
   commence à constituer le seul étalon qui permettra un jour de mesurer si
   un changement de règle améliore ou dégrade. Sans lui, tout réglage est
   une devinette, y compris ceux que j'ai faits hier.

   RÉSERVE IMPORTANTE : ces verdicts vivent dans le stockage de CET appareil.
   Ils ne deviendront un vrai étalon que le jour où ils monteront dans
   Supabase — c'est la suite immédiate, et tant qu'elle n'est pas faite, un
   effacement de données du navigateur les perd. */
const cleEnvie = ()=> (ui.guide||{}).source || '';
function rejetes(){ return ((db.pas||{})[cleEnvie()]) || []; }
function rejete(id){ return rejetes().indexOf(id) >= 0; }
function pasPourCa(id){
  const k = cleEnvie();
  if(!k) return;
  if(!db.pas) db.pas = {};
  if(!db.pas[k]) db.pas[k] = [];
  if(db.pas[k].indexOf(id) < 0) db.pas[k].push(id);
  saveDB();
  toast('Écarté de cette envie');
  render();
}
/* Toujours réversible, et d'un seul geste : un verdict pris par erreur ne
   doit pas polluer l'étalon pour toujours. */
function rendreLesEcartes(){
  const k = cleEnvie();
  if(k && db.pas) delete db.pas[k];
  saveDB();
  render();
}

/* ---------- L'écran ---------- */
function carteGuide(c){
  return '<div class="gcard">'+
    '<button class="gouvre" onclick="ouvrirFiche('+c.id+',\''+c.type+'\',\'guide\')">'+
      /* Pas de coche « sur Cinéflix » ici (retirée en 3007j, demande
         d'Alexandre) : en « chez toi » TOUT l'est — la coche était partout,
         donc muette — et en « tes abonnements » plus rien ne l'est depuis
         3007d. Savoir si on possède UN film précis, c'est le travail de la
         recherche, pas du guide. */
      '<div class="wrapimg">'+ posterEl(c.poster,'w342','',c.titre)+'</div>'+
      '<div class="gname">'+esc(c.titre)+'</div>'+
      '<div class="graison">'+esc(raisonDe(c, (ui.guide||{}).recette))+'</div>'+
    '</button>'+
    (cleEnvie() ? '<button class="gnon" title="Pas pour cette envie" '+
      'aria-label="Pas pour cette envie" onclick="pasPourCa('+c.id+')">'+I.close+'</button>' : '')+
  '</div>';
}

/* Une phrase qui dit exactement ce qu'on cherche, et surtout ce qu'on ne
   trouvera pas. Rien n'agace plus qu'un guide dont on ignore la portée. */
function portee(){
  /* 3008h : trois cas, et non plus deux — j'ai des abonnements, je n'en ai
     aucun (choix assumé), je n'ai pas encore répondu. */
  if(platsDits())
    return platsProfil().length
      ? 'Uniquement ce que tu peux lancer ce soir : ta bibliothèque, et tes abonnements.'
      : 'Uniquement ta bibliothèque Cinéflix — tu n\'as coché aucun abonnement.';
  return 'Uniquement ce que tu peux lancer ce soir : ta bibliothèque, plus toutes les '+
    'plateformes — coche tes abonnements dans « Mes goûts » pour resserrer.';
}

function viewGuide(){
  const g = ui.guide || (ui.guide = { txt:'', res:[], vus:{} });
  assurerGuide();
  if(g.ecran === 'cat') return viewCategories();

  /* UN SEUL ÉCRAN, sans cas particulier. Les grandes tuiles sont toujours là
     — on répond d'un geste au lieu de lire trente étiquettes ; la catégorie
     s'ouvre sous elles à la demande ; les propositions se rangent en dessous.
     Et on ne tombe jamais sur un écran vide, puisque la dernière humeur est
     rejouée à l'arrivée.

     Toujours pas de champ libre : il promettait de comprendre une phrase et
     ne faisait que chercher des mots — « un film d'action simple et détendu »
     rendait Casino Royale. Dix envies, vingt genres et quarante-trois rayons
     disent exactement ce qu'ils font. Moins flatteur, bien plus honnête. */
  let h = header('Guide-moi', {back:'goBack()'});

  h += '<div class="gquestion">Ce soir, tu as envie de quoi ?</div>';
  h += '<div class="envies">'+
    HUMEURS.map(x=>'<button class="envie'+
      (g.recette && g.recette.titre === x.label ? ' on' : '')+
      '" onclick="guiderHumeur(\''+x.id+'\')">'+
      '<s>'+x.emo+'</s>'+esc(x.label)+'</button>').join('')+
    (aGouts() ? '<button class="envie'+(g.source === 'gouts' ? ' on' : '')+
      '" onclick="guiderHumeur(\'gouts\')"><s>✨</s>Selon mes goûts</button>' : '')+
  '</div>';

  /* L'autre porte : le rangement plutôt que l'envie. Elle mène à un écran. */
  h += '<div class="wrap"><button class="btn ghost block" onclick="ouvrirCategories()">'+
    'Ou entrer par catégorie</button></div>';


  if(g.loading)
    return h + '<div class="empty"><span class="spin"></span>'+
      '<p style="margin-top:12px">Je cherche…</p></div>';

  if(g.err)
    return h + '<div class="empty">'+I.boussole+'<h3>Rien à proposer</h3>'+
      '<p>'+esc(g.err)+'</p></div>';

  /* Rien encore demandé : les tuiles occupent déjà l'écran, un bloc « choisis
     une entrée » ne ferait que répéter ce qu'elles disent. Une ligne suffit
     pour dire OÙ on cherchera. */
  if(!g.charge)
    return h + '<div class="wrap tiny muted" style="padding-bottom:26px">'+
      esc(portee())+'</div>';

  if(!g.res.length)
    return h + '<div class="empty">'+I.boussole+'<h3>Rien trouvé</h3>'+
      '<p>Essaie une autre humeur, ou une catégorie voisine.</p></div>';

  const r = g.recette || {};
  h += '<div class="sectitle">'+esc(r.titre || 'Pour toi')+
    (r.dits && r.dits.length ? '<span class="cnt">'+esc(r.dits.join(' · '))+'</span>' : '')+
    '</div>';
  /* Les films écartés par un verdict ne réapparaissent pas — y compris
     après « Autre chose », qui relance la recherche. */
  const vus = g.res.filter(c => !rejete(c.id));
  h += '<div class="grid">'+vus.map(carteGuide).join('')+'</div>';
  if(rejetes().length)
    h += '<div class="wrap tiny muted center">'+rejetes().length+
      ' écarté(s) de cette envie · <button class="lienplat" '+
      'onclick="rendreLesEcartes()">tout remettre</button></div>';
  h += '<div class="wrap"><button class="btn ghost block" onclick="guiderEncore()">'+
    'Autre chose</button></div>';
  return h + '<div class="wrap tiny muted center" style="padding-bottom:26px">'+
    esc(portee())+'</div>';
}
