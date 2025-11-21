const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Tüm kaynaklara izin ver (Github Pages için)
        methods: ["GET", "POST"]
    }
});

let rankedQueue = []; // Dereceli arayanlar
let rooms = {}; // Aktif odalar

// 4 haneli rastgele kod üret
function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı:', socket.id);

    // 1. DERECELİ MAÇ ARAMA
    socket.on('search_ranked', () => {
        if (rankedQueue.includes(socket.id)) return;
        
        rankedQueue.push(socket.id);
        
        // Eğer sırada bekleyen 2. kişi varsa eşleştir
        if (rankedQueue.length >= 2) {
            const player1 = rankedQueue.shift();
            const player2 = rankedQueue.shift();
            const roomId = `ranked_${player1}_${player2}`;
            
            createGameRoom(roomId, player1, player2);
        }
    });

    // Aramayı İptal Et
    socket.on('cancel_search', () => {
        rankedQueue = rankedQueue.filter(id => id !== socket.id);
    });

    // 2. ARKADAŞLA OYNA (ODA KUR)
    socket.on('create_private_room', () => {
        const code = generateRoomCode();
        socket.join(code);
        rooms[code] = { players: [socket.id], board: null, turn: 'white' };
        socket.emit('room_created', code);
    });

    // 3. ODAYA KATIL
    socket.on('join_private_room', (code) => {
        const room = rooms[code];
        if (room && room.players.length < 2) {
            const player1 = room.players[0];
            const player2 = socket.id;
            createGameRoom(code, player1, player2);
        } else {
            socket.emit('error_message', 'Oda bulunamadı veya dolu!');
        }
    });

    // OYUN HAMLESİ
    socket.on('make_move', ({ roomId, moveData }) => {
        socket.to(roomId).emit('opponent_move', moveData);
        // Sırayı değiştir
        io.to(roomId).emit('change_turn', moveData.nextTurn);
    });

    // BAĞLANTI KOPMASI
    socket.on('disconnect', () => {
        rankedQueue = rankedQueue.filter(id => id !== socket.id);
        // Odadan düşen olursa oyunu bitir (Basit mantık)
        // Gerçek bir uygulamada reconnect mantığı eklenmeli
    });
});

function createGameRoom(roomId, p1, p2) {
    // Soketleri odaya al
    io.sockets.sockets.get(p1)?.join(roomId);
    io.sockets.sockets.get(p2)?.join(roomId);

    // Oyunu Başlat
    io.to(roomId).emit('game_start', {
        roomId: roomId,
        players: { white: p1, red: p2 }
    });

    // Renkleri Ata
    io.to(p1).emit('color_assigned', 'white');
    io.to(p2).emit('color_assigned', 'red');
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor`);
});
