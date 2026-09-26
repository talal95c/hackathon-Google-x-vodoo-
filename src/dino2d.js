import { sounds } from './audio.js';

export class Dino2DGame {
  constructor(canvas, onDeath) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.onDeath = onDeath;

    this.width = 900;
    this.height = 300;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.groundY = 240;
    this.gravity = 0.65;
    this.jumpForce = -13.5;
    this.speed = 7;
    this.minSpeed = 7;
    this.maxSpeed = 15;

    this.reset();
  }

  reset() {
    this.score = 0;
    this.distance = 0;
    this.speed = this.minSpeed;
    this.isDead = false;
    this.active = true;

    // Dino state
    this.dino = {
      x: 60,
      y: this.groundY - 50,
      width: 44,
      height: 48,
      vy: 0,
      isGrounded: true,
      isDucking: false,
      legAnimTimer: 0,
      legState: 0,
    };

    // Obstacles
    this.obstacles = [];
    this.nextObstacleDistance = 80;

    // Clouds
    this.clouds = [
      { x: 200, y: 50, speed: 0.5 },
      { x: 500, y: 70, speed: 0.7 },
      { x: 800, y: 40, speed: 0.6 },
    ];

    // Ground bumps
    this.groundPoints = [];
    for (let x = 0; x < this.width + 100; x += 15) {
      if (Math.random() < 0.25) {
        this.groundPoints.push({ x, w: 2 + Math.random() * 4, h: 2 });
      }
    }
  }

  jump() {
    if (!this.active || this.isDead) return;
    if (this.dino.isGrounded) {
      this.dino.vy = this.jumpForce;
      this.dino.isGrounded = false;
      sounds.playJump();
    }
  }

  setDucking(ducking) {
    if (!this.active || this.isDead) return;
    this.dino.isDucking = ducking;
    if (ducking && !this.dino.isGrounded) {
      this.dino.vy += 2.5; // Fast fall
    }
  }

  spawnObstacle() {
    const isPtero = this.score > 250 && Math.random() < 0.3;
    if (isPtero) {
      const altitudes = [this.groundY - 30, this.groundY - 55, this.groundY - 80];
      const y = altitudes[Math.floor(Math.random() * altitudes.length)];
      this.obstacles.push({
        type: 'ptero',
        x: this.width + 30,
        y: y,
        width: 42,
        height: 32,
        flapTimer: 0,
        flapState: 0,
      });
    } else {
      // Cactus
      const types = [
        { w: 20, h: 42, type: 'small' },
        { w: 32, h: 42, type: 'double-small' },
        { w: 26, h: 56, type: 'large' },
        { w: 45, h: 56, type: 'cluster' },
      ];
      const cactus = types[Math.floor(Math.random() * types.length)];
      this.obstacles.push({
        type: 'cactus',
        x: this.width + 30,
        y: this.groundY - cactus.h,
        width: cactus.w,
        height: cactus.h,
        subType: cactus.type,
      });
    }
  }

  update(deltaTime = 1) {
    if (!this.active || this.isDead) return;

    this.distance += this.speed;
    const oldScoreHundreds = Math.floor(this.score / 100);
    this.score = Math.floor(this.distance / 10);
    const newScoreHundreds = Math.floor(this.score / 100);
    if (newScoreHundreds > oldScoreHundreds && newScoreHundreds > 0) {
      sounds.playScore();
    }

    // Speed scaling
    this.speed = Math.min(this.maxSpeed, this.minSpeed + (this.score / 500) * 1.5);

    // Update Dino
    this.dino.vy += this.gravity;
    this.dino.y += this.dino.vy;

    const currentHeight = this.dino.isDucking ? 28 : 48;
    const currentWidth = this.dino.isDucking ? 56 : 44;
    this.dino.width = currentWidth;
    this.dino.height = currentHeight;

    if (this.dino.y >= this.groundY - currentHeight) {
      this.dino.y = this.groundY - currentHeight;
      this.dino.vy = 0;
      this.dino.isGrounded = true;
    }

    this.dino.legAnimTimer += this.speed * 0.05;
    if (this.dino.legAnimTimer > 1) {
      this.dino.legAnimTimer = 0;
      this.dino.legState = 1 - this.dino.legState;
    }

    // Clouds
    for (const cloud of this.clouds) {
      cloud.x -= cloud.speed;
      if (cloud.x < -60) {
        cloud.x = this.width + Math.random() * 80;
        cloud.y = 30 + Math.random() * 60;
      }
    }

    // Ground bumps
    for (const pt of this.groundPoints) {
      pt.x -= this.speed;
      if (pt.x < -10) {
        pt.x = this.width + Math.random() * 20;
      }
    }

    // Obstacles
    this.nextObstacleDistance -= this.speed;
    if (this.nextObstacleDistance <= 0) {
      this.spawnObstacle();
      const minGap = 160 + this.speed * 8;
      const maxGap = 320 + this.speed * 12;
      this.nextObstacleDistance = minGap + Math.random() * (maxGap - minGap);
    }

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.x -= this.speed;

      if (obs.type === 'ptero') {
        obs.flapTimer += 0.15;
        if (obs.flapTimer > 1) {
          obs.flapTimer = 0;
          obs.flapState = 1 - obs.flapState;
        }
      }

      // Hitbox check (shrink slightly for fair collisions)
      const padding = 6;
      const dBox = {
        l: this.dino.x + padding,
        r: this.dino.x + this.dino.width - padding,
        t: this.dino.y + padding,
        b: this.dino.y + this.dino.height,
      };
      const oBox = {
        l: obs.x + padding,
        r: obs.x + obs.width - padding,
        t: obs.y + padding,
        b: obs.y + obs.height,
      };

      if (dBox.r > oBox.l && dBox.l < oBox.r && dBox.b > oBox.t && dBox.t < oBox.b) {
        this.die();
        return;
      }

      if (obs.x < -80) {
        this.obstacles.splice(i, 1);
      }
    }
  }

  die() {
    this.isDead = true;
    sounds.playHit();
    // Render the dead frame with cross eyes
    this.render();
    if (this.onDeath) {
      this.onDeath(this.score, this.canvas);
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Background
    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(0, 0, this.width, this.height);

    // Clouds
    ctx.fillStyle = '#c5c5c5';
    for (const cloud of this.clouds) {
      this.drawCloud(ctx, cloud.x, cloud.y);
    }

    // Ground line
    ctx.strokeStyle = '#535353';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, this.groundY);
    ctx.lineTo(this.width, this.groundY);
    ctx.stroke();

    // Ground pebbles
    ctx.fillStyle = '#777777';
    for (const pt of this.groundPoints) {
      ctx.fillRect(pt.x, this.groundY + 3, pt.w, 2);
    }

    // Obstacles
    for (const obs of this.obstacles) {
      if (obs.type === 'cactus') {
        this.drawCactus(ctx, obs);
      } else {
        this.drawPtero(ctx, obs);
      }
    }

    // Dino
    this.drawDino(ctx);

    // Score HUD (only displayed once run has started)
    if (this.distance > 0 || this.isDead) {
      ctx.fillStyle = '#535353';
      ctx.font = "bold 16px 'Courier New', monospace";
      ctx.textAlign = 'right';
      const scoreStr = String(this.score).padStart(5, '0');
      const hiStr = String(Math.max(this.score, 0)).padStart(5, '0');
      ctx.fillText(`HI ${hiStr}  ${scoreStr}`, this.width - 25, 30);
    }

    // If dead, draw classic Chrome GAME OVER text and reload icon
    if (this.isDead) {
      this.drawGameOver(ctx);
    }
  }

  drawGameOver(ctx) {
    ctx.save();
    ctx.fillStyle = '#535353';
    ctx.font = "bold 20px 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.letterSpacing = '6px';
    ctx.fillText('G A M E   O V E R', this.width / 2, this.height / 2 - 20);

    // Circular reload arrow icon
    const cx = this.width / 2;
    const cy = this.height / 2 + 25;
    const r = 16;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#535353';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI * 0.2, Math.PI * 1.5, false);
    ctx.stroke();

    // Arrow head
    ctx.beginPath();
    ctx.moveTo(cx + r + 2, cy - 8);
    ctx.lineTo(cx + r - 8, cy);
    ctx.lineTo(cx + r + 6, cy + 6);
    ctx.closePath();
    ctx.fillStyle = '#535353';
    ctx.fill();

    ctx.restore();
  }

  drawCloud(ctx, x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.arc(x + 10, y - 5, 12, 0, Math.PI * 2);
    ctx.arc(x + 22, y, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  drawDino(ctx) {
    ctx.fillStyle = '#535353';
    const d = this.dino;

    if (d.isDucking && d.isGrounded) {
      // Ducking Dino
      ctx.fillRect(d.x, d.y + 12, 54, 16);
      ctx.fillRect(d.x + 36, d.y + 2, 18, 16); // Head lowered
      // Eye
      ctx.fillStyle = '#f7f7f7';
      ctx.fillRect(d.x + 46, d.y + 5, 3, 3);
      ctx.fillStyle = '#535353';

      // Duck legs
      if (d.legState === 0) {
        ctx.fillRect(d.x + 12, d.y + 24, 6, 4);
        ctx.fillRect(d.x + 26, d.y + 24, 6, 2);
      } else {
        ctx.fillRect(d.x + 12, d.y + 24, 6, 2);
        ctx.fillRect(d.x + 26, d.y + 24, 6, 4);
      }
      return;
    }

    // Normal Standing/Running Dino
    const x = d.x;
    const y = d.y;

    // Body & tail
    ctx.fillRect(x + 6, y + 16, 26, 20); // main torso
    ctx.fillRect(x, y + 20, 8, 10);      // tail tip
    ctx.fillRect(x + 2, y + 16, 8, 12);  // tail mid

    // Neck & Head
    ctx.fillRect(x + 22, y + 4, 12, 16); // neck
    ctx.fillRect(x + 22, y, 22, 16);     // head/snout
    ctx.fillRect(x + 32, y + 12, 12, 4); // mouth/jaw

    // Little arms
    ctx.fillRect(x + 30, y + 20, 6, 3);
    ctx.fillRect(x + 34, y + 22, 2, 4);

    // Eye
    if (this.isDead) {
      // Dead X eye
      ctx.fillStyle = '#f7f7f7';
      ctx.fillRect(x + 28, y + 3, 5, 5);
      ctx.fillStyle = '#535353';
      ctx.fillRect(x + 29, y + 4, 3, 3);
    } else {
      ctx.fillStyle = '#f7f7f7';
      ctx.fillRect(x + 28, y + 3, 4, 4);
    }

    ctx.fillStyle = '#535353';

    // Legs
    if (!d.isGrounded) {
      // Jump pose legs
      ctx.fillRect(x + 12, y + 36, 4, 8);
      ctx.fillRect(x + 20, y + 36, 4, 6);
    } else if (d.legState === 0) {
      ctx.fillRect(x + 12, y + 36, 4, 12);
      ctx.fillRect(x + 12, y + 46, 6, 2);

      ctx.fillRect(x + 22, y + 36, 4, 6);
      ctx.fillRect(x + 24, y + 40, 4, 4);
    } else {
      ctx.fillRect(x + 12, y + 36, 4, 6);
      ctx.fillRect(x + 14, y + 40, 4, 4);

      ctx.fillRect(x + 22, y + 36, 4, 12);
      ctx.fillRect(x + 22, y + 46, 6, 2);
    }
  }

  drawCactus(ctx, obs) {
    ctx.fillStyle = '#535353';
    const { x, y, width, height, subType } = obs;

    if (subType === 'cluster') {
      // Three grouped cacti
      ctx.fillRect(x + 4, y + 10, 10, height - 10);
      ctx.fillRect(x + 18, y, 12, height);
      ctx.fillRect(x + 34, y + 14, 10, height - 14);
      // Arms
      ctx.fillRect(x, y + 18, 5, 4);
      ctx.fillRect(x, y + 14, 4, 8);
      ctx.fillRect(x + 30, y + 22, 6, 4);
      ctx.fillRect(x + 42, y + 26, 4, 6);
    } else if (subType === 'double-small') {
      ctx.fillRect(x + 2, y, 12, height);
      ctx.fillRect(x + 18, y + 6, 12, height - 6);
      ctx.fillRect(x - 2, y + 12, 5, 4);
      ctx.fillRect(x + 28, y + 16, 5, 4);
    } else {
      // Single regular or large cactus
      const trunkWidth = Math.floor(width * 0.45);
      const trunkX = x + Math.floor((width - trunkWidth) / 2);
      ctx.fillRect(trunkX, y, trunkWidth, height);
      // Left arm
      ctx.fillRect(x, y + Math.floor(height * 0.35), trunkX - x, 5);
      ctx.fillRect(x, y + Math.floor(height * 0.2), 5, Math.floor(height * 0.25));
      // Right arm
      ctx.fillRect(trunkX + trunkWidth, y + Math.floor(height * 0.45), x + width - (trunkX + trunkWidth), 5);
      ctx.fillRect(x + width - 5, y + Math.floor(height * 0.3), 5, Math.floor(height * 0.25));
    }
  }

  drawPtero(ctx, obs) {
    ctx.fillStyle = '#535353';
    const { x, y, flapState } = obs;

    // Body and beak
    ctx.fillRect(x + 12, y + 10, 18, 8);
    ctx.fillRect(x + 4, y + 8, 10, 6);  // Head
    ctx.fillRect(x, y + 9, 6, 3);       // Beak

    // Wing
    if (flapState === 0) {
      // Wings up
      ctx.fillRect(x + 16, y, 8, 12);
      ctx.fillRect(x + 20, y - 6, 6, 8);
    } else {
      // Wings down
      ctx.fillRect(x + 16, y + 14, 8, 12);
      ctx.fillRect(x + 20, y + 22, 6, 8);
    }
  }
}
