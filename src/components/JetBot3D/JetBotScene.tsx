import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildJetBotProcedural, applyExplodedView } from './proceduralJetBot';
import { buildArenaScene } from './ArenaScene';
import { createWheelDustSystem } from './WheelDustSystem';
import { createMarsCelestialSystem } from './MarsCelestialSystem';
import { robotAudio } from './audioSynth';
import { DriveState, RenderMode, ViewPreset, EnvironmentMap } from '../../types/robot';
import { JETBOT_COMPONENTS } from '../../data/componentsData';
import { stepCasterKinematics, CasterWheelState } from './casterKinematics';
import {
  captureDriveOrbitOffset,
  clampDriveFollowZoom,
  computeDisplacedDriveCamera,
  computeInspectPresetPose,
  computeRestoredDriveCamera,
  computeRotatedOrbitOffset,
  createInitialDriveCamera,
  createInitialInspectCamera,
  DRIVE_DEFAULT_DISTANCE_MAX,
  DRIVE_DEFAULT_DISTANCE_MIN,
  DriveCameraSnapshot,
  INSPECT_DEFAULT_DISTANCE_MAX,
  INSPECT_DEFAULT_DISTANCE_MIN,
  InspectCameraSnapshot,
} from './sceneModeCamera';

interface JetBotSceneProps {
  explodedValue: number;
  renderMode: RenderMode;
  isAutoRotate: boolean;
  selectedComponentId: string | null;
  onSelectComponent: (id: string | null) => void;
  isDriveMode: boolean;
  driveState: DriveState;
  setDriveState: React.Dispatch<React.SetStateAction<DriveState>>;
  viewPreset: ViewPreset;
  modelScale?: number;
  onObstaclesToppledChange?: (toppled: number, total: number) => void;
  resetObstaclesTrigger?: number;
  inspectResetTrigger?: number;
  driveResetTrigger?: number;
  driveCamResetTrigger?: number;
  zoomState?: 'in' | 'out' | null;
  environmentMap?: EnvironmentMap;
  isDigging?: boolean;
  astronautDigTrigger?: { seq: number; colorHex: string } | null;
  astronautReceiveTrigger?: number;
  astronautCancelTrigger?: number;
}

// Pre-allocated reusable math scratch variables outside loop for Zero GC
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();

