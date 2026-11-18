// 모바일 가상 조이스틱 + 버튼
import { touch } from '../core/input.js';
import { save } from '../core/save.js';
import { h, vibrate } from './dom.js';

let root = null, joy = null, knob = null, jp = null, crouchHeld = false;
let joyY = 0;

export function initTouch() {
  root = document.getElementById('touch');
  const zone = h('div', { class: 'zone-l' });
  joy = h('div', { class: 'joy hidden' }, (knob = h('div', { class: 'knob' })));
  const bJump = h('div', { class: 'tbtn jump' }, '점프');
  const bDash = h('div', { class: 'tbtn dash' }, '대시');
  const bCrouch = h('div', { class: 'tbtn crouch' }, '숙이기');
  root.append(zone, joy, bJump, bDash, bCrouch);

  const R = 46;
  zone.addEventListener('pointerdown', (e) => {
    if (jp !== null) return;
    jp = { id: e.pointerId, x: e.clientX, y: e.clientY };
    zone.setPointerCapture(e.pointerId);
    joy.style.left = e.clientX + 'px'; joy.style.top = e.clientY + 'px';
    joy.classList.remove('hidden');
    knob.style.transform = '';
    touch.active = true;
    e.preventDefault();
  });
  const move = (e) => {
    if (!jp || e.pointerId !== jp.id) return;
    let dx = e.clientX - jp.x, dy = e.clientY - jp.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / R, ny = dy / R;
    touch.mx = Math.abs(nx) > 0.22 ? Math.max(-1, Math.min(1, nx * 1.35)) : 0;
    joyY = ny > 0.6 ? 1 : ny < -0.6 ? -1 : 0;
    touch.my = crouchHeld ? 1 : joyY;
  };
  const end = (e) => {
    if (!jp || e.pointerId !== jp.id) return;
    jp = null; touch.mx = 0; joyY = 0; touch.my = crouchHeld ? 1 : 0;
    joy.classList.add('hidden');
  };
  zone.addEventListener('pointermove', move);
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);

  const hold = (el, on, off) => {
    const ids = new Set();
    el.addEventListener('pointerdown', (e) => { ids.add(e.pointerId); el.setPointerCapture(e.pointerId); el.classList.add('on'); touch.active = true; on(); if (save.settings.vibrate) vibrate(8); e.preventDefault(); });
    const up = (e) => { if (!ids.delete(e.pointerId)) return; if (!ids.size) { el.classList.remove('on'); off(); } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  hold(bJump, () => { touch.jump = true; touch.jumpP = true; }, () => { touch.jump = false; });
  hold(bDash, () => { touch.dashP = true; }, () => {});
  hold(bCrouch, () => { crouchHeld = true; touch.my = 1; }, () => { crouchHeld = false; touch.my = joyY; });
  applyTouchSettings();
}

export function applyTouchSettings() {
  if (!root) return;
  root.style.setProperty('--s', save.settings.btnSize);
  root.style.setProperty('--a', save.settings.btnAlpha);
}
export function showTouch(on) {
  if (!root) return;
  root.classList.toggle('hidden', !on);
  if (!on) { touch.mx = 0; touch.my = 0; touch.jump = false; jp = null; crouchHeld = false; joy && joy.classList.add('hidden'); }
}
