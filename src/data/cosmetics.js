// 꾸미기 아이템 목록
export const COLORS = [
  { name: '빨강', c: '#ef4a4a', price: 0 },
  { name: '파랑', c: '#3f8cff', price: 0 },
  { name: '노랑', c: '#ffcf3a', price: 0 },
  { name: '초록', c: '#4fcf5a', price: 0 },
  { name: '보라', c: '#a868ff', price: 0 },
  { name: '주황', c: '#ff8f2a', price: 0 },
  { name: '민트', c: '#3fe0c0', price: 50 },
  { name: '분홍', c: '#ff7ab8', price: 50 },
  { name: '하늘', c: '#7ad4ff', price: 80 },
  { name: '라임', c: '#b6f03a', price: 80 },
  { name: '갈색', c: '#a8693a', price: 100 },
  { name: '하양', c: '#eef0f6', price: 120 },
  { name: '회색', c: '#8a90a0', price: 120 },
  { name: '검정', c: '#3a3c4a', price: 150 },
  { name: '황금', c: '#ffc21a', price: 250, gold: true },
  { name: '무지개', c: '#ff4a4a', price: 300, rainbow: true },
];
export const FACES = [
  { name: '기본', price: 0 }, { name: '웃음', price: 0 }, { name: '화남', price: 80 }, { name: '졸림', price: 80 },
  { name: '선글라스', price: 150 }, { name: '깜짝', price: 100 }, { name: '윙크', price: 120 }, { name: '별눈', price: 200 },
];
export const HATS = [
  { name: '없음', price: 0 }, { name: '야구모자', price: 100 }, { name: '비니', price: 100 }, { name: '왕관', price: 400 },
  { name: '개구리 모자', price: 250 }, { name: '우주 헬멧', price: 500 }, { name: '해적 모자', price: 300 }, { name: '실크햇', price: 250 },
  { name: '프로펠러', price: 200 }, { name: '요리사 모자', price: 200 }, { name: '토끼 귀', price: 180 }, { name: '천사 고리', price: 350 },
];
export const BACKS = [
  { name: '없음', price: 0 }, { name: '망토', price: 200 }, { name: '날개', price: 500 }, { name: '꼬리', price: 250 },
  { name: '배낭', price: 200 }, { name: '목도리', price: 300 },
];
export const EFFECTS = [
  { name: '폭죽', price: 0 }, { name: '하트', price: 300 }, { name: '별', price: 400 }, { name: '번개', price: 600 }, { name: '왕관 비', price: 800 },
];
export const SHOP_TABS = [
  { key: 'color', name: '색상', list: COLORS },
  { key: 'hat', name: '모자', list: HATS },
  { key: 'face', name: '표정', list: FACES },
  { key: 'back', name: '뒤 장식', list: BACKS },
  { key: 'fx', name: '골인 효과', list: EFFECTS },
];
export const SLOT_COLORS = ['#ff5a5a', '#4fa3ff', '#ffd23f', '#5ee07a', '#c77dff', '#ff9f43'];
export function defaultLook() { return { color: 0, hat: 0, face: 0, back: 0, fx: 0 }; }
export function sanitizeLook(l) {
  const n = (v, max) => (Number.isInteger(v) && v >= 0 && v < max ? v : 0);
  l = l || {};
  return { color: n(l.color, COLORS.length), hat: n(l.hat, HATS.length), face: n(l.face, FACES.length), back: n(l.back, BACKS.length), fx: n(l.fx, EFFECTS.length) };
}
