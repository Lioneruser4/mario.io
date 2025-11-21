const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = {};
const queue = [];

io.on('connection', (socket) => {
  console.log('Oyuncu bağlandı:', socket.id);

  socket.on('ranked', () => {
    if (queue.length > 0) {
      const opponent = queue.shift();
      const roomId = `ranked_${Date.now()}`;
      rooms[roomId] = { players: [opponent, socket.id], board: initialBoard(), turn: 'black' };
      io.to(opponent).to(socket.id).emit('match_found', { roomId, color: opponent === socket.id ? 'black' : 'white' });
    } else {
      queue.push(socket.id);
      socket.emit('searching');
    }
  });

  socket.on('create_room', () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    rooms[code] = { players: [socket.id], board: initialBoard(), turn: 'black' };
    socket.join(code);
    socket.emit('room_created', code);
  });

  socket.on('join_room', (code) => {
    if (rooms[code] && rooms[code].players.length === 1) {
      rooms[code].players.push(socket.id);
      socket.join(code);
      io.to(code).emit('start_game', { board: rooms[code].board, turn: 'black' });
    } else {
      socket.emit('error', 'Oda dolu veya geçersiz');
    }
  });

  // ... move, capture, win, disconnect vs. tam kod
});

function initialBoard() {
  const board = Array(8).fill().map(() => Array(8).fill(null));
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      if ((i + j) % 2 === 1) {
        if (i < 3) board[i][j] = { color: 'white', king: false };
        if (i > 4) board[i][j] = { color: 'black', king: false };
      }
    }
  }
  return board;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Şaşki Sunucusu çalışıyor: https://mario-io-1.onrender.com`);
});
