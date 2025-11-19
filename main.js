const socket = io("https://mario-io-1.onrender.com", { transports: ["websocket"] });

let board = null, selected = null, myColor = null, myTurn = false;
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
let size = Math.min(innerWidth, innerHeight) * 0.9;
canvas.width = canvas.height = size;
let cell = size / 8;

function resize() {
  size = Math.min(innerWidth, innerHeight) * 0.9;
  canvas.width = canvas.height = size;
  cell = size / 8;
  draw();
}
addEventListener("resize", resize);

function draw() {
  if (!board) return;
  ctx.clearRect(0,0,size,size);
  for (let y=0;y<8;y++) for (let x=0;x<8;x++) {
    ctx.fillStyle = (x+y)%2 ? "#b58863" : "#f0d9b5";
    ctx.fillRect(x*cell,y*cell,cell,cell);

    if (selected && selected.x===x && selected.y===y) {
      ctx.strokeStyle="#0f0"; ctx.lineWidth=6;
      ctx.strokeRect(x*cell+5,y*cell+5,cell-10,cell-10);
    }

    const p = board[y][x];
    if (p) {
      const white = p===1||p===2;
      ctx.fillStyle = white ? "#fff" : "#111";
      ctx.beginPath();
      ctx.arc(x*cell+cell/2, y*cell+cell/2, cell*0.38, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = white ? "#000" : "#fff";
      ctx.lineWidth=4; ctx.stroke();

      if (p===2||p===4) { // vazi
        ctx.fillStyle="#ff0"; ctx.font=`bold ${cell*0.4}px Arial`;
        ctx.fillText("K", x*cell+cell/2, y*cell+cell/2+10);
      }
    }
  }

  if (selected && myTurn) {
    const moves = getMoves(selected.x, selected.y);
    moves.forEach(m=>{
      ctx.fillStyle="rgba(0,255,255,0.4)";
      ctx.beginPath();
      ctx.arc(m.x*cell+cell/2, m.y*cell+cell/2, cell*0.2,0,Math.PI*2);
      ctx.fill();
    });
  }
}

function getMoves(x,y) {
  const moves=[]; const p=board[y][x];
  if(!p) return moves;
  const white = p===1||p===2;
  const king = p>2;
  const dirs = king ? [[-1,-1],[-1,1],[1,-1],[1,1]] : (white ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]);
  dirs.forEach(([dy,dx])=>{
    const nx=x+dx, ny=y+dy;
    if(nx>=0&&nx<8&&ny>=0&&ny<8&&board[ny][nx]===0) moves.push({x:nx,y:ny});
  });
  return moves;
}

canvas.addEventListener("click", e=>{
  if(!myTurn) return;
  const rect=canvas.getBoundingClientRect();
  const x=Math.floor((e.clientX-rect.left)/cell);
  const y=Math.floor((e.clientY-rect.top)/cell);
  if(x<0||x>7||y<0||y>7) return;

  const p=board[y][x];
  const mine = (myColor==="white" && (p===1||p===2)) || (myColor==="black" && (p===3||p===4));

  if(mine) selected={x,y};
  else if(selected) {
    const moves=getMoves(selected.x, selected.y);
    if(moves.some(m=>m.x===x&&m.y===y)){
      socket.emit("move",{from:selected,to:{x,y}});
      selected=null;
    }
  } else selected=null;
  draw();
});

socket.on("connect",()=>document.getElementById("status").textContent="Bağlandı");

socket.on("searching",()=>{
  document.getElementById("searching").classList.remove("hidden");
});

socket.on("roomCreated", code=>{
  document.getElementById("roomCode").textContent=code;
  document.getElementById("roomInfo").classList.remove("hidden");
});

socket.on("errorMsg", msg=>alert(msg));

socket.on("gameStart", data=>{
  board=data.board; myColor=data.color; myTurn=data.turn===data.color;
  document.getElementById("lobby").classList.remove("active");
  document.getElementById("game").classList.add("active");
  document.getElementById("l1").classList.toggle("active", myColor==="white" && myTurn);
  document.getElementById("l2").classList.toggle("active", myColor==="black" && myTurn);
  draw();
});

socket.on("boardUpdate", data=>{
  board=data.board; myTurn=data.turn===myColor;
  document.getElementById("l1").classList.toggle("active", myColor==="white" && myTurn);
  document.getElementById("l2").classList.toggle("active", myColor==="black" && myTurn);
  draw();
});

// Butonlar
document.getElementById("ranked").onclick=()=>socket.emit("findMatch");
document.getElementById("create").onclick=()=>socket.emit("createRoom");
document.getElementById("joinToggle").onclick=()=>
  document.getElementById("joinBox").classList.toggle("hidden");
document.getElementById("joinBtn").onclick=()=>
  socket.emit("joinRoom", document.getElementById("codeInput").value);
document.getElementById("copyBtn").onclick=()=>
  navigator.clipboard.writeText(document.getElementById("roomCode").textContent);
document.getElementById("cancel").onclick=()=>{ socket.emit("cancelMatch"); location.reload(); }
document.getElementById("leave").onclick=()=>location.reload();
