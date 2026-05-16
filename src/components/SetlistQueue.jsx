import React, { useState } from 'react';
import '../styles/SetlistQueue.css';

export default function SetlistQueue({ tracks, onRemove, onMove, onLoadToDeck, onSavePlaylist }) {
  const [playlistName, setPlaylistName] = useState('Meu Set DJ');
  const totalMin = Math.round(tracks.reduce((s, t) => s + (t.duration || 180), 0) / 60);

  const handleSave = () => {
    if (!tracks.length) { alert('Adicione músicas ao setlist primeiro!'); return; }
    onSavePlaylist(playlistName);
  };

  return (
    <div className="setlist">
      <div className="setlist-top">
        <span className="setlist-heading">SETLIST</span>
        <span className="setlist-meta">{tracks.length} faixas · ~{totalMin} min</span>
      </div>

      {tracks.length === 0 ? (
        <div className="setlist-empty">
          Adicione músicas ao setlist<br />
          <small>Use o botão "+" na biblioteca ou nos decks</small>
        </div>
      ) : (
        <div className="setlist-list">
          {tracks.map((track, idx) => (
            <div key={track.id} className="sl-track">
              <div className="sl-reorder">
                <button disabled={idx === 0} onClick={() => onMove(idx, idx - 1)}>▲</button>
                <span className="sl-num">{idx + 1}</span>
                <button disabled={idx === tracks.length - 1} onClick={() => onMove(idx, idx + 1)}>▼</button>
              </div>
              <img src={track.image} alt={track.title} className="sl-img" />
              <div className="sl-info">
                <div className="sl-title">{track.title}</div>
                <div className="sl-artist">{track.artist}</div>
              </div>
              <span className="sl-bpm">{track.bpm}</span>
              <div className="sl-actions">
                <button onClick={() => onLoadToDeck(track, 'A')} title="Deck A">A</button>
                <button onClick={() => onLoadToDeck(track, 'B')} title="Deck B">B</button>
                <button className="sl-remove" onClick={() => onRemove(track.id)} title="Remover">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="setlist-save">
        <input
          type="text"
          value={playlistName}
          onChange={e => setPlaylistName(e.target.value)}
          placeholder="Nome da playlist..."
          className="playlist-name-input"
        />
        <button className="save-btn" onClick={handleSave}>
          💾 Salvar no Spotify
        </button>
      </div>
    </div>
  );
}
