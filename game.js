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
            this.selectedPiece = { row: to.row, col: to.col };
            this.validMoves = additionalCaptures;
            this.isPlayerTurn = false;
            this.updateGameStatus('Rakibin hamlesi - Çoklu taş alma sırası');
        } else {
            // It's now player's turn
            this.selectedPiece = null;
            this.validMoves = [];
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
        
        // --- YEME ZORUNLULUĞU KONTROLÜ (MANDATORY CAPTURE) ---
        const allCaptures = this.getAllPossibleCaptures(piece.type);
        if (allCaptures.length > 0) {
            // Eğer yeme zorunluluğu varsa, sadece bu taşın yeme hamlelerini döndür.
            const pieceCaptures = this.getValidCaptures(row, col);
            if (pieceCaptures.length > 0) {
                return pieceCaptures;
            } else {
                // Tahta üzerinde yeme zorunluluğu var ama bu taş yiyemiyor. Geçerli hamlesi yok.
                return []; 
            }
        }
        
        // Eğer yeme zorunluluğu yoksa, normal hareketleri kontrol et
        const directions = [];
        if (piece.isKing || piece.type === 'black') {
            // Siyah (Black) normalde aşağı hareket eder (row artar)
            directions.push({ dr: 1, dc: -1 }, { dr: 1, dc: 1 }); 
        }
        if (piece.isKing || piece.type === 'white') {
            // Beyaz (White) normalde yukarı hareket eder (row azalır)
            directions.push({ dr: -1, dc: -1 }, { dr: -1, dc: 1 }); 
        }
        
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
        
        const directions = [];
        
        // Dama tahtasında King olmayan taşlar sadece ileriye doğru zıplar (yeme yapar).
        // Ancak bu kodda hem siyah hem beyaz için 4 yönü de kontrol edip, 
        // taşın normal hareket yönüne uygun olmaması durumunda sadece King'in yemesine izin vermeliyiz.
        
        const captureDirs = [
            { dr: 2, dc: -2, jumpRow: 1, jumpCol: -1 },  // İleri-Sol
            { dr: 2, dc: 2, jumpRow: 1, jumpCol: 1 },    // İleri-Sağ
            { dr: -2, dc: -2, jumpRow: -1, jumpCol: -1 }, // Geri-Sol
            { dr: -2, dc: 2, jumpRow: -1, jumpCol: 1 }    // Geri-Sağ
        ];
        
        for (const dir of captureDirs) {
            const newRow = row + dir.dr;
            const newCol = col + dir.dc;
            const jumpRow = row + (dir.dr / 2); // Atlanacak taşın konumu
            const jumpCol = col + (dir.dc / 2); // Atlanacak taşın konumu
            
            // Eğer parça KING değilse, sadece kendi yönünde (siyah için dr=2, beyaz için dr=-2) hareket edebilir/yiyebilir.
            const isForwardCapture = (piece.type === 'black' && dir.dr > 0) || (piece.type === 'white' && dir.dr < 0);
            
            if (!piece.isKing && !isForwardCapture) {
                continue; // King olmayan taş geriye yiyemez
            }
            
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
                        // Yalnızca yeme imkanı olan taşları listeliyoruz.
                        // makeMove() içinde bu zorunluluğu kontrol edeceğiz.
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
        
        // Siyah (black) 7. satıra (en alta) ulaşınca kral olur
        // Beyaz (white) 0. satıra (en üste) ulaşınca kral olur
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
        
        // Check if it's a valid move (capture priority is handled inside getValidMoves)
        // Eğer selectedPiece varsa (çoklu yeme durumu), validMoves zaten sadece yeme hamlelerini içerir.
        const movesToConsider = this.selectedPiece ? this.validMoves : this.getValidMoves(fromRow, fromCol);
        const move = movesToConsider.find(m => m.row === toRow && m.col === toCol);
        
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
        
        // Check for king promotion (taşı hareket ettirdikten sonra kontrol etmeliyiz)
        this.checkKingPromotion(toRow, toCol);
        
        
        // Check for additional captures (Zorunlu çoklu yeme)
        const additionalCaptures = this.getValidCaptures(toRow, toCol);
        const isMultiCapture = additionalCaptures.length > 0 && capturedPieces.length > 0;
        
        if (isMultiCapture) {
            // Player can continue capturing with the same piece
            this.selectedPiece = { row: toRow, col: toCol };
            this.validMoves = additionalCaptures;
            this.updateGameStatus('Çoklu taş alma sırası!');
            
            // Eğer çoklu yeme imkanı varsa, hamleyi sunucuya göndermiyoruz (henüz bitmedi)
        } else {
            // Hamle bitti: Sıra değiştir ve sunucuya gönder
            
            // Switch turns
            this.selectedPiece = null;
            this.validMoves = [];
            this.isPlayerTurn = false;
            this.currentPlayer = this.currentPlayer === 'black' ? 'white' : 'black';
            
            if (this.isMultiplayer) {
                this.updateGameStatus('Rakibin hamlesi bekleniyor...');
                
                // Hamle bitince sunucuya gönder
                this.socket.emit('makeMove', {
                    roomId: this.roomId,
                    from: { row: fromRow, col: fromCol },
                    to: { row: toRow, col: toCol },
                    captured: capturedPieces
                });
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
            this.handleGameOver({ winner: 'white', reason: 'Tüm siyah taşlar yok edildi veya hamle yapılamıyor' });
            return true;
        }
        
        if (whitePieces.length === 0 || (this.currentPlayer === 'white' && !whiteHasMoves)) {
            this.handleGameOver({ winner: 'black', reason: 'Tüm beyaz taşlar yok edildi veya hamle yapılamıyor' });
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
        // Bu fonksiyonun doğru çalışması için HTML yapınızda uygun bir 'moveHints' elementi olmalıdır.
        const moveHints = document.getElementById('moveHints');
        const gameBoard = document.getElementById('gameBoard');
        
        if (!moveHints || !gameBoard || !this.selectedPiece) return;
        
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
