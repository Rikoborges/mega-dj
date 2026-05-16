import React from 'react';
import '../styles/Setlist.css';

export default function Setlist({ tracks, currentIndex, onSelectTrack }) {
  if (!tracks.length) return null;

  return (
    <div className="setlist">
      <div className="setlist-header">
        🎵 SETLIST ({tracks.length})
      </div>
      <div className="setlist-items">
        {tracks.map((track, idx) => (
          <button
            key={idx}
            className={`setlist-item ${idx === currentIndex ? 'active' : ''}`}
            onClick={() => onSelectTrack(idx)}
          >
            <img src={track.image} alt={track.title} className="setlist-item-image" />
            <div className="setlist-item-title">{track.title}</div>
            <div className="setlist-item-artist">{track.artist}</div>
            <div className="setlist-item-bpm">{track.bpm} BPM</div>
          </button>
        ))}
      </div>
    </div>
  );
}