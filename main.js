const socket = io("https://mario-io-1.onrender.com", { transports: ["websocket"] });

let board = null, selected = null, myColor = null, myTurn = false, animating = false;
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
let cell = 80;
let flashTimer = 0; // Animasyon için zamanlayıcı

function resize() {
  const size = Math.min(innerWidth * 0.95, innerHeight * 0.7);
  canvas.width = canvas.height = size;
  cell = size / 8;
  if (board) requestAnimationFrame(draw);
}
addEventListener("resize", resize); resize();

// Animasyonlu çizim
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Mecburi yeme zorunluluğu olan taşları bul
  const mandatoryCaptures = [];
  const myPieceColor = myColor === "white" ? 1 : 3;

  if (myTurn && !animating) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && (p === myPieceColor || p === myPieceColor + 1)) {
          const pieceMoves = getBestMoves(c, r);
          if (pieceMoves.some(m => m.captures?.length > 0)) {
            mandatoryCaptures.push({ x: c, y: r });
          }
        }
      }
    }
  }

  // Flash animasyonunu güncelle
  flashTimer = (flashTimer + 0.05) % (2 * Math.PI); // Daha yavaş yanıp sönme hızı
  const flashAlpha = (Math.sin(flashTimer * 5) + 1) / 2; // 0.0 ile 1.0 arasında yanıp sönme

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      // Kareler
      ctx.fillStyle = (x + y) % 2 ? "#b58863" : "#f0d9b5";
      ctx.fillRect(x * cell, y * cell, cell, cell);

      // --- HAMLE İPUCU VURGULAMASI (Kutu/Kare olarak) ---
      let isMoveTarget = false;
      let move = null;
      if (selected && myTurn && !animating) {
        const moves = getBestMoves(selected.x, selected.y);
        move = moves.find(m => m.x === x && m.y === y);
        isMoveTarget = !!move;
      }
      
      if (isMoveTarget) {
        // Hedef karesini doldur
        ctx.fillStyle = move.captures?.length ? "rgba(255, 0, 0, 0.4)" : "rgba(0, 255, 136, 0.4)";
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
      // --------------------------------------------------

      // Seçili kare vurgusu
      if (selected && selected.x === x && selected.y === y) {
        ctx.shadowColor = "#00ff00";
        ctx.shadowBlur = 20;
        ctx.strokeStyle = "#00ff88";
        ctx.lineWidth = 8;
        ctx.strokeRect(x * cell + 4, y * cell + 4, cell - 8, cell - 8);
        ctx.shadowBlur = 0;
      }
      
      // --- MECBURİ YEME VURGUSU (Animasyonlu Yanıp Sönme) ---
      const isMandatoryCapturePiece = mandatoryCaptures.some(p => p.x === x && p.y === y);
      if (isMandatoryCapturePiece) {
        // Taşı kaplayacak şekilde yanıp sönen bir halka çiz
        ctx.fillStyle = `rgba(255, 165, 0, ${0.4 + 0.6 * flashAlpha})`; // Turuncu/Sarı parlama
        ctx.beginPath();
        ctx.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      // ----------------------------------------------------

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
  
  // Eğer oyun devam ediyorsa ve sıra bende ise, animasyon döngüsünü sürdür.
  if (!animating && myTurn) {
    requestAnimationFrame(draw);
  } else if (!animating && board) {
     // Rakip sırasındayken veya oyun devam ediyorsa sabit kal
     // Sadece draw() çağrıldığında yeniden çiz
     //requestAnimationFrame(draw); // Eğer sürekli çizim istiyorsanız bu satırı aktif edin.
  }
}
// İlk animasyon döngüsünü başlat
requestAnimationFrame(draw);


/**
 * @param {number} sx - Başlangıç X koordinatı
 * @param {number} sy - Başlangıç Y koordinatı
 * @returns {{x: number, y: number, captures: {x: number, y: number}[]}[]}
 */
function getBestMoves(sx, sy) {
  const moves = [];
  const piece = board[sy][sx];
  if (!piece) return moves;
  
  const white = piece === 1 || piece === 2;
  const isKing = piece === 2 || piece === 4;
  
  // Taşın rengi: Beyaz için 1, Siyah için 3
  const myPieceColor = white ? 1 : 3;
  
  // Yeme zorunluluğu yoksa normal yönler
  const normalDirs = isKing ? [[-1,-1],[-1,1],[1,-1],[1,1]] : 
    (white ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]);
  
  // --- YEME ZORUNLULUĞU KONTROLÜ (Tüm tahta için) ---
  let mandatoryCaptureAvailable = false;
  const allCapturesForSelectedPiece = [];
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      // Yalnızca kendi renk taşlarımızı kontrol ediyoruz
      if (p && (p === myPieceColor || p === myPieceColor + 1)) {
        const pieceIsKing = p === 2 || p === 4;
        
        // Yeme yönleri (tüm 4 yön)
        const captureDirs = [[-1,-1],[-1,1],[1,-1],[1,1]]; 
        
        captureDirs.forEach(([dy, dx]) => {
          const mx = c + dx, my = r + dy; // Atlanan taşın konumu
          const tx = c + 2*dx, ty = r + 2*dy; // Hedef kare konumu
          
          const isForwardCapture = (myPieceColor === 1 && dy < 0) || (myPieceColor === 3 && dy > 0);

          // King değilse, geriye yeme yapamaz.
          if (!pieceIsKing && !isForwardCapture) return;

          if (mx >= 0 && mx < 8 && my >= 0 && my < 8 &&
              tx >= 0 && tx < 8 && ty >= 0 && ty < 8 &&
              board[mx][my] !== 0 && (board[mx][my] === (myPieceColor === 1 ? 3 : 1) || board[mx][my] === (myPieceColor === 1 ? 4 : 2)) && // Rakip taşı
              board[tx][ty] === 0) { // Hedef boş
            
            mandatoryCaptureAvailable = true;
            if (r === sy && c === sx) { // Bu, seçili taşın yakalaması
                // Koordinatlar: x (sütun c), y (satır r)
                allCapturesForSelectedPiece.push({ x: tx, y: ty, captures: [{x: mx, y: my}] });
            }
          }
        });
      }
    }
  }

  // Yeme zorunluluğu varsa, sadece yeme hamlelerini döndür.
  if (mandatoryCaptureAvailable) {
    return allCapturesForSelectedPiece;
  }
  
  // Yeme yoksa normal hareket
  normalDirs.forEach(([dy, dx]) => {
    const nx = sx + dx, ny = sy + dy;
    if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny][nx] === 0) {
      moves.push({ x: nx, y: ny, captures: [] });
    }
  });
  
  return moves;
}

