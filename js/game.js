// Pluck Web Demo v20 (FULL single-file replacement)
// Ctrl-A / Ctrl-V into: /js/game.js
//
// Features / Fixes:
// 1) Fix "cards blink but won't play" by using stable cardKeys (not indexOf on sorted hand)
// 2) Initial Pick (all 3 cards shown) -> OK -> first DEAL
//    - If tied for LOW, repack and pick again.
// 3) First hand: NO PLUCK PHASE. Flow: THE DEAL -> DEALER SELECTS TRUMP -> PLAY
// 4) Later hands: THE DEAL -> PLUCK -> DEALER SELECTS TRUMP -> PLAY
// 5) Trump lead restriction (Spades-style): cannot lead trump until "broken/open"
//    unless player has only trump left (then allowed and marks open).
// 6) Card images optional: assets/cards/<CARD>.png (e.g., "7D.png", "BJ.png", "2C.png")
//    Auto-fallback to drawn card faces if image missing.
// 7) Dealer rotates RIGHT each new deal AFTER the first dealer is chosen by initial pick.
//    Quotas: Dealer=7, Left=6, Right=4.
// 8) AI plays automatically. No Hard Lock toggle. AI always tries to win.

(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const on = (el, evt, fn, opts) => el && el.addEventListener(evt, fn, opts);

  function setText(el, txt) { if (el) el.textContent = txt; }
  function showMsg(txt) { const el = $("msg"); if (el) el.textContent = txt; }
  function showError(txt) { const el = $("msg"); if (el) el.textContent = "ERROR: " + txt; console.error("[Pluck]", txt); }

  window.addEventListener("error", (e) => showError(e?.message || "Unknown script error"));

  // Tap helper (tablet-safe)
  function bindTap(el, fn) {
    if (!el) return;
    el.addEventListener("click", (e) => { e.preventDefault(); fn(e); });
    el.addEventListener("pointerup", (e) => { e.preventDefault(); fn(e); }, { passive: false });
  }

  // ---------- required DOM ----------
  const handEl = $("hand");
  const trickEl = $("trick");
  const resetBtn = $("resetBtn");

  if (!handEl || !trickEl || !resetBtn) {
    showError("Missing required elements: id='hand', id='trick', id='resetBtn' must exist in game.html");
    return;
  }

  // ---------- optional DOM ----------
  const ai2HandEl = $("ai2Hand");
  const ai3HandEl = $("ai3Hand");

  const phaseLabelEl = $("phaseLabel");
  const turnBannerEl = $("turnBanner");

  const trumpLabelEl = $("trumpLabel");
  const trumpOpenLabelEl = $("trumpOpenLabel");
  const trumpAceSlotEl = $("trumpAceSlot");

  const ai2TricksEl = $("ai2Tricks");
  const ai3TricksEl = $("ai3Tricks");
  const youTricksEl = $("youTricks");

  const ai2QuotaEl = $("ai2Quota");
  const ai3QuotaEl = $("ai3Quota");
  const youQuotaEl = $("youQuota");

  const trickNumEl = $("trickNum");
  const trickMaxEl = $("trickMax");

  const pDeal = $("pDeal");
  const pPluck = $("pPluck");
  const pTrump = $("pTrump");
  const pPlay = $("pPlay");

  const pluckPanelEl = $("pluckPanel");
  const pluckStatusEl = $("pluckStatus");
  const pluckChoicesEl = $("pluckChoices");
  const pluckNextBtn = $("pluckNextBtn");

  const trumpPanelEl = $("trumpPanel");
  const trumpStatusEl = $("trumpStatus");

  // Initial Pick elements
  const pickBtn = $("pickBtn");
  const pickOkBtn = $("pickOkBtn");
  const pickReBtn = $("pickReBtn");
  const pickStatusEl = $("pickStatus");
  const pickAI2El = $("pickAI2");
  const pickAI3El = $("pickAI3");
  const pickYOUEl = $("pickYOU");
  const dealerLabelEl = $("dealerLabel");
  const dealerBannerEl = $("dealerBanner");

  // ---------- core constants ----------
  const TOTAL_TRICKS = 17;
  const SUITS = ["S", "H", "D", "C"];
  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

  // Optional image rendering
  const USE_CARD_IMAGES = true;
  const CARD_IMG_DIR = "assets/cards"; // expects "7D.png", "BJ.png", "2C.png", etc.

  // Speed
  const AI_DELAY_MS = 300;
  const TRICK_RESOLVE_MS = 350;
  const BETWEEN_TRICKS_MS = 280;

  // ---------- game helpers ----------
  function leftOf(i) { return (i + 1) % 3; }
  function rightOf(i) { return (i + 2) % 3; }

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

  // During play: jokers behave as trump suit
  function cardSuitForFollow(cs, trumpSuit) {
    if (isJoker(cs)) return trumpSuit || null;
    return cs.slice(-1);
  }
  function isTrumpCard(cs, trumpSuit) {
    if (!trumpSuit) return false;
    if (isJoker(cs)) return true;
    return cs.slice(-1) === trumpSuit;
  }

  // ---------- players ----------
  // 0=AI2, 1=AI3, 2=YOU
  const players = [
    { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7, plucksEarned:0, plucksSuffered:0 },
    { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6, plucksEarned:0, plucksSuffered:0 },
    { id:"YOU", name:"You",            hand:[], tricks:0, quota:4, plucksEarned:0, plucksSuffered:0 }
  ];

  // Dealer + quotas
  let dealerIndex = 0;            // set by initial pick
  let dealerPicked = false;       // initial pick completed
  let firstHand = true;           // first hand has no pluck
  function applyQuotasForDealer() {
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }
  function rotateDealerRight() {
    dealerIndex = rightOf(dealerIndex);
    applyQuotasForDealer();
  }

  // ---------- memory (public inference only) ----------
  let memory = null;
  function resetMemory() {
    memory = {
      played: new Set(),
      voidSuits: [new Set(), new Set(), new Set()],
      trickLog: []
    };
  }

  // ---------- state ----------
  // phases: PICK_DEALER, THE_DEAL, PLUCK, TRUMP_PICK, PLAY
  let phase = "PICK_DEALER";

  let trumpSuit = null;
  let trumpOpen = false;

  let leaderIndex = 0;
  let turnIndex = 0;
  let leadSuit = null;
  let trick = []; // {playerIndex, cardStr}

  let trickNumber = 0;
  let trickMax = TOTAL_TRICKS;

  let lockInput = false;

  // Plucks happen at the start of a hand (except first hand)
  let pendingPluckQueue = null; // computed at end of previous hand
  let pluckQueue = [];
  let activePluck = null;
  let pluckSuitUsedByPair = new Map(); // "plucker-pluckee" => Set(suits)

  // ---------- UI / phases ----------
  function setPhase(newPhase) {
    phase = newPhase;
    setText(phaseLabelEl, newPhase);

    // highlight chips if present
    if (pDeal && pPluck && pTrump && pPlay) {
      [pDeal,pPluck,pTrump,pPlay].forEach(x => x.classList.remove("activeChip"));
      if (newPhase === "THE_DEAL") pDeal.classList.add("activeChip");
      if (newPhase === "PLUCK") pPluck.classList.add("activeChip");
      if (newPhase === "TRUMP_PICK") pTrump.classList.add("activeChip");
      if (newPhase === "PLAY") pPlay.classList.add("activeChip");
    }

    if (pluckPanelEl) pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
    if (trumpPanelEl) trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";
  }

  function updateDealerLabels() {
    const txt = dealerPicked ? players[dealerIndex].id : "(not set)";
    setText(dealerLabelEl, txt);
    setText(dealerBannerEl, txt);
  }

  // ---------- card rendering ----------
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
    img.style.pointerEvents = "none"; // important for tablet taps

    img.onerror = () => {
      const fallback = makeCardFaceFallback(cardStr, disabled);
      el.replaceWith(fallback);
    };

    el.appendChild(img);
    return el;
  }

  // Sort for display: Jokers first, then by suit group, then high->low
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

  // ---------- trump "broken/open" rule ----------
  function playerHasNonTrump(playerIndex) {
    return players[playerIndex].hand.some(c => !isTrumpCard(c, trumpSuit));
  }

  function forbidLeadingTrumpUnlessOpen(playerIndex, cardStr) {
    if (trick.length !== 0) return null;        // only matters on lead
    if (!trumpSuit) return null;                // trump not chosen
    if (trumpOpen) return null;                 // already open

    if (!isTrumpCard(cardStr, trumpSuit)) return null;

    // If player has any non-trump, they cannot lead trump
    if (playerHasNonTrump(playerIndex)) {
      return "Trump is not open yet. You must lead a non-trump card (unless you only have trump).";
    }

    // Only trump left -> allow and mark open
    trumpOpen = true;
    return null;
  }

  function updateTrumpOpenByPlay(cardStr) {
    if (!trumpSuit || trumpOpen) return;

    // If trump is played off-suit (i.e., leadSuit not trump), trump becomes open
    if (trick.length > 0) {
      if (isTrumpCard(cardStr, trumpSuit) && leadSuit && leadSuit !== trumpSuit) {
        trumpOpen = true;
      }
    }
  }

  // ---------- play legality ----------
  function illegalReason(playerIndex, cardStr) {
    // First lead of hand: if you have 2C, it must lead trick 1
    if (trickNumber === 1 && trick.length === 0 && players[playerIndex].hand.includes(CARD_OPEN_LEAD)) {
      if (cardStr !== CARD_OPEN_LEAD) return "First trick lead must be 2C.";
    }

    // Leading trump restriction (Spades-style)
    const trumpBlock = forbidLeadingTrumpUnlessOpen(playerIndex, cardStr);
    if (trumpBlock) return trumpBlock;

    // Follow suit if possible
    if (trick.length > 0) {
      const must = leadSuit;
      const hasSuit = players[playerIndex].hand.some(c => cardSuitForFollow(c, trumpSuit) === must);
      if (hasSuit && cardSuitForFollow(cardStr, trumpSuit) !== must) {
        return `You must follow suit: ${must}.`;
      }
    }

    return null;
  }

  function legalCardKeysFor(playerIndex) {
    const hand = players[playerIndex].hand;
    const keys = [];

    // If it's trick 1 lead and player holds 2C, only 2C is legal
    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
      for (let i=0;i<hand.length;i++) if (hand[i] === CARD_OPEN_LEAD) keys.push(`${hand[i]}|${i}`);
      return keys;
    }

    // Leading trick: apply trump lead restriction
    if (trick.length === 0 && trumpSuit && !trumpOpen && playerHasNonTrump(playerIndex)) {
      // only non-trump legal
      for (let i=0;i<hand.length;i++) {
        if (!isTrumpCard(hand[i], trumpSuit)) keys.push(`${hand[i]}|${i}`);
      }
      if (keys.length) return keys; // if somehow none, fall through allow all
    }

    // Following suit if possible
    if (trick.length > 0 && leadSuit) {
      const suited = [];
      for (let i=0;i<hand.length;i++) {
        if (cardSuitForFollow(hand[i], trumpSuit) === leadSuit) suited.push(`${hand[i]}|${i}`);
      }
      if (suited.length) return suited;
    }

    // Default: all legal
    for (let i=0;i<hand.length;i++) keys.push(`${hand[i]}|${i}`);
    return keys;
  }

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

    // no trump: highest card in lead suit wins
    let bestPi = trick[0].playerIndex;
    let bestV = -1;
    for (const t of trick) {
      if (cardSuitForFollow(t.cardStr, trumpSuit) !== leadSuit) continue;
      const v = parseCard(t.cardStr, trumpSuit).value;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi;
  }

  // ---------- AI play (always try to win) ----------
  function aiChooseIndex(playerIndex) {
    const legalKeys = legalCardKeysFor(playerIndex);
    const hand = players[playerIndex].hand;

    // Build list of legal indices from keys
    const legalIdx = legalKeys.map(k => parseInt(k.split("|")[1], 10)).filter(n => !Number.isNaN(n));
    if (!legalIdx.length) return 0;

    // If leading: choose a strong lead if needs tricks; otherwise dump low
    const need = players[playerIndex].quota - players[playerIndex].tricks;

    function valueFor(cs) {
      // prefer high power when needing tricks, else prefer low
      const p = cardPower(cs);
      return p;
    }

    // helper: does card win if played now (approx)
    function wouldWinIfPlayedNow(idx) {
      const cs = hand[idx];
      const temp = trick.concat([{ playerIndex, cardStr: cs }]);
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

    const leading = (trick.length === 0);

    // If following: if can win, play the lowest winning card; else dump lowest legal
    if (!leading) {
      const winners = [];
      for (const idx of legalIdx) {
        if (wouldWinIfPlayedNow(idx)) winners.push(idx);
      }
      if (winners.length) {
        winners.sort((a,b) => valueFor(hand[a]) - valueFor(hand[b])); // lowest winning
        return winners[0];
      }
      // can't win: dump lowest legal
      legalIdx.sort((a,b) => valueFor(hand[a]) - valueFor(hand[b]));
      return legalIdx[0];
    }

    // Leading:
    if (need > 0) {
      // try a strong lead but avoid opening trump early unless forced
      legalIdx.sort((a,b) => valueFor(hand[b]) - valueFor(hand[a])); // highest first
      return legalIdx[0];
    } else {
      // met/exceeded quota: dump low
      legalIdx.sort((a,b) => valueFor(hand[a]) - valueFor(hand[b]));
      return legalIdx[0];
    }
  }

  // ---------- plucks ----------
  function computePlucksEarnedAndSuffered() {
    for (const p of players) {
      p.plucksEarned = Math.max(0, p.tricks - p.quota);
      p.plucksSuffered = Math.max(0, p.quota - p.tricks);
    }
  }

  function pluckerOrder() {
    // highest earned first (aggressive)
    const idx = [0,1,2];
    idx.sort((a,b) => players[b].plucksEarned - players[a].plucksEarned);
    return idx.filter(i => players[i].plucksEarned > 0);
  }

  function victimOrder() {
    // highest suffered first
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

  function clearPluckChoicesUI() {
    if (pluckChoicesEl) pluckChoicesEl.innerHTML = "";
  }

  function renderPluckStatus() {
    if (!pluckPanelEl || !pluckStatusEl || !pluckChoicesEl || !pluckNextBtn) return;

    clearPluckChoicesUI();

    if (!pluckQueue.length) {
      setText(pluckStatusEl, "No plucks to process.");
      pluckNextBtn.disabled = true;
      return;
    }

    if (!activePluck) activePluck = pluckQueue[0];

    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;
    const suits = availablePluckSuits(pluckerI, pluckeeI);

    // YOU plucks: show buttons; wrong suit = LOST
    if (pluckerI === 2) {
      pluckNextBtn.disabled = true;

      if (!suits.length) {
        setText(pluckStatusEl, `You are plucking ${players[pluckeeI].name}, but you have no suit available. Skipping.`);
        // Skip this pluck
        pluckQueue.shift();
        activePluck = null;
        if (!pluckQueue.length) moveToTrumpPick();
        render();
        return;
      }

      setText(pluckStatusEl, `You are plucking ${players[pluckeeI].name}. Choose a suit. Wrong suit attempt = pluck LOST.`);

      for (const s of suits) {
        const give = lowestOfSuitNonJoker(pluckerI, s);

        const btn = document.createElement("button");
        btn.className = "btn";
        btn.textContent = `${s} (${suitName(s)}) • Give: ${give || "(none)"}`;
        bindTap(btn, () => {
          const res = attemptPluck(pluckerI, pluckeeI, s);

          if (!res.ok) {
            markPluckSuitUsed(pluckerI, pluckeeI, s);
            setText(pluckStatusEl, `You attempted ${s} and FAILED (${res.reason}). Pluck is LOST.`);
          } else {
            setText(pluckStatusEl, `You plucked ${s}: gave ${res.giveLow}, received ${res.takeHigh}.`);
          }

          pluckQueue.shift();
          activePluck = null;

          if (!pluckQueue.length) moveToTrumpPick();
          render();
        });

        pluckChoicesEl.appendChild(btn);
      }

      return;
    }

    // AI pluck: button runs next
    pluckNextBtn.disabled = false;
    if (!suits.length) setText(pluckStatusEl, `${players[pluckerI].name} has no suit available. Will skip.`);
    else setText(pluckStatusEl, `${players[pluckerI].name} is plucking ${players[pluckeeI].name}. Click "Run Next Pluck".`);
  }

  function runOnePluck() {
    if (phase !== "PLUCK") return;
    if (!pluckQueue.length) return;
    if (!activePluck) activePluck = pluckQueue[0];

    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;

    // YOU uses buttons
    if (pluckerI === 2) {
      renderPluckStatus();
      return;
    }

    const suits = availablePluckSuits(pluckerI, pluckeeI);

    if (!suits.length) {
      setText(pluckStatusEl, `${players[pluckerI].name} has no suit available. Skipped.`);
      pluckQueue.shift();
      activePluck = null;
      if (!pluckQueue.length) moveToTrumpPick();
      render();
      return;
    }

    // AI blind: choose suit with cheapest give
    suits.sort((a,b)=>{
      const la = lowestOfSuitNonJoker(pluckerI, a);
      const lb = lowestOfSuitNonJoker(pluckerI, b);
      const va = la ? (RANK_VALUE[la.slice(0,-1)]||99) : 99;
      const vb = lb ? (RANK_VALUE[lb.slice(0,-1)]||99) : 99;
      return va - vb;
    });

    const pickSuit = suits[0];
    const res = attemptPluck(pluckerI, pluckeeI, pickSuit);

    if (!res.ok) {
      markPluckSuitUsed(pluckerI, pluckeeI, pickSuit);
      setText(pluckStatusEl, `${players[pluckerI].name} attempted ${pickSuit} and FAILED (${res.reason}). Pluck is LOST.`);
    } else {
      setText(pluckStatusEl, `${players[pluckerI].name} plucked ${pickSuit}: gave ${res.giveLow}, received ${res.takeHigh}.`);
    }

    pluckQueue.shift();
    activePluck = null;

    if (!pluckQueue.length) moveToTrumpPick();
    render();
  }

  // ---------- trump selection ----------
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

      suitScore[suit] += 2;           // length
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
    // trumpOpen starts false; becomes true when broken or forced lead-only-trump
    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not picked)");
    setText(trumpOpenLabelEl, trumpOpen ? "Yes" : "No");

    // show Ace of trump
    if (trumpAceSlotEl && trumpSuit) {
      trumpAceSlotEl.innerHTML = "";
      const ace = "A" + trumpSuit;
      trumpAceSlotEl.appendChild(makeCardFace(ace, true));
    }
  }

  function renderTrumpPickStatus() {
    if (!trumpPanelEl || !trumpStatusEl) return;
    if (trumpSuit) {
      setText(trumpStatusEl, `Trump selected: ${trumpSuit} (${suitName(trumpSuit)}).`);
      return;
    }
    const dealer = players[dealerIndex];
    setText(trumpStatusEl, `${dealer.name} is the Dealer (quota ${dealer.quota}). Dealer selects trump now.`);
  }

  function wireTrumpButtons() {
    if (!trumpPanelEl) return;
    const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
    btns.forEach(b => {
      on(b, "click", () => {
        if (phase !== "TRUMP_PICK") return;
        if (trumpSuit) return;

        // Only allow clicking if YOU are dealer
        if (dealerIndex !== 2) return;

        const suit = b.getAttribute("data-trump");
        if (!SUITS.includes(suit)) return;

        setTrump(suit);
        showMsg(`You selected trump: ${suit} (${suitName(suit)}).`);
        moveToPlay();
      });
    });
  }

  // ---------- core play loop ----------
  function setLeadSuitFromFirstCard(cardStr) {
    leadSuit = cardSuitForFollow(cardStr, trumpSuit);
  }

  function updateVoidMemory(playerIndex, playedCard) {
    if (trick.length === 0) return;
    const must = leadSuit;
    const playedSuit = cardSuitForFollow(playedCard, trumpSuit);
    if (playedSuit !== must) memory.voidSuits[playerIndex].add(must);
  }

  function playCardByKey(playerIndex, cardKey) {
    // cardKey is `${cardStr}|${indexAtRenderTime}`
    // We re-find the cardStr in current hand as safety
    const parts = String(cardKey).split("|");
    const cardStr = parts[0];
    const idxHint = parseInt(parts[1], 10);

    // First try hinted index if matches
    let idx = -1;
    if (!Number.isNaN(idxHint) && players[playerIndex].hand[idxHint] === cardStr) idx = idxHint;
    if (idx < 0) idx = players[playerIndex].hand.indexOf(cardStr);
    if (idx < 0) { showError("Card not found in hand (state mismatch)."); return; }

    // legality (only enforce for YOU clicks, AI chooses legal keys already)
    const reason = illegalReason(playerIndex, cardStr);
    if (reason) {
      showMsg(reason);
      return;
    }

    // remove from hand
    players[playerIndex].hand.splice(idx, 1);

    // lead suit / void memory
    if (trick.length === 0) setLeadSuitFromFirstCard(cardStr);
    else updateVoidMemory(playerIndex, cardStr);

    // add to trick
    trick.push({ playerIndex, cardStr });
    memory.played.add(cardStr);

    // trump open logic
    updateTrumpOpenByPlay(cardStr);
    setText(trumpOpenLabelEl, trumpOpen ? "Yes" : "No");

    // advance turn
    turnIndex = (turnIndex + 1) % 3;

    render();
    maybeContinue();
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

  function startTrickOne() {
    trick = [];
    leadSuit = null;
    trickNumber = 1;
    trumpOpen = false;
    setText(trumpOpenLabelEl, "No");

    // who has 2C leads trick 1
    let whoHas2C = 0;
    for (let pi=0; pi<3; pi++) {
      if (players[pi].hand.includes(CARD_OPEN_LEAD)) { whoHas2C = pi; break; }
    }
    leaderIndex = whoHas2C;
    turnIndex = whoHas2C;

    render();
    maybeContinue();
  }

  function maybeContinue() {
    if (phase !== "PLAY") return;

    // resolve trick
    if (trick.length === 3) {
      lockInput = true;

      setTimeout(() => {
        const winner = evaluateTrickWinner();
        players[winner].tricks += 1;

        showMsg(`${players[winner].name} wins the trick.`);
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

            firstHand = false; // from now on pluck phase exists
            showMsg("Hand over. Click Reset (New Deal) to continue.");
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
        const idx = aiChooseIndex(turnIndex);
        const key = `${players[turnIndex].hand[idx]}|${idx}`;
        playCardByKey(turnIndex, key);
        lockInput = false;
        render();
      }, AI_DELAY_MS);
    }
  }

  // ---------- deal / flow ----------
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

    trumpSuit = null;
    trumpOpen = false;
    setText(trumpLabelEl, "(not picked)");
    setText(trumpOpenLabelEl, "No");
    if (trumpAceSlotEl) { trumpAceSlotEl.innerHTML = "(none)"; }

    pluckSuitUsedByPair = new Map();
    activePluck = null;
    lockInput = false;

    // leader/turn will be set when play starts (2C leads trick 1)
  }

  function startHandFlow() {
    setPhase("THE_DEAL");

    // For hands AFTER the very first hand, dealer rotates right each new deal
    // For the first hand, dealer already set by initial pick
    if (!firstHand) {
      rotateDealerRight();
    } else {
      applyQuotasForDealer();
    }

    updateDealerLabels();
    dealNewHands();
    render();

    // First hand: skip pluck
    if (firstHand) {
      moveToTrumpPick();
      return;
    }

    // Later hands: pluck uses pending queue from last hand
    startPluckPhase();
  }

  function startPluckPhase() {
    setPhase("PLUCK");

    pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
    pendingPluckQueue = null;

    if (!pluckQueue.length) {
      showMsg("No plucks this hand. Moving to Dealer Selects Trump.");
      moveToTrumpPick();
      return;
    }

    showMsg("Pluck phase begins (manual).");
    render();
  }

  function moveToTrumpPick() {
    setPhase("TRUMP_PICK");
    renderTrumpPickStatus();
    render();

    // If AI is dealer, pick immediately
    if (dealerIndex !== 2) {
      const suit = aiChooseTrumpFromOwnHand(dealerIndex);
      setTrump(suit);
      showMsg(`${players[dealerIndex].name} selected trump: ${suit} (${suitName(suit)}).`);
      moveToPlay();
      return;
    }

    // YOU dealer: wait for button click
    showMsg("Dealer selects trump. Tap a suit button.");
  }

  function moveToPlay() {
    setPhase("PLAY");
    showMsg("Trump set. Trick 1 begins (2C leads).");
    startTrickOne();
  }

  // ---------- render ----------
  function render() {
    // quotas/tricks
    if (ai2QuotaEl) setText(ai2QuotaEl, String(players[0].quota));
    if (ai3QuotaEl) setText(ai3QuotaEl, String(players[1].quota));
    if (youQuotaEl) setText(youQuotaEl, String(players[2].quota));

    if (ai2TricksEl) setText(ai2TricksEl, String(players[0].tricks));
    if (ai3TricksEl) setText(ai3TricksEl, String(players[1].tricks));
    if (youTricksEl) setText(youTricksEl, String(players[2].tricks));

    if (trickNumEl) setText(trickNumEl, String(trickNumber));
    if (trickMaxEl) setText(trickMaxEl, String(trickMax));

    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not picked)");
    setText(trumpOpenLabelEl, trumpOpen ? "Yes" : "No");

    updateDealerLabels();

    // AI hands hidden
    if (ai2HandEl) setText(ai2HandEl, players[0].hand.map(()=> "🂠").join(" "));
    if (ai3HandEl) setText(ai3HandEl, players[1].hand.map(()=> "🂠").join(" "));

    // banner
    if (turnBannerEl) {
      const whoseTurn = (phase === "PLAY") ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`) : "—";
      setText(turnBannerEl, `Phase: ${phase} • Dealer: ${dealerPicked ? players[dealerIndex].id : "(not set)"} • ${whoseTurn} • Trick: ${trickNumber}/${TOTAL_TRICKS}`);
    }

    // Render your hand (clickable only when it is your turn and in PLAY)
    handEl.innerHTML = "";

    const isYourTurn = (phase === "PLAY" && turnIndex === 2 && !lockInput);
    const legalKeys = isYourTurn ? new Set(legalCardKeysFor(2)) : new Set();

    // Important: build stable keys from CURRENT hand order, then sort for display
    // We'll carry the "key" along with the card.
    const indexed = players[2].hand.map((c,i) => ({ c, i, key: `${c}|${i}` }));
    // sort by c only for display
    const sortedCards = sortHandForDisplay(indexed.map(x => x.c));

    // Build display list by matching cardStr back to one unused indexed entry
    const used = new Set();
    const display = [];
    for (const cs of sortedCards) {
      const entry = indexed.find(x => x.c === cs && !used.has(x.key));
      if (entry) { used.add(entry.key); display.push(entry); }
    }

    for (const item of display) {
      const disabled = !isYourTurn || (isYourTurn && !legalKeys.has(item.key));
      const face = makeCardFace(item.c, disabled);

      // The click/tap always plays the exact cardKey
      bindTap(face, () => {
        if (disabled) return;
        if (phase !== "PLAY") return;
        if (turnIndex !== 2) return;
        if (lockInput) return;

        const reason = illegalReason(2, item.c);
        if (reason) { showMsg(reason); render(); return; }

        playCardByKey(2, item.key);
      });

      handEl.appendChild(face);
    }

    // Render trick
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

    // panels
    if (phase === "PLUCK") renderPluckStatus();
    if (phase === "TRUMP_PICK") renderTrumpPickStatus();
  }

  // ---------- initial pick (choose dealer) ----------
  // Lowest card deals. Jokers treated as highest (never "lowest")
  function pickRankValue(cardStr) {
    if (cardStr === CARD_BIG_JOKER) return 1000;
    if (cardStr === CARD_LITTLE_JOKER) return 900;
    if (cardStr === "2C") return 2; // lowest possible (special)
    const suit = cardStr.slice(-1);
    const rank = cardStr.slice(0, cardStr.length-1);
    return RANK_VALUE[rank] || 99;
  }

  function drawPickCard() {
    // Use the same deck type; shuffle and draw one
    const deck = shuffle(makePluckDeck51());
    return deck.pop();
  }

  let pickCards = null; // {0: card,1:card,2:card}
  function resetPickUI() {
    if (pickAI2El) setText(pickAI2El, "(none)");
    if (pickAI3El) setText(pickAI3El, "(none)");
    if (pickYOUEl) setText(pickYOUEl, "(none)");
    if (pickStatusEl) setText(pickStatusEl, "Click “Pick Cards”.");
    if (pickOkBtn) pickOkBtn.disabled = true;
    if (pickReBtn) pickReBtn.disabled = true;
    pickCards = null;
    dealerPicked = false;
    updateDealerLabels();
  }

  function renderPickCard(slotEl, cardStr) {
    if (!slotEl) return;
    slotEl.innerHTML = "";
    slotEl.appendChild(makeCardFace(cardStr, true));
  }

  function performPick() {
    const c0 = drawPickCard();
    const c1 = drawPickCard();
    const c2 = drawPickCard();
    pickCards = { 0:c0, 1:c1, 2:c2 };

    renderPickCard(pickAI2El, c0);
    renderPickCard(pickAI3El, c1);
    renderPickCard(pickYOUEl, c2);

    const v0 = pickRankValue(c0);
    const v1 = pickRankValue(c1);
    const v2 = pickRankValue(c2);
    const min = Math.min(v0,v1,v2);

    const lows = [];
    if (v0 === min) lows.push(0);
    if (v1 === min) lows.push(1);
    if (v2 === min) lows.push(2);

    if (lows.length > 1) {
      // tie for lowest => repack required
      if (pickStatusEl) setText(pickStatusEl, "Tie for LOWEST card. Click Re-Pick.");
      if (pickOkBtn) pickOkBtn.disabled = true;
      if (pickReBtn) pickReBtn.disabled = false;
      dealerPicked = false;
      updateDealerLabels();
      return;
    }

    dealerIndex = lows[0];
    dealerPicked = true;
    applyQuotasForDealer();
    updateDealerLabels();

    if (pickStatusEl) setText(pickStatusEl, `Dealer will be: ${players[dealerIndex].id} (lowest card). Click OK.`);
    if (pickOkBtn) pickOkBtn.disabled = false;
    if (pickReBtn) pickReBtn.disabled = false;
  }

  // ---------- events ----------
  on(pluckNextBtn, "click", runOnePluck);

  on(resetBtn, "click", () => {
    if (!dealerPicked) {
      showMsg("Pick a dealer first (left panel).");
      setPhase("PICK_DEALER");
      return;
    }
    startHandFlow();
  });

  if (pickBtn) on(pickBtn, "click", () => { performPick(); });
  if (pickReBtn) on(pickReBtn, "click", () => { performPick(); });
  if (pickOkBtn) on(pickOkBtn, "click", () => {
    if (!dealerPicked) return;
    // start first hand
    setPhase("THE_DEAL");
    showMsg(`Dealer chosen: ${players[dealerIndex].id}. Click Reset (New Deal) to start, or just start now.`);
    // Start immediately (no need to force Reset)
    startHandFlow();
  });

  wireTrumpButtons();

  // ---------- boot ----------
  resetMemory();
  resetPickUI();
  setPhase("PICK_DEALER");
  showMsg("Step 1: Pick Cards to choose the Dealer (lowest card). Then OK.");
  render();

})();
