// main.js

// Lobi DOM Elementleri
const connStatusEl = document.getElementById('connection-status');
const lobbyContainer = document.getElementById('lobby-container');
const gameContainer = document.getElementById('game-container');
const btnRanked = document.getElementById('btn-ranked');
const rankedText = document.getElementById('ranked-text');
const btnCreateRoom = document.getElementById('btn-create-room');
const roomCodeInput = document.getElementById('room-code-input');
const btnConnectRoom = document.getElementById('btn-connect-room');
const btnCopyCode = document.getElementById('btn-copy-code');
const playerTurnStatus = document.getElementById('player-turn-status');
const gameBoard = document.getElementById('game-board');

// Sunucu Bilgisi
const SERVER_URL = "wss://mario-io-1.onrender.com";
let socket = null;
let gameState = {
    gameId: null,
    myColor: null, // "red" veya "black"
    isMyTurn: false,
    selectedPiecePos: null // Tıklanan taşın pozisyonu
};

// ==========================================================
// A. SUNUCU BAĞLANTI YÖNETİMİ
// ==========================================================

function connect() {
    socket = new WebSocket(SERVER_URL);

    socket.onopen = () => {
        connStatusEl.className = 'status-box connected';
        connStatusEl.textContent = '✅ Sunucuya Başarıyla Bağlandı.';
        // 📢 Bağlantı bildirimi
    };

    socket.onclose = () => {
        connStatusEl.className = 'status-box disconnected';
        connStatusEl.textContent = '❌ Bağlantı Kesildi. Tekrar Deneniyor...';
        setTimeout(connect, 5000); // 5 saniye sonra tekrar dene
    };

    socket.onerror = (e) => {
        console.error("WebSocket Hatası:", e);
        connStatusEl.className = 'status-box disconnected';
        connStatusEl.textContent = '⚠️ Bağlantı Hatası!';
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleServerMessage(data);
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
    return false;
}

// ==========================================================
// B. SUNUCU MESAJ İŞLEYİCİ
// ==========================================================

function handleServerMessage(data) {
    switch (data.type) {
        case 'MATCH_FOUND':
        case 'ROOM_JOINED':
            startGame(data.gameId, data.color, data.boardState, data.turn);
            break;

        case 'ROOM_CREATED':
            alert(`Oda Kodu: ${data.roomCode}. Kopyala ve arkadaşına gönder.`);
            roomCodeInput.value = data.roomCode;
            btnCopyCode.classList.remove('hidden');
            break;
            
        case 'GAME_UPDATE':
            // Oyun tahtası ve sırayı güncelle
            updateBoard(data.boardState);
            updateTurn(data.turn);
            break;
            
        case 'LEGAL_MOVES':
            // Taş tıklandıktan sonra legal hamleleri renkle göster
            highlightLegalMoves(data.moves); 
            break;
            
        case 'ERROR':
            alert(`Sunucu Hatası: ${data.message}`);
            stopSearching();
            break;
    }
}

// ==========================================================
// C. LOBİ İŞLEVLERİ
// ==========================================================

btnRanked.addEventListener('click', () => {
    if (!btnRanked.classList.contains('searching')) {
        if (sendMessage('FIND_MATCH')) {
            startSearching();
        }
    } else {
        if (sendMessage('CANCEL_SEARCH')) {
            stopSearching();
        }
    }
});

function startSearching() {
    btnRanked.classList.add('searching');
    rankedText.textContent = 'Eşleşme Aranıyor... (İptal Et)';
    btnCreateRoom.disabled = true;
    btnConnectRoom.disabled = true;
}

function stopSearching() {
    btnRanked.classList.remove('searching');
    rankedText.textContent = 'Dereceli Eşleşme Bul';
    btnCreateRoom.disabled = false;
    btnConnectRoom.disabled = false;
}

btnCreateRoom.addEventListener('click', () => {
    sendMessage('CREATE_ROOM');
});

btnConnectRoom.addEventListener('click', () => {
    const code = roomCodeInput.value.trim();
    if (code.length === 4) {
        sendMessage('JOIN_ROOM', { roomCode: code });
    } else {
        alert('Lütfen 4 haneli kodu giriniz.');
    }
});

btnCopyCode.addEventListener('click', () => {
    navigator.clipboard.writeText(roomCodeInput.value);
    btnCopyCode.textContent = "Kopyalandı!";
    setTimeout(() => btnCopyCode.textContent = "Kodu Kopyala", 1500);
});


// ==========================================================
// D. OYUN KURULUM VE MANTIĞI
// ==========================================================

function startGame(gameId, color, boardState, turn) {
    gameState.gameId = gameId;
    gameState.myColor = color;
    updateTurn(turn);
    drawBoard();
    updateBoard(boardState); 
    
    lobbyContainer.classList.add('hidden');
    gameContainer.classList.remove('hidden');
}

function drawBoard() {
    gameBoard.innerHTML = ''; // Tahtayı temizle
    // Amerikan Daması (Checkers) tahtasını 8x8 oluştur
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div');
            // Tahta koordinatını "A1, H8" gibi kaydetmek için
            const pos = String.fromCharCode(65 + c) + (8 - r); 
            cell.classList.add('cell', (r + c) % 2 === 0 ? 'light' : 'dark');
            cell.dataset.pos = pos;
            cell.addEventListener('click', handleCellClick);
            gameBoard.appendChild(cell);
        }
    }
    // Tahtaya yön vermek için CSS'te dönebilir (Örn: Red altta)
    if (gameState.myColor === 'red') {
        gameBoard.style.transform = 'rotate(180deg)';
    }
}

