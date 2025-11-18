// gameLogic.js
// Tahta Değerleri: 0: Boş, 1: Beyaz Taş, 2: Siyah Taş, 3: Beyaz Dam, 4: Siyah Dam
const PIECES = { WHITE: 1, BLACK: 2, WHITE_KING: 3, BLACK_KING: 4, EMPTY: 0 };
const PLAYER_ROLES = { white: [PIECES.WHITE, PIECES.WHITE_KING], black: [PIECES.BLACK, PIECES.BLACK_KING] };

/**
 * Başlangıç Oyun Durumunu Oluşturur
 * @param {string} whitePlayerId - Beyaz oyuncu Socket ID
 * @param {string} blackPlayerId - Siyah oyuncu Socket ID
 * @returns {object} Yeni oyun durumu
 */
const initialGameState = (whitePlayerId, blackPlayerId) => ({
    board: [
        [0, 2, 0, 2, 0, 2, 0, 2],
        [2, 0, 2, 0, 2, 0, 2, 0],
        [0, 2, 0, 2, 0, 2, 0, 2],
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
        [1, 0, 1, 0, 1, 0, 1, 0],
        [0, 1, 0, 1, 0, 1, 0, 1],
        [1, 0, 1, 0, 1, 0, 1, 0]
    ],
    playerTurn: 'white', 
    players: { white: whitePlayerId, black: blackPlayerId },
    gameOver: false,
    winner: null,
    // Zorunlu yakalama varsa bu taşın konumunu tutar. (Rus damasında zorunludur)
    mustCapturePiece: null 
});

/**
 * Seçilen taş için geçerli hamleleri ve zorunlu yakalamaları hesaplar.
 * (Bu fonksiyon çok karmaşıktır, burada sadece iskeleti verilmiştir)
 * @param {number[][]} board - Tahta durumu
 * @param {number} r - Satır (row)
 * @param {number} c - Sütun (column)
 * @returns {object[]} Olası hamleler dizisi: { to: [r, c], capture: [r_cap, c_cap] }
 */
const calculateValidMoves = (board, r, c) => {
    const piece = board[r][c];
    const moves = [];
    const isKing = piece === PIECES.WHITE_KING || piece === PIECES.BLACK_KING;
    const isWhite = piece === PIECES.WHITE || piece === PIECES.WHITE_KING;
    
    // Basit hareketler (Dama Kurallarına göre)
    // ...

    // Yakalama hareketleri (Zorunlu yakalamayı kontrol etmeyi unutmayın!)
    // ...

    return moves;
};

/**
 * Oyuncu hamle yapmak istediğinde tahta durumunu günceller.
 * @param {object} gameState - Mevcut oyun durumu
 * @param {object} move - Hamle: { from: [r1, c1], to: [r2, c2] }
 * @param {string} playerRole - Hamleyi yapan oyuncu ('white' veya 'black')
 * @returns {object|null} Yeni oyun durumu veya geçersiz hamle ise null
 */
const attemptMove = (gameState, move, playerRole) => {
    // 1. Oyuncu sırası mı? Kontrol et.
    if (gameState.playerTurn !== playerRole) return null;

    // 2. Hamlenin geçerliliğini kontrol et (calculateValidMoves ile)
    const validMoves = calculateValidMoves(gameState.board, move.from[0], move.from[1]);
    const isValid = validMoves.some(m => m.to[0] === move.to[0] && m.to[1] === move.to[1]);

    if (!isValid) return null; // Geçersiz hamle

    // Yeni tahta durumunu kopyala
    const newBoard = JSON.parse(JSON.stringify(gameState.board));
    const pieceToMove = newBoard[move.from[0]][move.from[1]];

    // 3. Taşı hareket ettir
    newBoard[move.to[0]][move.to[1]] = pieceToMove;
    newBoard[move.from[0]][move.from[1]] = PIECES.EMPTY;

    // 4. Yakalama varsa, yakalanan taşı kaldır
    const captured = validMoves.find(m => m.to[0] === move.to[0] && m.to[1] === move.to[1] && m.capture);
    if (captured && captured.capture) {
        newBoard[captured.capture[0]][captured.capture[1]] = PIECES.EMPTY;
        // Zorunlu zincirleme yakalama kontrolü (Rus Daması kuralı)
        // ...
    }

    // 5. Taç (King/Dam) kontrolü
    // Beyaz son sıraya ulaşırsa KİNG olur (r=0)
    if (pieceToMove === PIECES.WHITE && move.to[0] === 0) {
        newBoard[move.to[0]][move.to[1]] = PIECES.WHITE_KING;
    }
    // Siyah son sıraya ulaşırsa KİNG olur (r=7)
    if (pieceToMove === PIECES.BLACK && move.to[0] === 7) {
        newBoard[move.to[0]][move.to[1]] = PIECES.BLACK_KING;
    }

    // 6. Sırayı Değiştir (Zincirleme yakalama yoksa)
    let nextTurn = playerRole === 'white' ? 'black' : 'white';
    
    // 7. Oyun Sonu Kontrolü (Rakibin hiç taşı kalmadıysa veya hiç hamlesi yoksa)
    // ...

    return {
        ...gameState,
        board: newBoard,
        playerTurn: nextTurn,
        mustCapturePiece: null, // Zincirleme yakalama yoksa temizle
        // gameOver ve winner güncellenir
    };
};

module.exports = {
    initialGameState,
    calculateValidMoves,
    attemptMove
};
