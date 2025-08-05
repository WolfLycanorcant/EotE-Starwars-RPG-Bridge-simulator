import React, { useState, useEffect, useRef, useCallback } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { io, Socket } from 'socket.io-client';



// Types for weapons station
interface WeaponsState {
  targeting: {
    currentTarget: Target | null;
    availableTargets: Target[];
    lockStatus: 'none' | 'acquiring' | 'locked' | 'lost';
    lockStrength: number;
    scanRange: number;
    scanMode: 'passive' | 'active' | 'deep';
  };
  weapons: {
    primaryWeapons: WeaponSystem[];
    secondaryWeapons: WeaponSystem[];
    torpedoes: TorpedoSystem;
    powerLevel: number;
    heatLevel: number;
    autoDefense: boolean;
    firingMode: 'manual' | 'auto' | 'burst';
  };
  shields: {
    frontShield: number;
    rearShield: number;
    leftShield: number;
    rightShield: number;
    shieldBalance: 'balanced' | 'forward' | 'aft' | 'port' | 'starboard';
    regenerationRate: number;
    overload: boolean;
  };
  alert: string;
  combatStatus: 'standby' | 'yellow' | 'red' | 'engaged';
}

interface Target {
  id: string;
  type: 'ship' | 'station' | 'asteroid' | 'debris';
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  size: 'small' | 'medium' | 'large' | 'capital';
  threat: 'none' | 'low' | 'medium' | 'high' | 'critical';
  shields: number;
  hull: number;
  distance: number;
  bearing: number;
  signature: number;
  classification: string;
}

interface WeaponSystem {
  id: string;
  name: string;
  type: 'laser' | 'ion' | 'plasma' | 'particle';
  damage: number;
  range: number;
  accuracy: number;
  chargeLevel: number;
  cooldown: number;
  ammunition: number;
  maxAmmo: number;
  status: 'ready' | 'charging' | 'cooling' | 'damaged' | 'offline';
}

interface TorpedoSystem {
  protonTorpedoes: number;
  concussionMissiles: number;
  ionTorpedoes: number;
  rockets: number;
  maxProton: number;
  maxConcussion: number;
  maxIon: number;
  maxRockets: number;
  tubeStatus: ('ready' | 'loading' | 'armed' | 'damaged')[];
  selectedType: 'proton' | 'concussion' | 'ion' | 'rockets';
}

interface DragState {
  isDragging: boolean;
  dragOffset: { x: number; y: number };
  startPosition: { x: number; y: number };
}

interface ModulePosition {
  x: number;
  y: number;
  zIndex: number;
}

interface UniqueWeapon {
  key: string;
  name: string;
  type: string;
  damage: number;
  critical: number;
  range: string;
  qualities: string[];
  price?: number;
  rarity?: number;
  restricted?: boolean;
}

interface DynamicWeaponModule {
  id: string;
  weaponKey: string;
  weaponData: UniqueWeapon;
  position: ModulePosition;
  status: 'ready' | 'charging' | 'cooling' | 'damaged' | 'offline';
  chargeLevel: number;
  cooldown: number;
  ammunition: number;
  maxAmmo: number;
  heatLevel: number;
  maxHeat: number;
  coolingRate: number;
}

// Animations
const targetScan = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const weaponCharge = keyframes`
  0% { box-shadow: 0 0 5px var(--weapon-color); }
  50% { box-shadow: 0 0 20px var(--weapon-color), 0 0 30px var(--weapon-color); }
  100% { box-shadow: 0 0 5px var(--weapon-color); }
`;

const alertBlink = keyframes`
  0% { opacity: 1; }
  50% { opacity: 0.3; }
  100% { opacity: 1; }
`;

const shieldFlicker = keyframes`
  0% { opacity: 0.8; }
  25% { opacity: 1; }
  50% { opacity: 0.6; }
  75% { opacity: 0.9; }
  100% { opacity: 0.8; }
`;

// Styled Components
const Container = styled.div`
  background: linear-gradient(135deg, #0a0a0a 0%, #1a0a0a 50%, #2a0a0a 100%);
  color: #fff;
  font-family: 'Orbitron', 'Courier New', monospace;
  min-height: 100vh;
  padding: 20px;
  
  --weapon-red: #ff0040;
  --weapon-orange: #ff8c00;
  --weapon-yellow: #ffff00;
  --weapon-green: #00ff41;
  --weapon-blue: #00d4ff;
  --shield-blue: #0080ff;
  --bg-dark: #0a0a0a;
  --text-light: #ffffff;
  --panel-bg: rgba(40, 10, 10, 0.8);
`;

const StationHeader = styled.h1`
  text-align: center;
  font-size: 2.8rem;
  margin-bottom: 30px;
  color: var(--weapon-red);
  text-shadow: 0 0 15px var(--weapon-red);
  letter-spacing: 4px;
  font-weight: 300;
  
  &::before, &::after {
    content: '▲▲▲';
    margin: 0 20px;
    color: var(--weapon-orange);
  }
`;

const MainGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  gap: 30px;
  margin-bottom: 30px;
  
  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }
`;

const LeftPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const RightPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const CenterPanel = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 30px;
`;

const WeaponCard = styled.div<{ $status?: string; $alert?: string }>`
  background: var(--panel-bg);
  padding: 20px;
  border: 2px solid var(--weapon-red);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  position: relative;
  
  ${props => props.$alert === 'critical' && css`
    border-color: var(--weapon-red);
    animation: ${alertBlink} 1.5s infinite;
  `}
  
  ${props => props.$status === 'charging' && css`
    animation: ${weaponCharge} 2s infinite;
  `}
  
  h3 {
    margin: 0 0 15px 0;
    color: var(--weapon-red);
    font-size: 1.1rem;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
`;

const TargetingDisplay = styled.div`
  width: 400px;
  height: 400px;
  background: radial-gradient(circle at center, #000428 0%, #004e92 100%);
  border: 3px solid var(--weapon-blue);
  position: relative;
  overflow: hidden;
  border-radius: 50%;
  box-shadow: 
    inset 0 0 30px rgba(0, 212, 255, 0.3),
    0 0 20px rgba(0, 212, 255, 0.2);
`;

const RadarSweep = styled.div<{ $scanning: boolean }>`
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2px;
  height: 200px;
  background: linear-gradient(0deg, transparent, var(--weapon-green));
  transform-origin: bottom center;
  transform: translate(-50%, -100%);
  
  ${props => props.$scanning && css`
    animation: ${targetScan} 3s linear infinite;
  `}
`;

const TargetBlip = styled.div<{ x: number; y: number; threat: string }>`
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${props =>
    props.threat === 'critical' ? 'var(--weapon-red)' :
      props.threat === 'high' ? 'var(--weapon-orange)' :
        props.threat === 'medium' ? 'var(--weapon-yellow)' :
          'var(--weapon-green)'
  };
  left: ${props => props.x}%;
  top: ${props => props.y}%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 10px currentColor;
  animation: ${alertBlink} 2s infinite;
`;

const WeaponStatus = styled.div<{ $status: string }>`
  font-size: 1.8em;
  font-weight: bold;
  margin: 10px 0;
  text-align: center;
  
  ${props => props.$status === 'ready' && css`
    color: var(--weapon-green);
  `}
  
  ${props => props.$status === 'charging' && css`
    color: var(--weapon-yellow);
    animation: ${alertBlink} 1s infinite;
  `}
  
  ${props => props.$status === 'cooling' && css`
    color: var(--weapon-orange);
  `}
  
  ${props => props.$status === 'damaged' && css`
    color: var(--weapon-red);
    animation: ${alertBlink} 0.5s infinite;
  `}
`;

const ChargeBar = styled.div<{ $level: number; $maxLevel: number }>`
  width: 100%;
  height: 20px;
  background: #333;
  border: 2px solid var(--weapon-blue);
  border-radius: 10px;
  overflow: hidden;
  position: relative;
  margin: 10px 0;
  
  &::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    width: ${props => (props.$level / props.$maxLevel) * 100}%;
    background: linear-gradient(90deg, 
      var(--weapon-green) 0%, 
      var(--weapon-orange) 50%, 
      var(--weapon-red) 100%
    );
    transition: width 0.3s ease;
  }
`;

const ShieldDisplay = styled.div`
  width: 300px;
  height: 200px;
  position: relative;
  background: rgba(0, 0, 0, 0.5);
  border: 2px solid var(--shield-blue);
  border-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ShieldSection = styled.div<{ $strength: number; $position: string }>`
  position: absolute;
  background: rgba(0, 128, 255, ${props => props.$strength / 100 * 0.6});
  border: 2px solid var(--shield-blue);
  
  ${props => props.$strength < 25 && css`
    animation: ${shieldFlicker} 1s infinite;
    border-color: var(--weapon-red);
  `}
  
  ${props => props.$position === 'front' && css`
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    width: 80px;
    height: 20px;
    border-radius: 10px 10px 0 0;
  `}
  
  ${props => props.$position === 'rear' && css`
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    width: 80px;
    height: 20px;
    border-radius: 0 0 10px 10px;
  `}
  
  ${props => props.$position === 'left' && css`
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 80px;
    border-radius: 10px 0 0 10px;
  `}
  
  ${props => props.$position === 'right' && css`
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 80px;
    border-radius: 0 10px 10px 0;
  `}