// Touch + Mouse
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
    
    const mandatoryCaptures = [];
    const myPieceColor = myColor === "white" ? 1 : 3;

    // Yeme zorunluluğu olan tüm taşları bul
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && (p === myPieceColor || p === myPieceColor + 1)) {
                const pieceMoves = getBestMoves(c, r);
                if (pieceMoves.some(m => m.captures?.length > 0)) {
                    mandatoryCaptures.push({ x: c, y: r });
                }
            }
        }
    }
    
    // Yeme zorunluluğu var mı?
    const captureIsMandatory = mandatoryCaptures.length > 0;

    if (mine) {
      if (captureIsMandatory) {
          const canCapture = mandatoryCaptures.some(p => p.x === pos.x && p.y === pos.y);
          if (canCapture) {
              // Zorunluluk var ve bu taş yiyebilir -> Seç
              selected = pos;
          } else {
              // Zorunluluk var ama bu taş yiyemez -> Seçime izin verme, seçimi temizle
              selected = null;
          }
      } else {
        // Zorunluluk yok -> Seç
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
        // Geçersiz hamle veya başka bir yere tıklandı
        selected = null;
      }
    } else {
      selected = null;
    }
    // Seçim yapıldıktan sonra yeniden çiz ve animasyon döngüsünü devam ettir
    requestAnimationFrame(draw);
  }, { passive: false });
});

