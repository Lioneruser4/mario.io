const socket = io("https://mario-io-1.onrender.com", { 
  transports: ["websocket"],
  timeout: 30000
});

let board = null;
let selected = null;
let myColor = null;
let myTurn = false;
let flipped = false;
let canEatPieces = []; // Yeme mümkün olan taşlar (parlayacak)

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
let cellSize = 0;

// Resize
function resizeCanvas() {
  const size = Math.min(window.innerWidth * 0.92, window.innerHeight * 0.72);
  canvas.width = canvas.height = size;
  cellSize = size / 8;
  drawBoard();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Koordinat dönüşümü
function realToScreen(x, y) { return flipped ? { x: 7 - x, y: 7 - y } : { x, y }; }
function screenToReal(x, y) { return flipped ? { x: 7 - x, y: 7 - y } : { x, y }; }

// Tahta çiz
function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const screen = realToScreen(x, y);
      const isLight = (x + y) % 2 === 0;
      ctx.fillStyle = isLight ? "#f4e4bc" : "#b58863";
      ctx.fillRect(screen.x * cellSize, screen.y * cellSize, cellSize, cellSize);

      // Seçili taş
      if (selected && selected.x === x && selected.y === y) {
        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 10;
        ctx.strokeRect(screen.x * cellSize + 8, screen.y * cellSize + 8, cellSize - 16, cellSize - 16);
      }

      const piece = board[y][x];
      if (!piece) continue;

      const isWhite = piece === 1 || piece === 2;
      const isKing = piece === 2 || piece === 4;

      // YEME MÜMKÜN İSE PARLA
      const canEat = canEatPieces.some(p => p.x === x && p.y === y);
      if (canEat && myTurn) {
        ctx.shadowColor = "#ff0000";
        ctx.shadowBlur = 40;
      }

      // Taş gövde
      ctx.fillStyle = isWhite ? "#ffffff" : "#1e1e1e";
      ctx.beginPath();
      ctx.arc(
        screen.x * cellSize + cellSize / 2,
        screen.y * cellSize + cellSize / 2,
        cellSize * 0.38,
        0, Math.PI * 2
      );
      ctx.fill();
      ctx.strokeStyle = isWhite ? "#000" : "#fff";
      ctx.lineWidth = 6;
      ctx.stroke();

      // Kral tacı
      if (isKing) {
        ctx.fillStyle = "#ffd700";
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 30;
        ctx.font = `bold ${cellSize * 0.4}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("K", screen.x * cellSize + cellSize / 2, screen.y * cellSize + cellSize / 2 + 5);
      }

      ctx.shadowBlur = 0;
    }
  }

  // Geçerli hamleler
  if (selected && myTurn) {
    const moves = getValidMoves(selected.x, selected.y);
    moves.forEach(move => {
      const s = realToScreen(move.x, move.y);
      ctx.fillStyle = "rgba(0, 255, 255, 0.5)";
      ctx.beginPath();
      ctx.arc(s.x * cellSize + cellSize / 2, s.y * cellSize + cellSize / 2, cellSize * 0.25, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

// Geçerli hamleler (yeme yok, sadece boş kare)
function getValidMoves(x, y) {
  const moves = [];
  const piece = board[y][x];
  if (!piece) return moves;

  const isWhite = piece === 1 || piece === 2;
  const isKing = piece === 2 || piece === 4;
  const dirs = isKing 
    ? [[-1,-1],[-1,1],[1,-1],[1,1]] 
    : (isWhite ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]);

  // Yeme mümkünse kaydet (parlatmak için)
  canEatPieces = [];
  dirs.forEach(([dy, dx]) => {
    const nx = x + dx, ny = y + dy;
    const ex = x + dx * 2, ey = y + dy * 2;
    if (ex >= 0 && ex < 8 && ey >= 0 && ey < 8 && 
        board[ny][nx] && board[ny][nx] !== piece && 
        board[ey][ex] === 0) {
      canEatPieces.push({ x, y });
    }
  });

  // Normal hareket
  dirs.forEach(([dy, dx]) => {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny][nx] === 0) {
      moves.push({ x: nx, y: ny });
    }
  });

  return moves;
}

// Tıklama
function handleClick(e) {
  if (!myTurn) return;
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const sx = Math.floor((clientX - rect.left) / cellSize);
  const sy = Math.floor((clientY - rect.top) / cellSize);
  const pos = screenToReal(sx, sy);

  if (pos.x < 0 || pos.x > 7 || pos.y < 0 || pos.y > 7) return;

  const piece = board[pos.y][pos.x];
  const isMine = (myColor === "white" && (piece === 1 || piece === 2)) ||
                 (myColor === "black" && (piece === 3 || piece === 4));

  if (isMine) {
    selected = pos;
  } else if (selected) {
    const moves = getValidMoves(selected.x, selected.y);
    if (moves.some(m => m.x === pos.x && m.y === pos.y)) {
      socket.emit("move", { from: selected, to: pos });
      selected = null;
    } else {
      selected = null;
    }
  } else {
    selected = null;
  }
  drawBoard();
}

canvas.addEventListener("click", handleClick);
canvas.addEventListener("touchend", handleClick);

// Socket
socket.on("connect", () => {
  document.querySelector(".status-text").textContent = "Bağlandı!";
  document.querySelector(".status-icon").style.background = "#00ff00";
});

socket.on("gameStart", data => {
  board = data.board;
  myColor = data.color;
  myTurn = data.turn === data.color;
  flipped = data.flipped || false;
  
  document.getElementById("lobby").classList.remove("active");
  document.getElementById("gameScreen").classList.add("active");
  
  updateTurnDisplay();
  drawBoard();
});

socket.on("boardUpdate", data => {
  board = data.board;
  myTurn = data.turn === myColor;
  flipped = data.flipped || false;
  updateTurnDisplay();
  drawBoard();
});

function updateTurnDisplay() {
  const myBox = document.getElementById("myTurnBox");
  const oppBox = document.getElementById("oppTurnBox");
  const myText = document.getElementById("myTurnText");
  const oppText = document.getElementById("oppTurnText");

  if (myTurn) {
    myBox.classList.add("active");
    oppBox.classList.remove("active");
    myText.textContent = "SENİN SIRAN";
    oppText.textContent = "RAKİP BEKLİYOR";
  } else {
    myBox.classList.remove("active");
    oppBox.classList.add("active");
    myText.textContent = "SEN BEKLİYORSUN";
    oppText.textContent = "RAKİBİN SIRASI";
  }
}

// Butonlar
document.getElementById("rankedBtn").onclick = () => socket.emit("findMatch");
document.getElementById("createRoomBtn").onclick = () => socket.emit("createRoom");
document.getElementById("joinToggle").onclick = () => document.getElementById("joinSection").classList.toggle("hidden");
document.getElementById("joinBtn").onclick = () => {
  const code = document.getElementById("roomInput").value.trim();
  if (code.length === 4) socket.emit("joinRoom", code);
};
document.getElementById("copyBtn").onclick = () => {
  navigator.clipboard.writeText(document.getElementById("roomCode").textContent);
  alert("Kod kopyalandı!");
};
document.getElementById("cancelBtn").onclick = () => location.reload();
document.getElementById("leaveGame").onclick = () => location.reload();
