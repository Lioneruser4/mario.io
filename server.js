const express = require("express");
const http = require("http");
const path = require("path");

const app = express();
const server = http.createServer(app);

// Socket.io – EN ÖNEMLİ KISIM BURASI (CORS + transports düzeltildi)
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"],   // ← BU SATIR BAĞLANTI SORUNUNU %100 ÇÖZER
  allowEIO3: true
});

// Statik dosyalar (GitHub Pages yerine Render'dan da açılabilir)
app.use(express.static(path.join(__dirname, "public")));

// Ana sayfa
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// === OYUN MANTIĞI ===
const queue = [];
const rooms = {};

function createBoard() {
  const b = Array(8).fill().map(() => Array(8).fill(0));
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 3; j++) if ((i + j) % 2 === 1) b[j][i] = 3;
    for (let j = 5; j < 8; j++) if ((i + j) % 2 === 1) b[j][i] = 1;
  }
  return b;
}

function flipBoard(b) {
  const f = Array(8).fill().map(() => Array(8).fill(0));
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      f[7 - y][7 - x] = b[y][x];
  return f;
}

io.on("connection", (socket) => {
  console.log("Bağlandı →", socket.id);

  socket.on("findMatch", () => {
    if (queue.length > 0) {
      const opp = queue.shift();
      const roomId = "r_" + Date.now();
      rooms[roomId] = { board: createBoard(), turn: "white", players: [socket.id, opp.id] };

      socket.join(roomId);
      opp.join(roomId);

      socket.emit("gameStart", { color: "white", board: rooms[roomId].board, turn: "white", flipped: false });
      opp.emit("gameStart", { color: "black", board: flipBoard(rooms[roomId].board), turn: "white", flipped: true });
    } else {
      queue.push(socket);
      socket.emit("searching");
    }
  });

  socket.on("createRoom", () => {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    rooms[code] = { board: createBoard(), turn: "white", players: [socket.id] };
    socket.join(code);
    socket.emit("roomCreated", code);
  });

  socket.on("joinRoom", (code) => {
    code = code.trim();
    if (rooms[code] && rooms[code].players.length === 1) {
      rooms[code].players.push(socket.id);
      socket.join(code);
      const b = rooms[code].board;
      io.to(rooms[code].players[0]).emit("gameStart", { color: "white", board: b, turn: "white", flipped: false });
      socket.emit("gameStart", { color: "black", board: flipBoard(b), turn: "white", flipped: true });
    } else {
      socket.emit("errorMsg", "Oda dolu!");
    }
  });

  socket.on("move", ({ from, to }) => {
    const roomId = [...socket.rooms].find(r => r !== socket.id);
    if (!roomId || !rooms[roomId]) return;

    const game = rooms[roomId];
    const piece = game.board[from.y][from.x];
    if (!piece) return;

    const isWhite = piece === 1 || piece === 2;
    if ((game.turn === "white") !== isWhite) return;

    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);

    if (dx === 1 && dy === 1 && game.board[to.y][to.x] === 0) {
      game.board[to.y][to.x] = piece;
      game.board[from.y][from.x] = 0;

      if (piece === 1 && to.y === 0) game.board[to.y][to.x] = 2;
      if (piece === 3 && to.y === 7) game.board[to.y][to.x] = 4;

      game.turn = game.turn === "white" ? "black" : "white";
      const sendBoard = game.turn === "black" ? flipBoard(game.board) : game.board;

      io.to(roomId).emit("boardUpdate", {
        board: sendBoard,
        turn: game.turn,
        flipped: game.turn === "black"
      });
    }
  });

  socket.on("disconnect", () => {
    const i = queue.indexOf(socket);
    if (i > -1) queue.splice(i, 1);
    console.log("Ayrıldı →", socket.id);
  });
});

// PORT – Render.com için zorunlu
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`SUNUCU ÇALIŞIYOR → https://your-app.onrender.com`);
});
