const express = require('express');
const app = express();
const http = require('http').createServer(app);
const path = require('path');
const { v4: uuidv4 } = require('uuid');
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

// MongoDB bağlantısı
const { MongoClient } = require('mongodb');
const uri = "mongodb+srv://xaliqmustafayev7313_db_user:R4Cno5z1Enhtr09u@sayt.1oqunne.mongodb.net/?appName=sayt";
const client = new MongoClient(uri);

// Veritabanı ve koleksiyonlar
let db;
let usersCollection;
let roomsCollection;
let messagesCollection;

// Bellekte tutulan veriler
const onlineUsers = new Map(); // socket.id -> {userId, username, avatar, status}
const userSockets = new Map(); // userId -> Set<socket.id>
const roomMembers = new Map(); // roomId -> Set<userId>
const typingUsers = new Map(); // roomId -> Set<userId>

// Kullanıcı durumları
const UserStatus = {
    ONLINE: 'online',
    OFFLINE: 'offline',
    AWAY: 'away',
    BUSY: 'busy'
};

// Oda tipleri
const RoomType = {
    DIRECT: 'direct',
    GROUP: 'group',
    CHANNEL: 'channel'
};

// Varsayılan avatar URL'leri
const DEFAULT_AVATARS = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=1',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=2',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=3',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=5'
];

// Rastgele avatar seç
function getRandomAvatar() {
    return DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
}

// Kullanıcı adı kontrolü
function isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

// Kullanıcıyı veritabanında bul veya oluştur
async function findOrCreateUser(userId, userName) {
    try {
        // Sadece Telegram kullanıcıları için elo sistemi
        if (!userId.startsWith('TG_')) {
            return null;
        }
        
        let user = await usersCollection.findOne({ userId: userId });
        
        if (!user) {
            // Yeni kullanıcı oluştur
            user = {
                userId: userId,
                userName: userName,
                elo: 0, // Başlangıç elo puanı 0
                level: 1,
                wins: 0,
                losses: 0,
                gamesPlayed: 0,
                createdAt: new Date(),
                lastLoginAt: new Date()
            };
            await usersCollection.insertOne(user);
            console.log(`👤 Yeni kullanıcı oluşturuldu: ${userName} (${userId})`);
        } else {
            // Son giriş tarihini güncelle
            await usersCollection.updateOne(
                { userId: userId },
                { 
                    $set: { 
                        lastLoginAt: new Date(),
                        userName: userName // İsim değişmişse güncelle
                    }
                }
            );
            console.log(`🔄 Kullanıcı güncellendi: ${userName} (${userId})`);
        }
        
        return user;
    } catch (error) {
        console.error('Kullanıcı bulunurken/oluşturulurken hata:', error);
        return null;
    }
}

// Kullanıcı elo puanını güncelle
async function updateElo(userId, eloChange, isWin) {
    try {
        // Sadece Telegram kullanıcıları için elo sistemi
        if (!userId.startsWith('TG_')) {
            return;
        }
        
        // Önce mevcut kullanıcıyı al
        const currentUser = await usersCollection.findOne({ userId: userId });
        if (!currentUser) return;
        
        // Yeni elo puanını hesapla (minimum 0)
        const newElo = Math.max(0, currentUser.elo + eloChange);
        const actualChange = newElo - currentUser.elo; // Gerçek değişim
        
        const newLevel = calculateLevel(newElo);
        
        // Veritabanını güncelle
        const result = await usersCollection.updateOne(
            { userId: userId },
            { 
                $set: { 
                    elo: newElo,
                    lastLoginAt: new Date(),
                    level: newLevel
                }
            }
        );
        
        if (result.matchedCount > 0) {
            // Kazanma/kaybetme istatistiklerini güncelle
            if (isWin) {
                await usersCollection.updateOne(
                    { userId: userId },
                    { $inc: { wins: 1, gamesPlayed: 1 } }
                );
            } else {
                await usersCollection.updateOne(
                    { userId: userId },
                    { $inc: { losses: 1, gamesPlayed: 1 } }
                );
            }
            
            // Güncellenmiş kullanıcı bilgilerini al ve gönder
            const updatedUser = await usersCollection.findOne({ userId: userId });
            if (updatedUser) {
                const socket = Array.from(io.sockets.sockets.values()).find(s => {
                    const user = users.get(s.id);
                    return user && user.userId === userId;
                });
                
                if (socket) {
                    socket.emit('userStats', {
                        elo: updatedUser.elo,
                        level: updatedUser.level,
                        levelIcon: getLevelIcon(updatedUser.level),
                        wins: updatedUser.wins,
                        losses: updatedUser.losses
                    });
                    
                    // Kullanıcıya elo değişimini bildir
                    socket.emit('eloUpdate', {
                        eloChange: actualChange,
                        newElo: updatedUser.elo,
                        isWin: isWin
                    });
                    
                    console.log(`📊 Elo güncellendi: ${updatedUser.userName} - ${actualChange} puan (Yeni Elo: ${updatedUser.elo}, Level: ${updatedUser.level})`);
                }
            }
        }
    } catch (error) {
        console.error('Elo güncellenirken hata:', error);
    }
}

