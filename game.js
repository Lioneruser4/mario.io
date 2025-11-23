// Telegram Web App ve Kullanıcı Bilgisi
let telegramUser = null;
let userId = null;
let userName = null;

// Kullanıcı istatistikleri
let userStats = {
    elo: 0,
    level: 1,
    levelIcon: 'bronze',
    wins: 0,
    losses: 0
};

// Telegram WebApp kontrolü
let userPhotoUrl = null;

if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    
    // Bildirim ayarları - site linki/ismi olmasın
    tg.setHeaderColor('#667eea');
    tg.setBackgroundColor('#1e3c72');
    
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        telegramUser = tg.initDataUnsafe.user;
        userId = `TG_${telegramUser.id}`;
        userName = telegramUser.first_name + (telegramUser.last_name ? ' ' + telegramUser.last_name : '');
        
        // Telegram fotoğrafını al (varsa)
        if (telegramUser.photo_url) {
            userPhotoUrl = telegramUser.photo_url;
            const avatarEl = document.getElementById('userAvatar');
            avatarEl.innerHTML = '';
            const img = document.createElement('img');
            img.src = userPhotoUrl;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.borderRadius = '50%';
            img.style.objectFit = 'cover';
            avatarEl.appendChild(img);
        } else {
            // Fotoğraf yoksa emoji kullan
            const avatarEmojis = ['😎', '🎮', '🎯', '🚀', '⚡', '🔥', '💎', '👑'];
            const avatarIndex = telegramUser.id % avatarEmojis.length;
            document.getElementById('userAvatar').textContent = avatarEmojis[avatarIndex];
        }
    }
}

// Telegram değilse Guest kullanıcı oluştur
if (!userId) {
    const guestId = Math.floor(10000 + Math.random() * 90000);
    userId = `GUEST_${guestId}`;
    userName = `Guest ${guestId}`;
    document.getElementById('userAvatar').textContent = '👤';
}

// Kullanıcı bilgilerini göster (ID gizli)
document.getElementById('userName').textContent = userName;
document.getElementById('userId').style.display = 'none'; // ID'yi gizle

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
    opponentPhotoUrl: null,
    mustCapture: false,
    timer: 20,
    timerInterval: null,
    afkCount: 0,
    canContinueCapture: false, // Çoklu yeme durumu
    capturingPiece: null // Çoklu yeme yapan taş
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
    
    socket.emit('registerUser', { 
        userId, 
        userName,
        userLevel: userStats.level,
        userElo: userStats.elo
    });
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

// Timer başlat (artık sunucu yönetiyor, bu fonksiyon kullanılmıyor)
function startTimer() {
    // Sunucu timer'ı yönetiyor, client sadece gösteriyor
}

