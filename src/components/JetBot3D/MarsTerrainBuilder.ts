import * as THREE from 'three';

export interface ExclusionZone {
  x: number;
  z: number;
  radius: number;
}

export interface MarsTerrainResult {
  terrainGroup: THREE.Group;
  regolithMap: THREE.CanvasTexture;
  regolithBumpMap: THREE.CanvasTexture;
  regolithRoughnessMap: THREE.CanvasTexture;
  mountainMap: THREE.CanvasTexture;
  mountainBumpMap: THREE.CanvasTexture;
  dispose: () => void;
}

function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates paired procedural Martian stratified rock albedo (sRGB) + bump height map (Linear)
 * for mountains, island escarpment cliffs, and canyon mesas.
 */
export function createMarsMountainMaps(
  disposables: { dispose: () => void }[]
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const rand = createSeededRandom(90125);
  const w = 512;
  const h = 512;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = w;
  albedoCanvas.height = h;
  const actx = albedoCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const bctx = bumpCanvas.getContext('2d')!;

  // Realistic desaturated iron-oxide & basalt cliff palette (not neon cartoon orange)
  const mGrad = actx.createLinearGradient(0, 0, 0, h);
  mGrad.addColorStop(0.0, '#c96f44'); // Weathered sunlit ochre caprock
  mGrad.addColorStop(0.18, '#a64d2a'); // Rust sandstone shelf
  mGrad.addColorStop(0.36, '#7c3219'); // Deep iron-oxide stratum
  mGrad.addColorStop(0.54, '#9a4322'); // Sedimentary terracotta band
  mGrad.addColorStop(0.72, '#5c2212'); // Basaltic dark hematite belt
  mGrad.addColorStop(0.88, '#7a331a'); // Lower scree rock
  mGrad.addColorStop(1.0, '#662813'); // Base blending into regolith
  actx.fillStyle = mGrad;
  actx.fillRect(0, 0, w, h);

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, w, h);

  // Horizontal sedimentary rock strata ledges across both albedo & height bump
  for (let y = 0; y < h; y += 3) {
    const wave = Math.sin(y * 0.14) * 0.5 + Math.cos(y * 0.045) * 0.5;
    if (wave > 0.15) {
      const alpha = (0.12 + wave * 0.16).toFixed(3);
      actx.fillStyle = `rgba(218, 145, 102, ${alpha})`;
      actx.fillRect(0, y, w, 2);
      const lum = Math.round(150 + wave * 75);
      bctx.fillStyle = `rgb(${lum},${lum},${lum})`;
      bctx.fillRect(0, y, w, 3);
    } else if (wave < -0.15) {
      const alpha = (0.16 + -wave * 0.22).toFixed(3);
      actx.fillStyle = `rgba(45, 16, 10, ${alpha})`;
      actx.fillRect(0, y, w, 3);
      const lum = Math.round(95 + wave * 55);
      bctx.fillStyle = `rgb(${lum},${lum},${lum})`;
      bctx.fillRect(0, y, w, 3);
    }
  }

  // Vertical erosion gullies & fissures
  for (let i = 0; i < 42; i++) {
    const gx = rand() * w;
    const gy = rand() * h * 0.65;
    const gLen = 45 + rand() * 140;
    actx.strokeStyle = `rgba(38, 14, 8, ${(0.12 + rand() * 0.18).toFixed(2)})`;
    actx.lineWidth = 1.5 + rand() * 2.5;
    actx.beginPath();
    actx.moveTo(gx, gy);
    actx.lineTo(gx + (rand() - 0.5) * 18, gy + gLen);
    actx.stroke();

    bctx.strokeStyle = 'rgba(40, 40, 40, 0.35)';
    bctx.lineWidth = actx.lineWidth;
    bctx.beginPath();
    bctx.moveTo(gx, gy);
    bctx.lineTo(gx + (rand() - 0.5) * 18, gy + gLen);
    bctx.stroke();
  }

  // Fine basaltic rock grain
  for (let i = 0; i < 1400; i++) {
    const rx = rand() * w;
    const ry = rand() * h;
    const r = 0.8 + rand() * 1.8;
    const bright = rand() > 0.55;
    actx.fillStyle = bright ? 'rgba(212, 132, 86, 0.28)' : 'rgba(42, 15, 8, 0.32)';
    actx.fillRect(rx, ry, r, r);

    const bl = bright ? 165 : 90;
    bctx.fillStyle = `rgba(${bl},${bl},${bl},0.45)`;
    bctx.fillRect(rx, ry, r, r);
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 1);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 1);

  disposables.push(map, bumpMap);
  return { map, bumpMap };
}

/**
 * Computes the exact macro geological vertex color used by marsFloor at any world (wx, wz)
 * so crater aprons and climbable mound bases blend into the plateau with zero color seam.
 */
