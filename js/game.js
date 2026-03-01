// Pluck Web Demo (stable reset)
// Fixes: click-to-play broken, first-hand no pluck, dealer pick (show all 3 cards), phase highlight,
// left sidebar used for dealer pick + trump ace display, play area shifted right.

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.textContent = "ERROR: " + msg;
  console.error(msg);
}
window.addEventListener("error", (e) => showError(e.message || "Unknown script error"));

// Elements (must exist)
const handEl = document.getElementById("hand");
const trickEl = document.getElementById("trick");
const msgEl = document.getElementById("msg");
const resetBtn = document.getElementById("resetBtn");

const ai2HandEl = document.getElementById("ai2Hand");
const ai3HandEl = document.getElementById("ai3Hand");

const turnBannerEl = document.getElementById("turnBanner");
const phaseLabelEl = document.getElementById("phaseLabel");

const trumpLabelEl = document.getElementById("trumpLabel");
const trumpOpenLabelEl = document.getElementById("trumpOpenLabel");
const trumpAceEl = document.getElementById("trumpAce");

const ai2TricksEl = document.getElementById("ai2Tricks");
const ai3TricksEl = document.getElementById("ai3Tricks");
const youTricksEl = document.getElementById("youTricks");

const ai2QuotaLabelEl = document.getElementById("ai2Quota");
const ai3QuotaLabelEl = document.getElementById("ai3Quota");
const youQuotaLabelEl = document.getElementById("youQuota");

const trickNumEl = document.getElementById("trickNum");
const trickMaxEl = document.getElementById("trickMax");
const handNumEl = document.getElementById("handNum");
const dealerLabelEl = document.getElementById("dealerLabel");

const pluckPanelEl = document.getElementById("pluckPanel");
const pluckStatusEl = document.getElementById("pluckStatus");
const pluckNextBtn = document.getElementById("pluckNextBtn");
const pluckChoicesEl = document.getElementById("pluckChoices");

const trumpPanelEl = document.getElementById("trumpPanel");
const trumpStatusEl = document.getElementById("trumpStatus");

// Phase chips
const pPick = document.getElementById("pPick");
const pDeal = document.getElementById("pDeal");
const pPluck = document.getElementById("pPluck");
const pTrump = document.getElementById("pTrump");
const pPlay = document.getElementById("pPlay");

// Dealer pick UI
const pickPanelEl = document.getElementById("pickPanel");
const pickRowEl = document.getElementById("pickRow");
const pickMsgEl = document.getElementById("pickMsg");
const pickRestartBtn = document.getElementById("pickRestartBtn");

// ===== Core constants =====
const TOTAL_TRICKS = 17;
const SUITS = ["S", "H", "D", "C"];
const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

const CARD_BIG_JOKER = "BJ";
const CARD_LITTLE_JOKER = "LJ";
const CARD_OPEN_LEAD = "2C";

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
function leftOf(i) { return (i + 1) % 3; }
function rightOf(i) { return (i + 2) % 3; }

const players = [
  { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7, plucksEarned:0, plucksSuffered:0 },
  { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6, plucksEarned:0, plucksSuffered:0 },
  { id:"YOU", name:"You",            hand:[], tricks:0, quota:4, plucksEarned:0, plucksSuffered:0 }
];

// Dealer/hand state
let dealerIndex = 0;
let handNumber = 1;

// ===== Memory (public inference only) =====
let memory = null;
function resetMemory() {
  memory = {
    played: new Set(),
    voidSuits: [new Set(), new Set(), new Set()],
    trickLog: []
  };
}

// ===== Game state =====
let phase = "PICK"; // PICK | DEAL | PLUCK | TRUMP_PICK | PLAY
let trumpSuit = null;
let trumpOpen = false;

let leaderIndex = 0;
let turnIndex = 0;
let leadSuit = null;
let trick = [];
let lockInput = false;

let trickNumber = 1;
let trickMax = TOTAL_TRICKS;

