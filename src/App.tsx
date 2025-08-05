import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState, User } from './types';

// Import your existing TSX station components
import CommunicationsStation from './stations/CommunicationsStation';
import EngineeringStation from './stations/EngineeringStation';
import PilotStation from './stations/PilotStation';
import WeaponsStation from './stations/WeaponsStation';
import GMStation from './stations/GMStation';

interface AppProps {}

const App: React.FC<AppProps> = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState>({});
  const [users, setUsers] = useState<Record<string, User>>({});
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [room, setRoom] = useState<string>('default');
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server:', newSocket.id);
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    newSocket.on('game_state_update', (state: GameState) => {
      console.log('Game state updated:', state);
      setGameState(state);
    });

    newSocket.on('users_update', (userList: Record<string, User>) => {
      console.log('Users updated:', userList);
      setUsers(userList);
    });

    newSocket.on('gm_broadcast', (data: any) => {
      console.log('GM broadcast received:', data);
      // Handle GM broadcasts if needed
    });

    newSocket.on('comm_broadcast', (data: any) => {
      console.log('Comm broadcast received:', data);
      // Handle communication broadcasts if needed
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const joinStation = () => {
    if (!socket || !selectedStation || !playerName.trim()) return;

    socket.emit('join', {
      room,
      station: selectedStation,
      name: playerName.trim()
    });
  };

  const handlePlayerAction = (action: string, value: any) => {
    if (!socket) return;

    socket.emit('player_action', {
      room,
      action,
      value
    });
  };

  // Station selection screen
  if (!selectedStation) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)',
        color: '#fff',
        fontFamily: 'Orbitron, monospace'
      }}>
        <h1 style={{
          fontSize: '3rem',
          marginBottom: '2rem',
          color: '#00ffff',
          textShadow: '0 0 20px #00ffff',
          letterSpacing: '4px'
        }}>
          BRIDGE SIMULATOR
        </h1>

        <div style={{
          background: 'rgba(0, 20, 40, 0.8)',
          padding: '2rem',
          borderRadius: '10px',
          border: '2px solid #00ffff',
          boxShadow: '0 0 30px rgba(0, 255, 255, 0.3)',
          minWidth: '400px'
        }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#00ffff' }}>
              Your Name:
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.7)',
                border: '1px solid #00ffff',
                borderRadius: '5px',
                color: '#fff',
                fontSize: '1rem',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#00ffff' }}>
              Room:
            </label>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Room name (default: 'default')"
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.7)',
                border: '1px solid #00ffff',
                borderRadius: '5px',
                color: '#fff',
                fontSize: '1rem',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#00ffff' }}>
              Select Station:
            </label>
            <select
              value={selectedStation}
              onChange={(e) => setSelectedStation(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.7)',
                border: '1px solid #00ffff',
                borderRadius: '5px',
                color: '#fff',
                fontSize: '1rem',
                fontFamily: 'inherit'
              }}
            >
              <option value="">Choose a station...</option>
              <option value="communications">Communications</option>
              <option value="engineering">Engineering</option>
              <option value="pilot">Navigation/Pilot</option>
              <option value="weapons">Weapons</option>
              <option value="gm">Game Master</option>
            </select>
          </div>

          <button
            onClick={joinStation}
            disabled={!selectedStation || !playerName.trim() || !isConnected}
            style={{
              width: '100%',
              padding: '12px',
              background: selectedStation && playerName.trim() && isConnected 
                ? 'linear-gradient(45deg, #00ff88, #00ffff)' 
                : '#666',
              border: 'none',
              borderRadius: '5px',
              color: '#000',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              cursor: selectedStation && playerName.trim() && isConnected ? 'pointer' : 'not-allowed',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              transition: 'all 0.3s ease'
            }}
          >
            {!isConnected ? 'Connecting...' : 'Join Bridge'}
          </button>
        </div>

        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          background: 'rgba(0, 0, 0, 0.5)',
          borderRadius: '5px',
          border: '1px solid #444'
        }}>
          <h3 style={{ color: '#00ffff', marginBottom: '1rem' }}>Active Crew:</h3>
          {Object.keys(users).length === 0 ? (
            <p style={{ color: '#888' }}>No crew members online</p>
          ) : (
            Object.values(users).map((user) => (
              <div key={user.socketId} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '5px 0',
                borderBottom: '1px solid #333'
              }}>
                <span style={{ color: '#fff' }}>{user.name}</span>
                <span style={{ color: '#00ff88' }}>{user.station}</span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // Render the selected station component
  const renderStation = () => {
    const commonProps = {
      gameState,
      onPlayerAction: handlePlayerAction,
      socket
    };

    switch (selectedStation) {
      case 'communications':
        return <CommunicationsStation {...commonProps} />;
      case 'engineering':
        return <EngineeringStation {...commonProps} />;
      case 'pilot':
        return <PilotStation />;
      case 'weapons':
        return <WeaponsStation />;
      case 'gm':
        return <GMStation {...commonProps} />;
      default:
        return <div>Station not found</div>;
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Connection status indicator */}
      <div style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        zIndex: 1000,
        padding: '5px 10px',
        background: isConnected ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 0, 0.2)',
        border: `1px solid ${isConnected ? '#00ff00' : '#ff0000'}`,
        borderRadius: '5px',
        color: isConnected ? '#00ff00' : '#ff0000',
        fontSize: '0.8rem',
        fontFamily: 'Orbitron, monospace'
      }}>
        {isConnected ? '🟢 CONNECTED' : '🔴 DISCONNECTED'}
      </div>

      {/* Station selector button */}
      <button
        onClick={() => setSelectedStation('')}
        style={{
          position: 'fixed',
          top: '10px',
          left: '10px',
          zIndex: 1000,
          padding: '8px 12px',
          background: 'rgba(0, 255, 255, 0.2)',
          border: '1px solid #00ffff',
          borderRadius: '5px',
          color: '#00ffff',
          fontSize: '0.8rem',
          fontFamily: 'Orbitron, monospace',
          cursor: 'pointer',
          textTransform: 'uppercase'
        }}
      >
        ← Change Station
      </button>

      {/* Render the selected station */}
      {renderStation()}
    </div>
  );
};

export default App;