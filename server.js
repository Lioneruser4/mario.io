// Server faylı: server.js
const express = require('express');
const path = require('path');
const app = express();

// Render platformu tərəfindən təyin olunan PORT dəyişənini istifadə edirik
const PORT = process.env.PORT || 3000;

// İstifadəçinin ana səhifəyə gəldiyində (/) index.html faylını göndəririk
app.get('/', (req, res) => {
    // __dirname cari faylın olduğu qovluqdur
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serveri işə salırıq
app.listen(PORT, () => {
    console.log(`Server uğurla işə salındı! Port: ${PORT}`);
    console.log(`Brauzerdə açın: https://mario-io-1.onrender.com`);
});