export function sampleMarsFloorVertexColor(wx: number, wz: number): [number, number, number] {
  const distNorm = Math.min(1, Math.hypot(wx, wz) / 15.5);
  const macroWave =
    Math.sin(wx * 0.28 + wz * 0.19) * 0.08 +
    Math.cos(wx * 0.17 - wz * 0.31) * 0.07;
  const edgeShade = 1.0 - distNorm * 0.24 + macroWave;
  return [
    THREE.MathUtils.clamp(edgeShade, 0.58, 1.08),
    THREE.MathUtils.clamp(edgeShade * 0.94, 0.52, 1.05),
    THREE.MathUtils.clamp(edgeShade * 0.88, 0.48, 1.0),
  ];
}

/**
 * Generates seamless tileable high-frequency Martian Regolith PBR maps (albedo + bump + roughness)
 * at 1024x1024 with organic circular basalt/iron-oxide grit and broken wind-carved sand bedforms
 * (no boxy fillRect pixels and no uniform horizontal stripes).
 */
function createMarsRegolithMaps(
  disposables: { dispose: () => void }[]
): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const rand = createSeededRandom(424242);
  const size = 1024;

  const albedo = document.createElement('canvas');
  albedo.width = size;
  albedo.height = size;
  const ctx = albedo.getContext('2d')!;

  const bump = document.createElement('canvas');
  bump.width = size;
  bump.height = size;
  const bctx = bump.getContext('2d')!;

  const rough = document.createElement('canvas');
  rough.width = size;
  rough.height = size;
  const rctx = rough.getContext('2d')!;

  // Warm iron-oxide regolith baseline (neutralized albedo for vertex-color modulation)
  ctx.fillStyle = '#8b3e1f';
  ctx.fillRect(0, 0, size, size);

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  rctx.fillStyle = '#eaeaea';
  rctx.fillRect(0, 0, size, size);

  // Seamless periodic geological mottled soil patches (wrapped across all tile edges)
  const drawWrappedPatch = (px: number, py: number, pr: number, fillA: string, fillR: string, bumpDelta?: string) => {
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const cx = px + ox;
        const cy = py + oy;
        if (cx + pr < 0 || cx - pr > size || cy + pr < 0 || cy - pr > size) continue;
        const grad = ctx.createRadialGradient(cx, cy, pr * 0.1, cx, cy, pr);
        grad.addColorStop(0, fillA);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, pr, 0, Math.PI * 2);
        ctx.fill();

        if (bumpDelta) {
          const bGrad = bctx.createRadialGradient(cx, cy, pr * 0.1, cx, cy, pr);
          bGrad.addColorStop(0, bumpDelta);
          bGrad.addColorStop(1, 'rgba(128,128,128,0)');
          bctx.fillStyle = bGrad;
          bctx.beginPath();
          bctx.arc(cx, cy, pr, 0, Math.PI * 2);
          bctx.fill();
        }

        rctx.fillStyle = fillR;
        rctx.beginPath();
        rctx.arc(cx, cy, pr * 0.72, 0, Math.PI * 2);
        rctx.fill();
      }
    }
  };

  for (let p = 0; p < 44; p++) {
    const px = rand() * size;
    const py = rand() * size;
    const pr = 42 + rand() * 115;
    const isBasalt = p % 2 === 0;
    drawWrappedPatch(
      px,
      py,
      pr,
      isBasalt ? 'rgba(54, 21, 11, 0.24)' : 'rgba(176, 92, 48, 0.20)',
      isBasalt ? 'rgba(195, 195, 195, 0.22)' : 'rgba(246, 246, 246, 0.22)',
      isBasalt ? 'rgba(98, 98, 98, 0.18)' : 'rgba(156, 156, 156, 0.18)'
    );
  }

  // Organic discontinuous wind-carved sand bedforms (short wispy arcs, no repetitive horizontal stripes)
  ctx.lineCap = 'round';
  bctx.lineCap = 'round';
  for (let w = 0; w < 46; w++) {
    const sx = rand() * size;
    const sy = rand() * size;
    const len = 70 + rand() * 130;
    const tilt = (rand() - 0.5) * 0.55;
    const curve = (rand() - 0.5) * 32;
    const width = 2.5 + rand() * 3.5;

    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const x0 = sx + ox;
        const y0 = sy + oy;
        const x2 = x0 + Math.cos(tilt) * len;
        const y2 = y0 + Math.sin(tilt) * len;
        if (Math.max(x0, x2) < -20 || Math.min(x0, x2) > size + 20 || Math.max(y0, y2) < -20 || Math.min(y0, y2) > size + 20) {
          continue;
        }
        const cx = (x0 + x2) * 0.5;
        const cy = (y0 + y2) * 0.5 + curve;

        ctx.strokeStyle = 'rgba(206, 120, 72, 0.08)';
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cx, cy, x2, y2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(42, 15, 7, 0.07)';
        ctx.lineWidth = width * 0.85;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + width * 0.9);
        ctx.quadraticCurveTo(cx, cy + width * 0.9, x2, y2 + width * 0.9);
        ctx.stroke();

        bctx.strokeStyle = 'rgba(176, 176, 176, 0.22)';
        bctx.lineWidth = width;
        bctx.beginPath();
        bctx.moveTo(x0, y0);
        bctx.quadraticCurveTo(cx, cy, x2, y2);
        bctx.stroke();
      }
    }
  }

  // Dense multi-scale organic circular sand grains & volcanic gravel (zero square fillRect pixels)
  const drawWrappedDisc = (
    gx: number,
    gy: number,
    radius: number,
    albedoStyle: string,
    bumpStyle: string
  ) => {
    for (const ox of [-size, 0, size]) {
      const cx = gx + ox;
      if (cx + radius < 0 || cx - radius > size) continue;
      for (const oy of [-size, 0, size]) {
        const cy = gy + oy;
        if (cy + radius < 0 || cy - radius > size) continue;

        ctx.fillStyle = albedoStyle;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        bctx.fillStyle = bumpStyle;
        bctx.beginPath();
        bctx.arc(cx, cy, radius, 0, Math.PI * 2);
        bctx.fill();
      }
    }
  };

  for (let i = 0; i < 6500; i++) {
    const gx = rand() * size;
    const gy = rand() * size;
    const roll = rand();
    const radius = roll > 0.94 ? 1.6 + rand() * 1.4 : 0.65 + rand() * 1.15;
    if (roll < 0.42) {
      drawWrappedDisc(gx, gy, radius, 'rgba(34, 13, 7, 0.34)', 'rgba(92, 92, 92, 0.45)');
    } else if (roll < 0.85) {
      drawWrappedDisc(gx, gy, radius, 'rgba(192, 106, 58, 0.26)', 'rgba(172, 172, 172, 0.44)');
    } else {
      drawWrappedDisc(gx, gy, radius, 'rgba(222, 146, 98, 0.22)', 'rgba(198, 198, 198, 0.48)');
    }
  }

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(5, 5);
  map.anisotropy = 4;

  const bumpMap = new THREE.CanvasTexture(bump);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(5, 5);
  bumpMap.anisotropy = 4;

  const roughnessMap = new THREE.CanvasTexture(rough);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(5, 5);

  disposables.push(map, bumpMap, roughnessMap);
  return { map, bumpMap, roughnessMap };
}

