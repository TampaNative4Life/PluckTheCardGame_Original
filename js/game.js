// Pluck Web Demo v19
// Fix: card clicks not firing (mobile-safe). Uses event delegation on #hand.
// Rules enforced:
// - Order: THE DEAL -> (PLUCK after Hand 1 only) -> DEALER SELECTS TRUMP -> PLAY
// - First hand: NO PLUCK PHASE (per your rule)
// - Turn order during play: AI2 -> AI3 -> YOU (but leader is whoever has 2C for trick 1)
// - Must follow suit if possible
// - Jokers: must play if legal; treated as trump once trump is picked
// - Trump selection happens after plucks (or immediately on first hand)
// - Dealer rotates RIGHT each new deal; quotas: Dealer=7, Left=6, Right=4
//
// NOTE: This file assumes your game.html has at least these IDs:
// hand, trick, msg, resetBtn
// Optional (if present will be updated): ai2Hand, ai3Hand, phaseLabel, trumpLabel, trumpOpenLabel,
// pDeal, pPluck, pTrump, pPlay, trickNum, trickMax, ai2Quota, ai3Quota, youQuota, ai2Tricks, ai3Tricks, youTricks,
// aceTrump (a container to show the Ace of trump)

(function () {
  // ---------- Safe DOM helper ----------
  const $ = (id) => document.getElementById(id);

  const handEl = $("hand");
  const trickEl = $("trick");
  const msgEl = $("msg");
  const resetBtn = $("resetBtn");

  const ai2HandEl = $("ai2Hand");
  const ai3HandEl = $("ai3Hand");

  const phaseLabelEl = $("phaseLabel");
  const trumpLabelEl = $("trumpLabel");
  const trumpOpenLabelEl = $("trumpOpenLabel");

  const pDeal = $("pDeal");
  const pPluck = $("pPluck");
  const pTrump = $("pTrump");
  const pPlay = $("pPlay");

  const trickNumEl = $("trickNum");
  const trickMaxEl = $("trickMax");

  const ai2QuotaEl = $("ai2Quota");
  const ai3QuotaEl = $("ai3Quota");
  const youQuotaEl = $("youQuota");

  const ai2TricksEl = $("ai2Tricks");
  const ai3TricksEl = $("ai3Tricks");
  const youTricksEl = $("youTricks");

  const aceTrumpEl = $("aceTrump"); // optional

  function setMsg(t) {
    if (msgEl) msgEl.textContent = t || "";
  }

  function showError(msg) {
    setMsg("ERROR: " + msg);
    console.error(msg);
  }
  window.addEventListener("error", (e) => showError(e.message || "Unknown script error"));

  // ---------- Core constants ----------
  const TOTAL_TRICKS = 17;
  const SUITS = ["S", "H", "D", "C"];
  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

  // Images (optional): if you have /assets/cards/AS.png etc, it will try them.
  const USE_CARD_IMAGES = true;
  const CARD_IMG_DIR = "assets/cards";

  function suitName(s) { return s==="S"?"Spades":s==="H"?"Hearts":s==="D"?"Diamonds":"Clubs"; }
  function suitSymbol(s){ return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣"; }
  function isRedSuit(s){ return s==="H" || s==="D"; }
  function isJoker(cs) { return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }

  // ---------- Deck ----------
  function makePluckDeck51() {
    const deck = [];
    for (const s of SUITS) for (const r of RANKS_NO_2) deck.push(r + s);
    deck.push("2C");
    deck.push(CARD_BIG_JOKER);
    deck.push(CARD_LITTLE_JOKER);
    return deck;
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function parseCard(cs, trumpSuit) {
    if (cs === CARD_BIG_JOKER) return { raw: cs, kind:"JOKER", suit: trumpSuit, value: 1000 };
    if (cs === CARD_LITTLE_JOKER) return { raw: cs, kind:"JOKER", suit: trumpSuit, value: 900 };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length - 1);
    return { raw: cs, kind:"NORMAL", suit, rank, value: RANK_VALUE[rank] };
  }

  // During PLAY, jokers behave as trump suit. Before trump is picked, treat joker suit as null.
  function cardSuitForFollow(cs, trumpSuit) {
    if (isJoker(cs)) return trumpSuit || null;
    return cs.slice(-1);
  }
  function isTrumpCard(cs, trumpSuit) {
    if (!trumpSuit) return false;
    if (isJoker(cs)) return true;
    return cs.slice(-1) === trumpSuit;
  }

  // ---------- Players ----------
  // 0=AI2, 1=AI3, 2=YOU
  let dealerIndex = 0;
  function leftOf(i) { return (i + 1) % 3; }
  function rightOf(i) { return (i + 2) % 3; }

  const players = [
    { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7 },
    { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6 },
    { id:"YOU", name:"You",           hand:[], tricks:0, quota:4 }
  ];

  function rotateDealerAndApplyQuotas() {
    dealerIndex = rightOf(dealerIndex);
    players[dealerIndex].quota = 7;
    players[leftOf(dealerIndex)].quota = 6;
    players[rightOf(dealerIndex)].quota = 4;
  }

  // ---------- State ----------
  let phase = "THE_DEAL"; // THE_DEAL | PLUCK | DEALER_SELECTS_TRUMP | PLAY
  let handNumber = 0;

  let trumpSuit = null;
  let trumpOpen = false;

  let leaderIndex = 0;
  let turnIndex = 0;
  let leadSuit = null;
  let trick = []; // {playerIndex, cardStr}
  let lockInput = false;

  let trickNumber = 1;

  // memory for void suits (public inference only)
  const memory = {
    played: new Set(),
    voidSuits: [new Set(), new Set(), new Set()]
  };
  function resetMemory() {
    memory.played = new Set();
    memory.voidSuits = [new Set(), new Set(), new Set()];
  }

  // ---------- UI phase highlight ----------
  function setPhase(newPhase) {
    phase = newPhase;
    if (phaseLabelEl) {
      if (newPhase === "THE_DEAL") phaseLabelEl.textContent = "THE DEAL";
      else if (newPhase === "PLUCK") phaseLabelEl.textContent = "PLUCK";
      else if (newPhase === "DEALER_SELECTS_TRUMP") phaseLabelEl.textContent = "DEALER SELECTS TRUMP";
      else if (newPhase === "PLAY") phaseLabelEl.textContent = "PLAY";
      else phaseLabelEl.textContent = newPhase;
    }

    // Highlight chips if present
    const clear = (el) => el && el.classList.remove("activeChip");
    const on = (el) => el && el.classList.add("activeChip");

    [pDeal,pPluck,pTrump,pPlay].forEach(clear);

    if (newPhase === "THE_DEAL") on(pDeal);
    if (newPhase === "PLUCK") on(pPluck);
    if (newPhase === "DEALER_SELECTS_TRUMP") on(pTrump);
    if (newPhase === "PLAY") on(pPlay);
  }

  function suitDisplay(s) {
    if (!s) return "(not picked)";
    return `${s} (${suitName(s)})`;
  }

  // ---------- Card face rendering ----------
  function makeCardFaceFallback(cardStr, disabled=false) {
    const el = document.createElement("div");
    el.className = "cardFace" + (disabled ? " disabled" : "");
    el.dataset.card = cardStr;

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
      el.appendChild(tl); el.appendChild(br); el.appendChild(mid);
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

  // IMPORTANT FIX: img has pointer-events: none so taps always reach the card div.
  function makeCardFace(cardStr, disabled=false) {
    if (!USE_CARD_IMAGES) return makeCardFaceFallback(cardStr, disabled);

    const el = document.createElement("div");
    el.className = "cardFace" + (disabled ? " disabled" : "");
    el.dataset.card = cardStr;
    el.style.padding = "0";
    el.style.overflow = "hidden";

    const img = document.createElement("img");
    img.alt = cardStr;
    img.src = `${CARD_IMG_DIR}/${cardStr}.png`;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.pointerEvents = "none"; // <-- tap/click FIX on mobile

    img.onerror = () => {
      // Replace with fallback if image missing
      const fb = makeCardFaceFallback(cardStr, disabled);
      fb.dataset.card = cardStr;
      el.replaceWith(fb);
    };

    el.appendChild(img);
    return el;
  }

  // ---------- Sorting hand for display ----------
  // Your request: order by suits, and trump group first after trump is picked.
  // Jokers first within trump group: BJ, LJ, then A,K,Q,J,10...
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

      // High ranks first
      const rv = rankOrder[rank] ?? 0;
      return { sg, r: (100 - rv) };
    }

    return hand.slice().sort((a,b)=>{
      const ka=key(a), kb=key(b);
      if (ka.sg !== kb.sg) return ka.sg - kb.sg;
      return ka.r - kb.r;
    });
  }

  // ---------- Play legality ----------
  function hasSuit(playerIndex, suit) {
    return players[playerIndex].hand.some(c => cardSuitForFollow(c, trumpSuit) === suit);
  }

  function legalIndexesFor(playerIndex) {
    const hand = players[playerIndex].hand;

    // Trick 1, first lead must be 2C if you have it and you are the leader
    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
      return hand.map((c,i)=>({c,i})).filter(x => x.c === CARD_OPEN_LEAD).map(x=>x.i);
    }

    // If following, must follow suit if possible
    if (trick.length > 0) {
      const mustSuit = leadSuit;
      const suited = hand.map((c,i)=>({c,i})).filter(x => cardSuitForFollow(x.c, trumpSuit) === mustSuit).map(x=>x.i);
      return suited.length ? suited : hand.map((_,i)=>i);
    }

    // Leading: allow anything (you can add "trump not open" later if you want)
    return hand.map((_,i)=>i);
  }

  function illegalReason(playerIndex, cardStr) {
    if (trickNumber === 1 && trick.length === 0 && players[playerIndex].hand.includes(CARD_OPEN_LEAD)) {
      if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
    }
    if (trick.length > 0) {
      const mustSuit = leadSuit;
      if (hasSuit(playerIndex, mustSuit) && cardSuitForFollow(cardStr, trumpSuit) !== mustSuit) {
        return `You must follow suit: ${mustSuit}.`;
      }
    }
    return "That play is not allowed.";
  }

  // ---------- Trick resolution ----------
  function cardPower(cardStr) {
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

    // No trump played: highest of lead suit wins
    let bestPi = trick[0].playerIndex;
    let bestV = -1;
    for (const t of trick) {
      if (cardSuitForFollow(t.cardStr, trumpSuit) !== leadSuit) continue;
      const v = parseCard(t.cardStr, trumpSuit).value;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi;
  }

  function updateVoidMemory(playerIndex, playedCard) {
    if (trick.length === 0) return;
    const mustSuit = leadSuit;
    const playedSuit = cardSuitForFollow(playedCard, trumpSuit);
    if (playedSuit !== mustSuit) memory.voidSuits[playerIndex].add(mustSuit);
  }

  // ---------- Core play ----------
  function setLeadSuitFromFirst(cardStr) {
    leadSuit = cardSuitForFollow(cardStr, trumpSuit);
  }

  function playCard(playerIndex, handIdx) {
    const cardStr = players[playerIndex].hand.splice(handIdx, 1)[0];
    if (!cardStr) { showError("Tried to play empty card."); return; }

    if (trick.length === 0) setLeadSuitFromFirst(cardStr);
    else updateVoidMemory(playerIndex, cardStr);

    trick.push({ playerIndex, cardStr });
    memory.played.add(cardStr);

    // open trump once any trump is played
    if (!trumpOpen && isTrumpCard(cardStr, trumpSuit)) trumpOpen = true;

    // next turn
    turnIndex = (turnIndex + 1) % 3;
    render();
    loop();
  }

  // ---------- AI: always tries to win (simple, effective) ----------
  function wouldWinIfPlayedNow(aiIndex, cardStr) {
    const temp = trick.concat([{ playerIndex: aiIndex, cardStr }]);
    const anyTrump = temp.some(t => isTrumpCard(t.cardStr, trumpSuit));

    if (anyTrump) {
      let bestPi = temp[0].playerIndex;
      let bestP = -1;
      for (const t of temp) {
        if (!isTrumpCard(t.cardStr, trumpSuit)) continue;
        const p = cardPower(t.cardStr);
        if (p > bestP) { bestP = p; bestPi = t.playerIndex; }
      }
      return bestPi === aiIndex;
    }

    // no trump: lead suit only
    let bestPi = temp[0].playerIndex;
    let bestV = -1;
    for (const t of temp) {
      if (cardSuitForFollow(t.cardStr, trumpSuit) !== leadSuit) continue;
      const v = parseCard(t.cardStr, trumpSuit).value;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi === aiIndex;
  }

  function chooseAiIndex(aiIndex) {
    const legal = legalIndexesFor(aiIndex);
    const hand = players[aiIndex].hand;

    // 1) if can win now, do the cheapest winning card
    const winners = [];
    for (const idx of legal) {
      const c = hand[idx];
      if (wouldWinIfPlayedNow(aiIndex, c)) winners.push(idx);
    }
    if (winners.length) {
      winners.sort((a,b)=> cardPower(hand[a]) - cardPower(hand[b]));
      return winners[0];
    }

    // 2) else dump the cheapest legal card
    legal.sort((a,b)=> cardPower(hand[a]) - cardPower(hand[b]));
    return legal[0];
  }

  // ---------- Trump selection ----------
  function dealerChoosesTrumpFromOwnHand(dealer) {
    const suitScore = { S:0, H:0, D:0, C:0 };
    for (const cs of players[dealer].hand) {
      if (isJoker(cs)) {
        suitScore.S += 6; suitScore.H += 6; suitScore.D += 6; suitScore.C += 6;
        continue;
      }
      const suit = cs.slice(-1);
      const rank = cs.slice(0, cs.length-1);
      const v = RANK_VALUE[rank] || 0;

      suitScore[suit] += 2;                 // length
      if (v >= 11) suitScore[suit] += (v - 10) * 2; // J/Q/K/A weight
      else suitScore[suit] += Math.max(0, v - 6) * 0.5;
    }
    let bestSuit = "H", best = -Infinity;
    for (const s of SUITS) {
      if (suitScore[s] > best) { best = suitScore[s]; bestSuit = s; }
    }
    return bestSuit;
  }

  function setTrump(suit) {
    trumpSuit = suit;
    trumpOpen = false; // closed until a trump is played
    if (trumpLabelEl) trumpLabelEl.textContent = suitDisplay(trumpSuit);
    if (trumpOpenLabelEl) trumpOpenLabelEl.textContent = trumpOpen ? "Yes" : "No";

    // Display Ace of trump if container exists
    if (aceTrumpEl) {
      aceTrumpEl.innerHTML = "";
      if (trumpSuit) {
        const aceCard = "A" + trumpSuit;
        const face = makeCardFace(aceCard, true);
        face.style.cursor = "default";
        aceTrumpEl.appendChild(face);
      }
    }
  }

  // ---------- Deal ----------
  function dealNewHands() {
    resetMemory();

    const deck = shuffle(makePluckDeck51());
    players.forEach(p => { p.hand = []; p.tricks = 0; });

    trick = [];
    leadSuit = null;
    trickNumber = 1;

    for (let i=0;i<TOTAL_TRICKS;i++) {
      players[0].hand.push(deck.pop());
      players[1].hand.push(deck.pop());
      players[2].hand.push(deck.pop());
    }

    // Trump is chosen after deal step(s)
    trumpSuit = null;
    trumpOpen = false;

    // Trick 1 leader = whoever has 2C
    let whoHas2C = 0;
    for (let pi=0; pi<3; pi++) {
      if (players[pi].hand.includes(CARD_OPEN_LEAD)) { whoHas2C = pi; break; }
    }
    leaderIndex = whoHas2C;
    turnIndex = whoHas2C;

    render();
  }

  // ---------- Phases ----------
  function startHand() {
    // Rotate dealer RIGHT every hand (including first load)
    rotateDealerAndApplyQuotas();
    handNumber += 1;

    setPhase("THE_DEAL");
    setMsg(`Hand ${handNumber}: The deal is set. Dealer: ${players[dealerIndex].id}`);

    dealNewHands();

    // No plucks on the first hand
    if (handNumber === 1) {
      setPhase("DEALER_SELECTS_TRUMP");
      const trump = dealerChoosesTrumpFromOwnHand(dealerIndex);
      setTrump(trump);
      setPhase("PLAY");
      setMsg(`Hand 1: Dealer selects trump: ${suitDisplay(trumpSuit)}. Play begins.`);
      render();
      loop();
      return;
    }

    // Later hands: pluck phase exists (but you said plucks can be hairy and manual).
    // For now: we show the phase but DO NOT auto-pluck (you wanted no auto pluck).
    setPhase("PLUCK");
    setMsg("Pluck Phase: (manual plucks not implemented in v19). Click Reset to test play, or tell me when to wire pluck UI again.");

    // If you want to continue play anyway, we can go straight to trump pick for now:
    setPhase("DEALER_SELECTS_TRUMP");
    const trump = dealerChoosesTrumpFromOwnHand(dealerIndex);
    setTrump(trump);
    setPhase("PLAY");
    setMsg(`Dealer selects trump: ${suitDisplay(trumpSuit)}. Play begins.`);
    render();
    loop();
  }

  // ---------- Render ----------
  function render() {
    if (trumpLabelEl) trumpLabelEl.textContent = suitDisplay(trumpSuit);
    if (trumpOpenLabelEl) trumpOpenLabelEl.textContent = trumpOpen ? "Yes" : "No";

    if (ai2QuotaEl) ai2QuotaEl.textContent = String(players[0].quota);
    if (ai3QuotaEl) ai3QuotaEl.textContent = String(players[1].quota);
    if (youQuotaEl) youQuotaEl.textContent = String(players[2].quota);

    if (ai2TricksEl) ai2TricksEl.textContent = String(players[0].tricks);
    if (ai3TricksEl) ai3TricksEl.textContent = String(players[1].tricks);
    if (youTricksEl) youTricksEl.textContent = String(players[2].tricks);

    if (trickNumEl) trickNumEl.textContent = String(trickNumber);
    if (trickMaxEl) trickMaxEl.textContent = String(TOTAL_TRICKS);

    if (ai2HandEl) ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
    if (ai3HandEl) ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

    // Your hand
    if (handEl) {
      handEl.innerHTML = "";
      const sorted = sortHandForDisplay(players[2].hand);

      // Build cards with data-idx pointing to the REAL index in the actual hand array.
      // (We store it on the DIV so event delegation can find it.)
      const isYourTurnPlayable = (phase === "PLAY" && turnIndex === 2);

      const legal = isYourTurnPlayable ? legalIndexesFor(2) : [];

      for (const c of sorted) {
        const realIdx = players[2].hand.indexOf(c);
        const disabled = !(isYourTurnPlayable && legal.includes(realIdx));

        const face = makeCardFace(c, disabled);
        face.dataset.idx = String(realIdx);
        face.classList.add("clickCard");
        handEl.appendChild(face);
      }
    }

    // Trick
    if (trickEl) {
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
    }

    // Keep trump label & ace updated
    if (aceTrumpEl && trumpSuit) {
      // If aceTrump already has content, leave it; if empty, add it
      if (!aceTrumpEl.children || aceTrumpEl.children.length === 0) {
        const aceCard = "A" + trumpSuit;
        const face = makeCardFace(aceCard, true);
        face.style.cursor = "default";
        aceTrumpEl.appendChild(face);
      }
    }
  }

  // ---------- Main loop ----------
  function roundIsOver() {
    return players.every(p => p.hand.length === 0) && trick.length === 0;
  }

  function loop() {
    if (phase !== "PLAY") return;
    if (lockInput) return;

    // Resolve trick when 3 cards played
    if (trick.length === 3) {
      lockInput = true;
      setTimeout(() => {
        const winner = evaluateTrickWinner();
        players[winner].tricks += 1;
        setMsg(`${players[winner].name} wins the trick.`);
        render();

        setTimeout(() => {
          // next trick
          trick = [];
          leadSuit = null;
          leaderIndex = winner;
          turnIndex = winner;
          trickNumber += 1;

          lockInput = false;
          render();

          if (roundIsOver()) {
            setMsg("Hand over. Press Reset (New Deal).");
            return;
          }
          loop();
        }, 220);
      }, 250);
      return;
    }

    // AI turns
    if (turnIndex !== 2) {
      lockInput = true;
      setTimeout(() => {
        const aiIdx = chooseAiIndex(turnIndex);
        // Safety
        if (aiIdx === undefined || aiIdx === null) {
          showError("AI had no legal move.");
          lockInput = false;
          return;
        }
        playCard(turnIndex, aiIdx);
        lockInput = false;
        render();
      }, 220);
      return;
    }

    // Your turn: wait for click
    // (Nothing else happens here)
  }

  // ---------- CLICK FIX (Event Delegation) ----------
  // This is the part that fixes your "I click and nothing happens" problem.
  if (handEl) {
    handEl.addEventListener("click", (evt) => {
      try {
        const cardDiv = evt.target.closest(".cardFace");
        if (!cardDiv) return;

        // Disabled cards do nothing
        if (cardDiv.classList.contains("disabled")) return;

        if (phase !== "PLAY") { setMsg("Not in PLAY yet."); return; }
        if (turnIndex !== 2) { setMsg("Wait your turn."); return; }
        if (lockInput) return;

        const idxStr = cardDiv.dataset.idx;
        const idx = Number(idxStr);
        if (!Number.isFinite(idx)) { showError("Card missing index."); return; }

        const cardStr = players[2].hand[idx];
        if (!cardStr) { showError("That card index is no longer valid."); return; }

        const legal = legalIndexesFor(2);
        if (!legal.includes(idx)) {
          setMsg(illegalReason(2, cardStr));
          return;
        }

        playCard(2, idx);
      } catch (e) {
        showError(e.message || "Click error");
      }
    }, { passive: true });
  }

  // ---------- Reset ----------
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      startHand();
    });
  }

  // ---------- Boot ----------
  // Start immediately
  startHand();

  console.log("Pluck Demo v19 loaded");
})();render();
console.log("Pluck Demo v19 loaded");
