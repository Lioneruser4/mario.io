// game.js - Şaşki Online - Tam Profesyonel Türk Daması (2025)
const socket = io("https://mario-io-1.onrender.com", { transports: ["websocket"] });

let board = null;
let selectedPiece = null;
let validMoves = [];
let currentTurn = 'black';
let myColor = null;
let roomId = null;
let isMyTurn = false;
let timerInterval = null;
let timeLeft = 30;

const boardEl = document.getElementById('board');
const lobbyScreen = document.getElementById('lobby');
const gameScreen = document.getElementById('gameScreen');
const statusEl = document.getElementById('connectionStatus');
const playerLight = document.getElementById('playerLight');
const opponentLight = document.getElementById('opponentLight');
const timerEl = document.getElementById('gameTimer');
const resultOverlay = document.getElementById('gameResult');
const resultText = document.getElementById('resultText');

// Sesler
const moveSound = document.getElementById('moveSound');
const captureSound = document.getElementById('captureSound');
const winSound = document.getElementById('winSound');

// === BAĞLANTI DURUMU ===
socket.on('connect', () => {
  statusEl.textContent = "Bağlandı! Hazır.";
  statusEl.style.color = "#00ff00";
});

socket.on('disconnect', () => {
  statusEl.textContent = "Bağlantı koptu... Yeniden bağlanıyor.";
  statusEl.style.color = "#ff0000";
});

socket.on('connect_error', () => {
  statusEl.textContent = "Sunucuya bağlanılamıyor...";
  statusEl.style.color = "#ff0066";
});

// === LOBİ BUTONLARI ===
document.getElementById('rankedBtn').onclick = () => {
  socket.emit('ranked');
  showSearching();
};

document.getElementById('createRoomBtn').onclick = () => {
  socket.emit('create_room');
};

document.getElementById('joinBtn').onclick = () => {
  const code = document.getElementById('roomInput').value.trim();
  if (code.length === 4 && /^\d{4}$/.test(code)) {
    socket.emit('join_room', code);
  } else {
    showCustomNotification("Lütfen 4 haneli oda kodunu gir!");
  }
};

document.getElementById('copyBtn').onclick = () => {
  navigator.clipboard.writeText(document.getElementById('roomCode').textContent);
  const btn = document.getElementById('copyBtn');
  btn.textContent = "Kopyalandı!";
  setTimeout(() => btn.textContent = "Kopyala", 1500);
};

document.getElementById('leaveRoomBtn').onclick = leaveRoom;
document.getElementById('cancelSearchBtn').onclick = () => {
  socket.emit('cancel_search');
  hideSearching();
  statusEl.textContent = "Eşleşme iptal edildi.";
};

// === SOKET OLAYLARI ===
socket.on('room_created', (code) => {
  roomId = code;
  document.getElementById('roomCode').textContent = code;
  document.getElementById('roomPanel').classList.remove('hidden');
  statusEl.textContent = `Oda oluşturuldu: ${code}`;
});

socket.on('match_found', (data) => {
  roomId = data.roomId;
  myColor = data.color;
  hideSearching();
  startGame(data.board || createInitialBoard(), 'black');
});

socket.on('start_game', (data) => {
  roomId = data.roomId || roomId;
  myColor = data.yourColor || (data.players.indexOf(socket.id) === 0 ? 'black' : 'white');
  hideRoomPanel();
  startGame(data.board, data.turn || 'black');
});

socket.on('error', (msg) => {
  showCustomNotification(msg);
  hideSearching();
});

socket.on('move', (data) => {
  applyMove(data.from, data.to, data.captured);
  if (data.captured) captureSound.play();
  else moveSound.play();
});

socket.on('game_over', (winner) => {
  endGame(winner === myColor ? "Kazandın!" : "Kaybettin!");
  winSound.play();
});

// === OYUN BAŞLAT ===
function startGame(initialBoard, turn) {
  board = JSON.parse(JSON.stringify(initialBoard));
  currentTurn = turn;
  lobbyScreen.classList.remove('active');
  gameScreen.classList.add('active');
  renderBoard();
  updateTurnLights();
  startTimer();
}

// === TAHTA OLUŞTUR ===
function createInitialBoard() {
  const b = Array(8).fill().map(() => Array(8).fill(null));
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        if (row < 3) b[row][col] = { color: 'white', king: false };
        if (row > 4) b[row][col] = { color: 'black', king: false };
      }
    }
  }
  return b;
}

