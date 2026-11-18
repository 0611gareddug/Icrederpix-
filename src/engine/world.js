// 월드: 지형 격자 + 배치된 아이템 + 시간 기반 함정 계산
import { TILE, rectsOverlap, circleRect, mod } from '../core/util.js';
import { ITEMS, itemCells, phaseOf } from '../data/items.js';
import { MAPS } from '../data/maps.js';

export const W = 72, H = 20;
export const S_NONE = 0, S_SOLID = 1, S_ONEWAY = 2, S_LADTOP = 3;
export const SF = { NONE: 0, ICE: 1, STICKY: 2, CONV_L: 3, CONV_R: 4, TRAMP_U: 5, TRAMP_R: 6, TRAMP_L: 7, CRUMBLE: 8, WOOD: 9, TERRAIN: 10, CLOUD: 11, BOOST_R: 12, BOOST_L: 13, GHOST: 14, POISON: 15, STONE: 16, SAND: 17 };
export const T_EMPTY = 0, T_SOLID = 1, T_ONEWAY = 2, T_ICE = 3, T_LAVA = 4, T_CONV_R = 5, T_CONV_L = 6, T_SAND = 7, T_PRESS = 8;
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const ENV_KILL = -1;

const ARROW_SPEED = 150;
const BALL_SPEED = 72;

export class World {
  constructor(mapKey) {
    const def = MAPS[mapKey];
    this.key = mapKey;
    this.def = def;
    this.theme = def.theme;
    this.terrain = new Uint8Array(W * H);
    this.icicles = [];
    this.presses = [];
    this.lavaBase = -1;
    for (let y = 0; y < H; y++) {
      const row = def.rows[y];
      for (let x = 0; x < W; x++) {
        const c = row[x];
        const i = y * W + x;
        if (c === '#') this.terrain[i] = T_SOLID;
        else if (c === '=') this.terrain[i] = T_ONEWAY;
        else if (c === 'I') this.terrain[i] = T_ICE;
        else if (c === 'L') { this.terrain[i] = T_LAVA; if (this.lavaBase < 0) this.lavaBase = y * TILE; }
        else if (c === 'S') this.spawnCell = { x, y };
        else if (c === 'G') this.goalCell = { x, y };
        else if (c === 'v') this.icicles.push({ x, y });
        else if (c === '>') this.terrain[i] = T_CONV_R;
        else if (c === '<') this.terrain[i] = T_CONV_L;
        else if (c === 's') this.terrain[i] = T_SAND;
        else if (c === 'P') { this.terrain[i] = T_PRESS; this.presses.push({ x, y, phase: this.presses.length * 1.1 + 0.3, ray: 0 }); }
      }
    }
    this.hasLava = this.lavaBase >= 0;
    this.hasWind = def.theme === 'sky' || def.theme === 'desert';
    this.storm = def.theme === 'desert';
    this.gravScale = def.gravity || 1;
    this.spawn = { x: this.spawnCell.x * TILE + 8, y: (this.spawnCell.y + 1) * TILE };
    const g = this.goalCell;
    this.goalRect = { x: g.x * TILE + 3, y: g.y * TILE - 14, w: 10, h: 30 };
    // 출발 지점 보호 구역: 이 안에서는 모든 공격이 막히고 발사체도 멈춰요
    const sc = this.spawnCell;
    this.safeRect = { x: (sc.x - 2) * TILE, y: (sc.y - 3) * TILE, w: 5 * TILE, h: 6 * TILE };
    this.safeCell = new Uint8Array(W * H);
    for (let y = sc.y - 3; y <= sc.y + 2; y++)
      for (let x = sc.x - 2; x <= sc.x + 2; x++)
        if (x >= 0 && y >= 0 && x < W && y < H) this.safeCell[y * W + x] = 1;
    this.noBuild = new Uint8Array(W * H);
    for (const c of [this.spawnCell, this.goalCell]) {
      for (let y = c.y - 3; y <= c.y + 2; y++)
        for (let x = c.x - 2; x <= c.x + 2; x++)
          if (x >= 0 && y >= 0 && x < W && y < H) this.noBuild[y * W + x] = 1;
    }
    this.items = new Map();
    this.nextId = 1;
    this.solid = new Uint8Array(W * H);
    this.surf = new Uint8Array(W * H);
    this.ladder = new Uint8Array(W * H);
    this.occ = new Int32Array(W * H);
    this.crS = new Uint8Array(W * H); // 0 정상 1 흔들림 2 부서짐
    this.crT = new Float32Array(W * H);
    this.version = 0;
    this.mineT = new Map(); this.mineBoomed = new Set();
    this.now = 0; this.staticMode = false; this.ignore = null;
    this.rebuild();
  }

