# TrainSolo: Bangladesh Railway Assistant & Seat Selector

**Prepared for**: Md Al Shahoriar Hossain  
**Target Portal**: Bangladesh Railway E-Ticketing Service (`eticket.railway.gov.bd`)  
**Operating Model**: Unified single-port personal service + in-browser auto-cutter

---

## ⚡ Quick Start (Single Process, Single Port)

You no longer need two terminals or separate ports! The frontend and backend run together on **`http://localhost:5000`**.

### Option A: One-Click Desktop Launcher
Simply double-click:
```
start-trainsolo.bat
```
This automatically compiles any changes, starts the unified server, and opens `http://localhost:5000` in your browser.

### Option B: Terminal Command
From `A:\TrainSolo`:
```bash
npm start
```
Open **`http://localhost:5000`** in your browser.

---

## System Overview

The system consists of three coordinated components:

1. **Unified Service (`http://localhost:5000`)**:
   - **Frontend (`trainsolo-client`)**: React 19 + Tailwind CSS single-journey configuration and availability tracker. The "Number of scans" screen has been completely eliminated—it loads directly into your 1 journey route and date picker!
   - **Backend (`trainsolo-server`)**: Express API proxy querying Shohoz endpoints with residential Bangladeshi IP trust, serving both the REST API and the React frontend from a single port.
2. **Chrome / Brave Extension (`trainsolo-extension`)**:
   - Instant credential sync between Bangladesh Railway and TrainSolo.
   - Prominent **`[ ⚡ Auto-Cut Seat & Go to OTP ]`** button directly in the extension popup.
   - In-page floating HUD on `eticket.railway.gov.bd` with automatic coach switching, seat selection, cart verification, CONTINUE PURCHASE triggering, and OTP handoff.
3. **CDP Automation Engine (`seat-selector`)**:
   - Direct Chrome DevTools Protocol automation engine for advanced headless/CDP seat cutting.
   - Comprehensive test suites (24 tests in `seat-selector`, 40 tests in `trainsolo-server`).
   - Enforces 15-minute sliding window budget (max 2 clicks per 15 min) to prevent the platform's 1-hour account suspension.

---

## Direct Auto-Cut & OTP Flow

1. **Log in** to `eticket.railway.gov.bd` in your browser.
2. Open the **TrainSolo Assistant** extension popup:
   - Click **`🔄 Sync & Open Tracker`**. It syncs your session credentials and opens `http://localhost:5000` directly into your 1-journey station selector.
3. Configure your departure, destination, and journey date, then click **`⚡ Start Scanning Tickets`**.
4. When a ticket becomes available, the tracker plays an audio chime and displays a **`⚡ Auto-Cut & OTP`** button.
5. Click **`⚡ Auto-Cut & OTP`**:
   - Opens the official railway search page.
   - The in-page assistant automatically detects the available train, selects the coach with vacant seats, clicks the seat, verifies the cart, clicks **CONTINUE PURCHASE**, and brings you straight to the **OTP screen**!
   - You only need to type the 4-digit SMS OTP to complete your purchase!
