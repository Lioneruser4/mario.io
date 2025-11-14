// Dosya Adı: server.js (Şaşki Oyunu için Güncellenmiş Versiyon)
// Lütfen bu kodu Render'daki server.js dosyanızla değiştirin.
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// CORS ve Transport ayarları (Çalışan Kodunuzdan Alındı)
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'] 
});

let games = {}; // Odaları ve oyun durumlarını tutar
let socketToRoom = {}; // Kullanıcı ID'sini Odaya eşlemek için

// ŞAŞKİ OYUN MANTIK KISMI - BAŞLANGIÇ
// 0: boş, 1: Siyah Piyon, 2: Beyaz Piyon, 3: Siyah Vezir (King), 4: Beyaz Vezir (King)

function initializeCheckersBoard() {
    const board = Array(8).fill(null).map(() => Array(8).fill(0));
    
    // Siyah taşları yerleştir (Üst 3 sıra)
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 !== 0) { 
                board[r][c] = 1; // Siyah Piyon
            }
        }
    }
    // Beyaz taşları yerleştir (Alt 3 sıra)
    for (let r = 5; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 !== 0) {
                board[r][c] = 2; // Beyaz Piyon
            }
        }
    }
    return board;
}

// Zorunlu atlama (jump) olup olmadığını kontrol eder
function canPlayerJump(board, playerColor) {
    const piecePiyon = playerColor === 'black' ? 1 : 2;
    const pieceVezir = playerColor === 'black' ? 3 : 4;
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece === piecePiyon || piece === pieceVezir) {
                
                const directions = [[2, -2], [2, 2], [-2, -2], [-2, 2]];
                for (const [dy, dx] of directions) {
                    const jumpR = r + dy;
                    const jumpC = c + dx;
                    
                    if (jumpR >= 0 && jumpR < 8 && jumpC >= 0 && jumpC < 8 && board[jumpR][jumpC] === 0) {
                        const midR = r + dy / 2;
                        const midC = c + dx / 2;
                        const jumpedPiece = board[midR][midC];
                        
                        // Atlanan taş rakibe ait mi?
                        const isOpponent = (playerColor === 'black' && (jumpedPiece === 2 || jumpedPiece === 4)) ||
                                           (playerColor === 'white' && (jumpedPiece === 1 || jumpedPiece === 3));

                        // Piyonun geri atlama kuralı (Sadece Vezirler geri atlayabilir)
                        const canGoBack = (piece === 3 || piece === 4);
                        if ((piece === 1 && dy < 0) || (piece === 2 && dy > 0)) continue; // Piyonlar geriye gitmez

                        if (isOpponent) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    return false;
}

// Belirtilen taştan yapılabilecek tüm hamleleri (hareket ve atlama) döndürür
function getAvailableMoves(board, r, c, playerColor, isJumpChain = false) {
    const moves = [];
    const piece = board[r][c];
    const isKing = (piece === 3 || piece === 4);
    
    // Yönler (Piyonlar sadece ileri, Vezirler her yöne)
    let directions = [];
    if (piece === 1) directions = [[1, -1], [1, 1]]; // Siyah Piyon (Aşağı)
    else if (piece === 2) directions = [[-1, -1], [-1, 1]]; // Beyaz Piyon (Yukarı)
    else if (isKing) directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]]; // Vezir (Tüm yönler)
    else return moves;
    
    const mustJump = canPlayerJump(board, playerColor);

    for (const [dr, dc] of directions) {
        
        // 1. Atlama Hamlesi Kontrolü (2 kare)
        const jumpR = r + dr * 2;
        const jumpC = c + dc * 2;
        const midR = r + dr;
        const midC = c + dc;

        if (jumpR >= 0 && jumpR < 8 && jumpC >= 0 && jumpC < 8 && board[jumpR][jumpC] === 0) {
            const jumpedPiece = board[midR][midC];
            const isOpponent = (playerColor === 'black' && (jumpedPiece === 2 || jumpedPiece === 4)) ||
                               (playerColor === 'white' && (jumpedPiece === 1 || jumpedPiece === 3));

            if (isOpponent) {
                // Piyon geri atlayamaz kuralı
                if (!isKing && ((playerColor === 'black' && dr < 0) || (playerColor === 'white' && dr > 0))) continue;
                
                moves.push({ from: [r, c], to: [jumpR, jumpC], type: 'jump', jumped: [midR, midC] });
            }
        }

        // Zincirleme atlama yoksa ve atlama zorunluluğu yoksa normal hamleyi kontrol et
        if (!mustJump && !isJumpChain) {
            // 2. Basit Hareket Kontrolü (1 kare)
            const moveR = r + dr;
            const moveC = c + dc;
            if (moveR >= 0 && moveR < 8 && moveC >= 0 && moveC < 8 && board[moveR][moveC] === 0) {
                moves.push({ from: [r, c], to: [moveR, moveC], type: 'move' });
            }
        }
    }
    
    // Eğer atlama hamlesi varsa, sadece atlama hamlelerini döndür (Zorunluluk Kuralı)
    const availableJumps = moves.filter(m => m.type === 'jump');
    if (availableJumps.length > 0) {
        return availableJumps;
    }

    return moves;
}

