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

const dares = [
  "Apni ek cute selfie bhejo",
  "Sirf emojis me apna mood batao",
  "Ek honest compliment bhejo",
  "Apna favourite song share karo",
  "5 minute tak fast reply karo",
  "Ek flirty line likho",
  "Apna nickname batao",
  "Ek cheez batao jo tumhe smile de",
  "Voice note me sirf 'hi' bolo",
  "Ek secret emoji me likho",
  "Apni playlist ka last song batao",
  "Ek fun GIF bhejo",
  "Apna current status describe karo",
  "Ek random memory share karo",
  "Ek imaginary date idea batao",
  "Kisi ko tag karke unki taarif karo",
  "Apna favourite emoji batao",
  "Ek dad joke sunao",
  "Apna mood abhi abhi batao",
  "Kisi film ka dialogue bolo",
  "Ek song ki ek line gaake bhejo",
  "Apna favourite colour batao",
  "Ek childhood story share karo",
  "Apna hidden talent dikhao",
  "Ek riddle pucho",
  "Apna favourite food batao",
  "Ek emoji story banao",
  "Apna favourite animal batao",
  "Ek compliment khud ko do",
  "Ek joke batao",
  "Apna favourite season batao",
  "Ek dream vacation spot batao",
  "Apna favourite game batao",
  "Ek weird habit share karo",
  "Apna favourite flower batao",
  "Ek motivational quote bhejo",
  "Apna favourite movie genre batao",
  "Ek childhood dream batao",
  "Apna favourite book batao",
  "Ek superpower chuno",
  "Apna favourite cartoon batao",
  "Ek magic trick dikhao",
  "Apna favourite sport batao",
  "Ek tongue twister bolo",
  "Apna favourite festival batao",
  "Ek random fact share karo",
  "Apna favourite app batao",
  "Ek mimicry karo",
  "Apna favourite dessert batao",
  "Ek bucket-list item share karo",
  "Apna favourite subject batao",
  "Ek 5-second dance karo",
  "Apna favourite smell batao",
  "Ek childhood photo describe karo",
  "Apna favourite sound batao",
  "Ek funny nickname suggest karo",
  "Apna favourite time of day batao",
  "Ek dream job batao",
  "Apna favourite emoji combo batao",
  "Ek random compliment generate karo",
  "Apna favourite weather batao",
  "Ek secret talent reveal karo",
  "Apna favourite quote batao",
  "Ek virtual hug bhejo",
  "Apna favourite place in home batao",
  "Ek imaginary pet name batao",
  "Apna favourite candy batao",
  "Ek 3-word story likho",
  "Apna favourite drink batao",
  "Ek childhood game yaad karo",
  "Apna favourite song mood batao",
  "Ek dream car describe karo",
  "Apna favourite TV show batao",
  "Ek random act of kindness karo",
  "Apna favourite number batao",
  "Ek virtual high-five bhejo",
  "Apna favourite scent memory batao",
  "Ek funny dream share karo",
  "Apna favourite social media platform batao",
  "Ek 5-second singing clip bhejo",
  "Apna favourite ice-cream flavour batao",
  "Ek imaginary friend ka naam batao",
  "Apna favourite constellation batao",
  "Ek random dance move bhejo",
  "Apna favourite breakfast batao",
  "Ek childhood fear share karo",
  "Apna favourite meme category batao",
  "Ek virtual gift bhejo",
  "Apna favourite candle scent batao",
  "Ek dream house feature batao",
  "Apna favourite emoji sequence batao",
  "Ek random song hum karo",
  "Apna favourite pizza topping batao",
  "Ek imaginary holiday invent karo",
  "Apna favourite board game batao",
  "Ek 3-line poem likho",
  "Apna favourite fruit batao",
  "Ek childhood superhero batao",
  "Apna favourite midnight snack batao",
  "Ek virtual wink bhejo",
  "Apna favourite cloud shape batao",
  "Ek dream outfit describe karo",
  "Apna favourite childhood rhyme batao",
  "Ek random laugh audio bhejo",
  "Apna favourite star name batao",
  "Ek imaginary planet name batao",
  "Apna favourite sound of nature batao",
  "Ek 5-second mimicry karo",
  "Apna favourite emoji art banao",
  "Ek dream concert line-up batao"
];

const rooms = {};
function getRandomDare() {
  return dares[Math.floor(Math.random() * dares.length)];
}

io.on("connection", socket => {
  console.log("✅ User connected:", socket.id);

  socket.on("check-room", room => socket.emit('room-check-result', !!rooms[room]));

  socket.on("join", room => {
    if (rooms[room] && rooms[room].joiner) { socket.emit('error', 'Room is full or closed'); return; }
    socket.join(room);
    if (!rooms[room]) {
      rooms[room] = { dare: getRandomDare(), scratched: false, turn: 'creator', creator: socket.id, joiner: null, joinerJoined: false };
      socket.emit('role', 'creator');
    } else {
      rooms[room].joiner = socket.id; rooms[room].joinerJoined = true;
      socket.emit('role', 'joiner'); socket.to(room).emit('joiner-joined');
    }
    socket.emit("state", rooms[room]);
  });

  socket.on("scratch", data => socket.to(data.room).emit("scratch", data));

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
    io.to(room).emit("new-turn", { dare: rooms[room].dare, turn: rooms[room].turn });
  });

  socket.on("user-active", data => {
    if (rooms[data.room]) socket.to(data.room).emit("user-active-status", { active: data.active });
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
    for (const room in rooms) {
      if (rooms[room].creator === socket.id) {
        io.to(room).emit('room-closed'); delete rooms[room]; console.log(`🗑️ Room ${room} deleted`);
      } else if (rooms[room].joiner === socket.id) {
        rooms[room].joiner = null; rooms[room].joinerJoined = false; io.to(room).emit('joiner-left');
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`💖 Server running on port ${PORT}`));
