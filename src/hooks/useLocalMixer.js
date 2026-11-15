import { useRef, useState, useCallback, useEffect } from 'react';
import {
  ANALYSIS_RATE, toMono, computePeaks, detectBpm, matchOctave,
  detectBeatOffset, nearestBeat, beatPhase, phaseDiff,
} from '../audio/analyze';

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
  // ── Etapa 3 ──
  analyzing: false,                      // analisando o arquivo (BPM + forma de onda)
  bpm: null,                             // BPM original detectado no arquivo
  peaks: null,                           // forma de onda (Float32Array de 0 a 1)
  pitch: 0,                              // % de velocidade (+2 = 2% mais rápido)
  pitchRange: 8,                         // ±8% ou ±16%, como nos CDJs
  keyLock: true,                         // muda a velocidade sem mudar o tom
  // ── Etapa 4 ──
  beatOffset: 0,                         // segundo em que cai a 1ª batida (beat grid)
  cues: [null, null, null, null],        // 4 hot cues (tempo em segundos)
  loop: null,                            // { start, end, beats } ou null
  quantize: true,                        // cue e loop "grudam" na batida
};

export const HOT_CUES = 4;
export const LOOP_SIZES = [1, 2, 4, 8];

// BPM que está tocando agora (BPM original × velocidade do pitch)
export const effectiveBpm = (deck) =>
  deck.bpm ? deck.bpm * (1 + deck.pitch / 100) : null;

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

// Velocidade do <audio>. Com preservesPitch (KEY LOCK) o navegador estica o
// tempo sem mudar o tom — o "master tempo" dos CDJs. Sem ele, acelerar deixa
// a música mais aguda, como num toca-discos.
function applyRate(el, deck, bend = 1) {
  if (!el) return;
  el.playbackRate = (1 + deck.pitch / 100) * bend;
  el.defaultPlaybackRate = 1 + deck.pitch / 100; // senão, ao trocar o src, a velocidade volta para 1
  el.preservesPitch = deck.keyLock;
  el.webkitPreservesPitch = deck.keyLock; // Safari antigo
}

// Decodifica o arquivo numa taxa baixa e calcula forma de onda + BPM
async function analyzeFile(file) {
  const data = await file.arrayBuffer();
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  // OfflineAudioContext não toca nada: só serve para decodificar/converter.
  // Ao decodificar nele, o áudio já vem convertido para ANALYSIS_RATE.
  const off = new Offline(1, 1, ANALYSIS_RATE);
  const audio = await off.decodeAudioData(data);
  const channels = [];
  for (let c = 0; c < audio.numberOfChannels; c++) channels.push(audio.getChannelData(c));
  const mono = toMono(channels);
  const bpm = detectBpm(mono, audio.sampleRate);
  return {
    peaks: computePeaks(mono, 1200),
    bpm,
    beatOffset: bpm ? detectBeatOffset(mono, audio.sampleRate, bpm) : 0,
  };
}

// Com QUANTIZE ligado e grade detectada, o tempo "gruda" na batida mais próxima
const snap = (deck, t) =>
  deck.quantize && deck.bpm ? nearestBeat(t, deck.bpm, deck.beatOffset) : t;

