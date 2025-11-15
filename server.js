// Sunucunuzun 10000 portunda çalışacağını varsayarak
const PORT = process.env.PORT || 10000;
const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
// CORS (Farklı Kaynak İsteği) ayarı, GitHub Pages'ten gelen isteklere izin vermeli
const io = socketio(server, {
    cors: {
        origin: "*", // GitHub Pages dahil tüm kaynaklardan gelen isteklere izin ver
        methods: ["GET", "POST"]
    }
});

// Oda durumlarını tutacak ana nesne
const games = {}; // Örnek: { 'odaKodu': { player1Id: '...', player2Id: '...', board: [], turn: '...' } }

io.on('connection', (socket) => {
    console.log(`Yeni oyuncu bağlandı: ${socket.id}`);

    // --- Lobi ve Oda Oluşturma/Katılma Mantığı ---
    socket.on('createGame', (callback) => {
        // Rastgele 4 haneli bir oda kodu oluştur
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        
        // Odayı oluştur ve oyuncuyu ilk oyuncu olarak ekle
        games[roomId] = {
            player1Id: socket.id,
            player2Id: null,
            board: initializeBoard(), // Dama tahtasını başlatma fonksiyonunuz
            turn: 'player1' // İlk kimin başlayacağı
        };
        
        socket.join(roomId);
        // İstemciye oda kodunu gönder
        callback({ success: true, roomId: roomId, role: 'player1' });
        console.log(`Oda oluşturuldu: ${roomId} (Oyuncu 1: ${socket.id})`);
    });

    socket.on('joinGame', (roomId, callback) => {
        const game = games[roomId];

        if (!game) {
            callback({ success: false, message: 'Oda bulunamadı.' });
            return;
        }
        if (game.player2Id) {
            callback({ success: false, message: 'Oda dolu.' });
            return;
        }
        
        // Odaya katıl ve ikinci oyuncu olarak ekle
        game.player2Id = socket.id;
        socket.join(roomId);
        callback({ success: true, roomId: roomId, role: 'player2' });

        // İki oyuncu da hazır. Oyunu başlatma mesajını gönder.
        io.to(roomId).emit('gameStart', { board: game.board, turn: game.turn });
        console.log(`Oyuncu ${socket.id} odaya katıldı: ${roomId} (Oyuncu 2)`);
    });

    // --- Oyun İçi Mantık ---
    socket.on('move', (data) => {
        const { roomId, from, to } = data;
        const game = games[roomId];
        
        if (!game) return;
        
        // ******* ÖNEMLİ: SUNUCUDA HAREKET KONTROLÜ *******
        // 1. Hareket sırası bu oyuncuda mı? (game.turn kontrolü)
        // 2. Hareket dama kurallarına uygun mu? (Tahtada geçerlilik kontrolü)
        // 3. Vurma zorunluluğu var mıydı?
        // Bu kontrolleri sunucu tarafında yapmalısınız.
        
        const isPlayer1 = game.player1Id === socket.id;
        const isPlayer2 = game.player2Id === socket.id;

        // Geçerli bir hamle olduğu varsayılırsa:
        // game.board = applyMove(game.board, from, to); // Tahtayı güncelle
        // game.turn = game.turn === 'player1' ? 'player2' : 'player1'; // Sırayı değiştir

        // Odanın tüm üyelerine tahta durumunu ve sırayı bildir
        io.to(roomId).emit('boardUpdate', { 
            board: game.board, 
            turn: game.turn 
        });

        // Kazanma/Beraberlik kontrolü yapılabilir ve 'gameOver' eventi gönderilebilir
    });

    // --- Bağlantı Kesilmesi ---
    socket.on('disconnect', () => {
        console.log(`Oyuncu bağlantısı kesildi: ${socket.id}`);
        // Bağlantısı kesilen oyuncunun odasını bul ve diğer oyuncuya haber ver
        for (const roomId in games) {
            if (games[roomId].player1Id === socket.id || games[roomId].player2Id === socket.id) {
                // Odanın diğer oyuncusuna 'opponentDisconnected' eventini gönder
                socket.to(roomId).emit('opponentDisconnected', 'Rakibiniz oyundan ayrıldı.');
                delete games[roomId]; // Odayı sil
                console.log(`Oda ${roomId} silindi.`);
                break;
            }
        }
    });
});

// Sizin Render sunucunuz 10000 portunda çalışmalı.
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});

// Tahta Başlatma Örneği (Bu fonksiyonu kurallara göre detaylı yazmalısınız)
function initializeBoard() {
    // 8x8 bir dama tahtası dizisi döndürün.
    // Örnek: 0: Boş, 1: Oyuncu 1 taşı, 2: Oyuncu 2 taşı
    return [
        [0, 2, 0, 2, 0, 2, 0, 2],
        [2, 0, 2, 0, 2, 0, 2, 0],
        [0, 2, 0, 2, 0, 2, 0, 2],
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
        [1, 0, 1, 0, 1, 0, 1, 0],
        [0, 1, 0, 1, 0, 1, 0, 1],
        [1, 0, 1, 0, 1, 0, 1, 0]
    ];
}
