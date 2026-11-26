import * as THREE from 'three';
import { EnvironmentMap } from '../../types/robot';

interface DustParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  initialSize: number;
  maxSize: number;
  active: boolean;
  baseR: number;
  baseG: number;
  baseB: number;
}

const MAX_PARTICLES = 160;

function createSoftDustTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.65)');
  grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.18)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface WheelDustSystem {
  group: THREE.Group;
  update: (
    delta: number,
    isDriving: boolean,
    robotX: number,
    robotZ: number,
    robotHeading: number,
    linearVel: number,
    angularVel: number,
    modelScale: number,
    environmentMap: EnvironmentMap
  ) => void;
  triggerDigBurst: (x: number, y: number, z: number, count?: number) => void;
  reset: () => void;
  dispose: () => void;
}

export function createWheelDustSystem(): WheelDustSystem {
  const group = new THREE.Group();
  group.name = 'WheelDustSystem';

  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);

  const particles: DustParticle[] = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particles.push({
      x: 0,
      y: -100, // hidden until active
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 0.6,
      initialSize: 18,
      maxSize: 65,
      active: false,
      baseR: 0.9,
      baseG: 0.45,
      baseB: 0.2,
    });
    positions[i * 3 + 1] = -100;
  }

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const colAttr = new THREE.BufferAttribute(colors, 3);
  const sizeAttr = new THREE.BufferAttribute(sizes, 1);

  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('color', colAttr);
  geometry.setAttribute('size', sizeAttr);

  const texture = createSoftDustTexture();

  const material = new THREE.PointsMaterial({
    map: texture,
    size: 0.05,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const pointsMesh = new THREE.Points(geometry, material);
  pointsMesh.frustumCulled = false;
  group.add(pointsMesh);

  let spawnTimer = 0;
  let nextIndex = 0;

  const spawnParticleAt = (
    spawnX: number,
    spawnY: number,
    spawnZ: number,
    ejectVx: number,
    ejectVz: number,
    speedMagnitude: number,
    env: EnvironmentMap
  ) => {
    const p = particles[nextIndex];
    nextIndex = (nextIndex + 1) % MAX_PARTICLES;

    p.active = true;
    p.life = 0;
    // Lifetime scaled slightly with speed
    p.maxLife = 0.45 + Math.random() * 0.35 + Math.min(0.3, speedMagnitude * 0.2);

    // Initial position with subtle ground jitter
    p.x = spawnX + (Math.random() - 0.5) * 0.015;
    p.y = spawnY + 0.004 + Math.random() * 0.008;
    p.z = spawnZ + (Math.random() - 0.5) * 0.015;

    // Ejection velocity (kicking backwards and outward)
    p.vx = ejectVx + (Math.random() - 0.5) * 0.12;
    p.vz = ejectVz + (Math.random() - 0.5) * 0.12;
    p.vy = 0.04 + Math.random() * 0.09 + Math.min(0.12, speedMagnitude * 0.08);

    // Dynamic puff sizes
    p.initialSize = 0.02 + Math.random() * 0.015;
    p.maxSize = 0.08 + Math.random() * 0.05 + Math.min(0.06, speedMagnitude * 0.04);

    // Palette depending on environment map:
    if (env === 'mars-planet') {
      // Martian Terracotta / Red-Amber Dust
      const tone = Math.random();
      if (tone > 0.6) {
        // Bright Martian orange
        p.baseR = 0.96;
        p.baseG = 0.48 + Math.random() * 0.12;
        p.baseB = 0.15 + Math.random() * 0.08;
      } else if (tone > 0.25) {
        // Deep terracotta red
        p.baseR = 0.88;
        p.baseG = 0.32 + Math.random() * 0.1;
        p.baseB = 0.12;
      } else {
        // Desert sand highlight
        p.baseR = 0.98;
        p.baseG = 0.70;
        p.baseB = 0.35;
      }
    } else {
      // CMU Arena: Court dust / fine rubber smoke
      const gray = 0.65 + Math.random() * 0.25;
      p.baseR = gray;
      p.baseG = gray * 0.98;
      p.baseB = gray * 0.95;
    }
  };

  const update = (
    delta: number,
    isDriving: boolean,
    robotX: number,
    robotZ: number,
    robotHeading: number,
    linearVel: number,
    angularVel: number,
    modelScale: number,
    environmentMap: EnvironmentMap
  ) => {
    const speedMag = Math.hypot(linearVel, angularVel * 0.14);
    const isMoving = isDriving && (Math.abs(linearVel) > 0.02 || Math.abs(angularVel) > 0.05);

    // 1. Particle Spawner
    if (isMoving) {
      spawnTimer += delta;
      // Higher emission rate at higher speeds / Turbo
      const spawnInterval = Math.max(0.016, 0.045 - Math.min(0.03, speedMag * 0.03));

      while (spawnTimer >= spawnInterval) {
        spawnTimer -= spawnInterval;

        const wheelHalfW = 0.138 * modelScale;
        // Direction vectors
        const cosH = Math.cos(robotHeading);
        const sinH = Math.sin(robotHeading);

        // Backward kick direction relative to robot motion
        const moveSign = linearVel >= 0 ? 1 : -1;
        const kickVx = -sinH * (linearVel * 0.45) - cosH * (angularVel * 0.05);
        const kickVz = -cosH * (linearVel * 0.45) + sinH * (angularVel * 0.05);

        // Ground patch positions: Left Wheel & Right Wheel
        const leftX = robotX - cosH * wheelHalfW - sinH * (moveSign * 0.02);
        const leftZ = robotZ + sinH * wheelHalfW - cosH * (moveSign * 0.02);

        const rightX = robotX + cosH * wheelHalfW - sinH * (moveSign * 0.02);
        const rightZ = robotZ - sinH * wheelHalfW - cosH * (moveSign * 0.02);

        // Spawn from Left Wheel
        spawnParticleAt(leftX, 0, leftZ, kickVx, kickVz, speedMag, environmentMap);

        // Spawn from Right Wheel
        spawnParticleAt(rightX, 0, rightZ, kickVx, kickVz, speedMag, environmentMap);

        // Occasional caster rear swirl puff
        if (Math.random() > 0.4) {
          const casterDist = 0.125 * modelScale;
          const casterX = robotX - sinH * casterDist;
          const casterZ = robotZ - cosH * casterDist;
          spawnParticleAt(casterX, 0, casterZ, kickVx * 0.6, kickVz * 0.6, speedMag * 0.8, environmentMap);
        }
      }
    } else {
      spawnTimer = 0;
    }

    // 2. Simulate Active Particles
    const pos = positions;
    const col = colors;
    let hasActive = false;

    // Martian gravity is lower (~0.38g), earth indoor is 1.0g
    const gravity = environmentMap === 'mars-planet' ? 0.06 : 0.12;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      if (!p.active) {
        pos[i * 3 + 1] = -100; // hide
        continue;
      }

      hasActive = true;
      p.life += delta;

      if (p.life >= p.maxLife) {
        p.active = false;
        pos[i * 3 + 1] = -100;
        continue;
      }

      // Physics integration
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.z += p.vz * delta;

      // Air resistance and upward buoyancy/gravity
      p.vy -= gravity * delta;
      p.vx *= Math.max(0, 1 - 2.2 * delta);
      p.vz *= Math.max(0, 1 - 2.2 * delta);

      // Bounce/glide off ground
      if (p.y < 0.002) {
        p.y = 0.002;
        p.vy = Math.max(0, -p.vy * 0.25);
      }

      const progress = p.life / p.maxLife; // 0 to 1
      // Smooth fade out
      const alpha = Math.max(0, 1 - Math.pow(progress, 1.3));

      // Update geometry buffers
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;

      col[i * 3] = p.baseR * alpha;
      col[i * 3 + 1] = p.baseG * alpha;
      col[i * 3 + 2] = p.baseB * alpha;
    }

    if (hasActive || isMoving) {
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }
  };

  const triggerDigBurst = (x: number, y: number, z: number, count = 28) => {
    for (let c = 0; c < count; c++) {
      const p = particles[nextIndex];
      nextIndex = (nextIndex + 1) % MAX_PARTICLES;
      p.active = true;
      const angle = Math.random() * Math.PI * 2;
      const rad = Math.random() * 0.18;
      p.x = x + Math.cos(angle) * rad;
      p.y = y + 0.02 + Math.random() * 0.05;
      p.z = z + Math.sin(angle) * rad;

      const speed = 0.35 + Math.random() * 0.65;
      p.vx = Math.cos(angle) * speed + (Math.random() - 0.5) * 0.2;
      p.vy = 0.45 + Math.random() * 0.85; // Upward soil fountain
      p.vz = Math.sin(angle) * speed + (Math.random() - 0.5) * 0.2;

      p.life = 0;
      p.maxLife = 0.5 + Math.random() * 0.55;

      // Fiery Martian sand and golden mineral sparkles
      if (Math.random() > 0.3) {
        p.baseR = 0.98;
        p.baseG = 0.42 + Math.random() * 0.3;
        p.baseB = 0.08;
      } else {
        // Glowing gold ore flake
        p.baseR = 1.0;
        p.baseG = 0.88;
        p.baseB = 0.25;
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  };

  const reset = () => {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      particles[i].active = false;
      positions[i * 3 + 1] = -100;
    }
    posAttr.needsUpdate = true;
  };

  const dispose = () => {
    geometry.dispose();
    material.dispose();
    texture.dispose();
  };

  return {
    group,
    update,
    triggerDigBurst,
    reset,
    dispose,
  };
}
