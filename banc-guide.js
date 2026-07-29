"use strict";
/* ============================ Banc d'essai du guide ============================
   À coller dans la console de l'app (Cinéflix ouvert et catalogue chargé), ou
   à charger avec :  fetch('banc-guide.js').then(r=>r.text()).then(eval)
   puis :  banc()   — le tableau détaillé
           bancResume()   — le résumé chiffré, pour comparer deux versions

   MESURE DE RÉFÉRENCE (29/07, v2807t, bibliothèque de 2 270 films) :
     14/30 comprises · 43 % de pertinence globale · 92 % sur les comprises.
   Autrement dit : le classement fait son travail, tout le déficit était dans
   la compréhension. C'est ce chiffre-là qu'il faut faire monter.

   POURQUOI CE FICHIER EXISTE
   La suite Playwright vérifie des MÉCANISMES : le pays filtre-t-il, la saga
   est-elle dédoublonnée. Elle ne dit rien de la PERTINENCE — la version 2807r
   était entièrement verte tout en répondant « Toy Story » à « film français
   drôle ». Ce banc mesure l'autre moitié : sur de vraies requêtes, avec la
   vraie bibliothèque, est-ce que ce qui remonte a du sens ?

   Il ne fait AUCUN appel réseau : il s'arrête au classement, qui est
   précisément ce qu'on cherche à juger. */

const BANC = [
  /* --- ce qui marche déjà : garde-fous anti-régression --- */
  { q:'film français drôle', att:{ compris:1, pays:'FR', genres:[35], sans:[16], neuf:1 } },
  { q:'j’ai envie de rire sans me prendre la tête', att:{ compris:1, genres:[35], sans:[16] } },
  { q:'un film d’action sans se poser de questions', att:{ compris:1, genres:[28,12] } },
  { q:'un truc pour les enfants', att:{ compris:1, genres:[16,10751,12], certMax:10 } },
  { q:'quelque chose qui fait pleurer', att:{ compris:1, genres:[18,10749] } },
  { q:'un bon thriller', att:{ compris:1, genres:[53,80,9648] } },
  { q:'un documentaire', att:{ compris:1, genres:[99,12,36] } },
  { q:'une valeur sûre, je veux pas me tromper', att:{ compris:1, noteMin:7.2 } },

  /* --- les manques mesurés le 29/07 : c'est la cible --- */
  { q:'quelque chose de léger, pas d’horreur', att:{ compris:1, genres:[35], sans:[27] } },
  { q:'un film sans violence', att:{ compris:1, sans:[27,53,10752] } },
  { q:'un thriller de moins de 1h30', att:{ compris:1, genres:[53,80,9648], dureeMax:95 } },
  { q:'une comédie de 90 minutes maxi', att:{ compris:1, genres:[35], dureeMax:100 } },
  { q:'un film des années 90', att:{ compris:1, anneeMin:1990, anneeMax:1999 } },
  { q:'un film des années 80', att:{ compris:1, anneeMin:1980, anneeMax:1989 } },
  { q:'un film sorti après 2020', att:{ compris:1, anneeMin:2020 } },
  { q:'un film coréen', att:{ compris:1, pays:'KR' } },
  { q:'un film japonais', att:{ compris:1, pays:'JP' } },
  { q:'du cinéma italien', att:{ compris:1, pays:'IT' } },
  { q:'un film britannique', att:{ compris:1, pays:'GB' } },
  { q:'un film de braquage', att:{ compris:1, motscle:['heist','robbery'] } },
  { q:'un huis clos', att:{ compris:1, motscle:['one night','single location','kidnapping'] } },
  { q:'un road movie', att:{ compris:1, motscle:['road trip','road movie'] } },
  { q:'une histoire vraie', att:{ compris:1, motscle:['based on true story','biography'] } },
  { q:'un film de vengeance', att:{ compris:1, motscle:['revenge'] } },
  { q:'un film post-apocalyptique', att:{ compris:1, motscle:['post-apocalyptic','dystopia'] } },
  { q:'un film avec Dujardin', att:{ compris:1, personne:'Dujardin' } },
  { q:'du Tarantino', att:{ compris:1, personne:'Tarantino' } },
  { q:'comme Le Grand Bleu mais plus récent', att:{ compris:1, refTitre:'Le Grand Bleu', anneeMin:2000 } },
  { q:'dans le genre d’Intouchables', att:{ compris:1, refTitre:'Intouchables' } },
  { q:'une série à binger', att:{ compris:1, type:'tv' } }
];

