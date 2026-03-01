// Pluck Web Demo v19
// Order: (HAND 1) DEAL -> DEALER SELECTS TRUMP -> PLAY
// After Hand 1 completes: DEAL -> PLUCK -> DEALER SELECTS TRUMP -> PLAY
// First dealer is chosen by "Pluck Deck" draw: lowest card deals.
// Dealer rotates RIGHT each new deal after the first dealer is established.
// Rules enforced: must follow suit if possible. AI plays in order (AI2, AI3, YOU).
// 2♣ must lead Trick 1 if the leader has it.

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

const trumpLabelEl = document.getElementById("trumpLabel");
const trumpOpenLabelEl = document.getElementById("trumpOpenLabel");
const phaseLabelEl = document.getElementById("phaseLabel");
const dealerLabelEl = document.getElementById("dealerLabel");

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
const pluckChoicesEl = document.getElementById("pluckChoices");

const trumpPanelEl = document.getElementById("trumpPanel");
const trumpStatusEl = document.getElementById("trumpStatus");

const pDeal = document.getElementById("pDeal");
const pPluck = document.getElementById("pPluck");
const pTrump = document.getElementById("pTrump");
const pPlay = document.getElementById("pPlay");

// First deal draw UI
const firstDealPanelEl = document.getElementById("firstDealPanel");
const deckRowEl = document.getElementById("deckRow");
const drawResultsEl = document.getElementById("drawResults");
const drawAI2El = document.getElementById("drawAI2");
const drawAI3El = document.getElementById("drawAI3");
const drawYOUEl = document.getElementById("drawYOU");
const drawDealerEl = document.getElementById("drawDealer");
const startFirstDealBtn = document.getElementById("startFirstDealBtn");
const firstDealMsgEl = document.getElementById("firstDealMsg");

// ===== Core constants =====
const TOTAL_TRICKS = 17;
const SUITS = ["S", "H", "D", "C"];
const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

const CARD_BIG_JOKER = "BJ";
const CARD_LITTLE_JOKER = "LJ";
const CARD_OPEN_LEAD = "2C";

const AI_DELAY_MS = 260;
const TRICK_RESOLVE_MS = 280;
const BETWEEN_TRICKS_MS = 240;

