// ポップ文字（Demo）: CapCut のテキストテンプレートのような、縁取り・グラデーション・つや・飾り（星・ハート・集中線など）つきの文字。
// 文字の中身・位置・大きさ・回転は普通の文字と同じ（c.text, c.x, c.y, c.size, c.rot）。見た目は c.tpl で決まる。
// プレビューと書き出しで同じ描き方になるよう、時刻だけで動きが決まるようにしている。
//
// きれいに見せるため、1文字ずつではなく「層」ごとに全部の文字を描く（外側の縁 → 内側の縁 → 塗り → つや）。
// 1文字ずつ描くと、隣の文字の白い縁が前の文字の塗りに重なってしまうため。
import { fontString } from './fonts.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOutBack = (k) => { const s = 1.7; k -= 1; return 1 + (s + 1) * k * k * k + s * k * k; };
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
// 時刻と番号だけで決まる乱数（プレビューと書き出しで同じ飾りになる）
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// fill: 縦グラデーションの色（上→下）。strokes: 外側から順の縁 { c: 色, w: 太さ（文字の大きさに対する割合） }
// gloss: 上半分のつやの強さ。deco: 飾り。anim: 動き。rainbow: 1文字ずつ色を変える
export const POP_TEMPLATES = [
  { key: 'pink', label: 'ネオンピンク', font: 'mochiy', sample: 'うん！', fill: ['#ff7cc4', '#ff1f8e'], strokes: [{ c: '#ffffff', w: 0.11 }], glow: { c: '#ff2d95', blur: 0.5 }, gloss: 0.35, deco: 'sparkle', decoC: '#ffffff', anim: 'pop' },
  { key: 'gold', label: 'ゴールド', font: 'mochiy', sample: '絶対に\n成功する！', fill: ['#fff7c2', '#f6c84a', '#c8860f'], strokes: [{ c: '#3a2100', w: 0.1 }], shadow: { c: 'rgba(0,0,0,.45)', blur: 0.08, dy: 0.06 }, gloss: 0.5, deco: 'shine', anim: 'pop' },
  { key: 'starvlog', label: '星デコ', font: 'mochiy', sample: 'わたしの\nVlog', fill: ['#ffe3f1', '#ff8cc6'], strokes: [{ c: '#ffffff', w: 0.15 }, { c: '#5b1638', w: 0.075 }], shadow: { c: 'rgba(60,0,30,.35)', blur: 0.06, dy: 0.06 }, gloss: 0.4, deco: 'stars', decoC: '#ff8cc6', anim: 'bounce' },
  { key: 'burst', label: '集中線', font: 'dela', sample: 'やったー！', fill: ['#fff27a', '#ffc800'], strokes: [{ c: '#ffffff', w: 0.14 }, { c: '#111111', w: 0.08 }], gloss: 0.3, deco: 'burst', decoC: '#ffffff', anim: 'punch' },
  { key: 'fuwa', label: 'ふわふわ', font: 'maru', sample: 'ふわふわ〜', fill: ['#fff0f7', '#ffc2de'], strokes: [{ c: '#ffffff', w: 0.06 }], glow: { c: '#ff8cc6', blur: 0.55 }, gloss: 0.2, deco: 'none', anim: 'float' },
  { key: 'bubble', label: 'バブル紫', font: 'mochiy', sample: 'ひとつの\n目標', fill: ['#ffffff', '#efe6ff'], strokes: [{ c: '#2a1350', w: 0.16 }, { c: '#8a4dff', w: 0.11 }], shadow: { c: 'rgba(30,0,60,.4)', blur: 0.05, dy: 0.07 }, gloss: 0.25, deco: 'none', anim: 'bounce' },
  { key: 'heart', label: 'ハート', font: 'mochiy', sample: '毎日ドキドキ', fill: ['#ff9ac6', '#ff4f97'], strokes: [{ c: '#ffffff', w: 0.13 }], shadow: { c: 'rgba(120,0,50,.35)', blur: 0.06, dy: 0.05 }, gloss: 0.4, deco: 'hearts', decoC: '#ff7fb3', anim: 'pop' },
  { key: 'cream', label: 'クリーム星', font: 'mochiy', sample: 'A Day\nWith Me', fill: ['#fff9d6', '#ffe58a'], strokes: [{ c: '#3d2410', w: 0.09 }], shadow: { c: 'rgba(0,0,0,.35)', blur: 0.05, dy: 0.05 }, gloss: 0.3, deco: 'stars', decoC: '#fff2b0', anim: 'wave' },
  { key: 'glitter', label: 'キラキラピンク', font: 'mochiy', sample: 'しあわせな\n毎日', fill: ['#ffb3d6', '#ff5aa5'], strokes: [{ c: '#ff7ab8', w: 0.17 }, { c: '#ffffff', w: 0.11 }], shadow: { c: 'rgba(120,0,60,.3)', blur: 0.08, dy: 0.06 }, gloss: 0.35, deco: 'glitter', decoC: '#ffffff', anim: 'pop' },
  { key: 'travel', label: 'トラベル', font: 'dela', sample: 'TRAVEL\nDIARY', fill: ['#ffe066', '#ff8a1f'], strokes: [{ c: '#ffffff', w: 0.12 }, { c: '#5a2a00', w: 0.07 }], shadow: { c: 'rgba(0,0,0,.3)', blur: 0.05, dy: 0.06 }, gloss: 0.35, deco: 'stars', decoC: '#ffd23f', anim: 'bounce', tilt: -4 },
  { key: 'rainbow', label: 'パステル虹', font: 'mochiy', sample: 'だいすき\nVlog', rainbow: true, strokes: [{ c: '#ffffff', w: 0.15 }, { c: '#4b2a8a', w: 0.08 }], shadow: { c: 'rgba(40,0,80,.35)', blur: 0.06, dy: 0.06 }, gloss: 0.45, deco: 'none', anim: 'wave' },
  { key: 'neon', label: 'ネオン', font: 'maru', sample: 'NEON', fill: ['#ffffff', '#e8fbff'], strokes: [{ c: '#24d6ff', w: 0.05 }], glow: { c: '#24d6ff', blur: 0.6 }, gloss: 0, deco: 'none', anim: 'flicker' },
];
// 以前の版のテンプレート名 → 今のテンプレート（保存してある編集を開いたとき用）
const OLD = { bounce: 'starvlog', impact: 'burst', arch: 'rainbow', jelly: 'heart', wave: 'cream', glitch: 'neon', stamp: 'glitter' };
export const popTemplate = (key) => POP_TEMPLATES.find((x) => x.key === key) || POP_TEMPLATES.find((x) => x.key === OLD[key]) || POP_TEMPLATES[0];

