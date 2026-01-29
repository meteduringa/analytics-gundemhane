"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Clipboard, ClipboardCheck, Globe, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

const hostUrl =
  process.env.NEXT_PUBLIC_HOST_URL ?? "https://analytics.gundemhane.com";

const buildExternalSnippet = (websiteId: string) => `<script defer src="${hostUrl}/simple-tracker.js"
  data-site-id="${websiteId}"
  data-host-url="${hostUrl}">
</script>`;

const buildInlineSnippet = (websiteId: string) => `<script data-site-id="${websiteId}" data-host-url="${hostUrl}">
(function () {
  var s = document.currentScript;
  if (!s) return;

  var siteId = s.getAttribute("data-site-id") || s.getAttribute("data-website-id");
  var hostUrl = s.getAttribute("data-host-url") || "";
  if (!siteId || !hostUrl) return;

  var endpoint = hostUrl.replace(/\\/$/, "") + "/api/collect";
  var sessionCookie = "session_id";
  var visitorCookie = "visitor_id";
  var sessionTtlSeconds = 1800;
  var visitorTtlSeconds = 31536000;
  var pingStages = [1, 5, 10];
  var pingIntervalSeconds = 10;

  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (ch) {
      var rand = (Math.random() * 16) | 0;
      var value = ch === "x" ? rand : (rand & 3) | 8;
      return value.toString(16);
    });
  }

  function getCookie(name) {
    var match = document.cookie.split("; ").find(function (row) {
      return row.indexOf(name + "=") === 0;
    });
    if (!match) return null;
    return match.split("=")[1] || null;
  }

  function setCookie(name, value, maxAgeSeconds) {
    document.cookie = name + "=" + value + "; Max-Age=" + maxAgeSeconds + "; Path=/; SameSite=Lax";
  }

  function getVisitorId() {
    var id = getCookie(visitorCookie);
    if (!id) {
      id = uuid();
      setCookie(visitorCookie, id, visitorTtlSeconds);
    }
    return id;
  }

  function getSessionId() {
    var id = getCookie(sessionCookie);
    if (!id) {
      id = "session_" + uuid();
    }
    setCookie(sessionCookie, id, sessionTtlSeconds);
    return id;
  }

  function getCountryHint() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (tz === "Europe/Istanbul") return "TR";
    } catch (e) {}
    var lang = (navigator.language || "").toLowerCase();
    if (lang.indexOf("tr") === 0) return "TR";
    return "";
  }

  function sendPayload(payload) {
    var body = JSON.stringify({
      website_id: siteId,
      visitor_id: getVisitorId(),
      session_id: getSessionId(),
      ts: Date.now(),
      screen: screen.width + "x" + screen.height,
      language: navigator.language || "",
      countryCode: getCountryHint(),
      "user-agent": navigator.userAgent,
      type: payload.type,
      event_name: payload.event_name,
      event_data: payload.event_data,
      url: payload.url,
      referrer: payload.referrer,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, body);
    } else {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
        credentials: "omit",
      }).catch(function () {});
    }
  }

  var pingTimeouts = [];
  var pingInterval = null;
  var lastPageviewTs = null;
  var lastUrl = location.pathname + location.search;

  function clearPingTimers() {
    pingTimeouts.forEach(function (timer) { clearTimeout(timer); });
    pingTimeouts = [];
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }

  function sendPing(elapsedSeconds) {
    sendPayload({
      type: "event",
      event_name: "ping",
      event_data: { pageviewTs: lastPageviewTs, elapsedSeconds: elapsedSeconds },
      url: location.pathname + location.search,
      referrer: document.referrer || null,
    });
  }

  function schedulePings() {
    clearPingTimers();
    pingStages.forEach(function (seconds) {
      var timer = setTimeout(function () { sendPing(seconds); }, seconds * 1000);
      pingTimeouts.push(timer);
    });
    var startInterval = setTimeout(function () {
      pingInterval = setInterval(function () {
        if (!lastPageviewTs) return;
        var elapsedSeconds = Math.floor((Date.now() - lastPageviewTs) / 1000);
        sendPing(elapsedSeconds);
      }, pingIntervalSeconds * 1000);
    }, pingIntervalSeconds * 1000);
    pingTimeouts.push(startInterval);
  }

  function trackPageview() {
    lastPageviewTs = Date.now();
    sendPayload({
      type: "pageview",
      url: location.pathname + location.search,
      referrer: document.referrer || null,
    });
    schedulePings();
  }

  function handleRouteChange() {
    var currentUrl = location.pathname + location.search;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    clearPingTimers();
    trackPageview();
  }

  var originalPushState = history.pushState;
  var originalReplaceState = history.replaceState;

  history.pushState = function () {
    originalPushState.apply(this, arguments);
    handleRouteChange();
  };
  history.replaceState = function () {
    originalReplaceState.apply(this, arguments);
    handleRouteChange();
  };

  addEventListener("popstate", handleRouteChange);
  addEventListener("beforeunload", function () {
    if (!lastPageviewTs) return;
    var elapsedSeconds = Math.floor((Date.now() - lastPageviewTs) / 1000);
    sendPing(Math.max(elapsedSeconds, 1));
    clearPingTimers();
  });

  if (document.readyState === "complete") {
    trackPageview();
  } else {
    addEventListener("load", trackPageview, { once: true });
  }
})();
</script>`;

