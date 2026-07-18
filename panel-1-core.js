/* ============================================================
   GLOBAL STATE - dosyanin en basinda tanimlanir, init kodu
   calismadan once kesin olarak hazir olsun diye
   ============================================================ */
let _teamManagersOpen = false; // Ekip Yoneticileri bolumu - default kapali

// ── Teknik İnceleme modülü state'i (v5.11) ──────────────────────────────────
// NOT: Bu değişkenler burada, dosyanın en başında tanımlanmalı. Aşağıdaki
// "INIT & EVENT LISTENERS" bölümü sayfa yüklenirken senkron olarak
// renderDashboard() çağırıyor; bu da renderInspectorCards() üzerinden
// teknikSkorlar'a erişiyor. Bu değişkenler dosyanın sonunda tanımlansaydı,
// henüz initialize olmadan (TDZ) erişilmeye çalışılır ve tüm script'in
// yüklenmesi burada çöker (sayfa hiç açılmaz) — bu yüzden en başta olmalılar.
const TI_SKOR_LS_KEY   = 'lc_teknik_inceleme_skor_cache';
const TI_KRITER_LS_KEY = 'lc_teknik_inceleme_kriter_cache';
let teknikKriterler = [];   // [{id, metin, puan, aktif, sira}]
let teknikSkorlar   = [];   // ham cevap satırları [{id, inspector, degerlendiren, tarih, kriterId, kriterMetin, maxPuan, tikli, kazanilanPuan, aciklama, savedAt}]
const TI_BASARI_ESIGI = 85; // Değerlendirme başına başarı eşiği (%) — bu ve üstü "Başarılı" sayılır

// ─── Az Veri Uyarı Eşiği (kullanıcı talebiyle) ───
// Bir inspector'ın çalışma gün sayısı bu eşiğin ALTINDAYSA, performans
// sıralamalarında (Dashboard kartı, En İyi 10 listesi, Genel Performans
// tablosu) "⚠️ az veri" rozeti gösterilir. AMA sıralamadan/listeden
// ÇIKARILMAZ — sadece az veriye dayandığı görsel olarak belirtilir
// (ör. 1 günlük bir performans, 44 günlük ortalamayla aynı ağırlıkta
// görünüp yanıltıcı olabiliyordu).
const AZ_VERI_GUN_ESIGI = 10;
function azVeriMi(gunSayisi) {
  return (gunSayisi || 0) < AZ_VERI_GUN_ESIGI;
}
function azVeriRozetiHtml(stil) {
  // stil: 'inline' (küçük metin) | 'badge' (renkli kutu)
  if (stil === 'badge') {
    return `<span title="Bu performans ${AZ_VERI_GUN_ESIGI} günden az çalışma verisine dayanıyor — dikkatli yorumlayın" style="font-size:8.5px;font-weight:700;background:#FFF3E0;color:#E65100;padding:2px 6px;border-radius:8px;letter-spacing:.3px;margin-left:5px;white-space:nowrap;">⚠️ az veri</span>`;
  }
  return `<span title="Bu performans ${AZ_VERI_GUN_ESIGI} günden az çalışma verisine dayanıyor — dikkatli yorumlayın" style="color:#E65100;font-weight:600;">⚠️ az veri</span>`;
}

// Admin'in yüklediği resmi "Teknik İnceleme" checklist formundaki 21 madde (toplam 100 puan).
// "Varsayılan Soruları Yükle" butonuyla tek tıkla kriter listesine eklenir.
const TI_DEFAULT_KRITERLER = [
  { metin: '1. Mobil inspection ürün al yapma işleminde İş emri veya Talep numarası kontrolü doğru yapıldı mı?', puan: 2 },
  { metin: '2. Gold Seal Kontrolü ve Ürün ile Gold Seal karşılaştırılması yapıldı mı?', puan: 5 },
  { metin: '3. Barkod Okutması yapıldı mı? (her bedenden 1er adet iç-dış barkod)', puan: 2 },
  { metin: '4. Lot İçi adet Kontrolü (Asorti) yapıldı mı?', puan: 2 },
  { metin: '5. Aynı lotta renk/tuşe farkı kontrolü yapıldı mı?', puan: 2 },
  { metin: '6a. Ölçü Kontrolü - Talimatta belirtilen adette ölçü kontrolü yapıldı mı?', puan: 5 },
  { metin: "6b. Ölçü Kontrolü - Ölçü kontrolü işlemleri 'ST-203 How to Measure'a göre uygun yapıldı mı?", puan: 10 },
  { metin: '6c. Ölçü Kontrolü - Ölçü Kontrol Sonucu sisteme doğru şekilde girildi mi?', puan: 6 },
  { metin: '6d. Ölçü Kontrolü - Fit Kontrolü - Ürün Giydirme - Resim Çekme yapıldı mı?', puan: 2 },
  { metin: '7a. Saat Yönünde Kontrol - Üst/Alt gruplarda doğru bölgeden başlayarak saat yönünde kontrol yapıldı mı?', puan: 20 },
  { metin: '7b. Saat Yönünde Kontrol - Etiketler kontrol edildi mi?', puan: 4 },
  { metin: '7c. Saat Yönünde Kontrol - Tüm dikişler kontrol edildi mi?', puan: 4 },
  { metin: '7d. Saat Yönünde Kontrol - Simetri kontrolü yapıldı mı?', puan: 4 },
  { metin: '7e. Saat Yönünde Kontrol - Ürünlerin tersi kontrol edildi mi?', puan: 4 },
  { metin: '8. Görsel Optik Kontrol (saat yönünde kontrol sonrası kalan adetler için) doğru yapıldı mı?', puan: 10 },
  { metin: '9. Saat yönünde kontrolde çıkan hatalar görsel optik kontrolde takip edildi mi?', puan: 2 },
  { metin: '10. Hataların Kritik/Majör/Minör olarak sınıflandırılması doğru yapıldı mı?', puan: 2 },
  { metin: '11. Bulunan hataların Mobil inspection standartlarına göre resimleri çekildi mi?', puan: 2 },
  { metin: '12. Pull Test - Gramaj Uygulamaları yapıldı mı?', puan: 2 },
  { metin: '13. Ticari karara hazırlama / paketleme tasnifi doğru yapıldı mı?', puan: 2 },
  { metin: '14. Zamanı etkin kullanıyor mu?', puan: 8 }
];
// Not: loadTeknikIncelemeFromLocalStorage / loadTeknikKriterFromLocalStorage
// fonksiyonları dosyanın altında tanımlı (function hoisting sayesinde burada
// çağrılabilirler); localStorage cache'ini en erken noktada belleğe alır.
try { if (typeof loadTeknikIncelemeFromLocalStorage === 'function') loadTeknikIncelemeFromLocalStorage(); } catch(e) {}
try { if (typeof loadTeknikKriterFromLocalStorage === 'function') loadTeknikKriterFromLocalStorage(); } catch(e) {}


/* ============================================================
   ÇEVIRI / TRANSLATION SYSTEM
   ============================================================ */
