// server.js - Sunucu (Node.js/Express/Socket.IO) Kodu
// NOT: Statik dosyalar (index.html, game.js) kök dizinde varsayılmıştır.

const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const path = require('path');

const PORT = process.env.PORT || 3000; 
const app = express();
const server = http.createServer(app);

// Statik dosyaları (index.html ve game.js) kök dizinden sunar
app.use(express.static(__dirname)); 

const io = socketio(server, { 
    cors: { 
        origin: "*", 
        methods: ["GET", "POST"] 
    },
    transports: ['websocket', 'polling']
});

// Oyun Sabitleri ve Durumu
const users = {}; 
let rankedQueue = []; 
const games = {}; 

const BLACK_MAN = 1;
const WHITE_MAN = 2;
const BLACK_KING = 3;
const WHITE_KING = 4;

// --- CHECKERS (AMERİKAN DAMA) MANTIĞI FONKSİYONLARI (Aynı Kaldı) ---

function initializeBoard() {
    const board = Array(8).fill(0).map(() => Array(8).fill(0));
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) { board[r][c] = WHITE_MAN; } 
        }
    }
    for (let r = 5; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) { board[r][c] = BLACK_MAN; } 
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

function getOpponentPieceCodes(pieceType) {
    if (pieceType === BLACK_MAN || pieceType === BLACK_KING) return [WHITE_MAN, WHITE_KING]; 
    if (pieceType === WHITE_MAN || pieceType === WHITE_KING) return [BLACK_MAN, BLACK_KING]; 
    return [];
}

/**
 * Belirtilen taştan yapılabilecek tüm geçerli hamleleri (normal ve yeme) bulur.
 */
function getPossibleMoves(game, r, c) {
    const board = game.board;
    const pieceType = board[r][c];
    if (pieceType === 0) return [];

    const isKing = pieceType === BLACK_KING || pieceType === WHITE_KING;
    const isBlack = pieceType === BLACK_MAN || pieceType === BLACK_KING;
    const opponentCodes = getOpponentPieceCodes(pieceType);
    
    let moves = [];
    const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]]; 

    for (const [dr, dc] of directions) {
        let nextR = r + dr;
        let nextC = c + dc;
        
        // Kural 1: Normal taşlar geriye gidemez (Kral hariç)
        if (!isKing) {
            if (isBlack && dr === -1) continue; 
            if (!isBlack && dr === 1) continue; 
        }
        
        // Kural 2: Yeme Hamlesi Kontrolü (2 adım atlama)
        if (nextR >= 0 && nextR < 8 && nextC >= 0 && nextC < 8) {
            if (opponentCodes.includes(board[nextR][nextC])) {
                let landR = nextR + dr; 
                let landC = nextC + dc;

                if (landR >= 0 && landR < 8 && landC >= 0 && landC < 8 && board[landR][landC] === 0) {
                    moves.push({ 
                        row: landR, col: landC, 
                        targetR: nextR, targetC: nextC, 
                        isHit: true 
                    });
                }
            }
        }
        
        // Kural 3: Normal Hamle Kontrolü (1 adım)
        if (nextR >= 0 && nextR < 8 && nextC >= 0 && nextC < 8 && board[nextR][nextC] === 0) {
            moves.push({ row: nextR, col: nextC, isHit: false });
        }
    }
    
    return moves;
}

/**
 * Tahtadaki tüm taşlar için tüm geçerli hamleleri (yeme zorunluluğu dahil) bulur.
 */
function getAllPossibleMoves(game, role) {
    let allMoves = [];
    const board = game.board;
    const pieceCodes = role === 'player1' ? [BLACK_MAN, BLACK_KING] : [WHITE_MAN, WHITE_KING];
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (pieceCodes.includes(board[r][c])) {
                const moves = getPossibleMoves(game, r, c);
                moves.forEach(move => {
                    move.fromR = r;
                    move.fromC = c;
                    allMoves.push(move);
                });
            }
        }
    }
    
    // Yeme zorunluluğu (FORCE JUMP): Yeme hamlesi varsa, sadece onları döndür.
    const hasHits = allMoves.some(move => move.isHit);
    if (hasHits) {
        return allMoves.filter(move => move.isHit);
    }
    
    return allMoves.filter(move => !move.isHit);
}

