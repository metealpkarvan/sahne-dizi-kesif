# Sahne — Dizi keşif ve izleme günlüğü

Sahne, yeni diziler keşfetmek, beğenilere göre öneriler almak ve izleme listenizi düzenlemek için hazırlanmış Türkçe bir dizi keşif arayüzüdür.

Canlı sürüm: https://sahne-dizi-kesif.metealp.chatgpt.site/

## Özellikler

- Popüler, yeni ve yüksek puanlı diziler için görsel keşif rafları
- TVmaze kataloğunda dizi arama ve başlık detayları
- Beğeni sinyallerine göre kişiselleştirilmiş öneriler
- Daha sonra izlemek üzere kaydetme ve kişisel dizi listeleri
- Ülkeye göre izleme seçenekleri ve JustWatch arama bağlantıları
- Sezon, bölüm, oyuncu ve dizi bilgileri
- Mobil uyumlu arayüz ve tarayıcı geri hareketi desteği

## Yerel çalıştırma

Bu depo, sitenin statik dağıtım dosyalarını içerir; ayrıca paket kurulumu veya derleme adımı gerekmez. Python kuruluysa depo klasöründe şu komutla yerel sunucu başlatabilirsiniz:

```sh
python3 -m http.server 4173
```

Ardından `http://localhost:4173` adresini açın. Bazı katalog ve izleme bilgileri internet bağlantısı gerektirir.

## Veri ve medya

Dizi kataloğu TVmaze verilerinden yararlanır. İzleme seçenekleri ve görseller ilgili servislerin kaynaklarına bağlıdır; güncellik ve kullanılabilirlik ülkeye göre değişebilir. Dizi görsellerinin ve marka adlarının hakları ilgili sahiplerine aittir.
