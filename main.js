// Server URL
const socket = io("https://mario-io-1.onrender.com", { transports: ["websocket"] });

// Game State Variables
let board = null;         // Current board state (8x8 array)
let selected = null;      // Selected piece {x, y} coordinates
let myColor = null;       // My piece color ("white" or "black")
let myTurn = false;       // Is it my turn?
let animating = false;    // Is move animation in progress? (Simplified: prevents interaction during server processing)
let gameTimer = 20;       // Move time limit
let timerInterval = null; // Timer loop handle
let cell = 80;            // Pixel size of a board cell
let flashTimer = 0;       // For visual animations (mandatory capture pieces)

// --- USER INFO & TELEGRAM INTEGRATION ---

// Default to a Guest name and a unique ID for non-Telegram users
let myName = "Misafir-" + Math.random().toString(36).substring(2, 6).toUpperCase(); 
let myID = crypto.randomUUID(); // Fallback to a unique ID

/**
 * Parses Telegram WebApp data from the URL to set myName and myID.
 * If data is present, it prioritizes the user's first and last name.
 */
function parseTelegramParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const tgUserData = urlParams.get('tgWebAppUser');
    
    if (tgUserData) {
        try {
            const decodedData = decodeURIComponent(tgUserData);
            // Simple key-value parsing
            const userObject = decodedData.split('&').reduce((acc, param) => {
                const [key, value] = param.split('=');
                if (key && value) acc[key] = decodeURIComponent(value);
                return acc;
            }, {});

            if (userObject.first_name) {
                let fullName = userObject.first_name;
                // Add last name if available
                if (userObject.last_name) {
                    fullName += " " + userObject.last_name;
                }
                myName = fullName; 
            }
            if (userObject.id) {
                myID = userObject.id;
            }
        } catch (e) {
            console.error("Telegram verisi ayrıştırılırken hata:", e);
        }
    }
}
parseTelegramParams(); // Run on load

// --- DOM Elements ---
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const gameStatusEl = document.getElementById("gameStatus");
const timerEl = document.getElementById("centralTimer");
const p1NameEl = document.getElementById("player1Name");
const p2NameEl = document.getElementById("player2Name");
const gameOverEl = document.getElementById("gameOverMessage");
const lobbyEl = document.getElementById("lobby");
const gameEl = document.getElementById("game");
const customModalEl = document.getElementById("customModal");

// --- UTILITY FUNCTIONS ---

/**
 * Custom alert/modal system to replace the forbidden alert().
 * @param {string} message - The message to display.
 */
function alertModal(message) {
    customModalEl.textContent = message;
    customModalEl.classList.add("show");
    setTimeout(() => {
        customModalEl.classList.remove("show");
    }, 3000);
}

// Resizes the board for mobile responsiveness
function resize() {
    const size = Math.min(innerWidth * 0.95, innerHeight * 0.85); 
    canvas.width = canvas.height = size;
    cell = size / 8;
    if (board) requestAnimationFrame(draw);
}
window.onload = function() {
    resize();
    window.addEventListener("resize", resize); 
}


// --- TIMER AND GAME LOGIC HELPERS ---

// Starts or resets the move timer
function startTimer(seconds) {
    if (timerInterval) clearInterval(timerInterval);
    gameTimer = seconds;
    updateTimerDisplay();

    timerEl.classList.remove("hidden");
    
    timerInterval = setInterval(() => {
        gameTimer--;
        updateTimerDisplay();

        if (gameTimer <= 0) {
            clearInterval(timerInterval);
            if (myTurn) {
                // Send timeout to server (server handles the loss/pass)
                socket.emit("timeout"); 
                gameStatusEl.textContent = "Süre bitti, sıra rakibe geçti.";
            }
        }
    }, 1000);
}

// Updates the timer display
function updateTimerDisplay() {
    const minutes = Math.floor(gameTimer / 60);
    const seconds = gameTimer % 60;
    const timeStr = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    
    timerEl.textContent = timeStr;
    timerEl.classList.toggle("critical", gameTimer <= 5);
}

/**
 * Calculates all valid moves (normal or capture) for a given piece.
 * Implements the American Checkers rule (forced capture).
 * @param {number} sx - Start X coordinate (column)
 * @param {number} sy - Start Y coordinate (row)
 * @returns {Array<Object>} Array of valid moves ({x, y, captures: [{x,y}]})
 */
