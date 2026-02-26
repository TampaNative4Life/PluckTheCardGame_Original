// Pluck Demo Step 4: 3 players + turn order + follow suit + trick counters + round end
function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.textContent = "ERROR: " + msg;
  console.error(msg);
}
window.addEventListener("error", (e) => showError(e.message || "Unknown script error"));

const handEl = document.getElementById("hand");
const trickEl = document.getElementById("trick");
const msgEl = document.getElementById("msg");
const resetBtn = document.getElementById("resetBtn");
const ai2HandEl = document.getElementById("ai2Hand");
const ai3HandEl = document.getElementById("ai3Hand");
const turnBannerEl = document.getElementById("turnBanner");

// Scoreboard
const ai2TricksEl = document.getElementById("ai2Tricks");
const ai3TricksEl = document.getElementById("ai3Tricks");
const youTricksEl = document.getElementById("youTricks");
const trickNumEl = document.getElementById("trickNum");
const trickMaxEl = document.getElementById("trickMax");

const required = [
  ["hand", handEl],
  ["trick", trickEl],
  ["msg", msgEl],
  ["resetBtn", resetBtn],
  ["ai2Hand", ai2HandEl],
  ["ai3Hand", ai3HandEl],
  ["turnBanner", turnBannerEl],
  ["ai2Tricks", ai2TricksEl],
  ["ai3Tricks", ai3TricksEl],
  ["youTricks", youTricksEl],
  ["trickNum", trickNumEl],
  ["trickMax", trickMaxEl],
];
for (const [id, el] of required) if (!el) showError(`Missing element id="${id}" in game.html`);

const SUITS = ["S", "H", "D", "C"];
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = Object.fromEntries(RANKS.map((r,i)=>[r,i+2]));

function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
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
  const suit = cs.slice(-1);
  const rank = cs.slice(0, cs.length-1);
  return { rank, suit, value: RANK_VALUE[rank] };
}

const players = [
  { id: "AI2", name: "Player 2 (AI)", hand: [], tricks: 0 },
  { id: "AI3", name: "Player 3 (AI)", hand: [], tricks: 0 },
  { id: "YOU", name: "You",            hand: [], tricks: 0 }
];

let leaderIndex = 0;
let turnIndex = 0;
let leadSuit = null;
let trick = [];
let lockInput = false;

let trickNumber = 1;
let trickMax = 7;

function render() {
  if (!handEl || !trickEl || !msgEl) return;

  // Your hand
  handEl.innerHTML = "";
  players[2].hand.forEach((c, idx) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = c;
    b.onclick = () => {
      if (lockInput) return;
      if (turnIndex !== 2) return;
      playCard(2, idx);
    };
    handEl.appendChild(b);
  });

  // Trick
  trickEl.textContent = trick.length
    ? trick.map(t => `${players[t.playerIndex].id}: ${t.cardStr}`).join(" | ")
    : "(empty)";

  // AI hands facedown
  ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
  ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

  // Turn banner + message
  turnBannerEl.textContent = `Turn: ${players[turnIndex].name} • Lead: ${players[leaderIndex].name}`;
  msgEl.textContent = (turnIndex === 2)
    ? (leadSuit ? `Your turn. Follow suit: ${leadSuit}` : "Your turn. Lead any card.")
    : "Waiting on AI...";

  // Scoreboard
  ai2TricksEl.textContent = String(players[0].tricks);
  ai3TricksEl.textContent = String(players[1].tricks);
  youTricksEl.textContent = String(players[2].tricks);
  trickNumEl.textContent = String(trickNumber);
  trickMaxEl.textContent = String(trickMax);
}

function legalIndexesFor(playerIndex) {
  const hand = players[playerIndex].hand;
  if (!leadSuit) return hand.map((_,i)=>i);
  const suited = hand.map((c,i)=>({c,i})).filter(x => parseCard(x.c).suit === leadSuit).map(x=>x.i);
  return suited.length ? suited : hand.map((_,i)=>i);
}

function chooseAiIndex(playerIndex) {
  const legal = legalIndexesFor(playerIndex);
  return legal[Math.floor(Math.random()*legal.length)];
}

function playCard(playerIndex, handIdx) {
  const cardStr = players[playerIndex].hand.splice(handIdx, 1)[0];
  if (!cardStr) { showError("Tried to play an empty card."); return; }

  if (trick.length === 0) leadSuit = parseCard(cardStr).suit;

  trick.push({ playerIndex, cardStr });
  turnIndex = (turnIndex + 1) % 3;

  render();
  maybeContinue();
}

function evaluateTrickWinner() {
  const candidates = trick
    .map(t => ({...t, card: parseCard(t.cardStr)}))
    .filter(t => t.card.suit === leadSuit);

  candidates.sort((a,b)=> b.card.value - a.card.value);
  return candidates[0].playerIndex;
}

function clearTrickForNext(winnerIndex) {
  trick = [];
  leadSuit = null;
  leaderIndex = winnerIndex;
  turnIndex = winnerIndex;
}

function roundIsOver() {
  return players.every(p => p.hand.length === 0) && trick.length === 0;
}

function announceRoundWinner() {
  const maxTricks = Math.max(...players.map(p => p.tricks));
  const winners = players.filter(p => p.tricks === maxTricks);

  if (winners.length === 1) {
    msgEl.textContent = `Round over. Winner: ${winners[0].name} with ${maxTricks} tricks.`;
  } else {
    msgEl.textContent = `Round over. Tie: ${winners.map(w=>w.name).join(" & ")} with ${maxTricks} tricks.`;
  }
}

function maybeContinue() {
  // Resolve trick
  if (trick.length === 3) {
    lockInput = true;

    setTimeout(() => {
      const winner = evaluateTrickWinner();
      players[winner].tricks += 1;
      msgEl.textContent = `${players[winner].name} wins the trick.`;
      render();

      setTimeout(() => {
        clearTrickForNext(winner);
        trickNumber += 1;
        lockInput = false;
        render();

        if (roundIsOver()) {
          announceRoundWinner();
          return;
        }

        maybeContinue(); // if AI leads next
      }, 700);

    }, 600);

    return;
  }

  // AI turn
  if (turnIndex !== 2) {
    lockInput = true;
    setTimeout(() => {
      const aiIdx = chooseAiIndex(turnIndex);
      playCard(turnIndex, aiIdx);
      lockInput = false;
      render();
    }, 600);
  }
}

function dealNewHands() {
  const deck = shuffle(makeDeck());
  players.forEach(p => { p.hand = []; p.tricks = 0; });

  trickMax = 7;
  trickNumber = 1;

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
  maybeContinue();
});

// Start
dealNewHands();
render();
maybeContinue();
console.log("Pluck Step 4 loaded OK");
