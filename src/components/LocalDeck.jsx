import React, { useState } from 'react';

// Converte segundos em "m:ss"
function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

export default function LocalDeck({ id, deck, onLoad, onToggle, onSeek }) {
  const [dragging, setDragging] = useState(false);
  const inputId = `local-file-${id}`;

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
          <div className="ldeck-platter" aria-hidden="true">
            <div className="ldeck-vinyl">
              <div className="ldeck-vinyl-label">{id}</div>
            </div>
          </div>

          <div className="ldeck-title" title={deck.name}>{deck.name}</div>

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

          <button
            className={`ldeck-play ${deck.playing ? 'active' : ''}`}
            onClick={onToggle}
            aria-label={deck.playing ? `Pausar deck ${id}` : `Tocar deck ${id}`}
          >
            {deck.playing ? '❚❚' : '▶'}
          </button>
        </>
      )}
    </section>
  );
}
