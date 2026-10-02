# Shotdown — Panduan Bahasa Indonesia

Shotdown adalah tool desktop lokal untuk menangkap percakapan WhatsApp Web yang sangat panjang lalu mengemasnya menjadi **2–3 file PDF** dengan batas ukuran yang ketat per file.

Tool ini dibuat untuk kasus ketika full-page screenshot extension berhenti di tengah, mengulang bagian chat, melewatkan pesan, atau menghasilkan garis/area rusak. WhatsApp Web memakai scroll container sendiri dan me-render histori chat secara dinamis.

## Default untuk bukti upload

- Jumlah PDF: **auto**, coba 2 dulu lalu 3 bila perlu.
- Batas per PDF: **3.00 MB / 3,000,000 byte**.
- Maksimum file: **3**.
- Ukuran halaman: **A4**.
- Warna: aktif.

## Cara pakai di Windows

1. Jalankan `setup_windows.bat` sekali.
2. Jalankan `run_windows.bat`.
3. Klik **Open WhatsApp**.
4. Login bila perlu dan buka chat target.
5. Klik **Check**.
6. Klik **Start capture**.
7. Tunggu proses scroll, screenshot, stitch, kompresi, dan verifikasi PDF selesai.

## UI

Shotdown sengaja dibuat minimal dan netral:

- light mode dominan putih;
- dark mode abu gelap;
- tanpa gradient/dekorasi berlebihan;
- pengaturan Export dan Capture dipisah;
- theme tersimpan otomatis.

## Privasi

Shotdown tidak punya telemetry atau server upload. Screenshot dan PDF diproses lokal.

Sesi WhatsApp Web tersimpan di:

```text
%USERPROFILE%\.shotdown\browser_profile
```

Folder tersebut sensitif karena dapat berisi sesi WhatsApp Web yang masih login. Jangan upload folder itu ke GitHub atau membagikannya.

Shotdown tidak terafiliasi dengan WhatsApp atau Meta.
