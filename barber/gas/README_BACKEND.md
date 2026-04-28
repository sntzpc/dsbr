# Backend GAS Modular - Barbershop Booking System

Paket ini berisi backend Google Apps Script modular untuk aplikasi Barbershop berbasis Google Sheets.

## Urutan file yang disarankan di Apps Script

1. `00_Config.gs`
2. `01_Schema.gs`
3. `02_Code.gs`
4. `03_Setup.gs`
5. `04_Utils.gs`
6. `05_Auth.gs`
7. `06_Settings.gs`
8. `07_Operators.gs`
9. `08_Services.gs`
10. `09_Bookings.gs`
11. `10_Queue.gs`
12. `11_Payments.gs`
13. `12_Notifications.gs`
14. `13_Reports.gs`

## Cara instalasi

1. Buat Google Sheet baru.
2. Buka Extensions > Apps Script.
3. Buat file `.gs` sesuai nama di atas dan tempelkan isi file masing-masing.
4. Jika Apps Script tidak terikat langsung dengan Sheet, isi `APP_CONFIG.SPREADSHEET_ID` pada `00_Config.gs`.
5. Deploy sebagai Web App:
   - Execute as: Me
   - Who has access: Anyone
6. Jalankan URL Web App dengan parameter:
   `?action=setupDatabase`
7. Sheet dan header akan dibuat otomatis.

## Akun admin awal

- Phone: `08123456789`
- Password: `admin123`

Segera ganti password setelah frontend selesai dibuat.

## Contoh request JSON

```json
{
  "action": "login",
  "phone": "08123456789",
  "password": "admin123"
}
```

Untuk action yang memerlukan login, sertakan token:

```json
{
  "action": "listOperators",
  "token": "TOKEN_LOGIN"
}
```

## Catatan frontend

URL GAS dapat di-hardcode di file JavaScript frontend, misalnya:

```javascript
const GAS_URL = 'https://script.google.com/macros/s/xxxxx/exec';
```

Frontend tidak perlu menyediakan input URL GAS di halaman aplikasi.
