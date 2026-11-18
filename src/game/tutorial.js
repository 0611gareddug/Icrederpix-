// 연습 코스 (튜토리얼): 7단계를 차례로 통과
import { TILE, DT, isTouch } from '../core/util.js';
import { World } from '../engine/world.js';
import { newBody } from '../engine/physics.js';
import { readInput, clearEdges } from '../core/input.js';
import { sfx, playMusic } from '../core/audio.js';
import { save, persist } from '../core/save.js';
import { checkAch } from '../data/progress.js';
import { OL } from '../art/sprites.js';
import { SLOT_COLORS } from '../data/cosmetics.js';
import { showTouch } from '../ui/touch.js';
import { Game } from './game.js';

const T = isTouch();
const STEPS = [
  { col: 0, spawn: [2, 14], title: '이동', text: T ? '왼쪽 화면을 손가락으로 끌어서 오른쪽으로 이동해요' : 'A/D 또는 ←/→ 로 오른쪽으로 이동해요' },
  { col: 10, spawn: [10, 14], title: '점프', text: T ? '[점프] 버튼으로 벽과 구멍을 넘어요 · 길게 누르면 더 높이!' : '스페이스(또는 W/↑)로 점프 · 길게 누르면 더 높이 뛰어요' },
  { col: 17, spawn: [18, 14], title: '대시', text: T ? '넓은 구멍은 점프한 뒤 공중에서 [대시]!' : '넓은 구멍은 점프한 뒤 공중에서 Shift(대시)!' },
  { col: 28, spawn: [29, 14], title: '벽 점프', text: '벽 사이로 들어가서, 벽에 붙은 채 점프를 반복해 위로 올라가요' },
  { col: 42, spawn: [43, 14], title: '웅크리기', text: T ? '낮은 통로는 [숙이기]! 달리다 숙이면 슬라이딩' : '낮은 통로는 S/↓로 숙여서! 달리다 숙이면 슬라이딩' },
  { col: 50, spawn: [50, 14], title: '함정 피하기', text: '톱날은 뛰어넘고, 불꽃은 꺼졌을 때 지나가요 (연기가 나면 곧 뿜어요)' },
  { col: 57, spawn: [57, 14], title: '배치', text: '구멍이 너무 넓어요! 블록을 놓아 다리를 만들어요' },
];

export class TutorialGame extends Game {
  constructor(app) {
    super(app, { mode: 'tutorial', localPid: 1 });
    this.world = new World('tutorial');
    this.world.onCrumble = (i, c) => this.fxCrumble(i, c);
    this.mapKey = 'tutorial';
    let id = 800;
    this.world.place({ id: id++, type: 'saw', x: 52, y: 14, rot: 0, owner: 0 });
    this.world.place({ id: id++, type: 'flame', x: 56, y: 11, rot: 2, owner: 0 });
    this.renderer.setWorld(this.world);
    this.target = 1; this.maxRounds = 1;
    this.players.set(1, { id: 1, name: save.name, title: '', look: save.look, kind: 'local', slot: 0, color: SLOT_COLORS[0], ol: OL, score: 0, body: null, st: 'run', buf: [], ghosts: [], emote: null, emoteT: 0, connected: true });
    this.order = [1];
    this.step = 0; this.dead = 0; this.respawnT = 0; this.placedId = 0; this.done = false;
    this.cd = 0; this.dur = 1e9; this.phase = 'run'; this.runT = 0;
    this.spawnAt(0);
    this.snapTo(this.players.get(1).body);
    playMusic('grass');
    this.showStep();
    showTouch(T);
  }

  spawnAt(i) {
    const p = this.players.get(1);
    const [cx, cy] = STEPS[i].spawn;
    p.body = newBody(cx * TILE + 8, (cy + 1) * TILE);
    p.st = 'run'; p.fx = false; p.ghosts = [];
  }
  showStep() {
    const s = STEPS[this.step];
    this.hud.setPhase(`연습 ${this.step + 1}/${STEPS.length} · ${s.title}`, null);
    this.hud.sub(s.text, 0);
  }

