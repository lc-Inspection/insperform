// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PERFORMANS TABLOSUNU localStorage/Sheets VERİSİNDEN RENDER ET
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Sheets'ten performans verisini çek ve tabloyu güncelle (performans sekmesi açıkken arka planda)
let _perfFetchInProgress = false;
async function autoFetchPerfIfNeeded() {
  if (_perfFetchInProgress) return;
  const url = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token) return;

  _perfFetchInProgress = true;
  try {
    const { performansData: pd } = await fetchPerformansRawPaginated(url, token);
    if (pd && pd.length > 0) {
      performansData = fixVerimlilikPerf(restorePerformansDateObjects(pd));
      // verimlilikPerf hedefVerimlilik'e göre yeniden hesaplandı
      saveData();
      renderPerfTabloFromData();
      renderDashboard();
      updateSidebar();
      showSuccessMessage('✅ ' + (translations[currentLang]||translations.tr).sheets_perf_updated + ' (' + performansData.length + ')', 3000);
    }
  } catch(e) {
    console.warn('Performans oto-çekme hatası:', e.message);
  }
  _perfFetchInProgress = false;
}

// ─── PERFORMANS TABLOSU SAYFALAMA STATE ───
let _perfPage = 1;
const _PERF_PER_PAGE = 20;

// performansData array'inden Inspector Performans Raporu tablosunu render eder
// Excel yüklenmeden, sadece kayıtlı/çekilen veriden tablo gösterir
function renderPerfTabloFromData(page) {
  const tablo = document.getElementById('perf-tablo');
  const empty = document.getElementById('perf-empty');
  if (!tablo || !empty) return;

  if (!performansData || !performansData.length) {
    tablo.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  if (page !== undefined) _perfPage = page;

  const hedef = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);
  // verimlilikPerf Sheets'ten geldiğinde doğru değerde — yeniden hesaplama

  const fmtSure = (sn) => {
    if (!sn) return '—';
    const s = Math.round(sn);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sc = s % 60;
    return h > 0
      ? `${h}s ${String(m).padStart(2,'0')}d`
      : `${m}d ${String(sc).padStart(2,'0')}sn`;
  };

  const ortPerformans = performansData.length > 0
    ? Math.round(performansData.reduce((s, r) => s + (r.genelHizPerf ?? 0), 0) / performansData.length) : 0;
  // "Ne ödül ne ceza": nötr kayıp zaman düşülmüş ham performans, CANLI Hedef
  // (inp-verimlilik) ile ölçeklenir — Dashboard kartlarındaki mantıkla aynı
  // (getDispPerf çağırmıyoruz çünkü o, inspector.hedefVerimlilik'teki olası
  // ESKİ/durağan hedefi kullanır; burada kullanıcının O AN girdiği hedef
  // canlı yansımalı).
  const _hamPerfDuzeltilmis = (r) => {
    const standartSn = r.standartSure || 0;
    let mesaiSn = r.mesaiSure || 0;
    const notrKayipSn = getNotrKayipDakikaForInspector(r.ins) * 60;
    if (notrKayipSn > 0 && mesaiSn > notrKayipSn) mesaiSn -= notrKayipSn;
    return (standartSn > 0 && mesaiSn > 0) ? Math.round((standartSn / mesaiSn) * 100) : r.genelHizPerf;
  };
  const ortVPerf = performansData.length > 0
    ? Math.round(performansData.reduce((s, r) => {
        const hp = _hamPerfDuzeltilmis(r);
        return s + (hp !== null && hp !== undefined ? Math.round(hp * (100 / hedef)) : 0);
      }, 0) / performansData.length) : 0;
  const ortalamaGun = performansData.length > 0
    ? Math.round(performansData.reduce((s, r) => s + (r.gunSayisi || 0), 0) / performansData.length) : 0;

  const vOrtEl = document.getElementById('verimlilik-ort');
  if (vOrtEl) {
    vOrtEl.textContent = ortVPerf + '%';
    vOrtEl.style.color = getProgressColor(ortVPerf);
  }

  // Sayfalama
  const totalPages = Math.ceil(performansData.length / _PERF_PER_PAGE);
  if (_perfPage > totalPages) _perfPage = totalPages;
  if (_perfPage < 1) _perfPage = 1;
  const startIdx = (_perfPage - 1) * _PERF_PER_PAGE;
  const pageData = performansData.slice(startIdx, startIdx + _PERF_PER_PAGE);

  const perfColorMap = {
    'perf-excellent': { bg: 'linear-gradient(135deg,#E8F5E9,#F1F8E9)', accent: '#00897B', badge: '#00897B', badgeTxt: '#fff', label: 'MÜKEMMEL' },
    'perf-good':      { bg: 'linear-gradient(135deg,#E3F2FD,#EEF7FF)', accent: '#1565C0', badge: '#1565C0', badgeTxt: '#fff', label: 'İYİ' },
    'perf-average':   { bg: 'linear-gradient(135deg,#FFF8E1,#FFFDE7)', accent: '#F57F17', badge: '#F57F17', badgeTxt: '#fff', label: 'ORTA' },
    'perf-weak':      { bg: 'linear-gradient(135deg,#FFEBEE,#FFF3F3)', accent: '#EF5350', badge: '#EF5350', badgeTxt: '#fff', label: 'ZAYIF' },
    'perf-verypoor':  { bg: 'linear-gradient(135deg,#FFCDD2,#FFEBEE)', accent: '#B71C1C', badge: '#B71C1C', badgeTxt: '#fff', label: 'ÇOK ZAYIF' },
    'perf-poor':      { bg: 'linear-gradient(135deg,#FFCDD2,#FFEBEE)', accent: '#B71C1C', badge: '#B71C1C', badgeTxt: '#fff', label: 'ÇOK ZAYIF' }, // geriye dönük uyumluluk
  };

  const kartlar = pageData.map((row, idx) => {
    const globalIdx = startIdx + idx + 1;
    const ini = row.ins.split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
    const performans = row.genelHizPerf ?? 0;
    const performansClass = getPerformanceClass(performans);
    const cm = perfColorMap[performansClass] || perfColorMap['perf-verypoor'];
    const _hpDuz = _hamPerfDuzeltilmis(row);
    const vPerfDisplay = _hpDuz !== null && _hpDuz !== undefined
      ? Math.round(_hpDuz * (100 / hedef)) : null;
    const vPerfClass = vPerfDisplay === null ? '' : getPerformanceClass(vPerfDisplay);
    const vcm = perfColorMap[vPerfClass] || cm;
    const tarihDurumu = (row.tarihBasariliKayit || 0) > 0
      ? `<span style="color:var(--green)">✅ ${row.tarihBasariliKayit}/${row.kayit}</span>`
      : `<span style="color:var(--amber)">⚠️ Tarih yok</span>`;
    const klasmanEntries = Object.entries(row.klasmanlar || {}).slice(0, 4);
    const klasmanBars = klasmanEntries.map(([k, v]) => {
      const kp = Math.round(v.hizPerf || 0);
      const kc = getProgressColor(kp);
      return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
        <div style="font-size:10px;color:var(--muted);width:70px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;">${k}</div>
        <div style="flex:1;height:5px;background:var(--border2);border-radius:3px;overflow:hidden;">
          <div style="width:${Math.min(100,kp)}%;height:100%;background:${kc};border-radius:3px;"></div>
        </div>
        <div style="font-size:10px;font-weight:700;color:${kc};min-width:28px;text-align:right;font-family:'DM Mono',monospace;">${kp}%</div>
      </div>`;
    }).join('');

    // Dairesel progress — pastada Düz. Performans gösterilir
    const displayPerf = vPerfDisplay !== null ? vPerfDisplay : performans;
    const displayCm   = vPerfDisplay !== null ? vcm : cm;
    const pAngle = Math.min(360, Math.round((Math.min(displayPerf, 150) / 150) * 360));

    return `
    <div style="background:${cm.bg};border:1.5px solid ${cm.accent}28;border-radius:14px;
      box-shadow:0 3px 16px ${cm.accent}1A;transition:transform .15s,box-shadow .15s;
      position:relative;overflow:hidden;display:flex;flex-direction:column;">
      <!-- Top accent bar -->
      <div style="height:4px;background:linear-gradient(90deg,${cm.accent},${cm.accent}88);border-radius:14px 14px 0 0;flex-shrink:0;"></div>

      <!-- Rank badge -->
      <div style="position:absolute;top:14px;right:14px;width:22px;height:22px;border-radius:50%;
        background:${cm.accent};color:#fff;display:flex;align-items:center;justify-content:center;
        font-size:9px;font-weight:700;font-family:'DM Mono',monospace;box-shadow:0 2px 6px ${cm.accent}44;">${globalIdx}</div>

      <!-- Header: avatar + isim + performans daire -->
      <div style="padding:14px 16px 12px;display:flex;align-items:center;gap:12px;">
        <div style="flex-shrink:0;">
          <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,${cm.accent},${cm.accent}CC);
            display:flex;align-items:center;justify-content:center;
            font-size:15px;font-weight:800;color:#fff;
            box-shadow:0 4px 12px ${cm.accent}44;border:2px solid rgba(255,255,255,.6);">
            ${ini}
          </div>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${row.ins}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">${row.gunSayisi || 0} gün · ${tarihDurumu}${azVeriMi(row.gunSayisi) ? ' ' + azVeriRozetiHtml('inline') : ''}</div>
          <div style="margin-top:5px;">
            <span style="font-size:9px;font-weight:700;background:${cm.badge};color:${cm.badgeTxt};
              padding:2px 7px;border-radius:8px;letter-spacing:.4px;">${cm.label}</span>
          </div>
        </div>
        <!-- Mini performans daire — sadece Düz. Performans -->
        <div style="flex-shrink:0;text-align:center;">
          <div style="width:64px;height:64px;border-radius:50%;
            background:conic-gradient(${displayCm.accent} ${pAngle}deg, #e2ecf8 0deg);
            display:flex;align-items:center;justify-content:center;
            box-shadow:0 2px 10px ${displayCm.accent}2A;">
            <div style="width:46px;height:46px;border-radius:50%;background:#fff;
              display:flex;flex-direction:column;align-items:center;justify-content:center;
              box-shadow:inset 0 1px 3px rgba(0,0,0,.07);">
              <div style="font-size:13px;font-weight:800;color:${displayCm.accent};font-family:'DM Mono',monospace;line-height:1;">${displayPerf}%</div>
              <div style="font-size:7px;color:var(--muted);letter-spacing:.4px;text-transform:uppercase;">perf</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats: 2×2 grid -->
      <div style="padding:0 16px 10px;display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        ${[
          ['📦','Adet',formatTR(row.adet||0)],
          ['📋','Kayıt',row.kayit||0],
          ['⏱','Standart',fmtSure(row.standartSure)],
          ['🕐','Mesai',fmtSure(row.mesaiSure) + (row.toplamMesaistiSaniye > 0 ? ` 🌙+${Math.round(row.toplamMesaistiSaniye/60)}dk` : '')]
        ].map(([ic,lb,val])=>`
          <div style="background:rgba(255,255,255,.75);border:1px solid var(--border2);border-radius:8px;
            padding:7px 8px;display:flex;align-items:center;gap:7px;">
            <span style="font-size:14px;">${ic}</span>
            <div>
              <div style="font-size:11px;font-weight:700;color:var(--navy);font-family:'DM Mono',monospace;line-height:1.2;">${val}</div>
              <div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;">${lb}</div>
            </div>
          </div>`).join('')}
      </div>

      <!-- Klasman bars -->
      <div style="padding:0 16px 14px;border-top:1px solid ${cm.accent}14;margin-top:2px;padding-top:10px;">
        ${klasmanBars || `<div style="font-size:10px;color:var(--muted2);font-style:italic;text-align:center;padding:4px 0;">Klasman verisi yok</div>`}
      </div>
    </div>`;
  }).join('');

  // Sayfalama butonları HTML
  const pageBtns = (() => {
    let html = '';
    for (let p = 1; p <= totalPages; p++) {
      const active = p === _perfPage;
      html += `<button onclick="renderPerfTabloFromData(${p})"
        style="min-width:30px;height:30px;border-radius:7px;border:1px solid ${active ? 'var(--blue2)' : 'var(--border)'};
        background:${active ? 'var(--blue2)' : 'var(--white)'};color:${active ? '#fff' : 'var(--navy)'};
        cursor:pointer;font-size:12px;font-weight:${active ? '700' : '500'};padding:0 6px;
        transition:all .12s;">${p}</button>`;
    }
    return html;
  })();

  const verimlilikBaslik = hedef !== 100
    ? `⚡ Düz. Performans <span style="font-size:9px;color:var(--amber)">(Hedef %${hedef})</span>`
    : `⚡ Düz. Performans`;

  tablo.innerHTML = `
    <!-- RAPOR BAŞLIĞI -->
    <div style="padding:18px 22px;border-bottom:1px solid var(--border2);background:linear-gradient(135deg,var(--lblue3) 0%,#fff 70%);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--navy);display:flex;align-items:center;gap:8px;">
            📊 Inspector Performans Raporu
            <span style="font-size:11px;font-weight:600;background:var(--blue2);color:#fff;padding:3px 10px;border-radius:99px;">${performansData.length} inspector</span>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px;display:flex;gap:16px;flex-wrap:wrap;">
            <span><span data-i18n="adj_avg_short">⚡ Adj. Avg.:</span> <strong style="color:var(--amber)">${ortVPerf}%</strong></span>
            <span>📅 <span data-i18n='raw_avg'>Ham Ort.:</span> <strong style="color:var(--muted)">${ortPerformans}%</strong></span>
            <span><span data-i18n="avg_work_days">📆 Avg. Working:</span> <strong style="color:var(--navy)">${ortalamaGun} gün</strong></span>
          </div>
          <div style="font-size:10px;color:var(--green);margin-top:4px;">
            ✅ <span data-i18n='perf_formula'>Std Duration ÷ (Days × 7.5h) × 100</span>
            ${hedef !== 100 ? `&nbsp;·&nbsp; <span style="color:var(--amber)">⚡ <span data-i18n='adj_formula'>Raw Perf × (100÷${hedef})</span></span>` : ''}
          </div>
        </div>
        <!-- Özet stat kutuları -->
        <div style="display:flex;gap:10px;flex-shrink:0;">
          ${[
            ['👍',(translations[currentLang]||translations.tr).perf_good,performansData.filter(r=>(r.genelHizPerf??0)>=85).length,'var(--blue)','var(--lblue2)'],
            ['⚠️',(translations[currentLang]||translations.tr).perf_average,performansData.filter(r=>{const p=r.genelHizPerf??0;return p>=70&&p<85}).length,'var(--amber)','var(--lamber)'],
            ['🔻',(translations[currentLang]||translations.tr).perf_weak,performansData.filter(r=>{const p=r.genelHizPerf??0;return p>=50&&p<70}).length,'#EF5350','#FFEBEE'],
            ['📉',(translations[currentLang]||translations.tr).perf_verypoor,performansData.filter(r=>(r.genelHizPerf??0)<50).length,'#B71C1C','#FFCDD2']
          ].map(([ic,lb,cnt,col,bg])=>`
            <div style="background:${bg};border:1px solid ${col}33;border-radius:10px;padding:10px 14px;text-align:center;min-width:54px;">
              <div style="font-size:16px;">${ic}</div>
              <div style="font-size:18px;font-weight:800;color:${col};font-family:'DM Mono',monospace;line-height:1;">${cnt}</div>
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;">${lb}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- KARTLAR: 3 sütunlu grid -->
    <div style="padding:18px 22px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
      ${kartlar || '<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--muted2);">Veri yok</div>'}
    </div>

    <!-- SAYFALAMA -->
    ${totalPages > 1 ? `
    <div style="padding:14px 22px 18px;border-top:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--offwhite);border-radius:0 0 var(--r) var(--r);">
      <button onclick="if(_perfPage>1)renderPerfTabloFromData(_perfPage-1)"
        ${_perfPage<=1?'disabled':''} class="pag-btn">← Önceki</button>
      <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;justify-content:center;">
        ${pageBtns}
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="pag-info">${startIdx+1}–${Math.min(startIdx+_PERF_PER_PAGE,performansData.length)} / ${performansData.length}</span>
        <button onclick="if(_perfPage<${totalPages})renderPerfTabloFromData(_perfPage+1)"
          ${_perfPage>=totalPages?'disabled':''} class="pag-btn">Sonraki →</button>
      </div>
    </div>` : ''}
  `;

  tablo.style.display = 'block';
  empty.style.display = 'none';
}


// ════════════════════════════════════════════════════════════════════════════════
// ÖRNEKLEME TABLOSU
// ════════════════════════════════════════════════════════════════════════════════

// Bir Alttan tablosu: =EĞER(R<=20;R; EĞER(R<=32;20; EĞER(R<=50;20; EĞER(R<=80;32; EĞER(R<=125;50;80)))))
// Bir Alttan örnekleme tablosu
// BakilacakMiktar aralığı → kontrol edilecek adet
// ≤13→13, ≤20→20, ≤32→32, ≤50→32, ≤80→50, ≤125→80, ≤200→125, >200→200
const ORNEKLEME_BIR = [
  { max: 13,       val: 13  },
  { max: 20,       val: 20  },
  { max: 32,       val: 32  },
  { max: 50,       val: 32  },
  { max: 80,       val: 50  },
  { max: 125,      val: 80  },
  { max: 200,      val: 125 },
  { max: Infinity, val: 200 }
];

// İki Alttan örnekleme tablosu
// ≤13→13, ≤20→20, ≤32→32, ≤50→32, ≤80→32, ≤125→50, ≤200→80, >200→125
const ORNEKLEME_IKI = [
  { max: 13,       val: 13  },
  { max: 20,       val: 20  },
  { max: 32,       val: 32  },
  { max: 50,       val: 32  },
  { max: 80,       val: 32  },
  { max: 125,      val: 50  },
  { max: 200,      val: 80  },
  { max: Infinity, val: 125 }
];

function orneklemeAdet(adet, mod) {
  if (mod === 'kapali' || !mod) return adet;
  const tablo = mod === 'bir' ? ORNEKLEME_BIR : ORNEKLEME_IKI;
  for (const basamak of tablo) {
    if (adet <= basamak.max) {
      return basamak.val === null ? adet : basamak.val;
    }
  }
  return adet;
}

// ════════════════════════════════════════════════════════════════════════════════
// TARİHE GÖRE FARKLI ÖRNEKLEME SEVİYELERİ (Dönemler)
// ════════════════════════════════════════════════════════════════════════════════
// Aynı Excel dosyasında, farklı tarih aralıkları için farklı örnekleme modu
// kullanılabilmesi sağlanır (örn. 1-15 Ocak Kapalı, 16-28 Ocak Bir Alttan,
// 29 Ocak - 28 Şubat İki Alttan). En fazla 10 dönem desteklenir.
// Her dönem: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', mode: 'kapali'|'bir'|'iki' }
// ÖNEMLİ: Tarihli mod aktifken hiçbir döneme girmeyen satırlar hesaplamadan TAMAMEN ATLANIR.
const ORNEKLEME_DONEM_MAX = 10;
let orneklemeDonemleri = [];

function toggleOrneklemeDonemleri() {
  const aktif = document.getElementById('ornekleme-tarihli-aktif')?.checked;
  const wrap = document.getElementById('ornekleme-donemler-wrap');
  const tag  = document.getElementById('ornekleme-default-tag');
  if (wrap) wrap.style.display = aktif ? 'flex' : 'none';
  if (tag)  tag.style.display  = aktif ? 'inline-block' : 'none';
  if (aktif && orneklemeDonemleri.length === 0) {
    // İlk açılışta kullanım kolaylığı için bir dönem ekle
    orneklemeDonemleri.push({ start: '', end: '', mode: 'kapali', depolar: [] });
  }
  renderOrneklemeDonemleri();
  performansHesapla();
}

function addOrneklemeDonemi() {
  if (orneklemeDonemleri.length >= ORNEKLEME_DONEM_MAX) return;
  orneklemeDonemleri.push({ start: '', end: '', mode: 'kapali', depolar: [] });
  renderOrneklemeDonemleri();
  performansHesapla();
}

function removeOrneklemeDonemi(idx) {
  orneklemeDonemleri.splice(idx, 1);
  renderOrneklemeDonemleri();
  performansHesapla();
}

function onOrneklemeDonemChange(el) {
  const idx = parseInt(el.dataset.idx, 10);
  const field = el.dataset.field;
  if (!orneklemeDonemleri[idx]) return;
  orneklemeDonemleri[idx][field] = el.value;
  performansHesapla();
}

// Şu an yüklü Excel'deki (col-yapilan-depo sütunundaki) BENZERSİZ depo
// isimlerini döndürür — dönem satırlarındaki depo seçici checkbox'ları için.
function _bilinenDepolar() {
  const yapilanDepoCol = document.getElementById('col-yapilan-depo')?.value || '';
  if (!yapilanDepoCol || !excelRows || !excelRows.length) return [];
  const set = new Set();
  excelRows.forEach(row => {
    const v = String(row[yapilanDepoCol] ?? '').trim();
    if (v) set.add(v);
  });
  return Array.from(set).sort((a,b) => a.localeCompare(b, 'tr'));
}

// Bir dönemin depo seçimini aç/kapat (tek bir depoya tıklanınca)
function toggleDonemDepo(idx, depoAdi) {
  const p = orneklemeDonemleri[idx];
  if (!p) return;
  if (!Array.isArray(p.depolar)) p.depolar = [];
  const i = p.depolar.indexOf(depoAdi);
  if (i >= 0) p.depolar.splice(i, 1);
  else p.depolar.push(depoAdi);
  renderOrneklemeDonemleri();
  performansHesapla();
}

// "Tümünü Seç" / "Hiçbirini Seçme" — bir dönemin depo listesini toplu ayarlar.
// Not: "Tümünü Seç" TÜM bilinen depoları TEK TEK listeye yazar (boş bırakmaz)
// — böylece kullanıcı sonradan sadece BİRİNİN işaretini kaldırarak "bu depo
// hariç hepsi" durumunu kolayca kurabilir.
function toggleDonemTumDepolar(idx, hepsiniSec) {
  const p = orneklemeDonemleri[idx];
  if (!p) return;
  p.depolar = hepsiniSec ? _bilinenDepolar() : [];
  renderOrneklemeDonemleri();
  performansHesapla();
}

function renderOrneklemeDonemleri() {
  const listEl = document.getElementById('ornekleme-donemler-list');
  const addBtn = document.getElementById('btn-ornekleme-donem-ekle');
  const maxHint = document.getElementById('ornekleme-donem-max-hint');
  if (!listEl) return;
  const t = translations[currentLang] || translations.tr;
  const bilinenDepolar = _bilinenDepolar();

  listEl.innerHTML = orneklemeDonemleri.map((p, idx) => {
    const depolarSecili = Array.isArray(p.depolar) ? p.depolar : [];
    const depoOzetHtml = depolarSecili.length === 0
      ? `<span style="font-size:10px;font-weight:700;color:#00897B;background:#E0F2F1;padding:2px 7px;border-radius:8px">🏭 Tüm depolar</span>`
      : `<span style="font-size:10px;font-weight:700;color:#8E24AA;background:#F3E5F5;padding:2px 7px;border-radius:8px">🏭 ${depolarSecili.length} depo seçili</span>`;

    const depoChecklistHtml = bilinenDepolar.length === 0
      ? `<div style="font-size:10px;color:var(--muted2);font-style:italic">Depo seçmek için önce Excel yükleyip "InspectionYapilanDepo" sütununu seçin.</div>`
      : `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px">
           <button type="button" onclick="toggleDonemTumDepolar(${idx}, true)" style="font-size:9.5px;border:1px solid #8E24AA;background:#fff;color:#8E24AA;border-radius:5px;padding:2px 7px;cursor:pointer">Tümünü Seç</button>
           <button type="button" onclick="toggleDonemTumDepolar(${idx}, false)" style="font-size:9.5px;border:1px solid var(--muted);background:#fff;color:var(--muted);border-radius:5px;padding:2px 7px;cursor:pointer">Hiçbirini Seçme (= Tüm Depolar)</button>
         </div>
         <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">
           ${bilinenDepolar.map(depoAdi => {
             const secili = depolarSecili.includes(depoAdi);
             return `<label style="display:flex;align-items:center;gap:4px;font-size:10.5px;background:${secili ? '#F3E5F5' : '#F7F7F9'};border:1px solid ${secili ? '#CE93D8' : 'var(--border2)'};border-radius:6px;padding:3px 8px;cursor:pointer;margin:0">
               <input type="checkbox" ${secili ? 'checked' : ''} onchange="toggleDonemDepo(${idx}, '${depoAdi.replace(/'/g,"\\'")}')" style="width:12px;height:12px;margin:0;cursor:pointer">
               ${_escapeHtml(depoAdi)}
             </label>`;
           }).join('')}
         </div>`;

    return `
    <div style="background:#fff;border:1px solid #E1BEE7;border-radius:7px;padding:8px 10px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:11px;font-weight:700;color:#8E24AA;min-width:14px">${idx + 1}.</span>
        <label style="font-size:10.5px;color:var(--muted);margin:0" data-i18n="sampling_period_start">${t.sampling_period_start}</label>
        <input type="date" data-idx="${idx}" data-field="start" value="${p.start || ''}" onchange="onOrneklemeDonemChange(this)" style="width:auto;padding:4px 6px;font-size:12px">
        <label style="font-size:10.5px;color:var(--muted);margin:0" data-i18n="sampling_period_end">${t.sampling_period_end}</label>
        <input type="date" data-idx="${idx}" data-field="end" value="${p.end || ''}" onchange="onOrneklemeDonemChange(this)" style="width:auto;padding:4px 6px;font-size:12px">
        <label style="font-size:10.5px;color:var(--muted);margin:0" data-i18n="sampling_period_mode">${t.sampling_period_mode}</label>
        <select data-idx="${idx}" data-field="mode" onchange="onOrneklemeDonemChange(this)" style="width:auto;padding:4px 8px;font-size:12px">
          <option value="kapali" ${p.mode === 'kapali' ? 'selected' : ''}>${t.mode_kapali}</option>
          <option value="bir" ${p.mode === 'bir' ? 'selected' : ''}>${t.mode_bir}</option>
          <option value="iki" ${p.mode === 'iki' ? 'selected' : ''}>${t.mode_iki}</option>
        </select>
        ${depoOzetHtml}
        <button type="button" onclick="removeOrneklemeDonemi(${idx})" title="${t.sampling_period_remove}" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:14px;padding:2px 6px;margin-left:auto">✕</button>
      </div>
      <div style="border-top:1px dashed var(--border2);margin-top:8px;padding-top:6px">
        ${depoChecklistHtml}
      </div>
    </div>
  `;
  }).join('');

  if (addBtn) addBtn.style.display = orneklemeDonemleri.length >= ORNEKLEME_DONEM_MAX ? 'none' : '';
  if (maxHint) maxHint.style.display = orneklemeDonemleri.length >= ORNEKLEME_DONEM_MAX ? '' : 'none';
}

// Verilen tarih için, tarih aralıklı mod aktifse ve tarih bir döneme denk
// geliyorsa o dönemin örnekleme modunu döndürür. Aksi halde null döner
// (yani varsayılan/genel mod kullanılmalı).
// Tarihe göre dönem modu döndürür.
// Dönüş: dönem bulunduysa { mode, exclude: false }
//         tarihli mod aktif ama hiçbir döneme girmediyse { mode: null, exclude: true }
//         tarihli mod pasifse null (genel mod kullanılır)
// Verilen tarih (ve opsiyonel depo) için, tarih aralıklı mod aktifse ve
// tarih+depo bir döneme denk geliyorsa o dönemin örnekleme modunu döndürür.
// Her dönemin artık kendi "depolar" listesi var: boşsa (hiç depo seçilmemişse)
// o dönem TÜM depolar için geçerlidir — dolu ise SADECE listedeki depolar
// için geçerlidir (aynı tarih aralığını, farklı depo gruplarına farklı
// seviye vermek için birden fazla dönem satırı olarak ekleyebilirsiniz).
// Dönüş: dönem bulunduysa { mode, exclude: false }
//         tarihli mod aktif ama hiçbir döneme (tarih+depo) girmediyse { mode: null, exclude: true }
//         tarihli mod pasifse null (genel mod kullanılır)
function getOrneklemeModForDate(date, depo) {
  if (!date) return null;
  const aktif = document.getElementById('ornekleme-tarihli-aktif')?.checked;
  if (!aktif) return null;
  // Tüm dönemleri kontrol et
  const donemlerTamimli = orneklemeDonemleri.filter(p => p.start && p.end);
  for (const p of donemlerTamimli) {
    // Depo eşleşmesi: dönemin depolar listesi boşsa TÜM depolar için geçerli;
    // doluysa sadece listedekiler için geçerli.
    const depolarListesi = Array.isArray(p.depolar) ? p.depolar : [];
    if (depolarListesi.length > 0 && !depolarListesi.includes(depo)) continue;
    const [sy, sm, sd] = p.start.split('-').map(Number);
    const [ey, em, ed] = p.end.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
    const endDate   = new Date(ey, em - 1, ed, 23, 59, 59, 999);
    if (date >= startDate && date <= endDate) return { mode: p.mode, exclude: false };
  }
  // Tarihli mod aktif ama bu tarih+depo hiçbir döneme girmiyor → satırı dışla
  if (donemlerTamimli.length > 0) return { mode: null, exclude: true };
  // Dönem tanımlanmamış → genel modu kullan (dışlama yok)
  return null;
}

function updateOrneklemeUI() {
  const mod = document.querySelector('input[name="ornekleme-mod"]:checked')?.value || 'kapali';
  const preview = document.getElementById('ornekleme-tablo-preview');
  const aciklama = document.getElementById('ornekleme-aciklama');
  if (!preview) return;

  if (mod === 'kapali') {
    preview.style.display = 'none';
    if (aciklama) aciklama.innerHTML = (translations[currentLang]||translations.tr).sampling_desc;
  } else {
    const tablo = mod === 'bir' ? ORNEKLEME_BIR : ORNEKLEME_IKI;
    const satirlar = tablo.map(b => `≤${b.max===Infinity?'∞':b.max}→${b.val===null?'R':b.val}`).join('  ');
    preview.style.display = 'block';
    preview.textContent = satirlar;
    if (aciklama) aciklama.innerHTML = mod === 'bir'
      ? '<strong>Bir Alttan:</strong> parti büyüklüğüne göre örneklem alınır.'
      : '<strong>İki Alttan:</strong> daha küçük örneklem — daha az kontrol adedi.';
  }
}

function performansHesapla(){
  const tablo=document.getElementById('perf-tablo');
  const empty=document.getElementById('perf-empty');

  if(!excelRows.length){
    tablo.style.display='none'; 
        empty.style.display='block'; 
    return;
  }

  // Excel/sütun seçimi değişmiş olabilir — dönem satırlarındaki depo
  // checklist'ini güncel bilinen depo isimleriyle tazele (görünürse).
  if (document.getElementById('ornekleme-tarihli-aktif')?.checked) {
    renderOrneklemeDonemleri();
  }

  const klasmanCol = document.getElementById('col-klasman')?.value;
  const insCol = document.getElementById('col-inspector')?.value;
  const adetCol = document.getElementById('col-adet')?.value;
  const baslangicCol = document.getElementById('col-baslangic')?.value || '';
  const bitisCol = document.getElementById('col-bitis')?.value || '';
  const mesaiCol = document.getElementById('col-mesai')?.value || '';
  const talepCol = document.getElementById('col-talep')?.value || '';
  // talepCol seçilmemişse Excel sütun adlarından otomatik bul
  const talepColFallback = talepCol || excelCols.find(c => {
    const norm = c.toLowerCase().replace(/[^a-z0-9]/g,'').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ı/g,'i').replace(/ç/g,'c');
    return norm.includes('talepno') || norm.includes('talepnumarasi') || norm === 'talep';
  }) || '';
  const yapilanDepoCol = document.getElementById('col-yapilan-depo')?.value || '';
  const sonucCol = document.getElementById('col-sonuc')?.value || '';
  // "Inspection Tipi" sütununu otomatik bul (panelde ayrı seçim alanı yok)
  const inspectionTipiCol = excelCols.find(c => {
    const norm = c.toLowerCase().replace(/[^a-z0-9]/g,'').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ı/g,'i').replace(/ç/g,'c');
    return norm.includes('inspectiontipi');
  }) || '';

  const orneklemeMod = document.querySelector('input[name="ornekleme-mod"]:checked')?.value || 'kapali';
  const verimlilikHedef = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);

  updateOrneklemeUI();

  // Verimlilik açıklama güncelle
  const vAciklama = document.getElementById('verimlilik-aciklama');
  if (vAciklama) {
    if (verimlilikHedef === 100) vAciklama.textContent = '';
    else if (verimlilikHedef < 100) vAciklama.textContent = `(%${verimlilikHedef} ${(translations[currentLang]||translations.tr).target_below_100} ${(100/verimlilikHedef).toFixed(2)}x) `;
    else vAciklama.textContent = `(%${verimlilikHedef} ${(translations[currentLang]||translations.tr).target_above_100} ${(100/verimlilikHedef).toFixed(2)}x) `;
  }

  if(!klasmanCol || !insCol || !adetCol){
    showFileStatus((translations[currentLang]||translations.tr).col_select_warning, 'var(--amber)');
    return;
  }

  // Klasman mapping hazırla
  // Ölçü tablosu: BakilacakMiktar → ölçülecek adet
  function getOlcuAdet(adet) {
    if (adet <= 32)  return 6;
    if (adet <= 50)  return 9;
    if (adet <= 80)  return 9;
    if (adet <= 125) return 9;
    return 12;
  }

  // Ürün Kabul katsayısı: BakilacakMiktar → kaç kat
  function getUrunKabulKat(adet) {
    if (adet <= 32)  return 0.5;
    if (adet <= 80)  return 1.1;
    if (adet <= 125) return 1.2;
    return 1.3;
  }

  // ── ADET ARTTIKÇA KADEMELİ VERİMLİLİK KATSAYISI (kullanıcı talebiyle
  // eklendi) ────────────────────────────────────────────────────────────
  // Büyük partilerde (ör. 200, 315 adet) inspector aynı ürünü art arda
  // yaptığı için pratik kazanır — birim başına gerçek süre, tek tek/az
  // sayıda yapılan işe göre daha kısadır. Standart Süre'nin, tek bir sabit
  // sayıya (ör. "3 saat") tavanlanması KLASMANLAR ARASI FARKI yok sayar ve
  // gerçekçi değildir — bunun yerine her klasmanın KENDİ birim süresine
  // ORANTILI olarak düşen bir katsayı uygulanır (Ürün Kabul katsayısıyla
  // aynı kademeli mantık, ama azalan yönde). Böylece her klasman kendi
  // gerçek zorluğuna göre farklı bir Standart Süre'ye iner, hiçbiri aynı
  // sabit değere sabitlenmez.
  function getAdetVerimlilikKatsayisi(adet) {
    if (adet <= 32)  return 1.00;   // küçük parti — indirim yok
    if (adet <= 80)  return 0.92;   // %8 verimlilik kazancı
    if (adet <= 125) return 0.80;   // %20
    if (adet <= 200) return 0.60;   // %40
    if (adet <= 315) return 0.50;   // %50
    return 0.42;                    // 315+ adet — %58
  }

  function normalize(str) { return String(str).toLowerCase().trim().replace(/[^\w]/g,''); }
  const klasmanMap = {};
  klasmanlar.forEach(k => {
    const normalKey = normalize(k.ad);
    klasmanMap[normalKey] = {
      urunKontrolSuresi: parseFloat(k.urunKontrolSuresi) || 0,
      olcuSuresi: parseFloat(k.olcuSuresi) || 0,
      urunKabulSuresi: parseFloat(k.urunKabulSuresi) || 0,
      istasyonSuresi: k.istasyonlar.reduce((s,i)=>s+(parseFloat(i.sure)||0),0),
      istasyonDetay: k.istasyonlar.map(i => ({ ad: i.ad, sure: parseFloat(i.sure)||0 }))
    };
  });

  const inspectorMap = {};
  const eslesmeyenKlasmanlar = new Set();
  let basariliTarihKayitlar = 0;
  let tarihHataliKayitlar = 0;

  let kaldiSatirSayisi = 0;

  // ── ÇAKIŞMA DÜZELTMESİ (Sistematik Geç Kapanış Normalizasyonu) ───────────
  // Sorun: Sistemsel hata nedeniyle bir siparişin kapanışı sisteme yansımamış
  // ve inspector saatlerce sonra fark edip tekrar göndermiş olabilir.
  // Bu durumda önceki kaydın bitiş saati, bir sonraki kaydın başlangıç saatinden
  // BÜYÜK çıkar (çakışma) — bu yapay bir geç kapanış süresidir.
  //
  // Düzeltme kuralı: Aynı inspector'ın aynı gündeki kayıtları başlangıç saatine
  // göre sıralandığında, bir kaydın bitiş saati bir sonraki kaydın başlangıç
  // saatinden büyükse → o kaydın bitiş saatini bir sonraki kaydın başlangıç
  // saatiyle eşitle. Böylece gerçek çalışma süresi doğru hesaplanır.
  //
  // Sonuç: (baslangicTarih, bitisTarih) → düzeltilmiş bitiş tarihi
  // Map anahtarı: "inspector|gün|başlangıçMs" → düzeltilmiş bitis Date nesnesi
  const _duzeltilmisBitisMap = new Map(); // key: rowIndex, val: Date

  // 1. Tüm satırları önceden parse et
  const _rowMeta = excelRows.map((row, idx) => {
    const ins = String(row[insCol]||'').trim();
    const baslangicTarih = baslangicCol ? row[baslangicCol] : null;
    const bitisTarih = bitisCol ? row[bitisCol] : null;
    const parsedBas = baslangicTarih ? parseFlexibleDate(baslangicTarih) : null;
    const parsedBit = bitisTarih ? parseFlexibleDate(bitisTarih) : null;
    return { idx, ins, parsedBas, parsedBit };
  });

  // 2. Inspector bazında grupla (UTC kaymasını önlemek için yerel tarih kullan)
  // NOT: toISOString() UTC döndürür — Türkiye UTC+3 olduğu için 00:00-02:59
  // arası başlayan kayıtlar önceki güne atanır. Bunun yerine yerel yıl/ay/gün
  // kullanarak doğru gruplama yapıyoruz.
  // Ayrıca gruplama SADECE inspector bazında yapılır; gün ayrımı yapılmaz.
  // Çünkü bir inspection farklı bir günde başlayıp farklı bir günde bitebilir
  // ve cross-day çakışmalar da yakalanmalıdır. Sıralama zaten timestamp ile
  // yapıldığından farklı günlerdeki kayıtlar da doğru sıralanır.
  const _insGunGruplari = {};
  _rowMeta.forEach(m => {
    if (!m.ins || !m.parsedBas || !m.parsedBit) return;
    // Yerel tarihi al (UTC kayması yok)
    const y   = m.parsedBas.getFullYear();
    const mo  = String(m.parsedBas.getMonth() + 1).padStart(2, '0');
    const d   = String(m.parsedBas.getDate()).padStart(2, '0');
    const gun = `${y}-${mo}-${d}`; // yerel YYYY-MM-DD
    const key = m.ins + '|' + gun;
    if (!_insGunGruplari[key]) _insGunGruplari[key] = [];
    _insGunGruplari[key].push(m);
  });

  // 3. Her grupda başlangıç TAM TIMESTAMP'e göre sırala, çakışmaları düzelt
  // Karşılaştırma tarih+saat bazında yapılır (sadece saat değil, tam Date nesnesi).
  // Zincirleme düzeltme: A→B→C üçlüsünde A'nın düzeltilmiş bitişi B'nin
  // başlangıcından büyükse tekrar kırpılır.
  Object.values(_insGunGruplari).forEach(grup => {
    // Tam timestamp ile sırala (tarih + saat + dakika + saniye)
    grup.sort((a, b) => a.parsedBas.getTime() - b.parsedBas.getTime());
    for (let i = 0; i < grup.length - 1; i++) {
      const current = grup[i];
      const next    = grup[i + 1];
      // Effective bitiş: önceden düzeltilmişse onu kullan (zincirleme için)
      const effBit = _duzeltilmisBitisMap.has(current.idx)
        ? _duzeltilmisBitisMap.get(current.idx)
        : current.parsedBit;
      // Çakışma kontrolü: tam tarih+saat karşılaştırması
      // effBit > next.parsedBas → sonraki inspection başlamadan current bitmemiş
      if (effBit.getTime() > next.parsedBas.getTime()) {
        // Düzeltme: current bitiş = next başlangıç (tarih+saat tam eşleşme)
        _duzeltilmisBitisMap.set(current.idx, next.parsedBas);
        console.log(
          `⚠️ Çakışma düzeltildi [${current.ins}]: ` +
          `${effBit.toLocaleString('tr-TR')} → ` +
          `${next.parsedBas.toLocaleString('tr-TR')} ` +
          `(sonraki başlangıç: ${next.parsedBas.toLocaleString('tr-TR')})`
        );
      }
    }
  });
  // ── ÇAKIŞMA DÜZELTMESİ SONU ─────────────────────────────────────────────

  excelRows.forEach((row, _rowIdx) => {
    const excelKlasman = String(row[klasmanCol]||'').trim();
    const ins = String(row[insCol]||'').trim();
    const adetHam = parseFloat(row[adetCol])||0;
    const baslangicTarih = baslangicCol ? row[baslangicCol] : null;
    const bitisTarih = bitisCol ? row[bitisCol] : null;
    const mesaiHam = mesaiCol ? row[mesaiCol] : null;

    // Tarihleri en başta parse et — örnekleme modu seçimi için de kullanılır
    const parsedBaslangic = baslangicTarih ? parseFlexibleDate(baslangicTarih) : null;
    const parsedBitisTaslak = bitisTarih ? parseFlexibleDate(bitisTarih) : null;
    // Çakışma varsa düzeltilmiş bitiş saatini kullan
    const parsedBitis = _duzeltilmisBitisMap.has(_rowIdx)
      ? _duzeltilmisBitisMap.get(_rowIdx)
      : parsedBitisTaslak;
    const tarihGecerli = parsedBaslangic && parsedBitis &&
                         parsedBitis > parsedBaslangic &&
                         parsedBaslangic.getFullYear() > 2000;

    // InspectionYapilanDepo değerini ÖNCE oku — dönem bazlı örnekleme modu
    // seçiminde de kullanılır (her dönem artık kendi "depolar" listesine sahip).
    const depoValErken = yapilanDepoCol ? String(row[yapilanDepoCol] ?? '').trim() : '';

    // Örnekleme modu önceliği:
    // 1) Varsayılan: yukarıdaki genel mod (radio)
    // 2) Tarih aralıklı mod aktifse ve satırın başlangıç tarihi VE deposu bir
    //    döneme denk geliyorsa (her dönem hem tarih hem depo listesi taşır)
    //    o dönemin modu kullanılır
    // 3) InspectionSonuc "Kaldı" ise her durumda Kapalı (en yüksek öncelik —
    //    tüm adet kontrol edilmeli)
    let satırOrneklemeMod = orneklemeMod;
    const donemSonuc = getOrneklemeModForDate(parsedBaslangic, depoValErken);
    if (donemSonuc !== null) {
      if (donemSonuc.exclude) return; // Bu satır hiçbir döneme girmiyor → tamamen atla
      satırOrneklemeMod = donemSonuc.mode;
    }
    if (sonucCol) {
      const sonucRaw = String(row[sonucCol] || '').trim();
      // Türkçe karakter duyarsız karşılaştırma (ı→i, İ→i, ğ→g vs.)
      const sonucNorm = sonucRaw.toLocaleLowerCase('tr-TR').replace(/ı/g,'i').replace(/İ/g,'i').replace(/ğ/g,'g').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ç/g,'c');
      if (sonucNorm === 'kaldi' || sonucNorm.includes('kaldi')) {
        satırOrneklemeMod = 'kapali';
        kaldiSatirSayisi++;
      }
    }

    const adet = orneklemeAdet(adetHam, satırOrneklemeMod);

    // InspectionYapilanDepo filtresi: sütun seçiliyse boş satırları atla
    if (yapilanDepoCol) {
      if (!depoValErken) return;
    }

    if(!excelKlasman || !ins || !adet) return;
    
    const klasmanKey = normalize(excelKlasman);
    const klasmanInfo = klasmanMap[klasmanKey];
    
    if(!klasmanInfo) {
      eslesmeyenKlasmanlar.add(excelKlasman);
      return;
    }
    
    if(!inspectorMap[ins]) {
      inspectorMap[ins] = {
        ins: ins,
        klasmanlar: {},
        toplamAdet: 0,
        toplamOvertimeAdet: 0, // Overtime (16:45 sonrası) döneminde kontrol edilen toplam adet — yalnızca gösterim/rapor amaçlı
        kayitListesi: [],
        mesaiSureSn: null
      };
    }
    
    // Mesai süresini parse et
    if (mesaiHam !== null && mesaiHam !== undefined && mesaiHam !== '') {
      const parsedMesai = parseMesaiSuresi(mesaiHam);
      if (parsedMesai && parsedMesai > 0) {
        if (inspectorMap[ins].mesaiSureSn === null || parsedMesai > inspectorMap[ins].mesaiSureSn) {
          inspectorMap[ins].mesaiSureSn = parsedMesai;
        }
      }
    }

    if (tarihGecerli) {
      const zatenVar = inspectorMap[ins].kayitListesi.some(
        r => r.parsedBaslangic.getTime() === parsedBaslangic.getTime() &&
             r.parsedBitis.getTime()     === parsedBitis.getTime()
      );
      if (!zatenVar) inspectorMap[ins].kayitListesi.push({ parsedBaslangic, parsedBitis });
      basariliTarihKayitlar++;
    } else {
      tarihHataliKayitlar++;
    }

    // Standart süre hesaplama:
    // ((kontrol süresi × adet) + ölçü eki + ürün kabul eki + istasyon süresi) × adet verimlilik katsayısı
    const olcuAdet = getOlcuAdet(adet);
    const urunKabulKat = getUrunKabulKat(adet);
    const olcuEk = olcuAdet * (klasmanInfo.olcuSuresi || 0);
    const urunKabulEk = urunKabulKat * (klasmanInfo.urunKabulSuresi || 0);
    const adetVerimlilikKat = getAdetVerimlilikKatsayisi(adet);
    let standartSure = ((klasmanInfo.urunKontrolSuresi * adet) + olcuEk + urunKabulEk + klasmanInfo.istasyonSuresi) * adetVerimlilikKat;
    // Tavanlama ÖNCESİ ham değeri ayrıca sakla — SADECE gösterim/dokümantasyon
    // (Excel, panel özet başlığı) için kullanılır. Verimlilik Perf/Oran
    // hesabı hâlâ aşağıdaki tavanlanmış standartSure'u kullanmaya devam eder
    // — kullanıcı talebiyle: "sistemi değiştirme, sadece Excel'i düzelt".
    const standartSureHam = standartSure;

    // Bu kaydın fiili süresi = başlangıç-bitiş farkı (mola düşümlü)
    const kayitFiiliSure = tarihGecerli
      ? hesaplaGerceklesenSure(parsedBaslangic, parsedBitis)
      : null;

    // ── KISA KAYIT TAVANLAMASI ──────────────────────────────────────────
    // Gerçekleşen süresi ≤ 10dk (600sn) olan kayıtlarda standart süre bazen
    // çok yüksek çıkıp (ör. küçük partide ölçü/ürün kabul ekleri orantısız
    // büyüyünce) oran %500+ gibi gerçekçi olmayan değerlere ulaşabiliyor.
    // Hesaplama sistemi DEĞİŞMİYOR — yalnızca bu kaydın genel performansa
    // (toplamStandartSure'a) giren payı, kendi gerçekleşen süresiyle tavanlanır
    // ki oran hiçbir zaman %100'ü geçerek genel ortalamayı yapay şişirmesin.
    if (kayitFiiliSure !== null && kayitFiiliSure > 0 && kayitFiiliSure <= 600 && standartSure > kayitFiiliSure) {
      standartSure = kayitFiiliSure;
    }

    // "Inspection Tipi" sütunu — sadece izleme/raporlama amaçlı okunur.
    // Standart süre / performans hesabını ETKİLEMEZ; tüm kayıtlar aynı
    // formülden geçer (kalite ayrımı yok). "2.Kalite" ile başlayan değerler
    // sadece UI'da ayrıca işaretlenmesi için bayraklanır.
    const inspectionTipiRaw = inspectionTipiCol ? String(row[inspectionTipiCol] || '').trim() : '';
    // Boşluk/nokta varyasyonlarına (ör. "2. Kalite", "2 Kalite", "2.Kalite")
    // karşı esnek olsun diye normalize edilip öyle kontrol edilir.
    const is2Kalite = inspectionTipiRaw.toLocaleLowerCase('tr-TR').replace(/[\s.]/g, '').startsWith('2kalite');

    const klasmanKey2 = excelKlasman;
    if (!inspectorMap[ins].klasmanlar[klasmanKey2]) {
      inspectorMap[ins].klasmanlar[klasmanKey2] = {
        kayitlar: [],
        toplamAdet: 0,
        toplamStandartSure: 0,
        toplamKayitFiiliSure: 0
      };
    }
    const kl = inspectorMap[ins].klasmanlar[klasmanKey2];

    // 2.Kalite kayıtları VARSAYILAN OLARAK genel performans hesabından TAMAMEN
    // hariç tutulur (ne adet/standart süre payına, ne mesai/overtime paydasına
    // dahil edilir) — sadece kendi ayrı toplamlarında (toplam2Kalite*) izlenir.
    // KULLANICI TOGGLE'I: "2.Kalite ürünleri Genel Performansa dahil et" işaretliyse
    // (_2KaliteDahil === true) 2.Kalite kayıtları da DİĞER KAYITLARLA AYNI ŞEKİLDE
    // normal akışa girer — bu durumda mevcut davranış hiç değişmez (her şey tek
    // bir akıştan geçer, ayrım yapılmaz). Varsayılan (false) durumda eski/mevcut
    // çalışan mantık birebir korunur.
    if (is2Kalite && !_2KaliteDahil) {
      kl.toplam2KaliteAdet = (kl.toplam2KaliteAdet || 0) + adet;
      kl.toplam2KaliteStandartSure = (kl.toplam2KaliteStandartSure || 0) + standartSure;
      if (kayitFiiliSure && kayitFiiliSure > 0) {
        kl.toplam2KaliteFiiliSure = (kl.toplam2KaliteFiiliSure || 0) + kayitFiiliSure;
      }
    } else {
      // Overtime toggle kontrolü: kapalıysa overtime kayıtları hesaba girmesin
      const kayitNormalSayilir = kayitNormalMi(parsedBitis);
      if (!_overtimeDahil && !kayitNormalSayilir) {
        // Overtime kaydı, toggle kapalı → atla (ne adet ne standart süre ekleme)
        kl.toplamStandartSureOvertime = (kl.toplamStandartSureOvertime||0) + standartSure;
      } else {
        kl.toplamAdet += adet;
        kl.toplamStandartSure += standartSure;
        kl.toplamStandartSureHam = (kl.toplamStandartSureHam || 0) + standartSureHam;
        if (kayitFiiliSure && kayitFiiliSure > 0) {
          kl.toplamKayitFiiliSure += kayitFiiliSure;
        }
        if (kayitNormalSayilir) {
          kl.toplamStandartSureNormal = (kl.toplamStandartSureNormal||0) + standartSure;
        } else {
          kl.toplamStandartSureOvertime = (kl.toplamStandartSureOvertime||0) + standartSure;
        }
      }
    }
    const kayitNormalSayilir = kayitNormalMi(parsedBitis);
    kl.kayitlar.push({ no: kl.kayitlar.length + 1, klasman: excelKlasman, adet, standartSure, standartSureHam, kayitFiiliSure, kontrolAdetSuresi: klasmanInfo.urunKontrolSuresi, istasyonSuresi: klasmanInfo.istasyonSuresi, istasyonDetay: klasmanInfo.istasyonDetay || [], baslangic: parsedBaslangic, bitis: parsedBitis, tarihGecerli, normalMesai: kayitNormalSayilir, talepNo: talepColFallback ? String(row[talepColFallback]||'').trim() : '', inspectionTipi: inspectionTipiRaw, is2Kalite });

    // Overtime'da (16:45 sonrası) kontrol edilen toplam adedi ayrıca izle —
    // yalnızca gösterim/rapor amaçlı, mevcut performans hesaplarını etkilemez.
    if (!kayitNormalSayilir) {
      inspectorMap[ins].toplamOvertimeAdet = (inspectorMap[ins].toplamOvertimeAdet || 0) + adet;
    }

    if (is2Kalite && !_2KaliteDahil) {
      // toplamAdet'e eklenmedi (yukarıda hariç tutuldu)
    } else {
      // Overtime toggle kapalıysa overtime kayıtları adet toplamına da girmesin
      const kayitNormalSayilir2 = kayitNormalMi(parsedBitis);
      if (!_overtimeDahil && !kayitNormalSayilir2) {
        // overtime kaydı, toggle kapalı → atla
      } else {
        inspectorMap[ins].toplamAdet += adet;
      }
    }
  });

  // Kaldı özet göstergesi güncelle
  const kaldiOzet = document.getElementById('sonuc-kaldi-ozet');
  if (kaldiOzet) {
    if (sonucCol && kaldiSatirSayisi > 0) {
      kaldiOzet.style.display = 'block';
      kaldiOzet.textContent = '🔴 ' + kaldiSatirSayisi + ' satır "Kaldı" → Kapalı mod uygulandı';
    } else {
      kaldiOzet.style.display = 'none';
    }
  }

  // Inspector bazında sonuç map'i oluştur
  const map = {};
  Object.values(inspectorMap).forEach(inspectorData => {
    const ins = inspectorData.ins;
    const klasmanlarObj = {};

    // Inspector'ın tüm tarih dilimlerinden gerçek çalışma süresini hesapla (saniye)
    const fiiliSureSn = hesaplaInspectorFiiliSure(inspectorData.kayitListesi);
    
    // Günlük mesai hesaplama
    const mesaiHesap = hesaplaGunlukMesaiSuresi(inspectorData.kayitListesi);
    
    let toplamStandartSure = 0;   
    let toplamAdet = 0;
    let toplamKayitFiiliSure = 0; 
    let toplamStandartSureNormal = 0;   // Sadece normal mesai (08:00-16:45) icindeki standart sure
    let toplamStandartSureOvertime = 0; // Sadece overtime (16:45-20:00) icindeki standart sure
    let toplam2KaliteAdet = 0;          // 2.Kalite kontrollerinin toplam adedi (yalnızca gösterim)
    let toplam2KaliteStandartSure = 0;  // 2.Kalite kontrollerinin toplam standart süresi (yalnızca gösterim)
    let toplam2KaliteFiiliSure = 0;     // 2.Kalite kontrollerinin toplam gerçekleşen süresi (yalnızca gösterim)

    Object.entries(inspectorData.klasmanlar).forEach(([klasman, kl]) => {
      toplamStandartSure += kl.toplamStandartSure;
      toplamAdet += kl.toplamAdet;
      toplamKayitFiiliSure += (kl.toplamKayitFiiliSure || 0);
      toplamStandartSureNormal   += (kl.toplamStandartSureNormal || 0);
      toplamStandartSureOvertime += (kl.toplamStandartSureOvertime || 0);
      toplam2KaliteAdet         += (kl.toplam2KaliteAdet || 0);
      toplam2KaliteStandartSure += (kl.toplam2KaliteStandartSure || 0);
      toplam2KaliteFiiliSure    += (kl.toplam2KaliteFiiliSure || 0);

      // Klasman bazında hızPerf: bu klasmanın standart süresi / tüm inspector standart süresi × genel performans
      // (Genel performans henüz hesaplanmadığından burada geçici saklarız, aşağıda düzeltiriz)
      const hizPerf = 0; // placeholder — aşağıda genel performans belli olunca güncellenir

      klasmanlarObj[klasman] = {
        adet: kl.toplamAdet,
        standartSure: kl.toplamStandartSure,
        standartSureHam: kl.toplamStandartSureHam || kl.toplamStandartSure,
        kayitFiiliSure: kl.toplamKayitFiiliSure || 0,
        hizPerf,
        hacimPerf: null,
        kayitlar: kl.kayitlar,  // Kayıt bazlı detay için
        toplam2KaliteAdet: kl.toplam2KaliteAdet || 0,
        toplam2KaliteStandartSure: kl.toplam2KaliteStandartSure || 0,
        toplam2KaliteFiiliSure: kl.toplam2KaliteFiiliSure || 0
      };
    });

    // Tek Performans Metriği - Mesai Bazlı
    let mesaiSureSn;
    let performans = null;

    // Mesaiyi hesapla
    if (inspectorData.mesaiSureSn && inspectorData.mesaiSureSn > 0) {
      mesaiSureSn = inspectorData.mesaiSureSn;
    } else if (mesaiHesap && mesaiHesap.toplamMesaiSaniye > 0) {
      mesaiSureSn = mesaiHesap.toplamMesaiSaniye;
    } else {
      mesaiSureSn = fiiliSureSn;
    }

    // ── KAYIP ZAMAN: BURADA DÜŞÜLMÜYOR (kasıtlı) ────────────────────────
    // Ana performans (genelHizPerf) kayıp zamandan tamamen bağımsız/ham
    // tutulur — kayipZamanData ile performansData/mesaiSure ayrı veri
    // yapılarıdır, burada karıştırılmaz. "Ne ödül ne ceza" ilkesiyle kayıp
    // zaman düzeltmesi SADECE getDuzeltilmisPerformans() içinde, her
    // seferinde GÜNCEL kayipZamanData ile canlı hesaplanır (Kayıp Zaman
    // sekmesi). Böylece Excel'den SONRA girilen kayıp zaman kayıtları da
    // doğru yansır ve aynı düşüm iki kez uygulanmaz (double-counting olmaz).

    // Toplam performansı hesapla
    // _overtimeDahil = false (varsayılan): overtime kayıtları zaten yukarıda
    // hesaba katılmadı (adet ve standart süre hariç tutuldu). Mesai paydasından
    // da overtime saatlerini düş → sadece normal mesai üzerinden hesapla.
    // _overtimeDahil = true: tüm kayıtlar dahil, tüm mesai paydaya girer.
    const overtimeSn = mesaiHesap ? (mesaiHesap.toplamMesaistiSaniye || 0) : 0;
    const normalMesaiSn = mesaiSureSn - overtimeSn;
    const performansPaydasi = _overtimeDahil
      ? mesaiSureSn
      : (normalMesaiSn > 0 ? normalMesaiSn : mesaiSureSn);

    if (performansPaydasi && performansPaydasi > fiiliSureSn * 0.1) {
      performans = Math.round((toplamStandartSure / performansPaydasi) * 100);
    } else {
      performans = null;
    }

    // Klasman hizPerf düzeltmesi: her klasmanın standart süresi / toplam standart süre × genel performans
    // Böylece günün tüm mesaisi tek klasmana yüklenmez; çoklu klasman çalışan inspector'da hakkaniyet sağlanır
    if (performans !== null && toplamStandartSure > 0) {
      Object.keys(klasmanlarObj).forEach(k => {
        const oran = klasmanlarObj[k].standartSure / toplamStandartSure;
        klasmanlarObj[k].hizPerf = Math.round(oran * performans);
      });
    }

    // Overtime performansi: sadece 16:45 sonrasi calisilan sure ve o surede tamamlanan standart sure
    const overtimeMesaiSn = mesaiHesap ? (mesaiHesap.toplamMesaistiSaniye || 0) : 0;
    const overtimePerformans = (overtimeMesaiSn > 0 && toplamStandartSureOvertime > 0)
      ? Math.round((toplamStandartSureOvertime / overtimeMesaiSn) * 100)
      : null;

    // 2.Kalite kontrollerinin KENDİ performansı — yalnızca gösterim amaçlı.
    // Genel "Düz. Performans" (mesai bazlı) hesabına dahil EDİLMEZ; sadece
    // 2.Kalite satırlarının standart süresi / gerçekleşen süresi oranı olarak hesaplanır.
    const perf2Kalite = (toplam2KaliteFiiliSure > 0)
      ? Math.round((toplam2KaliteStandartSure / toplam2KaliteFiiliSure) * 100)
      : null;

    map[ins] = {
      ins: ins,
      adet: toplamAdet,
      fiiliSure: fiiliSureSn,                  // Sadece gösterim için
      kayitFiiliSure: toplamKayitFiiliSure,    // Debug için
      standartSure: toplamStandartSure,        
      mesaiSure: mesaiSureSn,                  
      kayit: Object.values(inspectorData.klasmanlar).reduce((s,k)=>s+k.kayitlar.length,0),
      klasmanlar: klasmanlarObj,
      // Tek performans metriği
      genelHizPerf: performans,           // Mesai bazlı performans
      genelPerformans: performans,        // Aynı değer
      genelHacimPerf: null,
      // Overtime ayrimi
      standartSureNormal: toplamStandartSureNormal,
      standartSureOvertime: toplamStandartSureOvertime,
      overtimeMesaiSure: overtimeMesaiSn,
      overtimePerformans: overtimePerformans,
      // Verimlilik düzeltmeli performans
      verimlilikPerf: performans !== null ? Math.round(performans * (100 / verimlilikHedef)) : null,
      hedefVerimlilik: verimlilikHedef,
      tarihBasariliKayit: inspectorData.kayitListesi.length,
      gunSayisi: mesaiHesap ? mesaiHesap.gunSayisi : 0,
      gunlukDetay: mesaiHesap ? mesaiHesap.gunlukDetay : [],
      toplamMesaistiSaniye: mesaiHesap ? (mesaiHesap.toplamMesaistiSaniye || 0) : 0,
      gunlukOvertimeDetay: mesaiHesap ? (mesaiHesap.gunlukOvertimeDetay || {}) : {},
      // 2.Kalite — yalnızca gösterim, genel performansa dahil değil
      toplam2KaliteAdet: toplam2KaliteAdet,
      toplam2KaliteStandartSure: toplam2KaliteStandartSure,
      toplam2KaliteFiiliSure: toplam2KaliteFiiliSure,
      perf2Kalite: perf2Kalite,
      // Overtime'da kontrol edilen toplam adet — yalnızca gösterim/rapor amaçlı
      toplamOvertimeAdet: inspectorData.toplamOvertimeAdet || 0
    };

    
    // Debug log
    console.log(`[${ins}] Gün:${mesaiHesap?.gunSayisi || 0} Standart:${Math.round(toplamStandartSure/60)}dk Mesai:${Math.round(mesaiSureSn/60)}dk Mesaisti:${Math.round((mesaiHesap?.toplamMesaistiSaniye||0)/60)}dk Performans:${performans}% VPerf:${performans !== null ? Math.round(performans*(100/verimlilikHedef)) : null}%`);
  });

  const liste = Object.values(map).sort((a, b) => {
    const perfA = a.genelHizPerf ?? 0;
    const perfB = b.genelHizPerf ?? 0;
    return perfB - perfA;
  });

  if(!liste.length){ 
    tablo.style.display='none'; 
    empty.style.display='block'; 
    showFileStatus((translations[currentLang]||translations.tr).no_data_processable, 'var(--red)');
    return; 
  }

  // Performans verilerini güncelle
  performansData = liste;

  // Yeni bir yükleme başlıyor — önceki Temizle iptalini sıfırla
  window._uploadAborted = false;

  // NOT: Otomatik Sheets gönderimi KALDIRILDI.
  // Her hesaplamada (sütun değişimi, örnekleme modu, tarih aralığı vb.)
  // Google Sheets'e otomatik yazma yapılmaz. Veri sadece "📤 Sheets'e Gönder"
  // butonuna (pushPerformansManual) basıldığında gönderilir. Bu sayede:
  //  - Ayar değiştirirken Sheets'e art arda istek atılmaz (race condition önlenir)
  //  - Detay modalında yanlışlıkla eski/yarım veri görünmesi engellenir
  
  const satirlar=liste.map((row,i)=>{
    const ini=row.ins.split(' ').map(w=>w[0]||'').slice(0,2).join('').toUpperCase();
    
    const performans = row.genelHizPerf ?? 0;
    const performansClass = getPerformanceClass(performans);
    
    const klasmanDetay = Object.entries(row.klasmanlar)
      .map(([k,v]) => {
        const klasmanPerf = v.hizPerf ?? 0;
        return `${k}: ${v.adet} adet (${klasmanPerf}%)`;
      })
      .join('<br>');
    
    const fmtSure = (sn) => {
      if (!sn) return '—';
      const s = Math.round(sn);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sc = s % 60;
      return h > 0
        ? `${h}s ${String(m).padStart(2,'0')}d ${String(sc).padStart(2,'0')}sn`
        : `${m}d ${String(sc).padStart(2,'0')}sn`;
    };
    
    const tarihDurumu = row.tarihBasariliKayit > 0 ? `✅ ${row.tarihBasariliKayit}/${row.kayit}` : `⚠️ Tarih yok`;
    const vPerf = row.verimlilikPerf;
    const vPerfClass = vPerf === null ? '' : getPerformanceClass(vPerf);
    const verimlilikHedef3 = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);
    
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:9px">
        <div class="avatar">${ini}</div>
        <div>
          <strong style="font-size:13px">${row.ins}</strong>
          <div style="font-size:10px;color:var(--muted2)">${row.gunSayisi || 0} ${(translations[currentLang]||translations.tr).working} · ${tarihDurumu}</div>
        </div>
      </div></td>
      <td style="color:var(--muted);font-family:'DM Mono',monospace">${row.kayit}</td>
      <td style="font-family:'DM Mono',monospace">${row.adet.toFixed(0)}</td>
      <td style="font-family:'DM Mono',monospace">${fmtSure(row.standartSure)}</td>
      <td style="font-family:'DM Mono',monospace">${fmtSure(row.mesaiSure)}</td>
      <td style="font-family:'DM Mono',monospace">
        <div>
          <span class="${performansClass}" style="font-weight:700;font-size:14px">${performans !== null ? performans+'%' : '—'}</span>
          <div style="font-size:9px;color:var(--muted);margin-top:1px">
            ${row.gunSayisi || 0} ${(translations[currentLang]||translations.tr).days_x_formula.replace('{h}', Math.round((row.mesaiSure||0)/3600))}
          </div>
        </div>
      </td>
      <td style="font-family:'DM Mono',monospace;background:${verimlilikHedef3 !== 100 ? 'linear-gradient(135deg,#FFFDE7,#fff)' : 'transparent'}">
        <div>
          <span class="${vPerfClass}" style="font-weight:700;font-size:14px">${vPerf !== null ? vPerf+'%' : '—'}</span>
          <div style="font-size:9px;color:var(--muted);margin-top:1px">
            ${performans !== null && verimlilikHedef3 !== 100 ? `${performans}% × (100÷${verimlilikHedef3})` : verimlilikHedef3 === 100 ? 'Hedef=%100 (aynı)' : '—'}
          </div>
        </div>
      </td>
      <td style="font-size:11px;color:var(--muted2);max-width:200px" title="${klasmanDetay.replace(/<br>/g, ', ')}">${klasmanDetay}</td>
    </tr>`;
  }).join('');

  const toplamKayit = excelRows.filter(row => {
    const excelKlasman = String(row[klasmanCol]||'').trim();
    const klasmanKey = normalize(excelKlasman);
    return klasmanMap[klasmanKey];
  }).length;

  const ortPerformans = liste.length > 0 ?
    Math.round(liste.reduce((sum, row) => sum + (row.genelHizPerf ?? 0), 0) / liste.length) : 0;

  const ortalamaGun = liste.length > 0 ? 
    Math.round(liste.reduce((sum, row) => sum + (row.gunSayisi || 0), 0) / liste.length) : 0;

  const ortVPerf = liste.length > 0 ?
    Math.round(liste.reduce((sum, row) => sum + (row.verimlilikPerf ?? 0), 0) / liste.length) : 0;

  // Verimlilik ortalama kutusunu güncelle
  const vOrtEl = document.getElementById('verimlilik-ort');
  if (vOrtEl) {
    vOrtEl.textContent = ortVPerf + '%';
    vOrtEl.style.color = getProgressColor(ortVPerf);
  }

  const verimlilikHedef2 = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);

  // performansData güncellendi; sayfalı kart renderını çağır
  _perfPage = 1;
  renderPerfTabloFromData(1);
  tablo.style.display='block';
  empty.style.display='none';
  
  updateSidebar();
  renderDashboard();

  // _usersCache'i arka planda önceden yükle — "Diğer Ekipler" butonu anında açılsın
  if (!_usersCache.length) _silentLoadUsersCache();

  // PerformansRaw'ı Sheets'e otomatik push et (overtime, mesai vb. tüm alanlarla)
  // Bu sayede "Sheets'ten Çek" yapıldığında hesaplanan veri doğru gelir.
  pushPerformansRawToSheets(liste);
  
  showFileStatus(`✅ ${liste.length}` + (translations[currentLang]||translations.tr).analysis_done, 'var(--green)');
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// CANLI GÖSTERİM FONKSİYONLARI
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

