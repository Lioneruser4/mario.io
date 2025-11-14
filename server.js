const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

let games = {}; // Odaları ve oyun durumlarını tutar

// ŞAŞKİ OYUN MANTIK KISMI
function initializeCheckersBoard() {
    const board = Array(8).fill(null).map(() => Array(8).fill(0)); // 0: boş
    // Siyah taşları yerleştir
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 !== 0) { // Sadece koyu karelere (çift toplamlı) yerleştir (0,0 beyaz kabul edersek)
                board[r][c] = 1; // 1: Siyah Piyon
            }
        }
    }
    // Beyaz taşları yerleştir
    for (let r = 5; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 !== 0) {
                board[r][c] = 2; // 2: Beyaz Piyon
            }
        }
    }
    return board;
}

function isValidMove(board, fromRow, fromCol, toRow, toCol, currentPlayer) {
    const piece = board[fromRow][fromCol];
    const target = board[toRow][toCol];
    const dx = toCol - fromCol;
    const dy = toRow - fromRow;

    if (piece === 0 || target !== 0) return false; // Boş kareden hareket edilemez veya dolu kareye gidilemez

    // Sadece koyu karelerde hareket edilebilir
    if ((fromRow + fromCol) % 2 === 0 || (toRow + toCol) % 2 === 0) return false;

    // Piyonlar için ileri hareket (Siyah 1, Beyaz 2)
    if (piece === 1) { // Siyah
        if (dy !== 1) return false; // Sadece ileri (aşağı)
        if (Math.abs(dx) !== 1) return false; // Sadece çapraz
    } else if (piece === 2) { // Beyaz
        if (dy !== -1) return false; // Sadece ileri (yukarı)
        if (Math.abs(dx) !== 1) return false; // Sadece çapraz
    } else if (piece === 3) { // Siyah Vezir
        if (Math.abs(dy) !== Math.abs(dx) || Math.abs(dy) === 0) return false; // Çapraz ve en az 1 kare
    } else if (piece === 4) { // Beyaz Vezir
        if (Math.abs(dy) !== Math.abs(dx) || Math.abs(dy) === 0) return false; // Çapraz ve en az 1 kare
    }
    
    return true; // Basit hareket
}

function isValidJump(board, fromRow, fromCol, toRow, toCol, currentPlayer) {
    const piece = board[fromRow][fromCol];
    const target = board[toRow][toCol];
    const dx = toCol - fromCol;
    const dy = toRow - fromRow;

    if (piece === 0 || target !== 0) return false; // Boş kareden hareket edilemez veya dolu kareye gidilemez

    // Sadece 2 kare atlayış için
    if (Math.abs(dy) !== 2 || Math.abs(dx) !== 2) return false;

    const jumpedRow = fromRow + dy / 2;
    const jumpedCol = fromCol + dx / 2;
    const jumpedPiece = board[jumpedRow][jumpedCol];

    if (jumpedPiece === 0) return false; // Atlanacak yerde taş olmalı

    // Piyonlar için
    if (piece === 1) { // Siyah Piyon
        if (dy !== 2) return false; // Sadece ileri (aşağı)
        if (jumpedPiece === 1 || jumpedPiece === 3) return false; // Kendi rengi atlanamaz
    } else if (piece === 2) { // Beyaz Piyon
        if (dy !== -2) return false; // Sadece ileri (yukarı)
        if (jumpedPiece === 2 || jumpedPiece === 4) return false; // Kendi rengi atlanamaz
    } else if (piece === 3) { // Siyah Vezir (tüm çaprazlara atlayabilir)
        if (jumpedPiece === 1 || jumpedPiece === 3) return false;
    } else if (piece === 4) { // Beyaz Vezir (tüm çaprazlara atlayabilir)
        if (jumpedPiece === 2 || jumpedPiece === 4) return false;
    }
    
    return true;
}

