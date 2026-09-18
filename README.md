#  CineMatch

> **Movie night, settled in seconds.** Swipe together with friends and discover what to watch in real time!

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-lightgrey.svg)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-black.svg)](https://socket.io/)

---

##  Overview

**CineMatch** eliminates the endless *"I don't know, what do you want to watch?"* debate. 

Create a party room, share the code or link with your partner or friends, and swipe secretly on a curated deck of great movies. Whenever everyone in the room votes **YES**, it's an instant match!

---

##  Features

- Real-Time Multi-User Sync: Built on WebSockets (`Socket.IO`). Join via room code (`CINE-XXXX`) or a one-click invite link.
- Secret Swiping: Swipe right to **Love** or left to **Pass**. Votes remain secret until all participants agree on the same title.
- Match Drawer & Confetti: Instant celebratory canvas confetti blasts the moment a unanimous match is made.
- Detailed Movie Cards: High-resolution posters, ratings, runtimes, directors, synopses, and spoiler-free audience vibes.
- In-App Trailer Player: Preview official trailers without leaving your swipe deck.
- Touch & Gesture Driven: Smooth swipe physics on mobile devices, with full desktop keyboard shortcuts (`←` Pass, `→` Love, `Z` Undo, `Space` Trailer).
- Sound Effects: Atmospheric audio feedback for swipes and matches (with a quick mute toggle).
- Privacy & Security: In-memory transient rooms (no databases or tracking required), protected by Helmet security headers.

---

##  Quick Start (Run Locally)

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or higher recommended)
- [Git](https://git-scm.com/)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Emre6001/CineMatch.git
   cd CineMatch
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open in browser:**
   ```text
   http://localhost:3000
   ```

---

##  Free Cloud Deployment (Publishing Online)

Since CineMatch uses **Node.js + WebSockets (Socket.IO)** for real-time live sync across devices, it runs on full-stack cloud hosts that support Node servers and persistent WebSocket connections.

### Option 1: Render.com (Recommended — 100% Free)
1. Go to [Render.com](https://render.com/) and sign in with your GitHub account.
2. Click **New +** > **Web Service**.
3. Select your repository: `Emre6001/CineMatch`.
4. Configure the service:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Click **Deploy Web Service**. Render provides a live URL (e.g., `https://cinematch.onrender.com`) that you and your friends can access anywhere on mobile or desktop!

### Option 2: Railway.app
1. Go to [Railway.app](https://railway.app/) and sign in with GitHub.
2. Click **New Project** > **Deploy from GitHub repo**.
3. Select `CineMatch` and click **Deploy Now**.
4. Under Settings > Networking, click **Generate Domain**.

### Option 3: Fly.io / Heroku / DigitalOcean
CineMatch honors `process.env.PORT` and listens on `0.0.0.0`, making it immediately compatible with any Docker or container-based platform.

---

##  Controls & Shortcuts

| Action | Mobile / Touch | Keyboard | Button |
| :--- | :--- | :--- | :--- |
| **Pass** | Swipe Left | `←` Left Arrow | ✕ Button |
| **Love (Yes)** | Swipe Right | `→` Right Arrow | ❤️ Button |
| **Undo Last Vote** | Tap Undo | `Z` or `Backspace` | ↩️ Button |
| **Watch Trailer** | Tap Trailer | `Space` | 🎬 Button |
| **View Details** | Tap Details | `I` | ℹ️ Button |

---

##  Technology Stack

- **Backend:** Node.js, Express 5, Socket.IO, Helmet, CORS
- **Frontend:** Modern Semantic HTML5, Vanilla CSS3 (Glassmorphic Design, Custom Properties), Vanilla JavaScript ES6+
- **Assets & Libraries:** Canvas Confetti, Google Fonts (Outfit & Inter)

---

##  License

Distributed under the [MIT License](LICENSE). See `LICENSE` for more information.

---

##  Author

  Emre Karakas
- GitHub: [@Emre6001](https://github.com/Emre6001)
- Repository: [CineMatch](https://github.com/Emre6001/CineMatch)
