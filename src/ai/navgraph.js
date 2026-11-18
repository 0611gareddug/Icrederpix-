// AI 길찾기 그래프: 실제 물리로 동작을 시뮬레이션해서 "갈 수 있는 길" 지도를 만든다
import { TILE, DT } from '../core/util.js';
import { step, newBody, P } from '../engine/physics.js';
import { W, H, S_SOLID, S_ONEWAY, S_LADTOP, SF } from '../engine/world.js';

const BASE_POLICIES = (() => {
  const L = [];
  for (const d of [-1, 1]) for (const n of [1, 2, 3]) L.push({ k: 'goto', off: d * n });
  for (const H of [4, 10, 20]) L.push({ k: 'jump', H, d: 0, D: 0, dl: 0 });
  for (const H of [4, 10, 20]) for (const d of [-1, 1]) for (const D of [6, 14, 24, 999]) L.push({ k: 'jump', H, d, D, dl: 0 });
  for (const d of [-1, 1]) L.push({ k: 'jump', H: 20, d, D: 999, dl: 10 });
  for (const d of [-1, 1]) for (const F of [8, 16, 30, 44]) for (const dy of [0, -1]) L.push({ k: 'jdash', d, F, dy });
  for (const d of [-1, 1]) for (const D of [10, 999]) L.push({ k: 'gdash', d, D });
  for (const d of [-1, 1]) { L.push({ k: 'wall', d, n: 3, cross: false }); L.push({ k: 'wall', d, n: 1, cross: true }); }
  return L;
})();

export function blankInput() { return { mx: 0, my: 0, jump: false, jumpP: false, dashP: false }; }

