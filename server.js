const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

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

function getValidMoves(board, x, y, color) {
  const piece = board[y][x];
  if (!piece || (piece === 1 || piece === 2 ? color !== 'white' : color !== 'black')) return [];

  const isKing = piece === 2 || piece === 4;
  const moves = [];
  
  // Normal hareketler
  const directions = isKing ? [[-1,-1],[-1,1],[1,-1],[1,1]] : 
    (color === 'white' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]);
  
  directions.forEach(([dy, dx]) => {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny][nx] === 0) {
      moves.push({ x: nx, y: ny, captures: [] });
    }
  });

  // Yeme hareketleri (zorunlu)
  const captureDirs = isKing ? [[-1,-1],[-1,1],[1,-1],[1,1]] : directions;
  captureDirs.forEach(([dy, dx]) => {
    const mx = x + dx, my = y + dy; // Orta (rakip)
    const nx = x + dx * 2, ny = y + dy * 2; // Hedef
    
    if (mx >= 0 && mx < 8 && my >= 0 && my < 8 &&
        nx >= 0 && nx < 8 && ny >= 0 && ny < 8 &&
        board[my][mx] !== 0 && board[my][mx] !== piece &&
        board[ny][nx] === 0) {
      moves.push({ x: nx, y: ny, captures: [{x: mx, y: my}] });
    }
  });

  return moves;
}

io.on("connection", socket => {
  // Kullanıcı bağlandığında ismini kaydet
  socket.on("setUsername", (data) => {
    socket.username = data.name || 'Misafir';
    socket.userId = data.id || socket.id;
  });

  socket.on("findMatch", (data) => {
    // Kullanıcı adını kaydet
    if (data && data.name) {
      socket.username = data.name;
      socket.userId = data.id || socket.id;
    } else {
      socket.username = 'Misafir';
      socket.userId = socket.id;
    }

    if (queue.length > 0) {
      const opponent = queue.shift();
      const roomId = "ranked_" + Date.now();
      rooms[roomId] = { 
        board: createBoard(), 
        turn: "white", 
        players: [
          { id: socket.id, name: socket.username },
          { id: opponent.id, name: opponent.username || 'Misafir' }
        ]
      };
      
      socket.join(roomId);
      opponent.join(roomId);
      
      // Oyunculara kendi ve rakip bilgilerini gönder
      socket.emit("gameStart", { 
        color: "white", 
        board: rooms[roomId].board, 
        turn: "white",
        playerName: socket.username,
        opponentName: opponent.username || 'Misafir'
      });
      
      opponent.emit("gameStart", { 
        color: "black", 
        board: rooms[roomId].board, 
        turn: "white",
        playerName: opponent.username || 'Misafir',
        opponentName: socket.username
      });
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

  socket.on("joinRoom", code => {
    code = code.trim();
    if (rooms[code] && rooms[code].players.length === 1) {
      rooms[code].players.push(socket.id);
      socket.join(code);
      const data = { board: rooms[code].board, turn: "white" };
      io.to(rooms[code].players[0]).emit("gameStart", { ...data, color: "white" });
      socket.emit("gameStart", { ...data, color: "black" });
    } else {
      socket.emit("errorMsg", "Oda dolu!");
    }
  });

  socket.on("move", ({ from, to }) => {
    const roomId = [...socket.rooms][1];
    if (!rooms[roomId]) return;
    
    const game = rooms[roomId];
    const piece = game.board[from.y][from.x];
    const isWhite = piece === 1 || piece === 2;
    
    if (game.turn !== (isWhite ? "white" : "black")) return;
    
    const moves = getValidMoves(game.board, from.x, from.y, game.turn);
    const validMove = moves.find(m => m.x === to.x && m.y === to.y);
    if (!validMove) return;
    
    // Hareket et
    game.board[to.y][to.x] = piece;
    game.board[from.y][from.x] = 0;
    
    // Rakip taşı sil
    validMove.captures.forEach(c => {
      game.board[c.y][c.x] = 0;
    });
    
    // Kral kontrolü
    if (piece === 1 && to.y === 0) game.board[to.y][to.x] = 2;
    if (piece === 3 && to.y === 7) game.board[to.y][to.x] = 4;
    
    game.turn = game.turn === "white" ? "black" : "white";
    io.to(roomId).emit("boardUpdate", { board: game.board, turn: game.turn });
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

server.listen(process.env.PORT || 10000);
