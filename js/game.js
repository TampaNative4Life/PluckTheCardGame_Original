// Pluck Web Demo v8: Quotas HARD-LOCKED to sum 17 (AI2 + AI3 chosen; YOU auto)
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
const applyQuotaBtn = document.getElementById("applyQuotaBtn");
const qAI2El = document.getElementById("qAI2");
const qAI3El = document.getElementById("qAI3");
const qYOUEl = document.getElementById("qYOU");

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

// Players: 0=AI2, 1=AI3, 2=YOU
const players = [
  { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7, plucks:0 },
  { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6, plucks:0 },
  { id:"YOU", name:"You",            hand:[], tricks:0, quota:4, plucks:0 }
];

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
let pluckQueue = [];
let activePluck = null;

function cardSuitForFollow(cs) {
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

function setPhase(newPhase) {
  phase = newPhase;
  phaseLabelEl.textContent = newPhase;
  pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// HARD-LOCK logic:
// - user can type AI2 + AI3
// - YOU becomes: 17 - AI2 - AI3
// - if AI2+AI3 > 17, clamp the changed field so YOU never negative
function syncQuotas(changed) {
  let a2 = clampInt(qAI2El.value, 0, TOTAL_TRICKS, 7);
  let a3 = clampInt(qAI3El.value, 0, TOTAL_TRICKS, 6);

  if (a2 + a3 > TOTAL_TRICKS) {
    // clamp the one the user just changed
    if (changed === "AI2") {
      a2 = TOTAL_TRICKS - a3;
    } else if (changed === "AI3") {
      a3 = TOTAL_TRICKS - a2;
    } else {
      // fallback: clamp AI3
      a3 = TOTAL_TRICKS - a2;
    }
  }

  const you = TOTAL_TRICKS - a2 - a3;

  // write back to inputs
  qAI2El.value = String(a2);
  qAI3El.value = String(a3);
  qYOUEl.value = String(you);

  // update model
  players[0].quota = a2;
  players[1].quota = a3;
  players[2].quota = you;

  render();
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
    `Phase: ${phase} • Turn: ${players[turnIndex].name} • Lead: ${players[leaderIndex].name} • Lead Suit: ${leadSuit ?? "(none)"} • Trump: ${trumpSuit}`;

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

// ===== Plucks scaffold =====
function computePlucks() {
  for (const p of players) p.plucks = Math.abs(p.tricks - p.quota);
}
function buildPluckQueue() {
  const order = [0,1,2].slice().sort((a,b)=>players[a].plucks - players[b].plucks);
  const victims = [0,1,2].slice().sort((a,b)=>players[b].plucks - players[a].plucks);

  const queue = [];
  for (const plucker of order) {
    let remaining = players[plucker].plucks;
    if (remaining <= 0) continue;
    const pluckee = victims.find(v => v !== plucker) ?? ((plucker+1)%3);
    queue.push({ pluckerIndex: plucker, pluckeeIndex: pluckee, remaining, suitsUsed: new Set() });
  }
  return queue;
}
function lowestCardOfSuitExcludingJokers(playerIndex, suit) {
  const hand = players[playerIndex].hand.filter(c => c !== CARD_BIG_JOKER && c !== CARD_LITTLE_JOKER && c.slice(-1) === suit);
  if (hand.length === 0) return null;
  hand.sort((a,b)=> parseCard(a,trumpSuit).value - parseCard(b,trumpSuit).value);
  return hand[0];
}
function higherCardSameSuitExcludingJokers(playerIndex, suit, minValue) {
  const hand = players[playerIndex].hand.filter(c => c !== CARD_BIG_JOKER && c !== CARD_LITTLE_JOKER && c.slice(-1) === suit);
  const candidates = hand.filter(c => parseCard(c,trumpSuit).value > minValue);
  if (candidates.length === 0) return null;
  candidates.sort((a,b)=> parseCard(a,trumpSuit).value - parseCard(b,trumpSuit).value);
  return candidates[0];
}
function removeCardFromHand(playerIndex, cardStr) {
  const i = players[playerIndex].hand.indexOf(cardStr);
  if (i >= 0) players[playerIndex].hand.splice(i, 1);
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
  pluckStatusEl.textContent =
    `${plucker.name} is plucking ${pluckee.name}. Remaining plucks for this plucker: ${activePluck.remaining}.`;
  pluckNextBtn.disabled = false;
}
function runOnePluck() {
  if (pluckQueue.length === 0) return;
  if (!activePluck) activePluck = pluckQueue[0];

  const pluckerI = activePluck.pluckerIndex;
  const pluckeeI = activePluck.pluckeeIndex;

  const pluckeeSuits = new Set(
    players[pluckeeI].hand
      .filter(c => c !== CARD_BIG_JOKER && c !== CARD_LITTLE_JOKER)
      .map(c => c.slice(-1))
  );

  const suitChoices = Array.from(pluckeeSuits).filter(s => !activePluck.suitsUsed.has(s));
  if (suitChoices.length === 0) {
    activePluck.remaining = 0;
  } else {
    const suit = suitChoices[Math.floor(Math.random()*suitChoices.length)];
    const offered = lowestCardOfSuitExcludingJokers(pluckeeI, suit);

    if (!offered) {
      activePluck.suitsUsed.add(suit);
    } else {
      const offeredVal = parseCard(offered, trumpSuit).value;
      const returned = higherCardSameSuitExcludingJokers(pluckerI, suit, offeredVal);

      if (!returned) {
        activePluck.suitsUsed.add(suit);
      } else {
        removeCardFromHand(pluckeeI, offered);
        removeCardFromHand(pluckerI, returned);
        players[pluckeeI].hand.push(returned);
        players[pluckerI].hand.push(offered);

        activePluck.suitsUsed.add(suit);
        activePluck.remaining -= 1;

        pluckStatusEl.textContent =
          `${players[pluckerI].name} plucked ${displayCard(offered)} from ${players[pluckeeI].name} and returned ${displayCard(returned)}.`;
      }
    }
  }

  if (activePluck.remaining <= 0) {
    pluckQueue.shift();
    activePluck = null;
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
          computePlucks();
          pluckQueue = buildPluckQueue();
          activePluck = null;
          setPhase("PLUCK");

          const p = players.map(x => `${x.id}: tricks=${x.tricks}, quota=${x.quota}, plucks=${x.plucks}`).join(" | ");
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
  const deck = shuffle(makePluckDeck51());
  players.forEach(p => { p.hand = []; p.tricks = 0; p.plucks = 0; });

  trickMax = TOTAL_TRICKS;
  trickNumber = 1;

  for (let i=0;i<TOTAL_TRICKS;i++) {
    players[0].hand.push(deck.pop());
    players[1].hand.push(deck.pop());
    players[2].hand.push(deck.pop());
  }

  trick = [];
  leadSuit = null;
  trumpOpen = false;

  let whoHas2C = 0;
  for (let pi=0;pi<3;pi++) if (players[pi].hand.includes(CARD_OPEN_LEAD)) { whoHas2C = pi; break; }
  leaderIndex = whoHas2C;
  turnIndex = whoHas2C;

  pluckQueue = [];
  activePluck = null;

  setPhase("PLAY");
  render();
  maybeContinue();
}

// Events
qAI2El.addEventListener("input", () => syncQuotas("AI2"));
qAI3El.addEventListener("input", () => syncQuotas("AI3"));

applyQuotaBtn.addEventListener("click", () => {
  syncQuotas("APPLY");
});

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
// Initialize inputs and model using hard-lock
qAI2El.value = qAI2El.value || "7";
qAI3El.value = qAI3El.value || "6";
syncQuotas("APPLY");
dealNewHands();
console.log("Pluck Demo v8 loaded");
