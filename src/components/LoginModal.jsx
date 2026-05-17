import React from 'react';
import '../styles/LoginModal.css';

export default function LoginModal({ onLogin }) {
  return (
    <div className="modal">
      <div className="modal-content">
        <div className="modal-header">
          <svg className="modal-logo" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="64" height="64" rx="14" fill="#080810"/>
            <path d="M12 36 Q12 18 32 18 Q52 18 52 36" stroke="#f59e0b" strokeWidth="4" fill="none" strokeLinecap="round"/>
            <rect x="7" y="33" width="10" height="16" rx="5" fill="#f59e0b"/>
            <rect x="47" y="33" width="10" height="16" rx="5" fill="#f59e0b"/>
            <circle cx="32" cy="44" r="3" fill="#f59e0b" opacity="0.5"/>
          </svg>
          <h2>MEGA DJ PRO</h2>
          <p>Conecte sua conta Spotify Premium e monte seus sets</p>
        </div>

        <button className="btn-spotify" onClick={onLogin}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          Entrar com Spotify
        </button>

        <div className="info-box">
          ⚠️ Necessário conta <strong>Spotify Premium</strong>
        </div>
      </div>
    </div>
  );
}
