const { Engine, Render, Runner, Bodies, Composite, Events, Body } = Matter;

// --- AYARLAR ---
let arenaWidth = 800; // Varsayılan değerler
let arenaHeight = 800;
let INITIAL_BALL_RADIUS = 40;
const MAX_HEALTH = 5; 
const itemSize = 40;
const itemRespawnTime = 3000;
const MAX_SPEED = 8; 
let isGameOver = false;
let runner = null;

// --- HTML ELEMANLARI ---
const setupModal = document.getElementById('setup-modal');
const startGameCustomButton = document.getElementById('start-custom-game-button'); 
const customizeButton = document.getElementById('customize-button'); 
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
const newGameButton = document.getElementById('new-game-button'); 

// --- MATTER.JS DEĞİŞKENLERİ ---
const engine = Engine.create();
const world = engine.world;
world.gravity.y = 0; 
world.gravity.x = 0;
let runner = null; 

const gameContainer = document.getElementById('game-container');
let render = null;
let ball1, ball2;

// --- OYUNCU BİLGİLERİ ---
const playerInfo = {
    ball1: { 
        health: MAX_HEALTH, 
        hasSword: false, 
        photoDiv: photo1Div, 
        swordIcon: document.getElementById('p1-sword'), 
        healthBar: document.getElementById('p1-health').querySelector('.health-bar'), 
        nameDisplay: p1NameDisplay, 
        name: 'Oyuncu 1', 
        texture: '',
        emoji: '🔴',
        color: getRandomColor()
    }, 
    ball2: { 
        health: MAX_HEALTH, 
        hasSword: false, 
        photoDiv: photo2Div, 
        swordIcon: document.getElementById('p2-sword'), 
        healthBar: document.getElementById('p2-health').querySelector('.health-bar'), 
        nameDisplay: p2NameDisplay, 
        name: 'Oyuncu 2', 
        texture: '',
        emoji: '🔵',
        color: getRandomColor()
    } 
};

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// --- RESPONSIVE VE ARENA YÖNETİMİ ---

function updateArenaSize() {
    const container = document.getElementById('game-container');
    const size = Math.min(container.clientWidth, container.clientHeight);
    
    // Arena boyutlarını güncelle
    arenaWidth = size;
    arenaHeight = size;
    
    // Top yarıçapını ekran boyutuna göre ayarla
    INITIAL_BALL_RADIUS = size * 0.08; // Ekran boyutunun %8'i kadar yarıçap
    
    // Render ve Canvas boyutunu güncelle
    if (render) {
        Render.stop(render);
        render.canvas.width = arenaWidth;
        render.canvas.height = arenaHeight;
        render.options.width = arenaWidth;
        render.options.height = arenaHeight;
        Render.run(render);
    }
    
    // Top boyutlarını güncelle
    if (ball1 && ball2) {
        Body.set(ball1, {
            circleRadius: INITIAL_BALL_RADIUS
        });
        Body.set(ball2, {
            circleRadius: INITIAL_BALL_RADIUS
        });
    }
    
    // Duvarları yeniden oluştur
    setupWalls();
}

