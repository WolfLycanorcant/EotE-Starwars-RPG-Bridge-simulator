// Game state types
export interface GameState {
  communications?: {
    signalStrength: number;
    interference: number;
    primaryFrequency: number;
    emergencyBeacon: boolean;
    analysisMode?: string;
  };
  engineering?: {
    repairQueue: any;
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
  };
  pilot?: {
    heading: { x: number; y: number };
    speed: number;
    altitude: number;
    hyperdriveStatus: 'ready' | 'charging' | 'jumping' | 'cooldown';
  };
  weapons?: {
    targeting: {
      currentTarget: any;
      availableTargets: any[];
      lockStatus: 'none' | 'acquiring' | 'locked' | 'lost';
    };
    shields: {
      frontShield: number;
      rearShield: number;
      leftShield: number;
      rightShield: number;
    };
  };
}

export interface User {
  station: string;
  name: string;
  socketId: string;
}