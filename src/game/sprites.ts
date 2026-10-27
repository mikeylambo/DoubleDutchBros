import { CANVAS_HEIGHT, CANVAS_WIDTH, GROUND_Y, type BroKey, type EnemyTypeId } from '../data/config';

// Procedural character art. Everything is drawn from primitives so it scales to any resolution
// and stays in the neon-alley style without an asset pipeline. Swap for sprite sheets later
// by keeping these function signatures.

export interface RabbitLook {
  fur: string;
  furShade: string;
  hoodie: string;
  band: string;
  /** Ear length in px. */
  ear: number;
  /** Hop's left ear flops over at the tip. */
  floppy: boolean;
}

export const RABBITS: Record<BroKey, RabbitLook> = {
  red: { fur: '#f6e7d4', furShade: '#d9c2a5', hoodie: '#ef4444', band: '#3b82f6', ear: 34, floppy: true },
  blue: { fur: '#eef2f7', furShade: '#c4ccd8', hoodie: '#3b82f6', band: '#ef4444', ear: 40, floppy: false }
};

export interface RabbitPose {
  /** Vertical velocity; ears trail against it. */
  vy: number;
  /** Squash (+) / stretch (-), -1..1. */
  squash: number;
  airborne: boolean;
  down: boolean;
  /** Seconds, for blinking and idle motion. */
  t: number;
  /** Seed so the two rabbits don't blink in unison. */
  seed: number;
}

const ellipse = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) => {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
};

/**
 * Draws a rabbit with its feet at the current origin, facing left. Roughly 34px wide and
 * 68px tall to the top of the head (ears extend above), matching the gameplay hitbox.
 */
export const drawRabbit = (ctx: CanvasRenderingContext2D, look: RabbitLook, pose: RabbitPose) => {
  ctx.save();
  if (pose.down) { ctx.translate(0, -12); ctx.rotate(-Math.PI / 2); ctx.translate(30, 0); }
  const idle = pose.airborne || pose.down ? 0 : Math.sin(pose.t * 4 + pose.seed) * 0.03;
  ctx.scale(1 + 0.25 * pose.squash, 1 - 0.25 * pose.squash + idle);

  // Ears trail against motion: rising sweeps them back, falling lifts them.
  const earSwing = pose.down ? 0.9 : Math.max(-0.5, Math.min(0.7, -pose.vy * 0.045));
  const drawEar = (baseX: number, lean: number, len: number, flop: boolean) => {
    ctx.save();
    ctx.translate(baseX, -76);
    ctx.rotate(lean + earSwing);
    ctx.fillStyle = look.fur;
    ellipse(ctx, 0, -len / 2, 6.5, len / 2);
    ctx.fillStyle = '#f9a8d4';
    ellipse(ctx, 0, -len / 2 + 2, 3, len / 2 - 5);
    if (flop) {
      // Folded tip.
      ctx.translate(0, -len + 6);
      ctx.rotate(-1.1);
      ctx.fillStyle = look.furShade;
      ellipse(ctx, 0, -7, 6, 9);
    }
    ctx.restore();
  };
  drawEar(4, 0.28, look.ear, false); // back ear
  drawEar(-6, -0.12, look.ear - (look.floppy ? 8 : 0), look.floppy);

  // Tail puff.
  ctx.fillStyle = '#ffffff';
  ellipse(ctx, 15, -26, 7, 7);

  // Hoodie torso with neon rim.
  ctx.save();
  ctx.shadowColor = look.hoodie;
  ctx.shadowBlur = 18;
  ctx.fillStyle = look.hoodie;
  ctx.beginPath();
  ctx.roundRect(-14, -50, 28, 40, 11);
  ctx.fill();
  ctx.restore();
  // Hoodie pocket + drawstrings.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.roundRect(-9, -26, 18, 9, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-5, -48); ctx.lineTo(-6, -38); ctx.moveTo(1, -48); ctx.lineTo(1, -39); ctx.stroke();

  // Big rabbit feet, pointing left.
  ctx.fillStyle = look.fur;
  ellipse(ctx, -9, -4, 11, 5);
  ellipse(ctx, 6, -4, 10, 5);
  ctx.fillStyle = look.furShade;
  ellipse(ctx, -16, -3, 3, 2.5);

  // Head.
  ctx.fillStyle = look.fur;
  ellipse(ctx, -2, -64, 16, 15);
  ctx.fillStyle = look.furShade;
  ellipse(ctx, -13, -58, 6, 5); // muzzle shade
  // Headband in the partner's color.
  ctx.fillStyle = look.band;
  ctx.beginPath(); ctx.roundRect(-18, -75, 32, 5, 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(13, -74); ctx.lineTo(22, -80); ctx.lineTo(21, -70); ctx.closePath(); ctx.fill();

  // Eye: blinks every few seconds; X when down.
  const blink = (pose.t + pose.seed) % 3.2 < 0.12;
  if (pose.down) {
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-10, -67); ctx.lineTo(-4, -61); ctx.moveTo(-4, -67); ctx.lineTo(-10, -61); ctx.stroke();
  } else if (blink) {
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-11, -64); ctx.lineTo(-3, -64); ctx.stroke();
  } else {
    ctx.fillStyle = '#ffffff'; ellipse(ctx, -7, -65, 5, 6);
    ctx.fillStyle = '#1e1b4b'; ellipse(ctx, -9, -64, 3, 4);
    ctx.fillStyle = '#ffffff'; ellipse(ctx, -10, -66, 1.2, 1.2);
  }
  // Nose + cheek.
  ctx.fillStyle = '#f472b6'; ellipse(ctx, -17, -59, 2.5, 2);
  ctx.fillStyle = 'rgba(244,114,182,0.35)'; ellipse(ctx, -4, -56, 4, 2.5);
  ctx.restore();
};

