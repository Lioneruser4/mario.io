const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Oyun odaları ve bekleme listesi
const rooms = new Map();
const waitingPlayers = [];

// Rastgele 4 haneli oda kodu oluştur
function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// Socket.IO bağlantıları
io.on('connection', (socket) => {
    console.log('Yeni oyuncu bağlandı:', socket.id);

    // Dereceli oyun arama
    socket.on('findMatch', () => {
        if (waitingPlayers.length > 0) {
            // Eşleşme bulundu
            const opponent = waitingPlayers.shift();
            const roomCode = generateRoomCode();
            
            // Oda oluştur
            rooms.set(roomCode, {
                players: [socket.id, opponent.id],
                board: null,
                currentPlayer: 'white'
            });

            // Her iki oyuncuyu odaya ekle
            socket.join(roomCode);
            opponent.join(roomCode);

            // Oyunculara renk ata
            socket.emit('matchFound', {
                roomCode: roomCode,
                playerColor: 'white'
            });
            opponent.emit('matchFound', {
                roomCode: roomCode,
                playerColor: 'black'
            });

            console.log(`Eşleşme bulundu: ${roomCode}`);
        } else {
            // Bekleme listesine ekle
            waitingPlayers.push(socket);
            console.log('Oyuncu bekleme listesine eklendi:', socket.id);
        }
    });

    // Arama iptal
    socket.on('cancelSearch', () => {
        const index = waitingPlayers.findIndex(p => p.id === socket.id);
        if (index !== -1) {
            waitingPlayers.splice(index, 1);
            console.log('Arama iptal edildi:', socket.id);
        }
    });

    // Özel oda oluştur
    socket.on('createRoom', () => {
        const roomCode = generateRoomCode();
        
        rooms.set(roomCode, {
            players: [socket.id],
            board: null,
            currentPlayer: 'white',
            isPrivate: true
        });

        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode: roomCode });
        
        console.log(`Özel oda oluşturuldu: ${roomCode}`);
    });

    // Odaya katıl
    socket.on('joinRoom', (roomCode) => {
        const room = rooms.get(roomCode);
        
        if (!room) {
            socket.emit('error', { message: 'Oda bulunamadı!' });
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('error', { message: 'Oda dolu!' });
            return;
        }

        // Odaya katıl
        room.players.push(socket.id);
        socket.join(roomCode);

        // Her iki oyuncuya oyun başladığını bildir
        const [player1, player2] = room.players;
        
        io.to(player1).emit('roomJoined', {
            roomCode: roomCode,
            playerColor: 'white'
        });
        
        io.to(player2).emit('roomJoined', {
            roomCode: roomCode,
            playerColor: 'black'
        });

        console.log(`Oyuncu odaya katıldı: ${roomCode}`);
    });

    // Oyun hazır
    socket.on('gameReady', (data) => {
        const room = rooms.get(data.roomCode);
        if (room) {
            room.board = data.board;
            
            // Her iki oyuncuya oyun durumunu gönder
            io.to(data.roomCode).emit('gameStart', {
                board: room.board,
                currentPlayer: room.currentPlayer
            });
        }
    });

    // Hamle yap
    socket.on('makeMove', (data) => {
        const room = rooms.get(data.roomCode);
        if (!room) return;

        // Tahtayı güncelle
        room.board = data.board;
        
        // Sırayı değiştir
        room.currentPlayer = room.currentPlayer === 'white' ? 'black' : 'white';

        // Tüm oyunculara hamleyi bildir
        io.to(data.roomCode).emit('moveMade', {
            board: room.board,
            currentPlayer: room.currentPlayer,
            from: data.from,
            to: data.to,
            capture: data.capture
        });

        // Oyun bitişini kontrol et
        const hasWhitePieces = room.board.some(row => 
            row.some(piece => piece && piece.color === 'white')
        );
        const hasBlackPieces = room.board.some(row => 
            row.some(piece => piece && piece.color === 'black')
        );

        if (!hasWhitePieces || !hasBlackPieces) {
            const winner = hasWhitePieces ? 'white' : 'black';
            io.to(data.roomCode).emit('gameOver', { winner: winner });
            
            // Odayı temizle
            rooms.delete(data.roomCode);
            console.log(`Oyun bitti: ${data.roomCode}, Kazanan: ${winner}`);
        }
    });

    // Oyundan çık
    socket.on('leaveGame', (roomCode) => {
        const room = rooms.get(roomCode);
        if (room) {
            // Rakibe bildirim gönder
            socket.to(roomCode).emit('opponentLeft');
            
            // Odayı temizle
            rooms.delete(roomCode);
            console.log(`Oyuncu oyundan ayrıldı: ${roomCode}`);
        }
    });

    // Odadan çık
    socket.on('leaveRoom', (roomCode) => {
        const room = rooms.get(roomCode);
        if (room) {
            const index = room.players.indexOf(socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
            }
            
            // Oda boşsa sil
            if (room.players.length === 0) {
                rooms.delete(roomCode);
                console.log(`Oda silindi: ${roomCode}`);
            }
        }
    });

    // Bağlantı kesildiğinde
    socket.on('disconnect', () => {
        console.log('Oyuncu ayrıldı:', socket.id);
        
        // Bekleme listesinden çıkar
        const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
        if (waitingIndex !== -1) {
            waitingPlayers.splice(waitingIndex, 1);
        }

        // Odalardan çıkar
        rooms.forEach((room, roomCode) => {
            const index = room.players.indexOf(socket.id);
            if (index !== -1) {
                // Rakibe bildirim gönder
                socket.to(roomCode).emit('opponentLeft');
                
                // Odayı temizle
                rooms.delete(roomCode);
                console.log(`Oyuncu ayrıldı, oda silindi: ${roomCode}`);
            }
        });
    });
});

// Statik dosyaları servis et
app.use(express.static('public'));

// Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Sunucuyu başlat
http.listen(PORT, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});

// Sunucu durumu endpoint'i
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        activeRooms: rooms.size,
        waitingPlayers: waitingPlayers.length,
        timestamp: new Date().toISOString()
    });
});
