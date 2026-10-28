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
  /** Music beat; idle breathing bobs on it. */
  beat?: number;
  /** Lean in radians, positive = forward (toward the enemies). */
  lean?: number;
  /** 0..1 knee bend. */
  crouch?: number;
  eyes?: 'open' | 'happy' | 'strain';
}

/** Procedural stand-in pose for each animation clip until sprite art exists. */
export const CLIP_POSE: Record<string, Pick<RabbitPose, 'lean' | 'crouch' | 'eyes'>> = {
  windup: { crouch: 0.35 },
  trip: { lean: 0.55, eyes: 'strain' },
  launch: { lean: 0.35 },
  attack: { lean: 0.6, eyes: 'strain' },
  tag: { lean: 0.45, eyes: 'strain' },
  hurt: { lean: -0.4, eyes: 'strain' },
  victory: { eyes: 'happy' }
};

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
  // Breathing bob lands on the beat when music is playing.
  const breath = pose.beat !== undefined ? -Math.pow(1 - (pose.beat - Math.floor(pose.beat)), 3) * 0.05 : Math.sin(pose.t * 4 + pose.seed) * 0.03;
  const idle = pose.airborne || pose.down ? 0 : breath;
  ctx.rotate(-(pose.lean ?? 0));
  const sq = pose.squash + (pose.crouch ?? 0) * 0.5;
  ctx.scale(1 + 0.25 * sq, 1 - 0.25 * sq + idle);

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
  } else if (pose.eyes === 'happy') {
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-7, -63, 4, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  } else if (pose.eyes === 'strain') {
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-11, -67); ctx.lineTo(-5, -64); ctx.lineTo(-11, -61); ctx.stroke();
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
export const drawEnemyShape = (ctx: CanvasRenderingContext2D, type: EnemyTypeId, color: string, beat: number, hurt: boolean): void => {
  // Bosses built from other silhouettes.
  if (type === 'KING') {
    drawEnemyShape(ctx, 'BOUNCER', color, beat, hurt);
    drawCrown(ctx, 20, 12, '#fde047');
    return;
  }
  if (type === 'GLITCH' || type === 'GIGA_GLITCH') {
    // Chromatic split that jumps on the beat: the "glitch" read.
    const base: EnemyTypeId = type === 'GLITCH' ? 'PIGEON' : 'BOSS';
    const j = Math.pow(1 - (beat - Math.floor(beat)), 4) * 4 + 1;
    ctx.save();
    ctx.globalAlpha *= 0.6;
    ctx.globalCompositeOperation = 'lighter';
    ctx.save(); ctx.translate(-j, 0); drawEnemyShape(ctx, base, '#22d3ee', beat, hurt); ctx.restore();
    ctx.save(); ctx.translate(j, 0); drawEnemyShape(ctx, base, '#f472b6', beat, hurt); ctx.restore();
    ctx.restore();
    drawEnemyShape(ctx, base, color, beat, hurt);
    // Scanline tears.
    ctx.save();
    ctx.fillStyle = 'rgba(2,2,8,0.55)';
    const tear = Math.floor(beat * 2) % 3;
    for (let y = 30 + tear * 9; y < 70; y += 17) ctx.fillRect(-6 + j, y, 52, 2);
    ctx.restore();
    return;
  }
  const pulse = Math.pow(1 - (beat - Math.floor(beat)), 3); // 1 on the beat, decays
  ctx.save();
  ctx.fillStyle = hurt ? '#ffffff' : color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  switch (type) {
    case 'SLIME':
    case 'BOSS': {
      const wob = pulse * 5 - 1; // squish on every beat
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
      const flap = Math.sin(beat * Math.PI * 4); // two flaps per beat
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
    case 'MOTH': {
      // Wings glow brightest on the off-beat: its tell.
      const off = Math.pow(1 - ((beat + 0.25) - Math.floor(beat + 0.25)), 3);
      const flap = Math.sin(beat * Math.PI * 4) * 0.5;
      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha * (0.55 + 0.45 * off);
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(20, 50); ctx.scale(side, 1); ctx.rotate(-0.3 + flap * 0.4);
        ellipse(ctx, 14, -6, 15, 10, -0.5); ellipse(ctx, 10, 8, 9, 7, 0.4);
        ctx.restore();
      }
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#4a044e';
      ellipse(ctx, 20, 52, 5, 13);
      ctx.strokeStyle = '#f5d0fe'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(18, 40); ctx.quadraticCurveTo(12, 30, 8, 30); ctx.moveTo(22, 40); ctx.quadraticCurveTo(28, 30, 32, 30); ctx.stroke();
      ctx.fillStyle = '#fef08a'; ellipse(ctx, 18, 45, 1.5, 1.5); ellipse(ctx, 22, 45, 1.5, 1.5);
      break;
    }
    case 'PIGEON': {
      const bob = (i: number) => Math.abs(Math.sin((beat + i * 0.5) * Math.PI)) * -3;
      for (const [x, i] of [[8, 0], [30, 1]] as const) {
        ctx.save(); ctx.translate(x, bob(i));
        ctx.fillStyle = hurt ? '#ffffff' : color;
        ellipse(ctx, 0, 56, 11, 9);           // body
        ellipse(ctx, -6, 44, 6, 6);           // head
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#6ee7b7'; ellipse(ctx, -3, 50, 4, 3); // neck sheen
        ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(-11, 44); ctx.lineTo(-16, 45); ctx.lineTo(-11, 47); ctx.fill();
        ctx.fillStyle = '#fff'; ellipse(ctx, -8, 43, 1.8, 1.8);
        ctx.fillStyle = i === 0 ? '#ef4444' : '#3b82f6'; // tiny caps
        ctx.beginPath(); ctx.arc(-6, 40, 5, Math.PI, 0); ctx.fill(); ctx.fillRect(-13, 39, 6, 2);
        ctx.strokeStyle = '#f97316'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-2, 64); ctx.lineTo(-2, 70); ctx.moveTo(3, 64); ctx.lineTo(3, 70); ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'RAT': {
      ellipse(ctx, 22, 58, 16, 10);            // body
      ellipse(ctx, 6, 54, 9, 7);               // head
      ellipse(ctx, 8, 46, 4, 4); ellipse(ctx, 14, 47, 4, 4); // ears
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fda4af'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(38, 60); ctx.quadraticCurveTo(50, 50, 46, 68); ctx.stroke(); // tail
      ctx.fillStyle = '#0f172a'; ellipse(ctx, 3, 52, 1.6, 1.6);
      ctx.fillStyle = '#fda4af'; ellipse(ctx, -3, 56, 2, 1.6);
      // Frayed rope in its teeth.
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-2, 58); ctx.quadraticCurveTo(-12, 66 + Math.sin(beat * Math.PI * 2) * 3, -20, 60); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-20, 60); ctx.lineTo(-24, 57); ctx.moveTo(-20, 60); ctx.lineTo(-25, 62); ctx.stroke();
      break;
    }
    case 'CRAB': {
      const side = Math.sin(beat * Math.PI) * 2;
      ctx.translate(side, 0);
      ellipse(ctx, 20, 60, 18, 10);            // shell
      for (const lx of [6, 12, 28, 34]) { ctx.fillRect(lx, 64, 2, 7); }
      ctx.beginPath(); ctx.arc(-2, 50, 7, 0, Math.PI * 2); ctx.fill();   // claws
      ctx.beginPath(); ctx.arc(42, 50, 7, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // Boombox on its back, speakers thumping on the beat.
      ctx.fillStyle = '#1e293b'; ctx.fillRect(8, 34, 24, 15);
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(14, 31, 12, 3);
      ctx.fillStyle = '#fb7185';
      ellipse(ctx, 14, 42, 3.5 + pulse * 1.5, 3.5 + pulse * 1.5); ellipse(ctx, 26, 42, 3.5 + pulse * 1.5, 3.5 + pulse * 1.5);
      ctx.fillStyle = '#fff'; ellipse(ctx, 14, 55, 2.5, 2.5); ellipse(ctx, 24, 55, 2.5, 2.5);
      ctx.fillStyle = '#0f172a'; ellipse(ctx, 14, 55, 1.2, 1.2); ellipse(ctx, 24, 55, 1.2, 1.2);
      break;
    }
    case 'CROW': {
      const flap = Math.sin(beat * Math.PI * 2);
      ctx.fillStyle = hurt ? '#ffffff' : '#1f2937';
      ctx.beginPath(); ctx.moveTo(20, 52); ctx.quadraticCurveTo(-4, 40 + flap * 12, -14, 50 + flap * 6); ctx.quadraticCurveTo(2, 54, 20, 58);
      ctx.moveTo(20, 52); ctx.quadraticCurveTo(44, 40 + flap * 12, 54, 50 + flap * 6); ctx.quadraticCurveTo(38, 54, 20, 58); ctx.fill();
      ellipse(ctx, 20, 55, 10, 9); ellipse(ctx, 10, 46, 7, 6);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(4, 45); ctx.lineTo(-4, 47); ctx.lineTo(4, 49); ctx.fill();
      ctx.fillStyle = '#fef08a'; ellipse(ctx, 8, 44, 1.6, 1.6);
      // Gold chain.
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(16, 54, 7, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.fillStyle = color; ellipse(ctx, 16, 62, 2.5, 2.5);
      break;
    }
    case 'MIMIC': {
      ctx.fillStyle = hurt ? '#ffffff' : '#0e7490';
      ctx.fillRect(2, 10, 36, 60);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#082f49'; ctx.fillRect(6, 16, 20, 30);
      const items = ['#f87171', '#fbbf24', '#4ade80', '#60a5fa'];
      items.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(8 + (i % 2) * 9, 19 + Math.floor(i / 2) * 13, 6, 9); });
      ctx.fillStyle = color; ctx.fillRect(29, 18, 6, 4); ctx.fillRect(29, 26, 6, 4);
      // The slot is a mouth with teeth, chewing on the beat.
      const open = 3 + pulse * 4;
      ctx.fillStyle = '#020617'; ctx.fillRect(6, 52, 28, open + 4);
      ctx.fillStyle = '#f8fafc';
      for (let tx = 7; tx < 33; tx += 5) { ctx.beginPath(); ctx.moveTo(tx, 52); ctx.lineTo(tx + 2.5, 56); ctx.lineTo(tx + 5, 52); ctx.fill(); }
      ctx.fillStyle = '#fde047'; ellipse(ctx, 12, 8, 3, 3); ellipse(ctx, 28, 8, 3, 3);
      break;
    }
    case 'BOUNCER': {
      ctx.beginPath(); ctx.roundRect(2, 26, 36, 36, 10); ctx.fill();   // torso
      ellipse(ctx, 20, 22, 11, 10);                                    // head
      ellipse(ctx, -4, 50, 7, 12); ellipse(ctx, 44, 50, 7, 12);        // arms
      ctx.fillRect(8, 60, 9, 10); ctx.fillRect(23, 60, 9, 10);         // legs
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0f172a'; ctx.fillRect(10, 18, 20, 5);          // shades
      ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 7px system-ui'; ctx.textAlign = 'center'; ctx.fillText('STAFF', 20, 42);
      break;
    }
  }
  ctx.restore();
};

