// Telegram Web App ve Kullanıcı Bilgisi
let telegramUser = null;
let userId = null;
let userName = null;

// Telegram WebApp kontrolü
if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        telegramUser = tg.initDataUnsafe.user;
        userId = `TG_${telegramUser.id}`;
        userName = telegramUser.first_name + (telegramUser.last_name ? ' ' + telegramUser.last_name : '');
        
        const avatarEmojis = ['😎', '🎮', '🎯', '🚀', '⚡', '🔥', '💎', '👑'];
        const avatarIndex = telegramUser.id % avatarEmojis.length;
        document.getElementById('userAvatar').textContent = avatarEmojis[avatarIndex];
    }
}

// Telegram değilse Guest kullanıcı oluştur
if (!userId) {
    const guestId = Math.floor(10000 + Math.random() * 90000);
    userId = `GUEST_${guestId}`;
    userName = `Guest ${guestId}`;
    document.getElementById('userAvatar').textContent = '👤';
}

// Kullanıcı bilgilerini göster
document.getElementById('userName').textContent = userName;
document.getElementById('userId').textContent = `ID: ${userId}`;

// WebSocket bağlantısı
const socket = io('https://mario-io-1.onrender.com', {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
    timeout: 20000
});

// Oyun durumu
let gameState = {
    board: [],
    currentPlayer: 'white',
    selectedPiece: null,
    playerColor: null,
    roomCode: null,
    gameStarted: false,
    opponentName: 'Rakip',
    mustCapture: false,
    timer: 20,
    timerInterval: null,
    afkCount: 0
};

// Timer elementini ekle
let timerElement = null;

// Bağlantı durumu yönetimi
let connectionTimeout;

socket.on('connect', () => {
    clearTimeout(connectionTimeout);
    document.getElementById('connectionStatus').className = 'connection-status connected';
    document.getElementById('connectionStatus').innerHTML = '<div class="status-dot"></div><span>✅ Sunucuya bağlandı</span>';
    
    // Butonları aktif et
    document.getElementById('rankedBtn').disabled = false;
    document.getElementById('friendBtn').disabled = false;
    document.getElementById('joinBtn').disabled = false;
    
    socket.emit('registerUser', { userId, userName });
});

socket.on('disconnect', () => {
    document.getElementById('connectionStatus').className = 'connection-status disconnected';
    document.getElementById('connectionStatus').innerHTML = '<div class="status-dot"></div><span>❌ Bağlantı kesildi</span>';
    
    // Butonları devre dışı bırak
    document.getElementById('rankedBtn').disabled = true;
    document.getElementById('friendBtn').disabled = true;
    document.getElementById('joinBtn').disabled = true;
});

socket.on('connect_error', (error) => {
    console.error('Bağlantı hatası:', error);
});

// Tahta başlatma - Amerikan Daması
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

// Timer başlat
function startTimer() {
    stopTimer();
    gameState.timer = 20;
    updateTimerDisplay();
    
    gameState.timerInterval = setInterval(() => {
        gameState.timer--;
        updateTimerDisplay();
        
        if (gameState.timer <= 0) {
            handleTimeout();
        }
    }, 1000);
}

// Timer durdur
function stopTimer() {
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }
}

// Timer gösterimini güncelle
function updateTimerDisplay() {
    if (!timerElement) {
        timerElement = document.getElementById('turnIndicator');
    }
    
    const color = gameState.currentPlayer === 'white' ? '⚪' : '⚫';
    const playerText = gameState.currentPlayer === 'white' ? 'Beyaz' : 'Siyah';
    timerElement.textContent = `${color} Sıra: ${playerText} - ⏰ ${gameState.timer}s`;
    
    if (gameState.timer <= 5) {
        timerElement.style.color = '#dc3545';
        timerElement.style.animation = 'pulse 0.5s ease-in-out infinite';
    } else {
        timerElement.style.color = '#667eea';
        timerElement.style.animation = 'none';
    }
}

