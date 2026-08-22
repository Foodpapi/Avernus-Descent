// ============================================================================
// AUDIO ENGINE — Web Audio playback for Avernus Descent.
//
// • Every sound is referenced by a slot path from src/data/sounds.js
//   (relative to assets/sounds/, no extension). The engine tries .ogg, .mp3,
//   .wav in order and plays the FIRST file that exists, so fallback chains
//   "just work" as you drop files in.
// • Missing files are remembered (404-cached) and skipped silently — the game
//   is fully playable with zero sound files present.
// • No-ops gracefully in test environments (no window / no AudioContext).
// • Browser autoplay policy: the context is created/resumed on the first
//   user gesture (wired from main.js).
// • Channels: sfx / music / ambience → master. Music & ambience crossfade on
//   scene changes. Volumes + mute persist to localStorage.
// ============================================================================

import { SOUND_BASE, SOUND_EXTENSIONS, SOUND_SLOTS } from '../data/sounds.js';
import {
  sceneSoundtrack,
  footstepsForWalk,
  footstepsForLocation,
} from '../data/sounds.js';

const VOL_DEFAULTS = { master: 0.9, sfx: 0.8, music: 0.5, ambience: 0.4 };
const FADE_MS = 1.1; // crossfade seconds for music/ambience

let ctx = null;
let master = null;
let sfxGain = null;
let musicGain = null;
let ambienceGain = null;

let prefs = { muted: false, vols: { ...VOL_DEFAULTS } };
let initialized = false;

const bufferCache = new Map(); // resolved file path -> AudioBuffer
const missing = new Set(); // resolved file paths known to 404
const inflight = new Map(); // resolved file path -> Promise<AudioBuffer|null>
const lastPlayed = new Map(); // slot path -> performance.now() for throttling

// Current looping tracks (one per channel) for crossfades.
const loops = { music: null, ambience: null };

// Loads that fetched before the AudioContext existed (the first user gesture)
// wait here instead of failing silently and being cached as "missing".
const ctxWaiters = [];
function waitForCtx() {
  if (ctx) return Promise.resolve();
  return new Promise((resolve) => { ctxWaiters.push(resolve); });
}
function notifyCtxReady() {
  if (!ctx) return;
  const ws = ctxWaiters.splice(0);
  for (const resolve of ws) resolve();
}

// ---------------------------------------------------------------------------
// Environment detection & preferences
// ---------------------------------------------------------------------------
function audioAvailable() {
  if (typeof window === 'undefined') return false;
  if (!(window.AudioContext || window.webkitAudioContext)) return false;
  return true;
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem('avernus_audio');
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') {
        prefs = {
          muted: !!p.muted,
          vols: { ...VOL_DEFAULTS, ...(p.vols || {}) },
        };
      }
    }
  } catch (e) { /* sandboxed storage */ }
}

function savePrefs() {
  try { localStorage.setItem('avernus_audio', JSON.stringify(prefs)); } catch (e) { /* ignore */ }
}

function applyGains() {
  if (!ctx || !master) return;
  const v = prefs.vols;
  master.gain.value = prefs.muted ? 0 : v.master;
  if (sfxGain) sfxGain.gain.value = v.sfx;
  if (musicGain) musicGain.gain.value = v.music;
  if (ambienceGain) ambienceGain.gain.value = v.ambience;
}

