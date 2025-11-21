const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Statik faylları xidmət edir
app.use(express.static(path.join(__dirname)));

// Oyun otaqları və gözləmə siyahısı
const waitingQueue = [];
const gameRooms = new Map();

// Socket.IO bağlantıları
io.on('connection', (socket) => {
    console.log(`İstifadəçi qoşuldu: ${socket.id}`);

    // İstifadəçini gözləmə siyahısına əlavə et
    socket.on('findMatch', () => {
        console.log(`İstifadəçi ${socket.id} raqib axtarır...`);
        
        // İstifadəçini gözləmə siyahısına əlavə et
        waitingQueue.push(socket.id);
        
        // Raqib varmı yoxla
        if (waitingQueue.length >= 2) {
            // İki istifadəçi gözləyir - onları eşləşdir
            const player1 = waitingQueue.shift();
            const player2 = waitingQueue.shift();
            
            // Otaq yarat
            const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Otaq məlumatları
            gameRooms.set(roomId, {
                player1: player1,
                player2: player2,
                gameState: {
                    player1: { x: 100, y: 300, score: 0, velocityX: 0, velocityY: 0 },
                    player2: { x: 700, y: 300, score: 0, velocityX: 0, velocityY: 0 },
                    ball: { x: 400, y: 200, velocityX: 5, velocityY: 3 },
                    gameStarted: true
                }
            });
            
            // İstifadəçiləri otağa qoş
            socket.join(roomId);
            io.sockets.sockets.get(player1)?.join(roomId);
            
            console.log(`Eşleşdirildi: ${player1} vs ${player2} - Otaq: ${roomId}`);
            
            // Hər iki istifadəçiyə eşleşmə məlumatını göndər
            io.to(roomId).emit('matchFound', {
                roomId: roomId,
                players: {
                    player1: player1,
                    player2: player2
                },
                yourId: socket.id
            });
            
            // Oyun vəziyyətini göndər
            const gameState = gameRooms.get(roomId).gameState;
            io.to(roomId).emit('gameState', gameState);
        } else {
            // Hələ raqib yoxdur
            socket.emit('waiting', {
                message: 'Raqib axtarilir...',
                queuePosition: waitingQueue.length
            });
        }
    });

    // Oyun hərəkətlərini qəbul et
    socket.on('playerMove', (data) => {
        const { roomId, playerData } = data;
        
        if (gameRooms.has(roomId)) {
            const room = gameRooms.get(roomId);
            
            // Oyun vəziyyətini yenilə
            if (socket.id === room.player1) {
                room.gameState.player1 = { ...room.gameState.player1, ...playerData };
            } else if (socket.id === room.player2) {
                room.gameState.player2 = { ...room.gameState.player2, ...playerData };
            }
            
            // Yenilənmiş vəziyyəti hər kəsə göndər
            io.to(roomId).emit('gameState', room.gameState);
        }
    });

    // Topun hərəkətini yenilə
    socket.on('updateBall', (data) => {
        const { roomId, ballData } = data;
        
        if (gameRooms.has(roomId)) {
            const room = gameRooms.get(roomId);
            room.gameState.ball = { ...room.gameState.ball, ...ballData };
            
            // Yenilənmiş vəziyyəti hər kəsə göndər
            io.to(roomId).emit('gameState', room.gameState);
        }
    });

    // Xal yeniləmə
    socket.on('updateScore', (data) => {
        const { roomId, playerId, score } = data;
        
        if (gameRooms.has(roomId)) {
            const room = gameRooms.get(roomId);
            
            if (socket.id === room.player1) {
                room.gameState.player1.score = score;
            } else if (socket.id === room.player2) {
                room.gameState.player2.score = score;
            }
            
            // Yenilənmiş vəziyyəti hər kəsə göndər
            io.to(roomId).emit('gameState', room.gameState);
        }
    });

    // Bağlantı qırıldıqda
    socket.on('disconnect', () => {
        console.log(`İstifadəçi ayrıldı: ${socket.id}`);
        
        // Gözləmə siyahısından çıxar
        const queueIndex = waitingQueue.indexOf(socket.id);
        if (queueIndex > -1) {
            waitingQueue.splice(queueIndex, 1);
        }
        
        // Otaqlardan çıxar və digər istifadəçiyə xəbər ver
        gameRooms.forEach((room, roomId) => {
            if (room.player1 === socket.id || room.player2 === socket.id) {
                io.to(roomId).emit('playerDisconnected', {
                    message: 'Raqib oyundan çıxdı',
                    disconnectedPlayer: socket.id
                });
                
                // Otağı bağla
                gameRooms.delete(roomId);
            }
        });
    });
});

// Serveri başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Mario.io serveri ${PORT} portunda işləyir...`);
    console.log(`Oyunu oynamaq üçün: http://localhost:${PORT}`);
});
