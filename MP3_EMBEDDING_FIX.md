# MP3 Lyrics Embedding - Dosya Konumu Fix

## Problem
MP3 lirik gömme (ID3/SYLT) işleminde çıktı dosyası:
- ❌ Hep `D:\AI\SubMaker\temp` klasöründe kalıyordu
- ❌ Orijinal kaynak klasöründe yazılmıyordu

## Çözüm Yapılan Değişiklikler

### 1. Backend (`backend/api/routes.py`)
**Sorun**: ID3 export'ta `source_file` kullanılıyordu (temp yolu olabilir)
**Çözüm**:
- ✅ Öncelik: `original_file_path` kullan (asıl kaynak)
- ✅ Fallback: `source_file` kontrol et
- ✅ Son çare: `temp` klasöründe ara
- ✅ Detaylı logging eklendi

### 2. Frontend (`electron/src/renderer/stores/appStore.js`)
**Sorun 1**: `exportLyrics` function'ında `originalMediaFile` kullanılmıyordu
**Çözüm**:
```javascript
const sourceFile = originalMediaFile || mediaFile;
```

**Sorun 2**: Native file dialog açılınca `originalMediaFile` set edilmiyordu
**Çözüm**:
```javascript
setMediaFile: async (filePath, type) => {
  set({
    mediaFile: filePath,
    originalMediaFile: filePath,  // ← NEW: Track original path
    ...
  })
}
```

## Test Rehberi

### Senaryo 1: Native File Dialog (ÖNEMLÎ) ✓
```
1. SubMaker aç
2. "Select Audio" tıkla
3. Bilgisayardan MP3 seç (örn: D:\Music\song.mp3)
4. Transcribe + subtitles oluştur
5. Export → "MP3'e Göm" (ID3)
6. Sonuç: D:\Music\song.mp3'e lirikler yazılmış
```

### Senaryo 2: Drag & Drop
```
1. MP3'ü drag/drop et
2. Subtitles oluştur
3. Export → "MP3'e Göm"
4. Sonuç: temp klasöründe yazılır (beklenen davranış)
ℹ️ Çünkü orijinal dosya path'i bilinmiyor
```

### Senaryo 3: Suno Importer
```
1. Suno text yapıştır
2. Subtitles oluştur
3. Export → "MP3'e Göm"
4. Sonuç: temp klasöründe yazılır (beklenen davranış)
```

## Kontrol Lisesi
- [ ] Backend'de `/export/lyrics?format=id3` çağrısı
- [ ] Response'ta `source_location` alanı var mı?
- [ ] Console.log'da `[ID3] Using original file path` mesajı görüntülendi mi?
- [ ] `D:\Music\song.mp3` konumunda lirikler gömüldü mü?
- [ ] ID3 tags okuyucu yazılımda SYLT görünüyor mu?

## Logging Çıktısı Örneği
```
[ID3] Using original file path: D:\Music\song.mp3
[ID3] Writing SYLT to: D:\Music\song.mp3
[ID3] Subtitles count: 45, language: tr
[ID3] Target location: D:\Music (original source dir)
[ID3] Write result: sylt=True, uslt=True
[ID3] Verified: 45 SYLT entries written to original location
```

## Notes
- Native dialog: Asıl dosya konumuna yazılır ✓
- Drag/drop: Temp'e yazılır (path bilinmiyor)
- Export response'ta `source_location` alanı eklendi
- Frontend log'unda dosya konumu görüntülenir