function getValidMoves(sx, sy) {
    const moves = [];
    const piece = board[sy][sx];
    if (!piece) return moves;
    
    const isWhite = piece === 1 || piece === 2;
    const isKing = piece === 2 || piece === 4;
    const myPieceColor = isWhite ? 1 : 3;
    
    const directions = [[-1,-1], [-1,1], [1,-1], [1,1]]; 

    // --- Forced Capture Moves (Yeme Hamleleri) ---
    const captures = [];
    
    directions.forEach(([dy, dx]) => {
        const mx = sx + dx, my = sy + dy;       // Middle (opponent)
        const nx = sx + 2 * dx, ny = sy + 2 * dy; // Target
        
        // Regular pieces can only capture forward
        const isForwardCapture = (myPieceColor === 1 && dy < 0) || (myPieceColor === 3 && dy > 0);
        if (!isKing && !isForwardCapture) return;

        if (mx >= 0 && mx < 8 && my >= 0 && my < 8 &&
            nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
            
            const capturedPiece = board[my][mx];
            const isOpponent = capturedPiece !== 0 && 
                               ((isWhite && (capturedPiece === 3 || capturedPiece === 4)) || 
                                (!isWhite && (capturedPiece === 1 || capturedPiece === 2)));
                                
            if (isOpponent && board[ny][nx] === 0) {
                captures.push({ 
                    x: nx, 
                    y: ny, 
                    captures: [{x: mx, y: my}] 
                });
            }
        }
    });

    // --- Normal Moves (Normal Hamleler) ---
    if (captures.length > 0) {
        // If forced capture exists, only return capture moves
        return captures;
    }

    // If no forced capture, check normal moves
    const normalDirs = isKing ? 
        [[-1,-1], [-1,1], [1,-1], [1,1]] : 
        (isWhite ? [[-1,-1], [-1,1]] : [[1,-1], [1,1]]); 

    normalDirs.forEach(([dy, dx]) => {
        let nx = sx + dx, ny = sy + dy;
        
        // Regular pieces can only move forward
        const isForwardMove = (myPieceColor === 1 && dy < 0) || (myPieceColor === 3 && dy > 0);
        if (!isKing && !isForwardMove) return;

        if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny][nx] === 0) {
            moves.push({ x: nx, y: ny, captures: [] });
        }
    });
    
    return moves;
}

// --- DRAWING AND VISUALIZATION ---

function draw() { 
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const myPieceColor = myColor === "white" ? 1 : 3;

    // List of pieces that MUST capture (global rule check)
    const allMandatoryCapturePieces = [];
    if (myTurn && !animating) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (p && (p === myPieceColor || p === myPieceColor + 1)) {
                    const pieceMoves = getValidMoves(c, r);
                    // Check if *any* move from this piece is a capture
                    if (pieceMoves.length > 0 && pieceMoves.some(m => m.captures?.length > 0)) {
                        // This piece is a potential capturer
                        allMandatoryCapturePieces.push({ x: c, y: r });
                    }
                }
            }
        }
    }
    
    // Smooth pulsing animation for highlighting
    flashTimer = (flashTimer + 0.05) % (2 * Math.PI); 
    const flashAlpha = (Math.sin(flashTimer * 5) + 1) / 2; 

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const isPlayableSquare = (x + y) % 2 === 1;
            
            // Background Color (Draughts board)
            ctx.fillStyle = isPlayableSquare ? "#b58863" : "#f0d9b5";
            ctx.fillRect(x * cell, y * cell, cell, cell);

            let isMoveTarget = false;
            let move = null;

            // Highlight valid move targets
            if (selected && myTurn && !animating) {
                const moves = getValidMoves(selected.x, selected.y);
                move = moves.find(m => m.x === x && m.y === y);
                isMoveTarget = !!move;
            }
            
            if (isMoveTarget) {
                // Red for capture, Green for normal move
                ctx.fillStyle = move.captures?.length ? "rgba(255, 0, 0, 0.4)" : "rgba(0, 255, 136, 0.4)";
                ctx.fillRect(x * cell, y * cell, cell, cell);
            }
            
            // Highlight selected piece
            if (selected && selected.x === x && selected.y === y) {
                ctx.shadowColor = "#00ff00";
                ctx.shadowBlur = 20;
                ctx.strokeStyle = "#00ff88";
                ctx.lineWidth = 8;
                ctx.strokeRect(x * cell + 4, y * cell + 4, cell - 8, cell - 8);
                ctx.shadowBlur = 0;
            }
            
            // Highlight mandatory capture pieces (Orange pulse)
            const isMandatoryCapturePiece = allMandatoryCapturePieces.some(p => p.x === x && p.y === y);
            if (allMandatoryCapturePieces.length > 0 && isMandatoryCapturePiece) {
                ctx.fillStyle = `rgba(255, 165, 0, ${0.4 + 0.6 * flashAlpha})`;
                ctx.beginPath();
                ctx.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.45, 0, Math.PI * 2);
                ctx.fill();
            }

            // Draw pieces (1:White, 2:White King, 3:Black, 4:Black King)
            const p = board[y][x];
            if (p) {
                const white = p === 1 || p === 2;
                const king = p === 2 || p === 4;
                
                // Draw piece body
                ctx.fillStyle = white ? "#fff" : "#2d1b14";
                ctx.beginPath();
                ctx.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = white ? "#333" : "#ddd";
                ctx.lineWidth = 5;
                ctx.stroke();
                
                if (king) {
                    // Draw King Crown
                    ctx.fillStyle = "#ffd700";
                    ctx.shadowColor = "#ffd700";
                    ctx.shadowBlur = 15;
                    ctx.font = `bold ${cell * 0.35}px Arial`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    // Using a simple unicode crown for consistency
                    ctx.fillText("👑", x * cell + cell / 2, y * cell + cell / 2); 
                    ctx.shadowBlur = 0;
                }
            }
        }
    }
    
    // Request animation frame for continuous drawing (only if not animating a move)
    if (!animating && board) {
        requestAnimationFrame(draw);
    }
}

