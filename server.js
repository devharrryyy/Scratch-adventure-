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
  "Apni ek cute selfie bhejo",
"Sirf emojis me apna mood batao",
"Ek honest compliment bhejo",
"Apna favourite song share karo",
"5 minute tak fast reply karo",
"Ek flirty line likho",
"Apna nickname batao",
"Ek cheez batao jo tumhe smile de",
"Voice note me sirf ‘hi’ bolo",
"Apni recent photo (normal) bhejo",
"Ek secret emoji me likho",
"Apni playlist ka last song batao",
"Ek fun GIF bhejo",
"Apna current status describe karo",
"Ek random memory share karo",
"Sirf ek word me mujhe describe karo",
"Apni favourite app batao",
"Ek funny sticker bhejo",
"Apna favourite late-night activity batao",
"Ek sweet good-night line likho",
"Apni handwriting me naam likh ke pic bhejo",
"Ek imaginary date idea batao",
"Apna screen wallpaper describe karo",
"Ek cheez jo tumhe attractive lagti ho",
"Sirf ‘yes’ ya ‘no’ me next sawaal ka jawab do",
"Ek photo jo tumhe pasand ho share karo",
"Apni favourite gaali censored me likho",
"Ek inside joke banao",
"Apna mood change karne wali cheez batao",
];

const rooms = {};

function getRandomDare() {
  return dares[Math.floor(Math.random() * dares.length)];
}

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.on("join", (room) => {
    socket.join(room);
    
    if (!rooms[room]) {
      rooms[room] = {
        dare: getRandomDare(),
        scratched: false,
        turn: 'creator',
        creator: socket.id,
        joiner: null,
        revealedFor: []
      };
      socket.emit('role', 'creator');
    } else {
      rooms[room].joiner = socket.id;
      socket.emit('role', 'joiner');
    }

    socket.emit("state", rooms[room]);
    socket.to(room).emit('user-joined', socket.id);
  });

  socket.on("scratch", data => {
    socket.to(data.room).emit("scratch", data);
  });

  socket.on("scratch-complete", room => {
    if (rooms[room] && rooms[room].scratched === false) {
      rooms[room].scratched = true;
      rooms[room].revealedFor.push(socket.id);
      io.to(room).emit("reveal", rooms[room].dare);
    }
  });

  socket.on("done", room => {
    if (!rooms[room]) return;
    
    rooms[room].scratched = false;
    rooms[room].turn = (socket.id === rooms[room].creator) ? 'joiner' : 'creator';
    rooms[room].revealedFor = [];
    rooms[room].dare = getRandomDare();
    
    io.to(room).emit("new-turn", {
      dare: rooms[room].dare,
      turn: rooms[room].turn
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`💖 Server running on port ${PORT}`);
});
