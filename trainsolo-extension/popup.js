document.addEventListener("DOMContentLoaded", async () => {
    const sessionBadge = document.getElementById("sessionBadge");
    const userNameEl = document.getElementById("userName");
    const tokenStatus = document.getElementById("tokenStatus");
    const ssdkStatus = document.getElementById("ssdkStatus");
    const uudidStatus = document.getElementById("uudidStatus");
    const userInfoBox = document.getElementById("userInfoBox");
    const noRailwayPrompt = document.getElementById("noRailwayPrompt");
    const openRailwayBtn = document.getElementById("openRailwayBtn");
    const autoCutBtn = document.getElementById("autoCutBtn");
    const autoCutStatus = document.getElementById("autoCutStatus");
    const syncBtn = document.getElementById("syncBtn");
    const statusMsg = document.getElementById("statusMsg");
    const trackerDetectMsg = document.getElementById("trackerDetectMsg");
    const settingsToggle = document.getElementById("settingsToggle");
    const settingsBox = document.getElementById("settingsBox");
    const settingsArrow = document.getElementById("settingsArrow");
    const customTrackerUrlInput = document.getElementById("customTrackerUrl");
    const saveUrlBtn = document.getElementById("saveUrlBtn");

    let railwayTab = null;
    let trackerTab = null;
    let targetTrackerUrl = "http://localhost:5000";
    let extractedKeys = { token: null, ssdk: null, uudid: null, userName: null };

    // Load saved custom tracker URL
    const storageData = await chrome.storage.local.get(["customTrackerUrl"]);
    if (storageData.customTrackerUrl) {
        targetTrackerUrl = storageData.customTrackerUrl;
        customTrackerUrlInput.value = targetTrackerUrl;
    } else {
        customTrackerUrlInput.value = targetTrackerUrl;
    }

    // Settings Toggle
    settingsToggle.addEventListener("click", () => {
        const isHidden = settingsBox.classList.contains("hidden");
        settingsBox.classList.toggle("hidden", !isHidden);
        settingsArrow.textContent = isHidden ? "▲" : "▼";
        settingsToggle.setAttribute("aria-expanded", isHidden ? "true" : "false");
    });

    saveUrlBtn.addEventListener("click", async () => {
        const urlVal = customTrackerUrlInput.value.trim();
        if (urlVal) {
            targetTrackerUrl = urlVal;
            await chrome.storage.local.set({ customTrackerUrl: urlVal });
            saveUrlBtn.textContent = "Saved!";
            setTimeout(() => { saveUrlBtn.textContent = "Save"; }, 1500);
            findTrackerTab();
        }
    });

    // 1. Check for open railway tab
    try {
        const railwayTabs = await chrome.tabs.query({ url: "*://eticket.railway.gov.bd/*" });
        if (railwayTabs.length > 0) {
            railwayTab = railwayTabs[0];

            // Inspect keys on railway page
            const [evalResult] = await chrome.scripting.executeScript({
                target: { tabId: railwayTab.id },
                func: () => {
                    const token = localStorage.getItem("token");
                    const ssdk = localStorage.getItem("ssdk");
                    const uudid = localStorage.getItem("uudid");
                    
                    // Detect user profile name
                    let userName = "Logged In User";
                    const profileEl = document.querySelector(".user-name, .profile-name, .user-profile-name");
                    if (profileEl && profileEl.textContent) {
                        userName = profileEl.textContent.trim();
                    } else {
                        const navText = document.querySelector(".header-user, nav, .navbar")?.textContent || "";
                        const match = navText.match(/(Md\.|Mst\.|Mr\.|Mrs\.)\s*[A-Za-z\s]+/);
                        if (match) userName = match[0].replace(/\s*(English|বাংলা|Bangla)\s*$/i, "").trim();
                    }

                    return {
                        hasToken: Boolean(token && token.length > 10),
                        hasSsdk: Boolean(ssdk),
                        hasUudid: Boolean(uudid),
                        token,
                        ssdk,
                        uudid,
                        userName: token ? userName : null
                    };
                }
            });

            if (evalResult && evalResult.result) {
                const res = evalResult.result;
                extractedKeys = res;

                if (res.hasToken && res.hasSsdk && res.hasUudid) {
                    sessionBadge.textContent = "Connected";
                    sessionBadge.className = "badge badge-connected";
                    userNameEl.textContent = res.userName || "Authenticated";

                    tokenStatus.className = "dot dot-green";
                    ssdkStatus.className = "dot dot-green";
                    uudidStatus.className = "dot dot-green";

                    autoCutBtn.disabled = false;

                    await chrome.storage.local.set({
                        bdTrainToken: res.token,
                        bdTrainSSDK: res.ssdk,
                        bdTrainUUDID: res.uudid
                    });
                } else if (res.hasToken) {
                    sessionBadge.textContent = "Partial Session";
                    sessionBadge.className = "badge badge-disconnected";
                    userNameEl.textContent = "Refresh Railway tab to sync device keys";

                    tokenStatus.className = "dot dot-green";
                    ssdkStatus.className = res.hasSsdk ? "dot dot-green" : "dot dot-red";
                    uudidStatus.className = res.hasUudid ? "dot dot-green" : "dot dot-red";

                    autoCutBtn.disabled = true;
                } else {
                    sessionBadge.textContent = "Not Logged In";
                    sessionBadge.className = "badge badge-disconnected";
                    userNameEl.textContent = "Please log in on railway site";
                    tokenStatus.className = "dot dot-red";
                    ssdkStatus.className = "dot dot-red";
                    uudidStatus.className = "dot dot-red";
                }
            }
        } else {
            sessionBadge.textContent = "Tab Not Found";
            sessionBadge.className = "badge badge-disconnected";
            userInfoBox.classList.add("hidden");
            noRailwayPrompt.classList.remove("hidden");
        }
    } catch (err) {
        sessionBadge.textContent = "Error";
        sessionBadge.className = "badge badge-disconnected";
    }

    // 2. Open Railway button
    openRailwayBtn.addEventListener("click", async () => {
        await chrome.tabs.create({ url: "https://eticket.railway.gov.bd/" });
    });

    // 3. Auto-Cut Button Handler
    autoCutBtn.addEventListener("click", async () => {
        if (!railwayTab) return;
        autoCutBtn.disabled = true;
        autoCutStatus.textContent = "Running auto-cut on railway tab...";
        autoCutStatus.style.color = "#2563eb";

        try {
            chrome.tabs.sendMessage(railwayTab.id, { action: "AUTO_CUT_SEAT" }, (response) => {
                if (chrome.runtime.lastError) {
                    autoCutStatus.textContent = "Please make sure you are on a train search results page.";
                    autoCutStatus.style.color = "#dc2626";
                    autoCutBtn.disabled = false;
                } else if (response && response.success) {
                    autoCutStatus.textContent = "🎉 OTP Screen Reached! Check tab.";
                    autoCutStatus.style.color = "#16a34a";
                } else {
                    autoCutStatus.textContent = "Check railway tab for details.";
                    autoCutBtn.disabled = false;
                }
            });
        } catch (e) {
            autoCutStatus.textContent = "Error: " + e.message;
            autoCutBtn.disabled = false;
        }
    });

    // 4. Find Tracker Tab (localhost:5000 unified, custom, or localhost:5173)
    async function findTrackerTab() {
        try {
            const potentialTrackerTabs = await chrome.tabs.query({});
            trackerTab = potentialTrackerTabs.find(t => {
                if (!t.url) return false;
                const url = t.url.toLowerCase();
                const targetHost = targetTrackerUrl.toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
                return (
                    (targetHost && url.includes(targetHost)) ||
                    url.includes("localhost:5000") ||
                    url.includes("127.0.0.1:5000") ||
                    url.includes("localhost:5173") ||
                    url.includes("127.0.0.1:5173") ||
                    url.includes("vercel.app")
                );
            });

            if (trackerTab) {
                const urlObj = new URL(trackerTab.url);
                trackerDetectMsg.textContent = `TrainSolo Active: ${urlObj.hostname}:${urlObj.port || ''}`;
                if (extractedKeys.hasToken) {
                    syncBtn.disabled = false;
                    syncBtn.textContent = "🔄 Sync & Open TrainSolo";
                }
            } else {
                trackerDetectMsg.textContent = `Target: ${targetTrackerUrl}`;
                if (extractedKeys.hasToken) {
                    syncBtn.disabled = false;
                    syncBtn.textContent = "🔄 Sync & Open TrainSolo";
                }
            }
        } catch (e) {}
    }

    await findTrackerTab();

    // 5. Sync Button Handler (Resilient Direct URL Navigation + Script Injection)
    syncBtn.addEventListener("click", async () => {
        statusMsg.textContent = "Syncing credentials to TrainSolo...";
        statusMsg.style.color = "#2563eb";

        if (!extractedKeys.token) {
            statusMsg.textContent = "❌ No active session found. Please log in on railway site.";
            statusMsg.style.color = "#dc2626";
            return;
        }

        // Construct clean token transfer URL
        let syncUrl;
        try {
            syncUrl = new URL(targetTrackerUrl);
        } catch (_) {
            syncUrl = new URL("http://localhost:5000");
        }
        syncUrl.pathname = "/";
        syncUrl.searchParams.set("token", extractedKeys.token);
        if (extractedKeys.ssdk) syncUrl.searchParams.set("ssdk", extractedKeys.ssdk);
        if (extractedKeys.uudid) syncUrl.searchParams.set("uudid", extractedKeys.uudid);
        if (extractedKeys.userName) syncUrl.searchParams.set("userName", extractedKeys.userName);

        try {
            // Fresh tab query
            const potentialTrackerTabs = await chrome.tabs.query({});
            trackerTab = potentialTrackerTabs.find(t => {
                if (!t.url) return false;
                const url = t.url.toLowerCase();
                return (
                    url.includes("localhost:5000") ||
                    url.includes("127.0.0.1:5000") ||
                    url.includes("localhost:5173") ||
                    url.includes("127.0.0.1:5173") ||
                    url.includes("vercel.app")
                );
            });

            if (trackerTab) {
                // Navigate the tab directly to the sync URL (cures any error page / ERR_CONNECTION_REFUSED)
                await chrome.tabs.update(trackerTab.id, { url: syncUrl.toString(), active: true });
                if (trackerTab.windowId) {
                    await chrome.windows.update(trackerTab.windowId, { focused: true });
                }
            } else {
                trackerTab = await chrome.tabs.create({ url: syncUrl.toString(), active: true });
            }

            // Also attempt direct localStorage write as a progressive enhancement
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: trackerTab.id },
                    func: (keys) => {
                        if (keys.token) {
                            try {
                                localStorage.setItem("token", keys.token);
                                if (keys.ssdk) localStorage.setItem("ssdk", keys.ssdk);
                                if (keys.uudid) localStorage.setItem("uudid", keys.uudid);
                                if (keys.userName) localStorage.setItem("userName", keys.userName);
                            } catch (_) {}
                        }
                    },
                    args: [extractedKeys]
                });
            } catch (_) {
                // If tab was previously showing an error page, chrome.tabs.update is already reloading it cleanly
            }

            statusMsg.textContent = "✅ Synced successfully! TrainSolo is ready.";
            statusMsg.style.color = "#16a34a";
        } catch (syncErr) {
            statusMsg.textContent = "❌ Sync failed: " + syncErr.message;
            statusMsg.style.color = "#dc2626";
        }
    });
});
