import React from 'react';
import '../styles/LoadingScreen.css';

export default function LoadingScreen({ show, message = 'Buscando HITS...' }) {
  if (!show) return null;

  return (
    <div className="loading">
      <div className="loading-content">
        <div className="spinner"></div>
        <div className="loading-text">
          <h3>{message}</h3>
          <p>Aguarde um momento...</p>
        </div>
      </div>
    </div>
  );
}