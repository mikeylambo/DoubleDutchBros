import { CANVAS_HEIGHT, CANVAS_WIDTH, GROUND_Y, type BroKey } from '../data/config';
import type { Engine } from './engine';
import { Animator, CONTACT_FRAME, ENEMY_CLIPS, RABBIT_CLIPS, SPRITE_ID, airProgress, enemySpriteId, frameIndex, rabbitClip, sprites, type EnemyClip } from './anim';
import { BACKDROP_RES, CLIP_POSE, timeForWave, zoneForWave, DISPLAY_FONT, RABBITS, drawAffix, drawEnemyShape, drawRabbit, drawShadow, getBackdrop, getSceneLayers } from './sprites';
import type { Enemy } from './types';
import { AFFIXES } from './encounters';
import { applyView, type View } from './view';
import { drawAmbience, trainOffset } from './ambience';
import { drawImpacts, drawSpeedLines, hitStop } from './impact';
import { beginFighters, endFighters } from './lighting';
import { drawCinemaOverlay, updateCinema } from './cinema';

/** Draws the current engine state. Read-only: never mutates the sim. */
export const draw = (ctx: CanvasRenderingContext2D, e: Engine, v: View, dpr: number) => {
  if (hitStop(e)) return; // hold the contact frame on screen
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
  const cam = followCamera(e, v, motion);
  parallax = followCam.x + Math.sin(performance.now() / 9000) * 18 * motion;
  const cine = updateCinema(e, motion);
  ctx.translate(v.w / 2, cy);
  ctx.rotate(cine.tilt);
  ctx.scale(cam.zoom * cine.zoom, cam.zoom * cine.zoom);
  ctx.translate(-v.w / 2 - cam.pan, -cy);
  applyView(ctx, v);

  drawStage(ctx, e);
  drawBeatWorld(ctx, e);
  drawReflections(ctx, e);
  drawRimLights(ctx, e);
  drawShadows(ctx, e);
  drawHazards(ctx, e);
  drawPerfectZone(ctx, e);
  drawRopes(ctx, e, 'back');
  drawWindupPips(ctx, e);
  drawSpeedLines(ctx, e, 'blue', GROUND_Y);
  drawSpeedLines(ctx, e, 'red', GROUND_Y);
  // Fighters are lit as a group to match the set: colour cast plus a rim from its key light.
  const fighters = beginFighters(ctx);
  drawEnemies(fighters, e);
  drawBro(fighters, e, 'blue');
  drawBro(fighters, e, 'red');
  const zone = zoneForWave(e.wave);
  const train = zone === 'subway' ? trainOffset(e.beat) : null;
  endFighters(ctx, zone, timeForWave(e.wave), {
    beat: pulse(e.beat),
    flash: e.flash * e.settings.flashes, flashColor: e.flashColor,
    train: train === null ? 0 : Math.max(0, 1 - Math.abs(train) / 1600),
  });
  drawRopes(ctx, e, 'front');
  drawHeat(ctx, e);
  drawParticles(ctx, e);
  drawImpacts(ctx, e.settings.flashes);
  drawTexts(ctx, e);
  ctx.restore();
  drawFlash(ctx, e, v);
  drawPost(ctx, e, v);
  drawCinemaOverlay(ctx, v);
};

/**
 * Tall screens can't fit the whole line-up at a readable size, so, like Mario & Luigi, the
 * camera leans in on the bro's attack and pulls back out for enemy turns, where the player
 * needs to see everything coming. Wide screens get a gentler lean of the same move.
 */
const ATTACK_PHASES = new Set(['TARGET', 'WINDUP', 'LAUNCH', 'IMPACT']);
const followCam = { zoom: 1, x: 0, wave: 0 };
const followCamera = (e: Engine, v: View, motion: number) => {
  // Each wave opens a little wide and eases in, under the wave title card.
  if (e.wave !== followCam.wave) { followCam.wave = e.wave; if (motion > 0) followCam.zoom = 0.86; }
  const tall = v.h > v.w * 1.1;
  const target = e.enemies[e.targetIdx];
  const acting = ATTACK_PHASES.has(e.phase) && target && motion > 0;
  const bro = e.body[e.turn === 'RED' ? 'red' : 'blue'];
  const goalZoom = acting ? (tall ? 1.35 : 1.06) : 1;
  const goalX = acting ? ((bro.x + 16 + target.x + 20 * target.scale) / 2 - 400) * (tall ? 1 : 0.35) : 0;
  followCam.zoom += (goalZoom - followCam.zoom) * 0.08;
  followCam.x += (goalX - followCam.x) * 0.08;
  return { zoom: followCam.zoom, pan: followCam.x * v.scale };
};

