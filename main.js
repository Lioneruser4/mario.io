// main.js - Amerikan Daması İstemci Mantığı (Frontend)

const SERVER_URL = "wss://mario-io-1.onrender.com";
let socket = null;
let gameState = {
    gameId: null,
    myColor: null, // "red" veya "black"
    isMyTurn: false,
    selectedPiecePos: null // Tıklanan taşın pozisyonu
};

// DOM Elementleri
const dom = {
    connStatusEl: document.getElementById('connection-status'),
    lobbyContainer: document.getElementById('lobby-container'),
    gameContainer: document.getElementById('game-container'),
    btnRanked: document.getElementById('btn-ranked'),
    rankedText: document.getElementById('ranked-text'),
    btnCreateRoom: document.getElementById('btn-create-room'),
    roomCodeInput: document.getElementById('room-code-input'),
    btnConnectRoom: document.getElementById('btn-connect-room'),
    btnCopyCode: document.getElementById('btn-copy-code'),
    playerTurnStatus: document.getElementById('player-turn-status'),
    gameBoard: document.getElementById('game-board')
};

// ==========================================================
// 1. SUNUCU İLETİŞİMİ
// ==========================================================

function connect() {
    dom.connStatusEl.className = 'status-box connecting';
    dom.connStatusEl.textContent = 'Sunucuya Bağlanılıyor...';
    
    socket = new WebSocket(SERVER_URL);

    socket.onopen = () => {
        dom.connStatusEl.className = 'status-box connected';
        dom.connStatusEl.textContent = '✅ Bağlantı Başarılı. Arena Hazır!';
    };
    socket.onclose = () => {
        dom.connStatusEl.className = 'status-box disconnected';
        dom.connStatusEl.textContent = '❌ Bağlantı Kesildi. 5s Sonra Yeniden Deneniyor...';
        setTimeout(connect, 5000);
    };
    socket.onerror = (e) => console.error("WebSocket Hatası:", e);
    
    socket.onmessage = (event) => {
        try {
            handleServerMessage(JSON.parse(event.data));
        } catch (e) { console.error("Geçersiz Sunucu Verisi:", event.data); }
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
    switch (data.type) {
        case 'MATCH_FOUND':
        case 'ROOM_JOINED':
            startGame(data.gameId, data.color, data.boardState, data.turn);
            break;
        case 'ROOM_CREATED':
            dom.roomCodeInput.value = data.roomCode;
            dom.btnCopyCode.classList.remove('hidden');
            alert(`Oda Kodu: ${data.roomCode}. Arkadaşına gönder.`);
            break;
        case 'GAME_UPDATE':
            // Tahta ve sıra güncellendi
            updateBoard(data.boardState);
            updateTurn(data.turn);
            break;
        case 'LEGAL_MOVES':
            // Sunucudan gelen yasal hamleleri renklendir
            highlightLegalMoves(data.moves); 
            break;
        case 'ERROR':
            alert(`Sunucu Hatası: ${data.message}`);
            stopSearching();
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
    document.querySelectorAll('.piece').forEach(p => p.remove());
    for (const pos in boardState) {
        const { color, isKing } = boardState[pos];
        const cell = document.querySelector(`[data-pos="${pos}"]`);
        if (cell) {
            const piece = document.createElement('div');
            piece.classList.add('piece', color, isKing ? 'king' : 'standard');
            // Yeni taşa ufak bir "düşme" animasyonu
            piece.style.animation = 'piece-drop 0.3s ease-out';
            cell.appendChild(piece);
        }
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
    const hasMyPiece = cell.querySelector(`.piece.${gameState.myColor}`);

    if (hasMyPiece) {
        // Taşa tıklandı: Legal hamleleri iste
        clearHighlights();
        gameState.selectedPiecePos = pos;
        cell.classList.add('selected');
        sendMessage('GET_LEGAL_MOVES', { gameId: gameState.gameId, pos: pos });

    } else if (cell.classList.contains('legal-move') && gameState.selectedPiecePos) {
        // Vurgulanmış hedefe tıklandı: Hamleyi yap
        sendMessage('MAKE_MOVE', { 
            gameId: gameState.gameId, 
            from: gameState.selectedPiecePos, 
            to: pos 
        });
        clearHighlights();
    } else {
        // Geçersiz tıklama: Seçimi kaldır
        clearHighlights();
    }
}

function highlightLegalMoves(moves) {
    clearHighlights(); 
    // Seçili taşı tekrar vurgula
    if(gameState.selectedPiecePos) document.querySelector(`[data-pos="${gameState.selectedPiecePos}"]`).classList.add('selected');
    
    // Yasal hamleleri renklendir (CSS: .legal-move)
    moves.forEach(pos => {
        const cell = document.querySelector(`[data-pos="${pos}"]`);
        if (cell) cell.classList.add('legal-move');
    });
}

function clearHighlights() {
    document.querySelectorAll('.selected, .legal-move').forEach(c => c.classList.remove('selected', 'legal-move'));
    gameState.selectedPiecePos = null;
}

// 🚀 Uygulama Başlangıcı
connect();
