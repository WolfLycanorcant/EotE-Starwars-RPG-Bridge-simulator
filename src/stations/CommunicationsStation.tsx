import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { GameState } from '../types';
import { shipStore, Ship } from '../stores/shipStore';

interface CommunicationsStationProps {
  gameState: GameState;
  onPlayerAction: (action: string, value: any) => void;
  socket: Socket | null;
}

const CommunicationsStation: React.FC<CommunicationsStationProps> = ({ gameState, onPlayerAction, socket }) => {
  const [messageText, setMessageText] = useState('');
  const [recipient, setRecipient] = useState('All Stations');
  const [messagePriority, setMessagePriority] = useState<'low' | 'normal' | 'high' | 'emergency'>('normal');

  // Helper function for logging socket emissions

  // Real-time communication state
  const [currentSignalStrength, setCurrentSignalStrength] = useState(85);
  const [currentInterference, setCurrentInterference] = useState(15);
  const [baseSignalStrength, setBaseSignalStrength] = useState(85);
  const [baseInterference, setBaseInterference] = useState(15);
  const [currentFrequency, setCurrentFrequency] = useState(121.5);
  const [messageQueue, setMessageQueue] = useState<any[]>([]);
  const [currentAnalysis, setCurrentAnalysis] = useState('normal');
  const [initialMessagesSent, setInitialMessagesSent] = useState(false);


  // Use central ship store instead of local state
  const [ships, setShips] = useState<Ship[]>(shipStore.getShips());
  const [currentRegion, setCurrentRegion] = useState<'Core Worlds' | 'Colonies' | 'Inner Rim' | 'Mid Rim' | 'Outer Rim' | 'Wild Space' | 'Unknown Regions'>(shipStore.getCurrentRegion() as any);

  // Emergency beacon state and flashing effect
  const [emergencyBeaconActive, setEmergencyBeaconActive] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);

  // Signal analysis scan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [fastForwardAnalysis, setFastForwardAnalysis] = useState(false);
  const [pinnedShips, setPinnedShips] = useState<Record<string, 'white' | 'red'>>(shipStore.getPinnedShips());
  const [doublePinnedShipId, setDoublePinnedShipId] = useState<string | null>(shipStore.getDoublePinnedShipId());

  // Add ref for isAnalysing to avoid stale closure in event listener
  const isAnalysingRef = useRef(isAnalysing);
  
  // LRC streaming ref
  const lrcRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<string>('default');

  useEffect(() => {
    isAnalysingRef.current = isAnalysing;
  }, [isAnalysing]);

  // Function to convert ships to targeting data and emit to weapons station
  const emitTargetingData = useCallback((currentShips: Ship[]) => {
    // Get top 5 ships (prioritize pinned ships, then by age/activity)
    const pinned = currentShips.filter(s => pinnedShips[s.id]);
    const unpinned = currentShips.filter(s => !pinnedShips[s.id]);
    const sortedShips = [...pinned, ...unpinned].slice(0, 5);

    // Get double-pinned ship details if exists
    const doublePinnedShip = doublePinnedShipId ?
      currentShips.find(s => s.id === doublePinnedShipId) : null;

    // Convert ships to targeting data
    const targetingData = sortedShips.map((ship, index) => {
      // Determine faction based on ship characteristics
      const faction = pinnedShips[ship.id] === 'red' ? 'hostile' :
        pinnedShips[ship.id] === 'white' ? 'friendly' :
          ship.designation ? 'neutral' : 'unknown';

      // Determine threat level based on ship status and pin state
      const threat = pinnedShips[ship.id] === 'red' ? 'critical' :
        ship.status === 'Active' && ship.designation ? 'medium' :
          ship.status === 'Active' ? 'high' : 'low';

      // Determine size based on designation or type
      const size = ship.designation?.toLowerCase().includes('destroyer') ||
        ship.designation?.toLowerCase().includes('cruiser') ? 'capital' :
        ship.designation?.toLowerCase().includes('frigate') ||
          ship.designation?.toLowerCase().includes('corvette') ? 'large' :
          ship.designation?.toLowerCase().includes('fighter') ||
            ship.designation?.toLowerCase().includes('interceptor') ? 'small' : 'medium';

      // Generate realistic position data (spread around the area)
      const angle = (index * 72 + Math.random() * 30) * (Math.PI / 180); // Spread evenly with some randomness
      const distance = 1000 + Math.random() * 7000; // 1-8km range
      const bearing = (angle * 180 / Math.PI) % 360;

      return {
        id: ship.id,
        type: 'ship' as const,
        position: {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          z: (Math.random() - 0.5) * 200
        },
        velocity: {
          x: (Math.random() - 0.5) * 50,
          y: (Math.random() - 0.5) * 50,
          z: (Math.random() - 0.5) * 10
        },
        size,
        threat,
        shields: ship.status === 'Active' ? Math.floor(Math.random() * 100) : 0,
        hull: ship.status === 'Active' ? Math.floor(Math.random() * 100) : Math.floor(Math.random() * 50),
        distance: Math.floor(distance),
        bearing: Math.floor(bearing),
        signature: Math.floor(Math.random() * 100),
        classification: ship.designation || `UNKNOWN-${ship.id.split('-')[0].toUpperCase()}`,
        faction,
        shipClass: ship.designation || 'Unknown Class',
        weaponSystems: size === 'capital' ? Math.floor(Math.random() * 20) + 10 :
          size === 'large' ? Math.floor(Math.random() * 10) + 5 :
            size === 'medium' ? Math.floor(Math.random() * 5) + 2 :
              Math.floor(Math.random() * 3) + 1,
        shieldStrength: ship.status === 'Active' ?
          (size === 'capital' ? 'heavy' :
            size === 'large' ? 'medium' :
              size === 'medium' ? 'light' : 'none') : 'none',
        isDoublePinned: ship.id === doublePinnedShipId
      };
    });

    // Emit to weapons station with double-pinned ship data
    if (socket) {
      const room = new URLSearchParams(window.location.search).get('room') || 'default';
      socket.emit('targeting_data_update', {
        room,
        targets: targetingData,
        source: 'communications',
        timestamp: Date.now(),
        doublePinnedShip: doublePinnedShip ? {
          id: doublePinnedShip.id,
          designation: doublePinnedShip.designation,
          status: doublePinnedShip.status
        } : null
      });
      console.log('📡 Communications Station emitting targeting data:', {
        totalShips: currentShips.length,
        pinnedShips: Object.keys(pinnedShips).length,
        emittedTargets: targetingData.length,
        doublePinnedShip: doublePinnedShip?.id,
        targetingData
      });
    }
  }, [socket, pinnedShips, doublePinnedShipId]);

  // Scan animation effect
  useEffect(() => {
    let scanInterval: NodeJS.Timeout;

    if (isScanning) {
      setScanProgress(0);
      scanInterval = setInterval(() => {
        setScanProgress(prev => {
          if (prev >= 100) {
            setIsScanning(false);
            setIsAnalysing(true); // Start analysis phase after scan completes
            return 0;
          }
          return prev + 2; // Increase by 2% every 50ms for 2.5 second scan
        });
      }, 50);
    }

    return () => {
      if (scanInterval) {
        clearInterval(scanInterval);
      }
    };
  }, [isScanning]);

  // Analysis animation effect (5 minute duration or fast-forward)
  useEffect(() => {
    let analysisInterval: NodeJS.Timeout;

    if (isAnalysing) {
      setAnalysisProgress(0);
      analysisInterval = setInterval(() => {
        setAnalysisProgress(prev => {
          if (prev >= 100) {
            setIsAnalysing(false);
            setFastForwardAnalysis(false); // Reset fast-forward flag
            return 0;
          }
          // Use fast increment if fast-forward is active, otherwise normal speed
          const increment = fastForwardAnalysis ? 5 : 0.033; // 5% for fast-forward, 0.033% for normal
          return prev + increment;
        });
      }, fastForwardAnalysis ? 50 : 100); // Faster interval for fast-forward
    }

    return () => {
      if (analysisInterval) {
        clearInterval(analysisInterval);
      }
    };
  }, [isAnalysing, fastForwardAnalysis]);

  // Emergency beacon flashing effect
  useEffect(() => {
    let flashInterval: NodeJS.Timeout;

    if (emergencyBeaconActive) {
      flashInterval = setInterval(() => {
        setIsFlashing(prev => !prev);
      }, 500); // Flash every 500ms
    } else {
      setIsFlashing(false);
    }

    return () => {
      if (flashInterval) {
        clearInterval(flashInterval);
      }
    };
  }, [emergencyBeaconActive]);

  // Signal strength and interference fluctuation effect
  useEffect(() => {
    const fluctuationInterval = setInterval(() => {
      // Signal strength fluctuation (±1.5 points around base value)
      const signalChange = (Math.random() - 0.5) * 3;
      const newSignalStrength = Math.max(0, Math.min(100, baseSignalStrength + signalChange));

      // Interference fluctuation (±1 point around base value)
      const interferenceChange = (Math.random() - 0.5) * 2;
      const newInterference = Math.max(0, Math.min(100, baseInterference + interferenceChange));

      setCurrentSignalStrength(Math.round(newSignalStrength));
      setCurrentInterference(Math.round(newInterference));
    }, 1000); // Update every second

    return () => {
      clearInterval(fluctuationInterval);
    };
  }, [baseSignalStrength, baseInterference]);

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

  // Organization list is now handled by the central ship store

  // Signal analysis options (matching GM Station)
  const signalAnalysisOptions = [
    { id: 'normal', name: 'Normal Scan', description: 'Standard signal analysis', effect: 'baseline' },
    { id: 'deep', name: 'Deep Scan', description: 'Enhanced signal penetration', effect: 'enhanced_range' },
    { id: 'encrypted', name: 'Decrypt Mode', description: 'Attempt to decrypt signals', effect: 'decrypt_attempt' },
    { id: 'jamming', name: 'Anti-Jam', description: 'Counter jamming attempts', effect: 'jam_resistance' },
    { id: 'triangulate', name: 'Triangulate', description: 'Locate signal source', effect: 'source_location' },
    { id: 'intercept', name: 'Intercept', description: 'Monitor enemy communications', effect: 'enemy_monitoring' },
    { id: 'boost', name: 'Signal Boost', description: 'Amplify weak signals', effect: 'signal_amplification' },
    { id: 'filter', name: 'Noise Filter', description: 'Remove background noise', effect: 'noise_reduction' }
  ];

  // Initialize ship store with socket
  useEffect(() => {
    if (socket) {
      const room = new URLSearchParams(window.location.search).get('room') || 'default';
      shipStore.setSocket(socket, room);
    }
  }, [socket]);

  // Subscribe to ship store updates
  useEffect(() => {
    const unsubscribe = shipStore.subscribe(() => {
      setShips(shipStore.getShips());
      setPinnedShips(shipStore.getPinnedShips());
      setDoublePinnedShipId(shipStore.getDoublePinnedShipId());
      setCurrentRegion(shipStore.getCurrentRegion() as any);
    });

    return unsubscribe;
  }, []);

  // Initialize socket listeners
  useEffect(() => {
    if (!socket) return;

    console.log('🔌 Communications Station using shared socket connection');

    // Get room from URL parameter
    const room = new URLSearchParams(window.location.search).get('room') || 'default';
    roomRef.current = room;

    // Join the room for proper message routing
    socket.emit('join', { room, station: 'communications' });

    // Listen for GM broadcasts
    socket.on('gm_broadcast', (data: { type: string; value: any; room: string; source: string }) => {
      console.log('🔊 Communications Station received GM broadcast:', data);

      switch (data.type) {
        case 'signal_strength_update':
          console.log('📶 Updating signal strength to:', data.value);
          setBaseSignalStrength(data.value);
          setCurrentSignalStrength(data.value);
          // Also update parent component
          onPlayerAction('set_signal_strength', data.value);
          break;
        case 'interference_update':
          console.log('📡 Updating interference to:', data.value);
          setBaseInterference(data.value);
          setCurrentInterference(data.value);
          // Also update parent component
          onPlayerAction('set_interference', data.value);
          break;
        case 'frequency_update':
          if (data.source === 'gm') {  // Only update if from GM
            console.log('📻 GM updating frequency to:', data.value);
            setCurrentFrequency(data.value);
            onPlayerAction('set_frequency', data.value);
          }
          break;
        case 'region_update':  // Add this case
          console.log('🌌 Communications Station received region update:', data.value);
          setCurrentRegion(data.value as any);
          break;
        case 'emergency_beacon_update':
          console.log('🚨 Emergency beacon state update:', data.value);
          setEmergencyBeaconActive(data.value);
          // Also update parent component
          onPlayerAction('toggle_emergency_beacon', data.value);
          break;
        case 'scan_response':
          // GM responded to scan - fast-forward analysis to completion
          if (data.source === 'gm' && isAnalysingRef.current) {
            console.log('🔍 Communications received scan response - fast-forwarding analysis to completion');
            setFastForwardAnalysis(true);
          }
          break;
        case 'new_message':
          // push GM message into the log
          console.log('📨 Received GM message:', data.value);
          setCurrentAnalysis(data.value.analysisMode || 'normal');
          setMessageQueue(prev => [...prev, data.value]);
          break;
      }
    });

    // Listen for frequency changes from OTHER stations only (not from self or GM)
    socket.on('comm_broadcast', (data: { type: string; value: number; room: string; source: string; }) => {
      if (data.type === 'frequency_update' && data.source !== 'gm' && data.source !== 'communications') {
        console.log('📻 External frequency update:', data.value, 'from:', data.source);
        setCurrentFrequency(data.value);
        onPlayerAction('set_frequency', data.value);
      }
    });

    // Add error handling for socket events
    socket.on('error', (error: any) => {
      console.error('🚨 Communications Station socket error:', error);
    });

    socket.on('connect_error', (error: any) => {
      console.error('🚨 Communications Station connection error:', error);
    });

    socket.on('disconnect', (reason: string) => {
      console.warn('⚠️ Communications Station disconnected:', reason);
    });

    return () => {
      socket.off('gm_broadcast');
      socket.off('comm_broadcast');
      socket.off('error');
      socket.off('connect_error');
      socket.off('disconnect');
    };
  }, [socket, onPlayerAction]);

  // LRC streaming: watch the LRC DOM and push HTML
  useEffect(() => {
    if (!socket || !lrcRef.current) return;

    const send = () => {
      const html = lrcRef.current!.innerHTML;
      socket.emit('lrc_update', { room: roomRef.current, html });
      console.log('📡 Communications Station sent LRC update, HTML length:', html.length);
    };

    // Initial send
    send();

    // Observe for any child/list/text changes
    const obs = new MutationObserver(() => send());
    obs.observe(lrcRef.current, { childList: true, subtree: true, characterData: true });

    // Answer snapshot requests from weapons
    const onReq = () => {
      console.log('📡 Communications Station received LRC snapshot request');
      send();
    };
    socket.on('lrc_request_from_weapons', onReq);

    return () => {
      obs.disconnect();
      socket.off('lrc_request_from_weapons', onReq);
    };
  }, [socket]);

  // Note: Frequency, signal strength, and interference are now handled by direct socket listeners
  // (gm_broadcast and comm_broadcast) to prevent conflicts with user input

  // Static initial Imperial message (generated once, never changes)
  const [initialImperialMessage] = useState(() => ({
    id: '1',
    from: 'Imperial Command',
    to: 'All Stations',
    content: `Maintain current heading. Rebel activity detected in sector ${getRandomSectorInfo()}.`,
    priority: 'high' as const,
    encrypted: false,
    timestamp: Date.now() - 300000,
    acknowledged: false
  }));

  // Mock data for demonstration
  const mockComms = {
    primaryFrequency: 121.5,
    secondaryFrequency: 243.0,
    signalStrength: 85,
    interference: 15,
    transmissionStatus: 'standby',
    emergencyBeacon: false,
    messageQueue: [initialImperialMessage]
  };

  // Send initial mock messages to GM when socket connects (only once)
  useEffect(() => {
    if (socket && !initialMessagesSent) {
      const room = new URLSearchParams(window.location.search).get('room') || 'default';

      // Send all existing mock messages to GM when first connecting
      mockComms.messageQueue.forEach(message => {
        socket.emit('gm_broadcast', {
          type: 'new_message',
          value: message,
          room,
          source: 'communications'
        });
      });

      setInitialMessagesSent(true);
    }
  }, [socket, initialMessagesSent, mockComms.messageQueue]);

  // Update ship store region when currentRegion changes
  useEffect(() => {
    shipStore.setCurrentRegion(currentRegion);
  }, [currentRegion]);

  // Emit targeting data whenever ships or pinned ships change
  useEffect(() => {
    if (ships.length > 0 && socket) {
      emitTargetingData(ships);
    }
  }, [ships, pinnedShips, doublePinnedShipId, socket]);

  // Broadcast ship data to weapons station whenever ships change
  useEffect(() => {
    if (socket) {
      const room = new URLSearchParams(window.location.search).get('room') || 'default';
      socket.emit('ship_data_update', {
        room,
        ships,
        pinnedShips,
        doublePinnedShipId,
        currentRegion,
        source: 'communications',
        timestamp: Date.now()
      });
    }
  }, [ships, pinnedShips, doublePinnedShipId, currentRegion, socket]);

  // Broadcast initial protocol when component mounts
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get('room') || 'default';
    socket?.emit('gm_broadcast', {
      type: 'composer_protocol_change',
      value: recipient,
      room,
      source: 'communications'
    });
  }, [socket]);

  // Ship management is now handled by the central ship store

  // Use real-time socket values instead of stale gameState
  const communications = {
    ...mockComms,
    ...gameState?.communications,
    signalStrength: currentSignalStrength,
    interference: currentInterference,
    primaryFrequency: currentFrequency,
    messageQueue: [...mockComms.messageQueue, ...messageQueue], // Combine mock messages with real GM messages
  };

  const adjustFrequency = (type: 'primary' | 'secondary', delta: number) => {
    const currentFreq = type === 'primary' ? communications.primaryFrequency : communications.secondaryFrequency;
    const newFreq = Math.max(0, Math.min(999.9, currentFreq + delta));
    onPlayerAction(type === 'primary' ? 'set_frequency' : 'set_secondary_frequency', newFreq);
  };


  const containerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gridTemplateRows: '1fr 1fr 200px',
    gap: '15px',
    padding: '15px',
    height: '100vh',
    overflowY: 'auto',
    overflowX: 'hidden',
    background: 'radial-gradient(circle at center, rgba(0, 255, 255, 0.05) 0%, rgba(0, 0, 0, 0.9) 100%)',
    // Emergency beacon flashing border effect
    border: emergencyBeaconActive && isFlashing ? '4px solid #ff0000' : '4px solid transparent',
    boxShadow: emergencyBeaconActive && isFlashing ? '0 0 30px rgba(255, 0, 0, 0.8), inset 0 0 30px rgba(255, 0, 0, 0.3)' : 'none',
    transition: 'border 0.1s ease, box-shadow 0.1s ease'
  };

  const panelStyle: React.CSSProperties = {
    background: 'rgba(0, 20, 20, 0.8)',
    border: '2px solid #00ffff',
    borderRadius: '8px',
    padding: '15px',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 0 20px rgba(0, 255, 255, 0.3)'
  };

  const panelTitleStyle: React.CSSProperties = {
    color: '#00ffff',
    margin: '0 0 15px 0',
    textAlign: 'center',
    fontSize: '1.1rem',
    textShadow: '0 0 10px currentColor',
    letterSpacing: '2px'
  };

  const buttonStyle: React.CSSProperties = {
    background: 'rgba(0, 255, 255, 0.1)',
    border: '1px solid #00ffff',
    color: '#00ffff',
    padding: '4px 8px',
    fontSize: '10px',
    cursor: 'pointer',
    borderRadius: '2px',
    transition: 'all 0.2s ease'
  };

  const inputStyle: React.CSSProperties = {
    background: 'rgba(0, 0, 0, 0.8)',
    border: '1px solid #00ffff',
    color: '#00ffff',
    padding: '8px',
    fontFamily: 'inherit',
    fontSize: '12px',
    borderRadius: '4px'
  };

  return (
    <div style={containerStyle}>
      {/* Frequency Control Panel */}
      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>SUBSPACE TRANSCEIVER</h3>

        <div style={{ marginBottom: '15px' }}>
          <div style={{
            background: 'rgba(0, 0, 0, 0.6)',
            border: '1px solid #00ffff',
            borderRadius: '4px',
            padding: '15px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '12px', color: '#888888', marginBottom: '8px' }}>PRIMARY FREQUENCY</div>
            <div style={{ fontSize: '24px', color: '#00ffff', fontWeight: 'bold', textShadow: '0 0 8px currentColor', marginBottom: '12px' }}>
              {currentFrequency.toFixed(1)} MHz
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
              <button style={buttonStyle} onClick={() => adjustFrequency('primary', -0.1)}>-0.1</button>
              <button style={buttonStyle} onClick={() => adjustFrequency('primary', -1)}>-1</button>
              <button style={buttonStyle} onClick={() => adjustFrequency('primary', 1)}>+1</button>
              <button style={buttonStyle} onClick={() => adjustFrequency('primary', 0.1)}>+0.1</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', margin: '10px 0' }}>
          <div style={{ width: '80px', fontSize: '11px', color: '#888888' }}>SIGNAL</div>
          <div style={{ flex: 1, height: '8px', background: '#001111', border: '1px solid #004444', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              background: 'linear-gradient(90deg, #ff0000, #ffff00, #00ff00)',
              transition: 'width 0.3s ease',
              width: `${currentSignalStrength}%`,
              boxShadow: currentSignalStrength > 75 ? '0 0 8px #00ff00' : currentSignalStrength > 50 ? '0 0 8px #ffff00' : '0 0 8px #ff0000'
            }}></div>
          </div>
          <div style={{
            width: '40px',
            textAlign: 'right',
            fontSize: '11px',
            color: currentSignalStrength > 75 ? '#00ff00' : currentSignalStrength > 50 ? '#ffff00' : '#ff0000',
            marginLeft: '10px',
            fontWeight: 'bold',
            textShadow: '0 0 5px currentColor'
          }}>{currentSignalStrength}%</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', margin: '10px 0' }}>
          <div style={{ width: '80px', fontSize: '11px', color: '#888888' }}>INTERFERENCE</div>
          <div style={{ flex: 1, height: '8px', background: '#001111', border: '1px solid #004444', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              background: 'linear-gradient(90deg, #00ff00, #ffff00, #ff0000)',
              transition: 'width 0.3s ease',
              width: `${currentInterference}%`,
              boxShadow: currentInterference < 25 ? '0 0 8px #00ff00' : currentInterference < 50 ? '0 0 8px #ffff00' : '0 0 8px #ff0000'
            }}></div>
          </div>
          <div style={{
            width: '40px',
            textAlign: 'right',
            fontSize: '11px',
            color: currentInterference < 25 ? '#00ff00' : currentInterference < 50 ? '#ffff00' : '#ff0000',
            marginLeft: '10px',
            fontWeight: 'bold',
            textShadow: '0 0 5px currentColor'
          }}>{currentInterference}%</div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px',
          margin: '10px 0',
          background: 'rgba(0, 0, 0, 0.5)',
          border: '1px solid #004444',
          borderRadius: '4px',
          color: '#00ffff',
          fontWeight: 'bold',
          fontSize: '12px'
        }}>
          {communications.transmissionStatus.toUpperCase()}
        </div>

        <button
          style={{
            background: emergencyBeaconActive ? 'rgba(255, 0, 0, 0.3)' : 'rgba(255, 0, 0, 0.1)',
            border: '2px solid #ff0000',
            color: '#ff0000',
            padding: '15px',
            fontFamily: 'inherit',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            borderRadius: '4px',
            marginTop: '15px',
            transition: 'all 0.3s ease'
          }}
          onClick={() => {
            const newBeaconState = !emergencyBeaconActive;
            setEmergencyBeaconActive(newBeaconState);
            onPlayerAction('toggle_emergency_beacon', newBeaconState);

            // Broadcast beacon state to GM station
            const room = new URLSearchParams(window.location.search).get('room') || 'default';
            socket?.emit('gm_broadcast', {
              type: 'emergency_beacon_update',
              value: newBeaconState,
              room,
              source: 'communications'
            });
          }}
        >
          EMERGENCY BEACON
          <br />
          {emergencyBeaconActive ? 'ACTIVE' : 'STANDBY'}
        </button>
      </div>

      {/* Message Composer */}
      <div style={panelStyle}>
        <h3 style={panelTitleStyle}>
          MESSAGE COMPOSER
          <br />
          <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>Available Encryption Protocols Installed</span>
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <select
            style={{ ...inputStyle, marginBottom: '10px' }}
            value={recipient}
            onChange={(e) => {
              setRecipient(e.target.value);
              const room = new URLSearchParams(window.location.search).get('room') || 'default';
              socket?.emit('gm_broadcast', {
                type: 'composer_protocol_change',
                value: e.target.value,
                room,
                source: 'communications'
              });
            }}
          >
            <option value="All Protocols (UNSECURE)">All Protocols (UNSECURE)</option>
            <option value="Imperial Public Channel (UNENCRYPTED)">Imperial Public Channel (UNENCRYPTED)</option>
            <option value="Rebel Command (512k ENCRYPTED)">Rebel Command (512k ENCRYPTED)</option>
            <option value="HTTPSSP (SECURE)">HTTPSSP (SECURE)</option>
            <option value="Marketing (UNENCRYPTED)">Marketing (UNENCRYPTED)</option>
            <option value="Imperial Treason Reports (UNENCRYPTED)">Imperial Treason Reports (UNENCRYPTED)</option>
            <option value="Bureau of Galactic Information News">Bureau of Galactic Information News</option>
          </select>

          <textarea
            style={{ ...inputStyle, resize: 'none', flex: 1, marginBottom: '10px' }}
            placeholder="Enter transmission..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            rows={6}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <select
              style={inputStyle}
              value={messagePriority}
              onChange={(e) => setMessagePriority(e.target.value as any)}
            >
              <option value="low">Low Priority</option>
              <option value="normal">Normal</option>
              <option value="high">High Priority</option>
              <option value="emergency">EMERGENCY</option>
            </select>

            <button
              style={{
                background: messagePriority === 'emergency' ? 'rgba(255, 0, 0, 0.2)' :
                  messagePriority === 'high' ? 'rgba(255, 136, 0, 0.2)' :
                    'rgba(0, 255, 255, 0.1)',
                border: `2px solid ${messagePriority === 'emergency' ? '#ff0000' :
                  messagePriority === 'high' ? '#ff8800' :
                    '#00ffff'}`,
                color: messagePriority === 'emergency' ? '#ff0000' :
                  messagePriority === 'high' ? '#ff8800' :
                    '#00ffff',
                padding: '8px 16px',
                fontFamily: 'inherit',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.3s ease',
                opacity: !messageText.trim() ? 0.5 : 1
              }}
              onClick={() => {
                if (!messageText.trim()) return;
                const room = new URLSearchParams(window.location.search).get('room') || 'default';
                const msg = {
                  id: Date.now().toString(),
                  from: 'Communications',
                  to: recipient,
                  content: messageText,
                  priority: messagePriority,
                  frequency: currentFrequency,
                  timestamp: Date.now(),
                  onAir: `(${currentFrequency.toFixed(1)} MHz)`   // <-- new
                };

                // Create enhanced message for GM with analysis mode
                const gmMsg = {
                  ...msg,
                  content: `[${signalAnalysisOptions.find(opt => opt.id === currentAnalysis)?.name ?? 'Normal Scan'}] ${messageText}`
                };

                // 1) broadcast to GM with analysis mode
                socket?.emit('gm_broadcast', {
                  type: 'new_message',
                  value: gmMsg,
                  room,
                  source: 'communications'
                });

                // 2) add to local log
                setMessageQueue(prev => [...prev, msg]);

                setMessageText('');
              }}
              disabled={!messageText.trim()}
            >
              TRANSMIT
            </button>
          </div>
        </div>
      </div>

      {/* Message Log */}
      <div style={{ ...panelStyle, height: '520px' }}>
        <h3 style={panelTitleStyle}>TRANSMISSION LOG</h3>

        <div style={{
          flex: 1,
          background: 'rgba(0, 0, 0, 0.6)',
          border: '1px solid #004444',
          borderRadius: '4px',
          padding: '10px',
          overflowY: 'auto',
          fontSize: '11px'
        }}>
          {communications.messageQueue.length === 0 ? (
            <div style={{ color: '#666666', textAlign: 'center', marginTop: '50px' }}>
              No transmissions received
            </div>
          ) : (
            communications.messageQueue.map((message: any, index: number) => (
              <div
                key={`${message.id}-${index}`}
                style={{
                  margin: '8px 0',
                  padding: '8px',
                  borderLeft: `3px solid ${message.priority === 'emergency' ? '#ff0000' :
                    message.priority === 'high' ? '#ff8800' :
                      message.priority === 'normal' ? '#00ff00' :
                        '#004444'
                    }`,
                  background: message.encrypted ? 'rgba(255, 255, 0, 0.05)' : 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '0 4px 4px 0',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', fontSize: '10px' }}>
                  <div style={{ color: '#888888' }}>
                    FROM: {message.from} → TO: {message.to}
                  </div>
                  <div style={{ color: '#666666' }}>
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                <div style={{ color: '#00ffff', marginBottom: '5px', lineHeight: 1.3 }}>
                  {message.content}
                </div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '9px', color: '#666666' }}>
                  <span>PRIORITY: {message.priority.toUpperCase()}</span>
                  {message.encrypted && <span>ENCRYPTED</span>}
                  {message.acknowledged && <span>ACKNOWLEDGED</span>}
                  {message.onAir && <span>{message.onAir}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Communication Channels */}
      <div style={{ ...panelStyle, height: '340px' }}>
        <h3 style={panelTitleStyle}>COMMUNICATION CHANNELS</h3>

        {/* Frequency Slider */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: '#888888', marginBottom: '8px' }}>
            FREQUENCY TUNER
          </div>
          <div style={{
            background: 'rgba(0, 0, 0, 0.6)',
            border: '1px solid #00ffff',
            borderRadius: '4px',
            padding: '12px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px'
            }}>
              <span style={{ fontSize: '10px', color: '#888888' }}>0.0</span>
              <span style={{
                fontSize: '16px',
                color: '#00ffff',
                fontWeight: 'bold',
                textShadow: '0 0 5px currentColor'
              }}>
                {currentFrequency.toFixed(1)} MHz
              </span>
              <span style={{ fontSize: '10px', color: '#888888' }}>999.9</span>
            </div>

            <input
              type="range"
              min="0"
              max="999.9"
              step="0.1"
              value={currentFrequency}
              onChange={(e) => {
                const newFreq = parseFloat(e.target.value);
                setCurrentFrequency(newFreq);
                // Single update path: broadcast to other stations (GM will receive this)
                const room = new URLSearchParams(window.location.search).get('room') || 'default';
                socket?.emit('comm_broadcast', {
                  type: 'frequency_update',
                  value: newFreq,
                  room: room,
                  source: 'communications',
                });
                // Update server game state
                onPlayerAction('set_frequency', newFreq);
              }}
              style={{
                width: '100%',
                height: '6px',
                background: 'linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00ff00, #0088ff, #8800ff)',
                borderRadius: '3px',
                outline: 'none',
                cursor: 'pointer',
                accentColor: '#00ffff'
              }}
            />

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '8px',
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

        {/* Quick Channel Presets */}
        <div style={{ marginBottom: '15px' }}>
          <div style={{ fontSize: '11px', color: '#888888', marginBottom: '8px' }}>
            QUICK CHANNELS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
            {[
              { name: 'Emergency', freq: 121.5, color: '#ff0000' },
              { name: 'Command', freq: 243.0, color: '#ffd700' },
              { name: 'Medical', freq: 156.8, color: '#ff6b6b' },
              { name: 'Security', freq: 453.212, color: '#a8e6cf' },
              { name: 'Engineering', freq: 467.775, color: '#4ecdc4' },
              { name: 'Navigation', freq: 156.05, color: '#95e1d3' },
              { name: 'Tactical', freq: 462.675, color: '#ff8c42' }
            ].map(channel => (
              <button
                key={channel.name}
                style={{
                  ...buttonStyle,
                  borderColor: channel.color,
                  color: channel.color,
                  fontSize: '9px',
                  padding: '6px 8px'
                }}
                onClick={() => {
                  const room = new URLSearchParams(window.location.search).get('room') || 'default';
                  setCurrentFrequency(channel.freq);
                  // Single update path: broadcast to other stations (GM will receive this)
                  socket?.emit('comm_broadcast', {
                    type: 'frequency_update',
                    value: channel.freq,
                    room: room,
                    source: 'communications',
                  });
                  // Update server game state
                  onPlayerAction('set_frequency', channel.freq);
                }}
              >
                {channel.name}
                <br />
                {channel.freq}
              </button>
            ))}
          </div>
        </div>

        {/* Channel Status */}
        <div style={{ fontSize: '10px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '5px',
            padding: '4px 8px',
            background: 'rgba(0, 0, 0, 0.4)',
            borderRadius: '2px'
          }}>
            <span>Active Channels:</span>
            <span style={{ color: '#00ff00' }}>3</span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '5px',
            padding: '4px 8px',
            background: 'rgba(0, 0, 0, 0.4)',
            borderRadius: '2px'
          }}>
            <span>Encrypted:</span>
            <span style={{ color: '#ffff00' }}>1</span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '4px 8px',
            background: 'rgba(0, 0, 0, 0.4)',
            borderRadius: '2px'
          }}>
            <span>Monitoring:</span>
            <span style={{ color: '#00ffff' }}>All</span>
          </div>
        </div>
      </div>

      {/* Long Range Communications */}
      <div style={{ ...panelStyle, height: '500px' }}>
        <h3 style={panelTitleStyle}>
          LONG RANGE COMMS   {ships.length} Ships in the Area
          <br />
          <span style={{ fontSize: '0.7em', color: '#888', fontWeight: 'normal' }}>
            {currentRegion}
          </span>
        </h3>
        <div 
          ref={lrcRef}
          style={{
            fontSize: '11px',
            height: '100%',
            overflowY: 'auto',
            padding: '5px 0'
          }}>
          {ships.length === 0 ? (
            <div style={{ color: '#666666', textAlign: 'center', margin: '10px 0' }}>
              No vessels in range
            </div>
          ) : (
            // Split ships into pinned and unpinned, then combine with pinned first
            (() => {
              const pinned = ships.filter(s => pinnedShips[s.id]);
              const unpinned = ships.filter(s => !pinnedShips[s.id]);
              return [...pinned, ...unpinned];
            })().map(ship => (
              <div
                key={ship.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  margin: '4px 0',
                  padding: '3px 5px',
                  borderBottom: '1px solid rgba(0, 255, 255, 0.1)',
                  backgroundColor: pinnedShips[ship.id] === 'white' ? 'rgba(255, 255, 255, 0.2)' :
                    pinnedShips[ship.id] === 'red' ? 'rgba(255, 0, 0, 0.2)' : 'transparent',
                  cursor: 'context-menu',
                  transition: 'background-color 0.2s ease'
                }}
                onContextMenu={(e) => {
                  e.preventDefault();

                  const currentPinned = shipStore.getPinnedShips();
                  const currentState = currentPinned[ship.id] || 'none';
                  const newPinned = { ...currentPinned };
                  const room = new URLSearchParams(window.location.search).get('room') || 'default';

                  // If currently white, make it red (if no other red exists)
                  if (currentState === 'white') {
                    // If there's a red ship, unpin it first
                    if (doublePinnedShipId) {
                      delete newPinned[doublePinnedShipId];
                    }
                    // Make this ship red
                    newPinned[ship.id] = 'red';
                    shipStore.setDoublePinnedShipId(ship.id);

                    // Notify GM about the red-pinned ship
                    socket?.emit('gm_broadcast', {
                      type: 'red_pinned_ship',
                      value: {
                        id: ship.id,
                        designation: ship.designation,
                        status: ship.status
                      },
                      room,
                      source: 'communications'
                    });

                    shipStore.setPinnedShips(newPinned);
                  }
                  // If currently red, unpin it
                  else if (currentState === 'red') {
                    delete newPinned[ship.id];
                    if (doublePinnedShipId === ship.id) {
                      shipStore.setDoublePinnedShipId(null);
                      // Notify GM that the red pin was removed
                      socket?.emit('gm_broadcast', {
                        type: 'red_pinned_ship',
                        value: null,
                        room,
                        source: 'communications'
                      });
                    }
                    shipStore.setPinnedShips(newPinned);
                  }
                  // If not pinned, make it white
                  else {
                    // If there's a red ship, unpin it first
                    if (doublePinnedShipId) {
                      delete newPinned[doublePinnedShipId];
                      shipStore.setDoublePinnedShipId(null);
                      // Notify GM that the red pin was removed
                      socket?.emit('gm_broadcast', {
                        type: 'red_pinned_ship',
                        value: null,
                        room,
                        source: 'communications'
                      });
                    }
                    newPinned[ship.id] = 'white';
                    shipStore.setPinnedShips(newPinned);
                  }
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
            ))
          )}
        </div>

        {/* Double-pinned ship information display */}
        {doublePinnedShipId && (() => {
          const doublePinnedShip = ships.find(ship => ship.id === doublePinnedShipId);
          return doublePinnedShip ? (
            <div style={{
              marginTop: '10px',
              marginBottom: '15px',
              padding: '8px',
              border: '1px solid rgb(255, 0, 64)',
              borderRadius: '4px',
              backgroundColor: 'rgba(255, 0, 0, 0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>ID:</span>
                <span style={{ color: 'rgb(255, 136, 0)' }}>{doublePinnedShip.id.split('-')[0]}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Designation:</span>
                <span style={{ color: 'rgb(255, 136, 0)' }}>{doublePinnedShip.designation || 'Undesignated'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Status:</span>
                <span style={{ color: 'rgb(0, 255, 136)' }}>{doublePinnedShip.status}</span>
              </div>
            </div>
          ) : null;
        })()}
      </div>

      {/* Signal Analysis */}
      <div style={{ ...panelStyle, height: '290px' }}>
        <h3 style={panelTitleStyle}>SIGNAL ANALYSIS</h3>

        {/* Analysis Mode Dropdown */}
        <select
          value={currentAnalysis}
          onChange={(e) => {
            setCurrentAnalysis(e.target.value);
            // Broadcast analysis mode change to GM
            const room = new URLSearchParams(window.location.search).get('room') || 'default';
            socket?.emit('comm_broadcast', {
              type: 'analysis_mode_update',
              value: e.target.value,
              room,
              source: 'communications'
            });
          }}
          style={{
            width: '100%',
            background: '#111',
            border: '1px solid #00ffff',
            color: '#eee',
            padding: '4px 6px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            marginBottom: 10
          }}
        >
          {signalAnalysisOptions.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.name}</option>
          ))}
        </select>

        {/* Status and Scan Button Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }}>
          <div style={{ fontSize: '11px', color: '#888888', flex: 1 }}>
            <div style={{ marginBottom: 4 }}>
              Current Analysis: <span style={{ color: '#00ffff', fontWeight: 'bold', fontSize: '12px' }}>
                {signalAnalysisOptions.find(o => o.id === currentAnalysis)?.name ?? 'Normal Scan'}
              </span>
            </div>
            <div>Imperial Frequency: 121.5 MHz</div>
            <div>Rebel Leadership: 243.0 MHz</div>
            <div>Emergency Channel: 406.0 MHz</div>
          </div>

          <button
            style={{
              background: (isScanning || isAnalysing) ? 'rgba(255, 136, 0, 0.3)' : 'rgba(0, 255, 255, 0.1)',
              border: `2px solid ${(isScanning || isAnalysing) ? '#ff8800' : '#00ffff'}`,
              color: (isScanning || isAnalysing) ? '#ff8800' : '#00ffff',
              padding: '8px 16px',
              fontFamily: 'inherit',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: (isScanning || isAnalysing) ? 'not-allowed' : 'pointer',
              borderRadius: '4px',
              transition: 'all 0.3s ease',
              marginLeft: 10,
              minWidth: '80px'
            }}
            onClick={() => {
              if (!isScanning && !isAnalysing) {
                setIsScanning(true);
                // Broadcast scan start to GM station
                const room = new URLSearchParams(window.location.search).get('room') || 'default';
                socket?.emit('gm_broadcast', {
                  type: 'scan_started',
                  value: {
                    analysisMode: currentAnalysis,
                    timestamp: Date.now()
                  },
                  room,
                  source: 'communications'
                });
              }
            }}
            disabled={isScanning || isAnalysing}
          >
            {isScanning ? 'SCANNING...' : isAnalysing ? 'ANALYSING...' : 'SCAN'}
          </button>
        </div>

        {/* Scan Animation Area */}
        {isScanning && (
          <div style={{
            flex: 1,
            background: 'rgba(0, 0, 0, 0.8)',
            border: '1px solid #00ffff',
            borderRadius: '4px',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            {/* Scanning Progress Bar */}
            <div style={{
              width: '100%',
              height: '20px',
              background: 'rgba(0, 0, 0, 0.6)',
              border: '1px solid #004444',
              borderRadius: '10px',
              overflow: 'hidden',
              marginBottom: 15
            }}>
              <div style={{
                height: '100%',
                background: 'linear-gradient(90deg, #00ffff, #0088ff)',
                width: `${scanProgress}%`,
                transition: 'width 0.1s ease',
                boxShadow: '0 0 10px rgba(0, 255, 255, 0.5)'
              }}></div>
            </div>

            {/* Scanning Text */}
            <div style={{
              color: '#00ffff',
              fontSize: '14px',
              fontWeight: 'bold',
              textAlign: 'center',
              textShadow: '0 0 10px currentColor',
              marginBottom: 10
            }}>
              ANALYZING SIGNAL PATTERNS...
            </div>

            {/* Progress Percentage */}
            <div style={{
              color: '#888888',
              fontSize: '12px',
              textAlign: 'center'
            }}>
              {Math.round(scanProgress)}% Complete
            </div>

            {/* Animated Scanning Lines */}
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '2px',
              background: 'linear-gradient(90deg, transparent, #00ffff, transparent)',
              top: `${20 + (scanProgress / 100) * 60}%`,
              opacity: 0.8
            }}></div>

            {/* Additional scanning effect lines */}
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '1px',
              background: 'rgba(0, 255, 255, 0.3)',
              top: `${25 + (scanProgress / 100) * 50}%`
            }}></div>
          </div>
        )}

        {/* Analysis Animation Area */}
        {isAnalysing && (
          <div style={{
            flex: 1,
            background: 'rgba(0, 0, 0, 0.8)',
            border: '1px solid #ff8800',
            borderRadius: '4px',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative'
          }}>
            {/* Analysis Progress Bar */}
            <div style={{
              width: '100%',
              height: '20px',
              background: 'rgba(0, 0, 0, 0.6)',
              border: '1px solid #664400',
              borderRadius: '10px',
              overflow: 'hidden',
              marginBottom: 15
            }}>
              <div style={{
                height: '100%',
                background: 'linear-gradient(90deg, #ff8800, #ffaa00)',
                width: `${analysisProgress}%`,
                transition: 'width 0.1s ease',
                boxShadow: '0 0 10px rgba(255, 136, 0, 0.5)'
              }}></div>
            </div>

            {/* Analysis Text */}
            <div style={{
              color: '#ff8800',
              fontSize: '14px',
              fontWeight: 'bold',
              textAlign: 'center',
              textShadow: '0 0 10px currentColor',
              marginBottom: 10
            }}>
              ANALYSING RESULTS...
            </div>

            {/* Progress Percentage */}
            <div style={{
              color: '#888888',
              fontSize: '12px',
              textAlign: 'center'
            }}>
              {Math.round(analysisProgress)}% Complete
            </div>

            {/* Pulsing Analysis Effect */}
            <div style={{
              position: 'absolute',
              width: '60%',
              height: '60%',
              border: '2px solid rgba(255, 136, 0, 0.4)',
              borderRadius: '50%',
              opacity: 0.6 + (analysisProgress / 200)
            }}></div>

            {/* Data Processing Lines */}
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '2px',
              background: 'linear-gradient(90deg, transparent, #ff8800, transparent)',
              top: `${30 + Math.sin(analysisProgress / 10) * 20}%`,
              opacity: 0.7
            }}></div>

            <div style={{
              position: 'absolute',
              width: '100%',
              height: '1px',
              background: 'rgba(255, 136, 0, 0.5)',
              top: `${50 + Math.cos(analysisProgress / 8) * 15}%`,
              opacity: 0.5
            }}></div>
          </div>
        )}
      </div>


    </div>
  );
};

export default CommunicationsStation;