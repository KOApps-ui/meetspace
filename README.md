# 🎥 MeetSpace — Ücretsiz Video Konferans

<div align="center">

**Zoom gibi ama daha basit, daha hızlı.**
**Hesap açma. Uygulama indirme. Sadece bağlan.**

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Canlı-brightgreen?logo=github)](https://koapps-ui.github.io/meetspace/)
[![License](https://img.shields.io/badge/Lisans-Ücretsiz-blue)]()
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P-orange?logo=webrtc)]()

---

### [🚀 Şimdi Kullan →](https://koapps-ui.github.io/meetspace/)

</div>

---

## ✨ Özellikler

| Özellik | Açıklama |
|---------|----------|
| 📹 **Video & Ses** | WebRTC ile yüksek kaliteli, düşük gecikmeli görüntülü görüşme |
| 🖥️ **Ekran Paylaşımı** | Tek tıkla ekranını paylaş |
| 👥 **10 Kişiye Kadar** | Otomatik grid düzeni — kişi sayısına göre ayarlanır |
| 🔒 **Şifreli P2P** | Veriler doğrudan tarayıcıdan tarayıcıya gider, sunucu görmez |
| 📱 **Mobil Uyumlu** | Telefon, tablet, bilgisayar — her cihazda çalışır |
| ⚡ **Anlık Bağlantı** | Kayıt yok, indirme yok. Link ile anında toplantı |

---

## 🎯 Nasıl Kullanılır?

### 1. Toplantı Başlat
- Siteyi aç → İsmini gir → **"Yeni Oda Oluştur"**
- 6 haneli oda kodu otomatik oluşturulur

### 2. Katılımcıları Davet Et
- Oda kodunu veya linki paylaş
- Katılımcılar aynı adrese girip kodu yazınca bağlanır

### 3. Toplantı Yap!
- 🎤 Mikrofon aç/kapat
- 📷 Kamera aç/kapat
- 🖥️ Ekran paylaş
- 🔴 Toplantıyı bitir

---

## 🛠️ Teknik Altyapı

```
Kullanıcı A ──┐
Kullanıcı B ──┼──► PeerJS Cloud (sinyal) ──► Doğrudan P2P Bağlantı
Kullanıcı C ──┘         (eşleştirme)          (video/ses akışı)
```

| Bileşen | Teknoloji |
|---------|-----------|
| Video İletimi | **WebRTC** (Peer-to-Peer) |
| Sinyal Sunucusu | **PeerJS Cloud** (ücretsiz) |
| NAT Geçişi | Google STUN + OpenRelay TURN |
| Hosting | **GitHub Pages** (ücretsiz) |
| Framework | **Vanilla JS** — sıfır bağımlılık |

---

## 🌐 Tarayıcı Desteği

| Chrome | Firefox | Edge | Safari | Opera |
|:------:|:-------:|:----:|:------:|:-----:|
| ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 📋 Dosya Yapısı

```
meetspace/
├── index.html   → Giriş ve oda oluşturma sayfası
├── room.html    → Video konferans odası
├── style.css    → Dark tema, glassmorphism tasarım
├── app.js       → WebRTC/PeerJS bağlantı mantığı
└── README.md    → Bu dosya
```

---

## ❓ SSS

**S: Sunucu maliyeti var mı?**
H: Hayır! GitHub Pages ücretsiz hosting sağlar, video verisi doğrudan P2P akar.

**S: Güvenli mi?**
C: WebRTC uçtan uca şifreli çalışır. Video/ses verileri hiçbir sunucudan geçmez.

**S: Kaç kişi bağlanabilir?**
C: Mesh topoloji ile max 10 kişi. Her katılımcı herkese doğrudan bağlanır.

**S: Telefonda çalışır mı?**
C: Evet! Responsive tasarım sayesinde mobil tarayıcıda sorunsuz çalışır.

---

<div align="center">

**MeetSpace** — Açık kaynak, ticari değil, tamamen ücretsiz.

Made with ❤️

</div>
