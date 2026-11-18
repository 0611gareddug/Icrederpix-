// 기기 저장 (localStorage) — 실패해도 게임은 동작
import { defaultLook, sanitizeLook, SHOP_TABS } from '../data/cosmetics.js';
import { defaultStats } from '../data/progress.js';

const KEY = 'trapbuilders.v1';
export const DEFAULT_KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyJ'], dash: ['ShiftLeft', 'KeyK'], rotate: ['KeyR', 'KeyE'],
};

function fresh() {
  return {
    name: '플레이어' + Math.floor(100 + Math.random() * 900),
    coins: 0,
    owned: { color: [0, 1, 2, 3, 4, 5], hat: [0], face: [0, 1], back: [0], fx: [0] },
    look: defaultLook(),
    settings: { music: 0.6, sfx: 0.8, shake: true, vibrate: true, btnSize: 1, btnAlpha: 0.55, keys: JSON.parse(JSON.stringify(DEFAULT_KEYS)) },
    lastDaily: '',
    stats: defaultStats(),
    seenHelp: false,
    xp: 0, level: 1, ach: {}, title: '',
  };
}

export const save = (() => {
  let d = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      d = Object.assign(fresh(), p);
      d.settings = Object.assign(fresh().settings, p.settings || {});
      d.settings.keys = Object.assign(JSON.parse(JSON.stringify(DEFAULT_KEYS)), (p.settings && p.settings.keys) || {});
      d.owned = Object.assign(fresh().owned, p.owned || {});
      d.look = sanitizeLook(d.look);
      for (const t of SHOP_TABS) if (!d.owned[t.key].includes(d.look[t.key])) d.look[t.key] = 0;
      d.coins = Math.max(0, Math.floor(+d.coins || 0));
      d.stats = Object.assign(defaultStats(), p.stats || {});
      d.level = Math.max(1, Math.min(50, Math.floor(+d.level || 1)));
      d.xp = Math.max(0, Math.floor(+d.xp || 0));
      d.ach = d.ach && typeof d.ach === 'object' ? d.ach : {};
    }
  } catch (e) { /* 저장 불가 환경 */ }
  return d;
})();

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* 무시 */ }
}

export function cleanName(s) {
  s = String(s || '').replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ_ ]/g, '').trim().slice(0, 10);
  const bad = ['시발', '씨발', '병신', '좆', '개새', 'fuck', 'shit', '섹스', '느금'];
  for (const b of bad) if (s.toLowerCase().includes(b)) s = s.split(b).join('*'.repeat(b.length));
  return s.length >= 2 ? s : '';
}

// 오늘 첫 판 보너스 여부
export function claimDaily() {
  const d = new Date();
  const k = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  if (save.lastDaily === k) return false;
  save.lastDaily = k;
  return true;
}
