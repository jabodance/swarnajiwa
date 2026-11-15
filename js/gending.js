// Gending: ready-made compositions played on the seven points.
// Each event: [time (s) in cycle, point 0..6 (Root..Crown), element, hold seconds (0 = strike), velocity]
// Points: 0 Root · 1 Sacral · 2 Solar Plexus · 3 Heart · 4 Throat · 5 Third Eye · 6 Crown

export const GENDINGS = [
  {
    id: 'calm', name: 'Calm', sub: 'Tenang', breath: 'calm',
    desc: 'Slow gong and bell around the root and heart.',
    cycle: 20,
    events: [[0, 0, 'earth', 6, 0.75], [5, 3, 'ether', 0, 0.6], [10, 2, 'earth', 0, 0.5], [14, 3, 'ether', 0, 0.55], [17, 0, 'earth', 0, 0.5]],
  },
  {
    id: 'anxiety', name: 'Ease Anxiety', sub: 'Reda cemas', breath: 'sigh',
    desc: 'A gentle descent from throat to root, long exhales.',
    cycle: 18,
    events: [[0, 4, 'water', 0, 0.6], [3, 3, 'water', 0, 0.6], [6, 2, 'water', 0, 0.55], [9, 1, 'water', 0, 0.55], [12, 0, 'water', 5, 0.6]],
  },
  {
    id: 'sleep', name: 'Sleep', sub: 'Lelap', breath: 'calm', fade: true,
    desc: 'Low gongs that grow softer and sparser, then silence.',
    cycle: 24,
    events: [[0, 0, 'earth', 8, 0.6], [10, 1, 'earth', 0, 0.45], [17, 0, 'earth', 0, 0.4]],
  },
  {
    id: 'focus', name: 'Focus', sub: 'Jernih', breath: 'box',
    desc: 'Bonang pulses between the third eye and the solar plexus.',
    cycle: 8,
    events: [[0, 5, 'fire', 0, 0.7], [2, 2, 'fire', 0, 0.55], [4, 5, 'fire', 0, 0.65], [6, 2, 'fire', 0, 0.5]],
  },
  {
    id: 'heart', name: 'Open Heart', sub: 'Welas asih', breath: 'calm',
    desc: 'Suling circling the heart, warm and flowing.',
    cycle: 12,
    events: [[0, 2, 'wind', 0, 0.6], [1.5, 3, 'wind', 0, 0.65], [3, 4, 'wind', 0, 0.6], [4.5, 3, 'wind', 3, 0.6], [9, 3, 'ether', 0, 0.45]],
  },
  {
    id: 'unity', name: 'Unity', sub: 'Menuju Crown', breath: 'calm',
    desc: 'Bells rise point by point and rest at the crown.',
    cycle: 28,
    events: [[0, 0, 'ether', 0, 0.55], [3, 1, 'ether', 0, 0.55], [6, 2, 'ether', 0, 0.55], [9, 3, 'ether', 0, 0.6], [12, 4, 'ether', 0, 0.6], [15, 5, 'ether', 0, 0.65], [18, 6, 'ether', 8, 0.7]],
  },
  {
    id: 'grounding', name: 'Grounding', sub: 'Membumi', breath: 'calm',
    desc: 'Steady steps of gong at the root and sacral.',
    cycle: 8,
    events: [[0, 0, 'earth', 0, 0.7], [2, 1, 'earth', 0, 0.5], [4, 0, 'earth', 0, 0.65], [6, 1, 'earth', 0, 0.5]],
  },
];

export class GendingPlayer {
  constructor(engine, onEvent) {
    this.engine = engine;
    this.onEvent = onEvent;   // (point, hold) visual callback
    this.current = null;
  }

  get playing() { return !!this.current; }

  play(g, minutes) {
    this.stop();
    const now = this.engine.now + 0.4;
    this.current = { g, start: now, end: now + minutes * 60, until: now };
    this.timer = setInterval(() => this.schedule(), 60);
    this.schedule();
  }

  stop() {
    clearInterval(this.timer);
    this.current = null;
  }

  progress() {
    if (!this.current) return 0;
    const c = this.current;
    return Math.min(1, Math.max(0, (this.engine.now - c.start) / (c.end - c.start)));
  }

  schedule() {
    const c = this.current;
    if (!c) return;
    const now = this.engine.now;
    const horizon = Math.min(c.end - 2, now + (document.hidden ? 1.6 : 0.35));
    const from = Math.max(c.until, now - 0.02);
    if (horizon > from) {
      const L = c.g.cycle;
      let cycle = Math.floor((from - c.start) / L);
      for (; c.start + cycle * L < horizon; cycle++) {
        const base = c.start + cycle * L;
        for (const [t, i, el, hold, vel] of c.g.events) {
          const at = base + t;
          if (at < from || at >= horizon) continue;
          const p = (at - c.start) / (c.end - c.start);
          // Sleep gets softer and sparser as it goes
          if (c.g.fade && p > 0.4 && i !== 0 && Math.random() < p) continue;
          const v = vel * (c.g.fade ? 1 - 0.6 * p : 1);
          this.engine.strike(i, el, { when: at, vel: v });
          if (hold) {
            const h = this.engine.startHold(i, el, at);
            this.engine.stopHold(h, Math.min(at + hold, c.end));
          }
          const delay = Math.max(0, (at - now) * 1000);
          setTimeout(() => this.onEvent(i, hold), delay);
        }
      }
      c.until = horizon;
    }
  }
}
