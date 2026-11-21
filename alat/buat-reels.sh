#!/bin/sh
# Dipanggil workflow "Pembuat Reels" (GitHub Actions). Setiap folder reels-masuk/<YYYY-MM-DD HH.MM Judul>/ yang berisi
# konten.json + caption.txt dan belum punya status.txt dibuatkan videonya (Suara Ridwan, papan kapur), diperiksa, lalu
# diantrekan di jamnya sebagai reels yang langsung disetujui (keputusan pemilik 21 Nov 2026: terbit otomatis).
# Butuh env: LIB (pustaka Lemo-Opuscar), SUARA_PY (Python berisi torch, edge-tts, faster-whisper).
set -u
AKAR=$(cd "$(dirname "$0")/.." && pwd); cd "$AKAR"
OK=0; GAGAL=0; GRUP=""
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
    if node alat/jadwal.mjs tambah "$d" --judul "$judul" --grup "reels-$tgl" --waktu "$tgl $jam" --senyap; then
      echo "siap $(date -u +%FT%TZ) ${detik}s" > "$d/status.txt"; OK=$((OK + 1)); GRUP="$GRUP reels-$tgl"
    else echo "gagal antre $(date -u +%FT%TZ)" > "$d/status.txt"; GAGAL=$((GAGAL + 1)); fi
  else
    echo "gagal $(date -u +%FT%TZ) ${detik}s" > "$d/status.txt"; GAGAL=$((GAGAL + 1))
    echo "::error::Reels gagal: $nama"; tail -8 "$d/cek.txt" 2>/dev/null
  fi
done
# approve every group that got a new reel (draf -> menunggu); this also commits and pushes the queue
for g in $(echo "$GRUP" | tr ' ' '\n' | sort -u); do node alat/jadwal.mjs setujui --grup "$g" --tanpa-uji; done
# keep the outcome of every folder (status.txt, cek.txt, sampul, subtitle) in the repo; videos and voice stay out (.gitignore)
git add reels-masuk
git diff --cached --quiet || { git commit -q -m "🎬 Pembuat reels: $OK siap, $GAGAL gagal"; git pull -q --rebase && git push -q; }
echo "Selesai: $OK reels diantrekan, $GAGAL gagal"
[ $GAGAL -eq 0 ]