// Liderlik tablosunu al (sadece top 10)
async function getLeaderboard() {
    try {
        // Önce eski ve düşük puanlı oyuncuları temizle
        await cleanupLowRankedUsers();
        
        const leaderboard = await usersCollection
            .find({ userId: { $regex: /^TG_/ } }) // Sadece Telegram kullanıcıları
            .sort({ elo: -1 })
            .limit(10) // Sadece top 10
            .toArray();
            
        return leaderboard;
    } catch (error) {
        console.error('Liderlik tablosu alınamadı:', error);
        return [];
    }
}

// Düşük puanlı ve eski oyuncuları temizle (top 10 dışındakiler)
async function cleanupLowRankedUsers() {
    try {
        // Top 10 dışındakileri bul
        const top10Users = await usersCollection
            .find({ userId: { $regex: /^TG_/ } })
            .sort({ elo: -1 })
            .limit(10)
            .toArray();
        
        const top10Ids = top10Users.map(u => u.userId);
        
        // Top 10 dışında kalan ve 1 aydan fazla giriş yapmamış kullanıcıları temizle
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        
        const result = await usersCollection.deleteMany({
            userId: { $regex: /^TG_/ },
            $and: [
                { userId: { $nin: top10Ids } }, // Top 10'da olmayanlar
                { lastLoginAt: { $lt: oneMonthAgo } } // 1 aydan fazla giriş yapmamışlar
            ]
        });
        
        if (result.deletedCount > 0) {
            console.log(`🧹 ${result.deletedCount} düşük puanlı/aktif olmayan kullanıcı temizlendi`);
        }
    } catch (error) {
        console.error('Düşük puanlı kullanıcı temizleme hatası:', error);
    }
}

// Kullanıcının sıralamasını al
async function getUserRank(userId) {
    try {
        // Sadece Telegram kullanıcıları için elo sistemi
        if (!userId.startsWith('TG_')) {
            return null;
        }
        
        const user = await usersCollection.findOne({ userId: userId });
        if (!user) return null;
        
        const higherRankedUsers = await usersCollection.countDocuments({
            elo: { $gt: user.elo },
            userId: { $regex: /^TG_/ }
        });
        
        return {
            rank: higherRankedUsers + 1,
            elo: user.elo,
            level: user.level,
            levelIcon: getLevelIcon(user.level),
            wins: user.wins,
            losses: user.losses
        };
    } catch (error) {
        console.error('Kullanıcı sıralaması alınırken hata:', error);
        return null;
    }
}

const PORT = process.env.PORT || 3000;

console.log('🚀 Server Başlatılıyor...');

// MongoDB bağlantısı
async function connectToDatabase() {
    try {
        console.log('🔄 MongoDB bağlanıyor...');
        await client.connect();
        console.log('✅ MongoDB bağlantısı başarılı');
        
        db = client.db('checkers_db');
        usersCollection = db.collection('users');
        leaderboardCollection = db.collection('leaderboard');
        
        // Index'leri oluştur
        await usersCollection.createIndex({ userId: 1 }, { unique: true });
        await usersCollection.createIndex({ elo: -1 });
        await usersCollection.createIndex({ level: -1 });
        
        console.log('📊 Database ve index\'ler hazır');
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB bağlantı hatası:', error);
        console.log('⚠️ Elo sistemi devre dışı, oyun bellek içi modda çalışacak');
        return false;
    }
}

// Aktif olmayan kullanıcıları temizle (1 aydan fazla giriş yapmamış)
async function cleanupInactiveUsers() {
    try {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        
        const result = await usersCollection.deleteMany({
            lastLoginAt: { $lt: oneMonthAgo },
            userId: { $regex: /^TG_/ } // Sadece Telegram kullanıcıları
        });
        
        if (result.deletedCount > 0) {
            console.log(`🧹 ${result.deletedCount} aktif olmayan kullanıcı temizlendi`);
        }
    } catch (error) {
        console.error('Kullanıcı temizleme hatası:', error);
    }
}

