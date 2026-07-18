// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// VERI YÖNETİMİ (LOCALSTORAGE)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Local Storage'dan veri yükle
function restorePerformansDateObjects(liste) {
  // JSON serialize/deserialize sonrası Date nesneleri string'e dönüşür.
  // Kayıt listesindeki baslangic/bitis alanlarını tekrar Date objesine çevir.
  if (!Array.isArray(liste)) return liste;
  liste.forEach(inspector => {
    if (!inspector.klasmanlar) return;
    Object.values(inspector.klasmanlar).forEach(kd => {
      if (!Array.isArray(kd.kayitlar)) return;
      kd.kayitlar.forEach(k => {
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
  });
  return liste;
}

// ─────────────────────────────────────────────
// PULL SONRASI verimlilikPerf DÜZELT
// Sheets'ten gelen hedefVerimlilik'i inp-verimlilik input'una yazar,
// verimlilikPerf'i de bu değere göre yeniden hesaplar.
// Böylece hangi bilgisayardan pull yapılırsa yapılsın doğru değer görünür.
// ─────────────────────────────────────────────
function fixVerimlilikPerf(liste) {
  if (!Array.isArray(liste) || liste.length === 0) return liste;

  // 1) Sheets'ten gelen hedefVerimlilik değerini bul (ilk geçerli kayıttan al)
  let sheetsHedef = null;
  for (const inspector of liste) {
    if (inspector.hedefVerimlilik && inspector.hedefVerimlilik !== 100) {
      sheetsHedef = inspector.hedefVerimlilik;
      break;
    }
  }
  // Tümü 100 ise de al (en azından tutarlı olsun)
  if (!sheetsHedef) sheetsHedef = liste[0]?.hedefVerimlilik || 100;

  // 2) inp-verimlilik input'unu ve ornekleme-mod radio'sunu güncelle
  const inputEl = document.getElementById('inp-verimlilik');
  if (inputEl) {
    inputEl.value = sheetsHedef;
    const vAciklama = document.getElementById('verimlilik-aciklama');
    if (vAciklama) {
      if (sheetsHedef === 100) vAciklama.textContent = '';
      else if (sheetsHedef < 100) vAciklama.textContent = `(%${sheetsHedef} ${(translations[currentLang]||translations.tr).target_below_100} ${(100/sheetsHedef).toFixed(2)}x) `;
      else vAciklama.textContent = `(%${sheetsHedef} ${(translations[currentLang]||translations.tr).target_above_100} ${(100/sheetsHedef).toFixed(2)}x) `;
    }
  }
  // orneklemeMod radio'sunu Sheets'ten gelen değere göre set et
  const sheetsOrneklemeMod = liste[0]?.orneklemeMod || 'kapali';
  const radioEl = document.getElementById('ornekleme-' + sheetsOrneklemeMod);
  if (radioEl) radioEl.checked = true;

  // Tarihe göre farklı seviyeler (dönemler) — Sheets'ten gelen değere göre geri yükle
  const sheetsTarihliAktif = !!liste[0]?.orneklemeTarihliAktif;
  const sheetsDonemler = Array.isArray(liste[0]?.orneklemeDonemleri) ? liste[0].orneklemeDonemleri : [];
  const tarihliCb = document.getElementById('ornekleme-tarihli-aktif');
  if (tarihliCb) tarihliCb.checked = sheetsTarihliAktif;
  orneklemeDonemleri = sheetsTarihliAktif
    ? sheetsDonemler.map(p => ({ start: p.start || '', end: p.end || '', mode: p.mode || 'kapali', depolar: Array.isArray(p.depolar) ? p.depolar : [] }))
    : [];
  const tarihliWrap = document.getElementById('ornekleme-donemler-wrap');
  if (tarihliWrap) tarihliWrap.style.display = sheetsTarihliAktif ? 'flex' : 'none';
  const tarihliTag = document.getElementById('ornekleme-default-tag');
  if (tarihliTag) tarihliTag.style.display = sheetsTarihliAktif ? 'inline-block' : 'none';
  renderOrneklemeDonemleri();

  // 3) Her inspector'ın verimlilikPerf ve hedefVerimlilik'ini güncelle
  liste.forEach(inspector => {
    inspector.hedefVerimlilik = sheetsHedef;
    if (inspector.genelHizPerf !== null && inspector.genelHizPerf !== undefined) {
      inspector.verimlilikPerf = Math.round(inspector.genelHizPerf * (100 / sheetsHedef));
    }
  });
  return liste;
}

function loadData() {
  try {
    const saved = localStorage.getItem('lc_inspection_data');
    if (saved) {
      const data = JSON.parse(saved);
      klasmanlar = data.klasmanlar || [];
      nextId = data.nextId || 1;
      // Verimlilik hedefini ÖNCE geri yükle — fixVerimlilikPerf bu değeri referans alacak
      if (data.verimlilikHedef && document.getElementById('inp-verimlilik')) {
        document.getElementById('inp-verimlilik').value = data.verimlilikHedef;
      }
      // performansData'yı yükle ve verimlilikPerf'i güncelle
      // (fixVerimlilikPerf inp-verimlilik'e yazılmış olan localStorage hedefini kullanır)
      const rawListe = restorePerformansDateObjects(data.performansData || []);
      // localStorage'dan yüklerken Sheets'ten gelen hedef varsa kullan, yoksa localStorage hedefi
      const lsHedef = data.verimlilikHedef || 100;
      rawListe.forEach(inspector => {
        if (!inspector.hedefVerimlilik || inspector.hedefVerimlilik === 100) {
          inspector.hedefVerimlilik = lsHedef;
        }
        if (inspector.genelHizPerf !== null && inspector.genelHizPerf !== undefined) {
          inspector.verimlilikPerf = Math.round(inspector.genelHizPerf * (100 / inspector.hedefVerimlilik));
        }
      });
      performansData = rawListe;
      console.log('✅ localStorage\'dan yüklendi:', klasmanlar.length, 'klasman,', performansData.length, 'inspector');
    } else {
      // İlk kurulum - örnek veriler
      klasmanlar = [
        { id: 1, ad: 'Pantolon', urunKontrolSuresi: 90, olcuSuresi: 0, urunKabulSuresi: 0, istasyonlar: [
          {id: 1, ad: 'Ölçü Kontrol', sure: 120},
          {id: 2, ad: 'Dikiş Kalitesi', sure: 180},
          {id: 3, ad: 'Son Kontrol', sure: 90}
        ]},
        { id: 2, ad: 'Ceket', urunKontrolSuresi: 150, olcuSuresi: 0, urunKabulSuresi: 0, istasyonlar: [
          {id: 1, ad: 'Yaka Kontrolü', sure: 240},
          {id: 2, ad: 'Düğme Test', sure: 120},
          {id: 3, ad: 'Astar Kontrolü', sure: 180}
        ]},
        { id: 3, ad: 'Mont', urunKontrolSuresi: 120, olcuSuresi: 0, urunKabulSuresi: 0, istasyonlar: [
          {id: 1, ad: 'Ölçü Alma', sure: 180},
          {id: 2, ad: 'Fit Denemesi', sure: 360},
          {id: 3, ad: 'Pull Test', sure: 300}
        ]}
      ];
      nextId = 4;
    }
  } catch (err) {
    console.error('❌ localStorage okuma hatası:', err);
    klasmanlar = [];
    nextId = 1;
  }
}

// Local Storage'a veri kaydet
function saveData() {
  try {
    // kayitlar dizisi localStorage'a kaydedilmez - buyuk veri oldugu icin
    // 5MB kotasini asiyor. Kayitlar Sheets InspectorKayitlar sekmesinden cekilir.
    const performansDataTemiz = (performansData || []).map(inspector => {
      const klasmanlarTemiz = {};
      Object.entries(inspector.klasmanlar || {}).forEach(([k, v]) => {
        klasmanlarTemiz[k] = {
          adet: v.adet,
          standartSure: v.standartSure,
          kayitFiiliSure: v.kayitFiiliSure,
          hizPerf: v.hizPerf,
          hacimPerf: v.hacimPerf
        };
      });
      return { ...inspector, klasmanlar: klasmanlarTemiz };
    });
    const data = {
      klasmanlar: klasmanlar,
      nextId: nextId,
      performansData: performansDataTemiz,
      verimlilikHedef: parseFloat(document.getElementById('inp-verimlilik')?.value) || 100,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem('lc_inspection_data', JSON.stringify(data));
    const notification = document.getElementById('save-notification');
    notification.classList.add('show');
    setTimeout(() => { notification.classList.remove('show'); }, 3000);
    console.log('✅ Veriler localStorage\'a kaydedildi');
  } catch (err) {
    console.error('❌ localStorage kaydetme hatası:', err);
    alert('Veriler kaydedilemedi: ' + err.message);
  }
}

function saveDashboardData() { saveData(); }

async function clearDashboardData() {
  if (!confirm((translations[currentLang]||translations.tr).clear_confirm)) return;

  // ── Devam eden veri yükleme işlemini tamamen durdur ───────────────────────
  window._uploadAborted = true;

  // ── Tüm devam eden işlemleri durdur ──────────────────────────────────────
  
  // 1) Slideshow durdur
  if (slideshowActive) {
    slideshowActive = false;
    if (slideshowInterval) { clearInterval(slideshowInterval); slideshowInterval = null; }
    if (progressInterval)  { clearInterval(progressInterval);  progressInterval  = null; }
    document.getElementById('slideshow-container').classList.remove('running');
    document.getElementById('slideshow-btn').innerHTML =
      '<svg width=14 height=14 viewBox="0 0 24 24" fill="currentColor" style="margin-right:4px"><polygon points="5,3 19,12 5,21"/></svg> '
      + (translations[currentLang]||translations.tr).start_slideshow;
    const canliCtrl = document.getElementById('canli-controls');
    if (canliCtrl) canliCtrl.style.display = 'block';
    showWelcomeScreen();
  }

  // 2) HD Video kaydı durdur
  if (_vidRendering) {
    _vidRendering = false;
    _stopFillLoop();
    clearTimeout(_vidSlideTimer);
    if (_vidRecorder && _vidRecorder.state !== 'inactive') _vidRecorder.stop();
    if (_vidStream) { _vidStream.getTracks().forEach(t => t.stop()); _vidStream = null; }
    _hideRecordingIndicator();
    const vidBtn = document.getElementById('video-rec-btn');
    if (vidBtn) {
      vidBtn.innerHTML  = '🎥 Video Oluştur';
      vidBtn.className  = 'btn btn-success';
      vidBtn.disabled   = false;
      vidBtn.onclick    = startVideoRecording;
    }
  }

  // 3) Countdown ring durdur
  _stopCountdownRing();

  // 4) Klasman auto-push timer iptal et
  clearTimeout(_klasmanPushTimer);
  clearTimeout(window._configPushTimer);

  // 5) Başlangıç banner'ı gizle
  hideStartupBanner();

  // 6) Analiz overlay açıksa kapat
  const aoOv = document.getElementById('analiz-overlay');
  if (aoOv && aoOv.style.display !== 'none') closeAnalizOverlay();

  // 7) Tüm açık modalları kapat
  closeModal();
  closeDetailModal();
  const kpwOv = document.getElementById('klasman-pw-overlay');
  if (kpwOv) kpwOv.style.display = 'none';

  // ── Verileri sıfırla ──────────────────────────────────────────────────────
  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;

  const btn = document.querySelector('button[onclick="clearDashboardData()"]');
  const origText = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = (translations[currentLang]||translations.tr).clearing; btn.disabled = true; }

  performansData         = [];
  excelRows              = [];
  excelCols              = [];
  currentDashboardPage   = 1;
  filteredInspectors     = [];
  slideshowInspectors    = [];
  currentSlideIndex      = 0;
  selectedInspectorDetail = null;
  _klAnalizTumListe      = []; // Klasman Analizi de sıfırla

  saveData();
  renderDashboard();
  renderPerfTabloFromData();
  updateSidebar();
  renderTopInspectors();

  // ── Sheets temizle ────────────────────────────────────────────────────────
  if (!SHEETS_DEVRE_DISI && url && token) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'clearPerformansData', token }),
        mode: 'no-cors'
      });
      showSuccessMessage((translations[currentLang]||translations.tr).clear_ok_sheets);
    } catch(err) {
      showSuccessMessage((translations[currentLang]||translations.tr).clear_ok_local_err + err.message);
    }
  } else {
    showSuccessMessage((translations[currentLang]||translations.tr).clear_ok_local);
  }

  if (btn) { btn.innerHTML = origText; btn.disabled = false; }
  showFileStatus((translations[currentLang]||translations.tr).clear_status, 'var(--amber)');
}

