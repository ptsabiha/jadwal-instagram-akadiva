"""Suara Ridwan: narasi bahasa Indonesia dengan warna dan gaya bicara Ridwan (pemilik PT SABIHA).

Gaya baku sejak 21 Nov 2026 (pilihan pemilik "1C / I1"): edge-tts en-US-BrianMultilingualNeural (suara percakapan, jauh
lebih luwes daripada Ardi) membacakan teks satu kalimat sekali ucap, nada +10 Hz (≈139 Hz, nada Ridwan); kata yang sering
salah diucapkan diganti ejaannya lewat kamus-ucapan.json (dipelajari belajar_ucapan.py); OpenVoice V2 ToneColorConverter
(MIT) mengganti warna suaranya dengan sidik suara Ridwan (tau 0,1); lalu desis "s" diredam dan diberi sedikit kehangatan.
Antarkalimat diberi jeda 0,45 s. Tiap baris dibuat 2 varian, faster-whisper memilih yang paling jelas.
Gaya lama (Ardi + penataan jeda) tetap ada: SUARA_GAYA=ardi.

Gaya bicara Ridwan (diukur 21 Nov 2026 dari rekaman 8,5 menit): nada dasar 139 Hz (Ardi 110 Hz), 5,0 suku kata/detik
saat bicara (4,0 termasuk jeda), jeda median 0,41 s, p75 0,71 s.

  python suara_ridwan.py narasi lines.json out/     # out/<id>.wav, out/dur.json, out/pilihan.json
  python suara_ridwan.py uji                        # 3 kalimat percobaan -> uji/
  python suara_ridwan.py siapkan                    # unduh berkas model (sekali)

lines.json: [{"id": "n1", "text": "teks subtitle", "say_ridwan": "teks ucapan, koma = jeda frasa", "kunci": ["kata", "penting"]}]
("say_ridwan" boleh kosong: dipakai "say", lalu "text". "kunci" = kata yang wajib terdengar jelas.)
Butuh: torch (CPU), librosa, soundfile, numpy, edge-tts, faster-whisper, ffmpeg. Internet untuk edge-tts.
"""
import sys, os, json, types, asyncio, subprocess, argparse, re, difflib, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.modules['openvoice.text'] = types.SimpleNamespace(text_to_sequence=None)   # only the converter is used: skip the text front-end
sys.modules['wavmark'] = types.SimpleNamespace(load_model=lambda: types.SimpleNamespace(to=lambda d: None))   # optional watermark: not installed

GAYA = os.environ.get('SUARA_GAYA', 'brian')
BRIAN, PITCH_BRIAN = 'en-US-BrianMultilingualNeural', '+10Hz'
VOICE = BRIAN if GAYA == 'brian' else 'id-ID-ArdiNeural'
KAMUS_UCAPAN = os.path.join(HERE, 'kamus-ucapan.json')
ASLI, PITCH_ASLI = 'id-ID-ArdiNeural', '+29Hz'
# opening interjections are spoken by the native Indonesian voice (also turned into Ridwan's timbre) and joined to Brian's
# sentence: the owner's choice "N3" (21 Nov 2026) for "Nah"; the same rule holds for every interjection in this list
KATA_SERU = {'nah', 'lho', 'loh', 'wah', 'yuk', 'ayo', 'eh', 'duh', 'aduh', 'lha', 'wow', 'oh', 'hmm',
             # ordinal openers too: Brian read "Keempat" as "Himpad" (reels 22 Nov 2026), so they get the same treatment
             'pertama', 'kedua', 'ketiga', 'keempat', 'kelima', 'terakhir', 'padahal', 'jadi', 'akhirnya'}
CK = os.environ.get('SUARA_CK') or os.path.join(HERE, 'checkpoints_v2', 'converter')
CK_URL = 'https://huggingface.co/myshell-ai/OpenVoiceV2/resolve/main/converter/'
SE = os.path.join(HERE, 'sidik')
# the three variants tried for every line: (edge-tts pitch, converter tau). +29 Hz = Ridwan's pitch, +15 Hz = halfway.
VARIAN = [(PITCH_BRIAN, .1), (PITCH_BRIAN, .15)] if GAYA == 'brian' else [('+29Hz', .1), ('+29Hz', .3), ('+15Hz', .1)]
RATE = os.environ.get('RIDWAN_RATE', '+0%' if GAYA == 'brian' else '-6%')