// Rastgele 4 haneli oda kodu oluştur
function generateRoomCode() {
    let code;
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(code));
    return code;
}

// Oda timer'ını başlat
function startRoomTimer(roomCode) {
    stopRoomTimer(roomCode);
    
    const timer = {
        timeLeft: 20,
        interval: setInterval(() => {
            const room = rooms.get(roomCode);
            if (!room) {
                stopRoomTimer(roomCode);
                return;
            }
            
            timer.timeLeft--;
            
            // Her iki oyuncuya timer değerini gönder
            io.to(roomCode).emit('timerUpdate', {
                timeLeft: timer.timeLeft,
                currentPlayer: room.currentPlayer
            });
            
            if (timer.timeLeft <= 0) {
                // Süre doldu - otomatik hamle veya oyun bitişi
                handleTimerTimeout(roomCode);
                stopRoomTimer(roomCode);
            }
        }, 1000)
    };
    
    roomTimers.set(roomCode, timer);
    
    // İlk timer değerini gönder
    const room = rooms.get(roomCode);
    if (room) {
        io.to(roomCode).emit('timerUpdate', {
            timeLeft: 20,
            currentPlayer: room.currentPlayer
        });
    }
}

// Oda timer'ını durdur
function stopRoomTimer(roomCode) {
    const timer = roomTimers.get(roomCode);
    if (timer && timer.interval) {
        clearInterval(timer.interval);
        roomTimers.delete(roomCode);
    }
}

// Oda timer'ını sıfırla ve yeniden başlat
function resetRoomTimer(roomCode) {
    stopRoomTimer(roomCode);
    startRoomTimer(roomCode);
}

// Timer süresi dolduğunda
function handleTimerTimeout(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    // Süre doldu - oyuncuya bildir
    io.to(roomCode).emit('timerTimeout', {
        currentPlayer: room.currentPlayer
    });
    
    console.log('⏰ Timer doldu:', roomCode, '- Sıra:', room.currentPlayer);
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
                        // Taşı geçici olarak hareket ettir
                        const tempBoard = JSON.parse(JSON.stringify(board));
                        tempBoard[jumpRow][jumpCol] = piece;
                        tempBoard[row][col] = null;
                        tempBoard[enemyRow][enemyCol] = null;
                        
                        // Kral yapma kontrolü
                        if (!piece.king && ((piece.color === 'white' && jumpRow === 0) || (piece.color === 'black' && jumpRow === 7))) {
                            tempBoard[jumpRow][jumpCol].king = true;
                        }
                        
                        // Çoklu yeme kontrolü - bu pozisyondan daha fazla yeme var mı?
                        const furtherCaptures = getValidMovesServer(tempBoard, jumpRow, jumpCol).filter(m => {
                            const dR = m.row - jumpRow;
                            const dC = m.col - jumpCol;
                            return Math.abs(dR) === 2 && Math.abs(dC) === 2;
                        });
                        
                        captureMoves.push({ 
                            row: jumpRow, 
                            col: jumpCol, 
                            capture: { row: enemyRow, col: enemyCol },
                            canContinueCapture: furtherCaptures.length > 0
                        });
                    }
                }
            }
        }
    });
    
    // Eğer yeme hamlesi varsa sadece yeme hamlelerini döndür
    if (captureMoves.length > 0) {
        return captureMoves;
    }
    
    // Normal hamleler (sadece yeme yoksa)
    directions.forEach(([dRow, dCol]) => {
        const newRow = row + dRow;
        const newCol = col + dCol;
        
        if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
            if (!board[newRow][newCol]) {
                moves.push({ row: newRow, col: newCol, capture: null });
            }
        }
    });
    
    return moves;
}

// Başlangıç tahtasını oluştur
function createInitialBoard() {
    const board = Array(8).fill().map(() => Array(8).fill(null));
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if ((row + col) % 2 === 1) {
                if (row < 3) board[row][col] = { color: 'white', king: false };
                if (row > 4) board[row][col] = { color: 'black', king: false };
            }
        }
    }
    return board;
}

