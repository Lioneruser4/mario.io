// server.js - Dama Motoru İçin Temel Sınıflar ve Mantık

class CheckerBoard {
    constructor() {
        // 8x8 tahta, 'E' (Boş), 'R' (Kırmızı), 'B' (Siyah), 'RK' (Kırmızı Kral), 'BK' (Siyah Kral)
        this.board = Array(8).fill(null).map(() => Array(8).fill('E'));
        this.initializeBoard();
    }

    initializeBoard() {
        // Kırmızı (Red) taşlar (Üstte)
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 8; c++) {
                if ((r + c) % 2 !== 0) { // Sadece siyah karelere (r+c tek olanlar)
                    this.board[r][c] = 'R';
                }
            }
        }
        // Siyah (Black) taşlar (Altta)
        for (let r = 5; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if ((r + c) % 2 !== 0) {
                    this.board[r][c] = 'B';
                }
            }
        }
    }

    getPiece(r, c) {
        if (r < 0 || r >= 8 || c < 0 || c >= 8) return null;
        return this.board[r][c];
    }

    // Taş hareketini ve yeme zorunluluğunu kontrol eden ana fonksiyon
    getValidMoves(playerColor) {
        const moves = [];
        let forceJump = false; // Yeme zorunluluğu

        // Önce yeme hamlelerini kontrol et (Amerikan Dama kuralı)
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

        // Yeme zorunluluğu varsa, sadece yeme hamlelerini döndür
        if (forceJump) {
            return moves;
        }

        // Yeme zorunluluğu yoksa, normal hareketleri ekle
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

    // Normal (1 kare) hareketleri hesapla
    getNormalMovesFrom(r, c) {
        const piece = this.getPiece(r, c);
        const moves = [];
        const isKing = piece.endsWith('K');
        const isRed = piece.startsWith('R');
        const direction = isRed ? 1 : -1; // Kırmızı aşağı (+1), Siyah yukarı (-1)

        const checkMove = (nextR, nextC) => {
            if (nextR >= 0 && nextR < 8 && nextC >= 0 && nextC < 8 && this.getPiece(nextR, nextC) === 'E') {
                moves.push({ from: { r, c }, to: { r: nextR, c: nextC }, type: 'move' });
            }
        };

        // Standart yönler
        if (isKing || isRed) {
            checkMove(r + direction, c - 1);
            checkMove(r + direction, c + 1);
        }
        // Geriye hareket (Sadece Kral için veya Siyah için)
        if (isKing) {
            checkMove(r - direction, c - 1);
            checkMove(r - direction, c + 1);
        }
        // Kral taşların geriye hareketi
        if (isKing && !isRed) { // Siyah Kral
             checkMove(r + 1, c - 1);
             checkMove(r + 1, c + 1);
        }

        return moves;
    }

    // Yeme (Jump) hamlelerini hesapla
    getJumpsFrom(r, c) {
        const piece = this.getPiece(r, c);
        const jumps = [];
        const isKing = piece.endsWith('K');
        const isRed = piece.startsWith('R');
        const player = piece.charAt(0);
        const opponent = player === 'R' ? 'B' : 'R';

        const checkJump = (dirR, dirC) => {
            const jumpedR = r + dirR;
            const jumpedC = c + dirC;
            const landR = r + 2 * dirR;
            const landC = c + 2 * dirC;

            const jumpedPiece = this.getPiece(jumpedR, jumpedC);
            const landSquare = this.getPiece(landR, landC);

            // 1. Atlanan karede rakip taşı olmalı
            // 2. İniş karesi boş olmalı
            if (jumpedPiece && jumpedPiece.startsWith(opponent) && landSquare === 'E') {
                jumps.push({ 
                    from: { r, c }, 
                    to: { r: landR, c: landC }, 
                    type: 'jump',
                    captured: { r: jumpedR, c: jumpedC }
                });
            }
        };

        const forward = isRed ? 1 : -1;
        
        // İleriye doğru atlamalar (Her zaman)
        checkJump(forward, -1);
        checkJump(forward, 1);

        // Geriye doğru atlamalar (Sadece Kral için)
        if (isKing) {
            checkJump(-forward, -1);
            checkJump(-forward, 1);
        }

        return jumps;
    }

    // Hamleyi gerçekleştir
    makeMove(move, playerId) {
        const { from, to, type, captured } = move;
        const piece = this.getPiece(from.r, from.c);

        // Taşı yeni konuma taşı
        this.board[to.r][to.c] = piece;
        this.board[from.r][from.c] = 'E';

        // Yeme işlemi
        if (type === 'jump' && captured) {
            this.board[captured.r][captured.c] = 'E';
            // Çoklu yeme kontrolü (Amerikan Dama kuralı)
            if (this.getJumpsFrom(to.r, to.c).length > 0) {
                // Eğer çoklu yeme varsa, sıra aynı oyuncuda kalır.
                return { multiJump: true };
            }
        }

        // Vezir (King) yükseltmesi
        if (piece === 'R' && to.r === 7) {
            this.board[to.r][to.c] = 'RK';
        } else if (piece === 'B' && to.r === 0) {
            this.board[to.r][to.c] = 'BK';
        }

        return { multiJump: false };
    }
}

// Global Dama Oyunu Yönetimi (server.js'in ana kısmında kullanılacak)
class DamaGameManager {
    constructor(players, roomCode) {
        this.board = new CheckerBoard();
        this.players = players; // [RedId, BlackId]
        this.playerColors = { [players[0]]: 'R', [players[1]]: 'B' };
        this.currentPlayerId = players[0]; // Kırmızı başlar (Üstten)
        this.roomCode = roomCode;
        this.gameState = 'playing';
        // Diğer veriler (skor, oyun sonu kontrolü vb.) buraya gelir.
    }

    getGameState() {
        return {
            board: this.board.board,
            turnId: this.currentPlayerId,
            playerColors: this.playerColors,
            gameState: this.gameState
        };
    }
}
