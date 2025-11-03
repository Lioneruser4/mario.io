// server.js (Render Web Service Üzerinde Çalışacak)

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors'); // Frontend (GitHub IO) farklı bir domainde olduğu için CORS gerekli
const jwt = require('jsonwebtoken'); // Kullanıcı oturumunu yönetmek için

// --- Yapılandırma ---
const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/fakecrypto';
const JWT_SECRET = process.env.JWT_SECRET || 'cok_gizli_anahtar';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN'; 
// Gerçek Telegram Bot Token'ınız

// --- Middleware ---
app.use(cors()); 
app.use(bodyParser.json());

// --- Veritabanı Bağlantısı ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB başarıyla bağlandı.'))
    .catch(err => console.error('MongoDB bağlantı hatası:', err));

// --- Veritabanı Şeması ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    username: String,
    sanalBakiye: { type: Number, default: 10000.00 } // Kalıcı bakiye
});
const User = mongoose.model('User', UserSchema);

// --- Yardımcı Fonksiyonlar ---
// Basit JWT Token oluşturucu
const generateAuthToken = (user) => {
    return jwt.sign({ id: user.telegramId, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
};

// JWT Token doğrulama middleware'i
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401); // Token yok

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Token geçerli değil
        req.user = user;
        next();
    });
};

// --- API Endpoint'leri ---

// 1. Telegram Giriş ve Kullanıcı Doğrulama
app.post('/api/login', async (req, res) => {
    const data = req.body;
    
    if (!data.id) {
        return res.status(400).json({ error: 'Telegram ID eksik.' });
    }

    const telegramId = data.id.toString();

    // GERÇEK SENARYODA BURADA TELEGRAM VERİLERİ (HASH) KESİNLİKLE DOĞRULANMALIDIR!
    // Gelişmiş güvenlik için bir Telegram Bot kütüphanesi kullanın.
    
    try {
        let user = await User.findOne({ telegramId: telegramId });

        if (!user) {
            // Yeni kullanıcı: 10000$ bakiye ile oluşturulur.
            user = new User({
                telegramId: telegramId,
                username: data.username || `User_${telegramId}`,
                sanalBakiye: 10000.00 
            });
            await user.save();
        }

        const token = generateAuthToken(user);

        res.json({ 
            success: true, 
            token: token, 
            bakiye: user.sanalBakiye,
            username: user.username
        });

    } catch (error) {
        console.error('Login/Kayıt Hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// 2. Bakiye Güncelleme (Pozisyon Kapatıldığında)
app.post('/api/update-bakiye', authenticateToken, async (req, res) => {
    const { karZarar } = req.body; 
    const userId = req.user.id; // JWT'den alınan ID

    if (typeof karZarar !== 'number') {
        return res.status(400).json({ error: 'Geçersiz K/Z miktarı.' });
    }

    try {
        const user = await User.findOne({ telegramId: userId });
        if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

        // Bakiyeyi güncelle
        user.sanalBakiye = parseFloat((user.sanalBakiye + karZarar).toFixed(2)); // Küsurat hatasını önle
        await user.save();

        res.json({ success: true, yeniBakiye: user.sanalBakiye });

    } catch (error) {
        console.error('Bakiye Güncelleme Hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// 3. Liderlik Tablosu
app.get('/api/leaderboard', async (req, res) => {
    try {
        const topUsers = await User.find({})
            .sort({ sanalBakiye: -1 }) // Azalan sırada
            .limit(10)
            .select('username sanalBakiye -_id'); // Sadece gerekli alanları seç

        const leaderboard = topUsers.map((user, index) => ({
            sira: index + 1,
            username: user.username,
            bakiye: user.sanalBakiye
        }));

        res.json({ success: true, leaderboard: leaderboard });

    } catch (error) {
        console.error('Liderlik Tablosu Hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// --- Sunucuyu Başlat ---
app.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor.`);
});
