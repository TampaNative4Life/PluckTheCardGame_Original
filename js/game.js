// Pluck Web Demo v19
// CUT FOR DEAL -> (FIRST HAND) DEAL -> DEALER SELECTS TRUMP -> PLAY
// AFTER FIRST HAND: DEAL -> PLUCK -> DEALER SELECTS TRUMP -> PLAY
// AI does NOT read player hands for pluck/trump decisions (uses own hand only).
// You must follow suit if possible.
// Trick 1 lead is always 2C.

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.textContent = "ERROR: " + msg;
  console.error(msg);
}
window.addEventListener("error", (e) => showError(e.message || "Unknown script error"));

// ===== Elements (must match game.html ids) =====
const handEl = document.getElementById("hand");
const trickEl = document.getElementById("trick");
const msgEl = document.getElementById("msg");
const resetBtn = document.getElementById("resetBtn");

const ai2HandEl = document.getElementById("ai2Hand");
const ai3HandEl = document.getElementById("ai3Hand");

const turnBannerEl = document.getElementById("turnBanner");

const trumpLabelEl = document.getElementById("trumpLabel");
const trumpOpenLabelEl = document.getElementById("trumpOpenLabel");
const dealerLabelEl = document.getElementById("dealerLabel");
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

// Cut for deal UI
const cutAI2El = document.getElementById("cutAI2");
const cutAI3El = document.getElementById("cutAI3");
const cutYOUEl = document.getElementById("cutYOU");
const cutMsgEl = document.getElementById("cutMsg");
const cutDrawBtn = document.getElementById("cutDrawBtn");
const cutRedoBtn = document.getElementById("cutRedoBtn");

// Trump Ace display
const trumpAceEl = document.getElementById("trumpAce");

// ===== Constants =====
const TOTAL_TRICKS = 17;
const SUITS = ["S", "H", "D", "C"];
const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

const CARD_BIG_JOKER = "BJ";
const CARD_LITTLE_JOKER = "LJ";
const CARD_OPEN_LEAD = "2C";

// Image folder for card images (optional). If missing, fallback UI cards are used.
const USE_CARD_IMAGES = true;
const CARD_IMG_DIR = "assets/cards"; // put "AS.png", "10H.png", "BJ.png", etc.

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

