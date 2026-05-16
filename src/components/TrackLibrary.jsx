import React, { useState } from 'react';
import '../styles/TrackLibrary.css';

const GENRES = [
  { label: 'Funk',       query: 'funk carioca hits',           bpm: 135 },
  { label: 'Reggaeton',  query: 'reggaeton hits Bad Bunny',    bpm: 96  },
  { label: 'Sertanejo',  query: 'sertanejo universitario hits',bpm: 105 },
  { label: 'Trap BR',    query: 'trap brasil hits 2024',       bpm: 140 },
  { label: 'EDM',        query: 'edm progressive house hits',  bpm: 128 },
  { label: 'Hip-Hop',    query: 'hip hop rap hits',            bpm: 90  },
  { label: 'House',      query: 'house music dance hits',      bpm: 124 },
  { label: 'Techno',     query: 'techno electronic hits',      bpm: 138 },
  { label: 'Baile',      query: 'baile funk mc',               bpm: 130 },
  { label: 'Pagode',     query: 'pagode brasileiro',           bpm: 100 },
];

function bpmBadge(trackBpm, refBpm) {
  if (!refBpm) return null;
  const diff = Math.min(
    Math.abs(trackBpm - refBpm),
    Math.abs(trackBpm - refBpm * 2),
    Math.abs(trackBpm * 2 - refBpm),
  );
  if (diff <= 3)  return { label: '●', color: '#22c55e', title: 'Compatível com deck' };
  if (diff <= 8)  return { label: '●', color: '#f59e0b', title: 'Ajuste leve necessário' };
  if (diff <= 15) return { label: '●', color: '#f97316', title: 'BPM diferente' };
  return { label: '●', color: '#444', title: 'Incompatível' };
}

export default function TrackLibrary({ tracks, isLoading, deckA, deckB, onSearch, onLoadToDeck, onAddToSetlist }) {
  const [query, setQuery] = useState('');
  const refBpm = deckA?.bpm || deckB?.bpm || null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  return (
    <div className="library">
      <div className="library-top">
        <span className="library-heading">BIBLIOTECA</span>
        <form onSubmit={handleSubmit} className="library-search">
          <input
            type="text"
            placeholder="Artista, música, gênero..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button type="submit">🔍</button>
        </form>
      </div>

      <div className="library-genres">
        {GENRES.map(g => (
          <button
            key={g.query}
            className="genre-chip"
            onClick={() => { setQuery(''); onSearch(g.query, g.bpm); }}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="library-list">
        {isLoading && (
          <div className="library-state">⏳ Buscando músicas...</div>
        )}
        {!isLoading && tracks.length === 0 && (
          <div className="library-state">
            Selecione um gênero ou busque uma música<br />
            <small>Carregue uma faixa nos decks e clique "Similares" para mix automático</small>
          </div>
        )}
        {!isLoading && tracks.map(track => {
          const badge = refBpm ? bpmBadge(track.bpm, refBpm) : null;
          return (
            <div key={track.id} className="lib-track">
              <img src={track.image} alt={track.title} className="lib-img" />
              <div className="lib-info">
                <div className="lib-title">{track.title}</div>
                <div className="lib-artist">{track.artist}</div>
                <div className="lib-bpm">
                  {badge && (
                    <span style={{ color: badge.color }} title={badge.title}>{badge.label} </span>
                  )}
                  {track.bpm} BPM
                  {track.popularity > 0 && (
                    <span className="lib-pop" title="Popularidade Spotify">
                      {' · '}{track.popularity >= 70 ? '🔥' : track.popularity >= 50 ? '⬆' : ''}{track.popularity}%
                    </span>
                  )}
                  {!track.previewUrl && <span className="lib-no-preview"> · sem preview</span>}
                </div>
              </div>
              <div className="lib-actions">
                <button onClick={() => onLoadToDeck(track, 'A')} title="Carregar no Deck A">A</button>
                <button onClick={() => onLoadToDeck(track, 'B')} title="Carregar no Deck B">B</button>
                <button onClick={() => onAddToSetlist(track)} title="Adicionar ao Setlist">+</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
