// 게임 중 화면 (상단 정보, 점수, 파티 상자, 배치 바, 결과, 우승)
import { h, btn, iconCanvas, charCanvas, toggleFullscreen, canFullscreen } from './dom.js';
import { ITEMS } from '../data/items.js';
import { sfx } from '../core/audio.js';
import { isTouch } from '../core/util.js';

const CAT = { terrain: '지형', obstacle: '방해', lethal: '치명', special: '특수' };
export const EMOTES = ['👍', '😂', '😱', '😡', '❤️', 'GG'];

export class Hud {
  constructor(opts) {
    this.opts = opts; // { online, onMenu, onEmote }
    this.root = document.getElementById('hud');
    this.root.innerHTML = '';
    this.root.classList.remove('hidden');
    this.phaseName = h('div', { class: 'phase-name' });
    this.phaseTime = h('div', { class: 'phase-time' });
    this.top = h('div', { class: 'hud-top' }, h('div', { class: 'phase-box pix' }, this.phaseName, this.phaseTime));
    this.scores = h('div', { class: 'scores' });
    const right = h('div', { class: 'hud-right' });
    if (opts.online) right.append(btn('💬', () => this.toggleEmotes(), 'iconbtn', { title: '이모티콘' }));
    if (canFullscreen()) right.append(btn('⛶', () => toggleFullscreen(), 'iconbtn', { title: '전체 화면' }));
    right.append(btn('☰', () => opts.onMenu && opts.onMenu(), 'iconbtn', { title: '메뉴' }));
    this.layer = h('div', { style: { position: 'absolute', inset: '0' } });
    this.root.append(this.layer, this.top, this.scores, right);
    this.rows = new Map();
    this.bannerEl = null; this.subEl = null; this.emoteEl = null;
  }
  destroy() { this.root.innerHTML = ''; this.root.classList.add('hidden'); }

  setPhase(name, secs, warnAt = 5) {
    this.phaseName.textContent = name;
    if (secs === null || secs === undefined) { this.phaseTime.textContent = ''; this.phaseTime.classList.remove('warn'); return; }
    const s = Math.max(0, Math.ceil(secs));
    const txt = String(s);
    if (this.phaseTime.textContent !== txt) {
      this.phaseTime.textContent = txt;
      this.phaseTime.classList.toggle('warn', s <= warnAt && s > 0);
    }
  }

  setScores(players, target, states) {
    const maxS = Math.max(target, ...players.map((p) => p.score));
    for (const p of players) {
      let r = this.rows.get(p.id);
      if (!r) {
        const bar = h('i', { style: { background: p.slotColor } });
        r = { el: h('div', { class: 'sc' }), st: h('span', { class: 'st' }), nm: h('span', { class: 'nm' }, p.name), bar, pt: h('span', { class: 'pt' }) };
        r.el.append(h('span', { class: 'slotdot', style: { background: p.slotColor } }), r.nm, h('span', { class: 'bar' }, bar), r.pt, r.st);
        this.scores.append(r.el);
        this.rows.set(p.id, r);
      }
      r.bar.style.width = Math.min(100, (p.score / maxS) * 100) + '%';
      r.pt.textContent = p.score;
      const st = states ? states.get(p.id) : null;
      r.st.textContent = st === 'goal' ? '🏁' : st === 'dead' ? '✖' : st === 'left' ? '…' : '';
      r.el.classList.toggle('dead', st === 'dead' || st === 'left');
    }
  }

  banner(text, sub, ms = 1400, cls = '') {
    if (this.bannerEl) this.bannerEl.remove();
    const el = h('div', { class: 'banner ' + cls }, text, sub ? h('small', null, sub) : null);
    this.layer.append(el);
    this.bannerEl = el;
    if (ms) setTimeout(() => { el.remove(); if (this.bannerEl === el) this.bannerEl = null; }, ms);
  }
  clearBanner() { if (this.bannerEl) { this.bannerEl.remove(); this.bannerEl = null; } }
  sub(text, ms = 2500) {
    if (this.subEl) this.subEl.remove();
    if (!text) { this.subEl = null; return; }
    const el = h('div', { class: 'subbanner pix' }, text);
    this.layer.append(el);
    this.subEl = el;
    if (ms) setTimeout(() => { el.remove(); if (this.subEl === el) this.subEl = null; }, ms);
  }

