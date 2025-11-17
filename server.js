// server.js (Render.com Sunucunuzda Çalışacak Dosya)
const WebSocket = require('ws');
const http = require('http');

// Basit bir HTTP sunucusu oluşturun (WebSocket için gereklidir)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Checkers WebSocket Server Running on Render.com');
});

const wss = new WebSocket.Server({ server });

// Sunucu Durumları
const games = {}; // Aktif oyunları tutar: { gameId: { players: [...], boardState: {...}, turn: 'red' } }
const waitingForMatch = []; // Dereceli eşleşme bekleyenler: [ws]
const roomLobbies = {}; // Özel oda lobileri: { roomCode: { host: ws, guest: ws/null } }

// Amerikan Daması (Checkers) Oyun Kuralları ve Başlangıç Tahtası
function initializeBoard() {
    const board = {};
    const initialPositions = [
        // Kırmızı (Red) altta, siyaha doğru hareket eder (1. sıra)
        { color: 'red', rows: [1, 2, 3] }, 
        // Siyah (Black) üstte, kırmızıya doğru hareket eder (8. sıra)
        { color: 'black', rows: [6, 7, 8] }
    ];

    for (const config of initialPositions) {
        for (const r of config.rows) {
            for (let c = 1; c <= 8; c++) {
                // Sadece koyu karelere taş konur (A1, C1, E1, G1 gibi)
                if ((r + c) % 2 !== 0) { 
                    const pos = String.fromCharCode(64 + c) + r;
                    board[pos] = { color: config.color, isKing: false };
                }
            }
        }
    }
    return board;
}

// Yardımcı Fonksiyon: Oyunculara mesaj gönder
function broadcastGameUpdate(gameId, type, payload) {
    const game = games[gameId];
    if (!game) return;
    const message = JSON.stringify({ type, ...payload });
    game.players.forEach(p => p.send(message));
}

// ==========================================================
// WEBSOCKET BAĞLANTI İŞLEYİCİ
// ==========================================================

wss.on('connection', (ws) => {
    console.log('Yeni istemci bağlandı.');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleClientAction(ws, data);
        } catch (e) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Geçersiz JSON formatı.' }));
        }
    });

    ws.on('close', () => {
        console.log('İstemci bağlantısı kesildi.');
        // Bağlantısı kesilen oyuncuyu eşleşme kuyruğundan ve odalardan kaldır
        const index = waitingForMatch.indexOf(ws);
        if (index > -1) {
            waitingForMatch.splice(index, 1);
        }
        // Oyunu terk etme/silme mantığı (karmaşık olduğu için atlandı)
    });
});

// ==========================================================
// İSTEMCİ EYLEM İŞLEYİCİ
// ==========================================================

function handleClientAction(ws, data) {
    switch (data.type) {
        
        // 1. DERECE LOBİ
        case 'FIND_MATCH':
            if (waitingForMatch.length > 0) {
                const opponentWs = waitingForMatch.shift();
                // Eşleşme bulundu, oyunu başlat
                startNewGame(ws, opponentWs);
            } else {
                waitingForMatch.push(ws);
            }
            break;
            
        case 'CANCEL_SEARCH':
            const index = waitingForMatch.indexOf(ws);
            if (index > -1) waitingForMatch.splice(index, 1);
            break;
            
        // 2. VE 3. ÖZEL ODA LOBİSİ
        case 'CREATE_ROOM':
            const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
            roomLobbies[roomCode] = { host: ws, guest: null };
            ws.send(JSON.stringify({ type: 'ROOM_CREATED', roomCode }));
            break;

        case 'JOIN_ROOM':
            const room = roomLobbies[data.roomCode];
            if (room && !room.guest) {
                room.guest = ws;
                // Oyunu başlat
                startNewGame(room.host, room.guest);
                delete roomLobbies[data.roomCode]; // Oda lobisini temizle
            } else {
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Oda bulunamadı veya dolu.' }));
            }
            break;

        // 4. OYUN İÇİ EYLEMLER
        case 'GET_LEGAL_MOVES':
            // ... Burada Amerikan Daması kural mantığı çalışır ...
            // Basitlik için rastgele hamle döndürelim:
            const moves = ['C4', 'E4']; 
            ws.send(JSON.stringify({ type: 'LEGAL_MOVES', moves }));
            break;

        case 'MAKE_MOVE':
            // ... Hamleyi kontrol et ve tahta durumunu güncelle ...
            // Başarılı ise tüm oyunculara güncelleme gönder
            // const newBoard = applyMove(data.gameId, data.from, data.to);
            // broadcastGameUpdate(data.gameId, 'GAME_UPDATE', { boardState: newBoard, turn: 'black' });
            // ...
            break;
            
    }
}

function startNewGame(player1, player2) {
    const gameId = Date.now().toString();
    const boardState = initializeBoard();
    
    // Rastgele renk atama
    const colors = ['red', 'black'];
    const p1Color = colors[Math.floor(Math.random() * 2)];
    const p2Color = p1Color === 'red' ? 'black' : 'red';
    const firstTurn = 'red'; // Kırmızı başlar

    games[gameId] = {
        players: [player1, player2],
        boardState: boardState,
        turn: firstTurn,
        playerData: { [p1Color]: player1, [p2Color]: player2 }
    };

    // Oyunculara oyunu başlatma emri gönder
    player1.send(JSON.stringify({ type: 'MATCH_FOUND', gameId, color: p1Color, boardState, turn: firstTurn }));
    player2.send(JSON.stringify({ type: 'MATCH_FOUND', gameId, color: p2Color, boardState, turn: firstTurn }));
    console.log(`Yeni oyun başladı: ${gameId}`);
}


// SUNUCU DİNLEME PORTU
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`WebSocket sunucusu ${PORT} portunda çalışıyor.`);
});
