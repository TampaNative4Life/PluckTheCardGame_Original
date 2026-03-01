// Pluck Web Demo v19
// CLEAN UI + PHASE HIGHLIGHT + CUT FOR DEAL
// Flow:
// - FIRST LOAD: CUT (each player picks a card; lowest becomes dealer)
// - FIRST HAND: DEAL -> DEALER SELECTS TRUMP -> PLAY (NO PLUCK)
// - NEXT HANDS: DEAL -> PLUCK -> DEALER SELECTS TRUMP -> PLAY
// Notes:
// - Must follow suit if possible.
// - Trick 1 lead: if you have 2C, you must lead it.
// - Card images attempt to load; if missing/broken, auto fallback to drawn cards.
// - AI plays to win (aggressive default).

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.textContent = "ERROR: " + msg;
  console.error(msg);
}
window.addEventListener("error", (e) => showError(e.message || "Unknown script error"));

// ===== Elements =====
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

// Cut panel
const cutPanelEl = document.getElementById("cutPanel");
const cutDeckEl = document.getElementById("cutDeck");
const cutAI2El = document.getElementById("cutAI2");
const cutAI3El = document.getElementById("cutAI3");
const cutYOUEl = document.getElementById("cutYOU");
const cutMsgEl = document.getElementById("cutMsg");
const cutResetBtn = document.getElementById("cutResetBtn");
const cutStartBtn = document.getElementById("cutStartBtn");

// ===== Core constants =====
const TOTAL_TRICKS = 17;
const SUITS = ["S", "H", "D", "C"];
const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

const CARD_BIG_JOKER = "BJ";
const CARD_LITTLE_JOKER = "LJ";
const CARD_OPEN_LEAD = "2C";

// Card images
const USE_CARD_IMAGES = true;
const CARD_IMG_DIR = "assets/cards"; // expects assets/cards/AS.png etc.

