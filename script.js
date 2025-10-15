/* Tam Ekran və Mobil Uyğunluq */
body {
    margin: 0;
    padding: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background-color: #f0f0f0;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    overflow: hidden; /* Scroll-u ləğv edir */
}

.game-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    /* Ən böyük ölçüyə (genişlik və ya hündürlük) uyğunlaşır */
    width: 90vmin; 
    height: 90vmin;
    max-width: 500px; 
    max-height: 500px;
    padding: 10px;
}

.score-board {
    width: 100%;
    text-align: center;
    margin-bottom: 10px;
    padding: 15px;
    background-color: #fff;
    border-radius: 10px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

/* Oyun Şəbəkəsi (Grid) */
.grid {
    width: 100%;
    height: 100%; /* Kontainerin 100%-i */
    display: flex;
    flex-wrap: wrap;
    border: 5px solid #a33; /* Qırmızı çərçivə */
    background-color: #eee;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.3);
}

.square {
    /* JavaScript-də hesablanacaq: width, height, background-image */
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: grab;
    user-select: none; 
    touch-action: none;
    background-size: 100% 100%; /* Şəklin tam kvadratı tutmasını təmin edir */
    background-repeat: no-repeat;
    background-position: center;
    position: relative;
    /* Animasiyaları əlavə edirik */
    transition: 
        transform 0.2s ease-in-out, 
        opacity 0.5s ease-out;
}

/* Patlama (Explosion) Effekti */
.is-blank {
    /* Patlama Animasiyası */
    animation: explode 0.5s forwards;
    background-image: none !important; /* Patlayanda şəkli gizlət */
    opacity: 0 !important;
    pointer-events: none;
}

/* Keyframe Animasiyası */
@keyframes explode {
    0% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.5); opacity: 0.5; } /* Partlama anı */
    100% { transform: scale(0); opacity: 0; } /* Yoxolma */
}

/* Sürüşdürmə effekti üçün */
.drag-start {
    z-index: 10; /* Üstə çıxarır */
    opacity: 0.7;
    transform: scale(1.1);
}
