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

// MongoDB bağlantısı
const { MongoClient } = require('mongodb');
const uri = "mongodb+srv://xaliqmustafayev7313_db_user:R4Cno5z1Enhtr09u@sayt.1oqunne.mongodb.net/?appName=sayt";
const client = new MongoClient(uri);

// Veritabanı ve koleksiyon
let db;
let usersCollection;
let leaderboardCollection;

// Veri yapıları
const rooms = new Map();
const waitingPlayers = new Map();
const users = new Map();
const roomTimers = new Map(); // Oda timer'ları
const searchTimers = new Map(); // Eşleşme timer'ları

// Elo hesaplama fonksiyonu (Elo rating sistemi)
function calculateEloChange(winnerElo, loserElo, isRankedMatch = true) {
    if (!isRankedMatch) return { winnerChange: 0, loserChange: 0 };
    
    // Kazanan için 12-20 arası puan (rastgele)
    const winnerChange = Math.floor(12 + Math.random() * 9);
    // Kaybeden için -12-20 arası puan (rastgele)
    const loserChange = -Math.floor(12 + Math.random() * 9);
    
    return { winnerChange, loserChange };
}

// Seviye hesaplama fonksiyonu
function calculateLevel(elo) {
    // 100 puanda bir seviye atlama
    const level = Math.floor(elo / 100) + 1;
    return Math.min(10, Math.max(1, level)); // Minimum 1, maksimum 10
}

