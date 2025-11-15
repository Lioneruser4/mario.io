// game.js - İSTEMCİ JAVASCRIPT KODU

// Sunucu URL'sini otomatik olarak pencere konumundan al
const RENDER_URL = window.location.origin; 
const socket = io(RENDER_URL, {
    transports: ['websocket'],
    upgrade: false,             
    secure: true
});

// --- DOM Elementleri ---
const entryScreen = document.getElementById('entry-screen');
const gameDiv = document.getElementById('game');
const statusDiv = document.getElementById('status');
const boardDiv = document.getElementById('board');
const turnIndicator = document.getElementById('turnIndicator');
const playerNameDisplay = document.getElementById('player-name');
const opponentNameDisplay = document.getElementById('opponentNameDisplay');
const myNameDisplay = document.getElementById('myNameDisplay');

const rankedBtn = document.getElementById('rankedBtn');
const showRoomOptionsBtn = document.getElementById('showRoomOptionsBtn');
const leaveBtn = document.getElementById('leaveBtn');

const roomOptionsOverlay = document.getElementById('roomOptionsOverlay');
const createOverlay = document.getElementById('createOverlay');
const currentRoomCode = document.getElementById('currentRoomCode')?.querySelector('span');
const joinOverlay = document.getElementById('joinOverlay');
const roomIdInput = document.getElementById('roomIdInput');
const myCard = document.getElementById('my-card');
const opponentCard = document.getElementById('opponent-card');
const matchmakingOverlay = document.getElementById('matchmakingOverlay');

let currentRoomId = null;
let playerRole = null; // 'player1' (Black) veya 'player2' (White)
let currentBoard = null;
let currentTurn = null;
let currentUsername = null; 
let selectedPiece = null; // {row, col}
let possibleMoves = []; // Sunucudan gelen hamle listesi [{row, col}, ...]

// --- Kullanıcı Adı Yönetimi ---
function generateGuestName() {
    return `Guest${Math.floor(Math.random() * 900) + 100}`;
}

function checkAndSetUsername() {
    const urlParams = new URLSearchParams(window.location.search);
    const tgUsername = urlParams.get('username'); 
    const tgId = urlParams.get('id'); 
    
    if (tgUsername) {
        currentUsername = `@${tgUsername}`;
    } else if (tgId) {
        currentUsername = `User_${tgId}`;
    } else {
        currentUsername = generateGuestName(); 
    }
    playerNameDisplay.textContent = `Oyuncu: ${currentUsername}`;
}
checkAndSetUsername(); 

// --- Yardımcı Fonksiyonlar ---

function toggleOverlay(overlayElement, show) {
    document.querySelectorAll('.sub-screen-overlay').forEach(overlay => {
        if(overlay !== overlayElement) overlay.classList.remove('active');
    });

    if (show) {
        overlayElement.classList.add('active');
        entryScreen.classList.remove('active');
        gameDiv.classList.remove('active');
        setEntryButtons(false);
    } else {
        overlayElement.classList.remove('active');
        
        if (!gameDiv.classList.contains('active') && !matchmakingOverlay.classList.contains('active')) {
            entryScreen.classList.add('active');
            if(socket.connected) setEntryButtons(true);
        }
    }
}

function setEntryButtons(enabled) {
    rankedBtn.disabled = !enabled;
    showRoomOptionsBtn.disabled = !enabled;
}

function clearSelections() {
    selectedPiece = null;
    possibleMoves = [];
    document.querySelectorAll('.piece.selected').forEach(p => p.classList.remove('selected'));
    document.querySelectorAll('.square.possible-move').forEach(s => s.classList.remove('possible-move'));
}

function resetGame() {
    currentRoomId = null; playerRole = null; currentBoard = null; currentTurn = null;
    clearSelections();
    
    gameDiv.classList.remove('active');
    entryScreen.classList.add('active');
    
    turnIndicator.textContent = 'Sıra: Bekleniyor...';
    boardDiv.classList.remove('player2-view');
    opponentCard.classList.remove('active-turn');
    myCard.classList.remove('active-turn');
    opponentNameDisplay.innerHTML = 'Rakip Bekleniyor';
    myNameDisplay.innerHTML = `${currentUsername} (Taşlar: ?)`;
    
    document.querySelectorAll('.sub-screen-overlay').forEach(o => o.classList.remove('active'));

    if(socket.connected) setEntryButtons(true);
}

