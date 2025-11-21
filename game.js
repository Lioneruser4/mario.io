const socket = io();
let roomCode = null;
let playerColor = null;
let board = [];
let selectedPiece = null;
let validMoves = [];
let currentTurn = null;

// Menü göster
function showMenu() {
    document.getElementById('menu').style.display = 'block';
    document.getElementById('game').style.display = 'none';
    document.getElementById('searching').style.display = 'none';
}

// Oyun göster
function showGame() {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('game').style.display = 'block';
    document.getElementById('searching').style.display = 'none';
}

// Arama ekranı
function showSearching() {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('game').style.display = 'none';
    document.getElementById('searching').style.display = 'block';
}

// Mesaj göster
function showMessage(msg) {
    document.getElementById('status').textContent = msg;
}

// Socket olayları
socket.on('matchFound', (data) => {
    roomCode = data.roomCode;
    playerColor = data.color;
    showGame();
    updatePlayerInfo();
    showMessage(`Eşleşme bulundu! Sen ${data.color === 'red' ? 'Kırmızı' : 'Beyaz'} oyuncusun.`);
});

socket.on('searchStatus', (data) => {
    document.querySelector('#searching .status').textContent = data.message;
});

socket.on('searchCancelled', () => {
    showMenu();
});

socket.on('roomCreated', (data) => {
    roomCode = data.roomCode;
    playerColor = 'red';
    showMessage(`Oda oluşturuldu! Kod: ${data.roomCode}`);
});

socket.on('opponentJoined', (data) => {
    showGame();
    updatePlayerInfo();
    showMessage('Rakip katıldı! Oyun başlıyor...');
});

socket.on('gameUpdate', (data) => {
    board = data.board;
    currentTurn = data.currentTurn;
    renderBoard();
    updateTurnInfo();
});

socket.on('gameOver', (data) => {
    const winner = data.winner === playerColor ? 'Sen kazandın!' : 'Rakip kazandı!';
    showMessage(`Oyun bitti! ${winner}`);
    setTimeout(() => {
        roomCode = null;
        playerColor = null;
        showMenu();
    }, 3000);
});

socket.on('error', (message) => {
    showMessage(`Hata: ${message}`);
});

// Oyuncu bilgisini güncelle
function updatePlayerInfo() {
    document.getElementById('playerInfo').textContent = `Oyuncu: ${playerColor === 'red' ? 'Kırmızı' : 'Beyaz'}`;
    document.getElementById('roomInfo').textContent = `Oda: ${roomCode}`;
}

// Sıra bilgisini güncelle
function updateTurnInfo() {
    document.getElementById('turnInfo').textContent = `Sıra: ${currentTurn === 'red' ? 'Kırmızı' : 'Beyaz'}`;
}

// Tahtayı oluştur
function renderBoard() {
    const boardElement = document.getElementById('board');
    boardElement.innerHTML = '';

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const cell = createCell(row, col);
            boardElement.appendChild(cell);
        }
    }
}

// Hücre oluştur
function createCell(row, col) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.className += (row + col) % 2 === 0 ? ' white' : ' black';
    
    cell.dataset.row = row;
    cell.dataset.col = col;

    // Geçerli hamle göster
    if (validMoves.some(move => move.to.r === row && move.to.c === col)) {
        cell.classList.add('valid-move');
    }

    // Seçili taşı göster
    if (selectedPiece && selectedPiece.r === row && selectedPiece.c === col) {
        cell.classList.add('selected');
    }

    // Taşı ekle
    const pieceValue = board[row][col];
    if (pieceValue !== 0) {
        const piece = createPiece(pieceValue);
        cell.appendChild(piece);
    }

    cell.addEventListener('click', () => handleCellClick(row, col));
    
    return cell;
}

// Taş oluştur
function createPiece(value) {
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

// Hücre tıklama
function handleCellClick(row, col) {
    if (currentTurn !== playerColor) {
        showMessage('Sıra sende değil!');
        return;
    }

    const pieceValue = board[row][col];
    const piecePlayer = getPiecePlayer(pieceValue);
    
    // Boş hücre ve seçili taş varsa
    if (pieceValue === 0 && selectedPiece) {
        const validMove = validMoves.find(move => 
            move.to.r === row && move.to.c === col
        );
        
        if (validMove) {
            makeMove(selectedPiece, { r: row, c: col });
        } else {
            showMessage('Geçersiz hamle!');
        }
    }
    // Kendi taşına tıklandı
    else if (piecePlayer === playerColor) {
        selectPiece(row, col);
    }
    // Rakip taşına tıklandı
    else {
        selectedPiece = null;
        validMoves = [];
        renderBoard();
    }
}

// Taş seç
function selectPiece(row, col) {
    selectedPiece = { r: row, c: col };
    validMoves = getValidMoves(row, col);
    renderBoard();
}

// Taşın sahibini bul
function getPiecePlayer(value) {
    if (value === 1 || value === 3) return 'red';
    if (value === 2 || value === 4) return 'white';
    return null;
}

// Geçerli hamleleri bul
function getValidMoves(row, col) {
    const piece = board[row][col];
    const isKing = piece === 3 || piece === 4;
    const moves = [];
    
    // Zıplama hamleleri (zorunlu)
    const jumps = getJumps(row, col, isKing);
    if (jumps.length > 0) return jumps;
    
    // Normal hamleler
    const directions = isKing ? 
        [[-1, -1], [-1, 1], [1, -1], [1, 1]] :
        playerColor === 'red' ? 
            [[1, -1], [1, 1]] : 
            [[-1, -1], [-1, 1]];
    
    for (const [dr, dc] of directions) {
        const newRow = row + dr;
        const newCol = col + dc;
        
        if (isValidCell(newRow, newCol) && board[newRow][newCol] === 0) {
            moves.push({ 
                from: { r: row, c: col }, 
                to: { r: newRow, c: newCol } 
            });
        }
    }
    
    return moves;
}

// Zıplama hamleleri
function getJumps(row, col, isKing) {
    const jumps = [];
    
    const directions = isKing ? 
        [[-1, -1], [-1, 1], [1, -1], [1, 1]] :
        playerColor === 'red' ? 
            [[1, -1], [1, 1]] : 
            [[-1, -1], [-1, 1]];
    
    for (const [dr, dc] of directions) {
        const capturedRow = row + dr;
        const capturedCol = col + dc;
        const landRow = row + 2 * dr;
        const landCol = col + 2 * dc;
        
        if (isValidCell(landRow, landCol) && board[landRow][landCol] === 0) {
            const capturedPiece = board[capturedRow][capturedCol];
            const capturedPlayer = getPiecePlayer(capturedPiece);
            
            if (capturedPlayer && capturedPlayer !== playerColor) {
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

// Hücre geçerli mi
function isValidCell(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

// Hamle yap
function makeMove(from, to) {
    socket.emit('makeMove', {
        roomCode: roomCode,
        from: from,
        to: to
    });
    
    selectedPiece = null;
    validMoves = [];
}

// Fonksiyonlar
function findMatch() {
    showSearching();
    socket.emit('findMatch');
}

function cancelSearch() {
    socket.emit('cancelSearch');
}

function createRoom() {
    socket.emit('createRoom', {});
}

function joinRoom() {
    const code = document.getElementById('roomCode').value.trim();
    if (!code) {
        showMessage('Oda kodu girin!');
        return;
    }
    socket.emit('joinRoom', { roomCode: code });
}

function leaveGame() {
    if (roomCode) {
        socket.emit('leaveGame', { roomCode: roomCode });
    }
    roomCode = null;
    playerColor = null;
    showMenu();
}

// Başlangıç
showMenu();
