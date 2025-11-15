// dama_oyunu.js - TEK DOSYADA TAM ÇÖZÜM (Node.js Sunucu + İstemci Kodu)
// Terminalde çalıştırma: node dama_oyunu.js 

const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const PORT = process.env.PORT || 3000; 
const app = express();
const server = http.createServer(app);
const io = socketio(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const users = {}; 
let rankedQueue = []; 
const games = {}; 

// --- İSTEMCİ KODU (HTML ve JS) ---

app.get('/', (req, res) => {
    // HTML/CSS/JS hepsi bu string içinde birleştirilmiştir.
    res.send(`
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Online Türk Daması</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap" rel="stylesheet">
    <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>

    <style>
        :root {
            --primary-color: #e74c3c; 
            --secondary-color: #2ecc71; 
            --tertiary-color: #3498db; 
            --dark-bg: #141c24; 
            --card-bg: #2c3e50; 
            --square-light: #f5f5dc; 
            --square-dark: #8b4513;  
            --piece-size: 75%; 
        }

        body { 
            font-family: 'Roboto', sans-serif; 
            background: linear-gradient(135deg, var(--dark-bg), #1e2a38); 
            color: #fff; 
            margin: 0; 
            height: 100vh; 
            overflow: hidden; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
        }
        
        #app-container { 
            width: 100%; height: 100%; 
            padding: 10px; box-sizing: border-box; 
            display: flex; flex-direction: column; 
            justify-content: center; align-items: center; 
        }
        
        .screen { display: none; width: 95%; max-width: 500px; }
        .screen.active { 
            display: flex;
            flex-direction: column;
            align-items: center;
            animation: fadeIn 0.6s ease-out;
        }
        @keyframes fadeIn { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }

        #entry-screen { 
            background: var(--card-bg); 
            padding: 40px 30px; 
            border-radius: 15px; 
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6); 
            border: 1px solid rgba(255, 255, 255, 0.1);
            text-align: center;
        }
        .logo-text { font-size: 3.5em; margin-bottom: 10px; font-weight: 900; letter-spacing: 2px; text-shadow: 3px 3px #000; }
        .logo-span { color: var(--primary-color); }
        
        #status { color: var(--secondary-color); font-weight: bold; margin-top: 15px; transition: color 0.3s; }
        #status.error { color: var(--primary-color); }

        .main-btn { 
            padding: 18px 30px; margin: 12px 0; 
            width: 100%; 
            border: none; border-radius: 10px; 
            cursor: pointer; font-size: 1.3em; font-weight: 700; 
            transition: all 0.3s; 
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
            text-transform: uppercase;
        }
        .main-btn:hover:not(:disabled) { transform: translateY(-4px); box-shadow: 0 8px 12px rgba(0, 0, 0, 0.5); }
        .main-btn:disabled { background-color: #55606d; cursor: not-allowed; color: #bbb; transform: none; box-shadow: none; }
        
        #rankedBtn { background-color: var(--primary-color); color: white; }
        #createGameBtn { background-color: var(--tertiary-color); color: white; }

        #game { justify-content: space-between; height: 98vh; padding: 0; max-width: 550px; }
        .player-info-card {
            background: rgba(44, 62, 80, 0.8);
            border-radius: 10px;
            padding: 10px 15px;
            width: 90%;
            text-align: center;
            margin: 5px 0;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
            font-size: 0.9em;
            transition: all 0.3s;
        }
        .player-info-card.active-turn {
            border: 3px solid var(--secondary-color);
            transform: scale(1.05);
            box-shadow: 0 0 15px var(--secondary-color);
        }

        #game-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 90%;
            margin: 10px 0;
        }

        #board { 
            width: 90vmin; 
            height: 90vmin;
            max-width: 500px; 
            max-height: 500px; 
            margin: auto; 
            border: 6px solid var(--tertiary-color); 
            box-shadow: 0 0 25px rgba(0, 0, 0, 0.7);
            transition: transform 0.5s; 
            display: grid; 
            grid-template-columns: repeat(8, 1fr);
            grid-template-rows: repeat(8, 1fr);
        }

        .square {
            width: 100%; height: 100%; display: flex; justify-content: center;
            align-items: center; position: relative; cursor: pointer;
        }
        .square.light { background-color: var(--square-light); }
        .square.dark { background-color: var(--square-dark); }
        
        .square.possible-move::after {
            content: ''; position: absolute; width: 60%; height: 60%;
            border-radius: 50%; background-color: rgba(46, 204, 113, 0.7); 
            pointer-events: none; z-index: 5;
            animation: pulse 1s infinite alternate;
        }
        @keyframes pulse {
            0% { transform: scale(0.8); opacity: 0.7; }
            100% { transform: scale(1); opacity: 1; }
        }


        .piece {
            width: var(--piece-size); height: var(--piece-size); border-radius: 50%;
            position: absolute; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
            display: flex; justify-content: center; align-items: center;
            font-size: 1.2em; transition: transform 0.2s, box-shadow 0.2s;
            cursor: pointer;
        }
        .piece.black { background-color: #333; border: 3px solid #000; color: #eee; }
        .piece.white { background-color: #eee; border: 3px solid #ccc; color: #333; }
        .piece.selected { box-shadow: 0 0 0 5px var(--secondary-color), 0 0 15px var(--secondary-color); }
        .piece.king i { color: var(--primary-color); font-size: 0.8em; }

        #board.player2-view { transform: rotate(180deg); }
        #board.player2-view .piece { transform: rotate(180deg); }


        .sub-screen-overlay { 
            position: fixed; top: 0; left: 0; 
            width: 100%; height: 100%; 
            background: rgba(0, 0, 0, 0.85); 
            display: none; justify-content: center; align-items: center; 
            z-index: 100;
        }
        .sub-screen-content { 
            background: var(--card-bg); 
            padding: 40px; border-radius: 15px; 
            box-shadow: 0 0 50px rgba(0, 0, 0, 0.9); 
            text-align: center;
            animation: slideUp 0.4s ease-out;
            max-width: 90%;
        }
        .sub-screen-overlay.active { display: flex; }
        #currentRoomCode span { 
            font-size: 3em; color: var(--secondary-color); font-weight: 900; 
            letter-spacing: 8px; display: block; margin: 15px 0; text-shadow: 2px 2px #000;
        }
        #roomIdInput {
            font-size: 2em; width: 100%; text-align: center; margin: 15px 0;
            padding: 10px; border-radius: 8px; border: none;
            background-color: #3f5163; color: white;
        }
         @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

    </style>
</head>
<body>
    <div id="app-container">
        
        <div id="entry-screen" class="screen active">
            <h1 class="logo-text">TÜRK <span class="logo-span">DAMA</span></h1>
            
            <p id="player-name" style="font-weight: bold; color: var(--secondary-color); margin: 20px 0;">Giriş Yapılıyor...</p>
            
            <p id="status" class="info-text">Sunucuya bağlanılıyor...</p>
            
            <div class="lobby-controls" style="width: 100%; margin-top: 20px;">
                <button id="rankedBtn" class="main-btn" disabled>
                    <i class="fas fa-crown"></i> Dereceli Oyna
                </button>

                <button id="showRoomOptionsBtn" class="main-btn" disabled>
                    <i class="fas fa-users"></i> Arkadaşla Oyna (Oda)
                </button>
            </div>
        </div>
        
        <div id="game" class="screen">
            <div id="opponent-card" class="player-info-card">
                <i class="fas fa-user-circle"></i> <span id="opponentNameDisplay">Rakip Bekleniyor</span> 
            </div>

            <div id="game-header">
                <h2 id="turnIndicator">Sıra: Bekleniyor...</h2>
                <button id="leaveBtn" class="main-btn" style="padding: 10px 15px; font-size: 1em; background-color: var(--primary-color);">
                    <i class="fas fa-times"></i> Ayrıl
                </button>
            </div>
            
            <div class="board-wrapper">
                <div id="board">
                </div>
            </div>

            <div id="my-card" class="player-info-card">
                <i class="fas fa-chess-pawn"></i> <span id="myNameDisplay">Siz</span>
            </div>
        </div>

        <div id="roomOptionsOverlay" class="sub-screen-overlay">
            <div class="sub-screen-content">
                <h3>Arkadaşla Oyna</h3>
                <button id="createGameBtn" class="main-btn" style="background-color: var(--tertiary-color);">
                    <i class="fas fa-plus-circle"></i> Oda Kur
                </button>
                <button id="showJoinBtn" class="main-btn" style="background-color: var(--secondary-color);">
                    <i class="fas fa-sign-in-alt"></i> Odaya Katıl
                </button>
                <button id="cancelRoomOptionsBtn" class="main-btn" style="background-color: #55606d; font-size: 1em;">
                    <i class="fas fa-arrow-left"></i> Geri
                </button>
            </div>
        </div>

        <div id="createOverlay" class="sub-screen-overlay">
            <div class="sub-screen-content">
                <h3><i class="fas fa-door-open"></i> Yeni Oda Kuruldu</h3>
                <p class="info-text">Oda Kodunu Rakibine Gönder:</p>
                <p id="currentRoomCode" class="info-text"><span>****</span></p>
                <p id="createStatus" class="info-text">Rakip bekleniyor...</p>
                <button id="cancelCreateBtn" class="main-btn" style="background-color: var(--primary-color); font-size: 1em;">
                    <i class="fas fa-times"></i> İptal Et/Kapat
                </button>
            </div>
        </div>

        <div id="joinOverlay" class="sub-screen-overlay">
            <div class="sub-screen-content">
                <h3><i class="fas fa-sign-in-alt"></i> Odaya Katıl</h3>
                <input type="number" id="roomIdInput" placeholder="4 HANELİ KOD" maxlength="4">
                <button id="joinBtn" class="main-btn" style="background-color: var(--secondary-color); margin-top: 15px;">
                    <i class="fas fa-check"></i> Katıl
                </button>
                <button id="cancelJoinBtn" class="main-btn" style="background-color: #55606d; font-size: 1em;">
                    <i class="fas fa-times"></i> İptal
                </button>
            </div>
        </div>

        <div id="matchmakingOverlay" class="sub-screen-overlay">
            <div class="sub-screen-content">
                <h3><i class="fas fa-search"></i> Dereceli Eşleşme Aranıyor</h3>
                <div class="spinner" style="border: 8px solid rgba(255, 255, 255, 0.1); border-top: 8px solid var(--primary-color); border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 20px auto;"></div>
                <p id="matchmakingStatusText" class="info-text" style="font-size: 1.2em;">Kuyrukta bekleniyor...</p>
                <button id="cancelRankedBtn" class="main-btn" style="background-color: var(--primary-color); font-size: 1em;">
                    <i class="fas fa-times"></i> Aramayı İptal Et
                </button>
            </div>
        </div>
    </div>
    
    <script>
        // CLIENT-SIDE JAVASCRIPT BAŞLANGICI
        const socket = io('http://localhost:3000'); 
        
        const entryScreen = document.getElementById('entry-screen');
        const gameDiv = document.getElementById('game');
        const statusDiv = document.getElementById('status');
        const boardDiv = document.getElementById('board');
        const turnIndicator = document.getElementById('turnIndicator');
        const playerNameDisplay = document.getElementById('player-name');
        const opponentNameDisplay = document.getElementById('opponentNameDisplay');
        const myNameDisplay = document.getElementById('myNameDisplay');

        const rankedBtn = document.getElementById('rankedBtn');
        const showRoomOptionsBtn = document.getElementById('showRoomOptionsBtn');
        const createGameBtn = document.getElementById('createGameBtn');
        const showJoinBtn = document.getElementById('showJoinBtn');
        const leaveBtn = document.getElementById('leaveBtn');

        const roomOptionsOverlay = document.getElementById('roomOptionsOverlay');
        const createOverlay = document.getElementById('createOverlay');
        const currentRoomCode = document.getElementById('currentRoomCode').querySelector('span');
        const joinOverlay = document.getElementById('joinOverlay');
        const roomIdInput = document.getElementById('roomIdInput');
        const joinBtn = document.getElementById('joinBtn');
        const matchmakingOverlay = document.getElementById('matchmakingOverlay');
        const myCard = document.getElementById('my-card');
        const opponentCard = document.getElementById('opponent-card');
        const matchmakingStatusText = document.getElementById('matchmakingStatusText');

        let currentRoomId = null;
        let playerRole = null;
        let currentBoard = null;
        let currentTurn = null;
        let currentUsername = null; 
        let selectedPiece = null; 
        let possibleMoves = [];

        function generateGuestName() {
            return \`Guest\${Math.floor(Math.random() * 900) + 100}\`;
        }

        function checkAndSetUsername() {
            const urlParams = new URLSearchParams(window.location.search);
            const tgUsername = urlParams.get('username'); 
            const tgId = urlParams.get('id'); 
            
            if (tgUsername) {
                currentUsername = \`@\${tgUsername}\`;
            } else if (tgId) {
                currentUsername = \`User_\${tgId}\`;
            } else {
                currentUsername = generateGuestName(); 
            }
            playerNameDisplay.textContent = \`Oyuncu: \${currentUsername}\`;
        }
        checkAndSetUsername(); 

        function setEntryButtons(enabled) {
            rankedBtn.disabled = !enabled;
            showRoomOptionsBtn.disabled = !enabled;
        }

        function toggleOverlay(overlayElement, show) {
            document.querySelectorAll('.sub-screen-overlay').forEach(overlay => {
                if(overlay !== overlayElement) overlay.classList.remove('active');
            });

            if (show) {
                overlayElement.classList.add('active');
                entryScreen.classList.remove('active');
                gameDiv.classList.remove('active');
                setEntryButtons(false);
            } else {
                overlayElement.classList.remove('active');
                
                if (!gameDiv.classList.contains('active') && !matchmakingOverlay.classList.contains('active')) {
                    entryScreen.classList.add('active');
                    if(socket.connected) setEntryButtons(true);
                }
            }
        }

        function resetGame() {
            currentRoomId = null;
            playerRole = null;
            currentBoard = null;
            currentTurn = null;
            selectedPiece = null;
            possibleMoves = [];
            clearSelections();
            
            gameDiv.classList.remove('active');
            entryScreen.classList.add('active');
            
            turnIndicator.textContent = 'Sıra: Bekleniyor...';
            boardDiv.classList.remove('player2-view');
            opponentCard.classList.remove('active-turn');
            myCard.classList.remove('active-turn');
            opponentNameDisplay.innerHTML = 'Rakip Bekleniyor';
            myNameDisplay.innerHTML = \`\${currentUsername} (Taşlar: ?)\`;
            
            document.querySelectorAll('.sub-screen-overlay').forEach(o => o.classList.remove('active'));

            if(socket.connected) {
                setEntryButtons(true);
            }
        }

        function clearSelections() {
            selectedPiece = null;
            possibleMoves = [];
            document.querySelectorAll('.piece.selected').forEach(p => p.classList.remove('selected'));
            document.querySelectorAll('.square.possible-move').forEach(s => s.classList.remove('possible-move'));
        }

        function updateBoard(board, forcedSelection = null) {
            currentBoard = board;
            boardDiv.innerHTML = '';
            
            // Eğer zorunlu seçim varsa (zincirleme vurma), mevcut seçimi koru.
            const tempSelected = forcedSelection || selectedPiece;
            clearSelections();

            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const square = document.createElement('div');
                    const isDark = (r + c) % 2 !== 0; 
                    square.className = \`square \${isDark ? 'dark' : 'light'}\`;
                    square.dataset.row = r;
                    square.dataset.col = c;
                    square.addEventListener('click', handleSquareClick);
                    
                    const pieceType = board[r][c];
                    if (pieceType !== 0) {
                        const piece = document.createElement('div');
                        let pieceClass = '';
                        let isKing = false;

                        if (pieceType === 1 || pieceType === 3) pieceClass = 'black'; 
                        if (pieceType === 2 || pieceType === 4) pieceClass = 'white'; 
                        if (pieceType === 3 || pieceType === 4) isKing = true;
                        
                        const kingIcon = isKing ? '<i class="fas fa-crown"></i>' : '';

                        piece.className = \`piece \${pieceClass} \${isKing ? 'king' : ''}\`;
                        piece.innerHTML = kingIcon;
                        piece.addEventListener('click', handlePieceClick);
                        
                        // Seçili taşı yeniden işaretle
                        if (tempSelected && tempSelected.row === r && tempSelected.col === c) {
                             piece.classList.add('selected');
                             selectedPiece = tempSelected; 
                        }

                        square.appendChild(piece);
                    }
                    boardDiv.appendChild(square);
                }
            }
        }

        function updateTurn(turn) {
            currentTurn = turn;
            const isMyTurn = playerRole === turn;
            
            turnIndicator.textContent = isMyTurn ? 'SIRA SİZDE! 🟢' : 'Rakibinizin sırası... 🔴';

            if (isMyTurn) {
                myCard.classList.add('active-turn');
                opponentCard.classList.remove('active-turn');
            } else {
                myCard.classList.remove('active-turn');
                opponentCard.classList.add('active-turn');
            }
        }

        function highlightMoves(moves) {
            document.querySelectorAll('.square.possible-move').forEach(s => s.classList.remove('possible-move'));
            
            moves.forEach(move => {
                const square = document.querySelector(\`[data-row="\${move.row}"][data-col="\${move.col}"]\`);
                if (square) {
                    square.classList.add('possible-move');
                }
            });
        }

        function handlePieceClick(event) {
            event.stopPropagation(); 
            
            const piece = event.currentTarget;
            const square = piece.parentElement;
            const clickedPos = { row: parseInt(square.dataset.row), col: parseInt(square.dataset.col) };
            const pieceType = currentBoard[clickedPos.row][clickedPos.col];
            
            const isMyPiece = (playerRole === 'player1' && (pieceType === 1 || pieceType === 3)) ||
                             (playerRole === 'player2' && (pieceType === 2 || pieceType === 4));
            
            if (currentTurn === playerRole && isMyPiece) {
                if (selectedPiece && selectedPiece.row === clickedPos.row && selectedPiece.col === clickedPos.col) {
                    clearSelections();
                } else {
                    clearSelections();
                    selectedPiece = clickedPos;
                    piece.classList.add('selected');
                    
                    // Hamle isteği
                    socket.emit('getPossibleMoves', { roomId: currentRoomId, from: clickedPos });
                }
            } else {
                clearSelections();
            }
        }

        function handleSquareClick(event) {
            const square = event.currentTarget;
            const target = { row: parseInt(square.dataset.row), col: parseInt(square.dataset.col) };

            const isPossible = possibleMoves.some(move => move.row === target.row && move.col === target.col);

            if (selectedPiece && isPossible) {
                socket.emit('move', { 
                    roomId: currentRoomId, 
                    from: selectedPiece, 
                    to: target 
                });
                clearSelections(); 
            } else {
                clearSelections();
            }
        }

        // --- SOCKET BAĞLANTILARI ---

        socket.on('connect', () => {
            statusDiv.textContent = '✅ Sunucuya bağlanıldı.';
            statusDiv.classList.remove('error');
            statusDiv.classList.add('green');
            socket.emit('playerIdentity', { username: currentUsername });
            resetGame();
        });

        socket.on('readyToPlay', () => {
            statusDiv.textContent = '✅ Hazır. Bir oyun seçin.';
            setEntryButtons(true);
        });

        socket.on('connect_error', (err) => {
            statusDiv.textContent = \`❌ Bağlantı hatası: Sunucuya ulaşılamıyor.\`;
            statusDiv.classList.remove('green');
            statusDiv.classList.add('error');
            setEntryButtons(false);
        });

        socket.on('matchFound', (data) => {
            toggleOverlay(matchmakingOverlay, false);
            currentRoomId = data.roomId;
            playerRole = data.role;
        });

        socket.on('gameStart', (data) => {
            entryScreen.classList.remove('active');
            gameDiv.classList.add('active');
            
            document.querySelectorAll('.sub-screen-overlay').forEach(o => o.classList.remove('active'));

            playerRole = data.player1Name === currentUsername ? 'player1' : 'player2';
            
            const isPlayer1 = playerRole === 'player1';
            const myColor = isPlayer1 ? 'Siyah' : 'Beyaz';
            const opponentName = isPlayer1 ? data.player2Name : data.player1Name;
            const myName = isPlayer1 ? data.player1Name : data.player2Name;
            const opponentColor = isPlayer1 ? 'Beyaz' : 'Siyah';

            myNameDisplay.innerHTML = \`<i class="fas fa-chess-pawn"></i> \${myName} (\${myColor} Taşlar)\`;
            opponentNameDisplay.innerHTML = \`<i class="fas fa-user-circle"></i> \${opponentName} (\${opponentColor} Taşlar)\`;
            
            updateBoard(data.board);
            updateTurn(data.turn);

            if (!isPlayer1) {
                boardDiv.classList.add('player2-view');
            } else {
                boardDiv.classList.remove('player2-view');
            }
        });

        socket.on('possibleMoves', (moves) => {
             possibleMoves = moves; 
             highlightMoves(moves);
        });


        socket.on('boardUpdate', (data) => {
            updateBoard(data.board, data.chained ? data.to : null);
            updateTurn(data.turn);

            if (data.chained) {
                 statusDiv.textContent = 'ZİNCİRLEME VURMA! Aynı taşla devam edin.';
                 // Zincirleme vurmada, sunucudan gelen yeni pozisyondan hamleleri tekrar iste
                 const newSelectedPos = data.to;
                 selectedPiece = newSelectedPos;
                 socket.emit('getPossibleMoves', { roomId: currentRoomId, from: selectedPiece });
            } else {
                 clearSelections();
            }
        });


        socket.on('gameOver', (data) => {
            const isMe = data.winner === playerRole;
            alert(\`OYUN BİTTİ! \${isMe ? 'TEBRİKLER! Oyunu Kazandınız! 🎉' : 'Üzgünüm, Oyunu Kaybettiniz. 😔'} Sebep: \${data.reason}\`);
            resetGame();
        });
        
        // ... (Diğer tüm client eventleri)
        
        socket.on('matchMakingStatus', (message) => {
            matchmakingStatusText.textContent = message;
        });

        socket.on('opponentDisconnected', (message) => {
            alert(message);
            resetGame();
        });

        socket.on('gameLeft', () => {
             alert('Oyundan başarıyla ayrıldınız.');
             resetGame();
        });

        socket.on('invalidMove', (data) => {
            alert("Geçersiz Hamle: " + data.message);
            clearSelections(); 
        });

        // --- BUTON OLAYLARI ---
        rankedBtn.addEventListener('click', () => {
            toggleOverlay(matchmakingOverlay, true);
            matchmakingStatusText.textContent = 'Eşleşme aranıyor...';
            socket.emit('findRankedMatch');
        });

        showRoomOptionsBtn.addEventListener('click', () => {
            toggleOverlay(roomOptionsOverlay, true);
        });

        createGameBtn.addEventListener('click', () => {
            toggleOverlay(roomOptionsOverlay, false);
            toggleOverlay(createOverlay, true);
            currentRoomCode.textContent = '....'; 

            socket.emit('createGame', (response) => {
                if (response.success) {
                    currentRoomId = response.roomId;
                    playerRole = response.role;
                    currentRoomCode.textContent = currentRoomId; 
                    document.getElementById('createStatus').textContent = 'Rakip bekleniyor... (Oda Kodu: ' + currentRoomId + ')';
                } else {
                    currentRoomCode.textContent = 'HATA';
                    document.getElementById('createStatus').textContent = 'Oda kurulamadı: ' + response.message;
                }
            });
        });

        showJoinBtn.addEventListener('click', () => {
            toggleOverlay(roomOptionsOverlay, false);
            toggleOverlay(joinOverlay, true);
            roomIdInput.value = '';
        });

        joinBtn.addEventListener('click', () => {
            const roomId = roomIdInput.value.trim();
            if (roomId.length !== 4) {
                alert('Lütfen 4 haneli bir oda kodu girin.');
                return;
            }
            toggleOverlay(joinOverlay, false);
            
            socket.emit('joinGame', { roomId: roomId }, (response) => {
                if (!response.success) {
                    alert('Hata: ' + response.message);
                    resetGame();
                } else {
                    currentRoomId = response.roomId;
                    playerRole = response.role;
                }
            });
        });


        document.getElementById('cancelRoomOptionsBtn').addEventListener('click', () => toggleOverlay(roomOptionsOverlay, false));
        document.getElementById('cancelJoinBtn').addEventListener('click', () => toggleOverlay(joinOverlay, false));

        document.getElementById('cancelCreateBtn').addEventListener('click', () => {
             if (currentRoomId) socket.emit('leaveGame', { roomId: currentRoomId });
             resetGame(); 
        });

        document.getElementById('cancelRankedBtn').addEventListener('click', () => {
            socket.emit('cancelMatchmaking');
            toggleOverlay(matchmakingOverlay, false);
        });

        leaveBtn.addEventListener('click', () => {
            if (currentRoomId) {
                socket.emit('leaveGame', { roomId: currentRoomId });
            } else {
                resetGame();
            }
        });


        updateBoard(Array(8).fill(0).map(() => Array(8).fill(0)));
        // CLIENT-SIDE JAVASCRIPT SONU
    </script>
</body>
</html>
    `);
});


// --- SUNUCU KODU (TÜRK DAMASI MANTIĞI) ---

// Tahta Kodları: 0=Boş, 1=Siyah Taş (P1), 2=Beyaz Taş (P2), 3=Siyah Kral, 4=Beyaz Kral
function initializeBoard() {
    const board = Array(8).fill(0).map(() => Array(8).fill(0));
    // Türk Daması: Beyaz (P2) - Üst 3 sıra (0-2)
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
            board[r][c] = 2; // Beyaz
        }
    }
    // Türk Daması: Siyah (P1) - Alt 3 sıra (5-7)
    for (let r = 5; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            board[r][c] = 1; // Siyah
        }
    }
    return board;
}