`;

const FireButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'torpedo' | 'emergency' }>`
  background: ${props =>
    props.$variant === 'torpedo' ? 'var(--weapon-orange)' :
      props.$variant === 'secondary' ? 'var(--weapon-yellow)' :
        props.$variant === 'emergency' ? 'var(--weapon-red)' :
          'var(--weapon-green)'
  };
  color: #000;
  border: 3px solid var(--weapon-red);
  padding: 20px 25px;
  font-size: 1.2em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  border-radius: 8px;
  text-transform: uppercase;
  letter-spacing: 2px;
  font-family: 'Orbitron', sans-serif;
  position: relative;
  
  &:hover {
    background: var(--weapon-red);
    color: #fff;
    transform: scale(1.05);
    box-shadow: 0 0 25px var(--weapon-red);
  }
  
  &:active {
    transform: scale(0.95);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const ControlGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin: 30px 0;
`;

const TorpedoPanel = styled.div`
  background: var(--panel-bg);
  padding: 20px;
  border: 2px solid var(--weapon-orange);
  border-radius: 12px;
  
  h3 {
    color: var(--weapon-orange);
    margin: 0 0 15px 0;
    text-align: center;
  }
`;

const TorpedoCount = styled.div`
  display: flex;
  justify-content: space-between;
  margin: 10px 0;
  font-size: 1.1em;
  
  .type {
    color: var(--weapon-orange);
    font-weight: bold;
  }
  
  .count {
    color: var(--weapon-yellow);
  }
`;

// Draggable Module Components
const DraggableModule = styled.div<{ $position: ModulePosition; $isDragging: boolean }>`
  position: fixed;
  left: ${props => props.$position.x}px;
  top: ${props => props.$position.y}px;
  z-index: ${props => props.$position.zIndex};
  cursor: ${props => props.$isDragging ? 'grabbing' : 'grab'};
  user-select: none;
  transition: ${props => props.$isDragging ? 'none' : 'all 0.2s ease'};
  
  ${props => props.$isDragging && css`
    transform: scale(1.02);
    box-shadow: 0 10px 30px rgba(255, 0, 64, 0.4);
  `}
`;

const DragHandle = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 30px;
  background: linear-gradient(90deg, transparent, rgba(255, 0, 64, 0.2), transparent);
  border-bottom: 1px solid var(--weapon-red);
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8em;
  color: var(--weapon-red);
  opacity: 0.3;
  transition: opacity 0.3s ease;
  z-index: 10;
  
  &:hover {
    opacity: 1;
    background: linear-gradient(90deg, transparent, rgba(255, 0, 64, 0.4), transparent);
  }
  
  &:active {
    cursor: grabbing;
    opacity: 1;
  }
  
  &::before {
    content: '⋮⋮⋮ DRAG ⋮⋮⋮';
    letter-spacing: 1px;
    font-weight: bold;
  }
`;

const ModuleWrapper = styled.div`
  position: relative;
  
  &:hover ${DragHandle} {
    opacity: 0.7;
  }
`;

// Unique Weapons Database (extracted from vehicle files)
const UNIQUE_WEAPONS: UniqueWeapon[] = [
  { key: 'ACML', name: 'Assault Concussion Missile Launcher', type: 'Vehicle', damage: 7, critical: 3, range: 'Short', qualities: ['BLAST 4', 'BREACH 5', 'GUIDED 2', 'INACCURATE 1', 'LIMITEDAMMO 3', 'SLOWFIRING 1'], price: 8500, rarity: 6 },
  { key: 'AFCML', name: 'Alternating-Fire Concussion Missile Launcher', type: 'Vehicle', damage: 6, critical: 3, range: 'Short', qualities: ['BLAST 4', 'BREACH 4', 'GUIDED 3', 'LIMITEDAMMO 3'], price: 7500, rarity: 5 },
  { key: 'ANTIAIR', name: 'Anti-Air Rockets', type: 'Vehicle', damage: 4, critical: 3, range: 'Long', qualities: ['BLAST 2', 'GUIDED 2', 'LIMITEDAMMO 8'], price: 2500, rarity: 4 },
  { key: 'ANTIPERSLASER', name: 'Anti-Personnel Laser Cannon', type: 'Energy Weapon', damage: 5, critical: 3, range: 'Medium', qualities: ['ACCURATE 1'], price: 1500, rarity: 4 },
  { key: 'AUTOBLAST', name: 'Automated Blaster Cannon', type: 'Energy Weapon', damage: 6, critical: 3, range: 'Medium', qualities: ['AUTOFIRE'], price: 3000, rarity: 5 },
  { key: 'BLASTCANHVY', name: 'Heavy Blaster Cannon', type: 'Energy Weapon', damage: 8, critical: 3, range: 'Long', qualities: ['PIERCE 1'], price: 4500, rarity: 6 },
  { key: 'BLASTCANLT', name: 'Light Blaster Cannon', type: 'Energy Weapon', damage: 5, critical: 4, range: 'Medium', qualities: ['ACCURATE 1'], price: 2000, rarity: 4 },
  { key: 'BLASTHVYREP', name: 'Heavy Repeating Blaster', type: 'Energy Weapon', damage: 7, critical: 3, range: 'Long', qualities: ['AUTOFIRE', 'CUMBERSOME 3'], price: 3500, rarity: 5 },
  { key: 'BLASTLTREP', name: 'Light Repeating Blaster', type: 'Energy Weapon', damage: 5, critical: 4, range: 'Medium', qualities: ['AUTOFIRE'], price: 2500, rarity: 4 },
  { key: 'CLUSTERBOMB', name: 'Cluster Bomb', type: 'Explosive', damage: 8, critical: 2, range: 'Short', qualities: ['BLAST 6', 'LIMITEDAMMO 4'], price: 1200, rarity: 6, restricted: true },
  { key: 'CLW', name: 'Composite Laser Weapon', type: 'Energy Weapon', damage: 6, critical: 3, range: 'Long', qualities: ['LINKED 1'], price: 3200, rarity: 5 },
  { key: 'CML', name: 'Concussion Missile Launcher', type: 'Vehicle', damage: 6, critical: 3, range: 'Short', qualities: ['BLAST 4', 'BREACH 4', 'GUIDED 3', 'LIMITEDAMMO 12'], price: 6000, rarity: 5 },
  { key: 'CMLHK', name: 'Concussion Missile Launcher (Homing)', type: 'Vehicle', damage: 6, critical: 3, range: 'Short', qualities: ['BLAST 4', 'BREACH 4', 'GUIDED 4', 'LIMITEDAMMO 8'], price: 7500, rarity: 6 },
  { key: 'CONGRENLAUNCH', name: 'Concussion Grenade Launcher', type: 'Explosive', damage: 8, critical: 4, range: 'Medium', qualities: ['BLAST 5', 'CONCUSSIVE 1', 'LIMITEDAMMO 6'], price: 2800, rarity: 5 },
  { key: 'ELECHARPOON', name: 'Electro Harpoon', type: 'Energy Weapon', damage: 4, critical: 3, range: 'Short', qualities: ['ENSNARE 2', 'STUN 3'], price: 1800, rarity: 5 },
  { key: 'FLAKLT', name: 'Light Flak Cannon', type: 'Slugthrower', damage: 5, critical: 4, range: 'Medium', qualities: ['BLAST 3', 'INACCURATE 1'], price: 2200, rarity: 4 },
  { key: 'FLAKMED', name: 'Medium Flak Cannon', type: 'Slugthrower', damage: 6, critical: 3, range: 'Long', qualities: ['BLAST 4', 'INACCURATE 1'], price: 3500, rarity: 5 },
  { key: 'HEAVYIONBLAS', name: 'Heavy Ion Blaster', type: 'Energy Weapon', damage: 8, critical: 4, range: 'Long', qualities: ['ION', 'SLOW FIRING 1'], price: 5500, rarity: 6 },
  { key: 'IONBATT', name: 'Ion Battery', type: 'Energy Weapon', damage: 6, critical: 4, range: 'Long', qualities: ['ION', 'LINKED 1'], price: 4000, rarity: 5 },
  { key: 'IONHVY', name: 'Heavy Ion Cannon', type: 'Energy Weapon', damage: 7, critical: 4, range: 'Long', qualities: ['ION', 'SLOW FIRING 1'], price: 4500, rarity: 6 },
  { key: 'IONLONG', name: 'Long Range Ion Cannon', type: 'Energy Weapon', damage: 6, critical: 4, range: 'Extreme', qualities: ['ION', 'ACCURATE 1'], price: 5000, rarity: 6 },
  { key: 'IONLT', name: 'Light Ion Cannon', type: 'Energy Weapon', damage: 5, critical: 4, range: 'Medium', qualities: ['ION'], price: 2500, rarity: 4 },
  { key: 'IONMED', name: 'Medium Ion Cannon', type: 'Energy Weapon', damage: 6, critical: 4, range: 'Long', qualities: ['ION'], price: 3500, rarity: 5 },
  { key: 'LASCAN', name: 'Laser Cannon', type: 'Energy Weapon', damage: 6, critical: 3, range: 'Close', qualities: ['LINKED 1'], price: 2500, rarity: 4 },
  { key: 'LASERHVY', name: 'Heavy Laser Cannon', type: 'Energy Weapon', damage: 8, critical: 3, range: 'Long', qualities: ['PIERCE 1'], price: 4000, rarity: 5 },
  { key: 'LASERLONG', name: 'Long Range Laser Cannon', type: 'Energy Weapon', damage: 6, critical: 3, range: 'Extreme', qualities: ['ACCURATE 2'], price: 4500, rarity: 6 },
  { key: 'LASERLT', name: 'Light Laser Cannon', type: 'Energy Weapon', damage: 5, critical: 3, range: 'Close', qualities: [], price: 1500, rarity: 3 },
  { key: 'LASERMED', name: 'Medium Laser Cannon', type: 'Energy Weapon', damage: 6, critical: 3, range: 'Close', qualities: ['LINKED 3'], price: 2000, rarity: 4 },
  { key: 'LASERPTDEF', name: 'Point Defense Laser', type: 'Energy Weapon', damage: 4, critical: 4, range: 'Close', qualities: ['ACCURATE 2', 'AUTOFIRE'], price: 2200, rarity: 4 },
  { key: 'LASERQUAD', name: 'Quad Laser Cannon', type: 'Energy Weapon', damage: 5, critical: 3, range: 'Close', qualities: ['ACCURATE 1', 'LINKED 3'], price: 3000, rarity: 5 },
  { key: 'LIGHTREPBLASVEH20', name: 'Light Repeating Blaster (Vehicle)', type: 'Energy Weapon', damage: 5, critical: 4, range: 'Medium', qualities: ['AUTOFIRE'], price: 2800, rarity: 4 },
  { key: 'LIGHTREPVEHICLE', name: 'Light Repeating Blaster (Vehicle)', type: 'Energy Weapon', damage: 5, critical: 4, range: 'Medium', qualities: ['AUTOFIRE'], price: 2800, rarity: 4 },
  { key: 'LTTRACTCOUPLE', name: 'Light Tractor Beam Coupling', type: 'Utility', damage: 0, critical: 0, range: 'Short', qualities: ['TRACTOR 2'], price: 3500, rarity: 5 },
  { key: 'MASSDRIVERCANNON', name: 'Mass Driver Cannon', type: 'Slugthrower', damage: 10, critical: 2, range: 'Long', qualities: ['BREACH 2', 'PIERCE 3', 'SLOW FIRING 2'], price: 8000, rarity: 7, restricted: true },
  { key: 'MASSDRIVMSL', name: 'Mass Driver Missile', type: 'Slugthrower', damage: 8, critical: 2, range: 'Long', qualities: ['BREACH 1', 'GUIDED 2', 'PIERCE 2', 'LIMITEDAMMO 6'], price: 5500, rarity: 6 },
  { key: 'MINCONCLNCH', name: 'Mini Concussion Launcher', type: 'Explosive', damage: 5, critical: 4, range: 'Short', qualities: ['BLAST 3', 'LIMITEDAMMO 8'], price: 1800, rarity: 4 },
  { key: 'MINIROCKET', name: 'Mini Rocket Launcher', type: 'Explosive', damage: 6, critical: 3, range: 'Medium', qualities: ['BLAST 4', 'LIMITEDAMMO 12'], price: 2200, rarity: 4 },
  { key: 'PROTONBAY', name: 'Proton Torpedo Bay', type: 'Vehicle', damage: 8, critical: 2, range: 'Short', qualities: ['BLAST 6', 'BREACH 6', 'GUIDED 2', 'LIMITEDAMMO 8', 'SLOW FIRING 1'], price: 12000, rarity: 7, restricted: true },
  { key: 'PROTONBOMB', name: 'Proton Bomb', type: 'Explosive', damage: 20, critical: 2, range: 'Short', qualities: ['BLAST 15', 'BREACH 5', 'LIMITEDAMMO 2'], price: 2500, rarity: 8, restricted: true },
  { key: 'PROTTORPHVY', name: 'Heavy Proton Torpedo', type: 'Vehicle', damage: 10, critical: 2, range: 'Short', qualities: ['BLAST 8', 'BREACH 8', 'GUIDED 3', 'LIMITEDAMMO 4'], price: 3500, rarity: 7, restricted: true },
  { key: 'PTL', name: 'Proton Torpedo Launcher', type: 'Vehicle', damage: 8, critical: 2, range: 'Short', qualities: ['BLAST 6', 'BREACH 6', 'GUIDED 2', 'LIMITEDAMMO 6', 'LINKED 1'], price: 8000, rarity: 6, restricted: true },
  { key: 'ROTREPBLASTCAN', name: 'Rotating Repeating Blaster Cannon', type: 'Energy Weapon', damage: 7, critical: 3, range: 'Long', qualities: ['AUTOFIRE', 'CUMBERSOME 4'], price: 4200, rarity: 6 },
  { key: 'SUPERLASER', name: 'Superlaser', type: 'Energy Weapon', damage: 50, critical: 1, range: 'Extreme', qualities: ['BREACH 20', 'SLOW FIRING 3'], price: 0, rarity: 10, restricted: true },
  { key: 'SUPPRESSCANNON', name: 'Suppression Cannon', type: 'Energy Weapon', damage: 6, critical: 4, range: 'Long', qualities: ['AUTOFIRE', 'SUPPRESSIVE'], price: 3800, rarity: 5 },
  { key: 'TORPLAUNCH', name: 'Torpedo Launcher', type: 'Vehicle', damage: 8, critical: 2, range: 'Short', qualities: ['BLAST 6', 'BREACH 6', 'GUIDED 2', 'LIMITEDAMMO 8'], price: 7500, rarity: 6, restricted: true },
  { key: 'TRACTHVY', name: 'Heavy Tractor Beam Projector', type: 'Utility', damage: 0, critical: 0, range: 'Short', qualities: ['TRACTOR 6'], price: 15000, rarity: 7 },
  { key: 'TRACTLT', name: 'Light Tractor Beam Projector', type: 'Utility', damage: 0, critical: 0, range: 'Close', qualities: ['TRACTOR 2'], price: 5000, rarity: 5 },
  { key: 'TRACTMED', name: 'Medium Tractor Beam Projector', type: 'Utility', damage: 0, critical: 0, range: 'Short', qualities: ['TRACTOR 4'], price: 8000, rarity: 6 },
  { key: 'TURBOHVY', name: 'Heavy Turbolaser', type: 'Energy Weapon', damage: 11, critical: 3, range: 'Long', qualities: ['BREACH 4', 'LINKED 1', 'SLOW FIRING 2'], price: 25000, rarity: 8, restricted: true },
  { key: 'TURBOLT', name: 'Light Turbolaser', type: 'Energy Weapon', damage: 9, critical: 3, range: 'Long', qualities: ['BREACH 2', 'SLOW FIRING 1'], price: 15000, rarity: 7, restricted: true },
  { key: 'TURBOMED', name: 'Medium Turbolaser', type: 'Energy Weapon', damage: 10, critical: 3, range: 'Long', qualities: ['BREACH 3', 'SLOW FIRING 1'], price: 20000, rarity: 7, restricted: true },
  { key: 'VL6', name: 'VL-6 Disruptor', type: 'Energy Weapon', damage: 10, critical: 2, range: 'Long', qualities: ['PIERCE 5', 'VICIOUS 4'], price: 8500, rarity: 8, restricted: true },
  { key: 'XX23TRACER', name: 'XX-23 S-Thread Tracer', type: 'Utility', damage: 0, critical: 0, range: 'Close', qualities: ['GUIDED 3', 'LIMITEDAMMO 1'], price: 500, rarity: 3 }
];

// Dropdown styled components
const WeaponDropdownContainer = styled.div`
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const DraggableDropdownPanel = styled.div<{ $position: ModulePosition; $isDragging: boolean; $isCollapsed: boolean }>`
  position: fixed;
  left: ${props => props.$position.x}px;
  top: ${props => props.$position.y}px;
  z-index: ${props => props.$position.zIndex};
  cursor: ${props => props.$isDragging ? 'grabbing' : 'grab'};
  user-select: none;
  transition: ${props => props.$isDragging ? 'none' : 'all 0.2s ease'};
  
  ${props => props.$isDragging && css`
    transform: scale(1.02);
    box-shadow: 0 10px 30px rgba(0, 212, 255, 0.4);
  `}
  
  ${props => props.$isCollapsed && css`
    width: 60px;
    height: 40px;
  `}
`;

const DropdownPanel = styled.div<{ $isCollapsed: boolean }>`
  background: var(--panel-bg);
  padding: ${props => props.$isCollapsed ? '8px' : '15px'};
  border: 2px solid var(--weapon-blue);
  border-radius: 8px;
  backdrop-filter: blur(10px);
  min-width: ${props => props.$isCollapsed ? '60px' : '300px'};
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
  
  ${props => props.$isCollapsed && css`
    height: 40px;
    min-height: 40px;
  `}
`;

const DropdownHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  cursor: grab;
  
  &:active {
    cursor: grabbing;
  }
`;

const CollapseButton = styled.button`
  background: var(--weapon-orange);
  border: 1px solid var(--weapon-red);
  border-radius: 4px;
  color: #000;
  font-size: 0.8em;
  font-weight: bold;
  padding: 4px 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  
  &:hover {
    background: var(--weapon-red);
    color: #fff;
    transform: scale(1.1);
  }
`;

const CollapsedIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 1.2em;
  color: var(--weapon-blue);
  cursor: pointer;
  
  &:hover {
    color: var(--weapon-yellow);
    transform: scale(1.2);
  }
`;

const DropdownContent = styled.div<{ $isCollapsed: boolean }>`
  display: ${props => props.$isCollapsed ? 'none' : 'block'};
  transition: all 0.3s ease;
`;

const DropdownLabel = styled.label`
  color: var(--weapon-blue);
  font-weight: bold;
  font-size: 0.9em;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
  display: block;
`;

const WeaponSelect = styled.select`
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-dark);
  border: 2px solid var(--weapon-blue);
  border-radius: 4px;
  color: var(--weapon-yellow);
  font-family: 'Orbitron', monospace;
  font-size: 0.9em;
  
  &:focus {
    outline: none;
    border-color: var(--weapon-red);
    box-shadow: 0 0 10px rgba(255, 0, 64, 0.3);
  }
  
  option {
    background: var(--bg-dark);
    color: var(--weapon-yellow);
    padding: 8px;
  }
