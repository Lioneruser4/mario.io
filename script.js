const { Engine, Render, Runner, Bodies, Composite, Events, Body, Common } = Matter;

// --- AYARLAR ---
const arenaWidth = 1000;
const arenaHeight = 750;
const ballRadius = 60; 
const maxHealth = 3; 
const itemSize = 40;
const itemRespawnTime = 3000; 
const MAX_SPEED = 10; // ! YENİ: Topların ulaşabileceği maksimum ve sabit hız
let isGameOver = false;

// --- HTML ELEMANLARI ---
const setupModal = document.getElementById('setup-modal');
const startGameButton = document.getElementById('start-game-button');
const p1NameInput = document.getElementById('p1-name-input');
const p2NameInput = document.getElementById('p2-name-input');
const p1FileInput = document.getElementById('p1-file');
const p2FileInput = document.getElementById('p2-file');
const p1Preview = document.getElementById('p1-preview');
const p2Preview = document.getElementById('p2-preview');

const gameOverModal = document.getElementById('game-over-modal');
const winnerText = document.getElementById('winner-text');
const winnerEmoji = document.getElementById('winner-emoji');
const restartButton = document.getElementById('restart-button');

// --- MATTER.JS DEĞİŞKENLERİ ---
const engine = Engine.create();
const world = engine.world;
// Yer çekimini ihmal et
world.gravity.y = 0; 
world.gravity.x = 0;
let runner; 

const gameContainer = document.getElementById('game-container');
gameContainer.style.width = `${arenaWidth}px`;
gameContainer.style.height = `${arenaHeight}px`;

// --- OYUNCU BİLGİLERİ VE MATTER.JS NESNELERİ ---
let ball1, ball2;

const playerInfo = {
    ball1: { 
        health: maxHealth, 
        hasSword: false, 
        emoji: document.getElementById('ball1-emoji'), 
        swordIcon: document.getElementById('p1-sword'),
        healthBar: document.getElementById('p1-health').querySelector('.health-bar'),
        nameDisplay: document.getElementById('p1-name-display'),
        name: 'Player 1',
        texture: ''
    },
    ball2: { 
        health: maxHealth, 
        hasSword: false, 
        emoji: document.getElementById('ball2-emoji'), 
        swordIcon: document.getElementById('p2-sword'),
        healthBar: document.getElementById('p2-health').querySelector('.health-bar'),
        nameDisplay: document.getElementById('p2-name-display'),
        name: 'Player 2',
        texture: ''
    }
};

// --- YARDIMCI FONKSİYONLAR ---

function updateHealthBar(player, health) {
    const healthPercentage = (health / maxHealth) * 100;
    player.healthBar.style.width = `${healthPercentage}%`;
    
    player.nameDisplay.textContent = `${player.name} Can: ${health}/${maxHealth}`;

    if (healthPercentage <= 33) {
        player.healthBar.classList.add('low-health');
    } else {
        player.healthBar.classList.remove('low-health');
    }
}

function updateEmojiPosition(body, emojiDiv) {
    if (body) {
        emojiDiv.style.left = `${body.position.x}px`;
        emojiDiv.style.top = `${body.position.y}px`;
        Body.setAngularVelocity(body, 0); 

        const player = body === ball1 ? playerInfo.ball1 : playerInfo.ball2;
        if (player.hasSword) {
            player.swordIcon.style.display = 'block';
            player.swordIcon.style.transform = `rotate(${Math.sin(engine.timing.timestamp * 0.005) * 15}deg)`;
        } else {
            player.swordIcon.style.display = 'none';
        }
    }
}

function endGame(winnerPlayer) {
    if (isGameOver) return;
    isGameOver = true;
    
    Runner.stop(runner); 

    const winnerName = winnerPlayer.name;
    const winnerEmojiCode = winnerPlayer.texture ? '' : '🏆'; 

    winnerText.textContent = `${winnerName} KAZANDI!`;
    winnerEmoji.textContent = winnerEmojiCode;
    
    if (winnerPlayer.texture) {
        winnerEmoji.style.backgroundImage = `url(${winnerPlayer.texture})`;
        winnerEmoji.style.borderRadius = '50%';
        winnerEmoji.style.backgroundSize = 'cover';
        winnerEmoji.textContent = ''; 
    } else {
         winnerEmoji.style.backgroundImage = 'none';
    }

    gameOverModal.style.display = 'flex';
    
    if (currentItem) Composite.remove(world, currentItem);
    clearTimeout(itemSpawnTimer);
}

