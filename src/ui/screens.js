// 메뉴 화면들
import { h, btn, toast, modal, charCanvas, canFullscreen, toggleFullscreen } from './dom.js';
import { save, persist, cleanName, DEFAULT_KEYS } from '../core/save.js';
import { MAPS, MAP_KEYS } from '../data/maps.js';
import { LENGTHS } from '../net/match.js';
import { SHOP_TABS, COLORS, SLOT_COLORS, sanitizeLook } from '../data/cosmetics.js';
import { drawPreview, getSheet, FW, FH } from '../art/character.js';
import { THEMES } from '../art/terrain.js';
import { sfx, setVolumes } from '../core/audio.js';
import { listenKey, keyLabel } from '../core/input.js';
import { applyTouchSettings } from './touch.js';
import { isTouch } from '../core/util.js';
import { normCode } from '../net/net.js';
import { ITEMS } from '../data/items.js';

let timers = [], hooks = [];
export function cleanup() {
  timers.forEach(clearInterval); timers = [];
  hooks.forEach((f) => f()); hooks = [];
}
function setScreen(app, el) { app.setScreen(el); }
function every(fn, ms) { timers.push(setInterval(fn, ms)); }
function topbar(extra) {
  const b = h('div', { class: 'topbar' });
  if (extra) b.append(...extra);
  if (canFullscreen()) b.append(btn('⛶', () => toggleFullscreen(), 'iconbtn', { title: '전체 화면' }));
  return b;
}
function seg(options, value, onChange) {
  const wrap = h('div', { class: 'seg' });
  const render = () => {
    wrap.innerHTML = '';
    for (const [v, label] of options) wrap.append(btn(label, () => { value = v; onChange(v); render(); }, v === value ? 'on' : ''));
  };
  render();
  return wrap;
}
function group(label, ...kids) { return h('div', { class: 'opt-group' }, h('div', { class: 'opt-label' }, label), ...kids); }

// ---------- 타이틀 ----------
export function showTitle(app) {
  app.music('menu');
  const go = () => showMenu(app);
  const key = (e) => { if (e.code !== 'F12') go(); };
  window.addEventListener('keydown', key);
  const el = h('div', { class: 'screen title-screen', onclick: go },
    h('div', { class: 'logo' }, h('div', { class: 'en' }, 'TRAP BUILDERS'), h('div', { class: 'ko' }, '트랩빌더즈')),
    h('div', { class: 'press' }, isTouch() ? '화면을 터치해서 시작' : '아무 키나 눌러서 시작'),
    h('div', { class: 'ver' }, 'v1.0'));
  const tb = topbar();
  tb.addEventListener('click', (e) => e.stopPropagation());
  el.append(tb);
  setScreen(app, el);
  hooks.push(() => window.removeEventListener('keydown', key));
}

// ---------- 메인 메뉴 ----------
export function showMenu(app) {
  app.music('menu');
  const prev = h('canvas', { width: FW * 6, height: FH * 6 });
  let fr = 0;
  const draw = () => { fr++; drawPreview(prev, save.look, fr * 0.35, fr % 6 < 3 ? 'idle0' : 'idle1'); };
  draw(); every(draw, 350);
  const nameEl = h('span', null, save.name);
  const card = h('div', { class: 'me-card pix' },
    h('div', { class: 'title-text menu-logo' }, 'TRAP BUILDERS'),
    prev,
    h('div', { class: 'me-name' }, nameEl, btn('✏', () => editName(() => { nameEl.textContent = save.name; }), 'small', { title: '닉네임 바꾸기' })),
    h('div', { class: 'coin' }, String(save.coins)));
  const btns = h('div', { class: 'menu-btns' },
    btn([h('span', { class: 'ico' }, '▶'), '혼자 하기'], () => showSolo(app), 'primary'),
    btn([h('span', { class: 'ico' }, '👥'), '방 만들기'], () => app.createRoom()),
    btn([h('span', { class: 'ico' }, '🔑'), '방 참가'], () => showJoin(app)),
    btn([h('span', { class: 'ico' }, '🎨'), '꾸미기 상점'], () => showShop(app)),
    btn([h('span', { class: 'ico' }, '⚙'), '설정'], () => showSettings(app)),
    btn([h('span', { class: 'ico' }, '❓'), '조작법 · 규칙'], () => showHelp(app)));
  const el = h('div', { class: 'screen dim-bg' }, h('div', { class: 'menu-wrap' }, card, btns), topbar());
  setScreen(app, el);
  if (!save.seenHelp) { save.seenHelp = true; persist(); setTimeout(() => showHelpModal(), 300); }
}

