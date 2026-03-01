// Pluck Web Demo v19 (CLEAN PLAYABLE)
// - Hard Lock ALWAYS ON (no UI toggles)
// - AI always tries to win (MENACE default)
// - No card images (fallback faces only)
// - Phases are larger and highlighted
// - FIRST GAME: "Cut for deal" (lowest card becomes dealer) + NO PLUCK phase
// - Thereafter: DEAL -> PLUCK -> DEALER SELECTS TRUMP -> PLAY
// - Redeal happens BEFORE pluck (pluck uses previous hand results)

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

// Cut for deal
const cutPanelEl = document.getElementById("cutPanel");
const cutRowEl = document.getElementById("cutRow");
const cutStatusEl = document.getElementById("cutStatus");
const cutContinueBtn = document.getElementById("cutContinueBtn");

// ===== Core constants =====
const TOTAL_TRICKS = 17;
const SUITS = ["S", "H", "D", "C"];
const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

const CARD_BIG_JOKER = "BJ";
const CARD_LITTLE_JOKER = "LJ";
const CARD_OPEN_LEAD = "2C";

// Timing
const AI_DELAY_MS = 350;
const TRICK_RESOLVE_MS = 350;
const BETWEEN_TRICKS_MS = 260;

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

let dealerIndex = 0;

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

let phase = "CUT_FOR_DEAL"; // CUT_FOR_DEAL, DEAL, PLUCK, TRUMP_PICK, PLAY

let pendingPluckQueue = null; // computed at end of hand, used after NEXT deal
let pluckQueue = [];
let activePluck = null;
let pluckSuitUsedByPair = new Map();

let firstHand = true;

// ===== Phase UI =====
function setPhase(newPhase) {
  phase = newPhase;
  phaseLabelEl.textContent = newPhase;

  // Panels
  pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
  trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";
  cutPanelEl.style.display = (newPhase === "CUT_FOR_DEAL") ? "block" : "none";

  // Chips
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
  }, 350);
}

// ===== Card Face (fallback only) =====
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

