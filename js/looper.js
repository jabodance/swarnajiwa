// Event-based layered looper. Notes are stored as events and re-synthesised
// on every cycle, so layers can mix elements and stay perfectly in time.

const MAX_LAYERS = 4;
const MAX_LEN = 60;
const MIN_LEN = 2;

export class Looper {
  constructor(engine, onPlayEvent, onChange) {
    this.engine = engine;
    this.onPlayEvent = onPlayEvent;   // (i, type, dur) visual callback
    this.onChange = onChange;         // UI refresh
    this.layers = [];
    this.loopLen = 0;
    this.recording = false;
    this.playing = false;
    this.current = null;
    this.openHolds = new Map();
    this.timer = null;
  }

  get maxLayers() { return MAX_LAYERS; }
  get hasLoop() { return this.layers.length > 0; }
  get canRecord() { return this.layers.length < MAX_LAYERS; }

  position() {
    if (!this.playing || !this.loopLen) return 0;
    const e = this.engine.now - this.loopStart;
    return ((e % this.loopLen) + this.loopLen) % this.loopLen;
  }

  progress() {
    if (this.recording && !this.layers.length) {
      return Math.min(1, (this.engine.now - this.recStart) / MAX_LEN);
    }
    if (this.recording) return Math.min(1, (this.engine.now - this.recStart) / this.loopLen);
    return this.loopLen ? this.position() / this.loopLen : 0;
  }

  startRecord() {
    if (!this.canRecord || this.recording) return;
    this.current = [];
    this.openHolds.clear();
    this.recording = true;
    if (!this.layers.length) {
      this.recStart = this.engine.now;
      this.autoStop = setTimeout(() => this.stopRecord(), MAX_LEN * 1000);
    } else {
      if (!this.playing) this.play();
      // overdub exactly one full cycle, starting now
      this.recStart = this.engine.now;
      this.recOffset = this.position();
      this.autoStop = setTimeout(() => this.stopRecord(), this.loopLen * 1000);
    }
    this.onChange();
  }

  relTime() {
    const now = this.engine.now;
    if (!this.layers.length) return now - this.recStart;
    return (this.recOffset + (now - this.recStart)) % this.loopLen;
  }

  captureTap(i, el) {
    if (!this.recording) return;
    this.current.push({ t: this.relTime(), i, el, type: 'tap' });
  }

  captureHoldStart(id, i, el, backdate = 0) {
    if (!this.recording) return;
    // turn the tap that started this touch into a hold event
    let t = this.relTime() - backdate;
    const last = this.current[this.current.length - 1];
    if (last && last.type === 'tap' && last.i === i) { this.current.pop(); t = last.t; }
    if (this.loopLen) t = ((t % this.loopLen) + this.loopLen) % this.loopLen;
    else t = Math.max(0, t);
    const ev = { t, i, el, type: 'hold', dur: 0, _start: this.engine.now - backdate };
    this.current.push(ev);
    this.openHolds.set(id, ev);
  }

  captureHoldEnd(id) {
    const ev = this.openHolds.get(id);
    if (!ev) return;
    ev.dur = Math.max(0.3, this.engine.now - ev._start);
    this.openHolds.delete(id);
  }

  stopRecord() {
    if (!this.recording) return;
    clearTimeout(this.autoStop);
    const now = this.engine.now;
    for (const ev of this.openHolds.values()) ev.dur = Math.max(0.3, now - ev._start);
    this.openHolds.clear();
    this.recording = false;
    const events = this.current.map(({ _start, ...e }) => e);
    this.current = null;
    if (!this.layers.length) {
      if (!events.length) { this.onChange(); return; }
      this.loopLen = Math.min(MAX_LEN, Math.max(MIN_LEN, now - this.recStart));
      // clamp holds to the loop length
      events.forEach((e) => { if (e.type === 'hold') e.dur = Math.min(e.dur, this.loopLen - 0.05); });
      this.layers.push({ events });
      this.play(now);
    } else if (events.length) {
      events.forEach((e) => { if (e.type === 'hold') e.dur = Math.min(e.dur, this.loopLen - 0.05); });
      this.layers.push({ events });
    }
    this.onChange();
  }

  play(at) {
    if (!this.layers.length) return;
    this.playing = true;
    this.loopStart = at ?? this.engine.now + 0.05;
    this.scheduledUntil = this.loopStart;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 50);
    this.schedule();
    this.onChange();
  }

  restart() { this.play(this.engine.now + 0.1); }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    if (this.recording) this.stopRecord();
    this.onChange();
  }

  undo() {
    if (this.recording) { this.recording = false; clearTimeout(this.autoStop); this.current = null; }
    else this.layers.pop();
    if (!this.layers.length) this.clear();
    this.onChange();
  }

  clear() {
    this.stop();
    this.layers = [];
    this.loopLen = 0;
    this.onChange();
  }

  schedule() {
    if (!this.playing) return;
    const now = this.engine.now;
    const horizon = now + (document.hidden ? 1.6 : 0.3);
    const from = Math.max(this.scheduledUntil, now - 0.02);
    if (horizon <= from) return;
    const L = this.loopLen;
    let cycle = Math.floor((from - this.loopStart) / L);
    for (; this.loopStart + cycle * L < horizon; cycle++) {
      const base = this.loopStart + cycle * L;
      for (const layer of this.layers) {
        for (const ev of layer.events) {
          const at = base + ev.t;
          if (at >= from && at < horizon) this.fire(ev, at);
        }
      }
    }
    this.scheduledUntil = horizon;
  }

  fire(ev, at) {
    const delay = Math.max(0, (at - this.engine.now) * 1000);
    if (ev.type === 'tap') {
      this.engine.strike(ev.i, ev.el, { when: at, vel: 0.85 });
      setTimeout(() => this.onPlayEvent(ev.i, 'tap', 0), delay);
    } else {
      this.engine.strike(ev.i, ev.el, { when: at, vel: 0.85 });
      const h = this.engine.startHold(ev.i, ev.el, at);
      this.engine.stopHold(h, at + ev.dur);
      setTimeout(() => this.onPlayEvent(ev.i, 'hold', ev.dur), delay);
    }
  }
}
