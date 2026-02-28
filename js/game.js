// Pluck Web Demo v13
// FIX: "A new deal must occur before you can pluck."
// Flow is now: Hand ends -> compute pending plucks -> DEAL NEW HAND -> PLUCK -> PLAY
// Includes: real card faces, sorted hand (Trump first, BJ/LJ then A..3), Menace AI v1, Strategic pluck suit choice.

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
  if (isJoker(cs)) return trumpSuit;
  return cs.slice(-1);
}
function isTrumpCard(cs, trumpSuit) {
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

// ===== Menace Memory (per hand) =====
let memory = null;
function resetMemory() {
  memory = {
    played: new Set(),
    voidSuits: [new Set(), new Set(), new Set()],
    trickLog: []
  };
}

// ===== Game state =====
let trumpSuit = "H";
let trumpOpen = false;
let leaderIndex = 0;
let turnIndex = 0;
let leadSuit = null;
let trick = []; // {playerIndex, cardStr}
let lockInput = false;

let trickNumber = 1;
let trickMax = TOTAL_TRICKS;

// Phases
// PLAY: normal play
// WAIT_DEAL: hand ended; plucks computed; must deal new hand before plucking
// PLUCK: applying pending plucks to the NEW deal
let phase = "PLAY";

// Pending plucks (computed at end of prior hand, applied after next deal)
let pendingPluckQueue = null;

// Active pluck processing (during PLUCK phase)
let pluckQueue = [];
let activePluck = null;
let pluckSuitUsedByPair = new Map(); // key "plucker-pluckee" => Set(suits)

function setPhase(newPhase) {
  phase = newPhase;
  phaseLabelEl.textContent = newPhase;
  pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
  pluckNextBtn.disabled = (newPhase !== "PLUCK");
}

// ===== Card UI =====
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

    el.appendChild(tl);
    el.appendChild(br);
    el.appendChild(mid);
    el.appendChild(tag);
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

  el.appendChild(tl);
  el.appendChild(br);
  el.appendChild(mid);
  return el;
}

function displayTrickLine(cardStr) {
  if (cardStr === CARD_BIG_JOKER) return "🃏(Big Joker)";
  if (cardStr === CARD_LITTLE_JOKER) return "🃏(Little Joker)";
  return cardStr;
}

