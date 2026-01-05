 
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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const dares = [
  "Apni ek cute selfie bhejo", "Sirf emojis me apna mood batao", "Ek honest compliment bhejo",
  "Apna favourite song share karo", "5 minute tak fast reply karo", "Ek flirty line likho",
  "Apna nickname batao", "Ek cheez batao jo tumhe smile de", "Voice note me sirf 'hi' bolo",
  "Ek secret emoji me likho", "Apni playlist ka last song batao", "Ek fun GIF bhejo",
  "Apna current status describe karo", "Ek random memory share karo", "Ek imaginary date idea batao"
];

const rooms = {};

function getRandomDare() {
  return dares[Math.floor(Math.random() * dares.length)];
}

io.on("connection", socket => {
  console.log("✅ User connected:", socket.id);

  socket.on("join", (room) => {
    socket.join(room);
    
    if (!rooms[room]) {
      rooms[room] = {
        dare: getRandomDare(),
        scratched: false,
        turn: 'creator',
        creator: socket.id,
        joiner: null,
        joinerJoined: false
      };
      socket.emit('role', 'creator');
    } else {
      if (!rooms[room].joiner) {
        rooms[room].joiner = socket.id;
        rooms[room].joinerJoined = true;
        socket.emit('role', 'joiner');
        socket.to(room).emit('joiner-joined');
      } else {
        socket.emit('error', 'Room is full');
        return;
      }
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

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`💖 Server running on port ${PORT}`);
});
