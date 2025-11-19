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
        this.playerName = playerName || 'Sen';
        this.opponentName = 'Rakip';
        this.isPlayerTurn = playerColor === 'black'; // Black starts first
        
        this.setupSocketListeners();
        this.render();
    }
    
    setupSocketListeners() {
        if (!this.socket) return;
        
        this.socket.on('gameStart', (data) => {
            this.opponentName = data.opponentName;
            this.updatePlayerInfo();
            this.showToast(`${this.opponentName} oyuna katıldı!`);
            this.render();
        });
        
        this.socket.on('opponentMove', (move) => {
            this.handleOpponentMove(move);
        });
        
        this.socket.on('gameOver', (result) => {
            this.handleGameOver(result);
        });
        
        this.socket.on('opponentLeft', () => {
            this.showToast('Rakip oyundan ayrıldı!', 'warning');
            this.gameOver = true;
            this.updateGameStatus('Rakip oyundan ayrıldı!');
        });
        
        this.socket.on('chatMessage', (message) => {
            this.showToast(`${this.opponentName}: ${message}`, 'info');
        });
    }
    
    // Handle opponent's move received from server
    handleOpponentMove(move) {
        const { from, to, captured } = move;
        
        // Move the piece
        this.board[to.row][to.col] = this.board[from.row][from.col];
        this.board[from.row][from.col] = null;
        
        // Remove captured pieces
        if (captured) {
            captured.forEach(pos => {
                this.board[pos.row][pos.col] = null;
            });
        }
        
        // Check for king promotion
        this.checkKingPromotion(to.row, to.col);
        
        // Check for additional captures
        const additionalCaptures = this.getValidCaptures(to.row, to.col);
        const isMultiCapture = additionalCaptures.length > 0 && captured && captured.length > 0;
        
        if (isMultiCapture) {
            // Opponent can continue capturing
            this.captureChains = additionalCaptures.map(capture => ({
                from: to,
                to: { row: capture.row, col: capture.col },
                captured: capture.captured
            }));
            this.isPlayerTurn = false;
            this.updateGameStatus('Rakibin hamlesi - Çoklu taş alma sırası');
        } else {
            // It's now player's turn
            this.isPlayerTurn = true;
            this.currentPlayer = this.playerColor;
            this.updateGameStatus('Sıra sende!');
            this.checkGameOver();
        }
        
        this.render();
    }
    
    // Get all valid moves for a piece
    getValidMoves(row, col) {
        if (!this.isValidPosition(row, col) || !this.board[row][col]) {
            return [];
        }
        
        const piece = this.board[row][col];
        const moves = [];
        const captures = [];
        
        // Check normal moves
        const directions = [];
        if (piece.isKing || piece.type === 'black') {
            directions.push({ dr: 1, dc: -1 }, { dr: 1, dc: 1 }); // Black moves down
        }
        if (piece.isKing || piece.type === 'white') {
            directions.push({ dr: -1, dc: -1 }, { dr: -1, dc: 1 }); // White moves up
        }
        
        // Check for captures first (mandatory capture rule)
        const allCaptures = this.getAllPossibleCaptures(piece.type);
        if (allCaptures.length > 0) {
            // If there are captures available, only return capture moves for this piece
            return this.getValidCaptures(row, col);
        }
        
        // If no captures, check normal moves
        for (const dir of directions) {
            const newRow = row + dir.dr;
            const newCol = col + dir.dc;
            
            if (this.isValidPosition(newRow, newCol) && !this.board[newRow][newCol]) {
                moves.push({
                    row: newRow,
                    col: newCol,
                    isCapture: false
                });
            }
        }
        
        return moves;
    }
    
    // Get all possible captures for a piece
    getValidCaptures(row, col) {
        if (!this.isValidPosition(row, col) || !this.board[row][col]) {
            return [];
        }
        
        const piece = this.board[row][col];
        const captures = [];
        
        const directions = [
            { dr: 2, dc: -2, jumpRow: 1, jumpCol: -1 },  // Up-left
            { dr: 2, dc: 2, jumpRow: 1, jumpCol: 1 },    // Up-right
            { dr: -2, dc: -2, jumpRow: -1, jumpCol: -1 }, // Down-left
            { dr: -2, dc: 2, jumpRow: -1, jumpCol: 1 }    // Down-right
        ];
        
        for (const dir of directions) {
            const newRow = row + dir.dr;
            const newCol = col + dir.dc;
            const jumpRow = row + dir.jumpRow;
            const jumpCol = col + dir.jumpCol;
            
            if (this.isValidPosition(newRow, newCol) && !this.board[newRow][newCol]) {
                if (this.isValidPosition(jumpRow, jumpCol) && 
                    this.board[jumpRow][jumpCol] && 
                    this.board[jumpRow][jumpCol].type !== piece.type) {
                    
                    captures.push({
                        row: newRow,
                        col: newCol,
                        captured: [{ row: jumpRow, col: jumpCol }],
                        isCapture: true
                    });
                }
            }
        }
        
        return captures;
    }
    
    // Get all possible captures for all pieces of a color
    getAllPossibleCaptures(color) {
        const captures = [];
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.type === color) {
                    const pieceCaptures = this.getValidCaptures(row, col);
                    if (pieceCaptures.length > 0) {
                        captures.push({
                            from: { row, col },
                            captures: pieceCaptures
                        });
                    }
                }
            }
        }
        
        return captures;
    }
    
    // Check if a position is valid (within board bounds)
    isValidPosition(row, col) {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }
    
    // Check if a piece can be promoted to king
    checkKingPromotion(row, col) {
        const piece = this.board[row][col];
        if (!piece) return;
        
        if ((piece.type === 'black' && row === 7) || 
            (piece.type === 'white' && row === 0)) {
            piece.isKing = true;
        }
    }
    
    // Handle player's move
    makeMove(fromRow, fromCol, toRow, toCol) {
        if (this.gameOver || !this.isPlayerTurn) return false;
        
        const piece = this.board[fromRow][fromCol];
        if (!piece || piece.type !== this.playerColor) return false;
        
        // Check if it's a valid move
        const validMoves = this.getValidMoves(fromRow, fromCol);
        const move = validMoves.find(m => m.row === toRow && m.col === toCol);
        
        if (!move) return false;
        
        // Move the piece
        this.board[toRow][toCol] = { ...piece };
        this.board[fromRow][fromCol] = null;
        
        let capturedPieces = [];
        
        // Handle capture
        if (move.isCapture && move.captured) {
            capturedPieces = [...move.captured];
            move.captured.forEach(pos => {
                this.board[pos.row][pos.col] = null;
            });
        }
        
        // Check for king promotion
        this.checkKingPromotion(toRow, toCol);
        
        // If it's a multiplayer game, send the move to the server
        if (this.isMultiplayer) {
            this.socket.emit('makeMove', {
                roomId: this.roomId,
                from: { row: fromRow, col: fromCol },
                to: { row: toRow, col: toCol },
                captured: capturedPieces
            });
        }
        
        // Check for additional captures
        const additionalCaptures = this.getValidCaptures(toRow, toCol);
        const isMultiCapture = additionalCaptures.length > 0 && capturedPieces.length > 0;
        
        if (isMultiCapture) {
            // Player can continue capturing with the same piece
            this.selectedPiece = { row: toRow, col: toCol };
            this.validMoves = additionalCaptures;
            this.updateGameStatus('Çoklu taş alma sırası!');
        } else {
            // Switch turns
            this.selectedPiece = null;
            this.validMoves = [];
            this.isPlayerTurn = false;
            this.currentPlayer = this.currentPlayer === 'black' ? 'white' : 'black';
            
            if (this.isMultiplayer) {
                this.updateGameStatus('Rakibin hamlesi bekleniyor...');
            } else {
                this.updateGameStatus(`Sıra ${this.currentPlayer === 'black' ? 'siyah' : 'beyaz'} oyuncuda`);
            }
            
            // Check for game over
            this.checkGameOver();
        }
        
        this.render();
        return true;
    }
    
    // Check if the game is over
    checkGameOver() {
        const blackPieces = [];
        const whitePieces = [];
        let blackHasMoves = false;
        let whiteHasMoves = false;
        
        // Count pieces and check for valid moves
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (!piece) continue;
                
                if (piece.type === 'black') {
                    blackPieces.push({ row, col });
                    if (this.getValidMoves(row, col).length > 0) {
                        blackHasMoves = true;
                    }
                } else {
                    whitePieces.push({ row, col });
                    if (this.getValidMoves(row, col).length > 0) {
                        whiteHasMoves = true;
                    }
                }
            }
        }
        
        // Check win conditions
        if (blackPieces.length === 0 || (this.currentPlayer === 'black' && !blackHasMoves)) {
            this.handleGameOver({ winner: 'white', reason: 'Tüm taşlar yok edildi veya hamle yapılamıyor' });
            return true;
        }
        
        if (whitePieces.length === 0 || (this.currentPlayer === 'white' && !whiteHasMoves)) {
            this.handleGameOver({ winner: 'black', reason: 'Tüm taşlar yok edildi veya hamle yapılamıyor' });
            return true;
        }
        
        return false;
    }
    
    // Handle game over
    handleGameOver(result) {
        this.gameOver = true;
        
        let message = '';
        if (result.winner === 'draw') {
            message = 'Oyun berabere bitti!';
        } else {
            const winnerName = this.isMultiplayer 
                ? (result.winner === this.playerColor ? this.playerName : this.opponentName)
                : (result.winner === 'black' ? 'Siyah' : 'Beyaz');
                
            message = `Kazanan: ${winnerName}!`;
            if (result.reason) {
                message += ` (${result.reason})`;
            }
        }
        
        this.updateGameStatus(message);
        this.showToast(`Oyun bitti! ${message}`, 'success');
        
        // Emit game over event in multiplayer
        if (this.isMultiplayer && this.socket) {
            this.socket.emit('gameOver', {
                roomId: this.roomId,
                winner: result.winner,
                reason: result.reason
            });
        }
    }
    
    // Render the game board
    render() {
        const gameBoard = document.getElementById('gameBoard');
        if (!gameBoard) return;
        
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
        const moveHints = document.getElementById('moveHints');
        if (!moveHints) return;
        
        moveHints.innerHTML = '';
        
        if (!this.selectedPiece) return;
        
        const { row, col } = this.selectedPiece;
        const piece = this.board[row][col];
        
        if (!piece || piece.type !== this.currentPlayer) return;
        
        const moves = this.validMoves.length > 0 ? this.validMoves : this.getValidMoves(row, col);
        
        moves.forEach(move => {
            const hint = document.createElement('div');
            hint.className = 'move-hint';
            hint.style.width = '30px';
            hint.style.height = '30px';
            hint.style.left = `${(move.col / 8) * 100}%`;
            hint.style.top = `${(move.row / 8) * 100}%`;
            
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
        
        // If a piece is already selected and it's the player's turn
        if (this.selectedPiece) {
            const { row: selectedRow, col: selectedCol } = this.selectedPiece;
            
            // If clicking on the same piece, deselect it
            if (selectedRow === row && selectedCol === col) {
                this.selectedPiece = null;
                this.validMoves = [];
                this.render();
                return;
            }
            
            // If clicking on another piece of the same color, select it
            if (piece && piece.type === this.playerColor) {
                this.selectedPiece = { row, col };
                this.validMoves = [];
                this.render();
                return;
            }
            
            // Try to make a move
            if (this.makeMove(selectedRow, selectedCol, row, col)) {
                return;
            }
        }
        
        // If no piece is selected, select this one if it's the player's piece
        if (piece && piece.type === this.playerColor) {
            this.selectedPiece = { row, col };
            this.validMoves = this.getValidMoves(row, col);
            this.render();
        }
    }
    
    // Update player information display
    updatePlayerInfo() {
        const player1Name = document.getElementById('player1Name');
        const player2Name = document.getElementById('player2Name');
        const player1Status = document.getElementById('player1Status');
        const player2Status = document.getElementById('player2Status');
        
        if (this.isMultiplayer) {
            if (this.playerColor === 'black') {
                player1Name.textContent = this.playerName;
                player2Name.textContent = this.opponentName || 'Bekleniyor...';
                
                if (this.isPlayerTurn) {
                    player1Status.classList.add('active');
                    player2Status.classList.remove('active');
                } else {
                    player1Status.classList.remove('active');
                    player2Status.classList.add('active');
                }
            } else {
                player1Name.textContent = this.opponentName || 'Bekleniyor...';
                player2Name.textContent = this.playerName;
                
                if (this.isPlayerTurn) {
                    player2Status.classList.add('active');
                    player1Status.classList.remove('active');
                } else {
                    player2Status.classList.remove('active');
                    player1Status.classList.add('active');
                }
            }
        } else {
            player1Name.textContent = 'Siyah';
            player2Name.textContent = 'Beyaz';
            
            if (this.currentPlayer === 'black') {
                player1Status.classList.add('active');
                player2Status.classList.remove('active');
            } else {
                player1Status.classList.remove('active');
                player2Status.classList.add('active');
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
        document.getElementById('lobby').classList.add('active');
        document.getElementById('game').classList.remove('active');
        
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