// Oyun sonu kontrolü
function checkGameEnd(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || !room.board) return;
    
    // Beyaz taşların varlığını kontrol et
    let whitePieces = 0;
    let blackPieces = 0;
    let whiteHasValidMoves = false;
    let blackHasValidMoves = false;
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = room.board[row][col];
            if (piece) {
                if (piece.color === 'white') {
                    whitePieces++;
                    if (!whiteHasValidMoves) {
                        const moves = getValidMovesServer(room.board, row, col);
                        if (moves.length > 0) whiteHasValidMoves = true;
                    }
                } else {
                    blackPieces++;
                    if (!blackHasValidMoves) {
                        const moves = getValidMovesServer(room.board, row, col);
                        if (moves.length > 0) blackHasValidMoves = true;
                    }
                }
            }
        }
    }
    
    let winner = null;
    let reason = '';
    
    // Taş sayısına göre kazananı belirle
    if (whitePieces === 0) {
        winner = 'black';
        reason = 'Beyaz taşlar kalmadı';
    } else if (blackPieces === 0) {
        winner = 'white';
        reason = 'Siyah taşlar kalmadı';
    }
    // Hamle yapamama durumunu kontrol et
    else if (room.currentPlayer === 'white' && !whiteHasValidMoves) {
        winner = 'black';
        reason = 'Beyaz hamle yapamıyor';
    } else if (room.currentPlayer === 'black' && !blackHasValidMoves) {
        winner = 'white';
        reason = 'Siyah hamle yapamıyor';
    }
    
    if (winner) {
        stopRoomTimer(roomCode);
        io.to(roomCode).emit('gameEnd', {
            winner: winner,
            reason: reason
        });
        
        // Elo puanlarını güncelle
        updateEloForGameEnd(room, winner);
        
        // Odayı sil
        rooms.delete(roomCode);
        console.log(`🏆 Oyun bitti: ${roomCode} - Kazanan: ${winner} (${reason})`);
    }
}

