// main.js - Amerikan Daması İstemci Mantığı (Frontend)

const SERVER_URL = "wss://mario-io-1.onrender.com";
let socket = null;
let gameState = {
    gameId: null,
    myColor: null, // "red" veya "black"
    isMyTurn: false,
    selectedPiecePos: null, // Tıklanan taşın pozisyonu
    stats: {
        onlinePlayers: 0,
        activeGames: 0,
        totalMatches: 0
    }
};

// DOM Elementleri
const dom = {
    // Lobby Elements
    connStatusEl: document.getElementById('connection-status'),
    lobbyContainer: document.getElementById('lobby-container'),
    gameContainer: document.getElementById('game-container'),
    btnRanked: document.getElementById('btn-ranked'),
    rankedText: document.getElementById('ranked-text'),
    btnCreateRoom: document.getElementById('btn-create-room'),
    roomCodeInput: document.getElementById('room-code-input'),
    btnConnectRoom: document.getElementById('btn-connect-room'),
    btnCopyCode: document.getElementById('btn-copy-code'),
    
    // Game Elements
    playerTurnStatus: document.getElementById('player-turn-status'),
    gameBoard: document.getElementById('game-board'),
    
    // Stats Elements
    onlinePlayersEl: document.getElementById('online-players'),
    activeGamesEl: document.getElementById('active-games'),
    totalMatchesEl: document.getElementById('total-matches')
};

// Lobby Functions
function updateConnectionStatus(status, message) {
    dom.connStatusEl.className = `status-box ${status}`;
    dom.connStatusEl.innerHTML = status === 'connecting' 
        ? '<div class="spinner"></div><span>Sunucuya Bağlanılıyor...</span>'
        : status === 'connected'
            ? '✅ <span>Sunucuya Bağlandı</span>'
            : '❌ <span>Bağlantı Kesildi</span>';

    if (message) {
        dom.connStatusEl.innerHTML += `<div class="status-message">${message}</div>`;
    }
}

function updateStats(stats) {
    if (stats.onlinePlayers !== undefined) {
        gameState.stats.onlinePlayers = stats.onlinePlayers;
        if (dom.onlinePlayersEl) {
            dom.onlinePlayersEl.textContent = stats.onlinePlayers.toLocaleString();
        }
    }
    if (stats.activeGames !== undefined) {
        gameState.stats.activeGames = stats.activeGames;
        if (dom.activeGamesEl) {
            dom.activeGamesEl.textContent = stats.activeGames.toLocaleString();
        }
    }
    if (stats.totalMatches !== undefined) {
        gameState.stats.totalMatches = stats.totalMatches;
        if (dom.totalMatchesEl) {
            dom.totalMatchesEl.textContent = stats.totalMatches.toLocaleString();
        }
    }
}

function animateStatCounters() {
    // Initial random stats for demo
    const initialStats = {
        onlinePlayers: Math.floor(Math.random() * 1000) + 500,
        activeGames: Math.floor(Math.random() * 200) + 100,
        totalMatches: Math.floor(Math.random() * 10000) + 5000
    };
    
    updateStats(initialStats);
    
    // Simulate stats updates
    setInterval(() => {
        const newStats = {
            onlinePlayers: Math.max(100, gameState.stats.onlinePlayers + Math.floor(Math.random() * 10) - 5),
            activeGames: Math.max(10, gameState.stats.activeGames + Math.floor(Math.random() * 3) - 1),
            totalMatches: gameState.stats.totalMatches + Math.floor(Math.random() * 10)
        };
        updateStats(newStats);
    }, 5000);
}

function initLobby() {
    // Copy room code button
    if (dom.btnCopyCode) {
        dom.btnCopyCode.addEventListener('click', function() {
            const roomCode = dom.roomCodeInput.value;
            if (roomCode) {
                navigator.clipboard.writeText(roomCode);
                const btn = this;
                const originalText = btn.innerHTML;
                btn.innerHTML = '<span>Kopyalandı!</span>';
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.remove('copied');
                }, 2000);
            }
        });
    }

    // Add hover effect to mode cards
    const modeCards = document.querySelectorAll('.mode-card');
    modeCards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });

    // Initialize stats animation
    animateStatCounters();
}

