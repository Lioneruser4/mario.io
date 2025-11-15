// Sunucu Bağımlılıkları: npm install express socket.io
const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const PORT = process.env.PORT || 3000; 

const app = express();
const server = http.createServer(app);

// CORS Ayarı
const io = socketio(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// KULLANICI VE OYUN DEĞİŞKENLERİ
const users = {}; 
let rankedQueue = []; 
const games = {}; 

// --- DAMA MANTIĞI FONKSİYONLARI (DÜZELTİLDİ) ---

function initializeBoard() {
    const board = Array(8).fill(0).map(() => Array(8).fill(0));
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 !== 0) board[r][c] = 2; // Beyaz (P2)
        }
    }
    for (let r = 5; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 !== 0) board[r][c] = 1; // Siyah (P1)
        }
    }
    return board;
}

function generateRoomId() {
    let roomId;
    do {
        roomId = Math.floor(1000 + Math.random() * 9000).toString();
    } while (games[roomId]);
    return roomId;
}

// Hamleleri kontrol eden temel fonksiyon (Zorunlu vurmayı da bulur)
function getValidMoves(board, r, c, player) {
    const moves = [];
    const pieceType = board[r][c];
    const isKing = pieceType === 3 || pieceType === 4;
    const opponentPieces = player === 1 ? [2, 4] : [1, 3];
    
    let directions = [];
    if (isKing) {
        directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]]; 
    } else if (player === 1) {
        directions = [[-1, -1], [-1, 1]]; // Siyah (1): Yukarı
    } else {
        directions = [[1, -1], [1, 1]]; // Beyaz (2): Aşağı
    }

    directions.forEach(([dr, dc]) => {
        const tr = r + dr; 
        const tc = c + dc; 

        if (tr < 0 || tr >= 8 || tc < 0 || tc >= 8) return;

        // Normal Hamle (Sadece boş kareye)
        if (board[tr][tc] === 0) {
            moves.push({ to: { r: tr, c: tc }, jumped: null });
        } 
        
        // Vurma (Zıplama)
        else if (opponentPieces.includes(board[tr][tc])) {
            const tr2 = r + 2 * dr; 
            const tc2 = c + 2 * dc; 
            
            if (tr2 >= 0 && tr2 < 8 && tc2 >= 0 && tc2 < 8 && board[tr2][tc2] === 0) {
                moves.push({ to: { r: tr2, c: tc2 }, jumped: { r: tr, c: tc } });
            }
        }
    });
    return moves;
}

// Zorunlu vurma hamlelerini bulur
function getForcedJumps(board, player) {
    const forcedJumps = [];
    const playerPieces = player === 1 ? [1, 3] : [2, 4];
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (playerPieces.includes(board[r][c])) {
                const moves = getValidMoves(board, r, c, player);
                const jumps = moves.filter(m => m.jumped !== null);
                
                if (jumps.length > 0) {
                    forcedJumps.push({ from: { r, c }, jumps });
                }
            }
        }
    }
    return forcedJumps;
}

// Kazanma koşulunu kontrol eder
function checkWinCondition(board, nextTurn) {
    const nextPlayer = nextTurn === 'player1' ? 1 : 2;
    const nextPlayerPieces = nextPlayer === 1 ? [1, 3] : [2, 4];

    let nextPlayerHasPieces = false;
    let nextPlayerHasMoves = false;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (nextPlayerPieces.includes(board[r][c])) {
                nextPlayerHasPieces = true;
                if (getValidMoves(board, r, c, nextPlayer).length > 0) {
                    nextPlayerHasMoves = true;
                    break;
                }
            }
        }
        if (nextPlayerHasMoves) break;
    }

    if (!nextPlayerHasPieces || !nextPlayerHasMoves) {
        // Sonraki oyuncunun (nextTurn) taşı veya hamlesi yoksa, önceki oyuncu kazanır
        return nextTurn === 'player1' ? 'player2' : 'player1'; 
    }

    return null; // Oyun devam ediyor
}

