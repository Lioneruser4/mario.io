// main.js - İstemci Tarafı Dama Mantığı

// ... (Bağlantı ve DOM elementleri önceki gibi)

let currentBoard = [];
let myColor = null; // 'R' veya 'B'
let selectedPiece = null; // { r, c }
let validMoves = [];

// DOM Elementleri
const gameBoardElement = document.getElementById('game-board');

// --- SOCKET.IO OYUN GÜNCELLEMELERİ ---
socket.on('matchmaking:found', (data) => {
    // Kırmızı veya Siyah olduğumuzu öğren
    myColor = data.playerColors[myPlayerId]; 
    showGameView(data.roomCode);
});

socket.on('game:update', (data) => {
    currentBoard = data.board;
    myTurn = (data.turnId === myPlayerId);
    
    updateTurnIndicator(myTurn, data.turnId, data.playerColors[data.turnId] === 'R' ? 'Kırmızı' : 'Siyah');
    renderBoard(currentBoard);
    
    // Eğer sıra bende ise ve taş seçili değilse, tüm geçerli hamleleri iste
    if (myTurn && !selectedPiece) {
        socket.emit('request:valid_moves', { roomCode: currentRoomCode });
    }
});

// --- TAHTA ETKİLEŞİMİ ---
gameBoardElement.addEventListener('click', (e) => {
    const tileElement = e.target.closest('.checker-tile');
    if (!tileElement || !myTurn) return;

    const r = parseInt(tileElement.dataset.r);
    const c = parseInt(tileElement.dataset.c);
    const piece = currentBoard[r][c];

    // 1. Kendi taşımı seçiyorum (Taş Seçimi)
    if (piece.startsWith(myColor)) {
        clearHighlights();
        selectedPiece = { r, c };
        tileElement.classList.add('selected-piece');
        
        // Sunucudan sadece bu taş için geçerli hamleleri iste
        socket.emit('request:piece_moves', { roomCode: currentRoomCode, piece: selectedPiece });
        return;
    }
    
    // 2. Geçerli Hamle Yapıyorum (Hedef Tıklama)
    if (selectedPiece && tileElement.classList.contains('highlight-valid')) {
        const move = {
            from: selectedPiece,
            to: { r, c },
            type: tileElement.dataset.moveType // 'move' veya 'jump'
        };
        
        socket.emit('game:play', { roomCode: currentRoomCode, move: move });
        clearHighlights();
        selectedPiece = null;
    }
});

// Sunucudan seçilen taşın geçerli hamlelerinin gelmesi
socket.on('valid_moves:response', (data) => {
    validMoves = data.moves;
    
    // 💡 Müşteri İsteği: Geçerli Hamleyi Renkle Gösterme
    validMoves.forEach(move => {
        const targetTile = document.querySelector(`.checker-tile[data-r="${move.to.r}"][data-c="${move.to.c}"]`);
        if (targetTile) {
            targetTile.classList.add('highlight-valid');
            targetTile.dataset.moveType = move.type;
        }
    });
});

// --- RENDER FONKSİYONLARI ---

function renderBoard(board) {
    gameBoardElement.innerHTML = ''; // Tahtayı temizle
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const tile = document.createElement('div');
            const isBlackSquare = (r + c) % 2 !== 0; // Siyah kareler
            
            tile.className = `checker-tile ${isBlackSquare ? 'black-square' : 'white-square'}`;
            tile.dataset.r = r;
            tile.dataset.c = c;
            
            const pieceCode = board[r][c];
            if (pieceCode !== 'E') {
                const pieceElement = document.createElement('div');
                pieceElement.className = `piece ${pieceCode.toLowerCase()}`;
                
                // Animasyonlu King görünümü
                if (pieceCode.endsWith('K')) {
                    pieceElement.classList.add('is-king');
                    pieceElement.textContent = '👑';
                }
                tile.appendChild(pieceElement);
            }
            gameBoardElement.appendChild(tile);
        }
    }
    // Eğer taş seçiliyse, seçilen tahtayı tekrar vurgula (yenileme sonrası kaybolmaması için)
    if (selectedPiece) {
        document.querySelector(`.checker-tile[data-r="${selectedPiece.r}"][data-c="${selectedPiece.c}"]`).classList.add('selected-piece');
    }
}

function clearHighlights() {
    document.querySelectorAll('.highlight-valid, .selected-piece').forEach(el => {
        el.classList.remove('highlight-valid', 'selected-piece');
        delete el.dataset.moveType;
    });
}