// ────────────────────────────
// TARİH PARSE YARDIMCISI
// ────────────────────────────
function parseFlexibleDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number' && val > 40000 && val < 60000) {
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + val * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(val).trim();
  if (!s) return null;
  const dmyMatch = s.match(/^(\d{2})[-.](\d{2})[-.](\d{4})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmyMatch) {
    const [, dd, mm, yyyy, hh='0', min='0', ss='0'] = dmyMatch;
    const d = new Date(+yyyy, +mm - 1, +dd, +hh, +min, +ss);
    return isNaN(d.getTime()) ? null : d;
  }
  const ymdhMatch = s.match(/^(\d{4})[-.](\d{2})[-.](\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (ymdhMatch) {
    const [, yyyy, mm, dd, hh='0', min='0', ss='0'] = ymdhMatch;
    const d = new Date(+yyyy, +mm - 1, +dd, +hh, +min, +ss);
    return isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// ────────────────────────────
// ÇALIŞMA SAATLERİ HESAPLAMA
// ────────────────────────────
function hesaplaGerceklesenSure(baslangicTarih, bitisTarih) {
  if (!baslangicTarih || !bitisTarih) return null;
  const baslangic = parseFlexibleDate(baslangicTarih);
  const bitis = parseFlexibleDate(bitisTarih);
  if (!baslangic || !bitis) return null;
  if (bitis <= baslangic) return null;

  // Gece yarısını geçen kayıtları dilimlere böl: her gün ayrı hesapla
  function gunDilimleriOlustur(bas, bit) {
    const dilimler = [];
    let dilimBas = new Date(bas);
    while (dilimBas < bit) {
      const dilimBit = new Date(dilimBas);
      dilimBit.setHours(23, 59, 59, 999);
      dilimler.push([new Date(dilimBas), dilimBit < bit ? new Date(dilimBit) : new Date(bit)]);
      dilimBas = new Date(dilimBit);
      dilimBas.setMilliseconds(dilimBas.getMilliseconds() + 1); // ertesi güne geç
    }
    return dilimler;
  }

  function hesaplaTekilGun(gunBas, gunBit, sonrakiGunVarMi) {
    // O günün referans tarihi
    const gunBase = new Date(gunBas);
    gunBase.setHours(0, 0, 0, 0);

    const gun8    = new Date(gunBase); gun8.setHours(8,  0, 0, 0);
    const gun1645 = new Date(gunBase); gun1645.setHours(16, 45, 0, 0);
    const gun2000 = new Date(gunBase); gun2000.setHours(20,  0, 0, 0);

    // Gün başlangıcı: 08:00'den önce ise 08:00'e çek
    const gercekBas = gunBas < gun8 ? gun8 : gunBas;

    // Ertesi güne saran kayıt: inspector mesai sonunda (16:45) ürünü bırakmış,
    // gece devam etmemiş, sabah devam etmiştir. Bu yüzden o günün bitiş saatini
    // 16:45'e kırp. Aksi hâlde 23:59:59'a kadar çalışmış gibi hesaplanır.
    let gercekBit;
    if (sonrakiGunVarMi && gunBit.getTime() >= gun2000.getTime()) {
      gercekBit = gun1645;
    } else {
      gercekBit = gunBit > gun2000 ? gun2000 : gunBit;
    }

    if (gercekBit <= gercekBas) return 0;

    let sn = (gercekBit - gercekBas) / 1000;

    // Mola saatleri (RESMİ TAKVİM — hesaplaGunlukMesaiSuresi ile birebir aynı olmalı)
    const ogleB = new Date(gunBase); ogleB.setHours(11, 45, 0, 0);
    const ogleE = new Date(gunBase); ogleE.setHours(12, 25, 0, 0);
    const cay1B = new Date(gunBase); cay1B.setHours(10,  0, 0, 0);
    const cay1E = new Date(gunBase); cay1E.setHours(10, 15, 0, 0);
    const cay2B = new Date(gunBase); cay2B.setHours(14, 10, 0, 0);
    const cay2E = new Date(gunBase); cay2E.setHours(14, 25, 0, 0);

    function kesisimSn(mB, mE, cB, cE) {
      const start = Math.max(mB.getTime(), cB.getTime());
      const end   = Math.min(mE.getTime(), cE.getTime());
      return Math.max(0, (end - start) / 1000);
    }

    const ogleDus = kesisimSn(gercekBas, gercekBit, ogleB, ogleE);
    const cay1Dus = kesisimSn(gercekBas, gercekBit, cay1B, cay1E);
    const cay2Dus = kesisimSn(gercekBas, gercekBit, cay2B, cay2E);
    const tumMola = ogleDus + cay1Dus + cay2Dus;

    // Tüm çalışma mola saatindeyse molayı düşme (molada çalışmış sayılır)
    if (sn - tumMola > 0) {
      sn -= tumMola;
    }
    return sn;
  }

  // Gün dilimlerine böl ve her günü ayrı hesapla
  const dilimler = gunDilimleriOlustur(baslangic, bitis);
  let toplamSn = 0;
  dilimler.forEach(function(d, idx) {
    // Sonraki gün var mı? → bu dilim ertesi güne devam eden bir ara gün
    const sonrakiGunVarMi = idx < dilimler.length - 1;
    toplamSn += hesaplaTekilGun(d[0], d[1], sonrakiGunVarMi);
  });

  return toplamSn > 0 ? toplamSn : (bitis > baslangic ? 1 : null);

}

// UYARI: Bu fonksiyon yalnızca Excel'den gelen inspector kayıtlarını (parsedBaslangic/parsedBitis) alır.
// kayipZamanData buraya GİRMEMELİDİR — kayıp zaman girişleri performans hesabını etkilemez.
function hesaplaInspectorFiiliSure(kayitlar) {
  const dilimler = [];
  kayitlar.forEach(r => {
    // Güvenlik: kayipZamanData kayıtları parsedBaslangic/parsedBitis içermez, otomatik filtrelenir.
    if (!r.parsedBaslangic || !r.parsedBitis) return;
    dilimler.push([r.parsedBaslangic.getTime(), r.parsedBitis.getTime()]);
  });
  if (!dilimler.length) return null;
  dilimler.sort((a, b) => a[0] - b[0]);
  const merged = [dilimler[0]];
  for (let i = 1; i < dilimler.length; i++) {
    const last = merged[merged.length - 1];
    if (dilimler[i][0] <= last[1]) {
      last[1] = Math.max(last[1], dilimler[i][1]);
    } else {
      merged.push([...dilimler[i]]);
    }
  }
  let toplam = 0;
  merged.forEach(([ms, me]) => {
    const sn = hesaplaGerceklesenSure(new Date(ms), new Date(me));
    if (sn) toplam += sn;
  });
  return toplam > 0 ? toplam : null;
}

// Bir kaydin "bitis" zamanina gore normal mesai mi (08:00-16:45) yoksa
// overtime mi (16:45-20:00) oldugunu belirler. Kayit, bitis saatine gore siniflandirilir.
// Standart sure tum kayit icin tek bir dilime (normal veya overtime) atanir - bolunmez,
// cunku is genelde tek oturumda tamamlanir.
function kayitNormalMi(bitisDate) {
  if (!bitisDate) return true; // bilinmiyorsa normal say
  const saat = bitisDate.getHours();
  const dakika = bitisDate.getMinutes();
  const toplamDk = saat * 60 + dakika;
  const sinirDk = 16 * 60 + 45; // 16:45
  return toplamDk <= sinirDk;
}

// UYARI: Bu fonksiyon yalnızca Excel'den gelen inspectorData.kayitListesi'ni alır.
// kayipZamanData buraya GİRMEMELİDİR — kayıp zaman mesai süresini ve performansı etkilemez.
function hesaplaGunlukMesaiSuresi(kayitListesi) {
  if (!kayitListesi || kayitListesi.length === 0) return null;

  // Her gün için o günün en geç bitiş saatini bul
  const gunBitisSaatleri = {}; // key: toDateString(), value: en geç bitis Date

  kayitListesi.forEach(kayit => {
    if (!kayit.parsedBaslangic) return;
    const gun = kayit.parsedBaslangic.toDateString();
    const bitis = kayit.parsedBitis || null;
    if (!gunBitisSaatleri[gun]) {
      gunBitisSaatleri[gun] = bitis;
    } else if (bitis && bitis > gunBitisSaatleri[gun]) {
      gunBitisSaatleri[gun] = bitis;
    }
  });

  const gunSayisi = Object.keys(gunBitisSaatleri).length;
  let toplamMesaiSaniye = 0;
  let toplamMesaistiSaniye = 0; // 16:45 sonrası toplam overtime
  const gunlukOvertimeDetay = {}; // key: gunStr → overtime saniye

  Object.entries(gunBitisSaatleri).forEach(([gunStr, enGecBitis]) => {
    // O günün 08:00 ve sınır saatlerini oluştur
    const gunBase = new Date(gunStr);
    const baslangic = new Date(gunBase); baslangic.setHours(8, 0, 0, 0);
    const normalBitis = new Date(gunBase); normalBitis.setHours(16, 45, 0, 0);  // Normal mesai sonu (16:45'e kadar kapama normal sayilir)
    const mesaiBitis  = new Date(gunBase); mesaiBitis.setHours(20, 0, 0, 0);   // Mesai sonu üst sınır

    let gercekBitis;
    let overtimeSn = 0; // Bu gün için mesai üstü (16:45 sonrası) saniye

    if (!enGecBitis) {
      // Bitiş tarihi yoksa normal mesai varsay
      gercekBitis = normalBitis;
    } else if (enGecBitis >= mesaiBitis) {
      // 20:00 veya sonrası → 20:00'de kes (gece sayılmaz)
      gercekBitis = mesaiBitis;
      // Overtime = 20:00 - 16:45 = 3.25 saat - öğle sonrası çay (15:00-15:15 normalBitis'ten sonra sayılmaz)
      overtimeSn = (mesaiBitis - normalBitis) / 1000; // 3.5 saat = 12600 sn
    } else if (enGecBitis > normalBitis) {
      // 16:45 ile 20:00 arasında → mesai kaldı, gerçek bitiş saati
      gercekBitis = enGecBitis;
      overtimeSn = (enGecBitis - normalBitis) / 1000;
    } else {
      // 16:45 veya öncesi → normal gün, overtime yok
      gercekBitis = normalBitis;
    }

    // Molalar (RESMİ TAKVİM — hesaplaGerceklesenSure ile birebir aynı): öğle 11:45-12:25 (40dk), sabah çayı 10:00-10:15, öğleden sonra çayı 14:10-14:25
    let sureSn = (gercekBitis - baslangic) / 1000;
    if (sureSn <= 0) { sureSn = GUNLUK_CALISMA_SANIYE; }

    function molaDus(mB_h, mB_m, mE_h, mE_m) {
      const molaBas = new Date(gunBase); molaBas.setHours(mB_h, mB_m, 0, 0);
      const molaEnd = new Date(gunBase); molaEnd.setHours(mE_h, mE_m, 0, 0);
      const start = Math.max(baslangic.getTime(), molaBas.getTime());
      const end   = Math.min(gercekBitis.getTime(), molaEnd.getTime());
      return Math.max(0, (end - start) / 1000);
    }

    sureSn -= molaDus(11, 45, 12, 25);  // öğle molası (RESMİ: hesaplaGerceklesenSure ile aynı)
    sureSn -= molaDus(10, 0, 10, 15);   // sabah çayı
    sureSn -= molaDus(14, 10, 14, 25);  // öğleden sonra çayı (RESMİ: hesaplaGerceklesenSure ile aynı)

    toplamMesaiSaniye += Math.max(sureSn, 0);
    toplamMesaistiSaniye += Math.max(overtimeSn, 0);
    if (overtimeSn > 0) {
      gunlukOvertimeDetay[gunStr] = Math.round(overtimeSn / 60); // dakika olarak sakla
    }
  });

  return {
    gunSayisi,
    toplamMesaiSaniye,
    toplamMesaistiSaniye,   // 16:45 sonrası toplam overtime saniye
    gunlukOvertimeDetay,    // gün bazında overtime dakika
    gunlukDetay: Object.keys(gunBitisSaatleri).sort()
  };
}

function parseMesaiSuresi(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'string') {
    const s = val.trim();
    const colonMatch = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
    if (colonMatch) {
      const h = parseInt(colonMatch[1]);
      const m = parseInt(colonMatch[2]);
      const sec = colonMatch[3] ? parseInt(colonMatch[3]) : 0;
      return h * 3600 + m * 60 + sec;
    }
    const numVal = parseFloat(s);
    if (!isNaN(numVal)) {
      return numVal > 24 ? numVal * 60 : numVal * 3600;
    }
    return null;
  }
  if (typeof val === 'number') {
    return val > 24 ? val * 60 : val * 3600;
  }
  return null;
}

// ────────────────────────────
// YARDIMCILAR
// ────────────────────────────
function birAdet(k){ 
  const istasyonSuresi = k.istasyonlar.reduce((s,i)=>s+(parseFloat(i.sure)||0),0);
  const urunKontrolSuresi = parseFloat(k.urunKontrolSuresi) || 0;
  return istasyonSuresi + urunKontrolSuresi;
}

function updateSidebar(){
  const n = klasmanlar.length;
  const inspCount = performansData.length;
  document.getElementById('klasman-badge').textContent = n+' '+(translations[currentLang]||translations.tr).klasman_word;
  document.getElementById('inspector-badge').textContent = inspCount+' inspector';
  document.getElementById('nav-kl-count').textContent = n;
  document.getElementById('nav-dashboard-count').textContent = inspCount;
  document.getElementById('sb-klasman-total').textContent = n;
  document.getElementById('sb-inspector-total').textContent = inspCount;
}

function tickClock(){
  const now = new Date();
  const pad = n=>String(n).padStart(2,'0');
  document.getElementById('clock').textContent =
    pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds());
}
setInterval(tickClock,1000); tickClock();

function toggleSection(bodyId, chevronId) {
  const body = document.getElementById(bodyId);
  const chev = document.getElementById(chevronId);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chev) chev.style.transform = isOpen ? '' : 'rotate(180deg)';
}

function showPage(id, navEl){
  // Kayıp Zaman Analizi sayfasından çıkılıyorsa arkaplan otomatik yenilemeyi durdur
  if (id !== 'kayip-zaman-admin' && typeof stopKayipZamanAutoRefresh === 'function') {
    stopKayipZamanAutoRefresh();
  }
  // ── Yetki kontrolü ──────────────────────────────────────────────────────
  // Admin olmayan kullanıcılar için: kendilerine atanmayan sekmelere ve
  // her zaman admin'e özel olan klasmanlar/kullanıcılar sayfalarına erişimi engelle.
  let blocked = false;
  if (currentUser && !currentUser.isAdmin) {
    if (id === 'klasmanlar' || id === 'kullanicilar' || id === 'kayip-zaman-admin') {
      blocked = true;
    } else if (id === 'ekip-analiz') {
      blocked = !(currentUser.team || []).length;
    } else if (id === 'kayip-zaman-ekip') {
      blocked = !(currentUser.team || []).length;
    } else if (id !== 'dashboard' && !(currentUser.tabs || []).includes(id)) {
      blocked = true;
    }
  }
  if (blocked) { id = 'dashboard'; navEl = null; }

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  // navEl varsa onu, yoksa event.currentTarget kullan; yetki engeli varsa Dashboard nav'ı aktif et
  const activeNav = navEl || (blocked ? null : event?.currentTarget);
  if (activeNav) {
    activeNav.classList.add('active');
  } else if (id === 'dashboard') {
    const dashNav = document.querySelector(".nav-item[onclick*=\"showPage('dashboard'\"]");
    if (dashNav) dashNav.classList.add('active');
  }

  if(id === 'dashboard') {
    renderDashboard();
  } else if(id === 'klasman-analiz') {
    renderKlasmanAnaliz();
  } else if(id === 'canli') {
    initCanliPage();
  } else if(id === 'performans') {
    renderPerfTabloFromData();
    autoFetchPerfIfNeeded();
  } else if(id === 'kullanicilar') {
    loadAndRenderUsers();
  } else if(id === 'ekip-analiz') {
    renderEkipAnaliz();
  } else if(id === 'kayip-zaman-ekip') {
    loadKayipZamanEkip();
  } else if(id === 'kayip-zaman-admin') {
    loadKayipZamanAdmin();
  } else if(id === 'teknik-inceleme') {
    loadTeknikInceleme();
  }
}

function getPerformanceClass(performans) {
  if (performans >= 85) return 'perf-good';
  if (performans >= 70) return 'perf-average';
  if (performans >= 50) return 'perf-weak';
  return 'perf-verypoor';
}

// Gösterim için kullanılacak performans değeri:
// Eğer verimlilikPerf varsa (Düz. Performans) onu, yoksa genelHizPerf'i döner
// ── "Ne Ödül Ne Ceza" — Nötr Kayıp Zaman Sebepleri ──────────────────────
// Bu sebeplerden kaynaklanan kayıp zaman, Mesai Süresi'nden (performans
// paydasından) düşülür — inspector'ın kontrolü dışında olduğu için ne
// performansını yapay olarak yükseltir ne de cezalandırır, sadece hesap
// dışı bırakılır. "Sistemsel Hata" ve "Elektrik Kesintisi" BİLEREK dışarıda
// bırakıldı (kullanıcı talebiyle) — bu ikisi performansı etkilemeye
// (düşürmeye) devam eder.
const NOTR_KAYIP_SEBEPLERI = ['Ürün Olmaması', 'Insp. Lokasyon Değişimi', 'Diğer'];

function getNotrKayipDakikaForInspector(inspectorName) {
  const nameNorm = String(inspectorName || '').toLowerCase().trim();
  return kayipZamanData
    .filter(r => String(r.inspector || '').toLowerCase().trim() === nameNorm && NOTR_KAYIP_SEBEPLERI.includes(r.sebep))
    .reduce((sum, r) => sum + (r.sureDk || 0), 0);
}

// Ekranda gösterilen TEK performans değeri — artık "ne ödül ne ceza" ilkesini
// içeriyor: yukarıdaki nötr sebeplerden kaynaklanan kayıp zaman, mesai
// süresinden düşülüp performans BUNA GÖRE yeniden (canlı) hesaplanıyor. Bu
// sayede Excel'den SONRA girilen kayıp zaman kayıtları da anında yansır ve
// aynı düşüm başka hiçbir yerde tekrar uygulanmaz (double-counting olmaz) —
// performansHesapla() kasıtlı olarak kayıp zamandan bağımsız/ham tutulur
// (bkz. oradaki not), düzeltme SADECE burada yapılır.
function getDispPerf(inspector) {
  const standartSn = inspector.standartSure || 0;
  let mesaiSn = inspector.mesaiSure || 0;
  const statikDeger = (inspector.verimlilikPerf !== null && inspector.verimlilikPerf !== undefined)
    ? inspector.verimlilikPerf
    : (inspector.genelHizPerf ?? 0);

  if (!standartSn || !mesaiSn) return statikDeger;

  const notrKayipSn = getNotrKayipDakikaForInspector(inspector.ins) * 60;
  if (notrKayipSn > 0 && mesaiSn > notrKayipSn) {
    mesaiSn -= notrKayipSn;
  } else if (notrKayipSn === 0) {
    // Kayıp zaman yoksa statik (performansHesapla'dan gelen) değeri aynen kullan
    // — yuvarlama farklarıyla gereksiz tutarsızlık oluşmasın.
    return statikDeger;
  }

  const hedef = inspector.hedefVerimlilik || 100;
  return Math.round((standartSn / mesaiSn) * 100 * (100 / hedef));
}

function getProgressColor(performans) {
  if (performans >= 95) return '#00897B';
  if (performans >= 85) return '#1565C0';
  if (performans >= 70) return '#F57F17';
  if (performans >= 50) return '#EF5350';
  return '#B71C1C';
}

// Performans seviyesi etiketini döner (5 seviye): Mükemmel/İyi/Orta/Zayıf/Çok Zayıf
function getPerformanceLevelLabel(performans) {
  const t = translations[currentLang] || translations.tr;
  if (performans >= 85) return t.perf_good;
  if (performans >= 70) return t.perf_average;
  if (performans >= 50) return t.perf_weak;
  return t.perf_verypoor;
}

