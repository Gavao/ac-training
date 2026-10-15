// Service worker: rende l'app utilizzabile offline (anche in palestra senza campo).
const SHELL = 'shell-v1';
const IMAGES = 'images-v1';
const FILES = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/exercises.js', 'js/plan.js', 'js/charts.js', 'js/version.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // GitHub (aggiornamenti) e YouTube passano diretti

  // Foto degli esercizi: non cambiano mai, quindi prima la copia salvata.
  if (url.pathname.includes('/img/')) {
    e.respondWith(caches.open(IMAGES).then(async cache => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }));
    return;
  }

  // File dell'app: prima la rete (così le modifiche si vedono subito), poi la copia salvata.
  e.respondWith(
    fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
      if (res.ok) caches.open(SHELL).then(c => c.put(e.request, res.clone()));
      return res.clone();
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
