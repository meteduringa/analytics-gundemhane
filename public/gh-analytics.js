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
    const pcMetaKey = "gh_pc_meta_v1";
    const pcMetaTtlMs = 24 * 60 * 60 * 1000;

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
          typeof connection.saveData === "boolean"
            ? connection.saveData
            : null,
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

    const getMetaContent = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const value = element.getAttribute("content") ?? "";
      return value.trim() || null;
    };

    const getPageCategory = () => {
      const attrCategory =
        script.getAttribute("data-page-category") ||
        document.documentElement.getAttribute("data-page-category");
      if (attrCategory && attrCategory.trim()) return attrCategory.trim();
      const metaCategory =
        getMetaContent('meta[property="article:section"]') ||
        getMetaContent('meta[name="article:section"]') ||
        getMetaContent('meta[name="section"]') ||
        getMetaContent('meta[name="category"]') ||
        getMetaContent('meta[property="og:section"]');
      if (metaCategory) return metaCategory;
      const domCategory =
        document.querySelector('[itemprop="articleSection"]')?.textContent ||
        document.querySelector("[data-category]")?.getAttribute("data-category") ||
        "";
      return domCategory.trim() || null;
    };

    const getPageTitle = () => {
      const attrTitle =
        script.getAttribute("data-page-title") ||
        document.documentElement.getAttribute("data-page-title");
      if (attrTitle && attrTitle.trim()) return attrTitle.trim();
      const metaTitle =
        getMetaContent('meta[property="og:title"]') ||
        getMetaContent('meta[name="title"]');
      if (metaTitle) return metaTitle;
      const domTitle = (document.title || "").trim();
      return domTitle || null;
    };

    const sendPayload = (payload) => {
      updatePcMetaFromLocation();
      const pcMeta = getStoredPcMeta();
      if (pcMeta?.pc_source) payload.pc_source = pcMeta.pc_source;
      if (pcMeta?.pc_cat) payload.pc_cat = pcMeta.pc_cat;
      payload.page_title = getPageTitle();
      payload.page_category = getPageCategory();
      payload.website_id = websiteId;
      payload.visitor_id = getVisitorId();
      payload.session_id = getSessionId();
      payload.ts = Date.now();
      payload.screen = `${window.screen.width}x${window.screen.height}`;
      payload.language = navigator.language;
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
      sendPayload({
        type: "pageview",
        event_data: {
          network: getNetworkInfo(),
        },
        url: `${location.pathname}${location.search}`,
        referrer: document.referrer || null,
      });
    };

    const trackEvent = (name, data) => {
      if (!name) return;
      sendPayload({
        type: "event",
        event_name: name,
        event_data: {
          ...(data ?? {}),
          network: getNetworkInfo(),
        },
        url: `${location.pathname}${location.search}`,
        referrer: document.referrer || null,
      });
    };

    window.trackEvent = trackEvent;

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
        storage.setItem(
          pcMetaKey,
          JSON.stringify({ ...meta, ts: Date.now() })
        );
      } catch {}
    };

    const getStoredPcMeta = () => {
      try {
        const raw = storage.getItem(pcMetaKey);
        if (!raw) return null;
        const parsed = safeJsonParse(raw);
        if (!parsed || typeof parsed.pc_source !== "string") return null;
        if (parsed.ts && Date.now() - parsed.ts > pcMetaTtlMs) return null;
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
