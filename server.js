const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Tüm odaları, içindeki kullanıcıları ve o anki video durumunu (URL, zaman) tutar.
const rooms = {}; 

// ⚠️⚠️ DİKKAT: BURAYI KENDİ GITHUB PAGES ADRESİNİZLE DEĞİŞTİRİN! ⚠️⚠️
const io = new Server(server, {
  cors: {
    origin: "https://SİZİN-USERNAME.github.io", // <-- Örn: https://myusername.github.io
    methods: ["GET", "POST"]
  }
});
// ⚠️⚠️-----------------------------------------------------------⚠️⚠️

app.get('/', (req, res) => {
  res.send('Watch Party Server çalışıyor!');
});

// Yardımcı Fonksiyon: Odadaki kullanıcı listesini alma
function getRoomUsers(roomId) {
    const clients = io.sockets.adapter.rooms.get(roomId);
    if (!clients) return [];
    
    // Her soketin (kullanıcının) ismini al
    return Array.from(clients).map(socketId => io.sockets.sockets.get(socketId).data.username);
}

// Yardımcı Fonksiyon: Oda durumunu tüm odaya yayınla
function updateRoomStatus(roomId) {
    if (!rooms[roomId]) return;
    
    const status = {
        users: getRoomUsers(roomId),
        video: rooms[roomId].video || null
    };
    // Odaya katılan/ayrılan herkes için kullanıcı listesini güncelle
    io.to(roomId).emit('room_status', status);
}


io.on('connection', (socket) => {
  console.log('Bir kullanıcı bağlandı: ' + socket.id);

  // 1. Odaya Katılma/Yaratma
  socket.on('join_room', (data) => {
    const { roomId, username } = data;

    // Önceki odadan ayrıl
    if (socket.data.roomId) {
        socket.leave(socket.data.roomId);
    }
    
    socket.join(roomId);
    
    // Kullanıcı ve Oda bilgisini sokete kaydet
    socket.data.roomId = roomId;
    socket.data.username = username;

    // Oda mevcut değilse oluştur ve varsayılan video ID'sini kaydet
    if (!rooms[roomId]) {
        rooms[roomId] = {
            video: { id: 'dQw4w9WgXcQ', time: 0, playing: false }, // Varsayılan video ID'si
            host: socket.id // İlk giren host olsun
        };
    }
    
    // Odaya katılan yeni kullanıcıya odanın mevcut video durumunu gönder
    socket.emit('initial_sync', rooms[roomId].video);

    // Odadaki herkesin listesini güncelle
    updateRoomStatus(roomId);
    
    // Ayrılırken kullanıcı listesi güncellensin
    socket.on('disconnecting', () => {
        updateRoomStatus(roomId); 
    });
  });
  
  // 2. Yeni Video Yükleme
  socket.on('load_video', (data) => {
    const { videoId, room } = data;
    
    if (rooms[room]) {
        // Oda durumunu güncelle
        rooms[room].video = { id: videoId, time: 0, playing: false };
        
        // Odadaki herkese video yükleme komutunu gönder
        io.to(room).emit('sync_load_video', videoId);
        
        // Durum güncellendiği için listeyi tekrar gönder (sadece video bilgisi değişti)
        updateRoomStatus(room);
    }
  });

  // 3. Oynatma Komutu (PLAY)
  socket.on('play', (data) => {
    if (rooms[data.room]) {
        // Oda durumunu güncelle
        rooms[data.room].video.time = data.time;
        rooms[data.room].video.playing = true;
        
        // Gönderen hariç odaya yayınla
        socket.to(data.room).emit('sync_play', data.time);
    }
  });

  // 4. Durdurma Komutu (PAUSE)
  socket.on('pause', (data) => {
    if (rooms[data.room]) {
        // Oda durumunu güncelle
        rooms[data.room].video.time = data.time; // Durdurma anındaki zamanı kaydet
        rooms[data.room].video.playing = false;

        // Gönderen hariç odaya yayınla
        socket.to(data.room).emit('sync_pause', data.time);
    }
  });
  
  // 5. Video Zamanını İlerletme/Geri Alma (SEEK)
  socket.on('seek', (data) => {
      if (rooms[data.room]) {
          // Oda durumunu güncelle
          rooms[data.room].video.time = data.time;
          
          // Gönderen hariç odaya yayınla
          socket.to(data.room).emit('sync_seek', data.time);
      }
  });

  // 6. Kullanıcı Ayrılması
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId) {
        // Odadaki herkesin listesini güncelle
        // Not: socket.leave zaten otomatik gerçekleşir.
        updateRoomStatus(roomId);
        
        // Oda boşsa, odayı rooms objesinden sil
        setTimeout(() => {
            const remainingUsers = io.sockets.adapter.rooms.get(roomId);
            if (!remainingUsers || remainingUsers.size === 0) {
                delete rooms[roomId];
                console.log(`Oda silindi: ${roomId}`);
            }
        }, 5000); // 5 saniye bekle, belki yeniden bağlanır
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
});
