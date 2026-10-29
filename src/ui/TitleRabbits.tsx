import { useEffect, useRef } from 'react';
import { CANVAS_HEIGHT, GROUND_Y } from '../data/config';
import { BACKDROP_RES, RABBITS, drawRabbit, drawShadow, getBackdrop, getSceneLayers } from '../game/sprites';

const W = 260, H = 150, FLOOR = 135;

/** Hop and Skip skipping in turn on the title screen, drawn with the in-game art. */
export const TitleRabbits = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    let raf = 0;
    const loop = () => {
      const t = performance.now() / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      (['red', 'blue'] as const).forEach((k, i) => {
        const phase = (t * 2.2 + i * 0.5) % 1;           // alternate hops
        const h = Math.sin(phase * Math.PI) * 34;
        const vy = -Math.cos(phase * Math.PI) * 8;
        const x = 95 + i * 80;
        ctx.save();
        ctx.translate(0, FLOOR - 380);                   // drawShadow uses game GROUND_Y (380)
        drawShadow(ctx, x, h, 18);
        ctx.restore();
        ctx.save();
        ctx.translate(x, FLOOR - h);
        drawRabbit(ctx, RABBITS[k], { vy, squash: h < 3 ? 0.3 : -0.15, airborne: h > 3, down: false, t, seed: i * 1.7 });
        ctx.restore();
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} style={{ width: W, height: H }} className="mt-4 mx-auto" aria-label="Hop and Skip" />;
};

/** The game's own city behind the title, drifting slowly so the menu feels alive. */
export const TitleBackdrop = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const loop = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
      const img = getBackdrop();
      // Cover-fit, anchored a little above the court so the skyline fills the frame.
      const scale = Math.max(canvas.width / img.width, canvas.height / (img.height * 0.82)) * 1.06;
      const sway = still ? 0 : Math.sin(performance.now() / 9000) * 0.02 * canvas.width;
      const w = img.width * scale, h = img.height * scale;
      const x = (canvas.width - w) / 2, y = canvas.height - h * 0.9;
      ctx.drawImage(img, x + sway, y, w, h);
      // The painted layers on top, each swaying by its own amount: a slow parallax camera move.
      const layers = getSceneLayers('alley', 'night');
      if (layers) {
        // The backdrop spans world y (CANVAS_HEIGHT + 100 - its height) .. CANVAS_HEIGHT + 100; layers end on the court line.
        const worldH = img.height / BACKDROP_RES, top = CANVAS_HEIGHT + 100 - worldH;
        const lh = layers.far.height * w / layers.far.width;
        const ly = y + h * ((GROUND_Y - top) / worldH) - lh;
        ([['far', 0.3], ['mid', 0.65], ['near', 1.2]] as const).forEach(([k, d]) => ctx.drawImage(layers[k], x + sway * d, ly, w, lh));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="fixed inset-0 -z-10" aria-hidden>
      <canvas ref={ref} className="w-full h-full block" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(5,3,15,0.35)_0%,rgba(5,3,15,0.8)_70%,#05030f_100%)]" />
    </div>
  );
};
