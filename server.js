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
  }
});

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const dares = [
  "Apni ek cute selfie bhejo", "Sirf emojis me apna mood batao", "Ek honest compliment bhejo",
  "Apna favourite song share karo", "5 minute tak fast reply karo", "Ek flirty line likho",
  "Apna nickname batao", "Ek cheez batao jo tumhe smile de", "Voice note me sirf ‘hi’ bolo",
  "Apni recent photo bhejo", "Ek secret emoji me likho", "Apni playlist ka last song batao",
  "Ek fun GIF bhejo", "Apna current status describe karo", "Ek random memory share karo",
  "Sirf ek word me mujhe describe karo", "Apni favourite app batao", "Ek funny sticker bhejo",
  "Apna favourite late-night activity batao", "Ek sweet good-night line likho",
  "Apni handwriting me naam likh ke pic bhejo", "Ek imaginary date idea batao",
  "Apna screen wallpaper describe karo", "Ek cheez jo tumhe attractive lagti ho"
];

const rooms = {};

function getRandomDare() {
  return dares[Math.floor(Math.random() * dares.length)];
}

io.on("connection", socket => {
  console.log("✅ User connected:", socket.id);

  socket.on("join", (room) => {
    // Check if room exists and is full
    if (rooms[room] && rooms[room].joiner) {
      socket.emit('error', '🚫 Room is full or closed');
      return;
    }
    
    socket.join(room);
    
    if (!rooms[room]) {
      rooms[room] = {
        dare: getRandomDare(),
        scratched: false,
        turn: 'creator',
        creator: socket.id,
        joiner: null,
        joinerJoined: false,
        creatorActive: true
      };
      socket.emit('role', 'creator');
    } else {
      rooms[room].joiner = socket.id;
      rooms[room].joinerJoined = true;
      socket.emit('role', 'joiner');
      socket.to(room).emit('joiner-joined');
    }

    socket.emit("state", rooms[room]);
  });

  socket.on("scratch", data => {
    socket.to(data.room).emit("scratch", data);
  });

  socket.on("scratch-complete", room => {
    if (!rooms[room] || rooms[room].scratched) return;
    rooms[room].scratched = true;
    io.to(room).emit("reveal", rooms[room].dare);
  });

  socket.on("done", room => {
    if (!rooms[room]) return;
    rooms[room].scratched = false;
    rooms[room].turn = (rooms[room].turn === 'creator') ? 'joiner' : 'creator';
    rooms[room].dare = getRandomDare();
    io.to(room).emit("new-turn", {
      dare: rooms[room].dare,
      turn: rooms[room].turn
    });
  });

  socket.on("user-active", (data) => {
    if (rooms[data.room]) {
      socket.to(data.room).emit("user-active-status", { active: data.active });
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
    
    for (const room in rooms) {
      if (rooms[room].creator === socket.id) {
        // Creator left - delete room
        io.to(room).emit('room-closed');
        delete rooms[room];
        console.log(`🗑️ Room ${room} deleted`);
      } else if (rooms[room].joiner === socket.id) {
        // Joiner left - remove joiner
        rooms[room].joiner = null;
        rooms[room].joinerJoined = false;
        io.to(room).emit('joiner-left');
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`💖 Server running on port ${PORT}`);
});
