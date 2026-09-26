import * as THREE from 'three';
import { sounds } from './audio.js';

// Color themes for each phase (smoothly lerped)
const THEMES = [
  { // Phase 0: Pure Chrome Monochrome
    sky: new THREE.Color(0xf7f7f7),
    fogDensity: 0.012,
    track: new THREE.Color(0xf5f5f5),
    ground: new THREE.Color(0xededed),
    lane: new THREE.Color(0xdedede),
    railL: new THREE.Color(0xdedede),
    railR: new THREE.Color(0xdedede),
    dino: new THREE.Color(0x535353),
    dinoEmissive: new THREE.Color(0x000000),
    dinoEmissiveInt: 0,
    eye: new THREE.Color(0xffffff),
    cactus: new THREE.Color(0x535353),
    cactusCore: new THREE.Color(0x535353),
    cactusCoreOpacity: 0,
    ptero: new THREE.Color(0x535353),
    pteroEmissive: new THREE.Color(0x000000),
  },
  { // Phase 1: Neon Emergence (Soft twilight, crisp cyan & magenta accents)
    sky: new THREE.Color(0x231a38),
    fogDensity: 0.013,
    track: new THREE.Color(0x1e1930),
    ground: new THREE.Color(0x151022),
    lane: new THREE.Color(0x00f0ff),
    railL: new THREE.Color(0xff007f),
    railR: new THREE.Color(0x00f0ff),
    dino: new THREE.Color(0x28233c),
    dinoEmissive: new THREE.Color(0x00f0ff),
    dinoEmissiveInt: 0.4,
    eye: new THREE.Color(0x00f0ff),
    cactus: new THREE.Color(0x1a2430),
    cactusCore: new THREE.Color(0x00f0ff),
    cactusCoreOpacity: 0.45,
    ptero: new THREE.Color(0x281830),
    pteroEmissive: new THREE.Color(0xff007f),
  },
  { // Phase 2: Synthwave Overdrive (Rich deep purple & hot neon)
    sky: new THREE.Color(0x140a28),
    fogDensity: 0.014,
    track: new THREE.Color(0x120824),
    ground: new THREE.Color(0x0a0416),
    lane: new THREE.Color(0x00f0ff),
    railL: new THREE.Color(0xff007f),
    railR: new THREE.Color(0x7000ff),
    dino: new THREE.Color(0x181026),
    dinoEmissive: new THREE.Color(0xff007f),
    dinoEmissiveInt: 0.75,
    eye: new THREE.Color(0x00ffff),
    cactus: new THREE.Color(0x101a24),
    cactusCore: new THREE.Color(0x00ffaa),
    cactusCoreOpacity: 0.7,
    ptero: new THREE.Color(0x200a20),
    pteroEmissive: new THREE.Color(0xff0055),
  },
  { // Phase 3: Hyper-Chromatic Drift (Deep midnight & electric ultraviolet)
    sky: new THREE.Color(0x0b041a),
    fogDensity: 0.015,
    track: new THREE.Color(0x0e0520),
    ground: new THREE.Color(0x060210),
    lane: new THREE.Color(0x00ffff),
    railL: new THREE.Color(0xff1493),
    railR: new THREE.Color(0x00e5ff),
    dino: new THREE.Color(0x120820),
    dinoEmissive: new THREE.Color(0x00ffff),
    dinoEmissiveInt: 1.0,
    eye: new THREE.Color(0xff00a0),
    cactus: new THREE.Color(0x0b1820),
    cactusCore: new THREE.Color(0x00f0ff),
    cactusCoreOpacity: 0.85,
    ptero: new THREE.Color(0x1a0520),
    pteroEmissive: new THREE.Color(0xff007f),
  },
  { // Phase 4: Maximum Overdrive (Deep cosmic void, luminous cyber runway)
    sky: new THREE.Color(0x070212),
    fogDensity: 0.016,
    track: new THREE.Color(0x090318),
    ground: new THREE.Color(0x04010a),
    lane: new THREE.Color(0x00ffff),
    railL: new THREE.Color(0xff0080),
    railR: new THREE.Color(0x9d00ff),
    dino: new THREE.Color(0x0e041a),
    dinoEmissive: new THREE.Color(0xff00bb),
    dinoEmissiveInt: 1.3,
    eye: new THREE.Color(0x00ffff),
    cactus: new THREE.Color(0x081520),
    cactusCore: new THREE.Color(0x00ffcc),
    cactusCoreOpacity: 0.95,
    ptero: new THREE.Color(0x160318),
    pteroEmissive: new THREE.Color(0xff0066),
  },
];

