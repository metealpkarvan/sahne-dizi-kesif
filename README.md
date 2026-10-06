# Sahne — Hikâyenin içine gir

Türkçe dizi keşfi ve kişisel izleme günlüğü. Canlı sürüm: https://sahne-dizi-kesif.metealp.chatgpt.site/

## Deneyim

- Sinematik ana sahneler, karakter fotoğrafları, paralaks ve doğal kaydırmayla ilerleyen tam ekran hikâyeler.
- TVmaze’in 6 Ekim 2026 tarihli **90.394 kayıtlık tam indeksi**. Varsayılan dizi/animasyon görünümünde 51.643 başlık; arama gerektirmeden 48’er kartlık sayfalarla gezilebilir.
- Popülerler, klasikler, yüksek puanlılar, yeni başlayanlar, devam edenler ve yakında rafları; platform, tür, dil, yayın durumu ve yapım türü filtreleri.
- Apple TV+, HBO Max, Netflix ve Disney+/FX/Hulu aileleri için geniş katalog; 175 başlık için ayrıca resmî kaynaklarla desteklenen yapım kökeni ve Türkçe editoryal açıklama.
- **24 görselli seçki**: modern klasikler, 90’lar, Türkçe/Korece/Japonca hikâyeler, suç, gelecek, tarih, kısa bölümler ve daha fazlası.
- Beğendim / çok beğendim / beğenmedim sinyallerine göre değişen öneriler. Tür, konu, atmosfer, süre, dil ve yıl benzerliği kullanılır. Çok beğenme daha güçlüdür; olumsuz tercihler benzer dizileri geriye iter.
- Katalog ve platform sayfalarında hemen güncellenen öneri afişleri; öneri kartlarında hangi tercihin etkili olduğunu gösteren açıklama. Arama filtreleri kişisel öneri havuzunu daraltmaz.
- Arşivdeki ve değerlendirilmiş diziler yeniden önerilmez. Favoriler ve 3,5+ / 2 ve altı yıldızlar, açık bir beğeni verilmemişse önerileri etkiler. Kişisel notlar kullanılmaz.
- Sonra izle, izleme durumları, özel listeler, yıldız puanları, notlar ve bölüm takibi.
- Ülkeye göre doğrulanmış izleme kayıtları; kaydı bulunmayan başlıklarda ülkenin JustWatch kataloğuna arama bağlantısı.
- Mobil düzen, tarayıcı geçmişiyle geri dönüş ve azaltılmış hareket tercihine uyum.

## Yerel çalıştırma ve doğrulama

Statik HTML, CSS ve JavaScript. Uygulamada harici Node bağımlılığı yoktur; Vercel için yayın dosyaları `dist/` klasörüne hazırlanır.

```sh
python3 -m http.server 4181 --directory .
npm run build
npm test
```

http://localhost:4181 adresini açın. Canlı katalog araması, bölüm takvimi ve ek dizi ayrıntıları için internet bağlantısı gerekir. Regresyon testi gerçek başlangıç kataloğuyla beğeni etkisini, güçlü tercihi, tüm arşiv durumlarını, yıldız/favori sinyallerini ve deterministik sonuçları denetler.

## Vercel yayını

Vercel proje adı: `sahne-dizi-kesif`. Framework ayarı Other; build komutu `npm run build`, yayın klasörü `dist`. Yapılandırma `vercel.json` dosyasında bulunur. `scripts/build.mjs` yalnızca uygulama dosyalarını, görselleri ve katalog verilerini paketler; testler, depo belgeleri ve yerel Vercel ayarları yayın paketine girmez.

GitHub `main` dalı Vercel projesine bağlandığında bu dala yapılan güncellemeler üretim sürümünü otomatik yayımlar. Vercel bağlantı bilgileri `.vercel/` içinde yerel kalır ve GitHub’a eklenmez.

## Verilerin anlamı ve güncellik

Tam indeks ve popülerlik/puan sıralamaları kaynak tarihi görünen bir anlık görüntüdür. Yeni başlayanlar ilk yayın tarihine, devam edenler TVmaze’in yayın durumuna göre seçilir; devam ediyor etiketi bugün yeni bölüm yayımlandığı anlamına gelmez. Platformların son yedi günlük web bölüm takvimi sayfa açıldığında kontrol edilir ve altı saat önbelleğe alınır. Yeni bölüm rafında kayıtlı bölüm adı ve yayın tarihi gösterilir. Takvim bağlantısı yoksa katalog rafları kullanılmaya devam eder.

Platform kategorileri özgün yayıncı ve stüdyo ailesini gösterir; seçilen ülkede abonelikle erişim garantisi değildir. HBO/Max, Apple TV, Netflix ve Disney+/FX/Hulu kayıtları ile kaynakla doğrulanmış köken bilgileri kullanılır. Yıl ilk yayın yılı, puan TVmaze kullanıcı ortalamasıdır; oy sayısı olmayan kayıtlarda uydurma oy sayısı gösterilmez. İzleme kayıtlarının kontrol tarihi dizi ayrıntısında görünür.

Arşiv ve beğeniler bu cihazın tarayıcısında saklanır. Hesap veya cihazlar arasında eşitleme yoktur. Arşiv, uygulamadaki indirme düğmesiyle dışa aktarılabilir.

## Görseller ve kaynaklar

Dizi bilgileri TVmaze, izleme seçenekleri JustWatch kaynaklıdır. Tam indeks açıklaması: https://www.tvmaze.com/api#show-index. Platformların resmî kaynak kayıtları `catalog/platform-sources.json`, yerel tanıtım fotoğraflarının kaynakları ve kredileri `image-sources.json` içindedir. Görseller ve marka adları ilgili hak sahiplerine aittir; bu kayıtlar açık lisans anlamına gelmez.
