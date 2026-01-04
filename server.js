const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

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

  socket.on("join", room => {
    socket.join(room);

    if (!rooms[room]) {
      rooms[room] = {
        dare: getRandomDare(),
        scratched: false
      };
    }

    socket.emit("state", rooms[room]);
  });

  socket.on("scratch", data => {
    socket.to(data.room).emit("scratch", data);
  });

  socket.on("scratch-complete", room => {
    rooms[room].scratched = true;
    io.to(room).emit("reveal", rooms[room].dare);
  });

  socket.on("new-round", room => {
    rooms[room] = {
      dare: getRandomDare(),
      scratched: false
    };
    io.to(room).emit("state", rooms[room]);
  });

});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
