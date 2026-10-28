import { GROUND_Y } from '../data/config';
import type { TimeOfDay, Zone } from './sprites';

// Living backdrops: small animated touches drawn over the painted parallax layers. Everything here
// is cosmetic (Math.random), and anything rhythmic reads the heard beat, never wall-clock time.

export type Layer = 'far' | 'mid' | 'near';

/** Set-space (Blender) to world: 1 BU = 10 world units, x 0 at world 0, z 0 on the ground line. */
const wx = (bx: number) => bx * 10;
const wy = (bz: number) => GROUND_Y - bz * 10;

const pulse = (beat: number) => Math.pow(1 - (beat - Math.floor(beat)), 3);

// ---------- windows switching on and off ----------

interface Win { x: number; y: number; on: string; off: string; lit: boolean; next: number }
const windowSets = new WeakMap<HTMLImageElement, Win[]>();

/** Finds lit windows in a layer's art: bright, warm-or-cool pixels with a darker wall just beside them. */
const findWindows = (img: HTMLImageElement, top: number, w: number): Win[] => {
  const c = document.createElement('canvas');
  const k = 4; // sample at quarter size: windows are a few px wide at full size
  c.width = Math.floor(img.width / k); c.height = Math.floor(img.height / k);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const px = (x: number, y: number) => { const i = (y * c.width + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
  const found: Win[] = [];
  const s = w / c.width;
  for (let tries = 0; tries < 6000 && found.length < 70; tries++) {
    const x = 2 + Math.floor(Math.random() * (c.width - 4)), y = 2 + Math.floor(Math.random() * (c.height - 4));
    const [r, g, b, a] = px(x, y);
    if (a < 250 || r + g + b < 420) continue;
    const [r2, g2, b2, a2] = px(x + 2, y);
    if (a2 < 250 || r2 + g2 + b2 > (r + g + b) * 0.6) continue;
    if (found.some((f) => Math.abs(f.x - x * s) < 12 && Math.abs(f.y - (top + y * s)) < 12)) continue;
    found.push({ x: x * s, y: top + y * s, on: `rgb(${r},${g},${b})`, off: `rgb(${r2},${g2},${b2})`, lit: true, next: Math.random() * 8 });
  }
  return found;
};

const drawWindows = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, top: number, w: number, beat: number) => {
  let wins = windowSets.get(img);
  if (!wins) { wins = findWindows(img, top, w); windowSets.set(img, wins); }
  for (const win of wins) {
    // Each window flips on its own slow schedule, always on a beat so the city keeps time.
    if (beat >= win.next) { win.lit = !win.lit; win.next = Math.floor(beat) + 1 + Math.floor(Math.random() * (win.lit ? 24 : 10)); }
    if (win.lit) continue;
    ctx.fillStyle = win.off;
    ctx.fillRect(win.x - 400 - 3, win.y - 3, 6, 6);
  }
};

// ---------- drifting clouds ----------

const puffs = new Map<TimeOfDay, HTMLCanvasElement>();
const puff = (tod: TimeOfDay) => {
  let c = puffs.get(tod);
  if (c) return c;
  c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const ctx = c.getContext('2d')!;
  const col = { day: '255,255,255', dusk: '255,170,150', night: '120,80,160' }[tod];
  for (let i = 0; i < 7; i++) {
    const x = 50 + i * 26 + Math.random() * 10, y = 52 + Math.sin(i) * 10, r = 26 + Math.random() * 14;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col},0.5)`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  puffs.set(tod, c);
  return c;
};

const CLOUDS = Array.from({ length: 6 }, (_, i) => ({ x: i * 290, y: -460 + (i % 3) * 70 + Math.random() * 30, speed: 6 + Math.random() * 6, s: 0.9 + Math.random() * 0.8 }));

const drawClouds = (ctx: CanvasRenderingContext2D, tod: TimeOfDay, now: number) => {
  const img = puff(tod);
  ctx.save();
  ctx.globalAlpha = tod === 'night' ? 0.5 : 0.7;
  for (const c of CLOUDS) {
    const x = ((c.x + now * c.speed) % 2000) - 500;
    ctx.drawImage(img, x, c.y, 256 * c.s * 1.6, 96 * c.s * 1.6);
  }
  ctx.restore();
};

// ---------- lights: tower beacon, billboard neon ----------

const glow = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) => {
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${color},${a})`); g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
};

let flicker = 1, flickerUntil = 0;
const neonLevel = (now: number) => {
  // Mostly steady, with an occasional stutter like a failing ballast.
  if (now > flickerUntil && Math.random() < 0.004) flickerUntil = now + 0.25 + Math.random() * 0.4;
  flicker = now < flickerUntil ? (Math.random() < 0.5 ? 0.15 : 1) : 1;
  return flicker;
};

/**
 * Draw this layer's animated touches. Call right after the layer itself, under the same parallax
 * offset, so they stay pinned to the art. `top`/`w` are the layer's world placement.
 */
export const drawAmbience = (ctx: CanvasRenderingContext2D, zone: Zone, tod: TimeOfDay, layer: Layer, img: HTMLImageElement,
  top: number, w: number, beat: number, motion: number) => {
  const now = performance.now() / 1000;
  const lit = tod !== 'day';
  if (layer === 'far') {
    drawClouds(ctx, tod, now * motion);
    if (zone === 'rooftop') {
      // Broadcast tower beacon: one blink per bar, on the downbeat.
      const bar = ((beat % 4) + 4) % 4;
      glow(ctx, wx(88), wy(76.4), 40, '255,40,30', (bar < 1 ? pulse(beat) : 0) * (lit ? 0.9 : 0.6));
    }
  }
  if (layer === 'mid' && lit) drawWindows(ctx, img, top, w, beat);
  if (layer === 'near' && zone === 'rooftop') {
    // Billboard tubes: breathe on the beat, stutter now and then.
    const k = neonLevel(now) * (0.35 + 0.4 * pulse(beat)) * (lit ? 1 : 0.4);
    for (const [z, col] of [[17.4, '40,220,255'], [25.8, '180,80,255']] as const) {
      for (let x = 33; x < 59; x += 4) glow(ctx, wx(x), wy(z), 46, col, k * 0.5);
    }
  }
};
