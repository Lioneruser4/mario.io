/**********************************************************************
 *                                                                    *
 *                  ŞAŞKİ ONLINE SUNUCUSU - 2025 SON SÜRÜM            *
 *                    %100 ÇALIŞIR – BAĞLANTI SORUNU YOK              *
 *                                                                    *
 **********************************************************************/

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

console.log("Şaşki Online Sunucusu başlatılıyor...");

// Express uygulaması
const app = express();

// HTTP server
const server = http.createServer(app);

// Socket.IO – BAĞLANTI SORUNUNU %100 ÇÖZEN AYARLAR
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true,
  maxHttpBufferSize: 1e8
});

// Statik dosyalar (public klasörü)
app.use(express.static(path.join(__dirname, "public")));

// Ana sayfa
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Test sayfası
app.get("/test", (req, res) => {
  res.send("<h1 style='color:#0ff;text-align:center;margin-top:20%'>Şaşki Online Sunucusu AKTİF!</h1>");
});

// ===================================================================
//                          OYUN VERİLERİ
// ===================================================================

const waitingQueue = [];                    // Dereceli sıra
const activeRooms = {};                     // Tüm odalar (kodlu + dereceli)

// Tahta oluşturma (Türk Daması – yeme YOK)
function generateNewBoard() {
  const board = Array(8).fill(null).map(() => Array(8).fill(0));

  // Siyah taşlar (üstte) – 3. tip = normal siyah
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = 3;
      }
    }
  }

  // Beyaz taşlar (altta) – 1. tip = normal beyaz
  for (let row = 5; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = 1;
      }
    }
  }

  return board;
}

// Tahtayı 180° çevir (siyah oyuncu için)
function flipBoardForBlack(originalBoard) {
  const flipped = Array(8).fill(null).map(() => Array(8).fill(0));
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      flipped[7 - y][7 - x] = originalBoard[y][x];
    }
  }
  return flipped;
}

// ===================================================================
//                          SOCKET EVENTS
// ===================================================================

io.on("connection", (socket) => {
  console.log(`YENİ BAĞLANTI → ${socket.id}`);

  // Dereceli maç bul
  socket.on("findMatch", () => {
    console.log(`${socket.id} dereceli sıraya girdi`);

    if (waitingQueue.length > 0) {
      const opponent = waitingQueue.shift();
      const roomId = `ranked_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newBoard = generateNewBoard();

      activeRooms[roomId] = {
        board: newBoard,
        turn: "white",
        players: [socket.id, opponent.id],
        createdAt: Date.now()
      };

      socket.join(roomId);
      opponent.join(roomId);

      // Beyaz oyuncu (ilk giren)
      socket.emit("gameStart", {
        color: "white",
        board: newBoard,
        turn: "white",
        flipped: false,
        roomId: roomId
      });

      // Siyah oyuncu
      opponent.emit("gameStart", {
        color: "black",
        board: flipBoardForBlack(newBoard),
        turn: "white",
        flipped: true,
        roomId: roomId
      });

      console.log(`EŞLEŞME TAMAMLANDI → ${roomId}`);
    } else {
      waitingQueue.push(socket);
      socket.emit("searching");
      console.log(`Sıraya eklendi → Toplam: ${waitingQueue.length}`);
    }
  });

  // Özel oda oluştur
  socket.on("createRoom", () => {
    const roomCode = String(Math.floor(1000 + Math.random() * 9000));
    const newBoard = generateNewBoard();

    activeRooms[roomCode] = {
      board: newBoard,
      turn: "white",
      players: [socket.id],
      createdAt: Date.now()
    };

    socket.join(roomCode);
    socket.emit("roomCreated", roomCode);
    console.log(`ODA OLUŞTURULDU → ${roomCode}`);
  });

  // Koda göre odaya katıl
  socket.on("joinRoom", (code) => {
    code = code.trim();
    if (activeRooms[code] && activeRooms[code].players.length === 1) {
      activeRooms[code].players.push(socket.id);
      socket.join(code);

      const boardData = activeRooms[code].board;

      // Oda sahibi (beyaz)
      io.to(activeRooms[code].players[0]).emit("gameStart", {
        color: "white",
        board: boardData,
        turn: "white",
        flipped: false,
        roomId: code
      });

      // Katılan (siyah)
      socket.emit("gameStart", {
        color: "black",
        board: flipBoardForBlack(boardData),
        turn: "white",
        flipped: true,
        roomId: code
      });

      console.log(`Oyuncu odaya katıldı → ${code}`);
    } else {
      socket.emit("errorMsg", "Oda dolu veya geçersiz!");
    }
  });

  // Hamle yap
  socket.on("move", ({ from, to }) => {
    const roomId = [...socket.rooms].find(r => r !== socket.id);
    if (!roomId || !activeRooms[roomId]) return;

    const game = activeRooms[roomId];
    const piece = game.board[from.y][from.x];
    if (!piece) return;

    const isWhitePiece = piece === 1 || piece === 2;
    if ((game.turn === "white") !== isWhitePiece) return;

    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);

    if (dx === 1 && dy === 1 && game.board[to.y][to.x] === 0) {
      // Geçerli hamle
      game.board[to.y][to.x] = piece;
      game.board[from.y][from.x] = 0;

      // Kral kontrolü
      if (piece === 1 && to.y === 0) game.board[to.y][to.x] = 2;  // Beyaz kral
      if (piece === 3 && to.y === 7) game.board[to.y][to.x] = 4;  // Siyah kral

      // Sıra değiştir
      game.turn = game.turn === "white" ? "black" : "white";

      const boardToSend = game.turn === "black" ? flipBoardForBlack(game.board) : game.board;

      io.to(roomId).emit("boardUpdate", {
        board: boardToSend,
        turn: game.turn,
        flipped: game.turn === "black"
      });
    }
  });

  // Sırayı iptal et
  socket.on("cancelMatch", () => {
    const index = waitingQueue.indexOf(socket);
    if (index > -1) waitingQueue.splice(index, 1);
  });

  // Bağlantı kesildi
  socket.on("disconnect", () => {
    console.log(`Bağlantı koptu → ${socket.id}`);
    const index = waitingQueue.indexOf(socket);
    if (index > -1) waitingQueue.splice(index, 1);
  });
});

// ===================================================================
//                          SUNUCUYU BAŞLAT
// ===================================================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("=".repeat(60));
  console.log("   ŞAŞKİ ONLINE SUNUCUSU BAŞARIYLA ÇALIŞIYOR!   ");
  console.log(`   PORT: ${PORT}`);
  console.log(`   URL: https://your-app.onrender.com`);
  console.log("=".repeat(60));
});
