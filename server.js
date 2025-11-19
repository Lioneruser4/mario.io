// server.js (Node.js/Express/Socket.io)

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Render.com genellikle PORT'u ortam değişkeni olarak sağlar
const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);

// Socket.io Sunucusu
// CORS ayarları: Mobil uyumluluk ve farklı alan adlarından bağlantı için önemlidir.
const io = new Server(server, {
    cors: {
        origin: "*", // Tüm alan adlarından bağlantıya izin ver (Güvenlik için üretimde kısıtlanmalıdır!)
        methods: ["GET", "POST"]
    }
});

// Oyun Durumu Yönetimi için basit depolama
const rooms = {}; // { roomCode: { players: [], gameData: {} } }
let matchmakingQueue = [];

io.on('connection', (socket) => {
    console.log('Yeni bir kullanıcı bağlandı:', socket.id);
    
    // Bağlantı Bildirimi (İstemciye başarıyla bağlandığını bildir)
    socket.emit('connection:success', { message: '✅ Sunucuya Başarıyla Bağlanıldı!' });

    // --- Lobi İşlemleri ---
    
    // 🏆 Dereceli Oyna (Eşleştirme)
    socket.on('matchmaking:start', () => {
        console.log(`Oyuncu ${socket.id} eşleşme sırasına girdi.`);
        
        // Zaten sırada değilse ekle
        if (!matchmakingQueue.includes(socket.id)) {
            matchmakingQueue.push(socket.id);
        }

        // 2 oyuncu varsa eşleştir
        if (matchmakingQueue.length >= 2) {
            const player1Id = matchmakingQueue.shift();
            const player2Id = matchmakingQueue.shift();
            
            // Oda Kodu oluştur
            const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
            
            // Odaları kur
            const player1Socket = io.sockets.sockets.get(player1Id);
            const player2Socket = io.sockets.sockets.get(player2Id);
            
            if (player1Socket && player2Socket) {
                player1Socket.join(roomCode);
                player2Socket.join(roomCode);

                rooms[roomCode] = {
                    players: [player1Id, player2Id],
                    // Buraya domino oyun mantığı (taşlar, sıra, skor) eklenecek
                    gameData: { turn: player1Id, status: 'playing' } 
                };
                
                // İstemcilere oyunu başlattığını bildir
                io.to(roomCode).emit('matchmaking:found', { roomCode, players: rooms[roomCode].players });
                console.log(`Eşleşme bulundu. Oda: ${roomCode}`);
            }
        } else {
            // Sırada beklediğini bildir
            socket.emit('matchmaking:waiting', { message: 'Eşleşme aranıyor...' });
        }
    });

    // 🤝 Arkadaşla Oyna (Oda Kurma)
    socket.on('create:room', () => {
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        socket.join(roomCode);

        rooms[roomCode] = {
            players: [socket.id],
            gameData: { status: 'waiting' }
        };

        socket.emit('room:created', { roomCode, playerId: socket.id });
        console.log(`Oda kuruldu: ${roomCode} - Kurucu: ${socket.id}`);
    });

    // 🔑 Koda Bağlan (Odaya Katılma)
    socket.on('join:room', (data) => {
        const { roomCode } = data;
        const room = rooms[roomCode];

        if (room && room.players.length < 4) { // Max 4 oyuncu
            socket.join(roomCode);
            room.players.push(socket.id);
            
            socket.emit('player:joined', { roomCode, message: 'Odaya katıldınız.' });
            // Odadaki herkese yeni oyuncunun katıldığını bildir
            io.to(roomCode).emit('room:update', { players: room.players });

            if (room.players.length === 2) { // 2 oyuncu ile hemen başlatılabilir
                // Gerçek Domino oyun başlatma mantığı buraya eklenecek
                room.gameData.status = 'playing';
                io.to(roomCode).emit('game:start', { message: 'Oyun Başlıyor!' });
            }
        } else {
            socket.emit('join:error', { message: 'Oda bulunamadı veya dolu.' });
        }
    });

    // --- Oyun İçi İşlemler (Temel Yer Tutucular) ---
    socket.on('game:play', (data) => {
        // Hamle mantığı ve doğrulama buraya gelecek
        // Eğer geçerliyse, oyun durumunu güncelle ve tüm odaya yayınla
        // io.to(data.roomCode).emit('game:update', updatedGameData);
    });

    // --- Bağlantı Kesilmesi ---
    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);

        // Eşleşme kuyruğundan çıkar
        matchmakingQueue = matchmakingQueue.filter(id => id !== socket.id);

        // Odalardan çıkar ve odayı temizle
        for (const code in rooms) {
            const index = rooms[code].players.indexOf(socket.id);
            if (index > -1) {
                rooms[code].players.splice(index, 1);
                
                // Odadaki diğer oyunculara bilgi ver
                io.to(code).emit('player:left', { playerId: socket.id, message: 'Bir oyuncu oyundan ayrıldı.' });
                
                // Eğer oda boşalırsa sil
                if (rooms[code].players.length === 0) {
                    delete rooms[code];
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
