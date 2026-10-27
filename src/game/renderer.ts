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
  drawRopes(ctx, e);
  drawWindupPips(ctx, e);
  drawEnemies(ctx, e);
  drawBro(ctx, e, 'blue');
  drawBro(ctx, e, 'red');
  drawTexts(ctx, e);
  ctx.restore();
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

const drawRopes = (ctx: CanvasRenderingContext2D, e: Engine) => {
  if (e.phase === 'ENEMY_TURN') return;
  const sw = Math.sin(e.ropeAngle) * 75;
  (['red', 'blue'] as BroKey[]).forEach((k) => {
    if (e.bros[k].hp <= 0) return;
    const b = e.body[k];
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = e.bros[k].color;
    ctx.shadowColor = e.bros[k].color;
    ctx.shadowBlur = 15;
    ctx.moveTo(b.x - 10, GROUND_Y - 10);
    ctx.quadraticCurveTo(b.x + 15, GROUND_Y - 10 + sw, b.x + 40, GROUND_Y - 10);
    ctx.stroke();
    ctx.restore();
  });
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
  ctx.save();
  ctx.translate(b.x, GROUND_Y + b.y - 70);
  if (bro.hp <= 0) { ctx.translate(20, 50); ctx.rotate(Math.PI / 2); ctx.translate(-20, -50); }
  ctx.fillStyle = bro.color;
  ctx.shadowColor = bro.color;
  ctx.shadowBlur = 25;
  ctx.fillRect(0, 0, 32, 68);
  ctx.shadowBlur = 0;
  ctx.fillStyle = bro.hp > 0 ? '#fff' : '#222';
  ctx.fillRect(4, 18, 24, 10);
  ctx.restore();
};

const drawTexts = (ctx: CanvasRenderingContext2D, e: Engine) => {
  for (const t of e.floatingTexts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, t.life);
    ctx.fillStyle = t.color;
    ctx.shadowColor = t.color;
    ctx.shadowBlur = 15;
    ctx.font = `900 ${30 * t.scale}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  }
};
