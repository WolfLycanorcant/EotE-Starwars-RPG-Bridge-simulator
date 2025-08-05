import React, { useEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import { io, Socket } from 'socket.io-client';
import { GameState } from '../types';

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
    // Use relative connection for ngrok compatibility
    // This will connect to the same domain/port as the React app
    console.log(' GM Station connecting to current domain');
    const s = io();
    setSocket(s);

    // Connection testing
    s.on('connect', () => {
      console.log(' GM Station connected to server:', s.id);
    });

    s.on('connect_error', (error) => {
      console.error(' GM Station connection failed:', error);
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

    const room = new URLSearchParams(window.location.search).get('room') || 'default';
    roomRef.current = room;

    s.emit('join', { room: roomRef.current, station: 'gm' });

    /* Listen for GM broadcasts (including our own messages) */
    s.on('gm_broadcast', (data: { type: string; value: any; room: string; source: string }) => {
      console.log('GM received gm_broadcast:', data);

      switch (data.type) {
        case 'new_message':
          // ignore our own messages so we don't duplicate them
          if (data.source === 'communications') {
            setCommsTransmissions(prev => [...prev, data.value]);
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
      setStates((prev) => ({ ...prev, [payload.station]: payload.state }));
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

        {/* NAVIGATION */}
        <Panel collapsed={collapsed.nav}>
          <PanelHeader onClick={() => toggleCollapse('nav')}>
            <PanelTitle>Navigation</PanelTitle>
            <CollapseBtn>{collapsed.nav ? '▲' : '▼'}</CollapseBtn>
          </PanelHeader>
          {!collapsed.nav && (
            <>
              <Row>
                <span>Speed:</span>
                <span>{states.navigation?.speed ?? '—'}</span>
              </Row>
              <Row>
                <span>Altitude:</span>
                <span>{states.navigation?.altitude?.toFixed(0) ?? '—'}</span>
              </Row>
              <Row>
                <span>Fuel:</span>
                <span>{states.navigation?.fuelLevel ?? '—'}%</span>
              </Row>
              <Row>
                <span>Hyperdrive:</span>
                <span>{states.navigation?.hyperdriveStatus ?? '—'}</span>
              </Row>
              <div style={{ marginTop: 10 }}>
                <EmitButton onClick={() => emit('set_speed', 100)}>Max Speed</EmitButton>
                <EmitButton onClick={() => emit('hyperdrive_jump', 1)}>Force Jump</EmitButton>
                <EmitRed onClick={() => emit('set_speed', 0)}>Full Stop</EmitRed>
                <EmitButton onClick={() => emit('emergency_power', true)}>Emergency PWR</EmitButton>
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