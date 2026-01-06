const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);

// ===== SECURITY & CONFIG =====
const CORS_ORIGIN = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? false : "*");
const RATE_LIMIT_WINDOW = 10000;
const MAX_REQUESTS_PER_WINDOW = 50;
const RECONNECTION_WINDOW_MS = 24 * 60 * 60 * 1000;

const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});

app.use(express.static(__dirname));

// Rate limiting
const rateLimit = new Map();
function checkRateLimit(socketId) {
  const now = Date.now();
  const client = rateLimit.get(socketId) || { count: 0, windowStart: now };
  if (now - client.windowStart > RATE_LIMIT_WINDOW) {
    client.count = 0;
    client.windowStart = now;
  }
  client.count++;
  rateLimit.set(socketId, client);
  return client.count <= MAX_REQUESTS_PER_WINDOW;
}

// Input sanitization
function sanitizeInput(input, maxLength = 50) {
  if (typeof input !== 'string') return '';
  return input.replace(/[<>\"'&]/g, '').substring(0, maxLength).trim();
}

// ===== ROOM MANAGER =====
const rooms = new Map();
const activeSockets = new Map(); // Track socketId -> roomId mapping

const ROLE_CREATOR = 'creator';
const ROLE_JOINER = 'joiner';
const ROOM_TIMEOUT_MS = 2 * 60 * 60 * 1000;

const dares = [/* All your dares here - same as before */];

function getRandomDare() {
  return dares[Math.floor(Math.random() * dares.length)];
}

function isValidRoom(room) {
  return room && typeof room === 'string' && room.length > 0 && room.length <= 50 && /^[a-zA-Z0-9_-]+$/.test(room);
}

function cleanupRooms() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [roomId, room] of rooms.entries()) {
    const creatorDisconnected = !room.creator.connected && (now - room.creator.lastSeen > RECONNECTION_WINDOW_MS);
    const joinerDisconnected = !room.joiner.connected && (now - room.joiner.lastSeen > RECONNECTION_WINDOW_MS);
    
    if ((now - room.lastActivity > ROOM_TIMEOUT_MS) || 
        (creatorDisconnected && joinerDisconnected && !room.joinerJoined)) {
      io.to(roomId).emit('room-closed');
      rooms.delete(roomId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`[CLEANUP] Removed ${cleanedCount} inactive rooms`);
  }
}

setInterval(cleanupRooms, 60 * 60 * 1000);

// ===== SOCKET.IO LOGIC =====
io.on("connection", socket => {
  console.log(`[CONNECT] User ${socket.id} connected`);
  rateLimit.set(socket.id, { count: 0, windowStart: Date.now() });

  socket.on("check-room", (room) => {
    if (!checkRateLimit(socket.id)) {
      return socket.emit('error', 'Rate limit exceeded. Please wait...');
    }
    
    const roomId = sanitizeInput(room);
    if (!isValidRoom(roomId)) {
      return socket.emit('room-check-result', { valid: false, error: 'Invalid room format' });
    }
    
    const roomData = rooms.get(roomId);
    const canJoin = !!roomData && !roomData.joiner.connected;
    
    socket.emit('room-check-result', {
      valid: canJoin,
      error: canJoin ? null : 'Room not found or full'
    });
  });

  socket.on("join", (data) => {
    if (!checkRateLimit(socket.id)) {
      return socket.emit('error', 'Rate limit exceeded. Please wait...');
    }
    
    const roomId = sanitizeInput(data.room);
    const userName = sanitizeInput(data.name || roomId, 20);
    
    if (!isValidRoom(roomId)) {
      return socket.emit('error', 'Invalid room format. Use only letters, numbers, hyphens and underscores.');
    }

    const existingRoom = rooms.get(roomId);
    socket.join(roomId);
    
    if (!existingRoom) {
      // Create new room
      const newRoom = {
        id: roomId,
        dare: getRandomDare(),
        scratched: false,
        turn: ROLE_CREATOR,
        creator: {
          id: userName,
          socketId: socket.id,
          connected: true,
          lastSeen: Date.now()
        },
        joiner: {
          id: null,
          socketId: null,
          connected: false,
          lastSeen: 0
        },
        lastActivity: Date.now(),
        createdAt: Date.now()
      };
      
      rooms.set(roomId, newRoom);
      activeSockets.set(socket.id, roomId); // Track this socket
      
      socket.emit('role', { role: ROLE_CREATOR, name: userName });
      socket.emit('state', newRoom);
      
      console.log(`[CREATE] Room "${roomId}" created by ${userName} (${socket.id})`);
      
    } else {
      // Room exists - handle reconnection or new joiner
      const isCreatorReconnect = existingRoom.creator.socketId === socket.id || 
                                  (existingRoom.creator.id === userName && !existingRoom.creator.connected);
      
      let assignedRole = null;
      
      if (isCreatorReconnect) {
        // Creator reconnecting
        existingRoom.creator.socketId = socket.id;
        existingRoom.creator.connected = true;
        existingRoom.creator.lastSeen = Date.now();
        assignedRole = ROLE_CREATOR;
        activeSockets.set(socket.id, roomId); // Track this socket
        
        console.log(`[RECONNECT] Creator ${userName} rejoined room "${roomId}"`);
      } else if (!existingRoom.joiner.connected) {
        // New joiner
        existingRoom.joiner.id = userName;
        existingRoom.joiner.socketId = socket.id;
        existingRoom.joiner.connected = true;
        existingRoom.joiner.lastSeen = Date.now();
        existingRoom.joinerJoined = true;
        assignedRole = ROLE_JOINER;
        activeSockets.set(socket.id, roomId); // Track this socket
        
        console.log(`[JOIN] Joiner ${userName} joined room "${roomId}"`);
        
        // Notify creator
        socket.to(roomId).emit('joiner-joined', {
          name: userName,
          socketId: socket.id
        });
      } else {
        // Shouldn't happen due to check-room, but safety first
        return socket.emit('error', 'Room is full');
      }
      
      existingRoom.lastActivity = Date.now();
      
      socket.emit('role', { role: assignedRole, name: userName });
      io.to(roomId).emit('state', existingRoom);
    }
  });

  socket.on("scratch", (data) => {
    if (!checkRateLimit(socket.id)) return;
    
    const roomId = sanitizeInput(data.room);
    const room = rooms.get(roomId);
    
    if (!room || room.scratched) return;
    
    // Validate sender is actual player
    const isCreator = room.creator.socketId === socket.id;
    const isJoiner = room.joiner.socketId === socket.id;
    
    if (!isCreator && !isJoiner) return;
    
    // Update last seen
    room.lastActivity = Date.now();
    
    // Broadcast to other player
    socket.to(room).emit("scratch", {
      x: data.x,
      y: data.y,
      radius: data.radius
    });
  });

  socket.on("scratch-complete", (roomId) => {
    if (!checkRateLimit(socket.id)) return;
    
    const room = rooms.get(sanitizeInput(roomId));
    if (!room || room.scratched) return;
    
    const isCreator = room.creator.socketId === socket.id;
    const isJoiner = room.joiner.socketId === socket.id;
    
    if (!isCreator && !isJoiner) return;
    
    if (room.turn === ROLE_CREATOR && !isCreator) return;
    if (room.turn === ROLE_JOINER && !isJoiner) return;
    
    room.scratched = true;
    room.lastActivity = Date.now();
    
    io.to(roomId).emit("reveal", room.dare);
  });

  socket.on("done", (roomId) => {
    if (!checkRateLimit(socket.id)) return;
    
    const room = rooms.get(sanitizeInput(roomId));
    if (!room || !room.scratched) return;
    
    const isCreator = room.creator.socketId === socket.id;
    const isJoiner = room.joiner.socketId === socket.id;
    
    if (!isCreator && !isJoiner) return;
    
    room.scratched = false;
    room.turn = (room.turn === ROLE_CREATOR) ? ROLE_JOINER : ROLE_CREATOR;
    room.dare = getRandomDare();
    room.lastActivity = Date.now();
    
    io.to(roomId).emit('new-turn', {
      dare: room.dare,
      turn: room.turn
    });
  });

  socket.on("user-active", (data) => {
    if (!checkRateLimit(socket.id)) return;
    
    const room = rooms.get(sanitizeInput(data.room));
    if (!room) return;
    
    const isCreator = room.creator.socketId === socket.id;
    const isJoiner = room.joiner.socketId === socket.id;
    
    if (!isCreator && !isJoiner) return;
    
    if (isCreator) {
      room.creator.connected = data.active;
      room.creator.lastSeen = Date.now();
    } else if (isJoiner) {
      room.joiner.connected = data.active;
      room.joiner.lastSeen = Date.now();
    }
    
    socket.to(data.room).emit("user-active-status", {
      active: data.active,
      role: isCreator ? ROLE_CREATOR : ROLE_JOINER
    });
  });

  socket.on("exit-room", (roomId) => {
    const room = rooms.get(sanitizeInput(roomId));
    if (!room) return;
    
    const isCreator = room.creator.socketId === socket.id;
    
    if (isCreator) {
      io.to(roomId).emit('room-closed');
      rooms.delete(roomId);
      activeSockets.delete(socket.id);
      console.log(`[EXIT] Room ${roomId} closed by creator`);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[DISCONNECT] ${socket.id} disconnected: ${reason}`);
    
    // Mark user as disconnected but KEEP ROOM ALIVE
    const roomId = activeSockets.get(socket.id);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        if (room.creator.socketId === socket.id) {
          room.creator.connected = false;
          room.creator.lastSeen = Date.now();
          io.to(roomId).emit('creator-status', { connected: false });
          console.log(`[STATUS] Room ${roomId}: Creator disconnected`);
        } else if (room.joiner.socketId === socket.id) {
          room.joiner.connected = false;
          room.joiner.lastSeen = Date.now();
          io.to(roomId).emit('joiner-status', { connected: false });
          console.log(`[STATUS] Room ${roomId}: Joiner disconnected`);
        }
      }
      activeSockets.delete(socket.id);
    }
    
    rateLimit.delete(socket.id);
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 CORS origin: ${CORS_ORIGIN || 'not set (production mode)'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] SIGTERM received');
  server.close(() => {
    console.log('[SHUTDOWN] Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('[ERROR] Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[ERROR] Unhandled rejection at:', promise, 'reason:', reason);
});
