const { Engine, Render, Runner, Bodies, Composite, Events, Body } = Matter;

// --- AYARLAR ---
// Başlangıçta 900x900 kare kabul edilecek, ancak JS ile güncellenecek
let arenaWidth = 900; 
let arenaHeight = 900;
const INITIAL_BALL_RADIUS = 60;
const MAX_HEALTH = 5; // ! DÜZELTME: Can 5 yapıldı
const itemSize = 40;
const itemRespawnTime = 3000;
const MAX_SPEED = 8; 
let isGameOver = false;

// --- HTML ELEMANLARI ---
const setupModal = document.getElementById('setup-modal');
const startGameCustomButton = document.getElementById('start-custom-game-button'); // İsim değiştirildi
const customizeButton = document.getElementById('customize-button'); // Yeni alt buton
const p1NameInput = document.getElementById('p1-name-input');
const p2NameInput = document.getElementById('p2-name-input');
const p1FileInput = document.getElementById('p1-file');
const p2FileInput = document.getElementById('p2-file');
const p1Preview = document.getElementById('p1-preview');
const p2Preview = document.getElementById('p2-preview');

const p1NameDisplay = document.getElementById('p1-name-display');
const p2NameDisplay = document.getElementById('p2-name-display');
const photo1Div = document.getElementById('ball1-photo');
const photo2Div = document.getElementById('ball2-photo');
const itemEmojiDiv = document.getElementById('item-emoji');

const gameOverModal = document.getElementById('game-over-modal');
const winnerText = document.getElementById('winner-text');
const winnerEmoji = document.getElementById('winner-emoji');
const restartButton = document.getElementById('restart-button');
const newGameButton = document.getElementById('new-game-button'); // Yeni buton

// --- MATTER.JS DEĞİŞKENLERİ ---
const engine = Engine.create();
const world = engine.world;
world.gravity.y = 0; 
world.gravity.x = 0;
let runner = null; // Runner başlangıçta null

const gameContainer = document.getElementById('game-container');
let render = null;
let ball1, ball2;

// --- OYUNCU BİLGİLERİ ---
const playerInfo = {
    ball1: { health: MAX_HEALTH, hasSword: false, photoDiv: photo1Div, swordIcon: document.getElementById('p1-sword'), healthBar: document.getElementById('p1-health').querySelector('.health-bar'), nameDisplay: p1NameDisplay, name: 'Oyuncu 1', texture: './default-p1.png' }, // Varsayılan foto/isim
    ball2: { health: MAX_HEALTH, hasSword: false, photoDiv: photo2Div, swordIcon: document.getElementById('p2-sword'), healthBar: document.getElementById('p2-health').querySelector('.health-bar'), nameDisplay: p2NameDisplay, name: 'Oyuncu 2', texture: './default-p2.png' } // Varsayılan foto/isim
};

// --- RESPONSIVE VE ARENA YÖNETİMİ ---

function updateArenaSize() {
    // Game container'ın anlık boyutunu al
    arenaWidth = gameContainer.clientWidth;
    arenaHeight = gameContainer.clientHeight;
    
    // Render ve Canvas boyutunu güncelle
    if (render) {
        Render.stop(render);
        render.canvas.width = arenaWidth;
        render.canvas.height = arenaHeight;
        render.options.width = arenaWidth;
        render.options.height = arenaHeight;
        Render.run(render);
    }
}

// Duvarları yeniden oluşturma ve eski topları kaldırma
function setupWalls() {
    Composite.clear(world, false); 
    const wallThickness = 20;

    const walls = [
        Bodies.rectangle(arenaWidth / 2, wallThickness / 2, arenaWidth, wallThickness, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } }),
        Bodies.rectangle(arenaWidth / 2, arenaHeight - wallThickness / 2, arenaWidth, wallThickness, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } }),
        Bodies.rectangle(wallThickness / 2, arenaHeight / 2, wallThickness, arenaHeight, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } }),
        Bodies.rectangle(arenaWidth - wallThickness / 2, arenaHeight / 2, wallThickness, arenaHeight, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } })
    ];
    Composite.add(world, walls);
}

