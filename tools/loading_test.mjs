// Loading-screen flow test (jsdom): clicking Continue shows a loading bar and
// keeps the hub hidden until every manifest asset resolves, then enters the
// hub with all art already cached. Also: late-arriving assets re-render the
// walk scene without any movement.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'manifest.json'), 'utf8'));
const manifestFiles = manifest.files.map(f => f.file);

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"><div id="ui"></div></div></body></html>', {
  url: 'http://localhost:8080/index.html',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.requestAnimationFrame = fn => setTimeout(fn, 16);
globalThis.confirm = () => true;
globalThis.location = { href: 'http://localhost:8080/index.html' }; // enable the art-loading gate

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- fetch stub: serve the real manifest ----
globalThis.fetch = async (url) => {
  if (String(url).includes('manifest.json')) {
    return { json: async () => ({ files: manifest.files }) };
  }
  throw new Error('unexpected fetch: ' + url);
};

// ---- canvas stub with draw tracking ----
const walkDraws = [];
function makeCtx() {
  const store = { _draws: [] };
  return new Proxy(store, {
    get: (t, p) => {
      if (p === 'drawImage') return (...args) => { t._draws.push(args); walkDraws.push(args); };
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      if (p === 'measureText') return () => ({ width: 10 });
      if (p in t) return t[p];
      return () => {};
    },
    set: (t, p, v) => { t[p] = v; return true; },
  });
}
function makeCanvas() {
  const c = { width: 300, height: 300, style: {} };
  c.getContext = () => { if (!c._ctx) { c._ctx = makeCtx(); } return c._ctx; };
  return c;
}
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  if (!this._ctx) this._ctx = makeCtx();
  return this._ctx;
};

// ---- image stub: one slow asset, everything else quick ----
// units/late_art.png is deliberately NOT in the manifest — it simulates a file
// dropped into assets/ after the game loaded.
const SLOW = new Set(['units/class_barbarian.png']);
const LATE = 'units/late_art.png';
globalThis.Image = function () {
  const img = { width: 0, height: 0, naturalWidth: 0, naturalHeight: 0, onload: null, onerror: null };
  Object.defineProperty(img, 'src', {
    set(v) {
      const p = String(v).replace(/^assets\//, '');
      const delay = SLOW.has(p) ? 400 : 5;
      setTimeout(() => {
        if (manifestFiles.includes(p) || p === LATE) {
          const [w, h] = p.startsWith('units/') ? [100, 120] : [56, 56];
          img.width = w; img.height = h; img.naturalWidth = w; img.naturalHeight = h;
          img.onload && img.onload();
        } else img.onerror && img.onerror();
      }, delay);
    },
  });
  return img;
};

const errors = [];
dom.window.addEventListener('error', e => errors.push(e.message));

const ui = await import('../src/ui.js');
const Run = await import('../src/game/run.js');
const assets = await import('../src/render/assets.js');
const { makeRng } = await import('../src/rng.js');
const { createCharacter } = await import('../src/5e/rules.js');
const { RACES } = await import('../src/data/races.js');
const { CLASS_MAP } = await import('../src/data/classes.js');

// ---- hero with a save (so the title shows "Continue") ----
const rng = makeRng(31337);
const fcls = CLASS_MAP.fighter;
const hero = createCharacter({ raceId: RACES[0].id, classId: 'fighter', name: 'LoadHero', subclassId: 'champion', scoreAssign: Run.autoAssignScores(fcls, RACES[0], rng), level: 1, hero: true, rng });
const meta = { ...Run.defaultMeta(), shards: 100, hero };
ui.setG({ meta, hero, run: null, combat: null, walk: null, debugUnlocked: false });

// ---- 1. title → click Continue ----
ui.titleScreen();
const primary = [...document.querySelectorAll('.title-btns button')][0];
assert(primary.textContent.includes('Continue'), 'title shows Continue');
primary.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

// ---- 2. loading bar appears BEFORE the hub (slow asset keeps it up) ----
let sawLoading = false;
for (let i = 0; i < 40; i++) {
  await sleep(25);
  if (document.querySelector('.loading-bar-fill')) { sawLoading = true; break; }
}
assert(sawLoading, 'a loading screen should appear before the hub');
const hubDuringLoad = !!document.querySelector('.walk-canvas-wrap');
assert(!hubDuringLoad, 'the hub must NOT render while assets are still loading');
const label = document.querySelector('.loading-label');
assert(label && /\d+\/\d+ assets/.test(label.textContent), `progress label shows counts (got "${label && label.textContent}")`);
step('loading bar appears with progress; hub stays hidden until art is ready');

// ---- 3. hub appears only after everything finishes ----
let sawHub = false;
for (let i = 0; i < 200; i++) {
  await sleep(30);
  if (document.querySelector('.walk-canvas-wrap')) { sawHub = true; break; }
}
assert(sawHub, 'hub should appear after the loading finishes');
assert(!document.querySelector('.loading-bar-fill'), 'loading screen gone once the hub is up');
step('hub renders after the loading completes');

// ---- 4. art was loaded BEFORE the hub (no movement needed) ----
const heroArt = assets.getCached('units/class_fighter.png');
assert(heroArt !== null, 'hero art should be cached before the hub renders');
const sprites = await import('../src/render/sprites.js');
sprites.clearTileCache();
const heroSprite = sprites.drawUnitSprite({ char: hero });
assert(heroSprite._isArt === true, 'the hero sprite is already the generated art at hub entry');
step('hero art is cached and rendered at hub entry (no movement needed)');

// ---- 5. a late-arriving asset re-renders the walk scene automatically ----
const drawsBefore = walkDraws.length;
SLOW.add(LATE);
assets.loadAsset(LATE, () => {});
// wait for the slow load (400ms) + the re-render
let redrew = false;
for (let i = 0; i < 120; i++) {
  await sleep(30);
  if (walkDraws.length > drawsBefore) { redrew = true; break; }
}
assert(redrew, 'the walk scene should re-render when a new asset arrives (without moving)');
step('late-arriving art re-renders the hub automatically');

// ---- 6. subsequent hub entries skip the loading screen (all cached) ----
ui.titleScreen();
const primary2 = [...document.querySelectorAll('.title-btns button')][0];
primary2.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
await sleep(120);
assert(!document.querySelector('.loading-bar-fill'), 'no loading screen when assets are already cached');
assert(!!document.querySelector('.walk-canvas-wrap'), 'hub appears instantly on second entry');
step('second hub entry is instant (no loading screen)');

console.log('errors captured:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
