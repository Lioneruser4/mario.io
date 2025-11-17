const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);

// **Render ve Github Pages için CORS Ayarları**
const io = socketio(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 10000; 

// --- SUNUCU OYUN DURUMU YÖNETİMİ ---
let lobbies = {}; 
let rankingQueue = []; // [{ socketId: '...', username: '...' }]

const INITIAL_BOARD_STATE = [
    [0, 2, 0, 2, 0, 2, 0, 2], [2, 0, 2, 0, 2, 0, 2, 0],
    [0, 2, 0, 2, 0, 2, 0, 2], [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0], [1, 0, 1, 0, 1, 0, 1, 0],
    [0, 1, 0, 1, 0, 1, 0, 1], [1, 0, 1, 0, 1, 0, 1, 0]
];

function generateLobbyId() {
    // 4 Rakamlı Oda Kodu
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// Socket'i eşleştirme kuyruğundan bulup çıkarır
function removeSocketFromQueue(socketId) {
    const index = rankingQueue.findIndex(q => q.socketId === socketId);
    if (index > -1) {
        rankingQueue.splice(index, 1);
        return true;
    }
    return false;
}

io.on('connection', (socket) => {
    console.log(`✅ Yeni kullanıcı: ${socket.id}`);
    socket.data.lobbyId = null;

    // --- LOBİ KURMA (ARKADAŞLA OYNA) ---
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
        
        // P1'e oda kodunu gönder
        socket.emit('lobby_created', { lobbyId, playerRole: 1, username });
        console.log(`🎲 Lobi kuruldu: ${lobbyId}`);
    });

    // --- ODAYA KATILMA ---
    socket.on('join_lobby', ({ lobbyId, username }) => {
        if (socket.data.lobbyId) return socket.emit('error', 'Zaten bir oyundasınız.');
        const lobby = lobbies[lobbyId];

        if (!lobby || lobby.player2) {
            return socket.emit('error', 'Oda kodu geçersiz veya dolu. Kod: ' + lobbyId);
        }

        lobby.player2 = { socketId: socket.id, username: username, role: 2 };
        socket.join(lobbyId);
        socket.data.lobbyId = lobbyId;

        socket.emit('lobby_joined', { lobbyId, playerRole: 2, username });
        
        // Oyunu başlatma sinyali (Her iki oyuncuya da)
        io.to(lobbyId).emit('game_start', { 
            lobbyId, 
            initialState: lobby.boardState, 
            turn: lobby.turn,
            player1: lobby.player1,
            player2: lobby.player2
        });
        
        console.log(`🤝 Oyuncu 2 katıldı: ${lobbyId}`);
    });

    // --- DERECE LOBİSİ VE EŞLEŞTİRME ---

    socket.on('start_rank_match', (username) => {
        if (socket.data.lobbyId) return socket.emit('error', 'Zaten bir oyundasınız.');
        
        // 1. Eşleşme bulunduysa
        if (rankingQueue.length > 0) {
            const opponent = rankingQueue.shift(); // Sırada bekleyen ilk kişiyi al
            
            // Rakip soketin hala bağlı olduğundan emin ol
            const opponentSocket = io.sockets.sockets.get(opponent.socketId);
            if (!opponentSocket) {
                 console.log(`❌ Rakip soket bulunamadı, sıradan atlandı: ${opponent.socketId}`);
                 // Bu kişiyi sıraya geri ekle
                 rankingQueue.push({ socketId: socket.id, username: username });
                 socket.emit('waiting_for_opponent', 'Geçici sorun oluştu, tekrar aranıyor...');
                 return;
            }

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
            
            // Odaya dahil etme ve lobiId atama
            socket.join(lobbyId);
            opponentSocket.join(lobbyId);
            socket.data.lobbyId = lobbyId;
            opponentSocket.data.lobbyId = lobbyId;

            // Oyunu başlatma sinyali (Her iki oyuncuya da)
            io.to(lobbyId).emit('rank_match_start', { lobbyId });
            
            io.to(lobbyId).emit('game_start', { 
                lobbyId, 
                initialState: newLobby.boardState, 
                turn: newLobby.turn,
                player1: newLobby.player1,
                player2: newLobby.player2
            });

            console.log(`👑 Dereceli Eşleşme Başladı: ${lobbyId}`);
        } else {
            // 2. Sıraya ekle
            rankingQueue.push({ socketId: socket.id, username: username });
            socket.emit('waiting_for_opponent', 'Dereceli eşleşme aranıyor. Lütfen bekleyiniz...');
            console.log(`⏳ Sıraya eklendi: ${socket.id} (${username})`);
        }
    });
    
    // --- OYUN İÇİ HAMLE İLETİMİ ---
    socket.on('make_move', (data) => {
        const { lobbyId, move } = data;
        const lobby = lobbies[lobbyId];

        if (!lobby || socket.data.lobbyId !== lobbyId) return socket.emit('error', 'Geçersiz lobi veya yetkisiz hamle.');
        
        const playerRole = (socket.id === lobby.player1.socketId) ? 1 : 2;

        // SIRA KONTROLÜ
        if (playerRole !== lobby.turn) { 
             return socket.emit('error', 'Sıra sizde değil!'); 
        }

        // *** GERÇEK DAMA KURALLARI VE TAHTA GÜNCELLEMESİ BURAYA EKLENMELİ ***
        // Şu an sadece hamleyi iletiyoruz:

        // Hamleyi lobi içerisindeki diğer oyuncuya ilet
        socket.to(lobbyId).emit('opponent_moved', move); 

        // Sunucudaki sırayı değiştir
        lobby.turn = (lobby.turn === 1) ? 2 : 1;
        
        // Frontend'in sıranın değiştiğini bilmesi için sinyal gönder
        io.to(lobbyId).emit('turn_changed', { newTurn: lobby.turn });

        console.log(`➡️ Hamle İletildi (${lobbyId}): P${playerRole} -> P${lobby.turn}`);
    });
    
    // --- BAĞLANTI KESİLMESİ İŞLEMLERİ ---
    socket.on('disconnect', () => {
        console.log(`❌ Kullanıcı ayrıldı: ${socket.id}`);
        const currentLobbyId = socket.data.lobbyId;

        // 1. Eşleştirme kuyruğundan çıkar
        removeSocketFromQueue(socket.id);

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
