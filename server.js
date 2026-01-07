 
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto"); // For secure tokens

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname)));
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

/* ===== DARES DATABASE ===== */
const dares = [
  "Apni ek cute selfie bhejo","Sirf emojis me apna mood batao","Ek honest compliment do mujhe",
  "Apna favourite song share karo","5 minute tak fast reply karo","Ek flirty line likho",
  "Apna nickname batao","Ek cheez batao jo tumhe smile deti h","Voice note me sirf 'hey daddy' bolo😁",
  "Ek secret btao jo koi ni janta tunhre alava","Apni playlist ka last song batao",
  "Mujhe ek hug emoji bhejo","Apna last seen batao","Ek lame joke sunao",
  "Apni keyboard history ka last word batao","Ek funny voice note bhejo",
  "Mera name apni status me lagao 5 minute ke liye","Mujhe ek funny nickname do",
  "Apna phone wallpaper dikhao","Ek cheez batao jo tumhe irritate karti h"
];

function randomDare() {
  return dares[Math.floor(Math.random() * dares.length)];
}

/* ===== ROOM STORE with Grace Period ===== */
const rooms = {}; 
const disconnectedUsers = new Map(); // socket.id -> { room, role, timeout }
const ROOM_TTL = 24 * 60 * 60 * 1000; // 24 hours
const RECONNECTION_GRACE = 2 * 60 * 60 * 1000; // 2 hours for both users

function cleanRooms() {
  const now = Date.now();
  for (const r in rooms) {
    if (now - rooms[r].createdAt > ROOM_TTL) delete rooms[r];
  }
}
setInterval(cleanRooms, 60 * 1000);

/* ===== PARTNER STATUS HANDLER ===== */
function updatePartnerStatus(roomName, userRole, online) {
  const room = rooms[roomName];
  if (!room) return;
  
  const partnerRole = userRole === "creator" ? "joiner" : "creator";
  const partnerId = room[partnerRole];
  
  if (partnerId) {
    io.to(partnerId).emit("partner-status", { online });
  }
}

/* ===== SOCKET.IO EVENTS ===== */
io.on("connection", socket => {
  console.log("🔌 User connected:", socket.id);

  // Handle reconnection
  socket.on("rejoin-room", ({ room: roomName, role: userRole }) => {
    const room = rooms[roomName];
    if (!room) {
      socket.emit("room-error", { type: "rejoin", msg: "Room not found" });
      return;
    }

    // Clear any pending disconnect timeout
    const pending = disconnectedUsers.get(socket.id);
    if (pending) {
      clearTimeout(pending.timeout);
      disconnectedUsers.delete(socket.id);
    }

    // Re-associate socket
    socket.room = roomName;
    socket.role = userRole;
    socket.join(roomName);
    
    // Update room data with new socket ID
    room[userRole] = socket.id;
    
    // Notify partner
    updatePartnerStatus(roomName, userRole, true);
    
    // Send current game state
    socket.emit("room-rejoined", { 
      role: userRole, 
      room: roomName,
      myTurn: room.turn === userRole,
      partnerOnline: room[userRole === "creator" ? "joiner" : "creator"] ? true : false
    });
    
    console.log(`🔄 User rejoined room: ${roomName} as ${userRole}`);
  });

  socket.on("create-room", ({ name, password }) => {
    if (!name || !password || name.length < 3) {
      socket.emit("room-error", { type: "create", msg: "Room name min 3 chars & password required" });
      return;
    }
    if (rooms[name]) {
      socket.emit("room-error", { type: "create", msg: "Room already exists" });
      return;
    }
    
    // Generate secure token for creator
    const creatorToken = crypto.randomBytes(16).toString('hex');
    
    rooms[name] = {
      password,
      creator: socket.id,
      joiner: null,
      dare: randomDare(),
      scratched: false,
      turn: "creator",
      createdAt: Date.now(),
      creatorToken // Store token for auto-login
    };
    socket.room = name;
    socket.role = "creator";
    socket.join(name);
    socket.emit("room-created", { 
      role: "creator", 
      room: name,
      creatorToken // Send token to client
    });
    console.log(`🏠 Room created: ${name} by ${socket.id}`);
  });

  socket.on("join-room", ({ name, password }) => {
    if (!name || !password) {
      socket.emit("room-error", { type: "join", msg: "All fields required" });
      return;
    }
    const room = rooms[name];
    if (!room || room.password !== password) {
      socket.emit("room-error", { type: "join", msg: "Invalid room or password" });
      return;
    }
    if (room.joiner) {
      socket.emit("room-error", { type: "join", msg: "Room full" });
      return;
    }
    room.joiner = socket.id;
    socket.room = name;
    socket.role = "joiner";
    socket.join(name);
    socket.emit("room-joined", { role: "joiner", room: name });
    
    // Notify both about partner status
    io.to(room.creator).emit("joiner-joined");
    io.to(room.creator).emit("partner-status", { online: true });
    io.to(room.joiner).emit("partner-status", { online: true });
    
    console.log(`👥 User joined room: ${name}`);
  });

  socket.on("scratch", ({ room, x, y, r }) => {
    socket.to(room).emit("scratch", { x, y, r });
  });

  socket.on("scratch-complete", room => {
    const r = rooms[room];
    if (!r || r.scratched) return;
    r.scratched = true;
    io.to(room).emit("reveal-dare", r.dare);
    console.log(`✅ Dare revealed in room: ${room}`);
  });

  socket.on("done", room => {
    const r = rooms[room];
    if (!r) return;
    r.scratched = false;
    r.turn = r.turn === "creator" ? "joiner" : "creator";
    r.dare = randomDare();
    io.to(room).emit("next-turn", r.turn);
    console.log(`🔄 Turn changed in room: ${room}`);
  });

  socket.on("exit-room", room => {
    if (rooms[room]?.creator === socket.id) {
      io.to(room).emit("room-closed");
      delete rooms[room];
      console.log(`❌ Room closed: ${room}`);
    }
  });

  socket.on("disconnect", reason => {
    console.log("🔌 User disconnected:", socket.id, "Reason:", reason);
    
    // Don't immediately remove - wait for grace period
    if (socket.room && socket.role) {
      // Store disconnect info
      const timeout = setTimeout(() => {
        // Grace period over - actually remove user
        disconnectedUsers.delete(socket.id);
        
        const room = rooms[socket.room];
        if (room) {
          if (socket.role === "joiner") {
            room.joiner = null;
            io.to(room.creator).emit("joiner-left");
            io.to(room.creator).emit("partner-status", { online: false });
            console.log(`👋 Joiner removed after grace: ${socket.room}`);
          } else if (socket.role === "creator") {
            io.to(socket.room).emit("room-closed");
            delete rooms[socket.room];
            console.log(`❌ Room deleted after creator grace: ${socket.room}`);
          }
        }
      }, RECONNECTION_GRACE);
      
      disconnectedUsers.set(socket.id, { 
        room: socket.room, 
        role: socket.role, 
        timeout 
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("🔥 Server running on port", PORT));
