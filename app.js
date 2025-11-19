document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const lobbyScreen = document.getElementById('lobby');
    const gameScreen = document.getElementById('game');
    const rankedBtn = document.getElementById('rankedBtn');
    const friendBtn = document.getElementById('friendBtn');
    const friendSection = document.getElementById('friendSection');
    const backBtn = document.getElementById('backBtn');
    const searchingContainer = document.getElementById('searchingContainer');
    const cancelSearchBtn = document.getElementById('cancelSearchBtn');
    const createRoomBtn = document.getElementById('createRoomBtn');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const copyCodeBtn = document.getElementById('copyCodeBtn');
    const roomCodeInput = document.getElementById('roomCode');
    const joinCodeInput = document.getElementById('joinCode');
    const leaveGameBtn = document.getElementById('leaveGameBtn');

    // Socket.IO connection
    const socket = io('https://mario-io-1.onrender.com');
    let game = null;

    // Event Listeners
    rankedBtn.addEventListener('click', startRankedGame);
    friendBtn.addEventListener('click', showFriendSection);
    backBtn.addEventListener('click', showMainMenu);
    cancelSearchBtn.addEventListener('click', cancelSearch);
    createRoomBtn.addEventListener('click', createRoom);
    joinRoomBtn.addEventListener('click', joinRoom);
    copyCodeBtn.addEventListener('click', copyRoomCode);
    leaveGameBtn.addEventListener('click', leaveGame);

    // Initialize UI
    function initUI() {
        // Add any UI initialization code here
    }

    // Start a ranked game
    function startRankedGame() {
        showSearchingScreen();
        
        // Generate a random player name
        const playerName = `Oyuncu${Math.floor(1000 + Math.random() * 9000)}`;
        
        // Emit event to find a match
        socket.emit('findMatch', { 
            gameType: 'ranked',
            playerName: playerName
        });
    }

    // Show friend section
    function showFriendSection() {
        document.querySelector('.game-modes').classList.add('hidden');
        friendSection.classList.remove('hidden');
        backBtn.classList.remove('hidden');
        
        // Generate a random room code
        const randomCode = Math.floor(1000 + Math.random() * 9000).toString();
        roomCodeInput.value = randomCode;
    }

    // Show main menu
    function showMainMenu() {
        document.querySelector('.game-modes').classList.remove('hidden');
        friendSection.classList.add('hidden');
        searchingContainer.classList.add('hidden');
        backBtn.classList.add('hidden');
    }

    // Show searching screen
    function showSearchingScreen() {
        document.querySelector('.game-modes').classList.add('hidden');
        friendSection.classList.add('hidden');
        searchingContainer.classList.remove('hidden');
        backBtn.classList.remove('hidden');
    }

    // Cancel search
    function cancelSearch() {
        socket.emit('cancelSearch');
        showMainMenu();
    }

    // Create a room
    function createRoom() {
        const roomCode = roomCodeInput.value.trim();
        if (roomCode.length !== 4 || !/^\d+$/.test(roomCode)) {
            showToast('Geçersiz oda kodu! 4 haneli bir sayı girin.', 'error');
            return;
        }

        const playerName = `Oyuncu${Math.floor(1000 + Math.random() * 9000)}`;
        
        showSearchingScreen();
        socket.emit('createRoom', { 
            roomCode: roomCode,
            playerName: playerName
        });
    }

    // Join a room
    function joinRoom() {
        const roomCode = joinCodeInput.value.trim();
        if (roomCode.length !== 4 || !/^\d+$/.test(roomCode)) {
            showToast('Geçersiz oda kodu! 4 haneli bir sayı girin.', 'error');
            return;
        }

        const playerName = `Oyuncu${Math.floor(1000 + Math.random() * 9000)}`;
        
        showSearchingScreen();
        socket.emit('joinRoom', { 
            roomCode: roomCode,
            playerName: playerName
        });
    }

    // Copy room code to clipboard
    function copyRoomCode() {
        roomCodeInput.select();
        document.execCommand('copy');
        showToast('Oda kodu panoya kopyalandı!');
    }

    // Leave the current game
    function leaveGame() {
        if (game) {
            game.leaveGame();
        }
        
        // Show lobby and hide game
        lobbyScreen.classList.add('active');
        gameScreen.classList.remove('active');
        
        // Reset UI
        showMainMenu();
    }

    // Show toast notification
    function showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = 'toast';
        toast.classList.add('show', type);
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // Socket event listeners
    socket.on('connect', () => {
        console.log('Sunucuya bağlandı');
    });

    socket.on('disconnect', () => {
        showToast('Sunucu bağlantısı kesildi. Tekrar bağlanılıyor...', 'error');
    });

    socket.on('roomCreated', (data) => {
        showToast(`Oda oluşturuldu: ${data.roomCode}`, 'success');
    });

    socket.on('roomJoined', (data) => {
        showToast(`Odaya katıldınız: ${data.roomCode}`, 'success');
    });

    socket.on('roomFull', () => {
        showToast('Oda dolu!', 'error');
        showMainMenu();
    });

    socket.on('roomNotFound', () => {
        showToast('Oda bulunamadı!', 'error');
        showMainMenu();
    });

    socket.on('gameStart', (data) => {
        // Hide lobby and show game
        lobbyScreen.classList.remove('active');
        gameScreen.classList.add('active');
        
        // Initialize the game
        game = new CheckersGame();
        game.initMultiplayer(
            socket, 
            data.roomId, 
            data.playerColor,
            data.playerName
        );
        
        // Update player info
        document.getElementById('player1Name').textContent = data.playerName;
        document.getElementById('player2Name').textContent = data.opponentName || 'Bekleniyor...';
        
        // Show game status
        game.updateGameStatus(data.playerColor === 'black' ? 'Sıra sende!' : 'Rakibin hamlesi bekleniyor...');
    });

    socket.on('opponentJoined', (data) => {
        showToast(`${data.opponentName} oyuna katıldı!`, 'success');
        document.getElementById('player2Name').textContent = data.opponentName;
    });

    socket.on('error', (error) => {
        showToast(`Hata: ${error.message}`, 'error');
        showMainMenu();
    });

    // Initialize the UI
    initUI();
});
