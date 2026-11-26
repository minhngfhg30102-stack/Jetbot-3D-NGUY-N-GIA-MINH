import * as THREE from 'three';
import { EnvironmentMap } from '../../types/robot';

interface Asteroid {
  mesh: THREE.Mesh;
  rotSpeedX: number;
  rotSpeedY: number;
  rotSpeedZ: number;
  orbitRadius: number;
  orbitAngle: number;
  orbitSpeed: number;
  orbitHeight: number;
}

interface MeteorTrail {
  headMesh: THREE.Mesh;
  tailLine: THREE.Line;
  positions: Float32Array;
  active: boolean;
  startX: number;
  startY: number;
  startZ: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

/**
 * Creates a procedural texture for Earth with blue oceans, green/brown continents,
 * swirling white clouds, and atmosphere.
 */
function createEarthTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Deep ocean gradient
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, 256);
  oceanGrad.addColorStop(0, '#0f2b46');
  oceanGrad.addColorStop(0.5, '#1e40af');
  oceanGrad.addColorStop(1, '#0f2b46');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, 512, 256);

  // Continents (Americas, Eurasia, Africa, Australia)
  ctx.fillStyle = '#15803d';
  // North America
  ctx.beginPath();
  ctx.ellipse(120, 80, 45, 30, -0.2, 0, Math.PI * 2);
  ctx.fill();
  // South America
  ctx.beginPath();
  ctx.ellipse(150, 160, 30, 45, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Eurasia
  ctx.beginPath();
  ctx.ellipse(320, 75, 75, 35, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Africa
  ctx.fillStyle = '#a16207';
  ctx.beginPath();
  ctx.ellipse(280, 140, 35, 45, -0.1, 0, Math.PI * 2);
  ctx.fill();
  // Australia
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.ellipse(420, 180, 25, 20, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Swirling white clouds
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    const cy = 40 + i * 32;
    ctx.moveTo(0, cy);
    ctx.bezierCurveTo(120, cy - 15, 260, cy + 20, 512, cy);
    ctx.lineTo(512, cy + 12);
    ctx.bezierCurveTo(260, cy + 32, 120, cy - 3, 0, cy + 12);
    ctx.closePath();
    ctx.fill();
  }

  // Polar ice caps
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 512, 18);
  ctx.fillRect(0, 240, 512, 16);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Creates a procedural banded atmosphere texture for Jupiter with Great Red Spot
 */
function createJupiterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const bands = [
    { y: 0, h: 30, color: '#fed7aa' },
    { y: 30, h: 25, color: '#ea580c' },
    { y: 55, h: 20, color: '#ffedd5' },
    { y: 75, h: 35, color: '#c2410c' },
    { y: 110, h: 25, color: '#fef3c7' },
    { y: 135, h: 40, color: '#9a3412' },
    { y: 175, h: 30, color: '#fed7aa' },
    { y: 205, h: 25, color: '#c2410c' },
    { y: 230, h: 26, color: '#7c2d12' },
  ];

  bands.forEach((b) => {
    ctx.fillStyle = b.color;
    ctx.fillRect(0, b.y, 512, b.h);
  });

  // Wavy storm shear lines between bands
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  for (let y = 30; y < 240; y += 35) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(120, y + 8, 300, y - 8, 512, y);
    ctx.lineTo(512, y + 4);
    ctx.bezierCurveTo(300, y - 4, 120, y + 12, 0, y + 4);
    ctx.closePath();
    ctx.fill();
  }

  // The Great Red Spot
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.ellipse(320, 150, 28, 16, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 2;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface MarsCelestialSystem {
  group: THREE.Group;
  update: (delta: number, time: number, robotPos: THREE.Vector3, envMap: EnvironmentMap) => void;
  dispose: () => void;
}

export function createMarsCelestialSystem(isSoftwareGl = false): MarsCelestialSystem {
  const group = new THREE.Group();
  group.name = 'MarsCelestialSystem';

  // Master materials and textures for cleanup
  const disposables: { dispose: () => void }[] = [];

  // ====================================================================
  // 1. EARTH & THE MOON (Trái Đất & Mặt Trăng nhìn từ Sao Hỏa)
  // ====================================================================
  const earthGroup = new THREE.Group();
  earthGroup.position.set(-16.0, 13.5, -22.0); // Northeast sky

  const earthTex = createEarthTexture();
  disposables.push(earthTex);

  const earthGeom = new THREE.SphereGeometry(1.05, 32, 24);
  disposables.push(earthGeom);

  const earthMat = new THREE.MeshStandardMaterial({
    map: earthTex,
    roughness: 0.7,
    metalness: 0.1,
    emissive: 0x1e3a8a,
    emissiveIntensity: 0.28,
    fog: false, // Prevents horizon fog from obscuring distant planets
  });
  disposables.push(earthMat);
  const earthMesh = new THREE.Mesh(earthGeom, earthMat);
  earthGroup.add(earthMesh);

  // Atmospheric cyan/blue haze rim around Earth
  const earthAtmosphereGeom = new THREE.SphereGeometry(1.12, 24, 18);
  disposables.push(earthAtmosphereGeom);
  const earthAtmosphereMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.32,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  disposables.push(earthAtmosphereMat);
  const earthAtmosphere = new THREE.Mesh(earthAtmosphereGeom, earthAtmosphereMat);
  earthGroup.add(earthAtmosphere);

  // Earth's Moon (Mặt Trăng nhỏ quay quanh Trái Đất)
  const moonGeom = new THREE.SphereGeometry(0.26, 16, 12);
  disposables.push(moonGeom);
  const moonMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.9,
    emissive: 0xffffff,
    emissiveIntensity: 0.22,
    fog: false,
  });
  disposables.push(moonMat);
  const moonMesh = new THREE.Mesh(moonGeom, moonMat);
  moonMesh.position.set(2.4, 0.4, 0.8);
  earthGroup.add(moonMesh);

  group.add(earthGroup);

  // ====================================================================
  // 2. JUPITER & GALILEAN MOONS (Sao Mộc khổng lồ & các mặt trăng)
  // ====================================================================
  const jupiterGroup = new THREE.Group();
  jupiterGroup.position.set(20.0, 15.0, -18.0); // Northwest sky

  const jupiterTex = createJupiterTexture();
  disposables.push(jupiterTex);

  const jupiterGeom = new THREE.SphereGeometry(1.65, 32, 24);
  disposables.push(jupiterGeom);

  const jupiterMat = new THREE.MeshStandardMaterial({
    map: jupiterTex,
    roughness: 0.8,
    metalness: 0.05,
    emissive: 0x7c2d12,
    emissiveIntensity: 0.22,
    fog: false,
  });
  disposables.push(jupiterMat);
  const jupiterMesh = new THREE.Mesh(jupiterGeom, jupiterMat);
  jupiterMesh.rotation.z = 0.05;
  jupiterGroup.add(jupiterMesh);

  // Subtle gas giant golden haze
  const jupiterAtmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.72, 24, 18),
    new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.24,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  );
  disposables.push(jupiterAtmosphere.geometry as THREE.BufferGeometry);
  disposables.push(jupiterAtmosphere.material as THREE.Material);
  jupiterGroup.add(jupiterAtmosphere);

  // Galilean Moons (Io, Europa, Ganymede as distinct orbiting specks)
  const galileanMoons: { mesh: THREE.Mesh; dist: number; speed: number; angle: number }[] = [];
  const gMoonData = [
    { dist: 2.8, size: 0.12, color: 0xfde047, speed: 0.9 }, // Io (volcanic sulfur yellow)
    { dist: 3.6, size: 0.10, color: 0xe0f2fe, speed: 0.6 }, // Europa (ice white)
    { dist: 4.8, size: 0.15, color: 0xd1d5db, speed: 0.4 }, // Ganymede (gray giant)
  ];
  gMoonData.forEach((gm) => {
    const mGeom = new THREE.SphereGeometry(gm.size, 12, 10);
    disposables.push(mGeom);
    const mMat = new THREE.MeshBasicMaterial({ color: gm.color, fog: false });
    disposables.push(mMat);
    const mMesh = new THREE.Mesh(mGeom, mMat);
    jupiterGroup.add(mMesh);
    galileanMoons.push({
      mesh: mMesh,
      dist: gm.dist,
      speed: gm.speed,
      angle: Math.random() * Math.PI * 2,
    });
  });

  group.add(jupiterGroup);

  // ====================================================================
  // 3. MARTIAN SUN (Mặt Trời xa xôi trên Sao Hỏa với vầng hào quang Sol)
  // ====================================================================
  const sunGroup = new THREE.Group();
  sunGroup.position.set(0, 17.5, -28.0); // Distant horizon high center

  const sunGeom = new THREE.SphereGeometry(1.2, 24, 16);
  disposables.push(sunGeom);
  const sunMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    fog: false,
  });
  disposables.push(sunMat);
  const sunMesh = new THREE.Mesh(sunGeom, sunMat);
  sunGroup.add(sunMesh);

  // Bluish-white solar flare halo (characteristic of Mars sunsets)
  const sunHaloGeom = new THREE.PlaneGeometry(7.5, 7.5);
  disposables.push(sunHaloGeom);
  const sunHaloCanvas = document.createElement('canvas');
  sunHaloCanvas.width = 128;
  sunHaloCanvas.height = 128;
  const sctx = sunHaloCanvas.getContext('2d')!;
  const sGrad = sctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  sGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  sGrad.addColorStop(0.2, 'rgba(186, 230, 253, 0.6)');
  sGrad.addColorStop(0.5, 'rgba(125, 211, 252, 0.2)');
  sGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
  sctx.fillStyle = sGrad;
  sctx.fillRect(0, 0, 128, 128);
  const sunHaloTex = new THREE.CanvasTexture(sunHaloCanvas);
  disposables.push(sunHaloTex);

  const sunHaloMat = new THREE.MeshBasicMaterial({
    map: sunHaloTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  disposables.push(sunHaloMat);
  const sunHaloMesh = new THREE.Mesh(sunHaloGeom, sunHaloMat);
  sunGroup.add(sunHaloMesh);

  group.add(sunGroup);

  // ====================================================================
  // 4. ASTEROID BELT CLUSTERS (Thiên thạch & Cụm tiểu hành tinh gần Sao Hỏa)
  // ====================================================================
  const asteroids: Asteroid[] = [];
  const asteroidCount = isSoftwareGl ? 7 : 14;

  const sharedAsteroidMat = new THREE.MeshStandardMaterial({
    color: 0x78716c,
    roughness: 0.92,
    metalness: 0.25,
    fog: false,
  });
  disposables.push(sharedAsteroidMat);

  const rustAsteroidMat = new THREE.MeshStandardMaterial({
    color: 0x9a3412,
    roughness: 0.95,
    metalness: 0.15,
    fog: false,
  });
  disposables.push(rustAsteroidMat);

  for (let i = 0; i < asteroidCount; i++) {
    // Irregular low-poly deformed asteroid geometry
    const baseRadius = 0.35 + Math.random() * 0.55;
    const geom = new THREE.DodecahedronGeometry(baseRadius, 1);
    disposables.push(geom);

    // Perturb vertices slightly for organic meteorite crater look
    const posAttr = geom.attributes.position;
    for (let v = 0; v < posAttr.count; v++) {
      const vx = posAttr.getX(v);
      const vy = posAttr.getY(v);
      const vz = posAttr.getZ(v);
      const noise = 1.0 + (Math.random() - 0.5) * 0.28;
      posAttr.setXYZ(v, vx * noise, vy * noise, vz * noise);
    }
    geom.computeVertexNormals();

    const mat = Math.random() > 0.4 ? sharedAsteroidMat : rustAsteroidMat;
    const aMesh = new THREE.Mesh(geom, mat);

    // Non-uniform scaling for elongated space potato shapes
    aMesh.scale.set(
      1.0 + Math.random() * 0.5,
      0.8 + Math.random() * 0.4,
      0.9 + Math.random() * 0.6
    );

    const orbitRadius = 14.0 + Math.random() * 11.0;
    const orbitAngle = (i / asteroidCount) * Math.PI * 2 + Math.random() * 0.5;
    const orbitHeight = 6.0 + Math.random() * 12.0;

    aMesh.position.set(
      Math.cos(orbitAngle) * orbitRadius,
      orbitHeight,
      Math.sin(orbitAngle) * orbitRadius
    );

    group.add(aMesh);

    asteroids.push({
      mesh: aMesh,
      rotSpeedX: (Math.random() - 0.5) * 0.8,
      rotSpeedY: (Math.random() - 0.5) * 0.8,
      rotSpeedZ: (Math.random() - 0.5) * 0.8,
      orbitRadius,
      orbitAngle,
      orbitSpeed: (0.015 + Math.random() * 0.025) * (Math.random() > 0.5 ? 1 : -1),
      orbitHeight,
    });
  }

  // ====================================================================
  // 5. SHOOTING METEOR TRAILS (Vết vạch thiên thạch rực lửa bay qua bầu trời)
  // ====================================================================
  const METEOR_COUNT = 4;
  const meteors: MeteorTrail[] = [];

  const meteorHeadCanvas = document.createElement('canvas');
  meteorHeadCanvas.width = 32;
  meteorHeadCanvas.height = 32;
  const mhctx = meteorHeadCanvas.getContext('2d')!;
  const mhGrad = mhctx.createRadialGradient(16, 16, 2, 16, 16, 16);
  mhGrad.addColorStop(0, 'rgba(255, 255, 240, 1.0)');
  mhGrad.addColorStop(0.3, 'rgba(251, 146, 60, 0.9)');
  mhGrad.addColorStop(1, 'rgba(225, 29, 72, 0)');
  mhctx.fillStyle = mhGrad;
  mhctx.fillRect(0, 0, 32, 32);
  const meteorHeadTex = new THREE.CanvasTexture(meteorHeadCanvas);
  disposables.push(meteorHeadTex);

  const meteorHeadMat = new THREE.SpriteMaterial({
    map: meteorHeadTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    fog: false,
  });
  disposables.push(meteorHeadMat);

  for (let m = 0; m < METEOR_COUNT; m++) {
    const head = new THREE.Sprite(meteorHeadMat);
    head.scale.set(0.65, 0.65, 1);
    head.visible = false;
    group.add(head);

    // Glowing tail streak line
    const TRAIL_POINTS = 8;
    const positions = new Float32Array(TRAIL_POINTS * 3);
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    disposables.push(lineGeom);

    const lineMat = new THREE.LineBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      linewidth: 2,
      fog: false,
    });
    disposables.push(lineMat);

    const tailLine = new THREE.Line(lineGeom, lineMat);
    tailLine.visible = false;
    group.add(tailLine);

    meteors.push({
      headMesh: head as unknown as THREE.Mesh,
      tailLine,
      positions,
      active: false,
      startX: 0,
      startY: 0,
      startZ: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 1.2,
    });
  }

  let meteorSpawnTimer = 0;

  const triggerMeteor = () => {
    const m = meteors.find((item) => !item.active);
    if (!m) return;

    m.active = true;
    m.life = 0;
    m.maxLife = 1.0 + Math.random() * 0.8;

    // Spawn high up in sky
    m.startX = (Math.random() - 0.5) * 24.0;
    m.startY = 14.0 + Math.random() * 6.0;
    m.startZ = -14.0 - Math.random() * 12.0;

    // Fast downward-slanting trajectory
    const speed = 18.0 + Math.random() * 12.0;
    const angleX = 0.6 + Math.random() * 0.4;
    const angleY = -0.5 - Math.random() * 0.3;

    m.vx = speed * angleX;
    m.vy = speed * angleY;
    m.vz = speed * 0.4;

    m.headMesh.position.set(m.startX, m.startY, m.startZ);
    m.headMesh.visible = true;
    m.tailLine.visible = true;

    // Initialize tail
    for (let i = 0; i < 8; i++) {
      m.positions[i * 3] = m.startX;
      m.positions[i * 3 + 1] = m.startY;
      m.positions[i * 3 + 2] = m.startZ;
    }
    m.tailLine.geometry.attributes.position.needsUpdate = true;
  };

  // ====================================================================
  // 6. MARS ORBITER SATELLITE (Vệ tinh nhân tạo MRO bay quanh quỹ đạo)
  // ====================================================================
  const orbiterGroup = new THREE.Group();
  orbiterGroup.position.set(0, 16.0, -10.0);

  // Satellite golden foil body
  const satBodyGeom = new THREE.BoxGeometry(0.35, 0.28, 0.28);
  disposables.push(satBodyGeom);
  const satBodyMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.95,
    roughness: 0.15,
    emissive: 0x78350f,
    emissiveIntensity: 0.2,
    fog: false,
  });
  disposables.push(satBodyMat);
  const satBody = new THREE.Mesh(satBodyGeom, satBodyMat);
  orbiterGroup.add(satBody);

  // Dish antenna
  const dishGeom = new THREE.ConeGeometry(0.24, 0.12, 16, 1, true);
  dishGeom.rotateX(Math.PI / 2);
  disposables.push(dishGeom);
  const dishMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.8,
    roughness: 0.3,
    side: THREE.DoubleSide,
    fog: false,
  });
  disposables.push(dishMat);
  const dish = new THREE.Mesh(dishGeom, dishMat);
  dish.position.set(0, -0.16, 0.14);
  orbiterGroup.add(dish);

  // Dual solar panels
  const satPanelGeom = new THREE.BoxGeometry(1.1, 0.015, 0.32);
  disposables.push(satPanelGeom);
  const satPanelMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    metalness: 0.7,
    roughness: 0.2,
    emissive: 0x1e40af,
    emissiveIntensity: 0.3,
    fog: false,
  });
  disposables.push(satPanelMat);
  const satPanels = new THREE.Mesh(satPanelGeom, satPanelMat);
  orbiterGroup.add(satPanels);

  // Green blinking telemetry beacon
  const satBeacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x10b981, fog: false })
  );
  disposables.push(satBeacon.geometry as THREE.BufferGeometry);
  disposables.push(satBeacon.material as THREE.Material);
  satBeacon.position.set(0, 0.18, 0);
  orbiterGroup.add(satBeacon);

  group.add(orbiterGroup);

  // ====================================================================
  // UPDATE LOOP (Runs at 60 FPS without memory allocations)
  // ====================================================================
  const update = (
    delta: number,
    time: number,
    robotPos: THREE.Vector3,
    envMap: EnvironmentMap
  ) => {
    const isMars = envMap === 'mars-planet';
    group.visible = isMars;
    if (!isMars) return;

    // Follow robot with subtle parallax so celestial dome remains distant
    group.position.x = robotPos.x * 0.15;
    group.position.z = robotPos.z * 0.15;

    // 1. Earth rotation and Moon orbit
    earthMesh.rotation.y += delta * 0.08;
    const moonAngle = time * 0.25;
    moonMesh.position.x = Math.cos(moonAngle) * 2.5;
    moonMesh.position.z = Math.sin(moonAngle) * 2.5;
    moonMesh.position.y = Math.sin(moonAngle * 0.5) * 0.6;

    // 2. Jupiter rotation and Galilean moons
    jupiterMesh.rotation.y += delta * 0.05;
    galileanMoons.forEach((gm) => {
      gm.angle += gm.speed * delta * 0.3;
      gm.mesh.position.x = Math.cos(gm.angle) * gm.dist;
      gm.mesh.position.z = Math.sin(gm.angle) * gm.dist * 0.4;
      gm.mesh.position.y = Math.sin(gm.angle) * 0.25;
    });

    // 3. Asteroid Tumble and Slow Orbital Drift
    asteroids.forEach((a) => {
      a.mesh.rotation.x += a.rotSpeedX * delta;
      a.mesh.rotation.y += a.rotSpeedY * delta;
      a.mesh.rotation.z += a.rotSpeedZ * delta;

      a.orbitAngle += a.orbitSpeed * delta * 0.15;
      a.mesh.position.x = Math.cos(a.orbitAngle) * a.orbitRadius;
      a.mesh.position.z = Math.sin(a.orbitAngle) * a.orbitRadius;
      a.mesh.position.y = a.orbitHeight + Math.sin(time * 0.4 + a.orbitAngle) * 0.4;
    });

    // 4. Shooting Meteors Spawner & Streak Simulation
    meteorSpawnTimer += delta;
    if (meteorSpawnTimer >= 3.2) {
      meteorSpawnTimer = 0;
      triggerMeteor();
    }

    meteors.forEach((m) => {
      if (!m.active) return;
      m.life += delta;
      if (m.life >= m.maxLife) {
        m.active = false;
        m.headMesh.visible = false;
        m.tailLine.visible = false;
        return;
      }

      // Move head
      const curX = m.startX + m.vx * m.life;
      const curY = m.startY + m.vy * m.life;
      const curZ = m.startZ + m.vz * m.life;
      m.headMesh.position.set(curX, curY, curZ);

      // Fade tail
      const progress = m.life / m.maxLife;
      const alpha = Math.max(0, 1.0 - progress);
      (m.tailLine.material as THREE.LineBasicMaterial).opacity = alpha * 0.85;

      // Update trail segments
      const pts = m.positions;
      // Shift backwards
      for (let i = 7; i > 0; i--) {
        pts[i * 3] = pts[(i - 1) * 3];
        pts[i * 3 + 1] = pts[(i - 1) * 3 + 1];
        pts[i * 3 + 2] = pts[(i - 1) * 3 + 2];
      }
      pts[0] = curX;
      pts[1] = curY;
      pts[2] = curZ;
      m.tailLine.geometry.attributes.position.needsUpdate = true;
    });

    // 5. Mars Orbiter Satellite Trajectory & Blinking Beacon
    const satAngle = time * 0.08;
    const satRadius = 15.0;
    orbiterGroup.position.x = Math.sin(satAngle) * satRadius;
    orbiterGroup.position.z = Math.cos(satAngle) * satRadius - 8.0;
    orbiterGroup.position.y = 15.5 + Math.sin(time * 0.2) * 0.5;
    orbiterGroup.rotation.y = satAngle + Math.PI / 2;

    // Beacon blink every 0.6s
    satBeacon.visible = Math.floor(time * 3.3) % 2 === 0;
  };

  const dispose = () => {
    disposables.forEach((d) => {
      try {
        d.dispose();
      } catch {
        // Safe disposal
      }
    });
  };

  return {
    group,
    update,
    dispose,
  };
}