let pendingPluckQueue = null;
let pluckQueue = [];
let activePluck = null;
let pluckSuitUsedByPair = new Map(); // "plucker-pluckee" => Set(suits)

function setPhase(newPhase) {
  phase = newPhase;
  if (phaseLabelEl) phaseLabelEl.textContent = newPhase;

  // panels
  if (pluckPanelEl) pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
  if (trumpPanelEl) trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";
  if (pickPanelEl)  pickPanelEl.style.display  = (newPhase === "PICK") ? "block" : "none";

  // highlight chips
  [pPick,pDeal,pPluck,pTrump,pPlay].forEach(x => x && x.classList.remove("activeChip"));
  if (newPhase === "PICK" && pPick) pPick.classList.add("activeChip");
  if (newPhase === "DEAL" && pDeal) pDeal.classList.add("activeChip");
  if (newPhase === "PLUCK" && pPluck) pPluck.classList.add("activeChip");
  if (newPhase === "TRUMP_PICK" && pTrump) pTrump.classList.add("activeChip");
  if (newPhase === "PLAY" && pPlay) pPlay.classList.add("activeChip");
}

// ===== Card UI (reliable click faces) =====
function makeCardFace(cardStr, disabled=false, faceDown=false) {
  const el = document.createElement("div");
  el.className = "cardFace" + (disabled ? " disabled" : "");
  if (faceDown) el.classList.add("faceDown");

  if (faceDown) {
    const mid = document.createElement("div");
    mid.className = "suitBig";
    mid.textContent = "PLUCK";
    el.appendChild(mid);
    return el;
  }

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

// ===== Sorting =====
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

// ===== Dealer Pick (initial only) =====
let pickDeck = [];
let pickPicks = [null, null, null];
let pickRevealed = false;

function cardPickValue(cs) {
  // Lowest wins dealer. 2C treated as rank 2 (lowest), 3..A, then LJ,BJ (highest).
  if (cs === CARD_BIG_JOKER) return 200;
  if (cs === CARD_LITTLE_JOKER) return 190;
  if (cs === "2C") return 2;
  const suit = cs.slice(-1);
  const rank = cs.slice(0, cs.length-1);
  const base = RANK_VALUE[rank] || 999;

  // suit tiebreak (rare): Clubs < Diamonds < Hearts < Spades
  const suitTie = (suit === "C" ? 0 : suit === "D" ? 1 : suit === "H" ? 2 : 3);
  return base * 10 + suitTie;
}

function resetDealerPick() {
  setPhase("PICK");
  pickDeck = shuffle(makePluckDeck51().slice());
  pickPicks = [null, null, null];
  pickRevealed = false;
  if (pickMsgEl) pickMsgEl.textContent = "Pick a card (YOU).";
  renderDealerPick();
  render();
}

function renderDealerPick() {
  if (!pickRowEl) return;
  pickRowEl.innerHTML = "";

  const labels = ["AI2", "AI3", "YOU"];
  for (let i=0;i<3;i++) {
    const slot = document.createElement("div");
    slot.className = "pickSlot";

    const nm = document.createElement("div");
    nm.className = "pickName";
    nm.textContent = labels[i];

    let face;
    const card = pickPicks[i];

    if (!pickRevealed) {
      // Before reveal: YOU can click your facedown; AIs are facedown too.
      face = makeCardFace("X", false, true);
      if (i === 2 && !pickPicks[2]) {
        face.title = "Click to pick";
        face.onclick = () => {
          if (phase !== "PICK") return;
          if (pickPicks[2]) return;

          // YOU pick random from deck
          pickPicks[2] = pickDeck.pop();

          // AI pick two random remaining
          pickPicks[0] = pickDeck.pop();
          pickPicks[1] = pickDeck.pop();

          pickRevealed = true;

          // Decide dealer = lowest value
          const vals = pickPicks.map(cardPickValue);
          let best = 0;
          for (let k=1;k<3;k++) if (vals[k] < vals[best]) best = k;

          // Map best index in pick view to playerIndex (0=AI2,1=AI3,2=YOU)
          dealerIndex = best;

          if (pickMsgEl) {
            pickMsgEl.textContent =
              `Revealed: AI2=${pickPicks[0]}, AI3=${pickPicks[1]}, YOU=${pickPicks[2]}. Lowest card deals → ${players[dealerIndex].id}.`;
          }

          // Start game flow
          startNewHandAfterDealerPick();
        };
      }
    } else {
      // Reveal actual cards
      face = makeCardFace(card, true, false);
      face.style.cursor = "default";
    }

    slot.appendChild(nm);
    slot.appendChild(face);
    pickRowEl.appendChild(slot);
  }
}

function startNewHandAfterDealerPick() {
  // Hand 1 begins right after dealer pick
  handNumber = 1;
  if (handNumEl) handNumEl.textContent = String(handNumber);

  // First hand: NO PLUCK phase
  dealNewHands();
  setPhase("TRUMP_PICK");
  msgEl.textContent = "Hand 1: Dealer selects trump (no pluck phase on first hand).";
  render();
  // If dealer is AI, auto-pick trump
  autoTrumpIfAiDealer();
}

// ===== Quotas rotate with dealer =====
function applyQuotasByDealer() {
  players[dealerIndex].quota = 7;
  players[leftOf(dealerIndex)].quota = 6;
  players[rightOf(dealerIndex)].quota = 4;
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

  if (pluckQueue.length === 0) {
    pluckStatusEl.textContent = "No plucks to process.";
    pluckNextBtn.disabled = true;
    return;
  }
  if (!activePluck) activePluck = pluckQueue[0];

  const pluckerI = activePluck.pluckerIndex;
  const pluckeeI = activePluck.pluckeeIndex;
  const plucker = players[pluckerI];
  const pluckee = players[pluckeeI];

  const suits = availablePluckSuits(pluckerI, pluckeeI);

  // YOU pluck: suit buttons
  if (pluckerI === 2) {
    pluckNextBtn.disabled = true;

    if (!suits.length) {
      pluckStatusEl.textContent = `You are plucking ${pluckee.name}, but have no suit to attempt. Skipping.`;
      pluckNextBtn.disabled = false;
      return;
    }

    pluckStatusEl.textContent = `You are plucking ${pluckee.name}. Choose a suit. Wrong suit attempt = LOST.`;

    for (const s of suits) {
      const give = lowestOfSuitNonJoker(pluckerI, s);

      const btn = document.createElement("button");
      btn.className = "btn";
      btn.style.padding = "10px 12px";
      btn.innerHTML = `<strong>${s}</strong> (${suitName(s)})<div style="font-size:12px;opacity:.85;">Give: ${give}</div>`;

      btn.onclick = () => {
        const res = attemptPluck(pluckerI, pluckeeI, s);

        if (!res.ok) {
          markPluckSuitUsed(pluckerI, pluckeeI, s);
          pluckStatusEl.textContent = `FAILED (${res.reason}). Pluck LOST. Next.`;
        } else {
          pluckStatusEl.textContent = `Plucked ${s}: gave ${res.giveLow}, received ${res.takeHigh}.`;
        }

        pluckQueue.shift();
        activePluck = null;

        if (pluckQueue.length === 0) moveToTrumpPick();
        render();
      };

      pluckChoicesEl.appendChild(btn);
    }
    return;
  }

  // AI pluck
  pluckNextBtn.disabled = false;
  if (!suits.length) pluckStatusEl.textContent = `${plucker.name} → ${pluckee.name}: no suit to attempt. Skipping.`;
  else pluckStatusEl.textContent = `${plucker.name} is plucking ${pluckee.name}. Candidate suits: ${suits.join(", ")}.`;
}

function runOnePluck() {
  if (phase !== "PLUCK") return;
  if (!pluckQueue.length) return;
  if (!activePluck) activePluck = pluckQueue[0];

  const pluckerI = activePluck.pluckerIndex;
  const pluckeeI = activePluck.pluckeeIndex;

  const candidates = availablePluckSuits(pluckerI, pluckeeI);

  if (!candidates.length) {
    pluckStatusEl.textContent = `No available suit for ${players[pluckerI].name} → ${players[pluckeeI].name}. Skipped.`;
    pluckQueue.shift();
    activePluck = null;
    if (!pluckQueue.length) moveToTrumpPick();
    render();
    return;
  }

  if (pluckerI === 2) {
    pluckStatusEl.textContent = "Choose a suit button to pluck.";
    render();
    return;
  }

  // AI picks a random candidate (blind, chaotic)
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const res = attemptPluck(pluckerI, pluckeeI, pick);

  if (!res.ok) {
    markPluckSuitUsed(pluckerI, pluckeeI, pick);
    pluckStatusEl.textContent = `${players[pluckerI].name} attempted ${pick} and FAILED. Pluck LOST.`;
  } else {
    pluckStatusEl.textContent = `${players[pluckerI].name} plucked ${pick}: gave ${res.giveLow}, received ${res.takeHigh}.`;
  }

  pluckQueue.shift();
  activePluck = null;

  if (!pluckQueue.length) moveToTrumpPick();
  render();
}

// ===== Trump Pick =====
function aiChooseTrumpFromOwnHand(aiIndex) {
  const hand = players[aiIndex].hand;
  const suitScore = { S:0, H:0, D:0, C:0 };

  for (const cs of hand) {
    if (isJoker(cs)) { suitScore.S += 6; suitScore.H += 6; suitScore.D += 6; suitScore.C += 6; continue; }
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    const v = RANK_VALUE[rank] || 0;
    suitScore[suit] += 2;
    if (v >= 11) suitScore[suit] += (v - 10) * 2;
    else suitScore[suit] += Math.max(0, v - 6) * 0.5;
  }

  let bestSuit = "H", bestScore = -Infinity;
  for (const s of SUITS) if (suitScore[s] > bestScore) { bestScore = suitScore[s]; bestSuit = s; }
  return bestSuit;
}

function setTrump(suit) {
  trumpSuit = suit;
  trumpOpen = (trumpSuit === "C"); // keep your existing behavior
}

function renderTrumpAce() {
  if (!trumpAceEl) return;
  trumpAceEl.innerHTML = "";

  if (!trumpSuit) {
    trumpAceEl.textContent = "(none)";
    return;
  }
  const ace = "A" + trumpSuit;
  const face = makeCardFace(ace, true, false);
  face.style.cursor = "default";
  trumpAceEl.appendChild(face);
}

function autoTrumpIfAiDealer() {
  if (phase !== "TRUMP_PICK") return;

  if (dealerIndex !== 2) {
    const suit = aiChooseTrumpFromOwnHand(dealerIndex);
    setTrump(suit);
    msgEl.textContent = `${players[dealerIndex].name} selected trump: ${suit} (${suitName(suit)}).`;
    moveToPlay();
    render();
  } else {
    msgEl.textContent = "You are the dealer. Select trump.";
    render();
  }
}

function wireTrumpButtons() {
  if (!trumpPanelEl) return;
  const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
  btns.forEach(b => {
    b.onclick = () => {
      if (phase !== "TRUMP_PICK") return;
      if (dealerIndex !== 2) return;

      const suit = b.getAttribute("data-trump");
      if (!SUITS.includes(suit)) return;

      setTrump(suit);
      trumpStatusEl.textContent = `You selected trump: ${suit} (${suitName(suit)}).`;
      moveToPlay();
      render();
    };
  });
}

function moveToTrumpPick() {
  setPhase("TRUMP_PICK");
  render();
  autoTrumpIfAiDealer();
}

function moveToPlay() {
  setPhase("PLAY");
  msgEl.textContent = "Trump set. Trick 1 begins.";
  startTrickOne();
}

// ===== PLAY rules =====
function hasNonTrump(playerIndex) {
  return players[playerIndex].hand.some(c => !isTrumpCard(c, trumpSuit));
}

function illegalReason(playerIndex, cardStr) {
  if (trickNumber === 1 && trick.length === 0 && players[playerIndex].hand.includes(CARD_OPEN_LEAD)) {
    if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
  }
  if (trick.length === 0 && !trumpOpen && trumpSuit !== "C") {
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

  if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
    return hand.map((c,i)=>({c,i})).filter(x=>x.c === CARD_OPEN_LEAD).map(x=>x.i);
  }

  if (trick.length === 0 && !trumpOpen && trumpSuit !== "C") {
    const nonTrumpIdx = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c, trumpSuit)).map(x=>x.i);
    if (nonTrumpIdx.length > 0) return nonTrumpIdx;
    return hand.map((_,i)=>i);
  }

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