const translations = {
  tr: {
    // Login
    login_title:          'Giriş Yap',
    login_sub:            'Şifrenizi girerek devam edin',
    login_btn:            '🔓 Giriş Yap',
    password_placeholder: '••••••',
    username_placeholder: 'Kullanıcı adı (admin için boş bırakın)',
    server_active:        'Sunucu doğrulaması aktif',
    cancel:               'İptal',
    nav_user_mgmt:        'Kullanıcı Yönetimi',
    logout_btn:           'Çıkış Yap',
    change_my_pw:         '✏️ Şifremi Değiştir',

    // Top bar
    how_it_works:         'ℹ️ Nasıl Çalışır',
    klasman:              'Klasman',

    // Sidebar nav
    nav_home:             'Ana Sayfa',
    nav_dashboard:        'Dashboard',
    nav_management:       'Yönetim',
    nav_klasman_mgmt:     'Klasman Yönetimi',
    nav_analysis:         'Analiz',
    nav_klasman_analysis: 'Klasman Analizi',
    nav_perf_analysis:    'Performans Analizi',
    nav_display:          'Görüntüleme',
    nav_live:             'Canlı Gösterim',

    // Dashboard page
    dash_title:           'Inspector Performans Dashboard',
    dash_sub:             'Tüm inspectörlerin performans durumunu tek ekranda izleyin',
    pull_from_sheets:     '📥 Sheets\'ten Çek',
    clear:                '🗑️ Temizle',
    export_excel:         '📊 Excel\'e Aktar',

    // Summary stats
    stat_total_inspector: 'Toplam Inspector',
    stat_excellent:       'Mükemmel (≥95%)',
    stat_good:            'İyi (≥85%)',
    stat_average:         'Orta (70-84%)',
    stat_poor:            'Gelişime Açık (50-69%)',
    stat_verypoor:        'Zayıf (<50%)',
    stat_avg_perf:        '📅 Ortalama Performans',
    stat_avg_days:        '⏰ Ortalama Çalışma Günü',
    stat_total_product:   '📦 Toplam Ürün',

    // Filters
    filter_perf:          'Performans Filtresi:',
    filter_all:           'Tümü',
    filter_klasman:       'Klasman Filtresi:',
    filter_all_klasman:   'Tüm Klasmanlar',
    filter_search:        'Inspector Ara:',
    inspector_search_ph:  'Inspector adı...',
    filter_sort:          'Sıralama:',
    sort_perf_desc:       'Performans (Yüksek→Düşük)',
    sort_perf_asc:        'Performans (Düşük→Yüksek)',
    sort_name_asc:        'İsim (A→Z)',
    sort_name_desc:       'İsim (Z→A)',
    sort_qty_desc:        'Adet (Çok→Az)',
    sort_qty_asc:         'Adet (Az→Çok)',

    // Empty state
    no_data_yet:          'Henüz performans verisi yok',
    no_data_sub:          'Performans Analizi sayfasından Excel yükleyip analiz yapın',

    // Pagination
    prev:                 '‹ Önceki',
    next:                 'Sonraki ›',

    // Login dynamic states (JS ile üretilen)
    verifying:            '⏳ Doğrulanıyor...',
    connecting:           'Sunucuya bağlanılıyor...',
    verified:             'Doğrulandı ✓',
    error_label:          'Hata',
    pw_empty:             '❌ Şifre boş olamaz',
    pw_wrong:             '❌ Yanlış şifre, tekrar deneyin',
    pw_no_server_cache:   '⚠️ Sunucuya bağlanılamadı ve önbellek bulunamadı. İnternet bağlantınızı kontrol edin.',
    pw_offline:           'Çevrimdışı doğrulama (önbellek)',
    pw_no_sheets_pw:      'Sheets\'te şifre bulunamadı',
    pw_unreachable:       'Sunucuya ulaşılamadı',
    pw_wrong_klasman:     'Yanlış şifre!',
    pw_overlay_title:     'Giriş Yap',
    pw_overlay_sub:       'Devam etmek için şifrenizi girin',
    pw_klasman_title:     'Klasman Yönetimi',
    pw_klasman_sub:       'Bu bölüme erişmek için şifre gereklidir',
    // Dynamic JS strings
    sending:              '⏳ Gönderiliyor...',
    pulling:              '⏳ Çekiliyor...',
    no_data_js:           'Veri yok',
    no_data_js_hint:      'Önce Performans Analizi sayfasından Excel yükleyin',
    data_not_found:       'Veri bulunamadı',
    days_suffix:          'gün',
    days_suffix_short:    'gün',
    filter_none:          '— Filtre yok (tüm satırlar) —',
    detailed_perf:        'Detaylı Performans',
    loading_records:      'Kayıt detayları yükleniyor...',
    sampling_desc:        '<span data-i18n="sampling_off">Kapalı: gerçek adet kullanılır.</span> <strong data-i18n="one_below">Bir Alttan</strong> / <strong data-i18n="two_below">İki Alttan</strong>: <span data-i18n="sampling_desc_end">adet örnekleme tablosuna göre dönüştürülür.</span>',
    target_below_100:     'hedef → performans',
    target_above_100:     'hedef → performans',
    start_slideshow:      'Gösterimi Başlat',
    stop_slideshow:       '⏸ Durdur',
    no_perf_alert:        'Henüz performans verisi yok! Önce Performans Analizi sayfasından veri yükleyin.',
    records_summary:      'kayıt · ',
    units_summary:        'adet · ',
    analyzing:            'Analiz ediliyor...',
    col_overtime_label:   '⏰ Mesai Süresi',
    // Card & JS dynamic labels
    working:              'gün çalışma',
    units_short:          'adet',
    klasman_word:         'klasman',
    efficiency_label:     'verimlilik',
    above_target:         'hedeften hızlı',
    below_target:         'hedeften yavaş',
    overtime_over:        'mesai üstü',
    detailed_analysis:    'Detaylı Analiz',
    perf_excellent:       'Mükemmel',
    perf_good:            'İyi',
    perf_average:         'Orta',
    perf_poor:            'Zayıf',
    perf_weak:            'Gelişime Açık',
    perf_verypoor:        'Zayıf',
    stat_total_product2:  'TOPLAM ADET',
    std_duration_label:   'STANDART SÜRE',
    adj_perf_label_upper: 'DÜZ. PERFORMANS',
    best_inspector_month: 'Ayın En İyi Inspector\'ü',
    // Final remaining keys
    excel_cols_hint:      'Excel dosyanızda A Klasman, R BakilacakMiktar, K BaşlamaTarihi, L BitişTarihi sütunları bulunmalıdır.',
    overtime_col_hint:    'Mesai sütunu seçilmezse günlük 7.5s × gün bazında hesaplanır.',
    col_t_label:          'Sütun (T)',
    blank_rows_hint:      'Seçilirse boş satırlar hesaplamaya dahil edilmez.',
    security_warning:     'Güvenlik Uyarısı:',
    try_other_model:      'Hata alırsan farklı model dene',
    default_opt:          'Varsayılan',
    sort_by_date:         'Tarihe Göre ↑',
    sampling_off:         'Kapalı: gerçek adet kullanılır.',
    one_below:            'Bir Alttan',
    sampling_desc_end:    'adet örnekleme tablosuna göre dönüştürülür.',
    // New dynamic keys
    closed_label:         'Kapalı',
    open_label:           'Açık',
    hide_label:           'Gizle',
    raw_avg:              'Ham Ort.:',
    perf_formula:         'Standart Süre ÷ (Gün × 7.5s) × 100',
    adj_formula:          'Ham Perf × (100÷${hedef})',
    records_word:         'kayıt',
    days_x_formula:       'gün × 7.5s = {h}s mesai bazlı',
    avg_perf_plain:       'Ortalama Performans',
    stat_avg_perf_plain:  'Ortalama Performans',
    ai_overtime_prompt:   'Mesai süresi ve mesai üstü durumunu analiz et. Yoğunluk ne zaman en yüksek? Mesai yönetimi nasıl?',
    waiting_best_inspector: 'Ayın En İyi Inspector\'ü bekleniyor...',
    // Extended i18n keys
    actual_duration_th:    'Gerçekleşen Süre',
    actual_label:          '⏱ Gerçekleşen',
    actual_per_unit:       'Gerçekleşen/Adet',
    actual_vs_std:         'Gerçekleşen / Standart oranı',
    add_first_station:     'Bu klasmanı tanımlamaya başlamak için ilk istasyonu ekleyin',
    add_station:           '＋ İstasyon Ekle',
    adj_avg_perf:          'Düz. Ort. Performans:',
    adj_avg_short:         '⚡ Düz. Ort.:',
    adj_perf_label:        'Düz. Performans',
    ai_custom_q:           '💬 Özel Soru Sor',
    ai_general:            '📊 Genel Performans Değerlendirmesi',
    ai_improve:            '💡 İyileştirme Önerileri',
    ai_klasman_compare:    '👔 Klasmana Göre Karşılaştırma',
    ai_overtime:           '🌙 Mesai & Yoğunluk Analizi',
    ai_panel_hint:         'AI destekli detaylı analiz · Açmak için tıklayın',
    ai_strengths:          '💪 Güçlü/Zayıf Yönler',
    all_btn:               'Tümü',
    all_inspectors:        'Tüm Inspectorler',
    api_key_warning:       '⚠️ Anahtarınızı başkalarıyla paylaşmayın.',
    api_token_hint:        '(Apps Script\'teki API_TOKEN değeriyle eşleşmeli)',
    apiscript_match_hint:  'Apps Script dosyasındaki değerle eşleşmeli',
    app_subtitle:          'Inspection Kontrol',
    avg_work_days:         '📆 Ort. Çalışma:',
    awaiting_results:      'Analiz sonuçları bekleniyor',
    broadcast_settings:    'Yayın Ayarları',
    broadcast_settings_hint: 'Gösterimi başlatmadan önce ayarlayın',
    cancel_btn:            'İptal',
    change_klasman_pw:     '✏️ Klasman Şifresini Değiştir',
    change_pw:             '✏️ Şifreyi Değiştir',
    change_search:         'Arama kriterlerini değiştirin',
    col_auto_derive:       '— K/L sütunlarından otomatik türet —',
    col_end_date:          'Bitiş Tarihi (L)',
    col_inspector:         'Inspector Sütunu',
    col_klasman:           'Klasman Sütunu (A)',
    col_mapping_title:     '🔗 Sütun Eşleştirme',
    col_start_date:        'Başlangıç Tarihi (K)',
    completed_btn:         '✅ Tamamlandı',
    current_pw:            'Mevcut şifre:',
    current_time:          'Şu Anki Saat',
    // Kullanıcı Yönetimi
    user_mgmt_title:       '👥 Kullanıcı Yönetimi',
    user_mgmt_sub:         'Kullanıcı ekleyin, düzenleyin ve hangi sekmeleri görebileceklerini belirleyin',
    refresh:               'Yenile',
    add_user:              'Yeni Kullanıcı',
    user_list:             'Kullanıcılar',
    username_col:          'Kullanıcı Adı',
    tabs_col:              'Görebileceği Sekmeler',
    actions_col:           'İşlemler',
    loading:               'Yükleniyor…',
    user_mgmt_hint:        'Kullanıcılar admin şifresi yerine kendi kullanıcı adı/şifresi ile giriş yapar. Burada verilen sekmeler dışındaki bölümleri göremezler. Dashboard her kullanıcıya açıktır.',
    user_modal_hint:       'Kullanıcı adı, şifre ve görebileceği sekmeleri belirleyin',
    username_label:        'Kullanıcı Adı',
    password_label:        'Şifre',
    password_hint:         'En az 4 karakter',
    password_hint_edit:    'Değiştirmek istemiyorsanız boş bırakın',
    select_tabs:           'Görebileceği Sekmeler',
    save_btn:              '💾 Kaydet',
    edit_btn:              '✏️ Düzenle',
    delete_btn:            '🗑️ Sil',
    no_users:              'Henüz kullanıcı eklenmemiş',
    admin_row_note:        'Tüm sekmelere erişebilir',
    // Ekip Yönetimi (Dashboard)
    my_team_title:         '👥 Ekibim',
    manage_team:           'Ekibi Düzenle',
    other_teams_btn:       'Diğer Ekipler',
    other_teams_title:     'Ekip Performansları',
    other_teams_empty:     'Başka ekip yöneticisi bulunamadı.',
    team_member_count:     'Ekip Üyesi',
    team_avg_perf:         'Ekip Ort. Performans',
    team_total_product:    'Ekip Toplam Ürün',
    team_avg_days:         'Ekip Ort. Çalışma Günü',
    team_empty_hint:       'Henüz ekibinize inspector eklemediniz. "Ekibi Düzenle" butonuyla başlayın.',
    remove_from_team:      'Ekipten çıkar',
    team_modal_title:      '👥 Ekibimi Düzenle',
    team_modal_sub:        'Takip etmek istediğiniz inspectorleri seçin',
    team_search_ph:        'Inspector ara...',
    team_no_result:        'Sonuç bulunamadı',
    team_only_filter:      '👥 Sadece Ekibim',
    team_remove_confirm:   'ekipten çıkarılsın mı?',
    team_managers_label:   'Ekip Yöneticileri',
    team_manager_prefix:   'Ekip Yöneticisi',
    team_manager_member_count: 'Çalışan Sayısı',
    team_manager_total_qty:    'Kontrol Edilen Adet',
    team_manager_avg_perf:     'Performans Ortalaması',
    team_manager_no_members:   'Bu ekibe henüz inspector eklenmemiş.',
    nav_ekip_analiz:       'Ekibim Analizi',
    ekip_analiz_title:     '🧑‍🤝‍🧑 Ekibim Analizi',
    ekip_analiz_sub:       'Ekip üyelerinizin performansını klasman bazında karşılaştırın',
    ekip_analiz_top_producer:     'En Çok Üretim',
    ekip_analiz_general_ranking:  'Genel Performans Sıralaması',
    ekip_analiz_col_name:         'Inspector',
    ekip_analiz_col_perf:         'Performans',
    ekip_analiz_col_qty:          'Toplam Adet',
    ekip_analiz_col_klasman_count: 'Klasman Sayısı',
    ekip_analiz_dist_title:       'Performans Dağılımı',
    ekip_analiz_uretim_title:     'Verimlilik / Adet Dağılımı',
    ekip_analiz_daily_avg:        'Günlük ortalama adet',
    general_status_label:  'Genel Durum',
    display_not_started:   'Gösterim başlamadı',
    download_excel:        '📊 Excel İndir',
    end_date_th:           'Bitiş',
    excel_upload_title:    '📁 Excel Yükle',
    file_drop:             'Dosya seçin veya sürükleyin',
    file_format:           '.xlsx / .xls formatı',
    filter_no_result:      'Filtre sonucu bulunamadı',
    filter_no_result_hint: 'Filtre kriterlerini değiştirmeyi deneyin',
    gemini_8b:             'gemini-1.5-flash-8b (En Hızlı)',
    gemini_api_key:        'Gemini API Anahtarı',
    gemini_flash:          'gemini-2.5-flash (Önerilen)',
    gemini_lite:           'gemini-2.0-flash-lite (Ücretsiz / Hızlı)',
    gemini_pro:            'gemini-2.5-pro (En Güçlü)',
    how_to_setup:          'Nasıl kurulur? ℹ️',
    icon_modal_hint:       'Bir isim girin ve bir ikon seçin',
    inspector_detail_sub:  'Klasman bazında detaylı performans analizi',
    inspector_detail_title:'Inspector Detayları',
    klasman_analiz_overlay_sub:   'Klasman bazında detaylı performans analizi',
    klasman_analiz_overlay_title: 'Klasman Analizi — Sheets\'ten Çekildi',
    klasman_analiz_sub:    'Klasman bazında standart ve gerçekleşen birim muayene sürelerini karşılaştırın',
    klasman_analiz_title:  '🎯 Klasmana Göre Gerçekleşen Süre Analizi',
    klasman_count:         'Klasmanlar',
    klasman_details:       '📋 Klasman Detayları',
    klasman_filter_empty:  'Filtreyle eşleşen klasman bulunamadı',
    klasman_pw_hint:       'Bu sayfa için erişim şifresi:',
    klasman_pw_label:      '🔑 Klasman Yönetimi Şifresi:',
    live_h2_sub:           'Inspector performansını canlı takip edin',
    live_h2_title:         'Canlı Performans Gösterimi',
    live_page_sub:         'Inspector performanslarını büyük ekranda yayınlayın · HD video dışa aktarımı',
    live_page_title:       'Canlı Performans Gösterimi',
    login_klasman_sub:     'Bu bölüme erişmek için yönetici şifresi gereklidir',
    login_klasman_title:   'Klasman Yönetimi',
    no_data_hint:          'Analizi görmek için Excel yükleyin ve klasman tanımlarını tamamlayın',
    no_data_live:          'Henüz veri yok',
    no_perf_data:          'Performans Verisi Bulunamadı',
    no_perf_data_hint:     'Önce Performans Analizi sayfasından Excel yükleyin',
    no_records_found:      'Filtreyle eşleşen kayıt bulunamadı.',
    not_found:             'Bulunamadı',
    one_unit_check:        '1 adet muayene',
    open_link:             '🔗 Aç',
    open_link_hint:        'Tabloyu tarayıcıda açmak için kullanılır',
    opt_excellent:         'Mükemmel (≥95%)',
    opt_good:              'İyi (≥85%)',
    overtime_duration:     'Mesai Süresi',
    page_klasman_sub:      'Ürün klasmanlarını tanımlayın ve istasyon sürelerini ayarlayın',
    page_klasman_title:    'Klasman Yönetimi',
    perf_how_sub:          'Hesaplama mantığı, formüller ve Google Sheets entegrasyonu',
    perf_how_title:        '📊 Performans Analizi — Nasıl Çalışır?',
    perf_page_sub:         'Excel dosyası yükleyin ve inspector bazında performansı ölçün',
    perf_page_title:       'Performans Analizi',
    print_btn:             '🖨️ Yazdır',
    pull:                  '📥 Çek',
    pw_settings:           '🔒 Şifre Ayarları:',
    quick_analyses:        '⚡ Hızlı Analizler',
    record_count:          'Kayıt Sayısı',
    reset:                 '↺ Sıfırla',
    sampling_mode:         'Örnekleme Modu',
    sampling_date_toggle:  '📅 Tarihe Göre Farklı Seviyeler Kullan',
    sampling_date_hint:    'Aktif edildiğinde, başlangıç tarihi belirlenen aralıklara denk gelen kayıtlar o döneme ait örnekleme moduna göre hesaplanır. Aralık dışında kalan kayıtlar için yukarıdaki varsayılan mod kullanılır.',
    sampling_period_add:   '+ Dönem Ekle',
    sampling_period_max:   'En fazla 10 dönem ekleyebilirsiniz',
    sampling_period_start: 'Başlangıç',
    sampling_period_end:   'Bitiş',
    sampling_period_mode:  'Mod',
    sampling_period_remove:'Dönemi kaldır',
    sampling_default_label:'Varsayılan (aralık dışı kayıtlar)',
    mode_kapali:           'Kapalı',
    mode_bir:              'Bir Alttan',
    mode_iki:              'İki Alttan',
    see_details:           'Detayları Gör',
    select_icon:           'İkon Seç',
    select_icon_btn:       'İkon Seç',
    select_klasman:        'Bir klasman seçin',
    select_klasman_hint:   'İstasyon sürelerini düzenlemek için soldan bir klasman seçin',
    selected_icon:         'Seçilen ikon',
    send:                  '📤 Gönder',
    send_btn:              'Gönder ↵',
    send_hint:             'Ctrl+Enter ile de gönderebilirsiniz',
    sheets_conn_sub:       'Klasman verilerini Google Sheets ile senkronize edin — farklı bilgisayarlardan erişin',
    sheets_conn_title:     'Google Sheets Bağlantısı',
    sheets_help_intro:     'Klasman verilerini Google Sheets ile senkronize etmek için',
    sheets_settings_title: '🔗 Google Sheets Bağlantı Ayarları',
    sheets_table_label:    'Google Sheets Tablo Bağlantısı (Görüntüle)',
    sheets_url_label:      'Google Apps Script Web App URL\'si (Veri Gönder/Al)',
    slide_duration:        '⏱ Slayt Süresi',
    slide_flip:            'Çevirme',
    slide_slide:           'Kaydırma',
    slide_zoom:            'Yakınlaştırma',
    sort_diff_best:        'Fark ↑ (En İyi)',
    sort_diff_worst:       'Fark ↓ (En Kötü)',
    sort_label:            'Sırala:',
    start_date_th:         'Başlangıç',
    station_count:         'İstasyon Sayısı',
    status_high:           '🔴 Yüksek',
    status_near:           '⚠️ Yakın',
    std_duration:          'Standart Süre',
    std_duration_th:       'Standart Süre',
    top5:                  'İlk 10',
    total_duration_label:  'Toplam Süre (sn)',
    total_product:         'Toplam Ürün',
    total_qty:             'Toplam Adet',
    transition_effect:     '✨ Geçiş Efekti',
    two_below:             'İki Alttan',
    unit_check_duration:   '1 Birim Muayene Süresi',
    unit_check_hint:       'Ürün başına harcanan standart süre',
    view_mode:             '👁 Görüntüleme Modu',
    waiting_data:          'Veri bekleniyor',
    waiting_data_sub:      'Performans analizi çalıştırıldıktan sonra burası otomatik dolacak',
    no_overtime_data:      'Mesai verisi yok',
    gkey_empty:            '⚠️ Boş bırakmayın.',
    gkey_invalid:          '⚠️ Geçersiz format. API anahtarı çok kısa.',
    gkey_saving:           '✅ Kaydedildi! Sheets\'e gönderiliyor...',
    gkey_saved_sheets:     '✅ Anahtar kaydedildi ve Sheets\'e gönderildi!',
    gkey_saved_local:      '✅ Yerel kaydedildi (Sheets bağlantısı yok).',
    gkey_save_fail:        '❌ Kayıt başarısız: ',
    gkey_deleted:          '🗑 Anahtar silindi. Sheets\'ten temizleniyor...',
    gkey_ask_question:     'Lütfen bir soru girin.',
    gkey_no_key:           'Lütfen önce Gemini API anahtarınızı girin ve kaydedin.',
    gkey_empty_response:   'Gemini boş yanıt döndürdü.',
    gkey_api_error:        'API Hatası: ',
    gkey_check_key:        ' — API anahtarınızı kontrol edin.',
    date_filter_with:      'Tarihi Olanlar',
    date_filter_without:   'Tarihi Olmayanlar',
    analysis_result:       'Analiz Sonucu',
    clear_btn:             '✕ Temizle',
    gemini_analyzing:      'Gemini analiz ediyor...',
    custom_analysis:       '💬 Özel Analiz',
    clearing:              '⏳ Temizleniyor...',
    clear_confirm:         '⚠️ Tüm performans verileri silinecek!\n\nBu işlem:\n• Dashboard verilerini temizler\n• Google Sheets\'teki İşlem Geçmişi, Performans Verileri, PerformansRaw ve InspectorKayitlar sekmelerini siler\n\nDevam etmek istiyor musunuz?',
    clear_ok_sheets:       '✅ Veriler temizlendi! (Local + Sheets)',
    clear_ok_local_err:    '✅ Local veriler temizlendi. Sheets bağlantı hatası: ',
    clear_ok_local:        '✅ Local veriler temizlendi. (Sheets bağlantısı yapılandırılmamış)',
    clear_status:          '🗑️ Tüm performans verileri temizlendi',
    klasman_actual_analysis: 'Klasman Bazında Gerçekleşen Süre Analizi',
    total_units_summary:   'toplam adet',
    on_target:             'Hedefte',
    near_target:           'Yakın',
    high_label:            'Yüksek',
    no_std:                'Std Yok',
    std_duration_sn:       '🕐 Standart Süre (sn)',
    actual_duration_sn:    '⏱ Fiili/Mesai Süresi (sn)',
    perf_formula_inline:   '(Standart Süre ÷ Mesai Süresi) × 100',
    file_uploading:        '⏳ Dosya yükleniyor...',
    file_empty:            '❌ Dosya boş görünüyor.',
    file_loaded:           '✅ satır başarıyla yüklendi — ',
    file_error:            '❌ Hata: ',
    col_select_warning:    '⚠️ Lütfen en az Klasman, Inspector ve Adet sütunlarını seçin',
    no_data_processable:   '❌ İşlenebilir veri bulunamadı',
    analysis_done:         ' inspector başarıyla analiz edildi',
    hd_recording:          '🔴 HD Video kaydediliyor (1920×1080)...',
    // Sheets sync messages
    sheets_sent_klasman:   '✅ klasman Google Sheets\'e gönderildi!',
    sheets_updated_count:  '✅ klasman + performans verisi Sheets\'ten güncellendi!',
    sheets_loaded_perf:    '✅ inspector verisi Sheets\'ten yüklendi!',
    sheets_no_perf:        'ℹ️ Sheets\'te henüz performans verisi yok.',
    sheets_sent_perf:      '✅ inspector verisi Google Sheets\'e gönderildi!',
    sheets_loaded_to_perf: '✅ inspector verisi Sheets\'ten Performans Analizi\'ne yüklendi!',
    sheets_klasman_sync:   '☁️ Klasman değişikliği Sheets\'e senkronize edildi',
    sheets_perf_updated:   '✅ Sheets\'ten inspector verisi güncellendi',
    sheets_analiz_sent:    '✅ Klasman analizi güncellendi ve Sheets\'e gönderildi!',
    sheets_analiz_loaded:  '✅ klasman analizi Sheets\'ten yüklendi!',
    // PWA
    pwa_install:           'Uygulamayı Yükle',
    pwa_install_full:      'Uygulamayı Yükle — Kısayol Oluştur',
    pwa_install_hint:      'Masaüstüne veya ana ekrana ekleyin, uygulama gibi açılır',
    pwa_installed:         '✅ Uygulama yüklendi!',
    pwa_installing:        '⏳ Yükleniyor...',
  }
};

let currentLang = 'tr'; // Panel artik sadece Turkce destekliyor; dil secimi kaldirildi

// i18n yardımcısı: belirli bir DOM kökü altındaki tüm [data-i18n] ve [data-i18n-placeholder] elementlerini çevirir
function applyI18nToNewNodes(root) {
  const lang = currentLang;
  const t = translations[lang] || translations.tr;
  (root || document).querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key] !== undefined) el.textContent = t[key];
  });
  (root || document).querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (t[key] !== undefined) el.placeholder = t[key];
  });
}

function setLang(lang) {
  if (!translations[lang]) return;
  currentLang = lang;
  localStorage.setItem('panelLang', lang);

  // Update lang-btn active states (both pw-overlay and topbar)
  document.querySelectorAll('.lang-btn, .topbar-lang-btn').forEach(btn => btn.classList.remove('active'));
  // pw-overlay buttons
  const pwBtn = document.getElementById('pw-lang-btn-' + lang);
  if (pwBtn) pwBtn.classList.add('active');
  // topbar buttons
  const tbBtn = document.getElementById('lang-btn-' + lang);
  if (tbBtn) tbBtn.classList.add('active');

  // Translate all [data-i18n] and [data-i18n-placeholder] elements in the whole document
  applyI18nToNewNodes(document);

  // Select <option> elemanlarını çevir (data-i18n attribute'u varsa)
  document.querySelectorAll('select option[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = (translations[lang]||translations.tr)[key];
    if (val !== undefined) el.text = val;
  });

  // Update <html lang="...">
  document.documentElement.lang = lang;

  // Re-render JS-generated content that uses translations
  try { if (typeof updateSidebar === 'function') updateSidebar(); } catch(e) {}
  try { if (typeof renderDashboard === 'function' && performansData && performansData.length) renderDashboard(); } catch(e) {}
}