function fmtSnKisa(sn) {
  if (!sn) return '—';
  const s = Math.round(sn);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}s ${String(m).padStart(2,'0')}d` : `${m}d`;
}

// ── Türkçe Sayı Formatı (binlik nokta ayraçlı) ───────────────────────────
// toLocaleString('tr-TR') bazı ortamlarda (özellikle WebView/PWA) çalışmayabilir.
// Bu fonksiyon her durumda doğru binlik nokta ayraçlı format üretir.
function formatTR(num) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return String(Math.round(num)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// ────────────────────────────
// ÖZET İSTATİSTİKLER
// ────────────────────────────
function updateSummaryStats(inspectors) {
  const total = inspectors.length;
  // Özet istatistikler için getDispPerf() kullanılır — "ne ödül ne ceza"
  // (nötr kayıp zaman) düzeltmesini içeren TEK doğru kaynak. Eskiden burada
  // ayrı, düzeltmesiz bir yerel hesap vardı; bu, üstteki özet sayaçlarla
  // (ör. "5 İYİ") tıklanınca açılan detay popup'ının (showPerfSeviyeDetay,
  // zaten getDispPerf kullanıyordu) FARKLI sayılar göstermesine yol açıyordu.
  const getPerfVal = (i) => getDispPerf(i);

  // 5'ten 4'e indirildi (kullanıcı talebiyle): Mükemmel+İyi tek "İyi" dilimi
  // oldu (≥85%). "Zayıf" → "Gelişime Açık" (50-69%), "Çok Zayıf" → "Zayıf" (<50%).
  const good = inspectors.filter(i => getPerfVal(i) >= 85).length;
  const average = inspectors.filter(i => {
    const p = getPerfVal(i);
    return p >= 70 && p < 85;
  }).length;
  const poor = inspectors.filter(i => {
    const p = getPerfVal(i);
    return p >= 50 && p < 70;
  }).length;
  const veryPoor = inspectors.filter(i => getPerfVal(i) < 50).length;

  const validPerformances = inspectors.filter(i => 
    i.verimlilikPerf !== null && i.verimlilikPerf !== undefined || i.genelHizPerf !== null && i.genelHizPerf !== undefined
  );
  const avgPerformans = validPerformances.length > 0 
    ? Math.round(validPerformances.reduce((sum, i) => sum + getPerfVal(i), 0) / validPerformances.length)
    : 0;

  const avgWorkingDays = total > 0 
    ? Math.round(inspectors.reduce((sum, i) => sum + (i.gunSayisi || 0), 0) / total)
    : 0;

  const totalProducts = inspectors.reduce((sum, i) => sum + (i.adet || 0), 0);

  document.getElementById('good-count').textContent = good;
  document.getElementById('average-count').textContent = average;
  document.getElementById('poor-count').textContent = poor;
  if (document.getElementById('verypoor-count')) document.getElementById('verypoor-count').textContent = veryPoor;
  document.getElementById('avg-performance').textContent = avgPerformans + '%';
  document.getElementById('avg-working-days').textContent = avgWorkingDays + ' ' + (translations[currentLang]||translations.tr).days_suffix;
  document.getElementById('total-products').textContent = formatTR(totalProducts);

  renderQuarterBadge(inspectors);
}

// ― ÇEYREK BADGE ―
// Q1(2-3-4) Q2(5-6-7) Q3(8-9-10) Q4(11-12-1)
function _ayToQuarter(month) {
  if (month >= 2 && month <= 4)  return 'Q1';
  if (month >= 5 && month <= 7)  return 'Q2';
  if (month >= 8 && month <= 10) return 'Q3';
  return 'Q4';
}

var _QUARTER_META = {
  Q1: { label: 'Q1 Inspector Performansları', months: 'Şub–Mar–Nis', cls: 'q1' },
  Q2: { label: 'Q2 Inspector Performansları', months: 'May–Haz–Tem', cls: 'q2' },
  Q3: { label: 'Q3 Inspector Performansları', months: 'Ağu–Eyl–Eki', cls: 'q3' },
  Q4: { label: 'Q4 Inspector Performansları', months: 'Kas–Ara–Oca', cls: 'q4' }
};

function _buildQuarterChips(qs) {
  return qs.map(function(q) {
    var m = _QUARTER_META[q]; if (!m) return '';
    return '<div class="quarter-chip ' + m.cls + '">' +
      '<span class="qc-code">' + q + '</span>' +
      '<span>' + m.label + ' <small style="opacity:.7">(' + m.months + ')</small></span>' +
    '</div>';
  }).join('');
}

function _restoreQuarterBadge(quarters) {
  var w = document.getElementById('quarter-badge-wrap');
  var l = document.getElementById('quarter-badge-list');
  if (!w || !l || !quarters || !quarters.length) return;
  l.innerHTML = _buildQuarterChips(quarters);
  w.style.display = 'flex';
}

function renderQuarterBadge(inspectors) {
  // Sadece gerçek veri varsa badge'i güncelle; hiçbir koşulda silme
  if (!inspectors || !inspectors.length) return;
  var qs = {};
  inspectors.forEach(function(insp) {
    Object.values(insp.klasmanlar || {}).forEach(function(kd) {
      (kd.kayitlar || []).forEach(function(k) {
        var dt = k.baslangic || k.bitis;
        if (!dt) return;
        var d = dt instanceof Date ? dt : new Date(dt);
        if (isNaN(d.getTime())) return;
        qs[_ayToQuarter(d.getMonth() + 1)] = true;
      });
    });
  });
  var ordered = ['Q1','Q2','Q3','Q4'].filter(function(q) { return qs[q]; });
  if (!ordered.length) return; // tarih yoksa badge'e dokunma
  _restoreQuarterBadge(ordered);
  if (JSON.stringify(ordered) !== JSON.stringify(appConfig.activeQuarters || [])) {
    appConfig.activeQuarters = ordered;
    try { localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(appConfig)); } catch(e) {}
    clearTimeout(window._quarterPushTimer);
    window._quarterPushTimer = setTimeout(function() { pushConfigToSheets(); }, 3000);
  }
}


// ────────────────────────────
// HEDEF VERİMLİLİK DEĞİŞİNCE
// ────────────────────────────
// ─────────────────────────────────────────────
// PERFORMANS SEVİYESİ DETAY POPUP
// Genel Durum'daki 5 seviye kartına (Mükemmel/İyi/Orta/Zayıf/Çok Zayıf) tıklanınca
// o seviyedeki inspectorleri; gün sayısı, toplam adet, overtime ve performans
// oranı ile birlikte tablo halinde gösterir.
// ─────────────────────────────────────────────
const PERF_SEVIYE_TANIM = {
  good:      { label: 'İyi (≥85%)',              icon: '👍', min: 85,  max: Infinity, color: 'var(--blue)'  },
  average:   { label: 'Orta (70-84%)',           icon: '⚠️', min: 70,  max: 85,       color: 'var(--amber)' },
  weak:      { label: 'Gelişime Açık (50-69%)',  icon: '🔻', min: 50,  max: 70,       color: '#EF5350'      },
  verypoor:  { label: 'Zayıf (<50%)',             icon: '📉', min: -Infinity, max: 50, color: '#B71C1C'      }
};

// ─────────────────────────────────────────────
// KLASMAN SÜRE ÖNERİSİ (Sadece Admin)
// Klasman Yönetimi'nde "Analiz Et" butonuna basınca, o klasmanın GERÇEK
// performans verisinden (Performans Analizi'nde işlenmiş Excel verisi) adet
// başına gerçekleşen ortalama süreyi bulur ve bunun %80'i kadar bir hedef
// önerir (gerçekleşen 100sn ise hedef 80sn — performansı zorlayan bir hedef).
// Üç bilinmeyen (1 Birim Muayene + Ölçü + Ürün Kabul) olduğundan tek bir doğru
// cevap yok; üç farklı dağıtım senaryosu sunulur, admin elle seçip uygular.
// SADECE ÖNERİ sunar — hiçbir değeri otomatik kaydetmez/değiştirmez.
// ─────────────────────────────────────────────
function showKlasmanSureOnerisi(klasmanId) {
  const k = klasmanlar.find(x => x.id === klasmanId);
  const popup = document.getElementById('klasman-sure-onerisi-popup');
  const content = document.getElementById('klasman-sure-onerisi-content');
  const titleEl = document.getElementById('klasman-sure-onerisi-title');
  const subEl = document.getElementById('klasman-sure-onerisi-sub');
  if (!k || !popup || !content) return;

  titleEl.textContent = `📊 ${k.ad} — Süre Önerisi`;

  // _klAnalizTumListe, Klasman Analizi sayfasında zaten hesaplanan klasman bazlı
  // toplamları içerir (toplamAdet, toplamFiiliSure, toplamStandartSure...).
  // Excel hiç yüklenmediyse bu liste boş olur.
  const veri = (typeof _klAnalizTumListe !== 'undefined' ? _klAnalizTumListe : [])
    .find(x => x.ad === k.ad);

  if (!veri || !veri.toplamAdet || !veri.toplamFiiliSure) {
    subEl.textContent = 'Bu klasman için gerçekleşen veri bulunamadı';
    content.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--muted)">
        <div style="font-size:32px;margin-bottom:10px">📭</div>
        <div style="font-weight:600;margin-bottom:6px">Gerçekleşen veri yok</div>
        <div style="font-size:12px;line-height:1.6">
          Bu klasman için Performans Analizi sayfasında Excel yüklenmiş ve
          en az bir kayıt bu klasmana ait olmalı. Excel yükleyip tekrar deneyin.
        </div>
      </div>`;
    popup.style.display = 'flex';
    return;
  }

  // Gerçekleşen ortalama (adet başına, klasman geneli — toplam fiili / toplam adet)
  const gerceklesenAdetBasi = veri.toplamFiiliSure / veri.toplamAdet;
  const hedefAdetBasi = gerceklesenAdetBasi * 0.80; // %20 fark hedefi

  subEl.textContent = `Gerçekleşen ${gerceklesenAdetBasi.toFixed(2)}sn/adet → Hedef ${hedefAdetBasi.toFixed(2)}sn/adet (%20 zorlayıcı pay)`;

  // Mevcut değerler (referans için)
  const mevcutKontrol = parseFloat(k.urunKontrolSuresi) || 0;
  const mevcutOlcu = parseFloat(k.olcuSuresi) || 0;
  const mevcutKabul = parseFloat(k.urunKabulSuresi) || 0;
  const istasyonSuresi = k.istasyonlar.reduce((s, i) => s + (parseFloat(i.sure) || 0), 0);

  // Mevcut formülün adet başına diğer bileşenleri — ARTIK SABİT 32 ADET DEĞİL,
  // bu klasmanın GERÇEK kayıtlarından hesaplanan ortalama parti büyüklüğü kullanılır.
  // (Önceki sürümde sabit 32 varsayımı, partileri daha büyük olan klasmanlarda
  // Ölçü/Ürün Kabul katsayılarının gerçekte daha yüksek çıkmasına rağmen düşük
  // hesaplanmasına, dolayısıyla önerilen hedefin yanlışlıkla gerçekleşenden
  // daha "gevşek" çıkmasına yol açıyordu.)
  const adetListesi = veri.adetListesi || [];
  const refAdetHam = adetListesi.length
    ? Math.round(adetListesi.reduce((s, a) => s + a, 0) / adetListesi.length)
    : Math.round(veri.toplamAdet / Math.max(1, veri.kayitSayisi || 1)) || 32;
  // Güvenlik sınırı: gerçek bir partinin adedi makul aralıkta olmalı (1-2000).
  // adetListesi boş gelip kayitSayisi de yanlışlıkla çok düşükse (örn. eski/eksik
  // formatta yüklenmiş veri), refAdet'in mantıksız büyük çıkıp öneriyi
  // bozmasını engeller.
  const refAdet = Math.min(2000, Math.max(1, refAdetHam));

  function getOlcuAdetOneri(adet) {
    if (adet <= 32)  return 6;
    if (adet <= 50)  return 9;
    if (adet <= 80)  return 9;
    if (adet <= 125) return 9;
    return 12;
  }
  function getUrunKabulKatOneri(adet) {
    if (adet <= 32)  return 0.5;
    if (adet <= 80)  return 1.1;
    if (adet <= 125) return 1.2;
    return 1.3;
  }
  const olcuKat = getOlcuAdetOneri(refAdet);
  const kabulKat = getUrunKabulKatOneri(refAdet);

  // TEK ÖNERİ: Mevcut 3 bileşenin (1 Birim Muayene + Ölçü + Ürün Kabul) birbirine
  // oranı korunarak hepsi aynı katsayıyla küçültülür/büyütülür. Klasmanın mevcut
  // yapısını bozmadan, üç alanı da dolduran tek ve sağlam bir öneri sunar.
  //
  // ÖNEMLİ: "mevcut adet başına standart süre" burada TAHMİNİ bir formülle
  // (refAdet varsayımıyla) değil, klasmanın GERÇEK işlenmiş verisinden alınır:
  // veri.toplamStandartSure / veri.toplamAdet — bu, ekranda zaten "STANDART
  // (ADET BAŞI)" olarak gösterilen, her partinin kendi gerçek adediyle hesaplanmış
  // doğru değerdir. refAdet sadece klasmanın parti büyüklük profilini özetlemek
  // (ekranda göstermek) için kullanılır, asıl oran hesabını ETKİLEMEZ — böylece
  // adetListesi eksik/boş gelse veya refAdet yanlış tahmin edilse bile öneri
  // her zaman doğru ve tutarlı kalır.
  const mevcutToplamAdetBasi = veri.toplamStandartSure / veri.toplamAdet;

  // Eğer mevcut standart süre ZATEN hedeften (gerçekleşen × 0.80) düşükse,
  // klasman zaten yeterince zorlayıcı demektir (standart, gerçekleşenden daha
  // da düşük bir hedefi bile karşılıyor). Bu durumda oranKatsayi 1'i geçer ve
  // "öneri" aslında değerleri ARTIRIR — bu, zorlayıcı hedef isteğinin TAM TERSİ
  // bir etki olur. Bu yüzden oranKatsayi >= 1 ise hiçbir değişiklik önerilmez,
  // sadece klasmanın zaten hedefi karşıladığı bilgisi gösterilir.
  const oranKatsayi = mevcutToplamAdetBasi > 0 ? (hedefAdetBasi / mevcutToplamAdetBasi) : 0;
  const zatenYeterliZorlayici = mevcutToplamAdetBasi > 0 && oranKatsayi >= 1;

  let oneriKontrol, oneriOlcu, oneriKabul;
  if (zatenYeterliZorlayici) {
    // Mevcut değerleri olduğu gibi öner (değişiklik yok) — bilgilendirme amaçlı.
    oneriKontrol = mevcutKontrol;
    oneriOlcu = mevcutOlcu;
    oneriKabul = mevcutKabul;
  } else if (mevcutToplamAdetBasi > 0) {
    oneriKontrol = Math.max(0, mevcutKontrol * oranKatsayi);
    oneriOlcu = Math.max(0, mevcutOlcu * oranKatsayi);
    oneriKabul = Math.max(0, mevcutKabul * oranKatsayi);
  } else {
    // Mevcut 3 değer de sıfırsa (klasman hiç doldurulmamışsa) oranlama mümkün
    // değildir; bu özel durumda hedefin tamamı Kontrol Süresi'ne atanır.
    oneriKontrol = Math.max(0, hedefAdetBasi - (istasyonSuresi / refAdet));
    oneriOlcu = 0;
    oneriKabul = 0;
  }

  const oneriHtml = zatenYeterliZorlayici ? `
    <div style="border:1.5px solid #1565C033;border-radius:10px;padding:16px;margin-bottom:8px;background:linear-gradient(135deg,#1565C00D,transparent)">
      <div style="font-weight:700;font-size:13.5px;color:#1565C0;margin-bottom:4px">✅ Bu klasman zaten yeterince zorlayıcı</div>
      <div style="font-size:12px;color:var(--navy);line-height:1.6">
        Mevcut standart süre (<strong>${mevcutToplamAdetBasi.toFixed(2)}sn/adet</strong>), hedeflenen
        <strong>${hedefAdetBasi.toFixed(2)}sn/adet</strong>'den zaten daha düşük — yani klasman gerçekleşen
        süreyi istediğinizden de fazla zorluyor. Değerleri büyütmek bu zorlayıcılığı azaltacağından
        herhangi bir değişiklik önerilmiyor; mevcut 3 değeri olduğu gibi bırakabilirsiniz.
      </div>
    </div>` : `
    <div style="border:1.5px solid #00897B33;border-radius:10px;padding:16px;margin-bottom:8px;background:linear-gradient(135deg,#00897B0D,transparent)">
      <div style="font-weight:700;font-size:13.5px;color:#00897B;margin-bottom:4px">✓ Önerilen Süreler</div>
      <div style="font-size:11.5px;color:var(--muted2);margin-bottom:12px;line-height:1.5">Mevcut 3 değerin birbirine oranı korunarak hedefe göre ölçeklendi. Klasmanın mevcut yapısı bozulmuyor, sadece tüm değerler aynı oranda küçültülüyor.</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        <div style="background:#fff;border:1px solid var(--border2);border-radius:8px;padding:10px 12px;text-align:center">
          <div style="font-size:9.5px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">1 Birim Muayene</div>
          <div style="font-size:19px;font-weight:700;color:var(--navy);font-family:'DM Mono',monospace">${oneriKontrol.toFixed(1)}<span style="font-size:11px;color:var(--muted2)">sn</span></div>
        </div>
        <div style="background:#fff;border:1px solid var(--border2);border-radius:8px;padding:10px 12px;text-align:center">
          <div style="font-size:9.5px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Ölçü Süresi</div>
          <div style="font-size:19px;font-weight:700;color:var(--navy);font-family:'DM Mono',monospace">${oneriOlcu.toFixed(1)}<span style="font-size:11px;color:var(--muted2)">sn</span></div>
        </div>
        <div style="background:#fff;border:1px solid var(--border2);border-radius:8px;padding:10px 12px;text-align:center">
          <div style="font-size:9.5px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Ürün Kabul</div>
          <div style="font-size:19px;font-weight:700;color:var(--navy);font-family:'DM Mono',monospace">${oneriKabul.toFixed(1)}<span style="font-size:11px;color:var(--muted2)">sn</span></div>
        </div>
      </div>
      <button onclick="applyKlasmanSureOnerisi(${k.id}, ${oneriKontrol.toFixed(1)}, ${oneriOlcu.toFixed(1)}, ${oneriKabul.toFixed(1)})"
        style="width:100%;margin-top:12px;padding:9px;border-radius:8px;border:none;background:#00897B;color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif">
        ✓ Bu Öneriyi Uygula
      </button>
    </div>`;

  content.innerHTML = `
    <div style="background:var(--lblue3);border:1px solid var(--border2);border-radius:9px;padding:12px 14px;margin-bottom:16px;font-size:12px;color:var(--navy);line-height:1.7">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="color:var(--muted)">Gerçekleşen (adet başı, ortalama)</span>
        <strong style="font-family:'DM Mono',monospace">${gerceklesenAdetBasi.toFixed(2)} sn</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="color:var(--muted)">Hedef (%20 zorlayıcı pay ile, = gerçekleşen × 0.80)</span>
        <strong style="font-family:'DM Mono',monospace;color:#5E35B1">${hedefAdetBasi.toFixed(2)} sn</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted2)">
        <span>Veri kaynağı</span>
        <span>${formatTR(veri.toplamAdet)} adet · ${veri.inspectorSayisi || 0} inspector</span>
      </div>
    </div>

    ${oneriHtml}

    <div style="font-size:10px;color:var(--muted2);margin-top:4px;line-height:1.6">
      💡 Öneri, bu klasmanın <strong>gerçek kayıtlarından hesaplanan ortalama parti büyüklüğü (${refAdet} adet)</strong> referans alınarak hesaplanmıştır. Tek tek partilerin büyüklüğü farklılık gösterebileceğinden, uyguladıktan sonra "Hesaplamayı Göster" ile gerçek toplam oranı kontrol edip gerekirse elle ince ayar yapın.
    </div>
  `;

  popup.style.display = 'flex';
}

