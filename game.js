// game.js
const SERVER_URL = 'https://mario-io-1.onrender.com';
const socket = io(SERVER_URL);

// DOM Elementleri
const statusEl = document.getElementById('connection-status');
const lobbyEl = document.getElementById('lobby-view');
const gameEl = document.getElementById('game-view');
const matchMessageEl = document.getElementById('matchmaking-message');
const boardEl = document.getElementById('checkerboard');
const turnIndicatorEl = document.getElementById('turn-indicator');

let localGameState = null; // Sunucudan gelen oyun durumunu tutar
let localPlayerRole = null; // 'white' veya 'black'
let currentRoomCode = null;
let selectedPiece = null; // [r, c]

// --- SOCKET.IO İSTEMCİ OLAYLARI ---

socket.on('connect', () => {
    statusEl.textContent = '✅ Sunucuya Bağlandı.';
    statusEl.style.color = 'lightgreen';
});

socket.on('disconnect', () => {
    statusEl.textContent = '❌ Sunucu Bağlantısı Kesildi!';
    statusEl.style.color = 'red';
});

// Sunucu Bilgilendirmesi
socket.on('serverMessage', (message) => {
    console.log("Sunucu Bildirimi:", message);
    // İstenirse burada bir "toast" bildirim gösterilebilir
});

// 1. Eşleşme Bulundu (Dereceli Oyna)
socket.on('matchFound', (roomCode) => {
    currentRoomCode = roomCode;
    matchMessageEl.textContent = `🔥 Eşleşme Bulundu! Odaya Giriliyor: ${roomCode}`;
});

// 2. Oda Kuruldu (Arkadaşla Oyna)
socket.on('roomCreated', (roomCode) => {
    currentRoomCode = roomCode;
    matchMessageEl.textContent = `🎉 Oda Kuruldu! Kod: ${roomCode}. Linki kopyala ve arkadaşınla paylaş!`;
    // İstenen kopyalama butonu işlevi buraya eklenebilir.
});

// 3. Odaya Girildi (Başlangıç veya Arkadaş katıldı)
socket.on('roomJoined', (roomCode) => {
    // Lobiyi gizle, oyunu göster
    lobbyEl.style.display = 'none';
    gameEl.style.display = 'block';
});

// OYUN DURUMU GÜNCELLEMESİ
socket.on('gameStateUpdate', (gameState) => {
    localGameState = gameState;
    // Yerel oyuncu rolünü belirle
    if (gameState.players.white === socket.id) {
        localPlayerRole = 'white';
    } else if (gameState.players.black === socket.id) {
        localPlayerRole = 'black';
    }

    // Tahtayı ve göstergeleri yeniden çiz
    renderBoard();
    updateTurnIndicator();
});

// Rakip Bağlantı Kesilmesi
socket.on('opponentDisconnected', (message) => {
    alert(message);
    // Lobiyi göster, oyunu sıfırla
    lobbyEl.style.display = 'block';
    gameEl.style.display = 'none';
});

// --- LOBİ BUTON İŞLEMLERİ ---

document.getElementById('btn-find-match').addEventListener('click', () => {
    if (document.getElementById('btn-find-match').textContent.includes('İptal')) {
        // Eşleşme aramasını iptal etme mantığı (Sunucuya emit et)
        matchMessageEl.textContent = '';
        document.getElementById('btn-find-match').textContent = '🥇 Dereceli Oyna';
    } else {
        matchMessageEl.textContent = '⏳ Dereceli Eşleşme Aranıyor...';
        document.getElementById('btn-find-match').textContent = 'İptal';
        socket.emit('findMatch');
    }
});

document.getElementById('btn-create-room').addEventListener('click', () => {
    socket.emit('createRoom');
});

document.getElementById('btn-join-room').addEventListener('click', () => {
    const roomCode = document.getElementById('room-code-input').value.trim();
    if (roomCode.length === 4) {
        socket.emit('joinRoom', { roomCode });
    } else {
        alert('Lütfen 4 haneli oda kodu girin.');
    }
});