/**
 * Builds the 3D outer Martian island escarpment cliff rim descending into a deep canyon basin
 * so the playable 28m sector reads as a natural geological plateau/crater island instead of floating.
 */
function buildMarsIslandEscarpment(
  isSoftwareGl: boolean,
  regolithMap: THREE.CanvasTexture,
  regolithBump: THREE.CanvasTexture,
  mountainMap: THREE.CanvasTexture,
  mountainBumpMap: THREE.CanvasTexture,
  disposables: { dispose: () => void }[]
): THREE.Group {
  const escarpmentGroup = new THREE.Group();
  escarpmentGroup.name = 'MarsIslandEscarpment';

  const rand = createSeededRandom(314159);

  // 1. Stepped Rocky Cliff Skirt surrounding the 28m playable plateau (x,z in [-13.8, 13.8])
  const angularSegments = 64;
  // Ring profile from inner plateau rim down to canyon basin floor
  const ringProfile = [
    { scale: 13.75, y: -0.01, jitter: 0.05 }, // flush inner seam with main floor
    { scale: 14.35, y: -0.18, jitter: 0.25 }, // fractured mesa lip
    { scale: 15.6, y: -1.15, jitter: 0.55 },  // steep stratified upper cliff
    { scale: 17.5, y: -2.05, jitter: 0.72 },  // mid basalt talus ledge
    { scale: 20.4, y: -3.65, jitter: 0.95 },  // canyon cliff base slope
    { scale: 24.5, y: -4.22, jitter: 0.45 },  // merges into deep canyon basin
  ];

  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < ringProfile.length; r++) {
    const step = ringProfile[r];
    const vCoord = r / (ringProfile.length - 1);

    for (let s = 0; s < angularSegments; s++) {
      const theta = (s / angularSegments) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Rounded-square superellipse so cliff rim wraps snugly around the 28m playable sector
      const absMax = Math.max(Math.abs(cosT), Math.abs(sinT));
      const squareProj = 1 / Math.max(0.001, absMax);
      const blendRadius = THREE.MathUtils.lerp(squareProj, 1.18, 0.32);

      const cragNoise =
        Math.sin(theta * 7 + r * 1.4) * 0.55 +
        Math.cos(theta * 13 - r * 0.9) * 0.45;
      const rad = step.scale * blendRadius + cragNoise * step.jitter;

      const x = cosT * rad;
      const z = sinT * rad;
      const y =
        r === 0
          ? step.y
          : step.y + Math.sin(theta * 9 + r) * (step.jitter * 0.14);

      positions.push(x, y, z);
      uvs.push((s / angularSegments) * 6, vCoord * 2);

      // Geological strata vertex color tint from sunlit rim to deep canyon floor
      const strataShade = 1.0 - vCoord * 0.48 + (cragNoise * 0.06);
      colors.push(
        THREE.MathUtils.clamp(strataShade * 0.95, 0.25, 1.0),
        THREE.MathUtils.clamp(strataShade * 0.72, 0.18, 0.95),
        THREE.MathUtils.clamp(strataShade * 0.58, 0.15, 0.85)
      );
    }
  }

  for (let r = 0; r < ringProfile.length - 1; r++) {
    const rowStart = r * angularSegments;
    const nextRowStart = (r + 1) * angularSegments;
    for (let s = 0; s < angularSegments; s++) {
      const nextS = (s + 1) % angularSegments;
      const a = rowStart + s;
      const b = rowStart + nextS;
      const c = nextRowStart + s;
      const d = nextRowStart + nextS;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const cliffGeom = new THREE.BufferGeometry();
  cliffGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  cliffGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  cliffGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  cliffGeom.setIndex(indices);
  cliffGeom.computeVertexNormals();

  const cliffMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: mountainMap,
    bumpMap: mountainBumpMap,
    bumpScale: 0.045,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true,
  });

  const cliffMesh = new THREE.Mesh(cliffGeom, cliffMat);
  cliffMesh.receiveShadow = !isSoftwareGl;
  cliffMesh.castShadow = !isSoftwareGl;
  escarpmentGroup.add(cliffMesh);
  disposables.push(cliffGeom, cliffMat);

  // 2. Deep Outer Martian Canyon Basin Floor surrounding the island plateau
  const basinFloorMap = regolithMap.clone();
  basinFloorMap.wrapS = THREE.RepeatWrapping;
  basinFloorMap.wrapT = THREE.RepeatWrapping;
  basinFloorMap.repeat.set(4, 4);
  basinFloorMap.needsUpdate = true;

  const basinFloorBump = regolithBump.clone();
  basinFloorBump.wrapS = THREE.RepeatWrapping;
  basinFloorBump.wrapT = THREE.RepeatWrapping;
  basinFloorBump.repeat.set(4, 4);
  basinFloorBump.needsUpdate = true;

  const basinGeom = new THREE.PlaneGeometry(96, 96, 1, 1);
  basinGeom.rotateX(-Math.PI / 2);
  const basinMat = new THREE.MeshStandardMaterial({
    color: 0x995338,
    map: basinFloorMap,
    bumpMap: basinFloorBump,
    bumpScale: 0.04,
    roughness: 0.94,
    metalness: 0.02,
  });
  const basinFloor = new THREE.Mesh(basinGeom, basinMat);
  basinFloor.position.y = -4.2;
  escarpmentGroup.add(basinFloor);
  disposables.push(basinFloorMap, basinFloorBump, basinGeom, basinMat);

  // 3. Distant Canyon Rim Mesas circling horizon (gives epic geological crater depth!)
  const mesaGeom = new THREE.CylinderGeometry(3.8, 7.2, 5.4, 9, 3);
  const mPos = mesaGeom.attributes.position;
  for (let i = 0; i < mPos.count; i++) {
    const mx = mPos.getX(i);
    const my = mPos.getY(i);
    const mz = mPos.getZ(i);
    const ang = Math.atan2(mz, mx);
    const radialScale = 1.0 + Math.sin(ang * 3 + my * 0.4) * 0.22;
    mPos.setXYZ(i, mx * radialScale, my, mz * radialScale);
  }
  mesaGeom.computeVertexNormals();

  const mesaMat = new THREE.MeshStandardMaterial({
    color: 0xb45c36,
    map: mountainMap,
    bumpMap: mountainBumpMap,
    bumpScale: 0.035,
    roughness: 0.92,
    metalness: 0.04,
    flatShading: true,
  });
  disposables.push(mesaGeom, mesaMat);

  const mesaCount = 8;
  const mesaInstanced = new THREE.InstancedMesh(mesaGeom, mesaMat, mesaCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < mesaCount; i++) {
    const theta = (i / mesaCount) * Math.PI * 2 + 0.28;
    const dist = 34 + rand() * 8;
    dummy.position.set(Math.cos(theta) * dist, -1.6 + rand() * 0.5, Math.sin(theta) * dist);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(0.85 + rand() * 0.65, 0.8 + rand() * 0.55, 0.85 + rand() * 0.55);
    dummy.updateMatrix();
    mesaInstanced.setMatrixAt(i, dummy.matrix);
  }
  mesaInstanced.instanceMatrix.needsUpdate = true;
  mesaInstanced.computeBoundingSphere();
  escarpmentGroup.add(mesaInstanced);
  disposables.push(mesaInstanced);

  return escarpmentGroup;
}

