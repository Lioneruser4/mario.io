// Dosya Adı: server.js (Eksiksiz ELO ve Dama Mantığı - GÜNCEL)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client } = require('pg');

const app = express();
const server = http.createServer(app);

// CORS ve Transport Ayarları
const io = new Server(server, {
    cors: {
        origin: "*", // Tüm client'lara izin ver
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'] 
});

// PostgreSQL Bağlantısı
const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

client.connect().then(() => {
    console.log("✅ PostgreSQL veritabanına başarıyla bağlanıldı.");
    // Kullanıcı tablosunu oluştur
    client.query(`
        CREATE TABLE IF NOT EXISTS players (
            telegram_id VARCHAR(50) PRIMARY KEY,
            username VARCHAR(100) NOT NULL,
            elo_score INTEGER DEFAULT 0, -- ELO 1000 yerine 0 ile başlar
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0
        );
    `).then(() => {
        console.log("✅ 'players' tablosu kontrol edildi/oluşturuldu.");
    }).catch(err => {
        console.error("Tablo oluşturma hatası:", err.message);
    });
}).catch(err => {
    console.error("❌ PostgreSQL bağlantı hatası: DATABASE_URL ayarını kontrol edin.", err.message);
});


let games = {}; // Odaları ve oyun durumlarını tutar
let socketToRoom = {}; // Socket ID'yi Odaya eşlemek için
const ELO_CHANGE_AMOUNT = 20; // Kazanana +20, Kaybedene -20 (GÜNCEL)

// ----------------------------------------------------------------------
// OYUN MANTIĞI FONKSİYONLARI (ŞAŞKİ/DAMA) - (DEĞİŞMEDİ)
// ----------------------------------------------------------------------
function initializeCheckersBoard() {
    const board = Array(8).fill(null).map(() => Array(8).fill(0));
    for (let r = 0; r < 3; r++) { for (let c = 0; c < 8; c++) { board[r][c] = 1; } }
    for (let r = 5; r < 8; r++) { for (let c = 0; c < 8; c++) { board[r][c] = 2; } }
    return board; 
}
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
// VERİTABANI İŞLEMLERİ
// ----------------------------------------------------------------------

async function getOrCreatePlayer(telegramId, username) {
    try {
        const result = await client.query(
            // ON CONFLICT: Eğer ID varsa sadece kullanıcı adını güncelle (ELO'yu elleme). Yeni kullanıcı ELO'su 0 olacak.
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
        // DB hatası olursa geçici varsayılan değer döndürülür
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

    console.log(`ELO Güncelleme: Kazanan ${winnerId} (+${ELO_CHANGE_AMOUNT}), Kaybeden ${loserId} (-${ELO_CHANGE_AMOUNT})`);
    
    io.emit('rankUpdate'); // Skor tablosunu yenilemeleri için sinyal
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
    
    // ---------------------- ODA KURMA ----------------------
    socket.on('createRoom', async ({ username, telegramId, isRanked = false }) => {
        const playerStats = await getOrCreatePlayer(telegramId, username);
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        games[code] = {
            isRanked: isRanked, 
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
            isRanked: isRanked, 
            elo: playerStats.elo_score 
        });
        console.log(`Oda kuruldu: ${code} - Dereceli: ${isRanked}`);
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

        // Odayı kuranın güncel ELO'sunu çek
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
            // Rakibe bilgi gönderme (Eğer oyun devam ediyorsa disconnect handle edecek)
        }
        delete socketToRoom[socket.id];
    });


    // ---------------------- HAMLE YAPMA ----------------------
    socket.on('makeMove', (data) => {
        const { roomId, from, to } = data;
        const game = games[roomId];
        if (!game || game.isGameOver) return;

        const fromCoord = parseCoord(from);
        const toCoord = parseCoord(to);
        
        const color = (socket.id === game.players.black.id) ? 'black' : 'white';
        const opponentColor = (color === 'black') ? 'white' : 'black';
        
        // ... (Hamle Mantığı Kontrolleri, Vezirleme, Yeme zorunluluğu) ...
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
            
            updateEloScores(winner.telegramId, loser.telegramId, game.isRanked);
            io.to(roomId).emit('gameOver', { 
                winner: winner.username, 
                isRanked: game.isRanked, 
                winnerEloChange: game.isRanked ? ELO_CHANGE_AMOUNT : 0 
            });
        } else {
            // Oyun devam ederken ELO puanlarını güncel çekip göndermek gerekir (yoksa güncel ELO'yu görmezler)
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
        if (room) {
             const playerColor = room.players.black.id === socket.id ? 'black' : 'white';
             
             // Rakip varsa oyunu sonlandır ve rakibi galip ilan et
             if (room.players.black && room.players.white) {
                const winnerColor = playerColor === 'black' ? 'white' : 'black';
                const winner = room.players[winnerColor];
                const loser = room.players[playerColor];
                
                updateEloScores(winner.telegramId, loser.telegramId, room.isRanked);
                
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
// EXPRESS API ROTASI (SKOR TABLOSU)
// ----------------------------------------------------------------------

app.get('/api/leaderboard', async (req, res) => {
    const userTelegramId = req.query.id; 
    
    if (!userTelegramId) {
        return res.status(400).json({ error: "Telegram ID (id) parametresi gerekli." });
    }

    try {
        // TOP 100 Oyuncuyu Çekme (Daha geniş bir liderlik tablosu için)
        const topPlayers = await client.query(
            `SELECT username, elo_score, telegram_id FROM players 
             ORDER BY elo_score DESC 
             LIMIT 100;`
        );

        // Kullanıcının Kendi ELO ve Sırasını Çekme
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
            top10: topPlayers.rows.slice(0, 10), // İlk 10'u döndür
            allRanks: topPlayers.rows, // Sıralama için daha fazlasını döndür (isteğe bağlı)
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
