// Synthesized Web Audio sound effects and Google DeepMind Lyria RealTime music integration
import { LyriaLiveDJ } from './lyriaMusic.js';

export const lyriaDJ = new LyriaLiveDJ(null);

class SoundEffects {
  constructor() {
    this.ctx = null;
    this.musicPlaying = false;
    this.musicBpm = 118;
    this.musicIntensity = 0; // 0.0 to 1.0 based on 3D score/speed
    this.currentStep = 0;
    this.nextNoteTime = 0;
    this.musicTimer = null;
    this.masterMusicGain = null;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.masterMusicGain && this.ctx) {
      this.masterMusicGain = this.ctx.createGain();
      this.masterMusicGain.gain.setValueAtTime(0.24, this.ctx.currentTime);
      this.masterMusicGain.connect(this.ctx.destination);
    }
    lyriaDJ.setAudioContext(this.ctx);
  }

  // --- Retro 2D and general SFX ---

  playJump() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'square';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.12);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  playLand() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.09);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  playScore() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [440, 660, 880].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);

      gain.gain.setValueAtTime(0.12, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.09);

      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.09);
    });
  }

  playPhaseUp() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Radiant crystalline arpeggio chord burst
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51]; // C major 7 shimmer
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.05);

      gain.gain.setValueAtTime(0.1, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.35);

      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.35);
    });
  }

  playHit() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.3);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  playCrack() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1900, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.09);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  playTransitionRiser() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Cinematic sub-bass rumble + pitch riser
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 1.6);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 1.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    osc.start(now);
    osc.stop(now + 1.8);

    // Filtered swoosh
    const bufferSize = Math.floor(this.ctx.sampleRate * 1.5);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(250, now);
    filter.frequency.exponentialRampToValueAtTime(4500, now + 1.4);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.01, now);
    noiseGain.gain.linearRampToValueAtTime(0.25, now + 1.3);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.7);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + 1.7);
  }

  playRoar() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Layer 1: Low monster rumble
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.9);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.8;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(350, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + 0.8);
    filter.Q.value = 4.0;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.45, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + 0.8);

    // Layer 2: T-Rex tonal scream
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.35);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  playShatter() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.8);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.7);
    filter.Q.value = 3.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + 0.7);

    // Deep sub bass boom
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(80, now);
    subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.8);
    subGain.gain.setValueAtTime(0.5, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    subOsc.start(now);
    subOsc.stop(now + 0.8);
  }

  playWhoosh() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.28);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  // --- Dynamic High-Energy Techno Music Engine (Lyria RealTime + Procedural Fallback) ---

  startMusic() {
    this.init();
    if (this.musicPlaying) return;

    this.musicPlaying = true;
    this.musicBpm = 135; // Fast techno driving tempo!
    this.musicIntensity = 0.15;
    this.currentStep = 0;

    // If Lyria AI is connected, play live stream
    if (lyriaDJ.isConnected) {
      lyriaDJ.play();
      if (this.masterMusicGain) {
        this.masterMusicGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      }
    } else {
      if (this.masterMusicGain) {
        this.masterMusicGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterMusicGain.gain.setValueAtTime(0.28, this.ctx.currentTime);
      }
    }

    if (this.ctx) {
      this.nextNoteTime = this.ctx.currentTime + 0.05;
      this.scheduler();
    }
  }

  updateMusic(speedFactor = 1.0, intensity = 0.0, phase = 0) {
    // 135 BPM to 156 BPM peak-time hard techno
    this.musicBpm = Math.min(156, 134 + (speedFactor - 1.0) * 32);
    this.musicIntensity = Math.max(0, Math.min(1.0, intensity));

    // Dynamic steering with Google DeepMind Lyria RealTime model
    if (lyriaDJ.isConnected) {
      lyriaDJ.steerPhase(phase, this.musicBpm, this.musicIntensity);
    }
  }

  scheduler() {
    if (!this.musicPlaying || !this.ctx) return;

    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.scheduleStep(this.currentStep, this.nextNoteTime);
      const secondsPerBeat = 60.0 / this.musicBpm;
      const stepDuration = secondsPerBeat / 4;
      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % 16;
    }

    this.musicTimer = setTimeout(() => this.scheduler(), 20);
  }

  scheduleStep(step, time) {
    if (!this.ctx || !this.masterMusicGain) return;

    // 1. Relentless 4-on-the-floor heavy 909 kick
    if (step % 4 === 0) {
      this.triggerKick(time);
    }

    // 2. Crisp, explosive industrial snare / clap on backbeats 4 and 12
    if (step === 4 || step === 12) {
      this.triggerSnare(time);
    }

    // 3. Sizzling offbeat hi-hat on every step 2, 6, 10, 14 + 16th rolling hats
    const isOffbeat = step % 4 === 2;
    if (isOffbeat || (this.musicIntensity > 0.35 && step % 2 === 1)) {
      this.triggerHat(time, isOffbeat);
    }

    // 4. Rolling Acid 303 Techno Bassline (16th-note relentless drive)
    // Driving in F minor / D minor: pumping on the 16ths
    const bassNotes = [65.41, 73.42, 65.41, 73.42, 87.31, 73.42, 65.41, 98.0];
    const freq = bassNotes[step % bassNotes.length];
    this.triggerBass(freq, time, step);

    // 5. Aggressive Rave Synth Stabs on offbeat syncopations (steps 3, 7, 11, 14)
    if ((step === 3 || step === 7 || step === 11 || step === 14) && this.musicIntensity > 0.25) {
      this.triggerRaveStab(time, step);
    }
  }

  triggerKick(time) {
    // Punchy 909 Kick: fast pitch drop + sub rumble
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.masterMusicGain);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.08);

    gain.gain.setValueAtTime(0.85, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    osc.start(time);
    osc.stop(time + 0.16);

    // Transient click for extra punch
    const click = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    click.connect(clickGain);
    clickGain.connect(this.masterMusicGain);
    click.type = 'triangle';
    click.frequency.setValueAtTime(320, time);
    click.frequency.exponentialRampToValueAtTime(60, time + 0.02);
    clickGain.gain.setValueAtTime(0.3, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    click.start(time);
    click.stop(time + 0.02);
  }

  triggerSnare(time) {
    // Noise snap
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.14);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, time);
    filter.Q.value = 1.8;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterMusicGain);

    noise.start(time);
    noise.stop(time + 0.14);
  }

  triggerHat(time, accent = false) {
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.04);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8000, time);

    const gain = this.ctx.createGain();
    const vol = (accent ? 0.22 : 0.1) * (0.8 + this.musicIntensity * 0.4);
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + (accent ? 0.06 : 0.03));

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterMusicGain);

    noise.start(time);
    noise.stop(time + 0.06);
  }

  triggerBass(freq, time, step) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterMusicGain);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    // Acid 303 resonant filter sweep
    const baseCutoff = 450 + this.musicIntensity * 1600;
    const peakCutoff = baseCutoff * (step % 4 === 1 ? 2.8 : 1.6);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(peakCutoff, time);
    filter.frequency.exponentialRampToValueAtTime(baseCutoff, time + 0.09);
    filter.Q.value = 6.0; // Resonant acid squelch

    const noteDuration = 0.1;
    gain.gain.setValueAtTime(0.42, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + noteDuration);

    osc.start(time);
    osc.stop(time + noteDuration);
  }

  triggerRaveStab(time, step) {
    // Classic 90s warehouse rave synth chord stab
    const freqs = [220, 261.63, 329.63, 392.0]; // A minor 7 rave chord
    freqs.forEach((f) => {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterMusicGain);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * 1.5, time);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2200 + (step % 2) * 800, time);
      filter.Q.value = 3.0;

      const dur = 0.12;
      gain.gain.setValueAtTime(0.12 * this.musicIntensity, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      osc.start(time);
      osc.stop(time + dur);
    });
  }

  stopMusic(slowdown = true) {
    if (lyriaDJ.isConnected) {
      lyriaDJ.stop();
    }

    if (!this.musicPlaying) return;
    this.musicPlaying = false;
    clearTimeout(this.musicTimer);

    if (this.ctx && this.masterMusicGain) {
      const now = this.ctx.currentTime;
      if (slowdown) {
        this.masterMusicGain.gain.setValueAtTime(this.masterMusicGain.gain.value, now);
        this.masterMusicGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      } else {
        this.masterMusicGain.gain.setValueAtTime(0, now);
      }
    }
  }
}

export const sounds = new SoundEffects();
