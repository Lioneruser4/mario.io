// Mario.io Oyun JavaScript
class MarioGame {
    constructor() {
        this.socket = io();
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.roomId = null;
        this.playerId = null;
        this.gameState = null;
        this.isPlayer1 = false;
        this.keys = {};
        this.gameLoop = null;
        
        // Elementlər
        this.waitingScreen = document.getElementById('waitingScreen');
        this.gameScreen = document.getElementById('gameScreen');
        this.statusText = document.getElementById('statusText');
        this.playerIdElement = document.getElementById('playerId');
        this.currentScoreElement = document.getElementById('currentScore');
        this.opponentScoreElement = document.getElementById('opponentScore');
        
        this.init();
    }
    
    init() {
        // Socket.IO hadisələri
        this.socket.on('connect', () => {
            console.log('Serverə qoşuldu');
            this.playerId = this.socket.id;
            this.playerIdElement.textContent = this.playerId.substring(0, 8) + '...';
            
            // Dərhal raqib axtar
            this.findMatch();
        });
        
        this.socket.on('waiting', (data) => {
            console.log('Gözləmədə:', data);
            this.statusText.textContent = data.message;
            this.statusText.className = 'loading';
        });
        
        this.socket.on('matchFound', (data) => {
            console.log('Eşleşmə tapıldı:', data);
            this.roomId = data.roomId;
            this.isPlayer1 = data.players.player1 === this.playerId;
            
            // Ekran dəyiş
            this.waitingScreen.style.display = 'none';
            this.gameScreen.style.display = 'block';
            
            // Oyunu başlat
            this.startGame();
        });
        
        this.socket.on('gameState', (state) => {
            this.gameState = state;
            this.updateUI();
        });
        
        this.socket.on('playerDisconnected', (data) => {
            console.log('Raqib ayrıldı:', data);
            alert(data.message);
            this.resetGame();
        });
        
        // Klaviatura hadisələri
        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            e.preventDefault();
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
            e.preventDefault();
        });
    }
    
    findMatch() {
        this.socket.emit('findMatch');
        this.statusText.textContent = 'Raqib axtarilir...';
    }
    
    startGame() {
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
        }
        
        this.gameLoop = requestAnimationFrame(() => this.update());
    }
    
    update() {
        if (!this.gameState) {
            this.gameLoop = requestAnimationFrame(() => this.update());
            return;
        }
        
        // Oyunçu hərəkətlərini işlə
        this.handleInput();
        
        // Topu yenilə
        this.updateBall();
        
        // Oyunu çək
        this.draw();
        
        // Növbəti frame
        this.gameLoop = requestAnimationFrame(() => this.update());
    }
    
    handleInput() {
        const player = this.isPlayer1 ? this.gameState.player1 : this.gameState.player2;
        let updated = false;
        
        // Hərəkət
        if (this.keys['ArrowLeft'] && player.x > 50) {
            player.x -= 8;
            updated = true;
        }
        if (this.keys['ArrowRight'] && player.x < 750) {
            player.x += 8;
            updated = true;
        }
        if (this.keys['ArrowUp'] && player.y > 50) {
            player.y -= 8;
            updated = true;
        }
        if (this.keys['ArrowDown'] && player.y < 350) {
            player.y += 8;
            updated = true;
        }
        
        // Serverə hərəkəti göndər
        if (updated) {
            this.socket.emit('playerMove', {
                roomId: this.roomId,
                playerData: {
                    x: player.x,
                    y: player.y
                }
            });
        }
        
        // Topa zərbə (Space)
        if (this.keys[' '] && this.canHitBall()) {
            this.hitBall();
            this.keys[' '] = false; // Bir dəfəlik
        }
    }
    
    canHitBall() {
        const player = this.isPlayer1 ? this.gameState.player1 : this.gameState.player2;
        const ball = this.gameState.ball;
        
        const distance = Math.sqrt(
            Math.pow(player.x - ball.x, 2) + 
            Math.pow(player.y - ball.y, 2)
        );
        
        return distance < 50; // Topa yaxınlıq
    }
    
    hitBall() {
        const player = this.isPlayer1 ? this.gameState.player1 : this.gameState.player2;
        const ball = this.gameState.ball;
        
        // Topu oyunçudan uzağa göndər
        const angle = Math.atan2(ball.y - player.y, ball.x - player.x);
        const speed = 10;
        
        ball.velocityX = Math.cos(angle) * speed;
        ball.velocityY = Math.sin(angle) * speed;
        
        // Serverə göndər
        this.socket.emit('updateBall', {
            roomId: this.roomId,
            ballData: {
                velocityX: ball.velocityX,
                velocityY: ball.velocityY
            }
        });
    }
    
    updateBall() {
        if (!this.gameState) return;
        
        const ball = this.gameState.ball;
        
        // Top hərəkəti
        ball.x += ball.velocityX;
        ball.y += ball.velocityY;
        
        // Divarlardan qayıtma
        if (ball.x <= 10 || ball.x >= 790) {
            ball.velocityX = -ball.velocityX;
            ball.x = ball.x <= 10 ? 10 : 790;
        }
        
        if (ball.y <= 10 || ball.y >= 390) {
            ball.velocityY = -ball.velocityY;
            ball.y = ball.y <= 10 ? 10 : 390;
        }
        
        // Sürəti azalt
        ball.velocityX *= 0.98;
        ball.velocityY *= 0.98;
        
        // Serverə yenilənmiş topu göndər
        this.socket.emit('updateBall', {
            roomId: this.roomId,
            ballData: {
                x: ball.x,
                y: ball.y,
                velocityX: ball.velocityX,
                velocityY: ball.velocityY
            }
        });
    }
    
    draw() {
        // Canvası təmizlə
        this.ctx.fillStyle = '#87CEEB';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (!this.gameState) return;
        
        // Oyun meydançası
        this.drawField();
        
        // Oyunçuları çək
        this.drawPlayer(this.gameState.player1, '#FF6B6B', 'Oyunçu 1');
        this.drawPlayer(this.gameState.player2, '#4ECDC4', 'Oyunçu 2');
        
        // Topu çək
        this.drawBall();
    }
    
    drawField() {
        // Sahə xəttləri
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 3;
        
        // Mərkəz xətti
        this.ctx.beginPath();
        this.ctx.moveTo(400, 0);
        this.ctx.lineTo(400, 400);
        this.ctx.stroke();
        
        // Mərkəz dairəsi
        this.ctx.beginPath();
        this.ctx.arc(400, 200, 50, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Qapılar
        this.ctx.fillStyle = '#FFF';
        this.ctx.fillRect(10, 150, 30, 100);
        this.ctx.fillRect(760, 150, 30, 100);
    }
    
    drawPlayer(player, color, label) {
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, 20, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Oyunçu adı
        this.ctx.fillStyle = '#333';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(label, player.x, player.y - 25);
        
        // Xal
        this.ctx.fillText(`Xal: ${player.score}`, player.x, player.y + 35);
    }
    
    drawBall() {
        const ball = this.gameState.ball;
        
        // Top
        this.ctx.fillStyle = '#FFD93D';
        this.ctx.beginPath();
        this.ctx.arc(ball.x, ball.y, 10, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Top konturu
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }
    
    updateUI() {
        if (!this.gameState) return;
        
        const myScore = this.isPlayer1 ? this.gameState.player1.score : this.gameState.player2.score;
        const opponentScore = this.isPlayer1 ? this.gameState.player2.score : this.gameState.player1.score;
        
        this.currentScoreElement.textContent = myScore;
        this.opponentScoreElement.textContent = opponentScore;
    }
    
    resetGame() {
        // Oyunu sıfırla
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
            this.gameLoop = null;
        }
        
        this.roomId = null;
        this.gameState = null;
        
        // Ekranları dəyiş
        this.waitingScreen.style.display = 'block';
        this.gameScreen.style.display = 'none';
        
        // Yenidən raqib axtar
        this.findMatch();
    }
}

// Oyunu başlat
document.addEventListener('DOMContentLoaded', () => {
    window.game = new MarioGame();
});