// ────────────────────────────
// CANLI GÖSTERİM SAYFA İNİT
// ────────────────────────────
function initCanliPage() {
  console.log('🎬 Canlı sayfa başlatılıyor...');
  showWelcomeScreen();
  updateSlideWelcomeStats();
  renderTopInspectors();
  console.log('✅ Canlı sayfa hazır');
}

function updateSlideWelcomeStats() {
  const totalInspectors = performansData.length;
  const avgPerformance = totalInspectors > 0 
    ? Math.round(performansData.reduce((sum, i) => sum + getDispPerf(i), 0) / totalInspectors)
    : 0;
  
  document.getElementById('welcome-total').textContent = totalInspectors;
  document.getElementById('welcome-avg').textContent = avgPerformance + '%';
}

// ────────────────────────────
// SLIDESHOW KONTROLÜ
// ────────────────────────────
function toggleSlideshow() {
  if (slideshowActive) {
    stopSlideshow();
  } else {
    startSlideshow();
  }
}

function startSlideshow() {
  if (!performansData.length) {
    alert((translations[currentLang]||translations.tr).no_perf_alert);
    return;
  }
  
  slideshowActive = true;
  currentSlideIndex = 0;
  
  // Kontrol panelini gizle
  document.getElementById('canli-controls').style.display = 'none';
  
  // Buton metnini değiştir
  document.getElementById('slideshow-btn').innerHTML = (translations[currentLang]||translations.tr).stop_slideshow;
  
  // Inspector listesini hazırla
  prepareSlideshow();
  
  // İlk slaydı göster
  showSlide(0);
  
  // Otomatik geçişi başlat
  startAutoSlide();
  
  // Header bilgilerini güncelle
  updateSlideHeader();

  // Görsel geliştirmeler
  document.getElementById('slideshow-container').classList.add('running');
  _initParticles();
  _startCountdownRing();
  
  console.log('🎬 Slideshow başlatıldı:', slideshowInspectors.length, 'inspector');
}

