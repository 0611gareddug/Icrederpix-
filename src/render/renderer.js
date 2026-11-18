// 화면 그리기
import { SPR, tint, OL } from '../art/sprites.js';
import { renderTerrain, makeBackground, THEMES } from '../art/terrain.js';
import { rotated, flipped, mkCanvas } from '../art/canvas.js';
import { W, H, SF, DIRS, T_CONV_R, T_CONV_L } from '../engine/world.js';
import { ITEMS, itemCells } from '../data/items.js';
import { mod } from '../core/util.js';

export const VH = 270;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.world = null;
    this.terrain = null;
    this.bg = null;
    this.extra = {};
    this.resize();
  }
  resize() {
    // 픽셀아트라 고해상도가 필요 없음: 화면 픽셀 수를 약 FHD 이하로 제한해 채우기 비용을 줄인다
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const area = window.innerWidth * window.innerHeight * dpr * dpr;
    const BUDGET = 1920 * 1080;
    if (area > BUDGET) dpr *= Math.sqrt(BUDGET / area);
    const cw = Math.max(320, Math.round(window.innerWidth * dpr));
    const ch = Math.max(180, Math.round(window.innerHeight * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    let S = ch / VH;
    if (S >= 2 && Math.floor(S) / S >= 0.88) S = Math.floor(S);
    this.S = S; this.cw = cw; this.ch = ch; this.dpr = dpr;
    this.viewW = cw / S; this.viewH = ch / S;
    this.ctx.imageSmoothingEnabled = false;
  }
  setWorld(world) {
    this.world = world;
    this.terrainVer = -1;
    this.bg = makeBackground(world.theme);
    if (!this.extra.arrows) {
      const a = SPR.arrowH;
      this.extra.arrows = [rotated(a, 3), a, rotated(a, 1), flipped(a)];
      this.extra.convL = SPR.conv.map((c) => flipped(c));
    }
  }
  ensureTerrain() {
    if (this.world && this.terrainVer !== this.world.version) {
      this.terrain = renderTerrain(this.world, this.terrain);
      this.terrainVer = this.world.version;
    }
  }

  // cam: {x,y,z}  s: 그리기 상태 (game이 전달)
  draw(s) {
    const { ctx, S, cw, ch } = this;
    const w = this.world;
    if (!w) { ctx.fillStyle = '#14121f'; ctx.fillRect(0, 0, cw, ch); return; }
    this.ensureTerrain();
    const cam = s.cam;
    const k = S * cam.z;
    // 배경
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg.grad, 0, 0, 1, 256, 0, 0, cw, ch);
    const mapBottom = H * 16;
    const camBottom = cam.y + this.viewH / cam.z;
    for (const L of this.bg.layers) {
      const lw = this.bg.LW * S, lh = L.c.height * S;
      let ox = -mod(cam.x * L.factor * k, lw);
      let y;
      if (L.yAnchor === 0) y = 6 * S - cam.y * L.factor * S * 0.5;
      else y = ch - lh + (camBottom - mapBottom) * L.factor * S * 0.6 + 10 * S;
      y = Math.round(y);
      for (let x = Math.round(ox); x < cw; x += lw) ctx.drawImage(L.c, x, y, lw, lh);
    }
    // 월드 좌표계
    const ox = Math.round(-cam.x * k), oy = Math.round(-cam.y * k);
    ctx.setTransform(k, 0, 0, k, ox, oy);
    const vx0 = cam.x, vy0 = cam.y, vx1 = cam.x + this.viewW / cam.z, vy1 = cam.y + this.viewH / cam.z;
    ctx.drawImage(this.terrain, 0, -16);
    const t = s.t;
    this.drawMapDyn(ctx, t, vx0, vx1);
    this.drawGoal(ctx, t);
    this.drawDynamic(ctx, t, s);
    // 용암
    if (w.hasLava) this.drawLava(ctx, w.lavaTop(t), t, vx0, vx1);
    // 캐릭터
    for (const b of s.bodies) this.drawBody(ctx, b, t);
    s.particles.draw(ctx, vx0, vy0, vx1, vy1);
    if (s.place) this.drawPlacement(ctx, s.place, t);
    this.drawStorm(t);
    // 화면 좌표: 이름표
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (s.names) {
      const fs = Math.max(11, Math.round(S * 5.5 * Math.min(1, cam.z * 1.2)));
      ctx.font = `${fs}px Galmuri11, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      for (const b of s.bodies) {
        if (!b.name || b.hidden) continue;
        const sx = (b.dx + 10) * k + ox, sy = (b.dy + (b.crouch ? 14 : 4)) * k + oy;
        ctx.fillStyle = 'rgba(20,16,32,0.65)';
        const tw = ctx.measureText(b.name).width;
        ctx.fillRect(Math.round(sx - tw / 2 - 4), Math.round(sy - fs - 3), Math.round(tw + 8), fs + 4);
        ctx.fillStyle = b.slotColor || '#fff';
        ctx.fillText(b.name, Math.round(sx), Math.round(sy));
      }
    }
    if (s.place && s.place.cursors) {
      const fs = Math.max(11, Math.round(S * 5));
      ctx.font = `${fs}px Galmuri11, sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (const c of s.place.cursors) {
        if (c.x === undefined) continue;
        const sx = (c.x * 16 + 16) * k + ox, sy = (c.y * 16 - 6) * k + oy;
        ctx.fillStyle = c.color; ctx.fillText(c.name, Math.round(sx), Math.round(sy));
      }
    }
  }

  // 맵 고유 요소 (공장 컨베이어/프레스)
  drawMapDyn(ctx, t, vx0, vx1) {
    const w = this.world;
    if (!w.convCells) {
      w.convCells = [];
      for (let i = 0; i < W * H; i++) { const tt = w.terrain[i]; if (tt === T_CONV_R || tt === T_CONV_L) w.convCells.push([i % W, Math.floor(i / W), tt === T_CONV_R]); }
    }
    if (w.convCells.length) {
      const fr = Math.floor(t * 14) % 4;
      for (const [x, y, right] of w.convCells) {
        if (x * 16 < vx0 - 16 || x * 16 > vx1) continue;
        ctx.drawImage((right ? SPR.conv : this.extra.convL)[fr], x * 16, y * 16);
      }
    }
    for (const pr of w.presses) {
      const st = w.crusherState(pr, t);
      const X = pr.x * 16, Y = pr.y * 16;
      const jx = st.shake ? (Math.floor(t * 40) % 2 ? 1 : -1) : 0;
      if (st.d > 1) { ctx.fillStyle = '#8a94a8'; ctx.fillRect(X + 5, Y + 12, 6, st.d); ctx.fillStyle = '#5a6276'; ctx.fillRect(X + 7, Y + 12, 2, st.d); }
      ctx.drawImage(SPR.crushHead, X + jx, Y + st.d);
    }
  }
  // 모래폭풍 화면 효과 (화면 좌표)
  drawStorm(t) {
    const w = this.world;
    if (!w || !w.storm) return;
    const wd = w.wind(t);
    let a = 0;
    if (wd.active) { const p = wd.p - 7; a = Math.min(1, p * 2, (4 - p) * 2); }
    if (a <= 0) return;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(222,170,96,${0.5 * a})`;
    ctx.fillRect(0, 0, this.cw, this.ch);
    ctx.fillStyle = `rgba(255,230,170,${0.55 * a})`;
    const S = this.S;
    for (let k = 0; k < 60; k++) {
      const x = mod(k * 137 - t * 600, this.cw + 40) - 20;
      const y = (k * 71) % this.ch;
      ctx.fillRect(Math.round(x), y, Math.round(10 * S), Math.max(1, Math.round(S * 0.6)));
    }
  }

  drawGoal(ctx, t) {
    const g = this.world.goalCell;
    ctx.drawImage(SPR.flag[Math.floor(t * 6) % 3], g.x * 16 + 1, g.y * 16 - 16);
  }

  drawLava(ctx, top, t, vx0, vx1) {
    const y0 = Math.round(top);
    const x0 = Math.max(0, Math.floor(vx0 / 4) * 4), x1 = Math.min(W * 16, vx1 + 4);
    ctx.fillStyle = '#c8280a'; ctx.fillRect(x0, y0 + 4, x1 - x0, H * 16 - y0 + 40);
    ctx.fillStyle = '#ff6a00'; ctx.fillRect(x0, y0 + 2, x1 - x0, 4);
    for (let x = x0; x < x1; x += 4) {
      const h = Math.round(Math.sin(x * 0.15 + t * 3) * 1.5 + Math.sin(x * 0.07 - t * 2) * 1.5);
      ctx.fillStyle = '#ffb000'; ctx.fillRect(x, y0 + h, 4, 2);
    }
    for (let i = 0; i < 6; i++) {
      const bx = mod(i * 97 + t * 13 * (i % 2 ? 1 : -1), W * 16), by = y0 + 8 + ((i * 37) % 20);
      ctx.fillStyle = '#ff8a2a'; ctx.fillRect(Math.round(bx), by, 3, 2);
    }
  }

  drawDynamic(ctx, t, s) {
    const w = this.world;
    for (const it of w.items.values()) this.drawItemDyn(ctx, it, t, s, false);
    // 고드름
    for (let i = 0; i < w.icicles.length; i++) {
      const ic = w.icicles[i];
      const st = w.icicleState(i, ic, t);
      if (!st.on) continue;
      const jx = st.shake ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0;
      ctx.drawImage(SPR.icicle, ic.x * 16 + 4 + jx, ic.y * 16 + st.y);
    }
  }

  // ghost=true 이면 배치 미리보기 (정적 부분도 그림)
  drawItemDyn(ctx, it, t, s, ghost) {
    const X = it.x * 16, Y = it.y * 16;
    const w = this.world;
    switch (it.type) {
      case 'conveyor': {
        const fr = Math.floor(t * 14) % 4;
        const arr = it.rot === 1 ? SPR.conv : this.extra.convL;
        for (let k = 0; k < 3; k++) ctx.drawImage(arr[fr], X + k * 16, Y);
        break;
      }
      case 'crumble': {
        const i = it.y * W + it.x;
        const st = ghost ? 0 : w.crS[i];
        if (st === 2) { ctx.globalAlpha = 0.18; ctx.drawImage(SPR.crumble, X, Y); ctx.globalAlpha = 1; }
        else ctx.drawImage(SPR.crumble, X + (st === 1 ? (Math.floor(t * 40) % 2 ? 1 : -1) : 0), Y);
        break;
      }
      case 'tramp': {
        const sq = s && s.bounce && s.bounce.get(it.id) > t ? 1 : 0;
        const arr = it.rot === 0 ? SPR.tramp : it.rot === 1 ? SPR.trampR : SPR.trampL;
        ctx.drawImage(arr[sq], X, Y);
        break;
      }
      case 'movplat': {
        const r = w.moverRect(it, ghost ? 0 : t);
        if (ghost) {
          ctx.fillStyle = 'rgba(255,210,63,0.5)';
          if (it.rot === 0) for (let x = X + 32; x < X + 96; x += 6) ctx.fillRect(x, Y + 3, 3, 2);
          else for (let y = Y - 64; y < Y; y += 6) ctx.fillRect(X + 15, y, 2, 3);
        }
        ctx.drawImage(SPR.movplat, Math.round(r.x), Math.round(r.y));
        break;
      }
      case 'blackhole': {
        ctx.fillStyle = 'rgba(160,100,255,0.06)';
        ctx.beginPath(); ctx.arc(X + 8, Y + 8, 48, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(190,140,255,0.5)';
        for (let a = 0; a < 24; a++) {
          const an = a / 24 * Math.PI * 2 + t * 0.8;
          const rr = 48 - mod(t * 30 + a * 7, 42);
          ctx.fillRect(Math.round(X + 8 + Math.cos(an) * rr), Math.round(Y + 8 + Math.sin(an) * rr), 1, 1);
        }
        ctx.drawImage(SPR.hole[Math.floor(t * 10) % 4], X, Y);
        break;
      }
      case 'saw': {
        ctx.save(); ctx.translate(X + 8, Y + 8); ctx.rotate(t * 14); ctx.drawImage(SPR.saw, -8, -8); ctx.restore();
        break;
      }
      case 'mace': {
        if (ghost) ctx.drawImage(SPR.macePost, X, Y);
        const b = w.maceBall(it, t);
        const cx = X + 8, cy = Y + 8;
        ctx.fillStyle = '#9aa0ae';
        for (let k = 1; k < 6; k++) ctx.fillRect(Math.round(cx + (b.x - cx) * k / 6) - 1, Math.round(cy + (b.y - cy) * k / 6) - 1, 2, 2);
        ctx.drawImage(SPR.maceBall, Math.round(b.x - 8), Math.round(b.y - 8));
        if (ghost) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        break;
      }
      case 'arrow': {
        if (ghost) { this.rayGuide(ctx, it, 40); break; }
        const spr = this.extra.arrows[it.rot];
        w.forArrows(it, t, (x, y, ww, hh) => ctx.drawImage(spr, Math.round(x), Math.round(y)));
        break;
      }
      case 'flame': {
        if (ghost) { this.rayGuide(ctx, it, 3); break; }
        const st = w.flameState(it, t);
        if (st === 1) {
          const [dx, dy] = DIRS[it.rot];
          ctx.fillStyle = 'rgba(160,160,170,0.7)';
          for (let k = 0; k < 3; k++) ctx.fillRect(X + 7 + dx * (10 + k * 4) + ((t * 50 + k * 3) % 3) - 1, Y + 7 + dy * (10 + k * 4) - k, 3, 3);
        } else if (st === 2 && it.ray > 0) {
          const r = w.beamRect(it, it.ray, 10);
          ctx.fillStyle = '#ff3a00'; ctx.fillRect(r.x, r.y, r.w, r.h);
          const inset = (n) => (r.w > r.h ? [r.x, r.y + n, r.w, r.h - n * 2] : [r.x + n, r.y, r.w - n * 2, r.h]);
          ctx.fillStyle = '#ff9a00'; ctx.fillRect(...inset(2));
          ctx.fillStyle = '#ffe14a'; ctx.fillRect(...inset(4));
          ctx.fillStyle = '#ff3a00';
          for (let k = 0; k < 6; k++) {
            const f = (Math.sin(t * 40 + k * 2.3) + 1) * 2;
            if (r.w > r.h) ctx.fillRect(r.x + (k / 6) * r.w, r.y - f * 0.5, 4, 2);
            else ctx.fillRect(r.x - f * 0.5, r.y + (k / 6) * r.h, 2, 4);
          }
        }
        break;
      }
      case 'laser': {
        if (ghost) { this.rayGuide(ctx, it, 48); break; }
        const st = w.laserState(it, t);
        if (st === 1 && it.ray > 0) {
          if (Math.floor(t * 16) % 2) { const r = w.beamRect(it, it.ray, 1); ctx.fillStyle = 'rgba(255,60,90,0.8)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
        } else if (st === 2 && it.ray > 0) {
          const wd = 6 + (Math.floor(t * 30) % 2);
          const r = w.beamRect(it, it.ray, wd);
          ctx.fillStyle = '#ff2a5a'; ctx.fillRect(r.x, r.y, r.w, r.h);
          const c = w.beamRect(it, it.ray, 2);
          ctx.fillStyle = '#ffe0ea'; ctx.fillRect(c.x, c.y, c.w, c.h);
        }
        break;
      }
    }
    this.drawNewDyn(ctx, it, t, X, Y, ghost);
    if (ghost) {
      // 정적 스프라이트 부분
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
        case 'bigstone': ctx.drawImage(SPR.stone, X, Y); break;
        case 'web': ctx.drawImage(SPR.web, X, Y); break;
        case 'cannon': ctx.drawImage(it.rot === 1 ? SPR.cannonR : SPR.cannonL, X, Y); this.rayGuide(ctx, it, 24); break;
        case 'crusher': ctx.drawImage(SPR.crushHouse, X, Y); this.rayGuide(ctx, { x: it.x, y: it.y, rot: 2 }, 4); break;
        case 'bomb': {
          ctx.fillStyle = 'rgba(255,90,60,0.22)';
          ctx.beginPath(); ctx.arc(X + 8, Y + 8, 40, 0, Math.PI * 2); ctx.fill();
          ctx.drawImage(SPR.bomb, X, Y);
          break;
        }
      }
    }
  }

  // v1.2 추가 함정 그리기
  drawNewDyn(ctx, it, t, X, Y, ghost) {
    const w = this.world;
    switch (it.type) {
      case 'cloud': {
        const i = it.y * W + it.x;
        const st = ghost ? 0 : w.crS[i];
        if (st === 2) { ctx.globalAlpha = 0.15; ctx.drawImage(SPR.cloud, X, Y); ctx.globalAlpha = 1; }
        else {
          const fade = st === 1 ? 1 - w.crT[i] * 0.6 : 1;
          const prev = ctx.globalAlpha;
          ctx.globalAlpha = prev * fade;
          ctx.drawImage(SPR.cloud, X + (st === 1 ? Math.round(Math.sin(t * 50)) : 0), Y + Math.round(Math.sin(t * 2 + it.x) * 0.6));
          ctx.globalAlpha = prev;
        }
        break;
      }
      case 'booster': ctx.drawImage((it.rot === 1 ? SPR.boostR : SPR.boostL)[Math.floor(t * 9) % 3], X, Y); break;
      case 'lowgrav': {
        ctx.fillStyle = 'rgba(122,212,255,0.13)'; ctx.fillRect(X, Y, 48, 48);
        ctx.fillStyle = 'rgba(160,230,255,0.55)';
        ctx.fillRect(X, Y, 48, 1); ctx.fillRect(X, Y + 47, 48, 1); ctx.fillRect(X, Y, 1, 48); ctx.fillRect(X + 47, Y, 1, 48);
        for (let k = 0; k < 7; k++) {
          const yy = 46 - mod(t * 12 + k * 7.3, 46), xx = (k * 13 + 5) % 44;
          ctx.fillRect(X + xx + 1 + Math.round(Math.sin(t * 2 + k) * 2), Y + yy, 2, 2);
        }
        break;
      }
      case 'fan': {
        ctx.drawImage(SPR.fan[Math.floor(t * 20) % 2][it.rot], X, Y);
        const len = ghost ? w.ray(it.x, it.y, it.rot, 5) * 16 : it.ray;
        if (len > 0) {
          const r = w.beamRect(it, len, 16);
          ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          const [dx, dy] = DIRS[it.rot];
          for (let k = 0; k < 5; k++) {
            const d = mod(t * 110 + k * (len / 5), len);
            const ox = (k * 5) % 13 + 1;
            if (dx) ctx.fillRect(dx > 0 ? r.x + d : r.x + r.w - d - 6, r.y + ox, 6, 1);
            else ctx.fillRect(r.x + ox, dy > 0 ? r.y + d : r.y + r.h - d - 6, 1, 6);
          }
        }
        break;
      }
      case 'ghost': {
        let a = 1;
        if (!ghost) {
          if (!w.ghostSolid(it, t)) a = 0.18;
          else if (w.ghostWarn(it, t)) a = Math.floor(t * 12) % 2 ? 0.35 : 0.9;
        }
        const prev = ctx.globalAlpha;
        ctx.globalAlpha = prev * a;
        ctx.drawImage(SPR.ghost, X, Y);
        ctx.globalAlpha = prev;
        break;
      }
      case 'cannon': {
        if (ghost) break;
        if (w.cannonWarn(it, t)) { ctx.fillStyle = Math.floor(t * 16) % 2 ? '#ffe14a' : '#ff6a2a'; ctx.fillRect(it.rot === 1 ? X + 15 : X - 1, Y + 5, 2, 4); }
        w.forBalls(it, t, (bx, by) => ctx.drawImage(SPR.ball, Math.round(bx - 6), Math.round(by - 6)));
        break;
      }
      case 'crusher': {
        const st = ghost ? { d: 0 } : w.crusherState(it, t);
        const jx = st.shake ? (Math.floor(t * 40) % 2 ? 1 : -1) : 0;
        if (st.d > 1) { ctx.fillStyle = '#6a7080'; ctx.fillRect(X + 7, Y + 12, 2, st.d); }
        ctx.drawImage(SPR.crushHead, X + jx, Y + st.d);
        break;
      }
      case 'poison': ctx.drawImage(SPR.poison[Math.floor(t * 4) % 3], X, Y); break;
      case 'sawrail': {
        ctx.fillStyle = '#4a4e5e';
        if (it.rot === 0) { ctx.fillRect(X + 6, Y + 7, 68, 2); ctx.fillRect(X + 6, Y + 5, 2, 6); ctx.fillRect(X + 72, Y + 5, 2, 6); }
        else { ctx.fillRect(X + 7, Y - 58, 2, 68); ctx.fillRect(X + 5, Y - 58, 6, 2); ctx.fillRect(X + 5, Y + 8, 6, 2); }
        const p = ghost ? { x: X + 8, y: Y + 8 } : w.sawRailPos(it, t);
        ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(t * 16); ctx.drawImage(SPR.saw, -8, -8); ctx.restore();
        break;
      }
      case 'mine': {
        const st = ghost ? 0 : w.mineState(it, t);
        if (st === 3) { ctx.globalAlpha = 0.35; ctx.drawImage(SPR.mine[0], X, Y); ctx.globalAlpha = 1; break; }
        const on = st === 1 ? Math.floor(t * 20) % 2 : Math.floor(t * 1.5) % 2;
        ctx.drawImage(SPR.mine[on], X, Y);
        if (st === 1) { ctx.strokeStyle = 'rgba(255,60,60,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X + 8, Y + 13, 26, 0, Math.PI * 2); ctx.stroke(); }
        if (ghost) { ctx.strokeStyle = 'rgba(255,90,90,0.4)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(X + 8, Y + 13, 26, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        break;
      }
      case 'arrow':
        if (!ghost && w.arrowWarn(it, t)) { const r = w.beamRect(it, 2, 6); ctx.fillStyle = Math.floor(t * 20) % 2 ? '#ffe14a' : '#ff6a2a'; ctx.fillRect(r.x, r.y, r.w, r.h); }
        break;
    }
  }

  rayGuide(ctx, it, max) {
    const w = this.world;
    const n = w.ray(it.x, it.y, it.rot, max);
    const [dx, dy] = DIRS[it.rot];
    ctx.fillStyle = 'rgba(255,90,90,0.55)';
    for (let k = 1; k <= n; k++) {
      const cx = (it.x + dx * k) * 16 + 7, cy = (it.y + dy * k) * 16 + 7;
      ctx.fillRect(cx, cy, 2, 2);
      if (k * 16 > 16 * max) break;
    }
  }

  drawBody(ctx, b, t) {
    if (b.hidden) return;
    if (b.ghosts) {
      for (const g of b.ghosts) {
        ctx.globalAlpha = g.a * 0.5;
        ctx.drawImage(g.img, Math.round(g.x), Math.round(g.y));
      }
      ctx.globalAlpha = 1;
    }
    if (b.alpha !== undefined) ctx.globalAlpha = b.alpha;
    ctx.drawImage(b.img, Math.round(b.dx), Math.round(b.dy));
    ctx.globalAlpha = 1;
  }

  drawPlacement(ctx, p, t) {
    const w = this.world;
    // 격자 & 배치 불가 칸
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let x = 1; x < W; x++) ctx.fillRect(x * 16, 0, 0.5, H * 16);
    for (let y = 1; y < H; y++) ctx.fillRect(0, y * 16, W * 16, 0.5);
    if (this.nbWorld !== w) {
      // 배치 금지 구역은 월드마다 한 번만 그려 둔다
      const [c, cx] = mkCanvas(W * 16, H * 16);
      cx.fillStyle = 'rgba(255,60,60,0.22)';
      for (let i = 0; i < W * H; i++) if (w.noBuild[i]) cx.fillRect((i % W) * 16, Math.floor(i / W) * 16, 16, 16);
      cx.fillStyle = 'rgba(255,60,60,0.35)';
      for (let i = 0; i < W * H; i++) if (w.noBuild[i]) {
        const x = (i % W) * 16, y = Math.floor(i / W) * 16;
        for (let k = 0; k < 16; k += 4) cx.fillRect(x + k, y + 15 - k, 2, 1);
      }
      this.nbCanvas = c; this.nbWorld = w;
    }
    ctx.drawImage(this.nbCanvas, 0, 0);
    const ghost = (g, alpha, col) => {
      if (!g || g.x === undefined || !g.type) return;
      ctx.globalAlpha = alpha;
      this.drawItemDyn(ctx, g, t, null, true);
      ctx.globalAlpha = 1;
      const cells = g.type === 'bomb' ? [[g.x, g.y]] : itemCells(g.type, g.x, g.y, g.rot);
      ctx.fillStyle = col;
      for (const [cx, cy] of cells) {
        ctx.fillRect(cx * 16, cy * 16, 16, 1); ctx.fillRect(cx * 16, cy * 16 + 15, 16, 1);
        ctx.fillRect(cx * 16, cy * 16, 1, 16); ctx.fillRect(cx * 16 + 15, cy * 16, 1, 16);
      }
    };
    if (p.cursors) for (const c of p.cursors) ghost(c, 0.45, c.color);
    if (p.mine) {
      const blink = 0.65 + Math.sin(t * 8) * 0.15;
      ghost(p.mine, blink, p.mine.valid ? '#5ee07a' : '#ff4a4a');
    }
  }
}
export { THEMES, OL };
