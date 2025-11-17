const socket = io("https://mario-io-1.onrender.com");
let boardEl = document.getElementById("board");
let statusEl = document.getElementById("status");
let roomId = null;
let playerColor = null;
let myTurn = false;
let username = "Guest" + Math.floor(Math.random() * 10000);
let boardState = [];

function createRoom() {
  roomId = Math.random().toString(36).substr(2, 6);
  socket.emit("createRoom", { roomId, username });
  document.getElementById("room").innerText = `Room ID: ${roomId}`;
}

function joinRoom() {
  roomId = document.getElementById("roomInput").value.trim();
  if (roomId) {
    socket.emit("joinRoom", { roomId, username });
    document.getElementById("room").innerText = `Joined Room: ${roomId}`;
  }
}

function initBoard() {
  boardEl.innerHTML = "";
  boardState = Array(64).fill(null);
  for (let i = 0; i < 64; i++) {
    const cell = document.createElement("div");
    cell.className = "cell " + ((Math.floor(i / 8) + i) % 2 === 0 ? "light" : "dark");
    cell.dataset.index = i;
    boardEl.appendChild(cell);
  }
  for (let i = 0; i < 12; i++) placePiece(i, "black");
  for (let i = 64 - 12; i < 64; i++) placePiece(i, "red");
}

function placePiece(index, color) {
  const piece = document.createElement("div");
  piece.className = `piece ${color}`;
  piece.onclick = () => selectPiece(index);
  boardEl.children[index].appendChild(piece);
  boardState[index] = color;
}

function selectPiece(index) {
  if (!myTurn || boardState[index] !== playerColor) return;
  clearHighlights();
  const moves = getValidMoves(index);
  moves.forEach(i => boardEl.children[i].classList.add("highlight"));
  boardEl.children[index].classList.add("highlight");
  moves.forEach(i => {
    boardEl.children[i].onclick = () => makeMove(index, i);
  });
}

function getValidMoves(index) {
  const moves = [];
  const dir = playerColor === "red" ? -1 : 1;
  const row = Math.floor(index / 8);
  const col = index % 8;
  [[-1, dir], [1, dir]].forEach(([dc, dr]) => {
    const r = row + dr, c = col + dc;
    if (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const i = r * 8 + c;
      if (!boardState[i]) moves.push(i);
    }
  });
  return moves;
}

function makeMove(from, to) {
  boardState[to] = boardState[from];
  boardState[from] = null;
  boardEl.children[to].appendChild(boardEl.children[from].firstChild);
  socket.emit("move", { roomId, from, to });
  myTurn = false;
  updateGlow();
  clearHighlights();
  statusEl.innerText = "Opponent's turn";
}

function clearHighlights() {
  [...boardEl.children].forEach(cell => {
    cell.classList.remove("highlight");
    cell.onclick = null;
  });
}

function updateGlow() {
  boardEl.classList.toggle("glow", myTurn);
}

socket.on("roomCreated", (color) => {
  playerColor = color;
  myTurn = color === "red";
  initBoard();
  updateGlow();
  statusEl.innerText = myTurn ? "Your turn" : "Waiting for opponent...";
});

socket.on("startGame", (color) => {
  playerColor = color;
  myTurn = color === "red";
  initBoard();
  updateGlow();
  statusEl.innerText = myTurn ? "Your turn" : "Opponent's turn";
});

socket.on("opponentMove", ({ from, to }) => {
  boardState[to] = boardState[from];
  boardState[from] = null;
  boardEl.children[to].appendChild(boardEl.children[from].firstChild);
  myTurn = true;
  updateGlow();
  statusEl.innerText = "Your turn";
});