  idx(x, y) { return y * W + x; }

  rebuild() {
    const { terrain, solid, surf, ladder, occ } = this;
    solid.fill(0); surf.fill(0); ladder.fill(0); occ.fill(-1);
    for (let i = 0; i < W * H; i++) {
      const t = terrain[i];
      if (t === T_SOLID) { solid[i] = S_SOLID; surf[i] = SF.TERRAIN; occ[i] = -2; }
      else if (t === T_ONEWAY) { solid[i] = S_ONEWAY; surf[i] = SF.TERRAIN; occ[i] = -2; }
      else if (t === T_ICE) { solid[i] = S_SOLID; surf[i] = SF.ICE; occ[i] = -2; }
      else if (t === T_LAVA) { occ[i] = -2; }
      else if (t === T_CONV_R || t === T_CONV_L) { solid[i] = S_SOLID; surf[i] = t === T_CONV_R ? SF.CONV_R : SF.CONV_L; occ[i] = -2; }
      else if (t === T_SAND) { solid[i] = S_SOLID; surf[i] = SF.SAND; occ[i] = -2; }
      else if (t === T_PRESS) { solid[i] = S_SOLID; surf[i] = SF.TERRAIN; occ[i] = -2; }
    }
    for (const ic of this.icicles) occ[ic.y * W + ic.x] = -2;
    this.spikes = []; this.saws = []; this.arrows = []; this.flames = [];
    this.maces = []; this.lasers = []; this.holes = []; this.movers = [];
    this.crumbles = [];
    this.fans = []; this.ghosts = []; this.ghostAt = new Map(); this.webs = []; this.gravs = [];
    this.cannons = []; this.crushers = []; this.poisons = []; this.sawrails = []; this.mines = [];
    for (const it of this.items.values()) {
      for (const [cx, cy] of itemCells(it.type, it.x, it.y, it.rot)) occ[cy * W + cx] = it.id;
      const i = it.y * W + it.x;
      switch (it.type) {
        case 'wood': solid[i] = S_SOLID; surf[i] = SF.WOOD; break;
        case 'ice': solid[i] = S_SOLID; surf[i] = SF.ICE; break;
        case 'sticky': solid[i] = S_SOLID; surf[i] = SF.STICKY; break;
        case 'crumble': solid[i] = S_SOLID; surf[i] = SF.CRUMBLE; this.crumbles.push(i); break;
        case 'longplat': for (let k = 0; k < 3; k++) { solid[i + k] = S_ONEWAY; surf[i + k] = SF.WOOD; } break;
        case 'conveyor': for (let k = 0; k < 3; k++) { solid[i + k] = S_SOLID; surf[i + k] = it.rot === 1 ? SF.CONV_R : SF.CONV_L; } break;
        case 'tramp': solid[i] = S_SOLID; surf[i] = it.rot === 0 ? SF.TRAMP_U : it.rot === 1 ? SF.TRAMP_R : SF.TRAMP_L; break;
        case 'ladder': for (let k = 0; k < 3; k++) ladder[i + k * W] = 1; break;
        case 'spike': solid[i] = S_SOLID; surf[i] = SF.WOOD; this.spikes.push(it); break;
        case 'arrow': solid[i] = S_SOLID; surf[i] = SF.WOOD; this.arrows.push(it); break;
        case 'flame': solid[i] = S_SOLID; surf[i] = SF.WOOD; this.flames.push(it); break;
        case 'laser': solid[i] = S_SOLID; surf[i] = SF.WOOD; this.lasers.push(it); break;
        case 'saw': this.saws.push(it); break;
        case 'mace': this.maces.push(it); break;
        case 'blackhole': this.holes.push(it); break;
        case 'movplat': this.movers.push(it); break;
        case 'cloud': solid[i] = S_ONEWAY; surf[i] = SF.CLOUD; this.crumbles.push(i); break;
        case 'booster': solid[i] = S_SOLID; surf[i] = it.rot === 1 ? SF.BOOST_R : SF.BOOST_L; break;
        case 'lowgrav': this.gravs.push({ x: it.x * TILE, y: it.y * TILE, w: 48, h: 48 }); break;
        case 'bigstone': for (const k of [0, 1, W, W + 1]) { solid[i + k] = S_SOLID; surf[i + k] = SF.STONE; } break;
        case 'fan': solid[i] = S_SOLID; surf[i] = SF.WOOD; this.fans.push(it); break;
        case 'ghost': solid[i] = S_SOLID; surf[i] = SF.GHOST; this.ghosts.push(it); this.ghostAt.set(i, it); break;
        case 'web': this.webs.push({ x: it.x * TILE + 2, y: it.y * TILE + 2, w: 28, h: 28 }); break;
        case 'cannon': solid[i] = S_SOLID; surf[i] = SF.WOOD; this.cannons.push(it); break;
        case 'crusher': solid[i] = S_SOLID; surf[i] = SF.WOOD; this.crushers.push(it); break;
        case 'poison': solid[i] = S_SOLID; surf[i] = SF.POISON; this.poisons.push(it); break;
        case 'sawrail': this.sawrails.push(it); break;
        case 'mine': this.mines.push(it); break;
      }
    }
    // 사다리 꼭대기는 한쪽 통과 발판처럼 동작
    for (let i = 0; i < W * H; i++) {
      if (ladder[i] && solid[i] === 0) {
        const up = i - W;
        if (up < 0 || !ladder[up]) solid[i] = S_LADTOP;
      }
    }
    // 광선 길이 미리 계산
    for (const it of this.arrows) it.ray = this.ray(it.x, it.y, it.rot, 40) * TILE;
    for (const it of this.flames) it.ray = Math.min(3, this.ray(it.x, it.y, it.rot, 3)) * TILE;
    for (const it of this.lasers) it.ray = this.ray(it.x, it.y, it.rot, 20) * TILE;
    for (const ic of this.icicles) ic.fall = this.ray(ic.x, ic.y - 1, 2, 30) * TILE;
    for (const it of this.fans) it.ray = this.ray(it.x, it.y, it.rot, 5) * TILE;
    for (const it of this.cannons) it.ray = this.ray(it.x, it.y, it.rot, 24) * TILE;
    for (const it of this.crushers) it.ray = Math.min(4, this.ray(it.x, it.y, 2, 4)) * TILE;
    for (const pr of this.presses) pr.ray = Math.min(6, this.ray(pr.x, pr.y, 2, 6)) * TILE;
    for (const it of this.items.values()) if (it.phase === undefined) it.phase = phaseOf(it.id, it.type);
    // AI용 정적 위험 칸
    this.hazCell = new Uint8Array(W * H);
    const mark = (x, y, r) => {
      for (let j = y - r; j <= y + r; j++) for (let i = x - r; i <= x + r; i++)
        if (i >= 0 && j >= 0 && i < W && j < H) this.hazCell[j * W + i] = 1;
    };
    for (const it of this.spikes) mark(it.x, it.y, 1);
    for (const it of this.saws) mark(it.x, it.y, 1);
    for (const it of this.holes) mark(it.x, it.y, 1);
    for (const it of this.poisons) mark(it.x, it.y, 1);
    this.version++;
  }

