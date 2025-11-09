const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// ✅ KESİNLEŞMİŞ FRONTEND URL'İNİZ
const FRONTEND_ORIGIN = "https://lioneruser4.github.io"; 

const io = socketio(server, { 
    cors: { 
        origin: FRONTEND_ORIGIN,
        methods: ["GET", "POST"] 
    } 
});

const PORT = process.env.PORT || 10000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// --- IN-MEMORY VERİ YAPISI ---
// isOnline: Kullanıcının sitede görünüp görünmeme tercihi.
let users = {};         // { telegramId: { id, firstName, photoUrl, bio, likes: [], matches: [], isOnline: false, socketId: null } }
let swipeHistory = {};  // { swiperId: { liked: [targetId], passed: [targetId] } } 
// ----------------------------

app.use(express.json());
app.use(require('cors')({
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST"]
}));

// --- Telegram Web App Yetkilendirme Doğrulama Fonksiyonu ---
// (Önceki kodunuzdan kopyalanan, Telegram güvenliği için kritik parça)
function checkTelegramWebAppAuth(initData) {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) return null;

    const dataCheckString = Array.from(params.entries())
        .filter(([key]) => key !== 'hash')
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    // Bot Token ile Kök Anahtarı oluşturma
    const secret_key = crypto.createHmac('sha256', 'WebAppData').update(TELEGRAM_BOT_TOKEN).digest();
    // Veri Doğrulama
    const calculatedHash = crypto.createHmac('sha256', secret_key).update(dataCheckString).digest('hex');

    if (calculatedHash === hash) {
        const userData = params.get('user');
        if (userData) {
            try {
                const user = JSON.parse(userData);
                const isTimestampValid = (Date.now() / 1000) - params.get('auth_date') < 86400; // 24 saat
                if (isTimestampValid) return user;
            } catch (e) {
                console.error("Kullanıcı verisi JSON parse hatası:", e);
                return null;
            }
        }
    }
    return null;
}

// --- Telegram Bot API Bildirim Fonksiyonu ---
async function sendMatchNotification(telegramId, matchedUser) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const message = `🎉 TEBRİKLER! **${matchedUser.firstName}** seni beğendi ve **eşleştiniz!** Artık Telegram'da doğrudan mesajlaşabilirsiniz: [https://t.me/${matchedUser.username || 'user' + matchedUser.id}]`;
    
    try {
        await axios.post(url, {
            chat_id: telegramId, 
            text: message,
            parse_mode: 'Markdown'
        });
        console.log(`Bildirim ${telegramId} kullanıcısına gönderildi.`);
    } catch (error) {
        console.error('Telegram Bildirim Gönderme Hatası:', error.response ? error.response.data : error.message);
    }
}


// --- API Endpoints ---

// 1. GİRİŞ & OTOMATİK HESAP OLUŞTURMA
app.post('/api/auth', (req, res) => {
    const { initData } = req.body;
    const authUser = checkTelegramWebAppAuth(initData);
    
    if (authUser) {
        let user = users[authUser.id];

        if (!user) {
            // Yeni Kullanıcı
            user = {
                id: authUser.id,
                telegramId: authUser.id,
                firstName: authUser.first_name || 'Anonim User',
                photoUrl: authUser.photo_url || 'https://via.placeholder.com/45/007bff/ffffff?text=U',
                bio: 'Hey! I am using the Telegram Match App.',
                username: authUser.username, // Telegram kullanıcı adı
                likes: [],
                matches: [],
                isOnline: true, // Varsayılan olarak online başlat
                socketId: null
            };
            users[authUser.id] = user;
            swipeHistory[authUser.id] = { liked: [], passed: [] };
        }
        
        // Kullanıcının güncel durumunu döndür
        res.json({ success: true, user: users[authUser.id] });
    } else {
        res.status(401).json({ success: false, message: 'Yetkilendirme Başarısız.' });
    }
});

