
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

// Amerikan Daması Basit Kural Kontrolü Simülasyonu
// **GERÇEK OYUN İÇİN BU FONKSİYONUN TAMAMLANMASI GEREKİR**
function getLegalMoves(gameId, pos, color) {
    // Gerçek Amerikan Daması mantığı burada çalışır (çapraz hareket, yeme zorunluluğu)
    
    // Şimdilik sadece simülasyon amaçlı rastgele hareket döndürülür:
    if (pos === 'A3') return ['B4'];
    if (pos === 'F6') return ['E5', 'G5']; 
    if (pos === 'C1') return ['D2'];

    return [];
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
            const game = games[data.gameId];
            if (!game || ws !== game.playerData[game.turn]) return; // Sıra kontrolü
            
            const legalMoves = getLegalMoves(data.gameId, data.pos, game.turn);
            ws.send(JSON.stringify({ type: 'LEGAL_MOVES', moves: legalMoves }));
            break;

        case 'MAKE_MOVE':
            // Gerçek tahta hareketini uygula ve kural kontrolü yap
            // Eğer legal ve başarılıysa:
            // const newBoard = applyMove(data.gameId, data.from, data.to); 
            // games[data.gameId].turn = (games[data.gameId].turn === 'red' ? 'black' : 'red');
            
            // Simülasyon: Oyunu güncelle
            const simGame = games[data.gameId];
            const nextTurn = simGame.turn === 'red' ? 'black' : 'red';

            // Burası tamamen sunucu mantığına bağlıdır. Başarılı bir hareket olduğunu varsayıyoruz:
            const newBoardState = simGame.boardState; // Tahtayı burada güncelle
            
            broadcastGameUpdate(data.gameId, 'GAME_UPDATE', { boardState: newBoardState, turn: nextTurn });
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

