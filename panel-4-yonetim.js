// ══════════════════════════════════════════════════════════════════════════════
// KULLANICI YÖNETİMİ
// ══════════════════════════════════════════════════════════════════════════════
// _usersCache: Users sekmesinden çekilen [{username, tabs:[...]}] listesi (admin
// hariç). Şifreler güvenlik nedeniyle sunucudan geri okunmaz; sadece admin yeni
// bir şifre belirlediğinde sunucuya gönderilir, aksi halde mevcut şifre korunur.
// NOT: _usersCache ve _editingUsername artık dosyanın ÜSTÜNDE (global değişkenler
// bölümünde) tanımlanıyor — bu fonksiyonlar dosyanın altında olsa da, sayfa açılışında
// üst seviyede çağrılan renderDashboard() → renderTeamManagersSection() zinciri bu
// değişkene erişiyor; let ile alttaki bir tanım kullanılırsa TDZ (Temporal Dead Zone)
// ReferenceError'a yol açar.

// Kullanıcı adını ("fatma.dogan", "ali_kirna" gibi) okunabilir bir görünen
// ada çevirir: noktalar/alt çizgiler boşluğa dönüştürülür ve her kelimenin
// ilk harfi büyütülür. "fatma.dogan" → "Fatma Dogan".
function _formatDisplayName(username) {
  if (!username) return username;
  return String(username)
    .split(/[._\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toLocaleUpperCase('tr-TR') + part.slice(1).toLocaleLowerCase('tr-TR'))
    .join(' ');
}

function _escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function loadAndRenderUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  const t = translations[currentLang] || translations.tr;

  // Sadece admin bu sayfayı yönetebilir
  if (currentUser && !currentUser.isAdmin) {
    tbody.innerHTML = `<tr><td colspan="3" style="padding:18px;text-align:center;color:var(--red)">⛔ Bu sayfaya yalnızca admin erişebilir.</td></tr>`;
    return;
  }

  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token) {
    tbody.innerHTML = `<tr><td colspan="3" style="padding:18px;text-align:center;color:var(--red)">⚠️ Google Sheets bağlantısı yapılandırılmamış. Klasman Yönetimi → Bağlantı Ayarları.</td></tr>`;
    return;
  }

  tbody.innerHTML = `<tr><td colspan="3" style="padding:18px;text-align:center;color:var(--muted)">${t.loading}</td></tr>`;

  try {
    const data = await jsonpFetch(url, { action: 'getUsers', token });
    if (data.status === 'ok') {
      _usersCache = (data.users || []).map(u => ({ username: u.username, tabs: u.tabs || [], team: u.team || [] }));
    } else {
      _usersCache = [];
    }
  } catch(e) {
    _usersCache = [];
    tbody.innerHTML = `<tr><td colspan="3" style="padding:18px;text-align:center;color:var(--red)">❌ ${e.message}</td></tr>`;
    return;
  }
  renderUsersTable();
}

function renderUsersTable() {
  const tbody = document.getElementById('users-tbody');
  const sayac = document.getElementById('users-sayac');
  if (!tbody) return;
  const t = translations[currentLang] || translations.tr;

  if (sayac) sayac.textContent = (1 + _usersCache.length) + ' kullanıcı';

  let rows = `
    <tr style="border-bottom:1px solid var(--border2)">
      <td style="padding:10px;font-weight:700;color:var(--navy)">👑 admin</td>
      <td style="padding:10px;color:var(--muted);font-size:12px">${t.admin_row_note}</td>
      <td style="padding:10px;text-align:right;color:var(--muted);font-size:11px">—</td>
    </tr>`;

  if (!_usersCache.length) {
    rows += `<tr><td colspan="3" style="padding:18px;text-align:center;color:var(--muted)">${t.no_users}</td></tr>`;
  } else {
    _usersCache.forEach(u => {
      const tabLabels = (u.tabs || []).map(tid => {
        const found = ASSIGNABLE_TABS.find(a => a.id === tid);
        return found ? found.label : tid;
      });
      const badges = tabLabels.length
        ? tabLabels.map(l => `<span style="display:inline-block;background:var(--lblue2);color:var(--blue);border-radius:99px;padding:2px 9px;font-size:11px;margin:2px">${_escapeHtml(l)}</span>`).join('')
        : `<span style="color:var(--muted);font-size:11px">—</span>`;
      const safeUser = _escapeHtml(u.username);
      rows += `
        <tr style="border-bottom:1px solid var(--border2)">
          <td style="padding:10px;font-weight:600;color:var(--navy);font-family:'DM Mono',monospace">${safeUser}</td>
          <td style="padding:10px">${badges}</td>
          <td style="padding:10px;text-align:right;white-space:nowrap">
            <button class="btn btn-sm" onclick="openUserModal('${safeUser}')">${t.edit_btn}</button>
            <button class="btn btn-sm btn-warning" style="margin-left:6px" onclick="deleteUserConfirm('${safeUser}')">${t.delete_btn}</button>
          </td>
        </tr>`;
    });
  }
  tbody.innerHTML = rows;
}

