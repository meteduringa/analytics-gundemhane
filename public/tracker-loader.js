  (function () {
    var fallbackHostUrl = "https://giris.elmasistatistik.com.tr";
    var legacyHostname = "analytics.gundemhane.com";
    var normalizeHostUrl = function (value) {
      var raw = String(value || "").trim();
      if (!raw) return "";
      if (raw.indexOf("//") === 0) return ("https:" + raw).replace(/\/+$/, "");
      if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
      return ("https://" + raw.replace(/^\/+/, "")).replace(/\/+$/, "");
    };
    var resolveHostUrl = function (value) {
      var normalized = normalizeHostUrl(value);
      if (!normalized) return fallbackHostUrl;
      try {
        var parsed = new URL(normalized);
        if (parsed.hostname === legacyHostname) return fallbackHostUrl;
      } catch {
        return fallbackHostUrl;
      }
      return normalized;
    };

    var currentScript = document.currentScript;
    if (!currentScript) {
      var scripts = document.getElementsByTagName("script");
      currentScript = scripts[scripts.length - 1];
    }

    var websiteId = currentScript && currentScript.getAttribute("data-website-id");
    var hostUrl = resolveHostUrl(
      currentScript && currentScript.getAttribute("data-host-url")
    );

    if (!websiteId) {
      return;
    }

    var normalizedHost = hostUrl.replace(/\/+$/, "");
    var s = document.createElement("script");
    s.async = true;
    s.src = normalizedHost + "/tracker.js";
    s.setAttribute("data-website-id", websiteId);
    s.setAttribute("data-host-url", hostUrl);
    document.head.appendChild(s);
  })();