function editName(done) {
  const inp = h('input', { class: 'text-in', value: save.name, maxlength: '10', placeholder: '2~10자' });
  modal('닉네임 바꾸기', h('div', { class: 'col' }, h('div', { class: 'dim', style: { fontSize: '0.85em' } }, '한글 · 영문 · 숫자 2~10자'), inp), [
    { label: '취소' },
    { label: '저장', cls: 'primary', onClick: () => { const n = cleanName(inp.value); if (!n) { toast('2~10자의 한글/영문/숫자로 입력해 주세요.'); return false; } save.name = n; persist(); done && done(); } },
  ]);
  setTimeout(() => inp.focus(), 50);
}

// ---------- 맵 썸네일 ----------
const thumbCache = {};
export function mapThumb(key) {
  if (key === 'random') {
    if (thumbCache.random) return thumbCache.random;
    const c = document.createElement('canvas'); c.width = 144; c.height = 60;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 144, 60); g.addColorStop(0, '#5fb6f5'); g.addColorStop(0.5, '#b05a9a'); g.addColorStop(1, '#3a0e0a');
    x.fillStyle = g; x.fillRect(0, 0, 144, 60);
    x.fillStyle = '#fff'; x.font = '28px Galmuri11, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 72, 32);
    return (thumbCache.random = c.toDataURL());
  }
  if (thumbCache[key]) return thumbCache[key];
  const m = MAPS[key], th = THEMES[m.theme];
  const c = document.createElement('canvas'); c.width = 144; c.height = 60;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 60); g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[2]);
  x.fillStyle = g; x.fillRect(0, 0, 144, 60);
  m.rows.forEach((row, y) => [...row].forEach((ch, xx) => {
    let col = null;
    if (ch === '#') col = y > 0 && m.rows[y - 1][xx] !== '#' && m.rows[y - 1][xx] !== 'I' ? th.top : th.fill;
    else if (ch === 'I') col = '#bfeaff';
    else if (ch === '=') col = th.plat;
    else if (ch === 'L') col = '#ff6a00';
    else if (ch === 'S') col = '#5ee07a';
    else if (ch === 'G') col = '#ffd23f';
    if (col) { x.fillStyle = col; x.fillRect(xx * 3, y * 3, 3, ch === '=' ? 1 : 3); }
  }));
  return (thumbCache[key] = c.toDataURL());
}
function mapPicker(value, onChange, withRandom = true) {
  const wrap = h('div', { class: 'map-cards' });
  const keys = (withRandom ? ['random'] : []).concat(MAP_KEYS);
  const render = () => {
    wrap.innerHTML = '';
    for (const k of keys) {
      const m = MAPS[k];
      wrap.append(btn([h('img', { src: mapThumb(k), alt: '' }), h('span', null, k === 'random' ? '🎲 무작위' : `${m.icon} ${m.name}`)], () => { value = k; onChange(k); render(); }, 'map-card ' + (value === k ? 'on' : ''), { title: k === 'random' ? '매 판 무작위 맵' : m.desc }));
    }
  };
  render();
  return wrap;
}