// ==========================================================
// 1. SUNUCU İLETİŞİMİ
// ==========================================================

function connect() {
    updateConnectionStatus('connecting');
    
    socket = new WebSocket(SERVER_URL);

    socket.onopen = () => {
        updateConnectionStatus('connected');
        // Initialize lobby after connection
        initLobby();
    };
    
    socket.onclose = () => {
        updateConnectionStatus('disconnected', '5s sonra yeniden deneniyor...');
        setTimeout(connect, 5000);
    };
    
    socket.onerror = (e) => {
        console.error("WebSocket Hatası:", e);
        updateConnectionStatus('disconnected', 'Bağlantı hatası. Tekrar deneniyor...');
    };
    
    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleServerMessage(data);
            
            // Update stats if received from server
            if (data.onlinePlayers !== undefined || data.activeGames !== undefined || data.totalMatches !== undefined) {
                updateStats(data);
            }
        } catch (e) { 
            console.error("Geçersiz Sunucu Verisi:", event.data); 
        }
    };
}

function sendMessage(type, payload = {}) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type, ...payload }));
        return true;
    }
    console.warn("Sunucuya bağlı değil. Mesaj gönderilemedi.");
    return false;
}

function handleServerMessage(data) {
    console.log('Server Message:', data);
    
    switch (data.type) {
        case 'MATCH_FOUND':
            updateConnectionStatus('connected', 'Rakip bulundu! Oyun başlıyor...');
            startGame(data.gameId, data.color, data.boardState, data.turn);
            break;
            
        case 'ROOM_JOINED':
            updateConnectionStatus('connected', 'Odaya bağlanıldı! Oyun başlıyor...');
            startGame(data.gameId, data.color, data.boardState, data.turn);
            break;
            
        case 'ROOM_CREATED':
            dom.roomCodeInput.value = data.roomCode;
            dom.btnCopyCode.classList.remove('hidden');
            updateConnectionStatus('connected', `Oda oluşturuldu! Kod: ${data.roomCode}`);
            
            // Show a nice notification instead of alert
            const notification = document.createElement('div');
            notification.className = 'notification';
            notification.innerHTML = `
                <div class="notification-content">
                    <h4>Oda Oluşturuldu!</h4>
                    <p>Oda kodunuz: <strong>${data.roomCode}</strong></p>
                    <p>Bu kodu arkadaşlarınızla paylaşın.</p>
                </div>
                <button class="close-notification">×</button>
            `;
            document.body.appendChild(notification);
            
            // Auto-hide notification after 5 seconds
            setTimeout(() => {
                notification.classList.add('show');
                setTimeout(() => {
                    notification.classList.remove('show');
                    setTimeout(() => notification.remove(), 300);
                }, 5000);
            }, 100);
            
            // Close button handler
            notification.querySelector('.close-notification').addEventListener('click', () => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            });
            break;
            
        case 'GAME_UPDATE':
            updateBoard(data.boardState);
            updateTurn(data.turn);
            break;
            
        case 'LEGAL_MOVES':
            highlightLegalMoves(data.moves);
            break;
            
        case 'PLAYER_JOINED':
            if (data.roomCode) {
                updateConnectionStatus('connected', `Oyuncu odaya katıldı! Oyun başlıyor...`);
            }
            break;
            
        case 'ERROR':
            console.error('Sunucu Hatası:', data.message);
            updateConnectionStatus('error', data.message || 'Bir hata oluştu');
            stopSearching();
            
            // Show error notification
            const errorNotif = document.createElement('div');
            errorNotif.className = 'notification error';
            errorNotif.innerHTML = `
                <div class="notification-content">
                    <h4>Hata!</h4>
                    <p>${data.message || 'Bir hata oluştu'}</p>
                </div>
                <button class="close-notification">×</button>
            `;
            document.body.appendChild(errorNotif);
            
            setTimeout(() => {
                errorNotif.classList.add('show');
                setTimeout(() => {
                    errorNotif.classList.remove('show');
                    setTimeout(() => errorNotif.remove(), 300);
                }, 5000);
            }, 100);
            
            errorNotif.querySelector('.close-notification').addEventListener('click', () => {
                errorNotif.classList.remove('show');
                setTimeout(() => errorNotif.remove(), 300);
            });
            break;
            
        case 'STATS_UPDATE':
            updateStats(data);
            break;
    }
}