/**
 * Builds crisp 3D rimmed Martian impact craters using LatheGeometry with vertex jitter
 * so surface craters have genuine physical relief instead of flat painted circles.
 */
function buildMarsCraters(
  isSoftwareGl: boolean,
  regolithMap: THREE.CanvasTexture,
  regolithBump: THREE.CanvasTexture,
  disposables: { dispose: () => void }[]
): THREE.Group {
  const craterGroup = new THREE.Group();
  craterGroup.name = 'MarsImpactCraters';
  const rand = createSeededRandom(77331);

  const craterMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: regolithMap,
    bumpMap: regolithBump,
    bumpScale: 0.045,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.04,
  });
  disposables.push(craterMat);

  const specs = [
    { x: 5.8, z: 0.6, r: 1.35, h: 0.16 },
    { x: -5.8, z: 4.4, r: 1.45, h: 0.18 },
    { x: 4.6, z: -5.8, r: 1.55, h: 0.19 },
    { x: -1.6, z: -8.4, r: 1.3, h: 0.15 },
    { x: 6.4, z: 5.2, r: 1.25, h: 0.15 },
    { x: -0.4, z: -6.2, r: 1.25, h: 0.15 },
  ];

  specs.forEach(({ x, z, r, h }, idx) => {
    const profile = [
      new THREE.Vector2(0.0, 0.002),
      new THREE.Vector2(r * 0.42, 0.003),
      new THREE.Vector2(r * 0.62, 0.045),
      new THREE.Vector2(r * 0.74, h),
      new THREE.Vector2(r * 0.84, h * 0.72),
      new THREE.Vector2(r * 0.96, h * 0.14),
      new THREE.Vector2(r * 1.08, 0.0),
    ];

    const geom = new THREE.LatheGeometry(profile, 32);
    const pos = geom.attributes.position;
    const uvAttr = geom.attributes.uv;
    const cols = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const dist = Math.hypot(vx, vz);
      const ang = Math.atan2(vz, vx);

      // Organic geological rim irregularity (kept zero at outer edge so crater apron sits 100% flush)
      const edgeTaper = THREE.MathUtils.clamp(1.0 - Math.max(0, dist - r * 0.85) / (r * 0.25), 0, 1);
      const rimWave =
        (Math.sin(ang * 5 + idx * 1.7) * 0.12 +
          Math.cos(ang * 9 - idx) * 0.07) * edgeTaper;
      const radialStretch = dist > r * 0.4 ? 1.0 + rimWave * 0.28 : 1.0;
      const yLift = vy > 0.005 ? vy * (1.0 + rimWave * 0.35) : vy;
      const finalX = vx * radialStretch;
      const finalZ = vz * radialStretch;
      pos.setXYZ(i, finalX, Math.max(0.001, yLift), finalZ);

      // Exact normalized floor UV space (0..1 across 28m plateau) so regolithMap.repeat aligns 1:1 with marsFloor
      uvAttr.setXY(i, (x + finalX + 14) / 28, (-(z + finalZ) + 14) / 28);

      const heightFrac = THREE.MathUtils.clamp(yLift / h, 0, 1);
      const [baseR, baseG, baseB] = sampleMarsFloorVertexColor(x + finalX, z + finalZ);
      if (dist < r * 0.5) {
        // Dark volcanic basaltic crater floor
        cols[i * 3] = baseR * 0.6;
        cols[i * 3 + 1] = baseG * 0.54;
        cols[i * 3 + 2] = baseB * 0.52;
      } else if (dist < r * 0.88) {
        // Sunlit crater rim crest
        cols[i * 3] = THREE.MathUtils.lerp(baseR * 0.72, baseR * 1.12, heightFrac);
        cols[i * 3 + 1] = THREE.MathUtils.lerp(baseG * 0.65, baseG * 1.06, heightFrac);
        cols[i * 3 + 2] = THREE.MathUtils.lerp(baseB * 0.6, baseB * 1.0, heightFrac);
      } else {
        // Outer apron blends to exact floor vertex tint at perimeter
        cols[i * 3] = baseR;
        cols[i * 3 + 1] = baseG;
        cols[i * 3 + 2] = baseB;
      }
    }

    geom.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geom.computeVertexNormals();

    // Flatten normals on the outer perimeter apron to (0, 1, 0) so crater edges merge seamlessly with marsFloor
    const normAttr = geom.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const dist = Math.hypot(pos.getX(i), pos.getZ(i));
      if (dist >= r * 1.01) {
        normAttr.setXYZ(i, 0, 1, 0);
      }
    }
    normAttr.needsUpdate = true;

    const mesh = new THREE.Mesh(geom, craterMat);
    mesh.position.set(x, 0, z);
    mesh.receiveShadow = !isSoftwareGl;
    mesh.castShadow = !isSoftwareGl;
    craterGroup.add(mesh);
    disposables.push(geom);
  });

  return craterGroup;
}

