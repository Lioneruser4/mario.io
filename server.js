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

// Eşleşme arayan oyuncular için zaman aşımı kontrolü
const MATCHMAKING_TIMEOUT = 30000; // 30 saniye

io.on("connection", socket => {
  // Varsayılan kullanıcı bilgileri
  socket.username = 'Misafir';
  socket.userId = socket.id;
  socket.matchmakingTimer = null;
  socket.roomId = null; // Oda ID'sini takip etmek için

  // Kullanıcı bağlandığında ismini ve kaynağını kaydet
  socket.on("setUsername", (data) => {
    if (data) {
      socket.username = data.name || 'Misafir';
      socket.userId = data.id || socket.id;
      socket.isTelegram = data.isTelegram || false;
      console.log(`Kullanıcı güncellendi: ${socket.username} (${socket.userId}), Kaynak: ${socket.isTelegram ? 'Telegram' : 'Web'}`);
    }
  });

  // Eşleşme aramayı iptal et
  function cancelMatchmaking() {
    const index = queue.indexOf(socket);
    if (index > -1) {
      queue.splice(index, 1);
      console.log(`Eşleşme iptal edildi: ${socket.username}`);
    }
    if (socket.matchmakingTimer) {
      clearTimeout(socket.matchmakingTimer);
      socket.matchmakingTimer = null;
    }
  }

  socket.on("findMatch", (data) => {
    // Eğer zaten eşleşme arıyorsa işlem yapma
    if (queue.includes(socket)) {
      console.log('Zaten eşleşme aranıyor:', socket.username);
      return;
    }

    // Kullanıcı adını güncelle
    if (data && data.name) {
      socket.username = data.name;
      socket.userId = data.id || socket.id;
    }

    console.log(`Eşleşme aranıyor: ${socket.username} (${socket.userId})`);
    
    // Eşleşme zaman aşımını ayarla
    socket.matchmakingTimer = setTimeout(() => {
      cancelMatchmaking();
      socket.emit('matchmakingTimeout');
      console.log(`Eşleşme zaman aşımı: ${socket.username}`);
    }, MATCHMAKING_TIMEOUT);

    // Eşleşme kontrolü
    if (queue.length > 0) {
      const opponent = queue.shift();
      
      // Rakibin zamanlayıcısını temizle
      if (opponent.matchmakingTimer) {
        clearTimeout(opponent.matchmakingTimer);
        opponent.matchmakingTimer = null;
      }

      const roomId = "ranked_" + Date.now();
      const player1 = { id: socket.id, name: socket.username, isTelegram: socket.isTelegram || false };
      const player2 = { id: opponent.id, name: opponent.username || 'Misafir', isTelegram: opponent.isTelegram || false };
      
      rooms[roomId] = { 
        board: createBoard(), 
        turn: "white", 
        players: [player1, player2],
        createdAt: Date.now()
      };
      
      // Oda bilgisini socket'lere kaydet
      socket.roomId = roomId;
      opponent.roomId = roomId;
      
      console.log(`Oda oluşturuldu: ${roomId}, Oyuncular: ${player1.name} (${player1.isTelegram ? 'Telegram' : 'Misafir'}) vs ${player2.name} (${player2.isTelegram ? 'Telegram' : 'Misafir'})`);
      
      socket.join(roomId);
      opponent.join(roomId);
      
      // Oyunculara oyun başlangıç bilgilerini gönder
      const gameData = {
        roomId: roomId,
        board: rooms[roomId].board,
        turn: "white"
      };
      
      socket.emit("gameStart", { 
        ...gameData,
        color: "white",
        playerName: player1.name,
        opponentName: player2.name
      });
      
      opponent.emit("gameStart", { 
        ...gameData,
        color: "black",
        playerName: player2.name,
        opponentName: player1.name
      });
    } else {
      // Eşleşme bulunamadı, kuyruğa ekle
      queue.push(socket);
      socket.emit("searching");
      console.log(`Eşleşme bekleniyor: ${socket.username}`);
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
    // Kuyruktan çıkar
    const queueIndex = queue.indexOf(socket);
    if (queueIndex > -1) queue.splice(queueIndex, 1);
    
    // Eğer bir odadaysa, diğer oyuncuyu bilgilendir
    if (socket.roomId && rooms[socket.roomId]) {
      const room = rooms[socket.roomId];
      const opponent = room.players.find(p => p.id !== socket.id);
      
      if (opponent) {
        // Diğer oyuncuya oyuncunun ayrıldığını bildir
        io.to(opponent.id).emit('opponentDisconnected');
      }
      
      // Odayı temizle
      delete rooms[socket.roomId];
    }
    
    console.log(`Kullanıcı ayrıldı: ${socket.username || 'Misafir'} (${socket.userId})`);
  });
});

server.listen(process.env.PORT || 10000);
