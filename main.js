// main.js
// SERVER URL'NİZİ BURAYA YAZIN
const SERVER_URL = "https://mario-io-1.onrender.com"; 
const socket = io(SERVER_URL);

// --- DOM ELEMANLARI ---
const $ = (id) => document.getElementById(id);

const lobbyScreen = $('lobby-screen');
const gameScreen = $('game-screen');
const connStatus = $('connection-status');
const notificationArea = $('notification-area');
const rankedBtn = $('ranked-btn');
const cancelMatchBtn = $('cancel-match-btn');
const friendBtn = $('friend-btn');
const joinBtn = $('join-btn');
const roomCodeInput = $('room-code-input');
const boardContainer = $('board-container');
const turnIndicator = $('turn-indicator');
const currentPlayerColorSpan = $('current-player-color');
const displayRoomCode = $('display-room-code');
const myColorDisplay = $('my-color-display');

// --- OYUN DURUMU ---
let currentRoom = null;
let myColor = null; // 'Red' veya 'Black'
let isMyTurn = false;
let selectedPiece = null; // Tıklanan taşın ID'si

// --- FONKSİYONLAR ---

// Ekran değiştirme fonksiyonu
function switchScreen(activeScreen) {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    activeScreen.classList.remove('hidden');
    activeScreen.classList.add('active');
}

// Bildirim gösterme (Lobi için)
function showNotification(message, type = 'info') {
    notificationArea.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    // Basit bir süre sonra temizleme mekanizması
    setTimeout(() => notificationArea.innerHTML = '', 5000);
}

// Dama Tahtasını Oluşturma (8x8)
function createBoard() {
    boardContainer.innerHTML = '<div id="board"></div>';
    const board = $('board');
    for (let i = 0; i < 64; i++) {
        const row = Math.floor(i / 8);
        const col = i % 8;
        const square = document.createElement('div');
        square.classList.add('square');
        // Tahta rengi
        square.classList.add((row + col) % 2 === 0 ? 'light' : 'dark');
        square.dataset.id = `${row}${col}`; // Tahta koordinatı (Örn: '00', '77')
        square.addEventListener('click', handleBoardClick);

        // Başlangıç taşları (Şaşki dama kuralına göre ilk 3 sıra)
        if (row < 3 && (row + col) % 2 !== 0) {
            const piece = document.createElement('div');
            piece.classList.add('piece', 'piece-red');
            // piece.textContent = 'R'; // İsteğe bağlı
            square.appendChild(piece);
        } else if (row > 4 && (row + col) % 2 !== 0) {
            const piece = document.createElement('div');
            piece.classList.add('piece', 'piece-black');
            // piece.textContent = 'B'; // İsteğe bağlı
            square.appendChild(piece);
        }

        board.appendChild(square);
    }
}

// Tahta Tıklama İşleyicisi
function handleBoardClick(event) {
    const square = event.currentTarget;
    const piece = square.querySelector('.piece');
    const squareId = square.dataset.id;
    
    if (!currentRoom || !isMyTurn) {
        showNotification('Sıra sizde değil!', 'warning');
        return;
    }

    // 1. TAŞ SEÇİMİ
    if (piece && (myColor === 'Red' && piece.classList.contains('piece-red')) || 
                 (myColor === 'Black' && piece.classList.contains('piece-black'))) {
        
        // Önceki vurgulamaları temizle
        clearHighlights();
        document.querySelectorAll('.selected-piece').forEach(p => p.classList.remove('selected-piece'));

        piece.classList.add('selected-piece');
        selectedPiece = squareId;
        
        // **PROFESYONEL: Burada tahta motoru çalışmalı ve geçerli hamleleri hesaplamalı**
        // Örneğin: const validMoves = calculateValidMoves(squareId);
        // Bu hamleleri renkle vurgulamak için:
        // highlightMoves(validMoves); 
        
        // Şimdilik sadece bir örnek hedef vurgulayalım (Gerçek kural değil)
        if (squareId === '50') $('41').classList.add('highlight-move');
        
    } 
    // 2. HAMLE YAPMA
    else if (selectedPiece && square.classList.contains('highlight-move')) {
        const from = selectedPiece;
        const to = squareId;

        // Hamleyi sunucuya gönder
        socket.emit('hareketYap', { roomCode: currentRoom, from, to });
        
        // Hamle yapıldıktan sonra yerel durumları temizle
        clearHighlights();
        document.querySelectorAll('.selected-piece').forEach(p => p.classList.remove('selected-piece'));
        selectedPiece = null;
        
    }
}

