// WebSocket bağlantısı
const socket = io('https://mario-io-1.onrender.com');

// Oyun durumu
let gameState = {
    board: [],
    currentPlayer: 'white',
    selectedPiece: null,
    playerColor: null,
    roomCode: null,
    gameStarted: false
};

// Socket bağlantı durumu
socket.on('connect', () => {
    document.getElementById('connectionStatus').className = 'connection-status connected';
    document.getElementById('connectionStatus').textContent = '✅ Sunucuya bağlandı';
});

socket.on('disconnect', () => {
    document.getElementById('connectionStatus').className = 'connection-status disconnected';
    document.getElementById('connectionStatus').textContent = '❌ Sunucu bağlantısı kesildi';
});

// Tahta başlatma
function initBoard() {
    const board = [];
    for (let row = 0; row < 8; row++) {
        board[row] = [];
        for (let col = 0; col < 8; col++) {
            if ((row + col) % 2 === 1) {
                if (row < 3) {
                    board[row][col] = { color: 'black', king: false };
                } else if (row > 4) {
                    board[row][col] = { color: 'white', king: false };
                } else {
                    board[row][col] = null;
                }
            } else {
                board[row][col] = null;
            }
        }
    }
    return board;
}

// Tahtayı render et
function renderBoard() {
    const boardElement = document.getElementById('board');
    boardElement.innerHTML = '';
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.className = 'square ' + ((row + col) % 2 === 0 ? 'light' : 'dark');
            square.dataset.row = row;
            square.dataset.col = col;
            
            const piece = gameState.board[row][col];
            if (piece) {
                const pieceElement = document.createElement('div');
                pieceElement.className = 'piece ' + piece.color;
                if (piece.king) {
                    pieceElement.classList.add('king');
                }
                square.appendChild(pieceElement);
            }
            
            square.addEventListener('click', () => handleSquareClick(row, col));
            boardElement.appendChild(square);
        }
    }
    
    updatePlayerHighlight();
}

// Kare tıklama işlemi
function handleSquareClick(row, col) {
    if (!gameState.gameStarted || gameState.currentPlayer !== gameState.playerColor) {
        return;
    }
    
    const piece = gameState.board[row][col];
    
    // Taş seçme
    if (piece && piece.color === gameState.playerColor) {
        selectPiece(row, col);
    }
    // Hamle yapma
    else if (gameState.selectedPiece) {
        const validMoves = getValidMoves(gameState.selectedPiece.row, gameState.selectedPiece.col);
        const move = validMoves.find(m => m.row === row && m.col === col);
        
        if (move) {
            makeMove(gameState.selectedPiece.row, gameState.selectedPiece.col, row, col, move.capture);
        }
    }
}

// Taş seçme
function selectPiece(row, col) {
    gameState.selectedPiece = { row, col };
    renderBoard();
    
    // Seçili kareyi vurgula
    const squares = document.querySelectorAll('.square');
    squares.forEach(square => {
        if (parseInt(square.dataset.row) === row && parseInt(square.dataset.col) === col) {
            square.classList.add('selected');
        }
    });
    
    // Geçerli hamleleri göster
    const validMoves = getValidMoves(row, col);
    validMoves.forEach(move => {
        squares.forEach(square => {
            if (parseInt(square.dataset.row) === move.row && parseInt(square.dataset.col) === move.col) {
                square.classList.add('valid-move');
            }
        });
    });
}

// Geçerli hamleleri bul
function getValidMoves(row, col) {
    const moves = [];
    const piece = gameState.board[row][col];
    if (!piece) return moves;
    
    const directions = piece.king ? 
        [[-1, -1], [-1, 1], [1, -1], [1, 1]] : 
        piece.color === 'white' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
    
    // Normal hamleler
    directions.forEach(([dRow, dCol]) => {
        const newRow = row + dRow;
        const newCol = col + dCol;
        
        if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
            if (!gameState.board[newRow][newCol]) {
                moves.push({ row: newRow, col: newCol, capture: null });
            }
            // Yeme hamlesi
            else if (gameState.board[newRow][newCol].color !== piece.color) {
                const jumpRow = newRow + dRow;
                const jumpCol = newCol + dCol;
                
                if (jumpRow >= 0 && jumpRow < 8 && jumpCol >= 0 && jumpCol < 8) {
                    if (!gameState.board[jumpRow][jumpCol]) {
                        moves.push({ 
                            row: jumpRow, 
                            col: jumpCol, 
                            capture: { row: newRow, col: newCol }
                        });
                    }
                }
            }
        }
    });
    
    return moves;
}

