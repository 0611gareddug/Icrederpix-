// 캐릭터 스프라이트 (네모난 블록 몸통) — 꾸미기를 반영해 프레임별로 생성
import { mkCanvas, px, outline, flipped } from './canvas.js';
import { shade, hsl } from '../core/util.js';
import { COLORS } from '../data/cosmetics.js';
import { OL } from './sprites.js';

export const FW = 20, FH = 30;
const POSES = {
  idle0: {}, idle1: { hd: 1, ad: 1 },
  run0: { bl: [-1, 0], fl: [1, -1], ba: [1, 1], fa: [-1, -1], by: 0 },
  run1: { bl: [0, -1], fl: [0, 0], by: -1 },
  run2: { bl: [1, -1], fl: [-1, 0], ba: [-1, -1], fa: [1, 1] },
  run3: { bl: [0, 0], fl: [0, -1], by: -1 },
  jump: { bl: [-1, -1], fl: [1, -2], ba: [0, -3], fa: [0, -3] },
  fall: { bl: [-1, 0], fl: [1, 0], ba: [-1, -4], fa: [1, -4] },
  wall: { bl: [0, -1], fl: [1, -2], ba: [0, -4], fa: [0, 0], lean: -1 },
  dash: { bl: [-2, -1], fl: [-1, -1], ba: [-2, 0], fa: [-2, 0], lean: 1 },
  crouch: { crouch: true },
  slide: { crouch: true, lean: -1, fl: [2, 0] },
  climb0: { ba: [0, -4], fa: [0, 1], bl: [0, -1], fl: [0, 0] },
  climb1: { ba: [0, 1], fa: [0, -4], bl: [0, 0], fl: [0, -1] },
  win0: { ba: [0, -5], fa: [0, -5] },
  win1: { ba: [0, -6], fa: [0, -6], by: -2, bl: [0, -1], fl: [0, -1] },
};
export const FRAME_NAMES = Object.keys(POSES);

function colorsFor(look, hue) {
  const def = COLORS[look.color] || COLORS[0];
  const c = def.rainbow ? hsl(hue, 85, 60) : def.c;
  return { c, d: shade(c, -0.32), dd: shade(c, -0.5), l: shade(c, 0.35), gold: def.gold };
}

function drawBack(ctx, back, P, col, f) {
  const by = P.by;
  switch (back) {
    case 1: { // 망토
      const fl = f % 2;
      px(ctx, 3, 19 + by, '#d8344a', 3, 2);
      px(ctx, 1, 21 + by, '#d8344a', 4, 5 + fl);
      px(ctx, 0, 24 + by, '#a8203a', 2, 3 + fl);
      px(ctx, 2, 21 + by, '#ff5a6a', 1, 3);
      break;
    }
    case 2: // 날개
      px(ctx, 1, 15 + by, '#ffffff', 4, 2); px(ctx, 0, 17 + by, '#ffffff', 5, 3); px(ctx, 1, 20 + by, '#e0e6f0', 3, 3);
      px(ctx, 0, 14 + by, '#e0e6f0', 2, 1);
      break;
    case 3: // 꼬리
      px(ctx, 2, 23 + by, '#ff8f3a', 3, 3); px(ctx, 0, 20 + by, '#ff8f3a', 3, 4); px(ctx, 0, 19 + by, '#ffffff', 2, 2);
      break;
    case 4: // 배낭
      px(ctx, 1, 19 + by, '#8a5a35', 4, 7); px(ctx, 1, 19 + by, '#a8703f', 4, 1); px(ctx, 1, 22 + by, '#ffd23f', 2, 1);
      break;
    case 5: // 목도리 꼬리
      px(ctx, 1, 19 + by, '#3fb0ff', 4, 2); px(ctx, 0, 21 + by, '#3fb0ff', 2, 3 + (f % 2));
      break;
  }
}