// --- INTERACTION HANDLING ---

// Calculates the grid position from touch/click coordinates
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
        const piece = board[pos.y][pos.x];
        
        // Is the clicked piece mine?
        const mine = (myColor === "white" && (piece === 1 || piece === 2)) ||
                     (myColor === "black" && (piece === 3 || piece === 4));
        
        const myPieceColor = myColor === "white" ? 1 : 3;
        
        // Find all pieces that MUST capture globally
        let allMandatoryCapturePieces = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (p && (p === myPieceColor || p === myPieceColor + 1)) {
                    // Check if this piece has any capture moves
                    if (getValidMoves(c, r).some(m => m.captures?.length > 0)) {
                        allMandatoryCapturePieces.push({ x: c, y: r });
                    }
                }
            }
        }
        
        // 1. Selecting my own piece
        if (mine) {
            let canSelect = true;

            // Check forced capture rule
            if (allMandatoryCapturePieces.length > 0) {
                const isMandatoryPiece = allMandatoryCapturePieces.some(p => p.x === pos.x && p.y === pos.y);
                if (!isMandatoryPiece) {
                    canSelect = false;
                    alertModal("Zorunlu yeme var! Sadece yeme yapabilen taşları seçebilirsiniz.");
                }
            }

            if (canSelect) {
                selected = pos; 
            } else {
                selected = null; 
            }
        } 
        // 2. Making a move to a target square
        else if (selected) {
            const moves = getValidMoves(selected.x, selected.y);
            const validMove = moves.find(m => m.x === pos.x && m.y === pos.y);
            
            if (validMove) {
                // CRITICAL FIX: Send move to server and start animation
                animating = true;
                socket.emit("move", { from: selected, to: pos });
                
                selected = null;
                clearInterval(timerInterval); // Stop timer immediately upon action
                
            } else {
                // Invalid target click or clicking opponent piece
                selected = null; 
            }
        } else {
            selected = null;
        }

        requestAnimationFrame(draw);
    }, { passive: false });
});

// --- SOCKET EVENTS ---

socket.on("connect", () => statusEl.textContent = "✅ Sunucuya Bağlandı. Hazır!");
socket.on("searching", () => {
    document.getElementById("searching").classList.remove("hidden");
    document.getElementById("rankedBtn").disabled = true;
});

// FIX: Room code display issue corrected here
socket.on("roomCreated", code => {
    document.getElementById("searching").classList.add("hidden");
    document.getElementById("roomInfo").classList.remove("hidden");
    document.getElementById("roomCode").textContent = code; // FIX: Update the code element
    alertModal(`Özel Oda Kuruldu! Kod: ${code}`);
});

socket.on("errorMsg", msg => {
    statusEl.textContent = `Hata: ${msg}`;
    alertModal(`Hata: ${msg}`);
    // Reset lobby elements on error
    document.getElementById("searching").classList.add("hidden");
    document.getElementById("roomInfo").classList.add("hidden");
    document.getElementById("rankedBtn").disabled = false;
    console.error(msg); 
});

// FIX: Opponent left event - Send both back to lobby
socket.on("opponentLeft", () => {
    clearInterval(timerInterval);
    timerEl.classList.add("hidden");
    alertModal("Rakip oyunu terk etti. Lobiye yönlendiriliyorsunuz.");
    // Force a clean reload after showing the message
    setTimeout(() => location.reload(), 3000); 
});


