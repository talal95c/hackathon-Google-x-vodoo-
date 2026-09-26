import * as THREE from 'three';
import confetti from 'canvas-confetti';
import { sounds, lyriaDJ } from './audio.js';
import { Dino2DGame } from './dino2d.js';
import { ShatterEffect } from './shatterEffect.js';
import { Dino3DGame } from './dino3d.js';

// Game States
const STATE = {
  INTRO_2D: 'INTRO_2D',
  PLAYING_2D: 'PLAYING_2D',
  SHATTERING: 'SHATTERING',
  PLAYING_3D: 'PLAYING_3D',
  GAMEOVER: 'GAMEOVER',
};

class GameDirector {
  constructor() {
    this.state = STATE.INTRO_2D;
    this.score2D = 0;
    this.score3D = 0;
    this.highScore = parseInt(localStorage.getItem('dino_high_score') || '0', 10);

    this.container = document.getElementById('chrome-page-container');
    this.canvas2DWrapper = document.getElementById('canvas-2d-wrapper');
    this.canvas2D = document.getElementById('canvas-2d');
    this.canvas3D = document.getElementById('canvas-3d');
    this.chromeOfflineText = document.getElementById('chrome-offline-text');
    this.ui3DHud = document.getElementById('ui-3d-hud');
    this.touchControls = document.getElementById('touch-controls');
    this.scoreDisplay = document.getElementById('score-display');
    this.speedDisplay = document.getElementById('speed-display');
    this.hudBadge = document.getElementById('hud-badge');
    this.phasePopup = document.getElementById('phase-popup');
    this.phasePopupTitle = document.getElementById('phase-popup-title');
    this.phasePopupName = document.getElementById('phase-popup-name');
    this.modalGameOver = document.getElementById('modal-gameover');

    // Lyria UI Elements
    this.btnLyriaToggle = document.getElementById('btn-lyria-toggle');
    this.lyriaBtnLabel = document.getElementById('lyria-btn-label');
    this.lyriaHudBadge = document.getElementById('lyria-hud-badge');
    this.modalLyria = document.getElementById('modal-lyria');
    this.inputGeminiKey = document.getElementById('input-gemini-key');
    this.btnConnectLyria = document.getElementById('btn-connect-lyria');
    this.btnCloseLyria = document.getElementById('btn-close-lyria');
    this.lyriaStatusBox = document.getElementById('lyria-status-box');

    this.initThree();
    this.init2D();
    this.initControls();
    this.initUI();

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  initThree() {
    // 3D Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf7f7f7);
    this.scene.fog = new THREE.FogExp2(0xf7f7f7, 0.012);

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 400);
    this.camera.position.set(0, 0, 16);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas3D,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(20, 35, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 100;
    const d = 25;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    this.scene.add(dirLight);

    // Initialize Shatter Effect & 3D Runner
    this.shatter = new ShatterEffect(this.scene, this.camera);
    this.dino3D = new Dino3DGame(
      this.scene,
      this.camera,
      (finalScore3D) => this.handle3DDeath(finalScore3D),
      (phase, name) => this.handlePhaseChange(phase, name)
    );
    this.dino3D.hide();

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  init2D() {
    this.dino2D = new Dino2DGame(this.canvas2D, (score, canvas) => {
      this.handle2DDeath(score, canvas);
    });
  }

  initControls() {
    // Keyboard handlers
    window.addEventListener('keydown', (e) => {
      sounds.init(); // Unlock AudioContext on first user action

      if (e.code === 'Space' || e.key === ' ' || e.code === 'ArrowUp') {
        e.preventDefault();
        this.handleActionJump();
      } else if (e.code === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this.handleActionDuck(true);
      } else if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        this.handleActionLeft();
      } else if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        this.handleActionRight();
      } else if (e.key === 'b' || e.key === 'B') {
        // Developer shortcut to explode screen immediately!
        if (this.state === STATE.PLAYING_2D || this.state === STATE.INTRO_2D) {
          this.dino2D.die();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        this.handleActionDuck(false);
      }
    });

    // Touch & button listeners for on-screen controls
    document.getElementById('btn-jump')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sounds.init();
      this.handleActionJump();
    });