// Öneriyi tek tıkla 3 input alanına uygular (kaydetmez — input'lara yazar,
// mevcut onchange="updateX(...)" mantığı zaten devreye girer).
function applyKlasmanSureOnerisi(klasmanId, kontrol, olcu, kabul) {
  // Not: her updateX() çağrısı kendi içinde renderEditor() tetikleyip DOM'u
  // yeniden oluşturduğundan, DOM elementine önceden referans tutmak yerine
  // doğrudan veri katmanını (klasmanlar dizisini) güncelleyen fonksiyonları
  // sırayla çağırıyoruz — her biri zaten klasmanlar dizisine yazıp kaydeder.
  updateUrunKontrol(klasmanId, kontrol);
  updateOlcuSuresi(klasmanId, olcu);
  updateUrunKabulSuresi(klasmanId, kabul);

  document.getElementById('klasman-sure-onerisi-popup').style.display = 'none';
  showFileStatus('✅ Süre önerisi uygulandı — istediğiniz gibi elle ince ayar yapabilirsiniz.', 'var(--green)');
}

function showPerfSeviyeDetay(seviyeKey) {
  const tanim = PERF_SEVIYE_TANIM[seviyeKey];
  const popup = document.getElementById('perf-seviye-popup');
  const content = document.getElementById('perf-seviye-popup-content');
  const titleEl = document.getElementById('perf-seviye-popup-title');
  const subEl = document.getElementById('perf-seviye-popup-sub');
  if (!tanim || !popup || !content) return;

  if (titleEl) titleEl.textContent = `${tanim.icon} ${tanim.label} — Inspector Listesi`;

  if (!performansData || !performansData.length) {
    content.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted)">Henüz performans verisi yok</div>`;
    popup.style.display = 'flex';
    return;
  }

  // Bu seviyeye giren inspectorleri filtrele (getDispPerf: verimlilikPerf varsa onu, yoksa genelHizPerf'i kullanır)
  const liste = performansData
    .filter(i => {
      const p = getDispPerf(i);
      return p >= tanim.min && p < tanim.max;
    })
    .sort((a, b) => getDispPerf(b) - getDispPerf(a));

  if (subEl) subEl.textContent = `${liste.length} inspector bu seviyede`;

  if (!liste.length) {
    content.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted)">Bu seviyede inspector bulunamadı</div>`;
    popup.style.display = 'flex';
    return;
  }

  const rows = liste.map(insp => {
    const perf = getDispPerf(insp);
    const perfColor = getProgressColor(perf);
    const otDk = Math.round((insp.toplamMesaistiSaniye || 0) / 60);
    const otHtml = otDk > 0
      ? `<span style="color:#E65100;font-weight:600">🌙 ${otDk}dk</span>`
      : `<span style="color:var(--muted2)">—</span>`;
    return `
      <tr style="border-bottom:1px solid var(--border2)">
        <td style="padding:9px 10px;font-weight:600;color:var(--navy);cursor:pointer" onclick="document.getElementById('perf-seviye-popup').style.display='none'; showInspectorDetail('${insp.ins.replace(/'/g, "\\'")}')">${_escapeHtml(_formatDisplayName(insp.ins))}</td>
        <td style="padding:9px 10px;text-align:center;font-family:'DM Mono',monospace;color:var(--navy)">${insp.gunSayisi || 0} gün${azVeriMi(insp.gunSayisi) ? '<br>' + azVeriRozetiHtml('badge') : ''}</td>
        <td style="padding:9px 10px;text-align:center;font-family:'DM Mono',monospace;color:var(--navy)">${formatTR((insp.adet || 0))}</td>
        <td style="padding:9px 10px;text-align:center">${otHtml}</td>
        <td style="padding:9px 10px;text-align:center;font-family:'DM Mono',monospace;font-weight:700;color:${perfColor}">${perf}%</td>
      </tr>`;
  }).join('');

  const toplamAdet = liste.reduce((s, i) => s + (i.adet || 0), 0);
  const ortGun = Math.round(liste.reduce((s, i) => s + (i.gunSayisi || 0), 0) / liste.length);
  const ortPerf = Math.round(liste.reduce((s, i) => s + getDispPerf(i), 0) / liste.length);

  content.innerHTML = `
    <div style="max-height:50vh;overflow-y:auto;border:1px solid var(--border2);border-radius:10px">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead style="position:sticky;top:0;background:var(--navy);color:#fff;z-index:1">
          <tr>
            <th style="padding:9px 10px;text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px">Inspector</th>
            <th style="padding:9px 10px;text-align:center;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px">Çalışma Günü</th>
            <th style="padding:9px 10px;text-align:center;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px">Toplam Ürün</th>
            <th style="padding:9px 10px;text-align:center;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px">Overtime</th>
            <th style="padding:9px 10px;text-align:center;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px">Performans</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:14px;padding-top:12px;border-top:2px solid var(--border2);font-size:12px">
      <span style="color:var(--muted)">Toplam <strong style="color:var(--navy)">${liste.length}</strong> inspector</span>
      <span style="color:var(--muted)">Toplam Ürün: <strong style="color:var(--navy);font-family:'DM Mono',monospace">${formatTR(toplamAdet)}</strong></span>
      <span style="color:var(--muted)">Ort. Çalışma Günü: <strong style="color:var(--navy);font-family:'DM Mono',monospace">${ortGun} gün</strong></span>
      <span style="color:var(--muted)">Ort. Performans: <strong style="color:${tanim.color};font-family:'DM Mono',monospace">${ortPerf}%</strong></span>
    </div>
    <div style="font-size:10px;color:var(--muted2);margin-top:8px">💡 Bir inspector adına tıklayarak detaylı analizini açabilirsiniz.</div>
  `;

  popup.style.display = 'flex';
}

function on2KaliteDahilChange() {
  const checkbox = document.getElementById('inp-2kalite-dahil');
  _2KaliteDahil = !!(checkbox && checkbox.checked);

  // Excel verisi (ham satırlar) elimizdeyse en güvenilir yol: sıfırdan yeniden hesapla.
  // Bu, is2Kalite ayrımının her aşamada (klasman toplamları, overtime, vb.) doğru
  // uygulanmasını garanti eder — performansData üzerinde parça parça düzeltme
  // yapmak yerine performansHesapla() tüm zinciri baştan, tutarlı şekilde kurar.
  if (typeof excelRows !== 'undefined' && excelRows && excelRows.length > 0) {
    performansHesapla();
    return;
  }

  // Excel verisi yoksa (örn. localStorage'dan/Sheets'ten yüklenmiş performansData
  // var ama ham Excel satırları yok) yeniden hesaplama mümkün değil — kullanıcıyı
  // bilgilendir ve checkbox'ı eski haline döndür.
  if (performansData && performansData.length > 0) {
    showFileStatus('⚠️ Bu ayarın uygulanabilmesi için Excel dosyasını tekrar yükleyin (ham veri gerekiyor).', 'var(--amber)');
  }
}

function onOvertimeDahilChange() {
  const checkbox = document.getElementById('inp-overtime-dahil');
  _overtimeDahil = !!(checkbox && checkbox.checked);

  // Excel verisi varsa sıfırdan yeniden hesapla (en güvenilir yol)
  if (typeof excelRows !== 'undefined' && excelRows && excelRows.length > 0) {
    performansHesapla();
    return;
  }

  // Excel verisi yoksa performansData üzerinde anlık güncelle
  if (performansData && performansData.length > 0) {
    performansData.forEach(row => {
      const normalMesai = row.mesaiSure - (row.overtimeMesaiSure || 0);
      const standart  = _overtimeDahil
        ? row.standartSure
        : (row.standartSureNormal > 0 ? row.standartSureNormal : row.standartSure);
      const payda = _overtimeDahil
        ? row.mesaiSure
        : (normalMesai > 0 ? normalMesai : row.mesaiSure);
      row.genelHizPerf = payda > 0 ? Math.round((standart / payda) * 100) : row.genelHizPerf;
      row.genelPerformans = row.genelHizPerf;
      const hedef = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);
      row.verimlilikPerf = row.genelHizPerf !== null ? Math.round(row.genelHizPerf * (100 / hedef)) : null;
    });
    renderDashboard();
    renderPerfTabloFromData(1);
    updateSidebar();
  } else {
    showFileStatus('⚠️ Bu ayarın uygulanabilmesi için Excel dosyasını yükleyin.', 'var(--amber)');
  }
}

function onHedefChange() {
  // Veri varsa tablo + kartları yeniden çiz; yoksa sadece tabloyu yenile
  if (performansData && performansData.length > 0) {
    // verimlilikPerf ve hedefVerimlilik değerlerini güncelle
    const hedef = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);
    performansData.forEach(row => {
      row.hedefVerimlilik = hedef;  // ← gelecekteki push'larda doğru gitsin
      row.verimlilikPerf = row.genelHizPerf !== null && row.genelHizPerf !== undefined
        ? Math.round(row.genelHizPerf * (100 / hedef))
        : null;
    });
    renderDashboard();
    renderPerfTabloFromData();
    updateSidebar();
    // NOT: Otomatik Sheets push kaldırıldı — artık sadece "Sheets'e Gönder"
    // butonuna basıldığında gönderilir (bkz. manualPushPerformansToSheets).
    markPerformansUnsynced();
  }
  // Tabloda da güncelle (Excel yüklüyse)
  if (excelRows && excelRows.length > 0) performansHesapla();
}

// ────────────────────────────
// DASHBOARD
// ────────────────────────────
function renderDashboard() {
  if (!performansData.length) {
    const _t0 = translations[currentLang]||translations.tr;
    document.getElementById('inspector-grid').innerHTML = `
      <div class="empty">
        <div class="empty-icon">📊</div>
        <h3>${_t0.no_perf_data}</h3>
        <p>${_t0.no_perf_data_hint}</p>
      </div>
    `;
    document.getElementById('dashboard-pagination').style.display = 'none';
    updateSummaryStats([]);
    renderTeamSection();
    renderTeamManagersSection();
    return;
  }

  const hedef = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);
  const inspectors = performansData.map(inspector => ({
    ...inspector,
    performans: inspector.verimlilikPerf !== null && inspector.verimlilikPerf !== undefined
      ? inspector.verimlilikPerf
      : (inspector.genelHizPerf !== null && inspector.genelHizPerf !== undefined
          ? Math.round((inspector.genelHizPerf) * (100 / hedef))
          : 0)
  }));

  filteredInspectors = inspectors;
  updateKlasmanFilter();
  filterInspectors();
  updateSummaryStats(inspectors);
  renderTeamSection();
  renderTeamManagersSection();
}

function updateKlasmanFilter() {
  const klasmanSet = new Set();
  // performansData'daki klasmanlardan
  performansData.forEach(inspector => {
    Object.keys(inspector.klasmanlar || {}).forEach(k => klasmanSet.add(k));
  });
  // Sheets'ten çekilen klasmanlar dizisinden (performansData boş olsa bile dolar)
  klasmanlar.forEach(k => { if (k.ad) klasmanSet.add(k.ad); });

  const select = document.getElementById('klasman-filter');
  const prev = select.value;
  select.innerHTML = `<option value="">${(translations[currentLang]||translations.tr).filter_all_klasman}</option>`;
  Array.from(klasmanSet).sort().forEach(k => {
    select.innerHTML += `<option value="${k}"${k === prev ? ' selected' : ''}>${k}</option>`;
  });
}

function filterInspectors() {
  const perfFilter = document.getElementById('perf-filter').value;
  const klasmanFilter = document.getElementById('klasman-filter').value;
  const searchTerm = document.getElementById('inspector-search').value.toLowerCase();
  const sortOrder = document.getElementById('sort-order').value;

  const hedefF = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);
  let filtered = [...performansData.map(inspector => {
    // "Ne ödül ne ceza": nötr sebeplerden kaynaklanan kayıp zaman mesai
    // süresinden düşülüp performans buna göre yeniden hesaplanır — bkz.
    // renderDashboard kart hesabı ve getDispPerf ile aynı mantık, böylece
    // üstteki özet sayaçlar (Mükemmel/İyi/Orta/Zayıf) ve filtre/sıralama
    // kartlarla tutarlı kalır.
    const standartSnF = inspector.standartSure || 0;
    let mesaiSnF = inspector.mesaiSure || 0;
    const notrKayipSnF = getNotrKayipDakikaForInspector(inspector.ins) * 60;
    if (notrKayipSnF > 0 && mesaiSnF > notrKayipSnF) mesaiSnF -= notrKayipSnF;
    const hamPerfF = (standartSnF > 0 && mesaiSnF > 0)
      ? Math.round((standartSnF / mesaiSnF) * 100)
      : inspector.genelHizPerf;
    return {
      ...inspector,
      performans: hamPerfF !== null && hamPerfF !== undefined
        ? Math.round(hamPerfF * (100 / hedefF))
        : 0
    };
  })];

  if (perfFilter) {
    filtered = filtered.filter(inspector => {
      switch(perfFilter) {
        case 'good': return inspector.performans >= 85;
        case 'average': return inspector.performans >= 70 && inspector.performans < 85;
        case 'poor': return inspector.performans >= 50 && inspector.performans < 70;
        case 'verypoor': return inspector.performans < 50;
        default: return true;
      }
    });
  }

  if (klasmanFilter) {
    filtered = filtered.filter(inspector => 
      Object.keys(inspector.klasmanlar).includes(klasmanFilter)
    );
  }

  if (searchTerm) {
    filtered = filtered.filter(inspector => 
      inspector.ins.toLowerCase().includes(searchTerm)
    );
  }

  // "Sadece Ekibim" filtresi — sadece ekip yöneticisi (admin olmayan) kullanıcılar için
  const teamOnlyEl = document.getElementById('team-only-filter');
  if (teamOnlyEl && teamOnlyEl.checked && currentUser && !currentUser.isAdmin) {
    const teamSet = new Set((currentUser.team || []).map(n => n.toLowerCase()));
    filtered = filtered.filter(inspector => teamSet.has((inspector.ins || '').toLowerCase()));
  }

  switch(sortOrder) {
    case 'perf-desc':
      // Az veri (10 günden az) olan inspector'lar performansı ne kadar yüksek
      // olursa olsun, yeterli veriye sahip olanların ÖNÜNE geçemez — az veri
      // her zaman sona atılır, aralarında ise normal performans sıralaması geçerli.
      filtered.sort((a, b) => {
        const aAz = azVeriMi(a.gunSayisi), bAz = azVeriMi(b.gunSayisi);
        if (aAz !== bAz) return aAz ? 1 : -1;
        return b.performans - a.performans;
      });
      break;
    case 'perf-asc':
      filtered.sort((a, b) => {
        const aAz = azVeriMi(a.gunSayisi), bAz = azVeriMi(b.gunSayisi);
        if (aAz !== bAz) return aAz ? 1 : -1;
        return a.performans - b.performans;
      });
      break;
    case 'name-asc':
      filtered.sort((a, b) => a.ins.localeCompare(b.ins));
      break;
    case 'name-desc':
      filtered.sort((a, b) => b.ins.localeCompare(a.ins));
      break;
    case 'adet-desc':
      filtered.sort((a, b) => b.adet - a.adet);
      break;
    case 'adet-asc':
      filtered.sort((a, b) => a.adet - b.adet);
      break;
  }

  filteredInspectors = filtered;
  currentDashboardPage = 1;
  renderInspectorCards();
}

