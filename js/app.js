import { Scene } from './visual.js';
import { AudioEngine } from './audio.js';
import { Looper } from './looper.js';
import { GENDINGS, GendingPlayer } from './gending.js';
import { CHAKRAS, BREATH_PATTERNS, MOODS } from './data.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- persisted settings ----------
const STORE_KEY = 'swarnajiwa:v1';
const defaults = {
  figure: 'male', element: 'water', drone: true, droneLevel: 0.55, reverb: 0.6,
  labels: true, reduceMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
  breath: 'calm', journeySec: 60, hum: false, gending: 'calm', gendingMin: 5, gendingBreath: true,
};
let settings = { ...defaults };
try { Object.assign(settings, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (e) { /* storage unavailable */ }
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } };

// ---------- core objects ----------
const canvas = $('#stage');
const ctx = canvas.getContext('2d');
const scene = new Scene();
const engine = new AudioEngine();
engine.droneOn = settings.drone;
engine.droneLevel = settings.droneLevel;
engine.reverbAmount = settings.reverb;
scene.state.figure = settings.figure;
scene.state.showLabels = settings.labels;
scene.state.reduceMotion = settings.reduceMotion;

const session = { start: 0, taps: new Array(7).fill(0), tones: 0, moodBefore: null, moodAfter: null };
let lastAudio = null;

const looper = new Looper(engine, (i, type) => {
  scene.addRipple(i, type === 'hold' ? 0.8 : 0.7);
}, () => refreshLoopUI());

// ---------- layout ----------
function layout() {
  const W = window.innerWidth, H = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const top = 58 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0);
  const panelTop = $('#panel').getBoundingClientRect().top;
  document.documentElement.style.setProperty('--tools-h', `${H - $('.tools').getBoundingClientRect().top + 6}px`);
  const availH = Math.max(200, panelTop - top);
  const s = Math.min(availH / 500, (W * 0.98) / 400, 2.3);
  const fig = {
    s,
    x: (W - 400 * s) / 2,
    y: top + (availH - 440 * s) / 2 + 30 * s,
  };
  scene.layout(W, H, dpr, fig);
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 200));

// ---------- playing ----------
const pointers = new Map();
const HOLD_MS = 320;

async function ensureAudio() {
  if (!engine.ready) await engine.init();
  else if (engine.ctx.state !== 'running') await engine.ctx.resume();
}

let lastPoint = 0;
function playChakra(i, id) {
  lastPoint = i;
  const el = settings.element;
  engine.strike(i, el, { vel: 0.9 + Math.random() * 0.1 });
  scene.addRipple(i, 1);
  looper.captureTap(i, el);
  session.taps[i]++; session.tones++;
  const p = { i, el, hold: null, lastRipple: performance.now() };
  p.timer = setTimeout(() => {
    p.hold = engine.startHold(i, el);
    scene.state.holding.add(i);
    looper.captureHoldStart(id, i, el, HOLD_MS / 1000);
  }, HOLD_MS);
  pointers.set(id, p);
}

function releaseChakra(id) {
  const p = pointers.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  if (p.hold) {
    engine.stopHold(p.hold);
    looper.captureHoldEnd(id);
    const stillHeld = [...pointers.entries()].some(([k, q]) => k !== id && q.hold && q.i === p.i);
    if (!stillHeld) scene.state.holding.delete(p.i);
  }
  pointers.delete(id);
}

canvas.addEventListener('pointerdown', async (e) => {
  const i = scene.hitTest(e.clientX, e.clientY);
  if (i < 0) return;
  e.preventDefault();
  await ensureAudio();
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  playChakra(i, e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p || p.hold) return;
  const j = scene.hitTest(e.clientX, e.clientY);
  if (j >= 0 && j !== p.i) { // strum
    releaseChakra(e.pointerId);
    playChakra(j, e.pointerId);
  }
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) =>
  canvas.addEventListener(ev, (e) => releaseChakra(e.pointerId)));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', async (e) => {
  const n = parseInt(e.key, 10);
  if (!(n >= 1 && n <= 7) || e.repeat || e.metaKey || e.ctrlKey) return;
  if (!$('#intro').classList.contains('gone')) return;
  await ensureAudio();
  playChakra(n - 1, 'k' + n);
});
window.addEventListener('keyup', (e) => {
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 7) releaseChakra('k' + n);
});

