// Pluck Web Demo v19 (single-file replacement)
// Goals:
// - Fix "cards won't click/play" by making click wiring + phase/turn state robust (tablet-safe).
// - First-time dealer selection: show all 3 picked cards + OK. If tie, repick.
// - First hand has NO PLUCK phase: DEAL -> TRUMP PICK -> PLAY
// - Later hands: DEAL -> PLUCK -> TRUMP PICK -> PLAY
// - AI plays automatically: leader leads, then next, then next (AI2/AI3/YOU depending on leader)
// - YOU must follow suit if possible.
// - Card images optional: if missing, fallback to drawn card faces.
// - Show Ace of Trump in UI (left panel) if trumpAceSlot exists.

(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const on = (el, evt, fn, opt) => el && el.addEventListener(evt, fn, opt || false);
  const log = (...a) => console.log("[Pluck v19]", ...a);

  function setText(el, txt) { if (el) el.textContent = txt; }
  function showMsg(txt) { const el = $("msg"); if (el) el.textContent = txt; }
  function showError(txt) {
    const el = $("msg");
    if (el) el.textContent = "ERROR: " + txt;
    console.error("[Pluck v19 ERROR]", txt);
  }

  window.addEventListener("error", (e) => {
    showError(e?.message || "Unknown script error");
  });

  // Tablet/phone: prove JS is alive + pointer events are reaching the page
  (function tabletDiag(){
    const m = $("msg");
    if (m) m.textContent = "JS OK: game.js loaded.";
    document.addEventListener("pointerdown", (e) => {
      // comment out if you hate the message changing:
      // if (m) m.textContent = "PointerDown: " + (e.target?.className || e.target?.tagName);
    }, { passive: true });
  })();

  // ---------- DOM (required) ----------
  const handEl = $("hand");
  const trickEl = $("trick");
  const resetBtn = $("resetBtn");

  if (!handEl || !trickEl || !resetBtn) {
    showError("Missing required elements. game.html must include id='hand', id='trick', id='resetBtn'.");
    return;
  }

  // ---------- DOM (optional) ----------
  const ai2HandEl = $("ai2Hand");
  const ai3HandEl = $("ai3Hand");

  const phaseLabelEl = $("phaseLabel");
  const trumpLabelEl = $("trumpLabel");
  const trumpOpenLabelEl = $("trumpOpenLabel");
  const turnBannerEl = $("turnBanner");

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
  const pluckStatusEl = $("pluckStatus");  const trumpLabelEl = $("trumpLabel");
  const trumpOpenLabelEl = $("trumpOpenLabel");
  const turnBannerEl = $("turnBanner");

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

  const aceTrumpSlotEl = $("aceTrumpSlot"); // optional place to show Ace-of-trump card face

  // Dealer pick panel (optional)
  const dealerPickPanelEl = $("dealerPickPanel");
  const dealerPickStatusEl = $("dealerPickStatus");
  const dealerPickCardsEl = $("dealerPickCards");
  const dealerPickDrawBtn = $("dealerPickDrawBtn");
  const dealerPickOkBtn = $("dealerPickOkBtn");

  // ---------- constants ----------
  const TOTAL_TRICKS = 17;

  const SUITS = ["S", "H", "D", "C"];
  const RANKS_NO_2 = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const RANK_VALUE = {
    "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
    "J": 11, "Q": 12, "K": 13, "A": 14, "2": 2
  };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C"; // must lead trick 1 if you have it

  // Image settings: will fallback automatically if missing
  const CARD_IMG_DIR = "assets/cards";

  function suitName(s) {
    return s === "S" ? "Spades" : s === "H" ? "Hearts" : s === "D" ? "Diamonds" : "Clubs";
  }
  function suitSymbol(s) {
    return s === "S" ? "♠" : s === "H" ? "♥" : s === "D" ? "♦" : "♣";
  }
  function isRedSuit(s) {
    return s === "H" || s === "D";
  }
  function isJoker(cs) {
    return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER;
  }

  // Speed
  const AI_DELAY_MS = 350;
  const TRICK_RESOLVE_MS = 350;
  const BETWEEN_TRICKS_MS = 260;

  // ---------- deck ----------
  function makePluckDeck51() {
    const deck = [];
    for (const s of SUITS) for (const r of RANKS_NO_2) deck.push(r + s);
    deck.push(CARD_OPEN_LEAD);
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
    if (cs === CARD_BIG_JOKER) return { kind: "JOKER", value: 1000, suit: null, rank: "BJ" };
    if (cs === CARD_LITTLE_JOKER) return { kind: "JOKER", value: 900, suit: null, rank: "LJ" };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length - 1);
    return { kind: "NORMAL", suit, rank, value: RANK_VALUE[rank] || 0 };
  }

  // During PLAY, jokers behave as trump suit.
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
    { id: "AI2", name: "Player 2 (AI)", hand: [], tricks: 0, quota: 7, plucksEarned: 0, plucksSuffered: 0 },
    { id: "AI3", name: "Player 3 (AI)", hand: [], tricks: 0, quota: 6, plucksEarned: 0, plucksSuffered: 0 },
    { id: "YOU", name: "You", hand: [], tricks: 0, quota: 4, plucksEarned: 0, plucksSuffered: 0 },
  ];

  function leftOf(i) { return (i + 1) % 3; }
  function rightOf(i) { return (i + 2) % 3; }

  let dealerIndex = 0; // will be set by dealer-pick
  let handCount = 0;   // first hand = 0 => no pluck phase

  function rotateDealerAndApplyQuotas() {
    // dealer rotates RIGHT each deal after a completed hand
    dealerIndex = rightOf(dealerIndex);
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }

  function applyQuotasForCurrentDealer() {
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }

  // ---------- memory (public-only inference) ----------
  let memory = null;
  function resetMemory() {
    memory = {
      played: new Set(),
      voidSuits: [new Set(), new Set(), new Set()], // for follow-suit inference
    };
  }

  // ---------- state ----------
  let phase = "DEAL_PICK"; // DEAL_PICK -> DEAL -> (PLUCK?) -> TRUMP_PICK -> PLAY
  let trumpSuit = null;
  let trumpOpen = false;

  let leaderIndex = 0;
  let turnIndex = 0;
  let leadSuit = null;
  let trick = [];         // [{playerIndex, cardStr}]
  let trickNumber = 1;
  let lockInput = false;

  // pluck queues
  let pendingPluckQueue = [];
  let pluckQueue = [];
  let activePluck = null;
  let pluckSuitUsedByPair = new Map(); // "plucker-pluckee" => Set(suits)

  // ---------- UI phase chips ----------
  function setChipActive(active) {
    const all = [pDeal, pPluck, pTrump, pPlay].filter(Boolean);
    for (const el of all) el.classList.remove("activeChip");
    if (active === "DEAL") pDeal && pDeal.classList.add("activeChip");
    if (active === "PLUCK") pPluck && pPluck.classList.add("activeChip");
    if (active === "TRUMP_PICK") pTrump && pTrump.classList.add("activeChip");
    if (active === "PLAY") pPlay && pPlay.classList.add("activeChip");
  }

  function setPhase(newPhase) {
    phase = newPhase;
    setText(phaseLabelEl, newPhase);

    // show/hide panels safely
    if (pluckPanelEl) pluckPanelEl.style.display = newPhase === "PLUCK" ? "block" : "none";
    if (trumpPanelEl) trumpPanelEl.style.display = newPhase === "TRUMP_PICK" ? "block" : "none";

    if (dealerPickPanelEl) dealerPickPanelEl.style.display = newPhase === "DEAL_PICK" ? "block" : "none";

    if (newPhase === "DEAL" || newPhase === "DEAL_PICK") setChipActive("DEAL");
    if (newPhase === "PLUCK") setChipActive("PLUCK");
    if (newPhase === "TRUMP_PICK") setChipActive("TRUMP_PICK");
    if (newPhase === "PLAY") setChipActive("PLAY");
  }

  // ---------- card faces (image + fallback) ----------
  function makeCardFaceFallback(cardStr, disabled = false) {
    const el = document.createElement("div");
    el.className = "cardFace" + (disabled ? " disabled" : "");
    el.setAttribute("data-card", cardStr);
    el.style.pointerEvents = disabled ? "none" : "auto";

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
    const rank = cardStr.slice(0, cardStr.length - 1);
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

  function makeCardFace(cardStr, disabled = false) {
    // Always create a clickable container; if image missing it swaps to fallback.
    const el = document.createElement("div");
    el.className = "cardFace" + (disabled ? " disabled" : "");
    el.setAttribute("data-card", cardStr);
    el.style.padding = "0";
    el.style.overflow = "hidden";
    el.style.pointerEvents = disabled ? "none" : "auto";

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

  // ---------- sorting ----------
  function sortHandForDisplay(hand) {
    // After trump picked: show BJ, LJ first, then trump suit group, then rest. Within suit: A,K,Q,J,10..3.
    const suitOrder = ["S", "H", "D", "C"];
    const rankOrder = { "A": 14, "K": 13, "Q": 12, "J": 11, "10": 10, "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2 };

    function suitGroup(s) {
      if (trumpSuit && s === trumpSuit) return 0;
      if (trumpSuit) {
        const after = suitOrder.filter(x => x !== trumpSuit);
        return 1 + after.indexOf(s);
      }
      return suitOrder.indexOf(s);
    }

    function key(cs) {
      if (cs === CARD_BIG_JOKER) return { g: -2, r: 0 };
      if (cs === CARD_LITTLE_JOKER) return { g: -1, r: 0 };
      if (isJoker(cs)) return { g: -1, r: 0 };
      const suit = cs.slice(-1);
      const rank = cs.slice(0, cs.length - 1);
      return { g: suitGroup(suit), r: -(rankOrder[rank] || 0) };
    }

    return hand.slice().sort((a, b) => {
      const ka = key(a), kb = key(b);
      if (ka.g !== kb.g) return ka.g - kb.g;
      return ka.r - kb.r;
    });
  }

  // ---------- render ----------
  function renderAceOfTrump() {
    if (!aceTrumpSlotEl) return;
    aceTrumpSlotEl.innerHTML = "";
    if (!trumpSuit) return;
    const ace = "A" + trumpSuit;
    aceTrumpSlotEl.appendChild(makeCardFace(ace, true));
  }

  function renderDealerPick() {
    if (!dealerPickPanelEl) return;

    // If cards container exists, show 3 picked cards
    if (dealerPickCardsEl) dealerPickCardsEl.innerHTML = "";

    // text is set elsewhere
  }

  function render() {
    // top labels
    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not picked)");
    setText(trumpOpenLabelEl, trumpOpen ? "Yes" : "No");

    setText(ai2QuotaEl, String(players[0].quota));
    setText(ai3QuotaEl, String(players[1].quota));
    setText(youQuotaEl, String(players[2].quota));

    setText(ai2TricksEl, String(players[0].tricks));
    setText(ai3TricksEl, String(players[1].tricks));
    setText(youTricksEl, String(players[2].tricks));

    setText(trickNumEl, String(trickNumber));
    setText(trickMaxEl, String(TOTAL_TRICKS));

    if (turnBannerEl) {
      const turnTxt = (phase === "PLAY") ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`) : "—";
      const leadTxt = leadSuit || "(none)";
      turnBannerEl.textContent = `Phase: ${phase} • Dealer: ${players[dealerIndex].id} • ${turnTxt} • Lead Suit: ${leadTxt}`;
    }

    // AI hidden hands (simple backs)
    if (ai2HandEl) ai2HandEl.textContent = players[0].hand.map(() => "🂠").join(" ");
    if (ai3HandEl) ai3HandEl.textContent = players[1].hand.map(() => "🂠").join(" ");

    // your hand
    handEl.innerHTML = "";
    const sorted = sortHandForDisplay(players[2].hand);

    // IMPORTANT: do not use indexOf() for duplicates (we don't have duplicates, but keep robust)
    const playable = (phase === "PLAY" && turnIndex === 2 && !lockInput);

    // legal indexes computed once per render for correct disabling
    const legal = playable ? legalIndexesFor(2) : [];

    sorted.forEach((cardStr) => {
      const realIdx = players[2].hand.findIndex(c => c === cardStr); // ok (no duplicates in deck)
      const disabled = !playable || (legal.length && !legal.includes(realIdx));

      const face = makeCardFace(cardStr, disabled);

      // make sure click can fire even if CSS overlays exist:
      face.style.position = "relative";
      face.style.zIndex = "5";

      face.onclick = () => {
        if (!playable) return;
        if (lockInput) return;

        const legalNow = legalIndexesFor(2);
        if (!legalNow.includes(realIdx)) {
          showMsg(illegalReason(2, cardStr));
          return;
        }
        playCard(2, realIdx);
      };

      handEl.appendChild(face);
    });

    // trick
    trickEl.innerHTML = "";
    if (!trick.length) {
      trickEl.textContent = "(empty)";
    } else {
      trick.forEach((t) => {
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
      });
    }

    // panels
    if (phase === "PLUCK") renderPluckStatus();
    if (phase === "TRUMP_PICK") renderTrumpPickStatus();
    if (phase === "DEAL_PICK") renderDealerPick();

    renderAceOfTrump();
  }

  // ---------- legality ----------
  function hasNonTrump(pi) {
    return players[pi].hand.some(c => !isTrumpCard(c, trumpSuit));
  }

  function illegalReason(pi, cardStr) {
    // first trick, first lead: must lead 2C if you have it
    if (trickNumber === 1 && trick.length === 0 && players[pi].hand.includes(CARD_OPEN_LEAD)) {
      if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
    }

    // follow suit rule
    if (trick.length > 0) {
      const mustSuit = leadSuit;
      const hasSuit = players[pi].hand.some(c => cardSuitForFollow(c, trumpSuit) === mustSuit);
      if (hasSuit && cardSuitForFollow(cardStr, trumpSuit) !== mustSuit) {
        return `You must follow suit: ${mustSuit}.`;
      }
    }

    // trump-open rule (your rule: no leading trump until opened)
    if (trick.length === 0 && !trumpOpen && trumpSuit && trumpSuit !== "C") {
      if (isTrumpCard(cardStr, trumpSuit) && hasNonTrump(pi)) {
        return "Trump not open. Lead a non-trump card.";
      }
    }

    return "That play is not allowed.";
  }

  function legalIndexesFor(pi) {
    const hand = players[pi].hand;

    // 2C must lead trick 1 if holder is leading
    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
      return hand.map((c, i) => ({ c, i })).filter(x => x.c === CARD_OPEN_LEAD).map(x => x.i);
    }

    // if following suit
    if (trick.length > 0) {
      const suited = hand.map((c, i) => ({ c, i }))
        .filter(x => cardSuitForFollow(x.c, trumpSuit) === leadSuit)
        .map(x => x.i);
      return suited.length ? suited : hand.map((_, i) => i);
    }

    // leading: if trump not open, forbid leading trump when you have non-trump (unless trump is clubs / your existing rule)
    if (trick.length === 0 && trumpSuit && !trumpOpen && trumpSuit !== "C") {
      const nonTrumpIdx = hand.map((c, i) => ({ c, i })).filter(x => !isTrumpCard(x.c, trumpSuit)).map(x => x.i);
      return nonTrumpIdx.length ? nonTrumpIdx : hand.map((_, i) => i);
    }

    return hand.map((_, i) => i);
  }

  // ---------- trick evaluation ----------
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
      let best = trick[0];
      let bestP = -1;
      for (const t of trick) {
        if (!isTrumpCard(t.cardStr, trumpSuit)) continue;
        const p = cardPower(t.cardStr);
        if (p > bestP) { bestP = p; best = t; }
      }
      return best.playerIndex;
    }

    // no trump: highest in lead suit wins
    let best = trick[0];
    let bestV = -1;
    for (const t of trick) {
      if (cardSuitForFollow(t.cardStr, trumpSuit) !== leadSuit) continue;
      const v = parseCard(t.cardStr).value;
      if (v > bestV) { bestV = v; best = t; }
    }
    return best.playerIndex;
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

  // ---------- play card ----------
  function setLeadSuitFromFirstCard(cardStr) {
    leadSuit = cardSuitForFollow(cardStr, trumpSuit);
  }

  function updateTrumpOpen(cardStr) {
    if (!trumpOpen && trumpSuit && isTrumpCard(cardStr, trumpSuit)) trumpOpen = true;
  }

  function playCard(playerIndex, handIdx) {
    const cardStr = players[playerIndex].hand.splice(handIdx, 1)[0];
    if (!cardStr) { showError("Tried to play empty card."); return; }

    if (trick.length === 0) setLeadSuitFromFirstCard(cardStr);

    trick.push({ playerIndex, cardStr });
    updateTrumpOpen(cardStr);

    // advance turn
    turnIndex = (turnIndex + 1) % 3;

    render();
    maybeContinue();
  }

  // ---------- AI: always tries to win ----------
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
    }

    let bestPi = temp[0].playerIndex;
    let bestV = -1;
    for (const t of temp) {
      if (cardSuitForFollow(t.cardStr, trumpSuit) !== leadSuit) continue;
      const v = parseCard(t.cardStr).value;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi === playerIndex;
  }

  function chooseAiIndex(playerIndex) {
    const legal = legalIndexesFor(playerIndex);
    const hand = players[playerIndex].hand;

    // preference:
    // - if following: try to WIN if possible; otherwise dump lowest legal
    // - if leading: lead strong non-trump early, keep jokers until needed (simple but aggressive)

    const leading = trick.length === 0;

    if (!leading) {
      // find a winning card among legal
      let winning = [];
      for (const idx of legal) {
        if (wouldWinIfPlayedNow(playerIndex, hand[idx])) winning.push(idx);
      }
      if (winning.length) {
        // among winners, choose the cheapest winner (so it wins but wastes less)
        winning.sort((a, b) => cardPower(hand[a]) - cardPower(hand[b]));
        return winning[0];
      }
      // can't win: dump lowest power legal
      let best = legal[0];
      for (const idx of legal) {
        if (cardPower(hand[idx]) < cardPower(hand[best])) best = idx;
      }
      return best;
    }

    // leading:
    // if trump not open, avoid leading trump unless forced by legality
    const candidates = legal.slice();

    // "aggressive but not stupid": avoid wasting jokers on lead
    candidates.sort((a, b) => {
      const ca = hand[a], cb = hand[b];
      const ja = isJoker(ca), jb = isJoker(cb);
      if (ja !== jb) return ja ? 1 : -1;
      return cardPower(cb) - cardPower(ca); // lead higher
    });

    return candidates[0];
  }

  // ---------- trick loop ----------
  function startTrickOne() {
    trick = [];
    leadSuit = null;
    trickNumber = 1;

    // trump open rule: your current special case says Clubs is "open"
    trumpOpen = (trumpSuit === "C");

    // who has 2C leads trick 1
    let whoHas2C = 0;
    for (let pi = 0; pi < 3; pi++) {
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
            endHand();
            return;
          }

          // next trick starts with leader's turn (AI may auto-play)
          maybeContinue();
        }, BETWEEN_TRICKS_MS);
      }, TRICK_RESOLVE_MS);

      return;
    }

    // if it's AI's turn, play
    if (turnIndex !== 2) {
      lockInput = true;
      setTimeout(() => {
        const aiIdx = chooseAiIndex(turnIndex);
        lockInput = false;
        playCard(turnIndex, aiIdx);
      }, AI_DELAY_MS);
    } else {
      // your turn: nothing to do, clicks will handle it
      render();
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
    // highest plucksEarned first. Tie-break: dealer, left, right
    const tiebreak = [dealerIndex, leftOf(dealerIndex), rightOf(dealerIndex)];
    const idx = [0, 1, 2];
    idx.sort((a, b) => {
      const da = players[a].plucksEarned;
      const db = players[b].plucksEarned;
      if (db !== da) return db - da;
      return tiebreak.indexOf(a) - tiebreak.indexOf(b);
    });
    return idx.filter(i => players[i].plucksEarned > 0);
  }

  function victimOrder() {
    // highest plucksSuffered first. Tie-break: dealer, left, right
    const tiebreak = [dealerIndex, leftOf(dealerIndex), rightOf(dealerIndex)];
    const idx = [0, 1, 2];
    idx.sort((a, b) => {
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
          .sort((a, b) => (remainingSuffered.get(b) || 0) - (remainingSuffered.get(a) || 0))[0];

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
    cards.sort((a, b) => (RANK_VALUE[a.slice(0, -1)] || 0) - (RANK_VALUE[b.slice(0, -1)] || 0));
    return cards[0];
  }

  function highestOfSuitNonJoker(playerIndex, suit) {
    const cards = players[playerIndex].hand.filter(c => !isJoker(c) && c.slice(-1) === suit);
    if (!cards.length) return null;
    cards.sort((a, b) => (RANK_VALUE[b.slice(0, -1)] || 0) - (RANK_VALUE[a.slice(0, -1)] || 0));
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
    if (!giveLow) return { ok: false, reason: `Plucker has no ${suit}.` };

    const takeHigh = highestOfSuitNonJoker(pluckeeI, suit);
    if (!takeHigh) return { ok: false, reason: `Victim has no ${suit} to return.` };

    removeCardFromHand(pluckerI, giveLow);
    removeCardFromHand(pluckeeI, takeHigh);

    players[pluckerI].hand.push(takeHigh);
    players[pluckeeI].hand.push(giveLow);

    markPluckSuitUsed(pluckerI, pluckeeI, suit);

    return { ok: true, giveLow, takeHigh };
  }

  function clearPluckChoices() {
    if (pluckChoicesEl) pluckChoicesEl.innerHTML = "";
  }

  function renderPluckStatus() {
    if (!pluckStatusEl || !pluckNextBtn) return;
    clearPluckChoices();

    if (!pluckQueue.length) {
      pluckStatusEl.textContent = "No plucks to process.";
      pluckNextBtn.disabled = true;
      return;
    }

    if (!activePluck) activePluck = pluckQueue[0];

    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;

    const suits = availablePluckSuits(pluckerI, pluckeeI);

    // YOU pluck: show suit buttons (wrong suit attempt = LOST)
    if (pluckerI === 2 && pluckChoicesEl) {
      pluckNextBtn.disabled = true;

      if (!suits.length) {
        pluckStatusEl.textContent = `You are plucking ${players[pluckeeI].name}, but have no suit to attempt. Skipping.`;
        return;
      }

      pluckStatusEl.textContent = `You are plucking ${players[pluckeeI].name}. Choose a suit. Wrong suit attempt = pluck LOST.`;

      suits.forEach((s) => {
        const give = lowestOfSuitNonJoker(pluckerI, s);

        const btn = document.createElement("button");
        btn.className = "btn";
        btn.textContent = `${s} (${suitName(s)}) • Give: ${give || "(none)"}`;

        btn.onclick = () => {
          const res = attemptPluck(pluckerI, pluckeeI, s);

          if (!res.ok) {
            markPluckSuitUsed(pluckerI, pluckeeI, s);
            pluckStatusEl.textContent = `You attempted ${s} and FAILED (${res.reason}). Pluck is LOST.`;
          } else {
            pluckStatusEl.textContent = `You plucked ${s}: gave ${res.giveLow}, received ${res.takeHigh}.`;
          }

          pluckQueue.shift();
          activePluck = null;

          if (!pluckQueue.length) moveToTrumpPick();
          render();
        };

        pluckChoicesEl.appendChild(btn);
      });

      return;
    }

    // AI pluck
    pluckNextBtn.disabled = false;
    if (!suits.length) {
      pluckStatusEl.textContent = `${players[pluckerI].name} is plucking ${players[pluckeeI].name}, but has no suit to attempt. Skipping.`;
    } else {
      pluckStatusEl.textContent = `${players[pluckerI].name} is plucking ${players[pluckeeI].name}. Click "Run Next Pluck".`;
    }
  }

  function runOnePluck() {
    if (phase !== "PLUCK") return;
    if (!pluckQueue.length) return;

    if (!activePluck) activePluck = pluckQueue[0];

    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;

    // YOU must click suit buttons
    if (pluckerI === 2) {
      render();
      return;
    }

    const candidates = availablePluckSuits(pluckerI, pluckeeI);
    if (!candidates.length) {
      if (pluckStatusEl) pluckStatusEl.textContent = `No available suit for ${players[pluckerI].name} → ${players[pluckeeI].name}. Skipped.`;
      pluckQueue.shift();
      activePluck = null;
      if (!pluckQueue.length) moveToTrumpPick();
      render();
      return;
    }

    // AI blind: choose suit that gives lowest card (cheap)
    candidates.sort((a, b) => {
      const la = lowestOfSuitNonJoker(pluckerI, a);
      const lb = lowestOfSuitNonJoker(pluckerI, b);
      const va = la ? (RANK_VALUE[la.slice(0, -1)] || 99) : 99;
      const vb = lb ? (RANK_VALUE[lb.slice(0, -1)] || 99) : 99;
      return va - vb;
    });

    const pick = candidates[0];
    const res = attemptPluck(pluckerI, pluckeeI, pick);

    if (pluckStatusEl) {
      if (!res.ok) {
        markPluckSuitUsed(pluckerI, pluckeeI, pick);
        pluckStatusEl.textContent = `${players[pluckerI].name} attempted ${pick} and FAILED (${res.reason}). Pluck is LOST.`;
      } else {
        pluckStatusEl.textContent = `${players[pluckerI].name} plucked ${pick}: gave ${res.giveLow}, received ${res.takeHigh}.`;
      }
    }

    pluckQueue.shift();
    activePluck = null;

    if (!pluckQueue.length) moveToTrumpPick();
    render();
  }

  // ---------- trump pick ----------
  function computeTrumpCallerIndex() {
    // "Most books to make" = highest quota (7)
    let best = 0;
    for (let i = 1; i < 3; i++) if (players[i].quota > players[best].quota) best = i;
    return best;
  }

  function aiChooseTrumpFromOwnHand(aiIndex) {
    const hand = players[aiIndex].hand;
    const suitScore = { S: 0, H: 0, D: 0, C: 0 };

    for (const cs of hand) {
      if (isJoker(cs)) {
        suitScore.S += 6; suitScore.H += 6; suitScore.D += 6; suitScore.C += 6;
        continue;
      }
      const suit = cs.slice(-1);
      const rank = cs.slice(0, cs.length - 1);
      const v = RANK_VALUE[rank] || 0;

      suitScore[suit] += 2; // length weight
      if (v >= 11) suitScore[suit] += (v - 10) * 2; // honors
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
    // keep your existing special behavior: clubs considered open by default
    trumpOpen = (trumpSuit === "C");
    renderAceOfTrump();
  }

  function renderTrumpPickStatus() {
    if (!trumpStatusEl) return;

    if (trumpSuit) {
      trumpStatusEl.textContent = `Trump picked: ${trumpSuit} (${suitName(trumpSuit)}).`;
      return;
    }

    const callerIndex = computeTrumpCallerIndex();
    const caller = players[callerIndex];

    if (callerIndex === 2) {
      trumpStatusEl.textContent = `You have the most books to make (quota ${caller.quota}). Pick trump now.`;
    } else {
      trumpStatusEl.textContent = `${caller.name} selects trump (quota ${caller.quota}).`;
    }
  }

  function wireTrumpButtons() {
    if (!trumpPanelEl) return;
    const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
    btns.forEach((b) => {
      b.onclick = () => {
        if (phase !== "TRUMP_PICK") return;
        if (trumpSuit) return;

        // allow YOU to pick if you are caller; otherwise ignore click
        const callerIndex = computeTrumpCallerIndex();
        if (callerIndex !== 2) return;

        const suit = b.getAttribute("data-trump");
        if (!SUITS.includes(suit)) return;

        setTrump(suit);
        showMsg(`You picked trump: ${suit} (${suitName(suit)}).`);
        moveToPlay();
        render();
      };
    });
  }

  // ---------- flow ----------
  function dealNewHands() {
    resetMemory();

    // reset per-hand
    players.forEach(p => {
      p.hand = [];
      p.tricks = 0;
      p.plucksEarned = 0;
      p.plucksSuffered = 0;
    });

    trickNumber = 1;
    trick = [];
    leadSuit = null;

    trumpSuit = null;
    trumpOpen = false;

    activePluck = null;
    pluckSuitUsedByPair = new Map();

    const deck = shuffle(makePluckDeck51());

    for (let i = 0; i < TOTAL_TRICKS; i++) {
      players[0].hand.push(deck.pop());
      players[1].hand.push(deck.pop());
      players[2].hand.push(deck.pop());
    }

    // leader will be set at startTrickOne after trump selection
    leaderIndex = 0;
    turnIndex = 0;
  }

  function startHandAfterDeal() {
    // first hand has NO pluck phase
    if (handCount === 0) {
      showMsg("First hand: no plucks. Dealer selects trump.");
      moveToTrumpPick();
      render();
      return;
    }

    // later hands: use pending plucks from last hand
    pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
    pendingPluckQueue = [];

    if (!pluckQueue.length) {
      showMsg("No plucks this hand. Dealer selects trump.");
      moveToTrumpPick();
      render();
      return;
    }

    showMsg("Pluck phase begins (manual).");
    setPhase("PLUCK");
    render();
  }

  function moveToTrumpPick() {
    setPhase("TRUMP_PICK");
    renderTrumpPickStatus();
    render();

    const callerIndex = computeTrumpCallerIndex();
    if (callerIndex !== 2) {
      const s = aiChooseTrumpFromOwnHand(callerIndex);
      setTrump(s);
      showMsg(`${players[callerIndex].name} picked trump: ${s} (${suitName(s)}).`);
      moveToPlay();
    } else {
      showMsg("Pick trump now.");
    }
    render();
  }

  function moveToPlay() {
    setPhase("PLAY");
    showMsg("Trump set. Trick 1 begins.");
    startTrickOne();
  }

  function endHand() {
    // compute plucks for NEXT hand
    computePlucksEarnedAndSuffered();
    pendingPluckQueue = buildPluckQueueFromScores();

    handCount += 1;

    showMsg("Hand over. Click Reset (New Deal) for next hand.");
    render();
  }

  // ---------- dealer pick (first load) ----------
  function cardPickValue(cs) {
    // Lower card = lower value. Jokers treated high so they won't win "lowest deals".
    if (cs === CARD_BIG_JOKER) return 1000;
    if (cs === CARD_LITTLE_JOKER) return 900;
    const c = parseCard(cs);
    // rank primary, suit secondary (S < H < D < C) just to break non-ties cleanly
    const suitOrder = { S: 1, H: 2, D: 3, C: 4 };
    return (c.value * 10) + (suitOrder[c.suit] || 9);
  }

  let pickCards = null; // {AI2:'', AI3:'', YOU:''}
  let pickedDealerIndex = null;

  function doDealerPick() {
    // Pick from a fresh deck; show all 3 cards
    const deck = shuffle(makePluckDeck51().slice());

    const c0 = deck.pop();
    const c1 = deck.pop();
    const c2 = deck.pop();

    // tie check by exact value
    const v0 = cardPickValue(c0);
    const v1 = cardPickValue(c1);
    const v2 = cardPickValue(c2);

    // If any tie on value, repick
    if (v0 === v1 || v0 === v2 || v1 === v2) {
      pickCards = null;
      pickedDealerIndex = null;
      setText(dealerPickStatusEl, "Tie on initial pick — repacking and picking again. Click Draw again.");
      if (dealerPickCardsEl) dealerPickCardsEl.innerHTML = "";
      if (dealerPickOkBtn) dealerPickOkBtn.disabled = true;
      return;
    }

    pickCards = { AI2: c0, AI3: c1, YOU: c2 };

    // lowest deals
    const vals = [
      { pi: 0, v: v0, c: c0 },
      { pi: 1, v: v1, c: c1 },
      { pi: 2, v: v2, c: c2 },
    ].sort((a, b) => a.v - b.v);

    pickedDealerIndex = vals[0].pi;

    if (dealerPickCardsEl) {
      dealerPickCardsEl.innerHTML = "";
      // show all 3
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "12px";
      row.style.flexWrap = "wrap";
      row.style.alignItems = "center";

      const makePickCol = (label, card) => {
        const col = document.createElement("div");
        col.style.display = "flex";
        col.style.flexDirection = "column";
        col.style.alignItems = "center";
        col.style.gap = "6px";
        const t = document.createElement("div");
        t.style.color = "#a6b0c3";
        t.style.fontSize = "12px";
        t.textContent = label;
        col.appendChild(t);
        col.appendChild(makeCardFace(card, true));
        return col;
      };

      row.appendChild(makePickCol("AI2", c0));
      row.appendChild(makePickCol("AI3", c1));
      row.appendChild(makePickCol("YOU", c2));

      dealerPickCardsEl.appendChild(row);
    }

    setText(
      dealerPickStatusEl,
      `Initial pick complete. Lowest card deals: ${players[pickedDealerIndex].id}. Click OK to start.`
    );

    if (dealerPickOkBtn) dealerPickOkBtn.disabled = false;
  }

  function acceptDealerPickAndStart() {
    if (pickedDealerIndex === null) {
      setText(dealerPickStatusEl, "Click Draw first to pick dealer.");
      return;
    }

    dealerIndex = pickedDealerIndex;
    applyQuotasForCurrentDealer();

    // Start first hand (no pluck)
    setPhase("DEAL");
    dealNewHands();
    showMsg(`Dealer: ${players[dealerIndex].id}. First hand: Dealer selects trump.`);
    // go to trump pick immediately
    moveToTrumpPick();
  }

  // ---------- events ----------
  on(pluckNextBtn, "click", runOnePluck);

  on(resetBtn, "click", () => {
    // Reset = start next hand
    // rotate dealer each new deal AFTER the first hand starts (handCount>=1)
    // BUT you told me you want dealer rotating from the very first deal conceptually;
    // we already chose dealer by pick, so rotation starts after each completed hand.
    rotateDealerAndApplyQuotas();

    setPhase("DEAL");
    dealNewHands();
    showMsg(`New deal. Dealer: ${players[dealerIndex].id}.`);
    startHandAfterDeal();
    render();
  });

  on(dealerPickDrawBtn, "click", () => doDealerPick());
  on(dealerPickOkBtn, "click", () => acceptDealerPickAndStart());

  wireTrumpButtons();

  // ---------- boot ----------
  function boot() {
    // Start at dealer pick (if panel exists). If not, fallback to simple start.
    if (dealerPickPanelEl) {
      setPhase("DEAL_PICK");
      if (dealerPickOkBtn) dealerPickOkBtn.disabled = true;
      setText(dealerPickStatusEl, "Click Draw to pick dealer (lowest card deals). If tie, repack.");
      render();
      return;
    }

    // fallback: random dealer if no dealer-pick UI
    dealerIndex = Math.floor(Math.random() * 3);
    applyQuotasForCurrentDealer();

    setPhase("DEAL");
    dealNewHands();
    showMsg(`Dealer (random): ${players[dealerIndex].id}. First hand: Dealer selects trump.`);
    moveToTrumpPick();
    render();
  }

  boot();
  log("Loaded.");
