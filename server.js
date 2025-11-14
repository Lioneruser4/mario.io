const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

// Socket.IO ayarları - Basitleştirilmiş versiyon
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket']
});

// Oyun odalarını ve oyuncuları tutacak yapılar
const rooms = new Map(); // Tüm oyun odaları
const players = new Map(); // Tüm bağlı oyuncular
const socketToRoom = new Map(); // Socket ID'den oda bilgisine erişim
const waitingPlayers = []; // Eşleşmeyi bekleyen oyuncular

// HTTP sunucusunu başlat
const SERVER_PORT = process.env.PORT || 3000;
server.listen(SERVER_PORT, () => {
    console.log(`Sunucu ${SERVER_PORT} portunda çalışıyor...`);
    console.log('CORS ayarları:', {
        origin: [
            "http://localhost:3000", 
            "https://mario-io-1.onrender.com",
            /.*\.onrender\.com$/
        ],
        methods: ["GET", "POST", "OPTIONS"]
    });
});

// Socket bağlantılarını dinle
io.on('connection', (socket) => {
    console.log('Yeni bir istemci bağlandı:', socket.id);
    console.log('Bağlantı başlıkları:', socket.handshake.headers);
    
    socket.on('disconnect', () => {
        console.log('İstemci ayrıldı:', socket.id);
    });
    
    // Test mesajı gönder
    socket.emit('welcome', { message: 'Sunucuya hoş geldiniz!' });
});

// Oda kodu oluşturma
function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// Oda oluşturma yardımcı fonksiyonu
function createRoom(player1, player2 = null, isPrivate = false) {
    const roomId = 'room_' + Math.random().toString(36).substr(2, 9);
    const room = {
        id: roomId,
        players: [player1],
        status: player2 ? 'playing' : 'waiting',
        code: generateRoomCode(),
        isPrivate,
        isRanked: !isPrivate && !player2, // Eğer özel değilse ve ikinci oyuncu yoksa dereceli maç
        board: initializeBoard(),
        currentPlayer: 1, // 1 veya 2
        createdAt: Date.now(),
        lastActivity: Date.now()
    };
    
    if (player2) {
        room.players.push(player2);
    }
    
    rooms.set(roomId, room);
    return room;
}

// Eşleştirme kuyruğuna oyuncu ekle
function addToMatchmaking(player) {
    // Eğer zaten bekleme listesindeyse çık
    const existingIndex = waitingPlayers.findIndex(p => p.id === player.id);
    if (existingIndex !== -1) {
        return { status: 'already_in_queue' };
    }
    
    waitingPlayers.push(player);
    console.log(`Eşleşme kuyruğuna eklendi: ${player.id} (Toplam: ${waitingPlayers.length})`);
    
    // Eğer en az iki oyuncu varsa eşleştir
    if (waitingPlayers.length >= 2) {
        const player1 = waitingPlayers.shift();
        const player2 = waitingPlayers.shift();
        
        const room = createRoom(player1, player2, false);
        
        // Oyuncuları odaya yönlendir
        player1.socket.join(room.id);
        player2.socket.join(room.id);
        
        // Oda bilgilerini güncelle
        socketToRoom.set(player1.id, room.id);
        socketToRoom.set(player2.id, room.id);
        players.set(player1.id, { ...player1, roomId: room.id, playerNumber: 1 });
        players.set(player2.id, { ...player2, roomId: room.id, playerNumber: 2 });
        
        // Oyun başlatma bilgisini gönder
        io.to(room.id).emit('gameStart', {
            roomId: room.id,
            board: room.board,
            currentPlayer: 1,
            players: [
                { id: player1.id, number: 1, name: player1.name },
                { id: player2.id, number: 2, name: player2.name }
            ]
        });
        
        console.log(`Yeni eşleşme başlatıldı: ${room.id} (${player1.id} vs ${player2.id})`);
        return { status: 'matched', roomId: room.id };
    }
    
    return { status: 'waiting' };
}

// Odaya katılma işlemi
function joinRoomWithCode(player, code) {
    // Tüm odalarda arama yap
    let targetRoom = null;
    for (const [roomId, room] of rooms) {
        if (room.code === code && room.status === 'waiting' && room.players.length < 2) {
            targetRoom = room;
            break;
        }
    }
    
    if (targetRoom) {
        // Odaya katıl
        targetRoom.players.push(player);
        targetRoom.status = 'playing';
        player.socket.join(targetRoom.id);
        
        // Oda bilgilerini güncelle
        socketToRoom.set(player.id, targetRoom.id);
        players.set(player.id, { ...player, roomId: targetRoom.id, playerNumber: 2 });
        
        // Oyun başlatma bilgisini gönder
        io.to(targetRoom.id).emit('gameStart', {
            roomId: targetRoom.id,
            board: targetRoom.board,
            currentPlayer: 1,
            players: [
                { id: targetRoom.players[0].id, number: 1, name: targetRoom.players[0].name },
                { id: player.id, number: 2, name: player.name }
            ]
        });
        
        console.log(`Oyuncu ${player.id}, ${targetRoom.id} odasına katıldı`);
        return { success: true, room: targetRoom };
    }
    
    return { success: false, message: 'Geçersiz oda kodu veya oda dolu' };
}

