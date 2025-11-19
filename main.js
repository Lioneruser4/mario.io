const socket = io("https://mario-io-1.onrender.com", {
  transports: ['websocket'],
  timeout: 20000
});

let gameState = {
  board: null,
  selected: null,
  myColor: null,
  myTurn: false,
  roomId: null
};

const canvas = document.getElementById('gameBoard');
const ctx = canvas.getContext('2d');
let cellSize = 80;

// DOM Elements
const statusEl = document.getElementById('status');
const lobbyEl = document.getElementById('lobby');
const gameScreenEl = document.getElementById('gameScreen');
const turn1El = document.getElementById('turn1');
const turn2El = document.getElementById('turn2');

// Canvas Resize
function resizeCanvas() {
  const size = Math.min(window.innerWidth * 0.95, window.innerHeight * 0.65);
  canvas.width = canvas.height = size;
  cellSize = size / 8;
  drawBoard();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Board Drawing
function drawBoard() {
  if (!gameState.board) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      // Tahta kareleri
      const isLight = (x + y) % 2 === 0;
      ctx.fillStyle = isLight ? '#f4e4bc' : '#d8b589';
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      
      // Seçili kare
      if (gameState.selected && gameState.selected.x === x && gameState.selected.y === y) {
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 8;
        ctx.strokeRect(x * cellSize + 4, y * cellSize + 4, cellSize - 8, cellSize - 8);
      }
      
      // Taş çiz
      const piece = gameState.board[y][x];
      if (piece !== 0) {
        const isWhite = piece === 1 || piece === 2;
        const isKing = piece === 2 || piece === 4;
        
        // Taş gövdesi
        ctx.fillStyle = isWhite ? '#ffffff' : '#2d1b14';
        ctx.beginPath();
        ctx.arc(
          x * cellSize + cellSize / 2,
          y * cellSize + cellSize / 2,
          cellSize * 0.4,
          0, Math.PI * 2
        );
        ctx.fill();
        ctx.strokeStyle = isWhite ? '#333' : '#fff';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Vazi işareti
        if (isKing) {
          ctx.fillStyle = '#ffd700';
          ctx.font = `${cellSize * 0.35}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('👑', x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
        }
      }
    }
  }
  
  // Geçerli hamleler
  if (gameState.selected && gameState.myTurn) {
    const moves = getValidMoves(gameState.selected.x, gameState.selected.y);
    moves.forEach(move => {
      ctx.fillStyle = 'rgba(0, 255, 136, 0.5)';
      ctx.beginPath();
      ctx.arc(
        move.x * cellSize + cellSize / 2,
        move.y * cellSize + cellSize / 2,
        cellSize * 0.25,
        0, Math.PI * 2
      );
      ctx.fill();
    });
  }
}

function getValidMoves(x, y) {
  const moves = [];
  const piece = gameState.board[y][x];
  if (!piece) return moves;
  
  const isWhite = piece === 1 || piece === 2;
  const dir = isWhite ? 1 : -1; // Beyaz aşağı, siyah yukarı
  const isKing = piece === 2 || piece === 4;
  
  const directions = isKing ? [[1,1],[1,-1],[-1,1],[-1,-1]] : [[dir,1],[dir,-1]];
  
  directions.forEach(([dy, dx]) => {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && gameState.board[ny][nx] === 0) {
      moves.push({x: nx, y: ny});
    }
  });
  
  return moves;
}

// Touch/Mouse Handler
function getBoardPos(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.floor((clientX - rect.left) / cellSize),
    y: Math.floor((clientY - rect.top) / cellSize)
  };
}

['click', 'touchend'].forEach(event => {
  canvas.addEventListener(event, e => {
    e.preventDefault();
    if (!gameState.myTurn) return;
    
    const pos = getBoardPos(
      e.touches?.[0]?.clientX || e.clientX,
      e.touches?.[0]?.clientY || e.clientY
    );
    
    if (pos.x < 0 || pos.x > 7 || pos.y < 0 || pos.y > 7) return;
    
    const piece = gameState.board[pos.y][pos.x];
    const isMyPiece = (gameState.myColor === 'white' && (piece === 1 || piece === 2)) ||
                     (gameState.myColor === 'black' && (piece === 3 || piece === 4));
    
    if (gameState.selected && gameState.selected.x === pos.x && gameState.selected.y === pos.y) {
      gameState.selected = null;
    } else if (isMyPiece) {
      gameState.selected = pos;
    } else if (gameState.selected) {
      const moves = getValidMoves(gameState.selected.x, gameState.selected.y);
      const validMove = moves.find(m => m.x === pos.x && m.y === pos.y);
      if (validMove) {
        socket.emit('move', { from: gameState.selected, to: pos });
        gameState.selected = null;
      }
    }
    
    drawBoard();
  });
});

// Socket Events
socket.on('connect', () => {
  statusEl.textContent = '✅ Bağlandı!';
  statusEl.style.background = 'rgba(0,255,136,0.3)';
  statusEl.style.borderColor = '#00ff88';
});

socket.on('connect_error', (err) => {
  statusEl.textContent = '❌ Bağlantı Hatası!';
  statusEl.style.background = 'rgba(255,0,85,0.3)';
});

socket.on('roomCreated', (data) => {
  document.getElementById('displayCode').textContent = data.room;
  document.getElementById('roomCreated').classList.remove('hidden');
  document.getElementById('searching').classList.add('hidden');
});

socket.on('roomError', (msg) => {
  alert(msg);
  location.reload();
});

socket.on('startGame', (data) => {
  gameState.myColor = data.color;
  gameState.board = data.board;
  gameState.myTurn = data.turn === data.color;
  gameState.roomId = data.room;
  
  lobbyEl.classList.add('hidden');
  gameScreenEl.classList.remove('hidden');
  
  document.getElementById('player1').querySelector('span').textContent = 
    gameState.myColor === 'white' ? 'Sen (Alt)' : 'Sen (Üst)';
  
  updateTurnIndicators();
  drawBoard();
});

socket.on('updateBoard', (data) => {
  gameState.board = data.board;
  gameState.myTurn = data.turn === gameState.myColor;
  updateTurnIndicators();
  drawBoard();
});

// UI Events
document.getElementById('rankedBtn').onclick = () => {
  document.getElementById('searching').classList.remove('hidden');
  socket.emit('findMatch');
};

document.getElementById('createBtn').onclick = () => {
  socket.emit('createRoom');
};

document.getElementById('joinToggle').onclick = () => {
  document.getElementById('joinForm').classList.toggle('hidden');
};

document.getElementById('joinBtn').onclick = () => {
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (code.length === 4) {
    socket.emit('joinRoom', code);
  }
};

document.getElementById('copyBtn').onclick = () => {
  navigator.clipboard.writeText(document.getElementById('displayCode').textContent);
  alert('✅ Kodu kopyaladın!');
};

document.getElementById('cancelBtn').onclick = () => {
  socket.emit('cancelMatch');
  location.reload();
};

document.getElementById('leaveBtn').onclick = () => {
  location.reload();
};

function updateTurnIndicators() {
  turn1El.classList.toggle('active', gameState.myTurn && gameState.myColor === 'white');
  turn2El.classList.toggle('active', gameState.myTurn && gameState.myColor === 'black');
}
