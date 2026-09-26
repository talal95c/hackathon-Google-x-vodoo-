// Interface commune des moteurs de musique :
//   setAudioContext(ctx)   start(theme)   stop()   setIntensity(x ∈ [0, 1])
// theme = définition de content/music.js (levels, bpm, density, brightness, synth).
export const lerp = (a, b, t) => a + (b - a) * t;
export const range = ([a, b], t) => lerp(a, b, t);
export const levelOf = (theme, x) => Math.min(theme.levels.length - 1, Math.floor(x * theme.levels.length));
