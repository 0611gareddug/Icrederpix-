// 레벨 · 업적 · 칭호
import { MAP_KEYS } from './maps.js';

export const MAX_LEVEL = 50;
export const xpNeed = (lv) => 100 + (lv - 1) * 25; // lv → lv+1 에 필요한 경험치
export const levelCoins = (lv) => 20 + lv * 2;     // lv 에 도달했을 때 받는 코인

// v(st): 현재 진행값, need: 목표값
export const ACH = [
  { id: 'first_match', name: '첫 발걸음', desc: '매치 1판 완료', v: (s) => s.matches, need: 1, coins: 20 },
  { id: 'matches10', name: '꾸준함', desc: '매치 10판 완료', v: (s) => s.matches, need: 10, coins: 50 },
  { id: 'matches50', name: '단골손님', desc: '매치 50판 완료', v: (s) => s.matches, need: 50, coins: 120, title: '단골손님' },
  { id: 'first_win', name: '첫 우승', desc: '매치에서 1번 우승', v: (s) => s.wins, need: 1, coins: 40 },
  { id: 'wins10', name: '챔피언', desc: '매치에서 10번 우승', v: (s) => s.wins, need: 10, coins: 120, title: '챔피언' },
  { id: 'wins30', name: '전설', desc: '매치에서 30번 우승', v: (s) => s.wins, need: 30, coins: 250, title: '전설' },
  { id: 'goals10', name: '골인 입문', desc: '골인 10회', v: (s) => s.goals, need: 10, coins: 30 },
  { id: 'goals100', name: '생존 전문가', desc: '골인 100회', v: (s) => s.goals, need: 100, coins: 150, title: '생존 전문가' },
  { id: 'kills10', name: '함정 설계사', desc: '함정으로 10명 처치', v: (s) => s.kills, need: 10, coins: 30 },
  { id: 'kills100', name: '함정왕', desc: '함정으로 100명 처치', v: (s) => s.kills, need: 100, coins: 150, title: '함정왕' },
  { id: 'triple', name: '일망타진', desc: '한 라운드에 함정으로 3명 처치', v: (s) => s.bestRoundKills, need: 3, coins: 80, title: '덫의 지배자' },
  { id: 'mine_kill', name: '쾅!', desc: '지뢰로 처치하기', v: (s) => s.mineKills, need: 1, coins: 40 },
  { id: 'first_place', name: '번개', desc: '1등으로 골인 10회', v: (s) => s.firstGoals, need: 10, coins: 100, title: '번개' },
  { id: 'last_one', name: '최후의 1인', desc: '마지막 생존자가 되어 골인', v: (s) => s.lastSurvivorGoals, need: 1, coins: 60, title: '최후의 1인' },
  { id: 'all_maps', name: '세계 정복', desc: `모든 맵(${MAP_KEYS.length}개)에서 우승`, v: (s) => Object.keys(s.mapWins || {}).filter((k) => MAP_KEYS.includes(k)).length, need: MAP_KEYS.length, coins: 300, title: '세계 정복자' },
  { id: 'online10', name: '인싸', desc: '온라인 매치 10판', v: (s) => s.online, need: 10, coins: 100, title: '인싸' },
  { id: 'shop5', name: '패셔니스타', desc: '꾸미기 5개 구매', v: (s) => s.buys, need: 5, coins: 50, title: '패셔니스타' },
  { id: 'tutorial', name: '새싹', desc: '연습 코스 완주', v: (s) => s.tutorial, need: 1, coins: 50, title: '새싹' },
  { id: 'level10', name: '베테랑', desc: '레벨 10 달성', v: (s, d) => d.level, need: 10, coins: 60, title: '베테랑' },
  { id: 'level30', name: '고인물', desc: '레벨 30 달성', v: (s, d) => d.level, need: 30, coins: 200, title: '고인물' },
];
export const TITLES = ACH.filter((a) => a.title).map((a) => a.title);
export function titleOf(save) {
  const a = ACH.find((x) => x.id === save.title);
  return a && save.ach[a.id] ? a.title : '';
}
export function cleanTitle(t) { return TITLES.includes(t) ? t : ''; }

export function defaultStats() {
  return { matches: 0, wins: 0, goals: 0, kills: 0, bestRoundKills: 0, mineKills: 0, firstGoals: 0, lastSurvivorGoals: 0, mapWins: {}, online: 0, buys: 0, tutorial: 0 };
}

// 경험치 추가 → [{label, coins}] 보상 목록
export function addXp(save, xp) {
  const out = [];
  if (save.level >= MAX_LEVEL) return out;
  save.xp += xp;
  while (save.level < MAX_LEVEL && save.xp >= xpNeed(save.level)) {
    save.xp -= xpNeed(save.level);
    save.level++;
    const c = levelCoins(save.level);
    save.coins += c;
    out.push({ label: `⬆ 레벨 업! Lv.${save.level}`, coins: c });
  }
  if (save.level >= MAX_LEVEL) save.xp = 0;
  return out;
}

// 새로 달성한 업적 → [{label, coins, ach}]
export function checkAch(save) {
  const out = [];
  for (const a of ACH) {
    if (save.ach[a.id]) continue;
    if (a.v(save.stats, save) >= a.need) {
      save.ach[a.id] = true;
      save.coins += a.coins;
      out.push({ label: `🏅 업적: ${a.name}${a.title ? ` (칭호 「${a.title}」)` : ''}`, coins: a.coins, ach: a });
    }
  }
  return out;
}
