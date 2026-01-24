"use client";

import { useMemo, useState } from "react";

type Website = { id: string; name: string };

type DiagnosticsResponse = {
  date: string;
  raw_uniques: number;
  raw_sessions: number;
  raw_pageviews: number;
  render_ping_count: number;
  raw_engagement_avg: number;
  counted_uniques: number;
  counted_sessions: number;
  counted_pageviews: number;
  counted_engagement_avg: number;
  invalid_sessions_count: number;
  suspicious_sessions_count: number;
  adblock_suspect_count: number;
  route_change_pv_count: number;
  deduped_pv_count: number;
  visitor_id_source: {
    cookie: number;
    localStorage: number;
    ephemeral: number;
  };
  error_codes: Record<string, number>;
};

const formatDateInput = (date: Date) => date.toISOString().split("T")[0];

const AdminBikDiagnostics = ({ websites }: { websites: Website[] }) => {
  const [websiteId, setWebsiteId] = useState(websites[0]?.id ?? "");
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<DiagnosticsResponse | null>(null);

  const isReady = useMemo(() => websiteId && date, [websiteId, date]);

  const networkErrorCount = useMemo(() => {
    if (!data?.error_codes) return 0;
    return Object.values(data.error_codes).reduce((sum, value) => sum + value, 0);
  }, [data]);

  const fetchDiagnostics = async () => {
    if (!isReady) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const response = await fetch(
        `/api/analytics/debug/day?date=${date}&siteId=${websiteId}`
      );
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error ?? "Veri alınamadı.");
      } else {
        setData(payload);
      }
    } catch {
      setError("Ağ hatası.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            BIK-like Diagnostics
          </p>
          <h2 className="text-lg font-semibold text-slate-900">
            Sayaç kayıplarını teşhis et
          </h2>
        </div>
        <button
          type="button"
          onClick={fetchDiagnostics}
          disabled={!isReady || loading}
          className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white disabled:opacity-60"
        >
          {loading ? "Analiz..." : "Analiz Et"}
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <label className="text-xs font-semibold text-slate-500">
          Site
          <select
            value={websiteId}
            onChange={(event) => setWebsiteId(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          >
            {websites.map((site) => (
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
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm"
          />
        </label>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {data && (
        <div className="mt-6 space-y-6">
          <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Funnel
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                page_request
              </p>
              <p className="text-xs text-slate-500">Log yok (placeholder)</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                render_ping
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {data.render_ping_count}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                page_view (raw)
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {data.raw_pageviews}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                valid_session
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {data.counted_sessions}
              </p>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Raw vs Counted
              </p>
              <div className="mt-4 grid gap-3 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span>Uniques</span>
                  <span className="font-semibold text-slate-900">
                    {data.raw_uniques} → {data.counted_uniques}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Sessions</span>
                  <span className="font-semibold text-slate-900">
                    {data.raw_sessions} → {data.counted_sessions}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Pageviews</span>
                  <span className="font-semibold text-slate-900">
                    {data.raw_pageviews} → {data.counted_pageviews}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Avg Engagement (s)</span>
                  <span className="font-semibold text-slate-900">
                    {data.raw_engagement_avg} → {data.counted_engagement_avg}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Drop Reasons
              </p>
              <div className="mt-4 grid gap-3 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span>invalid &lt; 1s</span>
                  <span className="font-semibold text-slate-900">
                    {data.invalid_sessions_count}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>suspicious</span>
                  <span className="font-semibold text-slate-900">
                    {data.suspicious_sessions_count}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>network_error</span>
                  <span className="font-semibold text-slate-900">
                    {networkErrorCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>blocked</span>
                  <span className="font-semibold text-slate-900">
                    {data.adblock_suspect_count}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                SPA Signals
              </p>
              <div className="mt-4 grid gap-2 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span>Route change PV</span>
                  <span className="font-semibold text-slate-900">
                    {data.route_change_pv_count}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Deduped PV</span>
                  <span className="font-semibold text-slate-900">
                    {data.deduped_pv_count}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Visitor ID Source
              </p>
              <div className="mt-4 grid gap-2 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span>cookie</span>
                  <span className="font-semibold text-slate-900">
                    {data.visitor_id_source.cookie}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>localStorage</span>
                  <span className="font-semibold text-slate-900">
                    {data.visitor_id_source.localStorage}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>ephemeral</span>
                  <span className="font-semibold text-slate-900">
                    {data.visitor_id_source.ephemeral}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Error Codes
              </p>
              {Object.keys(data.error_codes).length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">Kayıt yok.</p>
              ) : (
                <div className="mt-4 grid gap-2 text-sm text-slate-700">
                  {Object.entries(data.error_codes).map(([code, count]) => (
                    <div key={code} className="flex items-center justify-between">
                      <span>{code}</span>
                      <span className="font-semibold text-slate-900">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminBikDiagnostics;
