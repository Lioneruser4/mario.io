const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new socketIo.Server(server, {
    cors: {
        origin: '*',
    }
});

let queue = [];
let games = {};

io.on('connection', (socket) => {
    console.log('Yeni bağlantı:', socket.id);

    socket.on('joinQueue', () => {
        queue.push(socket.id);
        if (queue.length >= 2) {
            const player1 = queue.shift();
            const player2 = queue.shift();
            const gameId = uuidv4();
            games[gameId] = {
                players: [player1, player2],
                board: initializeBoard(),
                currentPlayer: 'red'
            };
            io.to(player1).emit('gameStart', { gameId, color: 'red' });
            io.to(player2).emit('gameStart', { gameId, color: 'black' });
        }
    });

    socket.on('move', (data) => {
        if (games[data.gameId]) {
            games[data.gameId].board = data.board;
            games[data.gameId].currentPlayer = data.currentPlayer;
            const players = games[data.gameId].players;
            players.forEach(player => {
                io.to(player).emit('updateState', {
                    board: data.board,
                    currentPlayer: data.currentPlayer
                });
            });
        }
    });

    socket.on('endGame', (gameId) => {
        if (games[gameId]) {
            delete games[gameId];
        }
    });

    socket.on('disconnect', () => {
        queue = queue.filter(id => id !== socket.id);
        // Oyunlardan kaldır vb.
    });
});

function initializeBoard() {
    let board = Array.from({length: 8}, () => Array(8).fill(null));
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 8; col++) {
            if ((row + col) % 2 !== 0) {
                board[row][col] = { color: 'black', king: false };
            }
        }
    }
    for (let row = 5; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if ((row + col) % 2 !== 0) {
                board[row][col] = { color: 'red', king: false };
            }
        }
    }
    return board;
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor`));