type StoredUser = {
  id: string;
  email: string;
  name?: string | null;
  role: "ADMIN" | "CUSTOMER";
};

const SettingsPage = () => {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [siteName, setSiteName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [hasCsp, setHasCsp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [snippet, setSnippet] = useState("");
  const [inlineSnippet, setInlineSnippet] = useState("");
  const [sites, setSites] = useState<
    { id: string; name: string; allowedDomains: string[] }[]
  >([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [createdUser, setCreatedUser] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState<"external" | "inline" | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("user");
    if (!raw) {
      router.replace("/login");
      return;
    }
    const parsed = JSON.parse(raw) as StoredUser;
    if (parsed.role !== "ADMIN") {
      router.replace("/panel");
      return;
    }
    setUser(parsed);
  }, [router]);

  useEffect(() => {
    const loadSites = async () => {
      if (!user) return;
      setSitesLoading(true);
      try {
        const params = new URLSearchParams({
          userId: user.id,
          role: user.role,
        });
        const response = await fetch(`/api/panel/sites?${params.toString()}`);
        const payload = await response.json();
        if (response.ok) {
          setSites(payload.sites ?? []);
        }
      } finally {
        setSitesLoading(false);
      }
    };
    loadSites();
  }, [user]);

  const normalizedDomain = useMemo(() => {
    if (!siteUrl) return "";
    try {
      const parsed = new URL(siteUrl);
      return parsed.hostname;
    } catch {
      return "";
    }
  }, [siteUrl]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setCreatedUser(null);
    if (!siteName.trim() || !siteUrl.trim()) {
      setError("Lütfen site adı ve site URL alanlarını doldurun.");
      return;
    }
    if (!normalizedDomain) {
      setError("Site URL geçerli değil.");
      return;
    }
    if (userEmail && !userPassword) {
      setError("Yetkili için şifre zorunludur.");
      return;
    }
    if (!user) {
      setError("Yetkilendirme gerekli.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/panel/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: siteName,
          url: siteUrl,
          actorRole: user.role,
          userEmail: userEmail || undefined,
          userPassword: userPassword || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Site oluşturulamadı.");
      }
      const websiteId = payload.website.id as string;
      const external = buildExternalSnippet(websiteId);
      const inline = buildInlineSnippet(websiteId);
      setSnippet(external);
      setInlineSnippet(inline);
      setSites((prev) => [payload.website, ...prev]);
      if (payload.user?.email) {
        setCreatedUser({ email: payload.user.email, password: userPassword });
      }
      setSiteName("");
      setSiteUrl("");
      setUserEmail("");
      setUserPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Site oluşturulamadı.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (
    value: string,
    mode: "external" | "inline"
  ) => {
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

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-semibold text-slate-500">
                Yetkili Kullanıcı Adı
                <input
                  value={userEmail}
                  onChange={(event) => setUserEmail(event.target.value)}
                  placeholder="ornek@site.com"
                  className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold text-slate-500">
                Yetkili Şifre
                <input
                  value={userPassword}
                  onChange={(event) => setUserPassword(event.target.value)}
                  placeholder="********"
                  type="password"
                  className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
              </label>
            </div>

            {normalizedDomain && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                Domain algılandı:{" "}
                <span className="font-semibold">{normalizedDomain}</span>
              </div>
            )}

            {createdUser && (
              <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs text-sky-700">
                Yetkili oluşturuldu:{" "}
                <span className="font-semibold">{createdUser.email}</span> /{" "}
                <span className="font-semibold">{createdUser.password}</span>
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 px-5 py-3 text-xs font-semibold uppercase tracking-widest text-white shadow-md shadow-purple-500/30 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Kaydediliyor..." : "Snippet Üret"}
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

        <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                Ekli Siteler
              </p>
              <h2 className="text-lg font-semibold text-slate-900">
                Takip Edilen Siteler
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              {sitesLoading ? "Yükleniyor..." : `${sites.length} site`}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {sites.length === 0 && !sitesLoading && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                Henüz site eklenmedi.
              </div>
            )}
            {sites.map((site) => (
              <div
                key={site.id}
                className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {site.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {site.allowedDomains.join(", ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(buildExternalSnippet(site.id), "external")
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600"
                    >
                      <Clipboard className="h-3 w-3" />
                      Script Kopyala
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(buildInlineSnippet(site.id), "inline")
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600"
                    >
                      <Clipboard className="h-3 w-3" />
                      Inline Kopyala
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-[11px] text-slate-500">
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    Website ID: <span className="font-semibold">{site.id}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
