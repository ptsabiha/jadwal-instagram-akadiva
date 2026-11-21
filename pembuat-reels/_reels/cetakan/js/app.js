// Page: every frame is Canvas 2D (wall, slates, chalk, wipe, light), then a WebGL2 post pass
// (camera motion blur, vignette, grade). window.render(t) depends on t only. Vertical frame: 1080×1920.
import { clamp } from '/core/lib.js';
import { bake, drawStroke } from './chalk.js';
import { installDeposit, grainTile } from './r2d.js';
import { Post } from './post.js';
import { loadSvgFont } from './hand.js';
import { bakeWall, bakeSlate, WALL, PW, BH } from './stage.js';
import { drawFront } from './props.js';

const Q = new URLSearchParams(location.search), W = innerWidth, H = innerHeight;
const cv = document.getElementById('c');
cv.width = W; cv.height = H;
await loadSvgFont('fonts/EMSDelight.svg');
await loadSvgFont('fonts/EMSCasualHand.svg', 'child');
installDeposit();

const KERJA = Q.get('kerja') || '_kerja';                     // the reel being made: konten.json + vo/ (Suara Ridwan)
const K = await (await fetch(KERJA + '/konten.json')).json();
globalThis.WARNA_PAPAN = Q.get('papan') || K.papan || 'biru';       // board paint (stage.js WARNA); navy is the owner's choice (22 Nov 2026)
if (Q.has('sampul')) {                                          // ?sampul: the reel's cover (one fixed layout for a tidy grid)
  await (await import('./sampul.js')).gambar(cv, W, H, K);
  window.DUR = 1; window.render = () => {}; window.READY = true;
  await new Promise(() => {});                                  // stop here: nothing else of the film is built
}
const VO = await (await fetch(KERJA + '/vo/dur.json')).json();  // voice lengths: the picture is timed to the voice
if (K.fraksi_sabiha == null) {                                  // where "SABIHA" falls inside the closing line, for the logo card
  const n11 = K.narasi.find(l => l.id === 'n11'), say = (n11.say_ridwan || n11.say || n11.text).toLowerCase(), i = say.indexOf('sabiha');
  K.fraksi_sabiha = i < 0 ? .3 : i / say.length * .85;
}
const { build } = await import('./film.js');
const F = build(W, H, VO, K);
for (const s of F.S) bake(s, s.o.R || 2);
window.DUR = F.DUR; window.EV = F.EV;
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
const CARD_IMG = await Promise.all(F.CARDS.map(c => loadImg(c.img)));
const BANNER = await loadImg('img/banner.png');              // the owner's watermark banner, over the whole reel

// a logo printed on a white card, slapped onto the board as it is named: drops in slightly large and tilted, settles in 0.2 s
function drawCard(ctx, c, im, t, k) {
  const u = t - c.t0; if (u <= 0) return;
  const e = Math.min(1, u / .2), ease = 1 - Math.pow(1 - e, 3);
  const sc = 1.16 - .16 * ease + .025 * Math.sin(Math.min(1, u / .32) * Math.PI) * (1 - e), rot = ((k ? .9 : -1.1) + (k ? 2.5 : -2.5) * (1 - ease)) * Math.PI / 180;
  const pad = 46, lw = c.w - 2 * pad, lh = lw * im.height / im.width, w = c.w, h = lh + 2 * pad * .8;
  ctx.save(); ctx.globalAlpha = Math.min(1, u / .06); ctx.translate(c.cx, c.cy); ctx.rotate(rot); ctx.scale(sc, sc);
  ctx.save(); ctx.filter = `blur(${10 + 18 * (1 - ease)}px)`; ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.roundRect(-w / 2 + 10, -h / 2 + 16 + 20 * (1 - ease), w, h, 14); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#f7f5ef'; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 14); ctx.fill();
  ctx.drawImage(im, -lw / 2, -lh / 2, lw, lh);
  ctx.fillStyle = 'rgba(236,228,200,.72)';                    // two strips of tape at the top corners
  for (const sx of [-1, 1]) { ctx.save(); ctx.translate(sx * (w / 2 - 40), -h / 2 + 4); ctx.rotate(sx * -.5); ctx.fillRect(-55, -16, 110, 32); ctx.restore(); }
  ctx.restore();
}

// ───────── static pictures
const WALLI = bakeWall();
const BACK = bakeSlate(PW + 140, BH, 61), FR = bakeSlate(PW, BH, 71, true), FL = bakeSlate(PW, BH, 81, true);
const TILE = grainTile();

const post = new Post(cv, W, H);
const main = new OffscreenCanvas(W, H), mx = main.getContext('2d');
const la = new OffscreenCanvas(W, H), lx = la.getContext('2d');
const PAT = mx.createPattern(TILE, 'repeat');
const KS = W / 1920;                                         // camera scales are given for a 1920-wide frame
const view = c0 => { const c = { ...c0, s: c0.s * KS }; return { ...c, m: [c.s, 0, 0, c.s, W / 2 - c.cx * c.s, H / 2 - c.cy * c.s], toScreen: (x, y) => [W / 2 + (x - c.cx) * c.s, H / 2 + (y - c.cy) * c.s], W, H }; };

