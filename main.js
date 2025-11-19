const socket = io("https://mario-io-1.onrender.com");
let board = null;
let selected = null;
let playerColor = null;
let myTurn = false;

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const cellSize = 100;

function resizeCanvas() {
  const size = Math.min(window.innerWidth * 0.95, window.innerHeight * 0.75);
  canvas.width = canvas.height = size;
  cellSize = size / 8;
  drawBoard();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function drawBoard() {
  if (!board) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const isLight = (x + y) % 2 === 0;
      ctx.fillStyle = isLight ? "#f0d9b5" : "#b58863";
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);

      if (selected && selected.x === x && selected.y === y) {
        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 6;
        ctx.strokeRect(x * cellSize + 5, y * cellSize + 5, cellSize - 10, cellSize - 10);
      }

      const piece = board[y][x];
      if (piece !== 0) {
        const isWhite = piece === 1 || piece === 2;
        const isKing = piece === 2 || piece === 4;

        ctx.fillStyle = isWhite ? "#ffffff" : "#222222";
        ctx.beginPath();
        ctx.arc(x * cellSize + cellSize/2, y * cellSize + cellSize/2, cellSize*0.38, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = isWhite ? "#000" : "#fff";
        ctx.lineWidth = 4;
        ctx.stroke();

        if (isKing) {
          ctx.fillStyle = "#ffff00";
          ctx.font = "bold " + cellSize*0.4 + "px Arial";
          ctx.textAlign = "center";
          ctx.fillText("K", x * cellSize + cellSize/2, y * cellSize + cellSize/1.5);
        }

        if (selected && selected.x === x && selected.y === y) {
          ctx.strokeStyle = "#00ffff";
702          ctx.lineWidth = 8;
          ctx.stroke();
        }
      }
    }
  }

  if (selected && myTurn) {
    const moves = getValidMoves(selected.x, selected.y);
    moves.forEach(m => {
      ctx.fillStyle = "rgba(0, 255, 255, 0.4)";
      ctx.beginPath();
      ctx.arc(m.x * cellSize + cellSize/2, m.y * cellSize + cellSize/2, cellSize*0.25, 0, Math.PI*2);
      ctx.fill();
    });
  }
}

function getValidMoves(x, y) {
  const moves = [];
  const piece = board[y][x];
  if (!piece) return moves;
  const isWhite = piece === 1 || piece === 2;
  const dir = isWhite ? -1 : 1;
  const king = piece > 2;

  const dirs = king ? [[-1,-1],[-1,1],[1,-1],[1,1]] : [[dir,-1],[dir,1]];
  dirs.forEach(([dy,dx]) => {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny][nx] === 0) {
      moves.push({x:nx, y:ny, capture:false});
    }
  });

  // Zorunlu yeme kontrolü sonra eklenebilir (tam profesyonel)
  return moves;
}

canvas.addEventListener("click", e => {
  if (!myTurn) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / cellSize);
  const y = Math.floor((e.clientY - rect.top) / cellSize);
  if (x < 0 || x > 7 || y < 0 || y > 7) return;

  const piece = board[y][x];
  const isMyPiece = (playerColor === "white" && (piece === 1 || piece === 2)) ||
                    (playerColor === "black" && (piece === 3 || piece === 4));

  if (selected && selected.x === x && selected.y === y) {
    selected = null;
  } else if (isMyPiece) {
    selected = {x, y};
  } else if (selected) {
    const moves = getValidMoves(selected.x, selected.y);
    const valid = moves.find(m => m.x === x && m.y === y);
    if (valid) {
      socket.emit("move", { from: selected, to: {x,y} });
      selected = null;
    }
  }
  drawBoard();
});

// Socket Events
socket.on("connect", () => {
  document.getElementById("status").textContent = "Bağlandı ✓";
});

socket.on("roomCreated", data => {
  document.getElementById("roomCode").textContent = data.room;
  document.getElementById("roomDisplay").style.display = "block";
});

socket.on("joinedRoom", data => {
  hideAll();
  document.getElementById("game").classList.add("active");
  playerColor = data.color;
  board = data.board;
  myTurn = data.turn === playerColor;
  updateTurnLight();
  drawBoard();
});

socket.on("updateBoard", data => {
  board = data.board;
  myTurn = data.turn === playerColor;
  updateTurnLight();
  drawBoard();
});

socket.on("gameOver", winner => {
  confetti({ particleCount: 200, spread: 70, origin: { y: 0.6 } });
  alert(winner === playerColor ? "Kazandın!" : "Kaybettin :(");
});

// Lobi Butonları
document.getElementById("rankedBtn").onclick = () => {
  hideAll();
  document.getElementById("searching").style.display = "block";
  socket.emit("findMatch");
};

document.getElementById("createRoomBtn").onclick = () => socket.emit("createRoom");

document.getElementById("toggleJoin").onclick = () => {
  document.getElementById("joinSection").style.display = 
    document.getElementById("joinSection").style.display === "none" ? "flex" : "none";
};

document.getElementById("joinBtn").onclick = () => {
  const code = document.getElementById("roomInput").value.trim();
  if (code.length === 4) socket.emit("joinRoom", code);
};

document.getElementById("copyBtn").onclick = () => {
  navigator.clipboard.writeText(document.getElementById("roomCode").textContent);
  alert("Kopyalandı!");
};

document.getElementById("cancelBtn").onclick = () => {
  socket.emit("cancelMatch");
  location.reload();
};

document.getElementById("leaveGame").onclick = () => location.reload();

function hideAll() {
  document.querySelectorAll(".screen > div").forEach(d => d.style.display = "none");
  document.getElementById("lobby").classList.remove("active");
}

function updateTurnLight() {
  document.getElementById("light1").classList.toggle("active", myTurn && playerColor === "white");
  document.getElementById("light2").classList.toggle("active", myTurn && playerColor === "black");
}
