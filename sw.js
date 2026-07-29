/* Service worker — démarrage instantané et fonctionnement hors-ligne.
   Réseau d'abord sur les fichiers de l'app (pour recevoir les mises à jour),
   repli sur le cache quand le réseau manque. Les appels TMDB ne sont jamais
   mis en cache, et le catalogue Cinéflix non plus : une liste périmée
   afficherait « déjà sur le serveur » pour un titre qui n'y est plus.

   VERSION : suivre le BUILD d'index.html. Changer les deux ensemble. */
const BUILD = '2907u';
const CACHE = 'cineflix-' + BUILD;
const SHELL = ['./', './index.html', './manifest.json', './icon.svg',
               './app.css', './config.js', './app-01-noyau.js', './app-02-outils.js',
               './app-03-decouvrir.js', './app-04-sorties.js', './app-05-fiche.js',
               './app-06-maliste.js', './app-07-profil.js', './app-08-compte.js',
               './app-09-profils.js', './app-10-guide.js', './app-11-taxo.js']
  .map(p => p.endsWith('.js') || p.endsWith('.css') ? p + '?b=' + BUILD : p);

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
    /* cache:'no-cache' : sans lui, « réseau d'abord » passait en réalité par
       le cache HTTP du téléphone (max-age de 10 min sur GitHub Pages), et une
       mise à jour pouvait mettre de longues minutes à apparaître — vécu. Ici
       on revalide systématiquement auprès du serveur (un 304 ne coûte rien). */
    fetch(req, {cache:'no-cache'})
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

/* ---------- Notifications push ----------
   Le NAS envoie la notification à l'export horaire quand un titre demandé
   vient d'arriver ; ici on ne fait que l'afficher, app ouverte ou non. */
self.addEventListener('push', e => {
  let d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(err){}
  e.waitUntil(self.registration.showNotification(d.titre || 'Cinéflix', {
    body: d.corps || '',
    /* La jaquette du titre en vignette quand le NAS la fournit,
       l'icône de l'app sinon. */
    icon: d.ic || './icon-192.png',
    badge: './icon-192.png',
    data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(l => {
    for(const c of l){ if('focus' in c) return c.focus(); }
    return clients.openWindow((e.notification.data || {}).url || './');
  }));
});