// ==========================================================
// 2. LOBİ ETKİLEŞİMLERİ (3 Buton)
// ==========================================================

dom.btnRanked.addEventListener('click', () => {
    if (!dom.btnRanked.classList.contains('searching')) {
        if (sendMessage('FIND_MATCH')) {
            dom.btnRanked.classList.add('searching');
            dom.rankedText.textContent = 'Eşleşme Aranıyor... (İptal Et)';
            dom.btnCreateRoom.disabled = true;
            dom.btnConnectRoom.disabled = true;
        }
    } else {
        if (sendMessage('CANCEL_SEARCH')) {
            stopSearching();
        }
    }
});

function stopSearching() {
    dom.btnRanked.classList.remove('searching');
    dom.rankedText.textContent = 'Dereceli Oyna (Eşleşme Bul)';
    dom.btnCreateRoom.disabled = false;
    dom.btnConnectRoom.disabled = false;
}

dom.btnCreateRoom.addEventListener('click', () => sendMessage('CREATE_ROOM'));

dom.btnConnectRoom.addEventListener('click', () => {
    const code = dom.roomCodeInput.value.trim();
    if (code.length === 4) {
        sendMessage('JOIN_ROOM', { roomCode: code });
    } else {
        alert('Lütfen 4 haneli kodu giriniz.');
    }
});

dom.btnCopyCode.addEventListener('click', () => {
    navigator.clipboard.writeText(dom.roomCodeInput.value);
    dom.btnCopyCode.textContent = "Kopyalandı!";
    setTimeout(() => dom.btnCopyCode.textContent = "Kodu Kopyala", 1500);
});

// ==========================================================
// 3. OYUN KURULUM VE MANTIĞI
// ==========================================================

function startGame(gameId, color, boardState, turn) {
    gameState.gameId = gameId;
    gameState.myColor = color;
    drawBoard();
    updateBoard(boardState);
    updateTurn(turn);
    
    dom.lobbyContainer.classList.add('hidden');
    dom.gameContainer.classList.remove('hidden');
}

function drawBoard() {
    dom.gameBoard.innerHTML = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div');
            // Tahta koordinatını (A1'den H8'e) belirle
            const pos = String.fromCharCode(65 + c) + (8 - r);
            cell.classList.add('cell', (r + c) % 2 === 0 ? 'light' : 'dark');
            cell.dataset.pos = pos;
            cell.addEventListener('click', handleCellClick);
            dom.gameBoard.appendChild(cell);
        }
    }
    // Kırmızı oyuncu altta olacak şekilde tahtayı döndür (Mobil uyumluluk için önemli)
    dom.gameBoard.style.transform = gameState.myColor === 'red' ? 'rotate(180deg)' : 'rotate(0deg)';
}

function updateBoard(boardState) {
    // Clear existing pieces and highlights
    document.querySelectorAll('.piece').forEach(p => p.remove());
    clearHighlights();
    
    // Clear selected piece
    gameState.selectedPiecePos = null;
    
    // Update each cell based on the board state
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            
            // Add smooth animation
            piece.style.animation = 'piece-drop 0.3s ease-out';
        }
    }
    
    // Update turn indicator
    if (gameState.turn) {
        const turnColor = gameState.turn === 'red' ? 'beyaz' : 'siyah';
        dom.playerTurnStatus.textContent = `Sıra: ${turnColor} taşlarda`;
    const pieces = document.querySelectorAll('.piece');
    if (gameState.myColor === 'black') {
        dom.gameBoard.style.transform = 'rotate(180deg)';
        pieces.forEach(piece => {
            piece.style.transform = 'rotate(180deg)';
        });
    } else {
        dom.gameBoard.style.transform = 'rotate(0deg)';
        pieces.forEach(piece => {
            piece.style.transform = 'rotate(0deg)';
        });
    }
}

