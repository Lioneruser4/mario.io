const socket = io("https://mario-io-1.onrender.com", { transports: ["websocket"] });

let board = null, selected = null, myColor = null, myTurn = false, animating = false;
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
let cell = 80;

function resize() {
  const size = Math.min(innerWidth * 0.95, innerHeight * 0.7);
  canvas.width = canvas.height = size;
  cell = size / 8;
  if (board) draw();
}
addEventListener("resize", resize); resize();

// Animasyonlu çizim
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      // Kareler
      ctx.fillStyle = (x + y) % 2 ? "#b58863" : "#f0d9b5";
      ctx.fillRect(x * cell, y * cell, cell, cell);
      
      // Seçili kare
      if (selected && selected.x === x && selected.y === y) {
        ctx.shadowColor = "#00ff00";
        ctx.shadowBlur = 20;
        ctx.strokeStyle = "#00ff88";
        ctx.lineWidth = 8;
        ctx.strokeRect(x * cell + 4, y * cell + 4, cell - 8, cell - 8);
        ctx.shadowBlur = 0;
      }
      
      // Taş
      const p = board[y][x];
      if (p) {
        const white = p === 1 || p === 2;
        const king = p === 2 || p === 4;
        
        ctx.fillStyle = white ? "#fff" : "#2d1b14";
        ctx.beginPath();
        ctx.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = white ? "#333" : "#ddd";
        ctx.lineWidth = 5;
        ctx.stroke();
        
        // Kral tacı
        if (king) {
          ctx.fillStyle = "#ffd700";
          ctx.shadowColor = "#ffd700";
          ctx.shadowBlur = 15;
          ctx.font = `bold ${cell * 0.35}px Arial`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("👑", x * cell + cell / 2, y * cell + cell / 2);
          ctx.shadowBlur = 0;
        }
      }
    }
  }
  
  // Hamle gösterimi
  if (selected && myTurn && !animating) {
    const moves = getBestMoves(selected.x, selected.y);
    moves.forEach(m => {
      ctx.fillStyle = m.captures?.length ? "rgba(255,0,0,0.5)" : "rgba(0,255,136,0.5)";
      ctx.beginPath();
      ctx.arc(m.x * cell + cell / 2, m.y * cell + cell / 2, cell * 0.3, 0, Math.PI * 2);
      ctx.fill();
      
      // Yeme yolu
      if (m.captures?.length) {
        ctx.strokeStyle = "#ff0000";
        ctx.lineWidth = 4;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(selected.x * cell + cell / 2, selected.y * cell + cell / 2);
        ctx.lineTo(m.x * cell + cell / 2, m.y * cell + cell / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }
}

/**
 * @param {number} sx - Başlangıç X koordinatı
 * @param {number} sy - Başlangıç Y koordinatı
 * @returns {{x: number, y: number, captures: {x: number, y: number}[]}[]}
 */
function getBestMoves(sx, sy) {
  // Sunucudan gelen mantıkla client-side validasyon
  const moves = [];
  const piece = board[sy][sx];
  if (!piece) return moves;
  
  const white = piece === 1 || piece === 2;
  const isKing = piece === 2 || piece === 4;
  
  // Taşın rengi
  const myPieceColor = white ? 1 : 3;
  
  const dirs = isKing ? [[-1,-1],[-1,1],[1,-1],[1,1]] : 
    (white ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]);
  
  // --- YEME ZORUNLULUĞU KONTROLÜ (Tüm tahta için) ---
  let mandatoryCaptureAvailable = false;
  const allCaptures = [];
  
  // Tüm tahtayı dolaşarak yeme hamlesi yapıp yapamayacağımızı kontrol ediyoruz.
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      // Yalnızca kendi renk taşlarımızı kontrol ediyoruz
      if (p && (p === myPieceColor || p === myPieceColor + 1)) {
        const pieceIsKing = p === 2 || p === 4;
        const pieceDirs = pieceIsKing ? [[-1,-1],[-1,1],[1,-1],[1,1]] : 
          ((p === 1 || p === 2) ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]);
        
        pieceDirs.forEach(([dy, dx]) => {
          const mx = c + dx, my = r + dy;
          const tx = c + dx * 2, ty = r + dy * 2;
          
          if (mx >= 0 && mx < 8 && my >= 0 && my < 8 &&
              tx >= 0 && tx < 8 && ty >= 0 && ty < 8 &&
              board[my][mx] !== 0 && board[my][mx] !== p &&
              board[ty][tx] === 0) {
            
            mandatoryCaptureAvailable = true;
            if (r === sy && c === sx) { // Bu, seçili taşın yakalaması
                allCaptures.push({ x: tx, y: ty, captures: [{x: mx, y: my}] });
            }
          }
        });
      }
    }
  }
  // ---------------------------------------------------
  
  if (mandatoryCaptureAvailable) {
    // Eğer yeme zorunluluğu varsa, sadece seçili taşın yeme hamlelerini döndür.
    return allCaptures;
  }
  
  // Yeme yoksa normal hareket
  dirs.forEach(([dy, dx]) => {
    const nx = sx + dx, ny = sy + dy;
    if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny][nx] === 0) {
      moves.push({ x: nx, y: ny, captures: [] });
    }
  });
  
  return moves;
}

