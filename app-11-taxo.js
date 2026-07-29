"use strict";
/* ======================== La taxonomie : 20 genres, 43 sous-catégories ========
   Le document de référence range les films ; les humeurs disent l'envie du
   moment. Les deux entrent dans le même moteur, mais par des portes
   différentes — et celle-ci a une contrainte que l'autre n'a pas.

   POURQUOI DES RÈGLES ET NON DES ÉTIQUETTES.
   Étiqueter film par film ne couvrirait que les 2 270 fiches du NAS. Or ce
   guide travaille sur trois périmètres : Cinéflix, les plateformes, et tout
   le cinéma. Sur les deux derniers, on interroge TMDB en direct — aucune
   étiquette maison n'existe sur ces titres-là. Une sous-catégorie est donc
   écrite comme une RECETTE (genres, mots-clés, pays, durée, note), qui
   s'applique aussi bien à une fiche locale qu'à une requête /discover.

   CE QUE CHAQUE RÈGLE A COÛTÉ.
   Les identifiants de mots-clés ont été résolus contre /search/keyword, puis
   chacun a été MESURÉ : combien de films chez toi le portent, combien sur
   TMDB. Plusieurs concepts du document se sont révélés inexploitables tels
   quels — « black comedy » (0 film chez toi), « old west » (0), « costume
   drama » (0), « tragic love » (0), « french resistance » (2). Quand le
   mot-clé n'existe pas dans les faits, la règle passe par un substitut
   observable : croisement de genres, durée, année, note des critiques. Ces
   substituts sont signalés un par un ci-dessous — ce sont eux qu'il faudra
   corriger en premier après l'étalonnage.                                  */

/* Genres TMDB, pour la lisibilité des règles. */
const G_ACTION=28, G_AVENT=12, G_ANIM=16, G_COM=35, G_CRIME=80, G_DOC=99,
      G_DRAME=18, G_FAM=10751, G_FANT=14, G_HIST=36, G_HORR=27, G_MUS=10402,
      G_MYST=9648, G_ROM=10749, G_SF=878, G_THRIL=53, G_GUERRE=10752, G_WEST=37;

/* ---------- La table ----------
   g     : genres TOUS obligatoires        gUn : au moins un de ceux-ci
   sans  : aucun de ceux-ci                mc  : au moins un mot-clé
   sansMc: aucun de ces mots-clés          loc : n'existe que sur Cinéflix   */
