import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { shipStore, Ship } from '../stores/shipStore';

type Subsystem = 'ENGINES' | 'WEAPONS' | 'SHIELDS' | 'COMMS';
type Ammo = 'KINETIC' | 'ION' | 'SEEKER' | 'PIERCING';

interface EnemyShip {
  id: string;
  x: number;
  y: number;
  heading: number;
  speed: number;
  size: number;
  hp: number;
  shields: number;
  ecmFreq: number;
  alive: boolean;
  wreck: boolean;
  salvageProgress: number;
  faction?: 'enemy' | 'ally' | 'neutral';
  waypoint?: {
    x: number;
    y: number;
    reachTime: number;
  };
}

interface WeaponsStationProps {
  socket?: Socket | null;
}

const R_WIDTH = 520;
const R_HEIGHT = 520;
const RADAR_RADIUS = 230;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const wrapDeg = (d: number) => ((d % 360) + 360) % 360;

const AMMO_DEF: Record<Ammo, {
  name: string;
  heatPerShot: number;
  baseDamage: number;
  shieldMult: number;
  hullMult: number;
  spreadMult: number;
  requiresLock?: boolean;
  critSubsystem?: boolean;
}> = {
  KINETIC: { name: 'KINETIC', heatPerShot: 18, baseDamage: 12, shieldMult: 0.7, hullMult: 1.2, spreadMult: 1.0 },
  ION: { name: 'ION', heatPerShot: 14, baseDamage: 8, shieldMult: 1.8, hullMult: 0.4, spreadMult: 1.1 },
  SEEKER: { name: 'SEEKER', heatPerShot: 25, baseDamage: 20, shieldMult: 1.0, hullMult: 1.0, spreadMult: 0.6, requiresLock: true },
  PIERCING: { name: 'PIERCING', heatPerShot: 22, baseDamage: 14, shieldMult: 0.9, hullMult: 1.1, spreadMult: 0.9, critSubsystem: true }
};

const SUBSYS_DEF: Record<Subsystem, { name: string; dmgMult: number; special?: string }> = {
  ENGINES: { name: 'ENGINES', dmgMult: 1.0, special: 'slow_on_hit' },
  WEAPONS: { name: 'WEAPONS', dmgMult: 1.0, special: 'accuracy_debuff' },
  SHIELDS: { name: 'SHIELDS', dmgMult: 1.15 },
  COMMS: { name: 'COMMS', dmgMult: 0.9, special: 'lock_weaken' }
};

