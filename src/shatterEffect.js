import * as THREE from 'three';
import { sounds } from './audio.js';

export class ShatterEffect {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.shardsGroup = new THREE.Group();
    this.scene.add(this.shardsGroup);
    this.shards = [];
    this.active = false;
    this.progress = 0;
    this.onComplete = null;
  }

  shatterCanvas(sourceCanvas, onComplete) {
    this.onComplete = onComplete;
    this.active = true;
    this.progress = 0;

    // Play shatter audio explosion
    sounds.playShatter();

    // Clear previous shards
    while (this.shardsGroup.children.length > 0) {
      const obj = this.shardsGroup.children[0];
      this.shardsGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }
    this.shards = [];

    // Create high-res canvas texture snapshot
    const texture = new THREE.CanvasTexture(sourceCanvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;

    // Plane dimensions in 3D world space
    const planeW = 32;
    const planeH = 10.66; // 900x300 ratio
    const cols = 16;
    const rows = 8;
    const cellW = planeW / cols;
    const cellH = planeH / rows;

    const baseMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.2,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1.0,
    });

    // Glass edge material for extrusion
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      roughness: 0.1,
      metalness: 0.6,
      transparent: true,
      opacity: 0.85,
    });

    // Subdivide into triangular/jagged shards
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Randomize vertex jitter for organic shattered glass appearance
        const jitter = () => (Math.random() - 0.5) * 0.45;

        const x0 = -planeW / 2 + c * cellW;
        const x1 = x0 + cellW;
        const y0 = planeH / 2 - r * cellH;
        const y1 = y0 - cellH;

        const u0 = c / cols;
        const u1 = (c + 1) / cols;
        const v0 = 1 - r / rows;
        const v1 = 1 - (r + 1) / rows;

        // Split each quad into 2 triangles with jagged midpoints
        this.createShardTriangle(
          [x0, y0, 0], [x1, y0, 0], [x0 + jitter(), y1 + jitter(), 0],
          [u0, v0], [u1, v0], [u0, v1],
          baseMaterial, edgeMaterial
        );

        this.createShardTriangle(
          [x1, y0, 0], [x1 + jitter(), y1, 0], [x0 + jitter(), y1 + jitter(), 0],
          [u1, v0], [u1, v1], [u0, v1],
          baseMaterial, edgeMaterial
        );
      }
    }

    // Add extra flying pixel sparks / debris
    this.createSparks(sourceCanvas);
  }

  createShardTriangle(p1, p2, p3, uv1, uv2, uv3, mat, edgeMat) {
    // Extrude triangle to give it 3D glass thickness
    const shape = new THREE.Shape();
    shape.moveTo(p1[0], p1[1]);
    shape.lineTo(p2[0], p2[1]);
    shape.lineTo(p3[0], p3[1]);
    shape.closePath();

    const depth = 0.2 + Math.random() * 0.3;
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: depth,
      bevelEnabled: true,
      bevelSegments: 1,
      steps: 1,
      bevelSize: 0.04,
      bevelThickness: 0.04,
    });

    // Custom UV assignment for face
    const pos = geom.attributes.position;
    const uvs = new Float32Array(pos.count * 2);

    // Plane boundaries for UV mapping
    const planeW = 32;
    const planeH = 10.66;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      uvs[i * 2] = (px + planeW / 2) / planeW;
      uvs[i * 2 + 1] = (py + planeH / 2) / planeH;
    }
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, [mat, edgeMat]);
    mesh.position.set(0, 0, 1.2); // Positioned slightly in front of the 3D Dino

    // Center of mass
    const cx = (p1[0] + p2[0] + p3[0]) / 3;
    const cy = (p1[1] + p2[1] + p3[1]) / 3;

    // Shatter explosion dynamics
    const distFromCenter = Math.hypot(cx, cy);
    const angle = Math.atan2(cy, cx);

    // Outward impulse + forward blast towards camera
    const speed = 12 + Math.random() * 26 + distFromCenter * 1.5;
    const vx = Math.cos(angle) * speed * (0.8 + Math.random() * 0.5);
    const vy = Math.sin(angle) * speed * (0.8 + Math.random() * 0.5) + (Math.random() * 8 + 4);
    const vz = (Math.random() * 32 + 14); // fly violently towards camera

    this.shards.push({
      mesh,
      vx,
      vy,
      vz,
      rx: (Math.random() - 0.5) * 15,
      ry: (Math.random() - 0.5) * 15,
      rz: (Math.random() - 0.5) * 15,
      gravity: -35,
    });

    this.shardsGroup.add(mesh);
  }

  createSparks(canvas) {
    const sparkCount = 80;
    const sparkGeom = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0x535353 });

    for (let i = 0; i < sparkCount; i++) {
      const spark = new THREE.Mesh(sparkGeom, sparkMat);
      spark.position.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 8, 0);

      const vx = (Math.random() - 0.5) * 35;
      const vy = Math.random() * 25 + 5;
      const vz = Math.random() * 40 + 10;

      this.shards.push({
        mesh: spark,
        vx,
        vy,
        vz,
        rx: Math.random() * 20,
        ry: Math.random() * 20,
        rz: Math.random() * 20,
        gravity: -45,
      });

      this.shardsGroup.add(spark);
    }
  }

  update(dt) {
    if (!this.active) return;

    this.progress += dt;

    for (const shard of this.shards) {
      shard.mesh.position.x += shard.vx * dt;
      shard.mesh.position.y += shard.vy * dt;
      shard.mesh.position.z += shard.vz * dt;

      shard.vy += shard.gravity * dt;

      shard.mesh.rotation.x += shard.rx * dt;
      shard.mesh.rotation.y += shard.ry * dt;
      shard.mesh.rotation.z += shard.rz * dt;

      // Scale down / fade out
      if (this.progress > 0.8) {
        const fade = Math.max(0, 1 - (this.progress - 0.8) / 0.8);
        shard.mesh.scale.setScalar(fade);
      }
    }

    // When shards have dispersed, trigger handover to 3D Dino
    if (this.progress >= 1.6) {
      this.active = false;
      this.cleanup();
      if (this.onComplete) {
        this.onComplete();
      }
    }
  }

  cleanup() {
    while (this.shardsGroup.children.length > 0) {
      const obj = this.shardsGroup.children[0];
      this.shardsGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    }
    this.shards = [];
  }
}
