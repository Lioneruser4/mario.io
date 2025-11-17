// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors()); // CORS hatalarını önlemek için
const server = http.createServer(app);

// Socket.IO sunucusunu, GitHub Pages'den gelen isteklere izin verecek şekilde ayarlayın
const io = new Server(server, {
  cors: {
    origin: "*", // GitHub Pages URL'nizi buraya yazmanız daha güvenli olur (örn: "https://kullaniciadiniz.github.io")
    methods: ["GET", "POST"]
  }
});

let rooms = {}; // Tüm oyun odalarının durumunu tutar

// Türk Daması için 8x8'lik başlangıç dizilimi
// 'w': beyaz taş, 'b': siyah taş, 'wk': beyaz dama, 'bk': siyah dama, 'e': boş
const initialBoard = [
    ['e', 'e', 'e', 'e', 'e', 'e', 'e', 'e'],
    ['b', 'b', 'b', 'b', 'b', 'b', 'b', 'b'],
    ['b', 'b', 'b', 'b', 'b', 'b', 'b', 'b'],
    ['e', 'e', 'e', 'e', 'e', 'e', 'e', 'e'],
    ['e', 'e', 'e', 'e', 'e', 'e', 'e', 'e'],
    ['w', 'w', 'w', 'w', 'w', 'w', 'w', 'w'],
    ['w', 'w', 'w', 'w', 'w', 'w', 'w', 'w'],
    ['e', 'e', 'e', 'e', 'e', 'e', 'e', 'e']
];


io.on('connection', (socket) => {
  console.log('Bir kullanıcı bağlandı:', socket.id);

  // Lobi Kurma
  socket.on('createRoom', () => {
    const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomCode] = {
      players: [socket.id],
      board: JSON.parse(JSON.stringify(initialBoard)), // Tahtanın derin kopyası
      turn: 'w', // İlk hamle beyazda
      playerMap: { 'w': socket.id, 'b': null }
    };
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode: roomCode, playerColor: 'w' });
    console.log(`Oda kuruldu: ${roomCode} - Oyuncu 1: ${socket.id}`);
  });

  // Odaya Bağlanma
  socket.on('joinRoom', (roomCode) => {
    const room = rooms[roomCode];
    if (room && room.players.length === 1) {
      room.players.push(socket.id);
      room.playerMap['b'] = socket.id;
      socket.join(roomCode);
      console.log(`Oyuncu 2 bağlandı: ${socket.id} - Oda: ${roomCode}`);

      // Her iki oyuncuya da oyunu başlat sinyali gönder
      io.to(roomCode).emit('gameStart', {
        roomCode: roomCode,
        board: room.board,
        turn: room.turn,
        playerMap: room.playerMap
      });
    } else {
      socket.emit('errorMsg', 'Oda dolu veya bulunamadı.');
    }
  });

  // Oyuncu Hamlesi Aldığında
  socket.on('makeMove', (data) => {
    const { roomCode, from, to } = data;
    const room = rooms[roomCode];

    if (!room) return;

    // Sıra kontrolü (Basit - Sadece doğru oyuncu mu diye bakar)
    const playerColor = room.playerMap['w'] === socket.id ? 'w' : 'b';
    if (room.turn !== playerColor) {
      return socket.emit('errorMsg', 'Sıra sizde değil.');
    }

    // --- BURADA KOMPLEKS OYUN MANTIĞI OLMALI ---
    // 1. Hamle geçerli mi? (getValidMoves ile sunucu tarafında da kontrol edilmeli)
    // 2. Taş yeme var mı?
    // 3. Dama (King) oldu mu?
    // 4. Oyun bitti mi?
    
    // (Basitleştirilmiş hamle)
    const piece = room.board[from.row][from.col];
    room.board[to.row][to.col] = piece;
    room.board[from.row][from.col] = 'e'; // Eski yeri boşalt

    // Dama olma kontrolü (Basit)
    if (piece === 'w' && to.row === 0) room.board[to.row][to.col] = 'wk';
    if (piece === 'b' && to.row === 7) room.board[to.row][to.col] = 'bk';

    // Sırayı değiştir
    room.turn = room.turn === 'w' ? 'b' : 'w';

    // Yeni oyun durumunu odadaki herkese gönder
    io.to(roomCode).emit('updateState', {
      board: room.board,
      turn: room.turn
    });
  });

  // Bağlantı kesildiğinde
  socket.on('disconnect', () => {
    console.log('Kullanıcı ayrıldı:', socket.id);
    // Odaları tara ve oyuncuyu çıkar
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      const playerIndex = room.players.indexOf(socket.id);
      if (playerIndex > -1) {
        // Diğer oyuncuya rakibin ayrıldığını bildir
        io.to(roomCode).emit('opponentLeft');
        delete rooms[roomCode]; // Odayı sil
        console.log(`Oda ${roomCode} kapatıldı.`);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor...`);
});

