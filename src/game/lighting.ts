import type { TimeOfDay, Zone } from './sprites';

// Scene lighting for the fighters. The sprites are rendered under neutral studio light, which makes
// them look pasted onto the painted sets; here they pick up the set's colour cast and a rim of the
// set's key light down one edge. Fighters draw into an offscreen canvas, get lit there, then land
// on the frame in one go.

interface Light { tint: string; rim: string; rimAlpha: number; side: 1 | -1 }
/** side: which edge the key light catches (-1 = left edges, 1 = right edges). */
const LIGHTS: Record<string, Light> = {
  'alley-day':     { tint: 'rgba(255,236,210,0.06)', rim: '#fff4dc', rimAlpha: 0.35, side: -1 },
  'alley-dusk':    { tint: 'rgba(255,120,90,0.14)',  rim: '#ffa070', rimAlpha: 0.6,  side: -1 },
  'alley-night':   { tint: 'rgba(110,60,190,0.18)',  rim: '#ff5ab4', rimAlpha: 0.55, side: 1 },
  'rooftop-day':   { tint: 'rgba(200,220,255,0.07)', rim: '#ffffff', rimAlpha: 0.35, side: -1 },
  'rooftop-dusk':  { tint: 'rgba(255,110,80,0.16)',  rim: '#ff9a5a', rimAlpha: 0.65, side: -1 },
  'rooftop-night': { tint: 'rgba(100,60,200,0.2)',   rim: '#9ad8ff', rimAlpha: 0.5,  side: 1 },
  'subway-night':  { tint: 'rgba(150,255,210,0.08)', rim: '#d8fff0', rimAlpha: 0.3,  side: -1 },
};

let fighters: HTMLCanvasElement | null = null;
let rim: HTMLCanvasElement | null = null;
const sized = (c: HTMLCanvasElement | null, w: number, h: number) => {
  const out = c ?? document.createElement('canvas');
  if (out.width !== w || out.height !== h) { out.width = w; out.height = h; }
  return out;
};

/** Start drawing fighters: returns a cleared offscreen context with the frame's current transform. */
export const beginFighters = (ctx: CanvasRenderingContext2D) => {
  fighters = sized(fighters, ctx.canvas.width, ctx.canvas.height);
  const f = fighters.getContext('2d')!;
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.clearRect(0, 0, fighters.width, fighters.height);
  f.setTransform(ctx.getTransform());
  return f;
};

/** Light the fighters for this set and put them on the frame. */
export const endFighters = (ctx: CanvasRenderingContext2D, zone: Zone, tod: TimeOfDay) => {
  if (!fighters) return;
  const L = LIGHTS[`${zone}-${tod}`] ?? LIGHTS['alley-night'];
  const f = fighters.getContext('2d')!;
  f.setTransform(1, 0, 0, 1, 0, 0);
  const W = fighters.width, H = fighters.height;
  // Rim: the silhouette minus itself nudged toward the light leaves a thin crescent on the lit edge.
  rim = sized(rim, W, H);
  const r = rim.getContext('2d')!;
  r.globalCompositeOperation = 'copy';
  r.drawImage(fighters, 0, 0);
  r.globalCompositeOperation = 'source-in';
  r.fillStyle = L.rim; r.fillRect(0, 0, W, H);
  r.globalCompositeOperation = 'destination-out';
  const d = Math.max(2, Math.round(W / 500));
  r.drawImage(fighters, -L.side * d, Math.round(d / 2));
  // Colour cast over the bodies only.
  f.globalCompositeOperation = 'source-atop';
  f.fillStyle = L.tint; f.fillRect(0, 0, W, H);
  f.globalCompositeOperation = 'lighter';
  f.globalAlpha = L.rimAlpha;
  f.drawImage(rim, 0, 0);
  f.globalAlpha = 1; f.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(fighters, 0, 0);
  ctx.restore();
};
