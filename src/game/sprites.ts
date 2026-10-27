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
    ctx.globalAlpha = 0.6;
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
      ctx.globalAlpha = 0.55 + 0.45 * off;
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(20, 50); ctx.scale(side, 1); ctx.rotate(-0.3 + flap * 0.4);
        ellipse(ctx, 14, -6, 15, 10, -0.5); ellipse(ctx, 10, 8, 9, 7, 0.4);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
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

/** Night alley: moon, two layers of skyline with lit windows, a neon sign, and the court floor. */
export const getBackdrop = () => {
  if (backdrop) return backdrop;
  const c = document.createElement('canvas');
  // Extends 400 world units past each side so wide screens still see skyline.
  // Rendered at 2x so it stays crisp on high-density phone screens.
  c.width = (CANVAS_WIDTH + 800) * BACKDROP_RES;
  c.height = (CANVAS_HEIGHT + 200) * BACKDROP_RES;
  const ctx = c.getContext('2d')!;
  ctx.scale(BACKDROP_RES, BACKDROP_RES);
  ctx.translate(400, 100);
  const r = rand(7);

  const sky = ctx.createLinearGradient(0, -100, 0, GROUND_Y);
  sky.addColorStop(0, '#05030f');
  sky.addColorStop(0.6, '#140b2e');
  sky.addColorStop(1, '#2a0f3a');
  ctx.fillStyle = sky;
  ctx.fillRect(-400, -100, CANVAS_WIDTH + 800, GROUND_Y + 100);

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
    let x = -400;
    while (x < CANVAS_WIDTH + 400) {
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
  ctx.fillRect(-400, GROUND_Y, CANVAS_WIDTH + 800, 300);
  ctx.strokeStyle = 'rgba(167, 139, 250, 0.18)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 12; i++) {
    const y = GROUND_Y + i * i * 2.2;
    ctx.beginPath(); ctx.moveTo(-400, y); ctx.lineTo(CANVAS_WIDTH + 400, y); ctx.stroke();
  }
  ctx.save();
  ctx.strokeStyle = '#00d2ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#00d2ff';
  ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(-400, GROUND_Y); ctx.lineTo(CANVAS_WIDTH + 400, GROUND_Y); ctx.stroke();
  ctx.restore();

  backdrop = c;
  return c;
};
