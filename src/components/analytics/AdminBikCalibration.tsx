"use client";

import { useMemo, useState } from "react";

type Website = { id: string; name: string };

type CalibrationResult = {
  ok: boolean;
  localMetrics?: Record<string, number>;
  bikMetrics?: Record<string, number>;
  resultConfig?: Record<string, number>;
  error?: string;
};

const formatDateInput = (date: Date) => date.toISOString().split("T")[0];

const AdminBikCalibration = ({ websites }: { websites: Website[] }) => {
  const [websiteId, setWebsiteId] = useState(websites[0]?.id ?? "");
  const [date, setDate] = useState(formatDateInput(new Date(Date.now() - 86400000)));
  const [form, setForm] = useState({
    daily_unique_visitors: "",
    daily_direct_unique_visitors: "",
    daily_pageviews: "",
    daily_sessions: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CalibrationResult | null>(null);

  const isReady = useMemo(() => websiteId && date, [websiteId, date]);

  const handleSubmit = async () => {
    if (!isReady) return;
    setLoading(true);
    setResult(null);
    const response = await fetch("/api/bik/calibration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        websiteId,
        date,
        bikMetrics: {
          daily_unique_visitors: Number(form.daily_unique_visitors || 0),
          daily_direct_unique_visitors: Number(form.daily_direct_unique_visitors || 0),
          daily_pageviews: Number(form.daily_pageviews || 0),
          daily_sessions: Number(form.daily_sessions || 0),
        },
      }),
    });
    const payload = await response.json();
    setResult(payload);
    setLoading(false);
  };

  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            BIK Kalibrasyon
          </p>
          <h2 className="text-lg font-semibold text-slate-900">
            D-1 değerleri ile ayar güncelle
          </h2>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isReady || loading}
          className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white disabled:opacity-60"
        >
          {loading ? "Çalışıyor..." : "Kalibre Et"}
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
          BIK Tarih (D-1)
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <label className="text-xs font-semibold text-slate-500">
          Günlük Tekil
          <input
            type="number"
            value={form.daily_unique_visitors}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, daily_unique_visitors: event.target.value }))
            }
            className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Doğrudan Tekil
          <input
            type="number"
            value={form.daily_direct_unique_visitors}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                daily_direct_unique_visitors: event.target.value,
              }))
            }
            className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Günlük Pageview
          <input
            type="number"
            value={form.daily_pageviews}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, daily_pageviews: event.target.value }))
            }
            className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Günlük Session
          <input
            type="number"
            value={form.daily_sessions}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, daily_sessions: event.target.value }))
            }
            className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm"
          />
        </label>
      </div>

      {result && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          {result.error && <p className="text-rose-600">{result.error}</p>}
          {result.ok && (
            <div className="space-y-2">
              <p className="font-semibold text-slate-900">Kalibrasyon Sonucu</p>
              <pre className="whitespace-pre-wrap text-xs">
                {JSON.stringify(
                  {
                    local: result.localMetrics,
                    bik: result.bikMetrics,
                    config: result.resultConfig,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminBikCalibration;