// Apply saved / default language on page load
document.addEventListener('DOMContentLoaded', () => {
  setLang(currentLang);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// GLOBAL DEĞİŞKENLER VE SABITLER
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

// ────────────────────────────
// TEMEL AYARLAR
// ────────────────────────────
const PER_PAGE = 10;
const DASHBOARD_PER_PAGE = 12;
const GUNLUK_CALISMA_SANIYE = 7.5 * 3600; // 7.5 saat = 27000 saniye

// ────────────────────────────
// VERI YAPILARI
// ────────────────────────────
let klasmanlar = [];
let nextId = 1;
let secilenId = null;
let sayfa = 1;
let aramaStr = '';

// Excel ve Performans
let excelRows = [];
let excelCols = [];
let performansData = [];
let kayipZamanData = []; // { id, inspector, tarih, gun, baslangic, bitis, sebep, aciklama, ekipYoneticisi, sureDk }

// "Bugünün tarihi"ni YEREL saate göre (YYYY-MM-DD) döner — new Date().
// toISOString() KULLANMAZ çünkü o UTC'ye çevirir ve gece yarısına yakın
// saatlerde (özellikle UTC+3 Türkiye saatinde) bir gün KAYABİLİR: örneğin
// Türkiye'de 00:30'da (yerel "bugün") toISOString() hâlâ UTC'deki "dün"ü
// döner — bu da "Bugün Teknik Değ." gibi günlük hedef takibinde kaydın
// yanlış güne düşmesine (dashboard'da görünmemesine) yol açar.
function _bugununTarihiYerel() {
  const d = new Date();
  const yil = d.getFullYear();
  const ay = String(d.getMonth() + 1).padStart(2, '0');
  const gun = String(d.getDate()).padStart(2, '0');
  return `${yil}-${ay}-${gun}`;
}

// ─── İkinci Inspection (kullanıcı talebiyle eklendi) ───
// Teknik İnceleme bölümüne giriş yapan kullanıcıların ikinci hedefi: günlük
// belirli sayıda "ikinci inspection" kaydı girmeleri gerekiyor.
let ikinciInspectionData = []; // { id, siparisKodu, inspector, ekipYoneticisi, talepNo, talepMiktari, sonuc, notAlani, tarih, degerlendiren, savedAt }
// Teknik İnceleme hedefleri (admin tarafından ayarlanır) — varsayılan: günlük
// 3 teknik değerlendirme, günlük 5 ikinci inspection.
let teknikHedefler = { teknikDegerlendirmeGunluk: 3, ikinciInspectionGunluk: 5, baslangicTarihi: '' };

// Kullanıcı yönetimi (Users sekmesi) için global cache — sayfa açılışında
// renderDashboard() → renderTeamManagersSection() zinciri tarafından erken
// kullanıldığından, TDZ hatasını önlemek için burada (dosyanın başında) tanımlanır.
let _usersCache = [];
let _editingUsername = null; // null => yeni kullanıcı, string => düzenleniyor
let _kzLastFetchTime = 0;
const KZ_CACHE_MS = 20000; // 20 saniye icinde tekrar girilirse network'e gitmeden cache'den goster

// 2.Kalite ürünlerinin Genel Performans hesabına dahil edilip edilmeyeceğini
// kontrol eden toggle. VARSAYILAN: false (kapalı) — mevcut/eski davranış birebir
// korunur: 2.Kalite kayıtları genel performansa hiç karışmaz, ayrı gösterilir.
// true olursa: 2.Kalite kayıtları diğer kayıtlarla aynı akıştan geçer (ayrım kalkar).
let _2KaliteDahil = false;

// Overtime çalışmasının Düz. Performans hesabına dahil edilip edilmeyeceği.
// VARSAYILAN: false — performans sadece normal mesai (08:00-16:45) paydasıyla hesaplanır.
// true olursa: overtime saatleri de mesai paydasına eklenir.
let _overtimeDahil = false;

// ─── Kayıp Zaman localStorage cache ───
// Sayfa yenilendiğinde (F5) JS state sıfırlanır; bu yüzden son çekilen veriyi
// localStorage'da tutup açılışta anında gösteriyoruz, arkaplanda Sheets'ten tazeliyoruz.
const KZ_LS_KEY = 'lc_kayip_zaman_cache';

function saveKayipZamanToLocalStorage() {
  try {
    localStorage.setItem(KZ_LS_KEY, JSON.stringify({
      kayitlar: kayipZamanData,
      savedAt: Date.now()
    }));
  } catch (err) {
    console.warn('Kayıp zaman localStorage kaydetme hatası:', err);
  }
}

function loadKayipZamanFromLocalStorage() {
  try {
    const raw = localStorage.getItem(KZ_LS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.kayitlar)) {
      kayipZamanData = parsed.kayitlar;
      _kzLastFetchTime = parsed.savedAt || 0;
      return true;
    }
  } catch (err) {
    console.warn('Kayıp zaman localStorage okuma hatası:', err);
  }
  return false;
}

// Dashboard
let filteredInspectors = [];
let currentDashboardPage = 1;

// Inspector Detay
let selectedInspectorDetail = null;

// ────────────────────────────
// SLIDESHOW DEĞİŞKENLERİ
// ────────────────────────────
let slideshowActive = false;
let slideshowInspectors = [];
let currentSlideIndex = 0;
let slideshowInterval = null;
let progressInterval = null;

// Slideshow Ayarları
let slideDuration = 5000; // 5 saniye
let displayMode = 'all'; // all, top5, excellent, good
let animationEffect = 'slide'; // slide, fade, zoom, flip

// ────────────────────────────
// APP CONFIG (Tüm Ayarlar)
// ────────────────────────────
const APP_CONFIG_KEY = 'lc_inspection_config';
const DEFAULT_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzrARAnKp2iqx4JsrXjnHdiSFpYgJtFPKWbZCPWQsXkgHUfpUlmmIx_d0Zom1gItq0T/exec'; // ARTIK KULLANILMIYOR (referans için tutuluyor)

// ─── cPanel/MySQL Backend API'si — TÜM veri artık buradan geçiyor ───
// Performans, Klasmanlar, Config, Kullanıcılar, Kayıp Zaman, Teknik İnceleme,
// Klasman Analizi — hepsi bu TEK api.php dosyası üzerinden okunup yazılıyor.
// Google Sheets/Apps Script'e artık HİÇ ihtiyaç yok.
const PHP_API_URL = 'https://fantaktik.com/kalibre-api/api.php';
// Geriye dönük uyumluluk: bazı fonksiyonlar hâlâ PHP_PERFORMANS_API_URL adını
// kullanıyor (aynı dosyaya işaret ediyor, yeniden adlandırmaya gerek yok).
const PHP_PERFORMANS_API_URL = PHP_API_URL;
const DEFAULT_API_TOKEN  = 'lcw-secret-2024';

// ─── GOOGLE SHEETS/APPS SCRIPT ARTIK KULLANILMIYOR ───
// Eskiden bu bayrak Sheets bağlantılarını engellemek için "true" idi. Artık
// TÜM istekler zaten PHP_API_URL'e gittiği için (appConfig.sheetsWebAppUrl
// aşağıda PHP_API_URL'e sabitlendi) bu bayrağı "false" yapıp jsonpFetch'in
// normal akışının (önce sunucu, olmazsa yerel önbellek) PHP ile sorunsuz
// çalışmasına izin veriyoruz. Adı "SHEETS_DEVRE_DISI" olarak kaldı ama artık
// anlamı "eski davranışı zorla engelleme" — kod tabanının başka hiçbir yerini
// değiştirmemek için isim korundu.
const SHEETS_DEVRE_DISI = false;

// ─── ADMİN ŞİFRESİ ARTIK KODDA YOK ───
// Şifre, kodun içinde SAKLANMAZ — her girişte PHP backend'inden (kv_store
// 'config' kaydı) çekilir. Panel içinden "Şifre Değiştir" yapıldığında bu
// kayıt güncellenir; kaynak kodda hiçbir zaman gerçek şifre görünmez.
// (Bir kerelik ilk kurulum için veritabanına şifre yazma adımı gerekir —
// ayrıca sağlanan SQL komutuyla yapılır.)

let appConfig = {
  password: '',
  sheetsWebAppUrl: PHP_API_URL,
  sheetsViewUrl: '',
  sheetsApiToken: DEFAULT_API_TOKEN,
  activeQuarters: []
};

// ────────────────────────────
// KULLANICI / YETKİ SİSTEMİ
// ────────────────────────────
// currentUser: { username, isAdmin, tabs: [...] }
// Admin: appConfig.password ile giriş yapar, tüm sekmelere erişir.
// Normal kullanıcı: Users sekmesindeki kullanıcı adı + kendi şifresiyle giriş yapar,
// sadece admin tarafından verilen sekmelere erişir.
const CURRENT_USER_KEY = 'lc_current_user';
let currentUser = null;
try {
  const cu = localStorage.getItem(CURRENT_USER_KEY);
  if (cu) currentUser = JSON.parse(cu);
} catch(e) { currentUser = null; }

// Yönetilebilir sekmeler (Kullanıcı Yönetimi sayfasında checkbox olarak gösterilir)
const ASSIGNABLE_TABS = [
  { id: 'dashboard',        label: 'Dashboard' },
  { id: 'klasman-analiz',   label: 'Klasman Analizi' },
  { id: 'performans',       label: 'Performans Analizi' },
  { id: 'canli',            label: 'Canlı Gösterim' },
  { id: 'teknik-inceleme',  label: 'Teknik İnceleme' }
];

// Yeni bilgisayar tespiti: localStorage'da config hiç yoksa
const _isNewDevice = !localStorage.getItem(APP_CONFIG_KEY);

// ─── CONFIG SHEETS ENTEGRASYONU ───
// Şifre ve ayarları Sheets'teki "Config" sekmesine push/pull eder
async function pushConfigToSheets() {
  if (SHEETS_DEVRE_DISI) return;
  const url = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token) return;
  try {
    let geminiKey = '';
    try { geminiKey = localStorage.getItem('gemini_api_key_perf_panel') || ''; } catch(e) {}
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'setConfig',
        token: token,
        config: {
          password: appConfig.password,
          geminiApiKey: geminiKey,
          activeQuarters: appConfig.activeQuarters || []
        }
      }),
      mode: 'no-cors'
    });
    console.log('✅ Config (şifre + Gemini key) Sheets\'e gönderildi');
  } catch(e) { console.warn('Config push hatası:', e.message); }
}

// ─── GOOGLE SHEETS VERİ ÇEKME YARDIMCISI ───
// iframe + postMessage yöntemi (v5.1)
// JSONP ve fetch/redirect yaklaşımları Apps Script'in
// script.google.com → script.googleusercontent.com redirect'i nedeniyle
// GitHub Pages'ten çalışmıyordu. iframe redirect'i sorunsuz takip eder,
// içindeki <script> postMessage ile veriyi üst pencereye iletir.
// ─── jsonpFetch: KalibRe PHP Backend'ine (cPanel/MySQL) istek atar ───
// v3 — GERÇEK fetch() + CORS. Artık Google Apps Script'e değil, kendi
// api.php'mize (PHP_API_URL) konuşuyoruz. Kendi sunucumuz olduğu için CORS
// header'larını (Access-Control-Allow-Origin) doğrudan kontrol edebiliyoruz —
// bu yüzden eski iframe+postMessage / script-tag JSONP gibi CORS atlatma
// numaralarına ARTIK HİÇ İHTİYAÇ YOK. Fonksiyon adı (jsonpFetch) geriye dönük
// uyumluluk için korundu — kod tabanındaki 25 çağrı noktasının hiçbiri
// değişmeden, sadece bu fonksiyonun İÇİ değişti.
function jsonpFetch(url, params) {
  const qs = Object.entries(params)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v == null ? '' : v).normalize('NFC')))
    .join('&');
  const fullUrl = url + (url.includes('?') ? '&' : '?') + qs;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  return fetch(fullUrl, { method: 'GET', signal: controller.signal })
    .then(res => {
      clearTimeout(timer);
      if (!res.ok) throw new Error('API HTTP ' + res.status);
      return res.json();
    })
    .catch(err => {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(
          'Sunucuya bağlanılamadı (25 sn zaman aşımı).\n\n' +
          'Bu geçici bir ağ yavaşlaşması olabilir.\n' +
          'İnternet bağlantınızı kontrol edip tekrar deneyin.'
        );
      }
      throw err;
    });
}

async function pullConfigFromSheets() {
  if (SHEETS_DEVRE_DISI) return false;
  const url = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token) return false;
  try {
    const data = await jsonpFetch(url, { action: 'getConfig', token });
    if (data.status === 'ok' && data.config) {
      if (data.config.password)        appConfig.password        = data.config.password;
      // Gemini API key varsa localStorage'a yaz ve input'a doldur
      if (data.config.geminiApiKey) {
        try { localStorage.setItem('gemini_api_key_perf_panel', data.config.geminiApiKey); } catch(e) {}
        const keyInput = document.getElementById('ao-gkey');
        if (keyInput) keyInput.value = data.config.geminiApiKey;
        console.log('✅ Gemini API anahtarı Sheets\'ten yüklendi');
      }
            if (Array.isArray(data.config.activeQuarters) && data.config.activeQuarters.length > 0) {
        appConfig.activeQuarters = data.config.activeQuarters;
      }
localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(appConfig));
      console.log('✅ Config Sheets\'ten çekildi');
      return true;
    }
  } catch(e) { console.warn('Config pull hatası:', e.message); }
  return false;
}

// ─── İLK AÇILIŞTA OTOMATİK VERİ ÇEK ───
async function autoFetchOnStartup() {
  // NOT: SHEETS_DEVRE_DISI artık "false" — bu yüzden aşağıdaki kısa devre
  // bloğu ARTIK ÇALIŞMIYOR, sadece geçmiş bir geçiş aşamasının izi olarak
  // duruyor (silinmedi, ileride tekrar lazım olursa true yapmak yeterli).
  // Gerçek akış, bu bloğun ALTINDAKİ tam sürümdür — o da artık Google
  // Sheets'e değil, appConfig.sheetsWebAppUrl (= PHP_API_URL) üzerinden
  // cPanel/MySQL'e gider: Config, Klasmanlar, Performans, Teknik İnceleme,
  // Kayıp Zaman, Ekip senkronizasyonu — hepsi PHP'den gelir.
  if (SHEETS_DEVRE_DISI) {
    if (!PHP_PERFORMANS_API_URL) return; // hiçbir kaynak yapılandırılmamışsa sessizce çık
    showStartupBanner('📥 Performans verisi çekiliyor...');
    try {
      await pullPerformansFromSheets(true); // silent=true — kendi render/saveData işlemlerini de yapar
      showStartupBanner(`✅ Performans verisi güncellendi (${performansData.length} inspector)`, 'success');
    } catch(e) {
      console.warn('Performans otomatik çekme hatası:', e.message);
      hideStartupBanner();
    }
    return;
  }

  const url = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token) return;

  // Config (şifre) çek
  await pullConfigFromSheets();

  // Ekip yöneticisi ise ekip listesini Sheets'ten taze çek (başka cihazdan
  // değişmiş olabilir) ve "Ekibim" kartını güncelle
  if (currentUser && !currentUser.isAdmin) {
    try {
      const teamData = await jsonpFetch(url, { action: 'getUserTeam', token, username: currentUser.username });
      if (teamData.status === 'ok' && Array.isArray(teamData.team)) {
        currentUser.team = teamData.team;
        try { localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser)); } catch(e) {}
        renderTeamSection();
      }
    } catch(e) { console.warn('Ekip senkronizasyon hatası:', e.message); }
  }

  // Eğer daha önce hiç veri çekilmemişse (klasmanlar boş veya varsayılan 3'lü) Sheets'ten çek
  const isDefault = klasmanlar.length === 3 &&
    klasmanlar.every((k,i) => ['Pantolon','Ceket','Mont'][i] === k.ad);
  const hasNoKlasman = klasmanlar.length === 0;

  showStartupBanner('📥 Sheets\u2019ten veriler çekiliyor...');

  // ── Klasmanları çek (boşsa veya varsayılan 3'lüyse) ──
  if (isDefault || hasNoKlasman) {
    console.log('🔄 İlk açılış: Sheets\u2019ten klasmanlar otomatik çekiliyor...');
    try {
      const data = await jsonpFetch(url, { action: 'getKlasmanlar', token });
      if (data.status === 'ok' && Array.isArray(data.klasmanlar) && data.klasmanlar.length > 0) {
        klasmanlar = data.klasmanlar;
        nextId = Math.max(1, ...klasmanlar.map(k => k.id || 0)) + 1;
        renderListe();
        renderEditor();
        updateKlasmanFilter();
        console.log('✅ Klasmanlar yüklendi:', klasmanlar.length);
      }
    } catch(e) {
      console.warn('Klasman otomatik çekme hatası:', e.message);
    }
  }

  // ── Performans verisini her zaman çek (tüm kullanıcılar güncel görsün) ──
  try {
    const { performansData: pd } = await fetchPerformansRawPaginated(url, token);
    if (pd && pd.length > 0) {
      performansData = fixVerimlilikPerf(restorePerformansDateObjects(pd));
      console.log('✅ Performans verisi yüklendi:', performansData.length, 'inspector');
    }
  } catch(e) {
    console.warn('Performans otomatik çekme hatası:', e.message);
  }

  // ── Teknik İnceleme skorlarını çek (dashboard kartlarında gösterim için) ──
  try {
    const tiData = await jsonpFetch(url, { action: 'getTeknikIncelemeSkorlar', token });
    if (tiData.status === 'ok' && Array.isArray(tiData.skorlar)) {
      teknikSkorlar = tiData.skorlar;
      saveTeknikIncelemeToLocalStorage();
    }
  } catch(e) { console.warn('Teknik İnceleme skor çekme hatası:', e.message); }

  // ── Kayıp zaman verisini çek (dashboard kartlarındaki "Değerlendirme Dışı"
  // rozeti için) — Kayıp Zaman sekmesine hiç girilmemiş/erişimi olmayan
  // kullanıcılarda bile bu rozet doğru gözüksün diye burada, herkes için çekilir.
  try {
    await fetchKayipZamanData();
  } catch(e) { console.warn('Kayıp zaman verisi çekme hatası (startup):', e.message); }

  // ── İkinci Inspection verisini çek (ana Dashboard'un Excel çıktısında
  // "İkinci Insp. Geçti/Toplam Oranı" sütunu doğru gözüksün diye — Teknik
  // İnceleme sekmesine hiç girilmemiş olsa bile burada, herkes için çekilir.
  try {
    await fetchIkinciInspectionData();
  } catch(e) { console.warn('İkinci Inspection verisi çekme hatası (startup):', e.message); }

  // ── Tümünü kaydet ve render et ──
  saveData();
  updateSidebar();
  renderDashboard(); renderQuarterBadge(performansData);
  renderPerfTabloFromData();
  renderTopInspectors();
  showStartupBanner(`✅ Sheets senkronizasyonu tamamlandı (${klasmanlar.length} klasman, ${performansData.length} inspector)`, 'success');
  console.log('✅ Otomatik yükleme tamamlandı');
}

function showStartupBanner(msg, type) {
  let banner = document.getElementById('startup-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'startup-banner';
    banner.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:999;padding:10px 22px;border-radius:9px;font-size:13px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,.2);transition:all .3s;white-space:nowrap';
    document.body.appendChild(banner);
  }
  if (type === 'success')     banner.style.background = 'var(--green)';
  else if (type === 'error')  banner.style.background = 'var(--red)';
  else if (type === 'info')   banner.style.background = 'var(--amber)';
  else                        banner.style.background = 'var(--blue2)';
  banner.style.color = '#fff';
  banner.textContent = msg;
  banner.style.display = 'block';
  if (type === 'success') setTimeout(hideStartupBanner, 4000);
}

function hideStartupBanner() {
  const banner = document.getElementById('startup-banner');
  if (banner) banner.style.display = 'none';
}

function loadConfig() {
  try {
    const saved = localStorage.getItem(APP_CONFIG_KEY);
    if (saved) {
      const cfg = JSON.parse(saved);
      appConfig = { ...appConfig, ...cfg };
      if (Array.isArray(cfg.activeQuarters) && cfg.activeQuarters.length > 0) {
        setTimeout(function() { if (typeof _restoreQuarterBadge === 'function') _restoreQuarterBadge(cfg.activeQuarters); }, 500);
      }
    }
  } catch(e) {}
  // URL her zaman sabit kalır — localStorage'daki eski değer görmezden gelinir (v5.2)
  const OLD_URLS = [
    'https://script.google.com/macros/s/AKfycbylHwcu3q2CnNwmNUQIyjkuhyAcapnxabPmAGrKW70GU-IVWhq_55KHwk2NBQ3pGhaOgQ/exec',
    'https://script.google.com/macros/s/AKfycbwdM7izL7cwHzYNIAG_N0wZ1_NpKM_AyBp0wrpgRtnoLHa_WnMh-JQZfeRJhdq6BPzg7Q/exec',
    'https://script.google.com/macros/s/AKfycbzXFslNKDL3LlWEQPi8suFqSw5iqm65r2-KamgptTK1tXUY6Fpl25C8ok5zhoUGW1bSAg/exec'
  ];
  // Her zaman PHP API URL'ini kullan (farklı bilgisayarda da değişmez)
  appConfig.sheetsWebAppUrl = PHP_API_URL;
  if (!appConfig.sheetsApiToken) appConfig.sheetsApiToken = DEFAULT_API_TOKEN;
  // Şifre artık SADECE localStorage'daki önbellekten (varsa, en son PHP'den
  // başarıyla çekilen değer) veya checkPassword() içinde PHP'den (kv_store
  // config) anlık çekilen değerden gelir — kodda sabit bir yedek YOKTUR.
  // UI'ya yansıt
  const wuEl = document.getElementById('sheets-webapp-url');
  const vuEl = document.getElementById('sheets-view-url');
  const tkEl = document.getElementById('sheets-api-token');
  if (wuEl) wuEl.value = appConfig.sheetsWebAppUrl || '';
  if (vuEl) vuEl.value = appConfig.sheetsViewUrl || '';
  if (tkEl) tkEl.value = appConfig.sheetsApiToken || '';
  updateSheetsViewLink();
}

function saveConfig() {
  // sheetsWebAppUrl her zaman HTML'e gömülü sabit değeri kullanır (v5.2)
  appConfig.sheetsWebAppUrl  = DEFAULT_SHEETS_URL;
  appConfig.sheetsViewUrl    = document.getElementById('sheets-view-url')?.value?.trim()   || '';
  appConfig.sheetsApiToken   = document.getElementById('sheets-api-token')?.value?.trim()  || '';
  localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(appConfig));
  updateSheetsViewLink();
  // URL+token doluysa Sheets Config sekmesine şifreyi de yaz (debounced)
  clearTimeout(window._configPushTimer);
  window._configPushTimer = setTimeout(() => pushConfigToSheets(), 2000);
}

function toggleTokenVisibility() {
  const inp = document.getElementById('sheets-api-token');
  const btn = document.getElementById('token-eye-btn');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁️' : '🙈';
}

function updateSheetsViewLink() {
  const link = document.getElementById('sheets-view-link');
  if (!link) return;
  const url = appConfig.sheetsViewUrl;
  link.href = url || '#';
  link.style.opacity = url ? '1' : '0.5';
}

