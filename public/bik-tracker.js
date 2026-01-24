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

  const uuid = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const rand = (Math.random() * 16) | 0;
      const value = char === "x" ? rand : (rand & 0x3) | 0x8;
      return value.toString(16);
    });

  const getVisitorId = () => {
    try {
      let id = storage.getItem(visitorKey);
      if (!id) {
        id = uuid();
        storage.setItem(visitorKey, id);
      }
      return id;
    } catch {
      return "";
    }
  };

  const getSessionInfo = () => {
    try {
      const lastSeen = Number(storage.getItem(lastSeenKey) ?? 0);
      const now = Date.now();
      let index = Number(storage.getItem(sessionIndexKey) ?? 0);
      let isNew = false;
      if (!index || now - lastSeen > sessionTimeoutMs) {
        index += 1;
        isNew = true;
        storage.setItem(sessionIndexKey, String(index));
      }
      storage.setItem(lastSeenKey, String(now));
      const visitorId = getVisitorId();
      return { sessionId: visitorId ? `${visitorId}.${index}` : "", isNew };
    } catch {
      return { sessionId: "", isNew: false };
    }
  };

  const sendRaw = (payload) => {
    payload.website_id = siteId;
    payload.visitor_id = getVisitorId();
    const sessionInfo = getSessionInfo();
    payload.session_id = sessionInfo.sessionId;
    payload.ts = Date.now();
    payload.screen = `${window.screen.width}x${window.screen.height}`;
    payload.language = navigator.language;
    payload.userAgent = navigator.userAgent;
    payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    navigator.sendBeacon?.(endpoint, JSON.stringify(payload)) ||
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: "omit",
      }).catch(() => {});
  };

  const sendPayload = (payload) => {
    sendRaw(payload);
  };

  const trackPageview = () => {
    sendPayload({
      type: "page_view",
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

  const trackHeartbeat = () => {
    sendPayload({
      type: "heartbeat",
      engagement_increment_ms: 5000,
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
    trackPageview();
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
    if (Date.now() - lastInteractionAt > 5000) return;
    trackHeartbeat();
  }, 5000);

  window.addEventListener("pagehide", () => {
    clearInterval(heartbeatInterval);
    trackSessionEnd();
  });

  if (document.readyState === "complete") {
    trackPageview();
  } else {
    window.addEventListener(
      "load",
      () => {
        trackPageview();
      },
      { once: true }
    );
  }
})();
