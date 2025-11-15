// Oyun durumu
const gameState = {
    board: [],
    currentPlayer: 'black', // Siyah başlar
    selectedPiece: null,
    validMoves: [],
    isGameOver: false,
    winner: null
};

// Oyun tahtasını oluştur
function initializeBoard() {
    const board = [];
    // 8x8'lik boş tahta oluştur
    for (let row = 0; row < 8; row++) {
        board[row] = [];
        for (let col = 0; col < 8; col++) {
            // Sadece siyah karelere taş yerleştirilebilir
            if ((row + col) % 2 === 1) {
                // İlk 3 sıraya siyah taşlar
                if (row < 3) {
                    board[row][col] = { type: 'black', isKing: false };
                } 
                // Son 3 sıraya beyaz taşlar
                else if (row > 4) {
                    board[row][col] = { type: 'white', isKing: false };
                } else {
                    board[row][col] = null; // Boş kare
                }
            } else {
                board[row][col] = null; // Beyaz kareler boş kalacak
            }
        }
    }
    return board;
}

// Oyun tahtasını çiz
function renderBoard() {
    const boardElement = document.getElementById('board');
    boardElement.innerHTML = '';
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
            square.dataset.row = row;
            square.dataset.col = col;
            
            // Geçerli hamleleri vurgula
            const isPossibleMove = gameState.validMoves.some(move => 
                move.to.row === row && move.to.col === col
            );
            
            if (isPossibleMove) {
                square.classList.add('possible-move');
            }
            
            // Taşları yerleştir
            const piece = gameState.board[row][col];
            if (piece) {
                const pieceElement = document.createElement('div');
                pieceElement.className = `piece ${piece.type} ${piece.isKing ? 'king' : ''}`;
                
                // Seçili taşı vurgula
                if (gameState.selectedPiece && 
                    gameState.selectedPiece.row === row && 
                    gameState.selectedPiece.col === col) {
                    pieceElement.classList.add('selected');
                }
                
                // Kral taşını işaretle
                if (piece.isKing) {
                    const kingIcon = document.createElement('i');
                    kingIcon.className = 'fas fa-crown';
                    pieceElement.appendChild(kingIcon);
                }
                
                square.appendChild(pieceElement);
            }
            
            square.addEventListener('click', () => handleSquareClick(row, col));
            boardElement.appendChild(square);
        }
    }
}

// Kareye tıklandığında
function handleSquareClick(row, col) {
    // Oyun bittiyse işlem yapma
    if (gameState.isGameOver) return;
    
    const piece = gameState.board[row][col];
    
    // Eğer tıklanan karede kendi taşın varsa
    if (piece && piece.type === gameState.currentPlayer) {
        selectPiece(row, col);
    } 
    // Eğer geçerli bir hamle karesine tıklandıysa
    else if (gameState.selectedPiece) {
        const move = gameState.validMoves.find(m => 
            m.to.row === row && m.to.col === col
        );
        
        if (move) {
            makeMove(move);
        }
    }
}

// Taş seçme
function selectPiece(row, col) {
    gameState.selectedPiece = { row, col };
    gameState.validMoves = getValidMoves(row, col);
    renderBoard();
}

// Geçerli hamleleri bul
function getValidMoves(row, col) {
    const piece = gameState.board[row][col];
    if (!piece) return [];
    
    const moves = [];
    const directions = [
        { dr: -1, dc: -1 }, // Sol üst
        { dr: -1, dc: 1 },  // Sağ üst
        { dr: 1, dc: -1 },  // Sol alt
        { dr: 1, dc: 1 }    // Sağ alt
    ];
    
    // Normal taşlar sadece ileri gidebilir (siyahlar aşağı, beyazlar yukarı)
    // Krallar her yöne gidebilir
    for (const dir of directions) {
        // Normal taşlar için yön kontrolü
        if (!piece.isKing) {
            if ((piece.type === 'black' && dir.dr <= 0) || 
                (piece.type === 'white' && dir.dr >= 0)) {
                continue;
            }
        }
        
        const newRow = row + dir.dr;
        const newCol = col + dir.dc;
        
        // Tahta sınırlarını kontrol et
        if (newRow < 0 || newRow >= 8 || newCol < 0 || newCol >= 8) continue;
        
        // Boş kareye hamle yapılabilir
        if (!gameState.board[newRow][newCol]) {
            moves.push({
                from: { row, col },
                to: { row: newRow, col: newCol },
                captured: null
            });
        }
        // Rakip taşı varsa ve arkası boşsa yeme hamlesi yapılabilir
        else if (gameState.board[newRow][newCol].type !== piece.type) {
            const jumpRow = newRow + dir.dr;
            const jumpCol = newCol + dir.dc;
            
            if (jumpRow >= 0 && jumpRow < 8 && jumpCol >= 0 && jumpCol < 8 && 
                !gameState.board[jumpRow][jumpCol]) {
                moves.push({
                    from: { row, col },
                    to: { row: jumpRow, col: jumpCol },
                    captured: { row: newRow, col: newCol }
                });
            }
        }
    }
    
    return moves;
}