// ===== Memory (public inference only) =====
let memory = null;
function resetMemory() {
  memory = {
    played: new Set(),
    voidSuits: [new Set(), new Set(), new Set()]
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

// CUT, DEAL, PLUCK, TRUMP_PICK, PLAY
let phase = "CUT";
let firstHandDone = false;

// Pluck
let pendingPluckQueue = null;
let pluckQueue = [];
let activePluck = null;
let pluckSuitUsedByPair = new Map();

// Cut-for-deal cards
let cutDeck = [];
let cutCards = { 0:null, 1:null, 2:null };
let cutDone = false;

// ===== Phase UI =====
function setPhase(newPhase) {
  phase = newPhase;
  if (phaseLabelEl) phaseLabelEl.textContent = newPhase;

  if (pluckPanelEl) pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
  if (trumpPanelEl) trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";

  [pDeal,pPluck,pTrump,pPlay].forEach(x => x && x.classList.remove("activeChip"));
  if (newPhase === "DEAL") pDeal && pDeal.classList.add("activeChip");
  if (newPhase === "PLUCK") pPluck && pPluck.classList.add("activeChip");
  if (newPhase === "TRUMP_PICK") pTrump && pTrump.classList.add("activeChip");
  if (newPhase === "PLAY") pPlay && pPlay.classList.add("activeChip");
}

// ===== Card face render (image + fallback) =====
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

// ===== Hand sorting (your request: group by suit; jokers first; A,K,Q,J,10... ) =====
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
function renderTrumpAce() {
  if (!trumpAceEl) return;

  trumpAceEl.innerHTML = "";
  if (!trumpSuit) {
    trumpAceEl.textContent = "(waiting)";
    return;
  }

  const aceCode = "A" + trumpSuit;
  const face = makeCardFace(aceCode, true);
  face.style.cursor = "default";
  face.style.transform = "none";
  trumpAceEl.appendChild(face);
}

function renderCutCards() {
  if (!cutAI2El || !cutAI3El || !cutYOUEl) return;

  const slots = [
    { el: cutAI2El, card: cutCards[0] },
    { el: cutAI3El, card: cutCards[1] },
    { el: cutYOUEl, card: cutCards[2] }
  ];

  for (const s of slots) {
    s.el.innerHTML = "";
    if (!s.card) {
      s.el.textContent = "(face down)";
    } else {
      const face = makeCardFace(s.card, true);
      face.style.cursor = "default";
      face.style.transform = "none";
      s.el.appendChild(face);
    }
  }
}

function render() {
  if (dealerLabelEl) dealerLabelEl.textContent = cutDone ? players[dealerIndex].id : "(not set)";

  if (trumpLabelEl) trumpLabelEl.textContent = trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not picked)";
  if (trumpOpenLabelEl) trumpOpenLabelEl.textContent = trumpOpen ? "Yes" : "No";
  renderTrumpAce();
  renderCutCards();

  if (ai2QuotaLabelEl) ai2QuotaLabelEl.textContent = String(players[0].quota);
  if (ai3QuotaLabelEl) ai3QuotaLabelEl.textContent = String(players[1].quota);
  if (youQuotaLabelEl) youQuotaLabelEl.textContent = String(players[2].quota);

  // Your hand
  if (handEl) {
    handEl.innerHTML = "";
    const sorted = sortHandForDisplay(players[2].hand);

    for (const c of sorted) {
      const realIdx = players[2].hand.indexOf(c);
      const isYourTurn = (phase === "PLAY" && turnIndex === 2);
      const legal = isYourTurn ? legalIndexesFor(2) : [];
      const disabled = !(isYourTurn && legal.includes(realIdx));

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
        face.style.transform = "none";

        wrap.appendChild(label);
        wrap.appendChild(face);
        trickEl.appendChild(wrap);
      }
    }
  }

  // AI hands hidden
  if (ai2HandEl) ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
  if (ai3HandEl) ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

  // Score
  if (ai2TricksEl) ai2TricksEl.textContent = String(players[0].tricks);
  if (ai3TricksEl) ai3TricksEl.textContent = String(players[1].tricks);
  if (youTricksEl) youTricksEl.textContent = String(players[2].tricks);

  if (trickNumEl) trickNumEl.textContent = String(trickNumber);
  if (trickMaxEl) trickMaxEl.textContent = String(trickMax);

  // Banner
  if (turnBannerEl) {
    const leadTxt = leadSuit ?? "(none)";
    const tTxt = trumpSuit ?? "(not picked)";
    turnBannerEl.textContent =
      `Phase: ${phase} • Dealer: ${cutDone ? players[dealerIndex].id : "(not set)"} • Turn: ${players[turnIndex]?.id ?? "—"} • Lead Suit: ${leadTxt} • Trump: ${tTxt}`;
  }

  if (phase === "PLUCK") renderPluckStatus();
  if (phase === "TRUMP_PICK") renderTrumpPickStatus();
}

// ===== CUT FOR DEAL =====
function cutValue(cardStr) {
  if (cardStr === CARD_BIG_JOKER) return 100;
  if (cardStr === CARD_LITTLE_JOKER) return 90;
  if (cardStr === "2C") return 2;
  const rank = cardStr.slice(0, cardStr.length-1);
  return RANK_VALUE[rank] || 999;
}

function startCutForDeal() {
  setPhase("CUT");
  cutDone = false;
  firstHandDone = false;
  trumpSuit = null;
  trumpOpen = false;

  cutDeck = shuffle(makePluckDeck51());
  cutCards = { 0:null, 1:null, 2:null };

  if (cutMsgEl) cutMsgEl.textContent = "Ready to cut.";
  if (msgEl) msgEl.textContent = "";

  render();
}

function resolveCut() {
  const v0 = cutValue(cutCards[0]);
  const v1 = cutValue(cutCards[1]);
  const v2 = cutValue(cutCards[2]);
  const min = Math.min(v0,v1,v2);

  const winners = [];
  if (v0 === min) winners.push(0);
  if (v1 === min) winners.push(1);
  if (v2 === min) winners.push(2);

  if (winners.length !== 1) {
    // Tie: re-cut (simple + clear)
    if (cutMsgEl) cutMsgEl.textContent = "Tie on the cut. Re-cut.";
    cutCards = { 0:null, 1:null, 2:null };
    render();
    return;
  }

  dealerIndex = winners[0];
  applyQuotasFromDealer();
  cutDone = true;

  if (cutMsgEl) cutMsgEl.textContent = `${players[dealerIndex].id} drew lowest and is DEALER.`;
  if (msgEl) msgEl.textContent = "Dealer set. Dealing first hand (no pluck phase).";

  // Immediately begin first hand (NO PLUCK)
  startNewHand({ skipPluck: true });
}

