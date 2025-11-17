const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let queue = [];           // Dereceli sırası
let privateRooms = {};    // { code: { players: [socket.id, ...], names: [...] } }

io.on('connection', socket => {
    console.log('Bağlandı:', socket.id);

    socket.on('joinQueue', name => {
        queue.push({id:socket.id, name});
        if(queue.length >= 2){
            const p1 = queue.shift();
            const p2 = queue.shift();
            startGame(p1,p2);
        }
    });

    socket.on('createPrivateRoom', name => {
        let code;
        do { code = String(Math.floor(1000 + Math.random() * 9000)); }
        while(privateRooms[code]);
        privateRooms[code] = { players: [socket.id], names: [name] };
        socket.emit('privateRoomCreated', code);
    });

    socket.on('joinPrivateRoom', ({name, code}) => {
        const room = privateRooms[code];
        if(!room || room.players.length >= 2){
            socket.emit('error','Oda dolu veya yok!');
            return;
        }
        room.players.push(socket.id);
        room.names.push(name);
        // İki kişi oldu → oyunu başlat
        const p1 = {id: room.players[0], name: room.names[0]};
        const p2 = {id: room.players[1], name: room.names[1]};
        startGame(p1, p2);
        delete privateRooms[code]; // Temizle
    });

    function startGame(p1, p2){
        const gameId = Date.now() + Math.random();
        io.to(p1.id).emit('gameStart', {gameId, color:'red'});
        io.to(p2.id).emit('gameStart', {gameId, color:'black'});
        console.log('Oyun başladı:', gameId);
    }

    socket.on('disconnect', () => {
        queue = queue.filter(x => x.id !== socket.id);
        for(const code in privateRooms){
            privateRooms[code].players = privateRooms[code].players.filter(id=>id!==socket.id);
            if(privateRooms[code].players.length===0) delete privateRooms[code];
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log('Sunucu çalışıyor → https://mario-io-1.onrender.com'));
