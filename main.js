// main.js

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
// ... [Diğer DOM elemanları] ...

let currentRoom = null;
let myColor = null; 
let isMyTurn = false;
let selectedPiece = null; 

// Global Dama Tahtası Durumu (Client tarafında kopyası tutulur)
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

// Yeme Hamlelerini Bulma (Vurgulama için)
function findJumps(r, c, isRed, isKing, board, opponentPieces) {
    // Sunucu kodundaki mantığın aynısı
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

// Geçerli Hamleleri Hesaplama (Vurgulama için)
function getValidMoves(squareId, board) {
    const moves = [];
    const r = parseInt(squareId[0]);
    const c = parseInt(squareId[1]);
    const pieceType = board[squareId];
    const isKing = pieceType.includes('K');
    const isRed = pieceType.includes('R');
    const opponentPieces = isRed ? ['B', 'BK'] : ['R', 'RK'];
    const direction = isRed ? 1 : -1;
    
    // Yeme Hamleleri
    const jumpMoves = findJumps(r, c, isRed, isKing, board, opponentPieces);
    if (jumpMoves.length > 0) {
        return jumpMoves; 
    }

    // Normal Hamleler (Yeme yoksa)
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
    
    const rowRange = myColor === 'Black' ? Array.from({ length: 8 }, (_, i) => 7 - i) : Array.from({ length: 8 }, (_, i) => i);
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const squareId = `${r}${c}`;
            const isDarkSquare = (r + c) % 2 !== 0;

            const square = document.createElement('div');
            square.classList.add('square');
            square.classList.add((r + c) % 2 === 0 ? 'light' : 'dark');
            square.dataset.id = squareId; 

            // Tahtanın kendi tarafı altta olacak şekilde grid'e yerleştirme
            const displayR = myColor === 'Black' ? 7 - r : r;
            square.style.gridRow = displayR + 1;
            square.style.gridColumn = c + 1;

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
    
    // 1. TAŞ SEÇİMİ (Taşa dokundukda nereye gitmeli ise işaretlesin)
    if (pieceElement) {
        const pieceType = boardState[squareId];
        if ((myColor === 'Red' && pieceType.includes('R')) || 
            (myColor === 'Black' && pieceType.includes('B'))) {
            
            clearHighlights();
            document.querySelectorAll('.selected-piece').forEach(p => p.classList.remove('selected-piece'));

            pieceElement.classList.add('selected-piece');
            selectedPiece = squareId;
            
            // Geçerli hamleleri hesapla ve vurgula
            const validMoves = getValidMoves(squareId, boardState);
            highlightMoves(validMoves);

        }
    } 
    // 2. HAMLE YAPMA (Taşa dokunup kutuya dokundukda oraya gitsin)
    else if (selectedPiece && square.classList.contains('highlight-move')) {
        const from = selectedPiece;
        const to = squareId;

        // Hamleyi sunucuya gönder
        socket.emit('hareketYap', { roomCode: currentRoom, from, to });
        
        // Yerel durumu temizle (Sunucudan gelen güncel durumu bekleyeceğiz)
        clearHighlights();
        document.querySelectorAll('.selected-piece').forEach(p => p.classList.remove('selected-piece'));
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
}

function updateTurnIndicator(isTurn) {
    isMyTurn = isTurn;
    const color = isMyTurn ? myColor : (myColor === 'Red' ? 'Black' : 'Red');
    
    $('current-player-color').textContent = color;
    turnIndicator.classList.remove('turn-red', 'turn-black');
    turnIndicator.classList.add(color === 'Red' ? 'turn-red' : 'turn-black');
    
    if (isTurn) {
        showNotification('SIRA SİZDE! Hamlenizi yapın.', 'success');
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
    connStatus.textContent = '❌ Bağlantı Hatası: Sunucu Kapalı veya Erişilemiyor.';
    connStatus.classList.remove('success');
    connStatus.classList.add('waiting');
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
    
    const isStartingTurn = myColor === 'Red'; // Kırmızı başlar
    updateTurnIndicator(isStartingTurn);

    showNotification(`Oyun başladı! Sen: ${myColor}`, 'success');
}

socket.on('oyunDurumuGuncelle', (data) => {
    // Taşın hareket etmesini sağlayan ana mekanizma
    boardState = data.newBoard; 
    createBoard(boardState); 

    const isTurn = data.turn === socket.id;
    updateTurnIndicator(isTurn);
});

socket.on('continousJump', (data) => {
    showNotification('Zorunlu Zincirleme Yeme! Sıra sizde devam ediyor.', 'warning');
    // Tahta güncellendi, şimdi oyuncu yeni taşı tekrar seçip yemeğe devam etmeli.
});

socket.on('odaOlusturuldu', (data) => {
    showNotification(`${data.message} Kod: ${data.code}`, 'success');
});

socket.on('hata', (data) => {
    showNotification(`HATA: ${data.message}`, 'danger');
});


// --- BUTON OLAY DİNLEYİCİLERİ ---
$('ranked-btn').addEventListener('click', () => { socket.emit('eslesmeBaslat'); });
$('cancel-match-btn').addEventListener('click', () => { socket.emit('eslesmeIptal'); });
$('friend-btn').addEventListener('click', () => { socket.emit('odaKur'); });
$('join-btn').addEventListener('click', () => {
    const code = $('room-code-input').value.trim();
    if (code.length === 4) {
        socket.emit('odayaBaglan', { code });
    } else {
        showNotification('Lütfen 4 haneli oda kodu girin.', 'danger');
    }
});

// Başlangıçta tahtayı çiz ve lobi ekranını göster
createBoard(boardState); 
switchScreen(lobbyScreen);