/** Elite marker drawn around an enemy, distinct by shape (not just color). */
export const drawAffix = (ctx: CanvasRenderingContext2D, affix: string, color: string, beat: number, shieldUp: boolean) => {
  const p = Math.pow(1 - (beat - Math.floor(beat)), 3);
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; ctx.shadowColor = color; ctx.shadowBlur = 10;
  switch (affix) {
    case 'SHIELDED':
      if (!shieldUp) break;
      ctx.globalAlpha = 0.5 + 0.3 * p;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.lineTo(20 + Math.cos(a) * 34, 44 + Math.sin(a) * 34); }
      ctx.closePath(); ctx.stroke();
      break;
    case 'ARMORED':
      for (const [x, y] of [[4, 40], [36, 40], [4, 64], [36, 64]]) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeRect(0, 34, 40, 36);
      break;
    case 'HASTY':
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(48 + i * 3, 40 + i * 10); ctx.lineTo(62 + i * 3, 40 + i * 10); ctx.stroke(); }
      break;
    case 'MIRRORED':
      ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(20, 74); ctx.setLineDash([3, 3]); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(12, 4); ctx.lineTo(4, 8); ctx.lineTo(12, 12); ctx.moveTo(28, 4); ctx.lineTo(36, 8); ctx.lineTo(28, 12); ctx.stroke();
      break;
    case 'ECHO':
      ctx.globalAlpha = 0.25 + 0.25 * p;
      ctx.beginPath(); ctx.ellipse(20, 44, 30 + p * 8, 34 + p * 8, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(20, 44, 22 + p * 4, 26 + p * 4, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'SYNC_THIEF':
      for (const x of [6, 20, 34]) { ctx.beginPath(); ctx.moveTo(x, 72); ctx.quadraticCurveTo(x + 3, 78 + p * 4, x, 82 + p * 4); ctx.quadraticCurveTo(x - 3, 78 + p * 4, x, 72); ctx.fill(); }
      break;
  }
  ctx.restore();
};

