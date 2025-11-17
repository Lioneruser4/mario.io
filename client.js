// client.js

// !!! BURAYI DEĞİŞTİRİN !!!
// Bu, sizin Render sunucunuzun adresi olmalı.
const SERVER_URL = "https://mario-io-1.onrender.com"; 

const socket = io(SERVER_URL);

// --- DOM Elementleri ---
const lobby = document.getElementById('lobby');
const gameArea = document.getElementById('gameArea');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const lobbyInfo = document.getElementById('lobbyInfo');
const boardDiv = document.getElementById('board');
const gameStatus = document.getElementById('gameStatus');
const roomInfo = document.getElementById('roomInfo');
const playerWhiteDiv = document.getElementById('playerWhite');
const playerBlackDiv = document.getElementById('playerBlack');

// --- Oyun Durumu (Global) ---
let currentBoard = [];
let myColor = null; // 'w' veya 'b'
let currentTurn = null;
let selectedPiece = null; // { row, col, piece }
let validMoves = []; // Gösterilecek geçerli hamleler


// ===================================
// LOBİ FONKSİYONLARI
// ===================================

createRoomBtn.addEventListener('click', () => {
    socket.emit('createRoom');
});

joinRoomBtn.addEventListener('click', () => {
    const roomCode = roomCodeInput.value;
    if (roomCode) {
        socket.emit('joinRoom', roomCode);
    }
});

socket.on('roomCreated', (data) => {
    lobbyInfo.textContent = `Oda kuruldu: ${data.roomCode}. Rakip bekleniyor...`;
    myColor = data.playerColor;
});

socket.on('errorMsg', (msg) => {
    alert(msg);
});

// ===================================
// OYUN BAŞLATMA
// ===================================

socket.on('gameStart', (data) => {
    lobby.classList.add('hidden');
    gameArea.classList.remove('hidden');
    
    roomInfo.textContent = `Oda: ${data.roomCode}`;
    currentBoard = data.board;
    
    // Oyuncu renklerini ayarla
    if (socket.id === data.playerMap.w) {
        myColor = 'w';
        playerWhiteDiv.textContent = "Beyaz (Siz)";
        playerBlackDiv.textContent = "Siyah (Rakip)";
    } else {
        myColor = 'b';
        playerWhiteDiv.textContent = "Beyaz (Rakip)";
        playerBlackDiv.textContent = "Siyah (Siz)";
    }

    // İlk durumu güncelle
    updateGameState(data.board, data.turn);
});

socket.on('updateState', (data) => {
    updateGameState(data.board, data.turn);
});

socket.on('opponentLeft', () => {
    alert("Rakibiniz oyundan ayrıldı. Oda kapatıldı.");
    gameArea.classList.add('hidden');
    lobby.classList.remove('hidden');
});


function updateGameState(board, turn) {
    currentBoard = board;
    currentTurn = turn;
    renderBoard();
    highlightTurn();
}

// ===================================
// OYUN TAHTASI VE GÖRSELLEŞTİRME
// ===================================

function renderBoard() {
    boardDiv.innerHTML = ""; // Tahtayı temizle
    
    // Türk Daması tahtası genellikle tersten başlar (Siyahlar üstte)
    // Biz standart dizilimi koruyup CSS ile düzeltebiliriz.
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.classList.add((r + c) % 2 === 0 ? 'light' : 'dark');
            cell.dataset.row = r;
            cell.dataset.col = c;

            const pieceType = currentBoard[r][c];
            if (pieceType !== 'e') {
                const piece = document.createElement('div');
                piece.classList.add('piece', pieceType); // piece w, piece b, piece wk...
                cell.appendChild(piece);
            }
            boardDiv.appendChild(cell);
        }
    }
}

// Sıra kimdeyse "ışıklı" yap
function highlightTurn() {
    if (currentTurn === 'w') {
        playerWhiteDiv.classList.add('player-turn');
        playerBlackDiv.classList.remove('player-turn');
        gameStatus.textContent = "Sıra Beyazda";
    } else {
        playerBlackDiv.classList.add('player-turn');
        playerWhiteDiv.classList.remove('player-turn');
        gameStatus.textContent = "Sıra Siyahta";
    }
}

// ===================================
// OYUN MANTIĞI VE HAMLE GÖSTERME
// ===================================

