// server.js dosyasının başlangıç içeriği (Node.js/Express/Socket.IO)

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid'); // Oda ID'leri için

const app = express();
const server = http.createServer(app);

// Socket.IO Sunucusunu Başlatma
// İstemci (Front-End) buna bağlanacak: https://mario-io-1.onrender.com
const io = new Server(server, {
    cors: {
        origin: "*", // Tüm kökenlerden gelen isteklere izin verir (GitHub Pages için gerekli)
        methods: ["GET", "POST"]
    }
});

// Sunucu Durum Yönetimi
let matchmakingQueue = []; // Dereceli eşleşme bekleyenler
let activeRooms = {};       // Aktif oyun odaları (key: roomCode, value: { player1: socketId, player2: socketId, gameState: {} })


/**
 * 🔑 Yardımcı Fonksiyon: 4 Haneli Oda Kodu Oluşturma
 */
function generateRoomCode() {
    // 4 rastgele rakam oluşturur.
    return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * 🎲 Dama Oyununun Başlangıç Durumunu Oluşturma
 * (Tahta dizisi, başlangıç sırası vb.)
 */
function initializeGameState() {
    return {
        board: [ /* 8x8 Dama tahtası dizisi burada tanımlanır */ ],
        currentPlayer: 'RED', // Kırmızı başlar varsayalım
        status: 'playing',
        // ... diğer oyun bilgileri
    };
}


// Yeni bir kullanıcı bağlandığında
io.on('connection', (socket) => {
    console.log('Yeni bir kullanıcı bağlandı:', socket.id);

    // --- 1. LOBİ İŞLEVLERİ ---

    // Dereceli Eşleşme İsteği
    socket.on('findMatch', () => {
        // ... Eşleşme kuyruğu mantığı buraya gelir.
        matchmakingQueue.push(socket.id);
        
        if (matchmakingQueue.length >= 2) {
            const player1Id = matchmakingQueue.shift();
            const player2Id = matchmakingQueue.shift();
            
            const roomCode = uuidv4(); // Benzersiz bir oyun odası ID'si
            
            // Oda durumunu oluştur ve kaydet
            activeRooms[roomCode] = {
                player1: player1Id,
                player2: player2Id,
                gameState: initializeGameState()
            };

            // Her iki oyuncuyu da odaya dahil et ve oyunun başladığını bildir.
            io.to(player1Id).emit('matchFound', roomCode);
            io.to(player2Id).emit('matchFound', roomCode);
            
            // Oyunu başlatma mesajı
            io.to(player1Id).emit('gameStateUpdate', activeRooms[roomCode].gameState);
            io.to(player2Id).emit('gameStateUpdate', activeRooms[roomCode].gameState);

            console.log(`Eşleşme bulundu. Oda: ${roomCode}`);
        }
    });

    // Arkadaşla Oyna (Oda Kur) İsteği
    socket.on('createRoom', () => {
        const code = generateRoomCode();
        activeRooms[code] = {
            player1: socket.id,
            player2: null, // İkinci oyuncuyu bekliyor
            gameState: null // Oyun durumu henüz başlamadı
        };
        socket.join(code);
        socket.emit('roomCreated', code);
        console.log(`Özel oda kuruldu. Kod: ${code}`);
    });
    
    // Odaya Bağlan İsteği
    socket.on('joinRoom', (code) => {
        const room = activeRooms[code];
        if (room && !room.player2) {
            room.player2 = socket.id;
            room.gameState = initializeGameState();
            
            socket.join(code);
            socket.emit('matchFound', code);
            
            // Odanın her iki oyuncusuna da oyunun başladığını ve durumu gönder
            io.to(code).emit('gameStateUpdate', room.gameState);
            console.log(`Oyuncu odaya bağlandı: ${code}`);
        } else {
            socket.emit('roomError', 'Oda bulunamadı veya dolu.');
        }
    });

    // --- 2. OYUN İŞLEVLERİ (DAMA MANTIĞI BURAYA GELİR) ---
    
    // Taş seçimi ve geçerli hareketleri hesaplama
    socket.on('pieceSelected', ({ row, col }) => {
        const roomCode = /* oyuncunun bulunduğu odayı bul */;
        const gameState = activeRooms[roomCode].gameState;
        
        // **!!! BURASI EN KRİTİK KISIMDIR !!!**
        // Server: Dama kurallarına göre (zorunlu yeme, normal hareket)
        //         seçilen taş için geçerli hareketleri HESAPLA.
        const validMoves = calculateValidMoves(gameState, row, col); 
        
        socket.emit('validMoves', validMoves);
    });

    // Hareket yapma isteği
    socket.on('makeMove', ({ from, to }) => {
        const roomCode = /* oyuncunun bulunduğu odayı bul */;
        const room = activeRooms[roomCode];
        
        // Server: Hareketin geçerli olup olmadığını KONTROL ET.
        // Server: Oyunu GÜNCELLE (taşı hareket ettir, rakip taşı yediyse sil, sırayı değiştir, king yap).
        // const newGameState = updateGame(room.gameState, from, to);
        
        // Oda içindeki her iki oyuncuya da yeni oyun durumunu gönder
        // io.to(roomCode).emit('gameStateUpdate', newGameState);
    });

    // Bağlantı kesildiğinde
    socket.on('disconnect', () => {
        console.log('Kullanıcının bağlantısı kesildi:', socket.id);
        // Kullanıcıyı kuyruktan veya aktif odadan çıkar (Oyun Terk Etme Mantığı)
    });
});


// Sunucuyu belirtilen portta başlatma
const PORT = process.env.PORT || 3000; 
server.listen(PORT, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
    console.log(`Render Sunucunuzun URL'si: ${SERVER_URL} olmalıdır.`);
});
