/* ============================================================
   ADMIN.JS
   Statik admin panelini GitHub Contents API üzerinden
   doğrudan repodaki playlist.json dosyasını okuyup
   yazabilen bir CMS'e dönüştürür. Backend gerektirmez.
   ============================================================ */

(function () {
  "use strict";

  var STORAGE_KEY = "signage_admin_repo_config";
  var PLAYLIST_PATH = "playlist.json";

  var state = {
    repo: null,          // { owner, repo, branch, token }
    sha: null,           // playlist.json dosyasının mevcut git sha'sı
    data: null,          // parse edilmiş playlist.json içeriği
    activeGroupId: null
  };

  var el = {
    connBtn: document.getElementById("connBtn"),
    tally: document.getElementById("tally"),
    repoLabel: document.getElementById("repoLabel"),
    groupList: document.getElementById("groupList"),
    addGroupBtn: document.getElementById("addGroupBtn"),
    playlistTitle: document.getElementById("playlistTitle"),
    playlistMeta: document.getElementById("playlistMeta"),
    cueList: document.getElementById("cueList"),
    addCueBtn: document.getElementById("addCueBtn"),
    publishBtn: document.getElementById("publishBtn"),
    tvUrlBtn: document.getElementById("tvUrlBtn"),
    log: document.getElementById("log"),
    fileInput: document.getElementById("fileInput"),

    connModal: document.getElementById("connModal"),
    inOwner: document.getElementById("inOwner"),
    inRepo: document.getElementById("inRepo"),
    inBranch: document.getElementById("inBranch"),
    inToken: document.getElementById("inToken"),
    connSave: document.getElementById("connSave"),
    connCancel: document.getElementById("connCancel"),

    groupModal: document.getElementById("groupModal"),
    inGroupId: document.getElementById("inGroupId"),
    inGroupName: document.getElementById("inGroupName"),
    groupSave: document.getElementById("groupSave"),
    groupCancel: document.getElementById("groupCancel"),

    tvModal: document.getElementById("tvModal"),
    inPagesBase: document.getElementById("inPagesBase"),
    tvUrlResult: document.getElementById("tvUrlResult"),
    tvCancel: document.getElementById("tvCancel"),
    tvCopy: document.getElementById("tvCopy")
  };

  var pendingUploadCue = null; // hangi cue'nun dosya yükleme butonuna basıldığı

  init();

  function init() {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      state.repo = JSON.parse(saved);
      loadPlaylist();
    } else {
      log("Başlamak için sağ üstten GitHub reposuna bağlanın.", "");
    }

    el.connBtn.addEventListener("click", openConnModal);
    el.connCancel.addEventListener("click", function () { toggleModal(el.connModal, false); });
    el.connSave.addEventListener("click", saveConnection);

    el.addGroupBtn.addEventListener("click", function () { toggleModal(el.groupModal, true); });
    el.groupCancel.addEventListener("click", function () { toggleModal(el.groupModal, false); });
    el.groupSave.addEventListener("click", createGroup);

    el.addCueBtn.addEventListener("click", addCue);
    el.publishBtn.addEventListener("click", publish);
    el.tvUrlBtn.addEventListener("click", function () { toggleModal(el.tvModal, true); });
    el.tvCancel.addEventListener("click", function () { toggleModal(el.tvModal, false); });
    el.tvCopy.addEventListener("click", copyTvUrl);
    el.inPagesBase.addEventListener("input", renderTvUrl);

    el.fileInput.addEventListener("change", handleFileSelected);
  }

  /* ================= Bağlantı ================= */

  function openConnModal() {
    if (state.repo) {
      el.inOwner.value = state.repo.owner;
      el.inRepo.value = state.repo.repo;
      el.inBranch.value = state.repo.branch;
      el.inToken.value = state.repo.token;
    }
    toggleModal(el.connModal, true);
  }

  function saveConnection() {
    var owner = el.inOwner.value.trim();
    var repo = el.inRepo.value.trim();
    var branch = el.inBranch.value.trim() || "main";
    var token = el.inToken.value.trim();

    if (!owner || !repo || !token) {
      log("Kullanıcı adı, repo ve token zorunludur.", "err");
      return;
    }

    state.repo = { owner: owner, repo: repo, branch: branch, token: token };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.repo));
    toggleModal(el.connModal, false);
    loadPlaylist();
  }

  function githubApi(path, options) {
    options = options || {};
    var url = "https://api.github.com/repos/" + state.repo.owner + "/" + state.repo.repo + "/" + path;
    var headers = Object.assign({
      "Authorization": "Bearer " + state.repo.token,
      "Accept": "application/vnd.github+json"
    }, options.headers || {});
    return fetch(url, Object.assign({}, options, { headers: headers }));
  }

  /* ================= Playlist yükle / kaydet ================= */

  function loadPlaylist() {
    setTally(false);
    log("Repo'ya bağlanılıyor: " + state.repo.owner + "/" + state.repo.repo + " …", "");
    el.repoLabel.textContent = state.repo.owner + "/" + state.repo.repo;

    githubApi("contents/" + PLAYLIST_PATH + "?ref=" + state.repo.branch)
      .then(function (res) {
        if (res.status === 404) {
          log("playlist.json bulunamadı, boş bir yapı ile başlatılıyor.", "");
          state.sha = null;
          state.data = emptyPlaylistData();
          finishLoad();
          return null;
        }
        if (!res.ok) return res.text().then(function (t) { throw new Error("HTTP " + res.status + ": " + t); });
        return res.json();
      })
      .then(function (json) {
        if (!json) return;
        state.sha = json.sha;
        state.data = JSON.parse(base64ToUtf8(json.content));
        finishLoad();
      })
      .catch(function (err) {
        log("Bağlantı hatası: " + err.message, "err");
        setTally(false);
      });
  }

  function finishLoad() {
    setTally(true);
    log("Playlist yüklendi.", "ok");
    var groupIds = Object.keys(state.data.deviceGroups || {});
    state.activeGroupId = groupIds[0] || null;
    renderGroups();
    renderPlaylist();
  }

  function emptyPlaylistData() {
    return {
      updatedAt: new Date().toISOString(),
      deviceGroups: {
        "default": { name: "Varsayılan Grup", playlistId: "playlist-1" }
      },
      playlists: {
        "playlist-1": { name: "Ana Oynatma Listesi", items: [] }
      }
    };
  }

  function publish() {
    if (!state.repo) { log("Önce GitHub reposuna bağlanın.", "err"); return; }

    state.data.updatedAt = new Date().toISOString();
    var content = utf8ToBase64(JSON.stringify(state.data, null, 2));

    var body = {
      message: "Playlist güncellendi (" + new Date().toLocaleString("tr-TR") + ")",
      content: content,
      branch: state.repo.branch
    };
    if (state.sha) body.sha = state.sha;

    log("Yayınlanıyor…", "");
    githubApi("contents/" + PLAYLIST_PATH, { method: "PUT", body: JSON.stringify(body) })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw new Error("HTTP " + res.status + ": " + t); });
        return res.json();
      })
      .then(function (json) {
        state.sha = json.content.sha;
        log("Yayınlandı. TV'ler en geç birkaç dakika içinde güncel içeriği alacak.", "ok");
      })
      .catch(function (err) {
        log("Yayınlama hatası: " + err.message, "err");
      });
  }

  /* ================= Gruplar ================= */

  function renderGroups() {
    el.groupList.innerHTML = "";
    var groups = state.data.deviceGroups || {};
    Object.keys(groups).forEach(function (id) {
      var g = groups[id];
      var item = document.createElement("div");
      item.className = "group-item" + (id === state.activeGroupId ? " active" : "");
      item.innerHTML =
        '<div class="gname">' + escapeHtml(g.name) + '<span class="gid">' + escapeHtml(id) + "</span></div>";
      item.addEventListener("click", function () {
        state.activeGroupId = id;
        renderGroups();
        renderPlaylist();
      });
      el.groupList.appendChild(item);
    });
  }

  function createGroup() {
    var id = slugify(el.inGroupId.value.trim());
    var name = el.inGroupName.value.trim();
    if (!id || !name) { log("Grup kimliği ve adı zorunludur.", "err"); return; }
    if (state.data.deviceGroups[id]) { log("Bu grup kimliği zaten var.", "err"); return; }

    var playlistId = "playlist-" + id;
    state.data.deviceGroups[id] = { name: name, playlistId: playlistId };
    state.data.playlists[playlistId] = { name: name, items: [] };
    state.activeGroupId = id;

    el.inGroupId.value = ""; el.inGroupName.value = "";
    toggleModal(el.groupModal, false);
    renderGroups();
    renderPlaylist();
  }

  /* ================= Playlist / Cue'lar ================= */

  function getActivePlaylist() {
    var group = state.data.deviceGroups[state.activeGroupId];
    if (!group) return null;
    return state.data.playlists[group.playlistId];
  }

  function renderPlaylist() {
    var playlist = getActivePlaylist();
    if (!playlist) {
      el.playlistTitle.textContent = "—";
      el.playlistMeta.textContent = "";
      el.cueList.innerHTML = "";
      return;
    }

    el.playlistTitle.textContent = playlist.name;
    el.playlistMeta.textContent = playlist.items.length + " öğe";

    el.cueList.innerHTML = "";
    playlist.items.forEach(function (item, index) {
      el.cueList.appendChild(buildCueRow(item, index, playlist.items.length));
    });
  }

  function buildCueRow(item, index, total) {
    var row = document.createElement("div");
    row.className = "cue";

    var num = document.createElement("div");
    num.className = "num";
    num.textContent = String(index + 1).padStart(2, "0");

    var typeSelect = document.createElement("select");
    ["image", "video", "web"].forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t === "image" ? "Görsel" : t === "video" ? "Video" : "Web";
      if (item.type === t) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener("change", function () {
      item.type = typeSelect.value;
      renderPlaylist();
    });

    var srcWrap = document.createElement("div");
    srcWrap.className = "src-row";
    var srcInput = document.createElement("input");
    srcInput.type = "text";
    srcInput.value = item.src || "";
    srcInput.placeholder = item.type === "web" ? "https://…" : "media/dosya.jpg";
    srcInput.addEventListener("input", function () { item.src = srcInput.value; });
    srcWrap.appendChild(srcInput);

    if (item.type !== "web") {
      var uploadBtn = document.createElement("button");
      uploadBtn.className = "uploadBtn";
      uploadBtn.textContent = "Yükle";
      uploadBtn.type = "button";
      uploadBtn.addEventListener("click", function () {
        pendingUploadCue = { item: item, srcInput: srcInput };
        el.fileInput.click();
      });
      srcWrap.appendChild(uploadBtn);
    }

    var durationInput = document.createElement("input");
    durationInput.type = "number";
    durationInput.min = "1";
    durationInput.placeholder = "sn";
    durationInput.value = item.duration || "";
    durationInput.style.display = item.type === "video" ? "none" : "block";
    durationInput.addEventListener("input", function () {
      item.duration = parseInt(durationInput.value, 10) || undefined;
    });

    var btns = document.createElement("div");
    btns.className = "btns";

    var upBtn = makeIconBtn("↑", function () { moveCue(index, -1); });
    if (index === 0) upBtn.disabled = true;
    var downBtn = makeIconBtn("↓", function () { moveCue(index, 1); });
    if (index === total - 1) downBtn.disabled = true;
    var delBtn = makeIconBtn("✕", function () { removeCue(index); });
    delBtn.classList.add("del");

    btns.appendChild(upBtn);
    btns.appendChild(downBtn);
    btns.appendChild(delBtn);

    row.appendChild(num);
    row.appendChild(typeSelect);
    row.appendChild(srcWrap);
    row.appendChild(durationInput);
    row.appendChild(btns);

    return row;
  }

  function makeIconBtn(label, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function addCue() {
    var playlist = getActivePlaylist();
    if (!playlist) { log("Önce bir cihaz grubu seçin.", "err"); return; }
    playlist.items.push({
      id: String(Date.now()),
      type: "image",
      src: "",
      duration: 10
    });
    renderPlaylist();
  }

  function removeCue(index) {
    var playlist = getActivePlaylist();
    playlist.items.splice(index, 1);
    renderPlaylist();
  }

  function moveCue(index, delta) {
    var playlist = getActivePlaylist();
    var newIndex = index + delta;
    if (newIndex < 0 || newIndex >= playlist.items.length) return;
    var tmp = playlist.items[index];
    playlist.items[index] = playlist.items[newIndex];
    playlist.items[newIndex] = tmp;
    renderPlaylist();
  }

  /* ================= Medya yükleme ================= */

  function handleFileSelected(e) {
    var file = e.target.files[0];
    el.fileInput.value = "";
    if (!file || !pendingUploadCue) return;

    if (file.size > 45 * 1024 * 1024) {
      log("GitHub API tek dosyada ~45MB üzeri yüklemeyi desteklemez. Büyük videoları harici bir bağlantı (CDN/URL) olarak eklemeniz önerilir.", "err");
      pendingUploadCue = null;
      return;
    }

    log("Yükleniyor: " + file.name + " …", "");
    fileToBase64(file).then(function (b64) {
      var path = "media/" + Date.now() + "-" + slugify(file.name);
      var body = {
        message: "Medya eklendi: " + file.name,
        content: b64,
        branch: state.repo.branch
      };
      return githubApi("contents/" + path, { method: "PUT", body: JSON.stringify(body) })
        .then(function (res) {
          if (!res.ok) return res.text().then(function (t) { throw new Error("HTTP " + res.status + ": " + t); });
          pendingUploadCue.item.src = path;
          pendingUploadCue.srcInput.value = path;
          log("Medya yüklendi: " + path, "ok");
          pendingUploadCue = null;
        });
    }).catch(function (err) {
      log("Yükleme hatası: " + err.message, "err");
      pendingUploadCue = null;
    });
  }

  function fileToBase64(file) {
    return file.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf);
      var chunkSize = 0x8000;
      var binary = "";
      for (var i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    });
  }

  /* ================= TV URL yardımcı ================= */

  function renderTvUrl() {
    var base = el.inPagesBase.value.trim().replace(/\/$/, "");
    if (!base || !state.activeGroupId) {
      el.tvUrlResult.textContent = "";
      return;
    }
    el.tvUrlResult.textContent = base + "/player.html?grup=" + state.activeGroupId;
  }

  function copyTvUrl() {
    var text = el.tvUrlResult.textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
      log("TV adresi panoya kopyalandı.", "ok");
    });
  }

  /* ================= Yardımcılar ================= */

  function toggleModal(modalEl, show) {
    modalEl.classList.toggle("show", show);
    if (show && modalEl === el.tvModal) renderTvUrl();
  }

  function setTally(live) {
    el.tally.classList.toggle("live", live);
  }

  function log(msg, level) {
    var line = document.createElement("div");
    if (level) line.className = level;
    line.textContent = "› " + msg;
    el.log.appendChild(line);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function slugify(str) {
    return str.toLowerCase()
      .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
      .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var chunkSize = 0x8000;
    var binary = "";
    for (var i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToUtf8(b64) {
    var binary = atob(b64.replace(/\n/g, ""));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

})();
