// server.js

import express from 'express';

// Express uygulamasını oluşturuyoruz
const app = express();

// Middleware'leri tanımlıyoruz
// Gelen JSON istek gövdelerini ayrıştırmak için
app.use(express.json());

// Basit bir kök (/) rota tanımlıyoruz
app.get('/', (req, res) => {
    // Sunucuya bir GET isteği geldiğinde bu yanıtı gönderir
    res.send('Merhaba Dünya! Express sunucu çalışıyor ve yanıt veriyor.');
});

// İhtiyaç duyacağınız diğer rotaları (API endpointleri) buraya ekleyeceksiniz.

// Hazırlanan uygulamayı dışa aktarıyoruz
export default app;