// Timer durdur
function stopTimer() {
    // Sunucu timer'ı yönetiyor, client sadece gösteriyor
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
    gameState.afkCount++;
    
    if (gameState.afkCount >= 2) {
        // Alert yerine custom notification kullan
        showCustomNotification('⚠️ 2 kez süre aşımı! Oyun sonlandırılıyor...');
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
    
    // Mecburi yeme kontrolü (çoklu yeme sırasında değilse)
    if (!gameState.canContinueCapture) {
        const allMoves = getAllPossibleMoves(gameState.playerColor);
        const captureMoves = allMoves.filter(m => m.capture);
        gameState.mustCapture = captureMoves.length > 0;
    }
    
    // Siyah oyuncu için tahtayı ters çevir (kendini en altta görsün)
    // Sadece satırları ters çevir, sütunları değil
    const isFlipped = gameState.playerColor === 'black';
    
    for (let displayRow = 0; displayRow < 8; displayRow++) {
        for (let displayCol = 0; displayCol < 8; displayCol++) {
            // Görüntüleme koordinatlarından gerçek koordinatlara çevir
            // Sadece satırları ters çevir
            const realRow = isFlipped ? 7 - displayRow : displayRow;
            const realCol = isFlipped ? 7 - displayCol : displayCol; // Sütunları da ters çevir (yüz yüze)
            
            const square = document.createElement('div');
            square.className = 'square ' + ((realRow + realCol) % 2 === 0 ? 'light' : 'dark');
            square.dataset.row = realRow;
            square.dataset.col = realCol;
            
            const piece = gameState.board[realRow][realCol];
            if (piece) {
                const pieceElement = document.createElement('div');
                pieceElement.className = 'piece ' + piece.color;
                if (piece.king) {
                    pieceElement.classList.add('king');
                }
                
                // Oynanabilir taşları vurgula
                if (piece.color === gameState.playerColor && gameState.currentPlayer === gameState.playerColor) {
                    const moves = getValidMoves(realRow, realCol);
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
            
            square.addEventListener('click', () => handleSquareClick(realRow, realCol));
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
    
    // Çoklu yeme sırasında sadece aynı taş seçilebilir
    if (gameState.canContinueCapture && gameState.capturingPiece) {
        if (row !== gameState.capturingPiece.row || col !== gameState.capturingPiece.col) {
            // Çoklu yeme sırasında başka taş seçilemez
            return;
        }
    }
    
    const piece = gameState.board[row][col];
    
    if (piece && piece.color === gameState.playerColor) {
        // Çoklu yeme sırasında başka taş seçilemez
        if (gameState.canContinueCapture) {
            return;
        }
        
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
    
    // Çoklu yeme durumunda seçenek sun
    if (gameState.canContinueCapture && gameState.capturingPiece && 
        row === gameState.capturingPiece.row && col === gameState.capturingPiece.col) {
        showContinueCaptureOptions(row, col);
    }
}

// Çoklu yeme seçeneklerini göster
function showContinueCaptureOptions(row, col) {
    // Önceki butonları kaldır
    const existingContinueBtn = document.getElementById('continueCaptureBtn');
    const existingFinishBtn = document.getElementById('finishCaptureBtn');
    if (existingContinueBtn) existingContinueBtn.remove();
    if (existingFinishBtn) existingFinishBtn.remove();
    
    // Oyun tahtasında bir buton veya seçenek göster
    const boardElement = document.getElementById('board');
    
    // Devam et butonu - başka taş seçmeye izin ver
    const continueBtn = document.createElement('div');
    continueBtn.id = 'continueCaptureBtn';
    continueBtn.style.cssText = `
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(34, 197, 94, 0.9);
        color: white;
        padding: 12px 20px;
        border-radius: 10px;
        font-weight: 700;
        cursor: pointer;
        z-index: 100;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        backdrop-filter: blur(10px);
        border: 2px solid white;
    `;
    continueBtn.textContent = '⏭️ Devam Et (Başka taş seç)';
    continueBtn.onclick = () => {
        // Çoklu yeme durumunu bitir ve diğer taşları seçmeye izin ver
        gameState.canContinueCapture = false;
        gameState.capturingPiece = null;
        gameState.selectedPiece = null;
        renderBoard();
        continueBtn.remove();
        if (finishBtn) finishBtn.remove();
    };
    
    // Bitir butonu - aynı taşla devam et
    const finishBtn = document.createElement('div');
    finishBtn.id = 'finishCaptureBtn';
    finishBtn.style.cssText = `
        position: absolute;
        bottom: 70px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(239, 68, 68, 0.9);
        color: white;
        padding: 12px 20px;
        border-radius: 10px;
        font-weight: 700;
        cursor: pointer;
        z-index: 100;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        backdrop-filter: blur(10px);
        border: 2px solid white;
    `;
    finishBtn.textContent = '🏁 Bitir (Aynı taşla devam et)';
    finishBtn.onclick = () => {
        // Aynı taşla devam et - butonları kaldır
        continueBtn.remove();
        finishBtn.remove();
    };
    
    // Butonları ekle
    boardElement.parentElement.style.position = 'relative';
    boardElement.parentElement.appendChild(continueBtn);
    boardElement.parentElement.appendChild(finishBtn);
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
    
    // Optimistik update - hemen render et
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
    
    // Hemen render et (gecikme olmasın)
    renderBoard();
    
    // Çoklu yeme kontrolü - aynı taş tekrar yeme yapabilir mi?
    let canContinueCapture = false;
    if (capture) {
        const nextMoves = getValidMoves(toRow, toCol);
        const nextCaptures = nextMoves.filter(m => m.capture);
        canContinueCapture = nextCaptures.length > 0;
    }
    
    // Önceki butonları kaldır
    const existingContinueBtn = document.getElementById('continueCaptureBtn');
    const existingFinishBtn = document.getElementById('finishCaptureBtn');
    if (existingContinueBtn) existingContinueBtn.remove();
    if (existingFinishBtn) existingFinishBtn.remove();
    
    if (canContinueCapture) {
        // Çoklu yeme devam ediyor - aynı taş seçili kalır, sıra değişmez
        gameState.canContinueCapture = true;
        gameState.capturingPiece = { row: toRow, col: toCol };
        gameState.selectedPiece = { row: toRow, col: toCol };
        
        socket.emit('makeMove', {
            roomCode: gameState.roomCode,
            from: { row: fromRow, col: fromCol },
            to: { row: toRow, col: toCol },
            board: gameState.board,
            capture: capture,
            userId: userId,
            continueCapture: true
        });
    } else {
        // Normal hamle veya çoklu yeme bitti
        gameState.canContinueCapture = false;
        gameState.capturingPiece = null;
        gameState.selectedPiece = null;
        gameState.currentPlayer = gameState.currentPlayer === 'white' ? 'black' : 'white';
        
        socket.emit('makeMove', {
            roomCode: gameState.roomCode,
            from: { row: fromRow, col: fromCol },
            to: { row: toRow, col: toCol },
            board: gameState.board,
            capture: capture,
            userId: userId
        });
    }
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

// Eşleşme timer'ı
let searchTimer = 0;
let searchTimerInterval = null;

// Dereceli oyun başlat
function startRankedGame() {
    socket.emit('findMatch', { 
        userId, 
        userName, 
        userPhotoUrl: userPhotoUrl || null,
        userLevel: userStats.level,
        userElo: userStats.elo
    });
    document.getElementById('rankedModal').style.display = 'block';
    
    // Timer sunucudan gelecek
    searchTimer = 0;
    updateSearchTimer();
}

// Eşleşme timer'ını güncelle
function updateSearchTimer() {
    const timerEl = document.getElementById('searchTimer');
    if (timerEl) {
        const minutes = Math.floor(searchTimer / 60);
        const seconds = searchTimer % 60;
        timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Arama iptal
function cancelSearch() {
    socket.emit('cancelSearch', { userId });
    document.getElementById('rankedModal').style.display = 'none';
    if (searchTimerInterval) {
        clearInterval(searchTimerInterval);
        searchTimerInterval = null;
    }
}

// Sunucudan eşleşme timer güncellemesi
socket.on('searchTimerUpdate', (data) => {
    searchTimer = data.timeElapsed;
    updateSearchTimer();
});

// Özel oda oluştur
function createPrivateRoom() {
    socket.emit('createRoom', { userId, userName, userPhotoUrl: userPhotoUrl || null });
    // Bekleyen lobiye geç
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('waitingLobby').style.display = 'block';
    
    // Kullanıcı bilgilerini kopyala
    document.getElementById('waitingUserName').textContent = userName;
    const avatarEl = document.getElementById('waitingUserAvatar');
    avatarEl.innerHTML = '';
    if (userPhotoUrl) {
        const img = document.createElement('img');
        img.src = userPhotoUrl;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '50%';
        img.style.objectFit = 'cover';
        avatarEl.appendChild(img);
    } else {
        avatarEl.textContent = userName.charAt(0).toUpperCase();
    }
}

// Bekleyen oda kodunu kopyala
function copyWaitingRoomCode() {
    const roomCode = document.getElementById('waitingRoomCode').textContent;
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

// Bekleyen odayı iptal et
function cancelWaitingRoom() {
    if (gameState.roomCode) {
        socket.emit('leaveRoom', { roomCode: gameState.roomCode, userId });
    }
    document.getElementById('waitingLobby').style.display = 'none';
    document.getElementById('lobby').style.display = 'block';
    gameState.roomCode = null;
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
        socket.emit('joinRoom', { roomCode, userId, userName, userPhotoUrl: userPhotoUrl || null });
    } else {
        alert('⚠️ Lütfen 4 haneli oda kodunu girin!');
    }
}

// Enter tuşu ile odaya katılma
document.addEventListener('DOMContentLoaded', () => {
    const joinRoomInput = document.getElementById('joinRoomCode');
    if (joinRoomInput) {
        joinRoomInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinRoom();
            }
        });
    }
    
    // Modal dışına tıklayınca kapanma
    const modals = ['rankedModal', 'privateModal', 'joinModal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    if (modalId === 'rankedModal') {
                        cancelSearch();
                    } else if (modalId === 'privateModal') {
                        closePrivateModal();
                    } else if (modalId === 'joinModal') {
                        closeJoinModal();
                    }
                }
            });
        }
    });
});