// Oyun tahtasını başlatma fonksiyonu
function initializeBoard() {
    const board = Array(8).fill().map(() => Array(8).fill(null));
    
    // Siyah taşları yerleştir (üst 3 satır)
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 8; col++) {
            if ((row + col) % 2 === 1) {
                board[row][col] = { player: 1, king: false };
            }
        }
    }
    
    // Beyaz taşları yerleştir (alt 3 satır)
    for (let row = 5; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if ((row + col) % 2 === 1) {
                board[row][col] = { player: 2, king: false };
            }
        }
    }
    
    return board;
}

// Socket bağlantılarını dinle
io.on('connection', (socket) => {
    console.log('Yeni bir kullanıcı bağlandı:', socket.id);
    
    // Yeni oyuncu oluştur
    const player = {
        id: socket.id,
        socket: socket,
        name: 'Oyuncu_' + Math.floor(Math.random() * 1000),
        elo: 1000,
        connected: true
    };
    
    players.set(socket.id, player);
    
    // Bağlantı hatası
    socket.on('error', (error) => {
        console.error('Socket hatası:', error);
    });
    
    // Dereceli maç başlat
    socket.on('startRankedMatch', () => {
        console.log(`${socket.id} kullanıcısı dereceli maç aramaya başladı`);
        
        // Eğer zaten bir odada ise çık
        if (socketToRoom.has(socket.id)) {
            const roomId = socketToRoom.get(socket.id);
            const room = rooms.get(roomId);
            if (room && room.status === 'waiting') {
                removePlayerFromRoom(socket.id);
            }
        }
        
        const result = addToMatchmaking(player);
        if (result.status === 'waiting') {
            socket.emit('matchmaking', { status: 'searching' });
        } else if (result.status === 'matched') {
            socket.emit('matchmaking', { status: 'matched', roomId: result.roomId });
        }
    });
    
    // Özel oda oluştur
    socket.on('createPrivateRoom', () => {
        console.log(`${socket.id} kullanıcısı özel oda oluşturmak istiyor`);
        
        // Eğer zaten bir odada ise çık
        if (socketToRoom.has(socket.id)) {
            const roomId = socketToRoom.get(socket.id);
            const room = rooms.get(roomId);
            if (room) {
                socket.emit('error', { message: 'Zaten bir odadasınız!' });
                return;
            }
        }
        
        // Yeni oda oluştur
        const room = createRoom(player, null, true);
        socket.join(room.id);
        socketToRoom.set(socket.id, room.id);
        players.set(socket.id, { ...player, roomId: room.id, playerNumber: 1 });
        
        console.log(`Özel oda oluşturuldu: ${room.id} (Kod: ${room.code})`);
        
        // Oyuncuya oda bilgisini gönder
        socket.emit('roomCreated', {
            roomId: room.id,
            code: room.code,
            status: 'waiting',
            playerNumber: 1
        });
    });
    
    // Özel odaya katıl
    socket.on('joinPrivateRoom', (data) => {
        const { code } = data;
        console.log(`${socket.id} kullanıcısı ${code} kodlu odaya katılmak istiyor`);
        
        // Eğer zaten bir odada ise çık
        if (socketToRoom.has(socket.id)) {
            const oldRoomId = socketToRoom.get(socket.id);
            const oldRoom = rooms.get(oldRoomId);
            if (oldRoom) {
                removePlayerFromRoom(socket.id);
            }
        }
        
        // Odaya katıl
        const result = joinRoomWithCode(player, code);
        if (result.success) {
            socketToRoom.set(socket.id, result.room.id);
            players.set(socket.id, { ...player, roomId: result.room.id, playerNumber: 2 });
            
            socket.emit('roomJoined', {
                roomId: result.room.id,
                code: result.room.code,
                status: 'playing',
                playerNumber: 2,
                players: result.room.players.map(p => ({
                    id: p.id,
                    number: p.id === socket.id ? 2 : 1,
                    name: p.name
                }))
            });
            
            // Oda sahibine yeni oyuncu bilgisini gönder
            const owner = result.room.players[0];
            if (owner && owner.socket) {
                owner.socket.emit('playerJoined', {
                    playerId: player.id,
                    playerName: player.name,
                    playerNumber: 2
                });
            }
        } else {
            socket.emit('joinError', { message: result.message });
        }
    });
    
    // Bağlantısı kesilen oyuncuları yönet
    socket.on('disconnect', () => {
        console.log(`Bağlantısı kesildi: ${socket.id}`);
        
        // Oyuncunun bağlantı durumunu güncelle
        const player = players.get(socket.id);
        if (player) {
            player.connected = false;
            player.lastSeen = Date.now();
        }
        
        // Eğer oyuncu bir odadaysa çıkar
        if (socketToRoom.has(socket.id)) {
            const roomId = socketToRoom.get(socket.id);
            const room = rooms.get(roomId);
            
            if (room) {
                // Oyuncuyu odadan çıkar
                const playerIndex = room.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    const player = room.players[playerIndex];
                    room.players.splice(playerIndex, 1);
                    
                    // Diğer oyunculara bildir
                    socket.to(roomId).emit('playerLeft', {
                        playerId: socket.id,
                        playerNumber: player.number
                    });
                    
                    // Eğer oyun devam ediyorsa oyunu bitir
                    if (room.status === 'playing') {
                        const winner = room.players[0]?.id || null;
                        if (winner) {
                            io.to(roomId).emit('gameEnded', {
                                winner,
                                reason: 'Rakip bağlantısı koptu.'
                            });
                            
                            // 10 saniye sonra odayı temizle
                            setTimeout(() => {
                                cleanupRoom(roomId);
                            }, 10000);
                        }
                    } else if (room.players.length === 0) {
                        // Eğer oda boşsa sil
                        rooms.delete(roomId);
                        console.log(`Oda boş, siliniyor: ${roomId}`);
                    }
                }
            }
            
            // Oyuncuyu listeden çıkar
            players.delete(socket.id);
            socketToRoom.delete(socket.id);
        }
        
        // Eğer bekleme listesindeyse çıkar
        const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
        if (waitingIndex !== -1) {
            waitingPlayers.splice(waitingIndex, 1);
            console.log(`${socket.id} kullanıcısı bekleme listesinden çıkarıldı`);
        }
    });
    
    // Oyun hamlesi yap
    socket.on('makeMove', (data) => {
        const { from, to } = data;
        console.log(`${socket.id} kullanıcısı hamle yapıyor:`, { from, to });
        
        const playerData = players.get(socket.id);
        if (!playerData) {
            socket.emit('error', { message: 'Oyun bulunamadı!' });
            return;
        }
        
        const { roomId, playerNumber } = playerData;
        const room = rooms.get(roomId);
        
        if (!room || room.status !== 'playing') {
            socket.emit('error', { message: 'Oyun bulunamadı veya başlamamış!' });
            return;
        }
        
        // Sıra bu oyuncuda mı kontrol et
        if (room.currentPlayer !== playerNumber) {
            socket.emit('error', { message: 'Sıra sizde değil!' });
            return;
        }
        
        // Hamle doğrulama
        const isValidMove = validateMove(room.board, from, to, playerNumber);
        if (!isValidMove.valid) {
            socket.emit('error', { message: isValidMove.message || 'Geçersiz hamle!' });
            return;
        }
        
        // Hamleyi yap
        const { board, captured } = makeMove(room.board, from, to, playerNumber);
        room.board = board;
        room.lastActivity = Date.now();
        
        // Eğer taş kırıldıysa ve kırılabilecek başka taş yoksa sırayı değiştir
        if (captured && !hasMoreCaptures(board, to, playerNumber)) {
            room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
        } 
        // Eğer taş kırılmadıysa sırayı değiştir
        else if (!captured) {
            room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
        }
        
        // Kazanan var mı kontrol et
        const winner = checkWinner(room.board);
        if (winner) {
            room.status = 'finished';
            const winnerId = winner === 1 
                ? room.players.find(p => p.number === 1)?.id 
                : room.players.find(p => p.number === 2)?.id;
                
            io.to(room.id).emit('gameEnded', {
                winner: winnerId,
                roomId,
                reason: winner === 1 ? 'Oyuncu 1 kazandı!' : 'Oyuncu 2 kazandı!'
            });
            
            // 10 saniye sonra odayı temizle
            setTimeout(() => {
                cleanupRoom(roomId);
            }, 10000);
            
            return;
        }
        
        // Tüm oyunculara hamleyi ilet
        io.to(roomId).emit('moveMade', {
            from,
            to,
            currentPlayer: room.currentPlayer,
            board: room.board,
            captured: isValidMove.captured,
            mustCapture: captured && hasMoreCaptures(board, to, playerNumber)
        });
    });
    
    // Oyun bitti
    socket.on('gameOver', (data) => {
        console.log(`${socket.id} kullanıcısı oyunu bitirdi:`, data);
        
        const { roomId, winner } = data;
        if (!roomId || !winner) return;
        
        const room = rooms.get(roomId);
        if (!room) return;
        
        // Oyunu bitir
        room.status = 'finished';
        
        // Tüm oyunculara oyunun bittiğini bildir
        io.to(roomId).emit('gameEnded', {
            winner,
            roomId,
            reason: 'Oyun bitti.'
        });
        
        // 10 saniye sonra odayı temizle
        setTimeout(() => {
            cleanupRoom(roomId);
        }, 10000);
    });
    
    // Odayı temizle
    function cleanupRoom(roomId) {
        if (!rooms.has(roomId)) return;
        
        const room = rooms.get(roomId);
        if (!room) return;
        
        // Tüm oyuncuları odadan çıkar
        room.players.forEach(player => {
            if (player.socket) {
                player.socket.leave(roomId);
            }
            players.delete(player.id);
            socketToRoom.delete(player.id);
        });
        
        // Odayı sil
        rooms.delete(roomId);
        console.log(`Oda temizlendi: ${roomId}`);
    }
    
    // Hamle doğrulama
    function validateMove(board, from, to, playerNumber) {
        // Basit bir doğrulama örneği
        // Gerçek bir dama oyunu için daha kapsamlı doğrulama gerekir
        
        // Sınır kontrolü
        if (from.x < 0 || from.x > 7 || from.y < 0 || from.y > 7 ||
            to.x < 0 || to.x > 7 || to.y < 0 || to.y > 7) {
            return { valid: false, message: 'Geçersiz koordinatlar!' };
        }
        
        // Başlangıç noktasında taş var mı?
        if (!board[from.y] || !board[from.y][from.x] || board[from.y][from.x].player !== playerNumber) {
            return { valid: false, message: 'Geçersiz taş seçimi!' };
        }
        
        // Hedef nokta boş mu?
        if (board[to.y][to.x] !== null) {
            return { valid: false, message: 'Hedef nokta dolu!' };
        }
        
        // Çapraz hareket kontrolü
        const dx = Math.abs(to.x - from.x);
        const dy = to.y - from.y;
        
        // Normal taşlar sadece ileri gidebilir (1. oyuncu aşağı, 2. oyuncu yukarı)
        const piece = board[from.y][from.x];
        if (!piece.king) {
            if ((playerNumber === 1 && dy < 1) || (playerNumber === 2 && dy > -1)) {
                return { valid: false, message: 'Sadece ileri gidebilirsiniz!' };
            }
        }
        
        // Tek adımlık hareket
        if (dx === 1 && Math.abs(dy) === 1) {
            return { valid: true, capture: false };
        }
        
        // Taş yeme hareketi
        if (dx === 2 && Math.abs(dy) === 2) {
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            
            if (board[midY][midX] && board[midY][midX].player !== playerNumber) {
                return { 
                    valid: true, 
                    capture: true, 
                    captured: { x: midX, y: midY } 
                };
            }
        }
        
        return { valid: false, message: 'Geçersiz hamle!' };
    }
    
    // Hamle yap
    function makeMove(board, from, to, playerNumber) {
        const newBoard = JSON.parse(JSON.stringify(board));
        const piece = newBoard[from.y][from.x];
        let captured = null;
        
        // Taşı hareket ettir
        newBoard[to.y][to.x] = { ...piece };
        newBoard[from.y][from.x] = null;
        
        // Eğer taş yendi ise
        const dx = Math.abs(to.x - from.x);
        if (dx === 2) {
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            
            if (newBoard[midY][midX] && newBoard[midY][midX].player !== playerNumber) {
                captured = { x: midX, y: midY };
                newBoard[midY][midX] = null;
            }
        }
        
        // Eğer taş son sıraya ulaştıysa kral yap
        if ((playerNumber === 1 && to.y === 7) || (playerNumber === 2 && to.y === 0)) {
            newBoard[to.y][to.x].king = true;
        }
        
        return { board: newBoard, captured };
    }
    
    // Daha fazla taş yenebilir mi?
    function hasMoreCaptures(board, position, playerNumber) {
        // Bu fonksiyon, verilen pozisyondan başka taş yenip yenemeyeceğini kontrol eder
        // Gerçek bir uygulamada daha kapsamlı bir kontrol gerekir
        return false;
    }
    
    // Kazanan var mı?
    function checkWinner(board) {
        let player1Pieces = 0;
        let player2Pieces = 0;
        
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                if (board[y][x] !== null) {
                    if (board[y][x].player === 1) player1Pieces++;
                    else player2Pieces++;
                }
            }
        }
        
        if (player1Pieces === 0) return 2;
        if (player2Pieces === 0) return 1;
        
        return 0; // Kazanan yok
    }
    
    // Oyun bitti
    socket.on('gameOver', (data) => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            // Diğer oyuncuya oyunun bittiğini bildir
            socket.to(roomId).emit('gameEnded', data);
            
            // Odayı temizle
            rooms[roomId].players.forEach(playerId => {
                if (players[playerId] && players[playerId].socket) {
                    players[playerId].socket.leave(roomId);
                    delete socketToRoom[playerId];
                }
            });
            
            delete rooms[roomId];
        }
    });
    
    // Bağlantı kesildiğinde
    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
        
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            // Oyuncuyu odadan çıkar
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            
            // Diğer oyunculara ayrılan oyuncu bilgisini gönder
            socket.to(roomId).emit('playerLeft', { playerId: socket.id });
            
            // Eğer oda boşsa veya oyun devam ediyorsa odayı sil
            if (rooms[roomId].players.length === 0 || rooms[roomId].status === 'playing') {
                delete rooms[roomId];
            }
        }
        
        // Eşleşme kuyruğundan çıkar
        const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
        if (waitingIndex !== -1) {
            waitingPlayers.splice(waitingIndex, 1);
        }
        
        delete socketToRoom[socket.id];
        delete players[socket.id];
    });
});