/**
 * Scatters ~280 Martian basalt stones & flat red shale plates across the terrain
 * using ONLY 2 THREE.InstancedMesh draw calls for rock-solid 60 FPS performance.
 */
function buildInstancedMarsScatter(
  isSoftwareGl: boolean,
  exclusionZones: ExclusionZone[],
  disposables: { dispose: () => void }[]
): THREE.Group {
  const scatterGroup = new THREE.Group();
  scatterGroup.name = 'MarsInstancedPebbleScatter';
  const rand = createSeededRandom(202604);

  const isClear = (x: number, z: number): boolean => {
    for (const zone of exclusionZones) {
      if (Math.hypot(x - zone.x, z - zone.z) < zone.radius) {
        return false;
      }
    }
    return true;
  };

  // Batch 1: 160 Angular Basalt Pebbles
  const pebbleGeom = new THREE.DodecahedronGeometry(0.052, 0);
  const pAttr = pebbleGeom.attributes.position;
  for (let i = 0; i < pAttr.count; i++) {
    const vx = pAttr.getX(i);
    const vy = pAttr.getY(i);
    const vz = pAttr.getZ(i);
    pAttr.setXYZ(i, vx * 1.18, vy * 0.72, vz * 0.94);
  }
  pebbleGeom.computeVertexNormals();

  const pebbleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.08,
    flatShading: true,
  });

  const pebblePalette = [
    new THREE.Color(0x4a2217), // Dark weathered basalt
    new THREE.Color(0x7c2d12), // Iron-oxide rust rock
    new THREE.Color(0x9a3412), // Sun-baked terracotta
    new THREE.Color(0x632514), // Hematite umber
    new THREE.Color(0xb45309), // Ochre sandstone chip
  ];

  const PEBBLE_COUNT = 160;
  const pebbles = new THREE.InstancedMesh(pebbleGeom, pebbleMat, PEBBLE_COUNT);
  pebbles.receiveShadow = !isSoftwareGl;

  const dummy = new THREE.Object3D();
  let placed = 0;
  let attempts = 0;
  while (placed < PEBBLE_COUNT && attempts < 1400) {
    attempts++;
    const px = (rand() - 0.5) * 26.0;
    const pz = (rand() - 0.5) * 26.0;
    if (!isClear(px, pz)) continue;

    const s = 0.6 + rand() * 1.15;
    dummy.position.set(px, 0.018 * s, pz);
    dummy.rotation.set((rand() - 0.5) * 0.35, rand() * Math.PI * 2, (rand() - 0.5) * 0.35);
    dummy.scale.set(s * (0.85 + rand() * 0.45), s * (0.65 + rand() * 0.45), s * (0.85 + rand() * 0.45));
    dummy.updateMatrix();
    pebbles.setMatrixAt(placed, dummy.matrix);
    pebbles.setColorAt(placed, pebblePalette[placed % pebblePalette.length]);
    placed++;
  }
  pebbles.count = placed;
  pebbles.instanceMatrix.needsUpdate = true;
  if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
  pebbles.computeBoundingSphere();
  scatterGroup.add(pebbles);

  // Batch 2: 120 Flat Red Shale / Slate Ground Plates
  const shaleGeom = new THREE.CylinderGeometry(0.082, 0.115, 0.022, 6);
  const shaleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.91,
    metalness: 0.05,
    flatShading: true,
  });

  const SHALE_COUNT = 120;
  const shales = new THREE.InstancedMesh(shaleGeom, shaleMat, SHALE_COUNT);
  shales.receiveShadow = !isSoftwareGl;

  let shalePlaced = 0;
  let shaleAttempts = 0;
  while (shalePlaced < SHALE_COUNT && shaleAttempts < 1200) {
    shaleAttempts++;
    const sx = (rand() - 0.5) * 25.4;
    const sz = (rand() - 0.5) * 25.4;
    if (!isClear(sx, sz)) continue;

    const s = 0.65 + rand() * 1.1;
    dummy.position.set(sx, 0.007, sz);
    dummy.rotation.set((rand() - 0.5) * 0.12, rand() * Math.PI * 2, (rand() - 0.5) * 0.12);
    dummy.scale.set(s * (0.9 + rand() * 0.5), 1, s * (0.75 + rand() * 0.45));
    dummy.updateMatrix();
    shales.setMatrixAt(shalePlaced, dummy.matrix);
    shales.setColorAt(shalePlaced, pebblePalette[(shalePlaced + 2) % pebblePalette.length]);
    shalePlaced++;
  }
  shales.count = shalePlaced;
  shales.instanceMatrix.needsUpdate = true;
  if (shales.instanceColor) shales.instanceColor.needsUpdate = true;
  shales.computeBoundingSphere();
  scatterGroup.add(shales);

  disposables.push(pebbleGeom, pebbleMat, pebbles, shaleGeom, shaleMat, shales);
  return scatterGroup;
}

