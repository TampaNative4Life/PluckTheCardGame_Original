<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
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

    <div class="playLayout">

      <!-- LEFT PANEL -->
      <aside class="sidePanel">
        <div class="card">
          <h3 style="margin-top:0;">Initial Pick (Choose Dealer)</h3>
          <p class="hint" style="margin-top:6px;">
            Each player draws 1 card. Lowest card becomes Dealer. If tied for lowest, repack and pick again.
          </p>

          <div id="pickArea" style="margin-top:12px;">
            <div class="buttons" style="justify-content:flex-start;flex-wrap:wrap;">
              <button class="btn" id="pickBtn">Pick Cards</button>
              <button class="btn btn-secondary" id="pickOkBtn" disabled>OK (Start Game)</button>
              <button class="btn btn-secondary" id="pickReBtn" disabled>Re-Pick</button>
            </div>

            <div style="margin-top:12px;">
              <div class="pmeta"><strong>Status:</strong> <span id="pickStatus">Click “Pick Cards”.</span></div>
            </div>

            <div class="pickRowCompact" style="margin-top:12px;">
              <div class="pickSlot">
                <div class="pickName">AI2</div>
                <div id="pickAI2" class="pickCardSlot smallSlot">(none)</div>
              </div>
              <div class="pickSlot">
                <div class="pickName">AI3</div>
                <div id="pickAI3" class="pickCardSlot smallSlot">(none)</div>
              </div>
              <div class="pickSlot">
                <div class="pickName">YOU</div>
                <div id="pickYOU" class="pickCardSlot smallSlot">(none)</div>
              </div>
            </div>

            <div style="margin-top:12px;" class="pmeta">
              <strong>Dealer:</strong> <span id="dealerLabel">(not set)</span>
            </div>
          </div>
        </div>

        <!-- Trump + Quotas FLUSH ROW -->
        <div class="sideRow">
          <div class="card trumpMini">
            <h3 style="margin-top:0;">Trump</h3>
            <div class="pmeta">
              <strong>Suit:</strong> <span id="trumpLabel">(not picked)</span>
              <span class="dotSep">•</span>
              <strong>Open:</strong> <span id="trumpOpenLabel">No</span>
            </div>

            <div class="trumpAceWrap">
              <div class="pmeta"><strong>Ace:</strong></div>
              <div id="trumpAceSlot" class="pickCardSlot miniSlot">(none)</div>
            </div>
          </div>

          <div class="card quotaMini">
            <h3 style="margin-top:0;">Quotas</h3>
            <div class="quotaRow">
              <div class="qItem">
                <div class="qName">AI2</div>
                <div class="qNums">Q: <span id="ai2Quota">7</span> • T: <span id="ai2Tricks">0</span></div>
              </div>
              <div class="qItem">
                <div class="qName">AI3</div>
                <div class="qNums">Q: <span id="ai3Quota">6</span> • T: <span id="ai3Tricks">0</span></div>
              </div>
              <div class="qItem">
                <div class="qName">YOU</div>
                <div class="qNums">Q: <span id="youQuota">4</span> • T: <span id="youTricks">0</span></div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- RIGHT PANEL -->
      <section class="mainPlay">

        <div class="card phaseCard">
          <div class="phaseRow">
            <div id="pDeal"  class="phaseChip">1) The Deal</div>
            <div class="phaseArrow">→</div>
            <div id="pPluck" class="phaseChip">2) Pluck</div>
            <div class="phaseArrow">→</div>
            <div id="pTrump" class="phaseChip">3) Dealer Selects Trump</div>
            <div class="phaseArrow">→</div>
            <div id="pPlay"  class="phaseChip">4) Play</div>
          </div>

          <div class="phaseMeta">
            <div>
              <strong>Current Phase:</strong> <span id="phaseLabel">PICK_DEALER</span>
              <span class="dotSep">•</span>
              <strong>Trick:</strong> <span id="trickNum">0</span>/<span id="trickMax">17</span>
              <span class="dotSep">•</span>
              <strong>Dealer:</strong> <span id="dealerBanner">(not set)</span>
            </div>
          </div>

          <div id="turnBanner" class="turnBanner"></div>
        </div>

        <div class="topbar" style="margin-top:12px;">
          <div class="topbar-left">
            <div class="metaRow"></div>
          </div>
          <div class="topbar-right">
            <div class="buttons">
              <button class="btn btn-secondary" id="resetBtn">Reset (New Deal)</button>
            </div>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <h3>AI2 (hidden hand)</h3>
            <div id="ai2Hand" class="handRow"></div>
          </div>
          <div class="card">
            <h3>AI3 (hidden hand)</h3>
            <div id="ai3Hand" class="handRow"></div>
          </div>
        </div>

        <div class="card pluckPanel" id="pluckPanel" style="display:none;">
          <h3>Pluck Phase</h3>
          <p id="pluckStatus" class="msg"></p>
          <div id="pluckChoices" class="buttons" style="flex-wrap:wrap;"></div>
          <button class="btn" id="pluckNextBtn">Run Next Pluck</button>
          <p class="hint">Wrong suit attempt = pluck LOST (no re-pick).</p>
        </div>

        <div class="card" id="trumpPanel" style="display:none;">
          <h3>Dealer Selects Trump</h3>
          <p id="trumpStatus" class="msg"></p>
          <div class="buttons" style="flex-wrap:wrap;">
            <button class="btn" data-trump="S">S (Spades)</button>
            <button class="btn" data-trump="H">H (Hearts)</button>
            <button class="btn" data-trump="D">D (Diamonds)</button>
            <button class="btn" data-trump="C">C (Clubs)</button>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <h3>Your Hand</h3>
            <div id="hand" class="hand"></div>
            <p id="msg" class="msg"></p>
            <p class="hint">Tap/click a card to play. Must follow suit if possible. No leading trump until opened (unless you only have trump).</p>
          </div>

          <div class="card">
            <h3>Trick</h3>
            <div class="trickBox" id="trick">(empty)</div>
            <p class="hint">Trick winner leads next trick.</p>
          </div>
        </div>

      </section>
    </div>

  </main>

  <footer class="footer">© 2026 Pluck The Card Game</footer>

  <script src="js/game.js"></script>
</body>
</html>
