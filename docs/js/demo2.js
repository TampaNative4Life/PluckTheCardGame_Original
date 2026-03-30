// =========================================================
// CHANGE LOG
// 2026-03-30
//
// PURPOSE
// Add game over system using pluck differential scoring
//
// ADDED
// • Game threshold (8 / 10 / 12 ready, default 10)
// • Cumulative plucks tracking
// • Game over trigger
// • Modal display logic
//
// NOT TOUCHED
// • Dealer rotation
// • Quotas
// • Pluck logic
// • Trick logic
// • Rendering system
// =========================================================

document.addEventListener("DOMContentLoaded", () => {

  // =============================
  // EXISTING VARIABLES (UNCHANGED)
  // =============================
  const players = [
    { id: "AI2", hand: [], tricks: 0, quota: 7, plucksEarned: 0, plucksSuffered: 0 },
    { id: "AI3", hand: [], tricks: 0, quota: 6, plucksEarned: 0, plucksSuffered: 0 },
    { id: "YOU", hand: [], tricks: 0, quota: 4, plucksEarned: 0, plucksSuffered: 0 }
  ];

  // =============================
  // NEW GAME TRACKING
  // =============================
  let GAME_THRESHOLD = 10;

  const gameTotals = [
    { earned: 0, against: 0 },
    { earned: 0, against: 0 },
    { earned: 0, against: 0 }
  ];

  // =============================
  // HOOK INTO EXISTING FUNCTION
  // =============================
  const originalCompute = computePlucksEarnedSuffered;

  computePlucksEarnedSuffered = function () {
    originalCompute();

    for (let i = 0; i < 3; i++) {
      gameTotals[i].earned += players[i].plucksEarned;
      gameTotals[i].against += players[i].plucksSuffered;
    }
  };

  // =============================
  // GAME OVER CHECK
  // =============================
  function checkGameOver() {
    for (let i = 0; i < 3; i++) {
      if (gameTotals[i].against >= GAME_THRESHOLD) {
        showGameOver(i);
        return true;
      }
    }
    return false;
  }

  // =============================
  // PATCH END OF HAND
  // =============================
  const originalEndOfHand = endOfHand;

  endOfHand = function () {
    originalEndOfHand();

    if (checkGameOver()) return;
  };

  // =============================
  // GAME OVER DISPLAY
  // =============================
  function showGameOver(loserIndex) {

    const modal = document.getElementById("gameOverModal");
    const body = document.getElementById("gameOverBody");
    const footer = document.getElementById("gameOverFooter");
    const threshold = document.getElementById("gameOverThreshold");

    threshold.textContent = `Threshold: ${GAME_THRESHOLD} Plucks Against`;

    let bestDiff = -999;
    let winnerIndex = 0;

    for (let i = 0; i < 3; i++) {
      const diff = gameTotals[i].earned - gameTotals[i].against;
      if (diff > bestDiff) {
        bestDiff = diff;
        winnerIndex = i;
      }
    }

    body.innerHTML = "";

    const winnerLine = document.createElement("div");
    winnerLine.className = "winnerLine";
    winnerLine.textContent = `🏆 WINNER: ${players[winnerIndex].id}`;
    body.appendChild(winnerLine);

    for (let i = 0; i < 3; i++) {

      const row = document.createElement("div");
      row.className = "playerRow" + (i === loserIndex ? " loser" : "");

      const name = document.createElement("div");
      name.className = "playerName";
      name.textContent = players[i].id + (i === loserIndex ? " ❌" : "");

      const stats = document.createElement("div");
      stats.className = "playerStats";

      const diff = gameTotals[i].earned - gameTotals[i].against;

      stats.textContent =
        `Earned: ${gameTotals[i].earned} • Against: ${gameTotals[i].against} • Diff: ${diff}`;

      row.appendChild(name);
      row.appendChild(stats);
      body.appendChild(row);
    }

    footer.textContent =
      `${players[loserIndex].id} reached ${GAME_THRESHOLD} and leaves the table.`;

    modal.style.display = "flex";
  }

  // =============================
  // NEW GAME BUTTON
  // =============================
  document.getElementById("newGameBtn").addEventListener("click", () => {
    location.reload();
  });

});