// Oyundan çık
function leaveGame() {
    if (confirm('❓ Oyundan çıkmak istediğinize emin misiniz?')) {
        socket.emit('leaveGame', { roomCode: gameState.roomCode, userId });
        resetGame();
    }
}

// Oyunu sıfırla
function resetGame() {
    // Timer sunucu tarafında yönetiliyor, client tarafında durdurmaya gerek yok
    if (searchTimerInterval) {
        clearInterval(searchTimerInterval);
        searchTimerInterval = null;
    }
    
    // Önceki butonları kaldır
    const existingContinueBtn = document.getElementById('continueCaptureBtn');
    const existingFinishBtn = document.getElementById('finishCaptureBtn');
    if (existingContinueBtn) existingContinueBtn.remove();
    if (existingFinishBtn) existingFinishBtn.remove();
    
    gameState = {
        board: [],
        currentPlayer: 'white',
        selectedPiece: null,
        playerColor: null,
        roomCode: null,
        gameStarted: false,
        opponentName: 'Rakip',
        opponentPhotoUrl: null,
        mustCapture: false,
        timer: 20,
        timerInterval: null,
        afkCount: 0,
        canContinueCapture: false,
        capturingPiece: null
    };
    document.getElementById('game').style.display = 'none';
    document.getElementById('lobby').style.display = 'block';
    // Custom notification'ı kaldır
    hideCustomNotification();
}

