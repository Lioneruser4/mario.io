// Oyun durumu
const gameState = {
    roomId: null,
    playerId: null,
    playerNumber: null,
    isGameStarted: false,
    isSearching: false,
    socket: null,
    opponent: null,
    roomCode: null
};

// HTML elementleri
const elements = {
    loadingMessage: document.getElementById('loadingMessage'),
    loadingText: document.getElementById('loadingText'),
    status: document.getElementById('status'),
    gameScreen: document.getElementById('gameScreen'),
    rankedButton: document.getElementById('rankedButton'),
    privateButton: document.getElementById('privateButton'),
    roomCodeInput: document.getElementById('roomCodeInput'),
    joinButton: document.getElementById('joinButton'),
    roomCodeDisplay: document.getElementById('roomCodeDisplay'),
    opponentInfo: document.getElementById('opponentInfo'),
    playerInfo: document.getElementById('playerInfo')
};

// Socket.IO bağlantısı
function initializeSocket() {
    // Eğer zaten bir socket bağlantısı varsa kapat
    if (gameState.socket) {
        gameState.socket.disconnect();
    }
    
    // Yeni bir socket bağlantısı oluştur
    const serverUrl = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
    gameState.socket = io(serverUrl, {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        timeout: 20000,
        transports: ['websocket', 'polling'],
        upgrade: true,
        forceNew: true,
        withCredentials: true,
        extraHeaders: {
            'Access-Control-Allow-Origin': '*'
        }
    });
    
    // Socket olaylarını dinle
    setupSocketListeners();
    
    return gameState.socket;
}

// Socket olaylarını ayarla
function setupSocketListeners() {
    const socket = gameState.socket;
    
    // Sunucuya bağlanıldığında
    socket.on('connect', () => {
        console.log('Sunucuya bağlandı:', socket.id);
        gameState.playerId = socket.id;
        updateStatus('Sunucuya bağlanıldı');
        showLoading(false);
    });
    
    // Bağlantı hatası
    socket.on('connect_error', (error) => {
        console.error('Bağlantı hatası:', error);
        updateStatus('Sunucuya bağlanılamadı. Tekrar deneniyor...');
    });
    
    // Eşleşme durumu
    socket.on('matchmaking', (data) => {
        if (data.status === 'searching') {
            gameState.isSearching = true;
            updateStatus('Rakip aranıyor...');
        }
    });
    
    // Oda oluşturuldu
    socket.on('roomCreated', (data) => {
        gameState.roomId = data.roomId;
        gameState.roomCode = data.code;
        gameState.playerNumber = 1;
        updateStatus(`Oda kodu: ${data.code}\nRakibinizin bu kodu girmesini bekleyin...`);
        showRoomCode(data.code);
    });
    
    // Oyuncu odaya katıldı
    socket.on('playerJoined', (data) => {
        gameState.opponent = {
            id: data.playerId,
            name: data.playerName
        };
        updateStatus(`Rakip katıldı: ${data.playerName}`);
        startGame();
    });
    
    // Oyun başlatıldı
    socket.on('gameStart', (data) => {
        gameState.roomId = data.roomId;
        gameState.playerNumber = data.players.find(p => p.id === gameState.playerId)?.number || null;
        gameState.opponent = data.players.find(p => p.id !== gameState.playerId) || null;
        
        if (gameState.playerNumber) {
            updateStatus(`Oyun başlıyor! Sen Oyuncu ${gameState.playerNumber}`);
            startGame();
        }
    });
    
    // Rakip ayrıldı
    socket.on('playerLeft', (data) => {
        updateStatus('Rakip oyundan ayrıldı. Ana menüye yönlendiriliyorsunuz...');
        setTimeout(resetGame, 3000);
    });
    
    // Oyun bitti
    socket.on('gameEnded', (data) => {
        updateStatus(data.winner === gameState.playerId ? 'Tebrikler, kazandınız!' : 'Mağlup oldunuz!');
        setTimeout(resetGame, 5000);
    });
}

// Durum mesajını güncelleme fonksiyonu
function updateStatus(message) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
    }
    console.log('Durum:', message);
}

// Odaya katılma fonksiyonu
function joinRoom(roomId) {
    console.log('Odaya katılıyor:', roomId);
    if (gameState.socket && gameState.socket.connected) {
        gameState.socket.emit('joinRoom', roomId);
    } else {
        console.error('Socket bağlantısı yok! Tekrar bağlanılıyor...');
        initializeSocket();
        // 1 saniye sonra tekrar dene
        setTimeout(() => joinRoom(roomId), 1000);
    }
}

