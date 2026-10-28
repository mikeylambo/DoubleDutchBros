import { CANVAS_WIDTH, GROUND_Y, type BroKey } from '../data/config';
import type { Engine } from './engine';
import { Animator, CONTACT_FRAME, ENEMY_CLIPS, RABBIT_CLIPS, SPRITE_ID, airProgress, enemySpriteId, frameIndex, rabbitClip, sprites, type EnemyClip } from './anim';
import { BACKDROP_RES, CLIP_POSE, DISPLAY_FONT, RABBITS, SIGN, drawAffix, drawEnemyShape, drawRabbit, drawShadow, getBackdrop } from './sprites';
import type { Enemy } from './types';
import { AFFIXES } from './encounters';
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
  // Accessibility: shake and camera motion scale with the player's settings.
  const motion = e.settings.reducedMotion ? 0 : 1;
  const shake = e.camera.shake * e.settings.screenShake * motion;
  const sx = (Math.random() - 0.5) * shake * v.scale;
  const sy = (Math.random() - 0.5) * shake * v.scale;
  const cy = v.groundY - 120 * v.scale;
  // A tiny camera push on every bar's downbeat keeps the whole frame breathing with the music.
  const bar = ((e.beat % 4) + 4) % 4 < 1 ? pulse(e.beat) : 0;
  const zoom = 1 + ((e.camera.zoom - 1) + 0.012 * bar) * motion;
  ctx.translate(v.w / 2 + sx, cy + sy);
  ctx.scale(zoom, zoom);
  ctx.translate(-v.w / 2, -cy);
  applyView(ctx, v);

  drawStage(ctx);
  drawBeatWorld(ctx, e);
  drawReflections(ctx, e);
  drawRimLights(ctx, e);
  drawShadows(ctx, e);
  drawHazards(ctx, e);
  drawPerfectZone(ctx, e);
  drawRopes(ctx, e, 'back');
  drawWindupPips(ctx, e);
  drawEnemies(ctx, e);
  drawBro(ctx, e, 'blue');
  drawBro(ctx, e, 'red');
  drawRopes(ctx, e, 'front');
  drawHeat(ctx, e);
  drawParticles(ctx, e);
  drawTexts(ctx, e);
  ctx.restore();
  drawFlash(ctx, e, v);
  drawPost(ctx, e, v);
};

/** The wet court mirrors the fighters, faintly. */
const drawReflections = (ctx: CanvasRenderingContext2D, e: Engine) => {
  ctx.save();
  ctx.beginPath(); ctx.rect(-400, GROUND_Y, CANVAS_WIDTH + 800, 200); ctx.clip();
  ctx.translate(0, GROUND_Y * 2);
  ctx.scale(1, -1);
  ctx.globalAlpha = 0.16;
  drawEnemies(ctx, e, true);
  drawBro(ctx, e, 'blue');
  drawBro(ctx, e, 'red');
  ctx.restore();
};

