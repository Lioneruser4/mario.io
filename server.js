// Sunucu Bağımlılıkları: npm install express socket.io
const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const PORT = process.env.PORT || 3000; 
const app = express();
const server = http.createServer(app);

// CORS ayarı her origin'den bağlantıya izin verir.
const io = socketio(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const users = {}; 
let rankedQueue = []; 
const games = {}; 

// --- DAMA MANTIĞI FONKSİYONLARI (Aynı Kalır, Stabil) ---
function initializeBoard() {
    const board = Array(8).fill(0).map(() => Array(8).fill(0));
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 !== 0) board[r][c] = 2; // Beyaz (P2)
        }
    }
    for (let r = 5; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 !== 0) board[r][c] = 1; // Siyah (P1)
        }
    }
    return board;
}
function generateRoomId() {
    let roomId;
    do {
        roomId = Math.floor(1000 + Math.random() * 9000).toString();
    } while (games[roomId]);
    return roomId;
}
function getValidMoves(board, r, c, player) { /* ... (Önceki yanıttaki kod buraya gelir) ... */ return []; }
function getForcedJumps(board, player) { /* ... (Önceki yanıttaki kod buraya gelir) ... */ return []; }
function checkWinCondition(board, nextTurn) { /* ... (Önceki yanıttaki kod buraya gelir) ... */ return null; }
function applyMove(game, from, to) { /* ... (Önceki yanıttaki kod buraya gelir) ... */ return { success: false, message: 'Kural hatası' }; }

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
    // Sadece bağlı ve arayan oyuncuları işleme al
    rankedQueue = rankedQueue.filter(id => io.sockets.sockets.has(id));

    if (rankedQueue.length >= 2) {
        const player1Id = rankedQueue.shift(); 
        const player2Id = rankedQueue.shift(); 
        
        const player1 = users[player1Id];
        const player2 = users[player2Id];

        // Son bir kez null kontrolü
        if (!player1 || !player2) {
             attemptMatchmaking(); 
             return;
        }

        player1.isSearching = false;
        player2.isSearching = false;
        
        const roomId = generateRoomId();

        // OYUN OLUŞTURMA
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

        // İstemcilere bildir ve oyunu başlat
        io.to(player1Id).emit('matchFound', { roomId: roomId, role: 'player1' });
        io.to(player2Id).emit('matchFound', { roomId: roomId, role: 'player2' });

        io.to(roomId).emit('gameStart', { 
            board: games[roomId].board, 
            turn: games[roomId].turn,
            player1Name: player1.username,
            player2Name: player2.username
        });

        // Kuyrukta kalanlar için tekrar dene
        attemptMatchmaking(); 
    }
}

io.on('connection', (socket) => {
    // Kullanıcı Kimliği Tanımlama
    socket.on('playerIdentity', (data) => {
        const { username } = data;
        users[socket.id] = { username: username, isSearching: false };
        // Bağlantı başarılı olduğunda client'a lobi butonlarını aktif etmesi için bir olay gönderelim
        socket.emit('readyToPlay'); 
    });

    // Dereceli Arama
    socket.on('findRankedMatch', () => {
        const user = users[socket.id];
        if (!user) return;
        
        if (user.isSearching || rankedQueue.includes(socket.id)) return;
        
        user.isSearching = true;
        rankedQueue.push(socket.id);
        socket.emit('matchMakingStatus', `Eşleşme aranıyor... Kuyrukta: ${rankedQueue.length} kişi.`);

        attemptMatchmaking(); 
    });

    // Dereceli Arama İptali
    socket.on('cancelMatchmaking', () => {
        const removed = removeFromQueue(socket.id);
        if (removed) {
            socket.emit('matchMakingCancelled', 'Eşleşme araması iptal edildi.');
        } 
        // İptal sonrası kuyruktaki diğerlerini tekrar kontrol etmeye gerek yok, onlar arama yapmaya devam etmeli.
    });

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
    socket.on('move', (data) => {
        const game = games[data.roomId];
        if (!game) return;
        // ... (Kalan mantık önceki yanıttaki gibi devam eder) ...
    });

    // Bağlantı Kesilmesi
    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            removeFromQueue(socket.id);
            for (const roomId in games) {
                if (games[roomId].player1Id === socket.id || games[roomId].player2Id === socket.id) {
                    const opponentId = games[roomId].player1Id === socket.id ? games[roomId].player2Id : games[roomId].player1Id;
                    if (io.sockets.sockets.get(opponentId)) {
                        io.to(opponentId).emit('opponentDisconnected', 'Rakibiniz oyundan ayrıldı, kazandınız!');
                    }
                    delete games[roomId]; 
                    break;
                }
            }
            delete users[socket.id];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
