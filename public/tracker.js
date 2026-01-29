  (() => {
    const script = document.currentScript;
    if (!script) return;

    const websiteId = script.getAttribute("data-website-id");
    const hostUrl = script.getAttribute("data-host-url") || "";
    if (!websiteId || !hostUrl) return;

    const endpoint = `${hostUrl.replace(/\/$/, "")}/api/collect`;
    const storage = window.localStorage;
    const visitorKey = "gh_analytics_visitor_id";
    const sessionKey = "gh_analytics_session_id";
    const lastSeenKey = "gh_analytics_last_seen";
    const sessionTimeoutMs = 30 * 60 * 1000;
    const getCountryHint = () => {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
        if (tz === "Europe/Istanbul") return "TR";
      } catch {}
      const lang = (navigator.language || "").toLowerCase();
      if (lang.startsWith("tr")) return "TR";
      return "";
    };
    let pingTimeouts = [];
    let pingInterval = null;
    let lastPageviewTs = null;

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
      const stages = [1, 5, 10];
      stages.forEach((seconds) => {
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
        }, 10 * 1000);
      }, 10 * 1000);
      pingTimeouts.push(startInterval);
    };

    const uuid = () =>
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const rand = (Math.random() * 16) | 0;
        const value = char === "x" ? rand : (rand & 0x3) | 0x8;
        return value.toString(16);
      });

    const getVisitorId = () => {
      let id = storage.getItem(visitorKey);
      if (!id) {
        id = uuid();
        storage.setItem(visitorKey, id);
      }
      return id;
    };

    const getSessionId = () => {
      const lastSeen = Number(storage.getItem(lastSeenKey) ?? 0);
      const now = Date.now();
      let id = storage.getItem(sessionKey);
      if (!id || now - lastSeen > sessionTimeoutMs) {
        id = uuid();
        storage.setItem(sessionKey, id);
      }
      storage.setItem(lastSeenKey, String(now));
      return id;
    };

    const sendPayload = (payload) => {
      payload.website_id = websiteId;
      payload.visitor_id = getVisitorId();
      payload.session_id = getSessionId();
      payload.ts = Date.now();
      payload.screen = `${window.screen.width}x${window.screen.height}`;
      payload.language = navigator.language;
      payload.countryCode = getCountryHint();
      payload["user-agent"] = navigator.userAgent;

      navigator.sendBeacon?.(endpoint, JSON.stringify(payload)) ||
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
          credentials: "omit",
        }).catch(() => {});
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

    const trackEvent = (name, data) => {
      if (!name) return;
      sendPayload({
        type: "event",
        event_name: name,
        event_data: data ?? null,
        url: `${location.pathname}${location.search}`,
        referrer: document.referrer || null,
      });
    };

    window.trackEvent = trackEvent;

    let lastUrl = `${location.pathname}${location.search}`;
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

    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const element = target.closest("[class*='tracker--click--']");
      if (!element) return;
      const className = Array.from(element.classList).find((name) =>
        name.startsWith("tracker--click--")
      );
      if (!className) return;
      const eventName = className.replace("tracker--click--", "");
      if (eventName) {
        trackEvent(eventName, {
          text: element.textContent?.trim() ?? null,
        });
      }
    });

    if (document.readyState === "complete") {
      trackPageview();
    } else {
      window.addEventListener("load", trackPageview, { once: true });
    }
  })();
  EOF
