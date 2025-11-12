const { Engine, Render, Runner, Bodies, Composite, Events, Body } = Matter;

// --- AYARLAR ---
const arenaWidth = 1000;
const arenaHeight = 750; // 4:3 boyutu
const ballRadius = 40; // Büyük toplar
const maxHealth = 3; 
const itemSize = 40;
const itemRespawnTime = 3000; 
const randomForceMagnitude = 0.015;
const initialSpeed = 8;
let isGameOver = false; // Yeni oyun durumu değişkeni

// --- HTML ELEMANLARI ---
const gameOverModal = document.getElementById('game-over-modal');
const winnerText = document.getElementById('winner-text');
const winnerEmoji = document.getElementById('winner-emoji');
const restartButton = document.getElementById('restart-button');

// --- MOTOR VE ARENA KURULUMU ---
const engine = Engine.create();
const world = engine.world;

// Yer çekimini ihmal et
world.gravity.y = 0.0000001; 
world.gravity.x = 0.0000001;

const gameContainer = document.getElementById('game-container');
gameContainer.style.width = `${arenaWidth}px`;
gameContainer.style.height = `${arenaHeight}px`;

const render = Render.create({
    element: gameContainer,
    engine: engine,
    options: {
        width: arenaWidth,
        height: arenaHeight,
        wireframes: false,
        background: 'transparent'
    }
});

Render.run(render);
const runner = Runner.create();
Runner.run(runner, engine);

// Duvarlar
const wallThickness = 20;
Composite.add(world, [
    Bodies.rectangle(arenaWidth / 2, wallThickness / 2, arenaWidth, wallThickness, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } }),
    Bodies.rectangle(arenaWidth / 2, arenaHeight - wallThickness / 2, arenaWidth, wallThickness, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } }),
    Bodies.rectangle(wallThickness / 2, arenaHeight / 2, wallThickness, arenaHeight, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } }),
    Bodies.rectangle(arenaWidth - wallThickness / 2, arenaHeight / 2, wallThickness, arenaHeight, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } })
]);

// --- OYUNCU VE CAN SİSTEMİ ---
const playerInfo = {
    ball1: { 
        health: maxHealth, 
        hasSword: false, 
        emoji: document.getElementById('ball1-emoji'), 
        swordIcon: document.getElementById('p1-sword'),
        healthBar: document.getElementById('p1-health').querySelector('.health-bar'),
        nameDisplay: document.getElementById('player1-status').querySelector('.player-name')
    },
    ball2: { 
        health: maxHealth, 
        hasSword: false, 
        emoji: document.getElementById('ball2-emoji'), 
        swordIcon: document.getElementById('p2-sword'),
        healthBar: document.getElementById('p2-health').querySelector('.health-bar'),
        nameDisplay: document.getElementById('player2-status').querySelector('.player-name')
    }
};

const ballOptions = {
    restitution: 1.0,
    friction: 0.0,
    frictionAir: 0.001,
    density: 0.001,
    inertia: Infinity, // Dönmeyi engelle
    angularVelocity: 0,
    angularSpin: 0,
    render: { fillStyle: '#2196F3' }
};

const ball1 = Bodies.circle(arenaWidth / 4, arenaHeight / 2, ballRadius, { ...ballOptions, label: 'ball1' });
const ball2 = Bodies.circle(arenaWidth * 3 / 4, arenaHeight / 2, ballRadius, { ...ballOptions, render: { fillStyle: '#F44336' }, label: 'ball2' });

Composite.add(world, [ball1, ball2]);

// Topları başlangıçta yüksek hızla fırlat
Body.setVelocity(ball1, { x: initialSpeed, y: initialSpeed * (Math.random() > 0.5 ? 1 : -1) });
Body.setVelocity(ball2, { x: -initialSpeed, y: initialSpeed * (Math.random() > 0.5 ? 1 : -1) });

