const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);

// ===== SECURITY & CONFIG =====
const CORS_ORIGIN = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? false : "*");
const RATE_LIMIT_WINDOW = 10000; // 10 seconds
const MAX_REQUESTS_PER_WINDOW = 50;
const RECONNECTION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes recovery window
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

function generateRoomId() {
  return crypto.randomBytes(4).toString('hex');
}

// ===== ROOM MANAGER =====
const rooms = new Map();

const ROLE_CREATOR = 'creator';
const ROLE_JOINER = 'joiner';
const ROOM_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

const dares = [
  "Apni ek cute selfie bhejo", "Sirf emojis me apna mood batao", "Ek honest compliment do mujhe",
  "Apna favourite song share karo", "5 minute tak fast reply karo", "Ek flirty line likho",
  "Apna nickname batao", "Ek cheez batao jo tumhe smile deti h", "Voice note me sirf 'hey daddy' bolo😁",
  "Ek secret btao jo koi ni janta tunhre alava", "Apni playlist ka last song batao",
  "Ek apna fun GIF bhejo", "Apna relationship status describe karo", "Ek random memory share karo",
  "Ek imaginary date idea batao", "Kisi ko tag karke unki taarif karo (story me)",
  "Apna favourite person batao", "Ek dark joke sunao", "kabhi ghar se paise chori kre hai ?",
  "Kisi film ka dialogue bolo", "Ek song ki ek line gaake sunao", "Apni favourite movie batao",
  "Ek childhood story share karo", "Apna hidden talent dikhao", "following me se kisi random ko propose kro",
  "Apna favourite food batao", "Ek fake love story banao", "Apna funny face bna kr pic bhejo",
  "Ek compliment khud ko do", "Ek joke sunao", "mummy se bolo mujhe love marriage krni hai(video bhejo)",
  "Ek dream vacation spot batao", "Apna favourite game batao", "Ek weird habit share karo",
  "Apna favourite flower batao", "Ek motivational quote bhejo", "Apna favourite movie genre batao",
  "Ek childhood dream batao", "Apna favourite book batao", "Ek superpower chuno",
  "Apna favourite cartoon batao", "Ek magic trick dikhao", "Apna favourite sport bato",
  "Ek tongue twister bolo", "Apna favourite festival bato", "Ek random fact share karo",
  "Apna favourite app batao", "Ek mimicry karo", "Apna favourite dessert batao",
  "Ek bucket-list item share karo", "Apna favourite subject batao", "Ek 1 min dance karo or video bana ke bhejo",
  "Apna childhood photo send karo", "Apna bf/gf ki pic send kro", "Ek funny nickname do mujhe",
  "Apna favourite time of day batao", "Ek dream job batao", "Apna favourite emoji combo batao",
  "Ek random compliment do random ko", "Apna favourite weather batao", "Ek secret talent reveal karo",
  "Apna favourite quote batao", "Ek virtual hug bhejo", "Apna favourite place in home batao",
  "Ek imaginary pet name batao", "Apna favourite candy batao", "Ek 3-word story likho",
  "Apna favourite drink batao", "Ek childhood game yaad karo", "Apna favourite song mood batao",
  "Ek dream car name btao", "Apna favourite TV show batao", "Ek random act of kindness karo",
  "Apna phon number batao", "Ek kiss bhejo video me", "Apna favourite scent memory batao",
  "Ek nightmare share karo", "tunhre kitne fake account hai batao", "Ek 15 second singing clip bhejo",
  "Apna favourite ice-cream flavour batao", "Ek friend ka naam batao jiske liye feeling hai",
  "tumhra body count btao", "Ek random dance move bhejo (video me)", "Apna favourite breakfast batao",
  "Ek childhood fear share karo", "Apna favourite meme batao", "tunhra childhood trauma share kro",
  "green chillies khankr vudeo me reaction dikhao", "tumhra dream house kaisa hoga ?",
  "kitne logo ko cheat kiya hai ?", "Ek random post pr author ko galiya do", "Apna favourite pizza topping batao",
  "kisi friend ki story pr like or comment kro(ganda)", "kisi ek friend ko galiya dekr block kro",
  "Ek pickup line likho", "bf/gf kaisa chahiye ?", "Ek childhood real life superhero batao",
  "Apna favourite midnight snack batao", "Ek virtual kiss bhejo", "Apna weight btao",
  "online chocolate order kro mere liye", "Apna favourite childhood memories batao", "Ek devil laugh audio bhejo",
  "Apni real age batao", "Ek favourite planet name batao jaha jana chahte ho", "Apna favourite sound of nature batao",
  "Ek 15 second actor ki mimicry karo (video me)", "Apna favourite sppt btao", "jab tum sad/upset hote ho to kya krna psnd krte ho"
];

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
    // Check if room is older than timeout OR both players disconnected for > 24h
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

// Run cleanup every hour
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
    
    // Join or create room atomically
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
      currentRole = ROLE_CREATOR;
      
      socket.emit('role', { role: ROLE_CREATOR, name: userName });
      socket.emit('state', newRoom);
      
      console.log(`[CREATE] Room "${roomId}" created by ${userName} (${socket.id})`);
      
    } else {
      // Room exists - handle reconnection or new joiner
      const isCreatorReconnect = existingRoom.creator.id === userName && 
                                  existingRoom.creator.socketId !== socket.id;
      
      let assignedRole = null;
      
      if (isCreatorReconnect) {
        // Creator reconnecting
        existingRoom.creator.socketId = socket.id;
        existingRoom.creator.connected = true;
        existingRoom.creator.lastSeen = Date.now();
        assignedRole = ROLE_CREATOR;
        
        console.log(`[RECONNECT] Creator ${userName} rejoined room "${roomId}"`);
      } else if (!existingRoom.joiner.connected) {
        // New joiner
        existingRoom.joiner.id = userName;
        existingRoom.joiner.socketId = socket.id;
        existingRoom.joiner.connected = true;
        existingRoom.joiner.lastSeen = Date.now();
        existingRoom.joinerJoined = true;
        assignedRole = ROLE_JOINER;
        
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
    
    console.log(`[SCRATCH] Room ${roomId}: ${isCreator ? 'Creator' : 'Joiner'} scratched at (${data.x}, ${data.y})`);
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
    console.log(`[REVEAL] Room ${roomId}: Dare revealed`);
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
    
    console.log(`[TURN] Room ${roomId}: New turn for ${room.turn}`);
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
      console.log(`[EXIT] Room ${roomId} closed by creator`);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[DISCONNECT] ${socket.id} disconnected: ${reason}`);
    
    // Mark user as disconnected but KEEP ROOM ALIVE
    for (const [roomId, room] of rooms.entries()) {
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
