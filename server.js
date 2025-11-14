// Dosya Adı: server.js (ELO ve Dereceli Sistemi)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client } = require('pg');

const app = express();
const server = http.createServer(app);

// CORS ve Transport Ayarları
const io = new Server(server, {
    cors: {
        origin: "*", // Tüm client'lara izin ver (Render/GitHub Pages)
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'] 
});

// PostgreSQL Bağlantısı
const client = new Client({
    // Render'daki DATABASE_URL ortam değişkenini kullanır
    connectionString: process.env.DATABASE_URL,
    // SSL ayarı (Render'da genellikle gereklidir)
    ssl: { rejectUnauthorized: false }
});

client.connect().then(() => {
    console.log("✅ PostgreSQL veritabanına başarıyla bağlanıldı.");
    // Kullanıcı tablosunu oluştur (ONCE GEREKIR)
    client.query(`
        CREATE TABLE IF NOT EXISTS players (
            telegram_id VARCHAR(50) PRIMARY KEY,
            username VARCHAR(100) NOT NULL,
            elo_score INTEGER DEFAULT 1000,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0
        );
    `).then(() => {
        console.log("✅ 'players' tablosu kontrol edildi/oluşturuldu.");
    }).catch(err => {
        console.error("Tablo oluşturma hatası:", err.message);
    });
}).catch(err => {
    console.error("❌ PostgreSQL bağlantı hatası:", err.message);
});


let games = {}; // Odaları ve oyun durumlarını tutar
let socketToRoom = {}; // Kullanıcı ID'sini Odaya eşlemek için
const ELO_CHANGE_AMOUNT = 10; // Kazanana +10, Kaybedene -10

// ----------------------------------------------------------------------
// OYUN MANTIĞI VE ELO İŞLEMLERİ FONKSİYONLARI
// ----------------------------------------------------------------------

// ... (initializeCheckersBoard, canPlayerJump, getAvailableMoves, hasAnyValidMoves fonksiyonları buraya gelecek) ...
// Not: Yer kazanmak için bu Dama (Şaşki) mantık fonksiyonlarını eklemiyorum, 
// ancak son kodunuzdaki tüm Dama mantık fonksiyonlarını buraya eklemelisiniz. 

// Örnek Dama tahtası başlatma fonksiyonu (Yer Tutucu)
function initializeCheckersBoard() {
    const board = Array(8).fill(null).map(() => Array(8).fill(0));
    // Siyah (1) ve Beyaz (2) taşları dizin...
    return board; 
}
// Diğer tüm Dama mantık fonksiyonlarını buraya yapıştırın.

/**
 * Veritabanında bir oyuncuyu bulur veya ELO:1000 ile yeni bir oyuncu oluşturur.
 */
async function getOrCreatePlayer(telegramId, username) {
    try {
        const result = await client.query(
            `INSERT INTO players (telegram_id, username, elo_score) 
             VALUES ($1, $2, 1000) 
             ON CONFLICT (telegram_id) 
             DO UPDATE SET username = $2 
             RETURNING telegram_id, username, elo_score;`,
            [telegramId, username]
        );
        return result.rows[0];
    } catch (err) {
        console.error("Oyuncu kaydetme/bulma hatası:", err.message);
        return { telegram_id: telegramId, username: username, elo_score: 1000 };
    }
}

/**
 * Dereceli oyun sonunda ELO ve istatistikleri günceller.
 */
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
    
    // Skor tablosunu yenilemeleri için tüm client'lara sinyal gönder
    io.emit('rankUpdate');
}

// ----------------------------------------------------------------------
// SOCKET.IO BAĞLANTILARI
// ----------------------------------------------------------------------

