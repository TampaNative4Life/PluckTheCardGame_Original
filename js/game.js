// Pluck Web Demo v19
// - First load: PICK DEALER (3 facedown cards). Reveal AI2/AI3/YOU picks. Lowest deals.
// - First hand: NO PLUCK PHASE. Flow: DEAL -> DEALER SELECTS TRUMP -> PLAY
// - After first hand: DEAL -> PLUCK -> DEALER SELECTS TRUMP -> PLAY
// - Dealer rotates RIGHT each deal after that. Quotas: Dealer=7, Left=6, Right=4
// - AI always tries to WIN (no “mode” toggles).
// - Card images: if assets/cards/<CARD>.png exists we use it; otherwise we auto-fallback to drawn cards.

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.textContent = "ERROR: " + msg;
  console.error(msg);
}
window.addEventListener("error", (e) => showError(e.message || "Unknown script error"));

// Elements
const handEl = document.getElementById("hand");
const trickEl = document.getElementById("trick");
const msgEl = document.getElementById("msg");
const resetBtn = document.getElementById("resetBtn");

const ai2HandEl = document.getElementById("ai2Hand");
const ai3HandEl = document.getElementById("ai3Hand");

const turnBannerEl = document.getElementById("turnBanner");
const phaseLabelEl = document.getElementById("phaseLabel");
const dealerLabelEl = document.getElementById("dealerLabel");

const trumpLabelEl = document.getElementById("trumpLabel");
const trumpOpenLabelEl = document.getElementById("trumpOpenLabel");

const ai2TricksEl = document.getElementById("ai2Tricks");
const ai3TricksEl = document.getElementById("ai3Tricks");
const youTricksEl = document.getElementById("youTricks");
const ai2QuotaLabelEl = document.getElementById("ai2Quota");
const ai3QuotaLabelEl = document.getElementById("ai3Quota");
const youQuotaLabelEl = document.getElementById("youQuota");
const trickNumEl = document.getElementById("trickNum");
const trickMaxEl = document.getElementById("trickMax");
const handNumEl = document.getElementById("handNum");

const pluckPanelEl = document.getElementById("pluckPanel");
const pluckStatusEl = document.getElementById("pluckStatus");
const pluckNextBtn = document.getElementById("pluckNextBtn");
const pluckChoicesEl = document.getElementById("pluckChoices");

const trumpPanelEl = document.getElementById("trumpPanel");
const trumpStatusEl = document.getElementById("trumpStatus");

const pickDealerPanelEl = document.getElementById("pickDealerPanel");
const pickAI2El = document.getElementById("pickAI2");
const pickAI3El = document.getElementById("pickAI3");
const pickYOUEl = document.getElementById("pickYOU");
const deck0 = document.getElementById("deck0");
const deck1 = document.getElementById("deck1");
const deck2 = document.getElementById("deck2");

const pPickDealer = document.getElementById("pPickDealer");
const pDeal = document.getElementById("pDeal");
const pPluck = document.getElementById("pPluck");
const pTrump = document.getElementById("pTrump");
const pPlay = document.getElementById("pPlay");

// ===== Core constants =====
const TOTAL_TRICKS = 17;
const SUITS = ["S","H","D","C"];
const RANKS_NO_2 = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANKS_WITH_2 = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14 };

const CARD_BIG_JOKER = "BJ";
const CARD_LITTLE_JOKER = "LJ";
const CARD_OPEN_LEAD = "2C";

const CARD_IMG_DIR = "assets/cards"; // optional images: assets/cards/AS.png, 10H.png, BJ.png, LJ.png etc.

function suitName(s){ return s==="S"?"Spades":s==="H"?"Hearts":s==="D"?"Diamonds":"Clubs"; }
function suitSymbol(s){ return s==="S"?"♠":s==="H"?"♥":s==="D"?"♦":"♣"; }
function isRedSuit(s){ return s==="H" || s==="D"; }
function isJoker(cs){ return cs===CARD_BIG_JOKER || cs===CARD_LITTLE_JOKER; }

