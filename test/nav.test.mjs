import { World } from '../src/engine/world.js';
import { NavGraph } from '../src/ai/navgraph.js';
import { MAP_KEYS } from '../src/data/maps.js';
for (const k of MAP_KEYS) {
  const w = new World(k);
  const t0 = performance.now();
  const g = new NavGraph(w); g.finish();
  const ms = performance.now() - t0;
  const sp = g.nodeAtCell[w.spawnCell.y * 48 + w.spawnCell.x];
  const edges = g.nodes.reduce((a, n) => a + n.edges.length, 0);
  console.log(k, 'nodes', g.nodes.length, 'edges', edges, 'ms', ms.toFixed(0), 'spawnNode', sp, 'ctg', sp >= 0 ? g.ctg[sp] : 'NA');
}