const ELO_CHANGE_AMOUNT = 20; 

// ----------------------------------------------------------------------
// OYUN MANTIĞI FONKSİYONLARI (DAMA)
// ----------------------------------------------------------------------
function initializeCheckersBoard() {
    const board = Array(8).fill(null).map(() => Array(8).fill(0));
    for (let r = 0; r < 3; r++) { for (let c = 0; c < 8; c++) { board[r][c] = 1; } }
    for (let r = 5; r < 8; r++) { for (let c = 0; c < 8; c++) { board[r][c] = 2; } }
    return board; 
}
// ... (Diğer tüm yardımcı oyun fonksiyonları: isKing, getPossibleMoves, hasMandatoryJump, hasAnyValidMoves aynı kalır)

function isKing(piece) { return piece === 3 || piece === 4; }
function getPossibleMoves(board, r, c, isJumpOnly = false) {
    const piece = board[r][c];
    const isBlack = piece === 1 || piece === 3;
    const isWhite = piece === 2 || piece === 4;
    const isKingPiece = isKing(piece);
    const moves = [];
    const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]]; 

    for (const [dr, dc] of directions) {
        let nr = r + dr;
        let nc = c + dc;
        const maxRange = isKingPiece ? 8 : 1; 

        for (let i = 0; i < maxRange; i++) {
            if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) break;
            const targetPiece = board[nr][nc];

            if (targetPiece === 0) {
                if (!isJumpOnly) { moves.push({ r: nr, c: nc, type: 'move' }); }
                if (!isKingPiece) break; 
            } else {
                const isOpponent = (isBlack && (targetPiece === 2 || targetPiece === 4)) || (isWhite && (targetPiece === 1 || targetPiece === 3));
                if (isOpponent) {
                    const jumpR = nr + dr;
                    const jumpC = nc + dc;
                    if (jumpR >= 0 && jumpR < 8 && jumpC >= 0 && jumpC < 8 && board[jumpR][jumpC] === 0) {
                        moves.push({ r: jumpR, c: jumpC, type: 'jump', capturedR: nr, capturedC: nc });
                    }
                    break;
                } else {
                    break;
                }
            }
            nr += dr;
            nc += dc;
        }
    }
    return moves;
}
function hasMandatoryJump(board, color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            const isMyPiece = (color === 'black' && (piece === 1 || piece === 3)) ||
                              (color === 'white' && (piece === 2 || piece === 4));

            if (isMyPiece) {
                const moves = getPossibleMoves(board, r, c, true);
                const jumps = moves.filter(m => m.type === 'jump');
                if (jumps.length > 0) return true;
            }
        }
    }
    return false;
}
function hasAnyValidMoves(board, color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            const isMyPiece = (color === 'black' && (piece === 1 || piece === 3)) ||
                              (color === 'white' && (piece === 2 || piece === 4));
            
            if (isMyPiece) {
                const moves = getPossibleMoves(board, r, c);
                const hasJump = hasMandatoryJump(board, color);
                
                if (hasJump) {
                    const jumps = moves.filter(m => m.type === 'jump');
                    if (jumps.length > 0) return true;
                } else {
                    if (moves.length > 0) return true;
                }
            }
        }
    }
    return false;
}