// 2. PROFİL LİSTESİNİ ALMA
app.get('/api/profiles/:swiperId', (req, res) => {
    const { swiperId } = req.params;
    const swiperHistory = swipeHistory[swiperId];
    
    if (!users[swiperId] || !swiperHistory) {
        return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    const alreadyProcessed = new Set([swiperId, ...swiperHistory.liked, ...swiperHistory.passed]);

    // Filtreleme: Yalnızca ONLINE olan ve daha önce işlenmemiş profilleri göster
    const availableProfiles = Object.values(users)
        .filter(user => user.isOnline) 
        .filter(user => !alreadyProcessed.has(user.id))
        .map(user => ({
            id: user.id,
            firstName: user.firstName,
            photoUrl: user.photoUrl,
            bio: user.bio,
            username: user.username
        }));
    
    // Rastgele 10 profil gönder
    const profilesToSend = availableProfiles.sort(() => 0.5 - Math.random()).slice(0, 10);

    res.json(profilesToSend);
});

// 3. BEĞENİ GÖNDERME (YALNIZCA 'LIKE' VEYA 'PASS')
app.post('/api/swipe/:swiperId/:targetId', async (req, res) => {
    const { swiperId, targetId } = req.params;
    const { action } = req.body; // 'like' veya 'pass'

    const swiper = users[swiperId];
    const target = users[targetId];

    if (!swiper || !target) return res.status(404).json({ message: 'Kullanıcılar bulunamadı.' });
    
    if (action === 'like') {
        // 1. Beğeniyi kaydet
        if (!swipeHistory[swiperId].liked.includes(targetId)) {
            swipeHistory[swiperId].liked.push(targetId);
        }

        // 2. Eşleşme Kontrolü: Target, Swiper'ı daha önce beğenmiş mi?
        if (swipeHistory[targetId] && swipeHistory[targetId].liked.includes(swiperId)) {
            // EŞLEŞME VAR!
            if (!swiper.matches.includes(targetId)) {
                 swiper.matches.push(targetId);
            }
            if (!target.matches.includes(swiperId)) {
                 target.matches.push(swiperId);
            }
            
            // 3. Telegram Bildirimi GÖNDER!
            await sendMatchNotification(swiper.id, target); 
            await sendMatchNotification(target.id, swiper);

            return res.json({ status: 'match', message: 'Eşleşme!', target: target.firstName });
        }
        
        return res.json({ status: 'like', message: 'Beğenildi.' });
        
    } else if (action === 'pass') {
        // Geçişi kaydet
        if (!swipeHistory[swiperId].passed.includes(targetId)) {
            swipeHistory[swiperId].passed.push(targetId);
        }
        return res.json({ status: 'pass', message: 'Geçildi.' });
    }

    res.status(400).json({ message: 'Geçersiz aksiyon.' });
});


// --- SOCKET.IO Mantığı (Online/Offline) ---

io.on('connection', (socket) => {
    
    // İstemci, Telegram ID'si ile bağlantı kurduğunu bildirir.
    socket.on('setUserId', (telegramId) => {
        if (users[telegramId]) {
            users[telegramId].socketId = socket.id;
            socket.telegramId = telegramId; // Sokete kimliği kaydet
            
            // Yeni bağlantıda varsayılan durumu ON olarak ayarla (Frontend de bunu tetikleyecek)
            users[telegramId].isOnline = true; 
            console.log(`${users[telegramId].firstName} bağlandı. Varsayılan ONLINE.`);
        }
    });
    
    // Kullanıcı online durumunu elle açar
    socket.on('setOnline', () => {
        const telegramId = socket.telegramId;
        if (telegramId && users[telegramId]) {
            users[telegramId].isOnline = true;
            console.log(`${users[telegramId].firstName} elle ONLINE oldu.`);
        }
    });

    // Kullanıcı offline durumunu elle kapar (Gizlenir)
    socket.on('setOffline', () => {
        const telegramId = socket.telegramId;
        if (telegramId && users[telegramId]) {
            users[telegramId].isOnline = false;
            console.log(`${users[telegramId].firstName} elle OFFLINE oldu.`);
        }
    });

    // Tarayıcı/Sayfa kapandığında/Socket bağlantısı kesildiğinde otomatik offline yap
    socket.on('disconnect', () => {
        const telegramId = socket.telegramId;
        if (telegramId && users[telegramId]) {
            users[telegramId].isOnline = false;
            users[telegramId].socketId = null;
            console.log(`${users[telegramId].firstName} bağlantısı kesildi ve OFFLINE oldu.`);
        }
    });
});


server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor. (Tinder Prototipi)`));
