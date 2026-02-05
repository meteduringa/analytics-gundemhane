"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Site = {
  id: string;
  name: string;
  allowedDomains: string[];
};

type SourceRow = {
  sourceWebsiteId: string;
  sessions: number;
  visitors: number;
  avgSeconds: number;
  totalSeconds: number;
};

const formatDateInput = (date: Date) => date.toISOString().split("T")[0];

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const formatDuration = (seconds: number) => {
  if (!seconds || Number.isNaN(seconds)) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
};

export default function SourceAnalysisPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{
    id: string;
    email: string;
    name?: string | null;
    role: "ADMIN" | "CUSTOMER";
  } | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [startDate, setStartDate] = useState(() =>
    formatDateInput(daysAgo(7))
  );
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));
  const [landingUrl, setLandingUrl] = useState("");
  const [minAvgSeconds, setMinAvgSeconds] = useState("1");
  const [isLoading, setIsLoading] = useState(false);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isAuthorized = window.localStorage.getItem("auth") === "1";
    if (!isAuthorized) {
      router.replace("/login");
      return;
    }
    const rawUser = window.localStorage.getItem("user");
    if (!rawUser) {
      router.replace("/login");
      return;
    }
    setUser(JSON.parse(rawUser));
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [router]);

  useEffect(() => {
    const loadSites = async () => {
      if (!user) return;
      const params = new URLSearchParams({
        userId: user.id,
        role: user.role,
      });
      const response = await fetch(`/api/panel/sites?${params.toString()}`);
      const payload = await response.json();
      if (response.ok) {
        setSites(payload.sites ?? []);
        if (!selectedSiteId && payload.sites?.length) {
          setSelectedSiteId(payload.sites[0].id);
        }
      }
    };
    loadSites();
  }, [selectedSiteId, user]);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId),
    [selectedSiteId, sites]
  );

  const loadSources = async () => {
    if (!selectedSiteId) return;
    setIsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        websiteId: selectedSiteId,
        start: startDate,
        end: endDate,
        minAvgSeconds: minAvgSeconds || "1",
      });
      if (landingUrl.trim()) {
        params.set("landingUrl", landingUrl.trim());
      }
      const response = await fetch(
        `/api/panel/source-analysis?${params.toString()}`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Analiz başarısız.");
      }
      setSources(payload.sources ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analiz başarısız.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!sources.length) return;
    const value = sources.map((row) => row.sourceWebsiteId).join(", ");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  if (!ready) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Kaynak Analizi
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            Popcent Trafik Kaynağı Analizi
          </h1>
          {selectedSite && (
            <p className="text-sm text-slate-500">
              Seçili site:{" "}
              <span className="font-semibold">{selectedSite.name}</span>
            </p>
          )}
        </header>

        <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm shadow-slate-900/5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-500">
              Site Seçimi
              <select
                value={selectedSiteId}
                onChange={(event) => setSelectedSiteId(event.target.value)}
                className="mt-2 w-full min-w-[220px] rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              >
                <option value="">Site seçin</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Başlangıç
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="mt-2 rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Bitiş
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="mt-2 rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Landing URL (opsiyonel)
              <input
                value={landingUrl}
                onChange={(event) => setLandingUrl(event.target.value)}
                placeholder="/haber/ornek-baslik"
                className="mt-2 w-full min-w-[220px] rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Min Ortalama (sn)
              <input
                value={minAvgSeconds}
                onChange={(event) => setMinAvgSeconds(event.target.value)}
                className="mt-2 w-[140px] rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <button
              type="button"
              onClick={loadSources}
              className="mb-1 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              disabled={isLoading}
            >
              {isLoading ? "Analiz ediliyor..." : "Analiz Et"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                Sonuçlar
              </p>
              <h2 className="text-lg font-semibold text-slate-900">
                Kaynak Website ID Performansı
              </h2>
              <p className="text-xs text-slate-500">
                Sadece source website_id yakalanan trafik listelenir.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
              disabled={!sources.length}
            >
              {copied ? "Kopyalandı" : "ID'leri Kopyala"}
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Website ID</th>
                  <th className="px-3 py-2">Ziyaretçi</th>
                  <th className="px-3 py-2">Session</th>
                  <th className="px-3 py-2">Ort. Süre</th>
                  <th className="px-3 py-2">Toplam Süre</th>
                </tr>
              </thead>
              <tbody>
                {sources.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-slate-400"
                    >
                      Sonuç bulunamadı.
                    </td>
                  </tr>
                )}
                {sources.map((row) => (
                  <tr
                    key={row.sourceWebsiteId}
                    className="border-b border-slate-100"
                  >
                    <td className="px-3 py-2 font-semibold text-slate-800">
                      {row.sourceWebsiteId}
                    </td>
                    <td className="px-3 py-2">{row.visitors}</td>
                    <td className="px-3 py-2">{row.sessions}</td>
                    <td className="px-3 py-2">
                      {formatDuration(row.avgSeconds)}
                    </td>
                    <td className="px-3 py-2">
                      {formatDuration(row.totalSeconds)}
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
