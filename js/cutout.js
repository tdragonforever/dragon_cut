// スタンプの切り抜き画面
// 自動で背景を消す（マジックワンド）・指でなぞって切り抜く（投げ縄）・消しゴム／戻すブラシ・形で切り抜く・ステッカー風のフチ
// すべて端末内の Canvas で処理する（AI は使わない）

const MAX = 1600; // 長い辺の上限
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export const SHAPES = [
  { key: 'none', label: 'なし' },
  { key: 'circle', label: '円' },
  { key: 'round', label: '角丸' },
  { key: 'heart', label: 'ハート' },
  { key: 'star', label: '星' },
  { key: 'bubble', label: '吹き出し' },
];

// 形のパス（中心 cx, cy、大きさ s）
function shapePath(g, type, cx, cy, s) {
  const r = s / 2;
  g.beginPath();
  if (type === 'circle') g.arc(cx, cy, r, 0, Math.PI * 2);
  else if (type === 'round') {
    const k = s * 0.2, x = cx - r, y = cy - r;
    g.moveTo(x + k, y); g.arcTo(x + s, y, x + s, y + s, k); g.arcTo(x + s, y + s, x, y + s, k); g.arcTo(x, y + s, x, y, k); g.arcTo(x, y, x + s, y, k); g.closePath();
  } else if (type === 'heart') {
    const t = cy - r * 0.55;
    g.moveTo(cx, cy + r * 0.95);
    g.bezierCurveTo(cx - r * 1.25, cy + r * 0.1, cx - r * 1.0, t - r * 0.75, cx, t);
    g.bezierCurveTo(cx + r * 1.0, t - r * 0.75, cx + r * 1.25, cy + r * 0.1, cx, cy + r * 0.95);
    g.closePath();
  } else if (type === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 1.0 + r * 0.06;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
  } else if (type === 'bubble') {
    const w = s, hh = s * 0.72, x = cx - w / 2, y = cy - s / 2, k = s * 0.22;
    g.moveTo(x + k, y); g.arcTo(x + w, y, x + w, y + hh, k); g.arcTo(x + w, y + hh, x, y + hh, k);
    g.lineTo(cx - w * 0.05, y + hh); g.lineTo(cx - w * 0.28, y + s); g.lineTo(cx - w * 0.22, y + hh);
    g.arcTo(x, y + hh, x, y, k); g.arcTo(x, y, x + w, y, k); g.closePath();
  }
}

// ぼかした塗りつぶし（Safari でも使える影のテクニック）
function featherFill(g, W, pathFn, blur) {
  if (blur <= 0) { pathFn(g); g.fill(); return; }
  g.save();
  g.shadowColor = '#fff';
  g.shadowBlur = blur;
  g.shadowOffsetX = W * 2;
  g.translate(-W * 2, 0);
  pathFn(g);
  g.fill();
  g.restore();
}

