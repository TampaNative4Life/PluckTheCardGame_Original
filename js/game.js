const handContainer = document.querySelector(".hand");
const trickContainer = document.querySelector(".trick");

const demoHand = [
  "A♠",
  "K♦",
  "10♣",
  "7♥",
  "3♠"
];

function renderHand() {
  handContainer.innerHTML = "";

  demoHand.forEach(card => {
    const cardEl = document.createElement("div");
    cardEl.className = "card";
    cardEl.textContent = card;

    cardEl.addEventListener("click", () => {
      playCard(card, cardEl);
    });

    handContainer.appendChild(cardEl);
  });
}

function playCard(card, element) {
  trickContainer.innerHTML = "";

  const played = document.createElement("div");
  played.className = "card";
  played.textContent = card;

  trickContainer.appendChild(played);

  element.remove();
}

document.addEventListener("DOMContentLoaded", renderHand);