function generateRoomId() {
    let roomId;
    do {
        roomId = Math.floor(1000 + Math.random() * 9000).toString();
    } while (games[roomId]);
    return roomId;
}

function removeFromQueue(socketId) {
    const index = rankedQueue.indexOf(socketId);
    if (index > -1) {
        rankedQueue.splice(index, 1);
        if (users[socketId]) users[socketId].isSearching = false;
        return true;
    }
    return false;
}

function getOpponentPieceCodes(pieceType) {
    if (pieceType === 1 || pieceType === 3) return [2, 4]; 
    if (pieceType === 2 || pieceType === 4) return [1, 3]; 
    return [];
}

/**
 * Belirtilen bir taştan yapılabilecek tüm geçerli hamleleri (normal ve vurma) bulur.
 * Türk Daması kuralı: Düz hareket (yatay/dikey). Vurma varsa zorunludur.
 */
function getPossibleMoves(game, r, c) {
    const board = game.board;
    const pieceType = board[r][c];
    if (pieceType === 0) return [];

    const isKing = pieceType === 3 || pieceType === 4;
    const isBlack = pieceType === 1 || pieceType === 3;
    const opponentCodes = getOpponentPieceCodes(pieceType);
    
    let moves = [];
    let hits = [];
    
    // Yönler: Sağ (0,1), Sol (0,-1), Aşağı (1,0), Yukarı (-1,0)
    const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]]; 

    for (const [dr, dc] of directions) {
        let currR = r + dr;
        let currC = c + dc;
        
        // Normal Taşlar için Geriye Gitme Kısıtlaması
        if (!isKing) {
            if (isBlack && dr === -1) continue; // Siyah geriye (yukarı) gidemez
            if (!isBlack && dr === 1) continue; // Beyaz geriye (aşağı) gidemez
        }

        // KURAL KONTROLÜ: Vurma (Rakip taşın hemen yanındaki boş kareye atlama)
        if (currR >= 0 && currR < 8 && currC >= 0 && currC < 8) {
            if (opponentCodes.includes(board[currR][currC])) {
                // Yanında rakip var: Atlama (Vurma) pozisyonunu kontrol et
                let landR = currR + dr;
                let landC = currC + dc;

                if (landR >= 0 && landR < 8 && landC >= 0 && landC < 8 && board[landR][landC] === 0) {
                    hits.push({ row: landR, col: landC, targetR: currR, targetC: currC, isHit: true });
                }
            }
        }
        
        // KURAL KONTROLÜ: Normal Hareket (Sadece 1 adım)
        if (currR >= 0 && currR < 8 && currC >= 0 && currC < 8 && board[currR][currC] === 0) {
            moves.push({ row: currR, col: currC, isHit: false });
        }
    }
    
    // ÖNEMLİ KURAL: Vurma varsa, sadece vurma hamleleri geçerlidir.
    if (hits.length > 0) return hits;
    
    return moves;
}