// ── Kullanıcı Ekle/Düzenle Modalı ────────────────────────────────────────────
function openUserModal(username) {
  const t = translations[currentLang] || translations.tr;
  _editingUsername = username || null;

  const titleEl   = document.getElementById('user-modal-title');
  const userInput = document.getElementById('user-modal-username');
  const pwInput   = document.getElementById('user-modal-password');
  const pwHint    = document.getElementById('user-modal-pw-hint');
  const tabsBox   = document.getElementById('user-modal-tabs');

  let selectedTabs = [];
  if (_editingUsername) {
    const u = _usersCache.find(x => x.username === _editingUsername);
    selectedTabs = (u && u.tabs) || [];
    titleEl.textContent = '✏️ Kullanıcıyı Düzenle: ' + _editingUsername;
    userInput.value = _editingUsername;
    userInput.disabled = true;
    pwInput.placeholder = '••••••';
    pwHint.textContent = t.password_hint_edit;
  } else {
    titleEl.textContent = '✨ ' + t.add_user;
    userInput.value = '';
    userInput.disabled = false;
    pwInput.placeholder = '••••••';
    pwHint.textContent = t.password_hint;
  }
  pwInput.value = '';

  // Sekme checkbox'larını oluştur (Dashboard hariç — herkese açık)
  tabsBox.innerHTML = ASSIGNABLE_TABS.filter(tb => tb.id !== 'dashboard').map(tb => {
    const checked = selectedTabs.includes(tb.id) ? 'checked' : '';
    return `
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;user-select:none">
        <input type="checkbox" class="user-modal-tab-cb" value="${tb.id}" ${checked} style="width:15px;height:15px;margin:0;cursor:pointer;accent-color:var(--blue2)">
        <span>${_escapeHtml(tb.label)}</span>
      </label>`;
  }).join('');

  document.getElementById('user-modal').classList.add('open');
  setTimeout(() => userInput.disabled ? pwInput.focus() : userInput.focus(), 80);
}

function closeUserModal() {
  document.getElementById('user-modal').classList.remove('open');
  _editingUsername = null;
}

async function saveUserFromModal() {
  const userInput = document.getElementById('user-modal-username');
  const pwInput   = document.getElementById('user-modal-password');
  const tabs = [...document.querySelectorAll('.user-modal-tab-cb')]
    .filter(cb => cb.checked).map(cb => cb.value);

  const username = (userInput.value || '').trim().toLowerCase();
  const password = pwInput.value || '';

  if (!_editingUsername) {
    // ── Yeni kullanıcı ──
    if (!username) { alert('Kullanıcı adı boş olamaz!'); return; }
    if (!/^[a-z0-9._]{3,40}$/.test(username)) {
      alert('Kullanıcı adı sadece küçük harf, rakam, nokta(.) ve alt çizgi(_) içerebilir.\nÖrnek: ahmet.ornek');
      return;
    }
    if (username === 'admin') { alert('"admin" kullanıcı adı sistem tarafından kullanılıyor, başka bir ad seçin.'); return; }
    if (_usersCache.some(u => u.username.toLowerCase() === username)) {
      alert('Bu kullanıcı adı zaten kullanılıyor!'); return;
    }
    if (!password || password.length < 4) { alert('Şifre en az 4 karakter olmalı!'); return; }

    _usersCache.push({ username, tabs, _newPassword: password });
  } else {
    // ── Mevcut kullanıcıyı düzenle ──
    const u = _usersCache.find(x => x.username === _editingUsername);
    if (!u) { alert('Kullanıcı bulunamadı!'); closeUserModal(); return; }
    if (password && password.length < 4) { alert('Şifre en az 4 karakter olmalı!'); return; }
    u.tabs = tabs;
    if (password) u._newPassword = password;
  }

  await _pushUsersToSheets();
  closeUserModal();
  renderUsersTable();
}

async function deleteUserConfirm(username) {
  if (!confirm(`"${username}" kullanıcısını silmek istediğinize emin misiniz?`)) return;
  _usersCache = _usersCache.filter(u => u.username !== username);
  await _pushUsersToSheets();
  renderUsersTable();
}

