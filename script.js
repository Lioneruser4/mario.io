const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusElement = document.getElementById('status');
const startButton = document.getElementById('start-button');
const videoContainer = document.getElementById('video-container');

let model = null;
let lastPersonPosition = {}; // Son tespit edilen insan konumlarını saklamak için
const MOVEMENT_THRESHOLD = 20; // Hareket eşiği (piksellerde)

// Kamerayı Başlatma Fonksiyonu
async function setupWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            'video': {
                facingMode: 'environment' // Arka kamerayı tercih et (mobil cihazlar için)
            }
        });
        video.srcObject = stream;
        
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                resolve();
            };
        });
    } catch (error) {
        console.error("Kamera erişim hatası: ", error);
        statusElement.innerText = "HATA: Kamera erişimine izin vermeniz gerekiyor.";
        alert("Kamera erişimi engellendi. Lütfen izinleri kontrol edin.");
    }
}

// Modeli Yükleme ve Uygulamayı Başlatma (Butonla çağrılır)
async function loadModelAndStart() {
    startButton.style.display = 'none';
    statusElement.innerText = 'Model yükleniyor... Bu biraz zaman alabilir.';

    // 1. Modeli Yükle
    try {
        // COCO-SSD modelini yükle
        model = await cocoSsd.load();
        statusElement.innerText = 'Model yüklendi. Kamera başlatılıyor...';
    } catch (e) {
        statusElement.innerText = 'HATA: Model yüklenirken bir sorun oluştu.';
        console.error(e);
        startButton.style.display = 'block';
        return;
    }

    // 2. Kamerayı Başlat
    await setupWebcam();
    
    // Video yüklendiğinde boyutları ayarla
    video.width = video.videoWidth;
    video.height = video.videoHeight;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Arayüzü göster
    videoContainer.style.display = 'block';
    statusElement.innerText = 'Gerçek zamanlı nesne tespiti başladı.';
    
    // Tespit döngüsünü başlat
    detectFrame();
}

// Tespit Döngüsü
function detectFrame() {
    if (model) {
        // Kameradan alınan kare üzerinde nesne tespiti yap
        model.detect(video).then(predictions => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            predictions.forEach(prediction => {
                drawBox(prediction);
            });

            // Bir sonraki video karesi için kendini tekrar çağır (gerçek zamanlı akış)
            requestAnimationFrame(detectFrame);
        });
    }
}

// Sınırlayıcı Kutuyu Çizme Fonksiyonu
function drawBox(prediction) {
    const [x, y, width, height] = prediction.bbox;
    const className = prediction.class;
    const score = Math.round(prediction.score * 100);
    const label = `${className} (${score}%)`;
    
    let color = '#00FF00'; // Varsayılan renk (Hareket etmeyen nesneler)

    // Sadece "insan" nesneleri için hareketi kontrol et
    if (className === 'person') {
        // Hareketi Kontrol Etme mantığı
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        // Basit bir benzersiz ID (kutu konumuna göre)
        const personId = `${Math.floor(x/10)}_${Math.floor(y/10)}`; 
        
        let isMoving = false;

        if (lastPersonPosition[personId]) {
            const lastX = lastPersonPosition[personId].x;
            const lastY = lastPersonPosition[personId].y;

            // İki kare arasındaki mesafeyi hesapla
            const distance = Math.sqrt(Math.pow(centerX - lastX, 2) + Math.pow(centerY - lastY, 2));
            
            // Eğer hareket eşiğini geçtiyse hareket ediyor demektir
            if (distance > MOVEMENT_THRESHOLD) {
                isMoving = true;
            }
        }
        
        // Yeni konumu kaydet
        lastPersonPosition[personId] = { x: centerX, y: centerY };

        // Eğer hareket ediyorsa rengi Kırmızı yap
        if (isMoving) {
            color = '#FF0000'; // Kırmızı (Hareket ediyor)
        } else {
            color = '#00FF00'; // Yeşil (Hareket etmiyor)
        }
    }
    
    // Diğer önemli nesneler için turuncu kutu
    else if (className === 'car' || className === 'truck' || className === 'bus') {
        color = '#FFA500'; 
    }

    // Kutuyu çiz
    ctx.strokeStyle = color; 
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, width, height);

    // Etiket arkaplanını çiz
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 25, label.length * 9 + 25, 25);
    
    // Etiketi çiz
    ctx.fillStyle = '#000000'; // Siyah metin
    ctx.font = 'bold 16px Arial';
    ctx.fillText(label, x + 5, y - 5);
}
