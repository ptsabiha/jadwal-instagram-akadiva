"""Sound for an Akadiva chalkboard reel -> mix.wav (48 kHz stereo, exactly DUR seconds).
Run from the library root (build.sh does it):  node core/render/events.mjs <film>  then  $LIB/.venv/bin/python <film>/audio.py
Voice: edge-tts id-ID-ArdiNeural (vo/*.wav), the loudest thing. Chalk: two CC0 recordings cut into grains (foley/lib), one grain
chain per stroke. Score: nylon guitar and pizzicato bass (physical models, core/audio/pluck.py) with a synthesised marimba, in D.
Silence while the question is asked and while the result is read."""
import sys, os, json
HERE = os.environ.get('KERJA_DIR') or os.path.dirname(os.path.abspath(__file__)); TPL = os.path.dirname(os.path.abspath(__file__)); LIB = os.environ.get('LIB') or os.path.expanduser('~/lemo-opuscar')
sys.path.insert(0, LIB)
import numpy as np, soundfile as sf, soxr
from core.audio import sampler as S
from core.audio.sfx import SR, add, whoosh, noise, bp, hp, lp, t_, brown, thump

MUSIK = os.environ.get('MUSIK') == '1'                           # default: no score, only the voice and the board (chalk, wipe, panel)
rng = np.random.default_rng(7)
EV = json.load(open(os.path.join(HERE, os.environ.get('EVENTS', 'events.json')), encoding='utf-8'))
DUR = EV['dur']; ev = EV['ev']; N = int(round(DUR * SR))
first = lambda k: next(e for e in ev if e['type'] == k)
every = lambda k: [e for e in ev if e['type'] == k]
vo = {e['id']: e['t'] for e in ev if e['type'] == 'vo'}
VOD = json.load(open(os.path.join(HERE, os.environ.get('VODIR', 'vo'), 'dur.json')))
voice, fx, mus = (np.zeros((N, 2), np.float32) for _ in range(3))