/** Every other ground enemy stands a step back, so a full line-up reads as a crowd, not a queue. */
const BACK_ROW = { lift: 44, scale: 0.8 };
const backRow = (en: Enemy, i: number) => i % 2 === 1 && en.float >= 0 && !en.isBoss;

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

/** Camera offset (world units) the backdrop layers parallax against: the camera's pan plus a slow sway. */
let parallax = 0;
/** How far each layer sits from the court: 0 moves with the fighters, 1 hangs in the sky. */
const DEPTH = { far: 0.85, mid: 0.5, near: 0.15 } as const;

const drawStage = (ctx: CanvasRenderingContext2D, e: Engine) => {
  const zone = zoneForWave(e.wave), tod = timeForWave(e.wave);
  const img = getBackdrop(zone, tod);
  const w = img.width / BACKDROP_RES, h = img.height / BACKDROP_RES;
  // The backdrop ends at the bottom of the court; open-air sets carry extra sky above.
  const top = CANVAS_HEIGHT + 100 - h;
  // Screens taller still see past it: stretch its top edge upward and fade it into the night.
  ctx.drawImage(img, 0, 0, img.width, 6, -400, top - 1500, w, 1502);
  const g = ctx.createLinearGradient(0, top, 0, top - 600);
  g.addColorStop(0, 'rgba(5, 3, 15, 0)'); g.addColorStop(1, 'rgba(5, 3, 15, 1)');
  ctx.fillStyle = g;
  ctx.fillRect(-400, top - 1500, w, 1500);
  ctx.drawImage(img, -400, top, w, h);
  // Parallax: the painted layers slide over the flattened set, distant ones further with the camera.
  const layers = getSceneLayers(zone, tod);
  if (!layers) return;
  const lh = layers.far.height * w / layers.far.width;
  const motion = e.settings.reducedMotion ? 0 : 1;
  for (const k of ['far', 'mid', 'near'] as const) {
    const train = zone === 'subway' && k === 'mid' ? trainOffset(e.beat) : 0;
    if (train === null) continue;
    ctx.save();
    ctx.translate(parallax * DEPTH[k] + train, 0);
    ctx.drawImage(layers[k], -400, GROUND_Y - lh, w, lh);
    drawAmbience(ctx, zone, tod, k, layers[k], GROUND_Y - lh, w, e.beat, motion);
    ctx.restore();
  }
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
  ctx.shadowBlur = 0;
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
  e.enemies.forEach((en, i) => {
    if (en.hp <= 0) return;
    const back = backRow(en, i);
    ctx.save();
    if (back) ctx.translate(0, -BACK_ROW.lift);
    drawShadow(ctx, en.x + 20 * en.scale, -en.y, 20 * en.scale * (back ? BACK_ROW.scale : 1));
    ctx.restore();
  });
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

const ROPE_CENTER = GROUND_Y - 55; // midpoint of the swing: halfway between overhead and the feet
const ROPE_AMP = 62;                // clears the ears on top, brushes the court below
const HAND_Y = GROUND_Y - 35;       // fallback grip height when a rabbit has no sprite art

/** Where each rabbit's hands were in the frame drawn last tick (world units), if the clip records them. */
const heldHands: Partial<Record<BroKey, [number, number, number, number]>> = {};

const ropeColor = (e: Engine, k: BroKey) => {
  const style = e.progress.ropeStyle;
  return style === 'style_gold' ? '#facc15'
    : style === 'style_rainbow' ? `hsl(${(e.beat * 90 + (k === 'blue' ? 180 : 0)) % 360}, 90%, 62%)`
    : e.bros[k].color;
};

/**
 * Two ropes turning in opposite phase — actual double dutch. At every beat peak one rope is
 * sweeping under the feet, so "jump when a rope hits the floor" is literally the timing rule.
 * Each rabbit holds its rope in its own hands (positions recorded per sprite frame). The half of
 * the swing below the waist draws in front, thicker and brighter; a short trail sells the speed,
 * and the court flashes where the rope slaps down on the beat.
 */
const drawRopes = (ctx: CanvasRenderingContext2D, e: Engine, layer: 'back' | 'front') => {
  if (e.phase === 'ENEMY_TURN') return;
  (['red', 'blue'] as BroKey[]).forEach((k) => {
    if (e.bros[k].hp <= 0) return;
    const hands = heldHands[k];
    // Art without hand data (attacking, hurt...): the rabbit has let go, so no rope.
    if (!hands && sprites.get(SPRITE_ID[k], 'windup')) return;
    const x = e.homes[k];
    const [lx, ly, rx, ry] = hands ?? [x - 28, HAND_Y, x + 60, HAND_Y];
    const gx = (lx + rx) / 2, gy = (ly + ry) / 2;
    const color = ropeColor(e, k);
    const curve = (mid: number) => {
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(gx, 2 * mid - gy, rx, ry);
      ctx.stroke();
    };
    [1, -1].forEach((sign, i) => {
      // Trail first (older positions, fainter), then the rope itself.
      for (let t = 3; t >= 0; t--) {
        const ph = sign * Math.sin(e.ropeAngle - t * 0.16);
        const mid = ROPE_CENTER + ROPE_AMP * ph;
        const front = mid > ROPE_CENTER;
        if (front !== (layer === 'front')) continue;
        ctx.save();
        const depth = front ? 1 : 0.55;
        ctx.globalAlpha = (i === 0 ? 1 : 0.7) * depth * (t === 0 ? 1 : 0.22 / t);
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = t === 0 ? 14 : 0;
        ctx.lineWidth = (front ? 4.2 : 2.6) * (t === 0 ? 1 : 0.8);
        curve(mid);
        if (t === 0) {
          // Hot core: reads as a lit tube.
          ctx.shadowBlur = 0;
          ctx.lineWidth = front ? 1.4 : 0.9;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          curve(mid);
        }
        ctx.restore();
      }
    });
    if (layer !== 'front') return;
    // Handles in the rabbit's grip.
    if (hands) {
      ctx.save();
      for (const [hx, hy] of [[lx, ly], [rx, ry]]) {
        ctx.fillStyle = '#0e081e';
        ctx.beginPath(); ctx.roundRect(hx - 2.2, hy - 5, 4.4, 10, 2.2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(hx, hy - 5, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // Floor slap: the rope hits the court on the beat.
    const slap = Math.max(0, Math.abs(Math.sin(e.ropeAngle)) - 0.86) / 0.14;
    if (slap > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(gx, GROUND_Y, 0, gx, GROUND_Y, 46);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalAlpha = 0.55 * slap;
      ctx.translate(gx, GROUND_Y); ctx.scale(1, 0.16); ctx.translate(-gx, -GROUND_Y);
      ctx.fillStyle = g; ctx.fillRect(gx - 46, GROUND_Y - 46, 92, 92);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = slap;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 1.2;
      for (let j = -2; j <= 2; j++) {
        const sx = gx + j * 9;
        ctx.beginPath(); ctx.moveTo(sx, GROUND_Y - 1); ctx.lineTo(sx + j * 3, GROUND_Y - 5 - slap * 4 * (3 - Math.abs(j))); ctx.stroke();
      }
      ctx.restore();
    }
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
  return { f, sprite: s };
};

const drawEnemies = (ctx: CanvasRenderingContext2D, e: Engine, reflection = false) => {
  const now = performance.now() / 1000;
  const live = new Set<number>();
  const order = e.enemies.map((en, i) => [en, i] as const).sort(([a, i], [b, j]) => Number(backRow(b, j)) - Number(backRow(a, i)));
  order.forEach(([en, i]) => {
    live.add(en.id);
    if (en.hp <= 0 && e.phase !== 'IMPACT' && e.phase !== 'LAUNCH') return;
    let anim = enemyAnimators.get(en.id);
    if (!anim) { anim = new Animator(); enemyAnimators.set(en.id, anim); }
    const clip = enemyClip(e, en);
    anim.set(clip, now);
    // Ground enemies hop on the beat; flyers bob.
    const bob = en.hp > 0 ? -pulse(e.beat + i * 0.25) * (en.float < 0 ? 6 : 3) : 0;
    ctx.save();
    const back = backRow(en, i);
    ctx.translate(en.x + 20 * en.scale, GROUND_Y + en.y + bob - (back ? BACK_ROW.lift : 0));
    ctx.globalAlpha *= en.hp > 0 ? 1 : 0.3;
    // Distance haze on the back row: a little darker and flatter, so it sits behind the front line.
    if (back && !reflection) ctx.filter = 'brightness(0.78) saturate(0.8)';
    ctx.scale(en.scale * (back ? BACK_ROW.scale : 1), en.scale * (back ? BACK_ROW.scale : 1));
    if (!drawSprite(ctx, enemySpriteId(en.type), clip, ENEMY_CLIPS[clip], anim, now, e.beat, 0)) {
      ctx.save();
      ctx.translate(-20, -70);
      drawEnemyShape(ctx, en.type, en.color, e.beat + i * 0.25, en.hurt > 0);
      ctx.restore();
    }
    ctx.filter = 'none'; // health bars and markers stay crisp
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
      ctx.beginPath(); ctx.moveTo(14, -22); ctx.lineTo(26, -22); ctx.lineTo(20, -14); ctx.fill();
    }
    ctx.restore();
  });
  if (!reflection) for (const id of enemyAnimators.keys()) if (!live.has(id)) enemyAnimators.delete(id);
};

/** Slim pill bar on a dark plate, sized in screen terms so big bosses don't get chunky bars. */
const drawEnemyHp = (ctx: CanvasRenderingContext2D, frac: number, scale: number) => {
  const h = 4 / scale, y = -8; // above the 70-unit gameplay box, clear of the sprite
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
  const drawn = drawSprite(ctx, SPRITE_ID[k], clip, RABBIT_CLIPS[clip], anim, now, e.beat, air);
  // Remember the grip so the rope can be strung between the rabbit's real hands.
  const h = drawn && drawn.sprite.hands[drawn.f];
  heldHands[k] = h ? [
    b.x + 16 + (h[0] - drawn.sprite.pivot[0]) / drawn.sprite.scale, GROUND_Y + b.y + (h[1] - drawn.sprite.pivot[1]) / drawn.sprite.scale,
    b.x + 16 + (h[2] - drawn.sprite.pivot[0]) / drawn.sprite.scale, GROUND_Y + b.y + (h[3] - drawn.sprite.pivot[1]) / drawn.sprite.scale
  ] : undefined;
  if (!drawn) {
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

const isNumber = (text: string) => /^[-+]\d/.test(text);
const drawTexts = (ctx: CanvasRenderingContext2D, e: Engine) => {
  // Damage numbers landing close together stack upward instead of piling on one spot: each sits
  // above the older numbers near it.
  const lift = new Map<object, number>();
  const nums = e.floatingTexts.filter((t) => isNumber(t.text)).sort((a, b) => b.life - a.life);
  nums.forEach((t, i) => lift.set(t, nums.slice(0, i).filter((o) => Math.abs(o.x - t.x) < 60).length * 30));
  for (const t of e.floatingTexts) {
    // Pop with overshoot: lands big, dips under size, settles (a spring, about a tenth of its life).
    const k = (1 - t.life) * 10;
    const pop = 1 + 0.7 * Math.exp(-k * 0.9) * Math.cos(k * 1.6);
    const num = isNumber(t.text);
    const crit = num && t.color === '#facc15';
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, t.life * 1.5));
    ctx.translate(t.x, t.y - (lift.get(t) ?? 0));
    // Crits hit harder: bigger and knocked off-level.
    if (crit) ctx.rotate(-0.12);
    ctx.font = `italic 900 ${30 * t.scale * pop * (crit ? 1.3 : 1)}px ${DISPLAY_FONT}`;
    ctx.fontStretch = 'expanded';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = crit ? 7 : 5;
    ctx.strokeStyle = 'rgba(5, 3, 15, 0.85)';
    ctx.strokeText(t.text, 0, 0);
    ctx.fillStyle = t.color;
    ctx.shadowColor = t.color;
    ctx.shadowBlur = crit ? 28 : 18;
    ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }
};
