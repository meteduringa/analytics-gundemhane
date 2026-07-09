"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Clipboard, ClipboardCheck, Globe, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

const fallbackHostUrl = (
  process.env.NEXT_PUBLIC_HOST_URL ?? "https://giris.elmasistatistik.com.tr"
).replace(/\/+$/, "");

const resolveSnippetHostUrl = () => {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return fallbackHostUrl;
};

const buildExternalSnippet = (websiteId: string, hostUrl: string) => `<script async fetchpriority="low" src="${hostUrl}/simple-tracker.js"
  data-site-id="${websiteId}"
  data-host-url="${hostUrl}">
</script>`;

const buildBikTestSnippet = (websiteId: string, hostUrl: string) => `<script async fetchpriority="low" src="${hostUrl}/bik-tracker.js"
  data-site-id="${websiteId}"
  data-host-url="${hostUrl}">
</script>`;

const buildInlineSnippet = (websiteId: string, hostUrl: string) => `<script data-site-id="${websiteId}" data-host-url="${hostUrl}">
(function () {
  var s = document.currentScript;
  if (!s) return;

  var siteId = s.getAttribute("data-site-id") || s.getAttribute("data-website-id");
  var trackerHost = (s.getAttribute("data-host-url") || "").replace(/\\/+$/, "");
  if (!siteId || !trackerHost) return;

  var tracker = document.createElement("script");
  tracker.async = true;
  tracker.setAttribute("fetchpriority", "low");
  tracker.src = trackerHost + "/simple-tracker.js";
  tracker.setAttribute("data-site-id", siteId);
  tracker.setAttribute("data-host-url", trackerHost);
  s.parentNode.insertBefore(tracker, s.nextSibling);
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
  const [bikSnippet, setBikSnippet] = useState("");
  const [sites, setSites] = useState<
    {
      id: string;
      name: string;
      siteUrl?: string | null;
      primaryDomain?: string | null;
      allowedDomains: string[];
    }[]
  >([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [copied, setCopied] = useState<"external" | "inline" | "bik" | null>(null);
  const [hostUrl, setHostUrl] = useState(fallbackHostUrl);

  useEffect(() => {
    setHostUrl(resolveSnippetHostUrl());
  }, []);

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
        const response = await fetch("/api/panel/sites");
        const payload = await response.json();
        if (response.ok) {
          setSites(payload.sites ?? []);
        } else if (response.status === 401) {
          window.localStorage.removeItem("auth");
          window.localStorage.removeItem("user");
          router.replace("/login");
        }
      } finally {
        setSitesLoading(false);
      }
    };
    loadSites();
  }, [router, user]);

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
    if (!siteName.trim() || !siteUrl.trim()) {
      setError("Lütfen site adı ve site URL alanlarını doldurun.");
      return;
    }
    if (!normalizedDomain) {
      setError("Site URL geçerli değil.");
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
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Site oluşturulamadı.");
      }
      const websiteId = payload.website.id as string;
      const external = buildExternalSnippet(websiteId, hostUrl);
      const inline = buildInlineSnippet(websiteId, hostUrl);
      const bik = buildBikTestSnippet(websiteId, hostUrl);
      setSnippet(external);
      setInlineSnippet(inline);
      setBikSnippet(bik);
      setSites((prev) => [payload.website, ...prev]);
      setSiteName("");
      setSiteUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Site oluşturulamadı.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (
    value: string,
    mode: "external" | "inline" | "bik"
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
            Siteyi oluştur. Kullanıcı atamasını ayrı olarak Kullanıcılar ekranından yap.
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

            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Kullanıcı oluşturma ve site atama artık yalnızca{" "}
              <span className="font-semibold">Kullanıcılar</span> ekranından yapılır.
            </div>

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
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 px-5 py-3 text-xs font-semibold uppercase tracking-widest text-white shadow-md shadow-purple-500/30 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Kaydediliyor..." : "Site Oluştur"}
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
              <p className="font-semibold">Inline Loader</p>
              <p className="mt-1 text-slate-500">
                Mevcut eski takip dosyasını inline loader ile yükler.
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

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
              <p className="font-semibold">BİK Test Script</p>
              <p className="mt-1 text-emerald-700">
                Yeni BİK uyumlu takip kodu. Eski veriyi bozmaz, ayrı havuza yazar.
              </p>
              <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-3 text-[11px] text-emerald-900">
                {bikSnippet || "BİK test snippet burada görünecek."}
              </pre>
              <button
                type="button"
                onClick={() => handleCopy(bikSnippet, "bik")}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-semibold text-emerald-700"
                disabled={!bikSnippet}
              >
                {copied === "bik" ? (
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
                      {site.siteUrl ?? site.allowedDomains.join(", ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(buildExternalSnippet(site.id, hostUrl), "external")
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600"
                    >
                      <Clipboard className="h-3 w-3" />
                      Script Kopyala
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(buildInlineSnippet(site.id, hostUrl), "inline")
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600"
                    >
                      <Clipboard className="h-3 w-3" />
                      Inline Kopyala
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(buildBikTestSnippet(site.id, hostUrl), "bik")
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 font-semibold text-emerald-700"
                    >
                      <Clipboard className="h-3 w-3" />
                      BİK Test Kopyala
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-[11px] text-slate-500">
                  {site.primaryDomain && (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      Ana domain:{" "}
                      <span className="font-semibold">{site.primaryDomain}</span>
                    </div>
                  )}
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