/** Soft contact shadow; shrinks as the body rises. */
export const drawShadow = (ctx: CanvasRenderingContext2D, x: number, height: number, width: number) => {
  const k = Math.max(0.3, 1 - height / 220);
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${0.45 * k})`;
  ellipse(ctx, x, GROUND_Y + 2, width * k, 5 * k);
  ctx.restore();
};

/**
 * Enemy silhouettes. Drawn inside a 40x70 box (origin top-left, feet at y=70) before the
 * caller's scale is applied, so hitboxes and HP bars stay where gameplay expects them.
 */
export const drawEnemyShape = (ctx: CanvasRenderingContext2D, type: EnemyTypeId, color: string, t: number, hurt: boolean) => {
  ctx.save();
  ctx.fillStyle = hurt ? '#ffffff' : color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  switch (type) {
    case 'SLIME':
    case 'BOSS': {
      const wob = Math.sin(t * 5) * 3;
      ctx.beginPath();
      ctx.moveTo(-2, 70);
      ctx.bezierCurveTo(-4, 30 - wob, 44, 30 - wob, 42, 70);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ellipse(ctx, 10, 50 - wob / 2, 4, 6, -0.4);
      eyes(ctx, 10, 56 - wob / 2, 22);
      if (type === 'BOSS') {
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.moveTo(8, 42 - wob); ctx.lineTo(10, 30 - wob); ctx.lineTo(16, 37 - wob); ctx.lineTo(20, 27 - wob);
        ctx.lineTo(24, 37 - wob); ctx.lineTo(30, 30 - wob); ctx.lineTo(32, 42 - wob); ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'BAT': {
      const flap = Math.sin(t * 18);
      ctx.beginPath(); // wings
      ctx.moveTo(20, 50);
      ctx.quadraticCurveTo(-10, 30 + flap * 18, -22, 46 + flap * 10);
      ctx.quadraticCurveTo(-6, 48, 20, 58);
      ctx.moveTo(20, 50);
      ctx.quadraticCurveTo(50, 30 + flap * 18, 62, 46 + flap * 10);
      ctx.quadraticCurveTo(46, 48, 20, 58);
      ctx.fill();
      ellipse(ctx, 20, 52, 11, 12); // body
      ctx.beginPath(); // ears
      ctx.moveTo(11, 44); ctx.lineTo(13, 32); ctx.lineTo(18, 42);
      ctx.moveTo(22, 42); ctx.lineTo(27, 32); ctx.lineTo(29, 44);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fef08a';
      ellipse(ctx, 15, 50, 2.5, 2.5); ellipse(ctx, 24, 50, 2.5, 2.5);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(16, 58); ctx.lineTo(17.5, 62); ctx.lineTo(19, 58); ctx.moveTo(21, 58); ctx.lineTo(22.5, 62); ctx.lineTo(24, 58); ctx.fill();
      break;
    }
    case 'SHELL': {
      ctx.fillStyle = hurt ? '#ffffff' : '#64748b';
      ellipse(ctx, -4, 58, 9, 8); // head peeking out
      ctx.fillStyle = hurt ? '#ffffff' : color;
      ctx.beginPath(); // dome
      ctx.moveTo(-2, 68);
      ctx.bezierCurveTo(-2, 26, 46, 26, 46, 68);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(15,23,42,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); // plates
      ctx.moveTo(8, 66); ctx.lineTo(12, 48); ctx.lineTo(22, 40); ctx.lineTo(32, 48); ctx.lineTo(36, 66);
      ctx.moveTo(12, 48); ctx.lineTo(32, 48);
      ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ellipse(ctx, -7, 56, 2, 2);
      ctx.fillStyle = '#334155';
      ellipse(ctx, 2, 70, 5, 3); ellipse(ctx, 34, 70, 5, 3);
      break;
    }
  }
  ctx.restore();
};

const eyes = (ctx: CanvasRenderingContext2D, x: number, y: number, gap: number) => {
  ctx.fillStyle = '#fff';
  ellipse(ctx, x, y, 4, 5); ellipse(ctx, x + gap * 0.55, y, 4, 5);
  ctx.fillStyle = '#0f172a';
  ellipse(ctx, x - 1, y + 1, 2, 3); ellipse(ctx, x + gap * 0.55 - 1, y + 1, 2, 3);
};

// ---------------- Backdrop (pre-rendered once, it never changes) ----------------

let backdrop: HTMLCanvasElement | null = null;

const rand = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/** Night alley: moon, two layers of skyline with lit windows, a neon sign, and the court floor. */
export const getBackdrop = () => {
  if (backdrop) return backdrop;
  const c = document.createElement('canvas');
  c.width = CANVAS_WIDTH + 200;
  c.height = CANVAS_HEIGHT + 200;
  const ctx = c.getContext('2d')!;
  ctx.translate(100, 100);
  const r = rand(7);

  const sky = ctx.createLinearGradient(0, -100, 0, GROUND_Y);
  sky.addColorStop(0, '#05030f');
  sky.addColorStop(0.6, '#140b2e');
  sky.addColorStop(1, '#2a0f3a');
  ctx.fillStyle = sky;
  ctx.fillRect(-100, -100, c.width, GROUND_Y + 100);

  // Moon.
  const moon = ctx.createRadialGradient(620, 90, 0, 620, 90, 120);
  moon.addColorStop(0, 'rgba(255, 214, 236, 0.9)');
  moon.addColorStop(0.25, 'rgba(244, 114, 182, 0.35)');
  moon.addColorStop(1, 'rgba(244, 114, 182, 0)');
  ctx.fillStyle = moon;
  ctx.fillRect(480, -50, 280, 280);
  ctx.fillStyle = '#ffe4f1';
  ellipse(ctx, 620, 90, 30, 30);

  // Skyline, far then near.
  const skyline = (base: string, minH: number, maxH: number, windowAlpha: number) => {
    let x = -100;
    while (x < CANVAS_WIDTH + 100) {
      const w = 40 + r() * 70;
      const h = minH + r() * (maxH - minH);
      ctx.fillStyle = base;
      ctx.fillRect(x, GROUND_Y - h, w - 4, h);
      for (let wy = GROUND_Y - h + 10; wy < GROUND_Y - 30; wy += 16) {
        for (let wx = x + 6; wx < x + w - 12; wx += 12) {
          if (r() < 0.28) {
            ctx.fillStyle = r() < 0.5 ? `rgba(250, 204, 21, ${windowAlpha})` : `rgba(103, 232, 249, ${windowAlpha})`;
            ctx.fillRect(wx, wy, 5, 7);
          }
        }
      }
      x += w;
    }
  };
  skyline('#0d0820', 120, 260, 0.35);
  skyline('#07051a', 60, 160, 0.6);

  // Neon sign on the near wall.
  ctx.save();
  ctx.font = 'italic 900 22px system-ui, sans-serif';
  ctx.fillStyle = '#f472b6';
  ctx.shadowColor = '#f472b6';
  ctx.shadowBlur = 18;
  ctx.fillText('HOP & SKIP', 70, GROUND_Y - 120);
  ctx.restore();

  // Court floor with lane lines.
  const floor = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_HEIGHT + 100);
  floor.addColorStop(0, '#120a26');
  floor.addColorStop(1, '#020206');
  ctx.fillStyle = floor;
  ctx.fillRect(-100, GROUND_Y, c.width, 300);
  ctx.strokeStyle = 'rgba(167, 139, 250, 0.18)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 12; i++) {
    const y = GROUND_Y + i * i * 2.2;
    ctx.beginPath(); ctx.moveTo(-100, y); ctx.lineTo(CANVAS_WIDTH + 100, y); ctx.stroke();
  }
  ctx.save();
  ctx.strokeStyle = '#00d2ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#00d2ff';
  ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(-100, GROUND_Y); ctx.lineTo(CANVAS_WIDTH + 100, GROUND_Y); ctx.stroke();
  ctx.restore();

  backdrop = c;
  return c;
};
