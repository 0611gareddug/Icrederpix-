// 함정·블록 31종 정의
// cat: terrain(지형) / obstacle(방해) / lethal(치명) / special
// rots: 허용 회전값 (0=위,1=오른쪽,2=아래,3=왼쪽)
export const ITEMS = {
  wood:      { name: '나무 블록',     cat: 'terrain',  rots: [0], w: 1, h: 1, desc: '평범한 발판' },
  longplat:  { name: '긴 발판',       cat: 'terrain',  rots: [0], w: 3, h: 1, desc: '아래에서는 통과, 위에서만 밟아요' },
  ladder:    { name: '사다리',        cat: 'terrain',  rots: [0], w: 1, h: 3, desc: '위/아래로 오르내려요' },
  tramp:     { name: '트램펄린',      cat: 'terrain',  rots: [0, 1, 3], w: 1, h: 1, desc: '밟으면 높이 튕겨요' },
  movplat:   { name: '움직이는 발판', cat: 'terrain',  rots: [0, 1], w: 2, h: 1, desc: '4칸을 왕복해요 (회전: 가로/세로)' },
  conveyor:  { name: '컨베이어',      cat: 'terrain',  rots: [1, 3], w: 3, h: 1, desc: '위에 서면 한쪽으로 밀어요' },
  cloud:     { name: '구름 발판',     cat: 'terrain',  rots: [0], w: 1, h: 1, desc: '밟으면 1초 뒤 사라져요 (아래에서 통과)' },
  booster:   { name: '부스터 패드',   cat: 'terrain',  rots: [1, 3], w: 1, h: 1, desc: '밟으면 한 방향으로 빠르게 밀어 줘요' },
  lowgrav:   { name: '저중력 구역',   cat: 'terrain',  rots: [0], w: 3, h: 3, desc: '안에서는 둥실둥실 높이 떠요' },
  bigstone:  { name: '큰 돌 블록',    cat: 'terrain',  rots: [0], w: 2, h: 2, desc: '2×2 크기의 단단한 블록' },
  ice:       { name: '얼음 블록',     cat: 'obstacle', rots: [0], w: 1, h: 1, desc: '미끄러워서 멈추기 어려워요' },
  sticky:    { name: '끈끈이 블록',   cat: 'obstacle', rots: [0], w: 1, h: 1, desc: '느려지고 낮게 뛰어요' },
  crumble:   { name: '무너지는 발판', cat: 'obstacle', rots: [0], w: 1, h: 1, desc: '밟으면 0.5초 뒤 무너져요' },
  fan:       { name: '선풍기',        cat: 'obstacle', rots: [0, 1, 2, 3], w: 1, h: 1, desc: '앞으로 5칸 바람을 불어 밀어내요' },
  ghost:     { name: '유령 블록',     cat: 'obstacle', rots: [0], w: 1, h: 1, desc: '2초마다 나타났다 사라져요' },
  web:       { name: '거미줄',        cat: 'obstacle', rots: [0], w: 2, h: 2, desc: '걸리면 아주 느려져요' },
  blackhole: { name: '블랙홀',        cat: 'lethal',   rots: [0], w: 1, h: 1, desc: '주변을 빨아들여요' },
  spike:     { name: '가시',          cat: 'lethal',   rots: [0, 1, 2, 3], w: 1, h: 1, desc: '뾰족한 면에 닿으면 탈락' },
  saw:       { name: '톱날',          cat: 'lethal',   rots: [0], w: 1, h: 1, desc: '어느 방향이든 닿으면 탈락' },
  arrow:     { name: '화살 발사기',   cat: 'lethal',   rots: [0, 1, 2, 3], w: 1, h: 1, desc: '2초마다 화살을 쏴요' },
  flame:     { name: '화염 분사기',   cat: 'lethal',   rots: [0, 1, 2, 3], w: 1, h: 1, desc: '1.5초마다 불을 뿜어요' },
  mace:      { name: '회전 철퇴',     cat: 'lethal',   rots: [0], w: 1, h: 1, desc: '쇠공이 원을 그리며 돌아요' },
  laser:     { name: '레이저',        cat: 'lethal',   rots: [0, 1, 2, 3], w: 1, h: 1, desc: '조준 후 강력한 빔을 쏴요' },
  cannon:    { name: '대포',          cat: 'lethal',   rots: [1, 3], w: 1, h: 1, desc: '3초마다 큰 포탄을 천천히 쏴요' },
  crusher:   { name: '쿵쿵이',        cat: 'lethal',   rots: [0], w: 1, h: 1, desc: '주기적으로 아래로 내려찍어요' },
  poison:    { name: '독 블록',       cat: 'lethal',   rots: [0], w: 1, h: 1, desc: '어느 면이든 닿으면 탈락' },
  sawrail:   { name: '움직이는 톱날', cat: 'lethal',   rots: [0, 1], w: 1, h: 1, desc: '레일 4칸을 왕복해요 (회전: 가로/세로)' },
  mine:      { name: '지뢰',          cat: 'lethal',   rots: [0], w: 1, h: 1, desc: '밟으면 0.5초 뒤 터져요' },
  bomb:      { name: '폭탄',          cat: 'special',  rots: [0], w: 1, h: 1, desc: '놓는 순간 주변 블록을 날려요' },
  hammer:    { name: '망치',          cat: 'special',  rots: [0], w: 1, h: 1, desc: '놓인 블록·함정 1개를 골라 부숴요' },
  tbomb:     { name: '지형 파괴 폭탄', cat: 'special',  rots: [0], w: 1, h: 1, desc: '맵 지형까지 반경 2칸을 날려요' },
};
export const ITEM_KEYS = Object.keys(ITEMS);

// 회전 반영 크기 (사다리/발판 등은 회전 없음)
export function itemCells(type, x, y, rot) {
  const d = ITEMS[type];
  const w = d.w, h = d.h;
  const cells = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cells.push([x + i, y + j]);
  return cells;
}

// 주기 (초)
export const CYCLE = { arrow: 2, flame: 3, laser: 3.7, mace: 4, movplat: 4, cannon: 3, crusher: 3, ghost: 4, sawrail: 4, fan: 1 };
export function phaseOf(id, type) {
  const c = CYCLE[type] || 1;
  return ((id * 0.618034) % 1) * c;
}

// 파티 상자 생성
export function makeBox(count, round, placedCount, r) {
  const SPECIAL = ['bomb', 'hammer', 'tbomb'];
  const pool = ITEM_KEYS.filter((k) => !SPECIAL.includes(k));
  const res = [];
  const cnt = {};
  // 파괴 아이템: 2라운드부터, 맵에 놓인 게 많을수록 자주
  const bombChance = round >= 2 ? Math.min(0.14 + placedCount * 0.012, 0.5) : 0;
  let specials = 0;
  while (res.length < count) {
    let k;
    if (specials < 2 && r() < bombChance) {
      k = placedCount > 0 ? SPECIAL[Math.floor(r() * 3)] : 'tbomb';
      specials++;
    }
    else k = pool[Math.floor(r() * pool.length)];
    if ((cnt[k] || 0) >= 2) continue;
    cnt[k] = (cnt[k] || 0) + 1;
    res.push(k);
  }
  if (!res.some((k) => ITEMS[k].cat === 'terrain')) {
    const terr = pool.filter((k) => ITEMS[k].cat === 'terrain');
    const idx = res.findIndex((k) => !SPECIAL.includes(k));
    res[idx] = terr[Math.floor(r() * terr.length)];
  }
  return res;
}
