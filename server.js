const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);

// !!!!!!!!! ÇÖZÜM: CORS Ayarı, TÜM ADRESLERE İZİN VERİR (*) !!!!!!!!!
// !! Güvenlik için daha sonra burayı kendi GitHub Pages adresinizle değiştirmelisiniz. !!
const io = new Server(server, {
  cors: {
    origin: "*", // HERKESE İZİN VERİLDİ
    methods: ["GET", "POST"]
  }
});

let games = {}; 
let socketToRoom = {}; 

function cleanupRoom(roomId) {
  if (games[roomId]) {
    delete games[roomId];
  }
  for (const socketId in socketToRoom) {
    if (socketToRoom[socketId] === roomId) {
      delete socketToRoom[socketId];
    }
  }
}

io.on('connection', (socket) => {
  console.log('Bir kullanıcı bağlandı:', socket.id);

  socket.on('createRoom', () => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase(); 
    socket.join(roomId);
    socketToRoom[socket.id] = roomId;
    
    games[roomId] = {
      chess: new Chess(), 
      players: { 'w': socket.id, 'b': null },
      turn: 'w'
    };
    
    socket.emit('roomCreated', { roomId: roomId, color: 'w' });
    console.log(`Oda kuruldu: ${roomId}`);
  });

  socket.on('joinRoom', (roomId) => {
    roomId = roomId.toUpperCase();
    const room = io.sockets.adapter.rooms.get(roomId);
    let game = games[roomId];

    if (!room || !game || game.players['b']) {
      return socket.emit('error', 'Oda bulunamadı veya dolu.');
    }
    
    socket.join(roomId);
    socketToRoom[socket.id] = roomId;
    game.players['b'] = socket.id;
    
    io.to(roomId).emit('gameStart', {
      game: game,
      startFEN: game.chess.fen()
    });
  });

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
          let reason = game.chess.isCheckmate() ? 'Şah Mat!' : game.chess.isStalemate() ? 'Pat!' : 'Oyun bitti.';
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

  socket.on('leaveRoom', (roomId) => {
    roomId = roomId.toUpperCase();
    socket.leave(roomId);
    if (games[roomId] && games[roomId].players['w'] === socket.id && games[roomId].players['b'] === null) {
      cleanupRoom(roomId);
    }
    delete socketToRoom[socket.id];
  });

  socket.on('disconnect', () => {
    const roomId = socketToRoom[socket.id];
    
    if (roomId && games[roomId]) {
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
