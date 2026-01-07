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
  "Apni ek cute selfie bhejo", "Sirf emojis me apna mood batao", "Ek honest compliment do mujhe",
  "Apna favourite song share karo", "5 minute tak fast reply karo", "Ek flirty line likho",
  "Apna nickname batao", "Ek cheez batao jo tumhe smile deti h", "Voice note me sirf 'hey daddy' bolo😁",
  "Ek secret btao jo koi ni janta tumhre alava", "Apni bra strap ki snap bhejo",
  "Ek apna fun GIF bhejo", "Apna relationship status describe karo", "Ek random memory share karo",
  "Ek imaginary date idea batao", "Kisi ko tag karke unki taarif karo (story me)",
  "Apna favourite person batao", "Ek dark joke sunao", "kabhi ghar se paise chori kre hai ?",
  "Apne hand se boobs hide krke photo bhejo(Naked)", "Ek song ki ek line gaake sunao", "Apni favourite movie batao",
  "Ek childhood story share karo", "Apna hidden talent dikhao", "following me se kisi random ko propose kro",
  "Apna favourite food batao", "Ek fake love story banao", "Apna funny face bna kr pic bhejo",
  "Ek compliment khud ko do", "Ek joke sunao", "mummy se bolo mujhe love marriage krni hai(video bhejo)",
  "Ek dream vacation spot batao", "Apna favourite game batao", "Ek weird habit share karo",
  "Apna favourite flower batao", "Ek motivational quote bhejo", "Apna favourite movie genre batao",
  "Ek childhood dream batao", "Mirro video bnao apne back body ki(NAKED)", "Ek superpower chuno",
  "Apna favourite cartoon batao", "Ek magic trick dikhao", "Apna favourite sport bato",
  "Ek tongue twister bolo", "Apna favourite festival bato", "Ek random fact share karo",
  "Apna favourite app batao", "Ek mimicry karo", "Apna favourite dessert batao",
  "Ek bucket-list item share karo", "Apna favourite subject batao", "Ek 1 min dance karo or video bana ke bhejo",
  "sexy song pr bra & penty me dance kro(video)", "Apna bf/gf ki pic send kro", "Ek funny nickname do mujhe",
  "Apna favourite time of day batao", "Ek dream job batao", "Apni naked thighs ki snap bhejo (cross leds)",
  "Ek random compliment do random ko", "Apna favourite weather batao", "Ek secret talent reveal karo",
  "Apna favourite quote batao", "Ek virtual hug bhejo", "Apna favourite place in home batao",
  "Ek imaginary pet name batao", "Apna favourite candy batao", "Ek 3-word story likho",
  "Apna favourite drink batao", "Ek childhood game yaad karo", "Apna favourite song mood batao",
  "Ek dream car name btao", "Apna favourite TV show batao", "Ek random act of kindness karo",
  "Apna phon number batao", "Ek kiss bhejo video me", "Apna favourite scent memory batao",
  "Ek nightmare share karo", "tunhre kitne fake account hai batao", "Ek 15 second singing clip bhejo",
  "Apna favourite ice-cream flavour batao", "Ek friend ka naam batao jiske liye feeling hai",
  "tumhra body count btao", "Ek random dance move bhejo (video me)", "Apna favourite breakfast batao",
  "Ek childhood fear share karo", "ek snap kro pic penty or bra me", "tunhra childhood trauma share kro",
  "green chillies khankr video me reaction dikhao", "tumhra dream house kaisa hoga ?",
  "kitne logo ko cheat kiya hai ?", "Ek random post pr author ko galiya do", "Apna favourite pizza topping batao",
  "kisi friend ki story pr like or comment kro(ganda)", "kisi ek friend ko galiya dekr block kro",
  "Ek pickup line likho", "bf/gf kaisa chahiye ?", "Ek childhood real life superhero batao",
  "Apna favourite midnight snack batao", "Ek virtual kiss bhejo", "Apna weight btao",
  "Apna favourite childhood memories batao", "Ek devil laugh audio bhejo",
  "Apni real age batao", "Ek favourite planet name batao jaha jana chahte ho", "Apna favourite sound of nature batao",
  "Ek 15 second actor ki mimicry karo (video me)", "Apna naked hips ki snap bhejo", "jab tum sad/upset hote ho to kya krna psnd krte ho"
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