function startGame() {
    if (gameState.isGameStarted) return;
    
    console.log('Oyun başlatılıyor...');
    gameState.isGameStarted = true;
    showLoading(false);
    
    // Oyun alanını göster
    if (elements.gameScreen) {
        elements.gameScreen.classList.add('active');
    }
    
    // Oyun tahtasını başlat
    initializeBoard();
}

// Oyun tahtasını başlat
function initializeBoard() {
    // Burada oyun tahtası ve oyun mantığı başlatılacak
    console.log('Oyun tahtası başlatılıyor...');
    updateStatus('Oyun başladı!');
}

// Oda kodunu göster
function showRoomCode(code) {
    if (elements.roomCodeDisplay) {
        elements.roomCodeDisplay.textContent = `Oda Kodu: ${code}`;
        elements.roomCodeDisplay.style.display = 'block';
    }
}

// Yükleme ekranını göster/gizle
function showLoading(show, message = '') {
    if (elements.loadingMessage && elements.loadingText) {
        if (show) {
            elements.loadingMessage.style.display = 'flex';
            elements.loadingText.textContent = message || 'Yükleniyor...';
        } else {
            elements.loadingMessage.style.display = 'none';
        }
    }
}

// Durum mesajını güncelle
function updateStatus(message) {
    if (elements.status) {
        elements.status.textContent = message;
    }
    console.log('Durum:', message);
}

// Oyunu sıfırla
function resetGame() {
    gameState.roomId = null;
    gameState.playerNumber = null;
    gameState.isGameStarted = false;
    gameState.isSearching = false;
    gameState.opponent = null;
    gameState.roomCode = null;
    
    if (elements.gameScreen) {
        elements.gameScreen.classList.remove('active');
    }
    
    if (elements.roomCodeDisplay) {
        elements.roomCodeDisplay.style.display = 'none';
    }
    
    updateStatus('Ana menüye dönülüyor...');
    setTimeout(() => {
        updateStatus('Dereceli maç veya özel oda seçin');
    }, 1000);
}

// Oyunu başlat
function initGame() {
    // Socket bağlantısını başlat
    initializeSocket();
    
    // Buton olaylarını ayarla
    setupEventListeners();
    
    // Sayfa yüklendiğinde
    document.addEventListener('DOMContentLoaded', () => {
        console.log('Oyun başlatılıyor...');
        showLoading(true, 'Sunucuya bağlanılıyor...');
    });
}

// Buton olaylarını ayarla
function setupEventListeners() {
    // Dereceli maç butonu
    if (elements.rankedButton) {
        elements.rankedButton.addEventListener('click', startRankedMatch);
    }
    
    // Özel oda oluştur butonu
    if (elements.privateButton) {
        elements.privateButton.addEventListener('click', createPrivateRoom);
    }
    
    // Odaya katıl butonu
    if (elements.joinButton) {
        elements.joinButton.addEventListener('click', joinPrivateRoom);
    }
}

// Dereceli maç başlat
function startRankedMatch() {
    if (!gameState.socket || !gameState.socket.connected) {
        updateStatus('Sunucuya bağlı değil!');
        return;
    }
    
    gameState.isSearching = true;
    updateStatus('Rakip aranıyor...');
    gameState.socket.emit('startRankedMatch');
    showLoading(true, 'Rakip aranıyor...');
}

// Özel oda oluştur
function createPrivateRoom() {
    if (!gameState.socket || !gameState.socket.connected) {
        updateStatus('Sunucuya bağlı değil!');
        return;
    }
    
    gameState.socket.emit('createPrivateRoom');
    showLoading(true, 'Oda oluşturuluyor...');
}

// Özel odaya katıl
function joinPrivateRoom() {
    if (!gameState.socket || !gameState.socket.connected) {
        updateStatus('Sunucuya bağlı değil!');
        return;
    }
    
    const code = elements.roomCodeInput?.value?.trim();
    if (!code) {
        updateStatus('Lütfen geçerli bir oda kodu girin!');
        return;
    }
    
    gameState.socket.emit('joinPrivateRoom', { code });
    showLoading(true, 'Odaya katılılıyor...');
}

// Global olarak erişilebilir yap
window.gameModule = {
    init: initGame,
    start: startGame,
    joinRoom: joinRoom,
    state: gameState
};

// Oyunu başlat
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}