// ---------- 혼자 하기 설정 ----------
export function showSolo(app) {
  const st = Object.assign({}, app.soloSettings);
  const el = h('div', { class: 'screen dark' }, h('div', { class: 'panel pix' },
    h('h2', null, '▶ 혼자 하기'),
    group('맵', mapPicker(st.map, (v) => { st.map = v; })),
    group('판 길이', seg(Object.entries(LENGTHS).map(([k, v]) => [k, v.label]), st.length, (v) => { st.length = v; })),
    h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '1.6em' } },
      group('봇 수', seg([1, 2, 3, 4, 5].map((n) => [n, n + '명']), st.bots, (v) => { st.bots = v; })),
      group('봇 난이도', seg([['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']], st.diff, (v) => { st.diff = v; }))),
    h('div', { class: 'row actions-sticky', style: { justifyContent: 'flex-end' } },
      btn('뒤로', () => showMenu(app)), btn('시작!', () => app.startSolo(st), 'primary'))), topbar());
  setScreen(app, el);
}

// ---------- 연결 / 오류 ----------
export function showConnecting(app, text, onCancel) {
  setScreen(app, h('div', { class: 'screen dark' }, h('div', { class: 'panel pix col', style: { alignItems: 'center', textAlign: 'center' } },
    h('div', { class: 'spin', style: { fontSize: '1.6em' } }, '✦'), h('div', null, text), btn('취소', onCancel))));
}
export function showError(app, msg, onBack) {
  setScreen(app, h('div', { class: 'screen dark' }, h('div', { class: 'panel pix col', style: { alignItems: 'center', textAlign: 'center', maxWidth: '30em' } },
    h('h2', null, '앗!'), h('div', null, msg), btn('돌아가기', () => (onBack ? onBack() : showMenu(app)), 'primary'))));
}

