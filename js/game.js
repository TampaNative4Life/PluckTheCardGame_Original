// Pluck Web Demo v20 (single-file replacement)
// Fixes:
// - Hand 1 plays, then AUTO starts Hand 2+ (no dead-end).
// - First hand has NO PLUCK phase.
// - Hand 2+ runs: DEAL -> PLUCK -> TRUMP PICK -> PLAY
// - Dealer chosen by visible 3-card pick. Tie => repick. OK => start.
// - Click/tap reliability: cards always clickable; illegal plays show message (no silent fail).
// - Trump lead rule: cannot LEAD trump until trump is open, unless you have only trump left.
// - Shows Ace of trump in #trumpAceSlot if present.

(function(){
  "use strict";

  const $ = (id) => document.getElementById(id);
  const on = (el, evt, fn) => el && el.addEventListener(evt, fn);

  // Required
  const handEl = $("hand");
  const trickEl = $("trick");
  const resetBtn = $("resetBtn");
  if (!handEl || !trickEl || !resetBtn) return;

  // Optional UI
  const ai2HandEl = $("ai2Hand");
  const ai3HandEl = $("ai3Hand");
  const msgEl = $("msg");

  const phaseLabelEl = $("phaseLabel");
  const handNumEl = $("handNum");
  const trumpLabelEl = $("trumpLabel");
  const trumpOpenLabelEl = $("trumpOpenLabel");
  const turnBannerEl = $("turnBanner");

  const dealerLabelEl = $("dealerLabel");
  const dealerBannerEl = $("dealerBanner");

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

  const trumpAceSlotEl = $("trumpAceSlot");

  function setText(el, t){ if (el) el.textContent = t; }
  function showMsg(t){ if (msgEl) msgEl.textContent = t; }
  function showPluckMsg(t){ if (pluckStatusEl) pluckStatusEl.textContent = t; }
  function showTrumpMsg(t){ if (trumpStatusEl) trumpStatusEl.textContent = t; }

  // ---------- Game constants ----------
  const TOTAL_TRICKS = 17;
  const SUITS = ["S","H","D","C"];
  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

  function suitName(s){ return s==="S"?"Spades":s==="H"?"Hearts":s==="D"?"Diamonds":"Clubs"; }
  function suitSymbol(s){ return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣"; }
  function isRedSuit(s){ return s==="H" || s==="D"; }
  function isJoker(cs){ return cs===CARD_BIG_JOKER || cs===CARD_LITTLE_JOKER; }

  function makePluckDeck51(){
    const deck=[];
    for (const s of SUITS) for (const r of RANKS_NO_2) deck.push(r+s);
    deck.push("2C");
    deck.push(CARD_BIG_JOKER);
    deck.push(CARD_LITTLE_JOKER);
    return deck;
  }
  function shuffle(a){
    for (let i=a.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }
  function parseCard(cs, trumpSuit){
    if (cs===CARD_BIG_JOKER) return { raw:cs, kind:"JOKER", suit:trumpSuit, value:1000 };
    if (cs===CARD_LITTLE_JOKER) return { raw:cs, kind:"JOKER", suit:trumpSuit, value:900 };
    const suit=cs.slice(-1);
    const rank=cs.slice(0,cs.length-1);
    return { raw:cs, kind:"NORMAL", suit, rank, value:RANK_VALUE[rank] };
  }
  function cardSuitForFollow(cs, trumpSuit){
    if (isJoker(cs)) return trumpSuit || null;
    return cs.slice(-1);
  }
  function isTrumpCard(cs, trumpSuit){
    if (!trumpSuit) return false;
    if (isJoker(cs)) return true;
    return cs.slice(-1)===trumpSuit;
  }

  // ---------- Card face (drawn, reliable) ----------
  function makeCardFace(cardStr, disabled){
    const el=document.createElement("div");
    el.className="cardFace" + (disabled ? " disabled" : "");

    if (cardStr===CARD_BIG_JOKER || cardStr===CARD_LITTLE_JOKER){
      el.classList.add("joker");
      const tl=document.createElement("div");
      tl.className="corner tl";
      tl.textContent=(cardStr===CARD_BIG_JOKER?"BJ":"LJ");
      const br=document.createElement("div");
      br.className="corner br";
      br.textContent=(cardStr===CARD_BIG_JOKER?"BJ":"LJ");
      const mid=document.createElement("div");
      mid.className="suitBig";
      mid.textContent="🃏";
      const tag=document.createElement("div");
      tag.className="jokerTag";
      tag.textContent=(cardStr===CARD_BIG_JOKER?"BIG JOKER":"LITTLE JOKER");
      el.appendChild(tl); el.appendChild(br); el.appendChild(mid); el.appendChild(tag);
      return el;
    }

    const suit=cardStr.slice(-1);
    const rank=cardStr.slice(0,cardStr.length-1);
    const colorClass=isRedSuit(suit)?"red":"black";
    const sym=suitSymbol(suit);

    const tl=document.createElement("div");
    tl.className=`corner tl ${colorClass}`;
    tl.innerHTML=`${rank}<br>${sym}`;

    const br=document.createElement("div");
    br.className=`corner br ${colorClass}`;
    br.innerHTML=`${rank}<br>${sym}`;

    const mid=document.createElement("div");
    mid.className=`suitBig ${colorClass}`;
    mid.textContent=sym;

    el.appendChild(tl); el.appendChild(br); el.appendChild(mid);
    return el;
  }

  function sortHandForDisplay(hand){
    const suitOrder=["S","H","D","C"];
    const rankOrder={ "A":14,"K":13,"Q":12,"J":11,"10":10,"9":9,"8":8,"7":7,"6":6,"5":5,"4":4,"3":3,"2":2 };
    function suitGroup(s){
      if (trumpSuit && s===trumpSuit) return 0;
      if (trumpSuit){
        const after=suitOrder.filter(x=>x!==trumpSuit);
        return 1 + after.indexOf(s);
      }
      return suitOrder.indexOf(s);
    }
    function key(cs){
      if (cs===CARD_BIG_JOKER) return { sg:0, r:0 };
      if (cs===CARD_LITTLE_JOKER) return { sg:0, r:1 };
      const suit=cs.slice(-1);
      const rank=cs.slice(0,cs.length-1);
      return { sg:suitGroup(suit), r:(100-(rankOrder[rank]||0)) };
    }
    return hand.slice().sort((a,b)=>{
      const ka=key(a), kb=key(b);
      if (ka.sg!==kb.sg) return ka.sg-kb.sg;
      return ka.r-kb.r;
    });
  }

  // ---------- Players ----------
  // 0=AI2, 1=AI3, 2=YOU
  const players=[
    { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7, plucksEarned:0, plucksSuffered:0 },
    { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6, plucksEarned:0, plucksSuffered:0 },
    { id:"YOU", name:"You",            hand:[], tricks:0, quota:4, plucksEarned:0, plucksSuffered:0 }
  ];

  let dealerIndex = 0;
  function leftOf(i){ return (i+1)%3; }
  function rightOf(i){ return (i+2)%3; }

  function applyQuotas(){
    players[dealerIndex].quota=7;
    players[leftOf(dealerIndex)].quota=6;
    players[rightOf(dealerIndex)].quota=4;
  }

  // ---------- State ----------
  let phase = "PICK_DEALER"; // PICK_DEALER | DEAL | PLUCK | TRUMP_PICK | PLAY
  let handNumber = 0;

  let trumpSuit = null;
  let trumpOpen = false;

  let leaderIndex = 0;
  let turnIndex = 0;
  let leadSuit = null;
  let trick = [];
  let lockInput = false;

  let trickNumber = 0;
  let trickMax = TOTAL_TRICKS;

  // Plucks are computed at end of a hand, and applied BEFORE trump on the NEXT hand.
  let pendingPluckQueue = null;
  let pluckQueue = [];
  let activePluck = null;
  let pluckSuitUsedByPair = new Map();

  // ---------- Phase UI ----------
  function setPhase(newPhase){
    phase = newPhase;
    setText(phaseLabelEl, newPhase);

    if (pluckPanelEl) pluckPanelEl.style.display = (newPhase==="PLUCK") ? "block" : "none";
    if (trumpPanelEl) trumpPanelEl.style.display = (newPhase==="TRUMP_PICK") ? "block" : "none";

    [pDeal,pPluck,pTrump,pPlay].forEach(x=>x && x.classList.remove("activeChip"));
    if (newPhase==="DEAL") pDeal && pDeal.classList.add("activeChip");
    if (newPhase==="PLUCK") pPluck && pPluck.classList.add("activeChip");
    if (newPhase==="TRUMP_PICK") pTrump && pTrump.classList.add("activeChip");
    if (newPhase==="PLAY") pPlay && pPlay.classList.add("activeChip");
  }

  function updateTrumpUI(){
    setText(trumpLabelEl, trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not picked)");
    setText(trumpOpenLabelEl, trumpOpen ? "Yes" : "No");

    // Show Ace of trump
    if (trumpAceSlotEl){
      trumpAceSlotEl.innerHTML = "";
      if (!trumpSuit){
        trumpAceSlotEl.textContent = "(none)";
      } else {
        const ace = "A" + trumpSuit;
        trumpAceSlotEl.appendChild(makeCardFace(ace, true));
      }
    }
  }

  function render(){
    updateTrumpUI();
    setText(handNumEl, String(handNumber));
    setText(trickNumEl, String(trickNumber));
    setText(trickMaxEl, String(trickMax));

    setText(ai2QuotaEl, String(players[0].quota));
    setText(ai3QuotaEl, String(players[1].quota));
    setText(youQuotaEl, String(players[2].quota));

    setText(ai2TricksEl, String(players[0].tricks));
    setText(ai3TricksEl, String(players[1].tricks));
    setText(youTricksEl, String(players[2].tricks));

    setText(dealerLabelEl, players[dealerIndex]?.id || "(not set)");
    setText(dealerBannerEl, players[dealerIndex]?.id || "(not set)");

    // Hidden hands
    if (ai2HandEl) ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
    if (ai3HandEl) ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

    // Turn banner
    const who = (phase==="PLAY") ? (turnIndex===2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`) : "—";
    if (turnBannerEl){
      turnBannerEl.textContent =
        `Phase: ${phase} • Hand: ${handNumber} • Dealer: ${players[dealerIndex].id} • ${who} • Trump: ${trumpSuit || "(not set)"} • Trump Open: ${trumpOpen ? "Yes" : "No"}`;
    }

    // Trick area
    trickEl.innerHTML = "";
    if (!trick.length){
      trickEl.textContent = "(empty)";
    } else {
      for (const t of trick){
        const wrap=document.createElement("div");
        wrap.style.display="flex";
        wrap.style.flexDirection="column";
        wrap.style.alignItems="center";
        wrap.style.gap="6px";

        const label=document.createElement("div");
        label.style.fontSize="12px";
        label.style.color="#5b667a";
        label.textContent=players[t.playerIndex].id;

        const face=makeCardFace(t.cardStr, true);
        face.style.cursor="default";

        wrap.appendChild(label);
        wrap.appendChild(face);
        trickEl.appendChild(wrap);
      }
    }

    // Your hand (click wiring here, always)
    handEl.innerHTML = "";
    const sorted = sortHandForDisplay(players[2].hand);

    for (const c of sorted){
      const realIdx = players[2].hand.indexOf(c);
      const isYourTurn = (phase==="PLAY" && turnIndex===2 && !lockInput);

      // We keep cards clickable ONLY on your turn; otherwise disabled
      const disabled = !isYourTurn;

      const face = makeCardFace(c, disabled);

      // Use pointerup for tablets, fallback to click
      const handler = (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        if (disabled) return;
        if (phase!=="PLAY") return;
        if (turnIndex!==2) return;
        if (lockInput) return;

        const reason = illegalReason(2, c);
        if (reason){
          showMsg(reason);
          return;
        }
        playCard(2, realIdx);
      };

      face.addEventListener("pointerup", handler, { passive:false });
      face.addEventListener("click", handler, { passive:false });

      handEl.appendChild(face);
    }

    if (phase==="PLUCK") renderPluckStatus();
    if (phase==="TRUMP_PICK") renderTrumpPickStatus();
  }

  // ---------- Dealer Pick ----------
  function pickCardValueForDealer(cs){
    // Lowest wins dealer pick.
    // 3..A are normal low-to-high, 2C treated high, jokers highest.
    if (cs===CARD_BIG_JOKER) return 1000;
    if (cs===CARD_LITTLE_JOKER) return 900;
    if (cs==="2C") return 800;
    const rank = cs.slice(0, cs.length-1);
    return RANK_VALUE[rank] || 999;
  }

  let pickCards = null; // {0:card,1:card,2:card}
  function clearPickUI(){
    if (pickAI2El) pickAI2El.textContent="(none)";
    if (pickAI3El) pickAI3El.textContent="(none)";
    if (pickYOUEl) pickYOUEl.textContent="(none)";
    setText(pickStatusEl, "Click “Pick Cards”.");
    if (pickOkBtn) pickOkBtn.disabled=true;
    if (pickReBtn) pickReBtn.disabled=true;
  }

  function doPickDealer(){
    setPhase("PICK_DEALER");
    trumpSuit=null; trumpOpen=false;

    const deck = shuffle(makePluckDeck51());
    pickCards = {
      0: deck.pop(),
      1: deck.pop(),
      2: deck.pop()
    };

    if (pickAI2El){ pickAI2El.innerHTML=""; pickAI2El.appendChild(makeCardFace(pickCards[0], true)); }
    if (pickAI3El){ pickAI3El.innerHTML=""; pickAI3El.appendChild(makeCardFace(pickCards[1], true)); }
    if (pickYOUEl){ pickYOUEl.innerHTML=""; pickYOUEl.appendChild(makeCardFace(pickCards[2], true)); }

    // Find lowest
    const vals = [
      {i:0,v:pickCardValueForDealer(pickCards[0])},
      {i:1,v:pickCardValueForDealer(pickCards[1])},
      {i:2,v:pickCardValueForDealer(pickCards[2])},
    ].sort((a,b)=>a.v-b.v);

    const lowestV = vals[0].v;
    const tied = vals.filter(x=>x.v===lowestV).map(x=>x.i);

    if (tied.length>1){
      setText(pickStatusEl, `TIE for lowest: ${tied.map(i=>players[i].id).join(", ")}. Re-Pick required.`);
      if (pickOkBtn) pickOkBtn.disabled=true;
      if (pickReBtn) pickReBtn.disabled=false;
      showMsg("Tie on dealer pick. Click Re-Pick.");
      return;
    }

    dealerIndex = tied[0];
    applyQuotas();
    setText(pickStatusEl, `Lowest card: ${players[dealerIndex].id}. Click OK to start.`);
    if (pickOkBtn) pickOkBtn.disabled=false;
    if (pickReBtn) pickReBtn.disabled=false;
    showMsg("Dealer chosen. Click OK (Start Game).");
    render();
  }

  // ---------- Deal / Start Hand ----------
  function resetForNewHand(){
    players.forEach(p=>{
      p.hand=[];
      p.tricks=0;
      p.plucksEarned=0;
      p.plucksSuffered=0;
    });

    trickNumber=1;
    trickMax=TOTAL_TRICKS;
    trick=[];
    leadSuit=null;
    leaderIndex=0;
    turnIndex=0;
    lockInput=false;

    trumpSuit=null;
    trumpOpen=false;

    pluckSuitUsedByPair = new Map();
    activePluck = null;
  }

  function dealHands(){
    setPhase("DEAL");
    resetForNewHand();

    const deck = shuffle(makePluckDeck51());
    for (let i=0;i<TOTAL_TRICKS;i++){
      players[0].hand.push(deck.pop());
      players[1].hand.push(deck.pop());
      players[2].hand.push(deck.pop());
    }
    render();
  }

  function computeTrumpCallerIndex(){
    // Dealer selects trump (your rule)
    return dealerIndex;
  }

  function aiChooseTrumpFromOwnHand(aiIndex){
    const hand = players[aiIndex].hand;
    const suitScore = { S:0, H:0, D:0, C:0 };

    for (const cs of hand){
      if (isJoker(cs)){
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

    let bestSuit="H", best=-Infinity;
    for (const s of SUITS){
      if (suitScore[s] > best){ best = suitScore[s]; bestSuit = s; }
    }
    return bestSuit;
  }

  function setTrump(s){
    trumpSuit = s;
    trumpOpen = (trumpSuit === "C"); // keep your Clubs-open rule
    updateTrumpUI();
  }

  function startHandFlow(){
    // increment hand number
    handNumber += 1;
    setText(handNumEl, String(handNumber));

    // rotate dealer to the right on hands AFTER hand1
    // Hand 1 dealer is the picked dealer.
    if (handNumber > 1){
      dealerIndex = rightOf(dealerIndex);
      applyQuotas();
    }

    dealHands();

    // First hand: NO pluck
    if (handNumber === 1){
      pluckQueue = [];
      pendingPluckQueue = null;
      moveToTrumpPick();
      return;
    }

    // Hand 2+: pluckQueue comes from previous hand
    pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
    pendingPluckQueue = null;

    if (pluckQueue.length){
      moveToPluck();
    } else {
      moveToTrumpPick();
    }
  }

  // ---------- Trump Pick ----------
  function renderTrumpPickStatus(){
    if (!trumpSuit){
      const caller = computeTrumpCallerIndex();
      if (caller === 2) showTrumpMsg("You are the Dealer. Pick trump.");
      else showTrumpMsg(`${players[caller].id} is Dealer. AI picks trump now.`);
    } else {
      showTrumpMsg(`Trump: ${trumpSuit} (${suitName(trumpSuit)}).`);
    }
  }

  function wireTrumpButtons(){
    if (!trumpPanelEl) return;
    const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
    btns.forEach(b=>{
      b.addEventListener("click", ()=>{
        if (phase!=="TRUMP_PICK") return;
        if (trumpSuit) return;
        const caller = computeTrumpCallerIndex();
        if (caller !== 2){
          showMsg("Only the Dealer picks trump.");
          return;
        }
        const suit = b.getAttribute("data-trump");
        if (!SUITS.includes(suit)) return;
        setTrump(suit);
        showMsg(`You picked trump: ${suit} (${suitName(suit)}).`);
        moveToPlay();
      });
    });
  }

  function moveToTrumpPick(){
    setPhase("TRUMP_PICK");
    renderTrumpPickStatus();
    render();

    const caller = computeTrumpCallerIndex();
    if (caller !== 2){
      const s = aiChooseTrumpFromOwnHand(caller);
      setTrump(s);
      showMsg(`${players[caller].id} picked trump: ${s} (${suitName(s)}).`);
      moveToPlay();
    } else {
      showMsg("Pick trump.");
    }
  }

  // ---------- Play Rules ----------
  function hasNonTrump(playerIndex){
    return players[playerIndex].hand.some(c => !isTrumpCard(c, trumpSuit));
  }

  function illegalReason(playerIndex, cardStr){
    // must be in PLAY and correct turn
    if (phase !== "PLAY") return "Not in PLAY phase yet.";
    if (playerIndex !== turnIndex) return "Not your turn.";

    // Trick 1 lead must be 2C if you have it AND you're leading
    if (trickNumber===1 && trick.length===0 && players[playerIndex].hand.includes(CARD_OPEN_LEAD)){
      if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
    }

    // Trump lead restriction: cannot lead trump until trumpOpen, unless you have only trump left.
    if (trick.length===0 && trumpSuit && !trumpOpen){
      const isTrump = isTrumpCard(cardStr, trumpSuit);
      if (isTrump && hasNonTrump(playerIndex)) return "Trump not open. Lead a non-trump card.";
    }

    // follow suit
    if (trick.length>0){
      const must = leadSuit;
      const hasSuit = players[playerIndex].hand.some(c => cardSuitForFollow(c, trumpSuit) === must);
      if (hasSuit && cardSuitForFollow(cardStr, trumpSuit) !== must){
        return `You must follow suit: ${must}.`;
      }
    }

    return "";
  }

  function setLeadSuitFromFirstCard(cardStr){
    leadSuit = cardSuitForFollow(cardStr, trumpSuit);
  }

  function updateTrumpOpen(cardStr){
    if (!trumpOpen && isTrumpCard(cardStr, trumpSuit)) trumpOpen = true;
  }

  function cardPower(cardStr){
    if (cardStr===CARD_BIG_JOKER) return 1000000;
    if (cardStr===CARD_LITTLE_JOKER) return 900000;
    const c = parseCard(cardStr, trumpSuit);
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
      const v = parseCard(t.cardStr, trumpSuit).value;
      if (v > bestV){ bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi;
  }

  function clearTrickForNext(winnerIndex){
    trick = [];
    leadSuit = null;
    leaderIndex = winnerIndex;
    turnIndex = winnerIndex;
  }

  function roundIsOver(){
    return players.every(p => p.hand.length===0) && trick.length===0;
  }

  // ---------- AI Move (simple: always try to win, but still follows rules) ----------
  function legalIndexesFor(playerIndex){
    const hand = players[playerIndex].hand;

    // Trick 1 forced lead
    if (trickNumber===1 && trick.length===0 && hand.includes(CARD_OPEN_LEAD)){
      return hand.map((c,i)=>({c,i})).filter(x=>x.c===CARD_OPEN_LEAD).map(x=>x.i);
    }

    // lead trump restriction
    if (trick.length===0 && trumpSuit && !trumpOpen){
      const nonTrump = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c,trumpSuit)).map(x=>x.i);
      if (nonTrump.length) return nonTrump;
      return hand.map((_,i)=>i);
    }

    // follow suit
    if (trick.length>0){
      const suited = hand.map((c,i)=>({c,i})).filter(x=>cardSuitForFollow(x.c,trumpSuit)===leadSuit).map(x=>x.i);
      if (suited.length) return suited;
      return hand.map((_,i)=>i);
    }

    return hand.map((_,i)=>i);
  }

  function aiChooseIndex(playerIndex){
    const legal = legalIndexesFor(playerIndex);
    const hand = players[playerIndex].hand;

    // If trying to win: pick the move with highest immediate trick power if it can win; else dump lowest.
    let bestWinIdx = null;
    let bestWinPower = -Infinity;

    for (const idx of legal){
      const card = hand[idx];
      const temp = trick.concat([{playerIndex, cardStr:card}]);

      let winnerIfNow;
      if (temp.length===3){
        // full trick would resolve, but AI is playing mid-trick too; approximate:
        // assume winner among current temp only
        const anyTrump = temp.some(t=>isTrumpCard(t.cardStr,trumpSuit));
        if (anyTrump){
          let bestPi=temp[0].playerIndex, bestP=-1;
          for (const t of temp){
            if (!isTrumpCard(t.cardStr,trumpSuit)) continue;
            const p=cardPower(t.cardStr);
            if (p>bestP){bestP=p; bestPi=t.playerIndex;}
          }
          winnerIfNow=bestPi;
        } else {
          let bestPi=temp[0].playerIndex, bestV=-1;
          for (const t of temp){
            if (cardSuitForFollow(t.cardStr,trumpSuit)!==leadSuit) continue;
            const v=parseCard(t.cardStr,trumpSuit).value;
            if (v>bestV){bestV=v; bestPi=t.playerIndex;}
          }
          winnerIfNow=bestPi;
        }
      } else {
        // mid trick: choose highest power if it could potentially win later
        winnerIfNow = null;
      }

      const pwr = cardPower(card);
      if (winnerIfNow===playerIndex && pwr>bestWinPower){
        bestWinPower=pwr;
        bestWinIdx=idx;
      }
    }

    if (bestWinIdx!==null) return bestWinIdx;

    // dump lowest value among legal
    let best = legal[0];
    let bestVal = Infinity;
    for (const idx of legal){
      const card = hand[idx];
      const v = isJoker(card) ? 999 : (parseCard(card,trumpSuit).value + (isTrumpCard(card,trumpSuit)?50:0));
      if (v < bestVal){ bestVal=v; best=idx; }
    }
    return best;
  }

  // ---------- Play Card ----------
  function playCard(playerIndex, handIdx){
    const cardStr = players[playerIndex].hand.splice(handIdx,1)[0];
    if (!cardStr) return;

    if (trick.length===0) setLeadSuitFromFirstCard(cardStr);
    trick.push({ playerIndex, cardStr });

    updateTrumpOpen(cardStr);

    // next turn
    turnIndex = (turnIndex+1)%3;
    render();
    maybeContinue();
  }

  // ---------- Start Play ----------
  function startTrickOne(){
    trick=[];
    leadSuit=null;
    trickNumber=1;

    trumpOpen = (trumpSuit==="C");

    // leader is whoever has 2C
    let whoHas2C = 0;
    for (let pi=0; pi<3; pi++){
      if (players[pi].hand.includes(CARD_OPEN_LEAD)){ whoHas2C = pi; break; }
    }
    leaderIndex = whoHas2C;
    turnIndex = whoHas2C;

    render();
    maybeContinue();
  }

  function moveToPlay(){
    setPhase("PLAY");
    showMsg("PLAY begins. Trick 1 starts now.");
    startTrickOne();
  }

  function maybeContinue(){
    if (phase!=="PLAY") return;

    // Trick complete
    if (trick.length===3){
      lockInput=true;
      setTimeout(()=>{
        const winner = evaluateTrickWinner();
        players[winner].tricks += 1;
        showMsg(`${players[winner].id} wins the trick.`);
        render();

        setTimeout(()=>{
          clearTrickForNext(winner);
          trickNumber += 1;
          lockInput=false;
          render();

          if (roundIsOver()){
            // Compute plucks for NEXT hand
            computePlucksEarnedAndSuffered();
            pendingPluckQueue = buildPluckQueueFromScores();

            showMsg("Hand complete. Starting next hand...");
            setTimeout(()=>{
              startHandFlow();
            }, 650);
            return;
          }

          maybeContinue();
        }, 350);
      }, 250);
      return;
    }

    // AI turns
    if (turnIndex !== 2 && !lockInput){
      lockInput=true;
      setTimeout(()=>{
        const idx = aiChooseIndex(turnIndex);
        playCard(turnIndex, idx);
        lockInput=false;
        render();
      }, 260);
    }
  }

  // ---------- Plucks ----------
  function computePlucksEarnedAndSuffered(){
    for (const p of players){
      p.plucksEarned = Math.max(0, p.tricks - p.quota);
      p.plucksSuffered = Math.max(0, p.quota - p.tricks);
    }
  }

  function pluckerOrder(){
    // high earned first. ties: dealer, left, right
    const tiebreak=[dealerIndex, leftOf(dealerIndex), rightOf(dealerIndex)];
    const idx=[0,1,2];
    idx.sort((a,b)=>{
      const da=players[a].plucksEarned, db=players[b].plucksEarned;
      if (db!==da) return db-da;
      return tiebreak.indexOf(a)-tiebreak.indexOf(b);
    });
    return idx.filter(i=>players[i].plucksEarned>0);
  }

  function victimOrder(){
    const tiebreak=[dealerIndex, leftOf(dealerIndex), rightOf(dealerIndex)];
    const idx=[0,1,2];
    idx.sort((a,b)=>{
      const da=players[a].plucksSuffered, db=players[b].plucksSuffered;
      if (db!==da) return db-da;
      return tiebreak.indexOf(a)-tiebreak.indexOf(b);
    });
    return idx.filter(i=>players[i].plucksSuffered>0);
  }

  function buildPluckQueueFromScores(){
    const queue=[];
    const pluckers=pluckerOrder();
    const victims=victimOrder();

    const remainingEarned=new Map(pluckers.map(i=>[i,players[i].plucksEarned]));
    const remainingSuffered=new Map(victims.map(i=>[i,players[i].plucksSuffered]));

    for (const plucker of pluckers){
      while ((remainingEarned.get(plucker)||0)>0){
        const victim = victims
          .filter(v => (remainingSuffered.get(v)||0)>0)
          .sort((a,b)=>(remainingSuffered.get(b)||0)-(remainingSuffered.get(a)||0))[0];
        if (victim===undefined) break;

        queue.push({ pluckerIndex: plucker, pluckeeIndex: victim });

        remainingEarned.set(plucker,(remainingEarned.get(plucker)||0)-1);
        remainingSuffered.set(victim,(remainingSuffered.get(victim)||0)-1);
      }
    }
    return queue;
  }

  function removeCardFromHand(playerIndex, cardStr){
    const i = players[playerIndex].hand.indexOf(cardStr);
    if (i>=0) players[playerIndex].hand.splice(i,1);
  }

  function lowestOfSuitNonJoker(playerIndex, suit){
    const cards = players[playerIndex].hand.filter(c=>!isJoker(c) && c.slice(-1)===suit);
    if (!cards.length) return null;
    cards.sort((a,b)=>(RANK_VALUE[a.slice(0,-1)]||0)-(RANK_VALUE[b.slice(0,-1)]||0));
    return cards[0];
  }

  function highestOfSuitNonJoker(playerIndex, suit){
    const cards = players[playerIndex].hand.filter(c=>!isJoker(c) && c.slice(-1)===suit);
    if (!cards.length) return null;
    cards.sort((a,b)=>(RANK_VALUE[b.slice(0,-1)]||0)-(RANK_VALUE[a.slice(0,-1)]||0));
    return cards[0];
  }

  function pairKey(pluckerI, pluckeeI){ return `${pluckerI}-${pluckeeI}`; }
  function markPluckSuitUsed(pluckerI, pluckeeI, suit){
    const key = pairKey(pluckerI, pluckeeI);
    if (!pluckSuitUsedByPair.has(key)) pluckSuitUsedByPair.set(key,new Set());
    pluckSuitUsedByPair.get(key).add(suit);
  }

  function availablePluckSuits(pluckerI, pluckeeI){
    const used = pluckSuitUsedByPair.get(pairKey(pluckerI,pluckeeI)) || new Set();
    const suits=[];
    for (const s of SUITS){
      if (used.has(s)) continue;
      if (!lowestOfSuitNonJoker(pluckerI,s)) continue;
      suits.push(s);
    }
    return suits;
  }

  function attemptPluck(pluckerI, pluckeeI, suit){
    const giveLow = lowestOfSuitNonJoker(pluckerI, suit);
    if (!giveLow) return { ok:false, reason:`Plucker has no ${suit}.` };

    const takeHigh = highestOfSuitNonJoker(pluckeeI, suit);
    if (!takeHigh) return { ok:false, reason:`Victim has no ${suit} to return.` };

    removeCardFromHand(pluckerI,giveLow);
    removeCardFromHand(pluckeeI,takeHigh);

    players[pluckerI].hand.push(takeHigh);
    players[pluckeeI].hand.push(giveLow);

    markPluckSuitUsed(pluckerI, pluckeeI, suit);

    return { ok:true, giveLow, takeHigh };
  }

  function clearPluckChoicesUI(){ if (pluckChoicesEl) pluckChoicesEl.innerHTML=""; }

  function renderPluckStatus(){
    clearPluckChoicesUI();

    if (!pluckQueue.length){
      showPluckMsg("No plucks to process. Moving to trump pick...");
      if (pluckNextBtn) pluckNextBtn.disabled = true;
      return;
    }
    if (!activePluck) activePluck = pluckQueue[0];

    const pluckerI = activePluck.pluckerIndex;
    const pluckeeI = activePluck.pluckeeIndex;

    const suits = availablePluckSuits(pluckerI, pluckeeI);

    // You pluck = suit buttons
    if (pluckerI === 2){
      if (pluckNextBtn) pluckNextBtn.disabled = true;

      if (!suits.length){
        showPluckMsg("You have no suit to attempt. This pluck is skipped.");
        return;
      }

      showPluckMsg(`You are plucking ${players[pluckeeI].id}. Choose a suit. Wrong suit attempt = LOST.`);

      for (const s of suits){
        const give = lowestOfSuitNonJoker(pluckerI, s);
        const btn=document.createElement("button");
        btn.className="btn";
        btn.textContent = `${s} (${suitName(s)}) • Give: ${give || "?"}`;
        btn.addEventListener("click", ()=>{
          const res = attemptPluck(pluckerI, pluckeeI, s);
          if (!res.ok){
            markPluckSuitUsed(pluckerI, pluckeeI, s);
            showPluckMsg(`FAILED (${res.reason}). Pluck LOST.`);
          } else {
            showPluckMsg(`Success: gave ${res.giveLow}, received ${res.takeHigh}.`);
          }
          pluckQueue.shift();
          activePluck=null;
          render();

          if (!pluckQueue.length){
            setTimeout(()=>moveToTrumpPick(), 350);
          }
        });
        pluckChoicesEl && pluckChoicesEl.appendChild(btn);
      }
      return;
    }

    // AI pluck via Run Next
    if (pluckNextBtn) pluckNextBtn.disabled = false;
    showPluckMsg(`${players[pluckerI].id} is plucking ${players[pluckeeI].id}. Click Run Next Pluck.`);
  }

  function runOnePluck(){
    if (phase!=="PLUCK") return;
    if (!pluckQueue.length) return;
    if (!activePluck) activePluck = pluckQueue[0];

    const pluckerI=activePluck.pluckerIndex;
    const pluckeeI=activePluck.pluckeeIndex;

    if (pluckerI===2){
      showPluckMsg("Choose a suit button to pluck.");
      return;
    }

    const suits = availablePluckSuits(pluckerI, pluckeeI);
    if (!suits.length){
      showPluckMsg("No available suit. Skipping pluck.");
      pluckQueue.shift(); activePluck=null;
      render();
      if (!pluckQueue.length) setTimeout(()=>moveToTrumpPick(), 300);
      return;
    }

    // blind heuristic: pick suit where you give lowest possible
    let bestSuit=suits[0], bestVal=999;
    for (const s of suits){
      const low=lowestOfSuitNonJoker(pluckerI,s);
      const v=low ? (RANK_VALUE[low.slice(0,-1)]||999) : 999;
      if (v<bestVal){ bestVal=v; bestSuit=s; }
    }

    const res = attemptPluck(pluckerI, pluckeeI, bestSuit);
    if (!res.ok){
      markPluckSuitUsed(pluckerI, pluckeeI, bestSuit);
      showPluckMsg(`${players[pluckerI].id} FAILED (${res.reason}). Pluck LOST.`);
    } else {
      showPluckMsg(`${players[pluckerI].id} plucked ${bestSuit}: gave ${res.giveLow}, got ${res.takeHigh}.`);
    }

    pluckQueue.shift();
    activePluck=null;
    render();

    if (!pluckQueue.length) setTimeout(()=>moveToTrumpPick(), 350);
  }

  function moveToPluck(){
    setPhase("PLUCK");
    showMsg("Pluck phase begins (Hand 2+).");
    render();
  }

  // ---------- Events ----------
  wireTrumpButtons();

  on(pluckNextBtn, "click", runOnePluck);

  on(pickBtn, "click", doPickDealer);
  on(pickReBtn, "click", doPickDealer);
  on(pickOkBtn, "click", ()=>{
    if (phase!=="PICK_DEALER") return;
    if (!pickCards) return;
    // start Hand 1
    pickOkBtn.disabled = true;
    pickReBtn.disabled = true;
    pickBtn.disabled = true;

    showMsg("Starting Hand 1...");
    startHandFlow();
  });

  on(resetBtn, "click", ()=>{
    // full reset
    handNumber = 0;
    pendingPluckQueue = null;
    pluckQueue = [];
    activePluck = null;
    pluckSuitUsedByPair = new Map();
    trumpSuit = null;
    trumpOpen = false;
    players.forEach(p=>{
      p.hand=[]; p.tricks=0; p.plucksEarned=0; p.plucksSuffered=0;
    });
    dealerIndex = 0;
    applyQuotas();
    clearPickUI();
    if (pickBtn) pickBtn.disabled=false;
    setPhase("PICK_DEALER");
    showMsg("Reset complete. Pick dealer to start.");
    render();
  });

  // ---------- Boot ----------
  applyQuotas();
  clearPickUI();
  setPhase("PICK_DEALER");
  showMsg("Pick dealer to start.");
  render();

})();