/**
 * Builds an upgraded, multi-part pressurized Mars Research Habitat Outpost at (-2.4, 0, -2.4)
 * with titanium foundation pad, geodesic ribs, illuminated viewports, cryo O2/CH4 tanks,
 * high-gain deep-space dish antenna, and twin solar wing arrays.
 */
function buildMarsResearchOutpost(
  isSoftwareGl: boolean,
  disposables: { dispose: () => void }[]
): THREE.Group {
  const domeGroup = new THREE.Group();
  domeGroup.name = 'MarsResearchOutpost';
  domeGroup.position.set(-5.8, 0, 1.4);

  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Materials with realistic roughness differentiation
  const foundationMat = track(
    new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.85, metalness: 0.25 })
  );
  const hullMat = track(
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.48, metalness: 0.28 })
  );
  const titaniumMat = track(
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.34, metalness: 0.78 })
  );
  const windowGlowMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.95,
      roughness: 0.25,
    })
  );
  const solarMat = track(
    new THREE.MeshStandardMaterial({ color: 0x172554, roughness: 0.25, metalness: 0.72 })
  );
  const copperTrimMat = track(
    new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.82 })
  );

  // 1. Octagonal Foundation Plinth flush with terrain
  const baseGeom = track(new THREE.CylinderGeometry(0.95, 1.04, 0.06, 8));
  const baseMesh = new THREE.Mesh(baseGeom, foundationMat);
  baseMesh.position.y = 0.03;
  baseMesh.receiveShadow = !isSoftwareGl;
  domeGroup.add(baseMesh);

  // 2. Pressurized Geodesic Habitat Shell
  const domeGeom = track(new THREE.SphereGeometry(0.75, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2));
  const dome = new THREE.Mesh(domeGeom, hullMat);
  dome.position.y = 0.05;
  dome.castShadow = !isSoftwareGl;
  dome.receiveShadow = !isSoftwareGl;
  domeGroup.add(dome);

  // Dark titanium base collar + equator ring + 4 geodesic meridian ribs
  const collarGeom = track(new THREE.TorusGeometry(0.755, 0.028, 8, 28));
  const collar = new THREE.Mesh(collarGeom, titaniumMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.07;
  domeGroup.add(collar);

  const upperRingGeom = track(new THREE.TorusGeometry(0.56, 0.016, 8, 24));
  const upperRing = new THREE.Mesh(upperRingGeom, copperTrimMat);
  upperRing.rotation.x = Math.PI / 2;
  upperRing.position.y = 0.54;
  domeGroup.add(upperRing);

  const ribGeom = track(new THREE.TorusGeometry(0.758, 0.013, 6, 24, Math.PI));
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(ribGeom, titaniumMat);
    rib.position.y = 0.05;
    rib.rotation.y = (i / 4) * Math.PI;
    domeGroup.add(rib);
  }

  // 3. Illuminated Observation Viewports
  const viewportFrameGeom = track(new THREE.BoxGeometry(0.19, 0.13, 0.04));
  const viewportGlassGeom = track(new THREE.BoxGeometry(0.15, 0.09, 0.05));
  [0.55, 1.55, 3.85].forEach((ang) => {
    const vpGroup = new THREE.Group();
    vpGroup.position.set(Math.cos(ang) * 0.71, 0.24, Math.sin(ang) * 0.71);
    vpGroup.rotation.y = -ang + Math.PI / 2;
    vpGroup.add(new THREE.Mesh(viewportFrameGeom, titaniumMat));
    vpGroup.add(new THREE.Mesh(viewportGlassGeom, windowGlowMat));
    domeGroup.add(vpGroup);
  });

  // 4. Airlock Tunnel & Bulkhead Hatch
  const airlockGeom = track(new THREE.CylinderGeometry(0.2, 0.2, 0.54, 16));
  const airlock = new THREE.Mesh(airlockGeom, titaniumMat);
  airlock.rotation.z = Math.PI / 2;
  airlock.position.set(0.66, 0.22, 0);
  airlock.castShadow = !isSoftwareGl;
  domeGroup.add(airlock);

  const hatchRingGeom = track(new THREE.TorusGeometry(0.2, 0.022, 8, 16));
  const hatchRing = new THREE.Mesh(hatchRingGeom, copperTrimMat);
  hatchRing.rotation.y = Math.PI / 2;
  hatchRing.position.set(0.92, 0.22, 0);
  domeGroup.add(hatchRing);

  // 5. External Cryogenic O2 / Methane Tanks + Manifold Pipe
  const tankGeom = track(new THREE.CylinderGeometry(0.11, 0.11, 0.44, 12));
  const tankCapGeom = track(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  [-0.16, 0.16].forEach((tx) => {
    const tMesh = new THREE.Mesh(tankGeom, hullMat);
    tMesh.position.set(tx, 0.28, -0.92);
    tMesh.castShadow = !isSoftwareGl;
    domeGroup.add(tMesh);

    const capMesh = new THREE.Mesh(tankCapGeom, copperTrimMat);
    capMesh.position.set(tx, 0.5, -0.92);
    domeGroup.add(capMesh);
  });

  // 6. Deep-Space High-Gain Parabolic Comms Dish & Beacon
  const mastGeom = track(new THREE.CylinderGeometry(0.02, 0.028, 0.34, 8));
  const mast = new THREE.Mesh(mastGeom, titaniumMat);
  mast.position.set(-0.18, 0.92, -0.1);
  domeGroup.add(mast);

  const dishGeom = track(new THREE.SphereGeometry(0.19, 16, 10, 0, Math.PI * 2, 0, 0.72));
  const dish = new THREE.Mesh(dishGeom, hullMat);
  dish.position.set(-0.18, 1.07, -0.02);
  dish.rotation.x = Math.PI * 0.65;
  domeGroup.add(dish);

  const beaconGeom = track(new THREE.SphereGeometry(0.032, 10, 10));
  const beaconMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf97316,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    })
  );
  const beacon = new THREE.Mesh(beaconGeom, beaconMat);
  beacon.position.set(0.05, 0.85, 0.05);
  domeGroup.add(beacon);

  // 7. Twin Hinged Solar Wing Arrays
  const solarGroup = new THREE.Group();
  solarGroup.position.set(0, 0, 1.18);
  const panelGeom = track(new THREE.BoxGeometry(0.58, 0.016, 0.38));
  const panelFrameGeom = track(new THREE.BoxGeometry(0.61, 0.012, 0.41));
  const panelMastGeom = track(new THREE.CylinderGeometry(0.022, 0.028, 0.28, 8));

  [-0.36, 0.36].forEach((sx) => {
    const pMast = new THREE.Mesh(panelMastGeom, titaniumMat);
    pMast.position.set(sx, 0.14, 0);
    solarGroup.add(pMast);

    const frame = new THREE.Mesh(panelFrameGeom, titaniumMat);
    frame.position.set(sx, 0.27, 0);
    frame.rotation.x = -0.34;
    solarGroup.add(frame);

    const panel = new THREE.Mesh(panelGeom, solarMat);
    panel.position.set(sx, 0.274, 0);
    panel.rotation.x = -0.34;
    panel.castShadow = !isSoftwareGl;
    solarGroup.add(panel);
  });
  domeGroup.add(solarGroup);

  return domeGroup;
}

