import { detectBpm, computePeaks, matchOctave, ANALYSIS_RATE } from './analyze';

// Gera uma "música" de teste: um bumbo (seno grave que decai) a cada batida,
// mais um chimbal agudo no contratempo e um pouco de ruído por cima.
function fakeTrack(bpm, seconds = 30, rate = ANALYSIS_RATE) {
  const out = new Float32Array(seconds * rate);
  const beat = (60 / bpm) * rate;
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let i = 0; i < out.length; i++) {
    const tBeat = (i % beat) / rate;                 // tempo desde o último bumbo
    const tOff = ((i + beat / 2) % beat) / rate;     // tempo desde o último chimbal
    const kick = Math.sin(2 * Math.PI * 55 * tBeat) * Math.exp(-tBeat * 18);
    const hat = noise() * Math.exp(-tOff * 60) * 0.3;
    out[i] = kick * 0.8 + hat + noise() * 0.05;
  }
  return out;
}

describe('detectBpm', () => {
  test.each([128, 100, 174, 90, 140])('acha %i BPM', (bpm) => {
    const found = detectBpm(fakeTrack(bpm), ANALYSIS_RATE);
    // 174 pode legitimamente sair como 87 (metade) — DJ trata os dois como compatíveis
    expect(matchOctave(found, bpm)).toBeCloseTo(bpm, 0);
  });

  test('áudio curto demais devolve null', () => {
    expect(detectBpm(new Float32Array(ANALYSIS_RATE), ANALYSIS_RATE)).toBeNull();
  });
});

describe('computePeaks', () => {
  test('normaliza o pico mais alto para 1', () => {
    const peaks = computePeaks(new Float32Array([0, 0.25, -0.5, 0.1]), 2);
    expect(Array.from(peaks)).toEqual([0.5, 1]);
  });
});

describe('matchOctave', () => {
  test('87 BPM vira 174 para combinar com 172', () => {
    expect(matchOctave(87, 172)).toBe(174);
  });
});