function shuffle(a){
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function makePluckDeck51(){
  const deck=[];
  for (const s of SUITS) for (const r of RANKS_NO_2) deck.push(r+s);
  deck.push("2C");
  deck.push(CARD_BIG_JOKER);
  deck.push(CARD_LITTLE_JOKER);
  return deck;
}

// dealer pick deck: plain 52 (no jokers). Lowest rank deals. Ties broken by suit order C<D<H<S (clubs lowest).
function makeDealerPickDeck52(){
  const deck=[];
  for (const s of SUITS) for (const r of RANKS_WITH_2) deck.push(r+s);
  return deck;
}
const SUIT_TIE_ORDER = { C:1, D:2, H:3, S:4 };

function parseCard(cs, trumpSuit){
  if (cs===CARD_BIG_JOKER) return { raw:cs, kind:"JOKER", suit: trumpSuit, value: 1000 };
  if (cs===CARD_LITTLE_JOKER) return { raw:cs, kind:"JOKER", suit: trumpSuit, value: 900 };
  const suit = cs.slice(-1);
  const rank = cs.slice(0, cs.length-1);
  return { raw:cs, kind:"NORMAL", suit, rank, value: RANK_VALUE[rank] };
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
  { id:"AI2", name:"Player 2 (AI)", hand:[], tricks:0, quota:7, plucksEarned:0, plucksSuffered:0 },
  { id:"AI3", name:"Player 3 (AI)", hand:[], tricks:0, quota:6, plucksEarned:0, plucksSuffered:0 },
  { id:"YOU", name:"You",            hand:[], tricks:0, quota:4, plucksEarned:0, plucksSuffered:0 }
];

let dealerIndex = 0;            // determined by dealer-pick on first load
let handNumber = 1;
let firstHandCompleted = false;

// ===== Memory (public inference only) =====
let memory = null;
function resetMemory(){
  memory = {
    played: new Set(),
    voidSuits: [new Set(), new Set(), new Set()],
    trickLog: []
  };
}

// ===== State =====
let phase = "PICK_DEALER";       // PICK_DEALER | DEAL | PLUCK | TRUMP_PICK | PLAY
let trumpSuit = null;
let trumpOpen = false;

let leaderIndex = 0;
let turnIndex = 0;
let leadSuit = null;
let trick = [];
let lockInput = false;

let trickNumber = 1;
let trickMax = TOTAL_TRICKS;

let pendingPluckQueue = null;    // plucks computed after a hand; applied after next deal
let pluckQueue = [];
let activePluck = null;
let pluckSuitUsedByPair = new Map();

// ===== Phase UI =====
function setChipActive(which){
  [pPickDealer,pDeal,pPluck,pTrump,pPlay].forEach(x=>{
    if (!x) return;
    x.classList.remove("activeChip");
  });
  if (which && which.classList) which.classList.add("activeChip");
}

function setChipLocked(el, locked){
  if (!el) return;
  el.classList.toggle("lockedChip", !!locked);
}

function setPhase(newPhase){
  phase = newPhase;
  phaseLabelEl.textContent = newPhase;

  // Panels
  pickDealerPanelEl.style.display = (newPhase === "PICK_DEALER") ? "block" : "none";
  pluckPanelEl.style.display      = (newPhase === "PLUCK") ? "block" : "none";
  trumpPanelEl.style.display      = (newPhase === "TRUMP_PICK") ? "block" : "none";

  // Chips
  if (newPhase === "PICK_DEALER") setChipActive(pPickDealer);
  if (newPhase === "DEAL") setChipActive(pDeal);
  if (newPhase === "PLUCK") setChipActive(pPluck);
  if (newPhase === "TRUMP_PICK") setChipActive(pTrump);
  if (newPhase === "PLAY") setChipActive(pPlay);

  // Pluck is locked until first hand is completed
  setChipLocked(pPluck, !firstHandCompleted);
}

// ===== Card Faces (image + fallback) =====
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
  const el=document.createElement("div");
  el.className="cardFace"+(disabled?" disabled":"");

  const img=document.createElement("img");
  img.alt=cardStr;
  img.src=`${CARD_IMG_DIR}/${cardStr}.png`;

  img.onerror = () => {
    const fallback = makeCardFaceFallback(cardStr, disabled);
    el.replaceWith(fallback);
  };

  el.appendChild(img);
  return el;
}

// ===== Sorting (your hand) =====
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
    const sg=suitGroup(suit);
    const rv=rankOrder[rank] ?? 0;
    return { sg, r:(100-rv) };
  }
  return hand.slice().sort((a,b)=>{
    const ka=key(a), kb=key(b);
    if (ka.sg!==kb.sg) return ka.sg-kb.sg;
    return ka.r-kb.r;
  });
}