boardDiv.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return; // Hücre dışına tıklandı

    if (currentTurn !== myColor) {
        return; // Sıra bende değil
    }

    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const piece = currentBoard[row][col];

    // 1. ADIM: Geçerli bir hamle hücresine mi tıkladı?
    if (cell.classList.contains('valid-move')) {
        const move = {
            from: { row: selectedPiece.row, col: selectedPiece.col },
            to: { row, col }
        };
        socket.emit('makeMove', { roomCode: roomCodeInput.value || lobbyInfo.textContent.split(': ')[1].split('.')[0], ...move });
        
        // Seçimi ve vurguları temizle
        clearHighlights();
        selectedPiece = null;
        return;
    }

    // 2. ADIM: Kendi taşına mı tıkladı?
    clearHighlights(); // Önceki vurguları temizle

    if (piece !== 'e' && piece.startsWith(myColor)) {
        // Evet, kendi taşına tıkladı.
        selectedPiece = { row, col, piece };
        cell.classList.add('selected-piece'); // Taşı vurgula
        
        // İstenen özellik: Geçerli hamleleri hesapla ve göster
        validMoves = getValidMoves(row, col, piece, currentBoard); 
        highlightValidMoves(validMoves);
    } else {
        selectedPiece = null;
    }
});

function clearHighlights() {
    document.querySelectorAll('.selected-piece').forEach(el => el.classList.remove('selected-piece'));
    document.querySelectorAll('.valid-move').forEach(el => el.classList.remove('valid-move'));
}

function highlightValidMoves(moves) {
    moves.forEach(move => {
        const cell = document.querySelector(`.cell[data-row='${move.to.row}'][data-col='${move.to.col}']`);
        if (cell) {
            cell.classList.add('valid-move');
        }
    });
}

/**
 * Türk Daması (Şaşki) Hamle Mantığı (Basitleştirilmiş)
 * DİKKAT: Bu fonksiyon Türk Damasının tüm kurallarını (örn: zorunlu taş yeme, en çok taşı yeme zorunluluğu)
 * İÇERMEZ. Bu, profesyonel bir oyun için en çok geliştirilmesi gereken yerdir.
 */
function getValidMoves(r, c, piece, board) {
    const moves = [];
    const color = piece[0]; // 'w' or 'b'
    const isKing = piece.length > 1; // 'wk' or 'bk'

    if (isKing) {
        // Dama (King) mantığı: Yatay ve dikeyde boşluk boyunca gider
        // (Bu kısım çok daha karmaşıktır, taşların üzerinden atlamayı da hesaba katmalı)
        // Örnek: Basit Dikey İlerleme
        for (let i = r + 1; i < 8; i++) {
            if (board[i][c] === 'e') moves.push({ from: {r,c}, to: {row: i, col: c} });
            else break;
        }
        for (let i = r - 1; i >= 0; i--) {
            if (board[i][c] === 'e') moves.push({ from: {r,c}, to: {row: i, col: c} });
            else break;
        }
        // ... Yatay hamleler de eklenmeli ...
    } else {
        // Normal taş mantığı (Piyon)
        const forwardDir = (color === 'w') ? -1 : 1; // Beyaz yukarı (-1), Siyah aşağı (+1)

        // 1. Düz İlerleme
        const straightMove = { row: r + forwardDir, col: c };
        if (isValidPos(straightMove.row, straightMove.col) && board[straightMove.row][straightMove.col] === 'e') {
            moves.push({ from: {r,c}, to: straightMove });
        }

        // 2. Yanlara İlerleme (Türk Damasına özel)
        const leftMove = { row: r, col: c - 1 };
        if (isValidPos(leftMove.row, leftMove.col) && board[leftMove.row][leftMove.col] === 'e') {
            moves.push({ from: {r,c}, to: leftMove });
        }
        const rightMove = { row: r, col: c + 1 };
        if (isValidPos(rightMove.row, rightMove.col) && board[rightMove.row][rightMove.col] === 'e') {
            moves.push({ from: {r,c}, to: rightMove });
        }
        
        // 3. Taş Yeme (Basit)
        // (Zorunlu yeme ve çoklu yeme mantığı burada eksik)
        const captureDirs = [
            { r: forwardDir, c: 0 }, // İleri
            { r: 0, c: -1 }, // Sol
            { r: 0, c: 1 }  // Sağ
        ];
        
        for (const dir of captureDirs) {
            const enemyPos = { row: r + dir.r, col: c + dir.c };
            const jumpPos = { row: r + dir.r * 2, col: c + dir.c * 2 };
            
            if (isValidPos(enemyPos.row, enemyPos.col) && 
                isValidPos(jumpPos.row, jumpPos.col) && 
                board[jumpPos.row][jumpPos.col] === 'e' && 
                isOpponent(board[enemyPos.row][enemyPos.col], color))
            {
                moves.push({ from: {r,c}, to: jumpPos, isCapture: true });
            }
        }
    }
    
    // BURADA ZORUNLU YEME KURALI UYGULANMALI
    // Eğer 'moves' içinde isCapture:true olan varsa, diğer hamleler filtrelenmeli.

    return moves;
}

function isValidPos(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isOpponent(piece, myColor) {
    if (piece === 'e') return false;
    return piece[0] !== myColor;
}