// ===== Sort: suits grouped; after trump pick, trump group first; jokers always first =====
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
    const isYourTurn = (phase === "PLAY" && turnIndex === 2);
    const legal = isYourTurn ? legalIndexesFor(2) : [];
    const disabled = !(isYourTurn && legal.includes(realIdx)); // HARD LOCK ALWAYS

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

  ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
  ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

  ai2TricksEl.textContent = String(players[0].tricks);
  ai3TricksEl.textContent = String(players[1].tricks);
  youTricksEl.textContent = String(players[2].tricks);

  trickNumEl.textContent = String(trickNumber);
  trickMaxEl.textContent = String(trickMax);

  const whoseTurn = (phase === "PLAY" ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`) : "—");
  turnBannerEl.textContent =
    `Phase: ${phase} • Dealer: ${players[dealerIndex].id} • ${whoseTurn} • Lead: ${players[leaderIndex].id} • Trump: ${trumpSuit ?? "(not picked)"} • Trump Open: ${trumpOpen ? "Yes" : "No"}`;

  if (phase === "PLUCK") renderPluckStatus();
  if (phase === "TRUMP_PICK") renderTrumpPickStatus();
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
  const suits = availablePluckSuits(pluckerI, pluckeeI);

  // YOU pluck: choose suit buttons; wrong suit = LOST
  if (pluckerI === 2) {
    pluckNextBtn.disabled = true;

    if (suits.length === 0) {
      pluckStatusEl.textContent = `You are plucking ${players[pluckeeI].name}, but you have no suit to attempt. Skipping.`;
      pluckNextBtn.disabled = false;
      return;
    }

    pluckStatusEl.textContent =
      `You are plucking ${players[pluckeeI].name}. Choose a suit. Wrong suit attempt = pluck LOST.`;

    for (const s of suits) {
      const give = lowestOfSuitNonJoker(pluckerI, s);

      const btn = document.createElement("button");
      btn.className = "btn";
      btn.style.padding = "10px 12px";
      btn.innerHTML = `<strong>${s}</strong> (${suitName(s)}) &nbsp;•&nbsp; Give: ${give ?? "(none)"}`;

      btn.onclick = () => {
        const res = attemptPluck(pluckerI, pluckeeI, s);
        if (!res.ok) {
          markPluckSuitUsed(pluckerI, pluckeeI, s);
          pluckStatusEl.textContent = `You attempted ${s} and FAILED (${res.reason}). Pluck is LOST.`;
        } else {
          pluckStatusEl.textContent =
            `You plucked ${s}: gave ${res.giveLow}, received ${res.takeHigh}.`;
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

  // AI pluck: Run Next Pluck button
  pluckNextBtn.disabled = false;
  pluckStatusEl.textContent =
    `${players[pluckerI].name} is plucking ${players[pluckeeI].name}. Candidate suits: ${suits.length ? suits.join(", ") : "(none)"} (wrong suit loses).`;
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
    pluckQueue.shift();
    activePluck = null;
    if (pluckQueue.length === 0) moveToTrumpPick();
    render();
    return;
  }

  if (pluckerI === 2) {
    pluckStatusEl.textContent = "Choose a suit button to pluck.";
    render();
    return;
  }

  // AI blind suit pick: cheap low card + hope for high return
  const scored = candidates.map(s => {
    const low = lowestOfSuitNonJoker(pluckerI, s);
    const lowVal = low ? (RANK_VALUE[low.slice(0,-1)]||99) : 99;
    const score = 100 - lowVal; // cheap is better
    return { s, score };
  }).sort((a,b)=> b.score - a.score);

  const pick = scored[0].s;
  const res = attemptPluck(pluckerI, pluckeeI, pick);

  if (!res.ok) {
    markPluckSuitUsed(pluckerI, pluckeeI, pick);
    pluckStatusEl.textContent =
      `${players[pluckerI].name} attempted ${pick} and FAILED (${res.reason}). Pluck is LOST.`;
  } else {
    pluckStatusEl.textContent =
      `${players[pluckerI].name} plucked ${pick}: gave ${res.giveLow}, received ${res.takeHigh}.`;
  }

  pluckQueue.shift();
  activePluck = null;

  if (pluckQueue.length === 0) moveToTrumpPick();
  render();
}

// ===== Trump Pick =====
function setTrump(suit) {
  trumpSuit = suit;
  trumpOpen = (trumpSuit === "C"); // your current rule
}

// Dealer selects trump
function dealerSelectsTrumpIndex() {
  return dealerIndex;
}

// AI chooses trump from OWN hand only
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

    suitScore[suit] += 2;
    if (v >= 11) suitScore[suit] += (v - 10) * 2;
    else suitScore[suit] += Math.max(0, v - 6) * 0.5;
  }

  let bestSuit = "H", bestScore = -Infinity;
  for (const s of SUITS) {
    if (suitScore[s] > bestScore) { bestScore = suitScore[s]; bestSuit = s; }
  }
  return bestSuit;
}

function renderTrumpPickStatus() {
  if (trumpSuit) {
    trumpStatusEl.textContent = `Trump picked: ${trumpSuit} (${suitName(trumpSuit)}).`;
    return;
  }
  const d = players[dealerIndex];
  if (dealerIndex === 2) trumpStatusEl.textContent = `You are the dealer. Select trump now.`;
  else trumpStatusEl.textContent = `${d.name} is the dealer. AI will select trump now.`;
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

// ===== AI (MENACE: tries to win) =====
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

  // MENACE: if can win, prefer smallest winning card; if cannot win, dump lowest legal card
  const winning = [];
  for (const idx of legal) {
    const card = hand[idx];
    if (wouldWinIfPlayedNow(playerIndex, card)) winning.push(idx);
  }

  function cardDumpValue(cardStr) {
    if (cardStr === CARD_BIG_JOKER) return 9999;
    if (cardStr === CARD_LITTLE_JOKER) return 9990;
    const c = parseCard(cardStr, trumpSuit);
    const t = isTrumpCard(cardStr, trumpSuit) ? 1000 : 0;
    return t + c.value;
  }

  if (winning.length) {
    // smallest winning
    winning.sort((a,b)=> cardDumpValue(hand[a]) - cardDumpValue(hand[b]));
    return winning[0];
  }

  // dump lowest
  const sorted = legal.slice().sort((a,b)=> cardDumpValue(hand[a]) - cardDumpValue(hand[b]));
  return sorted[0];
}

// ===== Trick start =====
function startTrickOne() {
  trick = [];
  leadSuit = null;
  trickNumber = 1;

  trumpOpen = (trumpSuit === "C");

  // Who has 2C leads
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
          // Hand over -> compute plucks for NEXT deal
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

  // AI turn
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

// ===== Deal & flow =====
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

  // Trump not picked until TRUMP_PICK
  trumpSuit = null;
  trumpOpen = false;

  pluckSuitUsedByPair = new Map();
  activePluck = null;

  flashDealChip();
}

function startPluckPhaseAfterDeal() {
  // FIRST HAND has NO PLUCK PHASE
  if (firstHand) {
    msgEl.textContent = "First hand: no plucks. Dealer selects trump.";
    moveToTrumpPick();
    return;
  }

  setPhase("PLUCK");

  pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
  pendingPluckQueue = null;

  if (pluckQueue.length === 0) {
    msgEl.textContent = "No plucks this hand. Dealer selects trump.";
    moveToTrumpPick();
  } else {
    msgEl.textContent = "Pluck phase begins (manual).";
  }
  render();
}

function moveToTrumpPick() {
  setPhase("TRUMP_PICK");
  renderTrumpPickStatus();
  render();

  const dealer = dealerSelectsTrumpIndex();

  if (dealer !== 2) {
    const s = aiChooseTrumpFromOwnHand(dealer);
    setTrump(s);
    msgEl.textContent = `${players[dealer].name} selected trump: ${s} (${suitName(s)}).`;
    moveToPlay();
    render();
  } else {
    msgEl.textContent = "You are the dealer. Select trump.";
  }
}

function moveToPlay() {
  setPhase("PLAY");
  msgEl.textContent = "Trump set. Trick 1 begins.";
  startTrickOne();
}

// ===== Cut for deal (first game) =====
let cutDeck = [];
let cutPicks = [null,null,null]; // cards picked by AI2, AI3, YOU (but AI picks auto)
let cutCardsOnTable = []; // three cards

function cutRankValue(cs) {
  // Jokers are highest (so they won't be "lowest dealer" usually)
  if (cs === CARD_BIG_JOKER) return 1000;
  if (cs === CARD_LITTLE_JOKER) return 900;
  const suit = cs.slice(-1);
  const rank = cs.slice(0, cs.length-1);
  // lowest rank should be lowest numeric
  return (RANK_VALUE[rank] || 0) * 10 + (SUITS.indexOf(suit) + 1);
}

function renderCutTable() {
  cutRowEl.innerHTML = "";
  for (let i=0;i<3;i++) {
    const pickedBySomeone = (cutPicks.includes(cutCardsOnTable[i]));
    const faceDown = !pickedBySomeone;

    const card = document.createElement("div");
    card.className = "cardFace";
    card.style.cursor = faceDown ? "pointer" : "default";
    card.style.opacity = faceDown ? "1" : "1";

    if (faceDown) {
      // fake back
      card.style.background = "linear-gradient(135deg, #1b2336, #0f1320)";
      card.style.border = "1px solid rgba(212,178,84,.25)";
      const txt = document.createElement("div");
      txt.style.color = "rgba(212,178,84,.9)";
      txt.style.fontWeight = "900";
      txt.style.letterSpacing = "1px";
      txt.textContent = "PLUCK";
      card.appendChild(txt);

      card.onclick = () => onYouPickCutCard(i);
    } else {
      // show real face
      const real = makeCardFace(cutCardsOnTable[i], true);
      card.replaceWith(real);
      // (replaceWith removes node; easiest: append real)
      cutRowEl.appendChild(real);
      continue;
    }

    cutRowEl.appendChild(card);
  }
}

function onYouPickCutCard(i) {
  if (phase !== "CUT_FOR_DEAL") return;
  if (cutPicks[2]) return;

  const yourCard = cutCardsOnTable[i];
  cutPicks[2] = yourCard;

  // AI pick remaining (random among remaining)
  const remaining = cutCardsOnTable.filter(c => !cutPicks.includes(c));
  cutPicks[0] = remaining[Math.floor(Math.random()*remaining.length)];
  const remaining2 = cutCardsOnTable.filter(c => !cutPicks.includes(c));
  cutPicks[1] = remaining2[0];

  // Determine lowest -> dealer
  const vals = [
    { pi:0, card:cutPicks[0], v:cutRankValue(cutPicks[0]) },
    { pi:1, card:cutPicks[1], v:cutRankValue(cutPicks[1]) },
    { pi:2, card:cutPicks[2], v:cutRankValue(cutPicks[2]) },
  ];
  vals.sort((a,b)=> a.v - b.v);
  dealerIndex = vals[0].pi;
  applyQuotasFromDealer();

  renderCutTable();

  cutStatusEl.textContent =
    `AI2 drew ${cutPicks[0]}, AI3 drew ${cutPicks[1]}, YOU drew ${cutPicks[2]}. ` +
    `Lowest is ${players[dealerIndex].id} (${vals[0].card}). ${players[dealerIndex].id} is the dealer.`;

  cutContinueBtn.disabled = false;
}

function startCutForDeal() {
  setPhase("CUT_FOR_DEAL");
  cutContinueBtn.disabled = true;
  cutStatusEl.textContent = "Pick your card.";

  cutDeck = shuffle(makePluckDeck51());
  cutCardsOnTable = [cutDeck.pop(), cutDeck.pop(), cutDeck.pop()];
  cutPicks = [null,null,null];

  renderCutTable();
  render();
}

// ===== Events =====
pluckNextBtn.addEventListener("click", () => runOnePluck());

resetBtn.addEventListener("click", () => {
  // Every reset is a NEW deal; dealer rotates RIGHT
  rotateDealerRight();
  dealNewHands();
  startPluckPhaseAfterDeal();
});

cutContinueBtn.addEventListener("click", () => {
  if (phase !== "CUT_FOR_DEAL") return;

  // First hand begins now: deal, no pluck, dealer selects trump
  firstHand = true;

  setPhase("DEAL");
  dealNewHands();

  // no dealer rotate here (dealer already set by cut)
  // but quotas already set by cut
  firstHand = true;
  startPluckPhaseAfterDeal(); // will skip because firstHand=true

  // After we launch into trump pick, mark firstHand false AFTER first hand finishes
  // We do it here so subsequent Reset uses pluck normally.
  firstHand = false;
});

// Wire trump buttons
wireTrumpButtons();

// ===== Start =====
applyQuotasFromDealer();
pendingPluckQueue = null;
startCutForDeal();

console.log("Pluck Demo v19 loaded");
