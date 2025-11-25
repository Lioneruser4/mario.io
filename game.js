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
            
            // Resim yüklenemezse emoji göster
            img.onerror = function() {
                console.log('Profil resmi yüklenemedi, emoji kullanılıyor');
                const avatarEmojis = ['😎', '🎮', '🎯', '🚀', '⚡', '🔥', '💎', '👑'];
                const avatarIndex = telegramUser.id % avatarEmojis.length;
                avatarEl.textContent = avatarEmojis[avatarIndex];
            };
            
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
    // opponentUserId kaldırıldı - FIFO sistemi kullanılıyor
    mustCapture: false,
    timer: 20,
    timerInterval: null,
    afkCount: 0
};

// Timer elementini ekle
let timerElement = null;

// Level iconunu güncelle
function updateLevelIcon(level) {
    const levelIcon = document.getElementById('levelIcon');
    if (levelIcon) {
        levelIcon.setAttribute('data-level', level);
        levelIcon.querySelector('.level-icon-inner').textContent = level;
    }
}

// Kullanıcı istatistiklerini güncelle
socket.on('userStats', (data) => {
    userStats = data;
    
    // İstatistikleri güncelle
    const eloElement = document.querySelector('.user-stats .stat-item:first-child .stat-value');
    const wlElement = document.querySelector('.user-stats .stat-item:last-child .stat-value');
    
    if (eloElement) eloElement.textContent = data.elo;
    if (wlElement) wlElement.textContent = `${data.wins}/${data.losses}`;
    
    // Level iconunu güncelle
    updateLevelIcon(data.level);
});

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
    
    // Mecburi yeme kontrolü
    const allMoves = getAllPossibleMoves(gameState.playerColor);
    const captureMoves = allMoves.filter(m => m.capture);
    gameState.mustCapture = captureMoves.length > 0;
    
    // Siyah oyuncu için tahtayı ters çevir (kendini en altta görsün)
    // Hem satırları hem de sütunları ters çevir (yüz yüze oynama efekti)
    const isFlipped = gameState.playerColor === 'black';
    
    for (let displayRow = 0; displayRow < 8; displayRow++) {
        for (let displayCol = 0; displayCol < 8; displayCol++) {
            // Görüntüleme koordinatlarından gerçek koordinatlara çevir
            // Siyah oyuncu için tam ters çevirme (ayna efekti)
            const realRow = isFlipped ? 7 - displayRow : displayRow;
            const realCol = isFlipped ? 7 - displayCol : displayCol;
            
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
    console.log(`🖱️ Kare tıklandı: ${row},${col} - Sıra: ${gameState.currentPlayer} - Ben: ${gameState.playerColor}`);
    
    if (!gameState.gameStarted) {
        console.log('❌ Oyun başlamamış');
        return;
    }
    
    // Sadece kendi sıramızda hamle yapabiliriz
    if (gameState.currentPlayer !== gameState.playerColor) {
        console.log('⏳ Sıra sizde değil!');
        showCustomNotification('⏳ Sıra sizde değil!', 'info', 2000);
        return;
    }
    
    const piece = gameState.board[row][col];
    
    // Kendi taşımı seçiyorum
    if (piece && piece.color === gameState.playerColor) {
        const moves = getValidMoves(row, col);
        
        // Mecburi yeme varsa, sadece yeme yapabilecek taşları seç
        if (gameState.mustCapture) {
            const hasCapture = moves.some(m => m.capture);
            if (!hasCapture) {
                showCustomNotification('⚠️ Önce rakip taşı yemelisiniz!', 'warning', 2000);
                return; // Bu taş yeme yapamıyor, seçilemesin
            }
        }
        
        if (moves.length > 0) {
            selectPiece(row, col);
        }
    } 
    // Seçili taşı hareket ettiriyorum
    else if (gameState.selectedPiece) {
        const validMoves = getValidMoves(gameState.selectedPiece.row, gameState.selectedPiece.col);
        const move = validMoves.find(m => m.row === row && m.col === col);
        if (move) {
            console.log('🎯 Hamle yapılıyor');
            makeMove(gameState.selectedPiece.row, gameState.selectedPiece.col, row, col, move.capture);
            gameState.afkCount = 0; // Hamle yapıldı, AFK sayacını sıfırla
        } else {
            // Geçersiz hamle, seçimi iptal et
            gameState.selectedPiece = null;
            renderBoard();
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
                        // Taşı geçici olarak hareket ettir
                        const tempBoard = JSON.parse(JSON.stringify(gameState.board));
                        tempBoard[jumpRow][jumpCol] = piece;
                        tempBoard[row][col] = null;
                        tempBoard[enemyRow][enemyCol] = null;
                        
                        // Kral yapma kontrolü
                        if (!piece.king && ((piece.color === 'white' && jumpRow === 0) || (piece.color === 'black' && jumpRow === 7))) {
                            tempBoard[jumpRow][jumpCol].king = true;
                        }
                        
                        // Çoklu yeme kontrolü - bu pozisyondan daha fazla yeme var mı?
                        const furtherCaptures = getValidMovesFromBoard(tempBoard, jumpRow, jumpCol).filter(m => {
                            const dR = m.row - jumpRow;
                            const dC = m.col - jumpCol;
                            return Math.abs(dR) === 2 && Math.abs(dC) === 2;
                        });
                        
                        captureMoves.push({ 
                            row: jumpRow, 
                            col: jumpCol, 
                            capture: { row: enemyRow, col: enemyCol },
                            canContinueCapture: furtherCaptures.length > 0
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

// Geçici tahtadan hamle kontrolü (çoklu yeme için)
function getValidMovesFromBoard(board, row, col) {
    const moves = [];
    const piece = board[row][col];
    if (!piece) return moves;
    
    const directions = piece.king ? 
        [[-1, -1], [-1, 1], [1, -1], [1, 1]] : 
        piece.color === 'white' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
    
    // Sadece yeme hamlelerini kontrol et
    directions.forEach(([dRow, dCol]) => {
        const enemyRow = row + dRow;
        const enemyCol = col + dCol;
        
        if (enemyRow >= 0 && enemyRow < 8 && enemyCol >= 0 && enemyCol < 8) {
            const enemyPiece = board[enemyRow][enemyCol];
            
            if (enemyPiece && enemyPiece.color !== piece.color) {
                const jumpRow = enemyRow + dRow;
                const jumpCol = enemyCol + dCol;
                
                if (jumpRow >= 0 && jumpRow < 8 && jumpCol >= 0 && jumpCol < 8) {
                    if (!board[jumpRow][jumpCol]) {
                        moves.push({ 
                            row: jumpRow, 
                            col: jumpCol, 
                            capture: { row: enemyRow, col: enemyCol }
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
    console.log(`🎯 Hamle gönderiliyor: ${fromRow},${fromCol} -> ${toRow},${toCol}`);
    
    const piece = gameState.board[fromRow][fromCol];
    
    // Taşı hareket ettir
    gameState.board[toRow][toCol] = piece;
    gameState.board[fromRow][fromCol] = null;
    
    // Yeme işlemi
    if (capture) {
        gameState.board[capture.row][capture.col] = null;
    }
    
    // Kral yapma
    if (!piece.king) {
        if ((piece.color === 'white' && toRow === 0) || (piece.color === 'black' && toRow === 7)) {
            piece.king = true;
        }
    }
    
    // Çoklu yeme kontrolü
    if (capture) {
        const furtherCaptures = getValidMoves(toRow, toCol).filter(m => {
            const dR = m.row - toRow;
            const dC = m.col - toCol;
            return Math.abs(dR) === 2 && Math.abs(dC) === 2;
        });
        
        if (furtherCaptures.length > 0) {
            console.log('🔄 Çoklu yeme var, butonlar gösteriliyor');
            
            // Devam eden yeme var - seçimi koru ve butonlar göster
            gameState.selectedPiece = { row: toRow, col: toCol };
            renderBoard();
            
            // Devam et/Bitir butonları oluştur
            const gameContainer = document.getElementById('game');
            
            // Önceki butonları temizle
            const existingContinueBtn = document.getElementById('continueCaptureBtn');
            const existingFinishBtn = document.getElementById('finishCaptureBtn');
            if (existingContinueBtn) existingContinueBtn.remove();
            if (existingFinishBtn) existingFinishBtn.remove();
            
            const continueBtn = document.createElement('button');
            continueBtn.id = 'continueCaptureBtn';
            continueBtn.textContent = 'Yemeye Devam Et';
            continueBtn.style.cssText = `
                position: fixed;
                top: 50%;
                left: 40%;
                transform: translate(-50%, -50%);
                padding: 15px 20px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
                z-index: 1000;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            `;
            continueBtn.onclick = () => {
                continueBtn.remove();
                finishBtn.remove();
                renderBoard();
            };
            
            const finishBtn = document.createElement('button');
            finishBtn.id = 'finishCaptureBtn';
            finishBtn.textContent = 'Yemeyi Bitir';
            finishBtn.style.cssText = `
                position: fixed;
                top: 50%;
                left: 60%;
                transform: translate(-50%, -50%);
                padding: 15px 20px;
                background: linear-gradient(135deg, #f093fb, #f5576c);
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
                z-index: 1000;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            `;
            finishBtn.onclick = () => {
                continueBtn.remove();
                finishBtn.remove();
                gameState.selectedPiece = null;
                
                // Hamleyi sunucuya gönder
                console.log('📤 Çoklu yeme hamlesi sunucuya gönderiliyor');
                socket.emit('makeMove', {
                    roomCode: gameState.roomCode,
                    from: { row: fromRow, col: fromCol },
                    to: { row: toRow, col: toCol },
                    board: gameState.board,
                    capture: capture,
                    userId: userId
                });
            };
            
            gameContainer.appendChild(continueBtn);
            gameContainer.appendChild(finishBtn);
            return; // Sırayı değiştirme, hamleyi gönderme
        }
    }
    
    // Normal hamle veya çoklu yeme bitince
    gameState.selectedPiece = null;
    renderBoard();
    
    // Hamleyi sunucuya gönder
    console.log('📤 Normal hamle sunucuya gönderiliyor');
    socket.emit('makeMove', {
        roomCode: gameState.roomCode,
        from: { row: fromRow, col: fromCol },
        to: { row: toRow, col: toCol },
        board: gameState.board,
        capture: capture,
        userId: userId
    });
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
        // avoidUserId kaldırıldı - FIFO sistemi kullanılıyor
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
        // Sunucuya oyunu terk etme haberini gönder
        socket.emit('leaveGame', { roomCode: gameState.roomCode, userId });
        
        // Hemen oyunu bitir ve lobiye dön
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
    
    // Rakip kullanıcı ID'sini sıfırlama (FIFO'da gerek yok)
    // const lastOpponentId = gameState.opponentUserId; // Kaldırıldı
    
    gameState = {
        board: [],
        currentPlayer: 'white',
        selectedPiece: null,
        playerColor: null,
        roomCode: null,
        gameStarted: false,
        opponentName: 'Rakip',
        opponentPhotoUrl: null,
        // opponentUserId: lastOpponentId, // Kaldırıldı
        mustCapture: false,
        timer: 20,
        timerInterval: null,
        afkCount: 0
    };
    document.getElementById('game').style.display = 'none';
    document.getElementById('lobby').style.display = 'block';
    // Custom notification'ı kaldır
    hideCustomNotification();
}

// Socket olayları
socket.on('roomCreated', (data) => {
    console.log('📥 Client oda kodu aldı:', data.roomCode);
    gameState.roomCode = data.roomCode;
    
    const roomCodeElement = document.getElementById('waitingRoomCode');
    if (roomCodeElement) {
        roomCodeElement.textContent = data.roomCode;
        console.log('📝 Oda kodu elemente yazıldı:', data.roomCode);
    } else {
        console.error('❌ waitingRoomCode elementi bulunamadı!');
    }
    // Bekleyen lobi zaten açık
});

socket.on('matchFound', (data) => {
    // Rakip kullanıcı ID'sini kaydet (FIFO'da gerek yok ama bilgi amaçlı)
    // gameState.opponentUserId = data.opponentUserId; // Kaldırıldı
    
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
    // Rakip kullanıcı ID'sini kaydet (FIFO'da gerek yok)
    // gameState.opponentUserId = data.opponentUserId; // Kaldırıldı
    
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
    updatePlayerAvatars(); // Profil resimlerini güncelle
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

// Admin paneli kontrolü
function checkAdminAccess() {
    // Sadece bu Telegram ID'ye admin paneli göster
    const adminTelegramId = '976640409';
    return userId === `TG_${adminTelegramId}`;
}

// Admin paneli butonunu ekle
function addAdminButton() {
    if (!checkAdminAccess()) return;
    
    // Eğer admin butonu zaten varsa ekleme
    if (document.getElementById('adminBtn')) return;
    
    const adminBtn = document.createElement('button');
    adminBtn.id = 'adminBtn';
    adminBtn.className = 'btn admin-btn';
    adminBtn.innerHTML = '🔧 Admin';
    adminBtn.onclick = () => {
        showAdminPanel();
    };
    
    // SADECE lobiye ekle (oyun ekranında gösterme)
    const lobby = document.getElementById('lobby');
    if (lobby) {
        const header = lobby.querySelector('.header');
        if (header) {
            header.appendChild(adminBtn);
        } else {
            lobby.insertBefore(adminBtn, lobby.firstChild);
        }
    }
}

// Admin panelini göster
function showAdminPanel() {
    // Admin panel modal'ı oluştur
    const existingModal = document.getElementById('adminModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.id = 'adminModal';
    modal.className = 'admin-modal';
    modal.innerHTML = `
        <div class="admin-modal-content">
            <div class="admin-modal-header">
                <h2>🔧 Admin Panel</h2>
                <button class="admin-close-btn" onclick="closeAdminPanel()">×</button>
            </div>
            <div class="admin-modal-body">
                <div class="admin-section">
                    <h3>📊 İstatistikler</h3>
                    <div class="admin-stats">
                        <div class="stat-item">
                            <label>Aktif Oda:</label>
                            <span id="adminActiveRooms">0</span>
                        </div>
                        <div class="stat-item">
                            <label>Bekleyen Oyuncu:</label>
                            <span id="adminWaitingPlayers">0</span>
                        </div>
                        <div class="stat-item">
                            <label>Toplam Kullanıcı:</label>
                            <span id="adminTotalUsers">0</span>
                        </div>
                        <div class="stat-item">
                            <label>Bekleyen Odalar:</label>
                            <span id="adminWaitingRooms">0</span>
                        </div>
                    </div>
                    <div id="adminRoomList" style="max-height: 150px; overflow-y: auto; margin-top: 10px;">
                        <!-- Odalar burada gösterilecek -->
                    </div>
                </div>
                
                <div class="admin-section">
                    <h3>👥 Kullanıcı İşlemleri</h3>
                    <div class="admin-controls">
                        <input type="text" id="adminUserId" placeholder="Kullanıcı ID (1840079939 veya TG_1840079939)">
                        <select id="adminAction">
                            <option value="giveElo">Elo Ver (+100)</option>
                            <option value="takeElo">Elo Al (-100)</option>
                            <option value="giveElo500">Elo Ver (+500)</option>
                            <option value="giveElo1000">Elo Ver (+1000)</option>
                            <option value="deleteUser">Kullanıcı Sil</option>
                            <option value="resetUser">Sıfırla</option>
                        </select>
                        <button class="btn" onclick="executeAdminAction()">Uygula</button>
                    </div>
                </div>
                
                <div class="admin-section">
                    <h3>⚙️ Sistem İşlemleri</h3>
                    <div class="admin-controls">
                        <button class="btn danger" onclick="adminResetAllElo()">🔄 Tüm Elo'yu Sıfırla</button>
                        <button class="btn warning" onclick="adminClearRooms()">🏠 Odaları Temizle</button>
                        <button class="btn success" onclick="adminKickAll()">👟 Herkesi At</button>
                    </div>
                </div>
                
                <div class="admin-section">
                    <h3>🏆 Liderlik Tablosu</h3>
                    <div class="admin-controls">
                        <button class="btn" onclick="loadLeaderboard()">🔄 Liderlik Tablosu Yükle</button>
                        <div id="adminLeaderboard" style="max-height: 200px; overflow-y: auto; margin-top: 10px;">
                            <!-- Liderlik tablosu burada gösterilecek -->
                        </div>
                    </div>
                </div>
                
                <div class="admin-section">
                    <h3>📋 Kullanıcı Listesi</h3>
                    <div class="admin-controls">
                        <button class="btn" onclick="loadUserList()">🔄 Kullanıcı Listesi Yükle</button>
                        <div id="adminUserList" style="max-height: 200px; overflow-y: auto; margin-top: 10px;">
                            <!-- Kullanıcılar burada gösterilecek -->
                        </div>
                    </div>
                </div>
                
                <div class="admin-section">
                    <h3>📢 Bildirim Gönder</h3>
                    <div class="admin-controls">
                        <input type="text" id="adminNotification" placeholder="Bildirim mesajı...">
                        <button class="btn" onclick="sendAdminNotification()">Gönder</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // İstatistikleri yükle
    loadAdminStats();
    
    // 5 saniyede bir istatistikleri güncelle
    window.adminStatsInterval = setInterval(loadAdminStats, 5000);
}

// Admin panelini kapat
function closeAdminPanel() {
    const modal = document.getElementById('adminModal');
    if (modal) {
        modal.remove();
    }
    if (window.adminStatsInterval) {
        clearInterval(window.adminStatsInterval);
    }
}

// Admin istatistiklerini yükle
function loadAdminStats() {
    fetch('/status')
        .then(res => res.json())
        .then(data => {
            document.getElementById('adminActiveRooms').textContent = data.activeRooms;
            document.getElementById('adminWaitingPlayers').textContent = data.waitingPlayers;
            
            // Toplam kullanıcı sayısını al
            socket.emit('adminGetUsers');
            
            // Bekleyen odaları göster
            updateWaitingRooms();
            
            // Liderlik tablosunu yükle
            loadLeaderboard();
        });
}

// Bekleyen odaları güncelle
function updateWaitingRooms() {
    const waitingRoomsDiv = document.getElementById('adminWaitingRooms');
    if (!waitingRoomsDiv) return;
    
    // Sunucudan oda bilgilerini iste
    socket.emit('adminGetRooms');
}

// Admin işlemi yap
function executeAdminAction() {
    let userId = document.getElementById('adminUserId').value.trim();
    const action = document.getElementById('adminAction').value;
    
    if (!userId) {
        alert('Kullanıcı ID girin!');
        return;
    }
    
    // Eğer sadece sayı ise TG_ prefix ekle
    if (/^\d+$/.test(userId)) {
        userId = `TG_${userId}`;
    }
    
    // Action'a göre amount belirle
    let amount = 100;
    if (action === 'giveElo500') amount = 500;
    if (action === 'giveElo1000') amount = 1000;
    if (action === 'takeElo') amount = -100;
    
    socket.emit('adminUserAction', { userId, action, amount });
}

// Tüm elo'yu sıfırla
function adminResetAllElo() {
    if (confirm('Tüm elo puanlarını sıfırlamak istediğinizden emin misiniz?')) {
        socket.emit('adminResetAllElo');
    }
}

// Odaları temizle
function adminClearRooms() {
    if (confirm('Tüm odaları temizlemek istediğinizden emin misiniz?')) {
        socket.emit('adminClearAllRooms');
    }
}

// Herkesi at
function adminKickAll() {
    if (confirm('Tüm kullanıcıları atmak istediğinizden emin misiniz?')) {
        socket.emit('adminKickAll');
    }
}

// Bildirim gönder
function sendAdminNotification() {
    const message = document.getElementById('adminNotification').value;
    if (message) {
        socket.emit('adminNotification', { message, type: 'info' });
        document.getElementById('adminNotification').value = '';
    }
}

// Kullanıcı listesini yükle
function loadUserList() {
    socket.emit('adminGetUsers');
}

// Kullanıcıyı sil
function deleteUser(userId) {
    if (confirm(`Kullanıcı ${userId} silinsin mi?`)) {
        socket.emit('adminUserAction', { userId, action: 'deleteUser' });
    }
}

// Liderlik tablosunu yükle
function loadLeaderboard() {
    socket.emit('getLeaderboard');
}

// Liderlik tablosundan kullanıcı sil
function deleteFromLeaderboard(userId) {
    if (confirm(`Kullanıcı ${userId} liderlik tablosundan ve veritabanından silinsin mi?`)) {
        socket.emit('adminUserAction', { userId, action: 'deleteUser' });
    }
}

// Sayfa yüklendiğinde kontrol et
document.addEventListener('DOMContentLoaded', () => {
    addAdminButton();
});

// Kullanıcı bilgileri geldiğinde kontrol et
socket.on('userStats', (data) => {
    setTimeout(() => addAdminButton(), 100);
});

socket.on('gameStart', () => {
    // Oyun ekranında da admin butonu olsun
    setTimeout(() => addAdminButton(), 100);
});

socket.on('matchFound', () => {
    setTimeout(() => addAdminButton(), 100);
});
socket.on('adminUsers', (users) => {
    const totalUsersEl = document.getElementById('adminTotalUsers');
    if (totalUsersEl) {
        totalUsersEl.textContent = users.length;
    }
    
    // Kullanıcı listesini göster
    const userListEl = document.getElementById('adminUserList');
    if (userListEl) {
        if (users.length === 0) {
            userListEl.innerHTML = '<p style="color: #999; text-align: center;">Kullanıcı bulunamadı</p>';
        } else {
            const userHTML = users.map(user => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(255,255,255,0.05); margin: 5px 0; border-radius: 5px;">
                    <div>
                        <strong>${user.userName}</strong><br>
                        <small style="color: #999;">${user.userId} | Elo: ${user.elo}</small>
                    </div>
                    <button class="btn danger" style="padding: 5px 10px; font-size: 0.8em;" onclick="deleteUser('${user.userId}')">Sil</button>
                </div>
            `).join('');
            userListEl.innerHTML = userHTML;
        }
    }
});

socket.on('adminRooms', (rooms) => {
    const waitingRoomsEl = document.getElementById('adminWaitingRooms');
    const roomListEl = document.getElementById('adminRoomList');
    
    if (waitingRoomsEl) {
        waitingRoomsEl.textContent = rooms.length;
    }
    
    if (roomListEl) {
        if (rooms.length === 0) {
            roomListEl.innerHTML = '<p style="color: #999; text-align: center;">Aktif oda veya bekleyen oyuncu yok</p>';
        } else {
            const roomHTML = rooms.map(room => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(255,255,255,0.05); margin: 5px 0; border-radius: 5px;">
                    <div>
                        <strong>${room.code}</strong><br>
                        <small style="color: #999;">${room.type} | ${room.players}</small>
                    </div>
                    <div style="font-size: 0.8em; color: ${room.gameStarted ? '#4ade80' : '#fbbf24'};">
                        ${room.gameStarted ? '▶️' : '⏳'}
                    </div>
                </div>
            `).join('');
            roomListEl.innerHTML = roomHTML;
        }
    }
});

socket.on('adminResponse', (data) => {
    // Admin bildirimini göster (15 saniye)
    showCustomNotification(data.message, data.type, 15000);
    
    if (data.refresh) {
        loadAdminStats();
    }
});

socket.on('adminNotification', (data) => {
    // Admin bildirimini göster (15 saniye)
    showCustomNotification(data.message, data.type, 15000);
});

socket.on('moveMade', (data) => {
    console.log('📥 Sunucudan hamle geldi:', data);
    
    // Sunucudan gelen hamleyi hemen uygula
    gameState.board = data.board;
    gameState.currentPlayer = data.currentPlayer;
    
    console.log(`🔄 Sıra değişti: ${gameState.currentPlayer} - Ben: ${gameState.playerColor}`);
    
    // Seçimi temizle
    gameState.selectedPiece = null;
    
    // Butonları temizle
    const existingContinueBtn = document.getElementById('continueCaptureBtn');
    const existingFinishBtn = document.getElementById('finishCaptureBtn');
    if (existingContinueBtn) existingContinueBtn.remove();
    if (existingFinishBtn) existingFinishBtn.remove();
    
    // Eğer çoklu yeme devam ediyorsa ve bizim sıramızda ise
    if (data.canContinueCapture && gameState.currentPlayer === gameState.playerColor) {
        console.log('🎯 Çoklu yeme devam ediyor');
        
        // Seçili taşı koru
        const lastMove = data.to;
        gameState.selectedPiece = { row: lastMove.row, col: lastMove.col };
        
        // Butonları göster
        const gameContainer = document.getElementById('game');
        
        const continueBtn = document.createElement('button');
        continueBtn.id = 'continueCaptureBtn';
        continueBtn.textContent = 'Yemeye Devam Et';
        continueBtn.style.cssText = `
            position: fixed;
            top: 50%;
            left: 40%;
            transform: translate(-50%, -50%);
            padding: 15px 20px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            z-index: 1000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        `;
        continueBtn.onclick = () => {
            continueBtn.remove();
            finishBtn.remove();
            renderBoard();
        };
        
        const finishBtn = document.createElement('button');
        finishBtn.id = 'finishCaptureBtn';
        finishBtn.textContent = 'Yemeyi Bitir';
        finishBtn.style.cssText = `
            position: fixed;
            top: 50%;
            left: 60%;
            transform: translate(-50%, -50%);
            padding: 15px 20px;
            background: linear-gradient(135deg, #f093fb, #f5576c);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            z-index: 1000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        `;
        finishBtn.onclick = () => {
            continueBtn.remove();
            finishBtn.remove();
            gameState.selectedPiece = null;
        };
        
        gameContainer.appendChild(continueBtn);
        gameContainer.appendChild(finishBtn);
    }
    
    // Hemen render et
    renderBoard();
    updatePlayerHighlight();
    updateTimerDisplay();
});

// Oyuncu kartlarında profil resmini göster
function updatePlayerAvatars() {
    // Player 1 (Beyaz) ve Player 2 (Siyah) kartlarını bul
    const player1Card = document.getElementById('player1Card');
    const player2Card = document.getElementById('player2Card');
    
    // Kendi oyuncu rengimizi belirle
    const myColor = gameState.playerColor;
    const myAvatar = myColor === 'white' ? player1Card : player2Card;
    const opponentAvatar = myColor === 'white' ? player2Card : player1Card;
    
    // Kendi profil resmimizi doğru karta yerleştir
    const myAvatarElement = myAvatar.querySelector('[id$="Avatar"]');
    if (myAvatarElement && userPhotoUrl) {
        myAvatarElement.innerHTML = '';
        const img = document.createElement('img');
        img.src = userPhotoUrl;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '50%';
        img.style.objectFit = 'cover';
        img.onerror = function() {
            myAvatarElement.textContent = userName.charAt(0).toUpperCase();
            myAvatarElement.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
        };
        myAvatarElement.appendChild(img);
    } else if (myAvatarElement) {
        myAvatarElement.textContent = userName.charAt(0).toUpperCase();
        myAvatarElement.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
    }
    
    // Rakibin profil resmini doğru karta yerleştir
    const opponentAvatarElement = opponentAvatar.querySelector('[id$="Avatar"]');
    if (opponentAvatarElement && gameState.opponentPhotoUrl) {
        opponentAvatarElement.innerHTML = '';
        const img = document.createElement('img');
        img.src = gameState.opponentPhotoUrl;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '50%';
        img.style.objectFit = 'cover';
        img.onerror = function() {
            opponentAvatarElement.textContent = gameState.opponentName ? gameState.opponentName.charAt(0).toUpperCase() : 'R';
            opponentAvatarElement.style.background = 'linear-gradient(135deg, #f093fb, #f5576c)';
        };
        opponentAvatarElement.appendChild(img);
    } else if (opponentAvatarElement) {
        opponentAvatarElement.textContent = gameState.opponentName ? gameState.opponentName.charAt(0).toUpperCase() : 'R';
        opponentAvatarElement.style.background = 'linear-gradient(135deg, #f093fb, #f5576c)';
    }
}

socket.on('gameOver', (data) => {
    // Timer sunucu tarafında durduruldu
    const isWin = data.winner === gameState.playerColor;
    const eloChange = data.eloChange || 0;
    
    // Şeffaf overlay oluştur
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(5px);
    `;
    
    const messageBox = document.createElement('div');
    messageBox.style.cssText = `
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
        padding: 40px;
        border-radius: 20px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        border: 2px solid rgba(255, 255, 255, 0.1);
        max-width: 400px;
        animation: slideIn 0.5s ease-out;
    `;
    
    const title = isWin ? '🎉 TEBRİKLER! KAZANDINIZ! 🎉' : '😔 MALESEF KAYBETTİNİZ!';
    const eloText = eloChange > 0 ? `+${eloChange} Elo` : eloChange < 0 ? `${eloChange} Elo` : '';
    const eloColor = eloChange > 0 ? '#4ade80' : eloChange < 0 ? '#f87171' : '#fff';
    
    messageBox.innerHTML = `
        <h2 style="margin: 0 0 20px 0; font-size: 1.8em;">${title}</h2>
        <div style="font-size: 1.5em; font-weight: bold; color: ${eloColor}; margin: 15px 0;">
            ${eloText}
        </div>
        <div style="font-size: 1.1em; opacity: 0.9;">
            Yeni Elo: ${data.newElo || 'Bilinmiyor'}
        </div>
    `;
    
    overlay.appendChild(messageBox);
    document.body.appendChild(overlay);
    
    // 4 saniye sonra kaldır ve oyunu sıfırla
    setTimeout(() => {
        overlay.remove();
        resetGame();
    }, 4000);
});

socket.on('opponentLeft', (data) => {
    // Rakip oyundan çıktığında bildirim göster
    const message = data.message || 'Rakip oyundan ayrıldı!';
    
    // Custom notification göster
    showCustomNotification(message, 'success');
    
    // Elo puanı değişikliği varsa göster
    if (data.eloChange) {
        const eloText = data.eloChange > 0 ? 
            `+${data.eloChange} Elo puanı kazandınız! 🎉` : 
            `${data.eloChange} Elo puanı kaybettiniz 😔`;
        
        setTimeout(() => {
            showCustomNotification(eloText, data.eloChange > 0 ? 'success' : 'error');
        }, 2000);
    }
    
    // 3 saniye sonra lobiyi göster
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
socket.on('leaderboardUpdate', (leaderboard) => {
    updateLeaderboardDisplay(leaderboard);
    
    // Admin panelindeki liderlik tablosunu da güncelle
    const adminLeaderboardEl = document.getElementById('adminLeaderboard');
    if (adminLeaderboardEl) {
        if (leaderboard.length === 0) {
            adminLeaderboardEl.innerHTML = '<p style="color: #999; text-align: center;">Liderlik tablosu boş</p>';
        } else {
            const leaderboardHTML = leaderboard.map((player, index) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(255,255,255,0.05); margin: 5px 0; border-radius: 5px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-weight: bold; color: #ffd700;">#${index + 1}</span>
                        <div>
                            <strong>${player.userName}</strong><br>
                            <small style="color: #999;">${player.userId} | Elo: ${player.elo}</small>
                        </div>
                    </div>
                    <button class="btn danger" style="padding: 5px 10px; font-size: 0.8em;" onclick="deleteFromLeaderboard('${player.userId}')">Sil</button>
                </div>
            `).join('');
            adminLeaderboardEl.innerHTML = leaderboardHTML;
        }
    }
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
    // gameState.opponentUserId = data.opponentUserId || null; // Kaldırıldı
    gameState.opponentLevel = data.opponentLevel || 1;
    gameState.opponentElo = data.opponentElo || 0;
    gameState.afkCount = 0;
    
    // Oyun arayüzünü göster
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('leaderboard').style.display = 'none';
    document.getElementById('game').style.display = 'block';
    
    updatePlayerNames();
    renderBoard();
    
    // Sunucuya hazır olduğumuzu bildir (TAHTAYLA BİRLİKTE)
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
function showCustomNotification(message, type = 'info', duration = 3000) {
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
    
    // Belirtilen süre sonra bildirimi gizle
    setTimeout(() => {
        hideCustomNotification();
    }, duration);
}

function hideCustomNotification() {
    const notification = document.getElementById('customNotification');
    if (notification) {
        notification.style.display = 'none';
    }
}
