// Pluck Demo 2 - demo2.js (FULL REPLACEMENT)
// LOCKED UI: this file only drives state + renders into existing IDs.
// Sequence: PICK -> DEAL -> TRUMP_PICK -> PLAY
// Notes:
// - AI hands are hidden (no backs displayed)
// - Your 17 cards render BELOW the table
// - Trick cards render center (3 slots labeled AI2/AI3/YOU)
// - First/last card never cut off (CSS hard lock + scroll)

(function(){
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const setText = (el, txt) => { if (el) el.textContent = txt; };

  const msgEl = $("msg");
  const msg = (t) => setText(msgEl, t);

  // HUD
  const trumpLabelEl = $("trumpLabel");
  const booksSummaryEl = $("booksSummary");
  const phaseValEl = $("phaseVal");
  const dealerValEl = $("dealerVal");

  // Table
  const trickSlotsEl = $("trickSlots");

  // Hand (below table)
  const youHandEl = $("youHand");

  // Controls
  const resetBtn = $("resetBtn");

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

  if (!trickSlotsEl || !youHandEl || !resetBtn || !pickPanel || !pickBtn || !pickOkBtn || !pickReBtn || !trumpPanel) {
    console.error("[Pluck Demo2] Missing required DOM elements.");
    return;
  }

  window.addEventListener("error", (e) => {
    console.error("[Pluck Demo2] JS error:", e?.message || e);
    msg("ERROR: " + (e?.message || "Unknown error"));
  });

  // ---------- constants ----------
  const TOTAL_TRICKS = 17;
  const SUITS = ["S","H","D","C"];
  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

  const AI_DELAY = 260;
  const RESOLVE_DELAY = 280;
  const BETWEEN_TRICKS = 240;

  // ---------- deck ----------
  function makeDeck51(){
    const deck = [];
    for (const s of SUITS) for (const r of RANKS_NO_2) deck.push(r + s);
    deck.push("2C");
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

  // ---------- card UI ----------
  function suitSymbol(s){ return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣"; }
  function isRedSuit(s){ return s==="H" || s==="D"; }
  function isJoker(cs){ return cs===CARD_BIG_JOKER || cs===CARD_LITTLE_JOKER; }

  function makeMiniCard(cardStr, disabled=false){
    const el = document.createElement("div");
    el.className = "cardFaceMini" + (disabled ? " disabled" : "");

    if (cardStr === CARD_BIG_JOKER || cardStr === CARD_LITTLE_JOKER){
      el.textContent = (cardStr === CARD_BIG_JOKER) ? "BJ" : "LJ";
      return el;
    }

    const suit = cardStr.slice(-1);
    const rank = cardStr.slice(0, -1);
    el.classList.add(isRedSuit(suit) ? "red" : "black");
    el.textContent = `${rank}${suitSymbol(suit)}`;
    return el;
  }

  // ---------- model ----------
  // 0=AI2, 1=AI3, 2=YOU
  const players = [
    { id:"AI2", hand:[], tricks:0, quota:7 },
    { id:"AI3", hand:[], tricks:0, quota:6 },
    { id:"YOU", hand:[], tricks:0, quota:4 }
  ];

  const leftOf = (i)=> (i+1)%3;
  const rightOf = (i)=> (i+2)%3;

  let phase = "PICK";           // PICK -> DEAL -> TRUMP_PICK -> PLAY
  let dealerIndex = null;

  let trumpSuit = null;
  let trumpOpen = false;

  let trick = [];               // {playerIndex, cardStr}
  let leadSuit = null;
  let trickNumber = 0;
  let turnIndex = 0;

  let engineBusy = false;

  function suitName(s){ return s==="S"?"Spades":s==="H"?"Hearts":s==="D"?"Diamonds":"Clubs"; }

  function setPhase(p){
    phase = p;
    setText(phaseValEl, p);

    // show/hide control panels (NO table overlays)
    pickPanel.style.display = (p === "PICK") ? "block" : "none";
    trumpPanel.style.display = (p === "TRUMP_PICK") ? "block" : "none";
  }

  function setDealer(i){
    dealerIndex = i;
    setText(dealerValEl, i===null ? "(not set)" : players[i].id);
  }

  function applyQuotasForDealer(){
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }

  // ---------- pick dealer ----------
  function parseCard(cs){
    if (cs === CARD_BIG_JOKER) return { kind:"JOKER", value: 1000 };
    if (cs === CARD_LITTLE_JOKER) return { kind:"JOKER", value: 900 };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, -1);
    return { kind:"NORMAL", suit, rank, value: RANK_VALUE[rank] || 0 };
  }

  function pickOneCard(){
    const d = shuffle(makeDeck51());
    let c = d.pop();
    while (c === CARD_BIG_JOKER || c === CARD_LITTLE_JOKER) c = d.pop();
    return c;
  }

  function pickRankValue(cardStr){
    const p = parseCard(cardStr);
    return p.value;
  }

  function clearPickUI(){
    setText(pickStatusEl, "Click Pick.");
    if (pickAI2El) setText(pickAI2El, "(none)");
    if (pickAI3El) setText(pickAI3El, "(none)");
    if (pickYOUEl) setText(pickYOUEl, "(none)");
    pickOkBtn.disabled = true;
    pickReBtn.disabled = true;
    pickBtn.disabled = false;
    setDealer(null);
  }

  function renderPickCard(slotEl, cardStr){
    if (!slotEl) return;
    slotEl.innerHTML = "";
    slotEl.appendChild(makeMiniCard(cardStr, true));
  }

  function doPick(){
    const picks = { ai2: pickOneCard(), ai3: pickOneCard(), you: pickOneCard() };

    renderPickCard(pickAI2El, picks.ai2);
    renderPickCard(pickAI3El, picks.ai3);
    renderPickCard(pickYOUEl, picks.you);

    const vals = [
      { pi:0, v: pickRankValue(picks.ai2) },
      { pi:1, v: pickRankValue(picks.ai3) },
      { pi:2, v: pickRankValue(picks.you) }
    ].sort((a,b)=>a.v-b.v);

    const lowest = vals[0].v;
    const tied = vals.filter(x => x.v === lowest);

    if (tied.length > 1){
      setText(pickStatusEl, "Tie for lowest. Click Re-Pick.");
      pickOkBtn.disabled = true;
      pickReBtn.disabled = false;
      setDealer(null);
      return;
    }

    setDealer(vals[0].pi);
    setText(pickStatusEl, `Dealer will be ${players[dealerIndex].id}. Click OK.`);
    pickOkBtn.disabled = false;
    pickReBtn.disabled = true;
  }

  // ---------- deal ----------
  function resetHandState(){
    trumpSuit = null;
    trumpOpen = false;
    trick = [];
    leadSuit = null;
    trickNumber = 0;
    turnIndex = 0;
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
  function setTrump(s){
    trumpSuit = s;
    trumpOpen = (s === "C"); // your rule
    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not set)");
  }

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
    for (const s of SUITS) if (suitScore[s] > bestS){ bestS = suitScore[s]; best = s; }
    return best;
  }

  // ---------- play rules ----------
  function cardSuitForFollow(cs){
    if (isJoker(cs)) return trumpSuit || null;
    return cs.slice(-1);
  }
  function isTrumpCard(cs){
    if (!trumpSuit) return false;
    if (isJoker(cs)) return true;
    return cs.slice(-1) === trumpSuit;
  }
  function hasNonTrump(pi){
    return players[pi].hand.some(c => !isTrumpCard(c));
  }

  function legalCardsFor(pi){
    const hand = players[pi].hand;

    // Trick 1 leader must lead 2C if they have it
    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)){
      return hand.map((c,i)=>({c,i})).filter(x=>x.c===CARD_OPEN_LEAD).map(x=>x.i);
    }

    // Trump not open: leader cannot lead trump if they have non-trump
    if (trick.length === 0 && !trumpOpen && trumpSuit){
      const nonTrump = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c)).map(x=>x.i);
      if (nonTrump.length) return nonTrump;
      return hand.map((_,i)=>i);
    }

    // Must follow suit if possible
    if (trick.length > 0){
      const suited = hand.map((c,i)=>({c,i})).filter(x=>cardSuitForFollow(x.c)===leadSuit).map(x=>x.i);
      return suited.length ? suited : hand.map((_,i)=>i);
    }

    return hand.map((_,i)=>i);
  }

  function updateTrumpOpen(cardStr){
    if (!trumpOpen && isTrumpCard(cardStr)) trumpOpen = true;
  }

  function cardPower(cardStr){
    if (cardStr === CARD_BIG_JOKER) return 1000000;
    if (cardStr === CARD_LITTLE_JOKER) return 900000;
    const p = parseCard(cardStr);
    if (isTrumpCard(cardStr)) return 10000 + p.value;
    return p.value;
  }

  function evaluateTrickWinner(){
    const anyTrump = trick.some(t => isTrumpCard(t.cardStr));
    if (anyTrump){
      let bestPi = trick[0].playerIndex;
      let bestPow = -1;
      for (const t of trick){
        if (!isTrumpCard(t.cardStr)) continue;
        const pow = cardPower(t.cardStr);
        if (pow > bestPow){ bestPow = pow; bestPi = t.playerIndex; }
      }
      return bestPi;
    }

    let bestPi = trick[0].playerIndex;
    let bestV = -1;
    for (const t of trick){
      if (cardSuitForFollow(t.cardStr) !== leadSuit) continue;
      const v = parseCard(t.cardStr).value;
      if (v > bestV){ bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi;
  }

  function playCard(pi, handIdx){
    const cardStr = players[pi].hand.splice(handIdx, 1)[0];
    if (!cardStr) return;

    if (trick.length === 0) leadSuit = cardSuitForFollow(cardStr);
    trick.push({ playerIndex: pi, cardStr });
    updateTrumpOpen(cardStr);

    turnIndex = (turnIndex + 1) % 3;
    render();
  }

  // AI simple: win if needs, else dump low
  function aiChooseIndex(pi){
    const legal = legalCardsFor(pi);
    const hand = players[pi].hand;
    const need = players[pi].quota - players[pi].tricks;

    if (trick.length === 0){
      // lead high if need, else low
      let best = legal[0], bestScore = -999999;
      for (const idx of legal){
        const c = hand[idx];
        const p = cardPower(c);
        const score = (need > 0) ? p : -p;
        if (score > bestScore){ bestScore = score; best = idx; }
      }
      return best;
    }

    // try to win if need
    let winBest = null, winBestP = -1;
    for (const idx of legal){
      const c = hand[idx];
      const temp = trick.concat([{ playerIndex: pi, cardStr: c }]);

      const anyTrump = temp.some(t=>isTrumpCard(t.cardStr));
      let wouldWin = false;

      if (anyTrump){
        let bestPi = temp[0].playerIndex, bestPow=-1;
        for (const t of temp){
          if (!isTrumpCard(t.cardStr)) continue;
          const pow = cardPower(t.cardStr);
          if (pow > bestPow){ bestPow = pow; bestPi = t.playerIndex; }
        }
        wouldWin = (bestPi === pi);
      } else {
        let bestPi = temp[0].playerIndex, bestV=-1;
        for (const t of temp){
          if (cardSuitForFollow(t.cardStr) !== leadSuit) continue;
          const v = parseCard(t.cardStr).value;
          if (v > bestV){ bestV = v; bestPi = t.playerIndex; }
        }
        wouldWin = (bestPi === pi);
      }

      if (wouldWin){
        const pow = cardPower(c);
        if (pow > winBestP){ winBestP = pow; winBest = idx; }
      }
    }
    if (need > 0 && winBest !== null) return winBest;

    // dump lowest power legal
    let low = legal[0], lowP = 99999999;
    for (const idx of legal){
      const p = cardPower(hand[idx]);
      if (p < lowP){ lowP = p; low = idx; }
    }
    return low;
  }

  // ---------- rendering ----------
  function renderHUD(){
    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not set)");
    setText(dealerValEl, dealerIndex===null ? "(not set)" : players[dealerIndex].id);
    setText(phaseValEl, phase);

    setText(booksSummaryEl, `YOU ${players[2].tricks} • AI2 ${players[0].tricks} • AI3 ${players[1].tricks}`);
  }

  function renderTrick(){
    trickSlotsEl.innerHTML = "";

    if (!trick.length){
      const h = document.createElement("div");
      h.className = "slotHint";
      h.textContent = "(empty)";
      trickSlotsEl.appendChild(h);
      return;
    }

    // Always show 3 labeled slots, fill if played
    const order = [0,1,2];
    for (const pi of order){
      const wrap = document.createElement("div");
      wrap.className = "trickSlotWrap";

      const lab = document.createElement("div");
      lab.className = "trickSlotLabel";
      lab.textContent = players[pi].id;

      const found = trick.find(t => t.playerIndex === pi);
      if (found){
        const mini = document.createElement("div");
        mini.className = "trickMini";
        if (!isJoker(found.cardStr)){
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

  function renderHand(){
    youHandEl.innerHTML = "";

    // sort: jokers first, then by suit letter, then high-to-low (simple + stable)
    const hand = players[2].hand.slice().sort((a,b)=>{
      const aj = (a===CARD_BIG_JOKER)?0:(a===CARD_LITTLE_JOKER)?1:2;
      const bj = (b===CARD_BIG_JOKER)?0:(b===CARD_LITTLE_JOKER)?1:2;
      if (aj !== bj) return aj - bj;
      if (aj < 2) return 0;

      const as = a.slice(-1), bs = b.slice(-1);
      if (as !== bs) return as.localeCompare(bs);

      const ar = a.slice(0,-1), br = b.slice(0,-1);
      return (RANK_VALUE[br]||0) - (RANK_VALUE[ar]||0);
    });

    // map display -> real index (handle duplicates safely)
    const used = new Set();
    function findRealIndex(cardStr){
      for (let i=0;i<players[2].hand.length;i++){
        if (used.has(i)) continue;
        if (players[2].hand[i] === cardStr){
          used.add(i);
          return i;
        }
      }
      return -1;
    }

    const yourTurn = (phase === "PLAY" && turnIndex === 2);
    const legal = yourTurn ? legalCardsFor(2) : [];

    for (const c of hand){
      const realIdx = findRealIndex(c);
      const disabled = !yourTurn || !legal.includes(realIdx);

      const cardEl = makeMiniCard(c, disabled);

      cardEl.addEventListener("pointerdown", (e)=>{
        e.preventDefault();
        if (disabled) return;
        playCard(2, realIdx);
        engineKick();
      }, { passive:false });

      youHandEl.appendChild(cardEl);
    }
  }

  function render(){
    renderHUD();
    renderTrick();
    renderHand();
  }

  // ---------- phase transitions ----------
  function toDeal(){
    setPhase("DEAL");
    msg("Dealing...");
    dealHand();
    render();

    // short pause then trump pick
    setTimeout(()=>toTrumpPick(), 180);
  }

  function toTrumpPick(){
    setPhase("TRUMP_PICK");
    render();

    const caller = dealerIndex;

    if (caller !== 2){
      const suit = chooseTrumpFromOwnHand(caller);
      setTrump(suit);
      setText(trumpStatusEl, `${players[caller].id} selected trump: ${suitName(suit)}.`);
      msg(`${players[caller].id} selected trump: ${suitName(suit)}.`);
      setTimeout(()=>toPlay(), 220);
      return;
    }

    setText(trumpStatusEl, "You are dealer. Choose trump.");
    msg("You are dealer. Choose trump.");
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
    turnIndex = whoHas2C;

    msg("Play begins.");
    render();
    engineKick();
  }

  // ---------- engine ----------
  function resolveTrick(){
    const winner = evaluateTrickWinner();
    players[winner].tricks += 1;

    msg(`${players[winner].id} wins the trick.`);
    render();

    setTimeout(()=>{
      trick = [];
      leadSuit = null;
      turnIndex = winner;
      trickNumber += 1;

      // end of hand
      if (players.every(p => p.hand.length === 0)){
        msg("Hand complete. (Next: we’ll add plucks + next deal.)");
        setPhase("DEAL"); // placeholder visual; no auto-next yet
        render();
        engineBusy = false;
        return;
      }

      render();
      engineBusy = false;
      engineKick();
    }, BETWEEN_TRICKS);
  }

  function engineStep(){
    if (engineBusy) return;
    engineBusy = true;

    try{
      if (phase !== "PLAY"){ engineBusy = false; return; }

      if (trick.length === 3){
        setTimeout(()=>resolveTrick(), RESOLVE_DELAY);
        return;
      }

      if (turnIndex !== 2){
        const pi = turnIndex;
        setTimeout(()=>{
          if (phase !== "PLAY"){ engineBusy = false; return; }
          const idx = aiChooseIndex(pi);
          playCard(pi, idx);
          engineBusy = false;
          engineKick();
        }, AI_DELAY);
        return;
      }

      // your turn
      engineBusy = false;
    } catch(e){
      engineBusy = false;
      console.error("[Pluck Demo2] Engine crashed:", e);
      msg("ERROR: Engine crashed: " + (e?.message || e));
    }
  }

  function engineKick(){
    setTimeout(engineStep, 0);
  }

  // ---------- events ----------
  resetBtn.addEventListener("click", ()=>{
    // Hard reset to PICK
    trumpSuit = null;
    trumpOpen = false;
    setTrump(null);

    setDealer(null);
    players.forEach(p => { p.hand=[]; p.tricks=0; });

    trick = [];
    leadSuit = null;
    trickNumber = 0;
    turnIndex = 0;

    clearPickUI();
    setPhase("PICK");
    msg("Reset. Pick first to begin.");
    render();
  });

  pickBtn.addEventListener("click", ()=>{
    setPhase("PICK");
    doPick();
    render();
  });

  pickReBtn.addEventListener("click", ()=>{
    doPick();
    render();
  });

  pickOkBtn.addEventListener("click", ()=>{
    if (dealerIndex === null){
      setText(pickStatusEl, "No dealer set. Pick again.");
      return;
    }
    applyQuotasForDealer();
    pickOkBtn.disabled = true;
    pickReBtn.disabled = true;
    pickBtn.disabled = true;

    msg(`Dealer set to ${players[dealerIndex].id}. Starting deal...`);
    render();
    toDeal();
  });

  // Trump buttons (only when YOU is dealer)
  trumpPanel.querySelectorAll("button[data-trump]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      if (phase !== "TRUMP_PICK") return;
      if (dealerIndex !== 2) return; // only YOU clicks if YOU is dealer
      if (trumpSuit) return;

      const s = btn.getAttribute("data-trump");
      if (!SUITS.includes(s)) return;

      setTrump(s);
      setText(trumpStatusEl, `Trump set: ${suitName(s)}.`);
      msg(`You selected trump: ${suitName(s)}.`);
      setTimeout(()=>toPlay(), 180);
    });
  });

  // ---------- boot ----------
  function setTrumpNullable(s){
    trumpSuit = s;
    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not set)");
  }
  // keep API style
  function setTrump(s){
    if (!s){ setTrumpNullable(null); return; }
    setTrumpNullable(s);
    trumpOpen = (s === "C");
  }

  clearPickUI();
  setPhase("PICK");
  msg("Pick first to begin.");
  render();

})();
