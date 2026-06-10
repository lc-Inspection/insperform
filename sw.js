// Inspection Performans Paneli — Service Worker v2
// Bu dosyayı panel.html ile aynı dizine koy: /inspection-panel/sw.js

const CACHE_NAME = 'inspection-panel-v2';
const PAGE_URL   = './panel.html';

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.add(PAGE_URL); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k)   { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var networkFetch = fetch(e.request).then(function(resp) {
        if (resp && resp.ok && resp.type === 'basic') {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
        }
        return resp;
      });
      return cached || networkFetch;
    })
  );
});