// Hamleyi uygular
function applyMove(game, from, to) {
    const { board, turn } = game;
    const player = turn === 'player1' ? 1 : 2;
    const pieceType = board[from.r][from.c];
    
    if (!pieceType) return { success: false, message: "Geçersiz başlangıç konumu." };

    const forcedJumps = getForcedJumps(board, player);
    const moves = getValidMoves(board, from.r, from.c, player);
    let move = moves.find(m => m.to.r === to.r && m.to.c === to.c);

    // 1. Zorunlu Vurma Kuralı Kontrolü
    const isForcedJump = forcedJumps.length > 0;
    if (isForcedJump) {
        if (!move || move.jumped === null) {
            return { success: false, message: "Zorunlu taş vurma hamlesi var!" };
        }
        const forcedPiece = forcedJumps.find(fj => fj.from.r === from.r && fj.from.c === from.c);
        if (!forcedPiece) {
             return { success: false, message: "Başka bir taşa ait zorunlu vurma hamlesi var." };
        }
    } else if (!move) {
        return { success: false, message: "Geçersiz hamle kuralı." };
    }

    // 2. Hamleyi Uygula
    if (move.jumped) {
        board[move.jumped.r][move.jumped.c] = 0; // Vurulan taşı sil
    }

    let newPieceType = pieceType;
    
    // Kral olma kontrolü
    if (player === 1 && to.r === 0) newPieceType = 3; 
    if (player === 2 && to.r === 7) newPieceType = 4; 

    board[to.r][to.c] = newPieceType;
    board[from.r][from.c] = 0;
    
    // 3. Zincirleme Vurma Kontrolü
    let chained = false;
    let nextTurn = turn === 'player1' ? 'player2' : 'player1';
    
    if (move.jumped) {
        const jumpsFromNewPos = getValidMoves(board, to.r, to.c, player).filter(m => m.jumped !== null);
        if (jumpsFromNewPos.length > 0) {
            nextTurn = turn; // Aynı oyuncuda kalır
            chained = true;
        }
    }

    // 4. Kazanma Kontrolü
    const winner = checkWinCondition(board, nextTurn);
    
    return { success: true, board: board, turn: nextTurn, winner: winner, chained: chained };
}

// --- SOCKET.IO BAĞLANTILARI ---

// Yardımcı Fonksiyon: Kullanıcıyı kuyruktan çıkarır ve isSearching durumunu temizler
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
    // ... (Eşleştirme mantığı aynı kalır, sadece yukarıdaki yardımcı fonksiyon kullanılır) ...
    if (rankedQueue.length >= 2) {
        const player1Id = rankedQueue.shift(); 
        const player2Id = rankedQueue.shift(); 
        
        const player1 = users[player1Id];
        const player2 = users[player2Id];

        if (!player1 || !player2 || !io.sockets.sockets.get(player1Id) || !io.sockets.sockets.get(player2Id)) {
             // Eksik olanları geri koy veya temizle, tekrar dene
             if (player1 && io.sockets.sockets.get(player1Id)) rankedQueue.unshift(player1Id);
             if (player2 && io.sockets.sockets.get(player2Id)) rankedQueue.unshift(player2Id);
             attemptMatchmaking(); 
             return;
        }

        player1.isSearching = false;
        player2.isSearching = false;
        
        const roomId = generateRoomId();

        games[roomId] = {
            player1Id: player1Id,
            player1Name: player1.username,
            player2Id: player2Id,
            player2Name: player2.username,
            board: initializeBoard(),
            turn: 'player1'
        };
        
        io.sockets.sockets.get(player1Id).join(roomId);
        io.sockets.sockets.get(player2Id).join(roomId);

        console.log(`Dereceli eşleşme bulundu: Oda ${roomId} (${player1.username} vs ${player2.username})`);
        
        io.to(player1Id).emit('matchFound', { roomId: roomId, role: 'player1' });
        io.to(player2Id).emit('matchFound', { roomId: roomId, role: 'player2' });

        io.to(roomId).emit('gameStart', { 
            board: games[roomId].board, 
            turn: games[roomId].turn,
            player1Name: player1.username,
            player2Name: player2.username
        });

        attemptMatchmaking(); 
    }
}