// ===== Render =====
function render(){
  trumpLabelEl.textContent = trumpSuit ? `${trumpSuit} (${suitName(trumpSuit)})` : "(not picked)";
  trumpOpenLabelEl.textContent = trumpOpen ? "Yes" : "No";
  dealerLabelEl.textContent = players[dealerIndex]?.id || "—";

  ai2QuotaLabelEl.textContent = String(players[0].quota);
  ai3QuotaLabelEl.textContent = String(players[1].quota);
  youQuotaLabelEl.textContent = String(players[2].quota);

  ai2TricksEl.textContent = String(players[0].tricks);
  ai3TricksEl.textContent = String(players[1].tricks);
  youTricksEl.textContent = String(players[2].tricks);

  trickNumEl.textContent = String(trickNumber);
  trickMaxEl.textContent = String(trickMax);

  if (handNumEl) handNumEl.textContent = String(handNumber);

  // Hide AI hands
  ai2HandEl.textContent = players[0].hand.map(()=> "🂠").join(" ");
  ai3HandEl.textContent = players[1].hand.map(()=> "🂠").join(" ");

  // Your hand
  handEl.innerHTML="";
  const sorted=sortHandForDisplay(players[2].hand);
  for (const c of sorted){
    const realIdx = players[2].hand.indexOf(c);
    const isYourTurn = (phase==="PLAY" && turnIndex===2);
    const legal = isYourTurn ? legalIndexesFor(2) : [];
    const disabled = !(isYourTurn && legal.includes(realIdx));

    const face=makeCardFace(c, disabled);
    face.onclick=()=>{
      if (disabled) return;
      if (lockInput) return;
      if (phase!=="PLAY" || turnIndex!==2) return;

      const legalNow=legalIndexesFor(2);
      if (!legalNow.includes(realIdx)){
        msgEl.textContent = illegalReason(2, c);
        return;
      }
      playCard(2, realIdx);
    };
    handEl.appendChild(face);
  }

  // Trick
  trickEl.innerHTML="";
  if (!trick.length) trickEl.textContent="(empty)";
  else {
    for (const t of trick){
      const wrap=document.createElement("div");
      wrap.style.display="flex";
      wrap.style.flexDirection="column";
      wrap.style.alignItems="center";
      wrap.style.gap="6px";

      const label=document.createElement("div");
      label.style.fontSize="12px";
      label.style.color="#a6b0c3";
      label.textContent=players[t.playerIndex].id;

      const face=makeCardFace(t.cardStr,true);
      face.style.cursor="default";

      wrap.appendChild(label);
      wrap.appendChild(face);
      trickEl.appendChild(wrap);
    }
  }

  const leadTxt = leadSuit ?? "(none)";
  const turnTxt =
    phase==="PLAY" ? (turnIndex===2 ? "YOUR TURN" : `${players[turnIndex].id} TURN`) : "—";

  turnBannerEl.textContent =
    `Phase: ${phase} • Hand: ${handNumber} • Dealer: ${players[dealerIndex].id} • ${turnTxt} • Lead Suit: ${leadTxt}`;

  if (phase==="PLUCK") renderPluckStatus();
  if (phase==="TRUMP_PICK") renderTrumpPickStatus();
}

// ===== Dealer + quotas =====
function applyQuotasFromDealer(){
  players[dealerIndex].quota = 7;
  players[leftOf(dealerIndex)].quota = 6;
  players[rightOf(dealerIndex)].quota = 4;
}
function rotateDealerRight(){
  dealerIndex = rightOf(dealerIndex);
  applyQuotasFromDealer();
}

// ===== Deal =====
function dealNewHands(){
  resetMemory();

  const deck = shuffle(makePluckDeck51());
  players.forEach(p=>{
    p.hand=[];
    p.tricks=0;
    p.plucksEarned=0;
    p.plucksSuffered=0;
  });

  trickMax = TOTAL_TRICKS;
  trickNumber = 1;
  trick=[];
  leadSuit=null;

  for (let i=0;i<TOTAL_TRICKS;i++){
    players[0].hand.push(deck.pop());
    players[1].hand.push(deck.pop());
    players[2].hand.push(deck.pop());
  }

  trumpSuit=null;
  trumpOpen=false;

  pluckSuitUsedByPair=new Map();
  activePluck=null;

  render();
}

// ===== First Dealer Pick =====
let dealerPickDeck = [];
let dealerPickChoices = [null,null,null];  // [AI2, AI3, YOU]
let dealerPickRevealed = false;

function resetDealerPickUI(){
  pickAI2El.innerHTML="(waiting)";
  pickAI3El.innerHTML="(waiting)";
  pickYOUEl.innerHTML="(click a facedown card below)";
  [deck0,deck1,deck2].forEach(b=>{
    b.disabled=false;
    b.textContent="🂠";
  });
}

function compareDealerPickCards(a, b){
  // returns -1 if a is lower than b
  const sa=a.slice(-1), sb=b.slice(-1);
  const ra=a.slice(0,a.length-1), rb=b.slice(0,b.length-1);
  const va=RANK_VALUE[ra], vb=RANK_VALUE[rb];
  if (va!==vb) return va - vb;
  return (SUIT_TIE_ORDER[sa]||99) - (SUIT_TIE_ORDER[sb]||99);
}

function pickDealerStart(){
  setPhase("PICK_DEALER");
  msgEl.textContent="Pick the dealer: click one facedown card for YOU.";
  dealerPickDeck = shuffle(makeDealerPickDeck52()).slice(0,3); // 3 random cards
  dealerPickChoices = [null,null,null];
  dealerPickRevealed = false;
  resetDealerPickUI();
  render();
}

