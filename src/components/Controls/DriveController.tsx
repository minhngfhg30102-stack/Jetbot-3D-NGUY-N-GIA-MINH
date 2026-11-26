import React, { useRef, useState } from 'react';
import {
  Hand,
  Gauge,
  Compass,
  AlertTriangle,
  RotateCcw,
  Zap,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  X,
  ChevronDown,
  Gamepad2,
  Flame,
  Rocket,
  EyeOff,
  Eye
} from 'lucide-react';
import { DriveState, EnvironmentMap } from '../../types/robot';

interface DriveControllerProps {
  driveState: DriveState;
  onSendDriveCommand: (linear: number, angular: number) => void;
  onResetPosition: () => void;
  activePressedKeys?: Set<string>;
  onClose?: () => void;
  obstaclesToppled?: number;
  totalObstacles?: number;
  onResetObstacles?: () => void;
  speedLevel?: number;
  onSpeedLevelChange?: (level: number) => void;
  isTurboActive?: boolean;
  onToggleTurbo?: () => void;
  environmentMap?: EnvironmentMap;
  onEnvironmentMapChange?: (map: EnvironmentMap) => void;
  isMobile?: boolean;
}

export const DriveController: React.FC<DriveControllerProps> = ({
  driveState,
  onSendDriveCommand,
  onResetPosition,
  activePressedKeys = new Set(),
  onClose,
  obstaclesToppled = 0,
  totalObstacles = 6,
  onResetObstacles,
  speedLevel: propSpeedLevel,
  onSpeedLevelChange,
  isTurboActive: propIsTurboActive,
  onToggleTurbo,
  environmentMap = 'mars-planet',
  onEnvironmentMapChange,
  isMobile = false,
}) => {
  // Speed gear levels: 1 (Eco 0.30 m/s), 2 (Normal 0.55 m/s), 3 (Turbo 1.10 m/s)
  const [internalSpeedLevel, setInternalSpeedLevel] = useState<number>(2);
  const currentSpeedLevel = propSpeedLevel !== undefined ? propSpeedLevel : internalSpeedLevel;
  const setEffectiveSpeedLevel = (lvl: number) => {
    if (onSpeedLevelChange) {
      onSpeedLevelChange(lvl);
    } else {
      setInternalSpeedLevel(lvl);
    }
  };

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Check if Shift key is actively held for Turbo
  const isShiftPressed = activePressedKeys.has('ShiftLeft') || activePressedKeys.has('ShiftRight');
  const isTurbo = propIsTurboActive !== undefined ? propIsTurboActive : (currentSpeedLevel === 3 || isShiftPressed);

  const getLinearSpeed = () => {
    if (isTurbo) return 1.10; // Boost 2x!
    if (currentSpeedLevel === 1) return 0.30;
    return 0.55;
  };

  const getAngularSpeed = () => {
    if (isTurbo) return 2.6;
    if (currentSpeedLevel === 1) return 1.4;
    return 1.9;
  };

  const handleToggleTurboMode = () => {
    if (onToggleTurbo) {
      onToggleTurbo();
    } else {
      setEffectiveSpeedLevel(currentSpeedLevel === 3 ? 2 : 3);
    }
  };

  const isClose = driveState.nearestObstacleDistance < 0.6;
  const isWarning = driveState.nearestObstacleDistance < 1.0;

  // Active key checks
  const isWActive = activePressedKeys.has('KeyW') || activePressedKeys.has('ArrowUp');
  const isAActive = activePressedKeys.has('KeyA') || activePressedKeys.has('ArrowLeft');
  const isSActive = activePressedKeys.has('KeyS') || activePressedKeys.has('ArrowDown');
  const isDActive = activePressedKeys.has('KeyD') || activePressedKeys.has('ArrowRight');
  const isSpaceActive = activePressedKeys.has('Space');

  // Track active pointerId pressing any on-screen D-pad button so:
  // 1) Releasing/moving another pointer (e.g. rotating the 3D view) doesn't stop driving
  // 2) Hovering across D-pad buttons with mouse doesn't wipe out keyboard WASD movement
  const activeDpadPointerRef = useRef<{ pointerId: number; control: string } | null>(null);

  const handleDpadPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    control: string,
    linear: number,
    angular: number
  ) => {
    e.preventDefault();
    activeDpadPointerRef.current = { pointerId: e.pointerId, control };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointer events in tests may lack an active browser pointer id
    }
    onSendDriveCommand(linear, angular);
  };

  const handleDpadPointerEnd = (e: React.PointerEvent<HTMLButtonElement>, control: string) => {
    if (
      activeDpadPointerRef.current &&
      activeDpadPointerRef.current.pointerId === e.pointerId &&
      activeDpadPointerRef.current.control === control
    ) {
      activeDpadPointerRef.current = null;
      try {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Safe cleanup fallback
      }
      onSendDriveCommand(0, 0);
    }
  };

  // Handle Hide / Close
  const handleHide = () => {
    if (onClose) {
      onClose();
    } else {
      setIsCollapsed(true);
    }
  };

  // Dedicated compact Touch Bottom Sheet for Mobile Mode
  if (isMobile) {
    return (
      <div
        data-testid="mobile-drive-controller"
        className="fixed bottom-[106px] left-2 right-2 z-30 pointer-events-auto"
      >
        <div className="bg-slate-900/95 border border-slate-700/90 rounded-2xl p-2.5 shadow-2xl backdrop-blur-md flex flex-col gap-2 text-slate-200">
          {/* Compact Header */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <Gamepad2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-bold text-[11px] text-white uppercase tracking-wide truncate">
                Điều khiển chạm
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onResetPosition}
                className="px-2 py-1 text-slate-300 hover:text-emerald-300 bg-slate-800 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border border-slate-700 whitespace-nowrap shrink-0"
                title="Đặt lại vị trí xe"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={handleHide}
                className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[10px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
                title="Thu gọn bảng lái"
              >
                <ChevronDown className="w-3 h-3 text-emerald-400" />
                <span>Thu gọn</span>
              </button>
            </div>
          </div>

          {/* Single-Line Live Telemetry + Contextual Status */}
          <div className="flex items-center justify-between gap-1.5 bg-slate-950/85 px-2.5 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono tabular-nums">
            <span className="text-cyan-300 font-bold">
              {(Math.abs(driveState.linearVelocity) * 100).toFixed(0)} <span className="text-[9px] text-slate-400 font-normal">cm/s</span>
            </span>
            <span className="text-slate-700">·</span>
            <span className="text-emerald-300 font-bold">{Math.round(driveState.heading)}°</span>
            <span className="text-slate-700">·</span>
            <span className={isClose ? 'text-red-400 font-bold' : isWarning ? 'text-amber-300 font-bold' : 'text-slate-200 font-bold'}>
              Lidar {(driveState.nearestObstacleDistance * 100).toFixed(0)}cm
            </span>
            <span className="text-slate-700">·</span>
            <span className="text-amber-300 font-bold">
              Đổ {obstaclesToppled}/{totalObstacles}
            </span>
          </div>

          {(driveState.alienDetected || driveState.isCharging) && (
            <div
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center justify-between ${
                driveState.isCharging
                  ? 'bg-emerald-950/90 border border-emerald-500/50 text-emerald-300'
                  : 'bg-rose-950/90 border border-rose-500/50 text-rose-200'
              }`}
            >
              <span>
                {driveState.isCharging
                  ? `⚡ Đang sạc tàu vũ trụ (${driveState.chargingBatteryLevel ?? 95}%)`
                  : '⚠️ Alien đang tiếp cận gần JetBot!'}
              </span>
            </div>
          )}

          {/* Side-by-side Touch D-Pad + Speed / Brake Actions */}
          <div className="flex items-center justify-between gap-2.5">
            {/* Left: Touch-safe D-Pad (min 44px targets, touch-none) */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <button
                type="button"
                onPointerDown={(e) => handleDpadPointerDown(e, 'm-w', getLinearSpeed(), 0)}
                onPointerUp={(e) => handleDpadPointerEnd(e, 'm-w')}
                onPointerCancel={(e) => handleDpadPointerEnd(e, 'm-w')}
                onLostPointerCapture={(e) => handleDpadPointerEnd(e, 'm-w')}
                className={`touch-none select-none w-12 h-11 rounded-xl flex items-center justify-center border-2 transition-all cursor-pointer ${
                  isWActive
                    ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                    : 'bg-slate-800 text-slate-100 border-slate-600 active:bg-emerald-500 active:text-slate-950'
                }`}
                aria-label="Tiến"
              >
                <ArrowUp className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onPointerDown={(e) => handleDpadPointerDown(e, 'm-a', 0, getAngularSpeed())}
                  onPointerUp={(e) => handleDpadPointerEnd(e, 'm-a')}
                  onPointerCancel={(e) => handleDpadPointerEnd(e, 'm-a')}
                  onLostPointerCapture={(e) => handleDpadPointerEnd(e, 'm-a')}
                  className={`touch-none select-none w-12 h-11 rounded-xl flex items-center justify-center border-2 transition-all cursor-pointer ${
                    isAActive
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                      : 'bg-slate-800 text-slate-100 border-slate-600 active:bg-emerald-500 active:text-slate-950'
                  }`}
                  aria-label="Rẽ trái"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => handleDpadPointerDown(e, 'm-s', -getLinearSpeed() * 0.75, 0)}
                  onPointerUp={(e) => handleDpadPointerEnd(e, 'm-s')}
                  onPointerCancel={(e) => handleDpadPointerEnd(e, 'm-s')}
                  onLostPointerCapture={(e) => handleDpadPointerEnd(e, 'm-s')}
                  className={`touch-none select-none w-12 h-11 rounded-xl flex items-center justify-center border-2 transition-all cursor-pointer ${
                    isSActive
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                      : 'bg-slate-800 text-slate-100 border-slate-600 active:bg-emerald-500 active:text-slate-950'
                  }`}
                  aria-label="Lùi"
                >
                  <ArrowDown className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => handleDpadPointerDown(e, 'm-d', 0, -getAngularSpeed())}
                  onPointerUp={(e) => handleDpadPointerEnd(e, 'm-d')}
                  onPointerCancel={(e) => handleDpadPointerEnd(e, 'm-d')}
                  onLostPointerCapture={(e) => handleDpadPointerEnd(e, 'm-d')}
                  className={`touch-none select-none w-12 h-11 rounded-xl flex items-center justify-center border-2 transition-all cursor-pointer ${
                    isDActive
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                      : 'bg-slate-800 text-slate-100 border-slate-600 active:bg-emerald-500 active:text-slate-950'
                  }`}
                  aria-label="Rẽ phải"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Right: Gear Selector + Turbo + Brake */}
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="grid grid-cols-3 gap-1">
                {[
                  { lvl: 1, label: 'Chậm' },
                  { lvl: 2, label: 'Chuẩn' },
                  { lvl: 3, label: 'Turbo' },
                ].map((gear) => {
                  const active = gear.lvl === 3 ? isTurbo : currentSpeedLevel === gear.lvl && !isTurbo;
                  return (
                    <button
                      key={gear.lvl}
                      type="button"
                      onClick={() => setEffectiveSpeedLevel(gear.lvl)}
                      className={`min-h-[34px] rounded-lg text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? gear.lvl === 3
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {gear.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onPointerDown={() => onSendDriveCommand(0, 0)}
                className="touch-none select-none w-full min-h-[44px] rounded-xl flex items-center justify-center gap-1.5 bg-red-950/90 active:bg-red-500 text-red-200 active:text-white border border-red-500/50 text-xs font-bold cursor-pointer"
              >
                <Hand className="w-4 h-4" />
                <span>PHANH DỪNG</span>
              </button>

              {onResetObstacles && (
                <button
                  type="button"
                  onClick={onResetObstacles}
                  className="w-full py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Dựng lại vật cản</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If collapsed, show a sleek floating trigger pill on the bottom left with Turbo toggle
  if (isCollapsed) {
    return (
      <div className="fixed bottom-5 left-5 z-30 pointer-events-auto flex items-center gap-2">
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-900/95 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 border border-slate-700/90 rounded-2xl shadow-2xl backdrop-blur-md transition-all cursor-pointer font-bold text-xs group"
          title="Mở lại bảng phím di chuyển ASDW"
        >
          <Gamepad2 className="w-4 h-4 text-emerald-400 group-hover:text-slate-950 transition-colors" />
          <span>Hiện phím ASDW</span>
          <span className="text-[10px] bg-slate-800 text-slate-300 group-hover:bg-emerald-700 group-hover:text-white px-2 py-0.5 rounded-lg border border-slate-700 font-mono">
            {(Math.abs(driveState.linearVelocity) * 100).toFixed(0)} cm/s
          </span>
        </button>

        {/* Quick Turbo Boost button when collapsed */}
        <button
          onClick={handleToggleTurboMode}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md transition-all cursor-pointer font-bold text-xs border ${
            isTurbo
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 border-amber-300 ring-2 ring-amber-400/50 animate-pulse'
              : 'bg-slate-900/95 text-amber-300 hover:bg-slate-800 border-amber-500/40'
          }`}
          title="Bật/Tắt tăng tốc Turbo (200% tốc độ)"
        >
          <Rocket className="w-4 h-4" />
          <span>{isTurbo ? 'Turbo 200%' : 'Tăng tốc'}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-3 left-3 sm:bottom-5 sm:left-5 z-30 pointer-events-auto max-h-[calc(100vh-1.5rem)] flex flex-col">
      <div className="relative bg-slate-900/98 border border-slate-700/90 rounded-2xl p-3 sm:p-4 shadow-2xl backdrop-blur-md flex flex-col gap-2.5 sm:gap-3 w-[295px] sm:w-80 text-slate-200 max-h-[calc(100vh-1.5rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
        {/* Top Header with Prominent Hide/Close Button */}
        <div className="sticky -top-3 sm:-top-4 -mx-3 sm:-mx-4 px-3 sm:px-4 pt-2 pb-2 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 z-10 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-xs text-white uppercase tracking-wider">
              BỘ ĐIỀU KHIỂN ASDW
            </span>
            <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-500/30">
              60 FPS
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onResetPosition}
              title="Đặt lại vị trí xe xuất phát"
              className="px-2 py-1 text-slate-400 hover:text-emerald-300 hover:bg-slate-800 rounded-lg transition-colors text-[10px] flex items-center gap-1 cursor-pointer border border-slate-800"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>

            {/* Prominent High-Visibility Hide / Close Button */}
            <button
              onClick={handleHide}
              title="Ẩn bộ điều khiển phím ASDW"
              className="flex items-center gap-1 px-2.5 py-1 bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white border border-red-500/40 hover:border-red-500 rounded-lg transition-all text-xs font-bold cursor-pointer shadow group"
            >
              <EyeOff className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              <span>Ẩn bảng</span>
            </button>
          </div>
        </div>

        {/* Environment Map Switcher: Mars Planet vs CMU Arena */}
        {onEnvironmentMapChange && (
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/90 rounded-xl border border-slate-800">
            <button
              onClick={() => onEnvironmentMapChange('mars-planet')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                environmentMap === 'mars-planet'
                  ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-lg shadow-red-900/40 ring-1 ring-red-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Khám phá bề mặt Sao Hỏa & Sinh vật ngoài hành tinh"
            >
              <span>🪐 Sao Hỏa (Alien)</span>
            </button>
            <button
              onClick={() => onEnvironmentMapChange('cmu-arena')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                environmentMap === 'cmu-arena'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/40 ring-1 ring-emerald-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Đấu trường sa bàn thi đấu CMU 10A"
            >
              <span>🏟️ Sân CMU 10A</span>
            </button>
          </div>
        )}

        {/* Mars Expedition Alien Radar Status */}
        {environmentMap === 'mars-planet' && (
          <div
            className={`p-2.5 rounded-xl border transition-all ${
              driveState.alienDetected
                ? 'bg-gradient-to-r from-purple-950/90 to-rose-950/90 border-purple-500 shadow-lg shadow-purple-900/40 ring-1 ring-purple-400 animate-pulse'
                : 'bg-purple-950/30 border-purple-800/50'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <div className="flex items-center gap-1.5 font-bold text-purple-300">
                <span className="text-sm">👽</span>
                <span>RADAR SINH VẬT SAO HỎA</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-900/70 text-purple-200 border border-purple-700/60 font-semibold">
                {driveState.aliensCount || 3} cá thể di chuyển
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span className="text-slate-400">Cự ly Alien gần nhất:</span>
              <span
                className={`font-mono font-bold ${
                  driveState.alienDetected ? 'text-rose-400 text-xs' : 'text-purple-300'
                }`}
              >
                {driveState.nearestAlienDistance !== undefined && driveState.nearestAlienDistance < 99
                  ? `${(driveState.nearestAlienDistance * 100).toFixed(0)} cm`
                  : 'Đang quét 360°...'}
              </span>
            </div>

            {driveState.alienDetected && (
              <div className="mt-1.5 pt-1.5 border-t border-purple-800/60 flex items-center gap-1 text-[10px] font-bold text-rose-300 animate-bounce">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>⚠️ ALIEN ĐANG TIẾP CẬN JETBOT!</span>
              </div>
            )}
          </div>
        )}

        {/* Astronauts Status Badge */}
        {environmentMap === 'mars-planet' && (
          <div
            className={`p-2 rounded-xl border text-xs transition-all ${
              driveState.astronautFleeing
                ? 'bg-amber-950/70 border-amber-500/80 text-amber-200 animate-pulse'
                : 'bg-slate-950/80 border-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold">
                <span className="text-sm">👨‍🚀</span>
                <span>PHI HÀNH GIA ({driveState.astronautsCount ?? 3})</span>
              </div>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                  driveState.astronautFleeing
                    ? 'bg-red-500 text-white animate-bounce'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                }`}
              >
                {driveState.astronautFleeing ? '🏃 CHẠY TRỐN ALIEN!' : '🟢 Đang thám hiểm'}
              </span>
            </div>
          </div>
        )}

        {/* Spaceship Charging Bay Docking Status */}
        {driveState.isCharging && (
          <div className="p-2.5 rounded-xl border bg-gradient-to-r from-emerald-950/95 to-teal-950/95 border-emerald-400 shadow-xl shadow-emerald-950/50 ring-2 ring-emerald-400/50 animate-pulse">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                <span className="text-sm">⚡</span>
                <span>TRẠM SẠC TÀU VŨ TRỤ KẾT NỐI</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-extrabold shadow">
                {driveState.chargingBatteryLevel ?? 95}% PIN
              </span>
            </div>

            <div className="text-[11px] text-emerald-200 flex items-center justify-between font-mono bg-emerald-950/80 px-2 py-1 rounded-lg border border-emerald-600/40">
              <span className="text-slate-300">Dây sạc nam châm:</span>
              <span className="text-emerald-300 font-bold">ĐÃ CẮM CỔNG XT60</span>
            </div>
            <div className="text-[10px] text-emerald-300/80 mt-1.5 flex items-center justify-between font-mono px-1">
              <span>Điện áp: 12.6V (3S Li-ion)</span>
              <span>Dòng sạc: 3.2A Fast</span>
            </div>
          </div>
        )}

        {/* Real-time Telemetry Readout */}
        <div className="grid grid-cols-3 gap-1.5 text-center bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
          <div>
            <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1 mb-0.5">
              <Gauge className="w-3 h-3 text-cyan-400" />
              <span>Vận tốc</span>
            </div>
            <div className="font-mono text-sm font-bold text-cyan-300">
              {(Math.abs(driveState.linearVelocity) * 100).toFixed(0)}{' '}
              <span className="text-[9px] font-normal text-slate-400">cm/s</span>
            </div>
          </div>

          <div>
            <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1 mb-0.5">
              <Compass className="w-3 h-3 text-emerald-400" />
              <span>Hướng xe</span>
            </div>
            <div className="font-mono text-sm font-bold text-emerald-300">
              {Math.round(driveState.heading)}°
            </div>
          </div>

          <div>
            <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1 mb-0.5">
              <AlertTriangle
                className={`w-3 h-3 ${
                  isClose ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-slate-400'
                }`}
              />
              <span>RPLIDAR</span>
            </div>
            <div
              className={`font-mono text-sm font-bold ${
                isClose
                  ? 'text-red-400'
                  : isWarning
                  ? 'text-yellow-400'
                  : 'text-slate-200'
              }`}
            >
              {(driveState.nearestObstacleDistance * 100).toFixed(0)}{' '}
              <span className="text-[9px] font-normal text-slate-400">cm</span>
            </div>
          </div>
        </div>

        {/* Hill Climbing Indicator when JetBot climbs mounds on Mars */}
        {driveState.terrainElevation !== undefined && driveState.terrainElevation > 0.015 && (
          <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-950/80 to-orange-950/80 border border-amber-500/50 text-amber-200 animate-fadeIn">
            <div className="flex items-center gap-1.5 font-bold">
              <span>⛰️ Đang leo đồi:</span>
              <span className="font-mono text-amber-300">
                +{(driveState.terrainElevation * 100).toFixed(0)} cm
              </span>
            </div>
            <div className="text-[10px] font-mono bg-amber-900/60 text-amber-200 px-2 py-0.5 rounded border border-amber-600/40">
              Độ dốc: {driveState.climbingAngle ?? 0}°
            </div>
          </div>
        )}

        {/* Obstacles Toppled Readout & Reset Button & Quick Hide Button */}
        <div className="flex items-center justify-between bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                obstaclesToppled > 0 ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
              }`}
            />
            <span className="text-[11px] font-medium">Đã đâm đổ:</span>
            <span className="font-mono font-bold text-amber-300">
              {obstaclesToppled}/{totalObstacles}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {onResetObstacles && (
              <button
                onClick={onResetObstacles}
                className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-emerald-600 hover:text-slate-950 text-slate-300 transition-colors text-[10px] font-bold flex items-center gap-1 cursor-pointer border border-slate-700"
                title="Dựng lại tất cả chướng ngại vật trên sân"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Dựng lại vật cản</span>
              </button>
            )}

            <button
              onClick={handleHide}
              className="px-2 py-0.5 rounded-lg bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white transition-colors text-[10px] font-bold flex items-center gap-1 cursor-pointer border border-red-500/40 shadow-sm"
              title="Ẩn bảng điều khiển ASDW này"
            >
              <EyeOff className="w-2.5 h-2.5" />
              <span>Ẩn bảng</span>
            </button>
          </div>
        </div>

        {/* Prominent Turbo Speed Boost Button */}
        <div className="flex flex-col gap-1.5 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
          <button
            onClick={handleToggleTurboMode}
            className={`w-full py-2 px-3 rounded-xl flex items-center justify-between font-bold text-xs transition-all cursor-pointer shadow-lg select-none ${
              isTurbo
                ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-950 shadow-orange-500/25 ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-900 active:scale-95'
                : 'bg-slate-800/90 hover:bg-slate-750 text-amber-300 hover:text-white border border-amber-500/40 hover:border-amber-400 active:scale-95'
            }`}
            title="Nhấn phím Shift hoặc nhấn nút này để kích hoạt tăng tốc Turbo 200%"
          >
            <div className="flex items-center gap-2">
              <span className={`p-1 rounded-lg ${isTurbo ? 'bg-slate-950/20 text-slate-950' : 'bg-amber-500/20 text-amber-400'}`}>
                <Rocket className="w-4 h-4 animate-bounce" />
              </span>
              <div className="text-left">
                <div className="leading-tight font-black tracking-wide flex items-center gap-1.5">
                  <span>TĂNG TỐC JETBOT</span>
                  {isTurbo && (
                    <span className="text-[9px] bg-slate-950 text-amber-300 px-1.5 py-0.2 rounded-full font-mono uppercase">
                      200%
                    </span>
                  )}
                </div>
                <div className="text-[10px] opacity-80 font-normal">
                  {isTurbo ? 'Đang chạy siêu tốc (1.1 m/s) · Nhấn Shift để lướt' : 'Nhấn nút hoặc giữ phím SHIFT để tăng tốc'}
                </div>
              </div>
            </div>

            <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
              isTurbo ? 'bg-slate-950 text-amber-400' : 'bg-slate-900 text-slate-400 border border-slate-700'
            }`}>
              {isTurbo ? 'BẬT 🚀' : 'TẮT'}
            </div>
          </button>

          {/* 3 Preset Speed Levels */}
          <div className="grid grid-cols-3 gap-1 pt-1">
            <button
              onClick={() => setEffectiveSpeedLevel(1)}
              className={`py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer text-center ${
                currentSpeedLevel === 1 && !isTurbo
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60'
              }`}
              title="Tốc độ chậm: 30 cm/s"
            >
              🌱 30 cm/s Chậm
            </button>
            <button
              onClick={() => setEffectiveSpeedLevel(2)}
              className={`py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer text-center ${
                currentSpeedLevel === 2 && !isTurbo
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60'
              }`}
              title="Tốc độ vừa chuẩn: 55 cm/s"
            >
              ⚡ 55 cm/s Chuẩn
            </button>
            <button
              onClick={() => setEffectiveSpeedLevel(3)}
              className={`py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer text-center ${
                isTurbo
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow'
                  : 'bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60'
              }`}
              title="Tốc độ tăng tốc Turbo: 110 cm/s (hoặc giữ Shift)"
            >
              🚀 110 cm/s Turbo
            </button>
          </div>
        </div>

        {/* PRIMARY ASDW MECHANICAL KEYBOARD CLUSTER */}
        <div className="flex flex-col items-center gap-2 py-1">
          {/* Key W (Forward) */}
          <button
            type="button"
            onPointerDown={(e) => handleDpadPointerDown(e, 'd-w', getLinearSpeed(), 0)}
            onPointerUp={(e) => handleDpadPointerEnd(e, 'd-w')}
            onPointerCancel={(e) => handleDpadPointerEnd(e, 'd-w')}
            onLostPointerCapture={(e) => handleDpadPointerEnd(e, 'd-w')}
            className={`touch-none group relative w-16 h-14 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer select-none border-2 ${
              isWActive
                ? 'bg-emerald-500 text-slate-950 border-emerald-300 translate-y-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] ring-4 ring-emerald-400/40'
                : 'bg-gradient-to-b from-slate-800 to-slate-850 text-slate-100 border-slate-600 shadow-[0_5px_0_0_#1e293b,0_8px_10px_rgba(0,0,0,0.4)] hover:border-emerald-500/60 active:translate-y-1 active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]'
            }`}
            title="Nhấn W hoặc Mũi tên Lên để Tiến"
          >
            <span className="font-mono text-xl font-black leading-none tracking-tight">W</span>
            <span className="text-[8px] font-bold uppercase tracking-wider opacity-80 flex items-center gap-0.5 mt-0.5">
              <ArrowUp className="w-2.5 h-2.5" /> TIẾN
            </span>
          </button>

          {/* Row of A, S, D */}
          <div className="flex items-center gap-2">
            {/* Key A (Turn Left) */}
            <button
              type="button"
              onPointerDown={(e) => handleDpadPointerDown(e, 'd-a', 0, getAngularSpeed())}
              onPointerUp={(e) => handleDpadPointerEnd(e, 'd-a')}
              onPointerCancel={(e) => handleDpadPointerEnd(e, 'd-a')}
              onLostPointerCapture={(e) => handleDpadPointerEnd(e, 'd-a')}
              className={`touch-none group relative w-16 h-14 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer select-none border-2 ${
                isAActive
                  ? 'bg-emerald-500 text-slate-950 border-emerald-300 translate-y-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] ring-4 ring-emerald-400/40'
                  : 'bg-gradient-to-b from-slate-800 to-slate-850 text-slate-100 border-slate-600 shadow-[0_5px_0_0_#1e293b,0_8px_10px_rgba(0,0,0,0.4)] hover:border-emerald-500/60 active:translate-y-1 active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]'
              }`}
              title="Nhấn A hoặc Mũi tên Trái để Rẽ Trái"
            >
              <span className="font-mono text-xl font-black leading-none tracking-tight">A</span>
              <span className="text-[8px] font-bold uppercase tracking-wider opacity-80 flex items-center gap-0.5 mt-0.5">
                <ArrowLeft className="w-2.5 h-2.5" /> TRÁI
              </span>
            </button>

            {/* Key S (Reverse) */}
            <button
              type="button"
              onPointerDown={(e) => handleDpadPointerDown(e, 'd-s', -getLinearSpeed() * 0.75, 0)}
              onPointerUp={(e) => handleDpadPointerEnd(e, 'd-s')}
              onPointerCancel={(e) => handleDpadPointerEnd(e, 'd-s')}
              onLostPointerCapture={(e) => handleDpadPointerEnd(e, 'd-s')}
              className={`touch-none group relative w-16 h-14 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer select-none border-2 ${
                isSActive
                  ? 'bg-emerald-500 text-slate-950 border-emerald-300 translate-y-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] ring-4 ring-emerald-400/40'
                  : 'bg-gradient-to-b from-slate-800 to-slate-850 text-slate-100 border-slate-600 shadow-[0_5px_0_0_#1e293b,0_8px_10px_rgba(0,0,0,0.4)] hover:border-emerald-500/60 active:translate-y-1 active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]'
              }`}
              title="Nhấn S hoặc Mũi tên Xuống để Lùi"
            >
              <span className="font-mono text-xl font-black leading-none tracking-tight">S</span>
              <span className="text-[8px] font-bold uppercase tracking-wider opacity-80 flex items-center gap-0.5 mt-0.5">
                <ArrowDown className="w-2.5 h-2.5" /> LÙI
              </span>
            </button>

            {/* Key D (Turn Right) */}
            <button
              type="button"
              onPointerDown={(e) => handleDpadPointerDown(e, 'd-d', 0, -getAngularSpeed())}
              onPointerUp={(e) => handleDpadPointerEnd(e, 'd-d')}
              onPointerCancel={(e) => handleDpadPointerEnd(e, 'd-d')}
              onLostPointerCapture={(e) => handleDpadPointerEnd(e, 'd-d')}
              className={`touch-none group relative w-16 h-14 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer select-none border-2 ${
                isDActive
                  ? 'bg-emerald-500 text-slate-950 border-emerald-300 translate-y-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] ring-4 ring-emerald-400/40'
                  : 'bg-gradient-to-b from-slate-800 to-slate-850 text-slate-100 border-slate-600 shadow-[0_5px_0_0_#1e293b,0_8px_10px_rgba(0,0,0,0.4)] hover:border-emerald-500/60 active:translate-y-1 active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]'
              }`}
              title="Nhấn D hoặc Mũi tên Phải để Rẽ Phải"
            >
              <span className="font-mono text-xl font-black leading-none tracking-tight">D</span>
              <span className="text-[8px] font-bold uppercase tracking-wider opacity-80 flex items-center gap-0.5 mt-0.5">
                <ArrowRight className="w-2.5 h-2.5" /> PHẢI
              </span>
            </button>
          </div>

          {/* SPACE KEY (Brake / Emergency Stop) */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              activeDpadPointerRef.current = null;
              onSendDriveCommand(0, 0);
            }}
            className={`touch-none w-full h-9 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer select-none border-2 ${
              isSpaceActive
                ? 'bg-red-500 text-white border-red-300 translate-y-0.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] ring-4 ring-red-400/40'
                : 'bg-slate-800/90 text-red-300 border-red-500/40 shadow-[0_4px_0_0_#450a0a] hover:bg-red-950 hover:border-red-400'
            }`}
            title="Nhấn phím Space để phanh dừng"
          >
            <Hand className="w-3.5 h-3.5" />
            <span className="font-mono text-xs font-bold tracking-wide">
              SPACE · PHANH KHẨN CẤP
            </span>
          </button>
        </div>

        {/* Footer Keyboard Hint */}
        <div className="text-[10px] text-center text-slate-400 font-mono bg-slate-950/50 py-1 px-2 rounded-lg border border-slate-800/60 leading-relaxed">
          💡 <span className="text-emerald-400 font-bold">W-A-S-D</span>: Lái xe · <span className="text-cyan-300 font-bold">I / O</span> & Cuộn chuột: Phóng to / Thu nhỏ
        </div>
      </div>
    </div>
  );
};
