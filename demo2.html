// js/demo2.ui.js
// Demo2 UI layer (DOM only). Calls Engine only via actions.

(function () {
  "use strict";

  if (!window.Engine) {
    console.error("Engine not loaded. Ensure js/engine.js loads BEFORE js/demo2.ui.js");
    return;
  }

  const $ = (id) => document.getElementById(id);

  // DOM
  const youHandEl = $("youHand");
  const trumpLabelEl = $("trumpLabel");
  const booksSummaryEl = $("booksSummary");
  const resetBtn = $("resetBtn");

  const trickSlotsEl = $("trickSlots"); // optional in your HTML
  const suitParam = new URLSearchParams(location.search).get("trump");

  // Build UI card
  function suitSymbol(s){ return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣"; }
  function isRed(s){ return s==="H" || s==="D"; }

  function makeMiniFace(card){
    const el = document.createElement("div");
    el.className = "cardFaceMini";

    if (card === "BJ" || card === "LJ"){
      el.textContent = card;
      return el;
    }

    const suit = card.slice(-1);
    const rank = card.slice(0,-1);
    el.classList.add(isRed(suit) ? "red" : "black");
    el.textContent = rank + suitSymbol(suit);
    return el;
  }

  // App state (single source of truth)
  let state = Engine.newGame();

  function renderHud(){
    if (trumpLabelEl){
      if (state.trumpSuit) trumpLabelEl.textContent = `${state.trumpSuit} (${Engine.suitName(state.trumpSuit)})`;
      else trumpLabelEl.textContent = "(not set)";
      trumpLabelEl.classList.toggle("muted", !state.trumpSuit);
    }
    if (booksSummaryEl){
      booksSummaryEl.textContent = `YOU ${state.books.YOU} • AI2 ${state.books.AI2} • AI3 ${state.books.AI3}`;
    }
  }

  function renderHand(){
    if (!youHandEl) return;

    const hand = Engine.sortHand(state.players[2].hand, state.trumpSuit);
    youHandEl.innerHTML = "";
    youHandEl.classList.toggle("tight", hand.length >= 14);

    hand.forEach((cardStr) => {
      // Convert display order back to real hand index for PLAY_CARD
      const realIdx = state.players[2].hand.indexOf(cardStr);

      const el = makeMiniFace(cardStr);
      el.addEventListener("click", () => {
        state = Engine.dispatch(state, { type:"PLAY_CARD", pi:2, handIndex: realIdx });
        renderAll();
      });

      youHandEl.appendChild(el);
    });
  }

  function renderTrickArea(){
    if (!trickSlotsEl) return;
    // demo2 engine auto-completes tricks, so keep it simple
    trickSlotsEl.innerHTML = '<div class="slotHint">(auto-resolves in demo2)</div>';
  }

  function renderAll(){
    renderHud();
    renderHand();
    renderTrickArea();
  }

  function resetHand(){
    state = Engine.dispatch(state, { type:"RESET_HAND" });
    renderAll();
  }

  // Boot
  const initialTrump = (suitParam || "").toUpperCase();
  if (["S","H","D","C"].includes(initialTrump)){
    state = Engine.dispatch(state, { type:"SET_TRUMP", suit: initialTrump });
  }

  // Start a hand immediately (demo2 visual)
  state = Engine.startHand(state, { trumpSuit: state.trumpSuit, includeJokers:false });
  renderAll();

  resetBtn?.addEventListener("click", resetHand);

})();
