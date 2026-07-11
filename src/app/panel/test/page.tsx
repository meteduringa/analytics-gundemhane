"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { usePanelSession } from "@/hooks/usePanelSession";
import {
  Activity,
  Clipboard,
  ClipboardCheck,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type TestSite = {
  id: string;
  name: string;
  legacyWebsiteId: string;
  websiteId: string;
  publishCode: string;
  domain: string;
  domainSlug: string;
  collectorNode: string;
  allowedDomains: string[];
  scriptVersion: number;
};

type Metrics = {
  accepted: number;
  rejected: number;
  pageviews: number;
  rawPageviews: number;
  uniqueVisitors: number;
  directUniqueVisitors: number;
  sessions: number;
  heartbeats: number;
  customEvents: number;
  botEvents: number;
  avgActiveSeconds: number;
};

type RecentEvent = {
  id: string;
  ts: string;
  version: string;
  endpoint: string;
  accepted: boolean;
  rejectReason?: string;
  isBot: boolean;
  isPageview: boolean;
  isHeartbeat: boolean;
  hostname?: string | null;
  url?: string | null;
  name?: string | null;
  activeSeconds?: number | null;
};

type MetricsPayload = {
  site: TestSite;
  day: string;
  asOf: string;
  metrics: Metrics;
  recent: RecentEvent[];
};

const todayInput = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const fallbackHost = (
  process.env.NEXT_PUBLIC_HOST_URL || "https://giris.elmasistatistik.com.tr"
).replace(/\/+$/, "");

const numberFormat = new Intl.NumberFormat("tr-TR");

const metricLabels: Array<[keyof Metrics, string]> = [
  ["pageviews", "Sayfa goruntuleme"],
  ["uniqueVisitors", "Tekil ziyaretci"],
  ["directUniqueVisitors", "Direct tekil"],
  ["sessions", "Oturum"],
  ["heartbeats", "Ping"],
  ["customEvents", "Event"],
  ["botEvents", "Bot sinyali"],
  ["rejected", "Reddedilen"],
  ["avgActiveSeconds", "Ort. aktif sn"],
];

const resolveHost = () => {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return fallbackHost;
};

const buildV1Snippet = (site: TestSite, host: string) =>
  `<script>!function(){var t=document.createElement("script");t.setAttribute("src",'${host}/test-cdn/tracker'+(typeof Intl!=="undefined"?(typeof (Intl||"").PluralRules!=="undefined"?'1':typeof Promise!=="undefined"?'2':typeof MutationObserver!=='undefined'?'3':'4'):'4')+'.js'),t.setAttribute("data-website-id","${site.legacyWebsiteId}"),t.setAttribute("data-host-url",'${host}'),document.head.appendChild(t)}();</script>`;

const buildV2Snippet = (site: TestSite, host: string) => {
  const protocolLess = host.replace(/^https?:/, "");
  return `<script>var script = document.createElement("script");script.src="${protocolLess}/test-cdn-v2/t-"+(typeof self !== "undefined" && self.crypto && typeof self.crypto.randomUUID === "function" ? "1-" : typeof Promise !== "undefined" ? "2-" : "3-")+"${site.domainSlug}-"+"${site.scriptVersion}"+".js";document.head.appendChild(script);</script>`;
};

const copyText = async (value: string) => {
  await navigator.clipboard.writeText(value);
};

const runScript = (src: string, attrs: Record<string, string> = {}) => {
  const script = document.createElement("script");
  script.src = `${src}${src.includes("?") ? "&" : "?"}run=${Date.now()}`;
  Object.entries(attrs).forEach(([key, value]) => script.setAttribute(key, value));
  document.head.appendChild(script);
};

export default function PanelTestPage() {
  const { user, ready } = usePanelSession();
  const [sites, setSites] = useState<TestSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [date, setDate] = useState(todayInput);
  const [host, setHost] = useState(fallbackHost);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState<"v1" | "v2" | null>(null);
  const [newSite, setNewSite] = useState({ name: "", domain: "" });

  useEffect(() => {
    setHost(resolveHost());
  }, []);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) || sites[0] || null,
    [selectedSiteId, sites]
  );

  const snippets = useMemo(() => {
    if (!selectedSite) return { v1: "", v2: "" };
    return {
      v1: buildV1Snippet(selectedSite, host),
      v2: buildV2Snippet(selectedSite, host),
    };
  }, [host, selectedSite]);

  const loadSites = useCallback(async (preferredSiteId?: string) => {
    const response = await fetch("/api/panel/test/sites", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Siteler alinamadi.");
    const nextSites = payload.sites as TestSite[];
    setSites(nextSites);
    setSelectedSiteId((current) => {
      const target = preferredSiteId || current;
      if (target && nextSites.some((site) => site.id === target)) return target;
      return nextSites[0]?.id || "";
    });
    return nextSites;
  }, []);

  const loadMetrics = useCallback(async () => {
    const siteId = selectedSiteId || sites[0]?.id || "";
    if (!siteId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ siteId, date });
      const response = await fetch(`/api/panel/test/metrics?${params}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Metrikler alinamadi.");
      setMetrics(payload as MetricsPayload);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [date, selectedSiteId, sites]);

  useEffect(() => {
    if (!ready || user?.role !== "ADMIN") return;
    loadSites().catch((error) => setMessage((error as Error).message));
  }, [loadSites, ready, user?.role]);

  useEffect(() => {
    if (!ready || user?.role !== "ADMIN" || !selectedSiteId) return;
    loadMetrics();
  }, [loadMetrics, ready, selectedSiteId, user?.role]);

  const runV1 = () => {
    if (!selectedSite) return;
    runScript(`${host}/test-cdn/tracker1.js`, {
      "data-website-id": selectedSite.legacyWebsiteId,
      "data-host-url": host,
    });
    setMessage("v1 tracker yuklendi.");
    window.setTimeout(loadMetrics, 900);
  };

  const runV2 = () => {
    if (!selectedSite) return;
    const variant =
      typeof self !== "undefined" &&
      self.crypto &&
      typeof self.crypto.randomUUID === "function"
        ? "1"
        : typeof Promise !== "undefined"
          ? "2"
          : "3";
    runScript(
      `${host}/test-cdn-v2/t-${variant}-${selectedSite.domainSlug}-${selectedSite.scriptVersion}.js`
    );
    setMessage("v2 siteye ozel tracker yuklendi.");
    window.setTimeout(loadMetrics, 900);
  };

  const addTestEvent = () => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-bik-event", "panel-test-click");
    button.setAttribute("data-bik-event-source", "panel-test");
    button.style.display = "none";
    document.body.appendChild(button);
    button.click();
    button.remove();
    setMessage("data-bik-event tiklamasi tetiklendi.");
    window.setTimeout(loadMetrics, 900);
  };

  const createTestSite = async () => {
    const response = await fetch("/api/panel/test/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSite),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || "Site olusturulamadi.");
      return;
    }
    setNewSite({ name: "", domain: "" });
    await loadSites(payload.site.id);
    setSelectedSiteId(payload.site.id);
    setMessage("Test sitesi hazir.");
  };

  const deleteSelectedSite = async () => {
    if (!selectedSite || deleting) return;
    const confirmed = window.confirm(
      `${selectedSite.name} test sitesini silmek istiyor musun?`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const response = await fetch("/api/panel/test/sites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: selectedSite.id }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error || "Test sitesi silinemedi.");
        return;
      }

      const nextSites = await loadSites();
      setMetrics(null);
      setMessage(
        nextSites.length
          ? "Test sitesi silindi. Yeni secili site yuklendi."
          : "Test sitesi silindi. Yeni site olusturabilirsin."
      );
    } catch (error) {
      setMessage((error as Error).message || "Test sitesi silinemedi.");
    } finally {
      setDeleting(false);
    }
  };

  const resetData = async () => {
    const response = await fetch("/api/panel/test/reset", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || "Test verisi sifirlanamadi.");
      return;
    }
    setMessage("Test verisi sifirlandi.");
    await loadMetrics();
  };

  if (ready && user?.role !== "ADMIN") {
    return (
      <DashboardLayout>
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700">
          Bu ekran sadece admin kullanicilar icindir.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
              Yeni Olcum Motoru
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">
              /test script uretici ve collector
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadMetrics}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Yenile
            </button>
            <button
              type="button"
              onClick={resetData}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm"
            >
              <Trash2 className="h-4 w-4" />
              Testi sifirla
            </button>
          </div>
        </header>

        {message ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm">
            {message}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                Test sitesi
                <select
                  value={selectedSiteId}
                  onChange={(event) => setSelectedSiteId(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                >
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name} - {site.domain}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Tarih
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                />
              </label>
            </div>

            {selectedSite ? (
              <>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-500">
                    {selectedSite.name} / {selectedSite.domain}
                  </p>
                  <button
                    type="button"
                    onClick={deleteSelectedSite}
                    disabled={deleting}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleting ? "Siliniyor" : "Siteyi sil"}
                  </button>
                </div>
                <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="font-semibold text-slate-500">v1 website id</p>
                    <p className="mt-1 break-all font-mono text-slate-900">
                      {selectedSite.legacyWebsiteId}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="font-semibold text-slate-500">v2 website id</p>
                    <p className="mt-1 break-all font-mono text-slate-900">
                      {selectedSite.websiteId}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="font-semibold text-slate-500">publish code</p>
                    <p className="mt-1 font-mono text-slate-900">
                      {selectedSite.publishCode}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="font-semibold text-slate-500">asset</p>
                    <p className="mt-1 break-all font-mono text-slate-900">
                      t-1-{selectedSite.domainSlug}-{selectedSite.scriptVersion}.js
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">
              Yeni test sitesi
            </h2>
            <div className="mt-4 grid gap-3">
              <input
                value={newSite.name}
                onChange={(event) =>
                  setNewSite((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Site adi"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={newSite.domain}
                onChange={(event) =>
                  setNewSite((current) => ({
                    ...current,
                    domain: event.target.value,
                  }))
                }
                placeholder="ornek.com"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={createTestSite}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                Olustur
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {(["v1", "v2"] as const).map((kind) => (
            <div
              key={kind}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-950">
                  {kind === "v1" ? "v1 genel tracker" : "v2 siteye ozel tracker"}
                </h2>
                <button
                  type="button"
                  onClick={async () => {
                    await copyText(snippets[kind]);
                    setCopied(kind);
                    window.setTimeout(() => setCopied(null), 1200);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  {copied === kind ? (
                    <ClipboardCheck className="h-4 w-4" />
                  ) : (
                    <Clipboard className="h-4 w-4" />
                  )}
                  Kopyala
                </button>
              </div>
              <textarea
                value={snippets[kind]}
                readOnly
                className="mt-4 h-40 w-full resize-none rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-50"
              />
              <button
                type="button"
                onClick={kind === "v1" ? runV1 : runV2}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
              >
                <Play className="h-4 w-4" />
                Bu sayfada yukle
              </button>
            </div>
          ))}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-base font-semibold text-slate-950">
              <Activity className="h-5 w-5 text-emerald-600" />
              Gunluk metrikler
            </h2>
            <button
              type="button"
              onClick={addTestEvent}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              data-bik-event tetikle
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {metricLabels.map(([key, label]) => (
              <div key={key} className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {numberFormat.format(metrics?.metrics[key] ?? 0)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-950">Son olaylar</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Zaman</th>
                  <th className="px-4 py-3">Tip</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3">Host</th>
                  <th className="px-4 py-3">URL</th>
                  <th className="px-4 py-3">Aktif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {(metrics?.recent || []).map((event) => (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                      {new Date(event.ts).toLocaleTimeString("tr-TR")}
                    </td>
                    <td className="px-4 py-3">
                      {event.version}/{event.endpoint}
                      {event.name ? `/${event.name}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      {event.accepted ? (
                        <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                          kabul
                        </span>
                      ) : (
                        <span className="rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                          {event.rejectReason || "red"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{event.hostname || "-"}</td>
                    <td className="max-w-sm truncate px-4 py-3">{event.url || "-"}</td>
                    <td className="px-4 py-3">
                      {numberFormat.format(event.activeSeconds || 0)} sn
                    </td>
                  </tr>
                ))}
                {!metrics?.recent?.length ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-400" colSpan={6}>
                      Henuz test olayi yok.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
