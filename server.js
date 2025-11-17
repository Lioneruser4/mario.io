
// server.js (Render.com Sunucunuzda Çalışacak Dosya)

const WebSocket = require('ws');
const http = require('http');

// Basit bir HTTP sunucusu
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Checkers WebSocket Server Running.');
});

const wss = new WebSocket.Server({ server });

// Sunucu Durumları
const games = {}; 
const waitingForMatch = []; 
const roomLobbies = {}; 

// Yardımcı Fonksiyon: Oyunculara mesaj gönder
function broadcastGameUpdate(gameId, type, payload) {
    const game = games[gameId];
    if (!game) return;
    const message = JSON.stringify({ type, ...payload });
    game.players.forEach(p => {
        if (p.readyState === WebSocket.OPEN) {
            p.send(message);
        }
    });
}

// Amerikan Daması (Checkers) Başlangıç Tahtası
function initializeBoard() {
    const board = {};
    // Siyah: 6, 7, 8. Satırlar (Üstte) | Kırmızı: 1, 2, 3. Satırlar (Altta)
    const initialRows = { 'red': [1, 2, 3], 'black': [6, 7, 8] }; 

    for (const color in initialRows) {
        for (const r of initialRows[color]) {
            for (let c = 1; c <= 8; c++) {
                // Sadece koyu (dark) karelere taş konur: (Satır + Sütun) tek olmalı
                if ((r + c) % 2 !== 0) { 
                    const pos = String.fromCharCode(64 + c) + r;
                    board[pos] = { color, isKing: false };
                }
            }
        }
    }
    return board;
}

// Amerikan Daması Kurallarına Göre Yasal Hamleleri Hesaplar
function getLegalMoves(gameId, pos, color) {
    const game = games[gameId];
    if (!game) return [];
    
    const board = game.boardState;
    const piece = board[pos];
    if (!piece || piece.color !== color) return [];
    
    const legalMoves = [];
    const [col, row] = [pos[0], parseInt(pos.slice(1))];
    
    // Normal taşlar için ileri çapraz hareketler
    const directions = [];
    
    if (piece.isKing) {
        // Kral tüm yönlerde gidebilir
        directions.push([1,1], [1,-1], [-1,1], [-1,-1]);
    } else if (piece.color === 'red') {
        // Kırmızı aşağı gider
        directions.push([1,1], [1,-1]);
    } else {
        // Siyah yukarı gider
        directions.push([-1,1], [-1,-1]);
    }
    
    for (const [dr, dc] of directions) {
        const newRow = row + dr;
        const newCol = String.fromCharCode(col.charCodeAt(0) + dc);
        const newPos = newCol + newRow;
        
        // Boş kareye hareket
        if (!board[newPos] && newRow >= 1 && newRow <= 8 && newCol >= 'A' && newCol <= 'H') {
            legalMoves.push(newPos);
        } 
        // Rakip taşı atlama
        else if (board[newPos] && board[newPos].color !== color) {
            const jumpRow = newRow + dr;
            const jumpCol = String.fromCharCode(newCol.charCodeAt(0) + dc);
            const jumpPos = jumpCol + jumpRow;
            
            if (!board[jumpPos] && jumpRow >= 1 && jumpRow <= 8 && jumpCol >= 'A' && jumpCol <= 'H') {
                legalMoves.push(jumpPos);
            }
        }
    }
    
    return legalMoves;
}


// ==========================================================
// WEBSOCKET BAĞLANTI VE EYLEM İŞLEYİCİ
// ==========================================================

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleClientAction(ws, data);
        } catch (e) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Geçersiz JSON formatı.' }));
        }
    });

    ws.on('close', () => {
        const index = waitingForMatch.indexOf(ws);
        if (index > -1) waitingForMatch.splice(index, 1);
        // İstemci disconnect olduğunda oyun temizleme mantığı buraya gelir
    });
});