function stopSlideshow() {
  slideshowActive = false;
  
  // Intervalları temizle
  if (slideshowInterval) {
    clearInterval(slideshowInterval);
    slideshowInterval = null;
  }
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  
  // Kontrol panelini göster
  document.getElementById('canli-controls').style.display = 'block';
  
  // Buton metnini değiştir
  document.getElementById('slideshow-btn').innerHTML = '<svg width=14 height=14 viewBox="0 0 24 24" fill="currentColor" style="margin-right:4px"><polygon points="5,3 19,12 5,21"/></svg> ' + (translations[currentLang]||translations.tr).start_slideshow;
  
  // Welcome ekranını göster
  showWelcomeScreen();

  // Görsel geliştirmeler kaldır
  document.getElementById('slideshow-container').classList.remove('running');
  _stopCountdownRing();
  
  console.log('⏸️ Slideshow durduruldu');
}

function resetSlideshow() {
  stopSlideshow();
  currentSlideIndex = 0;
  showWelcomeScreen();
}

// ────────────────────────────
// SLIDESHOW HAZIRLIK
// ────────────────────────────
function prepareSlideshow() {
  console.log('🎬 Slideshow hazırlanıyor...', performansData.length, 'inspector mevcut');
  
  let inspectors = [...performansData];
  
  // Görüntüleme moduna göre filtrele — Düz. Performans (getDispPerf) bazında
  switch(displayMode) {
    case 'top5':
      inspectors = inspectors
        .sort((a, b) => getDispPerf(b) - getDispPerf(a))
        .slice(0, 10);
      break;
    case 'excellent':
      inspectors = inspectors.filter(i => getDispPerf(i) >= 95);
      break;
    case 'good':
      inspectors = inspectors.filter(i => getDispPerf(i) >= 85);
      break;
    default: // 'all'
      inspectors = inspectors.sort((a, b) => getDispPerf(b) - getDispPerf(a));
  }
  
  slideshowInspectors = inspectors;
  console.log('📊 Slideshow için hazırlanan inspector sayısı:', slideshowInspectors.length);
  
  // Sol paneli güncelle
  renderTopInspectors();
  
  // Duyuruları güncelle
  updateAnnouncements();
}

