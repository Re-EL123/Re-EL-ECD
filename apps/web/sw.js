/* Re-EL ECD service worker: offline shell.
   Strategy: same-origin static assets are cache-backed so the app shell
   loads offline. API GETs are network-only — children's data is never
   written to Cache Storage, which persists after logout on shared devices. */
const CACHE = 'reel-shell-v157';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    // Purge any cached API responses from earlier versions of this worker.
    for (const key of keys) {
      const cache = await caches.open(key);
      const requests = await cache.keys();
      await Promise.all(requests.filter((r) => new URL(r.url).pathname.startsWith('/api/')).map((r) => cache.delete(r)));
    }
    await self.clients.claim();
  })());
});

/* Stale-while-revalidate: serve the cached shell instantly (offline-safe)
   while a background fetch refreshes it, so a deploy never leaves tablets
   pinned to yesterday's JavaScript. */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  const fetched = fetch(request).then((response) => {
    if (response && response.ok) {
      caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => cached || new Response('Offline and not cached yet.', { status: 503, headers: { 'Content-Type': 'text/plain;charset=utf-8' } }));
  return cached || fetched;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // mutations need the network
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave R2/CDN alone (app-layer handles it)
  // Navigation: network-first so a fresh deploy reaches users; fall back to cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        return caches.match('/');
      }
    })());
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    // API GETs are network-only. The client handles offline states itself;
    // we never persist children's data in Cache Storage.
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        return new Response(JSON.stringify({ error: { code: 'OFFLINE', message: 'You are offline and this data has not been downloaded yet.' } }),
          { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
    })());
    return;
  }
  // Static shell: cache first, fill in the background.
  event.respondWith(cacheFirst(request));
});

// Push notifications: show the centre's message, open the right screen on tap.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (error) {
    data = { title: 'Re-EL ECD', body: event.data ? event.data.text() : 'You have a new update.' };
  }
  const title = data.title || 'Re-EL ECD';
  const options = {
    body: data.body || '',
    icon: '/assets/branding/favicon-64.png',
    badge: '/assets/branding/favicon-64.png',
    tag: data.tag || data.type || 'reel',
    data: { url: data.url || '/#/app/today' },
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/#/app/today';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if (client.url.includes(self.location.origin)) {
        await client.focus();
        if ('navigate' in client) await client.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
