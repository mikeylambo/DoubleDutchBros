import { GROUND_Y } from '../data/config';

// Maps the fixed gameplay world onto any screen shape. Gameplay coordinates never change;
// only how much sky and floor surround them does. Portrait phones get a tall sky and a deep
// court for the menu to sit on, landscape gets wider skyline.

/** World span that must always be visible. */
const VIEW_W = 720;
const VIEW_ABOVE = 300; // world units above the ground line (bat dives, damage text)
const VIEW_BELOW = 45;
const CENTER_X = 400;

export interface View { w: number; h: number; scale: number; groundY: number }

/**
 * The court below the ground line always keeps room for the floating action bar, so the menu
 * never covers the fight; the world scales down to fit what's left. Spare height becomes sky.
 */
export const computeView = (w: number, h: number): View => {
  const reserve = Math.min(180, Math.max(120, h * 0.3));
  const scale = Math.max(0.1, Math.min(w / VIEW_W, (h - reserve) / VIEW_ABOVE));
  const floor = Math.max(reserve, VIEW_BELOW * scale);
  return { w, h, scale, groundY: h - floor };
};

/** Screen (CSS px) → world transform, applied before drawing world-space content. */
export const applyView = (ctx: CanvasRenderingContext2D, v: View) => {
  ctx.translate(v.w / 2, v.groundY);
  ctx.scale(v.scale, v.scale);
  ctx.translate(-CENTER_X, -GROUND_Y);
};

export const screenToWorldX = (px: number, v: View) => (px - v.w / 2) / v.scale + CENTER_X;
