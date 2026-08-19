// Procedural pixel-art rendering: tiles and unit sprites drawn onto small
// offscreen canvases and scaled up with no smoothing for a chunky pixel look.

import { OBSTACLES } from '../data/locations.js';
import { loadAsset, getCached, tileAssetPaths, unitAssetPaths, trimBounds } from './assets.js';
import { RACE_MAP } from '../data/races.js';

const TILE = 28;
const SCALE = 2;

export const TILE_SIZE = TILE;
export const SPRITE_W = 20, SPRITE_H = 24;

const cache = new Map();

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 0xff) + amt, b = (n & 0xff) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

// ============================== TILES ==============================
// Stamp a loaded PNG over the procedural tile (drop-in art replacement).
// Draw an image "cover"-fitted into a rect: scales to FILL the box while
// preserving the source aspect ratio (cropping any overflow instead of
// squishing). Enables high-quality smoothing when downscaling a lot — AI
// images are typically large, and nearest-neighbor at high ratios turns them
// into unreadable pixel soup.
function drawImageCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width || w;
  const ih = img.naturalHeight || img.height || h;
  if (!iw || !ih) return;
  const s = Math.max(w / iw, h / ih); // cover scale (never distorts)
  const dw = iw * s, dh = ih * s;
  const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
  const smooth = s < 0.75; // heavy downscale → bilinear looks far better
  ctx.imageSmoothingEnabled = smooth;
  if (smooth && ctx.imageSmoothingQuality !== undefined) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.imageSmoothingEnabled = false;
}

// Full-tile art (tiles/*.png) REPLACES the procedural placeholder entirely;
// object/hazard art (objects/*, tiles/*_hazard_*) composites on top.
function overlayPaths(ctx, paths, cellW, cellH) {
  let art = null;
  for (const p of paths) {
    const img = getCached(p);
    if (img) {
      drawImageCover(ctx, img, 0, 0, cellW, cellH);
      art = img;
    }
  }
  return art;
}

export function drawTile(tile, loc) {
  const key = `${loc.id}|${tile.ground}|${tile.obstacle}|${tile.elevation}|${tile.hazard}`;
  if (cache.has(key)) return cache.get(key);
  const c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // ground
  ctx.fillStyle = tile.ground;
  ctx.fillRect(0, 0, TILE, TILE);
  // noise
  let h = 0;
  for (const ch of tile.ground.slice(1)) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  for (let i = 0; i < 6; i++) {
    const x = (h * (i + 3) * 7) % TILE, y = (h * (i + 5) * 13) % TILE;
    px(ctx, x, y, 2, 2, i % 2 ? shade(tile.ground, 14) : shade(tile.ground, -14));
  }

  // elevation
  if (tile.elevation > 0) {
    ctx.fillStyle = `rgba(255,255,240,${0.10 + tile.elevation * 0.07})`;
    ctx.fillRect(0, 0, TILE, TILE);
    // cliff edge (south face)
    ctx.fillStyle = loc.cliff || shade(tile.ground, -40);
    ctx.fillRect(0, TILE - 4, TILE, 4);
    px(ctx, 0, TILE - 4, TILE, 1, shade(tile.ground, -25));
  }

  // hazards
  if (tile.hazard === 'water') {
    ctx.fillStyle = loc.water || '#1a4a66';
    ctx.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 3; i++) {
      px(ctx, (i * 9 + h) % TILE, (i * 7 + 4) % TILE, 6, 1, 'rgba(255,255,255,0.25)');
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, TILE, 2);
  } else if (tile.hazard === 'lava') {
    ctx.fillStyle = '#8a1c0c';
    ctx.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 5; i++) {
      const x = (h * (i + 1) * 11) % TILE, y = (h * (i + 2) * 17) % TILE;
      px(ctx, x, y, 4, 2, i % 2 ? '#ff7a1a' : '#ffd21a');
    }
    ctx.fillStyle = 'rgba(255,120,20,0.35)';
    ctx.fillRect(0, 0, TILE, 2);
  } else if (tile.hazard === 'fire') {
    ctx.fillStyle = '#b03010';
    ctx.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 4; i++) {
      const x = (h * (i + 1) * 9) % TILE, y = 6 + (h * (i + 3) * 5) % 12;
      px(ctx, x, y, 3, 3, i % 2 ? '#ff8a2a' : '#ffd24a');
      px(ctx, x + 1, y - 2, 1, 2, '#ffd24a');
    }
  } else if (tile.hazard === 'brambles') {
    ctx.fillStyle = '#2f4a2a';
    ctx.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 5; i++) {
      const x = (h * (i + 2) * 13) % TILE, y = (h * (i + 4) * 7) % TILE;
      px(ctx, x, y, 2, 2, '#4a7038');
      px(ctx, x - 1, y - 2, 1, 2, '#4a7038');
    }
  } else if (tile.hazard === 'grease') {
    ctx.fillStyle = 'rgba(160,150,80,0.55)';
    ctx.fillRect(0, 0, TILE, TILE);
    px(ctx, h % TILE, 8, 6, 2, 'rgba(230,220,140,0.7)');
  }

  // obstacles: generated object art replaces the procedural placeholder
  // (border walls use the wall TILE art instead — handled in the tail)
  if (tile.obstacle) {
    const ob = OBSTACLES[tile.obstacle];
    if (!ob) { /* unknown */ }
    else if (tile.obstacle === 'wall') {
      drawObstacle(ctx, ob, tile, loc, h);
    } else {
      const objP = `objects/${tile.obstacle}.png`;
      const hasArt = typeof document !== 'undefined' && getCached(objP);
      if (!hasArt) drawObstacle(ctx, ob, tile, loc, h);
    }
  }

  // subtle grid
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);

  // Drop-in art — three layers:
  //   ground/wall/elevation tiles → REPLACE the procedural tile entirely
  //   *_hazard_ + objects/*       → composite over the (art or procedural) base
  const assetPaths = tileAssetPaths(loc.id, tile, loc);
  const replacementPaths = assetPaths.filter(p => p.startsWith('tiles/') && !p.includes('_hazard_'));
  const overlayOnly = assetPaths.filter(p => p.startsWith('objects/') || p.includes('_hazard_'));
  const hasReplacement = replacementPaths.some(p => getCached(p));
  if (typeof document !== 'undefined') {
    for (const p of assetPaths) {
      if (!getCached(p)) loadAsset(p, () => { clearTileCache(); });
    }
  }

  if (hasReplacement) {
    // generated full-tile art: draw ONLY the art (placeholder fully removed)
    const c2 = makeCanvas(TILE_SIZE, TILE_SIZE);
    const ctx2 = c2.getContext('2d');
    ctx2.imageSmoothingEnabled = false;
    for (const p of replacementPaths) {
      const img = getCached(p);
      if (img) drawImageCover(ctx2, img, 0, 0, TILE_SIZE, TILE_SIZE);
    }
    overlayPaths(ctx2, overlayOnly, TILE_SIZE, TILE_SIZE);
    c2._hasArt = true;
    cache.set(key, c2);
    return c2;
  }

  // procedural base — but generated OBJECT art still replaces the procedural
  // object sprite (no double-drawing), and hazard art composites on top
  const objPath = tile.obstacle && tile.obstacle !== 'wall' ? `objects/${tile.obstacle}.png` : null;
  const objArt = objPath ? getCached(objPath) : null;
  if (objArt) {
    drawImageCover(ctx, objArt, 0, 0, TILE_SIZE, TILE_SIZE);
  }
  if (overlayPaths(ctx, overlayOnly.filter(p => p !== objPath), TILE_SIZE, TILE_SIZE)) c._hasArt = true;
  if (objArt) c._hasArt = true;
  cache.set(key, c);
  return c;
}