function canPlayerJump(board, player) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if ((player === 'black' && (piece === 1 || piece === 3)) ||
                (player === 'white' && (piece === 2 || piece === 4))) {
                
                // Her yöne 2 kare atlama kontrolü
                const possibleJumps = [[r + 2, c + 2], [r + 2, c - 2], [r - 2, c + 2], [r - 2, c - 2]];
                for (const [jumpR, jumpC] of possibleJumps) {
                    if (jumpR >= 0 && jumpR < 8 && jumpC >= 0 && jumpC < 8) {
                        if (isValidJump(board, r, c, jumpR, jumpC, player)) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    return false;
}

function getAvailableMoves(board, r, c, currentPlayer) {
    const moves = [];
    const piece = board[r][c];

    // Piyon veya Vezir için hareket yönleri
    const directions = piece === 1 ? [[1, -1], [1, 1]] : // Siyah piyon (aşağı)
                       piece === 2 ? [[-1, -1], [-1, 1]] : // Beyaz piyon (yukarı)
                       [[1, -1], [1, 1], [-1, -1], [-1, 1]]; // Vezir (tüm çaprazlar)

    for (const [dr, dc] of directions) {
        // Basit hareket
        const newR = r + dr;
        const newC = c + dc;
        if (newR >= 0 && newR < 8 && newC >= 0 && newC < 8 && board[newR][newC] === 0) {
            if(piece === 1 || piece === 2) { // Piyonlar için sadece tek kare hareket
                 if(isValidMove(board, r, c, newR, newC, currentPlayer)) {
                    moves.push({ from: [r, c], to: [newR, newC], type: 'move' });
                 }
            } else { // Vezirler için çoklu kare hareket
                 let tempR = r + dr;
                 let tempC = c + dc;
                 while(tempR >= 0 && tempR < 8 && tempC >= 0 && tempC < 8 && board[tempR][tempC] === 0) {
                    moves.push({ from: [r, c], to: [tempR, tempC], type: 'move' });
                    tempR += dr;
                    tempC += dc;
                 }
            }
        }

        // Atlama hareketleri
        const jumpR = r + dr * 2;
        const jumpC = c + dc * 2;
        if (jumpR >= 0 && jumpR < 8 && jumpC >= 0 && jumpC < 8 && board[jumpR][jumpC] === 0) {
            const jumpedRow = r + dr;
            const jumpedCol = c + dc;
            const jumpedPiece = board[jumpedRow][jumpedCol];

            if (jumpedPiece !== 0) {
                // Rakip taşı üzerinden atlanıyor mu?
                const isOpponent = (currentPlayer === 'black' && (jumpedPiece === 2 || jumpedPiece === 4)) ||
                                   (currentPlayer === 'white' && (jumpedPiece === 1 || jumpedPiece === 3));
                if (isOpponent) {
                    moves.push({ from: [r, c], to: [jumpR, jumpC], type: 'jump', jumped: [jumpedRow, jumpedCol] });
                }
            }
        }
    }
    return moves;
}

function hasAnyMoves(board, playerColor) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if ((playerColor === 'black' && (piece === 1 || piece === 3)) ||
                (playerColor === 'white' && (piece === 2 || piece === 4))) {
                const moves = getAvailableMoves(board, r, c, playerColor);
                const possibleJumps = moves.filter(m => m.type === 'jump');
                const possibleMoves = moves.filter(m => m.type === 'move');
                
                if (possibleJumps.length > 0 || (possibleJumps.length === 0 && possibleMoves.length > 0)) {
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

io.on('connection', (socket) => {
  console.log('Bir kullanıcı bağlandı:', socket.id);

  socket.on('createRoom', () => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase(); 
    socket.join(roomId);
    
    games[roomId] = {
      board: initializeCheckersBoard(), 
      players: { 'black': socket.id, 'white': null },
      turn: 'black', // Siyah başlar
      lastMoveWasJump: false,
      jumpChainPiece: null // Hangi taşın zincirleme atladığını takip eder
    };
    
    socket.emit('roomCreated', { roomId: roomId, color: 'black' });
    console.log(`Oda kuruldu: ${roomId} - Kurucu (Siyah): ${socket.id}`);
  });

  socket.on('joinRoom', (roomId) => {
    roomId = roomId.toUpperCase();
    const room = io.sockets.adapter.rooms.get(roomId);
    let game = games[roomId];

    if (!room || !game || game.players['white']) { // Oda yoksa veya beyaz oyuncu doluysa
      return socket.emit('error', 'Oda bulunamadı veya dolu.');
    }
    
    socket.join(roomId);
    game.players['white'] = socket.id;
    
    console.log(`Oyuncu ${socket.id} odaya katıldı (Beyaz): ${roomId}`);
    
    // Her iki oyuncuya da oyunun başladığını ve tahtayı gönder
    io.to(roomId).emit('gameStart', {
      board: game.board,
      turn: game.turn
    });
  });

  socket.on('makeMove', (data) => {
    const { roomId, from, to } = data;
    const game = games[roomId];

    if (!game) return;

    const currentPlayerColor = game.turn;
    const currentPlayerId = game.players[currentPlayerColor];
    if (socket.id !== currentPlayerId) {
      return socket.emit('error', 'Sıra sizde değil.');
    }

    const fromRow = parseInt(from.split('-')[1]);
    const fromCol = parseInt(from.split('-')[2]);
    const toRow = parseInt(to.split('-')[1]);
    const toCol = parseInt(to.split('-')[2]);

    const piece = game.board[fromRow][fromCol];
    const isKing = (piece === 3 || piece === 4); // Vezir mi?
    
    // Geçerli oyuncuya ait taş mı?
    if ((currentPlayerColor === 'black' && !(piece === 1 || piece === 3)) ||
        (currentPlayerColor === 'white' && !(piece === 2 || piece === 4))) {
        return socket.emit('error', 'Kendi taşını seçmelisin.');
    }

    // Zincirleme atlama kontrolü: Eğer önceki hamle atlamaydı ve bu taş aynı taş değilse
    if (game.lastMoveWasJump && game.jumpChainPiece && (game.jumpChainPiece.row !== fromRow || game.jumpChainPiece.col !== fromCol)) {
        return socket.emit('error', 'Önceki hamle atlamaydı, aynı taşla atlamaya devam etmelisin.');
    }
    
    // Atlanacak bir hamle var mı?
    const mustJump = canPlayerJump(game.board, currentPlayerColor);
    let moveMade = false;

    // Önce atlama hamlelerini kontrol et
    const availableJumps = getAvailableMoves(game.board, fromRow, fromCol, currentPlayerColor).filter(m => m.type === 'jump');
    const targetJump = availableJumps.find(m => m.to[0] === toRow && m.to[1] === toCol);

    if (targetJump) { // Atlama hamlesi ise
        game.board[toRow][toCol] = piece;
        game.board[fromRow][fromCol] = 0;
        game.board[targetJump.jumped[0]][targetJump.jumped[1]] = 0; // Atlanan taşı kaldır
        moveMade = true;
        game.lastMoveWasJump = true;
        game.jumpChainPiece = { row: toRow, col: toCol };

        // Piyon terfisi kontrolü
        if (piece === 1 && toRow === 7) game.board[toRow][toCol] = 3; // Siyah Vezir
        if (piece === 2 && toRow === 0) game.board[toRow][toCol] = 4; // Beyaz Vezir

        // Zincirleme atlama mümkün mü?
        const nextJumps = getAvailableMoves(game.board, toRow, toCol, currentPlayerColor).filter(m => m.type === 'jump');
        if (nextJumps.length > 0) {
            io.to(roomId).emit('boardUpdate', { 
                board: game.board, 
                turn: currentPlayerColor, // Sıra aynı oyuncuda kalır
                mustJumpAgain: true,
                from: {row: fromRow, col: fromCol}, // Nereden geldiğini gönder
                to: {row: toRow, col: toCol} // Nereye gittiğini gönder
            });
            return; // Zincirleme atlama devam ediyor
        }
        
    } else if (!mustJump) { // Atlama zorunluluğu yoksa normal hareket yapabilir
        const availableMoves = getAvailableMoves(game.board, fromRow, fromCol, currentPlayerColor).filter(m => m.type === 'move');
        const targetMove = availableMoves.find(m => m.to[0] === toRow && m.to[1] === toCol);

        if (targetMove) {
            game.board[toRow][toCol] = piece;
            game.board[fromRow][fromCol] = 0;
            moveMade = true;
            game.lastMoveWasJump = false;
            game.jumpChainPiece = null;

            // Piyon terfisi kontrolü
            if (piece === 1 && toRow === 7) game.board[toRow][toCol] = 3; // Siyah Vezir
            if (piece === 2 && toRow === 0) game.board[toRow][toCol] = 4; // Beyaz Vezir
        }
    }

    if (moveMade) {
        // Sırayı değiştir
        game.turn = (game.turn === 'black') ? 'white' : 'black';
        
        // Oyun bitiş kontrolü (rakip taşları bitti mi veya hareket edemiyor mu?)
        const opponentColor = (game.turn === 'black') ? 'white' : 'black';
        let opponentPiecesCount = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = game.board[r][c];
                if ((opponentColor === 'black' && (p === 1 || p === 3)) ||
                    (opponentColor === 'white' && (p === 2 || p === 4))) {
                    opponentPiecesCount++;
                }
            }
        }

        if (opponentPiecesCount === 0) {
            io.to(roomId).emit('gameOver', { winner: currentPlayerColor, reason: 'Tüm rakip taşlarını yedi!' });
            cleanupRoom(roomId);
            return;
        }
        
        if (!hasAnyMoves(game.board, opponentColor)) {
            io.to(roomId).emit('gameOver', { winner: currentPlayerColor, reason: 'Rakip hareket edemiyor!' });
            cleanupRoom(roomId);
            return;
        }

        io.to(roomId).emit('boardUpdate', { 
            board: game.board, 
            turn: game.turn,
            from: {row: fromRow, col: fromCol},
            to: {row: toRow, col: toCol}
        });

    } else {
        socket.emit('error', 'Geçersiz hamle veya atlama zorunluluğu var.');
    }
  });

  socket.on('leaveRoom', (roomId) => {
    roomId = roomId.toUpperCase();
    socket.leave(roomId);
    if (games[roomId]) {
      // Eğer odada kalan tek oyuncu ayrılıyorsa odayı temizle
      const remainingPlayers = io.sockets.adapter.rooms.get(roomId)?.size || 0;
      if (remainingPlayers === 0) {
        cleanupRoom(roomId);
      } else {
        socket.to(roomId).emit('opponentLeft', 'Rakibiniz oyundan ayrıldı.');
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Bir kullanıcı ayrıldı:', socket.id);
    // Ayrılan oyuncuyu ve odasını bul
    for (const roomId in games) {
      if (games[roomId].players['black'] === socket.id || games[roomId].players['white'] === socket.id) {
        console.log(`Oyuncu ${socket.id}, ${roomId} odasından ayrıldı.`);
        io.to(roomId).emit('opponentLeft', 'Rakibiniz oyundan ayrıldı.');
        cleanupRoom(roomId);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ŞAŞKİ Sunucusu ${PORT} portunda çalışıyor.`);
});
