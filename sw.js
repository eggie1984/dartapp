// Service worker: app installeerbaar, pushmeldingen en versiebeheer.
//
// NIEUWE VERSIE UITBRENGEN: verhoog VERSIE hieronder én "versie" in versie.json.
// Iedereen blijft op de oude versie tot hij zelf op "Bijwerken" tikt.
// Kiest iemand "Later", dan komt de vraag terug bij de volgende keer openen.
const VERSIE = "1.7";
const PREFIX = "dart-";
const CACHE = PREFIX + VERSIE;
const META = PREFIX + "meta";
// App-bestanden die per versie bewaard worden (zodat iemand op "Later" de oude versie houdt).
// update.js staat er bewust niet bij: die moet altijd de nieuwste zijn.
const SHELL = ["./", "index.html", "kroeg.html", "manifest.webmanifest", "kroeg.webmanifest", "icon-192.png"];
const SHELL_URLS = new Set(SHELL.map(p => new URL(p, self.registration.scope).href));

// ---------- Welke versie heeft de gebruiker goedgekeurd? ----------
async function leesAkkoord() {
  const r = await (await caches.open(META)).match("akkoord");
  return r ? r.text() : null;
}
async function zetAkkoord(v) {
  await (await caches.open(META)).put("akkoord", new Response(v));
}
async function opruimen(houd) {
  const namen = await caches.keys();
  await Promise.all(namen.filter(n => !houd.includes(n)).map(n => caches.delete(n)));
}

// ---------- Installeren: nieuwe versie alvast ophalen, nog niet gebruiken ----------
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(p =>
    fetch(new Request(p, { cache: "reload" })).then(r => { if (r.ok) return c.put(new URL(p, self.registration.scope).href, r); }).catch(() => {})
  ))));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    let akkoord = await leesAkkoord();
    if (!akkoord) {
      // Eerste keer met dit systeem: had iemand nog een oude versie in de cache, dan blijft die staan
      const oud = (await caches.keys()).filter(n => n.startsWith(PREFIX) && n !== META && n !== CACHE && /^\d+(\.\d+)*$/.test(n.slice(PREFIX.length)));
      akkoord = oud.length ? oud.sort().pop().slice(PREFIX.length) : VERSIE;
      await zetAkkoord(akkoord);
    }
    await opruimen([CACHE, META, PREFIX + akkoord]);
    await self.clients.claim();
  })());
});

// ---------- Berichten van de app ----------
self.addEventListener("message", e => {
  const d = e.data || {}, poort = e.ports && e.ports[0];
  if (d.type === "STATUS") {
    e.waitUntil(leesAkkoord().then(a => poort && poort.postMessage({ akkoord: a || VERSIE, versie: VERSIE })));
  }
  if (d.type === "GET_VERSION") {
    e.waitUntil(leesAkkoord().then(a => poort && poort.postMessage(a || VERSIE)));
  }
  if (d.type === "BIJWERKEN" || d.type === "SKIP_WAITING") {
    e.waitUntil((async () => {
      await zetAkkoord(VERSIE);
      await opruimen([CACHE, META]);
      self.skipWaiting();
      if (poort) poort.postMessage("ok");
    })());
  }
});

// ---------- Ophalen ----------
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;   // Supabase e.d. ongemoeid
  if (req.headers.has("range")) return;                                 // video's laten streamen
  if (url.pathname.endsWith("/versie.json")) return;                    // altijd vers

  const key = url.origin + url.pathname;
  if (SHELL_URLS.has(key)) {
    // App-bestanden van de goedgekeurde versie
    e.respondWith((async () => {
      const akkoord = (await leesAkkoord()) || VERSIE;
      const hit = await (await caches.open(PREFIX + akkoord)).match(key)
               || await (await caches.open(CACHE)).match(key);
      return hit || fetch(req, { cache: "no-cache" });
    })());
    return;
  }
  // Overige bestanden: altijd vers bij GitHub ophalen
  e.respondWith(fetch(req, { cache: "no-cache" }).catch(() => fetch(req)));
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
