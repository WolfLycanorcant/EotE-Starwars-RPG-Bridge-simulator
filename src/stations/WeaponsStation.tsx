import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { shipStore, Ship } from '../stores/shipStore';

/** =========================
 *  Types
 *  ========================= */
type Subsystem = 'ENGINES' | 'WEAPONS' | 'SHIELDS' | 'COMMS';
type Ammo = 'KINETIC' | 'ION' | 'SEEKER' | 'PIERCING';

interface EnemyShip {
  id: string;
  // Radar polar spawn input (deg + 0..100 distance) — GM spawns use this
  x: number;    // angle deg on radar
  y: number;    // distance 0..100 (scaled to radar radius)
  // World-ish internal
  heading: number;     // deg
  speed: number;       // arbitrary radar units/sec
  size: number;        // 1..3 (affects blip size and hitbox)
  hp: number;          // hull
  shields: number;     // shield
  ecmFreq: number;     // for missile lock mini-game
  alive: boolean;
  wreck: boolean;
  salvageProgress: number; // 0..1
  waypoint?: {         // pathfinding waypoint
    x: number;         // target angle
    y: number;         // target distance
    reachTime: number; // when to pick new waypoint
  };
}

interface WeaponsStationProps {
  socket?: Socket | null; // optional: App currently doesn't pass it, so we'll create our own by default
}

const R_WIDTH = 520;
const R_HEIGHT = 520;
const RADAR_RADIUS = 230;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const wrapDeg = (d: number) => ((d % 360) + 360) % 360;

/** Ammo definitions (damage & behavior modifiers) */
const AMMO_DEF: Record<Ammo, {
  name: string;
  heatPerShot: number;
  baseDamage: number;           // before subsystem modifiers
  shieldMult: number;           // vs shields
  hullMult: number;             // vs hull
  spreadMult: number;           // accuracy modifier
  requiresLock?: boolean;       // seeker requires lock
  critSubsystem?: boolean;      // piercing gets more crit chance
}> = {
  KINETIC: { name: 'KINETIC', heatPerShot: 18, baseDamage: 12, shieldMult: 0.7, hullMult: 1.2, spreadMult: 1.0 },
  ION: { name: 'ION', heatPerShot: 14, baseDamage: 8, shieldMult: 1.8, hullMult: 0.4, spreadMult: 1.1 },
  SEEKER: { name: 'SEEKER', heatPerShot: 25, baseDamage: 20, shieldMult: 1.0, hullMult: 1.0, spreadMult: 0.6, requiresLock: true },
  PIERCING: { name: 'PIERCING', heatPerShot: 22, baseDamage: 14, shieldMult: 0.9, hullMult: 1.1, spreadMult: 0.9, critSubsystem: true }
};

/** Subsystem aim bonuses */
const SUBSYS_DEF: Record<Subsystem, { name: string; dmgMult: number; special?: string }> = {
  ENGINES: { name: 'ENGINES', dmgMult: 1.0, special: 'slow_on_hit' },
  WEAPONS: { name: 'WEAPONS', dmgMult: 1.0, special: 'accuracy_debuff' },
  SHIELDS: { name: 'SHIELDS', dmgMult: 1.15 },
  COMMS: { name: 'COMMS', dmgMult: 0.9, special: 'lock_weaken' }
};

/** =========================
 *  Component
 *  ========================= */