// Socket olayları
socket.on('roomCreated', (data) => {
    gameState.roomCode = data.roomCode;
    document.getElementById('waitingRoomCode').textContent = data.roomCode;
    // Bekleyen lobi zaten açık
});

socket.on('matchFound', (data) => {
    // Eşleşme timer'ını durdur (sunucu zaten durdurdu)
    searchTimer = 0;
    updateSearchTimer();
    
    // Eşleşme modalını güncelle - oyuncu bilgilerini göster
    updateMatchModal(data);
    
    // 2 saniye sonra oyunu başlat
    setTimeout(() => {
        document.getElementById('rankedModal').style.display = 'none';
        startGame(data);
    }, 2000);
});

// Eşleşme modalını güncelle
function updateMatchModal(data) {
    const modalContent = document.querySelector('#rankedModal .modal-content');
    if (!modalContent) return;
    
    modalContent.innerHTML = `
        <h2>🎮 Eşleşme Bulundu!</h2>
        <div style="display: flex; gap: 20px; justify-content: center; align-items: center; margin: 20px 0;">
            <div style="text-align: center;">
                <div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(102, 126, 234, 0.2); display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; overflow: hidden; border: 3px solid #667eea;">
                    ${userPhotoUrl ? 
                        `<img src="${userPhotoUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />` :
                        `<span style="font-size: 2em;">${userName.charAt(0).toUpperCase()}</span>`
                    }
                </div>
                <div style="font-weight: bold; color: #667eea;">${userName}</div>
            </div>
            <div style="font-size: 2em;">VS</div>
            <div style="text-align: center;">
                <div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(102, 126, 234, 0.2); display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; overflow: hidden; border: 3px solid #667eea;">
                    ${data.opponentPhotoUrl ? 
                        `<img src="${data.opponentPhotoUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />` :
                        `<span style="font-size: 2em;">${data.opponentName ? data.opponentName.charAt(0).toUpperCase() : '?'}</span>`
                    }
                </div>
                <div style="font-weight: bold; color: #667eea;">${data.opponentName || 'Rakip'}</div>
            </div>
        </div>
        <p style="text-align: center; color: #666; font-size: 0.9em;">Oyun başlatılıyor...</p>
    `;
}

socket.on('roomJoined', (data) => {
    // Modal ve bekleyen lobiden çık
    document.getElementById('joinModal').style.display = 'none';
    document.getElementById('waitingLobby').style.display = 'none';
    
    if (data.opponentPhotoUrl) {
        gameState.opponentPhotoUrl = data.opponentPhotoUrl;
    }
    
    // Oyunu başlat
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
    
    if (data.opponentPhotoUrl) {
        gameState.opponentPhotoUrl = data.opponentPhotoUrl;
    }
    
    updatePlayerNames();
    renderBoard();
    
    // Timer sunucudan gelecek (timerUpdate event'i)
    gameState.timer = 20;
    updateTimerDisplay();
});

// Sunucudan timer güncellemesi
socket.on('timerUpdate', (data) => {
    gameState.timer = data.timeLeft;
    gameState.currentPlayer = data.currentPlayer;
    updateTimerDisplay();
});

// Timer süresi doldu
socket.on('timerTimeout', (data) => {
    if (data.currentPlayer === gameState.playerColor) {
        handleTimeout();
    }
});

socket.on('moveMade', (data) => {
    // Sunucudan gelen hamleyi hemen uygula (gecikme olmasın)
    gameState.board = data.board;
    
    // Çoklu yeme devam ediyorsa sıra değişmez
    if (!data.continueCapture) {
        gameState.currentPlayer = data.currentPlayer;
        gameState.canContinueCapture = false;
        gameState.capturingPiece = null;
    }
    
    // Hemen render et
    renderBoard();
    // Timer sunucudan gelecek (timerUpdate event'i)
});

socket.on('gameOver', (data) => {
    // Timer sunucu tarafında durduruldu
    setTimeout(() => {
        const winnerText = data.winner === gameState.playerColor ? 
            '🎉 TEBRİKLER! KAZANDINIZ! 🎉' : 
            '😔 Maalesef kaybettiniz!';
        alert(winnerText);
        resetGame();
    }, 500);
});

socket.on('opponentLeft', () => {
    // Timer sunucu tarafında durduruldu
    // Alert yerine custom notification kullan
    showCustomNotification('⚠️ Rakibiniz oyundan ayrıldı!');
    setTimeout(() => {
        resetGame();
    }, 3000);
});

socket.on('gameAbandoned', () => {
    // Timer sunucu tarafında durduruldu
    // Alert yerine custom notification kullan
    showCustomNotification('⚠️ Oyun 2 kez süre aşımı nedeniyle sonlandırıldı!');
    setTimeout(() => {
        resetGame();
    }, 3000);
});

socket.on('error', (data) => {
    // Alert yerine custom notification kullan
    showCustomNotification('❌ Hata: ' + data.message);
});

// Kullanıcı istatistikleri
socket.on('userStats', (data) => {
    userStats = data;
    updateUserStatsDisplay();
});

// Liderlik tablosu güncelleme
socket.on('leaderboardUpdate', (data) => {
    updateLeaderboardDisplay(data);
});

// Kullanıcı sıralaması güncelleme
socket.on('userRankUpdate', (data) => {
    userStats = { ...userStats, ...data };
    updateUserStatsDisplay();
});

// Kullanıcı istatistiklerini ekranda göster (Faceit tarzı)
function updateUserStatsDisplay() {
    const userStatsEl = document.getElementById('userStats');
    if (userStatsEl) {
        const levelIcon = getLevelIconSVG(userStats.level);
        userStatsEl.innerHTML = `
            <div class="user-stats-content" style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                <div class="level-icon-display" style="margin-bottom: 8px;">
                    ${levelIcon}
                </div>
                <div style="font-size: 1.2em; font-weight: bold; color: ${getLevelColorGlow(userStats.level)};">
                    LEVEL ${userStats.level}
                </div>
                <div style="font-size: 0.85em; color: #94a3b8; margin-top: 4px;">
                    ${userStats.elo} ELO
                </div>
                <div style="font-size: 0.75em; color: #64748b; margin-top: 2px;">
                    ${userStats.wins}W - ${userStats.losses}L
                </div>
            </div>
        `;
    }
}

// SVG Level İkonu (Faceit tarzı)
function getLevelIconSVG(level) {
    const color = getLevelColorGlow(level);
    const size = 50;
    
    // Level'a göre şekil
    let shape = '';
    
    if (level >= 1 && level <= 3) {
        // Bronz - Üçgen
        shape = `
            <svg width="${size}" height="${size}" viewBox="0 0 100 100" style="filter: drop-shadow(0 0 8px ${color});">
                <polygon points="50,10 90,80 10,80" fill="${color}" stroke="#fff" stroke-width="3"/>
                <text x="50" y="65" text-anchor="middle" fill="#1e293b" font-size="35" font-weight="bold">${level}</text>
            </svg>
        `;
    } else if (level >= 4 && level <= 6) {
        // Gümüş - Kare
        shape = `
            <svg width="${size}" height="${size}" viewBox="0 0 100 100" style="filter: drop-shadow(0 0 8px ${color});">
                <rect x="15" y="15" width="70" height="70" fill="${color}" stroke="#fff" stroke-width="3" rx="5"/>
                <text x="50" y="65" text-anchor="middle" fill="#1e293b" font-size="35" font-weight="bold">${level}</text>
            </svg>
        `;
    } else if (level >= 7 && level <= 9) {
        // Altın - Beşgen
        shape = `
            <svg width="${size}" height="${size}" viewBox="0 0 100 100" style="filter: drop-shadow(0 0 8px ${color});">
                <polygon points="50,10 90,35 75,80 25,80 10,35" fill="${color}" stroke="#fff" stroke-width="3"/>
                <text x="50" y="60" text-anchor="middle" fill="#1e293b" font-size="35" font-weight="bold">${level}</text>
            </svg>
        `;
    } else if (level === 10) {
        // Elmas - Yıldız
        shape = `
            <svg width="${size}" height="${size}" viewBox="0 0 100 100" style="filter: drop-shadow(0 0 12px ${color}); animation: levelGlow 2s ease-in-out infinite;">
                <polygon points="50,5 61,35 92,35 67,54 78,85 50,65 22,85 33,54 8,35 39,35" fill="${color}" stroke="#fff" stroke-width="3"/>
                <text x="50" y="55" text-anchor="middle" fill="#1e293b" font-size="28" font-weight="bold">10</text>
            </svg>
        `;
    }
    
    return shape;
}

// Seviye renk parıltısı
function getLevelColorGlow(level) {
    if (level >= 1 && level <= 3) {
        return '#cd7f32'; // Bronz
    } else if (level >= 4 && level <= 6) {
        return '#c0c0c0'; // Gümüş
    } else if (level >= 7 && level <= 9) {
        return '#ffd700'; // Altın
    } else if (level === 10) {
        return '#ff6b6b'; // Kırmızı (Maksimum)
    }
    return '#94a3b8';
}

// Liderlik tablosunu ekranda göster
function updateLeaderboardDisplay(leaderboard) {
    const leaderboardEl = document.getElementById('leaderboardContent');
    if (leaderboardEl) {
        let leaderboardHTML = '';
        
        leaderboard.forEach((player, index) => {
            const isTop3 = index < 3;
            const rankClass = isTop3 ? `rank-${index + 1}` : '';
            const animationClass = isTop3 ? 'top-rank-animation' : '';
            
            leaderboardHTML += `
                <div class="leaderboard-item ${rankClass} ${animationClass}">
                    <div class="rank">${index + 1}</div>
                    <div class="player-info">
                        <div class="player-name">${player.userName}</div>
                        <div class="player-level">${player.levelIcon} Level ${player.level}</div>
                    </div>
                    <div class="player-elo">${player.elo}</div>
                </div>
            `;
        });
        
        leaderboardEl.innerHTML = leaderboardHTML;
    }
}

// Liderlik tablosunu göster
function showLeaderboard() {
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('leaderboard').style.display = 'block';
    
    // Sunucudan liderlik tablosunu iste
    socket.emit('getLeaderboard');
}

// Liderlik tablosunu gizle
function hideLeaderboard() {
    document.getElementById('leaderboard').style.display = 'none';
    document.getElementById('lobby').style.display = 'block';
}

// Oyunu başlat
function startGame(data) {
    gameState.roomCode = data.roomCode;
    gameState.playerColor = data.playerColor;
    gameState.board = initBoard();
    gameState.currentPlayer = 'white';
    gameState.gameStarted = true;
    gameState.opponentName = data.opponentName || 'Rakip';
    gameState.opponentPhotoUrl = data.opponentPhotoUrl || null;
    gameState.opponentLevel = data.opponentLevel || 1;
    gameState.opponentElo = data.opponentElo || 0;
    gameState.afkCount = 0;
    
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('leaderboard').style.display = 'none';
    document.getElementById('game').style.display = 'block';
    
    updatePlayerNames();
    renderBoard();
    
    socket.emit('gameReady', {
        roomCode: gameState.roomCode,
        board: gameState.board,
        userId: userId
    });
    
    // Timer sunucudan yönetiliyor
    gameState.timer = 20;
    updateTimerDisplay();
    
    // Kullanıcının sıralamasını iste
    socket.emit('getUserRank', { userId: userId });
}

// Oyuncu isimlerini güncelle
function updatePlayerNames() {
    const player1Name = document.getElementById('player1Name');
    const player2Name = document.getElementById('player2Name');
    const player1Avatar = document.getElementById('player1Avatar');
    const player2Avatar = document.getElementById('player2Avatar');
    
    if (gameState.playerColor === 'white') {
        player1Name.innerHTML = '';
        player1Name.textContent = userName;
        player2Name.innerHTML = '';
        player2Name.textContent = gameState.opponentName;
        
        // Kullanıcının seviye ikonlarını ekle
        if (userStats.level) {
            const levelBadge = document.createElement('span');
            levelBadge.style.fontSize = '0.8em';
            levelBadge.style.marginLeft = '5px';
            levelBadge.style.padding = '3px 8px';
            levelBadge.style.borderRadius = '8px';
            levelBadge.style.background = getLevelColor(userStats.level);
            levelBadge.style.display = 'inline-flex';
            levelBadge.style.alignItems = 'center';
            levelBadge.style.gap = '4px';
            levelBadge.innerHTML = `${getLevelIconSimple(userStats.level)} <span style="font-weight: bold;">${userStats.level}</span>`;
            player1Name.appendChild(levelBadge);
        }
        
        // Rakibin seviye ikonlarını ekle
        if (gameState.opponentLevel) {
            const opponentLevelBadge = document.createElement('span');
            opponentLevelBadge.style.fontSize = '0.8em';
            opponentLevelBadge.style.marginLeft = '5px';
            opponentLevelBadge.style.padding = '3px 8px';
            opponentLevelBadge.style.borderRadius = '8px';
            opponentLevelBadge.style.background = getLevelColor(gameState.opponentLevel);
            opponentLevelBadge.style.display = 'inline-flex';
            opponentLevelBadge.style.alignItems = 'center';
            opponentLevelBadge.style.gap = '4px';
            opponentLevelBadge.innerHTML = `${getLevelIconSimple(gameState.opponentLevel)} <span style="font-weight: bold;">${gameState.opponentLevel}</span>`;
            player2Name.appendChild(opponentLevelBadge);
        }
        
        // Avatar'ları güncelle
        updatePlayerAvatar(player1Avatar, userPhotoUrl, userName);
        updatePlayerAvatar(player2Avatar, gameState.opponentPhotoUrl, gameState.opponentName);
    } else {
        player1Name.innerHTML = '';
        player1Name.textContent = gameState.opponentName;
        player2Name.innerHTML = '';
        player2Name.textContent = userName;
        
        // Rakibin seviye ikonlarını ekle
        if (gameState.opponentLevel) {
            const opponentLevelBadge = document.createElement('span');
            opponentLevelBadge.style.fontSize = '0.8em';
            opponentLevelBadge.style.marginLeft = '5px';
            opponentLevelBadge.style.padding = '3px 8px';
            opponentLevelBadge.style.borderRadius = '8px';
            opponentLevelBadge.style.background = getLevelColor(gameState.opponentLevel);
            opponentLevelBadge.style.display = 'inline-flex';
            opponentLevelBadge.style.alignItems = 'center';
            opponentLevelBadge.style.gap = '4px';
            opponentLevelBadge.innerHTML = `${getLevelIconSimple(gameState.opponentLevel)} <span style="font-weight: bold;">${gameState.opponentLevel}</span>`;
            player1Name.appendChild(opponentLevelBadge);
        }
        
        // Kullanıcının seviye ikonlarını ekle
        if (userStats.level) {
            const levelBadge = document.createElement('span');
            levelBadge.style.fontSize = '0.8em';
            levelBadge.style.marginLeft = '5px';
            levelBadge.style.padding = '3px 8px';
            levelBadge.style.borderRadius = '8px';
            levelBadge.style.background = getLevelColor(userStats.level);
            levelBadge.style.display = 'inline-flex';
            levelBadge.style.alignItems = 'center';
            levelBadge.style.gap = '4px';
            levelBadge.innerHTML = `${getLevelIconSimple(userStats.level)} <span style="font-weight: bold;">${userStats.level}</span>`;
            player2Name.appendChild(levelBadge);
        }
        
        // Avatar'ları güncelle
        updatePlayerAvatar(player1Avatar, gameState.opponentPhotoUrl, gameState.opponentName);
        updatePlayerAvatar(player2Avatar, userPhotoUrl, userName);
    }
}

// Basit seviye ikonu (oyun içi)
function getLevelIconSimple(level) {
    const color = getLevelColorGlow(level);
    const size = 20;
    
    if (level >= 1 && level <= 3) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" style="display: inline-block; vertical-align: middle;"><polygon points="50,10 90,80 10,80" fill="${color}" stroke="#fff" stroke-width="5"/></svg>`;
    } else if (level >= 4 && level <= 6) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" style="display: inline-block; vertical-align: middle;"><rect x="15" y="15" width="70" height="70" fill="${color}" stroke="#fff" stroke-width="5" rx="5"/></svg>`;
    } else if (level >= 7 && level <= 9) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" style="display: inline-block; vertical-align: middle;"><polygon points="50,10 90,35 75,80 25,80 10,35" fill="${color}" stroke="#fff" stroke-width="5"/></svg>`;
    } else if (level === 10) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" style="display: inline-block; vertical-align: middle;"><polygon points="50,5 61,35 92,35 67,54 78,85 50,65 22,85 33,54 8,35 39,35" fill="${color}" stroke="#fff" stroke-width="5"/></svg>`;
    }
    return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" style="display: inline-block; vertical-align: middle;"><circle cx="50" cy="50" r="40" fill="${color}" stroke="#fff" stroke-width="5"/></svg>`;
}

