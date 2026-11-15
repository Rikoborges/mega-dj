import { useRef, useState, useCallback, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// MOTOR DE ÁUDIO — a "mesa de som" feita com a Web Audio API
//
// Cada deck segue o mesmo caminho de uma mesa de DJ de verdade:
//
//   <audio> ─► FADER do canal ─► CROSSFADER (lado A ou B) ─► MASTER ─► caixa de som
//
// Cada seta é um .connect(): é como ligar um cabo de um módulo no outro.
// Na etapa 2 o EQ e o filtro entram entre o <audio> e o fader.
// ─────────────────────────────────────────────────────────────────────────────

const DECKS = ['A', 'B'];

const EMPTY_DECK = {
  loaded: false,
  name: '',
  duration: 0,
  currentTime: 0,
  playing: false,
  fader: 1,      // 0 a 1 — volume do canal
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

// Mudar o volume de uma vez gera um "clique" no alto-falante.
// setTargetAtTime desliza até o valor em ~15ms — rápido e sem estalo.
function smoothSet(param, value, ctx) {
  param.setTargetAtTime(value, ctx.currentTime, 0.015);
}

export function useLocalMixer() {
  const ctxRef    = useRef(null);  // AudioContext (criado só no 1º clique)
  const nodesRef  = useRef(null);  // { master, A: {...}, B: {...} }
  const audioRef  = useRef({});    // elementos <audio> de cada deck
  const urlRef    = useRef({});    // object URLs, para liberar a memória depois

  const [decks, setDecks] = useState({ A: { ...EMPTY_DECK }, B: { ...EMPTY_DECK } });
  const [crossfader, setCrossfaderState] = useState(50);
  const crossfaderRef = useRef(50);

  const patchDeck = useCallback((id, patch) => {
    setDecks(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  // Cria um <audio> por deck uma vez só. createMediaElementSource só pode
  // ser chamado UMA vez por elemento, então reaproveitamos o mesmo <audio>
  // e só trocamos o src quando carrega outra música.
  useEffect(() => {
    const urls = urlRef.current;
    const audios = audioRef.current;

    DECKS.forEach(id => {
      const el = new Audio();
      el.preload = 'auto';
      el.addEventListener('loadedmetadata', () => patchDeck(id, { duration: el.duration }));
      el.addEventListener('timeupdate',     () => patchDeck(id, { currentTime: el.currentTime }));
      el.addEventListener('play',           () => patchDeck(id, { playing: true }));
      el.addEventListener('pause',          () => patchDeck(id, { playing: false }));
      el.addEventListener('ended',          () => patchDeck(id, { playing: false }));
      audios[id] = el;
    });

    return () => {
      DECKS.forEach(id => {
        audios[id]?.pause();
        if (urls[id]) URL.revokeObjectURL(urls[id]);
      });
      ctxRef.current?.close();
    };
  }, [patchDeck]);

  // O navegador só deixa tocar áudio depois de um clique do usuário.
  // Por isso o AudioContext nasce aqui, chamado a partir de um botão.
  const ensureContext = useCallback(() => {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();

      const master = ctx.createGain();
      master.connect(ctx.destination);

      const gains = crossfadeGains(crossfaderRef.current);
      const nodes = { master };

      DECKS.forEach(id => {
        const source = ctx.createMediaElementSource(audioRef.current[id]);
        const fader  = ctx.createGain();   // fader vertical do canal
        const xfade  = ctx.createGain();   // metade do crossfader deste lado
        xfade.gain.value = gains[id];

        // Os "cabos": <audio> → fader → crossfader → master
        source.connect(fader).connect(xfade).connect(master);
        nodes[id] = { source, fader, xfade };
      });

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

    // O arquivo nunca sai do computador: o object URL aponta para a memória local
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

  // ── Volumes ───────────────────────────────────────────────────────────────
  const setFader = useCallback((id, value) => {
    patchDeck(id, { fader: value });
    const nodes = nodesRef.current;
    if (nodes) smoothSet(nodes[id].fader.gain, value, ctxRef.current);
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

  return { decks, crossfader, load, toggle, seek, setFader, setCrossfader };
}
