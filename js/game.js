// Pluck Web Demo v10: 0-trick ("0 books") mercy rule implemented in pluck phase
function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.textContent = "ERROR: " + msg;
  console.error(msg);
}
window.addEventListener("error", (e) => showError(e.message || "Unknown script error"));

// Elements
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

const phaseLabelEl = document.getElementById("phaseLabel");

const ai2TricksEl = document.getElementById("ai2Tricks");
const ai3TricksEl = document.getElementById("ai3Tricks");
const youTricksEl = document.getElementById("youTricks");
const ai2QuotaLabelEl = document.getElementById("ai2Quota");
const ai3QuotaLabelEl = document.getElementById("ai3Quota");
const youQuotaLabelEl = document.getElementById("youQuota");
const trickNumEl = document.getElementById("trickNum");
const trickMaxEl = document.getElementById("trickMax");

const pluckPanelEl = document.getElementById("pluckPanel");
const pluckStatusEl = document.getElementById("pluckStatus");
const pluckNextBtn = document.getElementById("pluckNextBtn");

// ===== Core constants =====
const TOTAL_TRICKS = 17;

// Rules constants
const SUITS = ["S", "H", "D", "C"];
const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };
const CARD_BIG_JOKER = "BJ";
const CARD_LITTLE_JOKER = "LJ";
const CARD_OPEN_LEAD = "2C";

function suitName(s) { return s==="S"?"Spades":s==="H"?"Hearts":s==="D"?"Diamonds":"Clubs"; }
function displayCard(cs) {
  if (cs === CARD_BIG_JOKER) return "🃏(Big)";
  if (cs === CARD_LITTLE_JOKER) return "🃏(Little)";
  return cs;
}

function makePluckDeck51() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS_NO_2) deck.push(r + s);
  deck.push("2C");
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
  if (cs === CARD_BIG_JOKER) return { raw: cs, kind:"JOKER", suit: trumpSuit, value: 1000 };
  if (cs === CARD_LITTLE_JOKER) return { raw: cs, kind:"JOKER", suit: trumpSuit, value: 900 };
  const suit = cs.slice(-1);
  const rank = cs.slice(0, cs.length-1);
  return { raw: cs, kind:"NORMAL", suit, rank, value: RANK_VALUE[rank] };
}
function isJoker(cs) { return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }

// ===== Players (fixed seating for now) =====
// 0=AI2, 1=AI3, 2=YOU
// Dealer fixed as AI2 for demo. Quotas fixed by position: Dealer 7, Left 6, Right 4.
const dealerIndex = 0;
function leftOf(i) { return (i + 1) % 3; }
function rightOf(i) { return (i + 2) % 3; }

const players = [
  { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7, plucksEarned:0, plucksSuffered:0 },
  { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6, plucksEarned:0, plucksSuffered:0 },
  { id:"YOU", name:"You",            hand:[], tricks:0, quota:4, plucksEarned:0, plucksSuffered:0 }
];

function applyFixedQuotas() {
  players[dealerIndex].quota = 7;
  players[leftOf(dealerIndex)].quota = 6;
  players[rightOf(dealerIndex)].quota = 4;
}

// ===== Game state =====
let trumpSuit = "H";
let trumpOpen = false;
let leaderIndex = 0;
let turnIndex = 0;
let leadSuit = null;
let trick = [];
let lockInput = false;

let trickNumber = 1;
let trickMax = TOTAL_TRICKS;

let phase = "PLAY"; // PLAY | PLUCK

// Pluck processing
// Queue items: { pluckerIndex, pluckeeIndex }
let pluckQueue = [];
let activePluck = null;

// Tracks "no duplicate suit plucks for the same plucker->pluckee pair"
let pluckSuitUsedByPair = new Map(); // key "plucker-pluckee" => Set(suits)