/**
 * Builds the complete realistic Martian Island Terrain, Cliffs, 3D Craters,
 * Instanced Pebble/Shale Scatter (2 draw calls), and Research Outpost Dome.
 * Strictly zero wind/dust/storm elements for rock-solid FPS.
 */
export function buildRealisticMarsTerrain(
  isSoftwareGl: boolean,
  exclusionZones: ExclusionZone[]
): MarsTerrainResult {
  const disposables: { dispose: () => void }[] = [];
  const terrainGroup = new THREE.Group();
  terrainGroup.name = 'MarsRealisticIslandTerrain';

  const { map: regolithMap, bumpMap: regolithBump, roughnessMap: regolithRough } =
    createMarsRegolithMaps(disposables);
  const { map: mountainMap, bumpMap: mountainBumpMap } = createMarsMountainMaps(disposables);

  // 1. Main Playable 28m x 28m Regolith Plateau (flat at y = -0.001 for accurate JetBot wheel contact)
  const floorGeom = new THREE.PlaneGeometry(28, 28, 48, 48);
  floorGeom.rotateX(-Math.PI / 2);

  // Macro-scale geological vertex tint across the 28m plateau (basalt plains vs sunlit ochre flats)
  const fPos = floorGeom.attributes.position;
  const fCols = new Float32Array(fPos.count * 3);
  for (let i = 0; i < fPos.count; i++) {
    const [r, g, b] = sampleMarsFloorVertexColor(fPos.getX(i), fPos.getZ(i));
    fCols[i * 3] = r;
    fCols[i * 3 + 1] = g;
    fCols[i * 3 + 2] = b;
  }
  floorGeom.setAttribute('color', new THREE.BufferAttribute(fCols, 3));

  const marsFloorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: regolithMap,
    bumpMap: regolithBump,
    bumpScale: 0.048,
    roughnessMap: regolithRough,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.04,
  });
  const marsFloor = new THREE.Mesh(floorGeom, marsFloorMat);
  marsFloor.receiveShadow = !isSoftwareGl;
  marsFloor.position.y = -0.001;
  terrainGroup.add(marsFloor);
  disposables.push(floorGeom, marsFloorMat);

  // 2. Sculpted 3D Island Escarpment Cliffs & Outer Deep Canyon Basin + Horizon Mesas
  terrainGroup.add(
    buildMarsIslandEscarpment(
      isSoftwareGl,
      regolithMap,
      regolithBump,
      mountainMap,
      mountainBumpMap,
      disposables
    )
  );

  // 3. Real 3D Rimmed Impact Craters
  terrainGroup.add(buildMarsCraters(isSoftwareGl, regolithMap, regolithBump, disposables));

  // 4. Instanced Ground Basalt Pebbles & Shale Scatter (2 draw calls)
  terrainGroup.add(buildInstancedMarsScatter(isSoftwareGl, exclusionZones, disposables));

  // 5. Upgraded Geodesic Mars Research Outpost
  terrainGroup.add(buildMarsResearchOutpost(isSoftwareGl, disposables));

  return {
    terrainGroup,
    regolithMap,
    regolithBumpMap: regolithBump,
    regolithRoughnessMap: regolithRough,
    mountainMap,
    mountainBumpMap,
    dispose: () => {
      for (const item of disposables) {
        item.dispose();
      }
    },
  };
}
