// Drop-in art loader: real PNGs placed in /assets override the procedural art.
// Filenames are keyed to internal game IDs — see /assets/manifest.json.
//
// Loading is lazy and failure-tolerant: if an asset is missing (or not yet
// generated), the game silently falls back to its procedural pixel art and
// keeps working. When a load succeeds, the tile/sprite caches are cleared so
// the next frame renders the new art.

const BASE = 'assets/';

const imageCache = new Map(); // path -> HTMLImageElement | null (null = missing/errored)
const pending = new Map();    // path -> Promise
const trimCache = new Map();  // img -> {x,y,w,h} | null (transparent-padding bounds)

function isBrowser() {
  return typeof document !== 'undefined' && typeof Image !== 'undefined';
}

export function getCached(path) {
  return imageCache.get(path) || null;
}

// 'loaded' (image cached) | 'missing' (remembered 404) | 'unknown' (never tried)
export function assetStatus(path) {
  if (!imageCache.has(path)) return 'unknown';
  return imageCache.get(path) ? 'loaded' : 'missing';
}

export function loadAsset(path, onChange) {
  if (!isBrowser()) return null;
  if (imageCache.has(path)) {
    const img = imageCache.get(path);
    if (img && onChange) onChange(img);
    return img;
  }
  if (pending.has(path)) {
    pending.get(path).then(img => { if (img && onChange) onChange(img); });
    return null;
  }
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { imageCache.set(path, img); resolve(img); };
    img.onerror = () => { imageCache.set(path, null); resolve(null); };
    img.src = BASE + path;
  });
  pending.set(path, p);
  p.then(img => {
    pending.delete(path);
    if (img) notifyChanged(); // screens re-render as art arrives
    if (onChange) onChange(img);
  });
  return null;
}

// ---------------------------------------------------------------- candidates
const GROUNDS = ['_ground_1', '_ground_2', '_ground_3'];

export function tileAssetPaths(locId, tile, loc) {
  const out = [];
  const primary = (loc && loc.artId) || locId;
  const fallback = (loc && loc.fallbackArtId) || null;

  // Pick ONE path per art slot: the primary if it's known (cached image or
  // remembered 404), otherwise the fallback, otherwise the primary (so its
  // load gets scheduled).
  const pick = (name) => {
    const p = `tiles/${primary}${name}.png`;
    const ps = assetStatus(p);
    if (ps === 'loaded') return p;
    if (fallback) {
      const f = `tiles/${fallback}${name}.png`;
      const fs = assetStatus(f);
      if (fs === 'loaded') return f;
      if (ps === 'unknown') return p; // neither known → prefer the primary
      return f;                        // primary 404'd → use the fallback path
    }
    return p;
  };

  if (tile.obstacle === 'wall') {
    out.push(pick('_wall')); // a wall tile IS the wall — no ground underneath
    return out;
  }
  const gi = loc && loc.ground ? loc.ground.indexOf(tile.ground) : -1;
  out.push(pick(GROUNDS[gi >= 0 ? gi % GROUNDS.length : 0]));
  if (tile.elevation > 0) out.push(pick(`_elevation_${Math.min(tile.elevation, 2)}`));
  if (tile.hazard) {
    out.push(pick(`_hazard_${tile.hazard}`));
    out.push(`tiles/hazard_${tile.hazard}.png`); // generic overlay fallback
  }
  if (tile.obstacle && tile.obstacle !== 'wall') out.push(`objects/${tile.obstacle}.png`);
  return out;
}

export function unitAssetPaths(u) {
  const char = u.char;
  const out = [];
  if (char.stats) {
    // monster: the canonical template id (e.g. 'bandit') is the art key —
    // instance ids are random uids. No shape fallback: borrowing another
    // monster's generated art (e.g. wight showing a skeleton PNG) was a bug.
    // Missing art falls back to the shape-appropriate PROCEDURAL sprite.
    const monId = char.templateId || char.monsterId || char.id;
    out.push(`units/monster_${monId}.png`);
  } else if (char.wildShapeForm) {
    out.push(`units/form_${char.wildShapeForm.id}.png`);
  } else {
    out.push(`units/race_${char.raceId}_${char.classId}.png`); // optional race skin
    out.push(`units/class_${char.classId}.png`);
  }
  return out;
}