const PASTEL = [['#ffd6e7', '#ff7fb0'], ['#ffe9c7', '#ffad4f'], ['#fffbc7', '#ffd93d'], ['#d9ffd9', '#5fd47a'], ['#d6f1ff', '#4fb3ff'], ['#eadcff', '#a070ff']];

// 1文字ずつの並び（行ごとに中央そろえ、少し詰める）。x, y は文字の中心
function layout(ctx, text, px) {
  const lines = text.split('\n');
  const lineH = px * 1.22;
  const gap = -px * 0.03;
  const out = [];
  let idx = 0;
  lines.forEach((l, li) => {
    const chars = Array.from(l);
    const ws = chars.map((ch) => ctx.measureText(ch).width);
    const total = ws.reduce((a, b) => a + b, 0) + gap * Math.max(0, chars.length - 1);
    let x = -total / 2;
    const y = (li - (lines.length - 1) / 2) * lineH;
    chars.forEach((ch, i) => {
      out.push({ ch, x: x + ws[i] / 2, y, w: ws[i], i: idx++, line: li });
      x += ws[i] + gap;
    });
  });
  const maxW = Math.max(px, ...lines.map((l) => { const cs = Array.from(l); return cs.reduce((a, ch) => a + ctx.measureText(ch).width, 0) + gap * Math.max(0, cs.length - 1); }));
  return { chars: out, w: maxW, h: lines.length * lineH };
}

