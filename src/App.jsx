import React, { useState, useEffect, useRef, useCallback } from 'react';
import './styles/App.css';
import Header from './components/Header';
import LoginModal from './components/LoginModal';
import DJDashboard from './components/DJDashboard';
import LoadingScreen from './components/LoadingScreen';

const REDIRECT_URI = 'http://127.0.0.1:3000';
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

function App() {
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
  const [isLoading, setIsLoading] = useState(false);

  const playerRef = useRef(null);
  const progressIntervalRef = useRef(null);

  // ── OAuth callback: exchange PKCE code for token ─────────────────────────
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      const verifier  = sessionStorage.getItem('spdj_verifier');
      const clientId  = localStorage.getItem('spdj_client_id');
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
          if (data.access_token) {
            setToken(data.access_token);
            localStorage.setItem('spdj_token',   data.access_token);
            if (data.refresh_token) localStorage.setItem('spdj_refresh', data.refresh_token);
          } else {
            alert('❌ Falha ao obter token: ' + (data.error_description || data.error));
          }
        });
      return;
    }

    // Restore saved token on page reload
    const saved = localStorage.getItem('spdj_token');
    if (saved) setToken(saved);
  }, []);

  // ── Login: redirect to Spotify with PKCE ─────────────────────────────────
  const login = async (clientId) => {
    localStorage.setItem('spdj_client_id', clientId);
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

  // ── Auto-refresh token before it expires (every 50 min) ─────────────────
  useEffect(() => {
    if (!token) return;
    const id = setInterval(async () => {
      const refresh  = localStorage.getItem('spdj_refresh');
      const clientId = localStorage.getItem('spdj_client_id');
      if (!refresh || !clientId) return;
      try {
        const res = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type:    'refresh_token',
            refresh_token: refresh,
            client_id:     clientId,
          }),
        });
        const data = await res.json();
        if (data.access_token) {
          setToken(data.access_token);
          localStorage.setItem('spdj_token', data.access_token);
          if (data.refresh_token) localStorage.setItem('spdj_refresh', data.refresh_token);
        }
      } catch { /* silent — will retry next interval */ }
    }, 50 * 60 * 1000); // 50 minutes
    return () => clearInterval(id);
  }, [token]);

  const logout = () => {
    localStorage.removeItem('spdj_token');
    localStorage.removeItem('spdj_refresh');
    setDeviceId(null);
    setPlayerReady(false);
    setDeckA(null); setDeckB(null);
    setActiveDeck(null); setIsPlaying(false);
    setLibrary([]); setSetlist([]);
    playerRef.current?.disconnect();
    playerRef.current = null;
  };

  // ── Initialize Spotify Web Playback SDK ───────────────────────────────────
  useEffect(() => {
    if (!token) return;

    const initPlayer = () => {
      if (!window.Spotify?.Player) return;

      const player = new window.Spotify.Player({
        name: 'MEGA DJ PRO 🎧',
        getOAuthToken: cb => cb(token),
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

      player.addListener('authentication_error', () => {
        localStorage.removeItem('spdj_token');
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
  }, [token]);

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

  // ── Crossfader controls volume ────────────────────────────────────────────
  useEffect(() => {
    if (!playerRef.current) return;
    // A side = left (0), B side = right (100)
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

  // ── Auto-transition: animate crossfader then switch tracks ───────────────
  const transition = useCallback(() => {
    const targetDeck = activeDeck === 'A' ? 'B' : 'A';
    const targetTrack = targetDeck === 'A' ? deckA : deckB;
    if (!targetTrack) { alert('Carregue uma música no outro deck primeiro!'); return; }

    const startCF = crossfader;
    const endCF = targetDeck === 'B' ? 95 : 5;
    const steps = 40;
    let step = 0;

    const id = setInterval(async () => {
      step++;
      setCrossfader(Math.round(startCF + (endCF - startCF) * (step / steps)));
      if (step >= steps) {
        clearInterval(id);
        await playDeck(targetDeck);
      }
    }, 100);
  }, [activeDeck, crossfader, deckA, deckB, playDeck]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === ' ')                       { e.preventDefault(); if (activeDeck) toggleDeck(activeDeck); }
      else if (e.key === 'q' || e.key === 'Q') toggleDeck('A');
      else if (e.key === 'w' || e.key === 'W') toggleDeck('B');
      else if (e.key === 't' || e.key === 'T') transition();
      else if (e.key === 'ArrowLeft')          setCrossfader(v => Math.max(0,   v - 5));
      else if (e.key === 'ArrowRight')         setCrossfader(v => Math.min(100, v + 5));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeDeck, toggleDeck, transition]);

  // ── Track search ──────────────────────────────────────────────────────────
  const mapTrack = (t, bpm) => ({
    id: t.id,
    title: t.name,
    artist: t.artists.map(a => a.name).join(', '),
    image: t.album.images[0]?.url,
    spotifyUrl: t.external_urls.spotify,
    duration: Math.round(t.duration_ms / 1000),
    popularity: t.popularity || 0,
    bpm: bpm || 120,
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
      const updated = { ...track, bpm: Math.round(f.tempo), energy: f.energy, danceability: f.danceability };
      if (deck === 'A') setDeckA(prev => prev?.id === track.id ? updated : prev);
      else setDeckB(prev => prev?.id === track.id ? updated : prev);
    } catch { /* use estimated */ }
  }, [token]);

  const loadToDeck = (track, deck) => {
    if (deck === 'A') setDeckA(track);
    else setDeckB(track);
    fetchRealBpm(track, deck);
  };

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

  return (
    <div className="app">
      <Header isAuthenticated={!!token} playerReady={playerReady} onLogout={logout} />
      {!token && <LoginModal onLogin={login} />}
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
          onCrossfaderChange={setCrossfader}
          onLoadToDeck={loadToDeck}
          onAddToSetlist={addToSetlist}
          onRemoveFromSetlist={removeFromSetlist}
          onMoveInSetlist={moveInSetlist}
          onSearch={searchTracks}
          onRecommend={getRecommendations}
          onSavePlaylist={savePlaylist}
        />
      )}
      <LoadingScreen show={isLoading} />
    </div>
  );
}

export default App;