// Seviye ikonu belirleme
function getLevelIcon(level) {
    // SVG icon path'leri level'a göre
    if (level >= 1 && level <= 3) {
        return 'bronze'; // Bronz
    } else if (level >= 4 && level <= 6) {
        return 'silver'; // Gümüş
    } else if (level >= 7 && level <= 9) {
        return 'gold'; // Altın
    } else if (level === 10) {
        return 'diamond'; // Elmas (Maksimum seviye)
    }
    return 'bronze';
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
        
        // Yeni elo puanını hesapla
        const newElo = currentUser.elo + eloChange;
        const newLevel = calculateLevel(newElo);
        
        // Veritabanını güncelle
        const result = await usersCollection.updateOne(
            { userId: userId },
            { 
                $inc: { elo: eloChange },
                $set: { 
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
            
            // Güncellenmiş kullanıcı bilgilerini gönder
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
                    
                    console.log(`📊 Elo güncellendi: ${updatedUser.userName} - ${eloChange} puan (Yeni Elo: ${updatedUser.elo}, Level: ${updatedUser.level})`);
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
        
        return leaderboard.map((user, index) => ({
            rank: index + 1,
            userId: user.userId,
            userName: user.userName,
            elo: user.elo,
            level: user.level,
            levelIcon: getLevelIcon(user.level),
            wins: user.wins,
            losses: user.losses
        }));
    } catch (error) {
        console.error('Liderlik tablosu alınırken hata:', error);
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

console.log('🚀 Server Başladılır / Connect Server..');

// MongoDB bağlantısını başlat
async function connectToDatabase() {
    try {
        await client.connect();
        console.log('✅ MongoDB bağlantısı başarılı');
        db = client.db('checkers_db');
        usersCollection = db.collection('users');
        leaderboardCollection = db.collection('leaderboard');
        
        // Index'leri oluştur
        await usersCollection.createIndex({ userId: 1 }, { unique: true });
        await usersCollection.createIndex({ elo: -1 });
        await usersCollection.createIndex({ lastLoginAt: 1 });
        
        // Eski hesapları temizle (1 aydan fazla giriş yapmamış)
        await cleanupInactiveUsers();
        
        // Her gün eski hesapları temizle
        setInterval(cleanupInactiveUsers, 24 * 60 * 60 * 1000); // 24 saat
    } catch (error) {
        console.error('❌ MongoDB bağlantı hatası:', error);
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

    // Dereceli oyun arama
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

        // Oyuncu bilgilerini sakla (fotoğraf dahil)
        const playerData = {
            userId: data.userId,
            userName: data.userName,
            userPhotoUrl: data.userPhotoUrl || null,
            userLevel: data.userLevel || 1,
            userElo: data.userElo || 0
        };

        if (waitingPlayers.size > 0) {
            const [opponentSocketId, opponentData] = Array.from(waitingPlayers.entries())[0];
            const opponentSocket = io.sockets.sockets.get(opponentSocketId);
            
            // Aynı Telegram ID ile eşleşmeyi engelle
            if (opponentSocketId === socket.id || data.userId === opponentData.userId) {
                console.log('⚠️ Aynı kullanıcı ile eşleşme engellendi:', data.userName, 'vs', opponentData.userName);
                // Her iki kaydı da temizle
                waitingPlayers.delete(opponentSocketId);
                waitingPlayers.delete(socket.id);
                waitingPlayers.set(socket.id, playerData);
                startSearchTimer(socket.id);
                return;
            }
            
            if (opponentSocket) {
                // Eşleşme bulundu - timer'ları durdur
                stopSearchTimer(socket.id);
                stopSearchTimer(opponentSocketId);
                
                // Her iki oyuncuyu da bekleme listesinden çıkar
                waitingPlayers.delete(socket.id);
                waitingPlayers.delete(opponentSocketId);
                
                const roomCode = generateRoomCode();
                
                rooms.set(roomCode, {
                    players: [
                        { 
                            socketId: socket.id, 
                            userId: data.userId, 
                            userName: data.userName, 
                            userPhotoUrl: data.userPhotoUrl || null, // Doğru resmi kullan
                            userLevel: data.userLevel || 1,
                            userElo: data.userElo || 0
                        },
                        { 
                            socketId: opponentSocketId, 
                            userId: opponentData.userId, 
                            userName: opponentData.userName, 
                            userPhotoUrl: opponentData.userPhotoUrl || null, // Doğru resmi kullan
                            userLevel: opponentData.userLevel || 1,
                            userElo: opponentData.userElo || 0
                        }
                    ],
                    board: null,
                    currentPlayer: 'white',
                    isPrivate: false,
                    createdAt: Date.now()
                });
                
                // Timer başlat
                startRoomTimer(roomCode);

                socket.join(roomCode);
                opponentSocket.join(roomCode);

                socket.emit('matchFound', {
                    roomCode: roomCode,
                    playerColor: 'white',
                    opponentName: opponentData.userName,
                    opponentPhotoUrl: opponentData.userPhotoUrl || null, // Rakibin resmi
                    opponentLevel: opponentData.userLevel || 1,
                    opponentElo: opponentData.userElo || 0
                });
                
                opponentSocket.emit('matchFound', {
                    roomCode: roomCode,
                    playerColor: 'black',
                    opponentName: data.userName,
                    opponentPhotoUrl: data.userPhotoUrl || null, // Rakibin resmi
                    opponentLevel: data.userLevel || 1,
                    opponentElo: data.userElo || 0
                });

                console.log('🎮 Eşleşme:', roomCode, '-', data.userName, 'vs', opponentData.userName);
            } else {
                waitingPlayers.delete(opponentSocketId);
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

    // Özel oda oluştur
    socket.on('createRoom', (data) => {
        const roomCode = generateRoomCode();
        
        rooms.set(roomCode, {
            players: [
                { 
                    socketId: socket.id, 
                    userId: data.userId, 
                    userName: data.userName,
                    userPhotoUrl: data.userPhotoUrl // Doğru resmi kullan
                }
            ],
            board: null,
            currentPlayer: 'white',
            isPrivate: true,
            createdAt: Date.now()
        });
        
        // Timer başlat (2 oyuncu olduğunda başlatılacak)

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
            userPhotoUrl: data.userPhotoUrl || null // Doğru resmi kullan
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
                opponentPhotoUrl: player2.userPhotoUrl || null // Rakibin resmi
            });
        }
        
        if (player2Socket) {
            player2Socket.emit('roomJoined', {
                roomCode: data.roomCode,
                playerColor: 'black',
                opponentName: player1.userName,
                opponentPhotoUrl: player1.userPhotoUrl || null // Rakibin resmi
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
                        opponentName: opponent ? opponent.userName : 'Rakip',
                        opponentPhotoUrl: opponent ? opponent.userPhotoUrl : null // Rakibin resmi
                    });
                }
            });
            
            // Timer başlat
            startRoomTimer(data.roomCode);
            
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
            // Timer'ı sıfırla ve yeniden başlat
            resetRoomTimer(data.roomCode);
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
            stopRoomTimer(data.roomCode);
            const winner = whitePieces.length > 0 ? 'white' : 'black';
            
            // Oyuncuların bekleme listesinde olup olmadığını kontrol et ve temizle
            room.players.forEach(player => {
                if (waitingPlayers.has(player.socketId)) {
                    stopSearchTimer(player.socketId);
                    waitingPlayers.delete(player.socketId);
                    console.log('🧹 Oyuncu bekleme listesinden temizlendi:', player.userName);
                }
            });
            
            io.to(data.roomCode).emit('gameOver', { winner: winner });
            console.log('🏆 Oyun bitti (taş bitti):', data.roomCode, '- Kazanan:', winner);
            
            // Elo puanlarını güncelle (sadece dereceli maçlarda)
            if (!room.isPrivate) {
                updateEloForGameEnd(room, winner);
            }
            
            // Odayı hemen sil (bekleme yapma)
            rooms.delete(data.roomCode);
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
            stopRoomTimer(data.roomCode);
            const winner = room.currentPlayer === 'white' ? 'black' : 'white';
            
            // Oyuncuların bekleme listesinde olup olmadığını kontrol et ve temizle
            room.players.forEach(player => {
                if (waitingPlayers.has(player.socketId)) {
                    stopSearchTimer(player.socketId);
                    waitingPlayers.delete(player.socketId);
                    console.log('🧹 Oyuncu bekleme listesinden temizlendi:', player.userName);
                }
            });
            
            io.to(data.roomCode).emit('gameOver', { winner: winner });
            console.log('🏆 Oyun bitti (hamle yok):', data.roomCode, '- Kazanan:', winner);
            
            // Elo puanlarını güncelle (sadece dereceli maçlarda)
            if (!room.isPrivate) {
                updateEloForGameEnd(room, winner);
            }
            
            // Odayı hemen sil (bekleme yapma)
            rooms.delete(data.roomCode);
        }
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

    // Oyun terk etme durumunda elo güncelleme
    async function updateEloForGameAbandon(room, abandonerUserId) {
        try {
            // Sadece dereceli maçlarda elo güncelle
            if (room.isPrivate) return;
            
            // Oyundan çıkan oyuncuya -20 puan, diğerine +20 puan
            await updateElo(abandonerUserId, -20, false);
            
            // Diğer oyuncuyu bul
            const otherPlayer = room.players.find(p => p.userId !== abandonerUserId);
            if (otherPlayer) {
                await updateElo(otherPlayer.userId, 20, true);
            }
            
            // Güncellenmiş liderlik tablosunu gönder
            const leaderboard = await getLeaderboard();
            io.emit('leaderboardUpdate', leaderboard);
            
            console.log(`Elo güncellendi - Oyundan çıkan: ${abandonerUserId} (-20), Diğer oyuncu: +20`);
        } catch (error) {
            console.error('Elo güncelleme hatası (oyun terk):', error);
        }
    }

    // Oyundan çıkma durumunda elo güncelleme
    async function updateEloForGameLeave(room, leaverUserId) {
        try {
            // Sadece dereceli maçlarda elo güncelle
            if (room.isPrivate) return;
            
            // Oyundan çıkan oyuncuya -10 puan, diğerine +10 puan
            const leaverSocket = Array.from(io.sockets.sockets.values()).find(s => {
                const user = users.get(s.id);
                return user && user.userId === leaverUserId;
            });
            
            // Diğer oyuncuyu bul
            const otherPlayer = room.players.find(p => p.userId !== leaverUserId);
            if (otherPlayer) {
                const otherSocket = io.sockets.sockets.get(otherPlayer.socketId);
                
                // Elo puanlarını güncelle
                await updateElo(leaverUserId, -10, false);
                await updateElo(otherPlayer.userId, 10, true);
                
                // Kalan oyuncuya bildirim gönder
                if (otherSocket) {
                    otherSocket.emit('opponentLeft', {
                        message: 'Rakip oyundan ayrıldı! Kazandınız! 🎉',
                        eloChange: 10
                    });
                }
                
                // Çıkan oyuncuya bildirim gönder (eğer hala bağlıysa)
                if (leaverSocket) {
                    leaverSocket.emit('opponentLeft', {
                        message: 'Oyundan ayrıldınız! Kaybettiniz 😔',
                        eloChange: -10
                    });
                }
            }
            
            // Güncellenmiş liderlik tablosunu gönder
            const leaderboard = await getLeaderboard();
            io.emit('leaderboardUpdate', leaderboard);
            
            console.log(`Elo güncellendi - Oyundan çıkan: ${leaverUserId} (-10), Diğer oyuncu: +10`);
        } catch (error) {
            console.error('Elo güncelleme hatası (oyundan çıkma):', error);
        }
    }

    // Odadan çık
    socket.on('leaveRoom', (data) => {
        const room = rooms.get(data.roomCode);
        if (room) {
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                room.players.splice(playerIndex, 1);
                
                // Bekleme listesinden de çıkar
                if (waitingPlayers.has(socket.id)) {
                    stopSearchTimer(socket.id);
                    waitingPlayers.delete(socket.id);
                    console.log('🧹 Oyuncu bekleme listesinden çıkarıldı:', player.userName);
                }
            }
            
            if (room.players.length === 0) {
                stopRoomTimer(data.roomCode);
                rooms.delete(data.roomCode);
                console.log('🗑️ Boş oda silindi:', data.roomCode);
            }
        }
    });

    // Bağlantı kesildi
    socket.on('disconnect', () => {
        console.log('❌ Bağlantı kesildi:', socket.id);
        
        // Bekleme listesinden çıkar
        if (waitingPlayers.has(socket.id)) {
            stopSearchTimer(socket.id);
            waitingPlayers.delete(socket.id);
            console.log('⏳ Bekleme listesinden çıkarıldı:', socket.id);
        }
        
        // Odadan çıkar
        for (const [roomCode, room] of rooms.entries()) {
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                room.players.splice(playerIndex, 1);
                
                // Diğer oyuncuya haber ver
                const remainingPlayer = room.players[0];
                if (remainingPlayer) {
                    const remainingSocket = io.sockets.sockets.get(remainingPlayer.socketId);
                    if (remainingSocket) {
                        remainingSocket.emit('opponentLeft');
                        remainingSocket.emit('error', { message: 'Rakip oyundan ayrıldı!' });
                        
                        // Eğer dereceli maç ise elo güncelle
                        if (!room.isPrivate) {
                            updateEloForGameLeave(room, player.userId);
                        }
                    }
                }
                
                // Odayı temizle
                stopRoomTimer(roomCode);
                rooms.delete(roomCode);
                console.log('🚪 Oyuncu odadan ayrıldı:', roomCode, '-', player.userName);
                break;
            }
        }
        
        // Kullanıcı listesinden çıkar
        const user = users.get(socket.id);
        if (user) {
            console.log('👤 Kullanıcı ayrıldı:', user.userName);
            users.delete(socket.id);
        }
    });

    // Liderlik tablosu isteği
    socket.on('getLeaderboard', async () => {
        try {
            const leaderboard = await getLeaderboard();
            socket.emit('leaderboardUpdate', leaderboard);
        } catch (error) {
            console.error('Liderlik tablosu gönderilirken hata:', error);
        }
    });

    // Kullanıcı sıralaması isteği
    socket.on('getUserRank', async (data) => {
        try {
            const userRank = await getUserRank(data.userId);
            if (userRank) {
                socket.emit('userRankUpdate', userRank);
            }
        } catch (error) {
            console.error('Kullanıcı sıralaması gönderilirken hata:', error);
        }
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
connectToDatabase().then(() => {
    http.listen(PORT, '0.0.0.0', () => {
        console.log('═══════════════════════════════════════');
        console.log('🚀 Sunucu çalışıyor!');
        console.log('📡 Port:', PORT);
        console.log('🌐 URL: http://localhost:' + PORT);
        console.log('🎮 Amerikan Daması Online hazır!');
        console.log('═══════════════════════════════════════');
    });
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
