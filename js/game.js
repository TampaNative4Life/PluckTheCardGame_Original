// ===== Pluck Web Demo: Step 3 (3 players, turn-based, simple trick logic) =====

const handEl = document.getElementById("hand");
const trickEl = document.getElementById("trick");
const msgEl = document.getElementById("msg");
const resetBtn = document.getElementById("resetBtn");
const ai2HandEl = document.getElementById("ai2Hand");
const ai3HandEl = document.getElementById("ai3Hand");
const turnBannerEl = document.getElementById("turnBanner");

// --- Basic card model ---
const SUITS = ["S", "H", "D", "C"]; // Spades, Hearts, Diamonds, Clubs
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = Object.fromEntries(RANKS.map((r,i)=>[r,i+2]));

function makeDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) deck.push(r + s);
  }
  return deck;
}
function shuffle(a) {
  for (let i=a.length-1;i>0;i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
function parseCard(cs) {
  // "10S" => {rank:"10", suit:"S"} ; "AS" => {rank:"A", suit:"S"}
  const suit = cs.slice(-1);
  const rank = cs.slice(0, cs.length-1);
  return { rank, suit, value: RANK_VALUE[rank] };
}

// --- Game state ---
const players = [
  { id: "AI2", name: "Player 2 (AI)", hand: [] },
  { id: "AI3", name: "Player 3 (AI)", hand: [] },
  { id: "YOU", name: "You",            hand: [] }
];

// Turn order indexes: 0=AI2, 1=AI3, 2=YOU
let leaderIndex = 0;     // who leads the trick
let turnIndex = 0;       // whose turn right now
let leadSuit = null;     // suit that must be followed (simple rule)
let trick = [];          // [{playerIndex, cardStr}]
let lockInput = false;   // prevents clicking while AI is moving

// --- Helpers ---
function seatLabel(i) { return players[i].id; }

function render() {
  // Render your hand as clickable pills
  handEl.innerHTML = "";
  players[2].hand.forEach((c, idx) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = c;

    b.onclick = () => {
      if (lockInput) return;
      if (turnIndex !== 2) return; // not your turn
      playCard(2, idx);
    };

    handEl.appendChild(b);
  });

  // Render trick
  if (trick.length === 0) {
    trickEl.textContent = "(empty)";
  } else {
    const view = trick.map(t => `${seatLabel(t.playerIndex)}: ${t.cardStr}`).join("  |  ");
    trickEl.textContent = view;
  }

  // Render AI hands as facedown count
  ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
  ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

  // Banner + msg
  turnBannerEl.textContent = `Turn: ${players[turnIndex].name}  •  Lead: ${players[leaderIndex].name}`;
  msgEl.textContent = (turnIndex === 2)
    ? (leadSuit ? `Your turn. Follow suit: ${leadSuit}` : "Your turn. Lead any card.")
    : "Waiting on AI...";
}

function legalIndexesFor(playerIndex) {
  const hand = players[playerIndex].hand;
  if (!leadSuit) return hand.map((_,i)=>i);
  const suited = hand
    .map((c,i)=>({c,i}))
    .filter(x => parseCard(x.c).suit === leadSuit)
    .map(x=>x.i);
  return suited.length ? suited : hand.map((_,i)=>i);
}

function chooseAiIndex(playerIndex) {
  const legal = legalIndexesFor(playerIndex);
  // Dumb AI: pick random legal card
  const pick = legal[Math.floor(Math.random()*legal.length)];
  return pick;
}

function playCard(playerIndex, handIdx) {
  const hand = players[playerIndex].hand;
  const cardStr = hand.splice(handIdx, 1)[0];

  // set lead suit if first card of trick
  if (trick.length === 0) {
    leadSuit = parseCard(cardStr).suit;
  }

  trick.push({ playerIndex, cardStr });

  // advance turn
  turnIndex = (turnIndex + 1) % 3;

  render();
  maybeContinue();
}

function evaluateTrickWinner() {
  // Simple trick: must follow lead suit. Highest value among lead suit wins.
  const lead = leadSuit;
  const candidates = trick
    .map(t => ({...t, card: parseCard(t.cardStr)}))
    .filter(t => t.card.suit === lead);

  candidates.sort((a,b)=> b.card.value - a.card.value);
  return candidates[0].playerIndex;
}

function clearTrickForNext(winnerIndex) {
  trick = [];
  leadSuit = null;
  leaderIndex = winnerIndex;
  turnIndex = winnerIndex;
}

function maybeContinue() {
  // If trick complete, resolve after a short pause
  if (trick.length === 3) {
    lockInput = true;
    render();

    setTimeout(() => {
      const winner = evaluateTrickWinner();
      msgEl.textContent = `${players[winner].name} wins the trick.`;
      render();

      setTimeout(() => {
        clearTrickForNext(winner);
        lockInput = false;
        render();
        maybeContinue(); // if AI leads next
      }, 800);

    }, 700);

    return;
  }

  // If it's AI's turn, let them play automatically
  if (turnIndex !== 2) {
    lockInput = true;
    setTimeout(() => {
      const aiIdx = chooseAiIndex(turnIndex);
      playCard(turnIndex, aiIdx);
      lockInput = false;
      render();
    }, 700);
  }
}

// --- Deal / Reset ---
function dealNewHands() {
  const deck = shuffle(makeDeck());
  // 7 cards each for demo; adjust later
  players.forEach(p => p.hand = []);
  for (let i=0;i<7;i++) {
    players[0].hand.push(deck.pop());
    players[1].hand.push(deck.pop());
    players[2].hand.push(deck.pop());
  }
  trick = [];
  leadSuit = null;
  leaderIndex = 0;
  turnIndex = 0;
  lockInput = false;
}

resetBtn.addEventListener("click", () => {
  dealNewHands();
  render();
  maybeContinue(); // AI may lead immediately
});

// Start
dealNewHands();
render();
maybeContinue();
