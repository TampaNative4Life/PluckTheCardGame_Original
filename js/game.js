// Pluck Web Demo v19 (clean playable)
// - Dealer Pick first (lowest card deals) and shows everyone's pick
// - First hand: NO PLUCK phase
// - After Hand 1: DEAL -> PLUCK -> Dealer Selects Trump -> PLAY
// - Click to play works (phases + DOM ids aligned)
// - Sidebar shows dealer pick + Ace of trump suit once chosen

function $(id){ return document.getElementById(id); }

const handEl = $("hand");
const trickEl = $("trick");
const msgEl = $("msg");
const resetBtn = $("resetBtn");

const ai2HandEl = $("ai2Hand");
const ai3HandEl = $("ai3Hand");

const turnBannerEl = $("turnBanner");
const phaseLabelEl = $("phaseLabel");

const trumpLabelEl = $("trumpLabel");       // sidebar label
const trumpMetaEl  = $("trumpMeta");        // phase bar label
const trumpAceBoxEl = $("trumpAceBox");

const dealerLabelEl = $("dealerLabel");

const ai2TricksEl = $("ai2Tricks");
const ai3TricksEl = $("ai3Tricks");
const youTricksEl = $("youTricks");
const ai2QuotaEl  = $("ai2Quota");
const ai3QuotaEl  = $("ai3Quota");
const youQuotaEl  = $("youQuota");
const trickNumEl  = $("trickNum");
const trickMaxEl  = $("trickMax");

const pluckPanelEl = $("pluckPanel");
const pluckStatusEl = $("pluckStatus");
const pluckNextBtn = $("pluckNextBtn");
const pluckChoicesEl = $("pluckChoices");

const trumpPanelEl = $("trumpPanel");
const trumpStatusEl = $("trumpStatus");

const pDeal = $("pDeal");
const pPluck = $("pPluck");
const pTrump = $("pTrump");
const pPlay = $("pPlay");

// Dealer pick UI
const pickStatusEl = $("pickStatus");
const pickStartBtn = $("pickStartBtn");
const pickDeckAreaEl = $("pickDeckArea");
const pickDeckEl = $("pickDeck");
const pickWhoseTurnEl = $("pickWhoseTurn");
const pickYouEl = $("pickYou");
const pickAi2El = $("pickAi2");
const pickAi3El = $("pickAi3");

// ===== Core constants =====
const TOTAL_TRICKS = 17;
const SUITS = ["S","H","D","C"];
const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14, "2":2 };

const CARD_BIG_JOKER = "BJ";
const CARD_LITTLE_JOKER = "LJ";
const CARD_OPEN_LEAD = "2C";

// Optional card images (only used if files exist)
const CARD_IMG_DIR = "assets/cards";
const TRY_CARD_IMAGES = true;

