// 게임 화면: 메시지를 받아 월드를 재현하고, 내 캐릭터를 조종하고, 그린다
import { TILE, DT, clamp, lerp, now, isTouch } from '../core/util.js';
import { World, W, H, SF } from '../engine/world.js';
import { step, newBody, animOf, EV, NO_INPUT } from '../engine/physics.js';
import { genCoins, COINS_PER_POINT } from './coins.js';
import { Particles } from '../engine/particles.js';
import { NavGraph } from '../ai/navgraph.js';
import { Bot } from '../ai/bot.js';
import { ITEMS, itemCells } from '../data/items.js';
import { MAPS } from '../data/maps.js';
import { COLORS, SLOT_COLORS } from '../data/cosmetics.js';
import { getSheet, frameFor, FRAME_NAMES } from '../art/character.js';
import { OL } from '../art/sprites.js';
import { readInput, takeEdge, clearEdges } from '../core/input.js';
import { sfx, playMusic } from '../core/audio.js';
import { save, persist, claimDaily } from '../core/save.js';
import { addXp, checkAch, xpNeed, MAX_LEVEL } from '../data/progress.js';
import { PTS } from '../net/match.js';
import { Hud } from '../ui/hud.js';
import { showTouch } from '../ui/touch.js';
import { vibrate } from '../ui/dom.js';
import { shade, hsl } from '../core/util.js';

const BOT_LINES = {
  die: ['으악!', '앗…', '왜!!', 'ㅠㅠ', '억울해', '헉'],
  goal: ['골인!', 'ㅋㅋ', '이지~', '개꿀', '나이스'],
  kill: ['걸렸다ㅋ', '내 함정!', '계획대로', 'ㅋㅋㅋ'],
  stomp: ['밟았다!', 'ㅋㅋㅋ', '미안~'],
  stomped: ['아야!', '?!', '누구야', '으윽'],
  reckless_die: ['또?!', 'ㅋㅋ죽음', '한번 더!'],
  careful_die: ['조심했는데', '말도 안 돼'],
  careful_goal: ['휴…', '안전 제일'],
  prankster_stomp: ['헤헤', '꾹!', '방심했지'],
  prankster_kill: ['낚였다ㅋ', '헤헤헤'],
  collector_goal: ['코인 짱', '부자다'],
  reckless_goal: ['돌격!', '가즈아'],
};
const PHASE_LABEL = { intro: '준비', pick: '파티 상자', place: '배치', run: '달리기', result: '결과', end: '게임 끝' };

export class Game {
  constructor(app, o) {
    this.app = app;
    this.mode = o.mode; // solo | host | client | demo
    this.demo = o.mode === 'demo';
    this.online = o.mode === 'host' || o.mode === 'client';
    this.localPid = o.localPid ?? -1;
    this.send = o.send;
    this.match = o.match || null;
    this.isHost = !!this.match;
    this.renderer = app.renderer;
    this.queue = [];
    this.players = new Map();
    this.order = [];
    this.phase = 'wait';
    this.particles = new Particles();
    this.cam = { x: 0, y: 0, z: 1 };
    this.camFocus = null; this.userZoom = 1;
    this.shake = 0;
    this.time = 0; this.phaseLeft = 0; this.runT = 0; this.cd = 3; this.dur = 45;
    this.bounce = new Map();
    this.paused = false;
    this.cursors = new Map();
    this.frame = 0;
    this.spec = 0;
    this.lastCount = -1;
    this.trapState = new Map();
    this.windWarned = false;
    this.hud = this.demo ? null : new Hud({ online: this.online, onMenu: () => this.app.openGameMenu(this), onEmote: (e) => this.emote(e), onChat: () => this.app.chat.open() });
    this.place = null;
    this.bindInput();
  }

