// Game Logic for Mario.io

// Socket bağlantısı
let socket;
const SERVER_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://mario-io-1.onrender.com';

// Game state
let gameState = {
    isConnected: false,
    currentScreen: 'loading',
    currentRoom: null,
    player: {
        id: null,
        username: '',
        isGuest: true,
        telegramId: null
    },
    game: null,
    socket: null
};

// Initialize the game
function initGame() {
    console.log('Oyun başlatılıyor...');
    
    // Socket bağlantısını başlat
    initializeSocket();
    
    // Oyuncu verilerini yükle
    loadPlayerData();
    
    // Arayüzü başlat
    initUI();
    
    // Yükleme ekranını göster
    showScreen('loading');
    
    console.log('Oyun başlatıldı');
}

// Socket bağlantısını başlat
function initializeSocket() {
    console.log('Sunucuya bağlanılıyor:', SERVER_URL);
    
    // Yeni socket bağlantısı oluştur
    socket = io(SERVER_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        forceNew: true
    });
    
    // Bağlantı olaylarını dinle
    socket.on('connect', onSocketConnect);
    socket.on('disconnect', onSocketDisconnect);
    socket.on('connect_error', onSocketError);
    
    // Oyun olaylarını dinle
    socket.on('roomCreated', onRoomCreated);
    socket.on('gameStart', onGameStart);
    socket.on('gameUpdate', onGameUpdate);
    socket.on('gameOver', onGameOver);
}

// Socket bağlantı olayları
function onSocketConnect() {
    console.log('Sunucuya bağlanıldı. Socket ID:', socket.id);
    gameState.isConnected = true;
    gameState.player.id = socket.id;
    showMessage('Sunucuya bağlanıldı!', false);
    showScreen('lobby');
    
    // Kullanıcı adını güncelle
    if (gameState.player.username) {
        updatePlayerInfo();
    }
}

function onSocketDisconnect(reason) {
    console.warn('Sunucu bağlantısı kesildi. Sebep:', reason);
    gameState.isConnected = false;
    showMessage('Sunucu bağlantısı kesildi. Yeniden bağlanılıyor...', true);
}

function onSocketError(error) {
    console.error('Bağlantı hatası:', error);
    showMessage('Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.', true);
}

// Oyun olayları
function onRoomCreated(data) {
    console.log('Oda oluşturuldu:', data);
    gameState.currentRoom = data.roomId;
    gameState.game = data.game;
    
    if (data.isRanked) {
        showScreen('queueScreen');
    } else {
        document.getElementById('roomCode').textContent = data.roomId;
        showScreen('waitScreen');
    }
}

function onGameStart(data) {
    console.log('Oyun başladı:', data);
    gameState.game = data;
    showScreen('gameScreen');
    // Oyun tahtasını çiz
    renderGameBoard();
}

function onGameUpdate(data) {
    console.log('Oyun güncellendi:', data);
    gameState.game = data;
    // Oyun tahtasını güncelle
    updateGameBoard();
}

function onGameOver(data) {
    console.log('Oyun bitti:', data);
    gameState.game = data;
    // Oyun sonu ekranını göster
    showGameOverScreen(data);
}

// Oyuncu bilgilerini güncelle
function updatePlayerInfo() {
    if (socket && socket.connected) {
        socket.emit('updatePlayer', {
            username: gameState.player.username,
            telegramId: gameState.player.telegramId
        });
    }
}

// Load player data
function loadPlayerData() {
    // Try to get Telegram ID if available
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
        gameState.player.telegramId = window.Telegram.WebApp.initDataUnsafe.user.id.toString();
        gameState.player.isGuest = false;
        
        // Try to get username
        if (window.Telegram.WebApp.initDataUnsafe.user.username) {
            gameState.player.username = window.Telegram.WebApp.initDataUnsafe.user.username;
        } else if (window.Telegram.WebApp.initDataUnsafe.user.first_name) {
            gameState.player.username = window.Telegram.WebApp.initDataUnsafe.user.first_name;
        }
    }
    
    // If no Telegram data, create guest account
    if (gameState.isGuest) {
        gameState.player.id = 'GUEST_' + Math.random().toString(36).substr(2, 9);
        gameState.player.username = 'Misafir' + Math.floor(Math.random() * 1000);
    }
    
    console.log('Player data loaded:', gameState.player);
}

// Initialize UI elements and event listeners
function initUI() {
    console.log('Arayüz başlatılıyor...');
    
    // Kullanıcı adı alanını ayarla
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        // Eğer kullanıcı adı varsa ayarla
        if (gameState.player.username) {
            usernameInput.value = gameState.player.username;
        }
        
        // Kullanıcı adı değiştiğinde güncelle
        usernameInput.addEventListener('input', (e) => {
            gameState.player.username = e.target.value.trim();
            updatePlayerInfo();
        });
    }
    
    // Buton olaylarını bağla
    bindButtonEvents();
}

// Buton olaylarını bağla
function bindButtonEvents() {
    console.log('Buton olayları bağlanıyor...');
    
    // Buton referanslarını al
    const rankedBtn = document.getElementById('createRankedBtn');
    const casualBtn = document.getElementById('createCasualBtn');
    const cancelQueueBtn = document.getElementById('cancelQueueBtn');
    const cancelWaitBtn = document.getElementById('cancelWaitBtn');
    const copyCodeBtn = document.getElementById('copyCodeBtn');
    const playAgainBtn = document.getElementById('playAgainBtn');
    const returnToLobbyBtn = document.getElementById('returnToLobbyBtn');
    
    // Olay dinleyicilerini ekle
    if (rankedBtn) rankedBtn.onclick = () => startGame(true);
    if (casualBtn) casualBtn.onclick = () => startGame(false);
    if (cancelQueueBtn) cancelQueueBtn.onclick = cancelQueue;
    if (cancelWaitBtn) cancelWaitBtn.onclick = leaveRoom;
    if (copyCodeBtn) copyCodeBtn.onclick = copyRoomCode;
    if (playAgainBtn) playAgainBtn.onclick = playAgain;
    if (returnToLobbyBtn) returnToLobbyBtn.onclick = returnToLobby;
    
    console.log('Buton olayları bağlandı');
}