const TAXO = [

{ id:'action', nom:'Action', emo:'🎬', g:[G_ACTION], sans:[G_ANIM], sous:[
  /* SUBSTITUT ASSUMÉ — « décomplexée » contre « d'auteur » est un jugement de
     valeur, pas un fait observable. On l'approche par la note des critiques et
     le nombre de votes : c'est discutable, c'est testable, c'est corrigible. */
  { id:'action-decomplexee', nom:'Action décomplexée',
    g:[G_ACTION], sans:[G_ANIM,G_DOC], noteMax:6.6, votes:150 },
  { id:'action-auteur', nom:'Action d\'auteur',
    g:[G_ACTION], sans:[G_ANIM], note:7.2, votes:1000 },
  { id:'testosterone', nom:'Testostérone',
    g:[G_ACTION], mc:[779,1462,13116,188955,15248,12371] },
  { id:'militaire', nom:'Militaire',
    gUn:[G_ACTION,G_THRIL,G_GUERRE], mc:[162365,15218,11219,379459,3541,15087,339,13015] }
]},

{ id:'animation', nom:'Animation', emo:'🎨', g:[G_ANIM], sous:[
  { id:'animation-enfants', nom:'Animation pour les enfants',
    g:[G_ANIM], gUn:[G_FAM,G_COM,G_AVENT], sans:[G_HORR,G_THRIL,G_CRIME], duree:110 },
  /* Le document segmente par public, pas par technique : « ados » se lit ici
     comme « animation qui n'est pas estampillée Familial ». */
  { id:'animation-ados', nom:'Animation pour les ados',
    g:[G_ANIM], sans:[G_FAM] }
]},

{ id:'aventure', nom:'Aventure', emo:'🧭', g:[G_AVENT], sous:[
  /* Le mot-clé « epic » n'est posé sur aucun de tes films : la durée et la
     notoriété font un meilleur juge du souffle romanesque. */
  { id:'aventure-epique', nom:'Grande aventure épique',
    g:[G_AVENT], sans:[G_ANIM], dureeMin:125, votes:400 },
  { id:'survie-milieu-hostile', nom:'Survie en milieu hostile',
    gUn:[G_AVENT,G_DRAME,G_THRIL,G_ACTION], mc:[10349,3593,2580,8624,50009] },
  { id:'voyage-depaysement', nom:'Voyage et dépaysement',
    gUn:[G_AVENT,G_DRAME,G_DOC,G_COM], mc:[7312,167043,4759,1900] },
  { id:'aventure-famille', nom:'Aventure à voir en famille',
    g:[G_AVENT,G_FAM], sans:[G_HORR,G_CRIME] }
]},

{ id:'comedie', nom:'Comédie', emo:'😄', g:[G_COM], sous:[
  { id:'comedie-francaise', nom:'Comédie française', g:[G_COM], pays:'FR' },
  { id:'comedie-americaine', nom:'Comédie américaine', g:[G_COM], pays:'US' },
  /* SUBSTITUT ASSUMÉ — « black comedy » n'étiquette aucun de tes films. Le
     croisement comédie + (crime ou thriller ou horreur) attrape Fargo,
     Parasite, La Mort de Staline, In Bruges. */
  { id:'comedie-noire', nom:'Comédie noire, grinçante',
    g:[G_COM], gUn:[G_CRIME,G_THRIL,G_HORR], sans:[G_FAM,G_ANIM], note:6.2 },
  { id:'parodie', nom:'Parodie', g:[G_COM], mc:[9755,11931,364753] }
]},

/* Concert et Théâtre viennent de Jellyfin, pas de TMDB : hors Cinéflix, on
   fait ce qu'on peut avec le genre Musique. L'écran le dit. */
{ id:'concert', nom:'Concert', emo:'🎤', locNoms:['concert'],
  g:[G_MUS], mc:[6029,318206], sous:[] },

{ id:'crime', nom:'Crime', emo:'🔫', g:[G_CRIME], sous:[
  { id:'mafia-gangsters', nom:'Mafia et gangsters',
    gUn:[G_CRIME,G_DRAME], mc:[10391,10291,3149] },
  { id:'casse-braquage', nom:'Casse et braquage',
    gUn:[G_CRIME,G_THRIL,G_ACTION], mc:[10051,642,15363] },
  /* SUBSTITUT ASSUMÉ — « très noir » est une affaire de ton. Faute de
     mot-clé fiable, on prend : crime, sans comédie ni familial, bien noté. */
  { id:'tres-noir', nom:'Très noir',
    g:[G_CRIME], sans:[G_COM,G_FAM,G_ANIM], note:7.4, votes:600 },
  { id:'affaires-reelles', nom:'Affaires réelles',
    g:[G_CRIME], mc:[9672,5565] }
]},

{ id:'documentaire', nom:'Documentaire', emo:'🎥', g:[G_DOC], sous:[] },

/* Le plus gros rayon de ta bibliothèque — 516 films en genre principal — et
   le seul que le document laisse sans découpage. On le prend tel quel, en
   écartant ce qui relève d'un autre registre. */
{ id:'drame', nom:'Drame', emo:'🎭',
  g:[G_DRAME], sans:[G_HORR,G_ACTION,G_GUERRE,G_ANIM], sous:[] },

{ id:'familial', nom:'Familial', emo:'👨‍👩‍👧', g:[G_FAM], sous:[] },

{ id:'fantastique', nom:'Fantastique', emo:'🧙', g:[G_FANT], sous:[
  { id:'heroic-fantasy', nom:'Heroic fantasy',
    g:[G_FANT], mc:[234213,12554,161257,1938,207372] },
  { id:'magie-sorcellerie', nom:'Magie et sorcellerie',
    gUn:[G_FANT,G_FAM,G_AVENT], mc:[2343,616] },
  { id:'conte-merveilleux', nom:'Conte et merveilleux',
    gUn:[G_FANT,G_FAM,G_DRAME,G_ANIM], mc:[3205] },
  { id:'surnaturel-fantomes', nom:'Surnaturel et fantômes',
    gUn:[G_FANT,G_MYST,G_HORR,G_DRAME], mc:[162846,6152,10224,3358,156580] }
]},

{ id:'guerre', nom:'Guerre', emo:'⚔️', g:[G_GUERRE], sous:[
  { id:'reconstitution', nom:'Reconstitution',
    g:[G_GUERRE], mc:[1956,2504,2652] },
  /* L'année de SORTIE n'est pas l'époque du récit : 300 est sorti en 2006 et
     se passe en 480 av. J.-C. C'est le conflit qui décide, pas la date. */
  { id:'guerre-moderne', nom:'Guerre moderne',
    g:[G_GUERRE], apres:1990, mc:[15087,3541,13015,15218,11219,379459], sansMc:[1956,2504] },
  /* SUBSTITUT ASSUMÉ — « french resistance » n'étiquette que 2 de tes films.
     On élargit à l'occupation et au nazisme, et on écarte l'action pure pour
     rester du côté de l'ombre. */
  { id:'resistance-occupation', nom:'Résistance et occupation',
    gUn:[G_GUERRE,G_DRAME,G_HIST], mc:[9904,357283,2652,1956], sans:[G_ACTION] }
]},

{ id:'histoire', nom:'Histoire', emo:'🏛️', g:[G_HIST], sous:[
  /* Première version : « long + connu + genre Histoire ». Testée, jetée —
     elle remontait First Man et Raging Bull, longs et connus mais pas des
     fresques, et elle RATAIT Gladiator, que TMDB ne range pas en Histoire.
     La bonne clé n'est pas la durée, c'est l'ÉPOQUE : Rome, la Grèce, la
     chevalerie, la Bible, les pharaons. Treize mots-clés, 34 films chez toi
     (300, Ben-Hur, Braveheart, Gladiator, Exodus), 123 sur TMDB. */
  { id:'fresque-peplum', nom:'Fresque et péplum',
    gUn:[G_HIST,G_AVENT,G_GUERRE,G_DRAME], sans:[G_ANIM,G_SF,G_HORR],
    mc:[5049,1394,161257,12965,1405,162861,3036,10466,186939,11195,303295,272026,1462] },
  { id:'biopic', nom:'Biopic',
    gUn:[G_HIST,G_DRAME,G_MUS], mc:[5565] },
  /* L'événement prime sur la personne : on demande « histoire vraie » ET
     l'absence de « biographie », c'est exactement la distinction du document. */
  { id:'histoire-vraie', nom:'Histoire vraie',
    gUn:[G_HIST,G_DRAME,G_CRIME,G_THRIL], sans:[G_FANT,G_ANIM,G_SF], mc:[9672], sansMc:[5565] },
  { id:'film-costumes', nom:'Film en costumes',
    gUn:[G_HIST,G_DRAME,G_ROM], sans:[G_GUERRE,G_ANIM], mc:[15060,195013] }
]},

{ id:'horreur', nom:'Horreur', emo:'🎃', g:[G_HORR], sous:[] },

{ id:'musique', nom:'Musique', emo:'🎵', g:[G_MUS], sous:[
  { id:'comedie-musicale', nom:'Comédie musicale', g:[G_MUS], mc:[4344] },
  { id:'biopic-musical', nom:'Biopic musical', g:[G_MUS], mc:[5565,10229] },
  /* Ni biopic, ni comédie musicale, ni captation : de la fiction sur la
     pratique. C'est la case de Whiplash. */
  { id:'musiciens-au-travail', nom:'Musiciens au travail',
    g:[G_MUS], sans:[G_DOC], sansMc:[5565,4344,6029,318206] }
]},

{ id:'mystere', nom:'Mystère', emo:'🔍', g:[G_MYST], sous:[] },

{ id:'romance', nom:'Romance', emo:'❤️', g:[G_ROM], sous:[
  /* AVERTISSEMENT — ces deux sous-catégories DISENT LA FIN. Elles sont ici
     parce qu'elles sont dans le document, et parce qu'elles sont utiles comme
     filtre. Si tu ne veux pas les voir à l'écran, elles se retirent en une
     ligne (les ôter de `sous` suffit, les règles restent). Aucun mot-clé ne
     dit l'issue d'une histoire d'amour : le substitut est la gravité. */
  { id:'romance-finit-bien', nom:'Romance qui finit bien',
    g:[G_ROM], sans:[G_HORR,G_THRIL,G_CRIME,G_GUERRE], note:6.4 },
  { id:'romance-finit-mal', nom:'Romance qui finit mal',
    g:[G_ROM,G_DRAME], sans:[G_COM], note:7.1 },
  { id:'comedie-romantique', nom:'Comédie romantique', g:[G_ROM,G_COM] }
]},

{ id:'science-fiction', nom:'Science-fiction', emo:'🚀', g:[G_SF], sous:[
  { id:'sf-spectacle', nom:'Science-fiction spectacle',
    g:[G_SF,G_ACTION], votes:800 },
  { id:'sf-cerebrale', nom:'Science-fiction cérébrale',
    g:[G_SF], sans:[G_ACTION,G_HORR], note:6.7 }
]},

{ id:'theatre', nom:'Théâtre', emo:'🎙️', locNoms:['theatre'],
  mc:[284103,9716], sous:[] },

{ id:'thriller', nom:'Thriller', emo:'😬', g:[G_THRIL], sous:[
  { id:'thriller-haletant', nom:'Thriller haletant',
    g:[G_THRIL], sans:[G_ANIM], mc:[3713,226499,9844,1930] },
  { id:'thriller-psychologique', nom:'Thriller psychologique',
    gUn:[G_THRIL,G_MYST,G_DRAME], mc:[12565] },
  { id:'thriller-politique', nom:'Thriller politique',
    gUn:[G_THRIL,G_DRAME], mc:[10410,6078] },
  /* « undercover » a été retiré : il faisait entrer 2 Fast 2 Furious, où le
     héros est un flic infiltré et non un agent de renseignement. */
  { id:'espionnage', nom:'Espionnage',
    gUn:[G_THRIL,G_ACTION,G_MYST], mc:[470,5265] }
]},

{ id:'western', nom:'Western', emo:'🤠', g:[G_WEST], sous:[
  /* SUBSTITUT ASSUMÉ — « old west » et « wild west » n'étiquettent aucun de
     tes westerns. Le partage se fait sur l'ÉPOQUE DU RÉCIT, approchée par le
     croisement avec le crime contemporain : un western qui porte aussi Crime
     ou Thriller et sort après 1990 est un néo-western (Comancheria, No
     Country, Wind River) ; les autres restent classiques. */
  { id:'western-classique', nom:'Western classique',
    g:[G_WEST], sans:[G_SF] },
  { id:'neo-western', nom:'Néo-western',
    g:[G_WEST], gUn:[G_CRIME,G_THRIL,G_DRAME], apres:1990 }
]}
];