// ────────────────────────────
// ŞİFRE KONTROLÜ
// ────────────────────────────
// sessionStorage ile çalışır: sekme açık olduğu sürece bir kez şifre yeter.
// Sekme kapatılınca sıfırlanır, yeni açılışta tekrar sorar.
const SESSION_KEY = 'lc_session_unlocked';
let klasmanUnlocked = sessionStorage.getItem(SESSION_KEY) === '1';
let pendingNavEl = null;

// Sayfa ilk açılışında şifre sor (henüz unlock olmadıysa)
function initPasswordGate() {
  if (!klasmanUnlocked) {
    let remembered = null;
    try { remembered = JSON.parse(localStorage.getItem('lc_remembered_creds') || 'null'); } catch(e) {}

    if (remembered && remembered.password) {
      klasmanUnlocked = true;
      sessionStorage.setItem(SESSION_KEY, '1');
      if (!currentUser) {
        currentUser = remembered.username && remembered.username.toLowerCase() !== 'admin'
          ? { username: remembered.username, isAdmin: false, tabs: [], team: [] }
          : { username: 'admin', isAdmin: true, tabs: 'all' };
      }
      const shell = document.getElementById('app-shell');
      if (shell) shell.style.display = 'block';
      applyUserPermissions();
      setTimeout(() => autoFetchOnStartup(), 600);
      _verifyRememberedCredsInBackground(remembered);
      return;
    }

    document.getElementById('pw-overlay').style.display = 'flex';
  } else {
    const shell = document.getElementById('app-shell');
    if (shell) shell.style.display = 'block';
    applyUserPermissions();
    setTimeout(() => autoFetchOnStartup(), 600);
  }
}

// Hatırlanan giriş bilgilerini arka planda doğrular; geçersizse oturumu kapatır.
async function _verifyRememberedCredsInBackground(remembered) {
  const url = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token) return;
  const isAdminUser = !remembered.username || remembered.username.toLowerCase() === 'admin';
  try {
    if (isAdminUser) {
      const data = await jsonpFetch(url, { action: 'getConfig', token });
      if (data.status === 'ok' && data.config && data.config.password) {
        appConfig.password = data.config.password;
        localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(appConfig));
        if (remembered.password !== data.config.password) {
          logoutUser('⚠️ Şifre değişti, lütfen yeni şifre ile giriş yapın');
        }
      }
    } else {
      const data = await jsonpFetch(url, { action: 'login', token, username: remembered.username, password: remembered.password });
      if (data.status === 'ok' && data.user) {
        currentUser = { username: data.user.username, isAdmin: false, tabs: data.user.tabs || [], team: data.user.team || [] };
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
        applyUserPermissions();
        if (document.getElementById('page-dashboard')?.classList.contains('active')) renderTeamSection();
      } else {
        logoutUser('⚠️ Kullanıcı bilgileriniz geçersiz, lütfen tekrar giriş yapın');
      }
    }
  } catch(e) {}
}

// Oturumu kapatır ve giriş ekranına döner.
function logoutUser(msg) {
  try {
    localStorage.removeItem('lc_remembered_creds');
    localStorage.removeItem(CURRENT_USER_KEY);
  } catch(e) {}
  currentUser = null;
  klasmanUnlocked = false;
  sessionStorage.removeItem(SESSION_KEY);
  const shell = document.getElementById('app-shell');
  if (shell) shell.style.display = 'none';
  document.getElementById('pw-overlay').style.display = 'flex';
  const errEl = document.getElementById('pw-err');
  if (errEl) errEl.textContent = msg || '';
  const userEl = document.getElementById('pw-username');
  if (userEl) userEl.value = '';
  const passEl = document.getElementById('pw-input');
  if (passEl) { passEl.value = ''; passEl.focus(); }
}

// Giriş yapan kullanıcıya göre sidebar sekmelerini gösterir/gizler.
function applyUserPermissions() {
  const isAdmin = !currentUser || currentUser.isAdmin;
  const navKlasman = document.getElementById('nav-klasmanlar');
  const navUsers   = document.getElementById('nav-kullanicilar');
  if (navKlasman) navKlasman.style.display = isAdmin ? '' : 'none';
  if (navUsers)   navUsers.style.display   = isAdmin ? '' : 'none';

  ASSIGNABLE_TABS.forEach(t => {
    if (t.id === 'dashboard') return; // herkes görebilir
    const allowed = isAdmin || (currentUser.tabs || []).includes(t.id);
    document.querySelectorAll('.nav-item').forEach(el => {
      const onclick = el.getAttribute('onclick') || '';
      if (onclick.indexOf("showPage('" + t.id + "'") !== -1) {
        el.style.display = allowed ? '' : 'none';
      }
    });
  });

  const unameEl = document.getElementById('current-username-label');
  if (unameEl) unameEl.textContent = (currentUser && !currentUser.isAdmin) ? currentUser.username : 'admin';

  // Ekip yönetimi UI'ları sadece ekip yöneticisi (admin olmayan) kullanıcılara gösterilir
  const teamCard   = document.getElementById('my-team-card');
  const teamFilter = document.getElementById('team-only-filter-group');
  const genelLabel = document.getElementById('general-status-label');
  const showTeamUi = currentUser && !currentUser.isAdmin;
  if (teamCard)   teamCard.style.display   = showTeamUi ? '' : 'none';
  if (teamFilter) teamFilter.style.display = showTeamUi ? '' : 'none';
  if (genelLabel) genelLabel.style.display = showTeamUi ? 'flex' : 'none';

  // Ekip yöneticileri özet kartları sadece admin'e gösterilir
  const teamManagersSection = document.getElementById('team-managers-section');
  if (teamManagersSection && showTeamUi) teamManagersSection.style.display = 'none';

  // "Ekibim Analizi" sekmesi: yalnızca atanmış ekibi olan kullanıcılara gösterilir
  const navEkipAnaliz = document.getElementById('nav-ekip-analiz');
  if (navEkipAnaliz) {
    const hasTeam = showTeamUi && (currentUser.team || []).length > 0;
    navEkipAnaliz.style.display = hasTeam ? '' : 'none';
  }

  // Kayip Zaman Girisi sekmesi: yalnizca ekip yoneticilerine
  const navKayipEkip = document.getElementById('nav-kayip-zaman-ekip');
  if (navKayipEkip) {
    const hasTeam = showTeamUi && (currentUser.team || []).length > 0;
    navKayipEkip.style.display = hasTeam ? '' : 'none';
  }

  // Kayip Zaman Analizi sekmesi: yalnizca admin'e
  const navKayipAdmin = document.getElementById('nav-kayip-zaman-admin');
  if (navKayipAdmin) {
    navKayipAdmin.style.display = (!currentUser || currentUser.isAdmin) ? '' : 'none';
  }

  // "Temizle" butonu sadece admin tarafından görülebilir
  const temizleBtn = document.getElementById('btn-temizle');
  if (temizleBtn) temizleBtn.style.display = (!currentUser || currentUser.isAdmin) ? '' : 'none';
}

// Geriye dönük uyumluluk: bazı eski nav öğeleri requirePassword çağırabilir.
function requirePassword(navEl) {
  showPage('klasmanlar', navEl);
}

function closePwModal() {
  // Giriş ekranı her zaman zorunludur, modal kapatılamaz.
}

async function checkPassword() {
  const usernameEl = document.getElementById('pw-username');
  const userVal = usernameEl ? usernameEl.value.trim() : '';
  const val   = document.getElementById('pw-input').value.trim();
  const errEl = document.getElementById('pw-err');
  const btnEl = document.querySelector('.pw-btn');
  const dotEl   = document.getElementById('pw-dot');
  const labelEl = document.getElementById('pw-server-label');

  if (!val) { errEl.textContent = '❌ Şifre boş olamaz'; return; }

  // Buton kilitle
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = (translations[currentLang]||translations.tr).verifying; }
  errEl.textContent = '';
  if (dotEl)   dotEl.style.background = 'var(--amber)';
  if (labelEl) labelEl.textContent = (translations[currentLang]||translations.tr).connecting;

  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;

  function _unlock(user) {
    currentUser = user;
    try { localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser)); } catch(e) {}
    klasmanUnlocked = true;
    sessionStorage.setItem(SESSION_KEY, '1');
    try {
      const rem = document.getElementById('pw-remember');
      if (rem && rem.checked) localStorage.setItem('lc_remembered_creds', JSON.stringify({ username: userVal, password: val }));
      else localStorage.removeItem('lc_remembered_creds');
    } catch(e) {}
    if (dotEl)   dotEl.style.background = 'var(--green)';
    if (labelEl) labelEl.textContent = (translations[currentLang]||translations.tr).verified;
    const shell = document.getElementById('app-shell');
    if (shell) shell.style.display = 'block';
    document.getElementById('pw-overlay').style.display = 'none';
    applyUserPermissions();
    setTimeout(() => autoFetchOnStartup(), 300);
    pendingNavEl = null;
  }

  function _fail(msg) {
    errEl.textContent = msg;
    if (dotEl)   dotEl.style.background = 'var(--red)';
    if (labelEl) labelEl.textContent = (translations[currentLang]||translations.tr).error_label;
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = (translations[currentLang]||translations.tr).login_btn; }
  }

  // ── Kullanıcı adı girildiyse (admin dışı) → normal kullanıcı girişi ──
  if (userVal && userVal.toLowerCase() !== 'admin') {
    if (SHEETS_DEVRE_DISI) {
      _fail('⚠️ Ekip yöneticisi girişi şu anda kullanılamıyor (Google Sheets bağlantısı kapatıldı). Lütfen admin olarak giriş yapın.');
      return;
    }
    if (!url || !token) {
      _fail('⚠️ Sunucu bağlantısı yapılandırılmamış.');
      return;
    }
    try {
      const data = await jsonpFetch(url, { action: 'login', token, username: userVal, password: val });
      if (data.status === 'ok' && data.user) {
        _unlock({ username: data.user.username, isAdmin: false, tabs: data.user.tabs || [], team: data.user.team || [] });
        return;
      }
      _fail((translations[currentLang]||translations.tr).pw_wrong);
      document.getElementById('pw-input').value = '';
      document.getElementById('pw-input').focus();
      return;
    } catch(e) {
      _fail((translations[currentLang]||translations.tr).pw_unreachable);
      return;
    }
  }

  // ── Admin girişi (tek admin şifresi) ──
  const adminUser = { username: 'admin', isAdmin: true, tabs: 'all' };

  // SHEETS_DEVRE_DISI şu an "false" olduğu için bu blok ÇALIŞMIYOR (aşağıdaki
  // gerçek PHP tabanlı akış kullanılıyor) — geçmiş bir aşamanın izi olarak
  // duruyor, silinmedi.
  if (SHEETS_DEVRE_DISI) {
    if (val === appConfig.password) { _unlock(adminUser); return; }
    _fail((translations[currentLang]||translations.tr).pw_wrong);
    document.getElementById('pw-input').value = '';
    document.getElementById('pw-input').focus();
    return;
  }

  // ── 1. Sheets'ten şifreyi çekmeye çalış (20s timeout) ──
  if (url && token) {
    try {
      const data = await jsonpFetch(url, { action: 'getConfig', token });
      if (data.status === 'ok' && data.config && data.config.password) {
        const sheetsPassword = data.config.password;
        // Cache'e yaz
        appConfig.password = sheetsPassword;
        localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(appConfig));
        if (val === sheetsPassword) { _unlock(adminUser); return; }
        else { _fail((translations[currentLang]||translations.tr).pw_wrong); document.getElementById('pw-input').value=''; document.getElementById('pw-input').focus(); return; }
      }
      // Sheets'te şifre yok ama bağlantı kuruldu
      if (dotEl) dotEl.style.background = 'var(--amber)';
      if (labelEl) labelEl.textContent = (translations[currentLang]||translations.tr).pw_no_sheets_pw;
    } catch(e) {
      // Zaman aşımı veya bağlantı hatası
      console.warn('Sheets bağlantı hatası:', e.message);
      if (dotEl)   dotEl.style.background = 'var(--amber)';
      if (labelEl) labelEl.textContent = (translations[currentLang]||translations.tr).pw_unreachable;
    }
  }

  // ── 2. Sheets'e ulaşılamazsa cache'deki şifreyi kullan ──
  const cachedPw = appConfig.password;
  if (cachedPw && val === cachedPw) {
    if (labelEl) labelEl.textContent = (translations[currentLang]||translations.tr).pw_offline;
    _unlock(adminUser);
    return;
  }

  // ── 3. Her iki yöntem de başarısız ──
  if (!cachedPw) {
    _fail((translations[currentLang]||translations.tr).pw_no_server_cache);
  } else {
    _fail((translations[currentLang]||translations.tr).pw_wrong);
    document.getElementById('pw-input').value = '';
    document.getElementById('pw-input').focus();
  }
}

async function _firstRunSync() {
  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token) { hideStartupBanner(); return; }

  showStartupBanner('📥 Sheets\'ten klasmanlar çekiliyor...');

  try {
    const data = await jsonpFetch(url, { action: 'getKlasmanlar', token });
    if (data.status === 'error') throw new Error(data.message || 'Sunucu hata döndürdü');

    if (data.status === 'ok' && Array.isArray(data.klasmanlar) && data.klasmanlar.length > 0) {
      klasmanlar = data.klasmanlar;
      nextId = Math.max(1, ...klasmanlar.map(k => k.id || 0)) + 1;
      saveData();
      renderListe();
      renderEditor();
      updateSidebar();
      updateKlasmanFilter();
      renderDashboard();
      showStartupBanner(`✅ ${klasmanlar.length} klasman senkronize edildi!`, 'success');
    } else {
      showStartupBanner('ℹ️ Sheets\'te henüz klasman verisi yok', 'info');
      setTimeout(hideStartupBanner, 3000);
    }
  } catch(e) {
    console.warn('_firstRunSync hata:', e.message);
    showStartupBanner('⚠️ Senkronizasyon hatası: ' + e.message, 'error');
    setTimeout(hideStartupBanner, 5000);
  }
}

function changePwPrompt() {
  const current = prompt('Mevcut şifreyi girin:');
  if (current !== appConfig.password) { alert('Yanlış şifre!'); return; }
  const newPw = prompt('Yeni şifreyi girin:');
  if (!newPw || newPw.length < 4) { alert('Şifre en az 4 karakter olmalı!'); return; }
  const confirm = prompt('Yeni şifreyi tekrar girin:');
  if (newPw !== confirm) { alert('Şifreler eşleşmiyor!'); return; }
  appConfig.password = newPw;
  localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(appConfig));
  // Sheets Config sekmesine de gönder
  pushConfigToSheets().then(() => {
    alert('✅ Şifre değiştirildi ve Sheets\'e senkronize edildi!');
  }).catch(() => {
    alert('✅ Şifre değiştirildi! (Sheets senkronizasyonu başarısız oldu)');
  });
}

// Giriş yapmış olan kullanıcı kendi şifresini değiştirir.
// Admin için ortak admin şifresi (changePwPrompt), normal kullanıcı için
// kendi Users sekmesindeki şifresi güncellenir.
function changeMyPasswordPrompt() {
  if (!currentUser || currentUser.isAdmin) { changePwPrompt(); return; }
  if (SHEETS_DEVRE_DISI) { alert('⚠️ Ekip yöneticisi şifre değişikliği şu anda kullanılamıyor (Google Sheets bağlantısı kapatıldı).'); return; }

  const current = prompt('Mevcut şifrenizi girin:');
  if (!current) return;
  const newPw = prompt('Yeni şifrenizi girin:');
  if (!newPw || newPw.length < 4) { alert('Şifre en az 4 karakter olmalı!'); return; }
  const conf = prompt('Yeni şifreyi tekrar girin:');
  if (newPw !== conf) { alert('Şifreler eşleşmiyor!'); return; }

  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token) { alert('⚠️ Sunucu bağlantısı yapılandırılmamış.'); return; }

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      action: 'changeUserPassword',
      token: token,
      username: currentUser.username,
      oldPassword: current,
      newPassword: newPw
    }),
    mode: 'no-cors'
  }).then(() => {
    // Hatırlanan giriş bilgisi varsa güncelle
    try {
      const rem = JSON.parse(localStorage.getItem('lc_remembered_creds') || 'null');
      if (rem && rem.username && rem.username.toLowerCase() === currentUser.username.toLowerCase()) {
        localStorage.setItem('lc_remembered_creds', JSON.stringify({ username: rem.username, password: newPw }));
      }
    } catch(e) {}
    alert('✅ Şifre değişiklik isteği gönderildi. Eğer mevcut şifreniz doğruysa şifreniz güncellendi.');
  }).catch(() => {
    alert('❌ İşlem başarısız. İnternet bağlantınızı kontrol edin.');
  });
}

// ────────────────────────────
// GOOGLE SHEETS ENTEGRASYONU
// ────────────────────────────
async function pushToSheets() {
  if (SHEETS_DEVRE_DISI) { alert('⚠️ Google Sheets bağlantısı devre dışı bırakıldı — klasmanlar sadece yerelde (tarayıcınızda) kaydediliyor.'); return; }
  const url = appConfig.sheetsWebAppUrl;
  if (!url) {
    alert('⚠️ Önce Google Apps Script Web App URL\'ini girin!\n\nKlasman Yönetimi → Bağlantı Ayarları bölümüne URL yapıştırın.');
    return;
  }
  const token = appConfig.sheetsApiToken;
  if (!token) {
    alert('⚠️ API Token girilmemiş!\n\nBağlantı Ayarları → API Token alanını doldurun.\nApps Script dosyasındaki API_TOKEN değeriyle aynı olmalı.');
    return;
  }
  const btn = event?.target;
  const origText = btn?.textContent || '';
  if (btn) { btn.textContent = (translations[currentLang]||translations.tr).sending; btn.disabled = true; }
  try {
    const payload = {
      action: 'setKlasmanlar',
      token: token,
      klasmanlar: klasmanlar,
      savedAt: new Date().toISOString()
    };
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
      mode: 'no-cors'
    });
 

