// main.js - Amerikan Daması İstemci Mantığı (Frontend)

// Daha güvenilir bir WebSocket sunucusu
const SERVER_URL = "wss://socketsbay.com/wss/v2/1/demo/"; // Örnek bir WebSocket sunucusu
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
    
    try {
        socket = new WebSocket(SERVER_URL);

        socket.onopen = () => {
            dom.connStatusEl.className = 'status-box connected';
            dom.connStatusEl.textContent = '✅ Bağlantı Başarılı. Arena Hazır!';
            // Bağlantı başarılı olduğunda kullanıcı arayüzünü güncelle
            document.querySelectorAll('button').forEach(btn => btn.disabled = false);
        };
        
        socket.onclose = (event) => {
            dom.connStatusEl.className = 'status-box disconnected';
            dom.connStatusEl.textContent = `❌ Bağlantı Kesildi (${event.code}). 5s Sonra Yeniden Deneniyor...`;
            document.querySelectorAll('button').forEach(btn => btn.disabled = true);
            setTimeout(connect, 5000);
        };
        
        socket.onerror = (error) => {
            console.error("WebSocket Hatası:", error);
            dom.connStatusEl.textContent = `❌ Bağlantı Hatası: ${error.message || 'Bilinmeyen hata'}`;
        };
        
        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Sunucudan gelen veri:', data);
                handleServerMessage(data);
            } catch (e) { 
                console.error("Geçersiz Sunucu Verisi:", event.data, e);
            }
        };
    } catch (error) {
        console.error("WebSocket bağlantı hatası:", error);
        dom.connStatusEl.textContent = `❌ Bağlantı Hatası: ${error.message}`;
        setTimeout(connect, 5000);
    }
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
    // Tüm taşları kaldır
    document.querySelectorAll('.piece').forEach(p => p.remove());
    
    // Tahtayı güncelle
    for (const pos in boardState) {
        const { color, isKing } = boardState[pos];
        const cell = document.querySelector(`[data-pos="${pos}"]`);
        if (cell) {
            const piece = document.createElement('div');
            piece.classList.add('piece', color);
            if (isKing) piece.classList.add('king');
            
            // Taşlara tıklanabilirlik ekle
            piece.style.cursor = 'pointer';
            
            // Mobil dokunmatik olayları için
            piece.addEventListener('click', (e) => {
                e.stopPropagation();
                handleCellClick({ currentTarget: cell });
            });
            
            // Kral taşlarına özel işaret ekle
            if (isKing) {
                const crown = document.createElement('div');
                crown.className = 'crown';
                piece.appendChild(crown);
            }
            
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
    // Oyun başlamamışsa veya sıra bende değilse işlem yapma
    if (!gameState.gameId || !gameState.isMyTurn) {
        console.log('Sıra sizde değil veya oyun başlamamış');
        return;
    }

    const cell = event.currentTarget;
    const pos = cell.dataset.pos;
    const piece = cell.querySelector('.piece');
    const isMyPiece = piece && piece.classList.contains(gameState.myColor);
    
    // Eğer yasal bir hamle kutusuna tıklandıysa
    if (cell.classList.contains('legal-move')) {
        const fromPos = gameState.selectedPiecePos;
        const toPos = pos;
        const isCapture = cell.classList.contains('capture-move');
        
        console.log(`Hamle yapılıyor: ${fromPos} -> ${toPos}${isCapture ? ' (taş alarak)' : ''}`);
        
        // Hamle yap
        const moveResult = sendMessage('MAKE_MOVE', { 
            from: fromPos, 
            to: toPos,
            isCapture: isCapture,
            gameId: gameState.gameId
        });
        
        if (moveResult) {
            // Hemen arayüzü güncelle
            cell.classList.add('move-animation');
            setTimeout(() => cell.classList.remove('move-animation'), 500);
            
            // Seçimleri temizle
            clearHighlights();
            gameState.selectedPiecePos = null;
            
            // Sırayı değiştir
            gameState.isMyTurn = false;
            updateTurn(gameState.myColor === 'red' ? 'black' : 'red');
        }
        return;
    }

    // Eğer kendi taşımıza tıklandıysa
    if (isMyPiece) {
        // Aynı taşa tekrar tıklandıysa seçimi kaldır
        if (gameState.selectedPiecePos === pos) {
            clearHighlights();
            gameState.selectedPiecePos = null;
        } else {
            // Yeni taş seç
            console.log(`Taş seçildi: ${pos}`);
            clearHighlights();
            gameState.selectedPiecePos = pos;
            cell.classList.add('selected');
            
            // Yasal hamleleri al
            sendMessage('GET_LEGAL_MOVES', { 
                position: pos,
                gameId: gameState.gameId
            });
        }
    } else if (gameState.selectedPiecePos) {
        // Eğer başka bir yere tıklandıysa seçimi kaldır
        console.log('Geçersiz hamle, seçim kaldırılıyor');
        clearHighlights();
        gameState.selectedPiecePos = null;
    }
}
    }
}

function highlightLegalMoves(moves) {
    clearHighlights();
    
    // Seçili taşı vurgula
    if (gameState.selectedPiecePos) {
        const selectedCell = document.querySelector(`[data-pos="${gameState.selectedPiecePos}"]`);
        if (selectedCell) {
            selectedCell.classList.add('selected');
        }
    }
    
    // Yasal hamleleri işaretle
    moves.forEach(move => {
        const cell = document.querySelector(`[data-pos="${move.to}"]`);
        if (cell) {
            cell.classList.add('legal-move');
            if (move.isCapture) {
                cell.classList.add('capture-move');
                
                // Yenecek taşın pozisyonunu bul ve işaretle
                const fromRow = gameState.selectedPiecePos.charCodeAt(0) - 'A'.charCodeAt(0);
                const fromCol = 8 - parseInt(gameState.selectedPiecePos[1]);
                const toRow = move.to.charCodeAt(0) - 'A'.charCodeAt(0);
                const toCol = 8 - parseInt(move.to[1]);
                
                const capturedRow = fromRow + (toRow > fromRow ? 1 : -1);
                const capturedCol = fromCol + (toCol > fromCol ? 1 : -1);
                const capturedPos = String.fromCharCode(65 + capturedRow) + (8 - capturedCol);
                
                const capturedCell = document.querySelector(`[data-pos="${capturedPos}"]`);
                if (capturedCell) {
                    capturedCell.classList.add('will-be-captured');
                }
            }
        }
    });
}

function clearHighlights() {
    // Tüm vurgulamaları temizle
    document.querySelectorAll('.selected, .legal-move, .capture-move, .will-be-captured').forEach(el => {
        el.classList.remove('selected', 'legal-move', 'capture-move', 'will-be-captured');
    });
    gameState.selectedPiecePos = null;
}

// 🚀 Uygulama Başlangıcı
connect();
