"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Site = {
  id: string;
  name: string;
  allowedDomains: string[];
};

type SourceBucket = {
  pageviews: number;
  unique: number;
};

type SourceSet = {
  direct: SourceBucket;
  facebook: SourceBucket;
  instagram: SourceBucket;
  googleSearch: SourceBucket;
  googleDiscover: SourceBucket;
  other: SourceBucket;
};

type Summary = {
  totalPageviews: number;
  uniqueVisitors: number;
  trackedReads: number;
  untrackedPageviews: number;
  avgReadSeconds: number;
  avgTrackedReadSeconds: number;
  readBuckets: {
    lt3: number;
    ge10: number;
    ge30: number;
    ge50: number;
  };
  sources: SourceSet;
};

type Row = {
  url: string;
  title: string | null;
  websiteId: string;
  websiteName: string;
  totalPageviews: number;
  uniqueVisitors: number;
  trackedReads: number;
  untrackedPageviews: number;
  avgReadSeconds: number;
  avgTrackedReadSeconds: number;
  readBuckets: {
    lt3: number;
    ge10: number;
    ge30: number;
    ge50: number;
  };
  sources: SourceSet;
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

const sourceCards: { key: keyof SourceSet; label: string }[] = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "googleDiscover", label: "Google Discover" },
  { key: "googleSearch", label: "Google Search" },
  { key: "direct", label: "Direct" },
  { key: "other", label: "Other" },
];

type SortMode = "drag" | "lowDuration" | "volume";

