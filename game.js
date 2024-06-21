const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const PLAYER_WIDTH = 50;
const PLAYER_HEIGHT = 50;
const PLAYER_COLOR = 'blue';
let playerX = 50;
let playerY = canvas.height - PLAYER_HEIGHT - 10; // Player başlangıç konumu
let playerSpeedX = 5;
let playerJumping = false;
let playerJumpHeight = 100;
let gravity = 1.5;
let jumpForce = 20;

const PLATFORM_COLOR = 'green';
let platforms = [
    { x: 100, y: canvas.height - 50, width: 200, height: 20 },
    { x: 400, y: canvas.height - 100, width: 150, height: 20 },
    { x: 600, y: canvas.height - 200, width: 100, height: 20 }
];

function drawPlayer() {
    ctx.fillStyle = PLAYER_COLOR;
    ctx.fillRect(playerX, playerY, PLAYER_WIDTH, PLAYER_HEIGHT);
}

function drawPlatforms() {
    ctx.fillStyle = PLATFORM_COLOR;
    platforms.forEach(platform => {
        ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    });
}

function movePlayer() {
    // Klavye kontrolleri
    document.addEventListener('keydown', function(event) {
        if (event.key === 'ArrowLeft') {
            playerX -= playerSpeedX;
        } else if (event.key === 'ArrowRight') {
            playerX += playerSpeedX;
        } else if (event.key === 'ArrowUp' && !playerJumping) {
            playerJumping = true;
            jump();
        }
    });

    // Yerçekimi
    if (playerY < canvas.height - PLAYER_HEIGHT - 10) {
        playerY += gravity;
    } else {
        playerY = canvas.height - PLAYER_HEIGHT - 10;
        playerJumping = false;
    }
}

function jump() {
    let jumpInterval = setInterval(function() {
        if (playerJumpHeight <= 0) {
            clearInterval(jumpInterval);
        } else {
            playerY -= jumpForce;
            playerJumpHeight -= jumpForce;
        }
    }, 30);
}

function checkCollision() {
    platforms.forEach(platform => {
        if (
            playerX < platform.x + platform.width &&
            playerX + PLAYER_WIDTH > platform.x &&
            playerY < platform.y + platform.height &&
            playerY + PLAYER_HEIGHT > platform.y
        ) {
            playerJumpHeight = 0;
        }
    });
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPlayer();
    drawPlatforms();
    movePlayer();
    checkCollision();
    requestAnimationFrame(gameLoop);
}

gameLoop();
