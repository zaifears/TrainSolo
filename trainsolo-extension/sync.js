(async function () {
    const token = localStorage.getItem("token");
    const ssdk = localStorage.getItem("ssdk");
    const uudid = localStorage.getItem("uudid");

    // Only set storage if at least one of the values exists.
    if (token || ssdk || uudid) {
        await chrome.storage.local.set({
            bdTrainToken: token || null,
            bdTrainSSDK: ssdk || null,
            bdTrainUUDID: uudid || null,
        });
    }
})();
