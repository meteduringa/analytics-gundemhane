"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  url: string;
  websiteId: string;
  websiteName: string;
  totalPageviews: number;
  uniqueVisitors: number;
};

const formatDateInput = (date: Date) => date.toISOString().split("T")[0];

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const normalizeDateInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const dotMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (dotMatch) {
    const [, day, month, year] = dotMatch;
    return `${year}-${month}-${day}`;
  }
  const slashMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month}-${day}`;
  }
  return "";
};

export default function GeneralAnalysisPage() {
  const router = useRouter();
  const storageKey = "general_analysis_state_v1";
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{
    id: string;
    email: string;
    name?: string | null;
    role: "ADMIN" | "CUSTOMER";
  } | null>(null);
  const [startDate, setStartDate] = useState(() =>
    formatDateInput(daysAgo(7))
  );
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));
  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

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

    const rawState = window.localStorage.getItem(storageKey);
    if (rawState) {
      try {
        const saved = JSON.parse(rawState) as {
          startDate?: string;
          endDate?: string;
        };
        if (saved.startDate) {
          const normalized = normalizeDateInput(saved.startDate);
          if (normalized) setStartDate(normalized);
        }
        if (saved.endDate) {
          const normalized = normalizeDateInput(saved.endDate);
          if (normalized) setEndDate(normalized);
        }
      } catch {
        // ignore corrupted storage
      }
    }

    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [router]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!ready) return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        startDate,
        endDate,
      })
    );
  }, [ready, startDate, endDate]);

  const runAnalysis = async () => {
    setError("");
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        start: startDate,
        end: endDate,
      });
      const response = await fetch(
        `/api/panel/general-analysis?${params.toString()}`
      );
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Analiz sırasında hata oluştu.");
        setRows([]);
        return;
      }
      setRows(payload.rows ?? []);
    } catch {
      setError("Analiz sırasında hata oluştu.");
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!ready) return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Genel Analiz
          </p>
          <h1 className="text-3xl font-bold text-slate-900">Genel Analiz</h1>
        </header>

        <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-xs font-semibold text-slate-500">
              Başlangıç
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Bitiş
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <button
              type="button"
              onClick={runAnalysis}
              className="h-10 rounded-2xl bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800"
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                Sonuçlar
              </p>
              <h2 className="text-lg font-semibold text-slate-900">
                Sayfa Bazlı Genel Analiz
              </h2>
              <p className="text-sm text-slate-500">
                Seçilen aralık için her sayfanın tekil ve toplam gösterimleri listelenir.
              </p>
            </div>
            <div className="text-xs text-slate-400">Toplam: {rows.length}</div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Site</th>
                  <th className="px-3 py-2">URL</th>
                  <th className="px-3 py-2">Toplam Gösterim</th>
                  <th className="px-3 py-2">Tekil Ziyaretçi</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-6 text-center text-sm text-slate-400"
                    >
                      Sonuç bulunamadı.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={`${row.websiteId}:${row.url}`}
                      className="border-b border-slate-100 last:border-none"
                    >
                      <td className="px-3 py-2 text-slate-700">
                        {row.websiteName}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {row.url || "[Bilinmeyen]"}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {row.totalPageviews}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {row.uniqueVisitors}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