// Socket.IO bağlantıları
io.on('connection', (socket) => {
    console.log('✅ Yeni bağlantı:', socket.id);

    // Kullanıcı kaydı
    socket.on('registerUser', async (data) => {
        // Aynı userId ile zaten bağlı olan kullanıcı varsa eski bağlantıyı kes
        for (const [existingSocketId, existingUser] of users.entries()) {
            if (existingUser.userId === data.userId && existingSocketId !== socket.id) {
                console.log('⚠️ Aynı kullanıcı tekrar bağlandı, eski bağlantı kesiliyor:', data.userId);
                const existingSocket = io.sockets.sockets.get(existingSocketId);
                if (existingSocket) {
                    existingSocket.emit('error', { message: 'Başka bir cihazdan giriş yapıldı!' });
                    existingSocket.disconnect();
                }
                users.delete(existingSocketId);
                break;
            }
        }
        
        users.set(socket.id, {
            userId: data.userId,
            userName: data.userName,
            socketId: socket.id
        });
        console.log('👤 Kullanıcı kaydedildi:', data.userName, '| ID:', data.userId);
        
        // MongoDB'ye kullanıcıyı kaydet veya bul
        const user = await findOrCreateUser(data.userId, data.userName);
        if (user) {
            // Kullanıcıya elo ve seviye bilgisini gönder
            socket.emit('userStats', {
                elo: user.elo,
                level: user.level,
                levelIcon: getLevelIcon(user.level),
                wins: user.wins,
                losses: user.losses
            });
        }
    });

    // Eşleşme timer fonksiyonları
    function startSearchTimer(socketId) {
        stopSearchTimer(socketId);
        
        let timeElapsed = 0;
        const timer = setInterval(() => {
            timeElapsed++;
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
                socket.emit('searchTimerUpdate', { timeElapsed });
            } else {
                clearInterval(timer);
                searchTimers.delete(socketId);
            }
        }, 1000);
        
        searchTimers.set(socketId, { interval: timer, timeElapsed: 0 });
        
        // İlk değeri gönder
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
            socket.emit('searchTimerUpdate', { timeElapsed: 0 });
        }
    }
    
    function stopSearchTimer(socketId) {
        const timer = searchTimers.get(socketId);
        if (timer && timer.interval) {
            clearInterval(timer.interval);
            searchTimers.delete(socketId);
        }
    }

    // Arama iptal
    socket.on('cancelSearch', (data) => {
        if (waitingPlayers.has(socket.id)) {
            stopSearchTimer(socket.id);
            waitingPlayers.delete(socket.id);
            console.log('❌ Arama iptal edildi');
        }
    });

    // Dereceli oyun arama - BASİT FIFO SİSTEMİ
    socket.on('findMatch', (data) => {
        console.log('🔍 Oyuncu arama yapıyor:', data.userName);
        
        // Aynı userId ile zaten beklemede olan kullanıcıyı temizle
        for (const [waitingSocketId, waitingData] of waitingPlayers.entries()) {
            if (waitingData.userId === data.userId && waitingSocketId !== socket.id) {
                console.log('⚠️ Aynı kullanıcı tekrar arama yapıyor, eski arama iptal ediliyor:', data.userId);
                stopSearchTimer(waitingSocketId);
                waitingPlayers.delete(waitingSocketId);
                break;
            }
        }
        
        // Eğer zaten beklemedeyse veya oyundaysa, öncekini temizle
        if (waitingPlayers.has(socket.id)) {
            console.log('⚠️ Oyuncu zaten beklemede, yenileniyor');
            stopSearchTimer(socket.id);
            waitingPlayers.delete(socket.id);
        }

        // Oyuncu bilgilerini sakla
        const playerData = {
            userId: data.userId,
            userName: data.userName,
            userPhotoUrl: data.userPhotoUrl || null,
            userLevel: data.userLevel || 1,
            userElo: data.userElo || 0,
            searchStartTime: Date.now() // Arama başlangıç zamanı
        };

        if (waitingPlayers.size > 0) {
            // İLK BEKLEYEN OYUNCUYU AL (FIFO)
            const [waitingSocketId, waitingData] = waitingPlayers.entries().next().value;
            const opponentSocket = io.sockets.sockets.get(waitingSocketId);
            
            // Aynı Telegram ID ile eşleşmeyi engelle
            if (!opponentSocket || waitingSocketId === socket.id || data.userId === waitingData.userId) {
                console.log('⚠️ Aynı kullanıcı ile eşleşme engellendi:', data.userName, 'vs', waitingData.userName);
                // Her iki kaydı da temizle
                waitingPlayers.delete(waitingSocketId);
                waitingPlayers.delete(socket.id);
                waitingPlayers.set(socket.id, playerData);
                startSearchTimer(socket.id);
                return;
            }
            
            if (opponentSocket) {
                // Eşleşme bulundu - timer'ları durdur
                stopSearchTimer(socket.id);
                stopSearchTimer(waitingSocketId);
                
                // Her iki oyuncuyu da bekleme listesinden çıkar
                waitingPlayers.delete(socket.id);
                waitingPlayers.delete(waitingSocketId);
                
                console.log('🧹 Eşleşme sonrası bekleme listesi temizlendi. Kalan:', waitingPlayers.size);
                
                const roomCode = generateRoomCode();
                
                // İLK ARAYAN BEYAZ OYNAR, İKİNCİ ARAYAN SİYAH OYNAR
                const firstPlayer = waitingData;
                const secondPlayer = playerData;
                const firstSocket = opponentSocket;
                const secondSocket = socket;
                
                rooms.set(roomCode, {
                    players: [
                        { 
                            socketId: firstSocket.id, 
                            userId: firstPlayer.userId, 
                            userName: firstPlayer.userName, 
                            userPhotoUrl: firstPlayer.userPhotoUrl || null,
                            userLevel: firstPlayer.userLevel || 1,
                            userElo: firstPlayer.userElo || 0,
                            playerColor: 'white'
                        },
                        { 
                            socketId: secondSocket.id, 
                            userId: secondPlayer.userId, 
                            userName: secondPlayer.userName, 
                            userPhotoUrl: secondPlayer.userPhotoUrl || null,
                            userLevel: secondPlayer.userLevel || 1,
                            userElo: secondPlayer.userElo || 0,
                            playerColor: 'black'
                        }
                    ],
                    board: createInitialBoard(),
                    currentPlayer: 'white', // BEYAZ HER ZAMAN BAŞLAR
                    isPrivate: false,
                    createdAt: Date.now()
                });
                
                // Timer başlat
                startRoomTimer(roomCode);

                firstSocket.join(roomCode);
                secondSocket.join(roomCode);

                // İlk arayan oyuncuya (beyaz) bilgi gönder
                firstSocket.emit('matchFound', {
                    roomCode: roomCode,
                    playerColor: 'white',
                    opponentName: secondPlayer.userName,
                    opponentPhotoUrl: secondPlayer.userPhotoUrl || null,
                    opponentLevel: secondPlayer.userLevel || 1,
                    opponentElo: secondPlayer.userElo || 0
                });
                
                // İkinci arayan oyuncuya (siyah) bilgi gönder
                secondSocket.emit('matchFound', {
                    roomCode: roomCode,
                    playerColor: 'black',
                    opponentName: firstPlayer.userName,
                    opponentPhotoUrl: firstPlayer.userPhotoUrl || null,
                    opponentLevel: firstPlayer.userLevel || 1,
                    opponentElo: firstPlayer.userElo || 0
                });

                console.log('🎮 Eşleşme:', roomCode, '-', firstPlayer.userName, '(Beyaz) vs', secondPlayer.userName, '(Siyah)');
                console.log('⏰ İlk arayan:', firstPlayer.userName, 'başlıyor!');
            } else {
                waitingPlayers.delete(waitingSocketId);
                waitingPlayers.set(socket.id, playerData);
                startSearchTimer(socket.id);
                console.log('⏳ Bekleme listesine eklendi:', data.userName);
            }
        } else {
            waitingPlayers.set(socket.id, playerData);
            startSearchTimer(socket.id);
            console.log('⏳ Bekleme listesine eklendi:', data.userName);
        }
    });

    // Özel oda oluştur
    socket.on('createRoom', (data) => {
        // Aynı Telegram ID ile oda oluşturmayı engelle
        for (const [roomCode, room] of rooms.entries()) {
            if (room.players.some(p => p.userId === data.userId)) {
                socket.emit('error', { message: 'Zaten bir odanız var!' });
                return;
            }
        }
        
        const roomCode = generateRoomCode();
        
        rooms.set(roomCode, {
            players: [
                { 
                    socketId: socket.id, 
                    userId: data.userId, 
                    userName: data.userName,
                    userPhotoUrl: data.userPhotoUrl || null,
                    playerColor: 'white',
                    ready: false
                }
            ],
            board: createInitialBoard(),
            isPrivate: true,
            gameStarted: false,
            currentPlayer: 'white'
        });
        
        socket.emit('roomCreated', { roomCode });
        console.log('🏠 Oda oluşturuldu:', roomCode, '-', data.userName);
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

        // Aynı Telegram ID ile odaya katılmayı engelle
        if (room.players.some(p => p.userId === data.userId)) {
            socket.emit('error', { message: 'Bu odada zaten varsınız!' });
            console.log('⚠️ Aynı kullanıcı odaya katılmaya çalıştı:', data.userName, 'Oda:', data.roomCode);
            return;
        }

        room.players.push({
            socketId: socket.id,
            userId: data.userId,
            userName: data.userName,
            userPhotoUrl: data.userPhotoUrl || null,
            playerColor: 'black',
            ready: false
        });
        socket.join(data.roomCode);

        const [player1, player2] = room.players;
        
        const player1Socket = io.sockets.sockets.get(player1.socketId);
        const player2Socket = io.sockets.sockets.get(player2.socketId);
        
        if (player1Socket) {
            player1Socket.emit('roomJoined', {
                roomCode: data.roomCode,
                playerColor: 'white',
                opponentName: player2.userName,
                opponentPhotoUrl: player2.userPhotoUrl || null
            });
        }
        
        if (player2Socket) {
            player2Socket.emit('roomJoined', {
                roomCode: data.roomCode,
                playerColor: 'black',
                opponentName: player1.userName,
                opponentPhotoUrl: player1.userPhotoUrl || null
            });
        }
        
        console.log(`👥 İkinci oyuncu katıldı: ${player2.userName} - Oda: ${data.roomCode}`);
    });

    // Oyun hazır olduğunda
    socket.on('gameReady', (data) => {
        const room = rooms.get(data.roomCode);
        if (!room) return;
        
        // İki oyuncu da hazır olduğunda oyunu başlat
        const readyPlayers = room.players.filter(p => {
            const playerSocket = io.sockets.sockets.get(p.socketId);
            return playerSocket;
        });
        
        if (readyPlayers.length === 2) {
            room.gameStarted = true;
            
            // Her iki oyuncuya oyun başlangıç bilgilerini gönder
            readyPlayers.forEach(player => {
                const playerSocket = io.sockets.sockets.get(player.socketId);
                if (playerSocket) {
                    playerSocket.emit('gameStart', {
                        roomCode: data.roomCode,
                        board: room.board,
                        currentPlayer: room.currentPlayer,
                        playerColor: player.playerColor,
                        opponentName: room.players.find(p => p.socketId !== player.socketId)?.userName,
                        opponentPhotoUrl: room.players.find(p => p.socketId !== player.socketId)?.userPhotoUrl
                    });
                }
            });
            
            console.log('🎮 Oyun başladı:', data.roomCode);
        }
    });

    // Hamle yap - BASİT VE TEMİZ
    socket.on('makeMove', (data) => {
        console.log('📥 Hamle isteği geldi:', data);
        
        const room = rooms.get(data.roomCode);
        if (!room) {
            console.log('❌ Oda bulunamadı:', data.roomCode);
            socket.emit('error', { message: 'Oda bulunamadı!' });
            return;
        }
        
        // Oyuncu bul
        const player = room.players.find(p => p.socketId === socket.id);
        if (!player) {
            console.log('❌ Oyuncu bulunamadı:', socket.id);
            socket.emit('error', { message: 'Oyuncu bulunamadı!' });
            return;
        }
        
        console.log(`👤 Oyuncu: ${player.userName} (${player.playerColor}) - Sıra: ${room.currentPlayer}`);
        
        // Sıra kontrolü
        if (room.currentPlayer !== player.playerColor) {
            console.log('❌ Sıra bu oyuncuda değil!', player.playerColor, 'vs', room.currentPlayer);
            socket.emit('error', { message: 'Sıra sizde değil!' });
            return;
        }
        
        // Hamle geçerliliğini kontrol et
        const validMoves = getValidMovesServer(room.board, data.from.row, data.from.col);
        const isValidMove = validMoves.some(move => 
            move.row === data.to.row && move.col === data.to.col
        );
        
        console.log('🎯 Geçerli hamleler:', validMoves);
        console.log('🎯 İstenen hamle:', { row: data.to.row, col: data.to.col });
        
        if (!isValidMove) {
            console.log('❌ Geçersiz hamle!');
            socket.emit('error', { message: 'Geçersiz hamle!' });
            return;
        }

        // Taş kontrolü - doğru taş mı?
        const piece = room.board[data.from.row] && room.board[data.from.row][data.from.col];
        if (!piece || piece.color !== player.playerColor) {
            console.log('❌ Yanlış taş!');
            socket.emit('error', { message: 'Geçersiz taş!' });
            return;
        }

        // Hamleyi uygula
        room.board = data.board;
        
        // Çoklu yeme kontrolü
        const moveData = validMoves.find(m => m.row === data.to.row && m.col === data.to.col);
        const canContinueCapture = moveData && moveData.canContinueCapture;
        
        console.log('🔄 Çoklu yeme devamı:', canContinueCapture);
        
        // Eğer çoklu yeme devam etmiyorsa sırayı değiştir
        if (!canContinueCapture) {
            room.currentPlayer = room.currentPlayer === 'white' ? 'black' : 'white';
            console.log(`🔄 Sıra değişti: ${room.currentPlayer === 'white' ? 'Beyaz' : 'Siyah'} - Oda: ${data.roomCode}`);
            resetRoomTimer(data.roomCode);
        }

        // Herkese hamleyi bildir
        io.to(data.roomCode).emit('moveMade', {
            board: room.board,
            currentPlayer: room.currentPlayer,
            from: data.from,
            to: data.to,
            capture: moveData ? moveData.capture : null,
            canContinueCapture: canContinueCapture
        });
        
        console.log('📤 Hamle broadcast edildi:', data.roomCode);
        
        // Oyunu kontrol et
        checkGameEnd(data.roomCode);
    });

    // Oyun terk edildi
    socket.on('gameAbandoned', (data) => {
        const room = rooms.get(data.roomCode);
        if (room) {
            stopRoomTimer(data.roomCode);
            io.to(data.roomCode).emit('gameAbandoned');
            
            // Elo puanlarını güncelle (sadece dereceli maçlarda)
            if (!room.isPrivate) {
                updateEloForGameAbandon(room, data.userId);
            }
            
            rooms.delete(data.roomCode);
            console.log('🚪 Oyundan çıkıldı:', data.roomCode);
        }
    });

    // Oyundan ayrıl
    socket.on('leaveGame', (data) => {
        const room = rooms.get(data.roomCode);
        if (room) {
            stopRoomTimer(data.roomCode);
            io.to(data.roomCode).emit('opponentLeft');
            rooms.delete(data.roomCode);
            console.log('👋 Oyundan ayrıldı:', data.roomCode);
        }
    });

    // Odayı terk et
    socket.on('leaveRoom', (data) => {
        if (data.roomCode) {
            const room = rooms.get(data.roomCode);
            if (room) {
                room.players = room.players.filter(p => p.socketId !== socket.id);
                
                if (room.players.length === 0) {
                    rooms.delete(data.roomCode);
                    stopRoomTimer(data.roomCode);
                }
            }
        }
    });

    // Liderlik tablosu iste
    socket.on('getLeaderboard', async () => {
        try {
            const leaderboard = await getLeaderboard();
            socket.emit('leaderboardUpdate', leaderboard);
        } catch (error) {
            console.error('Liderlik tablosu alınırken hata:', error);
        }
    });

    // Kullanıcı sıralaması iste
    socket.on('getUserRank', async (data) => {
        try {
            const rank = await getUserRank(data.userId);
            if (rank) {
                socket.emit('userRankUpdate', rank);
            }
        } catch (error) {
            console.error('Kullanıcı sıralaması alınırken hata:', error);
        }
    });

    // Bağlantı kesildiğinde temizlik
    socket.on('disconnect', () => {
        console.log('❌ Bağlantı kesildi:', socket.id);
        
        // Bekleme listesinden çıkar
        if (waitingPlayers.has(socket.id)) {
            stopSearchTimer(socket.id);
            waitingPlayers.delete(socket.id);
        }
        
        // Odalardan çıkar
        for (const [roomCode, room] of rooms.entries()) {
            room.players = room.players.filter(p => p.socketId !== socket.id);
            
            if (room.players.length === 0) {
                rooms.delete(roomCode);
                stopRoomTimer(roomCode);
            } else {
                // Diğer oyuncuya haber ver
                io.to(roomCode).emit('opponentLeft');
            }
        }
        
        users.delete(socket.id);
    });
});

