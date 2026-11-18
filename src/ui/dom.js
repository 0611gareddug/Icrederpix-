// DOM 도우미
import { sfx } from '../core/audio.js';
import { iconFor } from '../art/sprites.js';
import { getSheet, FW, FH } from '../art/character.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of kids.flat(3)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

// 효과음 포함 버튼
export function btn(label, onClick, cls = '', attrs = {}) {
  return h('button', Object.assign({
    class: 'btn ' + cls,
    onclick: (e) => { sfx('click'); onClick && onClick(e); },
    onpointerenter: (e) => { if (e.pointerType === 'mouse') sfx('hover'); },
  }, attrs), label);
}

export function iconCanvas(type, scale = 3) {
  const src = iconFor(type);
  const c = h('canvas', { width: 16 * scale, height: 16 * scale });
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, 16 * scale, 16 * scale);
  return c;
}

export function charCanvas(look, scale = 3, frame = 'idle0', ol) {
  const c = h('canvas', { width: FW * scale, height: FH * scale });
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const s = getSheet(look, ol);
  ctx.drawImage(s.right[frame], 0, 0, FW * scale, FH * scale);
  return c;
}

let toastEl = null, toastT = 0;
export function toast(msg, ms = 2200) {
  if (toastEl) toastEl.remove();
  toastEl = h('div', { class: 'toast pix' }, msg);
  document.body.appendChild(toastEl);
  clearTimeout(toastT);
  const el = toastEl;
  toastT = setTimeout(() => { el.remove(); if (toastEl === el) toastEl = null; }, ms);
}

export function modal(title, body, buttons) {
  const wrap = h('div', { class: 'modal' });
  const close = () => wrap.remove();
  const panel = h('div', { class: 'panel pix modal-panel' },
    title ? h('h2', null, title) : null,
    h('div', { class: 'modal-body' }, body),
    h('div', { class: 'row', style: { marginTop: '1em', justifyContent: 'flex-end', flex: '0 0 auto' } },
      (buttons || [{ label: '확인' }]).map((b) => btn(b.label, () => { if (b.onClick && b.onClick() === false) return; close(); }, b.cls || ''))));
  wrap.appendChild(panel);
  document.body.appendChild(wrap);
  return close;
}

export function vibrate(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 무시 */ }
}

export function canFullscreen() {
  const d = document.documentElement;
  return !!(d.requestFullscreen || d.webkitRequestFullscreen);
}
export function toggleFullscreen() {
  const d = document.documentElement;
  const fs = document.fullscreenElement || document.webkitFullscreenElement;
  if (fs) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  const req = d.requestFullscreen || d.webkitRequestFullscreen;
  if (!req) { toast('이 브라우저는 전체 화면을 지원하지 않아요. 홈 화면에 추가해서 실행해 보세요.'); return; }
  Promise.resolve(req.call(d, { navigationUI: 'hide' })).then(() => {
    try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* 무시 */ }
  }).catch(() => {});
}