// Hamle yap
function makeMove(fromRow, fromCol, toRow, toCol, capture) {
    const piece = gameState.board[fromRow][fromCol];
    
    // Taşı taşı
    gameState.board[toRow][toCol] = piece;
    gameState.board[fromRow][fromCol] = null;
    
    // Yeme varsa taşı kaldır
    if (capture) {
        gameState.board[capture.row][capture.col] = null;
    }
    
    // Dama yap
    if ((piece.color === 'white' && toRow === 0) || (piece.color === 'black' && toRow === 7)) {
        piece.king = true;
    }
    
    // Hamleyi sunucuya gönder
    socket.emit('makeMove', {
        roomCode: gameState.roomCode,
        from: { row: fromRow, col: fromCol },
        to: { row: toRow, col: toCol },
        board: gameState.board,
        capture: capture
    });
    
    gameState.selectedPiece = null;
    gameState.currentPlayer = gameState.currentPlayer === 'white' ? 'black' : 'white';
    renderBoard();
}

// Oyuncu vurgusunu güncelle
function updatePlayerHighlight() {
    const player1Info = document.getElementById('player1Info');
    const player2Info = document.getElementById('player2Info');
    
    player1Info.classList.remove('active');
    player2Info.classList.remove('active');
    
    if (gameState.currentPlayer === 'white') {
        player1Info.classList.add('active');
    } else {
        player2Info.classList.add('active');
    }
}

// Dereceli oyun başlat
function startRankedGame() {
    socket.emit('findMatch');
    document.getElementById('rankedModal').style.display = 'block';
}

// Arama iptal
function cancelSearch() {
    socket.emit('cancelSearch');
    document.getElementById('rankedModal').style.display = 'none';
}

// Özel oda oluştur
function createPrivateRoom() {
    socket.emit('createRoom');
}

// Özel oda modalını kapat
function closePrivateModal() {
    socket.emit('leaveRoom', gameState.roomCode);
    document.getElementById('privateModal').style.display = 'none';
}

// Oda kodunu kopyala
function copyRoomCode() {
    const roomCode = document.getElementById('roomCode').textContent;
    navigator.clipboard.writeText(roomCode).then(() => {
        alert('Oda kodu kopyalandı: ' + roomCode);
    });
}

// Katılma modalını göster
function showJoinModal() {
    document.getElementById('joinModal').style.display = 'block';
}

// Katılma modalını kapat
function closeJoinModal() {
    document.getElementById('joinModal').style.display = 'none';
    document.getElementById('joinRoomCode').value = '';
}

// Odaya katıl
function joinRoom() {
    const roomCode = document.getElementById('joinRoomCode').value.trim();
    if (roomCode.length === 4) {
        socket.emit('joinRoom', roomCode);
    } else {
        alert('Lütfen 4 haneli oda kodunu girin!');
    }
}

// Oyundan çık
function leaveGame() {
    if (confirm('Oyundan çıkmak istediğinize emin misiniz?')) {
        socket.emit('leaveGame', gameState.roomCode);
        gameState = {
            board: [],
            currentPlayer: 'white',
            selectedPiece: null,
            playerColor: null,
            roomCode: null,
            gameStarted: false
        };
        document.getElementById('game').style.display = 'none';
        document.getElementById('lobby').style.display = 'block';
    }
}

// Socket olayları
socket.on('roomCreated', (data) => {
    gameState.roomCode = data.roomCode;
    document.getElementById('roomCode').textContent = data.roomCode;
    document.getElementById('privateModal').style.display = 'block';
});

socket.on('matchFound', (data) => {
    document.getElementById('rankedModal').style.display = 'none';
    startGame(data);
});

socket.on('roomJoined', (data) => {
    document.getElementById('joinModal').style.display = 'none';
    document.getElementById('privateModal').style.display = 'none';
    startGame(data);
});

socket.on('gameStart', (data) => {
    gameState.board = data.board;
    gameState.currentPlayer = data.currentPlayer;
    gameState.playerColor = data.playerColor;
    gameState.gameStarted = true;
    renderBoard();
});

socket.on('moveMade', (data) => {
    gameState.board = data.board;
    gameState.currentPlayer = data.currentPlayer;
    renderBoard();
});

socket.on('gameOver', (data) => {
    alert(`Oyun Bitti! Kazanan: ${data.winner === gameState.playerColor ? 'SİZ' : 'Rakip'}`);
    leaveGame();
});

socket.on('opponentLeft', () => {
    alert('Rakibiniz oyundan ayrıldı!');
    leaveGame();
});

socket.on('error', (data) => {
    alert('Hata: ' + data.message);
});

// Oyunu başlat
function startGame(data) {
    gameState.roomCode = data.roomCode;
    gameState.playerColor = data.playerColor;
    gameState.board = initBoard();
    gameState.currentPlayer = 'white';
    gameState.gameStarted = true;
    
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game').style.display = 'block';
    
    // Oyuncu bilgilerini güncelle
    if (gameState.playerColor === 'white') {
        document.getElementById('player1Info').querySelector('.player-name').textContent = 'Sen';
        document.getElementById('player2Info').querySelector('.player-name').textContent = 'Rakip';
    } else {
        document.getElementById('player1Info').querySelector('.player-name').textContent = 'Rakip';
        document.getElementById('player2Info').querySelector('.player-name').textContent = 'Sen';
    }
    
    renderBoard();
    
    // İlk oyun durumunu sunucuya gönder
    socket.emit('gameReady', {
        roomCode: gameState.roomCode,
        board: gameState.board
    });
}
