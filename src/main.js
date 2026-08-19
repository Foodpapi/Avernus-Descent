// Entry point: loads state, wires screens and combat input.
import { setG, titleScreen, combatScreenInputs } from './ui.js';
import * as Run from './game/run.js';
import * as Audio from './game/audio.js';

const meta = Run.loadSave();
const G = {
  meta,
  hero: meta.hero || null,
  run: null,
  combat: null,
  // debug console unlock (long-press the title's primary button)
  debugUnlocked: (() => { try { return localStorage.getItem('avernus_debug') === '1'; } catch (e) { return false; } })(),
};
setG(G);

// ---- Audio boot: unlock on the first user gesture (autoplay policy) ----
Audio.init();
const unlockAudio = () => {
  Audio.unlock();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// Global menu sounds: every button click anywhere in the UI plays ui/click,
// and hovering clickable elements gives a soft hover blip.
document.addEventListener('click', (e) => {
  if (e.target && e.target.closest && e.target.closest('button, .btn, .radial-opt, .card, .loot-card')) {
    Audio.play('ui/click', { vol: 0.55, throttle: 30 });
  }
  // Clicking the dark backdrop of a modal closes it — play the close sound.
  if (e.target && e.target.classList && e.target.classList.contains('overlay')) {
    Audio.play('ui/close', { vol: 0.5, throttle: 80 });
  }
}, true);
document.addEventListener('mouseover', (e) => {
  if (e.target && e.target.closest && e.target.closest('button, .radial-opt')) {
    Audio.play('ui/hover', { vol: 0.22, throttle: 90 });
  }
}, true);

// Escape closes open panels — accompany it with the close sound.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.querySelector('.overlay')) {
    Audio.play('ui/close', { vol: 0.5, throttle: 80 });
  }
}, true);

// Mute toggle: a small floating button (top-right) + the M key.
function refreshMuteBtn() {
  const b = document.getElementById('sound-toggle');
  if (b) b.textContent = Audio.muted() ? '🔇' : '🔊';
}
function buildMuteBtn() {
  if (document.getElementById('sound-toggle')) return;
  const b = document.createElement('button');
  b.id = 'sound-toggle';
  b.title = 'Toggle sound (M)';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    Audio.toggleMute();
    refreshMuteBtn();
  });
  document.body.appendChild(b);
  refreshMuteBtn();
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    Audio.toggleMute();
    refreshMuteBtn();
  }
});

// Rebuild any DOM helpers needed on boot
document.addEventListener('DOMContentLoaded', () => {
  buildMuteBtn();
  titleScreen();
  // combat canvas listeners are attached per combat screen via observer
  const observer = new MutationObserver(() => {
    if (document.querySelector('#combat-canvas') && !document.querySelector('#combat-canvas')._wired) {
      document.querySelector('#combat-canvas')._wired = true;
      combatScreenInputs();
    }
  });
  observer.observe(document.getElementById('ui'), { childList: true, subtree: true });
});

export { G };
