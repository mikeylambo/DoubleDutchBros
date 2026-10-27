import { CANVAS_WIDTH, GROUND_Y, HOME_X, MOVE_REGISTRY, type BroKey } from '../data/config';
import { perfectThreshold } from './combat';
import type { Engine } from './engine';
import { calculateDerived } from './stats';
import { BACKDROP_RES, RABBITS, drawEnemyShape, drawRabbit, drawShadow, getBackdrop } from './sprites';
import type { Body } from './types';
import { applyView, type View } from './view';

/** Draws the current engine state. Read-only: never mutates the sim. */
export const draw = (ctx: CanvasRenderingContext2D, e: Engine, v: View, dpr: number) => {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Sky above and court below the pre-rendered backdrop, for tall or wide screens.
  ctx.fillStyle = '#05030f';
  ctx.fillRect(0, 0, v.w, v.h);
  ctx.fillStyle = '#020206';
  ctx.fillRect(0, v.groundY, v.w, v.h - v.groundY);
  drawStars(ctx, v);

  ctx.save();
  // Camera shake and punch-zoom happen around the action, in screen space.
  const sx = (Math.random() - 0.5) * e.camera.shake * v.scale;
  const sy = (Math.random() - 0.5) * e.camera.shake * v.scale;
  const cy = v.groundY - 120 * v.scale;
  ctx.translate(v.w / 2 + sx, cy + sy);
  ctx.scale(e.camera.zoom, e.camera.zoom);
  ctx.translate(-v.w / 2, -cy);
  applyView(ctx, v);

  drawStage(ctx);
  drawShadows(ctx, e);
  drawHazards(ctx, e);
  drawPerfectZone(ctx, e);
  drawRopes(ctx, e, 'back');
  drawWindupPips(ctx, e);
  drawEnemies(ctx, e);
  drawBro(ctx, e, 'blue');
  drawBro(ctx, e, 'red');
  drawRopes(ctx, e, 'front');
  drawParticles(ctx, e);
  drawTexts(ctx, e);
  ctx.restore();
  drawFlash(ctx, e, v);
};

/** Twinkling stars in the open sky above the skyline (most visible on tall portrait screens). */
const drawStars = (ctx: CanvasRenderingContext2D, v: View) => {
  const t = performance.now() / 1000;
  const skyBottom = v.groundY - 280 * v.scale;
  if (skyBottom <= 0) return;
  ctx.save();
  for (let i = 0; i < 90; i++) {
    // Deterministic positions from a hash so stars don't jump between frames.
    const hx = Math.sin(i * 127.1) * 43758.5453, hy = Math.sin(i * 311.7) * 43758.5453;
    const x = (hx - Math.floor(hx)) * v.w;
    const y = (hy - Math.floor(hy)) * skyBottom;
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.6 + (i % 7) * 0.2) + i));
    ctx.globalAlpha = tw * (0.4 + 0.6 * (1 - y / skyBottom));
    ctx.fillStyle = i % 9 === 0 ? '#f9a8d4' : i % 5 === 0 ? '#a5f3fc' : '#ffffff';
    const r = i % 11 === 0 ? 1.6 : 0.9;
    ctx.fillRect(x, y, r, r);
  }
  ctx.restore();
};

const drawStage = (ctx: CanvasRenderingContext2D) => {
  const img = getBackdrop();
  ctx.drawImage(img, -400, -100, img.width / BACKDROP_RES, img.height / BACKDROP_RES);
};

const drawShadows = (ctx: CanvasRenderingContext2D, e: Engine) => {
  (['red', 'blue'] as BroKey[]).forEach((k) => drawShadow(ctx, e.body[k].x + 16, -e.body[k].y, 18));
  e.enemies.forEach((en) => { if (en.hp > 0) drawShadow(ctx, en.x + 20 * en.scale, -en.y, 20 * en.scale); });
};

const drawHazards = (ctx: CanvasRenderingContext2D, e: Engine) => {
  if (e.phase !== 'ENEMY_TURN') return;
  for (const h of e.hazards) {
    ctx.save();
    if (h.delay > 0) {
      // Telegraph: a pulsing lane marker showing where the hit will travel.
      ctx.globalAlpha = 0.15 + 0.15 * Math.sin(h.delay * 0.4);
      ctx.fillStyle = h.fake ? '#f59e0b' : '#ef4444';
      ctx.fillRect(0, h.y, CANVAS_WIDTH, h.h);
      ctx.restore();
      continue;
    }
    if (h.fake) {
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.strokeRect(h.x, h.y, h.w, h.h);
    } else {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 15;
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(h.x, h.y, h.w, h.h);
    }
    ctx.restore();
  }
};

const ROPE_CENTER = GROUND_Y - 45; // midpoint of the swing: halfway between overhead and the feet
const ROPE_AMP = 50;
const HAND_Y = GROUND_Y - 35;

/**
 * Two ropes turning in opposite phase — actual double dutch. At every beat peak one rope is
 * sweeping under the feet, so "jump when a rope hits the floor" is literally the timing rule.
 * The half of the swing above the waist draws behind the bro, the lower half in front.
 */