// Click: draw your card; AI auto draws too.
function drawCutCards() {
  if (cutDone) return;
  if (!cutDeck || cutDeck.length < 3) cutDeck = shuffle(makePluckDeck51());

  // AI draws
  cutCards[0] = cutDeck.pop();
  cutCards[1] = cutDeck.pop();

  // YOU draw
  cutCards[2] = cutDeck.pop();

  render();
  resolveCut();
}

// ===== DEAL / HAND START =====
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

  // Trump not picked yet
  trumpSuit = null;
  trumpOpen = false;

  // Reset pluck state
  pluckSuitUsedByPair = new Map();
  activePluck = null;

  // default leader will be who has 2C when play begins
  leaderIndex = 0;
  turnIndex = 0;
}

function startNewHand({ skipPluck }) {
  setPhase("DEAL");
  applyQuotasFromDealer();
  dealNewHands();
  render();

  // First hand has no pluck
  if (skipPluck) {
    setPhase("TRUMP_PICK");
    openTrumpPick();
    return;
  }

  // Later hands: if pending plucks exist, run PLUCK; else skip to TRUMP
  pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
  pendingPluckQueue = null;

  if (pluckQueue.length === 0) {
    setPhase("TRUMP_PICK");
    openTrumpPick();
    return;
  }

  setPhase("PLUCK");
  if (msgEl) msgEl.textContent = "Pluck phase begins (manual).";
  render();
}

// ===== TRUMP PICK =====
function setTrump(suit) {
  trumpSuit = suit;
  // Keep your existing “clubs opens immediately” behavior
  trumpOpen = (trumpSuit === "C");
  render();
}

function dealerChoosesTrumpFromOwnHand() {
  // Dealer only looks at dealer hand.
  const hand = players[dealerIndex].hand;
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
    if (v >= 11) suitScore[suit] += (v - 10) * 2; // J/Q/K/A
    else suitScore[suit] += Math.max(0, v - 6) * 0.5;
  }

  let bestSuit = "H", bestScore = -Infinity;
  for (const s of SUITS) {
    if (suitScore[s] > bestScore) { bestScore = suitScore[s]; bestSuit = s; }
  }
  return bestSuit;
}

function renderTrumpPickStatus() {
  if (!trumpStatusEl) return;

  if (trumpSuit) {
    trumpStatusEl.textContent = `Trump selected: ${trumpSuit} (${suitName(trumpSuit)}).`;
    return;
  }

  if (dealerIndex === 2) {
    trumpStatusEl.textContent = `You are the Dealer (quota 7). Pick trump now.`;
  } else {
    trumpStatusEl.textContent = `${players[dealerIndex].id} is the Dealer (quota 7). Dealer will pick trump now.`;
  }
}

function wireTrumpButtons() {
  if (!trumpPanelEl) return;
  const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
  btns.forEach(b => {
    b.onclick = () => {
      if (phase !== "TRUMP_PICK") return;
      if (trumpSuit) return;
      if (dealerIndex !== 2) return;

      const suit = b.getAttribute("data-trump");
      if (!SUITS.includes(suit)) return;

      setTrump(suit);
      if (msgEl) msgEl.textContent = `You selected trump: ${suit} (${suitName(suit)}).`;
      moveToPlay();
    };
  });
}

function openTrumpPick() {
  renderTrumpPickStatus();
  render();

  // AI dealer picks instantly; you click if you are dealer
  if (dealerIndex !== 2) {
    const suit = dealerChoosesTrumpFromOwnHand();
    setTrump(suit);
    if (msgEl) msgEl.textContent = `${players[dealerIndex].id} selected trump: ${suit} (${suitName(suit)}).`;
    moveToPlay();
  } else {
    if (msgEl) msgEl.textContent = "Pick trump (you are dealer).";
  }
}

function moveToPlay() {
  setPhase("PLAY");
  if (msgEl) msgEl.textContent = "Trump set. Trick 1 begins.";
  startTrickOne();
}

// ===== PLAY RULES =====
function hasNonTrump(playerIndex) {
  return players[playerIndex].hand.some(c => !isTrumpCard(c, trumpSuit));
}

