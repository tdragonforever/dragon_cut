// 解析（自動EQ）と音量合わせの計算を、画面を止めないように別スレッドで行う
// 素材ごとの音声を受け取っておき、クリップの並びに合わせてつなげたものを解析する
// 追加した音楽などは setBuf で key ごとに受け取り、key を付けて解析・音量合わせをする
importScripts('dsp.js');

const fs = 48000;
const srcs = new Map();
const bufs = new Map();
let mainL = new Float32Array(0), mainR = new Float32Array(0);

onmessage = (e) => {
  const m = e.data;
  const reply = (data) => postMessage({ id: m.id, ...data });
  try {
    const b = m.key != null ? bufs.get(m.key) : null;
    const L = b ? b.L : mainL, R = b ? b.R : mainR;
    switch (m.type) {
      case 'setBuf':
        bufs.set(m.key, { L: m.L, R: m.R });
        reply({ ok: true });
        break;
      case 'addSource':
        srcs.set(m.sid, { L: m.L, R: m.R });
        reply({ ok: true });
        break;
      case 'setClips': {
        // clips: [{ srcId, in, out, volume }]（速度変更は解析に影響が小さいので無視する）
        const parts = m.clips.map((c) => ({ c, n: Math.max(0, Math.round((c.out - c.in) * fs)) }));
        const total = parts.reduce((a, p) => a + p.n, 0);
        const L = mainL = new Float32Array(total), R = mainR = new Float32Array(total);
        let at = 0;
        for (const { c, n } of parts) {
          const s = srcs.get(c.srcId);
          if (s) {
            const a = Math.round(c.in * fs), g = c.volume;
            for (let i = 0; i < n && a + i < s.L.length; i++) { L[at + i] = s.L[a + i] * g; R[at + i] = s.R[a + i] * g; }
          }
          at += n;
        }
        reply({ ok: true, length: total });
        break;
      }
      case 'analyze':
        if (L.length < fs * 0.5) { reply({ analysis: null }); break; }
        reply({ analysis: DSP.analyze(fs, L, R) });
        break;
      case 'gain':
        if (L.length < fs * 0.5) { reply({ gain: 0 }); break; }
        let last = -1;
        const prog = (x) => { const v = Math.floor(x * 50); if (v !== last) { last = v; postMessage({ id: m.id, progress: x }); } };
        reply({ gain: DSP.solveOutGain(fs, L, R, m.params, m.target, m.quick !== false, prog) });
        break;
    }
  } catch (err) {
    reply({ error: String((err && err.message) || err) });
  }
};
