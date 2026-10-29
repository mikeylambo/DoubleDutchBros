import { MOVE_REGISTRY } from '../data/config';
import type { Engine } from './engine';
import { DISPLAY_FONT } from './sprites';
import type { View } from './view';

// Camera direction for skills and ultimates: while a special move winds up and lands, the camera
// pushes in and tilts, letterbox bars slide in, and the move's name sweeps across the screen.
// Reduced motion keeps the bars and the banner and drops the push-in and the tilt.

const SCENE_PHASES = new Set(['WINDUP', 'LAUNCH', 'IMPACT']);
let amount = 0;          // 0..1, eased toward the target each frame
let lastPhase = '';
let banner: { name: string; color: string; t0: number } | null = null;

const special = (e: Engine) => e.moveType !== 'BASIC';

/** Ease the cinematic state and report the extra camera move for this frame. */
export const updateCinema = (e: Engine, motion: number) => {
  const on = special(e) && SCENE_PHASES.has(e.phase);
  amount += ((on ? 1 : 0) - amount) * (on ? 0.12 : 0.08);
  // Ults skip the wind-up and launch straight away, so the banner keys on entering the sequence at all.
  if (on && !SCENE_PHASES.has(lastPhase)) {
    const ult = e.moveType === 'ULT';
    banner = {
      name: MOVE_REGISTRY[e.moveType].name.toUpperCase(),
      color: ult ? '#facc15' : e.turn === 'RED' ? '#fb7185' : '#60a5fa',
      t0: performance.now()
    };
  }
  lastPhase = e.phase;
  const ult = e.moveType === 'ULT';
  return {
    zoom: 1 + amount * motion * (ult ? 0.22 : 0.1),
    tilt: -amount * motion * (ult ? 0.05 : 0.025),
  };
};

/** Letterbox bars and the move-name banner, in screen space over everything. */
export const drawCinemaOverlay = (ctx: CanvasRenderingContext2D, v: View) => {
  const bar = amount * Math.min(90, v.h * 0.09);
  if (bar > 0.5) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, v.w, bar);
    ctx.fillRect(0, v.h - bar, v.w, bar);
  }
  if (!banner) return;
  const t = (performance.now() - banner.t0) / 1100;
  if (t > 1) { banner = null; return; }
  // Slam in from the right, hold, then streak off to the left.
  const x = t < 0.18 ? v.w * (1 - t / 0.18) * 0.6 : t > 0.8 ? -v.w * Math.pow((t - 0.8) / 0.2, 2) : 0;
  const size = Math.min(72, v.w * 0.09);
  const y = v.h * 0.32;
  ctx.save();
  ctx.translate(v.w / 2 + x, y);
  ctx.transform(1, 0, -0.2, 1, 0, 0); // italic shear for the stripe
  ctx.globalAlpha = Math.min(1, (1 - t) * 4);
  ctx.fillStyle = 'rgba(5, 3, 15, 0.82)';
  ctx.fillRect(-v.w, -size * 0.75, v.w * 2, size * 1.5);
  ctx.fillStyle = banner.color;
  ctx.fillRect(-v.w, -size * 0.75, v.w * 2, 3);
  ctx.fillRect(-v.w, size * 0.75 - 3, v.w * 2, 3);
  ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([1, 0, 0.2, 1, 0, 0])));
  ctx.font = `italic 900 ${size}px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = banner.color; ctx.shadowBlur = 24;
  ctx.fillStyle = '#fff';
  ctx.fillText(banner.name, 0, 2);
  ctx.restore();
};
