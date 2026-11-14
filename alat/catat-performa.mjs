// Pencatat performa Instagram. Jalan tiap hari di GitHub Actions (performa.yml), atau manual.
// Membaca angka tiap postingan @akadiva.app (jangkauan, tayangan, suka, komentar, simpan, bagikan)
// dan jumlah pengikut, lalu menyimpannya ke performa/terbaru.json dan performa/riwayat/<tanggal>.json.
// Dipakai skill akadiva-konten-mingguan untuk analisis setiap Senin.
//
// Butuh izin token: instagram_business_basic (+ instagram_business_manage_insights untuk angka insights).
// Kalau izin insights belum ada, angka suka/komentar tetap tercatat dan berkas menandai "izin_insights": false.
import fs from 'node:fs';
import path from 'node:path';
import { buatKlien, jelaskanGalat } from './ig.mjs';
import { bacaBerkasToken, kunciPrivatDariEnv, bukaSandi } from './rahasia.mjs';
import { AKAR, commitDanPush, isoZona, formatWIB } from './umum.mjs';

const METRIK = ['reach', 'views', 'likes', 'comments', 'saved', 'shares', 'total_interactions'];
const DIR = path.join(AKAR, 'performa');

async function utama() {
  const berkas = bacaBerkasToken();
  if (!berkas) throw new Error('Token Instagram belum dipasang.');
  const token = bukaSandi(berkas, kunciPrivatDariEnv());
  if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${token}`);
  const ig = buatKlien(token);

  const saya = await ig.get('/me', { fields: 'user_id,username,followers_count,follows_count,media_count' });
  const media = [];
  let halaman = await ig.get('/me/media', { fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count', limit: '50' });
  for (let i = 0; i < 4 && halaman; i++) {
    media.push(...(halaman.data || []));
    halaman = halaman.paging?.next && media.length < 200 ? await fetch(halaman.paging.next).then((r) => r.json()) : null;
  }

  let izinInsights = true;
  for (const m of media) {
    m.caption_awal = String(m.caption || '').split('\n')[0].slice(0, 120);
    m.panjang_caption = String(m.caption || '').length;
    delete m.caption;
    m.insights = {};
    if (!izinInsights) continue;
    for (const metrik of METRIK) {
      try {
        const r = await ig.get(`/${m.id}/insights`, { metric: metrik });
        m.insights[metrik] = r.data?.[0]?.values?.[0]?.value ?? r.data?.[0]?.total_value?.value ?? null;
      } catch (e) {
        if (e.kode === 10 || e.kode === 200 || /permission/i.test(e.message)) { izinInsights = false; break; }
        m.insights[metrik] = null; // metrik tidak tersedia untuk jenis media ini
      }
    }
    const r = m.insights.reach;
    const interaksi = m.insights.total_interactions ?? (m.like_count || 0) + (m.comments_count || 0);
    if (r) m.insights.tingkat_interaksi_persen = +((interaksi / r) * 100).toFixed(2);
  }

  const kini = new Date();
  const hasil = {
    diambil: isoZona(kini),
    akun: saya.username,
    pengikut: saya.followers_count ?? null,
    mengikuti: saya.follows_count ?? null,
    jumlah_postingan: saya.media_count ?? media.length,
    izin_insights: izinInsights,
    catatan: izinInsights ? '' : 'Token belum punya izin instagram_business_manage_insights. Hanya suka & komentar yang tercatat.',
    media,
  };
  fs.mkdirSync(path.join(DIR, 'riwayat'), { recursive: true });
  const isi = JSON.stringify(hasil, null, 2) + '\n';
  fs.writeFileSync(path.join(DIR, 'terbaru.json'), isi);
  fs.writeFileSync(path.join(DIR, 'riwayat', `${isoZona(kini).slice(0, 10)}.json`), isi);
  console.log(`Akun @${saya.username}: ${hasil.pengikut ?? '?'} pengikut, ${media.length} postingan tercatat. Insights: ${izinInsights ? 'ya' : 'BELUM ADA IZIN'}.`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Pencatat performa · ${formatWIB(hasil.diambil)}\n\n- @${saya.username}: ${hasil.pengikut ?? '?'} pengikut, ${media.length} postingan\n- Insights: ${izinInsights ? 'ya' : 'belum ada izin'}\n`);
  }
  if (process.env.GITHUB_ACTIONS) commitDanPush(`📊 Performa ${isoZona(kini).slice(0, 10)}`, ['performa']);
}

utama().catch((e) => {
  console.log(`❌ ${e.kode ? jelaskanGalat(e) : e.message}`);
  process.exitCode = 1;
});
