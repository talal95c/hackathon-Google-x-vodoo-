import { GoogleGenAI } from '@google/genai';

/**
 * Google DeepMind Lyria RealTime Music Manager
 * Connects via WebSocket to 'models/lyria-realtime-exp'
 * Decodes 48kHz / 44.1kHz 16-bit PCM stereo chunks and plays them gaplessly via Web Audio API.
 */
export class LyriaLiveDJ {
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
    this.session = null;
    this.client = null;
    this.isConnected = false;
    this.isPlaying = false;
    this.currentPhase = -1;
    this.currentBpm = 118;
    this.statusListeners = [];

    // Audio streaming timeline
    this.nextChunkPlayTime = 0;
    this.activeSources = [];
    this.musicGain = null;

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

      // Set initial Phase 0 sound profile
      await this.steerPhase(0, 118, 0.35);
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
      // Decode base64 to binary
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert 16-bit PCM stereo (48000 Hz default)
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

      // Gapless audio scheduling
      const now = this.audioCtx.currentTime;
      if (this.nextChunkPlayTime < now) {
        // Buffer lead-time cushion to avoid clicks
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

  async steerPhase(phase, bpm = 120, density = 0.5) {
    if (!this.session || !this.isConnected) return;
    this.currentPhase = phase;
    this.currentBpm = bpm;

    let prompts = [];
    let brightness = 0.5;

    switch (phase) {
      case 0:
        prompts = [
          { text: 'Minimal electronic beat, 8-bit retro gaming rhythm, subtle kick drum, low-fi synth pulse', weight: 1.0 },
        ];
        brightness = 0.35;
        break;

      case 1:
        prompts = [
          { text: 'Melodic neon synthwave, 80s analog synthesizers, punchy electronic drums, smooth bassline', weight: 1.0 },
          { text: 'Future retro arcade groove', weight: 0.5 },
        ];
        brightness = 0.55;
        break;

      case 2:
        prompts = [
          { text: 'Cyberpunk synthwave, aggressive analog synth leads, energetic arpeggios, heavy sidechain kick, retro future electro', weight: 1.0 },
          { text: 'French electro dance rhythm', weight: 0.6 },
        ];
        brightness = 0.72;
        break;

      case 3:
        prompts = [
          { text: 'High-octane drum and bass synthwave, rapid breakbeats, searing laser synths, maximum adrenaline video game score', weight: 1.0 },
          { text: 'Hyperpop rave energy', weight: 0.7 },
        ];
        brightness = 0.85;
        break;

      case 4:
      default:
        prompts = [
          { text: 'Ultra-fast hyper-speed cyber rave, explosive bass drops, frantic cosmic synth arpeggios, transcendent neon runner soundtrack', weight: 1.0 },
          { text: 'Eurobeat cyber drift', weight: 0.8 },
        ];
        brightness = 0.95;
        break;
    }

    try {
      this.notifyStatus('STEERING', `Lyria DJ : Phase ${phase + 1} (${bpm} BPM)`);

      await this.session.setWeightedPrompts({
        weightedPrompts: prompts,
      });

      await this.session.setMusicGenerationConfig({
        musicGenerationConfig: {
          bpm: Math.round(bpm),
          density: Math.min(1.0, Math.max(0.1, density)),
          brightness,
          guidance: 4.0,
        },
      });
    } catch (err) {
      console.warn('[Lyria RealTime] Erreur steerPhase:', err);
    }
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
    // Fade out and stop any buffered chunks
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