function cardSuitForFollow(cs) {
  if (isJoker(cs)) return trumpSuit;  // jokers count as trump suit
  return cs.slice(-1);
}
function isTrumpCard(cs) {
  if (isJoker(cs)) return true;
  return cs.slice(-1) === trumpSuit;
}
function hasNonTrump(playerIndex) {
  return players[playerIndex].hand.some(c => !isTrumpCard(c));
}

function setPhase(newPhase) {
  phase = newPhase;
  phaseLabelEl.textContent = newPhase;
  pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
}

function render() {
  trumpLabelEl.textContent = `${trumpSuit} (${suitName(trumpSuit)})`;
  trumpOpenLabelEl.textContent = trumpOpen ? "Yes" : "No";

  ai2QuotaLabelEl.textContent = String(players[0].quota);
  ai3QuotaLabelEl.textContent = String(players[1].quota);
  youQuotaLabelEl.textContent = String(players[2].quota);

  // Your hand clickable only during PLAY and your turn
  handEl.innerHTML = "";
  players[2].hand.forEach((c, idx) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = displayCard(c);
    b.onclick = () => {
      if (lockInput) return;
      if (phase !== "PLAY") return;
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

  trickEl.textContent = trick.length
    ? trick.map(t => `${players[t.playerIndex].id}: ${displayCard(t.cardStr)}`).join(" | ")
    : "(empty)";

  ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
  ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

  turnBannerEl.textContent =
    `Phase: ${phase} • Turn: ${players[turnIndex].name} • Lead: ${players[leaderIndex].name} • Lead Suit: ${leadSuit ?? "(none)"} • Trump: ${trumpSuit} • Dealer: ${players[dealerIndex].name}`;

  ai2TricksEl.textContent = String(players[0].tricks);
  ai3TricksEl.textContent = String(players[1].tricks);
  youTricksEl.textContent = String(players[2].tricks);
  trickNumEl.textContent = String(trickNumber);
  trickMaxEl.textContent = String(trickMax);

  if (phase === "PLUCK") renderPluckStatus();
}

function illegalReason(playerIndex, cardStr) {
  // first lead: must be 2C if in hand
  if (trickNumber === 1 && trick.length === 0 && players[playerIndex].hand.includes(CARD_OPEN_LEAD)) {
    if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
  }
  // can't lead trump until opened (unless clubs is trump)
  if (trick.length === 0 && !trumpOpen && trumpSuit !== "C") {
    if (isTrumpCard(cardStr) && hasNonTrump(playerIndex)) return "Trump not open. Lead a non-trump card.";
  }
  // follow suit if possible
  if (trick.length > 0) {
    const mustSuit = leadSuit;
    const hasSuit = players[playerIndex].hand.some(c => cardSuitForFollow(c) === mustSuit);
    if (hasSuit && cardSuitForFollow(cardStr) !== mustSuit) return `You must follow suit: ${mustSuit}.`;
  }
  return "That play is not allowed.";
}

function legalIndexesFor(playerIndex) {
  const hand = players[playerIndex].hand;

  if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
    return hand.map((c,i)=>({c,i})).filter(x=>x.c === CARD_OPEN_LEAD).map(x=>x.i);
  }

  if (trick.length === 0 && !trumpOpen && trumpSuit !== "C") {
    const nonTrumpIdx = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c)).map(x=>x.i);
    if (nonTrumpIdx.length > 0) return nonTrumpIdx;
    return hand.map((_,i)=>i);
  }

  if (trick.length > 0) {
    const suited = hand.map((c,i)=>({c,i})).filter(x => cardSuitForFollow(x.c) === leadSuit).map(x=>x.i);
    return suited.length ? suited : hand.map((_,i)=>i);
  }

  return hand.map((_,i)=>i);
}

function chooseAiIndex(playerIndex) {
  const legal = legalIndexesFor(playerIndex);
  return legal[Math.floor(Math.random()*legal.length)];
}

function setLeadSuitFromFirstCard(cardStr) { leadSuit = cardSuitForFollow(cardStr); }
function updateTrumpOpen(cardStr) { if (!trumpOpen && isTrumpCard(cardStr)) trumpOpen = true; }