export const JetBotScene: React.FC<JetBotSceneProps> = ({
  explodedValue,
  renderMode,
  isAutoRotate,
  selectedComponentId,
  onSelectComponent,
  isDriveMode,
  driveState,
  setDriveState,
  viewPreset,
  modelScale = 1.4,
  onObstaclesToppledChange,
  resetObstaclesTrigger = 0,
  inspectResetTrigger = 0,
  driveResetTrigger = 0,
  driveCamResetTrigger = 0,
  zoomState = null,
  environmentMap = 'mars-planet',
  isDigging = false,
  astronautDigTrigger = null,
  astronautReceiveTrigger = 0,
  astronautCancelTrigger = 0,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Mutable refs to decouple React re-renders from the 60fps WebGL loop
  const propsRef = useRef({
    explodedValue,
    renderMode,
    isAutoRotate,
    selectedComponentId,
    isDriveMode,
    driveState,
    viewPreset,
    modelScale,
    onObstaclesToppledChange,
    resetObstaclesTrigger,
    inspectResetTrigger,
    driveResetTrigger,
    driveCamResetTrigger,
    zoomState,
    environmentMap,
    isDigging,
    astronautDigTrigger,
    astronautReceiveTrigger,
    astronautCancelTrigger,
  });

  const lastResetTrigger = useRef(resetObstaclesTrigger);

  useEffect(() => {
    propsRef.current = {
      explodedValue,
      renderMode,
      isAutoRotate,
      selectedComponentId,
      isDriveMode,
      driveState,
      viewPreset,
      modelScale,
      onObstaclesToppledChange,
      resetObstaclesTrigger,
      inspectResetTrigger,
      driveResetTrigger,
      driveCamResetTrigger,
      zoomState,
      environmentMap,
      isDigging,
      astronautDigTrigger,
      astronautReceiveTrigger,
      astronautCancelTrigger,
    };
  }, [
    explodedValue,
    renderMode,
    isAutoRotate,
    selectedComponentId,
    isDriveMode,
    driveState,
    viewPreset,
    modelScale,
    onObstaclesToppledChange,
    resetObstaclesTrigger,
    inspectResetTrigger,
    driveResetTrigger,
    driveCamResetTrigger,
    zoomState,
    environmentMap,
    isDigging,
    astronautDigTrigger,
    astronautReceiveTrigger,
    astronautCancelTrigger,
  ]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Detect Software WebGL
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Setup Renderer
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    // 3. Scene, Fog & Camera - Extended far plane to 120 for distant celestial bodies
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060911);
    scene.fog = new THREE.FogExp2(0x060911, 0.08);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 120);
    camera.position.set(0.68, 0.44, 0.68);

    // Studio Environment map via RoomEnvironment & PMREMGenerator
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 4. Lighting Rig
    const keyLight = new THREE.DirectionalLight(0xfff5e6, 2.3);
    keyLight.position.set(2.0, 4.0, 2.5);
    keyLight.castShadow = !isSoftwareGl;
    if (keyLight.shadow) {
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 10;
      keyLight.shadow.camera.left = -2;
      keyLight.shadow.camera.right = 2;
      keyLight.shadow.camera.top = 2;
      keyLight.shadow.camera.bottom = -2;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 1.25);
    hemiLight.position.set(0, 5, 0);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0x10b981, 1.1);
    rimLight.position.set(-3.0, 2.0, -3.0);
    scene.add(rimLight);

    // 5. Controls & Independent Mode Camera Snapshots
    let inspectCam: InspectCameraSnapshot = createInitialInspectCamera();
    let driveCam: DriveCameraSnapshot = createInitialDriveCamera();
    let prevDriveMode = propsRef.current.isDriveMode;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.zoomSpeed = 1.35;

    const applyOrbitLimitsForMode = (driveMode: boolean) => {
      if (driveMode) {
        controls.minDistance = DRIVE_DEFAULT_DISTANCE_MIN;
        controls.maxDistance = DRIVE_DEFAULT_DISTANCE_MAX;
        controls.minPolarAngle = 0.06;
        controls.maxPolarAngle = Math.PI * 0.48;
        controls.enablePan = false;
        controls.enableZoom = false; // Drive zoom is handled cleanly via wheel/I/O follow distance
        controls.autoRotate = false;
      } else {
        controls.minDistance = INSPECT_DEFAULT_DISTANCE_MIN;
        controls.maxDistance = INSPECT_DEFAULT_DISTANCE_MAX;
        controls.minPolarAngle = 0.02;
        controls.maxPolarAngle = Math.PI - 0.02;
        controls.enablePan = true;
        controls.enableZoom = true;
      }
    };

    applyOrbitLimitsForMode(prevDriveMode);
    if (prevDriveMode) {
      const startDrive = computeRestoredDriveCamera(driveCam, 0, 0, 0, 0);
      camera.position.set(...startDrive.position);
      controls.target.set(...startDrive.target);
    } else {
      camera.position.set(...inspectCam.position);
      controls.target.set(...inspectCam.target);
    }
    controls.update();

    // Allow rotating around JetBot with EITHER Left OR Right mouse button
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    // Prevent default right-click context menu so right-button orbit is uninterrupted
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('contextmenu', handleContextMenu);

    // Track user drag state by pointerId to support simultaneous D-pad touch + canvas drag,
    // left/right mouse buttons, and Shift+drag while Turbo driving.
    const activeCanvasPointers = new Map<number, { x: number; y: number }>();
    let shiftOrbitPointerId: number | null = null;
    let pointerDownPos = { x: 0, y: 0 };
    let pointerDownTime = 0;
    let dragDistance = 0;
    let isUserOrbiting = false;
    let isTransitioningToTarget = false;
    let orbitEndTimer: number | null = null;

    let targetCamPos = new THREE.Vector3().copy(camera.position);
    let targetCamLookAt = new THREE.Vector3().copy(controls.target);

    const blurFocusedUiForCanvas = () => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return;
      const tag = active.tagName?.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') {
        active.blur();
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      blurFocusedUiForCanvas();

      activeCanvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeCanvasPointers.size === 1) {
        pointerDownPos = { x: e.clientX, y: e.clientY };
        pointerDownTime = performance.now();
        dragDistance = 0;
      }

      if (propsRef.current.isDriveMode) {
        // Locking custom orbit immediately on canvas pointerdown prevents auto-follow damping from fighting drag
        driveCam.hasCustomOrbit = true;
        // OrbitControls disables rotation when Shift is held and enablePan=false; handle Shift+drag explicitly
        if (e.shiftKey && e.pointerType !== 'touch' && (e.button === 0 || e.button === 2)) {
          shiftOrbitPointerId = e.pointerId;
          isUserOrbiting = true;
        }
      } else {
        isTransitioningToTarget = false;
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const tracked = activeCanvasPointers.get(e.pointerId);
      if (tracked) {
        const dx = e.clientX - tracked.x;
        const dy = e.clientY - tracked.y;
        tracked.x = e.clientX;
        tracked.y = e.clientY;

        const totalDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
        dragDistance = Math.max(dragDistance, totalDist);
        if (totalDist > 3) {
          isUserOrbiting = true;
          if (!propsRef.current.isDriveMode) {
            isTransitioningToTarget = false;
          } else {
            driveCam.hasCustomOrbit = true;
          }
        }

        // Manual spherical rotation when Shift (Turbo) is held during mouse drag in Drive Mode
        if (shiftOrbitPointerId === e.pointerId && propsRef.current.isDriveMode) {
          const clientH = Math.max(200, renderer.domElement.clientHeight || window.innerHeight);
          const rotDeltaAzimuth = (-2 * Math.PI * dx) / clientH;
          const rotDeltaPolar = (-2 * Math.PI * dy) / clientH;
          const currentOffset = captureDriveOrbitOffset(
            [camera.position.x, camera.position.y, camera.position.z],
            [controls.target.x, controls.target.y, controls.target.z]
          );
          const nextOffset = computeRotatedOrbitOffset(
            currentOffset,
            rotDeltaAzimuth,
            rotDeltaPolar,
            controls.minPolarAngle,
            controls.maxPolarAngle
          );
          camera.position.set(
            controls.target.x + nextOffset[0],
            controls.target.y + nextOffset[1],
            controls.target.z + nextOffset[2]
          );
          driveCam.orbitOffset = nextOffset;
          controls.update();
        }
        return;
      }

      // Interactive hover feedback ONLY in Inspection Mode when no canvas pointer is active
      if (propsRef.current.isDriveMode) {
        renderer.domElement.style.cursor = 'default';
        return;
      }

      if (activeCanvasPointers.size === 0) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hovers = raycaster.intersectObjects(jetBot.rootGroup.children, true);
        const validHover = hovers.some((h) => h.object !== jetBot.contactShadow && (h.object as THREE.Mesh).isMesh);
        renderer.domElement.style.cursor = validHover ? 'pointer' : 'default';
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!activeCanvasPointers.has(e.pointerId)) {
        // Unrelated pointer (e.g., releasing mobile D-Pad finger) must NEVER disrupt active canvas orbit
        return;
      }
      activeCanvasPointers.delete(e.pointerId);
      if (shiftOrbitPointerId === e.pointerId) {
        shiftOrbitPointerId = null;
      }
      if (activeCanvasPointers.size === 0) {
        if (orbitEndTimer !== null) window.clearTimeout(orbitEndTimer);
        orbitEndTimer = window.setTimeout(() => {
          if (activeCanvasPointers.size === 0) {
            isUserOrbiting = false;
            dragDistance = 0;
          }
        }, 40);
      }
    };

    const handleWindowBlurPointers = () => {
      activeCanvasPointers.clear();
      shiftOrbitPointerId = null;
      isUserOrbiting = false;
      dragDistance = 0;
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('blur', handleWindowBlurPointers);

    controls.addEventListener('start', () => {
      if (propsRef.current.isDriveMode) {
        driveCam.hasCustomOrbit = true;
        isUserOrbiting = true;
      } else {
        isTransitioningToTarget = false;
      }
    });

    controls.addEventListener('end', () => {
      if (orbitEndTimer !== null) window.clearTimeout(orbitEndTimer);
      orbitEndTimer = window.setTimeout(() => {
        if (activeCanvasPointers.size === 0) {
          isUserOrbiting = false;
        }
      }, 120);
    });

    controls.addEventListener('change', () => {
      if (propsRef.current.isDriveMode) {
        driveCam.orbitOffset = captureDriveOrbitOffset(
          [camera.position.x, camera.position.y, camera.position.z],
          [controls.target.x, controls.target.y, controls.target.z]
        );
      } else {
        inspectCam = {
          position: [camera.position.x, camera.position.y, camera.position.z],
          target: [controls.target.x, controls.target.y, controls.target.z],
        };
        if (!isTransitioningToTarget) {
          targetCamPos.copy(camera.position);
          targetCamLookAt.copy(controls.target);
        }
      }
    });

    // 6. Build Procedural JetBot Model & Arena ("Sân CMU" or "Sao Hỏa")
    const jetBot = buildJetBotProcedural(isSoftwareGl);
    const initialScale = prevDriveMode ? 1.35 : (propsRef.current.modelScale || 1.4);
    jetBot.rootGroup.scale.set(initialScale, initialScale, initialScale);
    scene.add(jetBot.rootGroup);

    let currentEnvMap: EnvironmentMap = propsRef.current.environmentMap || 'mars-planet';
    let arena = buildArenaScene(isSoftwareGl, currentEnvMap);
    scene.add(arena.group);

    // Dynamic Wheel Dust Particle System (Bụi bánh xe khi di chuyển trên sân/sao hỏa)
    const wheelDust = createWheelDustSystem();
    scene.add(wheelDust.group);

    // Celestial Bodies & Asteroids near Mars (visible ONLY in Drive Mode on Mars)
    const marsCelestial = createMarsCelestialSystem(isSoftwareGl);
    scene.add(marsCelestial.group);

    // Studio atmosphere exclusively for Inspection Mode ("Mô hình 3D")
    const applyStudioInspectionAtmosphere = () => {
      scene.background = new THREE.Color(0x060911);
      scene.fog = new THREE.FogExp2(0x060911, 0.03);
      keyLight.color.set(0xfff5e6);
      keyLight.intensity = 2.35;
      hemiLight.color.set(0x38bdf8);
      hemiLight.groundColor.set(0x0f172a);
      rimLight.color.set(0x10b981);
    };

    // Environment atmosphere exclusively for Drive Mode ("Lái xe & Cảm biến")
    const applyDriveEnvironmentAtmosphere = (map: EnvironmentMap) => {
      if (map === 'mars-planet') {
        // Crisp, clear Martian sky & very light horizon-only depth blend (strictly NO dust storm haze)
        scene.background = new THREE.Color(0x1a0906);
        scene.fog = new THREE.FogExp2(0x26100a, 0.013);
        keyLight.color.set(0xffe6cc);
        keyLight.intensity = 2.95;
        hemiLight.color.set(0xf59e6c);
        hemiLight.groundColor.set(0x5c2210);
        rimLight.color.set(0xfb923c);
      } else {
        scene.background = new THREE.Color(0x060911);
        scene.fog = new THREE.FogExp2(0x060911, 0.05);
        keyLight.color.set(0xfff5e6);
        keyLight.intensity = 2.3;
        hemiLight.color.set(0x38bdf8);
        hemiLight.groundColor.set(0x0f172a);
        rimLight.color.set(0x10b981);
      }
    };

    if (prevDriveMode) {
      applyDriveEnvironmentAtmosphere(currentEnvMap);
    } else {
      applyStudioInspectionAtmosphere();
    }

    // Broadcast initial obstacle count
    if (propsRef.current.onObstaclesToppledChange) {
      const counts = arena.getToppledCount();
      propsRef.current.onObstaclesToppledChange(counts.toppled, counts.total);
    }

    // Ground plane strictly for Inspection Mode
    const gridHelper = new THREE.GridHelper(4, 20, 0x10b981, 0x1e293b);
    gridHelper.position.y = -0.001;
    scene.add(gridHelper);

    // Raycaster for click and hover inspection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleClick = (e: MouseEvent) => {
      if (propsRef.current.isDriveMode) return; // Never select inspection components while driving
      if (e.button !== 0) return; // Only trigger on left-click
      const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      const pressDuration = performance.now() - pointerDownTime;

      // Differentiate intentional click from deliberate orbit drags
      if (moveDist > 10 || pressDuration > 500) {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(jetBot.rootGroup.children, true);
      const validHits = intersects.filter((h) => h.object !== jetBot.contactShadow && (h.object as THREE.Mesh).isMesh);

      if (validHits.length > 0) {
        let currentObj: THREE.Object3D | null = validHits[0].object;
        let foundComponentId: string | null = null;

        while (currentObj && currentObj !== jetBot.rootGroup) {
          if (currentObj.userData?.componentId) {
            const match = JETBOT_COMPONENTS.find(
              (c) => c.meshGroup === currentObj!.userData.componentId || c.id === currentObj!.userData.componentId
            );
            if (match) {
              foundComponentId = match.id;
              break;
            }
          }

          // Fallback to group name if userData was unset on this tier
          if (currentObj.name) {
            const byName = JETBOT_COMPONENTS.find(
              (c) => c.id === currentObj!.name || c.meshGroup === currentObj!.name
            );
            if (byName) {
              foundComponentId = byName.id;
              break;
            }
          }

          currentObj = currentObj.parent;
        }

        if (foundComponentId) {
          robotAudio.playClick(900);
          onSelectComponent(foundComponentId);
        }
      }
    };

    renderer.domElement.addEventListener('click', handleClick);

    // Internal simulation state
    let robotX = 0;
    let robotZ = 0;
    let prevFollowRobotX = 0;
    let prevFollowTerrainElev = 0;
    let prevFollowRobotZ = 0;
    let robotHeading = 0; // radians
    let leftWheelRot = 0;
    let rightWheelRot = 0;
    let frontCasterState: CasterWheelState = { swivelAngle: 0, rollAngle: 0 };
    let rearCasterState: CasterWheelState = { swivelAngle: 0, rollAngle: 0 };
    let lidarTurretAngle = 0;

    // Physical inertia simulation state (Chassis roll & pitch tilt when steering or accelerating/braking)
    let bodyRoll = 0; // roll angle (radians) along local Z axis
    let bodyPitch = 0; // pitch angle (radians) along local X axis
    let bodySuspensionY = 0; // vertical suspension micro-bounce
    let terrainElev = 0; // elevation from climbable hills (meters)
    let terrainPitch = 0; // slope pitch tilt along robot heading
    let terrainRoll = 0; // slope roll tilt along robot right vector
    let prevLinearVel = 0; // previous linear velocity for acceleration impulse
    let lastTelemetryBroadcast = 0; // Throttled to 15Hz to maintain 60 FPS in WebGL
    let lastAlienResult: { nearestAlienDist: number; alienDetected: boolean; isCharging?: boolean; chargingBatteryLevel?: number; isAstronautFleeing?: boolean; astronautsCount?: number } | null = null;

    let lastPreset = propsRef.current.viewPreset;
    let lastComponentId = propsRef.current.selectedComponentId;
    let lastInspectResetTrigger = propsRef.current.inspectResetTrigger || 0;
    let lastDriveResetTrigger = propsRef.current.driveResetTrigger || 0;
    let lastDriveCamResetTrigger = propsRef.current.driveCamResetTrigger || 0;
    let lastAstronautDigSeq = propsRef.current.astronautDigTrigger?.seq || 0;
    let lastAstronautReceiveTrigger = propsRef.current.astronautReceiveTrigger || 0;
    let lastAstronautCancelTrigger = propsRef.current.astronautCancelTrigger || 0;
    let lastAstronautDigSfxAt = 0;
    let prevAstronautStatus: string = 'idle';
    let prevAstronautCanReceiveZ = false;

    // Mouse wheel listener: Drive Mode zooms Drive camera independently without touching Inspection Mode
    const handleWheel = (e: WheelEvent) => {
      if (propsRef.current.isDriveMode) {
        e.preventDefault();
        const zoomDelta = e.deltaY * 0.0016;
        driveCam = clampDriveFollowZoom(driveCam, zoomDelta);
        if (driveCam.hasCustomOrbit) {
          _vec3B.subVectors(camera.position, controls.target);
          const dist = _vec3B.length();
          if (dist > 0.001) {
            const nextDist = Math.min(DRIVE_DEFAULT_DISTANCE_MAX - 0.5, Math.max(0.35, dist + zoomDelta));
            _vec3B.normalize().multiplyScalar(nextDist);
            camera.position.copy(controls.target).add(_vec3B);
            camera.position.y = Math.max(terrainElev + 0.12, camera.position.y);
            driveCam.orbitOffset = captureDriveOrbitOffset(
              [camera.position.x, camera.position.y, camera.position.z],
              [controls.target.x, controls.target.y, controls.target.z]
            );
            controls.update();
          }
        }
      } else {
        isTransitioningToTarget = false;
      }
    };
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });

    // Keyboard zoom keys 'KeyI' and 'KeyO'
    const activeZoomKeys = new Set<string>();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.code === 'KeyI' || e.code === 'KeyO') {
        activeZoomKeys.add(e.code);
        if (!propsRef.current.isDriveMode) {
          isTransitioningToTarget = false;
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyI' || e.code === 'KeyO') {
        activeZoomKeys.delete(e.code);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Camera Presets adapted strictly for Inspection Mode
    const applyCameraPreset = (preset: ViewPreset) => {
      const pose = computeInspectPresetPose(preset);
      targetCamPos.set(...pose.position);
      targetCamLookAt.set(...pose.target);
      isTransitioningToTarget = true;
    };

    // Material highlight cache
    const originalEmissive = new Map<THREE.Mesh, THREE.Color>();
    jetBot.highlightMeshes.forEach((meshes) => {
      meshes.forEach((mesh) => {
        if ('emissive' in mesh.material) {
          originalEmissive.set(mesh, (mesh.material as THREE.MeshStandardMaterial).emissive.clone());
        }
      });
    });

    // 7. Render Loop
    let animationFrameId = 0;
    let timeoutId = 0;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          timeoutId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          timeoutId = window.setTimeout(cb, 80);
        }
      };
      timeoutId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      const delta = Math.min(clock.getDelta(), 0.1);
      const props = propsRef.current;

      // Strictly separate Scale, Exploded View & Mode Transitions between the two views
      const currentScale = props.isDriveMode ? 1.35 : (props.modelScale || 1.4);
      if (jetBot.rootGroup.scale.x !== currentScale) {
        jetBot.rootGroup.scale.set(currentScale, currentScale, currentScale);
      }
      const groundOffsetY = 0.0544 * currentScale;

      // Handle Environment Map Switcher (applies ONLY when in Drive Mode)
      const requestedEnv = props.environmentMap || 'mars-planet';
      if (requestedEnv !== currentEnvMap) {
        currentEnvMap = requestedEnv;
        arena.dispose?.();
        scene.remove(arena.group);
        arena = buildArenaScene(isSoftwareGl, currentEnvMap);
        scene.add(arena.group);
        if (currentEnvMap === 'mars-planet') {
          wheelDust.reset();
        }
        if (props.isDriveMode) {
          applyDriveEnvironmentAtmosphere(currentEnvMap);
        }

        if (props.onObstaclesToppledChange) {
          const counts = arena.getToppledCount();
          props.onObstaclesToppledChange(counts.toppled, counts.total);
        }
      }

      // Handle atomic transition between Inspection Mode ("Mô hình 3D") and Drive Mode ("Lái xe & Cảm biến")
      if (props.isDriveMode !== prevDriveMode) {
        if (props.isDriveMode) {
          // Switching Inspection -> Drive: save Inspection camera & immediately restore Drive camera
          inspectCam = {
            position: [camera.position.x, camera.position.y, camera.position.z],
            target: [controls.target.x, controls.target.y, controls.target.z],
          };
          isTransitioningToTarget = false;
          activeCanvasPointers.clear();
          shiftOrbitPointerId = null;
          isUserOrbiting = false;
          dragDistance = 0;
          applyOrbitLimitsForMode(true);

          const startTerrain = arena.getElevationAt
            ? arena.getElevationAt(robotX, robotZ, robotHeading)
            : { elevation: 0, slopePitch: 0, slopeRoll: 0 };
          terrainElev = startTerrain.elevation;
          terrainPitch = startTerrain.slopePitch;
          terrainRoll = startTerrain.slopeRoll;

          const restoredDrive = computeRestoredDriveCamera(
            driveCam,
            robotX,
            terrainElev,
            robotZ,
            robotHeading
          );
          camera.position.set(...restoredDrive.position);
          controls.target.set(...restoredDrive.target);
          prevFollowRobotX = robotX;
          prevFollowTerrainElev = terrainElev;
          prevFollowRobotZ = robotZ;
          controls.update();

          applyDriveEnvironmentAtmosphere(currentEnvMap);
        } else {
          // Switching Drive -> Inspection: save Drive camera offset & immediately restore Inspection camera at origin
          driveCam.orbitOffset = captureDriveOrbitOffset(
            [camera.position.x, camera.position.y, camera.position.z],
            [controls.target.x, controls.target.y, controls.target.z]
          );
          isTransitioningToTarget = false;
          activeCanvasPointers.clear();
          shiftOrbitPointerId = null;
          isUserOrbiting = false;
          dragDistance = 0;
          applyOrbitLimitsForMode(false);

          bodyRoll = 0;
          bodyPitch = 0;
          terrainElev = 0;
          terrainPitch = 0;
          terrainRoll = 0;
          bodySuspensionY = 0;
          prevLinearVel = 0;

          jetBot.rootGroup.rotation.order = 'YXZ';
          jetBot.rootGroup.position.set(0, groundOffsetY, 0);
          jetBot.rootGroup.rotation.set(0, 0, 0);

          camera.position.set(...inspectCam.position);
          controls.target.set(...inspectCam.target);
          controls.update();

          applyStudioInspectionAtmosphere();
        }
        prevDriveMode = props.isDriveMode;
      }

      // Handle Obstacles Reset Trigger
      if (lastResetTrigger.current !== props.resetObstaclesTrigger) {
        lastResetTrigger.current = props.resetObstaclesTrigger;
        arena.resetAllObstacles();
        if (props.onObstaclesToppledChange) {
          const counts = arena.getToppledCount();
          props.onObstaclesToppledChange(counts.toppled, counts.total);
        }
      }

      // Update dynamic obstacle toppling physics
      arena.updateObstaclesPhysics(delta);

      // Astronaut Dig & Deliver Task Triggers
      const reqAstroDig = props.astronautDigTrigger;
      if (reqAstroDig && reqAstroDig.seq !== lastAstronautDigSeq) {
        lastAstronautDigSeq = reqAstroDig.seq;
        const parsedColor = Number.parseInt(reqAstroDig.colorHex.replace('#', ''), 16);
        const colorInt = Number.isFinite(parsedColor) ? parsedColor : 0xf59e0b;
        _vec3A.set(robotX, 0, robotZ);
        arena.startAstronautDig?.(_vec3A, colorInt);
      }

      const reqAstroReceive = props.astronautReceiveTrigger || 0;
      if (reqAstroReceive !== lastAstronautReceiveTrigger) {
        lastAstronautReceiveTrigger = reqAstroReceive;
        const handoffSpot = arena.completeAstronautReceive?.();
        if (handoffSpot && currentEnvMap !== 'mars-planet') {
          wheelDust.triggerDigBurst(handoffSpot.x, handoffSpot.y, handoffSpot.z, 12);
        }
      }

      const reqAstroCancel = props.astronautCancelTrigger || 0;
      if (reqAstroCancel !== lastAstronautCancelTrigger) {
        lastAstronautCancelTrigger = reqAstroCancel;
        arena.cancelAstronautTask?.();
      }

      // Always update dynamic moving aliens & spaceship hangar docking on Mars!
      _vec3A.set(robotX, 0, robotZ);
      lastAlienResult = arena.updateAliens(delta, clock.getElapsedTime(), _vec3A);

      // Manage visibility strictly between Drive Mode and Inspection Mode
      arena.group.visible = props.isDriveMode;
      gridHelper.visible = !props.isDriveMode;
      jetBot.contactShadow.visible = !props.isDriveMode || Math.abs(props.explodedValue) < 0.05;

      // Exploded View applies ONLY in Inspection Mode (keep assembled while driving)
      applyExplodedView(jetBot, props.isDriveMode ? 0 : props.explodedValue);

      // Dynamic flexible CSI ribbon cable movement & flutter
      if (jetBot.updateCableMovement) {
        jetBot.updateCableMovement(
          delta,
          props.isDriveMode ? props.driveState.linearVelocity : 0,
          props.isDriveMode ? props.driveState.angularVelocity : 0,
          clock.getElapsedTime()
        );
      }

      // Dynamic Wheel Dust Particle System (strictly disabled on Mars to keep FPS steady and zero dust)
      const allowWheelDust = props.isDriveMode && currentEnvMap !== 'mars-planet';
      wheelDust.group.visible = allowWheelDust;
      if (allowWheelDust) {
        wheelDust.update(
          delta,
          props.isDriveMode,
          robotX,
          robotZ,
          robotHeading,
          props.driveState.linearVelocity,
          props.driveState.angularVelocity,
          currentScale,
          currentEnvMap
        );
      }

      const currentRobotPos = props.isDriveMode
        ? _vec3A.set(robotX, groundOffsetY + bodySuspensionY + terrainElev, robotZ)
        : _vec3A.set(0, groundOffsetY + bodySuspensionY, 0);

      // Mars Celestial System (visible ONLY in Drive Mode on Mars!)
      marsCelestial.update(
        delta,
        clock.getElapsedTime(),
        currentRobotPos,
        props.isDriveMode ? currentEnvMap : 'cmu-arena'
      );

      // Handle Zoom In / Zoom Out by Keyboard (I / O) or On-screen Buttons per Mode
      const isZoomIn = activeZoomKeys.has('KeyI') || props.zoomState === 'in';
      const isZoomOut = activeZoomKeys.has('KeyO') || props.zoomState === 'out';

      if (isZoomIn) {
        if (props.isDriveMode) {
          driveCam = clampDriveFollowZoom(driveCam, -Math.max(1.4, driveCam.followDistance * 1.1) * delta);
          if (driveCam.hasCustomOrbit) {
            _vec3B.subVectors(camera.position, controls.target);
            const dist = _vec3B.length();
            if (dist > 0.355) {
              const step = Math.min(dist - 0.35, Math.max(0.3, dist * 1.5) * delta);
              camera.position.addScaledVector(_vec3B.normalize(), -step);
              driveCam.orbitOffset = captureDriveOrbitOffset(
                [camera.position.x, camera.position.y, camera.position.z],
                [controls.target.x, controls.target.y, controls.target.z]
              );
              controls.update();
            }
          }
        } else {
          isTransitioningToTarget = false;
          _vec3B.subVectors(controls.target, camera.position);
          const dist = _vec3B.length();
          if (dist > controls.minDistance + 0.005) {
            const zoomRate = Math.max(0.2, dist * 1.6);
            const step = Math.min(dist - controls.minDistance, zoomRate * delta);
            camera.position.addScaledVector(_vec3B.normalize(), step);
            controls.update();
          }
        }
      } else if (isZoomOut) {
        if (props.isDriveMode) {
          driveCam = clampDriveFollowZoom(driveCam, Math.max(1.4, driveCam.followDistance * 1.1) * delta);
          if (driveCam.hasCustomOrbit) {
            _vec3B.subVectors(camera.position, controls.target);
            const dist = _vec3B.length();
            const maxOrbitDist = DRIVE_DEFAULT_DISTANCE_MAX - 0.5;
            if (dist < maxOrbitDist) {
              const step = Math.min(maxOrbitDist - dist, Math.max(0.3, dist * 1.5) * delta);
              camera.position.addScaledVector(_vec3B.normalize(), step);
              driveCam.orbitOffset = captureDriveOrbitOffset(
                [camera.position.x, camera.position.y, camera.position.z],
                [controls.target.x, controls.target.y, controls.target.z]
              );
              controls.update();
            }
          }
        } else {
          isTransitioningToTarget = false;
          _vec3B.subVectors(camera.position, controls.target);
          const dist = _vec3B.length();
          if (dist < controls.maxDistance - 0.01) {
            const zoomRate = Math.max(0.2, dist * 1.6);
            const step = Math.min(controls.maxDistance - dist, zoomRate * delta);
            camera.position.addScaledVector(_vec3B.normalize(), step);
            controls.update();
          }
        }
      }

      // Drive Mode Kinematics & RPLIDAR Real-time Simulation
      if (props.isDriveMode) {
        const reqDriveReset = props.driveResetTrigger || 0;
        const reqDriveCamReset = props.driveCamResetTrigger || 0;
        const externalZeroReset =
          props.driveState.position.x === 0 &&
          props.driveState.position.z === 0 &&
          (Math.abs(robotX) > 0.05 || Math.abs(robotZ) > 0.05);

        if (reqDriveReset !== lastDriveResetTrigger || externalZeroReset) {
          lastDriveResetTrigger = reqDriveReset;
          robotX = 0;
          robotZ = 0;
          robotHeading = 0;
          prevFollowRobotX = 0;
          prevFollowTerrainElev = 0;
          prevFollowRobotZ = 0;
          terrainElev = 0;
          terrainPitch = 0;
          terrainRoll = 0;
          frontCasterState = { swivelAngle: 0, rollAngle: 0 };
          rearCasterState = { swivelAngle: 0, rollAngle: 0 };
          wheelDust.reset();
          driveCam = createInitialDriveCamera();
          const resetPose = computeRestoredDriveCamera(driveCam, 0, 0, 0, 0);
          camera.position.set(...resetPose.position);
          controls.target.set(...resetPose.target);
          controls.update();
        } else if (reqDriveCamReset !== lastDriveCamResetTrigger) {
          lastDriveCamResetTrigger = reqDriveCamReset;
          driveCam = createInitialDriveCamera();
          const resetPose = computeRestoredDriveCamera(
            driveCam,
            robotX,
            terrainElev,
            robotZ,
            robotHeading
          );
          camera.position.set(...resetPose.position);
          controls.target.set(...resetPose.target);
          controls.update();
        }

        const linearVel = props.driveState.linearVelocity;
        const angularVel = props.driveState.angularVelocity;

        // Check if collision with obstacles causes them to topple
        const knocked = arena.checkAndToppleObstacles(robotX, robotZ, linearVel);
        if (knocked && props.onObstaclesToppledChange) {
          const counts = arena.getToppledCount();
          props.onObstaclesToppledChange(counts.toppled, counts.total);
        }

        // Update robot heading and position
        robotHeading += angularVel * delta;
        const moveDist = linearVel * delta;

        // Calculate trial movement
        const nextX = robotX + Math.sin(robotHeading) * moveDist;
        const nextZ = robotZ + Math.cos(robotHeading) * moveDist;

        // Collision detection against outer arena bounds (vast 28m on Mars!)
        const maxBound = currentEnvMap === 'mars-planet' ? 12.5 : 2.8;
        let blocked = false;
        if (Math.abs(nextX) > maxBound || Math.abs(nextZ) > maxBound) {
          blocked = true;
        }

        // Collision with obstacles
        for (const obs of arena.obstacles) {
          const dist = Math.hypot(nextX - obs.center.x, nextZ - obs.center.y);
          if (!obs.isToppled && dist < obs.radius + 0.16) {
            arena.checkAndToppleObstacles(robotX, robotZ, linearVel || 0.4);
            if (props.onObstaclesToppledChange) {
              const counts = arena.getToppledCount();
              props.onObstaclesToppledChange(counts.toppled, counts.total);
            }
            blocked = true;
            break;
          }
        }

        if (!blocked) {
          robotX = nextX;
          robotZ = nextZ;
        }

        // Differential drive wheel rotation
        const wheelRadius = 0.0554 * currentScale;
        const wheelBase = 0.276 * currentScale;
        const leftSpeed = (linearVel - (angularVel * wheelBase) / 2) / wheelRadius;
        const rightSpeed = (linearVel + (angularVel * wheelBase) / 2) / wheelRadius;

        leftWheelRot += leftSpeed * delta;
        rightWheelRot += rightSpeed * delta;

        // Unified drive wheel rotation around axle
        jetBot.groups.leftWheel.rotation.x = leftWheelRot;
        jetBot.groups.rightWheel.rotation.x = rightWheelRot;

        // Independent physically accurate & smoothly damped trailing-caster kinematics
        const casterRollerRadius = 0.021 * currentScale;
        const casterMountZ = 0.105 * currentScale;
        frontCasterState = stepCasterKinematics(
          frontCasterState,
          linearVel,
          angularVel,
          casterMountZ,
          casterRollerRadius,
          delta
        );
        rearCasterState = stepCasterKinematics(
          rearCasterState,
          linearVel,
          angularVel,
          -casterMountZ,
          casterRollerRadius,
          delta
        );

        jetBot.groups.frontCasterFork.rotation.y = frontCasterState.swivelAngle;
        jetBot.groups.frontCasterWheel.rotation.x = frontCasterState.rollAngle;
        jetBot.groups.rearCasterFork.rotation.y = rearCasterState.swivelAngle;
        jetBot.groups.rearCasterWheel.rotation.x = rearCasterState.rollAngle;

        // Physics Inertia & Body Tilt Simulation:
        // 1. Centrifugal roll when turning left/right (Lực ly tâm làm nghiêng thân xe sang phía ngoài góc cua)
        const lateralAccel = (linearVel * angularVel * 0.95) + (angularVel * 0.045);
        const targetBodyRoll = -Math.max(-0.14, Math.min(0.14, lateralAccel * 0.28));

        // 2. Pitch inertia during acceleration / braking (Chúi đầu khi phanh, ngửa đầu khi tăng tốc)
        const accelRate = (linearVel - prevLinearVel) / Math.max(delta, 0.001);
        prevLinearVel = linearVel;
        const targetBodyPitch = Math.max(-0.075, Math.min(0.075, (linearVel * 0.025) - (accelRate * 0.004)));

        // 3. Subtle road vibration during movement
        const isMoving = Math.abs(linearVel) > 0.01 || Math.abs(angularVel) > 0.02;
        const roadVibe = isMoving
          ? Math.sin(clock.getElapsedTime() * 28) * 0.0006 * Math.min(1.5, Math.abs(linearVel) * 2 + Math.abs(angularVel) * 0.2)
          : 0;

        // 4. Terrain slope adaptation (Physical hill climbing on Mars mounds)
        const terrain = arena.getElevationAt
          ? arena.getElevationAt(robotX, robotZ, robotHeading)
          : { elevation: 0, slopePitch: 0, slopeRoll: 0 };

        terrainElev = THREE.MathUtils.damp(terrainElev, terrain.elevation, 10.0, delta);
        terrainPitch = THREE.MathUtils.damp(terrainPitch, terrain.slopePitch, 8.5, delta);
        terrainRoll = THREE.MathUtils.damp(terrainRoll, terrain.slopeRoll, 8.5, delta);

        // Check proximity to climbable mounds or dig sites on Mars
        let canDig = false;
        let nearestDigSiteName: string | undefined = undefined;

        if (currentEnvMap === 'mars-planet' && arena.climbableMounds) {
          for (const mound of arena.climbableMounds) {
            const d = Math.hypot(robotX - mound.center.x, robotZ - mound.center.y);
            if (d < mound.radius + 0.4) {
              canDig = true;
              nearestDigSiteName = mound.label.split('(')[0].trim();
              break;
            }
          }
        }

        // Active digging effect (tactile excavator pitch vibration; strictly NO dust particles on Mars)
        let digPitchVibe = 0;
        if (propsRef.current.isDigging) {
          if (currentEnvMap !== 'mars-planet') {
            wheelDust.triggerDigBurst(robotX, terrainElev, robotZ, 4);
          }
          digPitchVibe = Math.sin(clock.getElapsedTime() * 32) * 0.045;
        }

        // Spring-damped inertial smoothing
        bodyRoll = THREE.MathUtils.damp(bodyRoll, targetBodyRoll, 8.5, delta);
        bodyPitch = THREE.MathUtils.damp(bodyPitch, targetBodyPitch, 9.0, delta);
        bodySuspensionY = THREE.MathUtils.damp(bodySuspensionY, roadVibe, 14.0, delta);

        // Position & Rotation in Aeronautical YXZ Euler Order:
        // First Yaw (Heading on ground plane), then Pitch (nose up/down with terrain slope), then Roll (lean left/right with terrain incline)!
        jetBot.rootGroup.rotation.order = 'YXZ';
        jetBot.rootGroup.position.set(robotX, groundOffsetY + bodySuspensionY + terrainElev, robotZ);
        jetBot.rootGroup.rotation.set(bodyPitch + terrainPitch + digPitchVibe, robotHeading, bodyRoll + terrainRoll);

        // Environmental Ambience (Mars Wind / Arena Tone) & Servo PWM "Rè Rè" Motor Sound
        robotAudio.updateDriveAmbience(
          true,
          currentEnvMap,
          linearVel,
          angularVel,
          clock.getElapsedTime()
        );

        // Spin RPLIDAR turret and drive pulley & cooling fan
        lidarTurretAngle += delta * 35; // ~5.5 Hz
        jetBot.groups.rplidarTurret.rotation.y = lidarTurretAngle;
        if (jetBot.groups.rplidarPulley) {
          jetBot.groups.rplidarPulley.rotation.y = lidarTurretAngle * 3.5;
        }
        if (jetBot.groups.coolingFan) {
          jetBot.groups.coolingFan.rotation.y += delta * 45;
        }

        // Update Point Cloud & Raycast Obstacles + Moving Aliens
        _vec3A.set(robotX, 0, robotZ);
        const scanResult = arena.updatePointCloud(_vec3A, robotHeading, lidarTurretAngle);
        const nearestDist = scanResult.minObstacleDist;
        const nearestAlienDist = scanResult.minAlienDist;

        if (nearestDist < 0.6) {
          robotAudio.playObstacleAlert(nearestDist);
        }

        // Astronaut excavation & handoff telemetry
        _vec3A.set(robotX, 0, robotZ);
        const astroTask = arena.getAstronautTaskTelemetry
          ? arena.getAstronautTaskTelemetry(_vec3A)
          : { status: 'idle' as const, canReceiveZ: false };

        if (astroTask.status === 'digging' && astroTask.activePos) {
          if (currentEnvMap !== 'mars-planet') {
            wheelDust.triggerDigBurst(astroTask.activePos.x, astroTask.activePos.y, astroTask.activePos.z, 3);
          }
          const nowSfx = performance.now();
          if (nowSfx - lastAstronautDigSfxAt > 500) {
            lastAstronautDigSfxAt = nowSfx;
            robotAudio.playDiggingSound();
          }
        }

        const astroStateChanged =
          astroTask.status !== prevAstronautStatus || astroTask.canReceiveZ !== prevAstronautCanReceiveZ;
        prevAstronautStatus = astroTask.status;
        prevAstronautCanReceiveZ = astroTask.canReceiveZ;

        // Telemetry state broadcast throttled to 15Hz (or immediately on astronaut handoff milestone)
        const nowMs = performance.now();
        if (nowMs - lastTelemetryBroadcast >= 66 || astroStateChanged) {
          lastTelemetryBroadcast = nowMs;
          setDriveState((prev) => ({
            ...prev,
            position: { x: robotX, z: robotZ },
            heading: ((-robotHeading * 180) / Math.PI + 360) % 360,
            leftWheelSpeed: leftSpeed,
            rightWheelSpeed: rightSpeed,
            nearestObstacleDistance: nearestDist,
            obstacleDetected: nearestDist < 0.6,
            nearestAlienDistance: nearestAlienDist,
            alienDetected: nearestAlienDist < 1.4,
            aliensCount: arena.aliens.length,
            isCharging: !!lastAlienResult?.isCharging,
            chargingBatteryLevel: lastAlienResult?.chargingBatteryLevel,
            terrainElevation: Math.round(terrainElev * 100) / 100,
            climbingAngle: Math.round(Math.hypot(terrainPitch, terrainRoll) * (180 / Math.PI)),
            astronautFleeing: !!lastAlienResult?.isAstronautFleeing,
            astronautsCount: lastAlienResult?.astronautsCount ?? 3,
            canDig,
            nearestDigSiteName,
            astronautTaskStatus: astroTask.status,
            astronautTaskName: astroTask.astronautName,
            astronautDistanceToBot: astroTask.distanceToBot,
            astronautCanReceiveZ: astroTask.canReceiveZ,
          }));
        }

        // Displacement tracking for free orbit camera follow in Drive Mode
        const prevX = prevFollowRobotX;
        const prevY = prevFollowTerrainElev;
        const prevZ = prevFollowRobotZ;
        prevFollowRobotX = robotX;
        prevFollowTerrainElev = terrainElev;
        prevFollowRobotZ = robotZ;

        if (isUserOrbiting || activeCanvasPointers.size > 0 || driveCam.hasCustomOrbit) {
          // Free 360° orbit around moving robot with Left/Right mouse button, Shift+drag, or Multi-touch!
          const displaced = computeDisplacedDriveCamera(
            [camera.position.x, camera.position.y, camera.position.z],
            robotX,
            terrainElev,
            robotZ,
            prevX,
            prevY,
            prevZ
          );
          camera.position.set(...displaced.position);
          controls.target.set(...displaced.target);
          driveCam.orbitOffset = displaced.orbitOffset;
        } else {
          // Third-person default camera follow behind the robot (prior to manual orbit)
          const desiredCamX = robotX - Math.sin(robotHeading) * driveCam.followDistance;
          const desiredCamZ = robotZ - Math.cos(robotHeading) * driveCam.followDistance;

          camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredCamX, 4, delta);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, driveCam.followHeight + terrainElev, 4, delta);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredCamZ, 4, delta);

          controls.target.x = THREE.MathUtils.damp(controls.target.x, robotX, 5, delta);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, 0.14 + terrainElev, 5, delta);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, robotZ, 5, delta);
        }
      } else {
        // Inspection Mode: Orbit around center robot (fade out driving ambience & servo hum)
        robotAudio.updateDriveAmbience(false, currentEnvMap, 0, 0, clock.getElapsedTime());
        bodyRoll = THREE.MathUtils.damp(bodyRoll, 0, 7.0, delta);
        bodyPitch = THREE.MathUtils.damp(bodyPitch, 0, 7.0, delta);
        terrainElev = THREE.MathUtils.damp(terrainElev, 0, 7.0, delta);
        terrainPitch = THREE.MathUtils.damp(terrainPitch, 0, 7.0, delta);
        terrainRoll = THREE.MathUtils.damp(terrainRoll, 0, 7.0, delta);
        bodySuspensionY = THREE.MathUtils.damp(bodySuspensionY, 0, 7.0, delta);
        prevLinearVel = 0;

        jetBot.rootGroup.rotation.order = 'YXZ';
        jetBot.rootGroup.position.set(0, groundOffsetY + bodySuspensionY, 0);
        jetBot.rootGroup.rotation.set(bodyPitch, 0, bodyRoll);

        // Slow RPLIDAR idle spin and drive pulley & cooling fan
        lidarTurretAngle += delta * 6;
        jetBot.groups.rplidarTurret.rotation.y = lidarTurretAngle;
        if (jetBot.groups.rplidarPulley) {
          jetBot.groups.rplidarPulley.rotation.y = lidarTurretAngle * 3.5;
        }
        if (jetBot.groups.coolingFan) {
          jetBot.groups.coolingFan.rotation.y += delta * 25;
        }

        // Check if explicit reset, selected component, or view preset changed in Inspection Mode
        const reqInspectReset = props.inspectResetTrigger || 0;
        if (reqInspectReset !== lastInspectResetTrigger) {
          lastInspectResetTrigger = reqInspectReset;
          lastPreset = props.viewPreset;
          applyCameraPreset(props.viewPreset);
        } else if (props.selectedComponentId !== lastComponentId) {
          lastComponentId = props.selectedComponentId;
          if (props.selectedComponentId) {
            const comp = JETBOT_COMPONENTS.find((c) => c.id === props.selectedComponentId);
            if (comp) {
              targetCamPos.set(...comp.cameraPosition);
              targetCamLookAt.set(...comp.cameraTarget);
              isTransitioningToTarget = true;
            }
          }
        } else if (props.viewPreset !== lastPreset) {
          lastPreset = props.viewPreset;
          applyCameraPreset(props.viewPreset);
        }

        // Only damp camera if explicitly transitioning to a preset/component target
        // AND the user is NOT holding or dragging the mouse/touch
        if (isTransitioningToTarget && activeCanvasPointers.size === 0 && !isUserOrbiting) {
          camera.position.x = THREE.MathUtils.damp(camera.position.x, targetCamPos.x, 4, delta);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, targetCamPos.y, 4, delta);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, targetCamPos.z, 4, delta);

          controls.target.x = THREE.MathUtils.damp(controls.target.x, targetCamLookAt.x, 4.5, delta);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, targetCamLookAt.y, 4.5, delta);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, targetCamLookAt.z, 4.5, delta);

          if (camera.position.distanceTo(targetCamPos) < 0.008) {
            isTransitioningToTarget = false;
          }
        }

        controls.autoRotate = Boolean(props.isAutoRotate);
        controls.autoRotateSpeed = 1.8;
      }

      // Component Highlighting & RenderMode applies ONLY in Inspection Mode
      const effectiveRenderMode = props.isDriveMode ? 'realistic' : props.renderMode;
      const effectiveSelectedId = props.isDriveMode ? null : props.selectedComponentId;

      jetBot.highlightMeshes.forEach((meshes, groupName) => {
        const isHighlight =
          effectiveSelectedId &&
          JETBOT_COMPONENTS.find((c) => c.id === effectiveSelectedId)?.meshGroup === groupName;

        meshes.forEach((mesh) => {
          if ('emissive' in mesh.material) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (isHighlight) {
              mat.emissive.setHex(0x10b981);
              mat.emissiveIntensity = 0.55;
            } else {
              const orig = originalEmissive.get(mesh);
              if (orig) {
                mat.emissive.copy(orig);
                mat.emissiveIntensity = 0.0;
              }
            }
          }
          if ('wireframe' in mesh.material) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.wireframe = effectiveRenderMode === 'wireframe';
            if (effectiveRenderMode === 'xray') {
              mat.transparent = true;
              mat.opacity = isHighlight ? 0.95 : 0.28;
            } else {
              mat.transparent = false;
              mat.opacity = 1.0;
            }
          }
        });
      });

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        animationFrameId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      animationFrameId = requestAnimationFrame(tick);
    }

    // Handle Window Resize
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      renderer.domElement.removeEventListener('click', handleClick);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      renderer.domElement.removeEventListener('contextmenu', handleContextMenu);
      if (orbitEndTimer !== null) window.clearTimeout(orbitEndTimer);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('blur', handleWindowBlurPointers);
      arena.dispose?.();
      wheelDust.dispose();
      marsCelestial.dispose();
      controls.dispose();
      renderer.dispose();
      robotAudio.stopAll();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full relative" />;
};
