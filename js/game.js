// Pluck Web Demo v5: Trump + Jokers + 17-card deal + forced 2C lead + "trump opens" + no leading trump until opened
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
const trumpSelectEl = document.getElementById("trumpSelect");
const applyTrumpBtn = document.getElementById("applyTrumpBtn");
const trumpLabelEl = document.getElementById("trumpLabel");
const trumpOpenLabelEl = document.getElementById("trumpOpenLabel");

// Scoreboard
const ai2TricksEl = document.getElementById("ai2Tricks");
const ai3TricksEl = document.getElementById("ai3Tricks");
const youTricksEl = document.getElementById("youTricks");
const trickNumEl = document.getElementById("trickNum");
const trickMaxEl = document.getElementById("trickMax");

const required = [
  ["hand", handEl], ["trick", trickEl], ["msg", msgEl], ["resetBtn", resetBtn],
  ["ai2Hand", ai2HandEl], ["ai3Hand", ai3HandEl],
  ["turnBanner", turnBannerEl],
  ["trumpSelect", trumpSelectEl], ["applyTrumpBtn", applyTrumpBtn],
  ["trumpLabel", trumpLabelEl], ["trumpOpenLabel", trumpOpenLabelEl],
  ["ai2Tricks", ai2TricksEl], ["ai3Tricks", ai3TricksEl], ["youTricks", youTricksEl],
  ["trickNum", trickNumEl], ["trickMax", trickMaxEl],
];
for (const [id, el] of required) if (!el) showError(`Missing element id="${id}" in game.html`);

const SUITS = ["S", "H", "D", "C"];
const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"]; // all 2s removed except 2C
const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

const CARD_BIG_JOKER = "BJ";
const CARD_LITTLE_JOKER = "LJ";
const CARD_OPEN_LEAD = "2C"; // forced lead first trick (guaranteed loss concept handled by ranking rules)

function suitName(s) {
  return s === "S" ? "Spades" : s === "H" ? "Hearts" : s === "D" ? "Diamonds" : "Clubs";
}

function makePluckDeck51() {
  // 52-card deck minus 2S/2H/2D, keep 2C, then add BJ + LJ => 51
  const deck = [];

  // Add 3..A for all suits
  for (const s of SUITS) for (const r of RANKS_NO_2) deck.push(r + s);

  // Add 2C only
  deck.push("2C");

  // Add jokers
  deck.push(CARD_BIG_JOKER);
  deck.push(CARD_LITTLE_JOKER);

  return deck;
}