export class Dino3DGame {
  constructor(scene, camera, onDeath, onPhaseChange) {
    this.scene = scene;
    this.camera = camera;
    this.onDeath = onDeath;
    this.onPhaseChange = onPhaseChange;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Gameplay parameters
    this.lanes = [-3.8, 0, 3.8];
    this.currentLane = 1; // Middle
    this.targetX = 0;
    this.playerX = 0;

    this.playerY = 0;
    this.playerVy = 0;
    this.gravity = -44;
    this.jumpForce = 16.5;
    this.isGrounded = true;
    this.isDucking = false;

    this.speed = 28;
    this.minSpeed = 28;
    this.maxSpeed = 58;
    this.distance = 0;
    this.score = 0;
    this.baseFOV = 50;

    this.obstacles = [];
    this.beaconPylons = [];
    this.active = false;
    this.isDead = false;

    this.animTime = 0;
    this.colorProgress = 0; // Continuous 0.0 -> 4.0 matching phases
    this.currentPhase = 0;

    // Camera dynamic effects
    this.camBounceY = 0;
    this.camBounceVy = 0;

    // Particle pools (clean & lightweight)
    this.dustParticles = [];
    this.speedStreaks = [];

    this.initEnvironment();
    this.buildDinoMesh();
    this.initSpeedStreaks();
    this.initBeaconPylons();
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
    this.colorProgress = 0;
    this.currentPhase = 0;
    this.applyTheme(0);

    // Dino starts facing PROFILE right (Math.PI / 2), identical to the 2D side-scroller!
    this.dinoGroup.position.set(0, 0, 0);
    this.dinoGroup.rotation.set(0, Math.PI / 2, 0);
    this.dinoGroup.scale.set(1, 1, 1);

    // Defeated posture
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
    if (progress < 0.25) {
      const sh = (Math.random() - 0.5) * 0.05;
      this.dinoGroup.position.x = sh;
      this.dinoGroup.rotation.y = Math.PI / 2 + sh;
      this.headGroup.position.y = 2.1;
      this.headGroup.rotation.x = 0.5;
    } else if (progress < 0.65) {
      const p = (progress - 0.25) / 0.4;
      const ease = p * p * (3 - 2 * p);

      this.bodyMesh.position.y = 1.6 + ease * 0.5;
      this.headGroup.position.y = 2.1 + ease * 0.7;
      this.headGroup.rotation.x = (1 - ease) * 0.5;
      this.leftLegGroup.rotation.x = -0.4 * (1 - ease);
      this.rightLegGroup.rotation.x = 0.6 * (1 - ease);
      this.headGroup.rotation.y = Math.sin(p * Math.PI * 3) * 0.2;
    } else {
      const p = (progress - 0.65) / 0.35;
      const ease = p * p * (3 - 2 * p);

      this.dinoGroup.rotation.y = (Math.PI / 2) * (1 - ease);
      this.headGroup.rotation.y = 0;
      this.tailGroup.rotation.y = Math.sin(p * Math.PI * 2) * 0.4;
      this.dinoGroup.position.y = Math.sin(p * Math.PI) * 0.25;
    }
  }

