import type { BroKey, EnemyTypeId } from '../data/config';
import type { Engine } from './engine';

// Sprite animation: clip definitions (the contract with the art pipeline, mirrored in
// docs/ART_SPEC.md), a loader for sprite strips listed in /assets/sprites/manifest.json, and
// per-character animators that pick a clip from game state. Anything without art yet falls back
// to the procedural drawing, so assets can land one clip at a time.

export type RabbitClip =
  | 'idle' | 'windup' | 'jump' | 'land' | 'trip' | 'launch' | 'attack' | 'tag' | 'hurt' | 'ko' | 'victory';
export type EnemyClip = 'idle' | 'telegraph' | 'attack' | 'hurt' | 'defeat';

export interface ClipSpec {
  /** Recommended frame count at 24 fps (the spec sheet's budget). */
  frames: number;
  loop: boolean;
  /**
   * How playback time is driven:
   *  - 'time'    plays at fps
   *  - 'beats'   one loop lasts `beats` beats of the music (retimed to any tempo)
   *  - 'airtime' frame follows the jump arc: first frame at takeoff, last at landing
   */
  drive: 'time' | 'beats' | 'airtime';
  beats?: number;
  desc: string;
}

/** Attack clips make contact on this frame; the game enters them there, at the moment of the hit. */
export const CONTACT_FRAME = 4;

export const RABBIT_CLIPS: Record<RabbitClip, ClipSpec> = {
  idle: { frames: 32, loop: true, drive: 'beats', beats: 2, desc: 'Breathing idle with personality. Loops every 2 beats.' },
  windup: { frames: 16, loop: true, drive: 'beats', beats: 1, desc: 'Ready stance between rope jumps while charging a skill. 1-beat loop.' },
  jump: { frames: 16, loop: false, drive: 'airtime', desc: 'Takeoff → apex → touchdown over the rope. Retimed to airtime.' },
  land: { frames: 6, loop: false, drive: 'time', desc: 'Short landing settle (squash). One-shot.' },
  trip: { frames: 18, loop: false, drive: 'time', desc: 'Rope catches the feet: stumble, flail, recover. Comedic.' },
  launch: { frames: 12, loop: false, drive: 'airtime', desc: 'Leap out of the rope toward the enemy. Retimed to airtime.' },
  attack: { frames: 14, loop: false, drive: 'time', desc: 'Strike. Contact on frame 4 (hit-stop freezes there). Hop kicks, Skip spins.' },
  tag: { frames: 12, loop: false, drive: 'time', desc: 'Partner flying in for the tag strike. Contact on frame 4.' },
  hurt: { frames: 10, loop: false, drive: 'time', desc: 'Hit reaction, knocked back.' },
  ko: { frames: 20, loop: false, drive: 'time', desc: 'Knocked out: fall and stay down (holds last frame).' },
  victory: { frames: 24, loop: true, drive: 'beats', beats: 2, desc: 'Celebration. Hop & Skip fist-bump. 2-beat loop.' }
};

export const ENEMY_CLIPS: Record<EnemyClip, ClipSpec> = {
  idle: { frames: 16, loop: true, drive: 'beats', beats: 1, desc: 'Bobbing on the beat.' },
  telegraph: { frames: 12, loop: true, drive: 'beats', beats: 1, desc: 'Wind-up warning before an attack. Must read instantly.' },
  attack: { frames: 10, loop: false, drive: 'time', desc: 'Releases the attack.' },
  hurt: { frames: 6, loop: false, drive: 'time', desc: 'Flinch when hit.' },
  defeat: { frames: 16, loop: false, drive: 'time', desc: 'K.O. (holds last frame).' }
};

/** Sprite asset ids. Rabbits use their names; enemies use their type in lower case. */
export const SPRITE_ID: Record<BroKey, string> = { red: 'hop', blue: 'skip' };
export const enemySpriteId = (t: EnemyTypeId) => t.toLowerCase();

// ---------------- Loading ----------------