// Vurgulamaları Temizle
function clearHighlights() {
    document.querySelectorAll('.highlight-move').forEach(s => s.classList.remove('highlight-move'));
}

// Sıra göstergesini güncelleme
function updateTurnIndicator(isTurn) {
    isMyTurn = isTurn;
    const color = isMyTurn ? myColor : (myColor === 'Red' ? 'Black' : 'Red');
    
    currentPlayerColorSpan.textContent = color;
    turnIndicator.classList.remove('turn-red', 'turn-black');
    turnIndicator.classList.add(color === 'Red' ? 'turn-red' : 'turn-black');
    showNotification(isMyTurn ? 'SIRA SİZDE! Hamlenizi yapın.' : 'Rakibinizin hamlesini bekleyin.', isMyTurn ? 'success' : 'info');
}


// --- SOCKET.IO OLAY DİNLEYİCİLERİ ---

// BAĞLANTI: Sunucuya başarılı bağlandığında
socket.on('connectionSuccess', (data) => {
    connStatus.textContent = data.message;
    connStatus.classList.remove('waiting');
    connStatus.classList.add('success');
    showNotification(data.message);
});

// BAĞLANTI HATASI
socket.on('connect_error', (err) => {
    connStatus.textContent = '❌ Bağlantı Hatası: Sunucu Kapalı veya Erişilemiyor.';
    connStatus.classList.remove('success');
    connStatus.classList.add('waiting');
    console.error('Bağlantı Hatası:', err);
});

// DERECE: Eşleşme Aranıyor
socket.on('eslesmeBekle', (data) => {
    showNotification(data.text, 'info');
    rankedBtn.classList.add('hidden');
    cancelMatchBtn.classList.remove('hidden');
});

// DERECE: Eşleşme Bulundu / OYUN BAŞLAT
socket.on('eslesmeBulundu', (data) => startGame(data));
socket.on('oyunBaslat', (data) => startGame(data));

function startGame(data) {
    currentRoom = data.room;
    myColor = data.color;
    
    // UI Güncelleme
    switchScreen(gameScreen);
    createBoard();
    displayRoomCode.textContent = currentRoom;
    myColorDisplay.textContent = myColor;
    
    // Kırmızı her zaman ilk başlar, bu yüzden ilk sırayı ayarla
    const isStartingTurn = myColor === 'Red';
    updateTurnIndicator(isStartingTurn);

    showNotification(`Oyun başladı! Oda: ${currentRoom}. Rakip: ${data.opponentId}. Sen: ${myColor}`, 'success');
}

// ODA KURULDU
socket.on('odaOlusturuldu', (data) => {
    showNotification(`${data.message} Kod: ${data.code}`, 'success');
    // Kopyalama butonunun mantığı burada olmalı
});

// OYUN DURUMU GÜNCEL
socket.on('oyunDurumuGuncelle', (data) => {
    // Tahtayı güncelleyen kod burada olmalı (data.newBoard kullanarak)
    // updateBoard(data.newBoard); 
    
    // Sıra kontrolü
    const isTurn = data.turn === socket.id;
    updateTurnIndicator(isTurn);
    
    // Hamle animasyonu (data.lastMove kullanarak)
    // animateMove(data.lastMove);
});

socket.on('hata', (data) => {
    showNotification(`HATA: ${data.message}`, 'danger');
});


// --- BUTON OLAY DİNLEYİCİLERİ ---

// Dereceli Oyna
rankedBtn.addEventListener('click', () => {
    socket.emit('eslesmeBaslat');
});

// Eşleşme İptal
cancelMatchBtn.addEventListener('click', () => {
    socket.emit('eslesmeIptal');
    rankedBtn.classList.remove('hidden');
    cancelMatchBtn.classList.add('hidden');
    showNotification('Eşleşme arama iptal edildi.', 'info');
});

// Arkadaşla Oyna (Oda Kur)
friendBtn.addEventListener('click', () => {
    socket.emit('odaKur');
});

// Odaya Bağlan
joinBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim();
    if (code.length === 4) {
        socket.emit('odayaBaglan', { code });
    } else {
        showNotification('Lütfen 4 haneli oda kodu girin.', 'danger');
    }
});

// Sayfa yüklendiğinde tahtayı çiz ve lobi ekranını göster
createBoard(); 
switchScreen(lobbyScreen);
