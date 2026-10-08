// TrainSolo Assistant Content Script: In-Page Auto-Seat Cutter
(function () {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
            const mergedAutoCut = earlyAutoCut || existing.autocut || existing.autoCut || false;

            const cached = {
                train: mergedTrain,
                train_number: mergedTrainNum,
                trainNumber: mergedTrainNum,
                seats: mergedSeats,
                class: mergedClass,
                seatClass: mergedClass,
                autocut: mergedAutoCut,
                autoCut: mergedAutoCut,
                timestamp: Date.now(),
            };
            sessionStorage.setItem("trainsolo_booking_target", JSON.stringify(cached));
            if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ trainsolo_booking_target: cached });
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

        // 2. Check early sessionStorage
        if (!train || !seats) {
            try {
                const rawSession = sessionStorage.getItem("trainsolo_booking_target");
                if (rawSession) {
                    const s = JSON.parse(rawSession);
                    if (!train && s.train) train = s.train;
                    if (!trainNumber && (s.train_number || s.trainNumber)) trainNumber = s.train_number || s.trainNumber;
                    if (!seats && s.seats) seats = s.seats;
                    if (!seatClass && (s.class || s.seatClass)) seatClass = s.class || s.seatClass;
                    if (s.autocut || s.autoCut) autoCut = true;
                }
            } catch (_) {}
        }

        // 3. Check chrome.storage.local (synced from TrainSolo app via tracker-bridge)
        if (!train || !seats) {
            try {
                const storage = await new Promise((r) => chrome.storage.local.get(["trainsolo_booking_target"], r));
                const t = storage.trainsolo_booking_target;
                if (t && Date.now() - (t.timestamp || 0) < 60 * 60 * 1000) {
                    if (!train && t.train) train = t.train;
                    if (!trainNumber && (t.train_number || t.trainNumber)) trainNumber = t.train_number || t.trainNumber;
                    if (!seats && t.seats) seats = t.seats;
                    if (!seatClass && (t.class || t.seatClass)) seatClass = t.class || t.seatClass;
                    if (t.autocut || t.autoCut) autoCut = true;
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

    // Computes total available seats visible on a card for a given class
    function getCardSeatCapacity(card, targetClass) {
        if (targetClass && targetClass !== "ANY") {
            const rows = Array.from(
                card.querySelectorAll("tr, .trip-seat-class, .seat-class-row, .single-seat-class, li, div[class*='class']")
            );
            for (const r of rows) {
                const rowText = r.textContent || "";
                if (matchesSeatClass(rowText, targetClass)) {
                    const countMatch = rowText.match(/(\d+)\s*(?:Seat|Available|আসন)/i) || rowText.match(/\((\d+)\)/);
                    if (countMatch) return parseInt(countMatch[1], 10);
                }
            }
        }
        // General count on card
        const allMatches = Array.from((card.textContent || "").matchAll(/(\d+)\s*(?:Seat|Available|আসন)/gi));
        let max = 0;
        for (const m of allMatches) {
            const val = parseInt(m[1], 10);
            if (val > max) max = val;
        }
        return max;
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

            // 1. Wait for train search results to load
            onStatus("Waiting for train search results to load...", "running");
            let cards = [];
            let cardWaitTries = 0;
            while (cards.length === 0 && cardWaitTries < 60) {
                cards = Array.from(document.querySelectorAll(".single-trip-wrapper, .trip-wrapper"));
                if (cards.length > 0) break;
                await sleep(250);
                cardWaitTries++;
            }

            if (!cards.length) {
                onStatus("No train cards rendered on page. Please verify your search route.", "error");
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
                    card.scrollIntoView({ behavior: "smooth", block: "center" });
                    card.style.outline = "4px solid #16a34a";
                    card.style.boxShadow = "0 0 25px rgba(22, 163, 74, 0.5)";
                    card.style.borderRadius = "12px";
                    card.style.transition = "all 0.3s ease";
                } catch (_) {}
            }

            // 2. Open seat map (scoped strictly to target card)
            let seatMapOpen = Boolean(card && card.querySelector("#select-bogie"));

            if (!seatMapOpen && card) {
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
                if (targetClass && targetClass !== "ANY" && validBookButtons.length > 0) {
                    for (const btn of validBookButtons) {
                        const row = btn.closest("tr, .trip-seat-class, .seat-class-row, .single-seat-class, li, div[class*='class']");
                        const rowText = row ? row.textContent || "" : "";
                        if (row && matchesSeatClass(rowText, targetClass)) {
                            bookNowBtn = btn;
                            break;
                        }
                    }
                } else if (!targetClass || targetClass === "ANY") {
                    bookNowBtn = validBookButtons.find((b) => !b.disabled) || validBookButtons[0];
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
                while (!(card && card.querySelector("#select-bogie")) && waitTries < 60) {
                    await sleep(150);
                    waitTries++;
                }
            }

            // 3. Select coach with vacant seats (scoped strictly to target card)
            const bogieSelect = card ? card.querySelector("#select-bogie") : null;
            if (!bogieSelect) {
                onStatus("Coach dropdown (#select-bogie) not found in target train card.", "error");
                return false;
            }

            const options = Array.from(bogieSelect.options)
                .filter((o) => {
                    const text = (o.text || "").trim().toLowerCase();
                    return text && !text.includes("select coach") && !text.includes("বগি নির্বাচন");
                })
                .map((o) => {
                    const text = o.text.trim();
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

            let targetCoach = null;
            if (capableCoaches.length > 0) {
                targetCoach = capableCoaches[0];
            } else {
                onStatus(
                    `Cannot accommodate full requested party of ${seatsNeeded} seat(s) in any single coach for this train. Stopped to avoid split/partial booking.`,
                    "error"
                );
                return false;
            }

            if (bogieSelect.value !== targetCoach.value) {
                onStatus(`Switching to Coach ${targetCoach.name} (${targetCoach.count} seats)...`, "running");
                bogieSelect.value = targetCoach.value;
                bogieSelect.dispatchEvent(new Event("change", { bubbles: true }));
                bogieSelect.dispatchEvent(new Event("input", { bubbles: true }));
                await sleep(800); // Wait for Angular to re-render coach seat layout
            }

            // 4. Find available white seats in target coach (scoped to target card)
            const seatMapContainer = (card && (card.querySelector(".seat-layout, .seat-plan, .seat-map, .bogie-seat-container") || card)) || document;

            // Reconcile already selected seats in this coach
            const alreadySelected = Array.from(
                seatMapContainer.querySelectorAll("button.btn-seat, button[data-seat]")
            ).filter((b) => {
                const cl = b.className || "";
                const isSelected = cl.includes("selected") || cl.includes("seat-selected") || b.getAttribute("aria-selected") === "true";
                const txt = (b.textContent || b.getAttribute("data-seat") || "").trim().toUpperCase();
                return isSelected && txt.startsWith(targetCoach.name + "-");
            });

            const neededClicks = Math.max(0, seatsNeeded - alreadySelected.length);
            let seatsToClick = [];

            if (neededClicks === 0) {
                onStatus(`All ${seatsNeeded} requested seat(s) already selected in Coach ${targetCoach.name}.`, "running");
            } else {
                onStatus(`Scanning vacant seats in Coach ${targetCoach.name} (Need ${neededClicks} more seat(s))...`, "running");
                let availableSeats = [];
                let scanTries = 0;
                while (availableSeats.length < neededClicks && scanTries < 40) {
                    const allSeatBtns = Array.from(seatMapContainer.querySelectorAll("button.btn-seat, button[data-seat]"));
                    let coachScopedBtns = allSeatBtns.filter((b) => {
                        const txt = (b.textContent || b.getAttribute("data-seat") || "").trim().toUpperCase();
                        return txt.startsWith(targetCoach.name + "-");
                    });

                    // Never fall back to allSeatBtns; wait for coach seat buttons to render
                    if (coachScopedBtns.length === 0) {
                        await sleep(150);
                        scanTries++;
                        continue;
                    }

                    availableSeats = coachScopedBtns.filter((b) => {
                        const cl = b.className || "";
                        const txt = (b.textContent || b.getAttribute("data-seat") || "").trim();
                        // Require positive indication of availability
                        const isAvailableClass =
                            cl.includes("seat-available") ||
                            cl.includes("seat-white") ||
                            cl.includes("white");
                        const isNotOccupied = !/seat-booked|seat-in-progress|selected|booked|occupied/i.test(cl);
                        return isAvailableClass && isNotOccupied && !b.disabled && txt.length > 0;
                    });

                    if (availableSeats.length >= neededClicks) break;
                    await sleep(150);
                    scanTries++;
                }

                if (availableSeats.length < neededClicks) {
                    onStatus(
                        `Only found ${availableSeats.length} available seat(s) in Coach ${targetCoach.name} (needed ${neededClicks}). Stopped to prevent partial booking.`,
                        "error"
                    );
                    return false;
                }

                seatsToClick = availableSeats.slice(0, neededClicks);
                onStatus(`Selecting ${seatsToClick.length} seat(s) in Coach ${targetCoach.name}...`, "running");

                for (let i = 0; i < seatsToClick.length; i++) {
                    const { remaining: curBudget } = await getRemainingBudget();
                    if (curBudget <= 0) {
                        onStatus("Click budget reached (16 clicks / 15 min). Stopped to prevent 1-hour account lockout.", "error");
                        return false;
                    }

                    const seatBtn = seatsToClick[i];
                    const seatLabel = (seatBtn.textContent || seatBtn.getAttribute("data-seat") || "").trim();

                    onStatus(`Selecting seat ${seatLabel} (${i + 1}/${seatsToClick.length})...`, "running");
                    seatBtn.click();
                    await recordClick(seatLabel, "attempted");

                    // Verify seat selection state
                    let verified = false;
                    for (let check = 0; check < 8; check++) {
                        await sleep(150);
                        const cl = seatBtn.className || "";
                        if (
                            cl.includes("selected") ||
                            cl.includes("seat-selected") ||
                            seatBtn.getAttribute("aria-selected") === "true"
                        ) {
                            verified = true;
                            break;
                        }
                    }

                    if (!verified) {
                        const alertMsg = autoDismissSweetAlerts();
                        if (alertMsg && alertMsg.includes("Multiple order attempt")) {
                            onStatus(`Shohoz lockout: ${alertMsg.slice(0, 60)}`, "error");
                            return false;
                        }
                        onStatus(`Seat ${seatLabel} click was not registered as selected. Aborted to avoid mis-booking.`, "error");
                        return false;
                    }
                }
            }

            // 5. Click CONTINUE PURCHASE with precise matching
            onStatus(`Seats locked (${seatsNeeded}/${seatsNeeded})! Clicking CONTINUE PURCHASE...`, "running");
            await sleep(300);

            const alertMsg = autoDismissSweetAlerts();
            if (alertMsg && alertMsg.includes("Multiple order attempt")) {
                onStatus(`Shohoz lockout: ${alertMsg.slice(0, 60)}`, "error");
                return false;
            }

            const continueBtn = Array.from(
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

            if (!continueBtn) {
                onStatus("Enabled CONTINUE PURCHASE button not found. Please click it manually.", "error");
                return false;
            }

            continueBtn.click();
            onStatus("Pushed purchase! Waiting for OTP screen (/trip-info)...", "running");

            // 6. Wait for OTP screen
            let otpTries = 0;
            while (otpTries < 60) {
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
                await sleep(250);
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

                await runAutoCut((msg, type) => {
                    if (hudMsg) {
                        hudMsg.textContent = msg;
                        hudMsg.className = `hud-msg ${type}`;
                    }
                    if (type === "error" || type === "success") {
                        btn.disabled = false;
                        btn.innerHTML = `⚡ Auto-Cut ${trainTitle} (${currentTargetConfig.seats} Seats)`;
                    }
                }, card);
            });

            // Insert button in header or action area
            const actionArea = card.querySelector(".trip-action, .trip-right, .trip-head") || card;
            actionArea.appendChild(btn);
        });
    }

    // In-page Floating HUD with interactive Train & Seat Selectors
    async function injectHud() {
        if (document.getElementById("rail-assistant-hud")) return;

        currentTargetConfig = await getEffectiveBookingTarget();

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
                        <option value="">⚡ Auto-Detect Best Train</option>
                    </select>
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
                <div class="hud-msg" id="hudMsg">Select train and seats above, then click Auto-Cut</div>
            </div>
        `;
        document.body.appendChild(hud);

        const hudHeader = document.getElementById("hudHeader");
        const hudBadge = document.getElementById("hudBadge");
        const hudRoute = document.getElementById("hudRoute");
        const hudTrainSelect = document.getElementById("hudTrainSelect");
        const hudSeatPills = document.getElementById("hudSeatPills");
        const hudBudget = document.getElementById("hudBudget");
        const hudCutBtn = document.getElementById("hudCutBtn");
        const hudMsg = document.getElementById("hudMsg");

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
                chrome.storage.local.set({
                    trainsolo_booking_target: {
                        ...currentTargetConfig,
                        train_number: currentTargetConfig.trainNumber,
                        class: currentTargetConfig.seatClass,
                        timestamp: Date.now(),
                    },
                });
                hudMsg.textContent = `Party size updated to ${count} seat(s).`;
                // Update in-card button labels
                document.querySelectorAll(".trainsolo-in-card-btn").forEach((btn) => {
                    btn.innerHTML = btn.innerHTML.replace(/\(\d+\s*Seats?\)/i, `(${count} Seats)`);
                });
            });
        });

        // Populate train cards in dropdown and inject in-card buttons
        function populateTrainCards() {
            const cards = Array.from(document.querySelectorAll(".single-trip-wrapper, .trip-wrapper"));
            if (cards.length === 0) return;

            // Clear previous options except auto-detect
            while (hudTrainSelect.options.length > 1) {
                hudTrainSelect.remove(1);
            }

            let bestCardOption = "";
            let maxSeats = -1;

            cards.forEach((card, idx) => {
                const title = cleanTrainCardTitle(card, `Train ${idx + 1}`);
                const num = (title.match(/\b\d{3,4}\b/) || [])[0] || "";
                const capacity = getCardSeatCapacity(card, currentTargetConfig.seatClass);

                const opt = document.createElement("option");
                opt.value = num ? `train_num_${num}` : title;
                opt.textContent = `🚆 ${title} (${capacity} seats)`;
                hudTrainSelect.appendChild(opt);

                if (capacity > maxSeats) {
                    maxSeats = capacity;
                    bestCardOption = opt.value;
                }

                // Check if this card matches user's configured target
                if (
                    (currentTargetConfig.trainNumber && num === currentTargetConfig.trainNumber) ||
                    (currentTargetConfig.train && title.toUpperCase().includes(currentTargetConfig.train))
                ) {
                    opt.selected = true;
                }
            });

            // Only pre-select best inventory train if user did NOT specify an explicit train target
            const hasExplicitTarget = Boolean(currentTargetConfig.train || currentTargetConfig.trainNumber);
            if (!hasExplicitTarget && !hudTrainSelect.value && bestCardOption) {
                hudTrainSelect.value = bestCardOption;
            } else if (hasExplicitTarget && !hudTrainSelect.value) {
                hudMsg.textContent = `Target train "${currentTargetConfig.train || currentTargetConfig.trainNumber}" not found in current search results.`;
            }

            injectInCardButtons();
        }

        // Run population once cards load
        let checkCardsInterval = setInterval(() => {
            const cards = document.querySelectorAll(".single-trip-wrapper, .trip-wrapper");
            if (cards.length > 0) {
                populateTrainCards();
                clearInterval(checkCardsInterval);
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
        const domObserver = new MutationObserver(() => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                populateTrainCards();
            }, 600);
        });
        domObserver.observe(document.body, { childList: true, subtree: true });

        // Train Select Change Handler
        hudTrainSelect.addEventListener("change", () => {
            const val = hudTrainSelect.value;
            currentTargetConfig.train = val.replace(/^train_num_/, "");
            currentTargetConfig.trainNumber = val.startsWith("train_num_") ? val.replace("train_num_", "") : "";
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

        // Auto-cut button click handler
        hudCutBtn.addEventListener("click", async () => {
            hudCutBtn.disabled = true;
            autoDismissSweetAlerts();

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
                    hudCutBtn.disabled = false;
                }
                if (type === "error") {
                    hudBadge.textContent = "Stopped";
                    hudBadge.style.background = "#dc2626";
                    hudCutBtn.disabled = false;
                }
            });
        });
    }

    // Auto-trigger if URL has #autocut=1 or ?autocut=1 or storage says autocut
    async function checkAutoTrigger() {
        const target = await getEffectiveBookingTarget();
        if (target.autoCut) {
            console.log("[TrainSolo] Auto-cut trigger active! Waiting for train cards...");
            let attempts = 0;
            const initInterval = setInterval(() => {
                attempts++;
                const cards = document.querySelectorAll(".single-trip-wrapper, .trip-wrapper");
                if (cards.length > 0 || attempts >= 40) {
                    clearInterval(initInterval);
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
            }, 250);
        }
    }

    // Message Listener for Popup triggering
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "AUTO_CUT_SEAT") {
            const hudMsg = document.getElementById("hudMsg");
            runAutoCut((msg, type) => {
                if (hudMsg) {
                    hudMsg.textContent = msg;
                    hudMsg.className = `hud-msg ${type}`;
                }
            }).then((success) => sendResponse({ success }));
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