// Süre dolduğunda
function handleTimeout() {
    stopTimer();
    gameState.afkCount++;
    
    if (gameState.afkCount >= 2) {
        alert('⚠️ 2 kez süre aşımı! Oyun sonlandırılıyor...');
        socket.emit('gameAbandoned', { roomCode: gameState.roomCode, userId });
        resetGame();
        return;
    }
    
    // Otomatik hamle yap
    const moves = getAllPossibleMoves(gameState.currentPlayer);
    
    if (moves.length > 0) {
        // Yeme hamlesi varsa öncelik ver
        const captureMoves = moves.filter(m => m.capture);
        const moveToMake = captureMoves.length > 0 ? 
            captureMoves[Math.floor(Math.random() * captureMoves.length)] :
            moves[Math.floor(Math.random() * moves.length)];
        
        makeMove(moveToMake.fromRow, moveToMake.fromCol, moveToMake.toRow, moveToMake.toCol, moveToMake.capture);
    }
}

// Tüm olası hamleleri bul
function getAllPossibleMoves(color) {
    const moves = [];
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = gameState.board[row][col];
            if (piece && piece.color === color) {
                const pieceMoves = getValidMoves(row, col);
                pieceMoves.forEach(move => {
                    moves.push({
                        fromRow: row,
                        fromCol: col,
                        toRow: move.row,
                        toCol: move.col,
                        capture: move.capture
                    });
                });
            }
        }
    }
    
    return moves;
}

// Tahtayı render et
function renderBoard() {
    const boardElement = document.getElementById('board');
    boardElement.innerHTML = '';
    
    // Mecburi yeme kontrolü
    const allMoves = getAllPossibleMoves(gameState.playerColor);
    const captureMoves = allMoves.filter(m => m.capture);
    gameState.mustCapture = captureMoves.length > 0;
    
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
                
                // Oynanabilir taşları vurgula
                if (piece.color === gameState.playerColor && gameState.currentPlayer === gameState.playerColor) {
                    const moves = getValidMoves(row, col);
                    if (moves.length > 0) {
                        // Mecburi yeme varsa, sadece yeme yapabilecek taşları vurgula
                        if (gameState.mustCapture) {
                            const hasCapture = moves.some(m => m.capture);
                            if (hasCapture) {
                                square.style.boxShadow = '0 0 15px 3px rgba(255, 215, 0, 0.8)';
                                square.style.animation = 'glow 1s ease-in-out infinite';
                            }
                        } else {
                            square.style.boxShadow = '0 0 10px 2px rgba(102, 126, 234, 0.6)';
                        }
                    }
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
    
    if (piece && piece.color === gameState.playerColor) {
        const moves = getValidMoves(row, col);
        
        // Mecburi yeme varsa, sadece yeme yapabilecek taşları seç
        if (gameState.mustCapture) {
            const hasCapture = moves.some(m => m.capture);
            if (!hasCapture) {
                return; // Bu taş yeme yapamıyor, seçilemesin
            }
        }
        
        if (moves.length > 0) {
            selectPiece(row, col);
        }
    } else if (gameState.selectedPiece) {
        const validMoves = getValidMoves(gameState.selectedPiece.row, gameState.selectedPiece.col);
        const move = validMoves.find(m => m.row === row && m.col === col);
        
        if (move) {
            makeMove(gameState.selectedPiece.row, gameState.selectedPiece.col, row, col, move.capture);
            gameState.afkCount = 0; // Hamle yapıldı, AFK sayacını sıfırla
        }
    }
}

// Taş seçme
function selectPiece(row, col) {
    gameState.selectedPiece = { row, col };
    renderBoard();
    
    const squares = document.querySelectorAll('.square');
    squares.forEach(square => {
        if (parseInt(square.dataset.row) === row && parseInt(square.dataset.col) === col) {
            square.classList.add('selected');
        }
    });
    
    const validMoves = getValidMoves(row, col);
    
    // Mecburi yeme varsa sadece yeme hamlelerini göster
    const movesToShow = gameState.mustCapture ? 
        validMoves.filter(m => m.capture) : validMoves;
    
    movesToShow.forEach(move => {
        squares.forEach(square => {
            if (parseInt(square.dataset.row) === move.row && parseInt(square.dataset.col) === move.col) {
                square.classList.add('valid-move');
            }
        });
    });
}

// Geçerli hamleleri bul - Amerikan Daması kuralları
function getValidMoves(row, col) {
    const moves = [];
    const piece = gameState.board[row][col];
    if (!piece) return moves;
    
    // Kral için 4 yön, normal taş için 2 yön
    const directions = piece.king ? 
        [[-1, -1], [-1, 1], [1, -1], [1, 1]] : 
        piece.color === 'white' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
    
    // Önce yeme hamlelerini kontrol et
    const captureMoves = [];
    directions.forEach(([dRow, dCol]) => {
        const enemyRow = row + dRow;
        const enemyCol = col + dCol;
        
        if (enemyRow >= 0 && enemyRow < 8 && enemyCol >= 0 && enemyCol < 8) {
            const enemyPiece = gameState.board[enemyRow][enemyCol];
            
            if (enemyPiece && enemyPiece.color !== piece.color) {
                const jumpRow = enemyRow + dRow;
                const jumpCol = enemyCol + dCol;
                
                if (jumpRow >= 0 && jumpRow < 8 && jumpCol >= 0 && jumpCol < 8) {
                    if (!gameState.board[jumpRow][jumpCol]) {
                        captureMoves.push({ 
                            row: jumpRow, 
                            col: jumpCol, 
                            capture: { row: enemyRow, col: enemyCol }
                        });
                    }
                }
            }
        }
    });
    
    // Yeme hamlesi varsa sadece onları döndür (mecburi yeme)
    if (captureMoves.length > 0) {
        return captureMoves;
    }
    
    // Yeme yoksa normal hamleleri ekle
    directions.forEach(([dRow, dCol]) => {
        const newRow = row + dRow;
        const newCol = col + dCol;
        
        if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
            if (!gameState.board[newRow][newCol]) {
                moves.push({ row: newRow, col: newCol, capture: null });
            }
        }
    });
    
    return moves;
}

