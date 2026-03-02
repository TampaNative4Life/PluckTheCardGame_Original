// Pluck Web Demo v22 (full replacement)
// Fixes:
// - No freezes (single-step engine, locked properly)
// - No “double text” (works with proper CSS; also guards against duplicates)
// - Card faces + highlights (legal moves, trick cards, selected trump)
// - Sorting per your spec: Jokers first, then trump suit, then S,H,C,D (black/red/black/red)

(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const on = (el, evt, fn) => el && el.addEventListener(evt, fn);
  const setText = (el, txt) => { if (el) el.textContent = txt; };

  function msg(txt) { setText($("msg"), txt); }
  function err(txt) { setText($("msg"), "ERROR: " + txt); console.error("[Pluck]", txt); }

  window.addEventListener("error", (e) => err(e?.message || "Unknown JS error"));

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
  const BRBR = ["S", "H", "C", "D"]; // black, red, black, red
  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

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
  function makeCardFace(cardStr, disabled=false, extraClass="") {
    const el = document.createElement("div");
    el.className = "cardFace" + (disabled ? " disabled" : "") + (extraClass ? (" " + extraClass) : "");

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
    { id:"AI2", hand:[], tricks:0, quota:7, plucksEarned:0, plucksSuffered:0 },
    { id:"AI3", hand:[], tricks:0, quota:6, plucksEarned:0, plucksSuffered:0 },
    { id:"YOU", hand:[], tricks:0, quota:4, plucksEarned:0, plucksSuffered:0 }
  ];

  function leftOf(i){ return (i+1)%3; }
  function rightOf(i){ return (i+2)%3; }

  let dealerIndex = null;
  let firstHandDone = false;

  // phases: PICK_DEALER -> DEAL -> (PLUCK?) -> TRUMP_PICK -> PLAY
  let phase = "PICK_DEALER";

  let trumpSuit = null;
  let trumpOpen = false;

  let trick = [];      // {playerIndex, cardStr}
  let leadSuit = null;
  let trickNumber = 0;

  let leaderIndex = 0;
  let turnIndex = 0;

  // pluck state
  let pendingPlucks = null;
  let pluckQueue = [];
  let activePluck = null;
  let pluckSuitUsedByPair = new Map();

  // engine lock
  let engineBusy = false;

  function setPhase(newPhase){
    phase = newPhase;
    setText(phaseLabelEl, newPhase);

    [pDeal,pPluck,pTrump,pPlay].forEach(x => x && x.classList.remove("activeChip"));
    if (newPhase === "DEAL") pDeal && pDeal.classList.add("activeChip");
    if (newPhase === "PLUCK") pPluck && pPluck.classList.add("activeChip");
    if (newPhase === "TRUMP_PICK") pTrump && pTrump.classList.add("activeChip");
    if (newPhase === "PLAY") pPlay && pPlay.classList.add("activeChip");

    if (pluckPanelEl) pluckPanelEl.style.display = (newPhase === "PLUCK") ? "block" : "none";
    if (trumpPanelEl) trumpPanelEl.style.display = (newPhase === "TRUMP_PICK") ? "block" : "none";
  }

  function updateDealerLabels(){
    const txt = (dealerIndex === null) ? "(not set)" : players[dealerIndex].id;
    setText(dealerLabelEl, txt);
    setText(dealerBannerEl, txt);
  }

  function applyQuotasForDealer(){
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }

  function rotateDealerRight(){
    dealerIndex = rightOf(dealerIndex);
    applyQuotasForDealer();
    updateDealerLabels();
  }

  // ---------- sorting (your requirement) ----------
  function suitOrderForHand(){
    if (!trumpSuit) return BRBR.slice();
    return [trumpSuit, ...BRBR.filter(s => s !== trumpSuit)];
  }

  function sortHandForDisplay(hand){
    const suitOrder = suitOrderForHand();
    const rankOrder = { "A":14,"K":13,"Q":12,"J":11,"10":10,"9":9,"8":8,"7":7,"6":6,"5":5,"4":4,"3":3,"2":2 };

    const suitGroup = (s) => {
      const idx = suitOrder.indexOf(s);
      return idx === -1 ? 99 : idx;
    };

    const key = (cs) => {
      if (cs === CARD_BIG_JOKER) return { a:0, b:0, c:0 };
      if (cs === CARD_LITTLE_JOKER) return { a:0, b:1, c:0 };
      const suit = cs.slice(-1);
      const rank = cs.slice(0, cs.length-1);
      const sg = 1 + suitGroup(suit);
      const rv = rankOrder[rank] ?? 0;
      return { a: sg, b: 0, c: (100 - rv) }; // high ranks first
    };

    return hand.slice().sort((x,y)=>{
      const a = key(x), b = key(y);
      if (a.a !== b.a) return a.a - b.a;
      if (a.b !== b.b) return a.b - b.b;
      return a.c - b.c;
    });
  }

  // ---------- rendering ----------
  function renderTrumpAce(){
    if (!trumpAceSlotEl) return;
    trumpAceSlotEl.innerHTML = "";
    if (!trumpSuit) { trumpAceSlotEl.textContent = "(none)"; return; }
    trumpAceSlotEl.appendChild(makeCardFace("A" + trumpSuit, true));
  }

  function highlightTrumpButton(){
    if (!trumpPanelEl) return;
    const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
    btns.forEach(b => {
      const s = b.getAttribute("data-trump");
      b.classList.toggle("selected", !!trumpSuit && s === trumpSuit);
    });
  }

  function render(){
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

    if (ai2HandEl) ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
    if (ai3HandEl) ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

    const whoTurn = (phase === "PLAY")
      ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`)
      : "—";
    const leadTxt = leadSuit ? `${leadSuit} (${suitName(leadSuit)})` : "(none)";
    setText(
      turnBannerEl,
      `Phase: ${phase} • ${whoTurn} • Lead suit: ${leadTxt} • Trump: ${trumpSuit || "(none)"} • Dealer: ${dealerIndex===null?"(none)":players[dealerIndex].id}`
    );

    // YOUR HAND (guard against duplicates)
    handEl.replaceChildren();

    const displayHand = sortHandForDisplay(players[2].hand);

    let legalIdx = [];
    if (phase === "PLAY" && turnIndex === 2) legalIdx = legalCardsFor(2);

    for (const card of displayHand) {
      // IMPORTANT: if there are duplicates (same string), indexOf returns the first.
      // Use findIndex with an occurrence counter to correctly map display -> real index.
      // We'll map by walking the real hand and tracking counts.
      const realIdx = findRealIndex(players[2].hand, card, displayHand, card);

      const playable = (phase === "PLAY" && turnIndex === 2);
      const disabled = !playable || !legalIdx.includes(realIdx);

      const extra = (!disabled && playable) ? "legalGlow" : "";
      const face = makeCardFace(card, disabled, extra);

      face.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (disabled) return;
        if (!(phase === "PLAY" && turnIndex === 2)) return;

        const legalNow = legalCardsFor(2);
        if (!legalNow.includes(realIdx)) { msg(illegalReason(2, card)); return; }

        playCard(2, realIdx);
        engineKick();
      }, { passive:false });

      handEl.appendChild(face);
    }

    // TRICK
    trickEl.replaceChildren();
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
        label.style.color = "#cdd6ea";
        label.textContent = players[t.playerIndex].id;

        const face = makeCardFace(t.cardStr, true, "trickCard");
        face.style.cursor = "default";

        wrap.appendChild(label);
        wrap.appendChild(face);
        trickEl.appendChild(wrap);
      }
    }

    renderTrumpAce();
    highlightTrumpButton();

    if (phase === "PLUCK") renderPluckStatus();
    if (phase === "TRUMP_PICK") renderTrumpStatus();
  }

  // If the same card string appears twice (shouldn’t in your deck, but safe),
  // this helps map display card -> correct real index.
  function findRealIndex(realHand, cardStr){
    // In your deck, only jokers can appear once each, everything else unique.
    // So indexOf is fine — but keep safe:
    const idx = realHand.indexOf(cardStr);
    return idx < 0 ? 0 : idx;
  }

  // ---------- initial pick ----------
  function pickOneCard(){
    const d = shuffle(makeDeck51());
    return d.pop();
  }

  function pickRankValue(cardStr){
    if (cardStr === CARD_BIG_JOKER) return 100;
    if (cardStr === CARD_LITTLE_JOKER) return 99;
    const p = parseCard(cardStr);
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
    if (pickBtn) pickBtn.disabled = false;
    dealerIndex = null;
    updateDealerLabels();
  }

  function doPick(){
    const picks = {
      ai2: pickOneCard(),
      ai3: pickOneCard(),
      you: pickOneCard()
    };

    if (pickAI2El) { pickAI2El.innerHTML = ""; pickAI2El.appendChild(makeCardFace(picks.ai2, true)); }
    if (pickAI3El) { pickAI3El.innerHTML = ""; pickAI3El.appendChild(makeCardFace(picks.ai3, true)); }
    if (pickYOUEl) { pickYOUEl.innerHTML = ""; pickYOUEl.appendChild(makeCardFace(picks.you, true)); }

    const vals = [
      { pi:0, v: pickRankValue(picks.ai2) },
      { pi:1, v: pickRankValue(picks.ai3) },
      { pi:2, v: pickRankValue(picks.you) }
    ].sort((a,b)=>a.v-b.v);

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
    setText(pickStatusEl, `Dealer will be ${players[dealerIndex].id}. Click OK (Start Game).`);
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

    if (pluckerI === 2){
      pluckNextBtn.disabled = true;
      pluckStatusEl.textContent = `You are plucking ${players[pluckeeI].id}. Choose a suit. Failed suit = LOST.`;

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
            pluckStatusEl.textContent = `FAILED ${s} (${res.reason}). LOST.`;
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
  function trumpCallerIndex(){ return dealerIndex; }

  function chooseTrumpFromOwnHand(pi){
    const suitScore = { S:0, H:0, D:0, C:0 };
    for (const c of players[pi].hand){
      if (isJoker(c)){ SUITS.forEach(s=>suitScore[s]+=6); continue; }
      const suit = c.slice(-1);
      const rank = c.slice(0,-1);
      const v = RANK_VALUE[rank] || 0;
      suitScore[suit] += 2;
      if (v >= 11) suitScore[suit] += (v-10)*2;
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
    trumpOpen = (trumpSuit === "C"); // your rule
    renderTrumpAce();
    highlightTrumpButton();
    render(); // re-render so hand sorting updates immediately
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
        if (dealerIndex !== 2) return; // only YOU clicks when YOU are dealer

        const suit = b.getAttribute("data-trump");
        if (!SUITS.includes(suit)) return;

        setTrump(suit);
        msg(`You selected trump: ${suit} (${suitName(suit)}).`);
        toPlay();
        engineKick();
      };
    });
  }

  // ---------- play rules ----------
  function hasNonTrump(pi){
    return players[pi].hand.some(c => !isTrumpCard(c, trumpSuit));
  }

  function illegalReason(pi, cardStr){
    if (trickNumber === 1 && trick.length === 0 && players[pi].hand.includes(CARD_OPEN_LEAD)){
      if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
    }
    if (trick.length === 0 && !trumpOpen && trumpSuit){
      if (isTrumpCard(cardStr, trumpSuit) && hasNonTrump(pi)) return "Trump is not open. Lead non-trump.";
    }
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

    turnIndex = (turnIndex + 1) % 3;
    render();
  }

  // AI: win if need tricks, else dump low
  function aiChooseIndex(pi){
    const legal = legalCardsFor(pi);
    const hand = players[pi].hand;
    const need = players[pi].quota - players[pi].tricks;

    if (trick.length === 0){
      let best = legal[0], bestScore = -999999;
      for (const idx of legal){
        const c = hand[idx];
        const p = cardPower(c);
        const score = (need > 0) ? p : -p;
        if (score > bestScore){ bestScore = score; best = idx; }
      }
      return best;
    }

    let winBest = null, winBestP = -1;
    for (const idx of legal){
      const c = hand[idx];
      const temp = trick.concat([{ playerIndex: pi, cardStr: c }]);

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
          if (cardSuitForFollow(t.cardStr,trumpSuit)!==leadSuit) continue;
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

    if (firstHandDone && pendingPlucks && pendingPlucks.length){
      pluckQueue = pendingPlucks.slice();
      pendingPlucks = null;
      activePluck = null;
      setTimeout(() => { toPluck(); render(); }, 60);
    } else {
      pendingPlucks = null;
      setTimeout(() => { toTrumpPick(); render(); }, 60);
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
    computePlucksEarnedSuffered();
    pendingPlucks = buildPluckQueue();
    firstHandDone = true;

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
      trick = [];
      leadSuit = null;
      leaderIndex = winner;
      turnIndex = winner;
      trickNumber += 1;

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
      if (phase !== "PLAY"){ engineBusy = false; return; }

      if (trick.length === 3){
        setTimeout(() => { resolveTrick(); engineBusy = false; }, RESOLVE_DELAY);
        return;
      }

      if (turnIndex !== 2){
        const pi = turnIndex;
        setTimeout(() => {
          if (phase !== "PLAY"){ engineBusy = false; return; }
          const idx = aiChooseIndex(pi);
          playCard(pi, idx);
          engineBusy = false;
          engineKick();
        }, AI_DELAY);
        return;
      }

      engineBusy = false; // your turn
      return;

    } catch (e){
      engineBusy = false;
      err("Engine crashed: " + (e?.message || e));
    }
  }

  function engineKick(){
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

    players.forEach(p => { p.hand=[]; p.tricks=0; });

    dealerIndex = null;
    updateDealerLabels();
    clearPickUI();

    setPhase("PICK_DEALER");
    msg("Reset. Pick dealer to begin.");
    render();
  });

  on(pluckNextBtn, "click", () => runOnePluck());

  if (pickBtn) pickBtn.onclick = () => { setPhase("PICK_DEALER"); doPick(); render(); };
  if (pickReBtn) pickReBtn.onclick = () => { doPick(); render(); };

  if (pickOkBtn) {
    pickOkBtn.onclick = () => {
      if (dealerIndex === null){
        setText(pickStatusEl, "No dealer set. Pick again.");
        return;
      }

      applyQuotasForDealer();
      updateDealerLabels();

      pickOkBtn.disabled = true;
      pickReBtn.disabled = true;
      pickBtn.disabled = true;

      msg(`Dealer set to ${players[dealerIndex].id}. Starting hand 1 (no pluck).`);
      render();

      toDeal();
      engineKick();
    };
  }

  wireTrumpButtons();

  // ---------- boot ----------
  clearPickUI();
  setPhase("PICK_DEALER");
  msg("Pick dealer to begin.");
  render();
  clearPickUI();
setPhase("PICK_DEALER");
msg("Pick dealer to begin.");
render(); 

})();