/* ---------- Mesure d'une requête ---------- */
function _bancUne(cas){
  const r = (typeof lireHumeur === 'function') ? lireHumeur(cas.q) : null;
  const a = cas.att, notes = [];
  const note = (nom, val) => notes.push({nom, val});

  if(a.compris) note('compris', r ? 1 : 0);
  if(!r) return { q:cas.q, compris:0, score:0, notes, res:[] };

  /* On reproduit la chaîne réelle, mais SANS réseau : bibliothèque, score,
     sélection. C'est là que se joue la pertinence. */
  let liste = vivierCineflix(r, false);
  if(liste.length < 12) liste = vivierCineflix(r, true);
  liste.forEach(c => { c._s = scorerCandidat(c, r); });
  const res = choisirSuggestions(liste, 20);

  const part = f => res.length ? res.filter(f).length / res.length : 0;

  if(a.pays)     note('pays '+a.pays,      part(c => (c.pays||[]).indexOf(a.pays) >= 0));
  if(a.genres)   note('genre attendu',     part(c => a.genres.some(g => c.genres.indexOf(g) >= 0)));
  if(a.sans)     note('genre exclu',       part(c => !a.sans.some(g => c.genres.indexOf(g) >= 0)));
  if(a.neuf)     note('jamais lancé',      part(c => !c.vu));
  if(a.noteMin)  note('note ≥ '+a.noteMin, part(c => (c.note||0) >= a.noteMin));
  if(a.dureeMax) note('durée ≤ '+a.dureeMax, part(c => !c.duree || c.duree <= a.dureeMax));
  if(a.anneeMin) note('après '+a.anneeMin, part(c => (c.annee||0) >= a.anneeMin));
  if(a.anneeMax) note('avant '+a.anneeMax, part(c => (c.annee||9999) <= a.anneeMax));
  if(a.certMax && typeof rangCert === 'function')
    note('tous publics', part(c => { const g = rangCert(c.cert); return g == null || g <= a.certMax; }));
  if(a.type)     note('type '+a.type,      part(c => c.type === a.type));
  /* Les trois suivantes ne peuvent pas encore être satisfaites : elles
     mesurent le chemin qui reste, pas une régression. */
  if(a.motscle)  note('sujet (mots-clés)', 0);
  if(a.personne) note('personne citée',    0);
  if(a.refTitre) note('titre de référence', 0);

  const score = notes.length ? notes.reduce((s,n)=>s+n.val,0) / notes.length : 0;
  return { q:cas.q, compris:1, score, notes, res };
}

/* ---------- Le banc entier ---------- */
function banc(detail){
  if(!CAT.charge || !CAT.items.length){
    console.log('Catalogue non chargé — ouvre l’app et réessaie.');
    return null;
  }
  const lignes = BANC.map(_bancUne);
  const moy = l => Math.round(l.reduce((s,x)=>s+x.score,0) / l.length * 100);
  const compris = lignes.filter(l => l.compris).length;

  console.log('%c BANC DU GUIDE — '+lignes.length+' requêtes ', 'background:#3b82f6;color:#fff');
  console.log('Comprises  : '+compris+'/'+lignes.length);
  console.log('Pertinence : '+moy(lignes)+'%   (sur les comprises : '+
              moy(lignes.filter(l=>l.compris))+'%)');
  console.table(lignes.map(l => ({
    requête: l.q,
    compris: l.compris ? '✓' : '—',
    score: Math.round(l.score*100)+'%',
    faiblesse: (l.notes.filter(n=>n.val < 0.6).map(n=>n.nom).join(', ') || '—'),
    tête: (l.res[0]||{}).titre || ''
  })));
  if(detail) lignes.forEach(l => console.log(l.q, l.res.map(c=>c.titre)));
  return { total: lignes.length, compris, pertinence: moy(lignes), lignes };
}

/* Résumé compact, pour comparer deux versions d'un coup d'œil. */
function bancResume(){
  const b = banc();
  if(!b) return null;
  return JSON.stringify({
    comprises: b.compris+'/'+b.total,
    pertinence: b.pertinence+'%',
    echecs: b.lignes.filter(l => l.score < 0.6)
      .map(l => l.q+' → '+(l.notes.filter(n=>n.val<0.6).map(n=>n.nom).join(', ')||'incomprise'))
  }, null, 1);
}
