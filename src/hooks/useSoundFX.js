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

  return { playHorn, playTec, playDrop, playScratch };
}
