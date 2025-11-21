class CheckersGame {
    constructor() {
        this.socket = io();
        this.roomCode = null;
        this.playerColor = null;
        this.board = [];
        this.selectedPiece = null;
        this.validMoves = [];
        this.currentTurn = null;
        this.isMyTurn = false;
        
        this.initializeEventListeners();
        this.showScreen('menuScreen');
    }

    initializeEventListeners() {
        // Socket event listeners
        this.socket.on('matchFound', (data) => {
            this.roomCode = data.roomCode;
            this.playerColor = data.color;
            this.showScreen('gameScreen');
            this.updatePlayerInfo();
            this.showToast(`Eşleşme bulundu! Sen ${data.color === 'red' ? 'Kırmızı' : 'Beyaz'} oyuncusun.`);
        });

        this.socket.on('searchStatus', (data) => {
            document.getElementById('searchStatus').textContent = data.message;
        });

        this.socket.on('searchCancelled', () => {
            this.showScreen('menuScreen');
        });

        this.socket.on('roomCreated', (data) => {
            this.roomCode = data.roomCode;
            this.playerColor = 'red';
            this.showToast(`Oda oluşturuldu! Oda kodu: ${data.roomCode}`);
        });

        this.socket.on('opponentJoined', (data) => {
            this.showScreen('gameScreen');
            this.updatePlayerInfo();
            this.showToast('Rakip oyuna katıldı!');
        });

        this.socket.on('gameUpdate', (data) => {
            this.board = data.board;
            this.currentTurn = data.currentTurn;
            this.isMyTurn = this.currentTurn === this.playerColor;
            
            // Çoklu zıplama durumu
            if (data.mustJump && data.jumpPosition) {
                this.selectedPiece = data.jumpPosition;
                this.validMoves = this.getJumps(data.jumpPosition.r, data.jumpPosition.c);
                this.showToast('Çoklu zıplama yapmalısın!');
            } else {
                this.selectedPiece = null;
                this.validMoves = [];
            }
            
            this.renderBoard();
            this.updateTurnIndicator();
        });

        this.socket.on('gameOver', (data) => {
            const winner = data.winner === this.playerColor ? 'Sen kazandın!' : 'Rakip kazandı!';
            const reason = data.reason ? ` (${data.reason})` : '';
            this.showToast(`Oyun bitti! ${winner}${reason}`);
            setTimeout(() => this.returnToMenu(), 3000);
        });

        this.socket.on('error', (message) => {
            this.showToast(`Hata: ${message}`);
        });
    }

    showScreen(screenId) {
        ['menuScreen', 'searchScreen', 'gameScreen'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });
        document.getElementById(screenId).classList.remove('hidden');
    }

    showToast(message) {
        // Basit bildirim sistemi
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 3000);
    }

    updatePlayerInfo() {
        const redPlayer = document.getElementById('redPlayer');
        const whitePlayer = document.getElementById('whitePlayer');
        
        if (this.playerColor === 'red') {
            redPlayer.textContent = 'Sen';
            whitePlayer.textContent = 'Rakip';
        } else {
            redPlayer.textContent = 'Rakip';
            whitePlayer.textContent = 'Sen';
        }
    }

    updateTurnIndicator() {
        const turnInfo = document.getElementById('turnInfo');
        const redIndicator = document.getElementById('redIndicator');
        const whiteIndicator = document.getElementById('whiteIndicator');
        
        turnInfo.textContent = `Sıra: ${this.currentTurn === 'red' ? 'Kırmızı' : 'Beyaz'}`;
        
        // Aktif oyuncu göstergesi
        redIndicator.classList.toggle('active', this.currentTurn === 'red');
        whiteIndicator.classList.toggle('active', this.currentTurn === 'white');
    }

    renderBoard() {
        const boardElement = document.getElementById('gameBoard');
        boardElement.innerHTML = '';
        
        // Tahtayı oyuncu yönüne göre çevir
        if (this.playerColor === 'white') {
            boardElement.classList.add('rotated');
        } else {
            boardElement.classList.remove('rotated');
        }

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const cell = this.createCell(row, col);
                boardElement.appendChild(cell);
            }
        }
    }

    createCell(row, col) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.className += (row + col) % 2 === 0 ? ' white' : ' black';
        
        // Oyuncu yönüne göre koordinatları ayarla
        const displayRow = this.playerColor === 'white' ? 7 - row : row;
        const displayCol = this.playerColor === 'white' ? 7 - col : col;
        
        cell.dataset.row = row;
        cell.dataset.col = col;

        // Geçerli hamle gösterimi
        if (this.validMoves.some(move => move.to.r === row && move.to.c === col)) {
            cell.classList.add('valid-move');
        }

        // Seçili taşı göster
        if (this.selectedPiece && this.selectedPiece.r === row && this.selectedPiece.c === col) {
            cell.classList.add('selected');
        }

        // Taşı ekle
        const pieceValue = this.board[row][col];
        if (pieceValue !== 0) {
            const piece = this.createPiece(pieceValue);
            cell.appendChild(piece);
        }

        cell.addEventListener('click', () => this.handleCellClick(row, col));
        
        return cell;
    }

    createPiece(value) {
        const piece = document.createElement('div');
        piece.className = 'piece';
        
        if (value === 1 || value === 3) {
            piece.classList.add('red');
        } else {
            piece.classList.add('white');
        }
        
        if (value === 3 || value === 4) {
            piece.classList.add('king');
        }
        
        return piece;
    }

    handleCellClick(row, col) {
        if (!this.isMyTurn) {
            this.showToast('Sıra sende değil!');
            return;
        }

        const pieceValue = this.board[row][col];
        const piecePlayer = this.getPiecePlayer(pieceValue);
        
        // Eğer boş bir hücreye tıklandı ve seçili taş varsa
        if (pieceValue === 0 && this.selectedPiece) {
            const validMove = this.validMoves.find(move => 
                move.to.r === row && move.to.c === col
            );
            
            if (validMove) {
                this.makeMove(this.selectedPiece, { r: row, c: col });
            } else {
                this.showToast('Geçersiz hamle!');
            }
        }
        // Eğer kendi taşına tıklandı
        else if (piecePlayer === this.playerColor) {
            this.selectPiece(row, col);
        }
        // Eğer rakip taşına tıklandı
        else {
            this.selectedPiece = null;
            this.validMoves = [];
            this.renderBoard();
        }
    }

    selectPiece(row, col) {
        this.selectedPiece = { r: row, c: col };
        this.validMoves = this.getValidMoves(row, col);
        this.renderBoard();
    }

    getPiecePlayer(value) {
        if (value === 1 || value === 3) return 'red';
        if (value === 2 || value === 4) return 'white';
        return null;
    }

    getValidMoves(row, col) {
        const piece = this.board[row][col];
        const isKing = piece === 3 || piece === 4;
        const moves = [];
        
        // Zıplama hamlelerini kontrol et (zorunlu)
        const jumps = this.getJumps(row, col, isKing);
        if (jumps.length > 0) return jumps;
        
        // Normal hamleler
        const directions = isKing ? 
            [[-1, -1], [-1, 1], [1, -1], [1, 1]] :
            this.playerColor === 'red' ? 
                [[1, -1], [1, 1]] : 
                [[-1, -1], [-1, 1]];
        
        for (const [dr, dc] of directions) {
            const newRow = row + dr;
            const newCol = col + dc;
            
            if (this.isValidCell(newRow, newCol) && this.board[newRow][newCol] === 0) {
                moves.push({ 
                    from: { r: row, c: col }, 
                    to: { r: newRow, c: newCol } 
                });
            }
        }
        
        return moves;
    }

    getJumps(row, col, isKing) {
        const piece = this.board[row][col];
        const jumps = [];
        
        const directions = isKing ? 
            [[-1, -1], [-1, 1], [1, -1], [1, 1]] :
            this.playerColor === 'red' ? 
                [[1, -1], [1, 1]] : 
                [[-1, -1], [-1, 1]];
        
        for (const [dr, dc] of directions) {
            const capturedRow = row + dr;
            const capturedCol = col + dc;
            const landRow = row + 2 * dr;
            const landCol = col + 2 * dc;
            
            if (this.isValidCell(landRow, landCol) && this.board[landRow][landCol] === 0) {
                const capturedPiece = this.board[capturedRow][capturedCol];
                const capturedPlayer = this.getPiecePlayer(capturedPiece);
                
                if (capturedPlayer && capturedPlayer !== this.playerColor) {
                    jumps.push({
                        from: { r: row, c: col },
                        to: { r: landRow, c: landCol },
                        captured: { r: capturedRow, c: capturedCol }
                    });
                }
            }
        }
        
        return jumps;
    }

    isValidCell(row, col) {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }

    makeMove(from, to) {
        this.socket.emit('makeMove', {
            roomCode: this.roomCode,
            from: from,
            to: to
        });
        
        this.selectedPiece = null;
        this.validMoves = [];
    }

    returnToMenu() {
        this.roomCode = null;
        this.playerColor = null;
        this.board = [];
        this.selectedPiece = null;
        this.validMoves = [];
        this.currentTurn = null;
        this.isMyTurn = false;
        this.showScreen('menuScreen');
    }
}

// Global fonksiyonlar
let game;

function findMatch() {
    if (!game) game = new CheckersGame();
    game.showScreen('searchScreen');
    game.socket.emit('findMatch');
}

function cancelSearch() {
    if (game) game.socket.emit('cancelSearch');
}

function createRoom() {
    if (!game) game = new CheckersGame();
    game.socket.emit('createRoom', {});
}

function joinRoom() {
    const roomCode = document.getElementById('roomCodeInput').value.trim();
    if (!roomCode) {
        alert('Lütfen oda kodunu girin!');
        return;
    }
    
    if (!game) game = new CheckersGame();
    game.socket.emit('joinRoom', { roomCode });
}

function leaveGame() {
    if (game && game.roomCode) {
        game.socket.emit('leaveGame', { roomCode: game.roomCode });
    }
}

// Sayfa yüklendiğinde oyunu başlat
document.addEventListener('DOMContentLoaded', () => {
    game = new CheckersGame();
});

// CSS animasyonları ekle
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);
