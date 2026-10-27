import { CANVAS_WIDTH, GROUND_Y, HOME_X, MOVE_REGISTRY, type BroKey } from '../data/config';
import { perfectThreshold } from './combat';
import type { Engine } from './engine';
import { calculateDerived } from './stats';
import { Animator, CONTACT_FRAME, ENEMY_CLIPS, RABBIT_CLIPS, SPRITE_ID, airProgress, enemySpriteId, frameIndex, rabbitClip, sprites, type EnemyClip } from './anim';
import { BACKDROP_RES, CLIP_POSE, RABBITS, drawEnemyShape, drawRabbit, drawShadow, getBackdrop } from './sprites';
import type { Enemy } from './types';
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
  // A tiny camera push on every bar's downbeat keeps the whole frame breathing with the music.
  const bar = ((e.beat % 4) + 4) % 4 < 1 ? pulse(e.beat) : 0;
  const zoom = e.camera.zoom * (1 + 0.012 * bar);
  ctx.translate(v.w / 2 + sx, cy + sy);
  ctx.scale(zoom, zoom);
  ctx.translate(-v.w / 2, -cy);
  applyView(ctx, v);

  drawStage(ctx);
  drawBeatWorld(ctx, e);
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

/** 1 exactly on a beat, decaying to 0 before the next. */
const pulse = (beat: number) => Math.pow(1 - (beat - Math.floor(beat)), 3);

