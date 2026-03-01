// Pluck Web Demo v19
// Fixes: no-card display, no-click play, and adds Initial Dealer Pick + OK confirm.
// Rules implemented:
// - INITIAL PICK: each player draws 1 visible card; LOWEST card becomes Dealer.
// - If tie for LOWEST: repack and re-pick.
// - First hand: NO PLUCK phase (because no previous hand result).
// - Later hands: DEAL -> PLUCK (based on prior hand) -> Dealer Selects Trump -> PLAY.
// - Must follow suit if possible.
// - Trick winner leads next trick.
// - Dealer rotates RIGHT each new deal after the first hand (as part of complexity).
// - Show Ace of trump suit selected.

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.textContent = "ERROR: " + msg;
  console.error(msg);
}
window.addEventListener("error", (e) => showError(e.message || "Unknown script error"));

// ===== Elements (must exist in game.html) =====
const handEl = document.getElementById("hand");
const trickEl = document.getElementById("trick");
const msgEl = document.getElementById("msg");
const resetBtn = document.getElementById("resetBtn");

const ai2HandEl = document.getElementById("ai2Hand");
const ai3HandEl = document.getElementById("ai3Hand");

const turnBannerEl = document.getElementById("turnBanner");
const dealerBannerEl = document.getElementById("dealerBanner");

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

// Pick UI
const pickBtn = document.getElementById("pickBtn");
const pickOkBtn = document.getElementById("pickOkBtn");
const pickReBtn = document.getElementById("pickReBtn");
const pickStatusEl = document.getElementById("pickStatus");
const pickAI2El = document.getElementById("pickAI2");
const pickAI3El = document.getElementById("pickAI3");
const pickYOUEl = document.getElementById("pickYOU");
const dealerLabelEl = document.getElementById("dealerLabel");

// Trump Ace slot
const trumpAceSlotEl = document.getElementById("trumpAceSlot");

// ===== Constants =====
const TOTAL_TRICKS = 17;

// Pluck deck is 51 in your demo: 3..A in 4 suits (48) + 2C + BJ + LJ = 51
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

// Card image support (optional). If images not found, we fallback to HTML card.
const USE_CARD_IMAGES = true;
const CARD_IMG_DIR = "assets/cards"; // if your images are in /assets/cards

// Timing
const AI_DELAY_MS = 450;
const TRICK_RESOLVE_MS = 450;
const BETWEEN_TRICKS_MS = 350;

// ===== Deck helpers =====
function makePluckDeck51() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS_NO_2) deck.push(r + s);
  deck.push(CARD_OPEN_LEAD);
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

// Dealer state
let dealerIndex = 0;          // set by initial pick
let initialDealerChosen = false;

// Quotas rotate with dealer position: Dealer=7, Left=6, Right=4
function applyQuotasFromDealer() {
  players[dealerIndex].quota = 7;
  players[leftOf(dealerIndex)].quota = 6;
  players[rightOf(dealerIndex)].quota = 4;
}

// Rotating dealer each new deal AFTER first hand starts (you wanted rotation complexity)
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

// ===== Game State =====
let trumpSuit = null;
let trumpOpen = false;

let leaderIndex = 0;
let turnIndex = 0;
let leadSuit = null;
let trick = [];
let lockInput = false;

let trickNumber = 0;
let trickMax = TOTAL_TRICKS;

// Phases: PICK_DEALER, DEAL, PLUCK, TRUMP_PICK, PLAY
let phase = "PICK_DEALER";

// Pluck queue (computed from previous hand)
let pendingPluckQueue = null;   // computed at end of hand; used on next hand
let pluckQueue = [];
let activePluck = null;
let pluckSuitUsedByPair = new Map();

// ===== Phase UI =====
function setPhase(newPhase) {
  phase = newPhase;
  if (phaseLabelEl) phaseLabelEl.textContent = newPhase;

  // Panels
  if (pluckPanelEl) pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
  if (trumpPanelEl) trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";

  // Chips
  [pDeal,pPluck,pTrump,pPlay].forEach(x => x && x.classList.remove("activeChip"));

  if (newPhase === "DEAL")  pDeal && pDeal.classList.add("activeChip");
  if (newPhase === "PLUCK") pPluck && pPluck.classList.add("activeChip");
  if (newPhase === "TRUMP_PICK") pTrump && pTrump.classList.add("activeChip");
  if (newPhase === "PLAY")  pPlay && pPlay.classList.add("activeChip");
}