function updateTurn(turn) {
    currentTurn = turn;
    const isMyTurn = playerRole === turn;
    
    turnIndicator.textContent = isMyTurn ? 'SIRA SİZDE! 🟢' : 'Rakibinizin sırası... 🔴';

    if (isMyTurn) {
        myCard.classList.add('active-turn');
        opponentCard.classList.remove('active-turn');
    } else {
        myCard.classList.remove('active-turn');
        opponentCard.classList.add('active-turn');
    }
}

function highlightMoves(moves) {
    document.querySelectorAll('.square.possible-move').forEach(s => s.classList.remove('possible-move'));
    
    moves.forEach(move => {
        const square = document.querySelector(`[data-row="${move.row}"][data-col="${move.col}"]`);
        if (square) {
            square.classList.add('possible-move');
        }
    });
}

// --- Tahta Çizim ve Etkileşim ---

function updateBoard(board, forcedSelection = null) {
    currentBoard = board;
    boardDiv.innerHTML = '';
    
    let tempSelected = forcedSelection ? forcedSelection : (selectedPiece || null);
    clearSelections(); 

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const square = document.createElement('div');
            const isDark = (r + c) % 2 === 1; 
            square.className = `square ${isDark ? 'dark' : 'light'}`;
            square.dataset.row = r;
            square.dataset.col = c;
            
            // Sadece koyu karelere olay dinleyicisi ekle
            if(isDark) {
                square.addEventListener('click', handleSquareClick);
            } 
            
            const pieceType = board[r][c];
            if (pieceType !== 0) {
                const piece = document.createElement('div');
                let pieceClass = '';
                let isKing = false;

                if (pieceType === 1 || pieceType === 3) pieceClass = 'black'; 
                if (pieceType === 2 || pieceType === 4) pieceClass = 'white'; 
                if (pieceType === 3 || pieceType === 4) isKing = true;
                
                const kingIcon = isKing ? '<i class="fas fa-crown"></i>' : '';

                piece.className = `piece ${pieceClass} ${isKing ? 'king' : ''}`;
                piece.innerHTML = kingIcon;
                
                // Taşa da olay dinleyicisi ekle
                piece.addEventListener('click', handlePieceClick);
                
                // Seçimi koru (Özellikle zincirleme yeme için)
                if (tempSelected && tempSelected.row === r && tempSelected.col === c) {
                     piece.classList.add('selected');
                     selectedPiece = tempSelected; 
                     // Zincirleme varsa, hamleleri tekrar iste
                     if(forcedSelection) {
                         socket.emit('getPossibleMoves', { roomId: currentRoomId, from: selectedPiece });
                     }
                }

                square.appendChild(piece);
            }
            boardDiv.appendChild(square);
        }
    }
    // Zincirleme olmadan da seçili taşın hamlelerinin gösterimi için
    if(selectedPiece && !forcedSelection) {
        // Hamle listesi mevcutsa tekrar göster. (Hamle yapmak için seçili taşa tıklanmadıysa)
        highlightMoves(possibleMoves); 
    }
}

function handlePieceClick(event) {
    event.stopPropagation();
    
    const piece = event.currentTarget;
    const square = piece.parentElement;
    const clickedPos = { row: parseInt(square.dataset.row), col: parseInt(square.dataset.col) };
    const pieceType = currentBoard[clickedPos.row][clickedPos.col];
    
    // Taşın oyuncunun taşı olup olmadığını kontrol et
    const isMyPiece = (playerRole === 'player1' && (pieceType === 1 || pieceType === 3)) ||
                     (playerRole === 'player2' && (pieceType === 2 || pieceType === 4));
    
    if (currentTurn === playerRole && isMyPiece) {
        if (selectedPiece && selectedPiece.row === clickedPos.row && selectedPiece.col === clickedPos.col) {
            // Aynı taşa tekrar tıklandı: Seçimi kaldır.
            clearSelections();
        } else {
            // Yeni bir taş seçildi: Seçimi temizle, yenisini seç, hamleleri iste.
            clearSelections();
            selectedPiece = clickedPos;
            piece.classList.add('selected');
            
            // Sunucudan mümkün hamleleri iste (KRİTİK)
            socket.emit('getPossibleMoves', { roomId: currentRoomId, from: clickedPos });
        }
    } else {
        // Sıra bende değilse veya benim taşım değilse, seçimi temizle
        clearSelections();
    }
}

