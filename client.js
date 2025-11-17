// client.js
const SERVER_URL = "https://mario-io-1.onrender.com"; 

// --- DOM Elementleri ---
const connectionStatus = document.getElementById('connectionStatus');
const lobby = document.getElementById('lobby');
const gameArea = document.getElementById('gameArea');

// Lobi Butonları
const rankedBtn = document.getElementById('rankedBtn');
const friendlyBtn = document.getElementById('friendlyBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');

// Modallar
const searchingModal = document.getElementById('searchingModal');
const cancelSearchBtn = document.getElementById('cancelSearchBtn');
const friendlyModal = document.getElementById('friendlyModal');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const copyInfo = document.getElementById('copyInfo');

// Oyun Alanı Elementleri
const boardDiv = document.getElementById('board');
const gameStatus = document.getElementById('gameStatus');
const roomInfo = document.getElementById('roomInfo');
const playerWhiteDiv = document.getElementById('playerWhite');
const playerBlackDiv = document.getElementById('playerBlack');

// --- Oyun Durumu (Global) ---
let currentBoard = [];
let myColor = null;
let currentTurn = null;
let selectedPiece = null;
let validMoves = [];
let currentRoomCode = null;

// ===================================
// SUNUCU BAĞLANTISI
// ===================================

const socket = io(SERVER_URL);

socket.on('connect', () => {
    connectionStatus.textContent = "Bağlandı";
    connectionStatus.style.backgroundColor = "#28a745";
    connectionStatus.style.color = "white";
    lobby.classList.remove('hidden');
});

socket.on('disconnect', () => {
    connectionStatus.textContent = "Bağlantı Kesildi";
    connectionStatus.style.backgroundColor = "#dc3545";
    connectionStatus.style.color = "white";
    // Oyundaysa lobbiye at
    if (!gameArea.classList.contains('hidden')) {
        alert("Sunucuyla bağlantı koptu.");
        showLobby();
    }
});

socket.on('errorMsg', (msg) => {
    alert(msg);
});

// ===================================
// LOBİ İŞLEVLERİ
// ===================================

// 1. Dereceli Oyna
rankedBtn.addEventListener('click', () => {
    socket.emit('joinRankedQueue');
    searchingModal.classList.remove('hidden');
});

cancelSearchBtn.addEventListener('click', () => {
    socket.emit('cancelRankedQueue');
    searchingModal.classList.add('hidden');
});

// 2. Arkadaşla Oyna (Oda Kur)
friendlyBtn.addEventListener('click', () => {
    socket.emit('createFriendlyRoom');
});

socket.on('friendlyRoomCreated', (data) => {
    currentRoomCode = data.roomCode;
    roomCodeDisplay.textContent = data.roomCode;
    friendlyModal.classList.remove('hidden');
    copyInfo.textContent = "";
});

copyCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoomCode).then(() => {
        copyInfo.textContent = "Kopyalandı!";
    }, (err) => {
        copyInfo.textContent = "Kopyalanamadı.";
    });
});

// 3. Odaya Katıl
joinRoomBtn.addEventListener('click', () => {
    const roomCode = roomCodeInput.value;
    if (roomCode && roomCode.length === 4) {
        socket.emit('joinRoom', roomCode);
    } else {
        alert("Lütfen geçerli 4 haneli bir oda kodu girin.");
    }
});

// ===================================
// OYUN BAŞLATMA
// ===================================

function showLobby() {
    gameArea.classList.add('hidden');
    lobby.classList.remove('hidden');
    searchingModal.classList.add('hidden');
    friendlyModal.classList.add('hidden');
    currentRoomCode = null;
}

socket.on('gameStart', (data) => {
    // Tüm lobbi pencerelerini gizle
    lobby.classList.add('hidden');
    searchingModal.classList.add('hidden');
    friendlyModal.classList.add('hidden');
    
    // Oyun alanını göster
    gameArea.classList.remove('hidden');
    
    currentRoomCode = data.roomCode; // Oda kodunu sakla
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
    updateGameState(data.board, data.turn);
});

socket.on('updateState', (data) => {
    updateGameState(data.board, data.turn);
});

socket.on('opponentLeft', () => {
    alert("Rakibiniz oyundan ayrıldı. Lobiye dönülüyor.");
    showLobby();
});


function updateGameState(board, turn) {
    currentBoard = board;
    currentTurn = turn;
    renderBoard();
    highlightTurn();
}

// ===================================
// OYUN TAHTASI VE GÖRSELLEŞTİRME
// (Bu kısım önceki kodla aynı, buraya yapıştırın)
// ===================================

function renderBoard() {
    boardDiv.innerHTML = ""; 
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
                piece.classList.add('piece', pieceType); 
                cell.appendChild(piece);
            }
            boardDiv.appendChild(cell);
        }
    }
}

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
// (Bu kısım önceki kodla aynı, buraya yapıştırın)
// ===================================

boardDiv.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return; 

    if (currentTurn !== myColor) {
        return; 
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
        // Oda kodunu sakladığımız global değişkenden al
        socket.emit('makeMove', { roomCode: currentRoomCode, ...move });
        
        clearHighlights();
        selectedPiece = null;
        return;
    }

    // 2. ADIM: Kendi taşına mı tıkladı?
    clearHighlights(); 

    if (piece !== 'e' && piece.startsWith(myColor)) {
        selectedPiece = { row, col, piece };
        
        // Vurgu için hücreyi değil, içindeki taşı seç
        const pieceElement = cell.querySelector('.piece');
        if (pieceElement) pieceElement.classList.add('selected-piece'); 
        
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
 * DİKKAT: Bu fonksiyon Türk Damasının tüm kurallarını İÇERMEZ.
 */
function getValidMoves(r, c, piece, board) {
    const moves = [];
    const color = piece[0]; 
    const isKing = piece.length > 1; 

    if (isKing) {
        // Dama (King) mantığı (Basit)
        const dirs = [{r:1,c:0}, {r:-1,c:0}, {r:0,c:1}, {r:0,c:-1}];
        for (const dir of dirs) {
            for (let i = 1; i < 8; i++) {
                const newR = r + dir.r * i;
                const newC = c + dir.c * i;
                if (!isValidPos(newR, newC)) break;
                if (board[newR][newC] === 'e') {
                    moves.push({ from: {r,c}, to: {row: newR, col: newC} });
                } else {
                    // Taşa çarptı (Yeme mantığı daha karmaşık)
                    break; 
                }
            }
        }
    } else {
        // Normal taş mantığı (Piyon)
        const forwardDir = (color === 'w') ? -1 : 1; 

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
    
    // Zorunlu Yeme Kuralı (Basit)
    const captures = moves.filter(m => m.isCapture);
    if (captures.length > 0) {
        return captures; // Sadece yeme hamlelerini göster
    }
    return moves;
}

function isValidPos(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isOpponent(piece, myColor) {
    if (piece === 'e') return false;
    return piece[0] !== myColor;
}