// ---------------------------------------------------------------------------
// Loading: resolve a slot to a file, fetch & decode, with negative caching.
// ---------------------------------------------------------------------------
function resolveFile(slotPath) {
  // Try each extension in order until one of them exists.
  const tryExt = (i) => {
    if (i >= SOUND_EXTENSIONS.length) return Promise.resolve(null);
    const ext = SOUND_EXTENSIONS[i];
    const file = `${SOUND_BASE}${slotPath}${ext}`;
    if (missing.has(file)) return tryExt(i + 1);
    if (bufferCache.has(file)) return Promise.resolve(bufferCache.get(file));
    if (inflight.has(file)) {
      return inflight.get(file).then(buf => (buf ? buf : tryExt(i + 1)));
    }
    const p = fetch(file)
      .then(res => {
        if (!res.ok) throw new Error(`missing ${file}`);
        return res.arrayBuffer();
      })
      // At boot (before the first user gesture) `ctx` does not exist yet —
      // wait for unlock() instead of failing + caching the file as missing.
      // Without this, music fetched for the title screen at load time could
      // never play, even after the user clicked (SFX worked because they are
      // all triggered post-gesture).
      .then(ab => waitForCtx().then(() => ctx.decodeAudioData(ab)))
      .then(buf => {
        bufferCache.set(file, buf);
        inflight.delete(file);
        return buf;
      })
      .catch(() => {
        missing.add(file);
        inflight.delete(file);
        return null;
      });
    inflight.set(file, p);
    return p.then(buf => (buf ? buf : tryExt(i + 1)));
  };
  return tryExt(0);
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------
function scheduleBuffer(buf, { vol = 1, rate = 1, delay = 0, loop = false, channel = 'sfx', fade = 0 } = {}) {
  if (!ctx || !buf) return null;
  const when = ctx.currentTime + delay / 1000;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = loop;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  const ch = channel === 'music' ? musicGain : channel === 'ambience' ? ambienceGain : sfxGain;
  g.gain.value = fade > 0 ? 0 : vol;
  if (fade > 0) {
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), when + fade);
  }
  src.connect(g).connect(ch);
  src.start(when);
  if (!loop) src.onended = () => { try { g.disconnect(); } catch (e) { /* noop */ } };
  return { src, gain: g };
}

function lastTime(key) { return lastPlayed.get(key) || 0; }

/**
 * Play a slot (or a candidate list — first file that exists wins).
 * opts: { vol, rate, jitter, delay(ms), loop, channel, throttle(ms), fade(s) }
 */
export function play(candidates, opts = {}) {
  if (!audioAvailable() || prefs.muted) return null;
  if (typeof window.fetch !== 'function') return null;
  const list = Array.isArray(candidates) ? candidates : [candidates];
  if (!list.length) return null;

  // Throttle: skip if this exact slot fired too recently (footsteps, impacts).
  const key = list[0];
  const throttle = opts.throttle !== undefined ? opts.throttle : 40;
  const now = performance.now();
  if (now - lastTime(key) < throttle) return null;
  lastPlayed.set(key, now);

  let rate = opts.rate || 1;
  if (opts.jitter) rate *= 1 + (Math.random() * 2 - 1) * opts.jitter;

  resolveFile(key).then(buf => {
    if (!buf || !ctx) return;
    scheduleBuffer(buf, {
      vol: opts.vol !== undefined ? opts.vol : 1,
      rate,
      delay: opts.delay || 0,
      loop: !!opts.loop,
      channel: opts.channel || 'sfx',
      fade: opts.fade || 0,
    });
  });
  return key;
}

// ---------------------------------------------------------------------------
// Music & ambience channels (looping, crossfading)
// ---------------------------------------------------------------------------
function startLoop(channel, candidates, { vol = 1, delay = 0 } = {}) {
  if (!audioAvailable()) return;
  if (typeof window.fetch !== 'function') return;
  const old = loops[channel];
  const key = candidates.join('|');
  if (old && old.key === key) return; // already playing this track

  const token = {};
  loops[channel] = { key, token, src: null, gain: null, done: false };
  // If nothing loads (no files dropped yet), nothing happens — silence.
  const tryNext = (i) => {
    if (i >= candidates.length || loops[channel]?.token !== token) return;
    resolveFile(candidates[i]).then(buf => {
      if (loops[channel]?.token !== token) return; // superseded while loading
      if (!buf) { tryNext(i + 1); return; }
      const t = scheduleBuffer(buf, { vol, delay, loop: true, channel, fade: FADE_MS });
      if (!t) return;
      if (loops[channel]?.token === token) {
        loops[channel].src = t.src;
        loops[channel].gain = t.gain;
      }
      // Fade out whatever was playing before.
      if (old && old.gain) {
        const g = old.gain;
        try {
          const when = ctx.currentTime;
          g.gain.cancelScheduledValues(when);
          g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), when);
          g.gain.exponentialRampToValueAtTime(0.0001, when + FADE_MS);
        } catch (e) { /* noop */ }
        const oldSrc = old.src;
        setTimeout(() => { try { oldSrc.stop(); } catch (e) { /* noop */ } }, FADE_MS * 1000 + 100);
      }
    });
  };
  tryNext(0);
}

