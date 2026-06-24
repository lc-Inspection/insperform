# 📺 Digital Signage — Google Sheets Destekli

Sunucu gerektirmeyen, Google Sheets'i veritabanı olarak kullanan dijital tabela sistemi.

## Dosyalar

| Dosya | Açıklama |
|---|---|
| `index.html` | Yönetim paneli |
| `player.html` | TV oynatıcı |
| `Code.gs` | Google Apps Script (API) |

---

## Kurulum

### 1. Google Sheet hazırlayın
Yeni bir Google Sheets dosyası açın. URL'den Sheet ID'yi alın:
```
https://docs.google.com/spreadsheets/d/BURASI_SHEET_ID/edit
```

### 2. Apps Script'i kurun
- Sheet'te **Uzantılar → Apps Script** açın
- `Code.gs` içeriğini yapıştırın
- `SHEET_ID` satırını kendi ID'nizle değiştirin:
  ```js
  const SHEET_ID = 'sizin-sheet-id';
  ```
- Fonksiyon seçiciden `initSheets` seçin → **▶ Çalıştır**
  (ilk çalıştırmada Google izni isteyecek — onaylayın)

### 3. Web uygulaması olarak dağıtın
- **Dağıt → Yeni dağıtım → Web uygulaması**
- Farklı çalıştır: **Ben**
- Erişim: **Herkes**
- **Dağıt** → URL'i kopyalayın

### 4. Admin panelini açın
`index.html`'i tarayıcıda açın. Sol alttaki **Apps Script URL** kutusuna URL'i yapıştırın.

### 5. Playlist oluşturun
- **Playlist'ler → Playlist Ekle**
- SharePoint'ten "Bağlantıyı kopyala" ile aldığınız URL'i yapıştırın
- Süre (saniye) girin → Kaydet

### 6. Ekran tanımlayın
- **Ekranlar → Ekran Ekle** → İsim + Playlist seçin
- **URL** butonuna tıklayın → TV'de açın

---

## TV'de Kullanım

Player URL formatı:
```
https://KULLANICI.github.io/REPO/player.html?screen=scr_XXX&api=https://script.google.com/...
```

Admin panelindeki **URL** butonu bu linki otomatik oluşturur.

### Klavye kısayolları
| Tuş | Eylem |
|---|---|
| → / Page Down | Sonraki |
| ← / Page Up | Önceki |
| F | Tam ekran |
| R | Yenile |

---

## SharePoint Video Linkleri

SharePoint'te bir video için:
1. Videoya sağ tıklayın → **Bağlantıyı kopyala**
2. Bu linki playlist'e yapıştırın

Apps Script otomatik olarak `?download=1` ekleyerek direkt oynatılabilir formata çevirir.

> **Not:** SharePoint linkleri kurumunuzun dışına açık olmayabilir. IT'den linklerin dış erişime açık olduğunu teyit edin.

---

## Güncelleme Sıklığı

Player, her **30 saniyede bir** Google Sheets'ten güncellemeleri kontrol eder. Admin panelinde yaptığınız değişiklikler TV'ye otomatik yansır.