function applyMove(game, from, to) {
    const board = game.board;
    const pieceType = board[from.row][from.col];
    const currentRole = game.turn;

    const isPlayer1Piece = pieceType === BLACK_MAN || pieceType === BLACK_KING;
    if (currentRole === 'player1' && !isPlayer1Piece) return { success: false, message: 'Sıra Siyah taşlarda.' };
    if (currentRole === 'player2' && isPlayer1Piece) return { success: false, message: 'Sıra Beyaz taşlarda.' };

    const allValidMoves = getAllPossibleMoves(game, currentRole);
    
    const validMove = allValidMoves.find(move => 
        move.fromR === from.row && 
        move.fromC === from.col && 
        move.row === to.row && 
        move.col === to.col
    );

    if (!validMove) {
        const hasForcedMove = allValidMoves.some(m => m.isHit);
        if (hasForcedMove) {
            return { success: false, message: 'Yeme zorunludur! Lütfen yiyebileceğiniz bir hamle yapın.' };
        }
        return { success: false, message: 'Geçersiz hamle.' };
    }

    if (validMove.isHit) {
        board[validMove.targetR][validMove.targetC] = 0; 
    }

    board[to.row][to.col] = pieceType;
    board[from.row][from.col] = 0;

    // Kral Olma Kontrolü
    if (pieceType === BLACK_MAN && to.row === 0) board[to.row][to.col] = BLACK_KING; 
    if (pieceType === WHITE_MAN && to.row === 7) board[to.row][to.col] = WHITE_KING; 
    
    let chained = false;
    if (validMove.isHit) {
        const pieceNextMoves = getPossibleMoves(game, to.row, to.col);
        if (pieceNextMoves.some(m => m.isHit)) {
            chained = true;
        }
    }
    
    if (!chained) {
        game.turn = currentRole === 'player1' ? 'player2' : 'player1';
    }

    return { success: true, board: board, turn: game.turn, chained: chained, from: from, to: to };
}

function checkWinCondition(game) {
    const p1Pieces = game.board.flat().filter(p => p === BLACK_MAN || p === BLACK_KING).length;
    const p2Pieces = game.board.flat().filter(p => p === WHITE_MAN || p === WHITE_KING).length;
    
    if (p1Pieces === 0) return { winner: 'player2', reason: `Siyah taşları bitti.` };
    if (p2Pieces === 0) return { winner: 'player1', reason: `Beyaz taşları bitti.` };

    const nextTurn = game.turn;
    const possibleMovesForNextTurn = getAllPossibleMoves(game, nextTurn);
    
    if (possibleMovesForNextTurn.length === 0) {
        const winner = nextTurn === 'player1' ? 'player2' : 'player1';
        return { winner: winner, reason: `${nextTurn === 'player1' ? game.player1Name : game.player2Name} hareket edemiyor (Sıkışma).` };
    }

    return null; 
}


// --- SOCKET.IO ve OYUN YÖNETİMİ ---

function attemptMatchmaking() {
    rankedQueue = rankedQueue.filter(id => io.sockets.sockets.has(id));

    if (rankedQueue.length >= 2) {
        const player1Id = rankedQueue.shift(); 
        const player2Id = rankedQueue.shift(); 
        
        const player1 = users[player1Id];
        const player2 = users[player2Id];
        if (!player1 || !player2) { attemptMatchmaking(); return; }

        const roomId = generateRoomId();

        games[roomId] = {
            roomId: roomId,
            player1Id: player1Id, player1Name: player1.username,
            player2Id: player2Id, player2Name: player2.username,
            board: initializeBoard(),
            turn: 'player1' 
        };
        
        io.sockets.sockets.get(player1Id)?.join(roomId);
        io.sockets.sockets.get(player2Id)?.join(roomId);

        io.to(player1Id).emit('matchFound', { roomId: roomId, role: 'player1' });
        io.to(player2Id).emit('matchFound', { roomId: roomId, role: 'player2' });

        io.to(roomId).emit('gameStart', { 
            roomId: roomId, board: games[roomId].board, turn: games[roomId].turn,
            player1Name: player1.username, player2Name: player2.username,
            player1Id: player1Id, player2Id: player2Id
        });

        attemptMatchmaking(); 
    } else {
         if(rankedQueue.length === 1 && users[rankedQueue[0]]) {
             io.to(rankedQueue[0]).emit('matchMakingStatus', `Eşleşme aranıyor... Kuyrukta: 1 kişi.`);
         }
    }
}


// --- SOCKET.IO BAĞLANTILARI ---

