// server.js - Tam Lobi ve Eşleştirme Sistemi
const express = require('express');
const app = express();
const port = 3000;
const { v4: uuidv4 } = require('uuid'); // Rastgele ID üretmek için

// --- KURULUMLAR ---
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
});
app.use(express.json());

// --- VERİ YAPILARI ---
let activeLobbies = {}; 
let matchmakingQueue = []; // Tüm bekleyen oyuncular
let playerCounter = 1;

// --- YARDIMCI FONKSİYONLAR ---

function generatePlayerId() {
    // Daha profesyonel bir kimliklendirme simülasyonu (UUID)
    return `Player-${playerCounter++}-${uuidv4().substring(0, 4)}`;
}

function findLobbyByPlayerId(playerId) {
    for (const id in activeLobbies) {
        if (activeLobbies[id].members.includes(playerId)) {
            return activeLobbies[id];
        }
    }
    return null;
}

// ---------------------------------------------
// API UÇ NOKTALARI (ROUTES)
// ---------------------------------------------

// 1. Oyuncu ID'si Atama (Lobi sisteminde ilk giriş)
app.get('/initPlayer', (req, res) => {
    const newId = generatePlayerId();
    console.log(`🆕 Yeni oyuncu başlatıldı: ${newId}`);
    res.status(200).send({ playerId: newId });
});

// 2. Lobi Oluşturma
app.post('/createLobby', (req, res) => {
    const leaderId = req.body.leaderId;
    const lobbyType = req.body.type; // 'ranked' veya 'casual'

    if (findLobbyByPlayerId(leaderId)) {
        return res.status(400).send({ success: false, message: 'Zaten bir lobidesiniz.' });
    }
    if (!['ranked', 'casual'].includes(lobbyType)) {
        return res.status(400).send({ success: false, message: 'Geçersiz lobi tipi.' });
    }

    const lobbyId = `LBY-${Math.floor(Math.random() * 9000) + 1000}`; // 4 haneli rastgele ID
    activeLobbies[lobbyId] = {
        id: lobbyId,
        leader: leaderId,
        members: [leaderId],
        isInQueue: false,
        type: lobbyType // Lobi tipi eklendi
    };

    console.log(`🎉 Lobi ${lobbyId} oluşturuldu. Tip: ${lobbyType}`);
    res.status(200).send({ 
        success: true, 
        lobby: activeLobbies[lobbyId] 
    });
});

// 3. Lobiye Katılma
app.post('/joinLobby', (req, res) => {
    const { lobbyId, playerId } = req.body;
    const lobby = activeLobbies[lobbyId];

    if (!lobby) {
        return res.status(404).send({ success: false, message: 'Lobi bulunamadı.' });
    }
    if (findLobbyByPlayerId(playerId)) {
        return res.status(400).send({ success: false, message: 'Zaten bir lobidesiniz.' });
    }
    if (lobby.members.length >= 4) { // Max 4 kişilik lobi simülasyonu
        return res.status(400).send({ success: false, message: 'Lobi dolu.' });
    }

    lobby.members.push(playerId);
    console.log(`➡️ Oyuncu ${playerId}, Lobi ${lobbyId}'e katıldı.`);
    
    res.status(200).send({ success: true, lobby: lobby });
});

// 4. Lobiden Ayrılma
app.post('/leaveLobby', (req, res) => {
    const playerId = req.body.playerId;
    const lobby = findLobbyByPlayerId(playerId);

    if (!lobby) {
        return res.status(404).send({ success: false, message: 'Herhangi bir lobide değilsiniz.' });
    }

    lobby.members = lobby.members.filter(id => id !== playerId);
    
    // Eğer oyuncu lobi lideriyse
    if (lobby.leader === playerId) {
        if (lobby.members.length > 0) {
            lobby.leader = lobby.members[0]; // Yeni lider ata
        } else {
            delete activeLobbies[lobby.id]; // Lobi boşaldı, kapat
            console.log(`Lobi ${lobby.id} kapandı.`);
        }
    }
    
    res.status(200).send({ success: true, lobby: lobby.members.length > 0 ? lobby : null });
});

// 5. Eşleştirme Başlatma
app.post('/joinQueue', (req, res) => {
    const leaderId = req.body.leaderId;
    const lobby = findLobbyByPlayerId(leaderId);

    if (!lobby || lobby.leader !== leaderId || lobby.isInQueue) {
        return res.status(403).send({ success: false, message: 'İzin yok veya zaten kuyrukta.' });
    }
    
    lobby.isInQueue = true;
    
    // Tüm lobi üyelerini kuyruğa ekle
    lobby.members.forEach(memberId => {
        matchmakingQueue.push({ id: memberId, joinTime: Date.now(), lobbyId: lobby.id, type: lobby.type });
    });
    
    console.log(`🚀 Lobi ${lobby.id} kuyruğa katıldı. Tip: ${lobby.type}`);
    // Burada eşleştirme algoritması çalışır...
    
    res.status(200).send({ success: true, message: 'Eşleştirme başladı.' });
});

// 6. Eşleştirmeyi İptal Etme
app.post('/cancelQueue', (req, res) => {
    const leaderId = req.body.leaderId;
    const lobby = findLobbyByPlayerId(leaderId);
    
    if (!lobby || lobby.leader !== leaderId || !lobby.isInQueue) {
         return res.status(403).send({ success: false, message: 'İzin yok veya kuyrukta değilsiniz.' });
    }

    // Lobi üyelerini kuyruktan filtrele
    matchmakingQueue = matchmakingQueue.filter(p => p.lobbyId !== lobby.id);
    lobby.isInQueue = false;

    console.log(`🛑 Lobi ${lobby.id} kuyruktan ayrıldı.`);
    return res.status(200).send({ success: true, message: 'Eşleştirme iptal edildi.' });
});


// Sunucuyu başlat
app.listen(port, () => {
    console.log(`✅ Eşleştirme sunucusu http://localhost:${port} adresinde çalışıyor.`);
});