function renderBoard() {
  boardEl.innerHTML = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if ((row + col) % 2 === 1) cell.classList.add('black');
      
      const piece = board[row][col];
      if (piece) {
        const p = document.createElement('div');
        p.className = `piece ${piece.color}`;
        if (piece.king) p.classList.add('king');
        p.dataset.row = row;
        p.dataset.col = col;
        p.onclick = () => selectPiece(row, col);
        cell.appendChild(p);
      }
      
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.onclick = () => tryMove(row, col);
      boardEl.appendChild(cell);
    }
  }
  highlightValidMoves();
}

// === TAŞ SEÇİM VE HAREKET ===
function selectPiece(row, col) {
  if (!isMyTurn) return;
  const piece = board[row][col];
  if (!piece || piece.color !== myColor) return;

  selectedPiece = { row, col };
  validMoves = calculateValidMoves(row, col);
  highlightValidMoves();
  
  // Çoklu yeme durumunda seçenek sun
  const canContinueCapture = validMoves.some(m => m.captured);
  if (canContinueCapture) {
    showContinueCaptureOptions(row, col);
  }
}

function tryMove(row, col) {
  if (!selectedPiece) return;

  const move = validMoves.find(m => m.to.row === row && m.to.col === col);
  if (!move) {
    selectedPiece = null;
    validMoves = [];
    renderBoard();
    return;
  }

  socket.emit('move', {
    roomId,
    from: selectedPiece,
    to: { row, col },
    captured: move.captured
  });

  applyMove(selectedPiece, { row, col }, move.captured);
  if (move.captured) captureSound.play();
  else moveSound.play();

  selectedPiece = null;
  validMoves = [];
  renderBoard();
}

function applyMove(from, to, captured) {
  const piece = board[from.row][from.col];
  board[to.row][to.col] = piece;
  board[from.row][from.col] = null;

  if (captured) {
    board[captured.row][captured.col] = null;
  }

  // Dama olma
  if ((to.row === 0 && piece.color === 'black') || (to.row === 7 && piece.color === 'white')) {
    piece.king = true;
  }

  currentTurn = currentTurn === 'black' ? 'white' : 'black';
  updateTurnLights();
  resetTimer();
  renderBoard();

  // Çoklu yeme kontrolü
  if (captured) {
    const nextMoves = calculateValidMoves(to.row, to.col);
    const nextCaptures = nextMoves.filter(m => m.captured);
    if (nextCaptures.length > 0) {
      // Aynı taşla devam edebilir
      selectedPiece = { row: to.row, col: to.col };
      validMoves = nextCaptures;
      highlightValidMoves();
      showContinueCaptureOptions(to.row, to.col);
      return;
    }
  }
  
  checkWin();
}

// Çoklu yeme seçeneklerini göster
function showContinueCaptureOptions(row, col) {
  // Önceki butonları kaldır
  const existingContinueBtn = document.getElementById('continueCaptureBtn');
  const existingFinishBtn = document.getElementById('finishCaptureBtn');
  if (existingContinueBtn) existingContinueBtn.remove();
  if (existingFinishBtn) existingFinishBtn.remove();
  
  // Oyun tahtasında bir buton veya seçenek göster
  const gameBoard = document.querySelector('.game-board');
  
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
    selectedPiece = null;
    validMoves = [];
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
  gameBoard.parentElement.style.position = 'relative';
  gameBoard.parentElement.appendChild(continueBtn);
  gameBoard.parentElement.appendChild(finishBtn);
}

// === GEÇERLİ HAMLELER (TÜRK DAMASI KURALLARI) ===
function calculateValidMoves(row, col) {
  const piece = board[row][col];
  if (!piece || piece.color !== currentTurn) return [];

  const moves = [];
  const directions = piece.king ? [[-1,-1],[-1,1],[1,-1],[1,1]] : (piece.color === 'black' ? [[1,-1],[1,1]] : [[-1,-1],[-1,1]]);

  let hasCapture = false;

  // Önce zorunlu yeme var mı kontrol et
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] && board[r][c].color === currentTurn) {
        if (hasCaptureMove(r, c)) hasCapture = true;
      }
    }
  }

  for (const [dr, dc] of directions) {
    const nr = row + dr;
    const nc = col + dc;

    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      if (!board[nr][nc]) {
        if (!hasCapture) {
          moves.push({ to: { row: nr, col: nc }, captured: null });
        }
      } else if (board[nr][nc].color !== currentTurn) {
        const jumpR = nr + dr;
        const jumpC = nc + dc;
        if (jumpR >= 0 && jumpR < 8 && jumpC >= 0 && jumpC < 8 && !board[jumpR][jumpC]) {
          moves.push({ to: { row: jumpR, col: jumpC }, captured: { row: nr, col: nc } });
        }
      }
    }
  }

  if (hasCapture) {
    return moves.filter(m => m.captured);
  }
  return moves;
}

