// TrainSolo Tracker Bridge: Syncs booking targets, warm-tab preloading, and zero-click auto-dispatch
(function () {
    // Signal to TrainSolo client that the extension bridge is active
    try {
        document.documentElement.setAttribute("data-trainsolo-extension", "active");
    } catch (_) {}

    // 1. Listen for storage events from TrainSolo
    window.addEventListener("storage", (e) => {
        if (e.key === "trainsolo_booking_target" && e.newValue) {
            try {
                const data = JSON.parse(e.newValue);
                chrome.storage.local.set({ trainsolo_booking_target: data });
            } catch (_) {}
        }
    });

    // 2. Listen for custom window events dispatched by TrainSolo client
    window.addEventListener("trainsolo:sync-target", (e) => {
        if (e.detail) {
            chrome.storage.local.set({ trainsolo_booking_target: e.detail });
        }
    });

    // 3. Pre-warm an eticket.railway.gov.bd tab in the background before the drop
    window.addEventListener("trainsolo:prewarm-tab", (e) => {
        const detail = e.detail || {};
        if (!detail.url) return;
        try {
            chrome.runtime.sendMessage(
                {
                    action: "PREWARM_RAILWAY_TAB",
                    url: detail.url,
                    target: detail.target || null,
                },
                (resp) => {
                    window.dispatchEvent(
                        new CustomEvent("trainsolo:prewarm-status", {
                            detail: resp || { ok: false },
                        })
                    );
                }
            );
        } catch (_) {}
    });

    // 4. Hands-free zero-click auto-dispatch when scanner finds available seats
    window.addEventListener("trainsolo:auto-dispatch", (e) => {
        const detail = e.detail || {};
        if (!detail.url && !detail.target) return;
        try {
            chrome.runtime.sendMessage(
                {
                    action: "DISPATCH_AUTOCUT",
                    url: detail.url,
                    target: detail.target,
                },
                (resp) => {
                    if (chrome.runtime.lastError || !resp || !resp.ok) {
                        if (detail.url) {
                            window.open(detail.url, "_blank", "noopener,noreferrer");
                        }
                    }
                }
            );
        } catch (_) {
            if (detail.url) {
                window.open(detail.url, "_blank", "noopener,noreferrer");
            }
        }
    });

    // 5. Intercept clicks on TrainSolo Auto-Cut buttons to reuse a warm railway tab when available
    document.addEventListener(
        "click",
        (e) => {
            const link = e.target.closest("a");
            if (
                link &&
                (link.href || "").includes("eticket.railway.gov.bd") &&
                (link.href || "").includes("autocut=1")
            ) {
                try {
                    const u = new URL(link.href);
                    const train = u.searchParams.get("train") || "";
                    const trainNum =
                        u.searchParams.get("train_number") ||
                        (train.match(/\b\d{3,4}\b/) || [])[0] ||
                        "";
                    const seats = parseInt(u.searchParams.get("seats") || "1", 10);
                    const seatClass = u.searchParams.get("class") || "";
                    const from = u.searchParams.get("fromcity") || "";
                    const to = u.searchParams.get("tocity") || "";
                    const date = u.searchParams.get("doj") || "";

                    const targetData = {
                        train,
                        train_number: trainNum,
                        trainNumber: trainNum,
                        seats,
                        class: seatClass,
                        seatClass: seatClass,
                        from,
                        to,
                        date,
                        autocut: true,
                        autoCut: true,
                        timestamp: Date.now(),
                    };

                    chrome.storage.local.set({ trainsolo_booking_target: targetData });

                    // Route through background service worker to reuse warm railway tab (0ms cold boot)
                    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
                        e.preventDefault();
                        chrome.runtime.sendMessage(
                            {
                                action: "DISPATCH_AUTOCUT",
                                url: link.href,
                                target: targetData,
                            },
                            (resp) => {
                                if (chrome.runtime.lastError || !resp || !resp.ok) {
                                    window.open(link.href, "_blank", "noopener,noreferrer");
                                }
                            }
                        );
                    }
                } catch (_) {}
            }
        },
        true
    );
})();
