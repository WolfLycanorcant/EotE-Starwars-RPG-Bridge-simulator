import React, { useEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import { io, Socket } from 'socket.io-client';
import { GameState } from '../types';

// Module-level variable for star animation offset
let gmStarOffset = 0;

/* ---------- TYPES ---------- */
type StationName = 'communications' | 'navigation' | 'weapons' | 'engineering';

interface GlobalGameState {
  communications: any;
  navigation: any;
  weapons: any;
  engineering: any;
}

interface FrequencyMacro {
  id: string;
  name: string;
  frequency: number;
  description: string;
  color: string;
}

interface SignalAnalysisOption {
  id: string;
  name: string;
  description: string;
  effect: string;
}

interface CommunicationMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: Date;
  priority: 'low' | 'normal' | 'high' | 'emergency';
  frequency: number;
  onAir?: string;
}

const initialGlobalState: GlobalGameState = {
  communications: null,
  navigation: null,
  weapons: null,
  engineering: null,
};

// Add pilot state interface for GM monitoring - matches Navigation Station
interface PilotState {
  heading: {
    x: number;
    y: number;
  };
  speed: number;
  altitude: number;
  alert: string;
  hyperdriveStatus: 'ready' | 'charging' | 'jumping' | 'cooldown';
  fuelLevel: number;
  shieldStatus: number;
  engineTemp: number;
  navigationComputer: {
    targetSystem: string;
    jumpDistance: number;
    eta: number;
  };
  autopilot: boolean;
  emergencyPower: boolean;
  hypermatter: {
    current: number;
    maximum: number;
    consumptionRate: number; // units per hour
  };
  jumpPlanning: {
    duration: number; // hours
    hypermatterRequired: number;
    isPlanning: boolean;
  };
  asteroidField: {
    asteroids: Array<{
      id: number;
      x: number;
      y: number;
      size: number;
      speed: number;
      angle: number;
    }>;
    enemyShips?: Array<{
      id: number;
      x: number;
      y: number;
      size: number;
      speed: number;
      angle: number;
    }>;
    gameActive: boolean;
    score: number;
    environmentalHazard: {
      type: 'none' | 'asteroid_field' | 'gravity_well' | 'ion_storm' | 'solar_flare';
      intensity: string;
      active: boolean;
    };

  };
};

/* ---------- ANIMATIONS ---------- */

/* ---------- STYLES ---------- */
const Container = styled.div`
  background: #0a0a0a;
  color: #eee;
  font-family: 'Orbitron', 'Courier New', monospace;
  height: 100vh;
  padding: 20px;
  overflow-y: auto;
  overflow-x: hidden;
  --gm-green: #00ff88;
  --gm-red: #ff0040;
  --gm-yellow: #ffd700;
  --gm-blue: #0088ff;
  
  /* Custom scrollbar styling */
  &::-webkit-scrollbar {
    width: 12px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--gm-blue);
    border-radius: 6px;
    border: 2px solid rgba(0, 0, 0, 0.3);
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: var(--gm-green);
  }
`;

const Header = styled.h1`
  text-align: center;
  font-size: 2.5rem;
  margin-bottom: 25px;
  color: var(--gm-green);
  text-shadow: 0 0 15px var(--gm-green);
  letter-spacing: 4px;
`;

const PanelsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 25px;
`;

const Panel = styled.div<{ collapsed?: boolean }>`
  background: rgba(20, 20, 20, 0.85);
  border: 2px solid var(--gm-blue);
  border-radius: 10px;
  padding: ${(p) => (p.collapsed ? '10px' : '15px')};
  position: relative;
  transition: all 0.3s ease;
  max-height: ${(p) => (p.collapsed ? '50px' : 'none')};
  overflow: hidden;
`;

const PanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  cursor: pointer;
`;

const PanelTitle = styled.h3`
  margin: 0;
  color: var(--gm-green);
  font-size: 1.2rem;
  letter-spacing: 1px;
`;

const CollapseBtn = styled.button`
  background: none;
  border: none;
  color: var(--gm-yellow);
  font-size: 1rem;
  cursor: pointer;
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 0.9rem;
`;

const EmitButton = styled.button`
  background: rgba(0, 255, 136, 0.1);
  border: 1px solid var(--gm-green);
  color: var(--gm-green);
  padding: 6px 10px;
  margin: 4px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.2s ease;
  &:hover {
    background: var(--gm-green);
    color: #000;
  }
`;

const EmitRed = styled(EmitButton)`
  border-color: var(--gm-red);
  color: var(--gm-red);
  &:hover {
    background: var(--gm-red);
    color: #000;
  }
`;

/* ---------- GM ACTUATOR COMPONENT ---------- */
const GMActuatorCanvas: React.FC<{ imageData: string }> = ({ imageData }) => {
  const imgRef = useRef<HTMLImageElement>(null);

  return (
    <div style={{
      width: '200px',
      height: '200px',
      margin: '0 auto',
      border: '1px solid var(--gm-blue)',
      background: '#000',
      position: 'relative',
      borderRadius: '4px',
      overflow: 'hidden'
    }}>
      {imageData ? (
        <img
          ref={imgRef}
          src={imageData}
          alt="Navigation Actuator Stream"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
        />
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--gm-yellow)',
          fontSize: '0.8rem',
          textAlign: 'center'
        }}>
          WAITING FOR<br />NAVIGATION STREAM
        </div>
      )}
    </div>
  );
};

/* ---------- COMPONENT ---------- */
interface GMStationProps {
  gameState?: GameState;
  onGMUpdate?: (changes: Partial<GameState>) => void;
}