function drawFace(ctx, face, hx, hy, f) {
  const K = '#1b1726', Wt = '#ffffff';
  const eye = (x, y) => { px(ctx, x, y, K, 2, 3); px(ctx, x, y, Wt, 1, 1); };
  const ex1 = hx + 5, ex2 = hx + 9, ey = hy + 3;
  switch (face) {
    case 0: eye(ex1, ey); eye(ex2, ey); break;
    case 1: eye(ex1, ey); eye(ex2, ey); px(ctx, ex1 + 1, ey + 5, K, 1, 1); px(ctx, ex1 + 2, ey + 6, K, 3, 1); px(ctx, ex2 + 1, ey + 5, K, 1, 1); break;
    case 2: eye(ex1, ey + 1); eye(ex2, ey + 1); px(ctx, ex1 - 1, ey - 1, K, 2, 1); px(ctx, ex1 + 1, ey, K, 1, 1); px(ctx, ex2 + 1, ey - 1, K, 2, 1); px(ctx, ex2, ey, K, 1, 1); px(ctx, ex1 + 1, ey + 6, K, 4, 1); break;
    case 3: px(ctx, ex1, ey + 2, K, 2, 1); px(ctx, ex2, ey + 2, K, 2, 1); px(ctx, ex1 + 2, ey + 5, K, 2, 1); break;
    case 4: px(ctx, ex1 - 1, ey, K, 7, 2); px(ctx, ex1 - 1, ey + 2, K, 3, 1); px(ctx, ex2, ey + 2, K, 3, 1); px(ctx, ex1, ey, '#6a7090', 1, 1); px(ctx, ex2 + 1, ey, '#6a7090', 1, 1); px(ctx, hx + 1, ey, K, 3, 1); break;
    case 5: px(ctx, ex1, ey - 1, K, 2, 4); px(ctx, ex2, ey - 1, K, 2, 4); px(ctx, ex1, ey - 1, Wt); px(ctx, ex2, ey - 1, Wt); px(ctx, ex1 + 2, ey + 5, K, 2, 2); break;
    case 6: px(ctx, ex1, ey + 2, K, 2, 1); eye(ex2, ey); px(ctx, ex1 + 1, ey + 5, K, 4, 1); px(ctx, ex2 + 1, ey + 4, K, 1, 1); break;
    case 7: {
      const st = (x, y) => { px(ctx, x, y + 1, '#ffd23f', 3, 1); px(ctx, x + 1, y, '#ffd23f', 1, 3); };
      st(ex1 - 1, ey); st(ex2, ey); px(ctx, ex1 + 1, ey + 5, K, 3, 1);
      break;
    }
  }
}