// Yeni bir oyun başlat (dereceli veya arkadaşla)
function startGame(isRanked) {
    console.log(isRanked ? 'Dereceli oyun' : 'Arkadaşla oyun', 'başlatılıyor...');
    
    // Socket bağlantısını kontrol et
    if (!socket || !socket.connected) {
        showMessage('Sunucuya bağlanılıyor...', false);
        initializeSocket();
        return;
    }
    
    // Kullanıcı adını kontrol et
    const username = document.getElementById('username')?.value.trim();
    if (!username) {
        showMessage('Lütfen bir kullanıcı adı girin', true);
        return;
    }
    
    gameState.player.username = username;
    
    // Yükleme ekranını göster
    showScreen('loading');
    
    // Sunucuya oyun başlatma isteği gönder
    socket.emit('startGame', {
        isRanked: isRanked,
        username: gameState.player.username,
        telegramId: gameState.player.telegramId
    });
}

// Odayı terk et
function leaveRoom() {
    if (socket && gameState.currentRoom) {
        socket.emit('leaveRoom', { roomId: gameState.currentRoom });
        gameState.currentRoom = null;
    }
    showScreen('lobby');
}

// Kuyruktan çık
function cancelQueue() {
    if (socket) {
        socket.emit('leaveQueue');
    }
    showScreen('lobby');
}

// Oda kodunu kopyala
function copyRoomCode() {
    if (gameState.currentRoom) {
        navigator.clipboard.writeText(gameState.currentRoom)
            .then(() => showMessage('Oda kodu panoya kopyalandı!', false))
            .catch(err => console.error('Kopyalama hatası:', err));
    }
}

// Tekrar oyna
function playAgain() {
    if (socket && gameState.currentRoom) {
        socket.emit('playAgain', { roomId: gameState.currentRoom });
        showScreen('loading');
    }
}

// Lobiye dön
function returnToLobby() {
    if (socket && gameState.currentRoom) {
        socket.emit('leaveRoom', { roomId: gameState.currentRoom });
        gameState.currentRoom = null;
    }
    showScreen('lobby');
}

// Ekran değiştirme fonksiyonu
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.add('active');
        gameState.currentScreen = screenId;
    }
}

// Mesaj gösterme fonksiyonu
function showMessage(message, isError = false) {
    const messageElement = document.getElementById('globalMessage');
    const messageText = document.getElementById('messageText');
    
    if (messageElement && messageText) {
        messageText.textContent = message;
        messageElement.className = isError ? 'error' : 'info';
        messageElement.style.display = 'block';
        
        // 3 saniye sonra mesajı gizle
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, 3000);
    }
}

// Oyun tahtasını çiz
function renderGameBoard() {
    const gameScreen = document.getElementById('gameScreen');
    if (!gameScreen) return;
    
    // Burada oyun tahtası çizilecek
    // Örnek bir tahta oluşturma kodu:
    let boardHtml = '<div class="board">';
    for (let row = 0; row < 8; row++) {
        boardHtml += '<div class="row">';
        for (let col = 0; col < 8; col++) {
            const isDark = (row + col) % 2 === 1;
            boardHtml += `<div class="square ${isDark ? 'dark' : 'light'}" data-row="${row}" data-col="${col}"></div>`;
        }
        boardHtml += '</div>';
    }
    boardHtml += '</div>';
    
    gameScreen.innerHTML = boardHtml;
}

// Oyun tahtasını güncelle
function updateGameBoard() {
    // Oyun durumuna göre tahtayı güncelle
    if (!gameState.game) return;
    
    // Taşları yerleştir
    // Bu kısmı oyun mantığınıza göre doldurmanız gerekecek
}

// Oyun sonu ekranını göster
function showGameOverScreen(data) {
    const gameOverScreen = document.getElementById('gameOverScreen');
    const gameOverMessage = document.getElementById('gameOverMessage');
    
    if (gameOverScreen && gameOverMessage) {
        if (data.winner === gameState.player.id) {
            gameOverMessage.textContent = 'Tebrikler, kazandınız! 🎉';
        } else {
            gameOverMessage.textContent = 'Maalesef kaybettiniz. Tekrar deneyin!';
        }
        
        showScreen('gameOverScreen');
    }
}

// Sayfa yüklendiğinde oyunu başlat
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}

// Show a specific screen
function showScreen(screenName) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Show the requested screen
    const screen = document.getElementById(screenName);
    if (screen) {
        screen.classList.add('active');
        gameState.currentScreen = screenName;
    }
    
    console.log('Showing screen:', screenName);
}

// Show message to user
function showMessage(message, isError = false) {
    const messageDiv = document.getElementById('message');
    if (messageDiv) {
        messageDiv.textContent = message;
        messageDiv.className = isError ? 'error' : 'info';
        messageDiv.style.display = 'block';
        
        // Hide message after 5 seconds
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }
    
    console.log(isError ? 'Error:' : 'Info:', message);
}

// Start the game when the page loads
window.addEventListener('DOMContentLoaded', initGame);

// Make functions available globally
window.game = {
    init: initGame,
    start: startGame,
    showScreen: showScreen,
    showMessage: showMessage,
    state: gameState
};