// Hamle yap
function makeMove(fromRow, fromCol, toRow, toCol, capture) {
    const piece = gameState.board[fromRow][fromCol];
    
    gameState.board[toRow][toCol] = piece;
    gameState.board[fromRow][fromCol] = null;
    
    if (capture) {
        gameState.board[capture.row][capture.col] = null;
    }
    
    // Kral yapma - karşı tarafa ulaşınca
    if (!piece.king) {
        if ((piece.color === 'white' && toRow === 0) || (piece.color === 'black' && toRow === 7)) {
            piece.king = true;
        }
    }
    
    socket.emit('makeMove', {
        roomCode: gameState.roomCode,
        from: { row: fromRow, col: fromCol },
        to: { row: toRow, col: toCol },
        board: gameState.board,
        capture: capture,
        userId: userId
    });
    
    gameState.selectedPiece = null;
    gameState.currentPlayer = gameState.currentPlayer === 'white' ? 'black' : 'white';
    
    stopTimer();
    renderBoard();
}

// Oyuncu vurgusunu güncelle
function updatePlayerHighlight() {
    const player1Card = document.getElementById('player1Card');
    const player2Card = document.getElementById('player2Card');
    
    player1Card.classList.remove('active');
    player2Card.classList.remove('active');
    
    if (gameState.currentPlayer === 'white') {
        player1Card.classList.add('active');
    } else {
        player2Card.classList.add('active');
    }
}

// Dereceli oyun başlat
function startRankedGame() {
    socket.emit('findMatch', { userId, userName });
    document.getElementById('rankedModal').style.display = 'block';
}

// Arama iptal
function cancelSearch() {
    socket.emit('cancelSearch', { userId });
    document.getElementById('rankedModal').style.display = 'none';
}

// Özel oda oluştur
function createPrivateRoom() {
    socket.emit('createRoom', { userId, userName });
}

// Özel oda modalını kapat
function closePrivateModal() {
    if (gameState.roomCode) {
        socket.emit('leaveRoom', { roomCode: gameState.roomCode, userId });
    }
    document.getElementById('privateModal').style.display = 'none';
}