// Tüm kullanıcı listesini Sheets'teki Users sekmesine gönderir.
// Şifre alanı sadece yeni belirlenmişse doldurulur; aksi halde boş bırakılır
// ve sunucu mevcut şifreyi korur (bkz. _writeUsers, panel-v1-gs).
async function _pushUsersToSheets() {
  if (SHEETS_DEVRE_DISI) { alert('⚠️ Google Sheets bağlantısı devre dışı bırakıldı — kullanıcı yönetimi şu anda kullanılamıyor.'); return; }
  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token) { alert('⚠️ Google Sheets bağlantısı yapılandırılmamış!'); return; }

  const payload = _usersCache.map(u => ({
    username: u.username,
    password: u._newPassword || '',
    tabs: u.tabs || []
  }));

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'setUsers', token, users: payload }),
      mode: 'no-cors'
    });
    // Gönderildikten sonra geçici şifreleri temizle (tekrar gönderilmesin)
    _usersCache.forEach(u => { delete u._newPassword; });
    showSuccessMessage('✅ Kullanıcılar Sheets\'e gönderildi');
  } catch(err) {
    alert('❌ Gönderme hatası: ' + err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// EKİP YÖNETİMİ (Dashboard — "Ekibim")
// ══════════════════════════════════════════════════════════════════════════════
// Her ekip yöneticisi (admin olmayan kullanıcı), inspector listesinden kendi
// ekibini seçer. Ekip bilgisi Users sayfasının "Team" sütununda saklanır ve
// currentUser.team içinde (virgülle ayrılmış değil, dizi olarak) tutulur.

// performansData içinden, verilen ekip listesine (kullanıcı adları) ait
// inspectorleri, hedef verimliliğe göre normalize edilmiş "performans" alanı
// eklenmiş olarak döndürür. Genel amaçlı: hem "Ekibim" kartı hem de admin'in
// "Ekip Yöneticileri" bölümü tarafından kullanılır.
function getInspectorsForTeam(teamArr) {
  const teamSet = new Set((teamArr || []).map(n => String(n).toLowerCase()));
  if (!teamSet.size) return [];
  const hedef = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);
  return performansData
    .filter(i => teamSet.has((i.ins || '').toLowerCase()))
    .map(inspector => {
      // "Ne ödül ne ceza": nötr kayıp zaman mesai süresinden düşülüp
      // performans buna göre hesaplanır — Dashboard ile tutarlı olması için.
      const _stdSnT = inspector.standartSure || 0;
      let _mesSnT = inspector.mesaiSure || 0;
      const _kzSnT = getNotrKayipDakikaForInspector(inspector.ins) * 60;
      if (_kzSnT > 0 && _mesSnT > _kzSnT) _mesSnT -= _kzSnT;
      const _hamPT = (_stdSnT > 0 && _mesSnT > 0)
        ? Math.round((_stdSnT / _mesSnT) * 100) : inspector.genelHizPerf;
      return {
        ...inspector,
        performans: (_hamPT !== null && _hamPT !== undefined)
          ? Math.round(_hamPT * (100 / hedef)) : 0
      };
    });
}

// performansData içinden, hedef verimliliğe göre normalize edilmiş "performans"
// alanı eklenmiş ekip üyelerini döndürür.
function getTeamInspectors() {
  if (!currentUser || currentUser.isAdmin) return [];
  return getInspectorsForTeam(currentUser.team || []);
}

// ══════════════════════════════════════════════════════════════════════════════
// EKİBİM ANALİZİ — Ekip yöneticisi için ekip üyeleri arası karşılaştırma
// ══════════════════════════════════════════════════════════════════════════════
function renderEkipAnaliz() {
  const container = document.getElementById('ekip-analiz-icerik');
  if (!container) return;
  const t = translations[currentLang] || translations.tr;

  const teamInspectors = getTeamInspectors();

  if (!performansData.length || !teamInspectors.length) {
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🧑‍🤝‍🧑</div>
        <h3>${t.waiting_data}</h3>
        <p>${t.waiting_data_sub}</p>
      </div>
    `;
    return;
  }

  // ── 1) Genel sıralama: performansa göre yüksekten alçağa ──────────────────
  const siraliUyeler = [...teamInspectors].sort((a, b) => (b.performans || 0) - (a.performans || 0));

  const genelSiraHtml = siraliUyeler.map((ins, idx) => {
    const klasmanSayisi = Object.keys(ins.klasmanlar || {}).length;
    const perfClass = getPerformanceClass(ins.performans || 0);
    const madalya = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1) + '.';
    return `
      <tr>
        <td style="padding:10px 12px;font-weight:700;color:var(--muted);width:36px;text-align:center">${madalya}</td>
        <td style="padding:10px 12px;font-weight:600;color:var(--navy)">${_escapeHtml(_formatDisplayName(ins.ins))}</td>
        <td style="padding:10px 12px;text-align:center"><span class="${perfClass}" style="font-weight:700;font-family:'DM Mono',monospace">${ins.performans || 0}%</span></td>
        <td style="padding:10px 12px;text-align:center;font-family:'DM Mono',monospace;color:var(--navy)">${formatTR((ins.adet || 0))}</td>
        <td style="padding:10px 12px;text-align:center;font-family:'DM Mono',monospace;color:var(--muted)">${klasmanSayisi}</td>
      </tr>
    `;
  }).join('');

  // ── 2) Performans Dağılımı: ekip üyelerini bantlara ayır ──────────────────
  const bantlar = {
    good:      { key: 'good',      label: t.perf_good,      color: 'var(--blue)',  bg: 'var(--lblue3)', count: 0 },
    average:   { key: 'average',   label: t.perf_average,   color: 'var(--amber)', bg: 'var(--lamber)', count: 0 },
    weak:      { key: 'weak',      label: t.perf_weak,      color: '#EF5350',      bg: '#FFEBEE',       count: 0 },
    verypoor:  { key: 'verypoor',  label: t.perf_verypoor,  color: '#B71C1C',      bg: '#FFCDD2',       count: 0 }
  };
  teamInspectors.forEach(ins => {
    const p = ins.performans || 0;
    if (p >= 85) bantlar.good.count++;
    else if (p >= 70) bantlar.average.count++;
    else if (p >= 50) bantlar.weak.count++;
    else bantlar.verypoor.count++;
  });
  const maxBantSayisi = Math.max(1, ...Object.values(bantlar).map(b => b.count));

  const dagilimHtml = Object.values(bantlar).map(b => {
    const yuzde = Math.round((b.count / teamInspectors.length) * 100);
    const barYuzde = Math.round((b.count / maxBantSayisi) * 100);
    return `
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:90px;font-size:12px;font-weight:600;color:var(--navy);flex-shrink:0">${b.label}</div>
        <div style="flex:1;background:var(--offwhite);border-radius:6px;height:22px;overflow:hidden">
          <div style="height:100%;width:${barYuzde}%;background:${b.color};border-radius:6px;transition:width .3s"></div>
        </div>
        <div style="width:70px;text-align:right;font-size:12px;font-family:'DM Mono',monospace;color:var(--muted);flex-shrink:0">${b.count} (${yuzde}%)</div>
      </div>
    `;
  }).join('');

  // ── 3) Verimlilik/Adet Dağılımı: ekip üretiminin üyeler arasındaki payı ────
  const ekipToplamAdet = teamInspectors.reduce((s, i) => s + (i.adet || 0), 0);
  const uretimSirali = [...teamInspectors].sort((a, b) => (b.adet || 0) - (a.adet || 0));
  const maxUyeAdet = Math.max(1, ...uretimSirali.map(i => i.adet || 0));

  const uretimDagilimHtml = uretimSirali.map(ins => {
    const adet = ins.adet || 0;
    const gunSayisi = ins.gunSayisi || 0;
    const gunlukOrt = gunSayisi > 0 ? Math.round(adet / gunSayisi) : 0;
    const pay = ekipToplamAdet > 0 ? Math.round((adet / ekipToplamAdet) * 100) : 0;
    const barYuzde = Math.round((adet / maxUyeAdet) * 100);
    const perfClass = getPerformanceClass(ins.performans || 0);
    return `
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:130px;font-size:12px;font-weight:600;color:var(--navy);flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${_escapeHtml(_formatDisplayName(ins.ins))}">${_escapeHtml(_formatDisplayName(ins.ins))}</div>
        <div style="flex:1;background:var(--offwhite);border-radius:6px;height:22px;overflow:hidden">
          <div class="${perfClass}" style="height:100%;width:${barYuzde}%;background:currentColor;border-radius:6px;transition:width .3s"></div>
        </div>
        <div style="width:64px;text-align:center;font-size:11px;font-family:'DM Mono',monospace;color:var(--muted);flex-shrink:0">📅 ${gunSayisi} ${t.days_suffix}</div>
        <div style="width:80px;text-align:right;font-size:11px;font-family:'DM Mono',monospace;color:var(--muted);flex-shrink:0" title="${t.ekip_analiz_daily_avg}">⌀ ${formatTR(gunlukOrt)}/${t.days_suffix_short}</div>
        <div style="width:120px;text-align:right;font-size:12px;font-family:'DM Mono',monospace;color:var(--muted);flex-shrink:0">${formatTR(adet)} (${pay}%)</div>
      </div>
    `;
  }).join('');

  // ── 4) En çok üretim yapan üye ─────────────────────────────────────────────
  const enCokUretim = [...teamInspectors].sort((a, b) => (b.adet || 0) - (a.adet || 0))[0];

  // ── Genel ekip özeti ─────────────────────────────────────────────────────
  const toplamAdet = teamInspectors.reduce((s, i) => s + (i.adet || 0), 0);
  const ortPerf = Math.round(teamInspectors.reduce((s, i) => s + (i.performans || 0), 0) / teamInspectors.length);

  container.innerHTML = `
    <!-- Üst özet kartları -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:20px">
      <div class="summary-stat">
        <div class="summary-stat-value">${teamInspectors.length}</div>
        <div class="summary-stat-label">${t.team_manager_member_count}</div>
      </div>
      <div class="summary-stat" style="background:linear-gradient(135deg,var(--lgreen) 0%,#fff 100%);border-color:#B2DFDB">
        <div class="summary-stat-value" style="color:${getProgressColor(ortPerf)}">${ortPerf}%</div>
        <div class="summary-stat-label">${t.team_avg_perf}</div>
      </div>
      <div class="summary-stat" style="background:linear-gradient(135deg,var(--lamber) 0%,#fff 100%);border-color:#FFE082">
        <div class="summary-stat-value" style="color:var(--amber)">${formatTR(toplamAdet)}</div>
        <div class="summary-stat-label">${t.team_manager_total_qty}</div>
      </div>
      <div class="summary-stat" style="background:linear-gradient(135deg,var(--lblue3) 0%,#fff 100%);border-color:var(--lblue)">
        <div class="summary-stat-value" style="font-size:18px;color:var(--blue)">🏅 ${_escapeHtml(_formatDisplayName(enCokUretim.ins))}</div>
        <div class="summary-stat-label">${t.ekip_analiz_top_producer} · ${formatTR((enCokUretim.adet || 0))}</div>
      </div>
    </div>

    <!-- Genel sıralama tablosu -->
    <div style="background:#fff;border:1px solid var(--border2);border-radius:12px;overflow:hidden;margin-bottom:20px">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border2);font-weight:700;color:var(--navy)">
        🏆 ${t.ekip_analiz_general_ranking}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f8f9fa">
            <th style="padding:8px 12px;text-align:center;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">#</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">${t.ekip_analiz_col_name}</th>
            <th style="padding:8px 12px;text-align:center;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">${t.ekip_analiz_col_perf}</th>
            <th style="padding:8px 12px;text-align:center;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">${t.ekip_analiz_col_qty}</th>
            <th style="padding:8px 12px;text-align:center;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">${t.ekip_analiz_col_klasman_count}</th>
          </tr>
        </thead>
        <tbody>${genelSiraHtml}</tbody>
      </table>
    </div>

    <!-- Performans Dağılımı -->
    <div style="background:#fff;border:1px solid var(--border2);border-radius:12px;padding:16px;margin-bottom:20px">
      <div style="font-weight:700;color:var(--navy);margin-bottom:12px">📊 ${t.ekip_analiz_dist_title}</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${dagilimHtml}
      </div>
    </div>

    <!-- Verimlilik/Adet Dağılımı -->
    <div style="background:#fff;border:1px solid var(--border2);border-radius:12px;padding:16px;margin-bottom:8px">
      <div style="font-weight:700;color:var(--navy);margin-bottom:12px">📦 ${t.ekip_analiz_uretim_title}</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${uretimDagilimHtml}
      </div>
    </div>
  `;
}

// Admin görünümünde, her ekip yöneticisi için özet kart oluşturur:
// kullanıcı adı, çalışan sayısı, toplam kontrol edilen adet ve performans
// ortalaması. _usersCache'teki "team" alanına sahip (admin olmayan)
// kullanıcılar üzerinden çalışır.
// (tasindi: _teamManagersOpen artik dosyanin basinda tanimli)

function toggleTeamManagersSection() {
  _teamManagersOpen = !_teamManagersOpen;
  const grid = document.getElementById('team-managers-grid');
  const chevron = document.getElementById('team-managers-chevron');
  if (grid) grid.style.display = _teamManagersOpen ? '' : 'none';
  if (chevron) chevron.style.transform = _teamManagersOpen ? 'rotate(90deg)' : 'rotate(0deg)';
}

async function renderTeamManagersSection() {
  const section = document.getElementById('team-managers-section');
  const grid = document.getElementById('team-managers-grid');
  if (!section || !grid) return;

  const isAdmin = !currentUser || currentUser.isAdmin;
  if (!isAdmin || !performansData.length) {
    section.style.display = 'none';
    return;
  }

  // _usersCache henüz yüklenmediyse (Kullanıcılar sekmesine girilmemiş olabilir),
  // sessizce yükle.
  if (!_usersCache.length) {
    await _silentLoadUsersCache();
  }

  const managers = _usersCache.filter(u => (u.team || []).length > 0);
  if (!managers.length) {
    section.style.display = 'none';
    return;
  }

  const countLbl = document.getElementById('team-managers-count');
  if (countLbl) countLbl.textContent = `${managers.length} ekip`;

  // Mevcut açık/kapalı durumunu koru (varsayılan: kapalı)
  grid.style.display = _teamManagersOpen ? '' : 'none';
  const chevron = document.getElementById('team-managers-chevron');
  if (chevron) chevron.style.transform = _teamManagersOpen ? 'rotate(90deg)' : 'rotate(0deg)';

  const t = translations[currentLang] || translations.tr;

  grid.innerHTML = managers.map(mgr => {
    const teamInspectors = getInspectorsForTeam(mgr.team);
    const total = teamInspectors.length;
    const totalAdet = teamInspectors.reduce((s, i) => s + (i.adet || 0), 0);
    const avgPerf = total > 0
      ? Math.round(teamInspectors.reduce((s, i) => s + (i.performans || 0), 0) / total)
      : 0;

    const perfColor = getProgressColor(avgPerf);

    return `
      <div class="card team-manager-card" style="margin-bottom:0;overflow:hidden">
        <div class="card-header" style="background:linear-gradient(135deg,var(--navy) 0%,var(--navy2) 100%);border-bottom:none;padding:10px 14px">
          <h2 style="color:#fff;gap:8px;font-size:12px">
            <span style="background:rgba(255,255,255,.12);border-radius:6px;padding:3px 6px;font-size:12px">🧑‍💼</span>
            <span>${t.team_manager_prefix}: ${_escapeHtml(_formatDisplayName(mgr.username))}</span>
          </h2>
        </div>
        <div class="card-body" style="padding:12px 14px">
          ${total > 0 ? `
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
              <div style="text-align:center;padding:8px 4px;border-radius:8px;background:var(--lblue3);border:1px solid var(--border2)">
                <div style="font-size:18px;font-weight:700;color:var(--navy);font-family:'DM Mono',monospace;line-height:1">${total}</div>
                <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:600;margin-top:4px">${t.team_manager_member_count}</div>
              </div>
              <div style="text-align:center;padding:8px 4px;border-radius:8px;background:var(--lamber);border:1px solid #FFE082">
                <div style="font-size:18px;font-weight:700;color:var(--amber);font-family:'DM Mono',monospace;line-height:1">${formatTR(totalAdet)}</div>
                <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:600;margin-top:4px">${t.team_manager_total_qty}</div>
              </div>
              <div style="text-align:center;padding:8px 4px;border-radius:8px;background:var(--lgreen);border:1px solid #B2DFDB">
                <div style="font-size:18px;font-weight:700;color:${perfColor};font-family:'DM Mono',monospace;line-height:1">${avgPerf}%</div>
                <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:600;margin-top:4px">${t.team_manager_avg_perf}</div>
              </div>
            </div>
          ` : `
            <div style="text-align:center;color:var(--muted);font-size:12px;padding:4px 0">${t.team_manager_no_members}</div>
          `}
        </div>
      </div>
    `;
  }).join('');

  section.style.display = '';
}

// _usersCache'i (Kullanıcılar sekmesine girmeden) sessizce doldurur.
// Hata olursa _usersCache boş bırakılır; section gizli kalır.
async function _silentLoadUsersCache() {
  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token) return;
  try {
    const data = await jsonpFetch(url, { action: 'getUsers', token });
    if (data.status === 'ok') {
      _usersCache = (data.users || []).map(u => ({ username: u.username, tabs: u.tabs || [], team: u.team || [] }));
    }
  } catch(e) {
    console.warn('_silentLoadUsersCache hatası:', e.message);
  }
}

// "Ekibim" kartını (özet istatistikler + üye listesi) çizer.
// Admin için kart zaten gizlidir (applyUserPermissions), burada sadece veriyi günceller.
function renderTeamSection() {
  const card = document.getElementById('my-team-card');
  if (!card) return;
  if (!currentUser || currentUser.isAdmin) return;

  const t = translations[currentLang] || translations.tr;
  const teamInspectors = getTeamInspectors();
  const total = teamInspectors.length;

  const avgPerf = total > 0
    ? Math.round(teamInspectors.reduce((s, i) => s + (i.performans || 0), 0) / total)
    : 0;
  const totalProducts = teamInspectors.reduce((s, i) => s + (i.adet || 0), 0);
  const avgDays = total > 0
    ? Math.round(teamInspectors.reduce((s, i) => s + (i.gunSayisi || 0), 0) / total)
    : 0;

  const elMembers  = document.getElementById('team-total-members');
  const elAvgPerf  = document.getElementById('team-avg-perf');
  const elProducts = document.getElementById('team-total-products');
  const elAvgDays  = document.getElementById('team-avg-days');
  if (elMembers)  elMembers.textContent  = total;
  if (elAvgPerf)  elAvgPerf.textContent  = avgPerf + '%';
  if (elProducts) elProducts.textContent = formatTR(totalProducts);
  if (elAvgDays)  elAvgDays.textContent  = avgDays + ' ' + t.days_suffix;


  const listEl = document.getElementById('team-members-list');
  if (!listEl) return;

  if (!total) {
    listEl.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px;width:100%">${t.team_empty_hint}</div>`;
    return;
  }

  listEl.innerHTML = teamInspectors
    .sort((a, b) => (b.performans || 0) - (a.performans || 0))
    .map(i => {
      const perf  = i.performans || 0;
      const color = getProgressColor(perf);
      const ini   = (i.ins || '').split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
      const safeName = _escapeHtml(i.ins);
      const jsName   = safeName.replace(/'/g, "\\'");
      return `
        <div class="team-member-chip">
          <div class="avatar">${ini}</div>
          <div style="flex:1;min-width:0;cursor:pointer" onclick="showInspectorDetail('${jsName}')">
            <div class="tm-name">${safeName}</div>
            <div class="tm-perf" style="color:${color}">${perf}%</div>
          </div>
          <button class="tm-remove" title="${t.remove_from_team}" onclick="removeFromTeam('${jsName}')">✕</button>
        </div>`;
    }).join('');
}

// Ekipten bir inspector çıkarır (admin dede yetkisi gibi değil — sadece kendi ekibi).
async function removeFromTeam(name) {
  if (!currentUser || currentUser.isAdmin) return;
  const t = translations[currentLang] || translations.tr;
  if (!confirm(`"${name}" ${t.team_remove_confirm}`)) return;
  currentUser.team = (currentUser.team || []).filter(n => n !== name);
  try { localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser)); } catch(e) {}
  renderTeamSection();
  await _pushTeamToSheets();
}

