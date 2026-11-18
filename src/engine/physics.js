// 플레이어 물리 (고정 60fps 스텝)
import { TILE, approach, sign, rectsOverlap } from '../core/util.js';
import { S_SOLID, S_ONEWAY, S_LADTOP, SF, W } from './world.js';

export const P = {
  G: 900, JUMP_V: 294, MAX_FALL: 288, RUN: 96, CROUCH: 48,
  ACC_G: 1200, DEC_G: 1600, ACC_A: 900, DEC_A: 520,
  WALL_SLIDE: 48, WJ_VX: 170, WJ_VY: 270, WJ_LOCK: 0.15,
  DASH_V: 270, DASH_T: 0.13, DASH_CD: 0.6,
  COYOTE: 0.1, BUFFER: 0.1, SLIDE_T: 0.4,
  STAND_H: 20, CROUCH_H: 12, BW: 10,
  TRAMP_V: 380, TRAMP_SIDE: 300, CLIMB: 80, CONV: 48, WIND: 58,
};

// 이벤트 비트
export const EV = { JUMP: 1, LAND: 2, WJUMP: 4, DASH: 8, BOUNCE: 16, SLIDE: 32, BOOST: 512, WALL: 128, STEP: 256 };

export function newBody(x, feetY) {
  return {
    x: x - P.BW / 2, y: feetY - P.STAND_H, w: P.BW, h: P.STAND_H,
    vx: 0, vy: 0, ground: false, gsurf: 0, coyote: 0, buf: 0, held: false,
    crouch: false, slide: 0, dash: 0, dashCd: 0, dvx: 0, dvy: 0, airDash: false,
    wall: 0, wallOk: false, lock: 0, lockDir: 0, climb: false, face: 1,
    plat: -1, noCut: false, ev: 0, boostT: 0, px: 0, py: 0, walkT: 0, fallV: 0,
  };
}
export function copyBody(b) { return Object.assign({}, b); }

const FAN_DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const NO_INPUT = { mx: 0, my: 0, jump: false, jumpP: false, dashP: false };

function solidCell(world, tx, ty) { return world.solidAt(tx, ty) === S_SOLID; }

function canStand(world, b) {
  const top = b.y + b.h - P.STAND_H;
  const x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 0.01) / TILE);
  const y0 = Math.floor(top / TILE), y1 = Math.floor((b.y - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidCell(world, tx, ty)) return false;
  return true;
}
function setCrouch(world, b, on) {
  if (on && !b.crouch) { b.y += P.STAND_H - P.CROUCH_H; b.h = P.CROUCH_H; b.crouch = true; return true; }
  if (!on && b.crouch) {
    if (!canStand(world, b)) return false;
    b.y -= P.STAND_H - P.CROUCH_H; b.h = P.STAND_H; b.crouch = false; return true;
  }
  return true;
}

