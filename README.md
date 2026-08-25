# ⚔️ Sword Fencing

> A fast-paced, high-octane 30-second stickman fencing duel game.  
> Win through 10 precision slashes, a devastating 1-hit Charged Heavy Strike, or unleash the ultimate **Qi Energy Blast**!

---

## 🎮 Game Overview

**Sword Fencing** is a lightweight, ultra-responsive 2D canvas fighting game designed for both mobile touch devices and desktop web browsers. Featuring full real-time multiplayer, intelligent CPU opponents, customizable knight armor & helmets, and a live spectator betting system.

---

## 🕹️ Game Modes

### 1. ⚔️ VS CPU Mode (Streak Challenge)
- Battle against an adaptive AI that becomes progressively faster and smarter with each victory.
- Earn Gold for every win, unlock special gear, and climb the local **TOP 3 Leaderboard**.

### 2. 🌐 Online Multiplayer (Socket.io)
- Real-time peer-to-peer battle with customizable Room Passwords.
- Fully synchronized physics, hitboxes, character states, and full visual cosmetic gear (Armor, Helmets, Visors, Capes, God Auras).

### 3. 🎰 Watch & Bet Match (CPU vs CPU)
- Spectate high-level AI battles.
- Place bets (1G, 3G, 5G, or ALL-IN) on CPU 1 or CPU 2 with a **2x Gold payout** for winning predictions.

### 4. 🔰 Beginner Event: Face-Visor Festival (`event.html`)
- A permanent training event featuring mild-difficulty AI.
- Win consecutive matches to unlock exclusive Neon Visor colors:
  - **1 Win:** 🔷 Cyber Cyan Visor
  - **3 Streak:** 🔥 Flame Red Visor
  - **5 Streak (Champion):** 👑 God Crown Gold Visor

---

## 🥋 Combat Mechanics & Controls

| Action | Desktop Key | Mobile Touch Button | Description |
| :--- | :---: | :---: | :--- |
| **Move Left / Right** | `A` / `D` | `◀` / `▶` | Character movement & spacing. |
| **Jump** | `W` | `JUMP` | Leap into the air to dodge attacks. |
| **Normal Attack** | `F` (Tap) | `ATTACK` (Tap) | Fast slash (deals 1 HP damage). |
| **Charged Strike** | `F` (Hold) | `ATTACK` (Hold) | Charges up a **1-Hit KO Heavy Slash** that breaks guards and blows the opponent into the sky. |
| **Aerial Attack** | `W` + `F` | `JUMP` + `ATTACK` | Diving downward slash from the air. |
| **SPECIAL (Qi Blast)** | `SPACE` | `⚡ SPECIAL` | Unleashes a long-range projectile when SP is full. |

### 💥 Combat Highlights
- **Guard Break:** Hitting a guarding enemy with a Heavy Strike triggers a Guard Break, staggering them for a free follow-up.
- **Dramatic KO Blowaway:** Knocking out an opponent with a Heavy Strike or Special Blast triggers a **dramatic slow-motion launch (`blowaway`)**.

---

## 🎨 Skin Workshop & Customization

Equip, recolor, and preview your custom warrior in real-time inside the **Skin Workshop**:

1. **Body & Leg Colors:** 10 dynamic palette colors with a progressive pricing system (`15G ➔ 20G ➔ 25G...`).
2. **Knight Plate Armor (Upper & Lower):** Heavy multi-layered plate armor with gilded trims and knee guards (Unlocked at **10 CPU Wins**).
3. **Full-Helm Knight Helmet:** Premium luxury helmet with knight crest and golden highlights (Unlocked at **30 CPU Wins**, priced at `50G ➔ 70G ➔ 90G...`).
4. **Face Visors:** Neon-glowing visor eyes unlocked via the Beginner Event or shop palette.
5. **Veteran Exclusives:**
   - 🦹 **Hero's Cape:** Unlocked at **10 Consecutive Wins**.
   - ✨ **Golden God Aura:** Radiant particle aura unlocked at **100 Consecutive Wins**.
6. **👁️ Live Preview Canvas:** Real-time character rendering reflecting all equipped cosmetics.

---

## 💰 Economy & Daily Bonus

- **24-Hour Countdown Login Bonus:** Claim free Gold every 24 hours with an active real-time countdown timer.
- **Progressive Pricing:** Shop prices scale dynamically as you expand your collection.
- **Data Reset:** Built-in reset button in the workshop for clearing test data on mobile devices.

---

## 🛠️ Technical Stack & Architecture

- **Frontend Engine:** Pure Vanilla HTML5 Canvas (60 FPS fixed-timestep physics loop).
- **Styling:** Responsive Neon-Cyberpunk CSS3 with safe-area notch support for iOS/Android.
- **Multiplayer:** Socket.io client-server physics & state synchronization.
- **Audio Engine:** `SoundManager` utilizing Web Audio API with automatic HTML5 Audio fallback.
- **Storage:** Safe `localStorage` schema with backwards-compatible migration.

🎵 Credits & License
BGM & Sound: 独り音 (Hitorine)
Engine & Design: Custom Canvas Game Engine (v17.0)
License: Proprietary / All Rights Reserved.