function setupWalls() {
    // Sadece duvarları temizle, topları initializeGame halledecek
    Composite.allBodies(world).forEach(body => {
        if (body.label === 'wall' || body.label === 'sword') {
             Composite.remove(world, body);
        }
    });

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
    // Engine'i sıfırla
    if (engine) {
        Engine.clear(engine);
    }
    
    // Yeni bir engine oluştur
    engine = Engine.create();
    world = engine.world;
    world.gravity.y = 0;
    world.gravity.x = 0;
    
    // Runner'ı başlat
    if (runner) {
        Runner.stop(runner);
    }
    runner = Runner.create();
    
    // Event listener'ları ekle
    Events.on(engine, 'afterUpdate', afterUpdateHandler);
    Events.on(engine, 'collisionStart', collisionStartHandler);
    
    // Ekran boyutunu güncelle
    updateArenaSize();
    
    // Render yoksa oluştur, varsa güncelle
    if (!render) {
        render = Render.create({
            element: gameContainer,
            engine: engine,
            options: {
                width: arenaWidth,
                height: arenaHeight,
                wireframes: false,
                background: 'transparent',
                showAngleIndicator: false
            }
        });
        Render.run(render);
    } else {
        // Mevcut render'ı güncelle
        render.options.width = arenaWidth;
        render.options.height = arenaHeight;
        Render.setPixelRatio(render, window.devicePixelRatio);
    }
    
    // Eski top ve eşyaları temizle
    if (ball1 && ball2) {
        Composite.remove(world, [ball1, ball2]);
        ball1 = null; ball2 = null;
    }
    if (currentItem) {
        Composite.remove(world, currentItem);
        currentItem = null;
    }
    clearTimeout(itemSpawnTimer);
    itemEmojiDiv.style.display = 'none';

    // Arena ve Duvarları sıfırla
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
        restitution: 0.9,
        friction: 0.005,
        frictionAir: 0.01,
        density: 0.5,
        inertia: Infinity,
        render: { 
            fillStyle: 'transparent',
            strokeStyle: 'transparent'
        },
        collisionFilter: { 
            group: 0,
            category: 0x0001,
            mask: 0xFFFFFFFF
        }
    };

    // Topları oluştur
    ball1 = Bodies.circle(
        arenaWidth / 4, 
        arenaHeight / 2, 
        INITIAL_BALL_RADIUS, 
        { 
            ...ballOptions, 
            label: 'ball1',
            mass: 10,
            inverseMass: 1/10
        }
    );

    ball2 = Bodies.circle(
        arenaWidth * 3 / 4, 
        arenaHeight / 2, 
        INITIAL_BALL_RADIUS, 
        { 
            ...ballOptions, 
            label: 'ball2',
            mass: 10,
            inverseMass: 1/10
        }
    );

    // Topları dünyaya ekle
    Composite.add(world, [ball1, ball2]);
    
    // Fizik motorunu başlat
    Engine.update(engine);
    
    // CSS Fotoğraflarını Ayarla
    // ! DÜZELTME 2: Fotoğraf yolları yoksa div'i temizle
    playerInfo.ball1.photoDiv.style.backgroundImage = playerInfo.ball1.texture ? `url(${playerInfo.ball1.texture})` : 'none';
    playerInfo.ball2.photoDiv.style.backgroundImage = playerInfo.ball2.texture ? `url(${playerInfo.ball2.texture})` : 'none';


    // Başlangıç Hızı (daha yüksek hız)
    const speed = MAX_SPEED * 2;
    Body.setVelocity(ball1, { 
        x: speed, 
        y: speed * (Math.random() > 0.5 ? 1 : -0.5) 
    });
    Body.setVelocity(ball2, { 
        x: -speed, 
        y: speed * (Math.random() > 0.5 ? 1 : -0.5) 
    });
    
    // Açısal hızı sıfırla
    Body.setAngularVelocity(ball1, 0);
    Body.setAngularVelocity(ball2, 0);

    // Can ve İsimleri Güncelle
    updateHealthBar(playerInfo.ball1, MAX_HEALTH);
    updateHealthBar(playerInfo.ball2, MAX_HEALTH);
    
    // Top boyutlarını güncelle
    if (ball1 && ball2) {
        Body.set(ball1, {
            circleRadius: INITIAL_BALL_RADIUS
        });
        Body.set(ball2, {
            circleRadius: INITIAL_BALL_RADIUS
        });
    }

    // Eşya Sistemi
    setTimeout(spawnItem, 1000);
}

// Pencere boyutu değiştiğinde arenamızın boyutunu güncelle
const resizeObserver = new ResizeObserver(entries => {
    // Önceki boyutları sakla
    const oldArenaWidth = arenaWidth;
    const oldArenaHeight = arenaHeight;
    
    // Yeni boyutları güncelle
    updateArenaSize();
    
    // Eğer toplar varsa, oranlı olarak konumlarını güncelle
    if (ball1 && ball2) {
        const scaleX = arenaWidth / oldArenaWidth;
        const scaleY = arenaHeight / oldArenaHeight;
        
        Body.setPosition(ball1, {
            x: ball1.position.x * scaleX,
            y: ball1.position.y * scaleY
        });
        
        Body.setPosition(ball2, {
            x: ball2.position.x * scaleX,
            y: ball2.position.y * scaleY
        });
    }
});

