// "Yayasan Pendidikan yang Baik": the whole film as data. Board layout, every stroke with its time, the sliding panel,
// the one wipe, the camera, the texts for readcheck and the sound events. Vertical frame (1080×1920).
// Units: world = the board's slate (x 0…6400, y 0…1700). Front-panel things are in panel-local units (layer 'FL');
// the panel's offset slideX(t) moves them. Back-board things are in world units (layer 'BK'); the orange threads that
// cross the seam are 'WORLD'. Camera scales are given for a 1920-wide frame (app.js multiplies by W / 1920).
import { clamp, lerp, eio } from '/core/lib.js';
import { Stroke, catmull } from './chalk.js';
import { writeLatin, latinWidth } from './hand.js';
import { PW } from './stage.js';

// subtitles: each voice line split at sentence ends; a long sentence also at the comma nearest its middle
export function splitSub(t) {
  const out = [];
  for (const sen of t.match(/[^.?!]+[.?!]*\s*/g).map(x => x.trim()).filter(Boolean)) {
    if (sen.length <= 40 || !sen.includes(',')) { out.push(sen); continue; }
    let best = -1; for (let i = sen.indexOf(','); i >= 0; i = sen.indexOf(',', i + 1)) if (best < 0 || Math.abs(i - sen.length / 2) < Math.abs(best - sen.length / 2)) best = i;
    out.push(sen.slice(0, best + 1).trim(), sen.slice(best + 1).trim());
  }
  return out;
}
export const needOf = txt => Math.max(1.5, txt.replace(/\s/g, '').length / 15 + 1.5);

const QX = 700;                                  // the question column's centre on the front panel (panel units)
const Y = { yay: 330, yang: 490, mid: 820, ul: 858, arrow0: 892, arrow1: 1000, grow: 1128 };
const PX = 1930;                                 // left edge of the list on the back board (world units)
const BX = 1000;                                 // the sign-off's centre on the back board

