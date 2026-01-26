(() => {
  const script = document.currentScript;
  if (!script) return;

  const siteId =
    script.getAttribute("data-site-id") ||
    script.getAttribute("data-website-id");
  const hostUrl = script.getAttribute("data-host-url") || "";
  if (!siteId || !hostUrl) return;

  const normalizedHost = hostUrl.replace(/\/$/, "");
  const endpoint = `${normalizedHost}/api/collect`;
  const fingerprintUrl =
    script.getAttribute("data-fingerprint-url") ||
    `${normalizedHost}/fingerprintjs/v3.4.1/fp.min.js`;
  const beaconStats = { success: 0, fail: 0 };
  const DEDUPE_WINDOW_MS = 1500;
  const HISTORY_DEBOUNCE_MS = 200;
  const SAME_URL_COOLDOWN_MS = 10 * 1000;

  const logBeacon = (ok) => {
    if (ok) {
      beaconStats.success += 1;
      console.debug?.("[bik_strict] beacon success", beaconStats.success);
      return;
    }
    beaconStats.fail += 1;
    console.debug?.("[bik_strict] beacon failed", beaconStats.fail);
  };

  const loadFingerprint = () =>
    new Promise((resolve, reject) => {
      if (window.FingerprintJS) {
        resolve(window.FingerprintJS);
        return;
      }
      const tag = document.createElement("script");
      tag.src = fingerprintUrl;
      tag.async = true;
      tag.onload = () => resolve(window.FingerprintJS);
      tag.onerror = () => reject(new Error("fingerprint_load_failed"));
      document.head.appendChild(tag);
    });

  let visitorIdPromise = null;
  const getVisitorId = async () => {
    if (!visitorIdPromise) {
      visitorIdPromise = loadFingerprint()
        .then((fp) => fp.load())
        .then((agent) => agent.get())
        .then((result) => result.visitorId)
        .catch(() => null);
    }
    return visitorIdPromise;
  };

  const sendRaw = (payload) => {
    const body = JSON.stringify(payload);
    const sent = navigator.sendBeacon?.(endpoint, body);
    if (typeof sent === "boolean") {
      logBeacon(sent);
    }
    if (sent) return;
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
    }).catch(() => {});
  };

  const getNormalizedUrl = () => `${location.pathname}${location.search}`;

  let lastSent = null;
  let hasSentInitial = false;
  let historyTimer = null;

  const shouldDropDuplicate = (payload) => {
    if (!lastSent) return false;
    if (payload.visitorId !== lastSent.visitorId) return false;
    if (payload.url !== lastSent.url) return false;
    if (payload.referrer !== lastSent.referrer) return false;
    return payload.ts - lastSent.ts <= DEDUPE_WINDOW_MS;
  };

  const trackPageview = async (reason) => {
    const visitorId = await getVisitorId();
    if (!visitorId) return;
    const url = getNormalizedUrl();
    const referrer = document.referrer || "";
    const now = Date.now();
    const payload = {
      type: "bik_pageview",
      website_id: siteId,
      visitor_id: visitorId,
      ts: now,
      hostname: location.hostname,
      url,
      referrer,
    };

    if (reason === "spa" && !hasSentInitial) {
      return;
    }

    if (reason === "load" && lastSent && lastSent.url === url) {
      if (now - lastSent.ts <= DEDUPE_WINDOW_MS) {
        hasSentInitial = true;
        return;
      }
    }

    if (reason === "spa" && lastSent && lastSent.url === url) {
      if (now - lastSent.ts <= SAME_URL_COOLDOWN_MS) {
        return;
      }
    }

    if (shouldDropDuplicate(payload)) {
      return;
    }

    lastSent = { visitorId, url, referrer, ts: now };
    sendRaw({
      type: "bik_pageview",
      website_id: siteId,
      visitor_id: visitorId,
      ts: now,
      hostname: location.hostname,
      url,
      referrer,
      is_route_change: reason === "spa",
    });
    if (reason === "load") {
      hasSentInitial = true;
    }
  };

  let lastUrl = `${location.pathname}${location.search}`;
  const handleRouteChange = () => {
    const currentUrl = `${location.pathname}${location.search}`;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    if (historyTimer) {
      clearTimeout(historyTimer);
    }
    historyTimer = setTimeout(() => {
      trackPageview("spa");
      historyTimer = null;
    }, HISTORY_DEBOUNCE_MS);
  };

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    handleRouteChange();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    handleRouteChange();
  };

  window.addEventListener("popstate", handleRouteChange);

  if (document.readyState === "complete") {
    trackPageview("load");
  } else {
    window.addEventListener(
      "load",
      () => {
        trackPageview("load");
      },
      { once: true }
    );
  }
})();
