// Pluck Web Demo v19 (FULL)
// HARD LOCK + AI MODE + CARD IMAGES (fallback)
// Order enforced: DEAL -> PLUCK -> TRUMP PICK -> PLAY
// Pluck failure = LOST (no re-pick), for both YOU and AI.
// AI cannot read other players' hands for decision-making (pluck & trump pick are blind).
// Dealer rotates RIGHT each deal INCLUDING FIRST LOAD. Quotas: Dealer=7, Left=6, Right=4.
//
// v19 FIX: "Unpickable cards" bug fixed by removing indexOf() after sorting.
// We now sort {card, idx} pairs so click always targets the correct card in the real hand array.

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

// Optional toggle controls (only if present in your HTML)
const hardLockOnBtn = document.getElementById("hardLockOn");
const hardLockOffBtn = document.getElementById("hardLockOff");
const aiModeMenaceBtn = document.getElementById("aiModeMenace");
const aiModeNormalBtn = document.getElementById("aiModeNormal");

let HARD_LOCK = true;     // strict enforcement (illegal blocked)
let AI_MODE = "MENACE";   // MENACE | NORMAL

function setPillActive(onBtn, offBtn, isOn) {
  if (!onBtn || !offBtn) return;
  onBtn.classList.toggle("active", isOn);
  offBtn.classList.toggle("active", !isOn);
}
function setAiModePills(menaceBtn, normalBtn, mode) {
  if (!menaceBtn || !normalBtn) return;
  menaceBtn.classList.toggle("active", mode === "MENACE");
  normalBtn.classList.toggle("active", mode === "NORMAL");
}

if (hardLockOnBtn && hardLockOffBtn) {
  hardLockOnBtn.onclick = () => { HARD_LOCK = true; setPillActive(hardLockOnBtn, hardLockOffBtn, true); msgEl.textContent = "Hard Lock ON."; render(); };
  hardLockOffBtn.onclick = () => { HARD_LOCK = false; setPillActive(hardLockOnBtn, hardLockOffBtn, false); msgEl.textContent = "Hard Lock OFF (testing mode)."; render(); };
}
if (aiModeMenaceBtn && aiModeNormalBtn) {
  aiModeMenaceBtn.onclick = () => { AI_MODE = "MENACE"; setAiModePills(aiModeMenaceBtn, aiModeNormalBtn, AI_MODE); msgEl.textContent = "AI Mode: MENACE."; render(); };
  aiModeNormalBtn.onclick = () => { AI_MODE = "NORMAL"; setAiModePills(aiModeMenaceBtn, aiModeNormalBtn, AI_MODE); msgEl.textContent = "AI Mode: NORMAL."; render(); };
}

// ===== Core constants =====
const TOTAL_TRICKS = 17;
const SUITS = ["S", "H", "D", "C"];
const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

const CARD_BIG_JOKER = "BJ";
const CARD_LITTLE_JOKER = "LJ";
const CARD_OPEN_LEAD = "2C";

// Card image settings (YOU said your cards landed in assets with logo)
const USE_CARD_IMAGES = true;
const CARD_IMG_DIR = "assets";   // expects assets/AS.png, assets/10H.png, assets/BJ.png, etc.

// Speed controls
const AI_DELAY_MS = 220;
const TRICK_RESOLVE_MS = 250;
const BETWEEN_TRICKS_MS = 220;

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

// During PLAY, jokers behave as trump suit. Before trump is picked, treat joker suit as null.
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

function rotateDealerAndApplyQuotas() {
  dealerIndex = rightOf(dealerIndex);
  players[dealerIndex].quota = 7;
  players[leftOf(dealerIndex)].quota = 6;
  players[rightOf(dealerIndex)].quota = 4;
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

let phase = "PLUCK";

let pendingPluckQueue = null;
let pluckQueue = [];
let activePluck = null;
let pluckSuitUsedByPair = new Map();

let trumpCallerIndex = 0;

// ===== Phase UI =====
function setPhase(newPhase) {
  phase = newPhase;
  if (phaseLabelEl) phaseLabelEl.textContent = newPhase;

  if (pluckPanelEl) pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
  if (trumpPanelEl) trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";

  [pDeal,pPluck,pTrump,pPlay].forEach(x => x && x.classList.remove("activeChip"));
  if (newPhase === "PLUCK" && pPluck) pPluck.classList.add("activeChip");
  if (newPhase === "TRUMP_PICK" && pTrump) pTrump.classList.add("activeChip");
  if (newPhase === "PLAY" && pPlay) pPlay.classList.add("activeChip");
}

function flashDealChip() {
  [pDeal,pPluck,pTrump,pPlay].forEach(x => x && x.classList.remove("activeChip"));
  if (pDeal) pDeal.classList.add("activeChip");
  setTimeout(() => {
    if (pDeal) pDeal.classList.remove("activeChip");
    if (phase === "PLUCK" && pPluck) pPluck.classList.add("activeChip");
    if (phase === "TRUMP_PICK" && pTrump) pTrump.classList.add("activeChip");
    if (phase === "PLAY" && pPlay) pPlay.classList.add("activeChip");
  }, 350);
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
  el.style.padding = "0";
  el.style.overflow = "hidden";

  const img = document.createElement("img");
  img.alt = cardStr;
  img.src = `${CARD_IMG_DIR}/${cardStr}.png`;
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "cover";

  img.onerror = () => {
    const fallback = makeCardFaceFallback(cardStr, disabled);
    el.replaceWith(fallback);
  };

  el.appendChild(img);
  return el;
}

// ===== Sort (returns array of {card, idx} so clicks stay correct) =====
function sortHandPairsForDisplay(hand) {
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
    return { sg, r: (100 - rv) }; // higher ranks first
  }

  const pairs = hand.map((c, idx) => ({ card: c, idx }));
  pairs.sort((a,b)=>{
    const ka=key(a.card), kb=key(b.card);
    if (ka.sg !== kb.sg) return ka.sg - kb.sg;
    if (ka.r !== kb.r) return ka.r - kb.r;
    return a.idx - b.idx; // stable
  });
  return pairs;
}

