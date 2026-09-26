import { GoogleGenAI } from '@google/genai';

/**
 * Definition of prompt signatures and acoustic profiles per game phase.
 * PURE HIGH-OCTANE TECHNO & HARD TECHNO WITH VOCALS & LYRICS.
 */
export const LYRIA_PHASE_PROFILES = [
  {
    phase: 0,
    name: 'Industrial Vocal Techno',
    text: 'Driving warehouse techno featuring rhythmic robotic vocals with spoken lyrics repeating "Run through the system, never look back", heavy 909 kick drum, dark rolling sub bassline, energetic vocal techno groove',
    baseBpm: 134,
    density: 0.78,
    brightness: 0.7,
  },
  {
    phase: 1,
    name: 'Acid Techno with Vocals',
    text: 'Peak-time acid techno with catchy vocoder vocal hook chanting lyrics "Faster, harder, push the limits, run into the neon", screaming 303 acid bassline, relentless punchy kick, female rave vocal phrases',
    baseBpm: 140,
    density: 0.86,
    brightness: 0.8,
  },
  {
    phase: 2,
    name: 'Hard Techno & Cyber Vocals',
    text: 'Hard techno rave with energetic fast robotic spoken vocal lyrics and chopped vocal hooks singing "Overdrive, break the grid, ignite the fire", pounding heavy festival kick drum, explosive vocal drop',
    baseBpm: 145,
    density: 0.92,
    brightness: 0.88,
  },
  {
    phase: 3,
    name: 'Psytrance & Anthemic Vocals',
    text: 'Hard techno and psytrance with anthemic female vocal hook and lyrics "We are limitless, take control, escape the void", high-speed rolling bassline, intense rave synth stabs, dramatic vocal buildup',
    baseBpm: 150,
    density: 0.96,
    brightness: 0.94,
  },
  {
    phase: 4,
    name: 'Maximum Overdrive Vocal Rave',
    text: 'Maximum overdrive ultra hard techno rave with intense distorted vocal chants repeating lyrics "System overload, maximum velocity, never stop", massive distorted kick drum, apocalyptic rave climax',
    baseBpm: 156,
    density: 1.0,
    brightness: 1.0,
  },
];

/**
 * Google DeepMind Lyria RealTime Music Manager
 * Connects via WebSocket to 'models/lyria-realtime-exp'
 * Smoothly morphs music using Weighted Prompt Cross-Fading in real-time.
 */
export class LyriaLiveDJ {
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
    this.session = null;
    this.client = null;
    this.isConnected = false;
    this.isPlaying = false;
    this.currentPhase = 0;
    this.currentBpm = 118;
    this.statusListeners = [];

    // Audio streaming timeline
    this.nextChunkPlayTime = 0;
    this.activeSources = [];
    this.musicGain = null;

    // Cross-fading transition state
    this.transitionTimer = null;
    this.isTransitioning = false;
    this.lastConfigUpdateTime = 0;

