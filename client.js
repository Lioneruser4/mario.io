// client.js (Frontend)

// 🟢🟢 RENDER SERVER ÜNVANINIZ: 🟢🟢
const RENDER_SERVER_URL = 'https://mario-io-1.onrender.com';
// 🟢🟢-----------------------------------------------------------🟢🟢

const socket = io(RENDER_SERVER_URL);

let player;
let currentRoom = '';
let currentUsername = '';
let isSyncing = false;
let userTriggeredSeek = false; // Kullanıcının mı seek yaptığı, yoksa sunucudan mı geldiği

// Ekran ve Elementler
const lobbyScreen = document.getElementById('lobby-screen');
const roomScreen = document.getElementById('room-screen');
const enterRoomBtn = document.getElementById('enterRoomBtn');
const roomIdInput = document.getElementById('roomIdInput');
const usernameInput = document.getElementById('username');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const roomCodeToCopy = document.getElementById('roomCodeToCopy');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const userList = document.getElementById('userList');
const loadVideoBtn = document.getElementById('loadVideoBtn');
const videoUrlInput = document.getElementById('videoUrl');


// --- 1. Lobi Mantığı ---

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

enterRoomBtn.onclick = () => {
    currentUsername = usernameInput.value.trim();
    let roomCode = roomIdInput.value.trim();
    
    if (!currentUsername) {
        alert('Lütfen adınızı girin!');
        return;
    }
    
    // Oda kodu girilmemişse yeni oda oluştur
    if (!roomCode) {
        roomCode = generateRoomCode();
    }

    currentRoom = roomCode;
    
    // Sunucuya katılma isteği gönder
    socket.emit('join_room', { roomId: currentRoom, username: currentUsername });
    
    // Arayüzü güncelle
    lobbyScreen.classList.add('hidden');
    roomScreen.classList.remove('hidden');
    roomCodeDisplay.textContent = currentRoom;
    roomCodeToCopy.textContent = `Oda Kodu: ${currentRoom}`;
    
    // YouTube player'ı başlat (iframe hazır değilse)
    if (!player) {
        onYouTubeIframeAPIReady();
    }
};

copyCodeBtn.onclick = () => {
    navigator.clipboard.writeText(currentRoom)
        .then(() => {
            alert(`Oda Kodu (${currentRoom}) panoya kopyalandı!`);
        })
        .catch(err => {
            console.error('Kopyalama başarısız oldu:', err);
        });
};

// 2. Video Yükleme Mantığı
loadVideoBtn.onclick = () => {
    if (!currentRoom) return; 

    let url = videoUrlInput.value;
    let videoId = extractYouTubeID(url);
    
    if (videoId) {
        // Kendi player'ımızı yükle
        player.loadVideoById(videoId);
        // Sunucuya komutu gönder (diğerlerine yayınlansın)
        socket.emit('load_video', { room: currentRoom, videoId: videoId });
    } else {
        alert('Düzgün YouTube linki daxil edin.');
    }
};


// --- 3. YouTube Player Mantığı ---

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        videoId: 'dQw4w9WgXcQ', 
        playerVars: {
            'playsinline': 1,
            'rel': 0, // İlgili videoları kapat
            'modestbranding': 1 // YouTube logosunu küçült
        },
        events: {
            'onStateChange': onPlayerStateChange,
            'onReady': onPlayerReady
        }
    });
}

function onPlayerReady(event) {
    // Player hazır olduğunda Seek (ilerletme) olayını dinlemek için kullanılır.
    // YouTube API'sinde seek için özel bir event yoktur, bu yüzden `onStateChange` kullanılır.
}

function onPlayerStateChange(event) {
    if (isSyncing || !currentRoom) return;
    
    const time = player.getCurrentTime();

    switch(event.data) {
        case YT.PlayerState.PLAYING:
            // Oynatmaya başlama, kontrol için zamanı da gönder
            socket.emit('play', { room: currentRoom, time: time });
            break;
            
        case YT.PlayerState.PAUSED:
            // Duraklatma, kontrol için zamanı da gönder
            socket.emit('pause', { room: currentRoom, time: time });
            break;
            
        case YT.PlayerState.BUFFERING:
            // Eğer kullanıcı arama yaptıysa (seek), bunu sunucuya bildir
            // NOTE: Bu, YouTube API'sinde ideal bir çözüm değildir, ama en yakın yoldur.
            if (Math.abs(time - player.getDuration()) > 0.5 && !userTriggeredSeek) { 
                // Eğer video süresinin sonunda değilse ve sunucu tetiklemediyse, kullanıcının seek ettiğini varsay
                userTriggeredSeek = true;
                socket.emit('seek', { room: currentRoom, time: time });
            }
            break;
    }
    
    // Seek sonrası isSyncing'i temizle
    if (event.data !== YT.PlayerState.BUFFERING) {
        userTriggeredSeek = false;
    }
}


// --- 4. Sunucudan Gelen Senkronizasyon Komutları ---

// İlk senkronizasyon (Odaya yeni girildi)
socket.on('initial_sync', (videoState) => {
    isSyncing = true;
    player.loadVideoById(videoState.id, videoState.time);
    if (videoState.playing) {
        player.playVideo();
    } else {
        player.pauseVideo();
    }
    setTimeout(() => { isSyncing = false; }, 1000); 
});

// Başkası video yükledi
socket.on('sync_load_video', (videoId) => {
    isSyncing = true;
    player.loadVideoById(videoId);
    setTimeout(() => { isSyncing = false; }, 1000);
});

// Başkası oynattı
socket.on('sync_play', (time) => {
    isSyncing = true;
    player.seekTo(time, true); 
    player.playVideo();
    setTimeout(() => { isSyncing = false; }, 1000); 
});

// Başkası durdurdu
socket.on('sync_pause', (time) => {
    isSyncing = true;
    player.seekTo(time, true); // Durdurma anındaki zamanı eşitle
    player.pauseVideo();
    setTimeout(() => { isSyncing = false; }, 500);
});

// Başkası ileri/geri sardı
socket.on('sync_seek', (time) => {
    isSyncing = true;
    player.seekTo(time, true);
    // Eğer video oynuyorsa, seek sonrası oynamaya devam etmesi için komut verilebilir
    if (player.getPlayerState() === YT.PlayerState.PLAYING) {
        player.playVideo(); 
    }
    setTimeout(() => { isSyncing = false; }, 1000);
});

// Oda durum güncellemesi (Kullanıcı listesi)
socket.on('room_status', (status) => {
    userList.innerHTML = '';
    status.users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        if (user === currentUsername) {
             li.style.color = '#4CAF50'; // Kendi adımızı yeşil yap
        }
        userList.appendChild(li);
    });
    
    // Yeni giren kullanıcı için video yüklü değilse, ilk senkronizasyonu tetikleyecek kod buraya eklenebilir
});


// --- Yardımcı Fonksiyon ---

function extractYouTubeID(url) {
    if (!url || typeof url !== 'string') return null;
    var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    var match = url.match(regExp);
    if (match && match[2].length == 11) {
        return match[2];
    } else {
        return null;
    }
}
