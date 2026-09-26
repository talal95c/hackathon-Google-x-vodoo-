// Tests du suivi de rythme (pur calcul, sans navigateur)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BeatTracker } from '../src/audio/music/BeatTracker.js';

// Piste synthétique : kicks (sinus grave qui chute) + charlestons à contretemps + bruit
function track({ bpm, offset, seconds, sr = 48000, seed = 1 }) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const out = new Float32Array(Math.round(seconds * sr));
  const period = 60 / bpm;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const k = ((t - offset) % period + period) % period;            // temps depuis le dernier kick
    const h = ((t - offset - period / 2) % period + period) % period; // contretemps
    const kick = k < 0.15 ? Math.sin(2 * Math.PI * (60 + 90 * Math.exp(-k * 30)) * k) * Math.exp(-k * 18) : 0;
    const hat = h < 0.03 ? rnd() * 0.3 * Math.exp(-h * 120) : 0;
    out[i] = kick * 0.8 + hat + rnd() * 0.02;
  }
  return out;
}

const phaseError = (est, bpmTrue, offset) => {
  const p = 60 / bpmTrue;
  const d = (((est.beatTime - offset) % p) + p) % p;
  return Math.min(d, p - d); // secondes
};

test('retrouve tempo et phase d\'une piste qui dérive du BPM demandé', () => {
  const tr = new BeatTracker();
  const sr = 48000, pcm = track({ bpm: 131, offset: 0.137, seconds: 10, sr });
  // arrive par blocs de 2 s, comme Lyria
  for (let i = 0; i < pcm.length; i += sr * 2) tr.analyze(pcm.subarray(i, i + sr * 2), sr, i / sr);
  const est = tr.estimate(128);
  assert.ok(est, 'estimation attendue');
  assert.ok(Math.abs(est.bpm - 131) < 1, `tempo ${est.bpm.toFixed(1)}`);
  assert.ok(phaseError(est, 131, 0.137) < 0.02, `phase à ${(phaseError(est, 131, 0.137) * 1000).toFixed(0)} ms`);
  assert.ok(est.confidence > 2, `confiance ${est.confidence.toFixed(2)}`);
});

test('confiance faible sur du bruit sans rythme', () => {
  const tr = new BeatTracker();
  const sr = 48000, n = sr * 8;
  let s = 7; const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 0.5;
  tr.analyze(pcm, sr, 0);
  const est = tr.estimate(128);
  assert.ok(!est || est.confidence < 2.5, `confiance ${est?.confidence.toFixed(2)}`);
});
