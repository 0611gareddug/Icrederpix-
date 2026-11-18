// 아이템·오브젝트 픽셀 스프라이트 (모두 코드로 생성)
import { mkCanvas, px, outline, rotated, flipped } from './canvas.js';
import { hash2 } from '../core/util.js';

export const OL = '#1b1726';
export const SPR = {};

function make(w, h, fn, ol = true) {
  const [c, ctx] = mkCanvas(w, h);
  fn(ctx, w, h);
  if (ol) outline(c, ctx, OL);
  return c;
}
// 1px 안쪽에 그리고 외곽선을 둘러 16x16로 만든다
function block(fill, dark, light, deco) {
  return make(16, 16, (c) => {
    px(c, 1, 1, fill, 14, 14);
    px(c, 1, 1, light, 14, 1); px(c, 1, 1, light, 1, 14);
    px(c, 1, 14, dark, 14, 1); px(c, 14, 1, dark, 1, 14);
    deco && deco(c);
  });
}

export function buildSprites() {
  // 나무 블록
  SPR.wood = block('#b07a45', '#7a4e2a', '#d29a5e', (c) => {
    px(c, 2, 5, '#8c5c33', 12, 1); px(c, 2, 10, '#8c5c33', 12, 1);
    px(c, 5, 2, '#9a6838', 1, 3); px(c, 10, 6, '#9a6838', 1, 4); px(c, 6, 11, '#9a6838', 1, 3);
    px(c, 3, 3, '#5a3a1e'); px(c, 12, 3, '#5a3a1e'); px(c, 3, 12, '#5a3a1e'); px(c, 12, 12, '#5a3a1e');
  });
  // 긴 발판 (한 칸)
  SPR.plank = make(16, 7, (c) => {
    px(c, 0, 1, '#c88a4e', 16, 4); px(c, 0, 1, '#e3aa6a', 16, 1); px(c, 0, 4, '#8c5c33', 16, 1);
    px(c, 4, 2, '#a06a3a', 1, 2); px(c, 11, 2, '#a06a3a', 1, 2);
    px(c, 2, 5, '#7a4e2a', 2, 2); px(c, 12, 5, '#7a4e2a', 2, 2);
  });
  // 사다리 한 칸
  SPR.ladder = make(16, 16, (c) => {
    px(c, 2, 0, '#c08850', 2, 16); px(c, 12, 0, '#c08850', 2, 16);
    px(c, 2, 0, '#e0a868', 1, 16); px(c, 12, 0, '#e0a868', 1, 16);
    px(c, 4, 3, '#a87440', 8, 2); px(c, 4, 11, '#a87440', 8, 2);
    px(c, 4, 3, '#d29a5e', 8, 1); px(c, 4, 11, '#d29a5e', 8, 1);
  });
  // 트램펄린 (위쪽 방향 기준)
  const tramp = (sq) => make(16, 16, (c) => {
    px(c, 2, 9, '#5a6070', 12, 6); px(c, 2, 9, '#7a8294', 12, 1);
    px(c, 3, 14, '#3a3f4c', 2, 1); px(c, 11, 14, '#3a3f4c', 2, 1);
    for (let i = 0; i < 3; i++) px(c, 5 + i * 2, 6 + sq, '#c0c8d8', 1, 3 - sq);
    px(c, 1, 3 + sq, '#e8433f', 14, 3); px(c, 1, 3 + sq, '#ff7a6b', 14, 1); px(c, 2, 5 + sq, '#b02a2a', 12, 1);
  });
  SPR.tramp = [tramp(0), tramp(2)];
  SPR.trampR = SPR.tramp.map((s) => rotated(s, 1));
  SPR.trampL = SPR.tramp.map((s) => rotated(s, 3));
  // 움직이는 발판 32x8
  SPR.movplat = make(32, 8, (c) => {
    px(c, 1, 1, '#8a94a8', 30, 5); px(c, 1, 1, '#c8d0e0', 30, 1); px(c, 1, 5, '#5a6276', 30, 1);
    for (let x = 4; x < 30; x += 6) px(c, x, 2, '#ffd23f', 2, 3);
    px(c, 14, 6, '#4a5060', 4, 2);
  });
  // 컨베이어 (4프레임)
  SPR.conv = [];
  for (let f = 0; f < 4; f++) {
    SPR.conv.push(make(16, 16, (c) => {
      px(c, 1, 1, '#4a4e5a', 14, 14);
      px(c, 1, 1, '#2e313a', 14, 4);
      for (let x = -4; x < 16; x += 4) { const xx = x + f; if (xx >= 1 && xx < 15) px(c, xx, 1, '#7a7f8e', 2, 4); }
      px(c, 3, 8, '#6a6f7c', 4, 4); px(c, 9, 8, '#6a6f7c', 4, 4);
      px(c, 4, 9, '#9aa0ae', 2, 2); px(c, 10, 9, '#9aa0ae', 2, 2);
    }));
  }
  // 얼음 블록
  SPR.ice = block('#8fd4f5', '#4fa3d6', '#d6f3ff', (c) => {
    px(c, 3, 3, '#ffffff', 3, 1); px(c, 3, 4, '#ffffff', 1, 2);
    px(c, 9, 8, '#c4ecff', 1, 4); px(c, 10, 7, '#c4ecff', 1, 1); px(c, 6, 11, '#6ec0ea', 4, 1);
  });
  // 끈끈이
  SPR.sticky = make(16, 16, (c) => {
    px(c, 1, 2, '#8ccf3a', 14, 13); px(c, 1, 2, '#c4f06a', 14, 1);
    px(c, 2, 1, '#8ccf3a', 3, 1); px(c, 8, 1, '#8ccf3a', 5, 1);
    px(c, 4, 5, '#b8e85a', 2, 2); px(c, 10, 9, '#b8e85a', 2, 2); px(c, 6, 11, '#5f9e22', 3, 1);
    px(c, 3, 14, '#6aa828', 2, 2); px(c, 11, 14, '#6aa828', 1, 2);
  });
  // 무너지는 발판
  SPR.crumble = block('#d8b06a', '#9a7438', '#f0d090', (c) => {
    px(c, 7, 1, '#7a5a2a', 1, 4); px(c, 8, 5, '#7a5a2a', 1, 3); px(c, 6, 8, '#7a5a2a', 2, 1);
    px(c, 3, 9, '#7a5a2a', 3, 1); px(c, 11, 10, '#7a5a2a', 1, 4); px(c, 10, 9, '#7a5a2a', 1, 1);
  });
  // 블랙홀 4프레임
  SPR.hole = [];
  for (let f = 0; f < 4; f++) {
    SPR.hole.push(make(16, 16, (c) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
        if (d > 7.5) continue;
        const a = Math.atan2(dy, dx) + f * Math.PI / 8 + d * 0.5;
        const sw = Math.sin(a * 3) > 0.2;
        let col = d < 3 ? '#05020a' : sw ? '#8a3aff' : '#3a1470';
        if (d > 6.2) col = sw ? '#c08aff' : '#5a2aa0';
        px(c, x, y, col);
      }
    }, false));
  }
  // 가시 (위 방향 기준)
  SPR.spike = [0, 1, 2, 3].map((r) => rotated(make(16, 16, (c) => {
    px(c, 1, 10, '#6a7080', 14, 5); px(c, 1, 10, '#9aa0ae', 14, 1);
    for (let i = 0; i < 4; i++) {
      const x0 = 1 + i * 3.5;
      for (let k = 0; k < 4; k++) px(c, Math.round(x0 + k * 0.5), 9 - k * 2, '#e8ecf4', Math.max(1, 3 - k), 2);
      px(c, Math.round(x0), 9, '#b0b6c4', 1, 1);
    }
  }), r));
  // 톱날
  SPR.saw = make(16, 16, (c) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const tooth = 6 + (((a / (Math.PI * 2)) * 8 + 8) % 1 < 0.5 ? 1.6 : 0);
      if (d <= tooth) px(c, x, y, d < 2 ? '#3a3f4c' : d < 4.5 ? '#c8ccd8' : '#e8ecf4');
    }
    px(c, 7, 7, '#1b1726', 2, 2);
    px(c, 4, 4, '#ffffff', 2, 1);
  });
  // 화살 발사기 (오른쪽 기준)
  SPR.launcher = [0, 1, 2, 3].map((r) => rotated(block('#7a6a5a', '#4e4236', '#a08c76', (c) => {
    px(c, 9, 5, '#2a221c', 5, 6); px(c, 14, 6, '#1b1726', 1, 4);
    px(c, 3, 4, '#c8b496', 3, 1); px(c, 3, 11, '#c8b496', 3, 1);
  }), (r + 3) % 4));
  SPR.arrowH = make(9, 3, (c) => { px(c, 0, 1, '#c89a5a', 7, 1); px(c, 6, 0, '#e8ecf4', 2, 3); px(c, 8, 1, '#e8ecf4'); px(c, 0, 0, '#ff6b6b', 2, 1); px(c, 0, 2, '#ff6b6b', 2, 1); }, false);
  // 화염 분사기 (오른쪽 기준)
  SPR.flamer = [0, 1, 2, 3].map((r) => rotated(block('#8a3a2a', '#5a2018', '#b85a40', (c) => {
    px(c, 10, 4, '#3a3f4c', 4, 8); px(c, 10, 4, '#5a6070', 4, 1); px(c, 14, 5, '#1b1726', 1, 6);
    px(c, 3, 6, '#ffb03a', 4, 4); px(c, 4, 7, '#ffe08a', 2, 2);
  }), (r + 3) % 4));
  // 레이저 발사기 (오른쪽 기준)
  SPR.laser = [0, 1, 2, 3].map((r) => rotated(block('#4a4e6a', '#2e3046', '#6a6e90', (c) => {
    px(c, 9, 5, '#2a2c3e', 5, 6); px(c, 11, 6, '#ff3a5a', 3, 4); px(c, 12, 7, '#ffb0c0', 1, 2);
    px(c, 3, 3, '#8a8eb0', 2, 2); px(c, 3, 11, '#8a8eb0', 2, 2);
  }), (r + 3) % 4));
  // 철퇴
  SPR.macePost = make(16, 16, (c) => {
    px(c, 4, 4, '#5a6070', 8, 8); px(c, 4, 4, '#8a94a8', 8, 1); px(c, 6, 6, '#2e313a', 4, 4); px(c, 7, 7, '#c8d0e0', 2, 2);
  });
  SPR.maceBall = make(16, 16, (c) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d <= 5) px(c, x, y, d < 2.5 && x < 8 && y < 8 ? '#a0a8b8' : '#5a6070');
    }
    px(c, 7, 0, '#c8d0e0', 2, 3); px(c, 7, 13, '#c8d0e0', 2, 3); px(c, 0, 7, '#c8d0e0', 3, 2); px(c, 13, 7, '#c8d0e0', 3, 2);
    px(c, 2, 2, '#c8d0e0', 2, 2); px(c, 12, 2, '#c8d0e0', 2, 2); px(c, 2, 12, '#c8d0e0', 2, 2); px(c, 12, 12, '#c8d0e0', 2, 2);
  });
  // 폭탄
  SPR.bomb = make(16, 16, (c) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 9);
      if (d <= 5.6) px(c, x, y, d < 2.5 && x < 7 && y < 8 ? '#5a5f70' : '#2a2c3a');
    }
    px(c, 6, 2, '#6a6f7c', 4, 2); px(c, 9, 0, '#c89a5a', 1, 2); px(c, 10, 0, '#ffd23f', 2, 1); px(c, 5, 6, '#9aa0ae', 2, 1);
  });
  // 골 깃발 3프레임 (16x32)
  SPR.flag = [];
  for (let f = 0; f < 3; f++) {
    SPR.flag.push(make(16, 32, (c) => {
      px(c, 3, 2, '#d8dce8', 2, 30); px(c, 3, 2, '#ffffff', 1, 30);
      px(c, 2, 0, '#ffd23f', 4, 3);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) {
        const wy = Math.round(Math.sin((x + f * 2) * 0.8) * 1);
        const chk = ((x >> 1) + (y >> 1)) % 2;
        px(c, 5 + x, 3 + y + wy, chk ? '#1b1726' : '#ffffff');
      }
      px(c, 1, 30, '#6a7080', 6, 2);
    }));
  }
  // 출발 팻말
  SPR.startSign = make(16, 16, (c) => {
    px(c, 7, 6, '#8c5c33', 2, 10);
    px(c, 1, 1, '#e8b060', 14, 7); px(c, 1, 1, '#ffd890', 14, 1);
    px(c, 4, 3, '#5a3a1e', 1, 3); px(c, 5, 3, '#5a3a1e', 3, 1); px(c, 5, 5, '#5a3a1e', 3, 1); px(c, 9, 3, '#5a3a1e', 3, 1); px(c, 10, 4, '#5a3a1e', 1, 2);
  });
  // 고드름
  SPR.icicle = make(8, 12, (c) => {
    px(c, 1, 0, '#bfeaff', 6, 3); px(c, 2, 3, '#bfeaff', 4, 3); px(c, 3, 6, '#9fdcff', 2, 4); px(c, 3, 10, '#ffffff', 1, 1);
    px(c, 2, 0, '#ffffff', 1, 5);
  });
  buildNewSprites();
}

