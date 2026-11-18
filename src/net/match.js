// 매치 진행 (방장 기기에서만 실행되는 권한 로직)
import { rng } from '../core/util.js';
import { World } from '../engine/world.js';
import { makeBox, ITEMS } from '../data/items.js';
import { MAP_KEYS } from '../data/maps.js';
import { NavGraph } from '../ai/navgraph.js';
import { filterText } from '../ui/chat.js';
import { choosePlacement, pickScore, makeHeat, seedHeat, decayHeat, addHeat } from '../ai/placer.js';

export const LENGTHS = {
  short: { target: 15, rounds: 6, label: '짧게 (약 6분)' },
  normal: { target: 30, rounds: 12, label: '보통 (약 12분)' },
  long: { target: 45, rounds: 18, label: '길게 (약 18분)' },
};
export const PHASE_T = { pick: 15, place: 20, cd: 3, run: 60, result: 5.5 };
export const PTS = { goal: 5, kill: 2, coinsPerPoint: 3 };
export const MAX_PLAYERS = 6;

export class Match {
  constructor(settings, transport) {
    this.settings = Object.assign({ map: 'grass', length: 'normal', replace: true }, settings);
    this.tx = transport; // { broadcast(msg), sendTo(pid,msg) }
    this.players = [];
    this.phase = 'lobby';
    this.r = rng((Math.random() * 1e9) | 0);
    this.timer = 0;
    this.round = 0;
    this.overtime = false;
    this.nextPid = 1;
  }

  addPlayer(p) {
    const pl = Object.assign({ id: this.nextPid++, score: 0, ready: p.kind !== 'remote', connected: true, ping: 0, stats: { goals: 0, kills: 0 } }, p);
    this.players.push(pl);
    this.syncLobby();
    return pl;
  }
  removePlayer(pid) {
    const p = this.get(pid);
    if (!p) return;
    if (this.phase === 'lobby') {
      this.players = this.players.filter((x) => x.id !== pid);
      this.syncLobby();
      return;
    }
    p.connected = false;
    if (this.settings.replace) {
      p.kind = 'bot'; p.diff = 'normal'; p.connected = true;
      this.tx.broadcast({ t: 'left', pid, toBot: true });
    } else {
      this.tx.broadcast({ t: 'left', pid, toBot: false });
    }
    if (this.phase === 'run' && !this.results[pid]) this.finishPlayer(pid, { out: true });
    if (this.phase === 'pick' && !this.picks[pid] && p.kind === 'bot') this.botPickAt[pid] = this.timer + 1;
    if (this.phase === 'place' && !this.placed[pid] && p.kind === 'bot') this.botPlaceAt[pid] = this.timer + 1;
  }
  get(pid) { return this.players.find((p) => p.id === pid); }
  active() { return this.players.filter((p) => p.connected); }
  publicPlayers() {
    return this.players.map((p) => ({ id: p.id, name: p.name, title: p.title || '', persona: p.persona, look: p.look, kind: p.kind, diff: p.diff, ready: p.ready, ping: p.ping, score: p.score, connected: p.connected, slot: p.slot }));
  }
  syncLobby() {
    this.players.forEach((p, i) => { p.slot = i; });
    if (this.phase === 'lobby') this.tx.broadcast({ t: 'lobby', players: this.publicPlayers(), settings: this.settings });
  }
  setSettings(s) { Object.assign(this.settings, s); this.syncLobby(); }

  start() {
    const mapKey = this.settings.map === 'random' ? this.r.pick(MAP_KEYS) : this.settings.map;
    this.mapKey = mapKey;
    this.world = new World(mapKey);
    this.heat = makeHeat();
    this.seedPathHeat();
    const L = LENGTHS[this.settings.length] || LENGTHS.normal;
    this.target = L.target; this.maxRounds = L.rounds;
    this.round = 0; this.overtime = false; this.lastFlag = null; this.frontier = null;
    this.players.forEach((p, i) => { p.score = 0; p.slot = i; p.stats = { goals: 0, kills: 0 }; });
    this.tx.broadcast({ t: 'start', map: mapKey, target: this.target, maxRounds: this.maxRounds, players: this.publicPlayers() });
    this.phase = 'starting';
    this.timer = 0; this.phaseEnd = 1.2;
  }

  // 실제 최적 경로를 따라 열 지도를 채운다 (봇이 진짜 길목에 함정을 놓도록)
  seedPathHeat() {
    try {
      const g = new NavGraph(this.world);
      let n = 0;
      g.tracePath((x, y) => { addHeat(this.heat, Math.floor(x / 16), Math.floor(y / 16), 0.5); n++; });
      if (n < 5) seedHeat(this.heat, this.world);
    } catch (e) { seedHeat(this.heat, this.world); }
  }

