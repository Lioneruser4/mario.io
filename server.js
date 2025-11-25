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
    
    const winnerLevel = calculateLevel(winnerElo);
    let winnerChange, loserChange;
    
    if (winnerLevel >= 5) {
        // 5+ level için daha az puan
        winnerChange = Math.floor(10 + Math.random() * 4); // 10-13 arası
        loserChange = -Math.floor(13 + Math.random() * 3); // 13-15 arası
    } else {
        // 1-4 level için normal puan
        winnerChange = Math.floor(12 + Math.random() * 9); // 12-20 arası
        loserChange = -Math.floor(12 + Math.random() * 9); // 12-20 arası
    }
    
    return { winnerChange, loserChange };
}

// Seviye hesaplama fonksiyonu
function calculateLevel(elo) {
    // 100 puanda bir seviye atlama
    const level = Math.floor(elo / 100) + 1;
    return level;
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

console.log('🚀 Server Başladılır / Connect Server..');

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

    // Son eşleşme bilgilerini takip et (kaldırıldı - FIFO sistemi)
    // const lastMatches = new Map();

    // Eski eşleşmeleri temizle (kaldırıldı - FIFO sistemi)
    // setInterval(() => {
    //     const oneHourAgo = Date.now() - (60 * 60 * 1000);
    //     let cleanedCount = 0;
    //     
    //     for (const [key, timestamp] of lastMatches.entries()) {
    //         if (timestamp < oneHourAgo) {
    //             lastMatches.delete(key);
    //             cleanedCount++;
    //         }
    //     }
    //     
    //     if (cleanedCount > 0) {
    //         console.log('🧹 Eski eşleşmeler temizlendi:', cleanedCount, 'adet');
    //     }
    // }, 5 * 60 * 1000); // Her 5 dakikada bir kontrol et

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
            userElo: data.userElo || 0,
            searchStartTime: Date.now() // Arama başlangıç zamanı
        };

        if (waitingPlayers.size > 0) {
            // İlk bekleyen oyuncuyu al (FIFO - First In First Out)
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
                
                // İlk arayan oyuncu beyaz oynar, ikinci arayan siyah oynar
                const firstPlayer = waitingData.searchStartTime < playerData.searchStartTime ? waitingData : playerData;
                const secondPlayer = waitingData.searchStartTime < playerData.searchStartTime ? playerData : waitingData;
                const firstSocket = waitingData.searchStartTime < playerData.searchStartTime ? opponentSocket : socket;
                const secondSocket = waitingData.searchStartTime < playerData.searchStartTime ? socket : opponentSocket;
                
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
                    currentPlayer: 'white', // Beyaz her zaman başlar
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
                    opponentElo: secondPlayer.userElo || 0,
                    opponentUserId: secondPlayer.userId
                });
                
                // İkinci arayan oyuncuya (siyah) bilgi gönder
                secondSocket.emit('matchFound', {
                    roomCode: roomCode,
                    playerColor: 'black',
                    opponentName: firstPlayer.userName,
                    opponentPhotoUrl: firstPlayer.userPhotoUrl || null,
                    opponentLevel: firstPlayer.userLevel || 1,
                    opponentElo: firstPlayer.userElo || 0,
                    opponentUserId: firstPlayer.userId
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
                    userPhotoUrl: data.userPhotoUrl || null, // Doğru resmi kullan
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
        console.log('📤 Oda kodu client\'a gönderildi:', roomCode);
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
            userPhotoUrl: data.userPhotoUrl || null, // Doğru resmi kullan
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
                opponentPhotoUrl: player2.userPhotoUrl || null, // Rakibin resmi
                opponentUserId: player2.userId
            });
        }
        
        if (player2Socket) {
            player2Socket.emit('roomJoined', {
                roomCode: data.roomCode,
                playerColor: 'black',
                opponentName: player1.userName,
                opponentPhotoUrl: player1.userPhotoUrl || null, // Rakibin resmi
                opponentUserId: player1.userId
            });
        }
        
        // Oyun başlatma kodunu KALDIR - sadece gameReady ile başlayacak
        console.log(`👥 İkinci oyuncu katıldı: ${player2.userName} - Oda: ${data.roomCode}`);
    });

    // Hamle yap
    socket.on('makeMove', (data) => {
        const room = rooms.get(data.roomCode);
        if (!room) {
            socket.emit('error', { message: 'Oda bulunamadı!' });
            return;
        }
        
        // Oyuncu bul
        const player = room.players.find(p => p.socketId === socket.id);
        if (!player) {
            socket.emit('error', { message: 'Oyuncu bulunamadı!' });
            return;
        }
        
        // Sıra kontrolü
        if (room.currentPlayer !== player.playerColor) {
            socket.emit('error', { message: 'Sıra sizde değil!' });
            return;
        }
        
        // Hamle geçerliliğini kontrol et
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
        if (!piece || piece.color !== player.playerColor) {
            socket.emit('error', { message: 'Geçersiz taş!' });
            return;
        }

        // Hamleyi uygula
        room.board = data.board;
        
        // Çoklu yeme kontrolü
        const moveData = validMoves.find(m => m.row === data.to.row && m.col === data.to.col);
        const canContinueCapture = moveData && moveData.canContinueCapture;
        
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
        
        // Oyunu kontrol et
        checkGameEnd(data.roomCode);
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

    // Oyundan çık
    socket.on('leaveGame', (data) => {
        const userId = users.get(socket.id)?.userId;
        
        // Bekleme listesinden çıkar
        if (waitingPlayers.has(socket.id)) {
            stopSearchTimer(socket.id);
            waitingPlayers.delete(socket.id);
            console.log('⏳ Oyuncu bekleme listesinden çıkarıldı:', socket.id);
        }
        
        // Oyuncunun son eşleşmelerini ANINDA temizle (çıkış yaparken cache tutma)
        if (userId) {
            // Bu userId ile ilgili tüm son eşleşmeleri hemen temizle
            for (const [key, timestamp] of lastMatches.entries()) {
                if (key.includes(userId)) {
                    lastMatches.delete(key);
                    console.log('🧹 Son eşleşmeler ANINDA temizlendi (çıkış):', userId);
                }
            }
        }
        
        const room = rooms.get(data.roomCode);
        if (room) {
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                
                // Diğer oyuncuya haber ver
                const remainingPlayer = room.players.find(p => p.socketId !== socket.id);
                if (remainingPlayer) {
                    const remainingSocket = io.sockets.sockets.get(remainingPlayer.socketId);
                    if (remainingSocket) {
                        remainingSocket.emit('opponentLeft', {
                            message: 'Rakip oyundan ayrıldı! Kazandınız! 🎉',
                            eloChange: 10
                        });
                    }
                }
                
                // Oyuncuyu odadan çıkar
                room.players.splice(playerIndex, 1);
                
                // Elo güncelle (sadece dereceli maçlarda)
                if (!room.isPrivate) {
                    updateEloForGameLeave(room, data.userId);
                }
                
                // Odayı temizle
                stopRoomTimer(data.roomCode);
                rooms.delete(data.roomCode);
                console.log('🚪 Oyuncu oyundan çıktı:', data.roomCode, '-', player.userName);
            }
        }
    });

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
    const userId = users.get(socket.id)?.userId;
        
    // Bekleme listesinden çıkar (önce kontrol et)
    if (waitingPlayers.has(socket.id)) {
        stopSearchTimer(socket.id);
        waitingPlayers.delete(socket.id);
        console.log('⏳ Bekleme listesinden çıkarıldı:', socket.id, 'Kalan:', waitingPlayers.size);
    }
        
    // Çıkış yapan oyuncunun son eşleşmelerini ANINDA temizle
    if (userId) {
        for (const [key, timestamp] of lastMatches.entries()) {
            if (key.includes(userId)) {
                lastMatches.delete(key);
                console.log('🧹 Son eşleşmeler ANINDA temizlendi (disconnect):', userId);
            }
        }
    }
        
    // Odadan çıkar ve diğer oyuncuyu serbest bırak
    for (const [roomCode, room] of rooms.entries()) {
        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex !== -1) {
            const player = room.players[playerIndex];
            room.players.splice(playerIndex, 1);
            
            // Kalan oyuncu varsa onu bekleme listesine ekle ve odayı sil
            const remainingPlayer = room.players[0];
            if (remainingPlayer) {
                const remainingSocket = io.sockets.sockets.get(remainingPlayer.socketId);
                if (remainingSocket) {
                    remainingSocket.emit('opponentLeft');
                    remainingSocket.emit('error', { message: 'Rakip oyundan ayrıldı!' });
                    
                    // Oyuncuyu tekrar bekleme listesine al
                    if (!waitingPlayers.has(remainingPlayer.socketId)) {
                        waitingPlayers.set(remainingPlayer.socketId, {
                            socketId: remainingPlayer.socketId,
                            userId: remainingPlayer.userId,
                            userName: remainingPlayer.userName,
                            userPhotoUrl: remainingPlayer.userPhotoUrl,
                            userLevel: remainingPlayer.userLevel,
                            userElo: remainingPlayer.userElo,
                            startTime: Date.now()
                        });
                        console.log('🔄 Oyuncu tekrar bekleme listesine alındı:', remainingPlayer.userName);
                    }
                }
            }
            
            stopRoomTimer(roomCode);
            rooms.delete(roomCode);
            console.log('🗑️ Oda silindi:', roomCode, '-', player.userName);
            break;
        }
    }
    
    users.delete(socket.id);
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

    // Admin olayları
    socket.on('adminGetUsers', async () => {
        try {
            const allUsers = await usersCollection.find({}).sort({ elo: -1 }).toArray();
            socket.emit('adminUsers', allUsers);
        } catch (error) {
            socket.emit('adminResponse', { message: 'Kullanıcılar alınamadı: ' + error.message, type: 'error' });
        }
    });

    socket.on('adminGetRooms', () => {
        try {
            const roomData = [];
            
            // Aktif odaları ekle
            rooms.forEach((room, roomCode) => {
                roomData.push({
                    code: roomCode,
                    type: 'Aktif Oda',
                    players: room.players.map(p => p.userName).join(', '),
                    gameStarted: room.gameStarted,
                    isPrivate: room.isPrivate
                });
            });
            
            // Bekleyen oyuncuları ekle
            waitingPlayers.forEach((player, socketId) => {
                roomData.push({
                    code: 'WAITING',
                    type: 'Bekleyen Oyuncu',
                    players: player.userName,
                    gameStarted: false,
                    isPrivate: false
                });
            });
            
            socket.emit('adminRooms', roomData);
        } catch (error) {
            socket.emit('adminResponse', { message: 'Odalar alınamadı: ' + error.message, type: 'error' });
        }
    });

    socket.on('adminUserAction', async (data) => {
        try {
            const { userId, action, amount } = data;
            const user = await usersCollection.findOne({ userId });
            
            if (!user) {
                socket.emit('adminResponse', { message: 'Kullanıcı bulunamadı!', type: 'error' });
                return;
            }

            let message = '';
            let refresh = false;

            switch (action) {
                case 'giveElo':
                case 'giveElo500':
                case 'giveElo1000':
                    const newElo = user.elo + amount;
                    await usersCollection.updateOne(
                        { userId },
                        { 
                            $set: { 
                                elo: newElo,
                                level: calculateLevel(newElo)
                            }
                        }
                    );
                    message = `${user.userName} kullanıcısına ${amount} elo verildi!`;
                    refresh = true;
                    break;

                case 'takeElo':
                    const reducedElo = Math.max(0, user.elo - amount);
                    await usersCollection.updateOne(
                        { userId },
                        { 
                            $set: { 
                                elo: reducedElo,
                                level: calculateLevel(reducedElo)
                            }
                        }
                    );
                    message = `${user.userName} kullanıcısından ${amount} elo alındı!`;
                    refresh = true;
                    break;

                case 'deleteUser':
                    await usersCollection.deleteOne({ userId });
                    message = `${user.userName} kullanıcısı silindi!`;
                    refresh = true;
                    break;

                case 'resetUser':
                    await usersCollection.updateOne(
                        { userId },
                        { 
                            $set: { 
                                elo: 0,
                                level: 1,
                                wins: 0,
                                losses: 0,
                                gamesPlayed: 0
                            }
                        }
                    );
                    message = `${user.userName} kullanıcısı sıfırlandı!`;
                    refresh = true;
                    break;
            }

            socket.emit('adminResponse', { message, type: 'success', refresh });
        } catch (error) {
            socket.emit('adminResponse', { message: 'İşlem hatası: ' + error.message, type: 'error' });
        }
    });

    socket.on('adminResetAllElo', async () => {
        try {
            await usersCollection.updateMany(
                {},
                { 
                    $set: { 
                        elo: 0,
                        level: 1,
                        wins: 0,
                        losses: 0,
                        gamesPlayed: 0
                    }
                }
            );
            
            // Tüm kullanıcılara bildirim gönder
            io.emit('adminNotification', { 
                message: '🔄 Tüm elo puanları admin tarafından sıfırlandı!', 
                type: 'warning' 
            });
            
            socket.emit('adminResponse', { message: 'Tüm elo puanları sıfırlandı!', type: 'success', refresh: true });
        } catch (error) {
            socket.emit('adminResponse', { message: 'Sıfırlama hatası: ' + error.message, type: 'error' });
        }
    });

    socket.on('adminResetLeaderboard', async () => {
        try {
            await leaderboardCollection.deleteMany({});
            socket.emit('adminResponse', { message: 'Liderlik tablosu temizlendi!', type: 'success' });
        } catch (error) {
            socket.emit('adminResponse', { message: 'Temizleme hatası: ' + error.message, type: 'error' });
        }
    });

    socket.on('adminKickAll', () => {
        // Tüm kullanıcıları at
        io.emit('adminNotification', { 
            message: '👟 Admin tarafından tüm kullanıcılar atıldı!', 
            type: 'warning' 
        });
        
        // Tüm bağlantıları kes
        io.sockets.sockets.forEach(socket => {
            socket.disconnect();
        });
        
        socket.emit('adminResponse', { message: 'Tüm kullanıcılar atıldı!', type: 'success' });
    });

    socket.on('adminBackup', async () => {
        try {
            const users = await usersCollection.find({}).toArray();
            const backupData = {
                timestamp: new Date(),
                users: users,
                stats: {
                    totalUsers: users.length,
                    activeRooms: rooms.size,
                    waitingPlayers: waitingPlayers.size
                }
            };
            
            // Burada backup'ı dosyaya yazabilir veya başka bir yere kaydedebilirsiniz
            socket.emit('adminResponse', { 
                message: `Yedek oluşturuldu! ${backupData.users.length} kullanıcı`, 
                type: 'success' 
            });
        } catch (error) {
            socket.emit('adminResponse', { message: 'Yedekleme hatası: ' + error.message, type: 'error' });
        }
    });

    socket.on('adminCloseRoom', (data) => {
        const { roomCode } = data;
        const room = rooms.get(roomCode);
        
        if (room) {
            // Odadaki oyunculara haber ver
            io.to(roomCode).emit('adminNotification', { 
                message: '🏠 Oda admin tarafından kapatıldı!', 
                type: 'warning' 
            });
            
            // Odayı kapat
            stopRoomTimer(roomCode);
            rooms.delete(roomCode);
            
            socket.emit('adminResponse', { message: `Oda ${roomCode} kapatıldı!`, type: 'success' });
        } else {
            socket.emit('adminResponse', { message: 'Oda bulunamadı!', type: 'error' });
        }
    });

    socket.on('adminClearAllRooms', () => {
        // Tüm odaları temizle
        rooms.forEach((room, roomCode) => {
            stopRoomTimer(roomCode);
            io.to(roomCode).emit('adminNotification', { 
                message: '🏠 Tüm odalar admin tarafından temizlendi!', 
                type: 'warning' 
            });
        });
        
        rooms.clear();
        socket.emit('adminResponse', { message: 'Tüm odalar temizlendi!', type: 'success' });
    });

    socket.on('adminNotification', (data) => {
        // Tüm kullanıcılara bildirim gönder
        io.emit('adminNotification', data);
        socket.emit('adminResponse', { message: 'Bildirim gönderildi!', type: 'success' });
    });

});

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Admin paneli route
app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/admin.html');
});

// Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Sunucu durumu endpoint'i
app.get('/status', (req, res) => {
    res.json({
        activeRooms: rooms.size,
        waitingPlayers: waitingPlayers.size
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
