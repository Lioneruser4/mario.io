// main.js - Amerikan Daması İstemci Mantığı (Frontend)

// Sunucu URL'si
const SERVER_URLS = [
    "wss://mario-io-1.onrender.com"
];

let socket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

let gameState = {
    gameId: null,
    myColor: null, // "red" veya "black"
    isMyTurn: false,
    selectedPiecePos: null, // Tıklanan taşın pozisyonu
    isConnected: false
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
    gameBoard: document.getElementById('game-board'),
    lobbyStatus: document.getElementById('lobby-status'),
    roomCodeDisplay: document.getElementById('room-code-display')
};

// ==========================================================
// 1. SUNUCU İLETİŞİMİ
// ==========================================================

function connect(urlIndex = 0) {
    if (urlIndex >= SERVER_URLS.length) {
        urlIndex = 0; // Tüm sunucular denenmişse başa dön
        reconnectAttempts++;
        
        if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
            dom.connStatusEl.className = 'status-box error';
            dom.connStatusEl.textContent = '❌ Sunucuya bağlanılamadı. Lütfen sayfayı yenileyin.';
            return;
        }
    }
    
    const url = SERVER_URLS[urlIndex];
    dom.connStatusEl.className = 'status-box connecting';
    dom.connStatusEl.textContent = `Sunucuya Bağlanılıyor (${url})...`;
    
    try {
        socket = new WebSocket(url);

        socket.onopen = () => {
            reconnectAttempts = 0;
            gameState.isConnected = true;
            dom.connStatusEl.className = 'status-box connected';
            dom.connStatusEl.textContent = '✅ Bağlantı Başarılı. Arena Hazır!';
            updateLobbyStatus('Bağlantı başarılı. Oyun modunu seçin.');
        };
        
        socket.onclose = () => {
            gameState.isConnected = false;
            dom.connStatusEl.className = 'status-box disconnected';
            const nextUrlIndex = (urlIndex + 1) % SERVER_URLS.length;
            dom.connStatusEl.textContent = `❌ Bağlantı Kesildi. Yeni sunucu deneniyor (${nextUrlIndex + 1}/${SERVER_URLS.length})...`;
            setTimeout(() => connect(nextUrlIndex), 3000);
        };
        
        socket.onerror = (e) => {
            console.error("WebSocket Hatası:", e);
            socket.close(); // Hata durumunda bağlantıyı kapat
        };
        
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

// Lobi durumunu güncelleme fonksiyonu
function updateLobbyStatus(message, isError = false) {
    if (dom.lobbyStatus) {
        dom.lobbyStatus.textContent = message;
        dom.lobbyStatus.className = isError ? 'lobby-status error' : 'lobby-status';
    }
}

// Oda kodu gösterimi güncelleme
function updateRoomCode(roomCode) {
    if (dom.roomCodeDisplay) {
        dom.roomCodeDisplay.textContent = `Oda Kodu: ${roomCode}`;
        dom.roomCodeDisplay.classList.remove('hidden');
    }
}

// Oda oluşturma butonu
dom.btnCreateRoom.addEventListener('click', () => {
    if (!gameState.isConnected) {
        updateLobbyStatus('❌ Sunucuya bağlı değil', true);
        return;
    }
    updateLobbyStatus('Oda oluşturuluyor...');
    sendMessage('CREATE_ROOM');
});

// Odaya bağlanma butonu
dom.btnConnectRoom.addEventListener('click', () => {
    if (!gameState.isConnected) {
        updateLobbyStatus('❌ Sunucuya bağlı değil', true);
        return;
    }
    
    const code = dom.roomCodeInput.value.trim().toUpperCase();
    if (code.length === 4) {
        updateLobbyStatus('Odaya bağlanılıyor...');
        sendMessage('JOIN_ROOM', { roomCode: code });
    } else {
        updateLobbyStatus('❌ Lütfen 4 haneli kodu giriniz.', true);
    }
});

// Kopyalama butonu
dom.btnCopyCode.addEventListener('click', () => {
    const code = dom.roomCodeInput.value.trim();
    if (code) {
        navigator.clipboard.writeText(code);
        const originalText = dom.btnCopyCode.textContent;
        dom.btnCopyCode.textContent = "✅ Kopyalandı!";
        setTimeout(() => dom.btnCopyCode.textContent = originalText, 2000);
    }
});

// Oda kodu giriş alanına sadece harf ve rakam girişine izin ver
dom.roomCodeInput.addEventListener('input', (e) => {
    let value = e.target.value.toUpperCase();
    value = value.replace(/[^A-Z0-9]/g, ''); // Sadece harf ve rakam
    e.target.value = value.substring(0, 4); // Maksimum 4 karakter
});

// ==========================================================
// 3. OYUN KURULUM VE MANTIĞI
// ==========================================================

function startGame(gameId, color, boardState, turn) {
    gameState.gameId = gameId;
    gameState.myColor = color;
    
    // Oyun alanını oluşturmadan önce tahtayı temizle
    dom.gameBoard.innerHTML = '';
    drawBoard();
    updateBoard(boardState);
    updateTurn(turn);
    
    // Lobi ekranını kapat, oyun ekranını göster
    dom.lobbyContainer.classList.add('hidden');
    dom.gameContainer.classList.remove('hidden');
    
    // Oyun tahtasını oyuncunun rengine göre döndür
    updateBoardRotation();
}

// Oyun tahtasını oyuncunun rengine göre döndür
function updateBoardRotation() {
    dom.gameBoard.style.transform = gameState.myColor === 'red' ? 'rotate(180deg)' : 'rotate(0deg)';
    
    // Tüm hücrelerin içeriğini de döndür (metin ve taşlar için)
    document.querySelectorAll('.cell').forEach(cell => {
        cell.style.transform = gameState.myColor === 'red' ? 'rotate(180deg)' : 'rotate(0deg)';
    });
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
            
            // Hücreye tıklama ve dokunma olaylarını ekle
            cell.addEventListener('click', handleCellClick);
            cell.addEventListener('touchend', handleCellClick, { passive: true });
            
            // Sürükleme olaylarını ekle
            cell.addEventListener('dragover', handleDragOver);
            cell.addEventListener('drop', handleDrop);
            cell.addEventListener('dragenter', handleDragEnter);
            cell.addEventListener('dragleave', handleDragLeave);
            
            dom.gameBoard.appendChild(cell);
        }
    }
}