function shuffle(a) {
  for (let i=a.length-1;i>0;i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function parseCard(cs, trumpSuit) {
  if (cs === CARD_BIG_JOKER) return { raw: cs, kind: "JOKER", joker: "BIG", suit: trumpSuit, value: 1000 };
  if (cs === CARD_LITTLE_JOKER) return { raw: cs, kind: "JOKER", joker: "LITTLE", suit: trumpSuit, value: 900 };

  const suit = cs.slice(-1);
  const rank = cs.slice(0, cs.length-1);
  return { raw: cs, kind: "NORMAL", suit, rank, value: RANK_VALUE[rank] };
}

function displayCard(cs) {
  if (cs === CARD_BIG_JOKER) return "🃏(Big)";
  if (cs === CARD_LITTLE_JOKER) return "🃏(Little)";
  return cs;
}

// Players: 0=AI2 (top), 1=AI3 (left), 2=YOU (bottom)
const players = [
  { id: "AI2", name: "Player 2 (AI)", hand: [], tricks: 0 },
  { id: "AI3", name: "Player 3 (AI)", hand: [], tricks: 0 },
  { id: "YOU", name: "You",            hand: [], tricks: 0 }
];

let trumpSuit = "H";
let trumpOpen = false;         // becomes true when any trump is played (including jokers). If trump=Clubs, 2C lead opens it.
let leaderIndex = 0;
let turnIndex = 0;
let leadSuit = null;           // suit to follow (jokers count as trump suit)
let trick = [];                // [{playerIndex, cardStr}]
let lockInput = false;

let trickNumber = 1;
let trickMax = 17;

function cardSuitForFollow(cs) {
  // Jokers are treated as trump suit for following rules
  if (cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER) return trumpSuit;
  return cs.slice(-1);
}

function isTrumpCard(cs) {
  if (cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER) return true;
  return cs.slice(-1) === trumpSuit;
}

function hasNonTrump(playerIndex) {
  return players[playerIndex].hand.some(c => !isTrumpCard(c));
}

function render() {
  // Labels
  trumpLabelEl.textContent = `${trumpSuit} (${suitName(trumpSuit)})`;
  trumpOpenLabelEl.textContent = trumpOpen ? "Yes" : "No";

  // Your hand
  handEl.innerHTML = "";
  players[2].hand.forEach((c, idx) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = displayCard(c);

    b.onclick = () => {
      if (lockInput) return;
      if (turnIndex !== 2) return;
      const legal = legalIndexesFor(2);
      if (!legal.includes(idx)) {
        msgEl.textContent = illegalReason(2, c);
        return;
      }
      playCard(2, idx);
    };

    handEl.appendChild(b);
  });

  // Trick display
  trickEl.textContent = trick.length
    ? trick.map(t => `${players[t.playerIndex].id}: ${displayCard(t.cardStr)}`).join(" | ")
    : "(empty)";

  // AI facedown hands
  ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
  ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

  // Banner + msg
  turnBannerEl.textContent =
    `Turn: ${players[turnIndex].name} • Lead: ${players[leaderIndex].name} • Lead Suit: ${leadSuit ?? "(none)"} • Trump: ${trumpSuit}`;

  // Score
  ai2TricksEl.textContent = String(players[0].tricks);
  ai3TricksEl.textContent = String(players[1].tricks);
  youTricksEl.textContent = String(players[2].tricks);
  trickNumEl.textContent = String(trickNumber);
  trickMaxEl.textContent = String(trickMax);

  // Default prompt
  if (turnIndex === 2) {
    if (trickNumber === 1 && trick.length === 0 && players[2].hand.includes(CARD_OPEN_LEAD)) {
      msgEl.textContent = "You have 2C. First trick must start with 2C.";
    } else if (leadSuit) {
      msgEl.textContent = `Your turn. Follow suit: ${leadSuit}${leadSuit === trumpSuit ? " (trump suit)" : ""}.`;
    } else {
      msgEl.textContent = trumpOpen ? "Your turn. Lead any card." : "Your turn. Lead any NON-trump card (until trump is opened).";
    }
  } else {
    msgEl.textContent = "Waiting on AI...";
  }
}

function illegalReason(playerIndex, cardStr) {
  // First trick must start with 2C if held
  if (trickNumber === 1 && trick.length === 0 && players[playerIndex].hand.includes(CARD_OPEN_LEAD)) {
    if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
  }

  // If leading (trick empty): no leading trump until opened (unless only trumps remain)
  if (trick.length === 0 && !trumpOpen) {
    const isTrump = isTrumpCard(cardStr);
    if (isTrump && trumpSuit !== "C") {
      if (hasNonTrump(playerIndex)) return "Trump is not open yet. You must lead a non-trump card.";
    }
  }

  // If following: must follow suit if possible
  if (trick.length > 0) {
    const mustSuit = leadSuit;
    const hand = players[playerIndex].hand;
    const hasSuit = hand.some(c => cardSuitForFollow(c) === mustSuit);
    if (hasSuit && cardSuitForFollow(cardStr) !== mustSuit) return `You must follow suit: ${mustSuit}.`;
  }

  return "That play is not allowed.";
}

function legalIndexesFor(playerIndex) {
  const hand = players[playerIndex].hand;

  // If first trick and player has 2C and trick is empty: must play 2C
  if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
    return hand.map((c,i)=>({c,i})).filter(x=>x.c === CARD_OPEN_LEAD).map(x=>x.i);
  }

  // If leading and trump not open: cannot lead trump unless only trumps remain
  if (trick.length === 0 && !trumpOpen && trumpSuit !== "C") {
    const nonTrumpIdx = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c)).map(x=>x.i);
    if (nonTrumpIdx.length > 0) return nonTrumpIdx;
    return hand.map((_,i)=>i);
  }

  // If following: must follow leadSuit if possible
  if (trick.length > 0) {
    const suited = hand.map((c,i)=>({c,i})).filter(x => cardSuitForFollow(x.c) === leadSuit).map(x=>x.i);
    return suited.length ? suited : hand.map((_,i)=>i);
  }

  // Otherwise any card
  return hand.map((_,i)=>i);
}

function chooseAiIndex(playerIndex) {
  const legal = legalIndexesFor(playerIndex);
  return legal[Math.floor(Math.random()*legal.length)];
}

function setLeadSuitFromFirstCard(cardStr) {
  leadSuit = cardSuitForFollow(cardStr); // jokers => trump suit
}

