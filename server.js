// server.js (Node.js/Express & Socket.io - TAM VE GÜNCELLENMİŞ KOD)

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// CORS ayarı: Tüm istemcilerin (GitHub Pages vb.) bağlanmasına izin verir
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// --- Veri Yapıları ---
const rooms = {}; 
let waitingPlayer = null; 

// --- Dama Kural Motoru Fonksiyonları ---

function initializeBoard() {
    let initial = {};
    // R (Red) üstte (0-2. satırlar)
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 !== 0) initial[`${r}${c}`] = 'R'; 
        }
    }
    // B (Black) altta (5-7. satırlar)
    for (let r = 5; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 !== 0) initial[`${r}${c}`] = 'B'; 
        }
    }
    return initial;
}

function generateRoomCode() {
    let code;
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms[code]);
    return code;
}

/**
 * Belirtilen konumdaki taş için olası yeme (jump) hamlelerini bulur.
 */
function findJumps(r, c, isRed, isKing, board, opponentPieces) {
    const jumps = [];
    // Normal yöne ve eğer King ise ters yöne bak
    const checkDirections = [isRed ? 1 : -1];
    if (isKing) checkDirections.push(isRed ? -1 : 1);
    
    for (const dir of checkDirections) {
        for (const colDir of [-1, 1]) { // Sol ve Sağ
            const jumpedR = r + dir;
            const jumpedC = c + colDir;
            const targetR = r + 2 * dir;
            const targetC = c + 2 * colDir;
            
            // Sınır kontrolü
            if (targetR >= 0 && targetR < 8 && targetC >= 0 && targetC < 8) {
                const jumpedPiece = board[`${jumpedR}${jumpedC}`];
                const targetSquare = board[`${targetR}${targetC}`];
                
                // Rakip taşın üzerinden atlama ve hedef karenin boş olması
                if (jumpedPiece && opponentPieces.includes(jumpedPiece) && !targetSquare) {
                    jumps.push({ 
                        from: `${r}${c}`, 
                        to: `${targetR}${targetC}`, 
                        jumped: `${jumpedR}${jumpedC}` 
                    });
                }
            }
        }
    }
    return jumps;
}

/**
 * Oyuncu için tahtadaki tüm olası yeme hamlelerini bulur (Zorunluluk kontrolü için).
 */
function findAllPossibleJumps(board, playerColor) {
    let allJumps = [];
    const playerPieces = playerColor === 'Red' ? ['R', 'RK'] : ['B', 'BK'];
    
    for (const squareId in board) {
        const piece = board[squareId];
        if (playerPieces.includes(piece)) {
            const r = parseInt(squareId[0]);
            const c = parseInt(squareId[1]);
            const isRed = piece.includes('R');
            const isKing = piece.includes('K');
            const opponentPieces = isRed ? ['B', 'BK'] : ['R', 'RK'];
            
            const jumps = findJumps(r, c, isRed, isKing, board, opponentPieces);
            allJumps.push(...jumps);
        }
    }
    return allJumps;
}

/**
 * Hamle kurallarını kontrol eder, tahtayı günceller ve zincirleme yeme durumunu döndürür.
 */
function checkDamaRules(board, from, to, playerColor) {
    const r1 = parseInt(from[0]), c1 = parseInt(from[1]);
    const r2 = parseInt(to[0]), c2 = parseInt(to[1]);
    const piece = board[from];
    
    if (!piece || !board[`${r1}${c1}`]) return false;

    const isKing = piece.includes('K');
    const isRed = piece.includes('R');
    const opponentPieces = isRed ? ['B', 'BK'] : ['R', 'RK'];
    const direction = isRed ? 1 : -1;
    
    // Tüm olası yeme hamlelerini kontrol et
    const allPossibleJumps = findAllPossibleJumps(board, playerColor);
    const mustJump = allPossibleJumps.length > 0;
    const isJump = Math.abs(r1 - r2) === 2; // Çapraz iki kare hareket yeme demektir
    
    // ZORUNLULUK KONTROLÜ: Yeme zorunluluğu varsa, normal hamle yapılamaz
    if (mustJump && !isJump) return false;
    
    // Seçilen hamle, zorunlu yeme hamlelerinden biri mi?
    if (mustJump && isJump) {
        const isValidMandatoryJump = allPossibleJumps.some(jump => jump.from === from && jump.to === to);
        if (!isValidMandatoryJump) return false;
    }


    // --- YEME HAMLESİ (Jump) ---
    if (isJump) {
        if (Math.abs(c1 - c2) !== 2) return false;

        const jumpedR = (r1 + r2) / 2;
        const jumpedC = (c1 + c2) / 2;
        const jumpedPiece = board[`${jumpedR}${jumpedC}`];
        
        // Yenilecek taşın rakibe ait ve boşluğa atlanıyor olması gerekir
        if (!jumpedPiece || !opponentPieces.includes(jumpedPiece) || board[to]) return false; 
        
        // King olmayan taşlar geriye yiyemez (Amerikan Daması kuralı)
        if (!isKing && (r2 - r1) * direction < 0) return false; 

        // Tahtayı güncelle (Taşları sil ve taşı yeni yere koy)
        const newBoard = { ...board };
        delete newBoard[from];
        delete newBoard[`${jumpedR}${jumpedC}`]; 
        
        let newPiece = piece;
        // King olma kontrolü
        if ((isRed && r2 === 7) || (!isRed && r2 === 0)) newPiece = isRed ? 'RK' : 'BK';
        newBoard[to] = newPiece;
        
        // Daha fazla yeme var mı kontrolü (Zincirleme)
        const moreJumps = findJumps(r2, c2, newPiece.includes('R'), newPiece.includes('K'), newBoard, opponentPieces);
        
        return { newBoard: newBoard, continousJump: isJump && moreJumps.length > 0 };
    } 
    
    // --- NORMAL HAMLE (Move) ---
    if (!mustJump) {
        if (Math.abs(r1 - r2) !== 1 || Math.abs(c1 - c2) !== 1) return false; // Çapraz bir kare hareket
        if (board[to]) return false; // Hedef kare boş olmalı
        
        // King olmayan taşlar geriye gidemez
        if (!isKing && (r2 - r1) * direction < 0) return false; 

        const newBoard = { ...board };
        delete newBoard[from];
        let newPiece = piece;

        // King olma kontrolü
        if ((isRed && r2 === 7) || (!isRed && r2 === 0)) newPiece = isRed ? 'RK' : 'BK';
        newBoard[to] = newPiece;
        
        return { newBoard: newBoard, continousJump: false };
    }
    
    return false;
}