def siapkan():
    os.makedirs(CK, exist_ok=True)
    for f in ('config.json', 'checkpoint.pth'):
        p = os.path.join(CK, f)
        if not os.path.exists(p) or os.path.getsize(p) < 100:
            print('unduh', f); urllib.request.urlretrieve(CK_URL + f, p + '.part'); os.replace(p + '.part', p)

_conv = None
def conv():
    global _conv
    if _conv is None:
        siapkan()
        import torch; torch.set_num_threads(max(1, os.cpu_count() or 1))
        from openvoice.api import ToneColorConverter
        _conv = ToneColorConverter(os.path.join(CK, 'config.json'), device='cpu'); _conv.load_ckpt(os.path.join(CK, 'checkpoint.pth'))
    return _conv

async def _tts(text, path, rate, pitch):
    import edge_tts
    await edge_tts.Communicate(text, VOICE, rate=rate, pitch=pitch).save(path)
def tts(text, wav, rate, pitch):
    mp3 = wav[:-4] + '.mp3'
    for k in range(4):                                         # the online service sometimes drops a request
        try: asyncio.run(_tts(text, mp3, rate, pitch)); break
        except Exception as e:
            if k == 3: raise
            print('edge-tts ulang:', type(e).__name__)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-ac', '1', '-ar', '22050', wav], check=True); os.remove(mp3)

def sidik(pitch):
    import torch
    src = os.path.join(SE, ('brian' if VOICE == BRIAN else 'ardi') + pitch.replace('+', 'p').replace('-', 'm') + '.pth')
    if not os.path.exists(src):                                # Ardi's fingerprint at this pitch: 5 sentences, made once
        tmp = os.path.join(SE, '_ardi' + pitch); os.makedirs(tmp, exist_ok=True); ws = []
        for i, t in enumerate(['Selamat pagi, Bapak dan Ibu pengurus yayasan, hari ini kita membahas laporan keuangan sekolah.',
                               'Setiap rupiah dari wali murid harus tercatat dengan rapi dan bisa dipertanggungjawabkan.',
                               'Guru yang dihargai akan mengajar dengan sepenuh hati, dan murid ikut merasakannya.',
                               'Kabar anak sampai ke rumah setiap hari, bukan hanya saat pembagian rapor.',
                               'Mari kita mulai dari langkah yang paling sederhana, bersama-sama.']):
            w = os.path.join(tmp, f'a{i}.wav'); tts(t, w, '+4%', pitch); ws.append(w)
        conv().extract_se(ws, se_save_path=src)
    return torch.load(src, map_location='cpu'), torch.load(os.path.join(SE, 'ridwan.pth'), map_location='cpu')

def jeda(y, sr, seed=0):
    """re-time the pauses inside a line to Ridwan's: a phrase break ~0.38 s, a sentence break ~0.62 s"""
    import numpy as np
    R = np.random.default_rng(seed); h = int(.01 * sr)
    e = np.sqrt(np.convolve(y ** 2, np.ones(h) / h, 'same')); sil = e < max(e.max() * .03, 1e-4)
    out, i, n = [], 0, len(y)
    while i < n:
        j = i
        if sil[i]:
            while j < n and sil[j]: j += 1
            L = (j - i) / sr
            if i > 0 and j < n and L >= .06:
                tgt = (.62 if L >= .28 else .38) + R.uniform(-.06, .06)
                k = int(.02 * sr); out += [y[i:i + k], np.zeros(max(0, int(tgt * sr) - 2 * k), y.dtype), y[j - k:j]]
            else: out.append(y[i:j])
        else:
            while j < n and not sil[j]: j += 1
            out.append(y[i:j])
        i = j
    return np.concatenate(out)