function suitName(s) { return s==="S"?"Spades":s==="H"?"Hearts":s==="D"?"Diamonds":"Clubs"; }
function suitSymbol(s){ return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣"; }
function isRedSuit(s){ return s==="H" || s==="D"; }
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
function cardSuitForFollow(cs, trumpSuit) {
  if (isJoker(cs)) return trumpSuit || null;
  return cs.slice(-1);
}
function isTrumpCard(cs, trumpSuit) {
  if (!trumpSuit) return false;
  if (isJoker(cs)) return true;
  return cs.slice(-1) === trumpSuit;
}

// ===== Players =====
// 0=AI2, 1=AI3, 2=YOU
let dealerIndex = 0;
function leftOf(i) { return (i + 1) % 3; }
function rightOf(i) { return (i + 2) % 3; }

const players = [
  { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7, plucksEarned:0, plucksSuffered:0 },
  { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6, plucksEarned:0, plucksSuffered:0 },
  { id:"YOU", name:"You",            hand:[], tricks:0, quota:4, plucksEarned:0, plucksSuffered:0 }
];

function applyQuotasFromDealer() {
  players[dealerIndex].quota = 7;
  players[leftOf(dealerIndex)].quota = 6;
  players[rightOf(dealerIndex)].quota = 4;
}
function rotateDealerRight() {
  dealerIndex = rightOf(dealerIndex);
  applyQuotasFromDealer();
}

// ===== Memory =====
let memory = null;
function resetMemory() {
  memory = {
    played: new Set(),
    voidSuits: [new Set(), new Set(), new Set()],
    trickLog: []
  };
}

// ===== State =====
let trumpSuit = null;
let trumpOpen = false;

let leaderIndex = 0;
let turnIndex = 0;
let leadSuit = null;
let trick = [];
let lockInput = false;

let trickNumber = 1;
let trickMax = TOTAL_TRICKS;

// Phases: FIRST_DEAL_DRAW, DEAL, PLUCK, TRUMP_PICK, PLAY
let phase = "FIRST_DEAL_DRAW";

// IMPORTANT: there is NO PLUCK on Hand 1
let handCount = 0; // increments after each completed hand
let pendingPluckQueue = null; // computed at end of a hand, used on next deal

let pluckQueue = [];
let activePluck = null;
let pluckSuitUsedByPair = new Map();

// ===== Phase UI =====
function setActiveChip(el) {
  [pDeal,pPluck,pTrump,pPlay].forEach(x => x && x.classList.remove("activeChip"));
  if (el) el.classList.add("activeChip");
}
function setPhase(newPhase) {
  phase = newPhase;
  if (phaseLabelEl) phaseLabelEl.textContent = newPhase;

  // panels
  if (pluckPanelEl) pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
  if (trumpPanelEl) trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";

  // first deal draw panel
  if (firstDealPanelEl) firstDealPanelEl.style.display = (newPhase === "FIRST_DEAL_DRAW") ? "block" : "none";

  if (newPhase === "DEAL") setActiveChip(pDeal);
  if (newPhase === "PLUCK") setActiveChip(pPluck);
  if (newPhase === "TRUMP_PICK") setActiveChip(pTrump);
  if (newPhase === "PLAY") setActiveChip(pPlay);
}
function flashDealChip() {
  setActiveChip(pDeal);
  setTimeout(() => {
    if (phase === "PLUCK") setActiveChip(pPluck);
    if (phase === "TRUMP_PICK") setActiveChip(pTrump);
    if (phase === "PLAY") setActiveChip(pPlay);
  }, 350);
}

// ===== Card faces =====
function makeCardFace(cardStr, disabled=false) {
  const el = document.createElement("div");
  el.className = "cardFace" + (disabled ? " disabled" : "");

  if (cardStr === CARD_BIG_JOKER || cardStr === CARD_LITTLE_JOKER) {
    el.classList.add("joker");
    const tl = document.createElement("div");
    tl.className = "corner tl";
    tl.textContent = (cardStr === CARD_BIG_JOKER ? "BJ" : "LJ");
    const br = document.createElement("div");
    br.className = "corner br";
    br.textContent = (cardStr === CARD_BIG_JOKER ? "BJ" : "LJ");
    const mid = document.createElement("div");
    mid.className = "suitBig";
    mid.textContent = "🃏";
    const tag = document.createElement("div");
    tag.className = "jokerTag";
    tag.textContent = (cardStr === CARD_BIG_JOKER ? "BIG JOKER" : "LITTLE JOKER");
    el.appendChild(tl); el.appendChild(br); el.appendChild(mid); el.appendChild(tag);
    return el;
  }

  const suit = cardStr.slice(-1);
  const rank = cardStr.slice(0, cardStr.length-1);
  const colorClass = isRedSuit(suit) ? "red" : "black";
  const sym = suitSymbol(suit);

  const tl = document.createElement("div");
  tl.className = `corner tl ${colorClass}`;
  tl.innerHTML = `${rank}<br>${sym}`;

  const br = document.createElement("div");
  br.className = `corner br ${colorClass}`;
  br.innerHTML = `${rank}<br>${sym}`;

  const mid = document.createElement("div");
  mid.className = `suitBig ${colorClass}`;
  mid.textContent = sym;

  el.appendChild(tl); el.appendChild(br); el.appendChild(mid);
  return el;
}

// ===== Sort (your order request) =====
function sortHandForDisplay(hand) {
  const suitOrder = ["S","H","D","C"];
  const rankOrder = { "A":14,"K":13,"Q":12,"J":11,"10":10,"9":9,"8":8,"7":7,"6":6,"5":5,"4":4,"3":3,"2":2 };

  function suitGroup(s){
    if (trumpSuit && s === trumpSuit) return 0;
    if (trumpSuit) {
      const after = suitOrder.filter(x => x !== trumpSuit);
      return 1 + after.indexOf(s);
    }
    return suitOrder.indexOf(s);
  }
  function key(cs){
    if (cs === CARD_BIG_JOKER) return { sg:0, r:0 };
    if (cs === CARD_LITTLE_JOKER) return { sg:0, r:1 };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    const sg = suitGroup(suit);
    const rv = rankOrder[rank] ?? 0;
    return { sg, r: (100 - rv) };
  }

  return hand.slice().sort((a,b)=>{
    const ka=key(a), kb=key(b);
    if (ka.sg !== kb.sg) return ka.sg - kb.sg;
    return ka.r - kb.r;
  });
}

// ===== Render =====
function render() {
  if (dealerLabelEl) dealerLabelEl.textContent = players[dealerIndex]?.id || "—";
  if (trumpLabelEl) trumpLabelEl.textContent = trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not picked)";
  if (trumpOpenLabelEl) trumpOpenLabelEl.textContent = trumpOpen ? "Yes" : "No";

  ai2QuotaLabelEl.textContent = String(players[0].quota);
  ai3QuotaLabelEl.textContent = String(players[1].quota);
  youQuotaLabelEl.textContent = String(players[2].quota);

  ai2TricksEl.textContent = String(players[0].tricks);
  ai3TricksEl.textContent = String(players[1].tricks);
  youTricksEl.textContent = String(players[2].tricks);

  trickNumEl.textContent = String(trickNumber);
  trickMaxEl.textContent = String(trickMax);

  // AI hand backs
  ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
  ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

  // Turn banner
  const whoseTurn =
    (phase === "PLAY" ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`) : "—");
  turnBannerEl.textContent =
    `Hand: ${handCount + 1} • Phase: ${phase} • Dealer: ${players[dealerIndex].id} • ${whoseTurn}`;

  // Your hand
  handEl.innerHTML = "";
  const sorted = sortHandForDisplay(players[2].hand);

  for (const c of sorted) {
    const realIdx = players[2].hand.indexOf(c);
    const canClick = (phase === "PLAY" && turnIndex === 2 && !lockInput);
    const legal = canClick ? legalIndexesFor(2) : [];
    const disabled = !(canClick && legal.includes(realIdx));

    const face = makeCardFace(c, disabled);
    face.onclick = () => {
      if (disabled) return;
      const legalNow = legalIndexesFor(2);
      if (!legalNow.includes(realIdx)) {
        msgEl.textContent = illegalReason(2, c);
        return;
      }
      playCard(2, realIdx);
    };
    handEl.appendChild(face);
  }

  // Trick pile
  trickEl.innerHTML = "";
  if (!trick.length) trickEl.textContent = "(empty)";
  else {
    for (const t of trick) {
      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.alignItems = "center";
      wrap.style.gap = "6px";

      const label = document.createElement("div");
      label.style.fontSize = "12px";
      label.style.color = "#a6b0c3";
      label.textContent = players[t.playerIndex].id;

      const face = makeCardFace(t.cardStr, true);
      face.style.cursor = "default";

      wrap.appendChild(label);
      wrap.appendChild(face);
      trickEl.appendChild(wrap);
    }
  }

  if (phase === "PLUCK") renderPluckStatus();
  if (phase === "TRUMP_PICK") renderTrumpPickStatus();
}

// ===== First Deal Draw =====
let drawDeck = [];
let drawPool = []; // 3 hidden cards
let youPickedIndex = null;
let drawDone = false;

function drawCardValueForDealerPick(cardStr) {
  // Lowest wins the deal. Jokers are highest (never low).
  if (cardStr === CARD_BIG_JOKER) return 1000;
  if (cardStr === CARD_LITTLE_JOKER) return 900;
  const rank = cardStr.slice(0, cardStr.length-1);
  const v = RANK_VALUE[rank] || 0;
  return v;
}

function setupFirstDealDraw() {
  setPhase("FIRST_DEAL_DRAW");
  drawDone = false;
  youPickedIndex = null;

  drawDeck = shuffle(makePluckDeck51().slice());
  drawPool = [drawDeck.pop(), drawDeck.pop(), drawDeck.pop()];

  deckRowEl.innerHTML = "";
  drawResultsEl.style.display = "none";
  firstDealMsgEl.textContent = "Click ONE face-down card for YOU.";

  // create 3 face-down cards
  for (let i=0;i<3;i++) {
    const d = document.createElement("div");
    d.className = "deckCard";
    d.innerHTML = `<div class="backMark">PLUCK</div>`;
    d.onclick = () => onYouPickDrawCard(i);
    deckRowEl.appendChild(d);
  }

  if (startFirstDealBtn) startFirstDealBtn.disabled = true;
}

function onYouPickDrawCard(poolIndex) {
  if (drawDone) return;
  youPickedIndex = poolIndex;

  const remaining = [0,1,2].filter(i => i !== poolIndex);
  // AI picks randomly from remaining
  const ai2Pick = remaining[Math.floor(Math.random()*remaining.length)];
  const remaining2 = remaining.filter(i => i !== ai2Pick);
  const ai3Pick = remaining2[0];

  const youCard = drawPool[poolIndex];
  const ai2Card = drawPool[ai2Pick];
  const ai3Card = drawPool[ai3Pick];

  drawYOUEl.textContent = youCard;
  drawAI2El.textContent = ai2Card;
  drawAI3El.textContent = ai3Card;

  // find lowest
  const vals = [
    { pi:0, card:ai2Card, v:drawCardValueForDealerPick(ai2Card) },
    { pi:1, card:ai3Card, v:drawCardValueForDealerPick(ai3Card) },
    { pi:2, card:youCard, v:drawCardValueForDealerPick(youCard) }
  ].sort((a,b)=> a.v - b.v);

  dealerIndex = vals[0].pi;
  applyQuotasFromDealer();

  drawDealerEl.textContent = `${players[dealerIndex].id} (lowest: ${vals[0].card})`;

  drawResultsEl.style.display = "block";
  firstDealMsgEl.textContent = "First dealer decided. Click Start First Deal.";
  drawDone = true;

  if (startFirstDealBtn) startFirstDealBtn.disabled = false;
}

if (startFirstDealBtn) {
  startFirstDealBtn.addEventListener("click", () => {
    firstDealPanelEl.style.display = "none";
    startNewDeal(true); // first deal
  });
}

// ===== Plucks (same as your prior logic; starts AFTER hand 1) =====
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
function lowestOfSuitNonJoker(playerIndex, suit) {
  const cards = players[playerIndex].hand.filter(c => !isJoker(c) && c.slice(-1) === suit);
  if (!cards.length) return null;
  cards.sort((a,b)=> (RANK_VALUE[a.slice(0,-1)]||0) - (RANK_VALUE[b.slice(0,-1)]||0));
  return cards[0];
}
function highestOfSuitNonJoker(playerIndex, suit) {
  const cards = players[playerIndex].hand.filter(c => !isJoker(c) && c.slice(-1) === suit);
  if (!cards.length) return null;
  cards.sort((a,b)=> (RANK_VALUE[b.slice(0,-1)]||0) - (RANK_VALUE[a.slice(0,-1)]||0));
  return cards[0];
}
function pairKey(pluckerI, pluckeeI) { return `${pluckerI}-${pluckeeI}`; }
function markPluckSuitUsed(pluckerI, pluckeeI, suit) {
  const key = pairKey(pluckerI, pluckeeI);
  if (!pluckSuitUsedByPair.has(key)) pluckSuitUsedByPair.set(key, new Set());
  pluckSuitUsedByPair.get(key).add(suit);
}
function availablePluckSuits(pluckerI, pluckeeI) {
  const used = pluckSuitUsedByPair.get(pairKey(pluckerI, pluckeeI)) || new Set();
  const suits = [];
  for (const s of SUITS) {
    if (used.has(s)) continue;
    if (!lowestOfSuitNonJoker(pluckerI, s)) continue;
    suits.push(s);
  }
  return suits;
}
function attemptPluck(pluckerI, pluckeeI, suit) {
  const giveLow = lowestOfSuitNonJoker(pluckerI, suit);
  if (!giveLow) return { ok:false, reason:`Plucker has no ${suit}.` };

  const takeHigh = highestOfSuitNonJoker(pluckeeI, suit);
  if (!takeHigh) return { ok:false, reason:`Victim has no ${suit} to return.` };

  removeCardFromHand(pluckerI, giveLow);
  removeCardFromHand(pluckeeI, takeHigh);

  players[pluckerI].hand.push(takeHigh);
  players[pluckeeI].hand.push(giveLow);

  markPluckSuitUsed(pluckerI, pluckeeI, suit);
  return { ok:true, giveLow, takeHigh };
}
function clearPluckChoicesUI() { if (pluckChoicesEl) pluckChoicesEl.innerHTML = ""; }

function renderPluckStatus() {
  clearPluckChoicesUI();

  if (!pluckQueue.length) {
    pluckStatusEl.textContent = "No plucks to process.";
    pluckNextBtn.disabled = true;
    return;
  }
  if (!activePluck) activePluck = pluckQueue[0];

  const pluckerI = activePluck.pluckerIndex;
  const pluckeeI = activePluck.pluckeeIndex;

  const suits = availablePluckSuits(pluckerI, pluckeeI);

  if (pluckerI === 2) {
    pluckNextBtn.disabled = true;

    if (!suits.length) {
      pluckStatusEl.textContent = `You are plucking ${players[pluckeeI].name}, but have no suit to attempt. This pluck is skipped.`;
      return;
    }

    pluckStatusEl.textContent =
      `You are plucking ${players[pluckeeI].name}. Choose a suit. Wrong suit attempt = LOST.`;

    for (const s of suits) {
      const give = lowestOfSuitNonJoker(pluckerI, s);

      const btn = document.createElement("button");
      btn.className = "btn";
      btn.style.padding = "10px 12px";
      btn.innerHTML = `<strong>${s}</strong> (${suitName(s)})<div style="font-size:12px;opacity:.85;">Give: ${give || "(none)"}</div>`;

      btn.onclick = () => {
        const res = attemptPluck(pluckerI, pluckeeI, s);
        if (!res.ok) {
          markPluckSuitUsed(pluckerI, pluckeeI, s);
          pluckStatusEl.textContent = `You attempted ${s} and FAILED (${res.reason}). Pluck LOST.`;
        } else {
          pluckStatusEl.textContent = `You plucked ${s}: gave ${res.giveLow}, received ${res.takeHigh}.`;
        }

        pluckQueue.shift();
        activePluck = null;

        if (!pluckQueue.length) moveToTrumpPick();
        render();
      };

      pluckChoicesEl.appendChild(btn);
    }
    return;
  }

  // AI pluck (one-click)
  pluckNextBtn.disabled = false;
  pluckStatusEl.textContent =
    `${players[pluckerI].name} is plucking ${players[pluckeeI].name}. Candidate suits: ${suits.join(", ") || "(none)"}.`;
}

function runOnePluck() {
  if (phase !== "PLUCK") return;
  if (!pluckQueue.length) return;
  if (!activePluck) activePluck = pluckQueue[0];

  const pluckerI = activePluck.pluckerIndex;
  const pluckeeI = activePluck.pluckeeIndex;

  const candidates = availablePluckSuits(pluckerI, pluckeeI);
  if (!candidates.length) {
    pluckStatusEl.textContent = `No suit available for ${players[pluckerI].name} → ${players[pluckeeI].name}. Skipped.`;
    pluckQueue.shift();
    activePluck = null;
    if (!pluckQueue.length) moveToTrumpPick();
    render();
    return;
  }

  // AI chooses suit: cheapest give card
  const scored = candidates.map(s => {
    const low = lowestOfSuitNonJoker(pluckerI, s);
    const lowVal = low ? (RANK_VALUE[low.slice(0,-1)]||99) : 99;
    return { s, lowVal };
  }).sort((a,b)=> a.lowVal - b.lowVal);

  const pick = scored[0].s;
  const res = attemptPluck(pluckerI, pluckeeI, pick);

  if (!res.ok) {
    markPluckSuitUsed(pluckerI, pluckeeI, pick);
    pluckStatusEl.textContent = `${players[pluckerI].name} attempted ${pick} and FAILED (${res.reason}). Pluck LOST.`;
  } else {
    pluckStatusEl.textContent = `${players[pluckerI].name} plucked ${pick}: gave ${res.giveLow}, received ${res.takeHigh}.`;
  }

  pluckQueue.shift();
  activePluck = null;

  if (!pluckQueue.length) moveToTrumpPick();
  render();
}

// ===== Trump Pick (DEALER) =====
function aiChooseTrumpFromOwnHand(aiIndex) {
  const hand = players[aiIndex].hand;
  const suitScore = { S:0, H:0, D:0, C:0 };

  for (const cs of hand) {
    if (isJoker(cs)) { suitScore.S+=6; suitScore.H+=6; suitScore.D+=6; suitScore.C+=6; continue; }
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    const v = RANK_VALUE[rank] || 0;

    suitScore[suit] += 2; // length
    if (v >= 11) suitScore[suit] += (v - 10) * 2; // J/Q/K/A weight
    else suitScore[suit] += Math.max(0, v - 6) * 0.5;
  }

  let bestSuit = "H", bestScore = -Infinity;
  for (const s of SUITS) {
    if (suitScore[s] > bestScore) { bestScore = suitScore[s]; bestSuit = s; }
  }
  return bestSuit;
}

function setTrump(suit) {
  trumpSuit = suit;
  trumpOpen = false; // opens when a trump is played
}

function renderTrumpPickStatus() {
  if (trumpSuit) {
    trumpStatusEl.textContent = `Trump picked: ${trumpSuit} (${suitName(trumpSuit)}).`;
    return;
  }
  const caller = players[dealerIndex];
  trumpStatusEl.textContent = `${caller.name} is the dealer. Dealer selects trump now.`;
}

function wireTrumpButtons() {
  const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
  btns.forEach(b => {
    b.onclick = () => {
      if (phase !== "TRUMP_PICK") return;
      if (trumpSuit) return;
      if (dealerIndex !== 2) return; // only allow YOU to click if YOU are dealer

      const suit = b.getAttribute("data-trump");
      if (!SUITS.includes(suit)) return;

      setTrump(suit);
      trumpStatusEl.textContent = `You picked trump: ${suit} (${suitName(suit)}).`;
      moveToPlay();
      render();
    };
  });
}

// ===== PLAY rules =====
function hasNonTrump(playerIndex) {
  return players[playerIndex].hand.some(c => !isTrumpCard(c, trumpSuit));
}

function illegalReason(playerIndex, cardStr) {
  if (trickNumber === 1 && trick.length === 0 && players[playerIndex].hand.includes(CARD_OPEN_LEAD)) {
    if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
  }
  if (trick.length === 0 && !trumpOpen) {
    if (isTrumpCard(cardStr, trumpSuit) && hasNonTrump(playerIndex)) return "Trump not open. Lead a non-trump card.";
  }
  if (trick.length > 0) {
    const mustSuit = leadSuit;
    const hasSuit = players[playerIndex].hand.some(c => cardSuitForFollow(c, trumpSuit) === mustSuit);
    if (hasSuit && cardSuitForFollow(cardStr, trumpSuit) !== mustSuit) return `You must follow suit: ${mustSuit}.`;
  }
  return "That play is not allowed.";
}

function legalIndexesFor(playerIndex) {
  const hand = players[playerIndex].hand;

  // Trick 1 lead forced 2C if you have it
  if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
    return hand.map((c,i)=>({c,i})).filter(x=>x.c === CARD_OPEN_LEAD).map(x=>x.i);
  }

  // cannot lead trump if not open and you have non-trump
  if (trick.length === 0 && !trumpOpen) {
    const nonTrumpIdx = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c, trumpSuit)).map(x=>x.i);
    if (nonTrumpIdx.length > 0) return nonTrumpIdx;
    return hand.map((_,i)=>i);
  }

  // must follow suit if possible
  if (trick.length > 0) {
    const suited = hand.map((c,i)=>({c,i})).filter(x => cardSuitForFollow(x.c, trumpSuit) === leadSuit).map(x=>x.i);
    return suited.length ? suited : hand.map((_,i)=>i);
  }

  return hand.map((_,i)=>i);
}

function setLeadSuitFromFirstCard(cardStr) { leadSuit = cardSuitForFollow(cardStr, trumpSuit); }
function updateTrumpOpen(cardStr) { if (!trumpOpen && isTrumpCard(cardStr, trumpSuit)) trumpOpen = true; }

function cardPower(cardStr) {
  if (cardStr === CARD_BIG_JOKER) return 1000000;
  if (cardStr === CARD_LITTLE_JOKER) return 900000;

  const c = parseCard(cardStr, trumpSuit);
  if (isTrumpCard(cardStr, trumpSuit)) return 10000 + c.value;
  return c.value;
}

function evaluateTrickWinner() {
  const anyTrump = trick.some(t => isTrumpCard(t.cardStr, trumpSuit));

  if (anyTrump) {
    let best = null, bestP = -1;
    for (const t of trick) {
      if (!isTrumpCard(t.cardStr, trumpSuit)) continue;
      const p = cardPower(t.cardStr);
      if (p > bestP) { bestP = p; best = t; }
    }
    return best.playerIndex;
  }

  let best = null, bestV = -1;
  for (const t of trick) {
    if (cardSuitForFollow(t.cardStr, trumpSuit) !== leadSuit) continue;
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

function updateVoidMemory(playerIndex, playedCard) {
  if (trick.length === 0) return;
  const mustSuit = leadSuit;
  const playedSuit = cardSuitForFollow(playedCard, trumpSuit);
  if (playedSuit !== mustSuit) memory.voidSuits[playerIndex].add(mustSuit);
}

function playCard(playerIndex, handIdx) {
  const cardStr = players[playerIndex].hand.splice(handIdx, 1)[0];
  if (!cardStr) { showError("Tried to play empty card."); return; }

  if (trick.length === 0) setLeadSuitFromFirstCard(cardStr);
  else updateVoidMemory(playerIndex, cardStr);

  trick.push({ playerIndex, cardStr });
  memory.played.add(cardStr);

  updateTrumpOpen(cardStr);

  turnIndex = (turnIndex + 1) % 3;
  render();
  maybeContinue();
}

// ===== AI always tries to win =====
function chooseAiIndex(playerIndex) {
  const legal = legalIndexesFor(playerIndex);
  const hand = players[playerIndex].hand;

  // If following: try to win if possible; else dump lowest legal.
  if (trick.length > 0) {
    let winning = [];
    for (const idx of legal) {
      const c = hand[idx];
      if (wouldWinIfPlayedNow(playerIndex, c)) winning.push(idx);
    }
    if (winning.length) {
      // choose smallest winning card (don’t waste power)
      winning.sort((a,b)=> cardPower(hand[a]) - cardPower(hand[b]));
      return winning[0];
    }
    // dump lowest
    legal.sort((a,b)=> cardPower(hand[a]) - cardPower(hand[b]));
    return legal[0];
  }

  // Leading: prefer non-trump if trump not open and you have non-trump.
  // Otherwise lead medium-high to press opponents.
  legal.sort((a,b)=> cardPower(hand[b]) - cardPower(hand[a]));
  return legal[0];
}

function wouldWinIfPlayedNow(playerIndex, cardStr) {
  const temp = trick.concat([{ playerIndex, cardStr }]);
  const anyTrump = temp.some(t => isTrumpCard(t.cardStr, trumpSuit));
  if (anyTrump) {
    let bestPi = temp[0].playerIndex;
    let bestP = -1;
    for (const t of temp) {
      if (!isTrumpCard(t.cardStr, trumpSuit)) continue;
      const p = cardPower(t.cardStr);
      if (p > bestP) { bestP = p; bestPi = t.playerIndex; }
    }
    return bestPi === playerIndex;
  } else {
    let bestPi = temp[0].playerIndex;
    let bestV = -1;
    for (const t of temp) {
      if (cardSuitForFollow(t.cardStr, trumpSuit) !== leadSuit) continue;
      const v = parseCard(t.cardStr, trumpSuit).value;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi === playerIndex;
  }
}

// ===== Trick start =====
function startTrickOne() {
  trick = [];
  leadSuit = null;
  trickNumber = 1;

  // Find who has 2C; they lead trick 1
  let whoHas2C = 0;
  for (let pi=0; pi<3; pi++) {
    if (players[pi].hand.includes(CARD_OPEN_LEAD)) { whoHas2C = pi; break; }
  }
  leaderIndex = whoHas2C;
  turnIndex = whoHas2C;

  render();
  maybeContinue();
}

// ===== Main loop =====
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
          // end hand -> compute plucks for NEXT hand
          computePlucksEarnedAndSuffered();
          pendingPluckQueue = buildPluckQueueFromScores();
          handCount += 1;

          msgEl.textContent = `Hand over. Click Reset for next deal. (Hand ${handCount + 1} will include plucks.)`;
          return;
        }

        maybeContinue();
      }, BETWEEN_TRICKS_MS);
    }, TRICK_RESOLVE_MS);

    return;
  }

  // AI turns
  if (turnIndex !== 2) {
    lockInput = true;
    setTimeout(() => {
      const aiIdx = chooseAiIndex(turnIndex);
      playCard(turnIndex, aiIdx);
      lockInput = false;
      render();
    }, AI_DELAY_MS);
  }
}

// ===== Deal + phase kick =====
function dealNewHands() {
  resetMemory();

  const deck = shuffle(makePluckDeck51());
  players.forEach(p => {
    p.hand = [];
    p.tricks = 0;
    p.plucksEarned = 0;
    p.plucksSuffered = 0;
  });

  trickMax = TOTAL_TRICKS;
  trickNumber = 1;
  trick = [];
  leadSuit = null;

  for (let i=0;i<TOTAL_TRICKS;i++) {
    players[0].hand.push(deck.pop());
    players[1].hand.push(deck.pop());
    players[2].hand.push(deck.pop());
  }

  // trump chosen after deal (and after plucks if applicable)
  trumpSuit = null;
  trumpOpen = false;

  pluckSuitUsedByPair = new Map();
  activePluck = null;
  pluckQueue = [];

  flashDealChip();
}

function startPluckOrTrumpAfterDeal() {
  // Hand 1: skip plucks entirely
  if (handCount === 0) {
    msgEl.textContent = "Hand 1: No plucks. Dealer selects trump.";
    moveToTrumpPick();
    return;
  }

  // Hand 2+: plucks come from previous hand results
  pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
  pendingPluckQueue = null;

  if (!pluckQueue.length) {
    msgEl.textContent = "No plucks this hand. Dealer selects trump.";
    moveToTrumpPick();
    return;
  }

  setPhase("PLUCK");
  msgEl.textContent = "Pluck phase begins (manual).";
  render();
}

function moveToTrumpPick() {
  setPhase("TRUMP_PICK");
  renderTrumpPickStatus();
  render();

  // Dealer picks trump
  if (dealerIndex !== 2) {
    const s = aiChooseTrumpFromOwnHand(dealerIndex);
    setTrump(s);
    msgEl.textContent = `${players[dealerIndex].name} picked trump: ${s} (${suitName(s)}).`;
    moveToPlay();
    render();
  } else {
    msgEl.textContent = "You are the dealer. Pick trump now.";
  }
}

function moveToPlay() {
  setPhase("PLAY");
  msgEl.textContent = "Trump set. Trick 1 begins.";
  startTrickOne();
}

// ===== Start new deal =====
function startNewDeal(isFirstDeal=false) {
  setPhase("DEAL");
  if (!isFirstDeal) rotateDealerRight(); // after first dealer is chosen, deals rotate right
  dealNewHands();

  // After deal: either pluck (if handCount>0 and pending exists) or trump pick
  startPluckOrTrumpAfterDeal();
  render();
}

// ===== Events =====
pluckNextBtn.addEventListener("click", () => runOnePluck());
resetBtn.addEventListener("click", () => startNewDeal(false));
wireTrumpButtons();

// ===== Boot =====
applyQuotasFromDealer();
render();
setupFirstDealDraw();
console.log("Pluck Demo v19 loaded");
