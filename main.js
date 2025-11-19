const socket = io("https://mario-io-1.onrender.com", { transports: ["websocket"] });

let board = null, selected = null, myColor = null, myTurn = false, animating = false;
let gameTimer = 0; // Kalan saniye
let timerInterval = null; // Sayacı tutar
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
let cell = 80;
let flashTimer = 0; // Animasyon için zamanlayıcı

// DOM Elementleri
const statusEl = document.getElementById("status");
const timer1El = document.getElementById("timer1"); // Beyaz zamanlayıcı (p1)
const timer2El = document.getElementById("timer2"); // Siyah zamanlayıcı (p2)
const p1NameEl = document.getElementById("player1Name"); // Yeni eklendi: HTML'de player1Name, player2Name'i güncellemeyi unutmayın!
const p2NameEl = document.getElementById("player2Name");


// --- ARAYÜZ VE ZAMANLAYICI YÖNETİMİ ---

function resize() {
  const size = Math.min(innerWidth * 0.95, innerHeight * 0.7);
  canvas.width = canvas.height = size;
  cell = size / 8;
  if (board) requestAnimationFrame(draw);
}
addEventListener("resize", resize); resize();

function startTimer(seconds) {
    if (timerInterval) clearInterval(timerInterval);
    gameTimer = seconds;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        gameTimer--;
        updateTimerDisplay();

        if (gameTimer <= 0) {
            clearInterval(timerInterval);
            // Zaman bittiğinde sunucuya bildir. Sunucu AFK kuralını uygulayacaktır.
            socket.emit("timeout"); 
            statusEl.textContent = "Süreniz Bitti! Rakibiniz bekleniyor...";
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(gameTimer / 60);
    const seconds = gameTimer % 60;
    const timeStr = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    
    // Sıra kimdeyse o zamanlayıcıyı güncelle
    if (myTurn) {
        if (myColor === "white") timer1El.textContent = timeStr;
        if (myColor === "black") timer2El.textContent = timeStr;
    } else {
        if (myColor === "white") timer2El.textContent = timeStr;
        if (myColor === "black") timer1El.textContent = timeStr;
    }
}


// --- ÇİZİM VE ANİMASYON ---

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const mandatoryCaptures = [];
  const myPieceColor = myColor === "white" ? 1 : 3;

  // Yeme zorunluluğu olan tüm taşları bul
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
  flashTimer = (flashTimer + 0.05) % (2 * Math.PI); 
  const flashAlpha = (Math.sin(flashTimer * 5) + 1) / 2; 

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
  
  if (!animating && board) {
    requestAnimationFrame(draw);
  }
}
// İlk animasyon döngüsünü başlat
requestAnimationFrame(draw);


// --- OYUN MANTIK FONKSİYONLARI ---

/**
 * @param {number} sx - Başlangıç X koordinatı (sütun)
 * @param {number} sy - Başlangıç Y koordinatı (satır)
 * @returns {{x: number, y: number, captures: {x: number, y: number}[]}[]}
 */