io.on('connection', (socket) => {
    console.log(`Yeni bağlantı: ${socket.id}`);
    
    // ---------------------- ODA KURMA ----------------------
    socket.on('createRoom', async ({ username, telegramId, isRanked = false }) => {
        const playerStats = await getOrCreatePlayer(telegramId, username);
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        games[code] = {
            isRanked: isRanked, // Dereceli mi?
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
        console.log(`Oda kuruldu: ${code} - Dereceli: ${isRanked} - Kurucu ELO: ${playerStats.elo_score}`);
    });

    // ---------------------- ODAYA KATILMA ----------------------
    socket.on('joinRoom', async ({ username, telegramId, roomCode }) => {
        const code = roomCode.toUpperCase();
        const room = games[code];

        if (!room || room.players['white']) {
            socket.emit('error', 'Oda bulunamadı veya dolu.');
            return;
        }
        
        const playerStats = await getOrCreatePlayer(telegramId, username);

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
            // Oyuncuların güncel ELO puanlarını gönder
            blackElo: room.players['black'].elo, 
            whiteElo: room.players['white'].elo 
        });
        console.log(`Oyuncu ${username} katıldı: ${code} - Katılan ELO: ${playerStats.elo_score}`);
    });

    // ---------------------- HAMLE YAPMA ----------------------
    socket.on('makeMove', (data) => {
        // ... (Önceki makeMove mantık kodunuzu buraya yapıştırın) ...
        // **ÖNEMLİ:** Bu fonksiyonun sonunda Oyun Bitiş Kontrolü yapılmalıdır.
        
        // SADECE ÖRNEK BİR OYUN BİTİŞ KONTROLÜ (Gerçek Dama mantığı değil!)
        // if (OyunBitti) {
        //    // Örnek: Siyah Kazandı
        //    const winnerColor = 'black'; 
        //    const winner = game.players[winnerColor];
        //    const loser = game.players[(winnerColor === 'black' ? 'white' : 'black')];
        //
        //    // ELO Güncelleme yapıldı.
        //    updateEloScores(winner.telegramId, loser.telegramId, game.isRanked);
        //
        //    io.to(roomId).emit('gameOver', { 
        //        winner: winner.username, 
        //        isRanked: game.isRanked, 
        //        winnerEloChange: game.isRanked ? ELO_CHANGE_AMOUNT : 0 
        //    });
        // }
    });
    
    // ---------------------- OYUN BİTİŞİ (ELO İÇİN ÖZEL SİNYAL) ----------------------
    // **ÖNEMLİ:** Bu, makeMove içinde tetiklenmelidir.
    socket.on('gameFinished', async ({ roomId, winnerColor }) => {
        const game = games[roomId];
        if (!game || game.isGameOver) return;
        
        game.isGameOver = true;
        
        const winner = game.players[winnerColor];
        const loser = game.players[(winnerColor === 'black' ? 'white' : 'black')];
        
        if (winner && loser) {
            await updateEloScores(winner.telegramId, loser.telegramId, game.isRanked);
        } else {
             // 1vs1 olmayan (örn: bot/hata) durumda ELO hesaplama.
             console.log("Oyun 1v1 değildi, ELO hesaplanmadı.");
        }
        
        // Kazanan ELO puanını tekrar veritabanından çekip yeni ELO'yu gönderebiliriz.
        // Ancak basit tutmak için client'a sadece değişimi gönderelim.
        io.to(roomId).emit('gameOver', { 
            winner: winner.username, 
            isRanked: game.isRanked, 
            winnerEloChange: game.isRanked ? ELO_CHANGE_AMOUNT : 0 
        });
    });

    // ---------------------- BAĞLANTI KESİLMESİ ----------------------
    socket.on('disconnect', () => {
        // ... (Önceki disconnect mantık kodunuzu buraya yapıştırın) ...
    });
});

// ----------------------------------------------------------------------
// EXPRESS API ROTASI (SKOR TABLOSU)
// ----------------------------------------------------------------------

// Sadece Top 10 ve kullanıcının kendi istatistiklerini döndüren API
app.get('/api/leaderboard', async (req, res) => {
    const userTelegramId = req.query.id; // Kullanıcı ID'si
    
    if (!userTelegramId) {
        return res.status(400).json({ error: "Telegram ID (id) parametresi gerekli." });
    }

    try {
        // 1. TOP 10 Oyuncuyu Çekme
        const top10Players = await client.query(
            `SELECT username, elo_score, telegram_id FROM players 
             ORDER BY elo_score DESC 
             LIMIT 10;`
        );

        // 2. Kullanıcının Kendi ELO ve Sırasını Çekme
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

        // 3. Verileri birleştirip istemciye gönder
        res.json({
            top10: top10Players.rows,
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

