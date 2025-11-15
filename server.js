// server.js - RENDER.COM UYUMLU TAM KOD
// Bağımlılıklar: npm install express socket.io

const express = require('express');
const http = require('http');
const socketio = require('socket.io');

// Render'ın dinamik olarak atadığı PORT ortam değişkenini kullanırız.
const PORT = process.env.PORT || 3000; 
const app = express();
const server = http.createServer(app);

// Statik dosyaları (index.html, game.js) sunabilmek için
app.use(express.static(__dirname));

// RENDER Bağlantıları için Socket.IO ayarı
const io = socketio(server, { 
    // Tüm origin'lerden bağlantıya izin ver (Render gerekli)
    cors: { 
        origin: "*", 
        methods: ["GET", "POST"] 
    },
    // Bu ayar, Render gibi proxy'ler arkasında WSS (Secure WebSocket) kullanmak için hayati önem taşır.
    transports: ['websocket', 'polling']
});

const users = {}; 
let rankedQueue = []; 
const games = {}; 

// --- DAMA MANTIĞI FONKSİYONLARI ---

// Tahta Kodları: 0=Boş, 1=Siyah Taş (P1), 2=Beyaz Taş (P2), 3=Siyah Kral, 4=Beyaz Kral
function initializeBoard() {
    const board = Array(8).fill(0).map(() => Array(8).fill(0));
    // Türk Daması: Beyaz (P2) - Üst 3 sıra (0-2)
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
            board[r][c] = 2; // Beyaz
        }
    }
    // Türk Daması: Siyah (P1) - Alt 3 sıra (5-7)
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

function getOpponentPieceCodes(pieceType) {
    if (pieceType === 1 || pieceType === 3) return [2, 4]; 
    if (pieceType === 2 || pieceType === 4) return [1, 3]; 
    return [];
}

function getPossibleMoves(game, r, c) {
    const board = game.board;
    const pieceType = board[r][c];
    if (pieceType === 0) return [];

    const isKing = pieceType === 3 || pieceType === 4;
    const isBlack = pieceType === 1 || pieceType === 3;
    const opponentCodes = getOpponentPieceCodes(pieceType);
    
    let moves = [];
    let hits = [];
    
    // Yönler: Sağ (0,1), Sol (0,-1), Aşağı (1,0), Yukarı (-1,0)
    const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]]; 

    for (const [dr, dc] of directions) {
        let currR = r + dr;
        let currC = c + dc;
        
        // Normal Taşlar için Geriye Gitme Kısıtlaması
        if (!isKing) {
            if (isBlack && dr === -1) continue; 
            if (!isBlack && dr === 1) continue; 
        }

        // KURAL KONTROLÜ: Vurma
        if (currR >= 0 && currR < 8 && currC >= 0 && currC < 8) {
            if (opponentCodes.includes(board[currR][currC])) {
                let landR = currR + dr;
                let landC = currC + dc;

                if (landR >= 0 && landR < 8 && landC >= 0 && landC < 8 && board[landR][landC] === 0) {
                    hits.push({ row: landR, col: landC, targetR: currR, targetC: currC, isHit: true });
                }
            }
        }
        
        // KURAL KONTROLÜ: Normal Hareket
        if (currR >= 0 && currR < 8 && currC >= 0 && currC < 8 && board[currR][currC] === 0) {
            moves.push({ row: currR, col: currC, isHit: false });
        }
    }
    
    // Vurma zorunluluğu
    if (hits.length > 0) return hits;
    
    return moves;
}

function getAllPossibleMoves(game, role) {
    const board = game.board;
    let allMoves = [];
    const pieceCodes = role === 'player1' ? [1, 3] : [2, 4];
    
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
    
    const hasHits = allMoves.some(move => move.isHit);
    if (hasHits) {
        return allMoves.filter(move => move.isHit);
    }
    
    return allMoves;
}

function applyMove(game, from, to) {
    const board = game.board;
    const pieceType = board[from.row][from.col];
    const currentRole = game.turn;

    const isPlayer1Piece = pieceType === 1 || pieceType === 3;
    if (currentRole === 'player1' && !isPlayer1Piece) return { success: false, message: 'Sıra Siyah taşlarda.' };
    if (currentRole === 'player2' && isPlayer1Piece) return { success: false, message: 'Sıra Beyaz taşlarda.' };

    const allMoves = getAllPossibleMoves(game, currentRole);
    
    const validMove = allMoves.find(move => 
        move.fromR === from.row && 
        move.fromC === from.col && 
        move.row === to.row && 
        move.col === to.col
    );

    if (!validMove) {
        const hasAnyHit = allMoves.some(m => m.isHit);
        if (hasAnyHit) {
            return { success: false, message: 'Vurma zorunludur! Başka bir taşı seçmelisiniz veya farklı bir hamle yapmalısınız.' };
        }
        return { success: false, message: 'Geçersiz hamle.' };
    }

    if (validMove.isHit) {
        const hitMove = getPossibleMoves(game, from.row, from.col).find(m => 
            m.row === to.row && m.col === to.col && m.isHit
        );
        if (hitMove) {
            board[hitMove.targetR][hitMove.targetC] = 0; // Rakip taşı sil
        }
    }

    board[to.row][to.col] = pieceType;
    board[from.row][from.col] = 0;

    // Kral Olma Kontrolü
    if (pieceType === 1 && to.row === 0) board[to.row][to.col] = 3; 
    if (pieceType === 2 && to.row === 7) board[to.row][to.col] = 4;
    
    // Zincirleme Vurma Kontrolü
    let chained = false;
    if (validMove.isHit) {
        const nextMoves = getPossibleMoves(game, to.row, to.col);
        if (nextMoves.some(m => m.isHit)) {
            chained = true;
        }
    }
    
    if (!chained) {
        game.turn = currentRole === 'player1' ? 'player2' : 'player1';
    }

    return { success: true, board: board, turn: game.turn, chained: chained, from: from, to: to };
}

