<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pluck Demo</title>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>

  <header class="nav">
    <a class="brand" href="index.html">
      <img src="assets/PluckTheCardGame_Logo.jpg" alt="Pluck Logo">
      <span>PLUCK</span>
    </a>
    <nav class="navlinks">
      <a href="game.html">Play Demo</a>
      <a href="rules.html">Rules</a>
      <a href="about.html">About</a>
    </nav>
  </header>

  <main class="container">
    <h1>Playable Demo (Step 1)</h1>
    <div class="grid">
      <div class="card">
        <h3>Your Hand</h3>
        <div id="hand"></div>
      </div>

      <div class="card">
        <h3>Trick</h3>
        <div id="trick">(empty)</div>
        <p style="color:#cfcfcf; margin-top:12px;">Turn: <span id="turn">You</span></p>
        <button class="btn btn-secondary" id="resetBtn">Reset</button>
      </div>
    </div>
  </main>

  <footer class="footer">
    © 2026 Pluck The Card Game
  </footer>

  <script src="js/game.js"></script>
</body>
</html>
