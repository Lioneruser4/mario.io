const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const queue = [];           // Dereceli sıra
const rooms = {};           // Özel odalar (kod = roomID)

function createBoard() {
  const b = Array(8).fill().map(() => Array(8).fill(0));
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 3; j++) if ((i + j) % 2 === 1) b[j][i] = 3;        // siyah taş
    for (let j = 5; j < 8; j++) if ((i + j) % 2 === 1) b[j][i] = 1;        // beyaz taş
  }
  return b;
}

io.on("connection", socket => {
  console.log("Bağlandı:", socket.id);

  // Dereceli
  socket.on("findMatch", () => {
    if (queue.length > 0) {
      const opponent = queue.shift();
      const roomId = "ranked_" + Date.now();
      rooms[roomId] = { board: createBoard(), turn: "white", players: [socket.id, opponent.id] };

      socket.join(roomId);
      opponent.join(roomId);

      socket.emit("gameStart", { color: "white", board: rooms[roomId].board, turn: "white" });
      opponent.emit("gameStart", { color: "black", board: rooms[roomId].board, turn: "white" });
      console.log("Eşleşme:", roomId);
    } else {
      queue.push(socket);
      socket.emit("searching");
    }
  });

  // Özel oda oluştur
  socket.on("createRoom", () => {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    rooms[code] = { board: createBoard(), turn: "white", players: [socket.id] };
    socket.join(code);
    socket.emit("roomCreated", code);
  });

  // Özel odaya katıl
  socket.on("joinRoom", code => {
    code = code.trim();
    if (rooms[code] && rooms[code].players.length === 1) {
      rooms[code].players.push(socket.id);
      socket.join(code);

      const data = { board: rooms[code].board, turn: "white" };
      io.to(rooms[code].players[0]).emit("gameStart", { ...data, color: "white" });
      socket.emit("gameStart", { ...data, color: "black" });
    } else {
      socket.emit("errorMsg", "Oda dolu veya yok!");
    }
  });

  // Hamle
  socket.on("move", ({ from, to }) => {
    const roomId = [...socket.rooms][1];
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

      // Vazi kontrolü
      if (piece === 1 && to.y === 0) game.board[to.y][to.x] = 2;
      if (piece === 3 && to.y === 7) game.board[to.y][to.x] = 4;

      game.turn = game.turn === "white" ? "black" : "white";
      io.to(roomId).emit("boardUpdate", { board: game.board, turn: game.turn });
    }
  });

  socket.on("cancelMatch", () => {
    const i = queue.indexOf(socket);
    if (i > -1) queue.splice(i, 1);
  });

  socket.on("disconnect", () => {
    const i = queue.indexOf(socket);
    if (i > -1) queue.splice(i, 1);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Sunucu ${PORT}'da çalışıyor`));
