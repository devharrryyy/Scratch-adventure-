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
  "Apni ek cute selfie bhejo", "naked thighs snap send kro", "Ek honest compliment do mujhe", "Apna favourite song share karo", "5 minute tak fast reply karo", "Ek flirty line likho", "Apna nickname batao", "Ek cheez batao jo tumhe smile deti h", "Voice note me sirf 'hey daddy' bolo", "Ek secret btao jo koi ni janta tumhre alava", "Apni playlist ka last song batao", "Ek apna fun GIF bhejo", "Apna relationship status describe karo", "Ek random memory share karo", "Ek imaginary date idea batao", "mujhko tag karke meri taarif karo (story me)", "Apna favourite person batao", "Ek dark joke sunao", "kabhi ghar se paise chori kre hai ?", "full body snap send kro bra & penty me", "Ek song ki ek line gaake sunao", "Apni favourite movie batao", "Ek childhood story share karo", "Apna hidden talent dikhao", "following me se kisi random ko propose kro", "Apna favourite food batao", "fuck me daddy bolo voice note me(sexy way)", "Apna funny face bna kr pic bhejo", "Mujhse ek compliment do", "apne sare hidden mole dikhao", "mummy se bolo mujhe love marriage krni hai(video bhejo)", "Ek dream vacation spot batao", "Apna favourite game batao", "Ek weird habit share karo", "Apna favourite flower batao", "Hands se boobs cover krke snap bhejo(naked)", "Mirror me back body snap bhejo (Naked)", "Ek childhood dream batao", "apni pussy hands se cover kro snap bhejo", "Ek superpower chuno", "Apna favourite cartoon batao", "sexy song pr dance krke snap bhejo bra & penty me", "Apna favourite sport batao", "Ek tongue twister bolo", "Apna favourite festival batao", "Ek random fact share karo", "Apna favourite app batao", "Ek mimicry karo", "Apna favourite dessert batao", "Apna dick dikhao", "Apna favourite subject batao", "Ek 1 min dance karo or video bana ke bhejo", "Apna childhood photo send karo", "Apna bf/gf ki pic send kro", "Ek cute nickname do mujhe", "Apna favourite time of day batao", "Ek dream job batao", "apna dick dikhao", "Ek random compliment do random ko", "apna dick dikhao", "Ek secret talent reveal karo", "Apna favourite quote batao", "ek naked pic send kro apni", "Apna favourite place in home batao", "apne hips par slap krke snap bhejo(video)", "Apna favourite candy batao", "Apna favourite drink batao", "Ek childhood game yaad karo", "Apna favourite song mood batao", "Ek dream car name btao", "Apna favourite TV show batao", "Ek random act of kindness karo", "Apna phon number batao", "Ek kiss bhejo video me", "Apna favourite scent memory batao", "Ek nightmare share karo", "tunhre kitne fake account hai batao", "Ek 15 second singing clip bhejo", "Apna favourite ice-cream flavour batao", "Ek friend ka naam batao jiske liye feeling hai", "tumhra body count btao", "Ek random dance move bhejo (video me)", "Apna favourite breakfast batao", "Ek childhood fear share karo", "Apna favourite meme batao", "tunhra childhood trauma share kro", "green chillies khankr vudeo me reaction dikhao", "tumhra dream house kaisa hoga ?", "kitne logo ko cheat kiya hai ?", "Ek random post pr author ko galiya do", "Apna favourite pizza topping batao", "kisi friend ki story pr like or comment kro(ganda)", "kisi ek friend ko galiya dekr block kro", "Ek pickup line likho", "bf/gf kaisa chahiye ?", "Ek childhood real life superhero batao", "Apna favourite midnight snack batao", "Ek virtual kiss bhejo", "Apna weight btao", "online chocolate order kro mere liye", "Apna favourite childhood memories batao", "Ek devil laugh audio bhejo", "Apni real age batao", "Ek favourite planet name batao jaha jana chahte ho", "Apna favourite sound of nature batao", "Ek 15 second actor ki mimicry karo (video me)", "Apna favourite sppt btao", "jab tum sad/upset hote ho to kya krna psnd krte ho"
];

const rooms = {};
function getRandomDare() {
  return dares[Math.floor(Math.random() * dares.length)];
}

io.on("connection", socket => {
  console.log("✅ User connected:", socket.id);

  socket.on("check-room", room => socket.emit('room-check-result', !!rooms[room]));

  socket.on("join", room => {
    // agar room full ho ya creator ne exit kiya ho to na aane de
    if (rooms[room] && rooms[room].joiner) { 
      socket.emit('error', 'Room is full or closed'); 
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
        joinerJoined: false 
      };
      socket.emit('role', 'creator');
    } else {
      // Check if creator is reconnecting (1 line addition)
      if (!io.sockets.sockets.get(rooms[room].creator)) { rooms[room].creator = socket.id; socket.emit('role', 'creator'); socket.emit("state", rooms[room]); return; }
      
      rooms[room].joiner = socket.id; 
      rooms[room].joinerJoined = true;
      socket.emit('role', 'joiner'); 
      socket.to(room).emit('joiner-joined');
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

  // ONLY creator exit icon triggers room deletion
  socket.on("exit-room", room => {
    if (!rooms[room] || rooms[room].creator !== socket.id) return;
    io.to(room).emit('room-closed');
    delete rooms[room];
    console.log(`🗑️ Room ${room} deleted by creator exit`);
  });

  // Auto-rejoin support: keep room alive on any disconnect except explicit creator exit
  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
    for (const room in rooms) {
      if (rooms[room].joiner === socket.id) {
        rooms[room].joiner = null;
        rooms[room].joinerJoined = false;
        io.to(room).emit('joiner-left');
      }
      // creator disconnect: only mark offline, room stays alive
      if (rooms[room].creator === socket.id) {
        io.to(room).emit('creator-offline');
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`💖 Server running on port ${PORT}`));