const drawCrown = (ctx: CanvasRenderingContext2D, cx: number, y: number, color: string) => {
  ctx.save();
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(cx - 12, y); ctx.lineTo(cx - 10, y - 12); ctx.lineTo(cx - 4, y - 5); ctx.lineTo(cx, y - 14);
  ctx.lineTo(cx + 4, y - 5); ctx.lineTo(cx + 10, y - 12); ctx.lineTo(cx + 12, y); ctx.closePath();
  ctx.fill();
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
export const BACKDROP_RES = 2;

const rand = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/** Where the baked neon sign sits; the renderer flares the same text on the beat. */
export const SIGN = { x: 70, y: GROUND_Y - 132, text: 'HOP & SKIP' };
export const DISPLAY_FONT = "'Archivo Variable', system-ui, sans-serif";
// The sign is baked into the backdrop: rebuild once the display font has arrived.
if (typeof document !== 'undefined') void document.fonts?.load(`italic 900 22px ${DISPLAY_FONT}`).then(() => { backdrop = null; });

const LEFT = -400, SPAN = CANVAS_WIDTH + 800, TOP = -100;

/** Fades distant layers into the horizon glow: the cheapest way to sell depth. */
const haze = (ctx: CanvasRenderingContext2D, from: number, alpha: number) => {
  const g = ctx.createLinearGradient(0, from, 0, GROUND_Y);
  g.addColorStop(0, 'rgba(76, 29, 110, 0)');
  g.addColorStop(1, `rgba(76, 29, 110, ${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(LEFT, from, SPAN, GROUND_Y - from);
};

/**
 * One skyline layer. Each building picks its own window palette and occupancy, so lit floors
 * cluster the way real towers do instead of reading as noise.
 */
const skyline = (ctx: CanvasRenderingContext2D, r: () => number, o: {
  body: string; edge: string; minH: number; maxH: number; minW: number; maxW: number;
  windows: number; props: boolean; skip?: (x: number) => boolean;
}) => {
  let x = LEFT - r() * 40;
  while (x < LEFT + SPAN) {
    const w = o.minW + r() * (o.maxW - o.minW);
    const h = o.minH + r() * (o.maxH - o.minH);
    if (o.skip?.(x + w / 2)) { x += w; continue; }
    const top = GROUND_Y - h;
    ctx.fillStyle = o.body;
    ctx.fillRect(x, top, w - 3, h);
    // Rim of moonlight on the roof edge and the left face.
    ctx.fillStyle = o.edge;
    ctx.fillRect(x, top, w - 3, 1.5);
    ctx.fillRect(x, top, 1.5, h);
    // Stepped crown on some towers.
    if (r() < 0.3) {
      ctx.fillStyle = o.body;
      ctx.fillRect(x + w * 0.2, top - 14, w * 0.55, 14);
      ctx.fillStyle = o.edge;
      ctx.fillRect(x + w * 0.2, top - 14, w * 0.55, 1.5);
    }
    if (o.props) {
      const roll = r();
      ctx.fillStyle = o.body;
      if (roll < 0.25) {
        // Water tower.
        const tx = x + 8 + r() * (w - 30);
        ctx.fillRect(tx + 2, top - 10, 2, 10); ctx.fillRect(tx + 14, top - 10, 2, 10);
        ctx.beginPath(); ctx.moveTo(tx, top - 10); ctx.lineTo(tx + 18, top - 10); ctx.lineTo(tx + 18, top - 26);
        ctx.quadraticCurveTo(tx + 9, top - 34, tx, top - 26); ctx.fill();
      } else if (roll < 0.5) {
        // Antenna with an aircraft-warning light.
        const ax = x + w * (0.3 + r() * 0.4);
        const ah = 20 + r() * 30;
        ctx.fillRect(ax, top - ah, 1.5, ah);
        const g = ctx.createRadialGradient(ax + 1, top - ah, 0, ax + 1, top - ah, 7);
        g.addColorStop(0, 'rgba(255, 90, 90, 0.95)');
        g.addColorStop(1, 'rgba(255, 60, 60, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(ax - 7, top - ah - 7, 16, 14);
      } else if (roll < 0.7) {
        ctx.fillRect(x + 6, top - 6, 12, 6);
        ctx.fillRect(x + w - 24, top - 8, 14, 8);
      }
    }
    const warm = r() < 0.6;
    const occupancy = o.windows * (0.4 + r() * 0.9);
    const cols = Math.max(1, Math.floor((w - 14) / 10));
    for (let wy = top + 10; wy < GROUND_Y - 24; wy += 13) {
      const floorLit = r() < 0.12; // a whole floor with the lights on
      for (let c = 0; c < cols; c++) {
        if (!floorLit && r() > occupancy) continue;
        const a = 0.35 + r() * 0.55;
        ctx.fillStyle = warm
          ? (r() < 0.85 ? `rgba(255, 196, 120, ${a})` : `rgba(255, 240, 210, ${a})`)
          : (r() < 0.85 ? `rgba(120, 220, 255, ${a})` : `rgba(200, 160, 255, ${a})`);
        ctx.fillRect(x + 7 + c * 10, wy, 4, 6);
      }
    }
    x += w;
  }
};

/** A neon tube: a soft wide glow, the colored tube, then a hot near-white core. */
const neon = (ctx: CanvasRenderingContext2D, color: string, draw: (stroke: boolean) => void) => {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  ctx.strokeStyle = color; ctx.fillStyle = color;
  draw(false);
  ctx.shadowBlur = 8;
  draw(false);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = '#fff5fb'; ctx.fillStyle = '#fff5fb';
  draw(true);
  ctx.restore();
};

/**
 * Night alley, built for depth: sky and moon, three skyline layers fading into the horizon,
 * flanking towers with neon, street lamps, and a rain-wet court that mirrors the city.
 */
export const getBackdrop = () => {
  if (backdrop) return backdrop;
  const c = document.createElement('canvas');
  // Extends 400 world units past each side so wide screens still see skyline.
  // Rendered at 2x so it stays crisp on high-density phone screens.
  c.width = SPAN * BACKDROP_RES;
  c.height = (CANVAS_HEIGHT + 200) * BACKDROP_RES;
  const ctx = c.getContext('2d')!;
  ctx.scale(BACKDROP_RES, BACKDROP_RES);
  ctx.translate(400, 100);
  const r = rand(7);

  const sky = ctx.createLinearGradient(0, TOP, 0, GROUND_Y);
  sky.addColorStop(0, '#05030f');
  sky.addColorStop(0.45, '#120a2c');
  sky.addColorStop(0.8, '#2a0f3a');
  sky.addColorStop(1, '#4a1450');
  ctx.fillStyle = sky;
  ctx.fillRect(LEFT, TOP, SPAN, GROUND_Y - TOP);

  // Moon: wide halo, soft disc, faint maria.
  const halo = ctx.createRadialGradient(620, 90, 0, 620, 90, 220);
  halo.addColorStop(0, 'rgba(255, 200, 230, 0.35)');
  halo.addColorStop(0.2, 'rgba(244, 114, 182, 0.18)');
  halo.addColorStop(1, 'rgba(244, 114, 182, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(400, -130, 440, 440);
  const disc = ctx.createRadialGradient(612, 82, 4, 620, 90, 32);
  disc.addColorStop(0, '#fff6fb');
  disc.addColorStop(1, '#f9c6e0');
  ctx.fillStyle = disc;
  ellipse(ctx, 620, 90, 30, 30);
  ctx.fillStyle = 'rgba(214, 140, 190, 0.25)';
  ellipse(ctx, 610, 82, 8, 6); ellipse(ctx, 628, 100, 6, 5); ellipse(ctx, 630, 78, 4, 3);

  // Thin cloud bands catching the moonlight.
  for (let i = 0; i < 5; i++) {
    const y = 40 + i * 34 + r() * 20, x = LEFT + r() * SPAN;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 260);
    g.addColorStop(0, 'rgba(160, 90, 200, 0.10)');
    g.addColorStop(1, 'rgba(160, 90, 200, 0)');
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.12); ctx.translate(-x, -y);
    ctx.fillStyle = g; ctx.fillRect(x - 260, y - 260, 520, 520);
    ctx.restore();
  }

  // Horizon glow from the city.
  const glow = ctx.createLinearGradient(0, GROUND_Y - 200, 0, GROUND_Y);
  glow.addColorStop(0, 'rgba(236, 72, 153, 0)');
  glow.addColorStop(1, 'rgba(236, 72, 153, 0.22)');
  ctx.fillStyle = glow;
  ctx.fillRect(LEFT, GROUND_Y - 200, SPAN, 200);

  skyline(ctx, r, { body: '#241645', edge: 'rgba(190, 160, 255, 0.12)', minH: 170, maxH: 290, minW: 30, maxW: 70, windows: 0.12, props: true });
  haze(ctx, GROUND_Y - 300, 0.55);
  skyline(ctx, r, { body: '#160d33', edge: 'rgba(200, 170, 255, 0.16)', minH: 110, maxH: 220, minW: 45, maxW: 95, windows: 0.2, props: true });
  haze(ctx, GROUND_Y - 220, 0.4);
  // The near layer leaves the court's middle open so the fight reads against the bright haze.
  skyline(ctx, r, {
    body: '#0a0620', edge: 'rgba(255, 170, 220, 0.18)', minH: 60, maxH: 130, minW: 60, maxW: 120, windows: 0.28, props: false,
    skip: (cx) => cx > 180 && cx < 640
  });

  // Flanking towers frame the court on wide screens.
  const tower = (x: number, w: number, h: number) => {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#07041a'); g.addColorStop(1, '#0c0726');
    ctx.fillStyle = g;
    ctx.fillRect(x, GROUND_Y - h, w, h);
    ctx.fillStyle = 'rgba(255, 160, 220, 0.14)';
    ctx.fillRect(x + w - 1.5, GROUND_Y - h, 1.5, h);
  };
  tower(-400, 230, 420);
  tower(1000, 200, 440);

  // Neon: the crew's sign on the left wall, a vertical blade sign on the right tower.
  ctx.save();
  ctx.lineWidth = 2;
  neon(ctx, '#f472b6', (core) => {
    ctx.lineWidth = core ? 1 : 2.5;
    ctx.beginPath(); ctx.roundRect(SIGN.x - 12, SIGN.y - 26, 158, 38, 8); ctx.stroke();
  });
  ctx.font = `italic 900 22px ${DISPLAY_FONT}`;
  neon(ctx, '#f472b6', () => ctx.fillText(SIGN.text, SIGN.x, SIGN.y));
  ctx.font = `900 18px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  neon(ctx, '#22d3ee', () => {
    [...'DUTCH'].forEach((ch, i) => ctx.fillText(ch, 1040, GROUND_Y - 330 + i * 24));
  });
  neon(ctx, '#22d3ee', (core) => {
    ctx.lineWidth = core ? 1 : 2.5;
    ctx.beginPath(); ctx.roundRect(1024, GROUND_Y - 356, 32, 130, 6); ctx.stroke();
  });
  ctx.restore();

  // Street lamps throw cones of light onto the court.
  const lamp = (x: number) => {
    ctx.fillStyle = '#05030f';
    ctx.fillRect(x - 1.5, GROUND_Y - 150, 3, 150);
    ctx.fillRect(x - 1.5, GROUND_Y - 150, 22, 3);
    const bulb = ctx.createRadialGradient(x + 18, GROUND_Y - 146, 0, x + 18, GROUND_Y - 146, 18);
    bulb.addColorStop(0, 'rgba(255, 236, 200, 1)');
    bulb.addColorStop(1, 'rgba(255, 200, 140, 0)');
    ctx.fillStyle = bulb;
    ctx.fillRect(x, GROUND_Y - 164, 36, 36);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cone = ctx.createLinearGradient(0, GROUND_Y - 146, 0, GROUND_Y + 20);
    cone.addColorStop(0, 'rgba(255, 210, 160, 0.16)');
    cone.addColorStop(1, 'rgba(255, 210, 160, 0.02)');
    ctx.fillStyle = cone;
    ctx.beginPath(); ctx.moveTo(x + 14, GROUND_Y - 146); ctx.lineTo(x + 22, GROUND_Y - 146);
    ctx.lineTo(x + 80, GROUND_Y + 20); ctx.lineTo(x - 44, GROUND_Y + 20); ctx.fill();
    ctx.restore();
  };
  lamp(-60);
  lamp(880);

  // Wet court: mirror everything above the ground line, then darken with distance.
  const groundPx = (GROUND_Y + 100) * BACKDROP_RES;
  const depth = c.height - groundPx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#07041a';
  ctx.fillRect(0, groundPx, c.width, depth);
  ctx.translate(0, groundPx * 2);
  ctx.scale(1, -1);
  // Stacked, slightly offset copies smear the reflection like rain on asphalt.
  for (let i = 0; i < 4; i++) {
    ctx.globalAlpha = 0.16 - i * 0.03;
    ctx.drawImage(c, 0, groundPx - depth, c.width, depth, 0, groundPx - depth - i * 3 * BACKDROP_RES, c.width, depth);
  }
  ctx.restore();
  const fade = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_HEIGHT + 100);
  fade.addColorStop(0, 'rgba(7, 4, 26, 0.15)');
  fade.addColorStop(0.5, 'rgba(5, 3, 18, 0.7)');
  fade.addColorStop(1, 'rgba(2, 2, 8, 0.97)');
  ctx.fillStyle = fade;
  ctx.fillRect(LEFT, GROUND_Y, SPAN, CANVAS_HEIGHT + 100 - GROUND_Y);

  // Court markings in perspective: depth lines converge on a vanishing point above the court.
  ctx.save();
  ctx.beginPath(); ctx.rect(LEFT, GROUND_Y, SPAN, 300); ctx.clip();
  ctx.lineWidth = 1;
  for (let i = 1; i < 12; i++) {
    const y = GROUND_Y + i * i * 2.2;
    ctx.strokeStyle = `rgba(167, 139, 250, ${0.14 - i * 0.008})`;
    ctx.beginPath(); ctx.moveTo(LEFT, y); ctx.lineTo(LEFT + SPAN, y); ctx.stroke();
  }
  const vx = 400; // vanishing point sits 260 units above the court line
  for (let i = -14; i <= 14; i++) {
    const bx = vx + i * 120;
    ctx.strokeStyle = `rgba(167, 139, 250, ${0.1 - Math.abs(i) * 0.005})`;
    ctx.beginPath();
    ctx.moveTo(vx + (bx - vx) * (260 / 560), GROUND_Y);
    ctx.lineTo(bx, GROUND_Y + 300);
    ctx.stroke();
  }
  ctx.restore();

  // Court line: glow, tube, hot core.
  ctx.save();
  const lineGlow = ctx.createLinearGradient(0, GROUND_Y - 12, 0, GROUND_Y + 12);
  lineGlow.addColorStop(0, 'rgba(0, 210, 255, 0)');
  lineGlow.addColorStop(0.5, 'rgba(0, 210, 255, 0.28)');
  lineGlow.addColorStop(1, 'rgba(0, 210, 255, 0)');
  ctx.fillStyle = lineGlow;
  ctx.fillRect(LEFT, GROUND_Y - 12, SPAN, 24);
  ctx.fillStyle = '#00d2ff';
  ctx.fillRect(LEFT, GROUND_Y - 1, SPAN, 2);
  ctx.fillStyle = 'rgba(220, 250, 255, 0.9)';
  ctx.fillRect(LEFT, GROUND_Y - 0.4, SPAN, 0.8);
  ctx.restore();

  backdrop = c;
  return c;
};