// Socket Events
socket.on("connect", () => document.getElementById("status").textContent = "✅ Bağlandı!");
socket.on("searching", () => {
    document.getElementById("searching").classList.remove("hidden");
    document.getElementById("lobby").classList.add("active"); // Eğer gizlenmişse aktif et
});
socket.on("roomCreated", code => {
  document.getElementById("roomCode").textContent = code;
  document.getElementById("roomInfo").classList.remove("hidden");
  document.getElementById("searching").classList.add("hidden");
});
socket.on("errorMsg", alert);
socket.on("gameStart", data => {
  board = data.board; myColor = data.color; myTurn = data.turn === data.color;
  
  // Lobby'den çık, Oyuna gir
  document.getElementById("lobby").classList.remove("active");
  document.getElementById("game").classList.add("active");
  
  // Oyuncu adlarını ayarla (HTML'de p1 ve p2 isimleri yok, bu yüzden l1 ve l2 göstergelerini kullanacağız)
  // document.getElementById("p1Name").textContent = myColor === "white" ? "Sen (Beyaz)" : "Sen (Siyah)"; 
  // document.getElementById("p2Name").textContent = myColor === "white" ? "Rakip (Siyah)" : "Rakip (Beyaz)"; 

  updateLights();
  requestAnimationFrame(draw); // Oyuna başlarken çizimi başlat
});
socket.on("boardUpdate", data => {
  board = data.board; myTurn = data.turn === myColor;
  animating = false;
  updateLights();
  requestAnimationFrame(draw); // Tahta güncellendiğinde çizimi başlat
});

function updateLights() {
  // l1 (sol/üst) ve l2 (sağ/alt) göstergelerini oyun renklerine göre ayarla.
  // Varsayım: Beyaz (1) her zaman alttadır (sol p1), Siyah (2) üstte (sağ p2).
  if (myColor === "white") {
    document.getElementById("l1").classList.toggle("active", myTurn); // Beyaz benim ve sıra bende
    document.getElementById("l2").classList.toggle("active", !myTurn); // Siyah rakip ve sıra onda
  } else { // myColor === "black"
    document.getElementById("l2").classList.toggle("active", myTurn); // Siyah benim ve sıra bende
    document.getElementById("l1").classList.toggle("active", !myTurn); // Beyaz rakip ve sıra onda
  }
}

// Butonlar
document.getElementById("ranked").onclick = () => {
    document.getElementById("lobby").classList.add("active");
    document.getElementById("searching").classList.remove("hidden");
    socket.emit("findMatch");
};
document.getElementById("create").onclick = () => {
    document.getElementById("lobby").classList.add("active");
    document.getElementById("roomInfo").classList.add("hidden");
    document.getElementById("searching").classList.add("hidden");
    socket.emit("createRoom");
};
document.getElementById("joinToggle").onclick = () => {
    document.getElementById("joinBox").classList.toggle("hidden");
    document.getElementById("roomInfo").classList.add("hidden");
    document.getElementById("searching").classList.add("hidden");
};
document.getElementById("joinBtn").onclick = () => {
    document.getElementById("joinBox").classList.add("hidden");
    socket.emit("joinRoom", document.getElementById("codeInput").value);
};
document.getElementById("copyBtn").onclick = () => {
  navigator.clipboard.writeText(document.getElementById("roomCode").textContent)
    .then(() => alert("Oda Kodu Kopyalandı!"))
    .catch(err => console.error('Kopyalama hatası:', err));
};

// Bu iki buton, lobiye geri dönmek için sayfayı yeniden yükler
document.getElementById("cancel").onclick = () => location.reload();
document.getElementById("leave").onclick = () => location.reload();