/** Lights that live on the beat, layered over the static backdrop. */
const drawBeatWorld = (ctx: CanvasRenderingContext2D, e: Engine) => {
  const p = pulse(e.beat);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Moon halo swells on each beat.
  const halo = ctx.createRadialGradient(620, 90, 20, 620, 90, 140);
  halo.addColorStop(0, `rgba(244, 114, 182, ${0.25 * p})`);
  halo.addColorStop(1, 'rgba(244, 114, 182, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(480, -50, 280, 280);
  // Neon sign flares.
  ctx.font = 'italic 900 22px system-ui, sans-serif';
  ctx.fillStyle = `rgba(244, 114, 182, ${0.6 * p})`;
  ctx.shadowColor = '#f472b6';
  ctx.shadowBlur = 30 * p;
  ctx.fillText('HOP & SKIP', 70, GROUND_Y - 120);
  // A light pulse runs along the court line.
  ctx.shadowBlur = 0;
  const line = ctx.createLinearGradient(-400, 0, 1200, 0);
  line.addColorStop(0, 'rgba(0, 210, 255, 0)');
  line.addColorStop(0.5, `rgba(0, 210, 255, ${0.7 * p})`);
  line.addColorStop(1, 'rgba(0, 210, 255, 0)');
  ctx.fillStyle = line;
  ctx.fillRect(-400, GROUND_Y - 2, 1600, 4);
  ctx.restore();
};

const drawShadows = (ctx: CanvasRenderingContext2D, e: Engine) => {
  (['red', 'blue'] as BroKey[]).forEach((k) => drawShadow(ctx, e.body[k].x + 16, -e.body[k].y, 18));
  e.enemies.forEach((en) => { if (en.hp > 0) drawShadow(ctx, en.x + 20 * en.scale, -en.y, 20 * en.scale); });
};

const drawHazards = (ctx: CanvasRenderingContext2D, e: Engine) => {
  if (e.phase !== 'ENEMY_TURN') return;
  for (const h of e.hazards) {
    if (e.beat < h.warn) continue;
    ctx.save();
    if (h.x + h.w < 0) {
      // Telegraph: the lane flashes on every beat until the hit comes into view.
      ctx.globalAlpha = 0.08 + 0.3 * pulse(e.beat);
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
  const threshold = Math.min(0.95, perfectThreshold(calculateDerived(e.bros[k]).rhythm) + e.tightness);
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
  const threshold = Math.min(0.95, perfectThreshold(calculateDerived(e.bros[k]).rhythm) + e.tightness);
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

const enemyAnimators = new Map<number, Animator>();
const rabbitAnimators: Record<BroKey, Animator> = { red: new Animator(), blue: new Animator() };

const enemyClip = (e: Engine, en: Enemy): EnemyClip => {
  if (en.hp <= 0) return 'defeat';
  if (en.hurt > 0) return 'hurt';
  if (e.phase === 'ENEMY_TURN' && e.currentEnemyId === en.id) {
    return e.hazards.some((h) => h.x + h.w >= 0) ? 'attack' : 'telegraph';
  }
  return 'idle';
};

/**
 * Draws a sprite frame with its pivot at the current origin (feet center). Returns false when the
 * clip has no art yet, so the caller can fall back to procedural drawing.
 */
const drawSprite = (ctx: CanvasRenderingContext2D, char: string, clip: string, spec: typeof RABBIT_CLIPS[keyof typeof RABBIT_CLIPS], anim: Animator, now: number, beat: number, air: number) => {
  const s = sprites.get(char, clip);
  if (!s) return false;
  const f = frameIndex(spec, s.frames, s.fps, anim.elapsed(now), { now, beat, airProgress: air });
  const [cw, ch] = s.cell;
  ctx.drawImage(s.img, f * cw, 0, cw, ch, -s.pivot[0] / s.scale, -s.pivot[1] / s.scale, cw / s.scale, ch / s.scale);
  return true;
};

const drawEnemies = (ctx: CanvasRenderingContext2D, e: Engine) => {
  const now = performance.now() / 1000;
  const live = new Set<number>();
  e.enemies.forEach((en, i) => {
    live.add(en.id);
    if (en.hp <= 0 && e.phase !== 'IMPACT' && e.phase !== 'LAUNCH') return;
    let anim = enemyAnimators.get(en.id);
    if (!anim) { anim = new Animator(); enemyAnimators.set(en.id, anim); }
    const clip = enemyClip(e, en);
    anim.set(clip, now);
    // Ground enemies hop on the beat; flyers bob.
    const bob = en.hp > 0 ? -pulse(e.beat + i * 0.25) * (en.float < 0 ? 6 : 3) : 0;
    ctx.save();
    ctx.translate(en.x + 20 * en.scale, GROUND_Y + en.y + bob);
    ctx.globalAlpha = en.hp > 0 ? 1 : 0.3;
    ctx.scale(en.scale, en.scale);
    if (!drawSprite(ctx, enemySpriteId(en.type), clip, ENEMY_CLIPS[clip], anim, now, e.beat, 0)) {
      ctx.save();
      ctx.translate(-20, -70);
      drawEnemyShape(ctx, en.type, en.color, e.beat + i * 0.25, en.hurt > 0);
      ctx.restore();
    }
    ctx.translate(-20, -70);
    ctx.globalAlpha = 1;
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
  for (const id of enemyAnimators.keys()) if (!live.has(id)) enemyAnimators.delete(id);
};

const drawBro = (ctx: CanvasRenderingContext2D, e: Engine, k: BroKey) => {
  const b = e.body[k];
  const now = performance.now() / 1000;
  const anim = rabbitAnimators[k];
  const clip = rabbitClip(e, k, anim.clip);
  const strike = clip === 'attack' || clip === 'tag';
  anim.set(clip, now, strike ? CONTACT_FRAME / (sprites.get(SPRITE_ID[k], clip)?.fps ?? 24) : 0);
  ctx.save();
  ctx.translate(b.x + 16, GROUND_Y + b.y);
  const air = b.jumping ? airProgress(b.vy, b.launchVy) : 0;
  if (!drawSprite(ctx, SPRITE_ID[k], clip, RABBIT_CLIPS[clip], anim, now, e.beat, air)) {
    drawRabbit(ctx, RABBITS[k], {
      vy: b.vy, squash: b.squash ?? 0, airborne: b.jumping, down: e.bros[k].hp <= 0,
      t: now, seed: k === 'red' ? 0 : 1.7, beat: e.beat, ...CLIP_POSE[clip]
    });
  }
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
