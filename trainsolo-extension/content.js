// TrainSolo Assistant Content Script: In-Page Auto-Seat Cutter
(function () {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Strips autocut parameter from hash and query string without triggering a page reload
    function stripAutocutFromUrl() {
        try {
            const currentUrl = new URL(window.location.href);
            let urlChanged = false;
            if (currentUrl.searchParams.has("autocut")) {
                currentUrl.searchParams.delete("autocut");
                urlChanged = true;
            }
            if (currentUrl.hash) {
                const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
                if (hashParams.has("autocut")) {
                    hashParams.delete("autocut");
                    const newHash = hashParams.toString();
                    currentUrl.hash = newHash ? `#${newHash}` : "";
                    urlChanged = true;
                }
            }
            if (urlChanged) {
                window.history.replaceState(null, "", currentUrl.toString());
            }
        } catch (_) {}
    }

    // Consumes one-shot intent so it cannot survive to unrelated searches or subsequent page loads
    function consumeBookingIntent() {
        try {
            const raw = sessionStorage.getItem("trainsolo_booking_target");
            if (raw) {
                const parsed = JSON.parse(raw);
                parsed.autocut = false;
                parsed.autoCut = false;
                sessionStorage.setItem("trainsolo_booking_target", JSON.stringify(parsed));
            }
        } catch (_) {}
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(["trainsolo_booking_target"], (data) => {
                if (data && data.trainsolo_booking_target) {
                    const updated = { ...data.trainsolo_booking_target, autocut: false, autoCut: false };
                    chrome.storage.local.set({ trainsolo_booking_target: updated });
                }
            });
        }
        stripAutocutFromUrl();
    }

    // Normalizes date representations for equivalence checking
    function normalizeDate(d) {
        if (!d) return "";
        const s = d.toLowerCase().trim();
        const monMap = {
            jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
            jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
        };
        const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
        if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
        const dmy = s.match(/^(\d{1,2})[-/.\s]+([a-z]{3,})[-/.\s]+(\d{4})$/);
        if (dmy && monMap[dmy[2].slice(0, 3)]) {
            return `${dmy[3]}-${monMap[dmy[2].slice(0, 3)]}-${dmy[1].padStart(2, "0")}`;
        }
        return s.replace(/[^a-z0-9]/g, "");
    }

    // 0. IMMEDIATE CAPTURE AT DOCUMENT_START:
    // Capture URL search and hash parameters before Angular Router sanitizes or strips them from the address bar!
    try {
        const earlySearch = new URLSearchParams(location.search);
        const earlyHash = new URLSearchParams(location.hash.replace(/^#/, ""));
        const getEarly = (k) => earlySearch.get(k) || earlyHash.get(k) || "";

        const earlyTrain = getEarly("train");
        const earlyTrainNum = getEarly("train_number") || (earlyTrain.match(/\b\d{3,4}\b/) || [])[0] || "";
        const earlySeats = parseInt(getEarly("seats") || "0", 10);
        const earlyClass = getEarly("class");
        const earlyAutoCut = location.hash.includes("autocut=1") || location.search.includes("autocut=1");
        const earlyFrom = getEarly("from") || getEarly("fromcity");
        const earlyTo = getEarly("to") || getEarly("tocity");
        const earlyDate = getEarly("date") || getEarly("doj");

        if (earlyTrain || earlySeats || earlyClass || earlyAutoCut) {
            let existing = {};
            try {
                const raw = sessionStorage.getItem("trainsolo_booking_target");
                if (raw) existing = JSON.parse(raw);
            } catch (_) {}

            const mergedTrain = earlyTrain || existing.train || "";
            const mergedTrainNum =
                earlyTrainNum || existing.train_number || existing.trainNumber || (mergedTrain.match(/\b\d{3,4}\b/) || [])[0] || "";
            const mergedSeats = (earlySeats > 0 ? earlySeats : null) || existing.seats || null;
            const mergedClass = earlyClass || existing.class || existing.seatClass || "";
            // CQ-004: Only activate autocut if explicit in the current navigation URL; do not preserve old execution intent
            const mergedAutoCut = Boolean(earlyAutoCut);

            const cached = {
                train: mergedTrain,
                train_number: mergedTrainNum,
                trainNumber: mergedTrainNum,
                seats: mergedSeats,
                class: mergedClass,
                seatClass: mergedClass,
                autocut: mergedAutoCut,
                autoCut: mergedAutoCut,
                from: earlyFrom || existing.from || "",
                to: earlyTo || existing.to || "",
                date: earlyDate || existing.date || "",
                timestamp: Date.now(),
            };
            sessionStorage.setItem("trainsolo_booking_target", JSON.stringify(cached));
            if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ trainsolo_booking_target: cached });
            }
            if (earlyAutoCut) {
                stripAutocutFromUrl();
            }
        }
    } catch (_) {}

    function playSuccessChime() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const now = ctx.currentTime;
            [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.frequency.value = freq;
                osc.connect(gain);
                gain.connect(ctx.destination);
                gain.gain.setValueAtTime(0.18, now + i * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.45);
                osc.start(now + i * 0.08);
                osc.stop(now + i * 0.08 + 0.45);
            });
        } catch (e) {}
    }

    // Safety Click Ledger (15-min sliding window, max 16 clicks to support family bookings up to 4 seats with retries)
    const MAX_CLICKS_BUDGET = 16;

    async function getRemainingBudget() {
        return new Promise((resolve) => {
            chrome.storage.local.get(["rail_click_ledger"], (data) => {
                const ledger = data.rail_click_ledger || [];
                const cutoff = Date.now() - 15 * 60 * 1000;
                const recent = ledger.filter((entry) => entry.timestamp > cutoff);
                const remaining = Math.max(0, MAX_CLICKS_BUDGET - recent.length);
                resolve({ remaining, recent });
            });
        });
    }

    async function recordClick(label, result) {
        return new Promise((resolve) => {
            chrome.storage.local.get(["rail_click_ledger"], (data) => {
                const ledger = data.rail_click_ledger || [];
                const cutoff = Date.now() - 15 * 60 * 1000;
                const cleaned = ledger.filter((e) => e.timestamp > cutoff);
                cleaned.push({ timestamp: Date.now(), seat: label, result });
                chrome.storage.local.set({ rail_click_ledger: cleaned }, resolve);
            });
        });
    }

    // Auto-dismiss SweetAlert popups (e.g. Shohoz "Multiple order attempt detected")
    function autoDismissSweetAlerts() {
        const swalPopup = document.querySelector(".swal2-popup, .swal2-container");
        if (swalPopup) {
            const text = (swalPopup.textContent || "").trim();
            const okBtn = swalPopup.querySelector(".swal2-confirm, button.swal2-styled, button");
            if (okBtn) {
                console.log("[TrainSolo] Auto-dismissing Shohoz dialog:", text.slice(0, 100));
                okBtn.click();
                return text;
            }
        }
        return null;
    }

    // Background watcher for sweetalerts to keep page unblocked
    setInterval(() => {
        const dismissed = autoDismissSweetAlerts();
        if (dismissed && dismissed.includes("Multiple order attempt")) {
            const hudMsg = document.getElementById("hudMsg");
            if (hudMsg) {
                const secondsMatch = dismissed.match(/(\d+)\s*(?:second|minute)/i);
                const waitStr = secondsMatch ? `Wait ${secondsMatch[0]} before retry` : "Lockout cooldown active";
                hudMsg.textContent = `⚠️ Shohoz Cooldown: ${waitStr} (Popup dismissed)`;
                hudMsg.className = "hud-msg error";
            }
        }
    }, 1000);

    // Seat Class Name & Alias Normalizer (strictly distinguishes SHOVON and S_CHAIR)
    function matchesSeatClass(text, targetClass) {
        if (!targetClass || targetClass === "ANY") return true;
        const upperText = (text || "").toUpperCase().replace(/\s+/g, "_");
        const cleanTarget = targetClass.toUpperCase().replace(/\s+/g, "_");

        // Distinguish SHOVON (Non-AC Bench) from S_CHAIR (Shovon Chair)
        if (cleanTarget === "SHOVON") {
            if (upperText.includes("CHAIR") || upperText.includes("S_CHAIR") || upperText.includes("চেয়ার")) {
                return false;
            }
            return (
                upperText.includes("SHOVON") ||
                upperText.includes("SOVON") ||
                upperText.includes("NON_AC") ||
                upperText.includes("NON-AC") ||
                upperText.includes("শোভন")
            );
        }

        if (cleanTarget === "S_CHAIR") {
            return (
                upperText.includes("S_CHAIR") ||
                upperText.includes("SHOVON_CHAIR") ||
                upperText.includes("SOVON_CHAIR") ||
                (upperText.includes("SHOVON") && upperText.includes("CHAIR")) ||
                upperText.includes("শোভন_চেয়ার") ||
                (upperText.includes("শোভন") && upperText.includes("চেয়ার"))
            );
        }

        if (upperText.includes(cleanTarget)) return true;

        const classAliases = {
            SNIGDHA: ["SNIGDHA", "AC_CHAIR", "স্নিগ্ধা"],
            AC_S: ["AC_S", "AC_SEAT", "এসি_সিট", "এসি সিট"],
            AC_B: ["AC_B", "AC_BERTH", "এসি_বার্থ", "এসি বার্থ"],
            F_BERTH: ["F_BERTH", "FIRST_BERTH", "ফার্স্ট_বার্থ", "ফার্স্ট বার্থ"],
            F_SEAT: ["F_SEAT", "FIRST_SEAT", "ফার্স্ট_সিট", "ফার্স্ট সিট"],
            F_CHAIR: ["F_CHAIR", "FIRST_CHAIR", "ফার্স্ট_চেয়ার", "ফার্স্ট চেয়ার"],
        };

        const aliases = classAliases[cleanTarget] || [cleanTarget];
        return aliases.some((alias) => {
            const normAlias = alias.toUpperCase().replace(/\s+/g, "_");
            return upperText.includes(normAlias) || (text || "").toUpperCase().includes(alias.toUpperCase());
        });
    }

    // Helper: checks whether an element represents a selected seat
    function isSeatSelected(el) {
        if (!el) return false;
        const cl = el.className || "";
        return (
            cl.includes("selected") ||
            cl.includes("seat-selected") ||
            el.getAttribute("aria-selected") === "true"
        );
    }

    // Resolves target configuration with 3-tier fallback (URL -> sessionStorage -> chrome.storage)
    async function getEffectiveBookingTarget() {
        const urlParams = new URLSearchParams(location.search);
        const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
        const getParam = (k) => urlParams.get(k) || hashParams.get(k) || "";

        let train = getParam("train");
        let trainNumber = getParam("train_number") || (train.match(/\b\d{3,4}\b/) || [])[0] || "";
        let seats = parseInt(getParam("seats") || "0", 10);
        let seatClass = getParam("class");
        let autoCut = location.hash.includes("autocut=1") || location.search.includes("autocut=1");

        const curFrom = getParam("from") || getParam("fromcity") || "";
        const curTo = getParam("to") || getParam("tocity") || "";
        const curDate = getParam("date") || getParam("doj") || "";

        const matchesCurrentJourney = (targetObj) => {
            if (!targetObj) return false;
            if (targetObj.from && curFrom && targetObj.from.trim().toLowerCase() !== curFrom.trim().toLowerCase()) {
                return false;
            }
            if (targetObj.to && curTo && targetObj.to.trim().toLowerCase() !== curTo.trim().toLowerCase()) {
                return false;
            }
            if (targetObj.date && curDate && normalizeDate(targetObj.date) !== normalizeDate(curDate)) {
                return false;
            }
            return true;
        };

        // 2. Check early sessionStorage (HUD overrides take precedence over stale URL params across reloads)
        try {
            const rawSession = sessionStorage.getItem("trainsolo_booking_target");
            if (rawSession) {
                const s = JSON.parse(rawSession);
                const isFresh = Date.now() - (s.timestamp || 0) < 15 * 60 * 1000;
                if (isFresh && matchesCurrentJourney(s)) {
                    if (s.hudOverride) {
                        if (typeof s.train === "string") train = s.train;
                        if (typeof (s.train_number ?? s.trainNumber) === "string") {
                            trainNumber = s.train_number ?? s.trainNumber;
                        }
                        if (s.seats) seats = s.seats;
                        if (typeof (s.class ?? s.seatClass) === "string") {
                            seatClass = s.class ?? s.seatClass;
                        }
                    } else {
                        if (!train && s.train) train = s.train;
                        if (!trainNumber && (s.train_number || s.trainNumber)) trainNumber = s.train_number || s.trainNumber;
                        if (!seats && s.seats) seats = s.seats;
                        if (!seatClass && (s.class || s.seatClass)) seatClass = s.class || s.seatClass;
                    }
                    if (!autoCut && (s.autocut || s.autoCut) && (Date.now() - (s.timestamp || 0) < 5 * 60 * 1000)) {
                        autoCut = true;
                    }
                }
            }
        } catch (_) {}

        // 3. Check chrome.storage.local (synced from TrainSolo app via tracker-bridge)
        if (!train || !seats) {
            try {
                const storage = await new Promise((r) => chrome.storage.local.get(["trainsolo_booking_target"], r));
                const t = storage?.trainsolo_booking_target;
                if (t) {
                    const isFresh = Date.now() - (t.timestamp || 0) < 10 * 60 * 1000;
                    if (isFresh && matchesCurrentJourney(t)) {
                        if (!train && t.train) train = t.train;
                        if (!trainNumber && (t.train_number || t.trainNumber)) trainNumber = t.train_number || t.trainNumber;
                        if (!seats && t.seats) seats = t.seats;
                        if (!seatClass && (t.class || t.seatClass)) seatClass = t.class || t.seatClass;
                        if (!autoCut && (t.autocut || t.autoCut) && (Date.now() - (t.timestamp || 0) < 5 * 60 * 1000)) {
                            autoCut = true;
                        }
                    }
                }
            } catch (_) {}
        }

        return {
            train: (train || "").toUpperCase(),
            trainNumber: trainNumber || ((train || "").match(/\b\d{3,4}\b/) || [])[0] || "",
            seats: Math.min(4, Math.max(1, seats || 1)),
            seatClass: (seatClass || "").toUpperCase(),
            autoCut,
        };
    }

    // Extracts exact available seat count from a single seat-class tile or row on eticket.railway.gov.bd
    function extractSeatCountFromTile(tile) {
        if (!tile) return 0;
        const dedicatedCountEl = tile.querySelector?.(".all-seats, .seat-available, .available-seats, .seat-count");
        if (dedicatedCountEl) {
            const rawDigits = (dedicatedCountEl.textContent || "").trim();
            if (/^\d+$/.test(rawDigits)) {
                return parseInt(rawDigits, 10);
            }
        }

        const text = (tile.textContent || "").replace(/\s+/g, " ");
        // 1. Official Shohoz format: "Available Tickets (Counter + Online) 45" or "Available Tickets 45"
        const afterAvailable = text.match(
            /(?:Available\s*Tickets?(?:\s*\([^)]*\))?|Available\s*Seats?|উপলব্ধ\s*আসন|আসন\s*সংখ্যা)[\s:=-]*(\d+)/i
        );
        if (afterAvailable) {
            return parseInt(afterAvailable[1], 10);
        }

        // 2. Number before "Seat(s)" / "Available" / "আসন" (excluding "1+ users are trying to book ticket(s)")
        const beforeLabel = text.match(/(\d+)\s*(?:Seats?|Available|আসন)(?!\s*\))/i);
        if (beforeLabel) {
            return parseInt(beforeLabel[1], 10);
        }

        return 0;
    }

    // Computes total available seats visible on a card for a given class
    function getCardSeatCapacity(card, targetClass) {
        if (!card) return 0;
        const classTiles = Array.from(
            card.querySelectorAll(".single-seat-class, .trip-seat-class, .seat-class-row")
        );

        if (classTiles.length > 0) {
            if (targetClass && targetClass !== "ANY" && targetClass !== "ALL") {
                for (const tile of classTiles) {
                    const classHeader =
                        tile.querySelector?.(".seat-class-name, .seat-class, .type-name")?.textContent ||
                        tile.textContent ||
                        "";
                    if (matchesSeatClass(classHeader, targetClass)) {
                        return extractSeatCountFromTile(tile);
                    }
                }
                return 0;
            }

            let maxTileSeats = 0;
            for (const tile of classTiles) {
                const count = extractSeatCountFromTile(tile);
                if (count > maxTileSeats) maxTileSeats = count;
            }
            return maxTileSeats;
        }

        // Fallback for non-tile layout rows
        if (targetClass && targetClass !== "ANY" && targetClass !== "ALL") {
            const rows = Array.from(card.querySelectorAll("tr, li, div[class*='class']"));
            for (const r of rows) {
                if (matchesSeatClass(r.textContent || "", targetClass)) {
                    return extractSeatCountFromTile(r);
                }
            }
            return 0;
        }

        return extractSeatCountFromTile(card);
    }

    // Intelligent Target Train Card Locator
    function findTargetTrainCard(cards, targetTrain, targetTrainNumber) {
        if (!cards || cards.length === 0) return null;

        // 0. Active User Context: Only fallback to an already-opened card if no explicit train was targeted
        if (!targetTrain && !targetTrainNumber) {
            const activeDropdown = document.querySelector("#select-bogie");
            if (activeDropdown) {
                const userOpenedCard = activeDropdown.closest(".single-trip-wrapper, .trip-wrapper");
                if (userOpenedCard && cards.includes(userOpenedCard)) {
                    return userOpenedCard;
                }
            }
        }

        // 1. Train Number Precision Match (Highest Priority)
        let numberToMatch = targetTrainNumber;
        if (!numberToMatch && targetTrain) {
            const m = targetTrain.match(/\b\d{3,4}\b/);
            if (m) numberToMatch = m[0];
        }

        if (numberToMatch) {
            const numRegex = new RegExp(`\\(${numberToMatch}\\)|\\b${numberToMatch}\\b`);
            for (const c of cards) {
                const text = c.textContent || "";
                if (numRegex.test(text)) {
                    return c;
                }
            }
        }

        // 2. Exact or Substring Train Name Match
        if (targetTrain) {
            const upperTarget = targetTrain.toUpperCase().trim();
            for (const c of cards) {
                const text = (c.textContent || "").toUpperCase();
                if (text.includes(upperTarget)) {
                    return c;
                }
            }
        }

        // 3. Phonetic and Normalized Transliteration Match (BHRAMMAPUTRA vs BRAHMAPUTRA)
        if (targetTrain) {
            function normalizeTrainName(str) {
                return (str || "")
                    .toUpperCase()
                    .replace(/\b(EXPRESS|INTERCITY|COMMUTER|MAIL|SPECIAL)\b/g, "")
                    .replace(/H/g, "")
                    .replace(/([A-Z])\1+/g, "$1")
                    .replace(/[^A-Z0-9]/g, "");
            }

            const normTarget = normalizeTrainName(targetTrain);
            if (normTarget.length >= 3) {
                for (const c of cards) {
                    const normCard = normalizeTrainName(c.textContent || "");
                    if (normCard.includes(normTarget) || normTarget.includes(normCard)) {
                        return c;
                    }
                }
            }

            // 4. Word Token Match
            const targetWords = targetTrain
                .toUpperCase()
                .split(/[\s()\-]+/)
                .filter((w) => w.length > 3 && !["EXPRESS", "INTERCITY", "COMMUTER", "MAIL"].includes(w));

            for (const c of cards) {
                const cardTitle = (
                    c.querySelector(".train-name, .trip-name, h2, h3, h4")?.textContent ||
                    c.textContent ||
                    ""
                ).toUpperCase();

                for (const word of targetWords) {
                    const normWord = word.replace(/BH/g, "B").replace(/MM/g, "M");
                    const normTitle = cardTitle.replace(/BH/g, "B").replace(/MM/g, "M");
                    if (cardTitle.includes(word) || normTitle.includes(normWord)) {
                        return c;
                    }
                }
            }
        }

        return null;
    }

    // Global session state for interactive HUD
    let currentTargetConfig = {
        train: "",
        trainNumber: "",
        seats: 1,
        seatClass: "",
    };

    let isAutoCutRunning = false;
    let isSniperArmed = sessionStorage.getItem("trainsolo_sniper_armed") === "1";
    let sniperTimer = null;

    // Anti-collision seat selector: picks contiguous same-row seats starting from the 60% offset
    // of available seats so we dodge the stampede clicking index 0 (seat 1 & 2).
    function selectOptimalAvailableSeats(availableSeats, neededClicks) {
        if (availableSeats.length <= neededClicks) {
            return availableSeats.slice(0, neededClicks);
        }

        const getSeatNum = (btn) => {
            const txt = (btn.textContent || btn.getAttribute("data-seat") || "").trim();
            const m = txt.match(/(\d+)$/);
            return m ? parseInt(m[1], 10) : 0;
        };

        const sorted = [...availableSeats].sort((a, b) => getSeatNum(a) - getSeatNum(b));
        const maxStart = sorted.length - neededClicks;
        const startOffset = Math.min(maxStart, Math.max(0, Math.floor(sorted.length * 0.6)));

        // Build search order starting from 60% offset, then wrapping around
        const candidateIndices = [];
        for (let i = startOffset; i <= maxStart; i++) candidateIndices.push(i);
        for (let i = startOffset - 1; i >= 0; i--) candidateIndices.push(i);

        // Pass 1: Contiguous seats in the same 4-seat row
        if (neededClicks > 1) {
            for (const idx of candidateIndices) {
                const slice = sorted.slice(idx, idx + neededClicks);
                const firstNum = getSeatNum(slice[0]);
                const lastNum = getSeatNum(slice[slice.length - 1]);
                if (
                    firstNum > 0 &&
                    lastNum - firstNum === neededClicks - 1 &&
                    Math.floor((firstNum - 1) / 4) === Math.floor((lastNum - 1) / 4)
                ) {
                    return slice;
                }
            }

            // Pass 2: Any consecutive seat numbers starting from offset
            for (const idx of candidateIndices) {
                const slice = sorted.slice(idx, idx + neededClicks);
                const firstNum = getSeatNum(slice[0]);
                const lastNum = getSeatNum(slice[slice.length - 1]);
                if (firstNum > 0 && lastNum - firstNum === neededClicks - 1) {
                    return slice;
                }
            }
        }

        return sorted.slice(startOffset, startOffset + neededClicks);
    }

    // Triggers an in-page search refresh on eticket.railway.gov.bd without cold-booting a new tab
    async function triggerInPageSearchRefresh() {
        const buttons = Array.from(document.querySelectorAll("button, a.btn, input[type='submit'], input[type='button']"));
        const directSearchBtn = buttons.find((b) => {
            const txt = (b.textContent || b.value || "").trim().toUpperCase();
            return (
                (txt === "SEARCH" || txt === "SEARCH TRAINS" || txt === "খুঁজুন") &&
                !b.disabled &&
                b.offsetParent !== null
            );
        });
        if (directSearchBtn) {
            directSearchBtn.click();
            return "in_page_search";
        }

        const modifyBtn = buttons.find((b) => {
            const txt = (b.textContent || b.value || "").trim().toUpperCase();
            return (txt.includes("MODIFY SEARCH") || txt.includes("পরিবর্তন")) && !b.disabled;
        });
        if (modifyBtn) {
            modifyBtn.click();
            await sleep(120);
            const submitAfterModify = Array.from(
                document.querySelectorAll("button, a.btn, input[type='submit'], input[type='button']")
            ).find((b) => {
                const txt = (b.textContent || b.value || "").trim().toUpperCase();
                return (txt === "SEARCH" || txt === "SEARCH TRAINS" || txt === "খুঁজুন") && !b.disabled;
            });
            if (submitAfterModify) {
                submitAfterModify.click();
                return "modify_then_search";
            }
        }

        location.reload();
        return "reloaded";
    }

    // Auto-Cut Execution Logic
    async function runAutoCut(onStatus, forcedCard = null) {
        if (isAutoCutRunning) {
            onStatus("Auto-Cut is already in progress. Please wait...", "running");
            return false;
        }

        isAutoCutRunning = true;
        try {
            const seatsNeeded = currentTargetConfig.seats || 1;
            onStatus("Checking 15-minute click budget...", "running");
            const { remaining } = await getRemainingBudget();
            if (remaining < seatsNeeded) {
                onStatus(
                    `Insufficient click budget (${remaining} remaining, need ${seatsNeeded}). Wait for 15-minute cooldown to prevent Shohoz account lockout.`,
                    "error"
                );
                return false;
            }

            autoDismissSweetAlerts();

            // 1. Wait for train search results to load (fast 50ms reactive poll)
            onStatus("Waiting for train search results to load...", "running");
            let cards = [];
            let cardWaitTries = 0;
            while (cards.length === 0 && cardWaitTries < 200) {
                cards = Array.from(document.querySelectorAll(".single-trip-wrapper, .trip-wrapper"));
                if (cards.length > 0) break;
                await sleep(50);
                cardWaitTries++;
            }

            if (!cards.length) {
                onStatus("No train cards rendered on page. Arm Drop Sniper or verify route.", "error");
                return false;
            }

            // Get effective target: preserve explicit config over unselected HUD dropdown options
            const hudTrainSelect = document.getElementById("hudTrainSelect");
            let selectedTrainFromHud = hudTrainSelect ? hudTrainSelect.value : "";
            let targetClass = currentTargetConfig.seatClass || "";
            let targetTrain = currentTargetConfig.train;
            let targetTrainNumber = currentTargetConfig.trainNumber;

            if (!targetTrain && !targetTrainNumber && selectedTrainFromHud) {
                if (selectedTrainFromHud.startsWith("train_num_")) {
                    targetTrainNumber = selectedTrainFromHud.replace("train_num_", "");
                } else {
                    targetTrain = selectedTrainFromHud;
                }
            }

            if (!targetTrainNumber && targetTrain) {
                const m = targetTrain.match(/\b\d{3,4}\b/);
                if (m) targetTrainNumber = m[0];
            }

            console.log(
                `[TrainSolo] Executing Auto-Cut: Train="${targetTrain}" (#${targetTrainNumber}), Seats=${seatsNeeded}, Class="${targetClass}"`
            );

            // Target train card selection
            let card = forcedCard;

            if (!card && (targetTrain || targetTrainNumber)) {
                card = findTargetTrainCard(cards, targetTrain, targetTrainNumber);
            }

            // Strict No-Fallback: If a specific train was targeted and not found, NEVER pick cards[0]!
            if (!card && (targetTrain || targetTrainNumber)) {
                const availableNames = cards
                    .map((c) => (c.querySelector(".train-name, .trip-name, h2, h3, h4")?.textContent || "").trim())
                    .filter(Boolean)
                    .slice(0, 5)
                    .join(", ");
                onStatus(
                    `🛑 Target train "${targetTrain || targetTrainNumber}" not found on page! Available: [${availableNames || "None"}]. Stopped to avoid booking wrong train.`,
                    "error"
                );
                return false;
            }

            // Fallback only if NO target train was specified at all
            if (!card) {
                const capableCards = cards.filter((c) => getCardSeatCapacity(c, targetClass) >= seatsNeeded);
                if (capableCards.length > 0) {
                    capableCards.sort(
                        (a, b) => getCardSeatCapacity(b, targetClass) - getCardSeatCapacity(a, targetClass)
                    );
                    card = capableCards[0];
                } else {
                    card =
                        cards.find(
                            (c) => c.querySelector("#select-bogie") || c.querySelector(".book-now-btn:not(:disabled)")
                        ) || cards[0];
                }
            }

            // Focus & highlight target train card
            if (card) {
                try {
                    card.scrollIntoView({ behavior: "instant", block: "center" });
                    card.style.outline = "4px solid #16a34a";
                    card.style.boxShadow = "0 0 25px rgba(22, 163, 74, 0.5)";
                    card.style.borderRadius = "12px";
                } catch (_) {}
            }

            // 2. Open seat map (scoped strictly to target card and verified class)
            let bogieSelect = card ? card.querySelector("#select-bogie") : null;
            let seatMapOpen = Boolean(bogieSelect);
            let openClassMatches = false;

            if (seatMapOpen && card) {
                if (!targetClass || targetClass === "ANY") {
                    openClassMatches = true;
                } else {
                    const parentClassContainer = bogieSelect?.closest(
                        "tr, .trip-seat-class, .seat-class-row, .single-seat-class, li, div[class*='class']"
                    );
                    const activeClassElement = card.querySelector(
                        ".trip-seat-class.active, .seat-class-row.active, .single-seat-class.active, [class*='seat-class'].active, .active-class, .single-seat-class.selected"
                    );
                    if (
                        (parentClassContainer && matchesSeatClass(parentClassContainer.textContent || "", targetClass)) ||
                        (activeClassElement && matchesSeatClass(activeClassElement.textContent || "", targetClass))
                    ) {
                        openClassMatches = true;
                    }
                }
            }

            if ((!seatMapOpen || !openClassMatches) && card) {
                onStatus(`Targeting BOOK NOW button for class ${targetClass || "Any"}...`, "running");

                const allCandidates = Array.from(card.querySelectorAll("button, a.btn, a.book-now-btn, input[type='button']"));
                const validBookButtons = allCandidates.filter((btn) => {
                    const text = (btn.textContent || btn.value || "").trim().toUpperCase();
                    const classes = btn.className.toLowerCase();

                    if (
                        text.includes("ROUTE") ||
                        text.includes("DETAIL") ||
                        text.includes("SCHEDULE") ||
                        text.includes("VIEW") ||
                        text.includes("ম্যাপ") ||
                        classes.includes("route") ||
                        classes.includes("detail")
                    ) {
                        return false;
                    }

                    return (
                        classes.includes("book-now") ||
                        classes.includes("book_now") ||
                        text.includes("BOOK NOW") ||
                        text.includes("BOOK") ||
                        text.includes("বুক")
                    );
                });

                let bookNowBtn = null;
                if (targetClass && targetClass !== "ANY" && targetClass !== "ALL" && validBookButtons.length > 0) {
                    for (const btn of validBookButtons) {
                        const row = btn.closest("tr, .trip-seat-class, .seat-class-row, .single-seat-class, li, div[class*='class']");
                        const rowText = row ? row.textContent || "" : "";
                        if (row && matchesSeatClass(rowText, targetClass)) {
                            bookNowBtn = btn;
                            break;
                        }
                    }
                } else if (!targetClass || targetClass === "ANY" || targetClass === "ALL") {
                    // Pick the enabled BOOK NOW button whose class tile has the most available seats
                    const enabledBtns = validBookButtons.filter((b) => !b.disabled);
                    if (enabledBtns.length > 0) {
                        enabledBtns.sort((a, b) => {
                            const tileA = a.closest(".single-seat-class, .trip-seat-class, .seat-class-row, tr");
                            const tileB = b.closest(".single-seat-class, .trip-seat-class, .seat-class-row, tr");
                            return extractSeatCountFromTile(tileB) - extractSeatCountFromTile(tileA);
                        });
                        bookNowBtn = enabledBtns[0];
                    } else {
                        bookNowBtn = validBookButtons[0];
                    }
                }

                if (!bookNowBtn || bookNowBtn.disabled) {
                    onStatus(
                        `No available Book Now button found for requested class ${targetClass || "Any"} on this train. Stopped to prevent booking wrong class.`,
                        "error"
                    );
                    return false;
                }

                onStatus(`Clicking BOOK NOW (${bookNowBtn.textContent.trim()})...`, "running");
                bookNowBtn.click();
                onStatus("Opened seat map. Loading coaches...", "running");

                let waitTries = 0;
                while (!(card && card.querySelector("#select-bogie")) && waitTries < 180) {
                    await sleep(50);
                    waitTries++;
                }
            }

            // 3. Select coach with vacant seats (Zero-Switch Fast Path + Multi-Coach Contention Fallback)
            const bogieSelectUpdated = card ? card.querySelector("#select-bogie") : null;
            if (!bogieSelectUpdated) {
                onStatus("Coach dropdown (#select-bogie) not found in target train card.", "error");
                return false;
            }

            const options = Array.from(bogieSelectUpdated.options)
                .filter((o) => {
                    const text = (o.text || o.textContent || "").trim().toLowerCase();
                    return text && !text.includes("select coach") && !text.includes("বগি নির্বাচন");
                })
                .map((o) => {
                    const text = (o.text || o.textContent || "").trim();
                    const m =
                        text.match(/([A-Z0-9_\u0980-\u09FF]+)\s*(?:-|:)\s*(\d+)\s*Seat/i) ||
                        text.match(/([A-Z0-9_\u0980-\u09FF]+)\s*\((\d+)\)/i);
                    let count = 0;
                    if (m) {
                        count = parseInt(m[2], 10);
                    } else {
                        const countOnly = text.match(/(\d+)\s*Seat/i) || text.match(/\((\d+)\)/);
                        count = countOnly ? parseInt(countOnly[1], 10) : 0;
                    }
                    const name = m ? m[1].toUpperCase() : text.split(/[-:(]/)[0].trim().toUpperCase();
                    return {
                        name,
                        count,
                        value: o.value,
                    };
                });

            if (options.length === 0) {
                onStatus("No valid coach options found in coach dropdown.", "error");
                return false;
            }

            // Capable coaches must accommodate full party size
            const capableCoaches = options.filter((o) => o.count >= seatsNeeded).sort((a, b) => b.count - a.count);

            if (capableCoaches.length === 0) {
                onStatus(
                    `Cannot accommodate full requested party of ${seatsNeeded} seat(s) in any single coach for this train. Stopped to avoid split/partial booking.`,
                    "error"
                );
                return false;
            }

            // Build ordered coach candidate queue:
            // 1. Currently open coach (if capable) for 0ms zero-switch fast path
            // 2. Anti-collision second-fullest coach (if buffer >= seatsNeeded + 1)
            // 3. Remaining capable coaches (so if coach 1 has only green/held seats, we immediately switch to coach 2!)
            const currentCoachOpt = capableCoaches.find((o) => o.value === bogieSelectUpdated.value);
            const coachQueue = [];
            if (currentCoachOpt) {
                coachQueue.push(currentCoachOpt);
            }
            if (capableCoaches.length >= 2 && capableCoaches[1].count >= seatsNeeded + 1) {
                if (!coachQueue.includes(capableCoaches[1])) coachQueue.push(capableCoaches[1]);
            }
            for (const c of capableCoaches) {
                if (!coachQueue.includes(c)) coachQueue.push(c);
            }

            const seatMapContainer =
                (card && (card.querySelector(".seat-layout, .seat-plan, .seat-map, .bogie-seat-container") || card)) ||
                document;

            let targetCoach = null;
            let availableSeats = [];
            let neededClicks = seatsNeeded;

            // Try up to 4 capable coaches in case the first coach's seats are green (seat-in-progress)
            for (const candidateCoach of coachQueue.slice(0, 4)) {
                if (bogieSelectUpdated.value !== candidateCoach.value) {
                    onStatus(`Switching to Coach ${candidateCoach.name} (${candidateCoach.count} seats)...`, "running");
                    bogieSelectUpdated.value = candidateCoach.value;
                    bogieSelectUpdated.dispatchEvent(new Event("change", { bubbles: true }));
                    bogieSelectUpdated.dispatchEvent(new Event("input", { bubbles: true }));

                    let switchTries = 0;
                    while (switchTries < 30) {
                        await sleep(40);
                        const rendered = Array.from(
                            seatMapContainer.querySelectorAll("button.btn-seat, button[data-seat]")
                        ).some((b) =>
                            (b.textContent || b.getAttribute("data-seat") || "")
                                .trim()
                                .toUpperCase()
                                .startsWith(candidateCoach.name + "-")
                        );
                        if (rendered) break;
                        switchTries++;
                    }
                }

                const allSelectedOnPage = Array.from(
                    document.querySelectorAll("button.btn-seat, button[data-seat], .seat-selected, [aria-selected='true']")
                ).filter(isSeatSelected);

                const foreignSelections = allSelectedOnPage.filter((b) => {
                    const txt = (b.textContent || b.getAttribute("data-seat") || "").trim().toUpperCase();
                    const inCoach = txt.startsWith(candidateCoach.name + "-");
                    const inCard = card ? card.contains(b) : true;
                    return !inCoach || !inCard;
                });

                if (foreignSelections.length > 0) {
                    onStatus(
                        `Pre-existing seat selection(s) detected outside Coach ${candidateCoach.name}. Stopped to avoid split/multi-coach booking.`,
                        "error"
                    );
                    return false;
                }

                const alreadySelectedInCoach = allSelectedOnPage.filter((b) => {
                    const txt = (b.textContent || b.getAttribute("data-seat") || "").trim().toUpperCase();
                    return txt.startsWith(candidateCoach.name + "-");
                });

                if (alreadySelectedInCoach.length > seatsNeeded) {
                    onStatus(
                        `Excess seats (${alreadySelectedInCoach.length}) already selected in Coach ${candidateCoach.name} (only ${seatsNeeded} requested). Stopped to prevent over-booking.`,
                        "error"
                    );
                    return false;
                }

                neededClicks = seatsNeeded - alreadySelectedInCoach.length;
                if (neededClicks === 0) {
                    targetCoach = candidateCoach;
                    break;
                }

                onStatus(
                    `Scanning vacant seats in Coach ${candidateCoach.name} (Need ${neededClicks} seat(s))...`,
                    "running"
                );
                let coachAvailable = [];
                let scanTries = 0;
                let renderedChecksAfterMount = 0;

                while (coachAvailable.length < neededClicks && scanTries < 30) {
                    const allSeatBtns = Array.from(
                        seatMapContainer.querySelectorAll("button.btn-seat, button[data-seat]")
                    );
                    const coachScopedBtns = allSeatBtns.filter((b) => {
                        const txt = (b.textContent || b.getAttribute("data-seat") || "").trim().toUpperCase();
                        return txt.startsWith(candidateCoach.name + "-");
                    });

                    if (coachScopedBtns.length === 0) {
                        await sleep(40);
                        scanTries++;
                        continue;
                    }

                    coachAvailable = coachScopedBtns.filter((b) => {
                        const cl = b.className || "";
                        const txt = (b.textContent || b.getAttribute("data-seat") || "").trim();
                        const isAvailableClass =
                            cl.includes("seat-available") ||
                            cl.includes("seat-white") ||
                            cl.includes("white");
                        const isNotOccupied = !/seat-booked|seat-in-progress|selected|booked|occupied/i.test(cl);
                        return isAvailableClass && isNotOccupied && !b.disabled && txt.length > 0;
                    });

                    if (coachAvailable.length >= neededClicks) break;

                    // Once coach buttons are mounted in DOM, don't stall for 2.4s if seats are green (seat-in-progress);
                    // check at most 2 quick settle ticks (80ms) then move to the next capable coach!
                    renderedChecksAfterMount++;
                    if (renderedChecksAfterMount >= 2) break;
                    await sleep(40);
                    scanTries++;
                }

                if (coachAvailable.length >= neededClicks) {
                    targetCoach = candidateCoach;
                    availableSeats = coachAvailable;
                    break;
                }

                onStatus(
                    `Coach ${candidateCoach.name} has ${coachAvailable.length}/${neededClicks} white seat(s) (others held/green). Checking next coach...`,
                    "running"
                );
            }

            if (!targetCoach) {
                onStatus(
                    `No coach had ${neededClicks} clickable white seat(s) (remaining seats may be green/held in checkout).`,
                    "error"
                );
                return false;
            }

            if (neededClicks === 0) {
                onStatus(`All ${seatsNeeded} requested seat(s) already selected in Coach ${targetCoach.name}.`, "running");
            } else {

                // Pick anti-collision contiguous seats from middle-back (60% offset) instead of index 0
                const primaryTargets = selectOptimalAvailableSeats(availableSeats, neededClicks);
                const attemptedButtons = new Set(primaryTargets);
                const fallbackPool = availableSeats.filter((b) => !attemptedButtons.has(b));
                const queue = [...primaryTargets];
                let fallbackRetriesLeft = 1; // Allow at most 1 replacement seat if a seat is sniped mid-click
                let lockedInRun = 0;
                let lastClickTimestamp = 0;

                onStatus(`Selecting ${neededClicks} seat(s) in Coach ${targetCoach.name}...`, "running");

                while (lockedInRun < neededClicks && queue.length > 0) {
                    const { remaining: curBudget } = await getRemainingBudget();
                    if (curBudget <= 0) {
                        onStatus("Click budget reached (16 clicks / 15 min). Stopped to prevent 1-hour account lockout.", "error");
                        return false;
                    }

                    // Shohoz bot-protection pacing: space consecutive seat clicks by at least 220ms
                    // so concurrent reserve-seat requests never trigger "Multiple order attempt detected"
                    const sinceLastClick = Date.now() - lastClickTimestamp;
                    if (lastClickTimestamp > 0 && sinceLastClick < 220) {
                        await sleep(220 - sinceLastClick);
                    }

                    const seatBtn = queue.shift();
                    const seatLabel = (seatBtn.textContent || seatBtn.getAttribute("data-seat") || "").trim();

                    // Re-verify button wasn't marked occupied while we selected the previous seat
                    if (seatBtn.disabled || /seat-booked|seat-in-progress|booked|occupied/i.test(seatBtn.className || "")) {
                        if (fallbackRetriesLeft > 0 && fallbackPool.length > 0) {
                            fallbackRetriesLeft--;
                            queue.push(fallbackPool.shift());
                            continue;
                        }
                        onStatus(`Seat ${seatLabel} was just taken before click. Aborting to protect budget.`, "error");
                        return false;
                    }

                    onStatus(`Selecting seat ${seatLabel} (${lockedInRun + 1}/${neededClicks})...`, "running");
                    lastClickTimestamp = Date.now();
                    seatBtn.click();
                    await recordClick(seatLabel, "attempted");

                    // Fast 40ms reactive verification (up to 880ms)
                    let verified = false;
                    let contested = false;
                    for (let check = 0; check < 22; check++) {
                        await sleep(40);
                        const cl = seatBtn.className || "";
                        if (
                            cl.includes("selected") ||
                            cl.includes("seat-selected") ||
                            seatBtn.getAttribute("aria-selected") === "true"
                        ) {
                            verified = true;
                            break;
                        }
                        if (/seat-booked|seat-in-progress/i.test(cl)) {
                            contested = true;
                            break;
                        }
                    }

                    if (verified) {
                        lockedInRun++;
                    } else {
                        const alertMsg = autoDismissSweetAlerts();
                        if (alertMsg && alertMsg.includes("Multiple order attempt")) {
                            onStatus(`Shohoz lockout: ${alertMsg.slice(0, 60)}`, "error");
                            return false;
                        }
                        if (fallbackRetriesLeft > 0 && fallbackPool.length > 0) {
                            fallbackRetriesLeft--;
                            const replacement = fallbackPool.shift();
                            const repLabel = (replacement.textContent || replacement.getAttribute("data-seat") || "").trim();
                            onStatus(
                                `Seat ${seatLabel} was ${contested ? "sniped" : "unresponsive"}; trying fallback ${repLabel}...`,
                                "running"
                            );
                            queue.push(replacement);
                            continue;
                        }
                        onStatus(`Seat ${seatLabel} was taken by another buyer. Aborted to protect click budget.`, "error");
                        return false;
                    }
                }
            }

            // CQ-001: Strict Invariant Check before Continue Purchase
            const finalSelectedOnPage = Array.from(
                document.querySelectorAll("button.btn-seat, button[data-seat], .seat-selected, [aria-selected='true']")
            ).filter(isSeatSelected);

            if (finalSelectedOnPage.length !== seatsNeeded) {
                onStatus(
                    `Final booking invariant failed: expected exactly ${seatsNeeded} selected seat(s), but found ${finalSelectedOnPage.length}. Aborting purchase handoff.`,
                    "error"
                );
                return false;
            }

            const finalWrongCoach = finalSelectedOnPage.filter((b) => {
                const txt = (b.textContent || b.getAttribute("data-seat") || "").trim().toUpperCase();
                return !txt.startsWith(targetCoach.name + "-");
            });

            if (finalWrongCoach.length > 0) {
                onStatus(
                    `Final booking invariant failed: selected seats belong to incorrect coach. Aborting purchase handoff.`,
                    "error"
                );
                return false;
            }

            // Consume one-shot intent now that exact seats are verified locked
            consumeBookingIntent();
            sessionStorage.removeItem("trainsolo_sniper_armed");
            isSniperArmed = false;

            // 5. Click CONTINUE PURCHASE immediately (fast 40ms poll for button enablement instead of 300ms sleep)
            onStatus(`Seats locked (${seatsNeeded}/${seatsNeeded})! Clicking CONTINUE PURCHASE...`, "running");

            let continueBtn = null;
            for (let waitBtn = 0; waitBtn < 12; waitBtn++) {
                const alertMsg = autoDismissSweetAlerts();
                if (alertMsg && alertMsg.includes("Multiple order attempt")) {
                    onStatus(`Shohoz lockout: ${alertMsg.slice(0, 60)}`, "error");
                    return false;
                }

                continueBtn = Array.from(
                    document.querySelectorAll("button, a, input[type='button'], input[type='submit']")
                ).find((el) => {
                    const txt = (el.textContent || el.value || "").trim().toLowerCase();
                    const isPurchaseText =
                        txt === "continue purchase" ||
                        txt === "continue to purchase" ||
                        txt.includes("continue purchase") ||
                        txt.includes("continue to purchase") ||
                        txt === "পরবর্তী ধাপ" ||
                        txt.includes("পরবর্তী ধাপ");
                    return isPurchaseText && !el.disabled;
                });
                if (continueBtn) break;
                await sleep(40);
            }

            if (!continueBtn) {
                onStatus("Enabled CONTINUE PURCHASE button not found. Please click it manually.", "error");
                return false;
            }

            continueBtn.click();
            onStatus("Pushed purchase! Waiting for OTP screen (/trip-info)...", "running");

            // 6. Wait for OTP screen (80ms fast poll)
            let otpTries = 0;
            while (otpTries < 180) {
                const alertText = autoDismissSweetAlerts();
                if (alertText && alertText.includes("Multiple order attempt")) {
                    onStatus(`Shohoz alert: ${alertText.slice(0, 60)}`, "error");
                    return false;
                }

                if (location.pathname.includes("/trip-info") && document.querySelectorAll("input.rec-otp").length > 0) {
                    playSuccessChime();
                    onStatus("🎉 OTP SCREEN REACHED! Enter the 4-digit SMS code.", "success");
                    const firstOtp = document.querySelector("input.rec-otp");
                    if (firstOtp) firstOtp.focus();
                    return true;
                }
                await sleep(80);
                otpTries++;
            }

            onStatus("Timed out waiting for OTP screen (/trip-info). Please check the booking tab.", "error");
            return false;
        } finally {
            isAutoCutRunning = false;
        }
    }

    function cleanTrainCardTitle(card, fallback = "This Train") {
        const raw = (
            card.querySelector(".train-name, .trip-name, h2, h3, h4")?.textContent || fallback
        ).trim();
        return raw
            .replace(/\d+\+?\s*users?\s*are\s*trying\s*to\s*book\s*tickets?\(?s?\)?/gi, "")
            .replace(/\d+\+?\s*users?.*$/gim, "")
            .split("\n")[0]
            .replace(/\s+/g, " ")
            .trim() || fallback;
    }

    // Injects direct Auto-Cut buttons into every train card on the search page
    function injectInCardButtons() {
        const cards = document.querySelectorAll(".single-trip-wrapper, .trip-wrapper");
        cards.forEach((card) => {
            if (card.querySelector(".trainsolo-in-card-btn")) return;

            const trainTitle = cleanTrainCardTitle(card, "This Train");

            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "trainsolo-in-card-btn";
            btn.innerHTML = `⚡ Auto-Cut ${trainTitle} (${currentTargetConfig.seats} Seats)`;

            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                btn.disabled = true;
                btn.textContent = "⚡ Auto-Cutting...";
                const hudMsg = document.getElementById("hudMsg");

                try {
                    await runAutoCut((msg, type) => {
                        if (hudMsg) {
                            hudMsg.textContent = msg;
                            hudMsg.className = `hud-msg ${type}`;
                        }
                    }, card);
                } catch (err) {
                    if (hudMsg) {
                        hudMsg.textContent = `Auto-cut error: ${err.message || err}`;
                        hudMsg.className = "hud-msg error";
                    }
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = `⚡ Auto-Cut ${trainTitle} (${currentTargetConfig.seats} Seats)`;
                }
            });

            // Insert button in header or action area
            const actionArea = card.querySelector(".trip-action, .trip-right, .trip-head") || card;
            actionArea.appendChild(btn);
        });
    }

    // In-page Floating HUD with interactive Train, Class & Seat Selectors
    let activePopulateTrainCards = () => {};

    async function injectHud() {
        if (document.getElementById("rail-assistant-hud")) return;

        currentTargetConfig = await getEffectiveBookingTarget();

        const seatClasses = [
            { value: "", label: "⚡ Any Class (Most Seats)" },
            { value: "S_CHAIR", label: "S_CHAIR (Shovon Chair)" },
            { value: "SNIGDHA", label: "SNIGDHA (AC Chair)" },
            { value: "AC_S", label: "AC_S (AC Seat)" },
            { value: "AC_B", label: "AC_B (AC Berth)" },
            { value: "SHOVON", label: "SHOVON" },
            { value: "F_SEAT", label: "F_SEAT (First Class Seat)" },
            { value: "F_BERTH", label: "F_BERTH (First Class Berth)" },
            { value: "F_CHAIR", label: "F_CHAIR (First Class Chair)" },
        ];
        const normalizedActiveClass =
            currentTargetConfig.seatClass === "ANY" ? "" : (currentTargetConfig.seatClass || "").toUpperCase();
        const initialTrainFilter = currentTargetConfig.trainNumber || currentTargetConfig.train || "";

        const hud = document.createElement("div");
        hud.id = "rail-assistant-hud";
        hud.innerHTML = `
            <div class="hud-header" id="hudHeader">
                <div class="hud-title">
                    <span>🚆</span>
                    <span>TrainSolo Assistant</span>
                </div>
                <span class="hud-badge" id="hudBadge">Ready</span>
            </div>
            <div class="hud-body">
                <div class="hud-status-box">
                    <div class="hud-status-row">
                        <span class="hud-status-label">Route:</span>
                        <span class="hud-status-value" id="hudRoute">Detecting...</span>
                    </div>
                    <div class="hud-status-row" style="margin-top: 4px;">
                        <span class="hud-status-label" style="align-self: center;">Target Train:</span>
                    </div>
                    <select id="hudTrainSelect" class="hud-train-select">
                        <option value="">⚡ Auto-Detect Best Train (Any)</option>
                    </select>
                    <input
                        id="hudTrainFilterInput"
                        type="text"
                        class="hud-train-filter-input"
                        placeholder="Pre-8AM train # or name (optional, e.g. 777)"
                        value="${initialTrainFilter.replace(/"/g, "&quot;")}"
                    />
                    <div class="hud-status-row" style="margin-top: 6px;">
                        <span class="hud-status-label" style="align-self: center;">Seat Class:</span>
                        <select id="hudClassSelect" class="hud-class-select">
                            ${seatClasses
                                .map(
                                    (sc) =>
                                        `<option value="${sc.value}" ${
                                            normalizedActiveClass === sc.value ? "selected" : ""
                                        }>${sc.label}</option>`
                                )
                                .join("")}
                        </select>
                    </div>
                    <div class="hud-status-row" style="margin-top: 6px;">
                        <span class="hud-status-label" style="align-self: center;">Party Seats:</span>
                        <div class="hud-seat-pill-group" id="hudSeatPills">
                            <button type="button" class="hud-seat-pill ${currentTargetConfig.seats === 1 ? "active" : ""}" data-seats="1">1</button>
                            <button type="button" class="hud-seat-pill ${currentTargetConfig.seats === 2 ? "active" : ""}" data-seats="2">2</button>
                            <button type="button" class="hud-seat-pill ${currentTargetConfig.seats === 3 ? "active" : ""}" data-seats="3">3</button>
                            <button type="button" class="hud-seat-pill ${currentTargetConfig.seats === 4 ? "active" : ""}" data-seats="4">4</button>
                        </div>
                    </div>
                    <div class="hud-status-row" style="margin-top: 6px;">
                        <span class="hud-status-label">Budget:</span>
                        <span class="hud-status-value" id="hudBudget">16/16 remaining</span>
                    </div>
                </div>
                <button class="hud-btn-primary" id="hudCutBtn">
                    <span>⚡ Auto-Cut Seat & Go to OTP</span>
                </button>
                <button class="hud-btn-sniper ${isSniperArmed ? "armed" : ""}" id="hudSniperBtn" type="button">
                    <span>${isSniperArmed ? "🛑 Disarm In-Page Drop Sniper" : "🎯 Arm In-Page Drop Sniper"}</span>
                </button>
                <div class="hud-msg" id="hudMsg">${
                    isSniperArmed
                        ? "🎯 Sniper Armed: Monitoring page for seat release..."
                        : "Select train (or leave Auto-Detect) & click Auto-Cut or Arm Sniper"
                }</div>
            </div>
        `;
        document.body.appendChild(hud);

        const hudHeader = document.getElementById("hudHeader");
        const hudBadge = document.getElementById("hudBadge");
        const hudRoute = document.getElementById("hudRoute");
        const hudTrainSelect = document.getElementById("hudTrainSelect");
        const hudTrainFilterInput = document.getElementById("hudTrainFilterInput");
        const hudClassSelect = document.getElementById("hudClassSelect");
        const hudSeatPills = document.getElementById("hudSeatPills");
        const hudBudget = document.getElementById("hudBudget");
        const hudCutBtn = document.getElementById("hudCutBtn");
        const hudSniperBtn = document.getElementById("hudSniperBtn");
        const hudMsg = document.getElementById("hudMsg");

        if (!hudHeader || !hudTrainSelect || !hudCutBtn || !hudSeatPills || !hudMsg || !hudBadge || !hudRoute || !hudBudget) {
            return;
        }

        function persistHudConfig() {
            const payload = {
                train: currentTargetConfig.train || "",
                train_number: currentTargetConfig.trainNumber || "",
                trainNumber: currentTargetConfig.trainNumber || "",
                seats: currentTargetConfig.seats || 1,
                class: currentTargetConfig.seatClass || "",
                seatClass: currentTargetConfig.seatClass || "",
                hudOverride: true,
                timestamp: Date.now(),
            };
            try {
                sessionStorage.setItem("trainsolo_booking_target", JSON.stringify(payload));
            } catch (_) {}
            try {
                chrome.storage.local.set({ trainsolo_booking_target: payload });
            } catch (_) {}
        }

        // Toggle minimize
        hudHeader.addEventListener("click", () => {
            hud.classList.toggle("minimized");
        });

        // Set route info from URL
        const urlParams = new URLSearchParams(location.search);
        const from = urlParams.get("fromcity") || "";
        const to = urlParams.get("tocity") || "";
        if (from && to) {
            hudRoute.textContent = `${from} ➔ ${to}`;
        } else {
            hudRoute.textContent = location.pathname.includes("/search") ? "Search Results" : "Railway Portal";
        }

        // Update budget
        getRemainingBudget().then(({ remaining }) => {
            hudBudget.textContent = `${remaining}/${MAX_CLICKS_BUDGET} remaining`;
            if (remaining <= 0) {
                hudBudget.style.color = "#dc2626";
                hudCutBtn.disabled = true;
            }
        });

        // Seat Pill Click Handlers
        hudSeatPills.querySelectorAll(".hud-seat-pill").forEach((pill) => {
            pill.addEventListener("click", () => {
                hudSeatPills.querySelectorAll(".hud-seat-pill").forEach((p) => p.classList.remove("active"));
                pill.classList.add("active");
                const count = parseInt(pill.getAttribute("data-seats") || "1", 10);
                currentTargetConfig.seats = count;
                persistHudConfig();
                hudMsg.textContent = `Party size updated to ${count} seat(s).`;
                // Update in-card button labels
                document.querySelectorAll(".trainsolo-in-card-btn").forEach((btn) => {
                    btn.innerHTML = btn.innerHTML.replace(/\(\d+\s*Seats?\)/i, `(${count} Seats)`);
                });
            });
        });

        let isUpdatingHud = false;
        let lastPopulatedHash = "";

        function findReadyCardForSniper(cards) {
            const seatsNeeded = currentTargetConfig.seats || 1;
            const targetClass = currentTargetConfig.seatClass || "";
            if (currentTargetConfig.train || currentTargetConfig.trainNumber) {
                const matched = findTargetTrainCard(cards, currentTargetConfig.train, currentTargetConfig.trainNumber);
                return matched && getCardSeatCapacity(matched, targetClass) >= seatsNeeded ? matched : null;
            }
            const capable = cards.filter((c) => getCardSeatCapacity(c, targetClass) >= seatsNeeded);
            if (capable.length === 0) return null;
            capable.sort((a, b) => getCardSeatCapacity(b, targetClass) - getCardSeatCapacity(a, targetClass));
            return capable[0];
        }

        // Populate train cards in dropdown and inject in-card buttons
        function populateTrainCards() {
            if (isUpdatingHud) return;
            const cards = Array.from(document.querySelectorAll(".single-trip-wrapper, .trip-wrapper"));
            if (cards.length === 0) return;

            // If Sniper is armed and a matching card now has seats, trigger immediately on DOM render!
            if (isSniperArmed && !isAutoCutRunning) {
                const readyCard = findReadyCardForSniper(cards);
                if (readyCard) {
                    isSniperArmed = false;
                    sessionStorage.removeItem("trainsolo_sniper_armed");
                    if (sniperTimer) clearTimeout(sniperTimer);
                    updateSniperUi();
                    hudCutBtn.click();
                }
            }

            // Do not wipe dropdown options while user is actively interacting with the <select>
            if (document.activeElement === hudTrainSelect && hudTrainSelect.options.length > 1) {
                injectInCardButtons();
                return;
            }

            const cardsHash =
                `${currentTargetConfig.train}|${currentTargetConfig.trainNumber}|${currentTargetConfig.seatClass}||` +
                cards
                    .map((c, idx) => `${cleanTrainCardTitle(c, `Train ${idx + 1}`)}:${getCardSeatCapacity(c, currentTargetConfig.seatClass)}`)
                    .join("|");

            if (cardsHash === lastPopulatedHash && hudTrainSelect.options.length > 1) {
                return; // Nothing changed, skip DOM re-population
            }

            isUpdatingHud = true;
            try {
                // Clear previous options except auto-detect
                while (hudTrainSelect.options.length > 1) {
                    hudTrainSelect.remove(1);
                }

                let matchedOptionValue = "";

                cards.forEach((card, idx) => {
                    const title = cleanTrainCardTitle(card, `Train ${idx + 1}`);
                    const num = (title.match(/\b\d{3,4}\b/) || [])[0] || "";
                    const capacity = getCardSeatCapacity(card, currentTargetConfig.seatClass);

                    const opt = document.createElement("option");
                    opt.value = num ? `train_num_${num}` : title;
                    opt.textContent = `🚆 ${title} (${capacity} seats)`;
                    hudTrainSelect.appendChild(opt);

                    // Check if this card matches user's configured target
                    if (
                        (currentTargetConfig.trainNumber && num === currentTargetConfig.trainNumber) ||
                        (currentTargetConfig.train && title.toUpperCase().includes(currentTargetConfig.train))
                    ) {
                        opt.selected = true;
                        matchedOptionValue = opt.value;
                    }
                });

                const hasExplicitTarget = Boolean(currentTargetConfig.train || currentTargetConfig.trainNumber);
                if (!hasExplicitTarget) {
                    // Keep Auto-Detect Best Train (value="") selected so Sniper/Auto-Cut picks highest capacity train dynamically
                    hudTrainSelect.value = "";
                } else if (!matchedOptionValue) {
                    hudTrainSelect.value = "";
                    hudMsg.textContent = `Target train "${currentTargetConfig.train || currentTargetConfig.trainNumber}" not in results yet.`;
                }

                lastPopulatedHash = cardsHash;
                injectInCardButtons();
            } finally {
                isUpdatingHud = false;
            }
        }
        activePopulateTrainCards = populateTrainCards;

        // Run population periodically so cards appearing at 8:00 AM are always picked up
        setInterval(() => {
            const cards = document.querySelectorAll(".single-trip-wrapper, .trip-wrapper");
            if (cards.length > 0) {
                populateTrainCards();
            }
        }, 300);

        // Reactivity for Angular SPA in-place navigation
        let lastObservedHref = location.href;
        setInterval(() => {
            if (location.href !== lastObservedHref) {
                lastObservedHref = location.href;
                const p = new URLSearchParams(location.search);
                const f = p.get("fromcity") || "";
                const t = p.get("tocity") || "";
                if (hudRoute) {
                    hudRoute.textContent = f && t ? `${f} ➔ ${t}` : (location.pathname.includes("/search") ? "Search Results" : "Railway Portal");
                }
                getEffectiveBookingTarget().then((cfg) => {
                    currentTargetConfig = cfg;
                    populateTrainCards();
                });
            }
        }, 800);

        let debounceTimer = null;
        const domObserver = new MutationObserver((mutations) => {
            if (isUpdatingHud) return;

            // CQ-002: Ignore self-mutations caused by HUD or in-card button modifications
            const isSelfMutation = mutations.every((m) => {
                const target = m.target;
                if (!target) return true;
                if (target.nodeType === 1) {
                    const el = target;
                    if (el.closest && (el.closest("#rail-assistant-hud") || el.closest(".trainsolo-in-card-btn"))) {
                        return true;
                    }
                }
                const addedNodes = Array.from(m.addedNodes || []);
                const removedNodes = Array.from(m.removedNodes || []);
                const allNodes = [...addedNodes, ...removedNodes];
                if (allNodes.length > 0) {
                    return allNodes.every((n) => {
                        if (n.nodeType !== 1) return true;
                        const el = n;
                        return el.id === "rail-assistant-hud" || el.classList?.contains("trainsolo-in-card-btn") || (el.closest && (el.closest("#rail-assistant-hud") || el.closest(".trainsolo-in-card-btn")));
                    });
                }
                return false;
            });
            if (isSelfMutation) return;

            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                populateTrainCards();
            }, 120);
        });
        domObserver.observe(document.body, { childList: true, subtree: true });

        // Train Select Change Handler
        hudTrainSelect.addEventListener("change", () => {
            const val = hudTrainSelect.value;
            if (!val) {
                currentTargetConfig.train = "";
                currentTargetConfig.trainNumber = "";
                if (hudTrainFilterInput) hudTrainFilterInput.value = "";
                persistHudConfig();
                hudMsg.textContent = "Target set to ⚡ Auto-Detect Best Train (highest available seats).";
                return;
            }
            currentTargetConfig.train = val.replace(/^train_num_/, "").toUpperCase();
            currentTargetConfig.trainNumber = val.startsWith("train_num_") ? val.replace("train_num_", "") : "";
            if (hudTrainFilterInput) {
                hudTrainFilterInput.value = currentTargetConfig.trainNumber || currentTargetConfig.train;
            }
            persistHudConfig();
            const matchedCard = findTargetTrainCard(
                Array.from(document.querySelectorAll(".single-trip-wrapper, .trip-wrapper")),
                currentTargetConfig.train,
                currentTargetConfig.trainNumber
            );
            if (matchedCard) {
                matchedCard.scrollIntoView({ behavior: "smooth", block: "center" });
                matchedCard.style.outline = "4px solid #16a34a";
                matchedCard.style.boxShadow = "0 0 25px rgba(22, 163, 74, 0.5)";
            }
        });

        // Pre-8AM Train Filter Input Handler (works even when 0 trains are rendered before 8:00 AM)
        if (hudTrainFilterInput) {
            hudTrainFilterInput.addEventListener("input", () => {
                const raw = (hudTrainFilterInput.value || "").trim().toUpperCase();
                if (!raw) {
                    currentTargetConfig.train = "";
                    currentTargetConfig.trainNumber = "";
                    hudTrainSelect.value = "";
                    persistHudConfig();
                    hudMsg.textContent = "Pre-8AM filter cleared: ⚡ Auto-Detect Best Train active.";
                    return;
                }
                const numMatch = raw.match(/\b(\d{3,4})\b/);
                currentTargetConfig.trainNumber = numMatch ? numMatch[1] : "";
                currentTargetConfig.train = raw;
                persistHudConfig();
                lastPopulatedHash = "";
                populateTrainCards();
                hudMsg.textContent = `Target locked to "${raw}" (ready for 8:00 AM drop).`;
            });
        }

        // Seat Class Select Handler
        if (hudClassSelect) {
            hudClassSelect.addEventListener("change", () => {
                currentTargetConfig.seatClass = (hudClassSelect.value || "").toUpperCase();
                persistHudConfig();
                lastPopulatedHash = "";
                populateTrainCards();
                hudMsg.textContent = currentTargetConfig.seatClass
                    ? `Seat class locked to ${currentTargetConfig.seatClass}.`
                    : "Seat class set to ⚡ Any Class (highest available seats).";
            });
        }

        // Auto-cut button click handler
        hudCutBtn.addEventListener("click", async () => {
            hudCutBtn.disabled = true;
            autoDismissSweetAlerts();

            try {
                await runAutoCut((msg, type) => {
                    hudMsg.textContent = msg;
                    hudMsg.className = `hud-msg ${type}`;
                    if (type === "running") {
                        hudBadge.textContent = "Working";
                        hudBadge.style.background = "#2563eb";
                    }
                    if (type === "success") {
                        hudBadge.textContent = "OTP Ready";
                        hudBadge.style.background = "#16a34a";
                    }
                    if (type === "error") {
                        hudBadge.textContent = "Stopped";
                        hudBadge.style.background = "#dc2626";
                    }
                });
            } catch (err) {
                hudMsg.textContent = `Auto-cut failed: ${err.message || err}`;
                hudMsg.className = "hud-msg error";
                hudBadge.textContent = "Stopped";
                hudBadge.style.background = "#dc2626";
            } finally {
                hudCutBtn.disabled = false;
            }
        });

        function updateSniperUi() {
            if (!hudSniperBtn) return;
            if (isSniperArmed) {
                hudSniperBtn.classList.add("armed");
                hudSniperBtn.innerHTML = "<span>🛑 Disarm In-Page Drop Sniper</span>";
                hudBadge.textContent = "Sniper Armed";
                hudBadge.style.background = "#d97706";
            } else {
                hudSniperBtn.classList.remove("armed");
                hudSniperBtn.innerHTML = "<span>🎯 Arm In-Page Drop Sniper</span>";
                if (hudBadge.textContent === "Sniper Armed") {
                    hudBadge.textContent = "Ready";
                    hudBadge.style.background = "#22c55e";
                }
            }
        }

        function scheduleNextSniperCheck() {
            if (sniperTimer) clearTimeout(sniperTimer);
            if (!isSniperArmed) return;

            // Bot-safe interval: 2.6s + jitter during 8:00 AM / 2:00 PM drop windows, 3.4s + jitter otherwise
            const now = new Date();
            const bstMs = now.getTime() + (now.getTimezoneOffset() + 360) * 60000;
            const bst = new Date(bstMs);
            const h = bst.getHours();
            const m = bst.getMinutes();
            const s = bst.getSeconds();
            const inDropWindow =
                ((h === 7 || h === 13) && m === 59 && s >= 54) ||
                ((h === 8 || h === 14) && m === 0 && s <= 50);

            const baseDelay = inDropWindow ? 2600 : 3400;
            const jitter = Math.floor(Math.random() * 350);

            sniperTimer = setTimeout(async () => {
                if (!isSniperArmed || isAutoCutRunning) return;

                const cards = Array.from(document.querySelectorAll(".single-trip-wrapper, .trip-wrapper"));
                const targetCard = findReadyCardForSniper(cards);

                if (targetCard) {
                    isSniperArmed = false;
                    sessionStorage.removeItem("trainsolo_sniper_armed");
                    updateSniperUi();
                    hudCutBtn.click();
                    return;
                }

                const targetDesc =
                    currentTargetConfig.train || currentTargetConfig.trainNumber
                        ? `train "${currentTargetConfig.train || currentTargetConfig.trainNumber}"`
                        : "any available train";
                hudMsg.textContent = `🎯 Sniper active (${targetDesc}): Refreshing search (${((baseDelay + jitter) / 1000).toFixed(1)}s)...`;
                hudMsg.className = "hud-msg running";
                await triggerInPageSearchRefresh();
                scheduleNextSniperCheck();
            }, baseDelay + jitter);
        }

        if (hudSniperBtn) {
            updateSniperUi();
            if (isSniperArmed) {
                scheduleNextSniperCheck();
            }

            hudSniperBtn.addEventListener("click", () => {
                isSniperArmed = !isSniperArmed;
                if (isSniperArmed) {
                    sessionStorage.setItem("trainsolo_sniper_armed", "1");
                    hudMsg.textContent = "🎯 In-Page Drop Sniper armed! Will auto-cut the instant seats unlock.";
                    hudMsg.className = "hud-msg running";
                    updateSniperUi();
                    scheduleNextSniperCheck();
                } else {
                    sessionStorage.removeItem("trainsolo_sniper_armed");
                    if (sniperTimer) clearTimeout(sniperTimer);
                    hudMsg.textContent = "In-Page Drop Sniper disarmed.";
                    hudMsg.className = "hud-msg";
                    updateSniperUi();
                }
            });
        }
    }

    // Auto-trigger if URL has #autocut=1 or ?autocut=1 or storage says autocut (fast 50ms reactive poll)
    async function checkAutoTrigger() {
        const target = await getEffectiveBookingTarget();
        if (target.autoCut || isSniperArmed) {
            console.log("[TrainSolo] Auto-cut / Sniper trigger active! Waiting for train cards...");
            let attempts = 0;
            const initInterval = setInterval(() => {
                attempts++;
                const cards = document.querySelectorAll(".single-trip-wrapper, .trip-wrapper");
                if (cards.length > 0 || attempts >= 160) {
                    clearInterval(initInterval);
                    if (cards.length === 0 && isSniperArmed) {
                        return; // Let scheduleNextSniperCheck handle periodic refresh when 0 cards rendered
                    }
                    const hudCutBtn = document.getElementById("hudCutBtn");
                    if (hudCutBtn && !hudCutBtn.disabled) {
                        hudCutBtn.click();
                    } else {
                        const hudMsg = document.getElementById("hudMsg");
                        runAutoCut((msg, type) => {
                            if (hudMsg) {
                                hudMsg.textContent = msg;
                                hudMsg.className = `hud-msg ${type}`;
                            }
                        });
                    }
                }
            }, 50);
        }
    }

    // Message Listener for Popup & Warm-Tab Background Dispatch
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "AUTO_CUT_SEAT") {
            const hudMsg = document.getElementById("hudMsg");
            runAutoCut((msg, type) => {
                if (hudMsg) {
                    hudMsg.textContent = msg;
                    hudMsg.className = `hud-msg ${type}`;
                }
            })
                .then((success) => sendResponse({ success: Boolean(success) }))
                .catch((err) => sendResponse({ success: false, error: err?.message || String(err) }));
            return true;
        }
        if (request.action === "WARM_DISPATCH_AUTOCUT") {
            sendResponse({ accepted: true });
            (async () => {
                if (request.target) {
                    sessionStorage.setItem("trainsolo_booking_target", JSON.stringify(request.target));
                    currentTargetConfig = {
                        train: (request.target.train || "").toUpperCase(),
                        trainNumber: request.target.train_number || request.target.trainNumber || "",
                        seats: Math.min(4, Math.max(1, request.target.seats || 1)),
                        seatClass: (request.target.class || request.target.seatClass || "").toUpperCase(),
                    };
                }

                const cards = Array.from(document.querySelectorAll(".single-trip-wrapper, .trip-wrapper"));
                const targetCard =
                    currentTargetConfig.train || currentTargetConfig.trainNumber
                        ? findTargetTrainCard(cards, currentTargetConfig.train, currentTargetConfig.trainNumber)
                        : cards[0];

                const hasSeatsNow =
                    targetCard && getCardSeatCapacity(targetCard, currentTargetConfig.seatClass) >= currentTargetConfig.seats;

                const hudMsg = document.getElementById("hudMsg");
                if (cards.length > 0 && hasSeatsNow) {
                    // Warm tab already has the train card and seats rendered — 0ms cut!
                    runAutoCut((msg, type) => {
                        if (hudMsg) {
                            hudMsg.textContent = msg;
                            hudMsg.className = `hud-msg ${type}`;
                        }
                    }, targetCard);
                } else {
                    // Warm tab was on pre-drop empty screen — refresh search in-page and auto-cut immediately on render
                    if (hudMsg) {
                        hudMsg.textContent = "⚡ Warm tab activated! Refreshing train inventory for instant Auto-Cut...";
                        hudMsg.className = "hud-msg running";
                    }
                    await triggerInPageSearchRefresh();
                    await sleep(150);
                    checkAutoTrigger();
                }
            })();
            return true;
        }
        if (request.action === "PING") {
            sendResponse({ ready: true, url: location.href });
        }
    });

    // Check if user is already on OTP screen (e.g. after full page reload)
    function checkOtpScreen() {
        if (location.pathname.includes("/trip-info")) {
            const check = () => {
                const otpInputs = document.querySelectorAll("input.rec-otp");
                if (otpInputs.length > 0) {
                    playSuccessChime();
                    const hudBadge = document.getElementById("hudBadge");
                    if (hudBadge) {
                        hudBadge.textContent = "OTP Ready";
                        hudBadge.style.background = "#16a34a";
                    }
                    const hudMsg = document.getElementById("hudMsg");
                    if (hudMsg) {
                        hudMsg.textContent = "🎉 OTP SCREEN REACHED! Enter the 4-digit SMS code.";
                        hudMsg.className = "hud-msg success";
                    }
                    const firstOtp = otpInputs[0];
                    if (firstOtp) firstOtp.focus();
                }
            };
            check();
            setTimeout(check, 600);
        }
    }

    // Expose internal functions for automated Vitest DOM reality testing
    if (typeof globalThis !== "undefined" && globalThis.__TRAINSOLO_ENABLE_TEST_API__) {
        globalThis.__TRAINSOLO_TEST_API__ = {
            getCardSeatCapacity,
            matchesSeatClass,
            findTargetTrainCard,
            selectOptimalAvailableSeats,
            runAutoCut,
            injectHud,
            populateTrainCards: () => activePopulateTrainCards(),
            setTargetConfig: (cfg) => {
                currentTargetConfig = { ...currentTargetConfig, ...cfg };
            },
            getTargetConfig: () => ({ ...currentTargetConfig }),
        };
    }

    // Initialize HUD on railway search and booking pages
    if (location.hostname.includes("railway.gov.bd")) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
                injectHud();
                checkAutoTrigger();
                checkOtpScreen();
            });
        } else {
            injectHud();
            checkAutoTrigger();
            checkOtpScreen();
        }
    }
})();