// ----------------------------------------------------------------------
// VERİTABANI VE KUYRUK İŞLEMLERİ
// ----------------------------------------------------------------------

async function getOrCreatePlayer(telegramId, username) {
    try {
        const result = await client.query(
            `INSERT INTO players (telegram_id, username, elo_score) 
             VALUES ($1, $2, 0) 
             ON CONFLICT (telegram_id) 
             DO UPDATE SET username = $2 
             RETURNING telegram_id, username, elo_score;`,
            [telegramId, username]
        );
        return result.rows[0];
    } catch (err) {
        console.error("Oyuncu kaydetme/bulma hatası:", err.message);
        return { telegram_id: telegramId, username: username, elo_score: 0 };
    }
}

async function updateEloScores(winnerId, loserId, roomIsRanked) {
    if (!roomIsRanked) {
        console.log("Bu oyun dereceli değildi, ELO puanları güncellenmedi.");
        return;
    }
    
    // Kazanan: +ELO_CHANGE_AMOUNT, +1 Win
    await client.query(
        `UPDATE players 
         SET elo_score = elo_score + $1, wins = wins + 1 
         WHERE telegram_id = $2;`,
        [ELO_CHANGE_AMOUNT, winnerId]
    );

    // Kaybeden: -ELO_CHANGE_AMOUNT, +1 Loss
    await client.query(
        `UPDATE players 
         SET elo_score = elo_score - $1, losses = losses + 1 
         WHERE telegram_id = $2;`,
        [ELO_CHANGE_AMOUNT, loserId]
    );
    io.emit('rankUpdate'); 
}

