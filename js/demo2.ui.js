// Pluck Demo 2 Engine (FULL REPLACEMENT)
// Start sequence: PICK FIRST -> HIDE PICK -> DEAL -> DEALER CALLS TRUMP -> GAMEPLAY
// Enforces: 2C must lead trick 1, follow suit, trump locked until open (unless Clubs).

(function () {
  "use strict";

  // ---------------- DOM ----------------
  const $ = (id) => document.getElementById(id);

  const elTrumpLabel = $("trumpLabel");
  const elBooks = $("booksSummary");
  const elPhase = $("phaseLabel");
  const elDealer = $("dealerLabel");

  const resetBtn = $("resetBtn");

  const pickPanel = $("pickPanel");
  const pickBtn = $("pickBtn");
  const pickOkBtn = $("pickOkBtn");
  const pickReBtn = $("pickReBtn");
  const pickStatus = $("pickStatus");
  const pickAI2 = $("pickAI2");
  const pickAI3 = $("pickAI3");
  const pickYOU = $("pickYOU");

  const trumpPanel = $("trumpPanel");
  const trumpStatus = $("trumpStatus");

  const trickSlots = $("trickSlots");
  const turnHint = $("turnHint");

  const youHandEl = $("youHand");

  if (!resetBtn || !pickPanel || !pickBtn || !pickOkBtn || !pickReBtn || !pickStatus || !trickSlots || !youHandEl) {
    console.error("[PluckDemo2] Missing required DOM elements.");
    return;
  }

  // ---------------- constants ----------------
  const SUITS = ["S", "H", "D", "C"];
  const BRBR = ["S", "H", "C", "D"]; // black/red/black/red
  const TOTAL_TRICKS = 17;

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14 };

  // timing
  const AI_DELAY = 260;
  const RESOLVE_DELAY = 260;
  const BETWEEN_TRICKS = 220;

  // player indices: 0=AI2, 1=AI3, 2=YOU
  const P = [
    { id: "AI2", hand: [], tricks: 0, quota: 7 },
    { id: "AI3", hand: [], tricks: 0, quota: 6 },
    { id: "YOU", hand: [], tricks: 0, quota: 4 }
  ];

  // ---------------- helpers ----------------
  const setText = (el, txt) => { if (el) el.textContent = txt; };

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function makeDeck51() {
    const deck = [];
    for (const s of SUITS) for (const r of RANKS_NO_2) deck.push(r + s);
    deck.push(CARD_OPEN_LEAD);
    deck.push(CARD_BIG_JOKER);
    deck.push(CARD_LITTLE_JOKER);
    return deck;
  }

  function parseCard(cs) {
    if (cs === CARD_BIG_JOKER) return { kind: "JOKER", rank: "BJ", suit: null, value: 1000 };
    if (cs === CARD_LITTLE_JOKER) return { kind: "JOKER", rank: "LJ", suit: null, value: 900 };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, -1);
    return { kind: "NORMAL", rank, suit, value: RANK_VALUE[rank] || 0 };
  }

  function suitName(s) { return s === "S" ? "Spades" : s === "H" ? "Hearts" : s === "D" ? "Diamonds" : "Clubs"; }
  function suitSymbol(s) { return s === "S" ? "♠" : s === "H" ? "♥" : s === "D" ? "♦" : "♣"; }
  function isRedSuit(s) { return s === "H" || s === "D"; }
  function isJoker(cs) { return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }

  function cardSuitForFollow(cs, trumpSuit) {
    if (isJoker(cs)) return trumpSuit || null;
    return cs.slice(-1);
  }

  function isTrumpCard(cs, trumpSuit) {
    if (!trumpSuit) return false;
    if (isJoker(cs)) return true;
    return cs.slice(-1) === trumpSuit;
  }

  function leftOf(i) { return (i + 1) % 3; }
  function rightOf(i) { return (i + 2) % 3; }

  // ---------------- UI: mini card face ----------------
  function makeMiniFace(card, disabled = false) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cardFaceMini" + (disabled ? " disabled" : "");
    el.setAttribute("aria-label", card);

    if (card === CARD_BIG_JOKER || card === CARD_LITTLE_JOKER) {
      el.textContent = card;
      return el;
    }

    const suit = card.slice(-1);
    const rank = card.slice(0, -1);
    el.classList.add(isRedSuit(suit) ? "red" : "black");
    el.textContent = rank + suitSymbol(suit);
    return el;
  }

  function makePickFace(card) {
    // pick panel wants something bigger but still simple
    const el = document.createElement("div");
    el.className = "pickFace";
    if (card === CARD_BIG_JOKER || card === CARD_LITTLE_JOKER) {
      el.textContent = card;
      return el;
    }
    const suit = card.slice(-1);
    const rank = card.slice(0, -1);
    el.classList.add(isRedSuit(suit) ? "red" : "black");
    el.textContent = rank + suitSymbol(suit);
    return el;
  }

  // ---------------- game state ----------------
  // phases: PICK -> TRUMP -> PLAY
  let phase = "PICK";
  let dealerIndex = null;

  let trumpSuit = null;
  let trumpOpen = false;

  let trick = [];      // {pi, card}
  let leadSuit = null;
  let trickNum = 0;
  let turnIndex = 0;

  // engine lock
  let busy = false;

  // ---------------- sorting ----------------
  function suitOrderForHand() {
    if (trumpSuit) return [trumpSuit, ...BRBR.filter(s => s !== trumpSuit)];
    return BRBR.slice();
  }

  function sortHandForDisplay(hand) {
    const suitOrder = suitOrderForHand();
    const rankOrder = { "A":14,"K":13,"Q":12,"J":11,"10":10,"9":9,"8":8,"7":7,"6":6,"5":5,"4":4,"3":3,"2":2 };

    function suitGroup(s) {
      const i = suitOrder.indexOf(s);
      return i < 0 ? 99 : i;
    }

    function key(cs) {
      if (cs === CARD_BIG_JOKER) return { a: 0, b: 0, c: 0 };
      if (cs === CARD_LITTLE_JOKER) return { a: 0, b: 1, c: 0 };
      const suit = cs.slice(-1);
      const rank = cs.slice(0, -1);
      return { a: 1 + suitGroup(suit), b: 0, c: (100 - (rankOrder[rank] ?? 0)) };
    }

    return hand.slice().sort((x, y) => {
      const a = key(x), b = key(y);
      if (a.a !== b.a) return a.a - b.a;
      if (a.b !== b.b) return a.b - b.b;
      return a.c - b.c;
    });
  }

  // ---------------- rules ----------------
  function hasNonTrump(pi) {
    return P[pi].hand.some(c => !isTrumpCard(c, trumpSuit));
  }

  function legalIndexesFor(pi) {
    const hand = P[pi].hand;

    // trick 1 must lead 2C if you have it and you're leading
    if (trickNum === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
      return hand.map((c, i) => ({ c, i })).filter(x => x.c === CARD_OPEN_LEAD).map(x => x.i);
    }

    // if leading and trump not open, cannot lead trump if you have non-trump
    if (trick.length === 0 && !trumpOpen && trumpSuit) {
      const nonTrump = hand.map((c, i) => ({ c, i })).filter(x => !isTrumpCard(x.c, trumpSuit)).map(x => x.i);
      if (nonTrump.length) return nonTrump;
      return hand.map((_, i) => i);
    }

    // must follow suit if possible
    if (trick.length > 0) {
      const must = leadSuit;
      const suited = hand.map((c, i) => ({ c, i }))
        .filter(x => cardSuitForFollow(x.c, trumpSuit) === must)
        .map(x => x.i);
      return suited.length ? suited : hand.map((_, i) => i);
    }

    return hand.map((_, i) => i);
  }

  function illegalReason(pi, cardStr) {
    if (trickNum === 1 && trick.length === 0 && P[pi].hand.includes(CARD_OPEN_LEAD)) {
      if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
    }
    if (trick.length === 0 && !trumpOpen && trumpSuit) {
      if (isTrumpCard(cardStr, trumpSuit) && hasNonTrump(pi)) return "Trump is not open. Lead non-trump.";
    }
    if (trick.length > 0) {
      const must = leadSuit;
      const hasSuit = P[pi].hand.some(c => cardSuitForFollow(c, trumpSuit) === must);
      if (hasSuit && cardSuitForFollow(cardStr, trumpSuit) !== must) return `You must follow suit: ${must}.`;
    }
    return "That play is not allowed.";
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

  function evaluateWinner() {
    const anyTrump = trick.some(t => isTrumpCard(t.card, trumpSuit));
    if (anyTrump) {
      let bestPi = trick[0].pi;
      let bestPow = -1;
      for (const t of trick) {
        if (!isTrumpCard(t.card, trumpSuit)) continue;
        const p = cardPower(t.card);
        if (p > bestPow) { bestPow = p; bestPi = t.pi; }
      }
      return bestPi;
    }

    let bestPi = trick[0].pi;
    let bestV = -1;
    for (const t of trick) {
      if (cardSuitForFollow(t.card, trumpSuit) !== leadSuit) continue;
      const v = parseCard(t.card).value;
      if (v > bestV) { bestV = v; bestPi = t.pi; }
    }
    return bestPi;
  }

  function playCard(pi, handIdx) {
    const card = P[pi].hand.splice(handIdx, 1)[0];
    if (!card) return;

    if (trick.length === 0) setLeadSuitFromFirst(card);
    trick.push({ pi, card });
    updateTrumpOpen(card);

    turnIndex = (turnIndex + 1) % 3;
    render();
  }

  // ---------------- AI ----------------
  function aiChooseIndex(pi) {
    const legal = legalIndexesFor(pi);
    const hand = P[pi].hand;
    const need = P[pi].quota - P[pi].tricks;

    if (trick.length === 0) {
      // lead: high if need, otherwise dump low
      let best = legal[0], bestScore = -999999;
      for (const idx of legal) {
        const c = hand[idx];
        const p = cardPower(c);
        const score = (need > 0) ? p : -p;
        if (score > bestScore) { bestScore = score; best = idx; }
      }
      return best;
    }

    // try to win if need
    let winBest = null, winBestPow = -1;
    for (const idx of legal) {
      const c = hand[idx];
      const temp = trick.concat([{ pi, card: c }]);

      const anyTrump = temp.some(t => isTrumpCard(t.card, trumpSuit));
      let wouldWin = false;

      if (anyTrump) {
        let bestPi = temp[0].pi, bestP = -1;
        for (const t of temp) {
          if (!isTrumpCard(t.card, trumpSuit)) continue;
          const pow = cardPower(t.card);
          if (pow > bestP) { bestP = pow; bestPi = t.pi; }
        }
        wouldWin = (bestPi === pi);
      } else {
        let bestPi = temp[0].pi, bestV = -1;
        for (const t of temp) {
          if (cardSuitForFollow(t.card, trumpSuit) !== leadSuit) continue;
          const v = parseCard(t.card).value;
          if (v > bestV) { bestV = v; bestPi = t.pi; }
        }
        wouldWin = (bestPi === pi);
      }

      if (wouldWin) {
        const pow = cardPower(c);
        if (pow > winBestPow) { winBestPow = pow; winBest = idx; }
      }
    }

    if (need > 0 && winBest !== null) return winBest;

    // dump lowest power legal
    let low = legal[0], lowPow = 99999999;
    for (const idx of legal) {
      const p = cardPower(hand[idx]);
      if (p < lowPow) { lowPow = p; low = idx; }
    }
    return low;
  }

  function chooseTrumpFromHand(pi) {
    const suitScore = { S: 0, H: 0, D: 0, C: 0 };
    for (const c of P[pi].hand) {
      if (isJoker(c)) { SUITS.forEach(s => suitScore[s] += 6); continue; }
      const suit = c.slice(-1);
      const rank = c.slice(0, -1);
      const v = RANK_VALUE[rank] || 0;
      suitScore[suit] += 2;
      if (v >= 11) suitScore[suit] += (v - 10) * 2;
      else suitScore[suit] += Math.max(0, v - 6) * 0.5;
    }
    let best = "H", bestS = -999;
    for (const s of SUITS) {
      if (suitScore[s] > bestS) { bestS = suitScore[s]; best = s; }
    }
    return best;
  }

  // ---------------- flow ----------------
  function setPhase(p) {
    phase = p;
    setText(elPhase, p);
  }

  function setDealer(pi) {
    dealerIndex = pi;
    setText(elDealer, pi === null ? "(not set)" : P[pi].id);
    // quotas by dealer
    if (pi !== null) {
      P[pi].quota = 7;
      P[leftOf(pi)].quota = 6;
      P[rightOf(pi)].quota = 4;
    }
  }

  function resetAll() {
    setPhase("PICK");
    setDealer(null);

    trumpSuit = null;
    trumpOpen = false;

    trick = [];
    leadSuit = null;
    trickNum = 0;
    turnIndex = 0;

    P.forEach(x => { x.hand = []; x.tricks = 0; });

    setText(elTrumpLabel, "(not set)");
    elTrumpLabel?.classList.add("muted");
    setText(elBooks, "YOU 0 • AI2 0 • AI3 0");

    // show pick, hide trump
    pickPanel.classList.remove("hidden");
    trumpPanel?.classList.add("hidden");

    // reset pick UI
    pickOkBtn.disabled = true;
    pickReBtn.disabled = true;
    pickBtn.disabled = false;
    pickStatus.textContent = "Click Pick.";
    pickAI2.textContent = "(none)";
    pickAI3.textContent = "(none)";
    pickYOU.textContent = "(none)";

    // clear table
    trickSlots.innerHTML = '<div class="slotHint">(empty)</div>';
    turnHint.textContent = "Pick first to begin";

    renderHand();
  }

  function deal() {
    // deal fresh 17 each
    const deck = shuffle(makeDeck51());
    P.forEach(x => { x.hand = []; x.tricks = 0; });

    for (let i = 0; i < TOTAL_TRICKS; i++) {
      P[0].hand.push(deck.pop());
      P[1].hand.push(deck.pop());
      P[2].hand.push(deck.pop());
    }

    trick = [];
    leadSuit = null;
    trickNum = 1;

    // trick 1 leader: whoever has 2C
    let whoHas2C = 0;
    for (let pi = 0; pi < 3; pi++) {
      if (P[pi].hand.includes(CARD_OPEN_LEAD)) { whoHas2C = pi; break; }
    }
    turnIndex = whoHas2C;

    render();
  }

  function setTrump(s) {
    trumpSuit = s;
    trumpOpen = (s === "C"); // your rule
    if (elTrumpLabel) {
      elTrumpLabel.textContent = `${s} (${suitName(s)})`;
      elTrumpLabel.classList.remove("muted");
    }
  }

  function startAfterPick() {
    // hide pick panel, deal, then dealer calls trump
    pickPanel.classList.add("hidden");
    setPhase("TRUMP");

    deal();

    if (dealerIndex === 2) {
      // YOU must choose trump
      trumpPanel?.classList.remove("hidden");
      setText(trumpStatus, "You are Dealer. Select trump suit.");
      turnHint.textContent = "Dealer calling trump…";
      render();
      return;
    }

    // AI dealer chooses trump
    const s = chooseTrumpFromHand(dealerIndex);
    setTrump(s);
    setPhase("PLAY");
    trumpPanel?.classList.add("hidden");
    turnHint.textContent = (turnIndex === 2) ? "Your turn" : `${P[turnIndex].id} to play`;
    render();
    engineKick();
  }

  // ---------------- rendering ----------------
  function renderBooks() {
    setText(elBooks, `YOU ${P[2].tricks} • AI2 ${P[0].tricks} • AI3 ${P[1].tricks}`);
  }

  function renderTrick() {
    trickSlots.innerHTML = "";
    if (!trick.length) {
      trickSlots.innerHTML = '<div class="slotHint">(empty)</div>';
      return;
    }

    for (const t of trick) {
      const wrap = document.createElement("div");
      wrap.className = "trickSlotWrap";

      const lbl = document.createElement("div");
      lbl.className = "trickSlotLabel";
      lbl.textContent = P[t.pi].id;

      const face = makeMiniFace(t.card, true);
      face.classList.add("trickMini");

      wrap.appendChild(lbl);
      wrap.appendChild(face);
      trickSlots.appendChild(wrap);
    }
  }

  function renderHand() {
    youHandEl.innerHTML = "";

    const displayHand = sortHandForDisplay(P[2].hand);
    const playable = (phase === "PLAY" && turnIndex === 2);

    let legal = [];
    if (playable) legal = legalIndexesFor(2);

    // NOTE: displayHand is sorted, but actual indices come from P[2].hand.
    // This demo is fine using indexOf because deck has unique cards.
    for (const card of displayHand) {
      const realIdx = P[2].hand.indexOf(card);
      const disabled = !playable || !legal.includes(realIdx);

      const el = makeMiniFace(card, disabled);
      el.dataset.idx = String(realIdx);

      el.addEventListener("click", () => {
        if (!playable) return;

        const idx = Number(el.dataset.idx);
        const c = P[2].hand[idx];

        const legalNow = legalIndexesFor(2);
        if (!legalNow.includes(idx)) {
          turnHint.textContent = illegalReason(2, c);
          return;
        }

        playCard(2, idx);
        engineKick();
      });

      youHandEl.appendChild(el);
    }

    // tighten class for CSS if needed
    youHandEl.classList.toggle("tight", P[2].hand.length >= 14);
  }

  function render() {
    renderBooks();
    renderTrick();
    renderHand();

    if (phase === "PICK") {
      turnHint.textContent = "Pick first to begin";
      return;
    }
    if (phase === "TRUMP") {
      turnHint.textContent = "Dealer calling trump…";
      return;
    }
    if (phase === "PLAY") {
      turnHint.textContent = (turnIndex === 2) ? "Your turn" : `${P[turnIndex].id} to play`;
    }
  }

  // ---------------- trick resolution & engine ----------------
  function resolveTrick() {
    const winner = evaluateWinner();
    P[winner].tricks += 1;

    // next trick
    setTimeout(() => {
      trick = [];
      leadSuit = null;
      turnIndex = winner;
      trickNum += 1;

      // end of hand
      if (P.every(x => x.hand.length === 0)) {
        setPhase("PICK");
        turnHint.textContent = "Hand complete. Hit Reset for new deal.";
        render();
        return;
      }

      render();
      engineKick();
    }, BETWEEN_TRICKS);
  }

  function engineStep() {
    if (busy) return;
    busy = true;

    try {
      if (phase !== "PLAY") { busy = false; return; }

      if (trick.length === 3) {
        setTimeout(() => { resolveTrick(); busy = false; }, RESOLVE_DELAY);
        return;
      }

      if (turnIndex !== 2) {
        const pi = turnIndex;
        setTimeout(() => {
          if (phase !== "PLAY") { busy = false; return; }
          const idx = aiChooseIndex(pi);
          playCard(pi, idx);
          busy = false;
          engineKick();
        }, AI_DELAY);
        return;
      }

      // your turn
      busy = false;
    } catch (e) {
      busy = false;
      console.error("[PluckDemo2] Engine error:", e);
      turnHint.textContent = "Engine error. Hit Reset.";
    }
  }

  function engineKick() {
    setTimeout(engineStep, 0);
  }

  // ---------------- pick dealer ----------------
  function pickOneCardNoJokers() {
    const d = shuffle(makeDeck51());
    let c = d.pop();
    while (c === CARD_BIG_JOKER || c === CARD_LITTLE_JOKER) c = d.pop();
    return c;
  }

  function pickRankValue(cardStr) {
    // lowest wins dealer pick (2 lowest)
    if (cardStr === CARD_BIG_JOKER) return 100;
    if (cardStr === CARD_LITTLE_JOKER) return 99;
    const p = parseCard(cardStr);
    if (p.rank === "2") return 2;
    return p.value;
  }

  function doPick() {
    const picks = {
      ai2: pickOneCardNoJokers(),
      ai3: pickOneCardNoJokers(),
      you: pickOneCardNoJokers()
    };

    pickAI2.innerHTML = ""; pickAI2.appendChild(makePickFace(picks.ai2));
    pickAI3.innerHTML = ""; pickAI3.appendChild(makePickFace(picks.ai3));
    pickYOU.innerHTML = ""; pickYOU.appendChild(makePickFace(picks.you));

    const vals = [
      { pi: 0, v: pickRankValue(picks.ai2) },
      { pi: 1, v: pickRankValue(picks.ai3) },
      { pi: 2, v: pickRankValue(picks.you) }
    ].sort((a, b) => a.v - b.v);

    const lowest = vals[0].v;
    const tied = vals.filter(x => x.v === lowest);

    if (tied.length > 1) {
      pickStatus.textContent = "Tie for lowest. Click Re-Pick.";
      pickOkBtn.disabled = true;
      pickReBtn.disabled = false;
      setDealer(null);
      return;
    }

    setDealer(vals[0].pi);
    pickStatus.textContent = `Dealer will be ${P[dealerIndex].id}. Click OK.`;
    pickOkBtn.disabled = false;
    pickReBtn.disabled = true;
  }

  // ---------------- events ----------------
  resetBtn.addEventListener("click", () => resetAll());

  pickBtn.addEventListener("click", () => {
    setPhase("PICK");
    doPick();
  });

  pickReBtn.addEventListener("click", () => {
    doPick();
  });

  pickOkBtn.addEventListener("click", () => {
    if (dealerIndex === null) {
      pickStatus.textContent = "No dealer set. Pick again.";
      return;
    }
    pickBtn.disabled = true;
    pickOkBtn.disabled = true;
    pickReBtn.disabled = true;

    pickStatus.textContent = `Dealer locked: ${P[dealerIndex].id}. Dealing…`;
    startAfterPick();
  });

  // trump buttons (only for YOU dealer)
  trumpPanel?.querySelectorAll("button[data-trump]")?.forEach(btn => {
    btn.addEventListener("click", () => {
      if (phase !== "TRUMP") return;
      if (dealerIndex !== 2) return;

      const s = (btn.getAttribute("data-trump") || "").toUpperCase();
      if (!SUITS.includes(s)) return;

      setTrump(s);
      trumpPanel.classList.add("hidden");
      setPhase("PLAY");
      render();
      engineKick();
    });
  });

  // boot
  resetAll();
})();
