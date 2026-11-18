// 8비트 효과음 + 칩튠 배경음악 (웹 오디오로 직접 합성)
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
  mGain.gain.setTargetAtTime(m * 0.85, ac.currentTime, 0.05);
  if (bgm && !bgmSrc) bgm.volume = m;
  sGain.gain.setTargetAtTime(s * 0.5, ac.currentTime, 0.05);
}
export function suspendAudio(on) {
  if (!ac) return;
  if (on) { ac.suspend(); if (bgm) bgm.pause(); }
  else { ac.resume(); if (bgm && curName) bgm.play().catch(() => {}); }
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

// ---------------- 배경음악 (MP3 한 곡 반복) ----------------
let bgm = null, bgmSrc = null, curName = '';
function ensureBgm() {
  if (bgm) return bgm;
  bgm = new Audio('audio/bgm.mp3');
  bgm.loop = true;
  bgm.preload = 'auto';
  // 볼륨을 효과음과 같은 방식으로 조절하기 위해 웹 오디오에 연결 (iOS는 volume 속성을 무시)
  if (ac) { try { bgmSrc = ac.createMediaElementSource(bgm); bgmSrc.connect(mGain); } catch (e) { bgmSrc = null; } }
  return bgm;
}
export function playMusic(name) {
  curName = name;
  const a = ensureBgm();
  if (!bgmSrc) a.volume = vol.music;
  if (a.paused) a.play().catch(() => {});
}
export function stopMusic() { if (bgm) bgm.pause(); curName = ''; }
export function musicName() { return curName; }
