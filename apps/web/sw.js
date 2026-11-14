/* Re-EL ECD service worker: offline shell + guide reading.
   Strategy: same-origin static assets and API GETs are cache-backed so a
   downloaded centre pack stays usable with no network at all. */
const CACHE = 'reel-shell-v4';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // mutations need the network
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave R2/CDN alone (app-layer handles it)
  if (url.pathname.startsWith('/api/')) {
    // API GETs: network first, fall back to the last cached copy offline.
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: { code: 'OFFLINE', message: 'You are offline and this data has not been downloaded yet.' } }),
          { status: 503, headers: { 'Content-Type': 'application/json' } });
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
    data: { url: data.url || '/#/app/overview' },
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/#/app/overview';
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
