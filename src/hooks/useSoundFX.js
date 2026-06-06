import { useCallback } from 'react';

function ctx() {
  return new (window.AudioContext || window.webkitAudioContext)();
}

export function useSoundFX() {
  // Air horn — som de festa DJ
  const playHorn = useCallback(() => {
    try {
      const ac = ctx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const dist = ac.createWaveShaper();

      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i * 2) / 256 - 1;
        curve[i] = (Math.PI + 300) * x / (Math.PI + 300 * Math.abs(x));
      }
      dist.curve = curve;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(460, ac.currentTime + 0.06);

      gain.gain.setValueAtTime(0, ac.currentTime);
      gain.gain.linearRampToValueAtTime(0.38, ac.currentTime + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 1.1);

      osc.connect(dist);
      dist.connect(gain);
      gain.connect(ac.destination);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + 1.1);
      osc.onended = () => ac.close();
    } catch (e) { /* browser may block until user gesture */ }
  }, []);

  // Tec — click eletrônico ao carregar deck
  const playTec = useCallback(() => {
    try {
      const ac = ctx();
      const len = Math.round(ac.sampleRate * 0.07);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.25));
      }
      const src = ac.createBufferSource();
      src.buffer = buf;

      const filter = ac.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1800;

      const gain = ac.createGain();
      gain.gain.value = 0.45;

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);
      src.start(ac.currentTime);
      src.onended = () => ac.close();
    } catch (e) {}
  }, []);

  // Bass drop — subida de tensão antes do drop
  const playDrop = useCallback(() => {
    try {
      const ac = ctx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(25, ac.currentTime + 0.6);
      gain.gain.setValueAtTime(0.55, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + 0.6);
      osc.onended = () => ac.close();
    } catch (e) {}
  }, []);

  // Scratch simulado
  const playScratch = useCallback(() => {
    try {
      const ac = ctx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, ac.currentTime);
      osc.frequency.linearRampToValueAtTime(200, ac.currentTime + 0.08);
      osc.frequency.linearRampToValueAtTime(700, ac.currentTime + 0.15);
      osc.frequency.linearRampToValueAtTime(150, ac.currentTime + 0.22);
      gain.gain.setValueAtTime(0.2, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + 0.25);
      osc.onended = () => ac.close();
    } catch (e) {}
  }, []);

  // Riser — subida de tensão crescente antes do drop
  const playRiser = useCallback(() => {
    try {
      const ac = ctx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, ac.currentTime + 1.6);
      gain.gain.setValueAtTime(0.01, ac.currentTime);
      gain.gain.linearRampToValueAtTime(0.35, ac.currentTime + 1.3);
      gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 1.6);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + 1.6);
      osc.onended = () => ac.close();
    } catch (e) {}
  }, []);

  // Siren — sirene de festa / EDM wail
  const playSiren = useCallback(() => {
    try {
      const ac = ctx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'triangle';
      const t = ac.currentTime;
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.linearRampToValueAtTime(720, t + 0.25);
      osc.frequency.linearRampToValueAtTime(420, t + 0.50);
      osc.frequency.linearRampToValueAtTime(720, t + 0.75);
      osc.frequency.linearRampToValueAtTime(420, t + 1.00);
      osc.frequency.linearRampToValueAtTime(720, t + 1.25);
      gain.gain.setValueAtTime(0.32, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 1.4);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t);
      osc.stop(t + 1.4);
      osc.onended = () => ac.close();
    } catch (e) {}
  }, []);

  // Clap — estalo de caixa percussiva
  const playClap = useCallback(() => {
    try {
      const ac = ctx();
      [0, 0.012, 0.024].forEach(delay => {
        const len = Math.round(ac.sampleRate * 0.18);
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.12));
        }
        const src = ac.createBufferSource();
        src.buffer = buf;
        const filter = ac.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1100;
        filter.Q.value = 0.6;
        const g = ac.createGain();
        g.gain.value = 0.55;
        src.connect(filter);
        filter.connect(g);
        g.connect(ac.destination);
        src.start(ac.currentTime + delay);
      });
      setTimeout(() => ac.close(), 600);
    } catch (e) {}
  }, []);

  // Rewind — freio de vinil / brake stop
  const playRewind = useCallback(() => {
    try {
      const ac = ctx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(650, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(18, ac.currentTime + 0.85);
      gain.gain.setValueAtTime(0.28, ac.currentTime);
      gain.gain.linearRampToValueAtTime(0.28, ac.currentTime + 0.55);
      gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 0.95);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + 0.95);
      osc.onended = () => ac.close();
    } catch (e) {}
  }, []);

  return { playHorn, playTec, playDrop, playScratch, playRiser, playSiren, playClap, playRewind };
}
