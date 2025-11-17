const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {};

io.on("connection", (socket) => {
  socket.on("createRoom", ({ roomId, username }) => {
    rooms[roomId] = [socket];
    socket.join(roomId);
    socket.emit("roomCreated", "red");
  });

  socket.on("joinRoom", ({ roomId, username }) => {
    const room = rooms[roomId];
    if (room && room.length === 1) {
      room.push(socket);
      socket.join(roomId);
      room[0].emit("startGame", "red");
      socket.emit("startGame", "black");
    }
  });

  socket.on("move", ({ roomId, from, to }) => {
    socket.to(roomId).emit("opponentMove", { from, to });
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(s => s.id !== socket.id);
      if (rooms[roomId].length === 0) delete rooms[roomId];
    }
  });
});

server.listen(3000, () => console.log("Checkers server running on port 3000"));
