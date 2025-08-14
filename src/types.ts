// Game state types
// Engineering-specific types
export interface RepairTask {
  id: string;
  systemName: string;
  damageType: 'minor' | 'major' | 'critical';
  difficulty: number;
  timeRequired: number;
  progress: number;
  assignedCrew: number;
  juryRigged: boolean;
}

export interface SystemBoost {
  id: string;
  systemName: string;
  boostType: 'performance' | 'efficiency' | 'output';
  magnitude: number;
  duration: number;
  strainCost: number;
  timeRemaining: number;
}

export interface SystemStatus {
  health: number; // 0-100
  efficiency: number; // 0-100
  strain: number; // 0-100
  damaged: boolean;
  criticalDamage: boolean;
  repairProgress?: number;
}

export interface GameState {
  communications?: {
    signalStrength: number;
    interference: number;
    primaryFrequency: number;
    emergencyBeacon: boolean;
    analysisMode?: string;
  };
  engineering?: {
    powerDistribution: {
      totalPower: number;
      reactorOutput: number;
      emergencyPower: boolean;
      powerAllocations: {
        weapons: number;
        shields: number;
        engines: number;
        sensors: number;
        lifeSupport: number;
        communications: number;
      };
    };
    systemStatus: {
      [systemName: string]: SystemStatus;
    };
    repairQueue: RepairTask[];
    activeBoosts: SystemBoost[];
    emergencyProcedures: {
      emergencyPowerActive: boolean;
      emergencyShutdownActive: boolean;
      lifeSupportPriority: boolean;
    };
  };
  pilot?: {
    heading: { x: number; y: number };
    speed: number;
    altitude: number;
    hyperdriveStatus: 'ready' | 'charging' | 'jumping' | 'cooldown';
  };
  weapons?: {
    targeting: {
      currentTarget: string | null;
      availableTargets: Array<{
        id: string;
        x: number;
        y: number;
        speed: number;
        size: number;
        heading: number;
      }>;
      lockStatus: 'none' | 'acquiring' | 'locked' | 'lost';
    };
    shields: {
      front: number;
      rear: number;
      left: number;
      right: number;
    };
    weaponsOnline: boolean;
  };
}

export interface User {
  station: string;
  name: string;
  socketId: string;
}