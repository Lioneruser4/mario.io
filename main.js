const socket = io("https://mario-io-1.onrender.com", { transports: ["websocket"] });

let board = null, selected = null, myColor = null, myTurn = false, animating = false;
let gameTimer = 20; 
let timerInterval = null; 

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
let cell = 80;
let flashTimer = 0; 

// DOM Elementleri
const statusEl = document.getElementById("status");
const timerEl = document.getElementById("centralTimer");
const p1NameEl = document.getElementById("player1Name");
const p2NameEl = document.getElementById("player2Name");
const gameOverEl = document.getElementById("gameOverMessage");

// --- TELEGRAM / İSİM YÖNETİMİ ---

// Rastgele isim oluştur
function generateRandomName() {
    const adjectives = ['Hızlı', 'Zeki', 'Güçlü', 'Şanslı', 'Usta', 'Yenilmez', 'Kurnaz', 'Bilge', 'Çevik', 'Sakin'];
    const nouns = ['Dâhice', 'Şahin', 'Kaplan', 'Ejderha', 'Kartal', 'Aslan', 'Kurt', 'Yıldız', 'Ayı', 'Tilki'];
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${randomAdj} ${randomNoun}${Math.floor(100 + Math.random() * 900)}`;
}

// Telegram parametrelerini kontrol et
function parseTelegramParams() {
    try {
        // Telegram WebApp'ten gelen parametreleri kontrol et
        if (window.Telegram && window.Telegram.WebApp) {
            const user = window.Telegram.WebApp.initDataUnsafe?.user;
            if (user) {
                return {
                    id: user.id.toString(),
                    name: user.first_name || 'Misafir',
                    username: user.username || `user_${user.id}`
                };
            }
        }
        
        // URL parametrelerini kontrol et (eski yöntem)
        const urlParams = new URLSearchParams(window.location.search);
        const tgUser = urlParams.get('tgWebAppUser');
        
        if (tgUser) {
            try {
                const user = JSON.parse(decodeURIComponent(tgUser));
                return {
                    id: user.id || Date.now().toString(),
                    name: user.first_name || 'Misafir',
                    username: user.username || `user_${Date.now()}`
                };
            } catch (e) {
                console.error('Telegram user parse error:', e);
            }
        }
        
        // Hiçbir kaynaktan kullanıcı bilgisi alınamadıysa rastgele isim oluştur
        return {
            id: `guest_${Date.now()}`,
            name: generateRandomName(),
            username: `guest_${Math.floor(1000 + Math.random() * 9000)}`
        };
    } catch (error) {
        console.error('Error parsing Telegram params:', error);
        return {
            id: `guest_${Date.now()}`,
            name: generateRandomName(),
            username: `guest_${Math.floor(1000 + Math.random() * 9000)}`
        };
    }
}

// Kullanıcı bilgilerini al
const userInfo = parseTelegramParams();
let myName = userInfo.name;
let myID = userInfo.id;

parseTelegramParams(); // Sayfa yüklenir yüklenmez isimleri ayarla


// --- ZAMANLAYICI YÖNETİMİ VE RASTGELE HAMLE ---

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

    timerEl.classList.remove("hidden"); // Timer hep görünür
    
    timerInterval = setInterval(() => {
        gameTimer--;
        updateTimerDisplay();

        if (gameTimer <= 0) {
            clearInterval(timerInterval);
            
            // --- ZAMAN AŞIMI HAMLESİ MANTIĞI ---
            if (myTurn) {
                // Tüm geçerli hamleleri bul (yemeler zorunlu, yoksa normal)
                const allPossibleMoves = [];
                const myPieceColor = myColor === "white" ? 1 : 3;

                for (let r = 0; r < 8; r++) {
                    for (let c = 0; c < 8; c++) {
                        const p = board[r][c];
                        if (p && (p === myPieceColor || p === myPieceColor + 1)) {
                            const moves = getBestMoves(c, r);
                            moves.forEach(move => allPossibleMoves.push({ from: {x: c, y: r}, to: move }));
                        }
                    }
                }

                if (allPossibleMoves.length > 0) {
                    // Rastgele bir hamle seç ve yap
                    const randomIndex = Math.floor(Math.random() * allPossibleMoves.length);
                    const randomMove = allPossibleMoves[randomIndex];
                    
                    animating = true;
                    socket.emit("move", { from: randomMove.from, to: randomMove.to });
                    statusEl.textContent = "Süre bitti, rastgele hamle yapıldı.";
                } else {
                    // Hiçbir hamle yoksa (Oyunun bitmesi gerekir, ama yine de sunucuya bildir)
                    socket.emit("timeout");
                    statusEl.textContent = "Süre bitti ve hamle kalmadı!";
                }
            }
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(gameTimer / 60);
    const seconds = gameTimer % 60;
    const timeStr = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    
    timerEl.textContent = timeStr;
    timerEl.style.color = gameTimer <= 5 ? "red" : "#f44336";
}


// --- ÇİZİM VE OYUN MANTIĞI (Önceki Sorudan) ---

function draw() { /* Önceki sorudaki ÇİZİM KODU buraya gelir (aynı kalır) */
  ctx.clearRect(0, 0, canvas.width, canvas.height);

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

  flashTimer = (flashTimer + 0.05) % (2 * Math.PI); 
  const flashAlpha = (Math.sin(flashTimer * 5) + 1) / 2; 

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const isPlayableSquare = (x + y) % 2 === 1;
      
      ctx.fillStyle = isPlayableSquare ? "#b58863" : "#f0d9b5";
      ctx.fillRect(x * cell, y * cell, cell, cell);

      let isMoveTarget = false;
      let move = null;
      if (selected && myTurn && !animating) {
        const moves = getBestMoves(selected.x, selected.y);
        move = moves.find(m => m.x === x && m.y === y);
        isMoveTarget = !!move;
      }
      
      if (isMoveTarget) {
        ctx.fillStyle = move.captures?.length ? "rgba(255, 0, 0, 0.4)" : "rgba(0, 255, 136, 0.4)";
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
      
      if (selected && selected.x === x && selected.y === y) {
        ctx.shadowColor = "#00ff00";
        ctx.shadowBlur = 20;
        ctx.strokeStyle = "#00ff88";
        ctx.lineWidth = 8;
        ctx.strokeRect(x * cell + 4, y * cell + 4, cell - 8, cell - 8);
        ctx.shadowBlur = 0;
      }
      
      const isMandatoryCapturePiece = mandatoryCaptures.some(p => p.x === x && p.y === y);
      if (isMandatoryCapturePiece) {
        ctx.fillStyle = `rgba(255, 165, 0, ${0.4 + 0.6 * flashAlpha})`;
        ctx.beginPath();
        ctx.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

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

function getBestMoves(sx, sy) { /* Önceki sorudaki ÇAPRAZ DAMA MANTIK KODU buraya gelir (aynı kalır) */
  const moves = [];
  const piece = board[sy][sx];
  if (!piece) return moves;
  
  const white = piece === 1 || piece === 2;
  const isKing = piece === 2 || piece === 4;
  const myPieceColor = white ? 1 : 3;
  
  const normalDirs = isKing ? 
    [[-1,-1], [-1,1], [1,-1], [1,1]] : 
    (white ? [[-1,-1], [-1,1]] : [[1,-1], [1,1]]); 

  const captureDirs = [[-1,-1], [-1,1], [1,-1], [1,1]]; 
  
  let mandatoryCaptureAvailable = false;
  const allCapturesForSelectedPiece = [];
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && (p === myPieceColor || p === myPieceColor + 1)) {
        const pieceIsKing = p === 2 || p === 4;
        
        captureDirs.forEach(([dy, dx]) => {
          let targetY = r + 2 * dy;
          let targetX = c + 2 * dx;
          let capturedY = r + dy;
          let capturedX = c + dx;

          const isForwardCapture = (myPieceColor === 1 && dy < 0) || (myPieceColor === 3 && dy > 0);

          if (!pieceIsKing && !isForwardCapture) return;

          if (capturedX >= 0 && capturedX < 8 && capturedY >= 0 && capturedY < 8) {
              const capturedPiece = board[capturedY][capturedX];
              const isOpponent = capturedPiece !== 0 && (capturedPiece === (myPieceColor === 1 ? 3 : 1) || capturedPiece === (myPieceColor === 1 ? 4 : 2));
              const isValidTarget = targetX >= 0 && targetX < 8 && targetY >= 0 && targetY < 8 && board[targetY][targetX] === 0;

              if (isOpponent && isValidTarget) {
                  mandatoryCaptureAvailable = true;
                  
                  if (r === sy && c === sx) { 
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

  if (mandatoryCaptureAvailable) {
    return allCapturesForSelectedPiece;
  }
  
  normalDirs.forEach(([dy, dx]) => {
    let nx = sx + dx, ny = sy + dy;
    
    if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny][nx] === 0) {
        moves.push({ x: nx, y: ny, captures: [] });
    }
  });
  
  return moves;
}

// --- ETKİLEŞİM VE SOCKET OLAYLARI ---

function getPos(e) { /* Önceki sorudaki KOD buraya gelir (aynı kalır) */
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
              selected = pos; 
          } else {
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
        clearInterval(timerInterval); 
      } else {
        selected = null; 
      }
    } else {
      selected = null;
    }
    requestAnimationFrame(draw);
  }, { passive: false });
});

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

// Sunucuya ismi ve ID'yi gönder (Eşleştirme ve oda kurulurken kullanılması için)
socket.on("gameStart", data => {
  board = data.board; 
  myColor = data.color; 
  myTurn = data.turn === data.color;

  // İsimleri ayarla
  const opponentName = data.opponentName || "Rakip Oyuncu";
  const myActualName = myName;

  if (myColor === "white") {
    p1NameEl.textContent = myActualName;
    p2NameEl.textContent = opponentName;
  } else {
    p1NameEl.textContent = opponentName;
    p2NameEl.textContent = myActualName;
  }
  
  document.getElementById("lobby").classList.remove("active");
  document.getElementById("game").classList.add("active");
  
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

// --- YENİ OYUN SONU OLAYI ---
socket.on("gameOver", data => {
    clearInterval(timerInterval);
    timerEl.classList.add("hidden");
    
    let message = "";
    if (data.winner === myColor) {
        message = "🎉 KAZANDIN! 🎉";
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } else if (data.winner) {
        message = "😞 KAYBETTİN 😞";
    } else {
        message = "🤝 BERABERLİK 🤝";
    }
    
    gameOverEl.textContent = message;
    gameOverEl.style.display = "block";
    statusEl.textContent = "Oyun bitti. Lobiye dönülüyor...";

    setTimeout(() => {
        location.reload(); // 5 saniye sonra lobiye dön
    }, 5000);
});

function updateStatus(currentTurn) {
  const isWhiteTurn = currentTurn === "white";
  const myTurnNow = currentTurn === myColor;
  
  document.getElementById("l1").classList.toggle("active", isWhiteTurn); 
  document.getElementById("l2").classList.toggle("active", !isWhiteTurn); 

  if (myTurnNow) {
    statusEl.textContent = "SIRA SENDE! Hamleni yap.";
    startTimer(20); 
  } else {
    statusEl.textContent = "SIRA ONDA. Bekleniyor...";
    clearInterval(timerInterval); 
    updateTimerDisplay(); // Zamanlayıcının son değeri kalır
  }
}

// Lobi Butonları
document.getElementById("ranked").onclick = () => {
    const rankedBtn = document.getElementById("ranked");
    const searchingEl = document.getElementById("searching");
    
    // Eğer zaten aranıyorsa, tekrar tıklamayı engelle
    if (rankedBtn.disabled) return;
    
    // Butonu devre dışı bırak ve aranıyor mesajını göster
    rankedBtn.disabled = true;
    rankedBtn.textContent = 'Aranıyor...';
    searchingEl.classList.remove("hidden");
    
    // Sunucuya eşleşme isteği gönder
    socket.emit("findMatch", { name: myName, id: myID });
    
    // 5 saniye sonra butonu tekrar aktif et
    setTimeout(() => {
        if (searchingEl.classList.contains("hidden") === false) {
            rankedBtn.disabled = false;
            rankedBtn.textContent = 'Dereceli Maç';
            searchingEl.classList.add("hidden");
            statusEl.textContent = 'Eşleşme bulunamadı. Tekrar deneyin.';
        }
    }, 5000);
};
document.getElementById("create").onclick = () => {
    document.getElementById("lobby").classList.add("active");
    document.getElementById("roomInfo").classList.add("hidden");
    document.getElementById("searching").classList.add("hidden");
    socket.emit("createRoom", { name: myName, id: myID }); // İsim/ID gönder
};
document.getElementById("joinToggle").onclick = () => {
    document.getElementById("joinBox").classList.toggle("hidden");
    document.getElementById("roomInfo").classList.add("hidden");
    document.getElementById("searching").classList.add("hidden");
};
document.getElementById("joinBtn").onclick = () => {
    document.getElementById("joinBox").classList.add("hidden");
    socket.emit("joinRoom", { code: document.getElementById("codeInput").value, name: myName, id: myID }); // İsim/ID gönder
};
document.getElementById("copyBtn").onclick = () => {
  navigator.clipboard.writeText(document.getElementById("roomCode").textContent)
    .then(() => alert("Oda Kodu Kopyalandı!"))
    .catch(err => console.error('Kopyalama hatası:', err));
};

document.getElementById("cancel").onclick = () => location.reload();
document.getElementById("leave").onclick = () => location.reload();