// Yeni: Dereceli Kuyruk Kontrolü ve Eşleştirme
function checkRankedQueue() {
    if (rankedQueue.length >= 2) {
        const player1 = rankedQueue.shift(); 
        const player2 = rankedQueue.shift(); 
        
        // Yeni oda kodu
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();

        // Odayı oluştur ve bilgileri kaydet
        games[code] = {
            isRanked: true, 
            players: { 
                'black': { 
                    id: player1.socketId, 
                    telegramId: player1.telegramId, 
                    username: player1.username, 
                    elo: player1.elo 
                }, 
                'white': { 
                    id: player2.socketId, 
                    telegramId: player2.telegramId, 
                    username: player2.username, 
                    elo: player2.elo 
                } 
            },
            board: initializeCheckersBoard(),
            turn: 'black',
            lastJump: null, 
            isGameOver: false,
        };

        // Socket'leri odaya al ve bilgileri eşle
        const socket1 = io.sockets.sockets.get(player1.socketId);
        const socket2 = io.sockets.sockets.get(player2.socketId);
        
        if (socket1 && socket2) {
            socketToRoom[player1.socketId] = code;
            socketToRoom[player2.socketId] = code;
            socket1.join(code);
            socket2.join(code);

            // Oyuna başla sinyali gönder
            io.to(code).emit('gameStart', {
                board: games[code].board,
                turn: games[code].turn,
                blackName: games[code].players['black'].username,
                whiteName: games[code].players['white'].username,
                isRanked: true,
                blackElo: games[code].players['black'].elo, 
                whiteElo: games[code].players['white'].elo 
            });
            console.log(`Otomatik Eşleşme Başladı: ${code} (Dereceli)`);
        } else {
             // Eğer socket bulunamazsa kuyruğa geri ekle veya logla
             console.error(`Eşleştirilen oyuncuların socket'leri bulunamadı. ID'ler: ${player1.socketId}, ${player2.socketId}`);
             // Şu an için kaybetmeyi kabul edip devam ediyoruz
        }
    }
}

