"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Clipboard, ClipboardCheck, Globe, Shield } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const hostUrl =
  process.env.NEXT_PUBLIC_HOST_URL ?? "https://analytics.gundemhane.com";

const buildExternalSnippet = (websiteId: string) => `<script async src="${hostUrl}/tracker.js"
  data-website-id="${websiteId}"
  data-host-url="${hostUrl}">
</script>`;

const buildInlineSnippet = (websiteId: string) => `<script data-website-id="${websiteId}" data-host-url="${hostUrl}">
(function () {
  var s = document.currentScript;
  if (!s) return;

  var websiteId = s.getAttribute("data-website-id");
  var hostUrl = s.getAttribute("data-host-url") || "";
  if (!websiteId || !hostUrl) return;

  var endpoint = hostUrl.replace(/\\/$/, "") + "/api/collect";
  var storage = localStorage;
  var visitorKey = "gh_analytics_visitor_id";
  var sessionKey = "gh_analytics_session_id";
  var lastSeenKey = "gh_analytics_last_seen";
  var sessionTimeout = 1800000;

  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 3) | 8).toString(16);
    });
  }

  function getVisitorId() {
    var id = storage.getItem(visitorKey);
    if (!id) {
      id = uuid();
      storage.setItem(visitorKey, id);
    }
    return id;
  }

  function getSessionId() {
    var last = +storage.getItem(lastSeenKey) || 0;
    var now = Date.now();
    var id = storage.getItem(sessionKey);
    if (!id || now - last > sessionTimeout) {
      id = uuid();
      storage.setItem(sessionKey, id);
    }
    storage.setItem(lastSeenKey, String(now));
    return id;
  }

  function send(payload) {
    payload.website_id = websiteId;
    payload.visitor_id = getVisitorId();
    payload.session_id = getSessionId();
    payload.ts = Date.now();
    payload.screen = screen.width + "x" + screen.height;
    payload.language = navigator.language;
    payload["user-agent"] = navigator.userAgent;

    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, JSON.stringify(payload));
    } else {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: "omit",
      }).catch(function () {});
    }
  }

  function trackPageview() {
    send({
      type: "pageview",
      url: location.pathname + location.search,
      referrer: document.referrer || null,
    });
  }

  if (document.readyState === "complete") {
    trackPageview();
  } else {
    addEventListener("load", trackPageview, { once: true });
  }
})();
</script>`;

const createWebsiteId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `site_${Math.random().toString(36).slice(2, 10)}`;
};

const SettingsPage = () => {
  const [siteName, setSiteName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [hasCsp, setHasCsp] = useState(false);
  const [error, setError] = useState("");
  const [snippet, setSnippet] = useState("");
  const [inlineSnippet, setInlineSnippet] = useState("");
  const [copied, setCopied] = useState<"external" | "inline" | null>(null);

  const normalizedDomain = useMemo(() => {
    if (!siteUrl) return "";
    try {
      const parsed = new URL(siteUrl);
      return parsed.hostname;
    } catch {
      return "";
    }
  }, [siteUrl]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!siteName.trim() || !siteUrl.trim()) {
      setError("Lütfen site adı ve site URL alanlarını doldurun.");
      return;
    }
    if (!normalizedDomain) {
      setError("Site URL geçerli değil.");
      return;
    }
    const websiteId = createWebsiteId();
    const external = buildExternalSnippet(websiteId);
    const inline = buildInlineSnippet(websiteId);
    setSnippet(external);
    setInlineSnippet(inline);
  };

  const handleCopy = async (value: string, mode: "external" | "inline") => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(mode);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Ayarlar
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            Site Ekle ve Snippet Üret
          </h1>
          <p className="text-sm text-slate-500">
            Site bilgilerini gir, otomatik takip kodunu kopyala.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="grid gap-4 rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5 lg:grid-cols-[1.2fr_0.8fr]"
        >
          <div className="space-y-4">
            <label className="flex flex-col gap-2 text-xs font-semibold text-slate-500">
              Site Adı
              <input
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
                placeholder="Örn. Gündemhane"
                className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs font-semibold text-slate-500">
              Site URL
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-3 text-sm text-slate-800">
                <Globe className="h-4 w-4 text-slate-400" />
                <input
                  value={siteUrl}
                  onChange={(event) => setSiteUrl(event.target.value)}
                  placeholder="https://example.com"
                  className="w-full bg-transparent outline-none"
                />
              </div>
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
              <Shield className="h-4 w-4 text-slate-400" />
              <span>Sitede CSP var (inline kodu kullan)</span>
              <input
                type="checkbox"
                checked={hasCsp}
                onChange={(event) => setHasCsp(event.target.checked)}
                className="ml-auto h-4 w-4 accent-purple-500"
              />
            </label>

            {normalizedDomain && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                Domain algılandı:{" "}
                <span className="font-semibold">{normalizedDomain}</span>
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 px-5 py-3 text-xs font-semibold uppercase tracking-widest text-white shadow-md shadow-purple-500/30 transition hover:brightness-95"
            >
              Snippet Üret
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4 text-xs text-slate-600">
              <p className="font-semibold text-slate-700">Standart Script</p>
              <p className="mt-1 text-slate-500">
                CSP yoksa bu snippet’i kullan.
              </p>
              <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-3 text-[11px] text-slate-700">
                {snippet || "Snippet burada görünecek."}
              </pre>
              <button
                type="button"
                onClick={() => handleCopy(snippet, "external")}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600"
                disabled={!snippet}
              >
                {copied === "external" ? (
                  <ClipboardCheck className="h-3 w-3" />
                ) : (
                  <Clipboard className="h-3 w-3" />
                )}
                Kopyala
              </button>
            </div>

            <div
              className={`rounded-2xl border p-4 text-xs ${
                hasCsp
                  ? "border-purple-200 bg-purple-50 text-purple-700"
                  : "border-slate-200/70 bg-slate-50 text-slate-600"
              }`}
            >
              <p className="font-semibold">Inline Script (CSP)</p>
              <p className="mt-1 text-slate-500">
                CSP varsa inline kodu buradan kopyala.
              </p>
              <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-3 text-[11px] text-slate-700">
                {inlineSnippet || "Inline snippet burada görünecek."}
              </pre>
              <button
                type="button"
                onClick={() => handleCopy(inlineSnippet, "inline")}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600"
                disabled={!inlineSnippet}
              >
                {copied === "inline" ? (
                  <ClipboardCheck className="h-3 w-3" />
                ) : (
                  <Clipboard className="h-3 w-3" />
                )}
                Kopyala
              </button>
            </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