  buildDinoMesh() {
    this.dinoGroup = new THREE.Group();

    this.dinoMat = new THREE.MeshStandardMaterial({
      color: 0x535353,
      roughness: 0.5,
      metalness: 0.2,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    this.bellyMat = new THREE.MeshStandardMaterial({
      color: 0x6e6e6e,
      roughness: 0.6,
      metalness: 0.1,
    });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.spineMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.2,
      metalness: 0.7,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.0,
    });

    // Body
    const bodyGeom = new THREE.BoxGeometry(1.6, 2.0, 2.4);
    this.bodyMesh = new THREE.Mesh(bodyGeom, this.dinoMat);
    this.bodyMesh.position.y = 2.1;
    this.bodyMesh.castShadow = true;
    this.dinoGroup.add(this.bodyMesh);

    // Sleek dorsal spines
    this.spines = [];
    const spineGeom = new THREE.ConeGeometry(0.18, 0.4, 4);
    spineGeom.rotateX(Math.PI / 2);
    for (let s = -0.7; s <= 0.7; s += 0.35) {
      const spine = new THREE.Mesh(spineGeom, this.spineMat);
      spine.position.set(0, 3.15, s);
      spine.castShadow = true;
      this.dinoGroup.add(spine);
      this.spines.push(spine);
    }

    // Belly patch
    const bellyGeom = new THREE.BoxGeometry(1.4, 1.4, 0.2);
    const belly = new THREE.Mesh(bellyGeom, this.bellyMat);
    belly.position.set(0, 1.9, -1.25);
    this.dinoGroup.add(belly);

    // Tail
    this.tailGroup = new THREE.Group();
    this.tailGroup.position.set(0, 2.1, 1.2);
    const tailMesh1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 1.2), this.dinoMat);
    tailMesh1.position.z = 0.6;
    tailMesh1.castShadow = true;
    this.tailGroup.add(tailMesh1);

    const tailMesh2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.0), this.dinoMat);
    tailMesh2.position.z = 1.6;
    tailMesh2.castShadow = true;
    this.tailGroup.add(tailMesh2);
    this.dinoGroup.add(this.tailGroup);

    // Neck & Head
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 2.8, -1.0);

    const neck = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.8), this.dinoMat);
    neck.position.set(0, 0.4, -0.2);
    neck.castShadow = true;
    this.headGroup.add(neck);

    const head = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.2, 1.8), this.dinoMat);
    head.position.set(0, 1.1, -0.7);
    head.castShadow = true;
    this.headGroup.add(head);

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 1.0), this.dinoMat);
    jaw.position.set(0, 0.6, -1.4);
    this.headGroup.add(jaw);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    this.eyeL = new THREE.Mesh(eyeGeom, this.eyeMat);
    this.eyeL.position.set(-0.68, 1.3, -0.7);
    this.eyeR = new THREE.Mesh(eyeGeom, this.eyeMat);
    this.eyeR.position.set(0.68, 1.3, -0.7);
    this.headGroup.add(this.eyeL);
    this.headGroup.add(this.eyeR);

    this.dinoGroup.add(this.headGroup);

    // Legs
    const legGeom = new THREE.BoxGeometry(0.4, 1.4, 0.5);
    const footGeom = new THREE.BoxGeometry(0.5, 0.3, 0.8);

    this.leftLegGroup = new THREE.Group();
    this.leftLegGroup.position.set(-0.65, 1.4, 0);
    const leftLegMesh = new THREE.Mesh(legGeom, this.dinoMat);
    leftLegMesh.position.y = -0.7;
    leftLegMesh.castShadow = true;
    this.leftLegGroup.add(leftLegMesh);
    const leftFoot = new THREE.Mesh(footGeom, this.dinoMat);
    leftFoot.position.set(0, -1.35, -0.2);
    this.leftLegGroup.add(leftFoot);
    this.dinoGroup.add(this.leftLegGroup);

    this.rightLegGroup = new THREE.Group();
    this.rightLegGroup.position.set(0.65, 1.4, 0);
    const rightLegMesh = new THREE.Mesh(legGeom, this.dinoMat);
    rightLegMesh.position.y = -0.7;
    rightLegMesh.castShadow = true;
    this.rightLegGroup.add(rightLegMesh);
    const rightFoot = new THREE.Mesh(footGeom, this.dinoMat);
    rightFoot.position.set(0, -1.35, -0.2);
    this.rightLegGroup.add(rightFoot);
    this.dinoGroup.add(this.rightLegGroup);

    // Arms
    const armGeom = new THREE.BoxGeometry(0.25, 0.5, 0.25);
    const leftArm = new THREE.Mesh(armGeom, this.dinoMat);
    leftArm.position.set(-0.9, 2.0, -0.9);
    leftArm.rotation.x = -0.5;
    this.dinoGroup.add(leftArm);
    const rightArm = new THREE.Mesh(armGeom, this.dinoMat);
    rightArm.position.set(0.9, 2.0, -0.9);
    rightArm.rotation.x = -0.5;
    this.dinoGroup.add(rightArm);

    this.group.add(this.dinoGroup);

    // Subtle Dust Particles
    const pGeom = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    for (let i = 0; i < 20; i++) {
      const pMat = new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.6 });
      const p = new THREE.Mesh(pGeom, pMat);
      p.visible = false;
      this.group.add(p);
      this.dustParticles.push({
        mesh: p,
        mat: pMat,
        life: 0,
        maxLife: 0.35,
        vx: 0,
        vy: 0,
        vz: 0,
      });
    }
  }

  initSpeedStreaks() {
    // Elegant, thin streaks on screen periphery (never blocking track view)
    this.speedStreakGroup = new THREE.Group();
    this.group.add(this.speedStreakGroup);

    const streakGeom = new THREE.CylinderGeometry(0.02, 0.02, 7, 4);
    streakGeom.rotateX(Math.PI / 2);

    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0,
      });
      const streak = new THREE.Mesh(streakGeom, mat);
      // Place only on far left or far right (x < -9 or x > 9)
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * (10 + Math.random() * 14);
      const y = 2 + Math.random() * 10;
      streak.position.set(x, y, -Math.random() * 200);
      this.speedStreakGroup.add(streak);
      this.speedStreaks.push({
        mesh: streak,
        mat,
        baseSpeed: 1.3 + Math.random() * 0.5,
        side,
        distX: 10 + Math.random() * 14,
        y,
      });
    }
  }

  initBeaconPylons() {
    // Subtle neon border pylons along outer track borders (giving speed sensation without blocking view)
    this.pylonGroup = new THREE.Group();
    this.group.add(this.pylonGroup);

    this.pylonMat = new THREE.MeshBasicMaterial({ color: 0xdedede });
    const pylonGeom = new THREE.BoxGeometry(0.18, 2.2, 0.18);

    for (let z = -200; z < 20; z += 25) {
      [-7.6, 7.6].forEach((px) => {
        const pylon = new THREE.Mesh(pylonGeom, this.pylonMat);
        pylon.position.set(px, 1.1, z);
        this.pylonGroup.add(pylon);
        this.beaconPylons.push(pylon);
      });
    }
  }

  initEnvironment() {
    const trackWidth = 14;
    const trackLength = 280;

    const trackGeom = new THREE.PlaneGeometry(trackWidth, trackLength, 1, 30);
    this.trackMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f5,
      roughness: 0.85,
      metalness: 0.15,
    });
    this.trackMesh = new THREE.Mesh(trackGeom, this.trackMat);
    this.trackMesh.rotation.x = -Math.PI / 2;
    this.trackMesh.position.set(0, 0, -trackLength / 2 + 10);
    this.trackMesh.receiveShadow = true;
    this.group.add(this.trackMesh);

    // Clean glowing border rails
    const railGeom = new THREE.BoxGeometry(0.15, 0.25, trackLength);
    this.railMatL = new THREE.MeshBasicMaterial({ color: 0xdedede });
    this.railMatR = new THREE.MeshBasicMaterial({ color: 0xdedede });

    const railL = new THREE.Mesh(railGeom, this.railMatL);
    railL.position.set(-trackWidth / 2, 0.12, -trackLength / 2 + 10);
    this.group.add(railL);

    const railR = new THREE.Mesh(railGeom, this.railMatR);
    railR.position.set(trackWidth / 2, 0.12, -trackLength / 2 + 10);
    this.group.add(railR);

    // Ground plane
    const groundGeom = new THREE.PlaneGeometry(220, trackLength, 1, 1);
    this.outerGroundMat = new THREE.MeshStandardMaterial({
      color: 0xededed,
      roughness: 0.95,
      metalness: 0.05,
    });
    this.outerGround = new THREE.Mesh(groundGeom, this.outerGroundMat);
    this.outerGround.rotation.x = -Math.PI / 2;
    this.outerGround.position.set(0, -0.05, -trackLength / 2 + 10);
    this.group.add(this.outerGround);

    // Lane division dashes
    this.laneLines = [];
    this.laneMat = new THREE.MeshBasicMaterial({ color: 0xdedede });
    for (let z = -220; z < 20; z += 14) {
      [-1.9, 1.9].forEach((lx) => {
        const lineGeom = new THREE.PlaneGeometry(0.15, 4.0);
        const line = new THREE.Mesh(lineGeom, this.laneMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(lx, 0.02, z);
        this.group.add(line);
        this.laneLines.push(line);
      });
    }

    // Atmospheric clouds / distant shapes
    this.clouds3D = [];
    this.cloudMat = new THREE.MeshBasicMaterial({ color: 0xdbdbdb });
    for (let i = 0; i < 14; i++) {
      const cg = new THREE.Group();
      const numPuffs = 3 + Math.floor(Math.random() * 2);
      for (let p = 0; p < numPuffs; p++) {
        const puffGeom = new THREE.BoxGeometry(3 + Math.random() * 2, 1.2, 3 + Math.random() * 2);
        const puff = new THREE.Mesh(puffGeom, this.cloudMat);
        puff.position.set((p - numPuffs / 2) * 2, 0, (Math.random() - 0.5) * 2);
        cg.add(puff);
      }
      cg.position.set((Math.random() - 0.5) * 110, 16 + Math.random() * 10, -Math.random() * 220);
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
    this.colorProgress = 0;
    this.currentPhase = 0;

    this.dinoGroup.position.set(0, 0, 0);
    this.dinoGroup.rotation.set(0, 0, 0);
    this.dinoGroup.scale.set(1, 1, 1);

    for (const obs of this.obstacles) {
      this.group.remove(obs.mesh);
    }
    this.obstacles = [];

    for (let z = -50; z > -180; z -= 32) {
      this.spawnObstacleAtZ(z);
    }

    sounds.startMusic();
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
      this.emitDust(4);
    }
  }

  setDucking(ducking) {
    if (!this.active || this.isDead) return;
    this.isDucking = ducking;
    if (ducking && !this.isGrounded) {
      this.playerVy -= 16;
    }
  }

  spawnObstacleAtZ(z) {
    const lane = Math.floor(Math.random() * 3);
    const laneX = this.lanes[lane];
    const isPtero = this.score > 350 && Math.random() < 0.35;

    if (isPtero) {
      const pteroGroup = this.createPteroMesh();
      const y = Math.random() < 0.5 ? 2.5 : 3.8;
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
      roughness: 0.35,
      metalness: 0.2,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    group.cactusMat = cactusMat;

    const height = 2.6 + Math.random() * 0.8;
    const stemGeom = new THREE.BoxGeometry(0.8, height, 0.8);
    const stem = new THREE.Mesh(stemGeom, cactusMat);
    stem.position.y = height / 2;
    stem.castShadow = true;
    group.add(stem);

    // Glowing core crystal (sleek, un-cluttered)
    const coreGeom = new THREE.BoxGeometry(0.25, height * 0.75, 0.25);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0 });
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.position.y = height / 2;
    group.add(core);
    group.coreMat = coreMat;

    const armGeomH = new THREE.BoxGeometry(0.8, 0.5, 0.5);
    const armGeomV = new THREE.BoxGeometry(0.5, 0.9, 0.5);

    const leftArmH = new THREE.Mesh(armGeomH, cactusMat);
    leftArmH.position.set(-0.6, height * 0.45, 0);
    const leftArmV = new THREE.Mesh(armGeomV, cactusMat);
    leftArmV.position.set(-0.9, height * 0.45 + 0.45, 0);
    group.add(leftArmH);
    group.add(leftArmV);

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
      roughness: 0.35,
      metalness: 0.3,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    group.pteroMat = pteroMat;

    const bodyGeom = new THREE.BoxGeometry(0.6, 0.6, 1.6);
    const body = new THREE.Mesh(bodyGeom, pteroMat);
    group.add(body);

    const headGeom = new THREE.BoxGeometry(0.5, 0.5, 1.2);
    const head = new THREE.Mesh(headGeom, pteroMat);
    head.position.set(0, 0.2, 1.1);
    group.add(head);

    const eyeGeom = new THREE.BoxGeometry(0.12, 0.12, 0.25);
    const pteroEyeMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    const pEyeL = new THREE.Mesh(eyeGeom, pteroEyeMat);
    pEyeL.position.set(-0.26, 0.35, 1.2);
    const pEyeR = new THREE.Mesh(eyeGeom, pteroEyeMat);
    pEyeR.position.set(0.26, 0.35, 1.2);
    group.add(pEyeL);
    group.add(pEyeR);
    group.eyeMat = pteroEyeMat;

    const wingGeom = new THREE.BoxGeometry(2.0, 0.15, 0.9);
    const leftWing = new THREE.Mesh(wingGeom, pteroMat);
    leftWing.position.set(-1.1, 0.2, 0);
    group.add(leftWing);
    group.leftWing = leftWing;

    const rightWing = new THREE.Mesh(wingGeom, pteroMat);
    rightWing.position.set(1.1, 0.2, 0);
    group.add(rightWing);
    group.rightWing = rightWing;

    return group;
  }

  emitDust(count = 1) {
    for (let c = 0; c < count; c++) {
      const p = this.dustParticles.find((part) => !part.mesh.visible);
      if (!p) break;
      p.mesh.visible = true;
      p.life = 0;
      p.mesh.position.set(
        this.playerX + (Math.random() - 0.5) * 0.6,
        0.1,
        0.6 + Math.random() * 0.4
      );
      p.vx = (Math.random() - 0.5) * 2;
      p.vy = Math.random() * 1.5 + 1.0;
      p.vz = 3 + Math.random() * 3;
      p.mat.color.set(this.laneMat.color);
    }
  }

  /**
   * Continuous, buttery-smooth color palette interpolation.
   * Longer phases:
   * Phase 0: 0 -> 300
   * Phase 1: 300 -> 850
   * Phase 2: 850 -> 1600
   * Phase 3: 1600 -> 2600
   * Phase 4: 2600+
   */
  updateColors(dt) {
    // Calculate continuous phase index (0.0 to 4.0)
    let targetProgress = 0;
    if (this.score < 300) {
      targetProgress = this.score / 300; // 0.0 -> 1.0
    } else if (this.score < 850) {
      targetProgress = 1.0 + (this.score - 300) / 550; // 1.0 -> 2.0
    } else if (this.score < 1600) {
      targetProgress = 2.0 + (this.score - 850) / 750; // 2.0 -> 3.0
    } else if (this.score < 2600) {
      targetProgress = 3.0 + (this.score - 1600) / 1000; // 3.0 -> 4.0
    } else {
      targetProgress = 4.0;
    }

    // Smooth low-pass damping (no sudden jumps!)
    this.colorProgress += (targetProgress - this.colorProgress) * Math.min(1.0, dt * 1.5);

    const cp = Math.max(0, Math.min(4.0, this.colorProgress));
    this.applyTheme(cp);

    // Discrete phase index for HUD and Lyria Music
    const phase = Math.floor(cp);
    if (phase !== this.currentPhase) {
      this.currentPhase = phase;
      sounds.playPhaseUp();
      if (this.onPhaseChange) {
        this.onPhaseChange(phase, this.getPhaseName(phase));
      }
    }
  }

  applyTheme(progress) {
    const idx0 = Math.floor(progress);
    const idx1 = Math.min(THEMES.length - 1, idx0 + 1);
    const t = progress - idx0;

    const t0 = THEMES[idx0];
    const t1 = THEMES[idx1];

    // Lerp Sky & Fog
    const skyCol = t0.sky.clone().lerp(t1.sky, t);
    this.scene.background = skyCol;
    if (this.scene.fog) {
      this.scene.fog.color = skyCol;
      this.scene.fog.density = t0.fogDensity + (t1.fogDensity - t0.fogDensity) * t;
    }

    // Lerp Track & Ground
    this.trackMat.color.lerpColors(t0.track, t1.track, t);
    this.outerGroundMat.color.lerpColors(t0.ground, t1.ground, t);

    // Lerp Lane & Rails
    this.laneMat.color.lerpColors(t0.lane, t1.lane, t);
    this.railMatL.color.lerpColors(t0.railL, t1.railL, t);
    this.railMatR.color.lerpColors(t0.railR, t1.railR, t);
    this.pylonMat.color.lerpColors(t0.lane, t1.lane, t);

    // Lerp Dino Body & Spines
    this.dinoMat.color.lerpColors(t0.dino, t1.dino, t);
    const dinoEmissive = t0.dinoEmissive.clone().lerp(t1.dinoEmissive, t);
    const dinoEmissiveInt = t0.dinoEmissiveInt + (t1.dinoEmissiveInt - t0.dinoEmissiveInt) * t;
    this.spineMat.emissive.copy(dinoEmissive);
    this.spineMat.emissiveIntensity = dinoEmissiveInt;
    this.eyeMat.color.lerpColors(t0.eye, t1.eye, t);

    // Lerp Obstacles
    const cactusCol = t0.cactus.clone().lerp(t1.cactus, t);
    const cactusCoreCol = t0.cactusCore.clone().lerp(t1.cactusCore, t);
    const cactusCoreOp = t0.cactusCoreOpacity + (t1.cactusCoreOpacity - t0.cactusCoreOpacity) * t;
    const pteroEmissive = t0.pteroEmissive.clone().lerp(t1.pteroEmissive, t);

    for (const obs of this.obstacles) {
      if (obs.type === 'cactus' && obs.mesh.cactusMat) {
        obs.mesh.cactusMat.color.copy(cactusCol);
        if (obs.mesh.coreMat) {
          obs.mesh.coreMat.opacity = cactusCoreOp;
          obs.mesh.coreMat.color.copy(cactusCoreCol);
        }
      } else if (obs.type === 'ptero' && obs.mesh.pteroMat) {
        obs.mesh.pteroMat.emissive.copy(pteroEmissive);
        obs.mesh.pteroMat.emissiveIntensity = dinoEmissiveInt * 0.7;
      }
    }
  }

  getPhaseName(phase) {
    switch (phase) {
      case 0: return 'CHROME AWAKENING';
      case 1: return 'NEON EMERGENCE';
      case 2: return 'SYNTHWAVE OVERDRIVE';
      case 3: return 'HYPER-CHROMATIC DRIFT';
      case 4: return 'MAXIMUM OVERDRIVE';
      default: return 'DIMENSION 3D';
    }
  }

  update(dt) {
    if (!this.active) return;

    if (this.isDead) {
      this.dinoGroup.rotation.x += dt * 5;
      this.dinoGroup.rotation.z += dt * 3;
      this.dinoGroup.position.y = Math.max(0, this.dinoGroup.position.y - dt * 5);
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

    // Gentle, progressive speed curve (capped for clean gameplay)
    this.speed = Math.min(this.maxSpeed, this.minSpeed + (this.score / 500) * 2.5);

    // Update music with current phase and speed
    const speedRatio = this.speed / this.minSpeed;
    const intensity = Math.min(1.0, this.colorProgress / 4.0);
    sounds.updateMusic(speedRatio, intensity, this.currentPhase);

    // Smooth lane movement
    const laneSmoothing = 14;
    this.playerX += (this.targetX - this.playerX) * Math.min(1, dt * laneSmoothing);

    // Subtle, elegant Dino lean
    const laneDelta = this.targetX - this.playerX;
    this.dinoGroup.rotation.z = -laneDelta * 0.12;
    this.dinoGroup.rotation.y = laneDelta * 0.08;

    // Jump & Gravity physics
    if (!this.isGrounded) {
      this.playerVy += this.gravity * dt;
      this.playerY += this.playerVy * dt;
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.playerVy = 0;
        this.isGrounded = true;
        sounds.playLand();
        this.camBounceVy = -0.1;
        this.emitDust(4);
      }
    }

    // Camera vertical landing bump (subtle spring)
    this.camBounceVy += (-this.camBounceY * 30) * dt;
    this.camBounceVy *= Math.pow(0.08, dt);
    this.camBounceY += this.camBounceVy;

    // Ducking
    if (this.isDucking && this.isGrounded) {
      this.dinoGroup.scale.set(1.2, 0.55, 1.3);
      this.headGroup.position.y = 1.4;
      this.bodyMesh.position.y = 1.1;
    } else {
      this.dinoGroup.scale.set(1.0, 1.0, 1.0);
      this.headGroup.position.y = 2.8;
      this.bodyMesh.position.y = 2.1;
    }

    this.dinoGroup.position.x = this.playerX;
    this.dinoGroup.position.y = this.playerY;

    // Running animation
    if (this.isGrounded) {
      const legAngle = Math.sin(this.animTime) * 0.85;
      this.leftLegGroup.rotation.x = legAngle;
      this.rightLegGroup.rotation.x = -legAngle;
      this.tailGroup.rotation.y = Math.sin(this.animTime * 0.5) * 0.3;
      this.headGroup.position.y = (this.isDucking ? 1.4 : 2.8) + Math.abs(Math.sin(this.animTime)) * 0.14;

      if (Math.random() < 0.35) {
        this.emitDust(1);
      }
    } else {
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
      p.mat.opacity = (1 - progress) * 0.6;
      if (p.life >= p.maxLife) {
        p.mesh.visible = false;
      }
    }

    // Update Subtle Peripheral Speed Streaks
    const streakOpacity = Math.max(0, Math.min(0.45, (this.colorProgress - 0.5) * 0.3));
    for (const s of this.speedStreaks) {
      s.mesh.position.z += (this.speed * s.baseSpeed) * dt;
      s.mat.opacity = streakOpacity;
      s.mat.color.copy(this.laneMat.color);
      if (s.mesh.position.z > 15) {
        s.mesh.position.z = -180 - Math.random() * 80;
        s.mesh.position.x = s.side * s.distX;
        s.mesh.position.y = s.y;
      }
    }

    // Scroll Lane Lines
    for (const line of this.laneLines) {
      line.position.z += this.speed * dt;
      if (line.position.z > 15) {
        line.position.z -= 240;
      }
    }

    // Scroll Beacon Pylons
    for (const pylon of this.beaconPylons) {
      pylon.position.z += this.speed * dt;
      if (pylon.position.z > 15) {
        pylon.position.z -= 220;
      }
    }

    // Scroll Clouds
    for (const cloud of this.clouds3D) {
      cloud.position.z += this.speed * 0.15 * dt;
      if (cloud.position.z > 25) {
        cloud.position.z = -200 - Math.random() * 50;
        cloud.position.x = (Math.random() - 0.5) * 110;
      }
    }

    // Spawn new obstacles
    const minZ = Math.min(...this.obstacles.map((o) => o.mesh.position.z), 0);
    if (minZ > -180) {
      const nextZ = minZ - (28 + Math.random() * 24);
      this.spawnObstacleAtZ(nextZ);
    }

    // Collision Check
    const dinoHitbox = {
      x: this.playerX,
      y: this.playerY + (this.isDucking ? 0.65 : 1.4),
      z: 0,
      width: 1.3,
      height: this.isDucking ? 1.15 : 2.6,
      depth: 2.0,
    };

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.mesh.position.z += this.speed * dt;

      if (obs.type === 'ptero') {
        const flap = Math.sin(this.animTime * 1.5) * 0.7;
        obs.mesh.leftWing.rotation.z = flap;
        obs.mesh.rightWing.rotation.z = -flap;
      }

      const dz = Math.abs(obs.mesh.position.z - dinoHitbox.z);
      const dx = Math.abs(obs.mesh.position.x - dinoHitbox.x);

      let dyOverlap = false;
      if (obs.type === 'cactus') {
        dyOverlap = this.playerY < 2.3;
      } else {
        if (this.isDucking && obs.y >= 2.4) {
          dyOverlap = false;
        } else {
          dyOverlap = Math.abs(obs.mesh.position.y - dinoHitbox.y) < 1.4;
        }
      }

      if (dz < 1.3 && dx < 1.2 && dyOverlap) {
        this.die();
        return;
      }

      if (obs.mesh.position.z > 20) {
        this.group.remove(obs.mesh);
        this.obstacles.splice(i, 1);
      }
    }

    // Smooth Continuous Color Transitions
    this.updateColors(dt);

    // Subtle FOV widening (50 -> 58)
    const targetFOV = this.baseFOV + (this.speed - this.minSpeed) * 0.25;
    this.camera.fov += (targetFOV - this.camera.fov) * dt * 3;
    this.camera.updateProjectionMatrix();

    // Silky smooth camera follow (elevated slightly above Dino for enhanced track visibility)
    const targetCamX = this.playerX * 0.38;
    this.camera.position.x += (targetCamX - this.camera.position.x) * dt * 8;
    this.camera.position.y = 7.0 + (this.playerY * 0.25) + this.camBounceY;
    this.camera.position.z = 9.2;

    // Reset roll to ensure crystal-clear stability
    this.camera.rotation.z = 0;

    this.camera.lookAt(
      this.playerX * 0.2,
      1.8 + this.playerY * 0.15 + this.camBounceY * 0.5,
      -12
    );
  }

  die() {
    this.isDead = true;
    sounds.playHit();
    sounds.stopMusic(true);
    if (this.onDeath) {
      this.onDeath(this.score);
    }
  }

  hide() {
    this.active = false;
    this.group.visible = false;
    sounds.stopMusic(false);
  }

  show() {
    this.group.visible = true;
  }
}