// ---------- UI: elements & figure ----------
function refreshElements() {
  $$('.el').forEach((b) => {
    const on = b.dataset.el === settings.element;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
  });
}
$$('.el').forEach((b) => b.addEventListener('click', async () => {
  settings.element = b.dataset.el; save(); refreshElements();
  await ensureAudio();
  engine.strike(3, settings.element, { vel: 0.5 }); // preview on the heart tone
  scene.addRipple(3, 0.5);
}));

function setFigure(f) {
  settings.figure = f; save();
  scene.state.figure = f;
  $$('[data-figure]').forEach((b) => b.classList.toggle('on', b.dataset.figure === f));
}
$$('[data-figure]').forEach((b) => b.addEventListener('click', () => setFigure(b.dataset.figure)));

// ---------- sheets ----------
let openSheet = null;
function showSheet(name) {
  $$('.sheet').forEach((s) => { s.hidden = true; });
  $$('.tool').forEach((t) => t.classList.remove('on'));
  if (!name || name === openSheet) { openSheet = null; return; }
  openSheet = name;
  $(`#sheet-${name}`).hidden = false;
  $(`.tool[data-sheet="${name}"]`)?.classList.add('on');
  if (name === 'card') buildCard();
  if (name === 'loop') refreshLoopUI();
}
$$('.tool').forEach((t) => t.addEventListener('click', () => showSheet(t.dataset.sheet)));
$$('.sheet .close').forEach((c) => c.addEventListener('click', () => showSheet(null)));
$('#btn-settings').addEventListener('click', () => showSheet('settings'));
$('#btn-about').addEventListener('click', () => showSheet('about'));
$('#about-points').innerHTML = CHAKRAS.slice().reverse().map((c) =>
  `<div class="pt"><i class="sw" style="background:${c.hex};box-shadow:0 0 8px ${c.hex}"></i><span><b>${c.name}</b> \u00b7 ${c.quality}</span><em>${c.note}</em></div>`).join('');

// ---------- mood check ----------
function moodButtons(container, onPick, current) {
  container.innerHTML = '';
  MOODS.forEach((m, k) => {
    const b = document.createElement('button');
    b.innerHTML = `<i style="opacity:${0.25 + k * 0.19};transform:scale(${0.7 + k * 0.12})"></i>${m}`;
    if (current === k) b.classList.add('on');
    b.addEventListener('click', () => onPick(k));
    container.appendChild(b);
  });
}
function askMoodBefore() {
  return new Promise((resolve) => {
    const ov = $('#mood');
    ov.hidden = false; ov.classList.remove('gone');
    const done = (k) => {
      session.moodBefore = k;
      ov.classList.add('gone');
      setTimeout(() => { ov.hidden = true; }, 800);
      resolve();
    };
    moodButtons($('#mood-choices'), done);
    $('#mood-skip').onclick = () => done(null);
  });
}
function setMoodAfter(k) {
  session.moodAfter = k;
  moodButtons($('#end-moods'), setMoodAfter, k);
  moodButtons($('#card-moods'), setMoodAfter, k);
  if (openSheet === 'card') buildCard();
}

