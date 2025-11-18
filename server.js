// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { GameState, initialGameState, calculateValidMoves, attemptMove } = require('./gameLogic'); // gameLogic.js'i import ediyoruz

const app = express();
const server = http.createServer(app);

// CORS ayarlarını Render'da çalıştırmak için düzenledik
const io = new Server(server, {
    cors: {
        origin: "*", // Güvenlik için sadece kendi frontend adresinizi yazın.
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Global Durum Yönetimi
const rooms = {}; // Oda kodlarına göre oyun durumlarını ve oyuncu bilgilerini tutar
let matchmakingQueue = []; // Dereceli eşleşme bekleyen oyuncular

// --- SOCKET.IO BAĞLANTI İŞLEMLERİ ---
io.on('connection', (socket) => {
    console.log(`Yeni bir oyuncu bağlandı: ${socket.id}`);

    // Sunucuya bağlanma bildirimi
    socket.emit('serverMessage', 'Sunucuya başarıyla bağlandınız. Lobi hazır!');

    // 1. DERECE EŞLEŞME (Matchmaking)
    socket.on('findMatch', () => {
        console.log(`Oyuncu ${socket.id} eşleşme aramaya başladı.`);
        matchmakingQueue.push(socket.id);

        if (matchmakingQueue.length >= 2) {
            const player1Id = matchmakingQueue.shift();
            const player2Id = matchmakingQueue.shift();
            
            const roomCode = Math.floor(1000 + Math.random() * 9000).toString(); // 4 haneli kod
            
            // Odaları kur
            const player1Socket = io.sockets.sockets.get(player1Id);
            const player2Socket = io.sockets.sockets.get(player2Id);

            if (player1Socket && player2Socket) {
                player1Socket.join(roomCode);
                player2Socket.join(roomCode);
                
                // Oyunu başlat ve durumu kaydet
                rooms[roomCode] = {
                    players: { white: player1Id, black: player2Id },
                    game: initialGameState(player1Id, player2Id)
                };

                // Oyunculara eşleşme bulunduğunu bildir ve odaya yönlendir
                player1Socket.emit('matchFound', roomCode);
                player2Socket.emit('matchFound', roomCode);
                
                // Oyun başlangıç durumunu gönder
                io.to(roomCode).emit('gameStateUpdate', rooms[roomCode].game);
                console.log(`Eşleşme bulundu. Yeni oda: ${roomCode}`);
            }
        }
    });

    // 2. ÖZEL ODA KURMA
    socket.on('createRoom', () => {
        const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        socket.join(roomCode);
        
        rooms[roomCode] = {
            players: { white: socket.id, black: null }, // Siyah oyuncu bekleniyor
            game: null 
        };

        socket.emit('roomCreated', roomCode);
        console.log(`Yeni oda kuruldu: ${roomCode} (Kurucu: ${socket.id})`);
    });

    // 3. ODAYA BAĞLANMA
    socket.on('joinRoom', ({ roomCode }) => {
        if (rooms[roomCode] && !rooms[roomCode].players.black) {
            socket.join(roomCode);
            rooms[roomCode].players.black = socket.id;
            
            // Oyunu başlat ve durumu kaydet
            rooms[roomCode].game = initialGameState(rooms[roomCode].players.white, socket.id);
            
            // Odanın tüm oyuncularına oyunun başladığını bildir
            io.to(roomCode).emit('roomJoined', roomCode); 
            io.to(roomCode).emit('gameStateUpdate', rooms[roomCode].game);
            console.log(`Oyuncu ${socket.id} odaya katıldı: ${roomCode}`);
        } else {
            socket.emit('error', 'Oda bulunamadı veya dolu.');
        }
    });

    // OYUN HAMLE İŞLEMLERİ
    socket.on('makeMove', ({ roomCode, move }) => {
        const room = rooms[roomCode];
        if (!room || !room.game) return;

        const playerRole = room.players.white === socket.id ? 'white' : room.players.black === socket.id ? 'black' : null;

        if (playerRole && playerRole === room.game.currentPlayer) {
            
            const newGameState = attemptMove(room.game, move, playerRole);

            if (newGameState) {
                // Hamle geçerliyse oyun durumunu güncelle
                rooms[roomCode].game = newGameState;

                // Oyun durumunu odadaki her iki oyuncuya da yayınla
                io.to(roomCode).emit('gameStateUpdate', rooms[roomCode].game);

                if (newGameState.gameOver) {
                    io.to(roomCode).emit('gameOver', newGameState.winner);
                }
            } else {
                // Geçersiz hamle bildirimi
                socket.emit('error', 'Geçersiz hamle.');
            }
        }
    });

    // BAĞLANTI KESİLİNCE
    socket.on('disconnect', () => {
        console.log(`Oyuncu bağlantısı kesildi: ${socket.id}`);
        // Matchmaking kuyruğundan çıkar
        matchmakingQueue = matchmakingQueue.filter(id => id !== socket.id);
        
        // Odalardan birini terk ettiyse:
        for (const code in rooms) {
            if (rooms[code].players.white === socket.id || rooms[code].players.black === socket.id) {
                // Diğer oyuncuya rakibin ayrıldığını bildir
                const opponentId = rooms[code].players.white === socket.id ? rooms[code].players.black : rooms[code].players.white;
                if(opponentId) {
                    io.to(opponentId).emit('opponentDisconnected', 'Rakip oyundan ayrıldı. Oyun sonlandırıldı.');
                }
                delete rooms[code];
                console.log(`Oda ${code} temizlendi.`);
                break;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
