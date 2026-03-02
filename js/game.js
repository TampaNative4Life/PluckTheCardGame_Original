// Pluck Web Demo v19.1 — FULL REPLACEMENT (tablet-safe clicks)
//
// Fixes:
// - Cards blink but won't play: replaced onclick with pointerup + robust state checks.
// - AI auto-plays until it's YOUR TURN.
// - First hand: NO PLUCK phase (DEAL -> TRUMP PICK -> PLAY).
// - Later hands: DEAL -> PLUCK -> TRUMP PICK -> PLAY (pluck UI included but can be left unused for now).
// - Initial dealer pick: show all 3 cards + OK; tie for lowest => repick.
// - Shows Ace of trump in sidebar if trumpAceSlot exists.
// - Phase chips highlight by phase.
//
// Notes:
// - This file draws cards (no images). If you add images later, we can swap makeCardFace().

(() => {
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const on = (el, evt, fn, opts) => el && el.addEventListener(evt, fn, opts || false);
  const setText = (el, txt) => { if (el) el.textContent = txt; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const log = (...a) => console.log("[Pluck v19.1]", ...a);

  function showMsg(txt) { setText($("msg"), txt); }
  function showErr(txt) {
    setText($("msg"), "ERROR: " + txt);
    console.error("[Pluck v19.1 ERROR]", txt);
  }

  window.addEventListener("error", (e) => showErr(e?.message || "Unknown script error"));

  // ---------- required DOM ----------
  const handEl = $("hand");
  const trickEl = $("trick");
  const resetBtn = $("resetBtn");
  if (!handEl || !trickEl || !resetBtn) {
    showErr("Missing required elements: #hand, #trick, #resetBtn must exist in game.html");
    return;
  }

  // ---------- optional DOM ----------
  const ai2HandEl = $("ai2Hand");
  const ai3HandEl = $("ai3Hand");

  const phaseLabelEl = $("phaseLabel");
  const turnBannerEl = $("turnBanner");

  const trumpLabelEl = $("trumpLabel");
  const trumpOpenLabelEl = $("trumpOpenLabel");

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

  const trumpPanelEl = $("trumpPanel");
  const trumpStatusEl = $("trumpStatus");

  const pluckPanelEl = $("pluckPanel");
  const pluckStatusEl = $("pluckStatus");
  const pluckChoicesEl = $("pluckChoices");
  const pluckNextBtn = $("pluckNextBtn");

  // Sidebar: dealer pick
  const pickBtn = $("pickBtn");
  const pickOkBtn = $("pickOkBtn");
  const pickReBtn = $("pickReBtn");
  const pickStatusEl = $("pickStatus");
  const pickAI2El = $("pickAI2");
  const pickAI3El = $("pickAI3");
  const pickYOUEl = $("pickYOU");
  const dealerLabelEl = $("dealerLabel");
  const dealerBannerEl = $("dealerBanner");

  // Sidebar: trump ace
  const trumpAceSlotEl = $("trumpAceSlot");

  // ---------- constants ----------
  const TOTAL_TRICKS = 17;

  // Pluck deck contents for DEAL + PLAY (51 cards)
  const SUITS = ["S", "H", "D", "C"];
  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

  // Dealer-pick deck (we’ll just use standard ranks, no jokers, no 2)
  const PICK_RANKS = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const PICK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14 };

  const AI_DELAY_MS = 260;
  const RESOLVE_DELAY_MS = 240;
  const BETWEEN_TRICKS_MS = 220;

  function suitName(s) { return s==="S"?"Spades":s==="H"?"Hearts":s==="D"?"Diamonds":"Clubs"; }
  function suitSymbol(s){ return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣"; }
  function isRedSuit(s){ return s==="H" || s==="D"; }
  function isJoker(cs) { return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }

  // ---------- deck ----------
  function makePluckDeck51() {
    const deck = [];
    for (const s of SUITS) for (const r of RANKS_NO_2) deck.push(r + s);
    deck.push("2C");
    deck.push(CARD_BIG_JOKER);
    deck.push(CARD_LITTLE_JOKER);
    return deck;
  }

  function makePickDeck() {
    const deck = [];
    for (const s of SUITS) for (const r of PICK_RANKS) deck.push(r + s);
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
    if (cs === CARD_BIG_JOKER) return { raw:cs, kind:"JOKER", rank:"BJ", suit:null, value:1000 };
    if (cs === CARD_LITTLE_JOKER) return { raw:cs, kind:"JOKER", rank:"LJ", suit:null, value:900 };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    return { raw:cs, kind:"NORMAL", rank, suit, value: RANK_VALUE[rank] };
  }

  // During PLAY, jokers behave as trump suit. Before trump, joker suit is null.
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
    { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7 },
    { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6 },
    { id:"YOU", name:"You",            hand:[], tricks:0, quota:4 }
  ];

  function leftOf(i) { return (i + 1) % 3; }
  function rightOf(i) { return (i + 2) % 3; }

  let dealerIndex = 0;      // set by pick
  let leaderIndex = 0;      // leads current trick
  let turnIndex = 0;        // whose turn to play
  let leadSuit = null;
  let trick = [];
  let lockInput = false;

  let trickNumber = 0;
  let trumpSuit = null;
  let trumpOpen = false;

  let handCount = 0; // 0 = first hand (NO pluck phase)

  // Phases
  // PICK_DEALER -> DEAL -> (PLUCK?) -> TRUMP_PICK -> PLAY
  let phase = "PICK_DEALER";

  // ---------- UI: phases ----------
  function highlightPhaseChip(which) {
    const all = [pDeal,pPluck,pTrump,pPlay];
    all.forEach(x => x && x.classList.remove("activeChip"));
    if (which === "DEAL") pDeal && pDeal.classList.add("activeChip");
    if (which === "PLUCK") pPluck && pPluck.classList.add("activeChip");
    if (which === "TRUMP_PICK") pTrump && pTrump.classList.add("activeChip");
    if (which === "PLAY") pPlay && pPlay.classList.add("activeChip");
  }

  function setPhase(next) {
    phase = next;
    setText(phaseLabelEl, next);
    if (next === "DEAL") highlightPhaseChip("DEAL");
    if (next === "PLUCK") highlightPhaseChip("PLUCK");
    if (next === "TRUMP_PICK") highlightPhaseChip("TRUMP_PICK");
    if (next === "PLAY") highlightPhaseChip("PLAY");

    if (pluckPanelEl) pluckPanelEl.style.display = (next === "PLUCK") ? "block" : "none";
    if (trumpPanelEl) trumpPanelEl.style.display = (next === "TRUMP_PICK") ? "block" : "none";
  }

  // ---------- card faces (drawn, reliable taps) ----------
  function makeCardFace(cardStr, disabled=false) {
    const el = document.createElement("div");
    el.className = "cardFace" + (disabled ? " disabled" : "");

    // make sure tablet taps register on the parent
    el.style.touchAction = "manipulation";

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

  function clearEl(el) { if (el) el.innerHTML = ""; }

  function renderTrumpAce() {
    if (!trumpAceSlotEl) return;
    clearEl(trumpAceSlotEl);
    if (!trumpSuit) { trumpAceSlotEl.textContent = "(none)"; return; }
    const ace = "A" + trumpSuit;
    trumpAceSlotEl.appendChild(makeCardFace(ace, true));
  }

  // ---------- game rules: legal moves ----------
  function hasNonTrump(pi) {
    return players[pi].hand.some(c => !isTrumpCard(c, trumpSuit));
  }

  function illegalReason(pi, cardStr) {
    // Trick 1 lead must be 2C if player has it
    if (trickNumber === 1 && trick.length === 0 && players[pi].hand.includes(CARD_OPEN_LEAD)) {
      if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
    }

    // If not trump open, no trump lead if you have non-trump
    if (trick.length === 0 && !trumpOpen && trumpSuit && trumpSuit !== "C") {
      if (isTrumpCard(cardStr, trumpSuit) && hasNonTrump(pi)) return "Trump not open. Lead a non-trump card.";
    }

    // Must follow suit if possible
    if (trick.length > 0 && leadSuit) {
      const hasSuit = players[pi].hand.some(c => cardSuitForFollow(c, trumpSuit) === leadSuit);
      if (hasSuit && cardSuitForFollow(cardStr, trumpSuit) !== leadSuit) {
        return `You must follow suit: ${leadSuit}.`;
      }
    }
    return null;
  }

  function legalIndexesFor(pi) {
    const hand = players[pi].hand;

    // Trick 1 lead: must play 2C if you have it
    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)) {
      return hand.map((c,i)=>({c,i})).filter(x=>x.c===CARD_OPEN_LEAD).map(x=>x.i);
    }

    // Lead: if trump not open and you have non-trump, you cannot lead trump
    if (trick.length === 0 && !trumpOpen && trumpSuit && trumpSuit !== "C") {
      const nonTrump = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c, trumpSuit)).map(x=>x.i);
      if (nonTrump.length) return nonTrump;
      return hand.map((_,i)=>i);
    }

    // Follow: must follow suit if possible
    if (trick.length > 0 && leadSuit) {
      const suited = hand.map((c,i)=>({c,i})).filter(x => cardSuitForFollow(x.c, trumpSuit) === leadSuit).map(x=>x.i);
      return suited.length ? suited : hand.map((_,i)=>i);
    }

    return hand.map((_,i)=>i);
  }

  // ---------- trick winner ----------
  function cardPower(cardStr) {
    if (cardStr === CARD_BIG_JOKER) return 1000000;
    if (cardStr === CARD_LITTLE_JOKER) return 900000;

    const c = parseCard(cardStr);
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

    // no trump: highest in lead suit wins
    let bestPi = trick[0].playerIndex;
    let bestV = -1;
    for (const t of trick) {
      if (cardSuitForFollow(t.cardStr, trumpSuit) !== leadSuit) continue;
      const v = parseCard(t.cardStr).value;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi;
  }

  // ---------- render ----------
  function render() {
    // top labels
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

    setText(dealerLabelEl, players[dealerIndex]?.id || "(not set)");
    setText(dealerBannerEl, players[dealerIndex]?.id || "(not set)");

    // hidden hands display
    if (ai2HandEl) ai2HandEl.textContent = players[0].hand.map(()=>"🂠").join(" ");
    if (ai3HandEl) ai3HandEl.textContent = players[1].hand.map(()=>"🂠").join(" ");

    // banner
    const banner =
      `Phase: ${phase} • Dealer: ${players[dealerIndex].id} • Leader: ${players[leaderIndex].id} • Turn: ${players[turnIndex].id} • Lock: ${lockInput ? "LOCKED" : "OPEN"}`;
    setText(turnBannerEl, banner);

    // trick
    clearEl(trickEl);
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

    // YOUR hand (interactive)
    clearEl(handEl);

    const isYourTurnToPlay = (phase === "PLAY" && turnIndex === 2 && !lockInput);
    const legal = isYourTurnToPlay ? legalIndexesFor(2) : [];

    players[2].hand.forEach((cardStr, idx) => {
      const disabled = !isYourTurnToPlay ? true : !legal.includes(idx);

      const face = makeCardFace(cardStr, disabled);
      face.dataset.idx = String(idx);

      // TABLET-SAFE: pointerup
      on(face, "pointerup", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        if (phase !== "PLAY") { showMsg("Not in PLAY phase yet."); return; }
        if (lockInput) { showMsg("Wait… resolving."); return; }
        if (turnIndex !== 2) { showMsg("Not your turn."); return; }

        const i = Number(face.dataset.idx);
        const card = players[2].hand[i];
        if (!card) return;

        const legalNow = legalIndexesFor(2);
        if (!legalNow.includes(i)) {
          const why = illegalReason(2, card) || "Illegal play.";
          showMsg(why);
          return;
        }

        playCard(2, i);
      }, { passive:false });

      handEl.appendChild(face);
    });

    // optional panels
    if (phase === "TRUMP_PICK") renderTrumpPickStatus();
    if (phase === "PLUCK") renderPluckStatus();

    renderTrumpAce();
  }

  // ---------- play card ----------
  function setLeadSuitFromFirst(cardStr) {
    leadSuit = cardSuitForFollow(cardStr, trumpSuit);
  }
  function updateTrumpOpen(cardStr) {
    if (!trumpOpen && trumpSuit && isTrumpCard(cardStr, trumpSuit)) trumpOpen = true;
  }

  function playCard(pi, handIdx) {
    const cardStr = players[pi].hand.splice(handIdx, 1)[0];
    if (!cardStr) return;

    if (trick.length === 0) setLeadSuitFromFirst(cardStr);

    trick.push({ playerIndex: pi, cardStr });
    updateTrumpOpen(cardStr);

    // advance turn
    turnIndex = (turnIndex + 1) % 3;

    render();
    maybeContinue();
  }

  function clearTrickToWinner(winner) {
    trick = [];
    leadSuit = null;
    leaderIndex = winner;
    turnIndex = winner;
  }

  function roundIsOver() {
    return players.every(p => p.hand.length === 0) && trick.length === 0;
  }

  // ---------- AI choice (simple: always tries to win) ----------
  function wouldWinIfPlayed(pi, cardStr) {
    const temp = trick.concat([{ playerIndex: pi, cardStr }]);

    const anyTrump = temp.some(t => isTrumpCard(t.cardStr, trumpSuit));
    if (anyTrump) {
      let bestPi = temp[0].playerIndex;
      let bestP = -1;
      for (const t of temp) {
        if (!isTrumpCard(t.cardStr, trumpSuit)) continue;
        const p = cardPower(t.cardStr);
        if (p > bestP) { bestP = p; bestPi = t.playerIndex; }
      }
      return bestPi === pi;
    }

    // no trump: lead suit highest
    const ls = leadSuit;
    let bestPi = temp[0].playerIndex;
    let bestV = -1;
    for (const t of temp) {
      if (cardSuitForFollow(t.cardStr, trumpSuit) !== ls) continue;
      const v = parseCard(t.cardStr).value;
      if (v > bestV) { bestV = v; bestPi = t.playerIndex; }
    }
    return bestPi === pi;
  }

  function chooseAiIndex(pi) {
    const legal = legalIndexesFor(pi);
    const hand = players[pi].hand;

    // Prefer winning if possible, otherwise dump lowest legal.
    const winning = [];
    for (const idx of legal) {
      const c = hand[idx];
      if (trick.length === 0) {
        // leading: we’ll just score by strength but avoid wasting BJ/LJ early unless needed
        const pow = cardPower(c);
        winning.push({ idx, score: pow - (isJoker(c) ? 25000 : 0) });
      } else {
        if (wouldWinIfPlayed(pi, c)) winning.push({ idx, score: cardPower(c) });
      }
    }

    if (trick.length > 0 && winning.length) {
      winning.sort((a,b)=>a.score-b.score); // win cheap
      return winning[0].idx;
    }

    // not guaranteed win: dump lowest legal
    let best = legal[0];
    let bestScore = Infinity;
    for (const idx of legal) {
      const c = hand[idx];
      const pow = cardPower(c);
      const score = pow + (isJoker(c) ? 200000 : 0); // keep jokers if we can
      if (score < bestScore) { bestScore = score; best = idx; }
    }
    return best;
  }

  // ---------- main loop ----------
  function maybeContinue() {
    if (phase !== "PLAY") return;

    // trick complete?
    if (trick.length === 3) {
      lockInput = true;
      setTimeout(() => {
        const winner = evaluateTrickWinner();
        players[winner].tricks += 1;
        showMsg(`${players[winner].id} wins the trick.`);
        render();

        setTimeout(() => {
          clearTrickToWinner(winner);
          trickNumber += 1;
          lockInput = false;
          render();

          if (roundIsOver()) {
            endOfHand();
            return;
          }

          maybeContinue();
        }, BETWEEN_TRICKS_MS);
      }, RESOLVE_DELAY_MS);
      return;
    }

    // AI turns
    if (turnIndex !== 2) {
      lockInput = true;
      setTimeout(() => {
        const idx = chooseAiIndex(turnIndex);
        playCard(turnIndex, idx);
        lockInput = false;
        render();
        // keep going until it's YOUR turn or trick resolves
        maybeContinue();
      }, AI_DELAY_MS);
    } else {
      // your turn
      showMsg("Your turn. Tap a card.");
      render();
    }
  }

  // ---------- trump selection ----------
  function setTrump(suit) {
    trumpSuit = suit;
    trumpOpen = (trumpSuit === "C"); // keep your current rule if you want it
    renderTrumpAce();
  }

  function renderTrumpPickStatus() {
    if (!trumpStatusEl) return;
    if (trumpSuit) {
      trumpStatusEl.textContent = `Trump: ${trumpSuit} (${suitName(trumpSuit)}).`;
      return;
    }
    const dealer = players[dealerIndex];
    trumpStatusEl.textContent = (dealerIndex === 2)
      ? `You are Dealer. Select trump now.`
      : `${dealer.id} is Dealer. AI will select trump now.`;
  }

  function aiChooseTrumpFromOwnHand(pi) {
    const suitScore = { S:0, H:0, D:0, C:0 };
    for (const cs of players[pi].hand) {
      if (cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER) {
        suitScore.S += 6; suitScore.H += 6; suitScore.D += 6; suitScore.C += 6;
        continue;
      }
      const suit = cs.slice(-1);
      const rank = cs.slice(0, cs.length-1);
      const v = RANK_VALUE[rank] || 0;
      suitScore[suit] += 2;              // length weight
      if (v >= 11) suitScore[suit] += (v - 10) * 2; // face+ace weight
      else suitScore[suit] += Math.max(0, v - 6) * 0.5;
    }
    let bestSuit = "H", best = -Infinity;
    for (const s of SUITS) {
      if (suitScore[s] > best) { best = suitScore[s]; bestSuit = s; }
    }
    return bestSuit;
  }

  function wireTrumpButtons() {
    if (!trumpPanelEl) return;
    const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
    btns.forEach(b => {
      b.addEventListener("click", () => {
        if (phase !== "TRUMP_PICK") return;
        if (trumpSuit) return;
        if (dealerIndex !== 2) return; // only YOU click when YOU are dealer
        const suit = b.getAttribute("data-trump");
        if (!SUITS.includes(suit)) return;
        setTrump(suit);
        showMsg(`You selected trump: ${suit} (${suitName(suit)}).`);
        moveToPlay();
      });
    });
  }

  function moveToTrumpPick() {
    setPhase("TRUMP_PICK");
    render();

    // AI dealer picks instantly
    if (dealerIndex !== 2) {
      const s = aiChooseTrumpFromOwnHand(dealerIndex);
      setTrump(s);
      showMsg(`${players[dealerIndex].id} selects trump: ${s} (${suitName(s)}).`);
      moveToPlay();
    } else {
      showMsg("You are Dealer. Select trump.");
    }
  }

  function moveToPlay() {
    setPhase("PLAY");
    trick = [];
    leadSuit = null;
    trickNumber = 1;

    // Trick 1 leader is whoever has 2C
    let who = 0;
    for (let pi=0; pi<3; pi++) {
      if (players[pi].hand.includes(CARD_OPEN_LEAD)) { who = pi; break; }
    }
    leaderIndex = who;
    turnIndex = who;

    render();
    maybeContinue(); // auto-run AI until your turn
  }

  // ---------- PLUCK (kept minimal — later hands only) ----------
  function renderPluckStatus() {
    if (!pluckStatusEl) return;
    pluckStatusEl.textContent = "Pluck phase is enabled for later hands (logic can be expanded).";
    if (pluckNextBtn) pluckNextBtn.disabled = true;
    if (pluckChoicesEl) pluckChoicesEl.innerHTML = "";
  }

  function moveToPluckOrTrumpPick() {
    // First hand: skip pluck
    if (handCount === 1) {
      moveToTrumpPick();
      return;
    }
    // Later hands: show pluck phase (we’ll wire full pluck next)
    setPhase("PLUCK");
    showMsg("Pluck phase (later hands). When we finish full pluck logic, it runs here.");
    render();

    // For now, auto-advance to trump pick so the game stays playable
    setTimeout(() => moveToTrumpPick(), 500);
  }

  // ---------- dealing ----------
  function dealNewHand() {
    setPhase("DEAL");

    const deck = shuffle(makePluckDeck51());
    players.forEach(p => { p.hand = []; p.tricks = 0; });

    for (let i=0;i<TOTAL_TRICKS;i++) {
      players[0].hand.push(deck.pop());
      players[1].hand.push(deck.pop());
      players[2].hand.push(deck.pop());
    }

    trumpSuit = null;
    trumpOpen = false;
    trick = [];
    leadSuit = null;
    trickNumber = 0;

    // quotas remain whatever your rotation rules are (we keep your fixed 7/6/4)
    // If you want quota rotation each new deal beyond dealer, we can do that later.

    render();
  }

  function endOfHand() {
    showMsg("Hand over. Click Reset (New Deal) for next hand.");
    // Next hand happens on Reset
  }

  function startNewHandFlow() {
    handCount += 1;
    dealNewHand();

    // After dealing, go to pluck or trump pick depending on hand #
    setTimeout(() => moveToPluckOrTrumpPick(), 250);
  }

  // ---------- initial pick dealer ----------
  function pickValue(cardStr) {
    const suit = cardStr.slice(-1);
    const rank = cardStr.slice(0, cardStr.length-1);
    return PICK_VALUE[rank] || 999;
  }

  function renderPickCard(targetEl, cardStr) {
    if (!targetEl) return;
    clearEl(targetEl);
    if (!cardStr) { targetEl.textContent = "(none)"; return; }
    targetEl.appendChild(makeCardFace(cardStr, true));
  }

  let pickCards = null; // { ai2, ai3, you }

  function doPickDealer() {
    const deck = shuffle(makePickDeck());
    const ai2 = deck.pop();
    const ai3 = deck.pop();
    const you = deck.pop();
    pickCards = { ai2, ai3, you };

    renderPickCard(pickAI2El, ai2);
    renderPickCard(pickAI3El, ai3);
    renderPickCard(pickYOUEl, you);

    const v0 = pickValue(ai2);
    const v1 = pickValue(ai3);
    const v2 = pickValue(you);

    const minV = Math.min(v0,v1,v2);
    const mins = [];
    if (v0 === minV) mins.push(0);
    if (v1 === minV) mins.push(1);
    if (v2 === minV) mins.push(2);

    if (mins.length > 1) {
      setText(pickStatusEl, `Tie for lowest card. Re-pack and pick again.`);
      if (pickOkBtn) pickOkBtn.disabled = true;
      if (pickReBtn) pickReBtn.disabled = false;
      return;
    }

    dealerIndex = mins[0];
    setText(pickStatusEl, `Dealer will be: ${players[dealerIndex].id}. Click OK to start.`);
    setText(dealerLabelEl, players[dealerIndex].id);
    setText(dealerBannerEl, players[dealerIndex].id);

    if (pickOkBtn) pickOkBtn.disabled = false;
    if (pickReBtn) pickReBtn.disabled = true;
  }

  function lockPickButtons(state) {
    if (!pickBtn || !pickOkBtn || !pickReBtn) return;
    if (state === "READY") {
      pickBtn.disabled = false;
      pickOkBtn.disabled = true;
      pickReBtn.disabled = true;
    }
    if (state === "AFTER_PICK_TIE") {
      pickBtn.disabled = true;
      pickOkBtn.disabled = true;
      pickReBtn.disabled = false;
    }
    if (state === "AFTER_PICK_OK") {
      pickBtn.disabled = true;
      pickOkBtn.disabled = true;
      pickReBtn.disabled = true;
    }
  }

  function startFromPickScreen() {
    setPhase("PICK_DEALER");
    highlightPhaseChip(null);
    showMsg("Pick dealer to begin.");
    setText(pickStatusEl, "Click “Pick Cards”.");
    renderPickCard(pickAI2El, null);
    renderPickCard(pickAI3El, null);
    renderPickCard(pickYOUEl, null);
    setText(dealerLabelEl, "(not set)");
    setText(dealerBannerEl, "(not set)");
    pickCards = null;
    lockPickButtons("READY");
    render();
  }

  // ---------- events ----------
  wireTrumpButtons();

  on(pickBtn, "click", () => {
    doPickDealer();
    // set buttons depending on tie/non-tie
    if (!pickOkBtn) return;
    if (pickOkBtn.disabled) lockPickButtons("AFTER_PICK_TIE");
    else pickBtn.disabled = true; // picked successfully, wait for OK
  });

  on(pickReBtn, "click", () => {
    lockPickButtons("READY");
    doPickDealer();
    if (pickOkBtn && pickOkBtn.disabled) lockPickButtons("AFTER_PICK_TIE");
    else pickBtn && (pickBtn.disabled = true);
  });

  on(pickOkBtn, "click", () => {
    lockPickButtons("AFTER_PICK_OK");
    setPhase("DEAL");
    showMsg("Dealer set. Dealing first hand… (no pluck phase on hand 1)");
    handCount = 0;
    startNewHandFlow();
  });

  on(resetBtn, "click", () => {
    if (phase === "PICK_DEALER") {
      startFromPickScreen();
      return;
    }
    showMsg("New deal…");
    startNewHandFlow();
  });

  // ---------- start ----------
  // Ensure we’re not stuck if sidebar elements missing
  if (!pickBtn || !pickOkBtn || !pickReBtn) {
    // No pick UI present — just start immediately with AI2 as dealer.
    dealerIndex = 0;
    setPhase("DEAL");
    handCount = 0;
    showMsg("Pick UI missing; starting game with AI2 dealer.");
    startNewHandFlow();
  } else {
    startFromPickScreen();
  }

  log("Loaded.");
})();