// Oyun sonu elo güncelleme
async function updateEloForGameEnd(room, winner) {
    try {
        // Sadece dereceli maçlarda elo güncelle
        if (room.isPrivate) return;
        
        const [player1, player2] = room.players;
        const winnerPlayer = winner === 'white' ? player1 : player2;
        const loserPlayer = winner === 'white' ? player2 : player1;
        
        // Kullanıcıların mevcut elo puanlarını al
        const winnerUser = await usersCollection.findOne({ userId: winnerPlayer.userId });
        const loserUser = await usersCollection.findOne({ userId: loserPlayer.userId });
        
        if (!winnerUser || !loserUser) return;
        
        // Elo değişimi hesapla
        const { winnerChange, loserChange } = calculateEloChange(winnerUser.elo, loserUser.elo, true);
        
        // Elo puanlarını güncelle
        await updateElo(winnerPlayer.userId, winnerChange, true);
        await updateElo(loserPlayer.userId, loserChange, false);
        
        // Güncellenmiş liderlik tablosunu gönder
        const leaderboard = await getLeaderboard();
        io.emit('leaderboardUpdate', leaderboard);
        
        // Kazanan ve kaybeden oyunculara kendi sıralamalarını gönder
        const winnerRank = await getUserRank(winnerPlayer.userId);
        const loserRank = await getUserRank(loserPlayer.userId);
        
        const winnerSocket = io.sockets.sockets.get(winnerPlayer.socketId);
        const loserSocket = io.sockets.sockets.get(loserPlayer.socketId);
        
        if (winnerSocket && winnerRank) {
            winnerSocket.emit('userRankUpdate', winnerRank);
        }
        
        if (loserSocket && loserRank) {
            loserSocket.emit('userRankUpdate', loserRank);
        }
        
        console.log(`Elo güncellendi - Kazanan: ${winnerPlayer.userName} (+${winnerChange}), Kaybeden: ${loserPlayer.userName} (${loserChange})`);
    } catch (error) {
        console.error('Elo güncelleme hatası:', error);
    }
}

