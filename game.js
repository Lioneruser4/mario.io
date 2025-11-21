// Socket.io baglantisi
const socket = io('https://mario-io-1.onrender.com');

// Oyun durumu
let gameState = {
    board: [],
    currentTurn: 'red',
    selectedPiece: null,
    myColor: null,
    isMyTurn: false,
    roomCode: null,
    isSearching: false,
    gameStarted: false
};

// Timer
let searchTimer = null;
let searchTime = 0;

// UI elementleri
const loader = document.getElementById('loader');
const mainLobby = document.getElementById('main-lobby');
const rankedLobby = document.getElementById('ranked-lobby');
const friendLobby = document.getElementById('friend-lobby');
const gameScreen = document.getElementById('game-screen');
const connectionStatus = document.getElementById('connection-status');
const dereceliBtn = document.getElementById('dereceli-btn');
const friendBtn = document.getElementById('friend-btn');
const cancelRankedBtn = document.getElementById('cancel-ranked-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const backToMainBtn = document.getElementById('back-to-main-btn');
const rankedStatus = document.getElementById('ranked-status');
const roomCodeOutput = document.getElementById('room-code-output');
const copyCodeBtn = document.getElementById('copy-code-btn');
const joinRoomInput = document.getElementById('join-room-input');
const joinRoomBtn = document.getElementById('join-room-btn');
const boardElement = document.getElementById('board');
const currentTurnDisplay = document.getElementById('current-turn-display');
const turnText = document.getElementById('turn-text');
const leaveGameBtn = document.getElementById('leave-game-btn');

const BOARD_SIZE = 8;

// --- Socket.io Eventleri ---

socket.on('connect', () => {
    console.log('✅ Servere baglandi');
    console.log('🔗 Socket ID:', socket.id);
    connectionStatus.textContent = 'Servere baglandi!';
    connectionStatus.classList.remove('text-yellow-400');
    connectionStatus.classList.add('text-green-500');
    showScreen('main');
});

socket.on('disconnect', () => {
    connectionStatus.textContent = 'Serverle elaqe kesildi';
    connectionStatus.classList.remove('text-green-500');
    connectionStatus.classList.add('text-red-500');
    turnText.textContent = 'Serverle elaqe kesildi!';
    currentTurnDisplay.className = 'w-full max-w-md mb-4 p-4 rounded-xl shadow-xl text-center bg-red-600';
});

socket.on('matchFound', (data) => {
    console.log('🎉 Raqib tapildi!', data);
    gameState.roomCode = data.roomCode;
    gameState.myColor = data.color;
    gameState.currentTurn = data.currentTurn || 'red';
    gameState.gameStarted = true;
    gameState.isSearching = false;
    gameState.isMyTurn = gameState.currentTurn === gameState.myColor;
    gameState.board = createInitialBoard();
    
    clearInterval(searchTimer);
    searchTimer = null;
    
    showScreen('game');
    updateGameUI();
});

socket.on('searchStatus', (data) => {
    console.log('🔍 Axtaris statusu:', data);
    rankedStatus.textContent = data.message;
});

socket.on('searchCancelled', (data) => {
    clearInterval(searchTimer);
    searchTimer = null;
    showScreen('main');
});

socket.on('roomCreated', (data) => {
    gameState.roomCode = data.roomCode;
    gameState.myColor = 'red';
    roomCodeOutput.textContent = data.roomCode;
    console.log('🏠 Oda yaradildi:', data.roomCode);
});

socket.on('opponentJoined', (data) => {
    gameState.roomCode = data.roomCode;
    gameState.currentTurn = data.currentTurn || 'red';
    gameState.gameStarted = true;
    gameState.isMyTurn = gameState.currentTurn === gameState.myColor;
    gameState.board = createInitialBoard();
    console.log('👥 Raqib qosuldu! Oyun baslayir...');
    showScreen('game');
    updateGameUI();
});

socket.on('gameUpdate', (data) => {
    console.log('📡 Oyun güncellemesi alındı:', data);
    gameState.board = data.board;
    gameState.currentTurn = data.currentTurn;
    gameState.isMyTurn = gameState.currentTurn === gameState.myColor;
    console.log('🔄 Sıra güncellendi - Benim sıram mı?', gameState.isMyTurn);
    updateGameUI();
});

socket.on('gameOver', (data) => {
    const isWinner = data.winner === gameState.myColor;
    turnText.textContent = isWinner ? 'Qazandiniz!' : 'Raqib Qazandi!';
    currentTurnDisplay.className = 'w-full max-w-md mb-4 p-4 rounded-xl shadow-xl text-center ' + 
        (isWinner ? 'bg-blue-600' : 'bg-red-600');
    setTimeout(() => leaveGame(), 5000);
});

socket.on('error', (message) => {
    turnText.textContent = 'Xeta: ' + message;
    currentTurnDisplay.className = 'w-full max-w-md mb-4 p-4 rounded-xl shadow-xl text-center bg-red-600';
    gameState.isSearching = false;
    clearInterval(searchTimer);
    searchTimer = null;
    setTimeout(() => showScreen('main'), 3000);
});

// --- Yardimci Funksiyalar ---

function showScreen(screen) {
    loader.classList.add('hidden');
    mainLobby.classList.add('hidden');
    rankedLobby.classList.add('hidden');
    friendLobby.classList.add('hidden');
    gameScreen.classList.add('hidden');

    if (screen === 'main') {
        mainLobby.classList.remove('hidden');
        gameState.isSearching = false;
        clearInterval(searchTimer);
        searchTimer = null;
    } else if (screen === 'ranked') {
        rankedLobby.classList.remove('hidden');
        gameState.isSearching = true;
        searchTime = 0;
        startSearchTimer();
    } else if (screen === 'friend') {
        friendLobby.classList.remove('hidden');
        gameState.isSearching = false;
        clearInterval(searchTimer);
        searchTimer = null;
    } else if (screen === 'game') {
        gameScreen.classList.remove('hidden');
        clearInterval(searchTimer);
        searchTimer = null;
    } else {
        loader.classList.remove('hidden');
    }
}

function startSearchTimer() {
    clearInterval(searchTimer);
    searchTimer = setInterval(() => {
        searchTime++;
        const minutes = Math.floor(searchTime / 60);
        const seconds = searchTime % 60;
        const timeString = minutes + ':' + seconds.toString().padStart(2, '0');
        rankedStatus.textContent = 'Raqib axtarilir... (' + timeString + ')';
    }, 1000);
}

function createInitialBoard() {
    const board = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        board[r] = new Array(BOARD_SIZE).fill(0);
        for (let c = 0; c < BOARD_SIZE; c++) {
            if ((r + c) % 2 !== 0) {
                if (r < 3) {
                    board[r][c] = 1; // Kirmizi
                } else if (r > 4) {
                    board[r][c] = 2; // Ag
                }
            }
        }
    }
    return board;
}

