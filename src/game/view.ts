import { GROUND_Y } from '../data/config';

// Maps the fixed gameplay world onto any screen shape. Gameplay coordinates never change;
// only how much sky and floor surround them does. Portrait phones get a tall sky and a deep
// court for the menu to sit on, landscape gets wider skyline.

/** World span that must always be visible. */
const VIEW_W = 720;
const VIEW_ABOVE = 260; // world units above the ground line (bat dives, damage text)
const VIEW_BELOW = 45;
const CENTER_X = 400;

export interface View { w: number; h: number; scale: number; groundY: number }

/**
 * The court below the ground line always keeps room for the floating action bar, so the menu
 * never covers the fight; the world scales down to fit what's left. Spare height becomes sky.
 * `top` and `bottom` are screen bands covered by overlaid HUD and pads: the scene still paints
 * under them, but the action stays clear of them.
 */
export const computeView = (w: number, h: number, top = 0, bottom = 0): View => {
  const reserve = Math.min(150, Math.max(110, (h - top - bottom) * 0.25));
  // The HUD is thin, translucent bars: the sky above the fighters may run under most of it.
  const scale = Math.max(0.1, Math.min(w / VIEW_W, (h - top * 0.35 - bottom - reserve) / VIEW_ABOVE));
  const floor = Math.max(reserve, VIEW_BELOW * scale);
  return { w, h, scale, groundY: h - bottom - floor };
};

/** Screen (CSS px) → world transform, applied before drawing world-space content. */
export const applyView = (ctx: CanvasRenderingContext2D, v: View) => {
  ctx.translate(v.w / 2, v.groundY);
  ctx.scale(v.scale, v.scale);
  ctx.translate(-CENTER_X, -GROUND_Y);
};

export const screenToWorldX = (px: number, v: View) => (px - v.w / 2) / v.scale + CENTER_X;
