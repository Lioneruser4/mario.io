const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// CORS Ayarları: Burası çox vacibdir!
// Sizin GitHub Pages ünvanınızdan gələn sorğulara icazə verməlidir.
const io = new Server(server, {
  cors: {
    origin: "https://SİZİN-USERNAME.github.io", // <-- BUNU DƏYİŞİN!
    methods: ["GET", "POST"]
  }
});

app.get('/', (req, res) => {
  res.send('Watch Party Server işləyir!');
});

io.on('connection', (socket) => {
  console.log('Bir istifadəçi qoşuldu: ' + socket.id);

  // Otağa qoşulma
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(socket.id + " otağa qoşuldu: " + roomId);
  });

  // Yeni video yükləmə siqnalı
  socket.on('load_video', (data) => {
    // Siqnalı göndərən daxil, otaqdakı hər kəsə göndər
    io.to(data.room).emit('sync_load_video', data.videoId);
  });

  // Play siqnalı
  socket.on('play', (data) => {
    socket.to(data.room).emit('sync_play', data.time);
  });

  // Pause siqnalı
  socket.on('pause', (data) => {
    socket.to(data.room).emit('sync_pause');
  });

  // Seek (irəli/geri çəkmə) siqnalı
  socket.on('seek', (data) => {
    socket.to(data.room).emit('sync_seek', data.time);
  });

  socket.on('disconnect', () => {
    console.log('İstifadəçi ayrıldı: ' + socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda işləyir`);
});