function updateBoard(boardState) {
    // Mevcut taşları kaldır
    document.querySelectorAll('.piece').forEach(p => p.remove());
    
    // Tüm hücrelerden seçili ve geçerli hamle işaretlerini kaldır
    document.querySelectorAll('.cell').forEach(cell => {
        cell.classList.remove('selected', 'valid-move', 'invalid-move');
    });
    
    // Yeni taşları ekle
    for (const pos in boardState) {
        const { color, isKing } = boardState[pos];
        const cell = document.querySelector(`[data-pos="${pos}"]`);
        if (cell) {
            const piece = document.createElement('div');
            piece.classList.add('piece', color);
            if (isKing) piece.classList.add('king');
            
            // Taş sürükleme özelliği ekle
            piece.draggable = true;
            piece.addEventListener('dragstart', handleDragStart);
            piece.addEventListener('touchstart', handleTouchStart, { passive: true });
            
            // Animasyon ekle
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

// Dokunma olayı başladığında
function handleTouchStart(e) {
    if (!gameState.isMyTurn) return;
    
    const piece = e.target;
    const cell = piece.parentElement;
    const pos = cell.dataset.pos;
    
    // Seçili taşı işaretle
    gameState.selectedPiecePos = pos;
    
    // Yasal hamleleri iste
    sendMessage('GET_LEGAL_MOVES', { 
        gameId: gameState.gameId, 
        pos: pos 
    });
}

// Sürükleme işlemi başladığında
function handleDragStart(e) {
    if (!gameState.isMyTurn) {
        e.preventDefault();
        return;
    }
    
    const piece = e.target;
    const cell = piece.parentElement;
    const pos = cell.dataset.pos;
    
    // Seçili taşı işaretle
    gameState.selectedPiecePos = pos;
    
    // Yasal hamleleri iste
    sendMessage('GET_LEGAL_MOVES', { 
        gameId: gameState.gameId, 
        pos: pos 
    });
    
    // Sürüklenen taşın stilini güncelle
    piece.style.opacity = '0.7';
    piece.style.transform = 'scale(1.1)';
    piece.style.transition = 'all 0.2s';
    
    // Sürükleme verisini ayarla
    e.dataTransfer.setData('text/plain', '');
    e.dataTransfer.effectAllowed = 'move';
}

// Sürükleme sırasında üzerine gelindiğinde
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const cell = e.currentTarget;
    const pos = cell.dataset.pos;
    const fromPos = gameState.selectedPiecePos;
    
    if (fromPos && fromPos !== pos) {
        // Eğer bu hücreye gitmek yasal bir hamle ise
        const isLegalMove = gameState.legalMoves && gameState.legalMoves.includes(pos);
        cell.classList.toggle('valid-move', isLegalMove);
        cell.classList.toggle('invalid-move', !isLegalMove);
    }
}

// Sürükleme bırakıldığında
function handleDrop(e) {
    e.preventDefault();
    
    const toCell = e.currentTarget;
    const toPos = toCell.dataset.pos;
    const fromPos = gameState.selectedPiecePos;
    
    if (!fromPos || fromPos === toPos) return;
    
    // Hamleyi sunucuya gönder
    sendMessage('MAKE_MOVE', {
        gameId: gameState.gameId,
        from: fromPos,
        to: toPos
    });
    
    // Temizlik yap
    clearHighlights();
}

// Sürükleme hücreye girdiğinde
function handleDragEnter(e) {
    e.preventDefault();
    const cell = e.currentTarget;
    const pos = cell.dataset.pos;
    const fromPos = gameState.selectedPiecePos;
    
    if (fromPos && fromPos !== pos) {
        const isLegalMove = gameState.legalMoves && gameState.legalMoves.includes(pos);
        cell.classList.toggle('valid-move', isLegalMove);
        cell.classList.toggle('invalid-move', !isLegalMove);
    }
}

// Sürükleme hücreden çıktığında
function handleDragLeave(e) {
    const cell = e.currentTarget;
    cell.classList.remove('valid-move', 'invalid-move');
}

// Sürükleme sırasında üzerine gelindiğinde
function handleDragOver(e) {
    e.preventDefault();
}

// Bırakma işlemi
function handleDrop(e) {
    e.preventDefault();
    
    if (!gameState.isMyTurn || !gameState.selectedPiecePos) return;
    
    const toCell = e.currentTarget;
    const fromPos = gameState.selectedPiecePos;
    const toPos = toCell.dataset.pos;
    
    // Hamleyi sunucuya gönder
    sendMessage('MAKE_MOVE', {
        gameId: gameState.gameId,
        from: fromPos,
        to: toPos
    });
    
    // Seçili taşı sıfırla
    gameState.selectedPiecePos = null;
    
    // Tüm vurguları kaldır
    clearHighlights();
}

function handleCellClick(event) {
    if (!gameState.isMyTurn || !gameState.gameId) return;
    
    event.preventDefault();
    event.stopPropagation();

    const cell = event.currentTarget || event.target.closest('.cell');
    if (!cell) return;
    
    const pos = cell.dataset.pos;
    const piece = cell.querySelector('.piece');
    const isMyPiece = piece && piece.classList.contains(gameState.myColor);

    // Eğer kendi taşıma tıkladıysam
    if (isMyPiece) {
        // Önceki seçimleri temizle
        clearHighlights();
        
        // Yeni taşı seç
        gameState.selectedPiecePos = pos;
        cell.classList.add('selected');
        
        // Yasal hamleleri iste
        sendMessage('GET_LEGAL_MOVES', { 
            gameId: gameState.gameId, 
            pos: pos 
        });
    } 
    // Eğer seçili bir taş varsa ve boş veya rakibin taşına tıklandıysa
    else if (gameState.selectedPiecePos) {
        const fromPos = gameState.selectedPiecePos;
        
        // Hamleyi sunucuya gönder
        sendMessage('MAKE_MOVE', {
            gameId: gameState.gameId,
            from: fromPos,
            to: pos
        });
        
        // Seçimi temizle
        clearHighlights();
    } else {
        // Geçersiz tıklama: Seçimi kaldır
        clearHighlights();
    }
}

function highlightLegalMoves(moves) {
    // Yasal hamleleri sakla (sonradan kullanmak için)
    gameState.legalMoves = moves || [];
    
    // Yasal hamleleri vurgula
    gameState.legalMoves.forEach(pos => {
        const cell = document.querySelector(`[data-pos="${pos}"]`);
        if (cell) {
            cell.classList.add('valid-move');
        }
    });
    
    // Geçersiz hamleleri de işaretle (opsiyonel)
    document.querySelectorAll('.cell').forEach(cell => {
        if (!gameState.legalMoves.includes(cell.dataset.pos) && 
            !cell.classList.contains('selected')) {
            cell.classList.add('invalid-move');
        }
    });
}

function clearHighlights() {
    document.querySelectorAll('.valid-move, .invalid-move, .selected').forEach(el => {
        el.classList.remove('valid-move', 'invalid-move', 'selected');
    });
    gameState.selectedPiecePos = null;
    gameState.legalMoves = [];
}

// 🚀 Uygulama Başlangıcı
connect();
