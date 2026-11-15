// Web Audio engine: synthesised Nusantara-inspired instruments, drone bed,
// long dreamy reverb and a recorder tap on the master output.
import { CHAKRAS } from './data.js';

// Ji = 136 Hz: close to the average Ji measured on Javanese kempul gongs in
// Yogyakarta (UGM physics study, 2016). Like every gamelan, Swarnajiwa has its
// own embat; there is no universal gamelan pitch and no 432 Hz claim here.
const BASE = 136;

// Octave offset per element for struck notes and held tones
const OCT = { earth: 0, water: 1, fire: 1, wind: 2, ether: 2 };
const HOLD_OCT = { earth: 0, water: 1, fire: 1, wind: 2, ether: 1 };

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.reverbAmount = 0.6;
    this.droneOn = true;
    this.droneLevel = 0.55;
  }

  get ready() { return !!this.ctx; }
  get now() { return this.ctx.currentTime; }

  async init(testCtx) {
    if (this.ctx) { await this.ctx.resume(); return; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = testCtx || new AC({ latencyHint: 'interactive' });

    // Master chain
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3;
    comp.attack.value = 0.01; comp.release.value = 0.4;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.002; limiter.release.value = 0.15;
    this.out = ctx.createGain();
    this.master.connect(comp).connect(limiter).connect(this.out);
    this.out.connect(ctx.destination);
    if (ctx.createMediaStreamDestination) {
      this.recDest = ctx.createMediaStreamDestination();
      this.out.connect(this.recDest);
    }

    // Buses
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.revSend = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(7.5);
    this.revReturn = ctx.createGain();
    this.revSend.connect(this.reverb).connect(this.revReturn).connect(this.master);
    // Echo feeding the reverb for extra dreaminess
    this.delaySend = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2200;
    this.delaySend.connect(delay); delay.connect(dlp).connect(fb).connect(delay);
    const dOut = ctx.createGain(); dOut.gain.value = 0.35;
    dlp.connect(dOut); dOut.connect(this.master); dOut.connect(this.revSend);
    this.setReverb(this.reverbAmount);

    this.noiseBuf = this.makeNoise(2);
    this.buildDrone();
    if (!testCtx) await ctx.resume();
  }

  makeImpulse(seconds) {
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        const coef = 0.25 + x * 0.7; // tail gets darker
        lp = lp * coef + (Math.random() * 2 - 1) * (1 - coef);
        const env = Math.pow(1 - x, 2.2) * (i < sr * 0.03 ? i / (sr * 0.03) : 1);
        d[i] = lp * env * 2.2;
      }
    }
    return buf;
  }

  makeNoise(seconds) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setReverb(v) {
    this.reverbAmount = v;
    if (!this.ctx) return;
    const t = this.now;
    this.revReturn.gain.setTargetAtTime(0.25 + v * 1.1, t, 0.1);
    this.delaySend.gain.setTargetAtTime(0.05 + v * 0.3, t, 0.1);
    this.dry.gain.setTargetAtTime(1 - v * 0.35, t, 0.1);
  }

  freq(i, oct = 0) {
    return BASE * Math.pow(2, CHAKRAS[i].cents / 1200) * Math.pow(2, oct);
  }

  // A voice output with dry + reverb + echo sends; auto-disconnects.
  voice(send = 0.5, echo = 0.3) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const rs = ctx.createGain(); rs.gain.value = send;
    const es = ctx.createGain(); es.gain.value = echo;
    g.connect(this.dry); g.connect(rs).connect(this.revSend); g.connect(es).connect(this.delaySend);
    g._cleanup = () => { try { g.disconnect(); rs.disconnect(); es.disconnect(); } catch (e) { /* noop */ } };
    return g;
  }

  partial(dest, f, amp, decay, t, { attack = 0.004, type = 'sine', bendFrom = 0, bendTime = 0.06 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    if (bendFrom) {
      o.frequency.setValueAtTime(f * bendFrom, t);
      o.frequency.exponentialRampToValueAtTime(f, t + bendTime);
    } else o.frequency.setValueAtTime(f, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
    o.onended = () => { try { g.disconnect(); } catch (e) { /* noop */ } };
    return t + attack + decay;
  }

  noiseHit(dest, t, { type = 'bandpass', freq = 2000, q = 1, amp = 0.05, decay = 0.05 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random());
    src.stop(t + decay + 0.05);
  }

  // ---------- struck notes ----------
  strike(i, el, { when, vel = 1 } = {}) {
    if (!this.ctx) return;
    const t = Math.max(when ?? this.now, this.now);
    const f = this.freq(i, OCT[el]);
    let end = t;
    const P = (v, ff, a, d, o) => { end = Math.max(end, this.partial(v, ff, a * vel, d, t, o)); };

    if (el === 'earth') {            // Gong / Kempul
      const v = this.voice(0.55, 0.15);
      const lift = 1 - i * 0.06;       // higher chakras ring a bit shorter
      P(v, f, 0.42, 7 * lift, { attack: 0.025 });
      P(v, f + 3.2, 0.3, 6.5 * lift, { attack: 0.03 });     // ombak (beating)
      P(v, f * 0.5, 0.18, 6 * lift, { attack: 0.04 });
      P(v, f * 2.01, 0.12, 3.5 * lift, { attack: 0.02 });
      P(v, f * 2.98, 0.06, 2.2 * lift, { attack: 0.02 });
      P(v, f * 4.13, 0.03, 1.2, { attack: 0.015 });
      this.noiseHit(v, t, { type: 'lowpass', freq: 220, q: 0.7, amp: 0.22 * vel, decay: 0.22 });
      this.release(v, end);
    } else if (el === 'water') {     // Gender (bars over tube resonators)
      const v = this.voice(0.55, 0.3);
      P(v, f, 0.34, 4.2);
      P(v, f + 2.6, 0.24, 4.0);
      P(v, f * 2.76, 0.07, 1.1);
      P(v, f * 5.4, 0.025, 0.4);
      this.noiseHit(v, t, { freq: 2600, q: 1.2, amp: 0.035 * vel, decay: 0.03 });
      this.release(v, end);
    } else if (el === 'fire') {      // Bonang (kettle gong)
      const v = this.voice(0.45, 0.35);
      P(v, f, 0.34, 2.4, { attack: 0.002, bendFrom: 1.012, bendTime: 0.08 });
      P(v, f + 4, 0.18, 2.2, { attack: 0.002, bendFrom: 1.012, bendTime: 0.08 });
      P(v, f * 2.02, 0.11, 1.1, { attack: 0.002 });
      P(v, f * 3.05, 0.06, 0.6, { attack: 0.002 });
      P(v, f * 4.6, 0.035, 0.3, { attack: 0.002 });
      this.noiseHit(v, t, { freq: 3600, q: 1.5, amp: 0.06 * vel, decay: 0.04 });
      this.release(v, end);
    } else if (el === 'wind') {      // Suling (bamboo flute)
      end = this.blow(i, t, 1.5, vel);
    } else {                         // Akasha: Genta (temple bell)
      const v = this.voice(0.9, 0.4);
      P(v, f * 0.5, 0.07, 8, { attack: 0.01 });
      P(v, f, 0.2, 7);
      P(v, f + 1.3, 0.14, 7);
      P(v, f * 2.0, 0.09, 4.2);
      P(v, f * 2.73, 0.05, 2.6);
      P(v, f * 3.76, 0.03, 1.6);
      P(v, f * 5.2, 0.015, 0.9);
      this.noiseHit(v, t, { freq: 5000, q: 2, amp: 0.02 * vel, decay: 0.02 });
      this.release(v, end);
    }
    return end;
  }

  blow(i, t, dur, vel = 1) {
    const ctx = this.ctx;
    const f = this.freq(i, OCT.wind);
    const v = this.voice(0.65, 0.4);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.26 * vel, t + 0.12);
    env.gain.setValueAtTime(0.26 * vel, t + dur);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.9);
    env.connect(v);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    lp.connect(env);
    const o1 = ctx.createOscillator(); o1.type = 'sine';
    const o2 = ctx.createOscillator(); o2.type = 'triangle';
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    for (const o of [o1, o2]) {
      o.frequency.setValueAtTime(f * 0.985, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.14);
    }
    const vib = ctx.createOscillator(); vib.frequency.value = 5.1;
    const vibG = ctx.createGain();
    vibG.gain.setValueAtTime(0, t);
    vibG.gain.linearRampToValueAtTime(f * 0.006, t + 0.6);
    vib.connect(vibG); vibG.connect(o1.frequency); vibG.connect(o2.frequency);
    o1.connect(lp); o2.connect(g2).connect(lp);
    // breath noise
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 1.6; bp.Q.value = 1.4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.09 * vel, t + 0.05);
    ng.gain.exponentialRampToValueAtTime(0.025 * vel, t + 0.4);
    ng.gain.setValueAtTime(0.025 * vel, t + dur);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
    n.connect(bp).connect(ng).connect(v);
    const stop = t + dur + 1;
    [o1, o2, vib, n].forEach((o) => { o.start(t); o.stop(stop); });
    this.release(v, stop);
    return stop;
  }

  release(v, at) {
    const ms = Math.max(0, (at - this.now) * 1000) + 300;
    setTimeout(() => v._cleanup(), ms);
  }

  // ---------- held tones ----------
  startHold(i, el, when) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const t = Math.max(when ?? this.now, this.now);
    const f = this.freq(i, HOLD_OCT[el]);
    const v = this.voice(el === 'ether' ? 0.9 : 0.7, 0.25);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(el === 'wind' ? 0.2 : 0.17, t + 0.9);
    env.connect(v);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = el === 'earth' ? 900 : el === 'fire' ? 1400 : 2400;
    lp.connect(env);
    const nodes = [];
    const osc = (freq, amp, type = 'sine') => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = ctx.createGain(); g.gain.value = amp;
      o.connect(g).connect(lp); o.start(t); nodes.push(o);
      return o;
    };
    osc(f, 0.5);
    osc(f + 1.8, 0.4);                  // ombak beating
    osc(f * 2, 0.08);
    if (el === 'earth') osc(f * 0.5, 0.45);
    if (el === 'fire') { osc(f, 0.18, 'triangle'); }
    if (el === 'ether') { osc(f * 2 + 0.7, 0.12); osc(f * 3, 0.05); }
    if (el === 'wind') {
      const vib = ctx.createOscillator(); vib.frequency.value = 5;
      const vg = ctx.createGain(); vg.gain.value = f * 0.005;
      vib.connect(vg); nodes.forEach((o) => vg.connect(o.frequency));
      vib.start(t); nodes.push(vib);
      const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 1.6; bp.Q.value = 1.4;
      const ng = ctx.createGain(); ng.gain.value = 0.05;
      n.connect(bp).connect(ng).connect(env); n.start(t); nodes.push(n);
    }
    if (el === 'water') {
      const trem = ctx.createOscillator(); trem.frequency.value = 3.6;
      const tg = ctx.createGain(); tg.gain.value = 0.35;
      const amp = ctx.createGain(); amp.gain.value = 0.65;
      lp.disconnect(); lp.connect(amp).connect(env);
      trem.connect(tg).connect(amp.gain); trem.start(t); nodes.push(trem);
    }
    return { v, env, nodes, t };
  }

  stopHold(h, when) {
    if (!h || !this.ctx) return;
    const t = Math.max(when ?? this.now, h.t + 0.05);
    h.env.gain.cancelScheduledValues(t);
    h.env.gain.setTargetAtTime(0.0001, t, 0.7);
    const stop = t + 4;
    h.nodes.forEach((o) => { try { o.stop(stop); } catch (e) { /* noop */ } });
    this.release(h.v, stop);
  }

  // ---------- hum-along tone (a soft voice-like drone to hum with) ----------
  startHum(i, oct = 0) {
    if (!this.ctx) return null;
    const ctx = this.ctx, t = this.now;
    const f = this.freq(i, oct);
    const v = this.voice(0.6, 0.15);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.15, t + 0.7);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.8;
    lp.connect(env).connect(v);
    const nodes = [];
    [[1, 0.55], [2, 0.22], [3, 0.1], [4, 0.04]].forEach(([r, a]) => {
      const o = ctx.createOscillator(); o.frequency.value = f * r;
      const g = ctx.createGain(); g.gain.value = a;
      o.connect(g).connect(lp); o.start(t); nodes.push(o);
    });
    const vib = ctx.createOscillator(); vib.frequency.value = 4.6;
    const vg = ctx.createGain(); vg.gain.value = f * 0.004;
    vib.connect(vg); nodes.forEach((o) => vg.connect(o.frequency));
    vib.start(t); nodes.push(vib);
    return { v, env, nodes, t };
  }

  stopHum(h) {
    if (!h || !this.ctx) return;
    const t = Math.max(this.now, h.t + 0.05);
    h.env.gain.cancelScheduledValues(t);
    h.env.gain.setTargetAtTime(0.0001, t, 0.35);
    h.nodes.forEach((o) => { try { o.stop(t + 2.5); } catch (e) { /* noop */ } });
    this.release(h.v, t + 2.5);
  }

  // ---------- bell for sessions ----------
  bell(when) {
    if (!this.ctx) return;
    const t = Math.max(when ?? this.now, this.now);
    const v = this.voice(0.85, 0.2);
    const f = BASE * 2;
    [[0.5, 0.12, 10], [1, 0.26, 9], [1.0045, 0.18, 9], [2, 0.1, 5], [2.73, 0.06, 3.5], [3.76, 0.04, 2.2], [5.2, 0.02, 1.2]]
      .forEach(([r, a, d]) => this.partial(v, f * r, a, d, t, { attack: 0.004 }));
    this.release(v, t + 11);
  }

  // ---------- ambient drone bed ----------
  buildDrone() {
    const ctx = this.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 650;
    this.droneFilter.Q.value = 0.6;
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.dry);
    const ds = ctx.createGain(); ds.gain.value = 0.7;
    this.droneGain.connect(ds).connect(this.revSend);

    const ma = BASE * Math.pow(2, 675 / 1200);
    const parts = [
      [BASE / 2, 0.34, 'sine', 0], [BASE, 0.2, 'sine', 3], [BASE, 0.12, 'sine', -4],
      [ma, 0.06, 'triangle', 0], [BASE * 2, 0.035, 'sine', 2], [ma / 2, 0.08, 'sine', 0],
    ];
    parts.forEach(([f, a, type, cents], k) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = cents;
      const g = ctx.createGain(); g.gain.value = a;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.03 + k * 0.017;
      const lg = ctx.createGain(); lg.gain.value = a * 0.45;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(this.droneFilter);
      o.start(); lfo.start();
    });
    // airy breath layer
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.8;
    this.airGain = ctx.createGain(); this.airGain.gain.value = 0.025;
    n.connect(bp).connect(this.airGain).connect(this.droneFilter);
    n.start();
    // slow filter movement
    const fl = ctx.createOscillator(); fl.frequency.value = 0.045;
    const flg = ctx.createGain(); flg.gain.value = 180;
    fl.connect(flg).connect(this.droneFilter.frequency); fl.start();
    this.applyDrone(2.5);
  }

  applyDrone(fade = 1.2) {
    if (!this.ctx) return;
    const target = this.droneOn ? this.droneLevel * 0.38 : 0;
    this.droneGain.gain.setTargetAtTime(target, this.now, fade / 3);
  }

  setDrone(on, level) {
    if (on !== undefined) this.droneOn = on;
    if (level !== undefined) this.droneLevel = level;
    this.applyDrone();
  }

  // breath level 0..1 opens the drone filter (felt as a swell on inhale)
  breathe(level) {
    if (!this.ctx) return;
    this.droneFilter.frequency.setTargetAtTime(480 + level * 900, this.now, 0.4);
    this.airGain.gain.setTargetAtTime(0.015 + level * 0.04, this.now, 0.4);
  }

  fadeMaster(to, seconds) {
    if (!this.ctx) return;
    const g = this.master.gain;
    g.cancelScheduledValues(this.now);
    g.setValueAtTime(g.value, this.now);
    g.linearRampToValueAtTime(to, this.now + seconds);
  }

  // ---------- recording ----------
  static pickMime() {
    if (!window.MediaRecorder) return null;
    const types = ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
    return types.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
  }

  record(seconds, onProgress) {
    return new Promise((resolve, reject) => {
      const mime = AudioEngine.pickMime();
      if (mime === null) { reject(new Error('Recording is not supported in this browser.')); return; }
      const rec = new MediaRecorder(this.recDest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 96000 } : {});
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const type = rec.mimeType || mime || 'audio/webm';
        resolve(new Blob(chunks, { type }));
      };
      rec.onerror = (e) => reject(e.error || e);
      rec.start(250);
      const t0 = performance.now();
      const tick = setInterval(() => {
        const p = (performance.now() - t0) / (seconds * 1000);
        onProgress?.(Math.min(1, p));
        if (p >= 1) { clearInterval(tick); rec.stop(); }
      }, 100);
    });
  }
}