def deess(y, sr, thr=.32):
    """soften harsh 's': where the 4.2–10 kHz band takes too large a share of the signal, turn only that band down"""
    import numpy as np
    from scipy.signal import butter, sosfiltfilt
    band = sosfiltfilt(butter(4, [4200, min(10000, sr / 2 - 200)], 'band', fs=sr, output='sos'), y)
    w = int(.006 * sr); k = np.ones(w) / w
    eb = np.sqrt(np.convolve(band ** 2, k, 'same')); ef = np.sqrt(np.convolve(y ** 2, k, 'same')) + 1e-6
    g = np.clip(thr / (eb / ef + 1e-9), .35, 1.0); g = np.convolve(g, np.ones(w * 3) / (w * 3), 'same')
    return y - band * (1 - g)
def poles(y, sr):
    """de-ess, a little warmth, less air hiss (the owner's chosen "1C" polish)"""
    import numpy as np
    from scipy.signal import butter, sosfilt
    y = deess(y, sr); y = y + sosfilt(butter(2, [140, 380], 'band', fs=sr, output='sos'), y) * .22
    y = y - sosfilt(butter(2, 8500, 'high', fs=sr, output='sos'), y) * .5
    return y / (np.abs(y).max() + 1e-9) * .9
def ejaan(teks):
    """apply the learned pronunciation spellings (whole words, case-insensitive) for the Brian voice"""
    if VOICE != BRIAN or not os.path.exists(KAMUS_UCAPAN): return teks
    for k, v in json.load(open(KAMUS_UCAPAN, encoding='utf-8')).items():
        teks = re.sub(r'(?<![\w-])' + re.escape(k) + r'(?![\w-])', v, teks, flags=re.I)
    return teks
def kalimat(teks):
    return [x.strip() for x in re.findall(r'[^.?!]+[.?!]*', teks) if x.strip()]

def ubah(src_wav, out_wav, pitch, tau, seed):
    import numpy as np, soundfile as sf
    s, t = sidik(pitch); conv().convert(audio_src_path=src_wav, src_se=s, tgt_se=t, output_path=out_wav, tau=tau)
    y, sr = sf.read(out_wav)
    i = np.flatnonzero(np.abs(y) > .01)
    if len(i): y = y[max(0, i[0] - int(.03 * sr)):i[-1] + int(.08 * sr)]
    if VOICE != BRIAN: y = jeda(y, sr, seed)
    k = int(.01 * sr); y[:k] *= np.linspace(0, 1, k); y[-k:] *= np.linspace(1, 0, k)
    sf.write(out_wav, y.astype(np.float32), sr)
    return round(len(y) / sr, 3)

def ucap_brian(teks, dst, rate, pitch, tau):
    """the "1C / I1" style: one sentence per call (fresh intonation), Ridwan's timbre, 0.45 s between sentences, polish"""
    import numpy as np, soundfile as sf
    parts, sr = [], 22050
    def potong(k, voice, pitch_, nama):
        global VOICE
        simpan = VOICE; VOICE = voice
        raw = dst[:-4] + f'.{nama}.src.wav'; tts(k, raw, rate if voice == BRIAN else '+0%', pitch_)
        y_ = dst[:-4] + f'.{nama}.wav'; s, t = sidik(pitch_)
        conv().convert(audio_src_path=raw, src_se=s, tgt_se=t, output_path=y_, tau=tau)
        VOICE = simpan
        y, sr_ = sf.read(y_); os.remove(raw); os.remove(y_)
        i = np.flatnonzero(np.abs(y) > .01)
        return (y[max(0, i[0] - int(.015 * sr_)):i[-1] + int(.07 * sr_)] if len(i) else y), sr_
    for j, k in enumerate(kalimat(teks)):
        m = re.match(r'\s*([A-Za-z]+)\s*,\s*(.+)$', k)
        if m and m.group(1).lower() in KATA_SERU:                    # "Nah, ..." -> native "Nah," + Brian for the rest
            y0, sr = potong(m.group(1) + ',', ASLI, PITCH_ASLI, f'k{j}s')
            y1, sr = potong(ejaan(m.group(2)[0].upper() + m.group(2)[1:]), BRIAN, pitch, f'k{j}')
            y = np.concatenate([y0, np.zeros(int(.16 * sr)), y1])
        else:
            y, sr = potong(ejaan(k), BRIAN, pitch, f'k{j}')
        parts += [y, np.zeros(int(.45 * sr))]
    y = poles(np.concatenate(parts[:-1]), sr)
    f = int(.01 * sr); y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f)
    sf.write(dst, y.astype(np.float32), sr)
    return round(len(y) / sr, 3)

