const handEl = document.getElementById("hand");
const trickEl = document.getElementById("trick");
const resetBtn = document.getElementById("resetBtn");

let hand = ["AS","KH","QD","JC","10S","9H","8D"];
let trick = [];

function render() {
  handEl.innerHTML = "";
  hand.forEach((c, idx) => {
    const b = document.createElement("button");
    b.className = "btn btn-secondary";
    b.style.margin = "6px";
    b.textContent = c;
    b.onclick = () => play(idx);
    handEl.appendChild(b);
  });

  trickEl.textContent = trick.length ? trick.join("  |  ") : "(empty)";
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