  // ---------------- 입력 바인딩 (배치/숫자키) ----------------
  bindInput() {
    const cv = this.renderer.canvas;
    this.ptrs = new Map();
    this.onKey = (e) => {
      if (this.phase === 'pick' && /^Digit[1-8]$/.test(e.code)) this.pickReq(+e.code.slice(5) - 1);
      if (this.phase === 'place' && this.place && !this.place.done && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) {
        const d = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] }[e.code];
        this.moveCursor(this.place.x + d[0], this.place.y + d[1]);
      }
      if (this.online && this.phase === 'run' && /^Digit[1-6]$/.test(e.code) && e.altKey) this.emote(['👍', '😂', '😱', '😡', '❤️', 'GG'][+e.code.slice(5) - 1]);
    };
    window.addEventListener('keydown', this.onKey);
    this.onDown = (e) => {
      if (this.demo) return;
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, type: e.pointerType });
      if (this.phase !== 'place' || !this.place || this.place.done) return;
      if (this.ptrs.size === 2) { this.pinch = this.pinchInfo(); return; }
      if (e.pointerType === 'mouse') {
        if (e.button === 2) { this.rotate(); return; }
        this.pointerCell(e.clientX, e.clientY, 0);
        this.confirmPlace();
      } else this.pointerCell(e.clientX, e.clientY, -42);
    };
    this.onMove = (e) => {
      const p = this.ptrs.get(e.pointerId);
      if (p) { p.x = e.clientX; p.y = e.clientY; }
      if (this.phase !== 'place' || !this.place || this.place.done || this.demo) return;
      if (this.ptrs.size >= 2 && this.pinch) {
        const n = this.pinchInfo();
        this.userZoom = clamp(this.pinch.zoom * (n.d / this.pinch.d), 1, 3);
        const fit = this.fitZoom();
        const z = fit * this.userZoom;
        const dx = (n.cx - this.pinch.cx) * this.renderer.dpr / (this.renderer.S * z);
        const dy = (n.cy - this.pinch.cy) * this.renderer.dpr / (this.renderer.S * z);
        this.camFocus = { x: this.pinch.fx - dx, y: this.pinch.fy - dy };
        return;
      }
      if (e.pointerType === 'mouse') this.pointerCell(e.clientX, e.clientY, 0);
      else if (p) this.pointerCell(e.clientX, e.clientY, -42);
    };
    this.onUp = (e) => {
      this.ptrs.delete(e.pointerId);
      if (this.ptrs.size < 2) this.pinch = null;
    };
    this.onWheel = (e) => {
      if (this.phase === 'place' && this.place && !this.place.done) { e.preventDefault(); if (Math.abs(e.deltaY) > 2) { const now2 = performance.now(); if (!this.lastWheel || now2 - this.lastWheel > 120) { this.lastWheel = now2; this.rotate(); } } }
    };
    cv.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    cv.addEventListener('wheel', this.onWheel, { passive: false });
  }
  pinchInfo() {
    const [a, b] = [...this.ptrs.values()];
    const f = this.camFocus || this.mapCenter();
    return { d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, zoom: this.userZoom, fx: f.x, fy: f.y };
  }
  destroy() {
    const cv = this.renderer.canvas;
    window.removeEventListener('keydown', this.onKey);
    cv.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    cv.removeEventListener('wheel', this.onWheel);
    if (this.hud) this.hud.destroy();
    showTouch(false);
  }

  onMsg(m) { this.queue.push(m); }

  // ---------------- 메시지 처리 ----------------
  flush() {
    while (this.queue.length) {
      const m = this.queue.shift();
      const f = this['m_' + m.t];
      if (f) f.call(this, m);
    }
  }

  m_start(m) {
    this.world = new World(m.map);
    this.mapKey = m.map;
    this.world.onCrumble = (i, cloud) => this.fxCrumble(i, cloud);
    this.world.onMineArm = (it) => { if (!this.demo && this.isVisible({ x: it.x * TILE, y: it.y * TILE, w: 16, h: 16 })) sfx('charge'); };
    this.world.onMineBoom = (it) => this.fxMine(it);
    this.renderer.setWorld(this.world);
    this.target = m.target; this.maxRounds = m.maxRounds;
    this.players.clear();
    const colorCount = {};
    for (const p of m.players) colorCount[p.look.color] = (colorCount[p.look.color] || 0) + 1;
    m.players.forEach((p, i) => {
      const slot = p.slot ?? i;
      const color = SLOT_COLORS[slot % SLOT_COLORS.length];
      const ol = colorCount[p.look.color] > 1 ? shade(color, -0.25) : OL;
      this.players.set(p.id, { id: p.id, name: p.name, title: p.title || '', persona: p.persona, look: p.look, kind: p.kind, diff: p.diff, slot, color, ol, score: 0, body: null, st: 'idle', buf: [], ghosts: [], emote: null, emoteT: 0, connected: true });
    });
    this.order = [...this.players.keys()];
    this.phase = 'intro';
    this.phaseLeft = 1.2;
    this.snapOverview();
    if (!this.demo) {
      playMusic(MAPS[m.map].music);
      this.hud.setScores(this.plist(), this.target);
      this.hud.banner(`${MAPS[m.map].icon} ${MAPS[m.map].name}`, `목표 ${this.target}점 · 최대 ${this.maxRounds}라운드`, 1800);
    }
  }
  plist() { return this.order.map((id) => this.players.get(id)).filter(Boolean).map((p) => ({ id: p.id, name: p.name, look: p.look, slotColor: p.color, score: p.score })); }
  stMap() { const m = new Map(); for (const p of this.players.values()) m.set(p.id, !p.connected ? 'left' : p.st === 'dead' ? 'dead' : p.st === 'goal' ? 'goal' : ''); return m; }

  m_pick(m) {
    this.phase = 'pick';
    this.round = m.round;
    this.phaseLeft = m.dur;
    this.box = m.box;
    this.myPick = null;
    this.clearBodies();
    if (this.hud) {
      this.hud.hideResult(); this.hud.hideSpectate(); this.hud.clearBanner();
      this.hud.showPick(m.box, (i) => this.pickReq(i), m.overtime);
      this.hud.setScores(this.plist(), this.target, this.stMap());
      sfx('open');
    }
    showTouch(false);
  }
  pickReq(i) {
    if (this.phase !== 'pick' || this.myPick || this.localPid < 0) return;
    this.toHost({ t: 'pickReq', idx: i });
  }
  m_picked(m) {
    const p = this.players.get(m.pid);
    if (m.pid === this.localPid) { this.myPick = this.box[m.idx]; if (this.hud) this.hud.lockPicks(); }
    if (this.hud) { this.hud.markPick(m.idx, p ? p.name : '?', p ? p.color : '#fff', m.pid === this.localPid); sfx('pick'); }
  }

  m_place(m) {
    this.phase = 'place';
    this.placeStart = this.time;
    clearEdges();
    this.phaseLeft = m.dur;
    this.picks = m.picks;
    this.cursors.clear();
    this.userZoom = 1; this.camFocus = null;
    const type = m.picks[this.localPid];
    if (this.hud) this.hud.hidePick();
    if (type && !this.demo) {
      const c = this.mapCenter();
      this.place = { type, x: Math.floor(c.x / TILE), y: Math.floor(c.y / TILE), rot: ITEMS[type].rots[0], done: false, lastSent: 0, dirty: true };
      this.validate();
      this.hud.showPlace(type, { rotate: () => this.rotate(), confirm: () => this.confirmPlace() });
    } else {
      this.place = null;
      if (this.hud) this.hud.placeDone('고른 아이템이 없어요');
    }
  }
  m_cursor(m) {
    if (m.pid === this.localPid) return;
    const p = this.players.get(m.pid);
    if (!p || !this.picks) return;
    this.cursors.set(m.pid, { x: m.x, y: m.y, rot: m.rot, type: this.picks[m.pid], color: p.color, name: p.name });
  }
  m_placed(m) {
    const it = m.item;
    const removed = this.world.place(Object.assign({}, it));
    this.cursors.delete(it.owner);
    const cx = it.x * TILE + 8, cy = it.y * TILE + 8;
    if (it.type === 'hammer') {
      this.particles.burst(cx, cy, 20, ['#c8ccd8', '#8a94a8', '#a8703f'], 120, 0.7, 2, 400);
      if (!this.demo) { sfx('slam'); this.addShake(3); }
    } else if (it.type === 'tbomb') {
      this.particles.burst(cx, cy, 60, ['#ffe14a', '#ff8a2a', '#ff3a00', '#b8202a'], 200, 0.9, 2, 200);
      this.particles.burst(cx, cy, 30, ['#7a4f2e', '#5e3b21', '#6a7080'], 140, 1.2, 3, 500);
      if (!this.demo) { sfx('explode'); this.addShake(9); }
    } else if (it.type === 'bomb') {
      this.particles.burst(cx, cy, 40, ['#ffe14a', '#ff8a2a', '#ff3a00', '#5a5f70'], 160, 0.8, 2, 200);
      this.particles.burst(cx, cy, 16, '#3a3c4a', 60, 1.2, 3, -20);
      if (!this.demo) { sfx('explode'); this.addShake(6); }
    } else {
      for (const [x, y] of itemCells(it.type, it.x, it.y, it.rot)) this.particles.dust(x * TILE + 8, y * TILE + 16, 3);
      if (!this.demo) sfx('place');
    }
    if (it.owner === this.localPid && this.place) { this.place.done = true; if (this.hud) this.hud.placeDone(); }
  }
  m_placeFail() {
    if (this.place) { this.place.done = false; this.place.sent = false; }
    sfx('deny');
    if (this.hud) this.hud.placeHint('여기에는 놓을 수 없어요!');
  }

  m_run(m) {
    this.phase = 'run';
    this.lastSurvivorLocal = false;
    this.runT = 0; this.cd = m.cd; this.dur = m.dur;
    this.phaseLeft = m.cd + m.dur;
    this.place = null; this.cursors.clear();
    this.world.resetDynamic();
    this.trapState.clear();
    this.lastCount = -1; this.windWarned = false;
    if (this.hud) { this.hud.hidePlace(); this.hud.hidePick(); }
    const sp = this.world.spawn;
    let i = 0;
    const n = this.players.size;
    for (const p of this.players.values()) {
      const off = (i - (n - 1) / 2) * 3;
      i++;
      p.ghosts = [];
      p.buf = [];
      if (!p.connected) { p.st = 'out'; p.body = null; continue; }
      p.body = newBody(sp.x + off, sp.y);
      p.body.face = 1;
      p.st = 'run';
      p.fx = false;
      p.bot = this.isHost && p.kind === 'bot' ? new Bot(p.diff || 'normal', p.id * 131 + this.round * 7, p.persona) : null;
    }
    this.graph = this.isHost && [...this.players.values()].some((p) => p.bot) ? new NavGraph(this.world) : null;
    this.coins = genCoins(this.world, this.round || 1);
    for (const p of this.players.values()) { p.coinSet = new Set(); p.coinN = 0; p.stunT = 0; p.immuneT = 0; p.stompAt = new Map(); }
    this.spec = 0;
    const me = this.players.get(this.localPid);
    if (me && me.body) this.snapTo(me.body);
    else this.snapOverview();
    if (this.hud) { this.hud.setScores(this.plist(), this.target, this.stMap()); showTouch(isTouch()); }
    clearEdges();
  }
  m_pss(m) {
    const tnow = now();
    for (const s of m.a) {
      const [pid, x, y, fi, face, hh, sn] = s;
      if (pid === this.localPid) continue;
      const p = this.players.get(pid);
      if (!p || (this.isHost && p.bot)) continue;
      p.buf.push({ t: tnow, x, y, fi, face, h: hh, sn });
      if (p.buf.length > 12) p.buf.shift();
    }
  }
  // 방장: 원격 플레이어 상태 수신
  onPs(pid, s) {
    const p = this.players.get(pid);
    if (!p || this.phase !== 'run') return;
    p.buf.push({ t: now(), x: s[0], y: s[1], fi: s[2], face: s[3], h: s[4], sn: s[5] });
    if (p.buf.length > 12) p.buf.shift();
    p.last = s;
  }
  m_fin(m) {
    const p = this.players.get(m.pid);
    if (!p) return;
    const res = m.res;
    const prev = p.st;
    if (!this.demo && this.localPid >= 0) {
      if (m.pid === this.localPid && res.goal) {
        if (res.order === 1) save.stats.firstGoals++;
        if (this.lastSurvivorLocal) save.stats.lastSurvivorGoals++;
      }
      if (res.dead && res.killer > 0) {
        const kit = this.world.items.get(res.killer);
        if (kit && kit.owner !== m.pid) this.botSay(this.players.get(kit.owner), 'kill');
      }
      if (res.dead && res.killer > 0 && m.pid !== this.localPid) {
        const it = this.world.items.get(res.killer);
        if (it && it.owner === this.localPid && it.type === 'mine') save.stats.mineKills++;
      }
    }
    p.st = res.goal ? 'goal' : res.out ? 'out' : res.timeout ? 'out' : 'dead';
    if (!p.fx && prev === 'run') {
      p.fx = true;
      const pos = this.bodyPos(p);
      if (pos) {
        if (res.goal) this.fxGoal(p, pos.x + 5, pos.y + 10);
        else if (res.dead) this.fxDeath(p, pos.x + 5, pos.y + 10, false);
      }
    }
    if (this.hud) {
      this.hud.setScores(this.plist(), this.target, this.stMap());
      if (res.goal && res.order === 1) this.hud.sub(`🏁 ${p.name} 1등 골인!`, 1800);
      const runners = [...this.players.values()].filter((q) => q.st === 'run');
      if (runners.length === 1 && this.players.size > 1 && !this.lastSurvivor) {
        this.lastSurvivor = true;
        if (runners[0].id === this.localPid) { this.lastSurvivorLocal = true; this.hud.banner('마지막 생존자!', '끝까지 가 보세요!', 1600); sfx('charge'); }
        else this.hud.sub(`⚡ ${runners[0].name} 혼자 남았어요!`, 2200);
      }
    }
  }
  m_result(m) {
    this.phase = 'result';
    this.phaseLeft = 5.5;
    this.lastSurvivor = false;
    showTouch(false);
    for (const p of this.players.values()) if (p.st === 'run') p.st = 'out';
    const rows = [];
    for (const id of this.order) {
      const p = this.players.get(id);
      const g = m.gains[id] || { goal: 0, kills: 0 };
      if (id === this.localPid && !this.demo) save.stats.bestRoundKills = Math.max(save.stats.bestRoundKills, Math.round(g.kills / PTS.kill));
      const before = p.score;
      const sc = m.scores.find((s) => s[0] === id);
      p.score = sc ? sc[1] : before + g.goal + g.kills + (g.coin || 0);
      rows.push({ name: p.name, color: p.color, look: p.look, before, goal: g.goal, kills: g.kills, coin: g.coin || 0, after: p.score });
    }
    if (this.hud) {
      this.hud.hideSpectate();
      this.hud.showResult(rows, m.flag, this.target, m.round);
      this.hud.setScores(this.plist(), this.target);
      sfx(m.flag === 'easy' ? 'easy' : m.flag === 'fail' ? 'lose' : 'coin');
    }
  }
  m_end(m) {
    this.phase = 'end';
    showTouch(false);
    for (const [id, sc] of m.scores) { const p = this.players.get(id); if (p) p.score = sc; }
    if (this.demo) { this.phaseLeft = 3; return; }
    const sorted = this.order.map((id) => this.players.get(id)).sort((a, b) => b.score - a.score);
    const podium = sorted.slice(0, 3).map((p) => ({ name: p.name, title: p.title, color: p.color, look: p.look, score: p.score }));
    let xpText = '';
    const won = m.winners.includes(this.localPid);
    const coinLines = [];
    if (this.localPid >= 0) {
      const st = m.stats[this.localPid] || { goals: 0, kills: 0 };
      coinLines.push(['매치 완료', 10]);
      if (st.goals) coinLines.push([`골인 ${st.goals}회`, st.goals * 5]);
      if (st.kills) coinLines.push([`함정 처치 ${st.kills}회`, st.kills * 2]);
      if (won) coinLines.push(['우승!', 30]);
      if (this.coinsPicked) coinLines.push([`코인 줍기 ${this.coinsPicked}개`, this.coinsPicked]);
      if (claimDaily()) coinLines.push(['오늘 첫 판', 20]);
      const total = coinLines.reduce((a, b) => a + b[1], 0);
      save.coins += total;
      save.stats.matches++; if (won) save.stats.wins++;
      save.stats.goals += st.goals; save.stats.kills += st.kills;
      if (won) save.stats.mapWins[this.mapKey] = true;
      if (this.online) save.stats.online++;
      const xp = 20 + st.goals * 10 + st.kills * 6 + (won ? 40 : 0);
      for (const r of addXp(save, xp)) coinLines.push([r.label, r.coins]);
      for (const r of checkAch(save)) coinLines.push([r.label, r.coins]);
      xpText = save.level >= MAX_LEVEL ? `경험치 +${xp} · Lv.${save.level} (최고 레벨)` : `경험치 +${xp} · Lv.${save.level} (${save.xp}/${xpNeed(save.level)})`;
      persist();
    }
    const winNames = m.winners.map((id) => this.players.get(id)?.name).join(', ');
    const title = m.winners.length > 1 ? `🤝 공동 우승: ${winNames}` : won ? '🏆 우승했어요!' : `🏆 ${winNames} 우승!`;
    const buttons = this.app.endButtons(this);
    this.hud.showEnd(podium, coinLines, buttons, title, xpText);
    sfx(won ? 'win' : 'lose');
    if (won) for (let i = 0; i < 6; i++) setTimeout(() => this.fxConfetti(), i * 300);
  }
  m_left(m) {
    const p = this.players.get(m.pid);
    if (!p) return;
    if (m.toBot) { p.kind = 'bot'; p.diff = 'normal'; p.name = p.name + '(봇)'; }
    else p.connected = false;
    if (this.hud) { this.hud.sub(`${p.name.replace('(봇)', '')} 님이 나갔어요${m.toBot ? ' · 봇이 대신해요' : ''}`, 2600); this.hud.setScores(this.plist(), this.target, this.stMap()); }
  }
  m_emote(m) {
    const p = this.players.get(m.pid);
    if (!p) return;
    p.emote = m.e; p.emoteT = 2.6;
    if (!this.demo) sfx('emote');
  }
  emote(e) { this.toHost({ t: 'emote', e }); }

  toHost(m) {
    if (this.isHost) this.match.handle(this.localPid, m);
    else this.send && this.send(m);
  }

  // ---------------- 배치 ----------------
  mapCenter() { return { x: W * TILE / 2, y: H * TILE / 2 }; }
  pointerCell(cx, cy, offY) {
    const r = this.renderer;
    const z = this.cam.z;
    const wx = (cx * r.dpr) / (r.S * z) + this.cam.x;
    const wy = ((cy + offY) * r.dpr) / (r.S * z) + this.cam.y;
    this.moveCursor(Math.floor(wx / TILE), Math.floor(wy / TILE));
  }
  moveCursor(x, y) {
    const p = this.place;
    if (!p) return;
    x = clamp(x, 0, W - 1); y = clamp(y, 0, H - 1);
    if (x === p.x && y === p.y) return;
    p.x = x; p.y = y; p.dirty = true;
    this.validate();
  }
  rotate() {
    const p = this.place;
    if (!p || p.done || this.phase !== 'place') return;
    const rots = ITEMS[p.type].rots;
    if (rots.length < 2) return;
    p.rot = rots[(rots.indexOf(p.rot) + 1) % rots.length];
    p.dirty = true;
    this.validate();
    sfx('rotate');
  }
  validate() {
    const p = this.place;
    if (!p) return;
    const w = this.world;
    p.valid = w.canPlace(p.type, p.x, p.y, p.rot);
  }
  confirmPlace() {
    const p = this.place;
    if (!p || p.done || this.phase !== 'place') return;
    if (this.time - this.placeStart < 0.35) return; // 단계가 바뀌는 순간의 클릭/키 입력 무시
    if (!p.valid) { sfx('deny'); this.hud && this.hud.placeHint('여기에는 놓을 수 없어요!'); return; }
    p.done = true;
    this.toHost({ t: 'placeReq', x: p.x, y: p.y, rot: p.rot });
  }
  placeView() {
    const p = this.place;
    const mine = p && !p.done ? { type: p.type, x: p.x, y: p.y, rot: p.rot, id: 1, valid: p.valid } : null;
    return { mine, cursors: [...this.cursors.values()] };
  }

  // ---------------- 업데이트 ----------------
  update(dt) {
    this.flush();
    if (this.paused) return;
    if (this.match) this.match.tick(dt);
    this.flush();
    if (this.says && this.says.length) {
      for (let i = this.says.length - 1; i >= 0; i--) {
        const s2 = this.says[i];
        if (this.time >= s2.at) { this.says.splice(i, 1); if (this.match) this.match.handle(s2.pid, { t: 'emote', e: s2.text }); }
      }
    }
    this.time += dt;
    this.frame++;
    this.phaseLeft -= dt;
    switch (this.phase) {
      case 'intro': if (this.hud) this.hud.setPhase('준비', null); break;
      case 'pick': if (this.hud) this.hud.setPhase(PHASE_LABEL.pick, this.phaseLeft); break;
      case 'place': this.updatePlace(dt); break;
      case 'run': this.updateRun(dt); break;
      case 'result': if (this.hud) this.hud.setPhase(PHASE_LABEL.result, null); break;
      case 'end': if (this.demo && this.phaseLeft <= 0) this.app.restartDemo(); break;
    }
    if (takeEdge('pause') && !this.demo) this.app.openGameMenu(this);
    this.particles.update(dt);
    for (const p of this.players.values()) {
      if (p.emoteT > 0) { p.emoteT -= dt; if (p.emoteT <= 0) p.emote = null; }
      for (const g of p.ghosts) g.a -= dt * 4;
      if (p.ghosts.length && p.ghosts[0].a <= 0) p.ghosts = p.ghosts.filter((g) => g.a > 0);
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
    this.updateCamera(dt);
  }

  updatePlace(dt) {
    if (this.hud) this.hud.setPhase(PHASE_LABEL.place, this.phaseLeft);
    const p = this.place;
    if (!p || p.done) return;
    if (takeEdge('rotate')) this.rotate();
    // 위쪽 키(W/↑)는 커서 이동용이라 확정으로 쓰지 않음 (readInput(true))
    const inp = readInput(true);
    const conf = takeEdge('confirm') || inp.jumpP;
    if (conf && this.time - this.placeStart > 0.35) this.confirmPlace();
    if (p.dirty && this.time - p.lastSent > 0.1 && this.online) {
      p.dirty = false; p.lastSent = this.time;
      this.toHost({ t: 'cursor', x: p.x, y: p.y, rot: p.rot });
    }
  }

  nearLadder(b) {
    const tx = Math.floor((b.x + b.w / 2) / TILE);
    const y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h + 1) / TILE);
    for (let y = y0; y <= y1; y++) if (this.world.ladderAt(tx, y)) return true;
    return false;
  }

  updateRun(dt) {
    this.runT += dt;
    const t = this.runT;
    const left = this.cd + this.dur - t;
    const meP = this.players.get(this.localPid);
    const coinTxt = meP && this.coins ? ` · 🪙${meP.coinN || 0}` : '';
    if (this.hud) this.hud.setPhase(t < this.cd ? '곧 출발!' : PHASE_LABEL.run + coinTxt, t < this.cd ? null : left, 10);
    const cnt = Math.ceil(this.cd - t);
    if (cnt !== this.lastCount) {
      this.lastCount = cnt;
      if (!this.demo && this.hud) {
        if (cnt > 0) { this.hud.banner(String(cnt), null, 800); sfx('count'); }
        else if (cnt === 0) { this.hud.banner('출발!', null, 700); sfx('go'); }
      }
    }
    if (this.graph && !this.graph.ready) this.graph.work(this.demo ? 3 : 5);
    if (t >= this.cd) {
      const me = this.players.get(this.localPid);
      for (const p of this.players.values()) {
        if (p.st !== 'run' || !p.body) continue;
        if (p.immuneT > 0) p.immuneT -= dt;
        const stunned = p.stunT > 0;
        if (stunned) p.stunT -= dt;
        if (p.id === this.localPid) this.stepPlayer(p, stunned ? NO_INPUT : readInput(this.nearLadder(p.body)), t, true);
        else if (p.bot) this.stepPlayer(p, stunned ? NO_INPUT : p.bot.update(p.body, this.world, this.graph, t, dt, this.botCtx(p)), t, false);
      }
      const bodies = [];
      for (const p of this.players.values()) { const b = this.bodyPos(p); if (b && p.st === 'run') bodies.push(b); }
      this.world.updateDynamic(dt, t, bodies);
      if (this.isHost && this.frame % 10 === 0) {
        for (const p of this.players.values()) {
          if (p.st !== 'run') continue;
          const b = this.bodyPos(p);
          if (b) this.match.onHeat(Math.floor((b.x + 5) / TILE), Math.floor((b.y + b.h / 2) / TILE), p.id);
        }
      }
      if (this.online && this.frame % 3 === 0) this.syncStates();
      this.trapSfx(t);
      // 바람 예고
      if (this.world.hasWind) {
        const wd = this.world.wind(t);
        if (wd.warn && !this.windWarned) { this.windWarned = true; if (this.hud) this.hud.sub(wd.sand ? '🌪️ ← 모래폭풍이 와요!' : wd.dir > 0 ? '💨 바람 주의! →' : '💨 ← 바람 주의!', 1200); }
        if (!wd.warn && !wd.active) this.windWarned = false;
        if (wd.active && this.frame % 2 === 0) {
          const v = this.viewRect();
          this.particles.spawn(wd.dir > 0 ? v.x0 : v.x1, v.y0 + Math.random() * (v.y1 - v.y0), wd.dir * (260 + Math.random() * 120), 0, 1.6, wd.sand ? 'rgba(240,200,120,0.8)' : 'rgba(255,255,255,0.6)', wd.sand ? 2 : 1, 0);
        }
        if (wd.active && !this.windSfx) { this.windSfx = true; if (!this.demo) sfx('wind'); }
        if (!wd.active) this.windSfx = false;
      }
      if (me && me.st !== 'run' && this.hud && !this.demo) {
        const runners = [...this.players.values()].filter((q) => q.st === 'run' && q.id !== this.localPid);
        if (runners.length) {
          const tg = runners[((this.spec % runners.length) + runners.length) % runners.length];
          this.hud.spectate(tg.name, () => { this.spec--; }, () => { this.spec++; });
        } else this.hud.hideSpectate();
      }
    }
  }

  stepPlayer(p, inp, t, local) {
    const b = p.body;
    step(b, inp, this.world, t, DT, 0);
    const ev = b.ev;
    const audible = local || (this.isVisible(b) && !this.demo && p.id !== this.localPid && false);
    if (ev) {
      if (ev & EV.JUMP) { this.particles.dust(b.x + 5, b.y + b.h, 3); if (local) sfx('jump'); }
      if (ev & EV.WJUMP) { this.particles.dust(b.x + (b.face < 0 ? 10 : 0), b.y + b.h - 4, 3); if (local) sfx('wjump'); }
      if (ev & EV.LAND && b.fallV > 140) { this.particles.dust(b.x + 5, b.y + b.h, 4); if (local) sfx('land'); }
      if (ev & EV.DASH) { if (local) { sfx('dash'); } }
      if (ev & EV.SLIDE && local) sfx('slide');
      if (ev & EV.BOOST) { this.particles.dust(b.x + 5, b.y + b.h, 5, '#ffd23f'); if (local) sfx('dash'); }
      if (ev & EV.BOUNCE) {
        const tx = Math.floor((b.x + 5) / TILE), ty = Math.floor((b.y + b.h + 2) / TILE);
        for (const it of this.world.items.values()) if (it.type === 'tramp' && Math.abs(it.x - tx) <= 1 && Math.abs(it.y - ty) <= 1) this.bounce.set(it.id, t + 0.15);
        if (local || this.isVisible(b)) if (!this.demo) sfx('bounce');
      }
    }
    if (b.dash > 0 && this.frame % 2 === 0) {
      const pos = this.drawPos(p, b.x, b.y, b);
      p.ghosts.push({ img: pos.img, x: pos.dx, y: pos.dy, a: 1 });
    }
    void audible;
    const hz = this.world.hazard(b, t);
    if (hz !== undefined) { this.die(p, hz, local); return; }
    if (this.world.touchGoal(b)) { this.reachGoal(p, local); return; }
    this.pickCoins(p, b, local);
    this.checkStomp(p, b, t, local);
  }
  pickCoins(p, b, local) {
    if (!this.coins) return;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    for (let i = 0; i < this.coins.length; i++) {
      if (p.coinSet.has(i)) continue;
      const c = this.coins[i];
      if (Math.abs(cx - c.x) > 10 || Math.abs(cy - c.y) > b.h / 2 + 6) continue;
      p.coinSet.add(i); p.coinN++;
      this.particles.burst(c.x, c.y, 8, ['#ffe14a', '#fff6b0', '#c79a10'], 60, 0.45, 1, 0);
      const msg = { t: 'coin', n: p.coinN };
      if (local) { sfx('coin'); this.coinsPicked = (this.coinsPicked || 0) + 1; this.toHost(msg); if (p.coinN % COINS_PER_POINT === 0 && this.hud) this.hud.sub(`🪙 코인 ${p.coinN}개! +1점`, 1200); }
      else if (p.bot) this.match.handle(p.id, msg);
    }
  }
  // 밟기: 떨어지면서 다른 플레이어 머리에 닿으면 튀어 오르고 상대는 기절
  checkStomp(p, b, t, local) {
    if (b.vy < 60 || this.world.inSafe(b)) return;
    const bottom = b.y + b.h;
    for (const q of this.players.values()) {
      if (q === p || q.st !== 'run') continue;
      const qb = this.bodyPos(q);
      if (!qb || this.world.inSafe(qb)) continue;
      if (b.x + b.w < qb.x + 2 || b.x > qb.x + qb.w - 2) continue;
      if (bottom < qb.y - 2 || bottom > qb.y + 9) continue;
      if ((p.stompAt.get(q.id) || -9) > t - 1) continue;
      p.stompAt.set(q.id, t);
      b.y = qb.y - b.h; b.vy = -250; b.noCut = true; b.airDash = false; b.dash = 0;
      const msg = { t: 'stomp', target: q.id };
      if (local) { sfx('bounce'); this.toHost(msg); }
      else if (p.bot) this.match.handle(p.id, msg);
      break;
    }
  }
  m_stomped(m) {
    const q = this.players.get(m.pid);
    if (!q) return;
    const qb = this.bodyPos(q);
    if (qb) {
      for (let i = 0; i < 6; i++) this.particles.spawn(qb.x + 5, qb.y - 2, (Math.random() - 0.5) * 80, -40 - Math.random() * 50, 0.6, '#ffe14a', 1, 200, 2);
      if (!this.demo && this.isVisible(qb)) sfx('slam');
    }
    const mine = q.id === this.localPid || (this.isHost && q.bot);
    if (mine && q.body && q.st === 'run' && !(q.immuneT > 0)) {
      q.stunT = 1.0; q.immuneT = 1.8; q.body.vx = 0;
      if (q.id === this.localPid) { this.addShake(3); if (save.settings.vibrate) vibrate(40); if (this.hud) this.hud.sub('💫 밟혔어요! 기절', 900); }
    }
    this.onStompReact && this.onStompReact(m);
  }
  botCtx(p) {
    const others = [];
    for (const q of this.players.values()) if (q !== p && q.st === 'run') { const b = this.bodyPos(q); if (b) others.push(b); }
    const coins = this.coins ? this.coins.filter((c, i) => !p.coinSet || !p.coinSet.has(i)) : null;
    return { others, coins };
  }
  // 봇 말풍선 반응 (방장/데모에서만 결정해서 모두에게 전송)
  botSay(p, kind) {
    if (!p || !p.bot || !this.match) return;
    if (this.time - (p.lastSay || -9) < 2 || Math.random() > 0.6) return;
    p.lastSay = this.time;
    const L = BOT_LINES[kind] || [];
    const P = (BOT_LINES[p.persona + '_' + kind] || []);
    const pool = P.length && Math.random() < 0.6 ? P : L;
    if (!pool.length) return;
    const text = pool[Math.floor(Math.random() * pool.length)];
    (this.says = this.says || []).push({ at: this.time + 0.2 + Math.random() * 0.6, pid: p.id, text });
  }
  onStompReact(m) {
    const a = this.players.get(m.by), v = this.players.get(m.pid);
    this.botSay(a, 'stomp');
    this.botSay(v, 'stomped');
  }
  die(p, killer, local) {
    if (p.bot) this.botSay(p, 'die');
    p.st = 'dead'; p.fx = true;
    const b = p.body;
    this.fxDeath(p, b.x + 5, b.y + b.h / 2, local);
    const res = { dead: true, killer: killer > 0 ? killer : 0 };
    if (local) { this.toHost({ t: 'fin', res }); if (save.settings.vibrate) vibrate(60); }
    else if (p.bot) this.match.handle(p.id, { t: 'fin', res });
  }
  reachGoal(p, local) {
    if (p.bot) this.botSay(p, 'goal');
    p.st = 'goal'; p.fx = true;
    const b = p.body;
    this.fxGoal(p, b.x + 5, b.y + 10);
    if (local) this.toHost({ t: 'fin', res: { goal: true } });
    else if (p.bot) this.match.handle(p.id, { t: 'fin', res: { goal: true } });
  }

  syncStates() {
    const enc = (p, b) => [p.id, Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, FRAME_NAMES.indexOf(this.frameOf(p, b)), b.face, b.h, p.stunT > 0 ? 1 : 0];
    if (this.isHost) {
      const a = [];
      for (const p of this.players.values()) {
        if (p.st !== 'run') continue;
        if ((p.id === this.localPid || p.bot) && p.body) a.push(enc(p, p.body));
        else if (p.last) a.push([p.id, ...p.last]);
      }
      if (a.length) this.app.hostBroadcast({ t: 'pss', a });
    } else {
      const me = this.players.get(this.localPid);
      if (me && me.st === 'run' && me.body) {
        const e = enc(me, me.body);
        this.send({ t: 'ps', s: e.slice(1) });
      }
    }
  }

  trapSfx(t) {
    if (this.demo) return;
    const w = this.world;
    const v = this.viewRect();
    const vis = (it) => it.x * 16 > v.x0 - 32 && it.x * 16 < v.x1 + 32 && it.y * 16 > v.y0 - 32 && it.y * 16 < v.y1 + 32;
    for (const it of w.flames) {
      const s = w.flameState(it, t), o = this.trapState.get(it.id);
      if (s === 2 && o !== 2 && vis(it)) sfx('flame');
      this.trapState.set(it.id, s);
    }
    for (const it of w.lasers) {
      const s = w.laserState(it, t), o = this.trapState.get(it.id);
      if (s !== o && vis(it)) sfx(s === 1 ? 'charge' : s === 2 ? 'laser' : null);
      this.trapState.set(it.id, s);
    }
    for (const it of w.arrows) {
      const k = Math.floor((t - it.phase) / 2), o = this.trapState.get(it.id);
      if (o !== undefined && k !== o && vis(it)) sfx('arrow');
      this.trapState.set(it.id, k);
    }
    for (const it of w.cannons) {
      const k = Math.floor((t - it.phase) / 3), o = this.trapState.get(it.id);
      if (o !== undefined && k !== o && vis(it)) sfx('cannon');
      this.trapState.set(it.id, k);
    }
    for (const it of w.crushers) {
      const s = w.crusherState(it, t).down ? 1 : 0, o = this.trapState.get(it.id);
      if (s === 1 && o === 0 && vis(it)) { sfx('slam'); const st = w.crusherState(it, t); this.particles.dust(it.x * TILE + 8, it.y * TILE + 16 + st.d + 16, 6); }
      this.trapState.set(it.id, s);
    }
  }

  // ---------------- 효과 ----------------
  bodyColor(p) { const c = COLORS[p.look.color]; return c.rainbow ? hsl((this.time * 240) % 360, 85, 60) : c.c; }
  fxDeath(p, x, y, local) {
    const c = this.bodyColor(p);
    this.particles.burst(x, y, 26, [c, shade(c, -0.35), '#1b1726', shade(c, 0.3)], 150, 0.9, 2, 420);
    if (!this.demo && (local || this.isVisible({ x, y, w: 1, h: 1 }))) sfx('death');
    if (local) this.addShake(5);
  }
  fxGoal(p, x, y) {
    const fx = p.look.fx || 0;
    if (fx === 0) this.particles.burst(x, y - 10, 30, ['#ff5a5a', '#ffd23f', '#5ee07a', '#4fa3ff', '#c77dff'], 170, 1.1, 2, 160);
    else if (fx === 1) this.particles.burst(x, y - 8, 16, ['#ff7ab8', '#ff4a7a'], 90, 1.4, 1, -30, 1);
    else if (fx === 2) this.particles.burst(x, y - 8, 18, ['#ffe14a', '#ffffff'], 130, 1.2, 1, 60, 2);
    else if (fx === 3) { for (let i = 0; i < 14; i++) this.particles.spawn(x + (Math.random() - 0.5) * 6, y - 30 + i * 4, (Math.random() - 0.5) * 60, 0, 0.5, i % 2 ? '#ffffff' : '#ffe14a', 3, 0); this.particles.burst(x, y, 18, '#9ae0ff', 140, 0.6, 1, 0); }
    else if (fx === 4) for (let i = 0; i < 18; i++) this.particles.spawn(x + (Math.random() - 0.5) * 70, y - 60 - Math.random() * 30, 0, 20 + Math.random() * 30, 1.6, '#ffc21a', 1, 60, 3);
    if (!this.demo && (p.id === this.localPid || this.isVisible({ x, y, w: 1, h: 1 }))) sfx('goal');
  }
  fxMine(it) {
    const x = it.x * TILE + 8, y = it.y * TILE + 13;
    this.particles.burst(x, y, 34, ['#ffe14a', '#ff8a2a', '#ff3a00', '#5a5f70'], 150, 0.7, 2, 200);
    if (!this.demo && this.isVisible({ x, y, w: 1, h: 1 })) { sfx('explode'); this.addShake(4); }
  }
  fxCrumble(i, cloud) {
    const x = (i % W) * 16 + 8, y = Math.floor(i / W) * 16 + 8;
    if (cloud) { this.particles.burst(x, y - 4, 10, ['#ffffff', '#e0e8f8'], 40, 0.6, 3, -20); return; }
    this.particles.burst(x, y, 10, ['#d8b06a', '#9a7438'], 70, 0.6, 2, 400);
    if (!this.demo && this.isVisible({ x, y, w: 1, h: 1 })) sfx('crumble');
  }
  fxConfetti() {
    const v = this.viewRect();
    for (let i = 0; i < 40; i++) this.particles.spawn(v.x0 + Math.random() * (v.x1 - v.x0), v.y0 - 4, (Math.random() - 0.5) * 40, 30 + Math.random() * 50, 2.5, ['#ff5a5a', '#ffd23f', '#5ee07a', '#4fa3ff', '#c77dff'][i % 5], 2, 20);
  }
  addShake(v) { if (save.settings.shake) this.shake = Math.max(this.shake, v); }

  // ---------------- 카메라 ----------------
  fitZoom() {
    const r = this.renderer;
    return Math.min(r.viewW / (W * TILE + 12), r.viewH / (H * TILE + 56));
  }
  viewRect() {
    const r = this.renderer;
    return { x0: this.cam.x, y0: this.cam.y, x1: this.cam.x + r.viewW / this.cam.z, y1: this.cam.y + r.viewH / this.cam.z };
  }
  isVisible(b) { const v = this.viewRect(); return b.x > v.x0 - 16 && b.x < v.x1 + 16 && b.y > v.y0 - 16 && b.y < v.y1 + 16; }
  camTarget() {
    const r = this.renderer;
    if (this.phase === 'run' || (this.phase === 'result' && this.runT > 0 && false)) {
      let tb = null;
      const me = this.players.get(this.localPid);
      if (me && me.st === 'run' && me.body) tb = me.body;
      else {
        const runners = [...this.players.values()].filter((q) => q.st === 'run' && (q.body || q.buf.length));
        if (this.demo) runners.sort((a, b) => (this.bodyPos(b)?.x || 0) - (this.bodyPos(a)?.x || 0));
        if (runners.length) tb = this.bodyPos(runners[((this.spec % runners.length) + runners.length) % runners.length]);
        else if (me && me.body) tb = me.body;
      }
      if (tb) {
        const z = this.demo ? 1.1 : 1;
        const vw = r.viewW / z, vh = r.viewH / z;
        let x = tb.x + 5 - vw / 2 + (tb.face || 0) * 18;
        let y = tb.y + 10 - vh * 0.55;
        return { x, y, z };
      }
    }
    const fit = this.fitZoom();
    const z = fit * (this.phase === 'place' ? this.userZoom : 1);
    const f = this.phase === 'place' && this.camFocus ? this.camFocus : this.mapCenter();
    return { x: f.x - r.viewW / z / 2, y: f.y - r.viewH / z / 2 + (this.phase === 'place' ? 6 : 0) / z, z };
  }
  clampCam(c) {
    const r = this.renderer;
    const vw = r.viewW / c.z, vh = r.viewH / c.z;
    const mw = W * TILE, mh = H * TILE;
    if (vw >= mw + 16) c.x = (mw - vw) / 2; else c.x = clamp(c.x, -8, mw + 8 - vw);
    if (vh >= mh + 40) c.y = (mh - vh) / 2 - 8; else c.y = clamp(c.y, -48, mh + 24 - vh);
    return c;
  }
  updateCamera(dt) {
    if (!this.world) return;
    const t = this.clampCam(this.camTarget());
    const k = Math.min(1, dt * (this.phase === 'run' ? 7 : 5));
    this.cam.z = lerp(this.cam.z, t.z, k);
    const tc = this.clampCam({ x: t.x, y: t.y, z: this.cam.z });
    // 줌이 바뀌는 중에는 중심 기준으로 보간
    this.cam.x = lerp(this.cam.x, tc.x, k);
    this.cam.y = lerp(this.cam.y, tc.y, k);
  }
  snapOverview() {
    const t = this.clampCam(this.camTarget());
    this.cam.x = t.x; this.cam.y = t.y; this.cam.z = t.z;
  }
  snapTo(b) {
    const r = this.renderer;
    const c = this.clampCam({ x: b.x - r.viewW / 2, y: b.y - r.viewH * 0.55, z: 1 });
    this.cam.x = c.x; this.cam.y = c.y; this.cam.z = 1;
  }
  clearBodies() { for (const p of this.players.values()) { p.body = null; p.buf = []; p.ghosts = []; p.st = 'idle'; p.last = null; } }

  // ---------------- 그리기 ----------------
  frameOf(p, b) {
    if (p.st === 'goal') return frameFor('win', b, this.time);
    return frameFor(animOf(b), b, this.time);
  }
  sheetOf(p) { return getSheet(p.look, p.ol, this.time); }
  drawPos(p, x, y, b, fi, face, hh) {
    const sheet = this.sheetOf(p);
    const fname = fi !== undefined ? FRAME_NAMES[fi] || 'idle0' : this.frameOf(p, b);
    const f = face !== undefined ? face : b.face;
    const h = hh !== undefined ? hh : b.h;
    const img = (f < 0 ? sheet.left : sheet.right)[fname];
    return { img, dx: x + 5 - 10, dy: y + h - 30, h };
  }
  // 보간된 위치 (원격 포함)
  bodyPos(p) {
    if (p.body && (p.id === this.localPid || p.bot)) return p.body;
    if (p.buf.length) {
      const rt = now() - 110;
      const bf = p.buf;
      let a = bf[0], b = bf[bf.length - 1];
      for (let i = 0; i < bf.length - 1; i++) if (bf[i].t <= rt && bf[i + 1].t >= rt) { a = bf[i]; b = bf[i + 1]; break; }
      if (rt >= b.t) a = b;
      const k = b.t === a.t ? 1 : clamp((rt - a.t) / (b.t - a.t), 0, 1);
      const s = k > 0.5 ? b : a;
      return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: 10, h: s.h, fi: s.fi, face: s.face, remote: true, sn: s.sn };
    }
    return p.body;
  }

  render(alpha) {
    if (!this.world) { this.renderer.draw({}); return; }
    const bodies = [];
    const showBodies = this.phase === 'run' || this.phase === 'result' || (this.phase === 'end' && this.runT > 0);
    if (showBodies) {
      for (const id of this.order) {
        const p = this.players.get(id);
        if (!p || p.st === 'dead' || p.st === 'out' || p.st === 'idle') continue;
        const b = this.bodyPos(p);
        if (!b) continue;
        let x = b.x, y = b.y, d;
        if (!b.remote) {
          x = lerp(b.px ?? b.x, b.x, alpha); y = lerp(b.py ?? b.y, b.y, alpha);
          d = this.drawPos(p, x, y, b);
        } else d = this.drawPos(p, x, y, null, p.st === 'goal' ? FRAME_NAMES.indexOf(frameFor('win', b, this.time)) : b.fi, b.face, b.h);
        const isMe = p.id === this.localPid;
        bodies.push({
          img: d.img, dx: d.dx, dy: d.dy, crouch: d.h < 20, ghosts: p.ghosts,
          name: this.demo ? null : this.online ? (isMe ? '나' : (p.title ? `「${p.title}」` : '') + p.name) : isMe ? '나' : null,
          slotColor: p.color, emote: p.emote, me: isMe, stun: b.remote ? !!b.sn : p.stunT > 0,
        });
      }
      bodies.sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0));
    }
    let sx = 0, sy = 0;
    if (this.shake > 0) { sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake; }
    const cam = { x: this.cam.x + sx, y: this.cam.y + sy, z: this.cam.z };
    const wt = this.phase === 'run' ? this.runT : this.time;
    this.renderer.draw({
      cam, t: wt, bodies, particles: this.particles,
      place: this.phase === 'place' && !this.demo ? this.placeView() : (this.phase === 'place' && this.demo ? { cursors: [] } : null),
      names: !this.demo, bounce: this.bounce,
      coins: this.phase === 'run' && this.coins ? this.coinView() : null,
    });
    // 이모티콘 말풍선
    if (bodies.some((b) => b.emote)) this.drawEmotes(bodies, cam);
  }
  coinView() {
    const me = this.players.get(this.localPid);
    let who = me && me.st === 'run' ? me : null;
    if (!who) { const runners = [...this.players.values()].filter((q) => q.st === 'run'); who = runners.length ? runners[((this.spec % runners.length) + runners.length) % runners.length] : me; }
    const taken = who && who.coinSet ? who.coinSet : null;
    return this.coins.filter((c, i) => !taken || !taken.has(i));
  }
  drawEmotes(bodies, cam) {
    const r = this.renderer, ctx = r.ctx;
    const k = r.S * cam.z;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const fs = Math.max(16, Math.round(r.S * 8));
    ctx.font = `${fs}px Galmuri11, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of bodies) {
      if (!b.emote) continue;
      const x = (b.dx + 10 - cam.x) * k, y = (b.dy - 6 - cam.y) * k - fs * 1.6;
      const w = ctx.measureText(b.emote).width + fs * 0.8;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x - w / 2), Math.round(y - fs * 0.75), Math.round(w), Math.round(fs * 1.5));
      ctx.fillRect(Math.round(x - 3), Math.round(y + fs * 0.75), 6, 5);
      ctx.fillStyle = '#1b1726'; ctx.fillText(b.emote, Math.round(x), Math.round(y + 1));
    }
  }
}
