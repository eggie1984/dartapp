// Updatemelding: zolang er een nieuwere versie klaarstaat dan de goedgekeurde,
// verschijnt bij elke keer openen een balk met "Bijwerken" en "Later".
(function () {
  "use strict";
  if (!("serviceWorker" in navigator)) return;

  const CHECK_ELK = 30 * 60 * 1000; // elk half uur kijken
  let herladen = false, geklikt = false;

  const css = `
    #update-balk{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:99999;
      display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:16px;background:#15493A;color:#F2F7F1;
      box-shadow:0 8px 28px rgba(0,0,0,.3);transform:translateY(180%);transition:transform .35s ease;max-width:560px;margin:0 auto;
      font-family:inherit}
    #update-balk.zichtbaar{transform:translateY(0)}
    #update-balk .vis{width:40px;height:40px;border-radius:10px;flex:none}
    #update-balk .tekst{flex:1;min-width:0}
    #update-balk .titel{font-weight:700}
    #update-balk .nieuw{opacity:.85;font-size:13px;margin-top:2px}
    #update-balk button{border:0;border-radius:99px;padding:9px 14px;font:inherit;font-weight:700;cursor:pointer}
    #update-balk .bijwerken{background:#8FE0B0;color:#0A2E2E}
    #update-balk .later{background:transparent;color:inherit;opacity:.75;padding:9px 4px}`;

  function vraag(worker, bericht) {
    return new Promise(klaar => {
      const k = new MessageChannel(); let af = false;
      k.port1.onmessage = e => { af = true; klaar(e.data); };
      setTimeout(() => { if (!af) klaar(null); }, 3000);
      try { worker.postMessage(bericht, [k.port2]); } catch (x) { klaar(null); }
    });
  }

  let gewenst = null; // worker waarvoor de balk zichtbaar hoort te zijn
  function toonBalk(worker) {
    gewenst = worker;
    let balk = document.getElementById("update-balk");
    if (balk) { balk._worker = worker; balk.classList.add("zichtbaar"); return; }
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    balk = document.createElement("div");
    balk.id = "update-balk"; balk.setAttribute("role", "status"); balk._worker = worker;
    balk.innerHTML = '<img class="vis" src="icon-192.png" alt=""><div class="tekst"><div class="titel">Nieuwe versie beschikbaar</div><div class="nieuw"></div></div>' +
      '<button class="later" type="button">Later</button><button class="bijwerken" type="button">Bijwerken</button>';
    document.body.appendChild(balk);

    fetch("versie.json", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(info => {
      if (!info) return;
      if (info.versie) balk.querySelector(".titel").textContent = "Nieuwe versie beschikbaar (" + info.versie + ")";
      if (info.nieuw) balk.querySelector(".nieuw").textContent = info.nieuw;
    }).catch(() => {});

    balk.querySelector(".bijwerken").addEventListener("click", async () => {
      geklikt = true;
      balk.querySelector(".bijwerken").textContent = "Bezig…";
      const w = balk._worker;
      await vraag(w, { type: "BIJWERKEN" });
      // Was het de actieve versie, dan meteen herladen; anders wacht op de wissel (met vangnet)
      if (w === navigator.serviceWorker.controller) { herladen = true; location.reload(); }
      else setTimeout(() => { if (!herladen) { herladen = true; location.reload(); } }, 3000);
    });
    balk.querySelector(".later").addEventListener("click", () => { gewenst = null; balk.classList.remove("zichtbaar"); });
    requestAnimationFrame(() => requestAnimationFrame(() => balk.classList.add("zichtbaar")));
  }

  function volg(worker) {
    if (!worker) return;
    const kijk = () => { if (worker.state === "installed" && navigator.serviceWorker.controller) toonBalk(worker); };
    kijk(); worker.addEventListener("statechange", kijk);
  }

  // Draait er al een nieuwere versie dan goedgekeurd (bijv. na app sluiten)? Dan ook de vraag tonen.
  async function controleerActief() {
    const c = navigator.serviceWorker.controller;
    if (!c) return;
    const s = await vraag(c, { type: "STATUS" });
    if (s && s.akkoord && s.versie && s.akkoord !== s.versie) toonBalk(c);
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!geklikt || herladen) return; herladen = true; location.reload();
  });

  // Versienummer tonen in elk element met id="app-versie" of class="app-versie"
  let versie = "";
  function vulVersie() {
    if (!versie) return;
    document.querySelectorAll("#app-versie, .app-versie").forEach(el => {
      const t = "Versie " + versie; if (el.textContent !== t) el.textContent = t;
    });
  }
  async function toonVersie() {
    const c = navigator.serviceWorker.controller;
    if (!c) return;
    const v = await vraag(c, { type: "GET_VERSION" });
    if (v) { versie = v; vulVersie(); }
  }
  // Tekent de pagina zichzelf opnieuw en is de balk daardoor weg? Dan terugzetten.
  function bewaak() { if (gewenst && document.body && !document.getElementById("update-balk")) toonBalk(gewenst); }
  new MutationObserver(() => { vulVersie(); bewaak(); }).observe(document.documentElement, { childList: true, subtree: true });

  // Zelf ook registreren (zelfde bestand, dus geen dubbele service worker)
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});

  navigator.serviceWorker.ready.then(reg => {
    if (reg.waiting) volg(reg.waiting);
    volg(reg.installing);
    reg.addEventListener("updatefound", () => volg(reg.installing));
    controleerActief();
    toonVersie();
    reg.update().catch(() => {});
    setInterval(() => reg.update().catch(() => {}), CHECK_ELK);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") { reg.update().catch(() => {}); controleerActief(); }
    });
  });
  navigator.serviceWorker.addEventListener("controllerchange", toonVersie);
})();
