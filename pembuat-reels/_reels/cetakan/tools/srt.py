"""subtitles_id.srt from the subtitle cues the page exports into events.json (type 'sub': t, t1, text).
usage: python tools/srt.py <out.srt>"""
import os, sys, json
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ev = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf-8'))['ev']
cues = sorted((e for e in ev if e['type'] == 'sub'), key=lambda e: e['t'])
def ts(s):
    ms = int(round(max(0, s) * 1000)); return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
out = []
for k, e in enumerate(cues):
    t1 = min(e['t1'], cues[k + 1]['t']) if k + 1 < len(cues) else e['t1']
    out.append(f"{k + 1}\n{ts(e['t'])} --> {ts(t1)}\n{e['text']}\n")
open(sys.argv[1], 'w', encoding='utf-8').write('\n'.join(out))
print(f'{sys.argv[1]}: {len(cues)} cues')