// ----------------------------------------------------------------------
// SOCKET.IO BAĞLANTILARI
// ----------------------------------------------------------------------

io.on('connection', (socket) => {
    console.log(`Yeni bağlantı: ${socket.id}`);
    
    const parseCoord = (coordId) => {
        const parts = coordId.split('-');
        return { r: parseInt(parts[1]), c: parseInt(parts[3]) };
    };
    
    // ---------------------- ODA KURMA / KUYRUK ----------------------
    socket.on('createRoom', async ({ username, telegramId, isRanked = false }) => {
        const playerStats = await getOrCreatePlayer(telegramId, username);
        
        if (isRanked) {
            // Dereceli: Kuyruğa ekle ve eşleşme ara
            const inQueue = rankedQueue.some(p => p.socketId === socket.id);
            if (inQueue) return socket.emit('error', 'Zaten kuyrukta bekliyorsunuz.');
            
            rankedQueue.push({
                socketId: socket.id,
                telegramId: playerStats.telegram_id,
                username: playerStats.username,
                elo: playerStats.elo_score
            });
            socket.emit('queueEntered', { isRanked: true }); // Frontend'e kuyruğa girildiği bilgisini ver
            checkRankedQueue(); // Hemen eşleşme kontrolü yap
            console.log(`Oyuncu ${username} dereceli kuyruğa girdi. Kuyruk boyutu: ${rankedQueue.length}`);

        } else {
            // Arkadaşla Oyna: Hemen oda kur
            const code = Math.random().toString(36).substring(2, 6).toUpperCase();
            
            games[code] = {
                isRanked: false, 
                players: { 
                    'black': { id: socket.id, telegramId, username, elo: playerStats.elo_score }, 
                    'white': null 
                },
                board: initializeCheckersBoard(),
                turn: 'black',
                lastJump: null, 
                isGameOver: false,
            };
            socketToRoom[socket.id] = code;
            socket.join(code);
            
            socket.emit('roomCreated', { 
                roomId: code, 
                color: 'black', 
                isRanked: false, 
                elo: playerStats.elo_score 
            });
            console.log(`Arkadaş Odası Kuruldu: ${code}`);
        }
    });
    
    // Yeni: Kuyruktan Çıkma
    socket.on('leaveQueue', () => {
        const initialLength = rankedQueue.length;
        rankedQueue = rankedQueue.filter(p => p.socketId !== socket.id);
        if (rankedQueue.length < initialLength) {
            console.log(`Oyuncu kuyruktan ayrıldı. Yeni boyut: ${rankedQueue.length}`);
            socket.emit('queueLeft');
        }
    });

    // ---------------------- ODAYA KATILMA ----------------------
    socket.on('joinRoom', async ({ username, telegramId, roomCode }) => {
        const code = roomCode.toUpperCase();
        const room = games[code];

        if (!room || room.players['white']) {
            return socket.emit('error', 'Oda bulunamadı veya dolu.');
        }
        
        if (room.players['black'].telegramId === telegramId) {
             return socket.emit('error', 'Kendi odanıza kendiniz katılamazsınız.');
        }

        const playerStats = await getOrCreatePlayer(telegramId, username);
        const blackPlayerStats = await getOrCreatePlayer(room.players['black'].telegramId, room.players['black'].username);
        room.players['black'].elo = blackPlayerStats.elo_score;
        
        room.players['white'] = { 
            id: socket.id, 
            telegramId, 
            username, 
            elo: playerStats.elo_score 
        };
        socketToRoom[socket.id] = code;
        socket.join(code);
        
        socket.emit('roomJoined', code); 
        
        // Oyuna başla sinyali gönder
        io.to(code).emit('gameStart', {
            board: room.board,
            turn: room.turn,
            blackName: room.players['black'].username,
            whiteName: room.players['white'].username,
            isRanked: room.isRanked,
            blackElo: room.players['black'].elo, 
            whiteElo: room.players['white'].elo 
        });
        console.log(`Oyuncu ${username} katıldı: ${code}`);
    });
    
    // ---------------------- ODA BIRAKMA ----------------------
    socket.on('leaveRoom', (roomId) => {
        socket.leave(roomId);
        const room = games[roomId];
        if (room) {
            delete games[roomId];
        }
        delete socketToRoom[socket.id];
    });


    // ---------------------- HAMLE YAPMA (Aynı kalır) ----------------------
    socket.on('makeMove', async (data) => {
        const { roomId, from, to } = data;
        const game = games[roomId];
        if (!game || game.isGameOver) return;

        const fromCoord = parseCoord(from);
        const toCoord = parseCoord(to);
        
        const color = (socket.id === game.players.black.id) ? 'black' : 'white';
        const opponentColor = (color === 'black') ? 'white' : 'black';
        
        if (color !== game.turn) return socket.emit('error', 'Sizin sıranız değil.');
        
        const piece = game.board[fromCoord.r][fromCoord.c];
        const isMyPiece = (color === 'black' && (piece === 1 || piece === 3)) || (color === 'white' && (piece === 2 || piece === 4));
        if (!isMyPiece) return socket.emit('error', 'Seçtiğiniz taş size ait değil.');
        if (game.lastJump && from !== game.lastJump) {
            return socket.emit('error', 'Çoklu atlama zorunluluğu var! Sadece son atladığınız taşla devam etmelisiniz.');
        }

        const allPossibleMoves = getPossibleMoves(game.board, fromCoord.r, fromCoord.c);
        const jumps = allPossibleMoves.filter(m => m.type === 'jump');
        const mandatoryJumpExists = hasMandatoryJump(game.board, color);
        
        if (mandatoryJumpExists && jumps.length > 0) {
            if (!jumps.some(m => m.r === toCoord.r && m.c === toCoord.c)) {
                return socket.emit('error', 'Atlama (yeme) zorunludur! Lütfen geçerli bir atlama hamlesi yapın.');
            }
        }
        const move = allPossibleMoves.find(m => m.r === toCoord.r && m.c === toCoord.c);
        if (!move) {
            return socket.emit('error', 'Geçersiz hamle.');
        }

        const newBoard = JSON.parse(JSON.stringify(game.board));
        newBoard[toCoord.r][toCoord.c] = newBoard[fromCoord.r][fromCoord.c];
        newBoard[fromCoord.r][fromCoord.c] = 0; 
        
        let shouldChangeTurn = true;

        if (move.type === 'jump') {
            newBoard[move.capturedR][move.capturedC] = 0; // Rakip taşı sil
            
            const nextJumps = getPossibleMoves(newBoard, toCoord.r, toCoord.c, true).filter(m => m.type === 'jump');
            
            if (nextJumps.length > 0) {
                game.board = newBoard;
                game.lastJump = to; 
                shouldChangeTurn = false;
            }
        }
        
        // Vezir Kontrolü
        const isKingRow = (color === 'black' && toCoord.r === 7) || (color === 'white' && toCoord.r === 0);
        if (isKingRow) {
            newBoard[toCoord.r][toCoord.c] = (color === 'black') ? 3 : 4; 
        }

        // Sırayı Değiştir ve Oyunu Bitir Kontrolü
        game.board = newBoard;
        game.lastJump = shouldChangeTurn ? null : game.lastJump;
        
        if (shouldChangeTurn) {
            game.turn = opponentColor;
        }

        const opponentHasMoves = hasAnyValidMoves(newBoard, opponentColor);
        const opponentPieces = newBoard.flat().filter(p => (opponentColor === 'black' && (p === 1 || p === 3)) || (opponentColor === 'white' && (p === 2 || p === 4)));

        if (opponentPieces.length === 0 || !opponentHasMoves) {
            game.isGameOver = true;
            const winner = game.players[color];
            const loser = game.players[opponentColor];
            
            await updateEloScores(winner.telegramId, loser.telegramId, game.isRanked); 
            
            io.to(roomId).emit('gameOver', { 
                winner: winner.username, 
                isRanked: game.isRanked, 
                winnerEloChange: game.isRanked ? ELO_CHANGE_AMOUNT : 0 
            });
        } else {
            // ELO güncel çekme
            const blackStats = await getOrCreatePlayer(game.players.black.telegramId, game.players.black.username);
            const whiteStats = await getOrCreatePlayer(game.players.white.telegramId, game.players.white.username);
            
            game.players.black.elo = blackStats.elo_score;
            game.players.white.elo = whiteStats.elo_score;

            io.to(roomId).emit('boardUpdate', { 
                board: game.board, 
                turn: game.turn,
                blackName: game.players['black'].username,
                whiteName: game.players['white'].username,
                blackElo: game.players['black'].elo,
                whiteElo: game.players['white'].elo
            });
        }
    });

    // ---------------------- BAĞLANTI KESİLMESİ ----------------------
    socket.on('disconnect', async () => {
        const roomId = socketToRoom[socket.id];
        const room = games[roomId];
        
        // Kuyruktan da çıkar
        rankedQueue = rankedQueue.filter(p => p.socketId !== socket.id);

        if (room) {
             const playerColor = room.players.black.id === socket.id ? 'black' : 'white';
             
             if (room.players.black && room.players.white) {
                const winnerColor = playerColor === 'black' ? 'white' : 'black';
                const winner = room.players[winnerColor];
                const loser = room.players[playerColor];
                
                await updateEloScores(winner.telegramId, loser.telegramId, room.isRanked); 
                
                io.to(roomId).emit('opponentLeft', `${winner.username} kazandı (Rakip ayrıldı).`);
             } else {
                io.to(roomId).emit('opponentLeft', 'Oda kurucusu ayrıldı. Oda kapatıldı.');
             }
            
             delete games[roomId];
        }
        delete socketToRoom[socket.id];
        console.log(`Bağlantı kesildi: ${socket.id}`);
    });
});