function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- breath guide ----------
const breath = { active: false, t0: 0 };
const breathChoices = $('#breath-choices');
BREATH_PATTERNS.forEach((p) => {
  const b = document.createElement('button');
  b.className = 'choice';
  b.dataset.id = p.id;
  b.innerHTML = `<b>${p.name}</b><i>${p.label}</i>`;
  b.addEventListener('click', () => {
    settings.breath = p.id; save(); refreshBreathUI();
    if (breath.active) breath.t0 = performance.now();
  });
  breathChoices.appendChild(b);
});
const humToggle = $('#breath-hum');
humToggle.checked = !!settings.hum;
humToggle.addEventListener('change', () => { settings.hum = humToggle.checked; save(); if (!settings.hum) stopHum(); });
function refreshBreathUI() {
  $$('.choice', breathChoices).forEach((b) => b.classList.toggle('on', b.dataset.id === settings.breath));
  const pat = BREATH_PATTERNS.find((p) => p.id === settings.breath);
  $('#breath-note').hidden = !pat || !pat.steps.some((s) => s[2] === null);
  $('#breath-toggle').textContent = breath.active ? 'Stop breathing' : 'Start breathing';
  $('#breath-cue').hidden = !breath.active || journey.active || gending.playing;
  $('.tool[data-sheet="breath"]').classList.toggle('active', breath.active);
}
$('#breath-toggle').addEventListener('click', async () => {
  await ensureAudio();
  breath.active = !breath.active;
  breath.t0 = performance.now();
  breath.step = -1;
  if (!breath.active) stopHum();
  scene.state.breathActive = breath.active;
  if (!breath.active) engine.breathe(0.4);
  refreshBreathUI();
  if (breath.active) showSheet(null);
});

function updateBreath(now, t) {
  if (!breath.active) {
    scene.state.breath = 0.5 + 0.22 * Math.sin(t * 0.45);
    return;
  }
  const pat = BREATH_PATTERNS.find((p) => p.id === settings.breath) || BREATH_PATTERNS[0];
  const total = pat.steps.reduce((a, s) => a + s[1], 0);
  let el = (Math.max(0, now - breath.t0) / 1000) % total;
  // level at the start of the cycle = level at its end
  let prevLevel = pat.steps.reduce((l, s) => (s[2] === null ? l : s[2]), 0);
  let level = 0, word = '', remain = 0, stepIdx = 0, exhaling = false;
  for (let k = 0; k < pat.steps.length; k++) {
    const [w, d, target] = pat.steps[k];
    if (el < d) {
      const p = el / d;
      const ease = 0.5 - 0.5 * Math.cos(Math.PI * p);
      level = target === null ? prevLevel : prevLevel + (target - prevLevel) * ease;
      exhaling = target !== null && target < prevLevel;
      word = w; remain = Math.ceil(d - el); stepIdx = k;
      break;
    }
    el -= d;
    if (target !== null) prevLevel = target;
  }
  scene.state.breath = level;
  if (!updateBreath._last || now - updateBreath._last > 120) {
    engine.breathe(level);
    updateBreath._last = now;
  }
  // hum along on the exhale
  if (stepIdx !== breath.step) {
    breath.step = stepIdx;
    stopHum();
    if (exhaling && settings.hum) startHum(pat.steps[stepIdx][1]);
  }
  if (exhaling && settings.hum) word = 'Hum \u00b7 mmm';
  const wEl = $('#bc-word');
  if (wEl.textContent !== word) wEl.textContent = word;
  if (gending.playing) $('#gc-breath').textContent = `${word} \u00b7 ${remain}`;
  $('#bc-count').textContent = remain;
}

let humHandle = null;
function startHum(seconds) {
  const i = lastPoint;
  const oct = settings.figure === 'female' ? 1 : 0;
  humHandle = engine.startHum(i, oct);
  scene.addRipple(i, 0.5);
  humHandle.timeout = setTimeout(stopHum, seconds * 1000 - 150);
}
function stopHum() {
  if (!humHandle) return;
  clearTimeout(humHandle.timeout);
  engine.stopHum(humHandle);
  humHandle = null;
}

