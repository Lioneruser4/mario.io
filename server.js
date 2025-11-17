const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = socketio(server, {
    cors: {
        origin: "*", // Güvenlik için spesifik alan adı önerilir!
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 10000; 

// --- SUNUCU OYUN DURUMU YÖNETİMİ ---
let lobbies = {}; 
let rankingQueue = []; // [{ socketId: '...', username: '...' }]

// Basit Dama Başlangıç Tahtası
// 1/3: Siyah (Player 1), 2/4: Beyaz (Player 2). 3/4 Kral (King)
const INITIAL_BOARD_STATE = [
    [0, 2, 0, 2, 0, 2, 0, 2], [2, 0, 2, 0, 2, 0, 2, 0],
    [0, 2, 0, 2, 0, 2, 0, 2], [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0], [1, 0, 1, 0, 1, 0, 1, 0],
    [0, 1, 0, 1, 0, 1, 0, 1], [1, 0, 1, 0, 1, 0, 1, 0]
];

function generateLobbyId() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// ----------------------------------------------------
// *** DAMA OYUN KURALLARI VE MANTIĞI ***
// ----------------------------------------------------

// Tahtadaki bir pozisyonda (r, c) bir taşın olup olmadığını kontrol eder
function isPiece(board, r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] !== 0;
}

// Bir taşın bir oyuncuya ait olup olmadığını kontrol eder
function isMyPiece(piece, playerRole) {
    // Player 1 (Siyah): 1 (Normal) veya 3 (King)
    // Player 2 (Beyaz): 2 (Normal) veya 4 (King)
    return (playerRole === 1 && (piece === 1 || piece === 3)) || 
           (playerRole === 2 && (piece === 2 || piece === 4));
}

// Bir taşın atlama (yeme) hamleleri olup olmadığını bulur
function getJumps(board, r, c, playerRole) {
    const jumps = [];
    const piece = board[r][c];
    const isKing = piece === 3 || piece === 4;
    
    // Normal taşlar için yönler (P1 yukarı, P2 aşağı)
    let directions = [];
    if (playerRole === 1) directions.push(-1); // P1 yukarı
    if (playerRole === 2) directions.push(1);  // P2 aşağı
    if (isKing) directions.push(-1, 1);        // King her iki yöne

    for (const dr of directions) {
        for (const dc of [-1, 1]) {
            const jumpR = r + 2 * dr;
            const jumpC = c + 2 * dc;
            const jumpedR = r + dr;
            const jumpedC = c + dc;
            
            // Atlanacak yer tahta sınırları içindeyse
            if (isPiece(board, jumpedR, jumpedC) && !isMyPiece(board[jumpedR][jumpedC], playerRole)) {
                // Atlanacak yer rakip taşı içeriyorsa
                if (isPiece(board, jumpR, jumpC) === false) { 
                    // İnecek yer boşsa
                    jumps.push({ toR: jumpR, toC: jumpC, jumpedR: jumpedR, jumpedC: jumpedC });
                }
            }
        }
    }
    return jumps;
}

// Bir tahta üzerindeki tüm olası atlama (yeme) hamlelerini bulur
function findMandatoryJumps(board, playerRole) {
    const mandatoryJumps = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (isMyPiece(piece, playerRole)) {
                const jumps = getJumps(board, r, c, playerRole);
                if (jumps.length > 0) {
                    mandatoryJumps.push({ r, c, jumps });
                }
            }
        }
    }
    return mandatoryJumps;
}

// Bir taşın normal (kayma) hamlelerini bulur
function getSlidingMoves(board, r, c, playerRole) {
    const moves = [];
    const piece = board[r][c];
    const isKing = piece === 3 || piece === 4;

    let directions = [];
    if (playerRole === 1) directions.push(-1); 
    if (playerRole === 2) directions.push(1);  
    if (isKing) directions.push(-1, 1);

    for (const dr of directions) {
        for (const dc of [-1, 1]) {
            const nextR = r + dr;
            const nextC = c + dc;
            
            if (isPiece(board, nextR, nextC) === false) { 
                moves.push({ toR: nextR, toC: nextC });
            }
        }
    }
    return moves;
}