// ----------------------------------------------------------------------
// EXPRESS API ROTASI (SKOR TABLOSU - Aynı kalır)
// ----------------------------------------------------------------------

app.get('/api/leaderboard', async (req, res) => {
    const userTelegramId = req.query.id; 
    
    if (!userTelegramId) {
        return res.status(400).json({ error: "Telegram ID (id) parametresi gerekli." });
    }

    try {
        const topPlayers = await client.query(
            `SELECT username, elo_score, telegram_id FROM players 
             ORDER BY elo_score DESC 
             LIMIT 100;`
        );

        const userRankResult = await client.query(
            `SELECT * FROM (
                SELECT 
                    telegram_id, 
                    username, 
                    elo_score,
                    RANK() OVER (ORDER BY elo_score DESC) as rank_number,
                    wins,
                    losses
                FROM players
            ) AS ranked_players
            WHERE telegram_id = $1;`,
            [userTelegramId]
        );

        const userData = userRankResult.rows.length > 0 ? userRankResult.rows[0] : null;

        res.json({
            top10: topPlayers.rows.slice(0, 10),
            userStats: userData 
        });

    } catch (error) {
        console.error("Lider tablosu çekilirken DB hatası:", error);
        res.status(500).json({ error: "Sunucu hatası. Veritabanı bağlantısını kontrol edin." });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`ŞAŞKİ ELO Sunucusu ${PORT} üzerinde çalışıyor.`);
});
