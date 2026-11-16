/* NYC '26 service worker: çevrimdışı kabuk, harita karoları, fotoğraflar, bildirimler */
const V = "nyc26-v10";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"];
const LIMITS = { tiles: 1500, img: 300, font: 40 };

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V + "-shell").then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !k.startsWith(V) && !/^nyc26-(tiles|img|font)$/.test(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(name, max) {
  const c = await caches.open(name); const ks = await c.keys();
  for (let i = 0; i < ks.length - max; i++) await c.delete(ks[i]);
}
async function cacheFirst(req, name, max) {
  const c = await caches.open(name);
  const hit = await c.match(req, { ignoreVary: true });
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r && (r.ok || r.type === "opaque")) { c.put(req, r.clone()); trim(name, max); }
    return r;
  } catch (e) { return hit || Response.error(); }
}
async function netFirst(req, name) {
  const c = await caches.open(name);
  try {
    const r = await fetch(req);
    if (r && r.ok) c.put(req, r.clone());
    return r;
  } catch (e) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") { const s = await caches.open(V + "-shell"); return (await s.match("./index.html")) || (await s.match("./")) || Response.error(); }
    return Response.error();
  }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.hostname.endsWith("tile.openstreetmap.org")) return e.respondWith(cacheFirst(req, "nyc26-tiles", LIMITS.tiles));
  if (u.hostname === "cf.bstatic.com" || u.hostname.endsWith("wikimedia.org")) return e.respondWith(cacheFirst(req, "nyc26-img", LIMITS.img));
  if (u.hostname.includes("fonts.g")) return e.respondWith(cacheFirst(req, "nyc26-font", LIMITS.font));
  if (u.hostname === "cdnjs.cloudflare.com") return e.respondWith(cacheFirst(req, V + "-shell", 50));
  if (u.origin === location.origin) return e.respondWith(netFirst(req, V + "-shell"));
});

/* Web Push */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: "NYC '26", body: e.data ? e.data.text() : "" }; }
  const title = d.title || "NYC '26";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    tag: d.tag || "nyc26",
    renotify: true,
    icon: "icon-192.png",
    badge: "icon-192.png",
    data: { url: d.url || "./", tab: d.tab || "" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const tab = (e.notification.data && e.notification.data.tab) || "";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { c.postMessage({ type: "open", tab }); return c.focus(); } }
    return self.clients.openWindow("./" + (tab ? "#" + tab : ""));
  })());
});