function revealDealerPick(){
  if (dealerPickRevealed) return;
  dealerPickRevealed=true;

  pickAI2El.innerHTML="";
  pickAI3El.innerHTML="";
  pickYOUEl.innerHTML="";

  pickAI2El.appendChild(makeCardFace(dealerPickChoices[0], true));
  pickAI3El.appendChild(makeCardFace(dealerPickChoices[1], true));
  pickYOUEl.appendChild(makeCardFace(dealerPickChoices[2], true));

  // determine lowest
  const arr = [
    { pi:0, card: dealerPickChoices[0] },
    { pi:1, card: dealerPickChoices[1] },
    { pi:2, card: dealerPickChoices[2] }
  ].sort((x,y)=> compareDealerPickCards(x.card, y.card));

  const lowest = arr[0].pi;
  dealerIndex = lowest; // lowest card deals
  applyQuotasFromDealer();

  msgEl.textContent = `Dealer picked: LOWEST card is ${players[dealerIndex].id}. Starting the first hand now.`;
  render();

  setTimeout(()=>{
    startHandFlow_FirstHand();
  }, 700);
}

function handleYouPickDealerCard(deckIdx){
  if (phase!=="PICK_DEALER") return;

  // YOU chooses dealerPickDeck[deckIdx]
  const youCard = dealerPickDeck[deckIdx];
  dealerPickChoices[2] = youCard;

  // remaining cards for AI2, AI3
  const remaining = dealerPickDeck.filter((_,i)=> i!==deckIdx);
  dealerPickChoices[0] = remaining[0];
  dealerPickChoices[1] = remaining[1];

  // disable deck buttons + show which one you picked
  [deck0,deck1,deck2].forEach((b,i)=>{
    b.disabled=true;
    b.textContent = (i===deckIdx) ? "✅" : "🂠";
  });

  msgEl.textContent = "Cards chosen. Revealing…";
  revealDealerPick();
}

if (deck0 && deck1 && deck2){
  deck0.onclick = ()=> handleYouPickDealerCard(0);
  deck1.onclick = ()=> handleYouPickDealerCard(1);
  deck2.onclick = ()=> handleYouPickDealerCard(2);
}

// ===== Plucks =====
function computePlucksEarnedAndSuffered(){
  for (const p of players){
    p.plucksEarned = Math.max(0, p.tricks - p.quota);
    p.plucksSuffered = Math.max(0, p.quota - p.tricks);
  }
}
function pluckerOrder(){
  const tiebreak=[dealerIndex,leftOf(dealerIndex),rightOf(dealerIndex)];
  const idx=[0,1,2];
  idx.sort((a,b)=>{
    const da=players[a].plucksEarned, db=players[b].plucksEarned;
    if (db!==da) return db-da;
    return tiebreak.indexOf(a)-tiebreak.indexOf(b);
  });
  return idx.filter(i=>players[i].plucksEarned>0);
}
function victimOrder(){
  const tiebreak=[dealerIndex,leftOf(dealerIndex),rightOf(dealerIndex)];
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

  const remE=new Map(pluckers.map(i=>[i,players[i].plucksEarned]));
  const remS=new Map(victims.map(i=>[i,players[i].plucksSuffered]));

  for (const plucker of pluckers){
    while ((remE.get(plucker)||0)>0){
      const victim = victims
        .filter(v=>(remS.get(v)||0)>0)
        .sort((a,b)=>(remS.get(b)||0)-(remS.get(a)||0))[0];
      if (victim===undefined) break;

      queue.push({ pluckerIndex: plucker, pluckeeIndex: victim });

      remE.set(plucker,(remE.get(plucker)||0)-1);
      remS.set(victim,(remS.get(victim)||0)-1);
    }
  }
  return queue;
}

function removeCardFromHand(playerIndex, cardStr){
  const i=players[playerIndex].hand.indexOf(cardStr);
  if (i>=0) players[playerIndex].hand.splice(i,1);
}
function lowestOfSuitNonJoker(playerIndex, suit){
  const cards=players[playerIndex].hand.filter(c=>!isJoker(c) && c.slice(-1)===suit);
  if (!cards.length) return null;
  cards.sort((a,b)=>(RANK_VALUE[a.slice(0,-1)]||0)-(RANK_VALUE[b.slice(0,-1)]||0));
  return cards[0];
}
function highestOfSuitNonJoker(playerIndex, suit){
  const cards=players[playerIndex].hand.filter(c=>!isJoker(c) && c.slice(-1)===suit);
  if (!cards.length) return null;
  cards.sort((a,b)=>(RANK_VALUE[b.slice(0,-1)]||0)-(RANK_VALUE[a.slice(0,-1)]||0));
  return cards[0];
}
function pairKey(pluckerI, pluckeeI){ return `${pluckerI}-${pluckeeI}`; }
function markPluckSuitUsed(pluckerI, pluckeeI, suit){
  const key=pairKey(pluckerI,pluckeeI);
  if (!pluckSuitUsedByPair.has(key)) pluckSuitUsedByPair.set(key,new Set());
  pluckSuitUsedByPair.get(key).add(suit);
}
function availablePluckSuits(pluckerI, pluckeeI){
  const used=pluckSuitUsedByPair.get(pairKey(pluckerI,pluckeeI)) || new Set();
  const suits=[];
  for (const s of SUITS){
    if (used.has(s)) continue;
    if (!lowestOfSuitNonJoker(pluckerI,s)) continue;
    suits.push(s);
  }
  return suits;
}
function attemptPluck(pluckerI, pluckeeI, suit){
  const giveLow=lowestOfSuitNonJoker(pluckerI,suit);
  if (!giveLow) return { ok:false, reason:`Plucker has no ${suit}.` };

  const takeHigh=highestOfSuitNonJoker(pluckeeI,suit);
  if (!takeHigh) return { ok:false, reason:`Victim has no ${suit} to return.` };

  removeCardFromHand(pluckerI,giveLow);
  removeCardFromHand(pluckeeI,takeHigh);
  players[pluckerI].hand.push(takeHigh);
  players[pluckeeI].hand.push(giveLow);
  markPluckSuitUsed(pluckerI,pluckeeI,suit);
  return { ok:true, giveLow, takeHigh };
}
function clearPluckChoicesUI(){
  if (pluckChoicesEl) pluckChoicesEl.innerHTML="";
}

