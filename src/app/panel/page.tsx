"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import FiltersBar from "@/components/dashboard/FiltersBar";
import StatsCard from "@/components/dashboard/StatsCard";
import { formatDuration } from "@/lib/formatDuration";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const parseFilterDate = (value: string | undefined, endOfDay = false) => {
  if (!value) {
    return null;
  }
  const iso = `${value}T${endOfDay ? "23:59:59" : "00:00:00"}+03:00`;
  return new Date(iso).getTime();
};

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
  const [loading, setLoading] = useState(false);

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
      setLoading(true);
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
      setLoading(false);
    };
    loadMetrics();
  }, [endDate, hideShortReads, selectedSiteId, startDate]);

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

        <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                Özet
              </p>
              <h2 className="text-lg font-semibold text-slate-900">
                Son Oturumlar
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              {loading ? "Yükleniyor..." : "Güncel"}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              Snippet logları geldikçe burada liste görünecek.
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
};

export default PanelPage;
