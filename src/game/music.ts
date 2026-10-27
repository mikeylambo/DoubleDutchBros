import { audio } from './audio';

// The song is the master clock. Everything rhythmic (rope peaks, enemy attacks, world pulses)
// reads its beat from here, so the game is always on the music the player actually hears.

export interface Track {
  url: string;
  /** Measured from the master (see docs/ART_SPEC.md → Music). */
  bpm: number;
  /** Seconds from file start to beat 0. */
  offset: number;
}

export const TRACKS = {
  neonStriker: { url: '/audio/neon-striker.mp3', bpm: 88.735, offset: 0.0495 }
} satisfies Record<string, Track>;

export interface BeatClock {
  /** Beat number (fractional) at an audio-clock time. Monotonic. */
  beatAt(t: number): number;
  /** Audio-clock time of a given beat. */
  timeOfBeat(beat: number): number;
  readonly bpm: number;
  /** True when beats come from real music playback. */
  readonly live: boolean;
}

/** Beats at a fixed tempo from an arbitrary start time. Used before music loads, and in tests. */
export class FreeClock implements BeatClock {
  readonly live = false;
  constructor(readonly bpm: number, private t0 = 0) {}
  beatAt(t: number) { return ((t - this.t0) * this.bpm) / 60; }
  timeOfBeat(b: number) { return this.t0 + (b * 60) / this.bpm; }
}

/**
 * Streams a track through an <audio> element (a 6-minute song decoded to PCM is ~140 MB, too much
 * for phones) and estimates the element's position on the audio clock. Element `currentTime` is
 * coarse in some browsers, so the anchor is smoothed and only snapped on real jumps (seek/stall).
 */
class MusicPlayer implements BeatClock {
  private el: HTMLAudioElement | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private track: Track = TRACKS.neonStriker;
  private anchor = 0;            // audio-clock time when song time was 0
  private anchored = false;
  private lastCt = -1;
  private loops = 0;
  private fallback = new FreeClock(TRACKS.neonStriker.bpm);
  volume = 0.8;

  get bpm() { return this.track.bpm; }
  get live() { return this.anchored && !!this.el && !this.el.paused; }

  private get period() { return 60 / this.track.bpm; }
  /** Whole beats per loop, so the beat number keeps counting across the loop point. */
  private get beatsPerLoop() { return this.el ? Math.ceil((this.el.duration - this.track.offset) / this.period) : 0; }

  /** Call from a user gesture. Safe to call repeatedly. */
  play(track: Track = this.track) {
    if (typeof window === 'undefined') return;
    audio.unlock();
    const ctx = audio.context;
    if (!ctx) return;
    if (!this.el || this.track.url !== track.url) {
      this.track = track;
      this.fallback = new FreeClock(track.bpm, audio.now());
      this.el = new Audio(track.url);
      this.el.loop = true;
      this.el.preload = 'auto';
      this.el.crossOrigin = 'anonymous';
      const src = ctx.createMediaElementSource(this.el);
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 20000;
      this.gain = ctx.createGain();
      this.gain.gain.value = this.volume;
      src.connect(this.filter).connect(this.gain).connect(ctx.destination);
      this.anchored = false; this.loops = 0; this.lastCt = -1;
    }
    if (this.el.paused) void this.el.play().catch(() => { /* blocked until a gesture; retried on next play() */ });
  }

  /** Muffle the music (pause menus, game over) without losing the beat. */
  duck(on: boolean) {
    const ctx = audio.context;
    if (!ctx || !this.filter || !this.gain) return;
    const t = ctx.currentTime;
    this.filter.frequency.setTargetAtTime(on ? 700 : 20000, t, 0.08);
    this.gain.gain.setTargetAtTime(on ? this.volume * 0.6 : this.volume, t, 0.08);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.gain && audio.context) this.gain.gain.setTargetAtTime(v, audio.context.currentTime, 0.05);
  }

  /** Re-estimate the anchor. Called once per frame by the engine. */
  sync() {
    const el = this.el;
    if (!el || el.paused || !audio.running || !isFinite(el.duration)) return;
    const ct = el.currentTime;
    if (ct === this.lastCt) return;
    if (this.lastCt >= 0 && ct < this.lastCt - 1) this.loops++;  // wrapped at loop point
    this.lastCt = ct;
    const songTime = this.loops * this.beatsPerLoop * this.period + ct;
    const estimate = audio.now() - songTime;
    if (!this.anchored || Math.abs(estimate - this.anchor) > 0.08) {
      // First lock (or a real jump): adopt it, and re-base the fallback so the beat doesn't hop.
      this.anchor = estimate;
      this.anchored = true;
    } else {
      this.anchor += (estimate - this.anchor) * 0.05;
    }
  }

  beatAt(t: number) {
    if (!this.live) return this.fallback.beatAt(t);
    return (t - this.anchor - this.track.offset) / this.period;
  }

  timeOfBeat(b: number) {
    if (!this.live) return this.fallback.timeOfBeat(b);
    return this.anchor + this.track.offset + b * this.period;
  }
}

export const music = new MusicPlayer();
