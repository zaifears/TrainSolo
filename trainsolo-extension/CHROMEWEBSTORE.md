# Chrome Web Store Listing: Train Ticket Tracker Sync

> **Single Source of Truth** for Chrome Developer Dashboard metadata, store listing copy, permissions justifications, and privacy disclosures.

---

## 1. Store Metadata

| Field | Value | Notes / Limits |
| :--- | :--- | :--- |
| **Extension Name** | Train Ticket Tracker Sync | Max 45 characters |
| **Version** | 1.1.0 | Must match `manifest.json` |
| **Short Description** | Sync official Bangladesh Railway session tokens with your personal Train Ticket Tracker dashboard. | Max 132 characters (currently 98) |
| **Category** | Productivity / Utilities | |
| **Default Language** | English | |
| **Pricing** | Free | No in-app purchases |

---

## 2. Store Listing Copy

### Summary
Effortlessly bridge your authenticated Bangladesh Railway session into your personal availability and ticket tracking workspace.

### Detailed Description
Train Ticket Tracker Sync makes train ticket tracking seamless by connecting your active Bangladesh Railway portal session directly with your personal tracking dashboard.

**Key Features:**
- **Live Session Health Indicator**: Instantly verify whether you are securely signed in on the official Bangladesh Railway e-ticketing portal.
- **Account Verification Badge**: Displays your active passenger name and session readiness at a glance without navigating between tabs.
- **One-Click Credential Synchronization**: Securely transfers session keys directly between your active railway tab and your tracker application on `localhost` or Vercel.
- **Visual Connection Status**: Color-coded indicators confirm token and device registration status before you initiate tracking.

**How It Works:**
1. Log in to the official Bangladesh Railway portal ([eticket.railway.gov.bd](https://eticket.railway.gov.bd)).
2. Open the Train Ticket Tracker Sync extension from your browser toolbar to confirm your session is active.
3. Click **Sync Credentials** to link your session to your personal dashboard.

**Privacy & Security First:**
- Operates entirely inside your local browser.
- No personal data, passwords, or payment information are ever collected, transmitted to external servers, or sold.

---

## 3. Permissions Justification

Every permission and host permission declared in `manifest.json` is strictly necessary for the core functionality:

| Permission / Host | Why It Is Needed | User Benefit |
| :--- | :--- | :--- |
| `storage` | Stores temporary sync state and user preference flags locally inside the extension. | Remembers your session status across popup views without re-reading page state repeatedly. |
| `scripting` | Reads the session token keys (`token`, `ssdk`, `uudid`) from the active railway tab and injects them into your tracker tab. | Enables automatic, error-free credential synchronization without manual copy-pasting. |
| `tabs` | Identifies active browser tabs matching the official railway site and your local/hosted tracking dashboard. | Automatically detects when relevant tabs are open and enables one-click navigation between them. |
| `https://eticket.railway.gov.bd/*` | Official Bangladesh Railway e-ticketing domain. | Required to verify login state and extract session keys. |
| `https://train-ticket-tracker-bd.vercel.app/*` | Hosted web tracker dashboard. | Allows syncing credentials directly to your hosted tracker application. |
| `http://localhost:*/*`, `http://127.0.0.1:*/*` | Local development environment for your tracker dashboard. | Enables full local testing and personal dashboard use on your computer. |

---

## 4. Privacy & Data Use Disclosure

- **Single Purpose**: Synchronize official Bangladesh Railway session identifiers with the user's personal ticket tracking dashboard.
- **Data Collection**: None. The extension does not collect, record, or transmit user information to any third-party analytics or external servers.
- **Data Storage**: Session identifiers are stored exclusively in the browser's local sandbox (`chrome.storage.local`) and `localStorage` of the user's designated tracking application.
- **Financial & Payment Data**: Not accessed, handled, or stored.
- **Authentication**: Uses the user's existing login on the official portal; never collects passwords, PINs, or NID numbers.

---

## 5. Assets & Visuals

- **Icons**:
  - `icons/icon-16.png` (16×16px) — Toolbar favicon
  - `icons/icon-32.png` (32×32px) — High-DPI toolbar
  - `icons/icon-48.png` (48×48px) — Extension management page
  - `icons/icon-128.png` (128×128px) — Chrome Web Store & installation dialog
- **Store Screenshots** (Required for publishing):
  - 1280×800px or 640×400px showing popup UI connected to Bangladesh Railway tab.

---

## 6. Version History

- **v1.1.0** (2026-10-05):
  - Conformed fully to Manifest V3 best-practice guidelines.
  - Replaced single icon reference with distinct 16, 32, 48, and 128px PNG icon assets.
  - Upgraded all asynchronous calls in popup and sync scripts to use strict `async`/`await`.
  - Added live user badge, three-point credential health indicators, and localhost/production Vercel dual sync support.
- **v1.0.0** (Initial Release):
  - Baseline credential synchronization extension for Bangladesh Railway.