// ---------- gending ----------
const gending = new GendingPlayer(engine, (i, hold) => {
  scene.addRipple(i, hold ? 0.9 : 0.7);
  const dots = $$('#gc-dots i');
  dots.forEach((d, k) => d.classList.toggle('lit', k === i));
  clearTimeout(gending._lit);
  gending._lit = setTimeout(() => dots[i]?.classList.remove('lit'), 900);
});
const dotsFor = (g, cls = 'on') => CHAKRAS.map((c, k) =>
  `<i class="${g.events.some((e) => e[1] === k) ? cls : ''}" style="background:${c.hex};color:${c.hex}"></i>`).join('');
$('#gending-list').innerHTML = GENDINGS.map((g) => {
  const cols = [...new Set(g.events.map((e) => e[1]))].map((k) => CHAKRAS[k].hex);
  const glow = `radial-gradient(circle at 85% 0%, ${cols[cols.length - 1]}, transparent 70%), radial-gradient(circle at 0% 100%, ${cols[0]}, transparent 70%)`;
  return `<button class="gd" data-id="${g.id}" style="--glow:${glow}"><b>${g.name}</b><small>${g.sub}</small><p>${g.desc}</p><span class="dots">${dotsFor(g)}</span></button>`;
}).join('');
function refreshGendingUI() {
  const g = GENDINGS.find((x) => x.id === settings.gending) || GENDINGS[0];
  $$('.gd').forEach((b) => b.classList.toggle('on', b.dataset.id === g.id));
  $$('#gending-mins .choice').forEach((b) => b.classList.toggle('on', +b.dataset.min === settings.gendingMin));
  $('#gending-breath').checked = settings.gendingBreath;
  $('#gending-play').textContent = `Play ${g.name}`;
  $('.tool[data-sheet="gending"]').classList.toggle('active', gending.playing);
}
$$('.gd').forEach((b) => b.addEventListener('click', async () => {
  settings.gending = b.dataset.id; save(); refreshGendingUI();
}));
$$('#gending-mins .choice').forEach((b) => b.addEventListener('click', () => { settings.gendingMin = +b.dataset.min; save(); refreshGendingUI(); }));
$('#gending-breath').addEventListener('change', (e) => { settings.gendingBreath = e.target.checked; save(); });
$('#gending-play').addEventListener('click', async () => {
  await ensureAudio();
  const g = GENDINGS.find((x) => x.id === settings.gending) || GENDINGS[0];
  if (journey.active) endJourney(false);
  showSheet(null);
  engine.bell();
  gending.play(g, settings.gendingMin);
  $('#gc-name').textContent = g.name;
  $('#gc-sub').textContent = g.sub;
  $('#gc-dots').innerHTML = dotsFor(g, 'used');
  $('#gc-breath').textContent = settings.gendingBreath ? '' : g.desc;
  $('#gending-card').hidden = false;
  if (settings.gendingBreath) {
    settings.breath = g.breath; save();
    breath.active = true; breath.t0 = performance.now(); breath.step = -1;
    scene.state.breathActive = true;
  }
  refreshBreathUI();
  refreshGendingUI();
});
function stopGending(completed) {
  if (!gending.playing) return;
  gending.stop();
  $('#gending-card').hidden = true;
  if (breath.active && settings.gendingBreath) { breath.active = false; stopHum(); engine.breathe(0.4); }
  refreshBreathUI();
  refreshGendingUI();
  engine.bell();
  if (completed) showEnd('Gending complete');
}
$('#gc-stop').addEventListener('click', () => stopGending(false));
function updateGending() {
  if (!gending.playing) return;
  const p = gending.progress();
  $('#gc-bar').style.width = `${p * 100}%`;
  const left = (1 - p) * settings.gendingMin * 60000;
  $('#gc-time').textContent = `${fmt(left)} LEFT`;
  if (p >= 1) stopGending(true);
}

