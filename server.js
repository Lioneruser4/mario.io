// server.js
// Bağımlılıklar: npm install express socket.io
const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const PORT = process.env.PORT || 3000; 
const app = express();
const server = http.createServer(app);

// CORS ayarı her origin'den bağlantıya izin verir.
const io = socketio(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const users = {}; // Tüm kullanıcıların ID ve isimlerini tutar
let rankedQueue = []; // Dereceli arama kuyruğu
const games = {}; // Aktif oyun odaları

// --- DAMA MANTIĞI FONKSİYONLARI ---

/**
 * Yeni bir oyun tahtası oluşturur.
 * Tahta Kodları: 0=Boş, 1=Siyah Taş (P1), 2=Beyaz Taş (P2), 3=Siyah Kral, 4=Beyaz Kral
 */
function initializeBoard() {
    const board = Array(8).fill(0).map(() => Array(8).fill(0));
    // Beyaz (P2) - Üst 3 sıra
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
            // Türk daması tahtası tamamen kullanılır, renkli kare ayrımı yoktur.
            board[r][c] = 2; // Beyaz
        }
    }
    // Siyah (P1) - Alt 3 sıra
    for (let r = 5; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            board[r][c] = 1; // Siyah
        }
    }
    return board;
}

function generateRoomId() {
    let roomId;
    do {
        // 4 haneli rastgele kod
        roomId = Math.floor(1000 + Math.random() * 9000).toString();
    } while (games[roomId]);
    return roomId;
}

function removeFromQueue(socketId) {
    const index = rankedQueue.indexOf(socketId);
    if (index > -1) {
        rankedQueue.splice(index, 1);
        if (users[socketId]) users[socketId].isSearching = false;
        return true;
    }
    return false;
}

function attemptMatchmaking() {
    // Sadece bağlı ve arayan oyuncuları işleme al
    rankedQueue = rankedQueue.filter(id => io.sockets.sockets.has(id));

    if (rankedQueue.length >= 2) {
        const player1Id = rankedQueue.shift(); 
        const player2Id = rankedQueue.shift(); 
        
        const player1 = users[player1Id];
        const player2 = users[player2Id];

        if (!player1 || !player2) {
             attemptMatchmaking(); 
             return;
        }

        player1.isSearching = false;
        player2.isSearching = false;
        
        const roomId = generateRoomId();

        // OYUN OLUŞTURMA
        games[roomId] = {
            roomId: roomId,
            player1Id: player1Id,
            player1Name: player1.username,
            player2Id: player2Id,
            player2Name: player2.username,
            board: initializeBoard(),
            turn: 'player1' // Siyah (P1) başlar
        };
        
        // Odalara katılım
        io.sockets.sockets.get(player1Id)?.join(roomId);
        io.sockets.sockets.get(player2Id)?.join(roomId);

        // İstemcilere rolleri bildir
        io.to(player1Id).emit('matchFound', { roomId: roomId, role: 'player1' });
        io.to(player2Id).emit('matchFound', { roomId: roomId, role: 'player2' });

        // Oyunu Başlat
        io.to(roomId).emit('gameStart', { 
            roomId: roomId,
            board: games[roomId].board, 
            turn: games[roomId].turn,
            player1Name: player1.username,
            player2Name: player2.username
        });

        attemptMatchmaking(); 
    } else {
         // Kuyrukta sadece bir kişi kaldıysa durumunu güncelle
         if(rankedQueue.length === 1 && users[rankedQueue[0]]) {
             io.to(rankedQueue[0]).emit('matchMakingStatus', `Eşleşme aranıyor... Kuyrukta: 1 kişi.`);
         }
    }
}

/**
 * Basit Dama Hamlesi Uygulama Fonksiyonu (Vurma Kuralları Hariç)
 * Taşın sadece 1 adım ileri/yana gitmesini sağlar.
 */
function applyMove(game, from, to) {
    const board = game.board;
    const pieceType = board[from.row][from.col];
    const isPlayer1Piece = pieceType === 1 || pieceType === 3; // Siyah (P1)
    
    // 1. Sıra kontrolü
    if (game.turn === 'player1' && !isPlayer1Piece) return { success: false, message: 'Sıra Siyah taşlarda.' };
    if (game.turn === 'player2' && isPlayer1Piece) return { success: false, message: 'Sıra Beyaz taşlarda.' };
    
    // 2. Hedef kare boş olmalı
    if (board[to.row][to.col] !== 0) return { success: false, message: 'Hedef kare dolu.' };

    // 3. Mesafe Kontrolü (Sadece 1 adım dikey veya yatay)
    const dRow = Math.abs(from.row - to.row);
    const dCol = Math.abs(from.col - to.col);

    if ((dRow + dCol !== 1) || (dRow > 1) || (dCol > 1)) {
        return { success: false, message: 'Taş sadece komşu (1 adım) kareye gidebilir.' };
    }
    
    // 4. İlerileme Yönü Kontrolü (Normal taşlar geri gidemez)
    if (pieceType === 1) { // Normal Siyah taş (Aşağı doğru gitmeli)
        if (to.row < from.row) return { success: false, message: 'Siyah normal taşlar geri gidemez.' };
    }
    if (pieceType === 2) { // Normal Beyaz taş (Yukarı doğru gitmeli)
        if (to.row > from.row) return { success: false, message: 'Beyaz normal taşlar geri gidemez.' };
    }
    // Kral taşlar (3 ve 4) her yöne gidebilir.

    // --- Hamle Geçerli: Uygula ---
    
    // Taşı yeni konuma taşı
    board[to.row][to.col] = pieceType;
    board[from.row][from.col] = 0;

    // Kral Olma Kontrolü
    if (pieceType === 1 && to.row === 0) board[to.row][to.col] = 3; // Siyah Kral (Üst sıra)
    if (pieceType === 2 && to.row === 7) board[to.row][to.col] = 4; // Beyaz Kral (Alt sıra)
    
    // Sırayı değiştir
    game.turn = game.turn === 'player1' ? 'player2' : 'player1';

    return { success: true, board: board, turn: game.turn, chained: false };
}

