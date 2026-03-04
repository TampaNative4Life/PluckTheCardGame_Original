/* =========================================================
   Demo2 UI — v1
   - Renders engine state
   - Sends events to engine
   - Keeps your current presentation
   ========================================================= */

(function(){
  "use strict";

  const $ = (id) => document.getElementById(id);

  const elTrump = $("trumpLabel");
  const elBooks = $("booksSummary");
  const elReset = $("resetBtn");

  const elYouHand = $("youHand");
  const elTrickSlots = $("trickSlots");

  const SUITS = ["S","H","D","C"];
  const isRed = s => (s==="H" || s==="D");
  const suitSymbol = s => (s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣");

  let state = PluckEngine.initialState();

  function dispatch(evt){
    state = PluckEngine.reduce(state, evt);
    render();
    // let AI play until it is YOU
    pumpAI();
  }

  function pumpAI(){
    // run AI steps quickly but safely
    let guard = 0;
    while (state.turn !== 2 && guard < 6){
      state = PluckEngine.reduce(state, { type:"AI_STEP" });
      guard++;
    }
    render();
  }

  function setHud(){
    if (elTrump){
      const t = (SUITS.includes(state.trumpSuit) ? state.trumpSuit : "(not set)");
      elTrump.textContent = t;
      elTrump.classList.toggle("muted", !SUITS.includes(state.trumpSuit));
    }
    if (elBooks){
      elBooks.textContent = `YOU ${state.books.YOU} • AI2 ${state.books.AI2} • AI3 ${state.books.AI3}`;
    }
  }

  function makeMiniFace(card){
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cardFaceMini";

    const suit = card.slice(-1);
    const rank = card.slice(0,-1);

    el.classList.add(isRed(suit) ? "red" : "black");
    el.textContent = rank + suitSymbol(suit);

    el.addEventListener("click", () => {
      // only allow your play
      if (state.turn !== 2) return;
      dispatch({ type:"PLAY_CARD", pi:2, card });
    });

    return el;
  }

  function renderHand(){
    if (!elYouHand) return;

    const sorted = PluckEngine.sortHand(state.players[2].hand, state.trumpSuit);

    elYouHand.innerHTML = "";
    elYouHand.classList.toggle("tight", sorted.length >= 14);

    // spacers so first/last card are NEVER clipped by rounded container
    const leftPad = document.createElement("div");
    leftPad.className = "handEdgePad";
    const rightPad = document.createElement("div");
    rightPad.className = "handEdgePad";

    elYouHand.appendChild(leftPad);
    for (const c of sorted) elYouHand.appendChild(makeMiniFace(c));
    elYouHand.appendChild(rightPad);
  }

  function renderTrick(){
    if (!elTrickSlots) return;

    elTrickSlots.innerHTML = "";

    if (!state.trick.length){
      const h = document.createElement("div");
      h.className = "slotHint";
      h.textContent = "(empty)";
      elTrickSlots.appendChild(h);
      return;
    }

    for (const t of state.trick){
      const wrap = document.createElement("div");
      wrap.className = "trickSlot";

      const name = document.createElement("div");
      name.className = "trickWho";
      name.textContent = state.players[t.pi].id;

      const face = document.createElement("div");
      face.className = "cardFaceMini trickMini";
      const suit = t.card.slice(-1);
      const rank = t.card.slice(0,-1);
      face.classList.add(isRed(suit) ? "red" : "black");
      face.textContent = rank + suitSymbol(suit);

      wrap.appendChild(name);
      wrap.appendChild(face);
      elTrickSlots.appendChild(wrap);
    }
  }

  function render(){
    setHud();
    renderHand();
    renderTrick();
  }

  // events
  elReset?.addEventListener("click", () => dispatch({ type:"RESET" }));

  // boot
  dispatch({ type:"RESET" });

})();