/**
 * Tahtadaki tüm taşlar için tüm geçerli hamleleri (vurma zorunluluğu dahil) bulur.
 */
function getAllPossibleMoves(game, role) {
    const board = game.board;
    let allMoves = [];
    const pieceCodes = role === 'player1' ? [1, 3] : [2, 4];
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (pieceCodes.includes(board[r][c])) {
                const moves = getPossibleMoves(game, r, c);
                moves.forEach(move => {
                    move.fromR = r;
                    move.fromC = c;
                    allMoves.push(move);
                });
            }
        }
    }
    
    const hasHits = allMoves.some(move => move.isHit);
    if (hasHits) {
        return allMoves.filter(move => move.isHit);
    }
    
    return allMoves;
}

function applyMove(game, from, to) {
    const board = game.board;
    const pieceType = board[from.row][from.col];
    const currentRole = game.turn;

    const isPlayer1Piece = pieceType === 1 || pieceType === 3;
    if (currentRole === 'player1' && !isPlayer1Piece) return { success: false, message: 'Sıra Siyah taşlarda.' };
    if (currentRole === 'player2' && isPlayer1Piece) return { success: false, message: 'Sıra Beyaz taşlarda.' };

    const allMoves = getAllPossibleMoves(game, currentRole);
    
    const validMove = allMoves.find(move => 
        move.fromR === from.row && 
        move.fromC === from.col && 
        move.row === to.row && 
        move.col === to.col
    );

    if (!validMove) {
        const hasAnyHit = allMoves.some(m => m.isHit);
        if (hasAnyHit) {
            return { success: false, message: 'Vurma zorunludur! Başka bir taşı seçmelisiniz veya farklı bir hamle yapmalısınız.' };
        }
        return { success: false, message: 'Geçersiz hamle.' };
    }

    if (validMove.isHit) {
        const hitMove = getPossibleMoves(game, from.row, from.col).find(m => 
            m.row === to.row && m.col === to.col && m.isHit
        );
        if (hitMove) {
            board[hitMove.targetR][hitMove.targetC] = 0; // Rakip taşı sil
        }
    }

    board[to.row][to.col] = pieceType;
    board[from.row][from.col] = 0;

    // Kral Olma Kontrolü
    if (pieceType === 1 && to.row === 0) board[to.row][to.col] = 3; 
    if (pieceType === 2 && to.row === 7) board[to.row][to.col] = 4;
    
    // Zincirleme Vurma Kontrolü
    let chained = false;
    if (validMove.isHit) {
        const nextMoves = getPossibleMoves(game, to.row, to.col);
        if (nextMoves.some(m => m.isHit)) {
            chained = true;
        }
    }
    
    // Sırayı değiştir (Zincirleme yoksa)
    if (!chained) {
        game.turn = currentRole === 'player1' ? 'player2' : 'player1';
    }

    return { success: true, board: board, turn: game.turn, chained: chained, from: from, to: to };
}

