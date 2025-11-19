const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Ana sayfayı göster (opsiyonel ama önerilir)
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html><head><title>Şaşki Online - Sunucu Çalışıyor</title>
    <style>body{background:#000;color:#0ff;font-family:system-ui;text-align:center;padding-top:10%}
    h1{font-size:3rem}</style></head>
    <body>
    <h1>ŞAŞKİ ONLINE SUNUCU ÇALIŞIYOR!</h1>
    <p>Bağlantı başarılı</p>
    </body></html>
  `);
});

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

const queue = [];
const rooms = {};

function createBoard() {
  const b = Array(8).fill().map(() => Array(8).fill(0));
  // Siyah taşlar (üstte)
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 3; j++) {
      if ((i + j) % 2 === 1) b[j][i] = 3;        // normal siyah
    }
  }
  // Beyaz taşlar (altta)
  for (let i = 0; i < 8; i++) {
    for (let j = 5; j < 8; j++) {
      if ((i + j) % 2 === 1) b[j][i] = 1;        // normal beyaz
    }
  }
  return b;
}

function flipBoard(board) {
  const flipped = Array(8).fill().map(() => Array(8).fill(0));
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      flipped[7 - y][7 - x] = board[y][x];
    }
  }
  return flipped;
}

io.on("connection", (socket) => {
  console.log("Yeni oyuncu bağlandı:", socket.id);

  socket.on("findMatch", () => {
    if (queue.length > 0) {
      const opponent = queue.shift();
      const roomId = "ranked_" + Date.now();

      rooms[roomId] = {
        board: createBoard(),
        turn: "white",
        players: [socket.id, opponent.id]
      };

      socket.join(roomId);
      opponent.join(roomId);

      // Beyaz oyuncu (ilk giren) → normal tahta
      socket.emit("gameStart", {
        color: "white",
        board: rooms[roomId].board,
        turn: "white",
        flipped: false
      });

      // Siyah oyuncu → tahta ters çevrilmiş
      opponent.emit("gameStart", {
        color: "black",
        board: flipBoard(rooms[roomId].board),
        turn: "white",
        flipped: true
      });

      console.log("Eşleşme oldu →", roomId);
    } else {
      queue.push(socket);
      socket.emit("searching");
      console.log("Sıraya eklendi:", socket.id);
    }
  });

  socket.on("createRoom", () => {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    rooms[code] = {
      board: createBoard(),
      turn: "white",
      players: [socket.id]
    };
    socket.join(code);
    socket.emit("roomCreated", code);
    console.log("Oda oluşturuldu:", code);
  });

  socket.on("joinRoom", (code) => {
    code = code.trim();
    if (rooms[code] && rooms[code].players.length === 1) {
      rooms[code].players.push(socket.id);
      socket.join(code);

      const boardData = rooms[code].board;

      // Oda sahibi (beyaz)
      io.to(rooms[code].players[0]).emit("gameStart", {
        color: "white",
        board: boardData,
        turn: "white",
        flipped: false
      });

      // Yeni giren (siyah)
      socket.emit("gameStart", {
        color: "black",
        board: flipBoard(boardData),
        turn: "white",
        flipped: true
      });

      console.log("Oyuncu odaya katıldı:", code);
    } else {
      socket.emit("errorMsg", "Oda dolu veya bulunamadı!");
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

    // Sadece 1 kare çapraz + boş kare
    if (dx === 1 && dy === 1 && game.board[to.y][to.x] === 0) {
      game.board[to.y][to.x] = piece;
      game.board[from.y][from.x] = 0;

      // Kral olma
      if (piece === 1 && to.y === 0) game.board[to.y][to.x] = 2;   // beyaz kral
      if (piece === 3 && to.y === 7) game.board[to.y][to.x] = 4;   // siyah kral

      game.turn = game.turn === "white" ? "black" : "white";

      const sendBoard = game.turn === "black" ? flipBoard(game.board) : game.board;
      const sendFlipped = game.turn === "black";

      io.to(roomId).emit("boardUpdate", {
        board: sendBoard,
        turn: game.turn,
        flipped: sendFlipped
      });
    }
  });

  socket.on("cancelMatch", () => {
    const index = queue.indexOf(socket);
    if (index > -1) queue.splice(index, 1);
  });

  socket.on("disconnect", () => {
    console.log("Oyuncu ayrıldı:", socket.id);
    const index = queue.indexOf(socket);
    if (index > -1) queue.splice(index, 1);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`SUNUCU ÇALIŞIYOR → PORT: ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});
