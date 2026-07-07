/* ============================================================
   PLAYER.JS
   TV tarayıcısında çalışan oynatıcı.
   - playlist.json dosyasını okur
   - Service worker ile medya + playlist'i cache'ler
   - İnternet olmasa bile son bilinen playlist'i sonsuz döngüde oynatır
   ============================================================ */

(function () {
  "use strict";

  var CONFIG = {
    playlistUrl: "playlist.json",
    pollIntervalMs: 5 * 60 * 1000,   // 5 dakikada bir yeni içerik kontrolü
    retryIntervalMs: 30 * 1000,      // playlist hiç yüklenemediyse 30sn'de bir tekrar dene
    defaultDuration: 10,             // saniye (görsel/web için varsayılan süre)
    maxVideoWaitMs: 60 * 1000,       // video takılırsa bu süre sonra zorla sonraki içeriğe geç
    localStorageKey: "signage_playlist_cache_v1"
  };

  var stage = document.getElementById("stage");
  var statusEl = document.getElementById("status");
  var statusDetail = document.getElementById("statusDetail");
  var debugEl = document.getElementById("debug");

  var deviceGroup = getDeviceGroup();
  var currentItems = [];
  var currentIndex = -1;
  var activeSlide = null;
  var advanceTimer = null;
  var playlistMeta = { name: "", updatedAt: "" };

  init();

  function init() {
    registerServiceWorker();
    loadPlaylist(true);
    setInterval(function () { loadPlaylist(false); }, CONFIG.pollIntervalMs);

    window.addEventListener("online", function () { loadPlaylist(false); });

    document.addEventListener("keydown", function (e) {
      if (e.key === "d" || e.key === "D") toggleDebug();
    });
  }

  function getDeviceGroup() {
    var params = new URLSearchParams(window.location.search);
    var fromUrl = params.get("grup") || params.get("group");
    if (fromUrl) {
      localStorage.setItem("signage_device_group", fromUrl);
      return fromUrl;
    }
    return localStorage.getItem("signage_device_group") || "default";
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function (err) {
        console.warn("Service worker kaydedilemedi:", err);
      });
    }
  }

  /* ---------- Playlist yükleme (network-first, cache fallback) ---------- */

  function loadPlaylist(isFirstLoad) {
    fetchWithTimeout(CONFIG.playlistUrl + "?t=" + Date.now(), 8000)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        localStorage.setItem(CONFIG.localStorageKey, JSON.stringify(data));
        applyPlaylist(data, isFirstLoad);
      })
      .catch(function (err) {
        updateDebug("Ağ hatası: " + err.message + " (cache kullanılıyor)");
        var cached = readCachedPlaylist();
        if (cached) {
          applyPlaylist(cached, isFirstLoad);
        } else if (isFirstLoad) {
          showStatus("İçerik bekleniyor", "Sunucuya ulaşılamadı ve yerel bir kayıt bulunamadı.");
          setTimeout(function () { loadPlaylist(true); }, CONFIG.retryIntervalMs);
        }
      });
  }

  function readCachedPlaylist() {
    try {
      var raw = localStorage.getItem(CONFIG.localStorageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function applyPlaylist(data, isFirstLoad) {
    var group = (data.deviceGroups && data.deviceGroups[deviceGroup]) ||
                (data.deviceGroups && data.deviceGroups["default"]);

    if (!group) {
      showStatus("Grup tanımsız", "'" + deviceGroup + "' grubu için tanımlı bir oynatma listesi yok.");
      return;
    }

    var playlist = data.playlists && data.playlists[group.playlistId];
    if (!playlist || !playlist.items || playlist.items.length === 0) {
      showStatus("Oynatma listesi boş", "Bu grup için henüz içerik eklenmemiş.");
      return;
    }

    var sameContent = playlist.items.length === currentItems.length &&
      JSON.stringify(playlist.items) === JSON.stringify(currentItems);

    playlistMeta = { name: playlist.name || "", updatedAt: data.updatedAt || "" };
    updateDebug(null);

    if (sameContent && !isFirstLoad) return; // içerik değişmediyse döngüyü bozma

    currentItems = playlist.items.slice();
    hideStatus();

    if (isFirstLoad || currentIndex === -1) {
      currentIndex = -1;
      advanceToNext();
    }
    // İçerik değiştiyse mevcut slayt bitince yeni listeden devam eder (advanceToNext zaten günceli kullanır)
  }

  /* ---------- Slayt döngüsü ---------- */

  function advanceToNext() {
    clearTimeout(advanceTimer);
    if (currentItems.length === 0) return;

    currentIndex = (currentIndex + 1) % currentItems.length;
    var item = currentItems[currentIndex];
    renderSlide(item);
  }

  function renderSlide(item) {
    var slide = document.createElement("div");
    slide.className = "slide";

    var el = buildElement(item);
    slide.appendChild(el);
    stage.appendChild(slide);

    // bir sonraki frame'de fade-in yap
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { slide.classList.add("active"); });
    });

    var previous = activeSlide;
    activeSlide = slide;

    if (previous) {
      setTimeout(function () {
        previous.classList.remove("active");
        setTimeout(function () {
          if (previous.parentNode) previous.parentNode.removeChild(previous);
        }, 650);
      }, 0);
    }

    scheduleAdvance(item, el);
    updateDebug(null);
  }

  function buildElement(item) {
    var type = item.type;

    if (type === "image") {
      var img = document.createElement("img");
      img.src = item.src;
      img.alt = "";
      return img;
    }

    if (type === "video") {
      var video = document.createElement("video");
      video.src = item.src;
      video.autoplay = true;
      video.muted = item.muted !== false; // varsayılan sessiz (autoplay için gerekli)
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      if (item.loopWithinDuration) video.loop = true;
      return video;
    }

    if (type === "web") {
      var iframe = document.createElement("iframe");
      iframe.src = item.src;
      return iframe;
    }

    // bilinmeyen tip için boş görünmez bir kutu
    var fallback = document.createElement("div");
    return fallback;
  }

  function scheduleAdvance(item, el) {
    clearTimeout(advanceTimer);

    if (item.type === "video" && !item.loopWithinDuration) {
      var forced = setTimeout(advanceToNext, CONFIG.maxVideoWaitMs);
      el.addEventListener("ended", function () {
        clearTimeout(forced);
        advanceToNext();
      });
      el.addEventListener("error", function () {
        clearTimeout(forced);
        advanceToNext();
      });
      return;
    }

    var duration = (item.duration && item.duration > 0) ? item.duration : CONFIG.defaultDuration;
    advanceTimer = setTimeout(advanceToNext, duration * 1000);
  }

  /* ---------- Durum ekranı ---------- */

  function showStatus(title, detail) {
    statusEl.querySelector("h1").textContent = title;
    statusDetail.textContent = detail;
    statusEl.classList.add("show");
  }

  function hideStatus() {
    statusEl.classList.remove("show");
  }

  /* ---------- Debug katmanı (kumandada "d" ile aç/kapa) ---------- */

  function toggleDebug() {
    debugEl.classList.toggle("show");
    updateDebug(null);
  }

  function updateDebug(extraLine) {
    if (!debugEl.classList.contains("show")) return;
    var lines = [
      "Grup: " + deviceGroup,
      "Liste: " + (playlistMeta.name || "-"),
      "Güncelleme: " + (playlistMeta.updatedAt || "-"),
      "Öğe: " + (currentIndex + 1) + "/" + currentItems.length,
      "Bağlantı: " + (navigator.onLine ? "çevrimiçi" : "çevrimdışı")
    ];
    if (extraLine) lines.push(extraLine);
    debugEl.innerHTML = lines.join("<br/>");
  }

  /* ---------- Yardımcılar ---------- */

  function fetchWithTimeout(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error("zaman aşımı")); }, timeoutMs);
      fetch(url, { cache: "no-store" }).then(function (res) {
        clearTimeout(timer);
        resolve(res);
      }).catch(function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

})();