// ---------- v1.2 추가 함정 ----------
function buildNewSprites() {
  // 구름 발판 (16x9)
  SPR.cloud = make(16, 9, (c) => {
    px(c, 1, 3, '#ffffff', 14, 5); px(c, 3, 1, '#ffffff', 5, 3); px(c, 8, 0, '#ffffff', 5, 4);
    px(c, 1, 7, '#d8e4f4', 14, 1); px(c, 4, 2, '#f4f8ff', 2, 1);
  });
  // 부스터 패드 (오른쪽 기준, 3프레임)
  SPR.boostR = [0, 1, 2].map((f) => make(16, 16, (c) => {
    px(c, 1, 1, '#4a4e5e', 14, 14); px(c, 1, 1, '#6a7080', 14, 1); px(c, 1, 14, '#2e313a', 14, 1);
    px(c, 1, 2, '#2a2c3a', 14, 4);
    for (let k = 0; k < 3; k++) {
      const x = 2 + ((k * 5 + f * 2) % 13);
      const col = k === f ? '#ffe14a' : '#ff9a2a';
      px(c, x, 2, col, 2, 1); px(c, x + 1, 3, col, 2, 2); px(c, x, 5, col, 2, 1);
    }
    px(c, 4, 8, '#ff9a2a', 8, 2); px(c, 10, 7, '#ff9a2a', 2, 4); px(c, 12, 8, '#ff9a2a', 1, 2);
  }));
  SPR.boostL = SPR.boostR.map(flipped);
  // 큰 돌 블록 (32x32)
  SPR.stone = make(32, 32, (c) => {
    px(c, 1, 1, '#8a8f9e', 30, 30); px(c, 1, 1, '#b4b9c6', 30, 2); px(c, 1, 1, '#b4b9c6', 2, 30);
    px(c, 1, 29, '#5e6270', 30, 2); px(c, 29, 1, '#5e6270', 2, 30);
    px(c, 9, 4, '#6a6f7c', 1, 8); px(c, 10, 11, '#6a6f7c', 5, 1); px(c, 15, 12, '#6a6f7c', 1, 6);
    px(c, 20, 18, '#6a6f7c', 7, 1); px(c, 5, 21, '#6a6f7c', 6, 1); px(c, 22, 6, '#9aa0ae', 4, 3); px(c, 6, 15, '#9aa0ae', 3, 2);
    px(c, 24, 24, '#6a6f7c', 2, 2); px(c, 12, 25, '#9aa0ae', 3, 1);
  });
  // 선풍기 (오른쪽 기준, 2프레임)
  SPR.fan = [0, 1].map((f) => [0, 1, 2, 3].map((r) => rotated(make(16, 16, (c) => {
    px(c, 1, 1, '#5a8ac8', 10, 14); px(c, 1, 1, '#8ab4ea', 10, 1); px(c, 1, 14, '#3a5a8a', 10, 1);
    px(c, 11, 2, '#c8d0e0', 4, 12);
    for (let y = 3; y < 13; y += 2) px(c, 11, y, '#6a7080', 4, 1);
    px(c, 5, 6, '#e8ecf4', 4, 4);
    if (f) { px(c, 6, 2, '#e8ecf4', 2, 4); px(c, 6, 10, '#e8ecf4', 2, 4); }
    else { px(c, 2, 7, '#e8ecf4', 4, 2); px(c, 8, 7, '#e8ecf4', 3, 2); }
    px(c, 6, 7, '#3a3f4c', 2, 2);
  }), (r + 3) % 4)));
  // 유령 블록
  SPR.ghost = make(16, 16, (c) => {
    px(c, 1, 1, '#b08aff', 14, 14); px(c, 1, 1, '#d8c4ff', 14, 2); px(c, 1, 13, '#7a50d0', 14, 2);
    px(c, 4, 5, '#ffffff', 3, 4); px(c, 9, 5, '#ffffff', 3, 4); px(c, 5, 6, '#1b1726', 2, 2); px(c, 10, 6, '#1b1726', 2, 2);
    px(c, 6, 11, '#7a50d0', 4, 1);
  });
  // 거미줄 (32x32)
  SPR.web = make(32, 32, (c) => {
    const col = 'rgba(240,244,255,0.85)';
    for (let k = 0; k < 32; k++) { px(c, k, k, col); px(c, 31 - k, k, col); px(c, 16, k, col); px(c, k, 16, col); }
    for (const r of [5, 10, 14]) for (let a = 0; a < 64; a++) {
      const an = (a / 64) * Math.PI * 2;
      px(c, Math.round(16 + Math.cos(an) * r), Math.round(16 + Math.sin(an) * r), col);
    }
    px(c, 14, 14, '#2a2c3a', 4, 4); px(c, 13, 13, '#2a2c3a', 1, 1); px(c, 18, 13, '#2a2c3a', 1, 1); px(c, 13, 18, '#2a2c3a', 1, 1); px(c, 18, 18, '#2a2c3a', 1, 1);
    px(c, 15, 15, '#ff3a3a', 1, 1); px(c, 16, 15, '#ff3a3a', 1, 1);
  }, false);
  // 대포 (오른쪽 기준)
  SPR.cannonR = make(16, 16, (c) => {
    px(c, 2, 9, '#7a4e2a', 10, 5); px(c, 2, 9, '#a8703f', 10, 1);
    px(c, 3, 13, '#3a3f4c', 3, 3); px(c, 9, 13, '#3a3f4c', 3, 3);
    px(c, 4, 4, '#3a3c4a', 11, 6); px(c, 4, 4, '#6a6f7c', 11, 1); px(c, 13, 3, '#2a2c3a', 3, 8); px(c, 15, 5, '#0e0b18', 1, 4);
    px(c, 1, 5, '#3a3c4a', 3, 4);
  });
  SPR.cannonL = flipped(SPR.cannonR);
  SPR.ball = make(12, 12, (c) => {
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const d = Math.hypot(x - 5.5, y - 5.5); if (d < 5) px(c, x, y, d < 2 && x < 6 && y < 6 ? '#6a6f7c' : '#2a2c3a'); }
  });
  // 쿵쿵이
  SPR.crushHouse = block('#5a6070', '#3a3f4c', '#8a94a8', (c) => { px(c, 4, 4, '#2a2c3a', 8, 8); px(c, 6, 6, '#ffd23f', 4, 4); });
  SPR.crushHead = make(16, 16, (c) => {
    px(c, 1, 0, '#8a8f9e', 14, 12); px(c, 1, 0, '#b4b9c6', 14, 1); px(c, 1, 11, '#5e6270', 14, 1);
    px(c, 3, 4, '#1b1726', 3, 2); px(c, 10, 4, '#1b1726', 3, 2); px(c, 3, 3, '#1b1726', 2, 1); px(c, 11, 3, '#1b1726', 2, 1);
    px(c, 5, 8, '#1b1726', 6, 1);
    for (let k = 0; k < 4; k++) { px(c, 1 + k * 4, 12, '#e8ecf4', 3, 1); px(c, 2 + k * 4, 13, '#e8ecf4', 1, 2); }
  });
  // 독 블록 (3프레임)
  SPR.poison = [0, 1, 2].map((f) => block('#6a2a8a', '#3e1458', '#8a4ab0', (c) => {
    px(c, 2, 2, '#7ad83a', 12, 3); px(c, 2, 2, '#b4f06a', 12, 1);
    px(c, 3 + f * 3, 5, '#7ad83a', 2, 2 + f);
    px(c, 5, 8, '#f0f0f0', 6, 4); px(c, 6, 9, '#1b1726', 1, 1); px(c, 9, 9, '#1b1726', 1, 1); px(c, 6, 12, '#f0f0f0', 4, 1);
    px(c, 11 - f, 1, '#b4f06a', 2, 1);
  }));
  // 지뢰 (2프레임, 칸 아래쪽에 놓임)
  SPR.mine = [0, 1].map((f) => make(16, 16, (c) => {
    px(c, 3, 12, '#3a3f4c', 10, 3); px(c, 4, 10, '#4a4e5e', 8, 2); px(c, 5, 9, '#4a4e5e', 6, 1);
    px(c, 7, 7, f ? '#ff3a3a' : '#7a2020', 2, 2);
    px(c, 4, 10, '#6a7080', 3, 1); px(c, 2, 14, '#2a2c3a', 12, 1);
  }));
}