  // ---------- 상자 ----------
  startPick() {
    this.round++;
    this.phase = 'pick';
    const act = this.active();
    const types = makeBox(act.length + 2, this.round, this.world.items.size, this.r);
    this.box = types.map((type) => ({ type, by: -1 }));
    this.picks = {}; this.botPickAt = {};
    this.timer = 0; this.phaseEnd = PHASE_T.pick; this.earlyEnd = 0;
    for (const p of act) if (p.kind === 'bot') {
      const [a, b] = p.diff === 'hard' ? [1, 3] : p.diff === 'easy' ? [3, 7] : [2, 5];
      this.botPickAt[p.id] = a + this.r() * (b - a);
    }
    this.tx.broadcast({ t: 'pick', round: this.round, box: types, dur: PHASE_T.pick, overtime: this.overtime });
  }
  doPick(pid, idx) {
    if (this.phase !== 'pick' || this.picks[pid]) return false;
    const it = this.box[idx];
    if (!it || it.by >= 0) return false;
    it.by = pid; this.picks[pid] = it.type;
    this.tx.broadcast({ t: 'picked', idx, pid });
    if (this.active().every((p) => this.picks[p.id])) this.earlyEnd = this.timer + 0.9;
    return true;
  }
  botPick(p) {
    const free = this.box.map((b, i) => [b, i]).filter(([b]) => b.by < 0);
    if (!free.length) return;
    let best = free[0][1], bs = -Infinity;
    for (const [b, i] of free) {
      const s = pickScore(b.type, p.diff, this.lastFlag, this.world.items.size, this.r);
      if (s > bs) { bs = s; best = i; }
    }
    this.doPick(p.id, best);
  }

  // ---------- 배치 ----------
  startPlace() {
    // 못 고른 사람은 남은 것 중 자동 선택
    for (const p of this.active()) if (!this.picks[p.id]) {
      const free = this.box.map((b, i) => [b, i]).filter(([b]) => b.by < 0);
      if (free.length) this.doPick(p.id, this.r.pick(free)[1]);
    }
    this.phase = 'place';
    this.placed = {}; this.botPlaceAt = {};
    this.timer = 0; this.phaseEnd = PHASE_T.place; this.earlyEnd = 0;
    for (const p of this.active()) if (p.kind === 'bot' && this.picks[p.id]) {
      const [a, b] = p.diff === 'hard' ? [2, 6] : p.diff === 'easy' ? [3, 11] : [2.5, 8];
      this.botPlaceAt[p.id] = a + this.r() * (b - a);
    }
    this.tx.broadcast({ t: 'place', picks: this.picks, dur: PHASE_T.place });
  }
  doPlace(pid, m) {
    if (this.phase !== 'place' || this.placed[pid] || !this.picks[pid]) return false;
    const type = this.picks[pid];
    const w = this.world;
    const { x, y, rot } = m;
    if (!w.canPlace(type, x, y, rot)) { this.tx.sendTo(pid, { t: 'placeFail' }); return false; }
    const item = { id: w.nextId++, type, x, y, rot, owner: pid };
    w.place(item);
    this.placed[pid] = true;
    this.tx.broadcast({ t: 'placed', item });
    if (this.active().every((p) => this.placed[p.id] || !this.picks[p.id])) this.earlyEnd = this.timer + 1;
    return true;
  }
  botPlace(p) {
    const type = this.picks[p.id];
    const pos = choosePlacement(this.world, type, p.diff, this.heat, { lastFlag: this.lastFlag, frontier: this.frontier, owner: p.id }, this.r);
    if (pos) this.doPlace(p.id, pos);
    else this.placed[p.id] = true;
  }

  // ---------- 달리기 ----------
  startRun() {
    this.phase = 'run';
    this.results = {};
    this.coinN = {};
    this.runOrder = 0;
    this.maxX = {};
    this.timer = 0; this.phaseEnd = PHASE_T.cd + PHASE_T.run + 0.4; this.earlyEnd = 0;
    decayHeat(this.heat);
    this.tx.broadcast({ t: 'run', cd: PHASE_T.cd, dur: PHASE_T.run, round: this.round });
  }
  finishPlayer(pid, res) {
    if (this.phase !== 'run' || this.results[pid]) return;
    if (res.goal) res.order = ++this.runOrder;
    this.results[pid] = res;
    this.tx.broadcast({ t: 'fin', pid, res });
    if (this.active().every((p) => this.results[p.id])) this.earlyEnd = this.timer + 1.4;
  }
  onHeat(cx, cy, pid) {
    addHeat(this.heat, cx, cy, 0.05);
    if (!this.frontier || cx > this.frontier.x) this.frontier = { x: cx, y: cy };
  }

