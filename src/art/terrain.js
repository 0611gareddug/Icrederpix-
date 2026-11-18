// 지형 타일과 배경 (테마별)
import { mkCanvas, px } from './canvas.js';
import { hash2, rng } from '../core/util.js';
import { W, H, T_SOLID, T_ONEWAY, T_ICE, T_LAVA } from '../engine/world.js';
import { SPR } from './sprites.js';

export const THEMES = {
  grass: {
    sky: ['#5fb6f5', '#a8dcff', '#d8f1ff'], fill: '#7a4f2e', dark: '#5e3b21', light: '#9a6a3e', speck: '#6a4428',
    top: '#5cbf3a', topD: '#3e8c2a', topL: '#9be86a', plat: '#c88a4e', platD: '#8c5c33', ui: '#5cbf3a',
  },
  ice: {
    sky: ['#0b1230', '#16224a', '#22326a'], fill: '#34446a', dark: '#232f4e', light: '#4c5f8c', speck: '#2c3a5c',
    top: '#cdeeff', topD: '#8ec8ec', topL: '#ffffff', plat: '#8ec8ec', platD: '#4a7aa8', ui: '#7ad4ff',
  },
  lava: {
    sky: ['#1a0606', '#3a0e0a', '#5e1a10'], fill: '#5e2a2a', dark: '#3a1616', light: '#7e3c38', speck: '#4a2020',
    top: '#8a5a52', topD: '#5e3a34', topL: '#b07a6a', plat: '#7a4a3a', platD: '#4a2a20', ui: '#ff7a3a',
  },
  sky: {
    sky: ['#3a2f7a', '#b05a9a', '#ffb07a'], fill: '#7a5a96', dark: '#563e72', light: '#9a7ab6', speck: '#6a4c86',
    top: '#7be06a', topD: '#4fae4a', topL: '#b8f59a', plat: '#f0e8ff', platD: '#b8a8d8', ui: '#ff9ab8',
  },
};

function isT(world, x, y, set) {
  if (x < 0 || x >= W) return true;
  if (y < 0 || y >= H) return false;
  return set.includes(world.terrain[y * W + x]);
}

function drawSolidCell(ctx, th, theme, world, x, y) {
  const X = x * 16, Y = y * 16;
  const solidSet = [T_SOLID, T_ICE];
  const up = isT(world, x, y - 1, solidSet), dn = isT(world, x, y + 1, solidSet);
  const lf = isT(world, x - 1, y, solidSet), rt = isT(world, x + 1, y, solidSet);
  const ice = world.terrain[y * W + x] === T_ICE;
  if (theme === 'lava') {
    // 벽돌
    px(ctx, X, Y, th.fill, 16, 16);
    const off = (y % 2) * 8;
    for (let r = 0; r < 2; r++) {
      px(ctx, X, Y + r * 8 + 7, th.dark, 16, 1);
      const o = (off + r * 8) % 16;
      px(ctx, X + o, Y + r * 8, th.dark, 1, 7);
      px(ctx, X + ((o + 8) % 16), Y + r * 8, th.dark, 1, 7);
      px(ctx, X + o + 1, Y + r * 8, th.light, 6, 1);
    }
  } else {
    px(ctx, X, Y, th.fill, 16, 16);
    for (let i = 0; i < 6; i++) {
      const hx = Math.floor(hash2(x, y, i) * 15), hy = Math.floor(hash2(y, x, i + 7) * 15);
      px(ctx, X + hx, Y + hy, i % 2 ? th.speck : th.light, i % 3 === 0 ? 2 : 1, 1);
    }
    if (theme === 'ice' && hash2(x, y, 99) > 0.8) { px(ctx, X + 5, Y + 6, '#5ac8ff', 2, 2); px(ctx, X + 6, Y + 5, '#a8e8ff', 1, 1); }
  }
  if (!lf) px(ctx, X, Y, th.dark, 1, 16);
  if (!rt) px(ctx, X + 15, Y, th.dark, 1, 16);
  if (!dn) px(ctx, X, Y + 15, th.dark, 16, 1);
  if (!up) {
    if (ice) {
      px(ctx, X, Y, '#bfeaff', 16, 5); px(ctx, X, Y, '#ffffff', 16, 1); px(ctx, X, Y + 5, '#6bbbe8', 16, 1);
      px(ctx, X + 3, Y + 2, '#ffffff', 3, 1);
    } else {
      px(ctx, X, Y, th.top, 16, 4); px(ctx, X, Y, th.topL, 16, 1); px(ctx, X, Y + 4, th.topD, 16, 1);
      for (let i = 0; i < 4; i++) {
        const gx = Math.floor(hash2(x, y, i + 20) * 14);
        px(ctx, X + gx, Y + 4, th.topD, 2, 1 + (i % 2));
      }
      if (theme === 'grass' || theme === 'sky') {
        for (let i = 0; i < 3; i++) {
          const gx = Math.floor(hash2(x, y, i + 40) * 15);
          px(ctx, X + gx, Y - 1, th.top, 1, 1);
        }
        if (hash2(x, y, 77) > 0.86) { const fx = 3 + Math.floor(hash2(x, y, 78) * 10); px(ctx, X + fx, Y - 3, hash2(x, y, 79) > 0.5 ? '#ffe14a' : '#ff7ab8', 2, 2); px(ctx, X + fx, Y - 1, th.topD, 1, 1); }
      }
      if (theme === 'ice') { px(ctx, X + 2, Y + 1, '#ffffff', 2, 1); }
    }
  }
}

