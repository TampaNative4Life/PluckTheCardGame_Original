/* =========================================================
   Pluck Engine (pure rules/state) — v1
   - NO DOM, NO HTML, NO CSS
   - State in -> State out
   - Events: RESET, SET_TRUMP, PLAY_CARD, AI_STEP
   - Sorting: Jokers first, trump suit first, then BRBR, high->low
   ========================================================= */

(function (global) {
  "use strict";

  const SUITS = ["S", "H", "D", "C"];
  const BRBR = ["S", "H", "C", "D"]; // black, red, black, red

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

  // Demo2 uses a 49-card deck (3-A each suit + 2C). No jokers by default.
  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14,"2":2 };

  function clone(obj){ return JSON.parse(JSON.stringify(obj)); }

  function makeDeckNo2(){
    const deck = [];
    for (const s of SUITS) for (const r of RANKS_NO_2) deck.push(r+s);
    deck.push("2C");
    return deck;
  }

  function shuffle(a, rng=Math.random){
    const arr = a.slice();
    for (let i=arr.length-1;i>0;i--){
      const j = Math.floor(rng()*(i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
    return arr;
  }

  function isJoker(cs){ return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }
  function suitOf(cs){ return isJoker(cs) ? null : cs.slice(-1); }
  function rankOf(cs){ return isJoker(cs) ? cs : cs.slice(0,-1); }

  function suitOrder(trumpSuit){
    if (SUITS.includes(trumpSuit)) return [trumpSuit, ...BRBR.filter(s => s !== trumpSuit)];
    return BRBR.slice();
  }

  function rankVal(r){
    if (r === "BJ") return 1000;
    if (r === "LJ") return 900;
    return RANK_VALUE[r] || 0;
  }

  function sortHand(hand, trumpSuit){
    const sOrder = suitOrder(trumpSuit);
    const sIndex = s => {
      const i = sOrder.indexOf(s);
      return i < 0 ? 99 : i;
    };

    return hand.slice().sort((a,b)=>{
      // Jokers far left (even if unused)
      if (a === CARD_BIG_JOKER) return (b === CARD_BIG_JOKER) ? 0 : -1;
      if (b === CARD_BIG_JOKER) return 1;
      if (a === CARD_LITTLE_JOKER) return (b === CARD_LITTLE_JOKER) ? 0 : -1;
      if (b === CARD_LITTLE_JOKER) return 1;

      const sa = suitOf(a), sb = suitOf(b);
      const ra = rankOf(a), rb = rankOf(b);

      const ga = sIndex(sa), gb = sIndex(sb);
      if (ga !== gb) return ga - gb;

      // high-to-low within suit
      return rankVal(rb) - rankVal(ra);
    });
  }

  function initialState(){
    return {
      phase: "DEMO2",
      trumpSuit: "",
      books: { YOU:0, AI2:0, AI3:0 },

      // 0=AI2,1=AI3,2=YOU
      players: [
        { id:"AI2", hand:[], hiddenCount:17 },
        { id:"AI3", hand:[], hiddenCount:17 },
        { id:"YOU", hand:[] }
      ],

      trick: [],         // [{pi, card}]
      leadSuit: "",
      turn: 2,           // start with YOU in demo
      msg: "Ready."
    };
  }

  function dealDemoHands(state, rng=Math.random){
    const st = clone(state);
    const deck = shuffle(makeDeckNo2(), rng);

    st.players[0].hand = [];
    st.players[1].hand = [];
    st.players[2].hand = [];

    // 17 each
    for (let i=0;i<17;i++){
      st.players[0].hand.push(deck.pop());
      st.players[1].hand.push(deck.pop());
      st.players[2].hand.push(deck.pop());
    }

    st.players[0].hiddenCount = st.players[0].hand.length;
    st.players[1].hiddenCount = st.players[1].hand.length;

    st.trick = [];
    st.leadSuit = "";
    st.turn = 2;
    st.msg = "New deal.";
    return st;
  }

  function setTrump(state, suit){
    const st = clone(state);
    st.trumpSuit = SUITS.includes(suit) ? suit : "";
    st.msg = st.trumpSuit ? `Trump set: ${st.trumpSuit}` : "Trump cleared.";
    return st;
  }

  // Demo2: basic play (not full Pluck rules yet)
  function playCard(state, pi, card){
    const st = clone(state);

    if (st.turn !== pi) {
      st.msg = "Not your turn.";
      return st;
    }

    const hand = st.players[pi].hand;
    const idx = hand.indexOf(card);
    if (idx < 0){
      st.msg = "Card not in hand.";
      return st;
    }

    hand.splice(idx, 1);
    st.trick.push({ pi, card });

    // lead suit
    if (st.trick.length === 1){
      st.leadSuit = suitOf(card) || "";
    }

    // next turn
    st.turn = (st.turn + 1) % 3;

    // resolve trick when 3 played (demo resolve = highest rank in lead suit OR trump if set)
    if (st.trick.length === 3){
      const winner = evaluateTrickWinner(st.trick, st.trumpSuit, st.leadSuit);
      const winId = st.players[winner].id;

      st.books[winId] = (st.books[winId] || 0) + 1;

      st.msg = `${winId} wins the trick.`;
      st.trick = [];
      st.leadSuit = "";
      st.turn = winner;
    } else {
      st.msg = "Card played.";
    }

    st.players[0].hiddenCount = st.players[0].hand.length;
    st.players[1].hiddenCount = st.players[1].hand.length;

    return st;
  }

  function evaluateTrickWinner(trick, trumpSuit, leadSuit){
    // If any trump played, highest trump wins; else highest in lead suit wins.
    const hasTrump = !!trumpSuit && trick.some(t => suitOf(t.card) === trumpSuit);
    let bestPi = trick[0].pi;
    let bestScore = -1;

    for (const t of trick){
      const s = suitOf(t.card);
      const r = rankOf(t.card);

      let score = rankVal(r);

      if (hasTrump){
        if (s === trumpSuit) score += 10000; else score = -1; // non-trump cannot win if trump exists
      } else {
        if (s !== leadSuit) score = -1;
      }

      if (score > bestScore){
        bestScore = score;
        bestPi = t.pi;
      }
    }
    return bestPi;
  }

  function aiStep(state){
    // dumb AI for demo: play lowest sorted card
    const st = clone(state);
    const pi = st.turn;
    if (pi === 2) return st; // your turn

    const hand = st.players[pi].hand.slice();
    const sorted = sortHand(hand, st.trumpSuit);
    const card = sorted[sorted.length - 1]; // lowest (since sorted high->low inside suit groups, take last)
    return playCard(st, pi, card);
  }

  function reduce(state, event, rng=Math.random){
    const st = state ? clone(state) : initialState();

    switch(event?.type){
      case "RESET":
        return dealDemoHands(initialState(), rng);

      case "SET_TRUMP":
        return setTrump(st, String(event?.suit || "").toUpperCase());

      case "PLAY_CARD":
        return playCard(st, event.pi, event.card);

      case "AI_STEP":
        return aiStep(st);

      default:
        return st;
    }
  }

  // export
  global.PluckEngine = {
    initialState,
    reduce,
    sortHand,
    SUITS,
    BRBR
  };

})(window);