`;

const AddButton = styled.button`
  width: 100%;
  padding: 10px;
  background: var(--weapon-green);
  border: 2px solid var(--weapon-blue);
  border-radius: 4px;
  color: #000;
  font-family: 'Orbitron', sans-serif;
  font-weight: bold;
  text-transform: uppercase;
  cursor: pointer;
  margin-top: 10px;
  transition: all 0.3s ease;
  
  &:hover {
    background: var(--weapon-blue);
    color: #fff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 212, 255, 0.4);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const RemoveButton = styled(AddButton)`
  background: var(--weapon-red);
  
  &:hover {
    background: var(--weapon-orange);
    box-shadow: 0 4px 12px rgba(255, 136, 0, 0.4);
  }
`;

// Animated components to fix styled-components keyframe error
const OverheatingText = styled.div`
  color: var(--weapon-red);
  font-size: 0.7em;
  text-align: center;
  margin-top: 2px;
  animation: ${alertBlink} 1s infinite;
`;

const AlertIndicator = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20px;
  height: 20px;
  background: var(--weapon-red);
  border: 2px solid var(--weapon-red);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: ${alertBlink} 1s infinite;
`;

const SystemOverheatedText = styled.div`
  color: var(--weapon-red);
  font-weight: bold;
  text-align: center;
  margin-top: 5px;
  animation: ${alertBlink} 1s infinite;
`;

// Projectile effect animations
const beamFire = keyframes`
  0% { 
    opacity: 1;
    transform: translate(-50%, -50%) rotate(var(--angle)) scaleY(0);
  }
  50% { 
    opacity: 1;
    transform: translate(-50%, -50%) rotate(var(--angle)) scaleY(1);
  }
  100% { 
    opacity: 0;
    transform: translate(-50%, -50%) rotate(var(--angle)) scaleY(1);
  }
`;

const projectileFly = keyframes`
  0% { 
    opacity: 1;
    transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0);
  }
  100% { 
    opacity: 0;
    transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-200px);
  }
`;

// Projectile effect styled components
const BeamEffect = styled.div<{ $angle: number }>`
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 150px;
  background: linear-gradient(0deg, transparent, var(--weapon-red), var(--weapon-red), transparent);
  transform-origin: bottom center;
  --angle: ${props => props.$angle}deg;
  animation: ${beamFire} 0.3s ease-out;
  pointer-events: none;
  z-index: 10;
`;

const MissileEffect = styled.div<{ $angle: number }>`
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 16px;
  background: var(--weapon-orange);
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  transform-origin: center center;
  --angle: ${props => props.$angle}deg;
  animation: ${projectileFly} 1.5s ease-out;
  pointer-events: none;
  z-index: 10;
  
  &::after {
    content: '';
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 8px;
    background: var(--weapon-red);
    border-radius: 50%;
  }
`;

const GrenadeEffect = styled.div<{ $angle: number }>`
  position: absolute;
  top: 50%;
  left: 50%;
  width: 6px;
  height: 6px;
  background: var(--weapon-green);
  border-radius: 50%;
  transform-origin: center center;
  --angle: ${props => props.$angle}deg;
  animation: ${projectileFly} 1.2s ease-out;
  pointer-events: none;
  z-index: 10;
  
  &::before {
    content: '';
    position: absolute;
    top: -2px;
    left: 50%;
    transform: translateX(-50%);
    width: 2px;
    height: 4px;
    background: var(--weapon-yellow);
    border-radius: 50%;
  }
`;

const TorpedoEffect = styled.div<{ $angle: number }>`
  position: absolute;
  top: 50%;
  left: 50%;
  width: 12px;
  height: 20px;
  background: var(--weapon-blue);
  border-radius: 60% 60% 40% 40%;
  transform-origin: center center;
  --angle: ${props => props.$angle}deg;
  animation: ${projectileFly} 2s ease-out;
  pointer-events: none;
  z-index: 10;
  
  &::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 6px;
    height: 6px;
    background: var(--weapon-yellow);
    border-radius: 50%;
  }
`;

// Main Component
const WeaponsStation: React.FC = () => {
  console.log('🎯 WEAPONS STATION COMPONENT LOADING'); // Debug: Check if component loads

  const [socket, setSocket] = useState<Socket | null>(null);
  const [weaponsState, setWeaponsState] = useState<WeaponsState>({
    targeting: {
      currentTarget: null,
      availableTargets: [],
      lockStatus: 'none',
      lockStrength: 0,
      scanRange: 5000,
      scanMode: 'passive'
    },
    weapons: {
      primaryWeapons: [],
      secondaryWeapons: [],
      torpedoes: {
        protonTorpedoes: 0,
        concussionMissiles: 0,
        ionTorpedoes: 0,
        rockets: 0,
        maxProton: 0,
        maxConcussion: 0,
        maxIon: 0,
        maxRockets: 0,
        tubeStatus: ['ready', 'ready'],
        selectedType: 'proton'
      },
      powerLevel: 100,
      heatLevel: 0,
      autoDefense: false,
      firingMode: 'manual'
    },
    shields: {
      frontShield: 100,
      rearShield: 100,
      leftShield: 100,
      rightShield: 100,
      shieldBalance: 'balanced',
      regenerationRate: 2,
      overload: false
    },
    alert: 'normal',
    combatStatus: 'standby'
  });

  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Drag and drop state
  const [modulePositions, setModulePositions] = useState<{ [key: string]: ModulePosition }>({
    primaryWeapons: { x: 50, y: 100, zIndex: 1 },
    secondaryWeapons: { x: 50, y: 350, zIndex: 1 },
    torpedoPanel: { x: 50, y: 600, zIndex: 1 },
    targetingDisplay: { x: window.innerWidth / 2 - 200, y: 150, zIndex: 1 },
    shieldDisplay: { x: window.innerWidth - 350, y: 100, zIndex: 1 },
    systemStatus: { x: window.innerWidth - 350, y: 400, zIndex: 1 }
  });

  const [dragState, setDragState] = useState<{ [key: string]: DragState }>({});
  const [highestZIndex, setHighestZIndex] = useState(10);

  // Dynamic weapon modules state
  const [dynamicWeaponModules, setDynamicWeaponModules] = useState<DynamicWeaponModule[]>([]);
  const [selectedWeaponToAdd, setSelectedWeaponToAdd] = useState<string>('');
  const [selectedModuleToRemove, setSelectedModuleToRemove] = useState<string>('');

  // Projectile effects state
  interface ProjectileEffect {
    id: string;
    type: 'beam' | 'missile' | 'grenade' | 'torpedo';
    angle: number;
    startTime: number;
  }
  const [activeProjectiles, setActiveProjectiles] = useState<ProjectileEffect[]>([]);

  // Dropdown panel state
  const [dropdownPositions, setDropdownPositions] = useState<{ [key: string]: ModulePosition }>({
    addWeaponPanel: { x: 20, y: 20, zIndex: 1000 },
    removeWeaponPanel: { x: 20, y: 200, zIndex: 1000 }
  });
  const [dropdownCollapsed, setDropdownCollapsed] = useState<{ [key: string]: boolean }>({
    addWeaponPanel: false,
    removeWeaponPanel: false
  });



  // Weapon assignment functions
  const assignToPrimaryWeapons = (moduleId: string) => {
    const module = dynamicWeaponModules.find(m => m.id === moduleId);
    if (!module) return;

    const newWeapon: WeaponSystem = {
      id: `primary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: module.weaponData.name,
      type: module.weaponData.type.toLowerCase() as 'laser' | 'ion' | 'plasma' | 'particle',
      damage: module.weaponData.damage,
      range: parseRange(module.weaponData.range),
      accuracy: 85 + (module.weaponData.qualities.find(q => q.startsWith('ACCURATE')) ?
        parseInt(module.weaponData.qualities.find(q => q.startsWith('ACCURATE'))?.split(' ')[1] || '0') * 5 : 0),
      chargeLevel: 100,
      cooldown: 0,
      ammunition: module.ammunition,
      maxAmmo: module.maxAmmo,
      status: 'ready'
    };

    setWeaponsState(prev => ({
      ...prev,
      weapons: {
        ...prev.weapons,
        primaryWeapons: [...prev.weapons.primaryWeapons, newWeapon]
      }
    }));

    console.log(`Assigned ${module.weaponData.name} to Primary Weapons`);
  };

  const assignToSecondaryWeapons = (moduleId: string) => {
    const module = dynamicWeaponModules.find(m => m.id === moduleId);
    if (!module) return;

    const newWeapon: WeaponSystem = {
      id: `secondary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: module.weaponData.name,
      type: module.weaponData.type.toLowerCase() as 'laser' | 'ion' | 'plasma' | 'particle',
      damage: module.weaponData.damage,
      range: parseRange(module.weaponData.range),
      accuracy: 85 + (module.weaponData.qualities.find(q => q.startsWith('ACCURATE')) ?
        parseInt(module.weaponData.qualities.find(q => q.startsWith('ACCURATE'))?.split(' ')[1] || '0') * 5 : 0),
      chargeLevel: 100,
      cooldown: 0,
      ammunition: module.ammunition,
      maxAmmo: module.maxAmmo,
      status: 'ready'
    };

    setWeaponsState(prev => ({
      ...prev,
      weapons: {
        ...prev.weapons,
        secondaryWeapons: [...prev.weapons.secondaryWeapons, newWeapon]
      }
    }));

    console.log(`Assigned ${module.weaponData.name} to Secondary Weapons`);
  };

  // Helper function to parse range string to number
  const parseRange = (rangeStr: string): number => {
    switch (rangeStr.toLowerCase()) {
      case 'close': return 500;
      case 'short': return 1000;
      case 'medium': return 2000;
      case 'long': return 4000;
      case 'extreme': return 8000;
      default: return 2000;
    }
  };

  // Fire functions for primary and secondary weapons
  const firePrimaryWeapon = (weaponId: string) => {
    // Find the weapon being fired to create projectile effect
    const weaponToFire = weaponsState.weapons.primaryWeapons.find(w => w.id === weaponId);

    setWeaponsState(prev => ({
      ...prev,
      weapons: {
        ...prev.weapons,
        primaryWeapons: prev.weapons.primaryWeapons.map(weapon =>
          weapon.id === weaponId && weapon.status === 'ready'
            ? {
              ...weapon,
              status: 'cooling',
              cooldown: 3,
              chargeLevel: Math.max(0, weapon.chargeLevel - 25),
              ammunition: weapon.ammunition > 0 ? weapon.ammunition - 1 : weapon.ammunition
            }
            : weapon
        ),
        heatLevel: Math.min(100, prev.weapons.heatLevel + 5)
      }
    }));

    // Create projectile effect
    if (weaponToFire) {
      createProjectileEffect(weaponToFire.name, weaponToFire.type);
    }

    emitAction('fire_primary_weapon', { weaponId });
  };

  const fireSecondaryWeapon = (weaponId: string) => {
    // Find the weapon being fired to create projectile effect
    const weaponToFire = weaponsState.weapons.secondaryWeapons.find(w => w.id === weaponId);

    setWeaponsState(prev => ({
      ...prev,
      weapons: {
        ...prev.weapons,
        secondaryWeapons: prev.weapons.secondaryWeapons.map(weapon =>
          weapon.id === weaponId && weapon.status === 'ready'
            ? {
              ...weapon,
              status: 'cooling',
              cooldown: 3,
              ammunition: weapon.ammunition > 0 ? weapon.ammunition - 1 : weapon.ammunition
            }
            : weapon
        ),
        heatLevel: Math.min(100, prev.weapons.heatLevel + 5)
      }
    }));

    // Create projectile effect
    if (weaponToFire) {
      createProjectileEffect(weaponToFire.name, weaponToFire.type);
    }

    emitAction('fire_secondary_weapon', { weaponId });
  };

  // Clear all weapons from Primary and Secondary modules
  const clearAllAssignedWeapons = () => {
    const confirmClear = window.confirm(
      'Are you sure you want to remove ALL weapons from Primary and Secondary weapon modules? This action cannot be undone.'
    );

    if (confirmClear) {
      setWeaponsState(prev => ({
        ...prev,
        weapons: {
          ...prev.weapons,
          primaryWeapons: [],
          secondaryWeapons: []
        }
      }));
      console.log('Cleared all weapons from Primary and Secondary modules');
      emitAction('clear_all_assigned_weapons', {});
    }
  };

  // Projectile effect functions
  const determineProjectileType = (weaponName: string, weaponType: string): 'beam' | 'missile' | 'grenade' | 'torpedo' => {
    const name = weaponName.toLowerCase();
    const type = weaponType.toLowerCase();

    // Check for specific weapon types
    if (name.includes('torpedo') || name.includes('proton')) return 'torpedo';
    if (name.includes('missile') || name.includes('concussion')) return 'missile';
    if (name.includes('grenade') || name.includes('launcher')) return 'grenade';
    if (name.includes('rocket')) return 'missile';

    // Check by weapon type
    if (type === 'energy weapon') return 'beam';
    if (type === 'vehicle' && (name.includes('missile') || name.includes('torpedo'))) return name.includes('torpedo') ? 'torpedo' : 'missile';
    if (type === 'explosive') return 'grenade';

    // Default to beam for energy weapons, missile for others
    return type === 'energy weapon' ? 'beam' : 'missile';
  };

  const createProjectileEffect = (weaponName: string, weaponType: string) => {
    const projectileType = determineProjectileType(weaponName, weaponType);
    const angle = Math.random() * 360; // Random direction

    const newProjectile: ProjectileEffect = {
      id: `projectile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: projectileType,
      angle,
      startTime: Date.now()
    };

    setActiveProjectiles(prev => [...prev, newProjectile]);

    // Remove projectile after animation completes
    const duration = projectileType === 'beam' ? 300 : projectileType === 'torpedo' ? 2000 : projectileType === 'missile' ? 1500 : 1200;
    setTimeout(() => {
      setActiveProjectiles(prev => prev.filter(p => p.id !== newProjectile.id));
    }, duration);

    console.log(`🚀 Fired ${projectileType} from ${weaponName} at ${angle.toFixed(1)}°`);
  };

  // Dropdown collapse and drag functions
  const toggleDropdownCollapse = (panelId: string) => {
    setDropdownCollapsed(prev => ({
      ...prev,
      [panelId]: !prev[panelId]
    }));
  };

  const handleDropdownMouseDown = useCallback((e: React.MouseEvent, panelId: string) => {
    if (dropdownCollapsed[panelId]) return; // Don't drag when collapsed

    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    setDragState(prev => ({
      ...prev,
      [panelId]: {
        isDragging: true,
        dragOffset: { x: startX, y: startY },
        startPosition: { x: e.clientX, y: e.clientY }
      }
    }));

    // Bring to front
    const newZIndex = highestZIndex + 1;
    setHighestZIndex(newZIndex);
    setDropdownPositions(prev => ({
      ...prev,
      [panelId]: { ...prev[panelId], zIndex: newZIndex }
    }));
  }, [highestZIndex, dropdownCollapsed]);

  // Helper function to calculate cooling rate based on weapon type
  const calculateCoolingRate = (weaponData: UniqueWeapon): number => {
    const weaponName = weaponData.name.toLowerCase();
    const weaponType = weaponData.type.toLowerCase();
    const weaponKey = weaponData.key.toLowerCase();

    // Energy weapons have different cooling rates based on their class
    if (weaponType.includes('energy') ||
      weaponName.includes('laser') ||
      weaponName.includes('blaster') ||
      weaponName.includes('turbolaser') ||
      weaponKey.includes('laser') ||
      weaponKey.includes('blast') ||
      weaponKey.includes('turbo') ||
      weaponKey.includes('ion')) {

      // Turbolasers cool slower (they run very hot)
      if (weaponName.includes('turbolaser') || weaponKey.includes('turbo')) {
        return 0.8;
      }
      // Heavy weapons cool slower
      else if (weaponName.includes('heavy') || weaponName.includes('hvy')) {
        return 1.2;
      }
      // Medium weapons have standard cooling
      else if (weaponName.includes('medium') || weaponName.includes('med')) {
        return 1.5;
      }
      // Light weapons cool faster
      else if (weaponName.includes('light') || weaponName.includes('lt')) {
        return 2.0;
      }

      // Standard energy weapon cooling
      return 1.5;
    }

    // Non-energy weapons cool very quickly (minimal heat generation)
    return 3.0;
  };

  // Helper function to calculate maximum heat capacity based on weapon type
  const calculateMaxHeat = (weaponData: UniqueWeapon): number => {
    const weaponName = weaponData.name.toLowerCase();
    const weaponType = weaponData.type.toLowerCase();
    const weaponKey = weaponData.key.toLowerCase();

    // Energy weapons have heat capacity based on their power level
    if (weaponType.includes('energy') ||
      weaponName.includes('laser') ||
      weaponName.includes('blaster') ||
      weaponName.includes('turbolaser') ||
      weaponKey.includes('laser') ||
      weaponKey.includes('blast') ||
      weaponKey.includes('turbo') ||
      weaponKey.includes('ion')) {

      const baseDamage = weaponData.damage;

      // Turbolasers have the highest heat capacity
      if (weaponName.includes('turbolaser') || weaponKey.includes('turbo')) {
        return Math.min(200, Math.max(100, baseDamage * 15));
      }
      // Heavy weapons have high heat capacity
      else if (weaponName.includes('heavy') || weaponName.includes('hvy')) {
        return Math.min(150, Math.max(80, baseDamage * 12));
      }
      // Medium weapons have moderate heat capacity
      else if (weaponName.includes('medium') || weaponName.includes('med')) {
        return Math.min(120, Math.max(60, baseDamage * 10));
      }
      // Light weapons have lower heat capacity
      else if (weaponName.includes('light') || weaponName.includes('lt')) {
        return Math.min(80, Math.max(40, baseDamage * 8));
      }

      // Standard energy weapon heat capacity
      return Math.min(100, Math.max(50, baseDamage * 10));
    }

    // Non-energy weapons have minimal heat capacity
    return 20;
  };

  // Helper function to determine ammunition type for torpedo bay weapons
  const getAmmunitionType = (weaponData: UniqueWeapon): 'proton' | 'concussion' | 'ion' | 'rockets' | null => {
    const weaponName = weaponData.name.toLowerCase();
    const weaponKey = weaponData.key.toLowerCase();

    // Check for proton torpedoes
    if (weaponName.includes('proton') || weaponKey.includes('proton') || weaponKey.includes('ptl')) {
      return 'proton';
    }

    // Check for concussion missiles
    if (weaponName.includes('concussion') || weaponName.includes('missile') || weaponKey.includes('cml') || weaponKey.includes('missile')) {
      return 'concussion';
    }

    // Check for ion torpedoes
    if (weaponName.includes('ion torpedo') || weaponKey.includes('ion') && (weaponName.includes('torpedo') || weaponKey.includes('torpedo'))) {
      return 'ion';
    }

    // Check for rockets
    if (weaponName.includes('rocket') || weaponKey.includes('rocket') || weaponKey.includes('antiair') || weaponKey.includes('minirocket')) {
      return 'rockets';
    }

    // Check for bombs and grenades (use rockets for these)
    if (weaponName.includes('bomb') || weaponName.includes('grenade') || weaponKey.includes('bomb') || weaponKey.includes('gren')) {
      return 'rockets';
    }

    return null; // Energy weapons don't use torpedo bay ammo
  };

  // Helper function to get current ammunition count from torpedo bay
  const getCurrentAmmoCount = (ammoType: 'proton' | 'concussion' | 'ion' | 'rockets'): number => {
    switch (ammoType) {
      case 'proton':
        return weaponsState.weapons.torpedoes.protonTorpedoes;
      case 'concussion':
        return weaponsState.weapons.torpedoes.concussionMissiles;
      case 'ion':
        return weaponsState.weapons.torpedoes.ionTorpedoes;
      case 'rockets':
        return weaponsState.weapons.torpedoes.rockets;
      default:
        return 0;
    }
  };

  // Helper function to calculate heat generation based on weapon type
  const calculateWeaponHeat = (weaponData: UniqueWeapon): number => {
    const weaponName = weaponData.name.toLowerCase();
    const weaponType = weaponData.type.toLowerCase();
    const weaponKey = weaponData.key.toLowerCase();

    // Energy weapons generate heat based on their power level
    if (weaponType.includes('energy') ||
      weaponName.includes('laser') ||
      weaponName.includes('blaster') ||
      weaponName.includes('turbolaser') ||
      weaponKey.includes('laser') ||
      weaponKey.includes('blast') ||
      weaponKey.includes('turbo') ||
      weaponKey.includes('ion')) {

      // Higher damage weapons generate more heat
      const baseDamage = weaponData.damage;
      let heatMultiplier = 1;

      // Turbolasers generate the most heat
      if (weaponName.includes('turbolaser') || weaponKey.includes('turbo')) {
        heatMultiplier = 3;
      }
      // Heavy weapons generate more heat
      else if (weaponName.includes('heavy') || weaponName.includes('hvy')) {
        heatMultiplier = 2.5;
      }
      // Medium weapons generate moderate heat
      else if (weaponName.includes('medium') || weaponName.includes('med')) {
        heatMultiplier = 2;
      }
      // Light weapons generate less heat
      else if (weaponName.includes('light') || weaponName.includes('lt')) {
        heatMultiplier = 1.5;
      }

      // Calculate heat: base damage * multiplier, capped between 5-40
      return Math.min(40, Math.max(5, Math.floor(baseDamage * heatMultiplier)));
    }

    // Non-energy weapons (slugthrowers, explosives, etc.) generate minimal heat
    return 2;
  };

  // Functions for adding and removing weapon modules
  const addWeaponModule = () => {
    if (!selectedWeaponToAdd) return;

    const weaponData = UNIQUE_WEAPONS.find(w => w.key === selectedWeaponToAdd);
    if (!weaponData) return;

    const newModule: DynamicWeaponModule = {
      id: `dynamic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      weaponKey: selectedWeaponToAdd,
      weaponData,
      position: {
        x: Math.random() * (window.innerWidth - 350) + 50,
        y: Math.random() * (window.innerHeight - 250) + 100,
        zIndex: highestZIndex + 1
      },
      status: 'ready',
      chargeLevel: 100,
      cooldown: 0,
      ammunition: weaponData.qualities.some(q => q.includes('LIMITEDAMMO')) ?
        parseInt(weaponData.qualities.find(q => q.includes('LIMITEDAMMO'))?.split(' ')[1] || '10') : -1,
      maxAmmo: weaponData.qualities.some(q => q.includes('LIMITEDAMMO')) ?
        parseInt(weaponData.qualities.find(q => q.includes('LIMITEDAMMO'))?.split(' ')[1] || '10') : -1,
      heatLevel: 0,
      maxHeat: calculateMaxHeat(weaponData),
      coolingRate: calculateCoolingRate(weaponData)
    };

    setDynamicWeaponModules(prev => [...prev, newModule]);
    setHighestZIndex(prev => prev + 1);
    setSelectedWeaponToAdd('');

    // Add to module positions for drag functionality
    setModulePositions(prev => ({
      ...prev,
      [newModule.id]: newModule.position
    }));

    // Check if weapon uses torpedoes/missiles and add them to torpedo bay
    const weaponName = weaponData.name.toLowerCase();
    const weaponKey = weaponData.key.toLowerCase();

    if (weaponName.includes('torpedo') || weaponKey.includes('torpedo') || weaponKey.includes('ptl') || weaponKey.includes('proton')) {
      // Add proton torpedoes
      setWeaponsState(prev => ({
        ...prev,
        weapons: {
          ...prev.weapons,
          torpedoes: {
            ...prev.weapons.torpedoes,
            protonTorpedoes: Math.max(prev.weapons.torpedoes.protonTorpedoes, 8),
            maxProton: Math.max(prev.weapons.torpedoes.maxProton, 8)
          }
        }
      }));
    }

    if (weaponName.includes('missile') || weaponName.includes('concussion') || weaponKey.includes('cml') || weaponKey.includes('missile')) {
      // Add concussion missiles
      setWeaponsState(prev => ({
        ...prev,
        weapons: {
          ...prev.weapons,
          torpedoes: {
            ...prev.weapons.torpedoes,
            concussionMissiles: Math.max(prev.weapons.torpedoes.concussionMissiles, 12),
            maxConcussion: Math.max(prev.weapons.torpedoes.maxConcussion, 12)
          }
        }
      }));
    }

    if (weaponName.includes('ion torpedo') || weaponKey.includes('ion') && (weaponName.includes('torpedo') || weaponKey.includes('torpedo'))) {
      // Add ion torpedoes
      setWeaponsState(prev => ({
        ...prev,
        weapons: {
          ...prev.weapons,
          torpedoes: {
            ...prev.weapons.torpedoes,
            ionTorpedoes: Math.max(prev.weapons.torpedoes.ionTorpedoes, 4),
            maxIon: Math.max(prev.weapons.torpedoes.maxIon, 4)
          }
        }
      }));
    }

    if (weaponName.includes('rocket') || weaponKey.includes('rocket') || weaponKey.includes('antiair') || weaponKey.includes('minirocket')) {
      // Add rockets
      setWeaponsState(prev => ({
        ...prev,
        weapons: {
          ...prev.weapons,
          torpedoes: {
            ...prev.weapons.torpedoes,
            rockets: Math.max(prev.weapons.torpedoes.rockets, 16),
            maxRockets: Math.max(prev.weapons.torpedoes.maxRockets, 16)
          }
        }
      }));
    }

    emitAction('add_weapon_module', { weaponKey: selectedWeaponToAdd, moduleId: newModule.id });
  };

  const removeWeaponModule = () => {
    if (!selectedModuleToRemove) return;

    // Find the weapon module being removed to check its ammunition type
    const moduleToRemove = dynamicWeaponModules.find(module => module.id === selectedModuleToRemove);

    if (moduleToRemove) {
      const ammoType = getAmmunitionType(moduleToRemove.weaponData);

      // Remove ammunition from torpedo bay if weapon uses it
      if (ammoType) {
        const weaponName = moduleToRemove.weaponData.name.toLowerCase();
        const weaponKey = moduleToRemove.weaponData.key.toLowerCase();

        setWeaponsState(prev => ({
          ...prev,
          weapons: {
            ...prev.weapons,
            torpedoes: {
              ...prev.weapons.torpedoes,
              // Remove proton torpedoes
              protonTorpedoes: ammoType === 'proton' ? 0 : prev.weapons.torpedoes.protonTorpedoes,
              maxProton: ammoType === 'proton' ? 0 : prev.weapons.torpedoes.maxProton,

              // Remove concussion missiles
              concussionMissiles: ammoType === 'concussion' ? 0 : prev.weapons.torpedoes.concussionMissiles,
              maxConcussion: ammoType === 'concussion' ? 0 : prev.weapons.torpedoes.maxConcussion,

              // Remove ion torpedoes
              ionTorpedoes: ammoType === 'ion' ? 0 : prev.weapons.torpedoes.ionTorpedoes,
              maxIon: ammoType === 'ion' ? 0 : prev.weapons.torpedoes.maxIon,

              // Remove rockets
              rockets: ammoType === 'rockets' ? 0 : prev.weapons.torpedoes.rockets,
              maxRockets: ammoType === 'rockets' ? 0 : prev.weapons.torpedoes.maxRockets
            }
          }
        }));
      }
    }

    setDynamicWeaponModules(prev => prev.filter(module => module.id !== selectedModuleToRemove));

    // Remove from module positions
    setModulePositions(prev => {
      const newPositions = { ...prev };
      delete newPositions[selectedModuleToRemove];
      return newPositions;
    });

    // Remove from drag state
    setDragState(prev => {
      const newState = { ...prev };
      delete newState[selectedModuleToRemove];
      return newState;
    });

    setSelectedModuleToRemove('');
    emitAction('remove_weapon_module', { moduleId: selectedModuleToRemove });
  };

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent, moduleId: string) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    setDragState(prev => ({
      ...prev,
      [moduleId]: {
        isDragging: true,
        dragOffset: { x: startX, y: startY },
        startPosition: { x: e.clientX, y: e.clientY }
      }
    }));

    // Bring to front
    const newZIndex = highestZIndex + 1;
    setHighestZIndex(newZIndex);
    setModulePositions(prev => ({
      ...prev,
      [moduleId]: { ...prev[moduleId], zIndex: newZIndex }
    }));
  }, [highestZIndex]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    Object.entries(dragState).forEach(([moduleId, state]) => {
      if (state.isDragging) {
        const newX = e.clientX - state.dragOffset.x;
        const newY = e.clientY - state.dragOffset.y;

        // Keep modules within screen bounds
        const boundedX = Math.max(0, Math.min(window.innerWidth - 300, newX));
        const boundedY = Math.max(0, Math.min(window.innerHeight - 200, newY));

        // Check if this is a dropdown panel or weapon module
        if (moduleId === 'addWeaponPanel' || moduleId === 'removeWeaponPanel') {
          setDropdownPositions(prev => ({
            ...prev,
            [moduleId]: { ...prev[moduleId], x: boundedX, y: boundedY }
          }));
        } else {
          setModulePositions(prev => ({
            ...prev,
            [moduleId]: { ...prev[moduleId], x: boundedX, y: boundedY }
          }));
        }
      }
    });
  }, [dragState]);

  const handleMouseUp = useCallback(() => {
    setDragState(prev => {
      const newState = { ...prev };
      Object.keys(newState).forEach(key => {
        newState[key] = { ...newState[key], isDragging: false };
      });
      return newState;
    });
  }, []);

  // Add global mouse event listeners
  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    const params = new URLSearchParams(window.location.search);
    const room = params.get('room') || 'default';

    newSocket.emit('join', { room, station: 'weapons' });

    newSocket.on('state_update', (state: WeaponsState) => {
      setWeaponsState(state);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Simulate weapon systems and targeting (shields and heat only)
  useEffect(() => {
    const interval = setInterval(() => {
      setWeaponsState(prev => {
        const newState = { ...prev };

        // Heat dissipation - gradual cooling based on current heat level
        const currentHeat = prev.weapons.heatLevel;
        let coolingRate = 1; // Base cooling rate

        // Cooling is faster when heat is higher (better heat sinks kick in)
        if (currentHeat > 80) {
          coolingRate = 4; // Emergency cooling systems
        } else if (currentHeat > 60) {
          coolingRate = 3; // Active cooling
        } else if (currentHeat > 30) {
          coolingRate = 2; // Normal cooling
        } else if (currentHeat > 10) {
          coolingRate = 1.5; // Passive cooling
        }

        newState.weapons.heatLevel = Math.max(0, currentHeat - coolingRate);

        // Shield regeneration
        if (!prev.shields.overload) {
          newState.shields.frontShield = Math.min(100, prev.shields.frontShield + prev.shields.regenerationRate);
          newState.shields.rearShield = Math.min(100, prev.shields.rearShield + prev.shields.regenerationRate);
          newState.shields.leftShield = Math.min(100, prev.shields.leftShield + prev.shields.regenerationRate);
          newState.shields.rightShield = Math.min(100, prev.shields.rightShield + prev.shields.regenerationRate);
        }

        return newState;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Clean charge recovery and cooling system
  useEffect(() => {
    console.log(' SETTING UP CHARGE RECOVERY SYSTEM');

    const chargeInterval = setInterval(() => {
      setDynamicWeaponModules(prev =>
        prev.map(module => {
          const newModule = { ...module };

          // Energy weapon charge recovery - TESTING with fast rate
          if (newModule.chargeLevel < 100) {
            const chargeRate = 2.0; // Fixed 2% per 100ms for testing visibility
            newModule.chargeLevel = Math.min(100, newModule.chargeLevel + chargeRate);

            console.log(` CHARGING: ${newModule.weaponData.name} ${newModule.chargeLevel.toFixed(1)}%`);

            // Update status when charging
            if (newModule.chargeLevel < 100 && newModule.status === 'ready') {
              newModule.status = 'charging';
            } else if (newModule.chargeLevel >= 100 && newModule.status === 'charging') {
              newModule.status = 'ready';
            }
          }

          // Heat dissipation
          if (newModule.heatLevel > 0) {
            const coolingAmount = newModule.coolingRate * 0.1; // 10% of cooling rate per 100ms
            newModule.heatLevel = Math.max(0, newModule.heatLevel - coolingAmount);

            // Update status based on heat
            if (newModule.heatLevel >= newModule.maxHeat * 0.9) {
              newModule.status = 'cooling';
            } else if (newModule.heatLevel < newModule.maxHeat * 0.5 && newModule.cooldown === 0) {
              newModule.status = newModule.chargeLevel >= 100 ? 'ready' : 'charging';
            }
          }

          // Cooldown reduction
          if (newModule.cooldown > 0) {
            newModule.cooldown = Math.max(0, newModule.cooldown - 0.1);
            if (newModule.cooldown === 0 && newModule.heatLevel < newModule.maxHeat * 0.9) {
              newModule.status = newModule.chargeLevel >= 100 ? 'ready' : 'charging';
            }
          }

          return newModule;
        })
      );

      // Unified cooling system for Primary and Secondary weapons + Global heat
      setWeaponsState(prev => {
        const newState = { ...prev };

        // Primary weapons cooling (cooldown only, no charge recovery)
        newState.weapons.primaryWeapons = prev.weapons.primaryWeapons.map(weapon => {
          const newWeapon = { ...weapon };

          // Cooldown reduction (0.1 per 100ms = 1 per second)
          if (newWeapon.cooldown > 0) {
            newWeapon.cooldown = Math.max(0, newWeapon.cooldown - 0.1);
            if (newWeapon.cooldown === 0 && newWeapon.status === 'cooling') {
              newWeapon.status = 'ready';
            }
          }

          return newWeapon;
        });

        // Secondary weapons cooling (cooldown only, no charge recovery)
        newState.weapons.secondaryWeapons = prev.weapons.secondaryWeapons.map(weapon => {
          const newWeapon = { ...weapon };

          // Cooldown reduction (0.1 per 100ms = 1 per second)
          if (newWeapon.cooldown > 0) {
            console.log(`🔧 Secondary Weapon ${newWeapon.name} cooling: ${newWeapon.cooldown.toFixed(1)} -> ${Math.max(0, newWeapon.cooldown - 0.1).toFixed(1)}`);
            newWeapon.cooldown = Math.max(0, newWeapon.cooldown - 0.1);
            if (newWeapon.cooldown === 0 && newWeapon.status === 'cooling') {
              console.log(`✅ Secondary Weapon ${newWeapon.name} ready!`);
              newWeapon.status = 'ready';
            }
          }

          return newWeapon;
        });

        // Global heat system cooling
        if (prev.weapons.heatLevel > 0.1) {
          const currentHeat = prev.weapons.heatLevel;
          let coolingRate = 1.0; // More aggressive base cooling rate

          // Much more aggressive graduated cooling based on heat level
          if (currentHeat > 80) {
            coolingRate = 4.0; // Emergency cooling
          } else if (currentHeat > 60) {
            coolingRate = 3.0; // Active cooling
          } else if (currentHeat > 30) {
            coolingRate = 2.0; // Normal cooling
          } else if (currentHeat > 10) {
            coolingRate = 1.5; // Passive cooling
          }

          newState.weapons.heatLevel = Math.max(0, currentHeat - coolingRate);
        }

        return newState;
      });
    }, 100); // Update every 100ms for very smooth and visible cooling

    return () => clearInterval(chargeInterval);
  }, []);

  const enableAudio = () => {
    if (!audioEnabled) {
      setAudioEnabled(true);
    }
  };

  const emitAction = (action: string, value?: any) => {
    if (socket) {
      const params = new URLSearchParams(window.location.search);
      const room = params.get('room') || 'default';
      socket.emit('player_action', { room, action, value });
    }
  };

  const firePrimaryWeapons = () => {
    if (weaponsState.targeting.currentTarget && weaponsState.targeting.lockStatus === 'locked') {
      setWeaponsState(prev => ({
        ...prev,
        weapons: {
          ...prev.weapons,
          primaryWeapons: prev.weapons.primaryWeapons.map(weapon => ({
            ...weapon,
            cooldown: 3,
            status: 'cooling'
          })),
          heatLevel: Math.min(100, prev.weapons.heatLevel + 15)
        }
      }));

      emitAction('fire_primary_weapons', { targetId: weaponsState.targeting.currentTarget.id });

      if (audioRef.current) {
        audioRef.current.play().catch(e => console.log('Audio play failed:', e));
      }
    }
  };

  const fireSecondaryWeapons = () => {
    if (weaponsState.targeting.currentTarget && weaponsState.targeting.lockStatus === 'locked') {
      setWeaponsState(prev => ({
        ...prev,
        weapons: {
          ...prev.weapons,
          secondaryWeapons: prev.weapons.secondaryWeapons.map(weapon => ({
            ...weapon,
            cooldown: 5,
            ammunition: Math.max(0, weapon.ammunition - 1),
            status: 'cooling'
          })),
          heatLevel: Math.min(100, prev.weapons.heatLevel + 25)
        }
      }));

      emitAction('fire_secondary_weapons', { targetId: weaponsState.targeting.currentTarget.id });
    }
  };

  const fireTorpedo = () => {
    const torpedoType = weaponsState.weapons.torpedoes.selectedType;
    let currentCount: number;
    let updateKey: string;

    // Handle different ordnance types with proper naming
    if (torpedoType === 'rockets') {
      currentCount = weaponsState.weapons.torpedoes.rockets;
      updateKey = 'rockets';
    } else {
      currentCount = weaponsState.weapons.torpedoes[`${torpedoType}Torpedoes` as keyof TorpedoSystem] as number;
      updateKey = `${torpedoType}Torpedoes`;
    }

    if (currentCount > 0 && weaponsState.targeting.currentTarget) {
      setWeaponsState(prev => ({
        ...prev,
        weapons: {
          ...prev.weapons,
          torpedoes: {
            ...prev.weapons.torpedoes,
            [updateKey]: currentCount - 1
          }
        }
      }));

      emitAction('fire_torpedo', {
        type: torpedoType,
        targetId: weaponsState.targeting.currentTarget.id
      });
    }
  };

  const acquireTarget = (target: Target) => {
    setWeaponsState(prev => ({
      ...prev,
      targeting: {
        ...prev.targeting,
        currentTarget: target,
        lockStatus: 'acquiring',
        lockStrength: 0
      }
    }));

    // Simulate lock acquisition
    setTimeout(() => {
      setWeaponsState(prev => ({
        ...prev,
        targeting: {
          ...prev.targeting,
          lockStatus: 'locked',
          lockStrength: 100
        }
      }));
    }, 2000);

    emitAction('acquire_target', { targetId: target.id });
  };

  const toggleShieldBalance = () => {
    const balances: WeaponsState['shields']['shieldBalance'][] = ['balanced', 'forward', 'aft', 'port', 'starboard'];
    const currentIndex = balances.indexOf(weaponsState.shields.shieldBalance);
    const nextBalance = balances[(currentIndex + 1) % balances.length];

    setWeaponsState(prev => ({
      ...prev,
      shields: {
        ...prev.shields,
        shieldBalance: nextBalance
      }
    }));

    emitAction('adjust_shields', { balance: nextBalance });
  };

  return (
    <Container onClick={enableAudio}>
      <StationHeader>WEAPONS CONTROL</StationHeader>

      {/* Collapsible and Draggable Weapon Management Dropdowns */}

      {/* Add Weapon Module Dropdown */}
      <DraggableDropdownPanel
        $position={dropdownPositions.addWeaponPanel}
        $isDragging={dragState.addWeaponPanel?.isDragging || false}
        $isCollapsed={dropdownCollapsed.addWeaponPanel}
      >
        <ModuleWrapper>
          <DragHandle onMouseDown={(e) => handleDropdownMouseDown(e, 'addWeaponPanel')} />
          <DropdownPanel $isCollapsed={dropdownCollapsed.addWeaponPanel}>
            {dropdownCollapsed.addWeaponPanel ? (
              <CollapsedIcon
                onClick={() => toggleDropdownCollapse('addWeaponPanel')}
                onMouseDown={(e) => handleDropdownMouseDown(e, 'addWeaponPanel')}
              >
                ⚡
              </CollapsedIcon>
            ) : (
              <>
                <DropdownHeader onMouseDown={(e) => handleDropdownMouseDown(e, 'addWeaponPanel')}>
                  <DropdownLabel style={{ margin: 0 }}>Add Weapon Module</DropdownLabel>
                  <CollapseButton onClick={() => toggleDropdownCollapse('addWeaponPanel')}>
                    ▲
                  </CollapseButton>
                </DropdownHeader>

                <DropdownContent $isCollapsed={dropdownCollapsed.addWeaponPanel}>
                  <WeaponSelect
                    value={selectedWeaponToAdd}
                    onChange={(e) => setSelectedWeaponToAdd(e.target.value)}
                  >
                    <option value="">Select a weapon to add...</option>
                    {UNIQUE_WEAPONS.map(weapon => (
                      <option key={weapon.key} value={weapon.key}>
                        {weapon.name} ({weapon.key}) - DMG: {weapon.damage}
                      </option>
                    ))}
                  </WeaponSelect>
                  <AddButton
                    onClick={addWeaponModule}
                    disabled={!selectedWeaponToAdd}
                  >
                    ⚡ Add Weapon Module
                  </AddButton>
                </DropdownContent>
              </>
            )}
          </DropdownPanel>
        </ModuleWrapper>
      </DraggableDropdownPanel>

      {/* Remove Weapon Module Dropdown */}
      <DraggableDropdownPanel
        $position={dropdownPositions.removeWeaponPanel}
        $isDragging={dragState.removeWeaponPanel?.isDragging || false}
        $isCollapsed={dropdownCollapsed.removeWeaponPanel}
      >
        <ModuleWrapper>
          <DragHandle onMouseDown={(e) => handleDropdownMouseDown(e, 'removeWeaponPanel')} />
          <DropdownPanel $isCollapsed={dropdownCollapsed.removeWeaponPanel}>
            {dropdownCollapsed.removeWeaponPanel ? (
              <CollapsedIcon onClick={() => toggleDropdownCollapse('removeWeaponPanel')}>
                🗑️
              </CollapsedIcon>
            ) : (
              <>
                <DropdownHeader onMouseDown={(e) => handleDropdownMouseDown(e, 'removeWeaponPanel')}>
                  <DropdownLabel style={{ margin: 0 }}>Remove Weapon Module</DropdownLabel>
                  <CollapseButton onClick={() => toggleDropdownCollapse('removeWeaponPanel')}>
                    ▲
                  </CollapseButton>
                </DropdownHeader>

                <DropdownContent $isCollapsed={dropdownCollapsed.removeWeaponPanel}>
                  <WeaponSelect
                    value={selectedModuleToRemove}
                    onChange={(e) => setSelectedModuleToRemove(e.target.value)}
                  >
                    <option value="">Select a module to remove...</option>
                    {dynamicWeaponModules.map(module => (
                      <option key={module.id} value={module.id}>
                        {module.weaponData.name} ({module.weaponKey})
                      </option>
                    ))}
                  </WeaponSelect>
                  <RemoveButton
                    onClick={removeWeaponModule}
                    disabled={!selectedModuleToRemove}
                  >
                    🗑️ Remove Module
                  </RemoveButton>

                  <div style={{ margin: '15px 0', borderTop: '1px solid var(--weapon-blue)', paddingTop: '15px' }}>
                    <DropdownLabel style={{ fontSize: '0.8em', color: 'var(--weapon-orange)' }}>
                      Clear Assigned Weapons
                    </DropdownLabel>
                    <RemoveButton
                      onClick={clearAllAssignedWeapons}
                      style={{
                        background: 'var(--weapon-red)',
                        fontSize: '0.9em',
                        padding: '8px'
                      }}
                    >
                      💥 CLEAR ALL PRIMARY & SECONDARY
                    </RemoveButton>
                  </div>
                </DropdownContent>
              </>
            )}
          </DropdownPanel>
        </ModuleWrapper>
      </DraggableDropdownPanel>

      {/* Dynamic Weapon Modules */}
      {dynamicWeaponModules.map(module => (
        <DraggableModule
          key={module.id}
          $position={modulePositions[module.id] || module.position}
          $isDragging={dragState[module.id]?.isDragging || false}
        >
          <ModuleWrapper>
            <DragHandle onMouseDown={(e) => handleMouseDown(e, module.id)} />
            <WeaponCard $status={module.status}>
              <h3>{module.weaponData.name}</h3>
              <div style={{ fontSize: '0.8em', color: 'var(--weapon-blue)', marginBottom: '10px' }}>
                {module.weaponKey} | {module.weaponData.type}
              </div>

              <WeaponStatus $status={module.status}>
                {module.status.toUpperCase()}
              </WeaponStatus>

              {/* Ammunition Status for Torpedo Bay Weapons - Only show when ammo > 0 */}
              {(() => {
                const ammoType = getAmmunitionType(module.weaponData);
                if (ammoType) {
                  const currentAmmo = getCurrentAmmoCount(ammoType);

                  // Only show ammunition status if quantity is more than 0
                  if (currentAmmo > 0) {
                    const ammoName = ammoType === 'proton' ? 'Proton Torpedoes' :
                      ammoType === 'concussion' ? 'Concussion Missiles' :
                        ammoType === 'ion' ? 'Ion Torpedoes' :
                          'Rockets';

                    return (
                      <div style={{
                        marginBottom: '10px',
                        padding: '8px',
                        backgroundColor: 'rgba(0, 212, 255, 0.1)',
                        border: '1px solid var(--weapon-blue)',
                        borderRadius: '4px'
                      }}>
                        <div style={{
                          fontSize: '0.8em',
                          color: 'var(--weapon-blue)',
                          fontWeight: 'bold'
                        }}>
                          {ammoName}: {currentAmmo}
                        </div>
                      </div>
                    );
                  }
                }
                return null;
              })()}

              {/* Individual Weapon Heat Display */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '0.8em' }}>
                  <span>Heat Level:</span>
                  <span style={{
                    color: module.heatLevel >= module.maxHeat * 0.9 ? 'var(--weapon-red)' :
                      module.heatLevel >= module.maxHeat * 0.7 ? 'var(--weapon-orange)' :
                        module.heatLevel >= module.maxHeat * 0.5 ? 'var(--weapon-yellow)' :
                          'var(--weapon-green)',
                    fontWeight: module.heatLevel >= module.maxHeat * 0.9 ? 'bold' : 'normal',
                    fontFamily: 'monospace' // Use monospace to prevent number width changes
                  }}>
                    {module.heatLevel.toFixed(1)}/{module.maxHeat}
                    {module.heatLevel >= module.maxHeat * 0.9 && ' 🔥'}
                    {module.heatLevel > 0 && module.heatLevel < module.maxHeat * 0.9 && ' ❄️'}
                  </span>
                </div>
                <ChargeBar $level={module.heatLevel} $maxLevel={module.maxHeat} />
                {module.heatLevel >= module.maxHeat * 0.9 && (
                  <OverheatingText>
                    OVERHEATING
                  </OverheatingText>
                )}
              </div>

              <div style={{ fontSize: '0.9em', color: '#ccc', marginBottom: '10px' }}>
                <div>Damage: {module.weaponData.damage} | Critical: {module.weaponData.critical}</div>
                <div>Range: {module.weaponData.range} | Cooling: {module.coolingRate}/sec</div>
                {module.ammunition !== -1 && (
                  <div>Ammo: {module.ammunition}/{module.maxAmmo}</div>
                )}
              </div>

              {module.weaponData.qualities.length > 0 && (
                <div style={{ fontSize: '0.8em', color: 'var(--weapon-yellow)', marginBottom: '10px' }}>
                  <strong>Qualities:</strong> {module.weaponData.qualities.join(', ')}
                </div>
              )}

              {module.weaponData.price && (
                <div style={{ fontSize: '0.8em', color: 'var(--weapon-green)' }}>
                  Price: {module.weaponData.price.toLocaleString()} credits
                  {module.weaponData.restricted && (
                    <span style={{ color: 'var(--weapon-red)', marginLeft: '10px' }}>RESTRICTED</span>
                  )}
                </div>
              )}

              <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
                <FireButton
                  $variant="primary"
                  onClick={() => {
                    const ammoType = getAmmunitionType(module.weaponData);
                    const hasAmmo = ammoType ? getCurrentAmmoCount(ammoType) > 0 : true;

                    if (module.status === 'ready' && module.heatLevel < module.maxHeat * 0.9 && hasAmmo) {
                      const heatGenerated = calculateWeaponHeat(module.weaponData);

                      setDynamicWeaponModules(prev =>
                        prev.map(m => m.id === module.id ? {
                          ...m,
                          status: 'cooling',
                          cooldown: 3,
                          chargeLevel: Math.max(0, m.chargeLevel - 20),
                          heatLevel: Math.min(m.maxHeat, m.heatLevel + heatGenerated)
                        } : m)
                      );

                      // Consume ammunition from torpedo bay if weapon uses it
                      if (ammoType) {
                        setWeaponsState(prev => ({
                          ...prev,
                          weapons: {
                            ...prev.weapons,
                            torpedoes: {
                              ...prev.weapons.torpedoes,
                              protonTorpedoes: ammoType === 'proton' ?
                                Math.max(0, prev.weapons.torpedoes.protonTorpedoes - 1) :
                                prev.weapons.torpedoes.protonTorpedoes,
                              concussionMissiles: ammoType === 'concussion' ?
                                Math.max(0, prev.weapons.torpedoes.concussionMissiles - 1) :
                                prev.weapons.torpedoes.concussionMissiles,
                              ionTorpedoes: ammoType === 'ion' ?
                                Math.max(0, prev.weapons.torpedoes.ionTorpedoes - 1) :
                                prev.weapons.torpedoes.ionTorpedoes,
                              rockets: ammoType === 'rockets' ?
                                Math.max(0, prev.weapons.torpedoes.rockets - 1) :
                                prev.weapons.torpedoes.rockets
                            },
                            heatLevel: Math.min(100, prev.weapons.heatLevel + Math.floor(heatGenerated * 0.3))
                          }
                        }));
                      } else {
                        // Add minimal heat to the global weapons system (heat from firing energy weapons)
                        const globalHeatContribution = Math.floor(heatGenerated * 0.3);
                        setWeaponsState(prev => ({
                          ...prev,
                          weapons: {
                            ...prev.weapons,
                            heatLevel: Math.min(100, prev.weapons.heatLevel + globalHeatContribution)
                          }
                        }));
                      }

                      // Create projectile effect
                      createProjectileEffect(module.weaponData.name, module.weaponData.type);

                      emitAction('fire_dynamic_weapon', { moduleId: module.id, weaponKey: module.weaponKey });
                    }
                  }}
                  disabled={(() => {
                    const ammoType = getAmmunitionType(module.weaponData);
                    const outOfAmmo = ammoType ? getCurrentAmmoCount(ammoType) === 0 : false;

                    return (
                      module.status !== 'ready' ||
                      module.heatLevel >= module.maxHeat * 0.9 ||
                      outOfAmmo
                    );
                  })()}
                  style={{ fontSize: '0.8em', padding: '8px 12px' }}
                >
                  🔥 FIRE
                </FireButton>

                {module.ammunition !== -1 && (
                  <FireButton
                    $variant="secondary"
                    onClick={() => {
                      setDynamicWeaponModules(prev =>
                        prev.map(m => m.id === module.id ?
                          { ...m, ammunition: m.maxAmmo } : m
                        )
                      );
                      emitAction('reload_weapon', { moduleId: module.id });
                    }}
                    disabled={module.ammunition === module.maxAmmo}
                    style={{ fontSize: '0.8em', padding: '8px 12px' }}
                  >
                    🔄 RELOAD
                  </FireButton>
                )}
              </div>

              {/* Assignment Buttons */}
              <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <FireButton
                  $variant="primary"
                  onClick={() => assignToPrimaryWeapons(module.id)}
                  style={{ fontSize: '0.7em', padding: '6px 10px', flex: '1' }}
                >
                  ➤ PRIMARY
                </FireButton>
                <FireButton
                  $variant="secondary"
                  onClick={() => assignToSecondaryWeapons(module.id)}
                  style={{ fontSize: '0.7em', padding: '6px 10px', flex: '1' }}
                >
                  ➤ SECONDARY
                </FireButton>
              </div>
            </WeaponCard>
          </ModuleWrapper>
        </DraggableModule>
      ))}

      {/* Draggable Primary Weapons Module */}
      <DraggableModule
        $position={modulePositions.primaryWeapons}
        $isDragging={dragState.primaryWeapons?.isDragging || false}
      >
        <ModuleWrapper>
          <DragHandle onMouseDown={(e) => handleMouseDown(e, 'primaryWeapons')} />
          <WeaponCard>
            <h3>Primary Weapons</h3>
            {weaponsState.weapons.primaryWeapons.map(weapon => (
              <div key={weapon.id} style={{ marginBottom: '15px' }}>
                <div style={{ color: 'var(--weapon-green)', fontWeight: 'bold' }}>
                  {weapon.name}
                </div>
                <WeaponStatus $status={weapon.status}>
                  {weapon.status.toUpperCase()}
                </WeaponStatus>
                <ChargeBar $level={weapon.cooldown > 0 ? (3 - weapon.cooldown) / 3 * 100 : 100} $maxLevel={100} />
                <div style={{ fontSize: '0.9em', color: '#ccc', marginBottom: '10px' }}>
                  Damage: {weapon.damage} | Range: {weapon.range}m | Accuracy: {weapon.accuracy}%
                </div>
                <FireButton
                  $variant="primary"
                  onClick={() => firePrimaryWeapon(weapon.id)}
                  disabled={weapon.status !== 'ready' || (weapon.ammunition !== -1 && weapon.ammunition <= 0)}
                  style={{ fontSize: '0.8em', padding: '6px 12px', width: '100%' }}
                >
                  🔥 FIRE PRIMARY
                </FireButton>
              </div>
            ))}
          </WeaponCard>
        </ModuleWrapper>
      </DraggableModule>

      {/* Draggable Secondary Weapons Module */}
      <DraggableModule
        $position={modulePositions.secondaryWeapons}
        $isDragging={dragState.secondaryWeapons?.isDragging || false}
      >
        <ModuleWrapper>
          <DragHandle onMouseDown={(e) => handleMouseDown(e, 'secondaryWeapons')} />
          <WeaponCard>
            <h3>Secondary Weapons</h3>
            {weaponsState.weapons.secondaryWeapons.map(weapon => (
              <div key={weapon.id} style={{ marginBottom: '15px' }}>
                <div style={{ color: 'var(--weapon-yellow)', fontWeight: 'bold' }}>
                  {weapon.name}
                </div>
                <WeaponStatus $status={weapon.status}>
                  {weapon.status.toUpperCase()}
                </WeaponStatus>
                <ChargeBar $level={weapon.cooldown > 0 ? (3 - weapon.cooldown) / 3 * 100 : 100} $maxLevel={100} />
                <div style={{ fontSize: '0.9em', color: '#ccc', marginBottom: '10px' }}>
                  Ammo: {weapon.ammunition}/{weapon.maxAmmo}
                </div>
                <FireButton
                  $variant="secondary"
                  onClick={() => fireSecondaryWeapon(weapon.id)}
                  disabled={weapon.status !== 'ready' || (weapon.ammunition !== -1 && weapon.ammunition <= 0)}
                  style={{ fontSize: '0.8em', padding: '6px 12px', width: '100%' }}
                >
                  🔥 FIRE SECONDARY
                </FireButton>
              </div>
            ))}
          </WeaponCard>
        </ModuleWrapper>
      </DraggableModule>

      {/* Draggable Torpedo Panel Module */}
      <DraggableModule
        $position={modulePositions.torpedoPanel}
        $isDragging={dragState.torpedoPanel?.isDragging || false}
      >
        <ModuleWrapper>
          <DragHandle onMouseDown={(e) => handleMouseDown(e, 'torpedoPanel')} />
          <TorpedoPanel>
            <h3>Torpedo Bay</h3>
            {weaponsState.weapons.torpedoes.maxProton > 0 && (
              <TorpedoCount>
                <span className="type">Proton Torpedoes:</span>
                <span className="count">{weaponsState.weapons.torpedoes.protonTorpedoes}/{weaponsState.weapons.torpedoes.maxProton}</span>
              </TorpedoCount>
            )}
            {weaponsState.weapons.torpedoes.maxConcussion > 0 && (
              <TorpedoCount>
                <span className="type">Concussion Missiles:</span>
                <span className="count">{weaponsState.weapons.torpedoes.concussionMissiles}/{weaponsState.weapons.torpedoes.maxConcussion}</span>
              </TorpedoCount>
            )}
            {weaponsState.weapons.torpedoes.maxIon > 0 && (
              <TorpedoCount>
                <span className="type">Ion Torpedoes:</span>
                <span className="count">{weaponsState.weapons.torpedoes.ionTorpedoes}/{weaponsState.weapons.torpedoes.maxIon}</span>
              </TorpedoCount>
            )}
            {weaponsState.weapons.torpedoes.maxRockets > 0 && (
              <TorpedoCount>
                <span className="type">Rockets:</span>
                <span className="count">{weaponsState.weapons.torpedoes.rockets}/{weaponsState.weapons.torpedoes.maxRockets}</span>
              </TorpedoCount>
            )}
          </TorpedoPanel>
        </ModuleWrapper>
      </DraggableModule>

      {/* Draggable Targeting Display Module */}
      <DraggableModule
        $position={modulePositions.targetingDisplay}
        $isDragging={dragState.targetingDisplay?.isDragging || false}
      >
        <ModuleWrapper>
          <DragHandle onMouseDown={(e) => handleMouseDown(e, 'targetingDisplay')} />
          <div style={{
            background: 'var(--panel-bg)',
            padding: '20px',
            borderRadius: '12px',
            border: '2px solid var(--weapon-blue)'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: 'var(--weapon-blue)', margin: '0 0 10px 0' }}>
                TARGETING SYSTEM
              </h3>
              <div style={{ color: 'var(--weapon-yellow)' }}>
                {weaponsState.targeting.currentTarget ?
                  `Target: ${weaponsState.targeting.currentTarget.classification}` :
                  'No Target Selected'
                }
              </div>
              <div style={{ color: weaponsState.targeting.lockStatus === 'locked' ? 'var(--weapon-green)' : 'var(--weapon-orange)' }}>
                Lock Status: {weaponsState.targeting.lockStatus.toUpperCase()}
              </div>
            </div>

            <TargetingDisplay>
              <RadarSweep $scanning={weaponsState.targeting.scanMode === 'active'} />

              {/* Range rings */}
              {[25, 50, 75].map(radius => (
                <div
                  key={radius}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: `${radius * 2}%`,
                    height: `${radius * 2}%`,
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)'
                  }}
                />
              ))}

              {/* Target blips */}
              {weaponsState.targeting.availableTargets.map(target => {
                const angle = (target.bearing * Math.PI) / 180;
                const distance = Math.min(target.distance / weaponsState.targeting.scanRange, 1);
                const x = 50 + (distance * 40 * Math.cos(angle));
                const y = 50 + (distance * 40 * Math.sin(angle));

                return (
                  <TargetBlip
                    key={target.id}
                    x={x}
                    y={y}
                    threat={target.threat}
                    onClick={() => acquireTarget(target)}
                    style={{ cursor: 'pointer' }}
                  />
                );
              })}

              {/* Projectile effects */}
              {activeProjectiles.map(projectile => {
                switch (projectile.type) {
                  case 'beam':
                    return <BeamEffect key={projectile.id} $angle={projectile.angle} />;
                  case 'missile':
                    return <MissileEffect key={projectile.id} $angle={projectile.angle} />;
                  case 'grenade':
                    return <GrenadeEffect key={projectile.id} $angle={projectile.angle} />;
                  case 'torpedo':
                    return <TorpedoEffect key={projectile.id} $angle={projectile.angle} />;
                  default:
                    return null;
                }
              })}

              {/* Current target indicator */}
              {weaponsState.targeting.currentTarget && (
                <AlertIndicator />
              )}
            </TargetingDisplay>

            {weaponsState.targeting.currentTarget && (
              <div style={{
                background: 'rgba(0, 0, 0, 0.5)',
                padding: '15px',
                borderRadius: '8px',
                border: '2px solid var(--weapon-blue)',
                marginTop: '20px'
              }}>
                <h4 style={{ color: 'var(--weapon-blue)', margin: '0 0 10px 0' }}>
                  Target Information
                </h4>
                <div style={{ fontSize: '0.9em', lineHeight: '1.4' }}>
                  <div>Classification: {weaponsState.targeting.currentTarget.classification}</div>
                  <div>Distance: {weaponsState.targeting.currentTarget.distance.toFixed(0)}m</div>
                  <div>Bearing: {weaponsState.targeting.currentTarget.bearing.toFixed(0)}°</div>
                  <div>Size: {weaponsState.targeting.currentTarget.size}</div>
                  <div style={{ color: weaponsState.targeting.currentTarget.threat === 'critical' ? 'var(--weapon-red)' : 'var(--weapon-yellow)' }}>
                    Threat Level: {weaponsState.targeting.currentTarget.threat.toUpperCase()}
                  </div>
                  <div>Hull: {weaponsState.targeting.currentTarget.hull}%</div>
                  <div>Shields: {weaponsState.targeting.currentTarget.shields}%</div>
                </div>
              </div>
            )}
          </div>
        </ModuleWrapper>
      </DraggableModule>

      {/* Draggable Shield Display Module */}
      <DraggableModule
        $position={modulePositions.shieldDisplay}
        $isDragging={dragState.shieldDisplay?.isDragging || false}
      >
        <ModuleWrapper>
          <DragHandle onMouseDown={(e) => handleMouseDown(e, 'shieldDisplay')} />
          <WeaponCard>
            <h3>Shield Status</h3>
            <ShieldDisplay>
              <ShieldSection $strength={weaponsState.shields.frontShield} $position="front" />
              <ShieldSection $strength={weaponsState.shields.rearShield} $position="rear" />
              <ShieldSection $strength={weaponsState.shields.leftShield} $position="left" />
              <ShieldSection $strength={weaponsState.shields.rightShield} $position="right" />

              <div style={{ textAlign: 'center', color: 'var(--shield-blue)' }}>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                  {weaponsState.shields.shieldBalance.toUpperCase()}
                </div>
                <div style={{ fontSize: '0.9em' }}>
                  Regen: {weaponsState.shields.regenerationRate}/sec
                </div>
              </div>
            </ShieldDisplay>

            <FireButton onClick={toggleShieldBalance} style={{ marginTop: '15px', width: '100%' }}>
              Adjust Shield Balance
            </FireButton>
          </WeaponCard>
        </ModuleWrapper>
      </DraggableModule>

      {/* Draggable System Status Module */}
      <DraggableModule
        $position={modulePositions.systemStatus}
        $isDragging={dragState.systemStatus?.isDragging || false}
      >
        <ModuleWrapper>
          <DragHandle onMouseDown={(e) => handleMouseDown(e, 'systemStatus')} />
          <WeaponCard>
            <h3>System Status</h3>
            <div style={{ marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Weapon Power:</span>
                <span style={{ color: 'var(--weapon-green)' }}>{weaponsState.weapons.powerLevel}%</span>
              </div>
              <ChargeBar $level={weaponsState.weapons.powerLevel} $maxLevel={100} />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Heat Level:</span>
                <span style={{
                  color: weaponsState.weapons.heatLevel >= 95 ? 'var(--weapon-red)' :
                    weaponsState.weapons.heatLevel > 75 ? 'var(--weapon-orange)' :
                      weaponsState.weapons.heatLevel > 50 ? 'var(--weapon-yellow)' :
                        'var(--weapon-green)',
                  fontWeight: weaponsState.weapons.heatLevel >= 95 ? 'bold' : 'normal'
                }}>
                  {Math.round(weaponsState.weapons.heatLevel)}%
                  {weaponsState.weapons.heatLevel >= 95 && ' ⚠️ CRITICAL'}
                  {weaponsState.weapons.heatLevel >= 80 && weaponsState.weapons.heatLevel < 95 && ' ⚠️ HIGH'}
                </span>
              </div>
              <ChargeBar $level={weaponsState.weapons.heatLevel} $maxLevel={100} />
              {weaponsState.weapons.heatLevel >= 95 && (
                <SystemOverheatedText>
                  WEAPONS OVERHEATED - COOLING DOWN
                </SystemOverheatedText>
              )}
            </div>

            <div style={{ color: 'var(--weapon-blue)', textAlign: 'center', marginTop: '20px' }}>
              Combat Status: <span style={{
                color: weaponsState.combatStatus === 'engaged' ? 'var(--weapon-red)' : 'var(--weapon-yellow)'
              }}>
                {weaponsState.combatStatus.toUpperCase()}
              </span>
            </div>
          </WeaponCard>
        </ModuleWrapper>
      </DraggableModule>



      {/* Hidden audio element */}
      <audio ref={audioRef} preload="auto">
        <source src="/sounds/laser.mp3" type="audio/mpeg" />
      </audio>
    </Container>
  );
};

export default WeaponsStation;