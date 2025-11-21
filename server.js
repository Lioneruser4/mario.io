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
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

const PORT = process.env.PORT || 3000;

// Veri yapıları
const rooms = new Map();
const waitingPlayers = new Map();
const users = new Map();

console.log('🚀 Sunucu başlatılıyor...');

// Rastgele 4 haneli oda kodu oluştur
function generateRoomCode() {
    let code;
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(code));
    return code;
}

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
        console.log('👤 Kullanıcı kaydedildi:', data.userName, '| ID:', data.userId);
    });

    // Dereceli oyun arama
    socket.on('findMatch', (data) => {
        console.log('🔍 Oyuncu arama yapıyor:', data.userName);
        
        if (waitingPlayers.has(socket.id)) {
            console.log('⚠️ Oyuncu zaten beklemede');
            return;
        }

        if (waitingPlayers.size > 0) {
            const [opponentSocketId, opponentData] = Array.from(waitingPlayers.entries())[0];
            const opponentSocket = io.sockets.sockets.get(opponentSocketId);
            
            if (opponentSocket) {
                waitingPlayers.delete(opponentSocketId);
                
                const roomCode = generateRoomCode();
                
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

                console.log('🎮 Eşleşme:', roomCode, '-', data.userName, 'vs', opponentData.userName);
            } else {
                waitingPlayers.delete(opponentSocketId);
                waitingPlayers.set(socket.id, data);
                console.log('⏳ Bekleme listesine eklendi:', data.userName);
            }
        } else {
            waitingPlayers.set(socket.id, data);
            console.log('⏳ Bekleme listesine eklendi:', data.userName);
        }
    });

    // Arama iptal
    socket.on('cancelSearch', (data) => {
        if (waitingPlayers.has(socket.id)) {
            waitingPlayers.delete(socket.id);
            console.log('❌ Arama iptal edildi');
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
        
        console.log('🏠 Özel oda:', roomCode, 'by', data.userName);
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

        console.log('👥 Odaya katıldı:', data.roomCode, '-', data.userName);
    });

    // Oyun hazır
    socket.on('gameReady', (data) => {
        const room = rooms.get(data.roomCode);
        if (!room) return;

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
            socket.emit('error', { message: 'Oda bulunamadı!' });
            return;
        }

        // Oyuncu bu odada mı kontrol et
        const player = room.players.find(p => p.socketId === socket.id);
        if (!player) {
            socket.emit('error', { message: 'Bu odada değilsiniz!' });
            return;
        }

        // Sıra kontrolü - çoklu yeme sırasında sıra değişmez
        const playerColor = room.players.indexOf(player) === 0 ? 'white' : 'black';
        if (!data.continueCapture && room.currentPlayer !== playerColor) {
            socket.emit('error', { message: 'Sıra sizde değil!' });
            return;
        }

        // Hamle validasyonu - geçerli hamle mi?
        const validMoves = getValidMovesServer(room.board, data.from.row, data.from.col);
        const isValidMove = validMoves.some(move => 
            move.row === data.to.row && move.col === data.to.col
        );
        
        if (!isValidMove) {
            socket.emit('error', { message: 'Geçersiz hamle!' });
            return;
        }

        // Taş kontrolü - doğru taş mı?
        const piece = room.board[data.from.row] && room.board[data.from.row][data.from.col];
        if (!piece || piece.color !== playerColor) {
            socket.emit('error', { message: 'Geçersiz taş!' });
            return;
        }

        room.board = data.board;
        
        // Çoklu yeme sırasında sıra değişmez
        if (!data.continueCapture) {
            room.currentPlayer = room.currentPlayer === 'white' ? 'black' : 'white';
        }

        io.to(data.roomCode).emit('moveMade', {
            board: room.board,
            currentPlayer: room.currentPlayer,
            from: data.from,
            to: data.to,
            capture: data.capture,
            continueCapture: data.continueCapture || false
        });

        console.log('♟️ Hamle:', data.roomCode, '- Sıra:', room.currentPlayer, data.continueCapture ? '(Çoklu Yeme)' : '');

        // Çoklu yeme sırasında oyun bitiş kontrolü yapılmaz
        if (data.continueCapture) {
            return;
        }

        // Oyun bitişini kontrol et - taş sayısı
        const whitePieces = [];
        const blackPieces = [];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = room.board[row] && room.board[row][col];
                if (piece) {
                    if (piece.color === 'white') {
                        whitePieces.push({row, col});
                    } else {
                        blackPieces.push({row, col});
                    }
                }
            }
        }

        if (whitePieces.length === 0 || blackPieces.length === 0) {
            const winner = whitePieces.length > 0 ? 'white' : 'black';
            io.to(data.roomCode).emit('gameOver', { winner: winner });
            console.log('🏆 Oyun bitti (taş bitti):', data.roomCode, '- Kazanan:', winner);
            
            setTimeout(() => {
                rooms.delete(data.roomCode);
            }, 5000);
            return;
        }

        // Hareket edebilecek taş var mı kontrol et
        const currentPlayerPieces = room.currentPlayer === 'white' ? whitePieces : blackPieces;
        let hasValidMoves = false;
        let hasCaptureMoves = false;
        
        for (const pos of currentPlayerPieces) {
            const moves = getValidMovesServer(room.board, pos.row, pos.col);
            if (moves.length > 0) {
                hasValidMoves = true;
                // Yeme hamlesi var mı kontrol et
                const captureMoves = moves.filter(m => {
                    // Yeme hamlesi kontrolü - arada düşman taş var mı?
                    const dRow = m.row - pos.row;
                    const dCol = m.col - pos.col;
                    const stepRow = dRow > 0 ? 1 : -1;
                    const stepCol = dCol > 0 ? 1 : -1;
                    
                    let foundEnemy = false;
                    for (let r = pos.row + stepRow, c = pos.col + stepCol; 
                         r !== m.row && c !== m.col; 
                         r += stepRow, c += stepCol) {
                        const piece = room.board[r] && room.board[r][c];
                        if (piece && piece.color !== room.currentPlayer) {
                            foundEnemy = true;
                            break;
                        }
                    }
                    return foundEnemy;
                });
                
                if (captureMoves.length > 0) {
                    hasCaptureMoves = true;
                }
            }
        }
        
        if (!hasValidMoves) {
            const winner = room.currentPlayer === 'white' ? 'black' : 'white';
            io.to(data.roomCode).emit('gameOver', { winner: winner });
            console.log('🏆 Oyun bitti (hamle yok):', data.roomCode, '- Kazanan:', winner);
            
            setTimeout(() => {
                rooms.delete(data.roomCode);
            }, 5000);
        }
    });

    // Oyun terk edildi
    socket.on('gameAbandoned', (data) => {
        const room = rooms.get(data.roomCode);
        if (room) {
            io.to(data.roomCode).emit('gameAbandoned');
            rooms.delete(data.roomCode);
            console.log('⚠️ Oyun terk edildi:', data.roomCode);
        }
    });

    // Oyundan çık
    socket.on('leaveGame', (data) => {
        const room = rooms.get(data.roomCode);
        if (room) {
            socket.to(data.roomCode).emit('opponentLeft');
            rooms.delete(data.roomCode);
            console.log('🚪 Oyundan çıkıldı:', data.roomCode);
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

    // Bağlantı kesildi
    socket.on('disconnect', () => {
        console.log('❌ Bağlantı kesildi:', socket.id);
        
        const user = users.get(socket.id);
        if (user) {
            console.log('👤 Kullanıcı ayrıldı:', user.userName);
            users.delete(socket.id);
        }
        
        if (waitingPlayers.has(socket.id)) {
            waitingPlayers.delete(socket.id);
        }

        rooms.forEach((room, roomCode) => {
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex !== -1) {
                socket.to(roomCode).emit('opponentLeft');
                rooms.delete(roomCode);
                console.log('🗑️ Oda silindi:', roomCode);
            }
        });
    });
});

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

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
    res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).send('404 - Sayfa bulunamadı');
});

// Sunucuyu başlat
http.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════');
    console.log('🚀 Sunucu çalışıyor!');
    console.log('📡 Port:', PORT);
    console.log('🌐 URL: http://localhost:' + PORT);
    console.log('🎮 Amerikan Daması Online hazır!');
    console.log('═══════════════════════════════════════');
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
    console.log('⚠️ SIGTERM alındı');
    http.close(() => {
        console.log('✅ Sunucu kapatıldı');
        process.exit(0);
    });
});

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('💥 Unhandled Rejection:', error);
});