function clearPluckChoicesUI() { if (pluckChoicesEl) pluckChoicesEl.innerHTML = ""; }

// ===== Render =====
function render() {
  if (trumpLabelEl) trumpLabelEl.textContent = trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not picked)";
  if (trumpOpenLabelEl) trumpOpenLabelEl.textContent = trumpOpen ? "Yes" : "No";

  if (ai2QuotaLabelEl) ai2QuotaLabelEl.textContent = String(players[0].quota);
  if (ai3QuotaLabelEl) ai3QuotaLabelEl.textContent = String(players[1].quota);
  if (youQuotaLabelEl) youQuotaLabelEl.textContent = String(players[2].quota);

  // Your hand
  if (handEl) {
    handEl.innerHTML = "";
    const pairs = sortHandPairsForDisplay(players[2].hand);

    const isPlayableTurn = (phase === "PLAY" && turnIndex === 2);
    const legalNow = isPlayableTurn ? legalIndexesFor(2) : [];

    for (const p of pairs) {
      const realIdx = p.idx;
      const card = p.card;

      const disabled = HARD_LOCK
        ? !(isPlayableTurn && legalNow.includes(realIdx))
        : !(isPlayableTurn);

      const face = makeCardFace(card, disabled);
      face.onclick = () => {
        if (disabled) return;
        if (lockInput) return;
        if (phase !== "PLAY") return;
        if (turnIndex !== 2) return;

        if (HARD_LOCK) {
          const legal = legalIndexesFor(2);
          if (!legal.includes(realIdx)) {
            msgEl.textContent = illegalReason(2, card);
            return;
          }
        }
        playCard(2, realIdx);
      };

      handEl.appendChild(face);
    }
  }

  // Trick
  if (trickEl) {
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
  }

  if (ai2HandEl) ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
  if (ai3HandEl) ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

  const lockTxt = lockInput ? "LOCKED" : "OPEN";
  const whoseTurn = (phase === "PLAY" ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`) : "—");

  if (turnBannerEl) {
    turnBannerEl.textContent =
      `Phase: ${phase} • Dealer: ${players[dealerIndex].id} • ${whoseTurn} • Hard Lock: ${HARD_LOCK ? "ON" : "OFF"} • AI: ${AI_MODE} • Lock: ${lockTxt}`;
  }

  if (ai2TricksEl) ai2TricksEl.textContent = String(players[0].tricks);
  if (ai3TricksEl) ai3TricksEl.textContent = String(players[1].tricks);
  if (youTricksEl) youTricksEl.textContent = String(players[2].tricks);

  if (trickNumEl) trickNumEl.textContent = String(trickNumber);
  if (trickMaxEl) trickMaxEl.textContent = String(trickMax);

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

function ranksHighToLow() { return ["A","K","Q","J","10","9","8","7","6","5","4","3","2"]; }
function possibleReturnCandidates(pluckerI, suit, limit = 5) {
  const out = [];
  for (const r of ranksHighToLow()) {
    const c = r + suit;
    if (memory.played.has(c)) continue;
    if (players[pluckerI].hand.includes(c)) continue;
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
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

  // YOU pluck: buttons + preview; wrong suit = LOST
  if (pluckerI === 2) {
    pluckNextBtn.disabled = true;

    if (suits.length === 0) {
      pluckStatusEl.textContent = `You are plucking ${pluckee.name}, but have no suit to attempt. This pluck will be skipped.`;
      pluckNextBtn.disabled = false;
      return;
    }

    pluckStatusEl.textContent =
      `You are plucking ${pluckee.name}. Choose a suit. Preview shows what you GIVE + likely return candidates (public-only). WARNING: wrong suit = pluck LOST.`;

    for (const s of suits) {
      const give = lowestOfSuitNonJoker(pluckerI, s);
      const candidates = possibleReturnCandidates(pluckerI, s, 5);

      const btn = document.createElement("button");
      btn.className = "btn";
      btn.style.padding = "10px 12px";
      btn.style.display = "flex";
      btn.style.flexDirection = "column";
      btn.style.alignItems = "flex-start";
      btn.style.gap = "4px";

      btn.innerHTML =
        `<div><strong>${s}</strong> (${suitName(s)})</div>` +
        `<div style="font-size:12px;opacity:.85;">Give: ${give ?? "(none)"}</div>` +
        `<div style="font-size:12px;opacity:.85;">Likely returns: ${candidates.length ? candidates.join(", ") : "(unknown/low)"}</div>`;

      btn.onclick = () => {
        const res = attemptPluck(pluckerI, pluckeeI, s);

        if (!res.ok) {
          markPluckSuitUsed(pluckerI, pluckeeI, s);
          pluckStatusEl.textContent = `You attempted ${s} and FAILED (${res.reason}). Pluck is LOST. Next pluck.`;
          pluckQueue.shift(); activePluck = null;
          if (pluckQueue.length === 0) moveToTrumpPick();
          render();
          return;
        }

        pluckStatusEl.textContent = `You plucked ${s}: gave ${res.giveLow}, received ${res.takeHigh}.`;
        pluckQueue.shift(); activePluck = null;

        if (pluckQueue.length === 0) moveToTrumpPick();
        render();
      };

      pluckChoicesEl.appendChild(btn);
    }
    return;
  }

  // AI pluck: click Run Next Pluck
  pluckNextBtn.disabled = false;

  if (suits.length === 0) {
    pluckStatusEl.textContent = `${plucker.name} is plucking ${pluckee.name}, but has no suit to attempt. Will skip.`;
  } else {
    pluckStatusEl.textContent = `${plucker.name} is plucking ${pluckee.name}. Candidate suits: ${suits.join(", ")}. (Wrong suit loses pluck.)`;
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

  if (pluckerI === 2) {
    pluckStatusEl.textContent = "Choose a suit button to pluck (wrong suit loses the pluck).";
    render();
    return;
  }

  // AI blind suit pick (no victim hand access)
  function remainingHighWeightForSuit(suit) {
    const highs = ["A","K","Q","J","10"];
    let w = 0;
    for (const r of highs) {
      const c = r + suit;
      if (memory.played.has(c)) continue;
      if (players[pluckerI].hand.includes(c)) continue;
      w += 1;
    }
    return w;
  }

  const scored = candidates.map(s => {
    const low = lowestOfSuitNonJoker(pluckerI, s);
    const lowVal = low ? (RANK_VALUE[low.slice(0,-1)]||99) : 99;
    const highW = remainingHighWeightForSuit(s);
    const score = (highW * 10) - (lowVal * 1);
    return { s, score };
  }).sort((a,b) => b.score - a.score);

  const pick = scored[0].s;
  const res = attemptPluck(pluckerI, pluckeeI, pick);

  if (!res.ok) {
    markPluckSuitUsed(pluckerI, pluckeeI, pick);
    pluckStatusEl.textContent = `${players[pluckerI].name} attempted ${pick} and FAILED (${res.reason}). Pluck is LOST.`;
  } else {
    pluckStatusEl.textContent = `${players[pluckerI].name} plucked ${pick}: gave ${res.giveLow}, received ${res.takeHigh}.`;
  }

  pluckQueue.shift(); activePluck = null;
  if (pluckQueue.length === 0) moveToTrumpPick();
  render();
}

// ===== Trump Pick =====
function computeTrumpCallerIndex() {
  let best = 0;
  for (let i=1;i<3;i++) if (players[i].quota > players[best].quota) best = i;
  return best;
}
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
  trumpOpen = (trumpSuit === "C"); // keep your current rule
}
function renderTrumpPickStatus() {
  if (trumpSuit) { trumpStatusEl.textContent = `Trump picked: ${trumpSuit} (${suitName(trumpSuit)}).`; return; }
  const caller = players[trumpCallerIndex];
  trumpStatusEl.textContent = `${caller.name} has the most books to make (quota ${caller.quota}). Trump is picked now (after plucks).`;
}
function wireTrumpButtons() {
  const btns = trumpPanelEl ? trumpPanelEl.querySelectorAll("button[data-trump]") : [];
  btns.forEach(b => {
    b.onclick = () => {
      if (phase !== "TRUMP_PICK") return;
      if (trumpSuit) return;
      if (trumpCallerIndex !== 2) return;

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
function hasNon
