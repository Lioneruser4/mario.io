// game.js
// Bu kod, tarayıcıda çalışır.

// ⚠️ Node.js sunucunuzun bu adreste çalıştığından emin olun.
const SERVER_URL = 'https://mario-io-1.onrender.com/'; 
const socket = io(SERVER_URL);

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
const createGameBtn = document.getElementById('createGameBtn');
const showJoinBtn = document.getElementById('showJoinBtn');
const leaveBtn = document.getElementById('leaveBtn');

const roomOptionsOverlay = document.getElementById('roomOptionsOverlay');
const createOverlay = document.getElementById('createOverlay');
const currentRoomCode = document.getElementById('currentRoomCode').querySelector('span');
const joinOverlay = document.getElementById('joinOverlay');
const roomIdInput = document.getElementById('roomIdInput');
const joinBtn = document.getElementById('joinBtn');
const matchmakingOverlay = document.getElementById('matchmakingOverlay');
const myCard = document.getElementById('my-card');
const opponentCard = document.getElementById('opponent-card');
const matchmakingStatusText = document.getElementById('matchmakingStatusText');


let currentRoomId = null;
let playerRole = null;
let currentBoard = null;
let currentTurn = null;
let currentUsername = null; 
let selectedPiece = null; 
let possibleMoves = []; 

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

// --- Ekran Kontrolü ve YARDIMCI FONKSİYONLAR ---
function setEntryButtons(enabled) {
    rankedBtn.disabled = !enabled;
    showRoomOptionsBtn.disabled = !enabled;
}

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

function resetGame() {
    currentRoomId = null;
    playerRole = null;
    currentBoard = null;
    currentTurn = null;
    selectedPiece = null;
    possibleMoves = [];
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

    if(socket.connected) {
        setEntryButtons(true);
    }
}

function clearSelections() {
    selectedPiece = null;
    possibleMoves = [];
    document.querySelectorAll('.piece.selected').forEach(p => p.classList.remove('selected'));
    document.querySelectorAll('.square.possible-move').forEach(s => s.classList.remove('possible-move'));
}

function updateBoard(board, forcedSelection = null) {
    currentBoard = board;
    boardDiv.innerHTML = '';
    
    // Eğer zorunlu seçim varsa (zincirleme vurma), mevcut seçimi koru.
    const tempSelected = forcedSelection || selectedPiece;
    clearSelections();

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const square = document.createElement('div');
            const isDark = (r + c) % 2 !== 0; 
            square.className = `square ${isDark ? 'dark' : 'light'}`;
            square.dataset.row = r;
            square.dataset.col = c;
            square.addEventListener('click', handleSquareClick);
            
            const pieceType = board[r][c];
            if (pieceType !== 0) {
                const piece = document.createElement('div');
                let pieceClass = '';
                let isKing = false;

                if (pieceType === 1 || pieceType === 3) pieceClass = 'black'; // Siyah (P1)
                if (pieceType === 2 || pieceType === 4) pieceClass = 'white'; // Beyaz (P2)
                if (pieceType === 3 || pieceType === 4) isKing = true;
                
                const kingIcon = isKing ? '<i class="fas fa-crown"></i>' : '';

                piece.className = `piece ${pieceClass} ${isKing ? 'king' : ''}`;
                piece.innerHTML = kingIcon;
                piece.addEventListener('click', handlePieceClick);
                
                // Seçili taşı yeniden işaretle
                if (tempSelected && tempSelected.row === r && tempSelected.col === c) {
                     piece.classList.add('selected');
                     selectedPiece = tempSelected; // Seçili taşı geri yükle
                }

                square.appendChild(piece);
            }
            boardDiv.appendChild(square);
        }
    }
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

function handlePieceClick(event) {
    event.stopPropagation(); // Square click olayını engelle
    
    const piece = event.currentTarget;
    const square = piece.parentElement;
    const clickedPos = { row: parseInt(square.dataset.row), col: parseInt(square.dataset.col) };
    const pieceType = currentBoard[clickedPos.row][clickedPos.col];
    
    const isMyPiece = (playerRole === 'player1' && (pieceType === 1 || pieceType === 3)) ||
                     (playerRole === 'player2' && (pieceType === 2 || pieceType === 4));
    
    if (currentTurn === playerRole && isMyPiece) {
        if (selectedPiece && selectedPiece.row === clickedPos.row && selectedPiece.col === clickedPos.col) {
            // Aynı taşa tekrar tıklandı: Seçimi kaldır
            clearSelections();
        } else {
            // Yeni bir taş seçildi: Sunucudan geçerli hamleleri iste
            clearSelections();
            selectedPiece = clickedPos;
            piece.classList.add('selected');
            
            // Sunucuya geçerli hamleleri sorma
            socket.emit('getPossibleMoves', { roomId: currentRoomId, from: clickedPos });
        }
    } else {
        clearSelections();
    }
}

