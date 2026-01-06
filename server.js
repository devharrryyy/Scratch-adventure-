const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(__dirname));
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

// Constants
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
  "Apna favourite cartoon batao", "Ek magic trick dikhao", "Apna favourite sport batao",
  "Ek tongue twister bolo", "Apna favourite festival batao", "Ek random fact share karo",
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

const rooms = new Map();

function getRandomDare() {
  return dares[Math.floor(Math.random() * dares.length)];
}

function isValidRoom(room) {
  return room && typeof room === 'string' && room.length > 0 && room.length <= 50;
}

function cleanupRooms() {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.lastActivity > ROOM_TIMEOUT_MS) {
      io.to(roomId).emit('room-closed');
      rooms.delete(roomId);
      console.log(`🗑️ Room ${roomId} deleted due to inactivity`);
    }
  }
}

// Run cleanup every hour
setInterval(cleanupRooms, 60 * 60 * 1000);

io.on("connection", socket => {
  console.log("✅ User connected:", socket.id);

  socket.on("check-room", room => {
    if (!isValidRoom(room)) return socket.emit('room-check-result', false);
    const roomData = rooms.get(room);
    socket.emit('room-check-result', !!roomData && !roomData.joiner);
  });

  socket.on("join", room => {
    if (!isValidRoom(room)) return socket.emit('error', 'Invalid room ID');
    
    const roomData = rooms.get(room);
    const existingRoom = !!roomData;
    
    // Check if room is full
    if (existingRoom && roomData.joiner) { 
      return socket.emit('error', 'Room is full or closed'); 
    }

    socket.join(room);
    
    if (!existingRoom) {
      // Create new room
      rooms.set(room, { 
        dare: getRandomDare(), 
        scratched: false, 
        turn: ROLE_CREATOR, 
        creator: socket.id, 
        joiner: null, 
        joinerJoined: false,
        lastActivity: Date.now()
      });
      socket.emit('role', ROLE_CREATOR);
    } else {
      // Check if creator is reconnecting
      const creatorSocket = roomData.creator ? io.sockets.sockets.get(roomData.creator) : null;
      
      if (!creatorSocket) {
        // Creator reconnecting
        roomData.creator = socket.id;
        socket.emit('role', ROLE_CREATOR);
      } else {
        // New joiner
        roomData.joiner = socket.id; 
        roomData.joinerJoined = true;
        socket.emit('role', ROLE_JOINER); 
        socket.to(room).emit('joiner-joined');
      }
      roomData.lastActivity = Date.now();
    }
    
    socket.emit("state", rooms.get(room));
  });

  socket.on("scratch", data => {
    if (!data?.room || !isValidRoom(data.room)) return;
    const roomData = rooms.get(data.room);
    if (!roomData || ![roomData.creator, roomData.joiner].includes(socket.id)) return;
    socket.to(data.room).emit("scratch", data);
  });

  socket.on("scratch-complete", room => {
    if (!isValidRoom(room)) return;
    const roomData = rooms.get(room);
    if (!roomData || roomData.scratched || ![roomData.creator, roomData.joiner].includes(socket.id)) return;
    
    roomData.scratched = true;
    roomData.lastActivity = Date.now();
    io.to(room).emit("reveal", roomData.dare);
  });

  socket.on("done", room => {
    if (!isValidRoom(room)) return;
    const roomData = rooms.get(room);
    if (!roomData || ![roomData.creator, roomData.joiner].includes(socket.id)) return;
    
    roomData.scratched = false;
    roomData.turn = (roomData.turn === ROLE_CREATOR) ? ROLE_JOINER : ROLE_CREATOR;
    roomData.dare = getRandomDare();
    roomData.lastActivity = Date.now();
    io.to(room).emit("new-turn", { dare: roomData.dare, turn: roomData.turn });
  });

  socket.on("user-active", data => {
    if (!data?.room || !isValidRoom(data.room)) return;
    const roomData = rooms.get(data.room);
    if (!roomData || ![roomData.creator, roomData.joiner].includes(socket.id)) return;
    
    roomData.lastActivity = Date.now();
    socket.to(data.room).emit("user-active-status", { active: data.active });
  });

  socket.on("exit-room", room => {
    if (!isValidRoom(room)) return;
    const roomData = rooms.get(room);
    if (!roomData || roomData.creator !== socket.id) return;
    
    io.to(room).emit('room-closed');
    rooms.delete(room);
    console.log(`🗑️ Room ${room} deleted by creator exit`);
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
    
    for (const [roomId, roomData] of rooms.entries()) {
      let roomUpdated = false;
      
      if (roomData.joiner === socket.id) {
        roomData.joiner = null;
        roomData.joinerJoined = false;
        roomUpdated = true;
        io.to(roomId).emit('joiner-left');
      }
      
      if (roomData.creator === socket.id) {
        roomUpdated = true;
        io.to(roomId).emit('creator-offline');
      }
      
      if (roomUpdated) {
        roomData.lastActivity = Date.now();
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`💖 Server running on port ${PORT}`)));

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