function renderKlasmanAnaliz() {
  const el = document.getElementById('klasman-analiz-icerik');
  if (!el) return;

  if (!performansData || !performansData.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🎯</div><h3>${(translations[currentLang]||translations.tr).no_data_js}</h3><p>${(translations[currentLang]||translations.tr).no_data_js_hint}</p></div>';
    return;
  }

  const klasmanMap = {};
  performansData.forEach(inspector => {
    Object.entries(inspector.klasmanlar || {}).forEach(([klasmanAd, kd]) => {
      if (!klasmanMap[klasmanAd]) {
        klasmanMap[klasmanAd] = {
          ad: klasmanAd,
          toplamAdet: 0,
          toplamFiiliSure: 0,
          toplamStandartSure: 0,
          inspectorSayisi: 0,
          standartKontrolSure: null,
          istasyonSure: null,
          kayitSayisi: 0,
          adetListesi: []
        };
      }
      klasmanMap[klasmanAd].toplamAdet        += kd.adet || 0;
      klasmanMap[klasmanAd].toplamFiiliSure   += kd.kayitFiiliSure || 0;
      klasmanMap[klasmanAd].toplamStandartSure += kd.standartSure || 0;
      klasmanMap[klasmanAd].inspectorSayisi   += 1;
      (kd.kayitlar || []).forEach(r => {
        klasmanMap[klasmanAd].kayitSayisi += 1;
        if (r.adet) klasmanMap[klasmanAd].adetListesi.push(r.adet);
      });
    });
  });

  klasmanlar.forEach(k => {
    if (klasmanMap[k.ad]) {
      klasmanMap[k.ad].standartKontrolSure = parseFloat(k.urunKontrolSuresi) || 0;
      klasmanMap[k.ad].istasyonSure = k.istasyonlar.reduce((s, i) => s + (parseFloat(i.sure) || 0), 0);
      klasmanMap[k.ad].olcuSuresi = parseFloat(k.olcuSuresi) || 0;
      klasmanMap[k.ad].urunKabulSuresi = parseFloat(k.urunKabulSuresi) || 0;
    }
  });

  const liste = Object.values(klasmanMap)
    .filter(k => k.toplamAdet > 0)
    .sort((a, b) => b.toplamAdet - a.toplamAdet);

  if (!liste.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🔍</div><h3>${(translations[currentLang]||translations.tr).data_not_found}</h3></div>';
    return;
  }

  const kartlar = liste.map(k => {
    const standart = k.toplamAdet > 0 && k.toplamStandartSure > 0
  ? k.toplamStandartSure / k.toplamAdet
  : (k.standartKontrolSure || 0);
    const istasyon       = k.istasyonSure || 0;
    const gerceklesenOrt = k.toplamAdet > 0 && k.toplamFiiliSure > 0
      ? k.toplamFiiliSure / k.toplamAdet : null;
    const fark = gerceklesenOrt !== null && standart > 0
      ? gerceklesenOrt - standart : null;
    const yuzdeFark = fark !== null && standart > 0
      ? Math.round((fark / standart) * 100) : null;
    const barGenislik = gerceklesenOrt !== null && standart > 0
      ? Math.min(200, Math.round((gerceklesenOrt / standart) * 100)) : 0;
    const barRenk = fark === null ? 'var(--muted2)'
      : fark <= 0 ? '#00897B'
      : fark <= standart * 0.2 ? '#F57F17' : '#C62828';
    const farkIkon = standart === 0 ? '⚠️ Standart süre girilmemiş'
      : fark === null ? '—'
      : fark <= 0 ? '▼ Hedef Altında ✓' : '▲ Hedef Üstünde';

    return `
    <div style="background:#fff;border:1.5px solid var(--border2);border-radius:14px;padding:20px;box-shadow:var(--shadow);position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,${barRenk},${barRenk}88);border-radius:14px 14px 0 0;"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--navy);">${k.ad}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">${formatTR(k.toplamAdet)} adet · ${k.inspectorSayisi} inspector</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:22px;font-weight:800;color:${barRenk};font-family:'DM Mono',monospace;line-height:1;">${gerceklesenOrt !== null ? gerceklesenOrt.toFixed(2)+'sn' : '—'}</div>
          <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-top:2px;" data-i18n="actual_per_unit">Actual/Unit</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
        <div style="background:var(--lblue3);border:1px solid var(--border2);border-radius:10px;padding:12px 14px;">
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">📐 Standart</div>
          <div style="font-size:18px;font-weight:700;color:var(--navy);font-family:'DM Mono',monospace;">${standart > 0 ? standart.toFixed(2)+'sn' : '—'}</div>
          <div style="font-size:10px;color:var(--muted2);margin-top:3px;" data-i18n="one_unit_check">1 unit inspection</div>
          ${istasyon > 0 ? `<div style="font-size:10px;color:var(--muted2);margin-top:1px;">+ ${istasyon.toFixed(2)}sn istasyon</div>` : ''}
        </div>
        <div style="background:${fark!==null&&fark<=0?'var(--lgreen)':standart===0?'var(--lamber)':'var(--lred)'};border:1px solid ${fark!==null&&fark<=0?'#B2DFDB':standart===0?'#FFE082':'#FFCDD2'};border-radius:10px;padding:12px 14px;">
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;" data-i18n="actual_label">⏱ Actual</div>
          <div style="font-size:18px;font-weight:700;color:${barRenk};font-family:'DM Mono',monospace;">${gerceklesenOrt !== null ? gerceklesenOrt.toFixed(2)+'sn' : '—'}</div>
          <div style="font-size:10px;color:${barRenk};margin-top:3px;font-weight:600;">
            ${fark !== null ? (fark>0?'+':'')+fark.toFixed(2)+'sn fark' : 'Standart girilmemiş'}
            ${yuzdeFark !== null ? ` (${fark>0?'+':''}${yuzdeFark}%)` : ''}
          </div>
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-bottom:4px;">
          <span data-i18n="actual_vs_std">Actual / Standard ratio</span>
          <span style="font-weight:600;color:${barRenk}">${barGenislik}%</span>
        </div>
        <div style="height:8px;background:var(--border2);border-radius:4px;overflow:hidden;">
          <div style="width:${Math.min(100,barGenislik)}%;height:100%;background:${barRenk};border-radius:4px;"></div>
        </div>
      </div>
      <div style="text-align:center;padding:6px 12px;border-radius:8px;background:${fark!==null&&fark<=0?'var(--lgreen)':standart===0?'var(--lamber)':'var(--lred)'};border:1px solid ${fark!==null&&fark<=0?'#B2DFDB':standart===0?'#FFE082':'#FFCDD2'};">
        <span style="font-size:11px;font-weight:700;color:${barRenk};">${farkIkon}</span>
      </div>
    </div>`;
  }).join('');

  pushKlasmanAnalizToSheets(liste);

  el.innerHTML = `
    <div style="background:linear-gradient(135deg,var(--navy) 0%,var(--blue) 100%);border-radius:12px;padding:16px 22px;margin-bottom:20px;display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
      <div style="font-size:28px;">🎯</div>
      <div style="flex:1;">
        <div style="font-size:15px;font-weight:700;color:#fff;">${(translations[currentLang]||translations.tr).klasman_actual_analysis}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:3px;">${liste.length} ${(translations[currentLang]||translations.tr).klasman_word} · ${formatTR(liste.reduce((s,k)=>s+k.toplamAdet,0))} ${(translations[currentLang]||translations.tr).total_units_summary}</div>
      </div>
      ${[
        ['✅',(translations[currentLang]||translations.tr).on_target,  liste.filter(k=>{const g=k.toplamAdet>0&&k.toplamFiiliSure>0?k.toplamFiiliSure/k.toplamAdet:null;return g!==null&&k.standartKontrolSure>0&&g<=k.standartKontrolSure;}).length,'#4CAF50'],
        ['⚠️',(translations[currentLang]||translations.tr).near_target, liste.filter(k=>{const g=k.toplamAdet>0&&k.toplamFiiliSure>0?k.toplamFiiliSure/k.toplamAdet:null;const s=k.standartKontrolSure;return g!==null&&s>0&&g>s&&g<=s*1.2;}).length,'#FFB74D'],
        ['🔴',(translations[currentLang]||translations.tr).high_label,  liste.filter(k=>{const g=k.toplamAdet>0&&k.toplamFiiliSure>0?k.toplamFiiliSure/k.toplamAdet:null;const s=k.standartKontrolSure;return g!==null&&s>0&&g>s*1.2;}).length,'#EF9A9A'],
        ['➖',(translations[currentLang]||translations.tr).no_std,       liste.filter(k=>!k.standartKontrolSure||k.standartKontrolSure===0).length,'rgba(255,255,255,.5)']
      ].map(([ic,lb,cnt,col])=>`
        <div style="text-align:center;background:rgba(255,255,255,.1);border-radius:10px;padding:10px 16px;min-width:80px;">
          <div style="font-size:16px;">${ic}</div>
          <div style="font-size:20px;font-weight:800;color:${col};font-family:'DM Mono',monospace;line-height:1.2;">${cnt}</div>
          <div style="font-size:9px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.5px;">${lb}</div>
        </div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
      ${kartlar}
    </div>
  `;
}
showSuccessMessage('✅ ' + klasmanlar.length + ' ' + (translations[currentLang]||translations.tr).sheets_sent_klasman);
  } catch(err) {
    alert('❌ Gönderme hatası: ' + err.message);
  } finally {
    if (btn) { btn.textContent = origText; btn.disabled = false; }
  }
}

// ── KLASMAN ANALİZ STATE ──
let _klAnalizPage = 1;
const _KL_ANALIZ_PER_PAGE = 12;
let _klAnalizFiltre = '';
let _klAnalizSiralama = 'adet-desc';
let _klAnalizTumListe = [];

function _klAnalizUygula() {
  _klAnalizPage = 1;
  const el = document.getElementById('klasman-analiz-icerik');
  if (el) _renderKlAnalizUI(el);
}

function _klAnalizGoTo(p) {
  _klAnalizPage = p;
  const el = document.getElementById('klasman-analiz-icerik');
  if (el) _renderKlAnalizUI(el);
}

function renderKlasmanAnaliz() {
  const el = document.getElementById('klasman-analiz-icerik');
  if (!el) return;

  if (!performansData || !performansData.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🎯</div><h3>${(translations[currentLang]||translations.tr).no_data_js}</h3><p>${(translations[currentLang]||translations.tr).no_data_js_hint}</p></div>';
    return;
  }

  const klasmanMap = {};
  performansData.forEach(inspector => {
    Object.entries(inspector.klasmanlar || {}).forEach(([klasmanAd, kd]) => {
      if (!klasmanMap[klasmanAd]) {
        klasmanMap[klasmanAd] = {
          ad: klasmanAd, toplamAdet: 0, toplamFiiliSure: 0,
          toplamStandartSure: 0, inspectorSayisi: 0,
          standartKontrolSure: null, istasyonSure: null,
          kayitSayisi: 0, adetListesi: []
        };
      }
      klasmanMap[klasmanAd].toplamAdet         += kd.adet || 0;
      klasmanMap[klasmanAd].toplamFiiliSure    += kd.kayitFiiliSure || 0;
      klasmanMap[klasmanAd].toplamStandartSure += kd.standartSure || 0;
      klasmanMap[klasmanAd].inspectorSayisi    += 1;
      (kd.kayitlar || []).forEach(r => {
        klasmanMap[klasmanAd].kayitSayisi += 1;
        if (r.adet) klasmanMap[klasmanAd].adetListesi.push(r.adet);
      });
    });
  });

  klasmanlar.forEach(k => {
    if (klasmanMap[k.ad]) {
      klasmanMap[k.ad].standartKontrolSure = parseFloat(k.urunKontrolSuresi) || 0;
      klasmanMap[k.ad].istasyonSure = k.istasyonlar.reduce((s, i) => s + (parseFloat(i.sure) || 0), 0);
      klasmanMap[k.ad].olcuSuresi = parseFloat(k.olcuSuresi) || 0;
      klasmanMap[k.ad].urunKabulSuresi = parseFloat(k.urunKabulSuresi) || 0;
    }
  });

  _klAnalizTumListe = Object.values(klasmanMap)
    .filter(k => k.toplamAdet > 0)
    .sort((a, b) => b.toplamAdet - a.toplamAdet);

  if (!_klAnalizTumListe.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🔍</div><h3>${(translations[currentLang]||translations.tr).data_not_found}</h3></div>';
    return;
  }

  pushKlasmanAnalizToSheets(_klAnalizTumListe);
  _klAnalizPage = 1;
  _klAnalizFiltre = '';
  _klAnalizSiralama = 'adet-desc';
  _renderKlAnalizUI(el);
}

function _klAnalizFiltrele() {
  let liste = [..._klAnalizTumListe];

  // DÜZELTME: durum filtresi ve "fark" sıralaması artık adet-başı ortalama
  // yerine TOPLAM oran (toplamFiiliSure / toplamStandartSure) kullanır —
  // bkz. _renderKlAnalizUI içindeki açıklama.
  const oranHesapla = k => (k.toplamStandartSure > 0 && k.toplamFiiliSure > 0)
    ? k.toplamFiiliSure / k.toplamStandartSure : null;

  if (_klAnalizFiltre.trim()) {
    const q = _klAnalizFiltre.trim().toLowerCase();
    liste = liste.filter(k => k.ad.toLowerCase().includes(q));
  }

  const durumFiltre = document.getElementById('kla-durum-filtre')?.value || '';
  if (durumFiltre === 'hedefte') {
    liste = liste.filter(k => {
      const o = oranHesapla(k);
      return o !== null && k.toplamStandartSure > 0 && o <= 1;
    });
  } else if (durumFiltre === 'yakin') {
    liste = liste.filter(k => {
      const o = oranHesapla(k);
      return o !== null && k.toplamStandartSure > 0 && o > 1 && o <= 1.2;
    });
  } else if (durumFiltre === 'yuksek') {
    liste = liste.filter(k => {
      const o = oranHesapla(k);
      return o !== null && k.toplamStandartSure > 0 && o > 1.2;
    });
  } else if (durumFiltre === 'stdyok') {
    liste = liste.filter(k => !k.toplamStandartSure || k.toplamStandartSure === 0);
  }

  switch (_klAnalizSiralama) {
    case 'adet-desc':  liste.sort((a, b) => b.toplamAdet - a.toplamAdet); break;
    case 'adet-asc':   liste.sort((a, b) => a.toplamAdet - b.toplamAdet); break;
    case 'ad-asc':     liste.sort((a, b) => a.ad.localeCompare(b.ad, 'tr')); break;
    case 'ad-desc':    liste.sort((a, b) => b.ad.localeCompare(a.ad, 'tr')); break;
    case 'fark-desc':  liste.sort((a, b) => {
      const oa = oranHesapla(a); const ob = oranHesapla(b);
      const ga = oa !== null ? oa : -Infinity;
      const gb = ob !== null ? ob : -Infinity;
      return gb - ga;
    }); break;
    case 'fark-asc':   liste.sort((a, b) => {
      const oa = oranHesapla(a); const ob = oranHesapla(b);
      const ga = oa !== null ? oa : Infinity;
      const gb = ob !== null ? ob : Infinity;
      return ga - gb;
    }); break;
  }

  return liste;
}

function _renderKlAnalizUI(el) {
  const tumListe   = _klAnalizFiltrele();
  const totalPages = Math.max(1, Math.ceil(tumListe.length / _KL_ANALIZ_PER_PAGE));
  if (_klAnalizPage > totalPages) _klAnalizPage = totalPages;
  if (_klAnalizPage < 1) _klAnalizPage = 1;

  const startIdx   = (_klAnalizPage - 1) * _KL_ANALIZ_PER_PAGE;
  const sayfaListe = tumListe.slice(startIdx, startIdx + _KL_ANALIZ_PER_PAGE);
  const orijinal   = _klAnalizTumListe;

  // DÜZELTME: "adet başına ortalama" yerine TOPLAM baz kullanılıyor.
  // Sebep: Ölçü Süresi ve Ürün Kabul Süresi parti başına sabit/yarı-sabit
  // maliyetlerdir. Bunları toplam standart süreye dahil edip adede bölmek,
  // küçük partilerde oranı yapay şişirir, büyük partilerde yapay düşürür.
  // toplamFiiliSure / toplamStandartSure oranı bu çarpıtmadan etkilenmez.
  const oranHesaplaKlasman = k => (k.toplamStandartSure > 0 && k.toplamFiiliSure > 0)
    ? k.toplamFiiliSure / k.toplamStandartSure
    : null;

  const hedefte = orijinal.filter(k => { const o = oranHesaplaKlasman(k); return o !== null && k.toplamStandartSure > 0 && o <= 1; }).length;
  const yakin   = orijinal.filter(k => { const o = oranHesaplaKlasman(k); return o !== null && k.toplamStandartSure > 0 && o > 1 && o <= 1.2; }).length;
  const yuksek  = orijinal.filter(k => { const o = oranHesaplaKlasman(k); return o !== null && k.toplamStandartSure > 0 && o > 1.2; }).length;
  const stdYok  = orijinal.filter(k => !k.toplamStandartSure || k.toplamStandartSure === 0).length;

  const kartlar = sayfaListe.map((k, idxOnPage) => {
    // "Standart" ve "Gerçekleşen" (adet başına, sn) — sadece GÖRSEL REFERANS.
    // Bunlar parti büyüklük karışımından etkilenebilir; bu yüzden durum/renk/yüzde
    // hesaplamasında KULLANILMAZ, sadece kart üstünde bilgi amaçlı gösterilir.
    const standart = k.toplamAdet > 0 && k.toplamStandartSure > 0
  ? k.toplamStandartSure / k.toplamAdet
  : (k.standartKontrolSure || 0);
    const istasyon       = k.istasyonSure || 0;
    const gerceklesenOrt = k.toplamAdet > 0 && k.toplamFiiliSure > 0 ? k.toplamFiiliSure / k.toplamAdet : null;

    // DÜZELTME: Asıl performans değerlendirmesi TOPLAM baz üzerinden yapılır.
    // oranToplam = toplamFiiliSure / toplamStandartSure (1.0 = tam hedefte)
    const oranToplam = (k.toplamStandartSure > 0 && k.toplamFiiliSure > 0)
      ? k.toplamFiiliSure / k.toplamStandartSure : null;
    const yuzdeFark   = oranToplam !== null ? Math.round((oranToplam - 1) * 100) : null;
    const farkSnGorsel = (gerceklesenOrt !== null && standart > 0) ? gerceklesenOrt - standart : null;
    const barGenislik = oranToplam !== null ? Math.min(200, Math.round(oranToplam * 100)) : 0;
    const barRenk     = oranToplam === null ? 'var(--muted2)'
      : oranToplam <= 1 ? '#00897B'
      : oranToplam <= 1.2 ? '#F57F17' : '#C62828';
    const farkIkon    = k.toplamStandartSure === 0 ? '⚠️ Standart süre girilmemiş'
      : oranToplam === null ? '—'
      : oranToplam <= 1 ? '▼ Hedef Altında ✓' : '▲ Hedef Üstünde';

    // ── Hesaplama detayı (buton ile açılır) ──
    const adetListesi   = k.adetListesi || [];
    const minAdet       = adetListesi.length ? Math.min(...adetListesi) : null;
    const maxAdet        = adetListesi.length ? Math.max(...adetListesi) : null;
    const ortAdetParti  = adetListesi.length ? (adetListesi.reduce((s,a)=>s+a,0) / adetListesi.length) : null;
    const detayId = 'kl-detay-' + k.ad.replace(/[^a-zA-Z0-9]/g,'_') + '-' + idxOnPage;

    const detayHtml = `
      <div id="${detayId}" style="display:none;margin-top:10px;padding:14px;background:#F7FAFE;border:1px solid var(--border2);border-radius:10px;font-size:11.5px;color:var(--navy);line-height:1.7;">
        <div style="font-weight:700;margin-bottom:8px;font-size:12px;">🧮 Hesaplama Detayı — ${k.ad}</div>
        <div style="margin-bottom:6px;color:var(--muted2);">
          Bu klasmanda <b>${k.kayitSayisi || 0}</b> kayıt (parti) işlendi.
          ${minAdet !== null ? `Parti büyüklüğü ${minAdet} ile ${maxAdet} adet arasında değişiyor (ortalama ${ortAdetParti.toFixed(1)} adet).` : ''}
        </div>
        <div style="border-top:1px dashed var(--border2);margin:8px 0;"></div>
        <div style="margin-bottom:4px;"><b>1) Toplam Standart Süre</b> (her partinin kendi standart süresi toplamı):</div>
        <div style="margin-left:10px;color:var(--muted2);margin-bottom:6px;">
          = Σ [ (1 Birim Muayene Süresi × parti adedi) + Ölçü eki + Ürün Kabul eki + İstasyon süresi ]<br>
          = <b>${fmtSnKisa(k.toplamStandartSure)}</b> (${k.toplamStandartSure.toFixed(1)}sn)
        </div>
        <div style="margin-bottom:4px;"><b>2) Toplam Gerçekleşen Süre</b> (Excel'deki Başlangıç–Bitiş farklarının toplamı):</div>
        <div style="margin-left:10px;color:var(--muted2);margin-bottom:6px;">
          = <b>${fmtSnKisa(k.toplamFiiliSure)}</b> (${k.toplamFiiliSure.toFixed(1)}sn)
        </div>
        <div style="margin-bottom:4px;"><b>3) Performans Oranı</b> (yüzdeye çevrilmiş hâliyle kart üstündeki yüzde budur):</div>
        <div style="margin-left:10px;color:var(--muted2);margin-bottom:6px;">
          = Toplam Gerçekleşen ÷ Toplam Standart × 100<br>
          = ${k.toplamFiiliSure.toFixed(1)} ÷ ${k.toplamStandartSure.toFixed(1)} × 100 = <b style="color:${barRenk}">${oranToplam !== null ? Math.round(oranToplam*100)+'%' : '—'}</b>
        </div>
        <div style="border-top:1px dashed var(--border2);margin:8px 0;"></div>
        <div style="color:var(--muted2);font-size:10.5px;">
          ℹ️ Kartın üst kısmındaki "${standart>0?standart.toFixed(2):'—'}sn / ${gerceklesenOrt!==null?gerceklesenOrt.toFixed(2):'—'}sn" adet-başı değerleri yalnızca
          referans amaçlıdır — Ölçü ve Ürün Kabul süreleri parti başına sabit eklendiğinden, partilerin
          büyüklüğüne göre adet-başı ortalama yapay olarak değişebilir. Bu yüzden <b>Hedef Üstünde / Altında</b>
          durumu adet-başı değil, yukarıdaki TOPLAM oran üzerinden belirlenir.
        </div>
      </div>`;

    return `
    <div style="background:#fff;border:1.5px solid var(--border2);border-radius:14px;padding:20px;box-shadow:var(--shadow);position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,${barRenk},${barRenk}88);border-radius:14px 14px 0 0;"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--navy);">${k.ad}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">${formatTR(k.toplamAdet)} adet · ${k.inspectorSayisi} inspector</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:22px;font-weight:800;color:${barRenk};font-family:'DM Mono',monospace;line-height:1;">${oranToplam !== null ? Math.round(oranToplam*100)+'%' : '—'}</div>
          <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-top:2px;">Toplam Oran</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
        <div style="background:var(--lblue3);border:1px solid var(--border2);border-radius:10px;padding:12px 14px;">
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">📐 Standart (adet başı)</div>
          <div style="font-size:18px;font-weight:700;color:var(--navy);font-family:'DM Mono',monospace;">${standart > 0 ? standart.toFixed(2)+'sn' : '—'}</div>
          <div style="font-size:10px;color:var(--muted2);margin-top:3px;">1 adet ürün kontrol (ortalama)</div>
          ${istasyon > 0 ? `<div style="font-size:10px;color:var(--muted2);margin-top:1px;">+ ${istasyon.toFixed(2)}sn istasyon</div>` : ''}
        </div>
        <div style="background:${barRenk==='#00897B'?'var(--lgreen)':k.toplamStandartSure===0?'var(--lamber)':'var(--lred)'};border:1px solid ${barRenk==='#00897B'?'#B2DFDB':k.toplamStandartSure===0?'#FFE082':'#FFCDD2'};border-radius:10px;padding:12px 14px;">
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">⏱ Gerçekleşen (adet başı)</div>
          <div style="font-size:18px;font-weight:700;color:${barRenk};font-family:'DM Mono',monospace;">${gerceklesenOrt !== null ? gerceklesenOrt.toFixed(2)+'sn' : '—'}</div>
          <div style="font-size:10px;color:${barRenk};margin-top:3px;font-weight:600;">
            ${farkSnGorsel !== null ? (farkSnGorsel>0?'+':'')+farkSnGorsel.toFixed(2)+'sn fark' : 'Standart girilmemiş'}
            ${yuzdeFark !== null ? ` (${yuzdeFark>0?'+':''}${yuzdeFark}%)` : ''}
          </div>
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-bottom:4px;">
          <span>Toplam Gerçekleşen / Toplam Standart oranı</span>
          <span style="font-weight:600;color:${barRenk}">${barGenislik}%</span>
        </div>
        <div style="height:8px;background:var(--border2);border-radius:4px;overflow:hidden;">
          <div style="width:${Math.min(100,barGenislik)}%;height:100%;background:${barRenk};border-radius:4px;"></div>
        </div>
      </div>
      <div style="text-align:center;padding:6px 12px;border-radius:8px;background:${barRenk==='#00897B'?'var(--lgreen)':k.toplamStandartSure===0?'var(--lamber)':'var(--lred)'};border:1px solid ${barRenk==='#00897B'?'#B2DFDB':k.toplamStandartSure===0?'#FFE082':'#FFCDD2'};margin-bottom:8px;">
        <span style="font-size:11px;font-weight:700;color:${barRenk};">${farkIkon}</span>
      </div>
      <button onclick="document.getElementById('${detayId}').style.display = document.getElementById('${detayId}').style.display==='none' ? 'block' : 'none'; this.textContent = this.textContent.includes('Göster') ? '🧮 Hesaplamayı Gizle' : '🧮 Hesaplamayı Göster';"
        style="width:100%;padding:7px;border-radius:8px;border:1px solid var(--border2);background:#fff;color:var(--blue2);font-size:11px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">
        🧮 Hesaplamayı Göster
      </button>
      ${detayHtml}
    </div>`;
  }).join('');

  // Sayfalama butonları
  const pageBtns = (() => {
    let html = '';
    let pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages = [1];
      if (_klAnalizPage > 3) pages.push('...');
      for (let i = Math.max(2, _klAnalizPage - 1); i <= Math.min(totalPages - 1, _klAnalizPage + 1); i++) pages.push(i);
      if (_klAnalizPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    pages.forEach(p => {
      if (p === '...') {
        html += `<span style="padding:0 4px;color:var(--muted);line-height:32px;">…</span>`;
      } else {
        const active = p === _klAnalizPage;
        html += `<button onclick="_klAnalizGoTo(${p})"
          style="min-width:32px;height:32px;border-radius:7px;border:1px solid ${active?'var(--blue2)':'var(--border)'};
          background:${active?'var(--blue2)':'var(--white)'};color:${active?'#fff':'var(--navy)'};
          cursor:pointer;font-size:12px;font-weight:${active?'700':'500'};padding:0 8px;
          font-family:'DM Sans',sans-serif;transition:all .12s;">${p}</button>`;
      }
    });
    return html;
  })();

  const mevcut_filtre  = document.getElementById('kla-durum-filtre')?.value || '';
  const mevcut_siralama = _klAnalizSiralama;

  el.innerHTML = `
    <!-- ÖZET BAŞLIK -->
    <div style="background:linear-gradient(135deg,var(--navy) 0%,var(--blue) 100%);border-radius:12px;padding:16px 22px;margin-bottom:16px;display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
      <div style="font-size:28px;">🎯</div>
      <div style="flex:1;">
        <div style="font-size:15px;font-weight:700;color:#fff;">${(translations[currentLang]||translations.tr).klasman_actual_analysis}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:3px;">${orijinal.length} ${(translations[currentLang]||translations.tr).klasman_word} · ${formatTR(orijinal.reduce((s,k)=>s+k.toplamAdet,0))} ${(translations[currentLang]||translations.tr).total_units_summary}</div>
      </div>
      ${[
        ['✅',(translations[currentLang]||translations.tr).on_target,'hedefte',hedefte,'#4CAF50'],
        ['⚠️',(translations[currentLang]||translations.tr).near_target,'yakin',yakin,'#FFB74D'],
        ['🔴',(translations[currentLang]||translations.tr).high_label,'yuksek',yuksek,'#EF9A9A'],
        ['➖',(translations[currentLang]||translations.tr).no_std,'stdyok',stdYok,'rgba(255,255,255,.5)']
      ].map(([ic,lb,val,cnt,col])=>`
        <div onclick="document.getElementById('kla-durum-filtre').value='${val}';_klAnalizUygula()"
          style="text-align:center;background:rgba(255,255,255,.1);border-radius:10px;padding:10px 16px;min-width:80px;cursor:pointer;transition:background .15s;"
          onmouseover="this.style.background='rgba(255,255,255,.2)'" onmouseout="this.style.background='rgba(255,255,255,.1)'">
          <div style="font-size:16px;">${ic}</div>
          <div style="font-size:20px;font-weight:800;color:${col};font-family:'DM Mono',monospace;line-height:1.2;">${cnt}</div>
          <div style="font-size:9px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.5px;">${lb}</div>
        </div>`).join('')}
    </div>

    <!-- FİLTRE & ARAMA ÇUBUĞU -->
    <div style="background:var(--white);border:1px solid var(--border2);border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-shadow:var(--shadow);">
      <div style="position:relative;flex:1;min-width:180px;">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:13px;color:var(--muted2);">🔍</span>
        <input type="text" id="kla-arama" placeholder="${(translations[currentLang]||translations.tr).select_klasman}…" value="${_klAnalizFiltre}"
          oninput="_klAnalizFiltre=this.value;_klAnalizUygula()"
          style="width:100%;padding:8px 12px 8px 32px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:'DM Sans',sans-serif;">
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <label style="font-size:11px;color:var(--muted);white-space:nowrap;margin:0;">${(translations[currentLang]||translations.tr).filter_perf.replace(':','')}: </label>
        <select id="kla-durum-filtre" onchange="_klAnalizUygula()"
          style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:'DM Sans',sans-serif;background:var(--white);color:var(--navy);">
          <option value="" ${mevcut_filtre===''?'selected':''}>${(translations[currentLang]||translations.tr).filter_all}</option>
          <option value="hedefte" ${mevcut_filtre==='hedefte'?'selected':''}>✅ ${(translations[currentLang]||translations.tr).on_target}</option>
          <option value="yakin" ${mevcut_filtre==='yakin'?'selected':''}>${(translations[currentLang]||translations.tr).status_near}</option>
          <option value="yuksek" ${mevcut_filtre==='yuksek'?'selected':''}>${(translations[currentLang]||translations.tr).status_high}</option>
          <option value="stdyok" ${mevcut_filtre==='stdyok'?'selected':''}>➖ ${(translations[currentLang]||translations.tr).no_std}</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <label style="font-size:11px;color:var(--muted);white-space:nowrap;margin:0;">${(translations[currentLang]||translations.tr).sort_label}</label>
        <select onchange="_klAnalizSiralama=this.value;_klAnalizUygula()"
          style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:'DM Sans',sans-serif;background:var(--white);color:var(--navy);">
          <option value="adet-desc" ${mevcut_siralama==='adet-desc'?'selected':''}>${(translations[currentLang]||translations.tr).sort_qty_desc}</option>
          <option value="adet-asc"  ${mevcut_siralama==='adet-asc'?'selected':''}>${(translations[currentLang]||translations.tr).sort_qty_asc}</option>
          <option value="ad-asc"    ${mevcut_siralama==='ad-asc'?'selected':''}>${(translations[currentLang]||translations.tr).sort_name_asc}</option>
          <option value="ad-desc"   ${mevcut_siralama==='ad-desc'?'selected':''}>${(translations[currentLang]||translations.tr).sort_name_desc}</option>
          <option value="fark-desc" ${mevcut_siralama==='fark-desc'?'selected':''}>${(translations[currentLang]||translations.tr).sort_diff_worst}</option>
          <option value="fark-asc"  ${mevcut_siralama==='fark-asc'?'selected':''}>${(translations[currentLang]||translations.tr).sort_diff_best}</option>
        </select>
      </div>
      <button onclick="_klAnalizFiltre='';_klAnalizSiralama='adet-desc';document.getElementById('kla-durum-filtre').value='';_klAnalizUygula()"
        style="padding:7px 14px;border:1px solid var(--border);border-radius:8px;font-size:12px;background:var(--white);cursor:pointer;color:var(--muted);font-family:'DM Sans',sans-serif;transition:all .15s;"
        onmouseover="this.style.background='var(--lblue3)'" onmouseout="this.style.background='var(--white)'">${(translations[currentLang]||translations.tr).reset}</button>
      <span style="font-size:11px;color:var(--muted);font-family:'DM Mono',monospace;margin-left:auto;">
        ${tumListe.length} / ${orijinal.length} klasman · Sayfa ${_klAnalizPage}/${totalPages}
      </span>
    </div>

    <!-- KARTLAR -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin-bottom:20px;">
      ${kartlar || '<div style="grid-column:1/-1;padding:48px;text-align:center;color:var(--muted2);"><div style="font-size:32px;margin-bottom:12px;">🔍</div><h3 style="font-weight:500;color:var(--muted);" data-i18n="klasman_filter_empty">Filtreyle eşleşen klasman bulunamadı</h3></div>'}
    </div>

    <!-- SAYFALAMA -->
    ${totalPages > 1 ? `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-top:1px solid var(--border2);margin-top:4px;">
      <button onclick="_klAnalizGoTo(${_klAnalizPage - 1})" ${_klAnalizPage<=1?'disabled':''}
        style="padding:8px 16px;border:1px solid var(--border);border-radius:8px;font-size:13px;cursor:pointer;
        background:var(--white);color:var(--navy);font-family:'DM Sans',sans-serif;font-weight:500;
        opacity:${_klAnalizPage<=1?'.4':'1'};transition:all .15s;">‹ Önceki</button>
      <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:center;">
        ${pageBtns}
      </div>
      <button onclick="_klAnalizGoTo(${_klAnalizPage + 1})" ${_klAnalizPage>=totalPages?'disabled':''}
        style="padding:8px 16px;border:1px solid var(--border);border-radius:8px;font-size:13px;cursor:pointer;
        background:var(--white);color:var(--navy);font-family:'DM Sans',sans-serif;font-weight:500;
        opacity:${_klAnalizPage>=totalPages?'.4':'1'};transition:all .15s;">Sonraki ›</button>
    </div>` : ''}
  `;
}

