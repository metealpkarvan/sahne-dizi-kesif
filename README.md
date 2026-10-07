# Sahne — Hikâyenin içine gir

Türkçe dizi keşfi, sosyal izleme günlüğü ve dizi topluluğu. Canlı sürüm: https://sahne-dizi-kesif.vercel.app/

## Deneyim

- Sinematik ana sahneler, karakter fotoğrafları, paralaks ve doğal kaydırmayla ilerleyen tam ekran hikâyeler.
- TVmaze’in 6 Ekim 2026 tarihli **90.394 kayıtlık tam indeksi**. Varsayılan dizi/animasyon görünümünde 51.643 başlık; arama gerektirmeden 48’er kartlık sayfalarla gezilebilir.
- Popülerler, klasikler, yüksek puanlılar, yeni başlayanlar, devam edenler ve yakında rafları; platform, tür, dil, yayın durumu ve yapım türü filtreleri.
- Apple TV+, HBO Max, Netflix ve Disney+/FX/Hulu aileleri için geniş katalog; 175 başlık için ayrıca resmî kaynaklarla desteklenen yapım kökeni ve Türkçe editoryal açıklama.
- **24 görselli seçki**: modern klasikler, 90’lar, Türkçe/Korece/Japonca hikâyeler, suç, gelecek, tarih, kısa bölümler ve daha fazlası.
- Beğendim / çok beğendim / beğenmedim sinyallerine göre değişen öneriler. Tür, konu, atmosfer, süre, dil ve yıl benzerliği kullanılır. Çok beğenme daha güçlüdür; olumsuz tercihler benzer dizileri geriye iter.
- Katalog ve platform sayfalarında hemen güncellenen öneri afişleri; öneri kartlarında hangi tercihin etkili olduğunu gösteren açıklama. Arama filtreleri kişisel öneri havuzunu daraltmaz.
- Arşivdeki ve değerlendirilmiş diziler yeniden önerilmez. Favoriler ve 7+ / 4 ve altı puanlar, açık bir beğeni verilmemişse önerileri etkiler. Kişisel notlar kullanılmaz.
- Better Auth ile e-posta/şifre hesabı; herkese açık profil, kırpılabilir profil fotoğrafı, biyografi ve takip.
- Diziye ve kategoriye bağlı forum konuları, yanıtlar, yorumlar, spoiler perdesi, beğeniler ve içerik bildirme.
- Herkese açık izleme kayıtları ve profilde izlenen diziler; özel günlük notları ayrı tutulur.
- Neon Postgres üzerinde kalıcı hesap arşivi, tercihler, listeler ve 10 üzerinden yarım puan adımları.
- Sonra izle, izleme durumları, özel listeler, 10 üzerinden puanlar, notlar ve bölüm takibi.
- Dizi ayrıntısında ülkeye göre izleme rehberi: abonelik, ücretsiz/reklamlı erişim, kiralama ve satın alma seçenekleri; platform görselleri, kalite, mevcut fiyat ve doğrudan platform bağlantıları. Kullanıcı sonuçları görmek için Sahne’den ayrılmaz.
- Masaüstü kartlarında kısa beklemeyle sessiz fragman önizlemesi; ses düğmesi, ayrıntıya geçiş ve fare ayrıldığında/ekran değiştiğinde temizleme. Mobilde ve azaltılmış hareket tercihinde otomatik önizleme yerine ayrıntıdaki fragman düğmesi kullanılır.
- Dizi ayrıntısında gerçek sahne görselleri ve afişlerden oluşan mozaik; tam ekran görsel arşivi, küçük görseller, önceki/sonraki geçişi ve klavye desteği.
- Mobil düzen, tarayıcı geçmişiyle geri dönüş ve azaltılmış hareket tercihine uyum.

## Yerel çalıştırma ve doğrulama

Statik HTML/CSS/JavaScript arayüzü, Node.js 24 Vercel Functions API, Better Auth ve Neon Postgres. Kimlik doğrulama parolaları güvenli hash ile tutulur; oturumlar HTTP-only çerez kullanır.