    const btnDuck = document.getElementById('btn-duck');
    if (btnDuck) {
      btnDuck.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sounds.init();
        this.handleActionDuck(true);
      });
      btnDuck.addEventListener('pointerup', () => this.handleActionDuck(false));
      btnDuck.addEventListener('pointerleave', () => this.handleActionDuck(false));
    }

    document.getElementById('btn-left')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sounds.init();
      this.handleActionLeft();
    });

    document.getElementById('btn-right')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sounds.init();
      this.handleActionRight();
    });

    // Instant Shatter Test button
    document.getElementById('btn-instant-shatter')?.addEventListener('click', () => {
      sounds.init();
      if (this.state === STATE.PLAYING_2D || this.state === STATE.INTRO_2D) {
        this.dino2D.die();
      }
    });

    // Restart button in game over modal
    document.getElementById('btn-restart')?.addEventListener('click', () => {
      this.restartGame();
    });
  }

  handleActionJump() {
    if (this.state === STATE.INTRO_2D) {
      this.state = STATE.PLAYING_2D;
      this.chromeOfflineText?.classList.add('faded');
      this.dino2D.jump();
    } else if (this.state === STATE.PLAYING_2D) {
      this.dino2D.jump();
    } else if (this.state === STATE.PLAYING_3D) {
      this.dino3D.jump();
    } else if (this.state === STATE.GAMEOVER) {
      this.restartGame();
    }
  }

  handleActionDuck(isDown) {
    if (this.state === STATE.PLAYING_2D) {
      this.dino2D.setDucking(isDown);
    } else if (this.state === STATE.PLAYING_3D) {
      this.dino3D.setDucking(isDown);
    }
  }

  handleActionLeft() {
    if (this.state === STATE.PLAYING_3D) {
      this.dino3D.moveLeft();
    }
  }

  handleActionRight() {
    if (this.state === STATE.PLAYING_3D) {
      this.dino3D.moveRight();
    }
  }

  handle2DDeath(score, canvas) {
    this.score2D = score;

    // Fake normal Game Over pause: let player think it's over for ~400ms!
    setTimeout(() => {
      // Crack sound & initial screen jerk
      sounds.playCrack();
      this.triggerScreenFlash();

      setTimeout(() => {
        this.state = STATE.SHATTERING;
        this.transitionTime = 0;
        this.transitionDuration = 2.1;
        this.hasPlayedRoar = false;

        // Camera initial position facing the 2D plane
        this.camera.position.set(0, 2.2, 16);
        this.camera.rotation.set(0, 0, 0);
        this.camera.lookAt(0, 2.0, 0);

        // Hide Chrome 2D page container
        this.container.style.display = 'none';

        // Prepare 3D Dino in profile and position track
        this.dino3D.prepareTransition();

        // Start 3D Shatter Explosion & Audio Riser!
        sounds.playTransitionRiser();
        this.shatter.shatterCanvas(canvas, () => {
          // Handled smoothly by transition timer
        });
      }, 120);
    }, 380);
  }

  triggerScreenFlash() {
    const flash = document.getElementById('flash-overlay');
    if (!flash) return;
    flash.style.opacity = '0.9';
    setTimeout(() => {
      flash.style.opacity = '0';
    }, 120);
  }

  launch3DGame() {
    this.state = STATE.PLAYING_3D;
    this.ui3DHud?.classList.remove('hidden');
    this.touchControls?.classList.remove('hidden');

    // Reset camera elevated over-the-shoulder behind the Dino
    this.camera.position.set(0, 7.0, 9.2);
    this.camera.lookAt(0, 1.8, -12);

    // Cyber AI Voice Announcer on 3D breach
    sounds.speak('DIMENSION THREE-D INITIATED. RUN.', { pitch: 0.8, rate: 1.2 });
  }

  handle3DDeath(finalScore3D) {
    this.score3D = finalScore3D;
    const totalScore = this.score2D + this.score3D;

    // Cyber Voice Announcer on failure
    sounds.speak('SYSTEM FAILURE. SESSION TERMINATED.', { pitch: 0.65, rate: 1.15 });

    if (totalScore > this.highScore) {
      this.highScore = totalScore;
      localStorage.setItem('dino_high_score', String(this.highScore));
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    }

    this.state = STATE.GAMEOVER;
    this.updateHUD();

    // Show Game Over Modal
    document.getElementById('stat-score-2d').textContent = this.score2D;
    document.getElementById('stat-score-3d').textContent = this.score3D;
    document.getElementById('stat-total-score').textContent = totalScore;
    document.getElementById('stat-high-score').textContent = this.highScore;
    this.modalGameOver.classList.remove('hidden');
  }

  handlePhaseChange(phase, name) {
    if (!this.hudBadge) return;
    this.hudBadge.textContent = `PHASE ${phase + 1} : ${name}`;

    if (phase > 0 && this.phasePopup) {
      if (this.phasePopupTitle) this.phasePopupTitle.textContent = `⚡ PHASE ${phase + 1} ACTIVATED ⚡`;
      if (this.phasePopupName) this.phasePopupName.textContent = name;

      this.phasePopup.classList.remove('hidden');
      this.phasePopup.style.animation = 'none';
      void this.phasePopup.offsetHeight; // trigger reflow
      this.phasePopup.style.animation = 'phasePop 2.2s cubic-bezier(0.16, 1, 0.3, 1) forwards';

      // Cybernetic AI Vocal Announcements per phase
      const vocalLines = [
        'DIMENSION ACTIVATED.',
        'PHASE TWO. NEON EMERGENCE.',
        'SYNTHWAVE OVERDRIVE ENGAGED.',
        'HYPER SPEED. MAXIMUM VELOCITY.',
        'WARNING. CRITICAL OVERLOAD.',
      ];
      const vocalLine = vocalLines[phase] || `PHASE ${phase + 1}.`;
      sounds.speak(vocalLine, { pitch: 0.85 - phase * 0.05, rate: 1.25 });
    }
  }

  restartGame() {
    this.modalGameOver.classList.add('hidden');
    this.ui3DHud?.classList.add('hidden');
    this.touchControls?.classList.add('hidden');
    this.phasePopup?.classList.add('hidden');
    this.dino3D.hide();
    this.dino2D.reset();

    // Reset scene background to clean Chrome white
    this.scene.background = new THREE.Color(0xf7f7f7);
    if (this.scene.fog) {
      this.scene.fog.color = new THREE.Color(0xf7f7f7);
      this.scene.fog.density = 0.012;
    }

    this.chromeOfflineText?.classList.remove('faded');
    this.container.style.display = 'flex';

    // Reset camera to 2D view
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 0, 16);
    this.camera.rotation.set(0, 0, 0);
    this.camera.lookAt(0, 0, 0);

    this.state = STATE.INTRO_2D;
  }

  initUI() {
    // Populate saved key if any
    if (this.inputGeminiKey) {
      this.inputGeminiKey.value = lyriaDJ.apiKey || '';
    }

    // Lyria status callback
    lyriaDJ.onStatusChange((status, message) => {
      if (this.lyriaStatusBox) {
        this.lyriaStatusBox.textContent = message;
      }

      if (status === 'CONNECTED' || status === 'PLAYING') {
        if (this.lyriaBtnLabel) this.lyriaBtnLabel.textContent = 'Lyria DJ : ACTIF 🎶';
        this.btnLyriaToggle?.classList.add('active');
        this.lyriaHudBadge?.classList.remove('hidden');
      } else if (status === 'CONNECTING' || status === 'STEERING') {
        if (this.lyriaBtnLabel) this.lyriaBtnLabel.textContent = 'Lyria : Sync...';
      } else {
        if (this.lyriaBtnLabel) this.lyriaBtnLabel.textContent = 'DeepMind Lyria DJ : OFF';
        this.btnLyriaToggle?.classList.remove('active');
        this.lyriaHudBadge?.classList.add('hidden');
      }
    });

    // Lyria modal trigger
    this.btnLyriaToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.modalLyria?.classList.remove('hidden');
    });

    this.btnCloseLyria?.addEventListener('click', () => {
      this.modalLyria?.classList.add('hidden');
    });

    this.btnConnectLyria?.addEventListener('click', async () => {
      sounds.init();
      const key = this.inputGeminiKey?.value?.trim() || '';
      lyriaDJ.setApiKey(key);

      if (!key) {
        if (this.lyriaStatusBox) {
          this.lyriaStatusBox.textContent = 'Mode Synthwave procédural actif (aucune clé fournie).';
        }
        return;
      }

      this.btnConnectLyria.disabled = true;
      this.btnConnectLyria.textContent = 'CONNEXION EN COURS...';

      const ok = await lyriaDJ.connect();
      this.btnConnectLyria.disabled = false;
      this.btnConnectLyria.textContent = ok ? 'CONNECTÉ AVEC SUCCÈS' : 'RÉESSAYER LA CONNEXION';

      if (ok) {
        setTimeout(() => {
          this.modalLyria?.classList.add('hidden');
        }, 1200);
      }
    });

    // Auto-connect if API key already stored
    if (lyriaDJ.hasApiKey()) {
      lyriaDJ.connect().catch(() => {});
    }
  }

  updateHUD() {}

  loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    if (this.state === STATE.PLAYING_2D) {
      this.dino2D.update(dt);
      this.dino2D.render();
      this.scoreDisplay.textContent = `SCORE 2D : ${this.dino2D.score}`;
    } else if (this.state === STATE.INTRO_2D) {
      this.dino2D.render();
      this.scoreDisplay.textContent = `SCORE : 0`;
    } else if (this.state === STATE.SHATTERING) {
      this.shatter.update(dt);
      this.transitionTime += dt;
      const progress = Math.min(1.0, this.transitionTime / this.transitionDuration);

      // Smooth cubic ease-in-out
      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      // Animate Dino waking up and pivoting in 3D
      this.dino3D.updateTransition(progress);

      // Play roar sound effect right as Dino aligns forward
      if (progress >= 0.72 && !this.hasPlayedRoar) {
        this.hasPlayedRoar = true;
        sounds.playRoar();
      }

      // Camera shake at initial explosion
      let shakeX = 0;
      let shakeY = 0;
      if (progress < 0.22) {
        const shakeIntensity = (1 - progress / 0.22) * 0.45;
        shakeX = (Math.random() - 0.5) * shakeIntensity;
        shakeY = (Math.random() - 0.5) * shakeIntensity;
      }

      // 4-point Bézier curve for cinematic camera orbit
      // P0: Front view (0, 2.2, 16)
      // P1: Side swoop (-5.5, 4.2, 14.5)
      // P2: Behind shoulder (-2.2, 5.8, 11.2)
      // P3: Final Elevated Behind-the-Back chase position (0, 7.0, 9.2)
      const p0 = new THREE.Vector3(0, 2.2, 16);
      const p1 = new THREE.Vector3(-5.5, 4.2, 14.5);
      const p2 = new THREE.Vector3(-2.2, 5.8, 11.2);
      const p3 = new THREE.Vector3(0, 7.0, 9.2);

      const t = ease;
      const it = 1 - t;
      const camPos = new THREE.Vector3()
        .addScaledVector(p0, it * it * it)
        .addScaledVector(p1, 3 * it * it * t)
        .addScaledVector(p2, 3 * it * t * t)
        .addScaledVector(p3, t * t * t);

      camPos.x += shakeX;
      camPos.y += shakeY;
      this.camera.position.copy(camPos);

      // Smooth target lookAt point
      const l0 = new THREE.Vector3(0, 2.0, 0);
      const l3 = new THREE.Vector3(0, 1.8, -12);
      const currentLookAt = new THREE.Vector3().lerpVectors(l0, l3, ease);
      this.camera.lookAt(currentLookAt);

      this.renderer.render(this.scene, this.camera);

      // Transition complete -> Launch 3D Runner!
      if (progress >= 1.0) {
        this.dino3D.start(this.score2D);
        this.launch3DGame();
      }
    } else if (this.state === STATE.PLAYING_3D || this.state === STATE.GAMEOVER) {
      this.dino3D.update(dt);
      this.renderer.render(this.scene, this.camera);
      if (this.state === STATE.PLAYING_3D) {
        const total = this.score2D + this.dino3D.score;
        this.scoreDisplay.textContent = `SCORE : ${total}`;
        if (this.speedDisplay) {
          const mult = (this.dino3D.speed / this.dino3D.minSpeed).toFixed(1);
          this.speedDisplay.textContent = `⚡ ${mult}x`;
        }

        // Adaptive HUD styling when colors awaken
        const hudTop = document.querySelector('.hud-top');
        if (hudTop && this.dino3D.colorProgress > 0.3) {
          const cp = Math.min(1.0, this.dino3D.colorProgress / 2.5);
          hudTop.style.background = `rgba(16, 12, 28, ${0.7 + cp * 0.25})`;
          hudTop.style.borderColor = `rgba(0, 240, 255, ${0.2 + cp * 0.4})`;
          this.scoreDisplay.style.color = '#ffffff';
          this.scoreDisplay.style.textShadow = `0 0 10px rgba(0, 240, 255, ${cp})`;
        } else if (hudTop) {
          hudTop.style.background = 'rgba(255, 255, 255, 0.9)';
          hudTop.style.borderColor = 'rgba(0, 0, 0, 0.08)';
          this.scoreDisplay.style.color = '#222222';
          this.scoreDisplay.style.textShadow = 'none';
        }
      }
    }

    requestAnimationFrame((t) => this.loop(t));
  }
}

// Start game director on load
window.addEventListener('DOMContentLoaded', () => {
  new GameDirector();
});
