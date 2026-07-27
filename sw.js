/* Service worker — démarrage instantané et fonctionnement hors-ligne.
   Réseau d'abord sur les fichiers de l'app (pour recevoir les mises à jour),
   repli sur le cache quand le réseau manque. Les appels TMDB ne sont jamais
   mis en cache, et le catalogue Cinéflix non plus : une liste périmée
   afficherait « déjà sur le serveur » pour un titre qui n'y est plus. */
const CACHE = 'cineflix-v1';
const SHELL = ['./', './index.html', './app.css', './manifest.json', './config.js',
               './app-01-noyau.js', './app-02-outils.js', './app-03-decouvrir.js',
               './app-04-sorties.js', './app-05-fiche.js', './app-06-maliste.js',
               './app-07-profil.js', './app-08-compte.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      /* Pas de .catch() : si un fichier manque, l'installation doit échouer
         pour que l'ancienne version reste utilisable hors-ligne. */
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== location.origin) return;          // TMDB et images : réseau direct
  if(url.pathname.endsWith('cineflix.json')) return;  // catalogue : toujours frais

  e.respondWith(
    fetch(req)
      .then(res => {
        /* On ne met en cache qu'une vraie réponse : une page 404 gardée en
           secours rendrait l'app inutilisable hors-ligne. */
        if(res && res.ok && res.type === 'basic'){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        }
        return res;
      })
      .catch(() => caches.match(req).then(m => m || caches.match('./index.html')))
  );
});

self.addEventListener('message', e => { if(e.data === 'skipWaiting') self.skipWaiting(); });