function handleClientAction(ws, data) {
    switch (data.type) {
        case 'FIND_MATCH':
            if (waitingForMatch.length > 0) {
                const opponentWs = waitingForMatch.shift();
                startNewGame(ws, opponentWs);
            } else {
                waitingForMatch.push(ws);
            }
            break;
            
        case 'CANCEL_SEARCH':
            const index = waitingForMatch.indexOf(ws);
            if (index > -1) waitingForMatch.splice(index, 1);
            break;
            
        case 'CREATE_ROOM':
            const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
            roomLobbies[roomCode] = { host: ws, guest: null, hostColor: 'red' };
            ws.send(JSON.stringify({ type: 'ROOM_CREATED', roomCode }));
            break;

        case 'JOIN_ROOM':
            const room = roomLobbies[data.roomCode];
            if (room && !room.guest) {
                room.guest = ws;
                startNewGame(room.host, room.guest);
                delete roomLobbies[data.roomCode]; 
            } else {
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Oda bulunamadı veya dolu.' }));
            }
            break;

        case 'GET_LEGAL_MOVES':
            const currentGame = games[data.gameId];
            if (!currentGame || ws !== currentGame.playerData[currentGame.turn]) return; // Sıra kontrolü
            
            const moves = getLegalMoves(data.gameId, data.pos, currentGame.turn);
            ws.send(JSON.stringify({ type: 'LEGAL_MOVES', moves: moves }));
            break;

        case 'MAKE_MOVE':
            const game = games[data.gameId];
            if (!game || ws !== game.playerData[game.turn]) {
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Sıra sizde değil veya oyun bulunamadı' }));
                return;
            }
            
            const { from, to } = data;
            const piece = game.boardState[from];
            
            // Geçerli hamle kontrolü
            if (!piece || piece.color !== game.turn) {
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Geçersiz hamle: Taş bulunamadı veya sıra sizde değil' }));
                return;
            }
            
            // Yasal hamleleri kontrol et
            const legalMoves = getLegalMoves(data.gameId, from, game.turn);
            if (!legalMoves.includes(to)) {
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Geçersiz hamle: Bu taş oraya gidemez' }));
                return;
            }
            
            // Hamleyi uygula
            delete game.boardState[from];
            game.boardState[to] = piece;
            
            // Eğer son sıraya ulaşıldıysa kral yap
            const row = parseInt(to.slice(1));
            if ((piece.color === 'red' && row === 8) || (piece.color === 'black' && row === 1)) {
                piece.isKing = true;
            }
            
            // Eğer zıplama yapıldıysa, arada kalan taşı kaldır
            const fromCol = from.charCodeAt(0) - 'A'.charCodeAt(0);
            const fromRow = parseInt(from.slice(1)) - 1;
            const toCol = to.charCodeAt(0) - 'A'.charCodeAt(0);
            const toRow = parseInt(to.slice(1)) - 1;
            
            // Eğer 2 kare atlandıysa (zıplama yapıldıysa)
            if (Math.abs(fromRow - toRow) === 2) {
                const jumpedRow = (fromRow + toRow) / 2;
                const jumpedCol = String.fromCharCode(((fromCol + toCol) / 2) + 'A'.charCodeAt(0));
                const jumpedPos = jumpedCol + (jumpedRow + 1);
                delete game.boardState[jumpedPos];
                
                // Zorunlu yeme kuralı: Eğer başka yeme hamlesi varsa sıra aynı kalır
                const hasMoreJumps = getLegalMoves(data.gameId, to, game.turn).some(move => 
                    Math.abs(parseInt(move.slice(1)) - 1 - toRow) === 2
                );
                
                if (!hasMoreJumps) {
                    game.turn = game.turn === 'red' ? 'black' : 'red';
                }
            } else {
                // Normal hamlede sıra değişir
                game.turn = game.turn === 'red' ? 'black' : 'red';
            }
            
            // Tüm oyunculara güncelleme gönder
            broadcastGameUpdate(data.gameId, 'GAME_UPDATE', { 
                boardState: game.boardState, 
                turn: game.turn,
                lastMove: { from, to }
            });
            break;
            
    }
}

function startNewGame(player1, player2) {
    const gameId = Date.now().toString();
    const boardState = initializeBoard();
    
    // Rastgele renk atama: Kırmızı ve Siyah
    const p1Color = Math.random() < 0.5 ? 'red' : 'black';
    const p2Color = p1Color === 'red' ? 'black' : 'red';
    const firstTurn = 'red'; // Kırmızı (Altta olan) başlar

    games[gameId] = {
        players: [player1, player2],
        boardState: boardState,
        turn: firstTurn,
        playerData: { [p1Color]: player1, [p2Color]: player2 }
    };

    // Oyunculara oyunu başlatma emri gönder
    player1.send(JSON.stringify({ type: 'MATCH_FOUND', gameId, color: p1Color, boardState, turn: firstTurn }));
    player2.send(JSON.stringify({ type: 'MATCH_FOUND', gameId, color: p2Color, boardState, turn: firstTurn }));
}


// SUNUCU DİNLEME PORTU
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`WebSocket sunucusu ${PORT} portunda çalışıyor.`);
});

