"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import FiltersBar from "@/components/dashboard/FiltersBar";
import StatsCard from "@/components/dashboard/StatsCard";
import { formatDuration } from "@/lib/formatDuration";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const formatDateInput = (date: Date) => {
  return date.toISOString().split("T")[0];
};

const PanelPage = () => {
  const router = useRouter();
  const [startDateInput, setStartDateInput] = useState(() =>
    formatDateInput(new Date())
  );
  const [endDateInput, setEndDateInput] = useState(formatDateInput(new Date()));
  const [hideShortReadsInput, setHideShortReadsInput] = useState(true);
  const [startDate, setStartDate] = useState(() => formatDateInput(new Date()));
  const [endDate, setEndDate] = useState(formatDateInput(new Date()));
  const [hideShortReads, setHideShortReads] = useState(true);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{
    id: string;
    email: string;
    name?: string | null;
    role: "ADMIN" | "CUSTOMER";
  } | null>(null);
  const [sites, setSites] = useState<
    { id: string; name: string; allowedDomains: string[] }[]
  >([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [metrics, setMetrics] = useState<{
    totalPageviews: number;
    totalDuration: number;
    avgDuration: number;
    dailyUniqueVisitors: number;
    liveVisitors: number;
  } | null>(null);
  const [bikMetrics, setBikMetrics] = useState<{
    daily_unique_visitors: number;
    daily_direct_unique_visitors: number;
    daily_pageviews: number;
    daily_sessions: number;
    daily_avg_time_on_site_seconds: number;
    direct_ratio: number;
    foreign_traffic_adjusted: number;
    daily_unique_visitors_strict: number;
    daily_direct_unique_visitors_strict: number;
    daily_pageviews_strict: number;
    daily_sessions_strict: number;
    daily_avg_time_on_site_seconds_strict: number;
    daily_total_time_on_site_seconds_strict: number;
  } | null>(null);
  const [bikRealtime, setBikRealtime] = useState<{
    live_visitors: number;
    live_pageviews: number;
  } | null>(null);

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
    const frame = window.requestAnimationFrame(() => {
      setReady(true);
    });
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

  useEffect(() => {
    const loadMetrics = async () => {
      if (!selectedSiteId) return;
      const params = new URLSearchParams({
        websiteId: selectedSiteId,
        start: startDate,
        end: endDate,
        hideShortReads: hideShortReads ? "1" : "0",
      });
      const response = await fetch(`/api/panel/metrics?${params.toString()}`);
      const payload = await response.json();
      if (response.ok) {
        setMetrics(payload);
      }
    };
    loadMetrics();
  }, [endDate, hideShortReads, selectedSiteId, startDate]);

  useEffect(() => {
    const loadBikMetrics = async () => {
      if (!selectedSiteId) return;
      const day = startDate;
      const [dayResponse, realtimeResponse] = await Promise.all([
        fetch(
          `/analytics/day?site_id=${selectedSiteId}&date=${day}&hideShortReads=${
            hideShortReads ? "1" : "0"
          }`
        ),
        fetch(`/analytics/realtime?site_id=${selectedSiteId}`),
      ]);
      const dayPayload = await dayResponse.json();
      const realtimePayload = await realtimeResponse.json();
      if (dayResponse.ok) {
        setBikMetrics(dayPayload);
      }
      if (realtimeResponse.ok) {
        setBikRealtime(realtimePayload);
      }
    };
    loadBikMetrics();
  }, [hideShortReads, selectedSiteId, startDate]);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId),
    [selectedSiteId, sites]
  );

  if (!ready) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Dashboard
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            Ziyaretçi Özeti
          </h1>
          {selectedSite && (
            <p className="text-sm text-slate-500">
              Seçili site: <span className="font-semibold">{selectedSite.name}</span>
            </p>
          )}
        </header>

        <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm shadow-slate-900/5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold text-slate-500">
              Site Seçimi
              <select
                value={selectedSiteId}
                onChange={(event) => setSelectedSiteId(event.target.value)}
                className="mt-2 w-full min-w-[240px] rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              >
                <option value="">Site seçin</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <FiltersBar
          startValue={startDateInput}
          endValue={endDateInput}
          hideShortReads={hideShortReadsInput}
          onStartChange={setStartDateInput}
          onEndChange={setEndDateInput}
          onToggleShortReads={setHideShortReadsInput}
          onFilter={() => {
            setStartDate(startDateInput);
            setEndDate(endDateInput);
            setHideShortReads(hideShortReadsInput);
          }}
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatsCard
            title="Anlık Tekil Ziyaretçi"
            value={`${metrics?.liveVisitors ?? 0}`}
            detail="Son 5 dakika"
            accent="text-indigo-700"
            tone="bg-indigo-50"
          />
          <StatsCard
            title="Günlük Tekil Ziyaretçi"
            value={`${metrics?.dailyUniqueVisitors ?? 0}`}
            detail="Bugün"
            accent="text-emerald-700"
            tone="bg-emerald-50"
          />
          <StatsCard
            title="Toplam Görüntülenme"
            value={`${metrics?.totalPageviews ?? 0}`}
            detail="Seçilen tarih aralığı"
            accent="text-slate-900"
            tone="bg-amber-50"
          />
          <StatsCard
            title="Okunma Süresi"
            value={formatDuration(metrics?.avgDuration ?? 0)}
            detail="Kişi başı ortalama"
            accent="text-rose-600"
            tone="bg-rose-50"
          />
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm shadow-slate-900/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                BIK_STRICT
              </p>
              <h2 className="text-lg font-semibold text-slate-900">
                Resmiye Yakın Metrikler
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              {startDate} günü için
            </span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatsCard
              title="BIK Tekil"
              value={`${bikMetrics?.daily_unique_visitors_strict ?? 0}`}
              detail="Günlük tekil (strict)"
              accent="text-slate-900"
              tone="bg-slate-50"
            />
            <StatsCard
              title="BIK Doğrudan"
              value={`${bikMetrics?.daily_direct_unique_visitors_strict ?? 0}`}
              detail="Günlük direct (strict)"
              accent="text-emerald-700"
              tone="bg-emerald-50"
            />
            <StatsCard
              title="BIK Pageview"
              value={`${bikMetrics?.daily_pageviews_strict ?? 0}`}
              detail="Günlük görüntülenme (strict)"
              accent="text-indigo-700"
              tone="bg-indigo-50"
            />
            <StatsCard
              title="BIK Toplam Süre"
              value={formatDuration(
                bikMetrics?.daily_total_time_on_site_seconds_strict ?? 0
              )}
              detail="Toplam okunma (strict)"
              accent="text-rose-600"
              tone="bg-rose-50"
            />
            <StatsCard
              title="BIK Anlık Tekil"
              value={`${bikRealtime?.live_visitors ?? 0}`}
              detail="Son 5 dakika"
              accent="text-slate-900"
              tone="bg-amber-50"
            />
            <StatsCard
              title="BIK Ortalama Süre"
              value={formatDuration(
                bikMetrics?.daily_avg_time_on_site_seconds_strict ?? 0
              )}
              detail="Session ortalaması (strict)"
              accent="text-cyan-700"
              tone="bg-cyan-50"
            />
            <StatsCard
              title="BIK Direct Oran"
              value={`${Math.round((bikMetrics?.direct_ratio ?? 0) * 100)}%`}
              detail="Direct / Tekil (legacy)"
              accent="text-cyan-700"
              tone="bg-cyan-50"
            />
            <StatsCard
              title="BIK Yurtdışı Ayarlı"
              value={`${bikMetrics?.foreign_traffic_adjusted ?? 0}`}
              detail="Legacy %10"
              accent="text-slate-900"
              tone="bg-slate-50"
            />
            <StatsCard
              title="BIK Session"
              value={`${bikMetrics?.daily_sessions_strict ?? 0}`}
              detail="Günlük oturum (strict)"
              accent="text-amber-700"
              tone="bg-amber-50"
            />
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
};

export default PanelPage;
