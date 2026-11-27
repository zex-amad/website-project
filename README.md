# website-project

## Draf artikel automatik (/panduan)

- `data/kata-kunci/topik.json` – senarai topik (satu topik = satu artikel; kata kunci serupa digabung).
- `data/kata-kunci/peta-kata-kunci.json` – peta kata kunci pesaing ke halaman sasaran, dan yang diabaikan.
- `scripts/tulis-panduan.mjs` – tulis satu draf dengan Gemini (peringkat percuma) guna data sebenar dari Supabase.
- `.github/workflows/tulis-panduan.yml` – setiap hari 6:23 pagi; tulis draf baharu **hanya jika tiada draf lain menunggu**, kemudian buka Pull Request berlabel `draf-panduan`.
- Draf mengandungi penanda `[[ZACK: ...]]`. `build-site.mjs` tidak menerbitkan artikel selagi penanda itu ada. Zack ganti dengan pengalaman sebenar, semak angka, kemudian Merge.
- Tutup (Close) PR = topik ditolak dan tidak ditulis semula.

Persediaan: secret `GEMINI_API_KEY`; Settings › Actions › General › "Allow GitHub Actions to create and approve pull requests". Pilihan: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ZACK_CHAT_ID` (chat peribadi, bukan channel).