// Oyun terk edilmesi durumu için elo güncelleme
async function updateEloForGameAbandon(room, abandonUserId) {
    try {
        // Sadece dereceli maçlarda elo güncelle
        if (room.isPrivate) return;
        
        const abandonPlayer = room.players.find(p => p.userId === abandonUserId);
        const otherPlayer = room.players.find(p => p.userId !== abandonUserId);
        
        if (!abandonPlayer || !otherPlayer) return;
        
        // Terk eden oyuncu kaybeder, diğer oyuncu kazanır
        await updateElo(abandonPlayer.userId, -15, false);
        await updateElo(otherPlayer.userId, +15, true);
        
        console.log(`Oyun terk edildi - Kaybeden: ${abandonPlayer.userName}, Kazanan: ${otherPlayer.userName}`);
    } catch (error) {
        console.error('Terk edilme elo güncelleme hatası:', error);
    }
}

// Server'ı başlat
async function startServer() {
    const dbConnected = await connectToDatabase();
    
    http.listen(PORT, () => {
        console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
        console.log(`📊 MongoDB: ${dbConnected ? 'Bağlı' : 'Bağlantısız (Bellek içi mod)'}`);
    });
    
    // Her saatte bir temizlik işlemleri
    setInterval(() => {
        if (dbConnected) {
            cleanupInactiveUsers();
        }
    }, 60 * 60 * 1000); // Her saat
}

// Server'ı başlat
startServer().catch(console.error);
