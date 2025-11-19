// main.js

// KONTROL EDİLEN SUNUCU ADRESİ
const SERVER_URL = "https://mario-io-1.onrender.com"; 
const socket = io(SERVER_URL);

// --- DOM ELEMANLARI VE OYUN DURUMU ---
const $ = (id) => document.getElementById(id);
const lobbyScreen = $('lobby-screen');
const gameScreen = $('game-screen');
const connStatus = $('connection-status');
const notificationArea = $('notification-area');
const boardContainer = $('board-container');
const turnIndicator = $('turn-indicator');
const rankedBtn = $('ranked-btn');
const cancelMatchBtn = $('cancel-match-btn');

let currentRoom = null;
let myColor = null; 
let isMyTurn = false;
let selectedPiece = null; 

let boardState = initializeBoard(); 

// --- DAMA KURALLARI (Vurgulama Amaçlı) ---

function initializeBoard() {
    let initial = {};
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 !== 0) initial[`${r}${c}`] = 'R'; 
        }
    }
    for (let r = 5; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 !== 0) initial[`${r}${c}`] = 'B'; 
        }
    }
    return initial;
}

// Yeme Hamlelerini Bulma (Zincirleme kontrolü için)
function findJumps(r, c, isRed, isKing, board, opponentPieces) {
    const jumps = [];
    const checkDirections = [isRed ? 1 : -1];
    if (isKing) checkDirections.push(isRed ? -1 : 1);
    
    for (const dir of checkDirections) {
        for (const colDir of [-1, 1]) { 
            const jumpedR = r + dir;
            const jumpedC = c + colDir;
            const targetR = r + 2 * dir;
            const targetC = c + 2 * colDir;
            
            if (targetR >= 0 && targetR < 8 && targetC >= 0 && targetC < 8) {
                const jumpedPiece = board[`${jumpedR}${jumpedC}`];
                const targetSquare = board[`${targetR}${targetC}`];
                
                if (jumpedPiece && opponentPieces.includes(jumpedPiece) && !targetSquare) {
                    jumps.push({ 
                        from: `${r}${c}`, 
                        to: `${targetR}${targetC}`, 
                        jumped: `${jumpedR}${jumpedC}` 
                    });
                }
            }
        }
    }
    return jumps;
}

function getValidMoves(squareId, board) {
    const moves = [];
    const r = parseInt(squareId[0]);
    const c = parseInt(squareId[1]);
    const pieceType = board[squareId];
    if (!pieceType) return moves; // Taş yoksa hamle yok

    const isKing = pieceType.includes('K');
    const isRed = pieceType.includes('R');
    const opponentPieces = isRed ? ['B', 'BK'] : ['R', 'RK'];
    const direction = isRed ? 1 : -1;
    
    const jumpMoves = findJumps(r, c, isRed, isKing, board, opponentPieces);
    if (jumpMoves.length > 0) {
        // Yeme varsa sadece yeme hamleleri geçerlidir
        return jumpMoves; 
    }

    // Normal hareketler
    const possibleDirections = [direction];
    if (isKing) possibleDirections.push(-direction);

    for (const dir of possibleDirections) {
        for (const colDir of [-1, 1]) {
            const newR = r + dir;
            const newC = c + colDir;
            if (newR >= 0 && newR < 8 && newC >= 0 && newC < 8 && !board[`${newR}${newC}`]) {
                moves.push({ from: squareId, to: `${newR}${newC}` });
            }
        }
    }
    
    return moves;
}

// --- UI / HAREKET MANTIĞI ---

function switchScreen(activeScreen) {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    activeScreen.classList.remove('hidden');
    activeScreen.classList.add('active');
}

function showNotification(message, type = 'info') {
    notificationArea.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    setTimeout(() => notificationArea.innerHTML = '', 5000);
}

function createBoard(state) {
    boardContainer.innerHTML = '<div id="board"></div>';
    const board = $('board');
    
    const isBlackPlayer = myColor === 'Black';

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const squareId = `${r}${c}`;
            const isDarkSquare = (r + c) % 2 !== 0;

            const square = document.createElement('div');
            square.classList.add('square');
            square.classList.add((r + c) % 2 === 0 ? 'light' : 'dark');
            square.dataset.id = squareId; 

            // Tahtanın kendi tarafı altta olacak şekilde grid'e yerleştirme (DÜZELTİLDİ)
            // Siyah oyuncu ise satır 0 (en üst) görünürde 8. satır (en alt) olur.
            const displayR = isBlackPlayer ? (8 - r) : (r + 1); 
            const displayC = c + 1;

            square.style.gridRow = displayR;
            square.style.gridColumn = displayC;

            if (isDarkSquare) {
                square.addEventListener('click', handleBoardClick);
                
                const pieceType = state[squareId];
                if (pieceType) {
                    const piece = document.createElement('div');
                    piece.classList.add('piece');
                    
                    if (pieceType.includes('R')) {
                        piece.classList.add('piece-red');
                    } else if (pieceType.includes('B')) {
                        piece.classList.add('piece-black');
                    }
                    if (pieceType.includes('K')) {
                        piece.innerHTML = '👑'; 
                        piece.classList.add('king');
                    }
                    square.appendChild(piece);
                }
            }
            board.appendChild(square);
        }
    }
}

