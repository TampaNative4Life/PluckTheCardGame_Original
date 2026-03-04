// demo2.js (FULL REPLACEMENT)
// Demo 2 UI logic: deal 17, sort, render. No clipping on left/right.

(function(){
  "use strict";

  const SUITS = ["S","H","D","C"];
  const BRBR  = ["S","H","C","D"]; // black, red, black, red
  const isRed = s => (s==="H" || s==="D");

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const OPEN_LEAD = "2C";

  const books = { YOU: 0, AI2: 0, AI3: 0 };

  function $(id){ return document.getElementById(id); }

  const params = new URLSearchParams(location.search);
  const trumpSuit = (params.get("trump") || "").toUpperCase();

  function setHud(){
    const t = $("trumpLabel");
    if (t){
      const ok = SUITS.includes(trumpSuit);
      t.textContent = ok ? trumpSuit : "(not set)";
      t.classList.toggle("muted", !ok);
    }
    const b = $("booksSummary");
    if (b){
      b.textContent = `YOU ${books.YOU} • AI2 ${books.AI2} • AI3 ${books.AI3}`;
    }
  }

  function shuffle(a){
    for (let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
    return a;
  }

  function makeDeck(){
    // ranks 3-A per suit + 2C opener (keeps your “2C exists” behavior)
    const ranks = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
    const deck = [];
    for (const s of SUITS) for (const r of ranks) deck.push(r+s);
    deck.push(OPEN_LEAD);
    return deck;
  }

  function suitOrder(){
    if (!SUITS.includes(trumpSuit)) return BRBR.slice();
    return [trumpSuit, ...BRBR.filter(s => s !== trumpSuit)];
  }

  function rankVal(r){
    if (r==="A") return 14;
    if (r==="K") return 13;
    if (r==="Q") return 12;
    if (r==="J") return 11;
    if (r==="10") return 10;
    return parseInt(r,10) || 0;
  }

  function sortHand(hand){
    const sOrder = suitOrder();
    const sIndex = s => {
      const i = sOrder.indexOf(s);
      return i<0 ? 99 : i;
    };

    return hand.slice().sort((a,b)=>{
      // jokers first if present
      if (a===CARD_BIG_JOKER) return (b===CARD_BIG_JOKER)?0:-1;
      if (b===CARD_BIG_JOKER) return 1;
      if (a===CARD_LITTLE_JOKER) return (b===CARD_LITTLE_JOKER)?0:-1;
      if (b===CARD_LITTLE_JOKER) return 1;

      const sa = a.slice(-1), sb = b.slice(-1);
      const ra = a.slice(0,-1), rb = b.slice(0,-1);

      const ga = sIndex(sa), gb = sIndex(sb);
      if (ga !== gb) return ga - gb;

      // high to low
      return rankVal(rb) - rankVal(ra);
    });
  }

  function suitSymbol(s){
    return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣";
  }

  function makeMiniFace(card){
    const el = document.createElement("div");
    el.className = "cardFaceMini";

    if (card===CARD_BIG_JOKER || card===CARD_LITTLE_JOKER){
      el.textContent = card;
      return el;
    }

    const suit = card.slice(-1);
    const rank = card.slice(0,-1);
    el.classList.add(isRed(suit) ? "red" : "black");
    el.textContent = rank + suitSymbol(suit);
    return el;
  }

  function deal17(){
    const deck = shuffle(makeDeck());
    const hand = [];
    while (hand.length < 17 && deck.length){
      hand.push(deck.pop());
    }
    // safety: if deck was short (shouldn't be), pad
    while (hand.length < 17) hand.push("3S");
    return hand;
  }

  function renderHand(){
    const handEl = $("youHand");
    if (!handEl) return;

    const hand = sortHand(deal17());

    handEl.innerHTML = "";
    handEl.classList.toggle("tight", hand.length >= 14);

    for (const c of hand){
      handEl.appendChild(makeMiniFace(c));
    }

    // HARD-LOCK: ensure first and last cards can NEVER be clipped.
    // This forces a tiny scroll recalculation so padding is honored on mobile browsers.
    requestAnimationFrame(() => {
      handEl.scrollLeft = 0;
    });
  }

  $("resetBtn")?.addEventListener("click", () => {
    renderHand();
    const slots = $("trickSlots");
    if (slots) slots.innerHTML = '<div class="slotHint">(empty)</div>';
    setHud();
  });

  setHud();
  renderHand();
})();