// İlk yüklemede boyutları ayarla
window.addEventListener('load', () => {
    updateArenaSize();
    
    // Oyunu başlatmak için küçük bir gecikme ekle
    setTimeout(() => {
        const startBtn = document.getElementById('start-custom-game-button');
        if (startBtn) startBtn.click();
    }, 500);
});

// --- OYUN MANTIK FONKSİYONLARI (Değişmedi) ---

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
    
    // ! Runner'ı kesinlikle durdur
    if (runner) Runner.stop(runner); 

    const winnerName = winnerPlayer.name;
    
    winnerText.textContent = `${winnerName} KAZANDI!`;
    
    // Kazananın görselini ayarla
    if (winnerPlayer.texture) {
        winnerEmoji.style.backgroundImage = `url(${winnerPlayer.texture})`;
        winnerEmoji.style.borderRadius = '50%';
        winnerEmoji.style.backgroundSize = 'cover';
        winnerEmoji.textContent = '';
    } else {
        winnerEmoji.style.backgroundImage = 'none';
        winnerEmoji.style.backgroundColor = winnerPlayer.color;
        winnerEmoji.style.borderRadius = '50%';
        winnerEmoji.style.display = 'flex';
        winnerEmoji.style.justifyContent = 'center';
        winnerEmoji.style.alignItems = 'center';
        winnerEmoji.style.fontSize = '60px';
        winnerEmoji.textContent = winnerPlayer.emoji;
    }

    gameOverModal.style.display = 'flex';
    
    if (currentItem) Composite.remove(world, currentItem);
    clearTimeout(itemSpawnTimer);
}