const formatSeconds = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.round(seconds || 0));
  if (safeSeconds < 60) return `${safeSeconds} sn`;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes} dk ${remainder} sn`;
};

const formatPercent = (value: number) =>
  `${Math.round(Math.max(0, value) * 100)}%`;

export default function GeneralAnalysisPage() {
  const router = useRouter();
  const storageKey = "general_analysis_state_v2";
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
  const [onlyArticles, setOnlyArticles] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("drag");
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [selectedSiteId, sites]
  );
  const sortedRows = useMemo(() => {
    const withScores = rows.map((row) => {
      const shortReads = row.untrackedPageviews + row.readBuckets.lt3;
      const durationDragScore =
        Math.max(0, 50 - row.avgReadSeconds) * row.totalPageviews;
      return { row, shortReads, durationDragScore };
    });

    return withScores
      .sort((left, right) => {
        if (sortMode === "volume") {
          return right.row.totalPageviews - left.row.totalPageviews;
        }
        if (sortMode === "lowDuration") {
          return (
            left.row.avgReadSeconds - right.row.avgReadSeconds ||
            right.row.totalPageviews - left.row.totalPageviews
          );
        }
        return (
          right.durationDragScore - left.durationDragScore ||
          right.shortReads - left.shortReads ||
          right.row.totalPageviews - left.row.totalPageviews
        );
      })
      .map(({ row }) => row);
  }, [rows, sortMode]);

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
      panelSections?: string[];
    };

    if (
      parsed.role === "CUSTOMER" &&
      !(
        Array.isArray(parsed.panelSections) &&
        parsed.panelSections.includes("general")
      )
    ) {
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
          selectedSiteId?: string;
          onlyArticles?: boolean;
          sortMode?: SortMode;
        };
        if (saved.startDate) {
          const normalized = normalizeDateInput(saved.startDate);
          if (normalized) setStartDate(normalized);
        }
        if (saved.endDate) {
          const normalized = normalizeDateInput(saved.endDate);
          if (normalized) setEndDate(normalized);
        }
        if (typeof saved.selectedSiteId === "string") {
          setSelectedSiteId(saved.selectedSiteId);
        }
        if (typeof saved.onlyArticles === "boolean") {
          setOnlyArticles(saved.onlyArticles);
        }
        if (
          saved.sortMode === "drag" ||
          saved.sortMode === "lowDuration" ||
          saved.sortMode === "volume"
        ) {
          setSortMode(saved.sortMode);
        }
      } catch {
        // ignore corrupted storage
      }
    }

    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [router]);

  useEffect(() => {
    if (!ready || !user) return;
    const loadSites = async () => {
      const params = new URLSearchParams({
        userId: user.id,
        role: user.role,
      });
      const response = await fetch(`/api/panel/sites?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Site listesi alınamadı.");
        return;
      }

      const nextSites = (payload.sites ?? []) as Site[];
      setSites(nextSites);

      if (nextSites.length === 0) {
        setSelectedSiteId("");
        return;
      }

      const hasSavedSelection = nextSites.some(
        (site) => site.id === selectedSiteId
      );
      if (hasSavedSelection) return;
      setSelectedSiteId(nextSites[0].id);
    };

    void loadSites();
  }, [ready, user, selectedSiteId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!ready) return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        startDate,
        endDate,
        selectedSiteId,
        onlyArticles,
        sortMode,
      })
    );
  }, [ready, startDate, endDate, selectedSiteId, onlyArticles, sortMode]);

  const runAnalysis = async () => {
    if (!selectedSiteId) {
      setError("Lütfen bir site seçin.");
      return;
    }

    setError("");
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        websiteId: selectedSiteId,
        start: startDate,
        end: endDate,
        limit: "100",
        onlyArticles: onlyArticles ? "1" : "0",
      });
      const response = await fetch(
        `/api/panel/general-analysis?${params.toString()}`
      );
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Analiz sırasında hata oluştu.");
        setSummary(null);
        setRows([]);
        return;
      }
      setSummary(payload.summary ?? null);
      setRows(payload.rows ?? []);
    } catch {
      setError("Analiz sırasında hata oluştu.");
      setSummary(null);
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
          <h1 className="text-3xl font-bold text-slate-900">
            Haber Okunma ve Kaynak Analizi
          </h1>
          <p className="text-sm text-slate-500">
            Seçilen müşteri için haber bazlı okunma ve trafik kaynağı
            dağılımını gösterir.
          </p>
        </header>

        <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
          <div className="flex flex-wrap items-end gap-4">
            <label className="min-w-[220px] text-xs font-semibold text-slate-500">
              Site
              <select
                value={selectedSiteId}
                onChange={(event) => setSelectedSiteId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              >
                {sites.length === 0 ? (
                  <option value="">Site bulunamadı</option>
                ) : null}
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>

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

            <label className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={onlyArticles}
                onChange={(event) => setOnlyArticles(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Sadece haber URL&apos;leri
            </label>

            <label className="min-w-[190px] text-xs font-semibold text-slate-500">
              Sıralama
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              >
                <option value="drag">Süreyi düşürenler</option>
                <option value="lowDuration">En düşük süre</option>
                <option value="volume">En çok gösterim</option>
              </select>
            </label>

            <button
              type="button"
              onClick={runAnalysis}
              className="h-10 rounded-2xl bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {isLoading ? "Analiz ediliyor..." : "Analiz Et"}
            </button>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Bu ekran sadece analiz sorgusu çalıştırır. Recompute işlemleri ayrı{" "}
            <span className="font-semibold">Recompute</span> ekranındadır.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {summary ? (
          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                  Site
                </p>
                <div className="mt-3 text-lg font-semibold text-slate-900">
                  {selectedSite?.name ?? "-"}
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Aralık: {startDate} - {endDate}
                </p>
              </div>

              <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                  Toplam Gösterim
                </p>
                <div className="mt-3 text-3xl font-bold text-slate-900">
                  {summary.totalPageviews}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                  Tekil Ziyaretçi
                </p>
                <div className="mt-3 text-3xl font-bold text-slate-900">
                  {summary.uniqueVisitors}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                  İncelenen Haber
                </p>
                <div className="mt-3 text-3xl font-bold text-slate-900">
                  {rows.length}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                  Ort. Okuma
                </p>
                <div className="mt-3 text-3xl font-bold text-slate-900">
                  {formatSeconds(summary.avgReadSeconds)}
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Ölçülen: {formatSeconds(summary.avgTrackedReadSeconds)}
                </p>
              </div>

              <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                  Ping Kapsamı
                </p>
                <div className="mt-3 text-3xl font-bold text-slate-900">
                  {formatPercent(
                    summary.totalPageviews > 0
                      ? summary.trackedReads / summary.totalPageviews
                      : 0
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Eksik/0: {summary.untrackedPageviews}
                </p>
              </div>

              <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                  50 sn Üstü
                </p>
                <div className="mt-3 text-3xl font-bold text-slate-900">
                  {summary.readBuckets.ge50}
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  30 sn üstü: {summary.readBuckets.ge30}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sourceCards.map((card) => (
                <div
                  key={card.key}
                  className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                    {card.label}
                  </p>
                  <div className="mt-3 text-2xl font-bold text-slate-900">
                    {summary.sources[card.key].pageviews}
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Tekil: {summary.sources[card.key].unique}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                Sonuçlar
              </p>
              <h2 className="text-lg font-semibold text-slate-900">
                Haber Bazlı Okunma ve Kaynak Kırılımı
              </h2>
              <p className="text-sm text-slate-500">
                Ortalama süre 0 dahil hesaplanır; ping gelmeyen hızlı çıkışlar
                eksik/0 okuma olarak sayılır.
              </p>
            </div>
            <div className="text-xs text-slate-400">Toplam: {rows.length}</div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1900px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Site</th>
                  <th className="px-3 py-2">Haber</th>
                  <th className="px-3 py-2">URL</th>
                  <th className="px-3 py-2">Toplam Gösterim</th>
                  <th className="px-3 py-2">Tekil</th>
                  <th className="px-3 py-2">Ort. Süre</th>
                  <th className="px-3 py-2">Ölçülen Ort.</th>
                  <th className="px-3 py-2">Eksik/0</th>
                  <th className="px-3 py-2">Kısa Oran</th>
                  <th className="px-3 py-2">50 sn Üstü</th>
                  <th className="px-3 py-2">Facebook</th>
                  <th className="px-3 py-2">Instagram</th>
                  <th className="px-3 py-2">Discover</th>
                  <th className="px-3 py-2">Search</th>
                  <th className="px-3 py-2">Direct</th>
                  <th className="px-3 py-2">Other</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={16}
                      className="px-3 py-6 text-center text-sm text-slate-400"
                    >
                      Sonuç bulunamadı.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => {
                    const shortReads = row.untrackedPageviews + row.readBuckets.lt3;
                    const shortRate =
                      row.totalPageviews > 0
                        ? shortReads / row.totalPageviews
                        : 0;
                    return (
                      <tr
                        key={`${row.websiteId}:${row.url}`}
                        className="border-b border-slate-100 last:border-none"
                      >
                        <td className="px-3 py-2 text-slate-700">
                          {row.websiteName}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {row.title || "[Başlık Yok]"}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {row.url || "[Bilinmeyen]"}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.totalPageviews}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.uniqueVisitors}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          {formatSeconds(row.avgReadSeconds)}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {formatSeconds(row.avgTrackedReadSeconds)}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.untrackedPageviews}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {formatPercent(shortRate)}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.readBuckets.ge50}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.sources.facebook.pageviews}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.sources.instagram.pageviews}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.sources.googleDiscover.pageviews}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.sources.googleSearch.pageviews}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.sources.direct.pageviews}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.sources.other.pageviews}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
