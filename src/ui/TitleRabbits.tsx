import { useEffect, useRef } from 'react';
import { RABBITS, drawRabbit, drawShadow } from '../game/sprites';

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
