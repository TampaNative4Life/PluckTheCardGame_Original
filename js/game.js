// Pluck Web Demo v19.1 (FULL single-file replacement)
// Fixes: "card blinks but won't move" (tablet tap + phase/turn/lock correctness)
// Flow:
//  - PICK_DEALER: Pick Cards -> show all 3 -> if tie(lowest) Re-Pick -> else OK
//  - First hand: DEAL -> TRUMP_PICK -> PLAY  (NO PLUCK on first hand)
//  - Later hands: DEAL -> PLUCK -> TRUMP_PICK -> PLAY
// Dealer rotates RIGHT each new deal after first.
// Quotas: Dealer=7, Left=6, Right=4.
// Rules enforced (hard): must follow suit if possible; trick winner leads next.
// 2C leads trick 1 (whoever has it).
// Images optional: tries assets/cards/<CardKey>.png; falls back to drawn card faces.

(function () {
  "use strict";

  // ---------------- DOM helpers ----------------
  const $ = (id) => document.getElementById(id);
  const on = (el, evt, fn) => el && el.addEventListener(evt, fn, { passive: false });

  function setText(el, txt) { if (el) el.textContent = txt; }
  function showMsg(txt) { setText(msgEl, txt); }
  function showError(txt) {
    setText(msgEl, "ERROR: " + txt);
    console.error("[Pluck v19.1 ERROR]", txt);
  }

  window.addEventListener("error", (e) => showError(e?.message || "Unknown script error"));

  // ---------------- Required DOM ----------------
  const handEl = $("hand");
  const trickEl = $("trick");
  const resetBtn = $("resetBtn");
  const msgEl = $("msg");

  if (!handEl || !trickEl || !resetBtn) {
    console.error("Missing required elements: hand/trick/resetBtn");
    return;
  }

  // ---------------- Optional DOM ----------------
  const ai2HandEl = $("ai2Hand");
  const ai3HandEl = $("ai3Hand");

  const phaseLabelEl = $("phaseLabel");
  const turnBannerEl = $("turnBanner");

  const trumpLabelEl = $("trumpLabel");
  const trumpOpenLabelEl = $("trumpOpenLabel");

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

  // Dealer pick UI
  const pickBtn = $("pickBtn");
  const pickOkBtn = $("pickOkBtn");
  const pickReBtn = $("pickReBtn");
  const pickStatusEl = $("pickStatus");
  const pickAI2El = $("pickAI2");
  const pickAI3El = $("pickAI3");
  const pickYOUEl = $("pickYOU");
  const dealerLabelEl = $("dealerLabel");
  const dealerBannerEl = $("dealerBanner");

  const trumpAceSlotEl = $("trumpAceSlot"); // may exist

  // ---------------- Core constants ----------------
  const TOTAL_TRICKS = 17;

  const SUITS = ["S", "H", "D", "C"];
  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C"; // must lead trick 1
  const CARD_IMG_DIR = "assets/cards"; // optional

  const AI_DELAY_MS = 260;
  const TRICK_RESOLVE_MS = 300;
  const BETWEEN_TRICKS_MS = 260;

  function suitName(s) { return s==="S"?"Spades":s==="H"?"Hearts":s==="D"?"Diamonds":"Clubs"; }
  function suitSymbol(s){ return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣"; }
  function isRedSuit(s){ return s==="H" || s==="D"; }
  function isJoker(cs){ return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }

  // ---------------- Deck helpers ----------------
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
  function parseCard(cs) {
    if (cs === CARD_BIG_JOKER) return { raw: cs, kind:"JOKER", suit:null, value: 1000 };
    if (cs === CARD_LITTLE_JOKER) return { raw: cs, kind:"JOKER", suit:null, value: 900 };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    return { raw: cs, kind:"NORMAL", suit, rank, value: RANK_VALUE[rank] || 0 };
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

  // ---------------- Players ----------------
  // 0=AI2, 1=AI3, 2=YOU
  const players = [
    { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7 },
    { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6 },
    { id:"YOU", name:"You",           hand:[], tricks:0, quota:4 }
  ];

  let dealerIndex = 0;
  function leftOf(i){ return (i + 1) % 3; }
  function rightOf(i){ return (i + 2) % 3; } // right around a 3-seat table

  function applyQuotasForDealer(dealerI) {
    dealerIndex = dealerI;
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }

  function rotateDealerRight() {
    const nextDealer = rightOf(dealerIndex);
    applyQuotasForDealer(nextDealer);
  }

  // ---------------- State ----------------
  // Phases: PICK_DEALER, DEAL, PLUCK, TRUMP_PICK, PLAY
  let phase = "PICK_DEALER";

  let firstHand = true;

  let trumpSuit = null;
  let trumpOpen = false;

  let leaderIndex = 0;
  let turnIndex = 0;
  let leadSuit = null;
  let trick = []; // {playerIndex, cardStr}

  let trickNumber = 0;
  let trickMax = TOTAL_TRICKS;

  let lockInput = false;

  // Pluck placeholders (kept minimal so site stays playable)
  let pendingPluckQueue = null; // assigned after a hand ends (for next deal)
  let pluckQueue = [];
  let activePluck = null;

  // ---------------- UI: phase highlighting ----------------
  function setPhase(newPhase) {
    phase = newPhase;
    setText(phaseLabelEl, newPhase);

    // panels
    if (pluckPanelEl) pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
    if (trumpPanelEl) trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";

    // highlight chips
    const chips = [pDeal, pPluck, pTrump, pPlay];
    chips.forEach(c => c && c.classList.remove("activeChip"));

    // map to your labels:
    if (newPhase === "DEAL" && pDeal) pDeal.classList.add("activeChip");
    if (newPhase === "PLUCK" && pPluck) pPluck.classList.add("activeChip");
    if (newPhase === "TRUMP_PICK" && pTrump) pTrump.classList.add("activeChip");
    if (newPhase === "PLAY" && pPlay) pPlay.classList.add("activeChip");
  }

  // ---------------- Card UI (image + fallback) ----------------
  function makeCardFaceFallback(cardStr, disabled=false, faceDown=false) {
    const el = document.createElement("div");
    el.className = "cardFace" + (disabled ? " disabled" : "") + (faceDown ? " faceDown" : "");

    if (faceDown) {
      const mid = document.createElement("div");
      mid.className = "suitBig";
      mid.textContent = "PLUCK";
      el.appendChild(mid);
      return el;
    }

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
    // Try image first, auto-fallback to drawn face if missing
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
    img.style.pointerEvents = "none"; // IMPORTANT for tablet taps

    img.onerror = () => {
      const fallback = makeCardFaceFallback(cardStr, disabled, false);
      el.replaceWith(fallback);
    };

    el.appendChild(img);
    return el;
  }

  // ---------------- Sorting (your hand only) ----------------
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

  // ---------------- Render ----------------
  function render() {
    // scoreboard
    if (ai2QuotaEl) setText(ai2QuotaEl, String(players[0].quota));
    if (ai3QuotaEl) setText(ai3QuotaEl, String(players[1].quota));
    if (youQuotaEl) setText(youQuotaEl, String(players[2].quota));

    if (ai2TricksEl) setText(ai2TricksEl, String(players[0].tricks));
    if (ai3TricksEl) setText(ai3TricksEl, String(players[1].tricks));
    if (youTricksEl) setText(youTricksEl, String(players[2].tricks));

    if (trickNumEl) setText(trickNumEl, String(trickNumber));
    if (trickMaxEl) setText(trickMaxEl, String(trickMax));

    // dealer labels
    setText(dealerLabelEl, players[dealerIndex]?.id || "(not set)");
    setText(dealerBannerEl, players[dealerIndex]?.id || "(not set)");

    // trump
    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not picked)");
    setText(trumpOpenLabelEl, trumpOpen ? "Yes" : "No");

    // hidden hands
    if (ai2HandEl) setText(ai2HandEl, players[0].hand.map(()=> "🂠").join(" "));
    if (ai3HandEl) setText(ai3HandEl, players[1].hand.map(()=> "🂠").join(" "));

    // banner
    if (turnBannerEl) {
      const whose = (phase === "PLAY")
        ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`)
        : "—";
      const lockTxt = lockInput ? "LOCKED" : "OPEN";
      setText(turnBannerEl, `Phase: ${phase} • Dealer: ${players[dealerIndex].id} • ${whose} • Input: ${lockTxt}`);
    }

    // Your hand (clickable only in PLAY and your turn and not locked)
    handEl.innerHTML = "";
    const sorted = sortHandForDisplay(players[2].hand);

    for (const cardStr of sorted) {
      const realIdx = players[2].hand.indexOf(cardStr);

      const isYourPlayableTurn = (phase === "PLAY" && turnIndex === 2 && !lockInput);
      const legal = isYourPlayableTurn ? legalIndexesFor(2) : [];
      const disabled = !(isYourPlayableTurn && legal.includes(realIdx));

      const face = makeCardFace(cardStr, disabled);

      // Tablet-safe: pointerup is more reliable than click on some devices
      const handler = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        if (disabled) return;
        if (phase !== "PLAY") { showMsg("Not in PLAY yet."); return; }
        if (turnIndex !== 2) { showMsg("Not your turn."); return; }
        if (lockInput) return;

        const legalNow = legalIndexesFor(2);
        if (!legalNow.includes(realIdx)) {
          showMsg(illegalReason(2, cardStr));
          return;
        }

        playCard(2, realIdx);
      };

      on(face, "pointerup", handler);
      on(face, "click", handler);

      handEl.appendChild(face);
    }

    // Trick area
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

    // pluck panel status
    if (phase === "PLUCK") renderPluckStatus();
    if (phase === "TRUMP_PICK") renderTrumpPickStatus();
  }

  // ---------------- Dealer pick (Initial Pick) ----------------
  function pickDeckForDealer() {
    // Use the same 51 card deck; exclude jokers for "lowest card" sanity if you prefer:
    // We'll keep jokers IN but treat them as highest so they never win "lowest".
    const d = shuffle(makePluckDeck51().slice());
    return d;
  }

  function pickCardRankForLowest(cardStr) {
    // Lowest card deals.
    // Jokers count as very high.
    if (cardStr === CARD_BIG_JOKER) return 9999;
    if (cardStr === CARD_LITTLE_JOKER) return 9998;

    const c = parseCard(cardStr);
    // 2C exists; treat rank 2 as 2 (lowest-ish)
    const rank = (c.raw === "2C") ? 2 : (RANK_VALUE[c.rank] || 0);

    // Suit tiebreaker for display only; we only repick on tie for LOWEST.
    return rank;
  }

  let pickCards = null; // { ai2, ai3, you }

  function clearPickSlots() {
    if (pickAI2El) pickAI2El.innerHTML = "(none)";
    if (pickAI3El) pickAI3El.innerHTML = "(none)";
    if (pickYOUEl) pickYOUEl.innerHTML = "(none)";
  }

  function showPickCard(slotEl, cardStr) {
    if (!slotEl) return;
    slotEl.innerHTML = "";
    const face = makeCardFace(cardStr, true);
    slotEl.appendChild(face);
  }

  function doPickCards() {
    clearPickSlots();
    const d = pickDeckForDealer();

    pickCards = {
      ai2: d.pop(),
      ai3: d.pop(),
      you: d.pop()
    };

    showPickCard(pickAI2El, pickCards.ai2);
    showPickCard(pickAI3El, pickCards.ai3);
    showPickCard(pickYOUEl, pickCards.you);

    const r0 = pickCardRankForLowest(pickCards.ai2);
    const r1 = pickCardRankForLowest(pickCards.ai3);
    const r2 = pickCardRankForLowest(pickCards.you);

    const minRank = Math.min(r0, r1, r2);
    const lowest = [
      { i:0, r:r0 },
      { i:1, r:r1 },
      { i:2, r:r2 }
    ].filter(x => x.r === minRank);

    if (lowest.length > 1) {
      setText(pickStatusEl, "Tie for lowest. Click Re-Pick.");
      if (pickOkBtn) pickOkBtn.disabled = true;
      if (pickReBtn) pickReBtn.disabled = false;
      // do not set dealer yet
      return;
    }

    const dealerI = lowest[0].i;
    applyQuotasForDealer(dealerI);
    setText(pickStatusEl, `Lowest card is ${players[dealerI].id}. Click OK to start.`);
    if (pickOkBtn) pickOkBtn.disabled = false;
    if (pickReBtn) pickReBtn.disabled = true;
    render();
  }

  function acceptPickAndStart() {
    if (!pickCards) { setText(pickStatusEl, "Pick first."); return; }
    // Start first hand (no pluck)
    firstHand = true;
    startNewDeal(/*includePluck=*/false);
  }

  // ---------------- Deal / Hand start ----------------
  function dealHands() {
    const deck = shuffle(makePluckDeck51().slice());

    players.forEach(p => {
      p.hand = [];
      p.tricks = 0;
    });

    // deal 17 each
    for (let i=0; i<TOTAL_TRICKS; i++) {
      players[0].hand.push(deck.pop());
      players[1].hand.push(deck.pop());
      players[2].hand.push(deck.pop());
    }

    trick = [];
    leadSuit = null;
    trickNumber = 0;
    trickMax = TOTAL_TRICKS;

    trumpSuit = null;
    trumpOpen = false;

    lockInput = false;
  }

  function startNewDeal(includePluck) {
    setPhase("DEAL");
    showMsg("Dealing...");
    render();

    // deal
    dealHands();

    // First trick leader is whoever has 2C
    let whoHas2C = 0;
    for (let pi=0; pi<3; pi++) {
      if (players[pi].hand.includes(CARD_OPEN_LEAD)) { whoHas2C = pi; break; }
    }
    leaderIndex = whoHas2C;
    turnIndex = whoHas2C;

    // Phase progression:
    if (includePluck) {
      setPhase("PLUCK");
      // minimal pluck: if there is no pending queue, skip
      pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
      pendingPluckQueue = null;
      activePluck = null;

      if (!pluckQueue.length) {
        showMsg("No plucks this hand. Dealer selects trump.");
        moveToTrumpPick();
      } else {
        showMsg("Pluck Phase: run plucks, then dealer selects trump.");
      }
    } else {
      // first hand: no pluck
      moveToTrumpPick();
    }

    render();
  }

  // ---------------- Minimal pluck (kept simple) ----------------
  function renderPluckStatus() {
    if (!pluckStatusEl || !pluckNextBtn) return;

    if (!pluckQueue.length) {
      setText(pluckStatusEl, "No plucks to process.");
      pluckNextBtn.disabled = true;
      return;
    }
    pluckNextBtn.disabled = false;
    const cur = pluckQueue[0];
    setText(pluckStatusEl, `Pluck queued: ${players[cur.pluckerIndex].id} plucks ${players[cur.pluckeeIndex].id}. Click "Run Next Pluck".`);
  }

  function runOnePluck() {
    // NOTE: This is intentionally minimal so your game stays playable.
    // You can re-introduce the full “hairy pluck” logic later once clicks are 100% stable.
    if (phase !== "PLUCK") return;
    if (!pluckQueue.length) { moveToTrumpPick(); return; }

    const cur = pluckQueue.shift();
    showMsg(`Pluck executed (simplified): ${players[cur.pluckerIndex].id} → ${players[cur.pluckeeIndex].id}.`);
    if (!pluckQueue.length) moveToTrumpPick();
    render();
  }

  // ---------------- Trump pick (Dealer selects) ----------------
  function dealerChoosesTrumpFromOwnHand(dealerI) {
    const suitScore = { S:0, H:0, D:0, C:0 };
    for (const cs of players[dealerI].hand) {
      if (isJoker(cs)) { SUITS.forEach(s => suitScore[s] += 6); continue; }
      const suit = cs.slice(-1);
      const rank = cs.slice(0, cs.length-1);
      const v = RANK_VALUE[rank] || 0;
      suitScore[suit] += 2; // length
      if (v >= 11) suitScore[suit] += (v - 10) * 2;
      else suitScore[suit] += Math.max(0, v - 6) * 0.5;
    }
    let bestSuit = "H", best = -999;
    for (const s of SUITS) if (suitScore[s] > best) { best = suitScore[s]; bestSuit = s; }
    return bestSuit;
  }

  function setTrump(suit) {
    trumpSuit = suit;
    // trump open rule (keep your current behavior: clubs opens immediately)
    trumpOpen = (trumpSuit === "C");
    showTrumpAce();
  }

  function showTrumpAce() {
    if (!trumpAceSlotEl) return;
    trumpAceSlotEl.innerHTML = "";
    if (!trumpSuit) { trumpAceSlotEl.textContent = "(none)"; return; }
    const aceCard = "A" + trumpSuit;
    const face = makeCardFace(aceCard, true);
    trumpAceSlotEl.appendChild(face);
  }

  function renderTrumpPickStatus() {
    if (!trumpStatusEl) return;
    if (trumpSuit) {
      setText(trumpStatusEl, `Trump picked: ${trumpSuit} (${suitName(trumpSuit)}).`);
      return;
    }
    setText(trumpStatusEl, `${players[dealerIndex].id} is Dealer and selects trump now.`);
  }

  function moveToTrumpPick() {
    setPhase("TRUMP_PICK");
    render();

    // If dealer is AI, pick immediately
    if (dealerIndex !== 2) {
      const s = dealerChoosesTrumpFromOwnHand(dealerIndex);
      setTrump(s);
      showMsg(`${players[dealerIndex].id} picked trump: ${s} (${suitName(s)}). Starting play...`);
      moveToPlay();
      return;
    }

    // Dealer is YOU: enable buttons
    showMsg("You are Dealer. Select trump.");
  }

  function wireTrumpButtons() {
    if (!trumpPanelEl) return;
    const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
    btns.forEach(b => {
      b.addEventListener("click", () => {
        if (phase !== "TRUMP_PICK") return;
        if (trumpSuit) return;
        if (dealerIndex !== 2) return;

        const suit = b.getAttribute("data-trump");
        if (!SUITS.includes(suit)) return;

        setTrump(suit);
        showMsg(`You picked trump: ${suit} (${suitName(suit)}). Starting play...`);
        moveToPlay();
      });
    });
  }

  // ---------------- Play rules ----------------
  function hasSuit(playerIndex, suitToCheck) {
    return players[playerIndex].hand.some(c => cardSuitForFollow(c, trumpSuit) === suitToCheck);
  }

  function illegalReason(playerIndex, cardStr) {
    // Trick 1: must lead 2C if you have it AND you are leading
    if (trickNumber === 1 && trick.length === 0 && players[playerIndex].hand.includes(CARD_OPEN_LEAD)) {
      if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
    }

    // Follow suit if possible
    if (trick.length > 0) {
      const mustSuit = leadSuit;
      const hasMust = hasSuit(playerIndex, mustSuit);
      if (hasMust && cardSuitForFollow(cardStr, trumpSuit) !== mustSuit) {
        return `You must follow suit: ${mustSuit}.`;
      }
    }

    return "That play is not allowed.";
  }

  function legalIndexesFor(playerIndex) {
    const hand = players[playerIndex].hand;

    // Trick 1: leader must play 2C if they have it
    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
      return hand.map((c,i)=>({c,i})).filter(x=>x.c === CARD_OPEN_LEAD).map(x=>x.i);
    }

    // Follow suit if possible
    if (trick.length > 0) {
      const suited = hand.map((c,i)=>({c,i})).filter(x => cardSuitForFollow(x.c, trumpSuit) === leadSuit).map(x=>x.i);
      return suited.length ? suited : hand.map((_,i)=>i);
    }

    // leading: any card allowed
    return hand.map((_,i)=>i);
  }

  function setLeadSuitFromFirstCard(cardStr) {
    leadSuit = cardSuitForFollow(cardStr, trumpSuit);
  }

  function cardPower(cardStr) {
    // jokers highest
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
        if (p > bestP) { bestP = p; bestPi = t.playerIndex; }
      }
      return bestPi;
    }

    // No trump: highest of lead suit
    let bestPi = trick[0].playerIndex;
    let bestV = -1;
    for (const t of trick) {
      if (cardSuitForFollow(t.cardStr, trumpSuit) !== leadSuit) continue;
      const v = parseCard(t.cardStr).value;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi;
  }

  function playCard(playerIndex, handIdx) {
    const cardStr = players[playerIndex].hand.splice(handIdx, 1)[0];
    if (!cardStr) { showError("Tried to play empty card."); return; }

    if (trick.length === 0) {
      setLeadSuitFromFirstCard(cardStr);
      trickNumber = (trickNumber === 0 ? 1 : trickNumber);
    }

    trick.push({ playerIndex, cardStr });

    // If any trump is played, trump becomes open
    if (!trumpOpen && isTrumpCard(cardStr, trumpSuit)) trumpOpen = true;

    // advance turn
    turnIndex = (turnIndex + 1) % 3;

    render();
    maybeContinue();
  }

  // ---------------- AI choice (simple: always tries to win) ----------------
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
        const v = parseCard(t.cardStr).value;
        if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
      }
      return bestPi === playerIndex;
    }
  }

  function chooseAiIndex(playerIndex) {
    const legal = legalIndexesFor(playerIndex);
    const hand = players[playerIndex].hand;

    // If it can win now, pick the cheapest winning card. Else dump the cheapest legal.
    let winChoices = [];
    for (const idx of legal) {
      const c = hand[idx];
      if (trick.length === 0) {
        // leading: "try to win" = lead higher generally, but don't burn BJ/LJ early unless needed
        // We'll treat lead as: pick best mid/high non-joker unless very late.
        // Keep it simple: lead highest non-joker, but if only jokers then joker.
        continue;
      }
      if (wouldWinIfPlayedNow(playerIndex, c)) winChoices.push(idx);
    }

    function cost(cardStr) {
      if (cardStr === CARD_BIG_JOKER) return 10000;
      if (cardStr === CARD_LITTLE_JOKER) return 9000;
      return cardPower(cardStr);
    }

    if (trick.length > 0 && winChoices.length) {
      winChoices.sort((a,b)=> cost(hand[a]) - cost(hand[b]));
      return winChoices[0];
    }

    if (trick.length === 0) {
      // lead: choose strong but avoid burning jokers: highest non-joker, else LJ then BJ
      const nonJ = legal.filter(i => !isJoker(hand[i]));
      if (nonJ.length) {
        nonJ.sort((a,b)=> cardPower(hand[b]) - cardPower(hand[a]));
        return nonJ[0];
      }
      // only jokers
      const hasLJ = legal.find(i => hand[i] === CARD_LITTLE_JOKER);
      if (hasLJ !== undefined) return hasLJ;
      return legal[0];
    }

    // can't win: dump cheapest legal
    legal.sort((a,b)=> cost(hand[a]) - cost(hand[b]));
    return legal[0];
  }

  // ---------------- Turn loop ----------------
  function moveToPlay() {
    setPhase("PLAY");
    showMsg("Play begins. Trick winner leads next trick.");
    render();
    maybeContinue();
  }

  function roundIsOver() {
    return players.every(p => p.hand.length === 0) && trick.length === 0;
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
      render();

      setTimeout(() => {
        const winner = evaluateTrickWinner();
        players[winner].tricks += 1;
        showMsg(`${players[winner].id} wins the trick.`);
        render();

        setTimeout(() => {
          clearTrickForNext(winner);
          lockInput = false;

          // if hands empty, end hand
          if (roundIsOver()) {
            showMsg("Hand over. Click Reset (New Deal).");
            firstHand = false;
            // Build pluck queue for next deal later (kept minimal here)
            pendingPluckQueue = []; // you can re-enable real pluck later
            render();
            return;
          }

          render();
          setTimeout(() => maybeContinue(), BETWEEN_TRICKS_MS);
        }, BETWEEN_TRICKS_MS);

      }, TRICK_RESOLVE_MS);

      return;
    }

    // AI turn?
    if (turnIndex !== 2) {
      lockInput = true;
      render();

      setTimeout(() => {
        const aiIdx = chooseAiIndex(turnIndex);
        playCard(turnIndex, aiIdx);
        lockInput = false;
        render();
      }, AI_DELAY_MS);
    } else {
      // your turn: unlock input
      lockInput = false;
      render();
    }
  }

  // ---------------- Reset / New Deal ----------------
  function newDealFromReset() {
    if (phase === "PICK_DEALER") {
      showMsg("Pick dealer first.");
      return;
    }

    // after first hand, rotate dealer right
    if (!firstHand) rotateDealerRight();

    // new deal includes pluck AFTER first hand
    startNewDeal(/*includePluck=*/!firstHand);
  }

  // ---------------- Wire events ----------------
  on(resetBtn, "click", (e) => { e.preventDefault(); newDealFromReset(); });

  on(pluckNextBtn, "click", (e) => { e.preventDefault(); runOnePluck(); });

  on(pickBtn, "click", (e) => {
    e.preventDefault();
    setPhase("PICK_DEALER");
    if (pickOkBtn) pickOkBtn.disabled = true;
    if (pickReBtn) pickReBtn.disabled = true;
    setText(pickStatusEl, "Picking...");
    doPickCards();
  });

  on(pickReBtn, "click", (e) => {
    e.preventDefault();
    if (pickOkBtn) pickOkBtn.disabled = true;
    if (pickReBtn) pickReBtn.disabled = true;
    setText(pickStatusEl, "Re-picking...");
    doPickCards();
  });

  on(pickOkBtn, "click", (e) => {
    e.preventDefault();
    acceptPickAndStart();
  });

  wireTrumpButtons();

  // ---------------- Init ----------------
  function init() {
    // default quotas before pick
    applyQuotasForDealer(0);

    clearPickSlots();
    if (pickOkBtn) pickOkBtn.disabled = true;
    if (pickReBtn) pickReBtn.disabled = true;

    setPhase("PICK_DEALER");
    setText(pickStatusEl, "Click “Pick Cards”.");
    showMsg("Ready. Pick dealer to start.");
    render();
  }

  init();
  console.log("Pluck Web Demo v19.1 loaded");

})();
