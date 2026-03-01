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
  const pluckStatusEl = $("pluckStatus");
  const pluckChoicesEl = $("pluckChoices");
  const pluckNextBtn = $("pluckNextBtn");

  const trumpPanelEl = $("trumpPanel");
  const trumpStatusEl = $("trumpStatus");

  // Dealer pick panel (left side)
  const pickBtn = $("pickBtn");
  const pickOkBtn = $("pickOkBtn");
  const pickReBtn = $("pickReBtn");
  const pickStatusEl = $("pickStatus");
  const pickAI2El = $("pickAI2");
  const pickAI3El = $("pickAI3");
  const pickYOUEl = $("pickYOU");
  const dealerLabelEl = $("dealerLabel");
  const dealerBannerEl = $("dealerBanner");

  const trumpAceSlotEl = $("trumpAceSlot");

  // ---------- core constants ----------
  const TOTAL_TRICKS = 17;
  const SUITS = ["S", "H", "D", "C"];
  const SUIT_NAME = { S:"Spades", H:"Hearts", D:"Diamonds", C:"Clubs" };
  const SUIT_SYMBOL = { S:"♠", H:"♥", D:"♦", C:"♣" };

  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C"; // first trick lead

  // Card images (optional). If files missing, fallback auto.
  const USE_CARD_IMAGES = true;
  const CARD_IMG_DIR = "assets/cards"; // expects assets/cards/AS.png etc, BJ.png, LJ.png, 2C.png

  // Speed (tablet friendly)
  const AI_DELAY_MS = 320;
  const TRICK_RESOLVE_MS = 360;
  const BETWEEN_TRICKS_MS = 300;

  function isJoker(cs){ return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }
  function isRedSuit(s){ return s === "H" || s === "D"; }

  // ---------- deck ----------
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
    if (cs === CARD_BIG_JOKER) return { raw:cs, kind:"JOKER", suit:trumpSuit, value:1000 };
    if (cs === CARD_LITTLE_JOKER) return { raw:cs, kind:"JOKER", suit:trumpSuit, value:900 };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    return { raw:cs, kind:"NORMAL", suit, rank, value:RANK_VALUE[rank] };
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

  // ---------- players ----------
  // 0=AI2, 1=AI3, 2=YOU
  const players = [
    { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7, plucksEarned:0, plucksSuffered:0 },
    { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6, plucksEarned:0, plucksSuffered:0 },
    { id:"YOU", name:"You",            hand:[], tricks:0, quota:4, plucksEarned:0, plucksSuffered:0 }
  ];

  let dealerIndex = 0;           // set by initial pick, then rotates right each new hand
  const leftOf = (i) => (i + 1) % 3;
  const rightOf = (i) => (i + 2) % 3;

  function applyQuotasFromDealer() {
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }
  function rotateDealerRight() {
    dealerIndex = rightOf(dealerIndex);
    applyQuotasFromDealer();
  }

  // ---------- memory (public inference only) ----------
  let memory = null;
  function resetMemory() {
    memory = { played:new Set(), voidSuits:[new Set(), new Set(), new Set()] };
  }

  // ---------- state ----------
  // PHASES: PICK_DEALER, DEAL, PLUCK, TRUMP_PICK, PLAY
  let phase = "PICK_DEALER";

  let trumpSuit = null;
  let trumpOpen = false;

  let leaderIndex = 0;
  let turnIndex = 0;
  let leadSuit = null;
  let trick = [];
  let lockInput = false;

  let trickNumber = 0;
  let firstHand = true;

  // plucks
  let pendingPluckQueue = null; // computed at end of hand, used at next deal
  let pluckQueue = [];
  let activePluck = null;
  let pluckSuitUsedByPair = new Map(); // "plucker-pluckee" => Set(suits)

  // ---------- UI helpers ----------
  function setPhaseChipActive() {
    if (!pDeal || !pPluck || !pTrump || !pPlay) return;
    [pDeal,pPluck,pTrump,pPlay].forEach(x => x.classList.remove("activeChip"));
    if (phase === "DEAL") pDeal.classList.add("activeChip");
    if (phase === "PLUCK") pPluck.classList.add("activeChip");
    if (phase === "TRUMP_PICK") pTrump.classList.add("activeChip");
    if (phase === "PLAY") pPlay.classList.add("activeChip");
  }

  function setPhase(newPhase) {
    phase = newPhase;
    setText(phaseLabelEl, newPhase);
    setPhaseChipActive();

    if (pluckPanelEl) pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
    if (trumpPanelEl) trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";

    // ensure hidden panels don't eat taps
    if (pluckPanelEl && pluckPanelEl.style.display === "none") pluckPanelEl.style.pointerEvents = "none";
    if (pluckPanelEl && pluckPanelEl.style.display !== "none") pluckPanelEl.style.pointerEvents = "auto";
    if (trumpPanelEl && trumpPanelEl.style.display === "none") trumpPanelEl.style.pointerEvents = "none";
    if (trumpPanelEl && trumpPanelEl.style.display !== "none") trumpPanelEl.style.pointerEvents = "auto";
  }

  function updateDealerLabels() {
    const d = players[dealerIndex].id;
    setText(dealerLabelEl, d);
    setText(dealerBannerEl, d);
  }

  function updateTrumpLabels() {
    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${SUIT_NAME[trumpSuit]})` : "(not picked)");
    setText(trumpOpenLabelEl, trumpOpen ? "Yes" : "No");

    // show ace of trump on left panel if present
    if (trumpAceSlotEl) {
      trumpAceSlotEl.innerHTML = "";
      if (!trumpSuit) {
        trumpAceSlotEl.textContent = "(none)";
      } else {
        const ace = "A" + trumpSuit;
        trumpAceSlotEl.appendChild(makeCardFace(ace, true));
      }
    }
  }

  function updateScoreboard() {
    setText(ai2TricksEl, String(players[0].tricks));
    setText(ai3TricksEl, String(players[1].tricks));
    setText(youTricksEl, String(players[2].tricks));

    setText(ai2QuotaEl, String(players[0].quota));
    setText(ai3QuotaEl, String(players[1].quota));
    setText(youQuotaEl, String(players[2].quota));
  }

  function updateTrickCounters() {
    setText(trickNumEl, String(trickNumber));
    setText(trickMaxEl, String(TOTAL_TRICKS));
  }

  function updateTurnBanner() {
    if (!turnBannerEl) return;
    const whoseTurn = (phase === "PLAY") ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`) : "—";
    turnBannerEl.textContent = `Phase: ${phase} • Dealer: ${players[dealerIndex].id} • Leader: ${players[leaderIndex].id} • ${whoseTurn}`;
  }

  // ---------- card faces (image + fallback) ----------
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
    const sym = SUIT_SYMBOL[suit] || suit;

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

    // IMPORTANT: image must not steal taps (tablet fix)
    img.style.pointerEvents = "none";

    img.onerror = () => {
      const fb = makeCardFaceFallback(cardStr, disabled);
      el.replaceWith(fb);
    };

    el.appendChild(img);
    return el;
  }

  // ---------- sorting (your hand) ----------
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

  // ---------- rendering ----------
  function renderPickCard(slotEl, cardStr) {
    if (!slotEl) return;
    slotEl.innerHTML = "";
    if (!cardStr) { slotEl.textContent = "(none)"; return; }
    slotEl.appendChild(makeCardFace(cardStr, true));
  }

  function renderHandsAndTrick() {
    // your hand
    handEl.innerHTML = "";
    const sorted = sortHandForDisplay(players[2].hand);

    for (const c of sorted) {
      // map display card -> real index in actual hand
      const realIdx = players[2].hand.indexOf(c);

      const isPlayableTurn = (phase === "PLAY" && turnIndex === 2 && !lockInput);
      const legal = isPlayableTurn ? legalIndexesFor(2) : [];
      const disabled = !isPlayableTurn || !legal.includes(realIdx);

      const face = makeCardFace(c, disabled);

      // Tablet-safe: use pointerup (and click as backup)
      const handler = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
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

      on(face, "pointerup", handler);
      on(face, "click", handler);

      handEl.appendChild(face);
    }

    // trick
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

    // AI hidden hands
    if (ai2HandEl) ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
    if (ai3HandEl) ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");
  }

  function render() {
    updateDealerLabels();
    updateTrumpLabels();
    updateScoreboard();
    updateTrickCounters();
    updateTurnBanner();
    renderHandsAndTrick();

    if (phase === "PLUCK") renderPluckStatus();
    if (phase === "TRUMP_PICK") renderTrumpPickStatus();
  }

  // ---------- initial dealer pick ----------
  let pickCards = { AI2:null, AI3:null, YOU:null };

  function pickRankPower(cs) {
    // jokers are highest; we need LOWEST card deals
    if (cs === CARD_BIG_JOKER) return 1000;
    if (cs === CARD_LITTLE_JOKER) return 900;
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    const v = RANK_VALUE[rank] || 0;
    // include suit tiebreak so "lowest" is stable if needed (but ties are repicked anyway)
    const s = { C:1, D:2, H:3, S:4 }[suit] || 9;
    return v * 10 + s;
  }

  function doPickDealer() {
    setPhase("PICK_DEALER");
    trumpSuit = null;
    trumpOpen = false;
    render();

    // enable/disable buttons
    if (pickOkBtn) pickOkBtn.disabled = true;
    if (pickReBtn) pickReBtn.disabled = true;

    const deck = shuffle(makePluckDeck51().slice());
    pickCards.AI2 = deck.pop();
    pickCards.AI3 = deck.pop();
    pickCards.YOU = deck.pop();

    renderPickCard(pickAI2El, pickCards.AI2);
    renderPickCard(pickAI3El, pickCards.AI3);
    renderPickCard(pickYOUEl, pickCards.YOU);

    const vals = [
      { i:0, id:"AI2", c:pickCards.AI2, p:pickRankPower(pickCards.AI2) },
      { i:1, id:"AI3", c:pickCards.AI3, p:pickRankPower(pickCards.AI3) },
      { i:2, id:"YOU", c:pickCards.YOU, p:pickRankPower(pickCards.YOU) },
    ].sort((a,b)=>a.p-b.p);

    const low = vals[0].p;
    const tiedLow = vals.filter(x=>x.p===low);

    if (tiedLow.length > 1) {
      setText(pickStatusEl, "Tie for lowest card. Click Re-Pick.");
      if (pickReBtn) pickReBtn.disabled = false;
      if (pickOkBtn) pickOkBtn.disabled = true;
      setText(dealerLabelEl, "(tied)");
      setText(dealerBannerEl, "(tied)");
      showMsg("Tie for lowest pick. Re-pick required.");
      return;
    }

    const winner = vals[0]; // lowest deals
    dealerIndex = winner.i;
    applyQuotasFromDealer();
    updateDealerLabels();
    setText(pickStatusEl, `${winner.id} drew the lowest card and will deal. Click OK.`);
    if (pickOkBtn) pickOkBtn.disabled = false;
    if (pickReBtn) pickReBtn.disabled = true;
    showMsg("Dealer selected. Click OK to start the first hand.");
    render();
  }

  function acceptPickAndStartGame() {
    firstHand = true;
    pendingPluckQueue = null;
    startNewHand();
  }

  // ---------- deal / hand flow ----------
  function dealHands() {
    resetMemory();

    const deck = shuffle(makePluckDeck51());
    players.forEach(p => {
      p.hand = [];
      p.tricks = 0;
      p.plucksEarned = 0;
      p.plucksSuffered = 0;
    });

    for (let i=0;i<TOTAL_TRICKS;i++) {
      players[0].hand.push(deck.pop());
      players[1].hand.push(deck.pop());
      players[2].hand.push(deck.pop());
    }

    trickNumber = 0;
    trick = [];
    leadSuit = null;

    trumpSuit = null;
    trumpOpen = false;

    pluckSuitUsedByPair = new Map();
    activePluck = null;

    // default leader for trick 1 will be who holds 2C
    leaderIndex = 0;
    turnIndex = 0;
    lockInput = false;
  }

  function startNewHand() {
    setPhase("DEAL");
    dealHands();
    render();

    // First hand: no pluck phase
    if (firstHand) {
      firstHand = false;
      showMsg("First hand: Dealer selects trump (no plucks yet).");
      moveToTrumpPick();
      return;
    }

    // Later hands: run pluck phase first IF there are pending plucks
    pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
    pendingPluckQueue = null;

    if (pluckQueue.length === 0) {
      showMsg("No plucks this hand. Dealer selects trump.");
      moveToTrumpPick();
      return;
    }

    setPhase("PLUCK");
    showMsg("Pluck phase begins (manual).");
    render();
  }

  // ---------- plucks ----------
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

  function clearPluckChoicesUI() { if (pluckChoicesEl) pluckChoicesEl.innerHTML = ""; }

  function renderPluckStatus() {
    if (!pluckStatusEl) return;
    clearPluckChoicesUI();

    if (pluckQueue.length === 0) {
      setText(pluckStatusEl, "No plucks to process.");
      if (pluckNextBtn) pluckNextBtn.disabled = true;
      return;
    }

    if (!activePluck) activePluck = pluckQueue[0];
    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;

    const suits = availablePluckSuits(pluckerI, pluckeeI);

    // YOU pluck = choose suit
    if (pluckerI === 2) {
      if (pluckNextBtn) pluckNextBtn.disabled = true;

      if (suits.length === 0) {
        setText(pluckStatusEl, `You are plucking ${players[pluckeeI].name}, but you have no suit to attempt. Skipping.`);
        return;
      }

      setText(pluckStatusEl, `You are plucking ${players[pluckeeI].name}. Choose a suit. Wrong suit attempt = LOST.`);

      for (const s of suits) {
        const give = lowestOfSuitNonJoker(pluckerI, s);

        const btn = document.createElement("button");
        btn.className = "btn";
        btn.style.padding = "10px 12px";
        btn.innerHTML = `<strong>${s}</strong> (${SUIT_NAME[s]})<div style="font-size:12px;opacity:.85;">Give: ${give || "(none)"}</div>`;

        on(btn, "click", () => {
          const res = attemptPluck(pluckerI, pluckeeI, s);
          if (!res.ok) {
            markPluckSuitUsed(pluckerI, pluckeeI, s);
            setText(pluckStatusEl, `You attempted ${s} and FAILED (${res.reason}). Pluck is LOST.`);
          } else {
            setText(pluckStatusEl, `You plucked ${s}: gave ${res.giveLow}, received ${res.takeHigh}.`);
          }
          pluckQueue.shift();
          activePluck = null;

          if (pluckQueue.length === 0) {
            moveToTrumpPick();
          } else {
            render();
          }
        });

        pluckChoicesEl.appendChild(btn);
      }

      return;
    }

    // AI pluck uses Run Next
    if (pluckNextBtn) pluckNextBtn.disabled = false;

    if (suits.length === 0) {
      setText(pluckStatusEl, `${players[pluckerI].name} is plucking ${players[pluckeeI].name}, but has no suit. Will skip.`);
    } else {
      setText(pluckStatusEl, `${players[pluckerI].name} is plucking ${players[pluckeeI].name}. Candidates: ${suits.join(", ")}.`);
    }
  }

  function runOnePluck() {
    if (phase !== "PLUCK") return;
    if (pluckQueue.length === 0) return;

    if (!activePluck) activePluck = pluckQueue[0];
    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;

    // if it's YOU, you must use buttons
    if (pluckerI === 2) {
      showMsg("Choose a suit button to pluck.");
      render();
      return;
    }

    const suits = availablePluckSuits(pluckerI, pluckeeI);
    if (suits.length === 0) {
      if (pluckStatusEl) setText(pluckStatusEl, `No available suit for ${players[pluckerI].name} -> ${players[pluckeeI].name}. Skipped.`);
      pluckQueue.shift();
      activePluck = null;
      if (pluckQueue.length === 0) moveToTrumpPick();
      render();
      return;
    }

    // AI chooses a random available suit (blind)
    const pick = suits[Math.floor(Math.random() * suits.length)];
    const res = attemptPluck(pluckerI, pluckeeI, pick);

    if (pluckStatusEl) {
      if (!res.ok) {
        markPluckSuitUsed(pluckerI, pluckeeI, pick);
        setText(pluckStatusEl, `${players[pluckerI].name} attempted ${pick} and FAILED (${res.reason}). Pluck is LOST.`);
      } else {
        setText(pluckStatusEl, `${players[pluckerI].name} plucked ${pick}: gave ${res.giveLow}, received ${res.takeHigh}.`);
      }
    }

    pluckQueue.shift();
    activePluck = null;

    if (pluckQueue.length === 0) moveToTrumpPick();
    render();
  }

  // ---------- trump pick ----------
  function computeTrumpCallerIndex() {
    // Dealer selects trump (your requirement)
    return dealerIndex;
  }

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

      suitScore[suit] += 2;
      if (v >= 11) suitScore[suit] += (v - 10) * 2;
      else suitScore[suit] += Math.max(0, v - 6) * 0.5;
    }

    let bestSuit = "S", bestScore = -Infinity;
    for (const s of SUITS) {
      if (suitScore[s] > bestScore) { bestScore = suitScore[s]; bestSuit = s; }
    }
    return bestSuit;
  }

  function setTrump(suit) {
    trumpSuit = suit;
    // trump opens when a trump card is played; start closed
    trumpOpen = false;
    updateTrumpLabels();
  }

  function renderTrumpPickStatus() {
    if (!trumpStatusEl) return;

    if (trumpSuit) {
      setText(trumpStatusEl, `Trump picked: ${trumpSuit} (${SUIT_NAME[trumpSuit]}).`);
      return;
    }

    const caller = players[computeTrumpCallerIndex()];
    if (dealerIndex === 2) {
      setText(trumpStatusEl, `You are the Dealer. Select trump now.`);
    } else {
      setText(trumpStatusEl, `${caller.name} is the Dealer and will select trump now.`);
    }
  }

  function wireTrumpButtons() {
    if (!trumpPanelEl) return;
    const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
    btns.forEach(b => {
      b.addEventListener("click", () => {
        if (phase !== "TRUMP_PICK") return;
        if (trumpSuit) return;
        if (dealerIndex !== 2) return; // only YOU click if YOU are dealer

        const suit = b.getAttribute("data-trump");
        if (!SUITS.includes(suit)) return;

        setTrump(suit);
        showMsg(`You selected trump: ${suit} (${SUIT_NAME[suit]}).`);
        moveToPlay();
      });
    });
  }

  function moveToTrumpPick() {
    setPhase("TRUMP_PICK");
    renderTrumpPickStatus();
    render();

    const caller = computeTrumpCallerIndex();
    if (caller !== 2) {
      // AI dealer selects trump immediately
      const suit = aiChooseTrumpFromOwnHand(caller);
      setTrump(suit);
      showMsg(`${players[caller].name} (Dealer) selected trump: ${suit} (${SUIT_NAME[suit]}).`);
      moveToPlay();
    } else {
      showMsg("Dealer selects trump: choose a suit.");
    }
  }

  // ---------- play rules ----------
  function hasSuit(playerIndex, suit) {
    return players[playerIndex].hand.some(c => cardSuitForFollow(c, trumpSuit) === suit);
  }

  function hasNonTrump(playerIndex) {
    return players[playerIndex].hand.some(c => !isTrumpCard(c, trumpSuit));
  }

  function illegalReason(playerIndex, cardStr) {
    // first trick lead must be 2C if you have it
    if (trickNumber === 1 && trick.length === 0 && players[playerIndex].hand.includes(CARD_OPEN_LEAD)) {
      if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
    }

    // follow suit if possible
    if (trick.length > 0) {
      const mustSuit = leadSuit;
      const has = hasSuit(playerIndex, mustSuit);
      if (has && cardSuitForFollow(cardStr, trumpSuit) !== mustSuit) return `You must follow suit: ${mustSuit}.`;
    }

    // trump not open: cannot lead trump if you have non-trump
    if (trick.length === 0 && !trumpOpen) {
      if (isTrumpCard(cardStr, trumpSuit) && hasNonTrump(playerIndex)) return "Trump not open. Lead a non-trump card.";
    }

    return "That play is not allowed.";
  }

  function legalIndexesFor(playerIndex) {
    const hand = players[playerIndex].hand;

    // first lead must be 2C if in hand
    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
      return hand.map((c,i)=>({c,i})).filter(x=>x.c === CARD_OPEN_LEAD).map(x=>x.i);
    }

    // if leading and trump not open, must lead non-trump if you have any
    if (trick.length === 0 && !trumpOpen) {
      const nonTrumpIdx = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c, trumpSuit)).map(x=>x.i);
      if (nonTrumpIdx.length) return nonTrumpIdx;
      return hand.map((_,i)=>i);
    }

    // if following, must follow suit if possible
    if (trick.length > 0) {
      const suited = hand.map((c,i)=>({c,i})).filter(x => cardSuitForFollow(x.c, trumpSuit) === leadSuit).map(x=>x.i);
      return suited.length ? suited : hand.map((_,i)=>i);
    }

    return hand.map((_,i)=>i);
  }

  function setLeadSuitFromFirstCard(cardStr) {
    leadSuit = cardSuitForFollow(cardStr, trumpSuit);
  }

  function updateTrumpOpenOnPlay(cardStr) {
    if (!trumpOpen && isTrumpCard(cardStr, trumpSuit)) trumpOpen = true;
  }

  function cardPower(cardStr) {
    // Jokers top
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
      const v = parseCard(t.cardStr, trumpSuit).value;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
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

  function playCard(playerIndex, handIdx) {
    const cardStr = players[playerIndex].hand.splice(handIdx, 1)[0];
    if (!cardStr) { showError("Tried to play empty card."); return; }

    if (trick.length === 0) setLeadSuitFromFirstCard(cardStr);
    trick.push({ playerIndex, cardStr });

    memory.played.add(cardStr);
    updateTrumpOpenOnPlay(cardStr);
    updateTrumpLabels();

    turnIndex = (turnIndex + 1) % 3;
    render();
    maybeContinue();
  }

  // AI chooses: try to win the trick if possible; otherwise dump lowest legal
  function chooseAiIndex(playerIndex) {
    const legal = legalIndexesFor(playerIndex);
    const hand = players[playerIndex].hand;

    // If can win now, play the cheapest winning card.
    let bestWinning = null;

    for (const idx of legal) {
      const card = hand[idx];
      if (wouldWinIfPlayedNow(playerIndex, card)) {
        const pow = cardPower(card);
        if (!bestWinning || pow < bestWinning.pow) bestWinning = { idx, pow };
      }
    }
    if (bestWinning) return bestWinning.idx;

    // else dump lowest power legal
    let bestIdx = legal[0];
    let bestPow = Infinity;
    for (const idx of legal) {
      const pow = cardPower(hand[idx]);
      if (pow < bestPow) { bestPow = pow; bestIdx = idx; }
    }
    return bestIdx;
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
    }

    // no trump yet in temp: best of lead suit
    const ls = (trick.length === 0) ? cardSuitForFollow(cardStr, trumpSuit) : leadSuit;
    let bestPi = temp[0].playerIndex;
    let bestV = -1;
    for (const t of temp) {
      if (cardSuitForFollow(t.cardStr, trumpSuit) !== ls) continue;
      const v = parseCard(t.cardStr, trumpSuit).value;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi === playerIndex;
  }

  function startTrickOne() {
    trick = [];
    leadSuit = null;
    trickNumber = 1;

    // leader is whoever holds 2C
    let whoHas2C = 0;
    for (let pi=0; pi<3; pi++) {
      if (players[pi].hand.includes(CARD_OPEN_LEAD)) { whoHas2C = pi; break; }
    }
    leaderIndex = whoHas2C;
    turnIndex = whoHas2C;

    render();
    maybeContinue();
  }

  function moveToPlay() {
    setPhase("PLAY");
    showMsg("Trump set. Trick 1 begins.");
    startTrickOne();
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

            showMsg("Hand over. Click Reset for next deal.");
            return;
          }

          maybeContinue();
        }, BETWEEN_TRICKS_MS);

      }, TRICK_RESOLVE_MS);

      return;
    }

    // AI turn
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

  // ---------- events ----------
  wireTrumpButtons();

  on(pluckNextBtn, "click", () => runOnePluck());

  on(resetBtn, "click", () => {
    // new deal: rotate dealer right after first hand begins
    rotateDealerRight();
    showMsg("New deal. (Dealer rotated right.)");
    startNewHand();
  });

  on(pickBtn, "click", () => doPickDealer());
  on(pickReBtn, "click", () => doPickDealer());
  on(pickOkBtn, "click", () => acceptPickAndStartGame());

  // ---------- boot ----------
  // Start by forcing dealer pick flow
  setPhase("PICK_DEALER");
  applyQuotasFromDealer();
  updateDealerLabels();
  updateTrumpLabels();
  updateScoreboard();
  updateTrickCounters();
  updateTurnBanner();

  // Ensure pick UI is ready
  if (pickOkBtn) pickOkBtn.disabled = true;
  if (pickReBtn) pickReBtn.disabled = true;
  setText(pickStatusEl, "Click “Pick Cards”.");
  renderPickCard(pickAI2El, null);
  renderPickCard(pickAI3El, null);
  renderPickCard(pickYOUEl, null);

  render();
  log("v19 loaded. Waiting for dealer pick.");

})();// Pluck Web Demo v19 (single-file replacement)
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
  const pluckStatusEl = $("pluckStatus");
  const pluckChoicesEl = $("pluckChoices");
  const pluckNextBtn = $("pluckNextBtn");

  const trumpPanelEl = $("trumpPanel");
  const trumpStatusEl = $("trumpStatus");

  // Dealer pick panel (left side)
  const pickBtn = $("pickBtn");
  const pickOkBtn = $("pickOkBtn");
  const pickReBtn = $("pickReBtn");
  const pickStatusEl = $("pickStatus");
  const pickAI2El = $("pickAI2");
  const pickAI3El = $("pickAI3");
  const pickYOUEl = $("pickYOU");
  const dealerLabelEl = $("dealerLabel");
  const dealerBannerEl = $("dealerBanner");

  const trumpAceSlotEl = $("trumpAceSlot");

  // ---------- core constants ----------
  const TOTAL_TRICKS = 17;
  const SUITS = ["S", "H", "D", "C"];
  const SUIT_NAME = { S:"Spades", H:"Hearts", D:"Diamonds", C:"Clubs" };
  const SUIT_SYMBOL = { S:"♠", H:"♥", D:"♦", C:"♣" };

  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C"; // first trick lead

  // Card images (optional). If files missing, fallback auto.
  const USE_CARD_IMAGES = true;
  const CARD_IMG_DIR = "assets/cards"; // expects assets/cards/AS.png etc, BJ.png, LJ.png, 2C.png

  // Speed (tablet friendly)
  const AI_DELAY_MS = 320;
  const TRICK_RESOLVE_MS = 360;
  const BETWEEN_TRICKS_MS = 300;

  function isJoker(cs){ return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }
  function isRedSuit(s){ return s === "H" || s === "D"; }

  // ---------- deck ----------
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
    if (cs === CARD_BIG_JOKER) return { raw:cs, kind:"JOKER", suit:trumpSuit, value:1000 };
    if (cs === CARD_LITTLE_JOKER) return { raw:cs, kind:"JOKER", suit:trumpSuit, value:900 };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    return { raw:cs, kind:"NORMAL", suit, rank, value:RANK_VALUE[rank] };
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

  // ---------- players ----------
  // 0=AI2, 1=AI3, 2=YOU
  const players = [
    { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7, plucksEarned:0, plucksSuffered:0 },
    { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6, plucksEarned:0, plucksSuffered:0 },
    { id:"YOU", name:"You",            hand:[], tricks:0, quota:4, plucksEarned:0, plucksSuffered:0 }
  ];

  let dealerIndex = 0;           // set by initial pick, then rotates right each new hand
  const leftOf = (i) => (i + 1) % 3;
  const rightOf = (i) => (i + 2) % 3;

  function applyQuotasFromDealer() {
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }
  function rotateDealerRight() {
    dealerIndex = rightOf(dealerIndex);
    applyQuotasFromDealer();
  }

  // ---------- memory (public inference only) ----------
  let memory = null;
  function resetMemory() {
    memory = { played:new Set(), voidSuits:[new Set(), new Set(), new Set()] };
  }

  // ---------- state ----------
  // PHASES: PICK_DEALER, DEAL, PLUCK, TRUMP_PICK, PLAY
  let phase = "PICK_DEALER";

  let trumpSuit = null;
  let trumpOpen = false;

  let leaderIndex = 0;
  let turnIndex = 0;
  let leadSuit = null;
  let trick = [];
  let lockInput = false;

  let trickNumber = 0;
  let firstHand = true;

  // plucks
  let pendingPluckQueue = null; // computed at end of hand, used at next deal
  let pluckQueue = [];
  let activePluck = null;
  let pluckSuitUsedByPair = new Map(); // "plucker-pluckee" => Set(suits)

  // ---------- UI helpers ----------
  function setPhaseChipActive() {
    if (!pDeal || !pPluck || !pTrump || !pPlay) return;
    [pDeal,pPluck,pTrump,pPlay].forEach(x => x.classList.remove("activeChip"));
    if (phase === "DEAL") pDeal.classList.add("activeChip");
    if (phase === "PLUCK") pPluck.classList.add("activeChip");
    if (phase === "TRUMP_PICK") pTrump.classList.add("activeChip");
    if (phase === "PLAY") pPlay.classList.add("activeChip");
  }

  function setPhase(newPhase) {
    phase = newPhase;
    setText(phaseLabelEl, newPhase);
    setPhaseChipActive();

    if (pluckPanelEl) pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
    if (trumpPanelEl) trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";

    // ensure hidden panels don't eat taps
    if (pluckPanelEl && pluckPanelEl.style.display === "none") pluckPanelEl.style.pointerEvents = "none";
    if (pluckPanelEl && pluckPanelEl.style.display !== "none") pluckPanelEl.style.pointerEvents = "auto";
    if (trumpPanelEl && trumpPanelEl.style.display === "none") trumpPanelEl.style.pointerEvents = "none";
    if (trumpPanelEl && trumpPanelEl.style.display !== "none") trumpPanelEl.style.pointerEvents = "auto";
  }

  function updateDealerLabels() {
    const d = players[dealerIndex].id;
    setText(dealerLabelEl, d);
    setText(dealerBannerEl, d);
  }

  function updateTrumpLabels() {
    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${SUIT_NAME[trumpSuit]})` : "(not picked)");
    setText(trumpOpenLabelEl, trumpOpen ? "Yes" : "No");

    // show ace of trump on left panel if present
    if (trumpAceSlotEl) {
      trumpAceSlotEl.innerHTML = "";
      if (!trumpSuit) {
        trumpAceSlotEl.textContent = "(none)";
      } else {
        const ace = "A" + trumpSuit;
        trumpAceSlotEl.appendChild(makeCardFace(ace, true));
      }
    }
  }

  function updateScoreboard() {
    setText(ai2TricksEl, String(players[0].tricks));
    setText(ai3TricksEl, String(players[1].tricks));
    setText(youTricksEl, String(players[2].tricks));

    setText(ai2QuotaEl, String(players[0].quota));
    setText(ai3QuotaEl, String(players[1].quota));
    setText(youQuotaEl, String(players[2].quota));
  }

  function updateTrickCounters() {
    setText(trickNumEl, String(trickNumber));
    setText(trickMaxEl, String(TOTAL_TRICKS));
  }

  function updateTurnBanner() {
    if (!turnBannerEl) return;
    const whoseTurn = (phase === "PLAY") ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`) : "—";
    turnBannerEl.textContent = `Phase: ${phase} • Dealer: ${players[dealerIndex].id} • Leader: ${players[leaderIndex].id} • ${whoseTurn}`;
  }

  // ---------- card faces (image + fallback) ----------
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
    const sym = SUIT_SYMBOL[suit] || suit;

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

    // IMPORTANT: image must not steal taps (tablet fix)
    img.style.pointerEvents = "none";

    img.onerror = () => {
      const fb = makeCardFaceFallback(cardStr, disabled);
      el.replaceWith(fb);
    };

    el.appendChild(img);
    return el;
  }

  // ---------- sorting (your hand) ----------
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

  // ---------- rendering ----------
  function renderPickCard(slotEl, cardStr) {
    if (!slotEl) return;
    slotEl.innerHTML = "";
    if (!cardStr) { slotEl.textContent = "(none)"; return; }
    slotEl.appendChild(makeCardFace(cardStr, true));
  }

  function renderHandsAndTrick() {
    // your hand
    handEl.innerHTML = "";
    const sorted = sortHandForDisplay(players[2].hand);

    for (const c of sorted) {
      // map display card -> real index in actual hand
      const realIdx = players[2].hand.indexOf(c);

      const isPlayableTurn = (phase === "PLAY" && turnIndex === 2 && !lockInput);
      const legal = isPlayableTurn ? legalIndexesFor(2) : [];
      const disabled = !isPlayableTurn || !legal.includes(realIdx);

      const face = makeCardFace(c, disabled);

      // Tablet-safe: use pointerup (and click as backup)
      const handler = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
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

      on(face, "pointerup", handler);
      on(face, "click", handler);

      handEl.appendChild(face);
    }

    // trick
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

    // AI hidden hands
    if (ai2HandEl) ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
    if (ai3HandEl) ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");
  }

  function render() {
    updateDealerLabels();
    updateTrumpLabels();
    updateScoreboard();
    updateTrickCounters();
    updateTurnBanner();
    renderHandsAndTrick();

    if (phase === "PLUCK") renderPluckStatus();
    if (phase === "TRUMP_PICK") renderTrumpPickStatus();
  }

  // ---------- initial dealer pick ----------
  let pickCards = { AI2:null, AI3:null, YOU:null };

  function pickRankPower(cs) {
    // jokers are highest; we need LOWEST card deals
    if (cs === CARD_BIG_JOKER) return 1000;
    if (cs === CARD_LITTLE_JOKER) return 900;
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    const v = RANK_VALUE[rank] || 0;
    // include suit tiebreak so "lowest" is stable if needed (but ties are repicked anyway)
    const s = { C:1, D:2, H:3, S:4 }[suit] || 9;
    return v * 10 + s;
  }

  function doPickDealer() {
    setPhase("PICK_DEALER");
    trumpSuit = null;
    trumpOpen = false;
    render();

    // enable/disable buttons
    if (pickOkBtn) pickOkBtn.disabled = true;
    if (pickReBtn) pickReBtn.disabled = true;

    const deck = shuffle(makePluckDeck51().slice());
    pickCards.AI2 = deck.pop();
    pickCards.AI3 = deck.pop();
    pickCards.YOU = deck.pop();

    renderPickCard(pickAI2El, pickCards.AI2);
    renderPickCard(pickAI3El, pickCards.AI3);
    renderPickCard(pickYOUEl, pickCards.YOU);

    const vals = [
      { i:0, id:"AI2", c:pickCards.AI2, p:pickRankPower(pickCards.AI2) },
      { i:1, id:"AI3", c:pickCards.AI3, p:pickRankPower(pickCards.AI3) },
      { i:2, id:"YOU", c:pickCards.YOU, p:pickRankPower(pickCards.YOU) },
    ].sort((a,b)=>a.p-b.p);

    const low = vals[0].p;
    const tiedLow = vals.filter(x=>x.p===low);

    if (tiedLow.length > 1) {
      setText(pickStatusEl, "Tie for lowest card. Click Re-Pick.");
      if (pickReBtn) pickReBtn.disabled = false;
      if (pickOkBtn) pickOkBtn.disabled = true;
      setText(dealerLabelEl, "(tied)");
      setText(dealerBannerEl, "(tied)");
      showMsg("Tie for lowest pick. Re-pick required.");
      return;
    }

    const winner = vals[0]; // lowest deals
    dealerIndex = winner.i;
    applyQuotasFromDealer();
    updateDealerLabels();
    setText(pickStatusEl, `${winner.id} drew the lowest card and will deal. Click OK.`);
    if (pickOkBtn) pickOkBtn.disabled = false;
    if (pickReBtn) pickReBtn.disabled = true;
    showMsg("Dealer selected. Click OK to start the first hand.");
    render();
  }

  function acceptPickAndStartGame() {
    firstHand = true;
    pendingPluckQueue = null;
    startNewHand();
  }

  // ---------- deal / hand flow ----------
  function dealHands() {
    resetMemory();

    const deck = shuffle(makePluckDeck51());
    players.forEach(p => {
      p.hand = [];
      p.tricks = 0;
      p.plucksEarned = 0;
      p.plucksSuffered = 0;
    });

    for (let i=0;i<TOTAL_TRICKS;i++) {
      players[0].hand.push(deck.pop());
      players[1].hand.push(deck.pop());
      players[2].hand.push(deck.pop());
    }

    trickNumber = 0;
    trick = [];
    leadSuit = null;

    trumpSuit = null;
    trumpOpen = false;

    pluckSuitUsedByPair = new Map();
    activePluck = null;

    // default leader for trick 1 will be who holds 2C
    leaderIndex = 0;
    turnIndex = 0;
    lockInput = false;
  }

  function startNewHand() {
    setPhase("DEAL");
    dealHands();
    render();

    // First hand: no pluck phase
    if (firstHand) {
      firstHand = false;
      showMsg("First hand: Dealer selects trump (no plucks yet).");
      moveToTrumpPick();
      return;
    }

    // Later hands: run pluck phase first IF there are pending plucks
    pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
    pendingPluckQueue = null;

    if (pluckQueue.length === 0) {
      showMsg("No plucks this hand. Dealer selects trump.");
      moveToTrumpPick();
      return;
    }

    setPhase("PLUCK");
    showMsg("Pluck phase begins (manual).");
    render();
  }

  // ---------- plucks ----------
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

  function clearPluckChoicesUI() { if (pluckChoicesEl) pluckChoicesEl.innerHTML = ""; }

  function renderPluckStatus() {
    if (!pluckStatusEl) return;
    clearPluckChoicesUI();

    if (pluckQueue.length === 0) {
      setText(pluckStatusEl, "No plucks to process.");
      if (pluckNextBtn) pluckNextBtn.disabled = true;
      return;
    }

    if (!activePluck) activePluck = pluckQueue[0];
    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;

    const suits = availablePluckSuits(pluckerI, pluckeeI);

    // YOU pluck = choose suit
    if (pluckerI === 2) {
      if (pluckNextBtn) pluckNextBtn.disabled = true;

      if (suits.length === 0) {
        setText(pluckStatusEl, `You are plucking ${players[pluckeeI].name}, but you have no suit to attempt. Skipping.`);
        return;
      }

      setText(pluckStatusEl, `You are plucking ${players[pluckeeI].name}. Choose a suit. Wrong suit attempt = LOST.`);

      for (const s of suits) {
        const give = lowestOfSuitNonJoker(pluckerI, s);

        const btn = document.createElement("button");
        btn.className = "btn";
        btn.style.padding = "10px 12px";
        btn.innerHTML = `<strong>${s}</strong> (${SUIT_NAME[s]})<div style="font-size:12px;opacity:.85;">Give: ${give || "(none)"}</div>`;

        on(btn, "click", () => {
          const res = attemptPluck(pluckerI, pluckeeI, s);
          if (!res.ok) {
            markPluckSuitUsed(pluckerI, pluckeeI, s);
            setText(pluckStatusEl, `You attempted ${s} and FAILED (${res.reason}). Pluck is LOST.`);
          } else {
            setText(pluckStatusEl, `You plucked ${s}: gave ${res.giveLow}, received ${res.takeHigh}.`);
          }
          pluckQueue.shift();
          activePluck = null;

          if (pluckQueue.length === 0) {
            moveToTrumpPick();
          } else {
            render();
          }
        });

        pluckChoicesEl.appendChild(btn);
      }

      return;
    }

    // AI pluck uses Run Next
    if (pluckNextBtn) pluckNextBtn.disabled = false;

    if (suits.length === 0) {
      setText(pluckStatusEl, `${players[pluckerI].name} is plucking ${players[pluckeeI].name}, but has no suit. Will skip.`);
    } else {
      setText(pluckStatusEl, `${players[pluckerI].name} is plucking ${players[pluckeeI].name}. Candidates: ${suits.join(", ")}.`);
    }
  }

  function runOnePluck() {
    if (phase !== "PLUCK") return;
    if (pluckQueue.length === 0) return;

    if (!activePluck) activePluck = pluckQueue[0];
    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;

    // if it's YOU, you must use buttons
    if (pluckerI === 2) {
      showMsg("Choose a suit button to pluck.");
      render();
      return;
    }

    const suits = availablePluckSuits(pluckerI, pluckeeI);
    if (suits.length === 0) {
      if (pluckStatusEl) setText(pluckStatusEl, `No available suit for ${players[pluckerI].name} -> ${players[pluckeeI].name}. Skipped.`);
      pluckQueue.shift();
      activePluck = null;
      if (pluckQueue.length === 0) moveToTrumpPick();
      render();
      return;
    }

    // AI chooses a random available suit (blind)
    const pick = suits[Math.floor(Math.random() * suits.length)];
    const res = attemptPluck(pluckerI, pluckeeI, pick);

    if (pluckStatusEl) {
      if (!res.ok) {
        markPluckSuitUsed(pluckerI, pluckeeI, pick);
        setText(pluckStatusEl, `${players[pluckerI].name} attempted ${pick} and FAILED (${res.reason}). Pluck is LOST.`);
      } else {
        setText(pluckStatusEl, `${players[pluckerI].name} plucked ${pick}: gave ${res.giveLow}, received ${res.takeHigh}.`);
      }
    }

    pluckQueue.shift();
    activePluck = null;

    if (pluckQueue.length === 0) moveToTrumpPick();
    render();
  }

  // ---------- trump pick ----------
  function computeTrumpCallerIndex() {
    // Dealer selects trump (your requirement)
    return dealerIndex;
  }

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

      suitScore[suit] += 2;
      if (v >= 11) suitScore[suit] += (v - 10) * 2;
      else suitScore[suit] += Math.max(0, v - 6) * 0.5;
    }

    let bestSuit = "S", bestScore = -Infinity;
    for (const s of SUITS) {
      if (suitScore[s] > bestScore) { bestScore = suitScore[s]; bestSuit = s; }
    }
    return bestSuit;
  }

  function setTrump(suit) {
    trumpSuit = suit;
    // trump opens when a trump card is played; start closed
    trumpOpen = false;
    updateTrumpLabels();
  }

  function renderTrumpPickStatus() {
    if (!trumpStatusEl) return;

    if (trumpSuit) {
      setText(trumpStatusEl, `Trump picked: ${trumpSuit} (${SUIT_NAME[trumpSuit]}).`);
      return;
    }

    const caller = players[computeTrumpCallerIndex()];
    if (dealerIndex === 2) {
      setText(trumpStatusEl, `You are the Dealer. Select trump now.`);
    } else {
      setText(trumpStatusEl, `${caller.name} is the Dealer and will select trump now.`);
    }
  }

  function wireTrumpButtons() {
    if (!trumpPanelEl) return;
    const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
    btns.forEach(b => {
      b.addEventListener("click", () => {
        if (phase !== "TRUMP_PICK") return;
        if (trumpSuit) return;
        if (dealerIndex !== 2) return; // only YOU click if YOU are dealer

        const suit = b.getAttribute("data-trump");
        if (!SUITS.includes(suit)) return;

        setTrump(suit);
        showMsg(`You selected trump: ${suit} (${SUIT_NAME[suit]}).`);
        moveToPlay();
      });
    });
  }

  function moveToTrumpPick() {
    setPhase("TRUMP_PICK");
    renderTrumpPickStatus();
    render();

    const caller = computeTrumpCallerIndex();
    if (caller !== 2) {
      // AI dealer selects trump immediately
      const suit = aiChooseTrumpFromOwnHand(caller);
      setTrump(suit);
      showMsg(`${players[caller].name} (Dealer) selected trump: ${suit} (${SUIT_NAME[suit]}).`);
      moveToPlay();
    } else {
      showMsg("Dealer selects trump: choose a suit.");
    }
  }

  // ---------- play rules ----------
  function hasSuit(playerIndex, suit) {
    return players[playerIndex].hand.some(c => cardSuitForFollow(c, trumpSuit) === suit);
  }

  function hasNonTrump(playerIndex) {
    return players[playerIndex].hand.some(c => !isTrumpCard(c, trumpSuit));
  }

  function illegalReason(playerIndex, cardStr) {
    // first trick lead must be 2C if you have it
    if (trickNumber === 1 && trick.length === 0 && players[playerIndex].hand.includes(CARD_OPEN_LEAD)) {
      if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
    }

    // follow suit if possible
    if (trick.length > 0) {
      const mustSuit = leadSuit;
      const has = hasSuit(playerIndex, mustSuit);
      if (has && cardSuitForFollow(cardStr, trumpSuit) !== mustSuit) return `You must follow suit: ${mustSuit}.`;
    }

    // trump not open: cannot lead trump if you have non-trump
    if (trick.length === 0 && !trumpOpen) {
      if (isTrumpCard(cardStr, trumpSuit) && hasNonTrump(playerIndex)) return "Trump not open. Lead a non-trump card.";
    }

    return "That play is not allowed.";
  }

  function legalIndexesFor(playerIndex) {
    const hand = players[playerIndex].hand;

    // first lead must be 2C if in hand
    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
      return hand.map((c,i)=>({c,i})).filter(x=>x.c === CARD_OPEN_LEAD).map(x=>x.i);
    }

    // if leading and trump not open, must lead non-trump if you have any
    if (trick.length === 0 && !trumpOpen) {
      const nonTrumpIdx = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c, trumpSuit)).map(x=>x.i);
      if (nonTrumpIdx.length) return nonTrumpIdx;
      return hand.map((_,i)=>i);
    }

    // if following, must follow suit if possible
    if (trick.length > 0) {
      const suited = hand.map((c,i)=>({c,i})).filter(x => cardSuitForFollow(x.c, trumpSuit) === leadSuit).map(x=>x.i);
      return suited.length ? suited : hand.map((_,i)=>i);
    }

    return hand.map((_,i)=>i);
  }

  function setLeadSuitFromFirstCard(cardStr) {
    leadSuit = cardSuitForFollow(cardStr, trumpSuit);
  }

  function updateTrumpOpenOnPlay(cardStr) {
    if (!trumpOpen && isTrumpCard(cardStr, trumpSuit)) trumpOpen = true;
  }

  function cardPower(cardStr) {
    // Jokers top
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
      const v = parseCard(t.cardStr, trumpSuit).value;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
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

  function playCard(playerIndex, handIdx) {
    const cardStr = players[playerIndex].hand.splice(handIdx, 1)[0];
    if (!cardStr) { showError("Tried to play empty card."); return; }

    if (trick.length === 0) setLeadSuitFromFirstCard(cardStr);
    trick.push({ playerIndex, cardStr });

    memory.played.add(cardStr);
    updateTrumpOpenOnPlay(cardStr);
    updateTrumpLabels();

    turnIndex = (turnIndex + 1) % 3;
    render();
    maybeContinue();
  }

  // AI chooses: try to win the trick if possible; otherwise dump lowest legal
  function chooseAiIndex(playerIndex) {
    const legal = legalIndexesFor(playerIndex);
    const hand = players[playerIndex].hand;

    // If can win now, play the cheapest winning card.
    let bestWinning = null;

    for (const idx of legal) {
      const card = hand[idx];
      if (wouldWinIfPlayedNow(playerIndex, card)) {
        const pow = cardPower(card);
        if (!bestWinning || pow < bestWinning.pow) bestWinning = { idx, pow };
      }
    }
    if (bestWinning) return bestWinning.idx;

    // else dump lowest power legal
    let bestIdx = legal[0];
    let bestPow = Infinity;
    for (const idx of legal) {
      const pow = cardPower(hand[idx]);
      if (pow < bestPow) { bestPow = pow; bestIdx = idx; }
    }
    return bestIdx;
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
    }

    // no trump yet in temp: best of lead suit
    const ls = (trick.length === 0) ? cardSuitForFollow(cardStr, trumpSuit) : leadSuit;
    let bestPi = temp[0].playerIndex;
    let bestV = -1;
    for (const t of temp) {
      if (cardSuitForFollow(t.cardStr, trumpSuit) !== ls) continue;
      const v = parseCard(t.cardStr, trumpSuit).value;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi === playerIndex;
  }

  function startTrickOne() {
    trick = [];
    leadSuit = null;
    trickNumber = 1;

    // leader is whoever holds 2C
    let whoHas2C = 0;
    for (let pi=0; pi<3; pi++) {
      if (players[pi].hand.includes(CARD_OPEN_LEAD)) { whoHas2C = pi; break; }
    }
    leaderIndex = whoHas2C;
    turnIndex = whoHas2C;

    render();
    maybeContinue();
  }

  function moveToPlay() {
    setPhase("PLAY");
    showMsg("Trump set. Trick 1 begins.");
    startTrickOne();
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

            showMsg("Hand over. Click Reset for next deal.");
            return;
          }

          maybeContinue();
        }, BETWEEN_TRICKS_MS);

      }, TRICK_RESOLVE_MS);

      return;
    }

    // AI turn
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

  // ---------- events ----------
  wireTrumpButtons();

  on(pluckNextBtn, "click", () => runOnePluck());

  on(resetBtn, "click", () => {
    // new deal: rotate dealer right after first hand begins
    rotateDealerRight();
    showMsg("New deal. (Dealer rotated right.)");
    startNewHand();
  });

  on(pickBtn, "click", () => doPickDealer());
  on(pickReBtn, "click", () => doPickDealer());
  on(pickOkBtn, "click", () => acceptPickAndStartGame());

  // ---------- boot ----------
  // Start by forcing dealer pick flow
  setPhase("PICK_DEALER");
  applyQuotasFromDealer();
  updateDealerLabels();
  updateTrumpLabels();
  updateScoreboard();
  updateTrickCounters();
  updateTurnBanner();

  // Ensure pick UI is ready
  if (pickOkBtn) pickOkBtn.disabled = true;
  if (pickReBtn) pickReBtn.disabled = true;
  setText(pickStatusEl, "Click “Pick Cards”.");
  renderPickCard(pickAI2El, null);
  renderPickCard(pickAI3El, null);
  renderPickCard(pickYOUEl, null);

  render();
  log("v19 loaded. Waiting for dealer pick.");

})();// Pluck Web Demo v19 (single-file replacement)
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
  const pluckStatusEl = $("pluckStatus");
  const pluckChoicesEl = $("pluckChoices");
  const pluckNextBtn = $("pluckNextBtn");

  const trumpPanelEl = $("trumpPanel");
  const trumpStatusEl = $("trumpStatus");

  // Dealer pick panel (left side)
  const pickBtn = $("pickBtn");
  const pickOkBtn = $("pickOkBtn");
  const pickReBtn = $("pickReBtn");
  const pickStatusEl = $("pickStatus");
  const pickAI2El = $("pickAI2");
  const pickAI3El = $("pickAI3");
  const pickYOUEl = $("pickYOU");
  const dealerLabelEl = $("dealerLabel");
  const dealerBannerEl = $("dealerBanner");

  const trumpAceSlotEl = $("trumpAceSlot");

  // ---------- core constants ----------
  const TOTAL_TRICKS = 17;
  const SUITS = ["S", "H", "D", "C"];
  const SUIT_NAME = { S:"Spades", H:"Hearts", D:"Diamonds", C:"Clubs" };
  const SUIT_SYMBOL = { S:"♠", H:"♥", D:"♦", C:"♣" };

  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C"; // first trick lead

  // Card images (optional). If files missing, fallback auto.
  const USE_CARD_IMAGES = true;
  const CARD_IMG_DIR = "assets/cards"; // expects assets/cards/AS.png etc, BJ.png, LJ.png, 2C.png

  // Speed (tablet friendly)
  const AI_DELAY_MS = 320;
  const TRICK_RESOLVE_MS = 360;
  const BETWEEN_TRICKS_MS = 300;

  function isJoker(cs){ return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }
  function isRedSuit(s){ return s === "H" || s === "D"; }

  // ---------- deck ----------
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
    if (cs === CARD_BIG_JOKER) return { raw:cs, kind:"JOKER", suit:trumpSuit, value:1000 };
    if (cs === CARD_LITTLE_JOKER) return { raw:cs, kind:"JOKER", suit:trumpSuit, value:900 };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    return { raw:cs, kind:"NORMAL", suit, rank, value:RANK_VALUE[rank] };
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

  // ---------- players ----------
  // 0=AI2, 1=AI3, 2=YOU
  const players = [
    { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7, plucksEarned:0, plucksSuffered:0 },
    { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6, plucksEarned:0, plucksSuffered:0 },
    { id:"YOU", name:"You",            hand:[], tricks:0, quota:4, plucksEarned:0, plucksSuffered:0 }
  ];

  let dealerIndex = 0;           // set by initial pick, then rotates right each new hand
  const leftOf = (i) => (i + 1) % 3;
  const rightOf = (i) => (i + 2) % 3;

  function applyQuotasFromDealer() {
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }
  function rotateDealerRight() {
    dealerIndex = rightOf(dealerIndex);
    applyQuotasFromDealer();
  }

  // ---------- memory (public inference only) ----------
  let memory = null;
  function resetMemory() {
    memory = { played:new Set(), voidSuits:[new Set(), new Set(), new Set()] };
  }

  // ---------- state ----------
  // PHASES: PICK_DEALER, DEAL, PLUCK, TRUMP_PICK, PLAY
  let phase = "PICK_DEALER";

  let trumpSuit = null;
  let trumpOpen = false;

  let leaderIndex = 0;
  let turnIndex = 0;
  let leadSuit = null;
  let trick = [];
  let lockInput = false;

  let trickNumber = 0;
  let firstHand = true;

  // plucks
  let pendingPluckQueue = null; // computed at end of hand, used at next deal
  let pluckQueue = [];
  let activePluck = null;
  let pluckSuitUsedByPair = new Map(); // "plucker-pluckee" => Set(suits)

  // ---------- UI helpers ----------
  function setPhaseChipActive() {
    if (!pDeal || !pPluck || !pTrump || !pPlay) return;
    [pDeal,pPluck,pTrump,pPlay].forEach(x => x.classList.remove("activeChip"));
    if (phase === "DEAL") pDeal.classList.add("activeChip");
    if (phase === "PLUCK") pPluck.classList.add("activeChip");
    if (phase === "TRUMP_PICK") pTrump.classList.add("activeChip");
    if (phase === "PLAY") pPlay.classList.add("activeChip");
  }

  function setPhase(newPhase) {
    phase = newPhase;
    setText(phaseLabelEl, newPhase);
    setPhaseChipActive();

    if (pluckPanelEl) pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
    if (trumpPanelEl) trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";

    // ensure hidden panels don't eat taps
    if (pluckPanelEl && pluckPanelEl.style.display === "none") pluckPanelEl.style.pointerEvents = "none";
    if (pluckPanelEl && pluckPanelEl.style.display !== "none") pluckPanelEl.style.pointerEvents = "auto";
    if (trumpPanelEl && trumpPanelEl.style.display === "none") trumpPanelEl.style.pointerEvents = "none";
    if (trumpPanelEl && trumpPanelEl.style.display !== "none") trumpPanelEl.style.pointerEvents = "auto";
  }

  function updateDealerLabels() {
    const d = players[dealerIndex].id;
    setText(dealerLabelEl, d);
    setText(dealerBannerEl, d);
  }

  function updateTrumpLabels() {
    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${SUIT_NAME[trumpSuit]})` : "(not picked)");
    setText(trumpOpenLabelEl, trumpOpen ? "Yes" : "No");

    // show ace of trump on left panel if present
    if (trumpAceSlotEl) {
      trumpAceSlotEl.innerHTML = "";
      if (!trumpSuit) {
        trumpAceSlotEl.textContent = "(none)";
      } else {
        const ace = "A" + trumpSuit;
        trumpAceSlotEl.appendChild(makeCardFace(ace, true));
      }
    }
  }

  function updateScoreboard() {
    setText(ai2TricksEl, String(players[0].tricks));
    setText(ai3TricksEl, String(players[1].tricks));
    setText(youTricksEl, String(players[2].tricks));

    setText(ai2QuotaEl, String(players[0].quota));
    setText(ai3QuotaEl, String(players[1].quota));
    setText(youQuotaEl, String(players[2].quota));
  }

  function updateTrickCounters() {
    setText(trickNumEl, String(trickNumber));
    setText(trickMaxEl, String(TOTAL_TRICKS));
  }

  function updateTurnBanner() {
    if (!turnBannerEl) return;
    const whoseTurn = (phase === "PLAY") ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`) : "—";
    turnBannerEl.textContent = `Phase: ${phase} • Dealer: ${players[dealerIndex].id} • Leader: ${players[leaderIndex].id} • ${whoseTurn}`;
  }

  // ---------- card faces (image + fallback) ----------
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
    const sym = SUIT_SYMBOL[suit] || suit;

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

    // IMPORTANT: image must not steal taps (tablet fix)
    img.style.pointerEvents = "none";

    img.onerror = () => {
      const fb = makeCardFaceFallback(cardStr, disabled);
      el.replaceWith(fb);
    };

    el.appendChild(img);
    return el;
  }

  // ---------- sorting (your hand) ----------
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

  // ---------- rendering ----------
  function renderPickCard(slotEl, cardStr) {
    if (!slotEl) return;
    slotEl.innerHTML = "";
    if (!cardStr) { slotEl.textContent = "(none)"; return; }
    slotEl.appendChild(makeCardFace(cardStr, true));
  }

  function renderHandsAndTrick() {
    // your hand
    handEl.innerHTML = "";
    const sorted = sortHandForDisplay(players[2].hand);

    for (const c of sorted) {
      // map display card -> real index in actual hand
      const realIdx = players[2].hand.indexOf(c);

      const isPlayableTurn = (phase === "PLAY" && turnIndex === 2 && !lockInput);
      const legal = isPlayableTurn ? legalIndexesFor(2) : [];
      const disabled = !isPlayableTurn || !legal.includes(realIdx);

      const face = makeCardFace(c, disabled);

      // Tablet-safe: use pointerup (and click as backup)
      const handler = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
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

      on(face, "pointerup", handler);
      on(face, "click", handler);

      handEl.appendChild(face);
    }

    // trick
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

    // AI hidden hands
    if (ai2HandEl) ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
    if (ai3HandEl) ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");
  }

  function render() {
    updateDealerLabels();
    updateTrumpLabels();
    updateScoreboard();
    updateTrickCounters();
    updateTurnBanner();
    renderHandsAndTrick();

    if (phase === "PLUCK") renderPluckStatus();
    if (phase === "TRUMP_PICK") renderTrumpPickStatus();
  }

  // ---------- initial dealer pick ----------
  let pickCards = { AI2:null, AI3:null, YOU:null };

  function pickRankPower(cs) {
    // jokers are highest; we need LOWEST card deals
    if (cs === CARD_BIG_JOKER) return 1000;
    if (cs === CARD_LITTLE_JOKER) return 900;
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    const v = RANK_VALUE[rank] || 0;
    // include suit tiebreak so "lowest" is stable if needed (but ties are repicked anyway)
    const s = { C:1, D:2, H:3, S:4 }[suit] || 9;
    return v * 10 + s;
  }

  function doPickDealer() {
    setPhase("PICK_DEALER");
    trumpSuit = null;
    trumpOpen = false;
    render();

    // enable/disable buttons
    if (pickOkBtn) pickOkBtn.disabled = true;
    if (pickReBtn) pickReBtn.disabled = true;

    const deck = shuffle(makePluckDeck51().slice());
    pickCards.AI2 = deck.pop();
    pickCards.AI3 = deck.pop();
    pickCards.YOU = deck.pop();

    renderPickCard(pickAI2El, pickCards.AI2);
    renderPickCard(pickAI3El, pickCards.AI3);
    renderPickCard(pickYOUEl, pickCards.YOU);

    const vals = [
      { i:0, id:"AI2", c:pickCards.AI2, p:pickRankPower(pickCards.AI2) },
      { i:1, id:"AI3", c:pickCards.AI3, p:pickRankPower(pickCards.AI3) },
      { i:2, id:"YOU", c:pickCards.YOU, p:pickRankPower(pickCards.YOU) },
    ].sort((a,b)=>a.p-b.p);

    const low = vals[0].p;
    const tiedLow = vals.filter(x=>x.p===low);

    if (tiedLow.length > 1) {
      setText(pickStatusEl, "Tie for lowest card. Click Re-Pick.");
      if (pickReBtn) pickReBtn.disabled = false;
      if (pickOkBtn) pickOkBtn.disabled = true;
      setText(dealerLabelEl, "(tied)");
      setText(dealerBannerEl, "(tied)");
      showMsg("Tie for lowest pick. Re-pick required.");
      return;
    }

    const winner = vals[0]; // lowest deals
    dealerIndex = winner.i;
    applyQuotasFromDealer();
    updateDealerLabels();
    setText(pickStatusEl, `${winner.id} drew the lowest card and will deal. Click OK.`);
    if (pickOkBtn) pickOkBtn.disabled = false;
    if (pickReBtn) pickReBtn.disabled = true;
    showMsg("Dealer selected. Click OK to start the first hand.");
    render();
  }

  function acceptPickAndStartGame() {
    firstHand = true;
    pendingPluckQueue = null;
    startNewHand();
  }

  // ---------- deal / hand flow ----------
  function dealHands() {
    resetMemory();

    const deck = shuffle(makePluckDeck51());
    players.forEach(p => {
      p.hand = [];
      p.tricks = 0;
      p.plucksEarned = 0;
      p.plucksSuffered = 0;
    });

    for (let i=0;i<TOTAL_TRICKS;i++) {
      players[0].hand.push(deck.pop());
      players[1].hand.push(deck.pop());
      players[2].hand.push(deck.pop());
    }

    trickNumber = 0;
    trick = [];
    leadSuit = null;

    trumpSuit = null;
    trumpOpen = false;

    pluckSuitUsedByPair = new Map();
    activePluck = null;

    // default leader for trick 1 will be who holds 2C
    leaderIndex = 0;
    turnIndex = 0;
    lockInput = false;
  }

  function startNewHand() {
    setPhase("DEAL");
    dealHands();
    render();

    // First hand: no pluck phase
    if (firstHand) {
      firstHand = false;
      showMsg("First hand: Dealer selects trump (no plucks yet).");
      moveToTrumpPick();
      return;
    }

    // Later hands: run pluck phase first IF there are pending plucks
    pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
    pendingPluckQueue = null;

    if (pluckQueue.length === 0) {
      showMsg("No plucks this hand. Dealer selects trump.");
      moveToTrumpPick();
      return;
    }

    setPhase("PLUCK");
    showMsg("Pluck phase begins (manual).");
    render();
  }

  // ---------- plucks ----------
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

  function clearPluckChoicesUI() { if (pluckChoicesEl) pluckChoicesEl.innerHTML = ""; }

  function renderPluckStatus() {
    if (!pluckStatusEl) return;
    clearPluckChoicesUI();

    if (pluckQueue.length === 0) {
      setText(pluckStatusEl, "No plucks to process.");
      if (pluckNextBtn) pluckNextBtn.disabled = true;
      return;
    }

    if (!activePluck) activePluck = pluckQueue[0];
    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;

    const suits = availablePluckSuits(pluckerI, pluckeeI);

    // YOU pluck = choose suit
    if (pluckerI === 2) {
      if (pluckNextBtn) pluckNextBtn.disabled = true;

      if (suits.length === 0) {
        setText(pluckStatusEl, `You are plucking ${players[pluckeeI].name}, but you have no suit to attempt. Skipping.`);
        return;
      }

      setText(pluckStatusEl, `You are plucking ${players[pluckeeI].name}. Choose a suit. Wrong suit attempt = LOST.`);

      for (const s of suits) {
        const give = lowestOfSuitNonJoker(pluckerI, s);

        const btn = document.createElement("button");
        btn.className = "btn";
        btn.style.padding = "10px 12px";
        btn.innerHTML = `<strong>${s}</strong> (${SUIT_NAME[s]})<div style="font-size:12px;opacity:.85;">Give: ${give || "(none)"}</div>`;

        on(btn, "click", () => {
          const res = attemptPluck(pluckerI, pluckeeI, s);
          if (!res.ok) {
            markPluckSuitUsed(pluckerI, pluckeeI, s);
            setText(pluckStatusEl, `You attempted ${s} and FAILED (${res.reason}). Pluck is LOST.`);
          } else {
            setText(pluckStatusEl, `You plucked ${s}: gave ${res.giveLow}, received ${res.takeHigh}.`);
          }
          pluckQueue.shift();
          activePluck = null;

          if (pluckQueue.length === 0) {
            moveToTrumpPick();
          } else {
            render();
          }
        });

        pluckChoicesEl.appendChild(btn);
      }

      return;
    }

    // AI pluck uses Run Next
    if (pluckNextBtn) pluckNextBtn.disabled = false;

    if (suits.length === 0) {
      setText(pluckStatusEl, `${players[pluckerI].name} is plucking ${players[pluckeeI].name}, but has no suit. Will skip.`);
    } else {
      setText(pluckStatusEl, `${players[pluckerI].name} is plucking ${players[pluckeeI].name}. Candidates: ${suits.join(", ")}.`);
    }
  }

  function runOnePluck() {
    if (phase !== "PLUCK") return;
    if (pluckQueue.length === 0) return;

    if (!activePluck) activePluck = pluckQueue[0];
    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;

    // if it's YOU, you must use buttons
    if (pluckerI === 2) {
      showMsg("Choose a suit button to pluck.");
      render();
      return;
    }

    const suits = availablePluckSuits(pluckerI, pluckeeI);
    if (suits.length === 0) {
      if (pluckStatusEl) setText(pluckStatusEl, `No available suit for ${players[pluckerI].name} -> ${players[pluckeeI].name}. Skipped.`);
      pluckQueue.shift();
      activePluck = null;
      if (pluckQueue.length === 0) moveToTrumpPick();
      render();
      return;
    }

    // AI chooses a random available suit (blind)
    const pick = suits[Math.floor(Math.random() * suits.length)];
    const res = attemptPluck(pluckerI, pluckeeI, pick);

    if (pluckStatusEl) {
      if (!res.ok) {
        markPluckSuitUsed(pluckerI, pluckeeI, pick);
        setText(pluckStatusEl, `${players[pluckerI].name} attempted ${pick} and FAILED (${res.reason}). Pluck is LOST.`);
      } else {
        setText(pluckStatusEl, `${players[pluckerI].name} plucked ${pick}: gave ${res.giveLow}, received ${res.takeHigh}.`);
      }
    }

    pluckQueue.shift();
    activePluck = null;

    if (pluckQueue.length === 0) moveToTrumpPick();
    render();
  }

  // ---------- trump pick ----------
  function computeTrumpCallerIndex() {
    // Dealer selects trump (your requirement)
    return dealerIndex;
  }

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

      suitScore[suit] += 2;
      if (v >= 11) suitScore[suit] += (v - 10) * 2;
      else suitScore[suit] += Math.max(0, v - 6) * 0.5;
    }

    let bestSuit = "S", bestScore = -Infinity;
    for (const s of SUITS) {
      if (suitScore[s] > bestScore) { bestScore = suitScore[s]; bestSuit = s; }
    }
    return bestSuit;
  }

  function setTrump(suit) {
    trumpSuit = suit;
    // trump opens when a trump card is played; start closed
    trumpOpen = false;
    updateTrumpLabels();
  }

  function renderTrumpPickStatus() {
    if (!trumpStatusEl) return;

    if (trumpSuit) {
      setText(trumpStatusEl, `Trump picked: ${trumpSuit} (${SUIT_NAME[trumpSuit]}).`);
      return;
    }

    const caller = players[computeTrumpCallerIndex()];
    if (dealerIndex === 2) {
      setText(trumpStatusEl, `You are the Dealer. Select trump now.`);
    } else {
      setText(trumpStatusEl, `${caller.name} is the Dealer and will select trump now.`);
    }
  }

  function wireTrumpButtons() {
    if (!trumpPanelEl) return;
    const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
    btns.forEach(b => {
      b.addEventListener("click", () => {
        if (phase !== "TRUMP_PICK") return;
        if (trumpSuit) return;
        if (dealerIndex !== 2) return; // only YOU click if YOU are dealer

        const suit = b.getAttribute("data-trump");
        if (!SUITS.includes(suit)) return;

        setTrump(suit);
        showMsg(`You selected trump: ${suit} (${SUIT_NAME[suit]}).`);
        moveToPlay();
      });
    });
  }

  function moveToTrumpPick() {
    setPhase("TRUMP_PICK");
    renderTrumpPickStatus();
    render();

    const caller = computeTrumpCallerIndex();
    if (caller !== 2) {
      // AI dealer selects trump immediately
      const suit = aiChooseTrumpFromOwnHand(caller);
      setTrump(suit);
      showMsg(`${players[caller].name} (Dealer) selected trump: ${suit} (${SUIT_NAME[suit]}).`);
      moveToPlay();
    } else {
      showMsg("Dealer selects trump: choose a suit.");
    }
  }

  // ---------- play rules ----------
  function hasSuit(playerIndex, suit) {
    return players[playerIndex].hand.some(c => cardSuitForFollow(c, trumpSuit) === suit);
  }

  function hasNonTrump(playerIndex) {
    return players[playerIndex].hand.some(c => !isTrumpCard(c, trumpSuit));
  }

  function illegalReason(playerIndex, cardStr) {
    // first trick lead must be 2C if you have it
    if (trickNumber === 1 && trick.length === 0 && players[playerIndex].hand.includes(CARD_OPEN_LEAD)) {
      if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
    }

    // follow suit if possible
    if (trick.length > 0) {
      const mustSuit = leadSuit;
      const has = hasSuit(playerIndex, mustSuit);
      if (has && cardSuitForFollow(cardStr, trumpSuit) !== mustSuit) return `You must follow suit: ${mustSuit}.`;
    }

    // trump not open: cannot lead trump if you have non-trump
    if (trick.length === 0 && !trumpOpen) {
      if (isTrumpCard(cardStr, trumpSuit) && hasNonTrump(playerIndex)) return "Trump not open. Lead a non-trump card.";
    }

    return "That play is not allowed.";
  }

  function legalIndexesFor(playerIndex) {
    const hand = players[playerIndex].hand;

    // first lead must be 2C if in hand
    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
      return hand.map((c,i)=>({c,i})).filter(x=>x.c === CARD_OPEN_LEAD).map(x=>x.i);
    }

    // if leading and trump not open, must lead non-trump if you have any
    if (trick.length === 0 && !trumpOpen) {
      const nonTrumpIdx = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c, trumpSuit)).map(x=>x.i);
      if (nonTrumpIdx.length) return nonTrumpIdx;
      return hand.map((_,i)=>i);
    }

    // if following, must follow suit if possible
    if (trick.length > 0) {
      const suited = hand.map((c,i)=>({c,i})).filter(x => cardSuitForFollow(x.c, trumpSuit) === leadSuit).map(x=>x.i);
      return suited.length ? suited : hand.map((_,i)=>i);
    }

    return hand.map((_,i)=>i);
  }

  function setLeadSuitFromFirstCard(cardStr) {
    leadSuit = cardSuitForFollow(cardStr, trumpSuit);
  }

  function updateTrumpOpenOnPlay(cardStr) {
    if (!trumpOpen && isTrumpCard(cardStr, trumpSuit)) trumpOpen = true;
  }

  function cardPower(cardStr) {
    // Jokers top
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
      const v = parseCard(t.cardStr, trumpSuit).value;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
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

  function playCard(playerIndex, handIdx) {
    const cardStr = players[playerIndex].hand.splice(handIdx, 1)[0];
    if (!cardStr) { showError("Tried to play empty card."); return; }

    if (trick.length === 0) setLeadSuitFromFirstCard(cardStr);
    trick.push({ playerIndex, cardStr });

    memory.played.add(cardStr);
    updateTrumpOpenOnPlay(cardStr);
    updateTrumpLabels();

    turnIndex = (turnIndex + 1) % 3;
    render();
    maybeContinue();
  }

  // AI chooses: try to win the trick if possible; otherwise dump lowest legal
  function chooseAiIndex(playerIndex) {
    const legal = legalIndexesFor(playerIndex);
    const hand = players[playerIndex].hand;

    // If can win now, play the cheapest winning card.
    let bestWinning = null;

    for (const idx of legal) {
      const card = hand[idx];
      if (wouldWinIfPlayedNow(playerIndex, card)) {
        const pow = cardPower(card);
        if (!bestWinning || pow < bestWinning.pow) bestWinning = { idx, pow };
      }
    }
    if (bestWinning) return bestWinning.idx;

    // else dump lowest power legal
    let bestIdx = legal[0];
    let bestPow = Infinity;
    for (const idx of legal) {
      const pow = cardPower(hand[idx]);
      if (pow < bestPow) { bestPow = pow; bestIdx = idx; }
    }
    return bestIdx;
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
    }

    // no trump yet in temp: best of lead suit
    const ls = (trick.length === 0) ? cardSuitForFollow(cardStr, trumpSuit) : leadSuit;
    let bestPi = temp[0].playerIndex;
    let bestV = -1;
    for (const t of temp) {
      if (cardSuitForFollow(t.cardStr, trumpSuit) !== ls) continue;
      const v = parseCard(t.cardStr, trumpSuit).value;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi === playerIndex;
  }

  function startTrickOne() {
    trick = [];
    leadSuit = null;
    trickNumber = 1;

    // leader is whoever holds 2C
    let whoHas2C = 0;
    for (let pi=0; pi<3; pi++) {
      if (players[pi].hand.includes(CARD_OPEN_LEAD)) { whoHas2C = pi; break; }
    }
    leaderIndex = whoHas2C;
    turnIndex = whoHas2C;

    render();
    maybeContinue();
  }

  function moveToPlay() {
    setPhase("PLAY");
    showMsg("Trump set. Trick 1 begins.");
    startTrickOne();
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

            showMsg("Hand over. Click Reset for next deal.");
            return;
          }

          maybeContinue();
        }, BETWEEN_TRICKS_MS);

      }, TRICK_RESOLVE_MS);

      return;
    }

    // AI turn
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

  // ---------- events ----------
  wireTrumpButtons();

  on(pluckNextBtn, "click", () => runOnePluck());

  on(resetBtn, "click", () => {
    // new deal: rotate dealer right after first hand begins
    rotateDealerRight();
    showMsg("New deal. (Dealer rotated right.)");
    startNewHand();
  });

  on(pickBtn, "click", () => doPickDealer());
  on(pickReBtn, "click", () => doPickDealer());
  on(pickOkBtn, "click", () => acceptPickAndStartGame());

  // ---------- boot ----------
  // Start by forcing dealer pick flow
  setPhase("PICK_DEALER");
  applyQuotasFromDealer();
  updateDealerLabels();
  updateTrumpLabels();
  updateScoreboard();
  updateTrickCounters();
  updateTurnBanner();

  // Ensure pick UI is ready
  if (pickOkBtn) pickOkBtn.disabled = true;
  if (pickReBtn) pickReBtn.disabled = true;
  setText(pickStatusEl, "Click “Pick Cards”.");
  renderPickCard(pickAI2El, null);
  renderPickCard(pickAI3El, null);
  renderPickCard(pickYOUEl, null);

  render();
  log("v19 loaded. Waiting for dealer pick.");

})();