// 상자/UI 아이콘 (16x16, 회전 0)
export function iconFor(type) {
  switch (type) {
    case 'wood': return SPR.wood;
    case 'longplat': return make(16, 16, (c) => { c.drawImage(SPR.plank, 0, 5); }, false);
    case 'ladder': return SPR.ladder;
    case 'tramp': return SPR.tramp[0];
    case 'movplat': return make(16, 16, (c) => { c.drawImage(SPR.movplat, 0, 0, 32, 8, 0, 5, 16, 4); c.drawImage(SPR.movplat, 16, 0, 16, 8, 8, 5, 8, 4); px(c, 1, 11, '#ffd23f', 3, 1); px(c, 12, 11, '#ffd23f', 3, 1); px(c, 0, 10, '#ffd23f', 1, 3); px(c, 15, 10, '#ffd23f', 1, 3); }, false);
    case 'conveyor': return SPR.conv[0];
    case 'ice': return SPR.ice;
    case 'sticky': return SPR.sticky;
    case 'crumble': return SPR.crumble;
    case 'blackhole': return SPR.hole[0];
    case 'spike': return SPR.spike[0];
    case 'saw': return SPR.saw;
    case 'arrow': return SPR.launcher[1];
    case 'flame': return SPR.flamer[1];
    case 'mace': return make(16, 16, (c) => { px(c, 3, 9, '#8a94a8', 1, 1); px(c, 5, 7, '#8a94a8', 1, 1); c.drawImage(SPR.macePost, 0, 0, 16, 16, -2, 6, 10, 10); c.drawImage(SPR.maceBall, 0, 0, 16, 16, 5, -1, 12, 12); }, false);
    case 'laser': return SPR.laser[1];
    case 'bomb': return SPR.bomb;
    case 'cloud': return make(16, 16, (c) => c.drawImage(SPR.cloud, 0, 4), false);
    case 'booster': return SPR.boostR[0];
    case 'lowgrav': return make(16, 16, (c) => { px(c, 1, 1, '#7ad4ff', 14, 14); px(c, 2, 2, '#bfeaff', 12, 12); px(c, 5, 9, '#3a8ac8', 6, 1); px(c, 7, 4, '#3a8ac8', 2, 5); px(c, 5, 6, '#3a8ac8', 1, 1); px(c, 10, 6, '#3a8ac8', 1, 1); px(c, 6, 5, '#3a8ac8', 4, 1); });
    case 'bigstone': return make(16, 16, (c) => c.drawImage(SPR.stone, 0, 0, 32, 32, 0, 0, 16, 16), false);
    case 'fan': return SPR.fan[0][1];
    case 'ghost': return SPR.ghost;
    case 'web': return make(16, 16, (c) => c.drawImage(SPR.web, 0, 0, 32, 32, 0, 0, 16, 16), false);
    case 'cannon': return SPR.cannonR;
    case 'crusher': return make(16, 16, (c) => { c.drawImage(SPR.crushHouse, 0, 0, 16, 16, 3, 0, 10, 6); c.drawImage(SPR.crushHead, 0, 0, 16, 16, 1, 5, 14, 11); }, false);
    case 'poison': return SPR.poison[0];
    case 'sawrail': return make(16, 16, (c) => { px(c, 0, 7, '#6a7080', 16, 2); c.drawImage(SPR.saw, 0, 0, 16, 16, 3, 3, 10, 10); }, false);
    case 'mine': return SPR.mine[1];
  }
  return SPR.wood;
}

const tintCache = new Map();
export function tint(src, color) {
  if (src.__id === undefined) src.__id = Math.random().toString(36).slice(2);
  const k = src.__id + color;
  if (tintCache.has(k)) return tintCache.get(k);
  const [c, ctx] = mkCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color; ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(src, 0, 0);
  tintCache.set(k, c);
  return c;
}
export { hash2 };
