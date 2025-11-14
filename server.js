const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js'); // Satranç kütüphanesi

const app = express();
const server = http.createServer(app);

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// !! ÖNEMLİ: BURAYI KENDİ GITHUB PAGES ADRESİNİZLE DEĞİŞTİRİN !!
// Örnek: "https://kullaniciadiniz.github.io"
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
const GITHUB_PAGES_URL = "https://SİZİN-ADINIZ.github.io"; 

const io = new Server(server, {
  cors: {
    origin: GITHUB_PAGES_URL, // Sadece sizin sitenize izin ver
    methods: ["GET", "POST"]
  }
});

let games = {}; // Aktif oyunları ve odaları tutacak
let socketToRoom = {}; // Hangi soketin hangi odada olduğunu bulmak için

// Odayı ve oyunu temizle
function cleanupRoom(roomId) {
  if (games[roomId]) {
    delete games[roomId];
    console.log(`Oda ${roomId} temizlendi.`);
  }
  for (const socketId in socketToRoom) {
    if (socketToRoom[socketId] === roomId) {
      delete socketToRoom[socketId];
    }
  }
}

io.on('connection', (socket) => {
  console.log('Bir kullanıcı bağlandı:', socket.id);

  // Lobi Kurma
  socket.on('createRoom', () => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase(); 
    socket.join(roomId);
    socketToRoom[socket.id] = roomId;
    
    games[roomId] = {
      chess: new Chess(), // Yeni satranç oyunu mantığı
      players: { 'w': socket.id, 'b': null },
      turn: 'w'
    };
    
    socket.emit('roomCreated', { roomId: roomId, color: 'w' });
    console.log(`Oda kuruldu: ${roomId} - Kurucu (Beyaz): ${socket.id}`);
  });

  // Odaya Katılma
  socket.on('joinRoom', (roomId) => {
    roomId = roomId.toUpperCase();
    const room = io.sockets.adapter.rooms.get(roomId);
    let game = games[roomId];

    if (!room || !game) {
      return socket.emit('error', 'Oda bulunamadı.');
    }
    if (game.players['b']) {
      return socket.emit('error', 'Oda dolu.');
    }
    
    socket.join(roomId);
    socketToRoom[socket.id] = roomId;
    game.players['b'] = socket.id;
    
    console.log(`Oyuncu ${socket.id} odaya katıldı (Siyah): ${roomId}`);
    
    io.to(roomId).emit('gameStart', {
      game: game,
      startFEN: game.chess.fen()
    });
  });

  // Hamle Yapma (Satranç hamlesi)
  socket.on('makeMove', (data) => {
    const { roomId, move } = data;
    const game = games[roomId];

    if (!game) return;
    if (socket.id !== game.players[game.turn]) {
      return socket.emit('error', 'Sıra sizde değil.');
    }

    try {
      const chessMove = game.chess.move(move);
      if (chessMove) {
        game.turn = game.chess.turn();
        io.to(roomId).emit('moveMade', { 
          move: chessMove, 
          fen: game.chess.fen(),
          turn: game.turn
        });

        if (game.chess.isGameOver()) {
          let reason = 'Oyun bitti.';
          if (game.chess.isCheckmate()) reason = 'Şah Mat!';
          if (game.chess.isStalemate()) reason = 'Pat!';
          
          io.to(roomId).emit('gameOver', reason);
          cleanupRoom(roomId);
        }
      } else {
        socket.emit('error', 'Geçersiz hamle.');
      }
    } catch (e) {
      socket.emit('error', 'Geçersiz hamle formatı.');
    }
  });

  // Odadan Ayrılma (Bekleme ekranında iptal)
  socket.on('leaveRoom', (roomId) => {
    roomId = roomId.toUpperCase();
    socket.leave(roomId);
    if (games[roomId] && games[roomId].players['w'] === socket.id && games[roomId].players['b'] === null) {
      cleanupRoom(roomId);
    }
    delete socketToRoom[socket.id];
  });

  // Bağlantı Kesilmesi
  socket.on('disconnect', () => {
    console.log('Bir kullanıcı ayrıldı:', socket.id);
    const roomId = socketToRoom[socket.id];
    
    if (roomId && games[roomId]) {
      console.log(`Oyuncu ${socket.id}, ${roomId} odasından ayrıldı.`);
      socket.to(roomId).emit('opponentLeft', 'Rakibiniz oyundan ayrıldı.');
      cleanupRoom(roomId);
    }
    delete socketToRoom[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SATRANÇ Sunucusu ${PORT} portunda çalışıyor.`);
});
