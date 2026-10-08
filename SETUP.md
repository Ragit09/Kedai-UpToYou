# Setup Firebase

1. Di Firebase Console, aktifkan **Authentication > Sign-in method > Email/Password**.
2. Buka **Firestore Database > Rules**, salin isi `firestore.rules`, lalu terbitkan.
3. Buat akun administrator melalui **Authentication > Users > Add user**.
4. Salin UID akun administrator. Di Firestore, buat dokumen `users/{UID}` dengan data:

   ```json
   {
     "role": "admin"
   }
   ```

5. Admin masuk melalui `login.html`, lalu membuat member dari dashboard admin. Isi nama, email, WhatsApp, alamat, dan password login pada form member.
6. Dashboard membuat akun Email/Password di Firebase Authentication sekaligus dokumen role `customer` dan data member yang saling terhubung.
7. Admin dan member masuk melalui `login.html`. Role di `users/{UID}` menentukan dashboard yang dibuka.

Pembuatan akun member hanya dapat dilakukan admin melalui dashboard. Jangan memberikan hak tulis koleksi `users` kepada pengguna biasa.

Email login member terhubung dengan Firebase Authentication dan tidak dapat diganti dari form edit admin. Sebelum menghapus member yang memiliki akun login, hapus juga akun Authentication melalui Firebase Console agar emailnya dapat digunakan kembali.

Profil customer bersifat baca-saja. Perubahan nama, WhatsApp, dan alamat hanya dapat dilakukan admin dari dashboard admin; customer hanya dapat mengganti password dari menu Profil.

Dashboard member menghitung transaksi dan penukaran dari koleksi `memberTransactions`. Pencatatan dimulai saat transaksi kasir memakai versi aplikasi ini; transaksi lama tidak dapat dihitung ulang dari saldo poin saja.
