// 効果音（Demo）: よく使われる効果音を、その場で音を合成して作る（音のファイルは使わないので、著作権やライセンスの心配がない）。
// make(ctx) は OfflineAudioContext に音をつなぐ関数。dur 秒ぶんを書き出して AudioBuffer にする。
// 書く音などのザラザラした音は乱数を使うので、追加するたびに少しずつ違う音になる。

const SR = 48000;

// --- 部品 ---------------------------------------------------------------
// 音量の形（アタック → 減衰）をつけたゲイン
function env(ctx, t0, { a = 0.005, d = 0.3, peak = 0.8, sustain = 0, hold = 0 } = {}) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + a);
  if (hold) g.gain.setValueAtTime(peak, t0 + a + hold);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t0 + a + hold + d);
  return g;
}
// 音程のある音。f1 を指定すると音程が f0 → f1 に変わる
function tone(ctx, out, t0, { type = 'sine', f0 = 880, f1, slide = 0.1, ...e }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + slide);
  const g = env(ctx, t0, e);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + (e.a || 0.005) + (e.hold || 0) + (e.d || 0.3) + 0.05);
  return o;
}
let noiseBuf = null;
function noiseSrc(ctx) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}
// ザーッという音（フィルターで音色を変える）。f1 でフィルターを動かす
function noise(ctx, out, t0, { type = 'bandpass', f = 3000, f1, q = 1, slide = 0.2, ...e }) {
  const s = noiseSrc(ctx);
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t0);
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t0 + slide);
  fl.Q.value = q;
  const g = env(ctx, t0, e);
  s.connect(fl).connect(g).connect(out);
  s.start(t0, Math.random());
  s.stop(t0 + (e.a || 0.005) + (e.hold || 0) + (e.d || 0.3) + 0.05);
  return g;
}
// 響き（簡単なエコー）
function echo(ctx, out, { time = 0.12, fb = 0.35, mix = 0.4 } = {}) {
  const inp = ctx.createGain(), dl = ctx.createDelay(1), fbg = ctx.createGain(), wet = ctx.createGain();
  dl.delayTime.value = time; fbg.gain.value = fb; wet.gain.value = mix;
  inp.connect(out);
  inp.connect(dl); dl.connect(fbg).connect(dl); dl.connect(wet).connect(out);
  return inp;
}
const rnd = (a, b) => a + Math.random() * (b - a);

// 書く音: ストローク（線を1本引く）を何本か並べる。粒々（ザラザラ）を細かい音量の揺れで作る
function writing(ctx, out, { strokes, f, q, grain, gain, squeak = 0, tap = 0, lp = 0 }) {
  let t = 0.05;
  for (const len of strokes) {
    const s = noiseSrc(ctx);
    const fl = ctx.createBiquadFilter();
    fl.type = 'bandpass'; fl.frequency.value = f * rnd(0.85, 1.15); fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    // ストロークの中の細かい揺れ（紙のザラザラ）
    for (let x = 0; x < len; x += grain) g.gain.linearRampToValueAtTime(gain * rnd(0.35, 1) * Math.sin(Math.PI * Math.min(1, (x + grain) / len)), t + x + grain);
    g.gain.linearRampToValueAtTime(0, t + len + 0.02);
    let node = s.connect(fl);
    if (lp) { const l2 = ctx.createBiquadFilter(); l2.type = 'lowpass'; l2.frequency.value = lp; node = node.connect(l2); }
    node.connect(g).connect(out);
    s.start(t, Math.random()); s.stop(t + len + 0.05);
    if (squeak) tone(ctx, out, t, { type: 'triangle', f0: squeak * rnd(0.9, 1.1), f1: squeak * rnd(1.1, 1.3), slide: len, a: 0.02, hold: len * 0.6, d: len * 0.4, peak: 0.12 });
    if (tap) noise(ctx, out, t, { type: 'highpass', f: 2500, a: 0.001, d: 0.03, peak: tap });
    t += len + rnd(0.04, 0.16);
  }
}

// --- 効果音の一覧 ---------------------------------------------------------
export const SFX_GENRES = ['キラキラ', 'ポップ・UI', '正解・不正解', 'インパクト', '動き', 'リアクション', '書く音', '生活音'];