```sh
npm ci
cp .env.example .env.local
# .env.local içindeki sunucu değişkenlerini kendi veritabanınızla doldurun.
npm run db:migrate
npm run dev
```

http://localhost:4182 adresini açın. `.env.local` ve `.vercel` Git tarafından yok sayılır. Veritabanı şeması için `scripts/migrate.mjs` idempotent olarak auth ve sosyal tabloları oluşturur. Uygulama istekleri sırasında şema oluşturulmaz.

```sh
npm run build
npm test
npm run test:watch
npm run test:media
npm run test:community
npm run test:navigation
```

Son komut yerel API ve gerçek veritabanında iki geçici test hesabıyla oturum, yetki, özel veri, forum, puan, takip ve hesap arşivi akışlarını denetler; oluşturduğu hesapları sonunda temizler. Canlı katalog araması ve ek dizi ayrıntıları için internet bağlantısı gerekir.

## Vercel yayını

Vercel proje adı: `sahne-dizi-kesif`. Framework ayarı Other; build komutu `npm run build`, yayın klasörü `dist`. Yapılandırma `vercel.json` dosyasında bulunur. `scripts/build.mjs` yalnızca uygulama dosyalarını, görselleri ve katalog verilerini paketler; testler, depo belgeleri ve yerel Vercel ayarları yayın paketine girmez.

GitHub `main` dalı Vercel projesine bağlıdır; bu dala yapılan güncellemeler üretim sürümünü otomatik yayımlar. Vercel bağlantı bilgileri `.vercel/` içinde yerel kalır ve GitHub’a eklenmez.

## Verilerin anlamı ve güncellik

Tam indeks ve popülerlik/puan sıralamaları kaynak tarihi görünen bir anlık görüntüdür. Yeni başlayanlar ilk yayın tarihine, devam edenler TVmaze’in yayın durumuna göre seçilir; devam ediyor etiketi bugün yeni bölüm yayımlandığı anlamına gelmez. Platformların son yedi günlük web bölüm takvimi sayfa açıldığında kontrol edilir ve altı saat önbelleğe alınır. Yeni bölüm rafında kayıtlı bölüm adı ve yayın tarihi gösterilir. Takvim bağlantısı yoksa katalog rafları kullanılmaya devam eder.

Platform kategorileri özgün yayıncı ve stüdyo ailesini gösterir; seçilen ülkede abonelikle erişim garantisi değildir. HBO/Max, Apple TV, Netflix ve Disney+/FX/Hulu kayıtları ile kaynakla doğrulanmış köken bilgileri kullanılır. Yıl ilk yayın yılı, puan TVmaze kullanıcı ortalamasıdır; oy sayısı olmayan kayıtlarda uydurma oy sayısı gösterilmez. İzleme kayıtlarının kontrol tarihi dizi ayrıntısında görünür. `/api/watch`, TVmaze kimliğini JustWatch’ın herkese açık katalog verisiyle IMDb kimliği veya kesin başlık/yıl eşleşmesi üzerinden eşleştirir; film, yeniden çevrim ve belirsiz eşleşmeleri platform kaydı gibi sunmaz. Bu bağlantı sözleşmeli bir JustWatch Partner API entegrasyonu değildir; kamuya açık katalog arayüzü değişirse uyarlama gerekebilir. Dolu kayıtlar altı saat, boş/eşleşmeyen kayıtlar bir saat Neon üzerinde önbelleğe alınır. Servis kesintisinde en fazla 72 saatlik son kayıt kontrol tarihi ve uyarıyla gösterilir. Kaynaktaki boş ülke kaydı, tüm internette erişim olmadığı iddiası değildir. Ücretsiz seçenekler bazı sezon veya bölümleri kapsayabilir; satın alma/kiralama fiyatları listedeki başlangıç fiyatıdır. Veri kaynağı her sonuçta JustWatch olarak belirtilir.

