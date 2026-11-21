"""Periksa konten.json satu reels sebelum dibuat. Keluar 1 dan sebutkan masalahnya kalau ada yang salah.
usage: python cek_konten.py <folder reels>/konten.json"""
import sys, json, re
K = json.load(open(sys.argv[1], encoding='utf-8')); err = []
need = ['judul', 'tema', 'tanya', 'salah', 'kunci', 'kepala', 'poin', 'hasil', 'narasi', 'caption']
for k in need:
    if k not in K: err.append(f'kolom "{k}" tidak ada')
if not err:
    PAPAN = re.compile(r"^[A-Za-z0-9 .,:?!'-]+$")                 # glyphs the single-line chalk font has
    def papan(label, t, maks):
        if not PAPAN.match(t): err.append(f'{label} "{t}": hanya huruf, angka, spasi, dan . , : ? ! \' - yang bisa ditulis kapur')
        if len(t) > maks: err.append(f'{label} "{t}" terlalu panjang ({len(t)} > {maks} huruf)')
    if len(K['tanya']) != 2: err.append('"tanya" harus 2 baris: [kata besar, baris kecil]')
    else: papan('tanya[0]', K['tanya'][0], 10); papan('tanya[1]', K['tanya'][1], 18)
    TEMA = {'manajemen sekolah', 'sdm sekolah', 'administrasi sekolah', 'branding sekolah', 'kelembagaan yayasan'}
    if str(K['tema']).strip().lower() not in TEMA: err.append(f'"tema" harus salah satu dari: {", ".join(sorted(TEMA))} (dipakai di sampul)')
    if len(K['judul']) > 42: err.append(f'"judul" terlalu panjang untuk sampul ({len(K["judul"])} > 42 huruf)')
    papan('judul', K['judul'], 42)
    papan('salah', K['salah'], 18); papan('kunci', K['kunci'], 9); papan('kepala', K['kepala'], 22); papan('hasil', K['hasil'], 16)
    if len(K['poin']) != 4: err.append('"poin" harus tepat 4 baris')
    for i, p in enumerate(K['poin']):
        papan(f'poin[{i}][0]', p[0], 24); papan(f'poin[{i}][1]', p[1], 28)
        if not p[0].startswith(f'{i + 1}. '): err.append(f'poin[{i}][0] harus diawali "{i + 1}. "')
    ids = [l.get('id') for l in K['narasi']]
    if ids != [f'n{i}' for i in range(1, 12)]: err.append('"narasi" harus 11 kalimat berurutan n1..n11')
    for l in K['narasi']:
        if len(l.get('text', '')) > 110: err.append(f"{l['id']} terlalu panjang untuk satu napas ({len(l['text'])} huruf)")
    n11 = K['narasi'][-1]['text'].lower() if K['narasi'] else ''
    if 'akadiva' not in n11 or 'sabiha' not in n11: err.append('n11 (penutup) harus menyebut Akadiva dan SABIHA Edu')
    semua = json.dumps(K, ensure_ascii=False).lower()
    for w in (r'\brp\.?\s?\d', r'\bharga\b', r'\bharganya\b', r'\bdiskon\b', r'\bpromo\b', r'\bkartu tap\b', r'\bsaldo siswa\b'):
        if re.search(w, semua): err.append(f'dilarang: "{w}" (tanpa harga; fitur yang belum ada tidak boleh disebut)')
    if len(K['caption']) > 2100: err.append('caption lebih dari 2.100 huruf')
if err: print('KONTEN DITOLAK:\n- ' + '\n- '.join(err)); sys.exit(1)
print('konten ok:', K['judul'])
