// TrainSolo Tracker Bridge: Syncs booking targets and auto-cut actions between TrainSolo client and extension
(function () {
    // 1. Listen for storage events from TrainSolo
    window.addEventListener("storage", (e) => {
        if (e.key === "trainsolo_booking_target" && e.newValue) {
            try {
                const data = JSON.parse(e.newValue);
                chrome.storage.local.set({ trainsolo_booking_target: data });
                console.log("[TrainSolo Bridge] Synced booking target to extension storage:", data);
            } catch (_) {}
        }
    });

    // 2. Listen for custom window events dispatched by TrainSolo client
    window.addEventListener("trainsolo:sync-target", (e) => {
        if (e.detail) {
            chrome.storage.local.set({ trainsolo_booking_target: e.detail });
            console.log("[TrainSolo Bridge] Custom event synced target:", e.detail);
        }
    });

    // 3. Intercept clicks on TrainSolo Auto-Cut buttons to ensure target is saved immediately before tab opens
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
                        seats,
                        class: seatClass,
                        from,
                        to,
                        date,
                        autocut: true,
                        timestamp: Date.now(),
                    };

                    chrome.storage.local.set({ trainsolo_booking_target: targetData });
                    console.log("[TrainSolo Bridge] Intercepted Auto-Cut link click! Saved target:", targetData);
                } catch (_) {}
            }
        },
        true,
    );
})();