// --- OYUN GÖRSELLEŞTİRME VE ETKİLEŞİM ---

/**
 * Oyun sırasını belirten göstergeyi günceller.
 */
function updateTurnIndicator() {
    if (!localGameState) return;

    const isMyTurn = localGameState.playerTurn === localPlayerRole;
    
    // İstenen ışıklı/animasyonlu sıra gösterimi. (CSS ile renklendirme)
    turnIndicatorEl.textContent = isMyTurn ? 
        "⭐ SIRA SENDE! Hamleni Yap." : 
        `Rakibin Sırası (${localGameState.playerTurn.toUpperCase()})`;
    
    turnIndicatorEl.className = isMyTurn ? 'turn-active' : 'turn-inactive';
}


/**
 * Tahtayı ve taşları güncel oyun durumuna göre çizer.
 */
function renderBoard() {
    boardEl.innerHTML = ''; // Tahtayı temizle
    if (!localGameState) return;

    // Dama tahtasını oluştur (8x8 grid)
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = r;
            cell.dataset.col = c;
            
            // Satır/Sütun tek/çiftliğine göre tahta rengi
            cell.classList.add((r + c) % 2 === 0 ? 'cell-light' : 'cell-dark');
            
            // Taşa tıklandığında (veya boş kareye)
            cell.addEventListener('click', () => handleCellClick(r, c));

            // Taş varsa, taşı yerleştir
            const pieceValue = localGameState.board[r][c];
            if (pieceValue !== 0) {
                const piece = document.createElement('div');
                piece.className = 'piece';
                // Taş tipine göre sınıf ekle (beyaz/siyah/dam)
                piece.classList.add(getPieceClass(pieceValue));
                cell.appendChild(piece);
            }
            
            // Hamle gösterimi: Tıklanan taşın nereye gidebileceğini renkle gösterir (İstenen özellik)
            if (selectedPiece) {
                // Sunucudan veya gameLogic.js'den gelen geçerli hamleleri kontrol edin
                // Şimdilik sadece örnek görselleştirme:
                // if (isPossibleMove(r, c)) { cell.classList.add('highlight-move'); }
            }

            boardEl.appendChild(cell);
        }
    }
}

/**
 * Taşa veya boş kareye tıklandığında çalışır.
 */
function handleCellClick(r, c) {
    if (!localGameState || localGameState.playerTurn !== localPlayerRole) return; // Sıra bende değil

    const clickedPieceValue = localGameState.board[r][c];

    // 1. TAŞ SEÇİMİ
    if (isMyPiece(clickedPieceValue, localPlayerRole)) {
        selectedPiece = [r, c];
        // Seçilen taşa vurgu ekle (CSS ile)
        // Olası hamleleri hesapla ve tahtada renkle göster (renderBoard'da kullanılacak)
        renderBoard(); 
        return;
    }

    // 2. HAMLE YAPMA
    if (selectedPiece) {
        // Seçili taş varsa ve tıklanan kare boşsa, hamle yapma girişimi
        const move = { from: selectedPiece, to: [r, c] };
        
        // Hamleyi sunucuya gönder
        socket.emit('makeMove', { roomCode: currentRoomCode, move });
        
        // Hamle gönderildikten sonra seçimi sıfırla
        selectedPiece = null;
    }
}

// Yardımcı Fonksiyon
function isMyPiece(pieceValue, role) {
    // Sadece rolüme ait taşları seçebilirim
    if (role === 'white') return pieceValue === 1 || pieceValue === 3;
    if (role === 'black') return pieceValue === 2 || pieceValue === 4;
    return false;
}

function getPieceClass(value) {
    switch (value) {
        case 1: return 'piece-white';
        case 2: return 'piece-black';
        case 3: return 'piece-white king';
        case 4: return 'piece-black king';
        default: return '';
    }
}

// Sayfa yüklendiğinde tahtayı bir kez çiz
renderBoard();
