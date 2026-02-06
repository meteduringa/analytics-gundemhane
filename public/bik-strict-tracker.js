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
  const FALLBACK_VISITOR_KEY = "bik_strict_visitor_id";
  const PC_META_KEY = "gh_pc_meta_v1";
  const PC_META_TTL_MS = 24 * 60 * 60 * 1000;

  const uuid = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const rand = (Math.random() * 16) | 0;
      const value = char === "x" ? rand : (rand & 0x3) | 0x8;
      return value.toString(16);
    });

  const getFallbackVisitorId = () => {
    try {
      const stored = window.localStorage.getItem(FALLBACK_VISITOR_KEY);
      if (stored) return stored;
      const next = uuid();
      window.localStorage.setItem(FALLBACK_VISITOR_KEY, next);
      return next;
    } catch {
      return uuid();
    }
  };

  const computeAuth = (fingerprint) => {
    const keyCodes = "fpr".split("").map((ch) => ch.charCodeAt(0));
    const toHexByte = (n) => (`0${Number(n).toString(16)}`).slice(-2);
    const xorWithKey = (seed) =>
      keyCodes.reduce((acc, code) => acc ^ code, seed);
    return fingerprint
      .split("")
      .map((ch) => ch.charCodeAt(0))
      .map((code) => xorWithKey(code))
      .map(toHexByte)
      .join("");
  };

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
        .catch(() => getFallbackVisitorId());
    }
    return visitorIdPromise;
  };

  const sendRaw = (payload) => {
    updatePcMetaFromLocation();
    const pcMeta = getStoredPcMeta();
    if (pcMeta?.pc_source) payload.pc_source = pcMeta.pc_source;
    if (pcMeta?.pc_cat) payload.pc_cat = pcMeta.pc_cat;
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
  const getResolution = () => {
    const width = Math.round(window.screen.width * (window.devicePixelRatio || 1));
    const height = Math.round(window.screen.height * (window.devicePixelRatio || 1));
    return `${width}x${height}`;
  };
  const getCountryHint = () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (tz === "Europe/Istanbul") return "TR";
    } catch {}
    const lang = (navigator.language || "").toLowerCase();
    if (lang.startsWith("tr")) return "TR";
    return "";
  };

  let lastSent = null;
  let hasSentInitial = false;
  let historyTimer = null;
  let pingTimeouts = [];
  let pingInterval = null;

  const clearPingTimers = () => {
    pingTimeouts.forEach((timer) => clearTimeout(timer));
    pingTimeouts = [];
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  };

  const sendPing = (context, elapsedSeconds) => {
    sendRaw({
      type: "bik_ping",
      website_id: siteId,
      visitor_id: context.visitorId,
      ts: Date.now(),
      hostname: location.hostname,
      url: context.url,
      referrer: "",
      auth: context.auth,
      screen: context.screen,
      language: context.language,
      countryCode: context.countryCode,
      event_name: "ping",
      event_data: {
        pageviewTs: context.pageviewTs,
        elapsedSeconds,
      },
    });
  };

  const schedulePings = (context) => {
    clearPingTimers();
    const stages = [1, 5, 10];
    stages.forEach((seconds) => {
      const timer = setTimeout(() => {
        sendPing(context, seconds);
      }, seconds * 1000);
      pingTimeouts.push(timer);
    });
    const startInterval = setTimeout(() => {
      pingInterval = setInterval(() => {
        const elapsedSeconds = Math.floor(
          (Date.now() - context.pageviewTs) / 1000
        );
        sendPing(context, elapsedSeconds);
      }, 10 * 1000);
    }, 10 * 1000);
    pingTimeouts.push(startInterval);
  };

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
    const referrer = reason === "spa" ? (lastSent?.url ?? "") : document.referrer || "";
    const now = Date.now();
    const auth = computeAuth(visitorId);
    const payload = {
      type: "bik_pageview",
      website_id: siteId,
      visitor_id: visitorId,
      ts: now,
      hostname: location.hostname,
      url,
      referrer,
      auth,
      screen: getResolution(),
      language: navigator.language || "",
      countryCode: getCountryHint(),
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
      auth,
      screen: payload.screen,
      language: payload.language,
      countryCode: payload.countryCode,
      is_route_change: reason === "spa",
    });
    schedulePings({
      visitorId,
      url,
      auth,
      pageviewTs: now,
      screen: payload.screen,
      language: payload.language,
      countryCode: payload.countryCode,
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
    clearPingTimers();
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
  window.addEventListener("beforeunload", () => {
    if (!lastSent) return;
    const elapsedSeconds = Math.floor((Date.now() - lastSent.ts) / 1000);
    sendPing(
      {
        visitorId: lastSent.visitorId,
        url: lastSent.url,
        auth: computeAuth(lastSent.visitorId),
        pageviewTs: lastSent.ts,
        screen: getResolution(),
        language: navigator.language || "",
        countryCode: getCountryHint(),
      },
      Math.max(elapsedSeconds, 1)
    );
    clearPingTimers();
  });

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
  const safeJsonParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const decodeBase64Url = (value) => {
    if (!value) return null;
    try {
      const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
      const padded =
        normalized + "===".slice((normalized.length + 3) % 4);
      return atob(padded);
    } catch {
      return null;
    }
  };

  const decodePcToken = (token) => {
    const decoded = decodeBase64Url(token);
    if (!decoded) return null;
    const parsed = safeJsonParse(decoded);
    if (!parsed || typeof parsed.s !== "string" || !parsed.s) return null;
    return {
      pc_source: parsed.s,
      pc_cat: typeof parsed.c === "string" && parsed.c ? parsed.c : null,
    };
  };

  const readPcMetaFromHash = () => {
    const hash = location.hash.replace(/^#/, "");
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const token = params.get("pc");
    if (!token) return null;
    const meta = decodePcToken(token);
    if (!meta) return null;
    params.delete("pc");
    const nextHash = params.toString();
    history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}${nextHash ? `#${nextHash}` : ""}`
    );
    return meta;
  };

  const readPcMetaFromQuery = () => {
    const params = new URLSearchParams(location.search);
    const pcSource = params.get("pc_source");
    if (!pcSource) return null;
    return {
      pc_source: pcSource,
      pc_cat: params.get("pc_cat") || null,
    };
  };

  const persistPcMeta = (meta) => {
    try {
      window.localStorage.setItem(
        PC_META_KEY,
        JSON.stringify({ ...meta, ts: Date.now() })
      );
    } catch {}
  };

  const getStoredPcMeta = () => {
    try {
      const raw = window.localStorage.getItem(PC_META_KEY);
      if (!raw) return null;
      const parsed = safeJsonParse(raw);
      if (!parsed || typeof parsed.pc_source !== "string") return null;
      if (parsed.ts && Date.now() - parsed.ts > PC_META_TTL_MS) return null;
      return {
        pc_source: parsed.pc_source,
        pc_cat:
          typeof parsed.pc_cat === "string" && parsed.pc_cat
            ? parsed.pc_cat
            : null,
      };
    } catch {
      return null;
    }
  };

  const updatePcMetaFromLocation = () => {
    const meta = readPcMetaFromHash() || readPcMetaFromQuery();
    if (meta) persistPcMeta(meta);
  };
