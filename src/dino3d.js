import * as THREE from 'three';
import { sounds } from './audio.js';

export class Dino3DGame {
  constructor(scene, camera, onDeath) {
    this.scene = scene;
    this.camera = camera;
    this.onDeath = onDeath;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Gameplay parameters
    this.lanes = [-3.8, 0, 3.8];
    this.currentLane = 1; // Middle
    this.targetX = 0;
    this.playerX = 0;

    this.playerY = 0;
    this.playerVy = 0;
    this.gravity = -38;
    this.jumpForce = 15;
    this.isGrounded = true;
    this.isDucking = false;

    this.speed = 28;
    this.minSpeed = 28;
    this.maxSpeed = 55;
    this.distance = 0;
    this.score = 0;

    this.obstacles = [];
    this.nextObstacleZ = -40;
    this.active = false;
    this.isDead = false;

    this.animTime = 0;
    this.dustParticles = [];

    this.initEnvironment();
    this.buildDinoMesh();
  }

  prepareTransition() {
    this.show();
    this.active = false;
    this.isDead = false;
    this.currentLane = 1;
    this.targetX = 0;
    this.playerX = 0;
    this.playerY = 0;
    this.playerVy = 0;
    this.isGrounded = true;
    this.isDucking = false;

    // Dino starts facing PROFILE right (Math.PI / 2), identical to the 2D side-scroller!
    this.dinoGroup.position.set(0, 0, 0);
    this.dinoGroup.rotation.set(0, Math.PI / 2, 0);
    this.dinoGroup.scale.set(1, 1, 1);

    // Defeated / knocked down posture
    this.headGroup.position.y = 2.1;
    this.headGroup.rotation.x = 0.5;
    this.bodyMesh.position.y = 1.6;
    this.tailGroup.rotation.y = 0.4;
    this.leftLegGroup.rotation.x = -0.4;
    this.rightLegGroup.rotation.x = 0.6;

    // Clean obstacles and place them ahead
    for (const obs of this.obstacles) {
      this.group.remove(obs.mesh);
    }
    this.obstacles = [];
    for (let z = -60; z > -200; z -= 35) {
      this.spawnObstacleAtZ(z);
    }
  }

  updateTransition(progress) {
    // progress: 0.0 to 1.0
    // Stage 1 (0.0 -> 0.25): Knocked out in profile
    // Stage 2 (0.25 -> 0.65): Waking up, standing up, head shaking
    // Stage 3 (0.65 -> 1.0): Pivot 90° from profile (+X) to facing down track (-Z), ready to run!

    if (progress < 0.25) {
      // Shiver / shake slightly
      const sh = (Math.random() - 0.5) * 0.06;
      this.dinoGroup.position.x = sh;
      this.dinoGroup.rotation.y = Math.PI / 2 + sh;
      this.headGroup.position.y = 2.1;
      this.headGroup.rotation.x = 0.5;
    } else if (progress < 0.65) {
      const p = (progress - 0.25) / 0.4; // 0 to 1
      const ease = p * p * (3 - 2 * p);

      // Stand up proudly
      this.bodyMesh.position.y = 1.6 + ease * 0.5;
      this.headGroup.position.y = 2.1 + ease * 0.7;
      this.headGroup.rotation.x = (1 - ease) * 0.5;

      // Reset legs
      this.leftLegGroup.rotation.x = -0.4 * (1 - ease);
      this.rightLegGroup.rotation.x = 0.6 * (1 - ease);

      // Head shake / roar anticipation
      this.headGroup.rotation.y = Math.sin(p * Math.PI * 3) * 0.25;

      // Dust burst at halfway mark
      if (p > 0.5 && p < 0.55 && Math.random() < 0.5) {
        this.emitDust();
      }
    } else {
      const p = (progress - 0.65) / 0.35; // 0 to 1
      const ease = p * p * (3 - 2 * p);

      // Smooth 90 degree body turn from profile to back facing camera!
      // Math.PI / 2 -> 0.0
      this.dinoGroup.rotation.y = (Math.PI / 2) * (1 - ease);
      this.headGroup.rotation.y = 0;

      // Tail swish as he turns
      this.tailGroup.rotation.y = Math.sin(p * Math.PI * 2) * 0.5;

      // Crouch into running position
      this.dinoGroup.position.y = Math.sin(p * Math.PI) * 0.3;

      if (Math.random() < 0.3) {
        this.emitDust();
      }
    }
  }

