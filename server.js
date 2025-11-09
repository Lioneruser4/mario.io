// Gereken Kütüphaneler: express, socket.io, dotenv, crypto (Node.js yerleşik)
const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Render ortamı portu otomatik olarak process.env.PORT üzerinden sağlar.
const PORT = process.env.PORT || 10000; 

// 🚨 GÜNCELLEME GEREKİYOR: Lütfen bu URL'yi kendi GitHub Pages domaininizle değiştirin!
// Örn: "https://your-username.github.io"
const FRONTEND_ORIGIN = "https://my-github-user.github.io"; 
// Sizin Render URL'niz: https://chatio-zllq.onrender.com

const io = socketio(server, { 
    cors: { 
        origin: FRONTEND_ORIGIN,
        methods: ["GET", "POST"] 
    } 
});

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
    console.error("HATA: TELEGRAM_BOT_TOKEN Ortam Değişkeni Tanımlanmamış! Lütfen Render'a ekleyin.");
    process.exit(1);
}

// Basit geçici oda ve kullanıcı depolama yapısı (Anonimlik için in-memory)
let rooms = {}; 

app.use(express.json());

// --- Telegram Yetkilendirme Doğrulama Fonksiyonu ---
function checkTelegramAuth(data) {
    const check_hash = data.hash;
    const data_check_string = Object.keys(data)
        .filter(key => key !== 'hash')
        .sort()
        .map(key => `${key}=${data[key]}`)
        .join('\n');

    const secret_key = crypto.createHash('sha256').update(TELEGRAM_BOT_TOKEN).digest();
    const hash = crypto.createHmac('sha256', secret_key).update(data_check_string).digest('hex');

    // 24 saat içinde gerçekleşen istekleri kontrol et
    const isTimestampValid = (Date.now() / 1000) - data.auth_date < 86400;
    
    return hash === check_hash && isTimestampValid;
}

// --- API Endpoints ---

// Telegram Girişi Doğrulama
app.post('/api/auth', (req, res) => {
    const authData = req.body;
    if (checkTelegramAuth(authData)) {
        res.json({ 
            success: true, 
            user: { 
                id: authData.id, 
                first_name: authData.first_name || 'Anonim User', 
                photo_url: authData.photo_url 
            } 
        });
    } else {
        res.status(401).json({ success: false, message: 'Telegram Yetkilendirme Başarısız veya Süresi Geçmiş.' });
    }
});

// Oda Oluşturma
app.post('/api/create-room', (req, res) => {
    const roomCode = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 karakterli kod
    rooms[roomCode] = { users: {}, messages: [] };
    
    // 1 saat sonra odayı sil (Anonim ve geçici mesajlaşma kuralı)
    setTimeout(() => {
        delete rooms[roomCode];
        console.log(`Oda ${roomCode} silindi.`);
    }, 60 * 60 * 1000); 

    res.json({ success: true, roomCode });
});

// --- Socket.IO Bağlantıları ---

io.on('connection', (socket) => {
    
    // Odaya Katılma
    socket.on('joinRoom', ({ roomCode, telegramId, anonName }) => {
        if (!rooms[roomCode]) {
            return socket.emit('error', 'Oda bulunamadı.');
        }

        if (rooms[roomCode].users[telegramId]) {
            rooms[roomCode].users[telegramId].socketId = socket.id;
        } else {
            rooms[roomCode].users[telegramId] = { anonName, socketId: socket.id, telegramId };
            io.to(roomCode).emit('userJoined', anonName);
        }

        socket.join(roomCode);
        socket.currentRoom = roomCode;
        
        socket.emit('roomMessages', rooms[roomCode].messages);
    });

    // Mesaj Gönderme
    socket.on('sendMessage', ({ roomCode, telegramId, message }) => {
        if (!rooms[roomCode] || !rooms[roomCode].users[telegramId]) {
            return socket.emit('error', 'Mesaj gönderilemedi: Oda/Kullanıcı geçerli değil.');
        }

        const user = rooms[roomCode].users[telegramId];
        const messageData = { 
            anonName: user.anonName, 
            text: message, 
            timestamp: new Date().toLocaleTimeString('tr-TR'),
        };
        
        rooms[roomCode].messages.push(messageData);
        rooms[roomCode].messages = rooms[roomCode].messages.slice(-100); // Son 100 mesajı tut

        io.to(roomCode).emit('message', messageData);
    });

    // Bağlantı Kesilmesi
    socket.on('disconnect', () => {
        const roomCode = socket.currentRoom;
        if (roomCode && rooms[roomCode]) {
            const users = rooms[roomCode].users;
            
            for (const id in users) {
                if (users[id].socketId === socket.id) {
                    const anonName = users[id].anonName;
                    delete users[id];
                    io.to(roomCode).emit('userLeft', anonName);

                    if (Object.keys(users).length === 0) {
                        delete rooms[roomCode];
                        console.log(`Boş oda ${roomCode} silindi.`);
                    }
                    return;
                }
            }
        }
    });
});

server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));