function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function getPiecePlayer(pieceValue) {
    if (pieceValue === 1 || pieceValue === 3) return 'red';
    if (pieceValue === 2 || pieceValue === 4) return 'white';
    return null;
}

function isValidCell(r, c) { 
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; 
}

function findJumps(board, r, c, player) {
    const piece = board[r][c];
    const isKingPiece = piece === 3 || piece === 4;
    const jumps = [];
    const directions = isKingPiece ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] :
        player === 'red' ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]];

    for (const [dr, dc] of directions) {
        const capturedR = r + dr;
        const capturedC = c + dc;
        const landR = r + 2 * dr;
        const landC = c + 2 * dc;

        if (isValidCell(landR, landC) && board[landR][landC] === 0) {
            const capturedPieceValue = board[capturedR][capturedC];
            const capturedPlayer = getPiecePlayer(capturedPieceValue);

            if (capturedPlayer && capturedPlayer !== player) {
                jumps.push({ from: { r, c }, to: { r: landR, c: landC }, captured: { r: capturedR, c: capturedC } });
            }
        }
    }
    return jumps;
}

function findValidMoves(board, r, c, player) {
    const moves = [];
    const piece = board[r][c];
    const isKingPiece = piece === 3 || piece === 4;
    
    const jumps = findJumps(board, r, c, player);
    if (jumps.length > 0) return jumps;
    
    const directions = isKingPiece ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] :
        player === 'red' ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]];

    for (const [dr, dc] of directions) {
        const newR = r + dr;
        const newC = c + dc;

        if (isValidCell(newR, newC) && board[newR][newC] === 0) {
            moves.push({ from: { r, c }, to: { r: newR, c: newC } });
        }
    }
    return moves;
}

