# Pluck The Card Game – Development Roadmap

## Phase 1 – Core Trick Engine (Complete)
- 51-card Pluck deck
- Big Joker / Little Joker ranking
- Forced 2♣ opening lead
- Trump selection
- Trump opens rule
- Cannot lead trump until opened
- Must follow suit
- 17 tricks per hand
- Trick winner leads next trick

Status: COMPLETE

---

## Phase 2 – Quota System (Next)
- Dealer sets quotas (8/5/4 etc.)
- Track trick count vs quota
- Detect quota hit / quota missed
- Prepare pluck resolution logic

Status: IN PROGRESS

---

## Phase 3 – Pluck Resolution Engine
- Determine pluck count
- Determine pluck order (least plucks first)
- Enforce pluck rules:
  - Must offer lowest card of suit
  - Plucker must return higher card of same suit
  - No duplicate suit plucks from same player
  - Jokers cannot be forced in pluck

Status: NOT STARTED

---

## Phase 4 – User Accounts & Persistence
- Store users
- Track lifetime plucks
- Track statistics
- Database integration

Status: NOT STARTED

---

## Phase 5 – Multiplayer
- Real-time 3-player online mode
- Matchmaking
- Player ranking

Status: NOT STARTED