function handleSquareClick(event) {
    const square = event.currentTarget;
    const target = { row: parseInt(square.dataset.row), col: parseInt(square.dataset.col) };
    
    if (!square.classList.contains('dark')) return; 
    
    // Tıklanan karenin, sunucudan gelen mümkün hamleler listesinde olup olmadığını kontrol et (KRİTİK)
    const isPossible = possibleMoves.some(move => move.row === target.row && move.col === target.col);

    if (selectedPiece && isPossible) {
        // Mümkün bir kareye tıklandı: Hamleyi sunucuya gönder
        socket.emit('move', { 
            roomId: currentRoomId, 
            from: selectedPiece, 
            to: target 
        });
        // Hamle gönderildikten sonra görsel gecikmeyi önlemek için seçimi hemen kaldırabiliriz.
        clearSelections();
    } else {
        // Seçili taş yoksa veya geçersiz bir yere tıklandıysa, seçimi kaldır (Taş seçimi yanlışsa zaten uyarı sunucudan gelir)
        clearSelections();
    }
}

// --- SOCKET OLAYLARI ---

socket.on('connect', () => {
    statusDiv.textContent = '✅ Sunucuya bağlanıldı.';
    statusDiv.classList.remove('error');
    socket.emit('playerIdentity', { username: currentUsername });
    resetGame();
});

socket.on('readyToPlay', () => {
    statusDiv.textContent = '✅ Hazır. Bir oyun seçin.';
    setEntryButtons(true);
});

socket.on('connect_error', (err) => {
    statusDiv.textContent = `❌ Bağlantı hatası: Sunucuya ulaşılamıyor. Hata: ${err.message}`;
    statusDiv.classList.add('error');
    setEntryButtons(false);
});

socket.on('possibleMoves', (moves) => {
    possibleMoves = moves; // Sunucudan gelen hamleleri kaydet (KRİTİK)
    highlightMoves(moves); // Kareleri yeşil yak
});

socket.on('gameStart', (data) => {
    entryScreen.classList.remove('active');
    gameDiv.classList.add('active');
    
    document.querySelectorAll('.sub-screen-overlay').forEach(o => o.classList.remove('active'));

    playerRole = data.player1Id === socket.id ? 'player1' : 'player2';
    
    const isPlayer1 = playerRole === 'player1';
    const myColor = isPlayer1 ? 'Siyah' : 'Beyaz';
    const opponentName = isPlayer1 ? data.player2Name : data.player1Name;
    const myName = isPlayer1 ? data.player1Name : data.player2Name;
    const opponentColor = isPlayer1 ? 'Beyaz' : 'Siyah';

    myNameDisplay.innerHTML = `<i class="fas fa-chess-pawn"></i> ${myName} (${myColor} Taşlar)`;
    opponentNameDisplay.innerHTML = `<i class="fas fa-user-circle"></i> ${opponentName} (${opponentColor} Taşlar)`;
    
    updateBoard(data.board);
    updateTurn(data.turn);

    if (!isPlayer1) {
        boardDiv.classList.add('player2-view');
    } else {
        boardDiv.classList.remove('player2-view');
    }
});

socket.on('boardUpdate', (data) => {
    if (data.chained) {
         statusDiv.textContent = 'ZİNCİRLEME YEME! Aynı taşla devam edin.';
         // Zincirleme yeme varsa, yenen taş silinir ve yeni pozisyon seçili olarak updateBoard çağrılır.
         updateBoard(data.board, data.to); 
    } else {
         clearSelections();
         updateBoard(data.board, null); 
    }
    updateTurn(data.turn);
});