export function fxAssetPath(fxType) {
  return `fx/${fxType}.png`;
}

// ---- change notifications & preloading ----
// Screens subscribe to know when a new asset finished loading so they can
// re-render immediately (no need to wait for the next frame or user input).
const listeners = new Set();
export function onAssetsChanged(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function notifyChanged() {
  for (const cb of [...listeners]) { try { cb(); } catch (e) { /* noop */ } }
}

export function pendingCount() { return pending.size; }

let manifestFiles = null;
async function getManifestFiles() {
  if (manifestFiles) return manifestFiles;
  try {
    if (typeof fetch !== 'undefined') {
      const res = await fetch(BASE + 'manifest.json');
      const j = await res.json();
      manifestFiles = (j.files || []).map(f => f.file);
    } else {
      manifestFiles = [];
    }
  } catch (e) { manifestFiles = []; }
  return manifestFiles;
}

// Do any manifest assets still need loading? (Used to decide whether to show
// a loading screen before entering the hub.)
export async function hasUncachedAssets() {
  const files = await getManifestFiles();
  return files.some(f => !imageCache.has(f));
}

// Load every manifest asset (already-cached files are skipped instantly).
// onProgress(frac, done, total), onDone() — both optional.
export function preloadAll(onProgress, onDone) {
  return getManifestFiles().then(files => preloadPaths(files, onProgress, onDone));
}

// Concurrency-limited preload of specific paths.
export function preloadPaths(paths, onProgress, onDone) {
  const todo = paths.filter(p => !imageCache.has(p));
  const total = paths.length;
  let done = total - todo.length;
  if (!todo.length) {
    if (onProgress) onProgress(1, done, total);
    if (onDone) onDone();
    return;
  }
  let idx = 0;
  const CONC = 8;
  const next = () => {
    if (idx >= todo.length) return;
    const p = todo[idx++];
    loadAsset(p, () => {
      done++;
      if (onProgress) onProgress(done / total, done, total);
      if (done >= total) { if (onDone) onDone(); return; }
      next();
    });
  };
  for (let i = 0; i < CONC; i++) next();
}

// Find the non-transparent bounds of an image (AI outputs usually pad the
// subject with empty space). Returns {x,y,w,h} in image pixels, or null when
// the whole image is opaque or pixel access is unavailable. Cached per image.
export function trimBounds(img) {
  if (!img || !isBrowser()) return null;
  if (trimCache.has(img)) return trimCache.get(img);
  let bounds = null;
  try {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih || iw * ih > 4e6) return null; // skip absurd sizes
    const c = document.createElement('canvas');
    c.width = iw; c.height = ih;
    const cx = c.getContext('2d', { willReadFrequently: true });
    if (!cx || typeof cx.drawImage !== 'function' || typeof cx.getImageData !== 'function') return null;
    cx.drawImage(img, 0, 0, iw, ih);
    const res = cx.getImageData(0, 0, iw, ih);
    if (!res || !res.data || res.data.length < iw * ih * 4) return null;
    const d = res.data;
    let minX = iw, minY = ih, maxX = -1, maxY = -1;
    for (let y = 0; y < ih; y++) {
      let rowY = y * iw;
      for (let x = 0; x < iw; x++) {
        if (d[(rowY + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= minX && maxY >= minY && !(minX === 0 && minY === 0 && maxX === iw - 1 && maxY === ih - 1)) {
      bounds = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }
  } catch (e) { /* headless / tainted canvas → no trim */ }
  trimCache.set(img, bounds);
  return bounds;
}
