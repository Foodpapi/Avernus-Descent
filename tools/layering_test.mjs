// Layering test: units render in painter's-algorithm order (higher Y draws
// later/on top; X breaks ties), exactly the bandit-vs-giant-rat case.
const ui = await import('../src/ui.js');

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); }

const u = (id, x, y) => ({ id, x, y });

// The reported bug: bandit at (15,7) was drawn UNDER a giant rat at (15,6).
// Correct order: rat (y=6) first, bandit (y=7) after → bandit on top.
{
  const bandit = u('bandit', 15, 7);
  const rat = u('rat', 15, 6);
  const order = ui.sortedUnitsForRender([bandit, rat]);
  assert(order[0].id === 'rat' && order[1].id === 'bandit',
    `higher-Y unit must draw last (got ${order.map(x => x.id).join(', ')})`);
  step('bandit (y=7) renders above the giant rat (y=6)');
}

// Same row: X order breaks the tie deterministically.
{
  const a = u('a', 10, 4);
  const b = u('b', 3, 4);
  const c = u('c', 7, 4);
  const order = ui.sortedUnitsForRender([c, a, b]);
  assert(order.map(x => x.id).join('') === 'bca',
    `same row sorts by X (got ${order.map(x => x.id).join(', ')})`);
  step('same-row units sort by X for stable order');
}

// Full-columns: strict top-to-bottom draw order.
{
  const units = [
    u('goblin', 2, 1),
    u('hero', 5, 9),
    u('orc', 4, 4),
    u('wolf', 1, 7),
  ];
  const order = ui.sortedUnitsForRender(units);
  const ys = order.map(x => x.y);
  const sortedYs = [...ys].sort((p, q) => p - q);
  assert(JSON.stringify(ys) === JSON.stringify(sortedYs),
    `draw order must follow Y ascending (got ${ys.join(',')})`);
  step('mixed formation draws strictly top-to-bottom by Y');
}

// The input array must not be mutated (renderer safety).
{
  const bandit = u('bandit', 15, 7);
  const rat = u('rat', 15, 6);
  const input = [bandit, rat];
  ui.sortedUnitsForRender(input);
  assert(input[0].id === 'bandit' && input[1].id === 'rat', 'input array is not mutated');
  step('sort does not mutate the unit array');
}

console.log('LAYERING TEST OK');
process.exit(0);
