self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // nodig zodat Chrome de app als installeerbaar ziet
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || "Wie gooit er mee?", {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag, data: { url: d.url || './' } }));
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