// Hamle yap
function makeMove(move) {
    const { from, to, captured } = move;
    const piece = gameState.board[from.row][from.col];
    
    // Taşı yeni konumuna taşı
    gameState.board[to.row][to.col] = { ...piece };
    gameState.board[from.row][from.col] = null;
    
    // Eğer taş yenmişse kaldır
    if (captured) {
        gameState.board[captured.row][captured.col] = null;
    }
    
    // Eğer taş son sıraya ulaştıysa kral yap
    if ((piece.type === 'black' && to.row === 7) || 
        (piece.type === 'white' && to.row === 0)) {
        gameState.board[to.row][to.col].isKing = true;
    }
    
    // Sıra diğer oyuncuya geçer
    gameState.currentPlayer = gameState.currentPlayer === 'black' ? 'white' : 'black';
    gameState.selectedPiece = null;
    gameState.validMoves = [];
    
    // Oyunun bitip bitmediğini kontrol et
    checkGameOver();
    
    // Tahtayı güncelle
    renderBoard();
    
    // Sıra kimde göster
    updateTurnIndicator();
}

// Oyunun bitip bitmediğini kontrol et
function checkGameOver() {
    let blackPieces = 0;
    let whitePieces = 0;
    let blackHasMoves = false;
    let whiteHasMoves = false;
    
    // Taş sayılarını ve hamle yapma durumlarını kontrol et
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = gameState.board[row][col];
            if (piece) {
                if (piece.type === 'black') {
                    blackPieces++;
                    if (getValidMoves(row, col).length > 0) {
                        blackHasMoves = true;
                    }
                } else {
                    whitePieces++;
                    if (getValidMoves(row, col).length > 0) {
                        whiteHasMoves = true;
                    }
                }
            }
        }
    }
    
    // Oyun bitiş koşulları
    if (blackPieces === 0 || !blackHasMoves) {
        gameState.isGameOver = true;
        gameState.winner = 'white';
    } else if (whitePieces === 0 || !whiteHasMoves) {
        gameState.isGameOver = true;
        gameState.winner = 'black';
    }
    
    // Eğer oyun bittiyse bildir
    if (gameState.isGameOver) {
        setTimeout(() => {
            alert(`Oyun bitti! Kazanan: ${gameState.winner === 'black' ? 'Siyah' : 'Beyaz'}`);
        }, 100);
    }
}

// Sıra göstergesini güncelle
function updateTurnIndicator() {
    const turnIndicator = document.getElementById('turnIndicator');
    if (gameState.isGameOver) {
        turnIndicator.textContent = `Oyun bitti! Kazanan: ${gameState.winner === 'black' ? 'Siyah' : 'Beyaz'}`;
    } else {
        turnIndicator.textContent = `Sıra: ${gameState.currentPlayer === 'black' ? 'Siyah' : 'Beyaz'}`;
    }
}

// Yeni oyun başlat
function startNewGame() {
    gameState.board = initializeBoard();
    gameState.currentPlayer = 'black';
    gameState.selectedPiece = null;
    gameState.validMoves = [];
    gameState.isGameOver = false;
    gameState.winner = null;
    
    renderBoard();
    updateTurnIndicator();
}

// Sayfa yüklendiğinde oyunu başlat
document.addEventListener('DOMContentLoaded', () => {
    // Oyun ekranını göster
    document.getElementById('entry-screen').classList.remove('active');
    document.getElementById('game').classList.add('active');
    
    // Yeni oyun başlat
    startNewGame();
    
    // Yeni oyun butonu
    const newGameBtn = document.createElement('button');
    newGameBtn.textContent = 'Yeni Oyun';
    newGameBtn.className = 'main-btn';
    newGameBtn.style.marginTop = '20px';
    newGameBtn.addEventListener('click', startNewGame);
    document.querySelector('.player-info-card').appendChild(newGameBtn);
});
