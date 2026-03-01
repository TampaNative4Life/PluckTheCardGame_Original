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
  return