// currentUser.team listesini Sheets'teki Users sayfasına gönderir (tek satır günceller).
async function _pushTeamToSheets() {
  if (SHEETS_DEVRE_DISI) return;
  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token || !currentUser) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'setUserTeam', token, username: currentUser.username, team: currentUser.team || [] }),
      mode: 'no-cors'
    });
  } catch(err) {
    console.warn('Ekip güncelleme hatası:', err.message);
  }
}

// ── Diğer Ekipler Popup ──────────────────────────────────────────────────────
async function toggleDigerEkipler(e) {
  e.stopPropagation();
  const popup = document.getElementById('diger-ekipler-popup');
  const btn   = document.getElementById('btn-diger-ekipler');
  if (!popup) return;
  const isOpen = popup.style.display !== 'none';
  if (isOpen) { popup.style.display = 'none'; return; }

  const t = translations[currentLang] || translations.tr;
  const liste = document.getElementById('diger-ekipler-liste');

  // Popup'ı hemen aç, yükleniyorsa göster
  liste.innerHTML = `<div style="padding:10px 14px;font-size:12px;color:var(--muted)">⏳ Yükleniyor...</div>`;
  popup.style.display = '';

  // Buton konumuna göre popup'ı konumlandır (position:fixed, kart taşmasından bağımsız)
  if (btn) {
    const rect = btn.getBoundingClientRect();
    const popupWidth = Math.min(280, window.innerWidth * 0.9);
    let left = rect.right - popupWidth;
    if (left < 8) left = 8;
    let top = rect.bottom + 8;
    // Eğer popup ekranın altına taşıyorsa, butonun üstüne aç
    const estimatedHeight = Math.min(360, window.innerHeight * 0.6);
    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - estimatedHeight - 8);
    }
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
  }

  // Cache boşsa bekleyerek yükle
  if (!_usersCache.length) await _silentLoadUsersCache();

  const myUsername = currentUser?.username || '';
  const managers = _usersCache.filter(u => u.username !== myUsername && (u.team || []).length > 0);

  if (!managers.length) {
    liste.innerHTML = `<div style="padding:10px 14px;font-size:12px;color:var(--muted)">${t.other_teams_empty}</div>`;
    return;
  }

  liste.innerHTML = managers.map(mgr => {
    const members = getInspectorsForTeam(mgr.team);
    const avgPerf = members.length
      ? Math.round(members.reduce((s, i) => s + (i.performans || 0), 0) / members.length)
      : null;
    const perfColor = avgPerf === null ? 'var(--muted)' : getProgressColor(avgPerf);
    const perfStr = avgPerf !== null
      ? `<span style="font-weight:700;color:${perfColor};font-family:'DM Mono',monospace">${avgPerf}%</span>`
      : `<span style="color:var(--muted);font-size:11px">—</span>`;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid var(--border2)">
        <span style="font-size:13px;font-weight:600;color:var(--navy)">${_escapeHtml(_formatDisplayName(mgr.username))}</span>
        ${perfStr}
      </div>
    `;
  }).join('');
}

// ── Ekibimi Düzenle Modalı ───────────────────────────────────────────────────
let _teamModalSelection = new Set();

function openTeamModal() {
  if (!currentUser || currentUser.isAdmin) return;
  if (!performansData.length) {
    alert('⚠️ Henüz performans verisi yok. Önce Performans Analizi sayfasından veri yükleyin.');
    return;
  }
  _teamModalSelection = new Set(currentUser.team || []);
  const searchEl = document.getElementById('team-modal-search');
  if (searchEl) searchEl.value = '';
  renderTeamModalList();
  document.getElementById('team-modal').classList.add('open');
}

function closeTeamModal() {
  document.getElementById('team-modal').classList.remove('open');
}

function renderTeamModalList() {
  const t = translations[currentLang] || translations.tr;
  const search = (document.getElementById('team-modal-search')?.value || '').toLowerCase();
  const listEl = document.getElementById('team-modal-list');
  if (!listEl) return;

  const hedef = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);
  const perfByName = {};
  performansData.forEach(i => {
    const p = i.verimlilikPerf !== null && i.verimlilikPerf !== undefined
      ? i.verimlilikPerf
      : (i.genelHizPerf !== null && i.genelHizPerf !== undefined ? Math.round(i.genelHizPerf * (100 / hedef)) : null);
    perfByName[i.ins] = p;
  });

  const names = [...new Set(performansData.map(i => i.ins))].sort((a, b) => a.localeCompare(b, 'tr'));
  const filtered = names.filter(n => n.toLowerCase().includes(search));

  if (!filtered.length) {
    listEl.innerHTML = `<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px">${t.team_no_result}</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(n => {
    const checked = _teamModalSelection.has(n) ? 'checked' : '';
    const safe = _escapeHtml(n);
    const jsName = safe.replace(/'/g, "\\'");
    const p = perfByName[n];
    const perfBadge = p !== null && p !== undefined
      ? `<span style="font-size:11px;font-weight:700;color:${getProgressColor(p)}">${p}%</span>`
      : `<span style="font-size:11px;color:var(--muted)">—</span>`;
    return `
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;cursor:pointer;padding:6px 8px;border-radius:6px;background:#fff;border:1px solid var(--border2)">
        <span style="display:flex;align-items:center;gap:8px;min-width:0">
          <input type="checkbox" ${checked} onchange="_teamModalToggle('${jsName}', this.checked)" style="width:15px;height:15px;margin:0;cursor:pointer;accent-color:var(--blue2);flex-shrink:0">
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${safe}</span>
        </span>
        ${perfBadge}
      </label>`;
  }).join('');
}

function _teamModalToggle(name, checked) {
  if (checked) _teamModalSelection.add(name);
  else _teamModalSelection.delete(name);
}

async function saveTeamFromModal() {
  currentUser.team = [..._teamModalSelection];
  try { localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser)); } catch(e) {}
  closeTeamModal();
  renderTeamSection();
  await _pushTeamToSheets();
  showSuccessMessage('✅ Ekibiniz güncellendi');
}