function updateAnnouncements() {
  const announcements = [];
  
  if (slideshowInspectors.length > 0) {
    const best = slideshowInspectors[0];
    const bestPerf = Math.round(getDispPerf(best));
    
    if (bestPerf >= 95) {
      announcements.push(`🏆 ${(translations[currentLang]||translations.tr).best_inspector_month}: ${best.ins} (${bestPerf}%)`);
    }
    
    const excellentCount = slideshowInspectors.filter(i => getDispPerf(i) >= 95).length;
    if (excellentCount > 0) {
      announcements.push(`⭐ ${excellentCount} Inspector mükemmel performans gösteriyor!`);
    }
    
    const avgPerf = Math.round(slideshowInspectors.reduce((sum, i) => sum + getDispPerf(i), 0) / slideshowInspectors.length);
    announcements.push(`📊 ${(translations[currentLang]||translations.tr).stat_avg_perf_plain}: ${avgPerf}% | ${(translations[currentLang]||translations.tr).stat_total_inspector}: ${slideshowInspectors.length}`);
  }
  
  // Duyuru metnini döngüsel olarak değiştir
  let announcementIndex = 0;
  const announcementElement = document.getElementById('announcement-text');
  
  function cycleAnnouncements() {
    if (announcements.length > 0) {
      announcementElement.textContent = announcements[announcementIndex];
      announcementIndex = (announcementIndex + 1) % announcements.length;
    }
  }
  
  cycleAnnouncements();
  setInterval(cycleAnnouncements, 4000);
}

