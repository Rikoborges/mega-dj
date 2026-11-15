import React, { useState } from 'react';
import Waveform from './Waveform';
import { effectiveBpm } from '../hooks/useLocalMixer';

const COLORS = { A: '#f59e0b', B: '#3b82f6' };

// Converte segundos em "m:ss"
function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

const fmtPitch = (p) => `${p > 0 ? '+' : ''}${p.toFixed(2)}%`;

// Botão de "segurar": ativo enquanto o dedo/mouse/tecla estiver pressionado
function HoldButton({ onHold, onRelease, children, ...rest }) {
  return (
    <button
      {...rest}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onHold(); }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); onHold(); } }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') onRelease(); }}
      onBlur={onRelease}
    >
      {children}
    </button>
  );
}

export default function LocalDeck({
  id, deck, getTime,
  onLoad, onToggle, onSeek,
  onPitch, onPitchRange, onKeyLock, onNudge, onSync,
}) {
  const [dragging, setDragging] = useState(false);
  const inputId = `local-file-${id}`;
  const color = COLORS[id];

  const handleFiles = (files) => {
    if (files?.[0]) onLoad(files[0]);
  };

  // Arrastar e soltar: o preventDefault no dragover é o que "autoriza" o drop
  const dropProps = {
    onDragOver:  (e) => { e.preventDefault(); setDragging(true); },
    onDragLeave: () => setDragging(false),
    onDrop:      (e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); },
  };

  const remaining = deck.duration - deck.currentTime;
  const bpmNow = effectiveBpm(deck);

  return (
    <section
      className={`ldeck ldeck-${id} ${deck.playing ? 'is-playing' : ''} ${dragging ? 'is-dragging' : ''}`}
      aria-label={`Deck ${id}`}
      {...dropProps}
    >
      <header className="ldeck-head">
        <span className="ldeck-label">DECK {id}</span>
        {deck.loaded && (
          <label className="ldeck-swap">
            Trocar
            <input
              type="file"
              accept="audio/*"
              className="visually-hidden"
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
            />
          </label>
        )}
      </header>

      {!deck.loaded ? (
        <label className="ldeck-drop" htmlFor={inputId}>
          <span className="ldeck-drop-icon" aria-hidden="true">⏏</span>
          <span className="ldeck-drop-title">Carregar música</span>
          <span className="ldeck-drop-hint">Clique ou arraste um MP3 / WAV aqui</span>
          <input
            id={inputId}
            type="file"
            accept="audio/*"
            className="visually-hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          />
        </label>
      ) : (
        <>
          <div className="ldeck-title" title={deck.name}>{deck.name}</div>

          <Waveform
            peaks={deck.peaks}
            duration={deck.duration}
            getTime={() => getTime(id)}
            onSeek={onSeek}
            color={color}
            analyzing={deck.analyzing}
          />

          <div className="ldeck-time">
            <span>{formatTime(deck.currentTime)}</span>
            <span className="ldeck-remaining">-{formatTime(remaining)}</span>
          </div>

          {/* Barra de posição: um range de verdade é acessível por teclado e toque */}
          <input
            type="range"
            className="ldeck-seek"
            min="0"
            max={deck.duration || 0}
            step="0.1"
            value={deck.currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label={`Posição da música no deck ${id}`}
            aria-valuetext={formatTime(deck.currentTime)}
            disabled={!deck.duration}
          />

          {/* ── BPM ── */}
          <div className="ldeck-bpm-row">
            <div className="ldeck-bpm" aria-live="polite">
              <span className="ldeck-bpm-num">
                {deck.analyzing ? '…' : bpmNow ? bpmNow.toFixed(1) : '—'}
              </span>
              <span className="ldeck-bpm-tag">BPM</span>
            </div>
            <div className="ldeck-bpm-orig">
              {deck.bpm && deck.pitch !== 0 && <>original {deck.bpm.toFixed(1)}</>}
              {!deck.analyzing && !deck.bpm && 'BPM não detectado'}
            </div>
            <button
              className={`ldeck-chip ${deck.keyLock ? 'on' : ''}`}
              onClick={onKeyLock}
              aria-pressed={deck.keyLock}
              title="KEY LOCK: muda a velocidade sem mudar o tom da música"
            >
              KEY LOCK
            </button>
          </div>

          {/* ── Pitch ── */}
          <div className="ldeck-pitch">
            <div className="ldeck-pitch-head">
              <span className="ldeck-pitch-val">PITCH {fmtPitch(deck.pitch)}</span>
              <button className="ldeck-chip" onClick={onPitchRange} title="Alcance do pitch">
                ±{deck.pitchRange}%
              </button>
              <button className="ldeck-chip" onClick={() => onPitch(0)} disabled={deck.pitch === 0}>
                ZERAR
              </button>
            </div>
            <input
              type="range"
              className="ldeck-pitch-range"
              min={-deck.pitchRange}
              max={deck.pitchRange}
              step="0.05"
              value={deck.pitch}
              onChange={(e) => onPitch(Number(e.target.value))}
              onDoubleClick={() => onPitch(0)}
              aria-label={`Pitch do deck ${id}`}
              aria-valuetext={fmtPitch(deck.pitch)}
            />
          </div>

          {/* ── Transporte ── */}
          <div className="ldeck-transport">
            <HoldButton
              className="ldeck-nudge"
              onHold={() => onNudge(-1)}
              onRelease={() => onNudge(0)}
              aria-label={`Segurar para atrasar o deck ${id}`}
              title="Segure para frear um pouco (alinhar as batidas)"
            >
              ◀◀
            </HoldButton>

            <button
              className={`ldeck-play ${deck.playing ? 'active' : ''}`}
              onClick={onToggle}
              aria-label={deck.playing ? `Pausar deck ${id}` : `Tocar deck ${id}`}
            >
              {deck.playing ? '❚❚' : '▶'}
            </button>

            <HoldButton
              className="ldeck-nudge"
              onHold={() => onNudge(1)}
              onRelease={() => onNudge(0)}
              aria-label={`Segurar para adiantar o deck ${id}`}
              title="Segure para acelerar um pouco (alinhar as batidas)"
            >
              ▶▶
            </HoldButton>
          </div>

          <button
            className="ldeck-sync"
            onClick={onSync}
            title="Iguala o BPM deste deck ao do outro deck"
          >
            SYNC
          </button>
        </>
      )}
    </section>
  );
}