function renderPluckStatus(){
  clearPluckChoicesUI();

  if (pluckQueue.length===0){
    pluckStatusEl.textContent="No plucks to process.";
    pluckNextBtn.disabled=true;
    return;
  }
  if (!activePluck) activePluck=pluckQueue[0];

  const pluckerI=activePluck.pluckerIndex;
  const pluckeeI=activePluck.pluckeeIndex;
  const plucker=players[pluckerI];
  const pluckee=players[pluckeeI];

  const suits=availablePluckSuits(pluckerI,pluckeeI);

  // YOU pluck: choose suit (manual). Wrong suit = LOST.
  if (pluckerI===2){
    pluckNextBtn.disabled=true;

    if (!suits.length){
      pluckStatusEl.textContent=`You are plucking ${pluckee.name}, but you have no suit to attempt. Skipping.`;
      pluckQueue.shift(); activePluck=null;
      if (!pluckQueue.length) moveToTrumpPick();
      render();
      return;
    }

    pluckStatusEl.textContent =
      `You are plucking ${pluckee.name}. Choose a suit. WARNING: wrong suit attempt = LOST.`;

    for (const s of suits){
      const give=lowestOfSuitNonJoker(pluckerI,s);
      const btn=document.createElement("button");
      btn.className="btn";
      btn.innerHTML = `<strong>${s}</strong> (${suitName(s)})<div style="font-size:12px;opacity:.85;">Give: ${give||"(none)"}</div>`;
      btn.onclick=()=>{
        const res=attemptPluck(pluckerI,pluckeeI,s);
        if (!res.ok){
          markPluckSuitUsed(pluckerI,pluckeeI,s);
          pluckStatusEl.textContent=`FAILED: ${res.reason} — Pluck LOST. Next.`;
        } else {
          pluckStatusEl.textContent=`Pluck ${s}: gave ${res.giveLow}, received ${res.takeHigh}.`;
        }
        pluckQueue.shift(); activePluck=null;
        if (!pluckQueue.length) moveToTrumpPick();
        render();
      };
      pluckChoicesEl.appendChild(btn);
    }
    return;
  }

  // AI pluck: click next
  pluckNextBtn.disabled=false;
  pluckStatusEl.textContent = `${plucker.name} is plucking ${pluckee.name}. Candidate suits: ${suits.length ? suits.join(", ") : "(none)"} (wrong suit loses pluck).`;
}

function runOnePluck(){
  if (phase!=="PLUCK") return;
  if (!pluckQueue.length) return;
  if (!activePluck) activePluck=pluckQueue[0];

  const pluckerI=activePluck.pluckerIndex;
  const pluckeeI=activePluck.pluckeeIndex;

  // if YOU is plucker, must use buttons
  if (pluckerI===2){
    pluckStatusEl.textContent="Choose a suit button to pluck (wrong suit loses).";
    render();
    return;
  }

  const candidates=availablePluckSuits(pluckerI,pluckeeI);
  if (!candidates.length){
    pluckStatusEl.textContent=`No available suit for ${players[pluckerI].name}. Skipped.`;
    pluckQueue.shift(); activePluck=null;
    if (!pluckQueue.length) moveToTrumpPick();
    render();
    return;
  }

  // AI blind: choose cheapest give card (low rank). Simple + mean.
  let pick=candidates[0];
  let best=999;
  for (const s of candidates){
    const low=lowestOfSuitNonJoker(pluckerI,s);
    const v=low ? (RANK_VALUE[low.slice(0,-1)]||99) : 99;
    if (v<best){ best=v; pick=s; }
  }

  const res=attemptPluck(pluckerI,pluckeeI,pick);
  if (!res.ok){
    markPluckSuitUsed(pluckerI,pluckeeI,pick);
    pluckStatusEl.textContent=`${players[pluckerI].name} FAILED ${pick} (${res.reason}). Pluck LOST.`;
  } else {
    pluckStatusEl.textContent=`${players[pluckerI].name} plucked ${pick}: gave ${res.giveLow}, received ${res.takeHigh}.`;
  }

  pluckQueue.shift(); activePluck=null;
  if (!pluckQueue.length) moveToTrumpPick();
  render();
}

