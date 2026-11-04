// ポップ文字（Demo）: CapCut のテキストテンプレートのような、1文字ずつ動く・光る・色がつく文字。
// 文字の中身・位置・大きさ・回転は普通の文字と同じ（c.text, c.x, c.y, c.size, c.rot）。見た目は c.tpl で決まる。
// プレビューと書き出しで同じ描き方になるよう、時刻だけで動きが決まるようにしている。
import { fontString } from './fonts.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOutBack = (k) => { const s = 1.9; k -= 1; return 1 + (s + 1) * k * k * k + s * k * k; };
const hsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360},${s}%,${l}%)`;

// sample: テンプレートを選ぶ画面の見本の文字
export const POP_TEMPLATES = [
  { key: 'bounce', label: 'ぴょんぴょん', font: 'mochiy', sample: 'やったー！' },
  { key: 'impact', label: 'ドーン！', font: 'dela', sample: 'ドーン！' },
  { key: 'neon', label: 'ネオン', font: 'maru', sample: 'NEON' },
  { key: 'arch', label: 'アーチ', font: 'mochiy', sample: 'おめでとう' },
  { key: 'jelly', label: 'ぷるぷる', font: 'mochiy', sample: 'ぷるぷる' },
  { key: 'wave', label: 'ゆらゆら虹', font: 'maru', sample: 'ゆらゆら～' },
  { key: 'glitch', label: 'グリッチ', font: 'dela', sample: 'GLITCH' },
  { key: 'stamp', label: 'ポンポン', font: 'rock', sample: 'ポンポン' },
];
export const popTemplate = (key) => POP_TEMPLATES.find((x) => x.key === key);

// 1文字ずつの並び（行ごとに中央そろえ）。返す x, y は文字の中心
function layout(ctx, text, px) {
  const lines = text.split('\n');
  const lineH = px * 1.3;
  const out = [];
  let idx = 0;
  lines.forEach((l, li) => {
    const chars = Array.from(l);
    const ws = chars.map((ch) => ctx.measureText(ch).width);
    const total = ws.reduce((a, b) => a + b, 0);
    let x = -total / 2;
    const y = (li - (lines.length - 1) / 2) * lineH;
    chars.forEach((ch, i) => {
      out.push({ ch, x: x + ws[i] / 2, y, w: ws[i], i: idx++, line: li, n: chars.length, col: i });
      x += ws[i];
    });
  });
  return out;
}

// 1文字を描く。strokes は外側から順に { color, width }（文字の大きさに対する割合）
function drawChar(ctx, ch, px, { fill, strokes = [], shadow, glow, extrude }) {
  if (extrude) {
    for (let k = extrude.n; k >= 1; k--) {
      ctx.save();
      ctx.translate(extrude.dx * k, extrude.dy * k);
      if (strokes.length) { ctx.strokeStyle = extrude.color; ctx.lineWidth = strokes[0].width * px * 2; ctx.strokeText(ch, 0, 0); }
      ctx.fillStyle = extrude.color;
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }
  }
  strokes.forEach((s, i) => {
    ctx.save();
    if (i === 0 && shadow) { ctx.shadowColor = shadow.color; ctx.shadowBlur = shadow.blur * px; ctx.shadowOffsetY = shadow.dy * px; }
    if (i === 0 && glow) { ctx.shadowColor = glow.color; ctx.shadowBlur = glow.blur * px; }
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width * px * 2;
    ctx.strokeText(ch, 0, 0);
    ctx.restore();
  });
  ctx.save();
  if (!strokes.length && glow) { ctx.shadowColor = glow.color; ctx.shadowBlur = glow.blur * px; }
  ctx.fillStyle = fill;
  ctx.fillText(ch, 0, 0);
  ctx.restore();
}

// 縦グラデーション（文字の中心が 0）
function vgrad(ctx, px, a, b) {
  const g = ctx.createLinearGradient(0, -px * 0.55, 0, px * 0.55);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}

// 文字の外枠の大きさ（選択枠とタップ判定用）。動きで少しはみ出すぶん大きめにする
export function popBounds(ctx, c, W, H) {
  const px = c.size * Math.min(W, H);
  ctx.save();
  ctx.font = fontString(c.font, px);
  const lines = c.text.split('\n');
  const maxW = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
  ctx.restore();
  const pad = px * 0.35;
  return { cx: c.x * W, cy: c.y * H, w: maxW + pad * 2, h: lines.length * px * 1.3 + pad * 2 + (c.tpl === 'arch' ? px * 0.6 : 0), rot: (c.rot * Math.PI) / 180 };
}

// t: タイムラインの時刻。null なら止まった見た目（出てきたあとの状態）で描く
export function drawPopText(ctx, c, W, H, t) {
  if (!c.text) return;
  const px = c.size * Math.min(W, H);
  const local = t == null ? 1.2 : t - c.start;
  const dur = c.end - c.start;
  const outK = t == null ? 1 : clamp01((dur - local) / 0.25);
  ctx.save();
  ctx.translate(c.x * W, c.y * H);
  ctx.rotate((c.rot * Math.PI) / 180);
  ctx.globalAlpha *= outK;
  ctx.font = fontString(c.font, px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const chars = layout(ctx, c.text, px);
  const N = Math.max(1, chars.length);
  const each = (fn) => chars.forEach((g) => { if (g.ch.trim()) { ctx.save(); fn(g); ctx.restore(); } });

  switch (c.tpl) {
    // 1文字ずつ順番に飛び出して、そのあとも波のように弾む。1文字ごとに色ちがい
    case 'bounce': each((g) => {
      const k = clamp01((local - g.i * 0.05) / 0.35);
      if (k <= 0) return;
      const s = easeOutBack(k);
      const hop = Math.max(0, Math.sin(local * 6 - g.i * 0.6)) * px * 0.12;
      ctx.translate(g.x, g.y - hop - (1 - k) * px * 0.5);
      ctx.rotate((g.i % 2 ? 1 : -1) * 0.08);
      ctx.scale(s, s);
      const hue = [350, 30, 50, 140, 200, 280][g.i % 6];
      drawChar(ctx, g.ch, px, { fill: vgrad(ctx, px, hsl(hue, 100, 72), hsl(hue, 95, 55)), strokes: [{ color: '#3a1a4a', width: 0.16 }, { color: '#fff', width: 0.09 }], shadow: { color: 'rgba(0,0,0,.35)', blur: 0.06, dy: 0.06 } });
    }); break;

    // 大きく飛び込んできて揺れる。黄色からオレンジ、厚みのある立体
    case 'impact': {
      const k = clamp01(local / 0.3);
      const s = k < 1 ? 2.6 - 1.6 * easeOutBack(k) : 1;
      const shake = local < 0.7 ? Math.sin(local * 80) * px * 0.04 * (1 - local / 0.7) : 0;
      ctx.translate(shake, -shake * 0.6);
      ctx.scale(s, s);
      ctx.globalAlpha *= clamp01(local / 0.08);
      each((g) => {
        ctx.translate(g.x, g.y);
        ctx.transform(1, 0, -0.12, 1, 0, 0);
        drawChar(ctx, g.ch, px, { fill: vgrad(ctx, px, '#fff36b', '#ff8a00'), strokes: [{ color: '#1a0f00', width: 0.12 }], extrude: { n: 6, dx: px * 0.015, dy: px * 0.022, color: '#8a2a00' } });
      });
      break;
    }

    // 光る。最初にチカチカ点いて、そのあとゆっくり明るさが脈打つ
    case 'neon': {
      const on = local < 0.5 ? (Math.sin(local * 90) > -0.2 ? 1 : 0.15) : 0.85 + 0.15 * Math.sin(local * 5);
      ctx.globalAlpha *= on;
      each((g) => {
        ctx.translate(g.x, g.y);
        const hue = 300 - (g.i / N) * 120;
        drawChar(ctx, g.ch, px, { fill: '#fff', strokes: [{ color: hsl(hue, 100, 60), width: 0.07 }], glow: { color: hsl(hue, 100, 60), blur: 0.45 } });
        drawChar(ctx, g.ch, px, { fill: '#fff', glow: { color: hsl(hue, 100, 70), blur: 0.15 } });
      });
      break;
    }

    // 文字がアーチ状に曲がって並び、ゆっくり左右に揺れる。虹色
    case 'arch': {
      const k = easeOutBack(clamp01(local / 0.4));
      ctx.scale(k, k);
      ctx.rotate(Math.sin(local * 2) * 0.06);
      each((g) => {
        const u = g.n > 1 ? g.col / (g.n - 1) - 0.5 : 0; // -0.5〜0.5
        const ang = u * 1.1;
        ctx.translate(g.x, g.y + (1 - Math.cos(ang)) * px * 1.6 - px * 0.2);
        ctx.rotate(ang * 0.9);
        const hue = 330 + u * 220;
        drawChar(ctx, g.ch, px, { fill: vgrad(ctx, px, hsl(hue, 100, 75), hsl(hue + 20, 95, 55)), strokes: [{ color: '#2a1050', width: 0.15 }, { color: '#fff', width: 0.08 }], shadow: { color: 'rgba(0,0,0,.3)', blur: 0.05, dy: 0.05 } });
      });
      break;
    }

    // ぷるぷる伸び縮みする。キャンディのようなピンクとつや
    case 'jelly': each((g) => {
      const k = clamp01((local - g.i * 0.04) / 0.3);
      if (k <= 0) return;
      const wob = Math.sin(local * 9 - g.i * 0.8);
      const sx = (1 + wob * 0.12) * easeOutBack(k), sy = (1 - wob * 0.12) * easeOutBack(k);
      ctx.translate(g.x, g.y + px * 0.5);
      ctx.scale(sx, sy);
      ctx.translate(0, -px * 0.5);
      drawChar(ctx, g.ch, px, { fill: vgrad(ctx, px, '#ffd1ec', '#ff4fa8'), strokes: [{ color: '#a0005a', width: 0.14 }, { color: '#fff', width: 0.08 }] });
    }); break;

    // 波のように上下に揺れながら、色が流れていく
    case 'wave': each((g) => {
      const k = clamp01((local - g.i * 0.03) / 0.3);
      if (k <= 0) return;
      ctx.globalAlpha *= k;
      ctx.translate(g.x, g.y + Math.sin(local * 4 - g.i * 0.7) * px * 0.15);
      ctx.rotate(Math.cos(local * 4 - g.i * 0.7) * 0.12);
      const hue = local * 120 + g.i * 30;
      drawChar(ctx, g.ch, px, { fill: hsl(hue, 100, 62), strokes: [{ color: '#fff', width: 0.12 }], shadow: { color: hsl(hue, 100, 35), blur: 0.08, dy: 0.06 } });
    }); break;

    // 赤と青にずれてチラつく
    case 'glitch': {
      const step = Math.floor(local * 14);
      const r1 = Math.sin(step * 12.9898) * 43758.5453, rnd = r1 - Math.floor(r1);
      const burst = rnd > 0.7 || local < 0.4;
      const off = (burst ? 0.06 : 0.02) * px;
      each((g) => {
        ctx.translate(g.x, g.y);
        const jx = burst && (g.i + step) % 3 === 0 ? (rnd - 0.5) * px * 0.2 : 0;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#ff2050'; ctx.fillText(g.ch, -off + jx, 0);
        ctx.fillStyle = '#20e0ff'; ctx.fillText(g.ch, off + jx, 0);
        ctx.globalCompositeOperation = 'source-over';
        drawChar(ctx, g.ch, px, { fill: '#fff', strokes: [{ color: '#111', width: 0.05 }] });
      });
      break;
    }

    // 1文字ずつ丸いバッジに乗ってポンッと出てくる
    case 'stamp': each((g) => {
      const k = clamp01((local - g.i * 0.09) / 0.3);
      if (k <= 0) return;
      const s = easeOutBack(k);
      ctx.translate(g.x, g.y);
      ctx.rotate((1 - k) * 1.2 + (g.i % 2 ? 0.1 : -0.1));
      ctx.scale(s, s);
      const hue = [10, 45, 160, 205, 285][g.i % 5];
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(g.w, px) * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = hsl(hue, 90, 58);
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = px * 0.08; ctx.shadowOffsetY = px * 0.05;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = px * 0.06; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.scale(0.8, 0.8);
      drawChar(ctx, g.ch, px, { fill: '#fff', strokes: [{ color: hsl(hue, 80, 30), width: 0.1 }] });
    }); break;
  }
  ctx.restore();
}
