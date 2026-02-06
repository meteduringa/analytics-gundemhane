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
  const [dateInput, setDateInput] = useState(() =>
    formatDateInput(new Date())
  );
  const [selectedDate, setSelectedDate] = useState(() =>
    formatDateInput(new Date())
  );
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
    daily_unique_users: number;
    daily_direct_unique_users: number;
    daily_pageviews: number;
    daily_avg_time_on_site_seconds_per_unique: number;
    daily_popcent_unique_users?: number;
    daily_popcent_pageviews?: number;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshMetrics = async (siteId: string, dateValue: string) => {
    if (!siteId) return;
    setIsRefreshing(true);
    await fetch(`/api/analytics/simple/recompute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, date: dateValue }),
    }).catch(() => null);
    const params = new URLSearchParams({
      siteId,
      date: dateValue,
    });
    const response = await fetch(
      `/api/analytics/simple/day?${params.toString()}`
    );
    const payload = await response.json();
    if (response.ok) {
      setMetrics(payload);
    }
    setIsRefreshing(false);
  };

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
    refreshMetrics(selectedSiteId, selectedDate);
  }, [selectedDate, selectedSiteId]);

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
          dateValue={dateInput}
          onDateChange={setDateInput}
          onFilter={() => setSelectedDate(dateInput)}
          onRefresh={() => refreshMetrics(selectedSiteId, selectedDate)}
        />

        {isRefreshing && (
          <p className="text-xs text-slate-400">Güncelleniyor...</p>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatsCard
            title="Günlük Tekil"
            value={`${metrics?.daily_unique_users ?? 0}`}
            detail="Seçilen gün"
            accent="text-emerald-700"
            tone="bg-emerald-50"
          />
          <StatsCard
            title="Günlük Direct"
            value={`${metrics?.daily_direct_unique_users ?? 0}`}
            detail="Referrer boş (direct)"
            accent="text-cyan-700"
            tone="bg-cyan-50"
          />
          <StatsCard
            title="Günlük Pageview"
            value={`${metrics?.daily_pageviews ?? 0}`}
            detail="Deduped görüntülenme"
            accent="text-indigo-700"
            tone="bg-indigo-50"
          />
          <StatsCard
            title="Günlük Ortalama Süre"
            value={formatDuration(
              metrics?.daily_avg_time_on_site_seconds_per_unique ?? 0
            )}
            detail="Tekil başına ortalama"
            accent="text-rose-600"
            tone="bg-rose-50"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
          <StatsCard
            title="Popcent Tekil"
            value={`${metrics?.daily_popcent_unique_users ?? 0}`}
            detail="Seçilen gün (tekil)"
            accent="text-amber-700"
            tone="bg-amber-50"
          />
          <StatsCard
            title="Popcent Pageview"
            value={`${metrics?.daily_popcent_pageviews ?? 0}`}
            detail="Seçilen gün (toplam)"
            accent="text-orange-700"
            tone="bg-orange-50"
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default PanelPage;