export function stopLoop(channel, fadeSeconds = FADE_MS) {
  const t = loops[channel];
  if (!t) return;
  loops[channel] = null;
  if (t.gain && ctx) {
    try {
      const when = ctx.currentTime;
      t.gain.gain.cancelScheduledValues(when);
      t.gain.gain.setValueAtTime(Math.max(0.0001, t.gain.gain.value), when);
      t.gain.gain.exponentialRampToValueAtTime(0.0001, when + fadeSeconds);
    } catch (e) { /* noop */ }
  }
  const src = t.src;
  setTimeout(() => { try { src.stop(); } catch (e) { /* noop */ } }, fadeSeconds * 1000 + 100);
}

// One-shot sting through the music channel (victory / defeat jingles).
export function sting(candidates, { vol = 1, delay = 0 } = {}) {
  if (!audioAvailable() || typeof window.fetch !== 'function') return;
  const list = Array.isArray(candidates) ? candidates : [candidates];
  resolveFile(list[0]).then(buf => {
    if (!buf || !ctx) return;
    scheduleBuffer(buf, { vol, delay, channel: 'music', fade: 0.15 });
  });
}

/**
 * Route a screen to its music/ambience (called from ui.js screen()).
 * Returns nothing; silent no-op when disabled or unchanged.
 */
export function setScene(screenName, locId, isBoss) {
  if (!audioAvailable() || !initialized) return;
  const st = sceneSoundtrack(screenName, locId, isBoss);
  if (!st) return; // overlay screens keep current music
  if (st.music.length) startLoop('music', st.music);
  else stopLoop('music');
  if (st.ambience.length) startLoop('ambience', st.ambience, { vol: 0.8 });
  else stopLoop('ambience');
}

// ---------------------------------------------------------------------------
// Semantic helpers used across the codebase
// ---------------------------------------------------------------------------
export function footstep(candidates, opts = {}) {
  play(candidates, { vol: 0.5, jitter: 0.08, throttle: 95, ...opts });
}

export function footstepWalk(mapId) { footstep(footstepsForWalk(mapId)); }
export function footstepCombat(locId) { footstep(footstepsForLocation(locId)); }

export function weaponSwing(candidates) {
  play(candidates, { vol: 0.85, jitter: 0.05 });
}

export function weaponHit(candidates, opts = {}) {
  play(candidates, { vol: 0.9, jitter: 0.04, ...opts });
}

export function spellCast(candidates) {
  play(candidates, { vol: 0.9 });
}

export function grunt() {
  const n = 1 + Math.floor(Math.random() * 3);
  play(`units/grunt_${n}`, { vol: 0.6, jitter: 0.1, throttle: 160 });
}

// ---------------------------------------------------------------------------
// Lifecycle: unlock (first user gesture), prefs, mute, preloading
// ---------------------------------------------------------------------------
export function unlock() {
  if (!audioAvailable()) return false;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      sfxGain = ctx.createGain();
      musicGain = ctx.createGain();
      ambienceGain = ctx.createGain();
      sfxGain.connect(master);
      musicGain.connect(master);
      ambienceGain.connect(master);
      master.connect(ctx.destination);
      applyGains();
    } catch (e) {
      ctx = null;
      return false;
    }
  }
  if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* noop */ } }
  // Let any loads that were waiting for the context (music requested at boot,
  // before the first gesture) finish decoding and start playing.
  notifyCtxReady();
  return true;
}

export function init() {
  if (!audioAvailable() || initialized) return;
  loadPrefs();
  initialized = true;
  applyGains();
}

export function muted() { return prefs.muted; }

export function toggleMute() {
  prefs.muted = !prefs.muted;
  savePrefs();
  applyGains();
  return prefs.muted;
}

export function setVolume(channel, value) {
  prefs.vols[channel] = Math.max(0, Math.min(1, value));
  savePrefs();
  applyGains();
}

export function getVolume(channel) { return prefs.vols[channel] || 1; }

// Preload the sounds the first screen needs (ui click + current scene music).
// Missing files 404 quickly and get cached, so this is always cheap.
export function preloadCommon(screenName, locId, isBoss) {
  if (!audioAvailable() || typeof window.fetch !== 'function') return;
  const list = ['ui/click'];
  const st = sceneSoundtrack(screenName, locId, isBoss);
  if (st) list.push(...st.music.slice(0, 1), ...st.ambience.slice(0, 1));
  for (const key of list) resolveFile(key);
}

// Number of distinct sound slots defined in the registry (for tests/tooling).
export function slotCount() { return Object.keys(SOUND_SLOTS).length; }