function updateTurn(turnColor) {
    gameState.isMyTurn = (turnColor === gameState.myColor);
    dom.playerTurnStatus.textContent = gameState.isMyTurn 
        ? `🔥 SIRA SENDE (${gameState.myColor.toUpperCase()})`
        : `⌛ RAKİP OYNUYOR (${turnColor.toUpperCase()})`;

    // Işıklı sıra gösterimi
    dom.playerTurnStatus.classList.remove('my-turn-light', 'opponent-turn-light');
    dom.playerTurnStatus.classList.add(gameState.isMyTurn ? 'my-turn-light' : 'opponent-turn-light');
}

function handleCellClick(event) {
    if (!gameState.isMyTurn || !gameState.gameId) return;
    
    const cell = event.currentTarget;
    const pos = cell.dataset.pos;
    const piece = cell.querySelector('.piece');
    
    // If clicking on a piece that belongs to the current player
    if (piece && (piece.classList.contains(gameState.myColor) || 
                 (gameState.myColor === 'red' && piece.classList.contains('white')) ||
                 (gameState.myColor === 'white' && piece.classList.contains('red')))) {
        // Clear previous selection
        clearHighlights();
        
        // Select this piece
        gameState.selectedPiecePos = pos;
        cell.classList.add('selected');
        
        // Request legal moves for this piece
        sendMessage('GET_LEGAL_MOVES', { 
            gameId: gameState.gameId, 
            pos: pos 
        });
    }
    // If clicking on a highlighted move
    else if (cell.classList.contains('legal-move') && gameState.selectedPiecePos) {
        // Make the move
        sendMessage('MAKE_MOVE', {
            gameId: gameState.gameId,
            from: gameState.selectedPiecePos,
            to: pos
        });
        
        // Clear highlights after move
        clearHighlights();
    }
        // Select new piece
        gameState.selectedPiecePos = pos;
        cell.classList.add('selected');
        
        // Request legal moves for this piece
        sendMessage('GET_LEGAL_MOVES', { 
            gameId: gameState.gameId, 
            pos: pos 
        });
    } 
    // If clicking on a legal move cell with a selected piece
    else if (cell.classList.contains('legal-move') && gameState.selectedPiecePos) {
        // Make the move
        sendMessage('MAKE_MOVE', { 
            gameId: gameState.gameId, 
            from: gameState.selectedPiecePos, 
            to: pos 
        });
        
        // Clear selection after move
        clearHighlights();
    } 
    // If clicking on an empty cell that's not a legal move
    else {
        // If we have a selected piece, keep it selected
        if (gameState.selectedPiecePos) {
            // If clicking on another empty cell, keep the current selection
            return;
        }
        // Otherwise clear selection
        clearHighlights();
    }
}

function highlightLegalMoves(moves) {
    // Clear previous highlights but keep the selected piece
    const selectedCell = gameState.selectedPiecePos ? 
        document.querySelector(`[data-pos="${gameState.selectedPiecePos}"]`) : null;
    
    clearHighlights();
    
    // Re-add selected piece highlight
    if (selectedCell) {
        selectedCell.classList.add('selected');
    }
    
    // Highlight legal moves
    moves.forEach(move => {
        const cell = document.querySelector(`[data-pos="${move}"]`);
        if (cell) {
            // Check if it's a capture move (jump)
            const isCapture = move.includes('x');
            cell.classList.add('legal-move');
            
            // Add capture indicator for better UX
            if (isCapture) {
                cell.classList.add('capture-move');
            }
        }
    });
}

function clearHighlights() {
    // Remove all highlight classes
    document.querySelectorAll('.selected, .legal-move, .capture-move').forEach(c => {
        c.classList.remove('selected', 'legal-move', 'capture-move');
    });
    
    // Don't clear selectedPiecePos here, as it's needed for multi-jump moves
    // It will be cleared explicitly when needed (e.g., after move is made)
}

// 🚀 Uygulama Başlangıcı
connect();
