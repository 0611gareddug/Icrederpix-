// AI 배치 판단: 사람들이 지나간 길(열 지도)을 노리거나, 막힌 맵에는 길을 열어 준다
import { ITEMS, itemCells } from '../data/items.js';
import { W, H, DIRS } from '../engine/world.js';
import { TILE } from '../core/util.js';

const NOISE = { easy: 5, normal: 1.4, hard: 0.4 };

export function makeHeat() { return new Float32Array(W * H); }

export function seedHeat(heat, world) {
  const s = world.spawnCell, g = world.goalCell;
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(s.x + (g.x - s.x) * (i / steps));
    const y = Math.round(s.y + (g.y - s.y) * (i / steps)) - Math.round(Math.sin((i / steps) * Math.PI) * 2);
    for (let dy = -1; dy <= 0; dy++) addHeat(heat, x, y + dy, 0.4);
  }
}
export function addHeat(heat, x, y, v) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  heat[y * W + x] += v;
}
export function decayHeat(heat, k = 0.55) { for (let i = 0; i < heat.length; i++) heat[i] *= k; }

function hAt(heat, x, y) { return x < 0 || y < 0 || x >= W || y >= H ? 0 : heat[y * W + x]; }
function hArea(heat, x, y, r) {
  let s = 0;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) s += hAt(heat, x + i, y + j);
  return s;
}
function hRay(heat, world, it, len) {
  const [dx, dy] = DIRS[it.rot];
  let s = 0, x = it.x + dx, y = it.y + dy;
  for (let k = 0; k < len; k++) {
    if (x < 0 || y < 0 || x >= W || y >= H || world.solid[y * W + x] === 1) break;
    s += hAt(heat, x, y) + (dx ? hAt(heat, x, y - 1) * 0.6 : 0);
    x += dx; y += dy;
  }
  return s;
}

// ctx: { lastFlag: 'easy'|'fail'|null, frontier:{x,y}|null, owner }
export function choosePlacement(world, type, diff, heat, ctx, r) {
  const d = ITEMS[type];
  const noise = NOISE[diff] ?? 1.4;
  let best = null, bestS = -Infinity;
  const helpful = ctx.lastFlag === 'fail';
  const fr = ctx.frontier;
  const evalCand = (x, y, rot) => {
    const it = { type, x, y, rot };
    let s = r() * noise;
    switch (type) {
      case 'spike': {
        const [dx, dy] = DIRS[rot];
        s += hAt(heat, x + dx, y + dy) * 1.2 + hAt(heat, x + dx, y + dy - 1) * 0.6 + hArea(heat, x, y, 1) * 0.15;
        break;
      }
      case 'saw': case 'blackhole': s += hArea(heat, x, y, 1) * 0.5; break;
      case 'mace': s += hArea(heat, x, y, 3) * 0.12; break;
      case 'arrow': case 'laser': s += hRay(heat, world, it, 14) * 0.35; break;
      case 'flame': s += hRay(heat, world, it, 3) * 0.7; break;
      case 'ice': case 'sticky': case 'crumble':
        s += (hAt(heat, x, y - 1) + hAt(heat, x, y - 2)) * 0.6 - hAt(heat, x, y) * 0.3;
        if (helpful && fr) s -= Math.hypot(x - fr.x - 3, y - fr.y - 1) * 0.15;
        break;
      case 'bomb': {
        let n = 0;
        for (const o of world.items.values()) {
          const cells = itemCells(o.type, o.x, o.y, o.rot);
          if (cells.some(([cx, cy]) => (cx - x) ** 2 + (cy - y) ** 2 <= 6.25)) n += o.owner === ctx.owner ? 0.4 : 1;
        }
        s += n * 1.5;
        if (helpful) s += hArea(heat, x, y, 2) * 0.2;
        break;
      }
      default: { // 지형 블록
        if (helpful && fr) {
          s += 4 - Math.hypot(x - (fr.x + 3), y - (fr.y + 1)) * 0.5;
        } else {
          // 길을 막거나 엉뚱한 곳으로 보낸다
          s += hAt(heat, x, y) * 0.7 + hArea(heat, x, y, 1) * 0.1;
        }
      }
    }
    return s;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (const rot of d.rots) {
        if (!world.canPlace(type, x, y, rot)) continue;
        const s = evalCand(x, y, rot);
        if (s > bestS) { bestS = s; best = { x, y, rot }; }
      }
    }
  }
  if (!best) return null;
  return best;
}

// 봇이 상자에서 고를 때 선호도
export function pickScore(type, diff, lastFlag, placedCount, r) {
  const cat = ITEMS[type].cat;
  let s = r();
  if (cat === 'lethal') s += diff === 'hard' ? 0.9 : diff === 'normal' ? 0.5 : 0.2;
  if (lastFlag === 'fail' && cat === 'terrain') s += 1.2;
  if (lastFlag === 'easy' && cat === 'lethal') s += 0.6;
  if (type === 'bomb') s += placedCount > 14 ? 0.9 : -0.6;
  return s;
}
export { TILE };
