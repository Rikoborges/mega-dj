import React, { useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// FORMA DE ONDA — a música inteira desenhada, com a posição atual
//
// Duas camadas, para ficar leve:
//   1. "base": a onda é desenhada UMA vez num canvas fora da tela
//   2. a cada quadro (60 fps) só copiamos a base e pintamos por cima a parte
//      já tocada + a linha da posição. Redesenhar 1200 barras 60x por segundo
//      seria desperdício.
// Clicar ou arrastar na onda pula para aquele ponto da música.
// ─────────────────────────────────────────────────────────────────────────────

export const CUE_COLORS = ['#ef4444', '#22c55e', '#a855f7', '#06b6d4'];

export default function Waveform({
  peaks, duration, getTime, onSeek, color, analyzing,
  bpm, beatOffset = 0, cues = [], loop = null,
}) {
  const canvasRef = useRef(null);
  const baseRef = useRef(null);       // canvas fora da tela com a onda pronta
  const draggingRef = useRef(false);
  // getTime pode chegar como função nova a cada render; guardando numa ref,
  // o efeito abaixo não precisa recomeçar (e redesenhar a onda) por causa disso
  const getTimeRef = useRef(getTime);
  getTimeRef.current = getTime;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let frame;

    // Desenha a onda base no tamanho atual (e redesenha se a tela mudar de tamanho)
    const buildBase = () => {
      const dpr = window.devicePixelRatio || 1; // tela retina: 2 pixels reais por pixel CSS
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      canvas.width = w;
      canvas.height = h;

      const base = document.createElement('canvas');
      base.width = w;
      base.height = h;
      const b = base.getContext('2d');
      if (peaks) {
        const mid = h / 2;
        const barW = w / peaks.length;
        b.fillStyle = '#4a4a5e';
        for (let i = 0; i < peaks.length; i++) {
          const ph = Math.max(1, peaks[i] * (h * 0.9));
          b.fillRect(i * barW, mid - ph / 2, Math.max(1, barW - 0.3), ph);
        }
      }
      if (duration > 0) {
        const xOf = (t) => (t / duration) * w;

        // Grade: uma linha a cada compasso (4 batidas). Só desenha se couber,
        // senão vira um borrão de linhas numa música longa.
        if (bpm) {
          const bar = (60 / bpm) * 4;
          if ((bar / duration) * w >= 4 * dpr) {
            b.fillStyle = 'rgba(255,255,255,0.12)';
            for (let t = beatOffset; t < duration; t += bar) b.fillRect(Math.round(xOf(t)), 0, 1, h);
          }
        }

        // Região do loop
        if (loop) {
          b.fillStyle = 'rgba(34,197,94,0.22)';
          b.fillRect(xOf(loop.start), 0, Math.max(2, xOf(loop.end) - xOf(loop.start)), h);
        }

        // Hot cues: linha + triangulozinho em cima, na cor do pad
        cues.forEach((cue, i) => {
          if (cue == null) return;
          const x = Math.round(xOf(cue));
          b.fillStyle = CUE_COLORS[i];
          b.fillRect(x, 0, Math.max(1, dpr), h);
          b.beginPath();
          b.moveTo(x - 5 * dpr, 0); b.lineTo(x + 5 * dpr, 0); b.lineTo(x, 7 * dpr);
          b.fill();
        });
      }
      baseRef.current = base;
    };

    const draw = () => {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (baseRef.current) ctx.drawImage(baseRef.current, 0, 0);

      const t = duration > 0 ? getTimeRef.current() / duration : 0;
      const x = Math.min(w, Math.max(0, t * w));

      // Parte já tocada: pinta a onda com a cor do deck ("source-atop" só pinta
      // onde já tem desenho, ou seja, em cima das barras)
      if (peaks && x > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, x, h);
        ctx.restore();
      }
      // Linha da posição atual
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.round(x) - 1, 0, 2, h);

      frame = requestAnimationFrame(draw);
    };

    buildBase();
    frame = requestAnimationFrame(draw);

    // ResizeObserver: avisa quando o tamanho do canvas muda (girar o celular, etc.)
    const ro = new ResizeObserver(buildBase);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [peaks, duration, color, bpm, beatOffset, cues, loop]);

  // Clique/arraste para pular na música
  const seekFromPointer = (e) => {
    if (!duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    onSeek(t * duration);
  };

  return (
    <div className="wave">
      <canvas
        ref={canvasRef}
        className="wave-canvas"
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e);
        }}
        onPointerMove={(e) => draggingRef.current && seekFromPointer(e)}
        onPointerUp={() => { draggingRef.current = false; }}
        onPointerCancel={() => { draggingRef.current = false; }}
        aria-hidden="true" /* para teclado/leitor de tela existe a barra de posição logo abaixo */
      />
      {analyzing && <span className="wave-status">analisando…</span>}
      {!analyzing && !peaks && <span className="wave-status">forma de onda indisponível</span>}
    </div>
  );
}
