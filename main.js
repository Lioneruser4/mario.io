// main.js (İstemci Tarafı JavaScript - Tam Professional Dama)

// --- BAĞLANTI VE TEMEL TANIMLAMALAR ---
const SERVER_URL = 'https://mario-io-1.onrender.com';
const socket = io(SERVER_URL);

// DOM Elementleri
const statusDisplay = document.getElementById('status-display');
const lobbyView = document.getElementById('lobby-view');
const gameView = document.getElementById('game-view');
const gameBoardElement = document.getElementById('game-board');
const turnIndicator = document.getElementById('turn-indicator');
const btnMatchmaking = document.getElementById('btn-matchmaking');
const pieceCounter = document.getElementById('piece-counter');

let myPlayerId = null;
let currentRoomCode = null;
let currentBoard = [];
let myColor = null; 
let selectedPiece = null; 
let myTurn = false;
let isMultiJumping = false;

// --- SOCKET.IO OLAY DİNLEYİCİLERİ ---
socket.on('connect', () => { myPlayerId = socket.id; });
socket.on('connection:success', (data) => {
    statusDisplay.textContent = data.message;
    statusDisplay.className = 'status-success';
});
socket.on('connect_error', (error) => {
    statusDisplay.textContent = `❌ Bağlantı Hatası: ${error.message}`;
    statusDisplay.className = 'status-error';
});

socket.on('matchmaking:found', (data) => {
    currentRoomCode = data.roomCode;
    myColor = data.playerColors[myPlayerId];
    statusDisplay.textContent = `✅ Eşleşme Bulundu! Renginiz: ${myColor === 'R' ? 'Kırmızı' : 'Siyah'}`;
    showGameView(data.roomCode);
    btnMatchmaking.textContent = '🏆 Dereceli Oyna'; // İptal/Başlat durumunu sıfırla
});

socket.on('game:update', (data) => {
    currentBoard = data.board;
    myTurn = (data.turnId === myPlayerId);
    isMultiJumping = false; // Normal turda çoklu yeme durumunu sıfırla

    updateTurnIndicator(myTurn, data.turnId, data.playerColors[data.turnId] === 'R' ? 'Kırmızı' : 'Siyah');
    renderBoard(currentBoard);
    updatePieceCounter(data.redPieces, data.blackPieces);
    
    if (myTurn && !isMultiJumping) {
        selectedPiece = null;
        clearHighlights();
        // İpucu: Hareket edebilen bir taş yoksa pas geçme/oyun sonu uyarısı gösterilebilir.
    }
});

socket.on('game:over', (data) => {
    const message = data.winner === myPlayerId ? '🎉 TEBRİKLER! Oyunu kazandınız!' : '😢 KAYBETTİNİZ! Rakibiniz kazandı.';
    alert(message);
    // Oyunu sıfırla, lobiye dön.
});

// ÇOKLU YEME YÖNETİMİ
socket.on('multi_jump_required', (data) => {
    isMultiJumping = true;
    selectedPiece = data.from; 
    statusDisplay.textContent = '❗ ZORUNLU: Devam Etmelisin! (Çoklu Yeme)';
    statusDisplay.className = 'status-warning';
    
    // Zorunlu devam eden taş için yeni hamleleri iste
    socket.emit('request:piece_moves', { roomCode: currentRoomCode, piece: selectedPiece });
});

socket.on('valid_moves:response', (data) => {
    clearHighlights();
    
    if (selectedPiece) {
        // Seçilen taşı vurgula
        document.querySelector(`.checker-tile[data-r="${selectedPiece.r}"][data-c="${selectedPiece.c}"]`).classList.add('selected-piece');
    }

    // Geçerli hedefleri vurgula (Yeşil Glow)
    data.moves.forEach(move => {
        const targetTile = document.querySelector(`.checker-tile[data-r="${move.to.r}"][data-c="${move.to.c}"]`);
        if (targetTile) {
            targetTile.classList.add('highlight-valid');
        }
    });
});