const WeaponsStation: React.FC<WeaponsStationProps> = ({ socket: socketProp }) => {
  /** ----- Socket & room ----- */
  const [socket, setSocket] = useState<Socket | null>(socketProp ?? null);
  const roomRef = useRef<string>('default');

  useEffect(() => {
    if (socketProp) {
      setSocket(socketProp);
      return;
    }
    // Self-managed socket (works with your App which doesn't pass one)
    const s = io({
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true
    });
    setSocket(s);

    // read room from URL
    const room = new URLSearchParams(window.location.search).get('room') || 'default';
    roomRef.current = room;

    s.on('connect', () => {
      s.emit('join', { room: roomRef.current, station: 'weapons', name: 'Weapons Officer' });
    });

    return () => { s.disconnect(); };
  }, [socketProp]);

  /** ----- Canvas & animation ----- */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [enemies, setEnemies] = useState<EnemyShip[]>([]);
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);

  /** ----- Target solve & tracking ----- */
  const [solveQuality, setSolveQuality] = useState(0);  // 0..1
  const [reticleTightness, setReticleTightness] = useState(16); // px ring to keep target inside to build solve
  const [showLead, setShowLead] = useState(false);

  /** ----- Track stabilization (pilot drift) ----- */
  const [trackError, setTrackError] = useState(0); // adds to spread
  const [pilotTurnRate, setPilotTurnRate] = useState(0); // from nav updates
  const [playerCorrection, setPlayerCorrection] = useState(0); // -1..1 from A/D or left/right arrow

  /** ----- Heat / Overheat / Active reload ----- */
  const [heat, setHeat] = useState(0);             // 0..100
  const [overheated, setOverheated] = useState(false);
  const [reloadWindow, setReloadWindow] = useState<{ start: number; end: number } | null>(null); // 0..1 meter
  const [jamTimer, setJamTimer] = useState<number>(0); // fallback if miss active reload

  /** ----- Missile lock mini-game ----- */
  const [playerFreq, setPlayerFreq] = useState(500); // 0..1000 dial
  const [lockFill, setLockFill] = useState(0);       // 0..1
  const [locked, setLocked] = useState(false);
  const [ecmKnock, setEcmKnock] = useState(0);       // visual drop on ECM burst

  /** ----- Weapon config ----- */
  const [ammo, setAmmo] = useState<Ammo>('KINETIC');
  const [aim, setAim] = useState<Subsystem>('ENGINES');
  const [projectileSpeed] = useState(220); // radar units/sec; tweak to taste

  /** ----- Loot after salvage ----- */
  const [missiles, setMissiles] = useState(4);
  const [heatSinks, setHeatSinks] = useState(0);

  /** ----- Input: fire, reload timing, track correction ----- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (e.code === 'Space') {
        // If jammed/overheated, Space is used for active reload attempt
        if (overheated && reloadWindow) {
          const marker = Math.random(); // Replace with real timing meter if you want UI-synced bar
          if (marker >= reloadWindow.start && marker <= reloadWindow.end) {
            // Clean clear
            setOverheated(false);
            setHeat(35);
            setReloadWindow(null);
            setJamTimer(0);
          } else {
            // Bad clear — longer jam
            setReloadWindow(null);
            setJamTimer(1.5); // seconds
          }
          return;
        }

        // Normal firing
        handleFire();
      }

      // Track correction: A/D or arrows
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') setPlayerCorrection(-1);
      if (e.code === 'KeyD' || e.code === 'ArrowRight') setPlayerCorrection(1);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'ArrowRight') {
        setPlayerCorrection(0);
      }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [overheated, reloadWindow, ammo, locked, selectedEnemyId, enemies, heat]);

  /** ----- Listen to GM spawns & events + pilot/nav drift ----- */
  useEffect(() => {
    if (!socket) return;

    const onGMBroadcast = (data: any) => {
      if (data.room !== roomRef.current) return;

      switch (data.type) {
        case 'spawn_enemy_ship': {
          const e = data.value as Partial<EnemyShip>;
          setEnemies(prev => [
            ...prev,
            {
              id: e.id || `enemy-${Date.now()}`,
              x: typeof e.x === 'number' ? e.x : Math.random() * 360,
              y: typeof e.y === 'number' ? e.y : Math.random() * 100,
              heading: typeof e.heading === 'number' ? e.heading : Math.random() * 360,
              speed: typeof e.speed === 'number' ? e.speed : (Math.random() * 40 + 20),
              size: typeof e.size === 'number' ? e.size : (1 + Math.random() * 2),
              hp: 120,
              shields: 80,
              ecmFreq: Math.floor(Math.random() * 1000),
              alive: true,
              wreck: false,
              salvageProgress: 0
            }
          ]);
          break;
        }
        case 'wave_spawn': {
          const n = data.value?.count ?? 3;
          const base = Math.random() * 360;
          const ecmFreqs = data.value?.ecmFreqs || Array.from({ length: n }, () => Math.floor(Math.random() * 1000));
          setEnemies(prev => [
            ...prev,
            ...Array.from({ length: n }).map((_, i) => ({
              id: `enemy-${Date.now()}-${i}`,
              x: wrapDeg(base + i * (360 / n)),
              y: 60 + Math.random() * 30,
              heading: wrapDeg(base + i * (360 / n) + 180),
              speed: 30 + Math.random() * 40,
              size: 1 + Math.random() * 2,
              hp: 100,
              shields: 60,
              ecmFreq: ecmFreqs[i] || Math.floor(Math.random() * 1000),
              alive: true,
              wreck: false,
              salvageProgress: 0
            }))
          ]);
          break;
        }
        case 'boss_spawn': {
          setEnemies(prev => [
            ...prev,
            {
              id: data.value?.id || `boss-${Date.now()}`,
              x: Math.random() * 360,
              y: 40 + Math.random() * 20,
              heading: Math.random() * 360,
              speed: 25,
              size: 3.5,
              hp: 450,
              shields: 250,
              ecmFreq: data.value?.ecmFreq || Math.floor(Math.random() * 1000),
              alive: true,
              wreck: false,
              salvageProgress: 0
            }
          ]);
          break;
        }
        case 'ecm_burst': {
          // ECM knocks down lock fill and adds a small screen effect
          setLockFill(v => Math.max(0, v - 0.35));
          setEcmKnock(1);
          break;
        }
        case 'clear_all_enemies': {
          // Clear all enemies from the radar
          console.log('🧹 Weapons Station: Clearing all enemies from radar');
          setEnemies([]);
          setSelectedEnemyId(null);
          setLockFill(0);
          setLocked(false);
          break;
        }
        case 'region_update': {
          // Update current region when GM changes galaxy region
          console.log('🌌 Weapons Station: Updating galaxy region to:', data.value);
          setCurrentRegion(data.value);
          // Also update the ship store with the new region
          if (typeof data.value === 'string') {
            shipStore.setCurrentRegion(data.value as any);
          }
          break;
        }
      }
    };

    const onStateUpdate = (payload: { station: string; state: any }) => {
      // Navigation station sends heading/turn deltas; we’ll simulate drift from their turn rate
      if (payload.station === 'navigation') {
        // If you track a real turn rate, map it here; for now accept payload.state.turnRate or synthesize from heading delta
        const tr = typeof payload.state?.turnRate === 'number'
          ? payload.state.turnRate
          : (Math.random() - 0.5) * 2; // fallback noise
        setPilotTurnRate(tr); // -1..1-ish
      }
    };

    socket.on('gm_broadcast', onGMBroadcast);
    socket.on('state_update', onStateUpdate);

    return () => {
      socket.off('gm_broadcast', onGMBroadcast);
      socket.off('state_update', onStateUpdate);
    };
  }, [socket]);

  /** ----- Selected enemy memo ----- */
  const selectedEnemy = useMemo(
    () => enemies.find(e => e.id === selectedEnemyId) ?? null,
    [enemies, selectedEnemyId]
  );

  /** ----- Core update/draw loop ----- */
  useEffect(() => {
    let last = performance.now();
    let raf = 0;

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000); // cap dt
      last = now;

      // Handle jams
      if (jamTimer > 0) setJamTimer(v => Math.max(0, v - dt));
      // ECM knock visual decay
      if (ecmKnock > 0) setEcmKnock(v => Math.max(0, v - dt * 1.8));

      // Cooling (when not jammed/overheated)
      if (!overheated && jamTimer <= 0) {
        setHeat(h => Math.max(0, h - 12 * dt));
      }

      // Track stabilization: error tends to pilot turn rate if player doesn’t correct
      setTrackError(err => {
        const target = pilotTurnRate;        // what the drift wants to be
        const corrected = target - playerCorrection * 0.9; // your correction counters it
        return lerp(err, corrected, 0.15);  // smooth response
      });

      // Move enemies (smooth pathfinding)
      setEnemies(prev => prev.map(e => {
        if (!e.alive && !e.wreck) return { ...e }; // dead (about to be wreck)
        if (e.wreck) return e; // wreck stays

        // Add waypoint system if not exists
        if (!e.waypoint) {
          e.waypoint = {
            x: Math.random() * 360,
            y: 20 + Math.random() * 70,
            reachTime: performance.now() + (3000 + Math.random() * 4000) // 3-7 seconds
          };
        }

        const now = performance.now();
        const step = e.speed * dt;

        // Check if we need a new waypoint
        if (now >= e.waypoint.reachTime ||
          (Math.abs(wrapDeg(e.x - e.waypoint.x)) < 15 && Math.abs(e.y - e.waypoint.y) < 10)) {
          e.waypoint = {
            x: Math.random() * 360,
            y: 20 + Math.random() * 70,
            reachTime: now + (3000 + Math.random() * 4000)
          };
        }

        // Calculate desired heading toward waypoint
        const dx = wrapDeg(e.waypoint.x - e.x);
        const dy = e.waypoint.y - e.y;
        const targetHeading = wrapDeg(Math.atan2(dx, -dy) * 180 / Math.PI);

        // Smooth heading interpolation (max 45 deg/sec turn rate)
        let headingDiff = wrapDeg(targetHeading - e.heading);
        if (headingDiff > 180) headingDiff -= 360;
        if (headingDiff < -180) headingDiff += 360;

        const maxTurn = 45 * dt; // degrees per frame
        const turnAmount = Math.sign(headingDiff) * Math.min(Math.abs(headingDiff), maxTurn);
        const newHeading = wrapDeg(e.heading + turnAmount);

        // Move forward in current heading
        const rad = toRad(newHeading);
        const moveX = Math.sin(rad) * step * 0.25;
        const moveY = -Math.cos(rad) * step * 0.15;

        const nx = wrapDeg(e.x + moveX);
        const ny = clamp(e.y + moveY, 15, 90);

        return { ...e, x: nx, y: ny, heading: newHeading, waypoint: e.waypoint };
      }));

      // Draw
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d')!;
        drawRadar(ctx);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pilotTurnRate, playerCorrection, overheated, jamTimer, ecmKnock, selectedEnemyId, enemies, heat]);

  /** ----- Drawing ----- */
  const drawRadar = (ctx: CanvasRenderingContext2D) => {
    const w = R_WIDTH, h = R_HEIGHT;
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#02050a';
    ctx.fillRect(0, 0, w, h);

    // ECM vignette
    if (ecmKnock > 0) {
      ctx.fillStyle = `rgba(255,0,0,${0.1 * ecmKnock})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Radar rings
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    for (let r = RADAR_RADIUS; r >= 50; r -= 60) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Crosshairs
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - RADAR_RADIUS, cy); ctx.lineTo(cx + RADAR_RADIUS, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - RADAR_RADIUS); ctx.lineTo(cx, cy + RADAR_RADIUS); ctx.stroke();

    // Player ship at center
    ctx.fillStyle = '#00ffff';
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();

    // Enemies
    enemies.forEach(enemy => {
      const angleRad = toRad(enemy.x);
      const distance = (enemy.y / 100) * RADAR_RADIUS;
      const ex = cx + Math.cos(angleRad) * distance;
      const ey = cy + Math.sin(angleRad) * distance;

      const isSelected = selectedEnemyId === enemy.id;

      if (enemy.alive) {
        // Shield glow
        const shieldAlpha = Math.max(0.15, Math.min(0.5, enemy.shields / 200));
        ctx.fillStyle = `rgba(0,136,255,${shieldAlpha})`;
        ctx.beginPath(); ctx.arc(ex, ey, 10 + enemy.size * 2, 0, Math.PI * 2); ctx.fill();

        // Hull blip
        ctx.fillStyle = isSelected ? '#ff4d4d' : '#ff2a2a';
        ctx.beginPath(); ctx.arc(ex, ey, 4 + enemy.size, 0, Math.PI * 2); ctx.fill();
      } else if (enemy.wreck) {
        // Wreck icon
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill();
        // salvage ring
        ctx.strokeStyle = 'rgba(255,170,0,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ex, ey, 10, 0, Math.PI * 2); ctx.stroke();

        // progress
        if (enemy.salvageProgress > 0) {
          ctx.strokeStyle = '#00ff88';
          ctx.beginPath();
          ctx.arc(ex, ey, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * enemy.salvageProgress);
          ctx.stroke();
        }
      }

      // Selection box
      if (isSelected) {
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(ex - 10, ey - 10, 20, 20);
      }

      // If selected & alive, render solve ring and (if good) lead indicator
      if (isSelected && enemy.alive) {
        // Solve ring around enemy — the gunner needs to keep target inside
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(ex, ey, reticleTightness, 0, Math.PI * 2); ctx.stroke();

        // Lead indicator (ghost blip) when solveQuality is good
        if (showLead) {
          const v = headingToVec(enemy.heading, enemy.speed);
          const t = distance / projectileSpeed; // naive
          const lx = ex + v.x * t * 2.0;
          const ly = ey + v.y * t * 2.0;

          ctx.strokeStyle = '#00ff88';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(lx, ly, 8, 0, Math.PI * 2); ctx.stroke();

          // dotted line from target to lead
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(lx, ly); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    });

    // UI overlays (heat, lock, etc.)
    drawUI(ctx);
  };

  const drawUI = (ctx: CanvasRenderingContext2D) => {
    // Heat bar
    drawBar(ctx, 20, 20, 200, 12, heat / 100, '#ff4d4d', 'HEAT');

    // Track error bar (adds spread)
    const track = clamp(Math.abs(trackError) / 2, 0, 1);
    drawBar(ctx, 20, 40, 200, 12, track, '#ffaa00', 'TRACK ERROR');

    // Solve quality
    drawBar(ctx, 20, 60, 200, 12, solveQuality, '#00ff88', 'SOLVE');

    // Missile lock
    drawBar(ctx, 20, 80, 200, 12, lockFill, locked ? '#00ff88' : '#0088ff', locked ? 'LOCKED' : 'LOCK');

    // Overheat / reload cue
    if (overheated || jamTimer > 0) {
      ctx.fillStyle = '#ffea00';
      ctx.font = '12px Orbitron, monospace';
      ctx.fillText(overheated ? 'OVERHEATED — press SPACE in window!' : 'JAMMED...', 20, 110);
      if (overheated && reloadWindow) {
        // Draw a tiny timing lane
        const x = 20, y = 120, w = 200, h = 8;
        ctx.strokeStyle = '#cccccc';
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = 'rgba(0,255,136,0.4)';
        ctx.fillRect(x + w * reloadWindow.start, y, w * (reloadWindow.end - reloadWindow.start), h);
      }
    }

    // Ammo & Aim labels
    ctx.fillStyle = '#9ad0ff';
    ctx.font = '12px Orbitron, monospace';
    ctx.fillText(`AMMO: ${ammo}`, 20, R_HEIGHT - 40);
    ctx.fillText(`AIM: ${aim}`, 20, R_HEIGHT - 22);
    ctx.fillText(`MISSILES: ${missiles}`, 160, R_HEIGHT - 22);
    if (heatSinks > 0) ctx.fillText(`HEAT SINKS: ${heatSinks}`, 160, R_HEIGHT - 40);
  };

  const drawBar = (
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, p: number, color: string, label: string
  ) => {
    ctx.strokeStyle = '#3a3a3a';
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, Math.floor((w - 2) * clamp(p, 0, 1)), h - 2);
    ctx.fillStyle = '#a0a0a0';
    ctx.font = '10px Orbitron, monospace';
    ctx.fillText(label, x + w + 8, y + h - 2);
  };

  const headingToVec = (deg: number, speed: number) => {
    const r = toRad(deg);
    return { x: Math.cos(r) * speed * 0.8, y: Math.sin(r) * speed * 0.8 };
  };

  /** ----- Solve quality update (depends on how close we keep the cursor to the selected enemy) ----- */
  // We'll treat the "reticleOnTarget" as whether the mouse is close to the enemy's on-screen position.
  const mouseRef = useRef<{ x: number, y: number }>({ x: R_WIDTH / 2, y: R_HEIGHT / 2 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    const i = setInterval(() => {
      const sel = selectedEnemy;
      if (!sel || !sel.alive) {
        setSolveQuality(q => Math.max(0, q - 0.4 * 0.05));
        setShowLead(false);
        return;
      }

      const { x, y } = mouseRef.current;
      const cx = R_WIDTH / 2, cy = R_HEIGHT / 2;
      const ang = toRad(sel.x);
      const dist = (sel.y / 100) * RADAR_RADIUS;
      const ex = cx + Math.cos(ang) * dist;
      const ey = cy + Math.sin(ang) * dist;

      const d = Math.hypot(ex - x, ey - y);
      const reticleOn = d <= reticleTightness;

      setSolveQuality(q => clamp(q + (reticleOn ? 0.6 * 0.05 : -0.5 * 0.05), 0, 1));
      setShowLead(prev => (solveQuality > 0.6 ? true : prev && solveQuality > 0.5));
    }, 50);
    return () => clearInterval(i);
  }, [selectedEnemy, reticleTightness, solveQuality]);

  /** ----- Missile lock fill based on playerFreq vs enemy.ecmFreq ----- */
  useEffect(() => {
    const t = setInterval(() => {
      const sel = selectedEnemy;
      if (!sel || !sel.alive) {
        setLockFill(v => Math.max(0, v - 0.8 * 0.05));
        setLocked(false);
        return;
      }
      const diff = Math.abs(playerFreq - sel.ecmFreq);
      const delta =
        diff < 10 ? 1.0 :
          diff < 30 ? 0.55 :
            diff < 60 ? 0.2 :
              -0.6;
      setLockFill(v => clamp(v + delta * 0.05, 0, 1));
      setLocked(prev => (lockFill >= 1 ? true : (prev && lockFill > 0.85)));
    }, 50);
    return () => clearInterval(t);
  }, [playerFreq, selectedEnemy, lockFill]);

  /** ----- Fire handling ----- */
  const handleFire = () => {
    if (!selectedEnemy) return;
    const target = selectedEnemy;

    // Ammo constraints
    if (AMMO_DEF[ammo].requiresLock && !locked) return;
    if (ammo === 'SEEKER' && missiles <= 0) return;
    if (overheated || jamTimer > 0) return;

    // Heat application
    const shotHeat = AMMO_DEF[ammo].heatPerShot;
    const newHeat = heat + shotHeat;
    setHeat(newHeat);
    if (newHeat >= 100) {
      setOverheated(true);
      setReloadWindow({ start: 0.45, end: 0.62 }); // timing lane
      return;
    }

    // Compute spread from trackError & ammo
    const baseSpread = 10; // px
    const spread = baseSpread * AMMO_DEF[ammo].spreadMult + Math.abs(trackError) * 6;
    // Hit chance: better with good solve & lower spread; seeker ignores most spread
    const solveBoost = 0.35 + solveQuality * 0.65; // 0.35..1.0
    const seekerIgnore = ammo === 'SEEKER' ? 0.6 : 0.0;
    const effectiveSpread = spread * (1 - seekerIgnore);
    const hitChance = clamp(solveBoost * (1.0 - effectiveSpread / 120), 0.05, 0.95);

    const roll = Math.random();
    const hit = roll < hitChance;

    // Damage calc
    let damage = AMMO_DEF[ammo].baseDamage;
    damage *= SUBSYS_DEF[aim].dmgMult;
    let shieldDamage = 0, hullDamage = 0;
    if (hit) {
      shieldDamage = damage * AMMO_DEF[ammo].shieldMult;
      // overflow to hull
      let remainingShield = Math.max(0, target.shields - shieldDamage);
      const shieldActuallyDealt = target.shields - remainingShield;
      const leftover = damage - shieldActuallyDealt;
      hullDamage = Math.max(0, leftover * AMMO_DEF[ammo].hullMult);

      // Piercing subsystem crit
      if (AMMO_DEF[ammo].critSubsystem && Math.random() < 0.2) {
        hullDamage *= 1.5;
      }
    }

    // Apply damage to selected enemy
    setEnemies(prev => prev.map(e => {
      if (e.id !== target.id) return e;
      if (!hit) return e;

      let newShields = Math.max(0, e.shields - shieldDamage);
      let newHp = e.hp;
      if (newShields <= 0) {
        newHp = Math.max(0, e.hp - hullDamage);
      }

      const killed = newHp <= 0 && e.alive;

      // Subsystem debuffs (simple visual; hook into your AI if you want)
      let speed = e.speed, heading = e.heading;
      if (aim === 'ENGINES' && hit) speed = Math.max(8, e.speed * 0.85);
      if (aim === 'WEAPONS' && hit) {/* could mark accuracy debuff */ }
      if (aim === 'COMMS' && hit) {/* could reduce ecmFreq noise or lock defense */ }

      return {
        ...e,
        shields: newShields,
        hp: newHp,
        speed,
        heading,
        alive: killed ? false : e.alive,
        wreck: killed ? true : e.wreck,
        salvageProgress: killed ? 0 : e.salvageProgress
      };
    }));

    // Missiles spent
    if (ammo === 'SEEKER') setMissiles(m => Math.max(0, m - 1));

    // Tell server (optional)
    socket?.emit('weapon_fired', {
      room: roomRef.current,
      targetId: target.id,
      hit,
      ammo,
      aim,
      damage: { shieldDamage, hullDamage },
      solveQuality,
      spread,
      locked
    });
  };

  /** ----- Click selection & salvage ----- */
  const handleClickCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cx = R_WIDTH / 2, cy = R_HEIGHT / 2;

    // Find nearest enemy blip within radius
    let bestId: string | null = null;
    let bestD = 9999;

    enemies.forEach(en => {
      const ang = toRad(en.x);
      const dist = (en.y / 100) * RADAR_RADIUS;
      const ex = cx + Math.cos(ang) * dist;
      const ey = cy + Math.sin(ang) * dist;
      const d = Math.hypot(ex - mx, ey - my);
      if (d < 18 && d < bestD) {
        bestD = d; bestId = en.id;
      }
    });

    if (bestId) {
      setSelectedEnemyId(bestId);
    }
  };

  const handleHoldSalvage = () => {
    if (!selectedEnemy) return;
    if (!selectedEnemy.wreck) return;

    // Hold to salvage (we simulate a 2s beam)
    const id = selectedEnemy.id;
    const start = performance.now();

    let raf = 0;
    const step = (t: number) => {
      const elapsed = (t - start) / 1000;
      const progress = clamp(elapsed / 2.0, 0, 1);
      setEnemies(prev => prev.map(e => e.id === id ? { ...e, salvageProgress: progress } : e));
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      } else {
        // reward
        const gotMissile = Math.random() < 0.5;
        const gotSink = !gotMissile;
        if (gotMissile) setMissiles(m => m + 1);
        if (gotSink) setHeatSinks(h => h + 1);
        socket?.emit('salvage_complete', { room: roomRef.current, targetId: id, reward: gotMissile ? 'missile' : 'heatsink' });
      }
    };
    raf = requestAnimationFrame(step);

    // If mouse up (we’ll use a global hold button), we’d cancel. For simplicity, we let it run in this demo.
  };

  /** ----- Heat sink use ----- */
  const useHeatSink = () => {
    if (heatSinks <= 0) return;
    setHeat(h => Math.max(0, h - 45));
    setHeatSinks(h => Math.max(0, h - 1));
  };

  /** ----- LRC HTML Mirroring State ----- */
  const [lrcHtml, setLrcHtml] = useState<string>('');
  const lrcHostRef = useRef<HTMLDivElement | null>(null);

  /** ----- Ship Store Integration for LRC Mirror ----- */
  const [ships, setShips] = useState<Ship[]>(shipStore.getShips());
  const [pinnedShips, setPinnedShips] = useState<Record<string, 'white' | 'red'>>(shipStore.getPinnedShips());
  const [doublePinnedShipId, setDoublePinnedShipId] = useState<string | null>(shipStore.getDoublePinnedShipId());
  const [currentRegion, setCurrentRegion] = useState<string>(shipStore.getCurrentRegion());

  /** ----- Subscribe to Ship Store Updates ----- */
  useEffect(() => {
    if (socket) {
      const room = new URLSearchParams(window.location.search).get('room') || 'default';
      shipStore.setSocket(socket, room);
    }
  }, [socket]);

  useEffect(() => {
    const unsubscribe = shipStore.subscribe(() => {
      setShips(shipStore.getShips());
      setPinnedShips(shipStore.getPinnedShips());
      setDoublePinnedShipId(shipStore.getDoublePinnedShipId());
      setCurrentRegion(shipStore.getCurrentRegion());
    });

    return unsubscribe;
  }, []);

  /** ----- Listen for LRC HTML updates from Communications Station ----- */
  useEffect(() => {
    if (!socket) return;

    const onUpdate = ({ html }: { html: string }) => {
      const el = lrcHostRef.current;
      if (!el) return;

      // stick-to-bottom behavior
      const atBottom = Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 4;

      setLrcHtml(html);

      // wait for DOM to paint, then maybe scroll
      requestAnimationFrame(() => {
        if (atBottom) el.scrollTop = el.scrollHeight;
      });
    };

    socket.on('lrc_update', onUpdate);

    // ask for a snapshot immediately
    socket.emit('lrc_request', { room: roomRef.current });

    return () => {
      socket.off('lrc_update', onUpdate);
    };
  }, [socket]);

  /** ----- UI ----- */
  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #111827 40%, #0b1020 100%)',
      color: '#eee', fontFamily: 'Orbitron, monospace',
      display: 'grid', gridTemplateColumns: 'auto 300px 360px', gap: '16px', padding: '18px', boxSizing: 'border-box'
    }}>
      {/* Radar Panel */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '2px solid #00ffff', borderRadius: '12px', background: 'rgba(0,20,40,0.5)',
        boxShadow: '0 0 30px rgba(0, 255, 255, 0.2)'
      }}>
        <canvas
          ref={canvasRef}
          width={R_WIDTH}
          height={R_HEIGHT}
          onClick={handleClickCanvas}
          style={{ borderRadius: '12px', cursor: 'crosshair' }}
        />
      </div>

      {/* Long Range Communications Panel (Mirrored from Communications Station) */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        border: '2px solid #00ff88', borderRadius: '12px',
        background: 'rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{
          padding: '8px 10px',
          color: '#00ff88',
          fontFamily: 'Orbitron, monospace',
          borderBottom: '1px solid #00ff88',
          textAlign: 'center',
          textShadow: '0 0 8px #00ff88'
        }}>
          LONG-RANGE COMMS (Mirror)
        </div>

        {/* Ship Information from Central Store */}
        <div style={{
          fontSize: '11px',
          height: 'calc(100vh - 120px)',
          overflowY: 'auto',
          padding: '5px 8px'
        }}>
          {/* Region Header */}
          <div style={{
            color: '#00ff88',
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: '8px',
            borderBottom: '1px solid #00ff88',
            paddingBottom: '4px'
          }}>
            {currentRegion} Sector
          </div>

          {/* Ship List */}
          {ships.length === 0 ? (
            <div style={{ color: '#666', textAlign: 'center', margin: '10px 0' }}>
              No vessels in range
            </div>
          ) : (
            <div>
              {ships.map((ship) => (
                <div
                  key={ship.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '3px 5px',
                    marginBottom: '2px',
                    backgroundColor: pinnedShips[ship.id] === 'red' ? 'rgba(255, 0, 0, 0.2)' :
                      pinnedShips[ship.id] === 'white' ? 'rgba(255, 255, 255, 0.1)' :
                        'rgba(0, 0, 0, 0.3)',
                    borderLeft: pinnedShips[ship.id] === 'red' ? '3px solid #ff0000' :
                      pinnedShips[ship.id] === 'white' ? '3px solid #ffffff' :
                        '3px solid transparent',
                    borderRadius: '2px'
                  }}
                >
                  <span style={{
                    color: ship.designation ? '#80d0ff' : '#666666',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    maxWidth: '70%',
                    fontWeight: pinnedShips[ship.id] ? 'bold' : 'normal'
                  }}>
                    {ship.designation || 'Undesignated'}
                  </span>
                  <span style={{
                    color: ship.status === 'Active' ? '#00ff00' : '#ffff00',
                    textShadow: '0 0 5px currentColor',
                    fontWeight: pinnedShips[ship.id] ? 'bold' : 'normal'
                  }}>
                    {ship.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Mirrored HTML from Communications Station */}
          {lrcHtml && (
            <div style={{
              marginTop: '10px',
              borderTop: '1px solid #333',
              paddingTop: '8px'
            }}>
              <div style={{
                color: '#888',
                fontSize: '10px',
                marginBottom: '4px',
                textAlign: 'center'
              }}>
                Communications Mirror
              </div>
              <div
                ref={lrcHostRef}
                dangerouslySetInnerHTML={{ __html: lrcHtml }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Controls Panel */}
      <div style={{
        border: '2px solid #00ff88', borderRadius: '12px', padding: '14px',
        background: 'rgba(0, 0, 0, 0.5)', overflowY: 'auto', maxHeight: '100vh'
      }}>
        <h2 style={{ margin: '0 0 8px', color: '#00ff88', textShadow: '0 0 8px #00ff88' }}>WEAPONS CONTROL</h2>

        {/* Target & status */}
        <div style={{ fontSize: 12, color: '#a0f7ff', marginBottom: 10 }}>
          Target: <b style={{ color: '#fff' }}>{selectedEnemy ? selectedEnemy.id : 'None'}</b><br />
          Status: {overheated ? <span style={{ color: '#ffea00' }}>OVERHEATED</span> : jamTimer > 0 ? <span style={{ color: '#ffaa00' }}>JAMMED</span> : <span style={{ color: '#00ff88' }}>READY</span>}
        </div>

        {/* Ammo Selector */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#9ad0ff', marginBottom: 6 }}>Ammo</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {(['KINETIC', 'ION', 'SEEKER', 'PIERCING'] as Ammo[]).map(a => (
              <button
                key={a}
                onClick={() => setAmmo(a)}
                style={{
                  padding: '6px 8px', borderRadius: 6, border: '1px solid #0af',
                  background: ammo === a ? 'linear-gradient(45deg,#00ff88,#00ffff)' : 'rgba(10,30,50,0.6)', color: ammo === a ? '#000' : '#eee',
                  fontWeight: 700, cursor: 'pointer'
                }}
              >
                {AMMO_DEF[a].name}
              </button>
            ))}
          </div>
        </div>

        {/* Aim Selector */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#9ad0ff', marginBottom: 6 }}>Subsystem Aim</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {(['ENGINES', 'WEAPONS', 'SHIELDS', 'COMMS'] as Subsystem[]).map(s => (
              <button
                key={s}
                onClick={() => setAim(s)}
                style={{
                  padding: '6px 8px', borderRadius: 6, border: '1px solid #0af',
                  background: aim === s ? 'linear-gradient(45deg,#ffd700,#ff8800)' : 'rgba(25,20,0,0.5)', color: aim === s ? '#000' : '#eee',
                  fontWeight: 700, cursor: 'pointer'
                }}
              >
                {SUBSYS_DEF[s].name}
              </button>
            ))}
          </div>
        </div>

        {/* Missile Lock Dial */}
        <div style={{ margin: '12px 0' }}>
          <div style={{ fontSize: 12, color: '#9ad0ff', marginBottom: 6 }}>Signal Match (Missile Lock)</div>
          <input
            type="range"
            min={0}
            max={1000}
            value={playerFreq}
            onChange={e => setPlayerFreq(parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#00ffff' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7aa' }}>
            <span>0</span><span>Lock: {Math.round(lockFill * 100)}%</span><span>1000</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12 }}>
            {locked ? <span style={{ color: '#00ff88', fontWeight: 700 }}>LOCKED — Seeker ready</span> : <span style={{ color: '#aaa' }}>Tune to target ECM</span>}
          </div>
        </div>

        {/* Heat Sink */}
        <div style={{ margin: '10px 0' }}>
          <button
            onClick={useHeatSink}
            disabled={heatSinks <= 0}
            style={{
              width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #0af',
              background: heatSinks > 0 ? 'rgba(0,255,136,0.2)' : 'rgba(100,100,100,0.3)',
              color: heatSinks > 0 ? '#00ff88' : '#777', fontWeight: 700, cursor: heatSinks > 0 ? 'pointer' : 'not-allowed'
            }}
          >
            Use Heat Sink ({heatSinks})
          </button>
        </div>

        {/* Fire Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          <button
            onClick={handleFire}
            style={{
              padding: '10px', borderRadius: 8, border: '1px solid #0f0',
              background: 'linear-gradient(45deg,#00ff88,#00ffff)', color: '#000', fontWeight: 900, cursor: 'pointer'
            }}
          >
            FIRE (Space)
          </button>
          <button
            onClick={handleHoldSalvage}
            disabled={!selectedEnemy || !selectedEnemy.wreck}
            style={{
              padding: '10px', borderRadius: 8, border: '1px solid #ffa500',
              background: selectedEnemy && selectedEnemy.wreck ? 'rgba(255,165,0,0.2)' : 'rgba(100,100,100,0.3)',
              color: selectedEnemy && selectedEnemy.wreck ? '#ffa500' : '#777', fontWeight: 900,
              cursor: selectedEnemy && selectedEnemy.wreck ? 'pointer' : 'not-allowed'
            }}
          >
            SALVAGE (Hold)
          </button>
        </div>

        {/* Help */}
        <div style={{ marginTop: 12, fontSize: 11, lineHeight: 1.35, color: '#a7c9ff' }}>
          <div>Tips:</div>
          <ul style={{ margin: '6px 0 0 16px' }}>
            <li>Move mouse to keep target inside the gold ring to build <b>Solve</b>.</li>
            <li>Counter drift with <b>A/D</b> or arrow keys to reduce <b>Track Error</b>.</li>
            <li>Manage <b>Heat</b>. On overheat, press <b>Space</b> in the green window to clear fast.</li>
            <li>For missiles, tune the <b>Signal Match</b> dial until it <b>locks</b>.</li>
            <li>Click a blip to select a target; shoot, then salvage the wreck.</li>
          </ul>
        </div>

        {/* Enemy list (debug quick select) */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: '#9ad0ff', marginBottom: 6 }}>Contacts</div>
          <div style={{ maxHeight: 160, overflow: 'auto', paddingRight: 6 }}>
            {enemies.length === 0 && <div style={{ color: '#777', fontSize: 12 }}>No contacts — waiting on GM</div>}
            {enemies.map(e => (
              <div key={e.id} style={{
                display: 'grid', gridTemplateColumns: 'auto 64px', gap: 6,
                alignItems: 'center', marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid #123'
              }}>
                <div style={{ fontSize: 12 }}>
                  <div style={{ color: '#eee' }}>{e.id}</div>
                  <div style={{ color: '#9ad0ff' }}>
                    {e.alive ? `HP:${e.hp} SH:${e.shields}` : e.wreck ? 'WRECK' : '—'}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEnemyId(e.id)}
                  style={{
                    padding: '6px', borderRadius: 6, border: '1px solid #0af',
                    background: selectedEnemyId === e.id ? 'linear-gradient(45deg,#00ff88,#00ffff)' : 'rgba(10,30,50,0.6)',
                    color: selectedEnemyId === e.id ? '#000' : '#eee', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  Track
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default WeaponsStation;