function updateBoard(boardState) {
    // Tüm taşları kaldır
    document.querySelectorAll('.piece').forEach(p => p.remove());

    // Yeni taşları yerleştir
    for (const pos in boardState) {
        const { color, isKing } = boardState[pos];
        const cell = document.querySelector(`[data-pos="${pos}"]`);
        if (cell) {
            const piece = document.createElement('div');
            piece.classList.add('piece', color, isKing ? 'king' : 'standard');
            // Animasyon: Taşı tahtaya düşürür gibi
            piece.style.animation = 'piece-drop 0.5s ease-out'; 
            cell.appendChild(piece);
        }
    }
}

function updateTurn(turnColor) {
    gameState.isMyTurn = (turnColor === gameState.myColor);
    playerTurnStatus.textContent = gameState.isMyTurn 
        ? `🔥 SIRA SENDE (${gameState.myColor.toUpperCase()})`
        : `⌛ RAKİP OYNUYOR (${turnColor.toUpperCase()})`;

    // Işıklı sıra gösterimi
    const turnClass = gameState.isMyTurn ? 'my-turn-light' : 'opponent-turn-light';
    playerTurnStatus.className = turnClass;
}

// ==========================================================
// E. HAREKET VURGULAMA VE OYNATMA
// ==========================================================

function handleCellClick(event) {
    const cell = event.currentTarget;
    const pos = cell.dataset.pos;
    
    // 1. Taş Seçimi (Sadece kendi taşın ve senin sıran)
    if (cell.querySelector('.piece') && gameState.isMyTurn && cell.querySelector(`.${gameState.myColor}`)) {
        clearHighlights();
        gameState.selectedPiecePos = pos;
        cell.classList.add('selected');

        // Sunucudan olası hamleleri iste
        sendMessage('GET_LEGAL_MOVES', { gameId: gameState.gameId, pos: pos });

    } 
    // 2. Hamle Yapma (Vurgulanmış kareye tıklandı)
    else if (cell.classList.contains('legal-move') && gameState.selectedPiecePos) {
        // Hamleyi sunucuya gönder
        sendMessage('MAKE_MOVE', { 
            gameId: gameState.gameId, 
            from: gameState.selectedPiecePos, 
            to: pos 
        });
        clearHighlights(); // Hamle gönderildikten sonra temizle
        gameState.selectedPiecePos = null;
    } else {
        // Başka bir yere tıklandıysa seçimi iptal et
        clearHighlights();
    }
}

// Sunucudan gelen legal hamleleri (pozisyon dizisi) tahtada renkle gösterir
function highlightLegalMoves(moves) {
    clearHighlights();
    moves.forEach(pos => {
        const cell = document.querySelector(`[data-pos="${pos}"]`);
        if (cell) {
            cell.classList.add('legal-move'); // CSS ile renklendirme
        }
    });
}

function clearHighlights() {
    document.querySelectorAll('.selected').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.legal-move').forEach(c => c.classList.remove('legal-move'));
}

// 🚀 Başlat
connect();
