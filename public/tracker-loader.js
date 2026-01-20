  (function () {
    var currentScript = document.currentScript;
    if (!currentScript) {
      var scripts = document.getElementsByTagName("script");
      currentScript = scripts[scripts.length - 1];
    }

    var websiteId = currentScript && currentScript.getAttribute("data-website-id");
    var hostUrl =
      (currentScript && currentScript.getAttribute("data-host-url")) ||
      "https://analytics.gundemhane.com";

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

