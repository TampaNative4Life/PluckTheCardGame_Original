// Demo 2 Engine = Demo 1 engine wired to Demo2 DOM
// Key change: prevent Jokers in initial PICK (dealer selection)

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const on = (el, evt, fn) => el && el.addEventListener(evt, fn);
  const setText = (el, txt) => { if (el) el.textContent = txt; };

  function msg(txt) { setText($("msg"), txt); }
  function err(txt) { setText($("msg"), "ERROR: " + txt); console.error("[Pluck]", txt); }

  window.addEventListener("error", (e) => err(e?.message || "Unknown JS error"));

  // Required in Demo2 HTML
  const handEl = $("hand");
  const trickEl = $("trick");
  const resetBtn = $("resetBtn");
  if (!handEl || !trickEl || !resetBtn) {
    err("Missing required elements: hand, trick, resetBtn (Demo2 HTML not updated?)");
    return;
  }

  const ai2HandEl = $("ai2Hand");
  const ai3HandEl = $("ai3Hand");

  // Optional engine labels (we keep hidden but present)
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
  const BRBR = ["S", "H", "C", "D"];
  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

  const AI_DELAY = 260;
  const RESOLVE_DELAY = 280;
  const BETWEEN_TRICKS = 240;

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
  const players = [
    { id:"AI2", hand:[], tricks:0, quota:7, plucksEarned:0, plucksSuffered:0 },
    { id:"AI3", hand:[], tricks:0, quota:6, plucksEarned:0, plucksSuffered:0 },
    { id:"YOU", hand:[], tricks:0, quota:4, plucksEarned:0, plucksSuffered:0 }
  ];

  function leftOf(i){ return (i+1)%3; }
  function rightOf(i){ return (i+2)%3; }

  let dealerIndex = 2;            // Demo2: start with YOU as dealer for now (so it runs)
  let firstHandDone = false;
  let phase = "DEAL";

  let trumpSuit = null;
  let trumpOpen = false;

  let trick = [];
  let leadSuit = null;
  let trickNumber = 0;

  let leaderIndex = 0;
  let turnIndex = 0;

  let pendingPlucks = null;
  let pluckQueue = [];
  let activePluck = null;
  let pluckSuitUsedByPair = new Map();

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

  // ---------- sorting ----------
  function suitOrderForHand(){
    if (!trumpSuit) return BRBR.slice();
    return [trumpSuit, ...BRBR.filter(s => s !== trumpSuit)];
  }

  function sortHandForDisplay(hand){
    const suitOrder = suitOrderForHand();
    const rankOrder = { "A":14,"K":13,"Q":12,"J":11,"10":10,"9":9,"8":8,"7":7,"6":6,"5":5,"4":4,"3":3,"2":2 };
    function suitGroup(s){ return suitOrder.indexOf(s) === -1 ? 99 : suitOrder.indexOf(s); }

    function key(cs){
      if (cs === CARD_BIG_JOKER) return { a:0, b:0, c:0 };
      if (cs === CARD_LITTLE_JOKER) return { a:0, b:1, c:0 };
      const suit = cs.slice(-1);
      const rank = cs.slice(0, cs.length-1);
      const sg = 1 + suitGroup(suit);
      const rv = rankOrder[rank] ?? 0;
      return { a: sg, b: 0, c: (100 - rv) };
    }

    return hand.slice().sort((x,y)=>{
      const a = key(x), b = key(y);
      if (a.a !== b.a) return a.a - b.a;
      if (a.b !== b.b) return a.b - b.b;
      return a.c - b.c;
    });
  }

  // ---------- rendering ----------
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

    // AI backs visual in Demo2
    if (ai2HandEl){
      ai2HandEl.innerHTML = "";
      for (let i=0;i<players[0].hand.length;i++){
        const b = document.createElement("span");
        ai2HandEl.appendChild(b);
      }
    }
    if (ai3HandEl){
      ai3HandEl.innerHTML = "";
      for (let i=0;i<players[1].hand.length;i++){
        const b = document.createElement("span");
        ai3HandEl.appendChild(b);
      }
    }

    const whoTurn = (phase === "PLAY")
      ? (turnIndex === 2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`)
      : "—";
    const leadTxt = leadSuit ? `${leadSuit} (${suitName(leadSuit)})` : "(none)";
    setText(turnBannerEl, `Phase: ${phase} • ${whoTurn} • Lead: ${leadTxt} • Trump: ${trumpSuit || "(none)"}`);

    // YOUR HAND
    handEl.innerHTML = "";
    const displayHand = sortHandForDisplay(players[2].hand);
    let legal = [];
    if (phase === "PLAY" && turnIndex === 2) legal = legalCardsFor(2);

    for (const card of displayHand) {
      const realIdx = players[2].hand.indexOf(card);
      const playable = (phase === "PLAY" && turnIndex === 2);
      const disabled = !playable || !legal.includes(realIdx);

      const face = makeCardFace(card, disabled);
      face.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (disabled) return;

        const legalNow = legalCardsFor(2);
        if (!legalNow.includes(realIdx)) { msg(illegalReason(2, card)); return; }

        playCard(2, realIdx);
        engineKick();
      }, { passive:false });

      handEl.appendChild(face);
    }

    // TRICK
    trickEl.innerHTML = "";
    if (!trick.length) {
      trickEl.textContent = "";
    } else {
      for (const t of trick) {
        const wrap = document.createElement("div");
        wrap.className = "trickSeat";
        const label = document.createElement("div");
        label.className = "trickLabel";
        label.textContent = players[t.playerIndex].id;

        const face = makeCardFace(t.cardStr, true, "trickCard");
        face.style.cursor = "default";

        wrap.appendChild(label);
        wrap.appendChild(face);
        trickEl.appendChild(wrap);
      }
    }

    updateDealerLabels();
  }

  // ---------- initial pick (prevent jokers here) ----------
  function pickOneCardNoJoker(){
    // draw until not joker
    let c = "";
    do {
      const d = shuffle(makeDeck51());
      c = d.pop();
    } while (c === CARD_BIG_JOKER || c === CARD_LITTLE_JOKER);
    return c;
  }

  // ---------- deal ----------
  function resetHandState(){
    trick = [];
    leadSuit = null;
    trickNumber = 0;

    trumpSuit = null;
    trumpOpen = false;

    leaderIndex = 0;
    turnIndex = 0;

    players.forEach(p => { p.hand = []; p.tricks = 0; });
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

  // ---------- trump pick (temp: auto pick so demo2 plays now) ----------
  function chooseTrumpFromOwnHand(pi){
    const suitScore = { S:0, H:0, D:0, C:0 };
    for (const c of players[pi].hand){
      if (isJoker(c)){ SUITS.forEach(s=>suitScore[s]+=6); continue; }
      const suit = c.slice(-1);
      const rank = c.slice(0,-1);
      const v = RANK_VALUE[rank] || 0;
      suitScore[suit] += 2;
      if (v >= 11) suitScore[suit] += (v-10)*2;
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
        msg("Hand complete. (Demo2 wiring done)");
        // keep it simple for Demo2 right now
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

  function startDemo2(){
    // For Demo2: auto-set dealer = YOU and skip pick UI.
    dealerIndex = 2;
    applyQuotasForDealer();
    updateDealerLabels();

    dealHand();

    // Auto pick trump for now (so you can play immediately on Demo2)
    setTrump(chooseTrumpFromOwnHand(dealerIndex));
    msg(`Trump auto-set to ${trumpSuit} (${suitName(trumpSuit)}). (We’ll add manual trump UI next.)`);

    toPlay();
    render();
    engineKick();
  }

  on(resetBtn, "click", () => {
    msg("Reset. New deal.");
    startDemo2();
  });

  // Boot
  setPhase("DEAL");
  startDemo2();

})();
