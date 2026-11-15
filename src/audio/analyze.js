// ─────────────────────────────────────────────────────────────────────────────
// ANÁLISE DO ARQUIVO DE ÁUDIO — forma de onda e detecção de BPM
//
// Funções "puras": recebem números, devolvem números. Não mexem em React nem na
// tela, por isso dá para testar com o Jest (veja analyze.test.js).
// ─────────────────────────────────────────────────────────────────────────────

// Taxa usada só para ANALISAR (não para tocar). 11025 amostras por segundo
// bastam para achar a batida e gastam 4x menos memória que 44100.
export const ANALYSIS_RATE = 11025;

// Junta os canais (L + R) num só, fazendo a média
export function toMono(channels) {
  if (channels.length === 1) return channels[0];
  const len = channels[0].length;
  const out = new Float32Array(len);
  for (const ch of channels) {
    for (let i = 0; i < len; i++) out[i] += ch[i] / channels.length;
  }
  return out;
}

// ── FORMA DE ONDA ────────────────────────────────────────────────────────────
// Divide a música em `bins` pedaços e guarda o pico de cada um.
// 1000 números desenham a música inteira — não precisa guardar milhões de amostras.
export function computePeaks(samples, bins = 1000) {
  const peaks = new Float32Array(bins);
  const size = samples.length / bins;
  let max = 0;
  for (let b = 0; b < bins; b++) {
    const start = Math.floor(b * size);
    const end = Math.min(samples.length, Math.floor((b + 1) * size));
    let peak = 0;
    for (let i = start; i < end; i++) {
      const a = Math.abs(samples[i]);
      if (a > peak) peak = a;
    }
    peaks[b] = peak;
    if (peak > max) max = peak;
  }
  // Normaliza: a parte mais alta da música vira 1 (o desenho ocupa a altura toda)
  if (max > 0) for (let b = 0; b < bins; b++) peaks[b] /= max;
  return peaks;
}

// ── DETECÇÃO DE BPM ──────────────────────────────────────────────────────────
// Ideia em 4 passos:
//   1. Filtro passa-baixa: fica só com o grave (bumbo e baixo marcam o ritmo)
//   2. Energia em janelinhas de ~5ms → curva de "volume no tempo"
//   3. Onsets: só os AUMENTOS de energia (o "ataque" de cada batida)
//   4. Autocorrelação: compara a curva com ela mesma atrasada. O atraso que mais
//      "encaixa" é o intervalo entre batidas → BPM = 60 / intervalo
// Passos 1 a 3 viram uma função separada, porque o beat grid também usa
export function onsetEnvelope(samples, sampleRate) {
  // 1. Passa-baixa simples de 1 polo (~150 Hz)
  const cutoff = 150;
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
  const hop = Math.max(1, Math.round(sampleRate / 200)); // 200 janelas por segundo
  const frames = Math.floor(samples.length / hop);
  const energy = new Float32Array(frames);

  // 2. Energia por janela (já filtrando no mesmo laço)
  let y = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * hop;
    for (let i = 0; i < hop; i++) {
      y += alpha * (samples[base + i] - y);
      sum += y * y;
    }
    energy[f] = Math.sqrt(sum / hop);
  }

  // 3. Onsets = só as subidas de energia
  const onset = new Float32Array(frames);
  let mean = 0;
  for (let f = 1; f < frames; f++) {
    const d = energy[f] - energy[f - 1];
    onset[f] = d > 0 ? d : 0;
    mean += onset[f];
  }
  mean /= frames;
  return { onset, mean, fps: sampleRate / hop };
}

export function detectBpm(samples, sampleRate, { min = 70, max = 180 } = {}) {
  if (!samples || samples.length < sampleRate * 4) return null; // menos de 4s: pouco para medir

  const { onset: raw, mean, fps } = onsetEnvelope(samples, sampleRate);
  const frames = raw.length;
  // Tira a média para a autocorrelação funcionar bem
  const onset = new Float32Array(frames);
  for (let f = 0; f < frames; f++) onset[f] = raw[f] - mean;

  // 4. Autocorrelação entre os atrasos que correspondem a min..max BPM
  const minLag = Math.floor((60 / max) * fps);
  const maxLag = Math.ceil((60 / min) * fps);
  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let f = lag; f < frames; f++) s += onset[f] * onset[f - lag];
    corr[lag] = s / (frames - lag);
  }

  // Escolhe o melhor atraso. O "peso" favorece tempos perto de 120 BPM, para não
  // confundir 128 com a metade (64) ou o dobro (256) — erro clássico de detector.
  let best = -1, bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * fps) / lag;
    const weight = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    const score = corr[lag] * weight;
    if (score > bestScore) { bestScore = score; best = lag; }
  }
  if (best < 0 || corr[best] <= 0) return null;

  // Interpolação parabólica: acha o pico "entre" dois atrasos, para ter precisão
  // de décimos de BPM (sem isso, a resolução seria de ~3 BPM)
  const a = corr[best - 1], b = corr[best], c = corr[best + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? 0.5 * (a - c) / denom : 0;
  const lag = best + Math.max(-0.5, Math.min(0.5, shift));

  return Math.round(((60 * fps) / lag) * 10) / 10;
}

// Ajusta um BPM para ficar o mais perto possível de outro, dobrando ou pela
// metade (ex.: 87 BPM e 174 BPM tocam juntos, é "double time")
export function matchOctave(bpm, target) {
  const options = [bpm / 2, bpm, bpm * 2];
  return options.reduce((best, b) => (Math.abs(b - target) < Math.abs(best - target) ? b : best));
}

// ── BEAT GRID ────────────────────────────────────────────────────────────────
// O BPM diz a DISTÂNCIA entre as batidas; falta saber ONDE elas caem.
// Testamos cada "deslocamento" possível dentro de uma batida e somamos a força
// dos ataques em offset, offset + 1 batida, offset + 2 batidas, ... O offset
// em que a soma é maior é onde o bumbo bate. Resultado em segundos.
export function detectBeatOffset(samples, sampleRate, bpm) {
  if (!bpm || !samples || samples.length < sampleRate * 4) return 0;
  const { onset, fps } = onsetEnvelope(samples, sampleRate);
  const period = (60 / bpm) * fps; // batida em "janelas" (pode ser quebrado, ex.: 93.75)

  let bestPhase = 0, bestSum = -Infinity;
  const steps = Math.ceil(period);
  for (let ph = 0; ph < steps; ph++) {
    let sum = 0;
    for (let pos = ph; pos < onset.length - 1; pos += period) {
      // interpola entre duas janelas, porque a batida cai "no meio" delas
      const i = Math.floor(pos), frac = pos - i;
      sum += onset[i] * (1 - frac) + onset[i + 1] * frac;
    }
    if (sum > bestSum) { bestSum = sum; bestPhase = ph; }
  }
  return bestPhase / fps;
}

// ── Contas da grade (usadas por cue, loop e sync) ───────────────────────────
// Batida mais próxima de um tempo t (em segundos da música)
export function nearestBeat(t, bpm, offset) {
  const p = 60 / bpm;
  return Math.max(0, offset + Math.round((t - offset) / p) * p);
}

// Em que ponto da batida estamos: 0 = em cima da batida, 0.5 = no meio
export function beatPhase(t, bpm, offset) {
  const x = (t - offset) / (60 / bpm);
  return x - Math.floor(x);
}

// Diferença de fase entre -0.5 e +0.5 (o caminho mais curto para alinhar)
export function phaseDiff(a, b) {
  let d = a - b;
  d -= Math.round(d);
  return d;
}
