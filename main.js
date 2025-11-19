const socket = io("https://mario-io-1.onrender.com", { transports: ["websocket"] });

let board = null, selected = null, myColor = null, myTurn = false, flipped = false;
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
let cellSize;

function resize() {
  const size = Math.min(innerWidth * 0.95, innerHeight * 0.75);
  canvas.width = canvas.height = size;
  cellSize = size / 8;
  draw();
}
window.addEventListener("resize", resize);
resize();

function realToScreen(x, y) { return flipped ? { x: 7 - x, y: 7 - y } : { x, y }; }
function screenToReal(x, y) { return flipped ? { x: 7 - x, y: 7 - y } : { x, y }; }

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const s = realToScreen(x, y);
      ctx.fillStyle = (x + y) % 2 === 0 ? "#f0d9b5" : "#b58863";
      ctx.fillRect(s.x * cellSize, s.y * cellSize, cellSize, cellSize);

      if (selected && selected.x === x && selected.y === y) {
        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 8;
        ctx.strokeRect(s.x * cellSize + 6, s.y * cellSize + 6, cellSize - 12, cellSize - 12);
      }

      const piece = board[y][x];
      if (!piece) continue;

      const isWhite = piece === 1 || piece === 2;
      const isKing = piece === 2 || piece === 4;

      ctx.fillStyle = isWhite ? "#ffffff" : "#1a1a1a";
      ctx.beginPath();
      ctx.arc(s.x * cellSize + cellSize/2, s.y * cellSize + cellSize/2, cellSize * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isWhite ? "#000" : "#fff";
      ctx.lineWidth = 5;
      ctx.stroke();

      if (isKing) {
        ctx.fillStyle = "#ffd700";
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 20;
        ctx.font = `bold ${cellSize * 0.4}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("K", s.x * cellSize + cellSize/2, s.y * cellSize + cellSize/2 + 5);
        ctx.shadowBlur = 0;
      }
    }
  }

  if (selected && myTurn) {
    const moves = getValidMoves(selected.x, selected.y);
    moves.forEach(m => {
      const s = realToScreen(m.x, m.y);
      ctx.fillStyle = m.captures?.length > 0 ? "rgba(255,0,0,0.5)" : "rgba(0,255,255,0.5)";
      ctx.beginPath();
      ctx.arc(s.x * cellSize + cellSize/2, s.y * cellSize + cellSize/2, cellSize * 0.3, 0, Math.PI * 2);
      ctx.fill();

      if (m.captures?.length > 0) {
        const fromS = realToScreen(selected.x, selected.y);
        ctx.strokeStyle = "#ff0000";
        ctx.lineWidth = 6;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(fromS.x * cellSize + cellSize/2, fromS.y * cellSize + cellSize/2);
        ctx.lineTo(s.x * cellSize + cellSize/2, s.y * cellSize + cellSize/2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }
}

function getValidMoves(x, y) {
  const moves = [];
  const p = board[y][x];
  if (!p) return moves;
  const white = p === 1 || p === 2;
  const king = p === 2 || p === 4;
  const dirs = king ? [[-1,-1],[-1,1],[1,-1],[1,1]] : (white ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]);

  // Zorunlu yeme
  for (const [dy, dx] of dirs) {
    const mx = x + dx, my = y + dy;
    const tx = x + dx*2, ty = y + dy*2;
    if (tx >= 0 && tx < 8 && ty >= 0 && ty < 8 &&
        board[my] && board[my][mx] && (board[my][mx] === 3 || board[my][mx] === 4 ? white : !white) &&
        board[ty][tx] === 0) {
      moves.push({ x: tx, y: ty, captures: [{x: mx, y: my}] });
    }
  }
  if (moves.length > 0) return moves;

  // Normal hareket
  for (const [dy, dx] of dirs) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny][nx] === 0) {
      moves.push({ x: nx, y: ny, captures: [] });
    }
  }
  return moves;
}

function getClickPos(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const sx = Math.floor((clientX - rect.left) / cellSize);
  const sy = Math.floor((clientY - rect.top) / cellSize);
  return screenToReal(sx, sy);
}

["click", "touchend"].forEach(ev => {
  canvas.addEventListener(ev, e => {
    if (!myTurn) return;
    const pos = getClickPos(e);
    if (pos.x < 0 || pos.x > 7 || pos.y < 0 || pos.y > 7) return;

    const piece = board[pos.y][pos.x];
    const isMine = (myColor === "white" && (piece === 1 || piece === 2)) ||
                   (myColor === "black" && (piece === 3 || piece === 4));

    if (isMine) {
      selected = pos;
    } else if (selected) {
      const moves = getValidMoves(selected.x, selected.y);
      const valid = moves.find(m => m.x === pos.x && m.y === pos.y);
      if (valid) {
        socket.emit("move", { from: selected, to: pos });
        selected = null;
      } else {
        selected = null;
      }
    } else {
      selected = null;
    }
    draw();
  });
});

// Socket
socket.on("connect", () => document.getElementById("status").textContent = "Bağlandı!");
socket.on("searching", () => document.getElementById("searching").classList.remove("hidden"));
socket.on("roomCreated", code => {
  document.getElementById("roomCode").textContent = code;
  document.getElementById("roomCreated").classList.remove("hidden");
});
socket.on("errorMsg", msg => alert(msg));

socket.on("gameStart", data => {
  board = data.board;
  myColor = data.color;
  myTurn = data.turn === data.color;
  flipped = data.flipped || false;
  document.getElementById("lobby").classList.remove("active");
  document.getElementById("gameScreen").classList.add("active");
  updateLights();
  draw();
});

socket.on("boardUpdate", data => {
  board = data.board;
  myTurn = data.turn === myColor;
  flipped = data.flipped || false;
  updateLights();
  draw();
});

function updateLights() {
  const myActive = myTurn;
  document.getElementById("myLight").classList.toggle("active", myActive);
  document.getElementById("oppLight").classList.toggle("active", !myActive);
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
