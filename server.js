const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));
app.get("/", (_, res) =>
  res.sendFile(path.join(__dirname, "index.html"))
);

/* ===== DARES (UNCHANGED) ===== */
const dares = [ /* SAME LIST AS YOU SENT – KEEP IT EXACT */ 
"Apni ek cute selfie bhejo","Sirf emojis me apna mood batao","Ek honest compliment do mujhe",
"Apna favourite song share karo","5 minute tak fast reply karo","Ek flirty line likho",
"Apna nickname batao","Ek cheez batao jo tumhe smile deti h","Voice note me sirf 'hey daddy' bolo😁",
"Ek secret btao jo koi ni janta tunhre alava","Apni playlist ka last song batao"
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
    if (now - rooms[r].createdAt > ROOM_TTL) {
      delete rooms[r];
    }
  }
}
setInterval(cleanRooms, 60 * 1000);

/* ===== SOCKET ===== */
io.on("connection", socket => {

  socket.on("create-room", ({ name, password }) => {
    if (rooms[name]) {
      socket.emit("error-msg", "Room already exists");
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
    socket.emit("room-created", { role: "creator", room: name });
  });

  socket.on("join-room", ({ name, password }) => {
    const room = rooms[name];
    if (!room || room.password !== password) {
      socket.emit("error-msg", "Invalid room or password");
      return;
    }
    room.joiner = socket.id;
    socket.join(name);
    socket.emit("room-joined", { role: "joiner", room: name });
    socket.to(name).emit("joiner-joined");
  });

  socket.on("scratch", ({ room, x, y, r }) => {
    socket.to(room).emit("scratch", { x, y, r });
  });

  socket.on("scratch-complete", room => {
    const r = rooms[room];
    if (!r || r.scratched) return;
    r.scratched = true;
    io.to(room).emit("reveal-dare", r.dare);
  });

  socket.on("done", room => {
    const r = rooms[room];
    if (!r) return;
    r.scratched = false;
    r.turn = r.turn === "creator" ? "joiner" : "creator";
    r.dare = randomDare();
    io.to(room).emit("next-turn", r.turn);
  });

  socket.on("exit-room", room => {
    if (rooms[room]?.creator === socket.id) {
      io.to(room).emit("room-closed");
      delete rooms[room];
    }
  });

  socket.on("disconnect", () => {
    for (const r in rooms) {
      if (rooms[r].joiner === socket.id) {
        rooms[r].joiner = null;
        io.to(r).emit("joiner-left");
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log("🔥 Server running on", PORT)
);