// --- Socket.io Bağlantıları ---

io.on('connection', (socket) => {
    console.log(`[👤 BAĞLANDI] Yeni oyuncu: ${socket.id}`);
    socket.emit('connectionSuccess', { message: '✅ Sunucuya Bağlantı Başarılı!', socketId: socket.id });

    // --- LOBİ MANTIĞI ---

    socket.on('eslesmeBaslat', () => {
        if (waitingPlayer && waitingPlayer !== socket.id) {
            const roomCode = generateRoomCode();
            rooms[roomCode] = { player1: waitingPlayer, player2: socket.id, turn: waitingPlayer, board: initializeBoard() };
            
            io.sockets.sockets.get(waitingPlayer).join(roomCode);
            socket.join(roomCode);

            io.to(waitingPlayer).emit('eslesmeBulundu', { room: roomCode, opponentId: socket.id, color: 'Red' });
            io.to(socket.id).emit('eslesmeBulundu', { room: roomCode, opponentId: waitingPlayer, color: 'Black' });
            waitingPlayer = null; 
        } else if (waitingPlayer !== socket.id) {
            waitingPlayer = socket.id;
            socket.emit('eslesmeBekle', { text: 'Eşleşme aranıyor...' });
        }
    });

    socket.on('eslesmeIptal', () => {
        if (waitingPlayer === socket.id) {
            waitingPlayer = null;
            socket.emit('eslesmeIptalBasarili');
        }
    });

    socket.on('odaKur', () => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = { player1: socket.id, player2: null, turn: socket.id, board: initializeBoard() };
        socket.join(roomCode);
        socket.emit('odaOlusturuldu', { code: roomCode, message: `Oda kuruldu: ${roomCode}.` });
    });

    socket.on('odayaBaglan', ({ code }) => {
        const room = rooms[code];
        if (room && !room.player2) {
            socket.join(code);
            room.player2 = socket.id;
            
            socket.emit('oyunBaslat', { room: code, color: 'Black', opponentId: room.player1 });
            io.to(room.player1).emit('oyunBaslat', { room: code, color: 'Red', opponentId: socket.id });
        } else {
            socket.emit('hata', { message: 'Geçersiz veya dolu oda kodu.' });
        }
    });

    // --- OYUN MANTIĞI ---
    socket.on('hareketYap', (data) => {
        const { roomCode, from, to } = data;
        const room = rooms[roomCode];

        if (!room) return socket.emit('hata', { message: 'Oda bulunamadı.' });
        if (room.turn !== socket.id) return socket.emit('hata', { message: 'Sıra sizde değil.' });

        const playerColor = room.player1 === socket.id ? 'Red' : 'Black';
        const moveResult = checkDamaRules(room.board, from, to, playerColor);

        if (moveResult) {
            room.board = moveResult.newBoard; 

            if (moveResult.continousJump) {
                // Zincirleme yeme varsa, sıra değişmez!
                io.to(roomCode).emit('oyunDurumuGuncelle', { 
                    newBoard: room.board,
                    lastMove: { from, to },
                    turn: room.turn, 
                    message: 'Zorunlu Zincirleme Yeme! Sıra sizde.'
                });
                
            } else {
                // Normal hamle veya son yeme. Sırayı değiştir.
                room.turn = room.player1 === socket.id ? room.player2 : room.player1;
                
                io.to(roomCode).emit('oyunDurumuGuncelle', { 
                    newBoard: room.board,
                    lastMove: { from, to },
                    turn: room.turn 
                });
            }
        } else {
            socket.emit('hata', { message: 'Geçersiz Dama Hamlesi! (Yeme zorunluluğu, çapraz hareket vb.)' });
        }
    });
    
    socket.on('oyunTerket', (data) => {
        const { roomCode } = data;
        const room = rooms[roomCode];
        if (room) {
            const opponentId = room.player1 === socket.id ? room.player2 : room.player1;
            
            if (opponentId) {
                // Rakibe bildir
                io.to(opponentId).emit('rakipTerketti', { message: 'Rakip oyunu terk etti. Kazandınız!' });
            }
            
            // Odayı temizle
            delete rooms[roomCode];
        }
    });

    socket.on('disconnect', () => {
        if (waitingPlayer === socket.id) waitingPlayer = null;
        
        // Oyuncunun bulunduğu odaları kontrol et ve rakibine bildir
        for (const code in rooms) {
            const room = rooms[code];
            if (room.player1 === socket.id || room.player2 === socket.id) {
                const opponentId = room.player1 === socket.id ? room.player2 : room.player1;
                
                if (opponentId && io.sockets.sockets.get(opponentId)) {
                    io.to(opponentId).emit('rakipTerketti', { message: 'Rakip bağlantıyı kesti. Kazandınız!' });
                }
                delete rooms[code];
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