  buildDinoMesh() {
    this.dinoGroup = new THREE.Group();

    // Material: Chrome Dino charcoal grey
    const dinoMat = new THREE.MeshStandardMaterial({
      color: 0x535353,
      roughness: 0.5,
      metalness: 0.1,
    });
    const bellyMat = new THREE.MeshStandardMaterial({
      color: 0x6e6e6e,
      roughness: 0.6,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Torso / Body
    const bodyGeom = new THREE.BoxGeometry(1.6, 2.0, 2.4);
    this.bodyMesh = new THREE.Mesh(bodyGeom, dinoMat);
    this.bodyMesh.position.y = 2.1;
    this.bodyMesh.castShadow = true;
    this.dinoGroup.add(this.bodyMesh);

    // Belly patch
    const bellyGeom = new THREE.BoxGeometry(1.4, 1.4, 0.2);
    const belly = new THREE.Mesh(bellyGeom, bellyMat);
    belly.position.set(0, 1.9, -1.25);
    this.dinoGroup.add(belly);

    // Tail (segmented for swing)
    this.tailGroup = new THREE.Group();
    this.tailGroup.position.set(0, 2.1, 1.2);
    const tailGeom1 = new THREE.BoxGeometry(0.9, 0.9, 1.2);
    const tailMesh1 = new THREE.Mesh(tailGeom1, dinoMat);
    tailMesh1.position.z = 0.6;
    tailMesh1.castShadow = true;
    this.tailGroup.add(tailMesh1);

    const tailGeom2 = new THREE.BoxGeometry(0.5, 0.5, 1.0);
    const tailMesh2 = new THREE.Mesh(tailGeom2, dinoMat);
    tailMesh2.position.z = 1.6;
    tailMesh2.castShadow = true;
    this.tailGroup.add(tailMesh2);
    this.dinoGroup.add(this.tailGroup);

    // Neck & Head
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 2.8, -1.0);

    const neckGeom = new THREE.BoxGeometry(1.0, 1.0, 0.8);
    const neck = new THREE.Mesh(neckGeom, dinoMat);
    neck.position.set(0, 0.4, -0.2);
    neck.castShadow = true;
    this.headGroup.add(neck);

    const headGeom = new THREE.BoxGeometry(1.3, 1.2, 1.8);
    const head = new THREE.Mesh(headGeom, dinoMat);
    head.position.set(0, 1.1, -0.7);
    head.castShadow = true;
    this.headGroup.add(head);

    // Snout / Jaw
    const jawGeom = new THREE.BoxGeometry(1.1, 0.4, 1.0);
    const jaw = new THREE.Mesh(jawGeom, dinoMat);
    jaw.position.set(0, 0.6, -1.4);
    this.headGroup.add(jaw);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const eyeL = new THREE.Mesh(eyeGeom, eyeMat);
    eyeL.position.set(-0.68, 1.3, -0.7);
    const eyeR = new THREE.Mesh(eyeGeom, eyeMat);
    eyeR.position.set(0.68, 1.3, -0.7);
    this.headGroup.add(eyeL);
    this.headGroup.add(eyeR);

    this.dinoGroup.add(this.headGroup);

    // Left Leg
    this.leftLegGroup = new THREE.Group();
    this.leftLegGroup.position.set(-0.65, 1.4, 0);
    const legGeom = new THREE.BoxGeometry(0.4, 1.4, 0.5);
    const leftLegMesh = new THREE.Mesh(legGeom, dinoMat);
    leftLegMesh.position.y = -0.7;
    leftLegMesh.castShadow = true;
    this.leftLegGroup.add(leftLegMesh);

    const footGeom = new THREE.BoxGeometry(0.5, 0.3, 0.8);
    const leftFoot = new THREE.Mesh(footGeom, dinoMat);
    leftFoot.position.set(0, -1.35, -0.2);
    this.leftLegGroup.add(leftFoot);
    this.dinoGroup.add(this.leftLegGroup);

    // Right Leg
    this.rightLegGroup = new THREE.Group();
    this.rightLegGroup.position.set(0.65, 1.4, 0);
    const rightLegMesh = new THREE.Mesh(legGeom, dinoMat);
    rightLegMesh.position.y = -0.7;
    rightLegMesh.castShadow = true;
    this.rightLegGroup.add(rightLegMesh);

    const rightFoot = new THREE.Mesh(footGeom, dinoMat);
    rightFoot.position.set(0, -1.35, -0.2);
    this.rightLegGroup.add(rightFoot);
    this.dinoGroup.add(this.rightLegGroup);

    // Tiny T-Rex Arms
    const armGeom = new THREE.BoxGeometry(0.25, 0.5, 0.25);
    const leftArm = new THREE.Mesh(armGeom, dinoMat);
    leftArm.position.set(-0.9, 2.0, -0.9);
    leftArm.rotation.x = -0.5;
    this.dinoGroup.add(leftArm);

    const rightArm = new THREE.Mesh(armGeom, dinoMat);
    rightArm.position.set(0.9, 2.0, -0.9);
    rightArm.rotation.x = -0.5;
    this.dinoGroup.add(rightArm);

    this.group.add(this.dinoGroup);

    // Create Dust Particle Pool
    const pGeom = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const pMat = new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.6 });
    for (let i = 0; i < 20; i++) {
      const p = new THREE.Mesh(pGeom, pMat.clone());
      p.visible = false;
      this.group.add(p);
      this.dustParticles.push({
        mesh: p,
        life: 0,
        maxLife: 0.35,
        vx: 0,
        vy: 0,
        vz: 0,
      });
    }
  }

  initEnvironment() {
    // 3-lane Track Ground
    const trackWidth = 14;
    const trackLength = 260;

    const trackGeom = new THREE.PlaneGeometry(trackWidth, trackLength, 1, 30);
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f5,
      roughness: 0.9,
    });
    this.trackMesh = new THREE.Mesh(trackGeom, trackMat);
    this.trackMesh.rotation.x = -Math.PI / 2;
    this.trackMesh.position.set(0, 0, -trackLength / 2 + 10);
    this.trackMesh.receiveShadow = true;
    this.group.add(this.trackMesh);

    // Desert Ground border / endless horizon
    const groundGeom = new THREE.PlaneGeometry(160, trackLength);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xededed,
      roughness: 1.0,
    });
    this.outerGround = new THREE.Mesh(groundGeom, groundMat);
    this.outerGround.rotation.x = -Math.PI / 2;
    this.outerGround.position.set(0, -0.05, -trackLength / 2 + 10);
    this.group.add(this.outerGround);

    // Lane division markers (subtle dashes)
    this.laneLines = [];
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xdedede });
    for (let z = -200; z < 20; z += 12) {
      [-1.9, 1.9].forEach((lx) => {
        const lineGeom = new THREE.PlaneGeometry(0.15, 4);
        const line = new THREE.Mesh(lineGeom, lineMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(lx, 0.02, z);
        this.group.add(line);
        this.laneLines.push(line);
      });
    }

    // Clouds in the 3D sky
    this.clouds3D = [];
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xdbdbdb });
    for (let i = 0; i < 15; i++) {
      const cg = new THREE.Group();
      const numPuffs = 3 + Math.floor(Math.random() * 3);
      for (let p = 0; p < numPuffs; p++) {
        const puffGeom = new THREE.BoxGeometry(
          2.5 + Math.random() * 2,
          1.2 + Math.random() * 0.8,
          2.5 + Math.random() * 2
        );
        const puff = new THREE.Mesh(puffGeom, cloudMat);
        puff.position.set((p - numPuffs / 2) * 2, 0, (Math.random() - 0.5) * 2);
        cg.add(puff);
      }
      cg.position.set(
        (Math.random() - 0.5) * 90,
        14 + Math.random() * 12,
        -Math.random() * 200
      );
      this.group.add(cg);
      this.clouds3D.push(cg);
    }
  }

  start(initialScore = 0) {
    this.active = true;
    this.isDead = false;
    this.score = initialScore;
    this.distance = 0;
    this.speed = this.minSpeed;
    this.currentLane = 1;
    this.targetX = 0;
    this.playerX = 0;
    this.playerY = 0;
    this.playerVy = 0;
    this.isGrounded = true;
    this.isDucking = false;
    this.nextObstacleZ = -40;

    // Reset dino posture
    this.dinoGroup.position.set(0, 0, 0);
    this.dinoGroup.rotation.set(0, 0, 0);
    this.dinoGroup.scale.set(1, 1, 1);

    // Clear existing obstacles
    for (const obs of this.obstacles) {
      this.group.remove(obs.mesh);
    }
    this.obstacles = [];

    // Pre-populate several obstacles ahead
    for (let z = -50; z > -180; z -= 30) {
      this.spawnObstacleAtZ(z);
    }
  }

  moveLeft() {
    if (!this.active || this.isDead) return;
    if (this.currentLane > 0) {
      this.currentLane--;
      this.targetX = this.lanes[this.currentLane];
      sounds.playWhoosh();
    }
  }

  moveRight() {
    if (!this.active || this.isDead) return;
    if (this.currentLane < this.lanes.length - 1) {
      this.currentLane++;
      this.targetX = this.lanes[this.currentLane];
      sounds.playWhoosh();
    }
  }

  jump() {
    if (!this.active || this.isDead) return;
    if (this.isGrounded) {
      this.playerVy = this.jumpForce;
      this.isGrounded = false;
      sounds.playJump();
    }
  }

  setDucking(ducking) {
    if (!this.active || this.isDead) return;
    this.isDucking = ducking;
    if (ducking && !this.isGrounded) {
      this.playerVy -= 12; // Fast dive
    }
  }

  spawnObstacleAtZ(z) {
    // Pick lane (0, 1, 2)
    const lane = Math.floor(Math.random() * 3);
    const laneX = this.lanes[lane];
    const isPtero = this.score > 200 && Math.random() < 0.35;

    if (isPtero) {
      // Flying Pterodactyl
      const pteroGroup = this.createPteroMesh();
      // Altitude: medium (duck under) or high
      const y = Math.random() < 0.5 ? 2.6 : 3.8;
      pteroGroup.position.set(laneX, y, z);
      this.group.add(pteroGroup);
      this.obstacles.push({
        type: 'ptero',
        mesh: pteroGroup,
        lane,
        x: laneX,
        y,
        radius: 1.1,
        height: 1.2,
      });
    } else {
      // 3D Cactus
      const cactusMesh = this.createCactusMesh();
      cactusMesh.position.set(laneX, 0, z);
      this.group.add(cactusMesh);
      this.obstacles.push({
        type: 'cactus',
        mesh: cactusMesh,
        lane,
        x: laneX,
        y: 0,
        radius: 0.9,
        height: 3.2,
      });
    }
  }

  createCactusMesh() {
    const group = new THREE.Group();
    const cactusMat = new THREE.MeshStandardMaterial({
      color: 0x535353,
      roughness: 0.4,
    });

    const height = 2.6 + Math.random() * 0.8;
    // Central stem
    const stemGeom = new THREE.BoxGeometry(0.8, height, 0.8);
    const stem = new THREE.Mesh(stemGeom, cactusMat);
    stem.position.y = height / 2;
    stem.castShadow = true;
    group.add(stem);

    // Left arm
    const armGeomH = new THREE.BoxGeometry(0.8, 0.5, 0.5);
    const armGeomV = new THREE.BoxGeometry(0.5, 0.9, 0.5);

    const leftArmH = new THREE.Mesh(armGeomH, cactusMat);
    leftArmH.position.set(-0.6, height * 0.45, 0);
    const leftArmV = new THREE.Mesh(armGeomV, cactusMat);
    leftArmV.position.set(-0.9, height * 0.45 + 0.45, 0);
    group.add(leftArmH);
    group.add(leftArmV);

    // Right arm
    const rightArmH = new THREE.Mesh(armGeomH, cactusMat);
    rightArmH.position.set(0.6, height * 0.55, 0);
    const rightArmV = new THREE.Mesh(armGeomV, cactusMat);
    rightArmV.position.set(0.9, height * 0.55 + 0.45, 0);
    group.add(rightArmH);
    group.add(rightArmV);

    return group;
  }

  createPteroMesh() {
    const group = new THREE.Group();
    const pteroMat = new THREE.MeshStandardMaterial({
      color: 0x535353,
      roughness: 0.3,
    });

    // Body
    const bodyGeom = new THREE.BoxGeometry(0.6, 0.6, 1.6);
    const body = new THREE.Mesh(bodyGeom, pteroMat);
    group.add(body);

    // Head and Beak facing player
    const headGeom = new THREE.BoxGeometry(0.5, 0.5, 1.2);
    const head = new THREE.Mesh(headGeom, pteroMat);
    head.position.set(0, 0.2, 1.1);
    group.add(head);

    // Left Wing
    const wingGeom = new THREE.BoxGeometry(2.0, 0.15, 0.9);
    const leftWing = new THREE.Mesh(wingGeom, pteroMat);
    leftWing.position.set(-1.1, 0.2, 0);
    group.add(leftWing);
    group.leftWing = leftWing;

    // Right Wing
    const rightWing = new THREE.Mesh(wingGeom, pteroMat);
    rightWing.position.set(1.1, 0.2, 0);
    group.add(rightWing);
    group.rightWing = rightWing;

    return group;
  }

  emitDust() {
    const p = this.dustParticles.find((part) => !part.mesh.visible);
    if (!p) return;
    p.mesh.visible = true;
    p.life = 0;
    p.mesh.position.set(
      this.playerX + (Math.random() - 0.5) * 0.8,
      0.15,
      0.6 + Math.random() * 0.4
    );
    p.vx = (Math.random() - 0.5) * 2;
    p.vy = Math.random() * 2 + 1;
    p.vz = 4 + Math.random() * 4;
  }

  update(dt) {
    if (!this.active) return;

    if (this.isDead) {
      // Tumble / ragdoll on death
      this.dinoGroup.rotation.x += dt * 6;
      this.dinoGroup.rotation.z += dt * 4;
      this.dinoGroup.position.y = Math.max(0, this.dinoGroup.position.y - dt * 6);
      return;
    }

    this.animTime += dt * 14;

    // Distance and score
    this.distance += this.speed * dt;
    const oldHundreds = Math.floor(this.score / 100);
    this.score = Math.floor(this.distance * 1.5);
    const newHundreds = Math.floor(this.score / 100);
    if (newHundreds > oldHundreds && newHundreds > 0) {
      sounds.playScore();
    }

    // Speed progression
    this.speed = Math.min(this.maxSpeed, this.minSpeed + (this.score / 300) * 2);

    // Smooth lane interpolation (smooth dampening)
    const laneSmoothing = 14;
    this.playerX += (this.targetX - this.playerX) * Math.min(1, dt * laneSmoothing);

    // Dino Banking / roll tilt when switching lanes
    const laneDelta = this.targetX - this.playerX;
    this.dinoGroup.rotation.z = -laneDelta * 0.15;
    this.dinoGroup.rotation.y = laneDelta * 0.1;

    // Jump / Gravity physics
    if (!this.isGrounded) {
      this.playerVy += this.gravity * dt;
      this.playerY += this.playerVy * dt;
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.playerVy = 0;
        this.isGrounded = true;
      }
    }

    // Ducking squash & stretch
    if (this.isDucking && this.isGrounded) {
      this.dinoGroup.scale.set(1.2, 0.55, 1.3);
      this.headGroup.position.y = 1.4;
      this.bodyMesh.position.y = 1.1;
    } else {
      this.dinoGroup.scale.set(1.0, 1.0, 1.0);
      this.headGroup.position.y = 2.8;
      this.bodyMesh.position.y = 2.1;
    }

    // Position Dino
    this.dinoGroup.position.x = this.playerX;
    this.dinoGroup.position.y = this.playerY;

    // Leg running cycle
    if (this.isGrounded) {
      const legAngle = Math.sin(this.animTime) * 0.85;
      this.leftLegGroup.rotation.x = legAngle;
      this.rightLegGroup.rotation.x = -legAngle;
      this.tailGroup.rotation.y = Math.sin(this.animTime * 0.5) * 0.3;
      this.headGroup.position.y = (this.isDucking ? 1.4 : 2.8) + Math.abs(Math.sin(this.animTime)) * 0.15;

      // Dust particles from running
      if (Math.random() < 0.4) {
        this.emitDust();
      }
    } else {
      // Jump pose
      this.leftLegGroup.rotation.x = -0.6;
      this.rightLegGroup.rotation.x = 0.4;
    }

    // Update Dust Particles
    for (const p of this.dustParticles) {
      if (!p.mesh.visible) continue;
      p.life += dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const progress = p.life / p.maxLife;
      p.mesh.material.opacity = (1 - progress) * 0.6;
      p.mesh.scale.setScalar(1 + progress * 0.8);
      if (p.life >= p.maxLife) {
        p.mesh.visible = false;
      }
    }

    // Scroll Lane Lines
    for (const line of this.laneLines) {
      line.position.z += this.speed * dt;
      if (line.position.z > 15) {
        line.position.z -= 220;
      }
    }

    // Move Clouds
    for (const cloud of this.clouds3D) {
      cloud.position.z += this.speed * 0.2 * dt;
      if (cloud.position.z > 25) {
        cloud.position.z = -200 - Math.random() * 50;
        cloud.position.x = (Math.random() - 0.5) * 90;
      }
    }

    // Spawn new obstacles as needed
    const minZ = Math.min(...this.obstacles.map((o) => o.mesh.position.z), 0);
    if (minZ > -180) {
      const nextZ = minZ - (28 + Math.random() * 24);
      this.spawnObstacleAtZ(nextZ);
    }

    // Update Obstacles & Collision Check
    const dinoHitbox = {
      x: this.playerX,
      y: this.playerY + (this.isDucking ? 0.7 : 1.4),
      z: 0,
      width: 1.3,
      height: this.isDucking ? 1.2 : 2.6,
      depth: 2.0,
    };

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.mesh.position.z += this.speed * dt;

      // Pterodactyl wing flapping
      if (obs.type === 'ptero') {
        const flap = Math.sin(this.animTime * 1.5) * 0.7;
        obs.mesh.leftWing.rotation.z = flap;
        obs.mesh.rightWing.rotation.z = -flap;
      }

      // Check collision
      const dz = Math.abs(obs.mesh.position.z - dinoHitbox.z);
      const dx = Math.abs(obs.mesh.position.x - dinoHitbox.x);

      let dyOverlap = false;
      if (obs.type === 'cactus') {
        // Ground cactus: if player is jumping high enough, passes over!
        dyOverlap = this.playerY < 2.3;
      } else {
        // Pterodactyl: if ducking and ptero is at medium altitude, passes under!
        if (this.isDucking && obs.y >= 2.4) {
          dyOverlap = false; // Duck successful!
        } else {
          dyOverlap = Math.abs(obs.mesh.position.y - dinoHitbox.y) < 1.4;
        }
      }

      if (dz < 1.3 && dx < 1.2 && dyOverlap) {
        this.die();
        return;
      }

      // Remove obstacles behind camera
      if (obs.mesh.position.z > 20) {
        this.group.remove(obs.mesh);
        this.obstacles.splice(i, 1);
      }
    }

    // Camera follow Dino smoothly
    const targetCamX = this.playerX * 0.45;
    this.camera.position.x += (targetCamX - this.camera.position.x) * dt * 8;
    this.camera.position.y = 5.2 + (this.playerY * 0.3);
    this.camera.position.z = 8.5;
    this.camera.lookAt(this.playerX * 0.25, 2.2 + this.playerY * 0.2, -10);
  }

  die() {
    this.isDead = true;
    sounds.playHit();
    if (this.onDeath) {
      this.onDeath(this.score);
    }
  }

  hide() {
    this.active = false;
    this.group.visible = false;
  }

  show() {
    this.group.visible = true;
  }
}