const drawRopes = (ctx: CanvasRenderingContext2D, e: Engine, layer: 'back' | 'front') => {
  if (e.phase === 'ENEMY_TURN') return;
  const s = Math.sin(e.ropeAngle);
  (['red', 'blue'] as BroKey[]).forEach((k) => {
    if (e.bros[k].hp <= 0) return;
    // Anchored at home: the rope is held by the turners, the bro leaps out of it to attack.
    const b = { x: HOME_X[k] };
    [s, -s].forEach((phase, i) => {
      const mid = ROPE_CENTER + ROPE_AMP * phase;
      if ((mid > ROPE_CENTER) !== (layer === 'front')) return;
      ctx.save();
      ctx.globalAlpha = i === 0 ? 1 : 0.65;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = e.bros[k].color;
      ctx.shadowColor = e.bros[k].color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(b.x - 28, HAND_Y);
      ctx.quadraticCurveTo(b.x + 16, 2 * mid - HAND_Y, b.x + 60, HAND_Y);
      ctx.stroke();
      ctx.restore();
    });
  });
};

/** Floor glow under the acting bro while the rope is inside the perfect window. */
const drawPerfectZone = (ctx: CanvasRenderingContext2D, e: Engine) => {
  if (e.phase !== 'WINDUP') return;
  const k: BroKey = e.turn === 'RED' ? 'red' : 'blue';
  const threshold = perfectThreshold(calculateDerived(e.bros[k]).rhythm);
  const s = Math.abs(Math.sin(e.ropeAngle));
  if (s <= threshold) return;
  const b = e.body[k];
  ctx.save();
  ctx.globalAlpha = (s - threshold) / (1 - threshold);
  const g = ctx.createRadialGradient(b.x + 16, GROUND_Y, 0, b.x + 16, GROUND_Y, 60);
  g.addColorStop(0, 'rgba(250, 204, 21, 0.8)');
  g.addColorStop(1, 'rgba(250, 204, 21, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(b.x - 44, GROUND_Y - 20, 120, 40);
  ctx.restore();
};

const drawWindupPips = (ctx: CanvasRenderingContext2D, e: Engine) => {
  if (e.phase !== 'WINDUP') return;
  const k: BroKey = e.turn === 'RED' ? 'red' : 'blue';
  const b = e.body[k];
  const threshold = perfectThreshold(calculateDerived(e.bros[k]).rhythm);
  const limit = MOVE_REGISTRY[e.moveType].limit?.(e.turn) ?? 3;
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 8;
  for (let i = 0; i < limit; i++) {
    ctx.globalAlpha = i < e.windup ? 1 : 0.25;
    ctx.fillRect(b.x + 16 + i * 14 - limit * 7, GROUND_Y + b.y - 120, 10, 10);
  }
  // Timing ring: fills as the rope approaches the perfect zone.
  const s = Math.abs(Math.sin(e.ropeAngle));
  ctx.globalAlpha = 0.9;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = s > threshold ? '#facc15' : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(b.x + 16, GROUND_Y + b.y - 150, 6 + s * 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

const drawEnemies = (ctx: CanvasRenderingContext2D, e: Engine) => {
  const t = performance.now() / 1000;
  e.enemies.forEach((en, i) => {
    if (en.hp <= 0 && e.phase !== 'IMPACT' && e.phase !== 'LAUNCH') return;
    ctx.save();
    ctx.translate(en.x, GROUND_Y + en.y - 70 * en.scale);
    ctx.scale(en.scale, en.scale);
    ctx.globalAlpha = en.hp > 0 ? 1 : 0.3;
    drawEnemyShape(ctx, en.type, en.color, t + i, en.hurt > 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 12, 40, 5);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(0, 12, (en.hp / en.maxHp) * 40, 5);
    if (e.phase === 'TARGET' && i === e.targetIdx && en.hp > 0) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / en.scale;
      ctx.setLineDash([6 / en.scale, 4 / en.scale]);
      ctx.strokeRect(-10, 4, 60, 72);
    }
    if (e.currentEnemyId === en.id) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(26, 0); ctx.lineTo(20, 8); ctx.fill();
    }
    ctx.restore();
  });
};

const drawBro = (ctx: CanvasRenderingContext2D, e: Engine, k: BroKey) => {
  const b: Body = e.body[k];
  ctx.save();
  ctx.translate(b.x + 16, GROUND_Y + b.y);
  drawRabbit(ctx, RABBITS[k], {
    vy: b.vy, squash: b.squash ?? 0, airborne: b.jumping, down: e.bros[k].hp <= 0,
    t: performance.now() / 1000, seed: k === 'red' ? 0 : 1.7
  });
  ctx.restore();
};

const drawParticles = (ctx: CanvasRenderingContext2D, e: Engine) => {
  ctx.save();
  for (const p of e.particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.restore();
};

const drawFlash = (ctx: CanvasRenderingContext2D, e: Engine, v: View) => {
  if (e.flash < 0.02) return;
  ctx.save();
  ctx.globalAlpha = e.flash * 0.6;
  ctx.fillStyle = e.flashColor;
  ctx.fillRect(0, 0, v.w, v.h);
  ctx.restore();
};

const drawTexts = (ctx: CanvasRenderingContext2D, e: Engine) => {
  for (const t of e.floatingTexts) {
    // Pop in: start 50% larger and settle within the first ~5 frames.
    const pop = 1 + Math.max(0, t.life - 0.9) * 5;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, t.life * 1.5));
    ctx.fillStyle = t.color;
    ctx.shadowColor = t.color;
    ctx.shadowBlur = 15;
    ctx.font = `900 ${30 * t.scale * pop}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  }
};
