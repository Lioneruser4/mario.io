// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// CORS ayarı önemlidir, aksi takdirde GitHub Pages istemcisi bağlanamaz.
const io = new Server(server, {
    cors: {
        origin: "*", // Güvenlik için daha sonra sadece github.io adresinizle değiştirmelisiniz.
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// --- Oda ve Eşleşme Veritabanı (Basit Obje) ---
const rooms = {}; // Örn: { "1234": { player1: socket.id, player2: null, board: initialBoard } }
let waitingPlayer = null; // Dereceli eşleşme bekleyen tek oyuncu

/**
 * 4 haneli benzersiz bir oda kodu oluşturur.
 * @returns {string} Oda kodu
 */
function generateRoomCode() {
    let code;
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms[code]);
    return code;
}

io.on('connection', (socket) => {
    console.log(`[👤 BAĞLANDI] Yeni oyuncu: ${socket.id}`);
    
    // Sunucuya bağlantı başarılı bildirimini gönder
    socket.emit('connectionSuccess', { message: '✅ Sunucuya Bağlantı Başarılı!', socketId: socket.id });

    // --- LOBİ MANTIĞI ---

    // 🏆 DERECE: Eşleşme Ara
    socket.on('eslesmeBaslat', () => {
        if (waitingPlayer && waitingPlayer !== socket.id) {
            // Eşleşme bulundu!
            const roomCode = generateRoomCode();
            rooms[roomCode] = { player1: waitingPlayer, player2: socket.id, turn: waitingPlayer };
            
            // Her iki oyuncuyu da odaya dahil et
            io.sockets.sockets.get(waitingPlayer).join(roomCode);
            socket.join(roomCode);

            // Oyunculara eşleşme bildirimi gönder
            io.to(waitingPlayer).emit('eslesmeBulundu', { room: roomCode, opponentId: socket.id, color: 'Red' });
            io.to(socket.id).emit('eslesmeBulundu', { room: roomCode, opponentId: waitingPlayer, color: 'Black' });

            waitingPlayer = null; // Bekleyen oyuncuyu temizle
            console.log(`[⚔️ EŞLEŞTİ] Oda: ${roomCode}. Oyuncular: ${rooms[roomCode].player1} vs ${rooms[roomCode].player2}`);

        } else if (waitingPlayer === socket.id) {
            // Zaten bekliyorsa bir şey yapma
            socket.emit('mesaj', { text: 'Zaten eşleşme arıyorsunuz.' });
        } else {
            // Oyuncu beklemeye başlar
            waitingPlayer = socket.id;
            socket.emit('eslesmeBekle', { text: 'Eşleşme aranıyor... Lütfen bekleyin.', allowCancel: true });
            console.log(`[⏳ BEKLİYOR] ${socket.id} eşleşme bekliyor.`);
        }
    });

    socket.on('eslesmeIptal', () => {
        if (waitingPlayer === socket.id) {
            waitingPlayer = null;
            socket.emit('mesaj', { text: 'Eşleşme arama iptal edildi.' });
            console.log(`[🚫 İPTAL] ${socket.id} eşleşme arama iptal edildi.`);
        }
    });

    // 🤝 ARKADAŞLA OYNA: Oda Kur
    socket.on('odaKur', () => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = { player1: socket.id, player2: null, turn: socket.id };
        socket.join(roomCode);
        socket.emit('odaOlusturuldu', { code: roomCode, message: `Oda kuruldu: ${roomCode}. Bir arkadaşının bağlanmasını bekle.` });
        console.log(`[🏠 ODA KUR] ${socket.id} odayı kurdu: ${roomCode}`);
    });

    // 🚪 KODLA BAĞLAN: Odaya Bağlan
    socket.on('odayaBaglan', ({ code }) => {
        const room = rooms[code];
        if (room && !room.player2) {
            // Oda var ve ikinci oyuncuyu bekliyor
            socket.join(code);
            room.player2 = socket.id;
            
            // Odaya katılan oyuncuya ve odadaki diğer oyuncuya haber ver
            socket.emit('oyunBaslat', { room: code, color: 'Black', opponentId: room.player1 });
            io.to(room.player1).emit('oyunBaslat', { room: code, color: 'Red', opponentId: socket.id });

            console.log(`[🔗 BAĞLANDI] ${socket.id} odaya bağlandı: ${code}`);

        } else if (room && room.player2) {
            socket.emit('hata', { message: 'Oda dolu veya oyun başladı.' });
        } else {
            socket.emit('hata', { message: 'Geçersiz veya bulunamayan oda kodu.' });
        }
    });

    // --- OYUN MANTIĞI ---
    socket.on('hareketYap', (data) => {
        const { roomCode, from, to } = data;
        const room = rooms[roomCode];

        if (room && (room.player1 === socket.id || room.player2 === socket.id) && room.turn === socket.id) {
            // Burada gerçek dama kurallarını kontrol eden fonksiyon çalışmalı
            // const isValid = checkDamaRules(room.board, from, to); 
            
            // Basitleştirilmiş: Hamle yapıldı ve geçerli kabul edildi
            // if (isValid) {
            
            // Oyun tahtası durumunu güncelle
            // room.board = updateBoardState(room.board, from, to); 

            // Sırayı değiştir
            room.turn = room.player1 === socket.id ? room.player2 : room.player1;
            
            // Diğer oyuncuya ve odaya güncel durumu broadcast et
            io.to(roomCode).emit('oyunDurumuGuncelle', { 
                newBoard: /* room.board */ "Yeni Tahta Durumu",
                lastMove: { from, to },
                turn: room.turn 
            });
            console.log(`[♟️ HAREKET] Oda: ${roomCode}. Hamleyi yapan: ${socket.id}`);

            // } else {
            //     socket.emit('hata', { message: 'Geçersiz hamle.' });
            // }

        } else {
            socket.emit('hata', { message: 'Sıra sizde değil veya odaya ait değilsiniz.' });
        }
    });

    // Bağlantı kesildiğinde
    socket.on('disconnect', () => {
        console.log(`[❌ KESİLDİ] Oyuncu ayrıldı: ${socket.id}`);
        // Tüm odalarda bu oyuncuyu kontrol et ve odaları temizle/diğer oyuncuya haber ver.
        // (Gerçek bir uygulamada bu kısım çok önemlidir ve odaların silinmesini içerir.)
        if (waitingPlayer === socket.id) {
            waitingPlayer = null; // Bekleyen oyuncu ise listeden çıkar
        }
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