export function build(W = 1080, H = 1920, VO, K) {
  const S = [], TX = [], EV = [], SUBS = [], T = {};
  const SUB = Object.fromEntries(K.narasi.map(l => [l.id, splitSub(l.text)]));
  const [Q1, Q2] = K.tanya, KUNCI = K.kunci.toUpperCase();
  const add = (arr, layer, phase = 'pre') => { arr.forEach(s => { s.layer = layer; s.phase = phase; S.push(s); }); return arr; };
  const text = (id, txt, layer, strokes, t1 = 1e9, pad = 6) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of strokes) for (const [x, y] of s.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    TX.push({ id, text: txt, layer, box: [x0 - pad, y0 - pad, x1 + pad, y1 + pad], t0: strokes[0].t0, t1 });
  };
  const line = (pts, o, t0, dur) => { const s = new Stroke(o.smooth ? catmull(pts, 10) : pts, { kind: 'write', taper: .2, taperLen: .2, land: .6, skip: .14, endSpecks: true, specks: .6, ...o }); s.t0 = t0; s.t1 = t0 + dur; return s; };
  const font = o => (o.hand === 'child' ? 'child' : 'main');
  const fit = (txt, cap, maxW, o = {}) => Math.min(cap, cap * maxW / latinWidth(txt, cap, font(o)));
  const lat = (txt, x, by, cap, t, o = {}) => writeLatin(txt, x, by, cap, t, o);
  const ctr = (txt, cx, by, cap, t, o = {}) => writeLatin(txt, cx - latinWidth(txt, cap, font(o)) / 2, by, cap, t, o);

  // a voice line and its subtitle cues (timed by each part's share of the letters); returns the earliest next start
  const vo = (id, t) => {
    EV.push({ t, type: 'vo', id });
    const parts = SUB[id], end = t + VO[id];
    const w = parts.map(p => [...p].reduce((a, c) => a + (/[A-Za-z0-9]/.test(c) ? 1 : /[,.:;?]/.test(c) ? 2.5 : 0), 0)), W0 = w.reduce((a, b) => a + b, 0);
    let acc = 0;
    parts.forEach((p, k) => {
      const a = k ? t + VO[id] * acc / W0 : t - .08; acc += w[k];
      const b = k === parts.length - 1 ? Math.max(end + .3, a + 1.8) : t + VO[id] * acc / W0;
      SUBS.push({ id: id + (parts.length > 1 ? '-' + (k + 1) : ''), t0: a, t1: b, text: p });
      EV.push({ t: +a.toFixed(3), type: 'sub', t1: +b.toFixed(3), text: p });
    });
    T[id] = end; return end + .35;
  };

  // ───────── S1 · the question, and the common answer in a second hand
  const cYay = fit(Q1, 150, 820), cYang = fit(Q2, 92, 820);
  const yay = add(ctr(Q1, QX, Y.yay, cYay, .12, { seed: 3, lspeed: 55 }), 'FL');
  let next = vo('n1', .45);
  const yang = add(ctr(Q2, QX, Y.yang, cYang, yay.end + .05, { seed: 4, lspeed: 95 }), 'FL');
  text('yay', Q1, 'FL', yay); text('yang', Q2, 'FL', yang);
  const kidTxt = K.salah, kidO = { hand: 'child', seed: 7, lspeed: 75 };
  const cKid = fit(kidTxt, 92, 800, kidO);
  const kid = add(ctr(kidTxt, QX, Y.mid, cKid, Math.max(yang.end + .1, .45 + VO.n1 * .5), kidO), 'FL');
  T.kid = kid.end;

  // ───────── S2 · one wipe takes the answer away; "AMANAH" is written in the same place
  next = vo('n2', next);
  T.wipe0 = Math.max(T.kid + needOf(kidTxt) + .05, T.n2 - .25); T.wipe1 = T.wipe0 + .75;
  EV.push({ t: T.wipe0, type: 'wipe', d: .75 });
  kid.forEach(s => s.wiped = true);
  text('kid', kidTxt, 'FL', kid, T.wipe0 + .3);
  const wipe = { t0: T.wipe0, t1: T.wipe1, w: 240, path: catmull([[80, 852], [420, 838], [800, 846], [1180, 836], [1330, 842]], 12) };
  next = vo('n3', Math.max(next, T.wipe1 - .3));
  const cAm = fit(KUNCI, 170, 820), amW = latinWidth(KUNCI, cAm);
  const am = add(ctr(KUNCI, QX, Y.mid, cAm, Math.max(T.wipe1 + .1, T.n3 - 1.05), { seed: 9, lspeed: 30, color: 'orange' }), 'FL', 'post');
  text('amanah', KUNCI, 'FL', am);
  T.am = am.end; EV.push({ t: T.am, type: 'born' });
  T.pull0 = Math.max(T.n3, T.am) + 1.0;                         // the turn is held in silence (short: a reel moves on)

  // ───────── S3 · pull back, the front panel slides away, push in on the clean back board
  T.slide0 = T.pull0 + .55; T.slide1 = T.slide0 + .9;
  EV.push({ t: T.slide0, type: 'slide', d: .9 });
  next = vo('n4', T.slide0 - .1);
  T.push0 = T.slide1 + .05; T.push1 = T.push0 + .9;
  const cHead = fit(K.kepala, 54, 1000);
  const head = add(lat(K.kepala, PX, 178, cHead, T.slide0 + .62, { seed: 20, lspeed: 120 }), 'BK');
  text('head', K.kepala, 'BK', head);
  EV.push({ t: T.slide1, type: 'music' });

  // ───────── S4 · the four things, one per voice line
  const ROWS = K.poin.map((p, i) => [p[0], p[1], 'n' + (5 + i)]);
  const cRow = Math.min(...ROWS.map(r => fit(r[0], 64, 1040))), cSub = Math.min(...ROWS.map(r => fit(r[1], 42, 980)));
  const rowEnd = [];
  next = Math.max(next, head.end + .1);
  ROWS.forEach(([a, b, id], i) => {
    const yb = 345 + i * 300, vs = next; next = vo(id, vs);
    const ta = add(lat(a, PX, yb, cRow, vs + .1, { seed: 30 + i, lspeed: 80 }), 'BK');
    const tb = add(lat(b, PX + 54, yb + 90, cSub, Math.max(ta.end + .1, vs + VO[id] * .42), { seed: 40 + i, lspeed: 120 }), 'BK');
    text('row' + i, a, 'BK', ta); text('rowsub' + i, b, 'BK', tb);
    rowEnd.push([Math.max(ta.x, tb.x) + 45, yb - cRow * .45]);
    EV.push({ t: vs + .1, type: 'row', i });
    T['row' + i] = tb.end;
  });

  // ───────── S5 · orange threads from each of the four across the seam to AMANAH
  T.seam0 = next - .25;
  next = vo('n9', next);
  const AM = [QX + PW - amW / 2 - 40, Y.mid - cAm * .5];          // AMANAH's left side, world units once the panel has slid
  const threads = rowEnd.map(([x0, y0], i) => {
    const x1 = AM[0], y1 = AM[1] + (i - 1.5) * 34, mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - 60;
    const th = line([[x0, y0], [mx, my], [x1, y1]], { w: 9, color: 'orange', smooth: true, taper: .05, wob: 1.2 }, T.seam0 + 1.0 + i * .45, .6);
    th.layer = 'WORLD'; th.phase = 'pre'; S.push(th);
    EV.push({ t: th.t0, type: 'thread', d: .6, i });
    return th;
  });
  T.threads = threads[3].t1;

  // ───────── S6 · cut on the seam to AMANAH: an arrow down, "murid tumbuh"; the one long hold
  T.s10 = Math.max(next, T.threads + .5);
  next = vo('n10', T.s10 + .1);
  const ar = [line([[QX, Y.arrow0], [QX + 3, Y.arrow1]], { w: 9, color: 'white' }, T.s10 + .4, .2),
    line([[QX - 36, Y.arrow1 - 44], [QX + 3, Y.arrow1 + 2], [QX + 40, Y.arrow1 - 46]], { w: 9, color: 'white', taper: .1 }, T.s10 + .63, .14)];
  add(ar, 'FL', 'post');
  const cGrow = fit(K.hasil, 96, 820);
  const grow = add(ctr(K.hasil, QX, Y.grow, cGrow, Math.max(T.s10 + .85, T.s10 + .1 + VO.n10 * .5 - .7), { seed: 60, lspeed: 70 }), 'FL', 'post');
  text('grow', K.hasil, 'FL', grow);
  EV.push({ t: grow.end, type: 'grow' });
  // no hold after the result: as soon as "murid tumbuh" has been read, whip straight to the sign-off (fast, no dead air)
  T.whip = Math.max(T.n10 + .15, grow[0].t0 + needOf(K.hasil) + .05);

  // ───────── S7 · whip to the sign-off: the Akadiva and SABIHA Edu logo cards are slapped onto the board as they are named
  T.brand = T.whip + .35;
  EV.push({ t: T.whip, type: 'whip' }, { t: T.wide0 = T.whip, type: 'bell' }, { t: T.whip, type: 'music' });
  next = vo('n11', T.brand - .05);
  // word times inside n11 (Whisper, vo_alami_final): "Akadiva" 0.00 s, "SABIHA" 0.78 s of 6.25 s; as fractions so another voice fits
  const CARDS = [
    { img: 'img/akadiva.png', cx: BX, cy: 520, w: 880, t0: T.brand - .12 },
    { img: 'img/sabiha-edu.png', cx: BX, cy: 905, w: 880, t0: T.brand - .05 + VO.n11 * K.fraksi_sabiha - .08 },
  ];
  CARDS.forEach(c => EV.push({ t: c.t0, type: 'card' }));
  T.last = T.n11 + .3;

  // ───────── S8 · the opening frame again: AMANAH underlined
  const ul = line([[QX - amW / 2 - 12, Y.ul + 4], [QX, Y.ul - 2], [QX + amW / 2 + 12, Y.ul - 8]], { w: 11, color: 'orange', smooth: true, taper: .06 }, T.last + .4, .5);
  add([ul], 'FL', 'post');
  EV.push({ t: ul.t1, type: 'tap', big: 1 });
  T.DUR = +(ul.t1 + 1.8).toFixed(2);
  T.back0 = 1e9;

  // ───────── the sliding panel: away at S3, never back
  const slideX = tt => PW * eio(clamp((tt - T.slide0) / (T.slide1 - T.slide0)));

  // ───────── camera: keys [t, cx, cy, s] (world units), eased between keys; a new shot is a cut
  const QF = [QX, 700, 1.9], PF = [2440, 770, 1.6], SEAM = [3110, 780, .77], BF = [BX, 720, 1.9];
  const shots = [
    { t0: 0, keys: [[0, QX, 712, 1.84], [T.pull0, ...QF], [T.pull0 + 1.0, 1800, 830, .86], [T.push0, 1810, 830, .86], [T.push1, ...PF],
      [T.seam0, PF[0], PF[1] + 30, 1.63], [T.seam0 + 1.0, ...SEAM], [T.s10, SEAM[0] + 20, SEAM[1], SEAM[2] * 1.02]] },
    { t0: T.s10, keys: [[T.s10, QX + PW, 700, 1.86], [T.whip, QX + PW, 700, 1.92], [T.brand, ...BF], [T.last, BF[0], BF[1], BF[2] * 1.03]] },
    { t0: T.last, keys: [[T.last, QX + PW, 700, 1.9], [T.DUR, QX + PW, 700, 1.93]] },
  ];
  const camAt = tt => {
    let i = 0; while (i + 1 < shots.length && tt >= shots[i + 1].t0) i++;
    const K = shots[i].keys;
    let k = 0; while (k + 1 < K.length - 1 && tt > K[k + 1][0]) k++;
    const a = K[k], b = K[Math.min(K.length - 1, k + 1)], u = b[0] > a[0] ? eio(clamp((tt - a[0]) / (b[0] - a[0]))) : 1;
    return { cx: lerp(a[1], b[1], u), cy: lerp(a[2], b[2], u), s: lerp(a[3], b[3], u), shot: i };
  };

  // chalk events for the sound: every stroke, with its length on screen, colour and where it sits across the frame
  for (const st of S) {
    if (st.t1 <= 0 || st.t0 >= T.DUR) continue;
    const c = camAt((st.t0 + st.t1) / 2), p = st.at(st.len / 2), x = p[0] + (st.layer === 'FL' ? slideX(st.t0) : 0);
    const sx = (x - c.cx) * c.s / 960;
    if (Math.abs(sx) > 1.3) continue;
    EV.push({ t: +st.t0.toFixed(3), type: 'chalk', d: +(st.t1 - st.t0).toFixed(3), len: Math.round(st.len * c.s * .75), color: st.color, pan: +clamp(sx * .6, -.7, .7).toFixed(2), big: st.w > 12 ? 1 : 0 });
  }
  EV.sort((a, b) => a.t - b.t);
  return { S, TX, EV, SUBS, T, wipe, slideX, camAt, shots, CARDS, DUR: T.DUR };
}