// 1文字ごとの動き（位置・回転・拡大・不透明度）
function motion(tp, g, local, N) {
  const m = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, a: 1 };
  switch (tp.anim) {
    case 'pop': { // 全体がポンッと出る。そのあと少し呼吸する
      const k = clamp01(local / 0.32);
      const s = easeOutBack(k) * (1 + Math.sin(local * 3) * 0.015);
      m.sx = m.sy = s; m.a = clamp01(local / 0.08);
      break;
    }
    case 'bounce': { // 1文字ずつ飛び出し、そのあと順番にぴょこぴょこ跳ねる
      const k = clamp01((local - g.i * 0.05) / 0.3);
      m.sx = m.sy = easeOutBack(k); m.a = clamp01(k * 3);
      const ph = (local * 1.6 - g.i * 0.12) % 1.6;
      m.dy = -(ph > 0 && ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI) : 0) * 0.12;
      break;
    }
    case 'wave': { // 波のようにゆらゆら
      const k = clamp01((local - g.i * 0.04) / 0.3);
      m.a = clamp01(k * 2); m.sx = m.sy = 0.6 + 0.4 * easeOut(k);
      m.dy = Math.sin(local * 3.2 - g.i * 0.6) * 0.06;
      m.rot = Math.cos(local * 3.2 - g.i * 0.6) * 0.05;
      break;
    }
    case 'float': { // ふわっと浮かび上がって、ゆっくり上下する
      const k = easeOut(clamp01(local / 0.6));
      m.a = k; m.dy = (1 - k) * 0.4 + Math.sin(local * 1.8 + g.i * 0.4) * 0.04;
      break;
    }
    case 'punch': { // 大きく飛び込んで止まる
      const k = clamp01(local / 0.22);
      m.sx = m.sy = k < 1 ? 1.9 - 0.9 * easeOutBack(k) : 1 + Math.sin(local * 2.5) * 0.02;
      m.a = clamp01(local / 0.06);
      break;
    }
    case 'flicker': { // 最初にチカチカ点く。そのあと光が脈打つ
      m.a = local < 0.6 ? (rnd(Math.floor(local * 25) + g.i) > 0.35 ? 1 : 0.2) : 1;
      break;
    }
  }
  return m;
}

// 星（5つの角）
function starPath(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}
function heartPath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.35);
  ctx.bezierCurveTo(-r * 1.1, -r * 0.35, -r * 0.45, -r * 1.05, 0, -r * 0.45);
  ctx.bezierCurveTo(r * 0.45, -r * 1.05, r * 1.1, -r * 0.35, 0, r * 0.35);
  ctx.closePath();
}