  // 셀에서 방향으로 몇 칸 비어 있는지
  ray(x, y, rot, max) {
    const [dx, dy] = DIRS[rot];
    let n = 0;
    let cx = x + dx, cy = y + dy;
    while (n < max) {
      if (cx < 0 || cx >= W || cy >= H || cy < -2) break;
      if (cy >= 0 && (this.solid[cy * W + cx] === S_SOLID || this.safeCell[cy * W + cx])) break;
      n++; cx += dx; cy += dy;
    }
    return n;
  }

  solidAt(tx, ty) {
    if (tx < 0 || tx >= W) return S_SOLID;
    if (ty < 0 || ty >= H) return S_NONE;
    const i = ty * W + tx;
    const s = this.solid[i];
    if (!s) return s;
    const sf = this.surf[i];
    if ((sf === SF.CRUMBLE || sf === SF.CLOUD) && this.crS[i] === 2) return S_NONE;
    if (sf === SF.GHOST && !this.staticMode) {
      if (!this.ghostSolid(this.ghostAt.get(i), this.now)) return S_NONE;
      const r = this.ignore;
      if (r && r.x < tx * TILE + 16 && r.x + r.w > tx * TILE && r.y < ty * TILE + 16 && r.y + r.h > ty * TILE) return S_NONE;
    }
    return s;
  }
  surfAt(tx, ty) {
    if (tx < 0 || tx >= W || ty < 0 || ty >= H) return 0;
    return this.surf[ty * W + tx];
  }
  ladderAt(tx, ty) {
    if (tx < 0 || tx >= W || ty < 0 || ty >= H) return 0;
    return this.ladder[ty * W + tx];
  }

