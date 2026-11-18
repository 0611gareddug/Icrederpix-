// 트랩빌더즈 — 시작점
/* global __DEV__ */
import './style.css';
import { DT, now, isTouch } from './core/util.js';
import { initInput, clearEdges } from './core/input.js';
import { initAudio, unlockAudio, playMusic, setVolumes, suspendAudio } from './core/audio.js';
import { save, persist } from './core/save.js';
import { buildSprites } from './art/sprites.js';
import { Renderer } from './render/renderer.js';
import { Game } from './game/game.js';
import { Match, MAX_PLAYERS } from './net/match.js';
import { HostNet, ClientNet, normCode } from './net/net.js';
import { MAP_KEYS } from './data/maps.js';
import { COLORS, HATS, FACES, BACKS, sanitizeLook } from './data/cosmetics.js';
import { initTouch, showTouch } from './ui/touch.js';
import { h, btn, modal, toast } from './ui/dom.js';
import * as S from './ui/screens.js';
import { protect } from './protect/protect.js';

const BOT_NAMES = ['삐약봇', '깡총봇', '뚝딱봇', '번개봇', '쿵쾅봇', '말랑봇', '반짝봇', '휘익봇', '꿀꺽봇', '몽글봇'];

class App {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ui = document.getElementById('ui');
    this.renderer = new Renderer(this.canvas);
    this.game = null;
    this.demo = null;
    this.net = null; this.client = null; this.match = null;
    this.lobby = null;
    this.acc = 0; this.last = now();
    this.soloSettings = { map: 'grass', length: 'normal', bots: 3, diff: 'normal' };
    this.hostSettings = { map: 'random', length: 'normal', diff: 'normal', replace: true };
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.renderer.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      const hidden = document.hidden;
      suspendAudio(hidden);
      if (hidden && this.game && this.game.mode === 'solo' && !this.game.paused) this.openGameMenu(this.game);
      this.last = now();
    });
    const unlock = () => { unlockAudio(); setVolumes(save.settings.music, save.settings.sfx); if (!this.musicStarted) { this.musicStarted = true; playMusic(this.wantMusic || 'menu'); } };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // 방장 탭이 백그라운드여도 진행되도록 보조 타이머
    setInterval(() => { if (document.hidden && this.game && this.game.mode === 'host') this.tickFixed(0.25); }, 250);
  }

  music(name) { this.wantMusic = name; if (this.musicStarted) playMusic(name); }

  // ---------------- 루프 ----------------
  start() {
    const loop = () => {
      const t = now();
      let dt = (t - this.last) / 1000;
      this.last = t;
      if (dt > 0.25) dt = 0.25;
      this.tickFixed(dt);
      const g = this.game || this.demo;
      if (g) g.render(this.acc / DT);
      else this.renderer.draw({});
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  tickFixed(dt) {
    this.acc += dt;
    const g = this.game || this.demo;
    let n = 0;
    while (this.acc >= DT && n < 10) {
      if (g) g.update(DT);
      this.acc -= DT; n++;
    }
    if (n >= 10) this.acc = 0;
  }

  setScreen(el) {
    S.cleanup();
    this.ui.innerHTML = '';
    if (el) this.ui.appendChild(el);
  }

  // ---------------- 데모 (배경) ----------------
  startDemo() {
    if (this.demo) this.demo.destroy();
    const tx = { broadcast: (m) => this.demo && this.demo.onMsg(m), sendTo: () => {} };
    const match = new Match({ map: 'random', length: 'long' }, tx);
    for (let i = 0; i < 4; i++) {
      match.addPlayer({ name: BOT_NAMES[i], kind: 'bot', diff: ['hard', 'normal', 'normal', 'easy'][i], look: randomLook() });
    }
    this.demo = new Game(this, { mode: 'demo', match, localPid: -1 });
    match.start();
  }
  restartDemo() { if (this.demo && !this.game) this.startDemo(); }
  stopDemo() { if (this.demo) { this.demo.destroy(); this.demo = null; } }

  // ---------------- 혼자 하기 ----------------
  startSolo(st) {
    this.soloSettings = st;
    closeModals();
    this.stopDemo();
    this.setScreen(null);
    const tx = { broadcast: (m) => this.game && this.game.onMsg(m), sendTo: (pid, m) => this.game && this.game.onMsg(m) };
    const match = new Match({ map: st.map, length: st.length }, tx);
    const me = match.addPlayer({ name: save.name, kind: 'local', look: sanitizeLook(save.look) });
    const names = shuffle(BOT_NAMES.slice());
    for (let i = 0; i < st.bots; i++) match.addPlayer({ name: names[i], kind: 'bot', diff: st.diff, look: randomLook() });
    this.game = new Game(this, { mode: 'solo', match, localPid: me.id });
    match.start();
  }

  // ---------------- 온라인: 방장 ----------------
  async createRoom() {
    this.stopNet();
    S.showConnecting(this, '방을 만드는 중...', () => { this.stopNet(); S.showMenu(this); });
    const net = new HostNet({
      onHello: (conn, m) => this.onHello(conn, m),
      onJoined: () => { sfxSafe('pick'); },
      onMsg: (pid, m) => this.onHostMsg(pid, m),
      onLeave: (pid) => { if (this.match) this.match.removePlayer(pid); },
      onPong: (pid, rtt) => { const p = this.match && this.match.get(pid); if (p) p.ping = Math.round(rtt); },
      onError: (e) => toast(e),
    });
    this.net = net;
    try {
      const code = await net.start();
      if (this.net !== net) return;
      this.roomCode = code;
      const tx = {
        broadcast: (m, except) => { if (except !== this.localPid) this.deliverLocal(m); net.broadcast(m, except); },
        sendTo: (pid, m) => { if (pid === this.localPid) this.deliverLocal(m); else net.send(pid, m); },
      };
      this.match = new Match(Object.assign({}, this.hostSettings), tx);
      const me = this.match.addPlayer({ name: save.name, kind: 'local', look: sanitizeLook(save.look) });
      this.localPid = me.id;
      this.isHostRole = true;
      this.pingTimer = setInterval(() => { net.ping(); if (this.match && this.match.phase === 'lobby') this.match.syncLobby(); }, 2000);
    } catch (e) {
      if (this.net === net) { this.stopNet(); S.showError(this, e.message || String(e)); }
    }
  }
  onHello(conn, m) {
    const M = this.match;
    if (!M) return { reject: '방이 준비되지 않았어요.' };
    if (M.phase !== 'lobby') return { reject: '이미 게임이 진행 중이에요.' };
    if (M.players.length >= MAX_PLAYERS) return { reject: '방이 가득 찼어요. (최대 6명)' };
    let name = String(m.name || '플레이어').slice(0, 10);
    if (M.players.some((p) => p.name === name)) name = name.slice(0, 8) + (M.players.length + 1);
    const p = M.addPlayer({ name, kind: 'remote', look: sanitizeLook(m.look) });
    return { pid: p.id };
  }
  onHostMsg(pid, m) {
    if (m.t === 'ps') { if (this.game) this.game.onPs(pid, m.s); return; }
    if (this.match) this.match.handle(pid, m);
  }
  deliverLocal(m) {
    if (m.t === 'lobby') { this.showLobby(m); return; }
    if (m.t === 'start' && !this.game) this.beginNetGame();
    if (this.game) this.game.onMsg(m);
  }
  hostBroadcast(m) { if (this.net) this.net.broadcast(m); }
  hostStart() {
    const M = this.match;
    if (!M) return;
    if (M.players.length < 2) { toast('봇이나 친구를 1명 이상 추가해 주세요.'); return; }
    if (M.players.some((p) => p.kind === 'remote' && !p.ready)) { toast('아직 준비하지 않은 친구가 있어요.'); return; }
    this.beginNetGame();
    M.start();
  }
  beginNetGame() {
    closeModals();
    this.stopDemo();
    this.lobby = null;
    this.setScreen(null);
    if (this.game) this.game.destroy();
    if (this.isHostRole) this.game = new Game(this, { mode: 'host', match: this.match, localPid: this.localPid });
    else this.game = new Game(this, { mode: 'client', localPid: this.localPid, send: (m) => this.client && this.client.send(m) });
  }
  addBot() {
    const M = this.match;
    if (!M || M.players.length >= MAX_PLAYERS) { toast('방이 가득 찼어요. (최대 6명)'); return; }
    const used = new Set(M.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || '봇' + M.players.length;
    M.addPlayer({ name, kind: 'bot', diff: this.hostSettings.diff, look: randomLook() });
  }
  removeLobbyPlayer(pid) {
    const M = this.match;
    const p = M && M.get(pid);
    if (!p || p.kind === 'local') return;
    if (p.kind === 'remote') this.net.kick(pid);
    M.removePlayer(pid);
  }
  backToLobby() {
    if (!this.match) return;
    if (this.game) { this.game.destroy(); this.game = null; }
    this.match.phase = 'lobby';
    for (const p of this.match.players) if (p.kind === 'remote') p.ready = false;
    this.match.players = this.match.players.filter((p) => p.connected);
    this.match.syncLobby();
  }

  // ---------------- 온라인: 참가 ----------------
  async joinRoom(codeIn) {
    const code = normCode(codeIn);
    if (code.length !== 5) { toast('방 코드는 5자리예요.'); return; }
    this.stopNet();
    S.showConnecting(this, `방 ${code}에 연결하는 중...`, () => { this.stopNet(); S.showJoin(this); });
    const c = new ClientNet({
      onMsg: (m) => this.onClientMsg(m),
      onClose: () => { if (this.client !== c) return; this.stopNet(); this.exitToMenu(); modal('연결 끊김', h('div', null, '방장과의 연결이 끊어졌어요.'), [{ label: '확인' }]); },
      onError: (e) => toast(e),
    });
    this.client = c;
    try {
      const pid = await c.connect(code, { t: 'hello', name: save.name, look: sanitizeLook(save.look) });
      if (this.client !== c) return;
      this.localPid = pid;
      this.isHostRole = false;
      this.roomCode = code;
    } catch (e) {
      if (this.client === c) { this.stopNet(); S.showError(this, e.message || String(e), () => S.showJoin(this, code)); }
    }
  }
  onClientMsg(m) {
    if (m.t === 'lobby') { this.showLobby(m); return; }
    if (m.t === 'start') this.beginNetGame();
    if (this.game) this.game.onMsg(m);
  }
  sendReady(r) { if (this.client) this.client.send({ t: 'ready', r }); }

  showLobby(m) {
    if (this.game) { this.game.destroy(); this.game = null; }
    if (!this.demo) this.startDemo();
    this.music('lobby');
    this.lobby = m;
    S.showLobby(this, m);
  }

  stopNet() {
    clearInterval(this.pingTimer);
    if (this.net) { this.net.destroy(); this.net = null; }
    if (this.client) { this.client.destroy(); this.client = null; }
    this.match = null; this.lobby = null; this.isHostRole = false; this.localPid = -1;
  }

  // ---------------- 게임 메뉴 / 종료 ----------------
  openGameMenu(g) {
    if (document.querySelector('.modal')) return;
    const solo = g.mode === 'solo';
    if (solo) g.paused = true;
    const resume = () => { g.paused = false; clearEdges(); this.last = now(); };
    modal(solo ? '일시정지' : '메뉴', h('div', { class: 'col' },
      h('div', { class: 'dim' }, solo ? '게임이 멈췄어요.' : '온라인 게임은 멈추지 않아요.'),
      btn('⚙ 설정', () => S.showSettingsModal(this))), [
      { label: solo ? '메인 메뉴로' : '방 나가기', cls: 'red', onClick: () => { this.exitToMenu(); } },
      { label: '계속하기', cls: 'primary', onClick: resume },
    ]);
  }
  endButtons(g) {
    if (g.mode === 'solo') return [
      { label: '메인 메뉴', onClick: () => this.exitToMenu() },
      { label: '다시 하기', cls: 'primary', onClick: () => { this.exitGameOnly(); this.startSolo(this.soloSettings); } },
    ];
    if (g.mode === 'host') return [
      { label: '나가기', onClick: () => this.exitToMenu() },
      { label: '대기실로', cls: 'primary', onClick: () => this.backToLobby() },
    ];
    return [{ label: '나가기', onClick: () => this.exitToMenu() }, { label: '방장을 기다리는 중...', cls: '', onClick: () => toast('방장이 대기실로 돌아가면 자동으로 이동해요.') }];
  }
  exitGameOnly() { if (this.game) { this.game.destroy(); this.game = null; } }
  exitToMenu() {
    document.querySelectorAll('.modal').forEach((m) => m.remove());
    this.exitGameOnly();
    this.stopNet();
    showTouch(false);
    if (!this.demo) this.startDemo();
    this.music('menu');
    S.showMenu(this);
  }
}

function closeModals() { document.querySelectorAll('.modal').forEach((m) => m.remove()); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function randomLook() {
  const r = (n) => Math.floor(Math.random() * n);
  return { color: r(14), hat: Math.random() < 0.6 ? r(HATS.length) : 0, face: r(FACES.length), back: Math.random() < 0.35 ? r(BACKS.length) : 0, fx: 0 };
}
function sfxSafe(n) { import('./core/audio.js').then((a) => a.sfx(n)); }

// ---------------- 부팅 ----------------
async function boot() {
  protect();
  const loading = h('div', { class: 'loading' }, h('div', { class: 'title-text' }, 'TRAP BUILDERS'), h('div', { class: 'loadbar' }, h('i', { style: { width: '10%' } })), h('div', { class: 'dim', style: { fontSize: '0.8em' } }, '불러오는 중...'));
  document.body.appendChild(loading);
  const bar = loading.querySelector('i');
  initInput();
  initAudio();
  setVolumes(save.settings.music, save.settings.sfx);
  initTouch();
  showTouch(false);
  bar.style.width = '35%';
  await new Promise((r) => setTimeout(r, 16));
  buildSprites();
  bar.style.width = '65%';
  try { await Promise.race([document.fonts.load('16px Galmuri11'), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* 무시 */ }
  bar.style.width = '100%';
  const app = new App();
  if (typeof __DEV__ !== 'undefined' && __DEV__) window.__app = app;
  app.startDemo();
  app.start();
  await new Promise((r) => setTimeout(r, 150));
  loading.remove();
  const q = new URLSearchParams(location.search);
  const room = q.get('room');
  if (room) { S.showMenu(app); S.showJoin(app, normCode(room)); }
  else S.showTitle(app);
  if (isTouch()) document.body.classList.add('touch');
}
boot();