function updateDealerLabels() {
  const d = players[dealerIndex]?.id || "(not set)";
  if (dealerBannerEl) dealerBannerEl.textContent = d;
  if (dealerLabelEl) dealerLabelEl.textContent = d;
}

// ===== Card faces (fallback + images) =====
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

  // Normal card
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
    const fb = makeCardFaceFallback(cardStr, disabled);
    el.replaceWith(fb);
  };

  el.appendChild(img);
  return el;
}

// For sidebar slots (not clickable)
function renderCardIntoSlot(slotEl, cardStr) {
  if (!slotEl) return;
  slotEl.innerHTML = "";
  if (!cardStr) { slotEl.textContent = "(none)"; return; }
  const face = makeCardFace(cardStr, true);
  face.style.cursor = "default";
  slotEl.appendChild(face);
}

// ===== Sorting your hand =====
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

function clearPluckChoicesUI() { if (pluckChoicesEl) pluckChoicesEl.innerHTML = ""; }

// ===== Render =====
function render() {
  // top labels
  if (trumpLabelEl) trumpLabelEl.textContent = trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not picked)";
  if (trumpOpenLabelEl) trumpOpenLabelEl.textContent = trumpOpen ? "Yes" : "No";

  updateDealerLabels();

  // Quotas + tricks
  if (ai2QuotaLabelEl) ai2QuotaLabelEl.textContent = String(players[0].quota);
  if (ai3QuotaLabelEl) ai3QuotaLabelEl.textContent = String(players[1].quota);
  if (youQuotaLabelEl) youQuotaLabelEl.textContent = String(players[2].quota);

  if (ai2TricksEl) ai2TricksEl.textContent = String(players[0].tricks);
  if (ai3TricksEl) ai3TricksEl.textContent = String(players[1].tricks);
  if (youTricksEl) youTricksEl.textContent = String(players[2].tricks);

  if (trickNumEl) trickNumEl.textContent = String(trickNumber);
  if (trickMaxEl) trickMaxEl.textContent = String(trickMax);

  // AI hidden hands
  if (ai2HandEl) ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
  if (ai3HandEl) ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

  // Banner
  const whoseTurn = (phase === "PLAY")
    ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`)
    : "—";
  const leadTxt = leadSuit || "(none)";
  if (turnBannerEl) {
    turnBannerEl.textContent =
      `Phase: ${phase} • Dealer: ${players[dealerIndex].id} • ${whoseTurn} • Lead Suit: ${leadTxt}`;
  }

  // Render your hand (clickable only during your turn in PLAY)
  if (handEl) {
    handEl.innerHTML = "";
    const sorted = sortHandForDisplay(players[2].hand);
    for (const c of sorted) {
      const realIdx = players[2].hand.indexOf(c);
      const isYourTurn = (phase === "PLAY" && turnIndex === 2 && !lockInput);
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

  // Trick display
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

  // Panels
  if (phase === "PLUCK") renderPluckStatus();
  if (phase === "TRUMP_PICK") renderTrumpPickStatus();

  // Trump Ace display
  if (trumpSuit) renderCardIntoSlot(trumpAceSlotEl, "A" + trumpSuit);
  else renderCardIntoSlot(trumpAceSlotEl, null);
}

// ===== Initial Pick (choose dealer) =====
// lowest card wins deal; Jokers are highest so they almost never win "lowest".
function pickCardRankValue(cs) {
  if (cs === CARD_BIG_JOKER) return 1000;
  if (cs === CARD_LITTLE_JOKER) return 900;
  const rank = cs.slice(0, cs.length-1);
  // Treat 2C as rank 2 so it can be the lowest.
  return RANK_VALUE[rank] || 999;
}

let lastPick = null; // { ai2, ai3, you, lowestIndexes[], dealerIndexCandidate }

function doInitialPick() {
  // repack: new shuffled pluck deck, draw 3 top cards
  const deck = shuffle(makePluckDeck51());
  const ai2 = deck.pop();
  const ai3 = deck.pop();
  const you = deck.pop();

  lastPick = { ai2, ai3, you };

  renderCardIntoSlot(pickAI2El, ai2);
  renderCardIntoSlot(pickAI3El, ai3);
  renderCardIntoSlot(pickYOUEl, you);

  const picks = [ai2, ai3, you].map(pickCardRankValue);
  const minVal = Math.min(...picks);
  const lowest = picks.map((v,i)=>({v,i})).filter(x=>x.v===minVal).map(x=>x.i);

  if (lowest.length > 1) {
    pickStatusEl.textContent = `Tie for lowest (${lowest.map(i=>players[i].id).join(", ")}). Repack and re-pick.`;
    pickOkBtn.disabled = true;
    pickReBtn.disabled = false;
    dealerLabelEl.textContent = "(not set)";
    dealerBannerEl.textContent = "(not set)";
    initialDealerChosen = false;
    return;
  }

  dealerIndex = lowest[0];
  initialDealerChosen = true;
  applyQuotasFromDealer();
  updateDealerLabels();

  pickStatusEl.textContent = `Lowest card: ${players[dealerIndex].id}. Click OK to start.`;
  pickOkBtn.disabled = false;
  pickReBtn.disabled = false;
}

function acceptInitialPickAndStart() {
  if (!initialDealerChosen) {
    pickStatusEl.textContent = "Pick must produce a single lowest dealer first.";
    return;
  }
  // Start first hand: NO PLUCK phase
  startFirstHand_NoPluck();
}

// ===== Plucks (same logic you already had) =====
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
  const suits = availablePluckSuits(pluckerI, pluckeeI);

  // YOU plucks manually with suit buttons
  if (pluckerI === 2) {
    pluckNextBtn.disabled = true;

    if (suits.length === 0) {
      pluckStatusEl.textContent = `You are plucking ${players[pluckeeI].name}, but have no suit to attempt. Skipping.`;
      return;
    }

    pluckStatusEl.textContent =
      `You are plucking ${players[pluckeeI].name}. Choose a suit. Wrong suit attempt = LOST.`;

    for (const s of suits) {
      const give = lowestOfSuitNonJoker(pluckerI, s);

      const btn = document.createElement("button");
      btn.className = "btn";
      btn.style.padding = "10px 12px";
      btn.style.display = "flex";
      btn.style.flexDirection = "column";
      btn.style.alignItems = "flex-start";
      btn.style.gap = "4px";
      btn.innerHTML =
        `<div><strong>${s}</strong> (${suitName(s)})</div>` +
        `<div style="font-size:12px;opacity:.85;">Give: ${give || "(none)"}</div>`;

      btn.onclick = () => {
        const res = attemptPluck(pluckerI, pluckeeI, s);

        if (!res.ok) {
          markPluckSuitUsed(pluckerI, pluckeeI, s);
          pluckStatusEl.textContent = `FAILED (${res.reason}). Pluck LOST. Next.`;
        } else {
          pluckStatusEl.textContent = `Pluck success: gave ${res.giveLow}, received ${res.takeHigh}.`;
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

  // AI pluck: click Run Next Pluck
  pluckNextBtn.disabled = false;

  if (suits.length === 0) {
    pluckStatusEl.textContent = `${players[pluckerI].name} has no suit to attempt. Skipping.`;
  } else {
    pluckStatusEl.textContent = `${players[pluckerI].name} is plucking ${players[pluckeeI].name}. Candidate suits: ${suits.join(", ")}.`;
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

  // If YOU is plucker, buttons handle it
  if (pluckerI === 2) {
    pluckStatusEl.textContent = "Choose a suit button to pluck.";
    render();
    return;
  }

  // AI blind: pick suit with cheapest give card
  let bestSuit = candidates[0];
  let bestVal = 999;
  for (const s of candidates) {
    const low = lowestOfSuitNonJoker(pluckerI, s);
    const v = low ? (RANK_VALUE[low.slice(0,-1)]||999) : 999;
    if (v < bestVal) { bestVal = v; bestSuit = s; }
  }

  const res = attemptPluck(pluckerI, pluckeeI, bestSuit);
  if (!res.ok) {
    markPluckSuitUsed(pluckerI, pluckeeI, bestSuit);
    pluckStatusEl.textContent = `AI failed (${res.reason}). Pluck LOST.`;
  } else {
    pluckStatusEl.textContent = `AI pluck: gave ${res.giveLow}, received ${res.takeHigh}.`;
  }

  pluckQueue.shift();
  activePluck = null;

  if (pluckQueue.length === 0) moveToTrumpPick();
  render();
}

// ===== Trump Pick =====
function computeTrumpCallerIndex() {
  // Dealer selects trump in this version (per your label “Dealer Selects Trump”)
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

    suitScore[suit] += 2; // length
    if (v >= 11) suitScore[suit] += (v - 10) * 2; // J/Q/K/A boost
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
  // keep your current rule: trump "opens" when clubs selected (or will open when trump played)
  trumpOpen = (trumpSuit === "C");
  render(); // update ace slot etc.
}

let trumpCallerIndex = 0;

function renderTrumpPickStatus() {
  if (trumpSuit) {
    trumpStatusEl.textContent = `Trump picked: ${trumpSuit} (${suitName(trumpSuit)}).`;
    return;
  }
  const caller = players[trumpCallerIndex];
  if (trumpCallerIndex === 2) trumpStatusEl.textContent = `You are Dealer. Pick trump now.`;
  else trumpStatusEl.textContent = `${caller.name} is Dealer. AI will pick trump now.`;
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
      msgEl.textContent = `You picked trump: ${suit} (${suitName(suit)}).`;
      moveToPlay();
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
    msgEl.textContent = "Dealer: pick trump.";
    render();
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

  // Trick 1 lead forced to 2C if you have it
  if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
    return hand.map((c,i)=>({c,i})).filter(x=>x.c === CARD_OPEN_LEAD).map(x=>x.i);
  }

  // Trump closed rule on lead
  if (trick.length === 0 && !trumpOpen && trumpSuit !== "C") {
    const nonTrumpIdx = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c, trumpSuit)).map(x=>x.i);
    if (nonTrumpIdx.length > 0) return nonTrumpIdx;
    return hand.map((_,i)=>i);
  }

  // Must follow suit
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

// ===== AI play: "always try to win" =====
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

  // priority 1: choose a winning card if possible (lowest winning if following; if leading choose strong but not suicide)
  const winning = [];
  for (const idx of legal) {
    const c = hand[idx];
    if (trick.length === 0) winning.push({ idx, power: cardPower(c) });
    else if (wouldWinIfPlayedNow(playerIndex, c)) winning.push({ idx, power: cardPower(c) });
  }

  if (trick.length > 0 && winning.length) {
    // play the LOWEST power that still wins (saves bigger guns)
    winning.sort((a,b)=> a.power - b.power);
    return winning[0].idx;
  }

  // if no winning follow: dump lowest power legal
  let best = legal[0];
  let bestP = cardPower(hand[best]);
  for (const idx of legal) {
    const p = cardPower(hand[idx]);
    if (p < bestP) { bestP = p; best = idx; }
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

  // resolve trick
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
          // end hand -> compute plucks for NEXT deal
          computePlucksEarnedAndSuffered();
          pendingPluckQueue = buildPluckQueueFromScores();

          msgEl.textContent = "Hand over. Click Reset for next deal.";
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

// ===== Deal / phases =====
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
  trickNumber = 0;
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

  render();
}

function startFirstHand_NoPluck() {
  // First hand starts after initial pick, no pluck phase.
  setPhase("DEAL");
  msgEl.textContent = "First deal: no pluck phase. Dealer will select trump.";
  dealNewHands();
  // Immediately go to trump pick
  moveToTrumpPick();
}

function startNextHand_WithPluck() {
  // Rotate dealer right each new deal
  rotateDealerRight();
  updateDealerLabels();

  setPhase("DEAL");
  dealNewHands();

  // PLUCK phase only if there were pending plucks from previous hand
  pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
  pendingPluckQueue = null;

  if (pluckQueue.length === 0) {
    msgEl.textContent = "No plucks this hand. Dealer selects trump.";
    moveToTrumpPick();
  } else {
    setPhase("PLUCK");
    msgEl.textContent = "Pluck phase begins (manual).";
    render();
  }
}

// ===== Events =====
if (pluckNextBtn) pluckNextBtn.addEventListener("click", () => runOnePluck());

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    if (!initialDealerChosen) {
      msgEl.textContent = "Do the initial pick first.";
      return;
    }
    // After first hand is complete, Reset starts next hand (with possible plucks from last hand)
    startNextHand_WithPluck();
  });
}

if (pickBtn) pickBtn.addEventListener("click", () => doInitialPick());
if (pickReBtn) pickReBtn.addEventListener("click", () => doInitialPick());
if (pickOkBtn) pickOkBtn.addEventListener("click", () => acceptInitialPickAndStart());

wireTrumpButtons();

// ===== Boot =====
setPhase("PICK_DEALER");
pickStatusEl.textContent = "Click “Pick Cards”.";
pickOkBtn.disabled = true;
pickReBtn.disabled = true;
render();
console.log("Pluck Demo v19 loaded");
