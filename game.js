const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

// Veri yapıları
const rooms = new Map();
const waitingPlayers = new Map();
const users = new Map();

// Rastgele 4 haneli oda kodu oluştur
function generateRoomCode() {
    let code;
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(code));
    return code;
}

// Socket.IO bağlantıları
io.on('connection', (socket) => {
    console.log('✅ Yeni bağlantı:', socket.id);

    // Kullanıcı kaydı
    socket.on('registerUser', (data) => {
        users.set(socket.id, {
            userId: data.userId,
            userName: data.userName,
            socketId: socket.id
        });
        console.log('👤 Kullanıcı kaydedildi:', data.userName, '(', data.userId, ')');
    });

    // Dereceli oyun arama
    socket.on('findMatch', (data) => {
        console.log('🔍 Oyuncu arama yapıyor:', data.userName);
        
        if (waitingPlayers.has(socket.id)) {
            console.log('⚠️ Oyuncu zaten beklemede:', socket.id);
            return;
        }

        if (waitingPlayers.size > 0) {
            const [opponentSocketId, opponentData] = Array.from(waitingPlayers.entries())[0];
            const opponentSocket = io.sockets.sockets.get(opponentSocketId);
            
            if (opponentSocket) {
                waitingPlayers.delete(opponentSocketId);
                
                const roomCode = generateRoomCode();
                
                // Oda oluştur
                rooms.set(roomCode, {
                    players: [
                        { socketId: socket.id, userId: data.userId, userName: data.userName },
                        { socketId: opponentSocketId, userId: opponentData.userId, userName: opponentData.userName }
                    ],
                    board: null,
                    currentPlayer: 'white',
                    createdAt: Date.now()
                });

                socket.join(roomCode);
                opponentSocket.join(roomCode);

                socket.emit('matchFound', {
                    roomCode: roomCode,
                    playerColor: 'white',
                    opponentName: opponentData.userName
                });
                
                opponentSocket.emit('matchFound', {
                    roomCode: roomCode,
                    playerColor: 'black',
                    opponentName: data.userName
                });

                console.log('🎮 Eşleşme oluşturuldu:', roomCode, '-', data.userName, 'vs', opponentData.userName);
            } else {
                waitingPlayers.delete(opponentSocketId);
                waitingPlayers.set(socket.id, data);
                console.log('⏳ Oyuncu bekleme listesine eklendi:', data.userName);
            }
        } else {
            waitingPlayers.set(socket.id, data);
            console.log('⏳ Oyuncu bekleme listesine eklendi:', data.userName);
        }
    });

    // Arama iptal
    socket.on('cancelSearch', (data) => {
        if (waitingPlayers.has(socket.id)) {
            waitingPlayers.delete(socket.id);
            console.log('❌ Arama iptal edildi:', data.userId);
        }
    });

    // Özel oda oluştur
    socket.on('createRoom', (data) => {
        const roomCode = generateRoomCode();
        
        rooms.set(roomCode, {
            players: [
                { socketId: socket.id, userId: data.userId, userName: data.userName }
            ],
            board: null,
            currentPlayer: 'white',
            isPrivate: true,
            createdAt: Date.now()
        });

        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode: roomCode });
        
        console.log('🏠 Özel oda oluşturuldu:', roomCode, 'by', data.userName);
    });

    // Odaya katıl
    socket.on('joinRoom', (data) => {
        const room = rooms.get(data.roomCode);
        
        if (!room) {
            socket.emit('error', { message: 'Oda bulunamadı!' });
            console.log('❌ Oda bulunamadı:', data.roomCode);
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('error', { message: 'Oda dolu!' });
            console.log('❌ Oda dolu:', data.roomCode);
            return;
        }

        if (room.players.some(p => p.userId === data.userId)) {
            socket.emit('error', { message: 'Zaten bu odasınız!' });
            return;
        }

        room.players.push({ 
            socketId: socket.id, 
            userId: data.userId, 
            userName: data.userName 
        });
        socket.join(data.roomCode);

        const [player1, player2] = room.players;
        
        const player1Socket = io.sockets.sockets.get(player1.socketId);
        const player2Socket = io.sockets.sockets.get(player2.socketId);
        
        if (player1Socket) {
            player1Socket.emit('roomJoined', {
                roomCode: data.roomCode,
                playerColor: 'white',
                opponentName: player2.userName
            });
        }
        
        if (player2Socket) {
            player2Socket.emit('roomJoined', {
                roomCode: data.roomCode,
                playerColor: 'black',
                opponentName: player1.userName
            });
        }

        console.log('👥 Oyuncu odaya katıldı:', data.roomCode, '-', data.userName);
    });

    // Oyun hazır
    socket.on('gameReady', (data) => {
        const room = rooms.get(data.roomCode);
        if (!room) {
            console.log('❌ Oda bulunamadı (gameReady):', data.roomCode);
            return;
        }

        if (!room.board) {
            room.board = data.board;
            
            room.players.forEach(player => {
                const playerSocket = io.sockets.sockets.get(player.socketId);
                if (playerSocket) {
                    const playerColor = room.players.indexOf(player) === 0 ? 'white' : 'black';
                    const opponent = room.players.find(p => p.socketId !== player.socketId);
                    
                    playerSocket.emit('gameStart', {
                        board: room.board,
                        currentPlayer: room.currentPlayer,
                        playerColor: playerColor,
                        opponentName: opponent ? opponent.userName : 'Rakip'
                    });
                }
            });
            
            console.log('🎮 Oyun başladı:', data.roomCode);
        }
    });

    // Hamle yap
    socket.on('makeMove', (data) => {
        const room = rooms.get(data.roomCode);
        if (!room) {
            console.log('❌ Oda bulunamadı (makeMove):', data.roomCode);
            return;
        }

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

        console.log('♟️ Hamle yapıldı:', data.roomCode, 'Sıra:', room.currentPlayer);

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
            
            console.log('🏆 Oyun bitti:', data.roomCode, 'Kazanan:', winner);
            
            setTimeout(() => {
                rooms.delete(data.roomCode);
                console.log('🗑️ Oda temizlendi:', data.roomCode);
            }, 5000);
        } else {
            // Hareket edebilecek taş var mı kontrol et
            const currentPlayerPieces = [];
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    const piece = room.board[row][col];
                    if (piece && piece.color === room.currentPlayer) {
                        currentPlayerPieces.push({row, col});
                    }
                }
            }
            
            // Hareket edebilecek taş yoksa oyun bitti
            let hasValidMoves = false;
            for (const pos of currentPlayerPieces) {
                const moves = getValidMovesServer(room.board, pos.row, pos.col);
                if (moves.length > 0) {
                    hasValidMoves = true;
                    break;
                }
            }
            
            if (!hasValidMoves) {
                const winner = room.currentPlayer === 'white' ? 'black' : 'white';
                io.to(data.roomCode).emit('gameOver', { winner: winner });
                console.log('🏆 Oyun bitti (hamle yok):', data.roomCode, 'Kazanan:', winner);
                
                setTimeout(() => {
                    rooms.delete(data.roomCode);
                }, 5000);
            }
        }
    });

    // Oyun terk edildi (2 kez AFK)
    socket.on('gameAbandoned', (data) => {
        const room = rooms.get(data.roomCode);
        if (room) {
            io.to(data.roomCode).emit('gameAbandoned');
            rooms.delete(data.roomCode);
            console.log('⚠️ Oyun terk edildi (2x AFK):', data.roomCode);
        }
    });

    // Oyundan çık
    socket.on('leaveGame', (data) => {
        const room = rooms.get(data.roomCode);
        if (room) {
            socket.to(data.roomCode).emit('opponentLeft');
            rooms.delete(data.roomCode);
            console.log('🚪 Oyuncu oyundan ayrıldı:', data.roomCode);
        }
    });

    // Odadan çık
    socket.on('leaveRoom', (data) => {
        const room = rooms.get(data.roomCode);
        if (room) {
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
            }
            
            if (room.players.length === 0) {
                rooms.delete(data.roomCode);
                console.log('🗑️ Boş oda silindi:', data.roomCode);
            }
        }
    });

    // Bağlantı kesildiğinde
    socket.on('disconnect', () => {
        console.log('❌ Bağlantı kesildi:', socket.id);
        
        const user = users.get(socket.id);
        if (user) {
            console.log('👤 Kullanıcı ayrıldı:', user.userName);
            users.delete(socket.id);
        }
        
        if (waitingPlayers.has(socket.id)) {
            waitingPlayers.delete(socket.id);
            console.log('⏳ Bekleme listesinden çıkarıldı');
        }

        rooms.forEach((room, roomCode) => {
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex !== -1) {
                socket.to(roomCode).emit('opponentLeft');
                rooms.delete(roomCode);
                console.log('🗑️ Oyuncu ayrıldı, oda silindi:', roomCode);
            }
        });
    });
});

