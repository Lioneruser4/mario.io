const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);

// **Render ve Github Pages için CORS Ayarları**
const io = socketio(server, {
    cors: {
        // Her kaynaktan bağlantıya izin verilir (Güvenlik için spesifik alan adı önerilir!)
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 10000; 

// --- SUNUCU OYUN DURUMU YÖNETİMİ ---
let lobbies = {}; 
// Socket ID'leri yerine, { socketId: '...', username: '...' } objeleri tutulacak.
let rankingQueue = []; 

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

    // Kullanıcının hangi lobide olduğunu saklar
    socket.data.lobbyId = null;

    // --- LOBİ KURMA ---
    socket.on('create_lobby', (username) => {
        if (socket.data.lobbyId) return socket.emit('error', 'Zaten bir oyundasınız.');

        const lobbyId = generateLobbyId();
        lobbies[lobbyId] = {
            id: lobbyId,
            player1: { socketId: socket.id, username: username, role: 1 },
            player2: null,
            boardState: JSON.parse(JSON.stringify(INITIAL_BOARD_STATE)),
            turn: 1, 
            isRanked: false
        };
        socket.join(lobbyId);
        socket.data.lobbyId = lobbyId;
        
        socket.emit('lobby_created', { lobbyId, playerRole: 1, username });
        console.log(`🎲 Lobi kuruldu: ${lobbyId} (P1: ${username})`);
    });

    // --- ODAYA KATILMA ---
    socket.on('join_lobby', ({ lobbyId, username }) => {
        if (socket.data.lobbyId) return socket.emit('error', 'Zaten bir oyundasınız.');
        const lobby = lobbies[lobbyId];

        if (!lobby || lobby.player2) {
            return socket.emit('error', 'Oda kodu geçersiz, mevcut değil veya dolu.');
        }

        lobby.player2 = { socketId: socket.id, username: username, role: 2 };
        socket.join(lobbyId);
        socket.data.lobbyId = lobbyId;

        // P2'ye bilgiyi gönder
        socket.emit('lobby_joined', { lobbyId, playerRole: 2, username });
        
        // P1'e P2'nin katıldığını bildir
        io.to(lobby.player1.socketId).emit('player2_joined', username); 
        
        // Oyunu başlatma sinyali (Her iki oyuncuya da)
        io.to(lobbyId).emit('game_start', { 
            lobbyId, 
            initialState: lobby.boardState, 
            turn: lobby.turn,
            player1Username: lobby.player1.username,
            player2Username: username
        });
        
        console.log(`🤝 Oyuncu 2 katıldı: ${lobbyId} (P2: ${username})`);
    });

    // --- DERECE LOBİSİ VE EŞLEŞTİRME ---

    socket.on('start_rank_match', (username) => {
        if (socket.data.lobbyId) return socket.emit('error', 'Zaten bir oyundasınız.');
        
        // 1. Eşleşme bulunduysa
        if (rankingQueue.length > 0) {
            const opponent = rankingQueue.shift(); // İlk bekleyeni al
            const lobbyId = generateLobbyId();
            
            const newLobby = {
                id: lobbyId,
                player1: { socketId: opponent.socketId, username: opponent.username, role: 1 },
                player2: { socketId: socket.id, username: username, role: 2 },
                boardState: JSON.parse(JSON.stringify(INITIAL_BOARD_STATE)),
                turn: 1,
                isRanked: true
            };
            lobbies[lobbyId] = newLobby;
            
            // Odaya dahil etme
            socket.join(lobbyId);
            io.to(opponent.socketId).join(lobbyId);
            socket.data.lobbyId = lobbyId;
            io.sockets.sockets.get(opponent.socketId).data.lobbyId = lobbyId;

            // Oyunu başlatma sinyali (Her iki oyuncuya da)
            io.to(lobbyId).emit('rank_match_start', { lobbyId, player1Username: opponent.username, player2Username: username });
            
            io.to(lobbyId).emit('game_start', { 
                lobbyId, 
                initialState: newLobby.boardState, 
                turn: newLobby.turn,
                player1Username: opponent.username,
                player2Username: username
            });

            console.log(`👑 Dereceli Eşleşme Başladı: ${lobbyId}`);
        } else {
            // 2. Sıraya ekle
            rankingQueue.push({ socketId: socket.id, username: username });
            socket.emit('waiting_for_opponent', 'Dereceli eşleşme bekleniyor...');
            console.log(`⏳ Sıraya eklendi: ${socket.id} (${username})`);
        }
    });

    // --- OYUN İÇİ HAMLE İLETİMİ ---

    socket.on('make_move', (data) => {
        const { lobbyId, move } = data;
        const lobby = lobbies[lobbyId];

        if (!lobby || socket.data.lobbyId !== lobbyId) return socket.emit('error', 'Geçersiz lobi veya yetkisiz hamle.');
        
        // Hamleyi yapan oyuncu rolü (1 veya 2)
        const playerRole = (socket.id === lobby.player1.socketId) ? 1 : 2;

        // **SIRA KONTROLÜ**
        if (playerRole !== lobby.turn) { 
             return socket.emit('error', 'Sıra sizde değil!'); 
        }

        // *** GEREKİRSE BURAYA GELİŞMİŞ OYUN KURAL KONTROLÜ EKLENMELİ ***

        // Hamleyi lobi içerisindeki diğer oyuncuya ilet
        socket.to(lobbyId).emit('opponent_moved', move); 

        // Sunucudaki sırayı değiştir
        lobby.turn = (lobby.turn === 1) ? 2 : 1;
        
        console.log(`➡️ Hamle İletildi (${lobbyId}): P${playerRole} -> P${lobby.turn}`);
    });

    // --- BAĞLANTI KESİLMESİ İŞLEMLERİ ---

    socket.on('disconnect', () => {
        console.log(`❌ Kullanıcı ayrıldı: ${socket.id}`);
        const currentLobbyId = socket.data.lobbyId;

        // 1. Eşleştirme kuyruğundan çıkar
        rankingQueue = rankingQueue.filter(q => q.socketId !== socket.id);

        // 2. Lobiden çıkar ve rakibe haber ver
        if (currentLobbyId && lobbies[currentLobbyId]) {
            const lobby = lobbies[currentLobbyId];
            let opponentId = null;

            if (lobby.player1 && lobby.player1.socketId === socket.id && lobby.player2) {
                opponentId = lobby.player2.socketId;
            } else if (lobby.player2 && lobby.player2.socketId === socket.id && lobby.player1) {
                opponentId = lobby.player1.socketId;
            }

            if (opponentId) {
                io.to(opponentId).emit('opponent_disconnected', 'Rakip bağlantıyı kesti. Oyunu kazandınız!');
                // Rakibin lobisini de temizle
                const opponentSocket = io.sockets.sockets.get(opponentId);
                if (opponentSocket) opponentSocket.data.lobbyId = null;
            }
            
            delete lobbies[currentLobbyId];
            console.log(`🗑️ Lobi silindi: ${currentLobbyId}`);
        }
    });
});

// Sunucuyu başlatma
server.listen(PORT, () => {
    console.log(`✅ Socket.IO Sunucu ${PORT} portunda çalışıyor.`);
});
