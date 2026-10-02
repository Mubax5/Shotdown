# Shotdown

Shotdown v0.4 adalah browser extension untuk **full screenshot scrollable area yang kamu pilih sendiri**, bukan aplikasi yang membuka browser/profile baru.

## Cara pakai

1. Buka Chrome/Edge yang biasa dipakai.
2. Buka halaman target.
3. Klik icon **Shotdown**.
4. Hover area yang ingin di-full screenshot.
5. Klik untuk mengunci target.
6. Kalau nested scroll salah target, klik **Parent**.
7. Kalau perlu, klik **Crop** lalu drag bagian yang ingin dipertahankan.
8. Pilih **Full / load to top** atau **Current to bottom**.
9. Klik **Capture PDF**.

Jaga tab target tetap aktif selama proses.

## Yang dimatangkan di v0.4

- screenshot browser di-throttle supaya tidak kena limit Chromium;
- setiap screenshot mengecek bahwa tab Shotdown masih tab aktif;
- kalau elemen target diganti/dihapus oleh web app, proses berhenti aman;
- loader histori atas menunggu DOM/layout benar-benar stabil;
- scroll yang macet sementara tidak langsung dianggap selesai;
- seam memakai **visual edge matching + actual scroll delta**;
- seam ambigu di-retry lalu fallback ke delta scroll terukur;
- animasi/transisi CSS dipause selama capture untuk mengurangi flicker;
- sticky header/footer yang benar-benar statis dideteksi konservatif dan hanya disimpan sekali;
- hasil tidak disatukan ke satu canvas raksasa;
- konten dialirkan ke halaman A4 selama proses supaya memori lebih aman;
- optimizer mencoba 2 PDF dulu, baru 3 PDF;
- ukuran final setiap PDF tetap diverifikasi;
- ada tombol **Cancel** selain tombol Esc;
- posisi scroll awal dikembalikan setelah selesai.

## WhatsApp Web

Ini tetap salah satu kasus utama Shotdown.

Sidebar dan chat adalah scroll container berbeda, jadi pilih sendiri area chat. Untuk chat panjang gunakan **Full / load to top**.

Shotdown tidak langsung menganggap posisi paling atas sebagai histori paling awal. Ia melakukan beberapa pass, menunggu perubahan DOM/layout, lalu baru mulai capture setelah histori stabil berkali-kali.

Saat turun, lazy-load yang sempat berhenti juga ditunggu dan di-retry.

## Output default

- 2 PDF dulu;
- maksimal 3 PDF;
- maksimal 3,000,000 byte per PDF;
- A4;
- hasil ke `Downloads\Shotdown`.

## Menjalankan

Double-click:

```text
run_extension.bat
```

Pertama kali saja:

1. Developer mode;
2. **Load unpacked**;
3. pilih folder `extension`;
4. pin Shotdown.

Untuk memaksa browser tertentu:

```text
run_extension.bat chrome
run_extension.bat edge
```

## Privasi

Capture dan pembuatan PDF dilakukan lokal. Tidak ada telemetry, upload server, atau browser profile WhatsApp kedua.
