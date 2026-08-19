// Walkable-scene logic: grid movement, collision, NPC adjacency and simple
// pathfinding for click-to-move. Pure state machine — the UI renders it.
import { HUB_MAP, CAMP_MAP, TOWN_MAP } from '../data/hub.js';
import { uid } from '../rng.js';
import { footstepWalk } from '../game/audio.js';

const LEGEND = {
  '#': 'wall', T: 'tree', B: 'bush', t: 'table', F: 'hearth',
  S: 'statue', f: 'fountain', H: 'house', c: 'crate', r: 'rock', b: 'barrel',
};

export function createWalk(mapId) {
  const base = { hub: HUB_MAP, camp: CAMP_MAP, town: TOWN_MAP }[mapId];
  if (!base) return null;
  const grid = base.rows.map((row, y) =>
    row.split('').map((ch, x) => ({
      x, y, ch,
      obstacle: LEGEND[ch] || null,
    }))
  );
  const state = {
    mapId,
    base,
    w: base.w,
    h: base.h,
    grid,
    x: base.spawn.x,
    y: base.spawn.y,
    facing: 'down',
    npcs: [],
    autoPath: null,
    autoNpc: null,
    autoTimer: null,
  };
  return state;
}

export function addNpc(state, npc) {
  npc.uid = npc.uid || uid();
  npc.active = npc.active !== false;
  state.npcs.push(npc);
  return npc;
}

export function inWalk(state, x, y) {
  return x >= 0 && y >= 0 && x < state.w && y < state.h;
}

export function isWalkable(state, x, y) {
  if (!inWalk(state, x, y)) return false;
  return !state.grid[y][x].obstacle;
}

export function tryMove(state, dx, dy) {
  const nx = state.x + dx, ny = state.y + dy;
  if (!isWalkable(state, nx, ny)) return false;
  state.x = nx;
  state.y = ny;
  footstepWalk(state.mapId);
  if (dx > 0) state.facing = 'right';
  else if (dx < 0) state.facing = 'left';
  else if (dy > 0) state.facing = 'down';
  else if (dy < 0) state.facing = 'up';
  return true;
}

export function npcAt(state, x, y) {
  return state.npcs.find(n => n.active && n.x === x && n.y === y);
}

// NPCs within talking range (adjacent, incl. diagonals)
export function npcNear(state) {
  return state.npcs.find(n => n.active && Math.max(Math.abs(n.x - state.x), Math.abs(n.y - state.y)) <= 1);
}

// BFS path to a tile (excludes the start). Capped length.
export function findWalkPath(state, tx, ty, maxLen = 60) {
  if (!isWalkable(state, tx, ty)) return null;
  const key = (x, y) => y * state.w + x;
  const prev = new Map();
  const seen = new Set([key(state.x, state.y)]);
  const queue = [{ x: state.x, y: state.y }];
  while (queue.length) {
    const cur = queue.shift();
    if (cur.x === tx && cur.y === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!isWalkable(state, nx, ny)) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, { x: cur.x, y: cur.y });
      queue.push({ x: nx, y: ny });
    }
  }
  const k = key(tx, ty);
  if (!prev.has(k) && !(tx === state.x && ty === state.y)) return null;
  const path = [];
  let cx = tx, cy = ty, guard = 0;
  while (!(cx === state.x && cy === state.y) && guard++ < 500) {
    path.push({ x: cx, y: cy });
    const p = prev.get(key(cx, cy));
    if (!p) return null;
    cx = p.x; cy = p.y;
  }
  path.reverse();
  return path.slice(0, maxLen);
}

// Path to any walkable tile adjacent to an NPC (for auto-walk-then-talk).
export function findWalkPathToNpc(state, npc) {
  const spots = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = npc.x + dx, y = npc.y + dy;
    if (isWalkable(state, x, y)) spots.push({ x, y });
  }
  let best = null;
  for (const s of spots) {
    const p = findWalkPath(state, s.x, s.y);
    if (p && (!best || p.length < best.length)) best = p;
  }
  return best;
}
