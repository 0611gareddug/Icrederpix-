// AI 봇: 길찾기 그래프를 따라 달리고, 함정 타이밍을 계산해서 기다린다
import { TILE, DT, rng, sign } from '../core/util.js';
import { step, copyBody, NO_INPUT } from '../engine/physics.js';
import { polInput, blankInput } from './navgraph.js';

export const BOT_CFG = {
  easy:   { react: [16, 34], err: 0.24, jitter: 4, skip: 0.35, waitMax: 0.8, leapAfter: 6 },
  normal: { react: [7, 16],  err: 0.07, jitter: 2, skip: 0.08, waitMax: 2.2, leapAfter: 9 },
  hard:   { react: [2, 6],   err: 0.0,  jitter: 0, skip: 0,    waitMax: 4.0, leapAfter: 12 },
};

// 현재 상태에서 정책을 실제 시간 기준으로 미리 돌려 본다
export function simulateAt(world, graph, b, pol, t, maxF = 200) {
  const c = copyBody(b);
  const st = { x0: c.x + c.w / 2 };
  for (let f = 0; f < maxF; f++) {
    const inp = polInput(pol, f, c, st, world);
    step(c, inp, world, t + f * DT, DT, 2);
    if (world.hazard(c, t + (f + 1) * DT) !== undefined) return { dead: true, f };
    if (world.touchGoal(c)) return { goal: true, f };
    if (st.done && c.ground && Math.abs(c.vx) < 8) return { node: graph.nodeAt(c), f };
  }
  return { timeout: true };
}

function standSafe(world, b, t, frames = 24) {
  const c = copyBody(b);
  for (let f = 0; f < frames; f++) {
    step(c, NO_INPUT, world, t + f * DT, DT, 2);
    if (world.hazard(c, t + (f + 1) * DT) !== undefined) return false;
  }
  return true;
}

export class Bot {
  constructor(diff, seed) {
    this.diff = diff;
    this.cfg = BOT_CFG[diff] || BOT_CFG.normal;
    this.r = rng(seed);
    this.reset();
  }
  reset() {
    this.state = 'settle';
    this.pol = null; this.f = 0; this.st = null;
    this.delay = 0; this.waitT = 0; this.check = 0;
    this.bestCtg = Infinity; this.progT = 0;
    this.black = new Map();
    this.fails = 0;
  }

  goalDir(world, b) { return sign(world.goalRect.x + 5 - (b.x + b.w / 2)) || 1; }

  startPol(pol, b) {
    let p = pol;
    if (this.cfg.err > 0 && this.r() < this.cfg.err) {
      p = Object.assign({}, pol);
      const j = () => Math.round((this.r() * 2 - 1) * this.cfg.jitter);
      if (p.H !== undefined) p.H = Math.max(1, p.H + j());
      if (p.D !== undefined && p.D < 900) p.D = Math.max(1, p.D + j());
      if (p.F !== undefined) p.F = Math.max(2, p.F + j());
    }
    this.pol = p; this.f = 0; this.st = { x0: b.x + b.w / 2 };
    this.state = 'exec';
  }

  leap(world, b) {
    const d = this.goalDir(world, b);
    const opts = [
      { k: 'jdash', d, F: 10 + this.r.int(8), dy: this.r() < 0.5 ? -1 : 0 },
      { k: 'jump', H: 20, d, D: 999, dl: 0 },
      { k: 'wall', d, n: 3, cross: false },
    ];
    this.startPol(this.r.pick(opts), b);
  }

