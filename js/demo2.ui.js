// demo2.js (FULL REPLACEMENT)
// Sequence: PICK dealer -> hide pick -> DEAL -> dealer calls TRUMP -> PLAY
// Demo2 UI locked: no AI card backs. Only YOU hand visible.
// Rules supported:
// - 51-card deck: 3-A all suits (48) + 2C opener + BJ + LJ
// - 17 tricks
// - Trick 1 leader = whoever holds 2C (must lead it)
// - Trump: if Clubs is trump, trump starts OPEN. Else opens when first trump is played.
// - No-trump lead restriction: if trump not open, you may NOT lead trump if you have any non-trump cards.
// - Must follow suit if possible.
// - Winner of trick leads next.
// - Books: counts tricks won per player (simple).

(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const setText = (el, txt) => { if (el) el.textContent = txt; };
  const show = (el) => { if (el) el.style.display = ""; };
  const hide = (el) => { if (el) el.style.display = "none"; };

  function clampInt(n, fallback = 0) {
    const x = Number(n);
    return Number.isFinite(x) ? Math.trunc(x) : fallback;
  }

  // ---------- DOM ----------
  const trumpLabelEl = $("trumpLabel");
  const booksSummaryEl = $("booksSummary");
  const phaseValEl = $("phaseVal");
  const dealerValEl = $("dealerVal");
  const resetBtn = $("resetBtn");

  const trickSlotsEl = $("trickSlots");
  const youHandEl = $("youHand");

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

  if (!resetBtn || !trickSlotsEl || !youHandEl || !pickOverlayEl || !trumpOverlayEl) {
    console.error("Demo2 missing required DOM.");
    return;
  }

  // ---------- constants ----------
  const TOTAL_TRICKS = 17;
  const SUITS = ["S","H","D","C"];
  const BRBR = ["S","H","C","D"]; // display sorting order baseline

  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  const CARD_OPEN_LEAD = "2C";
  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";

  // timing
  const AI_DELAY = 260;
  const RESOLVE_DELAY = 260;
  const BETWEEN_TRICKS = 240;

  // ---------- card utils ----------
  function suitName(s) { return s==="S"?"Spades":s==="H"?"Hearts":s==="D"?"Diamonds":"Clubs"; }
  function suitSymbol(s){ return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣"; }
  function isRedSuit(s){ return s==="H" || s==="D"; }
  function isJoker(cs){ return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }

  function parseCard(cs) {
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

  function cardSuitForFollow(cs, trumpSuit){
    if (isJoker(cs)) return trumpSuit || null; // jokers behave as trump for follow logic
    return cs.slice(-1);
  }

  function isTrumpCard(cs, trumpSuit){
    if (!trumpSuit) return false;
    if (isJoker(cs)) return true;
    return cs.slice(-1) === trumpSuit;
  }

  function cardPower(cs, trumpSuit){
    if (cs === CARD_BIG_JOKER) return 1000000;
    if (cs === CARD_LITTLE_JOKER) return 900000;
    const c = parseCard(cs);
    if (isTrumpCard(cs, trumpSuit)) return 10000 + c.value;
    return c.value;
  }

  // ---------- mini card face (demo2) ----------
  function makeMiniFace(cardStr, disabled=false){
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cardFaceMini";
    el.disabled = !!disabled;

    if (cardStr === CARD_BIG_JOKER || cardStr === CARD_LITTLE_JOKER) {
      el.textContent = "🃏";
      el.title = (cardStr === CARD_BIG_JOKER ? "BIG JOKER" : "LITTLE JOKER");
      return el;
    }

    const suit = cardStr.slice(-1);
    const rank = cardStr.slice(0, -1);
    el.classList.add(isRedSuit(suit) ? "red" : "black");
    el.textContent = rank + suitSymbol(suit);
    el.title = rank + " of " + suitName(suit);
    return el;
  }

  // ---------- pick card face (small display) ----------
  function makePickFace(cardStr){
    const el = document.createElement("div");
    el.className = "pickFace";

    if (cardStr === CARD_BIG_JOKER || cardStr === CARD_LITTLE_JOKER) {
      el.textContent = cardStr;
      return el;
    }
    const suit = cardStr.slice(-1);
    const rank = cardStr.slice(0,-1);
    el.classList.add(isRedSuit(suit) ? "red" : "black");
    el.textContent = rank + suitSymbol(suit);
    return el;
  }

  // ---------- model ----------
  // 0=AI2, 1=AI3, 2=YOU
  const players = [
    { id:"AI2", hand:[], tricks:0 },
    { id:"AI3", hand:[], tricks:0 },
    { id:"YOU", hand:[], tricks:0 }
  ];

  function leftOf(i){ return (i+1)%3; }
  function rightOf(i){ return (i+2)%3; }

  let phase = "PICK";        // PICK -> DEAL -> TRUMP -> PLAY
  let dealerIndex = null;    // 0/1/2

  let trumpSuit = null;
  let trumpOpen = false;

  let trick = [];            // {pi, card}
  let leadSuit = null;
  let trickNumber = 0;
  let turnIndex = 0;

  // engine lock
  let engineBusy = false;

  // ---------- UI updates ----------
  function setPhase(p){
    phase = p;
    setText(phaseValEl, p);
  }

  function setDealer(piOrNull){
    dealerIndex = (piOrNull === null ? null : clampInt(piOrNull, null));
    const txt = (dealerIndex === null) ? "(not set)" : players[dealerIndex].id;
    setText(dealerValEl, txt);
    dealerValEl?.classList.toggle("muted", dealerIndex === null);
  }

  function setTrump(suit){
    trumpSuit = suit;
    trumpOpen = (trumpSuit === "C"); // your rule
    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not set)");
    trumpLabelEl?.classList.toggle("muted", !trumpSuit);
  }

  function updateBooks(){
    setText(booksSummaryEl, `YOU ${players[2].tricks} • AI2 ${players[0].tricks} • AI3 ${players[1].tricks}`);
  }

  function clearTrickUI(){
    trickSlotsEl.innerHTML = '<div class="slotHint">(empty)</div>';
  }

  function renderTrick(){
    if (!trick.length) { clearTrickUI(); return; }

    trickSlotsEl.innerHTML = "";
    // order seats left, center, right visually: AI2, YOU, AI3
    const seatOrder = [0,2,1];
    for (const pi of seatOrder){
      const played = trick.find(t => t.pi === pi);
      if (!played) continue;

      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.alignItems = "center";
      wrap.style.gap = "8px";

      const lab = document.createElement("div");
      lab.className = "slotHint";
      lab.style.fontWeight = "900";
      lab.style.opacity = ".9";
      lab.textContent = players[pi].id;

      const face = makeMiniFace(played.card, true);
      face.style.width = "60px";
      face.style.height = "84px";
      face.style.borderRadius = "14px";

      wrap.appendChild(lab);
      wrap.appendChild(face);
      trickSlotsEl.appendChild(wrap);
    }
  }

  function suitOrderForHand(){
    if (trumpSuit) return [trumpSuit, ...BRBR.filter(s => s !== trumpSuit)];
    return BRBR.slice();
  }

  function sortHandForDisplay(hand){
    const suitOrder = suitOrderForHand();
    const rankOrder = { "A":14,"K":13,"Q":12,"J":11,"10":10,"9":9,"8":8,"7":7,"6":6,"5":5,"4":4,"3":3,"2":2 };
    const suitIndex = s => {
      const i = suitOrder.indexOf(s);
      return i < 0 ? 99 : i;
    };

    function key(cs){
      if (cs === CARD_BIG_JOKER) return { a:0, b:0, c:0 };
      if (cs === CARD_LITTLE_JOKER) return { a:0, b:1, c:0 };
      const suit = cs.slice(-1);
      const rank = cs.slice(0,-1);
      return { a: 1 + suitIndex(suit), b: 0, c: (100 - (rankOrder[rank] ?? 0)) };
    }

    return hand.slice().sort((x,y)=>{
      const a = key(x), b = key(y);
      if (a.a !== b.a) return a.a - b.a;
      if (a.b !== b.b) return a.b - b.b;
      return a.c - b.c;
    });
  }

  function renderHand(){
    youHandEl.innerHTML = "";
    const display = sortHandForDisplay(players[2].hand);

    // compute legal indexes if your turn
    const legalIdx = (phase === "PLAY" && turnIndex === 2) ? legalCardsFor(2) : [];

    // spacer to guarantee first/last cards fully visible (CSS also adds this)
    for (let k=0;k<display.length;k++){
      const cardStr = display[k];
      const realIdx = players[2].hand.indexOf(cardStr);
      const playableNow = (phase === "PLAY" && turnIndex === 2);
      const disabled = !playableNow || !legalIdx.includes(realIdx);

      const btn = makeMiniFace(cardStr, disabled);

      btn.addEventListener("click", () => {
        if (disabled) return;
        if (!(phase === "PLAY" && turnIndex === 2)) return;

        const legalNow = legalCardsFor(2);
        if (!legalNow.includes(realIdx)) return;

        playCard(2, realIdx);
        engineKick();
      });

      youHandEl.appendChild(btn);
    }
  }

  function renderAll(){
    updateBooks();
    renderTrick();
    renderHand();
  }

  // ---------- pick dealer ----------
  function pickOneCardNoJokers(){
    const d = shuffle(makeDeck51());
    let c = d.pop();
    while (c === CARD_BIG_JOKER || c === CARD_LITTLE_JOKER) c = d.pop();
    return c;
  }

  function pickRankValue(cardStr){
    const p = parseCard(cardStr);
    // treat Ace high, 2 low (and 2 exists only as 2C here)
    if (p.kind === "JOKER") return 99;
    if (p.rank === "2") return 2;
    return p.value;
  }

  function clearPickUI(){
    pickAI2El.textContent = "(none)";
    pickAI3El.textContent = "(none)";
    pickYOUEl.textContent = "(none)";
    setText(pickStatusEl, "Click Pick.");
    pickOkBtn.disabled = true;
    pickReBtn.disabled = true;
    pickBtn.disabled = false;
    setDealer(null);
  }

  function doPick(){
    const picks = {
      ai2: pickOneCardNoJokers(),
      ai3: pickOneCardNoJokers(),
      you: pickOneCardNoJokers()
    };

    pickAI2El.innerHTML = ""; pickAI2El.appendChild(makePickFace(picks.ai2));
    pickAI3El.innerHTML = ""; pickAI3El.appendChild(makePickFace(picks.ai3));
    pickYOUEl.innerHTML = ""; pickYOUEl.appendChild(makePickFace(picks.you));

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

  function hidePickOverlay(){
    // keep UI locked: overlay disappears, table stays clean
    hide(pickOverlayEl);
  }

  // ---------- dealing ----------
  function resetRoundState(){
    players.forEach(p => { p.hand = []; p.tricks = 0; });
    trick = [];
    leadSuit = null;
    trickNumber = 0;
    turnIndex = 0;
    setTrump(null);
    trumpOpen = false;
    clearTrickUI();
    updateBooks();
  }

  function dealHand(){
    resetRoundState();

    const deck = shuffle(makeDeck51());
    for (let i=0;i<TOTAL_TRICKS;i++){
      players[0].hand.push(deck.pop());
      players[1].hand.push(deck.pop());
      players[2].hand.push(deck.pop());
    }
  }

  // ---------- trump selection ----------
  function chooseTrumpFromOwnHand(pi){
    // simple suit scoring (same style as your engine)
    const suitScore = { S:0, H:0, D:0, C:0 };
    for (const c of players[pi].hand){
      if (isJoker(c)){ SUITS.forEach(s => suitScore[s] += 6); continue; }
      const suit = c.slice(-1);
      const rank = c.slice(0,-1);
      const v = RANK_VALUE[rank] || 0;
      suitScore[suit] += 2;
      if (v >= 11) suitScore[suit] += (v-10) * 2;
      else suitScore[suit] += Math.max(0, v-6) * 0.5;
    }
    let best = "H", bestS = -999;
    for (const s of SUITS){
      if (suitScore[s] > bestS){ bestS = suitScore[s]; best = s; }
    }
    return best;
  }

  function showTrumpOverlay(){
    show(trumpOverlayEl);
    trumpOverlayEl.setAttribute("aria-hidden", "false");
  }

  function hideTrumpOverlay(){
    hide(trumpOverlayEl);
    trumpOverlayEl.setAttribute("aria-hidden", "true");
  }

  function startTrumpPick(){
    setPhase("TRUMP");
    showTrumpOverlay();

    if (dealerIndex !== 2){
      const suit = chooseTrumpFromOwnHand(dealerIndex);
      setTrump(suit);
      setText(trumpStatusEl, `${players[dealerIndex].id} selected trump: ${suitName(suit)}.`);
      setTimeout(() => {
        hideTrumpOverlay();
        startPlay();
        engineKick();
      }, 450);
      return;
    }

    setText(trumpStatusEl, "You are dealer. Select trump.");
  }

  function wireTrumpButtons(){
    trumpOverlayEl.querySelectorAll("button[data-trump]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (phase !== "TRUMP") return;
        if (dealerIndex !== 2) return; // only YOU chooses by click
        if (trumpSuit) return;

        const suit = btn.getAttribute("data-trump");
        if (!SUITS.includes(suit)) return;

        setTrump(suit);
        setText(trumpStatusEl, `You selected trump: ${suitName(suit)}.`);
        setTimeout(() => {
          hideTrumpOverlay();
          startPlay();
          engineKick();
        }, 250);
      });
    });
  }

  // ---------- play rules ----------
  function hasNonTrump(pi){
    return players[pi].hand.some(c => !isTrumpCard(c, trumpSuit));
  }

  function legalCardsFor(pi){
    const hand = players[pi].hand;

    // Trick 1 lead must be 2C if you have it and you are leading
    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)){
      return hand.map((c,i)=>({c,i})).filter(x=>x.c===CARD_OPEN_LEAD).map(x=>x.i);
    }

    // leading: if trump not open, can't lead trump when you have any non-trump
    if (trick.length === 0 && trumpSuit && !trumpOpen){
      const nonTrumpIdx = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c, trumpSuit)).map(x=>x.i);
      if (nonTrumpIdx.length) return nonTrumpIdx;
      return hand.map((_,i)=>i);
    }

    // must follow suit
    if (trick.length > 0){
      const suited = hand.map((c,i)=>({c,i})).filter(x=>cardSuitForFollow(x.c, trumpSuit)===leadSuit).map(x=>x.i);
      return suited.length ? suited : hand.map((_,i)=>i);
    }

    return hand.map((_,i)=>i);
  }

  function setLeadSuitFromFirst(cardStr){
    leadSuit = cardSuitForFollow(cardStr, trumpSuit);
  }

  function updateTrumpOpenOnPlay(cardStr){
    if (!trumpOpen && isTrumpCard(cardStr, trumpSuit)) trumpOpen = true;
  }

  function playCard(pi, handIdx){
    const cardStr = players[pi].hand.splice(handIdx, 1)[0];
    if (!cardStr) return;

    if (trick.length === 0) setLeadSuitFromFirst(cardStr);

    trick.push({ pi, card: cardStr });
    updateTrumpOpenOnPlay(cardStr);

    turnIndex = (turnIndex + 1) % 3;
    renderAll();
  }

  function evaluateTrickWinner(){
    const anyTrump = trick.some(t => isTrumpCard(t.card, trumpSuit));

    if (anyTrump){
      let bestPi = trick[0].pi;
      let bestP = -1;
      for (const t of trick){
        if (!isTrumpCard(t.card, trumpSuit)) continue;
        const p = cardPower(t.card, trumpSuit);
        if (p > bestP){ bestP = p; bestPi = t.pi; }
      }
      return bestPi;
    }

    let bestPi = trick[0].pi;
    let bestV = -1;
    for (const t of trick){
      if (cardSuitForFollow(t.card, trumpSuit) !== leadSuit) continue;
      const v = parseCard(t.card).value;
      if (v > bestV){ bestV = v; bestPi = t.pi; }
    }
    return bestPi;
  }

  // AI: tries to win if possible, else dump low
  function aiChooseIndex(pi){
    const legal = legalCardsFor(pi);
    const hand = players[pi].hand;

    if (trick.length === 0){
      // lead lowest legal (simple, stable)
      let best = legal[0], bestP = 999999999;
      for (const idx of legal){
        const p = cardPower(hand[idx], trumpSuit);
        if (p < bestP){ bestP = p; best = idx; }
      }
      return best;
    }

    // try to win: pick the lowest card that still wins if possible
    let winning = null;
    let winningPow = 999999999;

    for (const idx of legal){
      const c = hand[idx];
      const temp = trick.concat([{ pi, card: c }]);

      const anyTrump = temp.some(t => isTrumpCard(t.card, trumpSuit));
      let winner;
      if (anyTrump){
        let bestPi = temp[0].pi, bestP = -1;
        for (const t of temp){
          if (!isTrumpCard(t.card, trumpSuit)) continue;
          const pow = cardPower(t.card, trumpSuit);
          if (pow > bestP){ bestP = pow; bestPi = t.pi; }
        }
        winner = bestPi;
      } else {
        let bestPi = temp[0].pi, bestV = -1;
        for (const t of temp){
          if (cardSuitForFollow(t.card, trumpSuit) !== leadSuit) continue;
          const v = parseCard(t.card).value;
          if (v > bestV){ bestV = v; bestPi = t.pi; }
        }
        winner = bestPi;
      }

      if (winner === pi){
        const pow = cardPower(c, trumpSuit);
        if (pow < winningPow){ winningPow = pow; winning = idx; }
      }
    }

    if (winning !== null) return winning;

    // dump lowest power legal
    let low = legal[0], lowP = 999999999;
    for (const idx of legal){
      const p = cardPower(hand[idx], trumpSuit);
      if (p < lowP){ lowP = p; low = idx; }
    }
    return low;
  }

  // ---------- engine ----------
  function startDeal(){
    setPhase("DEAL");
    dealHand();
    renderAll();
    setTimeout(() => startTrumpPick(), 250);
  }

  function startPlay(){
    setPhase("PLAY");
    trick = [];
    leadSuit = null;
    trickNumber = 1;

    // leader is whoever has 2C
    let whoHas2C = 0;
    for (let pi=0; pi<3; pi++){
      if (players[pi].hand.includes(CARD_OPEN_LEAD)) { whoHas2C = pi; break; }
    }
    turnIndex = whoHas2C;

    renderAll();
  }

  function resolveTrick(){
    const winner = evaluateTrickWinner();
    players[winner].tricks += 1;
    updateBooks();

    setTimeout(() => {
      trick = [];
      leadSuit = null;
      turnIndex = winner;
      trickNumber += 1;

      // end of hand?
      if (players.every(p => p.hand.length === 0)){
        // stop at end (demo2: single hand)
        setPhase("DONE");
        renderAll();
        return;
      }

      renderAll();
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

      // your turn: wait for click
      engineBusy = false;
    } catch (e){
      engineBusy = false;
      console.error("Engine error:", e);
    }
  }

  function engineKick(){
    setTimeout(engineStep, 0);
  }

  // ---------- events ----------
  resetBtn.addEventListener("click", () => {
    // full reset to pick phase
    hideTrumpOverlay();
    show(pickOverlayEl);
    pickOverlayEl.setAttribute("aria-hidden","false");

    setPhase("PICK");
    setDealer(null);
    setTrump(null);

    players.forEach(p => { p.hand=[]; p.tricks=0; });
    trick = [];
    leadSuit = null;
    trickNumber = 0;
    turnIndex = 0;
    trumpOpen = false;

    clearPickUI();
    clearTrickUI();
    renderAll();
  });

  pickBtn.addEventListener("click", () => {
    if (phase !== "PICK") return;
    doPick();
  });

  pickReBtn.addEventListener("click", () => {
    if (phase !== "PICK") return;
    doPick();
  });

  pickOkBtn.addEventListener("click", () => {
    if (phase !== "PICK") return;
    if (dealerIndex === null) return;

    // lock look: hide pick overlay and start
    hidePickOverlay();
    setPhase("DEAL");
    setTimeout(() => startDeal(), 120);
  });

  // ---------- boot ----------
  wireTrumpButtons();
  clearPickUI();
  setPhase("PICK");
  setDealer(null);
  setTrump(null);
  clearTrickUI();
  renderAll();

})();
