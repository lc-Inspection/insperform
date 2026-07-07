# Dijital Tabela Sistemi (GitHub Pages + HTML/JS)

Sunucusuz, tamamen statik dosyalarla çalışan bir dijital tabela (digital signage)
sistemi. TV'ler bir web sayfasını açar, içerik listesini (`playlist.json`)
okur, medyayı önbelleğe alır ve internet kesilse bile son bilinen içeriği
oynatmaya devam eder.

Tüm sistem dosyaları tek bir dizinde (ana dizin) yer alır — GitHub Pages'te
alt klasör karmaşası olmadan doğrudan kök adresten çalışır.

## Klasör yapısı

```
signage/
├── index.html      → Giriş sayfası (bilgilendirme + linkler)
├── player.html      → TV'de açılacak sayfa
├── player.js         → Oynatma mantığı
├── sw.js              → Service worker (offline önbellekleme)
├── admin.html        → Yayın paneli (içerik yönetimi)
├── admin.js           → GitHub API entegrasyonu
├── playlist.json      → İçerik ve cihaz grubu tanımları
└── media/              → Yüklenen görsel/video dosyaları
```

## 1) GitHub Pages üzerinde yayınlama

1. Bu klasörün içeriğini bir GitHub reposuna yükleyin (örn. `tv-signage`).
2. Repo → **Settings → Pages** → "Deploy from a branch" → `main` / `/ (root)` seçin.
3. Birkaç dakika sonra siteniz şu adreste yayında olur:
   `https://KULLANICI_ADINIZ.github.io/tv-signage/`

## 2) Yayın Paneli'ne bağlanma

1. `admin.html` sayfasını açın (yerelde veya GitHub Pages üzerinde).
2. Sağ üstteki **"GitHub Bağlantısı"** butonuna basın.
3. GitHub'da bir **Personal Access Token** oluşturun:
   - GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token
   - Repository access: sadece bu repo
   - Permissions: **Contents → Read and write**
4. Kullanıcı adı, repo adı, branch (`main`) ve token'ı girip **Bağlan**'a basın.
   Token yalnızca tarayıcınızda (`localStorage`) saklanır.

Panel açıldığında `playlist.json` dosyasını okuyacak, yoksa boş bir yapı
ile başlayacaktır.

## 3) İçerik ekleme

- Sol taraftan bir **cihaz grubu** seçin (veya "+ Yeni grup" ile oluşturun —
  örneğin `lobi`, `magaza-2` gibi her fiziksel TV grubu için ayrı bir kimlik).
- **"+ İçerik ekle"** ile listeye görsel, video veya web sayfası ekleyin:
  - **Görsel/Video:** "Yükle" butonuyla dosyanızı doğrudan repoya
    (`media/` klasörüne) yükleyebilir ya da harici bir URL yazabilirsiniz.
  - **Web:** tam bir URL girin (örn. bir Power BI paylaşım linki).
  - Görsel ve web içerikleri için gösterim **süresi (saniye)** girin;
    video kendi süresi kadar oynar.
- Sıralamayı ok butonlarıyla değiştirin, gereksiz içerikleri ✕ ile silin.
- **"Yayınla"** butonuna basınca değişiklikler doğrudan GitHub reposuna
  commit edilir.

> **Not — büyük video dosyaları:** GitHub Contents API tek seferde ~45MB
> üzeri dosya yüklemeyi desteklemez. Büyük videolar için harici bir
> barındırma (ör. bir CDN, Google Drive doğrudan link, dahili dosya sunucusu)
> kullanıp içerik satırına o URL'yi yazmanız önerilir.

## 4) TV'yi bağlama

1. Panelde ilgili grubu seçili durumdayken **"TV Bağlantı URL'si"** butonuna basın.
2. GitHub Pages temel adresinizi girin (örn. `https://kullanici.github.io/tv-signage`).
3. Oluşan adresi (örn. `https://kullanici.github.io/tv-signage/player.html?grup=lobi`)
   TV'nin tarayıcısının adres çubuğuna / URL başlatıcısına yazın.
4. TV bu sayfayı bir kez açtığında kendini o gruba kaydeder ve bir daha
   adres yazmanıza gerek kalmaz — sayfa/uygulama her açıldığında otomatik
   olarak son bilinen listeyi oynatır.

### Offline davranış

- TV, `service worker` sayesinde playlist.json'u ve tüm medya dosyalarını
  yerel önbelleğe alır.
- İnternet kesilirse: TV, son başarılı senkronizasyondaki içerikle sonsuz
  döngüde oynatmaya **devam eder**.
- İnternet geri geldiğinde: en geç `player.js` içindeki `pollIntervalMs`
  süresinde (varsayılan 5 dakika) otomatik olarak güncel listeye geçer.
- TV yeniden başlatılırsa (elektrik kesintisi vb.): tarayıcı önbelleğinden
  aynı içerikle otomatik olarak açılır, internet gerekmez.

### Hata ayıklama

Player ekranında TV kumandasıyla (veya bağlıysa klavyeyle) **"d"** tuşuna
basarak sağ alt köşede grup adı, aktif liste, öğe sırası ve bağlantı
durumunu gösteren küçük bir debug katmanı açıp kapatabilirsiniz.

## Sınırlamalar / genişletme fikirleri

- Bu sürüm tek yönlü çalışır: TV'ler hangi playlist'i oynadığını sunucuya
  raporlamaz (izleme/rapor özelliği yok). İleride basit bir "heartbeat"
  (ör. bir Google Form/Sheet'e veya küçük bir API'ye ping atma) eklenebilir.
- Zamanlayıcı (belirli saatte belirli içerik) şu an desteklenmiyor;
  istenirse `playlist.json` yapısına saat aralığı alanları eklenip
  `player.js` içinde saat kontrolü yapılabilir.
- Çoklu bölge (ekranı ikiye bölüp saat + video gibi) desteklenmiyor;
  gerekirse `player.js`'e ikinci bir `stage` katmanı eklenebilir.
