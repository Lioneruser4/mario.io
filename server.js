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

// ✅ GÜNCELLENDİ: Frontend Origin (GitHub Pages URL'niz)
const FRONTEND_ORIGIN = "https://lioneruser4.github.io"; 
// Backend URL: https://chatio-zllq.onrender.com

const io = socketio(server, { 
    cors: { 
        // İzin verilen tek alan adınız.
        origin: FRONTEND_ORIGIN,
        methods: ["GET", "POST"] 
    } 
});

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
    console.error("HATA: TELEGRAM_BOT_TOKEN Ortam Değişkeni Tanımlanmamış!");
    process.exit(1);
}

// Basit geçici oda ve kullanıcı depolama yapısı (Anonimlik için in-memory)
let rooms = {}; 

app.use(express.json());

// --- Telegram Web App Yetkilendirme Doğrulama Fonksiyonu ---
// Web App'den gelen initData'yı doğrular.
function checkTelegramWebAppAuth(initData) {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) return null;

    const dataCheckString = Array.from(params.entries())
        .filter(([key]) => key !== 'hash')
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secret_key = crypto.createHmac('sha256', 'WebAppData').update(TELEGRAM_BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secret_key).update(dataCheckString).digest('hex');

    if (calculatedHash === hash) {
        const userData = params.get('user');
        if (userData) {
            try {
                const user = JSON.parse(userData);
                // Auth Date kontrolü (24 saatten eski olmamalı)
                const isTimestampValid = (Date.now() / 1000) - params.get('auth_date') < 86400;
                if (isTimestampValid) return user;

            } catch (e) {
                console.error("Kullanıcı verisi JSON parse hatası:", e);
                return null;
            }
        }
    }
    return null;
}

// --- API Endpoints ---

// Telegram Web App Girişi Doğrulama
app.post('/api/auth', (req, res) => {
    const { initData } = req.body;
    
    if (!initData) {
        return res.status(400).json({ success: false, message: 'initData eksik.' });
    }

    const user = checkTelegramWebAppAuth(initData);

    if (user) {
        res.json({ 
            success: true, 
            user: { 
                id: user.id, 
                first_name: user.first_name || 'Anonim User', 
                photo_url: user.photo_url 
            } 
        });
    } else {
        res.status(401).json({ success: false, message: 'Telegram Web App Yetkilendirme Başarısız veya Süresi Geçmiş.' });
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
// (Bu kısım önceki kodla aynıdır ve stabil çalışır.)
io.on('connection', (socket) => {
    
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
        rooms[roomCode].messages = rooms[roomCode].messages.slice(-100); 

        io.to(roomCode).emit('message', messageData);
    });

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