  // ---------- 시간 기반 요소 ----------
  moverRect(it, t) {
    const p = (t + (it.phase || 0)) / 4;
    const off = 64 * (0.5 - 0.5 * Math.cos(p * Math.PI * 2));
    const x = it.x * TILE + (it.rot === 0 ? off : 0);
    const y = it.y * TILE - (it.rot === 1 ? off : 0);
    return { x, y, w: 32, h: 8 };
  }
  lavaTop(t) {
    if (!this.hasLava) return 1e9;
    const p = mod(t, 10);
    let k = 0;
    if (p >= 6 && p < 7) k = p - 6;
    else if (p >= 7 && p < 9) k = 1;
    else if (p >= 9) k = 10 - p;
    return this.lavaBase - 16 * k;
  }
  wind(t) {
    if (!this.hasWind) return null;
    if (this.storm) {
      // 모래폭풍: 12초 주기, 1초 예고 후 4초 동안 왼쪽으로 밀어요
      const p = mod(t, 12);
      return { dir: -1, active: p >= 7 && p < 11, warn: p >= 6 && p < 7, p, sand: true };
    }
    const p = mod(t, 8);
    const dir = Math.floor(t / 8) % 2 ? -1 : 1;
    return { dir, active: p >= 4 && p < 7, warn: p >= 3 && p < 4, p };
  }
  flameState(it, t) {
    const p = mod(t + it.phase, 3);
    return p >= 1.5 ? 2 : p >= 0.9 ? 1 : 0; // 2 분사, 1 예고(0.6초)
  }
  laserState(it, t) {
    const p = mod(t + it.phase, 3.7);
    return p >= 2.8 ? 2 : p >= 2 ? 1 : 0; // 조준 0.8초, 발사 0.9초
  }
  maceBall(it, t) {
    const a = (t + (it.phase || 0)) / 4 * Math.PI * 2;
    return { x: it.x * TILE + 8 + Math.cos(a) * 34, y: it.y * TILE + 8 + Math.sin(a) * 34 };
  }
  // 화살 목록 콜백 (x,y,w,h)
  forArrows(it, t, cb) {
    const tt = t - it.phase;
    const travel = it.ray / ARROW_SPEED;
    const [dx, dy] = DIRS[it.rot];
    const mx = it.x * TILE + 8 + dx * 8, my = it.y * TILE + 8 + dy * 8;
    const k1 = Math.floor(tt / 2), k0 = Math.floor((tt - travel) / 2);
    for (let k = Math.max(0, k0); k <= k1; k++) {
      const age = tt - k * 2;
      if (age < 0 || age > travel) continue;
      const head = age * ARROW_SPEED;
      const hx = mx + dx * head, hy = my + dy * head;
      if (dx) cb(dx > 0 ? hx - 9 : hx, hy - 1.5, 9, 3, dx, dy);
      else cb(hx - 1.5, dy > 0 ? hy - 9 : hy, 3, 9, dx, dy);
    }
  }
  // 화살 발사 직전 (발사기 깜빡임)
  arrowWarn(it, t) { return mod(t - it.phase, 2) > 1.7; }
  // 포탄 목록 콜백 (중심 x,y)
  forBalls(it, t, cb) {
    const tt = t - (it.phase || 0);
    const travel = it.ray / BALL_SPEED;
    const dx = it.rot === 1 ? 1 : -1;
    const mx = it.x * TILE + 8 + dx * 8, my = it.y * TILE + 8;
    const k1 = Math.floor(tt / 3), k0 = Math.floor((tt - travel) / 3);
    for (let k = Math.max(0, k0); k <= k1; k++) {
      const age = tt - k * 3;
      if (age < 0 || age > travel) continue;
      cb(mx + dx * age * BALL_SPEED, my, age);
    }
  }
  cannonWarn(it, t) { return mod(t - (it.phase || 0), 3) > 2.6; }
  ghostSolid(it, t) { return !it || mod(t + (it.phase || 0), 4) < 2; }
  ghostWarn(it, t) { const p = mod(t + (it.phase || 0), 4); return p >= 1.5 && p < 2; }
  // 쿵쿵이: 내려온 거리, 흔들림 여부
  crusherState(it, t) {
    const p = mod(t + (it.phase || 0), 3), L = it.ray || 0;
    if (p < 1.4) return { d: 0, shake: false };
    if (p < 1.8) return { d: 0, shake: true };
    if (p < 2.05) { const k = (p - 1.8) / 0.25; return { d: L * k * k, fall: true }; }
    if (p < 2.55) return { d: L, down: true };
    return { d: L * (1 - (p - 2.55) / 0.45) };
  }
  sawRailPos(it, t) {
    const off = 64 * (0.5 - 0.5 * Math.cos(((t + (it.phase || 0)) / 4) * Math.PI * 2));
    return { x: it.x * TILE + 8 + (it.rot === 0 ? off : 0), y: it.y * TILE + 8 - (it.rot === 1 ? off : 0) };
  }
  mineState(it, t) {
    const tr = this.mineT.get(it.id);
    if (tr === undefined) return 0;
    const a = t - tr;
    if (a < 0.5) return 1; // 작동 중
    if (a < 0.7) return 2; // 폭발
    if (a < 3.5) return 3; // 재장전
    return 0;
  }
  beamRect(it, len, wid) {
    const [dx, dy] = DIRS[it.rot];
    const cx = it.x * TILE + 8, cy = it.y * TILE + 8;
    if (dx > 0) return { x: cx + 8, y: cy - wid / 2, w: len, h: wid };
    if (dx < 0) return { x: cx - 8 - len, y: cy - wid / 2, w: len, h: wid };
    if (dy > 0) return { x: cx - wid / 2, y: cy + 8, w: wid, h: len };
    return { x: cx - wid / 2, y: cy - 8 - len, w: wid, h: len };
  }
  icicleState(i, ic, t) {
    const p = mod(t + i * 1.9 + 0.5, 7);
    if (p < 5) return { y: 0, shake: p > 4.2, on: true };
    const d = 0.5 * 700 * (p - 5) * (p - 5);
    if (d > ic.fall) return { y: 0, on: false };
    return { y: d, on: true, falling: true };
  }

