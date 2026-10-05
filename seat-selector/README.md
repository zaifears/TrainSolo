# Bangladesh Railway Automated Seat Selector (Personal Assistant)

A local, human-in-the-loop Playwright automation engine designed to attach via Chrome DevTools Protocol (CDP) to your pre-authenticated Chromium profile, navigate to the journey page, evaluate and rank seats based on your preferences, select them, and halt immediately for manual passenger verification and payment.

---

## 🛡️ Architecture & Safety Boundary

| Automation Responsibility | Manual User Responsibility |
| :--- | :--- |
| ✅ CDP attachment to running browser (`127.0.0.1:9222`) | 🔒 User Login & Password |
| ✅ Route, date, train & class verification | 🔒 CAPTCHA / Cloudflare challenges |
| ✅ DOM seat map extraction & legend filtering | 🔒 SMS OTP verification |
| ✅ Seat ranking (adjacent, same-row, coach preference) | 🔒 Passenger NID/Name validation |
| ✅ Single safe click per target seat | 🔒 "Continue Purchase" & Payment Gateway |
| ✅ Selection verification & audible handoff alert | 🔒 Final ticket download |

---

## 🚀 Quick Start Guide

### 1. Launch Dedicated Chrome Profile with Remote Debugging
Do **not** use your primary everyday Chrome profile. Run the provided launcher script:

**On Windows (PowerShell):**
```powershell
.\launch-chrome.ps1
```

**On Linux / macOS / Codespaces (Bash):**
```bash
chmod +x ./launch-chrome.sh
./launch-chrome.sh
```

### 2. Complete Manual Authentication
In the newly launched Chrome browser window:
1. Log into your account on `https://eticket.railway.gov.bd`.
2. Complete any CAPTCHA or OTP checks.
3. Keep the browser open.

### 3. Configure Your Journey Preferences
Edit `config.json` with your desired travel details:
```json
{
  "cdpEndpoint": "http://127.0.0.1:9222",
  "railwayHost": "eticket.railway.gov.bd",
  "journey": {
    "from": "Dhaka",
    "to": "Mymensingh",
    "date": "25-Sep-2026",
    "trainNames": ["HAWR EXPRESS (777)"],
    "classes": ["S_CHAIR"],
    "seatCount": 2
  },
  "preferences": {
    "exactSeats": [],
    "preferredCoaches": ["KA", "KHA"],
    "preferWindow": true,
    "requireAdjacent": true,
    "allowSameRowFallback": true,
    "allowSameCoachFallback": true,
    "allowSeparateFallback": false
  },
  "safety": {
    "dryRun": true,
    "maximumSeatClickAttempts": 2,
    "allowContinuePurchase": false,
    "stopOnSessionExpiry": true,
    "stopOnJourneyMismatch": true
  }
}
```

### 4. Run Dry-Run or Live Selection
**Dry-run (Reads & ranks seats without clicking):**
```bash
npm run dry-run
```

**Live selection (Performs verified clicks, alerts user, and stops):**
Set `"dryRun": false` in `config.json` (or pass via CLI) and run:
```bash
npm start
```

### 5. Running the Test Suite
```bash
npm test
```
Runs 16 comprehensive unit & component tests verifying seat parsing, legend rejection, ranking precedence, fallback strategies, and post-selection cross-verification.
