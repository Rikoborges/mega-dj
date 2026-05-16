import React from 'react';
import '../styles/Deck.css';

export default function Deck({ label, side, track, isActive, isPlaying, progress, playerReady, onTogglePlay, onAddToSetlist, onRecommend }) {
  const playing = isActive && isPlaying;

  return (
    <div className={`deck deck-${side} ${isActive ? 'deck-active' : ''}`}>
      <div className="deck-label">{label}</div>

      {!track ? (
        <div className="deck-empty">
          <div className="deck-vinyl">⏺</div>
          <p>Carregue uma música da biblioteca</p>
        </div>
      ) : (
        <>
          <div className={`deck-cover ${playing ? 'spinning' : ''}`}>
            <img src={track.image} alt={track.title} />
            <div className="deck-cover-center" />
          </div>

          <div className="deck-info">
            <div className="deck-title">{track.title}</div>
            <div className="deck-artist">{track.artist}</div>
          </div>

          <div className="deck-bpm">
            <span className="bpm-label">BPM</span>
            <span className="bpm-value">{track.bpm}</span>
            {track.energy != null && (
              <span className="deck-energy" title="Energia">⚡{Math.round(track.energy * 100)}%</span>
            )}
          </div>

          {isActive && playing && (
            <div className="waveform">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="wave-bar" style={{ animationDelay: `${(i * 0.08) % 0.8}s` }} />
              ))}
            </div>
          )}

          {isActive && (
            <div className="deck-progress-bar">
              <div className="deck-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="deck-controls">
            <button
              className={`deck-play-btn ${playing ? 'active' : ''}`}
              onClick={onTogglePlay}
              disabled={!playerReady}
              title={playerReady ? '' : 'Aguardando player...'}
            >
              {playing ? '⏸' : '▶'}
            </button>
          </div>

          {!playerReady && (
            <div className="deck-no-player">⏳ Conectando ao Spotify...</div>
          )}

          <div className="deck-actions">
            <button className="deck-action" onClick={() => onAddToSetlist(track)}>+ Setlist</button>
            <button className="deck-action highlight" onClick={() => onRecommend(track)}>∿ Similares</button>
          </div>
        </>
      )}
    </div>
  );
}
