// Service worker: pushmeldingen tonen, de app installeerbaar maken en nieuwe versies melden.
// Er wordt bewust niets gecachet, zodat je altijd de nieuwste versie ziet.
//
// NIEUWE VERSIE UITBRENGEN: verhoog VERSIE hieronder én "versie" in versie.json.
// Wie de app open heeft, krijgt dan onderin "Nieuwe versie beschikbaar" met een knop Bijwerken.
const VERSIE = '1.0';

// Pas overnemen als er op "Bijwerken" getikt wordt
self.addEventListener('install', () => {});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data.type === 'GET_VERSION' && e.ports[0]) e.ports[0].postMessage(VERSIE);
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // Supabase e.d. ongemoeid
  if (req.headers.has('range')) return;
  // Altijd bij GitHub controleren of er iets nieuws is (geen verouderde bestanden uit de browsercache)
  e.respondWith(fetch(req, { cache: 'no-cache' }).catch(() => fetch(req)));
});

self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || "Wie gooit er mee?", {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag, image: d.image || undefined, data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  const kroeg = /kroeg/.test(url); // meldingen voor de kastelein openen de kasteleinpagina, de rest de gewone app
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) {
      if (/kroeg/.test(c.url) !== kroeg || !('focus' in c)) continue;
      if (!kroeg) c.postMessage({ type: 'open-inbox' });
      return c.focus();
    }
    return self.clients.openWindow(url);
  }));
});
