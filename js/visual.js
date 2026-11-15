// Cosmic background, sacred geometry, aura ribbons, figure and chakra points.
import { VIEW, FIGURES, renderFigure, loadFigures } from './figures.js';
import { CHAKRAS } from './data.js';

const TAU = Math.PI * 2;
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class Scene {
  constructor() {
    const rnd = seeded(7);
    this.stars = Array.from({ length: 260 }, () => ({
      x: rnd(), y: rnd(), r: Math.pow(rnd(), 3) * 1.5 + 0.25,
      tw: rnd() * TAU, sp: 0.4 + rnd() * 1.6, hue: rnd(),
    }));
    this.bokeh = Array.from({ length: 26 }, () => ({
      x: rnd(), y: rnd(), r: 1.5 + rnd() * 4, sp: 0.004 + rnd() * 0.01,
      ph: rnd() * TAU, c: [[255, 190, 140], [170, 200, 255], [220, 170, 255]][Math.floor(rnd() * 3)],
    }));
    // constellations in normalised screen coordinates
    this.constellations = [
      [[0.08, 0.12], [0.14, 0.09], [0.2, 0.13], [0.25, 0.1], [0.3, 0.14]],
      [[0.7, 0.07], [0.76, 0.12], [0.83, 0.1], [0.88, 0.15], [0.8, 0.18]],
      [[0.05, 0.42], [0.1, 0.38], [0.13, 0.45], [0.09, 0.5]],
      [[0.86, 0.38], [0.92, 0.42], [0.9, 0.5], [0.95, 0.55]],
      [[0.1, 0.66], [0.16, 0.62], [0.2, 0.7]],
      [[0.8, 0.64], [0.86, 0.68], [0.92, 0.63]],
    ];
    this.nebulae = [
      { x: 0.25, y: 0.3, r: 0.55, c: [110, 60, 200], a: 0.22, sp: 0.013, ph: 0 },
      { x: 0.8, y: 0.22, r: 0.5, c: [50, 90, 210], a: 0.2, sp: 0.009, ph: 2 },
      { x: 0.7, y: 0.65, r: 0.6, c: [150, 50, 170], a: 0.16, sp: 0.011, ph: 4 },
      { x: 0.2, y: 0.75, r: 0.5, c: [30, 120, 170], a: 0.14, sp: 0.007, ph: 1 },
      { x: 0.55, y: 0.45, r: 0.4, c: [90, 70, 230], a: 0.14, sp: 0.015, ph: 3 },
    ];
    this.ribbons = Array.from({ length: 9 }, (_, i) => ({
      ph: rnd() * TAU, sp: 0.15 + rnd() * 0.25, k: 2 + Math.floor(rnd() * 3),
      rx: 0.92 + rnd() * 0.22, ry: 0.9 + rnd() * 0.2, tilt: (rnd() - 0.5) * 0.5,
      hue: i / 9,
    }));
    this.ripples = [];
    this.labels = [];
    this.figureCache = {};
    this.figureShownAt = {};
    loadFigures((kind) => { this.figureCache = {}; this.figureShownAt[kind] = performance.now(); });
    this.state = {
      figure: 'male',
      energy: new Array(7).fill(0.18),
      holding: new Set(),
      breath: 0.5,       // 0 = fully exhaled, 1 = fully inhaled
      breathActive: false,
      focus: -1,         // chakra highlighted by journey
      reduceMotion: false,
      showLabels: true,
    };
  }

  layout(w, h, dpr, fig) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.fig = fig; // { x, y, s } in CSS px; s = px per view unit
    this.figureCache = {};
    this.bg = null;
  }

  getFigureBitmap(kind, s, dpr) {
    const key = `${kind}:${(s * dpr).toFixed(3)}`;
    if (!this.figureCache[key]) {
      const bmp = renderFigure(kind, s * dpr);
      if (!bmp) return null;
      this.figureCache[key] = bmp;
    }
    return this.figureCache[key];
  }

  chakraPoint(i, fig = this.fig) {
    const [vx, vy] = FIGURES[this.state.figure].chakras[i];
    return [fig.x + vx * fig.s, fig.y + vy * fig.s];
  }

  hitTest(x, y) {
    let best = -1, bd = Infinity;
    const radius = Math.max(22, 24 * this.fig.s);
    for (let i = 0; i < 7; i++) {
      const [cx, cy] = this.chakraPoint(i);
      const d = Math.hypot(x - cx, y - cy);
      if (d < radius && d < bd) { bd = d; best = i; }
    }
    return best;
  }

  addRipple(i, strength = 1) {
    this.ripples.push({ i, t0: performance.now(), strength });
    if (this.ripples.length > 40) this.ripples.shift();
    const e = this.state.energy;
    e[i] = Math.min(1, e[i] + 0.22 * strength);
    if (this.state.showLabels && strength >= 0.6) {
      this.labels = this.labels.filter((l) => l.i !== i);
      this.labels.push({ i, t0: performance.now() });
    }
  }

  update(dt) {
    const e = this.state.energy;
    for (let i = 0; i < 7; i++) {
      const target = this.state.holding.has(i) ? 1 : (this.state.focus === i ? 0.6 : 0.18);
      const rate = this.state.holding.has(i) ? 1.2 : 0.05;
      e[i] += (target - e[i]) * Math.min(1, dt * rate);
    }
  }

  // ---------- drawing ----------
  render(ctx, t, opts = {}) {
    const W = opts.w ?? this.w, H = opts.h ?? this.h;
    const fig = opts.fig ?? this.fig;
    const dpr = opts.dpr ?? this.dpr;
    const motion = this.state.reduceMotion ? 0.25 : 1;
    const tm = t * motion;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.drawBackground(ctx, W, H, tm);
    this.drawBackGlow(ctx, fig);
    this.drawFigure(ctx, fig, dpr, opts.instant);
    this.drawAura(ctx, fig, tm);
    this.drawChakras(ctx, fig, t);
    this.drawBokeh(ctx, W, H, tm);
    if (!opts.noLabels) this.drawLabels(ctx, fig);
    ctx.restore();
  }

  drawBackground(ctx, W, H, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#040b22');
    g.addColorStop(0.45, '#0c0b2a');
    g.addColorStop(1, '#050816');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const m = Math.max(W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const n of this.nebulae) {
      const x = (n.x + Math.sin(t * n.sp + n.ph) * 0.06) * W;
      const y = (n.y + Math.cos(t * n.sp * 0.8 + n.ph) * 0.05) * H;
      const r = n.r * m * (1 + Math.sin(t * n.sp * 1.3 + n.ph) * 0.08);
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, rgba(n.c, n.a * 0.55));
      rg.addColorStop(0.5, rgba(n.c, n.a * 0.2));
      rg.addColorStop(1, rgba(n.c, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }

    // stars drift very slowly
    const driftX = t * 0.0025, driftY = t * 0.0012;
    for (const s of this.stars) {
      const x = ((s.x + driftX) % 1) * W;
      const y = ((s.y + driftY) % 1) * H;
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.tw));
      ctx.fillStyle = s.hue > 0.85 ? `rgba(255,220,190,${a})` : s.hue > 0.7 ? `rgba(190,200,255,${a})` : `rgba(235,238,255,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, TAU);
      ctx.fill();
      if (s.r > 1.25) {
        ctx.fillStyle = `rgba(200,210,255,${a * 0.18})`;
        ctx.beginPath();
        ctx.arc(x, y, s.r * 4, 0, TAU);
        ctx.fill();
      }
    }

    // constellations
    ctx.lineWidth = 0.6;
    for (let k = 0; k < this.constellations.length; k++) {
      const pts = this.constellations[k];
      const a = 0.18 + 0.1 * Math.sin(t * 0.3 + k);
      const ox = Math.sin(t * 0.02 + k) * 6, oy = Math.cos(t * 0.017 + k) * 4;
      ctx.strokeStyle = `rgba(200,210,255,${a})`;
      ctx.beginPath();
      pts.forEach(([px, py], j) => {
        const x = px * W + ox, y = py * H + oy;
        j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = `rgba(230,235,255,${a + 0.4})`;
      for (const [px, py] of pts) {
        ctx.beginPath();
        ctx.arc(px * W + ox, py * H + oy, 1.1, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  auraColor(h) {
    // rainbow palette leaning to the chakra colors
    const idx = h * 6;
    const i = Math.floor(idx) % 7, j = (i + 1) % 7, f = idx - Math.floor(idx);
    const a = CHAKRAS[i].color, b = CHAKRAS[j].color;
    return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f));
  }

  drawAura(ctx, fig, t) {
    const s = fig.s;
    const cx = fig.x + 200 * s, cy = fig.y + 205 * s;
    const breathScale = 0.95 + this.state.breath * 0.1;
    const e = this.state.energy;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // flowing ribbons arching over and around the body (kept off the face and lap)
    const N = 70, th0 = Math.PI - 0.62, th1 = TAU + 0.62;
    for (let r = 0; r < this.ribbons.length; r++) {
      const rb = this.ribbons[r];
      const ci = r % 7;
      const base = this.auraColor((rb.hue + t * 0.01) % 1);
      const cc = CHAKRAS[ci].color;
      const w = Math.min(1, e[ci] * 1.2);
      const col = base.map((v, k) => Math.round(v * (1 - w * 0.6) + cc[k] * w * 0.6));
      const amp = 0.05 + e[ci] * 0.06;
      const RX = 178 * s * rb.rx * breathScale * (1 + e[ci] * 0.06);
      const RY = 205 * s * rb.ry * breathScale * (1 + e[ci] * 0.05);
      const ph = rb.ph + t * rb.sp;
      const tilt = rb.tilt * 0.4 + Math.sin(t * 0.07 + r) * 0.05;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      ctx.beginPath();
      for (let k = 0; k <= N; k++) {
        const th = th0 + (k / N) * (th1 - th0);
        const wob = 1 + amp * Math.sin(rb.k * th + ph) + amp * 0.6 * Math.sin((rb.k + 2) * th - ph * 1.3);
        const x = Math.cos(th) * RX * wob, y = Math.sin(th) * RY * wob;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      const a = 0.04 + e[ci] * 0.17;
      for (const [lw, aa] of [[20, 0.16], [9, 0.38], [3, 0.85], [1.1, 1.3]]) {
        const gr = ctx.createLinearGradient(0, -RY, 0, RY * 0.58);
        gr.addColorStop(0, rgba(col, Math.min(1, a * aa)));
        gr.addColorStop(0.7, rgba(col, Math.min(1, a * aa * 0.8)));
        gr.addColorStop(1, rgba(col, 0));
        ctx.strokeStyle = gr;
        ctx.lineWidth = lw * Math.max(0.6, s);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  drawFigure(ctx, fig, dpr, instant) {
    const bmp = this.getFigureBitmap(this.state.figure, fig.s, dpr);
    if (!bmp) return;
    const shown = this.figureShownAt[this.state.figure] || 0;
    const a = instant ? 1 : Math.min(1, (performance.now() - shown) / 900);
    const s = fig.s;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.drawImage(bmp.canvas, fig.x + bmp.x * s, fig.y + bmp.y * s,
      bmp.canvas.width / dpr, bmp.canvas.height / dpr);
    ctx.restore();
  }

  // soft light behind the artwork, so its faded edges blend into the sky
  drawBackGlow(ctx, fig) {
    const s = fig.s;
    const cx = fig.x + 200 * s, cy = fig.y + 190 * s;
    const total = this.state.energy.reduce((a, b) => a + b, 0) / 7;
    const r = 260 * s * (0.95 + this.state.breath * 0.1);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(70,90,210,${0.1 + total * 0.14})`);
    g.addColorStop(0.6, `rgba(70,50,170,${0.04 + total * 0.05})`);
    g.addColorStop(1, 'rgba(60,40,160,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawChakras(ctx, fig, t) {
    const s = fig.s;
    const e = this.state.energy;
    const now = performance.now();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // ripples
    this.ripples = this.ripples.filter((r) => now - r.t0 < 2600);
    for (const r of this.ripples) {
      const [x, y] = this.chakraPoint(r.i, fig);
      const p = (now - r.t0) / 2600;
      const col = CHAKRAS[r.i].color;
      for (let k = 0; k < 3; k++) {
        const pk = p - k * 0.12;
        if (pk <= 0) continue;
        const ease = 1 - Math.pow(1 - pk, 3);
        const rad = (8 + ease * 150) * s;
        ctx.strokeStyle = rgba(col, (1 - pk) * 0.55 * r.strength);
        ctx.lineWidth = (3 - k) * (1 - pk) * Math.max(1, s * 1.2);
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, TAU);
        ctx.stroke();
      }
      if (p < 0.25) {
        const fl = ctx.createRadialGradient(x, y, 0, x, y, 60 * s);
        fl.addColorStop(0, rgba(col, (0.25 - p) * 2.4 * r.strength));
        fl.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = fl;
        ctx.beginPath();
        ctx.arc(x, y, 60 * s, 0, TAU);
        ctx.fill();
      }
    }

    // points
    for (let i = 0; i < 7; i++) {
      const [x, y] = this.chakraPoint(i, fig);
      const col = CHAKRAS[i].color;
      const holding = this.state.holding.has(i);
      const focus = this.state.focus === i;
      const pulse = 0.5 + 0.5 * Math.sin(t * (holding ? 6 : 1.6) + i * 0.9);
      const glowR = (14 + e[i] * 22 + pulse * 4 + (focus ? 10 * pulse : 0)) * s;
      const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
      g.addColorStop(0, rgba(col, 0.75 + e[i] * 0.25));
      g.addColorStop(0.35, rgba(col, 0.28 + e[i] * 0.3));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, glowR, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.75 + e[i] * 0.25})`;
      ctx.beginPath();
      ctx.arc(x, y, (2.2 + e[i] * 1.6) * Math.max(0.8, s), 0, TAU);
      ctx.fill();
      if (focus) {
        ctx.strokeStyle = rgba(col, 0.35 + pulse * 0.4);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, (20 + pulse * 6) * s, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawBokeh(ctx, W, H, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bokeh) {
      const y = (1 - ((b.y + t * b.sp) % 1)) * H;
      const x = b.x * W + Math.sin(t * 0.3 + b.ph) * 12;
      const a = 0.12 + 0.12 * Math.sin(t * 0.7 + b.ph);
      const g = ctx.createRadialGradient(x, y, 0, x, y, b.r * 3);
      g.addColorStop(0, rgba(b.c, a + 0.15));
      g.addColorStop(1, rgba(b.c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, b.r * 3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawLabels(ctx, fig) {
    const now = performance.now();
    this.labels = this.labels.filter((l) => now - l.t0 < 2200);
    ctx.save();
    ctx.textBaseline = 'middle';
    for (const l of this.labels) {
      const p = (now - l.t0) / 2200;
      const a = p < 0.15 ? p / 0.15 : 1 - Math.max(0, (p - 0.55) / 0.45);
      const [x, y] = this.chakraPoint(l.i, fig);
      const c = CHAKRAS[l.i];
      const side = l.i % 2 === 0 ? 1 : -1;
      const tx = x + side * 34 * Math.max(0.8, fig.s);
      ctx.textAlign = side > 0 ? 'left' : 'right';
      ctx.font = `500 15px "Cormorant Garamond", Georgia, serif`;
      ctx.fillStyle = `rgba(255,248,235,${a})`;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 6;
      ctx.fillText(c.name, tx, y - 7 - p * 6);
      ctx.font = `500 10px "Manrope", system-ui, sans-serif`;
      ctx.fillStyle = rgba(c.color, a * 0.95);
      ctx.fillText(`${c.quality.toUpperCase()}  ·  ${c.note.toUpperCase()}`, tx, y + 9 - p * 6);
    }
    ctx.restore();
  }
}

export { VIEW };
