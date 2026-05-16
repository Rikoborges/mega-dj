import React from 'react';
import '../styles/Player.css';

export default function Player({
  track,
  isPlaying,
  onPlayPause,
  onNext,
  onPrevious,
  progress,
  volume,
  onVolumeChange,
  audioFeatures
}) {

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (!track) return null;

  const totalTime = track.duration || 180;
  const currentTime = (progress / 100) * totalTime;

  return (
    <div className="player-container">
      <div className="cover-section">
        <img src={track.image} alt={track.title} className="cover-image" />
        
        <div className="track-info">
          <h2>{track.title}</h2>
          <p>{track.artist}</p>
          <p className="genre-tag">{track.genreName}</p>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="stat-label">BPM</div>
            <div className="stat-value">
              {audioFeatures?.bpm || track.bpm}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">ENERGIA</div>
            <div className="stat-value">
              {audioFeatures?.energy ? Math.round(audioFeatures.energy * 100) + '%' : '—'}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">DANÇA</div>
            <div className="stat-value">
              {audioFeatures?.danceability ? Math.round(audioFeatures.danceability * 100) + '%' : '—'}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">HUMOR</div>
            <div className="stat-value">
              {audioFeatures?.valence ? Math.round(audioFeatures.valence * 100) + '%' : '—'}
            </div>
          </div>
        </div>

        <div className="progress-section">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <div className="time-display">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(totalTime)}</span>
          </div>
        </div>

        {!track.previewUrl && (
          <div className="no-preview-badge">
            Sem preview — ouça no Spotify
          </div>
        )}

        <div className="controls">
          <button onClick={onPrevious}>⏮ ANTERIOR</button>
          <button className="play" onClick={onPlayPause} disabled={!track.previewUrl}>
            {isPlaying && track.previewUrl ? '⏸ PAUSAR' : '▶ PLAY'}
          </button>
          <button onClick={onNext}>PRÓXIMA ⏭</button>
        </div>

        <div className="volume-section">
          <div className="volume-header">
            <span className="volume-label">🔊 VOLUME</span>
            <span className="volume-value">{volume}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => onVolumeChange(parseInt(e.target.value))}
          />
        </div>

        {track.spotifyUrl && (
          <a 
            href={track.spotifyUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="spotify-link"
          >
            🎵 Tocar no Spotify
          </a>
        )}
      </div>

    </div>
  );
}