/** Each bro carries a pool of their own color: the rim light the art spec asks for. */
const drawRimLights = (ctx: CanvasRenderingContext2D, e: Engine) => {
  const p = pulse(e.beat);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  (['red', 'blue'] as BroKey[]).forEach((k) => {
    if (e.bros[k].hp <= 0) return;
    const b = e.body[k];
    const x = b.x + 16, y = GROUND_Y + b.y - 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 90);
    const rgb = k === 'red' ? '239, 68, 68' : '59, 130, 246';
    g.addColorStop(0, `rgba(${rgb}, ${0.2 + 0.08 * p})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - 90, y - 90, 180, 180);
    // Light spill on the floor.
    const f = ctx.createRadialGradient(x, GROUND_Y, 0, x, GROUND_Y, 70);
    f.addColorStop(0, `rgba(${rgb}, ${0.22 + 0.1 * p})`);
    f.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.save(); ctx.translate(x, GROUND_Y); ctx.scale(1, 0.18); ctx.translate(-x, -GROUND_Y);
    ctx.fillStyle = f; ctx.fillRect(x - 70, GROUND_Y - 70, 140, 140);
    ctx.restore();
  });
  ctx.restore();
};

// Post: vignette (cached per screen size) and film grain (a pre-made noise tile, shifted per frame).
let vignette: { w: number; h: number; c: HTMLCanvasElement } | null = null;
let grain: CanvasPattern | null = null;
const drawPost = (ctx: CanvasRenderingContext2D, e: Engine, v: View) => {
  if (!vignette || vignette.w !== v.w || vignette.h !== v.h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(v.w / 2)); c.height = Math.max(1, Math.round(v.h / 2));
    const g = c.getContext('2d')!;
    const r = Math.hypot(c.width, c.height) / 2;
    const grad = g.createRadialGradient(c.width / 2, c.height * 0.55, r * 0.35, c.width / 2, c.height * 0.55, r * 1.05);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(2,1,10,0.75)');
    g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
    vignette = { w: v.w, h: v.h, c };
  }
  ctx.drawImage(vignette.c, 0, 0, v.w, v.h);
  if (!grain) {
    const n = document.createElement('canvas');
    n.width = n.height = 128;
    const g = n.getContext('2d')!;
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const val = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = val;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grain = ctx.createPattern(n, 'repeat');
  }
  if (!grain) return;
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.globalCompositeOperation = 'overlay';
  const still = e.settings.reducedMotion;
  ctx.translate(still ? 0 : Math.floor(Math.random() * 128), still ? 0 : Math.floor(Math.random() * 128));
  ctx.fillStyle = grain;
  ctx.fillRect(-128, -128, v.w + 256, v.h + 256);
  ctx.restore();
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
  // Neon sign: the lettering is live (never baked), so the steady tube and its flare share one glyph run.
  ctx.font = `italic 900 22px ${DISPLAY_FONT}`;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#f472b6';
  ctx.shadowColor = '#f472b6';
  ctx.shadowBlur = 20;
  ctx.fillText(SIGN.text, SIGN.x, SIGN.y);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255, 245, 251, 0.85)';
  ctx.fillText(SIGN.text, SIGN.x, SIGN.y);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(244, 114, 182, ${0.6 * p})`;
  ctx.shadowColor = '#f472b6';
  ctx.shadowBlur = 30 * p;
  ctx.fillText(SIGN.text, SIGN.x, SIGN.y);
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
    const color = h.fake ? '#f59e0b' : '#ef4444';
    if (h.kind === 'shock') {
      // Ground shockwave: the air above the court pulses as a warning; on its beat a ring bursts out.
      const until = h.arrive - e.beat;
      if (until > 0) {
        ctx.globalAlpha = 0.06 + 0.22 * pulse(e.beat) * (until < 1 ? 2 : 1);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(0, h.y, CANVAS_WIDTH, h.h);
        // Downward chevrons: "stay down".
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 3;
        for (let x = 120; x < CANVAS_WIDTH; x += 160) {
          ctx.beginPath(); ctx.moveTo(x - 12, h.y + 30); ctx.lineTo(x, h.y + 42); ctx.lineTo(x + 12, h.y + 30); ctx.stroke();
        }
      } else if (until > -0.5) {
        const t = -until / 0.5;
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 6 * (1 - t) + 1;
        ctx.beginPath(); ctx.ellipse(CANVAS_WIDTH / 2, GROUND_Y, 80 + t * 500, 10 + t * 40, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    const offscreen = h.dir === 1 ? h.x + h.w < 0 : h.x > CANVAS_WIDTH;
    if (offscreen) {
      // Telegraph: the lane flashes on every beat until the hit comes into view; an arrow shows the side.
      ctx.globalAlpha = 0.08 + 0.3 * pulse(e.beat);
      ctx.fillStyle = color;
      ctx.fillRect(0, h.y, CANVAS_WIDTH, h.h);
      ctx.globalAlpha = 0.4 + 0.5 * pulse(e.beat);
      const ax = h.dir === 1 ? 20 : CANVAS_WIDTH - 20, cy = h.y + h.h / 2;
      ctx.beginPath(); ctx.moveTo(ax, cy - 10); ctx.lineTo(ax + 14 * h.dir, cy); ctx.lineTo(ax, cy + 10); ctx.closePath(); ctx.fill();
      ctx.restore();
      continue;
    }
    if (h.fake) {
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(h.x, h.y, h.w, h.h);
    } else {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(h.x, h.y, h.w, h.h);
    }
    ctx.restore();
  }
};

/** Hop's Heat: small flames over Hop's head, one per stack. */
const drawHeat = (ctx: CanvasRenderingContext2D, e: Engine) => {
  if (e.heat <= 0 || e.bros.red.hp <= 0) return;
  const b = e.body.red;
  const p = pulse(e.beat);
  ctx.save();
  for (let i = 0; i < e.heat; i++) {
    const x = b.x + 16 + (i - (e.heat - 1) / 2) * 11;
    const y = GROUND_Y + b.y - 128 - p * 3;
    ctx.fillStyle = i === e.heat - 1 ? '#fde047' : '#fb923c';
    ctx.shadowColor = '#fb923c';
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.quadraticCurveTo(x + 6, y - 1, x, y + 4); ctx.quadraticCurveTo(x - 6, y - 1, x, y - 9); ctx.fill();
  }
  ctx.restore();
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
    const b = { x: e.homes[k] };
    [s, -s].forEach((phase, i) => {
      const mid = ROPE_CENTER + ROPE_AMP * phase;
      if ((mid > ROPE_CENTER) !== (layer === 'front')) return;
      ctx.save();
      ctx.globalAlpha = i === 0 ? 1 : 0.65;
      ctx.lineWidth = 3.5;
      const style = e.progress.ropeStyle;
      const color = style === 'style_gold' ? '#facc15'
        : style === 'style_rainbow' ? `hsl(${(e.beat * 90 + (k === 'blue' ? 180 : 0)) % 360}, 90%, 62%)`
        : e.bros[k].color;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(b.x - 28, HAND_Y);
        ctx.quadraticCurveTo(b.x + 16, 2 * mid - HAND_Y, b.x + 60, HAND_Y);
        ctx.stroke();
      };
      path();
      // Hot core makes the rope read as a lit tube.
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      path();
      ctx.restore();
    });
  });
};

/** Floor glow under the acting bro while the rope is inside the perfect window. */
const drawPerfectZone = (ctx: CanvasRenderingContext2D, e: Engine) => {
  if (e.phase !== 'WINDUP') return;
  const k: BroKey = e.expectedJumper() === 'RED' ? 'red' : 'blue';
  const threshold = e.perfectThresholdFor(k === 'red' ? 'RED' : 'BLUE');
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
  // The ring sits over whoever must jump next (Tandem Master alternates).
  const jumper = e.expectedJumper();
  const jk: BroKey = jumper === 'RED' ? 'red' : 'blue';
  const jb = e.body[jk];
  const threshold = e.perfectThresholdFor(jumper);
  const limit = e.windupLimit();
  const tandem = e.moveType === 'TECH6';
  const partner: BroKey = k === 'red' ? 'blue' : 'red';
  ctx.save();
  ctx.shadowBlur = 8;
  for (let i = 0; i < limit; i++) {
    ctx.globalAlpha = i < e.windup ? 1 : 0.25;
    ctx.fillStyle = tandem ? e.bros[i % 2 === 0 ? k : partner].color : '#fff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.fillRect(b.x + 16 + i * 14 - limit * 7, GROUND_Y + b.y - 120, 10, 10);
  }
  // Timing ring: fills as the rope approaches the perfect zone.
  const s = Math.abs(Math.sin(e.ropeAngle));
  ctx.globalAlpha = 0.9;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = s > threshold ? '#facc15' : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(jb.x + 16, GROUND_Y + jb.y - 150, 6 + s * 12, 0, Math.PI * 2);
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

const drawEnemies = (ctx: CanvasRenderingContext2D, e: Engine, reflection = false) => {
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
    ctx.globalAlpha *= en.hp > 0 ? 1 : 0.3;
    ctx.scale(en.scale, en.scale);
    if (!drawSprite(ctx, enemySpriteId(en.type), clip, ENEMY_CLIPS[clip], anim, now, e.beat, 0)) {
      ctx.save();
      ctx.translate(-20, -70);
      drawEnemyShape(ctx, en.type, en.color, e.beat + i * 0.25, en.hurt > 0);
      ctx.restore();
    }
    if (reflection) { ctx.restore(); return; }
    ctx.translate(-20, -70);
    ctx.globalAlpha = 1;
    if (en.affix && en.hp > 0) drawAffix(ctx, en.affix, AFFIXES[en.affix].color, e.beat, en.shield);
    if (en.hp > 0) drawEnemyHp(ctx, en.hp / en.maxHp, en.scale);
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
  if (!reflection) for (const id of enemyAnimators.keys()) if (!live.has(id)) enemyAnimators.delete(id);
};

/** Slim pill bar on a dark plate, sized in screen terms so big bosses don't get chunky bars. */
const drawEnemyHp = (ctx: CanvasRenderingContext2D, frac: number, scale: number) => {
  const h = 4 / scale, y = 12;
  ctx.save();
  ctx.fillStyle = 'rgba(5, 3, 15, 0.8)';
  ctx.beginPath(); ctx.roundRect(-1.5 / scale, y - 1.5 / scale, 40 + 3 / scale, h + 3 / scale, h); ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 40, 0);
  g.addColorStop(0, '#f43f5e'); g.addColorStop(1, '#fb7185');
  ctx.fillStyle = g;
  ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.roundRect(0, y, Math.max(h, 40 * frac), h, h / 2); ctx.fill();
  ctx.restore();
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
  const flash = e.flash * e.settings.flashes;
  if (flash < 0.02) return;
  ctx.save();
  ctx.globalAlpha = flash * 0.6;
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
    ctx.font = `italic 900 ${30 * t.scale * pop}px ${DISPLAY_FONT}`;
    ctx.fontStretch = 'expanded';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(5, 3, 15, 0.85)';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.shadowColor = t.color;
    ctx.shadowBlur = 18;
    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  }
};