  update(b, world, graph, t, dt) {
    if (!graph || !graph.ready) return blankInput();
    this.progT += dt;
    if (this.state === 'exec') {
      const inp = polInput(this.pol, this.f, b, this.st, world);
      this.f++;
      if ((this.st.done && b.ground && Math.abs(b.vx) < 8) || this.f > 330) {
        this.state = 'settle';
      }
      return inp;
    }
    const inp = blankInput();
    if (!b.ground) return inp;
    const nid = graph.nodeAt(b);
    if (nid < 0) {
      // 노드 밖: 같은 줄의 가까운 노드로 걸어간다
      const ty = Math.floor((b.y + b.h - 1) / TILE);
      const tx = Math.floor((b.x + b.w / 2) / TILE);
      let best = -1, bd = 99;
      for (let dx = -4; dx <= 4; dx++) {
        const x = tx + dx;
        if (x < 0 || x >= 48) continue;
        const id = graph.nodeAtCell[ty * 48 + x];
        if (id >= 0 && Math.abs(dx) < bd) { bd = Math.abs(dx); best = id; }
      }
      if (best < 0 || this.progT > this.cfg.leapAfter) { this.progT = 0; this.leap(world, b); return inp; }
      const n = graph.nodes[best];
      inp.mx = sign(n.x * TILE + 8 - (b.x + b.w / 2));
      if (b.crouch) inp.my = 0;
      return inp;
    }
    const node = graph.nodes[nid];
    const c = graph.ctg[nid];
    if (c < this.bestCtg - 1) { this.bestCtg = c; this.progT = 0; }

    if (this.state === 'settle') {
      const target = node.x * TILE + 8;
      const d = target - (b.x + b.w / 2);
      if (Math.abs(d) > 1.5) { inp.mx = sign(d) * (Math.abs(d) < 8 ? 0.45 : 1); return inp; }
      if (Math.abs(b.vx) > 20) return inp;
      b.x = target - b.w / 2; b.vx = 0;
      this.state = 'decide';
      const [a, z] = this.cfg.react;
      this.delay = a + this.r.int(z - a + 1);
      this.waitT = 0; this.check = 0;
      return inp;
    }
    // decide
    if (this.delay > 0) { this.delay--; return inp; }
    if (b.dashCd > 0) return inp;
    if (this.progT > this.cfg.leapAfter) { this.progT = 0; this.leap(world, b); return inp; }
    if (this.check > 0) { this.check--; this.waitT += dt; return inp; }

    const ctg = graph.ctg;
    const goal = world.goalRect;
    const hdist = (n) => Math.hypot(n.x * TILE + 8 - goal.x, n.y * TILE - goal.y);
    let cands;
    if (c < Infinity) {
      cands = node.edges.filter((e) => (e.goal || ctg[e.to] < Infinity) && !(this.black.get(e) > t));
      cands.sort((a, b2) => (a.cost + (a.goal ? 0 : ctg[a.to])) - (b2.cost + (b2.goal ? 0 : ctg[b2.to])));
    } else {
      const here = hdist(node);
      cands = node.edges.filter((e) => !e.goal && hdist(graph.nodes[e.to]) < here - 8 && !(this.black.get(e) > t));
      cands.sort((a, b2) => hdist(graph.nodes[a.to]) - hdist(graph.nodes[b2.to]));
      if (!cands.length) {
        if (this.waitT > 1 + this.r() * 2) { this.waitT = 0; this.leap(world, b); }
        else { this.waitT += dt; }
        return inp;
      }
    }
    if (!cands.length) { this.leap(world, b); return inp; }

    const ok = (e) => {
      const r = simulateAt(world, graph, b, e.p, t);
      return e.goal ? !!r.goal : (r.goal || (!r.dead && r.node === e.to));
    };
    const top = cands[0];
    if (this.r() < this.cfg.skip || ok(top)) { this.startPol(top.p, b); return inp; }
    // 지금 서 있는 곳이 위험하면 아무 안전한 길로
    const safeHere = standSafe(world, b, t);
    if (!safeHere || this.waitT > this.cfg.waitMax) {
      const pool = safeHere ? cands.slice(1, 5) : node.edges.slice().sort((a, b2) => a.cost - b2.cost).slice(0, 10);
      for (const e of pool) if (ok(e)) { this.startPol(e.p, b); return inp; }
      if (this.waitT > this.cfg.waitMax * 2.5 || !safeHere) {
        this.black.set(top, t + 2);
        this.startPol(top.p, b);
        return inp;
      }
    }
    this.check = 4; this.waitT += dt;
    return inp;
  }
}
