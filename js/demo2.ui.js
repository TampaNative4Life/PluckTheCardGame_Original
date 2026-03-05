// =========================
// Pluck Demo 2 - demo2.js (UI LOCK)
// - Keeps approved UI layout exactly (no UI rework)
// - Implements start sequence:
//   Pick Dealer -> hide pick overlay -> deal -> dealer calls trump -> gameplay
// - No AI hand cards rendered (hidden by design)
// - Stable engine, no freezes
// =========================

(function(){
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const setText = (el, txt) => { if (el) el.textContent = txt; };

  // ---------- required DOM ----------
  const youHandEl = $("youHand");
  const trickSlotsEl = $("trickSlots");
  const resetBtn = $("resetBtn");

  const trumpLabelEl = $("trumpLabel");
  const booksSummaryEl = $("booksSummary");
  const phaseValEl = $("phaseVal");
  const dealerValEl = $("dealerVal");

  const pickOverlayEl = $("pickOverlay");
  const pickBtn = $("pickBtn");
  const pickOkBtn = $("pickOkBtn");
  const pickReBtn = $("pickReBtn");
  const pickStatusEl = $("pickStatus");
  const pickAI2El = $("pickAI2");
  const pickAI3El = $("pickAI3");
  const pickYOUEl = $("pickYOU");

  const trumpOverlayEl = $("trumpOverlay");
  const trumpStatusEl = $("trumpStatus");

  if (!youHandEl || !trickSlotsEl || !resetBtn || !phaseValEl || !dealerValEl || !pickOverlayEl || !trumpOverlayEl) {
    console.error("[Pluck Demo2] Missing required DOM elements.");
    return;
  }

  // ---------- constants ----------
  const TOTAL_TRICKS = 17;
  const SUITS = ["S","H","D","C"];
  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14,"2":2 };
  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

  const AI_DELAY = 260;
  const RESOLVE_DELAY = 260;
  const BETWEEN_TRICKS = 220;

  // ---------- game state ----------
  // 0 = AI2, 1 = AI3, 2 = YOU
  const players = [
    { id:"AI2", hand:[], tricks:0, quota:7 },
    { id:"AI3", hand:[], tricks:0, quota:6 },
    { id:"YOU", hand:[], tricks:0, quota:4 }
  ];

  let phase = "PICK";        // PICK, DEAL, TRUMP, PLAY
  let dealerIndex = null;

  let trumpSuit = null;
  let trumpOpen = false;

  let trick = [];            // [{pi, card}]
  let leadSuit = null;
  let trickNumber = 0;
  let turnIndex = 0;

  let engineBusy = false;

  // ---------- card utils ----------
  function suitName(s){ return s==="S"?"Spades":s==="H"?"Hearts":s==="D"?"Diamonds":"Clubs"; }
  function suitSymbol(s){ return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣"; }
  function isRedSuit(s){ return s==="H" || s==="D"; }
  function isJoker(c){ return c===CARD_BIG_JOKER || c===CARD_LITTLE_JOKER; }

  function parseCard(cs){
    if (cs === CARD_BIG_JOKER) return { kind:"JOKER", rank:"BJ", suit:null, value: 1000 };
    if (cs === CARD_LITTLE_JOKER) return { kind:"JOKER", rank:"LJ", suit:null, value: 900 };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    return { kind:"NORMAL", rank, suit, value: RANK_VALUE[rank] || 0 };
  }

  function makeDeck51(){
    const deck = [];
    for (const s of SUITS) for (const r of RANKS_NO_2) deck.push(r + s);
    deck.push(CARD_OPEN_LEAD);
    deck.push(CARD_BIG_JOKER);
    deck.push(CARD_LITTLE_JOKER);
    return deck;
  }

  function shuffle(a){
    for (let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
    return a;
  }

  function cardSuitForFollow(cs){
    if (isJoker(cs)) return trumpSuit || null;
    return cs.slice(-1);
  }

  function isTrumpCard(cs){
    if (!trumpSuit) return false;
    if (isJoker(cs)) return true;
    return cs.slice(-1) === trumpSuit;
  }

  // ---------- UI helpers ----------
  function setPhase(p){
    phase = p;
    setText(phaseValEl, p);
  }

  function setDealerUI(){
    setText(dealerValEl, dealerIndex===null ? "(not set)" : players[dealerIndex].id);
  }

  function setTrumpUI(){
    setText(trumpLabelEl, trumpSuit ? suitName(trumpSuit) : "(not set)");
  }

  function setBooksUI(){
    setText(booksSummaryEl, `YOU ${players[2].tricks} • AI2 ${players[0].tricks} • AI3 ${players[1].tricks}`);
  }

  function showPickOverlay(show){
    pickOverlayEl.style.display = show ? "flex" : "none";
    pickOverlayEl.setAttribute("aria-hidden", show ? "false" : "true");
  }

  function showTrumpOverlay(show){
    trumpOverlayEl.style.display = show ? "flex" : "none";
    trumpOverlayEl.setAttribute("aria-hidden", show ? "false" : "true");
  }

  // Small card tile (matches CSS .cardFaceMini)
  function makeMiniCard(cardStr, disabled){
    const el = document.createElement("div");
    el.className = "cardFaceMini" + (disabled ? " disabled" : "");

    if (cardStr === CARD_BIG_JOKER || cardStr === CARD_LITTLE_JOKER){
      el.classList.add("joker");
      const corner = document.createElement("div");
      corner.className = "miniCorner";
      corner.textContent = cardStr;
      const suit = document.createElement("div");
      suit.className = "miniSuit";
      suit.textContent = "🃏";
      el.appendChild(corner);
      el.appendChild(suit);
      return el;
    }

    const suit = cardStr.slice(-1);
    const rank = cardStr.slice(0, cardStr.length-1);
    el.classList.add(isRedSuit(suit) ? "red" : "black");

    const corner = document.createElement("div");
    corner.className = "miniCorner";
    corner.innerHTML = `${rank}<br>${suitSymbol(suit)}`;

    const mid = document.createElement("div");
    mid.className = "miniSuit";
    mid.textContent = suitSymbol(suit);

    el.appendChild(corner);
    el.appendChild(mid);
    return el;
  }

  function renderTrick(){
    trickSlotsEl.innerHTML = "";
    if (!trick.length){
      const hint = document.createElement("div");
      hint.className = "slotHint";
      hint.textContent = "(empty)";
      trickSlotsEl.appendChild(hint);
      return;
    }

    // order display: AI2, AI3, YOU (stable visual)
    const order = [0,1,2];
    for (const pi of order){
      const t = trick.find(x => x.pi === pi);
      if (!t) continue;

      const wrap = document.createElement("div");
      wrap.className = "trickSlotWrap";

      const lbl = document.createElement("div");
      lbl.className = "trickSlotLabel";
      lbl.textContent = players[pi].id;

      const card = makeMiniCard(t.card, true);
      wrap.appendChild(lbl);
      wrap.appendChild(card);
      trickSlotsEl.appendChild(wrap);
    }
  }

  function renderHand(){
    youHandEl.innerHTML = "";

    const hand = players[2].hand.slice();
    // simple sort: Jokers first, then suit, then high to low
    hand.sort((a,b)=>{
      if (a===CARD_BIG_JOKER) return -1;
      if (b===CARD_BIG_JOKER) return 1;
      if (a===CARD_LITTLE_JOKER && b!==CARD_BIG_JOKER) return -1;
      if (b===CARD_LITTLE_JOKER && a!==CARD_BIG_JOKER) return 1;

      const pa = parseCard(a), pb = parseCard(b);
      const sa = pa.suit || "Z", sb = pb.suit || "Z";
      if (sa !== sb) return sa.localeCompare(sb);
      return (pb.value - pa.value);
    });

    // clickable cards only when it's your turn in PLAY
    const yourTurn = (phase === "PLAY" && turnIndex === 2);
    const legalIdx = yourTurn ? legalCardsFor(2) : [];

    // map display card -> original index in real hand (first match is fine for demo)
    for (const cardStr of hand){
      const realIdx = players[2].hand.indexOf(cardStr);
      const disabled = !yourTurn || !legalIdx.includes(realIdx);
      const el = makeMiniCard(cardStr, disabled);

      el.addEventListener("click", () => {
        if (disabled) return;

        const legalNow = legalCardsFor(2);
        if (!legalNow.includes(realIdx)) return;

        playCard(2, realIdx);
        engineKick();
      });

      youHandEl.appendChild(el);
    }
  }

  function renderAll(){
    setDealerUI();
    setTrumpUI();
    setBooksUI();
    renderTrick();
    renderHand();
  }

  // ---------- pick dealer ----------
  function pickOneCard(){
    const d = shuffle(makeDeck51());
    let c = d.pop();
    // (keep jokers allowed for UI pick? You originally excluded; we’ll exclude so dealer pick feels normal)
    while (c === CARD_BIG_JOKER || c === CARD_LITTLE_JOKER) c = d.pop();
    return c;
  }

  function pickValue(cardStr){
    const p = parseCard(cardStr);
    return p.value;
  }

  function clearPickUI(){
    if (pickAI2El) pickAI2El.textContent = "(none)";
    if (pickAI3El) pickAI3El.textContent = "(none)";
    if (pickYOUEl) pickYOUEl.textContent = "(none)";
    setText(pickStatusEl, "Click Pick.");
    if (pickOkBtn) pickOkBtn.disabled = true;
    if (pickReBtn) pickReBtn.disabled = true;
    if (pickBtn) pickBtn.disabled = false;
  }

  function doPick(){
    const picks = { ai2: pickOneCard(), ai3: pickOneCard(), you: pickOneCard() };

    // show picked cards as mini tiles inside overlay
    pickAI2El.innerHTML = ""; pickAI2El.appendChild(makeMiniCard(picks.ai2, true));
    pickAI3El.innerHTML = ""; pickAI3El.appendChild(makeMiniCard(picks.ai3, true));
    pickYOUEl.innerHTML = ""; pickYOUEl.appendChild(makeMiniCard(picks.you, true));

    const vals = [
      { pi:0, v: pickValue(picks.ai2) },
      { pi:1, v: pickValue(picks.ai3) },
      { pi:2, v: pickValue(picks.you) }
    ].sort((a,b)=>a.v-b.v);

    const lowest = vals[0].v;
    const tied = vals.filter(x => x.v === lowest);

    if (tied.length > 1){
      dealerIndex = null;
      setDealerUI();
      setText(pickStatusEl, "Tie for lowest. Click Re-Pick.");
      pickOkBtn.disabled = true;
      pickReBtn.disabled = false;
      return;
    }

    dealerIndex = vals[0].pi;
    setDealerUI();
    setText(pickStatusEl, `Dealer will be ${players[dealerIndex].id}. Click OK.`);
    pickOkBtn.disabled = false;
    pickReBtn.disabled = true;
  }

  // ---------- deal / quotas ----------
  function leftOf(i){ return (i+1)%3; }
  function rightOf(i){ return (i+2)%3; }

  function applyQuotasForDealer(){
    // dealer=7, left=6, right=4 (matches your engine version)
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }

  function resetHandState(){
    trick = [];
    leadSuit = null;
    trickNumber = 0;
    turnIndex = 0;

    trumpSuit = null;
    trumpOpen = false;

    players.forEach(p => { p.hand=[]; p.tricks=0; });
  }

  function dealHand(){
    resetHandState();
    applyQuotasForDealer();

    const deck = shuffle(makeDeck51());
    for (let i=0;i<TOTAL_TRICKS;i++){
      players[0].hand.push(deck.pop());
      players[1].hand.push(deck.pop());
      players[2].hand.push(deck.pop());
    }
  }

  // ---------- trump ----------
  function chooseTrumpAI(pi){
    const suitScore = { S:0,H:0,D:0,C:0 };
    for (const c of players[pi].hand){
      if (isJoker(c)){ SUITS.forEach(s => suitScore[s]+=6); continue; }
      const suit = c.slice(-1);
      const rank = c.slice(0,-1);
      const v = RANK_VALUE[rank] || 0;
      suitScore[suit] += 2;
      if (v >= 11) suitScore[suit] += (v-10)*2;
    }
    let best="H", bestV=-999;
    for (const s of SUITS){
      if (suitScore[s] > bestV){ bestV=suitScore[s]; best=s; }
    }
    return best;
  }

  function setTrump(s){
    trumpSuit = s;
    trumpOpen = (s === "C"); // your rule
    setTrumpUI();
  }

  function wireTrumpButtons(){
    const btns = trumpOverlayEl.querySelectorAll("button[data-trump]");
    btns.forEach(b => {
      b.addEventListener("click", () => {
        if (phase !== "TRUMP") return;
        if (dealerIndex !== 2) return; // only YOU can click if YOU dealer
        const s = b.getAttribute("data-trump");
        if (!SUITS.includes(s)) return;

        setTrump(s);
        showTrumpOverlay(false);
        startPlay();
      });
    });
  }

  // ---------- play rules ----------
  function hasNonTrump(pi){
    return players[pi].hand.some(c => !isTrumpCard(c));
  }

  function legalCardsFor(pi){
    const hand = players[pi].hand;

    // Trick 1 first lead must be 2C (if you have it)
    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)){
      return hand.map((c,i)=>({c,i})).filter(x => x.c===CARD_OPEN_LEAD).map(x => x.i);
    }

    // Can't lead trump if not open (unless you have only trump)
    if (trick.length === 0 && !trumpOpen && trumpSuit){
      const nonTrump = hand.map((c,i)=>({c,i})).filter(x => !isTrumpCard(x.c)).map(x => x.i);
      if (nonTrump.length) return nonTrump;
      return hand.map((_,i)=>i);
    }

    // Follow suit if possible
    if (trick.length > 0){
      const suited = hand.map((c,i)=>({c,i}))
        .filter(x => cardSuitForFollow(x.c) === leadSuit)
        .map(x => x.i);
      return suited.length ? suited : hand.map((_,i)=>i);
    }

    return hand.map((_,i)=>i);
  }

  function cardPower(cs){
    if (cs === CARD_BIG_JOKER) return 1000000;
    if (cs === CARD_LITTLE_JOKER) return 900000;
    const p = parseCard(cs);
    if (isTrumpCard(cs)) return 10000 + p.value;
    return p.value;
  }

  function evaluateWinner(){
    const anyTrump = trick.some(t => isTrumpCard(t.card));
    if (anyTrump){
      let bestPi = trick[0].pi, bestPow=-1;
      for (const t of trick){
        if (!isTrumpCard(t.card)) continue;
        const pow = cardPower(t.card);
        if (pow > bestPow){ bestPow = pow; bestPi = t.pi; }
      }
      return bestPi;
    }

    // no trump: highest of lead suit
    let bestPi = trick[0].pi, bestV=-1;
    for (const t of trick){
      if (cardSuitForFollow(t.card) !== leadSuit) continue;
      const v = parseCard(t.card).value;
      if (v > bestV){ bestV=v; bestPi=t.pi; }
    }
    return bestPi;
  }

  function playCard(pi, handIdx){
    const card = players[pi].hand.splice(handIdx, 1)[0];
    if (!card) return;

    if (trick.length === 0){
      leadSuit = cardSuitForFollow(card);
    }

    trick.push({ pi, card });

    // opening trump the moment someone plays trump (if not already open)
    if (!trumpOpen && isTrumpCard(card)) trumpOpen = true;

    turnIndex = (turnIndex + 1) % 3;
    renderAll();
  }

  function aiChooseIndex(pi){
    const legal = legalCardsFor(pi);
    const hand = players[pi].hand;
    const need = players[pi].quota - players[pi].tricks;

    // lead: if need tricks, lead higher, else dump lower
    if (trick.length === 0){
      let best = legal[0];
      let bestScore = -999999;
      for (const idx of legal){
        const p = cardPower(hand[idx]);
        const score = (need > 0) ? p : -p;
        if (score > bestScore){ bestScore = score; best = idx; }
      }
      return best;
    }

    // follow: if need tricks, try to win; else dump lowest legal
    let winPick = null, winPow = -1;
    for (const idx of legal){
      const c = hand[idx];
      const temp = trick.concat([{ pi, card:c }]);

      // evaluate winner if this card played
      const anyTrump = temp.some(t => isTrumpCard(t.card));
      let wouldWin = false;

      if (anyTrump){
        let bpi = temp[0].pi, bpow=-1;
        for (const t of temp){
          if (!isTrumpCard(t.card)) continue;
          const pow = cardPower(t.card);
          if (pow > bpow){ bpow=pow; bpi=t.pi; }
        }
        wouldWin = (bpi === pi);
      } else {
        let bpi = temp[0].pi, bv=-1;
        for (const t of temp){
          if (cardSuitForFollow(t.card) !== leadSuit) continue;
          const v = parseCard(t.card).value;
          if (v > bv){ bv=v; bpi=t.pi; }
        }
        wouldWin = (bpi === pi);
      }

      if (wouldWin){
        const pow = cardPower(c);
        if (pow > winPow){ winPow = pow; winPick = idx; }
      }
    }

    if (need > 0 && winPick !== null) return winPick;

    let low = legal[0], lowPow = Infinity;
    for (const idx of legal){
      const pow = cardPower(hand[idx]);
      if (pow < lowPow){ lowPow = pow; low = idx; }
    }
    return low;
  }

  // ---------- engine ----------
  function startDeal(){
    setPhase("DEAL");
    dealHand();
    renderAll();

    // go to trump selection immediately
    setTimeout(startTrump, 120);
  }

  function startTrump(){
    setPhase("TRUMP");
    setTrumpUI();
    renderAll();

    if (dealerIndex === 2){
      setText(trumpStatusEl, "You are dealer. Select trump.");
      showTrumpOverlay(true);
      return;
    }

    // AI dealer selects trump, show overlay briefly for UX, then auto-hide
    const suit = chooseTrumpAI(dealerIndex);
    setTrump(suit);
    setText(trumpStatusEl, `${players[dealerIndex].id} selected trump: ${suitName(suit)}.`);
    showTrumpOverlay(true);

    setTimeout(() => {
      showTrumpOverlay(false);
      startPlay();
    }, 650);
  }

  function startPlay(){
    setPhase("PLAY");
    trick = [];
    leadSuit = null;
    trickNumber = 1;

    // trick 1 leader is whoever has 2C
    let whoHas2C = 0;
    for (let pi=0; pi<3; pi++){
      if (players[pi].hand.includes(CARD_OPEN_LEAD)){ whoHas2C = pi; break; }
    }
    turnIndex = whoHas2C;

    renderAll();
    engineKick();
  }

  function resolveTrick(){
    const winner = evaluateWinner();
    players[winner].tricks += 1;

    renderAll();

    setTimeout(() => {
      trick = [];
      leadSuit = null;
      turnIndex = winner;
      trickNumber += 1;

      // if hand over, auto re-deal (simple loop for demo)
      if (players.every(p => p.hand.length === 0)){
        // rotate dealer right for demo continuity
        dealerIndex = (dealerIndex + 2) % 3;
        setDealerUI();
        trumpSuit = null;
        trumpOpen = false;
        setTrumpUI();
        setTimeout(startDeal, 600);
        return;
      }

      renderAll();
      engineKick();
    }, BETWEEN_TRICKS);
  }

  function engineStep(){
    if (engineBusy) return;
    engineBusy = true;

    try{
      if (phase !== "PLAY"){
        engineBusy = false;
        return;
      }

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

      // your turn, wait for click
      engineBusy = false;
    } catch(e){
      engineBusy = false;
      console.error("[Pluck Demo2] Engine error:", e);
    }
  }

  function engineKick(){
    setTimeout(engineStep, 0);
  }

  // ---------- events ----------
  resetBtn.addEventListener("click", () => {
    // full reset
    engineBusy = false;

    dealerIndex = null;
    trumpSuit = null;
    trumpOpen = false;

    players.forEach(p => { p.hand=[]; p.tricks=0; });

    trick = [];
    leadSuit = null;
    trickNumber = 0;
    turnIndex = 0;

    showTrumpOverlay(false);
    showPickOverlay(true);

    clearPickUI();
    setPhase("PICK");
    setDealerUI();
    setTrumpUI();
    setBooksUI();
    renderAll();
  });

  pickBtn.addEventListener("click", () => {
    doPick();
    renderAll();
  });

  pickReBtn.addEventListener("click", () => {
    doPick();
    renderAll();
  });

  pickOkBtn.addEventListener("click", () => {
    if (dealerIndex === null){
      setText(pickStatusEl, "No dealer set. Pick again.");
      return;
    }

    // hide pick overlay, start deal
    showPickOverlay(false);
    startDeal();
  });

  wireTrumpButtons();

  // ---------- boot ----------
  clearPickUI();
  showPickOverlay(true);
  showTrumpOverlay(false);
  setPhase("PICK");
  setDealerUI();
  setTrumpUI();
  setBooksUI();
  renderAll();

})();
