// Pluck Web Demo v15
// Order enforced: DEAL -> PLUCK -> TRUMP PICK -> PLAY
// Pluck failure = LOST (no re-pick), for both YOU and AI.
// AI cannot read other players' hands for decision-making (pluck & trump pick are blind).

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

// Phases: DEAL (instant), PLUCK, TRUMP_PICK, PLAY
let phase = "PLUCK";

let pendingPluckQueue = null;   // from last hand
let pluckQueue = [];
let activePluck = null;
let pluckSuitUsedByPair = new Map(); // "plucker-pluckee" => Set(suits)

function setPhase(newPhase) {
  phase = newPhase;
  phaseLabelEl.textContent = newPhase;

  // Panels
  pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
  trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";

  // Phase chips
  [pDeal,pPluck,pTrump,pPlay].forEach(x => x.classList.remove("activeChip"));
  if (newPhase === "PLUCK") pPluck.classList.add("activeChip");
  if (newPhase === "TRUMP_PICK") pTrump.classList.add("activeChip");
  if (newPhase === "PLAY") pPlay.classList.add("activeChip");

  // Deal is instant; we highlight it briefly in code when dealing
}

function flashDealChip() {
  [pDeal,pPluck,pTrump,pPlay].forEach(x => x.classList.remove("activeChip"));
  pDeal.classList.add("activeChip");
  setTimeout(() => {
    pDeal.classList.remove("activeChip");
    if (phase === "PLUCK") pPluck.classList.add("activeChip");
    if (phase === "TRUMP_PICK") pTrump.classList.add("activeChip");
    if (phase === "PLAY") pPlay.classList.add("activeChip");
  }, 500);
}

function displayTrickLine(cardStr) {
  if (cardStr === CARD_BIG_JOKER) return "🃏(Big Joker)";
  if (cardStr === CARD_LITTLE_JOKER) return "🃏(Little Joker)";
  return cardStr;
}

// ===== UI Cards =====
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

// ===== Sort =====
function sortHandForDisplay(hand) {
  // Before trump pick: group by suit order S,H,D,C and jokers first.
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
  if (!pluckChoicesEl) return;
  pluckChoicesEl.innerHTML = "";
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

  ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
  ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

  const leadSuitText = leadSuit ?? "(none)";
  const trumpText = trumpSuit ?? "(not picked)";
  turnBannerEl.textContent =
    `Phase: ${phase} • Turn: ${players[turnIndex].name} • Lead: ${players[leaderIndex].name} • Lead Suit: ${leadSuitText} • Trump: ${trumpText}`;

  ai2TricksEl.textContent = String(players[0].tricks);
  ai3TricksEl.textContent = String(players[1].tricks);
  youTricksEl.textContent = String(players[2].tricks);

  trickNumEl.textContent = String(trickNumber);
  trickMaxEl.textContent = String(trickMax);

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

// Fair: only checks plucker’s hand + per-pair suit restriction
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
    // Public-only preview: we cannot inspect victim hands.
    // (We *can* exclude played cards later when play begins; before play, memory.played is empty.)
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
      `You are plucking ${pluckee.name}. Choose a suit. ` +
      `Preview shows what you GIVE + likely return candidates (public-only). ` +
      `WARNING: wrong suit = pluck LOST.`;

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
        `<div style="font-size:12px;opacity:.85;">Give: ${give ? displayTrickLine(give) : "(none)"}</div>` +
        `<div style="font-size:12px;opacity:.85;">Likely returns: ${candidates.length ? candidates.join(", ") : "(unknown/low)"}</div>`;

      btn.onclick = () => {
        const res = attemptPluck(pluckerI, pluckeeI, s);

        if (!res.ok) {
          // LOST: mark suit used anyway and burn pluck
          markPluckSuitUsed(pluckerI, pluckeeI, s);

          pluckStatusEl.textContent = `You attempted ${s} and FAILED (${res.reason}). Pluck is LOST. Next pluck.`;
          pluckQueue.shift();
          activePluck = null;

          if (pluckQueue.length === 0) moveToTrumpPick();
          render();
          return;
        }

        pluckStatusEl.textContent =
          `You plucked ${s}: gave ${displayTrickLine(res.giveLow)}, received ${displayTrickLine(res.takeHigh)}.`;

        pluckQueue.shift();
        activePluck = null;

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
    pluckStatusEl.textContent =
      `${plucker.name} is plucking ${pluckee.name}. Candidate suits: ${suits.join(", ")}. (Wrong suit loses pluck.)`;
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
    pluckQueue.shift();
    activePluck = null;
    if (pluckQueue.length === 0) moveToTrumpPick();
    render();
    return;
  }

  // YOU must use buttons
  if (pluckerI === 2) {
    pluckStatusEl.textContent = "Choose a suit button to pluck (wrong suit loses the pluck).";
    render();
    return;
  }

  // AI blind: pick ONE suit (no victim hand access). Wrong = LOST.
  // heuristic: choose suit with lowest give card (cheap) + many high cards still “out there”
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
    pluckStatusEl.textContent =
      `${players[pluckerI].name} attempted ${pick} and FAILED (${res.reason}). Pluck is LOST.`;
  } else {
    pluckStatusEl.textContent =
      `${players[pluckerI].name} plucked ${pick}: gave ${displayTrickLine(res.giveLow)}, received ${displayTrickLine(res.takeHigh)}.`;
  }

  pluckQueue.shift();
  activePluck = null;

  if (pluckQueue.length === 0) moveToTrumpPick();
  render();
}