// ===== Sorting hand =====
function sortHandForDisplay(hand) {
  const suitOrderAfterTrump = ["S","H","D","C"].filter(s => s !== trumpSuit);
  const rankOrder = { "A":14,"K":13,"Q":12,"J":11,"10":10,"9":9,"8":8,"7":7,"6":6,"5":5,"4":4,"3":3,"2":2 };

  function suitGroup(s){
    if (s === trumpSuit) return 0;
    return 1 + suitOrderAfterTrump.indexOf(s);
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

// ===== Rendering =====
function render() {
  trumpLabelEl.textContent = `${trumpSuit} (${suitName(trumpSuit)})`;
  trumpOpenLabelEl.textContent = trumpOpen ? "Yes" : "No";

  ai2QuotaLabelEl.textContent = String(players[0].quota);
  ai3QuotaLabelEl.textContent = String(players[1].quota);
  youQuotaLabelEl.textContent = String(players[2].quota);

  // Your hand
  handEl.innerHTML = "";
  const sorted = sortHandForDisplay(players[2].hand);

  for (const c of sorted) {
    const realIdx = players[2].hand.indexOf(c);
    const legal = (phase === "PLAY" && turnIndex === 2) ? legalIndexesFor(2) : [];
    const disabled = !(phase === "PLAY" && turnIndex === 2 && legal.includes(realIdx));

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

  turnBannerEl.textContent =
    `Phase: ${phase} • Turn: ${players[turnIndex].name} • Lead: ${players[leaderIndex].name} • Lead Suit: ${leadSuit ?? "(none)"} • Trump: ${trumpSuit} • Dealer: ${players[dealerIndex].name}`;

  ai2TricksEl.textContent = String(players[0].tricks);
  ai3TricksEl.textContent = String(players[1].tricks);
  youTricksEl.textContent = String(players[2].tricks);

  trickNumEl.textContent = String(trickNumber);
  trickMaxEl.textContent = String(trickMax);

  if (phase === "PLUCK") renderPluckStatus();
}

// ===== Rules / legality =====
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

// ===== Trick winner =====
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

// ===== Void memory =====
function updateVoidMemory(playerIndex, playedCard) {
  if (trick.length === 0) return;
  const mustSuit = leadSuit;
  const playedSuit = cardSuitForFollow(playedCard, trumpSuit);
  if (playedSuit !== mustSuit) {
    memory.voidSuits[playerIndex].add(mustSuit);
  }
}

// ===== Play card =====
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

// ===== MENACE AI v1 =====
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
  const suits = [];
  for (const s of SUITS) {
    if (used.has(s)) continue;
    // plucker must be able to give a non-joker in that suit
    if (!lowestOfSuitNonJoker(pluckerI, s)) continue;
    suits.push(s);
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

  const suits = availablePluckSuits(activePluck.pluckerIndex, activePluck.pluckeeIndex);

  pluckStatusEl.textContent =
    `${plucker.name} is plucking ${pluckee.name}. ` +
    (suits.length
      ? `Plucker can attempt: ${suits.join(", ")}. (Victim return is unknown until attempted.)`
      : `No suit available for plucker. Will skip.`);

  pluckNextBtn.disabled = false;
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
    render();
    return;
  }

  // ===== Blind Suit Choice (no reading victim hand) =====
  // Heuristic: favor suits where plucker gives a very low card (cheap) and the suit is likely to have high cards unseen.
  function remainingHighWeightForSuit(suit) {
    const highRanks = ["A","K","Q","J","10"];
    let w = 0;
    for (const r of highRanks) {
      const c = r + suit;
      // public info: played cards are known
      if (memory && memory.played && memory.played.has(c)) continue;
      // AI knows its own hand; if it has the high card, victim can't have it
      if (players[pluckerI].hand.includes(c)) continue;
      w += 1;
    }
    return w;
  }

  // Score each candidate suit without checking victim hand
  const scored = candidates.map(s => {
    const low = lowestOfSuitNonJoker(pluckerI, s);
    const lowVal = low ? parseCard(low, trumpSuit).value : 99;
    const highW = remainingHighWeightForSuit(s);
    // lower lowVal is better; higher highW is better
    const score = (highW * 10) - (lowVal * 1);
    return { s, score };
  }).sort((a,b) => b.score - a.score);

  // Try suits in score order until one works (engine checks victim can return)
  let success = null;
  for (const pick of scored) {
    const res = attemptPluck(pluckerI, pluckeeI, pick.s);
    if (res.ok) {
      success = { suit: pick.s, ...res };
      break;
    }
  }

  if (!success) {
    pluckStatusEl.textContent =
      `${players[pluckerI].name} tried to pluck ${players[pluckeeI].name}, but none of the candidate suits could be returned. Skipped.`;
  } else {
    pluckStatusEl.textContent =
      `${players[pluckerI].name} plucked ${success.suit}: gave ${displayTrickLine(success.giveLow)}, ` +
      `received ${displayTrickLine(success.takeHigh)}.`;
  }

  pluckQueue.shift();
  activePluck = null;

  if (pluckQueue.length === 0) {
    setPhase("PLAY");
    msgEl.textContent = "Plucks complete. Trick 1 begins.";
    startTrickOneAfterPluck();
  }

  render();
}
function pluckeeCanReturnSuit(pluckeeI, suit) {
  return !!highestOfSuitNonJoker(pluckeeI, suit);
}

// One attempt: try to pluck a suit; if victim can't return, fail and force re-pick.
function attemptPluck(pluckerI, pluckeeI, suit) {
  const giveLow = lowestOfSuitNonJoker(pluckerI, suit);
  if (!giveLow) return { ok:false, reason:`Plucker has no ${suit}.` };

  const takeHigh = highestOfSuitNonJoker(pluckeeI, suit);
  if (!takeHigh) return { ok:false, reason:`Victim has no ${suit} to return.` };

  // Do the exchange (rules: give low, receive high, same suit, no jokers forced)
  removeCardFromHand(pluckerI, giveLow);
  removeCardFromHand(pluckeeI, takeHigh);

  players[pluckerI].hand.push(takeHigh);
  players[pluckeeI].hand.push(giveLow);

  const key = pairKey(pluckerI, pluckeeI);
  if (!pluckSuitUsedByPair.has(key)) pluckSuitUsedByPair.set(key, new Set());
  pluckSuitUsedByPair.get(key).add(suit);

  return { ok:true, giveLow, takeHigh };
}

// ===== Phase transitions =====
function finishHandAndSetPendingPlucks() {
  computePlucksEarnedAndSuffered();
  pendingPluckQueue = buildPluckQueueFromScores();

  // IMPORTANT: per your rule, pluck happens AFTER a new deal.
  setPhase("WAIT_DEAL");
  pluckQueue = [];
  activePluck = null;

  msgEl.textContent = "Hand over. Plucks are pending. Click Reset/New Deal to deal the next hand, then pluck begins.";
  render();
}

function startTrickOneAfterPluck() {
  trick = [];
  leadSuit = null;
  trickNumber = 1;

  // Trump open if clubs is trump
  trumpOpen = (trumpSuit === "C");

  // Holder of 2C leads trick 1 (after pluck, because 2C could move)
  let whoHas2C = 0;
  for (let pi=0; pi<3; pi++) {
    if (players[pi].hand.includes(CARD_OPEN_LEAD)) { whoHas2C = pi; break; }
  }
  leaderIndex = whoHas2C;
  turnIndex = whoHas2C;

  render();
  maybeContinue();
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
          finishHandAndSetPendingPlucks();
          return;
        }

        maybeContinue();
      }, 700);
    }, 600);

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
    }, 650);
  }
}