function handleSquareClick(event) {
    const square = event.currentTarget;
    const target = { row: parseInt(square.dataset.row), col: parseInt(square.dataset.col) };

    // Eğer bir taş seçiliyse ve tıklanan kare geçerli hamlelerden biriyse
    const isPossible = possibleMoves.some(move => move.row === target.row && move.col === target.col);

    if (selectedPiece && isPossible) {
        // Hamle isteğini sunucuya gönder
        socket.emit('move', { 
            roomId: currentRoomId, 
            from: selectedPiece, 
            to: target 
        });
        // Hamle yapıldıktan sonra yerel seçimi kaldır
        clearSelections(); 
    } else {
        // Geçerli hamle olmayan yere tıklandıysa, seçimi kaldır.
        clearSelections();
    }
}

// --- SOCKET BAĞLANTILARI ---

socket.on('connect', () => {
    statusDiv.textContent = '✅ Sunucuya bağlanıldı.';
    statusDiv.classList.remove('error');
    statusDiv.classList.add('green');
    socket.emit('playerIdentity', { username: currentUsername });
    resetGame();
});

socket.on('readyToPlay', () => {
    statusDiv.textContent = '✅ Hazır. Bir oyun seçin.';
    setEntryButtons(true);
});

socket.on('connect_error', (err) => {
    statusDiv.textContent = `❌ Bağlantı hatası: Sunucuya ulaşılamıyor.`;
    statusDiv.classList.remove('green');
    statusDiv.classList.add('error');
    setEntryButtons(false);
});

socket.on('matchMakingStatus', (message) => {
    matchmakingStatusText.textContent = message;
});

socket.on('matchFound', (data) => {
    toggleOverlay(matchmakingOverlay, false);
    currentRoomId = data.roomId;
    playerRole = data.role;
    statusDiv.textContent = `Eşleşme bulundu! Oyun yükleniyor... 🎉`;
});

socket.on('gameStart', (data) => {
    entryScreen.classList.remove('active');
    gameDiv.classList.add('active');
    
    document.querySelectorAll('.sub-screen-overlay').forEach(o => o.classList.remove('active'));

    playerRole = data.player1Name === currentUsername ? 'player1' : 'player2';
    
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

socket.on('possibleMoves', (moves) => {
     possibleMoves = moves; 
     highlightMoves(moves);
});


socket.on('boardUpdate', (data) => {
    updateBoard(data.board, data.chained ? data.to : null);
    updateTurn(data.turn);

    if (data.chained) {
         statusDiv.textContent = 'ZİNCİRLEME VURMA! Aynı taşla devam edin.';
         const newSelectedPos = data.to;
         selectedPiece = newSelectedPos;
         // Yeni pozisyon için geçerli hamleleri tekrar iste
         socket.emit('getPossibleMoves', { roomId: currentRoomId, from: selectedPiece });
    } else {
         clearSelections();
    }
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

socket.on('invalidMove', (data) => {
    alert("Geçersiz Hamle: " + data.message);
    clearSelections(); 
});

// --- BUTON OLAYLARI (Lobi Kontrolleri) ---
rankedBtn.addEventListener('click', () => {
    toggleOverlay(matchmakingOverlay, true);
    matchmakingStatusText.textContent = 'Eşleşme aranıyor...';
    socket.emit('findRankedMatch');
});

showRoomOptionsBtn.addEventListener('click', () => {
    toggleOverlay(roomOptionsOverlay, true);
});

createGameBtn.addEventListener('click', () => {
    toggleOverlay(roomOptionsOverlay, false);
    toggleOverlay(createOverlay, true);
    currentRoomCode.textContent = '....'; 

    socket.emit('createGame', (response) => {
        if (response.success) {
            currentRoomId = response.roomId;
            playerRole = response.role;
            currentRoomCode.textContent = currentRoomId; 
            document.getElementById('createStatus').textContent = 'Rakip bekleniyor... (Oda Kodu: ' + currentRoomId + ')';
        } else {
            currentRoomCode.textContent = 'HATA';
            document.getElementById('createStatus').textContent = 'Oda kurulamadı: ' + response.message;
        }
    });
});

showJoinBtn.addEventListener('click', () => {
    toggleOverlay(roomOptionsOverlay, false);
    toggleOverlay(joinOverlay, true);
    roomIdInput.value = '';
});

joinBtn.addEventListener('click', () => {
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


document.getElementById('cancelRoomOptionsBtn').addEventListener('click', () => toggleOverlay(roomOptionsOverlay, false));
document.getElementById('cancelJoinBtn').addEventListener('click', () => toggleOverlay(joinOverlay, false));

document.getElementById('cancelCreateBtn').addEventListener('click', () => {
     if (currentRoomId) socket.emit('leaveGame', { roomId: currentRoomId });
     resetGame(); 
});

document.getElementById('cancelRankedBtn').addEventListener('click', () => {
    socket.emit('cancelMatchmaking');
    toggleOverlay(matchmakingOverlay, false);
});

leaveBtn.addEventListener('click', () => {
    if (currentRoomId) {
        socket.emit('leaveGame', { roomId: currentRoomId });
    } else {
        resetGame();
    }
});


// İlk tahtayı çiz
updateBoard(Array(8).fill(0).map(() => Array(8).fill(0)));