async function pullFromSheets() {
  const url = appConfig.sheetsWebAppUrl;
  if (!url) {
    alert('⚠️ Önce Google Apps Script Web App URL\'ini girin!');
    return;
  }
  const token = appConfig.sheetsApiToken;
  if (!token) {
    alert('⚠️ API Token girilmemiş!\n\nBağlantı Ayarları → API Token alanını doldurun.');
    return;
  }
  const btn = event?.target;
  const origText = btn?.textContent || '';
  if (btn) { btn.textContent = (translations[currentLang]||translations.tr).pulling; btn.disabled = true; }

  // iframe/postMessage ile veri çek (v5.1 - GitHub Pages CORS çözümü)
  async function gsFetch(action, extraParams) {
    const params = { action, token, ...(extraParams || {}) };
    const data = await jsonpFetch(url, params);
    return data;
  }

  try {
    const data = await gsFetch('getKlasmanlar');

    if (data.status === 'error') {
      throw new Error(data.message || 'Sunucu hata döndürdü');
    }

    if (data && data.klasmanlar && Array.isArray(data.klasmanlar)) {
      const count = data.klasmanlar.length;
      const savedAt = data.savedAt ? new Date(data.savedAt).toLocaleString('tr-TR') : '—';
      if (!confirm(`📥 ${count} klasman bulundu.\nSon kayıt: ${savedAt}\n\nMevcut verilerin üzerine yazılsın mı?`)) return;
      klasmanlar = data.klasmanlar;
      nextId = Math.max(1, ...klasmanlar.map(k => k.id || 0)) + 1;
      secilenId = null;
      sayfa = 1;
      saveData();
      renderListe();
      renderEditor();
      updateSidebar();
      updateKlasmanFilter();   // dashboard klasman filtresi dropdown'ı güncelle

      // Performans verisini de Sheets'ten çek (sayfalandırmalı)
      try {
        const { performansData: pd } = await fetchPerformansRawPaginated(url, token);
        if (pd && pd.length > 0) {
          performansData = fixVerimlilikPerf(restorePerformansDateObjects(pd));
          saveData();
          console.log('✅ Performans verisi Sheets\'ten çekildi:', performansData.length, 'inspector');
        }
      } catch(perfErr) {
        console.warn('Performans çekme hatası (önemsiz):', perfErr.message);
      }

      renderDashboard(); renderQuarterBadge(performansData);       // inspector kartlarını performans verisiyle yeniden çiz
      showSuccessMessage(`✅ ${count} ` + (translations[currentLang]||translations.tr).sheets_updated_count);
    } else {
      alert('❌ Geçersiz veri formatı döndü.\nApps Script doğru yapılandırıldı mı?');
    }
  } catch(err) {
    alert('❌ Veri çekilemedi: ' + err.message + '\n\n🔧 Kontrol listesi:\n• Web App URL doğru mu?\n• API Token eşleşiyor mu?\n• "Erişimi olan: Herkes" seçili mi?\n• En son dağıtım versiyonu mu kullanılıyor?');
  } finally {
    if (btn) { btn.textContent = origText; btn.disabled = false; }
  }
}

// ─────────────────────────────────────────────
// PERFORMANS VERİSİNİ SHEETS'E GÖNDER
// Excel yüklendiğinde otomatik çağrılır
// ─────────────────────────────────────────────
async function pushPerformansToSheets(liste) {
  if (SHEETS_DEVRE_DISI) return;
  const url = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token) return; // Bağlantı ayarı yapılmamışsa sessizce çık

  try {
    // performansData'yı düz tablo formatına çevir (Sheets için okunabilir)
    const rows = liste.map(row => ({
      ins: row.ins,
      adet: row.adet,
      kayit: row.kayit,
      gunSayisi: row.gunSayisi || 0,
      standartSureDk: row.standartSure ? Math.round(row.standartSure / 60) : 0,
      mesaiSureDk: row.mesaiSure ? Math.round(row.mesaiSure / 60) : 0,
      genelHizPerf: row.genelHizPerf,
      verimlilikPerf: row.verimlilikPerf,
      klasmanOzet: Object.entries(row.klasmanlar || {})
        .map(([k,v]) => `${k}:${v.adet}adet(${v.hizPerf}%)`)
        .join(' | ')
    }));

    const payload = {
      action: 'setPerformans',
      token: token,
      performans: rows,
      savedAt: new Date().toISOString()
    };

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
      mode: 'no-cors'
    });

    console.log('✅ Performans verisi Sheets\'e gönderildi:', rows.length, 'inspector');
  } catch(err) {
    console.warn('Performans Sheets gönderme hatası:', err.message);
  }
}