// ===== Trump Pick =====
function computeTrumpCallerIndex(){
  // dealer selects trump (your rule)
  return dealerIndex;
}

function aiChooseTrumpFromOwnHand(aiIndex){
  const hand=players[aiIndex].hand;
  const suitScore={ S:0,H:0,D:0,C:0 };

  for (const cs of hand){
    if (isJoker(cs)){
      suitScore.S+=6; suitScore.H+=6; suitScore.D+=6; suitScore.C+=6;
      continue;
    }
    const suit=cs.slice(-1);
    const rank=cs.slice(0,cs.length-1);
    const v=RANK_VALUE[rank]||0;

    suitScore[suit]+=2;
    if (v>=11) suitScore[suit]+=(v-10)*2;
    else suitScore[suit]+=Math.max(0,v-6)*0.5;
  }

  let bestSuit="H", bestScore=-Infinity;
  for (const s of SUITS){
    if (suitScore[s]>bestScore){ bestScore=suitScore[s]; bestSuit=s; }
  }
  return bestSuit;
}

function setTrump(suit){
  trumpSuit=suit;
  // keep your existing behavior: trump opens if Clubs (you were using that)
  trumpOpen = (trumpSuit==="C");
}

function renderTrumpPickStatus(){
  if (trumpSuit){
    trumpStatusEl.textContent=`Trump picked: ${trumpSuit} (${suitName(trumpSuit)}).`;
    return;
  }
  const caller=players[computeTrumpCallerIndex()];
  if (caller.id==="YOU"){
    trumpStatusEl.textContent=`You are the dealer (quota ${caller.quota}). Select trump.`;
  } else {
    trumpStatusEl.textContent=`${caller.name} is dealer (quota ${caller.quota}). AI will select trump.`;
  }
}

function wireTrumpButtons(){
  const btns = trumpPanelEl.querySelectorAll("button[data-trump]");
  btns.forEach(b=>{
    b.onclick=()=>{
      if (phase!=="TRUMP_PICK") return;
      if (trumpSuit) return;

      const caller=computeTrumpCallerIndex();
      if (caller!==2) return; // only you click if YOU are dealer

      const suit=b.getAttribute("data-trump");
      if (!SUITS.includes(suit)) return;

      setTrump(suit);
      msgEl.textContent=`You selected trump: ${suit} (${suitName(suit)}).`;
      moveToPlay();
      render();
    };
  });
}

// ===== Play rules =====
function hasNonTrump(playerIndex){
  return players[playerIndex].hand.some(c=>!isTrumpCard(c,trumpSuit));
}

function illegalReason(playerIndex, cardStr){
  // First lead of Trick 1: must play 2C IF you have it.
  if (trickNumber===1 && trick.length===0 && players[playerIndex].hand.includes(CARD_OPEN_LEAD)){
    if (cardStr!==CARD_OPEN_LEAD) return "First lead must be 2C (if you have it).";
  }

  // Trump not open: cannot lead trump if you have non-trump
  if (trick.length===0 && !trumpOpen && trumpSuit!=="C"){
    if (isTrumpCard(cardStr,trumpSuit) && hasNonTrump(playerIndex)) return "Trump not open. Lead a non-trump card.";
  }

  // Must follow suit if possible
  if (trick.length>0){
    const mustSuit=leadSuit;
    const hasSuit = players[playerIndex].hand.some(c=>cardSuitForFollow(c,trumpSuit)===mustSuit);
    if (hasSuit && cardSuitForFollow(cardStr,trumpSuit)!==mustSuit) return `You must follow suit: ${mustSuit}.`;
  }
  return "That play is not allowed.";
}

function legalIndexesFor(playerIndex){
  const hand=players[playerIndex].hand;

  if (trickNumber===1 && trick.length===0 && hand.includes(CARD_OPEN_LEAD)){
    return hand.map((c,i)=>({c,i})).filter(x=>x.c===CARD_OPEN_LEAD).map(x=>x.i);
  }

  if (trick.length===0 && !trumpOpen && trumpSuit!=="C"){
    const nonTrumpIdx = hand.map((c,i)=>({c,i})).filter(x=>!isTrumpCard(x.c,trumpSuit)).map(x=>x.i);
    if (nonTrumpIdx.length) return nonTrumpIdx;
    return hand.map((_,i)=>i);
  }

  if (trick.length>0){
    const suited = hand.map((c,i)=>({c,i})).filter(x=>cardSuitForFollow(x.c,trumpSuit)===leadSuit).map(x=>x.i);
    return suited.length ? suited : hand.map((_,i)=>i);
  }

  return hand.map((_,i)=>i);
}

