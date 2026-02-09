"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const formatDateInput = (date: Date) => date.toISOString().split("T")[0];

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

type Summary = {
  totalUnique: number;
  loyalUnique: number;
  totalPageviews: number;
  loyalPageviews: number;
  loyalShare: number;
};

type CategoryRow = {
  category: string;
  loyalPageviews: number;
  loyalUnique: number;
  share: number;
};

type HourRow = {
  hour: number;
  loyalPageviews: number;
  share: number;
};

type ComboRow = {
  category: string;
  hour: number;
  loyalPageviews: number;
  share: number;
};

type Site = {
  id: string;
  name: string;
  allowedDomains: string[];
};

export default function DiscoverAnalysisPage() {
  const router = useRouter();
  const storageKey = "discover_analysis_state_v1";
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{
    id: string;
    email: string;
    name?: string | null;
    role: "ADMIN" | "CUSTOMER";
  } | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [startDate, setStartDate] = useState(() =>
    formatDateInput(daysAgo(7))
  );
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byCategory, setByCategory] = useState<CategoryRow[]>([]);
  const [byHour, setByHour] = useState<HourRow[]>([]);
  const [byCategoryHour, setByCategoryHour] = useState<ComboRow[]>([]);

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
    setUser(parsed);

    const rawState = window.localStorage.getItem(storageKey);
    if (rawState) {
      try {
        const saved = JSON.parse(rawState) as {
          startDate?: string;
          endDate?: string;
        };
        if (saved.startDate) setStartDate(saved.startDate);
        if (saved.endDate) setEndDate(saved.endDate);
      } catch {
        // ignore
      }
    }

    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [router]);

  useEffect(() => {
    if (!ready || !user) return;
    const loadSite = async () => {
      const params = new URLSearchParams({ userId: user.id, role: user.role });
      const response = await fetch(`/api/panel/sites?${params.toString()}`);
      const payload = await response.json();
      if (response.ok && payload.sites?.length) {
        setSite(payload.sites[0]);
      }
    };
    void loadSite();
  }, [ready, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!ready) return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ startDate, endDate })
    );
  }, [ready, startDate, endDate]);

  const runAnalysis = async () => {
    if (!site) return;
    setError("");
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        websiteId: site.id,
        start: startDate,
        end: endDate,
      });
      const response = await fetch(`/api/panel/discover?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Analiz sırasında hata oluştu.");
        setSummary(null);
        setByCategory([]);
        setByHour([]);
        setByCategoryHour([]);
        return;
      }
      setSummary(payload.summary ?? null);
      setByCategory(payload.byCategory ?? []);
      setByHour(payload.byHour ?? []);
      setByCategoryHour(payload.byCategoryHour ?? []);
    } catch {
      setError("Analiz sırasında hata oluştu.");
    } finally {
      setIsLoading(false);
    }
  };

  const topCombos = useMemo(() => byCategoryHour.slice(0, 20), [byCategoryHour]);

  if (!ready) return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Keşfet Analizi
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            Google Discover / Keşfet
          </h1>
          {site && (
            <p className="text-sm text-slate-500">
              Site: <span className="font-semibold">{site.name}</span>
            </p>
          )}
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

        {summary && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-xs font-semibold text-emerald-700">Sadık Oran</p>
              <p className="text-2xl font-bold text-emerald-900">%{summary.loyalShare}</p>
              <p className="text-xs text-emerald-700">
                {summary.loyalUnique} / {summary.totalUnique} tekil
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold text-slate-500">Sadık Tekil</p>
              <p className="text-2xl font-bold text-slate-900">{summary.loyalUnique}</p>
              <p className="text-xs text-slate-500">Son 7 gün sadık okuyucu</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold text-slate-500">Sadık Pageview</p>
              <p className="text-2xl font-bold text-slate-900">{summary.loyalPageviews}</p>
              <p className="text-xs text-slate-500">Sadık okuma sayısı</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold text-slate-500">Toplam Pageview</p>
              <p className="text-2xl font-bold text-slate-900">{summary.totalPageviews}</p>
              <p className="text-xs text-slate-500">Seçilen aralık</p>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                Sadık Okuyucu Kategorileri
              </p>
              <h2 className="text-lg font-semibold text-slate-900">
                En Çok Okunan Kategoriler
              </h2>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Kategori</th>
                    <th className="px-3 py-2">Sadık PV</th>
                    <th className="px-3 py-2">Sadık Tekil</th>
                    <th className="px-3 py-2">Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">
                        Sonuç bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    byCategory.map((row) => (
                      <tr key={row.category} className="border-b border-slate-100 last:border-none">
                        <td className="px-3 py-2 font-medium text-slate-800">{row.category}</td>
                        <td className="px-3 py-2 text-slate-700">{row.loyalPageviews}</td>
                        <td className="px-3 py-2 text-slate-700">{row.loyalUnique}</td>
                        <td className="px-3 py-2 text-slate-700">%{row.share}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                Sadık Okuyucu Saatleri
              </p>
              <h2 className="text-lg font-semibold text-slate-900">
                En Aktif Saatler
              </h2>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Saat</th>
                    <th className="px-3 py-2">Sadık PV</th>
                    <th className="px-3 py-2">Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {byHour.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-400">
                        Sonuç bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    byHour.map((row) => (
                      <tr key={row.hour} className="border-b border-slate-100 last:border-none">
                        <td className="px-3 py-2 font-medium text-slate-800">{row.hour}:00</td>
                        <td className="px-3 py-2 text-slate-700">{row.loyalPageviews}</td>
                        <td className="px-3 py-2 text-slate-700">%{row.share}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              Kombinasyonlar
            </p>
            <h2 className="text-lg font-semibold text-slate-900">
              Kategori + Saat (Sadık Okuyucu)
            </h2>
            <p className="text-sm text-slate-500">
              En güçlü 20 kombinasyon gösterilir.
            </p>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Kategori</th>
                  <th className="px-3 py-2">Saat</th>
                  <th className="px-3 py-2">Sadık PV</th>
                  <th className="px-3 py-2">Pay</th>
                </tr>
              </thead>
              <tbody>
                {topCombos.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">
                      Sonuç bulunamadı.
                    </td>
                  </tr>
                ) : (
                  topCombos.map((row, index) => (
                    <tr key={`${row.category}-${row.hour}-${index}`} className="border-b border-slate-100 last:border-none">
                      <td className="px-3 py-2 font-medium text-slate-800">{row.category}</td>
                      <td className="px-3 py-2 text-slate-700">{row.hour}:00</td>
                      <td className="px-3 py-2 text-slate-700">{row.loyalPageviews}</td>
                      <td className="px-3 py-2 text-slate-700">%{row.share}</td>
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
