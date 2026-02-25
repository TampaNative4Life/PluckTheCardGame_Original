const handEl = document.getElementById("hand");
const trickEl = document.getElementById("trick");
const msgEl = document.getElementById("msg");
const resetBtn = document.getElementById("resetBtn");

let hand = ["AS","KH","QD","JC","10S","9H","8D"];
let trick = [];

function render() {
  if (!handEl || !trickEl || !msgEl || !resetBtn) {
    console.error("Missing required elements. Check game.html IDs: hand, trick, msg, resetBtn");
    return;
  }

  handEl.innerHTML = "";
  hand.forEach((c, idx) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = c;
    b.onclick = () => play(idx);
    handEl.appendChild(b);
  });

  trickEl.textContent = trick.length ? trick.join("  |  ") : "(empty)";
  msgEl.textContent = hand.length ? "Click a card to play it to the trick." : "Hand is empty. Hit Reset.";
}

function play(index) {
  const card = hand.splice(index, 1)[0];
  trick.push(card);
  render();
}

resetBtn.onclick = () => {
  hand = ["AS","KH","QD","JC","10S","9H","8D"];
  trick = [];
  render();
};

render();