  // 함정 판정: 아이템 id(>=1) / ENV_KILL / undefined
  hazard(b, t, staticOnly = false) {
    const bx = b.x, by = b.y, bw = b.w, bh = b.h;
    if (by > H * TILE + 8) return ENV_KILL;
    if (this.hasLava) {
      const top = staticOnly ? this.lavaBase - 16 : this.lavaTop(t);
      if (by + bh > top + 5) return ENV_KILL;
    }
    if (this.inSafe(b)) return undefined;
    for (const it of this.spikes) {
      const x = it.x * TILE, y = it.y * TILE;
      let r;
      switch (it.rot) {
        case 0: r = [x + 1, y - 1, 14, 1.5]; break;
        case 1: r = [x + 15, y + 1, 1.5, 14]; break;
        case 2: r = [x + 1, y + 15, 14, 1.5]; break;
        default: r = [x - 0.5, y + 1, 1.5, 14];
      }
      if (rectsOverlap(bx, by, bw, bh, r[0], r[1], r[2], r[3])) return it.id;
    }
    for (const it of this.saws) if (circleRect(it.x * TILE + 8, it.y * TILE + 8, 6.5, bx, by, bw, bh)) return it.id;
    for (const it of this.holes) if (circleRect(it.x * TILE + 8, it.y * TILE + 8, 4, bx, by, bw, bh)) return it.id;
    for (const it of this.poisons) {
      const x = it.x * TILE, y = it.y * TILE;
      if (rectsOverlap(bx, by, bw, bh, x + 1, y - 1, 14, 18) || rectsOverlap(bx, by, bw, bh, x - 1, y + 1, 18, 14)) return it.id;
    }
    if (staticOnly) return undefined;
    for (const it of this.sawrails) {
      const p = this.sawRailPos(it, t);
      if (circleRect(p.x, p.y, 6.5, bx, by, bw, bh)) return it.id;
    }
    for (const pr of this.presses) {
      const st = this.crusherState(pr, t);
      if (st.d > 2 && rectsOverlap(bx, by, bw, bh, pr.x * TILE + 1, pr.y * TILE + st.d, 14, 16)) return ENV_KILL;
    }
    for (const it of this.crushers) {
      const st = this.crusherState(it, t);
      if (st.d > 2 && rectsOverlap(bx, by, bw, bh, it.x * TILE + 1, it.y * TILE + st.d, 14, 16)) return it.id;
    }
    for (const it of this.mines) {
      if (this.mineState(it, t) === 2 && circleRect(it.x * TILE + 8, it.y * TILE + 13, 26, bx, by, bw, bh)) return it.id;
    }
    let ball;
    for (const it of this.cannons) {
      if (ball) break;
      this.forBalls(it, t, (x, y) => { if (!ball && circleRect(x, y, 5, bx, by, bw, bh)) ball = it.id; });
    }
    if (ball) return ball;
    for (const it of this.maces) {
      const p = this.maceBall(it, t);
      if (circleRect(p.x, p.y, 6.5, bx, by, bw, bh)) return it.id;
    }
    for (const it of this.flames) {
      if (it.ray <= 0 || this.flameState(it, t) !== 2) continue;
      const r = this.beamRect(it, it.ray, 10);
      if (rectsOverlap(bx, by, bw, bh, r.x, r.y, r.w, r.h)) return it.id;
    }
    for (const it of this.lasers) {
      if (it.ray <= 0 || this.laserState(it, t) !== 2) continue;
      const r = this.beamRect(it, it.ray, 6);
      if (rectsOverlap(bx, by, bw, bh, r.x, r.y, r.w, r.h)) return it.id;
    }
    let hit;
    for (const it of this.arrows) {
      if (hit) break;
      this.forArrows(it, t, (x, y, w, h) => { if (!hit && rectsOverlap(bx, by, bw, bh, x, y, w, h)) hit = it.id; });
    }
    if (hit) return hit;
    for (let i = 0; i < this.icicles.length; i++) {
      const ic = this.icicles[i];
      const s = this.icicleState(i, ic, t);
      if (!s.on) continue;
      if (rectsOverlap(bx, by, bw, bh, ic.x * TILE + 5, ic.y * TILE + s.y, 6, 11)) return ENV_KILL;
    }
    return undefined;
  }

