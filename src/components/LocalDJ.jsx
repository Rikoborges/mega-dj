import React, { useState, useEffect } from 'react';
import { useLocalMixer, effectiveBpm } from '../hooks/useLocalMixer';
import LocalDeck from './LocalDeck';
import ChannelStrip from './ChannelStrip';
import VuMeter from './VuMeter';
import PhaseMeter from './PhaseMeter';
import '../styles/LocalDJ.css';

export default function LocalDJ() {
  const {
    decks, crossfader, load, toggle, seek,
    setFader, setTrim, setEq, toggleKill, setFilter, setCrossfader, getLevel,
    setPitch, togglePitchRange, toggleKeyLock, nudge, sync, getTime,
    toggleQuantize, hotCue, clearCue, toggleLoop, getPhase,
  } = useLocalMixer();

  const deckProps = (id) => ({
    id,
    deck: decks[id],
    getTime,
    onLoad:       (f) => handleLoad(id, f),
    onToggle:     () => toggle(id),
    onSeek:       (s) => seek(id, s),
    onPitch:      (p) => setPitch(id, p),
    onPitchRange: () => togglePitchRange(id),
    onKeyLock:    () => toggleKeyLock(id),
    onNudge:      (dir) => nudge(id, dir),
    onSync:       () => {
      const r = sync(id);
      setError(r.ok ? '' : r.error);
    },
    onQuantize:   () => toggleQuantize(id),
    onHotCue:     (i) => hotCue(id, i),
    onClearCue:   (i) => clearCue(id, i),
    onLoop:       (n) => {
      const r = toggleLoop(id, n);
      if (r.error) setError(r.error);
    },
  });

  // Diferença de BPM entre os decks (o que o DJ olha antes de mixar)
  const bpmA = effectiveBpm(decks.A);
  const bpmB = effectiveBpm(decks.B);
  const bpmDiff = bpmA && bpmB ? Math.abs(bpmA - bpmB) : null;

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
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"], [role="slider"]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'q') toggle('A');
      else if (k === 'w') toggle('B');
      // Hot cues: 1 2 3 4 no deck A, 7 8 9 0 no deck B
      else if ('1234'.includes(e.key) && e.key.length === 1) hotCue('A', Number(e.key) - 1);
      else if ('7890'.includes(e.key) && e.key.length === 1) hotCue('B', '7890'.indexOf(e.key));
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); setCrossfader(v => v - 5); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setCrossfader(v => v + 5); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, setCrossfader, hotCue]);

  return (
    <div className="local-dj">
      <p className="local-dj-intro">
        Modo <strong>arquivos locais</strong>: as músicas tocam direto do seu aparelho e não são enviadas
        para lugar nenhum. Os dois decks tocam ao mesmo tempo, então dá para mixar de verdade.
      </p>

      {error && <div className="local-dj-error" role="alert">{error}</div>}

      <div className="local-dj-row">
        <LocalDeck {...deckProps('A')} />

        <section className="lmix" aria-label="Mesa de mixagem">
          <div className="lmix-title">MIXER</div>

          <div className="lmix-bpm" aria-live="polite">
            <span className="lmix-bpm-a">{bpmA ? bpmA.toFixed(1) : '—'}</span>
            <span className={`lmix-bpm-diff ${bpmDiff == null ? '' : bpmDiff < 0.1 ? 'ok' : bpmDiff < 3 ? 'near' : 'far'}`}>
              {bpmDiff == null ? 'BPM' : bpmDiff < 0.1 ? 'IGUAL' : `Δ ${bpmDiff.toFixed(1)}`}
            </span>
            <span className="lmix-bpm-b">{bpmB ? bpmB.toFixed(1) : '—'}</span>
          </div>

          <PhaseMeter getPhase={getPhase} />

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
            Hot cues: <kbd>1</kbd>–<kbd>4</kbd> deck A · <kbd>7</kbd>–<kbd>0</kbd> deck B<br />
            Knobs: arraste para cima/baixo · duplo clique zera
          </p>
        </section>

        <LocalDeck {...deckProps('B')} />
      </div>
    </div>
  );
}