function checkWinCondition(game) {
    const p1Pieces = game.board.flat().filter(p => p === 1 || p === 3).length;
    const p2Pieces = game.board.flat().filter(p => p === 2 || p === 4).length;
    
    if (p1Pieces === 0) return { winner: 'player2', reason: `Siyah taşları bitti.` };
    if (p2Pieces === 0) return { winner: 'player1', reason: `Beyaz taşları bitti.` };

    const nextTurn = game.turn;
    const possibleMovesForNextTurn = getAllPossibleMoves(game, nextTurn);
    
    if (possibleMovesForNextTurn.length === 0) {
        const winner = nextTurn === 'player1' ? 'player2' : 'player1';
        return { winner: winner, reason: `${nextTurn === 'player1' ? game.player1Name : game.player2Name} hareket edemiyor.` };
    }

    return null; 
}

function attemptMatchmaking() {
    rankedQueue = rankedQueue.filter(id => io.sockets.sockets.has(id));

    if (rankedQueue.length >= 2) {
        const player1Id = rankedQueue.shift(); 
        const player2Id = rankedQueue.shift(); 
        
        const player1 = users[player1Id];
        const player2 = users[player2Id];

        if (!player1 || !player2) { attemptMatchmaking(); return; }

        player1.isSearching = false;
        player2.isSearching = false;
        
        const roomId = generateRoomId();

        games[roomId] = {
            roomId: roomId,
            player1Id: player1Id,
            player1Name: player1.username,
            player2Id: player2Id,
            player2Name: player2.username,
            board: initializeBoard(),
            turn: 'player1' 
        };
        
        io.sockets.sockets.get(player1Id)?.join(roomId);
        io.sockets.sockets.get(player2Id)?.join(roomId);

        io.to(player1Id).emit('matchFound', { roomId: roomId, role: 'player1' });
        io.to(player2Id).emit('matchFound', { roomId: roomId, role: 'player2' });

        io.to(roomId).emit('gameStart', { 
            roomId: roomId,
            board: games[roomId].board, 
            turn: games[roomId].turn,
            player1Name: player1.username,
            player2Name: player2.username
        });

        attemptMatchmaking(); 
    } else {
         if(rankedQueue.length === 1 && users[rankedQueue[0]]) {
             io.to(rankedQueue[0]).emit('matchMakingStatus', `Eşleşme aranıyor... Kuyrukta: 1 kişi.`);
         }
    }
}


// --- SOCKET.IO SUNUCU MANTIĞI ---

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
        removeFromQueue(socket.id);
        attemptMatchmaking();
    });

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

    socket.on('joinGame', (data, callback) => {
        const { roomId } = data;
        const user = users[socket.id];
        const game = games[roomId];

        if (!user || !game || game.player2Id) {
            return callback({ success: false, message: (!user ? 'Kimlik yüklenmedi.' : (!game ? 'Oda bulunamadı.' : 'Oda dolu.')) });
        }

        removeFromQueue(socket.id);
        game.player2Id = socket.id;
        game.player2Name = user.username;
        socket.join(roomId);
        callback({ success: true, roomId: roomId, role: 'player2' });

        io.to(roomId).emit('gameStart', { 
            roomId: roomId,
            board: game.board, 
            turn: game.turn,
            player1Name: game.player1Name,
            player2Name: game.player2Name
        });
    });

    socket.on('getPossibleMoves', (data) => {
        const game = games[data.roomId];
        if (!game) return;

        const isMyTurn = (game.turn === 'player1' && game.player1Id === socket.id) ||
                         (game.turn === 'player2' && game.player2Id === socket.id);
        
        if (!isMyTurn) return;

        const pieceRole = game.player1Id === socket.id ? 'player1' : 'player2';
        const allValidMoves = getAllPossibleMoves(game, pieceRole);
        
        const specificMoves = allValidMoves
            .filter(m => m.fromR === data.from.row && m.fromC === data.from.col)
            .map(m => ({ row: m.row, col: m.col }));
        
        socket.emit('possibleMoves', specificMoves);
    });

    socket.on('move', (data) => {
        const game = games[data.roomId];
        if (!game) return socket.emit('invalidMove', { message: 'Oyun bulunamadı.' });

        const isMyTurn = (game.turn === 'player1' && game.player1Id === socket.id) ||
                         (game.turn === 'player2' && game.player2Id === socket.id);
        
        if (!isMyTurn) return socket.emit('invalidMove', { message: 'Sıra sizde değil.' });

        const result = applyMove(game, data.from, data.to);

        if (result.success) {
            const winResult = checkWinCondition(game);

            if (winResult) {
                io.to(data.roomId).emit('gameOver', winResult);
                delete games[data.roomId];
            } else {
                io.to(data.roomId).emit('boardUpdate', { 
                    board: result.board, 
                    turn: result.turn, 
                    chained: result.chained,
                    from: result.from, 
                    to: result.to
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
            const isPlayer1 = game.player1Id === socket.id;
            const opponentId = isPlayer1 ? game.player2Id : game.player1Id;

            if (opponentId && io.sockets.sockets.get(opponentId)) {
                io.to(opponentId).emit('opponentDisconnected', 'Rakibiniz oyundan ayrıldı, kazandınız!');
            }

            delete games[roomId];
            socket.emit('gameLeft');
        } else {
             socket.emit('gameLeft');
        }
    });

    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            removeFromQueue(socket.id);
            
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
    console.log(`✅ Sunucu Render Portu ${PORT} üzerinde çalışıyor.`);
});
