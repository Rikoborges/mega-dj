import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSoundFX } from './hooks/useSoundFX';
import { toCamelot } from './utils/camelot';
import './styles/App.css';
import Header from './components/Header';
import LoginModal from './components/LoginModal';
import DJDashboard from './components/DJDashboard';
import LoadingScreen from './components/LoadingScreen';
import LocalDJ from './components/LocalDJ';

const CLIENT_ID = 'e6465fb0b2a444fd984014236bbe8c65';

const sCurve = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const isMobile = /iPhone|iPod|(Android.*Mobile)/i.test(navigator.userAgent);
const REDIRECT_URI = window.location.origin;
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

// ── PKCE helpers ─────────────────────────────────────────────────────────────
function generateVerifier(len = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map(b => chars[b % chars.length]).join('');
}

async function pkceChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// ── Token storage ────────────────────────────────────────────────────────────
// Guarda o token + a hora em que ele expira (Spotify: 1h de validade)
function storeTokens(data) {
  localStorage.setItem('spdj_token', data.access_token);
  localStorage.setItem('spdj_expires', String(Date.now() + (data.expires_in || 3600) * 1000));
  if (data.refresh_token) localStorage.setItem('spdj_refresh', data.refresh_token);
}

function clearTokens() {
  localStorage.removeItem('spdj_token');
  localStorage.removeItem('spdj_refresh');
  localStorage.removeItem('spdj_expires');
}

// Troca o refresh token por um access token novo. Retorna o token ou null.
async function refreshAccessToken() {
  const refresh = localStorage.getItem('spdj_refresh');
  if (!refresh) return null;
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refresh,
        client_id:     CLIENT_ID,
      }),
    });
    const data = await res.json();
    if (!data.access_token) return null;
    storeTokens(data);
    return data.access_token;
  } catch {
    return null;
  }
}

