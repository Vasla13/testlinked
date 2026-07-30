const CACHE_NAME = 'bni-linked-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './home-alerts.js',
  './manifest.json',
  './map/',
  './map/index.html',
  './map/style.css',
  './map/logo-bni-linked.png',
  './map/carte.jpg',
  './map/js/api.js',
  './map/js/engine.js',
  './map/js/render.js',
  './map/js/main.js',
  './map/js/state.js',
  './map/js/cloud.js',
  './map/js/alerts.js',
  './map/js/zone-editor.js',
  './map/js/constants.js',
  './map/js/utils.js',
  './point/',
  './point/index.html',
  './point/logo-bni-linked.png',
  './point/js/main.js',
  './point/js/physics.js',
  './point/js/render.js',
  './point/js/ui.js',
  './point/js/intel.js',
  './point/js/state.js',
  './staff/',
  './staff/index.html',
  './staff/style.css',
  './staff/main.js',
  './database/',
  './database/index.html',
  './database/style.css'
];

// Installation : Mise en cache préalable des ressources critiques
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Pre-cache initial partiel :', err))
  );
});

// Activation : Nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Interception des requêtes Réseau avec stratégie hybride
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorer les requêtes non-GET et les requêtes API Netlify / WebSockets
  if (event.request.method !== 'GET' || url.pathname.startsWith('/.netlify/') || url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // Pour les ressources statiques et images lourdes (ex: carte.jpg) -> Cache-First avec fallback réseau
  if (event.request.destination === 'image' || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.png') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.hostname.includes('fonts.googleapis.com')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        }).catch(() => cachedResponse);
      })
    );
    return;
  }

  // Pour les pages HTML -> Network-First avec fallback Cache pour support hors-ligne
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || caches.match('./index.html');
        });
      })
  );
});