export interface ManifestClip {
  frames: number;
  /** Playback rate for 'time' clips. Default 24. */
  fps?: number;
  /** Cell size in px. Default [256, 256]. */
  cell?: [number, number];
  /** Pixel in the cell that sits on the ground under the character's center. Default [128, 248]. */
  pivot?: [number, number];
  /** Pixels per world unit. Default 2 (art is authored at 2x). */
  scale?: number;
  /** Per frame, where the hands are in the cell: [leftX, leftY, rightX, rightY] px. Rope clips only. */
  hands?: number[][];
}
export type Manifest = Record<string, Record<string, ManifestClip>>;

interface LoadedClip extends Required<ManifestClip> { img: HTMLImageElement }

class SpriteLibrary {
  private clips = new Map<string, LoadedClip>();
  private started = false;

  /** Fetch the manifest and start loading every strip. Missing or broken art is simply skipped. */
  load(base = '/assets/sprites') {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    fetch(`${base}/manifest.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((manifest: Manifest) => {
        for (const [char, clips] of Object.entries(manifest)) {
          for (const [clip, m] of Object.entries(clips)) {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => this.clips.set(`${char}/${clip}`, {
              frames: m.frames, fps: m.fps ?? 24, cell: m.cell ?? [256, 256], pivot: m.pivot ?? [128, 248], scale: m.scale ?? 2, hands: m.hands ?? [], img
            });
            img.src = `${base}/${char}/${clip}.png`;
          }
        }
      })
      .catch(() => { /* no manifest: everything stays procedural */ });
  }

  get(char: string, clip: string) { return this.clips.get(`${char}/${clip}`); }
}

export const sprites = new SpriteLibrary();

// ---------------- Playback ----------------

/** Remembers when the current clip started so one-shots play from frame 0. */
export class Animator {
  clip = '';
  private start = 0;

  /** `lead` starts the clip that many seconds in (e.g. to land on its contact frame). */
  set(clip: string, now: number, lead = 0) {
    if (clip !== this.clip) { this.clip = clip; this.start = now - lead; }
  }

  elapsed(now: number) { return now - this.start; }
}

export interface PlaybackContext { now: number; beat: number; airProgress: number }

/** Frame index for a clip under its drive mode. Non-looping clips hold their last frame. */
export const frameIndex = (spec: ClipSpec, frames: number, fps: number, elapsed: number, ctx: PlaybackContext) => {
  let f: number;
  if (spec.drive === 'beats') {
    const len = spec.beats ?? 1;
    const phase = (((ctx.beat % len) + len) % len) / len;
    f = Math.floor(phase * frames);
  } else if (spec.drive === 'airtime') {
    f = Math.floor(Math.max(0, Math.min(0.999, ctx.airProgress)) * frames);
  } else {
    f = Math.floor(elapsed * fps);
  }
  return spec.loop ? ((f % frames) + frames) % frames : Math.min(frames - 1, f);
};

/** Which clip a rabbit should be playing right now. One place to tune animation logic. */
export const rabbitClip = (e: Engine, k: BroKey, prevClip: string): RabbitClip => {
  const bro = e.bros[k], body = e.body[k];
  const id = k === 'red' ? 'RED' : 'BLUE';
  if (bro.hp <= 0) return 'ko';
  if (body.hurtT && body.hurtT > 0) return 'hurt';
  if (e.activeAttacker === id) {
    if (e.phase === 'IMPACT') return e.comboCount > 0 ? 'tag' : 'attack';
    if (e.phase === 'LAUNCH') return 'launch';
  }
  if (e.phase === 'WINDUP' && e.turn === id && e.missLocked) return 'trip';
  if (body.jumping) return 'jump';
  if (prevClip === 'jump' || prevClip === 'launch') return 'land';
  if (prevClip === 'land' && (body.squash ?? 0) > 0.15) return 'land';
  // While the rope is out, both rabbits skip it; the guard-up idle is for the enemy's turn.
  if (e.phase !== 'ENEMY_TURN') return 'windup';
  return 'idle';
};

/** 0 at takeoff, 1 at landing, from current vertical speed vs. takeoff speed. */
export const airProgress = (vy: number, launchVy: number | undefined) => {
  const v0 = launchVy && launchVy < 0 ? launchVy : -11;
  // vy runs from v0 (negative, rising) to -v0 at touchdown.
  return (vy - v0) / (-2 * v0);
};