socket.on('invalidMove', (data) => {
    alert("Geçersiz Hamle: " + data.message);
    // Hamle başarısızsa tahtanın son halini tekrar çizer (seçili taş kaybolmasın diye)
    updateBoard(currentBoard, selectedPiece); 
});

socket.on('gameOver', (data) => {
    const isMe = data.winner === playerRole;
    alert(`OYUN BİTTİ! ${isMe ? 'TEBRİKLER! Oyunu Kazandınız! 🎉' : 'Üzgünüm, Oyunu Kaybettiniz. 😔'} Sebep: ${data.reason}`);
    resetGame();
});

socket.on('opponentDisconnected', (message) => {
    alert(message);
    resetGame();
});

socket.on('gameLeft', () => {
     alert('Oyundan başarıyla ayrıldınız.');
     resetGame();
});

socket.on('matchMakingStatus', (message) => {
     document.getElementById('matchmakingStatusText').textContent = message;
});

socket.on('matchFound', (data) => {
    toggleOverlay(matchmakingOverlay, false);
    currentRoomId = data.roomId;
    playerRole = data.role;
    statusDiv.textContent = `Eşleşme bulundu! Oyun yükleniyor... 🎉`;
});


// --- BUTON OLAYLARI ---

document.getElementById('rankedBtn').addEventListener('click', () => {
    toggleOverlay(matchmakingOverlay, true);
    document.getElementById('matchmakingStatusText').textContent = 'Eşleşme aranıyor...';
    socket.emit('findRankedMatch');
});

document.getElementById('showRoomOptionsBtn').addEventListener('click', () => {
    toggleOverlay(roomOptionsOverlay, true);
});

document.getElementById('createGameBtn').addEventListener('click', () => {
    toggleOverlay(roomOptionsOverlay, false);
    toggleOverlay(createOverlay, true);
    if(currentRoomCode) currentRoomCode.textContent = '....'; 

    socket.emit('createGame', (response) => {
        if (response.success) {
            currentRoomId = response.roomId;
            playerRole = response.role;
            if(currentRoomCode) currentRoomCode.textContent = currentRoomId; 
            document.getElementById('createStatus').textContent = 'Rakip bekleniyor... (Oda Kodu: ' + currentRoomId + ')';
        } else {
            if(currentRoomCode) currentRoomCode.textContent = 'HATA';
            document.getElementById('createStatus').textContent = 'Oda kurulamadı: ' + response.message;
        }
    });
});

document.getElementById('showJoinBtn').addEventListener('click', () => {
    toggleOverlay(roomOptionsOverlay, false);
    toggleOverlay(joinOverlay, true);
    if(roomIdInput) roomIdInput.value = '';
});

document.getElementById('joinBtn').addEventListener('click', () => {
    const roomId = roomIdInput.value.trim();
    if (roomId.length !== 4) {
        alert('Lütfen 4 haneli bir oda kodu girin.');
        return;
    }
    toggleOverlay(joinOverlay, false);
    
    socket.emit('joinGame', { roomId: roomId }, (response) => {
        if (!response.success) {
            alert('Hata: ' + response.message);
            resetGame();
        } else {
            currentRoomId = response.roomId;
            playerRole = response.role;
        }
    });
});


document.getElementById('cancelRoomOptionsBtn')?.addEventListener('click', () => toggleOverlay(roomOptionsOverlay, false));
document.getElementById('cancelJoinBtn')?.addEventListener('click', () => toggleOverlay(joinOverlay, false));

document.getElementById('cancelCreateBtn')?.addEventListener('click', () => {
     if (currentRoomId) socket.emit('leaveGame', { roomId: currentRoomId });
     resetGame(); 
});

document.getElementById('cancelRankedBtn')?.addEventListener('click', () => {
    socket.emit('cancelMatchmaking');
    toggleOverlay(matchmakingOverlay, false);
});

document.getElementById('leaveBtn')?.addEventListener('click', () => {
    if (currentRoomId) {
        socket.emit('leaveGame', { roomId: currentRoomId });
    } else {
        resetGame();
    }
});

// Başlangıçta tahtayı boş çiz
updateBoard(Array(8).fill(0).map(() => Array(8).fill(0)));
