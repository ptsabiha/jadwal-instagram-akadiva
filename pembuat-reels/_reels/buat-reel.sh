#!/bin/sh
# Satu reels Akadiva gaya papan kapur + Suara Ridwan, dari <folder>/konten.json sampai <folder>/reel.mp4.
#   sh _reels/buat-reel.sh "<folder reels>"
# Laptop: LIB, SUARA_PY, SUARA_CK diisi otomatis di bawah. Cloud: jalankan dulu _reels/siapkan-cloud.sh (mencetak nilainya).
# Hasil di folder reels: reel.mp4 (siap unggah), sampul.jpg, subtitle.srt, cek.txt (semua pemeriksaan), vo/ (narasi).
set -e
REEL=$(cd "$1" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd); TPL="$HERE/cetakan"; KERJA="$TPL/_kerja"
REPO=$(cd "$HERE/.." && pwd)
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*)
  LIB=${LIB:-/c/Users/HEGARMANAH/lemo-opuscar}
  M="/d/PT SABIHA-Ammar/9 Operasional dan Cadangan/Suara Ridwan/mesin"
  SUARA_PY=${SUARA_PY:-$M/venv/Scripts/python.exe}; SUARA_CK=${SUARA_CK:-$M/checkpoints_v2/converter}; export PYTHONUTF8=1 ;;
esac
LIB=${LIB:-$HOME/lemo-opuscar}; export LIB SUARA_CK
PY="$LIB/.venv/bin/python"; SIZE=1080x1920; FPS=30
[ -f "$LIB/core/render/video.mjs" ] || { echo "GAGAL: pustaka film tidak ada di $LIB (jalankan _reels/siapkan-cloud.sh)"; exit 1; }
[ -n "$SUARA_PY" ] || { echo "GAGAL: SUARA_PY kosong (jalankan _reels/siapkan-cloud.sh)"; exit 1; }
CEK="$REEL/cek.txt"; : > "$CEK"
log() { echo "$*"; echo "$*" >> "$CEK"; }

log "== $(basename "$REEL")"
"$PY" "$HERE/cek_konten.py" "$REEL/konten.json" | tee -a "$CEK"

# 1. narasi Suara Ridwan (dipakai ulang kalau konten tidak berubah)
SIG=$("$PY" -c "import json,hashlib,sys;print(hashlib.md5(json.dumps(json.load(open(sys.argv[1],encoding='utf-8'))['narasi'],sort_keys=True).encode()).hexdigest())" "$REEL/konten.json")
if [ "$(cat "$REEL/vo/.sig" 2>/dev/null)" != "$SIG" ]; then
  log "-- membuat narasi Suara Ridwan"
  "$PY" -c "import json,sys;K=json.load(open(sys.argv[1],encoding='utf-8'));json.dump(K['narasi'],open(sys.argv[2],'w',encoding='utf-8'),ensure_ascii=False,indent=1)" "$REEL/konten.json" "$REEL/lines.json"
  rm -rf "$REEL/vo"; "$SUARA_PY" "$REPO/_suara-ridwan/suara_ridwan.py" narasi "$REEL/lines.json" "$REEL/vo" 2>&1 | grep -E "^n[0-9]+ |PERINGATAN" | tee -a "$CEK"
  echo "$SIG" > "$REEL/vo/.sig"
fi

# 2. folder kerja di dalam cetakan (halaman hanya bisa membaca berkas di folder proyeknya)
rm -rf "$KERJA"; mkdir -p "$KERJA"; cp "$REEL/konten.json" "$KERJA/"; cp -r "$REEL/vo" "$KERJA/vo"
cd "$LIB"
node core/render/events.mjs "$TPL" --size $SIZE --q "kerja=_kerja" --out "$KERJA/events.json" 2>&1 | grep -E "^events|rror" | tee -a "$CEK"
if node core/render/readcheck.mjs "$TPL" --size $SIZE --q "kerja=_kerja" > "$KERJA/readcheck.txt" 2>&1; then log "readcheck ok"
else grep -vE "^OK|READY|console|debug" "$KERJA/readcheck.txt" | tee -a "$CEK"; log "GAGAL: tulisan papan terlalu cepat hilang"; exit 1; fi

