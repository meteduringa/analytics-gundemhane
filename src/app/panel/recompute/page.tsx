"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Site = {
  id: string;
  name: string;
  allowedDomains: string[];
};

type RecomputeResult = {
  siteId: string;
  day: string;
  daily_unique_users: number;
  daily_direct_unique_users: number;
  daily_pageviews: number;
  daily_avg_time_on_site_seconds_per_unique: number;
  in_progress?: boolean;
  record_updated_at?: string | null;
};

const formatDateInput = (date: Date) => date.toISOString().split("T")[0];

const formatIstanbulDateTime = (value: Date | string | null | undefined) => {
  if (!value) return "-";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export default function RecomputePage() {
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
  const [dateInput, setDateInput] = useState(() => formatDateInput(new Date()));
  const [isRunning, setIsRunning] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<RecomputeResult | null>(null);
  const [baseline, setBaseline] = useState<RecomputeResult | null>(null);
  const inFlight = useRef(false);

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
    const parsed = JSON.parse(rawUser) as {
      id: string;
      email: string;
      name?: string | null;
      role: "ADMIN" | "CUSTOMER";
    };
    if (parsed.role !== "ADMIN") {
      router.replace("/panel");
      return;
    }
    setUser(parsed);
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [router]);

  useEffect(() => {
    if (!ready || !user) return;
    const loadSites = async () => {
      const response = await fetch("/api/panel/sites");
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Site listesi alınamadı.");
        return;
      }
      const nextSites = (payload.sites ?? []) as Site[];
      setSites(nextSites);
      if (!selectedSiteId && nextSites.length > 0) {
        setSelectedSiteId(nextSites[0].id);
      }
    };
    void loadSites();
  }, [ready, user, selectedSiteId]);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [selectedSiteId, sites]
  );

  const runSelectedRecompute = async (captureBaseline: boolean) => {
    if (!selectedSiteId || !dateInput || inFlight.current) return;
    inFlight.current = true;
    setIsRunning(true);
    setError("");
    setStatus(
      `${selectedSite?.name ?? "Seçili site"} için recompute çalışıyor...`
    );
    try {
      const response = await fetch("/api/analytics/simple/recompute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: selectedSiteId,
          date: dateInput,
        }),
      });
      const payload = (await response.json()) as RecomputeResult & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Recompute başarısız.");
      }
      setResult(payload);
      setLastRunAt(new Date());
      setStatus(
        `${selectedSite?.name ?? "Seçili site"} için recompute tamamlandı.`
      );
      if (captureBaseline) {
        setBaseline(payload);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recompute başarısız.");
      setStatus("");
    } finally {
      setIsRunning(false);
      inFlight.current = false;
    }
  };

  const runAllSitesRecompute = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsRunning(true);
    setError("");
    setStatus("Tüm siteler için recompute çalışıyor...");
    try {
      const response = await fetch("/api/analytics/simple/recompute-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateInput }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Toplu recompute başarısız.");
      }
      setLastRunAt(new Date());
      setStatus(`Tüm siteler için recompute tamamlandı. Gün: ${dateInput}`);
      if (selectedSiteId) {
        await runSelectedRecompute(false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Toplu recompute başarısız."
      );
      setStatus("");
    } finally {
      setIsRunning(false);
      inFlight.current = false;
    }
  };

  useEffect(() => {
    if (!autoEnabled || !selectedSiteId) {
      setBaseline(null);
      return;
    }
    const today = formatDateInput(new Date());
    setDateInput(today);
    void runSelectedRecompute(true);
    const interval = window.setInterval(() => {
      void runSelectedRecompute(false);
    }, 60000);
    return () => window.clearInterval(interval);
  }, [autoEnabled, selectedSiteId]);

  const delta = useMemo(() => {
    if (!baseline || !result) return null;
    return {
      unique: result.daily_unique_users - baseline.daily_unique_users,
      direct:
        result.daily_direct_unique_users - baseline.daily_direct_unique_users,
      pageviews: result.daily_pageviews - baseline.daily_pageviews,
    };
  }, [baseline, result]);

  if (!ready) return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Recompute
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            Recompute Merkezi
          </h1>
          <p className="text-sm text-slate-500">
            Recompute işlemleri analiz ekranlarından ayrıldı. Bu ekran sadece
            cache yenileme ve yük kontrolü içindir.
          </p>
        </header>

        <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
          <div className="grid gap-4 md:grid-cols-[1.5fr_1fr_1fr]">
            <label className="text-xs font-semibold text-slate-500">
              Site
              <select
                value={selectedSiteId}
                onChange={(event) => setSelectedSiteId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
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
              Gün
              <input
                type="date"
                value={dateInput}
                onChange={(event) => setDateInput(event.target.value)}
                disabled={autoEnabled}
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800 disabled:bg-slate-100"
              />
            </label>

            <div className="flex items-end">
              <label className="flex w-full items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                <span>Otomatik (1 dk)</span>
                <button
                  type="button"
                  onClick={() => setAutoEnabled((current) => !current)}
                  className={`relative h-7 w-12 rounded-full transition ${
                    autoEnabled ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                  aria-pressed={autoEnabled}
                  aria-label="Otomatik recompute"
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                      autoEnabled ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void runSelectedRecompute(false)}
              disabled={isRunning || !selectedSiteId}
              className="rounded-2xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRunning ? "Çalışıyor..." : "Seçili Siteyi Recompute Et"}
            </button>

            <button
              type="button"
              onClick={() => void runAllSitesRecompute()}
              disabled={isRunning}
              className="rounded-2xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Tüm Siteleri Recompute Et
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {status ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {status}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              Son Recompute
            </p>
            <div className="mt-3 text-lg font-semibold text-slate-900">
              {lastRunAt ? formatIstanbulDateTime(lastRunAt) : "-"}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              Tekil
            </p>
            <div className="mt-3 text-3xl font-bold text-slate-900">
              {result?.daily_unique_users ?? 0}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              Direct Tekil
            </p>
            <div className="mt-3 text-3xl font-bold text-slate-900">
              {result?.daily_direct_unique_users ?? 0}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              Pageview
            </p>
            <div className="mt-3 text-3xl font-bold text-slate-900">
              {result?.daily_pageviews ?? 0}
            </div>
          </div>
        </div>

        {autoEnabled && delta ? (
          <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-5 text-sm text-cyan-900 shadow-sm shadow-slate-900/5">
            <p className="font-semibold">Otomatik takip artışı</p>
            <p className="mt-2">
              Başlangıçtan beri +{delta.unique} tekil, +{delta.direct} direct,
              +{delta.pageviews} pageview
            </p>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
