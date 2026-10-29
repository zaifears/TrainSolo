// TrainSolo Assistant Background Service Worker: Warm Tab Reuse & Instant Auto-Cut Dispatch
function normalizeParam(val) {
    return decodeURIComponent(val || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function isSameSearchJourney(tabUrlStr, targetUrlStr) {
    try {
        const tabUrl = new URL(tabUrlStr);
        const targetUrl = new URL(targetUrlStr);
        if (!tabUrl.pathname.includes("/booking/train/search")) return false;

        const fromMatch =
            normalizeParam(tabUrl.searchParams.get("fromcity")) ===
            normalizeParam(targetUrl.searchParams.get("fromcity"));
        const toMatch =
            normalizeParam(tabUrl.searchParams.get("tocity")) ===
            normalizeParam(targetUrl.searchParams.get("tocity"));
        const dateMatch =
            normalizeParam(tabUrl.searchParams.get("doj")) ===
            normalizeParam(targetUrl.searchParams.get("doj"));

        return Boolean(fromMatch && toMatch && dateMatch);
    } catch (_) {
        return false;
    }
}

async function findRailwayTabs() {
    try {
        return await chrome.tabs.query({ url: "*://eticket.railway.gov.bd/*" });
    } catch (_) {
        return [];
    }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.action) return false;

    if (message.action === "PREWARM_RAILWAY_TAB") {
        (async () => {
            const targetUrl = message.url || "https://eticket.railway.gov.bd/";
            if (message.target) {
                await chrome.storage.local.set({
                    trainsolo_booking_target: {
                        ...message.target,
                        autocut: false,
                        autoCut: false,
                        timestamp: Date.now(),
                    },
                });
            }

            const tabs = await findRailwayTabs();
            const matchingTab = tabs.find((t) => t.url && isSameSearchJourney(t.url, targetUrl));

            if (matchingTab && matchingTab.id) {
                sendResponse({ ok: true, status: "already_warm", tabId: matchingTab.id });
                return;
            }

            if (tabs.length > 0 && tabs[0].id) {
                await chrome.tabs.update(tabs[0].id, { url: targetUrl, active: false });
                sendResponse({ ok: true, status: "updated_existing", tabId: tabs[0].id });
                return;
            }

            const created = await chrome.tabs.create({ url: targetUrl, active: false });
            sendResponse({ ok: true, status: "created_warm", tabId: created.id });
        })().catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }

    if (message.action === "DISPATCH_AUTOCUT") {
        (async () => {
            const target = message.target || {};
            const targetUrl = message.url || "";

            const storedTarget = {
                ...target,
                autocut: true,
                autoCut: true,
                timestamp: Date.now(),
            };
            await chrome.storage.local.set({ trainsolo_booking_target: storedTarget });

            const tabs = await findRailwayTabs();
            // Prefer a tab already sitting on the exact route/date search page
            const warmSearchTab =
                tabs.find((t) => t.url && targetUrl && isSameSearchJourney(t.url, targetUrl)) ||
                tabs[0] ||
                null;

            if (warmSearchTab && warmSearchTab.id) {
                await chrome.tabs.update(warmSearchTab.id, { active: true });
                if (warmSearchTab.windowId) {
                    await chrome.windows.update(warmSearchTab.windowId, { focused: true }).catch(() => {});
                }

                // If already on the matching search route, message content.js directly for 0ms warm execution
                if (targetUrl && warmSearchTab.url && isSameSearchJourney(warmSearchTab.url, targetUrl)) {
                    chrome.tabs.sendMessage(
                        warmSearchTab.id,
                        {
                            action: "WARM_DISPATCH_AUTOCUT",
                            target: storedTarget,
                            fallbackUrl: targetUrl,
                        },
                        (resp) => {
                            if (chrome.runtime.lastError || !resp || !resp.accepted) {
                                chrome.tabs.update(warmSearchTab.id, { url: targetUrl });
                            }
                        }
                    );
                    sendResponse({ ok: true, mode: "warm_in_place", tabId: warmSearchTab.id });
                    return;
                }

                if (targetUrl) {
                    await chrome.tabs.update(warmSearchTab.id, { url: targetUrl });
                    sendResponse({ ok: true, mode: "warm_tab_navigated", tabId: warmSearchTab.id });
                    return;
                }
            }

            if (targetUrl) {
                const created = await chrome.tabs.create({ url: targetUrl, active: true });
                sendResponse({ ok: true, mode: "new_tab", tabId: created.id });
                return;
            }

            sendResponse({ ok: false, error: "No target URL available" });
        })().catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
        return true;
    }

    return false;
});
