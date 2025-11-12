const { Engine, Render, Runner, Bodies, Composite, Events } = Matter;

// Motoru oluştur
const engine = Engine.create();
const world = engine.world;

// Oyun kapsayıcısını ve canvas'ı oluştur
const gameContainer = document.getElementById('game-container');
const arenaWidth = 800;
const arenaHeight = 600;

const render = Render.create({
    element: gameContainer,
    engine: engine,
    options: {
        width: arenaWidth,
        height: arenaHeight,
        wireframes: false, // Gerçekçi görünüm için wireframes'ı kapat
        background: 'transparent' // Canvas arkaplanı CSS'ten gelecek
    }
});

Render.run(render);
const runner = Runner.create();
Runner.run(runner, engine);

// Duvarları oluştur (büyük kare arena)
const wallThickness = 20;
Composite.add(world, [
    // Üst duvar
    Bodies.rectangle(arenaWidth / 2, wallThickness / 2, arenaWidth, wallThickness, { isStatic: true, render: { fillStyle: '#666' } }),
    // Alt duvar
    Bodies.rectangle(arenaWidth / 2, arenaHeight - wallThickness / 2, arenaWidth, wallThickness, { isStatic: true, render: { fillStyle: '#666' } }),
    // Sol duvar
    Bodies.rectangle(wallThickness / 2, arenaHeight / 2, wallThickness, arenaHeight, { isStatic: true, render: { fillStyle: '#666' } }),
    // Sağ duvar
    Bodies.rectangle(arenaWidth - wallThickness / 2, arenaHeight / 2, wallThickness, arenaHeight, { isStatic: true, render: { fillStyle: '#666' } })
]);

// Toplar
const ballRadius = 25;
const ball1 = Bodies.circle(arenaWidth / 4, arenaHeight / 2, ballRadius, {
    restitution: 0.8, // Zıplama oranı
    friction: 0.05,    // Sürtünme
    density: 0.002,    // Kütle
    render: {
        fillStyle: 'blue' // Topun iç rengi
    }
});

const ball2 = Bodies.circle(arenaWidth * 3 / 4, arenaHeight / 2, ballRadius, {
    restitution: 0.8,
    friction: 0.05,
    density: 0.002,
    render: {
        fillStyle: 'red' // Topun iç rengi
    }
});

Composite.add(world, [ball1, ball2]);

// Emojileri topun üzerine yerleştir
const ball1EmojiDiv = document.getElementById('ball1-emoji');
const ball2EmojiDiv = document.getElementById('ball2-emoji');
const swordEmojiDiv = document.getElementById('sword-emoji');

// Emojileri buraya değiştirin!
ball1EmojiDiv.textContent = '🔵'; // Mavi top için emoji
ball2EmojiDiv.textContent = '🔴'; // Kırmızı top için emoji

// Kılıç objesi
const swordWidth = 10;
const swordHeight = 40;
let sword = null; // Kılıç objesi başlangıçta yok

function spawnSword() {
    // Rastgele bir konumda kılıcı oluştur
    const x = Math.random() * (arenaWidth - wallThickness * 2 - swordWidth) + wallThickness + swordWidth / 2;
    const y = Math.random() * (arenaHeight - wallThickness * 2 - swordHeight) + wallThickness + swordHeight / 2;

    sword = Bodies.rectangle(x, y, swordWidth, swordHeight, {
        isStatic: true, // Şimdilik sabit kalsın, alınca dinamikleşebilir
        render: {
            fillStyle: '#FFD700' // Altın rengi
        },
        label: 'sword' // Çarpışmaları yakalamak için etiket
    });
    Composite.add(world, sword);
    swordEmojiDiv.style.display = 'block'; // Emojiyi görünür yap
    updateEmojiPosition(sword, swordEmojiDiv); // Konumunu güncelle
}

spawnSword(); // Oyuna başlarken bir kılıç düşür

// Objelerin pozisyonlarını güncelleyerek emojileri hareket ettir
Events.on(engine, 'afterUpdate', function() {
    updateEmojiPosition(ball1, ball1EmojiDiv);
    updateEmojiPosition(ball2, ball2EmojiDiv);
    if (sword) {
        updateEmojiPosition(sword, swordEmojiDiv);
    }

    // Basit bir hareket ekleyelim (örneğin rastgele kuvvet uygulayarak veya klavye ile)
    // Bu kısım oyuncu kontrolü veya daha karmaşık AI için genişletilebilir
    if (Math.random() < 0.05) { // Her frame %5 ihtimalle rastgele bir itme uygula
        Matter.Body.applyForce(ball1, ball1.position, { x: (Math.random() - 0.5) * 0.05, y: (Math.random() - 0.5) * 0.05 });
        Matter.Body.applyForce(ball2, ball2.position, { x: (Math.random() - 0.5) * 0.05, y: (Math.random() - 0.5) * 0.05 });
    }
});

function updateEmojiPosition(body, emojiDiv) {
    if (body) {
        emojiDiv.style.left = `${body.position.x}px`;
        emojiDiv.style.top = `${body.position.y}px`;
    }
}

// Can sistemi (şimdilik sadece başlangıç değerleri)
let ball1Health = 3;
let ball2Health = 3;

// Kılıç sahibi (henüz yok)
let ball1HasSword = false;
let ball2HasSword = false;

