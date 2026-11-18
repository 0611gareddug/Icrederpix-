import { Match } from '../src/net/match.js';
import { World } from '../src/engine/world.js';
import { NavGraph } from '../src/ai/navgraph.js';
import { Bot } from '../src/ai/bot.js';
import { step, newBody } from '../src/engine/physics.js';
import { DT, TILE } from '../src/core/util.js';

const mapKey = process.argv[2] || 'grass';
const diffs = ['easy', 'normal', 'hard', 'normal'];
const msgs = [];
let world;
const tx = { broadcast: (m) => msgs.push(m), sendTo: (p, m) => msgs.push(m) };
const M = new Match({ map: mapKey, length: 'short' }, tx);
diffs.forEach((d, i) => M.addPlayer({ name: 'bot' + i, kind: 'bot', diff: d, look: {} }));
M.start();
let run = null, ended = false, frames = 0;
const tStart = performance.now();
while (!ended && frames < 60 * 60 * 30) {
  frames++;
  M.tick(DT);
  while (msgs.length) {
    const m = msgs.shift();
    if (m.t === 'start') world = new World(m.map);
    if (m.t === 'placed') world.place(m.item);
    if (m.t === 'pick') console.log(`R${m.round} box:`, m.box.join(','));
    if (m.t === 'run') {
      world.resetDynamic();
      const g = new NavGraph(world); g.finish();
      run = { t: 0, g, bodies: M.players.map((p, i) => ({ pid: p.id, b: newBody(world.spawn.x + (i - 1.5) * 3, world.spawn.y), bot: new Bot(p.diff, p.id * 7 + M.round), done: false })) };
    }
    if (m.t === 'result') {
      console.log(`  result flag=${m.flag}`, JSON.stringify(m.gains), 'scores', JSON.stringify(m.scores));
      run = null;
    }
    if (m.t === 'end') { console.log('END winners', m.winners, JSON.stringify(m.stats)); ended = true; }
  }
  if (run) {
    run.t += DT;
    if (run.t < 3) continue;
    const t = run.t;
    for (const r of run.bodies) {
      if (r.done) continue;
      const inp = r.bot.update(r.b, world, run.g, t, DT);
      step(r.b, inp, world, t, DT, 0);
      const hz = world.hazard(r.b, t);
      if (hz !== undefined) { r.done = true; M.handle(r.pid, { t: 'fin', res: { dead: true, killer: hz } }); continue; }
      if (world.touchGoal(r.b)) { r.done = true; M.handle(r.pid, { t: 'fin', res: { goal: true } }); continue; }
      if (frames % 10 === 0) M.onHeat(Math.floor((r.b.x + 5) / TILE), Math.floor((r.b.y + 10) / TILE), r.pid);
    }
    world.updateDynamic(DT, t, run.bodies.map((r) => r.b));
  }
}
console.log('items', world.items.size, 'sim time', ((performance.now() - tStart) / 1000).toFixed(1) + 's', 'game min', (frames / 3600).toFixed(1));