// ---------- 방 참가 ----------
export function showJoin(app, preset = '') {
  const inp = h('input', { class: 'text-in code-in', value: preset, maxlength: '5', placeholder: 'ABCDE', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
  inp.addEventListener('input', () => { const v = normCode(inp.value); if (v !== inp.value) inp.value = v; });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') app.joinRoom(inp.value); });
  const el = h('div', { class: 'screen dark' }, h('div', { class: 'panel pix col', style: { alignItems: 'center', textAlign: 'center' } },
    h('h2', null, '🔑 방 참가'),
    h('div', { class: 'dim' }, '친구에게 받은 5자리 방 코드를 입력하세요'),
    inp,
    h('div', { class: 'row', style: { justifyContent: 'center' } }, btn('뒤로', () => showMenu(app)), btn('참가하기', () => app.joinRoom(inp.value), 'primary'))), topbar());
  setScreen(app, el);
  if (!isTouch()) setTimeout(() => inp.focus(), 50);
}

// ---------- 대기실 ----------
export function showLobby(app, m) {
  const host = app.isHostRole;
  const M = app.match;
  const me = m.players.find((p) => p.id === app.localPid);
  const code = app.roomCode;
  const link = location.origin + location.pathname + '?room=' + code;
  const list = h('div', { class: 'plist' });
  m.players.forEach((p, i) => {
    const color = SLOT_COLORS[i % SLOT_COLORS.length];
    const tags = [];
    if (p.kind === 'local' || (host && p.id === app.localPid)) tags.push(h('span', { class: 'tag host' }, '방장'));
    else if (p.kind === 'bot') tags.push(h('span', { class: 'tag' }, '봇 · ' + ({ easy: '쉬움', normal: '보통', hard: '어려움' }[p.diff] || '보통')));
    else tags.push(h('span', { class: 'tag ' + (p.ready ? 'ok' : '') }, p.ready ? '준비 완료' : '준비 중'));
    if (p.kind === 'remote' && p.ping) tags.push(h('span', { class: 'tag', style: { color: p.ping > 300 ? '#ffd23f' : '' } }, p.ping + 'ms'));
    const row = h('div', { class: 'pitem' }, h('span', { class: 'slotdot', style: { background: color } }), charCanvas(sanitizeLook(p.look), 2), h('span', { class: 'nm', style: { color } }, p.name + (p.id === app.localPid ? ' (나)' : '')), ...tags);
    if (host && p.kind !== 'local') row.append(btn('✕', () => app.removeLobbyPlayer(p.id), 'small red', { title: p.kind === 'bot' ? '봇 빼기' : '내보내기' }));
    list.append(row);
  });
  for (let i = m.players.length; i < 6; i++) list.append(h('div', { class: 'pitem', style: { opacity: 0.35 } }, h('span', { class: 'nm dim' }, '빈 자리')));

  const s = m.settings;
  let left;
  if (host) {
    const upd = (k) => (v) => { app.hostSettings[k] = v; M && M.setSettings({ [k]: v }); };
    left = h('div', { class: 'col' },
      group('맵', mapPicker(s.map, upd('map'))),
      group('판 길이', seg(Object.entries(LENGTHS).map(([k, v]) => [k, v.label]), s.length, upd('length'))),
      group('추가할 봇 난이도', seg([['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']], app.hostSettings.diff, (v) => { app.hostSettings.diff = v; })),
      group('나간 사람 자리', seg([[true, '봇이 대신하기'], [false, '비워 두기']], s.replace !== false, upd('replace'))));
  } else {
    left = h('div', { class: 'col' },
      group('맵', h('div', null, s.map === 'random' ? '🎲 무작위' : `${MAPS[s.map].icon} ${MAPS[s.map].name}`)),
      group('판 길이', h('div', null, (LENGTHS[s.length] || LENGTHS.normal).label)),
      h('div', { class: 'dim', style: { fontSize: '0.85em' } }, '설정은 방장이 정해요.'));
  }
  const ready = !!(me && me.ready);
  const allReady = m.players.every((p) => p.kind !== 'remote' || p.ready);
  const actions = host
    ? [btn('나가기', () => app.exitToMenu()), btn('+ 봇 추가', () => app.addBot(), '', { disabled: m.players.length >= 6 }), btn(allReady ? '▶ 시작!' : '준비 기다리는 중', () => app.hostStart(), 'primary', { disabled: m.players.length < 2 || !allReady })]
    : [btn('나가기', () => app.exitToMenu()), btn(ready ? '준비 취소' : '✔ 준비 완료', () => app.sendReady(!ready), ready ? '' : 'primary')];
  const codeBox = h('div', { class: 'col', style: { gap: '0.4em' } },
    h('div', { class: 'opt-label' }, '방 코드'),
    h('div', { class: 'room-code' }, code),
    h('div', { class: 'row' },
      btn('🔗 초대 링크 복사', () => copy(link), 'small'),
      btn('코드 복사', () => copy(code), 'small')));
  const el = h('div', { class: 'screen dark' }, h('div', { class: 'panel pix lobby' },
    h('div', { class: 'col' }, h('h2', { style: { margin: 0 } }, host ? '👥 내 방' : '👥 대기실'), codeBox, left),
    h('div', { class: 'col' }, h('div', { class: 'opt-label' }, `참가자 ${m.players.length}/6`), list, h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, ...actions))), topbar());
  setScreen(app, el);
}
function copy(text) {
  const ok = () => toast('복사했어요!');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, () => fallbackCopy(text));
  else fallbackCopy(text);
}
function fallbackCopy(text) {
  const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('복사했어요!'); } catch (e) { toast(text, 5000); }
  ta.remove();
}