// --- ÖĞE SİSTEMİ ---
let currentItem = null;
let itemSpawnTimer = null;
const itemEmojiDiv = document.getElementById('item-emoji');

function spawnItem() {
    const x = Math.random() * (arenaWidth - wallThickness * 4) + wallThickness * 2;
    const y = Math.random() * (arenaHeight - wallThickness * 4) + wallThickness * 2;

    const currentItemType = Math.random() < 0.5 ? 'sword' : 'bomb';
    const emoji = currentItemType === 'sword' ? '⚔️' : '💣';

    currentItem = Bodies.circle(x, y, itemSize / 2, { 
        isStatic: true, 
        render: { fillStyle: 'transparent' }, 
        label: currentItemType
    });

    Composite.add(world, currentItem);
    itemEmojiDiv.textContent = emoji;
    itemEmojiDiv.style.display = 'block';
    
    clearTimeout(itemSpawnTimer);
}

setTimeout(spawnItem, 1000);

// --- GÖRSEL VE CAN GÜNCELLEMELERİ ---
function updateEmojiPosition(body, emojiDiv) {
    if (body) {
        emojiDiv.style.left = `${body.position.x}px`;
        emojiDiv.style.top = `${body.position.y}px`;
        Body.setAngularVelocity(body, 0); // Dönmeyi engelle

        const player = body === ball1 ? playerInfo.ball1 : playerInfo.ball2;
        if (player.hasSword) {
            player.swordIcon.style.display = 'block';
            player.swordIcon.style.transform = `rotate(${Math.sin(engine.timing.timestamp * 0.005) * 15}deg)`;
        } else {
            player.swordIcon.style.display = 'none';
        }
    }
}

function updateHealthBar(player, health) {
    const healthPercentage = (health / maxHealth) * 100;
    player.healthBar.style.width = `${healthPercentage}%`;
    
    const baseName = player === playerInfo.ball1 ? 'Player 1 (🇹🇷)' : 'Player 2 (⚽)';
    player.nameDisplay.textContent = `${baseName} Can: ${health}/${maxHealth}`;

    if (healthPercentage <= 33) {
        player.healthBar.classList.add('low-health');
    } else {
        player.healthBar.classList.remove('low-health');
    }
}

// ! YENİ FONKSİYON: Oyun bittiğinde modalı göster
function endGame(winnerPlayer) {
    if (isGameOver) return;
    isGameOver = true;
    
    Runner.stop(runner); // Fizik motorunu durdur

    const winnerName = winnerPlayer === playerInfo.ball1 ? 'Player 1' : 'Player 2';
    const winnerEmojiCode = winnerPlayer === playerInfo.ball1 ? '🇹🇷' : '⚽';

    winnerText.textContent = `${winnerName} KAZANDI!`;
    winnerEmoji.textContent = winnerEmojiCode;
    gameOverModal.style.display = 'flex'; // Modalı göster
    
    // Temizleme (varsa kalan öğeyi kaldır)
    if (currentItem) Composite.remove(world, currentItem);
    clearTimeout(itemSpawnTimer);
}

// Rastgele hareket
Events.on(engine, 'afterUpdate', function() {
    if (isGameOver) return; // Oyun bitmişse hareket etmesin

    if (currentItem) {
        itemEmojiDiv.style.left = `${currentItem.position.x}px`;
        itemEmojiDiv.style.top = `${currentItem.position.y}px`;
    }

    updateEmojiPosition(ball1, playerInfo.ball1.emoji);
    updateEmojiPosition(ball2, playerInfo.ball2.emoji);

    const minVelocitySquared = 0.5; 
    const maxVelocitySquared = 50; 

    const applyRandomForce = (ball) => {
        const currentVelocitySquared = ball.velocity.x * ball.velocity.x + ball.velocity.y * ball.velocity.y;
        
        if (currentVelocitySquared < minVelocitySquared) {
            Body.applyForce(ball, ball.position, { 
                x: (Math.random() - 0.5) * randomForceMagnitude * 2, 
                y: (Math.random() - 0.5) * randomForceMagnitude * 2
            });
        }
        
        if (currentVelocitySquared > maxVelocitySquared) {
             const factor = Math.sqrt(maxVelocitySquared / currentVelocitySquared);
             Body.setVelocity(ball, { x: ball.velocity.x * factor, y: ball.velocity.y * factor });
        }
        Body.setAngularVelocity(ball, 0);
    };

    applyRandomForce(ball1);
    applyRandomForce(ball2);
});


