"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { usePanelSession } from "@/hooks/usePanelSession";
import { Clipboard, ClipboardCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Site = {
  id: string;
  name: string;
  siteUrl?: string | null;
  primaryDomain?: string | null;
  allowedDomains: string[];
};

type Metrics = {
  daily_unique_users: number;
  daily_direct_unique_users: number;
  daily_pageviews: number;
  daily_avg_time_on_site_seconds_per_unique: number;
  raw_pageview_events?: number;
  raw_ping_events?: number;
  strict_pageview_events?: number;
  strict_ping_events?: number;
};

type ComparisonPayload = {
  day: string;
  site: Site;
  old: Metrics;
  new: Metrics;
  diff: Record<string, { delta: number; percent: number | null }>;
};

const todayInput = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const fallbackHostUrl = (
  process.env.NEXT_PUBLIC_HOST_URL ?? "https://giris.elmasistatistik.com.tr"
).replace(/\/+$/, "");

const resolveHostUrl = () => {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return fallbackHostUrl;
};

const buildSnippet = (websiteId: string, hostUrl: string, scriptName: string) =>
  `<script async fetchpriority="low" src="${hostUrl}/${scriptName}"
  data-site-id="${websiteId}"
  data-host-url="${hostUrl}">
</script>`;

const formatNumber = (value: number) => new Intl.NumberFormat("tr-TR").format(value);

const formatSeconds = (value: number) => {
  if (!value) return "0 sn";
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  if (!minutes) return `${seconds} sn`;
  return `${minutes} dk ${seconds} sn`;
};

const formatDiff = (diff?: { delta: number; percent: number | null }) => {
  if (!diff) return "-";
  const sign = diff.delta > 0 ? "+" : "";
  const percent = diff.percent === null ? "" : ` / ${sign}${diff.percent}%`;
  return `${sign}${formatNumber(diff.delta)}${percent}`;
};

const metricRows = [
  {
    key: "daily_unique_users",
    label: "Tekil ziyaretçi",
    formatter: formatNumber,
  },
  {
    key: "daily_direct_unique_users",
    label: "Direct tekil",
    formatter: formatNumber,
  },
  {
    key: "daily_pageviews",
    label: "Sayfa görüntüleme",
    formatter: formatNumber,
  },
  {
    key: "daily_avg_time_on_site_seconds_per_unique",
    label: "Ortalama süre",
    formatter: formatSeconds,
  },
] as const;

export default function BikTestPage() {
  const { user, ready } = usePanelSession();
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [date, setDate] = useState(todayInput);
  const [hostUrl, setHostUrl] = useState(fallbackHostUrl);
  const [data, setData] = useState<ComparisonPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"old" | "new" | null>(null);

  useEffect(() => {
    setHostUrl(resolveHostUrl());
  }, []);

  useEffect(() => {
    if (!ready || user?.role !== "ADMIN") return;
    const loadSites = async () => {
      const response = await fetch("/api/panel/sites", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Siteler alınamadı.");
        return;
      }
      const nextSites = payload.sites ?? [];
      setSites(nextSites);
      setSelectedSiteId((current) => current || nextSites[0]?.id || "");
    };
    void loadSites();
  }, [ready, user?.role]);

  useEffect(() => {
    if (!selectedSiteId || user?.role !== "ADMIN") return;
    const controller = new AbortController();
    const loadComparison = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ siteId: selectedSiteId, date });
        const response = await fetch(`/api/panel/bik-comparison?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) {
          setError(payload.error ?? "Karşılaştırma alınamadı.");
          return;
        }
        setData(payload);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Karşılaştırma alınamadı.");
        }
      } finally {
        setLoading(false);
      }
    };
    void loadComparison();
    return () => controller.abort();
  }, [date, selectedSiteId, user?.role]);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [selectedSiteId, sites]
  );

  const snippets = useMemo(() => {
    if (!selectedSiteId) return { old: "", next: "" };
    return {
      old: buildSnippet(selectedSiteId, hostUrl, "simple-tracker.js"),
      next: buildSnippet(selectedSiteId, hostUrl, "bik-tracker.js"),
    };
  }, [hostUrl, selectedSiteId]);

  const copySnippet = async (kind: "old" | "new") => {
    const value = kind === "old" ? snippets.old : snippets.next;
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1500);
  };

  if (ready && user?.role !== "ADMIN") {
    return (
      <DashboardLayout>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700">
          Bu ekran sadece admin kullanıcılar içindir.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              BİK Test
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">
              Eski Kod / Yeni Kod Karşılaştırması
            </h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={selectedSiteId}
              onChange={(event) => setSelectedSiteId(event.target.value)}
              className="min-w-64 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            />
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Eski kod</p>
                <p className="mt-1 text-xs text-slate-500">
                  Mevcut Elmas ölçümü. Birkaç gün ana veri olarak bu kalır.
                </p>
              </div>
              <button
                type="button"
                onClick={() => copySnippet("old")}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
              >
                {copied === "old" ? (
                  <ClipboardCheck className="h-3 w-3" />
                ) : (
                  <Clipboard className="h-3 w-3" />
                )}
                Kopyala
              </button>
            </div>
            <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-[11px] text-slate-700">
              {snippets.old || "Site seçiniz."}
            </pre>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-950">
                  Yeni BİK test kodu
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  Ayrı havuza yazar. Eski rakamları bozmaz.
                </p>
              </div>
              <button
                type="button"
                onClick={() => copySnippet("new")}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700"
              >
                {copied === "new" ? (
                  <ClipboardCheck className="h-3 w-3" />
                ) : (
                  <Clipboard className="h-3 w-3" />
                )}
                Kopyala
              </button>
            </div>
            <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-white p-3 text-[11px] text-emerald-900">
              {snippets.next || "Site seçiniz."}
            </pre>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                {selectedSite?.name ?? "Site"} / {data?.day ?? date}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {loading ? "Hesaplanıyor..." : "Eski ve yeni ölçüm yan yana."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              <span className="rounded-full border border-slate-200 px-3 py-1">
                Eski PV event: {formatNumber(data?.old.raw_pageview_events ?? 0)}
              </span>
              <span className="rounded-full border border-emerald-200 px-3 py-1 text-emerald-700">
                Yeni PV event: {formatNumber(data?.new.strict_pageview_events ?? 0)}
              </span>
              <span className="rounded-full border border-slate-200 px-3 py-1">
                Eski ping: {formatNumber(data?.old.raw_ping_events ?? 0)}
              </span>
              <span className="rounded-full border border-emerald-200 px-3 py-1 text-emerald-700">
                Yeni ping: {formatNumber(data?.new.strict_ping_events ?? 0)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Metrik</th>
                  <th className="px-5 py-3">Eski Elmas</th>
                  <th className="px-5 py-3">Yeni BİK Test</th>
                  <th className="px-5 py-3">Fark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metricRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-5 py-4 font-semibold text-slate-800">
                      {row.label}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {row.formatter(data?.old[row.key] ?? 0)}
                    </td>
                    <td className="px-5 py-4 font-semibold text-emerald-700">
                      {row.formatter(data?.new[row.key] ?? 0)}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {formatDiff(data?.diff[row.key])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
