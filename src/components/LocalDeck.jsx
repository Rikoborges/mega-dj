import React, { useState } from 'react';
import Waveform, { CUE_COLORS } from './Waveform';
import { effectiveBpm, HOT_CUES, LOOP_SIZES } from '../hooks/useLocalMixer';

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
  onQuantize, onHotCue, onClearCue, onLoop,
}) {
  const [dragging, setDragging] = useState(false);
  const [clearMode, setClearMode] = useState(false); // modo de apagar hot cue
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
            bpm={deck.bpm}
            beatOffset={deck.beatOffset}
            cues={deck.cues}
            loop={deck.loop}
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

          {/* ── Hot cues ── */}
          <div className="ldeck-perf">
            <div className="ldeck-perf-head">
              <span className="ldeck-perf-title">HOT CUE</span>
              <button
                className={`ldeck-chip ${deck.quantize ? 'on' : ''}`}
                onClick={onQuantize}
                aria-pressed={deck.quantize}
                title="QUANTIZE: cue e loop grudam na batida mais próxima"
              >
                Q
              </button>
              <button
                className={`ldeck-chip ${clearMode ? 'danger' : ''}`}
                onClick={() => setClearMode(m => !m)}
                aria-pressed={clearMode}
                disabled={!deck.cues.some(c => c != null)}
                title="Ative e toque num pad para apagar o cue"
              >
                APAGAR
              </button>
            </div>
            <div className="ldeck-pads">
              {Array.from({ length: HOT_CUES }, (_, i) => {
                const cue = deck.cues[i];
                const filled = cue != null;
                return (
                  <button
                    key={i}
                    className={`ldeck-pad ${filled ? 'filled' : ''} ${clearMode && filled ? 'to-clear' : ''}`}
                    style={{ '--cue': CUE_COLORS[i] }}
                    onClick={() => {
                      if (clearMode) {
                        if (filled) onClearCue(i);
                        // apagou o último? sai do modo apagar sozinho
                        if (deck.cues.filter(c => c != null).length <= 1) setClearMode(false);
                      } else {
                        onHotCue(i);
                      }
                    }}
                    aria-label={
                      clearMode && filled ? `Apagar hot cue ${i + 1}`
                        : filled ? `Ir para o hot cue ${i + 1} (${formatTime(cue)})`
                          : `Gravar hot cue ${i + 1} aqui`
                    }
                  >
                    <span className="ldeck-pad-num">{i + 1}</span>
                    <span className="ldeck-pad-time">{filled ? formatTime(cue) : '+'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Loops ── */}
          <div className="ldeck-perf">
            <div className="ldeck-perf-head">
              <span className="ldeck-perf-title">
                LOOP{deck.loop ? ` · ${deck.loop.beats} batida${deck.loop.beats > 1 ? 's' : ''}` : ''}
              </span>
            </div>
            <div className="ldeck-loops">
              {LOOP_SIZES.map(n => (
                <button
                  key={n}
                  className={`ldeck-loop ${deck.loop?.beats === n ? 'on' : ''}`}
                  onClick={() => onLoop(n)}
                  aria-pressed={deck.loop?.beats === n}
                  aria-label={deck.loop?.beats === n ? `Sair do loop de ${n}` : `Loop de ${n} batida${n > 1 ? 's' : ''}`}
                  disabled={!deck.bpm}
                >
                  {n}
                </button>
              ))}
            </div>
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
