const { Engine, Render, Runner, Bodies, Composite, Events, Body } = Matter;

// --- AYARLAR ---
// Oyun karesi büyük olsun: 1000x700
const arenaWidth = 1000;
const arenaHeight = 700;
const ballRadius = 30;
const maxHealth = 3;
const itemSize = 40;
const itemRespawnTime = 3000; // Öğenin tekrar doğma süresi (ms)
const randomForceMagnitude = 0.008; // Topların sürekli hareket etmesi için itme gücü

// --- MOTOR VE ARENA KURULUMU ---
const engine = Engine.create();
const world = engine.world;
// Yerçekimini neredeyse sıfır yapalım ki, top yere düşüp kalmasın
world.gravity.y = 0.0001; 
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
Runner.run(Runner.create(), engine);

// Duvarlar (Arena Sınırları)
const wallThickness = 20;
Composite.add(world, [
    // Duvarların isStatic özelliği true olmalı
    Bodies.rectangle(arenaWidth / 2, wallThickness / 2, arenaWidth, wallThickness, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } }),
    Bodies.rectangle(arenaWidth / 2, arenaHeight - wallThickness / 2, arenaWidth, wallThickness, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } }),
    Bodies.rectangle(wallThickness / 2, arenaHeight / 2, wallThickness, arenaHeight, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } }),
    Bodies.rectangle(arenaWidth - wallThickness / 2, arenaHeight / 2, wallThickness, arenaHeight, { isStatic: true, label: 'wall', render: { fillStyle: '#333' } })
]);

// --- OYUNCU VE CAN SİSTEMİ ---
const playerInfo = {
    ball1: { health: maxHealth, hasSword: false, emoji: document.getElementById('ball1-emoji'), healthBar: document.getElementById('p1-health').querySelector('.health-bar') },
    ball2: { health: maxHealth, hasSword: false, emoji: document.getElementById('ball2-emoji'), healthBar: document.getElementById('p2-health').querySelector('.health-bar') }
};

// Toplar (Daha hızlı ve sürekli hareket için ayarlar)
const ballOptions = {
    restitution: 1.0,  // Enerji kaybı sıfır (duvarlardan tam zıplama)
    friction: 0.0,     // Yüzey sürtünmesi sıfır
    frictionAir: 0.005, // Hava sürtünmesi çok düşük
    density: 0.001,    // Hafif ve hızlı tepki verir
    render: { fillStyle: '#2196F3' }
};

const ball1 = Bodies.circle(arenaWidth / 4, arenaHeight / 2, ballRadius, { ...ballOptions, label: 'ball1' });
const ball2 = Bodies.circle(arenaWidth * 3 / 4, arenaHeight / 2, ballRadius, { ...ballOptions, render: { fillStyle: '#F44336' }, label: 'ball2' });

Composite.add(world, [ball1, ball2]);

// --- ÖĞE SİSTEMİ (Kılıç/Bomba) ---
let currentItem = null;
let currentItemType = null; // 'sword' veya 'bomb'
const itemEmojiDiv = document.getElementById('item-emoji');
let itemSpawnTimer = null;

function spawnItem() {
    // Rastgele konum
    const x = Math.random() * (arenaWidth - wallThickness * 4) + wallThickness * 2;
    const y = Math.random() * (arenaHeight - wallThickness * 4) + wallThickness * 2;

    // Kılıç (%50) veya Bomba (%50) düşsün
    currentItemType = Math.random() < 0.5 ? 'sword' : 'bomb';
    const emoji = currentItemType === 'sword' ? '⚔️' : '💣';
    const color = currentItemType === 'sword' ? '#FFD700' : '#444';

    currentItem = Bodies.circle(x, y, itemSize / 2, { // Top boyutunda olması için daire yapıldı
        isStatic: true, 
        render: { fillStyle: color },
        label: currentItemType
    });

    Composite.add(world, currentItem);
    itemEmojiDiv.textContent = emoji;
    itemEmojiDiv.style.display = 'block';
    
    // Timer'ı temizle (Çarpışma anında tekrar spawn etmemek için)
    clearTimeout(itemSpawnTimer);
}

// Oyuna başlarken ilk öğeyi düşür
setTimeout(spawnItem, 1000);

// --- GÖRSEL VE HAREKET GÜNCELLEMELERİ ---
function updateEmojiPosition(body, emojiDiv) {
    if (body) {
        emojiDiv.style.left = `${body.position.x}px`;
        emojiDiv.style.top = `${body.position.y}px`;
        
        // Kılıçlı top görsel animasyonu
        const p1 = playerInfo.ball1;
        const p2 = playerInfo.ball2;

        if ((body === ball1 && p1.hasSword) || (body === ball2 && p2.hasSword)) {
            // Hafif sallanma efekti
            emojiDiv.style.transform = `translate(-50%, -50%) rotate(${Math.sin(engine.timing.timestamp * 0.005) * 10}deg)`;
        } else {
            emojiDiv.style.transform = 'translate(-50%, -50%)';
        }
    }
}