function suitName(s){ return s==="S"?"Spades":s==="H"?"Hearts":s==="D"?"Diamonds":"Clubs"; }
function suitSymbol(s){ return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣"; }
function isRedSuit(s){ return s==="H" || s==="D"; }
function isJoker(cs){ return cs === CARD_BIG_JOKER || cs === CARD_LITTLE_JOKER; }

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
function parseCard(cs){
  if (cs===CARD_BIG_JOKER) return { raw:cs, kind:"JOKER", suit:null, value:1000 };
  if (cs===CARD_LITTLE_JOKER) return { raw:cs, kind:"JOKER", suit:null, value:900 };
  const suit=cs.slice(-1);
  const rank=cs.slice(0, cs.length-1);
  return { raw:cs, kind:"NORMAL", suit, rank, value:RANK_VALUE[rank] || 0 };
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

// ===== Players =====
// 0=AI2, 1=AI3, 2=YOU
function leftOf(i){ return (i+1)%3; }
function rightOf(i){ return (i+2)%3; }

const players = [
  { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7 },
  { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6 },
  { id:"YOU", name:"You",            hand:[], tricks:0, quota:4 }
];

let dealerIndex = 0;          // will be set by dealer pick
let handNumber = 0;           // 0 before first hand, 1 after first hand, etc.

// Quotas rotate with dealer: Dealer=7, Left=6, Right=4
function applyQuotas(){
  players[dealerIndex].quota = 7;
  players[leftOf(dealerIndex)].quota = 6;
  players[rightOf(dealerIndex)].quota = 4;
}

// ===== State =====
let phase = "DEALER_PICK";     // DEALER_PICK | DEAL | PLUCK | TRUMP_PICK | PLAY
let trumpSuit = null;

let leaderIndex = 0;
let turnIndex = 0;
let leadSuit = null;
let trick = [];
let lockInput = false;

let trickNumber = 0;
let trickMax = TOTAL_TRICKS;

// Pluck placeholders (we’ll turn on after hand 1)
let pendingPluckQueue = null;
let pluckQueue = [];
let activePluck = null;

// ===== UI helpers =====
function setPhase(newPhase){
  phase = newPhase;
  if (phaseLabelEl) phaseLabelEl.textContent = newPhase;

  // panels
  if (pluckPanelEl) pluckPanelEl.style.display = (newPhase==="PLUCK") ? "block" : "none";
  if (trumpPanelEl) trumpPanelEl.style.display = (newPhase==="TRUMP_PICK") ? "block" : "none";

  // phase highlights
  [pDeal,pPluck,pTrump,pPlay].forEach(x => x && x.classList.remove("activeChip"));
  if (newPhase==="DEAL") pDeal && pDeal.classList.add("activeChip");
  if (newPhase==="PLUCK") pPluck && pPluck.classList.add("activeChip");
  if (newPhase==="TRUMP_PICK") pTrump && pTrump.classList.add("activeChip");
  if (newPhase==="PLAY") pPlay && pPlay.classList.add("activeChip");
}

function makeCardFaceFallback(cardStr, disabled=false){
  const el=document.createElement("div");
  el.className="cardFace"+(disabled?" disabled":"");

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
  const rank=cardStr.slice(0, cardStr.length-1);
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

function makeCardFace(cardStr, disabled=false){
  if (!TRY_CARD_IMAGES) return makeCardFaceFallback(cardStr, disabled);

  const el=document.createElement("div");
  el.className="cardFace"+(disabled?" disabled":"");
  el.style.padding="0";
  el.style.overflow="hidden";

  const img=document.createElement("img");
  img.alt=cardStr;
  img.src=`${CARD_IMG_DIR}/${cardStr}.png`;
  img.style.width="100%";
  img.style.height="100%";
  img.style.objectFit="cover";

  img.onerror = () => {
    const fb = makeCardFaceFallback(cardStr, disabled);
    el.replaceWith(fb);
  };

  el.appendChild(img);
  return el;
}

function sortHandForDisplay(hand){
  const suitOrder=["S","H","D","C"];
  const rankOrder={ "A":14,"K":13,"Q":12,"J":11,"10":10,"9":9,"8":8,"7":7,"6":6,"5":5,"4":4,"3":3,"2":2 };

  function suitGroup(s){
    if (trumpSuit && s===trumpSuit) return 0;
    if (trumpSuit){
      const after=suitOrder.filter(x=>x!==trumpSuit);
      return 1+after.indexOf(s);
    }
    return suitOrder.indexOf(s);
  }

  function key(cs){
    if (cs===CARD_BIG_JOKER) return { sg:0, r:0 };
    if (cs===CARD_LITTLE_JOKER) return { sg:0, r:1 };
    const suit=cs.slice(-1);
    const rank=cs.slice(0, cs.length-1);
    return { sg:suitGroup(suit), r:(100-(rankOrder[rank]||0)) };
  }

  return hand.slice().sort((a,b)=>{
    const ka=key(a), kb=key(b);
    if (ka.sg!==kb.sg) return ka.sg-kb.sg;
    return ka.r-kb.r;
  });
}

// ===== Render =====
function render(){
  // quotas/tricks
  ai2QuotaEl.textContent = String(players[0].quota);
  ai3QuotaEl.textContent = String(players[1].quota);
  youQuotaEl.textContent = String(players[2].quota);

  ai2TricksEl.textContent = String(players[0].tricks);
  ai3TricksEl.textContent = String(players[1].tricks);
  youTricksEl.textContent = String(players[2].tricks);

  // trick counters
  trickNumEl.textContent = String(trickNumber);
  trickMaxEl.textContent = String(trickMax);

  // dealer label
  dealerLabelEl.textContent = players[dealerIndex]?.id || "?";

  // trump labels
  const trumpText = trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not picked)";
  trumpLabelEl.textContent = trumpText;
  trumpMetaEl.textContent = trumpText;

  // trump ace display
  if (!trumpSuit){
    trumpAceBoxEl.textContent = "(no trump yet)";
  } else {
    trumpAceBoxEl.innerHTML = "";
    const ace = "A" + trumpSuit;
    const face = makeCardFace(ace, true);
    face.style.cursor="default";
    trumpAceBoxEl.appendChild(face);
  }

  // AI hands hidden
  ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
  ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

  // Your hand
  handEl.innerHTML = "";
  const sorted = sortHandForDisplay(players[2].hand);

  for (const c of sorted){
    const realIdx = players[2].hand.indexOf(c);

    const isYourTurn = (phase==="PLAY" && turnIndex===2 && !lockInput);
    const legal = isYourTurn ? legalIndexesFor(2) : [];
    const disabled = !(isYourTurn && legal.includes(realIdx));

    const face = makeCardFace(c, disabled);
    face.onclick = () => {
      if (disabled) return;
      if (phase !== "PLAY") return;
      if (turnIndex !== 2) return;
      if (lockInput) return;

      const legalNow = legalIndexesFor(2);
      if (!legalNow.includes(realIdx)){
        msgEl.textContent = illegalReason(2, c);
        return;
      }
      playCard(2, realIdx);
    };

    handEl.appendChild(face);
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
      label.style.color="#a6b0c3";
      label.textContent = players[t.playerIndex].id;

      const face=makeCardFace(t.cardStr, true);
      face.style.cursor="default";

      wrap.appendChild(label);
      wrap.appendChild(face);
      trickEl.appendChild(wrap);
    }
  }

  // banner
  const leadTxt = leadSuit || "(none)";
  const whoTurn = (phase==="PLAY" ? players[turnIndex].id : "—");
  turnBannerEl.textContent =
    `Phase: ${phase} • Hand: ${handNumber} • Dealer: ${players[dealerIndex].id} • Turn: ${whoTurn} • Lead Suit: ${leadTxt}`;

  // panels text
  if (phase==="TRUMP_PICK"){
    trumpStatusEl.textContent = `Dealer (${players[dealerIndex].id}) selects trump.`;
  }
}

// ===== Dealer Pick =====
let pickDeck = [];
let pickStep = 0; // 0 YOU, 1 AI2, 2 AI3
let pickedCards = { YOU:null, AI2:null, AI3:null };

function resetDealerPickUI(){
  pickStatusEl.textContent = "Not started.";
  pickYouEl.textContent = "(not picked)";
  pickAi2El.textContent = "(not picked)";
  pickAi3El.textContent = "(not picked)";
  pickDeckEl.innerHTML = "";
  pickDeckAreaEl.style.display = "none";
  pickWhoseTurnEl.textContent = "YOU";
  pickedCards = { YOU:null, AI2:null, AI3:null };
  pickStep = 0;
}

function startDealerPick(){
  setPhase("DEALER_PICK");
  trumpSuit = null;
  handNumber = 0;
  trickNumber = 0;
  lockInput = false;
  msgEl.textContent = "";

  // use a fresh deck for the pick, 51-card pluck deck
  pickDeck = shuffle(makePluckDeck51());
  resetDealerPickUI();

  pickStatusEl.textContent = "Pick for YOU, then AI2, then AI3.";
  pickDeckAreaEl.style.display = "block";

  // render 12 face-down cards as a “spread”
  pickDeckEl.innerHTML = "";
  for (let i=0; i<12; i++){
    const back = document.createElement("div");
    back.className = "pickBack";
    back.onclick = () => pickOneCardFromDeck();
    pickDeckEl.appendChild(back);
  }

  render();
}

function pickOneCardFromDeck(){
  if (phase !== "DEALER_PICK") return;
  if (pickDeck.length === 0) return;

  const who = (pickStep===0 ? "YOU" : pickStep===1 ? "AI2" : "AI3");
  const card = pickDeck.pop();

  pickedCards[who] = card;

  if (who==="YOU") pickYouEl.textContent = card;
  if (who==="AI2") pickAi2El.textContent = card;
  if (who==="AI3") pickAi3El.textContent = card;

  pickStep++;

  if (pickStep < 3){
    pickWhoseTurnEl.textContent = (pickStep===1 ? "AI2" : "AI3");
    pickStatusEl.textContent = `Picked for ${who}: ${card}. Now pick for ${pickWhoseTurnEl.textContent}.`;
    return;
  }

  // Reveal all + choose lowest
  pickWhoseTurnEl.textContent = "DONE";
  pickDeckAreaEl.style.display = "none";

  const cYou = parseCard(pickedCards.YOU);
  const c2 = parseCard(pickedCards.AI2);
  const c3 = parseCard(pickedCards.AI3);

  // Jokers are highest for dealer pick (you WANT low)
  function pickValue(cs){
    if (cs===CARD_BIG_JOKER) return 999;
    if (cs===CARD_LITTLE_JOKER) return 998;
    // 2C exists; treat 2 as 2 for pick
    if (cs==="2C") return 2;
    return parseCard(cs).value;
  }

  const vYou = pickValue(pickedCards.YOU);
  const v2 = pickValue(pickedCards.AI2);
  const v3 = pickValue(pickedCards.AI3);

  let winner = 2; // YOU by default
  let best = vYou;

  if (v2 < best){ best = v2; winner = 0; }
  if (v3 < best){ best = v3; winner = 1; }

  dealerIndex = winner;
  applyQuotas();

  pickStatusEl.textContent = `All revealed. Lowest card deals: ${players[dealerIndex].id}. Starting Hand 1...`;

  // Begin hand 1 (NO pluck)
  setTimeout(() => {
    startNewHand({ allowPluck:false });
  }, 600);
}

// ===== Deal / Hand control =====
function dealNewHands(){
  const deck = shuffle(makePluckDeck51());
  players.forEach(p => { p.hand = []; p.tricks = 0; });

  trick = [];
  leadSuit = null;
  trickNumber = 1;

  for (let i=0;i<TOTAL_TRICKS;i++){
    players[0].hand.push(deck.pop());
    players[1].hand.push(deck.pop());
    players[2].hand.push(deck.pop());
  }
}

function startNewHand({ allowPluck }){
  handNumber += 1;

  setPhase("DEAL");
  lockInput = true;
  msgEl.textContent = "Dealing...";

  dealNewHands();

  // dealer rotates RIGHT each new hand after the first dealer is chosen
  // (for hand 1, dealer is the dealer pick winner)
  // for hand 2+, rotate before quotas
  if (handNumber > 1){
    dealerIndex = rightOf(dealerIndex);
    applyQuotas();
  }

  // clear trump until dealer selects it each hand
  trumpSuit = null;

  // find who has 2C for trick 1 lead
  leaderIndex = 0;
  for (let pi=0; pi<3; pi++){
    if (players[pi].hand.includes(CARD_OPEN_LEAD)){
      leaderIndex = pi;
      break;
    }
  }
  turnIndex = leaderIndex;

  setTimeout(() => {
    lockInput = false;

    // Hand 1: skip pluck entirely
    if (!allowPluck){
      setPhase("TRUMP_PICK");
      msgEl.textContent = "Hand 1: No pluck. Dealer selects trump.";
      render();
      return;
    }

    // Later hands: (placeholder) go to pluck
    setPhase("PLUCK");
    msgEl.textContent = "Pluck phase (not implemented in this v19 snippet).";
    render();
  }, 350);

  render();
}

// ===== Trump Pick =====
function wireTrumpButtons(){
  const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
  btns.forEach(b => {
    b.onclick = () => {
      if (phase !== "TRUMP_PICK") return;
      if (dealerIndex !== 0 && dealerIndex !== 1 && dealerIndex !== 2) return;

      // ONLY dealer chooses
      // In this demo, if dealer is AI, AI picks automatically
      if (dealerIndex !== 2){
        msgEl.textContent = "Dealer is AI — it will pick trump automatically.";
        return;
      }

      const suit = b.getAttribute("data-trump");
      if (!SUITS.includes(suit)) return;
      trumpSuit = suit;

      msgEl.textContent = `Trump set: ${suit} (${suitName(suit)}). Starting play.`;
      setPhase("PLAY");
      render();
      maybeContinue();
    };
  });
}

function aiPickTrumpFromOwnHand(aiIndex){
  // Simple: choose suit with most high cards in own hand
  const score = { S:0,H:0,D:0,C:0 };
  for (const cs of players[aiIndex].hand){
    if (isJoker(cs)){ score.S+=5; score.H+=5; score.D+=5; score.C+=5; continue; }
    const suit=cs.slice(-1);
    const rank=cs.slice(0, cs.length-1);
    const v=RANK_VALUE[rank]||0;
    score[suit] += 1;
    if (v>=11) score[suit] += (v-10)*2;
  }
  let bestSuit="S", best=-1;
  for (const s of SUITS){
    if (score[s] > best){ best = score[s]; bestSuit = s; }
  }
  return bestSuit;
}

function ensureTrumpIfNeeded(){
  if (phase !== "TRUMP_PICK") return;
  if (trumpSuit) return;

  // If dealer is AI, pick after a short delay
  if (dealerIndex !== 2){
    lockInput = true;
    setTimeout(() => {
      trumpSuit = aiPickTrumpFromOwnHand(dealerIndex);
      msgEl.textContent = `Dealer (${players[dealerIndex].id}) selects trump: ${trumpSuit} (${suitName(trumpSuit)}). Starting play.`;
      setPhase("PLAY");
      lockInput = false;
      render();
      maybeContinue();
    }, 500);
  }
}

// ===== Play Rules =====
function hasNonTrump(playerIndex){
  return players[playerIndex].hand.some(c => !isTrumpCard(c, trumpSuit));
}

function illegalReason(playerIndex, cardStr){
  // Trick 1 must lead 2C if you have it and you are leading
  if (trickNumber===1 && trick.length===0 && players[playerIndex].hand.includes(CARD_OPEN_LEAD)){
    if (cardStr !== CARD_OPEN_LEAD) return "First lead must be 2C.";
  }
  // Must follow suit if possible
  if (trick.length>0){
    const must = leadSuit;
    const hasSuit = players[playerIndex].hand.some(c => cardSuitForFollow(c, trumpSuit)===must);
    if (hasSuit && cardSuitForFollow(cardStr, trumpSuit)!==must) return `Must follow suit: ${must}.`;
  }
  return "Illegal move.";
}

function legalIndexesFor(playerIndex){
  const hand = players[playerIndex].hand;

  // Trick 1 lead with 2C
  if (trickNumber===1 && trick.length===0 && hand.includes(CARD_OPEN_LEAD)){
    return hand.map((c,i)=>({c,i})).filter(x=>x.c===CARD_OPEN_LEAD).map(x=>x.i);
  }

  // Follow suit
  if (trick.length>0){
    const suited = hand.map((c,i)=>({c,i})).filter(x=>cardSuitForFollow(x.c, trumpSuit)===leadSuit).map(x=>x.i);
    return suited.length ? suited : hand.map((_,i)=>i);
  }

  // lead: anything
  return hand.map((_,i)=>i);
}

function setLeadSuitFromFirstCard(cardStr){
  leadSuit = cardSuitForFollow(cardStr, trumpSuit);
}

function cardPower(cardStr){
  if (cardStr===CARD_BIG_JOKER) return 1000000;
  if (cardStr===CARD_LITTLE_JOKER) return 900000;
  const c = parseCard(cardStr);
  if (isTrumpCard(cardStr, trumpSuit)) return 10000 + c.value;
  return c.value;
}

function evaluateTrickWinner(){
  const anyTrump = trick.some(t=>isTrumpCard(t.cardStr, trumpSuit));

  if (anyTrump){
    let bestPi = trick[0].playerIndex;
    let bestP = -1;
    for (const t of trick){
      if (!isTrumpCard(t.cardStr, trumpSuit)) continue;
      const p = cardPower(t.cardStr);
      if (p>bestP){ bestP=p; bestPi=t.playerIndex; }
    }
    return bestPi;
  }

  let bestPi = trick[0].playerIndex;
  let bestV = -1;
  for (const t of trick){
    if (cardSuitForFollow(t.cardStr, trumpSuit)!==leadSuit) continue;
    const v = parseCard(t.cardStr).value;
    if (v>bestV){ bestV=v; bestPi=t.playerIndex; }
  }
  return bestPi;
}

function playCard(playerIndex, handIdx){
  const cardStr = players[playerIndex].hand.splice(handIdx,1)[0];
  if (!cardStr) return;

  if (trick.length===0) setLeadSuitFromFirstCard(cardStr);

  trick.push({ playerIndex, cardStr });

  // next turn
  turnIndex = (turnIndex+1)%3;

  render();
  maybeContinue();
}

// AI always tries to win: choose the highest power legal card when following,
// and when leading choose strong non-trump early unless it needs to win badly (simple).
function chooseAiIndex(playerIndex){
  const legal = legalIndexesFor(playerIndex);
  const hand = players[playerIndex].hand;

  // If following, try to win: pick the max cardPower among legal
  if (trick.length>0){
    let best = legal[0], bestP=-1;
    for (const idx of legal){
      const p = cardPower(hand[idx]);
      if (p>bestP){ bestP=p; best=idx; }
    }
    return best;
  }

  // Leading:
  // keep big jokers/trump slightly later unless needed; otherwise lead strong non-trump
  let best = legal[0], bestScore=-999999;
  for (const idx of legal){
    const c = hand[idx];
    const p = cardPower(c);
    const isTrump = isTrumpCard(c, trumpSuit);
    const joker = isJoker(c);

    let score = p;
    if (joker) score -= 5000;
    if (isTrump) score -= 1200;

    // If AI is behind quota, be more aggressive
    const need = players[playerIndex].quota - players[playerIndex].tricks;
    if (need > 0){
      score += (isTrump ? 800 : 0);
      score += (joker ? 2500 : 0);
    }

    if (score>bestScore){ bestScore=score; best=idx; }
  }
  return best;
}

// Main loop
function roundIsOver(){
  return players.every(p=>p.hand.length===0) && trick.length===0;
}

function clearTrickForNext(winnerIndex){
  trick = [];
  leadSuit = null;
  leaderIndex = winnerIndex;
  turnIndex = winnerIndex;
}

function maybeContinue(){
  if (phase !== "PLAY") return;

  // resolve trick
  if (trick.length===3){
    lockInput = true;
    setTimeout(() => {
      const winner = evaluateTrickWinner();
      players[winner].tricks += 1;
      msgEl.textContent = `${players[winner].id} wins the trick.`;
      render();

      setTimeout(() => {
        clearTrickForNext(winner);
        trickNumber += 1;
        lockInput = false;
        render();

        if (roundIsOver()){
          msgEl.textContent = "Hand over. Click Reset (New Deal).";
          return;
        }
        maybeContinue();
      }, 350);

    }, 350);
    return;
  }

  // AI turns
  if (turnIndex !== 2){
    lockInput = true;
    setTimeout(() => {
      const aiIdx = chooseAiIndex(turnIndex);
      playCard(turnIndex, aiIdx);
      lockInput = false;
      render();
    }, 280);
  }
}

// ===== Events =====
resetBtn.addEventListener("click", () => {
  // Start next hand:
  // Hand 1 already played? Then allow pluck from now on (we’ll wire later).
  const allowPluck = (handNumber >= 1); // pluck begins only after first hand was played
  startNewHand({ allowPluck });
});

pickStartBtn.addEventListener("click", () => startDealerPick());

// trump buttons
wireTrumpButtons();

// ===== Boot =====
function boot(){
  trickMaxEl.textContent = String(trickMax);
  resetDealerPickUI();
  setPhase("DEALER_PICK");
  msgEl.textContent = "Start Dealer Pick to choose the first dealer.";
  render();
}
boot();

// Keep checking if dealer is AI and phase is TRUMP_PICK
setInterval(() => {
  if (phase==="TRUMP_PICK" && !trumpSuit){
    ensureTrumpIfNeeded();
    render();
  }
}, 200);