function illegalReason(playerIndex, cardStr) {
  // Trick 1 lead must be 2C if you hold it and you're leading
  if (trickNumber === 1 && trick.length === 0 && players[playerIndex].hand.includes(CARD_OPEN_LEAD)) {
    if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
  }

  // Trump closed: cannot LEAD trump if you have any non-trump (unless clubs trump auto-open is already set)
  if (trick.length === 0 && !trumpOpen && trumpSuit !== "C") {
    if (isTrumpCard(cardStr, trumpSuit) && hasNonTrump(playerIndex)) return "Trump not open. Lead a non-trump card.";
  }

  // Must follow suit if possible
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
    let bestPi = trick[0].playerIndex;
    let bestP = -1;
    for (const t of trick) {
      if (!isTrumpCard(t.cardStr, trumpSuit)) continue;
      const p = cardPower(t.cardStr);
      if (p > bestP) { bestP = p; bestPi = t.playerIndex; }
    }
    return bestPi;
  }

  let bestPi = trick[0].playerIndex;
  let bestV = -1;
  for (const t of trick) {
    if (cardSuitForFollow(t.cardStr, trumpSuit) !== leadSuit) continue;
    const c = parseCard(t.cardStr, trumpSuit);
    if (c.value > bestV) { bestV = c.value; bestPi = t.playerIndex; }
  }
  return bestPi;
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

  // next player
  turnIndex = (turnIndex + 1) % 3;
  render();
  maybeContinue();
}

// ===== Simple “always try to win” AI =====
function aiChooseIndex(playerIndex) {
  const legal = legalIndexesFor(playerIndex);
  const hand = players[playerIndex].hand;

  // If following suit and can win now, do it with cheapest winning card. Else dump cheapest legal.
  const canWin = [];
  for (const idx of legal) {
    const card = hand[idx];
    if (wouldWinIfPlayedNow(playerIndex, card)) canWin.push(idx);
  }

  if (canWin.length > 0) {
    canWin.sort((a,b) => cardPower(hand[a]) - cardPower(hand[b]));
    return canWin[0];
  }

  // dump cheapest
  legal.sort((a,b) => cardPower(hand[a]) - cardPower(hand[b]));
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

  // If trump is clubs, already open
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

  // Trick complete
  if (trick.length === 3) {
    lockInput = true;

    setTimeout(() => {
      const winner = evaluateTrickWinner();
      players[winner].tricks += 1;
      if (msgEl) msgEl.textContent = `${players[winner].id} wins the trick.`;
      render();

      setTimeout(() => {
        clearTrickForNext(winner);
        trickNumber += 1;
        lockInput = false;
        render();

        if (roundIsOver()) {
          // After hand ends, compute plucks for NEXT hand
          computePlucksEarnedAndSuffered();
          pendingPluckQueue = buildPluckQueueFromScores();

          firstHandDone = true;

          if (msgEl) msgEl.textContent = "Hand over. Click Reset for next deal.";
          return;
        }

        maybeContinue();
      }, 350);
    }, 300);

    return;
  }

  // AI turns
  if (turnIndex !== 2) {
    lockInput = true;
    setTimeout(() => {
      const aiIdx = aiChooseIndex(turnIndex);
      playCard(turnIndex, aiIdx);
      lockInput = false;
      render();
    }, 220);
  }
}

// ===== PLUCK (same core as before, minimal + stable) =====
function clearPluckChoicesUI() {
  if (pluckChoicesEl) pluckChoicesEl.innerHTML = "";
}

function computePlucksEarnedAndSuffered() {
  for (const p of players) {
    p.plucksEarned = Math.max(0, p.tricks - p.quota);
    p.plucksSuffered = Math.max(0, p.quota - p.tricks);
  }
}