def fade(x, a=.004, b=.03):
    n = len(x); a, b = min(int(a * SR), n // 2), min(int(b * SR), n // 2)
    x = x.copy(); x[:a] *= np.linspace(0, 1, a); x[n - b:] *= np.linspace(1, 0, b); return x

# ---------------------------------------------------------------- voice
for vid, t in vo.items():
    x, sr = sf.read(os.path.join(HERE, os.environ.get('VODIR', 'vo'), vid + '.wav'), dtype='float32')
    if x.ndim > 1: x = x.mean(1)
    x = soxr.resample(x, sr, SR); x = hp(x, 90).astype(np.float32)
    x = x / (np.sqrt(np.mean(x ** 2)) + 1e-9) * .085
    add(voice, x, t, 1.0, 0)
vpres = np.abs(voice[:, 0]); k = int(.25 * SR)
vpres = np.convolve(vpres, np.ones(k) / k, 'same'); vpres = np.clip(vpres / (vpres.max() + 1e-9) * 3, 0, 1)

# ---------------------------------------------------------------- chalk
IDX = json.load(open(os.path.join(TPL, 'foley/lib/index.json')))
strokes = [g for g in IDX if g['kind'] == 'stroke']; taps = [g for g in IDX if g['kind'] == 'tap']
cache = {}
def grain(g):
    if g['file'] not in cache:
        x, sr = sf.read(os.path.join(TPL, 'foley/lib', g['file']), dtype='float32')
        if x.ndim > 1: x = x.mean(1)
        if sr != SR: x = soxr.resample(x, sr, SR)
        cache[g['file']] = x / (np.abs(x).max() + 1e-9)
    return cache[g['file']]
def chalk(d, v, soft=False):
    out = np.zeros(int((d + .06) * SR), np.float32); pos = 0
    while pos < len(out) - int(.03 * SR):
        g = grain(strokes[rng.integers(len(strokes))]); n = min(len(g), len(out) - pos)
        out[pos:pos + n] += fade(g[:n], .006, .02); pos += max(int(.6 * n), int(.04 * SR))
    env = np.ones(len(out)); a = int(.012 * SR); env[:a] = np.linspace(.3, 1, a); env[-int(.05 * SR):] *= np.linspace(1, 0, int(.05 * SR))
    out = out * env
    out = lp(out, 3600) if soft else hp(out, 500)
    return (out * v).astype(np.float32)
for e in every('chalk'):
    if e['t'] < 0: continue
    d = max(.04, e['d']); size = min(1.0, e['len'] / 700)
    v = (.12 + .32 * size) * (1.2 if e['big'] else .85) * (.8 if e['color'] == 'kid' else 1)
    add(fx, chalk(d, v, e['color'] in ('orange', 'kid')), e['t'], 1.0, e['pan'])
    if d > .12 and rng.random() < .5:
        add(fx, fade(grain(taps[rng.integers(len(taps))]), .002, .03) * .35 * v, e['t'] - .005, 1.0, e['pan'])

# ---------------------------------------------------------------- room, wipe, panel, whip, bell, landing knocks
room = lp(brown(DUR), 900) * .006; fx[:, 0] += room[:N]; fx[:, 1] += np.roll(room, 997)[:N]
e = first('wipe'); d = e['d']                                        # one felt pass
w = bp(noise(d + .1), 280, 2200) * .22; w *= np.sin(np.pi * np.clip(t_(d + .1) / (d + .1), 0, 1)) ** 1.2 * (1 + .35 * np.sin(2 * np.pi * 2.2 * t_(d + .1)))
add(fx, w.astype(np.float32), e['t'], 1.0, 0)
e = first('slide'); d = e['d']                                       # the panel rolls on its track and meets its stop
r = lp(brown(d + .3), 260) * .5; r *= np.sin(np.pi * np.clip(t_(d + .3) / (d + .3), 0, 1)) ** .7
tick = np.zeros_like(r); per = int(.045 * SR)
for i in range(0, len(tick) - 400, per): tick[i:i + 300] += np.exp(-np.arange(300) / 40) * .25 * (.5 + .5 * np.sin(np.pi * i / len(tick)))
add(fx, ((r + lp(tick, 1200)) * .7).astype(np.float32), e['t'], 1.0, .2)
add(fx, thump(.8, 62) * .7, e['t'] + d, 1.0, .35)
add(fx, whoosh(.36, .7) * .45, first('whip')['t'] - .04, 1.0, -.3)
if False:
    e = first('bell'); d = 2.2                                       # the school bell, far down the corridor
    b = (np.sign(np.sin(2 * np.pi * 980 * t_(d))) * .3 + np.sin(2 * np.pi * 1960 * t_(d)) * .2) * (.6 + .4 * np.sin(2 * np.pi * 24 * t_(d)))
    b = lp(bp(b, 600, 3000), 2000) * np.minimum(1, t_(d) / .05) * np.exp(-np.maximum(0, t_(d) - 1.7) / .15) * .05
    add(fx, S.room(np.stack([b, b], 1).astype(np.float32), size=.7, mix=.6)[:, 0], e['t'], 1.0, .5)
for k in ('grow', 'tap'):
    for e in every(k): add(fx, fade(grain(taps[rng.integers(len(taps))]), .002, .03) * .32, e['t'], 1.0, 0)
for e in every('card'):                                              # a card slapped onto the board: paper snap + a soft knock
    d = .12; s = bp(noise(d), 900, 6000) * np.exp(-t_(d) / .018) * .5 + thump(.6, 110) [:int(d * SR)] * .5
    add(fx, s.astype(np.float32), e['t'] + .17, 1.0, 0)

# no score: the reels carry only the voice (Suara Ridwan) and the board (owner's rule, 21 Nov 2026)
mus = np.zeros_like(mus)
duck = (1 - .84 * vpres)[:, None]                                   # about -16 dB under the voice, full in the pauses
mix = voice * 1.0 + fx * .9 + mus * .85 * duck

def lufs(x):
    from scipy.signal import lfilter
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, .73248077421585]
    b2, a2 = [1, -2, 1], [1, -1.99004745483398, .99007225036621]
    y = lfilter(b2, a2, lfilter(b1, a1, x, axis=0), axis=0); blk = int(.4 * SR); hop = int(.1 * SR)
    ms = np.array([np.mean(np.sum(y[i:i + blk] ** 2, 1)) for i in range(0, len(y) - blk, hop)])
    l = -.691 + 10 * np.log10(ms + 1e-12); ms = ms[l > -70]; l0 = -.691 + 10 * np.log10(ms.mean()) - 10
    ms = ms[-.691 + 10 * np.log10(ms + 1e-12) > l0]; return -.691 + 10 * np.log10(ms.mean())
def limit2(x, ceil, look=.004):
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    n = int(look * SR); m = maximum_filter1d(np.abs(x).max(1), size=2 * n + 1)
    g = uniform_filter1d(np.minimum(1, ceil / np.maximum(m, 1e-9)), size=n); return x * g[:, None]
stems = {"voice": voice, "chalk+fx": fx * .9}
raw = {k: lufs(v.astype(np.float64)) for k, v in stems.items()}
for _ in range(4):
    mix *= 10 ** ((float(os.environ.get('LUFS_TARGET', -16)) - lufs(mix)) / 20); mix = limit2(mix, .6)
over = soxr.resample(mix, SR, SR * 4); tp = 20 * np.log10(np.abs(over).max() + 1e-12)
if tp > -2.0: mix *= 10 ** ((-2.0 - tp) / 20)
mix = mix[:N].astype(np.float32)
if len(mix) < N: mix = np.pad(mix, ((0, N - len(mix)), (0, 0)))
sf.write(os.path.join(HERE, os.environ.get('MIXOUT', 'mix.wav')), mix, SR, subtype='PCM_24')
print(f'mix.wav  {DUR:.2f} s  {lufs(mix):.1f} LUFS')
g0 = lufs(mix) - lufs((voice + fx * .9 + mus * .85 * duck).astype(np.float64))
print('stems (relative, LUFS):', {k: round(v + g0, 1) for k, v in raw.items()})
