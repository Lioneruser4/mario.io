const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const rooms = {};
const queue = [];

function createBoard() {
  const board = Array(8).fill().map(() => Array(8).fill(0));
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 3; j++) {
      if ((i + j) % 2 === 1) board[j][i] = 3; // siyah
    }
    for (let j = 5; j < 8; j++) {
      if ((i + j) % 2 === 1) board[j][i] = 1; // beyaz
    }
  }
  return board;
}

io.on("connection", socket => {
  console.log("Bağlandı:", socket.id);

  socket.on("findMatch", () => {
    if (queue.length > 0) {
      const opponent = queue.shift();
      const room = `room_${socket.id}`;
      rooms[room] = {
        players: [socket.id, opponent.id],
        board: createBoard(),
        turn: "white"
      };
      socket.join(room);
      opponent.join(room);
      opponent.emit("joinedRoom", { color: "black", board: rooms[room].board, turn: "white" });
      socket.emit("joinedRoom", { color: "white", board: rooms[room].board, turn: "white" });
    } else {
      queue.push(socket);
    }
  });

  socket.on("createRoom", () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    rooms[code] = { players: [socket.id], board: createBoard(), turn: "white" };
    socket.join(code);
    socket.emit("roomCreated", { room: code });
  });

  socket.on("joinRoom", code => {
    if (rooms[code] && rooms[code].players.length === 1) {
      rooms[code].players.push(socket.id);
      socket.join(code);
      const board = rooms[code].board;
      io.to(code).emit("joinedRoom", { color: "black", board, turn: "white" });
      io.to(rooms[code].players[0]).emit("joinedRoom", { color: "white", board, turn: "white" });
    }
  });

  socket.on("move", ({ from, to }, callback) => {
    const room = [...socket.rooms][1];
    if (!room || !rooms[room]) return;
    const game = rooms[room];
    const piece = game.board[from.y][from.x];
    if (!piece) return;

    const isWhite = piece === 1 || piece === 2;
    if ((game.turn === "white") !== (isWhite)) return;

    game.board[to.y][to.x] = piece;
    game.board[from.y][from.x] = 0;
    game.turn = game.turn === "white" ? "black" : "white";

    io.to(room).emit("updateBoard", { board: game.board, turn: game.turn });
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu ${PORT}'da çalışıyor`));
