// Pluck Web Demo v20 (single-file replacement)
// Works with the game.html you pasted (IDs must match).
//
// Fixes:
// - Cards reliably clickable on tablet + desktop (pointerup + click fallback)
// - Initial Pick: show all 3 cards, tie => repick, OK => start
// - Hand 1: NO PLUCK phase (Deal -> Dealer Selects Trump -> Play)
// - Hand 2+: Deal -> Pluck -> Dealer Selects Trump -> Play
// - Follow suit enforced
// - "Spades-like" rule: cannot LEAD trump until trump is open, unless you only have trump
// - Shows Ace of Trump in #trumpAceSlot (if present)

(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const setText = (el, t) => { if (el) el.textContent = t; };
  const showMsg = (t) => setText($("msg"), t);
  const log = (...a) => console.log("[Pluck v20]", ...a);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  window.addEventListener("error", (e) => {
    const m = e?.message || "Unknown error";
    showMsg("ERROR: " + m);
    console.error("[Pluck v20 ERROR]", e);
  });

  // ---------- DOM (required) ----------
  const handEl = $("hand");
  const trickEl = $("trick");
  const resetBtn = $("resetBtn");
  if (!handEl || !trickEl || !resetBtn) {
    showMsg("ERROR: Missing required elements (hand, trick, resetBtn).");
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
  const pluckStatusEl = $("pluckStatus");
  const pluckChoicesEl = $("pluckChoices");
  const pluckNextBtn = $("pluckNextBtn");

  const trumpPanelEl = $("trumpPanel");
  const trumpStatusEl = $("trumpStatus");

  const dealerLabelEl = $("dealerLabel");
  const dealerBannerEl = $("dealerBanner");

  // Initial pick UI
  const pickBtn = $("pickBtn");
  const pickOkBtn = $("pickOkBtn");
  const pickReBtn = $("pickReBtn");
  const pickStatusEl = $("pickStatus");
  const pickAI2El = $("pickAI2");
  const pickAI3El = $("pickAI3");
  const pickYOUEl = $("pickYOU");

  // Trump ace slot (left panel)
  const trumpAceSlotEl = $("trumpAceSlot");

  // ---------- game constants ----------
  const TOTAL_TRICKS = 17;
  const SUITS = ["S", "H", "D", "C"];
  const SUIT_NAME = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };
  const SUIT_SYMBOL = { S: "♠", H: "♥", D: "♦", C: "♣" };
  const isRedSuit = (s) => s === "H" || s === "D";

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C"; // Trick 1 must be led by 2♣ (if you keep this rule)

  const RANKS = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  // initial pick uses a simple "lowest wins" rank system
  // jokers treated as HIGH so they won’t usually become "lowest"
  const PICK_RANK_ORDER = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
  const pickRankValue = (r) => {
    const idx = PICK_RANK_ORDER.indexOf(r);
    return idx >= 0 ? idx : 999;
  };

  // timing
  const AI_DELAY_MS = 350;
  const RESOLVE_DELAY_MS = 350;
  const BETWEEN_TRICKS_MS = 250;

  // ---------- deck ----------
  function makePluckDeck51() {
    // 3..A in 4 suits (48) + 2C (1) + BJ + LJ (2) = 51
    const deck = [];
    for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
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

  function isJoker(cs) {
    return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER;
  }

  function cardSuit(cs, trumpSuit) {
    if (isJoker(cs)) return trumpSuit || null;
    return cs.slice(-1);
  }

  function cardRank(cs) {
    if (isJoker(cs)) return null;
    return cs.slice(0, cs.length - 1);
  }

  function isTrump(cs, trumpSuit) {
    if (!trumpSuit) return false;
    if (isJoker(cs)) return true;
    return cs.slice(-1) === trumpSuit;
  }

  function cardPower(cs, trumpSuit) {
    // jokers highest, then trump, then lead suit
    if (cs === CARD_BIG_JOKER) return 1000000;
    if (cs === CARD_LITTLE_JOKER) return 900000;

    const r = cardRank(cs);
    const v = RANK_VALUE[r] || 0;
    if (isTrump(cs, trumpSuit)) return 10000 + v;
    return v;
  }

  // ---------- UI: card face (no images; reliable taps) ----------
  function makeCardFace(cardStr, disabled) {
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

    const s = cardStr.slice(-1);
    const r = cardStr.slice(0, cardStr.length - 1);
    const colorClass = isRedSuit(s) ? "red" : "black";
    const sym = SUIT_SYMBOL[s];

    const tl = document.createElement("div");
    tl.className = `corner tl ${colorClass}`;
    tl.innerHTML = `${r}<br>${sym}`;

    const br = document.createElement("div");
    br.className = `corner br ${colorClass}`;
    br.innerHTML = `${r}<br>${sym}`;

    const mid = document.createElement("div");
    mid.className = `suitBig ${colorClass}`;
    mid.textContent = sym;

    el.appendChild(tl); el.appendChild(br); el.appendChild(mid);
    return el;
  }

  // Put a single card face inside a slot element
  function renderCardIntoSlot(slotEl, cardStr) {
    if (!slotEl) return;
    slotEl.innerHTML = "";
    if (!cardStr) { slotEl.textContent = "(none)"; return; }
    const face = makeCardFace(cardStr, true);
    face.style.cursor = "default";
    slotEl.appendChild(face);
  }

  // ---------- players ----------
  // 0=AI2, 1=AI3, 2=YOU
  const players = [
    { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7 },
    { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6 },
    { id:"YOU", name:"You",            hand:[], tricks:0, quota:4 }
  ];
  const leftOf = (i) => (i + 1) % 3;
  const rightOf = (i) => (i + 2) % 3;

  // dealer/quota rotation happens AFTER each hand (you wanted rotating quotas)
  let dealerIndex = 0;

  function applyQuotasFromDealer() {
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }

  // ---------- state ----------
  // Phases:
  // PICK_DEALER (before first hand)
  // DEAL
  // PLUCK
  // TRUMP_PICK
  // PLAY
  let phase = "PICK_DEALER";

  // important: first completed hand flips this so pluck exists from then on
  let firstHandCompleted = false;

  let deck = [];
  let trumpSuit = null;
  let trumpOpen = false;

  let trickNumber = 0;
  let leadSuit = null;
  let trick = []; // { playerIndex, cardStr }
  let leaderIndex = 0;
  let turnIndex = 0;

  let lockInput = false;

  // pluck queue for NEXT hand (computed after a hand ends)
  let pendingPlucks = [];
  let pluckQueue = [];
  let activePluck = null;
  let pluckSuitUsedByPair = new Map(); // "plucker-pluckee" => Set(suits)

  // initial pick cards
  let pickCards = { 0:null, 1:null, 2:null };
  let pickDealerResolved = false;

  // ---------- phase UI ----------
  function setPhase(newPhase) {
    phase = newPhase;
    setText(phaseLabelEl, newPhase);

    // chips highlight
    [pDeal,pPluck,pTrump,pPlay].forEach(ch => ch && ch.classList.remove("activeChip"));
    if (newPhase === "DEAL") pDeal && pDeal.classList.add("activeChip");
    if (newPhase === "PLUCK") pPluck && pPluck.classList.add("activeChip");
    if (newPhase === "TRUMP_PICK") pTrump && pTrump.classList.add("activeChip");
    if (newPhase === "PLAY") pPlay && pPlay.classList.add("activeChip");

    // panels show/hide
    if (pluckPanelEl) pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
    if (trumpPanelEl) trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";
  }

  function renderTopMeta() {
    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${SUIT_NAME[trumpSuit]})` : "(not picked)");
    setText(trumpOpenLabelEl, trumpOpen ? "Yes" : "No");

    setText(ai2QuotaEl, String(players[0].quota));
    setText(ai3QuotaEl, String(players[1].quota));
    setText(youQuotaEl, String(players[2].quota));

    setText(ai2TricksEl, String(players[0].tricks));
    setText(ai3TricksEl, String(players[1].tricks));
    setText(youTricksEl, String(players[2].tricks));

    setText(trickNumEl, String(trickNumber));
    setText(trickMaxEl, String(TOTAL_TRICKS));

    setText(dealerLabelEl, players[dealerIndex]?.id || "(not set)");
    setText(dealerBannerEl, players[dealerIndex]?.id || "(not set)");

    if (turnBannerEl) {
      const who = (phase === "PLAY") ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`) : "—";
      const lead = (phase === "PLAY") ? players[leaderIndex].id : "—";
      setText(turnBannerEl, `Phase: ${phase} • Dealer: ${players[dealerIndex].id} • Lead: ${lead} • ${who} • Trump: ${trumpSuit || "(none)"} • Trump Open: ${trumpOpen ? "Yes" : "No"}`);
    }
  }

  // ---------- sorting your hand ----------
  function sortHandForDisplay(hand) {
    // group by suit, and within suit: BJ, LJ then A,K,Q,J,10..3,2
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
      const s = cs.slice(-1);
      const r = cs.slice(0, cs.length-1);
      const sg = suitGroup(s);
      const rv = rankOrder[r] ?? 0;
      return { sg, r: (100 - rv) };
    }

    return hand.slice().sort((a,b)=>{
      const ka=key(a), kb=key(b);
      if (ka.sg !== kb.sg) return ka.sg - kb.sg;
      return ka.r - kb.r;
    });
  }

  // ---------- legal play rules ----------
  function hasNonTrump(playerIndex) {
    return players[playerIndex].hand.some(c => !isTrump(c, trumpSuit));
  }

  function legalIndexesFor(playerIndex) {
    const hand = players[playerIndex].hand;

    // Trick 1 lead must be 2C if you have it
    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
      return hand.map((c,i)=>({c,i})).filter(x=>x.c === CARD_OPEN_LEAD).map(x=>x.i);
    }

    // Leading (no cards in trick)
    if (trick.length === 0) {
      // Spades-like rule: cannot lead trump until trump open, unless only trump left
      if (trumpSuit && !trumpOpen) {
        const nonTrumpIdx = hand.map((c,i)=>({c,i})).filter(x => !isTrump(x.c, trumpSuit)).map(x=>x.i);
        if (nonTrumpIdx.length > 0) return nonTrumpIdx;
      }
      return hand.map((_,i)=>i);
    }

    // Following: must follow suit if possible
    const mustSuit = leadSuit;
    const suited = hand
      .map((c,i)=>({c,i}))
      .filter(x => cardSuit(x.c, trumpSuit) === mustSuit)
      .map(x=>x.i);

    return suited.length ? suited : hand.map((_,i)=>i);
  }

  function illegalReason(playerIndex, cardStr) {
    const hand = players[playerIndex].hand;

    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD) && cardStr !== CARD_OPEN_LEAD) {
      return "First lead must be 2C.";
    }

    if (trick.length === 0 && trumpSuit && !trumpOpen) {
      if (isTrump(cardStr, trumpSuit) && hasNonTrump(playerIndex)) {
        return "Trump not open. Lead a non-trump card.";
      }
    }

    if (trick.length > 0) {
      const mustSuit = leadSuit;
      const hasSuit = hand.some(c => cardSuit(c, trumpSuit) === mustSuit);
      if (hasSuit && cardSuit(cardStr, trumpSuit) !== mustSuit) {
        return `You must follow suit: ${mustSuit}.`;
      }
    }

    return "That play is not allowed.";
  }

  function updateTrumpOpenIfNeeded(cardStr) {
    if (!trumpSuit) return;
    if (!trumpOpen && isTrump(cardStr, trumpSuit)) trumpOpen = true;
  }

  function evaluateTrickWinner() {
    const anyTrump = trick.some(t => isTrump(t.cardStr, trumpSuit));

    if (anyTrump) {
      let bestPi = trick[0].playerIndex;
      let bestP = -1;
      for (const t of trick) {
        if (!isTrump(t.cardStr, trumpSuit)) continue;
        const p = cardPower(t.cardStr, trumpSuit);
        if (p > bestP) { bestP = p; bestPi = t.playerIndex; }
      }
      return bestPi;
    }

    // no trump: highest of lead suit
    let bestPi = trick[0].playerIndex;
    let bestV = -1;
    for (const t of trick) {
      if (cardSuit(t.cardStr, trumpSuit) !== leadSuit) continue;
      const r = cardRank(t.cardStr);
      const v = RANK_VALUE[r] || 0;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi;
  }

  // ---------- render hand + trick ----------
  function renderHand() {
    handEl.innerHTML = "";
    const sorted = sortHandForDisplay(players[2].hand);

    const isYourTurn = (phase === "PLAY" && turnIndex === 2);
    const legal = isYourTurn ? legalIndexesFor(2) : [];

    for (const c of sorted) {
      const realIdx = players[2].hand.indexOf(c);
      const disabled = !isYourTurn || !legal.includes(realIdx) || lockInput;

      const face = makeCardFace(c, disabled);

      // VERY IMPORTANT: pointerup works better on tablets than click
      const playThis = (ev) => {
        ev && ev.preventDefault && ev.preventDefault();
        ev && ev.stopPropagation && ev.stopPropagation();

        if (disabled) return;
        if (phase !== "PLAY") return;
        if (turnIndex !== 2) return;
        if (lockInput) return;

        const legalNow = legalIndexesFor(2);
        if (!legalNow.includes(realIdx)) {
          showMsg(illegalReason(2, c));
          return;
        }
        playCard(2, realIdx);
      };

      face.addEventListener("pointerup", playThis, { passive:false });
      face.addEventListener("click", playThis, { passive:false });

      handEl.appendChild(face);
    }
  }

  function renderTrick() {
    trickEl.innerHTML = "";
    if (!trick.length) {
      trickEl.textContent = "(empty)";
      return;
    }
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

  function renderAIsHiddenHands() {
    if (ai2HandEl) ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
    if (ai3HandEl) ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");
  }

  function render() {
    renderTopMeta();
    renderHand();
    renderTrick();
    renderAIsHiddenHands();
    if (phase === "PLUCK") renderPluckStatus();
    if (phase === "TRUMP_PICK") renderTrumpPickStatus();
  }

  // ---------- initial pick ----------
  function pickCardOne() {
    // Use a shuffled copy of the deck to draw 3 visible cards
    const d = shuffle(makePluckDeck51().slice());
    // avoid jokers for pick if you want it cleaner
    const draw = () => {
      let c;
      do { c = d.pop(); } while (isJoker(c));
      return c;
    };
    return { a: draw(), b: draw(), c: draw() };
  }

  function pickValue(cardStr) {
    // lower value = "lower card"
    // For pick: compare by rank, then suit.
    const s = cardStr.slice(-1);
    const r = cardStr.slice(0, cardStr.length - 1);
    const rv = pickRankValue(r); // A high (0), 2 low (12)
    const sv = { C:0, D:1, H:2, S:3 }[s] ?? 9;
    return rv * 10 + sv;
  }

  function doPick() {
    const drawn = pickCardOne();
    pickCards[0] = drawn.a;
    pickCards[1] = drawn.b;
    pickCards[2] = drawn.c;

    renderCardIntoSlot(pickAI2El, pickCards[0]);
    renderCardIntoSlot(pickAI3El, pickCards[1]);
    renderCardIntoSlot(pickYOUEl, pickCards[2]);

    // determine lowest
    const vals = [
      { pi:0, v: pickValue(pickCards[0]) },
      { pi:1, v: pickValue(pickCards[1]) },
      { pi:2, v: pickValue(pickCards[2]) }
    ].sort((x,y)=> x.v - y.v);

    const lowestV = vals[0].v;
    const tied = vals.filter(x => x.v === lowestV);

    pickDealerResolved = false;

    if (tied.length > 1) {
      setText(pickStatusEl, "Tie for lowest. Click Re-Pick.");
      if (pickOkBtn) pickOkBtn.disabled = true;
      if (pickReBtn) pickReBtn.disabled = false;
      setText(dealerLabelEl, "(tie - repick)");
      setText(dealerBannerEl, "(tie - repick)");
      return;
    }

    dealerIndex = vals[0].pi;
    applyQuotasFromDealer();

    pickDealerResolved = true;
    setText(pickStatusEl, `Dealer is ${players[dealerIndex].id}. Click OK.`);
    if (pickOkBtn) pickOkBtn.disabled = false;
    if (pickReBtn) pickReBtn.disabled = true;

    setText(dealerLabelEl, players[dealerIndex].id);
    setText(dealerBannerEl, players[dealerIndex].id);
    render();
  }

  function resetPickUI() {
    pickCards = { 0:null, 1:null, 2:null };
    pickDealerResolved = false;
    renderCardIntoSlot(pickAI2El, null);
    renderCardIntoSlot(pickAI3El, null);
    renderCardIntoSlot(pickYOUEl, null);
    setText(pickStatusEl, "Click “Pick Cards”.");
    if (pickOkBtn) pickOkBtn.disabled = true;
    if (pickReBtn) pickReBtn.disabled = true;
  }

  // ---------- deal / new hand ----------
  function clearHandState() {
    trickNumber = 0;
    trick = [];
    leadSuit = null;
    leaderIndex = 0;
    turnIndex = 0;
    trumpSuit = null;
    trumpOpen = false;
    lockInput = false;

    // reset pluck state
    pluckQueue = [];
    activePluck = null;
    pluckSuitUsedByPair = new Map();

    if (trumpAceSlotEl) trumpAceSlotEl.innerHTML = "(none)";
  }

  function dealHands() {
    deck = shuffle(makePluckDeck51());
    players.forEach(p => { p.hand = []; p.tricks = 0; });

    for (let i=0;i<TOTAL_TRICKS;i++) {
      players[0].hand.push(deck.pop());
      players[1].hand.push(deck.pop());
      players[2].hand.push(deck.pop());
    }

    trickNumber = 1;
    trick = [];
    leadSuit = null;

    // leader: whoever has 2C leads trick 1
    let whoHas2C = 0;
    for (let pi=0; pi<3; pi++) {
      if (players[pi].hand.includes(CARD_OPEN_LEAD)) { whoHas2C = pi; break; }
    }
    leaderIndex = whoHas2C;
    turnIndex = whoHas2C;

    render();
  }

  // ---------- trump pick ----------
  function setTrump(suit) {
    trumpSuit = suit;
    trumpOpen = false; // starts closed
    setText(trumpLabelEl, `${suit} (${SUIT_NAME[suit]})`);
    setText(trumpOpenLabelEl, "No");

    // show Ace of trump in slot (visual cue)
    const ace = "A" + suit;
    renderCardIntoSlot(trumpAceSlotEl, ace);

    render();
  }

  function aiChooseTrumpFromOwnHand(aiIndex) {
    const hand = players[aiIndex].hand;
    const suitScore = { S:0, H:0, D:0, C:0 };
    for (const cs of hand) {
      if (isJoker(cs)) {
        suitScore.S += 5; suitScore.H += 5; suitScore.D += 5; suitScore.C += 5;
        continue;
      }
      const s = cs.slice(-1);
      const r = cs.slice(0, cs.length-1);
      const v = RANK_VALUE[r] || 0;
      suitScore[s] += 2;
      if (v >= 11) suitScore[s] += (v - 10) * 2;
      else suitScore[s] += Math.max(0, v - 6) * 0.5;
    }
    let bestSuit = "S", bestScore = -999;
    for (const s of SUITS) {
      if (suitScore[s] > bestScore) { bestScore = suitScore[s]; bestSuit = s; }
    }
    return bestSuit;
  }

  function renderTrumpPickStatus() {
    if (!trumpStatusEl) return;
    if (trumpSuit) {
      setText(trumpStatusEl, `Trump picked: ${trumpSuit} (${SUIT_NAME[trumpSuit]}).`);
      return;
    }
    setText(trumpStatusEl, `Dealer (${players[dealerIndex].id}) selects trump.`);
  }

  function beginTrumpPick() {
    setPhase("TRUMP_PICK");
    renderTrumpPickStatus();
    render();

    // if dealer is AI, pick immediately
    if (dealerIndex !== 2) {
      const s = aiChooseTrumpFromOwnHand(dealerIndex);
      setTrump(s);
      showMsg(`${players[dealerIndex].id} picked trump: ${s} (${SUIT_NAME[s]}).`);
      beginPlay();
    } else {
      showMsg("Pick trump now (dealer is YOU).");
    }
  }

  function wireTrumpButtons() {
    if (!trumpPanelEl) return;
    const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
    btns.forEach(b => {
      b.addEventListener("click", () => {
        if (phase !== "TRUMP_PICK") return;
        if (trumpSuit) return;
        if (dealerIndex !== 2) return; // only YOU click when you are dealer
        const suit = b.getAttribute("data-trump");
        if (!SUITS.includes(suit)) return;
        setTrump(suit);
        showMsg(`You picked trump: ${suit} (${SUIT_NAME[suit]}).`);
        beginPlay();
      });
    });
  }

  // ---------- play loop ----------
  function playCard(playerIndex, handIdx) {
    const cardStr = players[playerIndex].hand.splice(handIdx, 1)[0];
    if (!cardStr) return;

    // set lead suit when first card of trick played
    if (trick.length === 0) {
      leadSuit = cardSuit(cardStr, trumpSuit);
    }

    trick.push({ playerIndex, cardStr });
    updateTrumpOpenIfNeeded(cardStr);

    // advance turn
    turnIndex = (turnIndex + 1) % 3;

    render();
    maybeContinue();
  }

  function chooseAiIndex(playerIndex) {
    const legal = legalIndexesFor(playerIndex);
    const hand = players[playerIndex].hand;

    // simple strong AI: try to win if it needs tricks, otherwise dump low
    const need = players[playerIndex].quota - players[playerIndex].tricks;
    const leading = (trick.length === 0);

    function wouldWinIfPlay(idx) {
      const cs = hand[idx];
      const temp = trick.concat([{ playerIndex, cardStr: cs }]);
      const anyTrump = temp.some(t => isTrump(t.cardStr, trumpSuit));
      if (anyTrump) {
        let bestPi = temp[0].playerIndex, bestP = -1;
        for (const t of temp) {
          if (!isTrump(t.cardStr, trumpSuit)) continue;
          const p = cardPower(t.cardStr, trumpSuit);
          if (p > bestP) { bestP = p; bestPi = t.playerIndex; }
        }
        return bestPi === playerIndex;
      } else {
        const ls = (temp.length ? cardSuit(temp[0].cardStr, trumpSuit) : leadSuit);
        let bestPi = temp[0].playerIndex, bestV = -1;
        for (const t of temp) {
          if (cardSuit(t.cardStr, trumpSuit) !== ls) continue;
          const r = cardRank(t.cardStr);
          const v = RANK_VALUE[r] || 0;
          if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
        }
        return bestPi === playerIndex;
      }
    }

    let bestIdx = legal[0];
    let bestScore = -Infinity;

    for (const idx of legal) {
      const cs = hand[idx];
      const base = cardPower(cs, trumpSuit);
      const wins = wouldWinIfPlay(idx);

      let score = 0;

      if (need > 0) {
        // needs tricks: value winning
        score += base;
        if (wins) score += 500;
      } else {
        // doesn't need tricks: avoid winning; dump low
        score -= base;
        if (wins) score -= 600;
      }

      // leading: prefer non-trump before trump open (spades style)
      if (leading && trumpSuit && !trumpOpen && isTrump(cs, trumpSuit) && hasNonTrump(playerIndex)) {
        score -= 800;
      }

      if (score > bestScore) { bestScore = score; bestIdx = idx; }
    }
    return bestIdx;
  }

  function beginPlay() {
    setPhase("PLAY");
    showMsg("Play begins. Click a legal card when it's your turn.");
    render();
    maybeContinue();
  }

  function roundIsOver() {
    return players.every(p => p.hand.length === 0) && trick.length === 0;
  }

  function computePlucksFromLastHand() {
    // plucksEarned = max(0, tricks - quota)
    // plucksSuffered = max(0, quota - tricks)
    const earned = players.map(p => Math.max(0, p.tricks - p.quota));
    const suffered = players.map(p => Math.max(0, p.quota - p.tricks));

    // create queue: pluckers (earned>0) pluck victims (suffered>0)
    const pluckers = [0,1,2].filter(i => earned[i] > 0);
    const victims = [0,1,2].filter(i => suffered[i] > 0);

    const q = [];
    const eLeft = new Map(pluckers.map(i => [i, earned[i]]));
    const sLeft = new Map(victims.map(i => [i, suffered[i]]));

    for (const plucker of pluckers) {
      while ((eLeft.get(plucker) || 0) > 0) {
        const victim = victims.find(v => (sLeft.get(v) || 0) > 0);
        if (victim === undefined) break;
        q.push({ pluckerIndex: plucker, pluckeeIndex: victim });
        eLeft.set(plucker, (eLeft.get(plucker) || 0) - 1);
        sLeft.set(victim, (sLeft.get(victim) || 0) - 1);
      }
    }
    return q;
  }

  function clearTrickForNext(winnerIndex) {
    trick = [];
    leadSuit = null;
    leaderIndex = winnerIndex;
    turnIndex = winnerIndex;
  }

  function maybeContinue() {
    if (phase !== "PLAY") return;

    // trick full -> resolve
    if (trick.length === 3) {
      lockInput = true;
      setTimeout(() => {
        const winner = evaluateTrickWinner();
        players[winner].tricks += 1;
        showMsg(`${players[winner].id} wins the trick.`);
        render();

        setTimeout(() => {
          clearTrickForNext(winner);
          trickNumber += 1;
          lockInput = false;
          render();

          // end hand?
          if (players.every(p => p.hand.length === 0)) {
            // finish the hand: compute plucks for NEXT hand
            pendingPlucks = computePlucksFromLastHand();
            firstHandCompleted = true;

            showMsg("Hand over. Click Reset (New Deal) for next hand.");
            return;
          }

          // continue if next is AI
          maybeContinue();
        }, BETWEEN_TRICKS_MS);
      }, RESOLVE_DELAY_MS);

      return;
    }

    // AI turns auto-play
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

  // ---------- pluck phase (hand 2+) ----------
  function pairKey(a,b){ return `${a}-${b}`; }
  function markSuitUsed(pluckerI, pluckeeI, suit) {
    const k = pairKey(pluckerI, pluckeeI);
    if (!pluckSuitUsedByPair.has(k)) pluckSuitUsedByPair.set(k, new Set());
    pluckSuitUsedByPair.get(k).add(suit);
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
  function removeCard(playerIndex, cardStr) {
    const i = players[playerIndex].hand.indexOf(cardStr);
    if (i >= 0) players[playerIndex].hand.splice(i, 1);
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
    if (!giveLow) return { ok:false, reason:"Plucker has none of that suit." };

    const takeHigh = highestOfSuitNonJoker(pluckeeI, suit);
    if (!takeHigh) return { ok:false, reason:"Victim cannot return that suit." };

    removeCard(pluckerI, giveLow);
    removeCard(pluckeeI, takeHigh);
    players[pluckerI].hand.push(takeHigh);
    players[pluckeeI].hand.push(giveLow);
    markSuitUsed(pluckerI, pluckeeI, suit);

    return { ok:true, giveLow, takeHigh };
  }

  function clearPluckUI() {
    if (pluckChoicesEl) pluckChoicesEl.innerHTML = "";
  }

  function renderPluckStatus() {
    if (!pluckPanelEl || !pluckStatusEl) return;
    clearPluckUI();

    if (!pluckQueue.length) {
      setText(pluckStatusEl, "No plucks to process.");
      if (pluckNextBtn) pluckNextBtn.disabled = true;
      return;
    }

    if (!activePluck) activePluck = pluckQueue[0];

    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;
    const plucker = players[pluckerI];
    const pluckee = players[pluckeeI];

    const suits = availablePluckSuits(pluckerI, pluckeeI);

    // YOU pluck uses suit buttons
    if (pluckerI === 2) {
      if (pluckNextBtn) pluckNextBtn.disabled = true;

      if (!suits.length) {
        setText(pluckStatusEl, `You are plucking ${pluckee.id}, but you have no available suit. Skipping.`);
        // skip
        pluckQueue.shift(); activePluck = null;
        if (!pluckQueue.length) beginTrumpPick();
        render();
        return;
      }

      setText(pluckStatusEl, `You are plucking ${pluckee.id}. Choose a suit. Wrong suit attempt = LOST.`);

      for (const s of suits) {
        const give = lowestOfSuitNonJoker(pluckerI, s);
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.textContent = `${s} (${SUIT_NAME[s]}) • Give: ${give || "—"}`;
        btn.addEventListener("click", () => {
          const res = attemptPluck(pluckerI, pluckeeI, s);
          if (!res.ok) {
            markSuitUsed(pluckerI, pluckeeI, s);
            setText(pluckStatusEl, `FAILED (${res.reason}). Pluck LOST. Next pluck.`);
          } else {
            setText(pluckStatusEl, `Pluck success: gave ${res.giveLow}, got ${res.takeHigh}.`);
          }
          pluckQueue.shift(); activePluck = null;
          if (!pluckQueue.length) beginTrumpPick();
          render();
        });
        pluckChoicesEl && pluckChoicesEl.appendChild(btn);
      }
      return;
    }

    // AI pluck uses "Run Next Pluck"
    if (pluckNextBtn) pluckNextBtn.disabled = false;
    if (!suits.length) {
      setText(pluckStatusEl, `${plucker.id} is plucking ${pluckee.id} but has no available suit. Skipping.`);
    } else {
      setText(pluckStatusEl, `${plucker.id} is plucking ${pluckee.id}. Click "Run Next Pluck".`);
    }
  }

  function runOnePluck() {
    if (phase !== "PLUCK") return;
    if (!pluckQueue.length) return;

    if (!activePluck) activePluck = pluckQueue[0];
    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;

    // YOU uses buttons
    if (pluckerI === 2) {
      render();
      return;
    }

    const suits = availablePluckSuits(pluckerI, pluckeeI);
    if (!suits.length) {
      setText(pluckStatusEl, `${players[pluckerI].id} cannot pluck any suit. Skipped.`);
      pluckQueue.shift(); activePluck = null;
      if (!pluckQueue.length) beginTrumpPick();
      render();
      return;
    }

    // AI chooses a suit: cheap give + likely strong return (blind-ish)
    // We still must check victim has suit; if not => LOST (your rule).
    suits.sort((a,b)=>{
      const la = lowestOfSuitNonJoker(pluckerI, a);
      const lb = lowestOfSuitNonJoker(pluckerI, b);
      const va = la ? (RANK_VALUE[la.slice(0,-1)]||99) : 99;
      const vb = lb ? (RANK_VALUE[lb.slice(0,-1)]||99) : 99;
      return va - vb; // give cheapest first
    });

    const pickSuit = suits[0];
    const res = attemptPluck(pluckerI, pluckeeI, pickSuit);

    if (!res.ok) {
      markSuitUsed(pluckerI, pluckeeI, pickSuit);
      setText(pluckStatusEl, `${players[pluckerI].id} FAILED pluck (${pickSuit}). LOST.`);
    } else {
      setText(pluckStatusEl, `${players[pluckerI].id} plucked ${pickSuit}: gave ${res.giveLow}, got ${res.takeHigh}.`);
    }

    pluckQueue.shift(); activePluck = null;
    if (!pluckQueue.length) beginTrumpPick();
    render();
  }

  // ---------- start next hand ----------
  function startHand() {
    clearHandState();
    applyQuotasFromDealer();

    setPhase("DEAL");
    dealHands();

    // FIRST HAND: skip pluck
    if (!firstHandCompleted) {
      // Hand 1: Deal -> Trump pick -> Play
      beginTrumpPick();
      return;
    }

    // Hand 2+: Deal -> Pluck -> Trump pick -> Play
    pluckQueue = (pendingPlucks && pendingPlucks.length) ? pendingPlucks.slice() : [];
    pendingPlucks = [];

    if (!pluckQueue.length) {
      beginTrumpPick();
    } else {
      setPhase("PLUCK");
      showMsg("Pluck phase begins (Hand 2+).");
      render();
    }
  }

  // dealer rotates RIGHT each new deal AFTER first hand
  function rotateDealerRight() {
    dealerIndex = rightOf(dealerIndex);
    applyQuotasFromDealer();
  }

  // ---------- events ----------
  // Initial pick buttons
  if (pickBtn) pickBtn.addEventListener("click", () => {
    doPick();
  });

  if (pickReBtn) pickReBtn.addEventListener("click", () => {
    resetPickUI();
    doPick();
  });

  if (pickOkBtn) pickOkBtn.addEventListener("click", () => {
    if (!pickDealerResolved) return;
    // Start the first hand (no pluck)
    setPhase("DEAL");
    showMsg("Dealer locked. Starting Hand 1 (no pluck).");
    startHand();
  });

  // Pluck button
  if (pluckNextBtn) pluckNextBtn.addEventListener("click", () => runOnePluck());

  // Reset (new deal)
  resetBtn.addEventListener("click", () => {
    // If dealer was never set (you skipped pick), force pick phase
    if (phase === "PICK_DEALER") {
      showMsg("Pick dealer first.");
      return;
    }

    // After first hand completed, rotate dealer right each new deal
    if (firstHandCompleted) rotateDealerRight();

    showMsg("New deal.");
    startHand();
  });

  // Trump buttons
  wireTrumpButtons();

  // ---------- boot ----------
  function boot() {
    resetPickUI();
    applyQuotasFromDealer();
    setPhase("PICK_DEALER");
    showMsg("Pick cards to choose dealer.");
    render();
  }

  boot();

})();
