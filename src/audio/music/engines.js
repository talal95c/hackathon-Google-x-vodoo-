// Interface commune des moteurs de musique :
//   setAudioContext(ctx)  start(theme, tempo)  stop()  setTempo(tempo)  setIntensity(x ∈ [0, 1])  bpm
// theme = définition de content/music.js ; tempo = { level, ratio } (palier du kernel).
export const lerp = (a, b, t) => a + (b - a) * t;
export const range = ([a, b], t) => lerp(a, b, t);
// palier de tempo du jeu → prompt du thème (5 paliers de jeu pour 4 prompts, par ex.)
export const promptIndex = (theme, level, levelCount) =>
  Math.min(theme.levels.length - 1, Math.round((level * (theme.levels.length - 1)) / Math.max(1, levelCount - 1)));