function getBestMoves(sx, sy) {
  const moves = [];
  const piece = board[sy][sx];
  if (!piece) return moves;
  
  const white = piece === 1 || piece === 2;
  const isKing = piece === 2 || piece === 4;
  const myPieceColor = white ? 1 : 3;
  
  // Türk Daması'nda normal hareket yönleri (King değilse ileri/yan, King ise tüm yönler)
  const normalDirs = isKing ? 
    [[0,-1], [0,1], [-1,0], [1,0]] : // King: Düz ve yan
    (white ? [[0,-1], [-1,0], [1,0]] : [[0,1], [-1,0], [1,0]]); // Er: İleri ve yan

  // Yeme yönleri (tüm 4 ana yön)
  const captureDirs = [[0,-1], [0,1], [-1,0], [1,0]]; 
  
  // --- YEME ZORUNLULUĞU KONTROLÜ (Tüm tahta için) ---
  let mandatoryCaptureAvailable = false;
  const allCapturesForSelectedPiece = [];
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      // Yalnızca kendi renk taşlarımızı kontrol ediyoruz
      if (p && (p === myPieceColor || p === myPieceColor + 1)) {
        const pieceIsKing = p === 2 || p === 4;
        
        captureDirs.forEach(([dx, dy]) => { // dx: X değişimi (sütun), dy: Y değişimi (satır)
          // Yeme, taştan 2 birim uzakta boş bir kareye yapılır.
          // Aradaki rakip taş atlanır.
          
          let potentialCaptures = []; // Yeme zinciri için kullanılabilir (basitleştirilmiş versiyon)
          
          let targetY = r + 2 * dy;
          let targetX = c + 2 * dx;
          let capturedY = r + dy;
          let capturedX = c + dx;

          // Sadece bir birim ötesinde rakip taş var mı kontrol et
          if (capturedX >= 0 && capturedX < 8 && capturedY >= 0 && capturedY < 8) {
              const capturedPiece = board[capturedY][capturedX];
              const isOpponent = capturedPiece !== 0 && (capturedPiece === (myPieceColor === 1 ? 3 : 1) || capturedPiece === (myPieceColor === 1 ? 4 : 2));
              
              // Hedef kare geçerli mi ve boş mu?
              const isValidTarget = targetX >= 0 && targetX < 8 && targetY >= 0 && targetY < 8 && board[targetY][targetX] === 0;

              if (isOpponent && isValidTarget) {
                  // King olmayan taşlar için geriye yeme kısıtlaması (Türk Daması'nda geçerli değil, sadece çapraz damada geçerli olabilir)
                  // Türk Daması'nda er de geriye yiyebilir, bu yüzden kısıtlama kaldırıldı.
                  
                  mandatoryCaptureAvailable = true;
                  
                  if (r === sy && c === sx) { // Bu, seçili taşın yakalaması
                      allCapturesForSelectedPiece.push({ 
                          x: targetX, 
                          y: targetY, 
                          captures: [{x: capturedX, y: capturedY}] 
                      });
                  }
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
  normalDirs.forEach(([dx, dy]) => {
    let nx = sx + dx, ny = sy + dy;
    
    // Er taşı sadece bir adım ilerler
    if (!isKing) {
        if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny][nx] === 0) {
            moves.push({ x: nx, y: ny, captures: [] });
        }
        return;
    }
    
    // King (Dama) taşı boş kareler boyunca hareket eder
    while (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny][nx] === 0) {
        moves.push({ x: nx, y: ny, captures: [] });
        nx += dx;
        ny += dy;
    }
  });
  
  return moves;
}

// --- ETKİLEŞİM YÖNETİMİ ---

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

    // Yeme zorunluluğu olan tüm taşları bul (tekrar hesaplama, performans için optimize edilebilir)
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
    
    const captureIsMandatory = mandatoryCaptures.length > 0;

    if (mine) {
      if (captureIsMandatory) {
          const canCapture = mandatoryCaptures.some(p => p.x === pos.x && p.y === pos.y);
          if (canCapture) {
              selected = pos; // Zorunluluk var ve bu taş yiyebilir -> Seç
          } else {
              selected = null; // Zorunluluk var ama bu taş yiyemez -> Seçime izin verme
          }
      } else {
        selected = pos; // Zorunluluk yok -> Seç
      }
      
    } else if (selected) {
      const moves = getBestMoves(selected.x, selected.y);
      const valid = moves.find(m => m.x === pos.x && m.y === pos.y);
      if (valid) {
        animating = true;
        socket.emit("move", { from: selected, to: pos });
        selected = null;
        clearInterval(timerInterval); // Hamle yapıldı, zamanlayıcıyı durdur
      } else {
        selected = null; // Geçersiz hamle
      }
    } else {
      selected = null;
    }
    requestAnimationFrame(draw);
  }, { passive: false });
});

// --- SOCKET OLAYLARI VE UX GÜNCELLEMELERİ ---

socket.on("connect", () => statusEl.textContent = "✅ Sunucuya Bağlandı!");
socket.on("searching", () => {
    document.getElementById("searching").classList.remove("hidden");
    document.getElementById("lobby").classList.add("active");
});
socket.on("roomCreated", code => {
  document.getElementById("roomCode").textContent = code;
  document.getElementById("roomInfo").classList.remove("hidden");
  document.getElementById("searching").classList.add("hidden");
});
socket.on("errorMsg", alert);
socket.on("gameStart", data => {
  board = data.board; 
  myColor = data.color; 
  myTurn = data.turn === data.color;
  
  // UX Güncelleme
  document.getElementById("lobby").classList.remove("active");
  document.getElementById("game").classList.add("active");
  
  // Zamanlayıcıları sıfırla ve başlat
  timer1El.textContent = "0:20";
  timer2El.textContent = "0:20";

  updateStatus(data.turn);
  requestAnimationFrame(draw); 
});

socket.on("boardUpdate", data => {
  board = data.board; 
  myTurn = data.turn === myColor;
  animating = false;
  
  updateStatus(data.turn);
  requestAnimationFrame(draw); 
});

function updateStatus(currentTurn) {
  // Lamba ve durum metni güncelleme
  const isWhiteTurn = currentTurn === "white";
  const myTurnNow = currentTurn === myColor;
  
  document.getElementById("l1").classList.toggle("active", isWhiteTurn); // Beyaz'ın lambası
  document.getElementById("l2").classList.toggle("active", !isWhiteTurn); // Siyah'ın lambası

  if (myTurnNow) {
    statusEl.textContent = "SIRA SENDE! Hamleni yap.";
    startTimer(20); // 20 saniye başlat
  } else {
    statusEl.textContent = "SIRA ONDA. Bekleniyor...";
    clearInterval(timerInterval); // Sayacı durdur
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

document.getElementById("cancel").onclick = () => location.reload();
document.getElementById("leave").onclick = () => location.reload();
