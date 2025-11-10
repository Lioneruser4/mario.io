// client.js (Frontend)

// ⚠️⚠️ DİQQƏT! BU ÜNVANI ÖZ RENDER SERVER ÜNVANINIZ İLƏ DƏYİŞİN! ⚠️⚠️
const RENDER_SERVER_URL = 'https://sizin-serveriniz.onrender.com';
// ⚠️⚠️-----------------------------------------------------------⚠️⚠️

const socket = io(RENDER_SERVER_URL);

let player;         // YouTube player obyekti
let currentRoom = '';
let isSyncing = false; // Serverdən gələn siqnalı təkrar serverə göndərməmək üçün

// Elementləri seçmək
const joinRoomBtn = document.getElementById('joinRoomBtn');
const loadVideoBtn = document.getElementById('loadVideoBtn');
const roomIdInput = document.getElementById('roomId');
const videoUrlInput = document.getElementById('videoUrl');

// 1. YouTube API yüklənəndə...
function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    height: '100%',
    width: '100%',
    videoId: 'dQw4w9WgXcQ', // Başlanğıc video
    playerVars: {
      'playsinline': 1
    },
    events: {
      'onStateChange': onPlayerStateChange
    }
  });
}

// 2. Otağa qoşulma
joinRoomBtn.onclick = () => {
    let room = roomIdInput.value.trim();
    if (room) {
        currentRoom = room;
        socket.emit('join_room', currentRoom);
        alert('Otağa qoşuldunuz: ' + currentRoom);
    } else {
        alert('Otaq ID daxil edin.');
    }
};

// 3. Videonu linkdən yükləmə
loadVideoBtn.onclick = () => {
    if (!currentRoom) {
        alert('Əvvəlcə otağa qoşulun!');
        return;
    }
    
    let url = videoUrlInput.value;
    let videoId = extractYouTubeID(url);
    
    if (videoId) {
        // Həm özümüzdə, həm server vasitəsilə başqalarında yükləyirik
        player.loadVideoById(videoId);
        socket.emit('load_video', { room: currentRoom, videoId: videoId });
    } else {
        alert('Düzgün YouTube linki daxil edin.');
    }
};

// 4. İstifadəçi videonu idarə etdikdə (Play/Pause/Seek)
function onPlayerStateChange(event) {
    if (isSyncing || !currentRoom) return; // Əgər serverdən gələn siqnalla dəyişibsə, heç nə etmə

    const time = player.getCurrentTime();

    if (event.data == YT.PlayerState.PLAYING) {
        socket.emit('play', { room: currentRoom, time: time });
    } else if (event.data == YT.PlayerState.PAUSED) {
        socket.emit('pause', { room: currentRoom });
    }
    // Qeyd: Axtarış (seek) daha mürəkkəbdir, hələlik play/pause ilə kifayətlənək
}


// --- Serverdən Gələn Siqnalları Qəbul Etmə ---

// Başqa biri videonu dəyişdi
socket.on('sync_load_video', (videoId) => {
    console.log('Serverdən gəldi: YENİ VİDEO', videoId);
    isSyncing = true;
    player.loadVideoById(videoId);
    isSyncing = false;
});

// Başqa biri videonu "Play" etdi
socket.on('sync_play', (time) => {
    console.log('Serverdən gəldi: PLAY');
    isSyncing = true;
    player.seekTo(time, true); // Vaxtı bərabərləşdir
    player.playVideo();
    setTimeout(() => { isSyncing = false; }, 1000); // 1 saniyə kilidlə
});

// Başqa biri videonu "Pause" etdi
socket.on('sync_pause', () => {
    console.log('Serverdən gəldi: PAUSE');
    isSyncing = true;
    player.pauseVideo();
    setTimeout(() => { isSyncing = false; }, 500);
});

// --- Köməkçi Funksiya ---

// YouTube linkindən Video ID çıxarmaq üçün
function extractYouTubeID(url) {
    var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    var match = url.match(regExp);
    if (match && match[2].length == 11) {
        return match[2];
    } else {
        return null;
    }
}