io.on('connection', (socket) => {
    
    socket.on('playerIdentity', (data) => {
        const { username } = data;
        users[socket.id] = { username: username, isSearching: false };
        socket.emit('readyToPlay');
    });

    socket.on('findRankedMatch', () => {
        const user = users[socket.id];
        if (!user || user.isSearching || rankedQueue.includes(socket.id)) return;
        
        user.isSearching = true;
        rankedQueue.push(socket.id);
        socket.emit('matchMakingStatus', `Eşleşme aranıyor... Kuyrukta: ${rankedQueue.length} kişi.`);

        attemptMatchmaking(); 
    });

    socket.on('cancelMatchmaking', () => {
        const index = rankedQueue.indexOf(socket.id);
        if (index > -1) {
            rankedQueue.splice(index, 1);
            if (users[socket.id]) users[socket.id].isSearching = false;
        } 
        attemptMatchmaking();
    });

    socket.on('createGame', (callback) => {
        const user = users[socket.id];
        if (!user) return callback({ success: false, message: 'Kimlik yüklenmedi.' });

        const roomId = generateRoomId();
        const game = {
            roomId: roomId, player1Id: socket.id, player1Name: user.username,
            player2Id: null, player2Name: null, board: initializeBoard(), turn: 'player1'
        };
        games[roomId] = game;
        socket.join(roomId);
        
        callback({ success: true, roomId: roomId, role: 'player1' }); 
    });

    socket.on('joinGame', (data, callback) => {
        const { roomId } = data;
        const user = users[socket.id];
        const game = games[roomId];

        if (!user || !game || game.player2Id) {
            return callback({ success: false, message: (!user ? 'Kimlik yüklenmedi.' : (!game ? 'Oda bulunamadı.' : 'Oda dolu.')) });
        }

        game.player2Id = socket.id;
        game.player2Name = user.username;
        socket.join(roomId);
        callback({ success: true, roomId: roomId, role: 'player2' });

        io.to(roomId).emit('gameStart', { 
            roomId: roomId, board: game.board, turn: game.turn,
            player1Name: game.player1Name, player2Name: game.player2Name,
            player1Id: game.player1Id, player2Id: game.player2Id
        });
    });

    // BURASI ÇOK KRİTİK: İSTEMCİ HAMLELERİ BURADAN İSTİYOR
    socket.on('getPossibleMoves', (data) => {
        const game = games[data.roomId];
        if (!game) return;
        const isMyTurn = (game.turn === 'player1' && game.player1Id === socket.id) || (game.turn === 'player2' && game.player2Id === socket.id);
        if (!isMyTurn) return;

        const pieceRole = game.player1Id === socket.id ? 'player1' : 'player2';
        const allValidMoves = getAllPossibleMoves(game, pieceRole);
        
        // Sadece seçilen taşa ait HEDEF (to) pozisyonlarını filtreleyip gönder
        const specificMoves = allValidMoves
            .filter(m => m.fromR === data.from.row && m.fromC === data.from.col)
            .map(m => ({ row: m.row, col: m.col })); // Sadece hedef konumu gönder
        
        socket.emit('possibleMoves', specificMoves);
    });

    // BURASI ÇOK KRİTİK: İSTEMCİ HAMLE GÖNDERİYOR
    socket.on('move', (data) => {
        const game = games[data.roomId];
        if (!game) return socket.emit('invalidMove', { message: 'Oyun bulunamadı.' });
        const isMyTurn = (game.turn === 'player1' && game.player1Id === socket.id) || (game.turn === 'player2' && game.player2Id === socket.id);
        if (!isMyTurn) return socket.emit('invalidMove', { message: 'Sıra sizde değil.' });

        const result = applyMove(game, data.from, data.to);

        if (result.success) {
            const winResult = checkWinCondition(game);
            if (winResult) {
                io.to(data.roomId).emit('gameOver', winResult);
                delete games[data.roomId];
            } else {
                // Hamle başarılı, tahtayı güncelle ve sırayı bildir
                io.to(data.roomId).emit('boardUpdate', { 
                    board: result.board, turn: result.turn, chained: result.chained, from: result.from, to: result.to
                });
            }
        } else {
            socket.emit('invalidMove', { message: result.message });
        }
    });

    socket.on('leaveGame', (data) => {
        const { roomId } = data;
        const game = games[roomId];
        if (game) {
            const opponentId = game.player1Id === socket.id ? game.player2Id : game.player1Id;
            if (opponentId && io.sockets.sockets.get(opponentId)) {
                io.to(opponentId).emit('opponentDisconnected', 'Rakibiniz oyundan ayrıldı, kazandınız!');
            }
            delete games[roomId];
        }
        socket.emit('gameLeft');
    });

    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            const index = rankedQueue.indexOf(socket.id);
            if (index > -1) rankedQueue.splice(index, 1);
            
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

// SUNUCUYU BAŞLAT
server.listen(PORT, () => {
    console.log(`✅ Sunucu Render Portu ${PORT} üzerinde çalışıyor.`);
});