function drawObstacle(ctx, ob, tile, loc, h) {
  switch (ob.sprite) {
    case 'wall': {
      ctx.fillStyle = loc.wall || '#3a3a3a';
      ctx.fillRect(0, 0, TILE, TILE);
      px(ctx, 0, 0, TILE, 4, shade(loc.wall || '#3a3a3a', 18));
      px(ctx, 0, TILE - 4, TILE, 4, shade(loc.wall || '#3a3a3a', -22));
      break;
    }
    case 'pillar': {
      ctx.fillStyle = shade(tile.ground, -30);
      ctx.fillRect(6, 2, TILE - 12, TILE - 4);
      px(ctx, 4, 1, TILE - 8, 4, shade(tile.ground, -45));
      px(ctx, 4, TILE - 5, TILE - 8, 3, shade(tile.ground, -45));
      break;
    }
    case 'tree': {
      px(ctx, TILE / 2 - 2, TILE / 2, 4, TILE / 2 - 2, '#5a3c22');
      ctx.fillStyle = '#2c5a2c';
      ctx.beginPath();
      ctx.arc(TILE / 2, TILE / 2 - 2, TILE / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      px(ctx, TILE / 2 - 3, 4, 6, 6, '#3a7038');
      break;
    }
    case 'house': {
      ctx.fillStyle = '#8a6a4a';
      ctx.fillRect(2, 6, TILE - 4, TILE - 8);
      ctx.fillStyle = '#6a4a2c';
      ctx.fillRect(2, 4, TILE - 4, 3);
      px(ctx, 6, 10, 4, 4, '#3a2a1a');
      break;
    }
    case 'rock': case 'boulder': {
      ctx.fillStyle = '#7d7d77';
      ctx.beginPath();
      ctx.arc(TILE / 2, TILE / 2 + 2, TILE / 2 - 5, 0, Math.PI * 2);
      ctx.fill();
      px(ctx, TILE / 2 - 4, TILE / 2 - 3, 8, 5, '#8f8f88');
      break;
    }
    case 'statue': {
      px(ctx, TILE / 2 - 3, TILE - 8, 6, 8, '#a8a898');
      px(ctx, TILE / 2 - 2, TILE - 13, 4, 4, '#a8a898');
      px(ctx, TILE / 2 - 5, TILE - 4, 10, 4, '#8a8a7c');
      break;
    }
    case 'mast': {
      px(ctx, TILE / 2 - 1, 1, 2, TILE - 2, '#6a4a2a');
      px(ctx, TILE / 2 - 4, 3, 8, 2, '#8a6a3c');
      break;
    }
    case 'table': {
      ctx.fillStyle = '#7a5230';
      ctx.fillRect(3, 8, TILE - 6, 8);
      px(ctx, 5, 4, TILE - 10, 2, '#7a5230');
      px(ctx, 8, 6, 4, 3, '#8a6240');
      break;
    }
    case 'barrel': {
      ctx.fillStyle = '#8a623a';
      ctx.beginPath();
      ctx.arc(TILE / 2, TILE / 2 + 2, 7, 0, Math.PI * 2);
      ctx.fill();
      px(ctx, TILE / 2 - 7, TILE / 2 - 1, 14, 2, '#a8a898');
      px(ctx, TILE / 2 - 7, TILE / 2 + 4, 14, 2, '#a8a898');
      break;
    }
    case 'chair': {
      px(ctx, TILE / 2 - 4, TILE / 2 - 4, 8, 2, '#8a623a');
      px(ctx, TILE / 2 - 4, TILE / 2 - 4, 2, 12, '#8a623a');
      px(ctx, TILE / 2 + 2, TILE / 2 - 4, 2, 12, '#8a623a');
      break;
    }
    case 'bush': {
      ctx.fillStyle = '#3a6a30';
      ctx.beginPath();
      ctx.arc(TILE / 2, TILE / 2 + 4, 8, 0, Math.PI * 2);
      ctx.fill();
      px(ctx, TILE / 2 - 3, TILE / 2 - 2, 6, 5, '#4a8038');
      break;
    }
    case 'log': {
      ctx.fillStyle = '#6a4a2a';
      ctx.fillRect(2, TILE / 2 - 3, TILE - 4, 7);
      px(ctx, 2, TILE / 2 - 3, TILE - 4, 2, '#7a5a36');
      break;
    }
    case 'stump': {
      ctx.fillStyle = '#6a4a2a';
      ctx.beginPath();
      ctx.arc(TILE / 2, TILE / 2, 7, 0, Math.PI * 2);
      ctx.fill();
      px(ctx, TILE / 2 - 3, TILE / 2 - 3, 6, 6, '#8a6a44');
      break;
    }
    case 'rubble': {
      for (let i = 0; i < 5; i++) {
        px(ctx, (h + i * 7) % (TILE - 6) + 2, (h * 3 + i * 11) % (TILE - 6) + 2, 4, 3, i % 2 ? '#8a8a80' : '#7a7a72');
      }
      break;
    }
    case 'crate': {
      ctx.fillStyle = '#9a7a48';
      ctx.fillRect(3, 5, TILE - 6, TILE - 8);
      px(ctx, 3, 5, TILE - 6, 2, '#7a5c30');
      px(ctx, TILE / 2 - 1, 5, 2, TILE - 8, '#7a5c30');
      break;
    }
    case 'cannon': {
      px(ctx, 2, 8, TILE - 4, 8, '#3a3a40');
      px(ctx, 4, 6, TILE - 8, 4, '#4a4a52');
      px(ctx, 2, 12, 4, 4, '#2a2a2e');
      break;
    }
    case 'hearth': {
      ctx.fillStyle = '#6a6a6a';
      ctx.fillRect(3, 6, TILE - 6, TILE - 8);
      px(ctx, 6, 10, TILE - 12, 6, '#ff8a2a');
      px(ctx, 8, 11, 4, 3, '#ffd24a');
      break;
    }
    case 'fountain': {
      ctx.fillStyle = '#8a8a92';
      ctx.beginPath();
      ctx.arc(TILE / 2, TILE / 2 + 2, 8, 0, Math.PI * 2);
      ctx.fill();
      px(ctx, TILE / 2 - 5, TILE / 2 - 5, 10, 10, '#3a6a8a');
      px(ctx, TILE / 2 - 1, TILE / 2 - 9, 2, 5, '#3a6a8a');
      break;
    }
    case 'cart': {
      px(ctx, 4, TILE / 2, TILE - 8, 8, '#8a623a');
      px(ctx, 4, TILE / 2 - 4, TILE - 8, 3, '#9a724a');
      px(ctx, 4, TILE / 2 + 8, 3, 3, '#3a3a3a');
      px(ctx, TILE - 7, TILE / 2 + 8, 3, 3, '#3a3a3a');
      break;
    }
    case 'spike': {
      ctx.fillStyle = '#4a4a4a';
      ctx.beginPath();
      ctx.moveTo(TILE / 2, 2); ctx.lineTo(TILE - 4, TILE - 3); ctx.lineTo(4, TILE - 3);
      ctx.fill();
      px(ctx, TILE / 2 - 2, TILE / 2 - 6, 4, 8, '#6a6a6a');
      break;
    }
    case 'rift': {
      ctx.fillStyle = '#1a0a08';
      ctx.fillRect(0, 0, TILE, TILE);
      px(ctx, 3, TILE / 2, TILE - 6, 2, '#ff5a1a');
      break;
    }
    case 'sarcophagus': {
      ctx.fillStyle = '#8a8a7a';
      ctx.fillRect(5, 4, TILE - 10, TILE - 8);
      px(ctx, 7, 3, TILE - 14, 2, '#9a9a88');
      px(ctx, TILE / 2 - 1, 8, 2, 8, '#6a6a5c');
      break;
    }
    case 'stone_circle': {
      px(ctx, 4, TILE - 10, 6, 10, '#7a7a70');
      px(ctx, TILE - 10, TILE - 12, 6, 12, '#7a7a70');
      px(ctx, TILE / 2 - 4, TILE - 8, 8, 8, '#8a8a80');
      break;
    }
    case 'mushroom': {
      px(ctx, TILE / 2 - 2, TILE / 2, 4, 8, '#d8d0b8');
      ctx.fillStyle = '#b04a6a';
      ctx.beginPath();
      ctx.arc(TILE / 2, TILE / 2 - 1, 7, Math.PI, 0);
      ctx.fill();
      px(ctx, TILE / 2 - 4, TILE / 2 - 4, 3, 2, '#d87a9a');
      break;
    }
    case 'vine': {
      ctx.fillStyle = '#3a6a30';
      ctx.fillRect(TILE / 2 - 3, 0, 6, TILE);
      px(ctx, TILE / 2 - 3, h % 8, 6, 2, '#4a8038');
      break;
    }
    case 'bone_pile': {
      px(ctx, 6, TILE - 8, 5, 2, '#d8d0b8');
      px(ctx, 10, TILE - 11, 5, 2, '#d8d0b8');
      px(ctx, 8, TILE - 5, 5, 2, '#c8c0a8');
      break;
    }
    case 'chain': {
      px(ctx, 2, TILE / 2 - 1, TILE - 4, 2, '#8a8a92');
      px(ctx, 4, TILE / 2 - 3, 2, 6, '#7a7a82');
      px(ctx, TILE - 6, TILE / 2 - 3, 2, 6, '#7a7a82');
      break;
    }
    case 'brazier': {
      px(ctx, TILE / 2 - 3, TILE / 2, 6, 8, '#6a6a6a');
      px(ctx, TILE / 2 - 5, TILE / 2 - 3, 10, 4, '#7a7a7a');
      px(ctx, TILE / 2 - 2, TILE / 2 - 6, 4, 4, '#ff8a2a');
      px(ctx, TILE / 2 - 1, TILE / 2 - 8, 2, 3, '#ffd24a');
      break;
    }
    case 'arch': {
      px(ctx, 4, TILE - 8, 5, 8, '#8a8478');
      px(ctx, TILE - 9, TILE - 8, 5, 8, '#8a8478');
      px(ctx, 2, TILE - 12, TILE - 4, 4, '#9a9488');
      break;
    }
    case 'rope': {
      ctx.fillStyle = '#b09a5a';
      ctx.beginPath();
      ctx.arc(TILE / 2, TILE / 2, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c8b06a';
      ctx.beginPath();
      ctx.arc(TILE / 2, TILE / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'flower': {
      px(ctx, TILE / 2 - 1, TILE / 2, 2, 7, '#3a7a3a');
      px(ctx, TILE / 2 - 4, TILE / 2 - 6, 8, 3, '#d86ab0');
      px(ctx, TILE / 2 - 2, TILE / 2 - 8, 4, 3, '#e88ac0');
      px(ctx, TILE / 2 - 1, TILE / 2 - 9, 2, 2, '#ffd24a');
      break;
    }
    case 'cliff1': case 'cliff2': {
      // visual cliff face on south edge
      px(ctx, 0, TILE - 5, TILE, 5, loc.cliff || shade(tile.ground, -45));
      px(ctx, 0, TILE - 5, TILE, 1, shade(tile.ground, -20));
      for (let i = 0; i < 4; i++) px(ctx, i * 7 + 2, TILE - 4, 2, 2, shade(loc.cliff || tile.ground, -60));
      break;
    }
    case 'gravel': {
      for (let i = 0; i < 7; i++) {
        px(ctx, (h * (i + 2) * 9) % TILE, (h * (i + 3) * 5) % TILE, 2, 2, i % 2 ? shade(tile.ground, 20) : shade(tile.ground, -18));
      }
      break;
    }
    default: {
      ctx.fillStyle = '#666';
      ctx.fillRect(4, 4, TILE - 8, TILE - 8);
    }
  }
}

// ============================== UNIT SPRITES ==============================
const CLASS_PALETTES = {
  barbarian: { body: '#c8a06a', shirt: '#8a5a34', accent: '#a83232', trim: '#5a3a22' },
  bard: { body: '#c8a06a', shirt: '#8a3a8a', accent: '#d8b048', trim: '#4a2a5a' },
  cleric: { body: '#c8a06a', shirt: '#c8c8c8', accent: '#d8b048', trim: '#6a6a6a' },
  druid: { body: '#c8a06a', shirt: '#5a7a3a', accent: '#8a6a3a', trim: '#3a4a2a' },
  fighter: { body: '#c8a06a', shirt: '#7a8a9a', accent: '#c84040', trim: '#4a5a6a' },
  monk: { body: '#c8a06a', shirt: '#b0482a', accent: '#d8b048', trim: '#6a2a1a' },
  paladin: { body: '#c8a06a', shirt: '#b0b8c0', accent: '#d8b048', trim: '#5a6a8a' },
  ranger: { body: '#c8a06a', shirt: '#4a6a3a', accent: '#7a5a3a', trim: '#2a3a24' },
  rogue: { body: '#c8a06a', shirt: '#3a3a44', accent: '#6a6a74', trim: '#1a1a22' },
  sorcerer: { body: '#c8a06a', shirt: '#5a3a8a', accent: '#8a5ad8', trim: '#2a1a4a' },
  warlock: { body: '#c8a06a', shirt: '#2a2a3a', accent: '#5a8a3a', trim: '#12121a' },
  wizard: { body: '#c8a06a', shirt: '#3a5a8a', accent: '#d8b048', trim: '#1a2a4a' },
};

const MONSTER_PALETTES = {
  goblin: { body: '#6a9a3a', shirt: '#4a3a2a', accent: '#8ac84a', trim: '#2a2a1a' },
  rat: { body: '#8a7a5f', shirt: '#8a7a5f', accent: '#a8946f', trim: '#5a4c38' },
  bat: { body: '#5a5268', shirt: '#5a5268', accent: '#7a7088', trim: '#38343f' },
  humanoid: { body: '#c8a06a', shirt: '#7a6a52', accent: '#a88a5a', trim: '#4a3a28' },
  wolf: { body: '#9a9aa0', shirt: '#9a9aa0', accent: '#c0c0c8', trim: '#5a5a60' },
  skeleton: { body: '#e8e0cc', shirt: '#d0c8b0', accent: '#f8f4e0', trim: '#8a8470' },
  zombie: { body: '#7a9a6a', shirt: '#5a6a4a', accent: '#8aaa7a', trim: '#3a4a2a' },
  spider: { body: '#4a4238', shirt: '#3a322a', accent: '#6a6258', trim: '#1a120c' },
  ogre: { body: '#c0a070', shirt: '#8a6a42', accent: '#d8b080', trim: '#4a3a20' },
  wererat: { body: '#9a8a70', shirt: '#7a6a52', accent: '#baa890', trim: '#4a3a2a' },
  ghoul: { body: '#a8b088', shirt: '#889070', accent: '#c0c8a0', trim: '#4a4a3a' },
  minotaur: { body: '#8a5a3a', shirt: '#6a422a', accent: '#a8744a', trim: '#3a2010' },
  harpy: { body: '#c8b898', shirt: '#a89878', accent: '#e0d0b0', trim: '#6a5c40' },
  sahuagin: { body: '#4a8a6a', shirt: '#3a6a52', accent: '#5aaa82', trim: '#1a3a2a' },
  imp: { body: '#d04830', shirt: '#a83020', accent: '#e86848', trim: '#5a1408' },
  spined_devil: { body: '#8a3a30', shirt: '#6a2a20', accent: '#a84a40', trim: '#3a1208' },
  bearded_devil: { body: '#6a2a20', shirt: '#4a1a12', accent: '#8a3a30', trim: '#200a04' },
  hell_hound: { body: '#3a2a2a', shirt: '#2a1a1a', accent: '#ff8a2a', trim: '#120808' },
  barbed_devil: { body: '#5a1a10', shirt: '#401008', accent: '#7a2a1a', trim: '#180404' },
  erinyes: { body: '#a03020', shirt: '#70180c', accent: '#c04830', trim: '#300804' },
  bone_devil: { body: '#e8e0d0', shirt: '#d0c8b8', accent: '#f8f4e8', trim: '#8a8470' },
  balor: { body: '#c03020', shirt: '#8a180c', accent: '#ff6a2a', trim: '#3a0804' },
  owlbear: { body: '#9a7a50', shirt: '#7a5c38', accent: '#b89468', trim: '#3a2a18' },
  troll: { body: '#6a9a66', shirt: '#4a7a46', accent: '#8aba86', trim: '#2a4a28' },
  basilisk: { body: '#8a9a52', shirt: '#6a7a3a', accent: '#a8b86a', trim: '#3a4a1a' },
  mimic: { body: '#8a6a42', shirt: '#6a4c2c', accent: '#c8a06a', trim: '#3a2812' },
  cube: { body: '#a8e0d0', shirt: '#a8e0d0', accent: '#c8f0e4', trim: '#68a898' },
  flameskull: { body: '#e8d8a8', shirt: '#e8d8a8', accent: '#ffa82a', trim: '#c8a050' },
  mind_flayer: { body: '#7a6a9a', shirt: '#5a4a7a', accent: '#9a8aba', trim: '#2a1a4a' },
  beholder: { body: '#9a7aac', shirt: '#7a5a8c', accent: '#c060ff', trim: '#3a2054' },
  dragon: { body: '#c83828', shirt: '#a02818', accent: '#e86040', trim: '#581008' },
  kraken: { body: '#3a6a7a', shirt: '#2a4a5a', accent: '#4a8a9a', trim: '#12222c' },
  bear: { body: '#7a5230', shirt: '#6a4526', accent: '#9a7048', trim: '#3a2412' },
  badger: { body: '#5f5f55', shirt: '#4a4a40', accent: '#e8e8e0', trim: '#2a2a24' },
  cat: { body: '#8a6a3a', shirt: '#7a5c30', accent: '#a88448', trim: '#3a2a14' },
};

// Display widths (game px, at scale 1 a tile is 28px) per 5e size category.
// Bigger on-screen units = cleaner art.
export const UNIT_DISP_W = { tiny: 18, small: 21, medium: 24, large: 31, huge: 35 };
// Generated art is rendered into an internally 2× canvas so large AI images
// keep far more detail when they hit the screen.
export const UNIT_ART_RES = 2;

export function unitDisplayWidth(u) {
  const char = u && u.char;
  let size = 'medium';
  if (char) {
    if (char.wildShapeForm && char.wildShapeForm.size) size = String(char.wildShapeForm.size).toLowerCase();
    else if (char.stats && char.size) size = String(char.size).toLowerCase();
  }
  return UNIT_DISP_W[size] || UNIT_DISP_W.medium;
}

// Maximum art height as a multiple of the display width, per size category.
// Tall sprites from ADJACENT rows stack into vertical totems (the back unit's
// head looks like it's worn as a hat); capping keeps mediums ~1.5 tiles tall
// so rows stay visually separated, while large/huge monsters still loom.
export const UNIT_ART_MAX_H = { 18: 1.6, 21: 1.7, 24: 1.8, 31: 2.1, 35: 2.4 };

// Size of the canvas a piece of generated unit art should live on: width
// follows the creature's size category, height follows the art's TRUE aspect
// ratio (after trimming transparent padding), capped so characters can stand
// tall above their tile without becoming towers.
export function unitArtCanvas(art, sizeW = UNIT_DISP_W.medium) {
  const bounds = trimBounds(art);
  const srcW = bounds ? bounds.w : (art.naturalWidth || art.width || 1);
  const srcH = bounds ? bounds.h : (art.naturalHeight || art.height || 1);
  const ratio = srcH / Math.max(1, srcW);
  // size-aware cap: mediums ≤1.8×, larges ≤2.1×, huges ≤2.4× their width
  const capMult = UNIT_ART_MAX_H[sizeW] || 1.8;
  const h = Math.max(sizeW, Math.min(Math.round(sizeW * capMult), Math.round(sizeW * ratio)));
  return { w: sizeW, h, res: UNIT_ART_RES, cw: sizeW * UNIT_ART_RES, ch: h * UNIT_ART_RES, bounds };
}

// Draw generated character art with PERFECT aspect (contain — nothing is ever
// stretched or cropped), bottom-anchored so the feet sit on the tile baseline.
function drawUnitArt(ctx2, art, cw, ch) {
  const bounds = trimBounds(art);
  const srcW = bounds ? bounds.w : (art.naturalWidth || art.width || cw);
  const srcH = bounds ? bounds.h : (art.naturalHeight || art.height || ch);
  const s = Math.min(cw / srcW, ch / srcH);
  const dw = srcW * s, dh = srcH * s;
  const dx = (cw - dw) / 2;
  const dy = ch - dh; // feet on the bottom edge
  const smooth = s < 0.75;
  ctx2.imageSmoothingEnabled = smooth;
  if (smooth && ctx2.imageSmoothingQuality !== undefined) ctx2.imageSmoothingQuality = 'high';
  if (bounds) ctx2.drawImage(art, bounds.x, bounds.y, bounds.w, bounds.h, dx, dy, dw, dh);
  else ctx2.drawImage(art, dx, dy, dw, dh);
  ctx2.imageSmoothingEnabled = false;
}

export function drawUnitSprite(u, opts = {}) {
  const char = u.char;
  const isMonster = !!char.stats;
  let pal;
  let shape = 'humanoid';
  if (isMonster) {
    const sp = char.sprite || {};
    shape = sp.shape || 'humanoid';
    pal = MONSTER_PALETTES[shape] || MONSTER_PALETTES.humanoid;
  } else {
    pal = CLASS_PALETTES[char.classId] || CLASS_PALETTES.fighter;
  }

  // Cache key MUST include the unit's art identity: monsters that share a
  // sprite shape (bandit/cultist/thug are all 'humanoid') must never share a
  // sprite cache entry — otherwise the first one drawn poisons the cache and
  // the others never load their art.
  const artId = unitAssetPaths(u)[0] || `${isMonster ? shape : char.classId}`;
  const key = `${artId}|${opts.selected ? 'sel' : ''}|${opts.dim ? 'dim' : ''}`;
  const cacheKey = `unit_${key}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  // Drop-in art: if a unit PNG is loaded, draw it (scaled into the sprite cell)
  if (typeof document !== 'undefined') {
    const paths = unitAssetPaths(u);
    let art = null;
    for (const p of paths) {
      const img = getCached(p);
      if (img) { art = img; break; }
    }
    if (art) {
      // generated character art: trimmed of padding, drawn at its true aspect,
      // bottom-anchored — rendered at 2x internal resolution for crispness
      const dispW = unitDisplayWidth(u);
      const dims = unitArtCanvas(art, dispW);
      const c2 = makeCanvas(dims.cw, dims.ch);
      const ctx2 = c2.getContext('2d');
      drawUnitArt(ctx2, art, dims.cw, dims.ch);
      c2._isArt = true;
      c2._dispW = dims.w;
      c2._dispH = dims.h;
      if (opts.selected) { ctx2.strokeStyle = '#ffe83c'; ctx2.lineWidth = 1; ctx2.strokeRect(0.5, 0.5, dims.cw - 1, dims.ch - 1); }
      if (opts.dim) { ctx2.fillStyle = 'rgba(0,0,0,0.5)'; ctx2.fillRect(0, 0, dims.cw, dims.ch); }
      cache.set(cacheKey, c2);
      return c2;
    }
    for (const p of paths) {
      if (!getCached(p)) loadAsset(p, () => { clearTileCache(); });
    }
  }

  const c = makeCanvas(SPRITE_W, SPRITE_H);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const cx = SPRITE_W / 2;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, SPRITE_H - 2, 7, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  if (shape === 'rat' || shape === 'wolf' || shape === 'hell_hound' || shape === 'owlbear' || shape === 'basilisk') {
    drawBeast(ctx, pal, shape);
  } else if (shape === 'spider') {
    drawSpider(ctx, pal);
  } else if (shape === 'bat' || shape === 'imp' || shape === 'spined_devil' || shape === 'harpy' || shape === 'erinyes' || shape === 'bone_devil' || shape === 'dragon') {
    drawWinged(ctx, pal, shape);
  } else if (shape === 'cube') {
    ctx.fillStyle = pal.body;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(2, 4, SPRITE_W - 4, SPRITE_H - 8);
    ctx.globalAlpha = 1;
    px(ctx, 4, 7, 4, 4, pal.accent);
    px(ctx, 10, 11, 4, 4, pal.accent);
  } else if (shape === 'beholder') {
    drawBeholder(ctx, pal);
  } else if (shape === 'flameskull') {
    drawFlameskull(ctx, pal);
  } else if (shape === 'kraken') {
    drawKraken(ctx, pal);
  } else if (shape === 'minotaur') {
    drawHumanoid(ctx, pal, 'axe', { horns: true });
  } else if (shape === 'ogre' || shape === 'troll' || shape === 'balor' || shape === 'barbed_devil') {
    drawHumanoid(ctx, pal, shape === 'ogre' || shape === 'troll' ? 'club' : 'claws', { bulky: true, wings: shape === 'balor' });
  } else if (shape === 'mind_flayer') {
    drawHumanoid(ctx, pal, 'none', { tentacles: true });
  } else if (shape === 'skeleton' || shape === 'ghoul' || shape === 'wight' || shape === 'zombie') {
    drawHumanoid(ctx, pal, shape === 'ghoul' || shape === 'zombie' ? 'none' : 'sword', { skull: true });
  } else if (shape === 'goblin') {
    drawHumanoid(ctx, pal, 'dagger', { small: true, ears: true });
  } else if (shape === 'wererat' || shape === 'sahuagin' || shape === 'bearded_devil' || shape === 'mimic' || shape === 'humanoid') {
    const weapon = char.sprite && char.sprite.weapon;
    drawHumanoid(ctx, pal, weapon || 'sword', { tail: shape === 'sahuagin' || shape === 'bearded_devil' || shape === 'wererat' });
  } else if (char.transformed && char.transformed.type === 'mind_flayer') {
    drawHumanoid(ctx, MONSTER_PALETTES.mind_flayer, 'none', { tentacles: true });
  } else if (char.wildShapeForm) {
    const ws = char.wildShapeForm;
    const wpal = MONSTER_PALETTES[ws.sprite] || MONSTER_PALETTES.bear;
    if (ws.sprite === 'spider') drawSpider(ctx, wpal);
    else if (ws.sprite === 'rat') drawBeast(ctx, wpal, 'rat');
    else if (ws.sprite === 'badger' || ws.sprite === 'cat') drawBeast(ctx, wpal, ws.sprite);
    else drawBeast(ctx, wpal, 'bear');
  } else {
    // player characters
    const weapon = weaponSpriteFor(char);
    drawHumanoid(ctx, pal, weapon, { hero: char.hero, shield: char.shield, armored: char.armor !== 'none', staff: char.cls.id === 'wizard' || char.cls.id === 'druid' || char.cls.id === 'sorcerer' });
  }

  if (opts.selected) {
    ctx.strokeStyle = '#ffe83c';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, SPRITE_W - 1, SPRITE_H - 1);
  }
  if (opts.dim) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, SPRITE_W, SPRITE_H);
  }

  // procedural sprites scale up to the same display size as generated art
  // (nearest-neighbor keeps the chunky pixel look consistent)
  const dispW = unitDisplayWidth(u);
  c._dispW = dispW;
  c._dispH = Math.round(SPRITE_H * dispW / SPRITE_W);

  cache.set(cacheKey, c);
  return c;
}

function weaponSpriteFor(char) {
  const w = char.weapon ? char.weapon.base : 'dagger';
  if (['longbow', 'shortbow', 'light_crossbow', 'heavy_crossbow'].includes(w)) return 'bow';
  if (['greataxe', 'battleaxe', 'handaxe'].includes(w)) return 'axe';
  if (['greatsword', 'longsword', 'shortsword', 'scimitar', 'rapier'].includes(w)) return 'sword';
  if (['mace', 'warhammer', 'maul', 'morningstar', 'flail', 'club', 'greatclub'].includes(w)) return 'mace';
  if (['spear', 'javelin', 'pike', 'halberd', 'glaive'].includes(w)) return 'spear';
  if (['quarterstaff'].includes(w)) return 'staff';
  if (['dagger', 'sickle', 'whip', 'sling'].includes(w)) return 'dagger';
  return 'none';
}

function drawHumanoid(ctx, pal, weapon, opts = {}) {
  const cx = SPRITE_W / 2;
  const skin = pal.body;
  const h = opts.small ? 16 : opts.bulky ? 22 : 20;
  const y0 = SPRITE_H - h;
  const w2 = opts.bulky ? 8 : 7;

  // legs
  px(ctx, cx - 3, y0 + h - 7, 3, 7, pal.trim);
  px(ctx, cx + 1, y0 + h - 7, 3, 7, pal.trim);
  // body
  if (opts.armored) {
    px(ctx, cx - 4, y0 + h - 16, 8, 9, pal.shirt);
    px(ctx, cx - 4, y0 + h - 16, 8, 2, pal.accent);
    px(ctx, cx - 1, y0 + h - 14, 2, 7, pal.trim);
  } else {
    px(ctx, cx - w2 / 2 - 1, y0 + h - 15, w2 + 2, 8, pal.shirt);
    px(ctx, cx - w2 / 2 - 1, y0 + h - 15, w2 + 2, 2, pal.accent);
  }
  // arms
  const armColor = opts.armored ? pal.accent : skin;
  px(ctx, cx - 6, y0 + h - 15, 2, 7, armColor);
  px(ctx, cx + 4, y0 + h - 15, 2, 7, armColor);
  // head
  px(ctx, cx - 3, y0 + h - 21, 6, 6, skin);
  // hair/helm
  px(ctx, cx - 3, y0 + h - 21, 6, 2, opts.skull ? pal.accent : pal.trim);
  if (opts.horns) {
    px(ctx, cx - 6, y0 + h - 22, 2, 3, '#d8d0b8');
    px(ctx, cx + 4, y0 + h - 22, 2, 3, '#d8d0b8');
  }
  if (opts.ears) {
    px(ctx, cx - 5, y0 + h - 19, 2, 3, skin);
    px(ctx, cx + 3, y0 + h - 19, 2, 3, skin);
  }
  if (opts.skull) {
    px(ctx, cx - 2, y0 + h - 19, 1, 1, '#1a1a1a');
    px(ctx, cx + 1, y0 + h - 19, 1, 1, '#1a1a1a');
  }
  if (opts.tentacles) {
    px(ctx, cx - 2, y0 + h - 14, 1, 3, pal.accent);
    px(ctx, cx, y0 + h - 14, 1, 4, pal.accent);
    px(ctx, cx + 1, y0 + h - 14, 1, 3, pal.accent);
  }
  if (opts.tail) {
    px(ctx, cx + 5, y0 + h - 8, 3, 2, pal.trim);
  }
  // weapon
  if (weapon === 'sword') {
    px(ctx, cx + 6, y0 + h - 18, 1, 7, '#c8c8cc');
    px(ctx, cx + 6, y0 + h - 19, 1, 2, '#e8e8ee');
    px(ctx, cx + 5, y0 + h - 12, 3, 1, '#8a6a3a');
  } else if (weapon === 'axe') {
    px(ctx, cx + 6, y0 + h - 19, 1, 8, '#8a6a3a');
    px(ctx, cx + 5, y0 + h - 20, 3, 3, '#b0b0b8');
  } else if (weapon === 'mace') {
    px(ctx, cx + 6, y0 + h - 19, 1, 8, '#8a6a3a');
    px(ctx, cx + 5, y0 + h - 21, 3, 3, '#8a8a92');
  } else if (weapon === 'bow') {
    px(ctx, cx + 6, y0 + h - 20, 1, 9, '#8a6a3a');
    px(ctx, cx + 4, y0 + h - 20, 3, 1, '#c8c8cc');
  } else if (weapon === 'spear') {
    px(ctx, cx + 6, y0 + h - 22, 1, 12, '#8a6a3a');
    px(ctx, cx + 6, y0 + h - 23, 2, 2, '#c8c8cc');
  } else if (weapon === 'staff') {
    px(ctx, cx + 6, y0 + h - 22, 1, 12, '#8a6a3a');
    px(ctx, cx + 5, y0 + h - 23, 3, 2, pal.accent);
  } else if (weapon === 'dagger') {
    px(ctx, cx + 6, y0 + h - 17, 1, 5, '#c8c8cc');
  } else if (weapon === 'claws') {
    px(ctx, cx + 5, y0 + h - 15, 3, 1, '#e8e8e8');
    px(ctx, cx + 5, y0 + h - 13, 3, 1, '#e8e8e8');
  }
  if (opts.shield) {
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.arc(cx - 6, y0 + h - 12, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (opts.wings) {
    drawWings(ctx, cx, y0 + h - 15, pal.trim);
  }
  if (opts.hero) {
    px(ctx, cx - 1, y0 + h - 24, 2, 2, '#ffd24a');
  }
}

function drawBeast(ctx, pal, shape) {
  const cx = SPRITE_W / 2;
  const big = shape === 'owlbear';
  const glow = shape === 'hell_hound';
  // body
  px(ctx, cx - (big ? 7 : 5), 10, big ? 14 : 10, 7, pal.body);
  // head
  px(ctx, cx + (big ? 5 : 4), 7, big ? 5 : 4, 5, pal.body);
  px(ctx, cx + (big ? 7 : 5), 6, 2, 2, pal.accent);
  // legs
  px(ctx, cx - (big ? 6 : 4), 16, 3, 5, pal.trim);
  px(ctx, cx + 2, 16, 3, 5, pal.trim);
  // tail
  px(ctx, cx - (big ? 8 : 6), 11, 3, 2, pal.trim);
  // eye
  px(ctx, cx + (big ? 7 : 6), 8, 1, 1, glow ? '#ffd24a' : '#e8382a');
  if (glow) {
    px(ctx, cx, 12, 2, 2, '#ff6a1a');
    px(ctx, cx - 3, 14, 1, 1, '#ff8a2a');
  }
}

function drawSpider(ctx, pal) {
  const cx = SPRITE_W / 2;
  ctx.fillStyle = pal.body;
  ctx.beginPath();
  ctx.arc(cx, 14, 6, 0, Math.PI * 2);
  ctx.fill();
  px(ctx, cx - 2, 10, 4, 4, pal.accent);
  for (const [x0, y0, x1, y1] of [[-6, -4, -9, -7], [6, -4, 9, -7], [-7, 2, -10, 4], [7, 2, 10, 4]]) {
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + x0, 14 + y0);
    ctx.lineTo(cx + x1, 14 + y1);
    ctx.stroke();
  }
  px(ctx, cx - 4, 20, 2, 2, pal.trim);
  px(ctx, cx + 2, 20, 2, 2, pal.trim);
  px(ctx, cx - 3, 7, 1, 1, '#e8382a');
  px(ctx, cx + 2, 7, 1, 1, '#e8382a');
}

function drawWings(ctx, cx, y, color) {
  px(ctx, cx - 6, y - 2, 5, 3, color);
  px(ctx, cx - 7, y - 4, 2, 3, color);
  px(ctx, cx + 1, y - 2, 5, 3, color);
  px(ctx, cx + 5, y - 4, 2, 3, color);
}

function drawWinged(ctx, pal, shape) {
  const cx = SPRITE_W / 2;
  const dragon = shape === 'dragon';
  const size = dragon ? 10 : 7;
  // body
  px(ctx, cx - size / 2, 9, size, 8, pal.body);
  // tail
  px(ctx, cx - size / 2 - 4, 12, 4, 2, pal.trim);
  if (dragon) {
    px(ctx, cx - size / 2 - 5, 10, 3, 3, pal.accent);
  }
  // head
  px(ctx, cx + size / 2 - 1, 6, 5, 4, pal.body);
  if (dragon) {
    px(ctx, cx + size / 2 + 3, 5, 2, 2, pal.accent);
    px(ctx, cx + size / 2 + 4, 4, 2, 1, pal.trim);
  }
  px(ctx, cx + size / 2 + 1, 7, 1, 1, dragon ? '#ffd24a' : '#e8382a');
  // wings
  drawWings(ctx, cx, 8, pal.trim);
  if (shape === 'imp' || shape === 'spined_devil') {
    px(ctx, cx, 16, 1, 3, pal.trim);
    px(ctx, cx + 1, 18, 2, 1, pal.accent);
  }
  // legs/claws
  px(ctx, cx - 3, 16, 2, 3, pal.trim);
  px(ctx, cx + 2, 16, 2, 3, pal.trim);
}

function drawBeholder(ctx, pal) {
  const cx = SPRITE_W / 2;
  ctx.fillStyle = pal.body;
  ctx.beginPath();
  ctx.arc(cx, 12, 8, 0, Math.PI * 2);
  ctx.fill();
  // big eye
  ctx.fillStyle = '#e8e8f0';
  ctx.beginPath();
  ctx.arc(cx, 11, 4, 0, Math.PI * 2);
  ctx.fill();
  px(ctx, cx - 1, 10, 2, 2, pal.accent);
  // eye stalks
  for (const [dx, dy] of [[-7, -6], [7, -6], [-8, 0], [8, 0], [-6, 6], [6, 6]]) {
    px(ctx, cx + dx, 12 + dy, 1, 2, pal.body);
    px(ctx, cx + dx, 12 + dy - 1, 1, 1, '#e8e8f0');
  }
  px(ctx, cx - 2, 18, 4, 2, pal.trim);
}

function drawFlameskull(ctx, pal) {
  const cx = SPRITE_W / 2;
  ctx.fillStyle = pal.body;
  ctx.beginPath();
  ctx.arc(cx, 13, 5, 0, Math.PI * 2);
  ctx.fill();
  px(ctx, cx - 2, 11, 1, 1, '#1a1a1a');
  px(ctx, cx + 1, 11, 1, 1, '#1a1a1a');
  px(ctx, cx - 1, 15, 3, 1, '#1a1a1a');
  // flames
  px(ctx, cx - 3, 6, 2, 3, '#ff8a2a');
  px(ctx, cx + 1, 4, 2, 4, '#ff8a2a');
  px(ctx, cx - 1, 3, 2, 2, '#ffd24a');
}

function drawKraken(ctx, pal) {
  const cx = SPRITE_W / 2;
  ctx.fillStyle = pal.body;
  ctx.beginPath();
  ctx.arc(cx, 10, 7, 0, Math.PI * 2);
  ctx.fill();
  px(ctx, cx - 3, 9, 1, 1, '#ffd24a');
  px(ctx, cx + 2, 9, 1, 1, '#ffd24a');
  for (const [x0, x1, y1] of [[-8, -12, 12], [-9, -13, 16], [8, 12, 12], [9, 13, 16], [-5, -7, 19], [5, 7, 19]]) {
    ctx.strokeStyle = pal.shirt;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + x0 * 0.7, 16);
    ctx.quadraticCurveTo(cx + x0, 12, cx + x1 * 0.9, y1 + 4);
    ctx.stroke();
  }
}

// Clear sprite cache between fights is not needed (keys are stable per type)
export function clearTileCache() { cache.clear(); }