// ─────────────────────────────────────────────
// PERFORMANS HAM VERİSİNİ SHEETS'E GÖNDER
// Tam JSON — farklı bilgisayarlardan çekilebilir
// ─────────────────────────────────────────────
async function pushPerformansRawToSheets(liste) {
  if (SHEETS_DEVRE_DISI) return;
  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  if (!url || !token) return;
  try {
    // kayitlar dizisi olmadan gönder — boyut sınırını aşmamak için
    // (kayitlar ayrıca setInspectorKayitlar ile gönderilir)
    // YENİ
const _pushHedef = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);
const _pushOrneklemeMod = document.querySelector('input[name="ornekleme-mod"]:checked')?.value || 'kapali';
const _pushOrneklemeTarihliAktif = document.getElementById('ornekleme-tarihli-aktif')?.checked || false;
const listeTemiz = liste.map(inspector => {
  const klasmanlarTemiz = {};
  Object.entries(inspector.klasmanlar || {}).forEach(([k, v]) => {
    klasmanlarTemiz[k] = {
      adet: v.adet, standartSure: v.standartSure,
      kayitFiiliSure: v.kayitFiiliSure, hizPerf: v.hizPerf, hacimPerf: v.hacimPerf
    };
  });
  return {
    ...inspector,
    klasmanlar: klasmanlarTemiz,
    toplamMesaistiSaniye: inspector.toplamMesaistiSaniye || 0,
    gunlukOvertimeDetay: inspector.gunlukOvertimeDetay || {},
    hedefVerimlilik: _pushHedef,
    verimlilikPerf: inspector.genelHizPerf != null ? Math.round(inspector.genelHizPerf * (100 / _pushHedef)) : inspector.verimlilikPerf,
    orneklemeMod: _pushOrneklemeMod,
    orneklemeTarihliAktif: _pushOrneklemeTarihliAktif,
    orneklemeDonemleri: _pushOrneklemeTarihliAktif ? orneklemeDonemleri : []
  };
});

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'setPerformansRaw',
        token: token,
        performansData: listeTemiz,
        savedAt: new Date().toISOString()
      }),
      mode: 'no-cors'
    });
    console.log('✅ Ham performans verisi Sheets\'e gönderildi:', liste.length, 'inspector');

    // Her inspector'ın kayitlar verisini ayrı sekmeye gönder
    await pushInspectorKayitlarToSheets(liste, url, token);

  } catch(err) {
    console.warn('Ham performans push hatası:', err.message);
  }
}

// ─────────────────────────────────────────────
// HER INSPECTOR'IN KAYITLARINI AYRI SEKMEYE GÖNDER
// Google Sheets > InspectorKayitlar sekmesi (v5.3)
// ─────────────────────────────────────────────
async function pushInspectorKayitlarToSheets(liste, url, token) {
  if (SHEETS_DEVRE_DISI) return;
  if (!url || !token || !liste || !liste.length) return;
  let gonderilen = 0;
  for (const inspector of liste) {
    // Temizle butonuna basıldıysa yüklemeyi tamamen durdur
    if (window._uploadAborted) {
      console.warn('⛔ Yükleme Temizle ile durduruldu:', gonderilen, '/', liste.length, 'inspector gönderildi');
      break;
    }
    try {
      const kayitlar = {};
      Object.entries(inspector.klasmanlar || {}).forEach(([k, v]) => {
        if (Array.isArray(v.kayitlar) && v.kayitlar.length > 0) {
          kayitlar[k] = v.kayitlar.map(r => ({
            adet: r.adet,
            talepNo: r.talepNo || '',
            kontrolAdetSuresi: r.kontrolAdetSuresi,
            istasyonSuresi: r.istasyonSuresi,
            standartSure: r.standartSure,
            kayitFiiliSure: r.kayitFiiliSure,
            baslangic: r.baslangic ? (r.baslangic instanceof Date ? r.baslangic.toISOString() : r.baslangic) : null,
            bitis: r.bitis ? (r.bitis instanceof Date ? r.bitis.toISOString() : r.bitis) : null,
            tarihGecerli: r.tarihGecerli || false,
            inspectionTipi: r.inspectionTipi || '',
            is2Kalite: r.is2Kalite || false
          }));
        }
      });

      // Kayıt yoksa bu inspector'ı atla — gereksiz istek gönderme
      if (Object.keys(kayitlar).length === 0) continue;

      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'setInspectorKayitlar',
          token: token,
          inspectorAdi: inspector.ins,
          kayitlar: kayitlar
        }),
        mode: 'no-cors'
      });

      gonderilen++;

      // Google Apps Script rate limit aşımını önlemek için 300ms bekle
      await new Promise(r => setTimeout(r, 300));

    } catch(err) {
      console.warn('Inspector kayıt push hatası (' + inspector.ins + '):', err.message);
    }
  }
  console.log('✅ Inspector kayıtları Sheets\'e gönderildi:', gonderilen, '/', liste.length, 'inspector');
}
// ─────────────────────────────────────────────
// PERFORMANS VERİSİNİ SHEETS'TEN ÇEK
// Dashboard "📥 Sheets'ten Çek" butonu + otomatik açılış
// ─────────────────────────────────────────────
// ── Sayfalandırmalı Performans Veri Çekici ──────────────────────────────────
// Büyük veri setlerinde Google Apps Script'in ~450KB HTML yanıt sınırı aşılır
// ve "Unterminated string in JSON" hatası oluşur.  Bu yardımcı fonksiyon
// veriyi page/pageSize ile parça parça çekip birleştirir.
async function fetchPerformansRawPaginated(url, token, onProgress) {
  const PAGE_SIZE = 20;
  // 1. Toplam kayıt sayısını al (hafif istek)
  const countResp = await jsonpFetch(url, { action: 'getPerformansRaw', token, countOnly: 'true' });
  if (!countResp || countResp.status !== 'ok') {
    throw new Error(countResp?.message || 'countOnly isteği başarısız');
  }
  const totalCount = countResp.totalCount || 0;
  const totalPages = countResp.totalPages || Math.ceil(totalCount / PAGE_SIZE) || 1;
  if (totalCount === 0) return { performansData: [], savedAt: null, totalCount: 0 };

  let allData = [];
  let savedAt = countResp.savedAt || null;
  for (let page = 0; page < totalPages; page++) {
    if (onProgress) onProgress(page + 1, totalPages);
    const resp = await jsonpFetch(url, {
      action: 'getPerformansRaw', token,
      page: String(page), pageSize: String(PAGE_SIZE)
    });
    if (resp?.status === 'ok' && Array.isArray(resp.performansData)) {
      allData = allData.concat(resp.performansData);
      if (!savedAt && resp.savedAt) savedAt = resp.savedAt;
    } else {
      console.warn(`⚠️ Sayfa ${page}/${totalPages} hatası:`, resp?.message || 'bilinmiyor');
    }
  }
  return { performansData: allData, savedAt, totalCount };
}

// ── PHP/MySQL üzerinden Performans Verisi Çek (YENİ — kademeli backend geçişi) ──
// fetchPerformansRawPaginated() ile TAM OLARAK AYNI dönüş sözleşmesini kullanır
// ({performansData, savedAt, totalCount}); tek fark gerçek fetch()+CORS ile
// çalışması — iframe/JSONP/Apps Script'e hiç ihtiyaç duymaz. api.php bu iki
// action'ı destekler: getPerformansRaw (GET, sayfalı) ve setPerformansRaw
// (POST, Apps Script'in ilettiği veriyi kaydetmek için).
async function fetchPerformansRawPaginatedPhp(apiUrl, token, onProgress) {
  const PAGE_SIZE = 20;
  const countRes = await fetch(apiUrl + '?action=getPerformansRaw&token=' + encodeURIComponent(token) + '&countOnly=true');
  if (!countRes.ok) throw new Error('cPanel API HTTP ' + countRes.status);
  const countResp = await countRes.json();
  if (!countResp || countResp.status !== 'ok') {
    throw new Error(countResp?.message || 'countOnly isteği başarısız');
  }
  const totalCount = countResp.totalCount || 0;
  const totalPages = countResp.totalPages || 1;
  if (totalCount === 0) return { performansData: [], savedAt: null, totalCount: 0 };

  let allData = [];
  let savedAt = countResp.savedAt || null;
  for (let page = 0; page < totalPages; page++) {
    if (onProgress) onProgress(page + 1, totalPages);
    const res = await fetch(apiUrl + '?action=getPerformansRaw&token=' + encodeURIComponent(token) + '&page=' + page + '&pageSize=' + PAGE_SIZE);
    if (!res.ok) { console.warn(`⚠️ Sayfa ${page}/${totalPages} HTTP hatası:`, res.status); continue; }
    const resp = await res.json();
    if (resp?.status === 'ok' && Array.isArray(resp.performansData)) {
      allData = allData.concat(resp.performansData);
      if (!savedAt && resp.savedAt) savedAt = resp.savedAt;
    } else {
      console.warn(`⚠️ Sayfa ${page}/${totalPages} hatası:`, resp?.message || 'bilinmiyor');
    }
  }
  return { performansData: allData, savedAt, totalCount };
}

async function pullPerformansFromSheets(silent = false) {
  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  // KADEMELİ GEÇİŞ: PHP_PERFORMANS_API_URL doluysa Apps Script bağlantı
  // kontrolü tamamen atlanır — artık gerekli değil.
  const phpModu = !!PHP_PERFORMANS_API_URL;
  if (!phpModu && (!url || !token)) {
    if (!silent) alert('⚠️ Sheets bağlantısı yapılandırılmamış.');
    return false;
  }

  const btn = document.getElementById('dash-pull-btn');
  const origText = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = (translations[currentLang]||translations.tr).pulling; btn.disabled = true; }

  try {
    // KADEMELİ GEÇİŞ: PHP_PERFORMANS_API_URL doluysa (cPanel/MySQL), performans
    // verisi ORADAN çekilir — gerçek fetch()+CORS, iframe/JSONP gerekmez.
    // Boşsa (varsayılan), eskisi gibi Apps Script üzerinden (jsonpFetch) çekilir.
    const kaynakAdi = PHP_PERFORMANS_API_URL ? 'cPanel/MySQL' : 'Google Sheets';
    const { performansData: allPerformansData } = PHP_PERFORMANS_API_URL
      ? await fetchPerformansRawPaginatedPhp(
          PHP_PERFORMANS_API_URL, DEFAULT_API_TOKEN,
          (cur, total) => { if (btn) btn.innerHTML = `⬇️ ${cur}/${total} çekiliyor...`; }
        )
      : await fetchPerformansRawPaginated(
          url, token,
          (cur, total) => { if (btn) btn.innerHTML = `⬇️ ${cur}/${total} çekiliyor...`; }
        );
    const data = {
      status: 'ok',
      performansData: allPerformansData,
      count: allPerformansData.length
    };
    console.log(`📥 Toplam çekilen inspector (${kaynakAdi}):`, allPerformansData.length);

    if (data.status === 'ok' && Array.isArray(data.performansData) && data.performansData.length > 0) {
      performansData = fixVerimlilikPerf(restorePerformansDateObjects(data.performansData));
      // verimlilikPerf hedefVerimlilik'e göre yeniden hesaplandı
      saveData();
      renderDashboard(); renderQuarterBadge(performansData);
      updateSidebar();
      renderTopInspectors();
      if (!silent) showSuccessMessage(`✅ ${performansData.length} ` + (translations[currentLang]||translations.tr).sheets_loaded_perf);
      else showStartupBanner(`✅ ${performansData.length} inspector verisi güncellendi`, 'success');
      console.log('✅ Performans verisi Sheets\u2019ten çekildi:', performansData.length, 'inspector');
      return true;
    } else {
      const _detay = data.status !== 'ok'
        ? ' (status: ' + (data.status || 'bilinmiyor') + ')'
        : (Array.isArray(data.performansData) ? ' (kayıt: ' + data.performansData.length + ')' : ' (performansData alanı yok)');
      if (!silent) showSuccessMessage((translations[currentLang]||translations.tr).sheets_no_perf + _detay);
      console.warn('\u26a0\ufe0f getPerformansRaw boş/hatalı yanıt:', JSON.stringify(data).substring(0, 200));
      return false;
    }
  } catch(err) {
    if (!silent) alert('❌ Performans verisi çekilemedi: ' + err.message);
    else console.warn('Performans otomatik çekme hatası:', err.message);
    return false;
  } finally {
    if (btn) { btn.innerHTML = origText; btn.disabled = false; }
  }
}

