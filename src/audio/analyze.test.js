import {
  detectBpm, computePeaks, matchOctave, detectBeatOffset,
  nearestBeat, beatPhase, phaseDiff, ANALYSIS_RATE,
} from './analyze';

// Gera uma "música" de teste: um bumbo (seno grave que decai) a cada batida,
// mais um chimbal agudo no contratempo e um pouco de ruído por cima.
function fakeTrack(bpm, seconds = 30, rate = ANALYSIS_RATE, offset = 0) {
  const out = new Float32Array(seconds * rate);
  const beat = (60 / bpm) * rate;
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const start = Math.round(offset * rate);
  for (let i = start; i < out.length; i++) {
    const j = i - start;                             // a música "começa" no offset
    const tBeat = (j % beat) / rate;                 // tempo desde o último bumbo
    const tOff = ((j + beat / 2) % beat) / rate;     // tempo desde o último chimbal
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

describe('detectBeatOffset (beat grid)', () => {
  test.each([
    [128, 0.3],
    [124, 0.05],
    [100, 0.41],
  ])('%i BPM com a 1ª batida em %ss', (bpm, offset) => {
    const found = detectBeatOffset(fakeTrack(bpm, 30, ANALYSIS_RATE, offset), ANALYSIS_RATE, bpm);
    // A grade se repete a cada batida: o que importa é cair na batida certa
    const period = 60 / bpm;
    const err = Math.abs(phaseDiff(found / period, offset / period)) * period;
    expect(err).toBeLessThan(0.01); // menos de 10 ms
  });
});

describe('contas da grade', () => {
  test('nearestBeat gruda na batida mais próxima', () => {
    // 120 BPM = uma batida a cada 0.5s, começando em 0.1s
    expect(nearestBeat(1.32, 120, 0.1)).toBeCloseTo(1.1);
    expect(nearestBeat(1.38, 120, 0.1)).toBeCloseTo(1.6);
  });
  test('beatPhase: 0 em cima da batida, 0.5 no meio', () => {
    expect(beatPhase(1.1, 120, 0.1)).toBeCloseTo(0);
    expect(beatPhase(1.35, 120, 0.1)).toBeCloseTo(0.5);
  });
  test('phaseDiff pega o caminho mais curto', () => {
    expect(phaseDiff(0.95, 0.05)).toBeCloseTo(-0.1);
    expect(phaseDiff(0.1, 0.9)).toBeCloseTo(0.2);
  });
});
