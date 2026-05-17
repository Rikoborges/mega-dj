import React from 'react';
import '../styles/Header.css';

export default function Header({ isAuthenticated, playerReady, onLogout }) {
  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <svg className="logo-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="64" height="64" rx="14" fill="#080810"/>
            <path d="M12 36 Q12 18 32 18 Q52 18 52 36" stroke="#f59e0b" strokeWidth="4" fill="none" strokeLinecap="round"/>
            <rect x="7" y="33" width="10" height="16" rx="5" fill="#f59e0b"/>
            <rect x="47" y="33" width="10" height="16" rx="5" fill="#f59e0b"/>
            <circle cx="32" cy="44" r="3" fill="#f59e0b" opacity="0.5"/>
          </svg>
          <div className="logo-text">
            <h1>MEGA DJ PRO</h1>
            <p>Spotify Premium • Web Playback</p>
          </div>
        </div>
        <div className="header-actions">
          {isAuthenticated && (
            <>
              <span className={`player-status ${playerReady ? 'ready' : 'connecting'}`}>
                {playerReady ? '● Player pronto' : '○ Conectando...'}
              </span>
              <button className="btn-logout" onClick={onLogout}>Sair</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}