function checkWinCondition(game) {
    const p1Pieces = game.board.flat().filter(p => p === 1 || p === 3).length;
    const p2Pieces = game.board.flat().filter(p => p === 2 || p === 4).length;
    
    if (p1Pieces === 0) return { winner: 'player2', reason: `Siyah taşları bitti.` };
    if (p2Pieces === 0) return { winner: 'player1', reason: `Beyaz taşları bitti.` };

    const nextTurn = game.turn;
    const possibleMovesForNextTurn = getAllPossibleMoves(game, nextTurn);
    
    if (possibleMovesForNextTurn.length === 0) {
        const winner = nextTurn === 'player1' ? 'player2' : 'player1';
        return { winner: winner, reason: `${nextTurn === 'player1' ? game.player1Name : game.player2Name} hareket edemiyor.` };
    }

    return null; 
}


// --- SOCKET.IO SUNUCU MANTIĞI ---

io.on('connection', (socket) => {
    
    socket.on('playerIdentity', (data) => {
        const { username } = data;
        users[socket.id] = { username: username, isSearching: false };
        socket.emit('readyToPlay');
    });

    socket.on('findRankedMatch', () => {
        const user = users[socket.id];
        if (!user || user.isSearching || rankedQueue.includes(socket.id)) return;
        
        user.isSearching = true;
        rankedQueue.push(socket.id);
        socket.emit('matchMakingStatus', \`Eşleşme aranıyor... Kuyrukta: \${rankedQueue.length} kişi.\`);

        attemptMatchmaking(); 
    });

    function attemptMatchmaking() {
        rankedQueue = rankedQueue.filter(id => io.sockets.sockets.has(id));

        if (rankedQueue.length >= 2) {
            const player1Id = rankedQueue.shift(); 
            const player2Id = rankedQueue.shift(); 
            
            const player1 = users[player1Id];
            const player2 = users[player2Id];

            if (!player1 || !player2) { attemptMatchmaking(); return; }

            player1.isSearching = false;
            player2.isSearching = false;
            
            const roomId = generateRoomId();

            games[roomId] = {
                roomId: roomId,
                player1Id: player1Id,
                player1Name: player1.username,
                player2Id: player2Id,
                player2Name: player2.username,
                board: initializeBoard(),
                turn: 'player1' 
            };
            
            io.sockets.sockets.get(player1Id)?.join(roomId);
            io.sockets.sockets.get(player2Id)?.join(roomId);

            io.to(player1Id).emit('matchFound', { roomId: roomId, role: 'player1' });
            io.to(player2Id).emit('matchFound', { roomId: roomId, role: 'player2' });

            io.to(roomId).emit('gameStart', { 
                roomId: roomId,
                board: games[roomId].board, 
                turn: games[roomId].turn,
                player1Name: player1.username,
                player2Name: player2.username
            });

            attemptMatchmaking(); 
        } else {
             if(rankedQueue.length === 1 && users[rankedQueue[0]]) {
                 io.to(rankedQueue[0]).emit('matchMakingStatus', \`Eşleşme aranıyor... Kuyrukta: 1 kişi.\`);
             }
        }
    }
    
    socket.on('cancelMatchmaking', () => {
        const removed = removeFromQueue(socket.id);
        if (removed) {
            socket.emit('matchMakingCancelled', 'Eşleşme araması iptal edildi.');
            attemptMatchmaking();
        } 
    });

    socket.on('createGame', (callback) => {
        const user = users[socket.id];
        if (!user) return callback({ success: false, message: 'Kimlik yüklenmedi.' });

        removeFromQueue(socket.id);
        const roomId = generateRoomId();
        
        const game = {
            roomId: roomId,
            player1Id: socket.id,
            player1Name: user.username,
            player2Id: null,
            player2Name: null,
            board: initializeBoard(),
            turn: 'player1'
        };
        games[roomId] = game;
        socket.join(roomId);
        
        callback({ success: true, roomId: roomId, role: 'player1' }); 
    });

    socket.on('joinGame', (data, callback) => {
        const { roomId } = data;
        const user = users[socket.id];
        const game = games[roomId];

        if (!user || !game || game.player2Id) {
            return callback({ success: false, message: (!user ? 'Kimlik yüklenmedi.' : (!game ? 'Oda bulunamadı.' : 'Oda dolu.')) });
        }

        removeFromQueue(socket.id);
        game.player2Id = socket.id;
        game.player2Name = user.username;
        socket.join(roomId);
        callback({ success: true, roomId: roomId, role: 'player2' });

        io.to(roomId).emit('gameStart', { 
            roomId: roomId,
            board: game.board, 
            turn: game.turn,
            player1Name: game.player1Name,
            player2Name: game.player2Name
        });
    });

    socket.on('getPossibleMoves', (data) => {
        const game = games[data.roomId];
        if (!game) return;

        const isMyTurn = (game.turn === 'player1' && game.player1Id === socket.id) ||
                         (game.turn === 'player2' && game.player2Id === socket.id);
        
        if (!isMyTurn) return;

        const pieceRole = game.player1Id === socket.id ? 'player1' : 'player2';
        const allValidMoves = getAllPossibleMoves(game, pieceRole);
        
        const specificMoves = allValidMoves
            .filter(m => m.fromR === data.from.row && m.fromC === data.from.col)
            .map(m => ({ row: m.row, col: m.col }));
        
        socket.emit('possibleMoves', specificMoves);
    });

    socket.on('move', (data) => {
        const game = games[data.roomId];
        if (!game) return socket.emit('invalidMove', { message: 'Oyun bulunamadı.' });

        const isMyTurn = (game.turn === 'player1' && game.player1Id === socket.id) ||
                         (game.turn === 'player2' && game.player2Id === socket.id);
        
        if (!isMyTurn) return socket.emit('invalidMove', { message: 'Sıra sizde değil.' });

        const result = applyMove(game, data.from, data.to);

        if (result.success) {
            const winResult = checkWinCondition(game);

            if (winResult) {
                io.to(data.roomId).emit('gameOver', winResult);
                delete games[data.roomId];
            } else {
                io.to(data.roomId).emit('boardUpdate', { 
                    board: result.board, 
                    turn: result.turn, 
                    chained: result.chained,
                    from: result.from, 
                    to: result.to // Zincirleme için gerekli
                });
            }
        } else {
            socket.emit('invalidMove', { message: result.message });
        }
    });

    socket.on('leaveGame', (data) => {
        const { roomId } = data;
        const game = games[roomId];

        if (game) {
            const isPlayer1 = game.player1Id === socket.id;
            const opponentId = isPlayer1 ? game.player2Id : game.player1Id;

            if (opponentId && io.sockets.sockets.get(opponentId)) {
                io.to(opponentId).emit('opponentDisconnected', 'Rakibiniz oyundan ayrıldı, kazandınız!');
            }

            delete games[roomId];
            socket.emit('gameLeft');
        } else {
             socket.emit('gameLeft');
        }
    });

    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            removeFromQueue(socket.id);
            
            for (const roomId in games) {
                if (games[roomId].player1Id === socket.id || games[roomId].player2Id === socket.id) {
                    const game = games[roomId];
                    const opponentId = game.player1Id === socket.id ? game.player2Id : game.player1Id;
                    
                    if (opponentId && io.sockets.sockets.get(opponentId)) {
                        io.to(opponentId).emit('opponentDisconnected', 'Rakibiniz bağlantıyı kesti, kazandınız!');
                    }
                    delete games[roomId]; 
                    break;
                }
            }
            delete users[socket.id];
        }
    });
});

server.listen(PORT, () => {
    console.log(\`✅ Sunucu çalışıyor. Oyunu başlatmak için tarayıcınızda http://localhost:\${PORT} adresini açın.\`);
});