function showSheetsHelp() {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(11,31,58,.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px 32px;width:min(90vw,680px);max-height:85vh;overflow-y:auto;box-shadow:0 24px 60px rgba(11,31,58,.35);border:1px solid var(--border2)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div>
          <h2 style="font-size:18px;font-weight:700;color:var(--navy);margin-bottom:4px">📋 Google Apps Script Kurulum Rehberi</h2>
          <p style="font-size:12px;color:var(--muted)" data-i18n="sheets_help_intro">Klasman verilerini Google Sheets ile senkronize etmek için</p>
        </div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="width:32px;height:32px;border:1px solid var(--border);background:var(--offwhite);border-radius:8px;cursor:pointer;font-size:16px">✕</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px">

        <div style="background:var(--lblue3);border:1px solid var(--lblue);border-radius:10px;padding:14px 16px">
          <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px">📥 Adım 1 — Apps Script Dosyasını İndirin</div>
          <p style="font-size:11px;color:var(--muted);margin-bottom:10px">Panelle birlikte gelen <strong>LCW_Klasman_Script.gs</strong> dosyasını indirin ve içeriğini kullanın.</p>
          <div style="background:var(--navy);color:#adf;font-family:'DM Mono',monospace;font-size:10px;padding:10px 12px;border-radius:6px;white-space:pre-wrap">API_TOKEN = 'lcw-secret-2024'  ← Bunu değiştirin ve panele de girin
SHEET_NAME = 'Klasmanlar'      ← Sekme adı (değiştirmeye gerek yok)</div>
        </div>

        <div style="background:var(--lgreen);border:1px solid #B2DFDB;border-radius:10px;padding:14px 16px">
          <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px">⚙️ Adım 2 — Apps Script'e Yapıştırın</div>
          <ol style="font-size:11px;color:var(--muted);line-height:2;padding-left:18px">
            <li>Google Sheets dosyanızı açın (yoksa yeni oluşturun)</li>
            <li>Üst menü: <strong>Uzantılar → Apps Script</strong></li>
            <li>Açılan editörde mevcut kodu <strong>tamamen silin</strong></li>
            <li><strong>LCW_Klasman_Script.gs</strong> içeriğini yapıştırın</li>
            <li><strong>API_TOKEN</strong> değerini istediğiniz şifreyle değiştirin</li>
            <li>Kaydet (Ctrl+S)</li>
          </ol>
        </div>

        <div style="background:var(--lamber);border:1px solid #FFE082;border-radius:10px;padding:14px 16px">
          <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px">🚀 Adım 3 — Web App Olarak Yayınlayın</div>
          <ol style="font-size:11px;color:var(--muted);line-height:2;padding-left:18px">
            <li>Apps Script editöründe: <strong>Dağıt → Yeni Dağıtım</strong></li>
            <li>Tür: <strong>Web uygulaması</strong></li>
            <li>Açıklama: <em>Ürün Klasman Sync v1</em></li>
            <li>Farklı çalıştır: <strong>Ben (hesabınız)</strong></li>
            <li>Erişimi olan: <strong>Herkes</strong></li>
            <li><strong>Dağıt</strong>'a tıklayın → Google hesabı izni isteyecek, onaylayın</li>
            <li>Oluşan <strong>Web uygulaması URL'ini kopyalayın</strong></li>
          </ol>
        </div>

        <div style="background:#f3e5f5;border:1px solid #ce93d8;border-radius:10px;padding:14px 16px">
          <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px">🔗 Adım 4 — Panele Bağlayın</div>
          <ol style="font-size:11px;color:var(--muted);line-height:2;padding-left:18px">
            <li>Kopyaladığınız URL'i <strong>Web App URL</strong> alanına yapıştırın</li>
            <li>Apps Script'teki <strong>API_TOKEN</strong> değerini <strong>API Token</strong> alanına girin</li>
            <li>Google Sheets dosyasının linkini <strong>Tablo Linki</strong> alanına yapıştırın</li>
            <li><strong>📤 Sheets'e Gönder</strong> ile test edin</li>
          </ol>
        </div>

        <div style="background:var(--lred);border:1px solid #FFCDD2;border-radius:10px;padding:12px 14px">
          <div style="font-size:11px;font-weight:600;color:var(--red);margin-bottom:4px">⚠️ Önemli Notlar</div>
          <ul style="font-size:11px;color:var(--muted);line-height:1.8;padding-left:16px">
            <li>Gönderme (📤) işlemi <em>no-cors</em> modunda çalışır — yanıt göremezsiniz ama veri gider</li>
            <li>Çekme (📥) işlemi CORS gerektirir — Apps Script "Herkes" erişimine açık olmalı</li>
            <li>Script kodu değiştirilirse <strong>yeni bir dağıtım</strong> oluşturulmalı (eski URL değişmez)</li>
            <li>Farklı bilgisayarlarda aynı URL ve Token kullanılmalı</li>
          </ul>
        </div>

      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
}

// ────────────────────────────────────────────────────────────────────────────
// PERFORMANS ANALİZİ — MANİFEST GÖNDER (manuel buton)
// ────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
// PERFORMANS VERİSİ — SENKRON DURUMU (Sheets'e gönderilmedi uyarısı)
// ────────────────────────────────────────────────────────────────────────────
// performansHesapla() her çalıştığında (örnekleme modu, tarih, sütun vs.
// değiştiğinde) çağrılır. Veri artık otomatik Sheets'e gitmediği için
// kullanıcıya "değişiklikler var, göndermedin" uyarısı gösterir.
function markPerformansUnsynced() {
  const btn = document.getElementById('perf-push-btn');
  if (!btn) return;
  btn.classList.add('btn-pulse-warning');
  btn.dataset.unsynced = '1';
  if (!btn.dataset.origLabel) btn.dataset.origLabel = btn.innerHTML;
  btn.innerHTML = '📤 Sheets\'e Gönder <span style="background:#fff;color:#E65100;border-radius:10px;padding:1px 6px;font-size:10px;font-weight:700;margin-left:4px">●</span>';
}

function markPerformansSynced() {
  const btn = document.getElementById('perf-push-btn');
  if (!btn) return;
  btn.classList.remove('btn-pulse-warning');
  btn.dataset.unsynced = '0';
  if (btn.dataset.origLabel) btn.innerHTML = btn.dataset.origLabel;
}

async function pushPerformansManual(ev) {
  window._uploadAborted = false;
  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;

  // KADEMELİ GEÇİŞ: PHP_PERFORMANS_API_URL doluysa (cPanel/MySQL), Apps
  // Script'e HİÇ gidilmez — bağlantı ayarı kontrolü de atlanır, çünkü artık
  // gerekli değil. token yine de gerekli (PHP API'nin kendi token kontrolü
  // için) — appConfig.sheetsApiToken zaten panel.js'teki DEFAULT_API_TOKEN'a
  // eşit olduğundan (bkz. loadConfig), aynı token PHP tarafında da geçerli.
  const phpModu = !!PHP_PERFORMANS_API_URL;

  if (!phpModu && (!url || !token)) {
    alert('⚠️ Google Sheets bağlantısı yapılandırılmamış!\n\nKlasman Yönetimi → Bağlantı Ayarları bölümünden\nWeb App URL ve API Token girin.');
    return;
  }

  if (!performansData || performansData.length === 0) {
    alert('⚠️ Gönderilecek performans verisi yok.\nÖnce Excel dosyası yükleyin ve analizi tamamlayın.');
    return;
  }

  const btn = document.getElementById('perf-push-btn');
  const orig = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = (translations[currentLang]||translations.tr).sending; btn.disabled = true; }

  try {
    const _manualHedef = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);
    const _manualOrneklemeMod = document.querySelector('input[name="ornekleme-mod"]:checked')?.value || 'kapali';
    const _manualOrneklemeTarihliAktif = document.getElementById('ornekleme-tarihli-aktif')?.checked || false;
    const performansDataTemiz = performansData.map(inspector => {
      const klasmanlarTemiz = {};
      Object.entries(inspector.klasmanlar || {}).forEach(([k, v]) => {
        klasmanlarTemiz[k] = {
          adet: v.adet, standartSure: v.standartSure,
          kayitFiiliSure: v.kayitFiiliSure, hizPerf: v.hizPerf, hacimPerf: v.hacimPerf
        };
      });
      // "Ne ödül ne ceza" düzeltmesi CANLI _manualHedef ile: aksi halde
      // ekranda gösterilen (düzeltilmiş) yüzde ile Sheets/DB'ye gönderilen
      // yüzde birbirini tutmaz. getDispPerf() çağırmıyoruz çünkü o,
      // inspector.hedefVerimlilik'teki olası ESKİ/durağan hedefi kullanır.
      const standartSnPush = inspector.standartSure || 0;
      let mesaiSnPush = inspector.mesaiSure || 0;
      const notrKayipSnPush = getNotrKayipDakikaForInspector(inspector.ins) * 60;
      if (notrKayipSnPush > 0 && mesaiSnPush > notrKayipSnPush) mesaiSnPush -= notrKayipSnPush;
      const hamPerfPush = (standartSnPush > 0 && mesaiSnPush > 0)
        ? Math.round((standartSnPush / mesaiSnPush) * 100) : inspector.genelHizPerf;
      const verimlilikPerfPush = hamPerfPush != null ? Math.round(hamPerfPush * (100 / _manualHedef)) : inspector.verimlilikPerf;

      return {
        ...inspector,
        klasmanlar: klasmanlarTemiz,
        toplamMesaistiSaniye: inspector.toplamMesaistiSaniye || 0,
        gunlukOvertimeDetay: inspector.gunlukOvertimeDetay || {},
        hedefVerimlilik: _manualHedef,
        verimlilikPerf: verimlilikPerfPush,
        orneklemeMod: _manualOrneklemeMod,
        orneklemeTarihliAktif: _manualOrneklemeTarihliAktif,
        orneklemeDonemleri: _manualOrneklemeTarihliAktif ? orneklemeDonemleri : []
      };
    });

    if (phpModu) {
      // ── YENİ: Doğrudan cPanel/MySQL'e gönder — Apps Script'e hiç gidilmez ──
      const savedAt = new Date().toISOString();
      const res = await fetch(PHP_PERFORMANS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setPerformansRaw', token: DEFAULT_API_TOKEN, performansData: performansDataTemiz, savedAt })
      });
      if (!res.ok) throw new Error('cPanel API HTTP ' + res.status);
      const resp = await res.json();
      if (!resp || resp.status !== 'ok') throw new Error(resp?.message || 'cPanel API kaydetme hatası');
      console.log('✅ Performans verisi cPanel/MySQL\u2019e gönderildi:', resp.count, 'inspector');
    } else {
      // ── ESKİ YOL: Google Apps Script / Sheets (artık kullanılmıyor, geriye dönük) ──
      // PHP_PERFORMANS_API_URL her zaman dolu olduğundan bu dal normalde hiç
      // çalışmaz; SHEETS_DEVRE_DISI kontrolü ek bir güvenlik katmanıdır.
      if (SHEETS_DEVRE_DISI) throw new Error('Google Sheets bağlantısı devre dışı bırakıldı.');
      const _rowsHedef = Math.max(1, parseFloat(document.getElementById('inp-verimlilik')?.value) || 100);
      const rows = performansData.map(row => ({
        ins: row.ins,
        adet: row.adet,
        kayit: row.kayit,
        gunSayisi: row.gunSayisi || 0,
        standartSureDk: row.standartSure ? Math.round(row.standartSure / 60) : 0,
        mesaiSureDk:    row.mesaiSure    ? Math.round(row.mesaiSure / 60)    : 0,
        genelHizPerf:   row.genelHizPerf,
        verimlilikPerf: row.genelHizPerf != null ? Math.round(row.genelHizPerf * (100 / _rowsHedef)) : row.verimlilikPerf,
        hedefVerimlilik: _rowsHedef,
        klasmanOzet: Object.entries(row.klasmanlar || {})
          .map(([k,v]) => `${k}:${v.adet || 0}adet(${Math.round(v.hizPerf) || 0}%)`)
          .join(' | ')
      }));

      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'setPerformans', token, performans: rows, savedAt: new Date().toISOString() }),
        mode: 'no-cors'
      });

      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'setPerformansRaw', token, performansData: performansDataTemiz, savedAt: new Date().toISOString() }),
        mode: 'no-cors'
      });

      await pushInspectorKayitlarToSheets(performansData, url, token);
    }

    showSuccessMessage(`✅ ${performansData.length} ` + (translations[currentLang]||translations.tr).sheets_sent_perf);
    markPerformansSynced();
  } catch(err) {
    alert('❌ Gönderme hatası: ' + err.message);
  } finally {
    if (btn) { btn.innerHTML = orig; btn.disabled = false; }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PERFORMANS ANALİZİ — SHEETS'TEN ÇEK (manuel buton)
// ────────────────────────────────────────────────────────────────────────────
async function pullPerformansFromSheetsManual(ev) {
  const url   = appConfig.sheetsWebAppUrl;
  const token = appConfig.sheetsApiToken;
  // KADEMELİ GEÇİŞ: PHP_PERFORMANS_API_URL doluysa Apps Script bağlantı
  // kontrolü tamamen atlanır — artık gerekli değil.
  const phpModu = !!PHP_PERFORMANS_API_URL;

  if (!phpModu && (!url || !token)) {
    alert('⚠️ Google Sheets bağlantısı yapılandırılmamış!\n\nKlasman Yönetimi → Bağlantı Ayarları bölümünden\nWeb App URL ve API Token girin.');
    return;
  }

  const btn = document.getElementById('perf-pull-btn');
  const orig = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = (translations[currentLang]||translations.tr).pulling; btn.disabled = true; }

  try {
    const { performansData: allPd, savedAt } = phpModu
      ? await fetchPerformansRawPaginatedPhp(
          PHP_PERFORMANS_API_URL, DEFAULT_API_TOKEN,
          (cur, total) => { if (btn) btn.innerHTML = `⬇️ ${cur}/${total} çekiliyor...`; }
        )
      : await fetchPerformansRawPaginated(
          url, token,
          (cur, total) => { if (btn) btn.innerHTML = `⬇️ ${cur}/${total} çekiliyor...`; }
        );
    const data = {
      status: 'ok',
      performansData: allPd,
      savedAt: savedAt
    };

    if (data.status === 'ok' && Array.isArray(data.performansData) && data.performansData.length > 0) {
      const count    = data.performansData.length;
      const savedAtFmt  = data.savedAt ? new Date(data.savedAt).toLocaleString('tr-TR') : '—';

      if (!confirm(`📥 Sheets'te ${count} inspector verisi bulundu.\nSon kayıt: ${savedAtFmt}\n\nMevcut analiz verilerinin üzerine yazılsın mı?`)) {
        if (btn) { btn.innerHTML = orig; btn.disabled = false; }
        return;
      }

      performansData = fixVerimlilikPerf(restorePerformansDateObjects(data.performansData));
      saveData();
      renderDashboard();
      updateSidebar();
      renderTopInspectors();
      // Analiz tablosunu yeniden çiz
      if (typeof renderPerformansTable === 'function') renderPerformansTable();
      showSuccessMessage(`✅ ${count} ` + (translations[currentLang]||translations.tr).sheets_loaded_to_perf);
    } else {
      const detay = data.status !== 'ok'
        ? ` (Durum: ${data.status || 'bilinmiyor'})`
        : (Array.isArray(data.performansData) ? ` (${data.performansData.length} kayıt)` : ' (veri alanı yok)');
      alert('ℹ️ Sheets\'te henüz performans verisi bulunamadı.' + detay + '\n\nÖnce bir bilgisayardan Excel yükleyip "📤 Sheets\'e Gönder" butonunu kullanın.');
    }
  } catch(err) {
    alert('❌ Veri çekilemedi: ' + err.message + '\n\n🔧 Kontrol listesi:\n• Web App URL doğru mu?\n• API Token eşleşiyor mu?\n• Apps Script "Erişimi olan: Herkes" seçili mi?');
  } finally {
    if (btn) { btn.innerHTML = orig; btn.disabled = false; }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PERFORMANS ANALİZİ — NASIL ÇALIŞIR MODALI
// ────────────────────────────────────────────────────────────────────────────
function showPerformansHowItWorks() {
  // Mevcut ortalama göster
  const toplamInsp = performansData.length;
  const ortPerf    = toplamInsp > 0
    ? Math.round(performansData.reduce((s, r) => s + (r.genelHizPerf || 0), 0) / toplamInsp)
    : null;

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(11,31,58,.72);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px 32px;width:min(92vw,780px);max-height:88vh;overflow-y:auto;box-shadow:0 24px 60px rgba(11,31,58,.35);border:1px solid var(--border2)">

      <!-- Başlık -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px">
        <div>
          <h2 style="font-size:19px;font-weight:700;color:var(--navy);margin-bottom:4px" data-i18n="perf_how_title">📊 Performans Analizi — Nasıl Çalışır?</h2>
          <p style="font-size:12px;color:var(--muted)" data-i18n="perf_how_sub">Hesaplama mantığı, formüller ve Google Sheets entegrasyonu</p>
        </div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="width:34px;height:34px;border:1px solid var(--border);background:var(--offwhite);border-radius:8px;cursor:pointer;font-size:17px;flex-shrink:0">✕</button>
      </div>

      ${toplamInsp > 0 ? `
      <!-- Anlık Özet -->
      <div style="background:linear-gradient(135deg,var(--navy) 0%,var(--blue) 100%);border-radius:12px;padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;gap:18px;color:#fff">
        <div style="font-size:32px">📈</div>
        <div style="flex:1">
          <div style="font-size:12px;color:rgba(255,255,255,.65);margin-bottom:2px">Şu anki analiz</div>
          <div style="font-size:15px;font-weight:700">${toplamInsp} inspector · Ort. Hız Performansı: <span style="color:#90CAF9;font-family:'DM Mono',monospace">${ortPerf}%</span></div>
        </div>
      </div>` : ''}

      <div style="display:flex;flex-direction:column;gap:14px">

        <!-- 1 - Veri akışı -->
        <div style="background:var(--lblue3);border:1px solid var(--lblue);border-radius:10px;padding:14px 16px">
          <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:8px">📂 1 — Veri Akışı</div>
          <ol style="font-size:12px;color:var(--muted);line-height:2.1;padding-left:18px;margin:0">
            <li>Excel dosyanızı <strong>Dosya Yükle</strong> alanına sürükleyin (.xlsx / .xls)</li>
            <li><strong>Sütun Eşleme</strong> panelinde doğru kolonları seçin (Klasman, Inspector, Adet, Tarihler)</li>
            <li>Tablo anında hesaplanır — her satır bir inspectörün bir klasmandaki kaydıdır</li>
            <li>İstersen <strong>📤 Sheets'e Gönder</strong> ile sonuçları buluta kaydet</li>
          </ol>
        </div>

        <!-- 2 - Temel hesaplamalar -->
        <div style="background:var(--lgreen);border:1px solid #B2DFDB;border-radius:10px;padding:14px 16px">
          <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:10px">⚙️ 2 — Temel Hesaplamalar</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">

            <div style="background:#fff;border:1px solid #B2DFDB;border-radius:8px;padding:11px 13px">
              <div style="font-size:11px;font-weight:700;color:var(--navy);margin-bottom:5px">🕐 Standart Süre (sn)</div>
              <code style="font-size:10px;background:var(--offwhite);padding:4px 7px;border-radius:4px;display:block;color:var(--navy);line-height:1.8">
                Klasman → istasyon süreleri toplamı<br>
                × BakilacakMiktar (adet)
              </code>
              <div style="font-size:10px;color:var(--muted);margin-top:6px">Bir inspektörün o miktarı <em>standart hızda</em> incelemesi için gereken teorik süre.</div>
            </div>

            <div style="background:#fff;border:1px solid #B2DFDB;border-radius:8px;padding:11px 13px">
              <div style="font-size:11px;font-weight:700;color:var(--navy);margin-bottom:5px">⏱ Fiili/Mesai Süresi (sn)</div>
              <code style="font-size:10px;background:var(--offwhite);padding:4px 7px;border-radius:4px;display:block;color:var(--navy);line-height:1.8">
                Mesai sütunu varsa → sütun değeri<br>
                Yoksa → Gün Sayısı × 7.5 saat
              </code>
              <div style="font-size:10px;color:var(--muted);margin-top:6px">İnspektörün fiilen harcadığı (veya harcaması gereken) çalışma süresi.</div>
            </div>

            <div style="background:#fff;border:1px solid #B2DFDB;border-radius:8px;padding:11px 13px">
              <div style="font-size:11px;font-weight:700;color:var(--navy);margin-bottom:5px">🏎 Hız Performansı (%)</div>
              <code style="font-size:10px;background:var(--offwhite);padding:4px 7px;border-radius:4px;display:block;color:var(--navy);line-height:1.8">
                (Standart Süre ÷ Mesai Süresi) × 100
              </code>
              <div style="font-size:10px;color:var(--muted);margin-top:6px">%100 = tam standart hızda çalıştı · %120 = standarttan %20 hızlı · %80 = %20 yavaş.</div>
            </div>

            <div style="background:#fff;border:1px solid #B2DFDB;border-radius:8px;padding:11px 13px">
              <div style="font-size:11px;font-weight:700;color:var(--navy);margin-bottom:5px">⚡ Verimlilik Performansı (%)</div>
              <code style="font-size:10px;background:var(--offwhite);padding:4px 7px;border-radius:4px;display:block;color:var(--navy);line-height:1.8">
                Hız Perf × (100 ÷ Hedef%)
              </code>
              <div style="font-size:10px;color:var(--muted);margin-top:6px">Hedef verimlilik %100'den farklıysa düzeltme katsayısı uygulanır.</div>
            </div>

          </div>
        </div>

        <!-- 3 - Gün sayısı -->
        <div style="background:var(--lamber);border:1px solid #FFE082;border-radius:10px;padding:14px 16px">
          <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:8px">📅 3 — Çalışma Gün Sayısı Nasıl Hesaplanır?</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.9">
            <p style="margin-bottom:6px">Bir inspektörün <strong>birden fazla kaydı</strong> varsa her kayıttaki (Başlangıç–Bitiş) aralıklarına bakılır:</p>
            <ol style="padding-left:18px;margin:0;line-height:2.1">
              <li>Her kayıt için <em>Başlangıç Tarihi → Bitiş Tarihi</em> arasındaki fark hesaplanır</li>
              <li>Tüm tarih aralıkları birleştirilir, <strong>çakışan günler bir kez sayılır</strong></li>
              <li>Sonuç: inspektörün gerçek çalışma gün sayısı</li>
            </ol>
            <p style="margin-top:8px;font-size:11px;background:#fff8;padding:7px 10px;border-radius:6px;border-left:3px solid var(--amber)">
              ⚠️ Mesai sütunu seçilmezse gün sayısı × 7,5 saat baz alınır. Mesai sütunu seçilirse o değer doğrudan kullanılır.
            </p>
          </div>
        </div>

        <!-- 4 - Performans seviyeleri -->
        <div style="background:#f3e5f5;border:1px solid #ce93d8;border-radius:10px;padding:14px 16px">
          <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:10px">🏅 4 — Performans Seviyeleri</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
            <div style="text-align:center;padding:10px 8px;background:#E0F2F1;border-radius:8px;border:1px solid #B2DFDB">
              <div style="font-size:18px;margin-bottom:4px">⭐</div>
              <div style="font-size:13px;font-weight:700;color:#00695C">≥ 95%</div>
              <div style="font-size:10px;color:var(--muted);margin-top:2px">Mükemmel</div>
            </div>
            <div style="text-align:center;padding:10px 8px;background:var(--lblue2);border-radius:8px;border:1px solid var(--lblue)">
              <div style="font-size:18px;margin-bottom:4px">👍</div>
              <div style="font-size:13px;font-weight:700;color:var(--blue)">85–94%</div>
              <div style="font-size:10px;color:var(--muted);margin-top:2px">İyi</div>
            </div>
            <div style="text-align:center;padding:10px 8px;background:var(--lamber);border-radius:8px;border:1px solid #FFE082">
              <div style="font-size:18px;margin-bottom:4px">⚠️</div>
              <div style="font-size:13px;font-weight:700;color:var(--amber)">70–84%</div>
              <div style="font-size:10px;color:var(--muted);margin-top:2px">Orta</div>
            </div>
            <div style="text-align:center;padding:10px 8px;background:var(--lred);border-radius:8px;border:1px solid #FFCDD2">
              <div style="font-size:18px;margin-bottom:4px">🔴</div>
              <div style="font-size:13px;font-weight:700;color:var(--red)">< 70%</div>
              <div style="font-size:10px;color:var(--muted);margin-top:2px">Düşük</div>
            </div>
          </div>
        </div>

        <!-- 5 - Sheets entegrasyonu -->
        <div style="background:linear-gradient(135deg,#E8F5E9 0%,#fff 100%);border:1px solid #A5D6A7;border-radius:10px;padding:14px 16px">
          <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:10px">☁️ 5 — Google Sheets Entegrasyonu</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="background:#fff;border:1px solid #A5D6A7;border-radius:8px;padding:11px 13px">
              <div style="font-size:12px;font-weight:700;color:#2E7D32;margin-bottom:6px">📤 Sheets'e Gönder</div>
              <ul style="font-size:11px;color:var(--muted);line-height:1.9;padding-left:16px;margin:0">
                <li>Mevcut <strong>${toplamInsp} inspector</strong> verisini buluta yükler</li>
                <li>Hem okunabilir tablo hem ham JSON gönderilir</li>
                <li>Diğer bilgisayarlardan erişime açılır</li>
                <li>Otomatik tarih damgası ekler</li>
              </ul>
            </div>
            <div style="background:#fff;border:1px solid #A5D6A7;border-radius:8px;padding:11px 13px">
              <div style="font-size:12px;font-weight:700;color:#1565C0;margin-bottom:6px">📥 Sheets'ten Çek</div>
              <ul style="font-size:11px;color:var(--muted);line-height:1.9;padding-left:16px;margin:0">
                <li>Sheets'teki ham JSON verisi çekilir</li>
                <li>Onay sonrası mevcut verilerin üzerine yazar</li>
                <li>Dashboard ve Canlı Gösterim güncellenir</li>
                <li>Son kayıt tarihi gösterilir</li>
              </ul>
            </div>
          </div>
          <div style="margin-top:10px;font-size:11px;color:var(--muted);padding:8px 12px;background:rgba(255,255,255,.7);border-radius:6px;border-left:3px solid #4CAF50">
            💡 Bağlantı kurulmamışsa <strong>Klasman Yönetimi → Bağlantı Ayarları</strong> bölümünden Web App URL ve API Token girin.
          </div>
        </div>

      </div>

      <div style="display:flex;justify-content:flex-end;margin-top:18px;gap:10px">
        <button onclick="this.closest('[style*=fixed]').remove()" style="padding:8px 20px;background:var(--blue2);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Tamam</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

