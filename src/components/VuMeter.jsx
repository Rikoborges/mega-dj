import React, { useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// VU METER — mostra o volume REAL do áudio
//
// Roda a ~60 quadros por segundo. Se isso passasse por useState, o React ia
// re-renderizar a tela inteira 60x por segundo. Por isso o loop mexe direto no
// estilo do elemento via ref: o React nem fica sabendo, e fica leve.
// ─────────────────────────────────────────────────────────────────────────────

export default function VuMeter({ getLevel, source, label }) {
  const coverRef = useRef(null); // "tampa" escura que esconde a parte de cima do degradê
  const clipRef  = useRef(null); // luz vermelha de CLIP (som estourando)

  useEffect(() => {
    let frame;
    let shown = 0;     // nível exibido (com queda suave, como o ponteiro de um VU real)
    let clipUntil = 0; // até quando o CLIP fica aceso

    const tick = (now) => {
      const { level, clip } = getLevel(source);
      // Sobe na hora, desce devagar — senão o medidor "treme" demais para ler
      shown = level > shown ? level : shown * 0.92 + level * 0.08;
      if (clip) clipUntil = now + 800;

      if (coverRef.current) coverRef.current.style.transform = `scaleY(${Math.max(0.001, 1 - shown)})`; // nunca 0: escala zero pode sumir com a camada
      if (clipRef.current)  clipRef.current.classList.toggle('on', now < clipUntil);

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame); // para o loop quando o componente sai da tela
  }, [getLevel, source]);

  return (
    <div className="vu" role="img" aria-label={`Medidor de volume ${label}`}>
      <div className="vu-clip" ref={clipRef} title="CLIP: o som está estourando — abaixe o TRIM" />
      <div className="vu-meter">
        <div className="vu-cover" ref={coverRef} />
      </div>
    </div>
  );
}