function spawnItem() {
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
        const isItemCollision = labels.includes('sword'); 
        const isBallCollision = labels.includes('ball1') && labels.includes('ball2');

        // 1. Öğe Alma Mantığı
        if (isItemCollision && (labels.includes('ball1') || labels.includes('ball2'))) {
            const itemBody = pair.bodyA.label === 'sword' ? pair.bodyA : pair.bodyB;
            const takerBall = pair.bodyA.label.startsWith('ball') ? pair.bodyA : pair.bodyB;

            if (itemBody.label === 'sword') {
                playerInfo.ball1.hasSword = (takerBall === ball1);
                playerInfo.ball2.hasSword = (takerBall === ball2);
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
    // Sadece isimlerin dolu olması yeterli
    const p1Ready = p1NameInput.value.trim() !== '';
    const p2Ready = p2NameInput.value.trim() !== '';
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
    if (runner) Runner.stop(runner); 
    setupModal.style.display = 'flex';
    
    // Mevcut oyuncu bilgilerini form alanlarına yükle
    p1NameInput.value = playerInfo.ball1.name;
    p2NameInput.value = playerInfo.ball2.name;
    
    // Önizlemeleri sıfırla
    p1Preview.style.backgroundImage = playerInfo.ball1.texture ? `url(${playerInfo.ball1.texture})` : 'none';
    p2Preview.style.backgroundImage = playerInfo.ball2.texture ? `url(${playerInfo.ball2.texture})` : 'none';
    
    // Başlat butonunu kontrol et
    checkCanStartCustom();
});

// 2. Özelleştirilmiş Oyunu Başlat
startGameCustomButton.addEventListener('click', () => {
    // Modalı kapat
    setupModal.style.display = 'none';
    
    // Oyun alanını temizle
    gameOverModal.style.display = 'none';
    
    // Oyuncu isimlerini güncelle
    playerInfo.ball1.name = p1NameInput.value.trim() || 'Oyuncu 1';
    playerInfo.ball2.name = p2NameInput.value.trim() || 'Oyuncu 2';
    
    // Eğer fotoğraf seçilmediyse rastgele renk ata
    if (!playerInfo.ball1.texture) {
        playerInfo.ball1.color = getRandomColor();
        playerInfo.ball1.photoDiv.style.backgroundColor = playerInfo.ball1.color;
        playerInfo.ball1.photoDiv.textContent = playerInfo.ball1.emoji;
        playerInfo.ball1.photoDiv.style.display = 'flex';
        playerInfo.ball1.photoDiv.style.justifyContent = 'center';
        playerInfo.ball1.photoDiv.style.alignItems = 'center';
        playerInfo.ball1.photoDiv.style.fontSize = '60px';
    }
    
    if (!playerInfo.ball2.texture) {
        playerInfo.ball2.color = getRandomColor();
        playerInfo.ball2.photoDiv.style.backgroundColor = playerInfo.ball2.color;
        playerInfo.ball2.photoDiv.textContent = playerInfo.ball2.emoji;
        playerInfo.ball2.photoDiv.style.display = 'flex';
        playerInfo.ball2.photoDiv.style.justifyContent = 'center';
        playerInfo.ball2.photoDiv.style.alignItems = 'center';
        playerInfo.ball2.photoDiv.style.fontSize = '60px';
    }
    // Oyuncu isimlerini güncelle
    playerInfo.ball1.name = p1NameInput.value.trim() || 'Oyuncu 1';
    playerInfo.ball2.name = p2NameInput.value.trim() || 'Oyuncu 2';
    
    // Eğer fotoğraf seçilmediyse rastgele renk ata
    if (!playerInfo.ball1.texture) {
        playerInfo.ball1.color = getRandomColor();
        playerInfo.ball1.photoDiv.style.backgroundColor = playerInfo.ball1.color;
        playerInfo.ball1.photoDiv.textContent = playerInfo.ball1.emoji;
        playerInfo.ball1.photoDiv.style.display = 'flex';
        playerInfo.ball1.photoDiv.style.justifyContent = 'center';
        playerInfo.ball1.photoDiv.style.alignItems = 'center';
        playerInfo.ball1.photoDiv.style.fontSize = '60px';
    }
    
    if (!playerInfo.ball2.texture) {
        playerInfo.ball2.color = getRandomColor();
        playerInfo.ball2.photoDiv.style.backgroundColor = playerInfo.ball2.color;
        playerInfo.ball2.photoDiv.textContent = playerInfo.ball2.emoji;
        playerInfo.ball2.photoDiv.style.display = 'flex';
        playerInfo.ball2.photoDiv.style.justifyContent = 'center';
        playerInfo.ball2.photoDiv.style.alignItems = 'center';
        playerInfo.ball2.photoDiv.style.fontSize = '60px';
    }
    // Yeni ayarları global playerInfo'ya uygula
    playerInfo.ball1.name = p1NameInput.value.trim();
    playerInfo.ball2.name = p2NameInput.value.trim();
    
    // Texture zaten setupFileReader içinde güncelleniyor.
    
    setupModal.style.display = 'none';
    
    // Oyunu yeni ayarlar ile başlat
    initializeGame();
});

// 3. Oyun Bitti: Yeniden Başlat (Aynı ayarlar)
restartButton.addEventListener('click', () => {
    gameOverModal.style.display = 'none';
    
    // Tekrar başlat
    initializeGame();
});

// 4. Oyun Bitti: Yeni Oyun Kur (Özelleştirme modalını aç)
newGameButton.addEventListener('click', () => {
    gameOverModal.style.display = 'none';
    setupModal.style.display = 'flex';
});

// Oyunu sıfırla ve yeni oyun başlat
function resetGame() {
    // Oyun durumunu sıfırla
    isGameOver = false;
    gameOverModal.style.display = 'none';
    
    // Oyuncu bilgilerini sıfırla
    playerInfo.ball1.health = MAX_HEALTH;
    playerInfo.ball2.health = MAX_HEALTH;
    playerInfo.ball1.hasSword = false;
    playerInfo.ball2.hasSword = false;
    
    // Oyunu başlat
    initializeGame();
}

document.addEventListener('DOMContentLoaded', () => {
    // Yeni oyun butonu
    document.getElementById('new-game-button').addEventListener('click', () => {
        gameOverModal.style.display = 'none';
        setupModal.style.display = 'flex';
    });
    
    // Tekrar oyna butonu
    document.getElementById('restart-button').addEventListener('click', resetGame);
});

// --- Başlangıç ---
// Sayfa yüklendiğinde varsayılan ayarlar ile oyunu başlat
// initializeGame(); // Bu satırı kaldırdık, ilk açılışta boş başlamalı.