// ---------- chakra journey ----------
const journey = { active: false, idx: 0, t0: 0, sec: 60, nextChime: 0 };
$$('#journey-choices .choice').forEach((b) => b.addEventListener('click', () => {
  settings.journeySec = +b.dataset.sec; save(); refreshJourneyChoices();
}));
function refreshJourneyChoices() {
  $$('#journey-choices .choice').forEach((b) => b.classList.toggle('on', +b.dataset.sec === settings.journeySec));
}
$('#journey-start').addEventListener('click', async () => {
  await ensureAudio();
  showSheet(null);
  journey.active = true;
  journey.sec = settings.journeySec;
  journey.idx = 0;
  journey.t0 = performance.now();
  journey.nextChime = journey.t0 + 2500;
  engine.bell();
  setJourneyStage(0);
  $('#journey-card').hidden = false;
  $('.tool[data-sheet="journey"]').classList.add('active');
  refreshBreathUI();
});
$('#jc-end').addEventListener('click', () => endJourney(false));

function setJourneyStage(i) {
  const c = CHAKRAS[i];
  scene.state.focus = i;
  $('#jc-step').textContent = `${i + 1} / 7`;
  $('#jc-name').textContent = c.name;
  $('#jc-sub').textContent = `${c.quality} · ${c.note}`;
  $('#jc-sub').style.color = c.hex;
  $('#jc-guide').textContent = c.guide;
  const card = $('#journey-card');
  card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
}

function updateJourney(now) {
  if (!journey.active) return;
  const el = Math.max(0, (now - journey.t0) / 1000);
  const idx = Math.floor(el / journey.sec);
  if (idx >= 7) { endJourney(true); return; }
  if (idx !== journey.idx) {
    journey.idx = idx;
    setJourneyStage(idx);
    journey.nextChime = now + 800;
  }
  if (now >= journey.nextChime) {
    engine.strike(idx, settings.element, { vel: 0.5 });
    scene.addRipple(idx, 0.55);
    journey.nextChime = now + 9000;
  }
  $('#jc-bar').style.width = `${(el / (journey.sec * 7)) * 100}%`;
}

function endJourney(completed) {
  journey.active = false;
  scene.state.focus = -1;
  $('#journey-card').hidden = true;
  $('.tool[data-sheet="journey"]').classList.remove('active');
  refreshBreathUI();
  engine.bell();
  if (completed) showEnd('Journey complete');
}

// ---------- session timer ----------
const timer = { endAt: 0, ending: false };
$$('#timer-choices .choice').forEach((b) => b.addEventListener('click', async () => {
  const min = +b.dataset.min;
  await ensureAudio();
  if (!min) { timer.endAt = 0; toast('Timer off'); }
  else {
    timer.endAt = performance.now() + min * 60000;
    engine.bell();
    toast(`${min}-minute session started`);
    showSheet(null);
  }
  refreshTimerUI();
}));
function refreshTimerUI() {
  $$('#timer-choices .choice').forEach((b) => b.classList.toggle('on', timer.endAt ? false : +b.dataset.min === 0));
  $('.tool[data-sheet="timer"]').classList.toggle('active', !!timer.endAt);
}
function updateTimer(now) {
  if (!timer.endAt || timer.ending) return;
  if (now >= timer.endAt) {
    timer.ending = true;
    engine.bell();
    engine.fadeMaster(0, 10);
    setTimeout(() => {
      looper.stop();
      if (breath.active) $('#breath-toggle').click();
      timer.endAt = 0; timer.ending = false;
      refreshTimerUI();
      showEnd('Session complete');
    }, 10500);
  }
}
const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------- looper UI ----------
function refreshLoopUI() {
  const rec = $('#loop-rec');
  rec.classList.toggle('on', looper.recording);
  rec.disabled = !looper.recording && !looper.canRecord;
  rec.setAttribute('aria-label', looper.recording ? 'Stop recording' : 'Record layer');
  let title;
  if (looper.recording && !looper.hasLoop) title = 'Recording… play the chakras, tap ■ to close the loop';
  else if (looper.recording) title = `Overdubbing layer ${looper.layers.length + 1} for one cycle…`;
  else if (looper.hasLoop) title = `${looper.layers.length} layer${looper.layers.length > 1 ? 's' : ''} · ${looper.loopLen.toFixed(1)} s loop${looper.playing ? '' : ' · paused'}`;
  else title = 'Tap record, then play the chakras';
  $('#loop-title').textContent = title;
  const layers = $('#loop-layers');
  layers.innerHTML = '';
  for (let k = 0; k < looper.maxLayers; k++) {
    const s = document.createElement('span');
    if (k < looper.layers.length) s.className = 'on';
    layers.appendChild(s);
  }
  $('#loop-play').disabled = !looper.hasLoop;
  $('#loop-play').textContent = looper.playing ? 'Stop' : 'Play';
  $('#loop-undo').disabled = !looper.hasLoop && !looper.recording;
  $('#loop-clear').disabled = !looper.hasLoop;
  $('#loop-save').disabled = !looper.hasLoop || saving;
  $('.tool[data-sheet="loop"]').classList.toggle('active', looper.playing || looper.recording);
}
$('#loop-rec').addEventListener('click', async () => {
  await ensureAudio();
  if (looper.recording) looper.stopRecord(); else looper.startRecord();
});
$('#loop-play').addEventListener('click', () => (looper.playing ? looper.stop() : looper.play()));
$('#loop-undo').addEventListener('click', () => looper.undo());
$('#loop-clear').addEventListener('click', () => { looper.clear(); lastAudio = null; });