  inSafe(b) {
    const r = this.safeRect, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h;
  }

  touchGoal(b) {
    const g = this.goalRect;
    return rectsOverlap(b.x, b.y, b.w, b.h, g.x, g.y, g.w, g.h);
  }

  // 무너지는 발판
  onStand(i) {
    const sf = this.surf[i];
    if ((sf === SF.CRUMBLE || sf === SF.CLOUD) && this.crS[i] === 0) { this.crS[i] = 1; this.crT[i] = 0; }
  }
  // 무너지는 발판·구름·지뢰 상태 (t: 달리기 시간)
  updateDynamic(dt, t, bodies) {
    for (const it of this.mines) {
      const st = this.mineState(it, t);
      if (st === 0) {
        const x = it.x * TILE, y = it.y * TILE + 8;
        for (const b of bodies) if (rectsOverlap(b.x, b.y, b.w, b.h, x + 1, y, 14, 8)) { this.mineT.set(it.id, t); this.onMineArm && this.onMineArm(it); break; }
      } else if (st === 2 && !this.mineBoomed.has(it.id)) { this.mineBoomed.add(it.id); this.onMineBoom && this.onMineBoom(it); }
      else if (st === 3) this.mineBoomed.delete(it.id);
    }
    for (const i of this.crumbles) {
      const s = this.crS[i];
      const cloud = this.surf[i] === SF.CLOUD;
      if (s === 1) {
        this.crT[i] += dt;
        if (this.crT[i] >= (cloud ? 1 : 0.5)) { this.crS[i] = 2; this.crT[i] = 0; this.onCrumble && this.onCrumble(i, cloud); }
      } else if (s === 2) {
        this.crT[i] += dt;
        if (this.crT[i] >= (cloud ? 2.5 : 3)) {
          const x = (i % W) * TILE, y = Math.floor(i / W) * TILE;
          let blocked = false;
          for (const b of bodies) if (rectsOverlap(b.x, b.y, b.w, b.h, x, y, 16, 16)) blocked = true;
          if (!blocked) { this.crS[i] = 0; this.crT[i] = 0; }
        }
      }
    }
  }
  resetDynamic() { this.crS.fill(0); this.crT.fill(0); this.mineT.clear(); this.mineBoomed.clear(); }