`/api/media` aynı dizi kimliğini doğrular, TVmaze görsellerini ve eşleşmiş JustWatch yapımının görsellerini/kliplerini sorgular. Kliplerin YouTube kimliği, gerçek başlığı ve yayıncısı oEmbed ile kontrol edilir; film, farklı aynı adlı yapım, fan fragmanı ve ilgisiz klipler elenir. Resmî yayıncı varsa önceliklidir; başka bir yayıncının gerçek fragmanı resmîymiş gibi etiketlenmez. Her dizinin fragman kaydı olması garanti değildir. Videolar resmî YouTube gömülü oynatıcısında oynar; yeniden barındırılmaz. Gömülme/otomatik oynatma kısıtı olduğunda oynat düğmesi veya YouTube bağlantısı sunulur. Fragmanlı kayıtlar 12 saat, fragmanı olmayanlar bir saat, kısmi servis hataları 15 dakika Neon üzerinde tutulur; kesintide 72 saate kadar eski kayıt kullanılabilir. Galeri görselleri gerektiğinde diziye ait bölüm görselleriyle tamamlanır.

Misafir arşivi cihazda kalır. Oturum açıldığında hesaba ait arşiv yüklenir; cihazdaki eski arşiv yalnızca açık aktarım düğmesiyle hesaba eklenir. Günlükteki özel notlar profil ve akış API yanıtlarına dahil edilmez. İzleme kaydı veya yorum formundan paylaşılan metinler herkese açıktır. Arşiv indirme düğmesiyle dışa aktarılabilir.

Sunucuda `DATABASE_URL`, `BETTER_AUTH_SECRET` ve `BETTER_AUTH_URL` gerekir. Üretim adresi auth origin listesinde bulunmalıdır. Veritabanına ve uygulama dosyalarına yazılan veriler farklıdır: API ve server kaynakları statik `dist` içine kopyalanmaz.

## Görseller ve kaynaklar

Dizi bilgileri TVmaze, izleme seçenekleri JustWatch kaynaklıdır. Tam indeks açıklaması: https://www.tvmaze.com/api#show-index. Platformların resmî kaynak kayıtları `catalog/platform-sources.json`, yerel tanıtım fotoğraflarının kaynakları ve kredileri `image-sources.json` içindedir. Görseller ve marka adları ilgili hak sahiplerine aittir; bu kayıtlar açık lisans anlamına gelmez.


Eski `sahne-dizi-kesif.metealp.chatgpt.site` yayını da sabit izleme listesi yerine bu uygulamanın public `/api/watch` uç noktasını kullanır. CORS yalnızca bu tam origin için açılır; kimlik bilgileri gönderilmez ve hesap/topluluk uç noktaları bu değişikliğe dahil değildir.

Fragman önizlemesi iki yayın adresinde de kullanılır. Masaüstünde kart üzerinde 650 ms beklendiğinde görselli önizleme açılır; fragman doğrulanınca sessiz oynar. Kaynak bulunamazsa açıklama gösterilir. Galeri gerçek TVmaze bölüm fotoğraflarını sezon/bölüm adıyla, ilk sezon önceliğiyle listeler. Eski Sites yayını yalnızca herkese açık medya için Vercel API'sini kullanır; bu origin için CORS izni hesap erişimi veya çerez aktarımı sağlamaz.

## Tek güncel yayın

Önceki `sahne-dizi-kesif.metealp.chatgpt.site` bağlantısı, dizi ve topluluk adresini koruyarak hesapların bulunduğu Vercel yayınına geçer. Kayıt: `#sahne/kayit`, giriş: `#sahne/giris`, forum: `#sahne/forum`. Üst menüde kayıt/giriş ve forum doğrudan görünür. Eski bağlantının `?legacy=1#sahne/arsiv` adresi önceki cihaz arşivini indirmek için korunur; yönlendirme yerel arşivi silmez veya başka adrese aktarmaz.
