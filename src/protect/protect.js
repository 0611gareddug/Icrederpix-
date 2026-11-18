// 소스 보기 차단 (우클릭, 단축키, 개발자 도구 감지)
/* global __DEV__ */
export function protect() {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return;
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); return false; };
  document.addEventListener('contextmenu', stop, true);
  document.addEventListener('selectstart', (e) => { const t = e.target; if (!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) stop(e); }, true);
  document.addEventListener('dragstart', stop, true);
  document.addEventListener('copy', (e) => { const t = document.activeElement; if (!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) stop(e); }, true);
  window.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    const c = e.ctrlKey || e.metaKey;
    if (e.key === 'F12' || e.keyCode === 123 ||
      (c && e.shiftKey && ['i', 'j', 'c', 'k'].includes(k)) ||
      (e.metaKey && e.altKey && ['i', 'j', 'c', 'u'].includes(k)) ||
      (c && ['u', 's', 'p'].includes(k))) {
      return stop(e);
    }
  }, true);

  // 개발자 도구 열림 감지 (오탐을 막기 위해 콘솔 객체 접근 방식만 사용)
  const guard = document.getElementById('guard');
  let open = false;
  const show = (on) => {
    if (on === open) return;
    open = on;
    guard.style.display = on ? 'flex' : 'none';
    guard.textContent = on ? '개발자 도구를 닫아 주세요.' : '';
  };
  let hit = false;
  const probe = new Image();
  Object.defineProperty(probe, 'id', { get() { hit = true; return ''; } });
  const check = () => {
    hit = false;
    console.debug(probe);
    console.clear && hit && console.clear();
    show(hit);
  };
  setInterval(check, 1500);
}