// ────────────────────────────
// AYIN EN İYİ İNSPECTÖRLERİ (5 KİŞİ)
// ────────────────────────────
function renderTopInspectors() {
  const listContainer = document.getElementById('top-inspectors-list');
  
  if (!performansData || !performansData.length) {
    listContainer.innerHTML = `
      <div style="text-align:center;padding:32px 22px;color:rgba(255,255,255,.3);">
        <div style="font-size:28px;margin-bottom:10px;opacity:.5">📊</div>
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Veri Yok</div>
        <div style="font-size:10px;margin-top:6px;color:rgba(255,255,255,.2);">Excel yükleyip analiz yapın</div>
      </div>
    `;
    return;
  }

  const topInspectors = [...performansData]
    .filter(i => {
      const perf = getDispPerf(i);
      return perf !== null && perf !== undefined && !isNaN(perf) && perf > 0;
    })
    .sort((a, b) => {
      // Az veri (10 günden az) olan inspector'lar performansı ne kadar
      // yüksek olursa olsun, yeterli veriye sahip olanların ÖNÜNE geçemez.
      const aAz = azVeriMi(a.gunSayisi), bAz = azVeriMi(b.gunSayisi);
      if (aAz !== bAz) return aAz ? 1 : -1;
      return getDispPerf(b) - getDispPerf(a);
    })
    .slice(0, 10);

  if (!topInspectors.length) {
    listContainer.innerHTML = `
      <div style="text-align:center;padding:32px 22px;color:rgba(255,255,255,.3);">
        <div style="font-size:28px;margin-bottom:10px;opacity:.5">⚠️</div>
        <div style="font-size:11px;font-weight:600;">Performans verisi yok</div>
      </div>
    `;
    return;
  }

  const listHtml = topInspectors.map((inspector, index) => {
    const rank = index + 1;
    const performans = Math.round(getDispPerf(inspector));
    const performansClass = getPerformanceClass(performans);
    const rankCardClass = rank === 1 ? 'rank-1-card' : rank === 2 ? 'rank-2-card' : rank === 3 ? 'rank-3-card' : '';
    const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
    const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const t = (translations[currentLang] || translations.tr);

    const perfColor = performans >= 85 ? '#64B5F6'
      : performans >= 70 ? '#FFB74D'
      : performans >= 50 ? '#EF9A9A'
      : '#FF8A80';

    const performanceLevel = (() => {
      if (performans >= 85) return { text: 'İYİ', cls: 'badge-good' };
      if (performans >= 70) return { text: 'ORTA', cls: 'badge-average' };
      if (performans >= 50) return { text: 'GELİŞİME AÇIK', cls: 'badge-weak' };
      return { text: 'ZAYIF', cls: 'badge-verypoor' };
    })();

    return `
      <div class="top-inspector-card ${rankCardClass}" onclick="jumpToInspector('${inspector.ins.replace(/'/g, "\\'")}')">
        <div class="top-inspector-info" style="display:flex;align-items:center;gap:10px">
          <div class="top-inspector-rank ${rankClass}" style="flex-shrink:0">${rank <= 3 ? rankIcon : rank}</div>
          <div class="top-inspector-info-text" style="flex:1;min-width:0">
            <div class="top-inspector-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${inspector.ins}</div>
            <div class="top-inspector-details">
              ${formatTR((inspector.adet || 0))} ${t.units_short} · ${inspector.gunSayisi || 0} ${t.working}
            </div>
            <span class="top-inspector-badge ${performanceLevel.cls}" style="margin-top:4px;display:inline-block">${performanceLevel.text}</span>
            ${azVeriMi(inspector.gunSayisi) ? azVeriRozetiHtml('badge') : ''}
          </div>
          <div class="top-inspector-performance ${performansClass}" style="color:${perfColor};flex-shrink:0">${performans}%</div>
        </div>
      </div>
    `;
  }).join('');

  listContainer.innerHTML = listHtml;
}