function hasCaptureMove(row, col) {
  const piece = board[row][col];
  if (!piece) return false;
  const directions = piece.king ? [[-1,-1],[-1,1],[1,-1],[1,1]] : (piece.color === 'black' ? [[1,-1],[1,1]] : [[-1,-1],[-1,1]]);
  
  for (const [dr, dc] of directions) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] && board[nr][nc].color !== piece.color) {
      const jr = nr + dr;
      const jc = nc + dc;
      if (jr >= 0 && jr < 8 && jc >= 0 && jc < 8 && !board[jr][jc]) return true;
    }
  }
  return false;
}

function highlightValidMoves() {
  if (!selectedPiece) return;
  document.querySelectorAll('.cell').forEach(cell => {
    cell.classList.remove('valid', 'capture');
  });

  validMoves.forEach(move => {
    const cell = document.querySelector(`.cell[data-row="${move.to.row}"][data-col="${move.to.col}"]`);
    if (cell) {
      cell.classList.add(move.captured ? 'capture' : 'valid');
    }
  });
}

// === TUR VE TIMER ===
function updateTurnLights() {
  isMyTurn = currentTurn === myColor;
  playerLight.classList.toggle('active', isMyTurn);
  opponentLight.classList.toggle('active', !isMyTurn);
}

function startTimer() {
  clearInterval(timerInterval);
  timeLeft = 30;
  timerEl.textContent = timeLeft;
  timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = timeLeft;
    if (timeLeft <= 0 && isMyTurn) {
      socket.emit('timeout', roomId);
      endGame("Zaman doldu! Kaybettin.");
    }
  }, 1000);
}

function resetTimer() {
  clearInterval(timerInterval);
  startTimer();
}

// === KAZANMA KONTROLÜ ===
function checkWin() {
  let blackPieces = 0, whitePieces = 0;
  let blackCanMove = false, whiteCanMove = false;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) {
        if (p.color === 'black') {
          blackPieces++;
          if (calculateValidMoves(r, c).length > 0) blackCanMove = true;
        } else {
          whitePieces++;
          if (calculateValidMoves(r, c).length > 0) whiteCanMove = true;
        }
      }
    }
  }

  if (blackPieces === 0 || !blackCanMove) {
    socket.emit('game_over', { roomId, winner: 'white' });
  } else if (whitePieces === 0 || !whiteCanMove) {
    socket.emit('game_over', { roomId, winner: 'black' });
  }
}

function endGame(message) {
  clearInterval(timerInterval);
  // Önceki butonları kaldır
  const existingContinueBtn = document.getElementById('continueCaptureBtn');
  const existingFinishBtn = document.getElementById('finishCaptureBtn');
  if (existingContinueBtn) existingContinueBtn.remove();
  if (existingFinishBtn) existingFinishBtn.remove();
  
  resultText.textContent = message;
  resultOverlay.classList.remove('hidden');
}

// === YARDIMCI FONKSİYONLAR ===
function showSearching() {
  document.getElementById('searchPanel').classList.remove('hidden');
}
function hideSearching() {
  document.getElementById('searchPanel').classList.add('hidden');
}
function hideRoomPanel() {
  document.getElementById('roomPanel').classList.add('hidden');
}
function leaveRoom() {
  socket.emit('leave_room', roomId);
  location.reload();
}

// Custom notification fonksiyonu
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
    notification.style.display = 'none';
  }, 3000);
}

// Pes Et Butonu
document.getElementById('resignBtn').onclick = () => {
  if (confirm("Pes etmek istediğine emin misin?")) {
    socket.emit('resign', roomId);
    endGame("Pes ettin. Kaybettin.");
  }
};

// Lobiye Dön
document.getElementById('backToLobby').onclick = () => location.reload();

// Başlat
renderBoard();
