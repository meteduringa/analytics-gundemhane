(() => {
  const script = document.currentScript;
  if (!script) return;

  const siteId =
    script.getAttribute("data-site-id") ||
    script.getAttribute("data-website-id");
  const hostUrl = script.getAttribute("data-host-url") || "";
  if (!siteId || !hostUrl) return;

  const endpoint = `${hostUrl.replace(/\/$/, "")}/api/bik/collect`;
  const storage = window.localStorage;
  const visitorKey = "bik_visitor_id";
  const sessionIndexKey = "bik_session_index";
  const lastSeenKey = "bik_last_seen";
  const sessionTimeoutMs = 30 * 60 * 1000;
  const MIN_VISIBLE_ENGAGEMENT_MS = 1000;
  const FULL_ENGAGEMENT_MS = 5000;
  const INTERACTION_WINDOW_MS = 10 * 1000;
  let memoryVisitorId = "";
  let memorySessionIndex = 0;
  let memoryLastSeen = 0;

  const uuid = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const rand = (Math.random() * 16) | 0;
      const value = char === "x" ? rand : (rand & 0x3) | 0x8;
      return value.toString(16);
    });

  const readCookie = (name) => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  };

  const writeCookie = (name, value) => {
    const maxAge = 60 * 60 * 24 * 365;
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; samesite=lax${secure}`;
  };

  const getVisitorInfo = () => {
    const cookieId = readCookie(visitorKey);
    if (cookieId) {
      return { id: cookieId, source: "cookie" };
    }

    try {
      const stored = storage.getItem(visitorKey);
      if (stored) {
        writeCookie(visitorKey, stored);
        return { id: stored, source: "localStorage" };
      }
    } catch {
      // ignore storage failures
    }

    const newId = uuid();
    let source = "ephemeral";
    try {
      storage.setItem(visitorKey, newId);
      source = "localStorage";
    } catch {
      memoryVisitorId = newId;
    }
    try {
      writeCookie(visitorKey, newId);
      source = source === "ephemeral" ? "cookie" : source;
    } catch {
      // ignore cookie failures
    }

    return { id: newId, source };
  };

  const getSessionInfo = (visitorId) => {
    const now = Date.now();
    try {
      const lastSeen = Number(storage.getItem(lastSeenKey) ?? 0);
      let index = Number(storage.getItem(sessionIndexKey) ?? 0);
      let isNew = false;
      if (!index || now - lastSeen > sessionTimeoutMs) {
        index += 1;
        isNew = true;
        storage.setItem(sessionIndexKey, String(index));
      }
      storage.setItem(lastSeenKey, String(now));
      return { sessionId: visitorId ? `${visitorId}.${index}` : "", isNew };
    } catch {
      if (!memorySessionIndex || now - memoryLastSeen > sessionTimeoutMs) {
        memorySessionIndex += 1;
      }
      memoryLastSeen = now;
      const id = visitorId || memoryVisitorId;
      return { sessionId: id ? `${id}.${memorySessionIndex}` : "", isNew: true };
    }
  };

  const sendRaw = (payload, allowErrorFallback = true) => {
    payload.website_id = siteId;
    const visitorInfo = getVisitorInfo();
    payload.visitor_id = visitorInfo.id;
    payload.visitor_id_source = visitorInfo.source;
    const sessionInfo = getSessionInfo(visitorInfo.id);
    payload.session_id = sessionInfo.sessionId;
    payload.ts = Date.now();
    payload.screen = `${window.screen.width}x${window.screen.height}`;
    payload.language = navigator.language;
    payload.userAgent = navigator.userAgent;
    payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const body = JSON.stringify(payload);
    const sent = navigator.sendBeacon?.(endpoint, body);
    if (sent) return;
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
    }).catch(() => {
      if (!allowErrorFallback || payload.type === "client_error") return;
      sendRaw(
        {
          type: "client_error",
          error_code: "fetch_failed",
          url: `${location.pathname}${location.search}`,
          referrer: document.referrer || null,
        },
        false
      );
    });
  };

  const sendPayload = (payload) => {
    sendRaw(payload);
  };

  const trackPageview = (isRouteChange) => {
    sendPayload({
      type: "page_view",
      url: `${location.pathname}${location.search}`,
      referrer: document.referrer || null,
      is_route_change: Boolean(isRouteChange),
    });
  };

  const trackRenderPing = () => {
    sendPayload({
      type: "render_ping",
      url: `${location.pathname}${location.search}`,
      referrer: document.referrer || null,
    });
  };

  const trackInteraction = (name) => {
    sendPayload({
      type: "interaction",
      event_name: name || "interaction",
      url: `${location.pathname}${location.search}`,
      referrer: document.referrer || null,
    });
  };

  const trackHeartbeat = (engagementIncrementMs) => {
    sendPayload({
      type: "heartbeat",
      engagement_increment_ms: engagementIncrementMs,
      url: `${location.pathname}${location.search}`,
      referrer: document.referrer || null,
    });
  };

  const trackSessionEnd = () => {
    sendPayload({
      type: "session_end",
      url: `${location.pathname}${location.search}`,
      referrer: document.referrer || null,
    });
  };

  let lastUrl = `${location.pathname}${location.search}`;
  const handleRouteChange = () => {
    const currentUrl = `${location.pathname}${location.search}`;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    trackPageview(true);
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

  const interactionHandler = (eventName) => () => {
    lastInteractionAt = Date.now();
    trackInteraction(eventName);
  };

  window.addEventListener("click", interactionHandler("click"), { passive: true });
  window.addEventListener("scroll", interactionHandler("scroll"), { passive: true });
  window.addEventListener("keydown", interactionHandler("keydown"), { passive: true });
  window.addEventListener("touchstart", interactionHandler("touch"), { passive: true });

  let lastInteractionAt = 0;
  const heartbeatInterval = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    const engagementIncrement =
      now - lastInteractionAt <= INTERACTION_WINDOW_MS
        ? FULL_ENGAGEMENT_MS
        : MIN_VISIBLE_ENGAGEMENT_MS;
    trackHeartbeat(engagementIncrement);
  }, 5000);

  window.addEventListener("pagehide", () => {
    clearInterval(heartbeatInterval);
    trackSessionEnd();
  });

  if (document.readyState === "complete") {
    trackRenderPing();
    trackPageview(false);
  } else {
    window.addEventListener(
      "load",
      () => {
        trackRenderPing();
        trackPageview(false);
      },
      { once: true }
    );
  }
})();