// ────────────────────────────
// INSPECTOR'A ATLAMA
// ────────────────────────────
function jumpToInspector(inspectorName) {
  if (!slideshowActive || !slideshowInspectors.length) return;
  
  const targetIndex = slideshowInspectors.findIndex(i => i.ins === inspectorName);
  if (targetIndex !== -1) {
    currentSlideIndex = targetIndex;
    showSlide(currentSlideIndex);
    
    // Progress bar'ı sıfırla
    if (progressInterval) {
      clearInterval(progressInterval);
    }
    document.getElementById('progress-bar').style.width = '0%';
    
    // Otomatik geçişi yeniden başlat
    if (slideshowActive) {
      startAutoSlide();
    }
  }
}

// ────────────────────────────
// SLIDE GÖSTERME
// ────────────────────────────
function showSlide(index) {
  const mainArea = document.getElementById('slideshow-main');
  
  if (index >= slideshowInspectors.length) {
    currentSlideIndex = 0;
    index = 0;
  }
  
  const inspector = slideshowInspectors[index];
  const t = translations[currentLang] || translations.tr;
  // Düz. Performans (verimlilikPerf) varsa onu kullan, yoksa genelHizPerf
  const performans = Math.round(getDispPerf(inspector));
  const hamPerf = Math.round(inspector.genelHizPerf ?? 0);
  const performansClass = getPerformanceClass(performans);
  
  const performansLevel = getPerformanceLevelLabel(performans);
  
  const ini = inspector.ins.split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
  
  // SVG circle hesaplaması — container 150×150px → merkez (75,75), r=65
  const radius = 65;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (Math.min(performans, 150) / 150) * circumference;

  // Klasman breakdown satırları (büyük kart formatı, en fazla 3)
  const klasmanEntries = Object.entries(inspector.klasmanlar || {})
    .sort((a, b) => (b[1].adet || 0) - (a[1].adet || 0))
    .slice(0, 3);

  const klasmanRows = klasmanEntries.length ? klasmanEntries.map(([kName, kData]) => {
    const kPerf = Math.round(kData.hizPerf || 0);
    const kColor = getProgressColor(kPerf);
    const barW = Math.min(100, kPerf);
    return `<div class="slide-klasman-card">
      <div class="slide-klasman-card-top">
        <span class="slide-klasman-card-name">${kName}</span>
        <span class="slide-klasman-card-perf" style="color:${kColor}">${kPerf}%</span>
      </div>
      <div class="slide-klasman-bar"><div class="slide-klasman-bar-fill" style="width:${barW}%;background:${kColor}"></div></div>
      <div class="slide-klasman-card-adet">${formatTR((kData.adet || 0))} ${t.units_short}</div>
    </div>`;
  }).join('') : `<div style="font-size:12px;color:rgba(255,255,255,.4);text-align:center;padding:16px">${t.no_data_live}</div>`;

  // Overtime hesapları
  const otMesaiSn   = inspector.overtimeMesaiSure || 0;
  const otStdSn     = inspector.standartSureOvertime || 0;
  const otPerf       = inspector.overtimePerformans;
  const hasOvertime  = otMesaiSn > 0;
  // Overtime'da kontrol edilen tahmini adet: toplam adedin, overtime standart süre / toplam standart süre oranı kadarı
  let otAdetTahmini = null;
  if (hasOvertime && inspector.standartSure > 0 && otStdSn > 0) {
    otAdetTahmini = Math.round((inspector.adet || 0) * (otStdSn / inspector.standartSure));
  }
  const otColor = otPerf === null || otPerf === undefined ? 'rgba(255,255,255,.4)'
    : getProgressColor(otPerf);

  const overtimeBlockHtml = hasOvertime ? `
    <div class="slide-overtime-block">
      <div class="slide-overtime-header">🌙 <span>Overtime</span></div>
      <div class="slide-overtime-stats">
        <div class="slide-overtime-stat">
          <div class="slide-overtime-stat-value">${Math.round(otMesaiSn/60)}<span class="slide-overtime-unit">dk</span></div>
          <div class="slide-overtime-stat-label">Ek Mesai</div>
        </div>
        <div class="slide-overtime-stat">
          <div class="slide-overtime-stat-value" style="color:${otColor}">${otPerf !== null && otPerf !== undefined ? otPerf+'%' : '—'}</div>
          <div class="slide-overtime-stat-label">Verimlilik</div>
        </div>
        <div class="slide-overtime-stat">
          <div class="slide-overtime-stat-value">${otAdetTahmini !== null ? formatTR(otAdetTahmini) : '—'}</div>
          <div class="slide-overtime-stat-label">Kontrol Edilen (tah.)</div>
        </div>
      </div>
    </div>` : `
    <div class="slide-overtime-block slide-overtime-empty">
      <div class="slide-overtime-header">🌙 <span>Overtime</span></div>
      <div class="slide-overtime-none">Bu dönemde overtime çalışması yok</div>
    </div>`;

  const slideHtml = `
    <div class="inspector-slide active ${performansClass} anim-${animationEffect}">
      <div class="inspector-slide-header">
        <div class="inspector-slide-title">${t.detailed_perf}</div>
        <div class="inspector-slide-subtitle">${new Date().toLocaleDateString('tr-TR', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}</div>
      </div>
      
      <div class="inspector-slide-main">
        <!-- Sol: Avatar, İsim, Klasman kartları -->
        <div class="inspector-slide-avatar">
          <div class="inspector-slide-avatar-circle">
            ${ini}
          </div>
          <div class="inspector-slide-name">${inspector.ins}</div>
          <div style="font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom:14px;">
            📅 ${inspector.gunSayisi || 0} ${t.working}
          </div>
          <!-- Klasman Kartları (büyük format) -->
          <div class="slide-klasman-cards">${klasmanRows}</div>
        </div>
        
        <!-- Orta: İstatistikler + Overtime bloğu -->
        <div class="inspector-slide-center">
          <div class="inspector-slide-info">
            <div class="inspector-slide-stat">
              <div class="inspector-slide-stat-value">${formatTR((inspector.adet || 0))}</div>
              <div class="inspector-slide-stat-label">${t.total_product}</div>
            </div>
            <div class="inspector-slide-stat">
              <div class="inspector-slide-stat-value">${formatTR((inspector.kayit || 0))}</div>
              <div class="inspector-slide-stat-label">${t.record_count}</div>
            </div>
            <div class="inspector-slide-stat">
              <div class="inspector-slide-stat-value">${fmtSnKisa(inspector.standartSure||0)}</div>
              <div class="inspector-slide-stat-label">${t.std_duration}</div>
            </div>
            <div class="inspector-slide-stat">
              <div class="inspector-slide-stat-value">${Object.keys(inspector.klasmanlar || {}).length}</div>
              <div class="inspector-slide-stat-label">${t.klasman_count}</div>
            </div>
          </div>
          ${overtimeBlockHtml}
        </div>
        
        <!-- Sağ: Performans -->
        <div class="inspector-slide-performance">
          <div class="performance-circle">
            <svg viewBox="0 0 150 150">
              <circle
                class="performance-circle-bg"
                cx="75"
                cy="75"
                r="${radius}"
              />
              <circle
                class="performance-circle-progress"
                id="perf-circle-progress"
                cx="75"
                cy="75"
                r="${radius}"
                stroke-dasharray="${strokeDasharray}"
                stroke-dashoffset="${circumference}"
              />
            </svg>
            <div class="performance-circle-text">
              <div class="performance-circle-value" id="perf-circle-value">0%</div>
              <div class="performance-circle-label">${inspector.verimlilikPerf !== null && inspector.verimlilikPerf !== undefined ? t.adj_perf_label_upper : t.avg_perf_plain}</div>
            </div>
          </div>
          <div class="performance-level">${performansLevel}</div>
          ${inspector.verimlilikPerf !== null && inspector.verimlilikPerf !== undefined && hamPerf !== performans
            ? `<div style="margin-top:10px;font-size:12px;color:rgba(255,255,255,.5)">${t.raw_avg} <strong style="color:rgba(255,255,255,.75)">${hamPerf}%</strong></div>`
            : ''}
        </div>
      </div>
    </div>
  `;
  
  mainArea.innerHTML = slideHtml;

  // Performans yüzdesi + çemberi senkronize sayaç animasyonuyla doldur
  animatePerformanceCircle(performans, circumference);

  // Countdown ring'i sıfırla
  if (slideshowActive) _resetCountdownRing();
  
  // Footer bilgilerini güncelle
  updateSlideFooter(index);
}

// Performans yüzdesini (sayı) ve SVG çemberini (stroke-dashoffset) eş zamanlı,
// aynı easing eğrisiyle 0'dan hedef değere animasyonlu olarak doldurur.
function animatePerformanceCircle(targetPercent, circumference) {
  const valueEl  = document.getElementById('perf-circle-value');
  const circleEl = document.getElementById('perf-circle-progress');
  if (!valueEl || !circleEl) return;

  const duration = 1200; // ms - eski CSS transition süresiyle aynı
  const startTime = performance.now();
  // ease-out cubic (CSS cubic-bezier(.4,0,.2,1)'e yakın bir JS karşılığı)
  const easeOutCubic = x => 1 - Math.pow(1 - x, 3);

  function frame(now) {
    const elapsed = now - startTime;
    const rawProgress = Math.min(elapsed / duration, 1);
    const eased = easeOutCubic(rawProgress);

    const currentVal = Math.round(eased * targetPercent);
    valueEl.textContent = currentVal + '%';

    const currentOffset = circumference - (Math.min(eased * targetPercent, 150) / 150) * circumference;
    circleEl.style.strokeDashoffset = currentOffset;

    if (rawProgress < 1) {
      requestAnimationFrame(frame);
    } else {
      // Son karede tam hedef değere kilitle (yuvarlama hatalarını önler)
      valueEl.textContent = targetPercent + '%';
      const finalOffset = circumference - (Math.min(targetPercent, 150) / 150) * circumference;
      circleEl.style.strokeDashoffset = finalOffset;
    }
  }
  requestAnimationFrame(frame);
}

function showWelcomeScreen() {
  const mainArea = document.getElementById('slideshow-main');
  const t = translations[currentLang] || translations.tr;
  
  mainArea.innerHTML = `
    <div class="slideshow-welcome">
      <span class="welcome-icon">📺</span>
      <h2>${t.live_h2_title}</h2>
      <p>${t.live_h2_sub}</p>
      <div class="welcome-stats">
        <div class="welcome-stat">
          <div class="welcome-stat-value" id="welcome-total">0</div>
          <div class="welcome-stat-label">${t.stat_total_inspector}</div>
        </div>
        <div class="welcome-stat">
          <div class="welcome-stat-value" id="welcome-avg">0%</div>
          <div class="welcome-stat-label">${t.avg_perf_plain}</div>
        </div>
      </div>
      <button class="welcome-start-btn" onclick="toggleSlideshow()">
        ${t.start_slideshow}
      </button>
    </div>
  `;
  
  updateSlideWelcomeStats();
}

// ────────────────────────────
// OTOMATİK GEÇİŞ
// ────────────────────────────
function startAutoSlide() {
  // Mevcut interval'ları temizle
  if (slideshowInterval) clearInterval(slideshowInterval);
  if (progressInterval) clearInterval(progressInterval);
  
  // Progress bar'ı başlat
  let progressWidth = 0;
  const progressStep = 100 / (slideDuration / 100);
  
  progressInterval = setInterval(() => {
    progressWidth += progressStep;
    document.getElementById('progress-bar').style.width = progressWidth + '%';
    
    if (progressWidth >= 100) {
      clearInterval(progressInterval);
    }
  }, 100);
  
  // Slide geçişi
  slideshowInterval = setInterval(() => {
    if (slideshowActive) {
      currentSlideIndex = (currentSlideIndex + 1) % slideshowInspectors.length;
      showSlide(currentSlideIndex);
      
      // Progress bar'ı sıfırla
      progressWidth = 0;
      document.getElementById('progress-bar').style.width = '0%';
    }
  }, slideDuration);
}

// ────────────────────────────
// ANİMASYON EFEKTLERİ
// ────────────────────────────
function getAnimationName() {
  switch(animationEffect) {
    case 'fade': return 'fadeIn';
    case 'zoom': return 'zoomIn';
    case 'flip': return 'flipIn';
    default: return 'slideInLeft';
  }
}

// ────────────────────────────
// AYAR FONKSİYONLARI
// ────────────────────────────
function updateSlideDuration() {
  slideDuration = parseInt(document.getElementById('slide-duration').value);
  if (slideshowActive) {
    startAutoSlide(); // Yeni süreyle yeniden başlat
  }
}

function updateDisplayMode() {
  displayMode = document.getElementById('display-mode').value;
  if (slideshowActive) {
    prepareSlideshow();
    currentSlideIndex = 0;
    showSlide(0);
    startAutoSlide();
  }
}

function updateAnimationEffect() {
  animationEffect = document.getElementById('animation-effect').value;
}