function playCard(playerIndex, handIdx) {
  const cardStr = players[playerIndex].hand.splice(handIdx, 1)[0];
  if (!cardStr) { showError("Tried to play empty card."); return; }
  if (trick.length === 0) setLeadSuitFromFirstCard(cardStr);

  trick.push({ playerIndex, cardStr });
  updateTrumpOpen(cardStr);

  turnIndex = (turnIndex + 1) % 3;
  render();
  maybeContinue();
}

function cardPower(cardStr) {
  if (cardStr === CARD_BIG_JOKER) return 1000000;
  if (cardStr === CARD_LITTLE_JOKER) return 900000;
  const c = parseCard(cardStr, trumpSuit);
  if (isTrumpCard(cardStr)) return 10000 + c.value;
  return c.value;
}

function evaluateTrickWinner() {
  const anyTrump = trick.some(t => isTrumpCard(t.cardStr));

  if (anyTrump) {
    let best = null, bestP = -1;
    for (const t of trick) {
      if (!isTrumpCard(t.cardStr)) continue;
      const p = cardPower(t.cardStr);
      if (p > bestP) { bestP = p; best = t; }
    }
    return best.playerIndex;
  }

  let best = null, bestV = -1;
  for (const t of trick) {
    if (cardSuitForFollow(t.cardStr) !== leadSuit) continue;
    const c = parseCard(t.cardStr, trumpSuit);
    if (c.value > bestV) { bestV = c.value; best = t; }
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

// ===== Plucks =====
function computePlucksEarnedAndSuffered() {
  for (const p of players) {
    p.plucksEarned = Math.max(0, p.tricks - p.quota);
    p.plucksSuffered = Math.max(0, p.quota - p.tricks);
  }
}

// Pluckers: most earned first; ties dealer -> left -> right
function pluckerOrder() {
  const tiebreak = [dealerIndex, leftOf(dealerIndex), rightOf(dealerIndex)];
  const idx = [0,1,2];
  idx.sort((a,b) => {
    const da = players[a].plucksEarned;
    const db = players[b].plucksEarned;
    if (db !== da) return db - da;
    return tiebreak.indexOf(a) - tiebreak.indexOf(b);
  });
  return idx.filter(i => players[i].plucksEarned > 0);
}

// Victims: most suffered first; ties dealer -> left -> right
function victimOrder() {
  const tiebreak = [dealerIndex, leftOf(dealerIndex), rightOf(dealerIndex)];
  const idx = [0,1,2];
  idx.sort((a,b) => {
    const da = players[a].plucksSuffered;
    const db = players[b].plucksSuffered;
    if (db !== da) return db - da;
    return tiebreak.indexOf(a) - tiebreak.indexOf(b);
  });
  return idx.filter(i => players[i].plucksSuffered > 0);
}

function buildPluckQueueFromScores() {
  // Distribute plucks from pluckers to victims until satisfied.
  const queue = [];
  const pluckers = pluckerOrder();
  const victims = victimOrder();

  const remainingEarned = new Map(pluckers.map(i => [i, players[i].plucksEarned]));
  const remainingSuffered = new Map(victims.map(i => [i, players[i].plucksSuffered]));

  for (const plucker of pluckers) {
    while ((remainingEarned.get(plucker) || 0) > 0) {
      const victim = victims
        .filter(v => (remainingSuffered.get(v) || 0) > 0)
        .sort((a,b) => (remainingSuffered.get(b)||0) - (remainingSuffered.get(a)||0))[0];

      if (victim === undefined) break;

      queue.push({ pluckerIndex: plucker, pluckeeIndex: victim });

      remainingEarned.set(plucker, (remainingEarned.get(plucker) || 0) - 1);
      remainingSuffered.set(victim, (remainingSuffered.get(victim) || 0) - 1);
    }
  }
  return queue;
}

// Normal pluck exchange:
// - plucker gives LOWEST in suit (non-joker)
// - pluckee returns HIGHEST in same suit (non-joker)
//
// Mercy (0 tricks) rule:
// - if pluckee.tricks === 0 and plucker earned plucks,
//   plucker TAKES the pluckee's HIGHEST in suit
//   and RETURNS NOTHING.
function lowestOfSuitNonJoker(playerIndex, suit) {
  const cards = players[playerIndex].hand.filter(c => !isJoker(c) && c.slice(-1) === suit);
  if (cards.length === 0) return null;
  cards.sort((a,b)=> parseCard(a,trumpSuit).value - parseCard(b,trumpSuit).value);
  return cards[0];
}
function highestOfSuitNonJoker(playerIndex, suit) {
  const cards = players[playerIndex].hand.filter(c => !isJoker(c) && c.slice(-1) === suit);
  if (cards.length === 0) return null;
  cards.sort((a,b)=> parseCard(b,trumpSuit).value - parseCard(a,trumpSuit).value);
  return cards[0];
}
function removeCardFromHand(playerIndex, cardStr) {
  const i = players[playerIndex].hand.indexOf(cardStr);
  if (i >= 0) players[playerIndex].hand.splice(i, 1);
}
function pairKey(pluckerI, pluckeeI) { return `${pluckerI}-${pluckeeI}`; }

// Suit availability differs for mercy vs normal
function availablePluckSuits(pluckerI, pluckeeI) {
  const used = pluckSuitUsedByPair.get(pairKey(pluckerI, pluckeeI)) || new Set();
  const mercy = (players[pluckeeI].tricks === 0);

  const suits = [];
  for (const s of SUITS) {
    if (used.has(s)) continue;

    // Jokers cannot be forced: we only consider suits where a real card exists
    const pluckeeHas = highestOfSuitNonJoker(pluckeeI, s);
    if (!pluckeeHas) continue;

    if (mercy) {
      // plucker only needs to be able to RECEIVE; no return required
      suits.push(s);
    } else {
      // normal: plucker must be able to GIVE a low card too
      const pluckerHas = lowestOfSuitNonJoker(pluckerI, s);
      if (!pluckerHas) continue;
      suits.push(s);
    }
  }
  return suits;
}

function renderPluckStatus() {
  if (pluckQueue.length === 0) {
    pluckStatusEl.textContent = "No plucks to process.";
    pluckNextBtn.disabled = true;
    return;
  }
  if (!activePluck) activePluck = pluckQueue[0];

  const plucker = players[activePluck.pluckerIndex];
  const pluckee = players[activePluck.pluckeeIndex];
  const mercy = (pluckee.tricks === 0);

  const suits = availablePluckSuits(activePluck.pluckerIndex, activePluck.pluckeeIndex);

  pluckStatusEl.textContent =
    `${plucker.name} plucks ${pluckee.name}. ` +
    (mercy ? `[0-Trick Mercy Rule: ${pluckee.name} surrenders, no return] ` : ``) +
    (suits.length ? `Available suits: ${suits.join(", ")}.` : `No legal suit available (will skip).`);

  pluckNextBtn.disabled = false;
}

function runOnePluck() {
  if (pluckQueue.length === 0) return;
  if (!activePluck) activePluck = pluckQueue[0];

  const pluckerI = activePluck.pluckerIndex;
  const pluckeeI = activePluck.pluckeeIndex;

  const mercy = (players[pluckeeI].tricks === 0);

  const suits = availablePluckSuits(pluckerI, pluckeeI);

  if (suits.length === 0) {
    pluckStatusEl.textContent = `No legal pluck suit for ${players[pluckerI].name} → ${players[pluckeeI].name}. Skipped.`;
  } else {
    const suit = suits[Math.floor(Math.random()*suits.length)];

    const takeHigh = highestOfSuitNonJoker(pluckeeI, suit);
    if (!takeHigh) {
      pluckStatusEl.textContent = `Unexpected: pluckee missing suit ${suit}. Skipped.`;
    } else {
      if (mercy) {
        // MERCY: plucker takes high; returns nothing
        removeCardFromHand(pluckeeI, takeHigh);
        players[pluckerI].hand.push(takeHigh);

        const key = pairKey(pluckerI, pluckeeI);
        if (!pluckSuitUsedByPair.has(key)) pluckSuitUsedByPair.set(key, new Set());
        pluckSuitUsedByPair.get(key).add(suit);

        pluckStatusEl.textContent =
          `${players[pluckeeI].name} (0 tricks) surrendered ${displayCard(takeHigh)} to ${players[pluckerI].name}. Suit=${suit}. (No return)`;
      } else {
        // NORMAL: plucker gives low; pluckee returns high
        const giveLow = lowestOfSuitNonJoker(pluckerI, suit);
        if (!giveLow) {
          pluckStatusEl.textContent = `Unexpected: plucker missing suit ${suit}. Skipped.`;
        } else {
          removeCardFromHand(pluckerI, giveLow);
          removeCardFromHand(pluckeeI, takeHigh);

          players[pluckerI].hand.push(takeHigh);
          players[pluckeeI].hand.push(giveLow);

          const key = pairKey(pluckerI, pluckeeI);
          if (!pluckSuitUsedByPair.has(key)) pluckSuitUsedByPair.set(key, new Set());
          pluckSuitUsedByPair.get(key).add(suit);

          pluckStatusEl.textContent =
            `${players[pluckerI].name} passed (low) ${displayCard(giveLow)}. ` +
            `${players[pluckeeI].name} returned (high) ${displayCard(takeHigh)}. Suit=${suit}.`;
        }
      }
    }
  }

  // Consume exactly one pluck action from the queue
  pluckQueue.shift();
  activePluck = null;

  if (pluckQueue.length === 0) {
    msgEl.textContent = "Pluck phase complete. Click Reset (New Deal) to start next hand.";
    pluckNextBtn.disabled = true;
  }

  render();
}

// ===== Play loop =====
function maybeContinue() {
  if (phase !== "PLAY") return;

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
          computePlucksEarnedAndSuffered();
          pluckQueue = buildPluckQueueFromScores();
          activePluck = null;
          pluckSuitUsedByPair = new Map();

          setPhase("PLUCK");

          const p = players.map(x =>
            `${x.id}: tricks=${x.tricks}, quota=${x.quota}, earned=${x.plucksEarned}, suffered=${x.plucksSuffered}`
          ).join(" | ");

          msgEl.textContent = `Hand over. Plucks computed. ${p}`;
          render();
          return;
        }

        maybeContinue();
      }, 700);
    }, 600);
    return;
  }

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
  applyFixedQuotas();

  const deck = shuffle(makePluckDeck51());
  players.forEach(p => {
    p.hand = [];
    p.tricks = 0;
    p.plucksEarned = 0;
    p.plucksSuffered = 0;
  });

  trickMax = TOTAL_TRICKS;
  trickNumber = 1;

  for (let i=0;i<TOTAL_TRICKS;i++) {
    players[0].hand.push(deck.pop());
    players[1].hand.push(deck.pop());
    players[2].hand.push(deck.pop());
  }

  trick = [];
  leadSuit = null;

  // If clubs is trump, treat trump as opened from the start (2C leads first)
  trumpOpen = (trumpSuit === "C");

  // Who leads: holder of 2C must lead first.
  let whoHas2C = 0;
  for (let pi=0;pi<3;pi++) if (players[pi].hand.includes(CARD_OPEN_LEAD)) { whoHas2C = pi; break; }
  leaderIndex = whoHas2C;
  turnIndex = whoHas2C;

  pluckQueue = [];
  activePluck = null;
  pluckSuitUsedByPair = new Map();

  setPhase("PLAY");
  render();
  maybeContinue();
}

// Events
pluckNextBtn.addEventListener("click", () => {
  if (phase !== "PLUCK") return;
  runOnePluck();
});

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
applyFixedQuotas();
dealNewHands();
console.log("Pluck Demo v10 loaded");
