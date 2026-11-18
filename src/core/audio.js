// 8비트 효과음 + 칩튠 배경음악 (웹 오디오로 직접 합성)
import { rng } from './util.js';

let ac = null, master, mGain, sGain, noiseBuf, pulse25, pulse12;
let vol = { music: 0.6, sfx: 0.8 };

export function initAudio() {
  if (ac) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
  mGain = ac.createGain(); mGain.connect(master);
  sGain = ac.createGain(); sGain.connect(master);
  setVolumes(vol.music, vol.sfx);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const mkPulse = (duty) => {
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return ac.createPeriodicWave(re, im);
  };
  pulse25 = mkPulse(0.25); pulse12 = mkPulse(0.125);
}
export function unlockAudio() {
  initAudio();
  if (ac && ac.state === 'suspended') ac.resume();
}
export function setVolumes(m, s) {
  vol = { music: m, sfx: s };
  if (!ac) return;
  mGain.gain.setTargetAtTime(m * 0.32, ac.currentTime, 0.05);
  sGain.gain.setTargetAtTime(s * 0.5, ac.currentTime, 0.05);
}
export function suspendAudio(on) {
  if (!ac) return;
  if (on) ac.suspend(); else ac.resume();
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function osc(type, f0, f1, dur, v, delay = 0, out = sGain) {
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  if (type === 'p25') o.setPeriodicWave(pulse25);
  else if (type === 'p12') o.setPeriodicWave(pulse12);
  else o.type = type;
  const g = ac.createGain();
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, v, freq = 3000, delay = 0, type = 'lowpass', f1, out = sGain) {
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

const SFX = {
  jump: () => osc('p25', 300, 620, 0.12, 0.3),
  land: () => noise(0.06, 0.25, 900),
  wjump: () => { osc('p25', 380, 760, 0.1, 0.28); noise(0.05, 0.15, 2000); },
  dash: () => { noise(0.16, 0.35, 4000, 0, 'bandpass', 800); osc('p12', 700, 300, 0.12, 0.15); },
  slide: () => noise(0.25, 0.2, 1500, 0, 'bandpass', 500),
  bounce: () => { osc('triangle', 200, 800, 0.18, 0.4); osc('p25', 400, 1200, 0.15, 0.12); },
  death: () => { osc('p25', 600, 80, 0.4, 0.3); noise(0.3, 0.3, 2000, 0, 'lowpass', 200); },
  goal: () => { [72, 76, 79, 84].forEach((n, i) => osc('p25', mtof(n), mtof(n), 0.16, 0.25, i * 0.07)); },
  arrow: () => noise(0.08, 0.18, 6000, 0, 'highpass'),
  flame: () => noise(0.35, 0.18, 800, 0, 'bandpass', 300),
  laser: () => { osc('sawtooth', 1400, 300, 0.25, 0.12); },
  charge: () => osc('sine', 300, 1200, 0.45, 0.08),
  explode: () => { noise(0.6, 0.6, 1800, 0, 'lowpass', 80); osc('sine', 120, 30, 0.5, 0.5); },
  crumble: () => noise(0.25, 0.3, 700, 0, 'lowpass', 150),
  tele: () => { osc('sine', 400, 1600, 0.15, 0.25); osc('sine', 1600, 400, 0.15, 0.18, 0.12); },
  click: () => osc('p25', 900, 900, 0.04, 0.2),
  hover: () => osc('p12', 1300, 1300, 0.025, 0.08),
  open: () => { [60, 64, 67, 72, 76].forEach((n, i) => osc('p25', mtof(n), mtof(n), 0.1, 0.18, i * 0.05)); noise(0.2, 0.15, 3000, 0.25); },
  pick: () => { osc('p25', 660, 990, 0.08, 0.25); osc('p25', 990, 1320, 0.08, 0.2, 0.06); },
  place: () => { noise(0.08, 0.3, 1200); osc('square', 200, 120, 0.08, 0.2); },
  rotate: () => osc('p12', 500, 700, 0.05, 0.15),
  deny: () => { osc('square', 180, 160, 0.1, 0.2); osc('square', 140, 120, 0.12, 0.2, 0.09); },
  count: () => osc('p25', 520, 520, 0.12, 0.3),
  go: () => { osc('p25', 1040, 1040, 0.3, 0.3); osc('p25', 784, 784, 0.3, 0.2); },
  score: () => osc('p25', 880, 1100, 0.06, 0.15),
  coin: () => { osc('p25', 988, 988, 0.06, 0.2); osc('p25', 1319, 1319, 0.2, 0.2, 0.06); },
  win: () => { [67, 72, 76, 79, 76, 79, 84].forEach((n, i) => osc('p25', mtof(n), mtof(n), i === 6 ? 0.6 : 0.14, 0.25, i * 0.12)); [48, 52, 55, 60].forEach((n, i) => osc('triangle', mtof(n), mtof(n), 0.25, 0.3, i * 0.24)); },
  lose: () => { [67, 65, 62, 60].forEach((n, i) => osc('p25', mtof(n), mtof(n), 0.25, 0.2, i * 0.18)); },
  easy: () => { [72, 67, 64].forEach((n, i) => osc('p25', mtof(n), mtof(n), 0.15, 0.2, i * 0.12)); },
  emote: () => osc('sine', 880, 1320, 0.1, 0.18),
  wind: () => noise(1.6, 0.18, 600, 0, 'bandpass', 1400),
  buy: () => { [76, 79, 84, 88].forEach((n, i) => osc('p25', mtof(n), mtof(n), 0.1, 0.2, i * 0.06)); },
};
let lastPlay = {};
export function sfx(name) {
  if (!ac || ac.state !== 'running' || vol.sfx <= 0) return;
  const now = ac.currentTime;
  if (lastPlay[name] && now - lastPlay[name] < 0.03) return;
  lastPlay[name] = now;
  const f = SFX[name];
  if (f) f();
}

// ---------------- 배경음악 ----------------
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const SONGS = {
  menu:  { root: 60, scale: 'major', bpm: 118, prog: [0, 5, 3, 4, 0, 5, 3, 4], seed: 11, drums: 'pop', arp: true },
  grass: { root: 67, scale: 'major', bpm: 134, prog: [0, 3, 0, 4, 5, 3, 0, 4], seed: 23, drums: 'pop', arp: false },
  ice:   { root: 64, scale: 'minor', bpm: 100, prog: [0, 5, 2, 6, 0, 5, 2, 6], seed: 37, drums: 'soft', arp: true },
  lava:  { root: 62, scale: 'minor', bpm: 150, prog: [0, 0, 5, 6, 0, 0, 5, 4], seed: 41, drums: 'march', arp: false },
  sky:   { root: 65, scale: 'major', bpm: 94, prog: [0, 2, 3, 3, 0, 2, 3, 4], seed: 53, drums: 'soft', arp: true },
  lobby: { root: 62, scale: 'major', bpm: 108, prog: [0, 3, 5, 4, 0, 3, 1, 4], seed: 61, drums: 'soft', arp: true },
};

function buildSong(def) {
  const r = rng(def.seed);
  const sc = SCALES[def.scale];
  const deg = (d, oct = 0) => def.root + sc[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct);
  const chordTones = (c) => [c, c + 2, c + 4];
  const bars = def.prog.length;
  const steps = bars * 16;
  const lead = new Array(steps).fill(null), bass = new Array(steps).fill(null), arp = new Array(steps).fill(null), drum = new Array(steps).fill(null);
  // 리듬 모티프
  const motif = (() => {
    const m = [];
    for (let i = 0; i < 16; i++) m.push(i % 4 === 0 ? 1 : r() < (i % 2 ? 0.25 : 0.55) ? 1 : 0);
    return m;
  })();
  const motifB = motif.map((v, i) => (i % 8 === 0 ? 1 : r() < 0.4 ? 1 - v : v));
  let prev = 7;
  for (let b = 0; b < bars; b++) {
    const ch = def.prog[b];
    const tones = chordTones(ch);
    const rhythm = (b >> 1) % 2 === 1 && b < bars - 2 ? motifB : motif;
    for (let s = 0; s < 16; s++) {
      const i = b * 16 + s;
      if (rhythm[s]) {
        let d;
        if (s % 4 === 0) {
          // 강박: 화음 구성음 중 가까운 것
          let best = tones[0] + 7, bd = 99;
          for (const t0 of tones) for (const o of [0, 7, 14]) { const c = t0 + o; if (Math.abs(c - prev) < bd && c >= 4 && c <= 14) { bd = Math.abs(c - prev); best = c; } }
          d = best;
        } else d = prev + (r() < 0.5 ? 1 : -1) * (r() < 0.8 ? 1 : 2);
        d = Math.max(3, Math.min(15, d));
        if (b === bars - 1 && s === 12) d = 7;
        prev = d;
        let len = 1;
        while (len < 4 && s + len < 16 && !rhythm[s + len]) len++;
        lead[i] = { n: deg(d, -1) + 12, len };
      }
      // 베이스
      const bp = def.drums === 'march' ? [0, 4, 8, 10, 12] : [0, 6, 8, 12, 14];
      if (bp.includes(s)) bass[i] = { n: deg(ch, -2) + (s === 14 || s === 10 ? 7 : 0) - (sc[(ch + 4) % 7] - sc[ch % 7] === 7 ? 0 : 0), len: 2 };
      if (def.arp && s % 2 === 0) { const t0 = tones[(s / 2) % 3]; arp[i] = { n: deg(t0, 0) + 12, len: 1 }; }
      // 드럼
      if (def.drums === 'pop') drum[i] = s % 8 === 0 ? 'k' : s % 8 === 4 ? 's' : s % 2 === 0 ? 'h' : null;
      else if (def.drums === 'march') drum[i] = s % 4 === 0 ? 'k' : s % 4 === 2 ? 's' : s % 2 ? 'h' : null;
      else drum[i] = s % 8 === 0 ? 'k' : s % 4 === 2 ? 'h' : null;
    }
  }
  return { lead, bass, arp, drum, steps, stepDur: 60 / def.bpm / 4 };
}

let cur = null, curName = '', timer = null, built = {};
function note(type, n, t, dur, v) {
  const o = ac.createOscillator();
  if (type === 'p25') o.setPeriodicWave(pulse25);
  else if (type === 'p12') o.setPeriodicWave(pulse12);
  else o.type = type;
  const g = ac.createGain();
  o.frequency.setValueAtTime(mtof(n), t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.008);
  g.gain.setValueAtTime(v * 0.8, t + dur * 0.6);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(mGain);
  o.start(t); o.stop(t + dur + 0.02);
}
function drumHit(k, t) {
  if (k === 'k') {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(mGain); o.start(t); o.stop(t + 0.17);
  } else {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = k === 's' ? 'bandpass' : 'highpass'; f.frequency.value = k === 's' ? 1800 : 7000;
    const g = ac.createGain(); const d = k === 's' ? 0.12 : 0.04;
    g.gain.setValueAtTime(k === 's' ? 0.35 : 0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    s.connect(f); f.connect(g); g.connect(mGain); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.02);
  }
}

export function playMusic(name) {
  if (!ac || curName === name) return;
  stopMusic();
  const def = SONGS[name];
  if (!def) return;
  curName = name;
  built[name] = built[name] || buildSong(def);
  cur = { song: built[name], step: 0, next: ac.currentTime + 0.1 };
  timer = setInterval(tickMusic, 25);
}
export function stopMusic() {
  if (timer) clearInterval(timer);
  timer = null; cur = null; curName = '';
}
function tickMusic() {
  if (!cur || !ac || ac.state !== 'running') { if (cur && ac) cur.next = ac.currentTime + 0.05; return; }
  const s = cur.song;
  while (cur.next < ac.currentTime + 0.12) {
    const i = cur.step % s.steps, t = cur.next;
    const L = s.lead[i]; if (L) note('p25', L.n, t, L.len * s.stepDur * 0.95, 0.16);
    const B = s.bass[i]; if (B) note('triangle', B.n, t, B.len * s.stepDur * 0.9, 0.34);
    const A = s.arp[i]; if (A) note('p12', A.n, t, s.stepDur * 0.8, 0.05);
    const D = s.drum[i]; if (D) drumHit(D, t);
    cur.step++; cur.next += s.stepDur;
  }
}
export function musicName() { return curName; }