function renderInspectorCards() {
  const grid = document.getElementById('inspector-grid');
  const pagination = document.getElementById('dashboard-pagination');
  
  if (!filteredInspectors.length) {
    grid.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🔍</div>
        <h3 data-i18n="filter_no_result">Filtre sonucu bulunamadı</h3>
        <p data-i18n="filter_no_result_hint">Filtre kriterlerini değiştirmeyi deneyin</p>
      </div>
    `;
    applyI18nToNewNodes(grid);
    pagination.style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(filteredInspectors.length / DASHBOARD_PER_PAGE);
  const startIndex = (currentDashboardPage - 1) * DASHBOARD_PER_PAGE;
  const endIndex = startIndex + DASHBOARD_PER_PAGE;
  const currentPageInspectors = filteredInspectors.slice(startIndex, endIndex);

  // Hedef verimlilik değerini oku
  const currentHedef = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);

  const cards = currentPageInspectors.map(inspector => {
    // Düz. Performans = Ham Performans × (100 / Hedef%) — kartlarda bu gösterilir.
    // "Ne ödül ne ceza" ilkesi: nötr sebeplerden (Ürün Olmaması, Insp. Lokasyon
    // Değişimi, Diğer) kaynaklanan kayıp zaman, mesai süresinden (paydadan)
    // düşülüp performans BUNA GÖRE yeniden hesaplanır — bkz. getDispPerf/
    // getNotrKayipDakikaForInspector. Burada AYRICA (getDispPerf çağırmak
    // yerine) hesaplanmasının sebebi: bu kart canlı Hedef Verimlilik input
    // değerini (currentHedef) kullanıyor, inspector.hedefVerimlilik'teki
    // (son hesaplamadan kalma, potansiyel olarak eski) değeri değil.
    const hamPerf = inspector.genelHizPerf;
    const standartSnKart = inspector.standartSure || 0;
    let mesaiSnKart = inspector.mesaiSure || 0;
    const notrKayipSnKart = getNotrKayipDakikaForInspector(inspector.ins) * 60;
    if (notrKayipSnKart > 0 && mesaiSnKart > notrKayipSnKart) mesaiSnKart -= notrKayipSnKart;
    const hamPerfDuzeltilmis = (standartSnKart > 0 && mesaiSnKart > 0)
      ? Math.round((standartSnKart / mesaiSnKart) * 100)
      : hamPerf;
    const duzPerf = hamPerfDuzeltilmis !== null && hamPerfDuzeltilmis !== undefined
      ? Math.round(hamPerfDuzeltilmis * (100 / currentHedef))
      : null;
    const performansVal = duzPerf ?? 0;
    const performansClass = getPerformanceClass(performansVal);
    const performansText = duzPerf !== null ? duzPerf + '%' : '—';
    const progressAngle = Math.min(360, (performansVal / 100) * 360);
    const progressColor = getProgressColor(performansVal);
    
    const ini = inspector.ins.split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
    const klasmanCount = Object.keys(inspector.klasmanlar).length;

    // Kayip zaman rozeti - performans degismez, sadece not. Simetri bozulmasin diye veri yoksa da gösterilir.
    const kayipDkCard = getKayipDakikaForInspector(inspector.ins);
    const _safeIns = inspector.ins.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const kayipRozetHtml = kayipDkCard > 0
      ? `<div onclick="showKayipDetayPopup('${_safeIns}')" style="display:inline-flex;align-items:center;gap:3px;background:#FFF3E0;color:#E65100;border:1px solid #FFCC80;border-radius:5px;padding:2px 7px;font-size:9px;font-weight:700;margin-top:4px;line-height:1.4;cursor:pointer;transition:background .15s" onmouseover="this.style.background='#FFE0B2'" onmouseout="this.style.background='#FFF3E0'" title="Detay için tıklayın">
           &#9208; ${(kayipDkCard/60).toFixed(1)}s değerlendirme dışı &#9432;
         </div>`
      : `<div style="display:inline-flex;align-items:center;gap:3px;background:#F4F6F8;color:var(--muted2);border:1px solid var(--border);border-radius:5px;padding:2px 7px;font-size:9px;font-weight:600;margin-top:4px;line-height:1.4;">
           &#9208; Değerlendirme dışı yok
         </div>`;

    const performansAciklama = (() => {
      if (performansVal === null || performansVal === undefined) {
        return (translations[currentLang]||translations.tr).no_overtime_data;
      }
      const gunSayisi = inspector.gunSayisi || 0;
      const mesaiSaat = Math.round((inspector.mesaiSure || 0) / 3600);
      const overtimeDk = Math.round((inspector.toplamMesaistiSaniye || 0) / 60);
      const overtimeStr = overtimeDk > 0 ? ` · 🌙 ${overtimeDk}dk ${(translations[currentLang]||translations.tr).overtime_over}` : '';
      return `${gunSayisi} ${(translations[currentLang]||translations.tr).days_x_formula.replace('{h}', mesaiSaat)}${overtimeStr}`;
    })();

    const performansSeviyesi = getPerformanceLevelLabel(performansVal);

    const klasmanRowsHtml = Object.entries(inspector.klasmanlar).map(([klasman, data]) => {
      const hizPerf = (data.hizPerf !== null && data.hizPerf !== undefined) ? data.hizPerf : null;
      const hizText = hizPerf !== null ? hizPerf + '%' : '—';
      const hizClass = hizPerf !== null ? getPerformanceClass(hizPerf) : '';
      return `<div class="klasman-item">
        <span class="klasman-name">${klasman} (${data.adet} ${(translations[currentLang]||translations.tr).units_short})</span>
        <span class="${hizClass}" style="font-size:10px;font-weight:600">${hizText}</span>
      </div>`;
    }).join('');

    const gunDetayi = inspector.gunlukDetay && inspector.gunlukDetay.length > 0 
      ? inspector.gunlukDetay.slice(0, 3).map(gun => {
          const tarih = new Date(gun);
          return `${tarih.getDate()}/${tarih.getMonth() + 1}`;
        }).join(', ') + (inspector.gunlukDetay.length > 3 ? '...' : '')
      : '—';

    return `
      <div class="inspector-card ${performansClass}">
        <!-- Header -->
        <div class="inspector-header">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="avatar">${ini}</div>
            <div>
              <div class="inspector-name">${inspector.ins}</div>
              ${kayipRozetHtml}
              <div style="font-size:10px;color:var(--muted2);margin-top:2px">
                ${inspector.gunSayisi || 0} ${(translations[currentLang]||translations.tr).days_suffix} ${(translations[currentLang]||translations.tr).working} · ${gunDetayi}
              </div>
            </div>
          </div>
          <div style="text-align:center">
            <div style="position:relative;display:inline-block">
              <div class="circular-progress" style="--progress-angle: ${progressAngle}deg; --progress-color: ${progressColor};">
                <div class="circular-progress-text ${performansClass}">${performansText}</div>
              </div>
              ${currentHedef !== 100 ? `<div style="position:absolute;top:-6px;right:-6px;background:var(--amber);color:#fff;font-size:8px;font-weight:700;padding:2px 5px;border-radius:8px;line-height:1.2">H%${currentHedef}</div>` : ''}
            </div>
            <div style="font-size:10px;color:var(--muted);margin-top:5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase" data-i18n="adj_perf_label">Düz. Performans</div>
            <div style="font-size:9px;color:${progressColor};font-weight:600;margin-top:1px">${performansSeviyesi}</div>
          </div>
        </div>

        <!-- Ana İstatistikler -->
        <div class="inspector-stats">
          <div class="inspector-stat">
            <div class="inspector-stat-value">${formatTR(inspector.adet)}</div>
            <div class="inspector-stat-label" data-i18n="total_qty">Toplam Adet</div>
          </div>
          <div class="inspector-stat">
            <div class="inspector-stat-value">${formatTR(inspector.kayit)}</div>
            <div class="inspector-stat-label" data-i18n="record_count">Kayıt Sayısı</div>
          </div>
        </div>

        <!-- Süre İstatistikleri -->
        <div class="inspector-stats">
          <div class="inspector-stat">
            <div class="inspector-stat-value">${fmtSnKisa(inspector.standartSure||0)}</div>
            <div class="inspector-stat-label" data-i18n="std_duration">Standart Süre</div>
          </div>
          <div class="inspector-stat">
            <div class="inspector-stat-value">${fmtSnKisa(inspector.mesaiSure||0)}</div>
            <div class="inspector-stat-label"><span data-i18n="overtime_duration">Mesai Süresi</span>${
              inspector.toplamMesaistiSaniye > 0
                ? `<br><span style="color:#E65100;font-size:9px;font-weight:700">🌙 +${Math.round(inspector.toplamMesaistiSaniye/60)}dk <span data-i18n="overtime_over">mesai üstü</span></span>`
                : ''
            }</div>
          </div>
        </div>

        <!-- Performans Detay Kutusu -->
        <div style="padding:14px;background:linear-gradient(135deg,var(--lblue3) 0%,#fff 100%);border-radius:10px;border:1px solid var(--border);margin:12px 0;position:relative;overflow:hidden">
          <div style="font-size:10px;color:var(--muted2);margin-bottom:4px;text-align:center">
            ${performansAciklama}
          </div>
          ${inspector.overtimePerformans !== null && inspector.overtimePerformans !== undefined
            ? `<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin:6px 0;padding:5px 10px;background:rgba(230,81,0,.08);border-radius:7px">
                <span style="font-size:11px;color:#E65100">⏱ Overtime:</span>
                <span style="font-size:13px;font-weight:700;color:#E65100">${inspector.overtimePerformans}%</span>
                <span style="font-size:9px;color:var(--muted2)">(${Math.round((inspector.overtimeMesaiSure||0)/60)}dk ek mesaide)</span>
              </div>`
            : `<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin:6px 0;padding:5px 10px;background:rgba(0,0,0,.03);border-radius:7px">
                <span style="font-size:11px;color:var(--muted2)">⏱ Overtime Yok</span>
              </div>`}
          ${_2KaliteDahil ? '' : (inspector.toplam2KaliteAdet > 0
            ? `<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin:6px 0;padding:5px 10px;background:rgba(124,58,237,.08);border-radius:7px">
                <span style="font-size:11px;color:#7C3AED">🏷️ 2.Kalite kontrolü:</span>
                <span style="font-size:13px;font-weight:700;color:#7C3AED">${formatTR(inspector.toplam2KaliteAdet)} adet</span>
                ${inspector.perf2Kalite !== null && inspector.perf2Kalite !== undefined
                  ? `<span style="font-size:13px;font-weight:700;color:#7C3AED">· ${inspector.perf2Kalite}%</span>`
                  : ''}
              </div>`
            : `<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin:6px 0;padding:5px 10px;background:rgba(0,0,0,.03);border-radius:7px">
                <span style="font-size:11px;color:var(--muted2)">🏷️ 2.Kalite kontrolü yok</span>
              </div>`)}
          ${(() => {
            const ti = getTeknikIncelemeSkorForInspector(inspector.ins);
            if (!ti || ti.count === 0) {
              return `<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin:6px 0;padding:5px 10px;background:rgba(0,0,0,.03);border-radius:7px">
                <span style="font-size:11px;color:var(--muted2)">🧪 Teknik İnceleme Skoru yok</span>
              </div>`;
            }
            const tiColor = getProgressColor(ti.percent);
            return `<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin:6px 0;padding:5px 10px;background:rgba(69,39,160,.08);border-radius:7px">
                <span style="font-size:11px;color:#4527A0">🧪 Teknik İnceleme Skoru:</span>
                <span style="font-size:13px;font-weight:700;color:${tiColor}">${ti.percent}%</span>
                <span style="font-size:9px;color:var(--muted2)">(${ti.seviye})</span>
              </div>`;
          })()}
          <div style="text-align:center">
            <span style="font-size:11px;color:var(--muted2)">📊 </span>
            <span style="font-size:12px;font-weight:600;color:var(--navy)">${klasmanCount} ${(translations[currentLang]||translations.tr).klasman_word}</span>
            <span style="color:var(--border);margin:0 6px"> • </span>
            <span style="font-size:11px;color:var(--muted2)">
              <span data-i18n="efficiency_label">efficiency</span> &nbsp;•&nbsp;
              <span style="color:var(--blue);font-weight:600">%100+</span> = <span data-i18n="above_target">above target</span> &nbsp;•&nbsp;
              <span style="color:var(--amber);font-weight:600">%100-</span> = <span data-i18n="below_target">below target</span>
            </span>
          </div>
        </div>

        <!-- Klasman Detayları -->
        <div class="klasman-breakdown">
          <div class="klasman-summary" onclick="toggleKlasmanDetails(this)">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:10px;color:var(--muted2)" data-i18n="klasman_details">📋 Classification Details</span>
              <span style="font-size:8px;color:var(--muted2);background:var(--lblue2);padding:1px 6px;border-radius:10px">${klasmanCount} ${(translations[currentLang]||translations.tr).units_short}</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px">
              <span class="toggle-text" style="font-size:10px;color:var(--blue);font-weight:600" data-i18n="see_details">See Details</span>
              <span class="toggle-icon" style="font-size:12px">👁️</span>
            </div>
          </div>
          <div class="klasman-details">
            ${klasmanRowsHtml}
          </div>
        </div>

        <!-- Alt Butonlar -->
        <div style="display:flex;gap:8px;margin-top:12px">
          <button onclick="showInspectorDetail('${inspector.ins.replace(/'/g, "\\'")}'); event.stopPropagation();" 
                  style="flex:1;padding:8px;background:var(--blue);color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;font-weight:500">
            📊 ${(translations[currentLang]||translations.tr).detailed_analysis}
          </button>
        </div>
      </div>
    `;
  }).join('');

  grid.innerHTML = cards;

  // data-i18n attribute'larını yeni oluşan DOM'a uygula
  applyI18nToNewNodes(grid);

  if (totalPages > 1) {
    pagination.style.display = 'flex';
    document.getElementById('dash-page-info').textContent = `${currentDashboardPage} / ${totalPages}`;
    document.getElementById('dash-btn-prev').disabled = currentDashboardPage <= 1;
    document.getElementById('dash-btn-next').disabled = currentDashboardPage >= totalPages;

    // Sayfa numarası butonlarını oluştur
    const pageNumsEl = document.getElementById('dash-page-numbers');
    if (pageNumsEl) {
      // Hangi sayfa numaralarını göstereceğimizi hesapla (max 7 buton)
      let pages = [];
      if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        if (currentDashboardPage > 3) pages.push('...');
        for (let i = Math.max(2, currentDashboardPage - 1); i <= Math.min(totalPages - 1, currentDashboardPage + 1); i++) pages.push(i);
        if (currentDashboardPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
      }

      pageNumsEl.innerHTML = pages.map(p => {
        if (p === '...') {
          return `<span style="padding:0 4px;color:var(--muted);font-size:12px;line-height:30px">…</span>`;
        }
        const isActive = p === currentDashboardPage;
        return `<button onclick="goToDashboardPage(${p})" style="
          min-width:30px;height:30px;border-radius:6px;border:1px solid ${isActive ? 'var(--blue2)' : 'var(--border2)'};
          background:${isActive ? 'var(--blue2)' : '#fff'};
          color:${isActive ? '#fff' : 'var(--navy)'};
          font-size:12px;font-weight:${isActive ? '700' : '500'};
          cursor:pointer;padding:0 6px;transition:all .15s;font-family:'DM Sans',sans-serif;
        ">${p}</button>`;
      }).join('');
    }
  } else {
    pagination.style.display = 'none';
  }
}