// AI: simple “try to win” (no hand reading)
function chooseAiIndex(playerIndex) {
  const legal = legalIndexesFor(playerIndex);
  const hand = players[playerIndex].hand;

  // If leading, play highest legal (aggressive)
  if (trick.length === 0) {
    let bestIdx = legal[0], bestPow = -Infinity;
    for (const idx of legal) {
      const p = cardPower(hand[idx]);
      if (p > bestPow) { bestPow = p; bestIdx = idx; }
    }
    return bestIdx;
  }

  // If following, try to win trick: pick smallest card that still wins; else dump smallest.
  let winning = [];
  for (const idx of legal) {
    const temp = trick.concat([{ playerIndex, cardStr: hand[idx] }]);
    const anyTrump = temp.some(t => isTrumpCard(t.cardStr, trumpSuit));
    let bestPi = temp[0].playerIndex;
    let bestScore = -1;
    for (const t of temp) {
      const score = anyTrump
        ? (isTrumpCard(t.cardStr, trumpSuit) ? cardPower(t.cardStr) : -1)
        : (cardSuitForFollow(t.cardStr, trumpSuit) === leadSuit ? parseCard(t.cardStr, trumpSuit).value : -1);
      if (score > bestScore) { bestScore = score; bestPi = t.playerIndex; }
    }
    if (bestPi === playerIndex) winning.push(idx);
  }

  function cardSize(idx) { return cardPower(hand[idx]); }
  if (winning.length) {
    winning.sort((a,b)=> cardSize(a) - cardSize(b));
    return winning[0];
  } else {
    const sorted = legal.slice().sort((a,b)=> cardSize(a) - cardSize(b));
    return sorted[0];
  }
}