function suitName(s) { return s==="S"?"Spades":s==="H"?"Hearts":s==="D"?"Diamonds":"Clubs"; }
function suitSymbol(s){ return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣"; }
function isRedSuit(s){ return s==="H" || s==="D"; }
function isJoker(cs) { return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }

// Speed
const AI_DELAY_MS = 260;
const TRICK_RESOLVE_MS = 280;
const BETWEEN_TRICKS_MS = 260;

// ===== Deck =====
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

// ===== Memory (public inference only) =====
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

// Phases: CUT, DEAL, PLUCK, TRUMP_PICK, PLAY
let phase = "CUT";

// Plucks apply from prior hand into next hand
let pendingPluckQueue = null;
let pluckQueue = [];
let activePluck = null;
let pluckSuitUsedByPair = new Map();

// First-hand special: no pluck
let handCount = 0;

// ===== Phase UI =====
function setPhase(newPhase) {
  phase = newPhase;
  phaseLabelEl.textContent = newPhase;

  // Panels
  pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
  trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";
  if (cutPanelEl) cutPanelEl.style.display = (newPhase === "CUT") ? "block" : "none";

  // Highlight chips
  [pDeal,pPluck,pTrump,pPlay].forEach(x => x.classList.remove("activeChip"));
  if (newPhase === "DEAL") pDeal.classList.add("activeChip");
  if (newPhase === "PLUCK") pPluck.classList.add("activeChip");
  if (newPhase === "TRUMP_PICK") pTrump.classList.add("activeChip");
  if (newPhase === "PLAY") pPlay.classList.add("activeChip");
}

function flashDealChip() {
  [pDeal,pPluck,pTrump,pPlay].forEach(x => x.classList.remove("activeChip"));
  pDeal.classList.add("activeChip");
  setTimeout(() => {
    pDeal.classList.remove("activeChip");
    if (phase === "PLUCK") pPluck.classList.add("activeChip");
    if (phase === "TRUMP_PICK") pTrump.classList.add("activeChip");
    if (phase === "PLAY") pPlay.classList.add("activeChip");
  }, 380);
}

// ===== Card faces (image + fallback) =====
function makeCardFaceFallback(cardStr, disabled=false) {
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

function makeCardFace(cardStr, disabled=false) {
  if (!USE_CARD_IMAGES) return makeCardFaceFallback(cardStr, disabled);

  const el = document.createElement("div");
  el.className = "cardFace" + (disabled ? " disabled" : "");

  const img = document.createElement("img");
  img.alt = cardStr;
  img.src = `${CARD_IMG_DIR}/${cardStr}.png`;
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "cover";

  img.onerror = () => {
    const fb = makeCardFaceFallback(cardStr, disabled);
    el.replaceWith(fb);
  };

  el.appendChild(img);
  return el;
}

// ===== Sort hand (your suit grouping + trump first after pick) =====
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

function clearPluckChoicesUI() {
  if (pluckChoicesEl) pluckChoicesEl.innerHTML = "";
}

// ===== Render =====
function render() {
  dealerLabelEl.textContent = players[dealerIndex]?.id ?? "(not set)";

  trumpLabelEl.textContent = trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not picked)";
  trumpOpenLabelEl.textContent = trumpOpen ? "Yes" : "No";

  ai2QuotaLabelEl.textContent = String(players[0].quota);
  ai3QuotaLabelEl.textContent = String(players[1].quota);
  youQuotaLabelEl.textContent = String(players[2].quota);

  // Hand
  handEl.innerHTML = "";
  const sorted = sortHandForDisplay(players[2].hand);

  for (const c of sorted) {
    const realIdx = players[2].hand.indexOf(c);
    const isPlayableTurn = (phase === "PLAY" && turnIndex === 2);
    const legal = isPlayableTurn ? legalIndexesFor(2) : [];
    const disabled = !(isPlayableTurn && legal.includes(realIdx));

    const face = makeCardFace(c, disabled);
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

  // Trick
  trickEl.innerHTML = "";
  if (!trick.length) {
    trickEl.textContent = "(empty)";
  } else {
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

  // Hidden AI hands
  ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
  ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

  // Scores
  ai2TricksEl.textContent = String(players[0].tricks);
  ai3TricksEl.textContent = String(players[1].tricks);
  youTricksEl.textContent = String(players[2].tricks);

  trickNumEl.textContent = String(trickNumber);
  trickMaxEl.textContent = String(trickMax);

  // Banner
  const whoseTurn = (phase === "PLAY" ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`) : "—");
  const leadTxt = (leadSuit ?? "(none)");
  turnBannerEl.textContent =
    `Phase: ${phase} • Dealer: ${players[dealerIndex].id} • ${whoseTurn} • Lead Suit: ${leadTxt}`;

  if (phase === "PLUCK") renderPluckStatus();
  if (phase === "TRUMP_PICK") renderTrumpPickStatus();
}

// ===== Pluck scoring (unchanged from your working model) =====
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
  if (cards.length === 0) return null;
  cards.sort((a,b)=> (RANK_VALUE[a.slice(0,-1)]||0) - (RANK_VALUE[b.slice(0,-1)]||0));
  return cards[0];
}
function highestOfSuitNonJoker(playerIndex, suit) {
  const cards = players[playerIndex].hand.filter(c => !isJoker(c) && c.slice(-1) === suit);
  if (cards.length === 0) return null;
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

  // YOU pluck: choose suit buttons
  if (pluckerI === 2) {
    pluckNextBtn.disabled = true;

    if (suits.length === 0) {
      pluckStatusEl.textContent = `You are plucking ${pluckee.name}, but have no suit to attempt. Skipping.`;
      // consume and move on
      pluckQueue.shift(); activePluck = null;
      if (pluckQueue.length === 0) moveToTrumpPick();
      render();
      return;
    }

    pluckStatusEl.textContent =
      `You are plucking ${pluckee.name}. Choose a suit. Wrong suit attempt = LOST (no re-pick).`;

    for (const s of suits) {
      const give = lowestOfSuitNonJoker(pluckerI, s);

      const btn = document.createElement("button");
      btn.className = "btn";
      btn.innerHTML = `<strong>${s}</strong> (${suitName(s)}) <span style="opacity:.8;font-size:12px;">Give: ${give}</span>`;
      btn.onclick = () => {
        const res = attemptPluck(pluckerI, pluckeeI, s);
        if (!res.ok) {
          markPluckSuitUsed(pluckerI, pluckeeI, s);
          pluckStatusEl.textContent = `FAILED (${res.reason}). Pluck LOST.`;
        } else {
          pluckStatusEl.textContent = `Pluck success: gave ${res.giveLow}, received ${res.takeHigh}.`;
        }
        pluckQueue.shift(); activePluck = null;
        if (pluckQueue.length === 0) moveToTrumpPick();
        render();
      };
      pluckChoicesEl.appendChild(btn);
    }
    return;
  }

  // AI pluck
  pluckNextBtn.disabled = false;
  if (suits.length === 0) {
    pluckStatusEl.textContent = `${plucker.name} is plucking ${pluckee.name}, but has no suit. Skipping.`;
  } else {
    pluckStatusEl.textContent = `${plucker.name} is plucking ${pluckee.name}. Click "Run Next Pluck".`;
  }
}

function runOnePluck() {
  if (phase !== "PLUCK") return;
  if (pluckQueue.length === 0) return;
  if (!activePluck) activePluck = pluckQueue[0];

  const pluckerI = activePluck.pluckerIndex;
  const pluckeeI = activePluck.pluckeeIndex;

  const candidates = availablePluckSuits(pluckerI, pluckeeI);

  if (candidates.length === 0) {
    pluckStatusEl.textContent = `No available suit for ${players[pluckerI].name} → ${players[pluckeeI].name}. Skipped.`;
    pluckQueue.shift(); activePluck = null;
    if (pluckQueue.length === 0) moveToTrumpPick();
    render();
    return;
  }

  // YOU must use buttons
  if (pluckerI === 2) {
    pluckStatusEl.textContent = "Choose a suit button to pluck.";
    render();
    return;
  }

  // AI blind pick: choose suit where its give is cheapest (dump low card)
  const scored = candidates.map(s => {
    const low = lowestOfSuitNonJoker(pluckerI, s);
    const lowVal = low ? (RANK_VALUE[low.slice(0,-1)]||99) : 99;
    return { s, score: (100 - lowVal) };
  }).sort((a,b) => b.score - a.score);

  const pick = scored[0].s;
  const res = attemptPluck(pluckerI, pluckeeI, pick);

  if (!res.ok) {
    markPluckSuitUsed(pluckerI, pluckeeI, pick);
    pluckStatusEl.textContent = `${players[pluckerI].name} attempted ${pick} and FAILED (${res.reason}). Pluck LOST.`;
  } else {
    pluckStatusEl.textContent = `${players[pluckerI].name} plucked ${pick}: gave ${res.giveLow}, received ${res.takeHigh}.`;
  }

  pluckQueue.shift(); activePluck = null;
  if (pluckQueue.length === 0) moveToTrumpPick();
  render();
}

// ===== Trump pick (Dealer selects) =====
function aiChooseTrumpFromOwnHand(aiIndex) {
  const hand = players[aiIndex].hand;
  const suitScore = { S:0, H:0, D:0, C:0 };

  for (const cs of hand) {
    if (isJoker(cs)) {
      suitScore.S += 6; suitScore.H += 6; suitScore.D += 6; suitScore.C += 6;
      continue;
    }
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    const v = RANK_VALUE[rank] || 0;

    suitScore[suit] += 2;                 // length
    if (v >= 11) suitScore[suit] += (v-10)*2; // J/Q/K/A weight
    else suitScore[suit] += Math.max(0, v-6)*0.5;
  }

  let bestSuit = "H", bestScore = -Infinity;
  for (const s of SUITS) {
    if (suitScore[s] > bestScore) { bestScore = suitScore[s]; bestSuit = s; }
  }
  return bestSuit;
}

function setTrump(suit) {
  trumpSuit = suit;
  trumpOpen = (trumpSuit === "C"); // keep your current open rule
}

function renderTrumpPickStatus() {
  if (trumpSuit) {
    trumpStatusEl.textContent = `Trump picked: ${trumpSuit} (${suitName(trumpSuit)}).`;
    return;
  }
  const dealer = players[dealerIndex];
  if (dealerIndex === 2) {
    trumpStatusEl.textContent = `You are the dealer. Select trump now.`;
  } else {
    trumpStatusEl.textContent = `${dealer.name} is dealer. AI will pick trump now.`;
  }
}

function wireTrumpButtons() {
  const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
  btns.forEach(b => {
    b.onclick = () => {
      if (phase !== "TRUMP_PICK") return;
      if (trumpSuit) return;
      if (dealerIndex !== 2) return;

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
    if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C (because you have it).";
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

  // If you have 2C and it's first lead, you must play it
  if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
    return hand.map((c,i)=>({c,i})).filter(x=>x.c === CARD_OPEN_LEAD).map(x=>x.i);
  }

  // Follow suit if possible
  if (trick.length > 0) {
    const suited = hand
      .map((c,i)=>({c,i}))
      .filter(x => cardSuitForFollow(x.c, trumpSuit) === leadSuit)
      .map(x=>x.i);
    return suited.length ? suited : hand.map((_,i)=>i);
  }

  // Otherwise any card
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
  memory.trickLog.push({
    trickNumber,
    plays: trick.map(t => ({ pi: t.playerIndex, card: t.cardStr })),
    winner: winnerIndex
  });

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

// ===== AI selection (aggressive win bias) =====
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

function chooseAiIndex(playerIndex) {
  const legal = legalIndexesFor(playerIndex);
  const hand = players[playerIndex].hand;

  // Try to win if possible, otherwise dump lowest legal
  let winning = [];
  for (const idx of legal) {
    const c = hand[idx];
    if (wouldWinIfPlayedNow(playerIndex, c)) winning.push(idx);
  }

  if (winning.length) {
    // among winning plays, choose the cheapest that still wins (save power)
    winning.sort((a,b) => cardPower(hand[a]) - cardPower(hand[b]));
    return winning[0];
  }

  // no winning play: dump lowest power legal
  let best = legal[0];
  for (const idx of legal) {
    if (cardPower(hand[idx]) < cardPower(hand[best])) best = idx;
  }
  return best;
}

// ===== Trick start =====
function startTrickOne() {
  trick = [];
  leadSuit = null;
  trickNumber = 1;

  trumpOpen = (trumpSuit === "C");

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
          computePlucksEarnedAndSuffered();
          pendingPluckQueue = buildPluckQueueFromScores();
          msgEl.textContent = "Hand over. Click Reset (New Deal).";
          return;
        }
        maybeContinue();
      }, BETWEEN_TRICKS_MS);
    }, TRICK_RESOLVE_MS);

    return;
  }

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

// ===== Deal / phase transitions =====
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

  // trump not set yet
  trumpSuit = null;
  trumpOpen = false;

  pluckSuitUsedByPair = new Map();
  activePluck = null;

  flashDealChip();
}

function startPluckPhaseAfterDeal() {
  setPhase("PLUCK");

  pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
  pendingPluckQueue = null;

  if (pluckQueue.length === 0) {
    msgEl.textContent = "No plucks this hand. Moving to dealer trump pick.";
    moveToTrumpPick();
  } else {
    msgEl.textContent = "Pluck phase begins.";
  }
  render();
}

function moveToTrumpPick() {
  setPhase("TRUMP_PICK");
  renderTrumpPickStatus();
  render();

  // AI dealer picks immediately
  if (dealerIndex !== 2) {
    const s = aiChooseTrumpFromOwnHand(dealerIndex);
    setTrump(s);
    msgEl.textContent = `${players[dealerIndex].name} picked trump: ${s} (${suitName(s)}).`;
    moveToPlay();
    render();
  } else {
    msgEl.textContent = "Pick trump now.";
  }
}

function moveToPlay() {
  setPhase("PLAY");
  msgEl.textContent = "Trump set. Trick 1 begins.";
  startTrickOne();
}

// ===== Cut for deal (first load) =====
let cutDeck = [];
let cutPicked = { 0:null, 1:null, 2:null };
let cutLocked = false;

function makeCutDeck() {
  // Simple public cut deck: 3..A across one suit (Spades) = easy lowest comparison
  const ranks = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  return ranks.map(r => r + "S");
}
function cutValue(cardStr) {
  const rank = cardStr.slice(0, cardStr.length-1);
  return RANK_VALUE[rank] || 99;
}

function renderCutDeck() {
  if (!cutDeckEl) return;
  cutDeckEl.innerHTML = "";
  for (let i=0;i<cutDeck.length;i++) {
    const back = document.createElement("div");
    back.className = "cutBack";
    back.title = "Click to cut";
    back.onclick = () => {
      if (cutLocked) return;
      if (cutPicked[2]) return; // you already picked
      // YOU picks this card
      const yourCard = cutDeck.splice(i,1)[0];
      cutPicked[2] = yourCard;

      // AI2 and AI3 pick random from remaining
      const ai2Idx = Math.floor(Math.random() * cutDeck.length);
      const ai2Card = cutDeck.splice(ai2Idx,1)[0];
      cutPicked[0] = ai2Card;

      const ai3Idx = Math.floor(Math.random() * cutDeck.length);
      const ai3Card = cutDeck.splice(ai3Idx,1)[0];
      cutPicked[1] = ai3Card;

      showCutResult();
    };
    cutDeckEl.appendChild(back);
  }
}

function showCutResult() {
  cutLocked = true;

  cutAI2El.textContent = cutPicked[0];
  cutAI3El.textContent = cutPicked[1];
  cutYOUEl.textContent = cutPicked[2];

  // lowest card deals
  const vals = [
    { pi:0, v:cutValue(cutPicked[0]), c:cutPicked[0] },
    { pi:1, v:cutValue(cutPicked[1]), c:cutPicked[1] },
    { pi:2, v:cutValue(cutPicked[2]), c:cutPicked[2] }
  ].sort((a,b)=> a.v - b.v);

  dealerIndex = vals[0].pi;
  applyQuotasFromDealer();

  cutMsgEl.textContent = `Cut results: AI2=${cutPicked[0]}, AI3=${cutPicked[1]}, YOU=${cutPicked[2]}. Lowest is ${players[dealerIndex].id} → FIRST DEALER.`;
  cutStartBtn.disabled = false;

  render();
}

function resetCut() {
  cutDeck = shuffle(makeCutDeck());
  cutPicked = { 0:null, 1:null, 2:null };
  cutLocked = false;

  cutAI2El.textContent = "(waiting)";
  cutAI3El.textContent = "(waiting)";
  cutYOUEl.textContent = "(pick a card)";
  cutMsgEl.textContent = "";

  cutStartBtn.disabled = true;

  renderCutDeck();
  render();
}

function startGameFromCut() {
  // First hand: NO pluck
  handCount = 0;
  startNewDealFlow();
}

function startNewDealFlow() {
  // every new deal after cut: dealer rotates RIGHT (your request)
  // BUT: we already set dealer via cut for the first deal, so rotate happens only after the first hand begins.
  // We implement: on resetBtn click (new deal), rotateDealerRight(). On first start, do NOT rotate.
  dealNewHands();
  handCount += 1;

  // Hand 1: skip pluck
  if (handCount === 1) {
    setPhase("DEAL");
    msgEl.textContent = "First hand: NO PLUCK. Dealer will select trump now.";
    setTimeout(() => {
      moveToTrumpPick();
    }, 250);
  } else {
    // From hand 2+: plucks happen before trump
    setPhase("DEAL");
    msgEl.textContent = "Deal complete. Moving to pluck phase.";
    setTimeout(() => {
      startPluckPhaseAfterDeal();
    }, 250);
  }
  render();
}

// ===== Events =====
pluckNextBtn.addEventListener("click", () => runOnePluck());

resetBtn.addEventListener("click", () => {
  // rotate dealer each new deal (after first game start)
  rotateDealerRight();
  trumpSuit = null;
  trumpOpen = false;
  startNewDealFlow();
});

cutResetBtn.addEventListener("click", () => resetCut());
cutStartBtn.addEventListener("click", () => {
  setPhase("DEAL");
  // hide cut panel
  if (cutPanelEl) cutPanelEl.style.display = "none";
  startGameFromCut();
});

wireTrumpButtons();

// ===== Boot =====
setPhase("CUT");
resetCut();
render();
console.log("Pluck Demo v19 loaded");
