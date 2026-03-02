// Pluck Web Demo v20 (full replacement)
// Fixes:
// - No freezes on AI2/AI3 (single turn engine; no nested timeouts hell)
// - Auto-advance to next hand after Trick 17
// - First hand: NO pluck (DEAL -> TRUMP -> PLAY)
// - Later hands: DEAL -> PLUCK -> TRUMP -> PLAY (pluck panel shows only when needed)
// - Initial pick: shows all 3 cards; OK to start; tie-for-lowest => repick
// - Shows Ace of trump in trumpAceSlot

(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const on = (el, evt, fn) => el && el.addEventListener(evt, fn);

  function setText(el, txt) { if (el) el.textContent = txt; }
  function msg(txt) { setText($("msg"), txt); }
  function err(txt) { setText($("msg"), "ERROR: " + txt); console.error("[Pluck]", txt); }

  window.addEventListener("error", (e) => {
    err(e?.message || "Unknown JS error");
  });

  // ---------- required DOM ----------
  const handEl = $("hand");
  const trickEl = $("trick");
  const resetBtn = $("resetBtn");
  if (!handEl || !trickEl || !resetBtn) {
    err("Missing required elements: hand, trick, resetBtn");
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

  const dealerLabelEl = $("dealerLabel");
  const dealerBannerEl = $("dealerBanner");

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

  // Initial pick UI
  const pickBtn = $("pickBtn");
  const pickOkBtn = $("pickOkBtn");
  const pickReBtn = $("pickReBtn");
  const pickStatusEl = $("pickStatus");
  const pickAI2El = $("pickAI2");
  const pickAI3El = $("pickAI3");
  const pickYOUEl = $("pickYOU");

  const trumpAceSlotEl = $("trumpAceSlot");

  // ---------- constants ----------
  const TOTAL_TRICKS = 17;
  const SUITS = ["S", "H", "D", "C"];
  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

  // Timing
  const AI_DELAY = 260;
  const RESOLVE_DELAY = 280;
  const BETWEEN_TRICKS = 240;

  // ---------- card utils ----------
  function suitName(s) { return s==="S"?"Spades":s==="H"?"Hearts":s==="D"?"Diamonds":"Clubs"; }
  function suitSymbol(s){ return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣"; }
  function isRedSuit(s){ return s==="H" || s==="D"; }
  function isJoker(cs) { return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }

  function makeDeck51() {
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
    if (cs === CARD_BIG_JOKER) return { kind:"JOKER", rank:"BJ", suit:null, value: 1000 };
    if (cs === CARD_LITTLE_JOKER) return { kind:"JOKER", rank:"LJ", suit:null, value: 900 };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    return { kind:"NORMAL", rank, suit, value: RANK_VALUE[rank] || 0 };
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

  // ---------- UI card face ----------
  function makeCardFace(cardStr, disabled=false) {
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

  // ---------- game model ----------
  // 0=AI2, 1=AI3, 2=YOU
  const players = [
    { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7, plucksEarned:0, plucksSuffered:0 },
    { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6, plucksEarned:0, plucksSuffered:0 },
    { id:"YOU", name:"You",            hand:[], tricks:0, quota:4, plucksEarned:0, plucksSuffered:0 }
  ];

  function leftOf(i){ return (i+1)%3; }
  function rightOf(i){ return (i+2)%3; }

  let dealerIndex = null;          // decided by initial pick
  let firstHandDone = false;

  // phases
  // PICK_DEALER -> DEAL -> (PLUCK?) -> TRUMP_PICK -> PLAY
  let phase = "PICK_DEALER";

  // play state
  let trumpSuit = null;
  let trumpOpen = false;

  let trick = [];         // {playerIndex, cardStr}
  let leadSuit = null;
  let trickNumber = 0;

  let leaderIndex = 0;
  let turnIndex = 0;

  // pluck state
  let pendingPlucks = null; // computed at end of hand; applied at start of next hand
  let pluckQueue = [];
  let activePluck = null;
  let pluckSuitUsedByPair = new Map(); // "plucker-pluckee" -> Set(suits)

  // engine locks
  let engineBusy = false;

  function setPhase(newPhase){
    phase = newPhase;
    setText(phaseLabelEl, newPhase);

    // chips highlight
    [pDeal,pPluck,pTrump,pPlay].forEach(x => x && x.classList.remove("activeChip"));
    if (newPhase === "DEAL") pDeal && pDeal.classList.add("activeChip");
    if (newPhase === "PLUCK") pPluck && pPluck.classList.add("activeChip");
    if (newPhase === "TRUMP_PICK") pTrump && pTrump.classList.add("activeChip");
    if (newPhase === "PLAY") pPlay && pPlay.classList.add("activeChip");

    // panels
    if (pluckPanelEl) pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
    if (trumpPanelEl) trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";
  }

  function updateDealerLabels(){
    const txt = (dealerIndex === null) ? "(not set)" : players[dealerIndex].id;
    setText(dealerLabelEl, txt);
    setText(dealerBannerEl, txt);
  }

  function applyQuotasForDealer(){
    // dealer=7, left=6, right=4
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }

  function rotateDealerRight(){
    dealerIndex = rightOf(dealerIndex);
    applyQuotasForDealer();
    updateDealerLabels();
  }

  // ---------- rendering ----------
  function renderTrumpAce(){
    if (!trumpAceSlotEl) return;
    trumpAceSlotEl.innerHTML = "";
    if (!trumpSuit) { trumpAceSlotEl.textContent = "(none)"; return; }
    const ace = "A" + trumpSuit;
    trumpAceSlotEl.appendChild(makeCardFace(ace, true));
  }

  function render(){
    // labels
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

    // hidden hands
    if (ai2HandEl) ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
    if (ai3HandEl) ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

    // turn banner
    const whoTurn = (phase === "PLAY") ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`) : "—";
    const leadTxt = leadSuit ? `${leadSuit} (${suitName(leadSuit)})` : "(none)";
    setText(turnBannerEl, `Phase: ${phase} • ${whoTurn} • Lead suit: ${leadTxt} • Trump: ${trumpSuit || "(none)"} • Dealer: ${dealerIndex===null?"(none)":players[dealerIndex].id}`);

    // hand
    handEl.innerHTML = "";
    const youHand = players[2].hand.slice();
    // sort: jokers first, then by suit, then rank high->low
    const suitOrder = ["S","H","D","C"];
    const rankOrder = { "A":14,"K":13,"Q":12,"J":11,"10":10,"9":9,"8":8,"7":7,"6":6,"5":5,"4":4,"3":3,"2":2 };
    youHand.sort((a,b)=>{
      if (a===CARD_BIG_JOKER) return -1;
      if (b===CARD_BIG_JOKER) return 1;
      if (a===CARD_LITTLE_JOKER) return -1;
      if (b===CARD_LITTLE_JOKER) return 1;
      const sa = a.slice(-1), sb = b.slice(-1);
      if (sa !== sb) return suitOrder.indexOf(sa) - suitOrder.indexOf(sb);
      const ra = a.slice(0,-1), rb = b.slice(0,-1);
      return (rankOrder[rb]||0) - (rankOrder[ra]||0);
    });

    // compute legal moves (only if your turn)
    let legal = [];
    if (phase === "PLAY" && turnIndex === 2) legal = legalCardsFor(2);

    for (const c of youHand) {
      const realIdx = players[2].hand.indexOf(c);
      const playable = (phase === "PLAY" && turnIndex === 2);
      const disabled = !playable || !legal.includes(realIdx);

      const face = makeCardFace(c, disabled);

      // pointerdown works better on tablets than click
      face.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (disabled) return;

        // re-check right before play
        if (!(phase === "PLAY" && turnIndex === 2)) return;
        const legalNow = legalCardsFor(2);
        if (!legalNow.includes(realIdx)) { msg(illegalReason(2, c)); return; }

        playCard(2, realIdx);
        engineKick();
      }, { passive:false });

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
        label.style.color = "#b5c0d6";
        label.textContent = players[t.playerIndex].id;

        const face = makeCardFace(t.cardStr, true);
        face.style.cursor = "default";

        wrap.appendChild(label);
        wrap.appendChild(face);
        trickEl.appendChild(wrap);
      }
    }

    renderTrumpAce();

    // pluck/trump panels text
    if (phase === "PLUCK") renderPluckStatus();
    if (phase === "TRUMP_PICK") renderTrumpStatus();
  }

  // ---------- initial pick ----------
  function pickOneCard(){
    // use a full deck for the pick (simple)
    const d = shuffle(makeDeck51());
    return d.pop();
  }

  function pickRankValue(cardStr){
    // jokers are "highest" so they don't become dealer
    if (cardStr === CARD_BIG_JOKER) return 100;
    if (cardStr === CARD_LITTLE_JOKER) return 99;
    const p = parseCard(cardStr);
    // 2C exists; treat 2 as lowest if present
    if (p.rank === "2") return 2;
    return p.value;
  }

  function clearPickUI(){
    if (pickAI2El) pickAI2El.textContent = "(none)";
    if (pickAI3El) pickAI3El.textContent = "(none)";
    if (pickYOUEl) pickYOUEl.textContent = "(none)";
    setText(pickStatusEl, "Click “Pick Cards”.");
    if (pickOkBtn) pickOkBtn.disabled = true;
    if (pickReBtn) pickReBtn.disabled = true;
    dealerIndex = null;
    updateDealerLabels();
  }

  let lastPickCards = null; // {ai2,ai3,you}

  function doPick(){
    lastPickCards = {
      ai2: pickOneCard(),
      ai3: pickOneCard(),
      you: pickOneCard()
    };

    // show faces
    if (pickAI2El) { pickAI2El.innerHTML = ""; pickAI2El.appendChild(makeCardFace(lastPickCards.ai2, true)); }
    if (pickAI3El) { pickAI3El.innerHTML = ""; pickAI3El.appendChild(makeCardFace(lastPickCards.ai3, true)); }
    if (pickYOUEl) { pickYOUEl.innerHTML = ""; pickYOUEl.appendChild(makeCardFace(lastPickCards.you, true)); }

    const vals = [
      { pi:0, c:lastPickCards.ai2, v: pickRankValue(lastPickCards.ai2) },
      { pi:1, c:lastPickCards.ai3, v: pickRankValue(lastPickCards.ai3) },
      { pi:2, c:lastPickCards.you, v: pickRankValue(lastPickCards.you) }
    ];
    vals.sort((a,b)=> a.v - b.v);

    const lowestV = vals[0].v;
    const tied = vals.filter(x => x.v === lowestV);

    if (tied.length > 1) {
      setText(pickStatusEl, "Tie for lowest. Click Re-Pick.");
      if (pickOkBtn) pickOkBtn.disabled = true;
      if (pickReBtn) pickReBtn.disabled = false;
      dealerIndex = null;
      updateDealerLabels();
      return;
    }

    dealerIndex = vals[0].pi;
    updateDealerLabels();
    setText(pickStatusEl, `Dealer will be ${players[dealerIndex].id}. Click OK to start.`);
    if (pickOkBtn) pickOkBtn.disabled = false;
    if (pickReBtn) pickReBtn.disabled = true;
  }

  // ---------- deal / hand setup ----------
  function resetHandState(){
    trick = [];
    leadSuit = null;
    trickNumber = 0;

    trumpSuit = null;
    trumpOpen = false;

    leaderIndex = 0;
    turnIndex = 0;

    players.forEach(p => { p.hand = []; p.tricks = 0; p.plucksEarned = 0; p.plucksSuffered = 0; });
    pluckQueue = [];
    activePluck = null;
    pluckSuitUsedByPair = new Map();
  }

  function dealHand(){
    resetHandState();
    applyQuotasForDealer();

    const deck = shuffle(makeDeck51());
    for (let i=0; i<TOTAL_TRICKS; i++){
      players[0].hand.push(deck.pop());
      players[1].hand.push(deck.pop());
      players[2].hand.push(deck.pop());
    }
  }

  // ---------- plucks ----------
  function computePlucksEarnedSuffered(){
    for (const p of players) {
      p.plucksEarned = Math.max(0, p.tricks - p.quota);
      p.plucksSuffered = Math.max(0, p.quota - p.tricks);
    }
  }

  function pluckerOrder(){
    // most plucks earned first; tie -> dealer, left, right
    const tie = [dealerIndex, leftOf(dealerIndex), rightOf(dealerIndex)];
    return [0,1,2].slice().sort((a,b)=>{
      const da = players[a].plucksEarned, db = players[b].plucksEarned;
      if (db !== da) return db - da;
      return tie.indexOf(a) - tie.indexOf(b);
    }).filter(i => players[i].plucksEarned > 0);
  }

  function victimOrder(){
    const tie = [dealerIndex, leftOf(dealerIndex), rightOf(dealerIndex)];
    return [0,1,2].slice().sort((a,b)=>{
      const da = players[a].plucksSuffered, db = players[b].plucksSuffered;
      if (db !== da) return db - da;
      return tie.indexOf(a) - tie.indexOf(b);
    }).filter(i => players[i].plucksSuffered > 0);
  }

  function buildPluckQueue(){
    const q = [];
    const pluckers = pluckerOrder();
    const victims = victimOrder();
    const earned = new Map(pluckers.map(i=>[i, players[i].plucksEarned]));
    const suffered = new Map(victims.map(i=>[i, players[i].plucksSuffered]));

    for (const plucker of pluckers){
      while ((earned.get(plucker)||0) > 0){
        const victim = victims
          .filter(v => (suffered.get(v)||0) > 0)
          .sort((a,b)=> (suffered.get(b)||0) - (suffered.get(a)||0))[0];
        if (victim === undefined) break;

        q.push({ pluckerIndex: plucker, pluckeeIndex: victim });
        earned.set(plucker, (earned.get(plucker)||0) - 1);
        suffered.set(victim, (suffered.get(victim)||0) - 1);
      }
    }
    return q;
  }

  function pairKey(a,b){ return `${a}-${b}`; }

  function lowestOfSuitNonJoker(pi, suit){
    const cards = players[pi].hand.filter(c => !isJoker(c) && c.slice(-1) === suit);
    if (!cards.length) return null;
    cards.sort((a,b)=> (RANK_VALUE[a.slice(0,-1)]||99) - (RANK_VALUE[b.slice(0,-1)]||99));
    return cards[0];
  }
  function highestOfSuitNonJoker(pi, suit){
    const cards = players[pi].hand.filter(c => !isJoker(c) && c.slice(-1) === suit);
    if (!cards.length) return null;
    cards.sort((a,b)=> (RANK_VALUE[b.slice(0,-1)]||0) - (RANK_VALUE[a.slice(0,-1)]||0));
    return cards[0];
  }
  function removeFromHand(pi, cardStr){
    const idx = players[pi].hand.indexOf(cardStr);
    if (idx >= 0) players[pi].hand.splice(idx, 1);
  }

  function usedSuitSet(pluckerI, pluckeeI){
    const k = pairKey(pluckerI, pluckeeI);
    if (!pluckSuitUsedByPair.has(k)) pluckSuitUsedByPair.set(k, new Set());
    return pluckSuitUsedByPair.get(k);
  }

  function availablePluckSuits(pluckerI, pluckeeI){
    const used = usedSuitSet(pluckerI, pluckeeI);
    const suits = [];
    for (const s of SUITS){
      if (used.has(s)) continue;
      if (!lowestOfSuitNonJoker(pluckerI, s)) continue;
      suits.push(s);
    }
    return suits;
  }

  function attemptPluck(pluckerI, pluckeeI, suit){
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

  function renderPluckStatus(){
    if (!pluckStatusEl || !pluckChoicesEl || !pluckNextBtn) return;

    pluckChoicesEl.innerHTML = "";

    if (!pluckQueue.length){
      pluckStatusEl.textContent = "No plucks to process.";
      pluckNextBtn.disabled = true;
      return;
    }

    if (!activePluck) activePluck = pluckQueue[0];

    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;
    const suits = availablePluckSuits(pluckerI, pluckeeI);

    // YOU plucks: buttons
    if (pluckerI === 2){
      pluckNextBtn.disabled = true;
      pluckStatusEl.textContent = `You are plucking ${players[pluckeeI].id}. Choose a suit. Wrong/failed suit = pluck LOST.`;

      if (!suits.length){
        const b = document.createElement("button");
        b.className = "btn";
        b.textContent = "No suit available (Skip)";
        b.onclick = () => {
          pluckQueue.shift();
          activePluck = null;
          if (!pluckQueue.length) toTrumpPick();
          render();
        };
        pluckChoicesEl.appendChild(b);
        return;
      }

      for (const s of suits){
        const give = lowestOfSuitNonJoker(pluckerI, s);
        const b = document.createElement("button");
        b.className = "btn";
        b.textContent = `${s} (${suitName(s)}) • Give: ${give}`;
        b.onclick = () => {
          const res = attemptPluck(pluckerI, pluckeeI, s);
          if (!res.ok){
            usedSuitSet(pluckerI, pluckeeI).add(s);
            pluckStatusEl.textContent = `FAILED pluck in ${s} (${res.reason}). LOST.`;
          } else {
            pluckStatusEl.textContent = `Plucked ${s}: gave ${res.giveLow}, received ${res.takeHigh}.`;
          }

          pluckQueue.shift();
          activePluck = null;
          if (!pluckQueue.length) toTrumpPick();
          render();
        };
        pluckChoicesEl.appendChild(b);
      }
      return;
    }

    // AI plucks: click Run Next Pluck
    pluckNextBtn.disabled = false;
    pluckStatusEl.textContent = `${players[pluckerI].id} is plucking ${players[pluckeeI].id}. Click “Run Next Pluck”.`;
  }

  function runOnePluck(){
    if (phase !== "PLUCK") return;
    if (!pluckQueue.length) return;
    if (!activePluck) activePluck = pluckQueue[0];

    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;
    const suits = availablePluckSuits(pluckerI, pluckeeI);

    if (pluckerI === 2){
      render();
      return;
    }

    if (!suits.length){
      pluckQueue.shift();
      activePluck = null;
      if (!pluckQueue.length) toTrumpPick();
      render();
      return;
    }

    // AI chooses suit: cheapest give card
    let bestSuit = suits[0];
    let bestVal = 999;
    for (const s of suits){
      const give = lowestOfSuitNonJoker(pluckerI, s);
      const v = give ? (RANK_VALUE[give.slice(0,-1)]||99) : 99;
      if (v < bestVal){ bestVal = v; bestSuit = s; }
    }

    const res = attemptPluck(pluckerI, pluckeeI, bestSuit);
    if (!res.ok){
      usedSuitSet(pluckerI, pluckeeI).add(bestSuit);
      if (pluckStatusEl) pluckStatusEl.textContent = `${players[pluckerI].id} FAILED ${bestSuit}. LOST.`;
    } else {
      if (pluckStatusEl) pluckStatusEl.textContent = `${players[pluckerI].id} plucked ${bestSuit}.`;
    }

    pluckQueue.shift();
    activePluck = null;
    if (!pluckQueue.length) toTrumpPick();
    render();
  }

  // ---------- trump pick ----------
  function trumpCallerIndex(){
    // dealer selects trump (per your UI wording)
    return dealerIndex;
  }

  function chooseTrumpFromOwnHand(pi){
    const suitScore = { S:0, H:0, D:0, C:0 };
    for (const c of players[pi].hand){
      if (isJoker(c)){ suitScore.S+=6; suitScore.H+=6; suitScore.D+=6; suitScore.C+=6; continue; }
      const suit = c.slice(-1);
      const rank = c.slice(0,-1);
      const v = RANK_VALUE[rank] || 0;
      suitScore[suit] += 2;                  // length weight
      if (v >= 11) suitScore[suit] += (v-10)*2; // face+ace boost
      else suitScore[suit] += Math.max(0, v-6)*0.5;
    }
    let best = "H", bestS = -999;
    for (const s of SUITS){
      if (suitScore[s] > bestS){ bestS = suitScore[s]; best = s; }
    }
    return best;
  }

  function setTrump(suit){
    trumpSuit = suit;
    // keep your current rule: clubs immediately “open”
    trumpOpen = (trumpSuit === "C");
    renderTrumpAce();
  }

  function renderTrumpStatus(){
    if (!trumpStatusEl) return;

    if (trumpSuit){
      trumpStatusEl.textContent = `Trump set: ${trumpSuit} (${suitName(trumpSuit)}).`;
      return;
    }
    trumpStatusEl.textContent = `Dealer (${players[dealerIndex].id}) selects trump.`;
  }

  function wireTrumpButtons(){
    if (!trumpPanelEl) return;
    const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
    btns.forEach(b => {
      b.onclick = () => {
        if (phase !== "TRUMP_PICK") return;
        if (trumpSuit) return;
        if (trumpCallerIndex() !== 2 && trumpCallerIndex() !== dealerIndex) return;

        // if YOU is dealer, allow clicking; if AI dealer, we auto-pick
        if (dealerIndex !== 2) return;

        const suit = b.getAttribute("data-trump");
        if (!SUITS.includes(suit)) return;

        setTrump(suit);
        msg(`You selected trump: ${suit} (${suitName(suit)}).`);
        toPlay();
        render();
        engineKick();
      };
    });
  }

  // ---------- play rules ----------
  function hasNonTrump(pi){
    return players[pi].hand.some(c => !isTrumpCard(c, trumpSuit));
  }

  function illegalReason(pi, cardStr){
    // Trick 1 lead must be 2C if you have it and you are leading
    if (trickNumber === 1 && trick.length === 0 && players[pi].hand.includes(CARD_OPEN_LEAD)){
      if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
    }

    // no leading trump until opened (spades-like), unless you only have trump
    if (trick.length === 0 && !trumpOpen && trumpSuit){
      if (isTrumpCard(cardStr, trumpSuit) && hasNonTrump(pi)) return "Trump is not open. Lead non-trump.";
    }

    // must follow suit if possible
    if (trick.length > 0){
      const must = leadSuit;
      const hasSuit = players[pi].hand.some(c => cardSuitForFollow(c, trumpSuit) === must);
      if (hasSuit && cardSuitForFollow(cardStr, trumpSuit) !== must) return `You must follow suit: ${must}.`;
    }

    return "That play is not allowed.";
  }

  function legalCardsFor(pi){
    const hand = players[pi].hand;

    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)){
      return hand.map((c,i)=>({c,i})).filter(x=>x.c===CARD_OPEN_LEAD).map(x=>x.i);
    }

    if (trick.length === 0 && !trumpOpen && trumpSuit){
      const nonTrumpIdx = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c,trumpSuit)).map(x=>x.i);
      if (nonTrumpIdx.length) return nonTrumpIdx;
      return hand.map((_,i)=>i);
    }

    if (trick.length > 0){
      const suited = hand.map((c,i)=>({c,i})).filter(x=>cardSuitForFollow(x.c,trumpSuit)===leadSuit).map(x=>x.i);
      return suited.length ? suited : hand.map((_,i)=>i);
    }

    return hand.map((_,i)=>i);
  }

  function setLeadSuitFromFirst(cardStr){
    leadSuit = cardSuitForFollow(cardStr, trumpSuit);
  }

  function updateTrumpOpen(cardStr){
    if (!trumpOpen && isTrumpCard(cardStr, trumpSuit)) trumpOpen = true;
  }

  function cardPower(cardStr){
    if (cardStr === CARD_BIG_JOKER) return 1000000;
    if (cardStr === CARD_LITTLE_JOKER) return 900000;
    const c = parseCard(cardStr);
    if (isTrumpCard(cardStr, trumpSuit)) return 10000 + c.value;
    return c.value;
  }

  function evaluateTrickWinner(){
    const anyTrump = trick.some(t => isTrumpCard(t.cardStr, trumpSuit));
    if (anyTrump){
      let bestPi = trick[0].playerIndex;
      let bestP = -1;
      for (const t of trick){
        if (!isTrumpCard(t.cardStr, trumpSuit)) continue;
        const p = cardPower(t.cardStr);
        if (p > bestP){ bestP = p; bestPi = t.playerIndex; }
      }
      return bestPi;
    }

    let bestPi = trick[0].playerIndex;
    let bestV = -1;
    for (const t of trick){
      if (cardSuitForFollow(t.cardStr, trumpSuit) !== leadSuit) continue;
      const v = parseCard(t.cardStr).value;
      if (v > bestV){ bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi;
  }

  function playCard(pi, handIdx){
    const cardStr = players[pi].hand.splice(handIdx, 1)[0];
    if (!cardStr) return;

    if (trick.length === 0) setLeadSuitFromFirst(cardStr);

    trick.push({ playerIndex: pi, cardStr });
    updateTrumpOpen(cardStr);

    // advance turn
    turnIndex = (turnIndex + 1) % 3;
    render();
  }

  // AI plays: always tries to win trick if possible, otherwise dumps low
  function aiChooseIndex(pi){
    const legal = legalCardsFor(pi);
    const hand = players[pi].hand;

    // if leading: avoid leading trump unless forced handled by legalCardsFor
    if (trick.length === 0){
      // lead highest non-trump when needing tricks; otherwise low
      let best = legal[0], bestScore = -99999;
      const need = players[pi].quota - players[pi].tricks;

      for (const idx of legal){
        const c = hand[idx];
        const p = cardPower(c);
        let s = 0;
        if (need > 0) s += p; else s -= p;
        bestScore = Math.max(bestScore, s);
        if (s >= bestScore) { bestScore = s; best = idx; }
      }
      return best;
    }

    // following: try to win if you need tricks; else try NOT to win
    const need = players[pi].quota - players[pi].tricks;

    // compute best winning card among legal
    let winBest = null, winBestP = -1;
    for (const idx of legal){
      const c = hand[idx];
      // simulate
      const temp = trick.concat([{ playerIndex: pi, cardStr: c }]);
      const savedTrick = trick;
      const savedLead = leadSuit;

      // evaluate winner of temp quickly
      const anyTrump = temp.some(t=>isTrumpCard(t.cardStr,trumpSuit));
      let wouldWin = false;
      if (anyTrump){
        let bestPi = temp[0].playerIndex, bestP=-1;
        for (const t of temp){
          if (!isTrumpCard(t.cardStr,trumpSuit)) continue;
          const pow = cardPower(t.cardStr);
          if (pow>bestP){ bestP=pow; bestPi=t.playerIndex; }
        }
        wouldWin = (bestPi===pi);
      } else {
        let bestPi = temp[0].playerIndex, bestV=-1;
        for (const t of temp){
          if (cardSuitForFollow(t.cardStr,trumpSuit)!==savedLead) continue;
          const v = parseCard(t.cardStr).value;
          if (v>bestV){ bestV=v; bestPi=t.playerIndex; }
        }
        wouldWin = (bestPi===pi);
      }

      if (wouldWin){
        const pow = cardPower(c);
        if (pow > winBestP){ winBestP = pow; winBest = idx; }
      }
    }

    if (need > 0 && winBest !== null) return winBest;

    // otherwise dump lowest power legal
    let low = legal[0], lowP = 99999999;
    for (const idx of legal){
      const p = cardPower(hand[idx]);
      if (p < lowP){ lowP = p; low = idx; }
    }
    return low;
  }

  // ---------- engine ----------
  function toDeal(){
    setPhase("DEAL");
    msg("Dealing...");
    dealHand();

    // Apply pending plucks (computed after last hand)
    if (firstHandDone && pendingPlucks && pendingPlucks.length){
      // plucks happen AFTER deal, BEFORE trump pick
      pluckQueue = pendingPlucks.slice();
      pendingPlucks = null;
      activePluck = null;

      setTimeout(() => { toPluck(); render(); }, 80);
    } else {
      // first hand OR no plucks: go directly to trump
      pendingPlucks = null;
      setTimeout(() => { toTrumpPick(); render(); }, 80);
    }

    render();
  }

  function toPluck(){
    setPhase("PLUCK");
    msg("Pluck phase.");
    render();
  }

  function toTrumpPick(){
    setPhase("TRUMP_PICK");
    const caller = trumpCallerIndex();

    if (caller !== 2){
      // AI dealer picks immediately
      const suit = chooseTrumpFromOwnHand(caller);
      setTrump(suit);
      msg(`${players[caller].id} selected trump: ${suit} (${suitName(suit)}).`);
      setTimeout(() => { toPlay(); render(); engineKick(); }, 120);
    } else {
      msg("You are dealer. Pick trump.");
    }

    render();
  }

  function toPlay(){
    setPhase("PLAY");
    trick = [];
    leadSuit = null;
    trickNumber = 1;

    // Trick 1 leader is whoever has 2C
    let whoHas2C = 0;
    for (let pi=0; pi<3; pi++){
      if (players[pi].hand.includes(CARD_OPEN_LEAD)){ whoHas2C = pi; break; }
    }
    leaderIndex = whoHas2C;
    turnIndex = whoHas2C;

    msg("Play begins.");
    render();
  }

  function endOfHand(){
    // compute plucks for NEXT deal
    computePlucksEarnedSuffered();
    pendingPlucks = buildPluckQueue();

    firstHandDone = true;

    // rotate dealer right each hand after the first
    rotateDealerRight();

    msg("Hand complete. Dealing next hand...");
    render();

    setTimeout(() => {
      toDeal();
      engineKick();
    }, 650);
  }

  function resolveTrick(){
    const winner = evaluateTrickWinner();
    players[winner].tricks += 1;

    msg(`${players[winner].id} wins the trick.`);
    render();

    setTimeout(() => {
      // next trick
      trick = [];
      leadSuit = null;
      leaderIndex = winner;
      turnIndex = winner;
      trickNumber += 1;

      if (players.every(p => p.hand.length === 0) && trickNumber > TOTAL_TRICKS){
        // safety
        endOfHand();
        return;
      }

      // if hands empty now, end hand
      if (players.every(p => p.hand.length === 0)){
        endOfHand();
        return;
      }

      render();
      engineKick();
    }, BETWEEN_TRICKS);
  }

  function engineStep(){
    if (engineBusy) return;
    engineBusy = true;

    try {
      if (phase !== "PLAY"){
        engineBusy = false;
        return;
      }

      // if trick complete, resolve
      if (trick.length === 3){
        setTimeout(() => { resolveTrick(); engineBusy = false; }, RESOLVE_DELAY);
        return;
      }

      // if it's AI turn, play after delay
      if (turnIndex !== 2){
        const pi = turnIndex;
        setTimeout(() => {
          // re-check phase still valid
          if (phase !== "PLAY"){ engineBusy = false; return; }
          const idx = aiChooseIndex(pi);
          playCard(pi, idx);
          engineBusy = false;
          engineKick();
        }, AI_DELAY);
        return;
      }

      // your turn: just wait for tap
      engineBusy = false;
      return;

    } catch (e){
      engineBusy = false;
      err("Engine crashed: " + (e?.message || e));
    }
  }

  function engineKick(){
    // tiny debounce
    setTimeout(engineStep, 0);
  }

  // ---------- events ----------
  on(resetBtn, "click", () => {
    // reset everything back to pick dealer
    firstHandDone = false;
    pendingPlucks = null;
    pluckQueue = [];
    activePluck = null;

    trumpSuit = null;
    trumpOpen = false;

    players.forEach(p => { p.hand=[]; p.tricks=0; });

    dealerIndex = null;
    updateDealerLabels();
    clearPickUI();

    setPhase("PICK_DEALER");
    msg("Reset. Pick dealer to begin.");
    render();
  });

  on(pluckNextBtn, "click", () => {
    runOnePluck();
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
      if (dealerIndex === null){
        setText(pickStatusEl, "No dealer set. Pick again.");
        return;
      }

      applyQuotasForDealer();
      updateDealerLabels();

      // lock pick buttons once accepted
      pickOkBtn.disabled = true;
      pickReBtn.disabled = true;
      pickBtn.disabled = true;

      msg(`Dealer set to ${players[dealerIndex].id}. Starting hand 1 (no pluck).`);
      render();

      // start first hand
      toDeal();
      engineKick();
    };
  }

  // Trump buttons: only work when YOU are dealer
  wireTrumpButtons();

  // ---------- boot ----------
  clearPickUI();
  setPhase("PICK_DEALER");
  msg("Pick dealer to begin.");
  render();

})();