const GMStation: React.FC<GMStationProps> = ({ gameState, onGMUpdate }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [states, setStates] = useState<GlobalGameState>(initialGlobalState);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const roomRef = useRef<string>('default');

  // Use passed gameState if available, otherwise use internal state
  const currentGameState = gameState || states;

  // Communications state
  const [signalStrength, setSignalStrength] = useState(100);
  const [interference, setInterference] = useState(0);
  const [messageResponse, setMessageResponse] = useState('');
  const [messagePriority, setMessagePriority] = useState<'normal' | 'high' | 'emergency'>('normal');
  const [messageFrom, setMessageFrom] = useState('Command');
  const [messageAnalysis, setMessageAnalysis] = useState('normal');
  const [commsTransmissions, setCommsTransmissions] = useState<CommunicationMessage[]>([]);
  const [selectedGalaxyRegion, setSelectedGalaxyRegion] = useState('Core Worlds');

  // Emergency beacon state and flashing effect
  const [emergencyBeaconActive, setEmergencyBeaconActive] = useState(false);
  const [beaconFlashing, setBeaconFlashing] = useState(false);

  // Scan indicator flashing effect
  const [scanActive, setScanActive] = useState(false);
  const [scanFlashing, setScanFlashing] = useState(false);

  // Red-pinned ship state
  const [redPinnedShip, setRedPinnedShip] = useState<{ id: string; designation: string | null; status: string } | null>(null);

  // Composer protocol state
  const [composerProtocol, setComposerProtocol] = useState('All Protocols (UNSECURE)');

  // Actuator image stream state
  const [actuatorImage, setActuatorImage] = useState<string>('');

  // Add pilot state tracking for GM monitoring
  const [pilotState, setPilotState] = useState<PilotState>({
    heading: { x: 0, y: 0 },
    speed: 0,
    altitude: 1000,
    alert: 'normal',
    hyperdriveStatus: 'ready',
    fuelLevel: 85,
    shieldStatus: 92,
    engineTemp: 45,
    navigationComputer: {
      targetSystem: 'Coruscant',
      jumpDistance: 0.167,
      eta: 0
    },
    autopilot: false,
    emergencyPower: false,
    hypermatter: {
      current: 80,
      maximum: 80,
      consumptionRate: 2.5
    },
    jumpPlanning: {
      duration: 1,
      hypermatterRequired: 2.5,
      isPlanning: false
    },
    asteroidField: {
      asteroids: [],
      enemyShips: [],
      gameActive: false,
      score: 0,
      environmentalHazard: {
        type: 'none',
        intensity: '',
        active: false
      }
    }
  });

  // Emergency beacon flashing effect for GM station
  useEffect(() => {
    let flashInterval: NodeJS.Timeout;

    if (emergencyBeaconActive) {
      flashInterval = setInterval(() => {
        setBeaconFlashing(prev => !prev);
      }, 500); // Flash every 500ms
    } else {
      setBeaconFlashing(false);
    }

    return () => {
      if (flashInterval) {
        clearInterval(flashInterval);
      }
    };
  }, [emergencyBeaconActive]);

  // Scan indicator flashing effect for GM station
  useEffect(() => {
    let flashInterval: NodeJS.Timeout;

    if (scanActive) {
      flashInterval = setInterval(() => {
        setScanFlashing(prev => !prev);
      }, 300); // Flash every 300ms for scan indicator
    } else {
      setScanFlashing(false);
    }

    return () => {
      if (flashInterval) {
        clearInterval(flashInterval);
      }
    };
  }, [scanActive]);

  // Moff names array (sample from the 1024 lines in moff_names_with_numbers.txt)
  const moffNamesArray = [
    "3695. Contact the staff of Moff Avenalem Kyrrorin for any information",
    "266. Contact the staff of Moff Avenanan Vorasar for any information",
    "5854. Contact the staff of Moff Avenasaal Cassiran for any information",
    "7579. Contact the staff of Moff Avenasek Threxomus for any information",
    "3698. Contact the staff of Moff Avenenar Tarkanar for any information",
    "8492. Contact the staff of Moff Avenevor Dornonan for any information",
    "8742. Contact the staff of Moff Avenevoth Zornometh for any information",
    "5004. Contact the staff of Moff Avenilaal Droakith for any information",
    "1604. Contact the staff of Moff Aveniless Hexasor for any information",
    "6684. Contact the staff of Moff Aveniraal Krayetax for any information",
    "4808. Contact the staff of Moff Avenirek Fenoneus for any information",
    "1657. Contact the staff of Moff Avenisess Kyrronen for any information",
    "3679. Contact the staff of Moff Avenomin Nossakith for any information",
    "6679. Contact the staff of Moff Avenonem Krayomaal for any information",
    "6239. Contact the staff of Moff Avenonen Krayenoth for any information",
    "5713. Contact the staff of Moff Avenosith Sarnalius for any information",
    "6588. Contact the staff of Moff Brakakess Droaloth for any information",
    "3028. Contact the staff of Moff Brakanok Tarkosoth for any information",
    "1992. Contact the staff of Moff Brakaror Threxasan for any information",
    "5408. Contact the staff of Moff Brakasek Dornevor for any information",
    "1241. Contact the staff of Moff Braketek Sarnulok for any information",
    "8931. Contact the staff of Moff Brakisin Thalevok for any information",
    "7883. Contact the staff of Moff Brakixan Kelinen for any information",
    "7184. Contact the staff of Moff Brakomess Velixar for any information",
    "3608. Contact the staff of Moff Brakomess Zornevor for any information",
    "7484. Contact the staff of Moff Brakonok Varnonem for any information",
    "5846. Contact the staff of Moff Brakorius Ruskumoth for any information",
    "765. Contact the staff of Moff Brakosar Kyrrulan for any information",
    "6308. Contact the staff of Moff Brakulus Nossanan for any information",
    "2275. Contact the staff of Moff Brenetax Ruskakorn for any information"
  ];

  // Function to get random moff name
  const getRandomSectorInfo = () => {
    const randomIndex = Math.floor(Math.random() * moffNamesArray.length);
    return moffNamesArray[randomIndex];
  };

  // Frequency macros for different channels
  const frequencyMacros: FrequencyMacro[] = [
    { id: 'emergency', name: 'Emergency', frequency: 121.5, description: 'Emergency & Distress', color: '#ff0040' },
    { id: 'command', name: 'Command', frequency: 243.0, description: 'Command & Control', color: '#ffd700' },
    { id: 'medical', name: 'Medical', frequency: 156.8, description: 'Medical Emergency', color: '#ff6b6b' },
    { id: 'engineering', name: 'Engineering', frequency: 467.775, description: 'Engineering Ops', color: '#4ecdc4' },
    { id: 'tactical', name: 'Tactical', frequency: 462.675, description: 'Tactical Operations', color: '#ff8c42' },
    { id: 'navigation', name: 'Navigation', frequency: 156.05, description: 'Navigation & Traffic', color: '#95e1d3' },
    { id: 'security', name: 'Security', frequency: 453.212, description: 'Security & Defense', color: '#a8e6cf' },
    { id: 'outofcontrol', name: 'Out of Control', frequency: 999.9, description: 'Emergency Override', color: '#ff1744' }
  ];

  // Signal analysis options
  const signalAnalysisOptions: SignalAnalysisOption[] = [
    { id: 'normal', name: 'Normal Scan', description: 'Standard signal analysis', effect: 'baseline' },
    { id: 'deep', name: 'Deep Scan', description: 'Enhanced signal penetration', effect: 'enhanced_range' },
    { id: 'encrypted', name: 'Decrypt Mode', description: 'Attempt to decrypt signals', effect: 'decrypt_attempt' },
    { id: 'jamming', name: 'Anti-Jam', description: 'Counter jamming attempts', effect: 'jam_resistance' },
    { id: 'triangulate', name: 'Triangulate', description: 'Locate signal source', effect: 'source_location' },
    { id: 'intercept', name: 'Intercept', description: 'Monitor enemy communications', effect: 'enemy_monitoring' },
    { id: 'boost', name: 'Signal Boost', description: 'Amplify weak signals', effect: 'signal_amplification' },
    { id: 'filter', name: 'Noise Filter', description: 'Remove background noise', effect: 'noise_reduction' }
  ];

  const toggleCollapse = (key: string) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  /* Socket setup */
  useEffect(() => {
    // Use relative connection for ngrok compatibility with proper configuration
    console.log('🔧 GM Station connecting to current domain with enhanced config');
    const s = io({
      transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    setSocket(s);

    // Get room from URL params
    const room = new URLSearchParams(window.location.search).get('room') || 'default';
    roomRef.current = room;

    // Connection testing with proper room joining
    s.on('connect', () => {
      console.log('✅ GM Station connected to server:', s.id);
      console.log('📡 GM Station joining room:', room);
      // Join room AFTER successful connection
      s.emit('join', { room: roomRef.current, station: 'gm', name: 'Game Master' });

      // Test broadcast reception immediately after joining
      setTimeout(() => {
        console.log('🧪 GM Station: Ready to send/receive broadcasts in room:', room);
      }, 1000);
    });

    s.on('connect_error', (error) => {
      console.error('❌ GM Station connection failed:', error);
      console.log('🔄 Will attempt to reconnect...');
    });

    s.on('disconnect', (reason) => {
      console.warn('⚠️ GM Station disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server disconnected, need to reconnect manually
        s.connect();
      }
    });

    s.on('reconnect', (attemptNumber) => {
      console.log('🔄 GM Station reconnected after', attemptNumber, 'attempts');
      // Rejoin room after reconnection
      s.emit('join', { room: roomRef.current, station: 'gm' });
    });

    /* Listen for communications station frequency changes */
    s.on('comm_frequency_change', (data: { frequency: number; room: string }) => {
      console.log('GM received frequency change from communications:', data);
      // Update GM display to show the new frequency
      setStates((prev) => ({
        ...prev,
        communications: {
          ...prev.communications,
          primaryFrequency: data.frequency
        }
      }));
    });

    /* Listen for communications broadcasts */
    s.on('comm_broadcast', (data: { type: string; value: any; room: string; source: string }) => {
      console.log('GM received communications broadcast:', data);

      if (data.source === 'communications') {
        switch (data.type) {
          case 'frequency_update':
            // Update GM display when communications station changes frequency
            setStates((prev) => ({
              ...prev,
              communications: {
                ...prev.communications,
                primaryFrequency: data.value
              }
            }));

            // Update parent component if available
            if (onGMUpdate) {
              onGMUpdate({
                communications: {
                  ...currentGameState.communications,
                  primaryFrequency: data.value
                }
              });
            }
            break;
          case 'analysis_mode_update':
            // Update GM display when communications station changes analysis mode
            console.log(' GM received analysis mode update:', data.value);
            setMessageAnalysis(data.value);
            setStates((prev) => ({
              ...prev,
              communications: {
                ...prev.communications,
                analysisMode: data.value
              }
            }));

            // Update parent component if available
            if (onGMUpdate) {
              onGMUpdate({
                communications: {
                  ...currentGameState.communications,
                  analysisMode: data.value
                }
              });
            }
            break;
        }
      }
    });

    // Room joining is now handled in the 'connect' event above
    console.log('✅ GM Station socket setup complete, waiting for connection');

    /* Listen for debug room responses */
    s.on('debug_room_response', (data: { room: string; exists: boolean; userCount: number; users: any[] }) => {
      console.log('🔍 GM Station: Debug room response:', data);
      console.log('🔍 GM Station: Room exists:', data.exists);
      console.log('🔍 GM Station: User count:', data.userCount);
      console.log('🔍 GM Station: Users:', data.users);
    });

    /* Listen for GM broadcasts (including our own messages) */
    s.on('gm_broadcast', (data: { type: string; value: any; room: string; source: string }) => {
      console.log('GM received gm_broadcast:', data);

      switch (data.type) {
        case 'new_message':
          // ignore our own messages so we don't duplicate them
          if (data.source === 'communications') {
            setCommsTransmissions(prev => {
              // Check if message with this ID already exists
              const existingMessage = prev.find(msg => msg.id === data.value.id);
              if (existingMessage) {
                return prev; // Don't add duplicate
              }
              return [...prev, data.value];
            });
          }
          break;
        case 'emergency_beacon_update':
          // Update GM beacon state when Communications station changes it
          if (data.source === 'communications') {
            console.log(' GM received emergency beacon update:', data.value);
            setEmergencyBeaconActive(data.value);
          }
          break;
        case 'scan_started':
          // Update GM scan indicator when Communications station starts a scan
          if (data.source === 'communications') {
            console.log(' GM received scan started:', data.value);
            setScanActive(true);
            // Flashing continues until GM responds with Scan Response
          }
          break;
        case 'red_pinned_ship':
          console.log(' GM received RED-pinned ship from Comms:', data.value);
          setRedPinnedShip(data.value);
          break;
        case 'composer_protocol_change':
          console.log('GM received composer protocol:', data.value);
          setComposerProtocol(data.value);
          break;
      }
    });

    /* Listen to every station's state_update */
    s.on('state_update', (payload: { station: StationName; state: any }) => {
      console.log('🎮 GM Station received state_update:', payload.station, payload.state);
      setStates((prev) => ({ ...prev, [payload.station]: payload.state }));

      // Track pilot state specifically for ACTUATOR display and shield controls
      if (payload.station === 'navigation') {
        console.log('🚀 GM Station updating pilot state for actuator:', payload.state);
        console.log('🛡️ GM Station received shield status:', payload.state.shieldStatus);
        setPilotState(prev => ({
          ...prev,  // Keep existing state
          ...payload.state,  // Override with incoming state
          // Ensure asteroidField is properly merged
          asteroidField: {
            ...prev.asteroidField,  // Keep existing asteroidField structure
            ...payload.state.asteroidField  // Override with incoming asteroidField data
          }
        }));
      }
    });

    /* Listen for actuator canvas stream from Navigation Station */
    s.on('actuator_frame', (data: { imageData: string }) => {
      console.log('🖼️ GM Station received actuator frame, data length:', data.imageData.length);
      // Update the actuator image display
      setActuatorImage(data.imageData);
    });

    /* Listen for game state updates to sync signal strength */
    s.on('game_state_update', (gameState: any) => {
      console.log('🎮 GM Station received game state update:', gameState);
      if (gameState?.communications?.signalStrength !== undefined) {
        console.log('📶 GM Station syncing signal strength to:', gameState.communications.signalStrength);
        setSignalStrength(gameState.communications.signalStrength);
      }
      if (gameState?.communications?.interference !== undefined) {
        console.log('📡 GM Station syncing interference to:', gameState.communications.interference);
        setInterference(gameState.communications.interference);
      }
    });

    // Add error handling for socket events
    s.on('error', (error: any) => {
      console.error('🚨 GM Station socket error:', error);
    });

    s.on('connect_error', (error: any) => {
      console.error('🚨 GM Station connection error:', error);
    });

    s.on('disconnect', (reason: string) => {
      console.warn('⚠️ GM Station disconnected:', reason);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  /* ---------- EMITTER HELPERS ---------- */
  const emit = (action: string, value?: any, station?: StationName) => {
    if (!socket) return;
    console.log(`📡 GM Station emitting player_action:`, { room: roomRef.current, action, value, target: station });
    socket.emit('player_action', { room: roomRef.current, action, value, target: station });
  };

  // Helper function for logging socket emissions
  const emitWithLogging = (eventType: string, data: any) => {
    console.log(`📡 GM Station emitting ${eventType}:`, data);
    socket?.emit(eventType, data);
  };

  // Helper function to send broadcasts to all stations
  const sendBroadcast = (type: string, value: any, targetStation?: string) => {
    if (!socket || !socket.connected) {
      console.error('❌ Cannot send broadcast: Socket not connected');
      return;
    }

    const broadcastData = {
      type,
      value,
      room: roomRef.current,
      source: 'gm',
      target: targetStation, // Optional: target specific station
      timestamp: Date.now()
    };

    console.log('📡 GM Station sending broadcast:', broadcastData);
    socket.emit('gm_broadcast', broadcastData);
  };

  // Make it available globally for testing
  React.useEffect(() => {
    // Add test function to window
    (window as any).testNavigationConnection = () => {
      console.log('🧪 Testing navigation connection...');
      sendBroadcast('test_connection', { message: 'Hello from GM Station!' }, 'navigation');
    };
  }, [socket]);

  /* ---------- RENDER ---------- */
  return (
    <Container>
      <Header>GAME MASTER CONTROL</Header>

      <PanelsGrid>


        {/* ENHANCED COMMUNICATIONS */}
        <Panel collapsed={collapsed.comms}>
          <PanelHeader onClick={() => toggleCollapse('comms')}>
            <PanelTitle>Communications Control</PanelTitle>
            <CollapseBtn>{collapsed.comms ? '▲' : '▼'}</CollapseBtn>
          </PanelHeader>
          {!collapsed.comms && (
            <>
              {/* Frequency Slider */}
              {/* Red-pinned ship display */}
              {redPinnedShip && (
                <div style={{
                  marginTop: 10,
                  marginBottom: 15,
                  padding: '8px',
                  border: '1px solid #ff0040',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(255, 0, 0, 0.1)'
                }}>
                  <div style={{
                    fontSize: '0.8rem',
                    color: '#ff0040',
                    fontWeight: 'bold',
                    marginBottom: '5px'
                  }}>
                    RED-PINNED TARGET
                  </div>
                  <Row>
                    <span>ID:</span>
                    <span style={{ color: '#ff8800' }}>{redPinnedShip.id.slice(-6)}</span>
                  </Row>
                  <Row>
                    <span>Designation:</span>
                    <span style={{ color: '#ff8800' }}>{redPinnedShip.designation || 'Undesignated'}</span>
                  </Row>
                  <Row>
                    <span>Status:</span>
                    <span style={{
                      color: redPinnedShip.status === 'Active' ? '#00ff88' : '#ffd700'
                    }}>
                      {redPinnedShip.status}
                    </span>
                  </Row>
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <Row>
                  <span>Protocol in use:</span>
                  <span style={{ color: '#ffd700' }}>{composerProtocol}</span>
                </Row>

                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', margin: '10px 0 6px 0', fontWeight: 'bold' }}>
                  FREQUENCY CONTROL:
                </div>
                <div style={{
                  background: 'rgba(0, 0, 0, 0.6)',
                  border: '1px solid var(--gm-blue)',
                  borderRadius: '4px',
                  padding: '10px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px'
                  }}>
                    <span style={{ fontSize: '10px', color: '#888888' }}>0.0</span>
                    <span style={{
                      fontSize: '14px',
                      color: 'var(--gm-green)',
                      fontWeight: 'bold',
                      textShadow: '0 0 5px currentColor'
                    }}>
                      {(states.communications?.primaryFrequency ?? 121.5).toFixed(1)} MHz
                    </span>
                    <span style={{ fontSize: '10px', color: '#888888' }}>999.9</span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="999.9"
                    step="0.1"
                    value={states.communications?.primaryFrequency ?? 121.5}
                    onChange={(e) => {
                      const newFreq = parseFloat(e.target.value);
                      // Update GM's local state
                      setStates(prev => ({
                        ...prev,
                        communications: {
                          ...prev.communications,
                          primaryFrequency: newFreq
                        }
                      }));
                      // Broadcast to Communications station
                      socket?.emit('gm_broadcast', {
                        type: 'frequency_update',
                        value: newFreq,
                        room: roomRef.current,
                        source: 'gm',
                      });
                      // Update parent component if available
                      if (onGMUpdate) {
                        onGMUpdate({
                          communications: {
                            ...currentGameState.communications,
                            primaryFrequency: newFreq
                          }
                        });
                      }
                    }}
                    style={{
                      width: '100%',
                      height: '6px',
                      background: 'linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00ff00, #0088ff, #8800ff)',
                      borderRadius: '3px',
                      outline: 'none',
                      cursor: 'pointer',
                      accentColor: 'var(--gm-green)'
                    }}
                  />

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '6px',
                    fontSize: '9px',
                    color: '#666666'
                  }}>
                    <span>Emergency</span>
                    <span>Command</span>
                    <span>Tactical</span>
                    <span>Override</span>
                  </div>
                </div>
              </div>

              {/* Current Status */}
              <Row>
                <span>Primary Freq:</span>
                <span>{states.communications?.primaryFrequency ?? '—'} MHz</span>
              </Row>
              <Row>
                <span>Signal Strength:</span>
                <span style={{ color: signalStrength > 75 ? '#00ff88' : signalStrength > 50 ? '#ffd700' : '#ff0040' }}>
                  {signalStrength}%
                </span>
              </Row>
              <Row>
                <span>Interference:</span>
                <span style={{ color: interference < 25 ? '#00ff88' : interference < 50 ? '#ffd700' : '#ff0040' }}>
                  {interference}%
                </span>
              </Row>
              <Row>
                <span>Analysis Mode:</span>
                <span style={{
                  color: scanActive && scanFlashing ? '#ff0000' : '#eee',
                  backgroundColor: scanActive && scanFlashing ? 'rgba(255, 0, 0, 0.2)' : 'transparent',
                  padding: scanActive ? '2px 4px' : '0',
                  borderRadius: '2px',
                  transition: 'all 0.1s ease',
                  textShadow: scanActive && scanFlashing ? '0 0 8px #ff0000' : 'none'
                }}>
                  {signalAnalysisOptions.find(opt => opt.id === messageAnalysis)?.name ?? 'Normal'}
                </span>
              </Row>

              {/* Frequency Macros */}
              <div style={{ marginTop: 10, marginBottom: 8 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 6, fontWeight: 'bold' }}>
                  FREQUENCY MACROS:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                  {frequencyMacros.map(macro => (
                    <EmitButton
                      key={macro.id}
                      onClick={() => {
                        // Broadcast the frequency change to Communications station
                        socket?.emit('gm_broadcast', {
                          type: 'frequency_update',
                          value: macro.frequency,
                          room: roomRef.current,
                          source: 'gm',
                        });
                        // Update GM's local state to show the new frequency
                        setStates(prev => ({
                          ...prev,
                          communications: {
                            ...prev.communications,
                            primaryFrequency: macro.frequency
                          }
                        }));
                        if (onGMUpdate) {
                          onGMUpdate({
                            communications: {
                              ...currentGameState.communications,
                              primaryFrequency: macro.frequency
                            }
                          });
                        }
                      }}
                      style={{
                        borderColor: macro.color,
                        color: macro.color,
                        fontSize: '0.7rem',
                        padding: '3px 4px',
                        margin: 0,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      title={`${macro.description} - ${macro.frequency} MHz`}
                    >
                      <span>{macro.name}</span>
                      <span style={{ opacity: 0.7, fontSize: '0.6rem', marginLeft: '4px' }}>{macro.frequency.toFixed(1)}</span>
                    </EmitButton>
                  ))}
                </div>
              </div>

              {/* MESSAGE COMPOSER */}
              <div style={{ marginTop: 15, marginBottom: 10 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 8, fontWeight: 'bold' }}>
                  MESSAGE COMPOSER:
                </div>

                {/* Priority selector */}
                <select
                  value={messagePriority}
                  onChange={(e) => setMessagePriority(e.target.value as any)}
                  style={{
                    width: '100%',
                    background: '#111',
                    border: '1px solid var(--gm-blue)',
                    color: '#eee',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    marginBottom: 6
                  }}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="emergency">EMERGENCY</option>
                </select>

                {/* From field */}
                <input
                  type="text"
                  placeholder="From (source)"
                  value={messageFrom}
                  onChange={(e) => setMessageFrom(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#111',
                    border: '1px solid var(--gm-blue)',
                    color: '#eee',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    marginBottom: 6
                  }}
                />

                {/* Signal Analysis selector */}


                {/* Message text */}
                <textarea
                  placeholder="Type transmission..."
                  value={messageResponse}
                  onChange={(e) => setMessageResponse(e.target.value)}
                  style={{
                    width: '100%',
                    height: '60px',
                    background: '#111',
                    border: '1px solid var(--gm-blue)',
                    color: '#eee',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    padding: '6px',
                    resize: 'vertical',
                    marginBottom: 6
                  }}
                />

                {/* Send buttons */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <EmitButton
                    onClick={() => {
                      if (!messageResponse.trim()) return;
                      const room = roomRef.current;
                      const freq = states.communications?.primaryFrequency ?? 121.5;

                      // use the *same* channel Comms already listens for
                      socket?.emit('gm_broadcast', {
                        type: 'new_message',
                        value: {
                          id: Date.now().toString(),
                          from: messageFrom,              // <- dynamic
                          to: 'All Stations',
                          content: messageResponse,
                          priority: messagePriority,
                          frequency: freq,
                          timestamp: Date.now(),
                          analysisMode: messageAnalysis,        // <-- new
                          onAir: `(${freq.toFixed(1)} MHz)`               // <-- new
                        },
                        room,
                        source: 'gm'
                      });
                      setMessageResponse('');
                    }}
                  >
                    Send Transmission
                  </EmitButton>

                  <EmitButton
                    onClick={() => {
                      if (!messageResponse.trim()) return;
                      const room = roomRef.current;
                      const freq = states.communications?.primaryFrequency ?? 121.5;

                      // Send the same transmission as Send Transmission button
                      socket?.emit('gm_broadcast', {
                        type: 'new_message',
                        value: {
                          id: Date.now().toString(),
                          from: messageFrom,              // <- dynamic
                          to: 'All Stations',
                          content: messageResponse,
                          priority: messagePriority,
                          frequency: freq,
                          timestamp: Date.now(),
                          analysisMode: messageAnalysis,        // <-- new
                          onAir: `(${freq.toFixed(1)} MHz)`               // <-- new
                        },
                        room,
                        source: 'gm'
                      });

                      // Broadcast scan response to Communications station to fast-forward analysis
                      socket?.emit('gm_broadcast', {
                        type: 'scan_response',
                        value: {
                          timestamp: Date.now(),
                          from: messageFrom
                        },
                        room,
                        source: 'gm'
                      });

                      // Additionally, stop the scan flashing
                      setScanActive(false);
                      console.log('🔍 GM Scan Response sent - stopping scan indicator and fast-forwarding analysis');

                      setMessageResponse('');
                    }}
                  >
                    Scan Response
                  </EmitButton>
                </div>
              </div>

              {/* LIVE COMMUNICATION LOG */}
              <div style={{ marginTop: 15, border: '1px solid var(--gm-blue)', borderRadius: 4, padding: 10 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 6 }}>COMMS TRANSMISSION LOG</div>
                <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: '0.7rem' }}>
                  {commsTransmissions.length === 0 ? (
                    <div style={{ color: '#666' }}>No transmissions yet</div>
                  ) : (
                    commsTransmissions.map(msg => (
                      <div key={msg.id} style={{ marginBottom: 4 }}>
                        <strong>{msg.from}</strong> → {msg.to}: {msg.content} <em>({msg.priority})</em> {msg.onAir}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div style={{ marginTop: 15 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 8, fontWeight: 'bold' }}>
                  QUICK ACTIONS:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <EmitButton
                    onClick={() => {
                      setEmergencyBeaconActive(true);
                      emit('toggle_emergency_beacon', true, 'communications');
                      // Broadcast beacon state to Communications station
                      if (socket) {
                        console.log('🚨 GM Broadcasting emergency beacon ON');
                        socket.emit('gm_broadcast', {
                          type: 'emergency_beacon_update',
                          value: true,
                          room: roomRef.current,
                          source: 'gm'
                        });
                      }
                      if (onGMUpdate) {
                        onGMUpdate({
                          communications: {
                            ...currentGameState.communications,
                            emergencyBeacon: true
                          }
                        });
                      }
                    }}
                    style={{
                      // Add flashing red border when beacon is active
                      border: emergencyBeaconActive && beaconFlashing ? '2px solid #ff0000' : '1px solid var(--gm-green)',
                      boxShadow: emergencyBeaconActive && beaconFlashing ? '0 0 15px rgba(255, 0, 0, 0.8)' : 'none',
                      background: emergencyBeaconActive ? 'rgba(255, 0, 0, 0.2)' : 'rgba(0, 255, 136, 0.1)'
                    }}
                  >
                    Beacon ON
                  </EmitButton>
                  <EmitRed onClick={() => {
                    setEmergencyBeaconActive(false);
                    emit('toggle_emergency_beacon', false, 'communications');
                    // Broadcast beacon state to Communications station
                    if (socket) {
                      console.log('🚨 GM Broadcasting emergency beacon OFF');
                      socket.emit('gm_broadcast', {
                        type: 'emergency_beacon_update',
                        value: false,
                        room: roomRef.current,
                        source: 'gm'
                      });
                    }
                    if (onGMUpdate) {
                      onGMUpdate({
                        communications: {
                          ...currentGameState.communications,
                          emergencyBeacon: false
                        }
                      });
                    }
                  }}>
                    Beacon OFF
                  </EmitRed>
                  <EmitButton onClick={() => {
                    // Clear only the GM's COMMS TRANSMISSION LOG
                    setCommsTransmissions([]);
                  }}>
                    Clear Messages
                  </EmitButton>
                  <EmitRed onClick={() => emit('communications_blackout', true, 'communications')}>
                    BLACKOUT
                  </EmitRed>
                </div>
              </div>

              {/* Signal Strength Controls */}
              <div style={{ marginTop: 15, marginBottom: 10 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 8, fontWeight: 'bold' }}>
                  SIGNAL STRENGTH:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={signalStrength}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      setSignalStrength(value);
                      // Broadcast to all stations (including communications)
                      if (socket) {
                        console.log('🎛️ GM Broadcasting signal strength update:', value);
                        socket.emit('gm_broadcast', {
                          type: 'signal_strength_update',
                          value: value,
                          room: roomRef.current,
                          source: 'gm'
                        });
                      }
                    }}
                    style={{ flex: 1, accentColor: 'var(--gm-green)' }}
                  />
                  <span style={{ minWidth: '40px', textAlign: 'right' }}>{signalStrength}%</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <EmitButton onClick={() => {
                    const newValue = Math.max(0, signalStrength - 25);
                    setSignalStrength(newValue);
                    // Broadcast to all stations (including communications)
                    if (socket) {
                      console.log('🎛️ GM Broadcasting -25% signal strength update:', newValue);
                      socket.emit('gm_broadcast', {
                        type: 'signal_strength_update',
                        value: newValue,
                        room: roomRef.current,
                        source: 'gm'
                      });
                    }
                  }}>-25%</EmitButton>
                  <EmitButton onClick={() => {
                    const newValue = Math.min(100, signalStrength + 25);
                    setSignalStrength(newValue);
                    // Broadcast to all stations (including communications)
                    if (socket) {
                      console.log('🎛️ GM Broadcasting +25% signal strength update:', newValue);
                      socket.emit('gm_broadcast', {
                        type: 'signal_strength_update',
                        value: newValue,
                        room: roomRef.current,
                        source: 'gm'
                      });
                    }
                  }}>+25%</EmitButton>
                  <EmitRed onClick={() => {
                    setSignalStrength(0);
                    // Broadcast to all stations (including communications)
                    if (socket) {
                      console.log('🎛️ GM Broadcasting KILL signal strength update: 0');
                      socket.emit('gm_broadcast', {
                        type: 'signal_strength_update',
                        value: 0,
                        room: roomRef.current,
                        source: 'gm'
                      });
                    }
                  }}>KILL</EmitRed>
                </div>
              </div>

              {/* Interference Controls */}
              <div style={{ marginTop: 15, marginBottom: 10 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 8, fontWeight: 'bold' }}>
                  INTERFERENCE:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={interference}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      setInterference(value);
                      // Emit to communications station
                      emit('gm_interference_change', value, 'communications');
                      // Broadcast to all stations
                      if (socket) {
                        socket.emit('gm_broadcast', {
                          type: 'interference_update',
                          value: value,
                          room: roomRef.current,
                          source: 'gm'
                        });
                      }
                      if (onGMUpdate) {
                        onGMUpdate({
                          communications: {
                            ...currentGameState.communications,
                            interference: value
                          }
                        });
                      }
                    }}
                    style={{ flex: 1, accentColor: 'var(--gm-red)' }}
                  />
                  <span style={{ minWidth: '40px', textAlign: 'right' }}>{interference}%</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <EmitButton onClick={() => {
                    const newValue = Math.max(0, interference - 25);
                    setInterference(newValue);
                    // Emit to communications station
                    emit('reduce_interference', 25, 'communications');
                    // Broadcast to all stations
                    if (socket) {
                      console.log('🎛️ GM Broadcasting -25% interference update:', newValue);
                      socket.emit('gm_broadcast', {
                        type: 'interference_update',
                        value: newValue,
                        room: roomRef.current,
                        source: 'gm'
                      });
                    }
                    if (onGMUpdate) {
                      onGMUpdate({
                        communications: {
                          ...currentGameState.communications,
                          interference: newValue
                        }
                      });
                    }
                  }}>-25%</EmitButton>
                  <EmitButton onClick={() => {
                    const newValue = Math.min(100, interference + 25);
                    setInterference(newValue);
                    // Emit to communications station
                    emit('add_interference', 25, 'communications');
                    // Broadcast to all stations
                    if (socket) {
                      console.log('🎛️ GM Broadcasting +25% interference update:', newValue);
                      socket.emit('gm_broadcast', {
                        type: 'interference_update',
                        value: newValue,
                        room: roomRef.current,
                        source: 'gm'
                      });
                    }
                    if (onGMUpdate) {
                      onGMUpdate({
                        communications: {
                          ...currentGameState.communications,
                          interference: newValue
                        }
                      });
                    }
                  }}>+25%</EmitButton>
                  <EmitRed onClick={() => {
                    setInterference(100);
                    // Emit to communications station
                    emit('jam_all_signals', true, 'communications');
                    // Broadcast to all stations (same pattern as other interference controls)
                    if (socket) {
                      console.log('🎛️ GM Broadcasting JAM ALL interference update: 100');
                      socket.emit('gm_broadcast', {
                        type: 'interference_update',
                        value: 100,
                        room: roomRef.current,
                        source: 'gm'
                      });
                    }
                    if (onGMUpdate) {
                      onGMUpdate({
                        communications: {
                          ...currentGameState.communications,
                          interference: 100
                        }
                      });
                    }
                  }}>JAM ALL</EmitRed>
                </div>
              </div>

              {/* Imperial Initialization Message Button */}
              <div style={{ marginTop: 20 }}>
                <EmitButton
                  onClick={() => {
                    const room = roomRef.current;
                    const freq = states.communications?.primaryFrequency ?? 121.5;
                    const moffInfo = getRandomSectorInfo();

                    // Create Imperial initialization message
                    const imperialMessage = {
                      id: Date.now().toString(),
                      from: 'Imperial Command',
                      to: 'All Stations',
                      content: `Maintain current heading. Rebel activity detected in sector ${moffInfo}`,
                      priority: 'high' as const,
                      frequency: freq,
                      timestamp: Date.now(),
                      onAir: `(${freq.toFixed(1)} MHz)`
                    };

                    // Broadcast to Communications station
                    socket?.emit('gm_broadcast', {
                      type: 'new_message',
                      value: imperialMessage,
                      room,
                      source: 'gm'
                    });
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '0.8rem',
                    fontWeight: 'bold'
                  }}
                >
                  Imperial Initialization Message
                </EmitButton>
              </div>

              {/* Galaxy Region Selector */}
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 8, fontWeight: 'bold' }}>
                  GALAXY REGION:
                </div>
                <select
                  value={selectedGalaxyRegion}
                  onChange={(e) => {
                    setSelectedGalaxyRegion(e.target.value);
                    // Emit region update to CommunicationsStation with 'value' property
                    socket?.emit('gm_broadcast', {
                      type: 'region_update',
                      value: e.target.value,  // Changed from 'region' to 'value'
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}
                  style={{
                    width: '100%',
                    background: '#111',
                    border: '1px solid var(--gm-blue)',
                    color: '#eee',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '0.8rem'
                  }}
                >
                  <option value="Core Worlds">Core Worlds</option>
                  <option value="Colonies">Colonies</option>
                  <option value="Inner Rim">Inner Rim</option>
                  <option value="Mid Rim">Mid Rim</option>
                  <option value="Outer Rim">Outer Rim</option>
                  <option value="Wild Space">Wild Space</option>
                  <option value="Unknown Regions">Unknown Regions</option>
                </select>
              </div>
            </>
          )}
        </Panel>

        {/* ENHANCED NAVIGATION CONTROL */}
        <Panel collapsed={collapsed.nav}>
          <PanelHeader onClick={() => toggleCollapse('nav')}>
            <PanelTitle>Navigation Control</PanelTitle>
            <CollapseBtn>{collapsed.nav ? '▲' : '▼'}</CollapseBtn>
          </PanelHeader>
          {!collapsed.nav && (
            <>
              {/* Current Status Display */}
              <Row>
                <span>Speed:</span>
                <span style={{ color: (states.navigation?.speed ?? 0) > 80 ? '#ff0040' : '#00ff88' }}>
                  {states.navigation?.speed ?? '—'}%
                </span>
              </Row>
              <Row>
                <span>Altitude:</span>
                <span>{states.navigation?.altitude?.toFixed(0) ?? '—'} km</span>
              </Row>
              <Row>
                <span>Distance to Mass:</span>
                <span style={{ color: (states.navigation?.distanceToMass ?? 1000) < 100 ? '#ff0040' : (states.navigation?.distanceToMass ?? 1000) < 500 ? '#ffd700' : '#00ff88' }}>
                  {states.navigation?.distanceToMass?.toFixed(0) ?? '1000'} km
                </span>
              </Row>
              <Row>
                <span>Fuel Level:</span>
                <span style={{ color: (states.navigation?.fuelLevel ?? 100) < 25 ? '#ff0040' : (states.navigation?.fuelLevel ?? 100) < 50 ? '#ffd700' : '#00ff88' }}>
                  {states.navigation?.fuelLevel ?? '—'}%
                </span>
              </Row>
              <Row>
                <span>Engine Temp:</span>
                <span style={{ color: (states.navigation?.engineTemp ?? 30) > 80 ? '#ff0040' : '#00ff88' }}>
                  {states.navigation?.engineTemp ?? '—'}°C
                </span>
              </Row>
              <Row>
                <span>Hyperdrive:</span>
                <span style={{
                  color: states.navigation?.hyperdriveStatus === 'ready' ? '#00ff88' :
                    states.navigation?.hyperdriveStatus === 'charging' ? '#ffd700' :
                      states.navigation?.hyperdriveStatus === 'jumping' ? '#0088ff' : '#ff8800'
                }}>
                  {states.navigation?.hyperdriveStatus?.toUpperCase() ?? '—'}
                </span>
              </Row>

              {/* Distance to Mass Control */}
              <div style={{ marginTop: 15, marginBottom: 10 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 8, fontWeight: 'bold' }}>
                  PROXIMITY SENSOR CONTROL:
                </div>
                <div style={{
                  background: 'rgba(0, 0, 0, 0.6)',
                  border: '1px solid var(--gm-blue)',
                  borderRadius: '4px',
                  padding: '10px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px'
                  }}>
                    <span style={{ fontSize: '10px', color: '#888888' }}>0 km</span>
                    <span style={{
                      fontSize: '14px',
                      color: 'var(--gm-green)',
                      fontWeight: 'bold',
                      textShadow: '0 0 5px currentColor'
                    }}>
                      {(states.navigation?.distanceToMass ?? 1000).toFixed(0)} km
                    </span>
                    <span style={{ fontSize: '10px', color: '#888888' }}>10000 km</span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="10000"
                    step="10"
                    value={states.navigation?.distanceToMass ?? 1000}
                    onChange={(e) => {
                      const newDistance = parseInt(e.target.value);
                      // Update GM's local state
                      setStates(prev => ({
                        ...prev,
                        navigation: {
                          ...prev.navigation,
                          distanceToMass: newDistance
                        }
                      }));
                      // Emit to navigation station using helper
                      emit('set_distance_to_mass', newDistance, 'navigation');
                      // Broadcast to Navigation station
                      socket?.emit('gm_broadcast', {
                        type: 'distance_to_mass_update',
                        value: newDistance,
                        room: roomRef.current,
                        source: 'gm',
                      });
                    }}
                    style={{
                      width: '100%',
                      height: '6px',
                      background: 'linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00ff00, #0088ff)',
                      borderRadius: '3px',
                      outline: 'none',
                      cursor: 'pointer',
                      accentColor: 'var(--gm-green)'
                    }}
                  />

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '6px',
                    fontSize: '9px',
                    color: '#666666'
                  }}>
                    <span>Critical</span>
                    <span>Close</span>
                    <span>Safe</span>
                    <span>Far</span>
                  </div>
                </div>

                {/* Quick Distance Presets */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, marginTop: 8 }}>
                  <EmitRed onClick={() => {
                    const criticalDistance = 50;
                    setStates(prev => ({
                      ...prev,
                      navigation: {
                        ...prev.navigation,
                        distanceToMass: criticalDistance
                      }
                    }));
                    emit('set_distance_to_mass', criticalDistance, 'navigation');
                    socket?.emit('gm_broadcast', {
                      type: 'distance_to_mass_update',
                      value: criticalDistance,
                      room: roomRef.current,
                      source: 'gm',
                    });
                  }}>CRITICAL</EmitRed>
                  <EmitButton onClick={() => {
                    const closeDistance = 200;
                    setStates(prev => ({
                      ...prev,
                      navigation: {
                        ...prev.navigation,
                        distanceToMass: closeDistance
                      }
                    }));
                    emit('set_distance_to_mass', closeDistance, 'navigation');
                    socket?.emit('gm_broadcast', {
                      type: 'distance_to_mass_update',
                      value: closeDistance,
                      room: roomRef.current,
                      source: 'gm',
                    });
                  }}>CLOSE</EmitButton>
                  <EmitButton onClick={() => {
                    const safeDistance = 1000;
                    setStates(prev => ({
                      ...prev,
                      navigation: {
                        ...prev.navigation,
                        distanceToMass: safeDistance
                      }
                    }));
                    emit('set_distance_to_mass', safeDistance, 'navigation');
                    socket?.emit('gm_broadcast', {
                      type: 'distance_to_mass_update',
                      value: safeDistance,
                      room: roomRef.current,
                      source: 'gm',
                    });
                  }}>SAFE</EmitButton>
                  <EmitButton onClick={() => {
                    const farDistance = 5000;
                    setStates(prev => ({
                      ...prev,
                      navigation: {
                        ...prev.navigation,
                        distanceToMass: farDistance
                      }
                    }));
                    emit('set_distance_to_mass', farDistance, 'navigation');
                    socket?.emit('gm_broadcast', {
                      type: 'distance_to_mass_update',
                      value: farDistance,
                      room: roomRef.current,
                      source: 'gm',
                    });
                  }}>FAR</EmitButton>
                </div>
              </div>

              {/* Speed Controls */}
              <div style={{ marginTop: 15, marginBottom: 10 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 8, fontWeight: 'bold' }}>
                  SPEED CONTROL:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                  <EmitButton onClick={() => {
                    socket?.emit('gm_broadcast', {
                      type: 'navigation_update',
                      value: { speed: 25 },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>25%</EmitButton>
                  <EmitButton onClick={() => {
                    socket?.emit('gm_broadcast', {
                      type: 'navigation_update',
                      value: { speed: 50 },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>50%</EmitButton>
                  <EmitButton onClick={() => {
                    socket?.emit('gm_broadcast', {
                      type: 'navigation_update',
                      value: { speed: 75 },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>75%</EmitButton>
                  <EmitButton onClick={() => {
                    socket?.emit('gm_broadcast', {
                      type: 'navigation_update',
                      value: { speed: 100 },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>MAX</EmitButton>
                  <EmitRed onClick={() => {
                    socket?.emit('gm_broadcast', {
                      type: 'navigation_update',
                      value: { speed: 0 },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>STOP</EmitRed>
                  <EmitButton onClick={() => {
                    socket?.emit('gm_broadcast', {
                      type: 'navigation_update',
                      value: { speed: Math.floor(Math.random() * 100) },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>RANDOM</EmitButton>
                </div>
              </div>

              {/* Shield Status Control */}
              <div style={{ marginTop: 15, marginBottom: 10 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 8, fontWeight: 'bold' }}>
                  SHIELD STATUS CONTROL:
                </div>
                <Row>
                  <span>Current Shield:</span>
                  <span style={{
                    color: (pilotState.shieldStatus ?? 0) < 30 ? '#ff0040' :
                      (pilotState.shieldStatus ?? 0) < 60 ? '#ffd700' : '#00ff88'
                  }}>
                    {(pilotState.shieldStatus ?? 0).toFixed(0)}%
                  </span>
                </Row>
                
                {/* Shield Slider Control */}
                <div style={{ marginTop: 10, marginBottom: 10 }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: '#00ffff', fontSize: '0.8rem' }}>
                    Set Shield Level: {pilotState.shieldStatus ?? 92}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={pilotState.shieldStatus ?? 92}
                    onChange={(e) => {
                      const newShieldStatus = parseInt(e.target.value);
                      console.log('🛡️ GM setting shield status via slider to:', newShieldStatus);
                      socket?.emit('gm_broadcast', {
                        type: 'shield_update',
                        value: { shieldStatus: newShieldStatus },
                        room: roomRef.current,
                        source: 'gm'
                      });
                    }}
                    style={{ 
                      width: '100%',
                      background: 'transparent',
                      cursor: 'pointer'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '0.7rem', color: '#666' }}>
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Shield Macro Controls */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, marginTop: 8 }}>
                  <EmitRed onClick={() => {
                    console.log('🛡️ GM setting shields to CRITICAL (0%)');
                    socket?.emit('gm_broadcast', {
                      type: 'shield_update',
                      value: { shieldStatus: 0 },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>Critical</EmitRed>
                  <EmitButton onClick={() => {
                    console.log('🛡️ GM setting shields to LOW (25%)');
                    socket?.emit('gm_broadcast', {
                      type: 'shield_update',
                      value: { shieldStatus: 25 },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>Low</EmitButton>
                  <EmitButton onClick={() => {
                    console.log('🛡️ GM setting shields to NORMAL (75%)');
                    socket?.emit('gm_broadcast', {
                      type: 'shield_update',
                      value: { shieldStatus: 75 },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>Normal</EmitButton>
                  <EmitButton onClick={() => {
                    console.log('🛡️ GM setting shields to FULL (100%)');
                    socket?.emit('gm_broadcast', {
                      type: 'shield_update',
                      value: { shieldStatus: 100 },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>Full</EmitButton>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 4 }}>
                  <EmitRed onClick={() => {
                    console.log('🛡️ GM setting shield status to 0%');
                    socket?.emit('gm_broadcast', {
                      type: 'shield_update',
                      value: { shieldStatus: 0 },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>SHIELDS DOWN</EmitRed>
                  <EmitButton onClick={() => {
                    console.log('🛡️ GM setting shield status to 50%');
                    socket?.emit('gm_broadcast', {
                      type: 'shield_update',
                      value: { shieldStatus: 50 },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>50%</EmitButton>
                  <EmitButton onClick={() => {
                    console.log('🛡️ GM setting shield status to 100%');
                    socket?.emit('gm_broadcast', {
                      type: 'shield_update',
                      value: { shieldStatus: 100 },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>FULL SHIELDS</EmitButton>
                </div>
              </div>

              {/* Environmental Hazards */}
              <div style={{ marginTop: 15, marginBottom: 10 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 8, fontWeight: 'bold' }}>
                  ENVIRONMENTAL HAZARDS:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <EmitButton onClick={() => {
                    console.log('🌌 GM sending asteroid_field hazard to room:', roomRef.current);
                    socket?.emit('gm_broadcast', {
                      type: 'navigation_hazard',
                      value: { type: 'asteroid_field', intensity: 'high' },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>ASTEROIDS</EmitButton>
                  <EmitButton onClick={() => {
                    console.log('🌌 GM sending gravity_well hazard to room:', roomRef.current);
                    socket?.emit('gm_broadcast', {
                      type: 'navigation_hazard',
                      value: { type: 'gravity_well', intensity: 'severe' },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>GRAVITY</EmitButton>
                  <EmitButton onClick={() => {
                    console.log('🌌 GM sending ion_storm hazard to room:', roomRef.current);
                    socket?.emit('gm_broadcast', {
                      type: 'navigation_hazard',
                      value: { type: 'ion_storm', intensity: 'moderate' },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>ION STORM</EmitButton>
                  <EmitButton onClick={() => {
                    console.log('🌌 GM sending solar_flare hazard to room:', roomRef.current);
                    socket?.emit('gm_broadcast', {
                      type: 'navigation_hazard',
                      value: { type: 'solar_flare', intensity: 'extreme' },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>SOLAR FLARE</EmitButton>
                </div>
              </div>

              {/* Enemy Ship Control */}
              <div style={{ marginTop: 15 }}>
                <div style={{ color: 'var(--gm-yellow)', marginBottom: 8 }}>
                  ENEMY SHIP CONTROL:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                  <EmitButton
                    onClick={() => {
                      console.log('🧪 GM Station: Testing connection to room:', roomRef.current);
                      console.log('🧪 GM Station: Socket connected?', socket?.connected);
                      console.log('🧪 GM Station: Socket ID:', socket?.id);
                      socket?.emit('gm_broadcast', {
                        type: 'test_connection',
                        value: 'Hello Navigation!',
                        room: roomRef.current,
                        source: 'gm'
                      });
                    }}
                  >
                    TEST CONNECTION
                  </EmitButton>
                  <EmitButton
                    onClick={() => {
                      console.log('🎮 GM Station: Activating enemy pursuit for room:', roomRef.current);
                      console.log('🎮 GM Station: Socket connected?', socket?.connected);
                      socket?.emit('gm_broadcast', {
                        type: 'enemy_pursuit',
                        value: { action: 'activate' },
                        room: roomRef.current,
                        source: 'gm'
                      });
                    }}
                  >
                    SPAWN ENEMY
                  </EmitButton>
                  <EmitRed
                    onClick={() => {
                      console.log('🎮 GM Station: Deactivating enemy pursuit for room:', roomRef.current);
                      console.log('🎮 GM Station: Socket connected?', socket?.connected);
                      socket?.emit('gm_broadcast', {
                        type: 'enemy_pursuit',
                        value: { action: 'deactivate' },
                        room: roomRef.current,
                        source: 'gm'
                      });
                    }}
                  >
                    REMOVE ENEMY
                  </EmitRed>
                </div>
              </div>

              {/* Hyperdrive Controls */}
              <div style={{ marginTop: 15, marginBottom: 10 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 8, fontWeight: 'bold' }}>
                  HYPERDRIVE CONTROL:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                  <EmitButton onClick={() => {
                    socket?.emit('gm_broadcast', {
                      type: 'hyperdrive_control',
                      value: { action: 'force_ready' },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>READY</EmitButton>
                  <EmitButton onClick={() => {
                    socket?.emit('gm_broadcast', {
                      type: 'hyperdrive_control',
                      value: { action: 'force_charge' },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>CHARGE</EmitButton>
                  <EmitButton onClick={() => {
                    socket?.emit('gm_broadcast', {
                      type: 'hyperdrive_control',
                      value: { action: 'force_jump' },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>JUMP</EmitButton>
                  <EmitRed onClick={() => {
                    socket?.emit('gm_broadcast', {
                      type: 'hyperdrive_control',
                      value: { action: 'emergency_stop' },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>ABORT</EmitRed>
                  <EmitRed onClick={() => {
                    socket?.emit('gm_broadcast', {
                      type: 'hyperdrive_control',
                      value: { action: 'disable' },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>DISABLE</EmitRed>
                  <EmitButton onClick={() => {
                    socket?.emit('gm_broadcast', {
                      type: 'hyperdrive_control',
                      value: { action: 'cooldown' },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>COOLDOWN</EmitButton>
                </div>
              </div>

              {/* Fuel & Resources */}
              <div style={{ marginTop: 15, marginBottom: 10 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 8, fontWeight: 'bold' }}>
                  FUEL CONTROL:
                </div>
                <Row>
                  <span>Current Fuel:</span>
                  <span style={{
                    color: (pilotState.fuelLevel ?? 0) < 25 ? '#ff0040' :
                      (pilotState.fuelLevel ?? 0) < 50 ? '#ffd700' : '#00ff88'
                  }}>
                    {(pilotState.fuelLevel ?? 0).toFixed(0)}%
                  </span>
                </Row>
                
                {/* Fuel Slider Control */}
                <div style={{ marginTop: 10, marginBottom: 10 }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: '#00ffff', fontSize: '0.8rem' }}>
                    Set Fuel Level: {pilotState.fuelLevel ?? 85}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={pilotState.fuelLevel ?? 85}
                    onChange={(e) => {
                      const newFuelLevel = parseInt(e.target.value);
                      console.log('⛽ GM setting fuel level via slider to:', newFuelLevel);
                      
                      // Update local GM state immediately for responsive UI
                      setPilotState(prev => ({
                        ...prev,
                        fuelLevel: newFuelLevel
                      }));
                      
                      // Also update the states object for consistency
                      setStates(prev => ({
                        ...prev,
                        navigation: {
                          ...prev.navigation,
                          fuelLevel: newFuelLevel
                        }
                      }));
                      
                      // Broadcast to navigation station
                      socket?.emit('gm_broadcast', {
                        type: 'fuel_control',
                        value: { action: 'set_level', level: newFuelLevel },
                        room: roomRef.current,
                        source: 'gm'
                      });
                    }}
                    style={{ 
                      width: '100%',
                      background: 'transparent',
                      cursor: 'pointer'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '0.7rem', color: '#666' }}>
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Fuel Macro Controls */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, marginTop: 8 }}>
                  <EmitRed onClick={() => {
                    const newFuelLevel = 0;
                    console.log('⛽ GM setting fuel to EMPTY (0%)');
                    
                    // Update local GM state immediately
                    setPilotState(prev => ({ ...prev, fuelLevel: newFuelLevel }));
                    setStates(prev => ({
                      ...prev,
                      navigation: { ...prev.navigation, fuelLevel: newFuelLevel }
                    }));
                    
                    socket?.emit('gm_broadcast', {
                      type: 'fuel_control',
                      value: { action: 'set_level', level: newFuelLevel },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>Empty</EmitRed>
                  <EmitRed onClick={() => {
                    const newFuelLevel = 10;
                    console.log('⛽ GM setting fuel to CRITICAL (10%)');
                    
                    // Update local GM state immediately
                    setPilotState(prev => ({ ...prev, fuelLevel: newFuelLevel }));
                    setStates(prev => ({
                      ...prev,
                      navigation: { ...prev.navigation, fuelLevel: newFuelLevel }
                    }));
                    
                    socket?.emit('gm_broadcast', {
                      type: 'fuel_control',
                      value: { action: 'set_level', level: newFuelLevel },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>Critical</EmitRed>
                  <EmitButton onClick={() => {
                    const newFuelLevel = 75;
                    console.log('⛽ GM setting fuel to NORMAL (75%)');
                    
                    // Update local GM state immediately
                    setPilotState(prev => ({ ...prev, fuelLevel: newFuelLevel }));
                    setStates(prev => ({
                      ...prev,
                      navigation: { ...prev.navigation, fuelLevel: newFuelLevel }
                    }));
                    
                    socket?.emit('gm_broadcast', {
                      type: 'fuel_control',
                      value: { action: 'set_level', level: newFuelLevel },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>Normal</EmitButton>
                  <EmitButton onClick={() => {
                    const newFuelLevel = 100;
                    console.log('⛽ GM setting fuel to FULL (100%)');
                    
                    // Update local GM state immediately
                    setPilotState(prev => ({ ...prev, fuelLevel: newFuelLevel }));
                    setStates(prev => ({
                      ...prev,
                      navigation: { ...prev.navigation, fuelLevel: newFuelLevel }
                    }));
                    
                    socket?.emit('gm_broadcast', {
                      type: 'fuel_control',
                      value: { action: 'set_level', level: newFuelLevel },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>Full</EmitButton>
                </div>
              </div>

              {/* Engine Temperature Control */}
              <div style={{ marginTop: 15, marginBottom: 10 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 8, fontWeight: 'bold' }}>
                  ENGINE TEMPERATURE CONTROL:
                </div>
                <Row>
                  <span>Current Engine Temp:</span>
                  <span style={{
                    color: (pilotState.engineTemp ?? 0) > 80 ? '#ff0040' :
                      (pilotState.engineTemp ?? 0) > 60 ? '#ffd700' : '#00ff88'
                  }}>
                    {(pilotState.engineTemp ?? 0).toFixed(0)}°C
                  </span>
                </Row>
                
                {/* Temperature Slider Control */}
                <div style={{ marginTop: 10, marginBottom: 10 }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: '#00ffff', fontSize: '0.8rem' }}>
                    Set Engine Temperature: {pilotState.engineTemp ?? 45}°C
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="120"
                    step="1"
                    value={pilotState.engineTemp ?? 45}
                    onChange={(e) => {
                      const newEngineTemp = parseInt(e.target.value);
                      console.log('🌡️ GM setting engine temperature via slider to:', newEngineTemp);
                      
                      // Update local GM state immediately for responsive UI
                      setPilotState(prev => ({
                        ...prev,
                        engineTemp: newEngineTemp
                      }));
                      
                      // Also update the states object for consistency
                      setStates(prev => ({
                        ...prev,
                        navigation: {
                          ...prev.navigation,
                          engineTemp: newEngineTemp
                        }
                      }));
                      
                      // Broadcast to navigation station
                      socket?.emit('gm_broadcast', {
                        type: 'engine_temp_control',
                        value: { action: 'set_temperature', temperature: newEngineTemp },
                        room: roomRef.current,
                        source: 'gm'
                      });
                    }}
                    style={{ 
                      width: '100%',
                      background: 'linear-gradient(90deg, #00ff88 0%, #ffff00 50%, #ff8800 75%, #ff0040 100%)',
                      height: '6px',
                      borderRadius: '3px',
                      outline: 'none',
                      cursor: 'pointer',
                      accentColor: 'var(--gm-yellow)'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '0.7rem', color: '#666' }}>
                    <span>0°C</span>
                    <span>30°C</span>
                    <span>60°C</span>
                    <span>90°C</span>
                    <span>120°C</span>
                  </div>
                </div>

                {/* Temperature Macro Controls */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, marginTop: 8 }}>
                  <EmitButton onClick={() => {
                    const newEngineTemp = 20;
                    console.log('🌡️ GM setting engine temp to COLD (20°C)');
                    
                    // Update local GM state immediately
                    setPilotState(prev => ({ ...prev, engineTemp: newEngineTemp }));
                    setStates(prev => ({
                      ...prev,
                      navigation: { ...prev.navigation, engineTemp: newEngineTemp }
                    }));
                    
                    socket?.emit('gm_broadcast', {
                      type: 'engine_temp_control',
                      value: { action: 'set_temperature', temperature: newEngineTemp },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>Cold</EmitButton>
                  <EmitButton onClick={() => {
                    const newEngineTemp = 45;
                    console.log('🌡️ GM setting engine temp to NORMAL (45°C)');
                    
                    // Update local GM state immediately
                    setPilotState(prev => ({ ...prev, engineTemp: newEngineTemp }));
                    setStates(prev => ({
                      ...prev,
                      navigation: { ...prev.navigation, engineTemp: newEngineTemp }
                    }));
                    
                    socket?.emit('gm_broadcast', {
                      type: 'engine_temp_control',
                      value: { action: 'set_temperature', temperature: newEngineTemp },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>Normal</EmitButton>
                  <EmitButton onClick={() => {
                    const newEngineTemp = 75;
                    console.log('🌡️ GM setting engine temp to WARM (75°C)');
                    
                    // Update local GM state immediately
                    setPilotState(prev => ({ ...prev, engineTemp: newEngineTemp }));
                    setStates(prev => ({
                      ...prev,
                      navigation: { ...prev.navigation, engineTemp: newEngineTemp }
                    }));
                    
                    socket?.emit('gm_broadcast', {
                      type: 'engine_temp_control',
                      value: { action: 'set_temperature', temperature: newEngineTemp },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>Warm</EmitButton>
                  <EmitRed onClick={() => {
                    const newEngineTemp = 95;
                    console.log('🌡️ GM setting engine temp to CRITICAL (95°C)');
                    
                    // Update local GM state immediately
                    setPilotState(prev => ({ ...prev, engineTemp: newEngineTemp }));
                    setStates(prev => ({
                      ...prev,
                      navigation: { ...prev.navigation, engineTemp: newEngineTemp }
                    }));
                    
                    socket?.emit('gm_broadcast', {
                      type: 'engine_temp_control',
                      value: { action: 'set_temperature', temperature: newEngineTemp },
                      room: roomRef.current,
                      source: 'gm'
                    });
                  }}>Critical</EmitRed>
                </div>
              </div>

              {/* Hypermatter Control */}
              <div style={{ marginTop: 15, marginBottom: 10 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 8, fontWeight: 'bold' }}>
                  HYPERMATTER CONTROL:
                </div>
                <div style={{
                  background: 'rgba(0, 0, 0, 0.6)',
                  border: '1px solid var(--gm-blue)',
                  borderRadius: '4px',
                  padding: '10px',
                  marginBottom: '8px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px'
                  }}>
                    <span style={{ fontSize: '10px', color: '#888888' }}>0 tons</span>
                    <span style={{
                      fontSize: '14px',
                      color: 'var(--gm-green)',
                      fontWeight: 'bold',
                      textShadow: '0 0 5px currentColor'
                    }}>
                      {(states.navigation?.hypermatter?.current ?? 80).toFixed(0)} tons
                    </span>
                    <span style={{ fontSize: '10px', color: '#888888' }}>80 tons</span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="80"
                    step="1"
                    value={states.navigation?.hypermatter?.current ?? 80}
                    onChange={(e) => {
                      const newAmount = parseInt(e.target.value);
                      // Update GM's local state
                      setStates(prev => ({
                        ...prev,
                        navigation: {
                          ...prev.navigation,
                          hypermatter: {
                            ...prev.navigation?.hypermatter,
                            current: newAmount
                          }
                        }
                      }));
                      // Broadcast to Navigation station
                      socket?.emit('gm_broadcast', {
                        type: 'hypermatter_control',
                        value: { action: 'set_amount', amount: newAmount },
                        room: roomRef.current,
                        source: 'gm',
                      });
                    }}
                    style={{
                      width: '100%',
                      height: '6px',
                      background: 'linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00ff00, #0088ff)',
                      borderRadius: '3px',
                      outline: 'none',
                      cursor: 'pointer',
                      accentColor: 'var(--gm-green)'
                    }}
                  />

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '6px',
                    fontSize: '9px',
                    color: '#666666'
                  }}>
                    <span>Empty</span>
                    <span>Low</span>
                    <span>Full</span>
                  </div>
                </div>

                {/* Hypermatter Quick Controls */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4 }}>
                  <EmitButton onClick={() => {
                    const fullAmount = 80;
                    setStates(prev => ({
                      ...prev,
                      navigation: {
                        ...prev.navigation,
                        hypermatter: {
                          ...prev.navigation?.hypermatter,
                          current: fullAmount
                        }
                      }
                    }));
                    socket?.emit('gm_broadcast', {
                      type: 'hypermatter_control',
                      value: { action: 'refill' },
                      room: roomRef.current,
                      source: 'gm',
                    });
                  }}>REFILL</EmitButton>
                  <EmitButton onClick={() => {
                    socket?.emit('gm_broadcast', {
                      type: 'hypermatter_control',
                      value: { action: 'add', amount: 25 },
                      room: roomRef.current,
                      source: 'gm',
                    });
                  }}>+25</EmitButton>
                  <EmitRed onClick={() => {
                    socket?.emit('gm_broadcast', {
                      type: 'hypermatter_control',
                      value: { action: 'drain', amount: 25 },
                      room: roomRef.current,
                      source: 'gm',
                    });
                  }}>-25</EmitRed>
                  <EmitRed onClick={() => {
                    const criticalAmount = 5;
                    setStates(prev => ({
                      ...prev,
                      navigation: {
                        ...prev.navigation,
                        hypermatter: {
                          ...prev.navigation?.hypermatter,
                          current: criticalAmount
                        }
                      }
                    }));
                    socket?.emit('gm_broadcast', {
                      type: 'hypermatter_control',
                      value: { action: 'critical', amount: criticalAmount },
                      room: roomRef.current,
                      source: 'gm',
                    });
                  }}>CRITICAL</EmitRed>
                </div>
              </div>

              {/* ACTUATOR Display - Exact Duplicate of Navigation Station */}
              <div style={{ marginTop: 20, marginBottom: 10 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--gm-yellow)', marginBottom: 8, fontWeight: 'bold' }}>
                  PILOT ACTUATOR VIEW:
                </div>
                <div style={{
                  background: 'rgba(0, 0, 0, 0.8)',
                  border: '2px solid var(--gm-blue)',
                  borderRadius: '8px',
                  padding: '10px',
                  textAlign: 'center'
                }}>
                  <h4 style={{
                    margin: '0 0 10px 0',
                    color: 'var(--gm-blue)',
                    fontSize: '0.9rem',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                  }}>ACTUATOR</h4>

                  <GMActuatorCanvas imageData={actuatorImage} />

                  <div style={{ fontSize: '0.6em', color: 'var(--gm-green)', marginTop: '8px' }}>
                    Speed: {pilotState.speed}% |
                    Heading: {pilotState.heading.x}°, {pilotState.heading.y}°
                  </div>

                  <div style={{ fontSize: '0.6em', color: 'var(--gm-yellow)', marginTop: '5px' }}>
                    Hazard: {states.navigation?.asteroidField?.environmentalHazard?.active ?
                      `${(states.navigation.asteroidField.environmentalHazard.type ?? 'none').toUpperCase()} (${states.navigation.asteroidField.environmentalHazard.intensity ?? ''})` :
                      'None'}
                  </div>

                  <div style={{ fontSize: '0.6em', color: 'var(--gm-red)', marginTop: '5px' }}>
                    {states.navigation?.asteroidField?.gameActive ? 'ASTEROID GAME ACTIVE' : ''}
                  </div>
                </div>
              </div>


            </>
          )}
        </Panel>

        {/* WEAPONS */}
        <Panel collapsed={collapsed.weapons}>
          <PanelHeader onClick={() => toggleCollapse('weapons')}>
            <PanelTitle>Weapons</PanelTitle>
            <CollapseBtn>{collapsed.weapons ? '▲' : '▼'}</CollapseBtn>
          </PanelHeader>
          {!collapsed.weapons && (
            <>
              <Row>
                <span>Power:</span>
                <span>{states.weapons?.weapons?.powerLevel ?? '—'}%</span>
              </Row>
              <Row>
                <span>Heat:</span>
                <span>{states.weapons?.weapons?.heatLevel ?? '—'}%</span>
              </Row>
              <Row>
                <span>Lock:</span>
                <span>{states.weapons?.targeting?.lockStatus ?? '—'}</span>
              </Row>
              <div style={{ marginTop: 10 }}>
                <EmitButton onClick={() => emit('fire_primary_weapons', {})}>Fire Primaries</EmitButton>
                <EmitButton onClick={() => emit('fire_torpedo', { type: 'proton' })}>
                  Fire Proton
                </EmitButton>
                <EmitRed onClick={() => emit('clear_all_assigned_weapons', {})}>
                  Strip All Weapons
                </EmitRed>
              </div>

              {/* Weapon Management Controls */}
              <div style={{ 
                marginTop: 15, 
                padding: '10px', 
                border: '1px solid var(--gm-blue)', 
                borderRadius: '4px',
                backgroundColor: 'rgba(0, 136, 255, 0.1)'
              }}>
                <div style={{ 
                  fontSize: '0.9rem', 
                  color: 'var(--gm-blue)', 
                  marginBottom: '8px', 
                  fontWeight: 'bold' 
                }}>
                  WEAPON MANAGEMENT:
                </div>
                
                {/* Primary Weapons Management */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gm-yellow)', marginBottom: '4px' }}>
                    Primary Weapons:
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                    <select
                      id="primary-weapon-select"
                      style={{
                        flex: 1,
                        background: '#111',
                        border: '1px solid var(--gm-blue)',
                        color: '#eee',
                        padding: '4px',
                        borderRadius: '4px',
                        fontSize: '0.7rem'
                      }}
                    >
                      <option value="">Select Primary Weapon</option>
                      <option value="Auto-Blaster">Auto-Blaster</option>
                      <option value="Blaster Cannon (Light)">Blaster Cannon (Light)</option>
                      <option value="Blaster Cannon (Heavy)">Blaster Cannon (Heavy)</option>
                      <option value="AX-108 Surface-Defense Blaster Cannon">AX-108 Surface-Defense</option>
                      <option value="Ion Cannon (Light)">Ion Cannon (Light)</option>
                      <option value="Ion Cannon (Medium)">Ion Cannon (Medium)</option>
                      <option value="Ion Cannon (Heavy)">Ion Cannon (Heavy)</option>
                      <option value="Laser Cannon (Light)">Laser Cannon (Light)</option>
                      <option value="Laser Cannon (Medium)">Laser Cannon (Medium)</option>
                      <option value="Laser Cannon (Heavy)">Laser Cannon (Heavy)</option>
                      <option value="Quad Laser Cannon">Quad Laser Cannon</option>
                      <option value="Turbolaser (Light)">Turbolaser (Light)</option>
                      <option value="Turbolaser (Medium)">Turbolaser (Medium)</option>
                      <option value="Turbolaser (Heavy)">Turbolaser (Heavy)</option>
                    </select>
                    <EmitButton onClick={() => {
                      const select = document.getElementById('primary-weapon-select') as HTMLSelectElement;
                      if (select?.value) {
                        console.log('🔫 GM Station: Adding primary weapon:', select.value);
                        sendBroadcast('add_primary_weapon', {
                          weapon: select.value
                        });
                        select.value = '';
                      }
                    }}>
                      Add
                    </EmitButton>
                  </div>
                  <EmitRed onClick={() => {
                    sendBroadcast('clear_primary_weapons', {});
                  }}>
                    Clear Primary
                  </EmitRed>
                </div>

                {/* Secondary Weapons Management */}
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gm-yellow)', marginBottom: '4px' }}>
                    Secondary Weapons:
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                    <select
                      id="secondary-weapon-select"
                      style={{
                        flex: 1,
                        background: '#111',
                        border: '1px solid var(--gm-blue)',
                        color: '#eee',
                        padding: '4px',
                        borderRadius: '4px',
                        fontSize: '0.7rem'
                      }}
                    >
                      <option value="">Select Secondary Weapon</option>
                      <option value="Missile Launcher">Missile Launcher</option>
                      <option value="Missile Pack">Missile Pack</option>
                      <option value="Mini-Missile Pack">Mini-Missile Pack</option>
                      <option value="Mini-Missile Tube">Mini-Missile Tube</option>
                      <option value="Concussion Missile">Concussion Missile</option>
                      <option value="Concussion Missile (mini)">Concussion Missile (mini)</option>
                      <option value="Torpedo Launcher">Torpedo Launcher</option>
                      <option value="Proton Torpedo">Proton Torpedo</option>
                      <option value="Tractor Beam (Light)">Tractor Beam (Light)</option>
                      <option value="Tractor Beam (Medium)">Tractor Beam (Medium)</option>
                      <option value="Tractor Beam (Heavy)">Tractor Beam (Heavy)</option>
                      <option value="Tactical Tractor Beam">Tactical Tractor Beam</option>
                      <option value="Minelayer">Minelayer</option>
                      <option value="Concussion Mine">Concussion Mine</option>
                      <option value="Connor Net">Connor Net</option>
                      <option value="Gravity Mine">Gravity Mine</option>
                      <option value="Ion Mine">Ion Mine</option>
                      <option value="Seeker Mine">Seeker Mine</option>
                    </select>
                    <EmitButton onClick={() => {
                      const select = document.getElementById('secondary-weapon-select') as HTMLSelectElement;
                      if (select?.value) {
                        console.log('🔫 GM Station: Adding secondary weapon:', select.value);
                        sendBroadcast('add_secondary_weapon', {
                          weapon: select.value
                        });
                        select.value = '';
                      }
                    }}>
                      Add
                    </EmitButton>
                  </div>
                  <EmitRed onClick={() => {
                    sendBroadcast('clear_secondary_weapons', {});
                  }}>
                    Clear Secondary
                  </EmitRed>
                </div>
              </div>

              {/* Enemy Spawning Controls */}
              <div style={{ 
                marginTop: 15, 
                padding: '10px', 
                border: '1px solid var(--gm-red)', 
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 0, 64, 0.1)'
              }}>
                <div style={{ 
                  fontSize: '0.9rem', 
                  color: 'var(--gm-red)', 
                  marginBottom: '8px', 
                  fontWeight: 'bold' 
                }}>
                  ENEMY SPAWNING:
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                  <EmitButton onClick={() => {
                    const enemyId = `enemy-${Date.now()}`;
                    sendBroadcast('spawn_enemy_ship', {
                      id: enemyId,
                      x: Math.random() * 360,
                      y: 60 + Math.random() * 30,
                      heading: Math.random() * 360,
                      speed: 25 + Math.random() * 30,
                      size: 1 + Math.random() * 1.5,
                      hp: 100,
                      shields: 60,
                      ecmFreq: Math.floor(Math.random() * 1000)
                    });
                  }}>
                    Spawn Fighter
                  </EmitButton>
                  
                  <EmitButton onClick={() => {
                    const enemyId = `cruiser-${Date.now()}`;
                    sendBroadcast('spawn_enemy_ship', {
                      id: enemyId,
                      x: Math.random() * 360,
                      y: 50 + Math.random() * 25,
                      heading: Math.random() * 360,
                      speed: 15 + Math.random() * 20,
                      size: 2 + Math.random() * 1,
                      hp: 200,
                      shields: 120,
                      ecmFreq: Math.floor(Math.random() * 1000)
                    });
                  }}>
                    Spawn Cruiser
                  </EmitButton>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                  <EmitButton onClick={() => {
                    sendBroadcast('wave_spawn', {
                      count: 3,
                      ecmFreqs: Array.from({ length: 3 }, () => Math.floor(Math.random() * 1000))
                    });
                  }}>
                    Spawn Wave (3)
                  </EmitButton>
                  
                  <EmitRed onClick={() => {
                    const bossId = `boss-${Date.now()}`;
                    sendBroadcast('boss_spawn', {
                      id: bossId,
                      ecmFreq: Math.floor(Math.random() * 1000)
                    });
                  }}>
                    Spawn Boss
                  </EmitRed>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <EmitButton onClick={() => {
                    sendBroadcast('ecm_burst', {});
                  }}>
                    ECM Burst
                  </EmitButton>
                  
                  <EmitRed onClick={() => {
                    sendBroadcast('clear_all_enemies', {});
                  }}>
                    Clear All
                  </EmitRed>
                </div>
              </div>

              {/* Ally Spawning Controls */}
              <div style={{ 
                marginTop: 15, 
                padding: '10px', 
                border: '1px solid var(--gm-green)', 
                borderRadius: '4px',
                backgroundColor: 'rgba(0, 255, 136, 0.1)'
              }}>
                <div style={{ 
                  fontSize: '0.9rem', 
                  color: 'var(--gm-green)', 
                  marginBottom: '8px', 
                  fontWeight: 'bold' 
                }}>
                  ALLY SPAWNING:
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                  <EmitButton onClick={() => {
                    const allyId = `ally-${Date.now()}`;
                    sendBroadcast('spawn_ally_ship', {
                      id: allyId,
                      x: Math.random() * 360,
                      y: 60 + Math.random() * 30,
                      heading: Math.random() * 360,
                      speed: 25 + Math.random() * 30,
                      size: 1 + Math.random() * 1.5,
                      hp: 120,
                      shields: 80,
                      ecmFreq: Math.floor(Math.random() * 1000),
                      faction: 'ally'
                    });
                  }}>
                    Spawn Ally Fighter
                  </EmitButton>
                  
                  <EmitButton onClick={() => {
                    const allyId = `ally-cruiser-${Date.now()}`;
                    sendBroadcast('spawn_ally_ship', {
                      id: allyId,
                      x: Math.random() * 360,
                      y: 50 + Math.random() * 25,
                      heading: Math.random() * 360,
                      speed: 15 + Math.random() * 20,
                      size: 2 + Math.random() * 1,
                      hp: 250,
                      shields: 150,
                      ecmFreq: Math.floor(Math.random() * 1000),
                      faction: 'ally'
                    });
                  }}>
                    Spawn Ally Cruiser
                  </EmitButton>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <EmitButton onClick={() => {
                    sendBroadcast('ally_squadron_spawn', {
                      count: 4,
                      ecmFreqs: Array.from({ length: 4 }, () => Math.floor(Math.random() * 1000)),
                      faction: 'ally'
                    });
                  }}>
                    Spawn Squadron (4)
                  </EmitButton>
                  
                  <EmitButton onClick={() => {
                    sendBroadcast('clear_all_allies', {});
                  }}>
                    Clear Allies
                  </EmitButton>
                </div>
              </div>

              {/* Neutral Spawning Controls */}
              <div style={{ 
                marginTop: 15, 
                padding: '10px', 
                border: '1px solid var(--gm-yellow)', 
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 215, 0, 0.1)'
              }}>
                <div style={{ 
                  fontSize: '0.9rem', 
                  color: 'var(--gm-yellow)', 
                  marginBottom: '8px', 
                  fontWeight: 'bold' 
                }}>
                  NEUTRAL SPAWNING:
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                  <EmitButton onClick={() => {
                    const neutralId = `neutral-${Date.now()}`;
                    sendBroadcast('spawn_neutral_ship', {
                      id: neutralId,
                      x: Math.random() * 360,
                      y: 60 + Math.random() * 30,
                      heading: Math.random() * 360,
                      speed: 20 + Math.random() * 25,
                      size: 1 + Math.random() * 1.2,
                      hp: 80,
                      shields: 40,
                      ecmFreq: Math.floor(Math.random() * 1000),
                      faction: 'neutral'
                    });
                  }}>
                    Spawn Trader
                  </EmitButton>
                  
                  <EmitButton onClick={() => {
                    const neutralId = `neutral-transport-${Date.now()}`;
                    sendBroadcast('spawn_neutral_ship', {
                      id: neutralId,
                      x: Math.random() * 360,
                      y: 50 + Math.random() * 25,
                      heading: Math.random() * 360,
                      speed: 10 + Math.random() * 15,
                      size: 2.5 + Math.random() * 1,
                      hp: 150,
                      shields: 60,
                      ecmFreq: Math.floor(Math.random() * 1000),
                      faction: 'neutral'
                    });
                  }}>
                    Spawn Transport
                  </EmitButton>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <EmitButton onClick={() => {
                    sendBroadcast('neutral_convoy_spawn', {
                      count: 3,
                      ecmFreqs: Array.from({ length: 3 }, () => Math.floor(Math.random() * 1000)),
                      faction: 'neutral'
                    });
                  }}>
                    Spawn Convoy (3)
                  </EmitButton>
                  
                  <EmitButton onClick={() => {
                    sendBroadcast('clear_all_neutrals', {});
                  }}>
                    Clear Neutrals
                  </EmitButton>
                </div>
              </div>
            </>
          )}
        </Panel>

        {/* ENGINEERING */}
        <Panel collapsed={collapsed.eng}>
          <PanelHeader onClick={() => toggleCollapse('eng')}>
            <PanelTitle>Engineering</PanelTitle>
            <CollapseBtn>{collapsed.eng ? '▲' : '▼'}</CollapseBtn>
          </PanelHeader>
          {!collapsed.eng && (
            <>
              <Row>
                <span>Reactor:</span>
                <span>{states.engineering?.powerDistribution?.reactorOutput ?? '—'}%</span>
              </Row>
              <Row>
                <span>Available:</span>
                <span>{states.engineering?.powerDistribution?.totalPower ?? '—'}%</span>
              </Row>
              <Row>
                <span>Emergency:</span>
                <span>{states.engineering?.powerDistribution?.emergencyPower ? 'ON' : 'OFF'}</span>
              </Row>
              <div style={{ marginTop: 10 }}>
                <EmitButton onClick={() => emit('toggle_emergency_power', true)}>
                  Emergency ON
                </EmitButton>
                <EmitButton
                  onClick={() =>
                    emit('set_power_allocation', {
                      weapons: 50,
                      shields: 50,
                      engines: 50,
                      sensors: 20,
                      lifeSupport: 20,
                      communications: 10,
                      maxAvailable: 200,
                    })
                  }
                >
                  Overload All
                </EmitButton>
              </div>
            </>
          )}
        </Panel>

        {/* GLOBAL PRESETS */}
        <Panel collapsed={collapsed.presets}>
          <PanelHeader onClick={() => toggleCollapse('presets')}>
            <PanelTitle>Global Presets</PanelTitle>
            <CollapseBtn>{collapsed.presets ? '▲' : '▼'}</CollapseBtn>
          </PanelHeader>
          {!collapsed.presets && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <EmitButton
                onClick={() => {
                  emit('red_alert', true);
                  emit('toggle_emergency_power', true);
                }}
              >
                RED ALERT
              </EmitButton>
              <EmitButton
                onClick={() => {
                  emit('clear_all_assigned_weapons', {});
                  emit('weapons_offline', true);
                }}
              >
                Weapons Offline
              </EmitButton>
              <EmitButton onClick={() => emit('hyperdrive_ready', true)}>
                Hyperdrive Ready
              </EmitButton>
              <EmitButton onClick={() => emit('fuel_empty', true)}>Empty Fuel</EmitButton>
            </div>
          )}
        </Panel>

        {/* RAW EMITTER */}
        <Panel collapsed={collapsed.raw}>
          <PanelHeader onClick={() => toggleCollapse('raw')}>
            <PanelTitle>Raw Emitter</PanelTitle>
            <CollapseBtn>{collapsed.raw ? '▲' : '▼'}</CollapseBtn>
          </PanelHeader>
          {!collapsed.raw && (
            <div>
              <textarea
                placeholder='{ "action": "set_speed", "value": 50, "target": "navigation" }'
                style={{
                  width: '100%',
                  height: 60,
                  background: '#111',
                  border: '1px solid var(--gm-blue)',
                  color: '#eee',
                  borderRadius: 4,
                  fontSize: 12,
                  padding: 6,
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    try {
                      const json = JSON.parse(e.currentTarget.value);
                      emit(json.action, json.value, json.target);
                      e.currentTarget.value = '';
                    } catch { }
                  }
                }}
              />
              <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
                Ctrl+Enter to fire
              </div>
            </div>
          )}
        </Panel>
      </PanelsGrid>
    </Container>
  );
};

export default GMStation;