function initializeGame() {
    // Sadece ilk çağrıda Render oluşturulur
    if (!render) {
        render = Render.create({
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
        Events.on(engine, 'afterUpdate', afterUpdateHandler);
        Events.on(engine, 'collisionStart', collisionStartHandler);
    }
    
    // İlk çağrıda arena boyutunu ayarla
    updateArenaSize(); 
    setupWalls();
    
    // Runner'ı başlat/devam ettir
    Runner.run(runner, engine);
    isGameOver = false;

    // Oyuncu objelerini ve canlarını sıfırla
    playerInfo.ball1.health = MAX_HEALTH;
    playerInfo.ball2.health = MAX_HEALTH;
    playerInfo.ball1.hasSword = false;
    playerInfo.ball2.hasSword = false;
    
    // Topların oluşturulması
    const ballOptions = {
        restitution: 1.0,
        friction: 0.0, frictionAir: 0.0, density: 0.001, inertia: Infinity, angularVelocity: 0, angularSpin: 0,
        render: { fillStyle: 'transparent' }, 
        collisionFilter: { group: 0 } 
    };

    ball1 = Bodies.circle(arenaWidth / 4, arenaHeight / 2, INITIAL_BALL_RADIUS, { ...ballOptions, label: 'ball1' });
    ball2 = Bodies.circle(arenaWidth * 3 / 4, arenaHeight / 2, INITIAL_BALL_RADIUS, { ...ballOptions, label: 'ball2' });

    Composite.add(world, [ball1, ball2]);
    
    // CSS Fotoğraflarını Ayarla
    playerInfo.ball1.photoDiv.style.backgroundImage = `url(${playerInfo.ball1.texture})`;
    playerInfo.ball2.photoDiv.style.backgroundImage = `url(${playerInfo.ball2.texture})`;

    // Başlangıç Hızı
    Body.setVelocity(ball1, { x: MAX_SPEED, y: MAX_SPEED * (Math.random() > 0.5 ? 1 : -1) });
    Body.setVelocity(ball2, { x: -MAX_SPEED, y: MAX_SPEED * (Math.random() > 0.5 ? 1 : -1) });

    // Can ve İsimleri Güncelle
    updateHealthBar(playerInfo.ball1, MAX_HEALTH);
    updateHealthBar(playerInfo.ball2, MAX_HEALTH);

    // Eşya Sistemi
    setTimeout(spawnItem, 1000);
}

// Pencere boyutu değiştiğinde arenamızın boyutunu güncelle
window.addEventListener('resize', () => {
    updateArenaSize();
    setupWalls();
});

// --- OYUN MANTIK FONKSİYONLARI (Aynı Kaldı) ---

function updateHealthBar(player, health) {
    const healthPercentage = (health / MAX_HEALTH) * 100;
    player.healthBar.style.width = `${healthPercentage}%`;
    
    player.nameDisplay.textContent = `${player.name} Can: ${health}/${MAX_HEALTH}`;

    if (healthPercentage <= 33) {
        player.healthBar.classList.add('low-health');
    } else {
        player.healthBar.classList.remove('low-health');
    }
}

function updatePhotoPosition(body, photoDiv) {
    if (body) {
        photoDiv.style.left = `${body.position.x}px`;
        photoDiv.style.top = `${body.position.y}px`;
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

function removeHitEffect(player, delay = 100) {
    setTimeout(() => {
        player.photoDiv.classList.remove('hit-effect');
    }, delay);
}

function endGame(winnerPlayer) {
    if (isGameOver) return;
    isGameOver = true;
    
    Runner.stop(runner); 

    const winnerName = winnerPlayer.name;
    const winnerEmojiCode = winnerPlayer.texture.includes('default') ? '🏆' : ''; 

    winnerText.textContent = `${winnerName} KAZANDI!`;
    winnerEmoji.textContent = winnerEmojiCode;
    
    // Fotoğrafı kazanan modalına yerleştir
    winnerEmoji.style.backgroundImage = `url(${winnerPlayer.texture})`;
    winnerEmoji.style.borderRadius = '50%';
    winnerEmoji.style.backgroundSize = 'cover';
    winnerEmoji.textContent = ''; 

    gameOverModal.style.display = 'flex';
    
    if (currentItem) Composite.remove(world, currentItem);
    clearTimeout(itemSpawnTimer);
}

function spawnItem() {
    // ! DÜZELTME: Sadece Kılıç (Sword) spawn edilir, Bomba kaldırıldı
    const currentItemType = 'sword';
    const emoji = '⚔️';

    const x = Math.random() * (arenaWidth - 100) + 50;
    const y = Math.random() * (arenaHeight - 100) + 50;

    currentItem = Bodies.circle(x, y, itemSize / 2, { 
        isStatic: true, 
        render: { fillStyle: 'transparent' }, 
        label: currentItemType,
        collisionFilter: { group: 0 } 
    });

    Composite.add(world, currentItem);
    itemEmojiDiv.textContent = emoji;
    itemEmojiDiv.style.display = 'block';
    
    clearTimeout(itemSpawnTimer);
}

// --- EVENT HANDLERS ---

const afterUpdateHandler = function() {
    if (isGameOver) return; 

    if (currentItem) {
        itemEmojiDiv.style.left = `${currentItem.position.x}px`;
        itemEmojiDiv.style.top = `${currentItem.position.y}px`;
    }

    updatePhotoPosition(ball1, playerInfo.ball1.photoDiv);
    updatePhotoPosition(ball2, playerInfo.ball2.photoDiv);

    const checkSpeed = (ball) => {
        const speed = Math.sqrt(ball.velocity.x * ball.velocity.x + ball.velocity.y * ball.velocity.y);
        
        if (speed < MAX_SPEED) {
            const scaleFactor = MAX_SPEED / speed;
            Body.setVelocity(ball, { x: ball.velocity.x * scaleFactor, y: ball.velocity.y * scaleFactor });
        }
        Body.setAngularVelocity(ball, 0);
    };

    checkSpeed(ball1);
    checkSpeed(ball2);
};

const collisionStartHandler = function(event) {
    if (isGameOver) return;

    const pairs = event.pairs;

    pairs.forEach(pair => {
        const labels = [pair.bodyA.label, pair.bodyB.label];
        const isItemCollision = labels.includes('sword'); // ! Bomba kaldırıldı
        const isBallCollision = labels.includes('ball1') && labels.includes('ball2');

        // 1. Öğe Alma Mantığı
        if (isItemCollision && (labels.includes('ball1') || labels.includes('ball2'))) {
            const itemBody = pair.bodyA.label === 'sword' ? pair.bodyA : pair.bodyB;
            const takerBall = pair.bodyA.label.startsWith('ball') ? pair.bodyA : pair.bodyB;

            // Kılıç alma
            if (itemBody.label === 'sword') {
                playerInfo.ball1.hasSword = (takerBall === ball1);
                playerInfo.ball2.hasSword = (takerBall === ball2);
            }
            // Bomba yok, bu yüzden başka bir item mantığı yok
            
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
                
                damagedPlayer.photoDiv.classList.add('hit-effect'); 
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

// --- ÖZELLEŞTİRME VE AKIŞ YÖNETİMİ ---

function setupFileReader(fileInput, previewDiv, player) {
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const url = e.target.result;
                previewDiv.style.backgroundImage = `url(${url})`;
                player.texture = url;
                checkCanStartCustom();
            };
            reader.readAsDataURL(file);
        }
    });
}

function checkCanStartCustom() {
    const p1Ready = p1NameInput.value.trim() !== '' && p1Preview.style.backgroundImage !== '';
    const p2Ready = p2NameInput.value.trim() !== '' && p2Preview.style.backgroundImage !== '';
    startGameCustomButton.disabled = !(p1Ready && p2Ready);
}

setupFileReader(p1FileInput, p1Preview, playerInfo.ball1);
setupFileReader(p2FileInput, p2Preview, playerInfo.ball2);
p1NameInput.addEventListener('input', checkCanStartCustom);
p2NameInput.addEventListener('input', checkCanStartCustom);


// --- Buton Aksiyonları ---

// 1. Yeni Oyun Kur / Özelleştirme Butonu
customizeButton.addEventListener('click', () => {
    // Modal açıldığında Runner'ı durdur
    Runner.stop(runner); 
    setupModal.style.display = 'flex';
});

// 2. Özelleştirilmiş Oyunu Başlat
startGameCustomButton.addEventListener('click', () => {
    // Yeni ayarları global playerInfo'ya uygula
    playerInfo.ball1.name = p1NameInput.value.trim();
    playerInfo.ball2.name = p2NameInput.value.trim();
    // Texture zaten setupFileReader içinde güncelleniyor.

    setupModal.style.display = 'none';
    
    // Gerekirse eski topları kaldır
    if (ball1 && ball2) {
        Composite.remove(world, [ball1, ball2]);
        clearTimeout(itemSpawnTimer);
        itemEmojiDiv.style.display = 'none';
    }
    
    initializeGame();
});

// 3. Oyun Bitti: Yeniden Başlat (Aynı ayarlar)
restartButton.addEventListener('click', () => {
    gameOverModal.style.display = 'none';
    
    // Gerekirse eski topları kaldır
    Composite.remove(world, [ball1, ball2]);
    clearTimeout(itemSpawnTimer);
    itemEmojiDiv.style.display = 'none';
    
    initializeGame();
});

// 4. Oyun Bitti: Yeni Oyun Kur (Özelleştirme modalını aç)
newGameButton.addEventListener('click', () => {
    gameOverModal.style.display = 'none';
    
    // Modal açıldığında runner'ı durduracak
    customizeButton.click(); 
});


// --- Başlangıç ---
// Sayfa yüklendiğinde varsayılan ayarlar ile oyunu başlat
initializeGame();