// ===== Trump Pick (AFTER PLUCKS) =====
function computeTrumpCallerIndex() {
  // “Most books to make” = highest quota
  let best = 0;
  for (let i=1;i<3;i++) if (players[i].quota > players[best].quota) best = i;
  return best;
}

// AI chooses trump from OWN hand only
function aiChooseTrumpFromOwnHand(aiIndex) {
  const hand = players[aiIndex].hand;
  const suitScore = { S:0, H:0, D:0, C:0 };

  for (const cs of hand) {
    if (cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER) {
      suitScore.S += 6; suitScore.H += 6; suitScore.D += 6; suitScore.C += 6;
      continue;
    }
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
  trumpOpen = (trumpSuit === "C"); // keep your current rule
}

let trumpCallerIndex = 0;

function renderTrumpPickStatus() {
  if (trumpSuit) {
    trumpStatusEl.textContent = `Trump picked: ${trumpSuit} (${suitName(trumpSuit)}).`;
    return;
  }
  const caller = players[trumpCallerIndex];
  if (trumpCallerIndex === 2) {
    trumpStatusEl.textContent = `You have the most books to make (quota ${caller.quota}). Pick trump now.`;
  } else {
    trumpStatusEl.textContent = `${caller.name} has the most books to make (quota ${caller.quota}). AI will pick trump now.`;
  }
}

function wireTrumpButtons() {
  const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
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

function moveToTrumpPick() {
  setPhase("TRUMP_PICK");
  trumpCallerIndex = computeTrumpCallerIndex();
  render();

  if (trumpCallerIndex !== 2) {
    const s = aiChooseTrumpFromOwnHand(trumpCallerIndex);
    setTrump(s);
    msgEl.textContent = `${players[trumpCallerIndex].name} picked trump: ${s} (${suitName(s)}).`;
    moveToPlay();
    render();
  } else {
    msgEl.textContent = "Plucks complete. Pick trump.";
  }
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
  if (playedSuit !== mustSuit) {
    memory.voidSuits[playerIndex].add(mustSuit);
  }
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

// MENACE play AI (same as before; uses public info + own hand)
function cardVal(cardStr) {
  if (cardStr === CARD_BIG_JOKER) return 1000;
  if (cardStr === CARD_LITTLE_JOKER) return 900;
  return parseCard(cardStr, trumpSuit).value;
}
function opponentNeeds(playerIndex) {
  return [0,1,2].filter(i => i !== playerIndex).map(i => ({ i, need: players[i].quota - players[i].tricks }));
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
function scoreLeadCard(playerIndex, cardStr) {
  const v = cardVal(cardStr);
  const trump = isTrumpCard(cardStr, trumpSuit);
  const suit = cardSuitForFollow(cardStr, trumpSuit);
  const neededSelf = players[playerIndex].quota - players[playerIndex].tricks;
  const opp = opponentNeeds(playerIndex);
  const someoneNeeds = opp.some(o => o.need > 0);
  const voidCount = opp.reduce((acc, o) => acc + (memory.voidSuits[o.i].has(suit) ? 1 : 0), 0);

  let score = 0;

  if (neededSelf > 0) {
    score += v * 10;
    if (trump) score += (trumpOpen ? 220 : -500);
    score += voidCount * 200;
    if (cardStr === CARD_BIG_JOKER) score += 350;
    if (cardStr === CARD_LITTLE_JOKER) score += 250;
  } else if (neededSelf < 0) {
    score -= v * 12;
    if (trump) score -= 250;
    if (isJoker(cardStr)) score -= 1200;
  } else {
    score -= v * 9;
    if (someoneNeeds) {
      score += voidCount * 80;
      if (trump && trumpOpen) score += 60;
    }
    if (isJoker(cardStr)) score -= 900;
  }
  return score;
}
function scoreFollowCard(playerIndex, cardStr) {
  const v = cardVal(cardStr);
  const trump = isTrumpCard(cardStr, trumpSuit);
  const neededSelf = players[playerIndex].quota - players[playerIndex].tricks;
  const opp = opponentNeeds(playerIndex);
  const someoneNeeds = opp.some(o => o.need > 0);
  const winsNow = wouldWinIfPlayedNow(playerIndex, cardStr);

  let score = 0;

  if (neededSelf > 0) {
    score += v * 10;
    if (winsNow) score += 350;
    if (trump) score += 220;
    if (cardStr === CARD_BIG_JOKER) score += 400;
    if (cardStr === CARD_LITTLE_JOKER) score += 320;
  } else if (neededSelf < 0) {
    score -= v * 12;
    if (winsNow) score -= 600;
    if (trump) score -= 250;
    if (isJoker(cardStr)) score -= 1200;
  } else {
    score -= v * 9;
    if (winsNow) score -= 350;

    if (someoneNeeds) {
      if (winsNow) score += 650;
      if (trump) score += 120;
      if (isJoker(cardStr)) score -= 700;
    }
  }

  if (trick.length > 0 && cardSuitForFollow(cardStr, trumpSuit) === leadSuit) score += 40;
  return score;
}
function chooseAiIndex(playerIndex) {
  const legal = legalIndexesFor(playerIndex);
  const hand = players[playerIndex].hand;

  let bestIdx = legal[0];
  let bestScore = -Infinity;
  const leading = (trick.length === 0);

  for (const idx of legal) {
    const card = hand[idx];
    const score = leading ? scoreLeadCard(playerIndex, card) : scoreFollowCard(playerIndex, card);
    if (score > bestScore) { bestScore = score; bestIdx = idx; }
  }
  return bestIdx;
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
          // end hand -> pending plucks for NEXT deal
          computePlucksEarnedAndSuffered();
          pendingPluckQueue = buildPluckQueueFromScores();

          msgEl.textContent = "Hand over. Click Reset for next deal (then plucks, then trump pick).";
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

// ===== Deal and phase kick =====
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

  leaderIndex = 0;
  turnIndex = 0;

  // Trump not picked until AFTER plucks
  trumpSuit = null;
  trumpOpen = false;

  pluckSuitUsedByPair = new Map();
  activePluck = null;

  flashDealChip();
}

function startPluckPhaseAfterDeal() {
  setPhase("PLUCK");

  // If there were pending plucks from last hand, use them now. Otherwise no plucks.
  pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
  pendingPluckQueue = null;

  if (pluckQueue.length === 0) {
    msgEl.textContent = "No plucks this hand. Move to trump pick.";
    moveToTrumpPick();
  } else {
    msgEl.textContent = "Pluck phase begins (manual).";
  }
  render();
}

// After plucks complete, move to trump pick
function moveToTrumpPick() {
  setPhase("TRUMP_PICK");
  const caller = computeTrumpCallerIndex(); // highest quota (7)
  renderTrumpPickStatus();
  render();

  // AI caller picks immediately, YOU caller clicks button
  if (caller !== 2) {
    const suit = aiChooseTrumpFromOwnHand(caller);
    setTrump(suit);
    msgEl.textContent = `${players[caller].name} picked trump: ${suit} (${suitName(suit)}).`;
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

// Wire trump buttons
function wireTrumpButtons() {
  const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
  btns.forEach(b => {
    b.onclick = () => {
      if (phase !== "TRUMP_PICK") return;
      if (trumpSuit) return;

      // In your current rules, highest quota is AI2 so you normally won't click.
      // If later you decide YOU can be caller, this is ready.
      const suit = b.getAttribute("data-trump");
      if (!SUITS.includes(suit)) return;

      setTrump(suit);
      trumpStatusEl.textContent = `You picked trump: ${suit} (${suitName(suit)}).`;
      moveToPlay();
      render();
    };
  });
}

function renderTrumpPickStatus() {
  if (trumpSuit) {
    trumpStatusEl.textContent = `Trump picked: ${trumpSuit} (${suitName(trumpSuit)}).`;
    return;
  }
  const caller = players[computeTrumpCallerIndex()];
  trumpStatusEl.textContent =
    `${caller.name} has the most books to make (quota ${caller.quota}). Trump is picked now (after plucks).`;
}

// Events
pluckNextBtn.addEventListener("click", () => runOnePluck());
resetBtn.addEventListener("click", () => {
  applyFixedQuotas();
  dealNewHands();
  startPluckPhaseAfterDeal();
});

wireTrumpButtons();

// Start
applyFixedQuotas();
pendingPluckQueue = null;
dealNewHands();
startPluckPhaseAfterDeal();
console.log("Pluck Demo v15 loaded");
