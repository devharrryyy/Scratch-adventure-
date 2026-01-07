const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

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

/* ===== ROOM STORE ===== */
const rooms = {}; 
const ROOM_TTL = 24 * 60 * 60 * 1000; // 24 hours

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

  socket.on("create-room", ({ name, password }) => {
    if (!name || !password || name.length < 3) {
      socket.emit("room-error", { type: "create", msg: "Room name min 3 chars & password required" });
      return;
    }
    if (rooms[name]) {
      socket.emit("room-error", { type: "create", msg: "Room already exists" });
      return;
    }
    rooms[name] = {
      password,
      creator: socket.id,
      joiner: null,
      dare: randomDare(),
      scratched: false,
      turn: "creator",
      createdAt: Date.now()
    };
    socket.join(name);
    socket.room = name;
    socket.role = "creator";
    socket.emit("room-created", { role: "creator", room: name });
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
    socket.join(name);
    socket.room = name;
    socket.role = "joiner";
    socket.emit("room-joined", { role: "joiner", room: name });
    
    // Notify creator that partner joined
    io.to(room.creator).emit("joiner-joined");
    // Notify both about partner status
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
    
    // Update partner status if user was in a room
    if (socket.room && socket.role) {
      updatePartnerStatus(socket.room, socket.role, false);
    }
    
    for (const r in rooms) {
      const room = rooms[r];
      if (room.joiner === socket.id) {
        room.joiner = null;
        io.to(room.creator).emit("joiner-left");
        io.to(room.creator).emit("partner-status", { online: false });
        console.log(`👋 Joiner left room: ${r}`);
      } else if (room.creator === socket.id) {
        io.to(r).emit("room-closed");
        delete rooms[r];
        console.log(`❌ Room deleted (creator left): ${r}`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("🔥 Server running on port", PORT));
