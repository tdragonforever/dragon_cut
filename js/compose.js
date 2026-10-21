// メイン動画の1フレームを組み立てる: クリップの切り替え・トランジション・ズームパン（ケン・バーンズ）・色調補正
// プレビューと書き出しで共用する。描く座標は画面（frame）の座標。
import { clipTimes, clipAt, srcTimeAt, fitRect } from './project.js';
import { glProc, colorActive, defaultColor } from './gl.js';

export const TRANSITIONS = [
  { key: 'none', label: 'なし' },
  { key: 'cross', label: 'クロスフェード' },
  { key: 'black', label: '暗転' },
  { key: 'white', label: 'ホワイト' },
  { key: 'slideL', label: 'スライド（左へ）' },
  { key: 'slideU', label: 'スライド（上へ）' },
  { key: 'zoom', label: 'ズーム' },
  { key: 'wipe', label: 'ワイプ' },
  { key: 'circle', label: '円形' },
];

export const MOTIONS = [
  { key: 'none', label: 'なし' },
  { key: 'in', label: 'ズームイン' },
  { key: 'out', label: 'ズームアウト' },
  { key: 'left', label: '左へ' },
  { key: 'right', label: '右へ' },
  { key: 'up', label: '上へ' },
  { key: 'down', label: '下へ' },
];

// 時刻 t がつなぎ目のトランジション中なら、その情報を返す
// トランジションはつなぎ目 b を中心に [b - d/2, b + d/2)。前のクリップの続き・次のクリップの手前の映像も使う
export function transAt(p, t, ts = clipTimes(p)) {
  for (let i = 0; i < ts.length - 1; i++) {
    const A = ts[i], B = ts[i + 1], tr = A.clip.trans;
    if (!tr || tr.type === 'none') continue;
    const d = Math.min(tr.dur, (A.end - A.start), (B.end - B.start));
    const b = A.end;
    if (t >= b - d / 2 && t < b + d / 2) return { A, B, b, d, type: tr.type, k: (t - (b - d / 2)) / d };
    if (b - d / 2 > t) break;
  }
  return null;
}

// 時刻 t に必要なクリップと素材の時刻（1つ、トランジション中は2つ）
export function mainNeeds(p, t, ts = clipTimes(p)) {
  const tr = transAt(p, t, ts);
  if (!tr) { const x = clipAt(p, t); return x ? [{ x, st: srcTimeAt(x, t) }] : []; }
  const { A, B, b, type } = tr;
  const stA = t < b ? srcTimeAt(A, t) : A.clip.out + (t - b) * A.clip.speed;
  const stB = t < b ? B.clip.in + (t - b) * B.clip.speed : srcTimeAt(B, t);
  // 暗転・ホワイトは片方ずつで足りる
  if (type === 'black' || type === 'white') return t < b ? [{ x: A, st: stA }] : [{ x: B, st: stB }];
  return [{ x: A, st: stA }, { x: B, st: stB }];
}

// ズームパン: クリップ内の進み具合 k（0〜1）での拡大率とずれ（画面に対する割合）
export function motionAt(clip, k) {
  const m = clip.motion;
  if (!m || m.type === 'none') return null;
  const a = m.amount;
  const e = k * k * (3 - 2 * k) * 0.6 + k * 0.4;
  switch (m.type) {
    case 'in': return { s: 1 + a * e, dx: 0, dy: 0 };
    case 'out': return { s: 1 + a * (1 - e), dx: 0, dy: 0 };
    case 'left': return { s: 1 + a, dx: (a / 2) * (1 - 2 * e), dy: 0 };
    case 'right': return { s: 1 + a, dx: -(a / 2) * (1 - 2 * e), dy: 0 };
    case 'up': return { s: 1 + a, dx: 0, dy: (a / 2) * (1 - 2 * e) };
    case 'down': return { s: 1 + a, dx: 0, dy: -(a / 2) * (1 - 2 * e) };
  }
  return null;
}

// ぼかし背景: 素材を画面いっぱいに広げてぼかしたものを、余白の後ろに敷く
// 小さく描いてから引き伸ばすので軽い。ctx.filter が使えるときはさらにぼかしてなめらかにする
let blurCv = null;
const filterOk = (() => { try { const g = document.createElement('canvas').getContext('2d'); g.filter = 'blur(2px)'; return g.filter === 'blur(2px)'; } catch { return false; } })();
function drawBlurBg(c, F, f) {
  const k = 1 / 20;
  const w = Math.max(8, Math.round(F.width * k)), h = Math.max(8, Math.round(F.height * k));
  if (!blurCv) blurCv = document.createElement('canvas');
  if (blurCv.width !== w || blurCv.height !== h) { blurCv.width = w; blurCv.height = h; }
  const g = blurCv.getContext('2d');
  const r = fitRect(F, f.w, f.h, 'cover');
  g.filter = filterOk ? 'blur(2px)' : 'none';
  // ふちが透けないよう少し大きめに描く
  f.draw(g, r.x * k - 4, r.y * k - 4, r.w * k + 8, r.h * k + 8);
  g.filter = 'none';
  c.save();
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(blurCv, 0, 0, F.width, F.height);
  c.fillStyle = 'rgba(0,0,0,.2)';
  c.fillRect(0, 0, F.width, F.height);
  c.restore();
}

