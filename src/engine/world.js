// 월드: 지형 격자 + 배치된 아이템 + 시간 기반 함정 계산
import { TILE, rectsOverlap, circleRect, mod } from '../core/util.js';
import { ITEMS, itemCells, phaseOf } from '../data/items.js';
import { MAPS } from '../data/maps.js';

export const W = 48, H = 20;
export const S_NONE = 0, S_SOLID = 1, S_ONEWAY = 2, S_LADTOP = 3;
export const SF = { NONE: 0, ICE: 1, STICKY: 2, CONV_L: 3, CONV_R: 4, TRAMP_U: 5, TRAMP_R: 6, TRAMP_L: 7, CRUMBLE: 8, WOOD: 9, TERRAIN: 10 };
export const T_EMPTY = 0, T_SOLID = 1, T_ONEWAY = 2, T_ICE = 3, T_LAVA = 4;
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const ENV_KILL = -1;

const ARROW_SPEED = 150;

export class World {
  constructor(mapKey) {
    const def = MAPS[mapKey];
    this.key = mapKey;
    this.def = def;
    this.theme = def.theme;
    this.terrain = new Uint8Array(W * H);
    this.icicles = [];
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
      }
    }
    this.hasLava = this.lavaBase >= 0;
    this.hasWind = def.theme === 'sky';
    this.spawn = { x: this.spawnCell.x * TILE + 8, y: (this.spawnCell.y + 1) * TILE };
    const g = this.goalCell;
    this.goalRect = { x: g.x * TILE + 3, y: g.y * TILE - 14, w: 10, h: 30 };
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
    }
    for (const ic of this.icicles) occ[ic.y * W + ic.x] = -2;
    this.spikes = []; this.saws = []; this.arrows = []; this.flames = [];
    this.maces = []; this.lasers = []; this.holes = []; this.movers = [];
    this.crumbles = [];
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
    for (const it of this.lasers) it.ray = this.ray(it.x, it.y, it.rot, 48) * TILE;
    for (const ic of this.icicles) ic.fall = this.ray(ic.x, ic.y - 1, 2, 30) * TILE;
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
    this.version++;
  }

  // 셀에서 방향으로 몇 칸 비어 있는지
  ray(x, y, rot, max) {
    const [dx, dy] = DIRS[rot];
    let n = 0;
    let cx = x + dx, cy = y + dy;
    while (n < max) {
      if (cx < 0 || cx >= W || cy >= H || cy < -2) break;
      if (cy >= 0 && this.solid[cy * W + cx] === S_SOLID) break;
      n++; cx += dx; cy += dy;
    }
    return n;
  }

  solidAt(tx, ty) {
    if (tx < 0 || tx >= W) return S_SOLID;
    if (ty < 0 || ty >= H) return S_NONE;
    const i = ty * W + tx;
    const s = this.solid[i];
    if (s && this.surf[i] === SF.CRUMBLE && this.crS[i] === 2) return S_NONE;
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
    const p = mod(t, 8);
    const dir = Math.floor(t / 8) % 2 ? -1 : 1;
    return { dir, active: p >= 4 && p < 7, warn: p >= 3 && p < 4, p };
  }
  flameState(it, t) {
    const p = mod(t + it.phase, 3);
    return p >= 1.5 ? 2 : p >= 1.1 ? 1 : 0; // 2 분사, 1 예고
  }
  laserState(it, t) {
    const p = mod(t + it.phase, 3.5);
    return p >= 2.5 ? 2 : p >= 2 ? 1 : 0;
  }
  maceBall(it, t) {
    const a = (t + (it.phase || 0)) / 3 * Math.PI * 2;
    return { x: it.x * TILE + 8 + Math.cos(a) * 40, y: it.y * TILE + 8 + Math.sin(a) * 40 };
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
    for (const it of this.holes) if (circleRect(it.x * TILE + 8, it.y * TILE + 8, 4.5, bx, by, bw, bh)) return it.id;
    if (staticOnly) return undefined;
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

  touchGoal(b) {
    const g = this.goalRect;
    return rectsOverlap(b.x, b.y, b.w, b.h, g.x, g.y, g.w, g.h);
  }

  // 무너지는 발판
  onStand(i) {
    if (this.surf[i] === SF.CRUMBLE && this.crS[i] === 0) { this.crS[i] = 1; this.crT[i] = 0; }
  }
  updateCrumble(dt, bodies) {
    for (const i of this.crumbles) {
      const s = this.crS[i];
      if (s === 1) {
        this.crT[i] += dt;
        if (this.crT[i] >= 0.5) { this.crS[i] = 2; this.crT[i] = 0; this.onCrumble && this.onCrumble(i); }
      } else if (s === 2) {
        this.crT[i] += dt;
        if (this.crT[i] >= 3) {
          const x = (i % W) * TILE, y = Math.floor(i / W) * TILE;
          let blocked = false;
          for (const b of bodies) if (rectsOverlap(b.x, b.y, b.w, b.h, x, y, 16, 16)) blocked = true;
          if (!blocked) { this.crS[i] = 0; this.crT[i] = 0; }
        }
      }
    }
  }
  resetDynamic() { this.crS.fill(0); this.crT.fill(0); }

  // ---------- 배치 ----------
  canPlace(type, x, y, rot) {
    const d = ITEMS[type];
    if (!d || !d.rots.includes(rot)) return false;
    if (type === 'bomb') return x >= 0 && y >= 0 && x < W && y < H;
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
    this.items.set(it.id, it);
    this.nextId = Math.max(this.nextId, it.id + 1);
    this.rebuild();
    return [];
  }
  bomb(x, y) {
    const removed = [];
    for (const it of this.items.values()) {
      const cells = itemCells(it.type, it.x, it.y, it.rot);
      if (cells.some(([cx, cy]) => (cx - x) ** 2 + (cy - y) ** 2 <= 6.25)) removed.push(it.id);
    }
    for (const id of removed) this.items.delete(id);
    this.rebuild();
    return removed;
  }
}