// Çarpışma algılama (Kılıç alma)
Events.on(engine, 'collisionStart', function(event) {
    const pairs = event.pairs;

    pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;

        // Kılıç alma kontrolü
        if (bodyA.label === 'sword' && (bodyB === ball1 || bodyB === ball2)) {
            const takerBall = (bodyB === ball1) ? ball1 : ball2;
            const takerBallEmojiDiv = (bodyB === ball1) ? ball1EmojiDiv : ball2EmojiDiv;
            const otherBall = (bodyB === ball1) ? ball2 : ball1;

            if (takerBall === ball1) {
                ball1HasSword = true;
                ball2HasSword = false; // Diğer top kılıcı kaybeder
            } else {
                ball2HasSword = true;
                ball1HasSword = false; // Diğer top kılıcı kaybeder
            }

            Composite.remove(world, sword); // Kılıcı haritadan kaldır
            sword = null; // Kılıç objesini sıfırla
            swordEmojiDiv.style.display = 'none'; // Emojiyi gizle

            // Topun üzerine kılıç emojisi ekleyelim (görsel olarak)
            takerBallEmojiDiv.textContent += '⚔️'; // Geçici olarak emoji ekle
            
            // Kılıç alındıktan sonra belirli bir süre sonra tekrar spawn et
            setTimeout(() => {
                // Sadece başka bir top kılıcı almadıysa spawn et
                if (!ball1HasSword && !ball2HasSword) {
                    spawnSword();
                }
            }, 5000); // 5 saniye sonra tekrar kılıç düşsün

        } else if (bodyB.label === 'sword' && (bodyA === ball1 || bodyA === ball2)) {
            // Yukarıdaki ile aynı mantık, tersi durum
            const takerBall = (bodyA === ball1) ? ball1 : ball2;
            const takerBallEmojiDiv = (bodyA === ball1) ? ball1EmojiDiv : ball2EmojiDiv;
            const otherBall = (bodyA === ball1) ? ball2 : ball1;

            if (takerBall === ball1) {
                ball1HasSword = true;
                ball2HasSword = false;
            } else {
                ball2HasSword = true;
                ball1HasSword = false;
            }

            Composite.remove(world, sword);
            sword = null;
            swordEmojiDiv.style.display = 'none';
            takerBallEmojiDiv.textContent += '⚔️'; 

            setTimeout(() => {
                if (!ball1HasSword && !ball2HasSword) {
                    spawnSword();
                }
            }, 5000);
        }

        // Topların birbirine çarpışması ve can mekaniği (burada genişletilecek)
        if ((bodyA === ball1 && bodyB === ball2) || (bodyA === ball2 && bodyB === ball1)) {
            // Eğer iki top da kılıçlıysa
            if (ball1HasSword && ball2HasSword) {
                console.log("İki kılıçlı top çarpıştı! Kılıçlar düşüyor.");
                // Kılıçları düşür
                ball1HasSword = false;
                ball2HasSword = false;
                // Emojilerden kılıç sembolünü kaldır
                ball1EmojiDiv.textContent = ball1EmojiDiv.textContent.replace('⚔️', '');
                ball2EmojiDiv.textContent = ball2EmojiDiv.textContent.replace('⚔️', '');
                // Yeni kılıç spawn et
                setTimeout(() => spawnSword(), 1000); // 1 saniye sonra yeni kılıç düşür
            }
            // Sadece bir top kılıçlıysa ve diğerine çarptıysa can gitmeli
            else if (ball1HasSword && !ball2HasSword) {
                ball2Health--;
                console.log(`Ball 1 vurdu! Ball 2 can: ${ball2Health}`);
                // Kılıcı düşür
                ball1HasSword = false;
                ball1EmojiDiv.textContent = ball1EmojiDiv.textContent.replace('⚔️', '');
                setTimeout(() => spawnSword(), 1000); // 1 saniye sonra yeni kılıç düşür
                if (ball2Health <= 0) {
                    alert("Mavi Top Kazandı!");
                    location.reload(); // Oyunu yeniden başlat
                }
            } else if (ball2HasSword && !ball1HasSword) {
                ball1Health--;
                console.log(`Ball 2 vurdu! Ball 1 can: ${ball1Health}`);
                // Kılıcı düşür
                ball2HasSword = false;
                ball2EmojiDiv.textContent = ball2EmojiDiv.textContent.replace('⚔️', '');
                setTimeout(() => spawnSword(), 1000); // 1 saniye sonra yeni kılıç düşür
                if (ball1Health <= 0) {
                    alert("Kırmızı Top Kazandı!");
                    location.reload(); // Oyunu yeniden başlat
                }
            }
        }
    });
});

// Klavye kontrolü için placeholder (bu kısım daha detaylı geliştirilebilir)
document.addEventListener('keydown', (event) => {
    const forceMagnitude = 0.005;
    switch (event.key) {
        // Ball 1 kontrolü (örneğin W,A,S,D)
        case 'w':
            Matter.Body.applyForce(ball1, ball1.position, { x: 0, y: -forceMagnitude });
            break;
        case 's':
            Matter.Body.applyForce(ball1, ball1.position, { x: 0, y: forceMagnitude });
            break;
        case 'a':
            Matter.Body.applyForce(ball1, ball1.position, { x: -forceMagnitude, y: 0 });
            break;
        case 'd':
            Matter.Body.applyForce(ball1, ball1.position, { x: forceMagnitude, y: 0 });
            break;
        // Ball 2 kontrolü (örneğin Ok Tuşları)
        case 'ArrowUp':
            Matter.Body.applyForce(ball2, ball2.position, { x: 0, y: -forceMagnitude });
            break;
        case 'ArrowDown':
            Matter.Body.applyForce(ball2, ball2.position, { x: 0, y: forceMagnitude });
            break;
        case 'ArrowLeft':
            Matter.Body.applyForce(ball2, ball2.position, { x: -forceMagnitude, y: 0 });
            break;
        case 'ArrowRight':
            Matter.Body.applyForce(ball2, ball2.position, { x: forceMagnitude, y: 0 });
            break;
    }
});
