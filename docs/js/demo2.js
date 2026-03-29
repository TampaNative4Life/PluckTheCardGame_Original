// =========================================================
// CHANGE LOG
// 2026-03-28 19:00 (-0400)
//
// FILE
// docs/js/demo2.js
//
// ACTION
// Full file replacement.
//
// ISSUE
// Dealer rotation and quota assignment were still wrong after
// the prior change. The previous dealer was receiving 6 when
// they should have received 4 in the next hand.
//
// ROOT CAUSE
// The original left/right seat math was already correct.
// I incorrectly swapped the leftOf() and rightOf() helpers.
// Only dealer rotation direction needed to change.
//
// FIX
// • Restore original seat math
// • Keep deal passing left after each hand
// • Leave all gameplay, rendering, HTML, and CSS untouched
//
// CORRECT DEAL ORDER
// YOU -> AI2 -> AI3 -> YOU
//
// CORRECT QUOTAS
// Dealer = 7
// Dealer's left = 6
// Dealer's right = 4
//
// ROW COUNT
// Previous File Row Count: 743
// Current File Row Count: 744
//
// UNTOUCHED AREAS
// • No HTML changes
// • No CSS changes
// • No Pick logic changes
// • No Trump logic changes
// • No Pluck logic changes
// • No Trick play logic changes
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const setText = (el, txt) => { if (el) el.textContent = txt; };
  const show = (el, on = true) => { if (el) el.style.display = on ? "" : "none"; };

  function msg(txt) {
    if (msgEl) {
      msgEl.style.display = txt ? "block" : "none";
      msgEl.textContent = txt || "";
    }
  }

  function fail(txt) {
    console.error("[Demo2]", txt);
    msg(`ERROR: ${txt}`);
  }

  // ---------- DOM ----------
  const msgEl          = $("msg");
  const youHandEl      = $("youHand");
  const trickSlotsEl   = $("trickSlots");
  const resetBtn       = $("resetBtn");

  const trumpLabelEl   = $("trumpLabel");
  const booksSummaryEl = $("booksSummary");
  const phaseValEl     = $("phaseVal");
  const dealerValEl    = $("dealerVal");
  const trickNumEl     = $("trickNum");
  const trickMaxEl     = $("trickMax");
  const turnBannerEl   = $("turnBanner");

  const pickPanelEl    = $("pickPanel");
  const pickBtn        = $("pickBtn");
  const pickOkBtn      = $("pickOkBtn");
  const pickReBtn      = $("pickReBtn");
  const pickStatusEl   = $("pickStatus");
  const pickAI2El      = $("pickAI2");
  const pickAI3El      = $("pickAI3");
  const pickYOUEl      = $("pickYOU");

  const trumpPanelEl   = $("trumpPanel");
  const trumpStatusEl  = $("trumpStatus");

  const pluckPanelEl   = $("pluckPanel");
  const pluckStatusEl  = $("pluckStatus");
  const pluckChoicesEl = $("pluckChoices");
  const pluckNextBtn   = $("pluckNextBtn");

  const ai2HandEl      = $("ai2Hand");
  const ai3HandEl      = $("ai3Hand");
  const ai2QuotaEl     = $("ai2Quota");
  const ai3QuotaEl     = $("ai3Quota");
  const youQuotaEl     = $("youQuota");
  const ai2TricksEl    = $("ai2Tricks");
  const ai3TricksEl    = $("ai3Tricks");
  const youTricksEl    = $("youTricks");

  const required = [
    ["youHand", youHandEl],
    ["trickSlots", trickSlotsEl],
    ["pickBtn", pickBtn],
    ["pickOkBtn", pickOkBtn],
    ["pickReBtn", pickReBtn],
    ["pickStatus", pickStatusEl],
    ["pickAI2", pickAI2El],
    ["pickAI3", pickAI3El],
    ["pickYOU", pickYOUEl],
    ["pickPanel", pickPanelEl],
    ["trumpPanel", trumpPanelEl],
    ["trumpStatus", trumpStatusEl],
    ["pluckPanel", pluckPanelEl],
    ["pluckStatus", pluckStatusEl],
    ["pluckChoices", pluckChoicesEl],
    ["pluckNextBtn", pluckNextBtn],
    ["trumpLabel", trumpLabelEl],
    ["booksSummary", booksSummaryEl],
    ["phaseVal", phaseValEl],
    ["dealerVal", dealerValEl]
  ];

  const missing = required.filter(([, el]) => !el).map(([name]) => name);
  if (missing.length) {
    fail(`Missing required DOM ids: ${missing.join(", ")}`);
    return;
  }

  // ---------- constants ----------
  const TOTAL_TRICKS = 17;
  const SUITS = ["S", "H", "D", "C"];
  const BRBR = ["S", "H", "C", "D"];
  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
    "8": 8, "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14
  };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

  const AI_DELAY = 240;
  const RESOLVE_DELAY = 260;
  const BETWEEN_TRICKS = 240;

  // ---------- game state ----------
  const players = [
    { id: "AI2", hand: [], tricks: 0, quota: 7, plucksEarned: 0, plucksSuffered: 0 },
    { id: "AI3", hand: [], tricks: 0, quota: 6, plucksEarned: 0, plucksSuffered: 0 },
    { id: "YOU", hand: [], tricks: 0, quota: 4, plucksEarned: 0, plucksSuffered: 0 }
  ];

  let dealerIndex = null;
  let phase = "PICK_DEALER";
  let trumpSuit = null;
  let trumpOpen = false;
  let trick = [];              // [{ playerIndex, cardStr }]
  let leadSuit = null;
  let trickNumber = 0;
  let turnIndex = 0;
  let firstHandDone = false;
  let pendingPlucks = null;
  let pluckQueue = [];
  let activePluck = null;
  let pluckSuitUsedByPair = new Map();
  let engineBusy = false;
  let isBound = false;

  // ---------- position helpers ----------
  // Correct seat math for this table:
  // AI2 = 0, AI3 = 1, YOU = 2
  // left pass order: YOU -> AI2 -> AI3 -> YOU
  function leftOf(i)  { return (i + 1) % 3; }
  function rightOf(i) { return (i + 2) % 3; }

  function phaseDisplay(p) {
    if (p === "PICK_DEALER") return "PICK";
    if (p === "TRUMP_PICK") return "TRUMP";
    return p.replaceAll("_", " ");
  }

  function suitName(s) {
    return s === "S" ? "Spades" :
           s === "H" ? "Hearts" :
           s === "D" ? "Diamonds" : "Clubs";
  }

  function suitSymbol(s) {
    return s === "S" ? "♠" :
           s === "H" ? "♥" :
           s === "D" ? "♦" : "♣";
  }

  function isRedSuit(s) {
    return s === "H" || s === "D";
  }

  function isJoker(cs) {
    return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER;
  }

  function parseCard(cs) {
    if (cs === CARD_BIG_JOKER) {
      return { kind: "JOKER", rank: "BJ", suit: null, value: 1000 };
    }
    if (cs === CARD_LITTLE_JOKER) {
      return { kind: "JOKER", rank: "LJ", suit: null, value: 900 };
    }
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length - 1);
    return { kind: "NORMAL", rank, suit, value: RANK_VALUE[rank] || 0 };
  }

  function makeDeck51() {
    const deck = [];
    for (const s of SUITS) {
      for (const r of RANKS_NO_2) deck.push(r + s);
    }
    deck.push("2C");
    deck.push(CARD_BIG_JOKER);
    deck.push(CARD_LITTLE_JOKER);
    return deck;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function cardSuitForFollow(cs) {
    if (isJoker(cs)) return trumpSuit || null;
    return cs.slice(-1);
  }

  function isTrumpCard(cs) {
    if (!trumpSuit) return false;
    if (isJoker(cs)) return true;
    return cs.slice(-1) === trumpSuit;
  }

  function cardPower(cs) {
    if (cs === CARD_BIG_JOKER) return 1000000;
    if (cs === CARD_LITTLE_JOKER) return 900000;
    const c = parseCard(cs);
    if (isTrumpCard(cs)) return 10000 + c.value;
    return c.value;
  }

  // ---------- rendering helpers ----------
  function makeMiniCard(cardStr, disabled = false) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cardFaceMini" + (disabled ? " disabled" : "");

    if (cardStr === CARD_BIG_JOKER || cardStr === CARD_LITTLE_JOKER) {
      el.textContent = cardStr;
      return el;
    }

    const suit = cardStr.slice(-1);
    const rank = cardStr.slice(0, -1);
    el.classList.add(isRedSuit(suit) ? "red" : "black");
    el.textContent = `${rank}${suitSymbol(suit)}`;
    return el;
  }

  function makeCardBack() {
    const el = document.createElement("div");
    el.className = "cardBack";
    return el;
  }

  function suitOrderForHand() {
    if (trumpSuit) return [trumpSuit, ...BRBR.filter(s => s !== trumpSuit)];
    return BRBR.slice();
  }

  function sortHandForDisplay(hand) {
    const suitOrder = suitOrderForHand();
    const rankOrder = { "A":14,"K":13,"Q":12,"J":11,"10":10,"9":9,"8":8,"7":7,"6":6,"5":5,"4":4,"3":3,"2":2 };

    function suitGroup(s) {
      return suitOrder.indexOf(s) === -1 ? 99 : suitOrder.indexOf(s);
    }

    function key(cs) {
      if (cs === CARD_BIG_JOKER) return { a:0, b:0, c:0 };
      if (cs === CARD_LITTLE_JOKER) return { a:0, b:1, c:0 };
      const suit = cs.slice(-1);
      const rank = cs.slice(0, -1);
      const sg = 1 + suitGroup(suit);
      const rv = rankOrder[rank] ?? 0;
      return { a: sg, b: 0, c: (100 - rv) };
    }

    return hand.slice().sort((x, y) => {
      const a = key(x), b = key(y);
      if (a.a !== b.a) return a.a - b.a;
      if (a.b !== b.b) return a.b - b.b;
      return a.c - b.c;
    });
  }

  function renderPickCard(slotEl, cardStr) {
    if (!slotEl) return;
    slotEl.innerHTML = "";
    if (!cardStr) {
      slotEl.textContent = "(none)";
      return;
    }
    slotEl.appendChild(makeMiniCard(cardStr, true));
  }

  function renderHUD() {
    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not set)");
    setText(booksSummaryEl, `YOU ${players[2].tricks} • AI2 ${players[0].tricks} • AI3 ${players[1].tricks}`);
    setText(phaseValEl, phaseDisplay(phase));
    setText(dealerValEl, dealerIndex === null ? "(not set)" : players[dealerIndex].id);

    if (ai2QuotaEl) setText(ai2QuotaEl, String(players[0].quota));
    if (ai3QuotaEl) setText(ai3QuotaEl, String(players[1].quota));
    if (youQuotaEl) setText(youQuotaEl, String(players[2].quota));

    if (ai2TricksEl) setText(ai2TricksEl, String(players[0].tricks));
    if (ai3TricksEl) setText(ai3TricksEl, String(players[1].tricks));
    if (youTricksEl) setText(youTricksEl, String(players[2].tricks));

    if (trickNumEl) setText(trickNumEl, String(trickNumber));
    if (trickMaxEl) setText(trickMaxEl, String(TOTAL_TRICKS));

    if (turnBannerEl) {
      const who = phase === "PLAY"
        ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`)
        : "—";
      turnBannerEl.textContent = `Phase: ${phaseDisplay(phase)} • ${who} • Trick ${trickNumber}/${TOTAL_TRICKS}`;
    }
  }

  function renderAIHands() {
    if (ai2HandEl) {
      ai2HandEl.innerHTML = "";
      players[0].hand.forEach(() => ai2HandEl.appendChild(makeCardBack()));
    }
    if (ai3HandEl) {
      ai3HandEl.innerHTML = "";
      players[1].hand.forEach(() => ai3HandEl.appendChild(makeCardBack()));
    }
  }

  function renderTrick() {
    trickSlotsEl.innerHTML = "";

    if (!trick.length) {
      const h = document.createElement("div");
      h.className = "slotHint";
      h.textContent = "(empty)";
      trickSlotsEl.appendChild(h);
      return;
    }

    const order = [0, 1, 2];
    for (const pi of order) {
      const wrap = document.createElement("div");
      wrap.className = "trickSlotWrap";

      const lab = document.createElement("div");
      lab.className = "trickSlotLabel";
      lab.textContent = players[pi].id;

      const found = trick.find(t => t.playerIndex === pi);
      if (found) {
        const mini = document.createElement("div");
        mini.className = "trickMini";
        if (!isJoker(found.cardStr)) {
          const s = found.cardStr.slice(-1);
          mini.classList.add(isRedSuit(s) ? "red" : "black");
          mini.textContent = `${found.cardStr.slice(0,-1)}${suitSymbol(s)}`;
        } else {
          mini.textContent = found.cardStr;
        }
        wrap.appendChild(lab);
        wrap.appendChild(mini);
      } else {
        const empty = document.createElement("div");
        empty.className = "trickMini";
        empty.style.opacity = ".35";
        empty.textContent = "—";
        wrap.appendChild(lab);
        wrap.appendChild(empty);
      }

      trickSlotsEl.appendChild(wrap);
    }
  }

  function legalCardsFor(pi) {
    const hand = players[pi].hand;

    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
      return hand.map((c,i) => ({ c, i })).filter(x => x.c === CARD_OPEN_LEAD).map(x => x.i);
    }

    if (trick.length === 0 && !trumpOpen && trumpSuit) {
      const nonTrumpIdx = hand
        .map((c,i) => ({ c, i }))
        .filter(x => !isTrumpCard(x.c))
        .map(x => x.i);
      if (nonTrumpIdx.length) return nonTrumpIdx;
      return hand.map((_,i) => i);
    }

    if (trick.length > 0) {
      const suited = hand
        .map((c,i) => ({ c, i }))
        .filter(x => cardSuitForFollow(x.c) === leadSuit)
        .map(x => x.i);
      return suited.length ? suited : hand.map((_,i) => i);
    }

    return hand.map((_,i) => i);
  }

  function illegalReason(pi, cardStr) {
    if (trickNumber === 1 && trick.length === 0 && players[pi].hand.includes(CARD_OPEN_LEAD)) {
      if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
    }
    if (trick.length === 0 && !trumpOpen && trumpSuit) {
      if (isTrumpCard(cardStr) && hasNonTrump(pi)) return "Trump is not open. Lead non-trump.";
    }
    if (trick.length > 0) {
      const must = leadSuit;
      const hasSuit = players[pi].hand.some(c => cardSuitForFollow(c) === must);
      if (hasSuit && cardSuitForFollow(cardStr) !== must) return `You must follow suit: ${must}.`;
    }
    return "That play is not allowed.";
  }

  function renderHand() {
    youHandEl.innerHTML = "";

    const displayHand = sortHandForDisplay(players[2].hand);
    const mapped = [];
    const used = new Set();

    for (const cardStr of displayHand) {
      for (let i = 0; i < players[2].hand.length; i++) {
        if (used.has(i)) continue;
        if (players[2].hand[i] === cardStr) {
          mapped.push({ cardStr, realIdx: i });
          used.add(i);
          break;
        }
      }
    }

    const yourTurn = phase === "PLAY" && turnIndex === 2;
    const legal = yourTurn ? legalCardsFor(2) : [];

    for (const item of mapped) {
      const disabled = !yourTurn || !legal.includes(item.realIdx);
      const cardEl = makeMiniCard(item.cardStr, disabled);

      if (!disabled) {
        cardEl.addEventListener("click", () => {
          const legalNow = legalCardsFor(2);
          if (!legalNow.includes(item.realIdx)) {
            msg(illegalReason(2, item.cardStr));
            return;
          }
          playCard(2, item.realIdx);
          engineKick();
        }, { once: true });
      }

      youHandEl.appendChild(cardEl);
    }
  }

  function renderTrumpStatus() {
    if (trumpSuit) {
      trumpStatusEl.textContent = `Trump set: ${suitName(trumpSuit)}.`;
    } else if (dealerIndex !== null) {
      trumpStatusEl.textContent = `Dealer (${players[dealerIndex].id}) selects trump.`;
    } else {
      trumpStatusEl.textContent = "";
    }
  }

  function renderPluckStatus() {
    pluckChoicesEl.innerHTML = "";

    if (!pluckQueue.length && !activePluck) {
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
      pluckStatusEl.textContent = `You are plucking ${players[pluckeeI].id}. Choose a suit.`;

      if (!suits.length) {
        const b = document.createElement("button");
        b.className = "btn";
        b.type = "button";
        b.textContent = "No suit available, skip";
        b.addEventListener("click", () => {
          pluckQueue.shift();
          activePluck = null;
          if (!pluckQueue.length) toTrumpPick();
          renderAll();
        }, { once: true });
        pluckChoicesEl.appendChild(b);
        return;
      }

      for (const s of suits) {
        const give = lowestOfSuitNonJoker(pluckerI, s);
        const b = document.createElement("button");
        b.className = "btn";
        b.type = "button";
        b.textContent = `${suitName(s)} • Give ${give}`;
        b.addEventListener("click", () => {
          const res = attemptPluck(pluckerI, pluckeeI, s);
          if (!res.ok) {
            usedSuitSet(pluckerI, pluckeeI).add(s);
            msg(`Pluck failed: ${res.reason}`);
          } else {
            msg(`Pluck: gave ${res.giveLow}, received ${res.takeHigh}.`);
          }
          pluckQueue.shift();
          activePluck = null;
          if (!pluckQueue.length) toTrumpPick();
          renderAll();
        }, { once: true });
        pluckChoicesEl.appendChild(b);
      }
      return;
    }

    pluckNextBtn.disabled = false;
    pluckStatusEl.textContent = `${players[pluckerI].id} is plucking ${players[pluckeeI].id}.`;
  }

  function renderAll() {
    renderHUD();
    renderAIHands();
    renderTrick();
    renderHand();
    renderTrumpStatus();
    if (phase === "PLUCK") renderPluckStatus();
  }

  // ---------- pick ----------
  function pickOneCard() {
    const d = shuffle(makeDeck51());
    let c = d.pop();
    while (c === CARD_BIG_JOKER || c === CARD_LITTLE_JOKER) c = d.pop();
    return c;
  }

  function pickRankValue(cardStr) {
    if (cardStr === CARD_BIG_JOKER) return 100;
    if (cardStr === CARD_LITTLE_JOKER) return 99;
    const p = parseCard(cardStr);
    if (p.rank === "2") return 2;
    return p.value;
  }

  function clearPickUI() {
    renderPickCard(pickAI2El, null);
    renderPickCard(pickAI3El, null);
    renderPickCard(pickYOUEl, null);
    setText(pickStatusEl, "Click Pick.");
    pickOkBtn.disabled = true;
    pickReBtn.disabled = true;
    pickBtn.disabled = false;
    setDealer(null);
  }

  function doPick() {
    const picks = { ai2: pickOneCard(), ai3: pickOneCard(), you: pickOneCard() };

    renderPickCard(pickAI2El, picks.ai2);
    renderPickCard(pickAI3El, picks.ai3);
    renderPickCard(pickYOUEl, picks.you);

    const vals = [
      { pi:0, v:pickRankValue(picks.ai2) },
      { pi:1, v:pickRankValue(picks.ai3) },
      { pi:2, v:pickRankValue(picks.you) }
    ].sort((a,b) => a.v - b.v);

    const lowestV = vals[0].v;
    const tied = vals.filter(x => x.v === lowestV);

    if (tied.length > 1) {
      setText(pickStatusEl, "Tie for lowest. Click Re-Pick.");
      pickOkBtn.disabled = true;
      pickReBtn.disabled = false;
      setDealer(null);
      return;
    }

    setDealer(vals[0].pi);
    setText(pickStatusEl, `Dealer will be ${players[dealerIndex].id}. Click OK.`);
    pickOkBtn.disabled = false;
    pickReBtn.disabled = true;
  }

  // ---------- dealer / quotas ----------
  function setDealer(i) {
    dealerIndex = i;
    setText(dealerValEl, i === null ? "(not set)" : players[i].id);
  }

  function applyQuotasForDealer() {
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }

  function rotateDealerLeft() {
    dealerIndex = leftOf(dealerIndex);
    applyQuotasForDealer();
    setDealer(dealerIndex);
  }

  // ---------- hand setup ----------
  function resetHandState() {
    trick = [];
    leadSuit = null;
    trickNumber = 0;
    trumpSuit = null;
    trumpOpen = false;
    turnIndex = 0;

    players.forEach(p => {
      p.hand = [];
      p.tricks = 0;
      p.plucksEarned = 0;
      p.plucksSuffered = 0;
    });

    pluckQueue = [];
    activePluck = null;
    pluckSuitUsedByPair = new Map();
  }

  function dealHand() {
    resetHandState();
    applyQuotasForDealer();

    const deck = shuffle(makeDeck51());
    for (let i = 0; i < TOTAL_TRICKS; i++) {
      players[0].hand.push(deck.pop());
      players[1].hand.push(deck.pop());
      players[2].hand.push(deck.pop());
    }
  }

  // ---------- plucks ----------
  function computePlucksEarnedSuffered() {
    for (const p of players) {
      p.plucksEarned = Math.max(0, p.tricks - p.quota);
      p.plucksSuffered = Math.max(0, p.quota - p.tricks);
    }
  }

  function pluckerOrder() {
    const tie = [dealerIndex, leftOf(dealerIndex), rightOf(dealerIndex)];
    return [0,1,2].slice().sort((a,b) => {
      const da = players[a].plucksEarned, db = players[b].plucksEarned;
      if (db !== da) return db - da;
      return tie.indexOf(a) - tie.indexOf(b);
    }).filter(i => players[i].plucksEarned > 0);
  }

  function victimOrder() {
    const tie = [dealerIndex, leftOf(dealerIndex), rightOf(dealerIndex)];
    return [0,1,2].slice().sort((a,b) => {
      const da = players[a].plucksSuffered, db = players[b].plucksSuffered;
      if (db !== da) return db - da;
      return tie.indexOf(a) - tie.indexOf(b);
    }).filter(i => players[i].plucksSuffered > 0);
  }

  function buildPluckQueue() {
    const q = [];
    const pluckers = pluckerOrder();
    const victims = victimOrder();
    const earned = new Map(pluckers.map(i => [i, players[i].plucksEarned]));
    const suffered = new Map(victims.map(i => [i, players[i].plucksSuffered]));

    for (const plucker of pluckers) {
      while ((earned.get(plucker) || 0) > 0) {
        const victim = victims
          .filter(v => (suffered.get(v) || 0) > 0)
          .sort((a,b) => (suffered.get(b) || 0) - (suffered.get(a) || 0))[0];
        if (victim === undefined) break;

        q.push({ pluckerIndex: plucker, pluckeeIndex: victim });
        earned.set(plucker, (earned.get(plucker) || 0) - 1);
        suffered.set(victim, (suffered.get(victim) || 0) - 1);
      }
    }
    return q;
  }

  function pairKey(a,b) {
    return `${a}-${b}`;
  }

  function lowestOfSuitNonJoker(pi, suit) {
    const cards = players[pi].hand.filter(c => !isJoker(c) && c.slice(-1) === suit);
    if (!cards.length) return null;
    cards.sort((a,b) => (RANK_VALUE[a.slice(0,-1)] || 99) - (RANK_VALUE[b.slice(0,-1)] || 99));
    return cards[0];
  }

  function highestOfSuitNonJoker(pi, suit) {
    const cards = players[pi].hand.filter(c => !isJoker(c) && c.slice(-1) === suit);
    if (!cards.length) return null;
    cards.sort((a,b) => (RANK_VALUE[b.slice(0,-1)] || 0) - (RANK_VALUE[a.slice(0,-1)] || 0));
    return cards[0];
  }

  function removeFromHand(pi, cardStr) {
    const idx = players[pi].hand.indexOf(cardStr);
    if (idx >= 0) players[pi].hand.splice(idx, 1);
  }

  function usedSuitSet(pluckerI, pluckeeI) {
    const k = pairKey(pluckerI, pluckeeI);
    if (!pluckSuitUsedByPair.has(k)) pluckSuitUsedByPair.set(k, new Set());
    return pluckSuitUsedByPair.get(k);
  }

  function availablePluckSuits(pluckerI, pluckeeI) {
    const used = usedSuitSet(pluckerI, pluckeeI);
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

    removeFromHand(pluckerI, giveLow);
    removeFromHand(pluckeeI, takeHigh);
    players[pluckerI].hand.push(takeHigh);
    players[pluckeeI].hand.push(giveLow);

    usedSuitSet(pluckerI, pluckeeI).add(suit);
    return { ok:true, giveLow, takeHigh };
  }

  function runOnePluck() {
    if (phase !== "PLUCK") return;
    if (!pluckQueue.length) return;
    if (!activePluck) activePluck = pluckQueue[0];

    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;
    const suits = availablePluckSuits(pluckerI, pluckeeI);

    if (!suits.length) {
      pluckQueue.shift();
      activePluck = null;
      if (!pluckQueue.length) toTrumpPick();
      renderAll();
      return;
    }

    if (pluckerI === 2) {
      renderAll();
      return;
    }

    let bestSuit = suits[0];
    let bestVal = 999;
    for (const s of suits) {
      const give = lowestOfSuitNonJoker(pluckerI, s);
      const v = give ? (RANK_VALUE[give.slice(0,-1)] || 99) : 99;
      if (v < bestVal) {
        bestVal = v;
        bestSuit = s;
      }
    }

    const res = attemptPluck(pluckerI, pluckeeI, bestSuit);
    if (!res.ok) usedSuitSet(pluckerI, pluckeeI).add(bestSuit);

    msg(res.ok
      ? `Pluck: ${players[pluckerI].id} gave ${res.giveLow}, received ${res.takeHigh}.`
      : `Pluck failed: ${res.reason}`);

    pluckQueue.shift();
    activePluck = null;
    if (!pluckQueue.length) toTrumpPick();
    renderAll();
  }

  // ---------- trump ----------
  function chooseTrumpFromOwnHand(pi) {
    const suitScore = { S:0, H:0, D:0, C:0 };
    for (const c of players[pi].hand) {
      if (isJoker(c)) {
        SUITS.forEach(s => suitScore[s] += 6);
        continue;
      }
      const suit = c.slice(-1);
      const rank = c.slice(0,-1);
      const v = RANK_VALUE[rank] || 0;
      suitScore[suit] += 2;
      if (v >= 11) suitScore[suit] += (v - 10) * 2;
      else suitScore[suit] += Math.max(0, v - 6) * 0.5;
    }

    let best = "H";
    let bestScore = -999;
    for (const s of SUITS) {
      if (suitScore[s] > bestScore) {
        bestScore = suitScore[s];
        best = s;
      }
    }
    return best;
  }

  function setTrump(suit) {
    trumpSuit = suit;
    trumpOpen = trumpSuit === "C";
    renderAll();
  }

  // ---------- play ----------
  function hasNonTrump(pi) {
    return players[pi].hand.some(c => !isTrumpCard(c));
  }

  function setLeadSuitFromFirst(cardStr) {
    leadSuit = cardSuitForFollow(cardStr);
  }

  function updateTrumpOpen(cardStr) {
    if (!trumpOpen && isTrumpCard(cardStr)) trumpOpen = true;
  }

  function playCard(pi, handIdx) {
    const cardStr = players[pi].hand.splice(handIdx, 1)[0];
    if (!cardStr) return;

    if (trick.length === 0) setLeadSuitFromFirst(cardStr);
    trick.push({ playerIndex: pi, cardStr });
    updateTrumpOpen(cardStr);

    turnIndex = (turnIndex + 1) % 3;
    renderAll();
  }

  function evaluateTrickWinner() {
    const anyTrump = trick.some(t => isTrumpCard(t.cardStr));
    if (anyTrump) {
      let bestPi = trick[0].playerIndex;
      let bestP = -1;
      for (const t of trick) {
        if (!isTrumpCard(t.cardStr)) continue;
        const p = cardPower(t.cardStr);
        if (p > bestP) {
          bestP = p;
          bestPi = t.playerIndex;
        }
      }
      return bestPi;
    }

    let bestPi = trick[0].playerIndex;
    let bestV = -1;
    for (const t of trick) {
      if (cardSuitForFollow(t.cardStr) !== leadSuit) continue;
      const v = parseCard(t.cardStr).value;
      if (v > bestV) {
        bestV = v;
        bestPi = t.playerIndex;
      }
    }
    return bestPi;
  }

  function aiChooseIndex(pi) {
    const legal = legalCardsFor(pi);
    const hand = players[pi].hand;
    const need = players[pi].quota - players[pi].tricks;

    if (trick.length === 0) {
      let best = legal[0];
      let bestScore = -999999;
      for (const idx of legal) {
        const c = hand[idx];
        const p = cardPower(c);
        const score = need > 0 ? p : -p;
        if (score > bestScore) {
          bestScore = score;
          best = idx;
        }
      }
      return best;
    }

    let winBest = null;
    let winBestP = -1;

    for (const idx of legal) {
      const c = hand[idx];
      const temp = trick.concat([{ playerIndex: pi, cardStr: c }]);
      const anyTrump = temp.some(t => isTrumpCard(t.cardStr));

      let wouldWin = false;

      if (anyTrump) {
        let bestPi = temp[0].playerIndex;
        let bestP = -1;
        for (const t of temp) {
          if (!isTrumpCard(t.cardStr)) continue;
          const pow = cardPower(t.cardStr);
          if (pow > bestP) {
            bestP = pow;
            bestPi = t.playerIndex;
          }
        }
        wouldWin = bestPi === pi;
      } else {
        let bestPi = temp[0].playerIndex;
        let bestV = -1;
        for (const t of temp) {
          if (cardSuitForFollow(t.cardStr) !== leadSuit) continue;
          const v = parseCard(t.cardStr).value;
          if (v > bestV) {
            bestV = v;
            bestPi = t.playerIndex;
          }
        }
        wouldWin = bestPi === pi;
      }

      if (wouldWin) {
        const pow = cardPower(c);
        if (pow > winBestP) {
          winBestP = pow;
          winBest = idx;
        }
      }
    }

    if (need > 0 && winBest !== null) return winBest;

    let low = legal[0];
    let lowP = 99999999;
    for (const idx of legal) {
      const p = cardPower(hand[idx]);
      if (p < lowP) {
        lowP = p;
        low = idx;
      }
    }
    return low;
  }

  // ---------- phase transitions ----------
  function toDeal() {
    phase = "DEAL";
    setText(phaseValEl, phaseDisplay(phase));
    msg("Dealing...");
    dealHand();
    renderAll();

    if (firstHandDone && pendingPlucks && pendingPlucks.length) {
      pluckQueue = pendingPlucks.slice();
      pendingPlucks = null;
      activePluck = null;
      setTimeout(() => {
        toPluck();
        renderAll();
      }, 60);
    } else {
      pendingPlucks = null;
      setTimeout(() => {
        toTrumpPick();
        renderAll();
      }, 60);
    }
  }

  function toPluck() {
    phase = "PLUCK";
    setText(phaseValEl, phaseDisplay(phase));
    show(pickPanelEl, false);
    show(pluckPanelEl, true);
    show(trumpPanelEl, false);
    msg("Pluck phase.");
    renderAll();

    if (activePluck && activePluck.pluckerIndex === 2) return;

    setTimeout(() => {
      if (phase === "PLUCK" && (!activePluck || activePluck.pluckerIndex !== 2)) {
        runOnePluck();
      }
    }, 350);
  }

  function toTrumpPick() {
    phase = "TRUMP_PICK";
    setText(phaseValEl, phaseDisplay(phase));
    show(pickPanelEl, false);
    show(pluckPanelEl, false);
    show(trumpPanelEl, true);
    renderAll();

    if (dealerIndex !== 2) {
      const suit = chooseTrumpFromOwnHand(dealerIndex);
      setTrump(suit);
      msg(`${players[dealerIndex].id} selected trump: ${suitName(suit)}.`);
      setTimeout(() => {
        toPlay();
        renderAll();
        engineKick();
      }, 120);
    } else {
      msg("You are dealer. Choose trump.");
    }
  }

  function toPlay() {
    phase = "PLAY";
    setText(phaseValEl, phaseDisplay(phase));
    show(pickPanelEl, false);
    show(pluckPanelEl, false);
    show(trumpPanelEl, false);

    trick = [];
    leadSuit = null;
    trickNumber = 1;

    let whoHas2C = 0;
    for (let pi = 0; pi < 3; pi++) {
      if (players[pi].hand.includes(CARD_OPEN_LEAD)) {
        whoHas2C = pi;
        break;
      }
    }
    turnIndex = whoHas2C;

    msg("Play begins.");
    renderAll();
  }

  function endOfHand() {
    computePlucksEarnedSuffered();
    pendingPlucks = buildPluckQueue();
    firstHandDone = true;

    const summary =
      `Hand complete. YOU ${players[2].tricks}/${players[2].quota} • ` +
      `AI2 ${players[0].tricks}/${players[0].quota} • ` +
      `AI3 ${players[1].tricks}/${players[1].quota}.`;

    msg(summary);
    renderAll();

    setTimeout(() => {
      rotateDealerLeft();
      toDeal();
      engineKick();
    }, 1000);
  }

  function resolveTrick() {
    const winner = evaluateTrickWinner();
    players[winner].tricks += 1;

    msg(`${players[winner].id} wins the trick.`);
    renderAll();

    setTimeout(() => {
      trick = [];
      leadSuit = null;
      turnIndex = winner;

      if (players.every(p => p.hand.length === 0)) {
        endOfHand();
        return;
      }

      trickNumber += 1;
      renderAll();
      engineKick();
    }, BETWEEN_TRICKS);
  }

  // ---------- engine ----------
  function engineStep() {
    if (engineBusy) return;
    engineBusy = true;

    try {
      if (phase !== "PLAY") {
        engineBusy = false;
        return;
      }

      if (trick.length === 3) {
        setTimeout(() => {
          resolveTrick();
          engineBusy = false;
        }, RESOLVE_DELAY);
        return;
      }

      if (turnIndex !== 2) {
        const pi = turnIndex;
        setTimeout(() => {
          if (phase !== "PLAY") {
            engineBusy = false;
            return;
          }
          const idx = aiChooseIndex(pi);
          playCard(pi, idx);
          engineBusy = false;
          engineKick();
        }, AI_DELAY);
        return;
      }

      engineBusy = false;
    } catch (e) {
      engineBusy = false;
      fail(`Engine crashed: ${e?.message || e}`);
    }
  }

  function engineKick() {
    setTimeout(engineStep, 0);
  }

  // ---------- events ----------
  function bindOnce() {
    if (isBound) return;
    isBound = true;

    pickBtn.addEventListener("click", () => {
      if (phase !== "PICK_DEALER") return;
      doPick();
      renderAll();
    });

    pickReBtn.addEventListener("click", () => {
      if (phase !== "PICK_DEALER") return;
      doPick();
      renderAll();
    });

    pickOkBtn.addEventListener("click", () => {
      if (phase !== "PICK_DEALER") return;
      if (dealerIndex === null) {
        setText(pickStatusEl, "No dealer set. Pick again.");
        return;
      }

      applyQuotasForDealer();
      setDealer(dealerIndex);

      pickOkBtn.disabled = true;
      pickReBtn.disabled = true;
      pickBtn.disabled = true;

      msg(`Dealer set to ${players[dealerIndex].id}. Starting hand 1.`);
      renderAll();

      toDeal();
      engineKick();
    });

    pluckNextBtn.addEventListener("click", () => {
      if (phase !== "PLUCK") return;
      runOnePluck();
      renderAll();
    });

    trumpPanelEl.querySelectorAll("button[data-trump]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (phase !== "TRUMP_PICK") return;
        if (dealerIndex !== 2) return;
        if (trumpSuit) return;

        const s = btn.getAttribute("data-trump");
        if (!SUITS.includes(s)) return;

        setTrump(s);
        setText(trumpStatusEl, `Trump set: ${suitName(s)}.`);
        msg(`You selected trump: ${suitName(s)}.`);
        setTimeout(() => {
          toPlay();
          renderAll();
          engineKick();
        }, 150);
      });
    });

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        firstHandDone = false;
        pendingPlucks = null;
        pluckQueue = [];
        activePluck = null;
        trumpSuit = null;
        trumpOpen = false;

        players.forEach(p => {
          p.hand = [];
          p.tricks = 0;
          p.plucksEarned = 0;
          p.plucksSuffered = 0;
        });

        trick = [];
        leadSuit = null;
        trickNumber = 0;
        turnIndex = 0;

        clearPickUI();
        phase = "PICK_DEALER";
        show(pickPanelEl, true);
        show(pluckPanelEl, false);
        show(trumpPanelEl, false);
        setText(phaseValEl, phaseDisplay(phase));
        msg("Reset. Pick first to begin.");
        renderAll();
      });
    }
  }

  // ---------- boot ----------
  function boot() {
    bindOnce();
    firstHandDone = false;
    pendingPlucks = null;
    pluckQueue = [];
    activePluck = null;
    trumpSuit = null;
    trumpOpen = false;
    trick = [];
    leadSuit = null;
    trickNumber = 0;
    turnIndex = 0;

    players.forEach(p => {
      p.hand = [];
      p.tricks = 0;
      p.plucksEarned = 0;
      p.plucksSuffered = 0;
    });

    phase = "PICK_DEALER";
    setText(trickNumEl, "0");
    setText(trickMaxEl, String(TOTAL_TRICKS));
    clearPickUI();
    show(pickPanelEl, true);
    show(pluckPanelEl, false);
    show(trumpPanelEl, false);
    setText(phaseValEl, phaseDisplay(phase));
    msg("Pick first to begin.");
    renderAll();
  }

  boot();
});
