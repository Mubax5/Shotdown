# Shotdown

Shotdown sekarang memakai **browser extension sebagai mode utama**, jadi tidak perlu buka browser/profile lain dan tidak perlu login WhatsApp dua kali.

## Cara pakai

1. Buka Chrome atau Edge yang biasa kamu pakai.
2. Buka halaman target, misalnya WhatsApp Web.
3. Klik icon **Shotdown**.
4. Hover area yang mau di-full screenshot.
5. Klik area tersebut untuk mengunci scrollable container.
6. Kalau target yang kepilih masih salah karena nested scroll, klik **Parent**.
7. Opsional: klik **Crop**, lalu drag area persis yang mau masuk hasil.
8. Pilih:
   - **Full / load to top** untuk mengambil dari histori paling atas yang bisa dimuat sampai bawah.
   - **Current to bottom** untuk mulai dari posisi sekarang.
9. Klik **Capture PDF**.

## Khusus kasus WhatsApp Web

Sidebar dan area chat adalah scrollable component yang berbeda. Shotdown tidak menebak sidebar seperti full-page screenshot biasa. Kamu sendiri yang memilih area chat.

Mode **Full / load to top** juga tidak langsung menganggap `scrollTop = 0` berarti histori sudah selesai. Shotdown:

- terus kembali ke atas;
- menunggu layout/DOM stabil;
- mengecek perubahan tinggi scroll dan fingerprint konten;
- baru mulai capture setelah beberapa kali benar-benar stabil.

Saat proses turun ke bawah, Shotdown juga tidak langsung berhenti ketika scroll sempat macet. Ia menunggu lazy-loaded content, menghitung ulang batas scroll, dan butuh beberapa pengecekan bottom yang stabil sebelum menganggap capture selesai.

## Hasil yang nyambung

Setiap screenshot dibuat dengan overlap. Shotdown membandingkan bagian bawah frame sebelumnya dengan bagian atas frame berikutnya untuk mencari seam visual terbaik di sekitar actual scroll delta.

Kalau seam belum meyakinkan, Shotdown menunggu render stabil lalu screenshot ulang sekali lagi sebelum memakai fallback. Tujuannya supaya pesan tidak dobel, tidak loncat, dan tidak muncul garis rusak di hasil.

## PDF

Default:

- target 2 PDF;
- maksimal 3 PDF;
- maksimal 3,000,000 byte per PDF;
- A4;
- kompresi adaptif;
- hasil otomatis masuk folder `Downloads\Shotdown`.

## Menjalankan

Double-click:

```text
run_extension.bat
```

Pertama kali saja:

1. aktifkan Developer mode;
2. klik **Load unpacked**;
3. pilih folder `extension`;
4. pin Shotdown.

Setelah terpasang, tidak perlu menjalankan app desktop. Buka website seperti biasa lalu klik icon Shotdown.

## Privasi

Semua capture dan pembuatan PDF dilakukan lokal di browser. Tidak ada server upload, telemetry, atau profile WhatsApp terpisah.
