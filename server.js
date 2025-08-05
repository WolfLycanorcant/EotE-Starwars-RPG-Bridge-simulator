const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from dist (Vite build output)
app.use(express.static(path.join(__dirname, 'dist')));

// Game state storage
const gameRooms = new Map();

// Initialize default room
gameRooms.set('default', {
  users: {},
  gameState: {
    communications: {
      signalStrength: 85,
      interference: 15,
      primaryFrequency: 121.5,
      emergencyBeacon: false
    },
    engineering: {
      powerDistribution: {
        totalPower: 100,
        reactorOutput: 85,
        emergencyPower: false,
        powerAllocations: {
          weapons: 25,
          shields: 30,
          engines: 20,
          sensors: 10,
          lifeSupport: 10,
          communications: 5
        }
      }
    },
    pilot: {
      heading: { x: 0, y: 0 },
      speed: 0,
      altitude: 1000,
      hyperdriveStatus: 'ready'
    },
    weapons: {
      targeting: {
        currentTarget: null,
        availableTargets: [],
        lockStatus: 'none'
      },
      shields: {
        frontShield: 100,
        rearShield: 100,
        leftShield: 100,
        rightShield: 100
      }
    }
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (data) => {
    const { room = 'default', station, name = 'Anonymous' } = data;
    
    // Join the room
    socket.join(room);
    
    // Initialize room if it doesn't exist
    if (!gameRooms.has(room)) {
      gameRooms.set(room, {
        users: {},
        gameState: gameRooms.get('default').gameState
      });
    }
    
    const roomData = gameRooms.get(room);
    
    // Add user to room
    roomData.users[socket.id] = {
      station,
      name,
      socketId: socket.id
    };
    
    console.log(`${name} joined ${station} station in room ${room}`);
    
    // Send current game state to the joining user
    socket.emit('game_state_update', roomData.gameState);
    
    // Broadcast updated user list to room
    io.to(room).emit('users_update', roomData.users);
  });

  socket.on('player_action', (data) => {
    const { room = 'default', action, value, target } = data;
    
    if (!gameRooms.has(room)) return;
    
    const roomData = gameRooms.get(room);
    const user = roomData.users[socket.id];
    
    console.log(`Player action from ${user?.name} (${user?.station}):`, action, value);
    
    // Handle different actions
    switch (action) {
      case 'set_frequency':
        if (roomData.gameState.communications) {
          roomData.gameState.communications.primaryFrequency = value;
        }
        break;
        
      case 'set_signal_strength':
        if (roomData.gameState.communications) {
          roomData.gameState.communications.signalStrength = value;
        }
        break;
        
      case 'set_interference':
        if (roomData.gameState.communications) {
          roomData.gameState.communications.interference = value;
        }
        break;
        
      case 'toggle_emergency_beacon':
        if (roomData.gameState.communications) {
          roomData.gameState.communications.emergencyBeacon = value;
        }
        break;
        
      case 'set_power_allocation':
        if (roomData.gameState.engineering?.powerDistribution) {
          Object.assign(roomData.gameState.engineering.powerDistribution.powerAllocations, value);
        }
        break;
        
      case 'toggle_emergency_power':
        if (roomData.gameState.engineering?.powerDistribution) {
          roomData.gameState.engineering.powerDistribution.emergencyPower = value;
        }
        break;
        
      case 'set_speed':
        if (roomData.gameState.pilot) {
          roomData.gameState.pilot.speed = value;
        }
        break;
        
      case 'update_heading_x':
        if (roomData.gameState.pilot) {
          roomData.gameState.pilot.heading.x = value;
        }
        break;
        
      case 'update_heading_y':
        if (roomData.gameState.pilot) {
          roomData.gameState.pilot.heading.y = value;
        }
        break;
    }
    
    // Broadcast updated game state to all users in the room
    io.to(room).emit('game_state_update', roomData.gameState);
    
    // Also broadcast the specific action for real-time updates
    socket.to(room).emit('player_action_broadcast', {
      action,
      value,
      station: user?.station,
      player: user?.name
    });
  });

  socket.on('gm_broadcast', (data) => {
    const { room = 'default', type, value, source } = data;
    
    console.log(`GM broadcast in room ${room}:`, type, value);
    
    // Broadcast to all clients in the room
    io.to(room).emit('gm_broadcast', {
      type,
      value,
      room,
      source
    });
  });

  socket.on('comm_broadcast', (data) => {
    const { room = 'default', type, value, source } = data;
    
    console.log(`Comm broadcast in room ${room}:`, type, value);
    
    // Broadcast to all clients in the room
    io.to(room).emit('comm_broadcast', {
      type,
      value,
      room,
      source
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove user from all rooms
    for (const [roomName, roomData] of gameRooms.entries()) {
      if (roomData.users[socket.id]) {
        delete roomData.users[socket.id];
        io.to(roomName).emit('users_update', roomData.users);
      }
    }
  });
});

// Serve React app for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Bridge Simulator running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
});