function isValidMove(board, fromR, fromC, toR, toC, player) {
    const moves = findValidMoves(board, fromR, fromC, player);
    return moves.some(move => move.to.r === toR && move.to.c === toC);
}

// --- UI Funksiyalari ---

function drawBoard() {
    boardElement.innerHTML = '';
    
    // Taşı rengine göre ters çevir
    const shouldFlip = gameState.myColor === 'white';
    
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            
            // Taşı rengine göre koordinatları ters çevir
            const displayR = shouldFlip ? BOARD_SIZE - 1 - r : r;
            const displayC = c;
            const isDark = (r + c) % 2 !== 0;

            cell.className = 'cell ' + (isDark ? 'cell-black' : 'cell-white');
            cell.dataset.r = r;
            cell.dataset.c = c;
            cell.onclick = () => handleCellClick(r, c);
            
            // Mobil uyumlu touch olayları
            cell.addEventListener('touchstart', (e) => {
                e.preventDefault();
                handleCellClick(r, c);
            }, { passive: false });

            const pieceValue = gameState.board[r] && gameState.board[r][c];
            if (pieceValue && pieceValue !== 0) {
                const pieceElement = document.createElement('div');
                const piecePlayer = getPiecePlayer(pieceValue);
                const isKingPiece = pieceValue === 3 || pieceValue === 4;

                pieceElement.className = 'piece ' + 
                    (piecePlayer === 'red' ? 'piece-black' : 'piece-white') + 
                    (isKingPiece ? ' piece-king ' + (piecePlayer === 'red' ? 'piece-king-black' : 'piece-king-white') : '');

                pieceElement.innerHTML = isKingPiece ? '👑' : '●';

                if (gameState.selectedPiece && gameState.selectedPiece.r === r && gameState.selectedPiece.c === c) {
                    pieceElement.classList.add('selected');
                    pieceElement.style.zIndex = '20';
                } else {
                    pieceElement.style.zIndex = '1';
                }

                if (gameState.currentTurn === piecePlayer && gameState.isMyTurn) {
                    pieceElement.classList.add('current-turn-piece');
                }

                cell.appendChild(pieceElement);
            }

            if (gameState.selectedPiece && gameState.isMyTurn) {
                const moves = findValidMoves(gameState.board, gameState.selectedPiece.r, gameState.selectedPiece.c, gameState.myColor);
                const move = moves.find(m => m.to.r === r && m.to.c === c);
                
                if (move) {
                    if (move.captured) {
                        cell.classList.add('capture-move');
                    } else {
                        cell.classList.add('valid-move');
                    }
                }
            }

            boardElement.appendChild(cell);
        }
    }
}

function updateGameUI() {
    if (!gameState.gameStarted) return;
    
    if (gameState.isMyTurn) {
        turnText.textContent = 'Sira Sende!';
        currentTurnDisplay.className = 'w-full max-w-md mb-4 p-4 rounded-xl shadow-xl text-center bg-green-600';
    } else {
        turnText.textContent = 'Raqib Sirasi';
        currentTurnDisplay.className = 'w-full max-w-md mb-4 p-4 rounded-xl shadow-xl text-center bg-yellow-600';
    }
    
    drawBoard();
}

// --- Event Handlers ---