function ladderCenter(world, b) {
  const cx = b.x + b.w / 2;
  const tx = Math.floor(cx / TILE);
  const y0 = Math.floor((b.y + 2) / TILE), y1 = Math.floor((b.y + b.h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++) if (world.ladderAt(tx, ty)) return tx * TILE + 8;
  return -1;
}

// mode: 0 = 실제 플레이, 1 = AI 정적 시뮬(움직이는 요소 무시), 2 = AI 실행 검사(전부 반영, 부수효과 없음)
export function step(b, inp, world, t, dt, mode = 0) {
  b.ev = 0;
  b.px = b.x; b.py = b.y;
  const full = mode !== 1;
  world.now = t; world.staticMode = mode === 1;
  const ig = world._ig || (world._ig = { x: 0, y: 0, w: 0, h: 0 });
  ig.x = b.x; ig.y = b.y; ig.w = b.w; ig.h = b.h; world.ignore = ig;
  // 영역 효과
  const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
  let inGrav = false, inWeb = false;
  for (const r of world.gravs) if (bcx >= r.x && bcx < r.x + r.w && bcy >= r.y && bcy < r.y + r.h) { inGrav = true; break; }
  for (const r of world.webs) if (rectsOverlap(b.x, b.y, b.w, b.h, r.x, r.y, r.w, r.h)) { inWeb = true; break; }
  if (inp.jumpP) b.buf = P.BUFFER; else if (b.buf > 0) b.buf -= dt;
  b.held = inp.jump;
  if (b.dashCd > 0) b.dashCd -= dt;
  if (b.lock > 0) b.lock -= dt;
  const surf = b.ground ? b.gsurf : 0;
  let exDx = 0, exDy = 0;

  // 사다리
  const lad = ladderCenter(world, b);
  if (!b.climb && lad >= 0 && b.dash <= 0 && (inp.my < -0.5 || (inp.my > 0.5 && !b.ground) ||
      (inp.my > 0.5 && b.ground && world.ladderAt(Math.floor((b.x + b.w / 2) / TILE), Math.floor((b.y + b.h + 1) / TILE))))) {
    if (b.crouch) setCrouch(world, b, false);
    b.climb = true; b.vx = 0; b.vy = 0;
  }
  if (b.climb && lad < 0) b.climb = false;

  // 웅크리기 / 슬라이딩
  if (b.ground && inp.my > 0.5 && !b.climb && b.dash <= 0) {
    if (!b.crouch) {
      setCrouch(world, b, true);
      if (Math.abs(b.vx) > 70) { b.slide = P.SLIDE_T; b.ev |= EV.SLIDE; }
    }
  } else if (b.crouch && (!b.ground || inp.my <= 0.5) && b.slide <= 0) {
    setCrouch(world, b, false);
  }
  if (b.crouch && b.slide > 0 && inp.my <= 0.5 && canStand(world, b)) { b.slide = 0; setCrouch(world, b, false); }

  // 대시 시작
  if (inp.dashP && b.dashCd <= 0 && (b.ground || !b.airDash) && !b.climb) {
    let dx = Math.abs(inp.mx) > 0.3 ? sign(inp.mx) : 0;
    let dy = Math.abs(inp.my) > 0.5 ? sign(inp.my) : 0;
    if (b.ground && dy > 0) dy = 0;
    if (!dx && !dy) dx = b.face;
    if (b.crouch && !setCrouch(world, b, false)) { dy = 0; if (!dx) dx = b.face; }
    if (!b.crouch) {
      const n = Math.hypot(dx, dy);
      b.dvx = (dx / n) * P.DASH_V; b.dvy = (dy / n) * P.DASH_V * (dy < 0 ? 0.7 : 1);
      b.dash = P.DASH_T; b.dashCd = P.DASH_CD; b.slide = 0;
      if (!b.ground) b.airDash = true;
      b.ground = false; b.coyote = 0;
      if (dx) b.face = dx;
      b.ev |= EV.DASH;
    }
  }

  if (b.dash > 0) {
    b.dash -= dt;
    b.vx = b.dvx; b.vy = b.dvy;
    if (b.dash <= 0) { b.vx *= 0.55; b.vy = b.vy < 0 ? b.vy * 0.35 : 0; }
  } else if (b.climb) {
    b.vx = inp.mx * 48;
    b.vy = inp.my * P.CLIMB;
    if (Math.abs(inp.mx) < 0.3) b.x += (lad - (b.x + b.w / 2)) * 0.35;
    if (b.buf > 0) { b.climb = false; b.vy = -P.JUMP_V * 0.85; b.buf = 0; b.ev |= EV.JUMP; }
  } else {
    let max = b.crouch ? P.CROUCH : P.RUN;
    if (surf === SF.STICKY) max *= 0.4;
    else if (surf === SF.SAND) max *= 0.7;
    let mx = inp.mx;
    if (b.lock > 0 && sign(mx) === b.lockDir) mx *= 0.2;
    if (b.ground && (surf === SF.BOOST_R || surf === SF.BOOST_L)) {
      const d = surf === SF.BOOST_R ? 1 : -1;
      if (b.boostT <= 0 || sign(b.vx) !== d) b.ev |= EV.BOOST;
      b.vx = d * 260; b.boostT = 0.45; b.face = d;
    }
    if (b.boostT > 0) b.boostT -= dt;
    if (b.boostT > 0 && Math.abs(b.vx) > max && b.slide <= 0) {
      b.vx = approach(b.vx, sign(b.vx) * max, 170 * dt);
    } else if (b.slide > 0) {
      b.slide -= dt;
      b.vx = approach(b.vx, 0, 150 * dt);
    } else {
      const target = mx * max;
      let acc, dec;
      if (b.ground) { acc = P.ACC_G; dec = P.DEC_G; if (surf === SF.ICE) { acc /= 5; dec /= 5; } }
      else { acc = P.ACC_A; dec = P.DEC_A; }
      if (Math.abs(target) > 0.01) {
        if (sign(target) === sign(b.vx) || b.vx === 0) {
          if (Math.abs(b.vx) <= Math.abs(target)) b.vx = approach(b.vx, target, acc * dt);
          else b.vx = approach(b.vx, target, dec * 0.5 * dt);
        } else b.vx = approach(b.vx, target, (acc + dec) * dt);
      } else b.vx = approach(b.vx, 0, dec * dt);
    }
    if (Math.abs(mx) > 0.2 && b.slide <= 0) b.face = sign(mx);
    // 중력
    let g = P.G;
    if (b.vy < 0 && !b.held && !b.noCut) g *= 3;
    if (b.vy >= 0) b.noCut = false;
    if (inGrav) g *= 0.42;
    const gs = world.gravScale;
    g *= gs;
    b.vy = Math.min(b.vy + g * dt, inGrav ? 130 : gs < 1 ? P.MAX_FALL * 0.6 : P.MAX_FALL);
    // 벽 미끄러짐
    if (!b.ground && b.wall !== 0 && b.wallOk && sign(inp.mx) === b.wall && b.vy > P.WALL_SLIDE) {
      b.vy = P.WALL_SLIDE; b.ev |= EV.WALL;
    }
    // 점프
    if (b.buf > 0) {
      if (b.ground || b.coyote > 0) {
        if (b.crouch) setCrouch(world, b, false);
        if (!b.crouch) {
          b.vy = -P.JUMP_V * (surf === SF.STICKY ? 0.707 : 1);
          b.ground = false; b.coyote = 0; b.buf = 0; b.slide = 0; b.plat = -1;
          b.ev |= EV.JUMP;
        }
      } else if (b.wall !== 0 && b.wallOk) {
        b.vx = -b.wall * P.WJ_VX; b.vy = -P.WJ_VY;
        b.lock = P.WJ_LOCK; b.lockDir = b.wall; b.face = -b.wall; b.buf = 0;
        b.ev |= EV.WJUMP;
      }
    }
  }

  // 외부 힘
  if (b.ground && b.dash <= 0) {
    if (surf === SF.CONV_R) exDx += P.CONV * dt;
    else if (surf === SF.CONV_L) exDx -= P.CONV * dt;
  }
  if (full && world.hasWind && !b.climb) {
    const wd = world.wind(t);
    if (wd.active) exDx += wd.dir * (wd.sand ? 46 : P.WIND) * dt;
  }
  for (const f of world.fans) {
    if (f.ray <= 0) continue;
    const r = world.beamRect(f, f.ray, 16);
    if (!rectsOverlap(b.x, b.y, b.w, b.h, r.x, r.y, r.w, r.h)) continue;
    const [fx, fy] = FAN_DIR[f.rot];
    if (fx) exDx += fx * 85 * dt;
    else if (fy < 0) { b.vy = Math.max(b.vy - 1700 * dt, -190); b.noCut = true; if (b.ground) b.ground = false; }
    else b.vy = Math.min(b.vy + 900 * dt, P.MAX_FALL);
  }
  const safe = world.inSafe(b);
  for (const h of (safe ? [] : world.holes)) {
    const cx = h.x * TILE + 8, cy = h.y * TILE + 8;
    const dx = cx - (b.x + b.w / 2), dy = cy - (b.y + b.h / 2);
    const d = Math.hypot(dx, dy);
    if (d < 48 && d > 0.1) {
      const a = (560 * (1 - d / 48) + 120) * dt;
      b.vx += (dx / d) * a; b.vy += (dy / d) * a;
      if (b.climb) b.climb = false;
    }
  }
  // 움직이는 발판 따라가기
  if (full && b.plat >= 0) {
    const it = world.items.get(b.plat);
    if (it) {
      const r0 = world.moverRect(it, t - dt), r1 = world.moverRect(it, t);
      exDx += r1.x - r0.x; exDy += r1.y - r0.y;
    } else b.plat = -1;
  }

  if (inWeb) {
    if (b.dash > 0) { b.dash = 0; }
    b.vx = Math.max(-28, Math.min(28, b.vx));
    b.vy = Math.max(-150, Math.min(40, b.vy));
  }
  const wasGround = b.ground;
  moveX(b, b.vx * dt + exDx, world);
  moveY(b, b.vy * dt + exDy, world, inp, t, dt, full);

  if (b.ground) {
    b.airDash = false; b.coyote = P.COYOTE;
    if (!wasGround) { b.ev |= EV.LAND; b.fallV = b.vyPrev || 0; }
    if (mode === 0) {
      const ty = Math.floor((b.y + b.h + 1) / TILE);
      world.onStand(ty * W + Math.floor(b.x / TILE));
      world.onStand(ty * W + Math.floor((b.x + b.w - 0.01) / TILE));
    }
  } else if (b.coyote > 0) b.coyote -= dt;
  b.vyPrev = b.vy;

  // 벽 감지
  b.wall = 0; b.wallOk = false;
  if (!b.ground && !b.climb) {
    const y0 = Math.floor((b.y + 2) / TILE), y1 = Math.floor((b.y + b.h - 2) / TILE);
    const lx = Math.floor((b.x - 1) / TILE), rx = Math.floor((b.x + b.w + 0.5) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      if (solidCell(world, rx, ty)) { b.wall = 1; b.wallOk = world.surfAt(rx, ty) !== SF.STICKY; break; }
      if (solidCell(world, lx, ty)) { b.wall = -1; b.wallOk = world.surfAt(lx, ty) !== SF.STICKY; break; }
    }
  }

  if (b.ground && Math.abs(b.vx) > 10) b.walkT += dt * Math.abs(b.vx) / 60;
}

function moveX(b, dx, world) {
  if (!dx) return;
  b.x += dx;
  const y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h - 0.01) / TILE);
  if (dx > 0) {
    const tx = Math.floor((b.x + b.w - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      if (solidCell(world, tx, ty)) {
        b.x = tx * TILE - b.w;
        if (world.surfAt(tx, ty) === SF.TRAMP_L) sideBounce(b, -1);
        else b.vx = Math.min(b.vx, 0);
        return;
      }
    }
  } else {
    const tx = Math.floor(b.x / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      if (solidCell(world, tx, ty)) {
        b.x = (tx + 1) * TILE;
        if (world.surfAt(tx, ty) === SF.TRAMP_R) sideBounce(b, 1);
        else b.vx = Math.max(b.vx, 0);
        return;
      }
    }
  }
}
function sideBounce(b, dir) {
  b.vx = dir * P.TRAMP_SIDE; b.vy = Math.min(b.vy, -200);
  b.lock = 0.3; b.lockDir = -dir; b.dash = 0; b.airDash = false; b.noCut = true;
  b.ev |= EV.BOUNCE;
}

