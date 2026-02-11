"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import FiltersBar from "@/components/dashboard/FiltersBar";
import StatsCard from "@/components/dashboard/StatsCard";
import { formatDuration } from "@/lib/formatDuration";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const PanelPage = () => {
  const router = useRouter();
  const [dateInput, setDateInput] = useState(() =>
    formatDateInput(new Date())
  );
  const [selectedDate, setSelectedDate] = useState(() =>
    formatDateInput(new Date())
  );
  const [viewMode, setViewMode] = useState<"daily" | "live">("daily");
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
    as_of_local?: string;
    as_of_utc?: string;
    record_updated_at?: string | null;
    day_start_local?: string;
  } | null>(null);
  const [topPages, setTopPages] = useState<
    { url: string; pageviews: number; uniqueVisitors: number }[]
  >([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshAll = async (
    siteId: string,
    dateValue: string,
    options?: { silent?: boolean }
  ) => {
    if (!siteId) return;
    const silent = options?.silent === true;
    if (!silent) {
      setIsRefreshing(true);
    }
    const params = new URLSearchParams({
      siteId,
      date: dateValue,
    });
    const liveParams = new URLSearchParams({
      siteId,
    });
    const topPagesParams = new URLSearchParams({
      websiteId: siteId,
      start: dateValue,
      end: dateValue,
      limit: "30",
    });

    const metricsPromise =
      viewMode === "live"
        ? fetch(`/api/analytics/simple/live?${liveParams.toString()}`)
        : fetch(`/api/analytics/simple/day?${params.toString()}`);
    const topPagesPromise = fetch(
      `/api/panel/top-pages?${topPagesParams.toString()}`
    );

    const response = await metricsPromise;
    const payload = await response.json();
    if (response.ok) {
      setMetrics(payload);
    }

    if (!silent) {
      setIsRefreshing(false);
    }

    const topPagesResponse = await topPagesPromise;
    const topPagesPayload = await topPagesResponse.json();
    if (topPagesResponse.ok) {
      setTopPages(topPagesPayload.pages ?? []);
    }
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
  }, [user]);

  useEffect(() => {
    refreshAll(selectedSiteId, selectedDate);
  }, [selectedDate, selectedSiteId, viewMode]);

  useEffect(() => {
    if (!user || user.role !== "CUSTOMER") return;
    if (!selectedSiteId) return;
    const interval = window.setInterval(() => {
      refreshAll(selectedSiteId, selectedDate, { silent: true });
    }, 20000);
    return () => window.clearInterval(interval);
  }, [selectedDate, selectedSiteId, user, viewMode]);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId),
    [selectedSiteId, sites]
  );

  if (!ready) {
    return null;
  }

  const renderCustomerDashboard = () => (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
          Ön Dashboard
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
            {selectedSite ? selectedSite.name : "Site Yükleniyor"}
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1 text-xs font-semibold text-slate-500">
            <button
              type="button"
              onClick={() => setViewMode("daily")}
              className={`rounded-2xl px-4 py-2 transition ${
                viewMode === "daily"
                  ? "bg-slate-900 text-white"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Günlük
            </button>
            <button
              type="button"
              onClick={() => {
                const today = formatDateInput(new Date());
                setDateInput(today);
                setSelectedDate(today);
                setViewMode("live");
              }}
              className={`rounded-2xl px-4 py-2 transition ${
                viewMode === "live"
                  ? "bg-emerald-600 text-white"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Anlık Veri
            </button>
          </div>
        </div>
      </div>

      <FiltersBar
        dateValue={dateInput}
        onDateChange={setDateInput}
        onFilter={() => setSelectedDate(dateInput)}
        onRefresh={() => refreshAll(selectedSiteId, selectedDate)}
        disableDate={viewMode === "live"}
      />

      {isRefreshing && (
        <p className="text-xs text-slate-400">Güncelleniyor...</p>
      )}
      <p className="text-xs text-slate-400">
        Veriler arka planda 20 saniyede bir güncellenir.
      </p>
      {viewMode === "live" && metrics?.as_of_local && (
        <p className="text-xs text-slate-500">
          Anlık veri zamanı: {metrics.as_of_local}{" "}
          {metrics.record_updated_at
            ? `(cache: ${new Date(metrics.record_updated_at).toLocaleString("tr-TR")})`
            : ""}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title={`${viewMode === "live" ? "Anlık (Temiz)" : "Günlük"} Tekil`}
          value={`${metrics?.daily_unique_users ?? 0}`}
          detail={viewMode === "live" ? "Clean cache (120 sn)" : "Seçilen gün"}
          accent="text-emerald-700"
          tone="bg-emerald-50"
        />
        <StatsCard
          title={`${viewMode === "live" ? "Anlık (Temiz)" : "Günlük"} Direct`}
          value={`${metrics?.daily_direct_unique_users ?? 0}`}
          detail={
            viewMode === "live"
              ? "Clean cache (120 sn)"
              : "Referrer boş (direct)"
          }
          accent="text-cyan-700"
          tone="bg-cyan-50"
        />
        <StatsCard
          title={`${viewMode === "live" ? "Anlık (Temiz)" : "Günlük"} Pageview`}
          value={`${metrics?.daily_pageviews ?? 0}`}
          detail={
            viewMode === "live"
              ? "Clean cache (120 sn)"
              : "Deduped görüntülenme"
          }
          accent="text-indigo-700"
          tone="bg-indigo-50"
        />
        <StatsCard
          title="Günlük Ortalama Süre"
          value={
            viewMode === "live"
              ? "-"
              : formatDuration(
                  metrics?.daily_avg_time_on_site_seconds_per_unique ?? 0
                )
          }
          detail={
            viewMode === "live"
              ? "Anlık modda süre hesaplanmaz"
              : "Tekil başına ortalama"
          }
          accent="text-rose-600"
          tone="bg-rose-50"
        />
      </div>

      <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              Haberler
            </p>
            <h2 className="text-xl font-semibold text-slate-900">
              Haber Performansı
            </h2>
            <p className="text-sm text-slate-500">
              Seçilen gün için sayfa görüntülenme ve tekil ziyaretçi.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              <tr>
                <th className="px-4 py-3">Haber</th>
                <th className="px-4 py-3">Gösterim</th>
                <th className="px-4 py-3">Tekil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topPages.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                    Sonuç bulunamadı.
                  </td>
                </tr>
              )}
              {topPages.map((page) => (
                <tr key={page.url} className="text-slate-700">
                  <td className="max-w-[420px] truncate px-4 py-3">
                    {page.url}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {page.pageviews}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {page.uniqueVisitors}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderAdminDashboard = () => (
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
        onRefresh={() => refreshAll(selectedSiteId, selectedDate)}
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

      {user?.role === "ADMIN" && (
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
      )}
    </div>
  );

  return (
    <DashboardLayout>
      {user?.role === "CUSTOMER"
        ? renderCustomerDashboard()
        : renderAdminDashboard()}
    </DashboardLayout>
  );
};

export default PanelPage;