// 飾り。front=false は文字の後ろ、true は前に描く
function drawDeco(ctx, tp, L, px, local, front) {
  const W = L.w, H = L.h;
  const appear = clamp01((local - 0.2) / 0.3);
  if (appear <= 0) return;
  ctx.save();
  switch (tp.deco) {
    case 'burst': if (!front) { // 集中線（後ろ）
      const n = 22, r0 = Math.max(W, H) * 0.62, pulse = 1 + Math.sin(local * 6) * 0.04;
      ctx.fillStyle = tp.decoC;
      ctx.globalAlpha *= appear;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd(i) * 0.2, len = px * (0.35 + rnd(i + 9) * 0.5);
        const r1 = r0 * pulse * (0.9 + rnd(i + 3) * 0.2);
        ctx.save();
        ctx.scale(1, H / W * 1.6 > 1 ? 1 : 0.75);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(r1, -px * 0.025); ctx.lineTo(r1 + len, 0); ctx.lineTo(r1, px * 0.025);
        ctx.fill();
        ctx.restore();
      }
    } break;
    case 'stars': if (front) { // 星が周りでまたたく
      const spots = [[-0.55, -0.6, 0.22], [0.58, -0.55, 0.16], [0.62, 0.55, 0.2], [-0.6, 0.5, 0.14], [0.05, -0.78, 0.11]];
      spots.forEach(([u, v, s], i) => {
        const tw = 0.75 + 0.25 * Math.sin(local * 4 + i * 1.7);
        ctx.save();
        ctx.translate(u * W, v * (H + px * 0.6));
        ctx.rotate(Math.sin(local * 2 + i) * 0.3);
        const r = px * s * tw * easeOutBack(appear);
        starPath(ctx, r);
        ctx.lineJoin = 'round';
        ctx.lineWidth = px * 0.05; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        ctx.fillStyle = tp.decoC; ctx.fill();
        ctx.restore();
      });
    } break;
    case 'hearts': if (front) { // ハートがふわふわ浮かぶ
      for (let i = 0; i < 6; i++) {
        const per = 2.4, ph = ((local + rnd(i) * per) % per) / per;
        const x = (rnd(i + 5) - 0.5) * W * 1.15, y = H * 0.5 - ph * (H + px * 1.2);
        ctx.save();
        ctx.globalAlpha *= Math.sin(ph * Math.PI) * appear;
        ctx.translate(x + Math.sin(ph * 6 + i) * px * 0.1, y);
        const r = px * (0.14 + rnd(i + 2) * 0.1);
        heartPath(ctx, r);
        ctx.lineWidth = px * 0.04; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = tp.decoC; ctx.fill();
        ctx.restore();
      }
    } break;
    case 'sparkle': if (front) { // 角の「ピッピッ」という線
      ctx.strokeStyle = tp.decoC; ctx.lineCap = 'round'; ctx.lineWidth = px * 0.045;
      [[0.52, -0.5, -0.9], [-0.52, 0.55, 2.2]].forEach(([u, v, base], j) => {
        for (let i = 0; i < 3; i++) {
          const a = base + (i - 1) * 0.55, k = 0.8 + 0.2 * Math.sin(local * 6 + i + j * 2);
          const x = u * W + Math.cos(a) * px * 0.25, y = v * H + Math.sin(a) * px * 0.25;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * px * 0.2 * k * appear, y + Math.sin(a) * px * 0.2 * k * appear); ctx.stroke();
        }
      });
    } break;
    case 'glitter': if (front) { // 小さなキラキラの粒
      for (let i = 0; i < 14; i++) {
        const tw = Math.max(0, Math.sin(local * 5 + i * 2.1));
        if (tw < 0.2) continue;
        const x = (rnd(i) - 0.5) * W * 1.2, y = (rnd(i + 30) - 0.5) * (H + px * 0.5);
        const r = px * 0.08 * tw * appear;
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = tp.decoC;
        ctx.beginPath(); ctx.moveTo(0, -r * 2); ctx.quadraticCurveTo(0, 0, r * 2, 0); ctx.quadraticCurveTo(0, 0, 0, r * 2); ctx.quadraticCurveTo(0, 0, -r * 2, 0); ctx.quadraticCurveTo(0, 0, 0, -r * 2); ctx.fill();
        ctx.restore();
      }
    } break;
  }
  ctx.restore();
}

// 文字の外枠の大きさ（選択枠とタップ判定用）。縁と飾りのぶん大きめにする
export function popBounds(ctx, c, W, H) {
  const px = c.size * Math.min(W, H);
  const tp = popTemplate(c.tpl);
  ctx.save();
  ctx.font = fontString(tp.font, px);
  const L = layout(ctx, c.text, px);
  ctx.restore();
  const pad = px * 0.35;
  return { cx: c.x * W, cy: c.y * H, w: L.w + pad * 2, h: L.h + pad * 2, rot: ((c.rot + (tp.tilt || 0)) * Math.PI) / 180 };
}