// Quanto (em segundos da música) o deck "me" precisa andar para o bumbo cair
// junto com o do deck "other". Positivo = precisa adiantar. null = sem grade.
function phaseShift(me, other, myTime, otherTime) {
  const target = effectiveBpm(other);
  if (!me.bpm || !target) return null;
  const base = matchOctave(me.bpm, target); // trata 87 e 174 como compatíveis
  const myPhase = beatPhase(myTime, base, me.beatOffset);
  const otherPhase = beatPhase(otherTime, other.bpm, other.beatOffset);
  return phaseDiff(otherPhase, myPhase) * (60 / base); // caminho mais curto
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
  const loadIdRef = useRef({ A: 0, B: 0 }); // descarta análise de uma música que já foi trocada
  const bendRef   = useRef({ A: 1, B: 1 }); // empurrãozinho temporário de velocidade (nudge)

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
    applyRate(audioRef.current[id], nextDeck, bendRef.current[id]);
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
      analyzing: true,
      bpm: null,
      peaks: null,
      pitch: 0,
      beatOffset: 0,
      cues: [null, null, null, null],
      loop: null,
    });

    // Analisa em segundo plano: a música já pode tocar enquanto isso.
    // O "loadId" evita um bug clássico de async: se o usuário trocar de música
    // antes de a análise terminar, o resultado antigo não pode sobrescrever o novo.
    const loadId = ++loadIdRef.current[id];
    analyzeFile(file)
      .then(({ peaks, bpm, beatOffset }) => {
        if (loadIdRef.current[id] === loadId) patchDeck(id, { peaks, bpm, beatOffset, analyzing: false });
      })
      .catch(() => {
        if (loadIdRef.current[id] === loadId) patchDeck(id, { analyzing: false });
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
    const loop = decksRef.current[id].loop;
    // Pulou para fora do loop? Então sai do loop (senão ele puxaria de volta)
    const leaveLoop = loop && (seconds < loop.start || seconds >= loop.end);
    el.currentTime = seconds;
    patchDeck(id, leaveLoop ? { currentTime: seconds, loop: null } : { currentTime: seconds });
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

  // ── Pitch, key lock, nudge e sync ──────────────────────────────────────────
  const setPitch = useCallback((id, pct) => {
    const range = decksRef.current[id].pitchRange;
    patchDeck(id, { pitch: Math.max(-range, Math.min(range, pct)) });
  }, [patchDeck]);

  const togglePitchRange = useCallback((id) => {
    const d = decksRef.current[id];
    const pitchRange = d.pitchRange === 8 ? 16 : 8;
    patchDeck(id, { pitchRange, pitch: Math.max(-pitchRange, Math.min(pitchRange, d.pitch)) });
  }, [patchDeck]);

  const toggleKeyLock = useCallback((id) => {
    patchDeck(id, { keyLock: !decksRef.current[id].keyLock });
  }, [patchDeck]);

  // Nudge: enquanto segura o botão, o deck anda 4% mais rápido/devagar.
  // É assim que o DJ "empurra" a música para alinhar as batidas.
  const nudge = useCallback((id, direction) => {
    bendRef.current[id] = 1 + direction * 0.04; // direction: -1, 0 ou +1
    applyRate(audioRef.current[id], decksRef.current[id], bendRef.current[id]);
  }, []);

  // Ajuste fino de fase sem pular (até `tries` rodadas)
  const fineAlign = useCallback((id, tries) => {
    const otherId = id === 'A' ? 'B' : 'A';
    setTimeout(() => {                       // espera o último pulo "assentar"
      const myEl = audioRef.current[id];
      const otherEl = audioRef.current[otherId];
      if (!myEl || !otherEl || myEl.paused || otherEl.paused) return;
      const me = decksRef.current[id];
      const r = phaseShift(me, decksRef.current[otherId], myEl.currentTime, otherEl.currentTime);
      if (r == null || Math.abs(r) < 0.004 || tries <= 0) return; // < 4 ms: já está ótimo

      // Quanto acelerar para andar "r" a mais em D segundos:
      //   velocidade × (bend − 1) × D = r   →   bend = 1 + r / (velocidade × D)
      const D = 0.4;
      const speed = 1 + me.pitch / 100;
      const bend = Math.max(0.85, Math.min(1.15, 1 + r / (speed * D)));
      bendRef.current[id] = bend;
      applyRate(myEl, me, bend);
      setTimeout(() => {
        bendRef.current[id] = 1;
        applyRate(audioRef.current[id], decksRef.current[id], 1);
        fineAlign(id, tries - 1);            // confere de novo
      }, D * 1000);
    }, 250);
  }, []);

  // SYNC: ajusta o pitch deste deck para o BPM ficar igual ao do outro.
  // Obs.: iguala a VELOCIDADE; alinhar as batidas no tempo é com o nudge.
  const sync = useCallback((id) => {
    const me = decksRef.current[id];
    const other = decksRef.current[id === 'A' ? 'B' : 'A'];
    const target = effectiveBpm(other);
    if (!me.bpm || !target) {
      return { ok: false, error: 'Para sincronizar, os dois decks precisam ter o BPM detectado.' };
    }
    const base = matchOctave(me.bpm, target); // trata 87 e 174 como compatíveis
    const pct = (target / base - 1) * 100;
    if (Math.abs(pct) > 16) {
      return { ok: false, error: `Diferença grande demais (${pct.toFixed(1)}%). O pitch só vai até ±16%.` };
    }
    const pitchRange = Math.abs(pct) > 8 ? 16 : me.pitchRange;
    patchDeck(id, { pitchRange, pitch: Math.round(pct * 100) / 100 });

    // Sync de FASE (se o outro deck está tocando): faz o bumbo cair junto.
    //   1º passo: um PULO para chegar perto.
    //   2º passo: ajuste fino SEM pular. Todo pulo no <audio> tem um "engasgo"
    //   de dezenas de ms (medido: ~70 ms, até ~100 ms com key lock), então
    //   pular de novo nunca acerta. Em vez disso, acelera/freia um pouquinho
    //   por 0.4s até encaixar — é o nudge que o DJ faz na mão, só que automático.
    const otherId = id === 'A' ? 'B' : 'A';
    const myEl = audioRef.current[id];
    const otherEl = audioRef.current[otherId];
    if (otherEl && !otherEl.paused && myEl?.src) {
      const shift = phaseShift(me, other, myEl.currentTime, otherEl.currentTime);
      const newPitch = Math.round(pct * 100) / 100;
      if (newPitch === 0) {
        // Velocidade exatamente 1: o navegador toca direto, sem o "esticador"
        // do key lock, e o pulo cai certinho (medido: 0 ms). Mexer na velocidade
        // aqui ligaria/desligaria o esticador e criaria o engasgo — então só pula.
        if (shift != null && Math.abs(shift) > 0.002) myEl.currentTime = Math.max(0, myEl.currentTime + shift);
      } else {
        if (shift != null && Math.abs(shift) > 0.06) myEl.currentTime = Math.max(0, myEl.currentTime + shift);
        fineAlign(id, 3);
      }
    }
    return { ok: true };
  }, [patchDeck, fineAlign]);

  // ── Etapa 4: quantize, hot cues, loops ────────────────────────────────────
  const toggleQuantize = useCallback((id) => {
    patchDeck(id, { quantize: !decksRef.current[id].quantize });
  }, [patchDeck]);

  // Hot cue vazio → grava a posição. Hot cue gravado → pula para ele e toca.
  const hotCue = useCallback((id, i) => {
    const el = audioRef.current[id];
    const deck = decksRef.current[id];
    if (!el?.src) return;
    const cue = deck.cues[i];
    if (cue == null) {
      const cues = [...deck.cues];
      cues[i] = snap(deck, el.currentTime);
      patchDeck(id, { cues });
    } else {
      seek(id, cue);
      if (el.paused) { ensureContext(); el.play().catch(() => {}); }
    }
  }, [patchDeck, seek, ensureContext]);

  const clearCue = useCallback((id, i) => {
    const cues = [...decksRef.current[id].cues];
    cues[i] = null;
    patchDeck(id, { cues });
  }, [patchDeck]);

  // Loop de N batidas a partir da batida atual. Apertar o mesmo de novo = sair.
  const toggleLoop = useCallback((id, beats) => {
    const el = audioRef.current[id];
    const deck = decksRef.current[id];
    if (!el?.src) return { ok: false };
    if (deck.loop && deck.loop.beats === beats) {
      patchDeck(id, { loop: null });
      return { ok: true };
    }
    if (!deck.bpm) return { ok: false, error: 'O loop precisa do BPM detectado para saber o tamanho da batida.' };
    // Se já está num loop e muda o tamanho, mantém o mesmo começo (igual CDJ)
    const start = deck.loop ? deck.loop.start : snap(deck, el.currentTime);
    patchDeck(id, { loop: { start, end: start + beats * (60 / deck.bpm), beats } });
    return { ok: true };
  }, [patchDeck]);

  // Vigia dos loops: 60x por segundo confere se algum deck passou do fim do
  // loop e, se passou, volta para o começo + o que passou (para não "comer" tempo).
  // Fica num efeito separado e lê decksRef, então não reinicia a cada render.
  useEffect(() => {
    let frame;
    const tick = () => {
      DECKS.forEach(id => {
        const loop = decksRef.current[id].loop;
        const el = audioRef.current[id];
        if (!loop || !el || el.paused) return;
        if (el.currentTime >= loop.end) {
          const over = (el.currentTime - loop.end) % (loop.end - loop.start);
          el.currentTime = loop.start + over;
        }
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Fase da batida agora (para o medidor de fase do mixer, a 60 fps)
  const getPhase = useCallback((id) => {
    const deck = decksRef.current[id];
    const el = audioRef.current[id];
    if (!deck.bpm || !el?.src) return null;
    return {
      phase: beatPhase(el.currentTime, deck.bpm, deck.beatOffset),
      beatSec: 60 / effectiveBpm(deck), // duração de 1 batida no tempo real (com pitch)
      playing: !el.paused,
    };
  }, []);

  // Posição atual em segundos (para a forma de onda desenhar a 60 fps, fora do React)
  const getTime = useCallback((id) => audioRef.current[id]?.currentTime || 0, []);

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
    setPitch, togglePitchRange, toggleKeyLock, nudge, sync,
    toggleQuantize, hotCue, clearCue, toggleLoop,
    getLevel, getTime, getPhase,
  };
}
