"use strict";
/* ===================== Le cache des données lourdes =====================
   Le 29/08, Supabase a annoncé un dépassement de quota : 5 Go de trafic
   sortant inclus, largement dépassés, alors que la base ne pèse que 32 Mo et
   qu'il y a UN utilisateur actif. Ce n'était donc ni la taille des données ni
   le nombre de gens : c'était le même mégaoctet retéléchargé à chaque
   ouverture de l'app.

   À chaque démarrage, l'app redemandait en effet le catalogue entier
   (2 300 fiches), les 6 700 notes Télérama (sept requêtes de mille lignes) et
   les 210 sorties physiques — même quand le NAS n'avait rien changé depuis
   trois jours. Le service worker n'y pouvait rien : il ne gère que notre
   propre domaine, et Supabase est ailleurs.

   D'où ce fichier. Il ne change RIEN à ce que l'app affiche ; il change
   seulement le moment où elle redemande. Deux règles :

     • le catalogue porte une date de mise à jour. On la demande seule (une
       trentaine d'octets) et on ne recharge le gros paquet que si elle a
       bougé ;
     • les notes et les sorties n'ont pas de date à interroger : on les garde
       une journée, ce qui est déjà généreux pour des tables qui bougent une
       fois par semaine.

   Effet de bord recherché : l'app démarre sur ses données locales, donc plus
   vite, et elle continue de fonctionner quand le réseau manque. */

const CACHE_BASE = 'premier-rang-cache', CACHE_TIROIR = 'donnees';
const CACHE_JOUR = 24 * 3600 * 1000;
/* Filet de sécurité : même si la date de mise à jour n'a pas bougé, on
   refait le plein au bout d'une semaine. Coûte une fois par semaine, et
   couvre le cas où le NAS écrirait le catalogue sans toucher à sa date. */
const CACHE_PLAFOND = 7 * CACHE_JOUR;

/* IndexedDB plutôt que localStorage : un mégaoctet dans localStorage, c'est
   se rapprocher de son plafond (autour de 5 Mo, tout compris) et risquer de
   faire échouer `saveDB()`, qui y range les favoris. En prime, IndexedDB est
   asynchrone : il ne fige pas l'affichage pendant l'écriture. */
function cacheBase(){
  return new Promise((ok, non)=>{
    let d;
    try{ d = indexedDB.open(CACHE_BASE, 1); }catch(e){ return non(e); }
    d.onupgradeneeded = ()=>{
      if(!d.result.objectStoreNames.contains(CACHE_TIROIR))
        d.result.createObjectStore(CACHE_TIROIR);
    };
    d.onsuccess = ()=> ok(d.result);
    d.onerror   = ()=> non(d.error);
  });
}

/* Les trois primitives. Aucune ne doit jamais faire tomber l'app : un
   navigateur en navigation privée, un stockage plein ou refusé rend
   simplement un cache vide, et on repart sur le réseau comme avant. */
async function cacheLire(cle){
  try{
    const b = await cacheBase();
    return await new Promise((ok)=>{
      const r = b.transaction(CACHE_TIROIR, 'readonly')
                 .objectStore(CACHE_TIROIR).get(cle);
      r.onsuccess = ()=> ok(r.result || null);
      r.onerror   = ()=> ok(null);
    });
  }catch(e){ return null; }
}
async function cacheEcrire(cle, valeur){
  try{
    const b = await cacheBase();
    await new Promise((ok)=>{
      const t = b.transaction(CACHE_TIROIR, 'readwrite');
      t.objectStore(CACHE_TIROIR).put(valeur, cle);
      t.oncomplete = ()=> ok(true);
      t.onerror    = ()=> ok(false);
      t.onabort    = ()=> ok(false);
    });
  }catch(e){ /* tant pis : on retéléchargera la prochaine fois */ }
}
async function cacheVider(){
  try{
    const b = await cacheBase();
    await new Promise((ok)=>{
      const t = b.transaction(CACHE_TIROIR, 'readwrite');
      t.objectStore(CACHE_TIROIR).clear();
      t.oncomplete = ()=> ok(true);
      t.onerror    = ()=> ok(false);
    });
  }catch(e){}
}

/* Un cache daté est-il encore bon ? */
const cacheFrais = (garde, duree) =>
  !!(garde && garde.le && (Date.now() - garde.le) < duree);
