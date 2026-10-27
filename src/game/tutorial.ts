import type { BroId } from '../data/config';
import type { Phase } from './types';

// The first-run guided fight. One slime, no real damage, slowed rope. Each step advances on a
// gameplay event (see Engine.advanceTutorial), so players learn by doing rather than reading.

export type TutorialStep = 'ATTACK' | 'TAG' | 'DODGE' | 'SKILL' | 'FINISH';

export const TUTORIAL_ROPE_SPEED = 0.045;
export const TUTORIAL_IMPACT_SCALE = 1.8;
export const TUTORIAL_SLIME_HP = 90;

const button = (id: BroId) => (id === 'RED' ? 'A' : 'B');

export const tutorialHint = (step: TutorialStep, phase: Phase, turn: BroId, name: (id: BroId) => string, windupLeft: number): string | null => {
  const me = name(turn);
  const partner: BroId = turn === 'RED' ? 'BLUE' : 'RED';
  switch (step) {
    case 'ATTACK':
      if (phase === 'MENU') return `${me}'s turn. Press ATTACK.`;
      if (phase === 'TARGET') return `Tap the slime, or press ${button(turn)}.`;
      return null;
    case 'TAG':
      if (phase === 'IMPACT') return `${name(partner)}'s button is flashing. Tap ${button(partner)} to tag in!`;
      return 'Every tag extends the combo.';
    case 'DODGE':
      return 'The slime strikes back! Watch the red lane, then tap a button to jump the wave.';
    case 'SKILL':
      if (phase === 'MENU') return `${me}'s turn. Skills charge on the rope: press SKILL.`;
      if (phase === 'TECH_SELECT') return 'Choose RHYTHM VAULT.';
      if (phase === 'TARGET') return 'Pick the slime.';
      if (phase === 'WINDUP') return `Press ${button(turn)} as a rope sweeps the floor (the glow turns gold). ${windupLeft} to go!`;
      return null;
    case 'FINISH':
      if (phase === 'MENU' || phase === 'TECH_SELECT' || phase === 'TARGET') return 'Finish it with any move you like.';
      return null;
  }
};

/** Which menu actions each step allows. Everything else is ignored so the player can't wander off. */
export const tutorialAllows = (step: TutorialStep, action: string) => {
  if (action === 'BACK') return true;
  if (step === 'ATTACK') return action === 'BASIC';
  if (step === 'SKILL') return action === 'TECH' || action === 'TECH1';
  return true;
};