  endRun() {
    const act = this.players.filter((p) => this.results[p.id] || p.connected);
    const gains = {};
    let goals = 0;
    for (const p of act) gains[p.id] = { goal: 0, kills: 0, coin: Math.floor((this.coinN[p.id] || 0) / PTS.coinsPerPoint) };
    for (const p of act) {
      const r = this.results[p.id];
      if (!r) continue;
      if (r.goal) { gains[p.id].goal = PTS.goal; goals++; }
      if (r.dead && r.killer > 0) {
        const it = this.world.items.get(r.killer);
        if (it && it.owner !== p.id && gains[it.owner]) gains[it.owner].kills += PTS.kill;
      }
    }
    const participants = act.filter((p) => p.connected || this.results[p.id]);
    let flag = null;
    if (participants.length > 0 && goals === participants.length) {
      flag = 'easy';
      for (const k in gains) { gains[k].goal = 0; gains[k].kills = 0; gains[k].coin = 0; }
    } else if (goals === 0) flag = 'fail';
    for (const p of this.players) {
      const g = gains[p.id];
      if (!g) continue;
      p.score += g.goal + g.kills + g.coin;
      if (g.goal) p.stats.goals++;
      p.stats.kills += g.kills / PTS.kill;
    }
    this.lastFlag = flag;
    if (flag !== 'fail') this.frontier = null;
    if (flag === 'easy') this.seedPathHeat();
    this.phase = 'result';
    this.timer = 0; this.phaseEnd = PHASE_T.result; this.earlyEnd = 0;
    this.tx.broadcast({ t: 'result', gains, scores: this.players.map((p) => [p.id, p.score]), flag, round: this.round });
  }

  checkEnd() {
    const top = Math.max(...this.players.map((p) => p.score));
    const leaders = this.players.filter((p) => p.score === top);
    const reached = top >= this.target || this.round >= this.maxRounds;
    if (!reached) return false;
    if (leaders.length > 1 && !this.overtime) { this.overtime = true; return false; }
    this.phase = 'end';
    this.tx.broadcast({
      t: 'end', winners: leaders.map((p) => p.id),
      scores: this.players.map((p) => [p.id, p.score]),
      stats: Object.fromEntries(this.players.map((p) => [p.id, p.stats])),
    });
    return true;
  }

  // ---------- 메시지 ----------
  handle(pid, m) {
    const p = this.get(pid);
    if (!p) return;
    switch (m.t) {
      case 'pickReq': this.doPick(pid, m.idx); break;
      case 'placeReq': this.doPlace(pid, m); break;
      case 'cursor': if (this.phase === 'place') this.tx.broadcast({ t: 'cursor', pid, x: m.x, y: m.y, rot: m.rot }, pid); break;
      case 'fin': this.finishPlayer(pid, m.res); break;
      case 'emote': this.tx.broadcast({ t: 'emote', pid, e: String(m.e).slice(0, p.kind === 'bot' ? 10 : 4) }); break;
      case 'chat': {
        // 도배 방지: 0.7초 간격, 5초에 5개까지
        const now = Date.now();
        p.chatT = (p.chatT || []).filter((x) => now - x < 5000);
        if (p.chatT.length >= 5 || (p.chatT.length && now - p.chatT[p.chatT.length - 1] < 700)) { this.tx.sendTo(pid, { t: 'chat', sys: true, text: '메시지를 너무 빨리 보내고 있어요.' }); break; }
        const text = filterText(m.text);
        if (!text) break;
        p.chatT.push(now);
        this.tx.broadcast({ t: 'chat', pid, name: p.name, text });
        break;
      }
      case 'coin': if (this.phase === 'run') this.coinN[pid] = Math.max(0, Math.min(20, m.n | 0)); break;
      case 'stomp': if (this.phase === 'run' && this.get(m.target) && !this.results[m.target]) this.tx.broadcast({ t: 'stomped', pid: m.target, by: pid }); break;
      case 'ready': p.ready = !!m.r; this.syncLobby(); break;
    }
  }

  tick(dt) {
    if (this.phase === 'lobby' || this.phase === 'end') return;
    this.timer += dt;
    const over = this.timer >= this.phaseEnd || (this.earlyEnd && this.timer >= this.earlyEnd);
    switch (this.phase) {
      case 'starting': if (over) this.startPick(); break;
      case 'pick':
        for (const id in this.botPickAt) if (this.timer >= this.botPickAt[id]) { delete this.botPickAt[id]; const p = this.get(+id); if (p && p.kind === 'bot') this.botPick(p); }
        if (over) this.startPlace();
        break;
      case 'place':
        for (const id in this.botPlaceAt) if (this.timer >= this.botPlaceAt[id]) { delete this.botPlaceAt[id]; const p = this.get(+id); if (p && p.kind === 'bot') this.botPlace(p); }
        if (over) this.startRun();
        break;
      case 'run':
        if (over) {
          for (const p of this.active()) if (!this.results[p.id]) this.results[p.id] = { timeout: true };
          this.endRun();
        }
        break;
      case 'result':
        if (over && !this.checkEnd()) this.startPick();
        break;
    }
  }
}