function updateHealthBar(player, health) {
    const healthPercentage = (health / maxHealth) * 100;
    player.healthBar.style.width = `${healthPercentage}%`;
    
    if (healthPercentage <= 33) {
        player.healthBar.classList.add('low-health');
    } else {
        player.healthBar.classList.remove('low-health');
    }
}

// Rastgele hareket (Süratli dolaşsınlar)
Events.on(engine, 'afterUpdate', function() {
    updateEmojiPosition(ball1, playerInfo.ball1.emoji);
    updateEmojiPosition(ball2, playerInfo.ball2.emoji);
    updateEmojiPosition(currentItem, itemEmojiDiv);

    // Toplara sürekli rastgele itme uygula (Hız sınırlaması ile)
    const applyRandomForce = (ball) => {
        // Rastgele yönde itme
        Body.applyForce(ball, ball.position, { 
            x: (Math.random() - 0.5) * randomForceMagnitude, 
            y: (Math.random() - 0.5) * randomForceMagnitude 
        });
        
        // Çok hızlanmayı engelle
        const maxVelocitySquared = 50; 
        if (ball.velocity.x * ball.velocity.x + ball.velocity.y * ball.velocity.y > maxVelocitySquared) {
             const factor = Math.sqrt(maxVelocitySquared / (ball.velocity.x * ball.velocity.x + ball.velocity.y * ball.velocity.y));
             Body.setVelocity(ball, { x: ball.velocity.x * factor, y: ball.velocity.y * factor });
        }
    };

    applyRandomForce(ball1);
    applyRandomForce(ball2);
});

// --- ÇARPIŞMA MANTIKLARI ---
Events.on(engine, 'collisionStart', function(event) {
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
                // Kılıç alındı
                playerInfo.ball1.hasSword = (takerBall === ball1);
                playerInfo.ball2.hasSword = (takerBall === ball2);
                itemEmojiDiv.textContent = '⚔️'; 

            } else if (itemBody.label === 'bomb') {
                // Bombaya dokunanın canı gitsin
                player.health--;
                updateHealthBar(player, player.health);
                // Can gitme animasyonu: Kılıç takılıysa düşür
                if (player.hasSword) {
                     player.hasSword = false;
                     // Kılıç düştükten sonra yeniden spawn etme mantığı aktifleşsin
                }
            }

            // Öğeyi haritadan kaldır
            Composite.remove(world, currentItem);
            itemEmojiDiv.style.display = 'none';
            currentItem = null;

            // Öğeyi tekrar düşürmek için zamanlayıcı başlat
            itemSpawnTimer = setTimeout(spawnItem, itemRespawnTime);
        }

        // 2. Topların Birbirine Çarpışması
        if (isBallCollision) {
            const p1 = playerInfo.ball1;
            const p2 = playerInfo.ball2;

            let damageDealt = false;
            
            // Kılıçlı top, kılıçsız topa çarptıysa: Canı gider ve kılıç düşer
            if (p1.hasSword && !p2.hasSword) {
                p2.health--;
                p1.hasSword = false; // Kılıç düşer
                damageDealt = true;
            } else if (p2.hasSword && !p1.hasSword) {
                p1.health--;
                p2.hasSword = false; // Kılıç düşer
                damageDealt = true;
            } 
            
            // Kılıçlar kaybolsun, can gitmesin (Çarpışma anında kılıç düşer)
            else if (p1.hasSword && p2.hasSword) {
                p1.hasSword = false;
                p2.hasSword = false;
                damageDealt = false; // Can gitmedi
            }

            if (damageDealt) {
                updateHealthBar(p1, p1.health);
                updateHealthBar(p2, p2.health);
                
                // Kılıç düştüğü için yeni öğe düşürme zamanlayıcısı başlat
                if (!currentItem) {
                    itemSpawnTimer = setTimeout(spawnItem, itemRespawnTime / 2); 
                }
            }

            // Kazanan kontrolü
            if (p1.health <= 0) {
                alert("Player 2 (⚽) Kazandı! Sayfayı yenilemek için Tamam'a basın.");
                location.reload();
            } else if (p2.health <= 0) {
                alert("Player 1 (🇹🇷) Kazandı! Sayfayı yenilemek için Tamam'a basın.");
                location.reload();
            }
        }
    });
});

// Başlangıç can çubuklarını ayarla
updateHealthBar(playerInfo.ball1, maxHealth);
updateHealthBar(playerInfo.ball2, maxHealth);
