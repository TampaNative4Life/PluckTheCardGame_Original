// Pluck Web Demo v11: FIX 0-trick mercy -> still returns a card (hand stays 17), but brutal return (any suit junk)
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
function isJoker(cs) { return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }

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

// ===== Players =====
// 0=AI2, 1=AI3, 2=YOU
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

let pluckQueue = [];   // items: { pluckerIndex, pluckeeIndex }
let activePluck = null;

// No duplicate suit plucks per pair
let pluckSuitUsedByPair = new Map(); // key "plucker-pluckee" => Set(suits)

function cardSuitForFollow(cs) {
  if (isJoker(cs)) return trumpSuit;
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
  if (trickNumber === 1 && trick.length === 0 && players[playerIndex].hand.includes(CARD_OPEN_LEAD)) {
    if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
  }
  if (trick.length === 0 && !trumpOpen && trumpSuit !== "C") {
    if (isTrumpCard(cardStr) && hasNonTrump(playerIndex)) return "Trump not open. Lead a non-trump card.";
  }
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
  const hand = players[playerIndex].hand;

  const needed = players[playerIndex].quota - players[playerIndex].tricks;
  const tricksPlayed = trickNumber - 1;
  const tricksLeft = TOTAL_TRICKS - tricksPlayed;

  let bestIdx = legal[0];
  let bestScore = -Infinity;

  for (const idx of legal) {

    const card = hand[idx];
    const parsed = parseCard(card, trumpSuit);

    let score = 0;

    const isTrump = isTrumpCard(card);
    const isBigJoker = (card === CARD_BIG_JOKER);
    const isLittleJoker = (card === CARD_LITTLE_JOKER);

    const cardValue = isJoker(card)
      ? (isBigJoker ? 1000 : 900)
      : parsed.value;

    // ===== Base value =====
    score += cardValue;

    // ===== If AI needs tricks =====
    if (needed > 0) {

      // Must aggressively win if time running out
      if (needed >= tricksLeft) {
        score += 500;
      }

      // Trump helps win
      if (isTrump) score += 300;

      // Jokers extremely valuable late
      if (isBigJoker) score += 500;
      if (isLittleJoker) score += 400;

    }
    else {
      // ===== AI is over quota: dump mode =====
      score -= 1000; // avoid winning

      // Prefer lowest cards
      score -= cardValue * 5;

      // Avoid burning trump or joker
      if (isTrump) score -= 300;
      if (isBigJoker || isLittleJoker) score -= 1000;
    }

    // Slight preference to follow suit powerfully if needed
    if (trick.length > 0 && cardSuitForFollow(card) === leadSuit) {
      score += 50;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  }

  return bestIdx;
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

function removeCardFromHand(playerIndex, cardStr) {
  const i = players[playerIndex].hand.indexOf(cardStr);
  if (i >= 0) players[playerIndex].hand.splice(i, 1);
}

function lowestNonJokerOverall(playerIndex) {
  const cards = players[playerIndex].hand.filter(c => !isJoker(c));
  if (cards.length === 0) return null;
  cards.sort((a,b) => {
    const pa = parseCard(a, trumpSuit);
    const pb = parseCard(b, trumpSuit);
    return pa.value - pb.value;
  });
  return cards[0];
}
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

function pairKey(pluckerI, pluckeeI) { return `${pluckerI}-${pluckeeI}`; }

function availablePluckSuits(pluckerI, pluckeeI) {
  const used = pluckSuitUsedByPair.get(pairKey(pluckerI, pluckeeI)) || new Set();
  const victimZero = (players[pluckeeI].tricks === 0);

  const suits = [];
  for (const s of SUITS) {
    if (used.has(s)) continue;

    const pluckeeHas = highestOfSuitNonJoker(pluckeeI, s);
    if (!pluckeeHas) continue;

    if (victimZero) {
      // 0-trick victim: plucker does not need matching-suit giveback.
      // But plucker MUST have at least one non-joker to return (any suit).
      if (!lowestNonJokerOverall(pluckerI)) continue;
      suits.push(s);
    } else {
      // Normal: plucker must have low card in that suit to give.
      if (!lowestOfSuitNonJoker(pluckerI, s)) continue;
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
  const victimZero = (pluckee.tricks === 0);

  const suits = availablePluckSuits(activePluck.pluckerIndex, activePluck.pluckeeIndex);

  pluckStatusEl.textContent =
    `${plucker.name} plucks ${pluckee.name}. ` +
    (victimZero ? `[0 tricks: victim must surrender high; plucker returns worst card any suit] ` : ``) +
    (suits.length ? `Available suits: ${suits.join(", ")}.` : `No legal suit available (will skip).`);

  pluckNextBtn.disabled = false;
}

function runOnePluck() {
  if (pluckQueue.length === 0) return;
  if (!activePluck) activePluck = pluckQueue[0];

  const pluckerI = activePluck.pluckerIndex;
  const pluckeeI = activePluck.pluckeeIndex;

  const suits = availablePluckSuits(pluckerI, pluckeeI);

  if (suits.length === 0) {
    pluckStatusEl.textContent = `No legal pluck suit for ${players[pluckerI].name} → ${players[pluckeeI].name}. Skipped.`;
  } else {

    // ===== Strategic Suit Selection =====
    let bestSuit = null;
    let bestScore = -Infinity;

    for (const suit of suits) {
      const victimHigh = highestOfSuitNonJoker(pluckeeI, suit);
      const pluckerLow = lowestOfSuitNonJoker(pluckerI, suit);

      if (!victimHigh || !pluckerLow) continue;

      const highVal = parseCard(victimHigh, trumpSuit).value;
      const lowVal = parseCard(pluckerLow, trumpSuit).value;

      const score = highVal - lowVal;

      if (score > bestScore) {
        bestScore = score;
        bestSuit = suit;
      }
    }

    if (!bestSuit) bestSuit = suits[0];

    const takeHigh = highestOfSuitNonJoker(pluckeeI, bestSuit);
    const giveLow = lowestOfSuitNonJoker(pluckerI, bestSuit);

    removeCardFromHand(pluckerI, giveLow);
    removeCardFromHand(pluckeeI, takeHigh);

    players[pluckerI].hand.push(takeHigh);
    players[pluckeeI].hand.push(giveLow);

    const key = pairKey(pluckerI, pluckeeI);
    if (!pluckSuitUsedByPair.has(key)) pluckSuitUsedByPair.set(key, new Set());
    pluckSuitUsedByPair.get(key).add(bestSuit);

    pluckStatusEl.textContent =
      `${players[pluckerI].name} strategically plucked ${bestSuit}. ` +
      `${players[pluckeeI].name} lost ${displayCard(takeHigh)}.`;
  }

  pluckQueue.shift();
  activePluck = null;

  if (pluckQueue.length === 0) {
    msgEl.textContent = "Pluck phase complete. Click Reset (New Deal) to start next hand.";
    pluckNextBtn.disabled = true;
  }

  render();
}      }
    }
  }

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
  trumpOpen = (trumpSuit === "C");

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
console.log("Pluck Demo v11 loaded");
