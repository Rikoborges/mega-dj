import { useRef, useState, useCallback, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// MOTOR DE ÁUDIO — a "mesa de som" feita com a Web Audio API
//
// Cada canal segue o mesmo caminho de uma mesa de DJ de verdade (tipo DJM):
//
//   <audio> ─► TRIM ─► GRAVE ─► MÉDIO ─► AGUDO ─► FILTRO ─► FADER ─► CROSSFADER ─► MASTER ─► caixa
//                                                    │
//                                                    └─► VU (mede antes do fader, como nas mesas reais:
//                                                         assim você acerta o TRIM mesmo com o fader baixo)
//
// Cada seta é um .connect(): é como ligar um cabo de um módulo no outro.
// ─────────────────────────────────────────────────────────────────────────────

const DECKS = ['A', 'B'];

export const EQ_MIN  = -26;  // dB no fim do knob (corta bem, mas ainda dá para ouvir um pouco)
export const EQ_MAX  = 6;    // dB no começo do knob (reforço)
const KILL_DB        = -40;  // "kill": praticamente some com a faixa
export const TRIM_MIN = -12;
export const TRIM_MAX = 12;

// Frequências onde cada banda atua (valores parecidos com os das mesas de clube)
const EQ_FREQ = { low: 250, mid: 1000, high: 4000 };

const EMPTY_DECK = {
  loaded: false,
  name: '',
  duration: 0,
  currentTime: 0,
  playing: false,
  fader: 1,                              // 0 a 1 — volume do canal
  trim: 0,                               // dB
  eq:   { low: 0, mid: 0, high: 0 },     // dB de cada banda
  kill: { low: false, mid: false, high: false },
  filter: 0,                             // -1 (só graves) … 0 (desligado) … +1 (só agudos)
};

// Crossfader de "potência constante": no meio as duas músicas ficam em ~71%
// cada (e não 50%). Com uma linha reta, o som "afunda" no meio da mixagem
// porque o ouvido percebe energia, não amplitude.
function crossfadeGains(x) {
  const t = x / 100; // 0 = todo A, 1 = todo B
  return {
    A: Math.cos(t * Math.PI / 2),
    B: Math.sin(t * Math.PI / 2),
  };
}

// dB → multiplicador de volume. +6 dB ≈ 2x, -6 dB ≈ metade
const dbToGain = (db) => Math.pow(10, db / 20);

// O knob de filtro é um só (como na mesa real):
//   girou para a ESQUERDA → passa-baixa: vai tirando os agudos (som "abafado")
//   girou para a DIREITA  → passa-alta: vai tirando os graves (som "fininho")
//   no MEIO               → os dois filtros abertos, som original
// A frequência anda de forma exponencial porque o ouvido percebe frequência assim
// (de 100 para 200 Hz soa igual a de 1000 para 2000 Hz: uma oitava).
function filterFreqs(v) {
  const DEAD = 0.04; // zona morta no centro, para o meio ser "desligado" de verdade
  if (v < -DEAD) {
    const t = (-v - DEAD) / (1 - DEAD);
    return { lp: 20000 * Math.pow(150 / 20000, t), hp: 10 };
  }
  if (v > DEAD) {
    const t = (v - DEAD) / (1 - DEAD);
    return { lp: 22000, hp: 10 * Math.pow(6000 / 10, t) };
  }
  return { lp: 22000, hp: 10 };
}

// Mudar um valor de uma vez gera um "clique" no alto-falante.
// setTargetAtTime desliza até o valor em ~15ms — rápido e sem estalo.
function smoothSet(param, value, ctx, time = 0.015) {
  param.setTargetAtTime(value, ctx.currentTime, time);
}

// Aplica o estado (React) nos nós de áudio de um canal
function applyChannel(ch, deck, ctx) {
  smoothSet(ch.trim.gain, dbToGain(deck.trim), ctx);
  ['low', 'mid', 'high'].forEach(band => {
    smoothSet(ch[band].gain, deck.kill[band] ? KILL_DB : deck.eq[band], ctx);
  });
  const f = filterFreqs(deck.filter);
  smoothSet(ch.lp.frequency, f.lp, ctx, 0.02);
  smoothSet(ch.hp.frequency, f.hp, ctx, 0.02);
  smoothSet(ch.fader.gain, deck.fader, ctx);
}

// Lê o volume de um AnalyserNode e devolve 0..1 para desenhar o VU
function readLevel(analyser, buffer) {
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0, peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const s = buffer[i];
    sum += s * s;
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sum / buffer.length);
  const db = 20 * Math.log10(rms || 1e-8);
  // Escala do VU: -48 dB = vazio, 0 dB = cheio
  const level = Math.max(0, Math.min(1, (db + 48) / 48));
  return { level, clip: peak >= 0.99 };
}

