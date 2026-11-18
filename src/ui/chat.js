// 자유 채팅 (온라인 대기실 · 게임 중)
import { h } from './dom.js';
import { sfx } from '../core/audio.js';
import { isTouch } from '../core/util.js';

const BAD = ['시발', '씨발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '좆', 'ㅈㄹ', '지랄', '개새', '새끼', '꺼져', '닥쳐', '느금', '니애미', '애미', '애비', 'fuck', 'shit', 'bitch', '섹스', 'sex'];
export const CHAT_MAX = 60;

export function filterText(s) {
  let t = String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
  const low = t.toLowerCase();
  for (const b of BAD) {
    let i = low.indexOf(b);
    while (i >= 0) { t = t.slice(0, i) + '*'.repeat(b.length) + t.slice(i + b.length); i = low.indexOf(b, i + b.length); }
  }
  return t;
}

export class Chat {
  constructor(onSend) {
    this.onSend = onSend;
    this.mode = 'off';
    this.log = h('div', { class: 'chat-log' });
    this.input = h('input', { class: 'text-in chat-in', maxlength: String(CHAT_MAX), placeholder: '메시지 입력 (Enter로 보내기)', autocomplete: 'off', enterkeyhint: 'send' });
    this.sendBtn = h('button', { class: 'btn small primary', type: 'submit' }, '보내기');
    this.form = h('form', { class: 'chat-form', onsubmit: (e) => { e.preventDefault(); this.send(); } }, this.input, this.sendBtn);
    this.root = h('div', { class: 'chat hidden' }, this.log, this.form);
    document.body.appendChild(this.root);
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { this.input.value = ''; this.close(); }
    });
    this.input.addEventListener('blur', () => { if (this.mode === 'game') setTimeout(() => this.close(), 120); });
    // PC: 게임 중 Enter/T 로 입력창 열기
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'game' || this.isOpen() || e.target === this.input) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'KeyT' || (e.code === 'Enter' && !(this.blockEnter && this.blockEnter()))) { e.preventDefault(); this.open(); }
    });
    this.items = [];
  }
  setMode(mode) {
    this.mode = mode;
    this.root.className = 'chat chat-' + mode + (mode === 'off' ? ' hidden' : '');
    if (mode === 'lobby') { this.form.classList.remove('hidden'); this.items.forEach((x) => x.el.classList.remove('fade')); }
    if (mode === 'game') this.close();
    if (mode === 'off') { this.input.blur(); this.clear(); }
  }
  clear() { this.items = []; this.log.innerHTML = ''; }
  isOpen() { return this.mode === 'lobby' || !this.form.classList.contains('hidden'); }
  open() {
    if (this.mode !== 'game') return;
    this.form.classList.remove('hidden');
    this.root.classList.add('open');
    this.items.forEach((x) => x.el.classList.remove('fade'));
    this.onOpen && this.onOpen(true);
    setTimeout(() => this.input.focus(), 30);
  }
  close() {
    if (this.mode !== 'game') return;
    this.form.classList.add('hidden');
    this.root.classList.remove('open');
    this.input.blur();
    this.onOpen && this.onOpen(false);
    const now = performance.now();
    this.items.forEach((x) => { if (now - x.t > 7000) x.el.classList.add('fade'); });
  }
  send() {
    const t = filterText(this.input.value);
    this.input.value = '';
    if (t) this.onSend(t);
    if (this.mode === 'game') this.close();
  }
  add(name, color, text, sys) {
    const el = h('div', { class: 'chat-line' + (sys ? ' sys' : '') },
      sys ? null : h('b', { style: { color: color || '#fff' } }, name + ': '),
      h('span', null, text));
    this.log.appendChild(el);
    const item = { el, t: performance.now() };
    this.items.push(item);
    while (this.items.length > 40) this.items.shift().el.remove();
    this.log.scrollTop = this.log.scrollHeight;
    if (!sys) sfx('emote');
    // 게임 중에는 8초 뒤 흐려짐
    setTimeout(() => { if (this.mode === 'game' && !this.isOpen()) el.classList.add('fade'); }, 8000);
  }
}