// 지형 + 정적 아이템 → 한 장의 캐시 이미지
export function renderTerrain(world, canvas) {
  const th = THEMES[world.theme];
  let c = canvas, ctx;
  if (!c) [c, ctx] = mkCanvas(W * 16, H * 16 + 16);
  else { ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); }
  ctx.save();
  ctx.translate(0, 16); // 위로 튀어나온 풀 장식 공간
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = world.terrain[y * W + x];
    if (t === T_SOLID || t === T_ICE) drawSolidCell(ctx, th, world.theme, world, x, y);
    else if (t === T_ONEWAY) {
      const X = x * 16, Y = y * 16;
      if (world.theme === 'sky') {
        px(ctx, X, Y, '#ffffff', 16, 5); px(ctx, X, Y + 5, '#e0d4f4', 16, 2);
        px(ctx, X + Math.floor(hash2(x, y) * 10), Y - 1, '#ffffff', 6, 1);
      } else {
        px(ctx, X, Y, th.plat, 16, 4); px(ctx, X, Y, '#ffffff33', 16, 1); px(ctx, X, Y + 4, th.platD, 16, 1);
        px(ctx, X + 2, Y + 5, th.platD, 2, 3); px(ctx, X + 12, Y + 5, th.platD, 2, 3);
      }
    }
  }
  // 정적 아이템
  for (const it of world.items.values()) {
    const X = it.x * 16, Y = it.y * 16;
    switch (it.type) {
      case 'wood': ctx.drawImage(SPR.wood, X, Y); break;
      case 'ice': ctx.drawImage(SPR.ice, X, Y); break;
      case 'sticky': ctx.drawImage(SPR.sticky, X, Y); break;
      case 'longplat': for (let k = 0; k < 3; k++) ctx.drawImage(SPR.plank, X + k * 16, Y); break;
      case 'ladder': for (let k = 0; k < 3; k++) ctx.drawImage(SPR.ladder, X, Y + k * 16); break;
      case 'spike': ctx.drawImage(SPR.spike[it.rot], X, Y); break;
      case 'arrow': ctx.drawImage(SPR.launcher[it.rot], X, Y); break;
      case 'flame': ctx.drawImage(SPR.flamer[it.rot], X, Y); break;
      case 'laser': ctx.drawImage(SPR.laser[it.rot], X, Y); break;
      case 'mace': {
        ctx.drawImage(SPR.macePost, X, Y);
        break;
      }
    }
  }
  // 출발 팻말
  const s = world.spawnCell;
  ctx.drawImage(SPR.startSign, s.x * 16 - 14, s.y * 16);
  ctx.restore();
  return c;
}

