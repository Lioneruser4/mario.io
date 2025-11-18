// game.js
const SERVER_URL = 'https://mario-io-1.onrender.com';
const socket = io(SERVER_URL);

// DOM Elementleri
const statusEl = document.getElementById('connection-status');
const lobbyEl = document.getElementById('lobby-view');
const gameEl = document.getElementById('game-view');
const mainMenuEl = document.getElementById('main-menu');
const waitingAreaEl = document.getElementById('waiting-area');
const waitingMessageEl = document.getElementById('waiting-message');

const btnFindMatch = document.getElementById('btn-find-match');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const inputRoomCode = document.getElementById('join-room-code-input');
const btnCancel = document.getElementById('btn-cancel');

let localGameState = null; 
let localPlayerRole = null; 
let currentRoomCode = null;
let selectedPiece = null; 

// --- Lobi Durum Yönetimi Fonksiyonu ---
/**
 * Lobi görünümünü değiştirir.
 * @param {string} state - 'MAIN_MENU', 'WAITING', 'ROOM_HOSTING'
 */
function setLobbyState(state) {
    mainMenuEl.style.display = 'none';
    waitingAreaEl.style.display = 'none';
    lobbyEl.style.display = 'block';
    gameEl.style.display = 'none';

    switch (state) {
        case 'MAIN_MENU':
            mainMenuEl.style.display = 'flex';
            waitingMessageEl.textContent = '';
            break;
        case 'WAITING':
            waitingAreaEl.style.display = 'block';
            waitingMessageEl.textContent = 'Dereceli eşleşme aranıyor... Lütfen bekleyiniz.';
            break;
        case 'ROOM_HOSTING':
            waitingAreaEl.style.display = 'block';
            // Oda kodu, roomCreated olayından sonra buraya yerleştirilecek
            break;
        case 'GAME':
            lobbyEl.style.display = 'none';
            gameEl.style.display = 'block';
            break;
    }
}


// --- SOCKET.IO İSTEMCİ OLAYLARI ---

socket.on('connect', () => {
    statusEl.textContent = '✅ Sunucuya Bağlandı.';
    statusEl.classList.remove('status-error');
    statusEl.classList.add('status-success');
    setLobbyState('MAIN_MENU'); // Bağlanınca ana menüyü göster
});

socket.on('disconnect', () => {
    statusEl.textContent = '❌ Sunucu Bağlantısı Kesildi! Yeniden bağlanıyor...';
    statusEl.classList.remove('status-success');
    statusEl.classList.add('status-error');
    setLobbyState('MAIN_MENU');
});

// Sunucudan gelen özel durum değişim isteği (Matchmaking iptali vb.)
socket.on('setLobbyState', setLobbyState); 

// Eşleşme Bulundu (Dereceli veya Arkadaş)
socket.on('matchFound', ({ roomCode, role }) => {
    currentRoomCode = roomCode;
    localPlayerRole = role; // Rolü kaydet
    setLobbyState('GAME'); // Oyuna geç
});

// Oda Kuruldu (Sadece kurucuya gelir)
socket.on('roomCreated', ({ roomCode, role }) => {
    currentRoomCode = roomCode;
    localPlayerRole = role;
    setLobbyState('ROOM_HOSTING');
    waitingMessageEl.innerHTML = `🎉 Oda Kodunuz: **${roomCode}**<br>Arkadaşınızın bağlanması bekleniyor...`;
    
    // Kendimden eklediğim güzellik: Kodu panoya kopyalama butonu
    const copyBtn = document.createElement('button');
    copyBtn.className = 'animated-button copy-btn';
    copyBtn.innerHTML = '<i class="fas fa-copy"></i> Kopyala';
    copyBtn.onclick = () => { navigator.clipboard.writeText(roomCode); copyBtn.innerHTML = '<i class="fas fa-check"></i> Kopyalandı!'; };
    waitingMessageEl.appendChild(copyBtn);
});

// Oyun Durumu Güncellemesi
socket.on('gameStateUpdate', (gameState) => {
    localGameState = gameState;
    // ... renderBoard() ve updateTurnIndicator() çağrılır ...
    renderBoard();
    updateTurnIndicator();
});

socket.on('error', (message) => {
    alert(`Hata: ${message}`);
    setLobbyState('MAIN_MENU');
});

// --- LOBİ BUTON İŞLEMLERİ ---

btnFindMatch.addEventListener('click', () => {
    socket.emit('findMatch');
});

btnCreateRoom.addEventListener('click', () => {
    socket.emit('createRoom');
});

btnCancel.addEventListener('click', () => {
    // Bulunduğumuz duruma göre iptal işlemi gönderilir
    if (waitingMessageEl.textContent.includes('Dereceli')) {
        socket.emit('cancelMatchmaking');
    } else {
        // Oda kurma iptali (sunucuda odanın silinmesini tetikler)
        // Bunun için server.js'e 'cancelRoom' emiti eklenmelidir.
        socket.emit('cancelRoom', currentRoomCode);
    }
});

btnJoinRoom.addEventListener('click', () => {
    const roomCode = inputRoomCode.value.trim();
    if (roomCode.length === 4) {
        socket.emit('joinRoom', { roomCode });
    } else {
        alert('Lütfen 4 haneli oda kodu girin.');
    }
});

// --- OYUN GÖRSELLEŞTİRME (Kısaltıldı) ---

function updateTurnIndicator() {
    // ... Önceki yanıttaki ışıklı sıra gösterimi mantığı buraya gelir ...
}

function renderBoard() {
    // ... Önceki yanıttaki tahta çizme ve hamle gösterme (renkli vurgu) mantığı buraya gelir ...
    
    // Hamle Gösterme Ekstra Güzellik:
    // selectedPiece varsa ve sıra bende ise, geçerli hamleleri hesapla.
    // Hesaplanan her hamle karesine 'highlight-move' CSS sınıfını ekle.
}

function handleCellClick(r, c) {
    // ... Önceki yanıttaki taşa tıklama ve hamle yapma mantığı buraya gelir ...
}

// Başlangıçta tahtayı bir kez çiz
// renderBoard();
