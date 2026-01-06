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
  "Apni ek cute selfie bhejo", "Sirf emojis me apna mood batao", "Ek honest compliment do mujhe",
  "Apna favourite song share karo", "5 minute tak fast reply karo", "Ek flirty line likho", "Apna nickname batao",
  "Ek cheez batao jo tumhe smile deti h", "Voice note me sirf 'hey daddy' bolo😁", "Ek secret btao jo koi ni janta tunhre alava",
  "Apni playlist ka last song batao", "Ek apna fun GIF bhejo", "Apna relationship status describe karo",
  "Ek random memory share karo", "Ek imaginary date idea batao", "Kisi ko tag karke unki taarif karo (story me)",
  "Apna favourite person batao", "Ek dark joke sunao", "kabhi ghar se paise chori kre hai ?", "Kisi film ka dialogue bolo",
  "Ek song ki ek line gaake sunao", "Apni favourite movie batao", "Ek childhood story share karo", "Apna hidden talent dikhao",
  "following me se kisi random ko propose kro", "Apna favourite food batao", "Ek fake love story banao",
  "Apna funny face bna kr pic bhejo", "Ek compliment khud ko do", "Ek joke sunao", "mummy se bolo mujhe love marriage krni hai(video bhejo)",
  "Ek dream vacation spot batao", "Apna favourite game batao", "Ek weird habit share karo", "Apna favourite flower batao",
  "Ek motivational quote bhejo", "Apna favourite movie genre batao", "Ek childhood dream batao", "Apna favourite book batao",
  "Ek superpower chuno", "Apna favourite cartoon batao", "Ek magic trick dikhao", "Apna favourite sport batao",
  "Ek tongue twister bolo", "Apna favourite festival batao", "Ek random fact share karo", "Apna favourite app batao",
  "Ek mimicry karo", "Apna favourite dessert batao", "Ek bucket-list item share karo", "Apna favourite subject batao",
  "Ek 1 min dance karo or video bana ke bhejo", "Apna favourite sport batao", "Ek childhood photo send karo",
  "Apna bf/gf ki pic send kro", "Ek funny nickname do mujhe", "Apna favourite time of day batao",
  "Ek dream job batao", "Apna favourite emoji combo batao", "Ek random compliment do random ko", "Apna favourite weather batao",
  "Ek secret talent reveal karo", "Apna favourite quote batao", "Ek virtual hug bhejo", "Apna favourite place in home batao",
  "Ek imaginary pet name batao", "Apna favourite candy batao", "Ek 3-word story likho", "Apna favourite drink batao",
  "Ek childhood game yaad karo", "Apna favourite song mood batao", "Ek dream car name btao", "Apna favourite TV show batao",
  "Ek random act of kindness karo", "Apna phon number batao", "Ek kiss bhejo video me", "Apna favourite scent memory batao",
  "Ek nightmare share karo", "tunhre kitne fake account hai batao", "Ek 15 second singing clip bhejo",
  "Apna favourite ice-cream flavour batao", "Ek friend ka naam batao jiske liye feeling hai", "tumhra body count btao",
  "Ek random dance move bhejo (video me)", "Apna favourite breakfast batao", "Ek childhood fear share karo",
  "Apna favourite meme batao", "tunhra childhood trauma share kro", "green chillies khankr vudeo me reaction dikhao",
  "tumhra dream house kaisa hoga ?", "kitne logo ko cheat kiya hai ?", "Ek random post pr author ko galiya do",
  "Apna favourite pizza topping batao", "kisi friend ki story pr like or comment kro(ganda)", "kisi ek friend ko galiya dekr block kro",
  "Ek pickup line likho", "bf/gf kaisa chahiye ?", "Ek childhood real life superhero batao", "Apna favourite midnight snack batao",
  "Ek virtual kiss bhejo", "Apna weight btao", "online chocolate order kro mere liye", "Apna favourite childhood memories batao",
  "Ek devil laugh audio bhejo", "Apni real age batao", "Ek favourite planet name batao jaha jana chahte ho",
  "Apna favourite sound of nature batao", "Ek 15 second actor ki mimicry karo (video me)", "Apna favourite sppt btao",
  "jab tum sad/upset hote ho to kya krna psnd krte ho"
];

const rooms = {};
function getRandomDare() {
  return dares[Math.floor(Math.random() * dares.length)];
}

io.on("connection", socket => {
  console.log("✅ User connected:", socket.id);

  // Reconnection logic - user rejoins their room
  socket.on("rejoin-room", (data) => {
    const room = data.room;
    if (rooms[room]) {
      socket.join(room);
      if (rooms[room].creator === socket.id) {
        socket.emit('role', 'creator');
      } else if (rooms[room].joiner === socket.id) {
        socket.emit('role', 'joiner');
      }
      socket.emit("state", rooms[room]);
    }
  });

  socket.on("check-room", room => {
    socket.emit('room-check-result', !!rooms[room]);
  });

  socket.on("join", room => {
    if (rooms[room] && rooms[room].joiner && rooms[room].joiner !== socket.id) { 
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
      socket.emit("state", rooms[room]);
    } else {
      // If creator reconnects
      if (rooms[room].creator === socket.id) {
        socket.emit('role', 'creator');
        socket.emit("state", rooms[room]);
      } 
      // If joiner joins or reconnects
      else {
        rooms[room].joiner = socket.id; 
        rooms[room].joinerJoined = true;
        socket.emit('role', 'joiner');
        // Send state to both users
        io.to(rooms[room].creator).emit("state", rooms[room]);
        io.to(rooms[room].creator).emit('joiner-joined');
        socket.emit("state", rooms[room]);
      }
    }
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
    io.to(room).emit("new-turn", { dare: rooms[room].dare, turn: rooms[room].turn });
  });

  socket.on("user-active", data => {
    if (rooms[data.room]) {
      io.to(data.room).emit("user-active-status", { active: data.active });
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
    for (const room in rooms) {
      if (rooms[room].joiner === socket.id) {
        rooms[room].joiner = null; 
        rooms[room].joinerJoined = false; 
        io.to(room).emit('joiner-left');
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`💖 Server running on port ${PORT}`));
