import React from 'react';
import Knob from './Knob';
import VuMeter from './VuMeter';
import { EQ_MIN, EQ_MAX, TRIM_MIN, TRIM_MAX } from '../hooks/useLocalMixer';

const COLORS = { A: '#f59e0b', B: '#3b82f6' };

const fmtDb = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
const fmtFilter = (v) => {
  if (Math.abs(v) < 0.04) return 'desligado';
  const pct = Math.round(Math.abs(v) * 100);
  return v < 0 ? `corta agudos ${pct}%` : `corta graves ${pct}%`;
};

const BANDS = [
  { key: 'high', label: 'HI',  nome: 'Agudo' },
  { key: 'mid',  label: 'MID', nome: 'Médio' },
  { key: 'low',  label: 'LOW', nome: 'Grave' },
];

export default function ChannelStrip({ id, deck, getLevel, onTrim, onEq, onKill, onFilter, onFader }) {
  const color = COLORS[id];

  return (
    <div className={`strip strip-${id}`} style={{ '--deck': color }}>
      <div className="strip-name">{id}</div>

      <div className="strip-knob">
        <Knob
          label={`Trim do canal ${id}`}
          value={deck.trim} min={TRIM_MIN} max={TRIM_MAX} step={0.5}
          onChange={(v) => onTrim(v)}
          format={fmtDb} color={color}
        />
        <span className="strip-label">TRIM</span>
      </div>

      <div className="strip-sep" />

      {BANDS.map(b => (
        <div className="strip-knob" key={b.key}>
          <Knob
            label={`${b.nome} do canal ${id}`}
            value={deck.eq[b.key]} min={EQ_MIN} max={EQ_MAX} step={0.5}
            onChange={(v) => onEq(b.key, v)}
            format={fmtDb} color={color}
            disabled={deck.kill[b.key]}
          />
          {/* Clicar no nome da banda = KILL (zera a faixa na hora; clicar de novo volta) */}
          <button
            className={`strip-kill ${deck.kill[b.key] ? 'on' : ''}`}
            onClick={() => onKill(b.key)}
            aria-pressed={deck.kill[b.key]}
            aria-label={`Kill do ${b.nome.toLowerCase()} no canal ${id}`}
            title="Kill: corta essa faixa na hora"
          >
            {b.label}
          </button>
        </div>
      ))}

      <div className="strip-sep" />

      <div className="strip-knob">
        <Knob
          label={`Filtro do canal ${id}`}
          value={deck.filter} min={-1} max={1} step={0.02}
          onChange={(v) => onFilter(v)}
          format={fmtFilter} color="#a78bfa"
          size={46}
        />
        <span className="strip-label">FILTER</span>
      </div>

      <div className="strip-bottom">
        <VuMeter getLevel={getLevel} source={id} label={`do canal ${id}`} />
        <input
          type="range"
          className="lmix-fader"
          min="0" max="1" step="0.01"
          value={deck.fader}
          onChange={(e) => onFader(Number(e.target.value))}
          aria-label={`Volume do canal ${id}`}
          aria-valuetext={`${Math.round(deck.fader * 100)}%`}
        />
      </div>
    </div>
  );
}