// 시차 배경 레이어 (가로로 반복)
export function makeBackground(theme) {
  const th = THEMES[theme];
  const r = rng(theme.length * 977);
  const layers = [];
  const LW = 512;
  const mk = (h, fn, factor, yAnchor) => { const [c, ctx] = mkCanvas(LW, h); fn(ctx, h); layers.push({ c, factor, yAnchor }); };
  if (theme === 'grass' || theme === 'sky') {
    // 구름
    mk(120, (ctx) => {
      for (let i = 0; i < 7; i++) {
        const x = r() * LW, y = 10 + r() * 80, w = 30 + r() * 50;
        const col = theme === 'sky' ? '#ffd8e8' : '#ffffff';
        px(ctx, x, y, col, w, 8); px(ctx, x + 6, y - 5, col, w * 0.5, 6); px(ctx, x + w * 0.4, y - 9, col, w * 0.35, 6);
        px(ctx, x, y + 7, theme === 'sky' ? '#f0b0c8' : '#d8ecff', w, 2);
        if (x + w > LW) { px(ctx, x - LW, y, col, w, 8); px(ctx, x - LW + 6, y - 5, col, w * 0.5, 6); }
      }
    }, 0.1, 0);
  }
  if (theme === 'grass') {
    mk(140, (ctx, h) => hills(ctx, h, '#8fd08a', 70, 2, r), 0.25, 1);
    mk(110, (ctx, h) => { hills(ctx, h, '#62b062', 44, 3, r); trees(ctx, h, r, '#3e8c3a', '#2e6e2a'); }, 0.45, 1);
  } else if (theme === 'sky') {
    mk(160, (ctx, h) => islands(ctx, h, r, '#b07ac0', '#8a5aa0', 0.6), 0.2, 1);
    mk(130, (ctx, h) => islands(ctx, h, r, '#8a5aa0', '#6a4080', 1), 0.4, 1);
  } else if (theme === 'ice') {
    mk(200, (ctx, h) => { stalag(ctx, h, r, '#1a2650', '#22306a'); }, 0.2, 1);
    mk(160, (ctx, h) => { crystals(ctx, h, r); }, 0.4, 1);
  } else if (theme === 'lava') {
    mk(180, (ctx, h) => { castle(ctx, h, r, '#2e0c0a', '#3e140e'); }, 0.2, 1);
    mk(120, (ctx, h) => { castle(ctx, h, r, '#4a1810', '#5e2014', true); }, 0.4, 1);
  }
  const [grad] = mkCanvas(1, 256);
  const g = grad.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, th.sky[0]); gr.addColorStop(0.55, th.sky[1]); gr.addColorStop(1, th.sky[2]);
  g.fillStyle = gr; g.fillRect(0, 0, 1, 256);
  return { layers, grad, LW, theme };
}

function hills(ctx, h, col, amp, k, r) {
  const ph = r() * 10, ph2 = r() * 10;
  ctx.fillStyle = col;
  for (let x = 0; x < 512; x++) {
    const a = (x / 512) * Math.PI * 2;
    const y = h - amp * (0.6 + 0.3 * Math.sin(a * k + ph) + 0.1 * Math.sin(a * k * 3 + ph2)) - 6;
    ctx.fillRect(x, Math.round(y), 1, h - Math.round(y));
  }
}
function trees(ctx, h, r, c1, c2) {
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(r() * 500), y = h - 30 - Math.floor(r() * 16);
    px(ctx, x + 4, y + 10, '#5e3b21', 3, 14);
    px(ctx, x, y, c1, 11, 11); px(ctx, x + 1, y - 3, c1, 9, 3); px(ctx, x + 2, y + 2, c2, 3, 3);
  }
}
function islands(ctx, h, r, top, bot, sc) {
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(r() * 470), y = 20 + Math.floor(r() * (h - 70)), w = Math.floor((30 + r() * 40) * sc);
    px(ctx, x, y, top, w, 5);
    for (let k = 0; k < 5; k++) px(ctx, x + k * 3, y + 5 + k * 3, bot, Math.max(2, w - k * 6), 3);
  }
}
function stalag(ctx, h, r, c1, c2) {
  for (let x = 0; x < 512; x += 6) {
    const l = 10 + Math.floor(r() * 50);
    px(ctx, x, 0, c1, 6, l); px(ctx, x + 2, l, c1, 2, 6);
    const l2 = 20 + Math.floor(r() * 60);
    px(ctx, x, h - l2, c2, 6, l2); px(ctx, x + 2, h - l2 - 6, c2, 2, 6);
  }
}
function crystals(ctx, h, r) {
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(r() * 500), hh = 16 + Math.floor(r() * 40);
    const col = r() > 0.5 ? '#3a8ac8' : '#4a6ad8';
    for (let k = 0; k < hh; k++) px(ctx, x + Math.floor(k / 5) * 0, h - k, col, Math.max(2, 8 - Math.floor(k / (hh / 5))), 1);
    px(ctx, x + 1, h - hh, '#9ae0ff', 2, Math.floor(hh / 2));
  }
}
function castle(ctx, h, r, c1, c2, near) {
  let x = 0;
  while (x < 512) {
    const w = 30 + Math.floor(r() * 50), th = 40 + Math.floor(r() * (h - 60));
    px(ctx, x, h - th, c1, w, th);
    for (let k = 0; k < w; k += 8) px(ctx, x + k, h - th - 5, c1, 5, 5);
    if (near) for (let k = 0; k < 3; k++) px(ctx, x + 6 + Math.floor(r() * (w - 12)), h - th + 10 + k * 14, '#ff8a3a', 3, 5);
    px(ctx, x + w - 2, h - th, c2, 2, th);
    x += w + Math.floor(r() * 20);
  }
}
