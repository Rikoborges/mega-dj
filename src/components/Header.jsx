import React from 'react';
import '../styles/Header.css';

export default function Header({ isAuthenticated, playerReady, onLogout }) {
  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <svg className="logo-svg" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="48" height="48" rx="10" fill="#0e0e18"/>
            <path d="M9 28 Q9 14 24 14 Q39 14 39 28" stroke="#f59e0b" strokeWidth="3" fill="none" strokeLinecap="round"/>
            <rect x="5" y="25" width="8" height="13" rx="4" fill="#f59e0b"/>
            <rect x="35" y="25" width="8" height="13" rx="4" fill="#f59e0b"/>
            <circle cx="24" cy="34" r="2.5" fill="#f59e0b" opacity="0.4"/>
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