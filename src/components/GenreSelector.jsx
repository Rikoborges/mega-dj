import React from 'react';
import '../styles/GenreSelector.css';

const GENRES = {
  sertanejo: { name: 'Sertanejo', icon: '🎸', bpmRange: [95, 115], search: 'sertanejo' },
  trap: { name: 'Trap', icon: '⚡', bpmRange: [130, 150], search: 'trap' },
  funk: { name: 'Funk', icon: '🎉', bpmRange: [130, 140], search: 'funk' },
  reggaeton: { name: 'Reggaeton', icon: '💃', bpmRange: [92, 100], search: 'reggaeton' },
  edm: { name: 'EDM/House', icon: '🎧', bpmRange: [120, 130], search: 'edm' },
  hiphop: { name: 'Hip-Hop', icon: '🎤', bpmRange: [85, 95], search: 'hip hop' }
};

export default function GenreSelector({ onSelectGenre, isLoading }) {
  return (
    <div className="genres-container">
      <div className="genres-header">
        <h2>Escolha um Gênero</h2>
        <p>Clique para buscar HITS do Spotify em tempo real</p>
      </div>
      <div className="genres-grid">
        {Object.entries(GENRES).map(([key, config]) => (
          <button
            key={key}
            className="genre-btn"
            onClick={() => onSelectGenre(key, config)}
            disabled={isLoading}
          >
            <div className="genre-icon">{config.icon}</div>
            <div className="genre-name">{config.name}</div>
            <div className="genre-bpm">BPM: {config.bpmRange[0]}-{config.bpmRange[1]}</div>
          </button>
        ))}
      </div>
    </div>
  );
}