// Oyun Sonu Kontrolü (Basit simülasyon için boş bırakıldı)
function checkWinCondition(board, nextTurn) { return null; }


// --- SOCKET.IO BAĞLANTILARI ---

io.on('connection', (socket) => {
    // Kullanıcı Kimliği Tanımlama
    socket.on('playerIdentity', (data) => {
        const { username } = data;
        users[socket.id] = { username: username, isSearching: false };
        socket.emit('readyToPlay');
    });

    // Dereceli Arama Başlat
    socket.on('findRankedMatch', () => {
        const user = users[socket.id];
        if (!user || user.isSearching || rankedQueue.includes(socket.id)) return;
        
        user.isSearching = true;
        rankedQueue.push(socket.id);
        socket.emit('matchMakingStatus', `Eşleşme aranıyor... Kuyrukta: ${rankedQueue.length} kişi.`);

        attemptMatchmaking(); 
    });

    // Dereceli Arama İptali
    socket.on('cancelMatchmaking', () => {
        const removed = removeFromQueue(socket.id);
        if (removed) {
            socket.emit('matchMakingCancelled', 'Eşleşme araması iptal edildi.');
            attemptMatchmaking();
        } 
    });

    // Oda Kurma
    socket.on('createGame', (callback) => {
        const user = users[socket.id];
        if (!user) return callback({ success: false, message: 'Kimlik yüklenmedi.' });

        removeFromQueue(socket.id);
        const roomId = generateRoomId();
        
        const game = {
            roomId: roomId,
            player1Id: socket.id,
            player1Name: user.username,
            player2Id: null,
            player2Name: null,
            board: initializeBoard(),
            turn: 'player1'
        };
        games[roomId] = game;
        socket.join(roomId);
        
        callback({ success: true, roomId: roomId, role: 'player1' }); 
    });

    // Odaya Katılma
    socket.on('joinGame', (data, callback) => {
        const { roomId } = data;
        const user = users[socket.id];
        const game = games[roomId];

        if (!user) {
            return callback({ success: false, message: 'Kimlik yüklenmedi.' });
        }

        if (!game) {
            return callback({ success: false, message: 'Oda bulunamadı.' });
        }
        
        if (game.player2Id) {
             return callback({ success: false, message: 'Oda dolu.' });
        }

        removeFromQueue(socket.id);
        game.player2Id = socket.id;
        game.player2Name = user.username;
        socket.join(roomId);
        callback({ success: true, roomId: roomId, role: 'player2' });

        // Oyunu başlat
        io.to(roomId).emit('gameStart', { 
            roomId: roomId,
            board: game.board, 
            turn: game.turn,
            player1Name: game.player1Name,
            player2Name: game.player2Name
        });
    });

    // Hamle Yapma (Taş hareketinin gerçekleştiği yer)
    socket.on('move', (data) => {
        const game = games[data.roomId];
        if (!game) return socket.emit('invalidMove', { message: 'Oyun bulunamadı.' });

        // Sıra kontrolü
        const isMyTurn = (game.turn === 'player1' && game.player1Id === socket.id) ||
                         (game.turn === 'player2' && game.player2Id === socket.id);
        
        if (!isMyTurn) return socket.emit('invalidMove', { message: 'Sıra sizde değil.' });

        // Hamleyi uygula (Basit Dama Mantığı)
        const result = applyMove(game, data.from, data.to);

        if (result.success) {
            // Tahtayı iki tarafa da gönder
            io.to(data.roomId).emit('boardUpdate', { 
                board: result.board, 
                turn: result.turn, 
                chained: result.chained 
            });
            // Oyun sonu kontrolü burada yapılabilir.
        } else {
            // Geçersiz Hamle Bildirimi
            socket.emit('invalidMove', { message: result.message });
        }
    });

    // Oyuncu Oyunu Terk Etti (Ayrıl Butonu)
    socket.on('leaveGame', (data) => {
        const { roomId } = data;
        const game = games[roomId];

        if (game) {
            const isPlayer1 = game.player1Id === socket.id;
            const opponentId = isPlayer1 ? game.player2Id : game.player1Id;

            // Rakibe bilgi ver (Eğer bağlıysa)
            if (opponentId && io.sockets.sockets.get(opponentId)) {
                io.to(opponentId).emit('opponentDisconnected', 'Rakibiniz oyundan ayrıldı, kazandınız!');
            }

            // Odayı sil
            delete games[roomId];
            
            // Oyuncuya lobiye dönme sinyali gönder
            socket.emit('gameLeft');
        } else {
             socket.emit('gameLeft');
        }
    });

    // Bağlantı Kesilmesi (Genel Disconnect)
    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            removeFromQueue(socket.id);
            // Oyunu bul ve rakibe haber ver
            for (const roomId in games) {
                if (games[roomId].player1Id === socket.id || games[roomId].player2Id === socket.id) {
                    const game = games[roomId];
                    const opponentId = game.player1Id === socket.id ? game.player2Id : game.player1Id;
                    
                    if (opponentId && io.sockets.sockets.get(opponentId)) {
                        io.to(opponentId).emit('opponentDisconnected', 'Rakibiniz bağlantıyı kesti, kazandınız!');
                    }
                    delete games[roomId]; 
                    break;
                }
            }
            delete users[socket.id];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
