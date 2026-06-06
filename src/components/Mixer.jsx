import React, { useState, useEffect } from 'react';
import '../styles/Mixer.css';

function bpmCompat(bpmA, bpmB) {
  if (!bpmA || !bpmB) return null;
  const min = Math.min(
    Math.abs(bpmA - bpmB),
    Math.abs(bpmA - bpmB * 2),
    Math.abs(bpmA * 2 - bpmB),
  );
  if (min <= 3)  return { label: 'PERFEITO', color: '#22c55e' };
  if (min <= 6)  return { label: 'BOM',      color: '#84cc16' };
  if (min <= 12) return { label: 'AJUSTAR',  color: '#f59e0b' };
  return              { label: 'INCOMP.',   color: '#ef4444' };
}

export default function Mixer({ deckA, deckB, activeDeck, isPlaying, crossfader, onCrossfaderChange, onTransition, onHorn, onTec, onDrop, onScratch, onRiser, onSiren, onClap, onRewind }) {
  const compat = bpmCompat(deckA?.bpm, deckB?.bpm);

  const [vuA, setVuA] = useState(3);
  const [vuB, setVuB] = useState(3);

  useEffect(() => {
    const id = setInterval(() => {
      const playingA = activeDeck === 'A' && isPlaying;
      const playingB = activeDeck === 'B' && isPlaying;
      setVuA(playingA ? Math.random() * 65 + 20 : 3);
      setVuB(playingB ? Math.random() * 65 + 20 : 3);
    }, 120);
    return () => clearInterval(id);
  }, [activeDeck, isPlaying]);

  const volA = 100 - crossfader;
  const volB = crossfader;
  const canTransition = deckA && deckB;

  return (
    <div className="mixer">
      <div className="mixer-title">MIXER</div>

      <div className="mixer-bpm-row">
        <div className="mixer-bpm-block">
          <span className="mixer-bpm-num">{deckA?.bpm ?? '—'}</span>
          <span className="mixer-bpm-tag">A</span>
        </div>
        <div className="mixer-compat" style={{ color: compat?.color ?? '#333' }}>
          {compat?.label ?? '·'}
        </div>
        <div className="mixer-bpm-block">
          <span className="mixer-bpm-num">{deckB?.bpm ?? '—'}</span>
          <span className="mixer-bpm-tag">B</span>
        </div>
      </div>

      <div className="mixer-vu-row">
        <div className="vu-col">
          <div className="vu-bar-wrap">
            <div className="vu-bar" style={{ height: `${vuA}%` }} />
          </div>
          <span className="vu-label">{volA}%</span>
        </div>
        <div className="vu-divider" />
        <div className="vu-col">
          <div className="vu-bar-wrap">
            <div className="vu-bar vu-bar-b" style={{ height: `${vuB}%` }} />
          </div>
          <span className="vu-label">{volB}%</span>
        </div>
      </div>

      <div className="mixer-cf-section">
        <div className="mixer-cf-labels">
          <span className={crossfader < 40 ? 'cf-active' : ''}>A</span>
          <span className={crossfader > 60 ? 'cf-active' : ''}>B</span>
        </div>
        <input
          type="range" min="0" max="100"
          value={crossfader}
          onChange={e => onCrossfaderChange(Number(e.target.value))}
          className="crossfader"
        />
        <div className="mixer-cf-tag">CROSSFADER</div>
      </div>

      <button
        className="transition-btn"
        onClick={onTransition}
        disabled={!canTransition}
        title={canTransition ? 'Transição automática entre decks' : 'Carregue os dois decks'}
      >
        ⇄ TRANSIÇÃO
      </button>

      <div className="fx-pads">
        <button className="fx-btn horn"    onClick={onHorn}    title="Air Horn">📯 HORN</button>
        <button className="fx-btn tec"     onClick={onTec}     title="Click Eletrônico">⚡ TEC</button>
        <button className="fx-btn drop"    onClick={onDrop}    title="Bass Drop">💥 DROP</button>
        <button className="fx-btn scratch" onClick={onScratch} title="Scratch de Vinil">🎚 SCRATCH</button>
        <button className="fx-btn riser"   onClick={onRiser}   title="Riser — Tensão Crescente">🚀 RISER</button>
        <button className="fx-btn siren"   onClick={onSiren}   title="Sirene de Festa">🚨 SIREN</button>
        <button className="fx-btn clap"    onClick={onClap}    title="Palmada / Caixa">👏 CLAP</button>
        <button className="fx-btn rewind"  onClick={onRewind}  title="Freio de Vinil">⏪ REWIND</button>
      </div>
    </div>
  );
}