function updateTrumpOpen(cardStr) {
  // Trump opens when any trump card is played (including jokers)
  if (!trumpOpen && isTrumpCard(cardStr)) trumpOpen = true;
}

function playCard(playerIndex, handIdx) {
  const cardStr = players[playerIndex].hand.splice(handIdx, 1)[0];
  if (!cardStr) { showError("Tried to play an empty card."); return; }

  if (trick.length === 0) {
    setLeadSuitFromFirstCard(cardStr);
  }

  trick.push({ playerIndex, cardStr });

  // Trump opens rule (answer #3 = A)
  updateTrumpOpen(cardStr);

  // Advance turn
  turnIndex = (turnIndex + 1) % 3;

  render();
  maybeContinue();
}

function cardPowerForTrick(cardStr) {
  // Returns a number where higher wins, using your ranking:
  // Big Joker > Little Joker > A..3 of trump > (if trump=Clubs then 2C is lowest trump) > otherwise normal suit comparisons handled elsewhere
  if (cardStr === CARD_BIG_JOKER) return 1000000;
  if (cardStr === CARD_LITTLE_JOKER) return 900000;

  const c = parseCard(cardStr, trumpSuit);
  const isTrump = isTrumpCard(cardStr);

  if (isTrump) {
    // Trump A..3, and 2C is included only when Clubs is trump (answer #2 = B)
    // Trump power base
    return 10000 + c.value; // higher trump value wins
  }

  // Non-trump
  return c.value;
}

function evaluateTrickWinner() {
  // Winner rules:
  // - If any trump played: highest trump wins (with jokers highest).
  // - Else: highest of lead suit wins.
  const anyTrump = trick.some(t => isTrumpCard(t.cardStr));

  if (anyTrump) {
    let best = trick[0];
    let bestPower = -1;

    for (const t of trick) {
      if (!isTrumpCard(t.cardStr)) continue;
      const p = cardPowerForTrick(t.cardStr);
      if (p > bestPower) { bestPower = p; best = t; }
    }
    return best.playerIndex;
  }

  // No trump: lead suit wins, highest value
  const lead = leadSuit;
  let best = null;
  let bestVal = -1;

  for (const t of trick) {
    if (cardSuitForFollow(t.cardStr) !== lead) continue;
    const c = parseCard(t.cardStr, trumpSuit);
    if (c.value > bestVal) { bestVal = c.value; best = t; }
  }
  return best ? best.playerIndex : trick[0].playerIndex;
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
  // Resolve trick when 3 cards played
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

        // If AI leads next, keep it moving
        maybeContinue();
      }, 700);

    }, 600);

    return;
  }

  // AI auto-play
  if (turnIndex !== 2) {
    lockInput = true;
    setTimeout(() => {
      const aiIdx = chooseAiIndex(turnIndex);
      playCard(turnIndex, aiIdx);
      lockInput = false;
      render();
    }, 650);
  }
}

function dealNewHands() {
  const deck = shuffle(makePluckDeck51());

  players.forEach(p => { p.hand = []; p.tricks = 0; });

  trickMax = 17;
  trickNumber = 1;

  // 17 cards each (51 cards total)
  for (let i=0;i<17;i++) {
    players[0].hand.push(deck.pop());
    players[1].hand.push(deck.pop());
    players[2].hand.push(deck.pop());
  }

  trick = [];
  leadSuit = null;

  // Trump open resets each hand (after pluck dealer declares trump; for demo we use dropdown selection)
  trumpOpen = false;

  // Find who has 2C and force them to lead first trick
  let whoHas2C = 0;
  for (let pi=0;pi<3;pi++) {
    if (players[pi].hand.includes(CARD_OPEN_LEAD)) { whoHas2C = pi; break; }
  }
  leaderIndex = whoHas2C;
  turnIndex = whoHas2C;

  lockInput = false;

  // If clubs is trump, 2C lead opens trump immediately once played (handled by updateTrumpOpen when played)
  render();
  maybeContinue();
}

// Buttons
resetBtn.addEventListener("click", () => {
  dealNewHands();
});

applyTrumpBtn.addEventListener("click", () => {
  const v = trumpSelectEl.value;
  trumpSuit = (v === "S" || v === "H" || v === "D" || v === "C") ? v : "H";
  dealNewHands();
});

// Start
trumpSuit = trumpSelectEl.value || "H";
dealNewHands();
console.log("Pluck Demo v5 loaded");
