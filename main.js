// main.js (İstemci Tarafı JavaScript)

// Sunucu Adresi (Render.com)
// Lütfen bu adresi kendi Render.com dağıtımınızın adresiyle değiştirin.
// https://mario-io-1.onrender.com (Talep edilen adresi kullanıyoruz)
const SERVER_URL = 'https://mario-io-1.onrender.com';
const socket = io(SERVER_URL);

// DOM Elementleri
const statusDisplay = document.getElementById('status-display');
const lobbyView = document.getElementById('lobby-view');
const gameView = document.getElementById('game-view');
const btnMatchmaking = document.getElementById('btn-matchmaking');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const inputRoomCode = document.getElementById('input-room-code');
const roomCodeDisplay = document.getElementById('room-code-display');
const turnIndicator = document.getElementById('turn-indicator');

let currentRoomCode = null;
let myPlayerId = socket.id; // Bağlandıktan sonra güncellenir

// --- Socket.io Olay Dinleyicileri ---

// Bağlantı Başarılı
socket.on('connect', () => {
    myPlayerId = socket.id;
    console.log('Sunucuya bağlandınız. ID:', myPlayerId);
});

socket.on('connection:success', (data) => {
    statusDisplay.textContent = data.message;
    statusDisplay.style.backgroundColor = '#4CAF50'; // Yeşil
});

socket.on('connect_error', (error) => {
    statusDisplay.textContent = `❌ Bağlantı Hatası: ${error.message}. Sunucuya erişilemiyor olabilir.`;
    statusDisplay.style.backgroundColor = '#f44336'; // Kırmızı
});

// Eşleştirme Sistemi
socket.on('matchmaking:waiting', (data) => {
    statusDisplay.textContent = data.message;
    statusDisplay.style.backgroundColor = '#ffc107'; // Sarı
    btnMatchmaking.textContent = 'İptal Et';
    // Buraya iptal mantığı eklenecek
});

socket.on('matchmaking:found', (data) => {
    statusDisplay.textContent = `✅ Eşleşme Bulundu! Oda: ${data.roomCode}`;
    currentRoomCode = data.roomCode;
    // Lobi ekranını gizle, oyun ekranını göster
    showGameView(data.roomCode);
});

// Oda Kurma
socket.on('room:created', (data) => {
    currentRoomCode = data.roomCode;
    statusDisplay.textContent = `✅ Oda Kuruldu! Kod: ${data.roomCode}. Oyuncuları bekliyor...`;
    statusDisplay.style.backgroundColor = '#2196f3'; // Mavi
    
    // Kopyala butonu ve kodu göster
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Kopyala';
    copyBtn.onclick = () => { navigator.clipboard.writeText(data.roomCode).then(() => alert('Kod Kopyalandı!')); };
    
    // Butonu geçici olarak değiştir
    btnCreateRoom.parentNode.replaceChild(copyBtn, btnCreateRoom);
});

// Odaya Katılma
socket.on('player:joined', (data) => {
    currentRoomCode = data.roomCode;
    statusDisplay.textContent = `✅ Odaya Katıldınız: ${data.roomCode}`;
    showGameView(data.roomCode);
});

socket.on('join:error', (data) => {
    alert(`Katılma Başarısız: ${data.message}`);
    statusDisplay.textContent = `Hata: ${data.message}`;
});

// Oyun Güncelleme
socket.on('game:update', (data) => {
    // Burası en önemli kısımdır. Gelen oyun verisine göre UI'yi günceller.
    const { turnId } = data; // Örnek olarak sırayı alıyoruz.
    
    if (turnId === myPlayerId) {
        turnIndicator.textContent = 'SIRA SENDE!';
        turnIndicator.classList.add('is-my-turn');
    } else {
        turnIndicator.textContent = `Sıra: ${turnId.substring(0, 4)}...`;
        turnIndicator.classList.remove('is-my-turn');
    }
    
    // Domino taşlarını çizme, geçerli hamleleri renklendirme vb.
    // drawDominoBoard(data.board);
    // highlightValidMoves(data.board, myPlayerHand);
});

// --- UI İşlevleri ---

function showGameView(roomCode) {
    lobbyView.classList.add('hidden');
    gameView.classList.remove('hidden');
    roomCodeDisplay.textContent = `Oda: ${roomCode}`;
}

// --- Buton Olayları ---

// Dereceli Oyna
btnMatchmaking.addEventListener('click', () => {
    // Eğer 'İptal Et' durumundaysa iptal etme mantığı buraya eklenecek
    socket.emit('matchmaking:start');
});

// Oda Kur
btnCreateRoom.addEventListener('click', () => {
    socket.emit('create:room');
});

// Koda Bağlan
btnJoinRoom.addEventListener('click', () => {
    const roomCode = inputRoomCode.value.trim().toUpperCase();
    if (roomCode.length === 4) {
        socket.emit('join:room', { roomCode });
    } else {
        alert('Lütfen 4 haneli geçerli bir oda kodu girin.');
    }
});

// --- Domino Oynanış Mantığı (Yer Tutucu) ---
/*
document.getElementById('player-hand').addEventListener('click', (e) => {
    if (e.target.classList.contains('domino-tile')) {
        const tile = e.target.dataset.tile; // Tıklanan taş (örneğin "6-6")
        
        // Bu taşın tahtada nereye oynanabileceğini gösteren fonksiyonu çağır
        // highlightValidMoves(tile, currentBoardState);
        
        // Geçerli oynama alanı seçildiğinde
        // socket.emit('game:play', { roomCode: currentRoomCode, tile: tile, placement: 'left' });
    }
});
*/
