const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.static("public"));

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

const rooms = {};
const queue = [];

function createBoard() {
  const board = Array(8).fill().map(() => Array(8).fill(0));
  // Beyaz taşlar (alt oyuncu - 1:normal, 2:vazi)
  for (let i = 0; i < 8; i++) {
    for (let j = 5; j < 8; j++) {
      if ((i + j) % 2 === 1) board[j][i] = 1;
    }
  }
  // Siyah taşlar (üst oyuncu - 3:normal, 4:vazi)
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 3; j++) {
      if ((i + j) % 2 === 1) board[j][i] = 3;
    }
  }
  return board;
}

io.on("connection", (socket) => {
  console.log("Oyuncu bağlandı:", socket.id);

  socket.on("findMatch", () => {
    console.log("Eşleşme arıyor:", socket.id);
    if (queue.length > 0) {
      const opponent = queue.shift();
      const roomId = `ranked_${Date.now()}`;
      rooms[roomId] = {
        players: [socket.id, opponent.id],
        board: createBoard(),
        turn: "white"
      };
      socket.join(roomId);
      opponent.join(roomId);
      
      socket.emit("joinedRoom", { 
        room: roomId,
        color: "white", 
        board: rooms[roomId].board, 
        turn: "white" 
      });
      opponent.emit("joinedRoom", { 
        room: roomId,
        color: "black", 
        board: rooms[roomId].board, 
        turn: "white" 
      });
      console.log("Eşleşme bulundu:", roomId);
    } else {
      queue.push(socket);
      console.log("Sıraya alındı:", socket.id);
    }
  });

  socket.on("createRoom", () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    rooms[code] = { 
      players: [socket.id], 
      board: createBoard(), 
      turn: "white" 
    };
    socket.join(code);
    socket.emit("roomCreated", { room: code });
    console.log("Oda oluşturuldu:", code, socket.id);
  });

  socket.on("joinRoom", (code) => {
    code = code.toUpperCase();
    if (rooms[code] && rooms[code].players.length === 1) {
      rooms[code].players.push(socket.id);
      socket.join(code);
      
      const board = rooms[code].board;
      io.to(code).emit("startGame", { 
        color: rooms[code].players[0] === socket.id ? "white" : "black",
        board: board,
        turn: "white"
      });
      console.log("Odaya katıldı:", code, socket.id);
    } else {
      socket.emit("roomError", "Oda dolu veya bulunamadı!");
    }
  });

  socket.on("move", ({ from, to }) => {
    const room = [...socket.rooms][1];
    if (!room || !rooms[room]) return;
    
    const game = rooms[room];
    const piece = game.board[from.y][from.x];
    
    if (!piece) return;
    
    const isWhite = piece === 1 || piece === 2;
    if (game.turn !== (isWhite ? "white" : "black")) return;
    
    // Basit hareket (yeme yok şimdilik)
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    if (dx === 1 && dy === 1 && game.board[to.y][to.x] === 0) {
      game.board[to.y][to.x] = piece;
      game.board[from.y][from.x] = 0;
      
      // Vazi kontrolü
      if (piece === 1 && to.y === 0) {
        game.board[to.y][to.x] = 2; // beyaz vazi
      }
      if (piece === 3 && to.y === 7) {
        game.board[to.y][to.x] = 4; // siyah vazi
      }
      
      game.turn = game.turn === "white" ? "black" : "white";
      
      io.to(room).emit("updateBoard", { 
        board: game.board, 
        turn: game.turn 
      });
    }
  });

  socket.on("cancelMatch", () => {
    const i = queue.indexOf(socket);
    if (i > -1) queue.splice(i, 1);
  });

  socket.on("disconnect", () => {
    console.log("Oyuncu ayrıldı:", socket.id);
    const i = queue.indexOf(socket);
    if (i > -1) queue.splice(i, 1);
    
    // Odalardan temizle
    for (let room in rooms) {
      rooms[room].players = rooms[room].players.filter(p => p !== socket.id);
      if (rooms[room].players.length === 0) {
        delete rooms[room];
      }
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Şaşki Sunucusu ${PORT} portunda çalışıyor!`);
});
