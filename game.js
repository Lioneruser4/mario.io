class CheckersGame {
    constructor() {
        this.board = [];
        this.currentPlayer = 'black'; // black starts first
        this.selectedPiece = null;
        this.validMoves = [];
        this.gameOver = false;
        this.playerColor = null;
        this.opponentColor = null;
        this.playerName = 'Oyuncu';
        this.opponentName = 'Rakip';
        this.roomId = null;
        this.socket = null;
        this.isMultiplayer = false;
        this.isPlayerTurn = false;
        this.lastMove = null;
        this.mustCapture = false;
        this.captureChains = [];
        
        this.initializeBoard();
    }
    
    initializeBoard() {
        // Initialize empty board
        this.board = Array(8).fill().map(() => Array(8).fill(null));
        
        // Set up black pieces (top)
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 8; col++) {
                if ((row + col) % 2 === 1) {
                    this.board[row][col] = { type: 'black', isKing: false };
                }
            }
        }
        
        // Set up white pieces (bottom)
        for (let row = 5; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if ((row + col) % 2 === 1) {
                    this.board[row][col] = { type: 'white', isKing: false };
                }
            }
        }
    }
    
    // Initialize multiplayer game with socket
    initMultiplayer(socket, roomId, playerColor, playerName) {
        this.socket = socket;
        this.roomId = roomId;
        this.isMultiplayer = true;
        this.playerColor = playerColor;
        this.opponentColor = playerColor === 'black' ? 'white' : 'black';
        this.playerName = 'Sen'; // Always show as 'Sen' for self
        this.opponentName = 'Rakip'; // Always show as 'Rakip' for opponent
        this.isPlayerTurn = playerColor === 'black'; // Black starts first
        
        this.setupSocketListeners();
        this.render();
        this.setupTouchControls(); // Initialize touch controls for mobile
    }
    
    setupTouchControls() {
        const board = document.getElementById('board');
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let touchEndY = 0;
        let touchStartTime = 0;
        
        board.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            touchStartTime = Date.now();
            
            // Handle piece selection
            const rect = board.getBoundingClientRect();
            const x = Math.floor((touch.clientX - rect.left) / (rect.width / 8));
            const y = Math.floor((touch.clientY - rect.top) / (rect.height / 8));
            
            if (this.isValidSelection(x, y)) {
                this.selectPiece(x, y);
            }
        }, { passive: false });
        
        board.addEventListener('touchend', (e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            touchEndX = touch.clientX;
            touchEndY = touch.clientY;
            
            const touchDuration = Date.now() - touchStartTime;
            
            // Only process as tap if it was a short touch (not a swipe)
            if (touchDuration < 300) {
                const rect = board.getBoundingClientRect();
                const x = Math.floor((touch.clientX - rect.left) / (rect.width / 8));
                const y = Math.floor((touch.clientY - rect.top) / (rect.height / 8));
                
                if (this.selectedPiece) {
                    this.handleMove(x, y);
                } else if (this.isValidSelection(x, y)) {
                    this.selectPiece(x, y);
                }
            }
        }, { passive: false });
        
        // Prevent scrolling when touching the game board
        board.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
    }
    
    setupSocketListeners() {
        if (!this.socket) return;
        
        this.socket.on('gameStart', (data) => {
            // Always show opponent as 'Rakip' regardless of their actual name
            this.opponentName = 'Rakip';
            this.updatePlayerInfo();
            this.showToast(`Rakip oyuna katıldı!`);
            this.render();
        });
        
        this.socket.on('opponentMove', (move) => {
            this.handleOpponentMove(move);
        });
        
        this.socket.on('gameOver', (result) => {
            this.handleGameOver(result);
        });
        
        this.socket.on('opponentLeft', () => {
            this.handleOpponentLeft();
        });
        
        this.socket.on('returnToLobby', () => {
            this.returnToLobby();
        });
        
        this.socket.on('chatMessage', (message) => {
            this.showToast(`${this.opponentName}: ${message}`, 'info');
        });
    }
    
    handleOpponentLeft() {
        // Show toast notification
        this.showToast('Rakip oyundan ayrıldı!', 'warning');
        
        // Set game over state
        this.gameOver = true;
        this.isPlayerTurn = false;
        
        // Show game over message
        const gameOverOverlay = document.getElementById('gameOverOverlay');
        const gameOverText = document.getElementById('gameOverText');
        const returnToLobbyBtn = document.getElementById('returnToLobbyBtn');
        
        if (gameOverOverlay && gameOverText) {
            gameOverOverlay.classList.remove('hidden');
            gameOverText.textContent = 'Rakip oyundan ayrıldı!\nLobiye yönlendiriliyorsunuz...';
            
            if (returnToLobbyBtn) {
                returnToLobbyBtn.onclick = () => this.returnToLobby();
            }
        }
        
        // Update game status
        this.updateGameStatus('Rakip oyundan ayrıldı!');
        
        // Notify server if in multiplayer
        if (this.isMultiplayer && this.socket) {
            this.socket.emit('opponentLeft', { roomId: this.roomId });
        }
        
        // Return to lobby after a delay
        if (this.returnToLobbyTimeout) {
            clearTimeout(this.returnToLobbyTimeout);
        }
        this.returnToLobbyTimeout = setTimeout(() => {
            this.returnToLobby();
        }, 5000);
    }
    
    // Reset game to initial state and return to lobby
    returnToLobby() {
        // Clear any pending timeouts
        if (this.returnToLobbyTimeout) {
            clearTimeout(this.returnToLobbyTimeout);
            this.returnToLobbyTimeout = null;
        }
        
        // Reset game state
        this.initializeBoard();
        this.currentPlayer = 'black';
        this.selectedPiece = null;
        this.validMoves = [];
        this.gameOver = false;
        this.lastMove = null;
        this.mustCapture = false;
        this.captureChains = [];
        this.isPlayerTurn = false;
        
        // Hide game over overlay if visible
        const gameOverOverlay = document.getElementById('gameOverOverlay');
        if (gameOverOverlay) {
            gameOverOverlay.classList.add('hidden');
        }
        
        // Show lobby and hide game
        const gameScreen = document.getElementById('game');
        const lobbyScreen = document.getElementById('lobby');
        const searchingDiv = document.getElementById('searching');
        const roomInfoDiv = document.getElementById('roomInfo');
        
        if (gameScreen) gameScreen.classList.remove('active');
        if (lobbyScreen) lobbyScreen.classList.add('active');
        if (searchingDiv) searchingDiv.classList.add('hidden');
        if (roomInfoDiv) roomInfoDiv.classList.add('hidden');
        
        // Reset player info
        this.updatePlayerInfo();
        
        // Notify server we're leaving the game
        if (this.isMultiplayer && this.socket) {
            if (this.roomId) {
                this.socket.emit('leaveGame', { roomId: this.roomId });
            }
            // Clean up all socket listeners
            const events = ['gameStart', 'opponentMove', 'gameOver', 'opponentLeft', 'returnToLobby', 'chatMessage'];
            events.forEach(event => this.socket.off(event));
        }
        
        // Reset multiplayer state
        this.isMultiplayer = false;
        this.roomId = null;
        this.socket = null;
        this.playerColor = null;
        this.opponentColor = null;
        
        // Update status
        this.updateGameStatus('Oyundan çıkıldı. Yeni bir oyuna başlamak için seçim yapın.');
        
        // Force a re-render
        this.render();
    }
    
    // Handle opponent's move received from server
    handleOpponentMove(move) {
        if (this.gameOver) return;
        
        try {
            // Apply the move
            const { from, to, captured } = move;
            this.makeMove(from.row, from.col, to.row, to.col);
            
            // Check for additional captures (çoklu yeme)
            const additionalCaptures = this.getValidCaptures(to.row, to.col);
            const isMultiCapture = additionalCaptures.length > 0 && captured && captured.length > 0;
            
            if (isMultiCapture) {
                // Opponent can continue capturing
                this.updateGameStatus('Rakip çoklu taş alıyor...');
                
                // If it's a forced capture, wait for the next move
                if (this.mustCapture) {
                    return;
                }
            }
            
            // Opponent's turn is over
            this.isPlayerTurn = true;
            this.currentPlayer = this.playerColor;
            this.updateGameStatus('Sıra sende!');
            
            // Check for game over after opponent's move
            if (!this.checkGameOver()) {
                // If game is not over, check if current player has any valid moves
                const hasValidMoves = this.hasAnyValidMoves(this.currentPlayer);
                if (!hasValidMoves) {
                    // Current player has no valid moves, game over
                    this.handleGameOver({
                        winner: this.opponentColor,
                        reason: 'Hamle yapılamadığı için oyun bitti.'
                    });
                    return;
                }
                
                // Check for forced captures
                const forcedCaptures = this.getAllPossibleCaptures(this.currentPlayer);
                if (forcedCaptures.length > 0) {
                    this.mustCapture = true;
                    this.updateGameStatus('Zorunlu taş alma! Lütfen taş alın.');
                } else {
                    this.mustCapture = false;
                }
            }
            
            this.render();
        } catch (error) {
            console.error('Opponent move error:', error);
            this.updateGameStatus('Bir hata oluştu. Lütfen tekrar deneyin.');
            this.returnToLobby();
        }
    }
    
    // Check if there are any valid moves for the current player
    hasAnyValidMoves(color) {
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.type === color) {
                    const moves = this.getValidMoves(row, col);
                    if (moves.length > 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    
    // Handle game over
    handleGameOver(result) {
        if (this.gameOver) return; // Prevent multiple game over triggers
        
        this.gameOver = true;
        let message = '';
        let isWinner = result.winner === this.playerColor;
        
        if (isWinner) {
            message = 'Tebrikler! Kazandınız! 🎉';
            // Play win sound if available
            this.playSound('win');
        } else if (result.winner === this.opponentColor) {
            message = 'Maalesef kaybettiniz.\n' + (result.reason || '');
            // Play lose sound if available
            this.playSound('lose');
        } else {
            message = 'Oyun bitti!\n' + (result.reason || '');
        }
        
        // Show game over overlay
        const gameOverOverlay = document.getElementById('gameOverOverlay');
        const gameOverText = document.getElementById('gameOverText');
        const returnToLobbyBtn = document.getElementById('returnToLobbyBtn');
        
        if (gameOverOverlay && gameOverText) {
            gameOverOverlay.classList.remove('hidden');
            gameOverText.textContent = message;
            
            if (returnToLobbyBtn) {
                returnToLobbyBtn.onclick = () => this.returnToLobby();
            }
        }
        
        // Disable further moves
        this.isPlayerTurn = false;
        
        // Notify server if in multiplayer
        if (this.isMultiplayer && this.socket) {
            this.socket.emit('gameOver', {
                roomId: this.roomId,
                winner: result.winner,
                reason: result.reason
            });
        }
        
        // Auto return to lobby after 10 seconds if not manually returned
        if (this.returnToLobbyTimeout) {
            clearTimeout(this.returnToLobbyTimeout);
        }
        this.returnToLobbyTimeout = setTimeout(() => {
            this.returnToLobby();
        }, 10000);
    }
    
    // Play sound effects
    playSound(type) {
        try {
            const audio = new Audio();
            audio.volume = 0.5;
            
            switch(type) {
                case 'move':
                    audio.src = 'move.mp3';
                    break;
                case 'capture':
                    audio.src = 'capture.mp3';
                    break;
                case 'win':
                    audio.src = 'win.mp3';
                    break;
                case 'lose':
                    audio.src = 'lose.mp3';
                    break;
                default:
                    return;
            }
            
            audio.play().catch(e => console.log('Ses çalınamadı:', e));
        } catch (e) {
            console.log('Ses hatası:', e);
        }
    }
    
    // Render the game board
    render() {
        const gameBoard = document.getElementById('board');
        if (!gameBoard) {
            console.error('Tahta elementi bulunamadı!');
            return;
        }
        
        // Clear the board
        gameBoard.innerHTML = '';
        
        // Create the board cells
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const cell = document.createElement('div');
                cell.className = `cell ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                // Add piece if exists
                const piece = this.board[row][col];
                if (piece) {
                    const pieceElement = document.createElement('div');
                    pieceElement.className = `piece ${piece.type} ${piece.isKing ? 'king' : ''}`;
                    
                    // Highlight selected piece
                    if (this.selectedPiece && this.selectedPiece.row === row && this.selectedPiece.col === col) {
                        pieceElement.classList.add('highlight');
                    }
                    
                    cell.appendChild(pieceElement);
                }
                
                // Add click event
                cell.addEventListener('click', () => this.handleCellClick(row, col));
                
                gameBoard.appendChild(cell);
            }
        }
        
        // Show valid moves
        this.renderValidMoves();
        
        // Update player info
        this.updatePlayerInfo();
    }
    
    // Render valid moves as hints
    renderValidMoves() {
        // Bu fonksiyonun doğru çalışması için HTML yapınızda uygun bir 'moveHints' elementi olmalıdır.
        const moveHints = document.getElementById('moveHints');
        const gameBoard = document.getElementById('board');
        
        if (!moveHints) {
            console.error('moveHints elementi bulunamadı!');
            return;
        }
        
        if (!gameBoard) {
            console.error('Tahta elementi bulunamadı!');
            return;
        }
        
        if (!this.selectedPiece) {
            console.log('Seçili taş yok.');
            return;
        }
        
        moveHints.innerHTML = '';
        
        const { row, col } = this.selectedPiece;
        const piece = this.board[row][col];
        
        // Multiplayer'da sadece kendi sıramızdaysa ve kendi taşımızsa göster
        if (!piece || piece.type !== this.playerColor || !this.isPlayerTurn) return; 
        
        // Çoklu yeme durumunda validMoves'u kullan, aksi halde yeniden hesapla
        const moves = this.validMoves.length > 0 ? this.validMoves : this.getValidMoves(row, col);
        
        // Board'un boyutunu al (cell boyutunu bilmediğimiz için dinamik hesaplayalım)
        const boardRect = gameBoard.getBoundingClientRect();
        const cellWidth = boardRect.width / 8;
        const cellHeight = boardRect.height / 8;

        moves.forEach(move => {
            const hint = document.createElement('div');
            hint.className = 'move-hint';
            
            // Konumu hücrenin ortasına göre ayarla
            hint.style.left = `${move.col * cellWidth}px`;
            hint.style.top = `${move.row * cellHeight}px`;
            hint.style.width = `${cellWidth}px`;
            hint.style.height = `${cellHeight}px`;

            // Yeme hamlesi için farklı bir görsel stil
            if (move.isCapture) {
                hint.classList.add('capture-hint');
            }
            
            hint.addEventListener('click', (e) => {
                e.stopPropagation();
                this.makeMove(row, col, move.row, move.col);
            });
            
            moveHints.appendChild(hint);
        });
    }
    
    // Handle cell click
    handleCellClick(row, col) {
        if (this.gameOver || !this.isPlayerTurn) return;
        
        const piece = this.board[row][col];
        const isMyPiece = piece && piece.type === this.playerColor;
        
        // Tahta üzerinde yeme zorunluluğu var mı?
        const mandatoryCaptureAvailable = this.getAllPossibleCaptures(this.playerColor).length > 0;
        
        // Eğer bir taş zaten seçiliyse...
        if (this.selectedPiece) {
            const { row: selectedRow, col: selectedCol } = this.selectedPiece;
            
            // Aynı taşa tıklanırsa seçimi kaldır
            if (selectedRow === row && selectedCol === col) {
                this.selectedPiece = null;
                this.validMoves = [];
                this.render();
                return;
            }
            
            // Başka bir kendi taşına tıklanırsa yeni taşı seç
            if (isMyPiece) {
                // Yeme zorunluluğu varken yiyemeyen taşı seçmeye izin verme
                if (mandatoryCaptureAvailable) {
                    const newPieceCaptures = this.getValidCaptures(row, col);
                    if (newPieceCaptures.length > 0) {
                        this.selectedPiece = { row, col };
                        this.validMoves = newPieceCaptures; // Sadece yeme hamleleri
                        this.render();
                        return;
                    } else {
                         // Zorunluluk var ama bu taş yiyemiyor. Seçimi değiştirme/izin verme.
                        return; 
                    }
                }
                
                // Zorunluluk yoksa veya çoklu yeme sırası değilse yeni taşı seç
                if (!mandatoryCaptureAvailable || (this.validMoves.length === 0)) {
                    this.selectedPiece = { row, col };
                    this.validMoves = this.getValidMoves(row, col);
                    this.render();
                    return;
                }
            }
            
            // Başka bir yere tıklanırsa hamle yapmayı dene
            if (this.makeMove(selectedRow, selectedCol, row, col)) {
                return;
            }
            
        }
        
        // Eğer hiçbir taş seçili değilse ve kendi taşımızsa...
        if (isMyPiece) {
            
            // Yeme zorunluluğu varsa, sadece yiyebilen taşı seç.
            if (mandatoryCaptureAvailable) {
                const pieceCaptures = this.getValidCaptures(row, col);
                if (pieceCaptures.length > 0) {
                    this.selectedPiece = { row, col };
                    this.validMoves = pieceCaptures;
                    this.render();
                } else {
                    // Zorunluluk var ama bu taş yiyemiyor. Seçim yapmaya izin verme.
                }
            } else {
                // Zorunluluk yoksa normal taşı seç
                this.selectedPiece = { row, col };
                this.validMoves = this.getValidMoves(row, col);
                this.render();
            }
        }
    }
    
    // Update player information display
    updatePlayerInfo() {
        const player1Name = document.getElementById('player1Name');
        const player2Name = document.getElementById('player2Name');
        const player1Status = document.getElementById('l1');
        const player2Status = document.getElementById('l2');

        // Always show current player as 'Sen' and opponent as 'Rakip' in their respective positions
        if (this.playerColor === 'black') {
            player1Name.textContent = 'Sen';
            player2Name.textContent = 'Rakip';
            
            // Update turn indicators
            if (this.currentPlayer === 'black') {
                player1Status.style.backgroundColor = this.isPlayerTurn ? '#4CAF50' : '#ccc';
                player2Status.style.backgroundColor = '#ccc';
            } else {
                player1Status.style.backgroundColor = '#ccc';
                player2Status.style.backgroundColor = this.isPlayerTurn ? '#4CAF50' : '#ccc';
            }
        } else {
            player1Name.textContent = 'Rakip';
            player2Name.textContent = 'Sen';
            
            // Update turn indicators
            if (this.currentPlayer === 'black') {
                player1Status.style.backgroundColor = this.isPlayerTurn ? '#4CAF50' : '#ccc';
                player2Status.style.backgroundColor = '#ccc';
            } else {
                player1Status.style.backgroundColor = '#ccc';
                player2Status.style.backgroundColor = this.isPlayerTurn ? '#4CAF50' : '#ccc';
            }
        }
    }
    }
    
    // Update game status text
    updateGameStatus(text) {
        const gameStatus = document.getElementById('gameStatus');
        if (gameStatus) {
            gameStatus.textContent = text;
        }
    }
    
    // Show toast notification
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = 'toast';
        toast.classList.add('show');
        
        // Add type class if provided
        if (type) {
            toast.classList.add(type);
        }
        
        // Hide after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
    
    // Reset the game
    reset() {
        this.board = [];
        this.currentPlayer = 'black';
        this.selectedPiece = null;
        this.validMoves = [];
        this.gameOver = false;
        this.initializeBoard();
        this.render();
        this.updateGameStatus('Sıra siyah oyuncuda');
    }
    
    // Leave the current game
    leaveGame() {
        if (this.isMultiplayer && this.socket) {
            this.socket.emit('leaveGame', { roomId: this.roomId });
        }
        
        // Reset the game
        this.reset();
        
        // Show lobby
        const lobby = document.getElementById('lobby');
        const gameEl = document.getElementById('game');
        if (lobby) lobby.classList.add('active');
        if (gameEl) gameEl.classList.remove('active');
        
        // Reset multiplayer state
        this.isMultiplayer = false;
        this.roomId = null;
        this.playerColor = null;
        this.opponentColor = null;
        this.isPlayerTurn = false;
    }
}

// Create a global game instance
const game = new CheckersGame();

// Initialize the game when the page loads
window.addEventListener('load', () => {
    game.render();
    
    // Add event listener for leave game button
    const leaveGameBtn = document.getElementById('leaveGameBtn');
    if (leaveGameBtn) {
        leaveGameBtn.addEventListener('click', () => game.leaveGame());
    }
});
