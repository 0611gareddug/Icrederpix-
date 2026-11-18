// 달리기 중 줍는 코인: 모든 플레이어 화면에서 같은 위치 (월드 상태 + 라운드로 결정)
import { rng, TILE } from '../core/util.js';
import { W, H, S_SOLID, S_ONEWAY } from '../engine/world.js';

export const COINS_PER_POINT = 3;

export function genCoins(world, round, count = 9) {
  const r = rng(round * 7919 + world.key.length * 131 + world.items.size * 17);
  const sx = world.spawnCell.x, gx = world.goalCell.x;
  const lo = Math.min(sx, gx) + 4, hi = Math.max(sx, gx) - 2;
  const cands = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = lo; x <= hi; x++) {
      const i = y * W + x;
      if (world.solid[i] || world.occ[i] !== -1 || world.safeCell[i]) continue;
      // 1~3칸 아래에 밟을 곳이 있는 칸만 (닿을 수 있는 높이)
      let ground = 0;
      for (let d = 1; d <= 3 && y + d < H; d++) {
        const s = world.solid[(y + d) * W + x];
        if (s === S_SOLID || s === S_ONEWAY) { ground = d; break; }
        if (world.occ[(y + d) * W + x] !== -1) break;
      }
      if (!ground) continue;
      // 위험한 곳(함정 근처)일수록 가중치
      let danger = 0;
      for (const it of world.items.values()) if (Math.abs(it.x - x) <= 2 && Math.abs(it.y - y) <= 2) danger++;
      cands.push({ x, y, w: 1 + danger * 2.5 + (ground >= 2 ? 0.5 : 0) });
    }
  }
  const out = [];
  while (out.length < count && cands.length) {
    let tot = 0;
    for (const c of cands) tot += c.w;
    let k = r() * tot, pick = 0;
    for (; pick < cands.length - 1; pick++) { k -= cands[pick].w; if (k <= 0) break; }
    const c = cands[pick];
    out.push({ x: c.x * TILE + 8, y: c.y * TILE + 8 });
    for (let j = cands.length - 1; j >= 0; j--) if (Math.abs(cands[j].x - c.x) < 4 && Math.abs(cands[j].y - c.y) < 3) cands.splice(j, 1);
  }
  return out;
}