// Sunucu tarafında hamle kontrolü
function getValidMovesServer(board, row, col) {
    const moves = [];
    const piece = board[row][col];
    if (!piece) return moves;
    
    const directions = piece.king ? 
        [[-1, -1], [-1, 1], [1, -1], [1, 1]] : 
        piece.color === 'white' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
    
    // Yeme hamlelerini kontrol et
    const captureMoves = [];
    directions.forEach(([dRow, dCol]) => {
        const enemyRow = row + dRow;
        const enemyCol = col + dCol;
        
        if (enemyRow >= 0 && enemyRow < 8 && enemyCol >= 0 && enemyCol < 8) {
            const enemyPiece = board[enemyRow][enemyCol];
            
            if (enemyPiece && enemyPiece.color !== piece.color) {
                const jumpRow = enemyRow + dRow;
                const jumpCol = enemyCol + dCol;
                
                if (jumpRow >= 0 && jumpRow < 8 && jumpCol >= 0 && jumpCol < 8) {
                    if (!board[jumpRow][jumpCol]) {
                        captureMoves.push({ row: jumpRow, col: jumpCol });
                    }
                }
            }
        }
    });
    
    if (captureMoves.length > 0) {
        return captureMoves;
    }
    
    // Normal hamleler
    directions.forEach(([dRow, dCol]) => {
        const newRow = row + dRow;
        const newCol = col + dCol;
        
        if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
            if (!board[newRow][newCol]) {
                moves.push({ row: newRow, col: newCol });
            }
        }
    });
    
    return moves;
}

// Statik dosyaları servis et
app.use(express.static('.'));

// Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Sunucu durumu
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        activeRooms: rooms.size,
        waitingPlayers: waitingPlayers.size,
        connectedUsers: users.size,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Sunucuyu başlat
http.listen(PORT, () => {
    console.log('🚀 Sunucu çalışıyor:', PORT);
    console.log('📡 Socket.IO hazır');
    console.log('🎮 Amerikan Daması Online başlatıldı!');
});

// Periyodik temizlik
setInterval(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    rooms.forEach((room, roomCode) => {
        if (now - room.createdAt > oneHour) {
            rooms.delete(roomCode);
            console.log('🗑️ Eski oda temizlendi:', roomCode);
        }
    });
}, 30 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('⚠️ SIGTERM alındı, sunucu kapatılıyor...');
    http.close(() => {
        console.log('✅ Sunucu kapatıldı');
        process.exit(0);
    });
});