// blob: 画像。opts: { title, canDelete }
// 戻り値: { blob } … 保存 / { deleted: true } … 削除 / null … キャンセル
export async function openCutout(blob, opts = {}) {
  const bmp = await createImageBitmap(blob);
  const k0 = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const W = Math.max(1, Math.round(bmp.width * k0)), H = Math.max(1, Math.round(bmp.height * k0));
  const src = canvas(W, H);
  const sg = src.getContext('2d', { willReadFrequently: true });
  sg.drawImage(bmp, 0, 0, W, H);
  bmp.close && bmp.close();
  const srcData = sg.getImageData(0, 0, W, H).data;
  const mask = canvas(W, H);
  const mg = mask.getContext('2d', { willReadFrequently: true });
  mg.fillStyle = '#fff';
  mg.fillRect(0, 0, W, H);
  const base = Math.min(W, H);

  const st = {
    tool: 'auto', tol: 30, wandMode: 'edge', lassoMode: 'keep', feather: 2, brush: 40, soft: false,
    shape: { type: 'none', size: 0.95, cx: 0.5, cy: 0.5 },
    outline: { on: false, color: '#ffffff', width: 0.035, shadow: true },
    history: [], dirty: false,
  };
  const pushHist = () => { st.history.push(mg.getImageData(0, 0, W, H)); if (st.history.length > 20) st.history.shift(); st.dirty = true; };

  // --- 画面 ---
  const view = el('canvas', { class: 'cut-view' });
  const vg = view.getContext('2d');
  const opt = el('div', { class: 'cut-opt' });
  const tools = el('div', { class: 'cut-tools' });
  const TOOLS = [
    ['auto', '自動で消す'], ['lasso', 'なぞる'], ['erase', '消しゴム'], ['restore', '戻す'], ['shape', '形'], ['outline', 'フチ'],
  ];
  let resolveFn;
  const done = new Promise((r) => (resolveFn = r));
  const close = (v) => { root.remove(); window.removeEventListener('resize', layout); resolveFn(v); };
  const root = el('div', { class: 'cut-wrap' },
    el('div', { class: 'cut-bar' },
      el('button', { class: 'cut-btn', onclick: () => close(null) }, 'キャンセル'),
      el('div', { class: 'cut-title' }, opts.title || '切り抜き'),
      el('button', { class: 'cut-btn primary-s', onclick: async () => close({ blob: await exportBlob() }) }, '保存')),
    el('div', { class: 'cut-stage' }, view),
    el('div', { class: 'cut-panel' }, tools, opt,
      el('div', { class: 'cut-row' },
        el('button', { onclick: () => { const d = st.history.pop(); if (d) { mg.putImageData(d, 0, 0); render(); } } }, '↶ 元に戻す'),
        el('button', { onclick: () => { pushHist(); mg.globalCompositeOperation = 'source-over'; mg.fillStyle = '#fff'; mg.fillRect(0, 0, W, H); st.shape.type = 'none'; st.outline.on = false; buildOpt(); render(); } }, 'リセット'),
        opts.canDelete ? el('button', { class: 'danger', onclick: () => { if (confirm('このスタンプを削除しますか？')) close({ deleted: true }); } }, '削除') : null)));
  document.body.append(root);

  // --- 表示の位置（拡大・移動） ---
  const vw = { s: 1, x: 0, y: 0 };
  let cw = 0, ch = 0, dpr = 1;
  function layout() {
    const r = view.parentElement.getBoundingClientRect();
    dpr = Math.min(3, window.devicePixelRatio || 1);
    cw = r.width; ch = r.height;
    view.width = Math.round(cw * dpr); view.height = Math.round(ch * dpr);
    view.style.width = cw + 'px'; view.style.height = ch + 'px';
    fit();
  }
  function fit() {
    vw.s = Math.min((cw - 24) / W, (ch - 24) / H);
    vw.x = (cw - W * vw.s) / 2; vw.y = (ch - H * vw.s) / 2;
    render();
  }
  const toImg = (px, py) => ({ x: (px - vw.x) / vw.s, y: (py - vw.y) / vw.s });

  // --- 結果の画像 ---
  const res = canvas(W, H), rg = res.getContext('2d');
  const tmp = canvas(W, H), tg = tmp.getContext('2d');
  function buildCut() {
    rg.globalCompositeOperation = 'source-over';
    rg.clearRect(0, 0, W, H);
    rg.drawImage(src, 0, 0);
    rg.globalCompositeOperation = 'destination-in';
    rg.drawImage(mask, 0, 0);
    if (st.shape.type !== 'none') {
      tg.clearRect(0, 0, W, H);
      tg.fillStyle = '#fff';
      shapePath(tg, st.shape.type, st.shape.cx * W, st.shape.cy * H, st.shape.size * base);
      tg.fill();
      rg.drawImage(tmp, 0, 0);
    }
    rg.globalCompositeOperation = 'source-over';
    return res;
  }
  // フチと影をつけた最終画像（余白つき）
  function buildSticker() {
    const cut = buildCut();
    const o = st.outline;
    if (!o.on) return { c: cut, pad: 0 };
    const ow = Math.max(1, o.width * base);
    const pad = Math.ceil(ow + (o.shadow ? base * 0.05 : 0) + 4);
    const sil = canvas(W, H), sg2 = sil.getContext('2d');
    sg2.drawImage(cut, 0, 0);
    sg2.globalCompositeOperation = 'source-in';
    sg2.fillStyle = o.color;
    sg2.fillRect(0, 0, W, H);
    const out = canvas(W + pad * 2, H + pad * 2), og = out.getContext('2d');
    const ring = canvas(W + pad * 2, H + pad * 2), ig = ring.getContext('2d');
    const n = 24;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ig.drawImage(sil, pad + Math.cos(a) * ow, pad + Math.sin(a) * ow);
    }
    ig.drawImage(sil, pad, pad);
    if (o.shadow) {
      og.save();
      og.shadowColor = 'rgba(0,0,0,.45)';
      og.shadowBlur = base * 0.03;
      og.shadowOffsetY = base * 0.012;
      og.drawImage(ring, 0, 0);
      og.restore();
    } else og.drawImage(ring, 0, 0);
    og.drawImage(cut, pad, pad);
    return { c: out, pad };
  }

  let rq = false;
  function render() {
    if (rq) return;
    rq = true;
    requestAnimationFrame(() => {
      rq = false;
      vg.setTransform(dpr, 0, 0, dpr, 0, 0);
      vg.clearRect(0, 0, cw, ch);
      // 市松模様（透明の目印）
      const sz = 12;
      vg.fillStyle = '#26262a';
      vg.fillRect(0, 0, cw, ch);
      vg.fillStyle = '#323238';
      for (let y = 0; y < ch; y += sz) for (let x = (Math.floor(y / sz) % 2) * sz; x < cw; x += sz * 2) vg.fillRect(x, y, sz, sz);
      vg.save();
      vg.translate(vw.x, vw.y);
      vg.scale(vw.s, vw.s);
      // 消した部分もうっすら見せる（戻すときの目安）
      if (st.tool === 'restore' || st.tool === 'erase' || st.tool === 'lasso') { vg.globalAlpha = 0.2; vg.drawImage(src, 0, 0); vg.globalAlpha = 1; }
      const { c, pad } = buildSticker();
      vg.drawImage(c, -pad, -pad);
      if (st.tool === 'shape' && st.shape.type !== 'none') {
        vg.strokeStyle = 'rgba(56,225,255,.9)';
        vg.lineWidth = 2 / vw.s;
        vg.setLineDash([6 / vw.s, 4 / vw.s]);
        shapePath(vg, st.shape.type, st.shape.cx * W, st.shape.cy * H, st.shape.size * base);
        vg.stroke();
        vg.setLineDash([]);
      }
      if (lasso && lasso.length > 1) {
        vg.strokeStyle = '#38E1FF';
        vg.lineWidth = 2.5 / vw.s;
        vg.beginPath();
        lasso.forEach((p, i) => (i ? vg.lineTo(p.x, p.y) : vg.moveTo(p.x, p.y)));
        vg.stroke();
      }
      vg.restore();
      if (cursor && (st.tool === 'erase' || st.tool === 'restore')) {
        vg.strokeStyle = '#fff';
        vg.lineWidth = 1.5;
        vg.beginPath();
        vg.arc(cursor.x, cursor.y, st.brush / 2, 0, Math.PI * 2);
        vg.stroke();
      }
    });
  }

  // --- 自動で消す（つながった似た色の部分を透明にする） ---
  function wand(seeds) {
    pushHist();
    const md = mg.getImageData(0, 0, W, H);
    const m = md.data;
    const thr = Math.pow(st.tol * 4.4, 2);
    const seen = new Uint8Array(W * H);
    const q = new Int32Array(W * H), ref = new Int32Array(W * H);
    let qh = 0, qt = 0;
    for (const s of seeds) if (!seen[s] && m[s * 4 + 3] > 0) { seen[s] = 1; q[qt] = s; ref[qt] = s; qt++; }
    const d = srcData;
    while (qh < qt) {
      const p = q[qh], r0 = ref[qh]; qh++;
      m[p * 4 + 3] = 0;
      const x = p % W, y = (p / W) | 0;
      const rr = d[r0 * 4], rg2 = d[r0 * 4 + 1], rb = d[r0 * 4 + 2];
      const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
      for (const n of nb) {
        if (n < 0 || seen[n]) continue;
        const dr = d[n * 4] - rr, dg = d[n * 4 + 1] - rg2, db = d[n * 4 + 2] - rb;
        if (dr * dr + dg * dg + db * db <= thr || d[n * 4 + 3] < 10) { seen[n] = 1; q[qt] = n; ref[qt] = r0; qt++; }
      }
    }
    // 境目を少しなめらかに（1px）
    const a = new Uint8ClampedArray(W * H);
    for (let i = 0; i < W * H; i++) a[i] = m[i * 4 + 3];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!seen[i] && (seen[i - 1] || seen[i + 1] || seen[i - W] || seen[i + W])) m[i * 4 + 3] = Math.min(a[i], 140);
    }
    mg.putImageData(md, 0, 0);
    render();
    return qt;
  }
  function wandEdges() {
    const seeds = [];
    for (let x = 0; x < W; x++) { seeds.push(x, (H - 1) * W + x); }
    for (let y = 0; y < H; y++) { seeds.push(y * W, y * W + W - 1); }
    const n = wand(seeds);
    if (!n) st.history.pop();
  }

  // --- なぞる（投げ縄） ---
  let lasso = null;
  function applyLasso() {
    if (!lasso || lasso.length < 8) { lasso = null; render(); return; }
    pushHist();
    tg.clearRect(0, 0, W, H);
    tg.fillStyle = '#fff';
    const pts = lasso;
    featherFill(tg, W, (g) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); }, st.feather * (base / 600));
    mg.globalCompositeOperation = st.lassoMode === 'keep' ? 'destination-in' : 'destination-out';
    mg.drawImage(tmp, 0, 0);
    mg.globalCompositeOperation = 'source-over';
    lasso = null;
    render();
  }

  // --- ブラシ ---
  function stroke(a, b, erase) {
    const w = st.brush / vw.s;
    mg.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    mg.strokeStyle = '#fff';
    mg.lineCap = 'round';
    mg.lineJoin = 'round';
    mg.lineWidth = w;
    if (st.soft) { mg.shadowColor = '#fff'; mg.shadowBlur = w * 0.35; } else mg.shadowBlur = 0;
    mg.beginPath();
    mg.moveTo(a.x, a.y);
    mg.lineTo(b.x + 0.01, b.y);
    mg.stroke();
    mg.shadowBlur = 0;
    mg.globalCompositeOperation = 'source-over';
  }

  // --- 指の操作 ---
  const pts = new Map();
  let act = null, cursor = null;
  view.addEventListener('pointerdown', (e) => {
    view.setPointerCapture(e.pointerId);
    const r = view.getBoundingClientRect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top };
    pts.set(e.pointerId, p);
    if (pts.size === 2) {
      // 2本指: 拡大・移動（やりかけの操作は取り消す）
      if (act && act.started && (act.kind === 'erase' || act.kind === 'restore')) { const d = st.history.pop(); if (d) mg.putImageData(d, 0, 0); }
      lasso = null;
      const [a, b] = [...pts.values()];
      act = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0: { ...vw } };
      cursor = null;
      render();
      return;
    }
    if (pts.size > 2) return;
    const ip = toImg(p.x, p.y);
    if (st.tool === 'auto') { act = { kind: 'tap', p, ip }; return; }
    if (st.tool === 'lasso') { lasso = [ip]; act = { kind: 'lasso' }; render(); return; }
    if (st.tool === 'erase' || st.tool === 'restore') { act = { kind: st.tool, last: ip, started: false }; cursor = p; render(); return; }
    if (st.tool === 'shape') { act = { kind: 'shape', ip, c0: { cx: st.shape.cx, cy: st.shape.cy } }; return; }
    act = { kind: 'none' };
  });
  view.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const r = view.getBoundingClientRect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top };
    pts.set(e.pointerId, p);
    if (!act) return;
    if (act.kind === 'pinch' && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const k = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(10, act.d0);
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = clamp(act.v0.s * k, 0.05, 20);
      // 指の中心がさす画像の点を保ったまま拡大
      const ix = (act.m0.x - act.v0.x) / act.v0.s, iy = (act.m0.y - act.v0.y) / act.v0.s;
      vw.s = s; vw.x = m.x - ix * s; vw.y = m.y - iy * s;
      render();
      return;
    }
    const ip = toImg(p.x, p.y);
    if (act.kind === 'lasso') { lasso.push(ip); render(); }
    else if (act.kind === 'erase' || act.kind === 'restore') {
      if (!act.started) { pushHist(); act.started = true; }
      stroke(act.last, ip, act.kind === 'erase');
      act.last = ip;
      cursor = p;
      render();
    } else if (act.kind === 'shape') {
      st.shape.cx = clamp(act.c0.cx + (ip.x - act.ip.x) / W, 0, 1);
      st.shape.cy = clamp(act.c0.cy + (ip.y - act.ip.y) / H, 0, 1);
      render();
    }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size > 0) return;
    const a = act;
    act = null;
    cursor = null;
    if (!a) return;
    if (a.kind === 'tap' && e.type !== 'pointercancel') {
      const x = Math.floor(a.ip.x), y = Math.floor(a.ip.y);
      if (x >= 0 && y >= 0 && x < W && y < H) { if (!wand([y * W + x])) st.history.pop(); }
    } else if (a.kind === 'lasso') applyLasso();
    else if ((a.kind === 'erase' || a.kind === 'restore') && !a.started) { pushHist(); stroke(a.last, a.last, a.kind === 'erase'); }
    render();
  };
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
  view.addEventListener('dblclick', fit);

  // --- 道具ごとの設定 ---
  const slider = (label, min, max, step, get, set, fmt) => {
    const i = el('input', { type: 'range', min, max, step });
    i.value = get();
    const o = el('output', {}, fmt ? fmt(+i.value) : i.value);
    i.addEventListener('input', () => { set(+i.value); o.textContent = fmt ? fmt(+i.value) : i.value; render(); });
    return el('div', { class: 'row' }, el('label', {}, label), i, o);
  };
  const chips = (options, get, set) => {
    const box = el('div', { class: 'chips' });
    for (const [v, l] of options) {
      const b = el('button', { class: 'chip' + (get() === v ? ' on' : '') }, l);
      b.addEventListener('click', () => { set(v); for (const x of box.children) x.classList.remove('on'); b.classList.add('on'); render(); });
      box.append(b);
    }
    return box;
  };
  const SW = ['#ffffff', '#000000', '#ffe600', '#ff4fa0', '#38E1FF', '#3B82F6', '#8B5CF6', '#2ecc40', '#ff1a1a'];
  function buildOpt() {
    for (const b of tools.children) b.classList.toggle('on', b.dataset.t === st.tool);
    opt.innerHTML = '';
    const tip = (t) => el('p', { class: 'lbl' }, t);
    if (st.tool === 'auto') {
      opt.append(
        el('div', { class: 'cut-row' }, el('button', { class: 'btn-accent', onclick: () => wandEdges() }, 'ふちから背景を自動で消す')),
        slider('似た色の範囲', 2, 80, 1, () => st.tol, (v) => (st.tol = v)),
        tip('白や単色の背景におすすめ。画像の消したい所をタップすると、そこにつながった似た色の部分も消えます。'));
    } else if (st.tool === 'lasso') {
      opt.append(
        chips([['keep', '内側を残す'], ['remove', '内側を消す']], () => st.lassoMode, (v) => (st.lassoMode = v)),
        slider('ふちのぼかし', 0, 12, 0.5, () => st.feather, (v) => (st.feather = v)),
        tip('残したい物のまわりを指でぐるっとなぞってください。2本指で拡大・移動できます。'));
    } else if (st.tool === 'erase' || st.tool === 'restore') {
      opt.append(
        slider('ブラシの大きさ', 6, 120, 1, () => st.brush, (v) => (st.brush = v)),
        el('div', { class: 'row2' }, el('span', {}, 'ふちをやわらかく'), (() => { const t = el('input', { type: 'checkbox' }); t.checked = st.soft; t.addEventListener('change', () => (st.soft = t.checked)); return el('label', { class: 'switch' }, t, el('span')); })()),
        tip(st.tool === 'erase' ? '指でこすった所が消えます。2本指で拡大すると細かい所も消せます。' : '消しすぎた所を指でこすると元に戻ります。'));
    } else if (st.tool === 'shape') {
      opt.append(
        chips(SHAPES.map((s) => [s.key, s.label]), () => st.shape.type, (v) => { st.shape.type = v; }),
        slider('形の大きさ', 0.2, 1.5, 0.01, () => st.shape.size, (v) => (st.shape.size = v), (v) => Math.round(v * 100) + '%'),
        tip('形をドラッグして位置を合わせます。'));
    } else if (st.tool === 'outline') {
      const sw = el('div', { class: 'swatches' });
      for (const c of SW) {
        const b = el('button', { class: 'sw' + (st.outline.color === c ? ' on' : ''), style: `background:${c}` });
        b.addEventListener('click', () => { st.outline.color = c; st.outline.on = true; buildOpt(); render(); });
        sw.append(b);
      }
      const t = el('input', { type: 'checkbox' }); t.checked = st.outline.on;
      t.addEventListener('change', () => { st.outline.on = t.checked; render(); });
      const t2 = el('input', { type: 'checkbox' }); t2.checked = st.outline.shadow;
      t2.addEventListener('change', () => { st.outline.shadow = t2.checked; render(); });
      opt.append(
        el('div', { class: 'row2' }, el('span', {}, 'ステッカー風のフチ'), el('label', { class: 'switch' }, t, el('span'))),
        sw,
        slider('フチの太さ', 0.005, 0.1, 0.001, () => st.outline.width, (v) => { st.outline.width = v; st.outline.on = true; t.checked = true; }, (v) => Math.round(v * 1000) / 10 + ''),
        el('div', { class: 'row2' }, el('span', {}, '影'), el('label', { class: 'switch' }, t2, el('span'))));
    }
  }
  for (const [k, l] of TOOLS) {
    const b = el('button', { class: 'chip', 'data-t': k }, l);
    b.addEventListener('click', () => { st.tool = k; lasso = null; buildOpt(); render(); });
    tools.append(b);
  }
  buildOpt();

  // --- 保存（透明な余白を切り詰めて PNG にする） ---
  async function exportBlob() {
    const { c } = buildSticker();
    const g = c.getContext('2d', { willReadFrequently: true });
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 6) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = c.width - 1; y1 = c.height - 1; }
    const m = 2;
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(c.width - 1, x1 + m); y1 = Math.min(c.height - 1, y1 + m);
    const out = canvas(x1 - x0 + 1, y1 - y0 + 1);
    out.getContext('2d').drawImage(c, -x0, -y0);
    return await new Promise((r) => out.toBlob(r, 'image/png'));
  }

  window.addEventListener('resize', layout);
  requestAnimationFrame(layout);
  return done;
}