function handleBoardClick(event) {
    if (!currentRoom || !isMyTurn) {
        showNotification('Sıra sizde değil!', 'warning');
        return;
    }

    const square = event.currentTarget;
    const pieceElement = square.querySelector('.piece');
    const squareId = square.dataset.id;
    
    // 1. TAŞ SEÇİMİ (Taşa dokunma)
    if (pieceElement && squareId in boardState) {
        const pieceType = boardState[squareId];
        
        if ((myColor === 'Red' && pieceType.includes('R')) || 
            (myColor === 'Black' && pieceType.includes('B'))) {
            
            clearHighlights(); // Önceki vurguları ve seçimi temizle

            // Seçimi ayarla ve görselleştir
            pieceElement.classList.add('selected-piece');
            selectedPiece = squareId;
            
            const validMoves = getValidMoves(squareId, boardState);
            highlightMoves(validMoves);
            
            return; 
        }
    } 
    
    // 2. HAMLE YAPMA (Vurgulanan kareye tıklama)
    if (selectedPiece && square.classList.contains('highlight-move')) {
        const from = selectedPiece;
        const to = squareId;

        // Hamleyi sunucuya gönder (Sunucu kuralı kontrol edecek)
        socket.emit('hareketYap', { roomCode: currentRoom, from, to });
        
        // Yerel durumu temizle
        clearHighlights();
        selectedPiece = null;
    }
}

function highlightMoves(moves) {
    moves.forEach(move => {
        const targetSquare = document.querySelector(`.square[data-id="${move.to}"]`);
        if (targetSquare) {
            targetSquare.classList.add('highlight-move');
        }
    });
}

function clearHighlights() {
    document.querySelectorAll('.highlight-move').forEach(s => s.classList.remove('highlight-move'));
    document.querySelectorAll('.selected-piece').forEach(p => p.classList.remove('selected-piece'));
}

function updateTurnIndicator(isTurn) {
    isMyTurn = isTurn;
    const color = isMyTurn ? myColor : (myColor === 'Red' ? 'Black' : 'Red');
    
    $('current-player-color').textContent = color;
    turnIndicator.classList.remove('turn-red', 'turn-black');
    turnIndicator.classList.add(color === 'Red' ? 'turn-red' : 'turn-black');
    
    if (isTurn) {
        // Zaten showNotification ile bildiriliyor
    }
}


// --- SOCKET.IO OLAY DİNLEYİCİLERİ ---

socket.on('connectionSuccess', (data) => {
    connStatus.textContent = data.message;
    connStatus.classList.remove('waiting');
    connStatus.classList.add('success');
    showNotification(data.message);
});

socket.on('connect_error', (err) => {
    connStatus.textContent = `❌ Bağlantı Hatası: Sunucu Kapalı veya Erişilemiyor.`;
    connStatus.classList.remove('success');
    connStatus.classList.add('waiting');
});

socket.on('eslesmeBekle', (data) => {
    rankedBtn.classList.add('hidden');
    cancelMatchBtn.classList.remove('hidden');
    showNotification(data.text, 'info');
});

socket.on('eslesmeIptalBasarili', () => {
    rankedBtn.classList.remove('hidden');
    cancelMatchBtn.classList.add('hidden');
    showNotification('Eşleşme araması iptal edildi.', 'info');
});

socket.on('eslesmeBulundu', (data) => startGame(data));
socket.on('oyunBaslat', (data) => startGame(data));

function startGame(data) {
    currentRoom = data.room;
    myColor = data.color;
    
    switchScreen(gameScreen);
    boardState = initializeBoard(); 
    createBoard(boardState); 
    $('display-room-code').textContent = currentRoom;
    $('my-color-display').textContent = myColor;
    
    const isStartingTurn = myColor === 'Red'; 
    updateTurnIndicator(isStartingTurn);

    showNotification(`Oyun başladı! Sen: ${myColor}`, 'success');
}

socket.on('oyunDurumuGuncelle', (data) => {
    boardState = data.newBoard; 
    createBoard(boardState); 

    const isTurn = data.turn === socket.id;
    updateTurnIndicator(isTurn);
});

socket.on('continousJump', (data) => {
    showNotification('Zorunlu Zincirleme Yeme! Sıra sizde devam ediyor.', 'warning');
    // Tahta güncellenir, oyuncu tekrar tıklama yapmalıdır.
});

socket.on('odaOlusturuldu', (data) => {
    showNotification(`${data.message} Kod: ${data.code}. Rakibinizi bekleyin.`, 'success');
});

socket.on('hata', (data) => {
    showNotification(`HATA: ${data.message}`, 'danger');
});


// --- BUTON OLAY DİNLEYİCİLERİ (HATA DÜZELTİLDİ) ---

rankedBtn.addEventListener('click', () => { 
    if (socket.connected) {
        socket.emit('eslesmeBaslat'); 
    } else {
        showNotification('Sunucuya bağlı değil!', 'danger');
    }
});

cancelMatchBtn.addEventListener('click', () => { 
    if (socket.connected) {
        socket.emit('eslesmeIptal'); 
        rankedBtn.classList.remove('hidden');
        cancelMatchBtn.classList.add('hidden');
        showNotification('Eşleşme araması iptal edildi.', 'info');
    }
});

$('friend-btn').addEventListener('click', () => { 
    if (socket.connected) {
        socket.emit('odaKur'); 
    }
});

$('join-btn').addEventListener('click', () => {
    const code = $('room-code-input').value.trim();
    if (code.length === 4 && socket.connected) {
        socket.emit('odayaBaglan', { code });
    } else if (!socket.connected) {
         showNotification('Sunucuya bağlı değil!', 'danger');
    } else {
        showNotification('Lütfen 4 haneli oda kodu girin.', 'danger');
    }
});

// Oyundan çıkma butonu
$('quit-game-btn').addEventListener('click', () => {
    socket.emit('oyunTerket', { roomCode: currentRoom });
    currentRoom = null;
    myColor = null;
    isMyTurn = false;
    boardState = initializeBoard();
    switchScreen(lobbyScreen);
    showNotification('Oyundan çıkıldı. Lobiye yönlendirildiniz.', 'info');
});

// Başlangıç
createBoard(boardState); 
switchScreen(lobbyScreen);