/* Index plat : sous-catégorie → { genre, sous }. Sert au banc d'essai et à la
   page d'étalonnage, qui parlent en identifiants. */
const TAXO_PLAT = (()=>{
  const m = {};
  TAXO.forEach(g=>{
    m[g.id] = { genre:g, sous:null };
    (g.sous||[]).forEach(s => { m[s.id] = { genre:g, sous:s }; });
  });
  return m;
})();

/* ---------- De la règle à la recette ----------
   Chaque règle est AUTONOME : une sous-catégorie n'hérite PAS du genre qui la
   contient. C'est délibéré. « Militaire » vit sous Action dans le document,
   mais Zero Dark Thirty porte Drame/Thriller/Histoire et Le Chant du loup
   Thriller — hériter du genre Action les ferait disparaître tous les deux.
   Le rangement est une chose, le critère de recherche en est une autre. */
function taxoRecette(id){
  const e = TAXO_PLAT[id];
  if(!e) return null;
  const src = e.sous || e.genre;
  const r = recetteVide();
  ['g','gUn','sans','mc','sansMc','locNoms'].forEach(k=>{
    (src[k]||[]).forEach(v => { if(r[k].indexOf(v) < 0) r[k].push(v); });
  });
  ['note','noteMax','votes','duree','dureeMin','apres','avant','pays'].forEach(k=>{
    if(src[k]) r[k] = src[k];
  });
  r.taxo = id;
  r.titre = e.sous ? e.sous.nom : e.genre.nom;
  if(e.sous) r.dits = [e.genre.nom];
  return r;
}