  // ----- 파티 상자 -----
  showPick(box, onPick, overtime) {
    this.hidePick();
    const cards = box.map((type, i) => {
      const d = ITEMS[type];
      const who = h('div', { class: 'who' }, '');
      const el = btn([
        iconCanvas(type, 3),
        h('div', null, d.name),
        h('span', { class: 'cat ' + d.cat }, CAT[d.cat]),
        who,
      ], () => onPick(i), 'card', { style: { animationDelay: i * 0.06 + 's' }, title: d.desc });
      el._who = who;
      return el;
    });
    this.cards = cards;
    this.pickEl = h('div', { class: 'pickwrap' },
      h('div', { class: 'pickbox pix' },
        h('h3', null, overtime ? '🔥 연장전! 파티 상자' : '🎁 파티 상자'),
        h('div', { class: 'hint' }, '먼저 고르는 사람이 가져가요! ' + (isTouch() ? '' : '(숫자 키 1~8)')),
        h('div', { class: 'cards' }, cards)));
    this.layer.append(this.pickEl);
  }
  markPick(idx, name, color, mine) {
    const c = this.cards && this.cards[idx];
    if (!c) return;
    c.classList.add('taken');
    c.disabled = true;
    c._who.textContent = name;
    c._who.style.color = color;
    if (mine) { c.classList.remove('taken'); c.classList.add('sel'); }
  }
  lockPicks() { if (this.cards) this.cards.forEach((c) => { c.disabled = true; }); }
  hidePick() { if (this.pickEl) { this.pickEl.remove(); this.pickEl = null; this.cards = null; } }

  // ----- 배치 -----
  showPlace(type, handlers) {
    this.hidePlace();
    const d = ITEMS[type];
    const touchUI = isTouch();
    this.placeInfo = h('span', null, touchUI ? '끌어서 위치를 정하고 [놓기]' : '클릭: 놓기 · R/휠/우클릭: 회전');
    const kids = [iconCanvas(type, 3), h('div', { class: 'info' }, h('b', null, d.name), this.placeInfo)];
    if (d.rots.length > 1) kids.push(btn('⟳ 회전', handlers.rotate, '', { title: '회전 (R)' }));
    if (touchUI) kids.push(this.placeBtn = btn('✔ 놓기', handlers.confirm, 'primary'));
    this.placeEl = h('div', { class: 'placebar pix' }, kids);
    this.layer.append(this.placeEl);
  }
  placeHint(text) { if (this.placeInfo) this.placeInfo.textContent = text; }
  placeDone(text) {
    this.hidePlace();
    this.placeEl = h('div', { class: 'placebar pix' }, h('div', { class: 'info' }, h('b', null, text || '배치 완료!'), h('span', null, '다른 플레이어를 기다리는 중...')));
    this.layer.append(this.placeEl);
  }
  hidePlace() { if (this.placeEl) { this.placeEl.remove(); this.placeEl = null; this.placeBtn = null; } }

  // ----- 관전 -----
  spectate(name, prev, next) {
    if (!this.specEl) {
      this.specName = h('span', null);
      this.specEl = h('div', { class: 'spectate pix' }, btn('◀', prev, 'small'), h('span', { class: 'dim' }, '관전 중:'), this.specName, btn('▶', next, 'small'));
      this.layer.append(this.specEl);
    }
    this.specName.textContent = name;
  }
  hideSpectate() { if (this.specEl) { this.specEl.remove(); this.specEl = null; } }