socket.on("gameStart", data => {
    board = data.board; 
    myColor = data.color; 
    myTurn = data.turn === data.color;

    // Set player names based on color
    const opponentName = data.opponentName || "Rakip Oyuncu";
    const myActualName = myName;
    
    if (myColor === "white") {
        p1NameEl.textContent = opponentName; // Rakip (Siyah)
        p2NameEl.textContent = myActualName; // Ben (Beyaz)
    } else {
        p1NameEl.textContent = myActualName; // Ben (Siyah)
        p2NameEl.textContent = opponentName; // Rakip (Beyaz)
    }
    
    lobbyEl.classList.remove("active");
    gameEl.classList.add("active");
    
    updateStatus(data.turn);
    resize(); 
    requestAnimationFrame(draw); 
});

socket.on("boardUpdate", data => {
    board = data.board; 
    myTurn = data.turn === myColor;
    animating = false; // Move is confirmed/completed

    // Multi-capture scenario
    if (data.canMultiCapture && myTurn) {
         gameStatusEl.textContent = "Çoklu Yeme Fırsatı! Devam et.";
         startTimer(20);
    } else {
        updateStatus(data.turn);
    }

    requestAnimationFrame(draw); 
});

// --- GAME OVER EVENT ---
socket.on("gameOver", data => {
    clearInterval(timerInterval);
    timerEl.classList.add("hidden");
    
    let message = "";
    if (data.winner === myColor) {
        message = "🎉 KAZANDIN! 🎉";
        confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
    } else if (data.winner) {
        message = `😞 KAYBETTİN (${data.winner === "white" ? p2NameEl.textContent : p1NameEl.textContent} kazandı) 😞`;
    } else {
        message = "🤝 BERABERLİK 🤝";
    }
    
    gameOverEl.textContent = message;
    gameOverEl.style.display = "block";
    gameStatusEl.textContent = "Oyun bitti. Lobiye dönülüyor...";

    // FIX: Send both back to lobby after game over message
    setTimeout(() => {
        location.reload(); 
    }, 5000);
});

// Updates turn status and indicator lights
function updateStatus(currentTurn) {
    const isWhiteTurn = currentTurn === "white";
    const myTurnNow = currentTurn === myColor;
    
    // P1 (top) Light: Black's turn (P1 is always Black in code logic)
    document.getElementById("l1").classList.toggle("active", !isWhiteTurn); 
    // P2 (bottom) Light: White's turn (P2 is always White in code logic)
    document.getElementById("l2").classList.toggle("active", isWhiteTurn); 

    if (myTurnNow) {
        gameStatusEl.textContent = "SIRA SENDE! Hamleni yap.";
        startTimer(20); 
    } else {
        gameStatusEl.textContent = `SIRA RAKİPTE (${currentTurn}). Bekleniyor...`;
        clearInterval(timerInterval); 
    }
}

// --- LOBBY INTERACTIONS ---

document.getElementById("rankedBtn").onclick = () => {
    document.getElementById("rankedBtn").disabled = true;
    socket.emit("findMatch", { name: myName, id: myID }); 
};
document.getElementById("createBtn").onclick = () => {
    document.getElementById("joinBox").classList.add("hidden");
    document.getElementById("rankedBtn").disabled = true;
    socket.emit("createRoom", { name: myName, id: myID }); 
};
document.getElementById("joinToggleBtn").onclick = () => {
    const joinBox = document.getElementById("joinBox");
    joinBox.classList.toggle("hidden");
    document.getElementById("roomInfo").classList.add("hidden");
    document.getElementById("searching").classList.add("hidden");
    document.getElementById("rankedBtn").disabled = false; // Ensure search is enabled after toggling join
    if (!joinBox.classList.contains("hidden")) {
         document.getElementById("codeInput").focus();
    }
};
document.getElementById("joinBtn").onclick = () => {
    const code = document.getElementById("codeInput").value;
    if (code.length === 4) {
        document.getElementById("joinBox").classList.add("hidden");
        socket.emit("joinRoom", { code: code, name: myName, id: myID }); 
    } else {
        alertModal("Lütfen 4 haneli bir kod girin.");
    }
};
document.getElementById("copyBtn").onclick = () => {
    // Copy code to clipboard
    const code = document.getElementById("roomCode").textContent;
    const tempInput = document.createElement('textarea');
    tempInput.value = code;
    document.body.appendChild(tempInput);
    tempInput.select();
    try {
        document.execCommand('copy');
        alertModal("Oda Kodu Kopyalandı!");
    } catch (err) {
        alertModal("Kopyalama Başarısız.");
    }
    document.body.removeChild(tempInput);
};

// All cancel and exit buttons trigger a clean page reload (Lobby reset)
document.getElementById("cancelSearchBtn").onclick = () => location.reload();
document.getElementById("cancelRoomBtn").onclick = () => location.reload();
document.getElementById("leaveGameBtn").onclick = () => {
    socket.emit("leaveGame"); // Notify server
    location.reload(); 
};
