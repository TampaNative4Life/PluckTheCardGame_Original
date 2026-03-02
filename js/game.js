:root{
  /* Lightened, more “professional” dark theme */
  --bg:#0b1220;
  --panel:#121a2b;
  --panel2:#0f1728;
  --text:#eef3ff;
  --muted:#a8b3cc;
  --line:rgba(180,200,255,.14);
  --brand:#d4b254;

  --shadow: 0 10px 26px rgba(0,0,0,.32);
}

*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  background:
    radial-gradient(1200px 600px at 25% 0%, rgba(212,178,84,.10), transparent 60%),
    radial-gradient(900px 500px at 90% 20%, rgba(120,160,255,.10), transparent 55%),
    var(--bg);
  color:var(--text);
}

/* NAV */
.nav{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:12px 16px;
  border-bottom:1px solid var(--line);
  background: rgba(9,14,26,.75);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 50;
}
.brand{
  display:flex;
  gap:10px;
  align-items:center;
  color:var(--text);
  text-decoration:none;
  font-weight:900;
  letter-spacing:1px;
}
.brand img{
  height:40px;
  width:auto;
  border-radius:10px;
  box-shadow: 0 6px 16px rgba(0,0,0,.35);
}
.navlinks{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  align-items:center;
}
.navlinks a{
  color:var(--muted);
  text-decoration:none;
  padding:8px 10px;
  border-radius:10px;
}
.navlinks a:hover{
  color:var(--text);
  background: rgba(180,200,255,.08);
}

/* PAGE CONTAINER */
.container{
  max-width:1200px;
  margin:0 auto;
  padding:14px;
}

/* MAIN LAYOUT */
.playLayout{
  display:grid;
  grid-template-columns: 360px 1fr;
  gap:14px;
  align-items:start;
}
@media (max-width: 1000px){
  .playLayout{ grid-template-columns: 1fr; }
}

/* Cards / panels */
.card{
  background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));
  border:1px solid var(--line);
  border-radius:16px;
  padding:14px;
  box-shadow: var(--shadow);
}

.grid{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap:14px;
  margin:14px 0;
}
@media (max-width: 980px){
  .grid{ grid-template-columns:1fr; }
}

/* Topbar */
.topbar{
  display:grid;
  grid-template-columns: 1.2fr .8fr;
  gap:14px;
  margin:14px 0 6px 0;
}
@media (max-width: 980px){
  .topbar{ grid-template-columns:1fr; }
}

.metaRow{
  display:flex;
  gap:14px;
  align-items:center;
  flex-wrap:wrap;
  color:var(--muted);
  margin-bottom:8px;
}

.pname{font-weight:900}
.pmeta{color:var(--muted); font-size:13px}

/* Buttons */
.buttons{
  display:flex;
  gap:10px;
  margin-top:12px;
  flex-wrap:wrap;
}
.btn{
  border:1px solid var(--line);
  background: rgba(180,200,255,.08);
  color:var(--text);
  padding:10px 12px;
  border-radius:12px;
  cursor:pointer;
  font-weight:800;
  min-height:44px;
}
.btn:hover{filter:brightness(1.08)}
.btn:disabled{
  opacity:.45;
  cursor:not-allowed;
}
.btn-secondary{
  background: rgba(180,200,255,.05);
}

/* Phase row */
.phaseRow{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  align-items:center;
}
.phaseChip{
  padding:10px 14px;
  border-radius:14px;
  border:1px solid var(--line);
  background: rgba(180,200,255,.06);
  color:var(--muted);
  font-weight:900;
  font-size:14px;
}
.phaseChip.activeChip{
  background: rgba(212,178,84,.12);
  border-color: rgba(212,178,84,.55);
  color: var(--text);
  box-shadow: 0 0 0 2px rgba(212,178,84,.12) inset;
}
.phaseArrow{
  color:rgba(180,200,255,.35);
  font-weight:900;
  font-size:18px;
}

/* Status / banners */
.turnBanner{
  margin-top:10px;
  padding:12px;
  border:1px dashed rgba(212,178,84,.45);
  border-radius:12px;
  background: rgba(15,23,40,.75);
  color: rgba(240,245,255,.82);
  font-size:13px;
  min-height:42px;
}

