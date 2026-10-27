import { BrowserInputSource, InputManager, type InputBinding } from '@slu/web-shell';
import type { MenuAction } from '../game/engine';
import { audio } from '../game/audio';
import type { Engine } from '../game/engine';

// One input layer: keyboard, gamepad and touch all fire the same semantic actions.
// Keyboard and touch keep their exact event timestamps (rhythm judging needs them);
// gamepads are polled once per frame through the shell's input system.

export type Action = 'hop' | 'skip' | 'pause' | 'attack' | 'skill' | 'items' | 'ult' | 'back'
  | 'ui_up' | 'ui_down' | 'ui_left' | 'ui_right' | 'ui_accept';

/** Standard gamepad layout: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 8 Back, 9 Start, 12–15 D-pad. */
export const BINDINGS: (InputBinding & { action: Action })[] = [
  { action: 'hop', keyboard: ['KeyJ', 'ArrowRight'], gamepadButtons: [0, 5, 7] },
  { action: 'skip', keyboard: ['KeyF', 'ArrowLeft'], gamepadButtons: [1, 4, 6] },
  { action: 'pause', keyboard: ['Escape'], gamepadButtons: [9] },
  { action: 'attack', keyboard: ['Digit1'] },
  { action: 'skill', keyboard: ['Digit2'] },
  { action: 'items', keyboard: ['Digit3'] },
  { action: 'ult', keyboard: ['Digit4'] },
  { action: 'back', keyboard: ['Backspace'], gamepadButtons: [8] },
  { action: 'ui_up', keyboard: ['ArrowUp'], gamepadButtons: [12], gamepadAxes: [{ axis: 1, direction: -1, threshold: 0.6 }] },
  { action: 'ui_down', keyboard: ['ArrowDown'], gamepadButtons: [13], gamepadAxes: [{ axis: 1, direction: 1, threshold: 0.6 }] },
  { action: 'ui_left', gamepadButtons: [14], gamepadAxes: [{ axis: 0, direction: -1, threshold: 0.6 }] },
  { action: 'ui_right', gamepadButtons: [15], gamepadAxes: [{ axis: 0, direction: 1, threshold: 0.6 }] },
  { action: 'ui_accept', keyboard: ['Enter'] }
];

const MENU: Partial<Record<Action, MenuAction>> = { attack: 'BASIC', skill: 'TECH', items: 'ITEMS', ult: 'ULT', back: 'BACK' };

/** Phases where A/B are always Hop/Skip, never menu confirm/back. */
const RHYTHM_PHASES = new Set(['TARGET', 'WINDUP', 'LAUNCH', 'IMPACT', 'RETURN', 'ENEMY_TURN', 'ITEMS_TARGETING']);

// ---------------- Menu focus (gamepad / arrow keys) ----------------

const navTargets = () =>
  [...document.querySelectorAll<HTMLElement>('[data-nav]')].filter((el) => el.offsetParent !== null && !el.closest('[aria-hidden="true"]'));

/** Only the topmost layer is navigable: overlays (z-index ≥ 100) win over the battle HUD. */
const topLayer = (els: HTMLElement[]) => {
  const inOverlay = els.filter((el) => el.closest('[data-layer="overlay"]'));
  return inOverlay.length ? inOverlay : els;
};

let focused: HTMLElement | null = null;
const setFocus = (el: HTMLElement | null) => {
  focused?.removeAttribute('data-focused');
  focused = el;
  focused?.setAttribute('data-focused', '');
  focused?.scrollIntoView({ block: 'nearest' });
};

const moveFocus = (dir: 'up' | 'down' | 'left' | 'right') => {
  const els = topLayer(navTargets());
  if (!els.length) return;
  if (!focused || !els.includes(focused)) return setFocus(els[0]);
  const a = focused.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const el of els) {
    if (el === focused) continue;
    const b = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
    const forward = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    if (forward <= 4) continue;
    const side = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    const score = forward + side * 2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) setFocus(best);
};

const activateFocus = () => {
  if (!focused || !navTargets().includes(focused)) return false;
  focused.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  if (focused instanceof HTMLInputElement) return true;
  focused.click?.();
  return true;
};

// ---------------- Dispatch ----------------

/** Route one semantic action. `at` is the audio-clock time it happened. `pad` = came from a gamepad. */
export const dispatch = (engine: Engine, action: Action, at: number, pad = false) => {
  const menuOpen = engine.gameState !== 'BATTLE' || !RHYTHM_PHASES.has(engine.phase);

  if (action === 'pause') {
    if (engine.gameState === 'PAUSE') engine.resume(); else engine.pause();
    return;
  }
  if (action.startsWith('ui_') && action !== 'ui_accept') return moveFocus(action.slice(3) as 'up');
  if (action === 'ui_accept') { activateFocus(); return; }

  // On a gamepad, in menus, A confirms and B goes back. Everywhere else they are Hop and Skip.
  if (pad && menuOpen && (action === 'hop' || action === 'skip')) {
    if (action === 'hop') { if (!activateFocus()) moveFocus('down'); return; }
    if (engine.gameState === 'PAUSE') engine.resume(); else engine.action('BACK');
    return;
  }
  if (action === 'hop') return engine.input('RED', at);
  if (action === 'skip') return engine.input('BLUE', at);
  const menu = MENU[action];
  if (menu) engine.action(menu, at);
};

/** Wire keyboard (event-timed) and gamepads (polled) to the engine. Returns a detach function. */
export const attachInput = (engine: Engine) => {
  const byKey = new Map<string, Action>();
  for (const b of BINDINGS) for (const code of b.keyboard ?? []) byKey.set(code, b.action);

  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || (e.target instanceof HTMLInputElement && e.target.type !== 'range')) return;
    const action = byKey.get(e.code);
    if (!action) return;
    e.preventDefault();
    audio.unlock();
    dispatch(engine, action, audio.fromEventTime(e.timeStamp));
  };
  window.addEventListener('keydown', onKey);

  // Gamepads: poll each frame, fire on press edges. Keyboard is handled above, so poll pads only.
  const padBindings = BINDINGS.map((b) => ({ ...b, keyboard: undefined }));
  const source = new BrowserInputSource(padBindings);
  const manager = new InputManager();
  manager.setBindings(padBindings);
  let raf = 0;
  const poll = () => {
    manager.update(source.poll());
    // Half a frame back: the press happened sometime since the last poll.
    const at = audio.now() - 1 / 120;
    for (const b of padBindings) {
      if (manager.wasPressed(b.action)) { audio.unlock(); dispatch(engine, b.action, at, true); }
    }
    raf = requestAnimationFrame(poll);
  };
  raf = requestAnimationFrame(poll);

  // Focus belongs to whatever screen is showing; drop it when the menu changes.
  const unsub = engine.subscribe(() => { if (focused && !document.contains(focused)) setFocus(null); });

  return () => { window.removeEventListener('keydown', onKey); cancelAnimationFrame(raf); unsub(); };
};
