// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { initialGameState, attemptMove } = require('./gameLogic'); // gameLogic.js'i import ediyoruz

const app = express();
const server = http.createServer(app);

// CORS ayarlarını Render'da çalıştırmak için düzenlendi
const io = new Server(server, {
    cors: {
        origin: "*", // Güvenlik için sadece kendi frontend adresinizi yazın.
        methods: ["GET", "POST"]
    }
});

// Render ortamında dinamik port kullanır, yerelde 10000 kullanır
const PORT = process.env.PORT || 10000; 

// Global Durum Yönetimi
const rooms = {}; 
let matchmakingQueue = []; // Dereceli eşleşme bekleyen oyuncular

// --- SOCKET.IO BAĞLANTI İŞLEMLERİ ---
io.on('connection', (socket) => {
    console.log(`Yeni bir oyuncu bağlandı: ${socket.id}`);
    socket.emit('serverMessage', 'Sunucuya başarıyla bağlandınız. Lobiyi yüklüyor...');

    // --- 1. DERECE EŞLEŞME İŞLEMLERİ ---
    socket.on('findMatch', () => {
        // Zaten kuyrukta olup olmadığını kontrol et
        if (matchmakingQueue.includes(socket.id)) return;
        
        // Frontend'e bekleme lobisine geçtiğini bildir
        socket.emit('setLobbyState', 'WAITING'); 
        matchmakingQueue.push(socket.id);

        if (matchmakingQueue.length >= 2) {
            const player1Id = matchmakingQueue.shift();
            const player2Id = matchmakingQueue.shift();
            
            const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
            
            const p1Socket = io.sockets.sockets.get(player1Id);
            const p2Socket = io.sockets.sockets.get(player2Id);

            if (p1Socket && p2Socket) {
                p1Socket.join(roomCode);
                p2Socket.join(roomCode);
                
                rooms[roomCode] = { players: { white: player1Id, black: player2Id }, game: initialGameState(player1Id, player2Id) };

                // Oyunculara eşleşme bulunduğunu ve rollerini bildir
                p1Socket.emit('matchFound', { roomCode, role: 'white' });
                p2Socket.emit('matchFound', { roomCode, role: 'black' });
                
                io.to(roomCode).emit('gameStateUpdate', rooms[roomCode].game);
                console.log(`Eşleşme bulundu. Yeni oda: ${roomCode}`);
            }
        }
    });
    
    // Eşleşme aramasını iptal etme
    socket.on('cancelMatchmaking', () => {
        matchmakingQueue = matchmakingQueue.filter(id => id !== socket.id);
        socket.emit('setLobbyState', 'MAIN_MENU');
        console.log(`Oyuncu ${socket.id} eşleşme aramasını iptal etti.`);
    });

    // --- 2. ÖZEL ODA KURMA ---
    socket.on('createRoom', () => {
        const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        socket.join(roomCode);
        
        rooms[roomCode] = {
            players: { white: socket.id, black: null }, // Kurucu her zaman ilk (beyaz)
            game: null 
        };
        
        // Frontend'e oda kodunu ve beklediğini bildir
        socket.emit('roomCreated', { roomCode, role: 'white' });
        socket.emit('setLobbyState', 'ROOM_HOSTING'); 
        console.log(`Yeni oda kuruldu: ${roomCode} (Kurucu: ${socket.id})`);
    });

    // --- 3. ODAYA BAĞLANMA ---
    socket.on('joinRoom', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (room && !room.players.black) {
            socket.join(roomCode);
            room.players.black = socket.id;
            
            room.game = initialGameState(room.players.white, socket.id);
            
            // Oyunculara oyunun başladığını bildir
            socket.emit('matchFound', { roomCode, role: 'black' }); // Katılan siyah olur
            io.to(room.players.white).emit('matchFound', { roomCode, role: 'white' }); // Kurucu beyaz

            io.to(roomCode).emit('gameStateUpdate', room.game);
            console.log(`Oyuncu ${socket.id} odaya katıldı: ${roomCode}`);
        } else {
            socket.emit('error', 'Oda bulunamadı veya dolu.');
            socket.emit('setLobbyState', 'MAIN_MENU'); // Hata durumunda ana menüye dön
        }
    });

    // ... (makeMove ve disconnect olayları aynı kalır) ...
});

server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