export const SFX = [
  // キラキラ
  { g: 'キラキラ', key: 'kiran', label: 'キラーン', dur: 1.6, make: (c, o) => { const e = echo(c, o, { time: 0.09, fb: 0.45 }); [2093, 2637, 3136, 4186].forEach((f, i) => tone(c, e, i * 0.05, { f0: f, d: 1.0, peak: 0.25 })); } },
  { g: 'キラキラ', key: 'shalala', label: 'シャララ～ン', dur: 2.0, make: (c, o) => { const e = echo(c, o, { time: 0.11, fb: 0.4 }); for (let i = 0; i < 14; i++) tone(c, e, i * 0.045, { f0: 1046 * Math.pow(2, i / 7), d: 0.6, peak: 0.16, type: 'triangle' }); } },
  { g: 'キラキラ', key: 'sparkle', label: 'きらめき', dur: 1.6, make: (c, o) => { const e = echo(c, o, { time: 0.07, fb: 0.4 }); for (let i = 0; i < 18; i++) tone(c, e, rnd(0, 1.0), { f0: rnd(3000, 7000), d: 0.25, peak: 0.12 }); } },
  { g: 'キラキラ', key: 'star', label: 'ピロリン', dur: 1.0, make: (c, o) => { [1568, 2093, 2637].forEach((f, i) => tone(c, o, i * 0.08, { f0: f, d: 0.5, peak: 0.3, type: 'triangle' })); } },
  { g: 'キラキラ', key: 'magic', label: '魔法', dur: 2.0, make: (c, o) => { const e = echo(c, o, { time: 0.13, fb: 0.5 }); tone(c, e, 0, { f0: 600, f1: 3000, slide: 0.8, a: 0.05, hold: 0.5, d: 0.6, peak: 0.15, type: 'sine' }); for (let i = 0; i < 10; i++) tone(c, e, 0.1 + i * 0.08, { f0: rnd(2500, 6000), d: 0.3, peak: 0.1 }); } },
  // ポップ・UI
  { g: 'ポップ・UI', key: 'pon', label: 'ポンッ', dur: 0.4, make: (c, o) => tone(c, o, 0, { f0: 500, f1: 1200, slide: 0.06, d: 0.18, peak: 0.6 }) },
  { g: 'ポップ・UI', key: 'bubble', label: 'ポコッ（泡）', dur: 0.3, make: (c, o) => tone(c, o, 0, { f0: 300, f1: 1400, slide: 0.08, d: 0.1, peak: 0.6 }) },
  { g: 'ポップ・UI', key: 'pico', label: 'ピコッ', dur: 0.3, make: (c, o) => tone(c, o, 0, { type: 'square', f0: 1500, d: 0.08, peak: 0.2 }) },
  { g: 'ポップ・UI', key: 'click', label: 'クリック', dur: 0.15, make: (c, o) => { noise(c, o, 0, { type: 'highpass', f: 3000, a: 0.001, d: 0.02, peak: 0.6 }); tone(c, o, 0, { f0: 2000, d: 0.02, peak: 0.2 }); } },
  { g: 'ポップ・UI', key: 'notify', label: 'ピコン（通知）', dur: 0.8, make: (c, o) => { tone(c, o, 0, { f0: 1318, d: 0.25, peak: 0.35 }); tone(c, o, 0.12, { f0: 1760, d: 0.4, peak: 0.35 }); } },
  { g: 'ポップ・UI', key: 'pop3', label: 'ポポポン', dur: 0.8, make: (c, o) => [0, 0.1, 0.2].forEach((t, i) => tone(c, o, t, { f0: 400 + i * 200, f1: 1000 + i * 300, slide: 0.05, d: 0.12, peak: 0.5 })) },
  // 正解・不正解
  { g: '正解・不正解', key: 'pinpon', label: 'ピンポーン（正解）', dur: 1.4, make: (c, o) => { tone(c, o, 0, { f0: 1319, d: 0.6, peak: 0.4, type: 'triangle' }); tone(c, o, 0.28, { f0: 1047, d: 0.9, peak: 0.4, type: 'triangle' }); } },
  { g: '正解・不正解', key: 'bubu', label: 'ブブー（不正解）', dur: 0.9, make: (c, o) => [0, 0.32].forEach((t) => tone(c, o, t, { type: 'sawtooth', f0: 140, a: 0.01, hold: 0.22, d: 0.05, peak: 0.3 })) },
  { g: '正解・不正解', key: 'chin', label: 'チーン', dur: 2.2, make: (c, o) => { [1800, 2700, 4300].forEach((f, i) => tone(c, o, 0, { f0: f, d: 2.0 - i * 0.4, peak: 0.25 / (i + 1) })); } },
  { g: '正解・不正解', key: 'fanfare', label: 'ファンファーレ', dur: 1.6, make: (c, o) => { [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36]].forEach(([f, t], i) => tone(c, o, t, { type: 'square', f0: f, a: 0.01, hold: i === 3 ? 0.5 : 0.08, d: 0.3, peak: 0.12 })); } },
  { g: '正解・不正解', key: 'zuko', label: 'ズコー', dur: 1.2, make: (c, o) => tone(c, o, 0, { type: 'sawtooth', f0: 700, f1: 90, slide: 0.9, a: 0.01, hold: 0.7, d: 0.25, peak: 0.25 }) },
  // インパクト
  { g: 'インパクト', key: 'don', label: 'ドンッ', dur: 1.0, make: (c, o) => { tone(c, o, 0, { f0: 150, f1: 45, slide: 0.4, d: 0.7, peak: 1 }); noise(c, o, 0, { type: 'lowpass', f: 800, d: 0.15, peak: 0.5 }); } },
  { g: 'インパクト', key: 'dodon', label: 'ドドン（太鼓）', dur: 1.4, make: (c, o) => [0, 0.18].forEach((t) => { tone(c, o, t, { f0: 120, f1: 60, slide: 0.2, d: 0.6, peak: 0.9 }); noise(c, o, t, { type: 'bandpass', f: 600, d: 0.08, peak: 0.4 }); }) },
  { g: 'インパクト', key: 'bang', label: 'バーン（爆発）', dur: 2.0, make: (c, o) => { noise(c, o, 0, { type: 'lowpass', f: 3000, f1: 200, slide: 1.2, a: 0.005, d: 1.6, peak: 1 }); tone(c, o, 0, { f0: 80, f1: 30, slide: 0.8, d: 1.0, peak: 0.8 }); } },
  { g: 'インパクト', key: 'punch', label: 'パンチ', dur: 0.5, make: (c, o) => { tone(c, o, 0, { f0: 220, f1: 60, slide: 0.12, d: 0.2, peak: 0.9 }); noise(c, o, 0, { type: 'bandpass', f: 1500, d: 0.06, peak: 0.6 }); } },
  { g: 'インパクト', key: 'gaan', label: 'ガーン', dur: 2.0, make: (c, o) => { [196, 233, 277].forEach((f) => tone(c, o, 0, { type: 'sawtooth', f0: f, f1: f * 0.94, slide: 1.5, a: 0.01, d: 1.8, peak: 0.15 })); } },
  // 動き
  { g: '動き', key: 'shu', label: 'シュッ', dur: 0.5, make: (c, o) => noise(c, o, 0, { type: 'bandpass', f: 800, f1: 4000, slide: 0.18, q: 2, a: 0.06, d: 0.15, peak: 0.6 }) },
  { g: '動き', key: 'whoosh', label: 'ビュン', dur: 0.8, make: (c, o) => noise(c, o, 0, { type: 'bandpass', f: 2500, f1: 400, slide: 0.5, q: 1.5, a: 0.15, d: 0.4, peak: 0.6 }) },
  { g: '動き', key: 'hyu', label: 'ヒュ～（落下）', dur: 1.3, make: (c, o) => tone(c, o, 0, { f0: 2000, f1: 300, slide: 1.1, a: 0.02, hold: 0.9, d: 0.2, peak: 0.25 }) },
  { g: '動き', key: 'byun', label: 'ビューン（上昇）', dur: 1.0, make: (c, o) => tone(c, o, 0, { type: 'triangle', f0: 200, f1: 2400, slide: 0.7, a: 0.02, hold: 0.6, d: 0.2, peak: 0.3 }) },
  { g: '動き', key: 'warp', label: 'ワープ', dur: 1.2, make: (c, o) => { const e = echo(c, o, { time: 0.06, fb: 0.6 }); tone(c, e, 0, { type: 'sawtooth', f0: 100, f1: 3000, slide: 0.8, a: 0.02, hold: 0.6, d: 0.2, peak: 0.12 }); } },
  // リアクション
  { g: 'リアクション', key: 'pikin', label: 'ピキーン（ひらめき）', dur: 1.2, make: (c, o) => { const e = echo(c, o, { time: 0.1, fb: 0.35 }); tone(c, e, 0, { f0: 2637, d: 0.8, peak: 0.3 }); tone(c, e, 0, { f0: 3951, d: 0.6, peak: 0.15 }); } },
  { g: 'リアクション', key: 'hatena', label: 'ハテナ？', dur: 0.8, make: (c, o) => { tone(c, o, 0, { type: 'triangle', f0: 600, d: 0.15, peak: 0.35 }); tone(c, o, 0.18, { type: 'triangle', f0: 600, f1: 900, slide: 0.2, d: 0.35, peak: 0.35 }); } },
  { g: 'リアクション', key: 'doki', label: 'ドキドキ', dur: 1.6, make: (c, o) => [0, 0.22, 0.8, 1.02].forEach((t, i) => tone(c, o, t, { f0: 80, f1: 50, slide: 0.08, d: 0.15, peak: i % 2 ? 0.6 : 0.9 })) },
  { g: 'リアクション', key: 'gaan2', label: 'ショック（ガビーン）', dur: 1.2, make: (c, o) => { tone(c, o, 0, { type: 'square', f0: 900, f1: 150, slide: 0.5, a: 0.005, hold: 0.3, d: 0.5, peak: 0.15 }); noise(c, o, 0, { type: 'lowpass', f: 1200, d: 0.4, peak: 0.3 }); } },
  { g: 'リアクション', key: 'boyon', label: 'ボヨーン', dur: 1.0, make: (c, o) => { const t = tone(c, o, 0, { f0: 150, a: 0.01, hold: 0.6, d: 0.3, peak: 0.5 }); const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 12; lg.gain.value = 60; lfo.connect(lg).connect(t.frequency); lfo.start(0); lfo.stop(1); } },
  // 書く音
  { g: '書く音', key: 'pencil', label: '鉛筆（カリカリ）', dur: 2.2, make: (c, o) => writing(c, o, { strokes: [0.18, 0.12, 0.25, 0.1, 0.2, 0.15, 0.3], f: 4200, q: 1.4, grain: 0.012, gain: 0.5 }) },
  { g: '書く音', key: 'pencil2', label: '鉛筆（サラサラ・長め）', dur: 3.0, make: (c, o) => writing(c, o, { strokes: [0.5, 0.4, 0.6, 0.55], f: 3800, q: 1.2, grain: 0.015, gain: 0.4 }) },
  { g: '書く音', key: 'ballpen', label: 'ボールペン', dur: 2.2, make: (c, o) => writing(c, o, { strokes: [0.22, 0.14, 0.3, 0.18, 0.26], f: 2600, q: 2.5, grain: 0.03, gain: 0.45, lp: 5000 }) },
  { g: '書く音', key: 'marker', label: 'マーカー（キュッキュッ）', dur: 2.0, make: (c, o) => writing(c, o, { strokes: [0.25, 0.2, 0.3, 0.22], f: 1800, q: 1.5, grain: 0.02, gain: 0.35, squeak: 1100 }) },
  { g: '書く音', key: 'signpen', label: 'サインペン', dur: 2.0, make: (c, o) => writing(c, o, { strokes: [0.2, 0.16, 0.28, 0.2, 0.14], f: 2200, q: 1.8, grain: 0.025, gain: 0.4, lp: 3500 }) },
  { g: '書く音', key: 'chalk', label: 'チョーク（黒板）', dur: 2.2, make: (c, o) => writing(c, o, { strokes: [0.2, 0.25, 0.15, 0.3, 0.2], f: 3000, q: 0.8, grain: 0.008, gain: 0.6, tap: 0.5 }) },
  { g: '書く音', key: 'brush', label: '筆（スーッ）', dur: 2.4, make: (c, o) => writing(c, o, { strokes: [0.6, 0.5, 0.7], f: 1400, q: 0.7, grain: 0.05, gain: 0.3, lp: 2500 }) },
  { g: '書く音', key: 'eraser', label: '消しゴム', dur: 1.8, make: (c, o) => writing(c, o, { strokes: [0.12, 0.1, 0.12, 0.1, 0.12, 0.1, 0.12], f: 900, q: 1, grain: 0.02, gain: 0.5, lp: 2000 }) },
  { g: '書く音', key: 'typing', label: 'キーボード（タイプ）', dur: 2.0, make: (c, o) => { for (let i = 0; i < 12; i++) { const t = i * 0.13 + rnd(0, 0.05); noise(c, o, t, { type: 'bandpass', f: rnd(2500, 4500), q: 3, a: 0.001, d: 0.04, peak: 0.6 }); tone(c, o, t, { f0: rnd(180, 260), d: 0.03, peak: 0.25 }); } } },
  // 生活音
  { g: '生活音', key: 'shutter', label: 'カメラのシャッター', dur: 0.5, make: (c, o) => { noise(c, o, 0, { type: 'highpass', f: 2000, a: 0.001, d: 0.05, peak: 0.8 }); noise(c, o, 0.09, { type: 'bandpass', f: 2500, a: 0.001, d: 0.07, peak: 0.6 }); } },
  { g: '生活音', key: 'tick', label: '時計（チクタク）', dur: 2.0, make: (c, o) => [0, 0.5, 1, 1.5].forEach((t, i) => noise(c, o, t, { type: 'bandpass', f: i % 2 ? 2500 : 3500, q: 8, a: 0.001, d: 0.03, peak: 0.8 })) },
  { g: '生活音', key: 'bell', label: 'ベル（チリン）', dur: 1.6, make: (c, o) => [2400, 3700, 5100].forEach((f, i) => tone(c, o, 0, { f0: f, d: 1.4 - i * 0.3, peak: 0.25 / (i + 1) })) },
  { g: '生活音', key: 'clap', label: '拍手（パチパチ）', dur: 2.5, make: (c, o) => { for (let i = 0; i < 60; i++) noise(c, o, rnd(0, 2.0), { type: 'bandpass', f: rnd(1200, 2500), q: 1.2, a: 0.001, d: rnd(0.03, 0.06), peak: rnd(0.2, 0.5) }); } },
  { g: '生活音', key: 'knock', label: 'ノック（コンコン）', dur: 0.8, make: (c, o) => [0, 0.18].forEach((t) => { tone(c, o, t, { f0: 300, f1: 180, slide: 0.05, d: 0.08, peak: 0.7 }); noise(c, o, t, { type: 'bandpass', f: 1200, q: 2, a: 0.001, d: 0.03, peak: 0.5 }); }) },
];

// 効果音を作る（AudioBuffer、48kHz ステレオ）
export async function renderSfx(key) {
  const s = SFX.find((x) => x.key === key);
  const ctx = new OfflineAudioContext(2, Math.ceil(s.dur * SR), SR);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  s.make(ctx, master);
  const buf = await ctx.startRendering();
  // 音の大きさをそろえる（いちばん大きいところを 0.8 に）。音割れも防ぐ
  let pk = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) for (const v of buf.getChannelData(c)) pk = Math.max(pk, Math.abs(v));
  if (pk > 0) { const k = 0.8 / pk; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; } }
  return buf;
}

// AudioBuffer を WAV ファイルにする（保存・書き出しで普通の音声ファイルと同じように扱うため）
export function bufferToWav(buf) {
  const n = buf.length, ch = buf.numberOfChannels, bytes = n * ch * 2;
  const v = new DataView(new ArrayBuffer(44 + bytes));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, bytes, true);
  const data = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([v], { type: 'audio/wav' });
}
