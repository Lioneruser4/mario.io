// Oyun durumu
const gameState = {
    roomId: 'default-room',
    playerId: null,
    playerNumber: null,
    isGameStarted: false,
    socket: null
};

// Socket.IO bağlantısı
function initializeSocket() {
    // Eğer zaten bir socket bağlantısı varsa kapat
    if (gameState.socket) {
        gameState.socket.disconnect();
    }
    
    // Yeni bir socket bağlantısı oluştur
    gameState.socket = io('http://localhost:3000', {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        transports: ['websocket', 'polling']
    });
    
    return gameState.socket;
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

// Oyun başlatma fonksiyonu
function startGame() {
    if (gameState.isGameStarted) return;
    
    console.log('Oyun başlatılıyor...');
    gameState.isGameStarted = true;
    updateStatus('Oyun başlatılıyor...');
    
    // Oyun alanını göster
    const gameScreen = document.getElementById('gameScreen');
    if (gameScreen) {
        gameScreen.classList.add('active');
    }
    
    // Socket'e oyun başlatma isteği gönder
    if (gameState.socket && gameState.socket.connected) {
        gameState.socket.emit('startGame', { 
            roomId: gameState.roomId,
            playerId: gameState.playerId
        });
    } else {
        console.error('Socket bağlantısı yok!');
        updateStatus('Bağlantı hatası! Lütfen sayfayı yenileyin.');
    }
}

// Oyunu başlat
function initGame() {
    // Socket bağlantısını başlat
    const socket = initializeSocket();
    
    // Socket bağlantı olaylarını dinle
    socket.on('connect', () => {
        console.log('Sunucuya bağlandı:', socket.id);
        gameState.playerId = socket.id;
        updateStatus('Sunucuya bağlanıldı, odaya katılıyor...');
        joinRoom(gameState.roomId);
        
        // Odaya katılma olaylarını dinle
        socket.on('roomJoined', (data) => {
            console.log('Odaya katıldı:', data);
            gameState.playerNumber = data.playerNumber;
            updateStatus(`Oda: ${data.roomId} | Oyuncu ${data.playerNumber} | Bekleniyor...`);
            
            // Eğer 2. oyuncuysak oyunu başlat
            if (data.playerNumber === 2) {
                startGame();
            }
        });
        
        // Oyun başlatma olayını dinle
        socket.on('startGame', (data) => {
            console.log('Oyun başlatılıyor:', data);
            updateStatus('Oyun başlıyor!');
            // Oyun alanını göster
            const gameScreen = document.getElementById('gameScreen');
            if (gameScreen) {
                gameScreen.classList.add('active');
            }
            // Oyunu başlat
            if (window.startGame) {
                window.startGame();
            }
        });
    });
    
    // Hata durumlarını dinle
    socket.on('connect_error', (error) => {
        console.error('Bağlantı hatası:', error);
        updateStatus('Sunucuya bağlanılamadı. Tekrar deneniyor...');
        // 3 saniye sonra tekrar dene
        setTimeout(() => {
            socket.connect();
        }, 3000);
    });
    
    // Oyun başlatma butonuna tıklama olayını ekle
    const startButton = document.getElementById('start-custom-game-button');
    if (startButton) {
        startButton.addEventListener('click', () => {
            if (!gameState.isGameStarted) {
                startGame();
            }
        });
    }
    
    // Sayfa yüklendiğinde oyunu başlat
    document.addEventListener('DOMContentLoaded', () => {
        console.log('Sayfa yüklendi, oyun başlatılıyor...');
        updateStatus('Sunucuya bağlanılıyor...');
    });
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
