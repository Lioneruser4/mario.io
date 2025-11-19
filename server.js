// server.js (Node.js/Express/Socket.io - Profesyonel Dama Uygulaması)

const express = require('express');
const http = require = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const rooms = {}; 
let matchmakingQueue = [];

// =================================================================
// ♟️ DOMAIN: AMERİKAN DAMASI (CHECKERS) MOTORU - (CheckerBoard Class)
// =================================================================

class CheckerBoard {
    constructor() {
        this.board = Array(8).fill(null).map(() => Array(8).fill('E'));
        this.initializeBoard();
    }

    initializeBoard() {
        // Kırmızı (R) ve Siyah (B) taşları tahtaya yerleştirme
        for (let r = 0; r < 3; r++) { // Kırmızı (Üst 3 sıra)
            for (let c = 0; c < 8; c++) {
                if ((r + c) % 2 !== 0) this.board[r][c] = 'R';
            }
        }
        for (let r = 5; r < 8; r++) { // Siyah (Alt 3 sıra)
            for (let c = 0; c < 8; c++) {
                if ((r + c) % 2 !== 0) this.board[r][c] = 'B';
            }
        }
    }

    getPiece(r, c) {
        if (r < 0 || r >= 8 || c < 0 || c >= 8) return null;
        return this.board[r][c];
    }
    
    // Yeme zorunluluğunu kontrol ederek geçerli hamleleri döndürür
    getValidMoves(playerColor) {
        const moves = [];
        let forceJump = false; 

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPiece(r, c);
                if (piece !== 'E' && piece.startsWith(playerColor)) {
                    const jumpMoves = this.getJumpsFrom(r, c);
                    if (jumpMoves.length > 0) {
                        moves.push(...jumpMoves);
                        forceJump = true;
                    }
                }
            }
        }

        if (forceJump) return moves; // Yeme zorunluluğu varsa sadece yemeleri döndür

        // Yeme zorunluluğu yoksa normal hareketleri döndür
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPiece(r, c);
                if (piece !== 'E' && piece.startsWith(playerColor)) {
                    moves.push(...this.getNormalMovesFrom(r, c));
                }
            }
        }
        return moves;
    }

    // Normal hamleleri hesapla
    getNormalMovesFrom(r, c) {
        const piece = this.getPiece(r, c);
        const moves = [];
        const isKing = piece.endsWith('K');
        const isRed = piece.startsWith('R');
        const direction = isRed ? 1 : -1;

        const checkMove = (nextR, nextC) => {
            if (nextR >= 0 && nextR < 8 && nextC >= 0 && nextC < 8 && this.getPiece(nextR, nextC) === 'E') {
                moves.push({ from: { r, c }, to: { r: nextR, c: nextC }, type: 'move' });
            }
        };

        // İleriye hareket
        checkMove(r + direction, c - 1);
        checkMove(r + direction, c + 1);

        // Kral ise geriye hareket de mümkün
        if (isKing) {
            checkMove(r - direction, c - 1);
            checkMove(r - direction, c + 1);
        }
        return moves;
    }

    // Yeme (Jump) hamlelerini hesapla
    getJumpsFrom(r, c) {
        const piece = this.getPiece(r, c);
        const jumps = [];
        const isKing = piece.endsWith('K');
        const player = piece.charAt(0);
        const opponent = player === 'R' ? 'B' : 'R';

        const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]]; // Tüm 4 çapraz yön

        for (const [dirR, dirC] of directions) {
            // Yön kontrolü: Sadece Kral, ileri ve geri gidebilir. Normal taşlar sadece ileri gidebilir.
            const isForward = (player === 'R' && dirR > 0) || (player === 'B' && dirR < 0);

            if (!isKing && !isForward) continue; // Normal taşlar geriye yiyemez

            const jumpedR = r + dirR;
            const jumpedC = c + dirC;
            const landR = r + 2 * dirR;
            const landC = c + 2 * dirC;

            const jumpedPiece = this.getPiece(jumpedR, jumpedC);
            const landSquare = this.getPiece(landR, landC);

            if (jumpedPiece && jumpedPiece.startsWith(opponent) && landSquare === 'E') {
                jumps.push({ 
                    from: { r, c }, 
                    to: { r: landR, c: landC }, 
                    type: 'jump',
                    captured: { r: jumpedR, c: jumpedC }
                });
            }
        }
        return jumps;
    }

    // Hamleyi gerçekleştirir ve çoklu yeme zorunluluğu olup olmadığını döndürür
    makeMove(move) {
        const { from, to, captured } = move;
        const piece = this.getPiece(from.r, from.c);

        this.board[to.r][to.c] = piece;
        this.board[from.r][from.c] = 'E';

        if (captured) {
            this.board[captured.r][captured.c] = 'E'; // Rakip taşı sil
            // Vezir yükselince çoklu yeme yapamaz kuralı (Bazı varyantlarda geçerlidir, burada varsayılanı uyguluyoruz)
            if ((piece === 'R' && to.r === 7) || (piece === 'B' && to.r === 0)) {
                 this.board[to.r][to.c] = piece.charAt(0) + 'K'; // Kral yap
                 return { multiJump: false }; // Kral olunca sıranın geçmesi yaygındır
            }

            // Çoklu yeme kontrolü
            if (this.getJumpsFrom(to.r, to.c).length > 0) {
                return { multiJump: true };
            }
        }

        // Vezir (King) yükseltmesi (Yeme dışındaki hareketlerde)
        if (piece === 'R' && to.r === 7) this.board[to.r][to.c] = 'RK';
        else if (piece === 'B' && to.r === 0) this.board[to.r][to.c] = 'BK';

        return { multiJump: false };
    }
}