function moveY(b, dy, world, inp, t, dt, full) {
  const prevBottom = b.y + b.h;
  b.y += dy;
  const x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 0.01) / TILE);
  b.ground = false;
  if (dy >= 0) {
    // 움직이는 발판
    if (full && b.dash <= 0 && b.vy >= 0) {
      for (const it of world.movers) {
        const r1 = world.moverRect(it, t), r0 = world.moverRect(it, t - dt);
        if (b.x + b.w <= r1.x || b.x >= r1.x + r1.w) continue;
        const bottom = b.y + b.h;
        if ((prevBottom <= r0.y + 0.5 || (b.plat === it.id && prevBottom <= r0.y + 3)) && bottom >= r1.y - 0.01 && bottom <= r1.y + 8) {
          b.y = r1.y - b.h; b.vy = 0; b.ground = true; b.gsurf = SF.WOOD; b.plat = it.id;
          return;
        }
      }
    }
    b.plat = -1;
    const ty = Math.floor((b.y + b.h - 0.01) / TILE);
    const rowTop = ty * TILE;
    let land = false, tramp = false, surfHit = 0, centerSurf = -1;
    const cx = Math.floor((b.x + b.w / 2) / TILE);
    for (let tx = x0; tx <= x1; tx++) {
      const s = world.solidAt(tx, ty);
      let hit = false;
      if (s === S_SOLID) hit = true;
      else if ((s === S_ONEWAY || s === S_LADTOP) && prevBottom <= rowTop + 0.01) {
        if (s === S_LADTOP && (b.climb || inp.my > 0.5)) hit = false;
        else hit = true;
      }
      if (hit) {
        land = true;
        const sf = world.surfAt(tx, ty);
        if (sf === SF.TRAMP_U) tramp = true;
        if (tx === cx) centerSurf = sf;
        else if (!surfHit) surfHit = sf;
      }
    }
    if (land) {
      b.y = rowTop - b.h;
      if (tramp && b.dash <= 0) {
        b.vy = -P.TRAMP_V; b.airDash = false; b.noCut = true; b.ev |= EV.BOUNCE; b.climb = false;
        return;
      }
      b.vy = 0; b.ground = true; b.climb = false;
      b.gsurf = centerSurf >= 0 ? centerSurf : surfHit;
    }
  } else {
    const ty = Math.floor(b.y / TILE);
    for (let tx = x0; tx <= x1; tx++) {
      if (solidCell(world, tx, ty)) {
        b.y = (ty + 1) * TILE;
        b.vy = 0; b.noCut = false;
        if (b.dash > 0 && b.dvy < 0) { b.dvy = 0; }
        return;
      }
    }
  }
}

// 몸 상태를 애니메이션 이름으로
export function animOf(b) {
  if (b.climb) return 'climb';
  if (b.dash > 0) return 'dash';
  if (b.crouch) return b.slide > 0 ? 'slide' : 'crouch';
  if (!b.ground) {
    if (b.wall !== 0 && b.vy > 0 && b.wallOk) return 'wall';
    return b.vy < 0 ? 'jump' : 'fall';
  }
  if (Math.abs(b.vx) > 12) return 'run';
  return 'idle';
}
export { rectsOverlap };
