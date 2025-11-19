// server.js (Node.js/Express & Socket.io)

// ... [Mevcut require'lar ve başlangıç değişkenleri] ...
// ... [CORS ve Server ayarları (origin: "*" olmalı)] ...
// ... [initializeBoard, generateRoomCode, findJumps, findAllPossibleJumps, checkDamaRules fonksiyonları (önceki yanıttaki gibi)] ...
// ... [Socket.io Bağlantıları io.on('connection', (socket) => { ... } ] ...

io.on('connection', (socket) => {
    // ... [connectionSuccess ve loglar] ...

    socket.on('eslesmeBaslat', () => {
        if (waitingPlayer && waitingPlayer !== socket.id) {
            // ... (Eşleşme mantığı) ...
        } else if (waitingPlayer !== socket.id) {
            waitingPlayer = socket.id;
            socket.emit('eslesmeBekle', { text: 'Eşleşme aranıyor...' });
        }
    });

    socket.on('eslesmeIptal', () => {
        if (waitingPlayer === socket.id) {
            waitingPlayer = null;
            socket.emit('eslesmeIptalBasarili'); // İptal başarısını bildir
        }
    });

    // ... [odaKur ve odayaBaglan mantığı] ...

    socket.on('hareketYap', (data) => {
        // ... [Dama Kural Kontrolü ve Oyun Durumu Güncelleme mantığı] ...
    });

    socket.on('oyunTerket', (data) => {
        // Basitçe odayı dağıt
        const { roomCode } = data;
        const room = rooms[roomCode];
        if (room) {
            const opponentId = room.player1 === socket.id ? room.player2 : room.player1;
            
            // Rakibe bildir
            io.to(opponentId).emit('rakipTerketti', { message: 'Rakip oyunu terk etti. Kazandınız!' });
            
            // Odayı temizle
            delete rooms[roomCode];
        }
    });

    socket.on('disconnect', () => {
        if (waitingPlayer === socket.id) waitingPlayer = null;
        // ... (Oyuncu ayrılma mantığı) ...
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