  // ---------- 배치 ----------
  canPlace(type, x, y, rot) {
    const d = ITEMS[type];
    if (!d || !d.rots.includes(rot)) return false;
    if (type === 'bomb' || type === 'tbomb') return x >= 0 && y >= 0 && x < W && y < H;
    if (type === 'hammer') return x >= 0 && y >= 0 && x < W && y < H && this.occ[y * W + x] > 0;
    const cells = itemCells(type, x, y, rot);
    for (const [cx, cy] of cells) {
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) return false;
      const i = cy * W + cx;
      if (this.noBuild[i] || this.occ[i] !== -1) return false;
    }
    return true;
  }
  cellFree(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = y * W + x;
    return !this.noBuild[i] && this.occ[i] === -1;
  }
  place(it) {
    if (it.type === 'bomb') return this.bomb(it.x, it.y);
    if (it.type === 'hammer') return this.hammer(it.x, it.y);
    if (it.type === 'tbomb') return this.tbomb(it.x, it.y);
    this.items.set(it.id, it);
    this.nextId = Math.max(this.nextId, it.id + 1);
    this.rebuild();
    return [];
  }
  hammer(x, y) {
    const id = this.occ[y * W + x];
    if (id > 0) { this.items.delete(id); this.rebuild(); return [id]; }
    return [];
  }
  // 지형까지 부수는 폭탄 (출발·골 주변 보호)
  tbomb(x, y) {
    const removed = this.bomb(x, y, true);
    let broke = 0;
    for (let j = y - 2; j <= y + 2; j++) for (let i = x - 2; i <= x + 2; i++) {
      if (i < 0 || j < 0 || i >= W || j >= H || (i - x) ** 2 + (j - y) ** 2 > 6.25) continue;
      const k = j * W + i;
      if (this.noBuild[k] || this.safeCell[k]) continue;
      const t = this.terrain[k];
      if (t !== T_EMPTY && t !== T_LAVA && t !== T_PRESS) { this.terrain[k] = T_EMPTY; broke++; }
    }
    this.presses = this.presses.filter((p) => this.terrain[p.y * W + p.x] === T_PRESS);
    this.convCells = null;
    this.rebuild();
    return removed;
  }
  bomb(x, y, noRebuild) {
    const removed = [];
    for (const it of this.items.values()) {
      const cells = itemCells(it.type, it.x, it.y, it.rot);
      if (cells.some(([cx, cy]) => (cx - x) ** 2 + (cy - y) ** 2 <= 6.25)) removed.push(it.id);
    }
    for (const id of removed) this.items.delete(id);
    if (!noRebuild) this.rebuild();
    return removed;
  }
}
