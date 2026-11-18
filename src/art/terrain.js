// 지형 타일과 배경 (테마별)
import { mkCanvas, px } from './canvas.js';
import { hash2, rng } from '../core/util.js';
import { W, H, T_SOLID, T_ONEWAY, T_ICE, T_LAVA, T_CONV_R, T_CONV_L, T_SAND, T_PRESS } from '../engine/world.js';
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
  factory: {
    sky: ['#1c2230', '#2e3648', '#46506a'], fill: '#4a5266', dark: '#2a303e', light: '#6a748c', speck: '#3a4152',
    top: '#8a94a8', topD: '#5a6276', topL: '#c8d0e0', plat: '#c8a040', platD: '#806020', ui: '#ffd23f',
  },
  desert: {
    sky: ['#e8884a', '#f8c070', '#fde8b0'], fill: '#c08848', dark: '#8a5a28', light: '#dca868', speck: '#a87238',
    top: '#f0d080', topD: '#c8a050', topL: '#fff0b8', plat: '#b07840', platD: '#704820', ui: '#f0c060',
  },
  space: {
    sky: ['#04020c', '#100828', '#24124a'], fill: '#56567a', dark: '#34344e', light: '#76769a', speck: '#46465e',
    top: '#a8a8c8', topD: '#6e6e90', topL: '#dcdcf0', plat: '#8a8ab0', platD: '#4a4a6a', ui: '#b08aff',
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
  const solidSet = [T_SOLID, T_ICE, T_SAND, T_PRESS, T_CONV_R, T_CONV_L];
  const up = isT(world, x, y - 1, solidSet), dn = isT(world, x, y + 1, solidSet);
  const lf = isT(world, x - 1, y, solidSet), rt = isT(world, x + 1, y, solidSet);
  const ice = world.terrain[y * W + x] === T_ICE;
  if (theme === 'factory') {
    // 금속 패널
    px(ctx, X, Y, th.fill, 16, 16);
    px(ctx, X, Y, th.light, 16, 1); px(ctx, X, Y, th.light, 1, 16);
    px(ctx, X + 15, Y, th.dark, 1, 16); px(ctx, X, Y + 15, th.dark, 16, 1);
    px(ctx, X + 2, Y + 2, th.speck, 2, 2); px(ctx, X + 12, Y + 2, th.speck, 2, 2); px(ctx, X + 2, Y + 12, th.speck, 2, 2); px(ctx, X + 12, Y + 12, th.speck, 2, 2);
    if (hash2(x, y, 5) > 0.75) { for (let k = 0; k < 4; k++) px(ctx, X + 4 + k * 2, Y + 5 + k, '#ffd23f', 2, 1); }
  } else if (theme === 'lava') {
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
    if (theme === 'factory') {
      px(ctx, X, Y, th.top, 16, 3); px(ctx, X, Y, th.topL, 16, 1); px(ctx, X, Y + 3, th.dark, 16, 1);
      for (let k = 0; k < 16; k += 4) px(ctx, X + k, Y + 1, th.topD, 2, 1);
    } else if (world.terrain[y * W + x] === T_SAND) {
      px(ctx, X, Y, '#f6dc94', 16, 6); px(ctx, X, Y, '#fff4c8', 16, 1); px(ctx, X, Y + 6, '#d8b060', 16, 1);
      for (let i = 0; i < 5; i++) px(ctx, X + Math.floor(hash2(x, y, i + 60) * 15), Y + 2 + (i % 3), '#e0bc70', 1, 1);
    } else if (ice) {
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
    if (t === T_SOLID || t === T_ICE || t === T_SAND) drawSolidCell(ctx, th, world.theme, world, x, y);
    else if (t === T_PRESS) ctx.drawImage(SPR.crushHouse, x * 16, y * 16);
    else if (t === T_CONV_R || t === T_CONV_L) { /* 움직이는 벨트라 매 프레임 그림 */ }
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
      case 'bigstone': ctx.drawImage(SPR.stone, X, Y); break;
      case 'web': ctx.drawImage(SPR.web, X, Y); break;
      case 'cannon': ctx.drawImage(it.rot === 1 ? SPR.cannonR : SPR.cannonL, X, Y); break;
      case 'crusher': ctx.drawImage(SPR.crushHouse, X, Y); break;
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
  } else if (theme === 'factory') {
    mk(200, (ctx, h) => factoryBg(ctx, h, r, '#141a26', '#1e2636', false), 0.2, 1);
    mk(150, (ctx, h) => factoryBg(ctx, h, r, '#222a3a', '#2c3548', true), 0.4, 1);
  } else if (theme === 'desert') {
    mk(150, (ctx, h) => { pyramids(ctx, h, r); }, 0.15, 1);
    mk(110, (ctx, h) => { hills(ctx, h, '#e0a860', 46, 2, r); cacti(ctx, h, r); }, 0.4, 1);
  } else if (theme === 'space') {
    mk(256, (ctx, h) => stars(ctx, h, r), 0.05, 0);
    mk(200, (ctx, h) => planet(ctx, h, r), 0.12, 0);
    mk(120, (ctx, h) => asteroids(ctx, h, r), 0.35, 1);
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

function factoryBg(ctx, h, r, c1, c2, near) {
  let x = 0;
  while (x < 512) {
    const w = 24 + Math.floor(r() * 40), th = 40 + Math.floor(r() * (h - 50));
    px(ctx, x, h - th, c1, w, th);
    if (r() > 0.5) { px(ctx, x + w / 2 - 3, h - th - 30, c1, 6, 30); if (near) px(ctx, x + w / 2 - 3, h - th - 34, '#3a4458', 6, 4); }
    if (near) for (let k = 0; k < 3; k++) px(ctx, x + 4 + Math.floor(r() * (w - 8)), h - th + 8 + k * 12, '#ffd23f55', 4, 3);
    px(ctx, x, h - th, c2, w, 2);
    x += w + Math.floor(r() * 16);
  }
  for (let k = 0; k < 3; k++) { const y = 20 + Math.floor(r() * (h - 80)); px(ctx, 0, y, c2, 512, 3); }
}
function pyramids(ctx, h, r) {
  for (let i = 0; i < 4; i++) {
    const cx = 40 + i * 120 + Math.floor(r() * 40), ph = 40 + Math.floor(r() * 50);
    for (let k = 0; k < ph; k++) { px(ctx, cx - k, h - ph + k, '#d89a58', k, 1); px(ctx, cx, h - ph + k, '#c0844a', k, 1); }
  }
}
function cacti(ctx, h, r) {
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(r() * 500), ch = 14 + Math.floor(r() * 14);
    px(ctx, x, h - 20 - ch, '#5a9a4a', 4, ch); px(ctx, x - 4, h - 14 - ch, '#5a9a4a', 4, 3); px(ctx, x - 4, h - 20 - ch, '#5a9a4a', 2, 6);
    px(ctx, x + 4, h - 10 - ch, '#5a9a4a', 4, 3); px(ctx, x + 6, h - 16 - ch, '#5a9a4a', 2, 6);
  }
}
function stars(ctx, h, r) {
  for (let i = 0; i < 120; i++) px(ctx, Math.floor(r() * 512), Math.floor(r() * h), r() > 0.85 ? '#ffffff' : r() > 0.5 ? '#a8a8d8' : '#6a6a9a', r() > 0.92 ? 2 : 1, 1);
}
function planet(ctx, h, r) {
  const cx = 360, cy = 70, R = 34;
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const d = Math.hypot(x, y);
    if (d > R) continue;
    const band = Math.floor((y + R) / 9) % 2;
    px(ctx, cx + x, cy + y, x + y < -20 ? (band ? '#e0a0ff' : '#c080e8') : band ? '#a060d0' : '#8048b0');
  }
  for (let x = -56; x <= 56; x++) px(ctx, cx + x, cy + Math.round(x * 0.18), '#ffd8a0', 1, 2);
  px(ctx, 120, 40, '#7ad4ff', 8, 8); px(ctx, 121, 41, '#bfeaff', 3, 3);
}
function asteroids(ctx, h, r) {
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(r() * 490), y = 10 + Math.floor(r() * (h - 30)), s = 4 + Math.floor(r() * 10);
    px(ctx, x, y, '#3a3a56', s, s); px(ctx, x + 1, y + 1, '#4a4a6a', Math.max(1, s - 4), 2);
  }
}