function wipePath(t) {
  const w = F.wipe; if (t <= w.t0) return null;
  const P = w.path, n = Math.max(2, Math.round(P.length * clamp((t - w.t0) / (w.t1 - w.t0))));
  const p = new Path2D(); P.slice(0, n).forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y));
  return p;
}

function frame(t) {
  const c = F.camAt(t), v = view(c), ox = F.slideX(t);
  mx.setTransform(1, 0, 0, 1, 0, 0); mx.globalCompositeOperation = 'source-over'; mx.globalAlpha = 1; mx.filter = 'none';
  mx.fillStyle = '#000'; mx.fillRect(0, 0, W, H);
  mx.setTransform(...v.m); mx.imageSmoothingQuality = 'high';
  mx.drawImage(WALLI.cv, WALL[0], WALL[1], WALL[2], WALL[3]);
  // back board and its chalk (only ever seen once the panel has moved)
  if (ox > 1) {
    mx.drawImage(BACK.cv, -BACK.m, 0, BACK.cv.width, BH);
    for (const s of F.S) if (s.layer === 'BK' && t > s.t0) drawStroke(mx, s, t);
  }
  // FR (static), then FL on its offset with a soft occlusion shadow on what is behind its left edge
  mx.drawImage(FR.cv, PW - FR.m, 0, FR.cv.width, BH);
  if (ox > 1) { const g = mx.createLinearGradient(ox - 60, 0, ox, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)'); mx.fillStyle = g; mx.fillRect(ox - 60, 0, 60, BH); }
  mx.drawImage(FL.cv, ox - FL.m, 0, FL.cv.width, BH);
  // front-panel chalk: strokes that can be wiped go on their own layer, the cloth takes them, the rest is redrawn
  lx.setTransform(1, 0, 0, 1, 0, 0); lx.clearRect(0, 0, W, H); lx.filter = 'none'; lx.globalCompositeOperation = 'source-over';
  lx.setTransform(v.m[0], 0, 0, v.m[3], v.m[4] + ox * v.s, v.m[5]);
  const hp = wipePath(t);
  for (const s of F.S) if (s.layer === 'FL' && s.phase === 'pre' && (!hp || s.wiped) && t > s.t0) drawStroke(lx, s, t);
  if (hp) {
    lx.globalCompositeOperation = 'destination-out'; lx.filter = `blur(${Math.max(1, 16 * v.s)}px)`; lx.lineCap = 'round'; lx.lineJoin = 'round'; lx.lineWidth = F.wipe.w; lx.strokeStyle = '#000';
    lx.stroke(hp); lx.globalCompositeOperation = 'source-over'; lx.filter = 'none';
    for (const s of F.S) if (s.layer === 'FL' && s.phase === 'pre' && !s.wiped && t > s.t0) drawStroke(lx, s, t);
  }
  mx.setTransform(1, 0, 0, 1, 0, 0); mx.drawImage(la, 0, 0);
  if (hp) {                                                  // the thin, even haze the cloth leaves
    mx.save(); mx.setTransform(v.m[0], 0, 0, v.m[3], v.m[4] + ox * v.s, v.m[5]); mx.filter = `blur(${Math.max(1, 12 * v.s)}px)`;
    mx.strokeStyle = 'rgba(160,176,168,.024)'; mx.lineCap = 'round'; mx.lineJoin = 'round'; mx.lineWidth = F.wipe.w * .9; mx.stroke(hp); mx.restore();
  }
  mx.setTransform(v.m[0], 0, 0, v.m[3], v.m[4] + ox * v.s, v.m[5]);
  for (const s of F.S) if (s.layer === 'FL' && s.phase === 'post' && t > s.t0) drawStroke(mx, s, t);
  mx.setTransform(...v.m);
  for (const s of F.S) if (s.layer === 'WORLD' && t > s.t0) drawStroke(mx, s, t);
  if (ox > 1) F.CARDS.forEach((c, k) => drawCard(mx, c, CARD_IMG[k], t, k));
  // slate micro grain where it can be seen
  if (v.s / KS > .6) {
    mx.save(); mx.beginPath(); mx.rect(0, 0, 6400, BH); mx.clip();
    PAT.setTransform(new DOMMatrix([.25, 0, 0, .25, 0, 0])); mx.globalCompositeOperation = 'soft-light'; mx.globalAlpha = Math.min(.2, (v.s / KS - .6) * .3);
    mx.fillStyle = PAT; mx.fillRect(0, 0, 6400, BH); mx.restore();
  }
  // morning light from the windows on the left: a soft falloff and a faint slanted patch low on the left
  mx.save(); mx.setTransform(...v.m);
  const lg = mx.createLinearGradient(-1500, 0, 7900, 0); lg.addColorStop(0, 'rgb(255,250,240)'); lg.addColorStop(.45, 'rgb(236,236,232)'); lg.addColorStop(1, 'rgb(196,198,200)');
  mx.globalCompositeOperation = 'multiply'; mx.fillStyle = lg; mx.fillRect(-1500, -1500, 9400, 4900);
  mx.globalCompositeOperation = 'screen'; mx.filter = `blur(${Math.max(3, 40 * v.s)}px)`;
  const pane = (x, y, w, h, a) => { mx.fillStyle = `rgba(255,212,150,${a})`; mx.beginPath(); mx.moveTo(x, y); mx.lineTo(x + w, y + w * .28); mx.lineTo(x + w, y + w * .28 + h); mx.lineTo(x, y + h); mx.closePath(); mx.fill(); };
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) pane(-260 + i * 400, 1060 + j * 330 + i * 400 * .28, 360, 300, .07 - i * .018);
  mx.restore();
  // the chalk's front: a few bright grains where the writing is now
  for (const s of F.S) {
    if (t <= s.t0 || t >= s.t1) continue;
    const f = s.prog(t); const p = s.at(f * s.len), o = s.layer === 'FL' ? ox : 0;
    drawFront(mx, t, v, p[0] + o, p[1], s.color, Math.min(s.w, 9), .5);
  }
  return c;
}

