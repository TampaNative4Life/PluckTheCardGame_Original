// =========================================================
// CHANGE LOG
// 2026-03-17 15:55 (-0400)
//
// FILE
// docs/js/demo2.js
//
// ACTION
// Full replacement.
//
// PURPOSE
// Uses the stable game engine from game.js, but maps rendering
// and controls to the approved Demo 2 UI.
//
// FIXES / CHANGES
// • Replaces lightweight Demo 2 logic with full game.js engine flow
// • Preserves Demo 2 page layout and DOM IDs
// • Supports pick dealer, deal, trump, play, trick resolution
// • Supports full 17-trick hand completion
// • Preserves reset flow
// • Keeps Demo 2 bottom hand row and bottom pick panel
//
// DEPENDENCIES
// • docs/demo2.html
// • docs/css/style.css
//
// ROW COUNT
// Previous File Row Count: unknown from live repo at paste time
// Current File Row Count: 640
//
// NOTE
// demo2.rollback.js already exists as safety backup.
// =========================================================

(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const on = (el, evt, fn) => el && el.addEventListener(evt, fn);
  const setText = (el, txt) => { if (el) el.textContent = txt; };

  const msgEl = $("msg");
  function msg(txt) {
    if (!msgEl) return;
    msgEl.style.display = txt ? "block" : "none";
    setText(msgEl, txt || "");
  }

  function err(txt) {
    msg("ERROR: " + txt);
    console.error("[Pluck Demo2]", txt);
  }

  window.addEventListener("error", (e) => err(e?.message || "Unknown JS error"));

  // ---------- required Demo 2 DOM ----------
  const trickSlotsEl = $("trickSlots");
  const youHandEl = $("youHand");
  const resetBtn = $("resetBtn");

  const trumpLabelEl = $("trumpLabel");
  const booksSummaryEl = $("booksSummary");
  const phaseValEl = $("phaseVal");
  const dealerValEl = $("dealerVal");

  const pickPanel = $("pickPanel");
  const pickBtn = $("pickBtn");
  const pickOkBtn = $("pickOkBtn");
  const pickReBtn = $("pickReBtn");
  const pickStatusEl = $("pickStatus");
  const pickAI2El = $("pickAI2");
  const pickAI3El = $("pickAI3");
  const pickYOUEl = $("pickYOU");

  const trumpPanel = $("trumpPanel");
  const trumpStatusEl = $("trumpStatus");

  if (
    !trickSlotsEl || !youHandEl || !resetBtn ||
    !pickPanel || !pickBtn || !pickOkBtn || !pickReBtn || !trumpPanel
  ) {
    err("Missing required Demo 2 elements.");
    return;
  }

  // ---------- constants ----------
  const TOTAL_TRICKS = 17;
  const SUITS = ["S", "H", "D", "C"];
  const BRBR = ["S", "H", "C", "D"];

  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = {
    "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,
    "J":11,"Q":12,"K":13,"A":14,"2":2
  };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

  const AI_DELAY = 260;
  const RESOLVE_DELAY = 280;
  const BETWEEN_TRICKS = 240;

  // ---------- card utils ----------
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

  function makeDeck51() {
    const deck = [];
    for (const s of SUITS) {
      for (const r of RANKS_NO_2) {
        deck.push(r + s);
      }
    }
    deck.push("2C");
    deck.push(CARD_BIG_JOKER);
    deck.push(CARD_LITTLE_JOKER);
    return deck;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function parseCard(cs) {
    if (cs === CARD_BIG_JOKER) return { kind:"JOKER", rank:"BJ", suit:null, value:1000 };
    if (cs === CARD_LITTLE_JOKER) return { kind:"JOKER", rank:"LJ", suit:null, value:900 };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length - 1);
    return { kind:"NORMAL", rank, suit, value:RANK_VALUE[rank] || 0 };
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

  // ---------- Demo 2 mini card UI ----------
  function makeMiniCard(cardStr, disabled = false) {
    const el = document.createElement("div");
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

  // ---------- game model ----------
  // 0=AI2, 1=AI3, 2=YOU
  const players = [
    { id:"AI2", hand:[], tricks:0, quota:7, plucksEarned:0, plucksSuffered:0 },
    { id:"AI3", hand:[], tricks:0, quota:6, plucksEarned:0, plucksSuffered:0 },
    { id:"YOU", hand:[], tricks:0, quota:4, plucksEarned:0, plucksSuffered:0 }
  ];

  function leftOf(i){ return (i + 1) % 3; }
  function rightOf(i){ return (i + 2) % 3; }

  let dealerIndex = null;
  let firstHandDone = false;
  let phase = "PICK_DEALER";

  let trumpSuit = null;
  let trumpOpen = false;

  let trick = []; // { playerIndex, cardStr }
  let leadSuit = null;
  let trickNumber = 0;
  let turnIndex = 0;

  let pendingPlucks = null;
  let pluckQueue = [];
  let activePluck = null;
  let pluckSuitUsedByPair = new Map();

  let engineBusy = false;

  // ---------- phase helpers ----------
  function phaseDisplay(p) {
    if (p === "PICK_DEALER") return "PICK";
    if (p === "TRUMP_PICK") return "TRUMP";
    return p;
  }

  function setPhase(newPhase) {
    phase = newPhase;
    setText(phaseValEl, phaseDisplay(newPhase));
    if (pickPanel) pickPanel.style.display = (newPhase === "PICK_DEALER") ? "block" : "none";
    if (trumpPanel) trumpPanel.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";
  }

  function setDealer(i) {
    dealerIndex = i;
    setText(dealerValEl, i === null ? "(not set)" : players[i].id);
  }

  function applyQuotasForDealer() {
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }

  function rotateDealerRight() {
    dealerIndex = rightOf(dealerIndex);
    applyQuotasForDealer();
    setDealer(dealerIndex);
  }

  // ---------- sorting ----------
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
      const rank = cs.slice(0, cs.length - 1);
      const sg = 1 + suitGroup(suit);
      const rv = rankOrder[rank] ?? 0;
      return { a:sg, b:0, c:(100 - rv) };
    }

    return hand.slice().sort((x, y) => {
      const a = key(x), b = key(y);
      if (a.a !== b.a) return a.a - b.a;
      if (a.b !== b.b) return a.b - b.b;
      return a.c - b.c;
    });
  }

  // ---------- rendering ----------
  function renderHUD() {
    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not set)");
    setText(dealerValEl, dealerIndex === null ? "(not set)" : players[dealerIndex].id);
    setText(phaseValEl, phaseDisplay(phase));
    setText(booksSummaryEl, `YOU ${players[2].tricks} • AI2 ${players[0].tricks} • AI3 ${players[1].tricks}`);
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

    const order = [0,1,2];
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

  const yourTurn = (phase === "PLAY" && turnIndex === 2);
  const legal = yourTurn ? legalCardsFor(2) : [];

  for (const item of mapped) {
    const disabled = !yourTurn || !legal.includes(item.realIdx);
    const cardEl = makeMiniCard(item.cardStr, disabled);

    cardEl.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (disabled) return;

      const legalNow = legalCardsFor(2);
      if (!legalNow.includes(item.realIdx)) {
        msg(illegalReason(2, item.cardStr));
        return;
      }

      playCard(2, item.realIdx);
      engineKick();
    }, { passive:false });

    youHandEl.appendChild(cardEl);
  }
}

    const yourTurn = (phase === "PLAY" && turnIndex === 2);
    const legal = yourTurn ? legalCardsFor(2) : [];

    for (const c of displayHand) {
      const realIdx = findRealIndex(c);
      const disabled = !yourTurn || !legal.includes(realIdx);
      const cardEl = makeMiniCard(c, disabled);

      cardEl.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (disabled) return;

        const legalNow = legalCardsFor(2);
        if (!legalNow.includes(realIdx)) {
          msg(illegalReason(2, c));
          return;
        }

        playCard(2, realIdx);
        engineKick();
      }, { passive:false });

      youHandEl.appendChild(cardEl);
    }
  }

  function renderPickCard(slotEl, cardStr) {
    if (!slotEl) return;
    slotEl.innerHTML = "";
    slotEl.appendChild(makeMiniCard(cardStr, true));
  }

  function renderTrumpStatus() {
    if (!trumpStatusEl) return;
    if (trumpSuit) {
      trumpStatusEl.textContent = `Trump set: ${suitName(trumpSuit)}.`;
    } else if (dealerIndex !== null) {
      trumpStatusEl.textContent = `Dealer (${players[dealerIndex].id}) selects trump.`;
    } else {
      trumpStatusEl.textContent = "";
    }
  }

  function render() {
    renderHUD();
    renderTrick();
    renderHand();
    renderTrumpStatus();
  }

  // ---------- initial pick ----------
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
    if (pickAI2El) setText(pickAI2El, "(none)");
    if (pickAI3El) setText(pickAI3El, "(none)");
    if (pickYOUEl) setText(pickYOUEl, "(none)");
    setText(pickStatusEl, "Click Pick.");
    if (pickOkBtn) pickOkBtn.disabled = true;
    if (pickReBtn) pickReBtn.disabled = true;
    if (pickBtn) pickBtn.disabled = false;
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
      if (pickOkBtn) pickOkBtn.disabled = true;
      if (pickReBtn) pickReBtn.disabled = false;
      setDealer(null);
      return;
    }

    setDealer(vals[0].pi);
    setText(pickStatusEl, `Dealer will be ${players[dealerIndex].id}. Click OK.`);
    if (pickOkBtn) pickOkBtn.disabled = false;
    if (pickReBtn) pickReBtn.disabled = true;
  }

  // ---------- deal / hand setup ----------
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

  function pairKey(a,b){ return `${a}-${b}`; }

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
      render();
      return;
    }

    if (pluckerI === 2) {
      // For public tester build, auto-use first legal suit for now.
      const res = attemptPluck(pluckerI, pluckeeI, suits[0]);
      if (!res.ok) usedSuitSet(pluckerI, pluckeeI).add(suits[0]);
      msg(res.ok
        ? `Pluck: gave ${res.giveLow}, received ${res.takeHigh}.`
        : `Pluck failed: ${res.reason}`);
      pluckQueue.shift();
      activePluck = null;
      if (!pluckQueue.length) toTrumpPick();
      render();
      return;
    }

    let bestSuit = suits[0], bestVal = 999;
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

    pluckQueue.shift();
    activePluck = null;
    if (!pluckQueue.length) toTrumpPick();
    render();
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

    let best = "H", bestS = -999;
    for (const s of SUITS) {
      if (suitScore[s] > bestS) {
        bestS = suitScore[s];
        best = s;
      }
    }
    return best;
  }

  function setTrump(suit) {
    trumpSuit = suit;
    trumpOpen = (trumpSuit === "C");
    render();
  }

  // ---------- play rules ----------
  function hasNonTrump(pi) {
    return players[pi].hand.some(c => !isTrumpCard(c, trumpSuit));
  }

  function illegalReason(pi, cardStr) {
    if (trickNumber === 1 && trick.length === 0 && players[pi].hand.includes(CARD_OPEN_LEAD)) {
      if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
    }
    if (trick.length === 0 && !trumpOpen && trumpSuit) {
      if (isTrumpCard(cardStr, trumpSuit) && hasNonTrump(pi)) return "Trump is not open. Lead non-trump.";
    }
    if (trick.length > 0) {
      const must = leadSuit;
      const hasSuit = players[pi].hand.some(c => cardSuitForFollow(c, trumpSuit) === must);
      if (hasSuit && cardSuitForFollow(cardStr, trumpSuit) !== must) return `You must follow suit: ${must}.`;
    }
    return "That play is not allowed.";
  }

  function legalCardsFor(pi) {
    const hand = players[pi].hand;

    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
      return hand.map((c,i) => ({c,i})).filter(x => x.c === CARD_OPEN_LEAD).map(x => x.i);
    }
    if (trick.length === 0 && !trumpOpen && trumpSuit) {
      const nonTrumpIdx = hand.map((c,i) => ({c,i})).filter(x => !isTrumpCard(x.c, trumpSuit)).map(x => x.i);
      if (nonTrumpIdx.length) return nonTrumpIdx;
      return hand.map((_,i) => i);
    }
    if (trick.length > 0) {
      const suited = hand.map((c,i) => ({c,i})).filter(x => cardSuitForFollow(x.c, trumpSuit) === leadSuit).map(x => x.i);
      return suited.length ? suited : hand.map((_,i) => i);
    }
    return hand.map((_,i) => i);
  }

  function setLeadSuitFromFirst(cardStr) {
    leadSuit = cardSuitForFollow(cardStr, trumpSuit);
  }

  function updateTrumpOpen(cardStr) {
    if (!trumpOpen && isTrumpCard(cardStr, trumpSuit)) trumpOpen = true;
  }

  function cardPower(cardStr) {
    if (cardStr === CARD_BIG_JOKER) return 1000000;
    if (cardStr === CARD_LITTLE_JOKER) return 900000;
    const c = parseCard(cardStr);
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
      if (cardSuitForFollow(t.cardStr, trumpSuit) !== leadSuit) continue;
      const v = parseCard(t.cardStr).value;
      if (v > bestV) {
        bestV = v;
        bestPi = t.playerIndex;
      }
    }
    return bestPi;
  }

  function playCard(pi, handIdx) {
    const cardStr = players[pi].hand.splice(handIdx, 1)[0];
    if (!cardStr) return;

    if (trick.length === 0) setLeadSuitFromFirst(cardStr);
    trick.push({ playerIndex: pi, cardStr });
    updateTrumpOpen(cardStr);

    turnIndex = (turnIndex + 1) % 3;
    render();
  }

  function aiChooseIndex(pi) {
    const legal = legalCardsFor(pi);
    const hand = players[pi].hand;
    const need = players[pi].quota - players[pi].tricks;

    if (trick.length === 0) {
      let best = legal[0], bestScore = -999999;
      for (const idx of legal) {
        const c = hand[idx];
        const p = cardPower(c);
        const score = (need > 0) ? p : -p;
        if (score > bestScore) {
          bestScore = score;
          best = idx;
        }
      }
      return best;
    }

    let winBest = null, winBestP = -1;
    for (const idx of legal) {
      const c = hand[idx];
      const temp = trick.concat([{ playerIndex: pi, cardStr: c }]);
      const anyTrump = temp.some(t => isTrumpCard(t.cardStr, trumpSuit));

      let wouldWin = false;
      if (anyTrump) {
        let bestPi = temp[0].playerIndex, bestP = -1;
        for (const t of temp) {
          if (!isTrumpCard(t.cardStr, trumpSuit)) continue;
          const pow = cardPower(t.cardStr);
          if (pow > bestP) {
            bestP = pow;
            bestPi = t.playerIndex;
          }
        }
        wouldWin = (bestPi === pi);
      } else {
        let bestPi = temp[0].playerIndex, bestV = -1;
        for (const t of temp) {
          if (cardSuitForFollow(t.cardStr, trumpSuit) !== leadSuit) continue;
          const v = parseCard(t.cardStr).value;
          if (v > bestV) {
            bestV = v;
            bestPi = t.playerIndex;
          }
        }
        wouldWin = (bestPi === pi);
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

    let low = legal[0], lowP = 99999999;
    for (const idx of legal) {
      const p = cardPower(hand[idx]);
      if (p < lowP) {
        lowP = p;
        low = idx;
      }
    }
    return low;
  }

  // ---------- engine ----------
  function toDeal() {
    setPhase("DEAL");
    msg("Dealing...");
    dealHand();

    if (firstHandDone && pendingPlucks && pendingPlucks.length) {
      pluckQueue = pendingPlucks.slice();
      pendingPlucks = null;
      activePluck = null;
      setTimeout(() => {
        toPluck();
        render();
      }, 60);
    } else {
      pendingPlucks = null;
      setTimeout(() => {
        toTrumpPick();
        render();
      }, 60);
    }

    render();
  }

  function toPluck() {
    setPhase("PLUCK");
    msg("Pluck phase.");
    render();
    setTimeout(() => {
      while (phase === "PLUCK" && pluckQueue.length) {
        runOnePluck();
      }
    }, 80);
  }

  function toTrumpPick() {
    setPhase("TRUMP_PICK");
    const caller = dealerIndex;

    if (caller !== 2) {
      const suit = chooseTrumpFromOwnHand(caller);
      setTrump(suit);
      msg(`${players[caller].id} selected trump: ${suitName(suit)}.`);
      setTimeout(() => {
        toPlay();
        render();
        engineKick();
      }, 120);
    } else {
      msg("You are dealer. Choose trump.");
      render();
    }
  }

  function toPlay() {
    setPhase("PLAY");
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
    render();
  }

  function endOfHand() {
  computePlucksEarnedSuffered();
  pendingPlucks = buildPluckQueue();
  firstHandDone = true;

  const summary =
    `Hand complete. ` +
    `YOU ${players[2].tricks}/${players[2].quota} • ` +
    `AI2 ${players[0].tricks}/${players[0].quota} • ` +
    `AI3 ${players[1].tricks}/${players[1].quota}.`;

  msg(summary);
  render();

  setTimeout(() => {
    rotateDealerRight();
    toDeal();
    engineKick();
  }, 1200);
}

  function resolveTrick() {
  const winner = evaluateTrickWinner();
  players[winner].tricks += 1;

  msg(`${players[winner].id} wins the trick.`);
  render();

  setTimeout(() => {
    trick = [];
    leadSuit = null;
    turnIndex = winner;

    if (players.every(p => p.hand.length === 0)) {
      endOfHand();
      return;
    }

    trickNumber += 1;
    render();
    engineKick();
  }, BETWEEN_TRICKS);
}

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
      err("Engine crashed: " + (e?.message || e));
    }
  }

  function engineKick() {
    setTimeout(engineStep, 0);
  }

  // ---------- events ----------
  on(resetBtn, "click", () => {
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

    setDealer(null);
    clearPickUI();

    trick = [];
    leadSuit = null;
    trickNumber = 0;
    turnIndex = 0;

    setPhase("PICK_DEALER");
    msg("Reset. Pick first to begin.");
    render();
  });

  if (pickBtn) {
    pickBtn.onclick = () => {
      setPhase("PICK_DEALER");
      doPick();
      render();
    };
  }

  if (pickReBtn) {
    pickReBtn.onclick = () => {
      doPick();
      render();
    };
  }

  if (pickOkBtn) {
    pickOkBtn.onclick = () => {
      if (dealerIndex === null) {
        setText(pickStatusEl, "No dealer set. Pick again.");
        return;
      }

      applyQuotasForDealer();
      setDealer(dealerIndex);

      pickOkBtn.disabled = true;
      pickReBtn.disabled = true;
      pickBtn.disabled = true;

      msg(`Dealer set to ${players[dealerIndex].id}. Starting hand 1 (no pluck).`);
      render();

      toDeal();
      engineKick();
    };
  }

  if (trumpPanel) {
    trumpPanel.querySelectorAll("button[data-trump]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (phase !== "TRUMP_PICK") return;
        if (dealerIndex !== 2) return;
        if (trumpSuit) return;

        const s = btn.getAttribute("data-trump");
        if (!SUITS.includes(s)) return;

        setTrump(s);
        if (trumpStatusEl) setText(trumpStatusEl, `Trump set: ${suitName(s)}.`);
        msg(`You selected trump: ${suitName(s)}.`);
        setTimeout(() => {
          toPlay();
          render();
          engineKick();
        }, 180);
      });
    });
  }

  // ---------- boot ----------
  clearPickUI();
  setPhase("PICK_DEALER");
  msg("Pick first to begin.");
  render();

})();