// クリップの映像を置く位置。画面に収めた位置（fit）に、ユーザーが動かした位置・大きさ（clip.tf）を足す
// tf: { s: 拡大率（1 = 収めた大きさ）, x, y: 画面の中心からのずれ（画面の幅・高さに対する割合） }
export function clipRect(F, fw, fh, clip) {
  const r = fitRect(F, fw, fh, clip.fit);
  const t = clip.tf;
  if (!t) return r;
  const w = r.w * t.s, h = r.h * t.s;
  return { x: F.width / 2 + t.x * F.width - w / 2, y: F.height / 2 + t.y * F.height - h / 2, w, h };
}

// HDR の明るさ補正（テスト機能）。p.hdrLift: 0 オフ / 1 弱 / 2 中 / 3 強。HDR の素材にだけかける
export const HDR_LIFTS = [null, { lift: 0.12, sat: 1.04 }, { lift: 0.25, sat: 1.08 }, { lift: 0.4, sat: 1.12 }];
function clipColor(p, clip, f) {
  const l = f.hdr && HDR_LIFTS[p.hdrLift | 0];
  if (!l) return clip.color;
  const base = clip.color || defaultColor();
  return { ...base, lift: (base.lift || 0) + l.lift, sat: base.sat * l.sat };
}

// f: { w, h, hdr, draw(ctx, x, y, w, h) } … 素材のフレーム
function drawClipFrame(c, p, x, f, t) {
  const F = p.frame, clip = x.clip;
  const color = clipColor(p, clip, f);
  const r = clipRect(F, f.w, f.h, clip);
  if (p.bg && p.bg.type === 'blur' && (r.x > 0.5 || r.y > 0.5 || r.x + r.w < F.width - 0.5 || r.y + r.h < F.height - 0.5)) drawBlurBg(c, F, f);
  c.save();
  const m = motionAt(clip, Math.min(1, Math.max(0, (t - x.start) / Math.max(0.01, x.end - x.start))));
  if (m) {
    c.translate(F.width / 2 + m.dx * F.width, F.height / 2 + m.dy * F.height);
    c.scale(m.s, m.s);
    c.translate(-F.width / 2, -F.height / 2);
  }
  if (colorActive(color)) {
    // 実際に表示される大きさ（書き出しなら元の画素数）で加工する
    const tf = c.getTransform ? c.getTransform() : { a: 1, d: 1 };
    const k = Math.min(1, Math.hypot(tf.a, tf.b) * (r.w / f.w));
    const out = glProc().process((g, w, h) => f.draw(g, 0, 0, w, h), f.w * k, f.h * k, color, null);
    if (out) c.drawImage(out, r.x, r.y, r.w, r.h);
    else f.draw(c, r.x, r.y, r.w, r.h);
  } else f.draw(c, r.x, r.y, r.w, r.h);
  c.restore();
}

export function drawTransition(c, W, H, type, k, drawA, drawB) {
  const layer = (fn, tf) => { c.save(); tf && tf(); fn(c); c.restore(); };
  switch (type) {
    case 'cross':
      drawA(c);
      layer(drawB, () => (c.globalAlpha *= k));
      break;
    case 'black':
    case 'white': {
      const a = k < 0.5 ? k * 2 : (1 - k) * 2;
      (k < 0.5 ? drawA : drawB)(c);
      c.save();
      c.globalAlpha *= Math.min(1, a);
      c.fillStyle = type === 'black' ? '#000' : '#fff';
      c.fillRect(0, 0, W, H);
      c.restore();
      break;
    }
    case 'slideL': {
      const e = k * k * (3 - 2 * k);
      layer(drawA, () => c.translate(-e * W, 0));
      layer(drawB, () => c.translate((1 - e) * W, 0));
      break;
    }
    case 'slideU': {
      const e = k * k * (3 - 2 * k);
      layer(drawA, () => c.translate(0, -e * H));
      layer(drawB, () => c.translate(0, (1 - e) * H));
      break;
    }
    case 'zoom':
      drawB(c);
      layer(drawA, () => { const s = 1 + k * 0.8; c.translate(W / 2, H / 2); c.scale(s, s); c.translate(-W / 2, -H / 2); c.globalAlpha *= 1 - k; });
      break;
    case 'wipe':
      drawA(c);
      layer(drawB, () => { c.beginPath(); c.rect(0, 0, k * W, H); c.clip(); });
      break;
    case 'circle':
      drawA(c);
      layer(drawB, () => { c.beginPath(); c.arc(W / 2, H / 2, k * Math.hypot(W, H) / 2, 0, Math.PI * 2); c.clip(); });
      break;
    default:
      (k < 0.5 ? drawA : drawB)(c);
  }
}

// getFrame(x, st) → { w, h, draw } | null
export function drawMain(c, p, t, getFrame) {
  const ts = clipTimes(p);
  const tr = transAt(p, t, ts);
  const needs = mainNeeds(p, t, ts);
  const draw = (need) => (cc) => { const f = getFrame(need.x, need.st); if (f) drawClipFrame(cc, p, need.x, f, t); };
  if (!tr || needs.length < 2) {
    if (tr && (tr.type === 'black' || tr.type === 'white')) drawTransition(c, p.frame.width, p.frame.height, tr.type, tr.k, draw(needs[0]), draw(needs[0]));
    else if (needs[0]) draw(needs[0])(c);
    return needs;
  }
  drawTransition(c, p.frame.width, p.frame.height, tr.type, tr.k, draw(needs[0]), draw(needs[1]));
  return needs;
}