// --- FOTOĞRAF YÜKLEME VE BAŞLATMA MANTIKLARI ---

function checkCanStart() {
    const p1Ready = p1NameInput.value.trim() !== '' && p1Preview.style.backgroundImage !== '';
    const p2Ready = p2NameInput.value.trim() !== '' && p2Preview.style.backgroundImage !== '';
    startGameButton.disabled = !(p1Ready && p2Ready);
}

function setupFileReader(fileInput, previewDiv, player) {
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const url = e.target.result;
                previewDiv.style.backgroundImage = `url(${url})`;
                player.texture = url;
                checkCanStart();
            };
            reader.readAsDataURL(file);
        }
    });
}

// İsim ve dosya girişlerini kontrol etme
setupFileReader(p1FileInput, p1Preview, playerInfo.ball1);
setupFileReader(p2FileInput, p2Preview, playerInfo.ball2);
p1NameInput.addEventListener('input', checkCanStart);
p2NameInput.addEventListener('input', checkCanStart);

// Matter.js'in varsayılan doku boyutunu 256x256 olarak kabul ederiz.
// Fotoğrafı tam kaplaması için ölçeklendirme 1'e ayarlanır.
const spriteScale = (2 * ballRadius) / 256; 

function startGame() {
    // İsimleri al ve kaydet
    playerInfo.ball1.name = p1NameInput.value.trim() || 'Player 1';
    playerInfo.ball2.name = p2NameInput.value.trim() || 'Player 2';
    
    setupModal.style.display = 'none';
    
    // Render Kurulumu
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
    runner = Runner.create();
    Runner.run(runner, engine);

    // Duvarlar
    const wallThickness = 20;
    Composite.add(world, [
        Bodies.rectangle(arenaWidth / 2, wallThickness / 2, arenaWidth, wallThickness, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } }),
        Bodies.rectangle(arenaWidth / 2, arenaHeight - wallThickness / 2, arenaWidth, wallThickness, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } }),
        Bodies.rectangle(wallThickness / 2, arenaHeight / 2, wallThickness, arenaHeight, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } }),
        Bodies.rectangle(arenaWidth - wallThickness / 2, arenaHeight / 2, wallThickness, arenaHeight, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } })
    ]);
    
    // Topların Oluşturulması (Fotoğrafı kullan)
    const ballOptions = {
        restitution: 1.0,
        friction: 0.0,
        // ! DÜZELTME 2: Hızı korumak için hava sürtünmesini sıfırla
        frictionAir: 0.0, 
        density: 0.001,
        inertia: Infinity,
        angularVelocity: 0,
        angularSpin: 0,
    };

    ball1 = Bodies.circle(arenaWidth / 4, arenaHeight / 2, ballRadius, { 
        ...ballOptions, 
        label: 'ball1',
        render: {
            // ! DÜZELTME 1: Sprite ayarlarını basitleştirerek fotoğrafın gözükmesini sağla
            sprite: {
                texture: playerInfo.ball1.texture,
                xScale: spriteScale, 
                yScale: spriteScale
            }
        }
    });
    
    ball2 = Bodies.circle(arenaWidth * 3 / 4, arenaHeight / 2, ballRadius, { 
        ...ballOptions, 
        label: 'ball2',
        render: {
            sprite: {
                texture: playerInfo.ball2.texture,
                xScale: spriteScale,
                yScale: spriteScale
            }
        }
    });

    Composite.add(world, [ball1, ball2]);
    
    // Başlangıç Hızı
    Body.setVelocity(ball1, { x: MAX_SPEED, y: MAX_SPEED * (Math.random() > 0.5 ? 1 : -1) });
    Body.setVelocity(ball2, { x: -MAX_SPEED, y: MAX_SPEED * (Math.random() > 0.5 ? 1 : -1) });

    // Can ve İsimleri Güncelle
    updateHealthBar(playerInfo.ball1, maxHealth);
    updateHealthBar(playerInfo.ball2, maxHealth);
    
    // Oyun içi Eventleri Başlat
    setTimeout(spawnItem, 1000);
    Events.on(engine, 'afterUpdate', afterUpdateHandler);
    Events.on(engine, 'collisionStart', collisionStartHandler);
}