function hasAnyValidMoves(board, playerColor) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            const isPlayerPiece = (playerColor === 'black' && (piece === 1 || piece === 3)) ||
                                  (playerColor === 'white' && (piece === 2 || piece === 4));
            
            if (isPlayerPiece) {
                if (getAvailableMoves(board, r, c, playerColor).length > 0) {
                    return true;
                }
            }
        }
    }
    return false;
}

// ODA YÖNETİMİ
function cleanupRoom(roomId) {
  if (games[roomId]) {
    delete games[roomId];
    console.log(`Oda ${roomId} temizlendi.`);
  }
}

// ŞAŞKİ OYUN MANTIK KISMI - SON

io.on('connection', (socket) => {
    console.log(`Yeni bağlantı: ${socket.id}`);
    
    socket.on('createRoom', ({ username }) => {
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        games[code] = {
            players: { 'black': { id: socket.id, username: username }, 'white': null },
            board: initializeCheckersBoard(),
            turn: 'black',
            lastJump: null, // [r, c] formatında zincirleme atlayan taşın konumu
            isGameOver: false,
            // (Ekstra oyun durumu gerekirse buraya eklenir)
        };
        socketToRoom[socket.id] = code;
        socket.join(code);
        
        socket.emit('roomCreated', { roomId: code, color: 'black' });
        console.log(`Şaşki Odası kuruldu: ${code} - Kurucu (Siyah): ${username}`);
    });

    socket.on('joinRoom', ({ username, roomCode }) => {
        const code = roomCode.toUpperCase();
        const room = games[code];

        if (!room || room.players['white']) {
            socket.emit('error', 'Oda bulunamadı veya dolu.');
            return;
        }

        room.players['white'] = { id: socket.id, username: username };
        socketToRoom[socket.id] = code;
        socket.join(code);
        
        socket.emit('roomJoined', code); 
        
        // Oyuna başla sinyali gönder
        io.to(code).emit('gameStart', {
            board: room.board,
            turn: room.turn,
            blackName: room.players['black'].username,
            whiteName: room.players['white'].username
        });
        console.log(`Oyuncu ${username} odaya katıldı (Beyaz): ${code}`);
    });

    // Ana Hamle İşleyici
    socket.on('makeMove', (data) => {
        const { roomId, from, to } = data; // from/to: "r-0-c-1" gibi stringler
        const game = games[roomId];
        
        if (!game || game.isGameOver) return;

        const currentPlayerColor = game.turn;
        const currentPlayerId = game.players[currentPlayerColor]?.id;
        if (socket.id !== currentPlayerId) {
            return socket.emit('error', 'Sıra sizde değil.');
        }

        const [fromR, fromC] = [parseInt(from.split('-')[1]), parseInt(from.split('-')[3])];
        const [toR, toC] = [parseInt(to.split('-')[1]), parseInt(to.split('-')[3])];
        const piece = game.board[fromR][fromC];

        // 1. Taşın oyuncuya ait olup olmadığını kontrol et
        const isPlayerPiece = (currentPlayerColor === 'black' && (piece === 1 || piece === 3)) ||
                              (currentPlayerColor === 'white' && (piece === 2 || piece === 4));
        if (!isPlayerPiece) return socket.emit('error', 'Bu sizin taşınız değil.');

        // 2. Zincirleme Atlama Kontrolü (Eğer bir önceki hamle atlamaysa, aynı taşla devam etmeli)
        if (game.lastJump && (game.lastJump[0] !== fromR || game.lastJump[1] !== fromC)) {
            // Önceki atlamayı yapan taşla hamle yapılmıyorsa ve atlama zorunluluğu varsa hata ver
            const nextJumps = getAvailableMoves(game.board, game.lastJump[0], game.lastJump[1], currentPlayerColor).filter(m => m.type === 'jump');
            if(nextJumps.length > 0) {
                 return socket.emit('error', 'Atlamaya devam etmelisiniz!');
            }
        }
        
        // 3. Geçerli hamleleri bul
        const allMoves = getAvailableMoves(game.board, fromR, fromC, currentPlayerColor, game.lastJump !== null);
        const validMove = allMoves.find(m => m.to[0] === toR && m.to[1] === toC);

        if (!validMove) {
            return socket.emit('error', 'Geçersiz hareket.');
        }
        
        // Hamleyi uygula
        game.board[toR][toC] = piece;
        game.board[fromR][fromC] = 0;
        let isJump = false;

        if (validMove.type === 'jump') {
            game.board[validMove.jumped[0]][validMove.jumped[1]] = 0; // Atlanan taşı kaldır
            isJump = true;
            game.lastJump = [toR, toC]; // Atlama zincirini başlat/devam ettir
        } else {
            game.lastJump = null;
        }

        // Piyon Terfisi (King olma)
        const isKing = (piece === 3 || piece === 4);
        if (!isKing) {
            if (piece === 1 && toR === 7) game.board[toR][toC] = 3; // Siyah King oldu
            if (piece === 2 && toR === 0) game.board[toR][toC] = 4; // Beyaz King oldu
        }
        
        let nextTurn = game.turn;
        
        if (isJump) {
            // Zincirleme atlama kontrolü (Aynı taştan başka atlama var mı?)
            const nextJumps = getAvailableMoves(game.board, toR, toC, currentPlayerColor).filter(m => m.type === 'jump');
            
            if (nextJumps.length > 0) {
                // Sıra aynı oyuncuda kalır, atlamaya devam etmeli
                game.lastJump = [toR, toC];
            } else {
                // Zincir bitti, sırayı değiştir
                nextTurn = (game.turn === 'black') ? 'white' : 'black';
                game.lastJump = null;
            }
        } else {
            // Normal hareket, sırayı değiştir
            nextTurn = (game.turn === 'black') ? 'white' : 'black';
            game.lastJump = null;
        }
        
        game.turn = nextTurn;
        
        // Oyun Bitiş Kontrolü
        const opponentColor = game.turn;
        if (!hasAnyValidMoves(game.board, opponentColor)) {
            game.isGameOver = true;
            io.to(roomId).emit('gameOver', { winner: currentPlayerColor, reason: 'Rakibiniz hareket edemiyor.' });
            cleanupRoom(roomId);
            return;
        }
        
        // Client'lara güncelleme gönder
        io.to(roomId).emit('boardUpdate', {
            board: game.board,
            turn: game.turn,
            isJump: isJump,
            from: { r: fromR, c: fromC },
            to: { r: toR, c: toC },
            mustJumpAgain: game.lastJump !== null
        });
    });

    socket.on('disconnect', () => {
        console.log(`Bağlantı kesildi: ${socket.id}`);
        const code = socketToRoom[socket.id];
        if (code && games[code]) {
            const opponentId = (games[code].players['black']?.id === socket.id) 
                                ? games[code].players['white']?.id 
                                : games[code].players['black']?.id;
            
            if (opponentId) {
                io.to(opponentId).emit('opponentLeft', 'Rakibiniz ayrıldı. Lobiye dönülüyor.');
            }
            // Odayı sil
            delete games[code];
            delete socketToRoom[socket.id];
            console.log(`Oda silindi: ${code}`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`ŞAŞKİ Sunucusu ${PORT} üzerinde çalışıyor.`);
});