// Oda kodunu kopyala
function copyRoomCode() {
    const roomCode = document.getElementById('roomCode').textContent;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(roomCode).then(() => {
            alert('✅ Oda kodu kopyalandı: ' + roomCode);
        });
    } else {
        const tempInput = document.createElement('input');
        tempInput.value = roomCode;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        alert('✅ Oda kodu kopyalandı: ' + roomCode);
    }
}

// Katılma modalını göster
function showJoinModal() {
    document.getElementById('joinModal').style.display = 'block';
    setTimeout(() => {
        document.getElementById('joinRoomCode').focus();
    }, 100);
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
        socket.emit('joinRoom', { roomCode, userId, userName });
    } else {
        alert('⚠️ Lütfen 4 haneli oda kodunu girin!');
    }
}

// Oyundan çık
function leaveGame() {
    if (confirm('❓ Oyundan çıkmak istediğinize emin misiniz?')) {
        socket.emit('leaveGame', { roomCode: gameState.roomCode, userId });
        resetGame();
    }
}

// Oyunu sıfırla
function resetGame() {
    stopTimer();
    gameState = {
        board: [],
        currentPlayer: 'white',
        selectedPiece: null,
        playerColor: null,
        roomCode: null,
        gameStarted: false,
        opponentName: 'Rakip',
        mustCapture: false,
        timer: 20,
        timerInterval: null,
        afkCount: 0
    };
    document.getElementById('game').style.display = 'none';
    document.getElementById('lobby').style.display = 'block';
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
    
    if (data.opponentName) {
        gameState.opponentName = data.opponentName;
    }
    
    updatePlayerNames();
    renderBoard();
    
    // Sıra kendisindeyse timer başlat
    if (gameState.currentPlayer === gameState.playerColor) {
        startTimer();
    }
});

socket.on('moveMade', (data) => {
    gameState.board = data.board;
    gameState.currentPlayer = data.currentPlayer;
    renderBoard();
    
    // Sıra kendisindeyse timer başlat
    if (gameState.currentPlayer === gameState.playerColor) {
        startTimer();
    } else {
        stopTimer();
    }
});

socket.on('gameOver', (data) => {
    stopTimer();
    setTimeout(() => {
        const winnerText = data.winner === gameState.playerColor ? 
            '🎉 TEBRİKLER! KAZANDINIZ! 🎉' : 
            '😔 Maalesef kaybettiniz!';
        alert(winnerText);
        resetGame();
    }, 500);
});

socket.on('opponentLeft', () => {
    stopTimer();
    alert('⚠️ Rakibiniz oyundan ayrıldı!');
    resetGame();
});

socket.on('gameAbandoned', () => {
    stopTimer();
    alert('⚠️ Oyun 2 kez süre aşımı nedeniyle sonlandırıldı!');
    resetGame();
});

socket.on('error', (data) => {
    alert('❌ Hata: ' + data.message);
});

// Oyunu başlat
function startGame(data) {
    gameState.roomCode = data.roomCode;
    gameState.playerColor = data.playerColor;
    gameState.board = initBoard();
    gameState.currentPlayer = 'white';
    gameState.gameStarted = true;
    gameState.opponentName = data.opponentName || 'Rakip';
    gameState.afkCount = 0;
    
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game').style.display = 'block';
    
    updatePlayerNames();
    renderBoard();
    
    socket.emit('gameReady', {
        roomCode: gameState.roomCode,
        board: gameState.board,
        userId: userId
    });
    
    // Beyaz başlar, sıra kendisindeyse timer başlat
    if (gameState.playerColor === 'white') {
        startTimer();
    }
}

// Oyuncu isimlerini güncelle
function updatePlayerNames() {
    const player1Name = document.getElementById('player1Name');
    const player2Name = document.getElementById('player2Name');
    
    if (gameState.playerColor === 'white') {
        player1Name.textContent = userName;
        player2Name.textContent = gameState.opponentName;
    } else {
        player1Name.textContent = gameState.opponentName;
        player2Name.textContent = userName;
    }
}
