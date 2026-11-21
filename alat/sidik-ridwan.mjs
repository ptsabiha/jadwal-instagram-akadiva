// Sidik suara Ridwan (untuk narasi reels) disimpan terenkripsi di rahasia/sidik-ridwan.json, dengan gembok yang sama
// seperti token Instagram (rahasia/kunci-publik.pem). Hanya GitHub Actions (KUNCI_PRIVAT di Secrets) yang bisa membukanya.
//   node alat/sidik-ridwan.mjs kunci <ridwan.pth>     (di PC pemilik: mengunci berkas sidik)
//   node alat/sidik-ridwan.mjs buka <keluar.pth>      (di GitHub Actions: membuka ke berkas sementara)
import fs from 'node:fs';
import path from 'node:path';
import { AKAR } from './umum.mjs';
import { sandikan, bukaSandi, bacaKunciPublik, kunciPrivatDariEnv } from './rahasia.mjs';

const BERKAS = path.join(AKAR, 'rahasia', 'sidik-ridwan.json');
const [perintah, jalur] = process.argv.slice(2);
if (perintah === 'kunci') {
  const isi = fs.readFileSync(jalur).toString('base64');
  fs.writeFileSync(BERKAS, JSON.stringify({ isi: 'sidik suara Ridwan (OpenVoice, base64)', ...sandikan(isi, bacaKunciPublik()) }, null, 2) + '\n');
  console.log('🔒 Sidik suara dikunci ke rahasia/sidik-ridwan.json');
} else if (perintah === 'buka') {
  const b = JSON.parse(fs.readFileSync(BERKAS, 'utf8'));
  fs.mkdirSync(path.dirname(path.resolve(jalur)), { recursive: true });
  fs.writeFileSync(jalur, Buffer.from(bukaSandi(b, kunciPrivatDariEnv()), 'base64'));
  console.log('🔓 Sidik suara dibuka');
} else {
  console.error('pakai: node alat/sidik-ridwan.mjs kunci <ridwan.pth> | buka <keluar.pth>'); process.exit(2);
}
