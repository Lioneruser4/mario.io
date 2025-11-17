const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.static('public')); // Eğer static dosyalar varsa
const server = http.createServer(app);
const io = socketIo(server, { 
    cors: { origin: '*' },
    pingTimeout: 60000,
    pingInterval: 25000
});

let queue = [];
let games = {};

io.on('connection', socket => {
    console.log('Yeni bağlantı:', socket.id);

    socket.on('joinQueue', username => {
        queue.push({ id: socket.id, username });
        io.to(socket.id).emit('statusUpdate', 'Sıradasın...');
        if (queue.length >= 2) {
            const p1 = queue.shift(), p2 = queue.shift();
            const gameId = uuidv4();
            games[gameId] = { 
                players: [p1.id, p2.id], 
                usernames: { [p1.id]: p1.username, [p2.id]: p2.username },
                board: initBoard(), 
                currentPlayer: 'red',
                scores: { red: 0, black: 0 }
            };
            io.to(p1.id).emit('gameStart', { gameId, color: 'red', username: p1.username });
            io.to(p2.id).emit('gameStart', { gameId, color: 'black', username: p2.username });
            console.log(`Oyun başladı: ${gameId}`);
        }
    });

    socket.on('move', data => {
        if (games[data.gameId]) {
            games[data.gameId].board = data.board;
            games[data.gameId].currentPlayer = data.currentPlayer;
            if (data.scores) {
                games[data.gameId].scores.red = data.scores.your || games[data.gameId].scores.red; // Basit skor, geliştirilebilir
                games[data.gameId].scores.black = data.scores.opponent || games[data.gameId].scores.black;
            }
            const game = games[data.gameId];
            game.players.forEach(p => {
                const color = p === game.players[0] ? 'red' : 'black';
                const scores = color === 'red' ? { your: game.scores.red, opponent: game.scores.black } : { your: game.scores.black, opponent: game.scores.red };
                io.to(p).emit('updateState', { board: data.board, currentPlayer: data.currentPlayer, scores });
            });
        }
    });

    socket.on('endGame', id => {
        if (games[id]) {
            games[id].players.forEach(p => io.to(p).emit('gameEnded'));
            delete games[id];
        }
    });

    socket.on('disconnect', () => {
        console.log('Bağlantı koptu:', socket.id);
        queue = queue.filter(q => q.id !== socket.id);
        for (const id in games) {
            const game = games[id];
            if (game.players.includes(socket.id)) {
                const opponent = game.players.find(p => p !== socket.id);
                if (opponent) io.to(opponent).emit('opponentDisconnected');
                delete games[id];
            }
        }
    });
});

function initBoard() {
    const b = Array.from({length:8},()=>Array(8).fill(null));
    for(let r=0;r<3;r++)for(let c=0;c<8;c++)if((r+c)%2===1)b[r][c]={color:'black',king:false};
    for(let r=5;r<8;r++)for(let c=0;c<8;c++)if((r+c)%2===1)b[r][c]={color:'red',king:false};
    return b;
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor: https://mario-io-1.onrender.com`));
