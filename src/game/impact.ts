import type { BroKey } from '../data/config';
import type { Engine } from './engine';

// Impact feel, the fighting-game way: hit-stop (the frame holds on contact), a starburst and a
// shockwave ring where the blow lands, and speed lines behind a dashing bro. Purely visual: the
// engine and the music keep running underneath, so nothing here can push a beat off time.

interface Burst { x: number; y: number; t0: number; life: number; size: number; color: string; spikes: number[] }
const bursts: Burst[] = [];
let seenSeq = 0;
let holdUntil = 0;

/**
 * Call once per frame before drawing. Returns true while a hit-stop holds the last frame: skip
 * drawing entirely and the canvas keeps showing the moment of contact.
 */
export const hitStop = (e: Engine): boolean => {
  const now = performance.now();
  const hit = e.impact;
  if (hit.seq !== seenSeq) {
    const first = seenSeq === 0 && hit.seq > 1; // page woke up mid-run: don't replay old hits
    seenSeq = hit.seq;
    if (!first) {
      const big = hit.ult || hit.ko;
      // Heavier hits hold longer: a tap 50 ms, a crit 85, a knockout or ult 120.
      holdUntil = now + (big ? 120 : hit.crit ? 85 : 50);
      bursts.push({
        x: hit.x, y: hit.y, t0: now + (holdUntil - now), life: big ? 420 : 300, size: big ? 150 : hit.crit ? 110 : 80,
        color: hit.color, spikes: Array.from({ length: big ? 14 : 10 }, () => 0.6 + Math.random() * 0.6)
      });
      return true; // hold this very frame too: the contact pose was just drawn
    }
  }
  return now < holdUntil;
};

/** Starbursts and shockwave rings, in world space, over the fighters. */
export const drawImpacts = (ctx: CanvasRenderingContext2D, flashes: number) => {
  const now = performance.now();
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    const t = (now - b.t0) / b.life;
    if (t > 1) { bursts.splice(i, 1); continue; }
    if (t < 0) continue;
    const ease = 1 - Math.pow(1 - t, 3);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.globalCompositeOperation = 'lighter';
    // Spikes: thin wedges that shoot out and thin away.
    ctx.globalAlpha = (1 - t) * Math.max(0.4, flashes);
    ctx.fillStyle = b.color;
    const n = b.spikes.length;
    b.spikes.forEach((len, k) => {
      const a = (k / n) * Math.PI * 2 + 0.3;
      const r0 = b.size * 0.2 * ease, r1 = b.size * len * (0.4 + 0.6 * ease);
      const wdt = 0.09 * (1 - t);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - wdt) * r0, Math.sin(a - wdt) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a + wdt) * r0, Math.sin(a + wdt) * r0);
      ctx.fill();
    });
    // Shockwave: a ring that races out and fades.
    ctx.globalAlpha = (1 - t) * 0.8;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 6 * (1 - t) + 1;
    ctx.beginPath(); ctx.arc(0, 0, b.size * 1.1 * ease, 0, Math.PI * 2); ctx.stroke();
    // Core flash for the first instant.
    if (t < 0.25) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, b.size * 0.6);
      g.addColorStop(0, `rgba(255,255,255,${(1 - t * 4) * 0.9 * Math.max(0.3, flashes)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g;
      ctx.fillRect(-b.size, -b.size, b.size * 2, b.size * 2);
    }
    ctx.restore();
  }
};

// ---------- speed lines ----------

const lastX: Partial<Record<BroKey, number>> = {};
const trails: Record<BroKey, { x: number; y: number; v: number }[]> = { red: [], blue: [] };

/** Streaks behind a bro moving fast (dashing in to strike or springing back), in their colour. */
export const drawSpeedLines = (ctx: CanvasRenderingContext2D, e: Engine, k: BroKey, groundY: number) => {
  const b = e.body[k];
  const v = b.x - (lastX[k] ?? b.x);
  lastX[k] = b.x;
  const trail = trails[k];
  if (Math.abs(v) > 6) trail.push({ x: b.x + 16, y: groundY + b.y, v });
  if (trail.length > 10 || (trail.length && Math.abs(v) <= 6)) trail.shift();
  if (!trail.length) return;
  const col = k === 'red' ? '255,90,110' : '90,170,255';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  trail.forEach((p, i) => {
    const a = (i + 1) / trail.length;
    ctx.strokeStyle = `rgba(${col},${0.35 * a})`;
    ctx.lineWidth = 3;
    for (const dy of [-62, -44, -26, -10]) {
      const len = Math.min(140, Math.abs(p.v) * 5) * a;
      ctx.beginPath(); ctx.moveTo(p.x - Math.sign(p.v) * 14, p.y + dy); ctx.lineTo(p.x - Math.sign(p.v) * (14 + len), p.y + dy); ctx.stroke();
    }
  });
  ctx.restore();
};