function handleCellClick(r, c) {
    console.log('=== TAŞ TIKLANDI ===');
    console.log('Pozisyon:', r, c);
    console.log('Sıra benim mi?', gameState.isMyTurn);
    console.log('Oyun başladı mı?', gameState.gameStarted);
    console.log('Benim rengim:', gameState.myColor);
    console.log('Current turn:', gameState.currentTurn);
    
    if (!gameState.isMyTurn || !gameState.gameStarted) {
        console.log('Sıra sizde değilsiniz veya oyun başlamadı!');
        return;
    }

    const pieceValue = gameState.board[r][c];
    const piecePlayer = getPiecePlayer(pieceValue);
    
    console.log('Taş değeri:', pieceValue);
    console.log('Taşın sahibi:', piecePlayer);

    // Eğer kendi taşına tıklandıysa - taşı seç
    if (piecePlayer === gameState.myColor) {
        gameState.selectedPiece = { r, c };
        console.log('Taş seçildi:', gameState.selectedPiece);
        drawBoard();
        return;
    }

    // Eğer bir taş seçiliyse ve boş hücreye tıklandıysa - taşı hareket ettir
    if (gameState.selectedPiece && pieceValue === 0) {
        const fromR = gameState.selectedPiece.r;
        const fromC = gameState.selectedPiece.c;

        console.log('Hamle denemesi:', fromR, fromC, '->', r, c);

        // Hamle geçerli mi kontrol et
        const moves = findValidMoves(gameState.board, fromR, fromC, gameState.myColor);
        console.log('Geçerli hamleler:', moves);
        
        const validMove = moves.find(move => move.to.r === r && move.to.c === c);

        if (validMove) {
            console.log('Geçerli hamle! Server gönderiliyor...');
            // Hamleyi server'a gönder
            socket.emit('makeMove', {
                roomCode: gameState.roomCode,
                from: { r: fromR, c: fromC },
                to: { r, c }
            });
            gameState.selectedPiece = null;
        } else {
            console.log('Geçersiz hamle!');
            // Geçersiz hamle - seçimi iptal et
            gameState.selectedPiece = null;
            drawBoard();
        }
    } else {
        console.log('Seçim iptal ediliyor...');
        // Başka bir yere tıklandı - seçimi iptal et
        gameState.selectedPiece = null;
        drawBoard();
    }
}

// --- Button Eventleri ---

dereceliBtn.onclick = () => {
    console.log('🎮 Dereceli butona tiklandi');
    showScreen('ranked');
    console.log('📡 findMatch gonderiliyor...');
    socket.emit('findMatch');
    console.log('✅ findMatch gonderildi!');
};

friendBtn.onclick = () => {
    showScreen('friend');
};

cancelRankedBtn.onclick = () => {
    gameState.isSearching = false;
    socket.emit('cancelSearch');
};

createRoomBtn.onclick = () => {
    const roomCode = generateRoomCode();
    gameState.roomCode = roomCode;
    gameState.myColor = 'red';
    socket.emit('createRoom', { roomCode });
};

backToMainBtn.onclick = () => {
    showScreen('main');
};

copyCodeBtn.onclick = () => {
    const code = roomCodeOutput.textContent;
    if (code && code !== '...') {
        navigator.clipboard.writeText(code).then(() => {
            turnText.textContent = 'Otaq kodu (' + code + ') kopyalandi!';
            currentTurnDisplay.className = 'w-full max-w-md mb-4 p-4 rounded-xl shadow-xl text-center bg-green-600';
        }).catch(() => {
            turnText.textContent = "Kopyalama xetasi: Kodu el ile kopyalayin.";
            currentTurnDisplay.className = 'w-full max-w-md mb-4 p-4 rounded-xl shadow-xl text-center bg-yellow-600';
        });
    }
};

joinRoomBtn.onclick = () => {
    const roomCode = joinRoomInput.value.trim();
    if (roomCode.length !== 4) {
        turnText.textContent = "Xahis edirik, 4 reqemli otaq kodunu daxil edin.";
        currentTurnDisplay.className = 'w-full max-w-md mb-4 p-4 rounded-xl shadow-xl text-center bg-yellow-600';
        return;
    }
    
    gameState.roomCode = roomCode;
    gameState.myColor = 'white';
    socket.emit('joinRoom', { roomCode });
};

leaveGameBtn.onclick = () => leaveGame();

function leaveGame() {
    if (gameState.roomCode) {
        socket.emit('leaveGame', { roomCode: gameState.roomCode });
    }
    
    gameState = {
        board: [],
        currentTurn: 'red',
        selectedPiece: null,
        myColor: null,
        isMyTurn: false,
        roomCode: null,
        isSearching: false,
        gameStarted: false
    };
    
    showScreen('main');
}

// Baslangic
document.addEventListener('DOMContentLoaded', () => {
    connectionStatus.textContent = 'Servere qosulur...';
    connectionStatus.classList.add('text-yellow-400', 'animate-pulse');
});
