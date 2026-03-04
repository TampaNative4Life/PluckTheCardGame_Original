// js/engine.js
// Pluck Engine (pure rules/state). NO DOM.
// v1: supports Demo2 (deal 17, ordering, trump/books HUD).

export function createEngine() {
  const SUITS = ["S","H","D","C"];
  const BRBR  = ["S","H","C","D"]; // black, red, black, red

  const state = {
    phase: "DEMO2",
    trump: null,              // "S"|"H"|"D"|"C"|null
    books: { YOU:0, AI2:0, AI3:0 },
    youHand: [],              // array like ["AS","10H",...]
    includeJokers: false,     // demo2: false
  };

  function makeDeckNo2() {
    const ranks = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
    const deck = [];
    for (const s of SUITS) for (const r of ranks) deck.push(r+s);
    deck.push("2C");
    return deck;
  }

  function shuffle(a) {
    for (let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
    return a;
  }

  function rankVal(r){
    if (r==="A") return 14;
    if (r==="K") return 13;
    if (r==="Q") return 12;
    if (r==="J") return 11;
    if (r==="10") return 10;
    return parseInt(r,10) || 0;
  }

  function suitOrder() {
    if (!SUITS.includes(state.trump)) return BRBR.slice();
    return [state.trump, ...BRBR.filter(s => s !== state.trump)];
  }

  function sortHand(hand){
    const sOrder = suitOrder();
    const sIndex = s => {
      const i = sOrder.indexOf(s);
      return i < 0 ? 99 : i;
    };

    return hand.slice().sort((a,b)=>{
      const sa = a.slice(-1), sb = b.slice(-1);
      const ra = a.slice(0,-1), rb = b.slice(0,-1);

      const ga = sIndex(sa), gb = sIndex(sb);
      if (ga !== gb) return ga - gb;

      // high to low within suit
      return rankVal(rb) - rankVal(ra);
    });
  }

  function deal17(){
    const deck = shuffle(makeDeckNo2());
    const hand = [];
    while (hand.length < 17) hand.push(deck.pop());
    state.youHand = sortHand(hand);
  }

  function setTrump(suitOrNull){
    const s = (suitOrNull || "").toUpperCase();
    state.trump = SUITS.includes(s) ? s : null;
    // re-sort current hand when trump changes (matches your “ordered properly” requirement)
    if (state.youHand.length) state.youHand = sortHand(state.youHand);
  }

  function reset(){
    state.books = { YOU:0, AI2:0, AI3:0 };
    deal17();
  }

  // Public API (UI calls these)
  function getState(){
    // return a safe copy
    return JSON.parse(JSON.stringify(state));
  }

  function dispatch(action){
    if (!action || !action.type) return getState();

    switch(action.type){
      case "RESET":
        reset();
        break;

      case "SET_TRUMP":
        setTrump(action.suit ?? null);
        break;

      case "SET_BOOKS":
        state.books = {
          YOU: Number(action.YOU ?? state.books.YOU),
          AI2: Number(action.AI2 ?? state.books.AI2),
          AI3: Number(action.AI3 ?? state.books.AI3),
        };
        break;

      default:
        // ignore unknown actions safely
        break;
    }

    return getState();
  }

  // boot
  deal17();

  return { getState, dispatch };
}