function drawHat(ctx, hat, hx, hy, f) {
  switch (hat) {
    case 1: // 야구모자
      px(ctx, hx, hy - 3, '#e8433f', 12, 4); px(ctx, hx + 1, hy - 4, '#e8433f', 10, 1); px(ctx, hx + 10, hy, '#b02a2a', 5, 1);
      px(ctx, hx + 2, hy - 3, '#ff7a6b', 4, 1); px(ctx, hx + 5, hy - 2, '#ffffff', 2, 2);
      break;
    case 2: // 비니
      px(ctx, hx, hy - 3, '#3f8cff', 12, 4); px(ctx, hx + 1, hy - 4, '#3f8cff', 10, 1); px(ctx, hx, hy, '#2a5ab0', 12, 1);
      for (let x = 1; x < 12; x += 3) px(ctx, hx + x, hy - 3, '#7ab0ff', 1, 3);
      px(ctx, hx + 5, hy - 6, '#ffffff', 2, 2);
      break;
    case 3: // 왕관
      px(ctx, hx + 1, hy - 3, '#ffc21a', 10, 3); px(ctx, hx + 1, hy - 6, '#ffc21a', 2, 3); px(ctx, hx + 5, hy - 7, '#ffc21a', 2, 4); px(ctx, hx + 9, hy - 6, '#ffc21a', 2, 3);
      px(ctx, hx + 3, hy - 2, '#ff3a5a', 1, 1); px(ctx, hx + 6, hy - 2, '#3fb0ff', 1, 1); px(ctx, hx + 9, hy - 2, '#4fcf5a', 1, 1);
      px(ctx, hx + 1, hy - 3, '#ffe68a', 10, 1);
      break;
    case 4: // 개구리
      px(ctx, hx, hy - 3, '#4fcf5a', 12, 4); px(ctx, hx + 1, hy - 4, '#4fcf5a', 10, 1);
      px(ctx, hx + 1, hy - 7, '#4fcf5a', 4, 4); px(ctx, hx + 7, hy - 7, '#4fcf5a', 4, 4);
      px(ctx, hx + 2, hy - 6, '#ffffff', 2, 2); px(ctx, hx + 8, hy - 6, '#ffffff', 2, 2); px(ctx, hx + 3, hy - 5, '#1b1726'); px(ctx, hx + 9, hy - 5, '#1b1726');
      break;
    case 5: // 우주 헬멧 (머리 그린 뒤 반투명 유리)
      ctx.fillStyle = 'rgba(180,230,255,0.35)';
      ctx.fillRect(hx - 2, hy - 2, 16, 14);
      px(ctx, hx - 2, hy - 3, '#d0f0ff', 16, 1); px(ctx, hx - 3, hy - 2, '#d0f0ff', 1, 14); px(ctx, hx + 14, hy - 2, '#d0f0ff', 1, 14);
      px(ctx, hx - 2, hy + 12, '#9aa0ae', 16, 2); px(ctx, hx + 9, hy - 1, '#ffffff', 2, 1); px(ctx, hx + 11, hy, '#ffffff', 1, 2);
      break;
    case 6: // 해적
      px(ctx, hx - 1, hy - 2, '#2a2c3a', 14, 3); px(ctx, hx + 1, hy - 4, '#2a2c3a', 10, 2); px(ctx, hx + 3, hy - 5, '#2a2c3a', 6, 1);
      px(ctx, hx + 5, hy - 3, '#ffffff', 2, 2); px(ctx, hx - 1, hy - 2, '#ffc21a', 14, 1);
      break;
    case 7: // 실크햇
      px(ctx, hx - 1, hy - 1, '#2a2c3a', 14, 2); px(ctx, hx + 2, hy - 8, '#2a2c3a', 8, 7); px(ctx, hx + 2, hy - 3, '#e8433f', 8, 1); px(ctx, hx + 3, hy - 8, '#4a4e5e', 1, 5);
      break;
    case 8: { // 프로펠러
      px(ctx, hx, hy - 3, '#ffcf3a', 12, 4); px(ctx, hx + 1, hy - 4, '#ffcf3a', 10, 1);
      px(ctx, hx + 3, hy - 3, '#3f8cff', 2, 4); px(ctx, hx + 7, hy - 3, '#e8433f', 2, 4);
      px(ctx, hx + 5, hy - 6, '#6a7080', 2, 2);
      const w = f % 2 ? 4 : 7;
      px(ctx, hx + 6 - w, hy - 7, '#e8433f', w, 1); px(ctx, hx + 6, hy - 7, '#3f8cff', w, 1);
      break;
    }
    case 9: // 요리사
      px(ctx, hx + 1, hy - 2, '#ffffff', 10, 3); px(ctx, hx, hy - 7, '#ffffff', 12, 5); px(ctx, hx + 1, hy - 8, '#ffffff', 4, 1); px(ctx, hx + 7, hy - 8, '#ffffff', 4, 1);
      px(ctx, hx + 1, hy, '#d0d4e0', 10, 1);
      break;
    case 10: // 토끼 귀
      px(ctx, hx + 2, hy - 8, '#ffffff', 3, 8); px(ctx, hx + 7, hy - 9, '#ffffff', 3, 9);
      px(ctx, hx + 3, hy - 7, '#ffb0c8', 1, 6); px(ctx, hx + 8, hy - 8, '#ffb0c8', 1, 7);
      break;
    case 11: // 천사 고리
      px(ctx, hx + 2, hy - 5, '#ffe14a', 8, 1); px(ctx, hx + 2, hy - 3, '#ffe14a', 8, 1); px(ctx, hx + 1, hy - 4, '#ffe14a', 1, 1); px(ctx, hx + 10, hy - 4, '#ffe14a', 1, 1);
      break;
  }
}