function changeDashboardPage(direction) {
  const totalPages = Math.ceil(filteredInspectors.length / DASHBOARD_PER_PAGE);
  currentDashboardPage = Math.max(1, Math.min(totalPages, currentDashboardPage + direction));
  renderInspectorCards();
  document.getElementById('inspector-grid').scrollIntoView({ behavior: 'smooth' });
}

function goToDashboardPage(page) {
  const totalPages = Math.ceil(filteredInspectors.length / DASHBOARD_PER_PAGE);
  currentDashboardPage = Math.max(1, Math.min(totalPages, page));
  renderInspectorCards();
  document.getElementById('inspector-grid').scrollIntoView({ behavior: 'smooth' });
}

function toggleKlasmanDetails(element) {
  const details = element.nextElementSibling;
  details.classList.toggle('show');
  
  const toggleIcon = element.querySelector('.toggle-icon');
  const toggleText = element.querySelector('.toggle-text');
  
  if (details.classList.contains('show')) {
    toggleIcon.textContent = '👁️';
    toggleText.textContent = (translations[currentLang]||translations.tr).hide_label;
    element.style.borderRadius = '8px 8px 0 0';
  } else {
    toggleIcon.textContent = '👁️';
    toggleText.textContent = (translations[currentLang]||translations.tr).see_details;
    element.style.borderRadius = '8px';
  }
}

// ────────────────────────────
// INSPECTOR DETAY MODAL
// ────────────────────────────
function showInspectorDetail(inspectorName) {
  const inspector = performansData.find(i => i.ins === inspectorName);
  if (!inspector) return;
  selectedInspectorDetail = inspector;

  document.getElementById('detail-modal-title').textContent = `${inspector.ins} — ${(translations[currentLang]||translations.tr).detailed_perf}`;

  // ── ANINDA AÇ: mevcut veriyle overlay'i hemen göster ──
  const _aoHedefValNow = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);
  
  // tumKayitlar'ı şimdiki veriyle hemen hesapla (aşağıda da yeniden hesaplanır)
  const buildTumKayitlar = (insp) => {
    const list = [];
    Object.entries(insp.klasmanlar).forEach(([klasmanAd, kd]) => {
      (kd.kayitlar || []).forEach(k => {
        list.push({
          id: list.length + 1, klasman: klasmanAd,
          adet: k.adet, kontrolAdetSuresi: k.kontrolAdetSuresi || 0,
          istasyonSuresi: k.istasyonSuresi || 0, standartSure: k.standartSure || 0,
          standartSureHam: k.standartSureHam != null ? k.standartSureHam : (k.standartSure || 0),
          kayitFiiliSure: k.kayitFiiliSure || 0, baslangic: k.baslangic,
          bitis: k.bitis, tarihGecerli: k.tarihGecerli,
          ortalamaKontrolSn: k.adet > 0 && k.kayitFiiliSure > 0 ? Math.round(k.kayitFiiliSure / k.adet) : null,
          talepNo: k.talepNo || '',
          inspectionTipi: k.inspectionTipi || ''
        });
      });
    });
    return list;
  };

  // Overlay'i mevcut veriyle anında aç
  openAnalizOverlay(buildTumKayitlar(inspector), inspector, _aoHedefValNow);

  // ── ARKA PLAN: Sheets'ten veri çek, gelince tabloyu güncelle ──
  // ÖNEMLİ (v10.1): Performans verisi artık otomatik Sheets'e gönderilmiyor
  // (sadece "📤 Sheets'e Gönder" butonuna basıldığında). Bu yüzden, eğer
  // bellekte Excel'den taze hesaplanmış ama henüz gönderilmemiş ("unsynced")
  // veri varsa, Sheets'ten çekilen eski veriyle ÜZERİNE YAZILMAZ — aksi
  // halde doğru hesaplanan adet/standart süre gibi değerler eski sheet
  // verisiyle değişebilir (örnekleme modu hatası buradan kaynaklanıyordu).
  const perfPushBtn = document.getElementById('perf-push-btn');
  const isUnsynced = perfPushBtn && perfPushBtn.dataset.unsynced === '1';

  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (url && token && !isUnsynced) {
      // Loading göstergesi tablo altına ekle
      const loadBanner = document.createElement('div');
      loadBanner.id = 'ao-sheets-loading';
      loadBanner.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#1565C0;color:#fff;padding:10px 18px;border-radius:10px;font-size:12px;font-family:DM Sans,sans-serif;z-index:9999;box-shadow:0 4px 16px rgba(21,101,192,.4);display:flex;align-items:center;gap:8px;';
      loadBanner.innerHTML = '<div style="width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;animation:ao-gspin .8s linear infinite;"></div> ' + (translations[currentLang]||translations.tr).loading_records;
      document.body.appendChild(loadBanner);

      jsonpFetch(url, { action: 'getInspectorKayitlar', token, inspectorAdi: inspectorName.normalize('NFC').trim().toUpperCase() })
        .then(data => {
          if (data.status === 'ok' && data.kayitlar && typeof data.kayitlar === 'object') {
            const insKlasmanKeys = Object.keys(inspector.klasmanlar);
            const norm = s => s.normalize('NFC').trim().toLowerCase();
            Object.entries(data.kayitlar).forEach(([klasmanAd, kayitlarArr]) => {
              if (!Array.isArray(kayitlarArr) || !kayitlarArr.length) return;
              let hedefKey = insKlasmanKeys.find(k => k === klasmanAd)
                || insKlasmanKeys.find(k => norm(k) === norm(klasmanAd));
              if (!hedefKey) return;
              inspector.klasmanlar[hedefKey].kayitlar = kayitlarArr.map(r => ({
                ...r,
                kontrolAdetSuresi: r.kontrolAdetSuresi || 0,
                istasyonSuresi: r.istasyonSuresi || 0,
                standartSure: r.standartSure || 0,
                kayitFiiliSure: r.kayitFiiliSure || 0,
                tarihGecerli: r.tarihGecerli || false,
                baslangic: r.baslangic ? (() => { const d = new Date(r.baslangic); return isNaN(d.getTime()) ? null : d; })() : null,
                bitis: r.bitis ? (() => { const d = new Date(r.bitis); return isNaN(d.getTime()) ? null : d; })() : null
              }));
            });
            // Overlay hâlâ açıksa tabloyu güncelle
            const ov = document.getElementById('analiz-overlay');
            if (ov && ov.style.display !== 'none') {
              const fresh = buildTumKayitlar(inspector);
              _aoData = fresh;
              _aoRenderStats();
              _aoRenderTop20();
              aoApplyFilters();
              const kb = Object.values(inspector.klasmanlar).reduce((s,kd)=>s+(kd.kayitlar||[]).length,0);
              console.log('[detay] Sheets kayıtları yüklendi ve tablo güncellendi:', kb, 'kayıt');
            }
          }
        })
        .catch(e => console.warn('getInspectorKayitlar hatası:', e.message))
        .finally(() => { const b = document.getElementById('ao-sheets-loading'); if(b) b.remove(); });
  }
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.remove('open');
  selectedInspectorDetail = null;
}

// ────────────────────────────
// EXCEL EXPORT
// ────────────────────────────
function exportToExcel() {
  if (!performansData.length) {
    alert('Henüz performans verisi yok!');
    return;
  }

  const workbook = XLSX.utils.book_new();
  const _exportHedef = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);

  const mainData = performansData.map(inspector => {
    const totalHedef = inspector.standartSure || 0;
    // "Ne ödül ne ceza": nötr kayıp zaman mesai süresinden düşülüp performans
    // CANLI Hedef Verimlilik ile yeniden hesaplanır — Dashboard kartlarıyla
    // (ve diğer tüm ekranlarla) birebir tutarlı olması için. Eskiden burada
    // sadece durağan inspector.verimlilikPerf kullanılıyordu, bu da Dashboard'da
    // gösterilenden farklı (eski) bir yüzde vermesine yol açıyordu.
    const _stdSnEx = inspector.standartSure || 0;
    let _mesSnEx = inspector.mesaiSure || 0;
    const _kzSnEx = getNotrKayipDakikaForInspector(inspector.ins) * 60;
    if (_kzSnEx > 0 && _mesSnEx > _kzSnEx) _mesSnEx -= _kzSnEx;
    const _hamPEx = (_stdSnEx > 0 && _mesSnEx > 0)
      ? Math.round((_stdSnEx / _mesSnEx) * 100) : inspector.genelHizPerf;
    const performans = (_hamPEx !== null && _hamPEx !== undefined)
      ? Math.round(_hamPEx * (100 / _exportHedef)) : (inspector.verimlilikPerf ?? inspector.genelHizPerf ?? 0);
    const ti = getTeknikIncelemeSkorForInspector(inspector.ins);
    const ii = getIkinciInspectionOraniForInspector(inspector.ins);

    return {
      'Inspector': inspector.ins,
      'Toplam Adet': inspector.adet,
      'Kayıt Sayısı': inspector.kayit,
      'Standart Süre (dk)': Math.round(totalHedef/60),
      'Mesai Süresi (dk)': Math.round((inspector.mesaiSure||0)/60),
      'Verimlilik Perf (%)': performans,
      'Teknik İnceleme Skoru (%)': (ti && ti.count > 0) ? ti.percent : '—',
      'İkinci Insp. Geçti/Toplam Oranı (%)': ii.percent !== null ? ii.percent : '—',
      'Klasman Sayısı': Object.keys(inspector.klasmanlar).length,
      'Çalışma Gün Sayısı': inspector.gunSayisi || 0,
      'Overtime Performans (%)': (inspector.overtimePerformans !== null && inspector.overtimePerformans !== undefined) ? inspector.overtimePerformans : '—',
      'Overtime Kontrol Edilen Adet': inspector.toplamOvertimeAdet || 0,
      '2.Kalite Kontrolü: Adet': inspector.toplam2KaliteAdet || 0,
      '2.Kalite Kontrolü: Performans (%)': (inspector.perf2Kalite !== null && inspector.perf2Kalite !== undefined) ? inspector.perf2Kalite : '—'
    };
  });

  const mainSheet = XLSX.utils.json_to_sheet(mainData);
  XLSX.utils.book_append_sheet(workbook, mainSheet, 'Genel Performans');

  const detailData = [];
  performansData.forEach(inspector => {
    Object.entries(inspector.klasmanlar).forEach(([klasman, data]) => {
      const klasmanPerf = data.hizPerf ?? 0;
      detailData.push({
        'Inspector': inspector.ins,
        'Klasman': klasman,
        'Adet': data.adet,
        'Standart Süre (dk)': Math.round((data.standartSure||0)/60),
        'Performans (%)': klasmanPerf
      });
    });
  });

  const detailSheet = XLSX.utils.json_to_sheet(detailData);
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Klasman Detayları');

  const fileName = `Inspector_Performans_${_bugununTarihiYerel()}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

function exportInspectorDetail() {
  if (!selectedInspectorDetail) return;
  const inspector = selectedInspectorDetail;

  // ── Yardımcılar ──
  function fmtSnExcel(sn) {
    if (!sn || sn <= 0) return '—';
    const s = Math.round(sn);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sc = s % 60;
    if (h > 0) return h + 's ' + String(m).padStart(2,'0') + 'd ' + String(sc).padStart(2,'0') + 'sn';
    if (m > 0) return m + 'd ' + String(sc).padStart(2,'0') + 'sn';
    return sc + 'sn';
  }
  function fmtTarihExcel(d) {
    if (!d) return '—';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('tr-TR', {day:'2-digit',month:'2-digit',year:'numeric'}) +
           ' ' + dt.toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'});
  }
  function oranHesapla(fiili, standart) {
    if (!fiili || !standart) return '—';
    return Math.round((fiili / standart) * 100) + '%';
  }

  const wb = XLSX.utils.book_new();

  // ── SAYFA 1: Özet (Klasman bazında) ──
  // "Standart Süre" artık HAM (tavanlanmamış) değeri gösterir — kısa
  // kayıtlarda (≤10dk gerçekleşen) performans hesabı için ayrıca tavanlanan
  // değer sadece "Performansta Kullanılan" sütununda görünür (ikisi farklıysa).
  // Oran ve Hız Performansı hâlâ tavanlı değeri kullanır — sistem/hesaplama
  // DEĞİŞMEDİ, sadece Excel'deki "Standart Süre" görünümü düzeltildi
  // (kullanıcı talebiyle: "sistemi değiştirme, sadece Excel'i düzelt").
  const ozetRows = Object.entries(inspector.klasmanlar).map(([klasman, kd]) => {
    const ham = kd.standartSureHam ?? kd.standartSure;
    const tavanliMi = Math.round(ham) !== Math.round(kd.standartSure || 0);
    return {
      'Klasman':              klasman,
      'Toplam Adet':          kd.adet || 0,
      'Standart Süre':        fmtSnExcel(ham),
      'Standart Süre (sn)':   ham || 0,
      'Performansta Kullanılan Standart Süre': tavanliMi ? fmtSnExcel(kd.standartSure) + ' (tavanlandı)' : '—',
      'Gerçekleşen Süre':     fmtSnExcel(kd.kayitFiiliSure),
      'Gerçekleşen (sn)':     kd.kayitFiiliSure || 0,
      'Oran (Std./Ger.)':     oranHesapla(kd.standartSure, kd.kayitFiiliSure),
      'Hız Performansı (%)':  kd.hizPerf ?? '—'
    };
  });
  const wsOzet = XLSX.utils.json_to_sheet(ozetRows);

  // Sütun genişlikleri
  wsOzet['!cols'] = [
    {wch:22},{wch:14},{wch:16},{wch:18},{wch:18},{wch:18},{wch:18},{wch:20}
  ];

  // Header rengi (A1:H1) — koyu lacivert
  const ozetRange = XLSX.utils.decode_range(wsOzet['!ref']);
  for (let C = ozetRange.s.c; C <= ozetRange.e.c; C++) {
    const cell = wsOzet[XLSX.utils.encode_cell({r:0, c:C})];
    if (cell) {
      cell.s = {
        font:    { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
        fill:    { fgColor: { rgb: '0B1F3A' }, patternType: 'solid' },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
      };
    }
  }

  // Veri satırları renklendirme
  for (let R = 1; R <= ozetRange.e.r; R++) {
    const oranCell = wsOzet[XLSX.utils.encode_cell({r:R, c:6})]; // Oran sütunu
    const oranVal  = oranCell ? parseInt(oranCell.v) : NaN;
    let rowColor = 'FFFFFF';
    if (!isNaN(oranVal)) {
      if (oranVal >= 100)       rowColor = 'E0F2F1'; // yeşil
      else if (oranVal >= 80)   rowColor = 'FFF8E1'; // amber
      else                      rowColor = 'FFEBEE'; // kırmızı
    }
    for (let C = ozetRange.s.c; C <= ozetRange.e.c; C++) {
      const cell = wsOzet[XLSX.utils.encode_cell({r:R, c:C})];
      if (cell) {
        cell.s = {
          fill: { fgColor: { rgb: R % 2 === 0 ? rowColor : rowColor.replace(/^(E0|FF|FF)/,'F') }, patternType: 'solid' },
          alignment: { horizontal: C >= 1 ? 'center' : 'left', vertical: 'center' },
          border: {
            bottom: { style: 'thin', color: { rgb: 'CFE3F7' } },
            right:  { style: 'thin', color: { rgb: 'CFE3F7' } }
          }
        };
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, wsOzet, 'Özet');

  // ── SAYFA 2: Kayıt Detayı (satır bazında) ──
  const kayitRows = [];
  Object.entries(inspector.klasmanlar).forEach(([klasman, kd]) => {
    (kd.kayitlar || []).forEach((k, i) => {
      const fiili = k.kayitFiiliSure || 0;
      const std   = k.standartSure   || 0;
      const oran  = fiili && std ? Math.round((std / fiili) * 100) : null;
      kayitRows.push({
        '#':                    kayitRows.length + 1,
        'Klasman':              klasman,
        'Talep No':             k.talepNo || '—',
        'Adet':                 k.adet || 0,
        'Kontrol Süresi (sn)':  k.kontrolAdetSuresi || 0,
        'İstasyon Süresi':      fmtSnExcel(k.istasyonSuresi),
        'Standart Süre':        fmtSnExcel(std),
        'Standart Süre (sn)':   std,
        'Gerçekleşen Süre':     fmtSnExcel(fiili),
        'Gerçekleşen (sn)':     fiili || '—',
        'Oran (Std./Ger.)':     (oran !== null ? oran + '%' : '—'),
        'Ort. Kontrol (sn/ad)': k.adet > 0 && fiili > 0 ? Math.round(fiili / k.adet) : '—',
        'Başlangıç':            fmtTarihExcel(k.baslangic),
        'Bitiş':                fmtTarihExcel(k.bitis),
        'Tarih Geçerli':        k.tarihGecerli ? 'Evet' : 'Hayır',
        'Inspection Tipi':      k.inspectionTipi || '—'
      });
    });
  });

  const wsKayit = XLSX.utils.json_to_sheet(kayitRows.length ? kayitRows : [{'Bilgi':'Kayıt verisi yok'}]);
  wsKayit['!cols'] = [
    {wch:5},{wch:20},{wch:8},{wch:18},{wch:16},{wch:16},{wch:18},{wch:18},{wch:18},{wch:18},{wch:18},{wch:18},{wch:18},{wch:14}
  ];

  // Kayıt sayfası header rengi
  if (kayitRows.length) {
    const kayitRange = XLSX.utils.decode_range(wsKayit['!ref']);
    for (let C = kayitRange.s.c; C <= kayitRange.e.c; C++) {
      const cell = wsKayit[XLSX.utils.encode_cell({r:0, c:C})];
      if (cell) {
        cell.s = {
          font:  { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
          fill:  { fgColor: { rgb: '102848' }, patternType: 'solid' },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
        };
      }
    }
    // Veri satırları
    for (let R = 1; R <= kayitRange.e.r; R++) {
      const oranCell = wsKayit[XLSX.utils.encode_cell({r:R, c:9})]; // Oran
      const oranVal  = oranCell ? parseInt(oranCell.v) : NaN;
      const bg = isNaN(oranVal) ? 'FFFFFF' :
                 oranVal >= 100 ? (R%2===0?'E0F2F1':'F1FAF9') :
                 oranVal >= 80  ? (R%2===0?'FFF8E1':'FFFCF0') :
                                  (R%2===0?'FFEBEE':'FFF5F5');
      for (let C = kayitRange.s.c; C <= kayitRange.e.c; C++) {
        const cell = wsKayit[XLSX.utils.encode_cell({r:R, c:C})];
        if (cell) {
          cell.s = {
            fill: { fgColor: { rgb: bg }, patternType: 'solid' },
            alignment: { horizontal: C <= 1 || C === 11 || C === 12 ? 'left' : 'center', vertical: 'center' },
            border: { bottom: { style: 'thin', color: { rgb: 'CFE3F7' } } }
          };
        }
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, wsKayit, 'Kayıt Detayı');

  // ── SAYFA 3: Inspector Özet ──
  const hamPerf  = inspector.genelHizPerf ?? 0;
  const hedef    = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);
  const duzPerf  = Math.round(hamPerf * (100 / hedef));
  const genelRows = [
    { 'Alan': 'Inspector Adı',        'Değer': inspector.ins },
    { 'Alan': 'Toplam Adet',          'Değer': inspector.adet || 0 },
    { 'Alan': 'Toplam Kayıt',         'Değer': inspector.kayit || 0 },
    { 'Alan': 'Klasman Sayısı',       'Değer': Object.keys(inspector.klasmanlar).length },
    { 'Alan': 'Çalışma Gün Sayısı',   'Değer': inspector.gunSayisi || 0 },
    { 'Alan': 'Standart Süre',        'Değer': fmtSnExcel(inspector.standartSure) },
    { 'Alan': 'Mesai Süresi',         'Değer': fmtSnExcel(inspector.mesaiSure) },
    { 'Alan': 'Ham Hız Performansı',  'Değer': hamPerf !== null ? hamPerf + '%' : '—' },
    { 'Alan': 'Düz. Performans',      'Değer': duzPerf + '%' },
    { 'Alan': 'Rapor Tarihi',         'Değer': new Date().toLocaleDateString('tr-TR') }
  ];
  const wsGenel = XLSX.utils.json_to_sheet(genelRows);
  wsGenel['!cols'] = [{wch:24},{wch:28}];
  // Header rengi
  ['A1','B1'].forEach(ref => {
    if (wsGenel[ref]) wsGenel[ref].s = {
      font: { bold:true, color:{rgb:'FFFFFF'}, sz:11 },
      fill: { fgColor:{rgb:'0B1F3A'}, patternType:'solid' },
      alignment: { horizontal:'center' }
    };
  });
  XLSX.utils.book_append_sheet(wb, wsGenel, 'Inspector Özet');

  const fileName = `${inspector.ins.replace(/\s+/g, '_')}_Detay_${_bugununTarihiYerel()}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// ────────────────────────────