// ────────────────────────────
// HEADER VE FOOTER GÜNCELLEMELERİ
// ────────────────────────────
function updateSlideHeader() {
  const totalInspectors = slideshowInspectors.length;
  const avgPerformance = totalInspectors > 0 
    ? Math.round(slideshowInspectors.reduce((sum, i) => sum + getDispPerf(i), 0) / totalInspectors)
    : 0;
  
  document.getElementById('slide-total-inspectors').textContent = totalInspectors;
  document.getElementById('slide-avg-performance').textContent = avgPerformance + '%';
  
  // Saati güncelle
  updateSlideClock();
  setInterval(updateSlideClock, 1000);
}

function updateSlideClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('tr-TR', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  document.getElementById('slide-current-time').textContent = timeStr;
}

function updateSlideFooter(index) {
  const total = slideshowInspectors.length;
  document.getElementById('slide-counter').textContent = `${index + 1} / ${total}`;
  
  const today = new Date().toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric'
  });
  document.getElementById('slide-date').textContent = today;
}

// ────────────────────────────
// TAM EKRAN YÖNETİMİ (GELİŞTİRİLMİŞ)
// ────────────────────────────
function toggleFullscreen() {
  const container = document.getElementById('slideshow-container');
  
  if (!document.fullscreenElement && !container.classList.contains('fullscreen-mode')) {
    // Tam ekran moduna geç
    container.classList.add('fullscreen-mode');
    
    // Tarayıcı tam ekranını da dene
    if (container.requestFullscreen) {
      container.requestFullscreen().catch(() => {
        console.log('Tarayıcı tam ekran desteklenmiyor, CSS tam ekran kullanılıyor');
      });
    }
    
    console.log('🖥️ Tam ekran modu açıldı');
  } else {
    // Tam ekran modundan çık
    container.classList.remove('fullscreen-mode');
    
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        console.log('Tam ekran çıkış hatası');
      });
    }
    
    console.log('🖥️ Tam ekran modundan çıkıldı');
  }
}

// Tam ekran değişiklik eventi (güncellendi)
document.addEventListener('fullscreenchange', function() {
  const container = document.getElementById('slideshow-container');
  const isFullscreen = !!document.fullscreenElement;
  
  if (!isFullscreen && container.classList.contains('fullscreen-mode')) {
    // Tarayıcı tam ekranından çıkıldıysa CSS tam ekranını da kapat
    container.classList.remove('fullscreen-mode');
  }
});

// ────────────────────────────
// KLAVYE KONTROLÜ (TAM EKRANDA)
// ────────────────────────────
document.addEventListener('keydown', function(e) {
  if (document.fullscreenElement && slideshowActive) {
    switch(e.key) {
      case 'ArrowRight':
      case ' ': // Space tuşu
        e.preventDefault();
        currentSlideIndex = (currentSlideIndex + 1) % slideshowInspectors.length;
        showSlide(currentSlideIndex);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        currentSlideIndex = currentSlideIndex > 0 ? currentSlideIndex - 1 : slideshowInspectors.length - 1;
        showSlide(currentSlideIndex);
        break;
      case 'Escape':
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          stopSlideshow();
        }
        break;
      case 'p':
      case 'P':
        e.preventDefault();
        toggleSlideshow();
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        toggleFullscreen();
        break;
    }
  }
  
  // Genel klavye kısayolları
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    saveData();
  }
  
  if (e.key === 'Escape') {
    if (document.getElementById('modal').classList.contains('open')) {
      closeModal();
    }
    if (document.getElementById('detail-modal').classList.contains('open')) {
      closeDetailModal();
    }
  }
  
  if (e.ctrlKey && e.key === 'n' && document.getElementById('page-klasmanlar').classList.contains('active')) {
    e.preventDefault();
    openModal();
  }
});

// ────────────────────────────
// MOUSE KONTROLÜ (TAM EKRANDA)
// ────────────────────────────
document.addEventListener('click', function(e) {
  if (document.fullscreenElement && slideshowActive) {
    const container = document.getElementById('slideshow-container');
    if (container.contains(e.target)) {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      
      if (x > width / 2) {
        // Sağ yarı - sonraki slide
        currentSlideIndex = (currentSlideIndex + 1) % slideshowInspectors.length;
        showSlide(currentSlideIndex);
      } else {
        // Sol yarı - önceki slide
        currentSlideIndex = currentSlideIndex > 0 ? currentSlideIndex - 1 : slideshowInspectors.length - 1;
        showSlide(currentSlideIndex);
      }
    }
  }

  // Diğer ekipler popup'ını dışarı tıklayınca kapat
  const popup = document.getElementById('diger-ekipler-popup');
  const btn   = document.getElementById('btn-diger-ekipler');
  if (popup && popup.style.display !== 'none' && !popup.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
    popup.style.display = 'none';
  }
});

// position:fixed popup, scroll sirasinda butonla hizasi bozulmasin diye kapatilir
window.addEventListener('scroll', () => {
  const popup = document.getElementById('diger-ekipler-popup');
  if (popup && popup.style.display !== 'none') popup.style.display = 'none';
}, true);

// ────────────────────────────
// TOUCH KONTROLÜ (MOBİL)
// ────────────────────────────
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', function(e) {
  if (document.fullscreenElement && slideshowActive) {
    touchStartX = e.changedTouches[0].screenX;
  }
});

document.addEventListener('touchend', function(e) {
  if (document.fullscreenElement && slideshowActive) {
    touchEndX = e.changedTouches[0].screenX;
    handleGesture();
  }
});

function handleGesture() {
  const threshold = 50; // minimum swipe distance
  
  if (touchEndX < touchStartX - threshold) {
    // Sol swipe - sonraki slide
    currentSlideIndex = (currentSlideIndex + 1) % slideshowInspectors.length;
    showSlide(currentSlideIndex);
  }
  
  if (touchEndX > touchStartX + threshold) {
    // Sağ swipe - önceki slide
    currentSlideIndex = currentSlideIndex > 0 ? currentSlideIndex - 1 : slideshowInspectors.length - 1;
    showSlide(currentSlideIndex);
  }
}

// GELİŞTİRİLMİŞ GÖRSELLİK YARDIMCILARI
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

// ─── PARTİKÜL EFEKTI ───
function _initParticles() {
  const container = document.getElementById('slide-particles');
  if (!container) return;
  container.innerHTML = '';
  const count = 18;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'slide-particle';
    const size = 20 + Math.random() * 60;
    const left = Math.random() * 100;
    const dur = 8 + Math.random() * 12;
    const delay = Math.random() * -15;
    p.style.cssText = `width:${size}px;height:${size}px;left:${left}%;bottom:-${size}px;animation-duration:${dur}s;animation-delay:${delay}s;`;
    container.appendChild(p);
  }
}

// ─── COUNTDOWN RING ───
let _ringInterval = null;
let _ringStartTime = null;

function _startCountdownRing() {
  _stopCountdownRing();
  const circumference = 113; // 2π × 18
  _ringStartTime = Date.now();

  function tick() {
    const elapsed = Date.now() - _ringStartTime;
    const fraction = Math.min(elapsed / slideDuration, 1);
    const offset = circumference * fraction;
    const rem = Math.max(0, Math.ceil((slideDuration - elapsed) / 1000));

    const fill = document.getElementById('ring-fill');
    const num  = document.getElementById('ring-num');
    if (fill) fill.style.strokeDashoffset = offset;
    if (num)  num.textContent = rem;

    // Color: green → amber → red
    let color = '#4CAF50';
    if (fraction > 0.7)  color = '#FF9800';
    if (fraction > 0.9)  color = '#ef5350';
    if (fill) fill.style.stroke = color;
  }

  tick();
  _ringInterval = setInterval(tick, 100);
}

function _resetCountdownRing() {
  _ringStartTime = Date.now();
}

function _stopCountdownRing() {
  if (_ringInterval) { clearInterval(_ringInterval); _ringInterval = null; }
  const fill = document.getElementById('ring-fill');
  const num  = document.getElementById('ring-num');
  if (fill) fill.style.strokeDashoffset = 0;
  if (num)  num.textContent = '';
}

// ─── showSlide'ı countdown ring ile güncelle ───
const _origShowSlide = showSlide;


// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// HD VİDEO OLUŞTURMA — Slayt başına PNG yakala → WebM video
// Yöntem: Her slayta bekle, html2canvas ile PNG al, canvas stream üzerinden MediaRecorder'a yaz
// Kesiklik sorunu giderildi: sabit FPS stream + slayt arası geçiş beklemesi
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

let _vidRecorder   = null;
let _vidChunks     = [];
let _vidSlideTimer = null;
let _vidCanvas     = null;
let _vidCtx        = null;
let _vidStream     = null;
let _vidRendering  = false;
let _vidFillTimer  = null;  // sabit FPS dolgu timer

// HD sabit çözünürlük
const VID_W = 1920;
const VID_H = 1080;
const VID_FPS = 30;

function _loadHtml2Canvas() {
  return new Promise((resolve, reject) => {
    if (window.html2canvas) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('html2canvas yüklenemedi'));
    document.head.appendChild(s);
  });
}

// Canvas stream'i canlı tutan dolgu loop — MediaRecorder boş frame görmemesi için
function _startFillLoop(ctx, w, h) {
  if (_vidFillTimer) { clearInterval(_vidFillTimer); _vidFillTimer = null; }
  _vidFillTimer = setInterval(() => {
    // Mevcut içeriği koru; tamamen siyah/boşsa canlı gradient arka plan yaz
    const px = ctx.getImageData(w>>1, h>>1, 1, 1).data;
    if (px[0] === 0 && px[1] === 0 && px[2] === 0) {
      _drawVividBg(ctx, w, h);
    } else {
      const imageData = ctx.getImageData(0, 0, w, h);
      ctx.putImageData(imageData, 0, 0);
    }
  }, 1000 / VID_FPS);
}

// Canlı arka plan: koyu lacivert → orta mavi gradient
function _drawVividBg(ctx, w, h) {
  const grd = ctx.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0,   '#0B1F3A');
  grd.addColorStop(0.4, '#102848');
  grd.addColorStop(1,   '#0D2E55');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  // Köşe aksan
  const g2 = ctx.createRadialGradient(w*0.15, h*0.85, 0, w*0.15, h*0.85, w*0.4);
  g2.addColorStop(0, 'rgba(33,150,243,0.12)');
  g2.addColorStop(1, 'transparent');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
  const g3 = ctx.createRadialGradient(w*0.85, h*0.15, 0, w*0.85, h*0.15, w*0.35);
  g3.addColorStop(0, 'rgba(21,101,192,0.10)');
  g3.addColorStop(1, 'transparent');
  ctx.fillStyle = g3;
  ctx.fillRect(0, 0, w, h);
}

function _stopFillLoop() {
  if (_vidFillTimer) { clearInterval(_vidFillTimer); _vidFillTimer = null; }
}

async function startVideoRecording() {
  if (!performansData.length) {
    alert('⚠️ Önce Performans Analizi sayfasından Excel yükleyin ve veri oluşturun!');
    return;
  }
  if (_vidRendering) {
    _stopVideoRecording();
    return;
  }

  prepareSlideshow();
  const inspCount = slideshowInspectors.length;
  if (!inspCount) { alert('Gösterilecek inspector yok!'); return; }

  const perSlideSec = parseInt(document.getElementById('slide-duration')?.value || 5000) / 1000;
  const totalMin = Math.ceil((inspCount * perSlideSec + 5) / 60);

  if (!confirm(
    `🎥 HD Video Oluşturma (1920×1080)

` +
    `• ${inspCount} inspector × ${perSlideSec}sn ≈ ${totalMin} dk
` +
    `• Çözünürlük: 1920×1080 (Full HD)
` +
    `• Format: WebM (tüm tarayıcılarda desteklenir)
` +
    `• Oluşturma sırasında sayfada başka işlem yapmayın

` +
    `Başlamak istiyor musunuz?`
  )) return;

  const loadBtn = document.getElementById('video-rec-btn');
  loadBtn.innerHTML = '⏳ Hazırlanıyor...';
  loadBtn.disabled = true;

  try {
    await _loadHtml2Canvas();
  } catch(e) {
    alert('❌ html2canvas yüklenemedi: ' + e.message);
    loadBtn.innerHTML = '🎥 Video Oluştur';
    loadBtn.disabled = false;
    return;
  }

  // HD canvas oluştur
  _vidCanvas = document.createElement('canvas');
  _vidCanvas.width  = VID_W;
  _vidCanvas.height = VID_H;
  _vidCtx = _vidCanvas.getContext('2d', { alpha: false });

  // Canlı gradient arka planla başlat
  _drawVividBg(_vidCtx, VID_W, VID_H);

  // Stream al
  _vidStream = _vidCanvas.captureStream(VID_FPS);

  // En yüksek kalite codec seç
  const mimeType = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ].find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';

  _vidRecorder = new MediaRecorder(_vidStream, {
    mimeType,
    videoBitsPerSecond: 12_000_000  // 12 Mbps — HD kalite
  });
  _vidChunks = [];
  _vidRecorder.ondataavailable = e => { if (e.data?.size > 0) _vidChunks.push(e.data); };
  _vidRecorder.onstop = _finishVideo;
  _vidRecorder.start(200);  // Her 200ms'de bir chunk → akıcı kayıt
  _vidRendering = true;

  // Dolgu loop başlat (kesiklik önlenir)
  _startFillLoop(_vidCtx, VID_W, VID_H);

  loadBtn.innerHTML = '⏹️ Durdur';
  loadBtn.className = 'btn btn-warning';
  loadBtn.disabled  = false;
  loadBtn.onclick   = _stopVideoRecording;

  if (slideshowActive) stopSlideshow();
  slideshowActive = true;
  const canliCtrl = document.getElementById('canli-controls');
  if (canliCtrl) canliCtrl.style.display = 'none';
  document.getElementById('slideshow-btn').innerHTML = (translations[currentLang]||translations.tr).stop_slideshow;

  _showRecordingIndicator();
  showSuccessMessage((translations[currentLang]||translations.tr).hd_recording, 4000);

  await _renderAllSlidesHD(inspCount, perSlideSec);

  _stopVideoRecording();
}

async function _renderAllSlidesHD(total, perSlideSec) {
  const container = document.getElementById('slideshow-container');

  for (let i = 0; i < total && _vidRendering; i++) {
    currentSlideIndex = i;
    showSlide(i);
    _updateRecordProgress(i + 1, total);

    // Animasyon + DOM render için bekle
    await _sleep(120);

    // Slayt fotoğrafını çek (yüksek kalite)
    try {
      // Gerçek boyutları al; 0 ise güvenli fallback
      const cW = container.offsetWidth  || container.getBoundingClientRect().width  || 1280;
      const cH = container.offsetHeight || container.getBoundingClientRect().height || 720;
      const bestScale = Math.min(VID_W / cW, 4); // max 4× güvenlik sınırı

      // Arka planı garantile (canlı gradient)
      _drawVividBg(_vidCtx, VID_W, VID_H);

      const tempCanvas = await html2canvas(container, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,   // container kendi arka planını taşısın
        scale: bestScale,
        logging: false,
        removeContainer: false,
        imageTimeout: 0,
        foreignObjectRendering: false
      });

      // Dolgu loop durdur — şimdi gerçek frame yazacağız
      _stopFillLoop();

      // HD canvas'a çiz
      _vidCtx.drawImage(tempCanvas, 0, 0, VID_W, VID_H);

      // Slayt süresi boyunca aynı frame'i tut (akıcı tutmak için mini loop)
      const slideEnd = Date.now() + (perSlideSec * 1000);
      while (Date.now() < slideEnd && _vidRendering) {
        // Frame'i yenile (freeze kalmaması için)
        _vidCtx.drawImage(tempCanvas, 0, 0, VID_W, VID_H);
        await _sleep(1000 / VID_FPS);
      }

      // Dolgu loop tekrar başlat
      _startFillLoop(_vidCtx, VID_W, VID_H);

    } catch(err) {
      console.warn('Slayt render hatası:', err);
      // Hata durumunda geçiş yap
      await _sleep(perSlideSec * 1000);
    }
  }
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function _stopVideoRecording() {
  _vidRendering = false;
  _stopFillLoop();
  clearTimeout(_vidSlideTimer);

  if (_vidRecorder && _vidRecorder.state !== 'inactive') {
    _vidRecorder.stop();
  }
  if (_vidStream) {
    _vidStream.getTracks().forEach(t => t.stop());
    _vidStream = null;
  }

  _hideRecordingIndicator();

  const btn = document.getElementById('video-rec-btn');
  if (btn) {
    btn.innerHTML = '🎥 Video Oluştur';
    btn.className = 'btn btn-success';
    btn.disabled  = false;
    btn.onclick   = startVideoRecording;
  }

  stopSlideshow();
}

