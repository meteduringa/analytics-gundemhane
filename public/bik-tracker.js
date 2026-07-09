(() => {
  const script = document.currentScript;
  if (!script) return;

  const FALLBACK_HOST_URL = "https://giris.elmasistatistik.com.tr";
  const TRACKER_VERSION = "elmas-bik-v2-local";
  const CHECK_INTERVAL_MS = 30 * 1000;
  const ROUTE_DEBOUNCE_MS = 300;
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  const DEDUPE_WINDOW_MS = 1500;
  const PC_META_KEY = "gh_pc_meta_v1";
  const PC_META_TTL_MS = 24 * 60 * 60 * 1000;

  const normalizeHostUrl = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.startsWith("//")) return `https:${raw}`.replace(/\/+$/, "");
    if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
    return `https://${raw.replace(/^\/+/, "")}`.replace(/\/+$/, "");
  };

  const hostUrl =
    normalizeHostUrl(script.getAttribute("data-host-url") || "") ||
    FALLBACK_HOST_URL;
  const siteId =
    script.getAttribute("data-site-id") ||
    script.getAttribute("data-website-id");
  if (!siteId) return;

  const endpoint = `${hostUrl.replace(/\/$/, "")}/api/collect`;
  const storage = window.localStorage;
  const visitorKey = "bik_v2_visitor_id";
  const sessionKey = "bik_v2_session_id";
  const lastSeenKey = "bik_v2_last_seen";

  const uuid = () => {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const rand = (Math.random() * 16) | 0;
      const value = char === "x" ? rand : (rand & 0x3) | 0x8;
      return value.toString(16);
    });
  };

  const safeJsonParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const fromBase64Url = (value) => {
    if (!value) return null;
    try {
      const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "===".slice((normalized.length + 3) % 4);
      return atob(padded);
    } catch {
      return null;
    }
  };

  const hashText = async (value) => {
    if (crypto?.subtle && window.TextEncoder) {
      const encoded = new TextEncoder().encode(value);
      const digest = await crypto.subtle.digest("SHA-256", encoded);
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    }
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
    }
    return `fallback-${Math.abs(hash).toString(16)}`;
  };

  const getResolution = () =>
    `${Math.round(screen.width * (window.devicePixelRatio || 1))}x${Math.round(
      screen.height * (window.devicePixelRatio || 1)
    )}`;

  const getCountryHint = () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (tz === "Europe/Istanbul") return "TR";
    } catch {}
    const lang = (navigator.language || "").toLowerCase();
    if (lang.startsWith("tr")) return "TR";
    return "";
  };

  const getNetworkInfo = () => {
    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;
    if (!connection) return null;
    const info = {
      type: typeof connection.type === "string" ? connection.type : null,
      effectiveType:
        typeof connection.effectiveType === "string"
          ? connection.effectiveType
          : null,
      downlink:
        typeof connection.downlink === "number" ? connection.downlink : null,
      rtt: typeof connection.rtt === "number" ? connection.rtt : null,
      saveData:
        typeof connection.saveData === "boolean" ? connection.saveData : null,
    };
    if (
      !info.type &&
      !info.effectiveType &&
      info.downlink === null &&
      info.rtt === null &&
      info.saveData === null
    ) {
      return null;
    }
    return info;
  };

  const getPageTitle = () => {
    const attrTitle =
      script.getAttribute("data-page-title") ||
      document.documentElement.getAttribute("data-page-title");
    if (attrTitle && attrTitle.trim()) return attrTitle.trim();
    const metaTitle =
      document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
      document.querySelector('meta[name="title"]')?.getAttribute("content");
    return (metaTitle || document.title || "").trim() || null;
  };

  const getPageCategory = () => {
    const attrCategory =
      script.getAttribute("data-page-category") ||
      document.documentElement.getAttribute("data-page-category");
    if (attrCategory && attrCategory.trim()) return attrCategory.trim();
    const metaCategory =
      document
        .querySelector('meta[property="article:section"]')
        ?.getAttribute("content") ||
      document.querySelector('meta[name="article:section"]')?.getAttribute("content") ||
      document.querySelector('meta[name="section"]')?.getAttribute("content") ||
      document.querySelector('meta[name="category"]')?.getAttribute("content");
    if (metaCategory && metaCategory.trim()) return metaCategory.trim();
    const domCategory =
      document.querySelector('[itemprop="articleSection"]')?.textContent ||
      document.querySelector("[data-category]")?.getAttribute("data-category") ||
      "";
    return domCategory.trim() || null;
  };

  const detectBotSignals = () => {
    const signals = {
      webdriver: navigator.webdriver === true,
      headlessUserAgent: /HeadlessChrome|Headless/i.test(navigator.userAgent),
      phantom:
        typeof window.callPhantom !== "undefined" ||
        typeof window._phantom !== "undefined",
      cypress: Boolean(window.Cypress || window.$_Cypress),
      playwright: typeof window._playwright !== "undefined",
      zeroOuterSize: window.outerWidth === 0 && window.outerHeight === 0,
      noPlugins: navigator.plugins ? navigator.plugins.length === 0 : false,
      noLanguages: navigator.languages ? navigator.languages.length === 0 : false,
    };
    return {
      isBot: Object.values(signals).some(Boolean),
      signals,
    };
  };

  const getFingerprint = async () => {
    try {
      const stored = storage.getItem(visitorKey);
      if (stored) return stored;
    } catch {}

    const fingerprintSource = JSON.stringify({
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: getResolution(),
      colorDepth: screen.colorDepth,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      touchPoints: navigator.maxTouchPoints || 0,
      vendor: navigator.vendor,
    });
    const fingerprint = await hashText(fingerprintSource);
    try {
      storage.setItem(visitorKey, fingerprint);
    } catch {}
    return fingerprint;
  };

  const getSessionId = () => {
    const now = Date.now();
    try {
      const lastSeen = Number(storage.getItem(lastSeenKey) || 0);
      let sessionId = storage.getItem(sessionKey);
      if (!sessionId || now - lastSeen > SESSION_TIMEOUT_MS) {
        sessionId = uuid();
        storage.setItem(sessionKey, sessionId);
      }
      storage.setItem(lastSeenKey, String(now));
      return sessionId;
    } catch {
      return uuid();
    }
  };

  const computeAuth = (fingerprint) => {
    const keyCodes = "fpr".split("").map((char) => char.charCodeAt(0));
    const toHexByte = (value) => (`0${Number(value).toString(16)}`).slice(-2);
    const xorWithKey = (seed) =>
      keyCodes.reduce((acc, code) => acc ^ code, seed);
    return fingerprint
      .split("")
      .map((char) => char.charCodeAt(0))
      .map((code) => xorWithKey(code))
      .map(toHexByte)
      .join("");
  };

  const readPcMetaFromHash = () => {
    const hash = location.hash.replace(/^#/, "");
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const token = params.get("pc");
    if (!token) return null;
    const decoded = fromBase64Url(token);
    const parsed = safeJsonParse(decoded);
    if (!parsed || typeof parsed.s !== "string" || !parsed.s) return null;
    params.delete("pc");
    const nextHash = params.toString();
    history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}${nextHash ? `#${nextHash}` : ""}`
    );
    return {
      pc_source: parsed.s,
      pc_cat: typeof parsed.c === "string" && parsed.c ? parsed.c : null,
    };
  };

  const readPcMetaFromQuery = (value = location.href) => {
    let params;
    try {
      params = new URL(value, location.href).searchParams;
    } catch {
      params = new URLSearchParams(location.search);
    }
    const clickaduCode = params.get("c") || params.get("ec");
    if (clickaduCode) return { pc_source: "clickadu", pc_cat: clickaduCode };
    const popcentCode = params.get("p");
    if (popcentCode) return { pc_source: "popcent", pc_cat: popcentCode };
    const pcSource = params.get("pc_source");
    if (!pcSource) return null;
    return {
      pc_source: pcSource,
      pc_cat: params.get("pc_cat") || null,
    };
  };

  const persistPcMeta = (meta) => {
    try {
      storage.setItem(PC_META_KEY, JSON.stringify({ ...meta, ts: Date.now() }));
    } catch {}
  };

  const getStoredPcMeta = () => {
    try {
      const raw = storage.getItem(PC_META_KEY);
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

  const initialNavigationUrl = (() => {
    try {
      return performance.getEntriesByType("navigation")?.[0]?.name || location.href;
    } catch {
      return location.href;
    }
  })();

  const updatePcMetaFromLocation = () => {
    const meta =
      readPcMetaFromHash() ||
      readPcMetaFromQuery() ||
      readPcMetaFromQuery(initialNavigationUrl);
    if (meta) persistPcMeta(meta);
  };

  const getNormalizedUrl = () => {
    const path = location.pathname === "/index.html" ? "/" : location.pathname;
    return `${path}${location.search}`;
  };

  let activeStartedAt = null;
  let activeMs = 0;
  let interactionCount = 0;
  let currentPage = null;
  let routeTimer = null;
  let checkTimer = null;
  let lastSent = null;

  const startActive = () => {
    if (document.hidden) return;
    if (activeStartedAt == null) activeStartedAt = Date.now();
  };

  const stopActive = () => {
    if (activeStartedAt != null) {
      activeMs += Date.now() - activeStartedAt;
      activeStartedAt = null;
    }
  };

  const resetActive = () => {
    activeMs = 0;
    activeStartedAt = document.hidden ? null : Date.now();
    interactionCount = 0;
  };

  const getActiveSeconds = () => {
    let total = activeMs;
    if (activeStartedAt != null) {
      total += Date.now() - activeStartedAt;
    }
    return Math.round(total / 1000);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopActive();
    else startActive();
  });
  window.addEventListener("focus", startActive);
  window.addEventListener("blur", stopActive);
  ["click", "scroll", "keydown", "touchstart", "mousemove"].forEach((name) => {
    window.addEventListener(
      name,
      () => {
        interactionCount += 1;
      },
      { passive: true }
    );
  });
  startActive();

  const postJson = async (payload, options = {}) => {
    updatePcMetaFromLocation();
    const pcMeta = getStoredPcMeta();
    if (pcMeta?.pc_source) payload.pc_source = pcMeta.pc_source;
    if (pcMeta?.pc_cat) payload.pc_cat = pcMeta.pc_cat;
    const body = JSON.stringify(payload);

    if (options.beacon) {
      try {
        if (navigator.sendBeacon?.(endpoint, body)) return null;
      } catch {}
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "omit",
      });
      return await response.json().catch(() => null);
    } catch {
      return null;
    }
  };

  const basePayload = async (type, state) => {
    const visitorId = await getFingerprint();
    const bot = detectBotSignals();
    const sessionId = state?.sessionId || getSessionId();
    const eventId = state?.eventId || uuid();
    const activeSeconds = getActiveSeconds();
    const td = state?.td || 0;
    const payload = {
      type,
      website_id: siteId,
      visitor_id: visitorId,
      session_id: sessionId,
      event_id: eventId,
      hostname: location.hostname,
      title: document.title || "",
      url: state?.url || getNormalizedUrl(),
      referrer: state?.referrer ?? document.referrer ?? "",
      tag: "5",
      fingerprint: visitorId,
      auth: computeAuth(visitorId),
      ts: Date.now(),
      activeSeconds,
      active_seconds: activeSeconds,
      isBot: bot.isBot,
      is_bot: bot.isBot,
      td,
      newScript: "1",
      tracker_version: TRACKER_VERSION,
      screen: getResolution(),
      language: navigator.language || "",
      countryCode: getCountryHint(),
      userAgent: navigator.userAgent,
      webdriver: navigator.webdriver,
      deviceMemory: navigator.deviceMemory,
      cpuCore: navigator.hardwareConcurrency,
      pluginCount: navigator.plugins ? navigator.plugins.length : 0,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      timezone: new Date().getTimezoneOffset(),
      isIframe: window.self !== window.top,
      interactionCount,
      page_title: getPageTitle(),
      page_category: getPageCategory(),
      event_data: {
        eventId,
        sessionId,
        activeSeconds,
        isBot: bot.isBot,
        td,
        botSignals: bot.signals,
        interactionCount,
        network: getNetworkInfo(),
        trackerVersion: TRACKER_VERSION,
      },
    };
    return payload;
  };

  const applyServerIdentity = (response) => {
    if (!response || !currentPage) return;
    if (typeof response.distinctId === "string") {
      currentPage.visitorId = response.distinctId;
    }
    if (typeof response.sessionId === "string") {
      currentPage.sessionId = response.sessionId;
    }
    if (typeof response.eventId === "string") {
      currentPage.eventId = response.eventId;
    }
    if (typeof response.isBot === "boolean") {
      currentPage.isBot = response.isBot;
    }
    if (Number.isFinite(Number(response.td))) {
      currentPage.td = Number(response.td);
    }
  };

  const sendCheck = async (options = {}) => {
    if (!currentPage) return;
    const activeSeconds = getActiveSeconds();
    if (activeSeconds <= 0 && !options.force) return;
    const payload = await basePayload("bik_ping", currentPage);
    payload.event_name = "ping";
    payload.pageviewTs = currentPage.pageviewTs;
    payload.event_data = {
      ...payload.event_data,
      pageviewTs: currentPage.pageviewTs,
      elapsedSeconds: activeSeconds,
      activeSeconds,
      check: true,
    };
    await postJson(payload, { beacon: options.beacon });
  };

  const scheduleChecks = () => {
    if (checkTimer) clearInterval(checkTimer);
    checkTimer = setInterval(() => {
      if (!currentPage) return;
      if (getActiveSeconds() <= 0) return;
      sendCheck();
    }, CHECK_INTERVAL_MS);
  };

  const trackPageview = async (reason) => {
    const url = getNormalizedUrl();
    const referrer =
      reason === "spa" && lastSent?.url ? lastSent.url : document.referrer || "";
    const now = Date.now();
    if (
      lastSent &&
      lastSent.url === url &&
      lastSent.referrer === referrer &&
      now - lastSent.ts <= DEDUPE_WINDOW_MS
    ) {
      return;
    }

    await sendCheck({ force: true });
    resetActive();

    currentPage = {
      eventId: uuid(),
      sessionId: getSessionId(),
      url,
      referrer,
      pageviewTs: now,
      td: 0,
    };
    lastSent = { url, referrer, ts: now };

    const payload = await basePayload("bik_pageview", currentPage);
    payload.is_route_change = reason === "spa";
    payload.event_data = {
      ...payload.event_data,
      pageviewTs: now,
      routeChange: reason === "spa",
    };

    const response = await postJson(payload);
    applyServerIdentity(response);
    scheduleChecks();
  };

  const handleRouteChange = () => {
    const currentUrl = getNormalizedUrl();
    if (lastSent?.url === currentUrl) return;
    if (routeTimer) clearTimeout(routeTimer);
    routeTimer = setTimeout(() => {
      trackPageview("spa");
      routeTimer = null;
    }, ROUTE_DEBOUNCE_MS);
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
  window.addEventListener("pagehide", () => {
    stopActive();
    sendCheck({ force: true, beacon: true });
    if (checkTimer) clearInterval(checkTimer);
  });
  window.addEventListener("beforeunload", () => {
    stopActive();
    sendCheck({ force: true, beacon: true });
  });

  if (document.readyState === "complete") {
    trackPageview("load");
  } else {
    window.addEventListener("load", () => trackPageview("load"), {
      once: true,
    });
  }
})();