function setLeadSuitFromFirstCard(cardStr){
  leadSuit = cardSuitForFollow(cardStr,trumpSuit);
}
function updateTrumpOpen(cardStr){
  if (!trumpOpen && isTrumpCard(cardStr,trumpSuit)) trumpOpen=true;
}

function cardPower(cardStr){
  if (cardStr===CARD_BIG_JOKER) return 1000000;
  if (cardStr===CARD_LITTLE_JOKER) return 900000;
  const c=parseCard(cardStr,trumpSuit);
  if (isTrumpCard(cardStr,trumpSuit)) return 10000 + c.value;
  return c.value;
}

function evaluateTrickWinner(){
  const anyTrump = trick.some(t=>isTrumpCard(t.cardStr,trumpSuit));
  if (anyTrump){
    let bestPi=trick[0].playerIndex;
    let bestP=-1;
    for (const t of trick){
      if (!isTrumpCard(t.cardStr,trumpSuit)) continue;
      const p=cardPower(t.cardStr);
      if (p>bestP){ bestP=p; bestPi=t.playerIndex; }
    }
    return bestPi;
  }

  let bestPi=trick[0].playerIndex;
  let bestV=-1;
  for (const t of trick){
    if (cardSuitForFollow(t.cardStr,trumpSuit)!==leadSuit) continue;
    const c=parseCard(t.cardStr,trumpSuit);
    if (c.value>bestV){ bestV=c.value; bestPi=t.playerIndex; }
  }
  return bestPi;
}

function clearTrickForNext(winnerIndex){
  trick=[];
  leadSuit=null;
  leaderIndex=winnerIndex;
  turnIndex=winnerIndex;
}

function roundIsOver(){
  return players.every(p=>p.hand.length===0) && trick.length===0;
}

function updateVoidMemory(playerIndex, playedCard){
  if (trick.length===0) return;
  const mustSuit=leadSuit;
  const playedSuit=cardSuitForFollow(playedCard,trumpSuit);
  if (playedSuit!==mustSuit){
    memory.voidSuits[playerIndex].add(mustSuit);
  }
}

function playCard(playerIndex, handIdx){
  const cardStr = players[playerIndex].hand.splice(handIdx,1)[0];
  if (!cardStr){ showError("Tried to play empty card."); return; }

  if (trick.length===0) setLeadSuitFromFirstCard(cardStr);
  else updateVoidMemory(playerIndex, cardStr);

  trick.push({ playerIndex, cardStr });
  memory.played.add(cardStr);

  updateTrumpOpen(cardStr);

  turnIndex = (turnIndex+1)%3;
  render();
  maybeContinue();
}

// ===== AI: always tries to WIN =====
function wouldWinIfPlayedNow(playerIndex, cardStr){
  const temp = trick.concat([{ playerIndex, cardStr }]);
  const anyTrump = temp.some(t=>isTrumpCard(t.cardStr,trumpSuit));

  if (anyTrump){
    let bestPi=temp[0].playerIndex;
    let bestP=-1;
    for (const t of temp){
      if (!isTrumpCard(t.cardStr,trumpSuit)) continue;
      const p=cardPower(t.cardStr);
      if (p>bestP){ bestP=p; bestPi=t.playerIndex; }
    }
    return bestPi===playerIndex;
  } else {
    let bestPi=temp[0].playerIndex;
    let bestV=-1;
    for (const t of temp){
      if (cardSuitForFollow(t.cardStr,trumpSuit)!==leadSuit) continue;
      const v=parseCard(t.cardStr,trumpSuit).value;
      if (v>bestV){ bestV=v; bestPi=t.playerIndex; }
    }
    return bestPi===playerIndex;
  }
}

function chooseAiIndex(playerIndex){
  const legal = legalIndexesFor(playerIndex);
  const hand = players[playerIndex].hand;

  // If can win this trick now, choose the LOWEST card that still wins (mean + efficient).
  // Otherwise dump the LOWEST legal.
  const winning = [];
  for (const idx of legal){
    const c = hand[idx];
    if (trick.length===0){
      // leading: "winning" is unknown until others play. Lead strong-ish if you still need tricks,
      // but overall: lead mid/high; keep jokers for kills.
      // We'll treat lead choice with a score.
      winning.push({ idx, score: scoreLead(playerIndex, c) });
    } else {
      if (wouldWinIfPlayedNow(playerIndex, c)){
        winning.push({ idx, score: scoreWinCard(c) });
      }
    }
  }

  if (trick.length===0){
    // lead: choose highest-scoring lead
    winning.sort((a,b)=> b.score - a.score);
    return winning[0].idx;
  }

  if (winning.length){
    // choose minimal power that still wins => lowest scoreWinCard
    winning.sort((a,b)=> a.score - b.score);
    return winning[0].idx;
  }

  // cannot win => dump lowest power legal
  let bestIdx=legal[0];
  let bestP=9999999;
  for (const idx of legal){
    const p=cardPower(hand[idx]);
    if (p<bestP){ bestP=p; bestIdx=idx; }
  }
  return bestIdx;
}