// KLASMAN YÖNETİMİ
// ────────────────────────────
let klFilter = 'all'; // 'all' | 'done' | 'undone'

// ─── OTOMATİK SHEETS PUSH (debounce 1.5sn) ───
let _klasmanPushTimer = null;
function autoSaveAndPushKlasmanlar() {
  saveData();
  clearTimeout(_klasmanPushTimer);
  _klasmanPushTimer = setTimeout(() => {
    if (SHEETS_DEVRE_DISI) return;
    const url   = appConfig.sheetsWebAppUrl;
    const token = appConfig.sheetsApiToken;
    if (!url || !token) return;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'setKlasmanlar', token, klasmanlar, savedAt: new Date().toISOString() }),
      mode: 'no-cors'
    }).then(() => {
      console.log('☁️ Klasmanlar Sheets\'e otomatik gönderildi');
      showSuccessMessage((translations[currentLang]||translations.tr).sheets_klasman_sync);
    }).catch(err => console.warn('Klasman oto-push hatası:', err.message));
  }, 1500);
}

function isKlasmanTamamlandi(k) {
  // Manuel işaretleme öncelikli; işaretlenmemişse false
  return k.tamamlandi === true;
}

function toggleKlasmanTamamlandi(kId) {
  const k = klasmanlar.find(x => x.id === kId);
  if (!k) return;
  k.tamamlandi = !k.tamamlandi;
  autoSaveAndPushKlasmanlar();
  renderListe();
  renderEditor();
}

function setKlFilter(val) {
  klFilter = val;
  sayfa = 1;
  // Buton stillerini güncelle
  ['all','done','undone'].forEach(v => {
    const btn = document.getElementById('kl-f-' + v);
    if (!btn) return;
    btn.className = 'kl-filter-btn';
    if (v === val) {
      if (v === 'done')   btn.className += ' active-green';
      else if (v === 'undone') btn.className += ' active-amber';
      else btn.className += ' active';
    }
  });
  renderListe();
}

function filtered(){ 
  let list = klasmanlar.filter(k => k.ad.toLowerCase().includes(aramaStr.toLowerCase()));
  if (klFilter === 'done')   list = list.filter(k => isKlasmanTamamlandi(k));
  if (klFilter === 'undone') list = list.filter(k => !isKlasmanTamamlandi(k));
  return list;
}

function aramaYap(){ 
  aramaStr=document.getElementById('search-input').value; 
  sayfa=1; 
  renderListe(); 
}

function changePage(d){
  const fl=filtered(), tp=Math.max(1,Math.ceil(fl.length/KL_PER_PAGE));
  sayfa=Math.min(tp,Math.max(1,sayfa+d));
  renderListe();
}

const KL_PER_PAGE = 20; // Grid görünüm için sayfa başı klasman

function renderListe(){
  const fl = filtered();
  const tp = Math.max(1, Math.ceil(fl.length / KL_PER_PAGE));
  if(sayfa > tp) sayfa = tp;
  const slice = fl.slice((sayfa - 1) * KL_PER_PAGE, sayfa * KL_PER_PAGE);
  const el = document.getElementById('klasman-liste');

  // Tamamlanma sayaçlarını güncelle
  const totalAll   = klasmanlar.filter(k => k.ad.toLowerCase().includes(aramaStr.toLowerCase())).length;
  const totalDone  = klasmanlar.filter(k => k.ad.toLowerCase().includes(aramaStr.toLowerCase()) && isKlasmanTamamlandi(k)).length;
  const totalUndone = totalAll - totalDone;
  const countEl = document.getElementById('kl-filter-counts');
  if (countEl) countEl.textContent = `✅ ${totalDone}  ·  ⚠️ ${totalUndone}`;

  if(!slice.length){
    el.innerHTML = '<div class="empty"><div class="empty-icon">🔍</div><h3 data-i18n="not_found">Bulunamadı</h3><p data-i18n="change_search">Arama kriterlerini değiştirin</p></div>';
    applyI18nToNewNodes(el);
  } else {
    el.innerHTML = '<div class="kl-grid">' + slice.map(k => {
      const icon      = k.icon || KL_ICONS[k.id % KL_ICONS.length];
      const sure      = birAdet(k).toFixed(1);
      const selected  = k.id === secilenId;
      const tamam     = isKlasmanTamamlandi(k);
      const checkBadge = tamam
        ? `<span style="position:absolute;top:6px;right:6px;font-size:11px;background:#E0F2F1;color:var(--green);border-radius:99px;padding:1px 6px;font-weight:700;border:1px solid #B2DFDB">✓</span>`
        : '';
      return `<div class="kl-card${selected?' selected':''}${tamam?' completed':''}" onclick="selectKlasman(${k.id})">
        ${checkBadge}
        <div class="kl-card-icon">${icon}</div>
        <div class="kl-card-name" title="${k.ad}">${k.ad}</div>
        <div class="kl-card-meta">⚙️ ${k.istasyonlar.length} ist. &nbsp;·&nbsp; ⏱ ${sure}sn</div>
      </div>`;
    }).join('') + '</div>';
  }

  document.getElementById('kl-sayac').textContent = fl.length + ' ' + (translations[currentLang]||translations.tr).klasman_word;
  
  // Sayfalama güncelle
  const prevBtn = document.getElementById('kl-prev');
  const nextBtn = document.getElementById('kl-next');
  const pagEl = document.getElementById('kl-pag-pages');
  const pagContainer = document.getElementById('kl-pag');
  
  if (prevBtn) prevBtn.disabled = sayfa <= 1;
  if (nextBtn) nextBtn.disabled = sayfa >= tp;
  
  if (pagEl) {
    if (tp <= 1) {
      if (pagContainer) pagContainer.style.display = 'none';
    } else {
      if (pagContainer) pagContainer.style.display = 'flex';
      // Sayfa numaralarını göster (max 7)
      let pages = [];
      if (tp <= 7) {
        for(let i=1;i<=tp;i++) pages.push(i);
      } else {
        pages = [1];
        if (sayfa > 3) pages.push('...');
        for(let i=Math.max(2,sayfa-1);i<=Math.min(tp-1,sayfa+1);i++) pages.push(i);
        if (sayfa < tp-2) pages.push('...');
        pages.push(tp);
      }
      pagEl.innerHTML = pages.map(p => 
        p === '...' 
          ? `<span style="padding:0 4px;color:var(--muted);line-height:28px">…</span>` 
          : `<button class="kl-pag-page${p===sayfa?' active':''}" onclick="goToPage(${p})">${p}</button>`
      ).join('');
    }
  }
  
  updateSidebar();
}

function goToPage(p) {
  sayfa = p;
  renderListe();
}

function selectKlasman(id){
  secilenId=id; 
  renderListe(); 
  renderEditor();
}

function renderEditor(){
  const k=klasmanlar.find(x=>x.id===secilenId);
  const el=document.getElementById('editor-content');
  if(!k){
    el.innerHTML=`
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 24px;text-align:center">
        <div style="width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,var(--lblue2),var(--lblue3));display:flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:18px;border:1px solid var(--border)">⚙️</div>
        <h3 style="font-size:15px;font-weight:600;color:var(--navy);margin-bottom:8px">Bir klasman seçin</h3>
        <p style="font-size:12px;color:var(--muted);max-width:220px;line-height:1.6">Soldan bir klasman seçerek istasyon sürelerini düzenleyebilirsiniz</p>
      </div>
    `;
    return;
  }
  
  const istasyonSuresi = k.istasyonlar.reduce((s,i)=>s+(parseFloat(i.sure)||0),0);
  const urunKontrolSuresi = parseFloat(k.urunKontrolSuresi) || 0;
  const toplamSure = istasyonSuresi + urunKontrolSuresi;
  
  const curIcon = k.icon || KL_ICONS[k.id % KL_ICONS.length];
  const iconGridHtml = KL_ICONS.map((ic) => `
    <button onclick="updateKlasmanIcon(${k.id},'${ic}')" title="${ic}"
      style="font-size:16px;padding:4px;border-radius:6px;border:2px solid ${ic===curIcon?'var(--blue2)':'var(--border2)'};
      background:${ic===curIcon?'var(--lblue2)':'var(--white)'};cursor:pointer;transition:all .1s;aspect-ratio:1;"
    >${ic}</button>
  `).join('');

  el.innerHTML=`
    <div style="padding:16px 18px;border-bottom:1px solid var(--border2);background:var(--lblue3);display:flex;align-items:center;justify-content:space-between">
      <h2 style="font-size:14px;font-weight:600;color:var(--navy);display:flex;align-items:center;gap:8px">
        <span>${curIcon}</span> ${k.ad} — Düzenle
      </h2>
      <button onclick="addIstasyon(${k.id})" style="padding:6px 12px;background:var(--blue);color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer" data-i18n="add_station">＋ Add Station</button>
    </div>
    <div style="padding:18px">

      <!-- Klasman Adı & İkon Düzenleme -->
      <div style="padding:14px;background:var(--offwhite);border:1px solid var(--border2);border-radius:10px;margin-bottom:16px;">
        <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;display:flex;align-items:center;gap:6px">
          ✏️ Klasman Bilgileri
          <button onclick="toggleKlasmanTamamlandi(${k.id})" title="Tıklayarak işaretle / kaldır"
            style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:99px;border:1.5px solid ${isKlasmanTamamlandi(k)?'#81C784':'#FFE082'};
            background:${isKlasmanTamamlandi(k)?'#E0F2F1':'var(--lamber)'};
            color:${isKlasmanTamamlandi(k)?'var(--green)':'var(--amber)'};
            font-size:10px;font-weight:700;cursor:pointer;letter-spacing:.3px;transition:all .15s;font-family:'DM Sans',sans-serif">
            ${isKlasmanTamamlandi(k) ? '✅ Tamamlandı' : '⚠️ Tamamlanmadı'}
          </button>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <span style="font-size:28px;">${curIcon}</span>
          <input value="${k.ad}" onblur="updateKlasmanAd(${k.id},this.value)" onkeydown="if(event.key==='Enter'){this.blur();}" 
            style="flex:1;padding:8px 12px;border:1.5px solid var(--blue3);border-radius:8px;font-size:13px;font-weight:600;color:var(--navy);"
            placeholder="Klasman adı">
        </div>
        <div style="font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;" data-i18n="select_icon_btn">İkon Seç</div>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:4px;max-height:130px;overflow-y:auto;padding:2px;" id="editor-icon-grid-${k.id}">
          ${iconGridHtml}
        </div>
      </div>
      ${(!currentUser || currentUser.isAdmin) ? `
      <div style="margin-bottom:8px">
        <button onclick="showKlasmanSureOnerisi(${k.id})"
          style="width:100%;padding:10px 14px;background:linear-gradient(135deg,#EDE7F6,#F3E5F5);border:1.5px solid #B39DDB;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:12.5px;font-weight:700;color:#5E35B1;font-family:'DM Sans',sans-serif">
          📊 Analiz Et — Gerçekleşen Süreye Göre Süre Önerisi Al
        </button>
      </div>
      ` : ''}
      <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--lgreen);border:1px solid var(--green);border-radius:8px;margin-bottom:8px">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--green);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px">⏱</div>
        <div style="flex:1">
          <strong style="font-size:13px;color:var(--green);display:block" data-i18n="unit_check_duration">1 Birim Muayene Süresi</strong>
          <span style="font-size:11px;color:var(--muted2)" data-i18n="unit_check_hint">Ürün başına harcanan standart süre</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <input type="number" value="${urunKontrolSuresi}" min="0" step="1" id="inp-urunkontrol-${k.id}"
            onchange="updateUrunKontrol(${k.id},this.value)" style="width:80px;text-align:right;padding:6px 8px;border:1px solid var(--border);border-radius:6px">
          <span style="font-size:12px;color:var(--muted);white-space:nowrap">saniye</span>
        </div>
      </div>

      <!-- Ölçü -->
      <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--lamber);border:1px solid var(--amber);border-radius:8px;margin-bottom:8px">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--amber);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px">📐</div>
        <div style="flex:1">
          <strong style="font-size:13px;color:var(--amber);display:block">Ölçü Süresi</strong>
          <span style="font-size:11px;color:var(--muted2)">Adet başına ölçüm süresi — BakilacakMiktar'a göre ölçülecek adet × bu süre eklenir</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <input type="number" value="${parseFloat(k.olcuSuresi)||0}" min="0" step="1" id="inp-olcu-${k.id}"
            onchange="updateOlcuSuresi(${k.id},this.value)" style="width:80px;text-align:right;padding:6px 8px;border:1px solid var(--border);border-radius:6px">
          <span style="font-size:12px;color:var(--muted);white-space:nowrap">saniye</span>
        </div>
      </div>

      <!-- Ürün Kabul -->
      <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--lblue3);border:1px solid var(--blue3);border-radius:8px;margin-bottom:16px">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--blue3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px">✅</div>
        <div style="flex:1">
          <strong style="font-size:13px;color:var(--blue);display:block">Ürün Kabul Süresi</strong>
          <span style="font-size:11px;color:var(--muted2)">Parti başına sabit ek süre — miktar arttıkça kademeli artar (1-32→1x, 33-80→2x, 81-125→3x, 125+→4x)</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <input type="number" value="${parseFloat(k.urunKabulSuresi)||0}" min="0" step="1" id="inp-kabul-${k.id}"
            onchange="updateUrunKabulSuresi(${k.id},this.value)" style="width:80px;text-align:right;padding:6px 8px;border:1px solid var(--border);border-radius:6px">
          <span style="font-size:12px;color:var(--muted);white-space:nowrap">saniye</span>
        </div>
      </div>

      <div style="margin-bottom:16px">
        ${k.istasyonlar.length===0?`
          <div style="padding:40px 24px;text-align:center;border:2px dashed var(--border);border-radius:8px;background:var(--offwhite)">
            <div style="font-size:24px;margin-bottom:8px;opacity:0.5">⚙️</div>
            <h3 style="font-size:13px;font-weight:500;color:var(--muted);margin-bottom:4px">"İstasyon Ekle" ile başlayın</h3>
            <p style="font-size:11px;color:var(--muted2)" data-i18n="add_first_station">Bu klasmanı tanımlamaya başlamak için ilk istasyonu ekleyin</p>
          </div>
        `:''}
        ${k.istasyonlar.map((ist,i)=>`
          <div style="display:grid;grid-template-columns:40px 1fr auto auto auto;gap:12px;align-items:center;padding:12px;background:var(--white);border:1px solid var(--border2);border-radius:8px;margin-bottom:8px">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--lblue2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:var(--blue)">${i+1}</div>
            <input value="${ist.ad}" onchange="updateIst(${k.id},${ist.id},'ad',this.value)" placeholder="İstasyon adı" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">
            <div style="display:flex;align-items:center;gap:6px">
              <input type="number" value="${ist.sure}" min="0" step="1"
                onchange="updateIst(${k.id},${ist.id},'sure',this.value)" style="width:80px;text-align:right;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px">
              <span style="font-size:11px;color:var(--muted);white-space:nowrap">sn</span>
            </div>
            <div style="font-size:10px;color:var(--muted2);text-align:right;min-width:40px">
              ${toplamSure > 0 ? ((parseFloat(ist.sure)||0)/toplamSure*100).toFixed(0) : 0}%
            </div>
            <button onclick="deleteIst(${k.id},${ist.id})" style="width:28px;height:28px;border:none;background:var(--lred);color:var(--red);border-radius:6px;cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center" title="İstasyonu Sil">🗑</button>
          </div>`).join('')}
      </div>
      
      ${k.istasyonlar.length>0 || urunKontrolSuresi>0?`
        <div style="background:linear-gradient(135deg,var(--lblue3) 0%,#fff 100%);border:1px solid var(--lblue);border-radius:10px;padding:16px">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;text-align:center">
            <div>
              <div style="font-size:18px;font-weight:700;color:var(--navy);font-family:'DM Mono',monospace">${toplamSure.toFixed(0)}</div>
              <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px" data-i18n="total_duration_label">Total Duration (s)</div>
            </div>
            <div>
              <div style="font-size:18px;font-weight:700;color:var(--blue);font-family:'DM Mono',monospace">${k.istasyonlar.length}</div>
              <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px" data-i18n="station_count">İstasyon Sayısı</div>
            </div>
            <div>
              <div style="font-size:18px;font-weight:700;color:var(--green);font-family:'DM Mono',monospace">${(toplamSure/60).toFixed(1)}</div>
              <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Dakika/Adet</div>
            </div>
          </div>
        </div>`:''}
    </div>`;
}

