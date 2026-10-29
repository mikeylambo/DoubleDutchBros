// The game's icon set: simple filled glyphs on a tinted badge, so moves, items, stats and perks read
// as one family instead of a mix of platform emoji. Data still names icons by emoji (src/data/config.ts);
// this maps each to its glyph and colour. Anything without a glyph yet keeps its emoji, inside the
// same badge so it still sits in the set.

type Glyph = { d: string; color: string };
const G: Record<string, Glyph> = {
  // Moves
  '👊': { color: '#f8fafc', d: 'M3 14l9-11 1 7h8l-9 11-1-7z' },
  '🔥': { color: '#fb923c', d: 'M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z' },
  '🦅': { color: '#7dd3fc', d: 'M2 8l7 2 3-5 3 5 7-2-5 6 1 6-6-3-6 3 1-6z' },
  '⚡': { color: '#facc15', d: 'M13 2L5 14h6l-1 8 8-12h-6z' },
  '🥊': { color: '#f87171', d: 'M7 4h7a5 5 0 015 5v4a4 4 0 01-4 4H9v3H6v-4a4 4 0 01-2-3V7a3 3 0 013-3zm2 4v3h6V8z' },
  '🪁': { color: '#c084fc', d: 'M12 2l7 8-7 12-7-12zm0 4l-3.5 4h7z' },
  '🌀': { color: '#f0abfc', d: 'M12 3a9 9 0 019 9h-3a6 6 0 00-6-6V3zm0 18a9 9 0 01-9-9h3a6 6 0 006 6v3zm-3-9a3 3 0 016 0h-3v3a3 3 0 01-3-3z' },
  '🌟': { color: '#facc15', d: 'M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z' },
  // Items
  '☕': { color: '#d6a36b', d: 'M4 8h12v6a5 5 0 01-5 5H9a5 5 0 01-5-5zm12 1h2a3 3 0 010 6h-2v-2h2a1 1 0 000-2h-2zM7 3h2v3H7zm4 0h2v3h-2z' },
  '🥤': { color: '#38bdf8', d: 'M6 7h12l-1.5 14h-9zm7-5h2l-1 5h-2z' },
  // Perks
  '💰': { color: '#facc15', d: 'M9 3h6l-2 3a7 7 0 115 6 7 7 0 01-6 9 7 7 0 01-6-9 7 7 0 015-6zm2 7v8h2v-8z' },
  '💉': { color: '#f472b6', d: 'M17 2l5 5-2 2-1-1-8 8-3-3 8-8-1-1zM6 15l3 3-5 4-2-2z' },
  '🛡️': { color: '#93c5fd', d: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z' },
  // Stats
  '💥': { color: '#ef4444', d: 'M12 1l2 6 6-3-3 6 6 2-6 2 3 6-6-3-2 6-2-6-6 3 3-6-6-2 6-2-3-6 6 3z' },
  '🎵': { color: '#60a5fa', d: 'M9 4l11-2v13a3 3 0 11-2-2.8V6.5l-7 1.3V17a3 3 0 11-2-2.8z' },
  '❤️': { color: '#4ade80', d: 'M12 21l-8-8a5 5 0 017-7l1 1 1-1a5 5 0 017 7z' },
  '✨': { color: '#c084fc', d: 'M10 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2zm8 11l1 3 3 1-3 1-1 3-1-3-3-1 3-1z' },
  '🤝': { color: '#facc15', d: 'M2 9l5-4 5 3 5-3 5 4-6 8-3-2-1 1-3-2-1 1z' },
};

const SIZE = { sm: 'w-8 h-8 rounded-lg', md: 'w-11 h-11 rounded-xl', lg: 'w-16 h-16 rounded-2xl' } as const;
const GLYPH = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-9 h-9' } as const;
const EMOJI = { sm: 'text-base', md: 'text-2xl', lg: 'text-4xl' } as const;

export const Icon = ({ glyph, size = 'md' }: { glyph: string; size?: keyof typeof SIZE }) => {
  const g = G[glyph];
  const tint = g?.color ?? '#ffffff';
  return (
    <span aria-hidden className={`${SIZE[size]} shrink-0 inline-flex items-center justify-center border`}
      style={{ background: `radial-gradient(circle at 30% 25%, ${tint}38, ${tint}0d 70%)`, borderColor: `${tint}40`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 0 18px ${tint}22` }}>
      {g
        ? <svg viewBox="0 0 24 24" className={GLYPH[size]} fill={tint} style={{ filter: `drop-shadow(0 0 6px ${tint}88)` }}><path d={g.d} /></svg>
        : <span className={EMOJI[size]}>{glyph}</span>}
    </span>
  );
};