# 3. suara: narasi + kapur, tanpa musik
KERJA_DIR="$KERJA" EVENTS=events.json VODIR=vo MIXOUT=mix.wav LUFS_TARGET=-14 "$PY" "$TPL/audio.py" 2>&1 | tail -1 | tee -a "$CEK"

# 4. gambar (persen per 10 %), gabung, perkecil untuk Instagram
node core/render/video.mjs "$TPL" --fps $FPS --size $SIZE --workers ${WORKERS:=3} --q "kerja=_kerja" --out "$KERJA/video.mp4" 2>&1 | awk -v W=$WORKERS '
  /^w[0-9]+ [0-9]+\/[0-9]+/ { split($2, a, "/"); d[$1] = a[1]; t[$1] = a[2]; s = 0; T = 0; n = 0; for (k in d) { s += d[k]; T += t[k]; n++ }
    if (n < W) T = T / n * W; p = s / T * 100; b = int(p / 10); if (b > last) { printf "render %d%%\n", b * 10; fflush(); last = b }; next }
  /^done/ { print "render 100%"; fflush(); next } /rror/ { print; fflush() }'
# picture + sound in one encode (the mix is already at -14 LUFS, true peak under -2 dBFS); works with ffmpeg 6 and 7
ffmpeg -v error -y -i "$KERJA/video.mp4" -i "$KERJA/mix.wav" -map 0:v:0 -map 1:a:0 -c:v libx264 -preset medium -crf 26 -maxrate 4M -bufsize 8M   -pix_fmt yuv420p -r $FPS -c:a aac -b:a 128k -ar 48000 -shortest -movflags +faststart "$REEL/reel.mp4" || { log "GAGAL: menggabung suara"; exit 1; }

# 5. sampul, subtitle, pemeriksaan akhir
# cover: the question and the wrong answer fully written, just before the wipe (also Instagram's thumb_offset)
TS=$("$PY" -c "import json,sys;e=json.load(open(sys.argv[1],encoding='utf-8'))['ev'];print(round(next(x['t'] for x in e if x['type']=='wipe')-.15,2))" "$KERJA/events.json")
echo "$TS" > "$REEL/sampul-detik.txt"
# the designed cover (same layout for every reel: theme, title, Akadiva card; tidy profile grid) -> Instagram cover_url
node core/render/still.mjs "$TPL" 0 --size $SIZE --q "kerja=_kerja&sampul" --out "$KERJA" --prefix sampul_ > /dev/null 2>&1 && cp "$KERJA/sampul_0.jpg" "$REEL/sampul.jpg" \
  || { log "GAGAL: sampul tidak bisa dibuat"; exit 1; }
"$PY" - "$KERJA/events.json" "$REEL/subtitle.srt" <<'PYEOF'
import json, sys
ev = sorted((e for e in json.load(open(sys.argv[1], encoding='utf-8'))['ev'] if e['type'] == 'sub'), key=lambda e: e['t'])
f = lambda s: (lambda ms: f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}")(int(round(max(0, s) * 1000)))
open(sys.argv[2], 'w', encoding='utf-8').write('\n'.join(f"{k + 1}\n{f(e['t'])} --> {f(min(e['t1'], ev[k + 1]['t']) if k + 1 < len(ev) else e['t1'])}\n{e['text']}\n" for k, e in enumerate(ev)))
PYEOF
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$REEL/reel.mp4")
MB=$(du -m "$REEL/reel.mp4" | cut -f1)
BLACK=$(ffmpeg -hide_banner -i "$REEL/reel.mp4" -vf blackdetect=d=0.3:pix_th=0.05 -an -f null - 2>&1 | grep -c black_start || true)
LUFS=$(ffmpeg -hide_banner -i "$REEL/reel.mp4" -af ebur128 -vn -f null - 2>&1 | grep -E "^\s+I:" | tail -1 | awk '{print $2}')
log "durasi ${DUR}s, ${MB} MB, frame hitam: $BLACK, suara $LUFS LUFS"
[ "$BLACK" = 0 ] || { log "GAGAL: ada frame hitam"; exit 1; }
"$PY" -c "import sys; d=float(sys.argv[1]); sys.exit(0 if 20 <= d <= 90 else 1)" "$DUR" || { log "GAGAL: durasi di luar 20–90 detik"; exit 1; }
[ "$MB" -le 90 ] || { log "GAGAL: berkas lebih dari 90 MB"; exit 1; }
log "SIAP: $REEL/reel.mp4"
