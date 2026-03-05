// Pluck Demo 2 Engine (FULL REPLACEMENT)
// Hard-locked UI: uses existing Demo2 layout, adds overlays only.
// Sequence: PICK -> HIDE PICK -> DEAL -> TRUMP (dealer calls) -> PLAY
// Goal: functional + stable, no freezes.

(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const setText = (el, txt) => { if (el) el.textContent = txt; };
  const show = (el) => { if (el) el.classList.add("show"); };
  const hide = (el) => { if (el) el.classList.remove("show"); };

  function suitName(s) { return s==="S"?"Spades":s==="H"?"Hearts":s==="D"?"Diamonds":"Clubs"; }
  function suitSymbol(s){ return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣"; }
  function isRedSuit(s){ return s==="H" || s==="D"; }

  // ---------- DOM (required) ----------
  const youHandEl = $("youHand");
  const trickSlotsEl = $("trickSlots");
  const resetBtn = $("resetBtn");

  const trumpLabelEl = $("trumpLabel");
  const booksSummaryEl = $("booksSummary");
  const phaseLabelEl = $("phaseLabel");
  const dealerLabelEl = $("dealerLabel");

  // overlays
  const pickOverlay = $("pickOverlay");
  const pickBtn = $("pickBtn");
  const repickBtn = $("repickBtn");
  const okBtn = $("okBtn");
  const pickStatusEl = $("pickStatus");
  const pickAI2El = $("pickAI2");
  const pickAI3El = $("pickAI3");
  const pickYOUEl = $("pickYOU");
  const pickDealerEl = $("pickDealer");

  const trumpOverlay = $("trumpOverlay");
  const trumpStatusEl = $("trumpStatus");
  const trumpPickValEl = $("trumpPickVal");

  if (!youHandEl || !trickSlotsEl || !resetBtn || !trumpLabelEl || !booksSummaryEl || !phaseLabelEl || !dealerLabelEl) {
    console.error("[Pluck Demo2]", "Missing required DOM. Check demo2.html ids.");
    return;
  }

  // ---------- constants ----------
  const SUITS = ["S","H","D","C"];
  const BRBR = ["S","H","C","D"]; // black-red-black-red baseline
  const TOTAL_TRICKS = 17;

  // 51 card deck: 3-A of each suit (48) + 2C + BJ + LJ
  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

  // timings
  const AI_DELAY = 260;
  const RESOLVE_DELAY = 280;
  const BETWEEN_TRICKS = 240;

  // ---------- state ----------
  const players = [
    { id:"AI2", hand:[], tricks:0, quota:7 },
    { id:"AI3", hand:[], tricks:0, quota:6 },
    { id:"YOU", hand:[], tricks:0, quota:4 }
  ];

  function leftOf(i){ return (i+1)%3; }
  function rightOf(i){ return (i+2)%3; }

  let phase = "PICK";      // PICK -> DEAL -> TRUMP -> PLAY
  let dealerIndex = null;

  let trumpSuit = null;
  let trumpOpen = false;

  let trick = [];          // {pi, card}
  let leadSuit = null;
  let trickNumber = 0;
  let turnIndex = 0;

  let engineBusy = false;

  // ---------- deck ----------
  function makeDeck51(){
    const deck = [];
    for (const s of SUITS) for (const r of RANKS_NO_2) deck.push(r+s);
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

  function parseCard(cs){
    if (cs === CARD_BIG_JOKER) return { kind:"JOKER", rank:"BJ", suit:null, value: 1000 };
    if (cs === CARD_LITTLE_JOKER) return { kind:"JOKER", rank:"LJ", suit:null, value: 900 };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    return { kind:"NORMAL", rank, suit, value: RANK_VALUE[rank] || 0 };
  }
  function isJoker(cs){ return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }

  function cardSuitForFollow(cs){
    if (isJoker(cs)) return trumpSuit || null; // jokers treated as trump suit for following
    return cs.slice(-1);
  }
  function isTrumpCard(cs){
    if (!trumpSuit) return false;
    if (isJoker(cs)) return true;
    return cs.slice(-1) === trumpSuit;
  }

  // ---------- UI card face (mini) ----------
  function makeMiniFace(card){
    const el = document.createElement("div");
    el.className = "cardFaceMini";

    if (card === CARD_BIG_JOKER || card === CARD_LITTLE_JOKER){
      el.textContent = card;
      return el;
    }

    const suit = card.slice(-1);
    const rank = card.slice(0, -1);
    el.classList.add(isRedSuit(suit) ? "red" : "black");
    el.textContent = rank + suitSymbol(suit);
    return el;
  }

  // ---------- sorting (jokers first, trump suit first, then BRBR) ----------
  function suitOrderForHand(){
    if (trumpSuit) return [trumpSuit, ...BRBR.filter(s => s !== trumpSuit)];
    return BRBR.slice();
  }

  function sortHand(hand){
    const suitOrder = suitOrderForHand();
    const rankOrder = { "A":14,"K":13,"Q":12,"J":11,"10":10,"9":9,"8":8,"7":7,"6":6,"5":5,"4":4,"3":3,"2":2 };

    function suitGroup(s){
      const i = suitOrder.indexOf(s);
      return i < 0 ? 99 : i;
    }

    function key(cs){
      if (cs === CARD_BIG_JOKER) return { a:0, b:0, c:0 };
      if (cs === CARD_LITTLE_JOKER) return { a:0, b:1, c:0 };
      const suit = cs.slice(-1);
      const rank = cs.slice(0, -1);
      return { a: 1 + suitGroup(suit), b: 0, c: (100 - (rankOrder[rank] ?? 0)) }; // high->low
    }

    return hand.slice().sort((x,y)=>{
      const a = key(x), b = key(y);
      if (a.a !== b.a) return a.a - b.a;
      if (a.b !== b.b) return a.b - b.b;
      return a.c - b.c;
    });
  }

  // ---------- HUD render ----------
  function setPhase(p){
    phase = p;
    setText(phaseLabelEl, p);
  }

  function renderHud(){
    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not set)");
    trumpLabelEl.classList.toggle("muted", !trumpSuit);

    setText(dealerLabelEl, dealerIndex === null ? "(not set)" : players[dealerIndex].id);
    dealerLabelEl.classList.toggle("muted", dealerIndex === null);

    setText(booksSummaryEl, `YOU ${players[2].tricks} • AI2 ${players[0].tricks} • AI3 ${players[1].tricks}`);
  }

  // ---------- trick render ----------
  function renderTrick(){
    trickSlotsEl.innerHTML = "";
    if (!trick.length){
      const hint = document.createElement("div");
      hint.className = "slotHint";
      hint.textContent = "(empty)";
      trickSlotsEl.appendChild(hint);
      return;
    }

    for (const t of trick){
      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.alignItems = "center";
      wrap.style.gap = "6px";

      const who = document.createElement("div");
      who.className = "slotHint";
      who.style.fontWeight = "900";
      who.style.opacity = "0.9";
      who.textContent = players[t.pi].id;

      const face = makeMiniFace(t.card);
      face.style.width = "64px";
      face.style.height = "90px";
      face.style.borderRadius = "14px";

      wrap.appendChild(who);
      wrap.appendChild(face);
      trickSlotsEl.appendChild(wrap);
    }
  }

  // ---------- hand render (click to play) ----------
  function renderHand(){
    youHandEl.innerHTML = "";

    const display = sortHand(players[2].hand);
    youHandEl.classList.toggle("tight", display.length >= 14);

    const playable = (phase === "PLAY" && turnIndex === 2);
    const legalIdx = playable ? legalCardsFor(2) : [];

    for (const card of display){
      // find real index in actual hand
      const realIdx = players[2].hand.indexOf(card);

      const face = makeMiniFace(card);
      face.style.cursor = playable ? "pointer" : "default";
      face.style.opacity = (playable && legalIdx.includes(realIdx)) ? "1" : (playable ? "0.45" : "1");

      face.addEventListener("click", () => {
        if (!playable) return;
        const legalNow = legalCardsFor(2);
        if (!legalNow.includes(realIdx)) return;

        playCard(2, realIdx);
        engineKick();
      });

      youHandEl.appendChild(face);
    }
  }

  function renderAll(){
    renderHud();
    renderTrick();
    renderHand();
  }

  // ---------- PICK FIRST ----------
  function pickOneNonJoker(){
    const d = shuffle(makeDeck51());
    let c = d.pop();
    while (c === CARD_BIG_JOKER || c === CARD_LITTLE_JOKER) c = d.pop();
    return c;
  }

  function pickRankValue(cardStr){
    const p = parseCard(cardStr);
    // jokers excluded already; 2 is lowest
    if (p.rank === "2") return 2;
    return p.value;
  }

  function clearPickUI(){
    if (pickAI2El) pickAI2El.textContent = "(none)";
    if (pickAI3El) pickAI3El.textContent = "(none)";
    if (pickYOUEl) pickYOUEl.textContent = "(none)";
    setText(pickStatusEl, "Click Pick.");
    setText(pickDealerEl, "(not set)");
    repickBtn.disabled = true;
    okBtn.disabled = true;
  }

  function doPick(){
    const picks = {
      ai2: pickOneNonJoker(),
      ai3: pickOneNonJoker(),
      you: pickOneNonJoker()
    };

    pickAI2El.innerHTML = "";
    pickAI2El.appendChild(makeMiniFace(picks.ai2));

    pickAI3El.innerHTML = "";
    pickAI3El.appendChild(makeMiniFace(picks.ai3));

    pickYOUEl.innerHTML = "";
    pickYOUEl.appendChild(makeMiniFace(picks.you));

    const vals = [
      { pi:0, v: pickRankValue(picks.ai2) },
      { pi:1, v: pickRankValue(picks.ai3) },
      { pi:2, v: pickRankValue(picks.you) }
    ].sort((a,b)=>a.v-b.v);

    const lowest = vals[0].v;
    const tied = vals.filter(x => x.v === lowest);

    if (tied.length > 1){
      dealerIndex = null;
      setText(pickDealerEl, "(not set)");
      setText(pickStatusEl, "Tie for lowest. Click Re-Pick.");
      repickBtn.disabled = false;
      okBtn.disabled = true;
      renderHud();
      return;
    }

    dealerIndex = vals[0].pi;
    setText(pickDealerEl, players[dealerIndex].id);
    setText(pickStatusEl, `Dealer will be ${players[dealerIndex].id}. Click OK (Start).`);
    repickBtn.disabled = true;
    okBtn.disabled = false;
    renderHud();
  }

  function showPick(){
    setPhase("PICK");
    clearPickUI();
    show(pickOverlay);
    hide(trumpOverlay);
    renderAll();
  }

  function hidePick(){
    hide(pickOverlay);
  }

  // ---------- DEAL ----------
  function applyQuotasForDealer(){
    // Dealer=7, left=6, right=4 (as you’ve been using)
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }

  function resetHandState(){
    players.forEach(p => { p.hand = []; p.tricks = 0; });
    trick = [];
    leadSuit = null;
    trickNumber = 0;
    turnIndex = 0;

    trumpSuit = null;
    trumpOpen = false;
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

  function toDeal(){
    setPhase("DEAL");
    hidePick();
    hide(trumpOverlay);

    dealHand();
    renderAll();

    // Immediately go to trump call (dealer calls trump)
    setTimeout(() => {
      toTrumpCall();
    }, 120);
  }

  // ---------- TRUMP CALL ----------
  function chooseTrumpFromHand(pi){
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
    setText(trumpPickValEl, `${trumpSuit} (${suitName(trumpSuit)})`);
    renderHud();
  }

  function toTrumpCall(){
    setPhase("TRUMP");

    // if AI dealer, auto-pick and continue
    if (dealerIndex !== 2){
      const suit = chooseTrumpFromHand(dealerIndex);
      setTrump(suit);
      hide(trumpOverlay);
      setTimeout(() => {
        toPlay();
        engineKick();
      }, 140);
      renderAll();
      return;
    }

    // YOU are dealer: show overlay buttons
    setText(trumpStatusEl, "You are dealer. Pick trump. (Clubs starts open; otherwise opens when first trump is played.)");
    setText(trumpPickValEl, "(not set)");
    show(trumpOverlay);
    renderAll();
  }

  // wire trump buttons
  function wireTrumpButtons(){
    const btns = trumpOverlay.querySelectorAll("button[data-trump]");
    btns.forEach(b => {
      b.addEventListener("click", () => {
        if (phase !== "TRUMP") return;
        if (dealerIndex !== 2) return;

        const s = (b.getAttribute("data-trump") || "").toUpperCase();
        if (!SUITS.includes(s)) return;

        setTrump(s);
        hide(trumpOverlay);

        // continue to play
        setTimeout(() => {
          toPlay();
          engineKick();
        }, 120);
      });
    });
  }

  // ---------- PLAY rules ----------
  function hasNonTrump(pi){
    return players[pi].hand.some(c => !isTrumpCard(c));
  }

  function legalCardsFor(pi){
    const hand = players[pi].hand;

    // Trick 1 lead must be 2C if player has it
    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)){
      return hand.map((c,i)=>({c,i})).filter(x=>x.c===CARD_OPEN_LEAD).map(x=>x.i);
    }

    // Leading: if trump is closed, you cannot lead trump unless you have no non-trump
    if (trick.length === 0 && !trumpOpen && trumpSuit){
      const nonTrumpIdx = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c)).map(x=>x.i);
      if (nonTrumpIdx.length) return nonTrumpIdx;
      return hand.map((_,i)=>i);
    }

    // Following suit if possible
    if (trick.length > 0){
      const suited = hand.map((c,i)=>({c,i})).filter(x=>cardSuitForFollow(x.c)===leadSuit).map(x=>x.i);
      return suited.length ? suited : hand.map((_,i)=>i);
    }

    return hand.map((_,i)=>i);
  }

  function setLeadSuitFromFirst(cardStr){
    leadSuit = cardSuitForFollow(cardStr);
  }

  function updateTrumpOpen(cardStr){
    if (!trumpOpen && isTrumpCard(cardStr)) trumpOpen = true;
  }

  function cardPower(cardStr){
    if (cardStr === CARD_BIG_JOKER) return 1000000;
    if (cardStr === CARD_LITTLE_JOKER) return 900000;
    const c = parseCard(cardStr);
    if (isTrumpCard(cardStr)) return 10000 + c.value;
    return c.value;
  }

  function evaluateTrickWinner(){
    const anyTrump = trick.some(t => isTrumpCard(t.card));
    if (anyTrump){
      let bestPi = trick[0].pi;
      let bestP = -1;
      for (const t of trick){
        if (!isTrumpCard(t.card)) continue;
        const p = cardPower(t.card);
        if (p > bestP){ bestP = p; bestPi = t.pi; }
      }
      return bestPi;
    }

    let bestPi = trick[0].pi;
    let bestV = -1;
    for (const t of trick){
      if (cardSuitForFollow(t.card) !== leadSuit) continue;
      const v = parseCard(t.card).value;
      if (v > bestV){ bestV = v; bestPi = t.pi; }
    }
    return bestPi;
  }

  function playCard(pi, handIdx){
    const cardStr = players[pi].hand.splice(handIdx, 1)[0];
    if (!cardStr) return;

    if (trick.length === 0) setLeadSuitFromFirst(cardStr);
    trick.push({ pi, card: cardStr });
    updateTrumpOpen(cardStr);

    turnIndex = (turnIndex + 1) % 3;
    renderAll();
  }

  function aiChooseIndex(pi){
    const legal = legalCardsFor(pi);
    const hand = players[pi].hand;
    const need = players[pi].quota - players[pi].tricks;

    if (trick.length === 0){
      // lead high if need, else lead low
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
      const temp = trick.concat([{ pi, card: c }]);

      const anyTrump = temp.some(t => isTrumpCard(t.card));
      let wouldWin = false;

      if (anyTrump){
        let bestPi = temp[0].pi, bestP=-1;
        for (const t of temp){
          if (!isTrumpCard(t.card)) continue;
          const pow = cardPower(t.card);
          if (pow > bestP){ bestP = pow; bestPi = t.pi; }
        }
        wouldWin = (bestPi === pi);
      } else {
        let bestPi = temp[0].pi, bestV=-1;
        for (const t of temp){
          if (cardSuitForFollow(t.card) !== leadSuit) continue;
          const v = parseCard(t.card).value;
          if (v > bestV){ bestV = v; bestPi = t.pi; }
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

  function toPlay(){
    setPhase("PLAY");
    trick = [];
    leadSuit = null;
    trickNumber = 1;

    // Trick 1 leader is whoever has 2C
    let whoHas2C = 0;
    for (let pi=0;pi<3;pi++){
      if (players[pi].hand.includes(CARD_OPEN_LEAD)){ whoHas2C = pi; break; }
    }
    turnIndex = whoHas2C;

    renderAll();
  }

  function resolveTrick(){
    const winner = evaluateTrickWinner();
    players[winner].tricks += 1;

    renderAll();

    setTimeout(() => {
      trick = [];
      leadSuit = null;
      turnIndex = winner;
      trickNumber += 1;

      // end of hand
      if (players.every(p => p.hand.length === 0)){
        // rotate dealer right for next deal
        dealerIndex = rightOf(dealerIndex);
        trumpSuit = null;
        trumpOpen = false;

        setTimeout(() => {
          // new deal starts immediately (no pluck here in demo2)
          toDeal();
          engineKick();
        }, 220);
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

      // your turn: wait for click
      engineBusy = false;
    } catch (e){
      engineBusy = false;
      console.error("[Pluck Demo2] Engine crashed:", e);
    }
  }

  function engineKick(){
    setTimeout(engineStep, 0);
  }

  // ---------- events ----------
  resetBtn.addEventListener("click", () => {
    // full reset: back to PICK overlay
    dealerIndex = null;
    trumpSuit = null;
    trumpOpen = false;
    resetHandState();
    clearPickUI();

    // clear trick UI
    trickSlotsEl.innerHTML = '<div class="slotHint">(empty)</div>';

    showPick();
  });

  pickBtn.addEventListener("click", () => {
    if (phase !== "PICK") setPhase("PICK");
    doPick();
  });

  repickBtn.addEventListener("click", () => {
    doPick();
  });

  okBtn.addEventListener("click", () => {
    if (dealerIndex === null) return;
    hidePick();
    toDeal();
    engineKick();
  });

  // ---------- boot ----------
  wireTrumpButtons();
  showPick();
})();