// =================================================================
// 🕹️ OYUN YÖNETİCİSİ VE AKIŞI (DamaGameManager Class)
// =================================================================

class DamaGameManager {
    constructor(players, roomCode) {
        this.board = new CheckerBoard();
        this.players = players; // [RedId, BlackId]
        this.playerColors = { [players[0]]: 'R', [players[1]]: 'B' };
        this.currentPlayerId = players[0]; // Kırmızı başlar
        this.roomCode = roomCode;
        this.gameState = 'playing';
    }

    getGameState() {
        return {
            board: this.board.board,
            turnId: this.currentPlayerId,
            playerColors: this.playerColors,
            gameState: this.gameState,
            redPieces: this.countPieces('R'),
            blackPieces: this.countPieces('B')
        };
    }
    
    // Oyun Sonu Kontrolü (Rakibin taşı kalmadıysa veya hareket edemiyorsa)
    countPieces(color) {
        let count = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.board.board[r][c].startsWith(color)) count++;
            }
        }
        return count;
    }
    
    checkGameEnd() {
        const redMoves = this.board.getValidMoves('R').length;
        const blackMoves = this.board.getValidMoves('B').length;
        
        if (this.countPieces('B') === 0 || blackMoves === 0) {
            this.gameState = 'finished';
            return { winner: this.players[0] }; // Kırmızı Kazanır
        }
        if (this.countPieces('R') === 0 || redMoves === 0) {
            this.gameState = 'finished';
            return { winner: this.players[1] }; // Siyah Kazanır
        }
        return null;
    }
}


// =================================================================
// 🌐 SOCKET.IO GERÇEK ZAMANLI İLETİŞİM
// =================================================================

io.on('connection', (socket) => {
    socket.emit('connection:success', { message: '✅ Sunucuya Başarıyla Bağlanıldı!' });

    // --- LOBİ MANTIĞI ---
    socket.on('matchmaking:start', () => {
        // ... (Matchmaking mantığı önceki Domino projesindeki gibi kalır) ...
        // Eşleşme bulunduğunda yeni DamaGameManager başlatır
    });
    
    socket.on('create:room', () => {
        // ... (Oda kurma mantığı önceki Domino projesindeki gibi kalır) ...
    });
    
    socket.on('join:room', (data) => {
        // ... (Odaya katılma mantığı önceki Domino projesindeki gibi kalır) ...
        // 2. oyuncu katıldığında DamaGameManager başlatır ve oyunu başlatır.
    });


    // --- OYUN İÇİ AKIŞ ---

    socket.on('request:piece_moves', (data) => {
        const { roomCode, piece } = data;
        const room = rooms[roomCode];
        if (!room) return;

        const playerColor = room.game.playerColors[socket.id];
        const allValidMoves = room.game.board.getValidMoves(playerColor);

        // Sadece seçilen taşa ait hamleleri filtrele
        const pieceMoves = allValidMoves.filter(m => m.from.r === piece.r && m.from.c === piece.c);

        socket.emit('valid_moves:response', { moves: pieceMoves, requestedPiece: piece });
    });

    socket.on('game:play', (data) => {
        const { roomCode, move } = data;
        const room = rooms[roomCode];
        if (!room || room.game.currentPlayerId !== socket.id) {
            return socket.emit('play:error', { message: 'Sıra sizde değil veya geçersiz oda.' });
        }

        const playerColor = room.game.playerColors[socket.id];
        const validMoves = room.game.board.getValidMoves(playerColor);

        // Güvenlik kontrolü: İstemcinin gönderdiği hamle sunucunun geçerli hamle listesinde var mı?
        const isValid = validMoves.some(m => 
            m.from.r === move.from.r && m.from.c === move.from.c &&
            m.to.r === move.to.r && m.to.c === move.to.c
        );
        
        if (isValid) {
            const { multiJump } = room.game.board.makeMove(move);

            // Oyun Sonu Kontrolü
            const gameEndResult = room.game.checkGameEnd();
            if (gameEndResult) {
                io.to(roomCode).emit('game:over', gameEndResult);
            }
            
            if (!multiJump) {
                // Sırayı değiştir
                const currentIndex = room.game.players.indexOf(socket.id);
                room.game.currentPlayerId = room.game.players[(currentIndex + 1) % room.game.players.length];
            } else {
                // Çoklu yeme varsa, sıra aynı oyuncuda kalır ve istemciye bilgi gönderilir
                socket.emit('multi_jump_required', { from: move.to });
            }

            // Tahta durumunu ve sırayı güncelle
            io.to(roomCode).emit('game:update', room.game.getGameState());
            
        } else {
            socket.emit('play:error', { message: 'Geçersiz hamle! Kural ihlali.' });
        }
    });

    socket.on('disconnect', () => {
        // ... (Ayrılma mantığı) ...
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
