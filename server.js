/***********************************************************************
 *                                                                     *
 *                  ŞAŞKİ ONLINE – 2025 SON SÜRÜM (YEME YOK)           *
 *               TÜM DOSYALAR AYNI KLASÖRDE – ALT KLASÖR YOK          *
 *               https://mario-io-1.onrender.com                      *
 *                                                                     *
 ***********************************************************************/

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Socket.IO – %100 BAĞLANTI GARANTİLİ
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000
});

// TÜM DOSYALAR AYNI KLASÖRDE → public YOK!
app.use(express.static(__dirname));

// Ana sayfa
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/test", (req, res) => {
  res.send("<h1 style='color:#00ffff;background:#000;text-align:center;padding:15%'>ŞAŞKİ ONLINE SUNUCUSU ÇALIŞIYOR!</h1>");
});

// ====================== OYUN MANTIĞI ======================
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
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) f[7 - y][7 - x] = b[y][x];
  return f;
}

io.on("connection", (socket) => {
  console.log("YENİ OYUNCU →", socket.id);

  socket.on("findMatch", () => {
    if (queue.length > 0) {
      const opp = queue.shift();
      const room = "r_" + Date.now();
      rooms[room] = { board: createBoard(), turn: "white", players: [socket.id, opp.id] };

      socket.join(room); opp.join(room);

      socket.emit("gameStart", { color: "white", board: rooms[room].board, turn: "white", flipped: false });
      opp.emit("gameStart", { color: "black", board: flipBoard(rooms[room].board), turn: "white", flipped: true });
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
      socket.emit("errorMsg", "Oda dolu veya geçersiz!");
    }
  });

  socket.on("move", ({ from, to }) => {
    const room = [...socket.rooms].find(r => r !== socket.id);
    if (!room || !rooms[room]) return;

    const game = rooms[room];
    const piece = game.board[from.y][from.x];
    if (!piece) return;

    const isWhite = piece === 1 || piece === 2;
    if ((game.turn === "white") !== isWhite) return;

    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    if (dx !== 1 || dy !== 1 || game.board[to.y][to.x] !== 0) return;

    game.board[to.y][to.x] = piece;
    game.board[from.y][from.x] = 0;
    if (piece === 1 && to.y === 0) game.board[to.y][to.x] = 2;
    if (piece === 3 && to.y === 7) game.board[to.y][to.x] = 4;

    game.turn = game.turn === "white" ? "black" : "white";
    const sendBoard = game.turn === "black" ? flipBoard(game.board) : game.board;

    io.to(room).emit("boardUpdate", { board: sendBoard, turn: game.turn, flipped: game.turn === "black" });
  });

  socket.on("disconnect", () => {
    console.log("Ayrıldı →", socket.id);
    const i = queue.indexOf(socket);
    if (i > -1) queue.splice(i, 1);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("=".repeat(70));
  console.log("   ŞAŞKİ ONLINE SUNUCUSU ÇALIŞIYOR!");
  console.log("   URL: https://mario-io-1.onrender.com");
  console.log("=".repeat(70));
});