function scoreWinCard(cardStr){
  // lower is better (use less power to win)
  return cardPower(cardStr);
}

function scoreLead(playerIndex, cardStr){
  // higher is better
  const need = players[playerIndex].quota - players[playerIndex].tricks;
  const p = cardPower(cardStr);
  const isJ = isJoker(cardStr);

  let score = 0;
  if (need > 0){
    score += p;
    if (isJ) score -= 500000; // do not waste jokers on lead unless needed
    if (isTrumpCard(cardStr,trumpSuit) && !trumpOpen) score -= 2000;
  } else {
    // if already met quota, lead low to avoid extra tricks
    score -= p;
    if (isJ) score -= 100000; // never leak jokers
  }
  return score;
}

// ===== Trick start + loop =====
function startTrickOne(){
  trick=[];
  leadSuit=null;
  trickNumber=1;

  trumpOpen = (trumpSuit==="C");

  // leader: whoever holds 2C leads trick 1
  let whoHas2C=0;
  for (let pi=0;pi<3;pi++){
    if (players[pi].hand.includes(CARD_OPEN_LEAD)){ whoHas2C=pi; break; }
  }
  leaderIndex=whoHas2C;
  turnIndex=whoHas2C;

  render();
  maybeContinue();
}

function maybeContinue(){
  if (phase!=="PLAY") return;

  if (trick.length===3){
    lockInput=true;
    setTimeout(()=>{
      const winner=evaluateTrickWinner();
      players[winner].tricks += 1;
      msgEl.textContent = `${players[winner].name} wins the trick.`;
      render();

      setTimeout(()=>{
        clearTrickForNext(winner);
        trickNumber += 1;
        lockInput=false;
        render();

        if (roundIsOver()){
          computePlucksEarnedAndSuffered();
          pendingPluckQueue = buildPluckQueueFromScores();

          firstHandCompleted = true; // unlock pluck after first hand
          setChipLocked(pPluck, false);

          msgEl.textContent = "Hand over. Click Reset (Next Deal).";
          return;
        }
        maybeContinue();
      }, 250);
    }, 250);
    return;
  }

  if (turnIndex !== 2){
    lockInput=true;
    setTimeout(()=>{
      const aiIdx = chooseAiIndex(turnIndex);
      playCard(turnIndex, aiIdx);
      lockInput=false;
      render();
    }, 220);
  }
}

// ===== Flow control =====
function moveToTrumpPick(){
  setPhase("TRUMP_PICK");
  renderTrumpPickStatus();
  render();

  const caller=computeTrumpCallerIndex(); // dealer
  if (caller !== 2){
    const suit = aiChooseTrumpFromOwnHand(caller);
    setTrump(suit);
    msgEl.textContent = `${players[caller].name} selected trump: ${suit} (${suitName(suit)}).`;
    moveToPlay();
    render();
  } else {
    msgEl.textContent = "Select trump now.";
  }
}

function moveToPlay(){
  setPhase("PLAY");
  msgEl.textContent = "Trump set. Trick 1 begins.";
  startTrickOne();
}

function startPluckPhaseAfterDeal(){
  // First hand: skip plucks entirely
  if (!firstHandCompleted){
    setPhase("TRUMP_PICK");
    msgEl.textContent = "First hand: no plucks. Dealer selects trump.";
    moveToTrumpPick();
    return;
  }

  setPhase("PLUCK");

  pluckQueue = (pendingPluckQueue && pendingPluckQueue.length) ? pendingPluckQueue.slice() : [];
  pendingPluckQueue = null;

  if (!pluckQueue.length){
    msgEl.textContent = "No plucks this hand. Dealer selects trump.";
    moveToTrumpPick();
  } else {
    msgEl.textContent = "Pluck phase begins (manual).";
    render();
  }
}

// ===== Events =====
pluckNextBtn.addEventListener("click", ()=> runOnePluck());

resetBtn.addEventListener("click", ()=>{
  // Next deal: rotate dealer right (after the first hand started)
  if (firstHandCompleted){
    rotateDealerRight();
    handNumber += 1;
  }
  applyQuotasFromDealer();
  setPhase("DEAL");
  msgEl.textContent = "Dealing…";
  render();

  dealNewHands();

  // After each deal: either (first hand) go straight to trump pick, else pluck then trump
  startPluckPhaseAfterDeal();
});

wireTrumpButtons();

// ===== Start =====
function startHandFlow_FirstHand(){
  // First hand does NOT rotate dealer further (dealer already chosen by pick)
  applyQuotasFromDealer();
  handNumber = 1;

  setPhase("DEAL");
  msgEl.textContent = "Dealing the first hand…";
  render();

  dealNewHands();

  // Skip plucks for first hand
  startPluckPhaseAfterDeal();
}

// Boot
pickDealerStart();
render();
console.log("Pluck Demo v19 loaded");