socket.on('play:error', (data) => {
    alert(data.message);
    statusDisplay.textContent = `Hata: ${data.message}`;
    statusDisplay.className = 'status-error';
    // Hata durumunda tahta durumunu sıfırla
    if (!isMultiJumping) clearHighlights();
});

// --- TAHTA ETKİLEŞİMİ ---
gameBoardElement.addEventListener('click', (e) => {
    const tileElement = e.target.closest('.checker-tile');
    if (!tileElement || !myTurn) return;

    const r = parseInt(tileElement.dataset.r);
    const c = parseInt(tileElement.dataset.c);
    const piece = currentBoard[r][c];

    // 1. Taş Seçimi
    if (piece.startsWith(myColor)) {
        if (isMultiJumping && selectedPiece && (r !== selectedPiece.r || c !== selectedPiece.c)) {
            alert('Bu taşla devam etmelisin! (Zorunlu Yeme)');
            return;
        }
        
        selectedPiece = { r, c };
        // Sunucudan sadece bu taş için geçerli hamleleri iste
        socket.emit('request:piece_moves', { roomCode: currentRoomCode, piece: selectedPiece });
        return;
    }
    
    // 2. Hamle Yapma (Hedef Tıklama)
    if (selectedPiece && tileElement.classList.contains('highlight-valid')) {
        const move = { from: selectedPiece, to: { r, c } };
        
        socket.emit('game:play', { roomCode: currentRoomCode, move: move });
        
        if (!isMultiJumping) { // Normal hamle ise veya yeme bittiyse sıfırla
             selectedPiece = null;
             clearHighlights();
        }
    }
});

// --- RENDER VE UI FONKSİYONLARI ---

function renderBoard(board) {
    gameBoardElement.innerHTML = ''; 
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const tile = document.createElement('div');
            const isBlackSquare = (r + c) % 2 !== 0;
            
            tile.className = `checker-tile ${isBlackSquare ? 'black-square' : 'white-square'}`;
            tile.dataset.r = r;
            tile.dataset.c = c;
            
            const pieceCode = board[r][c];
            if (pieceCode !== 'E') {
                const pieceElement = document.createElement('div');
                pieceElement.className = `piece ${pieceCode.toLowerCase()} animated-piece`;
                if (pieceCode.endsWith('K')) {
                    pieceElement.classList.add('is-king');
                    pieceElement.innerHTML = '👑';
                }
                tile.appendChild(pieceElement);
            }
            gameBoardElement.appendChild(tile);
        }
    }
}

function updateTurnIndicator(isMyTurn, turnId, colorName) {
    if (isMyTurn) {
        turnIndicator.innerHTML = 'SIRA SENDE! <span class="turn-glow">💡</span>';
        turnIndicator.classList.add('is-my-turn');
    } else {
        turnIndicator.textContent = `Sıra: ${colorName} (${turnId.substring(0, 8)}...)`;
        turnIndicator.classList.remove('is-my-turn');
    }
}

function updatePieceCounter(red, black) {
    pieceCounter.innerHTML = `
        <span class="red-count">🔴 Kırmızı: ${red}</span>
        <span class="black-count">⚫ Siyah: ${black}</span>
    `;
}

function clearHighlights() {
    document.querySelectorAll('.highlight-valid, .selected-piece').forEach(el => {
        el.classList.remove('highlight-valid', 'selected-piece');
    });
}

function showGameView(roomCode) {
    lobbyView.classList.add('hidden');
    gameView.classList.remove('hidden');
    document.getElementById('room-code-display').textContent = `Oda: ${roomCode}`;
}

// --- LOBİ BUTONLARI ---
btnMatchmaking.addEventListener('click', () => {
    // Daha profesyonel bir eşleşme arama animasyonu
    btnMatchmaking.textContent = 'Eşleşme Aranıyor... (İptal)';
    socket.emit('matchmaking:start');
});

// ... (Diğer lobi butonlarının olay dinleyicileri) ...
