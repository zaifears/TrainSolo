// TrainSolo Assistant Content Script: In-Page Auto-Seat Cutter
(function () {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

    // Safety Click Ledger (15-min sliding window, max 2 clicks)
    async function getRemainingBudget() {
        return new Promise((resolve) => {
            chrome.storage.local.get(["rail_click_ledger"], (data) => {
                const ledger = data.rail_click_ledger || [];
                const cutoff = Date.now() - 15 * 60 * 1000;
                const recent = ledger.filter((entry) => entry.timestamp > cutoff);
                const remaining = Math.max(0, 2 - recent.length);
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

    // Auto-Cut Execution Logic
    async function runAutoCut(onStatus) {
        onStatus("Checking 15-minute click budget...", "running");
        const { remaining } = await getRemainingBudget();
        if (remaining <= 0) {
            onStatus("Click budget reached (2 clicks / 15 min). Wait to prevent account lock.", "error");
            return false;
        }

        // 1. Wait for train search results to load
        onStatus("Waiting for train search results to load...", "running");
        let cards = [];
        let cardWaitTries = 0;
        while (cards.length === 0 && cardWaitTries < 60) {
            cards = Array.from(document.querySelectorAll(".single-trip-wrapper"));
            if (cards.length > 0) break;
            await sleep(250);
            cardWaitTries++;
        }

        if (!cards.length) {
            onStatus("No train cards rendered on page. Please verify your search route.", "error");
            return false;
        }

        // Parse target train and class from URL
        const urlParams = new URLSearchParams(location.search);
        const targetClass = (urlParams.get("class") || "").toUpperCase();
        const targetTrain = (urlParams.get("train") || "").toUpperCase();

        // Find the specific target train card, or the first available
        let card = null;
        if (targetTrain) {
            card = cards.find((c) => (c.textContent || "").toUpperCase().includes(targetTrain));
        }
        if (!card) {
            card = cards.find(
                (c) => c.querySelector("#select-bogie") || c.querySelector(".book-now-btn:not(:disabled)")
            ) || cards[0];
        }

        let seatMapOpen = Boolean(card.querySelector("#select-bogie"));

        if (!seatMapOpen) {
            let bookNowBtn = null;
            if (targetClass) {
                // Find seat class row/box matching targetClass within this card
                const classContainers = Array.from(card.querySelectorAll("tr, div, li, .trip-seat-class"));
                const matchedClassEl = classContainers.find(
                    (el) =>
                        (el.textContent || "").toUpperCase().includes(targetClass) &&
                        el.querySelector(".book-now-btn, button")
                );
                if (matchedClassEl) {
                    bookNowBtn = matchedClassEl.querySelector(".book-now-btn, button");
                }
            }
            if (!bookNowBtn) {
                bookNowBtn = card.querySelector(".book-now-btn, button.book-now-btn");
            }
            if (!bookNowBtn) {
                onStatus("No available tickets / Book Now button found on train card.", "error");
                return false;
            }
            bookNowBtn.click();
            onStatus("Opened seat map. Loading coaches...", "running");
            let waitTries = 0;
            while (!card.querySelector("#select-bogie") && waitTries < 50) {
                await sleep(100);
                waitTries++;
            }
        }

        // 2. Select coach with vacant seats
        const bogieSelect = card.querySelector("#select-bogie");
        if (!bogieSelect) {
            onStatus("Coach dropdown (#select-bogie) not found.", "error");
            return false;
        }

        const options = Array.from(bogieSelect.options).map((o) => {
            const m = o.text.match(/([A-Z0-9_]+)\s*-\s*(\d+)\s*Seat/i);
            return {
                name: m ? m[1].toUpperCase() : o.text.trim(),
                count: m ? parseInt(m[2], 10) : 0,
                value: o.value,
            };
        });

        const targetCoach = options.find((o) => o.count >= 1) || options[0];
        if (!targetCoach || targetCoach.count === 0) {
            onStatus("All coaches show 0 vacant seats.", "error");
            return false;
        }

        if (bogieSelect.value !== targetCoach.value) {
            onStatus(`Switching to Coach ${targetCoach.name} (${targetCoach.count} seats)...`, "running");
            bogieSelect.value = targetCoach.value;
            bogieSelect.dispatchEvent(new Event("change", { bubbles: true }));
            bogieSelect.dispatchEvent(new Event("input", { bubbles: true }));
            await sleep(400);
        }

        // 3. Find available white seat
        onStatus(`Scanning vacant seats in Coach ${targetCoach.name}...`, "running");
        let availableSeats = [];
        let scanTries = 0;
        while (availableSeats.length === 0 && scanTries < 40) {
            const allSeatBtns = Array.from(document.querySelectorAll("button.btn-seat"));
            availableSeats = allSeatBtns.filter((b) => {
                const cl = b.className;
                const txt = (b.textContent || "").trim();
                return (
                    /seat-available/.test(cl) &&
                    !b.disabled &&
                    !/seat-booked|seat-in-progress/.test(cl) &&
                    txt.startsWith(targetCoach.name + "-")
                );
            });
            if (availableSeats.length === 0) {
                await sleep(100);
                scanTries++;
            }
        }

        if (!availableSeats.length) {
            onStatus(`No vacant seats available in Coach ${targetCoach.name}.`, "error");
            return false;
        }

        // 4. Click seat & verify cart
        const targetSeatBtn = availableSeats[0];
        const seatLabel = targetSeatBtn.textContent.trim();

        // Check if already selected
        if (/selected/.test(targetSeatBtn.className)) {
            onStatus(`${seatLabel} is already in cart. Proceeding...`, "running");
        } else {
            onStatus(`Selecting seat ${seatLabel}...`, "running");
            const beforeFare = (() => {
                const el = document.querySelector(".total-amount, .trip-fare-details, .fare-details") || document.body;
                const m = (el.textContent || "").match(/Total:\s*৳\s*([\d,]+)/);
                return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
            })();

            targetSeatBtn.click();
            await recordClick(seatLabel, "attempted");

            // Verify selection
            let verified = false;
            const deadline = Date.now() + 4500;
            while (Date.now() < deadline) {
                await sleep(60);
                const el = document.querySelector(".total-amount, .trip-fare-details, .fare-details") || document.body;
                const m = (el.textContent || "").match(/Total:\s*৳\s*([\d,]+)/);
                const currentFare = m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
                if (/selected/.test(targetSeatBtn.className) || currentFare > beforeFare) {
                    verified = true;
                    break;
                }
            }

            if (!verified) {
                onStatus(`Could not verify seat ${seatLabel}. Check seat map.`, "error");
                return false;
            }
        }

        // 5. Click CONTINUE PURCHASE
        onStatus("Seat locked! Clicking CONTINUE PURCHASE...", "running");
        const continueBtn = Array.from(
            document.querySelectorAll("button, a, input[type='button'], input[type='submit']")
        ).find((el) => /continue\s*purchase/i.test((el.textContent || el.value || "").trim()));

        if (!continueBtn) {
            onStatus("CONTINUE PURCHASE button not found. Please click it manually.", "error");
            return false;
        }

        continueBtn.click();
        onStatus("Pushed purchase! Waiting for OTP screen (/trip-info)...", "running");

        // 6. Wait for OTP screen
        let otpTries = 0;
        while (otpTries < 60) {
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

        onStatus("Pushed purchase. Please check screen for OTP prompt.", "success");
        return true;
    }

    // In-page Floating HUD
    function injectHud() {
        if (document.getElementById("rail-assistant-hud")) return;

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
                    <div class="hud-status-row">
                        <span class="hud-status-label">Budget:</span>
                        <span class="hud-status-value" id="hudBudget">2/2 remaining</span>
                    </div>
                </div>
                <button class="hud-btn-primary" id="hudCutBtn">
                    <span>⚡ Auto-Cut Seat & Go to OTP</span>
                </button>
                <div class="hud-msg" id="hudMsg">Click above to select best vacant seat instantly</div>
            </div>
        `;
        document.body.appendChild(hud);

        const hudHeader = document.getElementById("hudHeader");
        const hudBadge = document.getElementById("hudBadge");
        const hudRoute = document.getElementById("hudRoute");
        const hudBudget = document.getElementById("hudBudget");
        const hudCutBtn = document.getElementById("hudCutBtn");
        const hudMsg = document.getElementById("hudMsg");

        // Toggle minimize
        hudHeader.addEventListener("click", () => {
            hud.classList.toggle("minimized");
        });

        // Update route info from URL
        const params = new URLSearchParams(location.search);
        const from = params.get("fromcity") || "";
        const to = params.get("tocity") || "";
        if (from && to) {
            hudRoute.textContent = `${from} ➔ ${to}`;
        } else {
            hudRoute.textContent = location.pathname.includes("/search") ? "Search Results" : "Railway Portal";
        }

        // Update budget
        getRemainingBudget().then(({ remaining }) => {
            hudBudget.textContent = `${remaining}/2 remaining`;
            if (remaining <= 0) {
                hudBudget.style.color = "#dc2626";
                hudCutBtn.disabled = true;
            }
        });

        // Auto-cut button click handler
        hudCutBtn.addEventListener("click", async () => {
            hudCutBtn.disabled = true;
            await runAutoCut((msg, type) => {
                hudMsg.textContent = msg;
                hudMsg.className = `hud-msg ${type}`;
                if (type === "running") hudBadge.textContent = "Working";
                if (type === "success") {
                    hudBadge.textContent = "OTP Ready";
                    hudBadge.style.background = "#16a34a";
                }
                if (type === "error") {
                    hudBadge.textContent = "Stopped";
                    hudBadge.style.background = "#dc2626";
                    hudCutBtn.disabled = false;
                }
            });
        });
    }

    // Auto-trigger if URL has #autocut=1 or ?autocut=1
    function checkAutoTrigger() {
        const hash = location.hash || "";
        const search = location.search || "";
        if (hash.includes("autocut=1") || search.includes("autocut=1")) {
            console.log("[TrainSolo] Auto-cut trigger detected in URL! Initiating automated ticket cut...");
            setTimeout(() => {
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
            }, 500);
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
            return true; // Keep message channel open for async response
        }
        if (request.action === "PING") {
            sendResponse({ ready: true, url: location.href });
        }
    });

    // Initialize HUD on railway search and booking pages
    if (location.hostname.includes("railway.gov.bd")) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
                injectHud();
                checkAutoTrigger();
            });
        } else {
            injectHud();
            checkAutoTrigger();
        }
    }
})();
