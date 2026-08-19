import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="ui"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage; globalThis.navigator = dom.window.navigator;
globalThis.requestAnimationFrame = fn => setTimeout(fn, 16);
dom.window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t,p) => p==='measureText' ? () => ({width:20}) : () => {}, set: (t,p,v)=>{t[p]=v;return true;} });
const ui = await import('../src/ui.js');
const Run = await import('../src/game/run.js');
ui.setG({ meta: Run.defaultMeta(), hero: null, run: null, combat: null });
ui.titleScreen();
// click New Hero, then Dwarf to reach the class grid
const click = (sel, text) => { const el = [...document.querySelectorAll(sel)].find(e => e.textContent.includes(text)); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); };
click('button', 'New Hero');
click('.card', 'Dwarf');
const subs = [...document.querySelectorAll('.card')].map(c => c.querySelector('.card-sub')?.textContent || '');
const bad = subs.filter(s => !/^HD d(4|6|8|10|12) · Saves/.test(s));
console.log(subs.join('\n'));
console.log(bad.length ? `FAIL: ${bad.length} bad cards` : 'OK: all class cards show valid HD');
process.exit(bad.length ? 1 : 0);
