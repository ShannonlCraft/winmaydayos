/* ══ MY DAY — SERVICE WORKER ══
   Handles background notifications, accurate scheduling,
   and offline caching so the app works without internet.
*/

const CACHE_NAME = 'myday-v4';
const ASSETS = ['./', './index.html', './manifest.json'];

/* ── Install: cache core files ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

/* ── Activate: clean old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── Fetch: serve from cache, fall back to network ── */
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

/* ── Notification click: open the app ── */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('./');
    })
  );
});

/* ── Background sync for scheduled notifications ──
   The app sends notification schedules here via postMessage.
   The SW fires them at the right time even if app is closed.
*/
const scheduledNotifs = new Map();

self.addEventListener('message', event => {
  const { type, payload } = event.data || {};

  if (type === 'SCHEDULE_NOTIF') {
    const { id, title, body, fireAt } = payload;
    const delay = fireAt - Date.now();
    if (delay <= 0) return;

    // Clear any existing timer for this id
    if (scheduledNotifs.has(id)) clearTimeout(scheduledNotifs.get(id));

    const timer = setTimeout(async () => {
      scheduledNotifs.delete(id);
      try {
        await self.registration.showNotification(title, {
          body,
          icon: './icon-512.png',
          badge: './icon-512.png',
          vibrate: [200, 100, 200],
          tag: id,
          requireInteraction: false,
        });
      } catch(e) {}
    }, delay);

    scheduledNotifs.set(id, timer);
  }

  if (type === 'CANCEL_NOTIF') {
    const { id } = payload;
    if (scheduledNotifs.has(id)) {
      clearTimeout(scheduledNotifs.get(id));
      scheduledNotifs.delete(id);
    }
  }

  if (type === 'CLEAR_ALL_NOTIFS') {
    scheduledNotifs.forEach(timer => clearTimeout(timer));
    scheduledNotifs.clear();
  }

  /* 5 AM daily reset ping — app sends this on load,
     SW fires a silent wake at 5am so the reset runs on time */
  if (type === 'SCHEDULE_5AM') {
    const { fireAt } = payload;
    const delay = fireAt - Date.now();
    if (delay <= 0) return;

    if (scheduledNotifs.has('__5am__')) clearTimeout(scheduledNotifs.get('__5am__'));

    const timer = setTimeout(async () => {
      scheduledNotifs.delete('__5am__');
      // Wake all app clients so they run checkReset()
      const allClients = await clients.matchAll({ includeUncontrolled: true });
      allClients.forEach(client => client.postMessage({ type: 'WAKE_5AM' }));
    }, delay);

    scheduledNotifs.set('__5am__', timer);
  }
});
