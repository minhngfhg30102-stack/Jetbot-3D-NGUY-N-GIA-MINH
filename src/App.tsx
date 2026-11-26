import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  Gamepad2,
  TableProperties,
  Sparkles,
  Volume2,
  VolumeX,
  Bot,
  Image as ImageIcon,
  CheckCircle2,
  X,
  ExternalLink,
  ChevronRight,
  Backpack,
  Shovel,
  Maximize2,
  MapPin,
  Info,
  Cpu,
  Smartphone,
  Monitor,
  Code2,
  Camera,
  EyeOff,
} from 'lucide-react';
import { JetBotScene } from './components/JetBot3D/JetBotScene';
import { BottomDock } from './components/Controls/BottomDock';
import { DriveController } from './components/Controls/DriveController';
import {
  computeDriveVelocityFromKeys,
  isMovementDriveKey,
  normalizeDriveKeyCode,
  shouldIgnoreKeyboardTarget,
} from './components/Controls/keyboardDrive';
import { CameraFPV } from './components/Controls/CameraFPV';
import { ComponentTable } from './components/AnalysisTable/ComponentTable';
import { JetBotAIModal } from './components/AIAdvisor/JetBotAIModal';
import { ZoomControls } from './components/Controls/ZoomControls';
import { ShovelButton } from './components/Controls/ShovelButton';
import { DigDiscoveryModal } from './components/Controls/DigDiscoveryModal';
import { BackpackModal } from './components/Controls/BackpackModal';
import {
  AutonomousCodePanel,
  CustomCodeFile,
  IdeWorkspaceMode,
} from './components/Controls/AutonomousCodePanel';
import { robotAudio } from './components/JetBot3D/audioSynth';
import {
  ALL_PRESETS,
  CodeLanguage,
  LogEntry,
  PRESETS_BY_LANGUAGE,
  computeDangerProbability,
  runMultiLanguageProgram,
} from './components/JetBot3D/autonomousRunner';
import { DriveState, RenderMode, ViewPreset, EnvironmentMap, DigMode } from './types/robot';
import { JETBOT_COMPONENTS, CMU_LESSON_INFO } from './data/componentsData';
import { EXCAVATION_COMPONENTS } from './data/excavationData';
import { ExcavationComponent, InventoryItem } from './types/excavation';
import { rollWeightedExcavationComponent } from './components/Controls/excavationHelpers';

export type MobileModePreference = 'auto' | 'mobile' | 'desktop';

