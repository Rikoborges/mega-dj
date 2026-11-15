import React, { useEffect, useRef } from 'react';
import { phaseDiff } from '../audio/analyze';

// ─────────────────────────────────────────────────────────────────────────────
// MEDIDOR DE FASE — o bumbo do deck B está adiantado ou atrasado em relação ao A?
//
//   [ ◀ atrasado ──────── | ──────── adiantado ▶ ]
//                       centro = batidas alinhadas
//
// Atualiza a 60 fps mexendo direto no DOM (mesmo truque do VU meter).
// ─────────────────────────────────────────────────────────────────────────────

export default function PhaseMeter({ getPhase }) {
  const markerRef = useRef(null);
  const textRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    let frame;
    const tick = () => {
      const a = getPhase('A');
      const b = getPhase('B');
      const active = a && b && a.playing && b.playing;

      if (boxRef.current) boxRef.current.classList.toggle('idle', !active);
      if (active) {
        const diff = phaseDiff(b.phase, a.phase);        // -0.5 … +0.5 batida
        const ms = diff * a.beatSec * 1000;               // em milissegundos
        const aligned = Math.abs(ms) < 15;                // < 15 ms o ouvido não separa

        if (markerRef.current) {
          // diff -0.5 → borda esquerda (0%), 0 → centro (50%), +0.5 → borda direita (100%)
          markerRef.current.style.left = `${50 + diff * 100}%`;
          markerRef.current.classList.toggle('ok', aligned);
        }
        if (textRef.current) {
          textRef.current.textContent = aligned
            ? 'ALINHADO'
            : `B ${ms > 0 ? 'adiantado' : 'atrasado'} ${Math.abs(Math.round(ms))} ms`;
          textRef.current.classList.toggle('ok', aligned);
        }
      } else if (textRef.current) {
        textRef.current.textContent = 'FASE (toque os 2 decks)';
        textRef.current.classList.remove('ok');
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getPhase]);

  return (
    <div className="phase" ref={boxRef}>
      <div className="phase-track" aria-hidden="true">
        <div className="phase-center" />
        <div className="phase-marker" ref={markerRef} />
      </div>
      {/* aria-live "off": muda 60x por segundo, o leitor de tela ficaria falando sem parar */}
      <div className="phase-text" ref={textRef} aria-live="off">FASE</div>
    </div>
  );
}