  // 배치/결과 요청을 직접 처리 (방장 없이)
  toHost(m) {
    if (m.t !== 'placeReq' || !this.place) return;
    const w = this.world;
    if (!w.canPlace(this.place.type, m.x, m.y, m.rot)) { this.m_placeFail(); return; }
    const id = 900 + (++this.dead);
    w.place({ id, type: this.place.type, x: m.x, y: m.y, rot: m.rot, owner: 1 });
    this.placedId = id;
    sfx('place');
    this.particles.dust(m.x * TILE + 24, m.y * TILE + 16, 8);
    this.place = null;
    this.hud.hidePlace();
    this.phase = 'run';
    showTouch(T);
    clearEdges();
    this.hud.setPhase('연습 7/7 · 골인!', null);
    this.hud.sub('좋아요! 이제 다리를 건너 골 깃발까지 가요', 0);
  }

  startPlace() {
    this.phase = 'place';
    this.placeStart = this.time;
    clearEdges();
    showTouch(false);
    this.userZoom = 1; this.camFocus = null;
    this.place = { type: 'longplat', x: 62, y: 13, rot: 0, done: false, lastSent: 0, dirty: true };
    this.validate();
    this.hud.showPlace('longplat', { rotate: () => {}, confirm: () => this.confirmPlace() });
    this.hud.sub(T ? '구멍 위로 [긴 발판]을 끌어다 놓고 [놓기]' : '마우스로 구멍 위에 [긴 발판]을 놓아요 (클릭)', 0);
  }

  die(p, killer, local) {
    if (p.st !== 'run') return;
    p.st = 'dead';
    const b = p.body;
    this.fxDeath(p, b.x + 5, b.y + b.h / 2, true);
    this.respawnT = 0.9;
    // 마지막 단계에서 떨어지면 다리를 다시 놓게 한다
    if (this.step === 6 && this.placedId) {
      this.world.items.delete(this.placedId);
      this.world.rebuild();
      this.placedId = 0;
    }
  }
  reachGoal(p) {
    if (this.done) return;
    this.done = true;
    p.st = 'goal';
    this.fxGoal(p, p.body.x + 5, p.body.y + 10);
    this.finish();
  }

  finish() {
    showTouch(false);
    this.hud.sub(null);
    const first = !save.stats.tutorial;
    save.stats.tutorial = 1;
    const lines = [];
    for (const r of checkAch(save)) lines.push([r.label, r.coins]);
    persist();
    sfx('win');
    for (let i = 0; i < 5; i++) setTimeout(() => this.fxConfetti(), i * 300);
    this.hud.showEnd([], lines, [
      { label: '메인 메뉴', onClick: () => this.app.exitToMenu() },
      { label: '다시 연습', onClick: () => this.app.startTutorial() },
      { label: '▶ 혼자 하기', cls: 'primary', onClick: () => { this.app.exitGameOnly(); this.app.startSolo(this.app.soloSettings); } },
    ], first ? '🎓 연습 코스 완주!' : '🎓 다시 완주했어요!', '이제 실전에서 함정을 깔고 골인해 보세요!');
  }

  update(dt) {
    this.flush();
    if (this.paused) return;
    this.time += dt;
    this.frame++;
    const p = this.players.get(1);
    if (this.phase === 'run') {
      this.runT += dt;
      const t = this.runT;
      if (p.st === 'run') {
        this.stepPlayer(p, readInput(this.nearLadder(p.body)), t, true);
        // 진행 단계
        const col = Math.floor((p.body.x + 5) / TILE);
        while (this.step < STEPS.length - 1 && col >= STEPS[this.step + 1].col && p.body.ground) {
          this.step++;
          sfx('coin');
          this.showStep();
        }
        if (this.step === 6 && !this.placedId && p.body.ground && col >= 57) this.startPlace();
      } else if (p.st === 'dead') {
        this.respawnT -= dt;
        if (this.respawnT <= 0) {
          this.spawnAt(this.step);
          if (this.step === 6) this.showStep();
        }
      }
      this.world.updateDynamic(dt, t, p.body ? [p.body] : []);
      this.trapSfx(t);
    } else if (this.phase === 'place') {
      this.updatePlace(dt);
      this.hud.setPhase('연습 7/7 · 배치', null);
    }
    this.particles.update(dt);
    for (const g of p.ghosts) g.a -= dt * 4;
    if (p.ghosts.length && p.ghosts[0].a <= 0) p.ghosts = p.ghosts.filter((g) => g.a > 0);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
    this.updateCamera(dt);
  }
}
export { DT };
