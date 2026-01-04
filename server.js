const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ✅ Serve static root
app.use(express.static(__dirname));

// ✅ Always serve index.html for any GET request
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ✅ Dares
const dares = [
  "Apni ek cute selfie bhejo",
  "Sirf emojis me apna mood batao",
  "Ek honest compliment bhejo",
  "Apna favourite song share karo",
  "5 minute tak fast reply karo",
  "Ek flirty line likho",
  "Apna nickname batao",
  "Ek cheez batao jo tumhe smile de",
  "Voice note me sirf hi bolo",
  "Apni recent photo bhejo",
  "Ek secret batao",
  "Ek fun GIF bhejo",
  "Apna current status describe karo",
  "Ek random memory share karo",
  "Sirf ek word me mujhe describe karo",
  "Apna favourite late-night activity batao",
  "Ek sweet good-night line likho",
  "Ek imaginary date idea batao",
  "Ek cheez jo tumhe attractive lagti ho",
  "Next round ka dare tum set karo"
];

const rooms = {};

function getRandomDare() {
  return dares[Math.floor(Math.random() * dares.length)];
}

io.on("connection", socket => {
  socket.on("join", room => {
    socket.join(room);
    if (!rooms[room]) rooms[room] = { dare: getRandomDare(), scratched: false };
    socket.emit("state", rooms[room]);
  });

  socket.on("scratch", data => socket.to(data.room).emit("scratch", data));
  socket.on("scratch-complete", room => {
    rooms[room].scratched = true;
    io.to(room).emit("reveal", rooms[room].dare);
  });
  socket.on("new-round", room => {
    rooms[room] = { dare: getRandomDare(), scratched: false };
    io.to(room).emit("state", rooms[room]);
  });
});

// ✅ Render PORT fix
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