function updateUrunKontrol(kId, val) {
  const k = klasmanlar.find(x => x.id === kId);
  if (!k) return;
  k.urunKontrolSuresi = parseFloat(val) || 0;
  autoSaveAndPushKlasmanlar();
  renderEditor(); 
  renderListe();
}

function updateOlcuSuresi(kId, val) {
  const k = klasmanlar.find(x => x.id === kId);
  if (!k) return;
  k.olcuSuresi = parseFloat(val) || 0;
  autoSaveAndPushKlasmanlar();
  renderEditor();
  renderListe();
}

function updateUrunKabulSuresi(kId, val) {
  const k = klasmanlar.find(x => x.id === kId);
  if (!k) return;
  k.urunKabulSuresi = parseFloat(val) || 0;
  autoSaveAndPushKlasmanlar();
  renderEditor();
  renderListe();
}

function updateIst(kId,iId,alan,val){
  const k=klasmanlar.find(x=>x.id===kId);
  const ist=k&&k.istasyonlar.find(i=>i.id===iId);
  if(!ist) return;
  if(alan==='sure') ist.sure=parseFloat(val)||0; else ist.ad=val;
  autoSaveAndPushKlasmanlar();
  renderEditor(); renderListe();
}

function updateKlasmanAd(kId, val) {
  const k = klasmanlar.find(x => x.id === kId);
  if (!k || !val.trim()) return;
  k.ad = val.trim();
  autoSaveAndPushKlasmanlar();
  // Kartları güncelle
  renderListe();
  // Editör başlığını da güncelle
  const editorHeader = document.querySelector('#editor-content h2');
  if (editorHeader) editorHeader.innerHTML = `<span>${k.icon || '📦'}</span> ${k.ad} — Düzenle`;
}

function updateKlasmanIcon(kId, ic) {
  const k = klasmanlar.find(x => x.id === kId);
  if (!k) return;
  k.icon = ic;
  autoSaveAndPushKlasmanlar();
  renderEditor(); renderListe();
}

function deleteIst(kId,iId){
  const k=klasmanlar.find(x=>x.id===kId);
  if(!k) return;
  k.istasyonlar=k.istasyonlar.filter(i=>i.id!==iId);
  autoSaveAndPushKlasmanlar();
  renderEditor(); renderListe();
}

// ─── KLASMAN İKON LİSTESİ ───
const KL_ICONS = [
  // Giyim — üst
  '👔','👕','🥼','🧥','🧣','👗','👘','🥻','🩱','🎽',
  // Giyim — alt
  '👖','🩲','🩳','🩴',
  // Ayakkabı & aksesuar
  '👟','👠','👡','👢','👞','🥾','🥿','👒','🎩','🧢','⛑️','👑',
  '👜','👝','💼','🎒','🧳','👛','💍','💎',
  // Tekstil & ev
  '🧶','🧵','🪡','🛋️','🛏️','🪣','🧺','🪢',
  // Spor
  '⚽','🏀','🎾','🏋️','🤸','🧘','🏊','🚴','🥊','🎯',
  // Diğer ürünler
  '📦','🎁','🛒','🏷️','📋','🗂️','📁','🗃️',
  // Kategori/bölüm
  '⭐','🔶','🔷','🟢','🟡','🟠','🔴','🟣','⚡','🌟','🎪','🏅'
];

function openModal(){
  document.getElementById('modal-input').value='';
  // İlk ikonu seç
  const defaultIcon = KL_ICONS[0];
  document.getElementById('modal-icon-val').value = defaultIcon;
  document.getElementById('modal-icon-preview').textContent = defaultIcon;
  
  // İkon grid'i oluştur
  const grid = document.getElementById('modal-icon-grid');
  grid.innerHTML = KL_ICONS.map((ic,i) => `
    <button onclick="selectModalIcon('${ic}')" title="${ic}"
      id="mig-${i}"
      style="font-size:18px;padding:5px;border-radius:7px;border:2px solid ${i===0?'var(--blue2)':'var(--border2)'};
      background:${i===0?'var(--lblue2)':'var(--white)'};cursor:pointer;transition:all .12s;aspect-ratio:1;"
    >${ic}</button>
  `).join('');
  
  document.getElementById('modal').classList.add('open');
  setTimeout(()=>document.getElementById('modal-input').focus(),80);
}

function selectModalIcon(ic) {
  document.getElementById('modal-icon-val').value = ic;
  document.getElementById('modal-icon-preview').textContent = ic;
  // Grid'deki seçili stili güncelle
  const grid = document.getElementById('modal-icon-grid');
  [...grid.children].forEach(btn => {
    const selected = btn.textContent.trim() === ic;
    btn.style.borderColor = selected ? 'var(--blue2)' : 'var(--border2)';
    btn.style.background  = selected ? 'var(--lblue2)' : 'var(--white)';
  });
}

function addIstasyon(kId){
  const k=klasmanlar.find(x=>x.id===kId);
  if(!k) return;
  const nid=Math.max(0,...k.istasyonlar.map(i=>i.id))+1;
  k.istasyonlar.push({id:nid,ad:'Yeni İstasyon',sure:60});
  autoSaveAndPushKlasmanlar();
  renderEditor(); renderListe();
}

function closeModal(){ 
  document.getElementById('modal').classList.remove('open'); 
}

function modalKey(e){ 
  if(e.key==='Enter') addKlasman(); 
  if(e.key==='Escape') closeModal(); 
}

function addKlasman(){
  const ad=document.getElementById('modal-input').value.trim();
  if(!ad) return;
  const icon = document.getElementById('modal-icon-val')?.value || '👔';
  const yeni={id:nextId++, ad, icon, urunKontrolSuresi: 60, olcuSuresi: 0, urunKabulSuresi: 0, istasyonlar:[]};
  klasmanlar.push(yeni);
  closeModal();
  secilenId=yeni.id;
  sayfa=Math.ceil(filtered().length/KL_PER_PAGE);
  autoSaveAndPushKlasmanlar();
  renderListe(); renderEditor();
}


// ────────────────────────────
// EXCEL YÜKLEME & PERFORMANS
// ────────────────────────────
function excelYukle(e){
  const file=e.target.files[0];
  if(!file) return;
  
  showFileStatus((translations[currentLang]||translations.tr).file_uploading, 'var(--blue)');
  
  const reader=new FileReader();
  reader.onload=function(ev){
    try{
      const wb=XLSX.read(ev.target.result,{type:'binary'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
      
      if(!rows.length){ 
        showFileStatus((translations[currentLang]||translations.tr).file_empty,'var(--red)'); 
        return; 
      }
      
      excelRows=rows;
      excelCols=Object.keys(rows[0]);
      showFileStatus('✅ '+rows.length+' ' + (translations[currentLang]||translations.tr).file_loaded + file.name,'var(--green)');
      document.getElementById('upload-zone').style.background = 'var(--lgreen)';
      document.getElementById('upload-zone').style.borderColor = 'var(--green)';
      fillColSelects();
      document.getElementById('sutun-panel').style.display = 'block';
      performansHesapla();
    }catch(err){
      showFileStatus((translations[currentLang]||translations.tr).file_error+err.message,'var(--red)');
    }
  };
  reader.readAsBinaryString(file);
}

function showFileStatus(msg,color){
  const el=document.getElementById('file-status');
  el.textContent=msg; 
  el.style.color=color;
}

function fillColSelects(){
  const opts='<option value="">— seçin —</option>'+excelCols.map(c=>`<option value="${c}">${c}</option>`).join('');
  ['col-klasman','col-inspector','col-adet','col-baslangic','col-bitis','col-talep'].forEach(id=>{ 
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts; 
  });
  const mesaiEl = document.getElementById('col-mesai');
  if (mesaiEl) mesaiEl.innerHTML = '<option value="">— opsiyonel —</option>' + excelCols.map(c=>`<option value="${c}">${c}</option>`).join('');
  const yapilanDepoEl = document.getElementById('col-yapilan-depo');
  if (yapilanDepoEl) yapilanDepoEl.innerHTML = `<option value="">${(translations[currentLang]||translations.tr).filter_none}</option>` + excelCols.map(c=>`<option value="${c}">${c}</option>`).join('');
  const sonucEl = document.getElementById('col-sonuc');
  if (sonucEl) sonucEl.innerHTML = '<option value="">— Kullanma —</option>' + excelCols.map(c=>`<option value="${c}">${c}</option>`).join('');
  
  // Otomatik tahmin — Türkçe karakter ve boşluk normalize edilerek eşleştirilir
  function normCol(s) {
    return String(s).toLowerCase()
      .replace(/ş/g,'s').replace(/ı/g,'i').replace(/ğ/g,'g')
      .replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c')
      .replace(/\s+/g,'');
  }
  const klasmanCol    = excelCols[0] || '';
  const adetCol       = excelCols.find(c => normCol(c).includes('bakilacakmiktar')) || excelCols[17] || '';
  const insCol        = excelCols.find(c => normCol(c).includes('inspector')) || '';
  const baslangicCol  = excelCols.find(c => normCol(c).includes('inspectionbaslamatarihi') || normCol(c).includes('inspectionbaslama')) || excelCols[10] || '';
  const bitisCol      = excelCols.find(c => normCol(c).includes('inspectionbitistarihi') || normCol(c).includes('inspectionbitis')) || excelCols[11] || '';
  
  if(klasmanCol && document.getElementById('col-klasman')) document.getElementById('col-klasman').value = klasmanCol;
  if(adetCol && document.getElementById('col-adet')) document.getElementById('col-adet').value = adetCol;
  if(insCol && document.getElementById('col-inspector')) document.getElementById('col-inspector').value = insCol;
  if(baslangicCol && document.getElementById('col-baslangic')) document.getElementById('col-baslangic').value = baslangicCol;
  if(bitisCol && document.getElementById('col-bitis')) document.getElementById('col-bitis').value = bitisCol;
  
  const mesaiCol = excelCols.find(c => c.toLowerCase().includes('mesai') || c.toLowerCase().includes('shift') || c.toLowerCase().includes('çalışmasüresi')) || '';
  if (mesaiCol && document.getElementById('col-mesai')) document.getElementById('col-mesai').value = mesaiCol;

  // TalepNumarası otomatik tahmin
  const talepColAuto = excelCols.find(c => {
    const norm = c.toLowerCase().replace(/[^a-z0-9]/g,'').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ı/g,'i').replace(/ç/g,'c');
    return norm.includes('talepno') || norm.includes('talepnumarasi') || norm.includes('talep') || norm === 'talep';
  }) || '';
  if (talepColAuto && document.getElementById('col-talep')) document.getElementById('col-talep').value = talepColAuto;

  // InspectionYapilanDepo otomatik tahmin
  const yapilanDepoColAuto = excelCols.find(c => c.toLowerCase().replace(/[^a-z]/g,'').includes('yapilandepo') || c.toLowerCase().replace(/\s/g,'') === 'inspectionyapilandepo') || excelCols[19] || '';
  if (yapilanDepoColAuto && document.getElementById('col-yapilan-depo')) document.getElementById('col-yapilan-depo').value = yapilanDepoColAuto;

  // InspectionSonuc otomatik tahmin — "sonuc" veya "sonuç" içeren sütun, "ysg" içerenleri öncelikle hariç tut
  const sonucColAuto = excelCols.find(c => {
    const norm = c.toLowerCase().replace(/[^a-z0-9]/g,'').replace(/ç/g,'c').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ı/g,'i');
    return (norm.includes('inspectionsonuc') || norm.includes('inspectionsonuç') || norm === 'sonuc' || norm === 'sonuç') && !norm.startsWith('ysg');
  }) || excelCols.find(c => {
    const norm = c.toLowerCase().replace(/[^a-z0-9]/g,'').replace(/ç/g,'c').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ı/g,'i');
    return norm.includes('sonuc') || norm.includes('sonuç');
  });
  if (sonucColAuto && document.getElementById('col-sonuc')) document.getElementById('col-sonuc').value = sonucColAuto;
}

