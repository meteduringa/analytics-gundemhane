"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Site = {
  id: string;
  name: string;
  allowedDomains: string[];
};

type SourceRow = {
  sourceWebsiteId: string;
  totalSessions: number;
  totalVisitors: number;
  longSessions: Record<number, number>;
  longVisitors: Record<number, number>;
  longShare: Record<number, number>;
};

type BreakdownRow = {
  label: string;
  totalSessions: number;
  longSessions: Record<number, number>;
  longShare: Record<number, number>;
};

type LandingItem = {
  id: string;
  label: string;
  urlInput: string;
  normalizedUrl: string;
};

type LandingResult = {
  sources: SourceRow[];
  device: BreakdownRow[];
  browser: BreakdownRow[];
  combos: BreakdownRow[];
};

const formatDateInput = (date: Date) => date.toISOString().split("T")[0];

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const normalizeLandingInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    try {
      const parsed = new URL(trimmed, "https://example.com");
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return "";
    }
  }
};

export default function SourceAnalysisPage() {
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
  const [startDate, setStartDate] = useState(() =>
    formatDateInput(daysAgo(7))
  );
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));
  const [categoryName, setCategoryName] = useState("");
  const [popcentOnly, setPopcentOnly] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [landingInput, setLandingInput] = useState("");
  const [landingItems, setLandingItems] = useState<LandingItem[]>([]);
  const [landingResults, setLandingResults] = useState<
    Record<string, LandingResult>
  >({});
  const [error, setError] = useState("");
  const [copiedShort, setCopiedShort] = useState(false);
  const [copiedLong, setCopiedLong] = useState(false);

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

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId),
    [selectedSiteId, sites]
  );

  const handleAddLanding = () => {
    const normalizedLanding = normalizeLandingInput(landingInput);
    if (!landingInput.trim()) {
      setError("Haber URL zorunludur.");
      return;
    }
    if (!normalizedLanding) {
      setError("Haber URL geçersiz.");
      return;
    }
    setError("");
    const item: LandingItem = {
      id: crypto.randomUUID(),
      label: categoryName.trim(),
      urlInput: landingInput.trim(),
      normalizedUrl: normalizedLanding,
    };
    setLandingItems((prev) => [item, ...prev]);
    setLandingInput("");
  };

  const handleRemoveLanding = (id: string) => {
    setLandingItems((prev) => prev.filter((item) => item.id !== id));
    setLandingResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const loadSources = async () => {
    if (!selectedSiteId) return;
    setIsLoading(true);
    setError("");
    try {
      let itemsToAnalyze = landingItems;
      if (!itemsToAnalyze.length && landingInput.trim()) {
        const normalizedLanding = normalizeLandingInput(landingInput);
        if (!normalizedLanding) {
          throw new Error("Haber URL geçersiz.");
        }
        const item: LandingItem = {
          id: crypto.randomUUID(),
          label: categoryName.trim(),
          urlInput: landingInput.trim(),
          normalizedUrl: normalizedLanding,
        };
        itemsToAnalyze = [item];
        setLandingItems((prev) => [item, ...prev]);
        setLandingInput("");
      }
      if (!itemsToAnalyze.length) {
        throw new Error("En az bir haber URL ekleyin.");
      }

      const results: Record<string, LandingResult> = {};

      await Promise.all(
        itemsToAnalyze.map(async (item) => {
          const params = new URLSearchParams({
            websiteId: selectedSiteId,
            start: startDate,
            end: endDate,
            landingUrl: item.normalizedUrl,
            popcentOnly: popcentOnly ? "1" : "0",
          });

          const response = await fetch(
            `/api/panel/source-analysis?${params.toString()}`
          );
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error ?? "Analiz başarısız.");
          }

          const breakdownResponse = await fetch(
            `/api/panel/source-breakdown?${params.toString()}`
          );
          const breakdownPayload = await breakdownResponse.json();

          results[item.id] = {
            sources: payload.sources ?? [],
            device: breakdownPayload.device ?? [],
            browser: breakdownPayload.browser ?? [],
            combos: breakdownPayload.combos ?? [],
          };
        })
      );

      setLandingResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analiz başarısız.");
    } finally {
      setIsLoading(false);
    }
  };

  const thresholds = [1, 3, 5, 10];

  const handleCopy = async (threshold: number, list: SourceRow[]) => {
    const filtered = list.filter(
      (row) => (row.longSessions?.[threshold] ?? 0) > 0
    );
    if (!filtered.length) return;
    const value = filtered.map((row) => row.sourceWebsiteId).join(", ");
    try {
      await navigator.clipboard.writeText(value);
      if (threshold === 1) {
        setCopiedShort(true);
        window.setTimeout(() => setCopiedShort(false), 1500);
      } else if (threshold === 3) {
        setCopiedLong(true);
        window.setTimeout(() => setCopiedLong(false), 1500);
      }
    } catch {
      if (threshold === 1) {
        setCopiedShort(false);
      } else if (threshold === 3) {
        setCopiedLong(false);
      }
    }
  };

  if (!ready) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Kaynak Analizi
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            Popcent Trafik Kaynağı Analizi
          </h1>
          {selectedSite && (
            <p className="text-sm text-slate-500">
              Seçili site:{" "}
              <span className="font-semibold">{selectedSite.name}</span>
            </p>
          )}
          {categoryName.trim() && (
            <p className="text-sm text-slate-500">
              Kategori etiketi:{" "}
              <span className="font-semibold">{categoryName.trim()}</span>
            </p>
          )}
        </header>

        <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm shadow-slate-900/5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-500">
              Site Seçimi
              <select
                value={selectedSiteId}
                onChange={(event) => setSelectedSiteId(event.target.value)}
                className="mt-2 w-full min-w-[220px] rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
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
              Kategori Etiketi (manuel)
              <input
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="Örn: Oyun/İndirme"
                className="mt-2 w-full min-w-[220px] rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Başlangıç
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="mt-2 rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Bitiş
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="mt-2 rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Haber URL (ekle)
              <input
                value={landingInput}
                onChange={(event) => setLandingInput(event.target.value)}
                placeholder="https://site.com/haber/ornek-baslik"
                className="mt-2 w-full min-w-[220px] rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <button
              type="button"
              onClick={handleAddLanding}
              className="mb-1 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Ekle
            </button>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <input
                type="checkbox"
                checked={popcentOnly}
                onChange={(event) => setPopcentOnly(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-700"
              />
              Sadece Popcent
            </label>

            <button
              type="button"
              onClick={loadSources}
              className="mb-1 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              disabled={isLoading}
            >
              {isLoading ? "Analiz ediliyor..." : "Analiz Et"}
            </button>
          </div>
        </div>

        {landingItems.length > 0 && (
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm shadow-slate-900/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                  Eklenen Haberler
                </p>
                <p className="text-xs text-slate-500">
                  Analiz tüm eklenen haberler için aynı anda yapılır.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {landingItems.length} adet
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {landingItems.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                >
                  <div>
                    <p className="font-semibold text-slate-800">
                      {item.urlInput}
                    </p>
                    <p className="text-xs text-slate-500">
                      Normalized: {item.normalizedUrl}
                      {item.label ? ` · Etiket: ${item.label}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveLanding(item.id)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                  >
                    Kaldır
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              Sonuçlar
            </p>
            <h2 className="text-lg font-semibold text-slate-900">
              Popcent Kaynak Analizi (Haber Bazlı)
            </h2>
            <p className="text-xs text-slate-500">
              {popcentOnly
                ? "Sadece Popcent kaynaklı (referrer veya source id bulunan) trafik listelenir."
                : "Tüm trafik listelenir. Kaynak yoksa [DIRECT] olarak görünür."}
            </p>
          </div>

          {landingItems.length === 0 && (
            <div className="mt-6 text-sm text-slate-500">
              Analiz için en az bir haber URL ekleyin.
            </div>
          )}

          {landingItems.map((item) => {
            const result = landingResults[item.id];
            const sources = result?.sources ?? [];
            const totalSessions = sources.reduce(
              (sum, row) => sum + (row.totalSessions ?? 0),
              0
            );
            const totalVisitors = sources.reduce(
              (sum, row) => sum + (row.totalVisitors ?? 0),
              0
            );
            const thresholdStats = thresholds.map((threshold) => {
              const longSessions = sources.reduce(
                (sum, row) => sum + (row.longSessions?.[threshold] ?? 0),
                0
              );
              const longVisitors = sources.reduce(
                (sum, row) => sum + (row.longVisitors?.[threshold] ?? 0),
                0
              );
              const share = totalSessions
                ? Math.round((longSessions / totalSessions) * 100)
                : 0;
              return { threshold, longSessions, longVisitors, share };
            });

            return (
              <div key={item.id} className="mt-6 space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Haber
                      </p>
                      <h3 className="text-sm font-semibold text-slate-800">
                        {item.urlInput}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Etiket: {item.label || "—"}
                      </p>
                    </div>
                    <div className="text-xs text-slate-500">
                      Toplam Session:{" "}
                      <span className="font-semibold text-slate-700">
                        {totalSessions}
                      </span>{" "}
                      · Toplam Ziyaretçi:{" "}
                      <span className="font-semibold text-slate-700">
                        {totalVisitors}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    {thresholdStats.map((stat) => (
                      <div
                        key={stat.threshold}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600"
                      >
                        <p className="text-[11px] font-semibold uppercase text-slate-400">
                          {stat.threshold}+ sn
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {stat.share}%
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Session: {stat.longSessions} · Ziyaretçi:{" "}
                          {stat.longVisitors}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                  {thresholds.map((threshold) => {
                    const list = sources
                      .filter(
                        (row) => (row.longSessions?.[threshold] ?? 0) > 0
                      )
                      .sort(
                        (a, b) =>
                          (b.longSessions?.[threshold] ?? 0) -
                          (a.longSessions?.[threshold] ?? 0)
                      );
                    const copied =
                      (threshold === 1 && copiedShort) ||
                      (threshold === 3 && copiedLong);
                    return (
                      <div
                        key={`${item.id}-${threshold}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                              {threshold}+ Saniye
                            </p>
                            <h3 className="text-sm font-semibold text-slate-800">
                              Beyaz Liste Adayları
                            </h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopy(threshold, sources)}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                            disabled={!list.length}
                          >
                            {copied ? "Kopyalandı" : "ID'leri Kopyala"}
                          </button>
                        </div>

                        <div className="mt-4 overflow-x-auto">
                          <table className="min-w-full text-left text-xs text-slate-600">
                            <thead className="border-b border-slate-200 bg-white text-[11px] uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-3 py-2">Website ID</th>
                                <th className="px-3 py-2">Session</th>
                                <th className="px-3 py-2">Ziyaretçi</th>
                                <th className="px-3 py-2">Oran %</th>
                              </tr>
                            </thead>
                            <tbody>
                              {list.length === 0 && (
                                <tr>
                                  <td
                                    colSpan={4}
                                    className="px-3 py-6 text-center text-slate-400"
                                  >
                                    Sonuç bulunamadı.
                                  </td>
                                </tr>
                              )}
                              {list.map((row) => (
                                <tr
                                  key={`${item.id}-${threshold}-${row.sourceWebsiteId}`}
                                  className="border-b border-slate-100"
                                >
                                  <td className="px-3 py-2 font-semibold text-slate-800">
                                    {row.sourceWebsiteId}
                                  </td>
                                  <td className="px-3 py-2">
                                    {row.longSessions?.[threshold] ?? 0}
                                  </td>
                                  <td className="px-3 py-2">
                                    {row.longVisitors?.[threshold] ?? 0}
                                  </td>
                                  <td className="px-3 py-2">
                                    {row.longShare?.[threshold] ?? 0}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-800">
                      Cihaz Kırılımı
                    </h3>
                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-full text-left text-xs text-slate-600">
                        <thead className="border-b border-slate-200 bg-white text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Cihaz</th>
                            <th className="px-3 py-2">Session</th>
                            <th className="px-3 py-2">1+ sn %</th>
                            <th className="px-3 py-2">3+ sn %</th>
                            <th className="px-3 py-2">5+ sn %</th>
                            <th className="px-3 py-2">10+ sn %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(result?.device ?? []).length === 0 && (
                            <tr>
                              <td
                                colSpan={6}
                                className="px-3 py-6 text-center text-slate-400"
                              >
                                Sonuç bulunamadı.
                              </td>
                            </tr>
                          )}
                          {(result?.device ?? []).map((row) => (
                            <tr
                              key={`${item.id}-device-${row.label}`}
                              className="border-b border-slate-100"
                            >
                              <td className="px-3 py-2 font-semibold text-slate-800">
                                {row.label}
                              </td>
                              <td className="px-3 py-2">{row.totalSessions}</td>
                              <td className="px-3 py-2">
                                {row.longShare?.[1] ?? 0}
                              </td>
                              <td className="px-3 py-2">
                                {row.longShare?.[3] ?? 0}
                              </td>
                              <td className="px-3 py-2">
                                {row.longShare?.[5] ?? 0}
                              </td>
                              <td className="px-3 py-2">
                                {row.longShare?.[10] ?? 0}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-800">
                      Tarayıcı Kırılımı
                    </h3>
                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-full text-left text-xs text-slate-600">
                        <thead className="border-b border-slate-200 bg-white text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Tarayıcı</th>
                            <th className="px-3 py-2">Session</th>
                            <th className="px-3 py-2">1+ sn %</th>
                            <th className="px-3 py-2">3+ sn %</th>
                            <th className="px-3 py-2">5+ sn %</th>
                            <th className="px-3 py-2">10+ sn %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(result?.browser ?? []).length === 0 && (
                            <tr>
                              <td
                                colSpan={6}
                                className="px-3 py-6 text-center text-slate-400"
                              >
                                Sonuç bulunamadı.
                              </td>
                            </tr>
                          )}
                          {(result?.browser ?? []).map((row) => (
                            <tr
                              key={`${item.id}-browser-${row.label}`}
                              className="border-b border-slate-100"
                            >
                              <td className="px-3 py-2 font-semibold text-slate-800">
                                {row.label}
                              </td>
                              <td className="px-3 py-2">{row.totalSessions}</td>
                              <td className="px-3 py-2">
                                {row.longShare?.[1] ?? 0}
                              </td>
                              <td className="px-3 py-2">
                                {row.longShare?.[3] ?? 0}
                              </td>
                              <td className="px-3 py-2">
                                {row.longShare?.[5] ?? 0}
                              </td>
                              <td className="px-3 py-2">
                                {row.longShare?.[10] ?? 0}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Kombinasyon (Cihaz + Tarayıcı)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Etiket: {item.label || "—"}
                  </p>
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-xs text-slate-600">
                      <thead className="border-b border-slate-200 bg-white text-[11px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Kombinasyon</th>
                          <th className="px-3 py-2">Session</th>
                          <th className="px-3 py-2">1+ sn %</th>
                          <th className="px-3 py-2">3+ sn %</th>
                          <th className="px-3 py-2">5+ sn %</th>
                          <th className="px-3 py-2">10+ sn %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(result?.combos ?? []).length === 0 && (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-3 py-6 text-center text-slate-400"
                            >
                              Sonuç bulunamadı.
                            </td>
                          </tr>
                        )}
                        {(result?.combos ?? []).map((row) => (
                          <tr
                            key={`${item.id}-combo-${row.label}`}
                            className="border-b border-slate-100"
                          >
                            <td className="px-3 py-2 font-semibold text-slate-800">
                              {row.label.replace("|", " + ")}
                            </td>
                            <td className="px-3 py-2">{row.totalSessions}</td>
                            <td className="px-3 py-2">
                              {row.longShare?.[1] ?? 0}
                            </td>
                            <td className="px-3 py-2">
                              {row.longShare?.[3] ?? 0}
                            </td>
                            <td className="px-3 py-2">
                              {row.longShare?.[5] ?? 0}
                            </td>
                            <td className="px-3 py-2">
                              {row.longShare?.[10] ?? 0}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              Kırılım
            </p>
            <h2 className="text-lg font-semibold text-slate-900">
              Cihaz ve Tarayıcı Performansı
            </h2>
            <p className="text-xs text-slate-500">
              1+, 3+, 5+ ve 10+ saniye eşiğine göre yüzde dağılımı gösterir.
            </p>
          </div>

          <div className="mt-6 text-sm text-slate-500">
            Kırılımlar haber bazlı olarak yukarıda listelenir.
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
