// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors()); 
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Güvenlik için GitHub Pages URL'nizi buraya yazın
    methods: ["GET", "POST"]
  }
});

let rooms = {}; // Aktif oyun odaları
let matchmakingQueue = []; // Dereceli eşleştirme havuzu

// Türk Daması için 8x8'lik başlangıç dizilimi
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

// 4 Haneli benzersiz oda kodu oluşturur
function createRoomCode() {
    let code = '';
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms[code]); // Bu kod zaten varsa yenisini oluştur
    return code;
}

// Yeni bir oyun odası kuran fonksiyon
function createGameRoom(player1Socket, player2Socket, roomCode) {
    rooms[roomCode] = {
        players: [player1Socket.id, player2Socket.id],
        board: JSON.parse(JSON.stringify(initialBoard)),
        turn: 'w', 
        playerMap: { 'w': player1Socket.id, 'b': player2Socket.id }
    };
    
    // Her iki oyuncuyu da Socket.IO odasına ekle
    player1Socket.join(roomCode);
    player2Socket.join(roomCode);

    // Herkese oyunu başlat sinyali gönder
    io.to(roomCode).emit('gameStart', {
        roomCode: roomCode,
        board: rooms[roomCode].board,
        turn: rooms[roomCode].turn,
        playerMap: rooms[roomCode].playerMap
    });
    console.log(`Oyun başladı: ${roomCode} - Oyuncular: ${player1Socket.id} vs ${player2Socket.id}`);
}


io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı:', socket.id);
    socket.emit('connected'); // İstemciye bağlandığını bildir

    // --- 1. Dereceli Eşleştirme ---
    socket.on('joinRankedQueue', () => {
        if (!matchmakingQueue.includes(socket.id)) {
            matchmakingQueue.push(socket.id);
            console.log(`Kullanıcı havuza eklendi: ${socket.id}. Havuz: ${matchmakingQueue.length}`);
            
            // Havuzda 2 veya daha fazla kişi var mı?
            if (matchmakingQueue.length >= 2) {
                const player1Id = matchmakingQueue.shift(); // İlk oyuncuyu al
                const player2Id = matchmakingQueue.shift(); // İkinci oyuncuyu al
                
                const player1Socket = io.sockets.sockets.get(player1Id);
                const player2Socket = io.sockets.sockets.get(player2Id);

                // İki soket de hala bağlı mı kontrol et
                if (player1Socket && player2Socket) {
                    const roomCode = createRoomCode(); // Onlar için yeni bir oda kur
                    createGameRoom(player1Socket, player2Socket, roomCode);
                } else {
                    // Biri bağlantıdan düşmüşse, diğerini (bağlıysa) havuza geri ekle
                    if (player1Socket) matchmakingQueue.unshift(player1Id);
                    if (player2Socket) matchmakingQueue.unshift(player2Id);
                }
            }
        }
    });

    socket.on('cancelRankedQueue', () => {
        matchmakingQueue = matchmakingQueue.filter(id => id !== socket.id);
        console.log(`Kullanıcı havuzdan ayrıldı: ${socket.id}. Havuz: ${matchmakingQueue.length}`);
    });

    // --- 2. Arkadaşla Oyna (Oda Kur) ---
    socket.on('createFriendlyRoom', () => {
        const roomCode = createRoomCode();
        rooms[roomCode] = {
            players: [socket.id],
            board: JSON.parse(JSON.stringify(initialBoard)),
            turn: 'w',
            playerMap: { 'w': socket.id, 'b': null }
        };
        socket.join(roomCode);
        socket.emit('friendlyRoomCreated', { roomCode: roomCode, playerColor: 'w' });
        console.log(`Arkadaş odası kuruldu: ${roomCode} - Oyuncu 1: ${socket.id}`);
    });

    // --- 3. Odaya Katıl ---
    socket.on('joinRoom', (roomCode) => {
        const room = rooms[roomCode];
        
        if (!room) {
            return socket.emit('errorMsg', 'Oda bulunamadı.');
        }
        if (room.players.length === 1) {
            // Bu oda "arkadaşla oyna" odası ve boş
            room.players.push(socket.id);
            room.playerMap['b'] = socket.id;
            socket.join(roomCode);
            console.log(`Oyuncu 2 bağlandı: ${socket.id} - Oda: ${roomCode}`);
            
            // Oyunu başlat
            io.to(roomCode).emit('gameStart', {
                roomCode: roomCode,
                board: room.board,
                turn: room.turn,
                playerMap: room.playerMap
            });
        } else {
            return socket.emit('errorMsg', 'Oda dolu.');
        }
    });

    // --- Oyun Hamlesi ---
    socket.on('makeMove', (data) => {
        const { roomCode, from, to } = data;
        const room = rooms[roomCode];

        if (!room) return;
        const playerColor = room.playerMap['w'] === socket.id ? 'w' : 'b';
        if (room.turn !== playerColor) {
            return socket.emit('errorMsg', 'Sıra sizde değil.');
        }

        // Sunucu Tarafı Hamle Doğrulaması (ÇOK ÖNEMLİ, ama şimdilik basit)
        // Burada `getValidMoves` mantığının sunucu tarafında da olması gerekir.
        // Hile yapılmasını önlemek için istemciden gelen her hamle doğrulanmalıdır.
        
        const piece = room.board[from.row][from.col];
        room.board[to.row][to.col] = piece;
        room.board[from.row][from.col] = 'e'; 

        // Dama olma kontrolü (Basit)
        if (piece === 'w' && to.row === 0) room.board[to.row][to.col] = 'wk';
        if (piece === 'b' && to.row === 7) room.board[to.row][to.col] = 'bk';

        room.turn = room.turn === 'w' ? 'b' : 'w';

        io.to(roomCode).emit('updateState', {
            board: room.board,
            turn: room.turn
        });
    });

    // --- Bağlantı Kesilmesi ---
    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
        
        // Havuzdaysa havuzdan çıkar
        matchmakingQueue = matchmakingQueue.filter(id => id !== socket.id);

        // Odadaysa odayı kapat
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const playerIndex = room.players.indexOf(socket.id);
            if (playerIndex > -1) {
                // Diğer oyuncuya rakibin ayrıldığını bildir
                socket.to(roomCode).emit('opponentLeft');
                delete rooms[roomCode]; // Odayı sil
                console.log(`Oda ${roomCode} kapatıldı (oyuncu ayrıldı).`);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor...`);
});

