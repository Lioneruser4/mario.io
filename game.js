const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth; // Pencere genişliği kadar
canvas.height = window.innerHeight; // Pencere yüksekliği kadar

// Oyun mekaniklerini burada başlat
function startGame() {
    // Oyun başlatma kodları
    // Örneğin, basit bir kare çizelim
    ctx.fillStyle = 'red';
    ctx.fillRect(50, 50, 100, 100);
}