// Touch + Mouse (MASADÜSTÜ ÇÖZÜLDÜ!)
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: Math.floor((clientX - rect.left) / cell),
    y: Math.floor((clientY - rect.top) / cell)
  };
}

["touchstart", "mousedown"].forEach(ev => {
  canvas.addEventListener(ev, e => {
    e.preventDefault();
    if (!myTurn || animating) return;
    
    const pos = getPos(e);
    if (pos.x < 0 || pos.x > 7 || pos.y < 0 || pos.y > 7) return;
    
    const piece = board[pos.y][pos.x];
    const mine = (myColor === "white" && (piece === 1 || piece === 2)) ||
                 (myColor === "black" && (piece === 3 || piece === 4));
    
    if (mine) {
      // Yeme zorunluluğu varken, sadece yeme yapabilen taşları seçebilmeliyiz.
      const allCaptures = [];
      for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
              if (board[r][c] && ((myColor === "white" && (board[r][c] === 1 || board[r][c] === 2)) ||
                                  (myColor === "black" && (board[r][c] === 3 || board[r][c] === 4)))) {
                  const pieceMoves = getBestMoves(c, r);
                  if (pieceMoves.some(m => m.captures?.length > 0)) {
                      allCaptures.push({x: c, y: r});
                  }
              }
          }
      }
      
      if (allCaptures.length > 0) {
          const canCapture = allCaptures.some(p => p.x === pos.x && p.y === pos.y);
          if (canCapture) {
              selected = pos;
          } else {
              // Yeme zorunluluğu var ama bu taş yiyemiyor, seçimi iptal et
              selected = null;
          }
      } else {
        selected = pos;
      }
      
    } else if (selected) {
      const moves = getBestMoves(selected.x, selected.y);
      const valid = moves.find(m => m.x === pos.x && m.y === pos.y);
      if (valid) {
        animating = true;
        socket.emit("move", { from: selected, to: pos });
        selected = null;
      } else {
        selected = null;
      }
    } else {
      selected = null;
    }
    draw();
  }, { passive: false });
});

// Socket Events
socket.on("connect", () => document.getElementById("status").textContent = "✅ Bağlandı!");
socket.on("searching", () => document.getElementById("searching").classList.remove("hidden"));
socket.on("roomCreated", code => {
  document.getElementById("roomCode").textContent = code;
  document.getElementById("roomInfo").classList.remove("hidden");
});
socket.on("errorMsg", alert);
socket.on("gameStart", data => {
  board = data.board; myColor = data.color; myTurn = data.turn === data.color;
  document.getElementById("lobby").classList.remove("active");
  document.getElementById("game").classList.add("active");
  updateLights();
  draw();
});
socket.on("boardUpdate", data => {
  board = data.board; myTurn = data.turn === myColor;
  animating = false;
  updateLights();
  draw();
});

function updateLights() {
  document.getElementById("l1").classList.toggle("active", myColor === "white" && myTurn);
  document.getElementById("l2").classList.toggle("active", myColor === "black" && myTurn);
}

// Butonlar (aynı)
document.getElementById("ranked").onclick = () => socket.emit("findMatch");
document.getElementById("create").onclick = () => socket.emit("createRoom");
document.getElementById("joinToggle").onclick = () => 
  document.getElementById("joinBox").classList.toggle("hidden");
document.getElementById("joinBtn").onclick = () => 
  socket.emit("joinRoom", document.getElementById("codeInput").value);
document.getElementById("copyBtn").onclick = () => 
  navigator.clipboard.writeText(document.getElementById("roomCode").textContent);
document.getElementById("cancel").onclick = () => { socket.emit("cancelMatch"); location.reload(); }
document.getElementById("leave").onclick = () => location.reload();
