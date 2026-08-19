// Reproduce the "New Hero button does nothing" bug using jsdom.
// Loads the real modules, renders the title screen, and CLICKS the button.
import { JSDOM } from 'jsdom';

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
globalThis.alert = () => {};
globalThis.HTMLElement = dom.window.HTMLElement;

// jsdom lacks canvas; stub the 2d context
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, {
    get: (t, p) => {
      if (p === 'measureText') return () => ({ width: 20 });
      return () => {};
    },
    set: (t, p, v) => { t[p] = v; return true; },
  });
};

const errors = [];
dom.window.addEventListener('error', (e) => errors.push('window error: ' + e.message));

// load ui module with the jsdom globals in place
const ui = await import('../src/ui.js');
const Run = await import('../src/game/run.js');
const G = {
  meta: { shards: 80, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null },
  hero: null, run: null, combat: null,
};
ui.setG(G);

// render title
try {
  ui.titleScreen();
  console.log('title screen rendered. buttons:', [...document.querySelectorAll('button')].map(b => b.textContent));
} catch (e) {
  console.log('ERROR rendering title:', e.stack);
  process.exit(1);
}

// CLICK the New Hero button
const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('New Hero'));
if (!btn) { console.log('No New Hero button found'); process.exit(1); }

let clickError = null;
const origClick = btn.onclick;
try {
  btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
} catch (e) {
  clickError = e;
}
if (clickError) {
  console.log('CLICK THREW:', clickError.stack);
} else {
  const uiEl = document.querySelector('#ui');
  console.log('after click: #ui class =', uiEl.className, '| child nodes =', uiEl.children.length);
  console.log('first 300 chars of new screen:', uiEl.innerHTML.slice(0, 300));
}
console.log('errors captured:', errors.length ? errors : 'none');
