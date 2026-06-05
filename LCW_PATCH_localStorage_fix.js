/**
 * ═══════════════════════════════════════════════════════════════════
 * LC WAİKİKİ INSPECTION — localStorage Quota Fix Patch
 * Sorun: ~7MB performansData (kayitlar dahil) → 5MB localStorage limiti
 * Çözüm: localStorage'a sadece özet (~53KB) kaydet,
 *         kayitlar Sheets'te tutulsun, detay modal canlı çeksin
 * ═══════════════════════════════════════════════════════════════════
 *
 * UYGULAMA:
 * HTML dosyasında </script> kapanış etiketinden hemen önce bu satırı ekle:
 * <script src="LCW_PATCH_localStorage_fix.js"></script>
 *
 * VEYA: HTML'deki mevcut fonksiyonları aşağıdakilerle değiştir.
 * ═══════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────
// YARDIMCI: performansData'dan kayitlar'ı soyarak özet kopyası al
// Bu fonksiyon localStorage'a yazılacak minimal yapıyı döner
// ─────────────────────────────────────────────────────────────────
function stripKayitlarForStorage(liste) {
  if (!Array.isArray(liste)) return [];
  return liste.map(inspector => {
    const stripped = { ...inspector, klasmanlar: {} };
    Object.entries(inspector.klasmanlar || {}).forEach(([kAd, kData]) => {
      // kayitlar array'ini kaldır — sadece toplam değerleri tut
      const { kayitlar, ...kDataWithoutKayitlar } = kData;
      stripped.klasmanlar[kAd] = kDataWithoutKayitlar;
    });
    return stripped;
  });
}

// ─────────────────────────────────────────────────────────────────
// 1. saveData() — OVERRIDE
// localStorage'a sadece özet yazar (kayitlar hariç)
// ─────────────────────────────────────────────────────────────────
window.saveData = function() {
  try {
    const summaryPerformans = stripKayitlarForStorage(performansData);

    const data = {
      klasmanlar: klasmanlar,
      nextId: nextId,
      performansData: summaryPerformans,          // ← kayitlar'sız özet
      verimlilikHedef: parseFloat(document.getElementById('inp-verimlilik')?.value) || 100,
      savedAt: new Date().toISOString()
    };

    const json = JSON.stringify(data);
    const sizeMB = (json.length / 1024 / 1024).toFixed(2);
    console.log(`💾 localStorage'a yazılıyor: ${sizeMB} MB`);

    localStorage.setItem('lc_inspection_data', json);

    const notification = document.getElementById('save-notification');
    if (notification) {
      notification.classList.add('show');
      setTimeout(() => notification.classList.remove('show'), 3000);
    }
    console.log('✅ Veriler kaydedildi (özet, kayitlar hariç)');
  } catch (err) {
    console.error('❌ localStorage kaydetme hatası:', err);
    // Quota aşıldıysa eski veriyi temizle ve tekrar dene
    if (err.name === 'QuotaExceededError' || err.message.includes('quota')) {
      console.warn('⚠️ Quota aşımı — sadece klasmanlar kaydediliyor');
      try {
        const minData = {
          klasmanlar: klasmanlar,
          nextId: nextId,
          performansData: [],   // en kötü durumda performansData'yı boşalt
          savedAt: new Date().toISOString()
        };
        localStorage.setItem('lc_inspection_data', JSON.stringify(minData));
        showSuccessMessage('⚠️ Depolama doldu — sadece klasmanlar kaydedildi. Performans verisi Sheets\'te güvende.', 5000);
      } catch(e2) {
        console.error('❌ Minimum kayıt da başarısız:', e2);
      }
    }
  }
};

// Alias (eski kod da bu ismi çağırıyor)
window.saveDashboardData = window.saveData;

// ─────────────────────────────────────────────────────────────────
// 2. pushPerformansRawToSheets() — OVERRIDE
// Ham kayıtları Sheets'e chunk'lar halinde gönderir
// Her inspector kendi chunk'ında → büyük payload sorununu çözer
// ─────────────────────────────────────────────────────────────────
window.pushPerformansRawToSheets = async function(liste) {
  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token) return;

  try {
    // 1) Özet veriyi gönder (kayitlar hariç) — her zaman çalışır
    const ozet = stripKayitlarForStorage(liste);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'setPerformansRaw',
        token,
        performansData: ozet,
        savedAt: new Date().toISOString()
      }),
      mode: 'no-cors'
    });
    console.log('✅ Özet performans verisi Sheets\'e gönderildi:', ozet.length, 'inspector');

    // 2) Ham kayıtları inspector bazlı chunk'lar halinde gönder
    //    Her chunk = 1 inspector'ın tüm kayitlar'ı
    let successCount = 0;
    for (const inspector of liste) {
      const kayitlarObj = {};
      Object.entries(inspector.klasmanlar || {}).forEach(([kAd, kData]) => {
        if (kData.kayitlar && kData.kayitlar.length > 0) {
          // Date nesnelerini string'e çevir (JSON serialize için)
          kayitlarObj[kAd] = kData.kayitlar.map(k => ({
            ...k,
            baslangic: k.baslangic instanceof Date ? k.baslangic.toISOString() : k.baslangic,
            bitis:     k.bitis     instanceof Date ? k.bitis.toISOString()     : k.bitis
          }));
        }
      });

      if (Object.keys(kayitlarObj).length === 0) continue;

      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'setInspectorKayitlar',
            token,
            inspectorAdi: inspector.ins,
            kayitlar: kayitlarObj,
            savedAt: new Date().toISOString()
          }),
          mode: 'no-cors'
        });
        successCount++;
        // Rate limiting önlemi: her 5 inspector'dan sonra 200ms bekle
        if (successCount % 5 === 0) {
          await new Promise(r => setTimeout(r, 200));
        }
      } catch(chunkErr) {
        console.warn(`⚠️ ${inspector.ins} kayıtları gönderilemedi:`, chunkErr.message);
      }
    }
    console.log(`✅ Ham kayıtlar Sheets'e gönderildi: ${successCount}/${liste.length} inspector`);
  } catch(err) {
    console.warn('Ham performans push hatası:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────
// 3. Sheets'ten inspector kayıtlarını çek
// showInspectorDetail() çağırıldığında kullanılır
// ─────────────────────────────────────────────────────────────────
window._kayitlarCache = {}; // Oturum içi cache — tekrar çekmemek için

window.fetchInspectorKayitlarFromSheets = async function(inspectorAdi) {
  // Cache kontrolü
  if (window._kayitlarCache[inspectorAdi]) {
    console.log(`📦 Cache'den döndürüldü: ${inspectorAdi}`);
    return window._kayitlarCache[inspectorAdi];
  }

  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token) return null;

  try {
    const data = await jsonpFetch(url, {
      action: 'getInspectorKayitlar',
      token,
      inspectorAdi
    });

    if (data.status === 'ok' && data.kayitlar) {
      // Date string'lerini tekrar Date objesine çevir
      Object.values(data.kayitlar).forEach(kayitArr => {
        kayitArr.forEach(k => {
          if (k.baslangic && !(k.baslangic instanceof Date)) {
            const d = new Date(k.baslangic);
            k.baslangic = isNaN(d.getTime()) ? null : d;
          }
          if (k.bitis && !(k.bitis instanceof Date)) {
            const d = new Date(k.bitis);
            k.bitis = isNaN(d.getTime()) ? null : d;
          }
        });
      });
      window._kayitlarCache[inspectorAdi] = data.kayitlar;
      return data.kayitlar;
    }
  } catch(e) {
    console.warn(`Kayıtlar çekme hatası (${inspectorAdi}):`, e.message);
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────
// 4. showInspectorDetail() — OVERRIDE
// Kayıtları önce inspector objesinden, yoksa Sheets'ten çeker
// ─────────────────────────────────────────────────────────────────
window.showInspectorDetail = async function(inspectorName) {
  const inspector = performansData.find(i => i.ins === inspectorName);
  if (!inspector) return;
  selectedInspectorDetail = inspector;

  // Modal'ı hemen aç, loading göster
  document.getElementById('detail-modal-title').textContent = `${inspector.ins} — Detaylı Performans`;
  document.getElementById('detail-modal-content').innerHTML = `
    <div style="padding:60px 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:16px;animation:spin 1s linear infinite;display:inline-block">⏳</div>
      <div style="font-size:14px;color:var(--muted);font-weight:500">Kayıt detayları yükleniyor...</div>
      <div style="font-size:12px;color:var(--muted2);margin-top:8px">Google Sheets'ten çekiliyor</div>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `;
  document.getElementById('detail-modal').classList.add('open');

  // Kayıtlar mevcut mu kontrol et
  const hasKayitlar = Object.values(inspector.klasmanlar || {}).some(
    kd => Array.isArray(kd.kayitlar) && kd.kayitlar.length > 0
  );

  if (!hasKayitlar) {
    // Sheets'ten çek
    console.log(`📥 ${inspectorName} için Sheets'ten kayıtlar çekiliyor...`);
    const sheetsKayitlar = await fetchInspectorKayitlarFromSheets(inspectorName);

    if (sheetsKayitlar) {
      // inspector objesine kayitlar'ı ekle (oturum içi cache)
      Object.entries(sheetsKayitlar).forEach(([kAd, kayitArr]) => {
        if (inspector.klasmanlar[kAd]) {
          inspector.klasmanlar[kAd].kayitlar = kayitArr;
        }
      });
      console.log(`✅ ${inspectorName} kayıtları yüklendi`);
    } else {
      // Sheets'ten de gelmediyse özet bilgileri göster
      document.getElementById('detail-modal-content').innerHTML = `
        <div style="padding:40px 24px;text-align:center;background:var(--lamber);border-radius:10px;border:1px solid #FFE082;">
          <div style="font-size:32px;margin-bottom:12px;">⚠️</div>
          <div style="font-size:15px;font-weight:600;color:var(--amber);margin-bottom:8px;">Kayıt Detayları Bulunamadı</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.8;max-width:400px;margin:0 auto;">
            Bu inspector için ham kayıt verisi henüz Sheets'e yüklenmemiş.<br>
            <strong>Çözüm:</strong> Performans Analizi sayfasında Excel dosyasını tekrar yükleyin
            ve "📤 Sheets'e Gönder" butonuna tıklayın.<br><br>
            <em>Özet bilgiler (adet, süre, performans) mevcut ve doğru.</em>
          </div>
          <div style="margin-top:20px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:400px;margin:20px auto 0;">
            ${[
              ['📦','Adet', inspector.adet || 0],
              ['📋','Kayıt', inspector.kayit || 0],
              ['📊','Performans', (inspector.genelHizPerf ?? '—') + (inspector.genelHizPerf != null ? '%' : '')]
            ].map(([ic,lb,val]) => `
              <div style="background:white;border:1px solid var(--border2);border-radius:8px;padding:12px;text-align:center;">
                <div style="font-size:20px;">${ic}</div>
                <div style="font-size:16px;font-weight:700;color:var(--navy);font-family:'DM Mono',monospace;">${val}</div>
                <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;">${lb}</div>
              </div>`).join('')}
          </div>
        </div>
      `;
      return;
    }
  }

  // ── Orjinal showInspectorDetail içeriğini render et ──
  _renderInspectorDetailContent(inspector);
};

// ─────────────────────────────────────────────────────────────────
// 5. _renderInspectorDetailContent() — Orijinal modal içeriği
// showInspectorDetail'den ayrıldı (async yapıya uyum için)
// ─────────────────────────────────────────────────────────────────
window._renderInspectorDetailContent = function(inspector) {
  // Tüm kayıtları düz listeye çevir
  const tumKayitlar = [];
  Object.entries(inspector.klasmanlar).forEach(([klasmanAd, kd]) => {
    (kd.kayitlar || []).forEach((k) => {
      tumKayitlar.push({
        id: tumKayitlar.length + 1,
        klasman: klasmanAd,
        adet: k.adet,
        kontrolAdetSuresi: k.kontrolAdetSuresi || 0,
        istasyonSuresi: k.istasyonSuresi || 0,
        standartSure: k.standartSure || 0,
        kayitFiiliSure: k.kayitFiiliSure || 0,
        baslangic: k.baslangic,
        bitis: k.bitis,
        tarihGecerli: k.tarihGecerli,
        ortalamaKontrolSn: k.adet > 0 && k.kayitFiiliSure > 0
          ? Math.round(k.kayitFiiliSure / k.adet) : null
      });
    });
  });

  const klasmanAdlari = [...new Set(tumKayitlar.map(k => k.klasman))];

  const fmtSn = (sn) => {
    if (!sn || sn <= 0) return '—';
    const s = Math.round(sn);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}s ${String(m).padStart(2,'0')}d`;
    if (m > 0) return `${m}d ${String(s % 60).padStart(2,'0')}sn`;
    return `${s}sn`;
  };

  const fmtTarih = (d) => {
    if (!d) return '—';
    const date = (d instanceof Date) ? d : new Date(d);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit' }) +
           ' ' + date.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
  };

  const toplamAdet    = tumKayitlar.reduce((s,k) => s + k.adet, 0);
  const toplamStandart = tumKayitlar.reduce((s,k) => s + k.standartSure, 0);
  const toplamFiili   = tumKayitlar.reduce((s,k) => s + k.kayitFiiliSure, 0);
  const hamPerf       = inspector.genelHizPerf ?? 0;
  const hedef         = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);
  const totalPerf     = Math.round(hamPerf * (100 / hedef));
  const totalMesai    = inspector.mesaiSure || 0;

  const perfColor = (p) => p >= 95 ? '#00897B' : p >= 85 ? '#1565C0' : p >= 70 ? '#F57F17' : '#C62828';

  function renderKayitlar(liste) {
    if (!liste.length) return '<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--muted2);">Filtreye uyan kayıt bulunamadı.</td></tr>';
    const gruplar = {};
    liste.forEach(k => {
      if (!gruplar[k.klasman]) gruplar[k.klasman] = [];
      gruplar[k.klasman].push(k);
    });
    let html = '';
    let globalIdx = 0;
    Object.entries(gruplar).forEach(([klasmanAd, kayitlar]) => {
      const grpAdet     = kayitlar.reduce((s,k)=>s+k.adet,0);
      const grpStandart = kayitlar.reduce((s,k)=>s+k.standartSure,0);
      const grpFiili    = kayitlar.reduce((s,k)=>s+k.kayitFiiliSure,0);
      const grpOrt      = grpAdet > 0 && grpFiili > 0 ? Math.round(grpFiili / grpAdet) : null;
      html += `<tr style="background:var(--navy);color:#fff;">
        <td colspan="9" style="padding:8px 14px;font-size:12px;font-weight:700;letter-spacing:.3px;">
          📦 ${klasmanAd}
          <span style="font-weight:400;opacity:.7;margin-left:12px;font-size:11px;">
            ${kayitlar.length} kayıt &nbsp;·&nbsp; ${grpAdet} adet &nbsp;·&nbsp; ${fmtSn(grpStandart)} standart
            ${grpFiili > 0 ? ' &nbsp;·&nbsp; ' + fmtSn(grpFiili) + ' gerçekleşen' : ''}
            ${grpOrt ? ' &nbsp;·&nbsp; <strong style="color:#FFD700">ort. ' + grpOrt + 'sn/adet</strong>' : ''}
          </span>
        </td>
      </tr>`;
      kayitlar.forEach((k, i) => {
        globalIdx++;
        const rowBg = i % 2 === 0 ? '#F4F8FF' : '#fff';
        const ortSn = k.ortalamaKontrolSn;
        const ortColor = ortSn === null ? 'var(--muted2)' :
                         ortSn <= k.kontrolAdetSuresi ? '#00897B' :
                         ortSn <= k.kontrolAdetSuresi * 1.2 ? '#F57F17' : '#C62828';
        html += `<tr style="background:${rowBg};border-bottom:1px solid var(--border2);">
          <td style="padding:9px 12px;color:var(--muted2);font-size:11px;font-family:'DM Mono',monospace;text-align:center;">${globalIdx}</td>
          <td style="padding:9px 12px;font-size:12px;font-weight:600;color:var(--navy);">${k.klasman}</td>
          <td style="padding:9px 12px;text-align:center;font-family:'DM Mono',monospace;font-weight:700;font-size:14px;color:var(--navy);">${k.adet}</td>
          <td style="padding:9px 12px;text-align:center;font-family:'DM Mono',monospace;font-size:12px;color:var(--blue2);">${k.kontrolAdetSuresi}sn</td>
          <td style="padding:9px 12px;text-align:right;font-family:'DM Mono',monospace;font-size:12px;">
            <span style="color:var(--blue2)">${fmtSn(k.kontrolAdetSuresi * k.adet)}</span>
            ${k.istasyonSuresi > 0 ? `<span style="color:var(--muted);font-size:10px;display:block">+ ${fmtSn(k.istasyonSuresi)} istasyon</span>` : ''}
            <span style="color:var(--navy);font-weight:600;font-size:13px;">${fmtSn(k.standartSure)}</span>
          </td>
          <td style="padding:9px 12px;text-align:right;font-family:'DM Mono',monospace;font-size:12px;color:${k.kayitFiiliSure>0?'var(--green)':'var(--muted2)'};">${fmtSn(k.kayitFiiliSure)}</td>
          <td style="padding:9px 12px;text-align:center;font-family:'DM Mono',monospace;font-size:12px;font-weight:700;color:${ortColor};">
            ${ortSn !== null ? ortSn + 'sn' : '—'}
            ${ortSn !== null ? `<div style="font-size:9px;font-weight:400;color:${ortColor};">${ortSn <= k.kontrolAdetSuresi ? '✓ hedef' : '↑ hedefin üstü'}</div>` : '<div style="font-size:9px;color:var(--muted2);">tarih yok</div>'}
          </td>
          <td style="padding:9px 12px;text-align:center;font-size:11px;color:var(--muted);">
            ${k.tarihGecerli && k.baslangic ? fmtTarih(k.baslangic) : '—'}
          </td>
          <td style="padding:9px 12px;text-align:center;font-size:11px;color:var(--muted);">
            ${k.tarihGecerli && k.bitis ? fmtTarih(k.bitis) : '—'}
          </td>
        </tr>`;
      });
    });
    return html;
  }

  function applyFilters() {
    const klasmanFilter = document.getElementById('det-filter-klasman')?.value || '';
    const sortFilter    = document.getElementById('det-filter-sort')?.value    || 'default';
    const minAdet       = parseInt(document.getElementById('det-filter-minadet')?.value) || 0;
    const tarihFilter   = document.getElementById('det-filter-tarih')?.value   || '';
    let filtered = tumKayitlar.filter(k => {
      if (klasmanFilter && k.klasman !== klasmanFilter) return false;
      if (minAdet > 0 && k.adet < minAdet) return false;
      if (tarihFilter === 'withdate' && !k.tarihGecerli) return false;
      if (tarihFilter === 'nodate'   &&  k.tarihGecerli) return false;
      return true;
    });
    if (sortFilter === 'adet-desc')     filtered.sort((a,b) => b.adet - a.adet);
    else if (sortFilter === 'adet-asc') filtered.sort((a,b) => a.adet - b.adet);
    else if (sortFilter === 'standart-desc') filtered.sort((a,b) => b.standartSure - a.standartSure);
    else if (sortFilter === 'ort-desc') filtered.sort((a,b) => (b.ortalamaKontrolSn||0) - (a.ortalamaKontrolSn||0));
    else if (sortFilter === 'ort-asc')  filtered.sort((a,b) => (a.ortalamaKontrolSn||Infinity) - (b.ortalamaKontrolSn||Infinity));
    else if (sortFilter === 'tarih-asc') filtered.sort((a,b) => (a.baslangic||new Date(0)) - (b.baslangic||new Date(0)));
    const filtAdet     = filtered.reduce((s,k)=>s+k.adet,0);
    const filtStandart = filtered.reduce((s,k)=>s+k.standartSure,0);
    const filtFiili    = filtered.reduce((s,k)=>s+k.kayitFiiliSure,0);
    document.getElementById('det-filter-summary').innerHTML =
      `<b>${filtered.length}</b> kayıt &nbsp;·&nbsp; <b>${filtAdet}</b> adet &nbsp;·&nbsp; <b>${fmtSn(filtStandart)}</b> standart` +
      (filtFiili>0 ? ` &nbsp;·&nbsp; <b>${fmtSn(filtFiili)}</b> gerçekleşen` : '');
    document.getElementById('det-kayit-tbody').innerHTML = renderKayitlar(filtered);
  }

  document.getElementById('detail-modal-content').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px;">
      ${[
        ['📦','TOPLAM ADET',String(toplamAdet),'var(--navy)'],
        ['⏱','STANDART SÜRE',fmtSn(toplamStandart),'var(--navy)'],
        ['🕐','GERÇEKLEŞen',toplamFiili>0?fmtSn(toplamFiili):'—',toplamFiili>0?'var(--green)':'var(--muted2)'],
        ['🗓','MESAİ SÜRESİ',fmtSn(totalMesai),'var(--navy)'],
        ['📊','DÜZ. PERFORMANS',(totalPerf??0)+'%',perfColor(totalPerf)]
      ].map(([ic,lb,val,col])=>`
        <div style="background:var(--lblue3);border:1px solid var(--border2);border-radius:10px;padding:12px 8px;text-align:center;">
          <div style="font-size:16px;margin-bottom:2px;">${ic}</div>
          <div style="font-size:16px;font-weight:700;color:${col};font-family:'DM Mono',monospace;line-height:1.2;">${val}</div>
          <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;margin-top:3px;">${lb}</div>
        </div>`).join('')}
    </div>
    <div style="background:var(--offwhite);border:1px solid var(--border2);border-radius:10px;padding:12px 14px;margin-bottom:14px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
      <span style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;">🔍 Filtrele</span>
      <select id="det-filter-klasman" onchange="window._detApply && window._detApply()"
        style="padding:5px 10px;border:1px solid var(--border);border-radius:7px;font-size:12px;background:#fff;color:var(--navy);min-width:130px;">
        <option value="">Tüm Klasmanlar</option>
        ${klasmanAdlari.map(k=>`<option value="${k}">${k}</option>`).join('')}
      </select>
      <select id="det-filter-tarih" onchange="window._detApply && window._detApply()"
        style="padding:5px 10px;border:1px solid var(--border);border-radius:7px;font-size:12px;background:#fff;color:var(--navy);">
        <option value="">Tüm Kayıtlar</option>
        <option value="withdate">Tarihi Olanlar</option>
        <option value="nodate">Tarihi Olmayanlar</option>
      </select>
      <label style="font-size:11px;color:var(--muted);display:flex;align-items:center;gap:5px;">
        Min. Adet:
        <input id="det-filter-minadet" type="number" min="0" value="0" oninput="window._detApply && window._detApply()"
          style="width:60px;padding:4px 8px;border:1px solid var(--border);border-radius:7px;font-size:12px;">
      </label>
      <select id="det-filter-sort" onchange="window._detApply && window._detApply()"
        style="padding:5px 10px;border:1px solid var(--border);border-radius:7px;font-size:12px;background:#fff;color:var(--navy);">
        <option value="default">Varsayılan Sıra</option>
        <option value="adet-desc">Adet ↓</option>
        <option value="adet-asc">Adet ↑</option>
        <option value="standart-desc">Standart Süre ↓</option>
        <option value="ort-desc">Ort. Kontrol Sn ↓</option>
        <option value="ort-asc">Ort. Kontrol Sn ↑</option>
        <option value="tarih-asc">Tarihe Göre ↑</option>
      </select>
      <button onclick="document.getElementById('det-filter-klasman').value='';document.getElementById('det-filter-tarih').value='';document.getElementById('det-filter-minadet').value=0;document.getElementById('det-filter-sort').value='default';window._detApply && window._detApply();"
        style="padding:5px 12px;border:1px solid var(--border);border-radius:7px;font-size:11px;background:#fff;cursor:pointer;color:var(--muted);">↺ Sıfırla</button>
      <span id="det-filter-summary" style="margin-left:auto;font-size:11px;color:var(--muted);font-family:'DM Mono',monospace;"></span>
    </div>
    <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border2);max-height:420px;overflow-y:auto;">
      <table style="width:100%;border-collapse:collapse;min-width:880px;">
        <thead style="position:sticky;top:0;z-index:10;">
          <tr style="background:var(--navy2);color:#fff;">
            <th style="padding:10px 12px;text-align:center;font-size:11px;width:40px;">#</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;">Klasman</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;">Adet</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;">Kontrol Süresi<br><span style="opacity:.6;font-weight:400">(sn/adet)</span></th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;">Standart Süre</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;">Gerçekleşen Süre</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;">Ort. Kontrol<br><span style="opacity:.6;font-weight:400">(sn/adet)</span></th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;">Başlangıç</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;">Bitiş</th>
          </tr>
        </thead>
        <tbody id="det-kayit-tbody"></tbody>
      </table>
    </div>
    <div style="margin-top:12px;padding:8px 12px;background:var(--lamber);border:1px solid #FFE082;border-radius:8px;font-size:10px;color:var(--muted);line-height:1.8;">
      <strong style="color:var(--amber);">ℹ️</strong>
      Standart = (Kontrol Süresi × Adet) + İstasyon &nbsp;|&nbsp;
      Gerçekleşen = Başlangıç–Bitiş farkı &nbsp;|&nbsp;
      Ort. Kontrol = Gerçekleşen ÷ Adet &nbsp;|&nbsp;
      <span style="color:#00897B;">✓ hedef</span> = Ort. ≤ Standart kontrol süresi
      ${tumKayitlar.length === 0 ? '<br><strong style="color:var(--red);">⚠️ Kayıt bulunamadı — Excel\'i tekrar yükleyip "📤 Sheets\'e Gönder" butonuna tıklayın.</strong>' : ''}
    </div>
  `;

  window._detApply = applyFilters;
  applyFilters();
};

// ─────────────────────────────────────────────────────────────────
// 6. Apps Script'e yeni action'lar için yardımcı
// getInspectorKayitlar / setInspectorKayitlar
// Bu action'ları Apps Script'e de eklemeniz gerekiyor (aşağıda gösterildi)
// ─────────────────────────────────────────────────────────────────

console.log(`
╔══════════════════════════════════════════════════════════════╗
║   LCW PATCH: localStorage Quota Fix — Yüklendi ✅           ║
║                                                              ║
║   • saveData() → kayitlar hariç özet kaydeder (~53 KB)     ║
║   • pushPerformansRaw → chunk'lı gönderim (108 inspector)  ║
║   • showInspectorDetail → Sheets'ten canlı çekim           ║
║   • _kayitlarCache → oturum içi tekrar çekme önlenir       ║
║                                                              ║
║   ⚠️  Apps Script'e yeni action'lar eklenmeli:             ║
║   setInspectorKayitlar / getInspectorKayitlar              ║
╚══════════════════════════════════════════════════════════════╝
`);