export default function App() {
  // Navigation View: '3d-inspect' | 'drive-sim' | 'table-analysis'
  const [activeView, setActiveView] = useState<'3d-inspect' | 'drive-sim' | 'table-analysis'>('3d-inspect');

  // Dedicated Mobile / Phone Mode ('auto' activates automatically on narrow screens < 768px)
  const [mobileModePref, setMobileModePref] = useState<MobileModePreference>(() => {
    try {
      const saved = localStorage.getItem('jetbot_mobile_mode_v1');
      if (saved === 'mobile' || saved === 'desktop' || saved === 'auto') {
        return saved;
      }
    } catch {}
    return 'auto';
  });
  const [isNarrowViewport, setIsNarrowViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsNarrowViewport(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('jetbot_mobile_mode_v1', mobileModePref);
    } catch {}
  }, [mobileModePref]);

  const isMobileMode =
    mobileModePref === 'mobile' || (mobileModePref === 'auto' && isNarrowViewport);

  const handleToggleMobileMode = () => {
    setMobileModePref((prev) => {
      if (prev === 'auto') {
        return isNarrowViewport ? 'desktop' : 'mobile';
      }
      return prev === 'mobile' ? 'desktop' : 'mobile';
    });
    robotAudio.playClick(740);
  };

  // Exclusive mobile bottom-sheet controllers so tabs/panels never cover each other on phones
  const [mobileInspectSheet, setMobileInspectSheet] = useState<'none' | 'dock' | 'asdw'>('none');
  const [mobileDriveTool, setMobileDriveTool] = useState<'none' | 'drive' | 'camera' | 'code'>('drive');

  // Environment Map Selection: 'mars-planet' (Sao Hỏa & Aliens) or 'cmu-arena' (Sa bàn CMU 10A)
  const [environmentMap, setEnvironmentMap] = useState<EnvironmentMap>('mars-planet');

  // 3D Scene Controls
  const [explodedValue, setExplodedValue] = useState<number>(0);
  const [renderMode, setRenderMode] = useState<RenderMode>('realistic');
  const [isAutoRotate, setIsAutoRotate] = useState<boolean>(false);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [viewPreset, setViewPreset] = useState<ViewPreset>('iso');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [modelScale, setModelScale] = useState<number>(1.4); // Enlarged 1.4x by default for clear inspection
  const [obstaclesCount, setObstaclesCount] = useState<{ toppled: number; total: number }>({ toppled: 0, total: 6 });
  const [resetObstaclesTrigger, setResetObstaclesTrigger] = useState<number>(0);
  const [inspectResetTrigger, setInspectResetTrigger] = useState<number>(0);
  const [driveResetTrigger, setDriveResetTrigger] = useState<number>(0);
  const [driveCamResetTrigger, setDriveCamResetTrigger] = useState<number>(0);

  // Zoom In / Zoom Out Controls State (Mouse Wheel + Key I & O)
  const [zoomState, setZoomState] = useState<'in' | 'out' | null>(null);
  const [isIActive, setIsIActive] = useState<boolean>(false);
  const [isOActive, setIsOActive] = useState<boolean>(false);

  const handleResetInspectView = () => {
    setSelectedComponentId(null);
    setViewPreset('iso');
    setInspectResetTrigger((prev) => prev + 1);
    robotAudio.playClick(850);
  };

  const handleResetObstacles = () => {
    setResetObstaclesTrigger((prev) => prev + 1);
    setObstaclesCount((prev) => ({ ...prev, toppled: 0 }));
  };

  // Drive Mode Simulation State
  const [driveState, setDriveState] = useState<DriveState>({
    isDriving: false,
    linearVelocity: 0,
    angularVelocity: 0,
    steerAngle: 0,
    leftWheelSpeed: 0,
    rightWheelSpeed: 0,
    heading: 0,
    position: { x: 0, z: 0 },
    nearestObstacleDistance: 2.5,
    obstacleDetected: false,
  });

  // Modals
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [aiInitialQuery, setAiInitialQuery] = useState<string>('');
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState<boolean>(false);

  // Excavation & Backpack State
  const [inventory, setInventory] = useState<Record<string, InventoryItem>>(() => {
    try {
      const saved = localStorage.getItem('jetbot_mars_inventory');
      if (saved) return JSON.parse(saved);
    } catch {}
    const starter1 = EXCAVATION_COMPONENTS.find((c) => c.id === 'chassis-frame')!;
    const starter2 = EXCAVATION_COMPONENTS.find((c) => c.id === 'caster-wheels')!;
    return {
      'chassis-frame': {
        ...starter1,
        count: 1,
        firstFoundAt: Date.now() - 3600000,
        foundLocationName: 'Trạm Đáp Tàu Vũ Trụ',
      },
      'caster-wheels': {
        ...starter2,
        count: 1,
        firstFoundAt: Date.now() - 1800000,
        foundLocationName: 'Chân Núi Bazan Tây',
      },
    };
  });

  const [isBackpackOpen, setIsBackpackOpen] = useState<boolean>(false);
  const [isDigging, setIsDigging] = useState<boolean>(false);
  const [digProgress, setDigProgress] = useState<number>(0);
  const [digMode, setDigMode] = useState<DigMode>('jetbot');
  const [pendingAstronautItem, setPendingAstronautItem] = useState<ExcavationComponent | null>(null);
  const [discoveredByAstronaut, setDiscoveredByAstronaut] = useState<boolean>(false);
  const [astronautDigTrigger, setAstronautDigTrigger] = useState<{ seq: number; colorHex: string } | null>(null);
  const [astronautReceiveTrigger, setAstronautReceiveTrigger] = useState<number>(0);
  const [astronautCancelTrigger, setAstronautCancelTrigger] = useState<number>(0);
  const [discoveredItemModal, setDiscoveredItemModal] = useState<ExcavationComponent | null>(null);
  const [hasNewItemInBackpack, setHasNewItemInBackpack] = useState<boolean>(false);

  // Selected Component info for detail overlay
  const selectedComponent = JETBOT_COMPONENTS.find((c) => c.id === selectedComponentId);
  const [enlargedPhoto, setEnlargedPhoto] = useState<{ url: string; title: string; caption?: string } | null>(null);

  // Toggle Sound
  const handleToggleMute = () => {
    const nextMuted = robotAudio.toggleMute();
    setIsMuted(nextMuted);
  };

  // Speed Boost & Gear control
  // speedLevel: 1 = Eco (0.30 m/s), 2 = Standard (0.55 m/s), 3 = Turbo Boost (1.10 m/s)
  const [speedLevel, setSpeedLevel] = useState<number>(2);
  const [isShiftBoost, setIsShiftBoost] = useState<boolean>(false);
  const isTurboActive = speedLevel === 3 || isShiftBoost;

  // Keyboard Navigation for Drive Mode
  const activeKeys = React.useRef<Set<string>>(new Set());
  const [pressedKeysState, setPressedKeysState] = useState<Set<string>>(new Set());
  const [showAsdwInInspect, setShowAsdwInInspect] = useState<boolean>(false);
  const effectiveShowAsdwInInspect = isMobileMode ? mobileInspectSheet === 'asdw' : showAsdwInInspect;
  const isDriveActive =
    activeView === 'drive-sim' || (activeView === '3d-inspect' && effectiveShowAsdwInInspect);

  // Multi-Language Code IDE Runner State & Live Sensor Refs
  const latestDriveStateRef = React.useRef<DriveState>(driveState);
  latestDriveStateRef.current = driveState;
  const environmentMapRef = React.useRef<EnvironmentMap>(environmentMap);
  environmentMapRef.current = environmentMap;
  const autoRunAbortRef = React.useRef<AbortController | null>(null);
  const autoLogIdRef = React.useRef<number>(1);

  const [workspaceMode, setWorkspaceMode] = useState<IdeWorkspaceMode>('custom');
  const [customFiles, setCustomFiles] = useState<CustomCodeFile[]>(() => {
    try {
      const saved = localStorage.getItem('jetbot_custom_code_files_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [{ id: 'custom-1', name: 'Code 1', language: 'python', code: '' }];
  });
  const [activeCustomFileId, setActiveCustomFileId] = useState<string>(
    () => customFiles[0]?.id || 'custom-1'
  );

  useEffect(() => {
    try {
      localStorage.setItem('jetbot_custom_code_files_v1', JSON.stringify(customFiles));
    } catch {}
  }, [customFiles]);

  const [presetLanguage, setPresetLanguage] = useState<CodeLanguage>('python');
  const [presetByLang, setPresetByLang] = useState<Record<CodeLanguage, string>>({
    python: PRESETS_BY_LANGUAGE.python[0].id,
    javascript: PRESETS_BY_LANGUAGE.javascript[0].id,
    cpp: PRESETS_BY_LANGUAGE.cpp[0].id,
  });
  const [codeByLang, setCodeByLang] = useState<Record<CodeLanguage, string>>(() => {
    const defaults: Record<CodeLanguage, string> = {
      python: PRESETS_BY_LANGUAGE.python[0].code,
      javascript: PRESETS_BY_LANGUAGE.javascript[0].code,
      cpp: PRESETS_BY_LANGUAGE.cpp[0].code,
    };
    try {
      const saved = localStorage.getItem('jetbot_preset_code_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            python: typeof parsed.python === 'string' ? parsed.python : defaults.python,
            javascript: typeof parsed.javascript === 'string' ? parsed.javascript : defaults.javascript,
            cpp: typeof parsed.cpp === 'string' ? parsed.cpp : defaults.cpp,
          };
        }
      }
    } catch {}
    return defaults;
  });
  const [isAutoCodeRunning, setIsAutoCodeRunning] = useState<boolean>(false);
  const [isCodePanelCollapsed, setIsCodePanelCollapsed] = useState<boolean>(false);
  const [isCodePanelExpanded, setIsCodePanelExpanded] = useState<boolean>(false);
  const [autoCodeLogs, setAutoCodeLogs] = useState<LogEntry[]>([]);
  const [autoCodeError, setAutoCodeError] = useState<string | null>(null);
  const [lastRunMs, setLastRunMs] = useState<number | null>(null);
  const [autoDangerProb, setAutoDangerProb] = useState<number>(0.08);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [lastSavedLabel, setLastSavedLabel] = useState<string | null>(null);
  const [saveTick, setSaveTick] = useState<number>(0);

  const activeCustomFile =
    customFiles.find((f) => f.id === activeCustomFileId) || customFiles[0];
  const codeLanguage: CodeLanguage =
    workspaceMode === 'custom' && activeCustomFile
      ? activeCustomFile.language
      : presetLanguage;
  const autoCode: string =
    workspaceMode === 'custom' && activeCustomFile
      ? activeCustomFile.code
      : codeByLang[presetLanguage];
  const selectedPresetId = presetByLang[presetLanguage];

  const getSensorSnapshot = useCallback(() => {
    const d = latestDriveStateRef.current;
    const envMap = environmentMapRef.current;
    const maxBound = envMap === 'mars-planet' ? 12.5 : 2.8;
    const nearBoundary =
      Math.abs(d.position.x) > maxBound - 0.65 ||
      Math.abs(d.position.z) > maxBound - 0.65;
    return {
      obstacleDist: d.nearestObstacleDistance,
      alienDist: d.nearestAlienDistance ?? 99,
      nearBoundary,
      headingDeg: d.heading,
      posX: d.position.x,
      posZ: d.position.z,
    };
  }, []);

  const stopAutonomousCode = useCallback((silent = false) => {
    if (autoRunAbortRef.current) {
      autoRunAbortRef.current.abort();
      autoRunAbortRef.current = null;
    }
    setIsAutoCodeRunning(false);
    setDriveState((prev) =>
      prev.linearVelocity === 0 && prev.angularVelocity === 0
        ? prev
        : { ...prev, linearVelocity: 0, angularVelocity: 0 }
    );
    if (!silent) {
      setAutoCodeLogs((prev) => [
        ...prev.slice(-49),
        { id: autoLogIdRef.current++, level: 'warn', text: 'Đã dừng thực thi chương trình.' },
      ]);
    }
  }, []);

  const handleStartAutonomousCode = useCallback(async () => {
    if (!autoCode.trim()) {
      setAutoCodeError('Khung code đang trống. Hãy nhập code trước khi bấm Bắt đầu chạy.');
      setAutoCodeLogs((prev) => [
        ...prev.slice(-49),
        { id: autoLogIdRef.current++, level: 'warn', text: 'Chưa có code để chạy. Hãy nhập code vào khung soạn thảo.' },
      ]);
      return;
    }
    if (autoRunAbortRef.current) {
      autoRunAbortRef.current.abort();
    }
    const controller = new AbortController();
    autoRunAbortRef.current = controller;
    setAutoCodeError(null);
    setLastRunMs(null);
    setIsAutoCodeRunning(true);
    void robotAudio.unlock();
    robotAudio.playClick(920);
    const startAt = performance.now();
    const langTag =
      codeLanguage === 'python'
        ? 'Python'
        : codeLanguage === 'javascript'
        ? 'JavaScript'
        : 'C++ / Arduino';
    setAutoCodeLogs([
      { id: autoLogIdRef.current++, level: 'info', text: `Khởi chạy [${langTag}]...` },
    ]);

    let hadError = false;
    try {
      await runMultiLanguageProgram(
        codeLanguage,
        autoCode,
        {
          setMotors: (linearVelocity, angularVelocity) => {
            setDriveState((prev) => ({
              ...prev,
              linearVelocity,
              angularVelocity,
            }));
          },
          stop: () => {
            setDriveState((prev) => ({
              ...prev,
              linearVelocity: 0,
              angularVelocity: 0,
            }));
          },
          getSensors: getSensorSnapshot,
          onLog: (level, text) => {
            setAutoCodeLogs((prev) => [
              ...prev.slice(-49),
              { id: autoLogIdRef.current++, level, text },
            ]);
          },
          onDangerProb: (prob) => {
            setAutoDangerProb(prob);
          },
        },
        controller.signal
      );
    } catch (err) {
      hadError = true;
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : 'Lỗi cú pháp hoặc thực thi code.';
        setAutoCodeError(message);
        setAutoCodeLogs((prev) => [
          ...prev.slice(-49),
          { id: autoLogIdRef.current++, level: 'danger', text: `Lỗi: ${message}` },
        ]);
      }
    } finally {
      const elapsedMs = Math.max(1, Math.round(performance.now() - startAt));
      if (!hadError && !controller.signal.aborted) {
        setLastRunMs(elapsedMs);
        setAutoCodeLogs((prev) => [
          ...prev.slice(-49),
          { id: autoLogIdRef.current++, level: 'success', text: `Hoàn thành thực thi (${elapsedMs}ms · exit 0)` },
        ]);
      }
      if (autoRunAbortRef.current === controller) {
        autoRunAbortRef.current = null;
        setIsAutoCodeRunning(false);
      }
    }
  }, [autoCode, codeLanguage, getSensorSnapshot]);

  const handleLanguageChange = useCallback(
    (nextLang: CodeLanguage) => {
      if (workspaceMode === 'custom' && activeCustomFile) {
        setCustomFiles((prev) =>
          prev.map((f) => (f.id === activeCustomFile.id ? { ...f, language: nextLang } : f))
        );
        setHasUnsavedChanges(true);
      } else {
        setPresetLanguage(nextLang);
      }
      setAutoCodeError(null);
      robotAudio.playClick(820);
    },
    [workspaceMode, activeCustomFile]
  );

  const handleCodeChange = useCallback(
    (nextCode: string) => {
      if (workspaceMode === 'custom' && activeCustomFile) {
        setCustomFiles((prev) =>
          prev.map((f) => (f.id === activeCustomFile.id ? { ...f, code: nextCode } : f))
        );
      } else {
        setCodeByLang((prev) => ({ ...prev, [presetLanguage]: nextCode }));
      }
      setHasUnsavedChanges(true);
      if (autoCodeError) setAutoCodeError(null);
    },
    [autoCodeError, workspaceMode, activeCustomFile, presetLanguage]
  );

  const handleSaveActiveCode = useCallback(() => {
    try {
      localStorage.setItem('jetbot_custom_code_files_v1', JSON.stringify(customFiles));
      localStorage.setItem('jetbot_preset_code_v1', JSON.stringify(codeByLang));
    } catch {}
    const nowLabel = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setHasUnsavedChanges(false);
    setLastSavedLabel(nowLabel);
    setSaveTick((prev) => prev + 1);
    robotAudio.playClick(1040);
  }, [customFiles, codeByLang]);

  const handleCreateCustomFile = useCallback(() => {
    setCustomFiles((prev) => {
      const usedNums = prev
        .map((f) => /^Code\s+(\d+)$/i.exec(f.name.trim()))
        .filter((m): m is RegExpExecArray => !!m)
        .map((m) => Number(m[1]));
      const nextNum = usedNums.length > 0 ? Math.max(...usedNums) + 1 : prev.length + 1;
      const newFile: CustomCodeFile = {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `Code ${nextNum}`,
        language: activeCustomFile?.language || 'python',
        code: '',
      };
      setActiveCustomFileId(newFile.id);
      return [...prev, newFile];
    });
    setWorkspaceMode('custom');
    setAutoCodeError(null);
    robotAudio.playClick(860);
  }, [activeCustomFile]);

  const handleCreateCustomFileWithCode = useCallback(
    (pastedCode: string, detectedLang?: CodeLanguage) => {
      setCustomFiles((prev) => {
        const usedNums = prev
          .map((f) => /^Code\s+(\d+)$/i.exec(f.name.trim()))
          .filter((m): m is RegExpExecArray => !!m)
          .map((m) => Number(m[1]));
        const nextNum = usedNums.length > 0 ? Math.max(...usedNums) + 1 : prev.length + 1;
        const newFile: CustomCodeFile = {
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: `Code ${nextNum}`,
          language: detectedLang || activeCustomFile?.language || 'python',
          code: pastedCode,
        };
        setActiveCustomFileId(newFile.id);
        return [...prev, newFile];
      });
      setWorkspaceMode('custom');
      setAutoCodeError(null);
      robotAudio.playClick(880);
    },
    [activeCustomFile]
  );

  const handleDeleteCustomFile = useCallback(
    (id: string) => {
      setCustomFiles((prev) => {
        if (prev.length <= 1) {
          return prev.map((f) => (f.id === id ? { ...f, code: '' } : f));
        }
        const idx = prev.findIndex((f) => f.id === id);
        const filtered = prev.filter((f) => f.id !== id);
        if (id === activeCustomFileId) {
          const fallback = filtered[Math.max(0, idx - 1)] || filtered[0];
          if (fallback) setActiveCustomFileId(fallback.id);
        }
        return filtered;
      });
      setAutoCodeError(null);
      robotAudio.playClick(700);
    },
    [activeCustomFileId]
  );

  const handleRenameCustomFile = useCallback((id: string, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    setCustomFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, name: trimmed } : f))
    );
  }, []);

  const handleSelectAutonomousPreset = useCallback(
    (presetId: string) => {
      const found = ALL_PRESETS.find((p) => p.id === presetId);
      if (!found) return;
      setPresetLanguage(found.language);
      setPresetByLang((prev) => ({ ...prev, [found.language]: found.id }));
      setCodeByLang((prev) => ({ ...prev, [found.language]: found.code }));
      setAutoCodeError(null);
      robotAudio.playClick(780);
    },
    []
  );

  const handleResetAutonomousPreset = useCallback(() => {
    const found =
      PRESETS_BY_LANGUAGE[presetLanguage].find((p) => p.id === selectedPresetId) ||
      PRESETS_BY_LANGUAGE[presetLanguage][0];
    setCodeByLang((prev) => ({ ...prev, [presetLanguage]: found.code }));
    setAutoCodeError(null);
    robotAudio.playClick(780);
  }, [presetLanguage, selectedPresetId]);

  const addExcavationItemToInventory = useCallback(
    (chosenItem: ExcavationComponent) => {
      const locName = driveState.nearestDigSiteName || 'Đồi Cát Sao Hỏa';
      setInventory((prev) => {
        const nextInv = { ...prev };
        if (nextInv[chosenItem.id]) {
          nextInv[chosenItem.id] = {
            ...nextInv[chosenItem.id],
            count: nextInv[chosenItem.id].count + 1,
          };
        } else {
          nextInv[chosenItem.id] = {
            ...chosenItem,
            count: 1,
            firstFoundAt: Date.now(),
            foundLocationName: locName,
          };
        }
        try {
          localStorage.setItem('jetbot_mars_inventory', JSON.stringify(nextInv));
        } catch {}
        return nextInv;
      });
    },
    [driveState.nearestDigSiteName]
  );

  const handleStartDig = useCallback(() => {
    if (isDigging) return;

    // Astronaut Dig & Deliver Mode (Phi hành gia đi đào rồi mang lại gần JetBot -> nhấn Z nhận)
    if (digMode === 'astronaut') {
      if (environmentMap !== 'mars-planet') return;
      if (pendingAstronautItem || (driveState.astronautTaskStatus && driveState.astronautTaskStatus !== 'idle')) {
        return;
      }
      const chosenItem = rollWeightedExcavationComponent(EXCAVATION_COMPONENTS);
      setPendingAstronautItem(chosenItem);
      setAstronautDigTrigger((prev) => ({
        seq: (prev?.seq ?? 0) + 1,
        colorHex: chosenItem.tierColorHex,
      }));
      robotAudio.playDiggingSound();
      return;
    }

    // Standard JetBot Direct Dig Mode
    setIsDigging(true);
    setDigProgress(0);
    robotAudio.playDiggingSound();

    const startTime = performance.now();
    const duration = 1400; // 1.4s suspense

    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      setDigProgress(progress);

      if (progress > 45 && progress < 55) {
        robotAudio.playDiggingSound();
      }

      if (elapsed >= duration) {
        clearInterval(interval);
        setIsDigging(false);

        const chosenItem = rollWeightedExcavationComponent(EXCAVATION_COMPONENTS);
        addExcavationItemToInventory(chosenItem);

        robotAudio.playDiscoveryFanfare(chosenItem.tier);
        setDiscoveredByAstronaut(false);
        setDiscoveredItemModal(chosenItem);
        setHasNewItemInBackpack(true);
      }
    }, 40);
  }, [
    isDigging,
    digMode,
    environmentMap,
    pendingAstronautItem,
    driveState.astronautTaskStatus,
    addExcavationItemToInventory,
  ]);

  const handleReceiveAstronautItem = useCallback(() => {
    if (!pendingAstronautItem || !driveState.astronautCanReceiveZ) return;
    const deliveredItem = pendingAstronautItem;
    addExcavationItemToInventory(deliveredItem);

    robotAudio.playAstronautReceiveChime();
    robotAudio.playDiscoveryFanfare(deliveredItem.tier);
    setDiscoveredByAstronaut(true);
    setDiscoveredItemModal(deliveredItem);
    setHasNewItemInBackpack(true);
    setPendingAstronautItem(null);
    setAstronautReceiveTrigger((prev) => prev + 1);
    setDriveState((prev) => ({
      ...prev,
      astronautTaskStatus: 'idle',
      astronautCanReceiveZ: false,
    }));
  }, [pendingAstronautItem, driveState.astronautCanReceiveZ, addExcavationItemToInventory]);

  const speedLevelRef = React.useRef<number>(speedLevel);
  speedLevelRef.current = speedLevel;

  const updateDriveFromKeys = useCallback(() => {
    const { linearVelocity, angularVelocity } = computeDriveVelocityFromKeys(
      activeKeys.current,
      speedLevelRef.current
    );

    setDriveState((prev) => ({
      ...prev,
      linearVelocity,
      angularVelocity,
    }));
  }, []);

  useEffect(() => {
    if (activeKeys.current.size > 0 && isDriveActive) {
      updateDriveFromKeys();
    }
  }, [speedLevel, isDriveActive, updateDriveFromKeys]);

  const keyboardContextRef = React.useRef({
    isDriveActive,
    activeView,
    isDigging,
    digMode,
    canDig: Boolean(driveState.canDig),
    environmentMap,
    astronautTaskStatus: driveState.astronautTaskStatus || 'idle',
    astronautCanReceiveZ: Boolean(driveState.astronautCanReceiveZ),
    hasPendingAstronautItem: Boolean(pendingAstronautItem),
    handleStartDig,
    handleReceiveAstronautItem,
    stopAutonomousCode,
    isCodePanelCollapsed,
    isMobileMode,
    mobileDriveTool,
    handleSaveActiveCode,
    isAnyModalOpen: isAiModalOpen || isPhotoModalOpen || isBackpackOpen || Boolean(enlargedPhoto) || Boolean(discoveredItemModal),
  });
  keyboardContextRef.current = {
    isDriveActive,
    activeView,
    isDigging,
    digMode,
    canDig: Boolean(driveState.canDig),
    environmentMap,
    astronautTaskStatus: driveState.astronautTaskStatus || 'idle',
    astronautCanReceiveZ: Boolean(driveState.astronautCanReceiveZ),
    hasPendingAstronautItem: Boolean(pendingAstronautItem),
    handleStartDig,
    handleReceiveAstronautItem,
    stopAutonomousCode,
    isCodePanelCollapsed,
    isMobileMode,
    mobileDriveTool,
    handleSaveActiveCode,
    isAnyModalOpen: isAiModalOpen || isPhotoModalOpen || isBackpackOpen || Boolean(enlargedPhoto) || Boolean(discoveredItemModal),
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctx = keyboardContextRef.current;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        const isCodeVisible = ctx.isMobileMode ? ctx.mobileDriveTool === 'code' : !ctx.isCodePanelCollapsed;
        if (ctx.activeView === 'drive-sim' && isCodeVisible) {
          e.preventDefault();
          ctx.handleSaveActiveCode();
          return;
        }
      }

      if (shouldIgnoreKeyboardTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (ctx.isAnyModalOpen) return;

      const normalizedCode = normalizeDriveKeyCode(e);

      // If user is in '3d-inspect' (Mô hình 3D) and presses W/A/S/D or Arrow keys,
      // auto-activate ASDW drive controls so WASD moves JetBot immediately from any 3D view.
      let driveEnabledNow = ctx.isDriveActive;
      if (!driveEnabledNow && ctx.activeView === '3d-inspect' && isMovementDriveKey(normalizedCode)) {
        driveEnabledNow = true;
        setExplodedValue(0);
        if (ctx.isMobileMode) {
          setMobileInspectSheet('asdw');
        } else {
          setShowAsdwInInspect(true);
        }
      }

      // Dig hotkey [KeyE], Astronaut Receive hotkey [KeyZ], & ASDW drive controls
      if (driveEnabledNow) {
        if (e.code === 'KeyZ' || e.key.toLowerCase() === 'z' || e.keyCode === 90) {
          if (ctx.hasPendingAstronautItem && ctx.astronautCanReceiveZ) {
            e.preventDefault();
            ctx.handleReceiveAstronautItem();
            return;
          }
        }

        if (e.code === 'KeyE' || e.key.toLowerCase() === 'e') {
          const astronautIdle = ctx.astronautTaskStatus === 'idle';
          const digReady = !ctx.isDigging && (ctx.canDig || ctx.environmentMap === 'mars-planet') && (ctx.digMode === 'jetbot' || astronautIdle);
          if (digReady) {
            e.preventDefault();
            ctx.handleStartDig();
            return;
          }
        }

        if (normalizedCode) {
          e.preventDefault();
          if (autoRunAbortRef.current && normalizedCode !== 'ShiftLeft' && normalizedCode !== 'ShiftRight') {
            ctx.stopAutonomousCode(true);
          }
          activeKeys.current.add(normalizedCode);
          if (normalizedCode === 'ShiftLeft' || normalizedCode === 'ShiftRight') {
            setIsShiftBoost(true);
          }
          setPressedKeysState(new Set(activeKeys.current));
          updateDriveFromKeys();
          return;
        }
      }

      // Backpack hotkey [KeyB]
      if (e.code === 'KeyB') {
        e.preventDefault();
        setIsBackpackOpen((prev) => !prev);
        setHasNewItemInBackpack(false);
        robotAudio.playBackpackOpen();
        return;
      }

      // Zoom In (Key I) / Zoom Out (Key O) when a 3D viewport is visible
      if (ctx.activeView !== 'table-analysis') {
        if (e.code === 'KeyI') {
          setIsIActive(true);
          setZoomState('in');
        } else if (e.code === 'KeyO') {
          setIsOActive(true);
          setZoomState('out');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (shouldIgnoreKeyboardTarget(e.target)) return;

      const normalizedCode = normalizeDriveKeyCode(e);
      if (normalizedCode === 'Space' && keyboardContextRef.current.isDriveActive) {
        e.preventDefault();
      }

      if (normalizedCode && activeKeys.current.has(normalizedCode)) {
        activeKeys.current.delete(normalizedCode);
        if (normalizedCode === 'ShiftLeft' || normalizedCode === 'ShiftRight') {
          setIsShiftBoost(false);
        }
        setPressedKeysState(new Set(activeKeys.current));
        updateDriveFromKeys();
      } else if (e.code && activeKeys.current.has(e.code)) {
        activeKeys.current.delete(e.code);
        setPressedKeysState(new Set(activeKeys.current));
        updateDriveFromKeys();
      }

      if (e.code === 'KeyI') {
        setIsIActive(false);
        setZoomState((prev) => (prev === 'in' ? null : prev));
      } else if (e.code === 'KeyO') {
        setIsOActive(false);
        setZoomState((prev) => (prev === 'out' ? null : prev));
      }
    };

    const handleBlur = () => {
      activeKeys.current.clear();
      setIsShiftBoost(false);
      setPressedKeysState(new Set());
      setIsIActive(false);
      setIsOActive(false);
      setZoomState(null);
      updateDriveFromKeys();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [updateDriveFromKeys]);

  // Clear active driving velocity, keys, astronaut tasks, and autonomous script when leaving Drive Mode or Mars
  useEffect(() => {
    if (activeView !== 'drive-sim' && autoRunAbortRef.current) {
      stopAutonomousCode(true);
    }
    if (!isDriveActive || environmentMap !== 'mars-planet') {
      if (pendingAstronautItem) {
        setPendingAstronautItem(null);
        setAstronautCancelTrigger((prev) => prev + 1);
      }
      setDriveState((prev) => ({
        ...prev,
        astronautTaskStatus: 'idle',
        astronautCanReceiveZ: false,
      }));
    }
    if (!isDriveActive) {
      activeKeys.current.clear();
      setIsShiftBoost(false);
      setPressedKeysState(new Set());
      setDriveState((prev) =>
        prev.linearVelocity === 0 && prev.angularVelocity === 0
          ? prev
          : { ...prev, linearVelocity: 0, angularVelocity: 0 }
      );
    }
  }, [isDriveActive, activeView, environmentMap, pendingAstronautItem, stopAutonomousCode]);

  useEffect(() => {
    return () => {
      if (autoRunAbortRef.current) {
        autoRunAbortRef.current.abort();
        autoRunAbortRef.current = null;
      }
    };
  }, []);

  const handleResetZoomForCurrentMode = () => {
    if (isDriveActive) {
      setDriveCamResetTrigger((prev) => prev + 1);
      robotAudio.playClick(850);
    } else {
      handleResetInspectView();
    }
  };

  const handleSendDriveCommand = (linear: number, angular: number) => {
    if (autoRunAbortRef.current) {
      stopAutonomousCode(true);
    }
    setDriveState((prev) => ({
      ...prev,
      linearVelocity: linear,
      angularVelocity: angular,
    }));
  };

  const handleResetPosition = () => {
    stopAutonomousCode(true);
    setDriveResetTrigger((prev) => prev + 1);
    setDriveState((prev) => ({
      ...prev,
      position: { x: 0, z: 0 },
      heading: 0,
      linearVelocity: 0,
      angularVelocity: 0,
    }));
  };

  const handleOpenAi = (query?: string) => {
    setAiInitialQuery(query || '');
    setIsAiModalOpen(true);
  };

  const handleInspectComponent = (compId: string) => {
    setSelectedComponentId(compId);
    setMobileInspectSheet('none');
    setActiveView('3d-inspect');
  };

  const handleSelect3DComponent = (compId: string | null) => {
    setSelectedComponentId(compId);
    if (compId && isMobileMode) {
      setMobileInspectSheet('none');
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans text-slate-100 select-none">
      {/* 1. TOP NAVBAR */}
      <header
        className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-between bg-slate-950/88 border-b border-slate-800/90 backdrop-blur-md ${
          isMobileMode ? 'h-12 px-2.5 gap-1.5' : 'px-3 sm:px-6 py-2.5 gap-2'
        }`}
      >
        {/* Left: CMU 10A Title, School Badge & Backpack */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <div
            className={`${
              isMobileMode ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm'
            } rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold font-mono shadow shrink-0`}
          >
            CMU
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`font-bold tracking-tight text-white truncate ${
                  isMobileMode ? 'text-xs' : 'text-sm'
                }`}
              >
                {isMobileMode ? 'JETBOT 3D' : 'MÔ PHỎNG JETBOT 3D'}
              </span>
              {!isMobileMode && (
                <span className="hidden md:inline-block text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30 whitespace-nowrap shrink-0">
                  LỚP 10A
                </span>
              )}
            </div>
            {!isMobileMode && (
              <p className="hidden sm:block text-[10px] text-slate-400 font-mono truncate">
                NVIDIA Jetson Nano · RPLIDAR · Camera CSI · Động cơ DC vi sai
              </p>
            )}
          </div>

          {/* Backpack button at top-left corner */}
          <button
            onClick={() => {
              setIsBackpackOpen(true);
              setHasNewItemInBackpack(false);
              robotAudio.playBackpackOpen();
            }}
            className={`relative flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-lg active:scale-95 whitespace-nowrap shrink-0 ${
              hasNewItemInBackpack
                ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-slate-950 border-amber-300 ring-2 ring-amber-400 animate-pulse'
                : 'bg-slate-900/90 hover:bg-slate-800 text-amber-300 border-amber-500/40 hover:border-amber-400'
            }`}
            title="Mở Balo linh kiện đã đào bới được trên Sao Hỏa (Phím B)"
          >
            <Backpack className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
            <span className="font-mono text-[11px] sm:text-xs">
              {isMobileMode
                ? `${Object.keys(inventory).length}/15`
                : `Balo (${Object.keys(inventory).length}/15)`}
            </span>
          </button>
        </div>

        {/* Center: 3 Primary Mode Switchers (Desktop Only — Mobile uses Fixed Bottom Nav) */}
        {!isMobileMode && (
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl shadow-inner shrink-0">
            <button
              onClick={() => {
                setActiveView('3d-inspect');
                robotAudio.playClick(700);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeView === '3d-inspect'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Mô hình 3D</span>
            </button>

            <button
              onClick={() => {
                setShowAsdwInInspect(false);
                setActiveView('drive-sim');
                void robotAudio.unlock();
                robotAudio.playClick(750);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeView === 'drive-sim'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>Lái xe &amp; Cảm biến</span>
            </button>

            <button
              onClick={() => {
                setShowAsdwInInspect(false);
                setActiveView('table-analysis');
                robotAudio.playClick(800);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeView === 'table-analysis'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <TableProperties className="w-3.5 h-3.5" />
              <span>Bảng linh kiện</span>
            </button>
          </div>
        )}

        {/* Right: Quick Action Buttons */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Real Photo Comparison Modal Button */}
          <button
            onClick={() => setIsPhotoModalOpen(true)}
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Xem ảnh chụp robot JetBot thực tế từ đề bài CMU"
          >
            <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
            {!isMobileMode && <span className="hidden md:inline">Ảnh thực tế</span>}
          </button>

          {/* AI Advisor Button */}
          <button
            onClick={() => handleOpenAi()}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition-colors shadow-lg shadow-emerald-950 cursor-pointer whitespace-nowrap shrink-0"
            title="Hỏi trợ lý kỹ thuật AI"
          >
            <Bot className="w-3.5 h-3.5" />
            {!isMobileMode && <span className="hidden sm:inline">Hỏi AI</span>}
          </button>

          {/* Environment Map Selector Toggle (Exclusively for Drive Simulation Mode) */}
          {isDriveActive && (
            <button
              onClick={() => {
                const nextMap = environmentMap === 'mars-planet' ? 'cmu-arena' : 'mars-planet';
                setEnvironmentMap(nextMap);
                robotAudio.playClick(650);
              }}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer shadow-md whitespace-nowrap shrink-0 ${
                environmentMap === 'mars-planet'
                  ? 'bg-gradient-to-r from-red-600/90 to-amber-600/90 text-white border-red-500 shadow-red-950/40'
                  : 'bg-emerald-950/80 text-emerald-300 border-emerald-600/50 hover:bg-emerald-900/60'
              }`}
              title="Đổi bản đồ lái xe: Sao Hỏa có Alien ⟷ Sa bàn thi đấu CMU"
            >
              {isMobileMode ? (
                <span>{environmentMap === 'mars-planet' ? '🪐' : '🏟️'}</span>
              ) : (
                <span>{environmentMap === 'mars-planet' ? '🪐 Bề mặt Sao Hỏa' : '🏟️ Sân CMU 10A'}</span>
              )}
            </button>
          )}

          {/* Dedicated Mobile / Desktop Mode Toggle */}
          <button
            type="button"
            data-testid="mobile-mode-toggle"
            onClick={handleToggleMobileMode}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isMobileMode
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 hover:bg-cyan-500/30'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
            }`}
            title={
              isMobileMode
                ? 'Đang bật Giao diện Điện thoại (không che tab) · Nhấn để chuyển sang Giao diện Máy tính'
                : 'Chuyển sang Giao diện Điện thoại tối ưu không che tab'
            }
          >
            {isMobileMode ? (
              <Smartphone className="w-3.5 h-3.5 text-cyan-300" />
            ) : (
              <Monitor className="w-3.5 h-3.5 text-slate-300" />
            )}
            {!isMobileMode && <span className="hidden lg:inline">ĐT</span>}
          </button>

          {/* Mute Button */}
          <button
            onClick={handleToggleMute}
            className="p-1.5 sm:p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors cursor-pointer shrink-0"
            title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </header>

      {/* 2. 3D VIEWPORT CONTAINER */}
      <main className="w-full h-full relative">
        <JetBotScene
          explodedValue={explodedValue}
          renderMode={renderMode}
          isAutoRotate={isAutoRotate}
          selectedComponentId={selectedComponentId}
          onSelectComponent={handleSelect3DComponent}
          isDriveMode={isDriveActive}
          driveState={driveState}
          setDriveState={setDriveState}
          viewPreset={viewPreset}
          modelScale={modelScale}
          onObstaclesToppledChange={(toppled, total) => setObstaclesCount({ toppled, total })}
          resetObstaclesTrigger={resetObstaclesTrigger}
          inspectResetTrigger={inspectResetTrigger}
          driveResetTrigger={driveResetTrigger}
          driveCamResetTrigger={driveCamResetTrigger}
          zoomState={zoomState}
          environmentMap={environmentMap}
          isDigging={isDigging}
          astronautDigTrigger={astronautDigTrigger}
          astronautReceiveTrigger={astronautReceiveTrigger}
          astronautCancelTrigger={astronautCancelTrigger}
        />

        {/* Shovel Excavation Floating Action Button on Mars */}
        <ShovelButton
          isMobile={isMobileMode}
          canDig={!!driveState.canDig || (environmentMap === 'mars-planet' && isDriveActive)}
          isDigging={isDigging}
          digProgress={digProgress}
          digSiteName={driveState.nearestDigSiteName}
          onDig={handleStartDig}
          digMode={digMode}
          onDigModeChange={setDigMode}
          astronautStatus={driveState.astronautTaskStatus || 'idle'}
          astronautName={driveState.astronautTaskName}
          astronautDistanceToBot={driveState.astronautDistanceToBot}
          astronautCanReceiveZ={!!driveState.astronautCanReceiveZ}
          pendingItemName={pendingAstronautItem?.name}
          onReceiveFromAstronaut={handleReceiveAstronautItem}
          positionClass={
            isMobileMode
              ? activeView === 'drive-sim' && mobileDriveTool === 'camera'
                ? 'bottom-[114px] right-2.5'
                : 'top-14 right-2.5'
              : activeView === 'drive-sim'
              ? isCodePanelCollapsed
                ? 'bottom-20 right-6'
                : isCodePanelExpanded
                ? 'bottom-5 right-[560px]'
                : 'bottom-5 right-[432px]'
              : 'bottom-24 right-6 sm:bottom-28 sm:right-10'
          }
        />

        {/* Floating Zoom Controls (Mouse Wheel & Keys I / O) */}
        {activeView !== 'table-analysis' && (
          <ZoomControls
            isMobile={isMobileMode}
            onZoomInStart={() => setZoomState('in')}
            onZoomInEnd={() => setZoomState(null)}
            onZoomOutStart={() => setZoomState('out')}
            onZoomOutEnd={() => setZoomState(null)}
            onResetZoom={handleResetZoomForCurrentMode}
            isIActive={isIActive || zoomState === 'in'}
            isOActive={isOActive || zoomState === 'out'}
            positionClass={
              isMobileMode
                ? 'top-14 left-2.5'
                : isDriveActive
                ? 'top-16 left-6 sm:left-72'
                : 'top-16 left-6'
            }
          />
        )}

        {/* 3. INSPECTION MODE HUD OVERLAYS */}
        {activeView === '3d-inspect' && (
          <>
            {/* Desktop ASDW Drive Toggle Button */}
            {!isMobileMode && (
              <div className="fixed bottom-6 left-6 z-20 pointer-events-auto">
                {!showAsdwInInspect ? (
                  <button
                    onClick={() => {
                      setShowAsdwInInspect(true);
                      setExplodedValue(0);
                      void robotAudio.unlock();
                      robotAudio.playClick(800);
                    }}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-900/90 hover:bg-emerald-500 text-slate-200 hover:text-slate-950 border border-slate-700/80 rounded-xl shadow-xl backdrop-blur-md text-xs font-bold transition-all cursor-pointer"
                    title="Mở cụm phím ASDW lái xe"
                  >
                    <Gamepad2 className="w-4 h-4 text-emerald-400" />
                    <span>Bật phím ASDW</span>
                  </button>
                ) : (
                  <DriveController
                    driveState={driveState}
                    onSendDriveCommand={handleSendDriveCommand}
                    onResetPosition={handleResetPosition}
                    activePressedKeys={pressedKeysState}
                    onClose={() => setShowAsdwInInspect(false)}
                    obstaclesToppled={obstaclesCount.toppled}
                    totalObstacles={obstaclesCount.total}
                    onResetObstacles={handleResetObstacles}
                    speedLevel={speedLevel}
                    onSpeedLevelChange={setSpeedLevel}
                    isTurboActive={isTurboActive}
                    onToggleTurbo={() => setSpeedLevel((prev) => (prev === 3 ? 2 : 3))}
                  />
                )}
              </div>
            )}

            {/* Mobile ASDW Controller Sheet in Inspect Mode */}
            {isMobileMode && mobileInspectSheet === 'asdw' && (
              <DriveController
                isMobile
                driveState={driveState}
                onSendDriveCommand={handleSendDriveCommand}
                onResetPosition={handleResetPosition}
                activePressedKeys={pressedKeysState}
                onClose={() => setMobileInspectSheet('none')}
                obstaclesToppled={obstaclesCount.toppled}
                totalObstacles={obstaclesCount.total}
                onResetObstacles={handleResetObstacles}
                speedLevel={speedLevel}
                onSpeedLevelChange={setSpeedLevel}
                isTurboActive={isTurboActive}
                onToggleTurbo={() => setSpeedLevel((prev) => (prev === 3 ? 2 : 3))}
              />
            )}

            {/* Selected Component Detail Inspector Box (Bottom Sheet on Mobile, Right Card on Desktop) */}
            {selectedComponent && (!isMobileMode || mobileInspectSheet === 'none') && (
              <div
                data-testid="selected-component-panel"
                className={
                  isMobileMode
                    ? 'fixed bottom-[106px] left-2 right-2 z-30 max-h-[54vh] overflow-y-auto bg-slate-900/95 border border-slate-700/85 rounded-2xl p-3.5 shadow-2xl backdrop-blur-xl pointer-events-auto'
                    : 'absolute top-16 right-4 z-30 w-84 sm:w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-5.5rem)] overflow-y-auto bg-slate-900/95 border border-slate-700/80 rounded-2xl p-4 shadow-2xl backdrop-blur-xl pointer-events-auto animate-in fade-in slide-in-from-right-4 duration-200'
                }
              >
                {/* Header */}
                <div className="flex items-start justify-between border-b border-slate-800 pb-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full shadow-md shrink-0"
                      style={{ backgroundColor: selectedComponent.colorHex }}
                    />
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-bold text-sm text-white">
                          {selectedComponent.name}
                        </h4>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-medium">
                          {selectedComponent.categoryLabel}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {selectedComponent.englishName}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedComponentId(null)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"
                    title="Đóng bảng chi tiết"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  {/* FEATURED LARGE REAL PHOTO CARD (Ảnh Chụp Thực Tế Ngoài Đời) */}
                  {selectedComponent.realPhotoUrl && (
                    <div className="space-y-1.5">
                      <div className="relative group rounded-xl overflow-hidden border border-slate-700/80 shadow-lg bg-white">
                        <img
                          src={selectedComponent.realPhotoUrl}
                          alt={selectedComponent.name}
                          className="w-full h-40 sm:h-48 object-contain p-2 transition-transform duration-300 group-hover:scale-105 cursor-pointer"
                          onClick={() =>
                            setEnlargedPhoto({
                              url: selectedComponent.realPhotoUrl!,
                              title: selectedComponent.name,
                              caption: selectedComponent.realPhotoCaption,
                            })
                          }
                          title="Bấm để phóng to ảnh chụp thật toàn màn hình"
                        />
                        {/* Real Photo Badge */}
                        <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-slate-950/85 border border-slate-700/80 backdrop-blur-md text-[10px] font-bold text-emerald-300 flex items-center gap-1.5 shadow-md pointer-events-none">
                          <span>📸 Ảnh chụp linh kiện thực tế</span>
                        </div>
                        {/* Hover Overlay Zoom Button */}
                        <button
                          onClick={() =>
                            setEnlargedPhoto({
                              url: selectedComponent.realPhotoUrl!,
                              title: selectedComponent.name,
                              caption: selectedComponent.realPhotoCaption,
                            })
                          }
                          className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700 text-[11px] font-medium flex items-center gap-1.5 shadow-md backdrop-blur-md transition-all cursor-pointer"
                        >
                          <Maximize2 className="w-3 h-3 text-cyan-300" />
                          <span>Phóng to</span>
                        </button>
                      </div>

                      {/* Photo Caption */}
                      {selectedComponent.realPhotoCaption && (
                        <div className="text-[11px] text-slate-300 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 leading-relaxed">
                          <span className="font-semibold text-cyan-400">Đặc điểm thực tế: </span>
                          {selectedComponent.realPhotoCaption}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Location on Robot */}
                  <div className="flex items-start gap-1.5 text-slate-300 bg-slate-950/50 p-2 rounded-lg border border-slate-800/60">
                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-400 font-medium">Vị trí: </span>
                      <span className="text-slate-200">{selectedComponent.location}</span>
                    </div>
                  </div>

                  {/* Core Function */}
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
                    <div className="text-emerald-400 font-bold mb-1 flex items-center gap-1">
                      <Info className="w-3.5 h-3.5" />
                      <span>Chức năng cốt lõi:</span>
                    </div>
                    <div className="text-slate-200 leading-relaxed text-[11.5px]">
                      {selectedComponent.functionSummary}
                    </div>
                  </div>

                  {/* Specifications Grid */}
                  <div className="space-y-1.5">
                    <div className="text-slate-400 font-semibold text-[11px] flex items-center gap-1">
                      <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Thông số kỹ thuật:</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {selectedComponent.keySpecs.map((spec, i) => (
                        <div key={i} className="bg-slate-800/70 p-2 rounded-lg border border-slate-700/40 text-[10.5px]">
                          <div className="text-slate-400 text-[10px]">{spec.label}</div>
                          <div className="text-emerald-300 font-mono font-medium truncate mt-0.5">{spec.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Hardware Interface */}
                  <div className="text-[11px] pt-0.5">
                    <span className="text-slate-400">Giao thức kết nối: </span>
                    <span className="font-mono text-cyan-300 font-medium">{selectedComponent.interfaceType}</span>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-1.5 pt-1">
                    <button
                      onClick={() => handleOpenAi(`Hãy phân tích sâu nguyên lý hoạt động, cách đấu nối phần cứng và vai trò của ${selectedComponent.name} trong robot JetBot.`)}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-md shadow-emerald-950/40"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Hỏi AI về linh kiện này</span>
                    </button>

                    <button
                      onClick={() => setActiveView('table-analysis')}
                      className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors flex items-center justify-center gap-1 text-[11px] border border-slate-700 cursor-pointer"
                    >
                      <span>Xem bảng phân tích chi tiết</span>
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Desktop Click Hint Tooltip Banner */}
            {!isMobileMode && activeView === '3d-inspect' && !selectedComponent && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 rounded-full bg-slate-900/85 border border-slate-700/80 shadow-xl backdrop-blur-md text-[11px] text-slate-300 flex items-center gap-2 pointer-events-none select-none">
                <span>💡 <strong>Mẹo:</strong> Nhấp chuột vào bất kỳ bộ phận nào của mô hình 3D để xem ảnh thật ngoài đời & thông số</span>
              </div>
            )}

            {/* Bottom Dock for 3D Inspection (Always shown on Desktop; single-sheet on Mobile) */}
            {(!isMobileMode || mobileInspectSheet === 'dock') && (
              <BottomDock
                isMobile={isMobileMode}
                onCloseMobileSheet={() => setMobileInspectSheet('none')}
                explodedValue={explodedValue}
                onExplodedChange={setExplodedValue}
                renderMode={renderMode}
                onRenderModeChange={setRenderMode}
                isAutoRotate={isAutoRotate}
                onToggleAutoRotate={() => setIsAutoRotate(!isAutoRotate)}
                selectedComponentId={selectedComponentId}
                onSelectComponent={handleSelect3DComponent}
                onViewPreset={(preset) => {
                  setViewPreset(preset);
                  setInspectResetTrigger((prev) => prev + 1);
                  robotAudio.playClick(850);
                }}
                isMuted={isMuted}
                onToggleMute={handleToggleMute}
                onResetView={() => {
                  setExplodedValue(0);
                  handleResetInspectView();
                }}
                modelScale={modelScale}
                onModelScaleChange={setModelScale}
              />
            )}

            {/* Mobile Inspect Tool Bar above Bottom Nav (Never obstructs 3D JetBot) */}
            {isMobileMode && (
              <div
                data-testid="mobile-inspect-tool-switcher"
                className="fixed bottom-[60px] left-2 right-2 z-30 flex items-center justify-center gap-1.5 pointer-events-auto"
              >
                <button
                  type="button"
                  data-testid="mobile-inspect-dock-btn"
                  onClick={() => {
                    setSelectedComponentId(null);
                    setMobileInspectSheet((prev) => (prev === 'dock' ? 'none' : 'dock'));
                    robotAudio.playClick(740);
                  }}
                  className={`flex-1 min-h-[40px] px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-lg backdrop-blur-md ${
                    mobileInspectSheet === 'dock'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-900/92 text-slate-200 border-slate-700'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span>Thanh 3D</span>
                </button>

                <button
                  type="button"
                  data-testid="mobile-inspect-asdw-btn"
                  onClick={() => {
                    setSelectedComponentId(null);
                    setExplodedValue(0);
                    void robotAudio.unlock();
                    setMobileInspectSheet((prev) => (prev === 'asdw' ? 'none' : 'asdw'));
                    robotAudio.playClick(780);
                  }}
                  className={`flex-1 min-h-[40px] px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-lg backdrop-blur-md ${
                    mobileInspectSheet === 'asdw'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-900/92 text-slate-200 border-slate-700'
                  }`}
                >
                  <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Lái ASDW</span>
                </button>

                {(mobileInspectSheet !== 'none' || selectedComponent) && (
                  <button
                    type="button"
                    data-testid="mobile-inspect-clear-btn"
                    onClick={() => {
                      setMobileInspectSheet('none');
                      setSelectedComponentId(null);
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-900/92 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shadow-lg backdrop-blur-md"
                  >
                    <EyeOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Thu gọn</span>
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* 4. DRIVE MODE HUD OVERLAYS */}
        {activeView === 'drive-sim' && (
          <>
            {/* Drive Controller (Always visible on Desktop; Exclusively selected on Mobile) */}
            {(!isMobileMode || mobileDriveTool === 'drive') && (
              <DriveController
                isMobile={isMobileMode}
                driveState={driveState}
                onSendDriveCommand={handleSendDriveCommand}
                onResetPosition={handleResetPosition}
                activePressedKeys={pressedKeysState}
                onClose={isMobileMode ? () => setMobileDriveTool('none') : undefined}
                obstaclesToppled={obstaclesCount.toppled}
                totalObstacles={obstaclesCount.total}
                onResetObstacles={handleResetObstacles}
                speedLevel={speedLevel}
                onSpeedLevelChange={setSpeedLevel}
                isTurboActive={isTurboActive}
                onToggleTurbo={() => setSpeedLevel((prev) => (prev === 3 ? 2 : 3))}
              />
            )}

            {/* Quick Floating Turbo Speed Indicator & Shortcut Tag (Desktop Only) */}
            {!isMobileMode && (
              <div className="fixed top-16 left-6 z-20 pointer-events-auto hidden sm:flex items-center gap-2">
                <button
                  onClick={() => setSpeedLevel((prev) => (prev === 3 ? 2 : 3))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border backdrop-blur-md shadow-xl transition-all cursor-pointer text-xs font-bold ${
                    isTurboActive
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 border-amber-300 ring-2 ring-amber-400/50 shadow-orange-500/30'
                      : 'bg-slate-900/90 text-amber-300 hover:text-white hover:bg-slate-800 border-amber-500/40'
                  }`}
                  title="Bật/Tắt tăng tốc Turbo (Phím tắt: Giữ SHIFT)"
                >
                  <span className="text-sm">🚀</span>
                  <span>{isTurboActive ? 'TĂNG TỐC TURBO: ĐANG BẬT (200%)' : 'NÚT TĂNG TỐC JETBOT'}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    isTurboActive ? 'bg-slate-950/25 text-slate-950 font-black' : 'bg-slate-800 text-amber-300 border border-amber-500/30'
                  }`}>
                    SHIFT
                  </span>
                </button>
              </div>
            )}

            {/* Camera CSI Live FPV View (Always shown on Desktop; Exclusively selected on Mobile) */}
            {(!isMobileMode || mobileDriveTool === 'camera') && (
              <CameraFPV
                isMobile={isMobileMode}
                driveState={driveState}
                onCloseMobile={() => setMobileDriveTool('none')}
              />
            )}

            {/* Multi-Language Code IDE Editor & Runner HUD */}
            {(!isMobileMode || mobileDriveTool === 'code') && (
              <AutonomousCodePanel
                isMobile={isMobileMode}
                workspaceMode={workspaceMode}
                onWorkspaceModeChange={(mode) => {
                  setWorkspaceMode(mode);
                  setAutoCodeError(null);
                  robotAudio.playClick(760);
                }}
                customFiles={customFiles}
                activeCustomFileId={activeCustomFile?.id || 'custom-1'}
                onSelectCustomFile={(id) => {
                  setActiveCustomFileId(id);
                  setAutoCodeError(null);
                  robotAudio.playClick(760);
                }}
                onCreateCustomFile={handleCreateCustomFile}
                onCreateCustomFileWithCode={handleCreateCustomFileWithCode}
                onDeleteCustomFile={handleDeleteCustomFile}
                onRenameCustomFile={handleRenameCustomFile}
                language={codeLanguage}
                onLanguageChange={handleLanguageChange}
                code={autoCode}
                onCodeChange={handleCodeChange}
                selectedPresetId={selectedPresetId}
                onSelectPreset={handleSelectAutonomousPreset}
                onResetPreset={handleResetAutonomousPreset}
                isRunning={isAutoCodeRunning}
                onStart={handleStartAutonomousCode}
                onStop={() => stopAutonomousCode(false)}
                isCollapsed={isMobileMode ? false : isCodePanelCollapsed}
                onToggleCollapse={() => {
                  if (isMobileMode) {
                    setMobileDriveTool('none');
                  } else {
                    setIsCodePanelCollapsed((prev) => !prev);
                  }
                }}
                isExpanded={isCodePanelExpanded}
                onToggleExpand={() => setIsCodePanelExpanded((prev) => !prev)}
                onSaveFile={handleSaveActiveCode}
                hasUnsavedChanges={hasUnsavedChanges}
                lastSavedLabel={lastSavedLabel}
                saveTick={saveTick}
                logs={autoCodeLogs}
                onClearLogs={() => {
                  setAutoCodeLogs([]);
                  setLastRunMs(null);
                }}
                errorMsg={autoCodeError}
                lastRunMs={lastRunMs}
                dangerProb={
                  isAutoCodeRunning
                    ? autoDangerProb
                    : computeDangerProbability({
                        obstacleDist: driveState.nearestObstacleDistance,
                        alienDist: driveState.nearestAlienDistance ?? 99,
                        nearBoundary:
                          Math.abs(driveState.position.x) >
                            (environmentMap === 'mars-planet' ? 12.5 : 2.8) - 0.65 ||
                          Math.abs(driveState.position.z) >
                            (environmentMap === 'mars-planet' ? 12.5 : 2.8) - 0.65,
                        headingDeg: driveState.heading,
                        posX: driveState.position.x,
                        posZ: driveState.position.z,
                      })
                }
              />
            )}

            {/* Mobile Single-Drawer Drive Tool Switcher above Bottom Nav */}
            {isMobileMode && (
              <div
                data-testid="mobile-drive-tool-switcher"
                className="fixed bottom-[60px] left-2 right-2 z-35 grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-950/92 border border-slate-800 backdrop-blur-md shadow-xl pointer-events-auto"
              >
                <button
                  type="button"
                  data-testid="mobile-tool-drive"
                  onClick={() => setMobileDriveTool((prev) => (prev === 'drive' ? 'none' : 'drive'))}
                  className={`min-h-[38px] px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                    mobileDriveTool === 'drive'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Tay cầm</span>
                </button>

                <button
                  type="button"
                  data-testid="mobile-tool-camera"
                  onClick={() => setMobileDriveTool((prev) => (prev === 'camera' ? 'none' : 'camera'))}
                  className={`min-h-[38px] px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                    mobileDriveTool === 'camera'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5 shrink-0" />
                  <span>Camera</span>
                </button>

                <button
                  type="button"
                  data-testid="mobile-tool-code"
                  onClick={() => setMobileDriveTool((prev) => (prev === 'code' ? 'none' : 'code'))}
                  className={`min-h-[38px] px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                    mobileDriveTool === 'code'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Code IDE</span>
                </button>

                <button
                  type="button"
                  data-testid="mobile-tool-none"
                  onClick={() => setMobileDriveTool('none')}
                  className={`min-h-[38px] px-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                    mobileDriveTool === 'none'
                      ? 'bg-slate-800 text-amber-300 border border-amber-500/40'
                      : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <EyeOff className="w-3.5 h-3.5 shrink-0" />
                  <span>Xem 3D</span>
                </button>
              </div>
            )}
          </>
        )}

        {/* 5. TABLE ANALYSIS OVERLAY VIEW */}
        {activeView === 'table-analysis' && (
          <div
            className={`absolute inset-0 z-20 bg-slate-950/95 overflow-y-auto pointer-events-auto backdrop-blur-sm ${
              isMobileMode ? 'top-12 pb-20' : 'top-14'
            }`}
          >
            <ComponentTable
              onInspect3D={handleInspectComponent}
              selectedComponentId={selectedComponentId}
              onOpenAiGuide={handleOpenAi}
            />
          </div>
        )}
      </main>

      {/* MOBILE FIXED BOTTOM NAVIGATION BAR */}
      {isMobileMode && (
        <nav
          aria-label="Điều hướng chính trên điện thoại"
          data-testid="mobile-bottom-nav"
          className="fixed bottom-0 left-0 right-0 h-14 z-40 bg-slate-950/95 border-t border-slate-800 backdrop-blur-md grid grid-cols-3 gap-1 px-1.5 py-1"
        >
          <button
            type="button"
            data-testid="mobile-nav-3d-inspect"
            onClick={() => {
              setActiveView('3d-inspect');
              robotAudio.playClick(700);
            }}
            className={`min-h-[44px] rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              activeView === '3d-inspect'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>Mô hình 3D</span>
          </button>

          <button
            type="button"
            data-testid="mobile-nav-drive-sim"
            onClick={() => {
              setShowAsdwInInspect(false);
              setActiveView('drive-sim');
              void robotAudio.unlock();
              robotAudio.playClick(750);
            }}
            className={`min-h-[44px] rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              activeView === 'drive-sim'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Gamepad2 className="w-4 h-4 shrink-0" />
            <span>Lái &amp; Cảm biến</span>
          </button>

          <button
            type="button"
            data-testid="mobile-nav-table-analysis"
            onClick={() => {
              setShowAsdwInInspect(false);
              setActiveView('table-analysis');
              robotAudio.playClick(800);
            }}
            className={`min-h-[44px] rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              activeView === 'table-analysis'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <TableProperties className="w-4 h-4 shrink-0" />
            <span>Linh kiện</span>
          </button>
        </nav>
      )}

      {/* 6. AI ADVISOR MODAL */}
      <JetBotAIModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        initialQuery={aiInitialQuery}
      />

      {/* 7. REAL JETBOT PHOTO COMPARISON MODAL */}
      {isPhotoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm text-white">
                  Ảnh Chụp Linh Kiện Robot JetBot Thực Tế (CMU Lớp 10A)
                </h3>
              </div>
              <button
                onClick={() => setIsPhotoModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-slate-300">
                <span className="font-bold text-emerald-400">Ghi chú đối chiếu mô hình: </span>
                Mô hình 3D trong ứng dụng được thiết kế hoàn toàn bám sát theo các góc chụp thực tế này:
                Khung nhôm xanh lá tròn, cụm RPLIDAR đen trên cùng, Camera CSI có cáp dẹt dán dải xanh, bo mạch NVIDIA Jetson Nano có tản nhiệt nhôm đen, 2 bánh xe nan hoa xanh dương và 2 động cơ DC dưới đáy gầm.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
                  <div className="p-2 text-[11px] font-semibold text-slate-300 border-b border-slate-800">
                    1. Camera CSI & Cáp dẹt FFC
                  </div>
                  <img
                    src="/assets/aistudio/image_f841a927.png"
                    alt="Camera CSI"
                    className="w-full h-44 object-cover bg-black"
                  />
                </div>

                <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
                  <div className="p-2 text-[11px] font-semibold text-slate-300 border-b border-slate-800">
                    2. RPLIDAR & Động cơ đai kéo
                  </div>
                  <img
                    src="/assets/aistudio/image_8a45e6b8.png"
                    alt="RPLIDAR"
                    className="w-full h-44 object-cover bg-black"
                  />
                </div>

                <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
                  <div className="p-2 text-[11px] font-semibold text-slate-300 border-b border-slate-800">
                    3. Mặt trước & Bánh xe xanh nan hoa
                  </div>
                  <img
                    src="/assets/aistudio/image_46fc7930.png"
                    alt="Mặt trước JetBot"
                    className="w-full h-44 object-cover bg-black"
                  />
                </div>

                <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
                  <div className="p-2 text-[11px] font-semibold text-slate-300 border-b border-slate-800">
                    4. Tản nhiệt Jetson Nano & Cọc đồng
                  </div>
                  <img
                    src="/assets/aistudio/image_a3d4a2ce.png"
                    alt="Jetson Nano Heatsink"
                    className="w-full h-44 object-cover bg-black"
                  />
                </div>

                <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
                  <div className="p-2 text-[11px] font-semibold text-slate-300 border-b border-slate-800">
                    5. Mặt sau: Cổng USB & Anten Wi-Fi
                  </div>
                  <img
                    src="/assets/aistudio/image_c14dba1a.png"
                    alt="Mặt sau JetBot"
                    className="w-full h-44 object-cover bg-black"
                  />
                </div>

                <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
                  <div className="p-2 text-[11px] font-semibold text-slate-300 border-b border-slate-800">
                    6. Mặt đáy gầm: 2 Động cơ DC & Bánh xoay
                  </div>
                  <img
                    src="/assets/aistudio/image_bbcc8481.png"
                    alt="Mặt đáy gầm xe"
                    className="w-full h-44 object-cover bg-black"
                  />
                </div>

                <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
                  <div className="p-2 text-[11px] font-semibold text-slate-300 border-b border-slate-800">
                    7. Gai lốp rãnh mê cung & Ốc siết Anten
                  </div>
                  <img
                    src="/assets/aistudio/image_3a4f0581.png"
                    alt="Gai lốp và đai ốc anten"
                    className="w-full h-44 object-cover bg-black"
                  />
                </div>

                <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
                  <div className="p-2 text-[11px] font-semibold text-slate-300 border-b border-slate-800">
                    8. Quạt tản nhiệt 40mm & Màn hình OLED
                  </div>
                  <img
                    src="/assets/aistudio/image_a3d4a2ce.png"
                    alt="Quạt tản nhiệt và màn hình OLED"
                    className="w-full h-44 object-cover bg-black"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7b. SINGLE COMPONENT REAL PHOTO LIGHTBOX MODAL */}
      {enlargedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setEnlargedPhoto(null)}
        >
          <div
            className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm text-white truncate">
                  Ảnh chụp thực tế: {enlargedPhoto.title}
                </h3>
              </div>
              <button
                onClick={() => setEnlargedPhoto(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-white flex items-center justify-center overflow-hidden">
              <img
                src={enlargedPhoto.url}
                alt={enlargedPhoto.title}
                className="w-full max-h-[65vh] object-contain rounded-lg"
              />
            </div>

            {enlargedPhoto.caption && (
              <div className="px-4 py-3 bg-slate-950/90 border-t border-slate-800 text-xs text-slate-300">
                <span className="font-semibold text-emerald-400">Chi tiết đối chiếu: </span>
                {enlargedPhoto.caption}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 8. Excavation Discovery Reward Modal */}
      <DigDiscoveryModal
        item={discoveredItemModal}
        collectedByAstronaut={discoveredByAstronaut}
        onClose={() => setDiscoveredItemModal(null)}
        onOpenBackpack={() => setIsBackpackOpen(true)}
        onInspect3D={handleInspectComponent}
      />

      {/* 9. Backpack Modal (Balo linh kiện) */}
      <BackpackModal
        isOpen={isBackpackOpen}
        onClose={() => setIsBackpackOpen(false)}
        inventory={inventory}
        onInspect3D={handleInspectComponent}
      />
    </div>
  );
}
