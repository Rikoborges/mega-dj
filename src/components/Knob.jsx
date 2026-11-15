import React, { useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// KNOB giratório (o "botão de girar" das mesas de som)
//
// Como usar:
//   • mouse/dedo: arraste para CIMA para aumentar, para BAIXO para diminuir
//     (é o padrão dos softwares de DJ — girar em círculo com o mouse é difícil)
//   • Shift enquanto arrasta: ajuste fino
//   • duplo clique: volta ao valor padrão (o "centro")
//   • teclado: setas, PageUp/PageDown, Home/End
//
// Para o leitor de tela ele é um role="slider", igual a um <input type="range">.
// ─────────────────────────────────────────────────────────────────────────────

const ANGLE = 135;          // o knob gira de -135° até +135°
const DRAG_PIXELS = 160;    // quantos pixels de arraste vão do mínimo ao máximo

// Ponto na borda de um círculo. 0° = para cima, sentido horário.
function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

// Caminho SVG de um arco entre dois ângulos
function arc(cx, cy, r, from, to) {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export default function Knob({
  label,                 // nome para leitor de tela (ex: "Grave do canal A")
  value, min, max,
  step = 0.5,
  defaultValue = 0,
  onChange,
  format = (v) => String(v),
  color = '#f59e0b',
  bipolar = true,        // true: o arco sai do centro (EQ, filtro). false: sai do início
  disabled = false,      // usado no kill: o knob fica apagado
  size = 40,
}) {
  const dragRef = useRef(null);

  // Posição do knob (0 = todo à esquerda, 1 = todo à direita).
  // No modo bipolar o valor padrão fica SEMPRE no meio (meio-dia), mesmo que a
  // faixa seja desigual. Ex.: EQ de -26 a +6 dB — o 0 dB fica em cima, como nas
  // mesas reais: metade esquerda corta, metade direita reforça.
  const toPos = (v) => {
    if (!bipolar) return (v - min) / (max - min);
    return v <= defaultValue
      ? 0.5 * (v - min) / (defaultValue - min)
      : 0.5 + 0.5 * (v - defaultValue) / (max - defaultValue);
  };
  const fromPos = (pos) => {
    const t = Math.min(1, Math.max(0, pos));
    if (!bipolar) return min + t * (max - min);
    return t <= 0.5
      ? min + (t / 0.5) * (defaultValue - min)
      : defaultValue + ((t - 0.5) / 0.5) * (max - defaultValue);
  };

  const clamp = (v) => Math.min(max, Math.max(min, v));
  const snap  = (v) => Math.round(v / step) * step;
  const emit  = (v) => onChange(clamp(snap(v)));

  // valor → ângulo
  const angle = -ANGLE + toPos(value) * ANGLE * 2;
  const centerAngle = bipolar ? 0 : -ANGLE;

  // ── Arrastar (pointer events = mouse, toque e caneta com o mesmo código) ──
  const onPointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId); // continua recebendo o movimento fora do knob
    dragRef.current = { y: e.clientY, pos: toPos(value) };
  };
  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const fine = e.shiftKey ? 0.2 : 1;
    // O arraste anda na POSIÇÃO do knob, então a sensação é igual dos dois lados
    const delta = ((drag.y - e.clientY) / DRAG_PIXELS) * fine;
    emit(fromPos(drag.pos + delta));
  };
  const endDrag = () => { dragRef.current = null; };

  // ── Teclado ───────────────────────────────────────────────────────────────
  const onKeyDown = (e) => {
    const big = step * 10;
    const keys = {
      ArrowUp: value + step, ArrowRight: value + step,
      ArrowDown: value - step, ArrowLeft: value - step,
      PageUp: value + big, PageDown: value - big,
      Home: min, End: max,
    };
    if (e.key in keys) {
      e.preventDefault();
      e.stopPropagation(); // não deixa a seta mexer no crossfader ao mesmo tempo
      emit(keys[e.key]);
    }
  };

  const c = size / 2;
  const r = c - 4;
  const [ix, iy] = polar(c, c, r - 6, angle);
  const arcFrom = Math.min(centerAngle, angle);
  const arcTo   = Math.max(centerAngle, angle);

  return (
    <div
      className={`knob ${disabled ? 'knob-off' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      title={`${label}: ${format(value)} — duplo clique volta ao centro`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onChange(defaultValue)}
      onKeyDown={onKeyDown}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {/* trilho */}
        <path d={arc(c, c, r, -ANGLE, ANGLE)} stroke="#262636" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* valor */}
        {arcTo - arcFrom > 0.5 && (
          <path d={arc(c, c, r, arcFrom, arcTo)} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />
        )}
        {/* corpo e ponteiro */}
        <circle cx={c} cy={c} r={r - 4} fill="#16161f" stroke="#2a2a3a" />
        <line x1={c} y1={c} x2={ix} y2={iy} stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