// ---------- 꾸미기 상점 ----------
export function showShop(app, tab = 'color') {
  const prev = h('canvas', { width: FW * 6, height: FH * 6 });
  let fr = 0;
  let previewLook = Object.assign({}, save.look);
  const draw = () => { fr++; drawPreview(prev, previewLook, fr * 0.35, fr % 8 < 4 ? 'idle0' : (fr % 8 < 6 ? 'win0' : 'win1')); };
  draw(); every(draw, 300);
  const coinEl = h('div', { class: 'coin', style: { fontSize: '1.2em' } }, String(save.coins));
  const tabs = h('div', { class: 'tabs' });
  const grid = h('div', { class: 'grid-items' });
  const renderTab = () => {
    tabs.innerHTML = '';
    for (const t of SHOP_TABS) tabs.append(btn(t.name, () => { tab = t.key; previewLook = Object.assign({}, save.look); renderTab(); }, tab === t.key ? 'on' : ''));
    grid.innerHTML = '';
    const T = SHOP_TABS.find((t) => t.key === tab);
    T.list.forEach((item, i) => {
      const owned = save.owned[tab].includes(i);
      const equipped = save.look[tab] === i;
      let vis;
      if (tab === 'fx') vis = h('div', { style: { fontSize: '2em', height: '2.2em', display: 'flex', alignItems: 'center' } }, ['🎆', '💖', '⭐', '⚡', '👑'][i]);
      else vis = charCanvas(Object.assign({}, save.look, { [tab]: i }), 2, 'idle0');
      const label = equipped ? '착용 중' : owned ? '보유' : null;
      const b = btn([vis, h('div', null, item.name), label ? h('div', { class: 'price dim' }, label) : h('div', { class: 'price coin' }, String(item.price))], () => {
        previewLook = Object.assign({}, save.look, { [tab]: i });
        draw();
        if (owned) { save.look[tab] = i; persist(); renderTab(); return; }
        if (save.coins < item.price) { toast(`코인이 부족해요 (${item.price - save.coins} 더 필요)`); sfx('deny'); return; }
        modal('구매할까요?', h('div', null, `${item.name} — `, h('span', { class: 'coin' }, String(item.price))), [
          { label: '취소', onClick: () => { previewLook = Object.assign({}, save.look); } },
          { label: '구매하고 착용', cls: 'primary', onClick: () => { save.coins -= item.price; save.owned[tab].push(i); save.look[tab] = i; persist(); sfx('buy'); coinEl.textContent = String(save.coins); previewLook = Object.assign({}, save.look); renderTab(); } },
        ]);
      }, 'shop-item ' + (equipped ? 'equipped' : owned ? '' : 'locked'));
      grid.append(b);
    });
  };
  renderTab();
  const el = h('div', { class: 'screen dark' }, h('div', { class: 'panel pix shop' },
    h('div', { class: 'shop-prev' }, h('h2', { style: { margin: 0 } }, '🎨 꾸미기'), prev, coinEl,
      h('div', { class: 'dim', style: { fontSize: '0.72em', textAlign: 'center' } }, '코인과 꾸미기는 이 기기(브라우저)에만 저장돼요.'),
      btn('돌아가기', () => showMenu(app))),
    h('div', { class: 'shop-main' }, tabs, grid)), topbar());
  setScreen(app, el);
}

// ---------- 설정 ----------
function settingsBody(onChange) {
  const st = save.settings;
  const slider = (label, key, min, max, stepv, fmt) => {
    const val = h('span', { class: 'dim' }, fmt(st[key]));
    const r = h('input', { type: 'range', min, max, step: stepv, value: st[key] });
    r.addEventListener('input', () => { st[key] = +r.value; val.textContent = fmt(st[key]); onChange(key); });
    r.addEventListener('change', () => persist());
    return group(h('span', null, label + ' ', val), r);
  };
  const pct = (v) => Math.round(v * 100) + '%';
  const kids = [
    slider('배경음악', 'music', 0, 1, 0.05, pct),
    slider('효과음', 'sfx', 0, 1, 0.05, pct),
    group('화면 흔들림', seg([[true, '켜기'], [false, '끄기']], st.shake, (v) => { st.shake = v; persist(); })),
  ];
  if (isTouch()) {
    kids.push(group('진동', seg([[true, '켜기'], [false, '끄기']], st.vibrate, (v) => { st.vibrate = v; persist(); })));
    kids.push(slider('조작 버튼 크기', 'btnSize', 0.7, 1.5, 0.05, pct));
    kids.push(slider('조작 버튼 투명도', 'btnAlpha', 0.2, 1, 0.05, pct));
  } else {
    const names = { left: '왼쪽', right: '오른쪽', up: '위 (사다리)', down: '아래 · 숙이기', jump: '점프', dash: '대시', rotate: '배치 회전' };
    const grid = h('div', { class: 'keys' });
    const renderKeys = () => {
      grid.innerHTML = '';
      for (const k of Object.keys(names)) {
        const b = btn(st.keys[k].map(keyLabel).join(' / '), () => {
          b.textContent = '키를 누르세요...';
          listenKey((code) => {
            if (code === 'Escape' || code === 'F12') { renderKeys(); return; }
            st.keys[k] = [code, ...st.keys[k].filter((c) => c !== code)].slice(0, 2);
            persist(); renderKeys();
          });
        }, 'small');
        grid.append(h('span', null, names[k]), b);
      }
    };
    renderKeys();
    kids.push(group(h('span', null, '키 설정 ', h('span', { class: 'dim', style: { fontSize: '0.85em' } }, '(누른 키가 첫 번째 키가 돼요)')), grid,
      btn('기본값으로', () => { st.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS)); persist(); renderKeys(); }, 'small')));
  }
  return h('div', { style: { minWidth: 'min(80vw, 26em)' } }, ...kids);
}
function onSettingChange(k) {
  const st = save.settings;
  if (k === 'music' || k === 'sfx') setVolumes(st.music, st.sfx);
  if (k === 'btnSize' || k === 'btnAlpha') applyTouchSettings();
}
export function showSettings(app) {
  const el = h('div', { class: 'screen dark' }, h('div', { class: 'panel pix' },
    h('h2', null, '⚙ 설정'),
    settingsBody(onSettingChange),
    h('div', { class: 'row' }, btn('닉네임 바꾸기', () => editName()), h('div', { class: 'spacer' }), btn('돌아가기', () => { persist(); showMenu(app); }, 'primary'))), topbar());
  setScreen(app, el);
}
export function showSettingsModal() {
  modal('⚙ 설정', settingsBody(onSettingChange), [{ label: '닫기', cls: 'primary', onClick: () => persist() }]);
}