  // ----- 결과 -----
  showResult(rows, flag, target, round) {
    this.hideResult();
    const maxS = Math.max(target, ...rows.map((r) => r.after)) * 1.08;
    const pct = (v) => (v / maxS) * 100 + '%';
    const title = flag === 'easy' ? '😅 너무 쉬워요! 전원 0점' : flag === 'fail' ? '💀 아무도 못 갔어요!' : `라운드 ${round} 결과`;
    const box = h('div', { class: 'resbox pix' }, h('h3', null, title));
    const anims = [];
    for (const r of rows) {
      const base = h('div', { class: 'seg base', style: { '--c': r.color, left: '0', width: pct(r.before) } });
      base.style.setProperty('--c', r.color);
      const g = h('div', { class: 'seg g', style: { left: pct(r.before), width: '0' } });
      const k = h('div', { class: 'seg k', style: { left: pct(r.before + r.goal), width: '0' } });
      const plus = h('span', { class: 'plus' }, '');
      const pt = h('span', { class: 'pt' }, String(r.before));
      box.append(h('div', { class: 'resrow' }, charCanvas(r.look, 2, r.goal ? 'win0' : 'idle0'), h('span', { class: 'nm', style: { color: r.color } }, r.name),
        h('div', { class: 'resbar' }, base, g, k, h('div', { class: 'goalline', style: { left: pct(target) } })), plus, pt));
      anims.push(() => {
        g.style.width = pct(r.goal); k.style.width = pct(r.kills);
        if (r.goal || r.kills) { plus.textContent = '+' + (r.goal + r.kills); pt.textContent = String(r.after); }
      });
    }
    box.append(h('div', { class: 'legend' }, h('span', null, h('i', { style: { background: '#ffd23f' } }), '골인 +5'), h('span', null, h('i', { style: { background: '#ff5a5a' } }), '함정 처치 +2'), h('span', null, h('i', { style: { background: '#fff' } }), `목표 ${target}점`)));
    this.resEl = h('div', { class: 'result' }, box);
    this.layer.append(this.resEl);
    setTimeout(() => { anims.forEach((f, i) => setTimeout(() => { f(); if (rows[i].goal || rows[i].kills) sfx('score'); }, i * 160)); }, 450);
  }
  hideResult() { if (this.resEl) { this.resEl.remove(); this.resEl = null; } }

  showEnd(podium, coinLines, buttons, title, xpText) {
    this.hideResult(); this.hidePick(); this.hidePlace(); this.hideSpectate();
    const pods = h('div', { class: 'podium' });
    const order = [1, 0, 2];
    for (const i of order) {
      const p = podium[i];
      if (!p) continue;
      pods.append(h('div', { class: 'pod p' + (i + 1) }, p.title ? h('div', { class: 'dim', style: { fontSize: '0.7em' } }, `「${p.title}」`) : null, h('div', { style: { color: p.color, fontSize: '0.85em' } }, p.name), charCanvas(p.look, 3, i === 0 ? 'win0' : 'idle0'), h('div', { class: 'step pix' }, `${i + 1}`), h('div', { class: 'dim', style: { fontSize: '0.8em' } }, p.score + '점')));
    }
    const coins = h('div', { class: 'coinlist' });
    let total = 0;
    for (const [label, v] of coinLines) { total += v; coins.append(h('span', null, label), h('span', { class: 'coin' }, '+' + v)); }
    if (coinLines.length) coins.append(h('b', null, '합계'), h('b', { class: 'coin' }, '+' + total));
    this.endEl = h('div', { class: 'result' }, h('div', { class: 'resbox pix', style: { textAlign: 'center' } },
      h('h3', null, title), pods, coinLines.length ? coins : null,
      xpText ? h('div', { class: 'dim', style: { fontSize: '0.8em', marginBottom: '0.8em' } }, xpText) : null,
      h('div', { class: 'row', style: { justifyContent: 'center' } }, buttons.map((b) => btn(b.label, b.onClick, b.cls || '')))));
    this.layer.append(this.endEl);
  }
  hideEnd() { if (this.endEl) { this.endEl.remove(); this.endEl = null; } }

  toggleEmotes() {
    if (this.emoteEl) { this.emoteEl.remove(); this.emoteEl = null; return; }
    this.emoteEl = h('div', { class: 'emotes pix' }, EMOTES.map((e) => btn(e, () => { this.opts.onEmote && this.opts.onEmote(e); this.toggleEmotes(); })));
    this.root.append(this.emoteEl);
  }
}
