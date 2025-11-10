const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// ⚠️⚠️ DİQQƏT: BURANI ÖZ GITHUB PAGES ÜNVANINIZ İLƏ DƏYİŞMƏLİSİNİZ! ⚠️⚠️
const io = new Server(server, {
  cors: {
    origin: "https://SİZİN-USERNAME.github.io", // <-- MƏS: https://myusername.github.io
    methods: ["GET", "POST"]
  }
});
// ⚠️⚠️-----------------------------------------------------------⚠️⚠️

app.get('/', (req, res) => {
  res.send('Watch Party Server işləyir!');
});

io.on('connection', (socket) => {
  console.log('Bir istifadəçi qoşuldu: ' + socket.id);

  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(socket.id + " otağa qoşuldu: " + roomId);
  });

  socket.on('load_video', (data) => {
    io.to(data.room).emit('sync_load_video', data.videoId);
  });

  socket.on('play', (data) => {
    socket.to(data.room).emit('sync_play', data.time);
  });

  socket.on('pause', (data) => {
    socket.to(data.room).emit('sync_pause');
  });

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
