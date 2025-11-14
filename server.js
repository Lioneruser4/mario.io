const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Socket.IO ayarları
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

// Oyun odalarını ve oyuncuları tutacak yapılar
const rooms = {};
const players = {};
const socketToRoom = {};

// HTTP sunucusunu başlat
const SERVER_PORT = process.env.PORT || 3000;
server.listen(SERVER_PORT, () => {
    console.log(`Sunucu ${SERVER_PORT} portunda çalışıyor...`);
});

// Socket bağlantılarını dinle
io.on('connection', (socket) => {
    console.log('Yeni bir kullanıcı bağlandı:', socket.id);
    
    // Odaya katılma
    socket.on('joinRoom', (roomId) => {
        if (!rooms[roomId]) {
            rooms[roomId] = { players: [] };
        }
        
        const room = rooms[roomId];
        if (room.players.length < 2) { // Maksimum 2 oyuncu
            socket.join(roomId);
            room.players.push(socket.id);
            socketToRoom[socket.id] = roomId;
            
            // Odaya katıldı mesajı gönder
            socket.emit('roomJoined', { 
                roomId,
                playerId: socket.id,
                playerNumber: room.players.length
            });
            
            // İki oyuncu da hazırsa oyunu başlat
            if (room.players.length === 2) {
                io.to(roomId).emit('startGame', {
                    player1: room.players[0],
                    player2: room.players[1]
                });
            }
        } else {
            socket.emit('roomFull', { roomId });
        }
    });
    
    // Oyun hareketlerini ilet
    socket.on('playerMove', (data) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) {
            socket.to(roomId).emit('playerMoved', data);
        }
    });
    
    // Bağlantı kesildiğinde
    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            // Oyuncuyu odadan çıkar
            rooms[roomId].players = rooms[roomId].players.filter(id => id !== socket.id);
            // Oda boşsa sil
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
            } else {
                // Diğer oyuncuya haber ver
                io.to(roomId).emit('playerDisconnected', { playerId: socket.id });
            }
            delete socketToRoom[socket.id];
        }
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
