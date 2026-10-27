// Web Audio is the master clock. The sim reads time from here so rope timing can't drift with
// frame rate, and rope beats are scheduled on the audio timeline rather than "whenever a frame lands".

type Sfx = 'pulse' | 'tick' | 'perfect' | 'trip' | 'hit' | 'crit' | 'sync' | 'hurt' | 'ko' | 'ui';

class AudioClock {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  /** Player setting; off silences all vibration. */
  hapticsEnabled = true;
  /** SFX volume 0..1, kept so it applies even if set before the context exists. */
  private volume = 0.8;
  private gestureHooks = new Set<() => void>();
  private listening = false;

  /**
   * Create/resume the audio context. Browsers only allow this inside a user activation, and on
   * phones a finger landing (pointerdown) is NOT one: only the release (touchend/pointerup/click)
   * is. So besides calling this from game input, we listen for real activations app-wide.
   */
  unlock() {
    if (typeof window === 'undefined') return;
    this.listenForGestures();
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      // iOS: treat the page as media playback so the ring/silent switch doesn't mute it (Safari 16.4+).
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) { try { session.type = 'playback'; } catch { /* unsupported */ } }
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * 0.6;
      this.master.connect(this.ctx.destination);
    }
    // 'interrupted' happens on iOS after calls/backgrounding.
    if (this.ctx.state !== 'running') {
      void this.ctx.resume().catch(() => {});
      // Older iOS also needs a sound started inside the gesture: one silent sample.
      const buf = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.connect(this.ctx.destination); src.start(0);
    }
  }

  /** Run `fn` on every real user activation (e.g. to retry music playback). */
  onGesture(fn: () => void) { this.gestureHooks.add(fn); this.listenForGestures(); }

  private listenForGestures() {
    if (this.listening || typeof window === 'undefined') return;
    this.listening = true;
    const handler = () => { this.unlock(); this.gestureHooks.forEach((fn) => fn()); };
    for (const type of ['pointerup', 'touchend', 'click', 'keydown'] as const) {
      window.addEventListener(type, handler, { capture: true, passive: true });
    }
  }

  get context() { return this.ctx; }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v * 0.6, this.ctx.currentTime, 0.05);
  }

  get running() { return !!this.ctx && this.ctx.state === 'running'; }

  /** Seconds. Audio clock when available, performance clock otherwise. */
  now() { return this.running ? this.ctx!.currentTime : performance.now() / 1000; }

  /** Convert a DOM event timestamp (performance clock) to this clock, so presses are judged when they happened. */
  fromEventTime(ts: number) { return this.now() - Math.max(0, performance.now() - ts) / 1000; }

  /** Output latency the player hears, used to line up judgments with what they hear. */
  get outputLatency() {
    if (!this.ctx) return 0;
    return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
  }

  /** Short haptic tap where supported (Android/Chrome). Silently ignored elsewhere. */
  buzz(ms: number) {
    if (!this.hapticsEnabled || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try { navigator.vibrate(ms); } catch { /* unsupported */ }
  }

  play(sfx: Sfx, at?: number) {
    if (!this.running || this.muted) return;
    const ctx = this.ctx!;
    const t = Math.max(ctx.currentTime, at ?? ctx.currentTime);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(this.master!);
    const env = (peak: number, dur: number) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.start(t); osc.stop(t + dur + 0.02);
    };
    switch (sfx) {
      case 'pulse': osc.type = 'sine'; osc.frequency.setValueAtTime(110, t); osc.frequency.exponentialRampToValueAtTime(45, t + 0.09); env(0.25, 0.1); break;
      case 'tick': osc.type = 'square'; osc.frequency.setValueAtTime(1600, t); env(0.08, 0.03); break;
      case 'perfect': osc.type = 'triangle'; osc.frequency.setValueAtTime(880, t); osc.frequency.exponentialRampToValueAtTime(1760, t + 0.08); env(0.3, 0.15); break;
      case 'trip': osc.type = 'sawtooth'; osc.frequency.setValueAtTime(220, t); osc.frequency.exponentialRampToValueAtTime(60, t + 0.25); env(0.3, 0.3); break;
      case 'hit': osc.type = 'square'; osc.frequency.setValueAtTime(180, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.12); env(0.5, 0.14); break;
      case 'crit': osc.type = 'sawtooth'; osc.frequency.setValueAtTime(320, t); osc.frequency.exponentialRampToValueAtTime(50, t + 0.2); env(0.55, 0.22); break;
      case 'sync': osc.type = 'triangle'; osc.frequency.setValueAtTime(660, t); osc.frequency.setValueAtTime(990, t + 0.05); env(0.35, 0.16); break;
      case 'hurt': osc.type = 'sawtooth'; osc.frequency.setValueAtTime(140, t); env(0.4, 0.2); break;
      case 'ko': osc.type = 'triangle'; osc.frequency.setValueAtTime(520, t); osc.frequency.exponentialRampToValueAtTime(130, t + 0.4); env(0.35, 0.45); break;
      case 'ui': osc.type = 'sine'; osc.frequency.setValueAtTime(700, t); env(0.12, 0.05); break;
    }
  }
}

export const audio = new AudioClock();
