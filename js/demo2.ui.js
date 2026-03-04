// js/demo2.ui.js
// Demo2 UI (DOM only). Talks to engine via actions.

import { createEngine } from "./engine.js";

(function(){
  "use strict";

  const engine = createEngine();

  const $ = (id) => document.getElementById(id);

  function suitSymbol(s){
    return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣";
  }
  const isRed = (s) => (s==="H" || s==="D");

  function makeMiniFace(card){
    const el = document.createElement("div");
    el.className = "cardFaceMini";

    const suit = card.slice(-1);
    const rank = card.slice(0,-1);

    el.classList.add(isRed(suit) ? "red" : "black");
    el.textContent = rank + suitSymbol(suit);
    return el;
  }

  function render(){
    const st = engine.getState();

    // HUD
    const trumpEl = $("trumpLabel");
    if (trumpEl){
      trumpEl.textContent = st.trump ? `${st.trump} ${suitSymbol(st.trump)}` : "(not set)";
      trumpEl.classList.toggle("muted", !st.trump);
    }

    const booksEl = $("booksSummary");
    if (booksEl){
      booksEl.textContent = `YOU ${st.books.YOU} • AI2 ${st.books.AI2} • AI3 ${st.books.AI3}`;
    }

    // Hand (17 cards visible)
    const handEl = $("youHand");
    if (handEl){
      handEl.innerHTML = "";
      handEl.classList.toggle("tight", st.youHand.length >= 14);
      for (const c of st.youHand) handEl.appendChild(makeMiniFace(c));
    }
  }

  // Reset
  const resetBtn = $("resetBtn");
  resetBtn?.addEventListener("click", () => {
    engine.dispatch({ type:"RESET" });
    // trick area reset (optional)
    const slots = $("trickSlots");
    if (slots) slots.innerHTML = '<div class="slotHint">(empty)</div>';
    render();
  });

  render();
})();
