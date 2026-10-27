import { CANVAS_HEIGHT, CANVAS_WIDTH, GROUND_Y, MOVE_REGISTRY, type BroKey } from '../data/config';
import { perfectThreshold } from './combat';
import type { Engine } from './engine';
import { calculateDerived } from './stats';
import type { Body } from './types';

/** Draws the current engine state. Read-only: never mutates the sim. */
export const draw = (ctx: CanvasRenderingContext2D, e: Engine) => {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.save();
  const sx = (Math.random() - 0.5) * e.camera.shake;
  const sy = (Math.random() - 0.5) * e.camera.shake;
  ctx.translate(CANVAS_WIDTH / 2 + sx, CANVAS_HEIGHT / 2 + sy);
  ctx.scale(e.camera.zoom, e.camera.zoom);
  ctx.translate(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2);

  drawStage(ctx);
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
  drawFlash(ctx, e);
};

const drawStage = (ctx: CanvasRenderingContext2D) => {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, '#020208');
  sky.addColorStop(1, '#0e0e24');
  ctx.fillStyle = sky;
  ctx.fillRect(-1000, -1000, 3000, 3000);

  ctx.save();
  ctx.strokeStyle = '#00d2ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#00d2ff';
  ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(-500, GROUND_Y); ctx.lineTo(1500, GROUND_Y); ctx.stroke();
  ctx.restore();

  const floor = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_HEIGHT);
  floor.addColorStop(0, '#0c0c20');
  floor.addColorStop(1, '#020206');
  ctx.fillStyle = floor;
  ctx.fillRect(-500, GROUND_Y + 1, 2000, 300);

  ctx.strokeStyle = '#1e1b4b';
  ctx.lineWidth = 1;
  for (let i = 1; i < 15; i++) {
    ctx.beginPath(); ctx.moveTo(-500, GROUND_Y + i * 18); ctx.lineTo(1500, GROUND_Y + i * 18); ctx.stroke();
  }
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
    const b = e.body[k];
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
  e.enemies.forEach((en, i) => {
    if (en.hp <= 0 && e.phase !== 'IMPACT' && e.phase !== 'LAUNCH') return;
    ctx.save();
    ctx.translate(en.x, GROUND_Y + en.y - 70);
    ctx.scale(en.scale, en.scale);
    ctx.globalAlpha = en.hp > 0 ? 1 : 0.3;
    ctx.fillStyle = en.color;
    ctx.shadowColor = en.color;
    ctx.shadowBlur = e.currentEnemyId === en.id ? 35 : 20;
    ctx.beginPath();
    ctx.moveTo(0, 70);
    ctx.quadraticCurveTo(20, -20 + Math.sin(e.ropeAngle * 3.5) * 12, 40, 70);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, -15, 40, 6);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(0, -15, (en.hp / en.maxHp) * 40, 6);
    if (e.phase === 'TARGET' && i === e.targetIdx && en.hp > 0) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / en.scale;
      ctx.strokeRect(-6, -24, 52, 100);
    }
    ctx.restore();
  });
};

const drawBro = (ctx: CanvasRenderingContext2D, e: Engine, k: BroKey) => {
  const b: Body = e.body[k];
  const bro = e.bros[k];
  const partner = e.bros[k === 'red' ? 'blue' : 'red'];
  // Squash on landing / stretch on takeoff, anchored at the feet.
  const sq = b.squash ?? 0;
  const air = b.jumping ? Math.min(0.12, Math.abs(b.vy) / 60) : 0;
  const sx = 1 + 0.25 * sq - air, sy = 1 - 0.25 * sq + air;
  ctx.save();
  ctx.translate(b.x + 16, GROUND_Y + b.y);
  if (bro.hp <= 0) { ctx.translate(4, -20); ctx.rotate(Math.PI / 2); }
  ctx.scale(sx, sy);
  ctx.translate(-16, -68);
  ctx.fillStyle = bro.color;
  ctx.shadowColor = bro.color;
  ctx.shadowBlur = 25;
  ctx.fillRect(0, 0, 32, 68);
  ctx.shadowBlur = 0;
  // Headband in the partner's color: the team reads as a unit.
  ctx.fillStyle = partner.color;
  ctx.fillRect(0, 8, 32, 5);
  // Visor eyes, facing the enemies (left).
  ctx.fillStyle = bro.hp > 0 ? '#fff' : '#222';
  ctx.fillRect(2, 18, 22, 8);
  if (bro.hp > 0) { ctx.fillStyle = '#020208'; ctx.fillRect(5, 20, 4, 4); ctx.fillRect(14, 20, 4, 4); }
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

const drawFlash = (ctx: CanvasRenderingContext2D, e: Engine) => {
  if (e.flash < 0.02) return;
  ctx.save();
  ctx.globalAlpha = e.flash * 0.6;
  ctx.fillStyle = e.flashColor;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
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
