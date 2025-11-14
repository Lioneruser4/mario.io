// Game Logic for Mario.io

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
    console.log('Game initializing...');
    
    // Load player data
    loadPlayerData();
    
    // Initialize UI
    initUI();
    
    // Show loading screen
    showScreen('loading');
    
    console.log('Game initialized');
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
    console.log('Initializing UI...');
    
    // Set username in the UI if available
    const usernameInput = document.getElementById('username');
    if (usernameInput && gameState.player.username) {
        usernameInput.value = gameState.player.username;
    }
    
    // Bind button events
    bindButtonEvents();
}

// Bind button events
function bindButtonEvents() {
    console.log('Binding button events...');
    
    // Ranked Game Button
    const rankedBtn = document.getElementById('createRankedBtn');
    if (rankedBtn) {
        rankedBtn.onclick = () => startGame(true);
    }
    
    // Casual Game Button
    const casualBtn = document.getElementById('createCasualBtn');
    if (casualBtn) {
        casualBtn.onclick = () => startGame(false);
    }
    
    // Cancel Queue Button
    const cancelQueueBtn = document.getElementById('cancelQueueBtn');
    if (cancelQueueBtn) {
        cancelQueueBtn.onclick = cancelQueue;
    }
    
    // Cancel Wait Button
    const cancelWaitBtn = document.getElementById('cancelWaitBtn');
    if (cancelWaitBtn) {
        cancelWaitBtn.onclick = cancelWaiting;
    }
    
    // Return to Lobby Button
    const returnToLobbyBtn = document.getElementById('returnToLobbyBtn');
    if (returnToLobbyBtn) {
        returnToLobbyBtn.onclick = returnToLobby;
    }
    
    // Play Again Button
    const playAgainBtn = document.getElementById('playAgainBtn');
    if (playAgainBtn) {
        playAgainBtn.onclick = playAgain;
    }
    
    console.log('Button events bound');
}

// Start a new game (ranked or casual)
function startGame(isRanked) {
    console.log('Starting', isRanked ? 'ranked' : 'casual', 'game...');
    
    // Check if socket is connected
    if (!gameState.socket || !gameState.socket.connected) {
        showMessage('Sunucuya bağlanılıyor...', false);
        // Try to reconnect
        if (window.socket) {
            gameState.socket = window.socket;
            gameState.socket.connect();
        } else {
            showMessage('Sunucu bağlantısı yok. Lütfen sayfayı yenileyin.', true);
            return;
        }
    }
    
    // Get username from input or use default
    const usernameInput = document.getElementById('username');
    if (usernameInput && usernameInput.value.trim() !== '') {
        gameState.player.username = usernameInput.value.trim();
    }
    
    // Show loading screen
    showScreen('loading');
    
    // Emit createRoom event
    gameState.socket.emit('createRoom', {
        username: gameState.player.username,
        telegramId: gameState.player.telegramId,
        isRanked: isRanked
    });
}

// Cancel queue
function cancelQueue() {
    if (gameState.socket && gameState.socket.connected) {
        gameState.socket.emit('leaveQueue');
    }
    stopQueueTimer();
    showScreen('lobby');
}

// Cancel waiting in room
function cancelWaiting() {
    if (gameState.socket && gameState.socket.connected && gameState.currentRoom) {
        gameState.socket.emit('leaveRoom', { roomId: gameState.currentRoom });
        gameState.currentRoom = null;
    }
    showScreen('lobby');
}

// Return to lobby
function returnToLobby() {
    showScreen('lobby');
}

// Play again
function playAgain() {
    if (gameState.socket && gameState.socket.connected) {
        gameState.socket.emit('playAgain');
        showScreen('loading');
    }
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