// ===== Trick start =====
function startTrickOne() {
  trick = [];
  leadSuit = null;
  trickNumber = 1;

  trumpOpen = (trumpSuit === "C");

  // Who has 2C leads trick 1
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
          // end hand -> compute pending plucks for NEXT deal
          computePlucksEarnedAndSuffered();
          pendingPluckQueue = buildPluckQueueFromScores();

          msgEl.textContent = "Hand over. Click Reset (New Deal).";
          return;
        }
        maybeContinue();
      }, 250);
    }, 250);

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
    }, 220);
  }
}

// ===== Deal / Next Hand =====
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

  // Trump resets each hand
  trumpSuit = null;
  trumpOpen = false;

  // Pluck tracking resets
  pluckSuitUsedByPair = new Map();
  activePluck = null;
}

function startHandFlowAfterDeal() {
  // Apply quotas based on CURRENT dealerIndex
  applyQuotasByDealer();

  // First hand: skip pluck
  if (handNumber === 1) {
    setPhase("TRUMP_PICK");
    msgEl.textContent = "Hand 1: Dealer selects trump (no pluck phase).";
    render();
    autoTrumpIfAiDealer();
    return;
  }

  // Later hands: plucks happen first (using pending queue from previous hand)
  setPhase("PLUCK");

  pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
  pendingPluckQueue = null;

  if (!pluckQueue.length) {
    msgEl.textContent = "No plucks this hand. Dealer selects trump.";
    moveToTrumpPick();
  } else {
    msgEl.textContent = "Pluck phase begins (manual).";
  }

  render();
}

