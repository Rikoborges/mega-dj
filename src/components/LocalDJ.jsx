import React, { useState, useEffect } from 'react';
import { useLocalMixer } from '../hooks/useLocalMixer';
import LocalDeck from './LocalDeck';
import ChannelStrip from './ChannelStrip';
import VuMeter from './VuMeter';
import '../styles/LocalDJ.css';

export default function LocalDJ() {
  const {
    decks, crossfader, load, toggle, seek,
    setFader, setTrim, setEq, toggleKill, setFilter, setCrossfader, getLevel,
  } = useLocalMixer();

  const stripProps = (id) => ({
    id,
    deck: decks[id],
    getLevel,
    onTrim:   (v) => setTrim(id, v),
    onEq:     (band, v) => setEq(id, band, v),
    onKill:   (band) => toggleKill(id, band),
    onFilter: (v) => setFilter(id, v),
    onFader:  (v) => setFader(id, v),
  });
  const [error, setError] = useState('');

  const handleLoad = (id, file) => {
    const result = load(id, file);
    setError(result.ok ? '' : result.error);
  };

  // Atalhos: Q/W tocam os decks, setas mexem o crossfader
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable="true"], [role="slider"]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'q') toggle('A');
      else if (k === 'w') toggle('B');
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); setCrossfader(v => v - 5); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setCrossfader(v => v + 5); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, setCrossfader]);

  return (
    <div className="local-dj">
      <p className="local-dj-intro">
        Modo <strong>arquivos locais</strong>: as músicas tocam direto do seu aparelho e não são enviadas
        para lugar nenhum. Os dois decks tocam ao mesmo tempo, então dá para mixar de verdade.
      </p>

      {error && <div className="local-dj-error" role="alert">{error}</div>}

      <div className="local-dj-row">
        <LocalDeck
          id="A"
          deck={decks.A}
          onLoad={(f) => handleLoad('A', f)}
          onToggle={() => toggle('A')}
          onSeek={(s) => seek('A', s)}
        />

        <section className="lmix" aria-label="Mesa de mixagem">
          <div className="lmix-title">MIXER</div>

          <div className="lmix-strips">
            <ChannelStrip {...stripProps('A')} />
            <div className="lmix-master">
              <VuMeter getLevel={getLevel} source="master" label="master" />
              <span className="strip-label">MASTER</span>
            </div>
            <ChannelStrip {...stripProps('B')} />
          </div>

          <div className="lmix-xf">
            <div className="lmix-xf-labels" aria-hidden="true">
              <span className={crossfader < 40 ? 'on' : ''}>A</span>
              <span className={crossfader > 60 ? 'on' : ''}>B</span>
            </div>
            <input
              type="range"
              className="lmix-crossfader"
              min="0" max="100"
              value={crossfader}
              onChange={(e) => setCrossfader(Number(e.target.value))}
              onDoubleClick={() => setCrossfader(50)}
              aria-label="Crossfader"
              aria-valuetext={crossfader === 50 ? 'Centro' : crossfader < 50 ? `Mais deck A` : `Mais deck B`}
            />
            <div className="lmix-xf-tag">CROSSFADER</div>
          </div>

          <p className="lmix-keys">
            <kbd>Q</kbd> / <kbd>W</kbd> tocar · <kbd>←</kbd> <kbd>→</kbd> crossfader<br />
            Knobs: arraste para cima/baixo · duplo clique zera
          </p>
        </section>

        <LocalDeck
          id="B"
          deck={decks.B}
          onLoad={(f) => handleLoad('B', f)}
          onToggle={() => toggle('B')}
          onSeek={(s) => seek('B', s)}
        />
      </div>
    </div>
  );
}