// --- ÇARPIŞMA MANTIKLARI ---
Events.on(engine, 'collisionStart', function(event) {
    if (isGameOver) return;

    const pairs = event.pairs;

    pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        const labels = [bodyA.label, bodyB.label];
        const isItemCollision = labels.includes('sword') || labels.includes('bomb');
        const isBallCollision = labels.includes('ball1') && labels.includes('ball2');

        // 1. Öğe Alma Mantığı
        if (isItemCollision && (labels.includes('ball1') || labels.includes('ball2'))) {
            const itemBody = bodyA.label === 'sword' || bodyA.label === 'bomb' ? bodyA : bodyB;
            const takerBall = bodyA.label.startsWith('ball') ? bodyA : bodyB;
            const player = takerBall === ball1 ? playerInfo.ball1 : playerInfo.ball2;

            if (itemBody.label === 'sword') {
                playerInfo.ball1.hasSword = (takerBall === ball1);
                playerInfo.ball2.hasSword = (takerBall === ball2);

            } else if (itemBody.label === 'bomb') {
                player.health--;
                updateHealthBar(player, player.health);
                if (player.hasSword) {
                     player.hasSword = false;
                     player.swordIcon.style.display = 'none';
                }
            }
            
            Composite.remove(world, currentItem);
            itemEmojiDiv.style.display = 'none';
            currentItem = null;
            itemSpawnTimer = setTimeout(spawnItem, itemRespawnTime);
        }

        // 2. Topların Birbirine Çarpışması
        if (isBallCollision) {
            const p1 = playerInfo.ball1;
            const p2 = playerInfo.ball2;

            let damageDealt = false;
            
            if (p1.hasSword && !p2.hasSword) {
                p2.health--;
                p1.hasSword = false; 
                p1.swordIcon.style.display = 'none';
                damageDealt = true;
            } else if (p2.hasSword && !p1.hasSword) {
                p1.health--;
                p2.hasSword = false; 
                p2.swordIcon.style.display = 'none';
                damageDealt = true;
            } else if (p1.hasSword && p2.hasSword) {
                p1.hasSword = false;
                p2.hasSword = false;
                p1.swordIcon.style.display = 'none';
                p2.swordIcon.style.display = 'none';
                damageDealt = false; 
            }
            
            if (damageDealt || (isBallCollision && (p1.hasSword || p2.hasSword))) {
                updateHealthBar(p1, p1.health);
                updateHealthBar(p2, p2.health);
                
                if (!currentItem) {
                    itemSpawnTimer = setTimeout(spawnItem, itemRespawnTime / 2); 
                }
            }

            // Kazanan kontrolü (endGame fonksiyonu çağrılır)
            if (p1.health <= 0) {
                endGame(playerInfo.ball2); // P2 kazandı
            } else if (p2.health <= 0) {
                endGame(playerInfo.ball1); // P1 kazandı
            }
        }
    });
});

// YENİDEN BAŞLATMA İŞLEVİ
restartButton.addEventListener('click', () => {
    // Sayfayı yeniden yükleyerek oyunu sıfırla
    location.reload(); 
});

// Başlangıç can çubuklarını ayarla
updateHealthBar(playerInfo.ball1, maxHealth);
updateHealthBar(playerInfo.ball2, maxHealth);