function _finishVideo() {
  if (!_vidChunks.length) {
    alert('⚠️ Video verisi oluşturulamadı. Tarayıcı MediaRecorder desteğini kontrol edin.');
    return;
  }
  const mimeType = _vidChunks[0]?.type || 'video/webm';
  const blob = new Blob(_vidChunks, { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-');
  a.href     = url;
  a.download = `LCW_Inspection_HD_${date}.webm`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
  const mb = (blob.size / 1024 / 1024).toFixed(1);
  showSuccessMessage(`🎬 HD Video indirildi! ${mb} MB — 1920×1080`, 6000);
  _vidChunks = [];
}

function _showRecordingIndicator() {
  let el = document.getElementById('rec-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rec-indicator';
    el.style.cssText = `
      position:fixed;top:68px;right:20px;z-index:9998;
      background:linear-gradient(135deg,#B71C1C,#C62828);color:#fff;
      padding:8px 18px;border-radius:9px;font-size:12px;font-weight:700;
      box-shadow:0 4px 20px rgba(198,40,40,.5);
      display:flex;align-items:center;gap:8px;letter-spacing:.3px;
    `;
    document.head.insertAdjacentHTML('beforeend', `<style>
      @keyframes recPulse{0%,100%{opacity:1}50%{opacity:.7}}
      #rec-indicator{animation:recPulse 1.2s infinite;}
    </style>`);
    document.body.appendChild(el);
  }
  el.innerHTML = `<span style="width:9px;height:9px;background:#fff;border-radius:50%;display:inline-block;flex-shrink:0"></span> HD REC <span id="rec-progress" style="font-family:'DM Mono',monospace;font-size:11px;opacity:.85">0/?</span>`;
  el.style.display = 'flex';
}

function _updateRecordProgress(cur, total) {
  const el = document.getElementById('rec-progress');
  if (el) el.textContent = `${cur}/${total}`;
}

function _hideRecordingIndicator() {
  const el = document.getElementById('rec-indicator');
  if (el) el.style.display = 'none';
}



if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  window.lcDebug = {
    klasmanlar: () => klasmanlar,
    performansData: () => performansData,
    slideshowInspectors: () => slideshowInspectors,
    clearAll: () => {
      localStorage.removeItem('lc_inspection_data');
      location.reload();
    },
    addTestData: () => {
      // Test verisi ekle
      performansData = [
        {
          ins: 'Ahmet YILMAZ',
          adet: 150,
          kayit: 8,
          standartSure: 7200,
          mesaiSure: 8100,
          genelHizPerf: 89,
          gunSayisi: 3,
          klasmanlar: {
            'Pantolon': { adet: 100, standartSure: 4800, hizPerf: 92 },
            'Ceket': { adet: 50, standartSure: 2400, hizPerf: 85 }
          }
        },
        {
          ins: 'Fatma KAYA',
          adet: 200,
          kayit: 12,
          standartSure: 9600,
          mesaiSure: 9000,
          genelHizPerf: 107,
          gunSayisi: 4,
          klasmanlar: {
            'Pantolon': { adet: 120, standartSure: 5760, hizPerf: 105 },
            'Mont': { adet: 80, standartSure: 3840, hizPerf: 110 }
          }
        }
      ];
      renderDashboard();
      renderTopInspectors();
      console.log('✅ Test verisi eklendi');
    }
  };
  
  console.log('🔧 Debug fonksiyonları: lcDebug.clearAll(), lcDebug.addTestData(), lcDebug.klasmanlar()');
}

// Uygulama hazır
console.log(`✅  Inspection Performans Paneli v${APP_VERSION} hazır!`);
console.log(`📊 ${klasmanlar.length} klasman, ${performansData.length} inspector verisi yüklendi`);
// ════════════════════════════════════════════════════════════════════
// KLASMAN ANALİZ — SHEETS ENTEGRASYONU
// ════════════════════════════════════════════════════════════════════

async function pushKlasmanAnalizToSheets(liste) {
  if (SHEETS_DEVRE_DISI) return;
  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token || !liste || !liste.length) return;
  try {
    const payload = liste.map(k => ({
      ad:                  k.ad,
      standartKontrolSure: k.standartKontrolSure || 0,
      istasyonSuresi:      k.istasyonSure        || 0,
      gerceklesenOrt:      (k.toplamAdet > 0 && k.toplamFiiliSure > 0)
                           ? parseFloat((k.toplamFiiliSure / k.toplamAdet).toFixed(3)) : 0,
      toplamAdet:          k.toplamAdet          || 0,
      inspectorSayisi:     k.inspectorSayisi     || 0,
      toplamFiiliSure:     k.toplamFiiliSure     || 0,
      toplamStandartSure:  k.toplamStandartSure  || 0,
      oranToplam:          (k.toplamStandartSure > 0 && k.toplamFiiliSure > 0)
                           ? parseFloat((k.toplamFiiliSure / k.toplamStandartSure).toFixed(4)) : null
    }));
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'setKlasmanAnaliz', token, klasmanAnaliz: payload, savedAt: new Date().toISOString() }),
      mode: 'no-cors'
    });
    console.log('✅ Klasman analiz Sheets\'e gönderildi:', payload.length, 'klasman');
  } catch(err) {
    console.warn('Klasman analiz push hatası:', err.message);
  }
}

async function pushAndRenderKlasmanAnaliz() {
  renderKlasmanAnaliz();          // Önce hesapla & render et (içinde push var)
  showSuccessMessage((translations[currentLang]||translations.tr).sheets_analiz_sent);
}

async function pullKlasmanAnalizFromSheets() {
  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token) {
    alert('⚠️ Sheets bağlantısı yapılandırılmamış!\nKlasman Yönetimi → Bağlantı Ayarları bölümünden URL ve Token girin.');
    return;
  }
  const btn = document.getElementById('kla-pull-btn');
  const orig = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = (translations[currentLang]||translations.tr).pulling; btn.disabled = true; }
  try {
    const data = await jsonpFetch(url, { action: 'getKlasmanAnaliz', token });
    if (data.status === 'ok' && Array.isArray(data.klasmanAnaliz) && data.klasmanAnaliz.length > 0) {
      // Sheets'ten gelen veriyi _klAnalizTumListe'ye de yaz (Süre Önerisi için)
      _klAnalizTumListe = data.klasmanAnaliz.map(k => ({
        ad:                k.ad,
        toplamAdet:        k.toplamAdet        || 0,
        toplamFiiliSure:   k.toplamFiiliSure   || 0,
        toplamStandartSure:k.toplamStandartSure|| 0,
        inspectorSayisi:   k.inspectorSayisi   || 0,
        standartKontrolSure: k.standartKontrolSure || 0,
        istasyonSure:      k.istasyonSuresi    || 0,
        kayitSayisi:       0,
        adetListesi:       []
      }));

      // Sheets'ten gelen veriyi ekranda göster
      const el = document.getElementById('klasman-analiz-icerik');
      if (!el) return;

      const liste = data.klasmanAnaliz;

      const kartlar = liste.map(k => {
        const std          = k.standartKontrolSure || 0;
        const toplamOran   = (k.toplamStandartSure > 0 && k.toplamFiiliSure > 0)
                             ? k.toplamFiiliSure / k.toplamStandartSure : null;
        const gerceklesen  = k.gerceklesenOrt > 0
                             ? k.gerceklesenOrt
                             : (k.toplamAdet > 0 && k.toplamFiiliSure > 0
                                ? k.toplamFiiliSure / k.toplamAdet : 0);
        const fark         = gerceklesen > 0 && std > 0 ? gerceklesen - std : null;
        const farkYuzde    = fark !== null && std > 0 ? Math.round((fark / std) * 100) : null;
        const barGenislik  = toplamOran !== null
                             ? Math.min(200, Math.round(toplamOran * 100))
                             : (gerceklesen > 0 && std > 0 ? Math.min(200, Math.round((gerceklesen / std) * 100)) : 0);
        const barRenk      = toplamOran === null && fark === null ? 'var(--muted2)'
                             : (toplamOran !== null ? toplamOran : (gerceklesen / (std||1))) <= 1 ? '#00897B'
                             : (toplamOran !== null ? toplamOran : (gerceklesen / (std||1))) <= 1.2 ? '#F57F17' : '#C62828';
        const farkIkon     = toplamOran === null && fark === null ? '—'
                             : (toplamOran !== null ? toplamOran <= 1 : fark !== null && fark <= 0)
                               ? '▼ Hedef Altında ✓' : '▲ Hedef Üstünde';

        return `
        <div style="background:#fff;border:1.5px solid var(--border2);border-radius:14px;padding:20px;box-shadow:var(--shadow);position:relative;overflow:hidden;">
          <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,${barRenk},${barRenk}88);border-radius:14px 14px 0 0;"></div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <div>
              <div style="font-size:15px;font-weight:700;color:var(--navy);">${k.ad}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px;">${formatTR((k.toplamAdet||0))} adet · ${k.inspectorSayisi||0} inspector</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:22px;font-weight:800;color:${barRenk};font-family:'DM Mono',monospace;line-height:1;">${gerceklesen > 0 ? gerceklesen.toFixed(2)+'sn' : '—'}</div>
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-top:2px;">Gerçekleşen/Adet</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
            <div style="background:var(--lblue3);border:1px solid var(--border2);border-radius:10px;padding:12px 14px;">
              <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">📐 Standart</div>
              <div style="font-size:18px;font-weight:700;color:var(--navy);font-family:'DM Mono',monospace;">${std > 0 ? std.toFixed(2)+'sn' : '—'}</div>
              <div style="font-size:10px;color:var(--muted2);margin-top:3px;">1 adet ürün kontrol</div>
              ${k.istasyonSuresi > 0 ? `<div style="font-size:10px;color:var(--muted2);margin-top:1px;">+ ${k.istasyonSuresi.toFixed(2)}sn istasyon</div>` : ''}
            </div>
            <div style="background:${fark!==null&&fark<=0?'var(--lgreen)':fark!==null&&fark<=std*0.2?'var(--lamber)':'var(--lred)'};border:1px solid ${fark!==null&&fark<=0?'#B2DFDB':fark!==null&&fark<=std*0.2?'#FFE082':'#FFCDD2'};border-radius:10px;padding:12px 14px;">
              <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">⏱ Gerçekleşen</div>
              <div style="font-size:18px;font-weight:700;color:${barRenk};font-family:'DM Mono',monospace;">${gerceklesen > 0 ? gerceklesen.toFixed(2)+'sn' : '—'}</div>
              <div style="font-size:10px;color:${barRenk};margin-top:3px;font-weight:600;">${fark !== null ? (fark>0?'+':'')+fark.toFixed(2)+'sn fark' : '—'}${farkYuzde !== null ? ` (${fark>0?'+':''}${farkYuzde}%)` : ''}</div>
            </div>
          </div>
          <div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-bottom:4px;">
              <span>Gerçekleşen / Standart oranı</span>
              <span style="font-weight:600;color:${barRenk}">${barGenislik}%</span>
            </div>
            <div style="height:8px;background:var(--border2);border-radius:4px;overflow:hidden;">
              <div style="width:${Math.min(100,barGenislik)}%;height:100%;background:${barRenk};border-radius:4px;"></div>
            </div>
          </div>
          <div style="text-align:center;padding:6px 12px;border-radius:8px;background:${fark!==null&&fark<=0?'var(--lgreen)':fark!==null?'var(--lred)':'var(--offwhite)'};border:1px solid ${fark!==null&&fark<=0?'#B2DFDB':fark!==null?'#FFCDD2':'var(--border2)'};">
            <span style="font-size:11px;font-weight:700;color:${barRenk};">${farkIkon}</span>
          </div>
        </div>`;
      }).join('');

      const hedefte   = liste.filter(k => k.gerceklesenOrt > 0 && k.standartKontrolSure > 0 && k.gerceklesenOrt <= k.standartKontrolSure).length;
      const yakin     = liste.filter(k => { const g=k.gerceklesenOrt,s=k.standartKontrolSure; return g>0&&s>0&&g>s&&g<=s*1.2; }).length;
      const yuksek    = liste.filter(k => { const g=k.gerceklesenOrt,s=k.standartKontrolSure; return g>0&&s>0&&g>s*1.2; }).length;
      const veriYok   = liste.filter(k => !k.gerceklesenOrt || !k.standartKontrolSure).length;

      el.innerHTML = `
        <div style="background:linear-gradient(135deg,var(--navy) 0%,var(--blue) 100%);border-radius:12px;padding:16px 22px;margin-bottom:20px;display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
          <div style="font-size:28px;">🎯</div>
          <div style="flex:1;">
            <div style="font-size:15px;font-weight:700;color:#fff;" data-i18n="klasman_analiz_overlay_title">Classification Analysis — Fetched from Sheets</div>
            <div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:3px;">${liste.length} klasman · ${formatTR(liste.reduce((s,k)=>s+(k.toplamAdet||0),0))} toplam adet</div>
          </div>
          ${[['✅','Hedefte',hedefte,'#4CAF50'],['⚠️','Yakın',yakin,'#FFB74D'],['🔴','Yüksek',yuksek,'#EF9A9A'],['➖','Veri Yok',veriYok,'rgba(255,255,255,.5)']].map(([ic,lb,cnt,col])=>`
          <div style="text-align:center;background:rgba(255,255,255,.1);border-radius:10px;padding:10px 16px;min-width:80px;">
            <div style="font-size:16px;">${ic}</div>
            <div style="font-size:20px;font-weight:800;color:${col};font-family:'DM Mono',monospace;line-height:1.2;">${cnt}</div>
            <div style="font-size:9px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.5px;">${lb}</div>
          </div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">${kartlar}</div>
      `;
      showSuccessMessage(`✅ ${liste.length} ` + (translations[currentLang]||translations.tr).sheets_analiz_loaded);
    } else {
      alert('ℹ️ Sheets\'te henüz klasman analiz verisi yok.\n\nÖnce "📤 Sheets\'e Gönder & Yenile" butonuna basın.');
    }
  } catch(err) {
    alert('❌ Veri çekilemedi: ' + err.message);
  } finally {
    if (btn) { btn.innerHTML = orig; btn.disabled = false; }
  }
}
