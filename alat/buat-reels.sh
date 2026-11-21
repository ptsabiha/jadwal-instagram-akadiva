#!/bin/sh
# Dipanggil workflow "Pembuat Reels" (GitHub Actions). Setiap folder reels-masuk/<YYYY-MM-DD HH.MM Judul>/ yang berisi
# konten.json + caption.txt dan belum punya status.txt dibuatkan videonya (Suara Ridwan, papan kapur), diperiksa, lalu
# diantrekan di jamnya sebagai reels yang langsung disetujui (keputusan pemilik 21 Nov 2026: terbit otomatis).
# Butuh env: LIB (pustaka Lemo-Opuscar), SUARA_PY (Python berisi torch, edge-tts, faster-whisper).
set -u
AKAR=$(cd "$(dirname "$0")/.." && pwd); cd "$AKAR"
OK=0; GAGAL=0; IDS=""
for d in reels-masuk/*/; do
  [ -f "$d/konten.json" ] || continue
  [ -f "$d/status.txt" ] && continue
  nama=$(basename "$d"); tgl=$(echo "$nama" | cut -d' ' -f1); jam=$(echo "$nama" | cut -d' ' -f2 | tr . :); judul=$(echo "$nama" | cut -d' ' -f3-)
  echo "::group::$nama"
  mulai=$(date +%s)
  sh pembuat-reels/_reels/buat-reel.sh "$d" 2>&1 | grep -vE "READY|no console errors|debug:"
  detik=$(( $(date +%s) - mulai ))
  echo "::endgroup::"
  if grep -q "^SIAP" "$d/cek.txt" 2>/dev/null; then
    keluar=$(node alat/jadwal.mjs tambah "$d" --judul "$judul" --grup "reels-$tgl" --waktu "$tgl $jam" --senyap 2>&1); echo "$keluar"
    id=$(echo "$keluar" | sed -n 's/.*\[\([^]]*\)\]$/\1/p' | tail -1)
    if [ -n "$id" ]; then
      echo "siap $(date -u +%FT%TZ) ${detik}s $id" > "$d/status.txt"; OK=$((OK + 1)); IDS="$IDS $id"
    else echo "gagal antre $(date -u +%FT%TZ)" > "$d/status.txt"; GAGAL=$((GAGAL + 1)); fi
  else
    echo "gagal $(date -u +%FT%TZ) ${detik}s" > "$d/status.txt"; GAGAL=$((GAGAL + 1))
    echo "::error::Reels gagal: $nama"; tail -8 "$d/cek.txt" 2>/dev/null
  fi
done
# approve exactly the new reels by id (draf -> menunggu); a group may already hold approved posts, which "setujui --grup"
# refuses (22 Nov 2026: two re-made reels were lost that way). This also commits and pushes the queue.
if [ -n "$IDS" ] && ! node alat/jadwal.mjs setujui $IDS --tanpa-uji; then
  echo "::error::Menyetujui gagal; draf tetap disimpan"; git add antrian; git commit -q -m "📝 Draf reels (belum disetujui):$IDS" || true
  git pull -q --rebase && git push -q; GAGAL=$((GAGAL + 1))
fi
# keep the outcome of every folder (status.txt, cek.txt, sampul, subtitle) in the repo; videos and voice stay out (.gitignore)
git add reels-masuk
git diff --cached --quiet || { git commit -q -m "🎬 Pembuat reels: $OK siap, $GAGAL gagal"; git pull -q --rebase && git push -q; }
echo "Selesai: $OK reels diantrekan, $GAGAL gagal"
[ $GAGAL -eq 0 ]
