"use client";

import { useEffect, useState } from "react";
import StatsCard from "@/components/dashboard/StatsCard";
import { formatDuration } from "@/lib/formatDuration";

type WebsiteOption = {
  id: string;
  name: string;
};

type Metrics = {
  daily_unique_users: number;
  daily_direct_unique_users: number;
  daily_pageviews: number;
  daily_avg_time_on_site_seconds_per_unique: number;
};

const formatDateInput = (date: Date) => date.toISOString().split("T")[0];

type AdminSimpleMetricsProps = {
  websites: WebsiteOption[];
};

const AdminSimpleMetrics = ({ websites }: AdminSimpleMetricsProps) => {
  const [selectedSiteId, setSelectedSiteId] = useState<string>(
    websites[0]?.id ?? ""
  );
  const [dateValue, setDateValue] = useState(() => formatDateInput(new Date()));
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState<"rollups_only" | "full">(
    "rollups_only"
  );
  const [confirmText, setConfirmText] = useState("");

  const loadMetrics = async () => {
    if (!selectedSiteId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        siteId: selectedSiteId,
        date: dateValue,
      });
      const response = await fetch(
        `/api/analytics/simple/day?${params.toString()}`
      );
      const payload = await response.json();
      if (response.ok) {
        setMetrics(payload);
      }
    } finally {
      setLoading(false);
    }
  };

  const recompute = async () => {
    if (!selectedSiteId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/analytics/simple/recompute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: selectedSiteId, date: dateValue }),
      });
      const payload = await response.json();
      if (response.ok) {
        setMetrics(payload);
      }
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    if (confirmText !== "RESET_ANALYTICS") return;
    setLoading(true);
    try {
      const response = await fetch(`/api/analytics/simple/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: "RESET_ANALYTICS",
          mode: resetMode,
          siteId: selectedSiteId || undefined,
        }),
      });
      await response.json();
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, [selectedSiteId]);

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm shadow-slate-900/5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col text-xs font-semibold text-slate-500">
            Site
            <select
              value={selectedSiteId}
              onChange={(event) => setSelectedSiteId(event.target.value)}
              className="mt-2 min-w-[240px] rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
            >
              {websites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs font-semibold text-slate-500">
            Gün
            <input
              type="date"
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
              className="mt-2 rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            />
          </label>

          <button
            type="button"
            onClick={loadMetrics}
            className="rounded-2xl bg-slate-900 px-5 py-2 text-xs font-semibold uppercase tracking-widest text-white"
          >
            Yükle
          </button>
          <button
            type="button"
            onClick={recompute}
            className="rounded-2xl border border-slate-200 px-5 py-2 text-xs font-semibold text-slate-600"
          >
            Yeniden Hesapla
          </button>
        </div>
      </div>

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

      <div className="rounded-3xl border border-rose-200/70 bg-rose-50/60 p-4 shadow-sm shadow-rose-900/10">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col text-xs font-semibold text-rose-700">
            Reset modu
            <select
              value={resetMode}
              onChange={(event) =>
                setResetMode(event.target.value as "rollups_only" | "full")
              }
              className="mt-2 min-w-[200px] rounded-2xl border border-rose-200/80 bg-white px-3 py-2 text-sm text-rose-800"
            >
              <option value="rollups_only">Rollups Only</option>
              <option value="full">Full (events + rollups)</option>
            </select>
          </label>

          <label className="flex flex-col text-xs font-semibold text-rose-700">
            Onay metni
            <input
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder="RESET_ANALYTICS"
              className="mt-2 rounded-2xl border border-rose-200/80 bg-white px-3 py-2 text-sm text-rose-800"
            />
          </label>

          <button
            type="button"
            onClick={reset}
            disabled={loading || confirmText !== "RESET_ANALYTICS"}
            className="rounded-2xl bg-rose-600 px-5 py-2 text-xs font-semibold uppercase tracking-widest text-white disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-xs text-slate-400">İşlem sürüyor...</p>
      )}
    </section>
  );
};

export default AdminSimpleMetrics;
