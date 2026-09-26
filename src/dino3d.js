import * as THREE from 'three';
import { sounds } from './audio.js';

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
    this.maxSpeed = 62;
    this.distance = 0;
    this.score = 0;
    this.baseFOV = 50;

    this.obstacles = [];
    this.cyberGates = [];
    this.nextObstacleZ = -40;
    this.nextGateZ = -50;
    this.active = false;
    this.isDead = false;

    this.animTime = 0;
    this.colorProgress = 0; // 0.0 (grey chrome) to 1.0 (full chromatic neon hyperdrive)
    this.currentPhase = 0;

    // Camera dynamic effects
    this.camBounceY = 0;
    this.camBounceVy = 0;
    this.camRollZ = 0;

    // Particle pools
    this.dustParticles = [];
    this.speedStreaks = [];
    this.trailParticles = [];
    this.ringShockwaves = [];

    this.initEnvironment();
    this.buildDinoMesh();
    this.initSpeedStreaks();
    this.initCyberGates();
    this.initShockwaves();
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
    this.updateColors(0);

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
    if (progress < 0.25) {
      // Shiver / shake slightly
      const sh = (Math.random() - 0.5) * 0.06;
      this.dinoGroup.position.x = sh;
      this.dinoGroup.rotation.y = Math.PI / 2 + sh;
      this.headGroup.position.y = 2.1;
      this.headGroup.rotation.x = 0.5;
    } else if (progress < 0.65) {
      const p = (progress - 0.25) / 0.4;
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

      if (p > 0.5 && p < 0.55 && Math.random() < 0.5) {
        this.emitDust();
      }
    } else {
      const p = (progress - 0.65) / 0.35;
      const ease = p * p * (3 - 2 * p);

      // Smooth 90 degree body turn from profile to back facing camera!
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

    // Materials - will dynamically transition into cyberpunk neon materials!
    this.dinoMat = new THREE.MeshStandardMaterial({
      color: 0x535353,
      roughness: 0.45,
      metalness: 0.15,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    this.bellyMat = new THREE.MeshStandardMaterial({
      color: 0x6e6e6e,
      roughness: 0.5,
      metalness: 0.1,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.spineMat = new THREE.MeshStandardMaterial({
      color: 0x535353,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0x00ffff,
      emissiveIntensity: 0.0,
    });

    // Torso / Body
    const bodyGeom = new THREE.BoxGeometry(1.6, 2.0, 2.4);
    this.bodyMesh = new THREE.Mesh(bodyGeom, this.dinoMat);
    this.bodyMesh.position.y = 2.1;
    this.bodyMesh.castShadow = true;
    this.dinoGroup.add(this.bodyMesh);

    // Cyber dorsal plates / spines (wake up with neon light!)
    this.spines = [];
    const spineGeom = new THREE.ConeGeometry(0.2, 0.45, 4);
    spineGeom.rotateX(Math.PI / 2);
    for (let s = -0.8; s <= 0.8; s += 0.4) {
      const spine = new THREE.Mesh(spineGeom, this.spineMat);
      spine.position.set(0, 3.2, s);
      spine.castShadow = true;
      this.dinoGroup.add(spine);
      this.spines.push(spine);
    }

    // Belly patch
    const bellyGeom = new THREE.BoxGeometry(1.4, 1.4, 0.2);
    const belly = new THREE.Mesh(bellyGeom, this.bellyMat);
    belly.position.set(0, 1.9, -1.25);
    this.dinoGroup.add(belly);

    // Tail (segmented for swing)
    this.tailGroup = new THREE.Group();
    this.tailGroup.position.set(0, 2.1, 1.2);
    const tailGeom1 = new THREE.BoxGeometry(0.9, 0.9, 1.2);
    const tailMesh1 = new THREE.Mesh(tailGeom1, this.dinoMat);
    tailMesh1.position.z = 0.6;
    tailMesh1.castShadow = true;
    this.tailGroup.add(tailMesh1);

    const tailGeom2 = new THREE.BoxGeometry(0.5, 0.5, 1.0);
    const tailMesh2 = new THREE.Mesh(tailGeom2, this.dinoMat);
    tailMesh2.position.z = 1.6;
    tailMesh2.castShadow = true;
    this.tailGroup.add(tailMesh2);
    this.dinoGroup.add(this.tailGroup);

    // Neck & Head
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 2.8, -1.0);

    const neckGeom = new THREE.BoxGeometry(1.0, 1.0, 0.8);
    const neck = new THREE.Mesh(neckGeom, this.dinoMat);
    neck.position.set(0, 0.4, -0.2);
    neck.castShadow = true;
    this.headGroup.add(neck);

    const headGeom = new THREE.BoxGeometry(1.3, 1.2, 1.8);
    const head = new THREE.Mesh(headGeom, this.dinoMat);
    head.position.set(0, 1.1, -0.7);
    head.castShadow = true;
    this.headGroup.add(head);

    // Snout / Jaw
    const jawGeom = new THREE.BoxGeometry(1.1, 0.4, 1.0);
    const jaw = new THREE.Mesh(jawGeom, this.dinoMat);
    jaw.position.set(0, 0.6, -1.4);
    this.headGroup.add(jaw);

    // Glowing Cyber Eyes
    const eyeGeom = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    this.eyeL = new THREE.Mesh(eyeGeom, this.eyeMat);
    this.eyeL.position.set(-0.68, 1.3, -0.7);
    this.eyeR = new THREE.Mesh(eyeGeom, this.eyeMat);
    this.eyeR.position.set(0.68, 1.3, -0.7);
    this.headGroup.add(this.eyeL);
    this.headGroup.add(this.eyeR);

    this.dinoGroup.add(this.headGroup);

    // Left Leg
    this.leftLegGroup = new THREE.Group();
    this.leftLegGroup.position.set(-0.65, 1.4, 0);
    const legGeom = new THREE.BoxGeometry(0.4, 1.4, 0.5);
    const leftLegMesh = new THREE.Mesh(legGeom, this.dinoMat);
    leftLegMesh.position.y = -0.7;
    leftLegMesh.castShadow = true;
    this.leftLegGroup.add(leftLegMesh);

    const footGeom = new THREE.BoxGeometry(0.5, 0.3, 0.8);
    const leftFoot = new THREE.Mesh(footGeom, this.dinoMat);
    leftFoot.position.set(0, -1.35, -0.2);
    this.leftLegGroup.add(leftFoot);
    this.dinoGroup.add(this.leftLegGroup);

    // Right Leg
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

    // Tiny T-Rex Arms
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

    // Create Dust / Energy Particle Pool
    const pGeom = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    for (let i = 0; i < 30; i++) {
      const pMat = new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.7 });
      const p = new THREE.Mesh(pGeom, pMat);
      p.visible = false;
      this.group.add(p);
      this.dustParticles.push({
        mesh: p,
        mat: pMat,
        life: 0,
        maxLife: 0.45,
        vx: 0,
        vy: 0,
        vz: 0,
      });
    }

    // Trail photon particles (behind dino)
    const tGeom = new THREE.SphereGeometry(0.12, 6, 6);
    for (let i = 0; i < 40; i++) {
      const tMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.8 });
      const t = new THREE.Mesh(tGeom, tMat);
      t.visible = false;
      this.group.add(t);
      this.trailParticles.push({
        mesh: t,
        mat: tMat,
        life: 0,
        maxLife: 0.35,
        vx: 0,
        vy: 0,
        vz: 0,
      });
    }
  }

  initSpeedStreaks() {
    // Speed laser streaks flying past the player
    this.speedStreakGroup = new THREE.Group();
    this.group.add(this.speedStreakGroup);

    const streakGeom = new THREE.CylinderGeometry(0.04, 0.04, 5, 4);
    streakGeom.rotateX(Math.PI / 2);

    for (let i = 0; i < 65; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0,
      });
      const streak = new THREE.Mesh(streakGeom, mat);
      streak.position.set(
        (Math.random() - 0.5) * 36,
        1 + Math.random() * 14,
        -Math.random() * 220
      );
      this.speedStreakGroup.add(streak);
      this.speedStreaks.push({
        mesh: streak,
        mat,
        baseSpeed: 1.4 + Math.random() * 0.8,
        laneOffset: (Math.random() - 0.5) * 36,
        y: 1 + Math.random() * 14,
      });
    }
  }

  initCyberGates() {
    // Overhead glowing neon cyber-portals that the player zooms through!
    this.gateGroup = new THREE.Group();
    this.group.add(this.gateGroup);

    const gateMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.8,
    });
    this.gateMaterial = gateMat;

    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      // Left pillar
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.6), gateMat);
      p1.position.set(-6.5, 4.5, 0);
      g.add(p1);
      // Right pillar
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.6), gateMat);
      p2.position.set(6.5, 4.5, 0);
      g.add(p2);
      // Top beam
      const top = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.6, 0.6), gateMat);
      top.position.set(0, 9, 0);
      g.add(top);

      // Neon glowing chevron accent
      const chevron = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.3, 0.7),
        new THREE.MeshBasicMaterial({ color: 0xff007f })
      );
      chevron.position.set(0, 8.7, 0);
      g.add(chevron);
      g.chevronMat = chevron.material;

      g.position.set(0, 0, -40 - i * 65);
      this.gateGroup.add(g);
      this.cyberGates.push(g);
    }
  }

  initShockwaves() {
    // Expanding circular shockwaves for landing impact and color bursts
    const ringGeom = new THREE.RingGeometry(0.3, 0.6, 24);
    ringGeom.rotateX(-Math.PI / 2);

    for (let i = 0; i < 4; i++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.set(0, 0.05, 0);
      ring.visible = false;
      this.group.add(ring);
      this.ringShockwaves.push({
        mesh: ring,
        mat: ringMat,
        scale: 1,
        life: 0,
        maxLife: 0.35,
      });
    }
  }

  triggerShockwave(x, colorHex = 0x00f0ff) {
    const sw = this.ringShockwaves.find((r) => !r.mesh.visible);
    if (!sw) return;
    sw.mesh.position.set(x, 0.06, 0);
    sw.mesh.scale.set(1, 1, 1);
    sw.mat.color.setHex(colorHex);
    sw.mat.opacity = 0.9;
    sw.life = 0;
    sw.mesh.visible = true;
  }

  initEnvironment() {
    const trackWidth = 14;
    const trackLength = 280;

    // Track Material (will dynamically gain animated neon grid lines)
    const trackGeom = new THREE.PlaneGeometry(trackWidth, trackLength, 1, 30);
    this.trackMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f5,
      roughness: 0.8,
      metalness: 0.2,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    this.trackMesh = new THREE.Mesh(trackGeom, this.trackMat);
    this.trackMesh.rotation.x = -Math.PI / 2;
    this.trackMesh.position.set(0, 0, -trackLength / 2 + 10);
    this.trackMesh.receiveShadow = true;
    this.group.add(this.trackMesh);

    // Glowing Neon Side Rails
    const railGeom = new THREE.BoxGeometry(0.2, 0.3, trackLength);
    this.railMatL = new THREE.MeshBasicMaterial({ color: 0xdedede });
    this.railMatR = new THREE.MeshBasicMaterial({ color: 0xdedede });

    const railL = new THREE.Mesh(railGeom, this.railMatL);
    railL.position.set(-trackWidth / 2, 0.15, -trackLength / 2 + 10);
    this.group.add(railL);

    const railR = new THREE.Mesh(railGeom, this.railMatR);
    railR.position.set(trackWidth / 2, 0.15, -trackLength / 2 + 10);
    this.group.add(railR);

    // Desert / Synthwave Outer Ground
    const groundGeom = new THREE.PlaneGeometry(220, trackLength, 20, 20);
    this.outerGroundMat = new THREE.MeshStandardMaterial({
      color: 0xededed,
      roughness: 0.95,
      metalness: 0.1,
      wireframe: false,
    });
    this.outerGround = new THREE.Mesh(groundGeom, this.outerGroundMat);
    this.outerGround.rotation.x = -Math.PI / 2;
    this.outerGround.position.set(0, -0.05, -trackLength / 2 + 10);
    this.group.add(this.outerGround);

    // Lane division markers (subtle dashes that turn into laser strips)
    this.laneLines = [];
    this.laneMat = new THREE.MeshBasicMaterial({ color: 0xdedede });
    for (let z = -220; z < 20; z += 12) {
      [-1.9, 1.9].forEach((lx) => {
        const lineGeom = new THREE.PlaneGeometry(0.18, 4.2);
        const line = new THREE.Mesh(lineGeom, this.laneMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(lx, 0.02, z);
        this.group.add(line);
        this.laneLines.push(line);
      });
    }

    // Clouds in the 3D sky (fade into cyber aurora / stars as dimension transforms)
    this.clouds3D = [];
    this.cloudMat = new THREE.MeshBasicMaterial({ color: 0xdbdbdb });
    for (let i = 0; i < 18; i++) {
      const cg = new THREE.Group();
      const numPuffs = 3 + Math.floor(Math.random() * 3);
      for (let p = 0; p < numPuffs; p++) {
        const puffGeom = new THREE.BoxGeometry(
          2.5 + Math.random() * 2,
          1.2 + Math.random() * 0.8,
          2.5 + Math.random() * 2
        );
        const puff = new THREE.Mesh(puffGeom, this.cloudMat);
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

    // Dynamic colored point lights that dance alongside the player
    this.neonLightL = new THREE.PointLight(0x00f0ff, 0, 25);
    this.neonLightL.position.set(-6, 3, 0);
    this.group.add(this.neonLightL);

    this.neonLightR = new THREE.PointLight(0xff007f, 0, 25);
    this.neonLightR.position.set(6, 3, 0);
    this.group.add(this.neonLightR);
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

    // Start dynamic synthwave music!
    sounds.startMusic();
  }

  moveLeft() {
    if (!this.active || this.isDead) return;
    if (this.currentLane > 0) {
      this.currentLane--;
      this.targetX = this.lanes[this.currentLane];
      sounds.playWhoosh();
      // Dynamic camera roll bump
      this.camRollZ = 0.04;
      this.emitTurnSparks();
    }
  }

  moveRight() {
    if (!this.active || this.isDead) return;
    if (this.currentLane < this.lanes.length - 1) {
      this.currentLane++;
      this.targetX = this.lanes[this.currentLane];
      sounds.playWhoosh();
      // Dynamic camera roll bump
      this.camRollZ = -0.04;
      this.emitTurnSparks();
    }
  }

  jump() {
    if (!this.active || this.isDead) return;
    if (this.isGrounded) {
      this.playerVy = this.jumpForce;
      this.isGrounded = false;
      sounds.playJump();
      this.triggerShockwave(this.playerX, this.getCurrentNeonColor(0));
      this.emitDust(8);
    }
  }

  setDucking(ducking) {
    if (!this.active || this.isDead) return;
    this.isDucking = ducking;
    if (ducking && !this.isGrounded) {
      this.playerVy -= 16; // Fast dive
      this.camBounceVy = -0.2;
    }
  }

  getCurrentNeonColor(offset = 0) {
    // Dynamic synthwave / chromatic color palette based on time and color progress
    const t = this.animTime * 0.4 + offset;
    const hue = (t * 0.15) % 1.0;
    const col = new THREE.Color();
    col.setHSL(hue, 1.0, 0.55);
    return col.getHex();
  }

  spawnObstacleAtZ(z) {
    const lane = Math.floor(Math.random() * 3);
    const laneX = this.lanes[lane];
    const isPtero = this.score > 160 && Math.random() < 0.38;

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
    // Material starts classic grey and becomes an obsidian/emerald glowing crystal!
    const cactusMat = new THREE.MeshStandardMaterial({
      color: 0x535353,
      roughness: 0.3,
      metalness: 0.3,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    group.cactusMat = cactusMat;

    const height = 2.6 + Math.random() * 0.8;
    // Central stem
    const stemGeom = new THREE.BoxGeometry(0.8, height, 0.8);
    const stem = new THREE.Mesh(stemGeom, cactusMat);
    stem.position.y = height / 2;
    stem.castShadow = true;
    group.add(stem);

    // Glowing core crystal
    const coreGeom = new THREE.BoxGeometry(0.3, height * 0.8, 0.3);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0 });
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.position.y = height / 2;
    group.add(core);
    group.coreMat = coreMat;

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
      metalness: 0.4,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    group.pteroMat = pteroMat;

    // Body
    const bodyGeom = new THREE.BoxGeometry(0.6, 0.6, 1.6);
    const body = new THREE.Mesh(bodyGeom, pteroMat);
    group.add(body);

    // Head and Beak facing player
    const headGeom = new THREE.BoxGeometry(0.5, 0.5, 1.2);
    const head = new THREE.Mesh(headGeom, pteroMat);
    head.position.set(0, 0.2, 1.1);
    group.add(head);

    // Glowing laser eyes
    const eyeGeom = new THREE.BoxGeometry(0.12, 0.12, 0.3);
    const pteroEyeMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    const pEyeL = new THREE.Mesh(eyeGeom, pteroEyeMat);
    pEyeL.position.set(-0.26, 0.35, 1.2);
    const pEyeR = new THREE.Mesh(eyeGeom, pteroEyeMat);
    pEyeR.position.set(0.26, 0.35, 1.2);
    group.add(pEyeL);
    group.add(pEyeR);
    group.eyeMat = pteroEyeMat;

    // Left Wing (with neon laser leading edge)
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

  emitDust(count = 1) {
    for (let c = 0; c < count; c++) {
      const p = this.dustParticles.find((part) => !part.mesh.visible);
      if (!p) break;
      p.mesh.visible = true;
      p.life = 0;
      p.mesh.position.set(
        this.playerX + (Math.random() - 0.5) * 0.9,
        0.12,
        0.6 + Math.random() * 0.4
      );
      p.vx = (Math.random() - 0.5) * 3;
      p.vy = Math.random() * 2.5 + 1.2;
      p.vz = 4 + Math.random() * 5;

      // Color tints with progress
      if (this.colorProgress > 0.15) {
        const hex = this.getCurrentNeonColor(Math.random());
        p.mat.color.setHex(hex);
      } else {
        p.mat.color.setHex(0x999999);
      }
    }
  }

  emitTurnSparks() {
    for (let i = 0; i < 6; i++) {
      const p = this.dustParticles.find((part) => !part.mesh.visible);
      if (!p) break;
      p.mesh.visible = true;
      p.life = 0;
      p.mesh.position.set(
        this.playerX + (Math.random() - 0.5) * 0.4,
        0.2,
        (Math.random() - 0.5) * 0.6
      );
      const dir = (this.targetX - this.playerX) > 0 ? 1 : -1;
      p.vx = dir * (Math.random() * 4 + 2);
      p.vy = Math.random() * 2 + 1;
      p.vz = Math.random() * 3 + 2;

      const hex = this.colorProgress > 0.2 ? this.getCurrentNeonColor(i * 0.2) : 0xcccccc;
      p.mat.color.setHex(hex);
    }
  }

  emitTrailPhoton() {
    const t = this.trailParticles.find((p) => !p.mesh.visible);
    if (!t) return;
    t.mesh.visible = true;
    t.life = 0;
    t.mesh.position.set(
      this.playerX + (Math.random() - 0.5) * 0.6,
      this.playerY + 0.5 + Math.random() * 1.4,
      1.8 + Math.random() * 0.4
    );
    t.vx = (Math.random() - 0.5) * 0.8;
    t.vy = (Math.random() - 0.5) * 0.8;
    t.vz = this.speed * 0.4;

    const hex = this.getCurrentNeonColor(this.animTime * 0.5);
    t.mat.color.setHex(hex);
  }

  updateColors(dt) {
    // Score determines color progress:
    // 0 -> 0.0 (Pure Chrome monochrome)
    // 80 -> 0.2 (Neon Dawn)
    // 250 -> 0.5 (Synthwave Overdrive)
    // 550 -> 0.8 (Hyper-Chromatic Drift)
    // 900+ -> 1.0 (Maximum Overdrive)
    const targetColorProgress = Math.min(1.0, this.score / 750);
    this.colorProgress += (targetColorProgress - this.colorProgress) * Math.min(1.0, dt * 2.0);

    const cp = this.colorProgress;

    // Check phase transition
    let phase = 0;
    if (this.score >= 800) phase = 4;
    else if (this.score >= 480) phase = 3;
    else if (this.score >= 220) phase = 2;
    else if (this.score >= 70) phase = 1;

    if (phase !== this.currentPhase) {
      this.currentPhase = phase;
      sounds.playPhaseUp();
      this.triggerShockwave(this.playerX, 0xffffff);
      if (this.onPhaseChange) {
        this.onPhaseChange(phase, this.getPhaseName(phase));
      }
    }

    // Sky & Fog dynamic transition:
    // Start: #f7f7f7 (white/grey Chrome)
    // End: #0b0716 (deep synthwave indigo/purple night)
    const skyDay = new THREE.Color(0xf7f7f7);
    const skyNight = new THREE.Color(0x0c0718);
    const currentSky = skyDay.clone().lerp(skyNight, Math.min(1.0, cp * 1.2));
    this.scene.background = currentSky;
    if (this.scene.fog) {
      this.scene.fog.color = currentSky;
      // Thicken fog slightly at high speed for tunnel feel
      this.scene.fog.density = 0.012 + cp * 0.005;
    }

    // Track surface: transitions from #f5f5f5 to #120e24 synthwave tarmac
    const trackDay = new THREE.Color(0xf5f5f5);
    const trackCyber = new THREE.Color(0x130e24);
    this.trackMat.color.lerpColors(trackDay, trackCyber, cp);
    this.trackMat.roughness = 0.85 - cp * 0.35; // Becomes sleek and reflective!
    this.trackMat.metalness = 0.15 + cp * 0.45;

    // Outer Ground: transitions from #ededed to #07050d
    const groundDay = new THREE.Color(0xededed);
    const groundCyber = new THREE.Color(0x080511);
    this.outerGroundMat.color.lerpColors(groundDay, groundCyber, cp);

    // Glowing Neon Lane Dashes: transition from #dedede to pulsating cyan/magenta
    const neonCyan = new THREE.Color(0x00f0ff);
    const neonPink = new THREE.Color(0xff007f);
    const lineDay = new THREE.Color(0xdedede);

    // Pulse wave along track
    const lineCol = lineDay.clone().lerp(neonCyan, Math.min(1.0, cp * 1.5));
    this.laneMat.color.copy(lineCol);

    // Side Rails glow
    const railColL = lineDay.clone().lerp(neonPink, Math.min(1.0, cp * 1.4));
    const railColR = lineDay.clone().lerp(neonCyan, Math.min(1.0, cp * 1.4));
    this.railMatL.color.copy(railColL);
    this.railMatR.color.copy(railColR);

    // Dino Cyber Transformation:
    // Torso transitions from charcoal #535353 to sleek cyber obsidian #181926
    const dinoGrey = new THREE.Color(0x535353);
    const dinoCyber = new THREE.Color(0x1a1c29);
    this.dinoMat.color.lerpColors(dinoGrey, dinoCyber, cp);
    this.dinoMat.metalness = 0.15 + cp * 0.55;
    this.dinoMat.roughness = 0.45 - cp * 0.25;

    // Dino Glowing Spines
    const spineColor = new THREE.Color();
    const spineHue = (this.animTime * 0.3) % 1.0;
    spineColor.setHSL(spineHue, 1.0, 0.6);
    this.spineMat.emissive.copy(spineColor);
    this.spineMat.emissiveIntensity = cp * 1.8;

    // Dino Glowing Eyes: from white to vibrant laser cyan/magenta
    const eyeDay = new THREE.Color(0xffffff);
    const eyeCyber = new THREE.Color(0x00ffff);
    this.eyeMat.color.lerpColors(eyeDay, eyeCyber, cp);

    // Dynamic point lights: intensity scales with color progress!
    const lightIntensity = cp * 3.5;
    this.neonLightL.intensity = lightIntensity;
    this.neonLightR.intensity = lightIntensity;

    const tLight = this.animTime * 1.2;
    this.neonLightL.position.set(-6, 3 + Math.sin(tLight) * 1.5, Math.cos(tLight) * 8);
    this.neonLightR.position.set(6, 3 + Math.cos(tLight) * 1.5, -Math.sin(tLight) * 8);

    // Cyber Gates emissive glow & chevrons
    const gateCol = new THREE.Color();
    gateCol.setHSL((this.animTime * 0.2) % 1.0, 1.0, 0.55);
    this.gateMaterial.emissive.copy(gateCol);
    this.gateMaterial.emissiveIntensity = 0.3 + cp * 1.2;

    // Update obstacles dynamic neon colors
    for (const obs of this.obstacles) {
      if (obs.type === 'cactus' && obs.mesh.cactusMat) {
        const cCol = dinoGrey.clone().lerp(new THREE.Color(0x08261e), cp);
        obs.mesh.cactusMat.color.copy(cCol);
        obs.mesh.cactusMat.emissive.copy(spineColor);
        obs.mesh.cactusMat.emissiveIntensity = cp * 0.6;
        if (obs.mesh.coreMat) {
          obs.mesh.coreMat.opacity = cp * 0.85;
          obs.mesh.coreMat.color.copy(spineColor);
        }
      } else if (obs.type === 'ptero' && obs.mesh.pteroMat) {
        obs.mesh.pteroMat.emissive.setHex(0xff0044);
        obs.mesh.pteroMat.emissiveIntensity = cp * 0.8;
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
      this.triggerShockwave(this.playerX, 0xffff00);
    }

    // Speed progression: accelerates up to maxSpeed
    this.speed = Math.min(this.maxSpeed, this.minSpeed + (this.score / 280) * 3);

    // Update dynamic procedural or Lyria music with current speed & color progress & phase
    const speedRatio = this.speed / this.minSpeed;
    sounds.updateMusic(speedRatio, this.colorProgress, this.currentPhase);

    // Smooth lane interpolation
    const laneSmoothing = 15;
    this.playerX += (this.targetX - this.playerX) * Math.min(1, dt * laneSmoothing);

    // Dino Banking / roll tilt when switching lanes
    const laneDelta = this.targetX - this.playerX;
    this.dinoGroup.rotation.z = -laneDelta * 0.18;
    this.dinoGroup.rotation.y = laneDelta * 0.12;

    // Jump / Gravity physics
    if (!this.isGrounded) {
      this.playerVy += this.gravity * dt;
      this.playerY += this.playerVy * dt;
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.playerVy = 0;
        this.isGrounded = true;

        // Meaty landing juice!
        sounds.playLand();
        this.camBounceVy = -0.15; // Camera dip & rebound
        this.triggerShockwave(this.playerX, this.getCurrentNeonColor(0));
        this.emitDust(6);
      }
    }

    // Camera bounce physics (spring-damper)
    this.camBounceVy += (-this.camBounceY * 35) * dt;
    this.camBounceVy *= Math.pow(0.05, dt);
    this.camBounceY += this.camBounceVy;

    // Camera roll recovery
    this.camRollZ *= Math.pow(0.01, dt);

    // Ducking squash & stretch
    if (this.isDucking && this.isGrounded) {
      this.dinoGroup.scale.set(1.25, 0.52, 1.35);
      this.headGroup.position.y = 1.35;
      this.bodyMesh.position.y = 1.05;
    } else {
      this.dinoGroup.scale.set(1.0, 1.0, 1.0);
      this.headGroup.position.y = 2.8;
      this.bodyMesh.position.y = 2.1;
    }

    // Position Dino
    this.dinoGroup.position.x = this.playerX;
    this.dinoGroup.position.y = this.playerY;

    // Leg running cycle & tail animation
    if (this.isGrounded) {
      const legAngle = Math.sin(this.animTime) * 0.9;
      this.leftLegGroup.rotation.x = legAngle;
      this.rightLegGroup.rotation.x = -legAngle;
      this.tailGroup.rotation.y = Math.sin(this.animTime * 0.5) * 0.35;
      this.headGroup.position.y = (this.isDucking ? 1.35 : 2.8) + Math.abs(Math.sin(this.animTime)) * 0.18;

      // Dust & trail particles
      if (Math.random() < 0.45) {
        this.emitDust(1);
      }
    } else {
      this.leftLegGroup.rotation.x = -0.65;
      this.rightLegGroup.rotation.x = 0.45;
    }

    // Emit photon trail when in color phases
    if (this.colorProgress > 0.2 && Math.random() < 0.7) {
      this.emitTrailPhoton();
    }

    // Update Dust Particles
    for (const p of this.dustParticles) {
      if (!p.mesh.visible) continue;
      p.life += dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const progress = p.life / p.maxLife;
      p.mat.opacity = (1 - progress) * 0.75;
      p.mesh.scale.setScalar(1 + progress * 0.9);
      if (p.life >= p.maxLife) {
        p.mesh.visible = false;
      }
    }

    // Update Trail Photon Particles
    for (const t of this.trailParticles) {
      if (!t.mesh.visible) continue;
      t.life += dt;
      t.mesh.position.x += t.vx * dt;
      t.mesh.position.y += t.vy * dt;
      t.mesh.position.z += t.vz * dt;
      const progress = t.life / t.maxLife;
      t.mat.opacity = (1 - progress) * 0.85;
      t.mesh.scale.setScalar((1 - progress * 0.5) * (1 + this.colorProgress * 0.5));
      if (t.life >= t.maxLife) {
        t.mesh.visible = false;
      }
    }

    // Update Ring Shockwaves
    for (const sw of this.ringShockwaves) {
      if (!sw.mesh.visible) continue;
      sw.life += dt;
      const p = sw.life / sw.maxLife;
      sw.mesh.scale.setScalar(1 + p * 6);
      sw.mat.opacity = (1 - p) * 0.85;
      if (sw.life >= sw.maxLife) {
        sw.mesh.visible = false;
      }
    }

    // Update Speed Streaks (dynamic warp tunnel effect)
    const streakOpacity = Math.max(0, (this.colorProgress - 0.1) * 1.2);
    for (const s of this.speedStreaks) {
      s.mesh.position.z += (this.speed * s.baseSpeed) * dt;
      s.mat.opacity = streakOpacity * 0.65;
      if (this.colorProgress > 0.25) {
        s.mat.color.setHex(this.getCurrentNeonColor(s.mesh.position.y));
      }
      if (s.mesh.position.z > 15) {
        s.mesh.position.z = -180 - Math.random() * 80;
        s.mesh.position.x = s.laneOffset;
        s.mesh.position.y = s.y;
      }
    }

    // Update Cyber Gates
    for (const g of this.cyberGates) {
      g.position.z += this.speed * dt;
      // Pulse gate chevrons
      if (g.chevronMat) {
        g.chevronMat.color.setHex(this.getCurrentNeonColor(g.position.z * 0.05));
      }
      if (g.position.z > 20) {
        g.position.z -= 320;
      }
    }

    // Scroll Lane Lines
    for (const line of this.laneLines) {
      line.position.z += this.speed * dt;
      if (line.position.z > 15) {
        line.position.z -= 240;
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
      const nextZ = minZ - (26 + Math.random() * 22);
      this.spawnObstacleAtZ(nextZ);
    }

    // Update Obstacles & Collision Check
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

      // Pterodactyl wing flapping
      if (obs.type === 'ptero') {
        const flap = Math.sin(this.animTime * 1.6) * 0.75;
        obs.mesh.leftWing.rotation.z = flap;
        obs.mesh.rightWing.rotation.z = -flap;
      }

      // Check collision
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

      // Remove obstacles behind camera
      if (obs.mesh.position.z > 20) {
        this.group.remove(obs.mesh);
        this.obstacles.splice(i, 1);
      }
    }

    // Update Dynamic Colors & Shaders
    this.updateColors(dt);

    // Dynamic Camera FOV: expands from 50 to 65 at high speeds!
    const targetFOV = this.baseFOV + (this.speed - this.minSpeed) * 0.42;
    this.camera.fov += (targetFOV - this.camera.fov) * dt * 4;
    this.camera.updateProjectionMatrix();

    // Camera follow Dino smoothly with banking and bounce
    const targetCamX = this.playerX * 0.42;
    this.camera.position.x += (targetCamX - this.camera.position.x) * dt * 9;
    this.camera.position.y = 5.2 + (this.playerY * 0.3) + this.camBounceY;
    this.camera.position.z = 8.5;

    // Camera roll tilt
    this.camera.rotation.z = this.camRollZ + (-laneDelta * 0.03);

    this.camera.lookAt(
      this.playerX * 0.25,
      2.2 + this.playerY * 0.2 + this.camBounceY * 0.5,
      -10
    );
  }

  die() {
    this.isDead = true;
    sounds.playHit();
    sounds.stopMusic(true);
    this.triggerShockwave(this.playerX, 0xff0044);
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