// t: タイムラインの時刻。null なら止まった見た目（出てきたあとの状態）で描く
export function drawPopText(ctx, c, W, H, t) {
  if (!c.text) return;
  const tp = popTemplate(c.tpl);
  const px = c.size * Math.min(W, H);
  const local = t == null ? 1.4 : t - c.start;
  const dur = c.end - c.start;
  const outK = t == null ? 1 : clamp01((dur - local) / 0.25);
  ctx.save();
  ctx.translate(c.x * W, c.y * H);
  ctx.rotate(((c.rot + (tp.tilt || 0)) * Math.PI) / 180);
  ctx.globalAlpha *= outK;
  ctx.font = fontString(tp.font, px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const L = layout(ctx, c.text, px);
  const N = Math.max(1, L.chars.length);
  const chars = L.chars.filter((g) => g.ch.trim()).map((g) => ({ g, m: motion(tp, g, local, N) }));
  // 1文字ずつ位置を合わせて fn を呼ぶ
  const each = (fn) => chars.forEach(({ g, m }) => {
    if (m.a <= 0) return;
    ctx.save();
    ctx.translate(g.x + m.dx * px, g.y + m.dy * px);
    ctx.rotate(m.rot);
    ctx.scale(m.sx, m.sy);
    ctx.globalAlpha *= m.a;
    fn(g);
    ctx.restore();
  });
  const grad = (stops) => {
    const gr = ctx.createLinearGradient(0, -px * 0.5, 0, px * 0.5);
    stops.forEach((s, i) => gr.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), s));
    return gr;
  };

  drawDeco(ctx, tp, L, px, local, false);
  // 外側の縁から順に（いちばん外側に影・光をつける）
  const total = tp.strokes.reduce((a, s) => a + s.w, 0);
  let acc = total;
  tp.strokes.forEach((s, si) => {
    const w = acc;
    acc -= s.w;
    each((g) => {
      if (si === 0 && (tp.shadow || tp.glow)) {
        const e = tp.glow || tp.shadow;
        ctx.shadowColor = e.c; ctx.shadowBlur = e.blur * px; ctx.shadowOffsetY = (e.dy || 0) * px;
      }
      ctx.strokeStyle = s.c;
      ctx.lineWidth = w * px * 2;
      ctx.strokeText(g.ch, 0, 0);
    });
  });
  // 塗り
  each((g) => {
    if (!tp.strokes.length && tp.glow) { ctx.shadowColor = tp.glow.c; ctx.shadowBlur = tp.glow.blur * px; }
    ctx.fillStyle = tp.rainbow ? grad(PASTEL[g.i % PASTEL.length]) : grad(tp.fill);
    ctx.fillText(g.ch, 0, 0);
  });
  // つや（上半分に白いグラデーション）
  if (tp.gloss) each((g) => {
    const gr = ctx.createLinearGradient(0, -px * 0.5, 0, px * 0.1);
    gr.addColorStop(0, `rgba(255,255,255,${tp.gloss})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillText(g.ch, 0, 0);
  });
  // ゴールド: 光の帯が流れる
  if (tp.deco === 'shine') {
    const per = 2.2, ph = ((local % per) / per) * 3 - 1;
    each((g) => {
      const x0 = (ph * L.w - g.x) - px * 0.3;
      const gr = ctx.createLinearGradient(x0, -px * 0.5, x0 + px * 0.6, px * 0.5);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr;
      ctx.fillText(g.ch, 0, 0);
    });
  }
  // ネオン: 光が脈打つ
  if (tp.anim === 'flicker' && tp.glow) {
    ctx.globalAlpha *= 0.35 + 0.25 * Math.sin(local * 4);
    each((g) => { ctx.shadowColor = tp.glow.c; ctx.shadowBlur = px * 0.9; ctx.fillStyle = '#fff'; ctx.fillText(g.ch, 0, 0); });
  }
  drawDeco(ctx, tp, L, px, local, true);
  ctx.restore();
}