    // Load saved API key if present
    this.apiKey = localStorage.getItem('gemini_api_key') || (import.meta.env ? import.meta.env.VITE_GEMINI_API_KEY : '') || '';
  }

  setAudioContext(ctx) {
    this.audioCtx = ctx;
    if (this.audioCtx && !this.musicGain) {
      this.musicGain = this.audioCtx.createGain();
      this.musicGain.gain.setValueAtTime(0.35, this.audioCtx.currentTime);
      this.musicGain.connect(this.audioCtx.destination);
    }
  }

  onStatusChange(fn) {
    this.statusListeners.push(fn);
  }

  notifyStatus(status, message = '') {
    for (const fn of this.statusListeners) {
      fn(status, message);
    }
  }

  setApiKey(key) {
    this.apiKey = (key || '').trim();
    if (this.apiKey) {
      localStorage.setItem('gemini_api_key', this.apiKey);
    } else {
      localStorage.removeItem('gemini_api_key');
    }
  }

  hasApiKey() {
    return Boolean(this.apiKey && this.apiKey.length > 10);
  }

  async connect() {
    if (!this.hasApiKey()) {
      this.notifyStatus('NO_KEY', 'Clé API Gemini requise pour Lyria');
      return false;
    }

    try {
      this.notifyStatus('CONNECTING', 'Connexion à DeepMind Lyria RealTime...');

      this.client = new GoogleGenAI({
        apiKey: this.apiKey,
        apiVersion: 'v1beta',
      });

      this.session = await this.client.live.music.connect({
        model: 'models/lyria-realtime-exp',
        callbacks: {
          onmessage: (msg) => this.handleMessage(msg),
          onerror: (err) => {
            console.warn('[Lyria RealTime] Erreur de stream:', err);
            this.notifyStatus('ERROR', 'Erreur de flux Lyria');
          },
          onclose: () => {
            console.log('[Lyria RealTime] Session fermée.');
            this.isConnected = false;
            this.isPlaying = false;
            this.notifyStatus('DISCONNECTED', 'Lyria déconnecté');
          },
        },
      });

      this.isConnected = true;
      this.notifyStatus('CONNECTED', 'Lyria Live DJ prêt');

      // Initialize with Phase 0 profile
      const p0 = LYRIA_PHASE_PROFILES[0];
      await this.session.setWeightedPrompts({
        weightedPrompts: [{ text: p0.text, weight: 1.0 }],
      });
      await this.session.setMusicGenerationConfig({
        musicGenerationConfig: {
          bpm: p0.baseBpm,
          density: p0.density,
          brightness: p0.brightness,
          guidance: 4.0,
        },
      });

      return true;
    } catch (err) {
      console.warn('[Lyria RealTime] Impossible de se connecter:', err);
      this.isConnected = false;
      this.notifyStatus('ERROR', err.message || 'Échec de connexion Lyria');
      return false;
    }
  }

  handleMessage(message) {
    if (!this.audioCtx || !this.isPlaying) return;

    const audioChunks = message.serverContent?.audioChunks;
    if (audioChunks && audioChunks.length > 0) {
      for (const chunk of audioChunks) {
        if (chunk.data) {
          this.enqueueChunk(chunk.data);
        }
      }
    }
  }

  enqueueChunk(base64Data) {
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const int16 = new Int16Array(bytes.buffer);
      const numFrames = Math.floor(int16.length / 2);
      if (numFrames <= 0) return;

      const sampleRate = 48000;
      const audioBuffer = this.audioCtx.createBuffer(2, numFrames, sampleRate);
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.getChannelData(1);

      for (let i = 0; i < numFrames; i++) {
        left[i] = int16[i * 2] / 32768.0;
        right[i] = int16[i * 2 + 1] / 32768.0;
      }

      const now = this.audioCtx.currentTime;
      if (this.nextChunkPlayTime < now) {
        this.nextChunkPlayTime = now + 0.05;
      }

      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.musicGain);
      source.start(this.nextChunkPlayTime);
      this.nextChunkPlayTime += audioBuffer.duration;

      this.activeSources.push(source);
      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) this.activeSources.splice(idx, 1);
      };
    } catch (e) {
      console.warn('[Lyria Live] Erreur décodage audio chunk:', e);
    }
  }

  /**
   * Smooth Weighted Cross-Fading between Phase Styles.
   * Rather than an abrupt cut, this morphs prompt weights over several seconds,
   * allowing Lyria's AI to seamlessly blend instruments, rhythms, and harmony.
   */
  async steerPhase(targetPhase, targetBpm, targetDensity) {
    if (!this.session || !this.isConnected) return;

    // Constrain phase
    targetPhase = Math.max(0, Math.min(LYRIA_PHASE_PROFILES.length - 1, targetPhase));

    // If phase has not changed, only throttle-update continuous config (bpm / density)
    if (targetPhase === this.currentPhase) {
      const now = Date.now();
      if (now - this.lastConfigUpdateTime > 2000 && !this.isTransitioning) {
        this.lastConfigUpdateTime = now;
        try {
          const profile = LYRIA_PHASE_PROFILES[targetPhase];
          await this.session.setMusicGenerationConfig({
            musicGenerationConfig: {
              bpm: Math.round(targetBpm),
              density: Math.min(1.0, Math.max(0.1, targetDensity)),
              brightness: profile.brightness,
              guidance: 4.0,
            },
          });
        } catch (e) {}
      }
      return;
    }

    // Cancel any ongoing transition
    if (this.transitionTimer) {
      clearInterval(this.transitionTimer);
      this.transitionTimer = null;
    }

    const oldPhase = this.currentPhase;
    this.currentPhase = targetPhase;
    this.isTransitioning = true;

    const oldProfile = LYRIA_PHASE_PROFILES[oldPhase];
    const newProfile = LYRIA_PHASE_PROFILES[targetPhase];

    this.notifyStatus('STEERING', `Lyria DJ : Transition live vers ${newProfile.name}... 🎚️`);

    // Cross-fade parameters: 6 steps spaced 600ms apart (total 3.6 seconds morphing)
    const totalSteps = 6;
    let step = 0;

    const runStep = async () => {
      step++;
      const progress = step / totalSteps; // 0.16 -> 1.0

      if (progress >= 1.0) {
        // Final step: 100% new profile
        clearInterval(this.transitionTimer);
        this.transitionTimer = null;
        this.isTransitioning = false;

        try {
          await this.session.setWeightedPrompts({
            weightedPrompts: [{ text: newProfile.text, weight: 1.0 }],
          });
          await this.session.setMusicGenerationConfig({
            musicGenerationConfig: {
              bpm: Math.round(targetBpm || newProfile.baseBpm),
              density: Math.min(1.0, Math.max(0.1, targetDensity || newProfile.density)),
              brightness: newProfile.brightness,
              guidance: 4.0,
            },
          });
          this.notifyStatus('PLAYING', `Lyria DJ : ${newProfile.name} 🎶`);
        } catch (err) {
          console.warn('[Lyria RealTime] Erreur fin cross-fade:', err);
        }
        return;
      }

      // Intermediate step: Blend prompt weights smoothly
      const oldWeight = +(1.0 - progress).toFixed(2);
      const newWeight = +progress.toFixed(2);
      const currentBpm = Math.round(oldProfile.baseBpm + (newProfile.baseBpm - oldProfile.baseBpm) * progress);
      const currentDensity = +(oldProfile.density + (newProfile.density - oldProfile.density) * progress).toFixed(2);
      const currentBrightness = +(oldProfile.brightness + (newProfile.brightness - oldProfile.brightness) * progress).toFixed(2);

      try {
        await this.session.setWeightedPrompts({
          weightedPrompts: [
            { text: oldProfile.text, weight: Math.max(0.05, oldWeight) },
            { text: newProfile.text, weight: Math.max(0.05, newWeight) },
          ],
        });

        await this.session.setMusicGenerationConfig({
          musicGenerationConfig: {
            bpm: currentBpm,
            density: currentDensity,
            brightness: currentBrightness,
            guidance: 4.0,
          },
        });
      } catch (err) {
        console.warn('[Lyria RealTime] Erreur step cross-fade:', err);
      }
    };

    // Execute first blend step immediately, then schedule remaining steps
    await runStep();
    this.transitionTimer = setInterval(runStep, 600);
  }

  async play() {
    if (!this.session || !this.isConnected) return;
    this.isPlaying = true;
    this.nextChunkPlayTime = this.audioCtx ? this.audioCtx.currentTime + 0.05 : 0;
    try {
      this.session.play();
      this.notifyStatus('PLAYING', 'Lyria en direct 🎶');
    } catch (err) {
      console.warn('[Lyria RealTime] Erreur play:', err);
    }
  }

  stop() {
    this.isPlaying = false;
    if (this.transitionTimer) {
      clearInterval(this.transitionTimer);
      this.transitionTimer = null;
    }
    this.isTransitioning = false;

    for (const src of this.activeSources) {
      try {
        src.stop();
      } catch (e) {}
    }
    this.activeSources = [];
    this.nextChunkPlayTime = 0;

    if (this.session && this.isConnected) {
      try {
        this.session.stop();
        this.notifyStatus('STOPPED', 'Lyria en pause');
      } catch (err) {
        console.warn('[Lyria RealTime] Erreur stop:', err);
      }
    }
  }
}