// ───────── subtitles: the spoken line on a soft dark plate above the bottom safe area (room for the phone's own UI)
await document.fonts.load('48px SubFace');
const sc = document.getElementById('s'); sc.width = W; sc.height = H; const sx = sc.getContext('2d');
const SZ = Math.round(W * .044), LH = Math.round(SZ * 1.3), BOT = H - Math.round(H * .17), MAXW = W - 2 * Math.round(W * .09);
const subAt = t => F.SUBS.find(q => t >= q.t0 && t < q.t1);
const NOSUBS = Q.has('nosubs');                            // ?nosubs: picture only (poster)
function wrap(txt) {
  sx.font = `${SZ}px SubFace`;
  if (sx.measureText(txt).width <= MAXW) return [txt];
  const w = txt.split(' '); let best = null;
  for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '), m = Math.max(sx.measureText(a).width, sx.measureText(b).width); if (!best || m < best[0]) best = [m, a, b]; }
  return [best[1], best[2]];
}
const BW_ = Math.round(W * .58), BH_ = Math.round(BW_ * BANNER.height / BANNER.width), BY_ = Math.round(H * .03);   // owner: smaller, in proportion (21 Nov 2026)
function subtitle(t) {
  sx.clearRect(0, 0, W, H);
  if (!Q.has('nobanner')) sx.drawImage(BANNER, (W - BW_) / 2, BY_, BW_, BH_);
  if (NOSUBS) return;
  const q = subAt(t); if (!q) return;
  const a = Math.min(1, (t - q.t0) / .12, (q.t1 - t) / .12), L = wrap(q.text);
  sx.font = `${SZ}px SubFace`;
  const w = Math.max(...L.map(s => sx.measureText(s).width)) + SZ * 1.3, x0 = (W - w) / 2, y1 = BOT + SZ * .55, y0 = BOT - SZ - (L.length - 1) * LH - SZ * .45;
  sx.globalAlpha = a * .62; sx.fillStyle = '#0a0f0c'; sx.beginPath(); sx.roundRect(x0, y0, w, y1 - y0, SZ * .3); sx.fill();
  sx.globalAlpha = a; sx.textAlign = 'center'; sx.textBaseline = 'alphabetic'; sx.fillStyle = '#f3efe4';
  L.forEach((s, i) => sx.fillText(s, W / 2, BOT - (L.length - 1 - i) * LH));
  sx.globalAlpha = 1;
}
const shotOf = t => F.camAt(t).shot;
window.render = t => {
  const c = frame(t);
  const tp = t - .5 / 30, pc = shotOf(tp) === c.shot ? F.camAt(tp) : c, k = pc.s / c.s;
  const bl = [k, 0, 0, 0, k, 0, W / 2 - k * W / 2 + pc.s * KS * (c.cx - pc.cx), H / 2 - k * H / 2 + pc.s * KS * (c.cy - pc.cy), 1];
  post.draw(main, bl, t, .3);
  subtitle(t);
};
window.TEXTS = t => {
  const c = F.camAt(t), v = view(c), ox = F.slideX(t), out = [];
  for (const q of F.TX) {
    if (t < q.t0 || t >= q.t1) continue;
    const o = q.layer === 'FL' ? ox : 0, [a, b] = v.toScreen(q.box[0] + o, q.box[1]), [d, e] = v.toScreen(q.box[2] + o, q.box[3]);
    out.push({ id: q.id, text: q.text, x0: a, y0: b, x1: d, y1: e });
  }
  return out;                                               // subtitles follow the voice; not part of the reading-time check
};
window.F = F;
window.render(+(Q.get('t') || 0));
window.READY = true;
