// js/engine.js
// Pluck Engine (pure rules + state). NO DOM. NO HTML. NO window.
// UI calls: Engine.newGame(), Engine.startHand(state), Engine.dispatch(state, action)

(function (global) {
  "use strict";

  const SUITS = ["S", "H", "D", "C"];
  const BRBR = ["S", "H", "C", "D"]; // black, red, black, red
  const TOTAL_TRICKS = 17;

  const CARD_BIG_JOKER = "BJ";
  const CARD_LITTLE_JOKER = "LJ";
  const CARD_OPEN_LEAD = "2C";

  const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function isJoker(c){ return c === CARD_BIG_JOKER || c === CARD_LITTLE_JOKER; }

  function makeDeckNo2() {
    // 49 cards: 3-A (48) + 2C (1) = 49
    const deck = [];
    for (const s of SUITS) for (const r of RANKS_NO_2) deck.push(r + s);
    deck.push(CARD_OPEN_LEAD);
    return deck;
  }

  function shuffle(a) {
    for (let i=a.length-1;i>0;i--) {
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
    return a;
  }

  function parseCard(cs){
    if (cs === CARD_BIG_JOKER) return { kind:"JOKER", rank:"BJ", suit:null, value: 1000 };
    if (cs === CARD_LITTLE_JOKER) return { kind:"JOKER", rank:"LJ", suit:null, value: 900 };
    const suit = cs.slice(-1);
    const rank = cs.slice(0, cs.length-1);
    return { kind:"NORMAL", rank, suit, value: RANK_VALUE[rank] || 0 };
  }

  function suitName(s){ return s==="S"?"Spades":s==="H"?"Hearts":s==="D"?"Diamonds":"Clubs"; }

  function cardSuitForFollow(cardStr, trumpSuit){
    // In your rules, jokers behave like trump (but demo2 starts without jokers anyway).
    if (isJoker(cardStr)) return trumpSuit || null;
    return cardStr.slice(-1);
  }

  function isTrumpCard(cardStr, trumpSuit){
    if (!trumpSuit) return false;
    if (isJoker(cardStr)) return true;
    return cardStr.slice(-1) === trumpSuit;
  }

  function hasNonTrump(hand, trumpSuit){
    return hand.some(c => !isTrumpCard(c, trumpSuit));
  }

  function suitOrderForHand(trumpSuit){
    if (SUITS.includes(trumpSuit)) return [trumpSuit, ...BRBR.filter(s => s !== trumpSuit)];
    return BRBR.slice();
  }

  function sortHand(hand, trumpSuit){
    const sOrder = suitOrderForHand(trumpSuit);
    const rankOrder = { "A":14,"K":13,"Q":12,"J":11,"10":10,"9":9,"8":8,"7":7,"6":6,"5":5,"4":4,"3":3,"2":2 };

    function suitGroup(s){ const i = sOrder.indexOf(s); return i<0 ? 99 : i; }

    function key(cs){
      if (cs === CARD_BIG_JOKER) return { a:0, b:0, c:0 };
      if (cs === CARD_LITTLE_JOKER) return { a:0, b:1, c:0 };
      const suit = cs.slice(-1);
      const rank = cs.slice(0, cs.length-1);
      const sg = 1 + suitGroup(suit);
      const rv = rankOrder[rank] ?? 0;
      return { a: sg, b: 0, c: (100 - rv) }; // high first
    }

    return hand.slice().sort((x,y)=>{
      const a = key(x), b = key(y);
      if (a.a !== b.a) return a.a - b.a;
      if (a.b !== b.b) return a.b - b.b;
      return a.c - b.c;
    });
  }

  function legalPlays(state, pi){
    const hand = state.players[pi].hand;
    const { trick, leadSuit, trumpSuit, trumpOpen, trickNumber } = state;

    // Trick 1 first lead must be 2C if you have it
    if (trickNumber === 1 && trick.length === 0 && hand.includes(CARD_OPEN_LEAD)){
      return hand.map((c,i)=>({c,i})).filter(x=>x.c===CARD_OPEN_LEAD).map(x=>x.i);
    }

    // Leading before trump is open: cannot lead trump if you have any non-trump
    if (trick.length === 0 && !trumpOpen && trumpSuit){
      const nonTrumpIdx = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c,trumpSuit)).map(x=>x.i);
      if (nonTrumpIdx.length) return nonTrumpIdx;
      return hand.map((_,i)=>i);
    }

    // Must follow suit if possible
    if (trick.length > 0){
      const must = leadSuit;
      const suited = hand
        .map((c,i)=>({c,i}))
        .filter(x => cardSuitForFollow(x.c, trumpSuit) === must)
        .map(x=>x.i);
      return suited.length ? suited : hand.map((_,i)=>i);
    }

    return hand.map((_,i)=>i);
  }

  function cardPower(cardStr, trumpSuit){
    if (cardStr === CARD_BIG_JOKER) return 1000000;
    if (cardStr === CARD_LITTLE_JOKER) return 900000;
    const c = parseCard(cardStr);
    if (isTrumpCard(cardStr, trumpSuit)) return 10000 + c.value;
    return c.value;
  }

  function evaluateTrickWinner(state){
    const { trick, leadSuit, trumpSuit } = state;

    const anyTrump = trick.some(t => isTrumpCard(t.card, trumpSuit));
    if (anyTrump){
      let bestPi = trick[0].pi;
      let bestP = -1;
      for (const t of trick){
        if (!isTrumpCard(t.card, trumpSuit)) continue;
        const p = cardPower(t.card, trumpSuit);
        if (p > bestP){ bestP = p; bestPi = t.pi; }
      }
      return bestPi;
    }

    let bestPi = trick[0].pi;
    let bestV = -1;
    for (const t of trick){
      if (cardSuitForFollow(t.card, trumpSuit) !== leadSuit) continue;
      const v = parseCard(t.card).value;
      if (v > bestV){ bestV = v; bestPi = t.pi; }
    }
    return bestPi;
  }

  function aiChooseIndex(state, pi){
    const legal = legalPlays(state, pi);
    const hand = state.players[pi].hand;

    // Simple: dump lowest power legal
    let low = legal[0], lowP = Infinity;
    for (const idx of legal){
      const p = cardPower(hand[idx], state.trumpSuit);
      if (p < lowP){ lowP = p; low = idx; }
    }
    return low;
  }

  function newGame(){
    return {
      phase: "READY", // READY -> PLAY -> HAND_OVER
      trumpSuit: null,
      trumpOpen: false,

      dealerIndex: 2, // demo2: YOU is “center” visually; dealer can rotate later
      leaderIndex: 0, // who leads current trick
      turnIndex: 0,

      trickNumber: 1,
      leadSuit: null,
      trick: [], // [{pi, card}]

      books: { YOU:0, AI2:0, AI3:0 }, // tricks won

      players: [
        { id:"AI2", hand:[] },
        { id:"AI3", hand:[] },
        { id:"YOU", hand:[] }
      ]
    };
  }

  function startHand(state, opts){
    const s = clone(state);

    // opts:
    // - trumpSuit: "S"|"H"|"D"|"C"|null
    // - includeJokers: false (demo2: no jokers)
    const trumpSuit = (opts?.trumpSuit && SUITS.includes(opts.trumpSuit)) ? opts.trumpSuit : null;
    s.trumpSuit = trumpSuit;
    s.trumpOpen = false;

    // reset books + trick state
    s.books = { YOU:0, AI2:0, AI3:0 };
    s.trickNumber = 1;
    s.trick = [];
    s.leadSuit = null;

    const deck = shuffle(makeDeckNo2());

    // deal 17 each (uses almost whole deck: 51? No, demo2 deck is 49)
    // NOTE: 17*3 = 51, but deck is 49. Demo2 is a VISUAL demo.
    // We will instead: deal 17 to YOU only for demo2 and give AIs "hidden" concept.
    // If you want full real dealing for 3 players, we must include jokers and 2’s rules properly.
    // For now: give YOU 17, AIs "virtual 17" not stored.
    s.players[2].hand = [];
    for (let i=0; i<17; i++) s.players[2].hand.push(deck.pop());

    // AIs: not shown in demo2; keep empty or store 17 for future
    s.players[0].hand = []; // optional later
    s.players[1].hand = []; // optional later

    // set leader = whoever has 2C in YOU hand (since only YOU has cards in demo2)
    // If YOU doesn't have 2C, just let YOU lead for demo visuals.
    s.leaderIndex = 2;
    s.turnIndex = 2;

    s.phase = "PLAY";
    return s;
  }

  function dispatch(state, action){
    const s = clone(state);

    switch(action.type){

      case "RESET_HAND":{
        return startHand(s, { trumpSuit: s.trumpSuit, includeJokers:false });
      }

      case "SET_TRUMP":{
        const suit = (action.suit || "").toUpperCase();
        s.trumpSuit = SUITS.includes(suit) ? suit : null;
        return s;
      }

      case "PLAY_CARD":{
        if (s.phase !== "PLAY") return s;
        const pi = action.pi;
        const idx = action.handIndex;

        if (pi !== 2) return s; // demo2: only YOU plays cards right now
        if (s.turnIndex !== 2) return s;
        if (idx == null || idx < 0 || idx >= s.players[2].hand.length) return s;

        const legal = legalPlays(s, 2);
        if (!legal.includes(idx)) return s;

        const card = s.players[2].hand.splice(idx,1)[0];

        if (s.trick.length === 0){
          s.leadSuit = cardSuitForFollow(card, s.trumpSuit);
        }
        s.trick.push({ pi: 2, card });

        if (!s.trumpOpen && isTrumpCard(card, s.trumpSuit)) s.trumpOpen = true;

        // For demo2, we instantly “close” the trick with AI auto-plays (visual placeholders)
        // so books update & trick clears.
        return autoCompleteTrickDemo2(s);
      }

      default:
        return s;
    }
  }

  function autoCompleteTrickDemo2(s){
    // AI play placeholders (not from hands yet). If you want real AI hands later, we’ll deal real 51 and track.
    // For now: generate plausible cards that follow suit when possible (visual only).
    const lead = s.leadSuit;
    const trump = s.trumpSuit;

    function randomFollowCard(){
      const ranks = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
      const r = ranks[Math.floor(Math.random()*ranks.length)];
      const suit = lead || BRBR[Math.floor(Math.random()*4)];
      return r + suit;
    }

    // Add two AI plays
    s.trick.push({ pi: 0, card: randomFollowCard() });
    s.trick.push({ pi: 1, card: randomFollowCard() });

    // Determine winner
    const winner = evaluateTrickWinner(s);
    if (winner === 2) s.books.YOU++;
    if (winner === 0) s.books.AI2++;
    if (winner === 1) s.books.AI3++;

    s.trickNumber++;

    // Clear trick
    s.trick = [];
    s.leadSuit = null;

    // Hand done?
    if (s.players[2].hand.length === 0){
      s.phase = "HAND_OVER";
    }

    // next turn: YOU again for demo2
    s.turnIndex = 2;
    return s;
  }

  const Engine = {
    newGame,
    startHand,
    dispatch,
    sortHand,     // UI uses this to display ordered hand
    suitName
  };

  global.Engine = Engine;

})(typeof window !== "undefined" ? window : globalThis);
