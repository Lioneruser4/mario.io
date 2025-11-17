const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.static('public'));
const server = http.createServer(app);
const io = socketIo(server, { 
    cors: { origin: '*' },
    pingTimeout: 60000,
    pingInterval: 25000
});

let queue = [];
let games = {};
let rooms = {}; // Private rooms: { code: { players: [], gameId: null } }

function generateRoomCode() {
    return Math.random().toString(36).substring(2,6).toUpperCase(); // 4 haneli alfanumerik
}

function initBoard() {
    const b = Array.from({length:8},()=>Array(8).fill(null));
    for(let r=0;r<3;r++)for(let c=0;c<8;c++)if((r+c)%2===1)b[r][c]={color:'black',king:false};
    for(let r=5;r<8;r++)for(let c=0;c<8;c++)if((r+c)%2===1)b[r][c]={color:'red',king:false};
    return b;
}

function startGame(player1, player2, isPrivate = false) {
    const gameId = uuidv4();
    const board = initBoard();
    games[gameId] = { 
        players: [player1, player2], 
        usernames: {}, // Sunucuda tut, ama emit'te gönder
        board, 
        currentPlayer: 'red',
        scores: { red: 0, black: 0 }
    };
    io.to(player1).emit('gameStart', { gameId, color: 'red' });
    io.to(player2).emit('gameStart', { gameId, color: 'black' });
    if (isPrivate) rooms[gameId] = { gameId }; // Wait, code ile linkle
    console.log(`Oyun başladı: ${gameId} (private: ${isPrivate})`);
    return gameId;
}

io.on('connection', socket => {
    console.log('Yeni bağlantı:', socket.id);

    socket.on('joinQueue', data => {
        const { username, mode } = data;
        queue.push({ id: socket.id, username, mode: 'ranked' });
        socket.data = { username };
        io.to(socket.id).emit('statusUpdate', 'Sıradasın...');
        io.emit('queueUpdate', { count: queue.length }); // Broadcast count
        if (queue.length >= 2) {
            const p1 = queue.shift(), p2 = queue.shift();
            const gameId = startGame(p1.id, p2.id, false);
            games[gameId].usernames[p1.id] = p1.username;
            games[gameId].usernames[p2.id] = p2.username;
        }
    });

    socket.on('createRoom', username => {
        let code;
        do { code = generateRoomCode(); } while (rooms[code]);
        rooms[code] = { players: [{ id: socket.id, username }], gameId: null };
        socket.data = { username, roomCode: code };
        socket.emit('roomCreated', { code });
        console.log(`Oda oluşturuldu: ${code} by ${username}`);
    });

    socket.on('joinRoom', data => {
        const { username, code } = data;
        if (!rooms[code] || rooms[code].players.length >= 2) {
            socket.emit('error', 'Oda dolu veya mevcut değil!');
            return;
        }
        const room = rooms[code];
        room.players.push({ id: socket.id, username });
        socket.data = { username, roomCode: code };
        socket.emit('roomJoined', { gameId: null }); // Temp
        if (room.players.length === 2) {
            const p1 = room.players[0].id, p2 = room.players[1].id;
            const gameId = startGame(p1, p2, true);
            games[gameId].usernames[p1] = room.players[0].username;
            games[gameId].usernames[p2] = room.players[1].username;
            room.gameId = gameId;
            // Emit to both
            io.to(p1).emit('roomJoined', { gameId });
            io.to(p2).emit('roomJoined', { gameId });
        }
    });

    socket.on('move', data => {
        if (games[data.gameId]) {
            games[data.gameId].board = data.board;
            games[data.gameId].currentPlayer = data.currentPlayer;
            if (data.scores) {
                games[data.gameId].scores.red = data.scores.your || games[data.gameId].scores.red; // Adjust based on color
                games[data.gameId].scores.black = data.scores.opponent || games[data.gameId].scores.black;
            }
            const game = games[data.gameId];
            game.players.forEach(p => {
                const isRed = p === game.players[0];
                const scores = isRed ? { your: game.scores.red, opponent: game.scores.black } : { your: game.scores.black, opponent: game.scores.red };
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
        // Queue'dan çıkar
        queue = queue.filter(q => q.id !== socket.id);
        io.emit('queueUpdate', { count: queue.length });
        // Rooms'dan çıkar
        for (const code in rooms) {
            const room = rooms[code];
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) delete rooms[code];
            else if (room.gameId && games[room.gameId]) {
                // Oyun varsa rakibe bildir
                const opponent = room.players[0]?.id;
                if (opponent) io.to(opponent).emit('opponentDisconnected');
                delete games[room.gameId];
                delete room.gameId;
            }
        }
        // Games'den çıkar
        for (const id in games) {
            if (games[id].players.includes(socket.id)) {
                const opponent = games[id].players.find(p => p !== socket.id);
                if (opponent) io.to(opponent).emit('opponentDisconnected');
                delete games[id];
            }
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor: https://mario-io-1.onrender.com`));
