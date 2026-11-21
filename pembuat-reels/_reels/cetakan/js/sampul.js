// Reels cover (index.html?sampul): one fixed layout for every reel so the profile grid looks tidy.
// Instagram's grid shows the middle 3:4 of a 9:16 reel (y 240…1680 at 1080×1920), so everything that matters sits there:
// the theme in small orange chalk, the title in big white chalk (≤ 3 lines), and the Akadiva logo card. Same slate,
// wooden rail and watermark banner as the film. Drawn in screen pixels; chalk strokes are drawn complete.
import { bake, drawStroke } from './chalk.js';
import { writeLatin, latinWidth } from './hand.js';
import { bakeSlate } from './stage.js';

const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

// split a title into ≤ maxLines lines that each fit maxW at cap; shrink cap until it fits
function tataJudul(txt, maxW, cap0, maxLines) {
  const words = txt.split(/\s+/);
  for (let cap = cap0; cap >= 40; cap -= 4) {
    const lines = []; let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (latinWidth(t, cap) <= maxW) cur = t; else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length <= maxLines && lines.every(l => latinWidth(l, cap) <= maxW)) {
      // balance: same number of lines, but split where the widest line is as narrow as possible (no lonely "yang")
      const n = lines.length; let best = null;
      const split = (i, k, acc) => {
        if (k === 1) { const l = words.slice(i).join(' '); const all = [...acc, l]; const m = Math.max(...all.map(s => latinWidth(s, cap))); if (m <= maxW && (!best || m < best.m)) best = { m, all }; return; }
        for (let j = i + 1; j <= words.length - k + 1; j++) split(j, k - 1, [...acc, words.slice(i, j).join(' ')]);
      };
      split(0, n, []);
      return { cap, lines: best ? best.all : lines };
    }
  }
  return { cap: 40, lines: [txt] };
}

export async function gambar(cv, W, H, K) {
  const x = cv.getContext('2d');
  // slate fills the frame; a wooden rail at the top like the film's board frame
  const slate = bakeSlate(Math.ceil(W * 1.6), Math.ceil(H * 1.6), 61).cv;
  x.drawImage(slate, 0, 0, slate.width, slate.height, 0, 0, W, H);
  const RAIL = Math.round(H * .095);
  const g = x.createLinearGradient(0, RAIL - 34, 0, RAIL + 6);
  g.addColorStop(0, '#8a6440'); g.addColorStop(.6, '#6a4a2e'); g.addColorStop(1, '#3d2a19');
  x.fillStyle = '#bdb8a8'; x.fillRect(0, 0, W, RAIL - 34);
  x.fillStyle = g; x.fillRect(0, RAIL - 34, W, 40);
  x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, RAIL + 6, W, 10);

  const S = [];
  const tulis = (txt, cx, by, cap, o) => { const s = writeLatin(txt, cx - latinWidth(txt, cap) / 2, by, cap, 0, o); S.push(...s); return s; };
  // theme: small orange chalk, upper part of the 3:4 crop
  const tema = String(K.tema || '').toUpperCase();
  const cT = Math.min(52, 52 * 860 / Math.max(1, latinWidth(tema, 52)));
  const yT = Math.round(H * .245);
  tulis(tema, W / 2, yT, cT, { color: 'orange', lspeed: 60, seed: 3 });
  const wT = latinWidth(tema, cT);
  // title: big white chalk, centred in the crop
  const { cap, lines } = tataJudul(String(K.judul || ''), W * .84, 118, 3);
  const lh = cap * 1.55, yMid = H * .47, y0 = yMid - (lines.length - 1) * lh / 2 + cap / 2;
  lines.forEach((l, i) => tulis(l, W / 2, y0 + i * lh, cap, { lspeed: 60, seed: 10 + i }));
  for (const s of S) { bake(s, 2); }
  for (const s of S) drawStroke(x, s, 1e4);
  // orange underline under the theme (a soft chalk band)
  x.save(); x.strokeStyle = 'rgba(255,150,70,.85)'; x.lineWidth = 7; x.lineCap = 'round';
  x.beginPath(); x.moveTo(W / 2 - wT / 2, yT + 26); x.quadraticCurveTo(W / 2, yT + 20, W / 2 + wT / 2, yT + 22); x.stroke(); x.restore();

  // Akadiva logo card, lower part of the crop
  const logo = await loadImg('img/akadiva.png');
  const cw = W * .52, lw = cw - 60, lhh = lw * logo.height / logo.width, ch = lhh + 50, cx = W / 2, cy = H * .79;
  x.save(); x.translate(cx, cy); x.rotate(-.012);
  x.save(); x.filter = 'blur(14px)'; x.fillStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.roundRect(-cw / 2 + 8, -ch / 2 + 14, cw, ch, 14); x.fill(); x.restore();
  x.fillStyle = '#f7f5ef'; x.beginPath(); x.roundRect(-cw / 2, -ch / 2, cw, ch, 14); x.fill();
  x.drawImage(logo, -lw / 2, -lhh / 2, lw, lhh);
  x.fillStyle = 'rgba(236,228,200,.72)';
  for (const sx of [-1, 1]) { x.save(); x.translate(sx * (cw / 2 - 34), -ch / 2 + 4); x.rotate(sx * -.5); x.fillRect(-44, -13, 88, 26); x.restore(); }
  x.restore();

  // window light falloff + vignette, like the film's grade
  const lg = x.createLinearGradient(0, 0, W, 0); lg.addColorStop(0, 'rgba(255,250,240,.06)'); lg.addColorStop(1, 'rgba(0,0,0,.10)');
  x.fillStyle = lg; x.fillRect(0, 0, W, H);
  const vg = x.createRadialGradient(W / 2, H * .5, H * .35, W / 2, H * .5, H * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)');
  x.fillStyle = vg; x.fillRect(0, 0, W, H);

  // the watermark banner, same place as in the film (outside the grid crop)
  const ban = await loadImg('img/banner.png');
  const bw = Math.round(W * .58), bh = Math.round(bw * ban.height / ban.width);
  x.drawImage(ban, (W - bw) / 2, Math.round(H * .03), bw, bh);
}