// Gelen hamleyi kontrol eder ve tahtayı günceller
function processMove(lobby, move, playerRole) {
    const { from, to } = move;
    const board = lobby.boardState;
    
    const piece = board[from.r][from.c];
    if (!isMyPiece(piece, playerRole)) return { success: false, error: 'Seçilen taş size ait değil.' };

    const mandatoryJumps = findMandatoryJumps(board, playerRole);
    const isJump = Math.abs(from.r - to.r) === 2; // Hamlenin atlama olup olmadığı

    // 1. ZORUNLU ATLAMA KONTROLÜ
    if (mandatoryJumps.length > 0 && !isJump) {
        return { success: false, error: 'Atlama (yeme) hamlesi zorunludur.' };
    }

    // 2. HAMLE DOĞRULAMA (Atlama veya Normal)
    let validMoves = [];
    let isKing = piece === 3 || piece === 4;

    if (isJump) {
        const jumps = getJumps(board, from.r, from.c, playerRole);
        const validJump = jumps.find(j => j.toR === to.r && j.toC === to.c);
        
        if (!validJump) return { success: false, error: 'Geçersiz atlama hamlesi.' };
        
        // Tahtayı güncelle (Taşı ve yenilenen taşı kaldır)
        board[validJump.jumpedR][validJump.jumpedC] = 0; // Rakip taşı kaldır

        let newPiece = piece;
        // Kral yapma kontrolü
        if ((to.r === 0 && playerRole === 1) || (to.r === 7 && playerRole === 2)) {
            newPiece = playerRole === 1 ? 3 : 4;
        }

        board[to.r][to.c] = newPiece;
        board[from.r][from.c] = 0;

        // Çoklu atlama kontrolü (Aynı taştan devam etmesi gerekiyor)
        const moreJumps = getJumps(board, to.r, to.c, playerRole);
        if (moreJumps.length > 0) {
            // Hamleyi yapan oyuncunun sırası değişmez
            return { success: true, moreJumps: moreJumps, jumped: { r: validJump.jumpedR, c: validJump.jumpedC } };
        }
        
        return { success: true, jumped: { r: validJump.jumpedR, c: validJump.jumpedC } };

    } else { // Normal Kayma
        const moves = getSlidingMoves(board, from.r, from.c, playerRole);
        const validSlide = moves.find(m => m.toR === to.r && m.toC === to.c);

        if (!validSlide) return { success: false, error: 'Geçersiz kayma hamlesi.' };

        // Tahtayı güncelle
        let newPiece = piece;
        // Kral yapma kontrolü
        if ((to.r === 0 && playerRole === 1) || (to.r === 7 && playerRole === 2)) {
            newPiece = playerRole === 1 ? 3 : 4;
        }

        board[to.r][to.c] = newPiece;
        board[from.r][from.c] = 0;
        
        return { success: true };
    }
}

// ----------------------------------------------------
// *** SOCKET.IO BAĞLANTI İŞLEMLERİ ***
// ----------------------------------------------------

io.on('connection', (socket) => {
    socket.data.lobbyId = null;

    // ... (generateLobbyId ve removeSocketFromQueue fonksiyonları Server.js'de kalacak) ...
    // Eşleştirme ve Lobi Kurma/Katılma mantığı bir önceki yanıttaki gibi kalabilir.

    // ------------------------------------
    // *** DERECE LOBİSİ VE EŞLEŞTİRME ***
    // ------------------------------------
    socket.on('start_rank_match', (username) => {
        if (socket.data.lobbyId) return socket.emit('error', 'Zaten bir oyundasınız.');
        
        if (rankingQueue.length > 0) {
            const opponent = rankingQueue.shift(); 
            const opponentSocket = io.sockets.sockets.get(opponent.socketId);
            if (!opponentSocket) {
                 rankingQueue.push({ socketId: socket.id, username: username });
                 socket.emit('waiting_for_opponent', 'Rakip bulunamadı, tekrar aranıyor...');
                 return;
            }

            const lobbyId = generateLobbyId();
            
            const newLobby = {
                id: lobbyId,
                player1: { socketId: opponent.socketId, username: opponent.username, role: 1 }, // P1 (Siyah) Başlatır
                player2: { socketId: socket.id, username: username, role: 2 },
                boardState: JSON.parse(JSON.stringify(INITIAL_BOARD_STATE)),
                turn: 1, // P1 Başlar
                isRanked: true
            };
            lobbies[lobbyId] = newLobby;
            
            socket.join(lobbyId);
            opponentSocket.join(lobbyId);
            socket.data.lobbyId = lobbyId;
            opponentSocket.data.lobbyId = lobbyId;

            io.to(lobbyId).emit('rank_match_start', { lobbyId });
            
            io.to(lobbyId).emit('game_start', { 
                lobbyId, 
                initialState: newLobby.boardState, 
                turn: newLobby.turn,
                player1: newLobby.player1,
                player2: newLobby.player2
            });

        } else {
            rankingQueue.push({ socketId: socket.id, username: username });
            socket.emit('waiting_for_opponent', 'Dereceli eşleşme aranıyor. Lütfen bekleyiniz...');
        }
    });

    // ------------------------------------
    // *** OYUN İÇİ HAMLE İLETİMİ ***
    // ------------------------------------
    socket.on('make_move', (data) => {
        const { lobbyId, move } = data;
        const lobby = lobbies[lobbyId];

        if (!lobby || socket.data.lobbyId !== lobbyId) return socket.emit('error', 'Geçersiz lobi.');
        
        const playerRole = (socket.id === lobby.player1.socketId) ? 1 : 2;

        if (playerRole !== lobby.turn) { 
             return socket.emit('error', 'Sıra sizde değil!'); 
        }

        // Hamleyi Kural Kontrolünden Geçir
        const result = processMove(lobby, move, playerRole);

        if (!result.success) {
            return socket.emit('error', result.error);
        }

        // Hamle Başarılı!
        
        // 1. Rakibe ve Tahtaya Hamleyi İlet
        io.to(lobbyId).emit('opponent_moved', {
            move: move, 
            jumped: result.jumped || null, 
            newBoardState: lobby.boardState 
        });

        // 2. Sırayı Değiştir
        if (result.moreJumps) {
            // Çoklu atlama (Devam etmesi gerekiyor)
            io.to(socket.id).emit('must_jump_again', { mandatoryJumps: result.moreJumps });
        } else {
            // Normal hamle veya tekli atlama bitti. Sıra değişir.
            lobby.turn = (lobby.turn === 1) ? 2 : 1;
            io.to(lobbyId).emit('turn_changed', { newTurn: lobby.turn });
        }
    });
    
    // ... (disconnect ve diğer lobi event'leri Server.js'de kalacak) ...
});

server.listen(PORT, () => {
    console.log(`✅ Socket.IO Sunucu ${PORT} portunda çalışıyor.`);
});