function canStandAt(world, b) {
  const top = b.y + b.h - P.STAND_H;
  const x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 0.01) / TILE);
  const y0 = Math.floor(top / TILE), y1 = Math.floor((b.y + b.h - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (world.solidAt(tx, ty) === S_SOLID) return false;
  return true;
}

// 정책 → 프레임별 입력 (결정적)
export function polInput(p, f, b, st, world) {
  const I = blankInput();
  const cx = b.x + b.w / 2;
  switch (p.k) {
    case 'goto': {
      if (st.tx === undefined) st.tx = st.x0 + p.off * TILE;
      const d = st.tx - cx;
      if (Math.abs(d) > 1.5 && f < 70) I.mx = Math.sign(d) * (Math.abs(d) < 8 ? 0.45 : 1);
      else st.done = true;
      break;
    }
    case 'jump':
      if (f === 0) I.jumpP = true;
      I.jump = f < p.H;
      if (f >= p.dl && f < p.dl + p.D) I.mx = p.d;
      if (f > 3 && b.ground) st.done = true;
      break;
    case 'jdash':
      if (f === 0) I.jumpP = true;
      I.jump = f < 20;
      I.mx = p.d;
      if (f === p.F) { I.dashP = true; I.my = p.dy; }
      if (f > 3 && b.ground) st.done = true;
      break;
    case 'gdash':
      if (f === 0) I.dashP = true;
      if (f < p.D) I.mx = p.d;
      if (f > 3 && b.ground) st.done = true;
      break;
    case 'wall': {
      if (f === 0) { I.jumpP = true; st.wj = 0; st.last = 0; st.dir = p.d; }
      I.jump = f - st.last < 18;
      I.mx = st.dir;
      if (f > 2 && !b.ground && b.wall === p.d && b.wallOk && st.wj < p.n && f - st.last > 5) {
        I.jumpP = true; I.jump = true; st.last = f; st.wj++;
        if (p.cross) st.dir = -p.d;
        I.mx = st.dir;
      }
      if (f > 3 && b.ground) st.done = true;
      break;
    }
    case 'ladder':
      if (!st.off) {
        I.my = -1;
        const tx = Math.floor(cx / TILE), ty = Math.floor((b.y + b.h - 1) / TILE);
        if (f > 4 && !world.ladderAt(tx, ty) && !b.climb) st.off = f;
        if (f > 4 && b.ground && !b.climb) st.off = f;
      } else {
        I.mx = p.d;
        if (f - st.off === 0 && p.d) I.jumpP = true;
        I.jump = f - st.off < 10;
      }
      if (st.off && f - st.off > 4 && b.ground) st.done = true;
      if (f > 150) st.done = true;
      break;
    case 'ldown':
      I.my = 1;
      if (f > 6 && b.ground && !b.climb) st.done = true;
      break;
    case 'crawl':
      I.my = 1; I.mx = p.d;
      if (Math.abs(cx - st.x0) >= 24 && canStandAt(world, b)) { st.done = true; I.my = 0; I.mx = 0; }
      if (f > 300) st.done = true;
      break;
  }
  if (st.done && p.k !== 'goto') { I.mx = 0; I.my = 0; }
  return I;
}

function staticDead(world, b) {
  if (b.y > H * TILE + 8) return true;
  if (world.hasLava && b.y + b.h > world.lavaBase - 16 + 5) return true;
  const x0 = Math.max(0, Math.floor(b.x / TILE) - 0), x1 = Math.min(W - 1, Math.floor((b.x + b.w) / TILE));
  const y0 = Math.max(0, Math.floor(b.y / TILE)), y1 = Math.min(H - 1, Math.floor((b.y + b.h) / TILE));
  let near = false;
  for (let y = y0; y <= y1 && !near; y++) for (let x = x0; x <= x1; x++) if (world.hazCell[y * W + x]) { near = true; break; }
  if (!near) return false;
  return world.hazard(b, 0, true) !== undefined;
}

export class NavGraph {
  constructor(world) {
    this.world = world;
    this.version = world.version;
    this.nodeAtCell = new Int32Array(W * H).fill(-1);
    this.nodes = [];
    this.ready = false;
    this.ctg = null;
    this.gen = this.build();
  }

  nodeBody(n) {
    const b = newBody(n.x * TILE + 8, (n.y + 1) * TILE);
    b.ground = true; b.coyote = P.COYOTE; b.gsurf = n.surf;
    return b;
  }

  findNodes() {
    const w = this.world;
    w.staticMode = true;
    for (let y = 0; y < H - 1; y++) {
      for (let x = 0; x < W; x++) {
        const below = w.solidAt(x, y + 1);
        if (!(below === S_SOLID || below === S_ONEWAY || below === S_LADTOP)) continue;
        const surf = w.surfAt(x, y + 1);
        if (surf === SF.TRAMP_U || surf === SF.BOOST_R || surf === SF.BOOST_L) continue;
        const b = newBody(x * TILE + 8, (y + 1) * TILE);
        if (!canStandAt(w, b)) continue;
        if (staticDead(w, b)) continue;
        // 블랙홀 근처는 서 있기 어려움
        let pulled = false;
        for (const h of w.holes) if (Math.hypot(h.x * TILE + 8 - (x * TILE + 8), h.y * TILE + 8 - (y * TILE + 6)) < 46) pulled = true;
        if (pulled) continue;
        const n = { id: this.nodes.length, x, y, surf, edges: [], goal: w.touchGoal(b) };
        this.nodeAtCell[y * W + x] = n.id;
        this.nodes.push(n);
      }
    }
  }

  policiesFor(n) {
    const w = this.world;
    const L = BASE_POLICIES.slice();
    const lad = w.ladderAt(n.x, n.y) || w.ladderAt(n.x, n.y - 1);
    if (lad) for (const d of [-1, 0, 1]) L.push({ k: 'ladder', d });
    if (w.ladderAt(n.x, n.y + 1)) L.push({ k: 'ldown' });
    for (const d of [-1, 1]) if (w.solidAt(n.x + d, n.y - 1) === S_SOLID && w.solidAt(n.x + d, n.y) !== S_SOLID) L.push({ k: 'crawl', d });
    return L;
  }

  // 시뮬레이션 결과: {to, f, goal} 또는 null
  simulate(n, p) {
    const w = this.world;
    const b = this.nodeBody(n);
    const st = { x0: b.x + b.w / 2 };
    const maxF = p.k === 'crawl' ? 320 : 170;
    for (let f = 0; f < maxF; f++) {
      const inp = polInput(p, f, b, st, w);
      step(b, inp, w, 0, DT, 1);
      if (staticDead(w, b)) return null;
      if (w.touchGoal(b)) return { to: -1, f, goal: true };
      if (st.done && b.ground && Math.abs(b.vx) < 8) {
        const tx = Math.floor((b.x + b.w / 2) / TILE), ty = Math.floor((b.y + b.h - 1) / TILE);
        const id = ty >= 0 && ty < H ? this.nodeAtCell[ty * W + tx] : -1;
        if (id < 0 || id === n.id) return null;
        return { to: id, f, goal: false };
      }
    }
    return null;
  }

  *build() {
    this.findNodes();
    let count = 0;
    for (const n of this.nodes) {
      const best = new Map();
      for (const p of this.policiesFor(n)) {
        const r = this.simulate(n, p);
        count++;
        if (count % 12 === 0) yield;
        if (!r) continue;
        let cost = r.f + 8 + (p.k === 'jdash' || p.k === 'gdash' ? 6 : 0) + (p.k === 'wall' ? 8 : 0);
        const key = r.goal ? 'g' : r.to;
        const arr = best.get(key) || [];
        arr.push({ p, to: r.to, cost, goal: r.goal });
        arr.sort((a, b) => a.cost - b.cost);
        if (arr.length > 3) arr.length = 3;
        best.set(key, arr);
      }
      for (const arr of best.values()) n.edges.push(...arr);
    }
    this.computeCtg();
    this.ready = true;
  }

  // 시간 예산 안에서 조금씩 계산
  work(ms) {
    if (this.ready) return true;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      const r = this.gen.next();
      if (r.done) return true;
    }
    return this.ready;
  }
  finish() { while (!this.ready) this.gen.next(); }

  computeCtg() {
    const N = this.nodes.length;
    const ctg = new Float64Array(N).fill(Infinity);
    const rev = Array.from({ length: N }, () => []);
    const heap = [];
    for (const n of this.nodes) {
      for (const e of n.edges) {
        if (e.goal) ctg[n.id] = Math.min(ctg[n.id], e.cost);
        else rev[e.to].push([n.id, e.cost]);
      }
      if (n.goal) ctg[n.id] = 0;
    }
    for (let i = 0; i < N; i++) if (ctg[i] < Infinity) heap.push([ctg[i], i]);
    heap.sort((a, b) => a[0] - b[0]);
    // 단순 Dijkstra (노드 수가 적어서 배열 정렬로 충분)
    const done = new Uint8Array(N);
    while (heap.length) {
      let bi = 0;
      for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i;
      const [c, u] = heap[bi];
      heap[bi] = heap[heap.length - 1]; heap.pop();
      if (done[u]) continue;
      done[u] = 1;
      for (const [v, w] of rev[u]) {
        if (c + w < ctg[v]) { ctg[v] = c + w; heap.push([ctg[v], v]); }
      }
    }
    this.ctg = ctg;
  }

  // 출발점에서 골까지 최적 경로를 실제 물리로 따라가며 위치를 알려 준다 (AI 함정 배치용)
  tracePath(cb) {
    this.finish();
    const w = this.world;
    let id = this.nodeAtCell[w.spawnCell.y * W + w.spawnCell.x];
    const seen = new Set();
    while (id >= 0 && !seen.has(id) && this.ctg[id] < Infinity) {
      seen.add(id);
      const n = this.nodes[id];
      let best = null, bc = Infinity;
      for (const e of n.edges) {
        const c = e.cost + (e.goal ? 0 : this.ctg[e.to]);
        if (c < bc) { bc = c; best = e; }
      }
      if (!best) break;
      const b = this.nodeBody(n);
      const st = { x0: b.x + b.w / 2 };
      for (let f = 0; f < 200; f++) {
        step(b, polInput(best.p, f, b, st, w), w, 0, DT, 1);
        if (f % 3 === 0) cb(b.x + b.w / 2, b.y + b.h / 2);
        if (w.touchGoal(b) || (st.done && b.ground && Math.abs(b.vx) < 8)) break;
      }
      if (best.goal) break;
      id = best.to;
    }
  }

  nodeAt(b) {
    const tx = Math.floor((b.x + b.w / 2) / TILE), ty = Math.floor((b.y + b.h - 1) / TILE);
    if (tx < 0 || tx >= W || ty < 0 || ty >= H) return -1;
    return this.nodeAtCell[ty * W + tx];
  }
}
