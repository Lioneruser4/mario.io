const express = require('express');
const http = require('http');
const socketio = require('socket.io');

// Eğer Render gibi bir platformda barındırıyorsanız CORS ayarları önemlidir.
// Frontend'in (Github Pages) sunucunuza bağlanmasına izin verir.
const app = express();
const server = http.createServer(app);
const io = socketio(server, {
    cors: {
        // İzin verilen origin: '*' (her yerden bağlantıya izin verir) veya
        // spesifik olarak Github Pages adresiniz (örn: 'https://kullaniciadi.github.io')
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Port, Render'ın veya ortamın sağladığı portu kullanmalıdır.
const PORT = process.env.PORT || 10000; 

// --- SUNUCU OYUN DURUMU YÖNETİMİ ---
let lobbies = {}; // { 'oda_kodu': { player1: socketId, player2: socketId, boardState: array, turn: 1 } }
let rankingQueue = []; // Dereceli eşleşme için bekleyen socketId'ler

// Basit Dama Başlangıç Tahtası
const INITIAL_BOARD_STATE = [
    [0, 2, 0, 2, 0, 2, 0, 2],
    [2, 0, 2, 0, 2, 0, 2, 0],
    [0, 2, 0, 2, 0, 2, 0, 2],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 1, 0, 1, 0, 1, 0],
    [0, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0]
];

// Benzersiz 4 haneli oda kodu üretir
function generateLobbyId() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
    console.log(`✅ Yeni bir kullanıcı bağlandı: ${socket.id}`);

    // --- 1. LOBİ İŞLEMLERİ ---

    // Kullanıcı lobi kurmak istiyor
    socket.on('create_lobby', (username) => {
        const lobbyId = generateLobbyId();
        lobbies[lobbyId] = {
            id: lobbyId,
            player1: socket.id,
            player2: null,
            boardState: JSON.parse(JSON.stringify(INITIAL_BOARD_STATE)), // Deep copy
            turn: 1, // Oyuncu 1 başlar
            isRanked: false
        };
        socket.join(lobbyId);
        
        socket.emit('lobby_created', { lobbyId, playerRole: 1, username });
        console.log(`🎲 Lobi kuruldu: ${lobbyId} (P1: ${username})`);
    });

    // Kullanıcı bir odaya katılmak istiyor
    socket.on('join_lobby', ({ lobbyId, username }) => {
        const lobby = lobbies[lobbyId];

        if (!lobby) {
            socket.emit('error', 'Oda kodu geçersiz veya mevcut değil.');
            return;
        }
        if (lobby.player2) {
            socket.emit('error', 'Bu oda zaten dolu.');
            return;
        }

        lobby.player2 = socket.id;
        socket.join(lobbyId);

        // İki oyuncuya da bilgiyi gönder ve oyunu başlat
        socket.emit('lobby_joined', { lobbyId, playerRole: 2, username });
        io.to(lobby.player1).emit('player2_joined', username); // P1'e rakibin adını bildir
        
        io.to(lobbyId).emit('game_start', { 
            lobbyId, 
            initialState: lobby.boardState, 
            turn: lobby.turn 
        });
        
        console.log(`🤝 Oyuncu 2 katıldı: ${lobbyId} (P2: ${username})`);
    });

    // --- 2. DERECE LOBİSİ VE EŞLEŞTİRME ---

    socket.on('start_rank_match', (username) => {
        if (rankingQueue.length > 0) {
            const opponentSocketId = rankingQueue.shift(); // İlk bekleyeni al
            const lobbyId = generateLobbyId();
            
            const newLobby = {
                id: lobbyId,
                player1: socket.id,
                player2: opponentSocketId,
                boardState: JSON.parse(JSON.stringify(INITIAL_BOARD_STATE)),
                turn: 1,
                isRanked: true
            };
            lobbies[lobbyId] = newLobby;
            
            // Odaya dahil etme
            socket.join(lobbyId);
            io.to(opponentSocketId).join(lobbyId);

            // Oyunu başlatma bildirimleri
            io.to(socket.id).emit('rank_match_start', { lobbyId, playerRole: 1, opponentId: opponentSocketId });
            io.to(opponentSocketId).emit('rank_match_start', { lobbyId, playerRole: 2, opponentId: socket.id });
            
            io.to(lobbyId).emit('game_start', { 
                lobbyId, 
                initialState: newLobby.boardState, 
                turn: newLobby.turn 
            });

            console.log(`👑 Dereceli Eşleşme Başladı: ${lobbyId} (${socket.id} vs ${opponentSocketId})`);
        } else {
            rankingQueue.push(socket.id);
            socket.emit('waiting_for_opponent', 'Dereceli eşleşme bekleniyor... Lütfen bu sekmeyi kapatmayın.');
            console.log(`⏳ Sıraya eklendi: ${socket.id} (Sıra uzunluğu: ${rankingQueue.length})`);
        }
    });

    // --- 3. OYUN İÇİ HAMLE İLETİMİ ---

    socket.on('make_move', (data) => {
        const { lobbyId, move } = data;
        const lobby = lobbies[lobbyId];

        if (!lobby) return;
        
        // Hangi oyuncunun hamle yaptığı (P1 veya P2)
        const playerRole = (socket.id === lobby.player1) ? 1 : 2;

        // *** ÖNEMLİ: SUNUCU TARAFINDA KURAL KONTROLÜ ***
        // Burada, gelen hamlenin (move.from, move.to) oyun kurallarına, 
        // taşın cinsine ve sıranın kimde olduğuna göre geçerli olup olmadığı KONTROL EDİLMELİDİR.
        
        // Örneğin: if (playerRole !== lobby.turn) { socket.emit('error', 'Sıra sizde değil!'); return; }
        // Geçerli kabul ederek devam ediyoruz:
        
        // Hamleyi lobi içerisindeki diğer oyuncuya ilet
        socket.to(lobbyId).emit('opponent_moved', move); 

        // Sunucudaki oyun durumunu güncelle
        // (Bu kısım, yenen taşlar, kral olma vb. mantığı içerir)
        // lobby.boardState[move.to.r][move.to.c] = playerRole;
        // lobby.boardState[move.from.r][move.from.c] = 0;
        
        // Sırayı değiştir
        lobby.turn = (lobby.turn === 1) ? 2 : 1;
        
        console.log(`➡️ Hamle İletildi (${lobbyId}): ${playerRole} -> ${JSON.stringify(move)}`);
    });

    // --- 4. BAĞLANTI KESİLMESİ İŞLEMLERİ ---

    socket.on('disconnect', () => {
        console.log(`❌ Kullanıcı ayrıldı: ${socket.id}`);

        // Eğer kullanıcı dereceli sıradaysa, kuyruktan çıkar.
        const rankIndex = rankingQueue.indexOf(socket.id);
        if (rankIndex > -1) {
            rankingQueue.splice(rankIndex, 1);
            console.log(`Sıradan çıkarıldı: ${socket.id}`);
        }

        // Kullanıcının bulunduğu lobiyi bul
        for (const id in lobbies) {
            const lobby = lobbies[id];
            
            if (lobby.player1 === socket.id || lobby.player2 === socket.id) {
                // Diğer oyuncuya bildirim gönder
                const opponentId = (socket.id === lobby.player1) ? lobby.player2 : lobby.player1;

                if (opponentId) {
                    io.to(opponentId).emit('opponent_disconnected', 'Rakip bağlantıyı kesti. Oyunu kazandınız!');
                }
                
                // Lobiyi sil
                delete lobbies[id];
                console.log(`🗑️ Lobi silindi: ${id}`);
                break; 
            }
        }
    });
});

// Sunucuyu başlatma
server.listen(PORT, () => {
    console.log(`✅ Socket.IO Sunucu ${PORT} portunda çalışıyor.`);
    console.log(`Frontend'den ${SERVER_URL} adresine bağlanılacak.`);
});
