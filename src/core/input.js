// 키보드 · 게임패드 · 터치 입력 통합
import { save } from './save.js';

const down = new Set();
const edge = { jump: false, jumpAlt: false, dash: false, rotate: false, pause: false, confirm: false };
export const touch = { mx: 0, my: 0, jump: false, dash: false, active: false };
let padPrev = {};
let listening = null;

function codeIs(code, act) { return (save.settings.keys[act] || []).includes(code); }

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (listening) { e.preventDefault(); const f = listening; listening = null; f(e.code); return; }
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!e.repeat) {
      if (codeIs(e.code, 'jump')) edge.jump = true;
      if (codeIs(e.code, 'up')) edge.jumpAlt = true;
      if (codeIs(e.code, 'dash')) edge.dash = true;
      if (codeIs(e.code, 'rotate')) edge.rotate = true;
      if (e.code === 'Escape') edge.pause = true;
      if (e.code === 'Enter' || e.code === 'NumpadEnter') edge.confirm = true;
    }
    down.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());
}

export function listenKey(cb) { listening = cb; }

function held(act) {
  for (const c of save.settings.keys[act] || []) if (down.has(c)) return true;
  return false;
}

function pad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p || !p.connected) continue;
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    let mx = Math.abs(p.axes[0]) > 0.3 ? p.axes[0] : 0;
    let my = Math.abs(p.axes[1]) > 0.5 ? p.axes[1] : 0;
    if (b(14)) mx = -1; if (b(15)) mx = 1; if (b(12)) my = -1; if (b(13)) my = 1;
    const st = { jump: b(0), dash: b(2) || b(1) || b(5) || b(7), rot: b(3) || b(4), start: b(9) };
    const e = { jumpP: st.jump && !padPrev.jump, dashP: st.dash && !padPrev.dash, rotP: st.rot && !padPrev.rot, startP: st.start && !padPrev.start };
    padPrev = st;
    return { mx, my, ...st, ...e };
  }
  return null;
}

// 고정 스텝마다 호출: 누름 순간(edge)을 소비
export function readInput(nearLadder) {
  let mx = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
  let my = (held('down') ? 1 : 0) - (held('up') ? 1 : 0);
  let jump = held('jump') || (!nearLadder && held('up'));
  let jumpP = edge.jump || (!nearLadder && edge.jumpAlt);
  let dashP = edge.dash;
  edge.jump = false; edge.jumpAlt = false; edge.dash = false;
  const g = pad();
  if (g) {
    if (g.mx) mx = g.mx; if (g.my) my = g.my;
    jump = jump || g.jump; jumpP = jumpP || g.jumpP; dashP = dashP || g.dashP;
    if (g.rotP) edge.rotate = true;
    if (g.startP) edge.pause = true;
  }
  if (touch.active) {
    if (touch.mx) mx = touch.mx;
    if (touch.my) my = touch.my;
    jump = jump || touch.jump;
    if (touch.jumpP) { jumpP = true; touch.jumpP = false; }
    if (touch.dashP) { dashP = true; touch.dashP = false; }
  }
  return { mx: Math.max(-1, Math.min(1, mx)), my: Math.max(-1, Math.min(1, my)), jump, jumpP, dashP };
}
export function takeEdge(name) { const v = edge[name]; edge[name] = false; return v; }
export function clearEdges() { for (const k in edge) edge[k] = false; touch.jumpP = false; touch.dashP = false; }
export function keyLabel(code) {
  const map = { Space: '스페이스', ShiftLeft: '왼쪽 Shift', ShiftRight: '오른쪽 Shift', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Enter: 'Enter', ControlLeft: 'Ctrl' };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}