startGameButton.addEventListener('click', startGame);
restartButton.addEventListener('click', () => { location.reload(); });

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

// --- EVENT HANDLERS ---

// Topların sabit hızda kalmasını sağlama ve Vuruş Efekti
const afterUpdateHandler = function() {
    if (isGameOver) return; 

    if (currentItem) {
        itemEmojiDiv.style.left = `${currentItem.position.x}px`;
        itemEmojiDiv.style.top = `${currentItem.position.y}px`;
    }

    updateEmojiPosition(ball1, playerInfo.ball1.emoji);
    updateEmojiPosition(ball2, playerInfo.ball2.emoji);

    const checkSpeed = (ball) => {
        const speed = Math.sqrt(ball.velocity.x * ball.velocity.x + ball.velocity.y * ball.velocity.y);
        
        // ! KRİTİK DÜZELTME: Hız eşiğin altına düşerse tekrar hızlandır
        if (speed < MAX_SPEED) {
            const scaleFactor = MAX_SPEED / speed;
            Body.setVelocity(ball, { 
                x: ball.velocity.x * scaleFactor, 
                y: ball.velocity.y * scaleFactor 
            });
        }
        
        Body.setAngularVelocity(ball, 0);
    };

    checkSpeed(ball1);
    checkSpeed(ball2);
};

// Vuruş efekti kaldırma
function removeHitEffect(player, delay = 100) {
    setTimeout(() => {
        player.emoji.classList.remove('hit-effect');
    }, delay);
}

// Çarpışma ve can mantığı
const collisionStartHandler = function(event) {
    if (isGameOver) return;

    const pairs = event.pairs;

    pairs.forEach(pair => {
        const labels = [pair.bodyA.label, pair.bodyB.label];
        const isItemCollision = labels.includes('sword') || labels.includes('bomb');
        const isBallCollision = labels.includes('ball1') && labels.includes('ball2');

        if (isItemCollision && (labels.includes('ball1') || labels.includes('ball2'))) {
            const itemBody = pair.bodyA.label === 'sword' || pair.bodyA.label === 'bomb' ? pair.bodyA : pair.bodyB;
            const takerBall = pair.bodyA.label.startsWith('ball') ? pair.bodyA : pair.bodyB;
            const player = takerBall === ball1 ? playerInfo.ball1 : playerInfo.ball2;

            if (itemBody.label === 'sword') {
                playerInfo.ball1.hasSword = (takerBall === ball1);
                playerInfo.ball2.hasSword = (takerBall === ball2);

            } else if (itemBody.label === 'bomb') {
                player.health--;
                updateHealthBar(player, player.health);
                player.emoji.classList.add('hit-effect'); 
                removeHitEffect(player);

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

        if (isBallCollision) {
            const p1 = playerInfo.ball1;
            const p2 = playerInfo.ball2;

            let damageDealt = false;
            let damagedPlayer = null;
            
            if (p1.hasSword && !p2.hasSword) {
                p2.health--;
                p1.hasSword = false; 
                p1.swordIcon.style.display = 'none';
                damageDealt = true;
                damagedPlayer = p2;
            } else if (p2.hasSword && !p1.hasSword) {
                p1.health--;
                p2.hasSword = false; 
                p2.swordIcon.style.display = 'none';
                damageDealt = true;
                damagedPlayer = p1;
            } else if (p1.hasSword && p2.hasSword) {
                p1.hasSword = false;
                p2.hasSword = false;
                p1.swordIcon.style.display = 'none';
                p2.swordIcon.style.display = 'none';
                damageDealt = false; 
            }
            
            if (damageDealt) {
                updateHealthBar(p1, p1.health);
                updateHealthBar(p2, p2.health);
                
                damagedPlayer.emoji.classList.add('hit-effect'); 
                removeHitEffect(damagedPlayer);

                if (!currentItem) {
                    itemSpawnTimer = setTimeout(spawnItem, itemRespawnTime / 2); 
                }
            }

            if (p1.health <= 0) {
                endGame(playerInfo.ball2);
            } else if (p2.health <= 0) {
                endGame(playerInfo.ball1);
            }
        }
    });
};