io.on('connection', (socket) => {
    // ... (playerIdentity olayı aynı kalır)

    socket.on('findRankedMatch', () => {
        const user = users[socket.id];
        if (!user) return socket.emit('matchMakingStatus', 'Hata: Kimliğiniz henüz tanımlanmadı.');

        if (user.isSearching || rankedQueue.includes(socket.id)) {
            socket.emit('matchMakingStatus', 'Zaten eşleşme aranıyor.');
            return;
        }
        
        user.isSearching = true;
        rankedQueue.push(socket.id);
        socket.emit('matchMakingStatus', `Eşleşme aranıyor... Kuyrukta: ${rankedQueue.length}`);

        attemptMatchmaking(); 
    });

    // YENİ: Dereceli Arama İptali
    socket.on('cancelMatchmaking', () => {
        const removed = removeFromQueue(socket.id);
        if (removed) {
            socket.emit('matchMakingCancelled', 'Eşleşme araması iptal edildi.');
        } else {
             socket.emit('matchMakingCancelled', 'Zaten arama yapmıyordunuz.');
        }
    });

    // Oda Kurma (Geri bildirim istemciye devredildi)
    socket.on('createGame', (callback) => {
        const user = users[socket.id];
        if (!user) return callback({ success: false, message: 'Kimlik yüklenmedi.' });

        removeFromQueue(socket.id);
        
        const roomId = generateRoomId();
        // Oyun durumunu oluştur
        const game = {
            player1Id: socket.id,
            player1Name: user.username,
            player2Id: null,
            player2Name: null,
            board: initializeBoard(),
            turn: 'player1'
        };
        games[roomId] = game;
        
        socket.join(roomId);
        // İstemciye oda kodunu gönder
        callback({ success: true, roomId: roomId, role: 'player1', game }); 
    });

    // Odaya Katılma (Oda kurucunun oyunu başlatması beklenmiyor, hemen başlıyor)
    socket.on('joinGame', (data, callback) => {
        const { roomId } = data;
        const user = users[socket.id];

        if (!user) return callback({ success: false, message: 'Kimlik yüklenmedi.' });
        
        const game = games[roomId];

        if (!game) {
            callback({ success: false, message: 'Oda bulunamadı.' });
            return;
        }
        if (game.player2Id) {
             callback({ success: false, message: 'Oda dolu.' });
             return;
        }

        removeFromQueue(socket.id);
        
        game.player2Id = socket.id;
        game.player2Name = user.username;
        socket.join(roomId);
        callback({ success: true, roomId: roomId, role: 'player2' });

        // Her iki oyuncu da hazır, oyunu başlat
        io.to(roomId).emit('gameStart', { 
            board: game.board, 
            turn: game.turn,
            player1Name: game.player1Name,
            player2Name: game.player2Name
        });
    });

    // --- HAREKET ETME (GÜNCELLENDİ) ---
    socket.on('move', (data) => {
        const { roomId, from, to } = data;
        const game = games[roomId];
        
        if (!game || !game.player1Id || !game.player2Id) return;

        const isPlayer1 = game.player1Id === socket.id;
        // Sıra Kontrolü
        if ((game.turn === 'player1' && !isPlayer1) || (game.turn === 'player2' && isPlayer1)) return;
        
        const result = applyMove(game, from, to);

        if (!result.success) {
            socket.emit('invalidMove', { message: result.message });
            return;
        }
        
        game.board = result.board;
        game.turn = result.turn; 

        io.to(roomId).emit('boardUpdate', { 
            board: game.board, 
            turn: game.turn,
            chained: result.chained
        });
        
        if (result.winner) {
            io.to(roomId).emit('gameOver', { winner: result.winner });
            delete games[roomId];
        }
    });

    // --- BAĞLANTI KESİLMESİ (Aynı kalır) ---
    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            removeFromQueue(socket.id);
            for (const roomId in games) {
                if (games[roomId].player1Id === socket.id || games[roomId].player2Id === socket.id) {
                    const opponentId = games[roomId].player1Id === socket.id ? games[roomId].player2Id : games[roomId].player1Id;
                    if (io.sockets.sockets.get(opponentId)) {
                        io.to(opponentId).emit('opponentDisconnected', 'Rakibiniz oyundan ayrıldı, kazandınız!');
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
