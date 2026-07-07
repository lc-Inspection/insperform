/* ============================================================
   SERVICE WORKER
   Amaç: internet kesildiğinde TV'nin son bilinen içerikle
   oynatmaya devam edebilmesi için player sayfasını, playlist.json'u
   ve tüm medya dosyalarını cache'lemek.
   Strateji: stale-while-revalidate
   (önce cache'ten hızlıca döndür, arka planda ağdan güncelle)
   ============================================================ */

var CACHE_NAME = "signage-cache-v1";

var APP_SHELL = [
  "./player.html",
  "./player.js",
  "./playlist.json"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;

  // Sadece GET isteklerini cache'le
  if (req.method !== "GET") return;

  // Farklı origin'lerden gelen (örn. bir web sayfası içeriği, dış CDN)
  // istekleri olduğu gibi ağa bırak; sadece kendi statik dosyalarımızı
  // ve /media, /data klasörlerini stale-while-revalidate ile yönet.
  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) {
    return; // dış web içerikleri (iframe) için cache mantığına karışma
  }

  event.respondWith(staleWhileRevalidate(req));
});

function staleWhileRevalidate(req) {
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache.match(req).then(function (cached) {
      var networkFetch = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          cache.put(req, res.clone());
        }
        return res;
      }).catch(function () {
        // ağ yok; elimizde cache varsa zaten onu döndürüyoruz
        return cached;
      });

      // cache varsa hemen onu döndür, arka planda güncelle;
      // yoksa ağ cevabını bekle
      return cached || networkFetch;
    });
  });
}
