// Pluck Web Demo v19-final (single-file replacement)
// Fixes: Phase 4 not starting, cards not clickable on tablet, initial dealer pick flow.
// Rules in this build:
// - Initial dealer selection: show all 3 cards + OK. Tie for lowest => repick.
// - First hand has NO PLUCK: DEAL -> TRUMP_PICK -> PLAY
// - Later hands: DEAL -> PLUCK -> TRUMP_PICK -> PLAY (pluck uses prior-hand results; manual run)
// - AI2 leads, AI3 plays, then YOU (must follow suit if possible)
// - Optional card images: fallback to drawn faces if images missing.
// - Shows Ace of trump if #trumpAceSlot exists.

(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const on = (el, evt, fn) => el && el.addEventListener(evt, fn);
  const setText = (el, txt) => { if (el) el.textContent = String(txt); };
  const showMsg = (txt) => setText($("msg"), txt);
  const showError = (txt) => { setText($("msg"), "ERROR: " + txt); console.error(txt); };

  window.addEventListener("error", (e) => showError(e?.message || "Unknown script error"));

  // ---------- required DOM ----------
  const handEl = $("hand");
  const trickEl = $("trick");
  const resetBtn = $("resetBtn");
  if (!handEl || !trickEl || !resetBtn) {
    showError("Missing required ids: hand, trick, resetBtn (check game.html).");
    return;
  }

  // ---------- optional DOM ----------
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

  // Initial pick UI (optional but you have it)
  const pickBtn = $("pickBtn");
  const pickOkBtn = $("pickOkBtn");
  const pickReBtn = $("pickReBtn");
  const pickStatusEl = $("pickStatus");
  const pickAI2El = $("pickAI2");
  const pickAI3El = $("pickAI3");
  const pickYOUEl = $("pickYOU");
  const dealerLabelEl = $("dealerLabel");
  const dealerBannerEl = $("dealerBanner");

  // Trump ace slot (optional)
  const trumpAceSlotEl = $("trumpAceSlot");

  // Pluck panel (optional)
  const pluckPanelEl = $("pluckPanel");
  const pluckStatusEl = $("pluckStatus");
  const pluckChoicesEl = $("pluckChoices");
  const pluckNextBtn = $("pluckNextBtn");

  // Trump pick panel (optional)
  const trumpPanelEl = $("trumpPanel");
  const trumpStatusEl = $("trumpStatus");

  // ---------- core constants ----------
  const TOTAL_TRICKS = 17;

  const SUITS = ["S", "H", "D", "C"];
  const SUIT_NAME = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };
  const SUIT_SYM  = { S: "♠", H: "♥", D: "♦", C: "♣" };
  const isRedSuit = (s) => (s === "H" || s === "D");

  // Pluck deck used in your web demo: 3..A of each suit (no 2s), plus 2C, plus BJ/LJ => 51 cards
  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

  // Images (optional): put pngs in assets/cards, named exactly like "7D.png", "AS.png", "10H.png", "2C.png", "BJ.png", "LJ.png"
  const USE_CARD_IMAGES = true;
  const CARD_IMG_DIR = "assets/cards";

  // Timing
  const AI_DELAY_MS = 250;
  const TRICK_RESOLVE_MS = 300;
  const BETWEEN_TRICKS_MS = 250;

  // ---------- game state ----------
  // players: 0=AI2, 1=AI3, 2=YOU
  const players = [
    { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7, plucksEarned:0, plucksSuffered:0 },
    { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6, plucksEarned:0, plucksSuffered:0 },
    { id:"YOU", name:"You",            hand:[], tricks:0, quota:4, plucksEarned:0, plucksSuffered:0 }
  ];

  function leftOf(i)  { return (i + 1) % 3; }
  function rightOf(i) { return (i + 2) % 3; }

  let handCount = 0;                 // 0 before first played hand
  let dealerIndex = 0;               // set by initial pick
  let trumpSuit = null;
  let trumpOpen = false;

  let phase = "PICK_DEALER";         // PICK_DEALER | DEAL | PLUCK | TRUMP_PICK | PLAY
  let leaderIndex = 0;
  let turnIndex = 0;
  let leadSuit = null;
  let trick = [];
  let trickNumber = 0;
  let lockInput = false;

  // Pluck queue from previous hand (optional)
  let pendingPluckQueue = null;
  let pluckQueue = [];
  let activePluck = null;

  // Public memory: only what’s played/voided
  const memory = {
    played: new Set(),
    voidSuits: [new Set(), new Set(), new Set()]
  };

  function resetMemory() {
    memory.played = new Set();
    memory.voidSuits = [new Set(), new Set(), new Set()];
  }

  // ---------- deck helpers ----------
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

  function isJoker(cs) { return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }

  function parseCard(cs) {
    if (cs === CARD_BIG_JOKER) return { kind:"JOKER", suit: trumpSuit, value: 1000 };
    if (cs === CARD_LITTLE_JOKER) return { kind:"JOKER", suit: trumpSuit, value: 900 };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    return { kind:"NORMAL", suit, rank, value: RANK_VALUE[rank] };
  }

  function cardSuitForFollow(cs) {
    if (isJoker(cs)) return trumpSuit || null; // before trump pick jokers have no suit
    return cs.slice(-1);
  }

  function isTrumpCard(cs) {
    if (!trumpSuit) return false;
    if (isJoker(cs)) return true;
    return cs.slice(-1) === trumpSuit;
  }

  // ---------- quotas ----------
  function applyQuotasFromDealer() {
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }

  // ---------- UI: phase chips ----------
  function setPhase(newPhase) {
    phase = newPhase;
    setText(phaseLabelEl, newPhase);

    const chips = [pDeal, pPluck, pTrump, pPlay];
    chips.forEach(c => c && c.classList.remove("activeChip"));

    // Your labels: 1) The Deal, 2) Pluck, 3) Dealer Selects Trump, 4) Play
    if (newPhase === "DEAL")      pDeal && pDeal.classList.add("activeChip");
    if (newPhase === "PLUCK")     pPluck && pPluck.classList.add("activeChip");
    if (newPhase === "TRUMP_PICK")pTrump && pTrump.classList.add("activeChip");
    if (newPhase === "PLAY")      pPlay && pPlay.classList.add("activeChip");

    // Panels (optional)
    if (pluckPanelEl) pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
    if (trumpPanelEl) trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";
  }

  // ---------- card faces ----------
  function makeCardFaceFallback(cardStr, disabled=false) {
    const el = document.createElement("div");
    el.className = "cardFace" + (disabled ? " disabled" : "");

    if (isJoker(cardStr)) {
      el.classList.add("joker");
      const tl = document.createElement("div");
      tl.className = "corner tl";
      tl.textContent = cardStr;
      const br = document.createElement("div");
      br.className = "corner br";
      br.textContent = cardStr;
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
    const sym = SUIT_SYM[suit];

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

  function cardToImageFile(cardStr) {
    // expects assets/cards/<cardStr>.png
    return `${CARD_IMG_DIR}/${cardStr}.png`;
  }

  function makeCardFace(cardStr, disabled=false) {
    if (!USE_CARD_IMAGES) return makeCardFaceFallback(cardStr, disabled);

    const wrap = document.createElement("div");
    wrap.className = "cardFace" + (disabled ? " disabled" : "");
    wrap.style.padding = "0";
    wrap.style.overflow = "hidden";

    const img = document.createElement("img");
    img.alt = cardStr;
    img.src = cardToImageFile(cardStr);
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";

    // CRITICAL FOR TABLET: the image must NOT steal taps/clicks.
    img.style.pointerEvents = "none";

    img.onerror = () => {
      const fb = makeCardFaceFallback(cardStr, disabled);
      wrap.replaceWith(fb);
    };

    wrap.appendChild(img);
    return wrap;
  }

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

  // ---------- initial pick (choose dealer) ----------
  let pickCards = null; // { AI2: "7D", AI3:"QH", YOU:"3S" } etc

  function pickRankValue(cs) {
    // Jokers should never appear in pick; if they do, treat as high
    if (isJoker(cs)) return 999;
    const p = parseCard(cs);
    return p.value;
  }

  function dealInitialPick() {
    const deck = shuffle(makePluckDeck51());

    // Take top 3 non-joker cards (to avoid weirdness)
    function drawNonJoker() {
      while (deck.length) {
        const c = deck.pop();
        if (!isJoker(c)) return c;
      }
      return "3C";
    }

    pickCards = {
      0: drawNonJoker(),
      1: drawNonJoker(),
      2: drawNonJoker()
    };

    // show them
    if (pickAI2El) { pickAI2El.innerHTML=""; pickAI2El.appendChild(makeCardFace(pickCards[0], true)); }
    if (pickAI3El) { pickAI3El.innerHTML=""; pickAI3El.appendChild(makeCardFace(pickCards[1], true)); }
    if (pickYOUEl) { pickYOUEl.innerHTML=""; pickYOUEl.appendChild(makeCardFace(pickCards[2], true)); }

    // find lowest
    const vals = [
      { i:0, v: pickRankValue(pickCards[0]) },
      { i:1, v: pickRankValue(pickCards[1]) },
      { i:2, v: pickRankValue(pickCards[2]) }
    ].sort((a,b)=>a.v-b.v);

    const lowestV = vals[0].v;
    const tied = vals.filter(x=>x.v === lowestV).map(x=>x.i);

    if (tied.length > 1) {
      setText(pickStatusEl, `Tie for lowest (${tied.map(i=>players[i].id).join(", ")}). Click Re-Pick.`);
      if (pickOkBtn) pickOkBtn.disabled = true;
      if (pickReBtn) pickReBtn.disabled = false;
      setText(dealerLabelEl, "(tie)");
      setText(dealerBannerEl, "(tie)");
      return;
    }

    const dealer = vals[0].i;
    setText(pickStatusEl, `Lowest card is ${players[dealer].id}. Click OK to accept.`);
    if (pickOkBtn) pickOkBtn.disabled = false;
    if (pickReBtn) pickReBtn.disabled = true;

    dealerIndex = dealer; // set now, confirm on OK
    setText(dealerLabelEl, players[dealerIndex].id);
    setText(dealerBannerEl, players[dealerIndex].id);
  }

  function acceptInitialPickAndStart() {
    if (dealerIndex === null || dealerIndex === undefined) {
      showMsg("Pick cards first.");
      return;
    }
    applyQuotasFromDealer();
    handCount = 0; // first hand upcoming
    startNewHand();
  }

  // ---------- deal / phases ----------
  function dealHands() {
    resetMemory();

    const deck = shuffle(makePluckDeck51());
    players.forEach(p => {
      p.hand = [];
      p.tricks = 0;
      p.plucksEarned = 0;
      p.plucksSuffered = 0;
    });

    trick = [];
    leadSuit = null;
    trickNumber = 0;
    setText(trickMaxEl, TOTAL_TRICKS);

    // deal 17 each
    for (let i=0;i<TOTAL_TRICKS;i++) {
      players[0].hand.push(deck.pop());
      players[1].hand.push(deck.pop());
      players[2].hand.push(deck.pop());
    }

    trumpSuit = null;
    trumpOpen = false;
  }

  function startNewHand() {
    // rotate dealer RIGHT each new deal AFTER initial pick accepted
    // you wanted first deal random via pick; from then on rotate right:
    if (handCount > 0) dealerIndex = rightOf(dealerIndex);
    applyQuotasFromDealer();

    setText(dealerBannerEl, players[dealerIndex].id);
    setText(dealerLabelEl, players[dealerIndex].id);

    setPhase("DEAL");
    dealHands();

    // First hand: NO PLUCK
    if (handCount === 0) {
      setPhase("TRUMP_PICK");
      showMsg("First hand: no pluck. Dealer selects trump.");
      startTrumpPick();
      return;
    }

    // Later hands: if you have pending plucks from prior hand, do PLUCK
    pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
    pendingPluckQueue = null;

    if (pluckQueue.length > 0) {
      setPhase("PLUCK");
      showMsg("Pluck phase (manual). Run plucks, then dealer selects trump.");
      render();
      return;
    }

    // No plucks -> straight to trump
    setPhase("TRUMP_PICK");
    showMsg("No plucks this hand. Dealer selects trump.");
    startTrumpPick();
  }

  // ---------- pluck (kept minimal so it won't break play) ----------
  function computePlucksEarnedAndSuffered() {
    for (const p of players) {
      p.plucksEarned = Math.max(0, p.tricks - p.quota);
      p.plucksSuffered = Math.max(0, p.quota - p.tricks);
    }
  }

  function buildPluckQueueFromScores() {
    // basic: plucker = earned, victim = suffered
    const pluckers = [0,1,2].filter(i => players[i].plucksEarned > 0)
      .sort((a,b)=>players[b].plucksEarned - players[a].plucksEarned);
    const victims = [0,1,2].filter(i => players[i].plucksSuffered > 0)
      .sort((a,b)=>players[b].plucksSuffered - players[a].plucksSuffered);

    const earned = new Map(pluckers.map(i=>[i, players[i].plucksEarned]));
    const suffered = new Map(victims.map(i=>[i, players[i].plucksSuffered]));

    const q = [];
    for (const pI of pluckers) {
      while ((earned.get(pI)||0) > 0) {
        const vI = victims.find(v => (suffered.get(v)||0) > 0);
        if (vI === undefined) break;
        q.push({ pluckerIndex:pI, pluckeeIndex:vI });
        earned.set(pI, (earned.get(pI)||0) - 1);
        suffered.set(vI, (suffered.get(vI)||0) - 1);
      }
    }
    return q;
  }

  function renderPluckPanel() {
    if (!pluckPanelEl) return;
    if (phase !== "PLUCK") return;

    if (!pluckQueue.length) {
      setText(pluckStatusEl, "No plucks to process. Moving to trump pick...");
      setTimeout(() => { setPhase("TRUMP_PICK"); startTrumpPick(); }, 350);
      return;
    }

    if (!activePluck) activePluck = pluckQueue[0];
    const plucker = players[activePluck.pluckerIndex];
    const pluckee = players[activePluck.pluckeeIndex];
    setText(pluckStatusEl, `${plucker.id} is plucking ${pluckee.id}. (Demo: pluck logic not expanded here.)`);
    // This build keeps pluck UI stable; it won't block the game.
  }

  function runOnePluck() {
    // placeholder: consume one pluck and move on.
    if (phase !== "PLUCK") return;
    if (!pluckQueue.length) return;

    pluckQueue.shift();
    activePluck = null;

    if (!pluckQueue.length) {
      setPhase("TRUMP_PICK");
      startTrumpPick();
      return;
    }
    render();
  }

  // ---------- trump pick ----------
  function setTrump(suit) {
    trumpSuit = suit;
    // your existing rule: trump opens automatically if clubs (keep it)
    trumpOpen = (trumpSuit === "C");

    setText(trumpLabelEl, `${trumpSuit} (${SUIT_NAME[trumpSuit]})`);
    setText(trumpOpenLabelEl, trumpOpen ? "Yes" : "No");

    // Show ace of trump if slot exists
    if (trumpAceSlotEl) {
      trumpAceSlotEl.innerHTML = "";
      trumpAceSlotEl.appendChild(makeCardFace("A" + trumpSuit, true));
    }
  }

  function aiChooseTrumpFromOwnHand() {
    // dealer chooses trump based on dealer's own hand only
    const dealer = dealerIndex;
    const suitScore = { S:0, H:0, D:0, C:0 };

    for (const cs of players[dealer].hand) {
      if (isJoker(cs)) {
        SUITS.forEach(s=>suitScore[s]+=6);
        continue;
      }
      const suit = cs.slice(-1);
      const rank = cs.slice(0, cs.length-1);
      const v = RANK_VALUE[rank] || 0;

      suitScore[suit] += 2; // length
      if (v >= 11) suitScore[suit] += (v - 10) * 2; // J/Q/K/A weight
      else suitScore[suit] += Math.max(0, v - 6) * 0.5;
    }

    let bestSuit = "H", best = -999;
    for (const s of SUITS) {
      if (suitScore[s] > best) { best = suitScore[s]; bestSuit = s; }
    }
    return bestSuit;
  }

  function startTrumpPick() {
    setPhase("TRUMP_PICK");

    const dealer = players[dealerIndex];
    setText(trumpStatusEl, `${dealer.id} selects trump.`);

    // Wire buttons if present (YOU will only click if YOU are dealer)
    if (trumpPanelEl) {
      const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
      btns.forEach(b => {
        b.onclick = () => {
          if (phase !== "TRUMP_PICK") return;
          if (dealerIndex !== 2) return; // only you click when you are dealer
          const s = b.getAttribute("data-trump");
          if (!SUITS.includes(s)) return;
          setTrump(s);
          showMsg(`You (Dealer) selected trump: ${s} (${SUIT_NAME[s]}).`);
          startPlayHand();
        };
      });
    }

    // If dealer is AI, pick immediately
    if (dealerIndex !== 2) {
      const s = aiChooseTrumpFromOwnHand();
      setTrump(s);
      showMsg(`${players[dealerIndex].id} selected trump: ${s} (${SUIT_NAME[s]}).`);
      startPlayHand();
    } else {
      showMsg("You are Dealer. Pick trump.");
      render();
    }
  }

  // ---------- play rules ----------
  function legalIndexesFor(playerIndex) {
    const hand = players[playerIndex].hand;

    // Trick 1 lead must be 2C if you have it
    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
      return hand.map((c,i)=>({c,i})).filter(x=>x.c===CARD_OPEN_LEAD).map(x=>x.i);
    }

    // If leading and trump is not open, you can’t lead trump if you have any non-trump
    if (trick.length === 0 && !trumpOpen && trumpSuit !== "C") {
      const nonTrumpIdx = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c)).map(x=>x.i);
      if (nonTrumpIdx.length) return nonTrumpIdx;
      return hand.map((_,i)=>i);
    }

    // Must follow suit if possible
    if (trick.length > 0) {
      const hasSuit = hand.some(c => cardSuitForFollow(c) === leadSuit);
      if (hasSuit) {
        return hand.map((c,i)=>({c,i})).filter(x=>cardSuitForFollow(x.c)===leadSuit).map(x=>x.i);
      }
    }

    return hand.map((_,i)=>i);
  }

  function illegalReason(playerIndex, cardStr) {
    const hand = players[playerIndex].hand;

    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD) && cardStr !== CARD_OPEN_LEAD) {
      return "First lead must be 2C.";
    }

    if (trick.length === 0 && !trumpOpen && trumpSuit !== "C") {
      if (isTrumpCard(cardStr) && hand.some(c => !isTrumpCard(c))) return "Trump not open. Lead a non-trump card.";
    }

    if (trick.length > 0) {
      const hasSuit = hand.some(c => cardSuitForFollow(c) === leadSuit);
      if (hasSuit && cardSuitForFollow(cardStr) !== leadSuit) return `You must follow suit: ${leadSuit}.`;
    }

    return "That play is not allowed.";
  }

  function setLeadSuitFromFirstCard(cardStr) {
    leadSuit = cardSuitForFollow(cardStr);
  }

  function updateVoidMemory(playerIndex, playedCard) {
    if (trick.length === 0) return;
    const playedSuit = cardSuitForFollow(playedCard);
    if (playedSuit !== leadSuit) memory.voidSuits[playerIndex].add(leadSuit);
  }

  function cardPower(cardStr) {
    if (cardStr === CARD_BIG_JOKER) return 1000000;
    if (cardStr === CARD_LITTLE_JOKER) return 900000;

    const c = parseCard(cardStr);
    if (isTrumpCard(cardStr)) return 10000 + c.value;
    return c.value;
  }

  function evaluateTrickWinner() {
    const anyTrump = trick.some(t => isTrumpCard(t.cardStr));
    if (anyTrump) {
      let bestPi = trick[0].playerIndex;
      let bestP = -1;
      for (const t of trick) {
        if (!isTrumpCard(t.cardStr)) continue;
        const p = cardPower(t.cardStr);
        if (p > bestP) { bestP = p; bestPi = t.playerIndex; }
      }
      return bestPi;
    }

    let bestPi = trick[0].playerIndex;
    let bestV = -1;
    for (const t of trick) {
      if (cardSuitForFollow(t.cardStr) !== leadSuit) continue;
      const v = parseCard(t.cardStr).value;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi;
  }

  function roundIsOver() {
    return players.every(p => p.hand.length === 0) && trick.length === 0;
  }

  function playCard(playerIndex, handIdx) {
    const cardStr = players[playerIndex].hand.splice(handIdx, 1)[0];
    if (!cardStr) return;

    if (trick.length === 0) setLeadSuitFromFirstCard(cardStr);
    else updateVoidMemory(playerIndex, cardStr);

    trick.push({ playerIndex, cardStr });
    memory.played.add(cardStr);

    // trump opens if trump is played
    if (!trumpOpen && isTrumpCard(cardStr)) trumpOpen = true;

    // advance turn
    turnIndex = (turnIndex + 1) % 3;
    render();
    maybeContinue();
  }

  // ---------- AI play (simple "try to win" menace-ish) ----------
  function wouldWinIfPlayedNow(playerIndex, cardStr) {
    const temp = trick.concat([{ playerIndex, cardStr }]);
    const anyTrump = temp.some(t => isTrumpCard(t.cardStr));
    if (anyTrump) {
      let bestPi = temp[0].playerIndex;
      let bestP = -1;
      for (const t of temp) {
        if (!isTrumpCard(t.cardStr)) continue;
        const p = cardPower(t.cardStr);
        if (p > bestP) { bestP = p; bestPi = t.playerIndex; }
      }
      return bestPi === playerIndex;
    } else {
      let bestPi = temp[0].playerIndex;
      let bestV = -1;
      for (const t of temp) {
        if (cardSuitForFollow(t.cardStr) !== leadSuit) continue;
        const v = parseCard(t.cardStr).value;
        if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
      }
      return bestPi === playerIndex;
    }
  }

  function chooseAiIndex(playerIndex) {
    const legal = legalIndexesFor(playerIndex);
    const hand = players[playerIndex].hand;

    // "always try to win": prefer a card that wins now; if none, dump lowest legal.
    let winning = [];
    for (const idx of legal) {
      const c = hand[idx];
      if (trick.length === 0) {
        // as leader, treat "winning" as high power (not exact win)
        winning.push({ idx, score: cardPower(c) });
      } else {
        winning.push({ idx, score: wouldWinIfPlayedNow(playerIndex, c) ? 100000 + cardPower(c) : cardPower(c) });
      }
    }
    winning.sort((a,b)=>b.score-a.score);

    // If following and any "wins now", take the cheapest winner (don’t burn BJ unless needed)
    if (trick.length > 0) {
      const winners = winning.filter(x => x.score >= 100000);
      if (winners.length) {
        winners.sort((a,b)=>cardPower(hand[a.idx]) - cardPower(hand[b.idx]));
        return winners[0].idx;
      }
      // else dump lowest legal
      winning.sort((a,b)=>cardPower(hand[a.idx]) - cardPower(hand[b.idx]));
      return winning[0].idx;
    }

    // leading: pick a strong lead but avoid blowing BJ early if not needed
    winning.sort((a,b)=>b.score-a.score);
    const best = winning[0].idx;
    return best;
  }

  // ---------- render ----------
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

  function renderHand() {
    handEl.innerHTML = "";
    const sorted = sortHandForDisplay(players[2].hand);

    const isYourTurn = (phase === "PLAY" && turnIndex === 2 && !lockInput);
    const legal = isYourTurn ? legalIndexesFor(2) : [];

    for (const c of sorted) {
      const realIdx = players[2].hand.indexOf(c);
      const disabled = !(isYourTurn && legal.includes(realIdx));

      const face = makeCardFace(c, disabled);

      // IMPORTANT: use pointer events on the wrapper, not the img
      face.style.touchAction = "manipulation";

      face.onclick = (ev) => {
        ev && ev.preventDefault && ev.preventDefault();
        ev && ev.stopPropagation && ev.stopPropagation();

        if (disabled) {
          if (phase === "PLAY" && turnIndex === 2) showMsg(illegalReason(2, c));
          return;
        }
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

      handEl.appendChild(face);
    }
  }

  function renderMeta() {
    setText(ai2HandEl, players[0].hand.map(()=> "🂠").join(" "));
    setText(ai3HandEl, players[1].hand.map(()=> "🂠").join(" "));

    setText(ai2TricksEl, players[0].tricks);
    setText(ai3TricksEl, players[1].tricks);
    setText(youTricksEl, players[2].tricks);

    setText(ai2QuotaEl, players[0].quota);
    setText(ai3QuotaEl, players[1].quota);
    setText(youQuotaEl, players[2].quota);

    setText(trickNumEl, trickNumber);
    setText(trickMaxEl, TOTAL_TRICKS);

    if (trumpSuit) setText(trumpLabelEl, `${trumpSuit} (${SUIT_NAME[trumpSuit]})`);
    else setText(trumpLabelEl, "(not picked)");
    setText(trumpOpenLabelEl, trumpOpen ? "Yes" : "No");

    const who = (phase === "PLAY" ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`) : "—");
    const lockTxt = lockInput ? "LOCKED" : "OPEN";
    setText(turnBannerEl, `Phase: ${phase} • Dealer: ${players[dealerIndex]?.id || "(none)"} • ${who} • Lock: ${lockTxt} • Trump: ${trumpSuit || "(none)"} • LeadSuit: ${leadSuit || "(none)"}`);
  }

  function render() {
    renderMeta();
    renderHand();
    renderTrick();
    if (phase === "PLUCK") renderPluckPanel();
    if (phase === "TRUMP_PICK") {
      // status text already set in startTrumpPick
    }
  }

  // ---------- play loop ----------
  function startPlayHand() {
    setPhase("PLAY");
    trick = [];
    leadSuit = null;
    trickNumber = 1;
    lockInput = false;

    // Trick 1 leader = whoever has 2C
    let whoHas2C = 0;
    for (let pi=0; pi<3; pi++) {
      if (players[pi].hand.includes(CARD_OPEN_LEAD)) { whoHas2C = pi; break; }
    }
    leaderIndex = whoHas2C;
    turnIndex = whoHas2C;

    showMsg("PLAY started. Trick 1 begins.");
    render();
    maybeContinue();
  }

  function clearTrickForNext(winnerIndex) {
    trick = [];
    leadSuit = null;
    leaderIndex = winnerIndex;
    turnIndex = winnerIndex;
  }

  function maybeContinue() {
    if (phase !== "PLAY") return;

    // resolve trick
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

          if (roundIsOver()) {
            // end of hand -> compute pending plucks for next hand
            computePlucksEarnedAndSuffered();
            pendingPluckQueue = buildPluckQueueFromScores();

            handCount += 1;
            showMsg("Hand over. Click Reset (New Deal) for next hand.");
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
        const idx = chooseAiIndex(turnIndex);
        playCard(turnIndex, idx);
        lockInput = false;
        render();
      }, AI_DELAY_MS);
    }
  }

  // ---------- events ----------
  on(resetBtn, "click", () => {
    // If still in pick phase, force user to pick dealer first
    if (phase === "PICK_DEALER") {
      showMsg("Pick dealer first (left panel) then OK.");
      return;
    }
    startNewHand();
  });

  on(pluckNextBtn, "click", () => runOnePluck());

  on(pickBtn, "click", () => {
    setPhase("PICK_DEALER");
    dealInitialPick();
    showMsg("Initial pick dealt. Review cards, then OK (or Re-Pick if tie).");
    render();
  });

  on(pickReBtn, "click", () => {
    dealInitialPick();
    showMsg("Re-pick complete. Review cards, then OK.");
    render();
  });

  on(pickOkBtn, "click", () => {
    acceptInitialPickAndStart();
    render();
  });

  // ---------- boot ----------
  // Start in PICK_DEALER. If your page lacks the pick UI, we auto-start with AI2 as dealer.
  (function boot() {
    // make phases look active
    setPhase("PICK_DEALER");

    if (!pickBtn || !pickOkBtn || !pickStatusEl) {
      // No pick UI present — fallback start
      dealerIndex = 0;
      applyQuotasFromDealer();
      showMsg("Pick UI not found. Starting with AI2 as dealer.");
      startNewHand();
      return;
    }

    // initialize pick buttons
    if (pickOkBtn) pickOkBtn.disabled = true;
    if (pickReBtn) pickReBtn.disabled = true;
    setText(pickStatusEl, 'Click "Pick Cards".');
    setText(dealerLabelEl, "(not set)");
    setText(dealerBannerEl, "(not set)");

    render();
  })();

})();