// ===== Render =====
function render() {
  if (!handEl || !trickEl) return;

  // Labels
  if (handNumEl) handNumEl.textContent = String(handNumber);
  if (dealerLabelEl) dealerLabelEl.textContent = players[dealerIndex].id;

  if (trumpLabelEl) trumpLabelEl.textContent = trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not picked)";
  if (trumpOpenLabelEl) trumpOpenLabelEl.textContent = trumpOpen ? "Yes" : "No";
  renderTrumpAce();

  ai2QuotaLabelEl.textContent = String(players[0].quota);
  ai3QuotaLabelEl.textContent = String(players[1].quota);
  youQuotaLabelEl.textContent = String(players[2].quota);

  ai2TricksEl.textContent = String(players[0].tricks);
  ai3TricksEl.textContent = String(players[1].tricks);
  youTricksEl.textContent = String(players[2].tricks);

  trickNumEl.textContent = String(trickNumber);
  trickMaxEl.textContent = String(trickMax);

  // Dealer pick view
  if (phase === "PICK") renderDealerPick();

  // Your hand
  handEl.innerHTML = "";
  const sorted = sortHandForDisplay(players[2].hand);

  for (const c of sorted) {
    const realIdx = players[2].hand.indexOf(c);
    const isPlayableTurn = (phase === "PLAY" && turnIndex === 2);
    const legal = isPlayableTurn ? legalIndexesFor(2) : [];
    const disabled = !(isPlayableTurn && legal.includes(realIdx));

    const face = makeCardFace(c, disabled, false);

    // IMPORTANT: attach click to THIS node (never replace it later)
    face.onclick = () => {
      if (disabled) return;
      if (lockInput) return;
      if (phase !== "PLAY") return;
      if (turnIndex !== 2) return;

      const legalNow = legalIndexesFor(2);
      if (!legalNow.includes(realIdx)) {
        msgEl.textContent = illegalReason(2, c);
        return;
      }
      playCard(2, realIdx);
    };

    handEl.appendChild(face);
  }

  // Trick display
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

      const face = makeCardFace(t.cardStr, true, false);
      face.style.cursor = "default";

      wrap.appendChild(label);
      wrap.appendChild(face);
      trickEl.appendChild(wrap);
    }
  }

  // Hidden AI hands
  ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
  ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

  // Phase panels
  if (phase === "PLUCK") renderPluckStatus();
  if (phase === "TRUMP_PICK") {
    if (!trumpSuit) {
      const d = players[dealerIndex];
      trumpStatusEl.textContent = (dealerIndex === 2)
        ? `You are the dealer (quota ${d.quota}). Select trump.`
        : `${d.name} is the dealer (quota ${d.quota}). Selecting trump...`;
    } else {
      trumpStatusEl.textContent = `Trump selected: ${trumpSuit} (${suitName(trumpSuit)}).`;
    }
  }

  // Turn banner
  const turnTxt = (phase === "PLAY") ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`) : "—";
  turnBannerEl.textContent =
    `Phase: ${phase} • Hand: ${handNumber} • Dealer: ${players[dealerIndex].id} • ${turnTxt}`;

  // phase chips highlight
  setPhase(phase);
}

// ===== Events =====
if (pluckNextBtn) pluckNextBtn.addEventListener("click", () => runOnePluck());

if (resetBtn) resetBtn.addEventListener("click", () => {
  // Rotate dealer RIGHT each new deal (after hand 1)
  if (handNumber >= 1) dealerIndex = rightOf(dealerIndex);

  handNumber += 1;
  dealNewHands();
  startHandFlowAfterDeal();
  render();
});

if (pickRestartBtn) pickRestartBtn.addEventListener("click", () => {
  resetDealerPick();
});

wireTrumpButtons();

// ===== Start =====
resetDealerPick(); // starts at dealer pick
console.log("Pluck Demo loaded (stable reset)");