// Seviye rengini belirle
function getLevelColor(level) {
    if (level >= 1 && level <= 3) {
        return 'rgba(255, 215, 0, 0.3)'; // Açık sarı
    } else if (level >= 4 && level <= 6) {
        return 'rgba(192, 192, 192, 0.3)'; // Gümüş
    } else if (level >= 7 && level <= 10) {
        return 'rgba(255, 215, 0, 0.5)'; // Altın
    }
    return 'rgba(128, 128, 128, 0.3)';
}

// Oyuncu avatar'ını güncelle
function updatePlayerAvatar(avatarEl, photoUrl, name) {
    if (!avatarEl) return;
    
    avatarEl.innerHTML = '';
    if (photoUrl) {
        const img = document.createElement('img');
        img.src = photoUrl;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        avatarEl.appendChild(img);
    } else {
        avatarEl.textContent = name ? name.charAt(0).toUpperCase() : '👤';
        avatarEl.style.fontSize = '1em';
    }
}

// Custom notification fonksiyonları
function showCustomNotification(message) {
    // Bildirim elementini oluştur veya güncelle
    let notification = document.getElementById('customNotification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'customNotification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 9999;
            font-weight: 600;
            border-left: 4px solid #667eea;
            max-width: 300px;
            backdrop-filter: blur(10px);
        `;
        document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.style.display = 'block';
    
    // 3 saniye sonra bildirimi gizle
    setTimeout(() => {
        hideCustomNotification();
    }, 3000);
}

function hideCustomNotification() {
    const notification = document.getElementById('customNotification');
    if (notification) {
        notification.style.display = 'none';
    }
}