// ---------- 조작법 ----------
function helpBody() {
  const t = isTouch();
  const k = (s) => h('kbd', null, s);
  return h('div', { class: 'help' },
    h('h4', null, '🎯 목표'),
    h('div', null, '매 라운드 ', h('b', null, '파티 상자'), '에서 아이템을 골라 맵에 놓고, 모두 함께 골 깃발까지 달려요. 먼저 목표 점수에 도달하면 우승!'),
    h('h4', null, '⭐ 점수'),
    h('div', null, '골인 +10점 · 내가 놓은 함정에 다른 사람이 탈락하면 +3점', h('br'), '단, ', h('b', null, '전원 골인하면 모두 0점'), '이에요. 너무 쉬운 맵은 손해!'),
    h('h4', null, '🎮 조작'),
    t ? h('div', null, '왼쪽 화면: 조이스틱(이동 · 아래로 숙이기 · 위로 사다리)', h('br'), '오른쪽 버튼: 점프(길게 누르면 높이) · 대시 · 숙이기', h('br'), '배치: 손가락으로 끌어서 위치를 정하고 [놓기], 두 손가락으로 확대')
      : h('div', null, '이동 ', k('A'), k('D'), ' 또는 ', k('←'), k('→'), ' · 점프 ', k('스페이스'), k('W'), k('↑'), ' (길게 누르면 높이)', h('br'),
        '대시 ', k('Shift'), k('K'), ' (방향키와 함께 8방향) · 숙이기 ', k('S'), k('↓'), ' (달리다 숙이면 슬라이딩)', h('br'),
        '벽에 붙어서 점프하면 ', h('b', null, '벽 점프'), ' · 사다리는 ', k('W'), k('S'), h('br'),
        '배치: 마우스로 위치, 클릭으로 놓기, ', k('R'), ' / 휠 / 우클릭으로 회전 · 게임패드도 지원해요'),
    h('h4', null, '🧰 아이템'),
    h('div', { style: { fontSize: '0.9em' } }, Object.values(ITEMS).map((d) => `${d.name}`).join(' · ')));
}
export function showHelpModal() { modal('❓ 조작법 · 규칙', helpBody(), [{ label: '알겠어요!', cls: 'primary' }]); }
export function showHelp(app) {
  const el = h('div', { class: 'screen dark' }, h('div', { class: 'panel pix', style: { maxWidth: 'min(94vw, 760px)' } },
    h('h2', null, '❓ 조작법 · 규칙'), helpBody(),
    h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '1em' } }, btn('돌아가기', () => showMenu(app), 'primary'))), topbar());
  setScreen(app, el);
}
export { getSheet, COLORS };