/* Score (tricks) row look */
.scoreBox{
  display:flex;
  flex-direction:column;
  gap:10px;
  padding:12px;
  border:1px solid var(--line);
  border-radius:16px;
  background: rgba(15,23,40,.75);
}
.scoreRow{
  display:grid;
  grid-template-columns: 60px 1fr 1fr;
  gap:10px;
  align-items:center;
}

/* Messages / hints */
.msg{
  color:rgba(240,245,255,.86);
  margin-top:10px;
  min-height:22px;
}
.hint{
  color:rgba(168,179,204,.80);
  margin:8px 0 0 0;
  font-size:13px;
}

/* Trick box */
.trickBox{
  min-height:120px;
  padding:12px;
  border:1px solid var(--line);
  border-radius:16px;
  background: rgba(15,23,40,.75);
  display:flex;
  flex-wrap:wrap;
  gap:12px;
  align-items:flex-start;
}
.trickCard{
  box-shadow: 0 0 0 2px rgba(212,178,84,.18) inset, 0 14px 22px rgba(0,0,0,.25);
  border-color: rgba(212,178,84,.55) !important;
}

/* Hidden hands */
.handRow{
  color:rgba(168,179,204,.75);
  font-size:18px;
  min-height:26px;
}

/* Hand area */
.hand{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
}

/* Pick slots */
.pickCardSlot{
  min-height:120px;
  display:flex;
  align-items:center;
  justify-content:center;
  border:1px dashed rgba(212,178,84,.40);
  border-radius:14px;
  background: rgba(15,23,40,.75);
  margin-top:8px;
  padding:10px;
}

/* ===== Card Faces (THIS is what prevents “double text”) ===== */
.cardFace{
  width:74px;
  height:104px;
  background:#f8f9ff;
  color:#111;
  border-radius:12px;
  border:1px solid rgba(0,0,0,.18);
  position:relative;           /* required */
  box-shadow: 0 10px 16px rgba(0,0,0,.25);
  cursor:pointer;
  user-select:none;
  display:flex;
  align-items:center;
  justify-content:center;
  transition: transform .08s ease, box-shadow .12s ease;
  touch-action: manipulation;
  pointer-events:auto;
}
.cardFace:hover{ transform: translateY(-2px); }
.cardFace:active{ transform: translateY(0px); }

.cardFace.disabled{
  opacity:.45;
  cursor:not-allowed;
  transform:none;
  box-shadow: 0 8px 14px rgba(0,0,0,.18);
}

.cardFace.legalGlow{
  box-shadow: 0 0 0 2px rgba(120,160,255,.28) inset, 0 12px 18px rgba(0,0,0,.25);
  border-color: rgba(120,160,255,.55);
}

.corner{
  position:absolute;           /* required */
  line-height:1.05;
  font-weight:900;
  font-size:14px;
}
.corner.tl{top:6px; left:7px;}
.corner.br{bottom:6px; right:7px; transform:rotate(180deg);}

.suitBig{
  font-size:34px;
  font-weight:900;
  margin-top:6px;
}
.red{ color:#c0152a; }
.black{ color:#111; }

/* Joker */
.joker{
  background: linear-gradient(135deg, #f8f9ff, #efe9ff);
  border:1px solid rgba(90,50,160,.35);
}
.joker .suitBig{ font-size:22px; }
.jokerTag{
  position:absolute;
  bottom:8px;
  left:8px;
  right:8px;
  text-align:center;
  font-size:11px;
  font-weight:900;
  color:#3b2a7a;
  opacity:.95;
}

/* Make sure images never steal taps if you later add them */
.cardFace img{
  pointer-events:none;
  user-select:none;
  -webkit-user-drag:none;
}

/* Trump selection highlight */
#trumpPanel button.selected{
  border-color: rgba(212,178,84,.75);
  box-shadow: 0 0 0 2px rgba(212,178,84,.14) inset;
  background: rgba(212,178,84,.12);
}

/* Footer */
.footer{
  padding:18px;
  text-align:center;
  color:rgba(168,179,204,.70);
  border-top:1px solid var(--line);
  margin-top:18px;
}

/* Small screen tightening */
@media (max-width: 520px){
  .card{ box-shadow: 0 6px 14px rgba(0,0,0,.22); }
  .turnBanner{ font-size: 12px; }
  .cardFace{
    width: clamp(56px, 9vw, 74px);
    height: clamp(82px, 13vw, 104px);
  }
}