let saving = false;
const extFor = (type) => (type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm');
$('#loop-save').addEventListener('click', async () => {
  if (!looper.hasLoop || saving) return;
  saving = true; refreshLoopUI();
  const btn = $('#loop-save');
  const cycles = looper.loopLen < 10 ? 3 : looper.loopLen < 25 ? 2 : 1;
  const seconds = looper.loopLen * cycles + 3.5;
  try {
    looper.restart();
    const blob = await engine.record(seconds, (p) => { btn.textContent = `Saving ${Math.round(p * 100)}%`; });
    lastAudio = blob;
    download(blob, `swarnajiwa-loop.${extFor(blob.type)}`);
    toast('Loop audio saved');
  } catch (err) {
    toast(err.message || 'Could not record audio');
  } finally {
    saving = false;
    btn.textContent = 'Save audio';
    refreshLoopUI();
  }
});

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------- aura card ----------
let cardBlob = null;
function dominantChakra() {
  const max = Math.max(...session.taps);
  if (max === 0) return 3;
  return session.taps.indexOf(max);
}
async function buildCard() {
  $('#card-mood').hidden = session.moodBefore === null || session.moodAfter !== null;
  if (!$('#card-mood').hidden) moodButtons($('#card-moods'), setMoodAfter, session.moodAfter);
  try { await document.fonts?.ready; } catch (e) { /* ignore */ }
  const W = 1080, H = 1920;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const fig = { s: 2.2, x: (W - 880) / 2, y: 420 };
  const saved = scene.state.energy.slice();
  const savedRipples = scene.ripples;
  scene.ripples = [];
  const max = Math.max(1, ...session.taps);
  scene.state.energy = session.taps.map((n) => 0.22 + 0.78 * (n / max));
  scene.render(g, performance.now() / 1000, { w: W, h: H, dpr: 1, fig, noLabels: true, instant: true });
  scene.state.energy = saved;
  scene.ripples = savedRipples;

  // top brand
  g.textAlign = 'center';
  g.fillStyle = 'rgba(241,217,166,0.75)';
  g.font = '600 26px Manrope, system-ui, sans-serif';
  g.letterSpacing = '10px';
  g.fillText('JABODANCE', W / 2, 150);
  g.letterSpacing = '0px';
  g.fillStyle = '#fff8ec';
  g.font = '400 92px "Cormorant Garamond", Georgia, serif';
  g.fillText('Swarnajiwa', W / 2, 240);

  // bottom panel
  const grad = g.createLinearGradient(0, 1380, 0, H);
  grad.addColorStop(0, 'rgba(6,6,26,0)');
  grad.addColorStop(0.35, 'rgba(6,6,26,0.85)');
  grad.addColorStop(1, 'rgba(6,6,26,0.97)');
  g.fillStyle = grad;
  g.fillRect(0, 1380, W, H - 1380);

  const d = CHAKRAS[dominantChakra()];
  g.fillStyle = 'rgba(225,228,255,0.6)';
  g.font = '500 24px Manrope, system-ui, sans-serif';
  g.letterSpacing = '8px';
  g.fillText('YOUR AURA TODAY', W / 2, 1540);
  g.letterSpacing = '0px';
  g.fillStyle = '#fff8ec';
  g.font = '400 104px "Cormorant Garamond", Georgia, serif';
  g.fillText(d.name, W / 2, 1640);
  g.fillStyle = d.hex;
  g.font = '600 24px Manrope, system-ui, sans-serif';
  g.letterSpacing = '6px';
  g.fillText(`${d.quality.toUpperCase()}  ·  ${d.note.toUpperCase()}`, W / 2, 1690);
  g.letterSpacing = '0px';

  // spectrum
  const bw = 64, gap = 22, total = 7 * bw + 6 * gap, x0 = (W - total) / 2, by = 1846;
  CHAKRAS.forEach((ch, i) => {
    const h = 14 + 64 * (session.taps[i] / max);
    g.fillStyle = ch.hex;
    g.globalAlpha = 0.9;
    roundRect(g, x0 + i * (bw + gap), by - h, bw, h, 8);
    g.fill();
  });
  g.globalAlpha = 1;
  const mins = Math.max(1, Math.round((performance.now() - session.start) / 60000));
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  g.fillStyle = 'rgba(225,228,255,0.55)';
  g.font = '500 22px Manrope, system-ui, sans-serif';
  g.fillText(`${mins} min  ·  ${session.tones} tones  ·  ${date}`, W / 2, 1896);
  if (session.moodBefore !== null && session.moodAfter !== null) {
    g.fillStyle = 'rgba(241,217,166,0.85)';
    g.font = '500 24px Manrope, system-ui, sans-serif';
    g.fillText(`${MOODS[session.moodBefore]}  \u2192  ${MOODS[session.moodAfter]}`, W / 2, 1738);
  }

  cardBlob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const img = $('#card-img');
  if (img.src) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(cardBlob);
  $('#card-note').textContent = lastAudio
    ? 'Sharing includes your saved loop audio.'
    : 'Tip: save a loop in the Looper to share its sound along with the card.';
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
$('#card-save').addEventListener('click', () => cardBlob && download(cardBlob, 'swarnajiwa-aura.png'));
$('#card-share').addEventListener('click', async () => {
  if (!cardBlob) return;
  const files = [new File([cardBlob], 'swarnajiwa-aura.png', { type: 'image/png' })];
  if (lastAudio) files.push(new File([lastAudio], `swarnajiwa-loop.${extFor(lastAudio.type)}`, { type: lastAudio.type }));
  const data = { files, title: 'Swarnajiwa', text: 'My golden soul today \u00b7 Swarnajiwa by Jabodance' };
  try {
    if (navigator.canShare?.(data)) await navigator.share(data);
    else if (navigator.canShare?.({ files: [files[0]] })) await navigator.share({ ...data, files: [files[0]] });
    else { download(cardBlob, 'swarnajiwa-aura.png'); toast('Sharing not supported here — image saved'); }
  } catch (e) { /* user cancelled */ }
});

// ---------- end overlay ----------
function showEnd(title) {
  const d = CHAKRAS[dominantChakra()];
  const mins = Math.max(1, Math.round((performance.now() - session.start) / 60000));
  $('#end').querySelector('.kicker').textContent = title;
  $('#end-title').textContent = 'Be still a moment.';
  $('#end-sub').textContent = session.tones
    ? `${mins} min · ${d.name} shone brightest`
    : `${mins} min of stillness`;
  moodButtons($('#end-moods'), setMoodAfter, session.moodAfter);
  $('#end').hidden = false;
  $('#end').classList.remove('gone');
}
$('#end-continue').addEventListener('click', () => {
  $('#end').hidden = true;
  engine.fadeMaster(0.9, 2.5);
});
$('#end-card').addEventListener('click', () => {
  $('#end').hidden = true;
  engine.fadeMaster(0.9, 2.5);
  showSheet('card');
});

// ---------- settings ----------
const sDrone = $('#set-drone'), sLevel = $('#set-drone-level'), sRev = $('#set-reverb'),
  sLabels = $('#set-labels'), sMotion = $('#set-motion');
sDrone.checked = settings.drone; sLevel.value = settings.droneLevel; sRev.value = settings.reverb;
sLabels.checked = settings.labels; sMotion.checked = settings.reduceMotion;
sDrone.addEventListener('change', () => { settings.drone = sDrone.checked; engine.setDrone(settings.drone); save(); });
sLevel.addEventListener('input', () => { settings.droneLevel = +sLevel.value; engine.setDrone(undefined, settings.droneLevel); save(); });
sRev.addEventListener('input', () => { settings.reverb = +sRev.value; engine.setReverb(settings.reverb); save(); });
sLabels.addEventListener('change', () => { settings.labels = sLabels.checked; scene.state.showLabels = settings.labels; save(); });
sMotion.addEventListener('change', () => { settings.reduceMotion = sMotion.checked; scene.state.reduceMotion = settings.reduceMotion; save(); });

// ---------- status pills ----------
function updateStatus(now) {
  const parts = [];
  if (looper.recording) parts.push('<span class="pill rec"><span class="dot"></span>REC</span>');
  else if (looper.playing) parts.push(`<span class="pill"><span class="dot"></span>Loop · ${looper.layers.length}</span>`);
  if (timer.endAt) parts.push(`<span class="pill">${fmt(timer.endAt - now)}</span>`);
  const html = journey.active || gending.playing ? '' : parts.join('');
  const st = $('#status');
  if (st._html !== html) { st.innerHTML = html; st._html = html; }
  // breath cue sits below the pills
  $('#breath-cue').style.top = `calc(${html ? 98 : 74}px + var(--safe-top))`;
  if (openSheet === 'loop') $('#loop-bar').style.width = `${looper.progress() * 100}%`;
}

// ---------- intro ----------
$('#begin').addEventListener('click', async () => {
  await ensureAudio();
  $('#intro').classList.add('gone');
  setTimeout(() => { $('#intro').hidden = true; }, 1000);
  await askMoodBefore();
  session.start = performance.now();
  engine.bell();
  setTimeout(() => toast('Tap a point to chime \u00b7 hold to hum'), 1200);
});

// ---------- main loop ----------
let lastT = performance.now();
let statusT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const t = now / 1000;
  updateBreath(now, t);
  updateJourney(now);
  updateTimer(now);
  updateGending();
  // emanating ripples while holding
  for (const p of pointers.values()) {
    if (p.hold && now - p.lastRipple > 750) { scene.addRipple(p.i, 0.55); p.lastRipple = now; }
  }
  if (now - statusT > 200) { updateStatus(now); statusT = now; }
  scene.update(dt);
  scene.render(ctx, t);
  requestAnimationFrame(frame);
}

// ---------- boot ----------
setFigure(settings.figure);
refreshElements();
refreshBreathUI();
refreshJourneyChoices();
refreshTimerUI();
refreshLoopUI();
refreshGendingUI();
layout();
requestAnimationFrame(frame);
document.fonts?.ready.then(layout);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
