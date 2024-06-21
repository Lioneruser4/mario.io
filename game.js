const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let player = { x: 50, y: 50, width: 20, height: 20, color: 'blue' };
let coins = [];
let score = 0;

function startGame(userId) {
    generateCoins();
    updateGame();
    console.log('Game started for user:', userId);
}

function generateCoins() {
    for (let i = 0; i < 10; i++) {
        coins.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            width: 10,
            height: 10,
            color: 'yellow'
        });
    }
}

function updateGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPlayer();
    drawCoins();
    requestAnimationFrame(updateGame);
}

function drawPlayer() {
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
}

function drawCoins() {
    coins.forEach(coin => {
        ctx.fillStyle = coin.color;
        ctx.fillRect(coin.x, coin.y, coin.width, coin.height);
    });
}

// Basit bir hareket kontrolü ekleyelim
document.addEventListener('keydown', (event) => {
    const speed = 5;
    if (event.key === 'ArrowUp') player.y -= speed;
    if (event.key === 'ArrowDown') player.y += speed;
    if (event.key === 'ArrowLeft') player.x -= speed;
    if (event.key === 'ArrowRight') player.x += speed;

    // Coin toplama kontrolü
    coins.forEach((coin, index) => {
        if (player.x < coin.x + coin.width &&
            player.x + player.width > coin.x &&
            player.y < coin.y + coin.height &&
            player.y + player.height > coin.y) {
            coins.splice(index, 1); // Coin'i kaldır
            score++;
            console.log('Score:', score);
        }
    });
});