/* ---------- L'écran ---------- */
function taxoGenreOuvert(){ return (ui.guide||{}).taxoG || ''; }

function setTaxoGenre(gid){
  const g = ui.guide;
  if(g.taxoG === gid){ g.taxoG = ''; return render(); }
  g.taxoG = gid;
  const e = TAXO.find(x => x.id === gid);
  /* Un genre sans sous-catégorie se lance directement : rien à choisir. */
  if(e && !(e.sous||[]).length) return guiderTaxo(gid);
  render();
}

function guiderTaxo(id){
  ui.guide.txt = '';
  ui.guide.taxoSel = id;
  guider('taxo:'+id, '');
}

function viewTaxoChips(){
  const g = ui.guide || {};
  const ouvert = taxoGenreOuvert();
  let h = '<div class="wrap" style="padding-top:2px">'+
    '<div class="tiny muted" style="margin-bottom:6px">Ou range-toi par catégorie</div>'+
    '<div class="gchips">'+
    TAXO.map(x=>{
      const on = (ouvert === x.id) || (g.taxoSel && TAXO_PLAT[g.taxoSel] &&
                 TAXO_PLAT[g.taxoSel].genre.id === x.id);
      return '<button class="chip humeur'+(on?' on':'')+'" onclick="setTaxoGenre(\''+x.id+'\')">'+
        x.emo+' '+esc(x.nom)+((x.sous||[]).length?' ›':'')+'</button>';
    }).join('')+
    '</div>';

  const e = TAXO.find(x => x.id === ouvert);
  if(e && (e.sous||[]).length){
    h += '<div class="souschips" style="margin-top:8px">'+
      e.sous.map(s=>'<button class="chip'+(g.taxoSel === s.id ? ' on':'')+
        '" onclick="guiderTaxo(\''+s.id+'\')">'+esc(s.nom)+'</button>').join('')+
      '<button class="chip" onclick="guiderTaxo(\''+e.id+'\')">Tout le genre</button>'+
    '</div>';
  }
  /* Deux genres ne viennent pas de TMDB mais de Jellyfin : hors du serveur,
     on ne peut pas les chercher honnêtement. On le dit plutôt que de rendre
     une page vide. */
  if(e && (e.locNoms||[]).length && perimGuide() !== 'flix')
    h += '<div class="tiny muted" style="margin-top:6px">'+
         esc(e.nom)+' est un genre de ton serveur : hors Cinéflix, '+
         'les résultats seront approximatifs.</div>';
  return h + '</div>';
}