_asr = None
def dengar(wav):
    global _asr
    if _asr is None:
        from faster_whisper import WhisperModel
        _asr = WhisperModel(os.environ.get('WHISPER_MODEL', 'small'), device='cpu', compute_type='int8')
    import librosa, numpy as np                                # decode here: some PyAV versions break faster-whisper's own decoder
    y = librosa.load(wav, sr=16000)[0].astype(np.float32)
    return ' '.join(s.text for s in _asr.transcribe(y, language='id', beam_size=5)[0]).strip()
norm = lambda s: re.sub(r'[^a-z ]', '', s.lower().replace('-', ' ')).split()

def narasi(lines, out):
    os.makedirs(out, exist_ok=True); dur, pilih = {}, {}
    for n, l in enumerate(json.load(open(lines, encoding='utf-8'))):
        ucap = l.get('say_ridwan') or l.get('say') or l['text']; best = None
        for v, (pitch, tau) in enumerate(VARIAN):
            dst = os.path.join(out, f"{l['id']}.v{v}.wav")
            if VOICE == BRIAN: d = ucap_brian(ucap, dst, l.get('rate', RATE), pitch, tau)
            else:
                raw = os.path.join(out, f"{l['id']}.v{v}.ardi.wav")
                tts(ucap, raw, l.get('rate', RATE), pitch); d = ubah(raw, dst, pitch, tau, n); os.remove(raw)
            heard = dengar(dst); w = norm(heard)
            skor = difflib.SequenceMatcher(None, norm(l['text']), w).ratio() + .1 * sum(k.lower() in w for k in l.get('kunci', []))
            if not best or skor > best[0] + .001: best = (skor, v, d, heard)
        os.replace(os.path.join(out, f"{l['id']}.v{best[1]}.wav"), os.path.join(out, l['id'] + '.wav'))
        for v in range(len(VARIAN)):
            p = os.path.join(out, f"{l['id']}.v{v}.wav")
            if os.path.exists(p): os.remove(p)
        dur[l['id']] = best[2]; pilih[l['id']] = {'varian': VARIAN[best[1]], 'skor': round(best[0], 2), 'terdengar': best[3]}
        print(l['id'], best[2], 's  skor', round(best[0], 2), '|', best[3], flush=True)
    json.dump(dur, open(os.path.join(out, 'dur.json'), 'w'), indent=1)
    json.dump(pilih, open(os.path.join(out, 'pilihan.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    lemah = [k for k, v in pilih.items() if v['skor'] < .7]
    if lemah: print('PERINGATAN: kalimat kurang jelas (skor < 0,7):', ', '.join(lemah))
    return dur

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('cmd'); ap.add_argument('args', nargs='*'); a = ap.parse_args()
    if a.cmd == 'siapkan': siapkan(); print('siap')
    elif a.cmd == 'narasi': narasi(a.args[0], a.args[1])
    elif a.cmd == 'uji':
        p = os.path.join(HERE, 'uji'); os.makedirs(p, exist_ok=True)
        json.dump([{'id': 'uji-1', 'text': 'Assalamualaikum, Bapak dan Ibu. Saya Ridwan, dari PT Sahabat Bintang Harapan.'},
                   {'id': 'uji-2', 'text': 'Yayasan yang baik dimulai dari satu kata: amanah.', 'kunci': ['amanah']}],
                  open(os.path.join(p, 'lines.json'), 'w', encoding='utf-8'))
        narasi(os.path.join(p, 'lines.json'), p)
    else: ap.error('perintah: siapkan | narasi | uji')