export function useLocalMixer() {
  const ctxRef    = useRef(null);  // AudioContext (criado só no 1º clique)
  const nodesRef  = useRef(null);  // { master, masterMeter, A: {...}, B: {...} }
  const audioRef  = useRef({});    // elementos <audio> de cada deck
  const urlRef    = useRef({});    // object URLs, para liberar a memória depois
  const bufRef    = useRef(null);  // buffer reaproveitado pelo VU (evita lixo na memória)

  const [decks, setDecks] = useState({ A: { ...EMPTY_DECK }, B: { ...EMPTY_DECK } });
  const decksRef = useRef(decks);  // cópia sempre atual, para usar fora do React
  decksRef.current = decks;

  const [crossfader, setCrossfaderState] = useState(50);
  const crossfaderRef = useRef(50);

  // Atualiza o estado de um deck e, se o áudio já existe, aplica nos nós
  // (o áudio é atualizado FORA do setDecks: a função passada ao setState
  //  precisa ser "pura", o React pode chamá-la duas vezes em desenvolvimento)
  const patchDeck = useCallback((id, patch) => {
    const nextDeck = { ...decksRef.current[id], ...patch };
    decksRef.current = { ...decksRef.current, [id]: nextDeck };
    const nodes = nodesRef.current;
    if (nodes) applyChannel(nodes[id], nextDeck, ctxRef.current);
    setDecks(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  // Cria um <audio> por deck uma vez só. createMediaElementSource só pode
  // ser chamado UMA vez por elemento, então reaproveitamos o mesmo <audio>
  // e só trocamos o src quando carrega outra música.
  useEffect(() => {
    const urls = urlRef.current;
    const audios = audioRef.current;

    // Eventos de tempo não mexem no áudio, então usam um setState direto (mais leve)
    const setInfo = (id, patch) =>
      setDecks(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

    DECKS.forEach(id => {
      const el = new Audio();
      el.preload = 'auto';
      el.addEventListener('loadedmetadata', () => setInfo(id, { duration: el.duration }));
      el.addEventListener('timeupdate',     () => setInfo(id, { currentTime: el.currentTime }));
      el.addEventListener('play',           () => setInfo(id, { playing: true }));
      el.addEventListener('pause',          () => setInfo(id, { playing: false }));
      el.addEventListener('ended',          () => setInfo(id, { playing: false }));
      audios[id] = el;
    });

    return () => {
      DECKS.forEach(id => {
        audios[id]?.pause();
        if (urls[id]) URL.revokeObjectURL(urls[id]);
      });
      ctxRef.current?.close();
    };
  }, []);

  // O navegador só deixa tocar áudio depois de um clique do usuário.
  // Por isso o AudioContext nasce aqui, chamado a partir de um botão.
  const ensureContext = useCallback(() => {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();

      const master = ctx.createGain();
      const masterMeter = ctx.createAnalyser();
      masterMeter.fftSize = 1024;
      master.connect(ctx.destination);
      master.connect(masterMeter);

      const gains = crossfadeGains(crossfaderRef.current);
      const nodes = { master, masterMeter };

      DECKS.forEach(id => {
        const source = ctx.createMediaElementSource(audioRef.current[id]);

        const trim = ctx.createGain();

        const low  = ctx.createBiquadFilter(); low.type  = 'lowshelf';  low.frequency.value  = EQ_FREQ.low;
        const mid  = ctx.createBiquadFilter(); mid.type  = 'peaking';   mid.frequency.value  = EQ_FREQ.mid; mid.Q.value = 0.7;
        const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = EQ_FREQ.high;

        // Dois filtros em série: um corta agudos (lp), outro corta graves (hp).
        // O knob só move um deles por vez; o outro fica "aberto".
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';  lp.Q.value = 1.2;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = 1.2;

        const meter = ctx.createAnalyser();
        meter.fftSize = 1024;

        const fader = ctx.createGain();   // fader vertical do canal
        const xfade = ctx.createGain();   // metade do crossfader deste lado
        xfade.gain.value = gains[id];

        // Os "cabos", na ordem da mesa
        source.connect(trim).connect(low).connect(mid).connect(high)
              .connect(lp).connect(hp).connect(fader).connect(xfade).connect(master);
        hp.connect(meter); // derivação para o VU (antes do fader)

        nodes[id] = { source, trim, low, mid, high, lp, hp, meter, fader, xfade };
        // Se o usuário mexeu nos knobs antes de carregar música, aplica agora
        applyChannel(nodes[id], decksRef.current[id], ctx);
      });

      bufRef.current = new Float32Array(1024);
      nodesRef.current = nodes;
      ctxRef.current = ctx;
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
  }, []);

  // ── Carregar um arquivo do computador no deck ─────────────────────────────
  const load = useCallback((id, file) => {
    // Validação: só aceita arquivo de áudio (o "accept" do input não basta,
    // no arrastar-e-soltar dá para soltar qualquer coisa)
    if (!file || !file.type.startsWith('audio/')) {
      return { ok: false, error: 'Esse arquivo não é de áudio. Use MP3, WAV, OGG, M4A ou FLAC.' };
    }
    ensureContext();

    const el = audioRef.current[id];
    el.pause();
    if (urlRef.current[id]) URL.revokeObjectURL(urlRef.current[id]); // libera a música anterior

    // O arquivo nunca sai do aparelho: o object URL aponta para a memória local
    const url = URL.createObjectURL(file);
    urlRef.current[id] = url;
    el.src = url;

    patchDeck(id, {
      loaded: true,
      name: file.name.replace(/\.[^.]+$/, ''), // tira a extensão
      duration: 0,
      currentTime: 0,
      playing: false,
    });
    return { ok: true };
  }, [ensureContext, patchDeck]);

  // ── Transporte ────────────────────────────────────────────────────────────
  const toggle = useCallback((id) => {
    const el = audioRef.current[id];
    if (!el?.src) return;
    ensureContext();
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }, [ensureContext]);

  const seek = useCallback((id, seconds) => {
    const el = audioRef.current[id];
    if (!el?.src || !Number.isFinite(seconds)) return;
    el.currentTime = seconds;
    patchDeck(id, { currentTime: seconds });
  }, [patchDeck]);

  // ── Controles do canal ────────────────────────────────────────────────────
  const setFader  = useCallback((id, value) => patchDeck(id, { fader: value }), [patchDeck]);
  const setTrim   = useCallback((id, db)    => patchDeck(id, { trim: db }), [patchDeck]);
  const setFilter = useCallback((id, v)     => patchDeck(id, { filter: v }), [patchDeck]);

  const setEq = useCallback((id, band, db) => {
    patchDeck(id, { eq: { ...decksRef.current[id].eq, [band]: db } });
  }, [patchDeck]);

  const toggleKill = useCallback((id, band) => {
    const kill = decksRef.current[id].kill;
    patchDeck(id, { kill: { ...kill, [band]: !kill[band] } });
  }, [patchDeck]);

  const setCrossfader = useCallback((value) => {
    const v = typeof value === 'function' ? value(crossfaderRef.current) : value;
    const clamped = Math.max(0, Math.min(100, v));
    crossfaderRef.current = clamped;
    setCrossfaderState(clamped);
    const nodes = nodesRef.current;
    if (nodes) {
      const g = crossfadeGains(clamped);
      smoothSet(nodes.A.xfade.gain, g.A, ctxRef.current);
      smoothSet(nodes.B.xfade.gain, g.B, ctxRef.current);
    }
  }, []);

  // ── VU: o componente chama isso ~60x por segundo (fora do React) ──────────
  const getLevel = useCallback((which) => {
    const nodes = nodesRef.current;
    if (!nodes) return { level: 0, clip: false };
    const analyser = which === 'master' ? nodes.masterMeter : nodes[which].meter;
    return readLevel(analyser, bufRef.current);
  }, []);

  return {
    decks, crossfader,
    load, toggle, seek,
    setFader, setTrim, setEq, toggleKill, setFilter, setCrossfader,
    getLevel,
  };
}