function pluckerOrder() {
  const idx = [0,1,2];
  idx.sort((a,b) => players[b].plucksEarned - players[a].plucksEarned);
  return idx.filter(i => players[i].plucksEarned > 0);
}
function victimOrder() {
  const idx = [0,1,2];
  idx.sort((a,b) => players[b].plucksSuffered - players[a].plucksSuffered);
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
      const victim = victims.find(v => (remainingSuffered.get(v) || 0) > 0);
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

  if (!pluckQueue || pluckQueue.length === 0) {
    if (pluckStatusEl) pluckStatusEl.textContent = "No plucks to process.";
    if (pluckNextBtn) pluckNextBtn.disabled = true;
    return;
  }
  if (!activePluck) activePluck = pluckQueue[0];

  const pluckerI = activePluck.pluckerIndex;
  const pluckeeI = activePluck.pluckeeIndex;

  const suits = availablePluckSuits(pluckerI, pluckeeI);

  // You pluck: suit buttons (wrong suit => LOST)
  if (pluckerI === 2) {
    if (pluckNextBtn) pluckNextBtn.disabled = true;

    if (pluckStatusEl) {
      pluckStatusEl.textContent =
        `You are plucking ${players[pluckeeI].id}. Choose a suit. Wrong suit attempt = LOST.`;
    }

    for (const s of suits) {
      const give = lowestOfSuitNonJoker(pluckerI, s);

      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = `${s} (${suitName(s)}) • Give: ${give ?? "(none)"}`;

      btn.onclick = () => {
        const res = attemptPluck(pluckerI, pluckeeI, s);
        if (!res.ok) {
          markPluckSuitUsed(pluckerI, pluckeeI, s);
          if (pluckStatusEl) pluckStatusEl.textContent = `FAILED (${res.reason}). Pluck LOST.`;
        } else {
          if (pluckStatusEl) pluckStatusEl.textContent = `Success: gave ${res.giveLow}, received ${res.takeHigh}.`;
        }

        pluckQueue.shift();
        activePluck = null;

        if (pluckQueue.length === 0) {
          setPhase("TRUMP_PICK");
          openTrumpPick();
        } else {
          render();
        }
      };

      pluckChoicesEl.appendChild(btn);
    }
    return;
  }

  // AI pluck: button-driven
  if (pluckNextBtn) pluckNextBtn.disabled = false;
  if (pluckStatusEl) {
    pluckStatusEl.textContent = `${players[pluckerI].id} is plucking ${players[pluckeeI].id}. Click “Run Next Pluck”.`;
  }
}

function runOnePluck() {
  if (phase !== "PLUCK") return;
  if (!pluckQueue || pluckQueue.length === 0) return;
  if (!activePluck) activePluck = pluckQueue[0];

  const pluckerI = activePluck.pluckerIndex;
  const pluckeeI = activePluck.pluckeeIndex;

  const candidates = availablePluckSuits(pluckerI, pluckeeI);

  if (candidates.length === 0) {
    if (pluckStatusEl) pluckStatusEl.textContent = `No suit available. Skipped.`;
    pluckQueue.shift();
    activePluck = null;
    if (pluckQueue.length === 0) { setPhase("TRUMP_PICK"); openTrumpPick(); }
    render();
    return;
  }

  // AI chooses suit without inspecting victim hand (blind). Just pick suit whose give is cheapest.
  candidates.sort((a,b) => {
    const la = lowestOfSuitNonJoker(pluckerI, a);
    const lb = lowestOfSuitNonJoker(pluckerI, b);
    const va = la ? (RANK_VALUE[la.slice(0,-1)]||99) : 99;
    const vb = lb ? (RANK_VALUE[lb.slice(0,-1)]||99) : 99;
    return va - vb;
  });

  const suit = candidates[0];
  const res = attemptPluck(pluckerI, pluckeeI, suit);

  if (!res.ok) {
    markPluckSuitUsed(pluckerI, pluckeeI, suit);
    if (pluckStatusEl) pluckStatusEl.textContent = `FAILED (${res.reason}). Pluck LOST.`;
  } else {
    if (pluckStatusEl) pluckStatusEl.textContent = `Success: ${players[pluckerI].id} gave ${res.giveLow}, got ${res.takeHigh}.`;
  }

  pluckQueue.shift();
  activePluck = null;

  if (pluckQueue.length === 0) {
    setPhase("TRUMP_PICK");
    openTrumpPick();
  } else {
    render();
  }
}

// ===== Events =====
if (pluckNextBtn) pluckNextBtn.addEventListener("click", () => runOnePluck());

if (resetBtn) resetBtn.addEventListener("click", () => {
  // rotate dealer to the right after each hand (your rotating game complexity)
  dealerIndex = rightOf(dealerIndex);
  applyQuotasFromDealer();

  if (msgEl) msgEl.textContent = "New deal.";

  // After first hand, plucks may happen. First hand is already done if user played once.
  startNewHand({ skipPluck: !firstHandDone });
});

if (cutDrawBtn) cutDrawBtn.addEventListener("click", () => drawCutCards());
if (cutRedoBtn) cutRedoBtn.addEventListener("click", () => startCutForDeal());

// Trump buttons
wireTrumpButtons();

// ===== Boot =====
resetMemory();
applyQuotasFromDealer();
startCutForDeal();
setPhase("CUT");
render();
console.log("Pluck Demo v19 loaded");
