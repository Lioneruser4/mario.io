// game.js

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let playerX = 50;
let playerY = 500;
let playerWidth = 50;
let playerHeight = 50;

function drawPlayer() {
    ctx.fillStyle = 'blue';
    ctx.fillRect(playerX, playerY, playerWidth, playerHeight);
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPlayer();
    requestAnimationFrame(gameLoop);
}

gameLoop();