// ===== Deal =====
function dealNewHandsOnly() {
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

  // Do NOT decide 2C leader yet if pending plucks exist — plucks must happen first.
  trumpOpen = (trumpSuit === "C");
  leaderIndex = 0;
  turnIndex = 0;
}

function dealThenMaybePluckThenPlay() {
  applyFixedQuotas();
  dealNewHandsOnly();

  // If we have pending plucks (from previous hand), run PLUCK now on the NEW deal
  if (pendingPluckQueue && pendingPluckQueue.length > 0) {
    pluckQueue = pendingPluckQueue.slice();
    pendingPluckQueue = null;

    activePluck = null;
    pluckSuitUsedByPair = new Map();

    setPhase("PLUCK");
    msgEl.textContent = "New deal complete. Pluck phase begins (before Trick 1). Click 'Run Next Pluck'.";
    render();
    return;
  }

  // No pending plucks -> start Trick 1 immediately
  setPhase("PLAY");
  msgEl.textContent = "New deal complete. Trick 1 begins.";
  startTrickOneAfterPluck();
}

// Events
pluckNextBtn.addEventListener("click", () => runOnePluck());

resetBtn.addEventListener("click", () => {
  // Reset/New Deal now also triggers pending plucks when required by rule
  dealThenMaybePluckThenPlay();
});

applyTrumpBtn.addEventListener("click", () => {
  const v = trumpSelectEl.value;
  trumpSuit = (v === "S" || v === "H" || v === "D" || v === "C") ? v : "H";
  // Changing trump implies a fresh deal, pending plucks cleared (demo behavior)
  pendingPluckQueue = null;
  dealThenMaybePluckThenPlay();
});

// Start
trumpSuit = trumpSelectEl.value || "H";
applyFixedQuotas();
pendingPluckQueue = null;
dealThenMaybePluckThenPlay();
console.log("Pluck Demo v13 loaded");
