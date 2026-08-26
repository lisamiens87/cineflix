"use strict";
/* ====================== La citation d'ouverture (3008w) ======================
   Demande d'Alexandre, le 20/08 : « lorsque l'app s'ouvre, disons quand elle
   n'a pas été utilisée au bout d'une heure, elle donne sur écran noir entre le
   logo et la home page une citation d'un film, tirée au hasard dans une large
   liste ».

   Deux moments déclenchent l'écran, et il faut les DEUX : le démarrage à
   froid, et le retour d'arrière-plan. Une app posée sur l'écran d'accueil
   d'un iPhone ne redémarre pas quand on y revient — la page reste vivante
   des heures. S'en tenir au démarrage aurait donc laissé la citation muette
   précisément chez ceux qui ont installé l'app.

   Les répliques sont courtes et attribuées. Elles ne dépendent d'aucun
   réseau : la liste est dans le fichier, l'écran s'affiche même hors ligne. */

const CIT_REPOS = 3600000;   /* une heure sans toucher à l'app */
const CIT_DUREE = 2500;      /* le temps de lire une phrase courte */

const CITATIONS = [
  { t:"T'as de beaux yeux, tu sais.", f:"Le Quai des brumes", a:1938 },
  { t:"Bizarre, vous avez dit bizarre ?", f:"Drôle de drame", a:1937 },
  { t:"Atmosphère, atmosphère…", f:"Hôtel du Nord", a:1938 },
  { t:"Les cons, ça ose tout. C'est même à ça qu'on les reconnaît.", f:"Les Tontons flingueurs", a:1963 },
  { t:"Un con qui marche va plus loin qu'un intellectuel assis.", f:"Un taxi pour Tobrouk", a:1961 },
  { t:"Jusqu'ici tout va bien.", f:"La Haine", a:1995 },
  { t:"L'important, c'est pas la chute. C'est l'atterrissage.", f:"La Haine", a:1995 },
  { t:"J'ai glissé, chef !", f:"Les Bronzés font du ski", a:1979 },
  { t:"On n'est pas là pour souffrir, d'accord ?", f:"Les Bronzés font du ski", a:1979 },
  { t:"Pas de bras, pas de chocolat.", f:"Intouchables", a:2011 },
  { t:"Ils sont fous, ces Romains !", f:"Astérix et Obélix contre César", a:1999 },
  { t:"Je crois que c'est le début d'une belle amitié.", f:"Casablanca", a:1942 },
  { t:"Nous aurons toujours Paris.", f:"Casablanca", a:1942 },
  { t:"Je vais lui faire une offre qu'il ne pourra pas refuser.", f:"Le Parrain", a:1972 },
  { t:"Que la Force soit avec toi.", f:"Star Wars", a:1977 },
  { t:"Je suis ton père.", f:"L'Empire contre-attaque", a:1980 },
  { t:"E.T. téléphone maison.", f:"E.T. l'extra-terrestre", a:1982 },
  { t:"Houston, on a un problème.", f:"Apollo 13", a:1995 },
  { t:"Vers l'infini et au-delà !", f:"Toy Story", a:1995 },
  { t:"Hakuna matata.", f:"Le Roi lion", a:1994 },
  { t:"Mon précieux.", f:"Le Seigneur des anneaux", a:2002 },
  { t:"Vous ne passerez pas !", f:"La Communauté de l'anneau", a:2001 },
  { t:"Je reviendrai.", f:"Terminator", a:1984 },
  { t:"Bond. James Bond.", f:"James Bond 007 contre Dr No", a:1962 },
  { t:"Rosebud.", f:"Citizen Kane", a:1941 },
  { t:"Après tout, demain est un autre jour.", f:"Autant en emporte le vent", a:1939 },
  { t:"J'aime l'odeur du napalm au petit matin.", f:"Apocalypse Now", a:1979 },
  { t:"C'est à moi que tu parles ?", f:"Taxi Driver", a:1976 },
  { t:"Toto, j'ai l'impression qu'on n'est plus au Kansas.", f:"Le Magicien d'Oz", a:1939 },
  { t:"Rien ne vaut son chez-soi.", f:"Le Magicien d'Oz", a:1939 },
  { t:"Carpe diem. Cueillez le jour.", f:"Le Cercle des poètes disparus", a:1989 },
  { t:"Ô Capitaine ! Mon Capitaine !", f:"Le Cercle des poètes disparus", a:1989 },
  { t:"La vie, c'est comme une boîte de chocolats.", f:"Forrest Gump", a:1994 },
  { t:"La première règle : ne pas parler du Fight Club.", f:"Fight Club", a:1999 },
  { t:"Je vois des gens qui sont morts.", f:"Sixième Sens", a:1999 },
  { t:"L'espoir est une bonne chose, peut-être la meilleure.", f:"Les Évadés", a:1994 },
  { t:"Il n'y a pas de cuillère.", f:"Matrix", a:1999 },
  { t:"Bienvenue dans le monde réel.", f:"Matrix", a:1999 },
  { t:"Personne n'est parfait.", f:"Certains l'aiment chaud", a:1959 },
  { t:"Je suis le roi du monde !", f:"Titanic", a:1997 },
  { t:"Bienvenue à Jurassic Park.", f:"Jurassic Park", a:1993 },
  { t:"La vie trouve toujours un chemin.", f:"Jurassic Park", a:1993 },
  { t:"Il va nous falloir un plus gros bateau.", f:"Les Dents de la mer", a:1975 },
  { t:"Tu es un sorcier, Harry.", f:"Harry Potter à l'école des sorciers", a:2001 },
  { t:"Je suis Spartacus.", f:"Spartacus", a:1960 },
  { t:"Toute ma vie, j'ai voulu être un gangster.", f:"Les Affranchis", a:1990 },
  { t:"Tous ces moments se perdront, comme des larmes dans la pluie.", f:"Blade Runner", a:1982 },
  { t:"Un grand pouvoir implique de grandes responsabilités.", f:"Spider-Man", a:2002 },
  { t:"Je me vengerai, dans cette vie ou dans l'autre.", f:"Gladiator", a:2000 },
  { t:"Le bonheur n'est réel que lorsqu'il est partagé.", f:"Into the Wild", a:2007 },
  { t:"Chaque homme meurt. Tous ne vivent pas vraiment.", f:"Braveheart", a:1995 },
  { t:"Je suis Groot.", f:"Les Gardiens de la Galaxie", a:2014 },
  { t:"Adrian !", f:"Rocky", a:1976 },
  { t:"Tout ce qui a un commencement a une fin.", f:"Matrix Revolutions", a:2003 }
];

