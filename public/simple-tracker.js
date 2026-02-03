(() => {
  const script = document.currentScript;
  if (!script) return;

  const siteId =
    script.getAttribute("data-site-id") ||
    script.getAttribute("data-website-id");
  const hostUrl = script.getAttribute("data-host-url") || "";
  if (!siteId || !hostUrl) return;

  const endpoint = `${hostUrl.replace(/\/$/, "")}/api/collect`;
  const sessionCookie = "session_id";
  const visitorCookie = "visitor_id";
  const sessionTtlSeconds = 30 * 60;
  const visitorTtlSeconds = 365 * 24 * 60 * 60;
  const pingStages = [1, 5, 10];
  const pingIntervalSeconds = 10;
  const requestTimeoutMs = 3000;

  const uuid = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
      const rand = (Math.random() * 16) | 0;
      const value = ch === "x" ? rand : (rand & 0x3) | 0x8;
      return value.toString(16);
    });

  const getCookie = (name) => {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${name}=`));
    if (!match) return null;
    return match.split("=")[1] || null;
  };

  const setCookie = (name, value, maxAgeSeconds) => {
    document.cookie = `${name}=${value}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
  };

  const getVisitorId = () => {
    let id = getCookie(visitorCookie);
    if (!id) {
      id = uuid();
      setCookie(visitorCookie, id, visitorTtlSeconds);
    }
    return id;
  };

  const getSessionId = () => {
    let id = getCookie(sessionCookie);
    if (!id) {
      id = `session_${uuid()}`;
    }
    setCookie(sessionCookie, id, sessionTtlSeconds);
    return id;
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

  const sendPayload = (payload) => {
    if (navigator.onLine === false) return;
    const body = JSON.stringify({
      ...payload,
      website_id: siteId,
      visitor_id: getVisitorId(),
      session_id: getSessionId(),
      ts: Date.now(),
      screen: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language || "",
      countryCode: getCountryHint(),
      "user-agent": navigator.userAgent,
    });

    let sent = false;
    try {
      sent = navigator.sendBeacon?.(endpoint, body) ?? false;
    } catch {}
    if (sent) return;
    if (typeof AbortController === "undefined") {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "omit",
      }).catch(() => {});
      return;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
      signal: controller.signal,
    })
      .catch(() => {})
      .finally(() => clearTimeout(timeoutId));
  };

  let pingTimeouts = [];
  let pingInterval = null;
  let lastPageviewTs = null;
  let lastUrl = `${location.pathname}${location.search}`;

  const clearPingTimers = () => {
    pingTimeouts.forEach((timer) => clearTimeout(timer));
    pingTimeouts = [];
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  };

  const sendPing = (elapsedSeconds) => {
    sendPayload({
      type: "event",
      event_name: "ping",
      event_data: {
        pageviewTs: lastPageviewTs,
        elapsedSeconds,
      },
      url: `${location.pathname}${location.search}`,
      referrer: document.referrer || null,
    });
  };

  const schedulePings = () => {
    clearPingTimers();
    pingStages.forEach((seconds) => {
      const timer = setTimeout(() => {
        sendPing(seconds);
      }, seconds * 1000);
      pingTimeouts.push(timer);
    });
    const startInterval = setTimeout(() => {
      pingInterval = setInterval(() => {
        if (!lastPageviewTs) return;
        const elapsedSeconds = Math.floor(
          (Date.now() - lastPageviewTs) / 1000
        );
        sendPing(elapsedSeconds);
      }, pingIntervalSeconds * 1000);
    }, pingIntervalSeconds * 1000);
    pingTimeouts.push(startInterval);
  };

  const trackPageview = () => {
    lastPageviewTs = Date.now();
    sendPayload({
      type: "pageview",
      url: `${location.pathname}${location.search}`,
      referrer: document.referrer || null,
    });
    schedulePings();
  };

  const handleRouteChange = () => {
    const currentUrl = `${location.pathname}${location.search}`;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    clearPingTimers();
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
  window.addEventListener("beforeunload", () => {
    if (!lastPageviewTs) return;
    const elapsedSeconds = Math.floor(
      (Date.now() - lastPageviewTs) / 1000
    );
    sendPing(Math.max(elapsedSeconds, 1));
    clearPingTimers();
  });

  if (document.readyState === "complete") {
    trackPageview();
  } else {
    window.addEventListener("load", trackPageview, { once: true });
  }
})();