function drawFrame(look, name, hue, ol, f) {
  const P = Object.assign({ by: 0, hd: 0, ad: 0, bl: [0, 0], fl: [0, 0], ba: [0, 0], fa: [0, 0], lean: 0, crouch: false }, POSES[name]);
  const col = colorsFor(look, hue);
  const [c, ctx] = mkCanvas(FW, FH);
  const by = P.by;
  const ln = P.lean;
  if (look.back) drawBack(ctx, look.back, P, col, f);
  let hx, hy;
  if (P.crouch) {
    px(ctx, 5 + (P.fl[0] > 0 ? 2 : 0), 28, col.dd, 3, 2); px(ctx, 11 + P.fl[0], 28, col.dd, 3, 2);
    px(ctx, 5, 25, col.c, 10, 3);
    hx = 4 + ln; hy = 18;
    px(ctx, hx, hy, col.c, 12, 9);
    px(ctx, hx + 1, hy + 1, col.l, 4, 1); px(ctx, hx + 1, hy + 1, col.l, 1, 3);
    px(ctx, hx, hy + 8, col.d, 12, 1);
    px(ctx, 2 + ln, 24, col.d, 2, 3); px(ctx, 16, 24, col.c, 2, 3);
    drawFace(ctx, look.face, hx, hy - 1, f);
  } else {
    // 뒷다리/뒷팔
    px(ctx, 6 + P.bl[0], 26 + P.bl[1] + by, col.dd, 3, 4 - Math.max(0, P.bl[1] + by) + (by < 0 ? 0 : 0));
    px(ctx, 3 + P.ba[0] + ln, 20 + P.ba[1] + by + P.ad, col.d, 2, 5);
    // 몸통
    px(ctx, 5 + ln, 20 + by, col.c, 10, 6);
    px(ctx, 5 + ln, 25 + by, col.d, 10, 1);
    px(ctx, 6 + ln, 21 + by, col.l, 1, 3);
    // 앞다리
    px(ctx, 11 + P.fl[0], 26 + P.fl[1] + by, col.dd, 3, 4 - Math.max(0, P.fl[1] + by));
    // 머리
    hx = 4 + ln; hy = 10 + by + P.hd;
    px(ctx, hx, hy, col.c, 12, 10);
    px(ctx, hx + 1, hy + 1, col.l, 5, 1); px(ctx, hx + 1, hy + 1, col.l, 1, 4);
    px(ctx, hx, hy + 9, col.d, 12, 1); px(ctx, hx + 11, hy + 1, col.d, 1, 8);
    if (col.gold) { px(ctx, hx + 3, hy + 2, '#ffffff'); px(ctx, 8 + ln, 22 + by, '#fff6c0'); }
    // 앞팔
    px(ctx, 15 + P.fa[0] + ln, 20 + P.fa[1] + by + P.ad, col.c, 2, 5);
    px(ctx, 15 + P.fa[0] + ln, 24 + P.fa[1] + by + P.ad, col.d, 2, 1);
    drawFace(ctx, look.face, hx, hy, f);
  }
  if (look.hat && look.hat !== 5) drawHat(ctx, look.hat, hx, hy, f);
  outline(c, ctx, ol || OL);
  if (look.hat === 5) drawHat(ctx, 5, hx, hy, f);
  return c;
}

const cache = new Map();
// look + 외곽선 색 → { right:{name:canvas}, left:{...} }
export function getSheet(look, ol = OL, t = 0) {
  const rainbow = COLORS[look.color] && COLORS[look.color].rainbow;
  const hueStep = rainbow ? Math.floor(t * 8) % 12 : 0;
  const key = `${look.color}|${look.hat}|${look.face}|${look.back}|${ol}|${hueStep}`;
  let s = cache.get(key);
  if (s) return s;
  s = { right: {}, left: {} };
  FRAME_NAMES.forEach((n, i) => {
    const fr = drawFrame(look, n, hueStep * 30, ol, i);
    s.right[n] = fr;
    s.left[n] = flipped(fr);
  });
  if (cache.size > 120) cache.delete(cache.keys().next().value);
  cache.set(key, s);
  return s;
}

export function frameFor(anim, b, t) {
  switch (anim) {
    case 'idle': return Math.floor(t * 2) % 2 ? 'idle1' : 'idle0';
    case 'run': return 'run' + (Math.floor(b.walkT * 0.9) % 4);
    case 'climb': return Math.floor((b.y) / 6) % 2 ? 'climb1' : 'climb0';
    case 'win': return Math.floor(t * 4) % 2 ? 'win1' : 'win0';
    default: return anim;
  }
}

// 메뉴 미리보기용 큰 그림
export function drawPreview(canvas, look, t = 0, frame = 'idle0') {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = getSheet(look, OL, t);
  const fr = s.right[frame];
  const sc = Math.floor(Math.min(canvas.width / FW, canvas.height / FH));
  ctx.drawImage(fr, Math.floor((canvas.width - FW * sc) / 2), canvas.height - FH * sc, FW * sc, FH * sc);
}