function App() {
  // 'spotify' = modo original | 'local' = arquivos do computador (mixagem real)
  const [mode, setMode] = useState('spotify');
  const [token, setToken] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [playerReady, setPlayerReady] = useState(false);

  const [deckA, setDeckA] = useState(null);
  const [deckB, setDeckB] = useState(null);
  const [activeDeck, setActiveDeck] = useState(null); // 'A' | 'B'
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [crossfader, setCrossfader] = useState(50);

  const [library, setLibrary] = useState([]);
  const [setlist, setSetlist] = useState([]);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [transitionDuration, setTransitionDuration] = useState(20);

  const playerRef = useRef(null);
  const tokenRef = useRef(null); // token sempre atual para o SDK, sem recriar o player
  tokenRef.current = token;
  const hasToken = !!token;
  const progressIntervalRef = useRef(null);
  const isTransitioningRef = useRef(false);
  const abortTransitionRef = useRef(false);
  const { playHorn, playTec, playDrop, playScratch, playRiser, playSiren, playClap, playRewind } = useSoundFX();

  // ── OAuth callback: exchange PKCE code for token ─────────────────────────
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      const verifier  = sessionStorage.getItem('spdj_verifier');
      const clientId  = CLIENT_ID;
      window.history.replaceState(null, '', '/');

      fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'authorization_code',
          code,
          redirect_uri:  REDIRECT_URI,
          client_id:     clientId,
          code_verifier: verifier,
        }),
      })
        .then(r => r.json())
        .then(data => {
          sessionStorage.removeItem('spdj_verifier');
          if (data.access_token) {
            storeTokens(data);
            setToken(data.access_token);
          } else {
            alert('❌ Falha ao obter token: ' + (data.error_description || data.error));
          }
        })
        .catch(() => alert('❌ Sem conexão com o Spotify. Tente entrar de novo.'));
      return;
    }

    // Ao recarregar a página: usa o token salvo se ainda vale,
    // senão renova com o refresh token (antes forçava login de novo)
    const saved   = localStorage.getItem('spdj_token');
    const expires = Number(localStorage.getItem('spdj_expires') || 0);
    if (saved && Date.now() < expires - 60_000) {
      setToken(saved);
    } else if (localStorage.getItem('spdj_refresh')) {
      refreshAccessToken().then(t => {
        if (t) setToken(t);
        else clearTokens();
      });
    }
  }, []);

  // ── Login: redirect to Spotify with PKCE ─────────────────────────────────
  const login = async () => {
    const clientId = CLIENT_ID;
    const verifier   = generateVerifier();
    const challenge  = await pkceChallenge(verifier);
    sessionStorage.setItem('spdj_verifier', verifier);

    const params = new URLSearchParams({
      client_id:             clientId,
      response_type:         'code',
      redirect_uri:          REDIRECT_URI,
      scope:                 SCOPES,
      code_challenge_method: 'S256',
      code_challenge:        challenge,
    });
    window.location.href = `https://accounts.spotify.com/authorize?${params}`;
  };

  // ── Auto-refresh: renova 5 min antes de expirar (calculado pela hora real) ─
  useEffect(() => {
    if (!token) return;
    const expires = Number(localStorage.getItem('spdj_expires') || 0);
    const wait = Math.max(10_000, expires - Date.now() - 5 * 60_000);
    const id = setTimeout(async () => {
      const fresh = await refreshAccessToken();
      if (fresh) setToken(fresh);
    }, wait);
    return () => clearTimeout(id);
  }, [token]);

  const logout = () => {
    clearTokens();
    setToken(null); // faltava: sem isso o botão "Sair" não saía do dashboard
    setDeviceId(null);
    setPlayerReady(false);
    setDeckA(null); setDeckB(null);
    setActiveDeck(null); setIsPlaying(false);
    setLibrary([]); setSetlist([]);
    playerRef.current?.disconnect();
    playerRef.current = null;
  };

  // ── Initialize Spotify Web Playback SDK ───────────────────────────────────
  // Depende só de "tem token?" — se dependesse do token em si, a renovação
  // automática (a cada ~1h) desconectava o player e a música parava no meio do set.
  useEffect(() => {
    if (!hasToken) return;

    const initPlayer = () => {
      if (!window.Spotify?.Player) return;

      const player = new window.Spotify.Player({
        name: 'MEGA DJ PRO 🎧',
        getOAuthToken: cb => cb(tokenRef.current),
        volume: 0.8,
      });

      player.addListener('ready', ({ device_id }) => {
        setDeviceId(device_id);
        setPlayerReady(true);
      });

      player.addListener('not_ready', () => setPlayerReady(false));

      player.addListener('player_state_changed', state => {
        if (!state) return;
        setIsPlaying(!state.paused);
        if (state.duration > 0) {
          setProgress((state.position / state.duration) * 100);
        }
      });

      player.addListener('initialization_error', ({ message }) => {
        console.error('SDK init error:', message);
      });

      player.addListener('authentication_error', async () => {
        // Tenta renovar antes de mandar o usuário logar de novo
        const fresh = await refreshAccessToken();
        if (fresh) { setToken(fresh); return; }
        clearTokens();
        setToken(null);
      });

      player.connect();
      playerRef.current = player;
    };

    if (window.Spotify?.Player) {
      // SDK already loaded (hot reload / token change)
      initPlayer();
    } else {
      // Wait for the event dispatched by index.html
      window.addEventListener('spotify-sdk-ready', initPlayer, { once: true });
    }

    return () => {
      window.removeEventListener('spotify-sdk-ready', initPlayer);
      playerRef.current?.disconnect();
    };
  }, [hasToken]);

  // ── Poll progress while playing ───────────────────────────────────────────
  useEffect(() => {
    if (isPlaying && playerRef.current) {
      progressIntervalRef.current = setInterval(async () => {
        const state = await playerRef.current.getCurrentState();
        if (state?.duration > 0) {
          setProgress((state.position / state.duration) * 100);
        }
      }, 500);
    } else {
      clearInterval(progressIntervalRef.current);
    }
    return () => clearInterval(progressIntervalRef.current);
  }, [isPlaying]);

  // ── Crossfader controls volume (bypassed during transition) ──────────────
  useEffect(() => {
    if (!playerRef.current || isTransitioningRef.current) return;
    const vol = activeDeck === 'A'
      ? (100 - crossfader) / 100
      : activeDeck === 'B'
        ? crossfader / 100
        : 0.5;
    playerRef.current.setVolume(Math.max(0.01, vol));
  }, [crossfader, activeDeck]);

  // ── Play a deck's track via SDK REST API ──────────────────────────────────
  const playDeck = useCallback(async (deck) => {
    const track = deck === 'A' ? deckA : deckB;
    if (!track || !deviceId || !token) return;
    setHistory(prev => [{ track, deck, playedAt: Date.now() }, ...prev].slice(0, 50));

    // Transfer playback to our SDK device first (activates it for DRM)
    await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_ids: [deviceId], play: false }),
    });

    await new Promise(r => setTimeout(r, 300));

    const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [`spotify:track:${track.id}`] }),
    });

    if (res.status === 401) { logout(); return; }

    setActiveDeck(deck);
    setIsPlaying(true);
    setProgress(0);
  }, [deckA, deckB, deviceId, token]);

  const pausePlayback = useCallback(async () => {
    await fetch('https://api.spotify.com/v1/me/player/pause', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });
    setIsPlaying(false);
  }, [token]);

  const toggleDeck = useCallback(async (deck) => {
    if (activeDeck === deck && isPlaying) await pausePlayback();
    else await playDeck(deck);
  }, [activeDeck, isPlaying, pausePlayback, playDeck]);

  // ── Cancel in-flight transition ───────────────────────────────────────────
  const cancelTransition = useCallback(() => {
    abortTransitionRef.current = true;
  }, []);

  // ── Transition: crossfade real (preview) ou dois-fase (fallback) ──────────
  const transition = useCallback(async () => {
    const targetDeck  = activeDeck === 'A' ? 'B' : 'A';
    const targetTrack = targetDeck === 'A' ? deckA : deckB;
    if (!targetTrack) { alert('Carregue uma música no outro deck primeiro!'); return; }
    if (isTransitioningRef.current) return;

    const totalMs = transitionDuration * 1000;
    const STEPS   = 80;

    isTransitioningRef.current = true;
    abortTransitionRef.current = false;
    setIsTransitioning(true);

    const startVol = activeDeck === 'A'
      ? Math.max(0.05, (100 - crossfader) / 100)
      : Math.max(0.05, crossfader / 100);

    const done = () => {
      setCrossfader(targetDeck === 'B' ? 95 : 5);
      isTransitioningRef.current = false;
      abortTransitionRef.current = false;
      setIsTransitioning(false);
      setTransitionProgress(0);
    };

    const step = (ms) => new Promise(r => setTimeout(r, ms));
    const aborted = () => abortTransitionRef.current;

    // ── MODO BLEND: dois canais simultâneos via preview URL ─────────────────
    if (targetTrack.previewUrl && transitionDuration >= 10) {
      let preview = null;
      try {
        preview = new Audio(targetTrack.previewUrl);
        preview.volume = 0;
        preview.loop = true;
        await preview.play(); // requer gesto de usuário — já existe pelo clique

        // Crossfade: A (Spotify) desce, B (preview) sobe ao mesmo tempo
        const blendMs  = totalMs * 0.82;
        const swapMs   = totalMs * 0.18;
        const blendStep = blendMs / STEPS;

        for (let i = 1; i <= STEPS; i++) {
          if (aborted()) throw new Error('abort');
          const t = sCurve(i / STEPS);
          playerRef.current?.setVolume(Math.max(0.001, startVol * (1 - t)));
          preview.volume = Math.min(1, t * 0.82);
          setTransitionProgress(Math.round((i / STEPS) * 80));
          await step(blendStep);
        }

        // Troca o Spotify para a track B (A já está em silêncio)
        setTransitionProgress(82);
        await playDeck(targetDeck);
        playerRef.current?.setVolume(0.001);

        // Swap rápido: apaga preview, sobe Spotify B
        const swapStep = swapMs / 30;
        for (let i = 1; i <= 30; i++) {
          if (aborted()) break;
          const t = i / 30;
          preview.volume = Math.max(0, 0.82 * (1 - sCurve(t)));
          playerRef.current?.setVolume(sCurve(t) * 0.85);
          setTransitionProgress(82 + Math.round(t * 18));
          await step(swapStep);
        }

        preview.pause();
        preview = null;
        done();
        return;

      } catch {
        // Preview falhou ou foi cancelado — limpa e cai no fallback
        try { preview?.pause(); } catch {}
        preview = null;
        if (aborted()) {
          playerRef.current?.setVolume(startVol);
          isTransitioningRef.current = false;
          setIsTransitioning(false);
          setTransitionProgress(0);
          return;
        }
        // Restaura volume e continua com fallback abaixo
        playerRef.current?.setVolume(startVol);
        setTransitionProgress(0);
      }
    }

    // ── FALLBACK: fade out A → silêncio → fade in B ─────────────────────────
    const outMs  = totalMs * 0.45;
    const inMs   = totalMs * 0.55;
    const outStep = outMs / STEPS;
    const inStep  = inMs  / STEPS;

    for (let i = 1; i <= STEPS; i++) {
      if (aborted()) { playerRef.current?.setVolume(startVol); done(); return; }
      playerRef.current?.setVolume(Math.max(0.001, startVol * (1 - sCurve(i / STEPS))));
      setTransitionProgress(Math.round((i / STEPS) * 46));
      await step(outStep);
    }

    setTransitionProgress(50);
    await playDeck(targetDeck);
    playerRef.current?.setVolume(0.001);

    for (let i = 1; i <= STEPS; i++) {
      if (aborted()) break;
      playerRef.current?.setVolume(Math.max(0.001, sCurve(i / STEPS) * 0.85));
      setTransitionProgress(50 + Math.round((i / STEPS) * 50));
      await step(inStep);
    }

    done();
  }, [activeDeck, deckA, deckB, crossfader, transitionDuration, playDeck]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'spotify') return; // o modo local tem atalhos próprios
    const onKey = (e) => {
      // Ignora quando está digitando ou usando atalho do navegador (Ctrl+T, Cmd+W…)
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ')                       { e.preventDefault(); if (activeDeck) toggleDeck(activeDeck); }
      else if (e.key === 'q' || e.key === 'Q') toggleDeck('A');
      else if (e.key === 'w' || e.key === 'W') toggleDeck('B');
      else if (e.key === 't' || e.key === 'T') transition();
      else if (e.key === 'Escape')             cancelTransition();
      else if (e.key === 'ArrowLeft')          setCrossfader(v => Math.max(0,   v - 5));
      else if (e.key === 'ArrowRight')         setCrossfader(v => Math.min(100, v + 5));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, activeDeck, toggleDeck, transition, cancelTransition]);

  // ── Track search ──────────────────────────────────────────────────────────
  const mapTrack = (t, bpm) => ({
    id: t.id,
    title: t.name,
    artist: t.artists.map(a => a.name).join(', '),
    image: t.album.images[0]?.url,
    previewUrl: t.preview_url || null,
    spotifyUrl: t.external_urls.spotify,
    duration: Math.round(t.duration_ms / 1000),
    popularity: t.popularity || 0,
    bpm: bpm || 120,
    bpmSource: 'estimado', // vira 'spotify' ou 'tap' quando tiver valor real
  });

  const searchTracks = async (query, estimatedBpm = 120) => {
    if (!token) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ q: query, type: 'track', market: 'BR', limit: '10' });
      const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `Erro ${res.status}`); }
      const data = await res.json();
      const tracks = (data.tracks?.items || [])
        .filter(t => t.album?.images?.[0]?.url)
        .map(t => mapTrack(t, estimatedBpm))
        .sort((a, b) => b.popularity - a.popularity);
      setLibrary(tracks);
    } catch (err) { alert(`❌ ${err.message}`); }
    finally { setIsLoading(false); }
  };

  const getRecommendations = async (seedTrack) => {
    if (!token) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        seed_tracks: seedTrack.id,
        target_tempo: seedTrack.bpm,
        min_popularity: '40',
        market: 'BR',
        limit: '10',
      });
      const res = await fetch(`https://api.spotify.com/v1/recommendations?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();
      const tracks = (data.tracks || [])
        .filter(t => t.album?.images?.[0]?.url)
        .map(t => mapTrack(t, seedTrack.bpm))
        .sort((a, b) => b.popularity - a.popularity);
      setLibrary(tracks);
    } catch { await searchTracks(seedTrack.artist.split(',')[0], seedTrack.bpm); }
    finally { setIsLoading(false); }
  };

  // Fetch real BPM from audio-features (may fail on some app tiers)
  const fetchRealBpm = useCallback(async (track, deck) => {
    if (!token) return;
    try {
      const res = await fetch(`https://api.spotify.com/v1/audio-features/${track.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const f = await res.json();
      const updated = {
        ...track,
        bpm: Math.round(f.tempo),
        bpmSource: 'spotify',
        energy: f.energy,
        danceability: f.danceability,
        key: f.key,
        mode: f.mode,
        camelot: toCamelot(f.key, f.mode),
      };
      if (deck === 'A') setDeckA(prev => prev?.id === track.id ? updated : prev);
      else setDeckB(prev => prev?.id === track.id ? updated : prev);
    } catch { /* use estimated */ }
  }, [token]);

  const loadToDeck = (track, deck) => {
    if (deck === 'A') setDeckA(track);
    else setDeckB(track);
    fetchRealBpm(track, deck);
    playTec();
  };

  const updateDeckBpm = useCallback((deck, bpm) => {
    if (deck === 'A') setDeckA(prev => prev ? { ...prev, bpm, bpmSource: 'tap' } : prev);
    else setDeckB(prev => prev ? { ...prev, bpm, bpmSource: 'tap' } : prev);
  }, []);

  const addToSetlist = (track) => setSetlist(prev => prev.find(t => t.id === track.id) ? prev : [...prev, track]);
  const removeFromSetlist = (id) => setSetlist(prev => prev.filter(t => t.id !== id));
  const moveInSetlist = (from, to) => setSetlist(prev => {
    const next = [...prev];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    return next;
  });

  // ── Save setlist as Spotify playlist ──────────────────────────────────────
  const savePlaylist = async (name) => {
    if (!token || !setlist.length) return;
    setIsLoading(true);
    try {
      const meRes = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${token}` } });
      const me = await meRes.json();

      const createRes = await fetch(`https://api.spotify.com/v1/users/${me.id}/playlists`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: 'Set criado no MEGA DJ PRO 🎧', public: false }),
      });
      const playlist = await createRes.json();

      await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: setlist.map(t => `spotify:track:${t.id}`) }),
      });

      alert(`✅ Playlist "${name}" salva no Spotify com ${setlist.length} músicas!`);
    } catch { alert('❌ Erro ao salvar playlist. Tente novamente.'); }
    finally { setIsLoading(false); }
  };

  // Modo arquivos locais: não depende do Spotify, funciona até no celular
  if (mode === 'local') {
    return (
      <div className="app">
        <Header
          mode="local"
          isAuthenticated={false}
          playerReady={false}
          onLogout={logout}
          onSwitchMode={() => setMode('spotify')}
        />
        <LocalDJ />
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="app">
        <Header isAuthenticated={false} playerReady={false} onLogout={logout} />
        <div className="mobile-block">
          <svg viewBox="0 0 64 64" fill="none" width="72" height="72">
            <rect width="64" height="64" rx="14" fill="#080810"/>
            <path d="M12 36 Q12 18 32 18 Q52 18 52 36" stroke="#f59e0b" strokeWidth="4" fill="none" strokeLinecap="round"/>
            <rect x="7" y="33" width="10" height="16" rx="5" fill="#f59e0b"/>
            <rect x="47" y="33" width="10" height="16" rx="5" fill="#f59e0b"/>
            <circle cx="32" cy="44" r="3" fill="#f59e0b" opacity="0.5"/>
          </svg>
          <h2>MEGA DJ PRO</h2>
          <p>O Spotify Web Playback SDK não funciona em celular — é uma limitação do próprio Spotify.</p>
          <p className="mobile-hint">Abra no <strong>computador</strong> para usar o modo Spotify.</p>
          <button className="btn-local" onClick={() => setMode('local')}>
            🎚 Mixar com músicas do celular
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        mode="spotify"
        isAuthenticated={!!token}
        playerReady={playerReady}
        onLogout={logout}
        onSwitchMode={() => setMode('local')}
      />
      {!token && <LoginModal onLogin={login} onLocal={() => setMode('local')} />}
      {token && (
        <DJDashboard
          deckA={deckA} deckB={deckB}
          activeDeck={activeDeck}
          isPlaying={isPlaying}
          progress={progress}
          crossfader={crossfader}
          library={library}
          setlist={setlist}
          isLoading={isLoading}
          playerReady={playerReady}
          onToggleA={() => toggleDeck('A')}
          onToggleB={() => toggleDeck('B')}
          onTransition={transition}
          onCancelTransition={cancelTransition}
          onCrossfaderChange={setCrossfader}
          isTransitioning={isTransitioning}
          transitionProgress={transitionProgress}
          transitionDuration={transitionDuration}
          onTransitionDurationChange={setTransitionDuration}
          onLoadToDeck={loadToDeck}
          onAddToSetlist={addToSetlist}
          onRemoveFromSetlist={removeFromSetlist}
          onMoveInSetlist={moveInSetlist}
          history={history}
          onSearch={searchTracks}
          onRecommend={getRecommendations}
          onSavePlaylist={savePlaylist}
          onBpmChange={updateDeckBpm}
          onHorn={playHorn}
          onTec={playTec}
          onDrop={playDrop}
          onScratch={playScratch}
          onRiser={playRiser}
          onSiren={playSiren}
          onClap={playClap}
          onRewind={playRewind}
        />
      )}
      <LoadingScreen show={isLoading} />
    </div>
  );
}

export default App;
