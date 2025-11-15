// Sunucu Bağımlılıkları: npm install express socket.io
const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const PORT = process.env.PORT || 3000; 
const app = express();
const server = http.createServer(app);

const io = socketio(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const users = {}; 
let rankedQueue = []; 
const games = {}; 

// --- DAMA MANTIĞI FONKSİYONLARI (Aynı Kalır, Stabil) ---
function initializeBoard() { /* ... tahta oluşturma mantığı ... */ }
function generateRoomId() { /* ... rastgele oda kodu oluşturma ... */ }
function getValidMoves(board, r, c, player) { /* ... geçerli hamleleri bulma ... */ }
function getForcedJumps(board, player) { /* ... zorunlu vurmayı bulma ... */ }
function checkWinCondition(board, nextTurn) { /* ... kazanma kontrolü ... */ }
function applyMove(game, from, to) { /* ... hamleyi uygulama ve zincirleme vurma ... */ }
// Bu fonksiyonların tam kodları önceki yanıtta mevcuttur.

// --- SOCKET.IO BAĞLANTILARI ---

function removeFromQueue(socketId) {
    const index = rankedQueue.indexOf(socketId);
    if (index > -1) {
        rankedQueue.splice(index, 1);
        if (users[socketId]) users[socketId].isSearching = false;
        return true;
    }
    return false;
}

function attemptMatchmaking() {
    // Eşleştirme mantığı
    if (rankedQueue.length >= 2) {
        // ... (Oyuncu seçimi ve kontrolü) ...
        const player1Id = rankedQueue.shift(); 
        const player2Id = rankedQueue.shift(); 
        const player1 = users[player1Id];
        const player2 = users[player2Id];
        // ... (Eksik oyuncu kontrolü) ...

        const roomId = generateRoomId();

        games[roomId] = {
            player1Id: player1Id,
            player1Name: player1.username,
            player2Id: player2Id,
            player2Name: player2.username,
            board: initializeBoard(),
            turn: 'player1'
        };
        
        io.sockets.sockets.get(player1Id).join(roomId);
        io.sockets.sockets.get(player2Id).join(roomId);
        
        // ÖNEMLİ: matchFound olayı sadece istemciye rolünü bildirir, gameStart oyunu başlatır.
        io.to(player1Id).emit('matchFound', { roomId: roomId, role: 'player1' });
        io.to(player2Id).emit('matchFound', { roomId: roomId, role: 'player2' });

        io.to(roomId).emit('gameStart', { 
            board: games[roomId].board, 
            turn: games[roomId].turn,
            player1Name: player1.username,
            player2Name: player2.username
        });

        attemptMatchmaking(); 
    }
}

io.on('connection', (socket) => {
    // Kullanıcı Kimliği Tanımlama
    socket.on('playerIdentity', (data) => {
        const { username } = data;
        users[socket.id] = { username: username, isSearching: false };
    });

    // Dereceli Arama
    socket.on('findRankedMatch', () => { /* ... (Mantık aynı kalır) ... */ });
    
    // Dereceli Arama İptali
    socket.on('cancelMatchmaking', () => { /* ... (Mantık aynı kalır) ... */ });

    // Oda Kurma
    socket.on('createGame', (callback) => {
        const user = users[socket.id];
        if (!user) return callback({ success: false, message: 'Kimlik yüklenmedi.' });

        removeFromQueue(socket.id);
        const roomId = generateRoomId();
        
        const game = {
            player1Id: socket.id,
            player1Name: user.username,
            player2Id: null,
            player2Name: null,
            board: initializeBoard(),
            turn: 'player1'
        };
        games[roomId] = game;
        socket.join(roomId);
        
        // Oda kodunu ve rolü geri gönder (İstemci bu kodu gösterecek)
        callback({ success: true, roomId: roomId, role: 'player1' }); 
    });

    // Odaya Katılma
    socket.on('joinGame', (data, callback) => {
        const { roomId } = data;
        const user = users[socket.id];
        const game = games[roomId];

        if (!user || !game || game.player2Id) {
            return callback({ success: false, message: 'Oda bulunamadı veya dolu.' });
        }

        removeFromQueue(socket.id);
        game.player2Id = socket.id;
        game.player2Name = user.username;
        socket.join(roomId);
        callback({ success: true, roomId: roomId, role: 'player2' });

        // İki oyuncu da hazır, oyunu başlat
        io.to(roomId).emit('gameStart', { 
            board: game.board, 
            turn: game.turn,
            player1Name: game.player1Name,
            player2Name: game.player2Name
        });
    });

    // Hamle Yapma
    socket.on('move', (data) => { /* ... (Mantık aynı kalır) ... */ });

    // Bağlantı Kesilmesi
    socket.on('disconnect', () => { /* ... (Mantık aynı kalır) ... */ });
});

server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