const WeaponsStation: React.FC<WeaponsStationProps> = ({ socket: socketProp }) => {
  const [socket, setSocket] = useState<Socket | null>(socketProp ?? null);
  const roomRef = useRef<string>('default');

  useEffect(() => {
    if (socketProp) {
      setSocket(socketProp);
      return;
    }
    const s = io({
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true
    });
    setSocket(s);

    const room = new URLSearchParams(window.location.search).get('room') || 'default';
    roomRef.current = room;

    s.on('connect', () => {
      s.emit('join', { room: roomRef.current, station: 'weapons', name: 'Weapons Officer' });
    });

    return () => { s.disconnect(); };
  }, [socketProp]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [enemies, setEnemies] = useState<EnemyShip[]>([]);
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);

  const [solveQuality, setSolveQuality] = useState(0);
  const [reticleTightness, setReticleTightness] = useState(16);
  const [showLead, setShowLead] = useState(false);

  const [trackError, setTrackError] = useState(0);
  const [pilotTurnRate, setPilotTurnRate] = useState(0);
  const [playerCorrection, setPlayerCorrection] = useState(0);

  const [heat, setHeat] = useState(0);
  const [overheated, setOverheated] = useState(false);
  const [reloadWindow, setReloadWindow] = useState<{ start: number; end: number } | null>(null);
  const [jamTimer, setJamTimer] = useState<number>(0);
  const [reloadProgress, setReloadProgress] = useState<number>(0);

  const [playerFreq, setPlayerFreq] = useState(500);
  const [lockFill, setLockFill] = useState(0);
  const [locked, setLocked] = useState(false);
  const [ecmKnock, setEcmKnock] = useState(0);

  const [ammo, setAmmo] = useState<Ammo>('KINETIC');
  const [aim, setAim] = useState<Subsystem>('ENGINES');
  const [projectileSpeed] = useState(220);

  const [missiles, setMissiles] = useState(4);
  const [heatSinks, setHeatSinks] = useState(0);

  const [lrcHtml, setLrcHtml] = useState<string>('');

  const [ships, setShips] = useState<Ship[]>(shipStore.getShips());
  const [pinnedShips, setPinnedShips] = useState<Record<string, 'white' | 'red'>>(shipStore.getPinnedShips());
  const [doublePinnedShipId, setDoublePinnedShipId] = useState<string | null>(shipStore.getDoublePinnedShipId());
  const [currentRegion, setCurrentRegion] = useState<string>(shipStore.getCurrentRegion());

  // Dynamic weapon management state
  const [primaryWeapons, setPrimaryWeapons] = useState<string[]>([]);
  const [secondaryWeapons, setSecondaryWeapons] = useState<string[]>([]);
  const [selectedWeapon, setSelectedWeapon] = useState<string | null>(null);
  const [weaponDetails, setWeaponDetails] = useState<any>(null);
  const [hoveredShip, setHoveredShip] = useState<Ship | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedShip, setSelectedShip] = useState<Ship | null>(null);
  const [selectedShipStats, setSelectedShipStats] = useState<any>(null);

  // Star Wars ship types and their base stats (Edge of the Empire)
  const STAR_WARS_SHIPS = [
    { name: 'YT-1300 Light Freighter', silhouette: 4, speed: 3, handling: -1, defense: [1, 1], armor: 3, hullTrauma: 25, systemStrain: 13, crew: '1-2', passengers: 6, encumbrance: 165, cost: 100000 },
    { name: 'YT-2400 Light Freighter', silhouette: 4, speed: 4, handling: 0, defense: [1, 1], armor: 3, hullTrauma: 22, systemStrain: 15, crew: '1-2', passengers: 6, encumbrance: 150, cost: 130000 },
    { name: 'YT-2000 Transport', silhouette: 4, speed: 3, handling: -1, defense: [1, 1], armor: 3, hullTrauma: 20, systemStrain: 12, crew: '1-2', passengers: 8, encumbrance: 120, cost: 90000 },
    { name: 'HWK-290 Light Freighter', silhouette: 3, speed: 4, handling: 1, defense: [1, 1], armor: 3, hullTrauma: 12, systemStrain: 13, crew: '1-2', passengers: 6, encumbrance: 75, cost: 85000 },
    { name: 'VCX-100 Light Freighter', silhouette: 4, speed: 3, handling: -1, defense: [1, 2], armor: 3, hullTrauma: 25, systemStrain: 16, crew: '2-6', passengers: 8, encumbrance: 175, cost: 150000 },
    { name: 'Ghtroc 720 Light Freighter', silhouette: 4, speed: 3, handling: -2, defense: [0, 1], armor: 2, hullTrauma: 18, systemStrain: 11, crew: '1-3', passengers: 10, encumbrance: 135, cost: 65000 },
    { name: 'Baudo-class Star Yacht', silhouette: 4, speed: 4, handling: 1, defense: [1, 1], armor: 3, hullTrauma: 20, systemStrain: 14, crew: '1-2', passengers: 6, encumbrance: 80, cost: 350000 },
    { name: 'Citadel-class Cruiser', silhouette: 5, speed: 2, handling: -2, defense: [2, 1], armor: 4, hullTrauma: 45, systemStrain: 25, crew: '8-12', passengers: 100, encumbrance: 2500, cost: 750000 },
    { name: 'Gozanti-class Cruiser', silhouette: 5, speed: 2, handling: -3, defense: [1, 1], armor: 4, hullTrauma: 35, systemStrain: 20, crew: '4-12', passengers: 15, encumbrance: 1500, cost: 200000 },
    { name: 'GR-75 Medium Transport', silhouette: 5, speed: 2, handling: -3, defense: [1, 1], armor: 3, hullTrauma: 35, systemStrain: 20, crew: '6-8', passengers: 90, encumbrance: 19000, cost: 120000 },
    { name: 'Action VI Transport', silhouette: 6, speed: 1, handling: -4, defense: [1, 1], armor: 4, hullTrauma: 50, systemStrain: 25, crew: '8-15', passengers: 800, encumbrance: 50000, cost: 150000 },
    { name: 'Bulk Cruiser', silhouette: 7, speed: 1, handling: -4, defense: [1, 1], armor: 5, hullTrauma: 75, systemStrain: 35, crew: '2000-6000', passengers: 600, encumbrance: 75000, cost: 800000 },
    { name: 'Consular-class Cruiser', silhouette: 5, speed: 3, handling: -2, defense: [2, 1], armor: 5, hullTrauma: 50, systemStrain: 30, crew: '8-9', passengers: 16, encumbrance: 900, cost: 900000 },
    { name: 'Wayfarer-class Transport', silhouette: 5, speed: 2, handling: -2, defense: [1, 1], armor: 4, hullTrauma: 30, systemStrain: 18, crew: '4-6', passengers: 12, encumbrance: 220, cost: 275000 },
    { name: 'Gymsnor-3 Light Freighter', silhouette: 4, speed: 3, handling: -1, defense: [1, 1], armor: 3, hullTrauma: 22, systemStrain: 14, crew: '1-3', passengers: 8, encumbrance: 140, cost: 95000 },
    { name: 'Mobquet Medium Transport', silhouette: 4, speed: 3, handling: -2, defense: [1, 1], armor: 3, hullTrauma: 24, systemStrain: 15, crew: '2-4', passengers: 12, encumbrance: 200, cost: 110000 },
    { name: 'Corellian YV-929 Freighter', silhouette: 4, speed: 3, handling: 0, defense: [1, 1], armor: 4, hullTrauma: 28, systemStrain: 16, crew: '1-4', passengers: 10, encumbrance: 180, cost: 160000 },
    { name: 'Kuat Drive Yards Firespray', silhouette: 3, speed: 4, handling: 1, defense: [1, 1], armor: 4, hullTrauma: 15, systemStrain: 12, crew: 1, passengers: 6, encumbrance: 140, cost: 120000 },
    { name: 'Corellian Engineering YZ-775', silhouette: 4, speed: 2, handling: -2, defense: [1, 1], armor: 4, hullTrauma: 26, systemStrain: 17, crew: '2-5', passengers: 15, encumbrance: 250, cost: 140000 }
  ];

  // Generate random ship stats based on Edge of the Empire rules
  const generateShipStats = (ship: Ship) => {
    const shipHash = ship.id.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);

    // Use hash to consistently select same ship type for same ship ID
    const shipTypeIndex = Math.abs(shipHash % STAR_WARS_SHIPS.length);
    const baseShip = STAR_WARS_SHIPS[shipTypeIndex];

    // Add some random variation to stats (±10-20%)
    const variation = () => 0.8 + (Math.abs(shipHash % 40) / 100); // 0.8 to 1.2

    return {
      ...baseShip,
      // Add some variation to key stats
      hullTrauma: Math.round(baseShip.hullTrauma * variation()),
      systemStrain: Math.round(baseShip.systemStrain * variation()),
      currentHull: Math.round(baseShip.hullTrauma * variation()),
      currentStrain: Math.round(baseShip.systemStrain * variation()),
      // Random condition
      condition: Math.random() > 0.7 ? 'Damaged' : Math.random() > 0.3 ? 'Operational' : 'Pristine',
      // Random crew status
      crewStatus: Math.random() > 0.8 ? 'Skeleton Crew' : Math.random() > 0.4 ? 'Full Crew' : 'Optimal Crew'
    };
  };

  // Ship movement state for dynamic positioning
  const [shipPositions, setShipPositions] = useState<Record<string, {
    x: number; // angle in degrees
    y: number; // distance percentage
    heading: number;
    speed: number;
    movementType: number; // 0=waypoint, 1=random, 2=circular, 3=radial, 4=drift
    randomDirection: number; // Random direction for random movement
    lastDirectionChange: number; // Timestamp of last direction change
    waypoint?: { x: number; y: number; reachTime: number };
  }>>({});

  // Function to fetch and parse weapon details from CSV
  const fetchWeaponDetails = async (weaponName: string) => {
    try {
      console.log('🔍 Fetching weapon details for:', weaponName);
      const response = await fetch('./assets/weapons and attch (Ship) - Weapons.csv');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const csvText = await response.text();
      console.log('📄 CSV fetched successfully, length:', csvText.length);
      const lines = csvText.split('\n');
      console.log('📋 Total lines in CSV:', lines.length);

      // Find the weapon in the CSV
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.split(',').length < 2) continue;

        // Handle CSV parsing with proper comma handling for quoted fields
        const columns = [];
        let current = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            columns.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        columns.push(current.trim()); // Add the last column

        const weaponNameInCsv = columns[1]?.replace(/"/g, '').trim();

        // Debug: Log weapon names being compared
        if (weaponNameInCsv) {
          console.log(`🔍 Comparing "${weaponName}" with "${weaponNameInCsv}"`);
        }

        if (weaponNameInCsv === weaponName) {
          console.log('✅ Found exact match in CSV:', weaponNameInCsv);
          const details = {
            name: weaponNameInCsv,
            damage: columns[2]?.replace(/"/g, '').trim() || '—',
            crit: columns[3]?.replace(/"/g, '').trim() || '—',
            range: columns[4]?.replace(/"/g, '').trim() || '—',
            silReq: columns[5]?.replace(/"/g, '').trim() || '—',
            price: columns[6]?.replace(/"/g, '').trim() || '—',
            rarity: columns[7]?.replace(/"/g, '').trim() || '—',
            special: columns[8]?.replace(/"/g, '').trim() || 'None'
          };
          console.log('📊 Parsed weapon details:', details);
          setWeaponDetails(details);
          return;
        }
      }

      console.log('⚠️ Weapon not found in CSV, available weapons:');
      // Log all available weapons for debugging
      for (let i = 1; i < Math.min(lines.length, 20); i++) {
        const line = lines[i].trim();
        if (line && line.split(',').length >= 2) {
          const weaponNameInCsv = line.split(',')[1]?.replace(/"/g, '').trim();
          if (weaponNameInCsv) {
            console.log(`  - "${weaponNameInCsv}"`);
          }
        }
      }

      // If weapon not found in CSV, create a generic entry
      setWeaponDetails({
        name: weaponName,
        damage: '—',
        crit: '—',
        range: '—',
        silReq: '—',
        price: '—',
        rarity: '—',
        special: 'Weapon not found in database'
      });
    } catch (error) {
      console.error('❌ Error fetching weapon details:', error);
      setWeaponDetails({
        name: weaponName,
        damage: '—',
        crit: '—',
        range: '—',
        silReq: '—',
        price: '—',
        rarity: '—',
        special: 'Data Unavailable - Check console for errors'
      });
    }
  };

  // Handle weapon click
  const handleWeaponClick = (weaponName: string) => {
    setSelectedWeapon(weaponName);
    fetchWeaponDetails(weaponName);
  };

  // Helper functions for weapon-specific firing
  const getWeaponHeat = (weaponName: string): number => {
    // Map weapon names to heat values based on weapon type
    if (weaponName.toLowerCase().includes('turbolaser')) return 25;
    if (weaponName.toLowerCase().includes('laser')) return 18;
    if (weaponName.toLowerCase().includes('ion')) return 14;
    if (weaponName.toLowerCase().includes('missile') || weaponName.toLowerCase().includes('torpedo')) return 22;
    if (weaponName.toLowerCase().includes('blaster')) return 16;
    if (weaponName.toLowerCase().includes('tractor')) return 8;
    return 20; // Default heat for unknown weapons
  };

  const weaponRequiresLock = (weaponName: string): boolean => {
    // Weapons that require target lock
    return weaponName.toLowerCase().includes('missile') ||
      weaponName.toLowerCase().includes('torpedo') ||
      weaponName.toLowerCase().includes('seeker');
  };

  const weaponRequiresMissiles = (weaponName: string): boolean => {
    // Weapons that consume missile ammunition
    return weaponName.toLowerCase().includes('missile') ||
      weaponName.toLowerCase().includes('torpedo');
  };

  const getWeaponDamage = (weaponName: string): number => {
    // Map weapon names to damage values based on weapon type
    if (weaponName.toLowerCase().includes('turbolaser')) {
      if (weaponName.toLowerCase().includes('heavy')) return 22;
      if (weaponName.toLowerCase().includes('medium')) return 20;
      if (weaponName.toLowerCase().includes('light')) return 18;
      return 20;
    }
    if (weaponName.toLowerCase().includes('laser')) {
      if (weaponName.toLowerCase().includes('quad')) return 16;
      if (weaponName.toLowerCase().includes('heavy')) return 14;
      if (weaponName.toLowerCase().includes('medium')) return 12;
      if (weaponName.toLowerCase().includes('light')) return 10;
      return 12;
    }
    if (weaponName.toLowerCase().includes('ion')) {
      if (weaponName.toLowerCase().includes('heavy')) return 14;
      if (weaponName.toLowerCase().includes('medium')) return 12;
      if (weaponName.toLowerCase().includes('light')) return 10;
      return 12;
    }
    if (weaponName.toLowerCase().includes('missile') || weaponName.toLowerCase().includes('torpedo')) return 18;
    if (weaponName.toLowerCase().includes('blaster')) return 8;
    if (weaponName.toLowerCase().includes('tractor')) return 0; // No damage
    return 10; // Default damage
  };

  const getWeaponSpread = (weaponName: string): number => {
    // Map weapon names to spread/accuracy values
    if (weaponName.toLowerCase().includes('turbolaser')) return 8; // Very accurate
    if (weaponName.toLowerCase().includes('laser')) return 10; // Accurate
    if (weaponName.toLowerCase().includes('ion')) return 12; // Moderate accuracy
    if (weaponName.toLowerCase().includes('missile') || weaponName.toLowerCase().includes('torpedo')) return 6; // Very accurate
    if (weaponName.toLowerCase().includes('blaster')) return 14; // Less accurate
    if (weaponName.toLowerCase().includes('tractor')) return 20; // Not for damage
    return 12; // Default spread
  };

  const getWeaponShieldMult = (weaponName: string): number => {
    // Map weapon names to shield damage multipliers
    if (weaponName.toLowerCase().includes('ion')) return 1.8; // Very effective vs shields
    if (weaponName.toLowerCase().includes('turbolaser')) return 1.0; // Standard vs shields
    if (weaponName.toLowerCase().includes('laser')) return 1.0; // Standard vs shields
    if (weaponName.toLowerCase().includes('missile') || weaponName.toLowerCase().includes('torpedo')) return 1.2; // Good vs shields
    if (weaponName.toLowerCase().includes('blaster')) return 0.8; // Less effective vs shields
    return 1.0; // Default shield multiplier
  };

  const getWeaponHullMult = (weaponName: string): number => {
    // Map weapon names to hull damage multipliers
    if (weaponName.toLowerCase().includes('turbolaser')) return 1.3; // Very effective vs hull
    if (weaponName.toLowerCase().includes('laser')) return 1.1; // Good vs hull
    if (weaponName.toLowerCase().includes('missile') || weaponName.toLowerCase().includes('torpedo')) return 1.4; // Very effective vs hull
    if (weaponName.toLowerCase().includes('blaster')) return 1.2; // Good vs hull
    if (weaponName.toLowerCase().includes('ion')) return 0.4; // Poor vs hull
    return 1.0; // Default hull multiplier
  };

  const applyDamageToTarget = (target: EnemyShip, hit: boolean, shieldDamage: number, hullDamage: number) => {
    if (!hit) return;

    setEnemies(prev => prev.map(e => {
      if (e.id !== target.id) return e;

      let newShields = Math.max(0, e.shields - shieldDamage);
      let newHp = e.hp;
      if (newShields <= 0) {
        newHp = Math.max(0, e.hp - hullDamage);
      }

      const killed = newHp <= 0 && e.alive;

      let speed = e.speed, heading = e.heading;
      if (aim === 'ENGINES' && hit) speed = Math.max(8, e.speed * 0.85);

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
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (e.code === 'Space') {
        if (overheated && reloadWindow) {
          // Use actual reload progress instead of random
          if (reloadProgress >= reloadWindow.start && reloadProgress <= reloadWindow.end) {
            console.log('✅ Active reload SUCCESS!');
            setOverheated(false);
            setHeat(35);
            setReloadWindow(null);
            setReloadProgress(0);
            setJamTimer(0);
          } else {
            console.log('❌ Active reload FAILED!');
            setReloadWindow(null);
            setReloadProgress(0);
            setJamTimer(1.5);
          }
          return;
        }

        handleFire();
      }

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
          setLockFill(v => Math.max(0, v - 0.35));
          setEcmKnock(1);
          break;
        }
        case 'clear_all_enemies': {
          console.log('🧹 Weapons Station: Clearing all enemies from radar');
          setEnemies([]);
          setSelectedEnemyId(null);
          setLockFill(0);
          setLocked(false);
          break;
        }
        case 'region_update': {
          console.log('🌌 Weapons Station: Updating galaxy region to:', data.value);
          setCurrentRegion(data.value);
          if (typeof data.value === 'string') {
            shipStore.setCurrentRegion(data.value as any);
          }
          break;
        }
        case 'spawn_ally_ship': {
          const e = data.value as Partial<EnemyShip & { faction: string }>;
          console.log('🤝 Weapons Station: Spawning ally ship:', e.id);
          setEnemies(prev => [
            ...prev,
            {
              id: e.id || `ally-${Date.now()}`,
              x: typeof e.x === 'number' ? e.x : Math.random() * 360,
              y: typeof e.y === 'number' ? e.y : Math.random() * 100,
              heading: typeof e.heading === 'number' ? e.heading : Math.random() * 360,
              speed: typeof e.speed === 'number' ? e.speed : (Math.random() * 40 + 20),
              size: typeof e.size === 'number' ? e.size : (1 + Math.random() * 2),
              hp: e.hp || 120,
              shields: e.shields || 80,
              ecmFreq: e.ecmFreq || Math.floor(Math.random() * 1000),
              alive: true,
              wreck: false,
              salvageProgress: 0,
              faction: 'ally' as const
            }
          ]);
          break;
        }
        case 'ally_squad_spawn': {
          const n = data.value?.count ?? 4;
          const base = Math.random() * 360;
          const ecmFreqs = data.value?.ecmFreqs || Array.from({ length: n }, () => Math.floor(Math.random() * 1000));
          console.log('🤝 Weapons Station: Spawning ally squadron of', n, 'ships');
          setEnemies(prev => [
            ...prev,
            ...Array.from({ length: n }).map((_, i) => ({
              id: `ally-squad-${Date.now()}-${i}`,
              x: wrapDeg(base + i * (360 / n)),
              y: 60 + Math.random() * 30,
              heading: wrapDeg(base + i * (360 / n) + 180),
              speed: 30 + Math.random() * 40,
              size: 1 + Math.random() * 2,
              hp: 120,
              shields: 80,
              ecmFreq: ecmFreqs[i] || Math.floor(Math.random() * 1000),
              alive: true,
              wreck: false,
              salvageProgress: 0,
              faction: 'ally' as const
            }))
          ]);
          break;
        }
        case 'spawn_neutral_ship': {
          const e = data.value as Partial<EnemyShip & { faction: string }>;
          console.log('⚪ Weapons Station: Spawning neutral ship:', e.id);
          setEnemies(prev => [
            ...prev,
            {
              id: e.id || `neutral-${Date.now()}`,
              x: typeof e.x === 'number' ? e.x : Math.random() * 360,
              y: typeof e.y === 'number' ? e.y : Math.random() * 100,
              heading: typeof e.heading === 'number' ? e.heading : Math.random() * 360,
              speed: typeof e.speed === 'number' ? e.speed : (Math.random() * 30 + 15),
              size: typeof e.size === 'number' ? e.size : (1 + Math.random() * 2),
              hp: e.hp || 80,
              shields: e.shields || 40,
              ecmFreq: e.ecmFreq || Math.floor(Math.random() * 1000),
              alive: true,
              wreck: false,
              salvageProgress: 0,
              faction: 'neutral' as const
            }
          ]);
          break;
        }
        case 'neutral_convoy_spawn': {
          const n = data.value?.count ?? 3;
          const base = Math.random() * 360;
          const ecmFreqs = data.value?.ecmFreqs || Array.from({ length: n }, () => Math.floor(Math.random() * 1000));
          console.log('⚪ Weapons Station: Spawning neutral convoy of', n, 'ships');
          setEnemies(prev => [
            ...prev,
            ...Array.from({ length: n }).map((_, i) => ({
              id: `neutral-convoy-${Date.now()}-${i}`,
              x: wrapDeg(base + i * (360 / n)),
              y: 50 + Math.random() * 25,
              heading: wrapDeg(base + i * (360 / n) + 180),
              speed: 15 + Math.random() * 20,
              size: 1.5 + Math.random() * 1.5,
              hp: 100,
              shields: 50,
              ecmFreq: ecmFreqs[i] || Math.floor(Math.random() * 1000),
              alive: true,
              wreck: false,
              salvageProgress: 0,
              faction: 'neutral' as const
            }))
          ]);
          break;
        }
        case 'clear_all_allies': {
          console.log('🧹 Weapons Station: Clearing all ally ships from radar');
          setEnemies(prev => prev.filter(enemy => (enemy as any).faction !== 'ally'));
          if (selectedEnemyId && enemies.find(e => e.id === selectedEnemyId && (e as any).faction === 'ally')) {
            setSelectedEnemyId(null);
            setLockFill(0);
            setLocked(false);
          }
          break;
        }
        case 'clear_all_neutrals': {
          console.log('🧹 Weapons Station: Clearing all neutral ships from radar');
          setEnemies(prev => prev.filter(enemy => (enemy as any).faction !== 'neutral'));
          if (selectedEnemyId && enemies.find(e => e.id === selectedEnemyId && (e as any).faction === 'neutral')) {
            setSelectedEnemyId(null);
            setLockFill(0);
            setLocked(false);
          }
          break;
        }
        case 'add_primary_weapon': {
          console.log('🔫 Weapons Station: Adding primary weapon:', data.value.weapon);
          setPrimaryWeapons(prev => [...prev, data.value.weapon]);
          break;
        }
        case 'add_secondary_weapon': {
          console.log('🔫 Weapons Station: Adding secondary weapon:', data.value.weapon);
          setSecondaryWeapons(prev => [...prev, data.value.weapon]);
          break;
        }
        case 'clear_primary_weapons': {
          console.log('🧹 Weapons Station: Clearing primary weapons');
          setPrimaryWeapons([]);
          break;
        }
        case 'clear_secondary_weapons': {
          console.log('🧹 Weapons Station: Clearing secondary weapons');
          setSecondaryWeapons([]);
          break;
        }
      }
    };

    const onStateUpdate = (payload: { station: string; state: any }) => {
      if (payload.station === 'navigation') {
        const tr = typeof payload.state?.turnRate === 'number'
          ? payload.state.turnRate
          : (Math.random() - 0.5) * 2;
        setPilotTurnRate(tr);
      }
    };

    socket.on('gm_broadcast', onGMBroadcast);
    socket.on('state_update', onStateUpdate);

    return () => {
      socket.off('gm_broadcast', onGMBroadcast);
      socket.off('state_update', onStateUpdate);
    };
  }, [socket]);

  const selectedEnemy = useMemo(
    () => enemies.find(e => e.id === selectedEnemyId) ?? null,
    [enemies, selectedEnemyId]
  );

  useEffect(() => {
    let last = performance.now();
    let raf = 0;

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (jamTimer > 0) setJamTimer(v => Math.max(0, v - dt));
      if (ecmKnock > 0) setEcmKnock(v => Math.max(0, v - dt * 1.8));

      // Animate reload progress when overheated
      if (overheated && reloadWindow) {
        setReloadProgress(p => {
          const newProgress = p + dt * 0.5; // Takes 2 seconds to complete
          if (newProgress >= 1.0) {
            // Auto-fail if player doesn't press space in time
            console.log('⏰ Active reload TIMEOUT!');
            setOverheated(false);
            setReloadWindow(null);
            setReloadProgress(0);
            setJamTimer(2.0); // Longer jam for timeout
            return 0;
          }
          return newProgress;
        });
      }

      if (!overheated && jamTimer <= 0) {
        setHeat(h => Math.max(0, h - 12 * dt));
      }

      setTrackError(err => {
        const target = pilotTurnRate;
        const corrected = target - playerCorrection * 0.9;
        return lerp(err, corrected, 0.15);
      });

      // Update ship positions for dynamic movement
      setShipPositions(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(shipId => {
          const ship = updated[shipId];
          const step = ship.speed * dt;

          // Handle different movement patterns
          switch (ship.movementType) {
            case 0: // Waypoint navigation (original behavior)
              if (!ship.waypoint) {
                ship.waypoint = {
                  x: Math.random() * 360,
                  y: 30 + Math.random() * 60,
                  reachTime: now + (2000 + Math.random() * 6000)
                };
              }

              // Check if waypoint reached or time expired
              if (now >= ship.waypoint.reachTime ||
                (Math.abs(wrapDeg(ship.x - ship.waypoint.x)) < 15 && Math.abs(ship.y - ship.waypoint.y) < 10)) {
                ship.waypoint = {
                  x: Math.random() * 360,
                  y: 30 + Math.random() * 60,
                  reachTime: now + (2000 + Math.random() * 6000)
                };
              }

              // Calculate movement toward waypoint
              const dx = wrapDeg(ship.waypoint.x - ship.x);
              const dy = ship.waypoint.y - ship.y;
              const targetHeading = wrapDeg(Math.atan2(dx, -dy) * 180 / Math.PI);

              let headingDiff = wrapDeg(targetHeading - ship.heading);
              if (headingDiff > 180) headingDiff -= 360;
              if (headingDiff < -180) headingDiff += 360;

              const maxTurn = 30 * dt;
              const turnAmount = Math.sign(headingDiff) * Math.min(Math.abs(headingDiff), maxTurn);
              const newHeading = wrapDeg(ship.heading + turnAmount);

              const rad = toRad(newHeading);
              const moveX = Math.sin(rad) * step * 0.2;
              const moveY = -Math.cos(rad) * step * 0.1;

              updated[shipId] = {
                ...ship,
                x: wrapDeg(ship.x + moveX),
                y: clamp(ship.y + moveY, 25, 95),
                heading: newHeading
              };
              break;

            case 1: // Random movement - change direction randomly
              // Change direction every 1-3 seconds
              if (!ship.lastDirectionChange || now - ship.lastDirectionChange > (1000 + Math.random() * 2000)) {
                ship.randomDirection = Math.random() * 360;
                ship.lastDirectionChange = now;
              }

              const randomRad = toRad(ship.randomDirection);
              const randomMoveX = Math.sin(randomRad) * step * 0.15;
              const randomMoveY = -Math.cos(randomRad) * step * 0.08;

              updated[shipId] = {
                ...ship,
                x: wrapDeg(ship.x + randomMoveX),
                y: clamp(ship.y + randomMoveY, 25, 95),
                heading: ship.randomDirection
              };
              break;

            case 2: // Circular movement
              const circularSpeed = step * 0.3;
              updated[shipId] = {
                ...ship,
                x: wrapDeg(ship.x + circularSpeed),
                heading: wrapDeg(ship.heading + circularSpeed * 0.5)
              };
              break;

            case 3: // Radial movement (in/out from center)
              const radialDirection = Math.sin(now * 0.001) > 0 ? 1 : -1; // Oscillate in/out
              const radialMoveY = radialDirection * step * 0.1;
              updated[shipId] = {
                ...ship,
                y: clamp(ship.y + radialMoveY, 25, 95),
                heading: wrapDeg(ship.heading + step * 0.2)
              };
              break;

            case 4: // Drift movement - very slow, minimal direction changes
              if (!ship.lastDirectionChange || now - ship.lastDirectionChange > (5000 + Math.random() * 5000)) {
                ship.randomDirection = wrapDeg(ship.randomDirection + (Math.random() - 0.5) * 60);
                ship.lastDirectionChange = now;
              }

              const driftRad = toRad(ship.randomDirection);
              const driftMoveX = Math.sin(driftRad) * step * 0.05; // Very slow
              const driftMoveY = -Math.cos(driftRad) * step * 0.03;

              updated[shipId] = {
                ...ship,
                x: wrapDeg(ship.x + driftMoveX),
                y: clamp(ship.y + driftMoveY, 25, 95),
                heading: wrapDeg(ship.heading + step * 0.1)
              };
              break;

            default:
              // Fallback to waypoint movement
              break;
          }
        });
        return updated;
      });

      setEnemies(prev => prev.map(e => {
        if (!e.alive && !e.wreck) return { ...e };
        if (e.wreck) return e;

        if (!e.waypoint) {
          e.waypoint = {
            x: Math.random() * 360,
            y: 20 + Math.random() * 70,
            reachTime: performance.now() + (3000 + Math.random() * 4000)
          };
        }

        const now = performance.now();
        const step = e.speed * dt;

        if (now >= e.waypoint.reachTime ||
          (Math.abs(wrapDeg(e.x - e.waypoint.x)) < 15 && Math.abs(e.y - e.waypoint.y) < 10)) {
          e.waypoint = {
            x: Math.random() * 360,
            y: 20 + Math.random() * 70,
            reachTime: now + (3000 + Math.random() * 4000)
          };
        }

        const dx = wrapDeg(e.waypoint.x - e.x);
        const dy = e.waypoint.y - e.y;
        const targetHeading = wrapDeg(Math.atan2(dx, -dy) * 180 / Math.PI);

        let headingDiff = wrapDeg(targetHeading - e.heading);
        if (headingDiff > 180) headingDiff -= 360;
        if (headingDiff < -180) headingDiff += 360;

        const maxTurn = 45 * dt;
        const turnAmount = Math.sign(headingDiff) * Math.min(Math.abs(headingDiff), maxTurn);
        const newHeading = wrapDeg(e.heading + turnAmount);

        const rad = toRad(newHeading);
        const moveX = Math.sin(rad) * step * 0.25;
        const moveY = -Math.cos(rad) * step * 0.15;

        const nx = wrapDeg(e.x + moveX);
        const ny = clamp(e.y + moveY, 15, 90);

        return { ...e, x: nx, y: ny, heading: newHeading, waypoint: e.waypoint };
      }));

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

  const drawRadar = (ctx: CanvasRenderingContext2D) => {
    const w = R_WIDTH, h = R_HEIGHT;
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#02050a';
    ctx.fillRect(0, 0, w, h);

    if (ecmKnock > 0) {
      ctx.fillStyle = `rgba(255,0,0,${0.1 * ecmKnock})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    for (let r = RADAR_RADIUS; r >= 50; r -= 60) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - RADAR_RADIUS, cy); ctx.lineTo(cx + RADAR_RADIUS, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - RADAR_RADIUS); ctx.lineTo(cx, cy + RADAR_RADIUS); ctx.stroke();

    ctx.fillStyle = '#00ffff';
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();

    // Draw yellow dots for ships from long range comms
    ships.forEach(ship => {
      const shipPos = shipPositions[ship.id];
      if (!shipPos) return; // Skip if position not initialized yet

      // Use dynamic position from shipPositions
      const angleRad = toRad(shipPos.x);
      const radarDistance = (shipPos.y / 100) * RADAR_RADIUS;
      const sx = cx + Math.cos(angleRad) * radarDistance;
      const sy = cy + Math.sin(angleRad) * radarDistance;

      // Draw yellow dot for ship
      ctx.fillStyle = pinnedShips[ship.id] === 'red' ? '#ff4444' :
        pinnedShips[ship.id] === 'white' ? '#ffffff' : '#ffd700';
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();

      // Add subtle glow for pinned ships
      if (pinnedShips[ship.id]) {
        ctx.shadowColor = pinnedShips[ship.id] === 'red' ? '#ff4444' : '#ffffff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    enemies.forEach(enemy => {
      const angleRad = toRad(enemy.x);
      const distance = (enemy.y / 100) * RADAR_RADIUS;
      const ex = cx + Math.cos(angleRad) * distance;
      const ey = cy + Math.sin(angleRad) * distance;

      const isSelected = selectedEnemyId === enemy.id;

      if (enemy.alive) {
        const shieldAlpha = Math.max(0.15, Math.min(0.5, enemy.shields / 200));
        let shieldColor = 'rgba(0,136,255,';
        if (enemy.faction === 'ally') {
          shieldColor = 'rgba(0,255,136,';
        } else if (enemy.faction === 'neutral') {
          shieldColor = 'rgba(255,215,0,';
        }
        ctx.fillStyle = `${shieldColor}${shieldAlpha})`;
        ctx.beginPath(); ctx.arc(ex, ey, 10 + enemy.size * 2, 0, Math.PI * 2); ctx.fill();

        let hullColor = '#ff2a2a';
        if (enemy.faction === 'ally') {
          hullColor = '#00ff88';
        } else if (enemy.faction === 'neutral') {
          hullColor = '#ffd700';
        }
        ctx.fillStyle = isSelected ? '#ffffff' : hullColor;
        ctx.beginPath(); ctx.arc(ex, ey, 4 + enemy.size, 0, Math.PI * 2); ctx.fill();
      } else if (enemy.wreck) {
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,170,0,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ex, ey, 10, 0, Math.PI * 2); ctx.stroke();

        if (enemy.salvageProgress > 0) {
          ctx.strokeStyle = '#00ff88';
          ctx.beginPath();
          ctx.arc(ex, ey, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * enemy.salvageProgress);
          ctx.stroke();
        }
      }

      if (isSelected) {
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(ex - 10, ey - 10, 20, 20);
      }

      if (isSelected && enemy.alive) {
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(ex, ey, reticleTightness, 0, Math.PI * 2); ctx.stroke();

        if (showLead) {
          const v = headingToVec(enemy.heading, enemy.speed);
          const t = distance / projectileSpeed;
          const lx = ex + v.x * t * 2.0;
          const ly = ey + v.y * t * 2.0;

          ctx.strokeStyle = '#00ff88';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(lx, ly, 8, 0, Math.PI * 2); ctx.stroke();

          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(lx, ly); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    });

    drawUI(ctx);
  };

  const drawUI = (ctx: CanvasRenderingContext2D) => {
    drawBar(ctx, 20, 20, 200, 12, heat / 100, '#ff4d4d', 'HEAT');
    const track = clamp(Math.abs(trackError) / 2, 0, 1);
    drawBar(ctx, 20, 40, 200, 12, track, '#ffaa00', 'TRACK ERROR');
    drawBar(ctx, 20, 60, 200, 12, solveQuality, '#00ff88', 'SOLVE');
    drawBar(ctx, 20, 80, 200, 12, lockFill, locked ? '#00ff88' : '#0088ff', locked ? 'LOCKED' : 'LOCK');

    if (overheated || jamTimer > 0) {
      ctx.fillStyle = '#ffea00';
      ctx.font = '12px Orbitron, monospace';
      ctx.fillText(overheated ? 'OVERHEATED — press SPACE in window!' : 'JAMMED...', 20, 110);
      if (overheated && reloadWindow) {
        const x = 20, y = 120, w = 200, h = 12;

        // Draw background bar
        ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#cccccc';
        ctx.strokeRect(x, y, w, h);

        // Draw green success window
        ctx.fillStyle = 'rgba(0,255,136,0.6)';
        ctx.fillRect(x + w * reloadWindow.start, y, w * (reloadWindow.end - reloadWindow.start), h);

        // Draw moving progress indicator
        ctx.fillStyle = '#ffffff';
        const indicatorX = x + w * reloadProgress;
        ctx.fillRect(indicatorX - 2, y - 2, 4, h + 4);

        // Draw progress text
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Orbitron, monospace';
        ctx.fillText(`${Math.round(reloadProgress * 100)}%`, x + w + 10, y + h - 2);
      }
    }

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

  const mouseRef = useRef<{ x: number, y: number }>({ x: R_WIDTH / 2, y: R_HEIGHT / 2 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      mouseRef.current = { x: mouseX, y: mouseY };
      setMousePosition({ x: e.clientX, y: e.clientY }); // Global mouse position for tooltip

      // Check if mouse is over any ship dot
      const cx = R_WIDTH / 2, cy = R_HEIGHT / 2;
      let foundShip: Ship | null = null;

      ships.forEach(ship => {
        const shipPos = shipPositions[ship.id];
        if (!shipPos) return; // Skip if position not initialized yet

        // Use dynamic position from shipPositions
        const angleRad = toRad(shipPos.x);
        const radarDistance = (shipPos.y / 100) * RADAR_RADIUS;
        const sx = cx + Math.cos(angleRad) * radarDistance;
        const sy = cy + Math.sin(angleRad) * radarDistance;

        // Check if mouse is within ship dot radius
        const distanceToShip = Math.hypot(mouseX - sx, mouseY - sy);
        if (distanceToShip <= 8) { // 8px hover radius
          foundShip = ship;
        }
      });

      setHoveredShip(foundShip);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [ships, pinnedShips]);

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

  const handleFire = () => {
    if (!selectedEnemy) return;
    const target = selectedEnemy;

    // Check if a specific weapon is selected
    if (selectedWeapon) {
      console.log('🔫 Firing selected weapon:', selectedWeapon);

      // Weapon-specific firing logic
      const weaponHeat = getWeaponHeat(selectedWeapon);
      const requiresLock = weaponRequiresLock(selectedWeapon);
      const requiresMissiles = weaponRequiresMissiles(selectedWeapon);

      // Check weapon-specific requirements
      if (requiresLock && !locked) {
        console.log('❌ Weapon requires lock but not locked');
        return;
      }
      if (requiresMissiles && missiles <= 0) {
        console.log('❌ Weapon requires missiles but none available');
        return;
      }
      if (overheated || jamTimer > 0) {
        console.log('❌ Weapon system overheated or jammed');
        return;
      }

      const newHeat = heat + weaponHeat;
      setHeat(newHeat);
      if (newHeat >= 100) {
        setOverheated(true);
        setReloadWindow({ start: 0.45, end: 0.62 });
        return;
      }

      // Consume missiles if needed
      if (requiresMissiles) {
        setMissiles(m => Math.max(0, m - 1));
      }

      // Calculate weapon-specific damage
      const weaponDamage = getWeaponDamage(selectedWeapon);
      const weaponSpread = getWeaponSpread(selectedWeapon);

      // Use weapon-specific values for damage calculation
      const baseSpread = weaponSpread;
      const spread = baseSpread + Math.abs(trackError) * 6;
      const solveBoost = 0.35 + solveQuality * 0.65;
      const effectiveSpread = spread;
      const hitChance = clamp(solveBoost * (1.0 - effectiveSpread / 120), 0.05, 0.95);

      const roll = Math.random();
      const hit = roll < hitChance;

      let damage = weaponDamage;
      damage *= SUBSYS_DEF[aim].dmgMult;
      let shieldDamage = 0, hullDamage = 0;
      if (hit) {
        const weaponShieldMult = getWeaponShieldMult(selectedWeapon);
        const weaponHullMult = getWeaponHullMult(selectedWeapon);

        shieldDamage = damage * weaponShieldMult;
        let remainingShield = Math.max(0, target.shields - shieldDamage);
        const shieldActuallyDealt = target.shields - remainingShield;
        const leftover = damage - shieldActuallyDealt;
        hullDamage = Math.max(0, leftover * weaponHullMult);
      }

      // Apply damage and emit weapon fired event
      applyDamageToTarget(target, hit, shieldDamage, hullDamage);

      socket?.emit('weapon_fired', {
        room: roomRef.current,
        targetId: target.id,
        hit,
        weapon: selectedWeapon,
        aim,
        damage: { shieldDamage, hullDamage },
        solveQuality,
        spread,
        locked
      });

      return; // Exit early for weapon-specific firing
    } else {
      // Fallback to generic ammo system if no weapon selected
      if (AMMO_DEF[ammo].requiresLock && !locked) return;
      if (ammo === 'SEEKER' && missiles <= 0) return;
      if (overheated || jamTimer > 0) return;

      const shotHeat = AMMO_DEF[ammo].heatPerShot;
      const newHeat = heat + shotHeat;
      setHeat(newHeat);
      if (newHeat >= 100) {
        setOverheated(true);
        setReloadWindow({ start: 0.45, end: 0.62 });
        return;
      }

      if (ammo === 'SEEKER') setMissiles(m => Math.max(0, m - 1));
    }

    const baseSpread = 10;
    const spread = baseSpread * AMMO_DEF[ammo].spreadMult + Math.abs(trackError) * 6;
    const solveBoost = 0.35 + solveQuality * 0.65;
    const seekerIgnore = ammo === 'SEEKER' ? 0.6 : 0.0;
    const effectiveSpread = spread * (1 - seekerIgnore);
    const hitChance = clamp(solveBoost * (1.0 - effectiveSpread / 120), 0.05, 0.95);

    const roll = Math.random();
    const hit = roll < hitChance;

    let damage = AMMO_DEF[ammo].baseDamage;
    damage *= SUBSYS_DEF[aim].dmgMult;
    let shieldDamage = 0, hullDamage = 0;
    if (hit) {
      shieldDamage = damage * AMMO_DEF[ammo].shieldMult;
      let remainingShield = Math.max(0, target.shields - shieldDamage);
      const shieldActuallyDealt = target.shields - remainingShield;
      const leftover = damage - shieldActuallyDealt;
      hullDamage = Math.max(0, leftover * AMMO_DEF[ammo].hullMult);

      if (AMMO_DEF[ammo].critSubsystem && Math.random() < 0.2) {
        hullDamage *= 1.5;
      }
    }

    setEnemies(prev => prev.map(e => {
      if (e.id !== target.id) return e;
      if (!hit) return e;

      let newShields = Math.max(0, e.shields - shieldDamage);
      let newHp = e.hp;
      if (newShields <= 0) {
        newHp = Math.max(0, e.hp - hullDamage);
      }

      const killed = newHp <= 0 && e.alive;

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

    if (ammo === 'SEEKER') setMissiles(m => Math.max(0, m - 1));

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

  const handleClickCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cx = R_WIDTH / 2, cy = R_HEIGHT / 2;

    // First check for yellow ship dots
    let clickedShip: Ship | null = null;
    let bestShipD = 9999;

    ships.forEach(ship => {
      const shipPos = shipPositions[ship.id];
      if (!shipPos) return;

      const angleRad = toRad(shipPos.x);
      const radarDistance = (shipPos.y / 100) * RADAR_RADIUS;
      const sx = cx + Math.cos(angleRad) * radarDistance;
      const sy = cy + Math.sin(angleRad) * radarDistance;

      const d = Math.hypot(sx - mx, sy - my);
      if (d < 12 && d < bestShipD) { // 12px click radius for ships
        bestShipD = d;
        clickedShip = ship;
      }
    });

    if (clickedShip) {
      setSelectedShip(clickedShip);
      setSelectedShipStats(generateShipStats(clickedShip));
      return; // Don't check for enemy ships if we clicked a yellow dot
    }

    // Then check for enemy ships
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
      // Clear ship selection when selecting enemy
      setSelectedShip(null);
      setSelectedShipStats(null);
    }
  };

  const handleHoldSalvage = () => {
    if (!selectedEnemy) return;
    if (!selectedEnemy.wreck) return;

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
        const gotMissile = Math.random() < 0.5;
        const gotSink = !gotMissile;
        if (gotMissile) setMissiles(m => m + 1);
        if (gotSink) setHeatSinks(h => h + 1);
        socket?.emit('salvage_complete', { room: roomRef.current, targetId: id, reward: gotMissile ? 'missile' : 'heatsink' });
      }
    };
    raf = requestAnimationFrame(step);
  };

  const useHeatSink = () => {
    if (heatSinks <= 0) return;
    setHeat(h => Math.max(0, h - 45));
    setHeatSinks(h => Math.max(0, h - 1));
  };

  const lrcHostRef = useRef<HTMLDivElement | null>(null);

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

    return () => {
      unsubscribe();
    };
  }, []);

  // Initialize ship positions when ships change
  useEffect(() => {
    setShipPositions(prev => {
      const newPositions = { ...prev };

      ships.forEach(ship => {
        if (!newPositions[ship.id]) {
          // Initialize new ship with random position and movement
          const shipHash = ship.id.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
          }, 0);

          // Determine movement pattern based on ship hash
          const movementType = Math.abs(shipHash % 5); // 5 different movement patterns

          // Create more varied distance distribution - many ships further out
          let distance;
          const distanceRoll = Math.abs(shipHash % 100);
          if (distanceRoll < 20) {
            // 20% close range (30-50%)
            distance = 30 + Math.abs(shipHash % 20);
          } else if (distanceRoll < 40) {
            // 20% medium range (50-70%)
            distance = 50 + Math.abs(shipHash % 20);
          } else {
            // 60% long range (70-95%)
            distance = 70 + Math.abs(shipHash % 25);
          }

          newPositions[ship.id] = {
            x: Math.abs(shipHash % 360), // Starting angle
            y: distance, // Distance from center with wider distribution
            heading: Math.abs(shipHash % 360), // Initial heading
            speed: 15 + Math.abs(shipHash % 25), // Speed 15-40
            movementType, // 0=waypoint, 1=random, 2=circular, 3=radial, 4=drift
            randomDirection: Math.random() * 360, // Random direction for random movement
            lastDirectionChange: performance.now(),
            waypoint: {
              x: Math.random() * 360,
              y: Math.max(25, Math.min(95, distance + (Math.random() - 0.5) * 30)), // Waypoint near current distance
              reachTime: performance.now() + (2000 + Math.random() * 6000)
            }
          };
        }
      });

      // Remove positions for ships that no longer exist
      Object.keys(newPositions).forEach(shipId => {
        if (!ships.find(ship => ship.id === shipId)) {
          delete newPositions[shipId];
        }
      });

      return newPositions;
    });
  }, [ships]);

  useEffect(() => {
    if (!socket) return;

    const onUpdate = ({ html }: { html: string }) => {
      const el = lrcHostRef.current;
      if (!el) return;

      const atBottom = Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 4;

      setLrcHtml(html);

      requestAnimationFrame(() => {
        if (atBottom) el.scrollTop = el.scrollHeight;
      });
    };

    socket.on('lrc_update', onUpdate);
    socket.emit('lrc_request', { room: roomRef.current });

    return () => {
      socket.off('lrc_update', onUpdate);
    };
  }, [socket]);

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #111827 40%, #0b1020 100%)',
      color: '#eee', fontFamily: 'Orbitron, monospace',
      display: 'grid', gridTemplateColumns: 'auto 300px 360px', gap: '16px', padding: '18px', boxSizing: 'border-box'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '2px solid #00ffff', borderRadius: '12px', background: 'rgba(0,20,40,0.5)',
        boxShadow: '0 0 30px rgba(0, 255, 255, 0.2)',
        position: 'relative'
      }}>
        {/* Primary Weapon Systems Container */}
        <div style={{
          position: 'absolute',
          left: '20px',
          top: '20px',
          width: '140px',
          height: '270px',
          border: '2px solid #ff6b00',
          borderRadius: '8px',
          background: 'rgba(255, 107, 0, 0.1)',
          padding: '10px',
          boxShadow: '0 0 15px rgba(255, 107, 0, 0.3)'
        }}>
          <div style={{
            color: '#ff6b00',
            fontSize: '12px',
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: '8px',
            textShadow: '0 0 5px #ff6b00'
          }}>
            PRIMARY WEAPONS
          </div>

          {/* Dynamic Primary Weapons */}
          {primaryWeapons.length === 0 ? (
            <div style={{
              color: '#666',
              fontSize: '10px',
              textAlign: 'center',
              marginTop: '20px'
            }}>
              No Primary Weapons Assigned
            </div>
          ) : (
            primaryWeapons.map((weapon, index) => (
              <div
                key={index}
                onClick={() => handleWeaponClick(weapon)}
                style={{
                  background: selectedWeapon === weapon ? 'rgba(255, 107, 0, 0.4)' : 'rgba(255, 107, 0, 0.2)',
                  border: selectedWeapon === weapon ? '2px solid #ff6b00' : '1px solid #ff6b00',
                  borderRadius: '4px',
                  padding: '8px',
                  marginBottom: '6px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{
                  color: '#ff6b00',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  lineHeight: '1.2'
                }}>
                  {weapon}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Secondary Weapon Systems Container */}
        <div style={{
          position: 'absolute',
          left: '184px',
          top: '20px',
          width: '140px',
          height: '270px',
          border: '2px solid #00ff88',
          borderRadius: '8px',
          background: 'rgba(0, 255, 136, 0.1)',
          padding: '10px',
          boxShadow: '0 0 15px rgba(0, 255, 136, 0.3)'
        }}>
          <div style={{
            color: '#00ff88',
            fontSize: '12px',
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: '8px',
            textShadow: '0 0 5px #00ff88'
          }}>
            SECONDARY WEAPONS
          </div>

          {/* Dynamic Secondary Weapons */}
          {secondaryWeapons.length === 0 ? (
            <div style={{
              color: '#666',
              fontSize: '10px',
              textAlign: 'center',
              marginTop: '20px'
            }}>
              No Secondary Weapons Assigned
            </div>
          ) : (
            secondaryWeapons.map((weapon, index) => (
              <div
                key={index}
                onClick={() => handleWeaponClick(weapon)}
                style={{
                  background: selectedWeapon === weapon ? 'rgba(0, 255, 136, 0.4)' : 'rgba(0, 255, 136, 0.2)',
                  border: selectedWeapon === weapon ? '2px solid #00ff88' : '1px solid #00ff88',
                  borderRadius: '4px',
                  padding: '8px',
                  marginBottom: '6px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{
                  color: '#00ff88',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  lineHeight: '1.2'
                }}>
                  {weapon}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Ship Information Panel */}
        {selectedShipStats && (
          <div style={{
            position: 'absolute',
            left: '20px',
            bottom: '160px', // Above weapon details panel
            width: '304px', // Spans both weapon containers
            height: '130px',
            border: '2px solid #ffd700',
            borderRadius: '8px',
            background: 'rgba(255, 215, 0, 0.1)',
            padding: '10px',
            boxShadow: '0 0 15px rgba(255, 215, 0, 0.3)'
          }}>
            <div style={{
              color: '#ffd700',
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'center',
              marginBottom: '8px',
              textShadow: '0 0 5px #ffd700'
            }}>
              CIVILIAN VESSEL ANALYSIS
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              fontSize: '9px'
            }}>
              <div>
                <div style={{ color: '#ffd700', fontWeight: 'bold', marginBottom: '2px' }}>
                  {selectedShipStats.name}
                </div>
                <div style={{ color: '#ffeb99' }}>
                  <div>Silhouette: {selectedShipStats.silhouette}</div>
                  <div>Speed: {selectedShipStats.speed} | Handling: {selectedShipStats.handling}</div>
                  <div>Defense: {selectedShipStats.defense[0]}/{selectedShipStats.defense[1]} | Armor: {selectedShipStats.armor}</div>
                  <div>Hull: {selectedShipStats.currentHull}/{selectedShipStats.hullTrauma}</div>
                </div>
              </div>
              <div>
                <div style={{ color: '#ffeb99' }}>
                  <div>Strain: {selectedShipStats.currentStrain}/{selectedShipStats.systemStrain}</div>
                  <div>Crew: {selectedShipStats.crew}</div>
                  <div>Passengers: {selectedShipStats.passengers}</div>
                  <div>Encumbrance: {selectedShipStats.encumbrance}</div>
                </div>
              </div>
            </div>

            <div style={{
              marginTop: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '8px'
            }}>
              <span style={{ color: '#ffd700', fontWeight: 'bold' }}>
                Status: <span style={{ color: '#ffeb99' }}>{selectedShipStats.condition}</span>
              </span>
              <span style={{ color: '#ffd700', fontWeight: 'bold' }}>
                Crew: <span style={{ color: '#ffeb99' }}>{selectedShipStats.crewStatus}</span>
              </span>
              <span style={{ color: '#ffd700', fontWeight: 'bold' }}>
                Value: <span style={{ color: '#ffeb99' }}>{(selectedShipStats.cost / 1000).toFixed(0)}k</span>
              </span>
            </div>
          </div>
        )}

        {/* Weapon Details Panel */}
        {weaponDetails && (
          <div style={{
            position: 'absolute',
            left: '20px',
            bottom: '20px',
            width: '304px', // Spans both weapon containers
            height: '120px',
            border: '2px solid #ffd700',
            borderRadius: '8px',
            background: 'rgba(255, 215, 0, 0.1)',
            padding: '10px',
            boxShadow: '0 0 15px rgba(255, 215, 0, 0.3)'
          }}>
            <div style={{
              color: '#ffd700',
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'center',
              marginBottom: '8px',
              textShadow: '0 0 5px #ffd700'
            }}>
              WEAPON SPECIFICATIONS
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              fontSize: '9px'
            }}>
              <div>
                <div style={{ color: '#ffd700', fontWeight: 'bold', marginBottom: '2px' }}>
                  {weaponDetails.name}
                </div>
                <div style={{ color: '#ffeb99' }}>
                  <div>Damage: {weaponDetails.damage}</div>
                  <div>Crit: {weaponDetails.crit}</div>
                  <div>Range: {weaponDetails.range}</div>
                </div>
              </div>
              <div>
                <div style={{ color: '#ffeb99' }}>
                  <div>Sil. Req: {weaponDetails.silReq}</div>
                  <div>Price: {weaponDetails.price}</div>
                  <div>Rarity: {weaponDetails.rarity}</div>
                </div>
              </div>
            </div>

            <div style={{
              marginTop: '6px',
              color: '#ffeb99',
              fontSize: '8px',
              lineHeight: '1.2'
            }}>
              <strong style={{ color: '#ffd700' }}>Special:</strong> {weaponDetails.special}
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={R_WIDTH}
          height={R_HEIGHT}
          onClick={handleClickCanvas}
          style={{ borderRadius: '12px', cursor: 'crosshair', position: 'relative', left: '197px' }}
        />

        {/* Ship Tooltip */}
        {hoveredShip && (
          <div style={{
            position: 'fixed',
            left: mousePosition.x + 10,
            top: mousePosition.y - 10,
            background: 'rgba(0, 0, 0, 0.9)',
            border: '2px solid #ffd700',
            borderRadius: '6px',
            padding: '8px 12px',
            color: '#ffd700',
            fontSize: '11px',
            fontFamily: 'Orbitron, monospace',
            zIndex: 1000,
            pointerEvents: 'none',
            boxShadow: '0 0 15px rgba(255, 215, 0, 0.4)',
            maxWidth: '200px'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#ffffff' }}>
              {hoveredShip.designation || 'Undesignated Vessel'}
            </div>
            <div style={{ marginBottom: '2px' }}>
              Status: <span style={{
                color: hoveredShip.status === 'Active' ? '#00ff00' : '#ffff00',
                fontWeight: 'bold'
              }}>
                {hoveredShip.status}
              </span>
            </div>
            <div style={{ marginBottom: '2px' }}>
              Type: <span style={{ color: '#80d0ff' }}>
                {hoveredShip.type.charAt(0).toUpperCase() + hoveredShip.type.slice(1)}
              </span>
            </div>
            <div style={{ marginBottom: '2px' }}>
              Age: <span style={{ color: '#80d0ff' }}>{hoveredShip.age} cycles</span>
            </div>
            {hoveredShip.groupId && (
              <div style={{ marginBottom: '2px' }}>
                Group: <span style={{ color: '#80d0ff' }}>Convoy</span>
              </div>
            )}
            {pinnedShips[hoveredShip.id] && (
              <div style={{
                marginTop: '4px',
                padding: '2px 4px',
                background: pinnedShips[hoveredShip.id] === 'red' ? 'rgba(255, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.3)',
                borderRadius: '3px',
                fontSize: '10px',
                fontWeight: 'bold'
              }}>
                {pinnedShips[hoveredShip.id] === 'red' ? '🔴 PRIORITY TARGET' : '⚪ TRACKED'}
              </div>
            )}
          </div>
        )}
      </div>

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

        <div style={{
          fontSize: '11px',
          height: 'calc(100vh - 120px)',
          overflowY: 'auto',
          padding: '5px 8px'
        }}>
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

      <div style={{
        border: '2px solid #00ff88', borderRadius: '12px', padding: '14px',
        background: 'rgba(0, 0, 0, 0.5)', overflowY: 'auto', maxHeight: '100vh'
      }}>
        <h2 style={{ margin: '0 0 8px', color: '#00ff88', textShadow: '0 0 8px #00ff88' }}>WEAPONS CONTROL</h2>

        <div style={{ fontSize: 12, color: '#a0f7ff', marginBottom: 10 }}>
          Target: <b style={{ color: '#fff' }}>{selectedEnemy ? selectedEnemy.id : 'None'}</b><br />
          Status: {overheated ? <span style={{ color: '#ffea00' }}>OVERHEATED</span> : jamTimer > 0 ? <span style={{ color: '#ffaa00' }}>JAMMED</span> : <span style={{ color: '#00ff88' }}>READY</span>}
        </div>

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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          <button
            onClick={handleFire}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(45deg,#00ffaa,#00ddff)';
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 136, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(45deg,#00ff88,#00ffff)';
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.background = 'linear-gradient(45deg,#ff4444,#ff6666)';
              e.currentTarget.style.transform = 'scale(0.95)';
              e.currentTarget.style.boxShadow = '0 0 30px rgba(255, 68, 68, 0.8)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.background = 'linear-gradient(45deg,#00ffaa,#00ddff)';
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 136, 0.6)';
            }}
            style={{
              padding: '10px',
              borderRadius: 8,
              border: '1px solid #0f0',
              background: 'linear-gradient(45deg,#00ff88,#00ffff)',
              color: '#000',
              fontWeight: 900,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              userSelect: 'none'
            }}
          >
            {selectedWeapon ? `FIRE ${selectedWeapon.toUpperCase()}` : 'FIRE (Space)'}
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