/* Pas deux fois la même d'affilée : sur une liste de cinquante, le hasard pur
   se répète assez souvent pour qu'on le remarque, et une citation répétée
   donne l'impression d'un bug. */
let citDerniere = -1;
function citationAuHasard(){
  if(CITATIONS.length < 2) return CITATIONS[0];
  let i = citDerniere;
  while(i === citDerniere) i = Math.floor(Math.random() * CITATIONS.length);
  citDerniere = i;
  return CITATIONS[i];
}

function citationEnCours(){ return !!document.getElementById('citec'); }

function montrerCitation(){
  if(citationEnCours()) return;
  const c = citationAuHasard();
  if(!c) return;
  const el = document.createElement('div');
  el.id = 'citec';
  el.className = 'citec';
  el.innerHTML =
    '<div class="citmot">'+esc(CFG.nom || 'Premier Rang')+'</div>'+
    '<div class="citin">'+
      '<div class="cittxt"><span class="citg">«</span> '+esc(c.t)+' <span class="citg">»</span></div>'+
      '<div class="citsrc">'+esc(c.f)+' <i>·</i> '+esc(c.a)+'</div>'+
    '</div>'+
    '<div class="citbas">touche l\'écran pour entrer</div>';
  document.body.appendChild(el);
  void el.offsetWidth;                     /* force le calcul, sinon pas de fondu */
  el.classList.add('on');
  let fini = false;
  const fermer = ()=>{
    if(fini) return; fini = true;
    el.classList.remove('on');
    setTimeout(()=>{ if(el.parentNode) el.parentNode.removeChild(el); }, 420);
  };
  el.addEventListener('click', fermer);
  el.addEventListener('touchstart', fermer, {passive:true});
  setTimeout(fermer, CIT_DUREE);
}

/* Le compteur de repos. On note l'heure quand l'app part en arrière-plan et
   quand elle se ferme : la différence au retour dit combien de temps elle est
   restée sans personne. */
function citationNoterVue(){
  try{ db.vuLe = Date.now(); saveDB(); }catch(e){}
}
function citationSiRepos(){
  let repos = true;
  try{ repos = !db.vuLe || (Date.now() - db.vuLe) > CIT_REPOS; }catch(e){}
  citationNoterVue();
  if(repos) montrerCitation();
}

document.addEventListener('visibilitychange', ()=>{
  if(document.hidden) citationNoterVue();
  else citationSiRepos();
});
window.addEventListener('pagehide', citationNoterVue);
