"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useEffect, useMemo, useRef, useState } from "react";
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
  longSessions: Record<string, number>;
  longVisitors: Record<string, number>;
  longShare: Record<string, number>;
};

type BreakdownRow = {
  label: string;
  totalSessions: number;
  longSessions: Record<string, number>;
  longShare: Record<string, number>;
};

type LandingItem = {
  id: string;
  label: string;
  urlInput: string;
  normalizedUrl: string;
  report?: {
    popcentClicks?: string;
    costPerClick?: string;
    spendTotal?: string;
  };
};

type LandingResult = {
  sources: SourceRow[];
  device: BreakdownRow[];
  browser: BreakdownRow[];
  combos: BreakdownRow[];
  network: BreakdownRow[];
  summary?: {
    totalSessions: number;
    totalVisitors: number;
    longSessions: Record<string, number>;
    longVisitors: Record<string, number>;
    longShare: Record<string, number>;
  } | null;
};

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const normalizeLandingInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = trimmed.startsWith("http")
      ? new URL(trimmed)
      : new URL(trimmed, "https://example.com");
    return parsed.pathname || "/";
  } catch {
    const withoutQuery = trimmed.split("?")[0].split("#")[0].trim();
    if (!withoutQuery) return "";
    return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  }
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

export default function SourceAnalysisPage() {
  const router = useRouter();
  const storageKey = "source_analysis_state_v1";
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
  const [showBestComboOnly, setShowBestComboOnly] = useState(true);
  const [pcTargetUrl, setPcTargetUrl] = useState("");
  const [pcCategory, setPcCategory] = useState("");
  const [pcLink, setPcLink] = useState("");
  const [pcCopied, setPcCopied] = useState(false);
  const [pcAutoAdd, setPcAutoAdd] = useState(true);
  const [error, setError] = useState("");
  const [copiedShort, setCopiedShort] = useState(false);
  const [copiedLong, setCopiedLong] = useState(false);
  const analysisRequestRef = useRef(0);

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
          selectedSiteId?: string;
          startDate?: string;
          endDate?: string;
          categoryName?: string;
          popcentOnly?: boolean;
          landingItemsBySite?: Record<string, LandingItem[]>;
          showBestComboOnly?: boolean;
          pcTargetUrl?: string;
          pcCategory?: string;
          pcAutoAdd?: boolean;
        };
        if (saved.selectedSiteId) setSelectedSiteId(saved.selectedSiteId);
        if (saved.startDate) {
          const normalized = normalizeDateInput(saved.startDate);
          if (normalized) setStartDate(normalized);
        }
        if (saved.endDate) {
          const normalized = normalizeDateInput(saved.endDate);
          if (normalized) setEndDate(normalized);
        }
        if (typeof saved.categoryName === "string")
          setCategoryName(saved.categoryName);
        if (typeof saved.popcentOnly === "boolean")
          setPopcentOnly(saved.popcentOnly);
        if (typeof saved.showBestComboOnly === "boolean")
          setShowBestComboOnly(saved.showBestComboOnly);
        if (typeof saved.pcTargetUrl === "string")
          setPcTargetUrl(saved.pcTargetUrl);
        if (typeof saved.pcCategory === "string")
          setPcCategory(saved.pcCategory);
        if (typeof saved.pcAutoAdd === "boolean")
          setPcAutoAdd(saved.pcAutoAdd);
        if (saved.selectedSiteId && saved.landingItemsBySite) {
          const items = saved.landingItemsBySite[saved.selectedSiteId] ?? [];
          setLandingItems(items);
        }
      } catch {
        // ignore corrupted storage
      }
    }
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    if (!selectedSiteId) return;
    if (!landingItems.length) return;
    if (Object.keys(landingResults).length) return;
    void loadSources();
  }, [ready, selectedSiteId, landingItems, landingResults]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const existingRaw = window.localStorage.getItem(storageKey);
    let landingItemsBySite: Record<string, LandingItem[]> = {};
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw) as {
          landingItemsBySite?: Record<string, LandingItem[]>;
        };
        landingItemsBySite = existing.landingItemsBySite ?? {};
      } catch {
        landingItemsBySite = {};
      }
    }
    if (selectedSiteId) {
      landingItemsBySite[selectedSiteId] = landingItems;
    }

    const payload = {
      selectedSiteId,
      startDate,
      endDate,
      categoryName,
      popcentOnly,
      landingItemsBySite,
      showBestComboOnly,
      pcTargetUrl,
      pcCategory,
      pcAutoAdd,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [
    selectedSiteId,
    startDate,
    endDate,
    categoryName,
    popcentOnly,
    landingItems,
    showBestComboOnly,
    pcTargetUrl,
    pcCategory,
    pcAutoAdd,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedSiteId) return;
    const rawState = window.localStorage.getItem(storageKey);
    if (!rawState) return;
    try {
      const saved = JSON.parse(rawState) as {
        landingItemsBySite?: Record<string, LandingItem[]>;
      };
      const items = saved.landingItemsBySite?.[selectedSiteId] ?? [];
      setLandingItems(items);
      setLandingResults({});
    } catch {
      // ignore
    }
  }, [selectedSiteId]);

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
      report: {
        popcentClicks: "",
        costPerClick: "",
        spendTotal: "",
      },
    };
    setLandingItems((prev) => [item, ...prev]);
    setLandingInput("");
  };

  const handleBuildPcLink = () => {
    if (!pcTargetUrl.trim()) {
      setError("Popcent hedef URL zorunludur.");
      return;
    }
    try {
      const parsed = new URL(pcTargetUrl.trim());
      const base = `${window.location.origin}/api/relay`;
      const params = new URLSearchParams({
        target: parsed.toString(),
      });
      if (pcCategory.trim()) {
        params.set("cat", pcCategory.trim());
      }
      const link = `${base}?${params.toString()}`;
      setPcLink(link);
      setError("");
      if (pcAutoAdd) {
        const normalizedLanding = normalizeLandingInput(parsed.toString());
        if (normalizedLanding) {
          const item: LandingItem = {
            id: crypto.randomUUID(),
            label: pcCategory.trim(),
            urlInput: parsed.toString(),
            normalizedUrl: normalizedLanding,
            report: {
              popcentClicks: "",
              costPerClick: "",
              spendTotal: "",
            },
          };
          setLandingItems((prev) => [item, ...prev]);
        }
      }
    } catch {
      setError("Popcent hedef URL geçersiz.");
    }
  };

  const handleCopyPcLink = async () => {
    if (!pcLink) return;
    try {
      await navigator.clipboard.writeText(pcLink);
      setPcCopied(true);
      window.setTimeout(() => setPcCopied(false), 1500);
    } catch {
      setPcCopied(false);
    }
  };

  const handleRemoveLanding = (id: string) => {
    setLandingItems((prev) => prev.filter((item) => item.id !== id));
    setLandingResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const updateLandingReport = (
    id: string,
    patch: Partial<NonNullable<LandingItem["report"]>>
  ) => {
    setLandingItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, report: { ...(item.report ?? {}), ...patch } }
          : item
      )
    );
  };

  const loadSources = async () => {
    if (!selectedSiteId) return;
    const requestId = ++analysisRequestRef.current;
    setIsLoading(true);
    setError("");
    try {
      const normalizeApiError = (value: unknown) => {
        const raw =
          typeof value === "string" && value.trim()
            ? value.trim()
            : "Analiz başarısız.";
        const lower = raw.toLowerCase();
        if (
          lower.includes("expected pattern") ||
          lower.includes("did not match the expected pattern")
        ) {
          return "Haber URL geçersiz.";
        }
        return raw;
      };

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
          report: {
            popcentClicks: "",
            costPerClick: "",
            spendTotal: "",
          },
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

          const [sourceResponse, breakdownResponse] = await Promise.all([
            fetch(`/api/panel/source-analysis?${params.toString()}`),
            fetch(`/api/panel/source-breakdown?${params.toString()}`),
          ]);

          const payload = await sourceResponse.json();
          const breakdownPayload = await breakdownResponse.json();

          if (!sourceResponse.ok) {
            throw new Error(normalizeApiError(payload?.error));
          }
          if (!breakdownResponse.ok) {
            throw new Error(normalizeApiError(breakdownPayload?.error));
          }

          results[item.id] = {
            sources: payload.sources ?? [],
            summary: payload.summary ?? null,
            device: breakdownPayload.device ?? [],
            browser: breakdownPayload.browser ?? [],
            combos: breakdownPayload.combos ?? [],
            network: breakdownPayload.network ?? [],
          };
        })
      );

      if (analysisRequestRef.current === requestId) {
        setLandingResults(results);
      }
    } catch (err) {
      if (analysisRequestRef.current !== requestId) {
        return;
      }
      const rawMessage = err instanceof Error ? err.message : "Analiz başarısız.";
      const lower = rawMessage.toLowerCase();
      if (
        lower.includes("expected pattern") ||
        lower.includes("did not match the expected pattern")
      ) {
        setError("Haber URL geçersiz.");
      } else {
        setError(rawMessage);
      }
    } finally {
      if (analysisRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  };

  const thresholds = [
    { key: "lt1", label: "1 sn altı" },
    { key: "lt3", label: "3 sn altı" },
    { key: "ge5", label: "5+ sn" },
    { key: "ge10", label: "10+ sn" },
  ];

  const handleCopy = async (thresholdKey: string, list: SourceRow[]) => {
    const filtered = list.filter(
      (row) => (row.longSessions?.[thresholdKey] ?? 0) > 0
    );
    if (!filtered.length) return;
    const value = filtered.map((row) => row.sourceWebsiteId).join(", ");
    try {
      await navigator.clipboard.writeText(value);
      if (thresholdKey === "lt1") {
        setCopiedShort(true);
        window.setTimeout(() => setCopiedShort(false), 1500);
      } else if (thresholdKey === "lt3") {
        setCopiedLong(true);
        window.setTimeout(() => setCopiedLong(false), 1500);
      }
    } catch {
      if (thresholdKey === "lt1") {
        setCopiedShort(false);
      } else if (thresholdKey === "lt3") {
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
              Popcent Link
            </p>
            <h2 className="text-lg font-semibold text-slate-900">
              Popcent Link Oluşturucu
            </h2>
            <p className="text-xs text-slate-500">
              Popcent’e vereceğin linki otomatik üretir. Bu link Popcent
              trafiğini garanti şekilde işaretler.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-500">
              Hedef URL
              <input
                value={pcTargetUrl}
                onChange={(event) => setPcTargetUrl(event.target.value)}
                placeholder="https://www.gercekfethiye.com/..."
                className="mt-2 w-full min-w-[260px] rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Kategori (opsiyonel)
              <input
                value={pcCategory}
                onChange={(event) => setPcCategory(event.target.value)}
                placeholder="Örn: genel"
                className="mt-2 w-full min-w-[180px] rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <input
                type="checkbox"
                checked={pcAutoAdd}
                onChange={(event) => setPcAutoAdd(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-700"
              />
              Link oluşturunca analize ekle
            </label>

            <button
              type="button"
              onClick={handleBuildPcLink}
              className="mb-1 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Link Oluştur
            </button>
          </div>

          {pcLink && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
              <span className="break-all">{pcLink}</span>
              <button
                type="button"
                onClick={handleCopyPcLink}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
              >
                {pcCopied ? "Kopyalandı" : "Kopyala"}
              </button>
            </div>
          )}
        </section>

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
            const summary = result?.summary;
            const totalSessions =
              summary?.totalSessions ??
              sources.reduce((sum, row) => sum + (row.totalSessions ?? 0), 0);
            const totalVisitors =
              summary?.totalVisitors ??
              sources.reduce((sum, row) => sum + (row.totalVisitors ?? 0), 0);
            const rawClicks = item.report?.popcentClicks ?? "";
            const rawCpc = item.report?.costPerClick ?? "";
            const rawSpend = item.report?.spendTotal ?? "";
            const popcentClicks = Number(rawClicks) || 0;
            const costPerClick = Number(rawCpc) || 0;
            const spendTotal = Number(rawSpend) || 0;
            const computedSpend =
              spendTotal > 0 ? spendTotal : costPerClick * popcentClicks;
            const reflectedSessions = totalSessions;
            const reflectedUniques = totalVisitors;
            const reflectedRate = popcentClicks
              ? Math.round((reflectedSessions / popcentClicks) * 100)
              : 0;
            const uniqueRate = popcentClicks
              ? Math.round((reflectedUniques / popcentClicks) * 100)
              : 0;
            const costPerReflected = reflectedSessions
              ? (computedSpend / reflectedSessions).toFixed(2)
              : "0.00";
            const costPerUnique = reflectedUniques
              ? (computedSpend / reflectedUniques).toFixed(2)
              : "0.00";
            const thresholdStats = thresholds.map((threshold) => {
              const longSessions =
                summary?.longSessions?.[threshold.key] ??
                sources.reduce(
                  (sum, row) => sum + (row.longSessions?.[threshold.key] ?? 0),
                  0
                );
              const longVisitors =
                summary?.longVisitors?.[threshold.key] ??
                sources.reduce(
                  (sum, row) => sum + (row.longVisitors?.[threshold.key] ?? 0),
                  0
                );
              const share =
                summary?.longShare?.[threshold.key] ??
                (totalSessions
                  ? Math.round((longSessions / totalSessions) * 100)
                  : 0);
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
                        key={stat.threshold.key}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600"
                      >
                        <p className="text-[11px] font-semibold uppercase text-slate-400">
                          {stat.threshold.label}
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

                <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Rapor
                      </p>
                      <h3 className="text-sm font-semibold text-slate-800">
                        Popcent Harcama ve Dönüşüm
                      </h3>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <label className="text-xs font-semibold text-slate-500">
                      Popcent Gönderilen Tıklama
                      <input
                        value={rawClicks}
                        onChange={(event) =>
                          updateLandingReport(item.id, {
                            popcentClicks: event.target.value,
                          })
                        }
                        placeholder="Örn: 1200"
                        className="mt-2 w-full min-w-[180px] rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                      />
                    </label>

                    <label className="text-xs font-semibold text-slate-500">
                      Tıklama Başı Maliyet
                      <input
                        value={rawCpc}
                        onChange={(event) =>
                          updateLandingReport(item.id, {
                            costPerClick: event.target.value,
                          })
                        }
                        placeholder="Örn: 0.07"
                        className="mt-2 w-full min-w-[160px] rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                      />
                    </label>

                    <label className="text-xs font-semibold text-slate-500">
                      Toplam Bütçe
                      <input
                        value={rawSpend}
                        onChange={(event) =>
                          updateLandingReport(item.id, {
                            spendTotal: event.target.value,
                          })
                        }
                        placeholder="Örn: 85"
                        className="mt-2 w-full min-w-[160px] rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                      />
                    </label>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                      <p className="text-[11px] font-semibold uppercase text-slate-400">
                        Popcent Gönderilen
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {popcentClicks}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                      <p className="text-[11px] font-semibold uppercase text-slate-400">
                        Siteye Yansıyan
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {reflectedSessions}
                      </p>
                      <p className="text-xs text-slate-500">
                        %{reflectedRate}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                      <p className="text-[11px] font-semibold uppercase text-slate-400">
                        Tekil Kullanıcı
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {reflectedUniques}
                      </p>
                      <p className="text-xs text-slate-500">
                        %{uniqueRate}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                      <p className="text-[11px] font-semibold uppercase text-slate-400">
                        Toplam Bütçe
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {computedSpend.toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                      <p className="text-[11px] font-semibold uppercase text-slate-400">
                        Tekil Maliyeti
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {costPerUnique}
                      </p>
                      <p className="text-xs text-slate-500">
                        Yansıyan: {costPerReflected}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                  {thresholds.map((threshold) => {
                    const list = sources
                      .filter(
                        (row) => (row.longSessions?.[threshold.key] ?? 0) > 0
                      )
                      .sort(
                        (a, b) =>
                          (b.longSessions?.[threshold.key] ?? 0) -
                          (a.longSessions?.[threshold.key] ?? 0)
                      );
                    const copied =
                      (threshold.key === "lt1" && copiedShort) ||
                      (threshold.key === "lt3" && copiedLong);
                    return (
                      <div
                        key={`${item.id}-${threshold.key}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                              {threshold.label}
                            </p>
                            <h3 className="text-sm font-semibold text-slate-800">
                              {threshold.key.startsWith("lt")
                                ? "Kara Liste Adayları"
                                : "Beyaz Liste Adayları"}
                            </h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopy(threshold.key, sources)}
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
                                  key={`${item.id}-${threshold.key}-${row.sourceWebsiteId}`}
                                  className="border-b border-slate-100"
                                >
                                  <td className="px-3 py-2 font-semibold text-slate-800">
                                    {row.sourceWebsiteId}
                                  </td>
                                  <td className="px-3 py-2">
                                    {row.longSessions?.[threshold.key] ?? 0}
                                  </td>
                                  <td className="px-3 py-2">
                                    {row.longVisitors?.[threshold.key] ?? 0}
                                  </td>
                                  <td className="px-3 py-2">
                                    {row.longShare?.[threshold.key] ?? 0}
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
                            <th className="px-3 py-2">1 sn altı %</th>
                            <th className="px-3 py-2">3 sn altı %</th>
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
                                {row.longShare?.lt1 ?? 0}
                              </td>
                              <td className="px-3 py-2">
                                {row.longShare?.lt3 ?? 0}
                              </td>
                              <td className="px-3 py-2">
                                {row.longShare?.ge5 ?? 0}
                              </td>
                              <td className="px-3 py-2">
                                {row.longShare?.ge10 ?? 0}
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
                            <th className="px-3 py-2">1 sn altı %</th>
                            <th className="px-3 py-2">3 sn altı %</th>
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
                                {row.longShare?.lt1 ?? 0}
                              </td>
                              <td className="px-3 py-2">
                                {row.longShare?.lt3 ?? 0}
                              </td>
                              <td className="px-3 py-2">
                                {row.longShare?.ge5 ?? 0}
                              </td>
                              <td className="px-3 py-2">
                                {row.longShare?.ge10 ?? 0}
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
                    Ağ Kırılımı
                  </h3>
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-xs text-slate-600">
                      <thead className="border-b border-slate-200 bg-white text-[11px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Ağ</th>
                          <th className="px-3 py-2">Session</th>
                          <th className="px-3 py-2">1 sn altı %</th>
                          <th className="px-3 py-2">3 sn altı %</th>
                          <th className="px-3 py-2">5+ sn %</th>
                          <th className="px-3 py-2">10+ sn %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(result?.network ?? []).length === 0 && (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-3 py-6 text-center text-slate-400"
                            >
                              Sonuç bulunamadı.
                            </td>
                          </tr>
                        )}
                        {(result?.network ?? []).map((row) => (
                          <tr
                            key={`${item.id}-network-${row.label}`}
                            className="border-b border-slate-100"
                          >
                            <td className="px-3 py-2 font-semibold text-slate-800">
                              {row.label}
                            </td>
                            <td className="px-3 py-2">{row.totalSessions}</td>
                            <td className="px-3 py-2">
                              {row.longShare?.lt1 ?? 0}
                            </td>
                            <td className="px-3 py-2">
                              {row.longShare?.lt3 ?? 0}
                            </td>
                            <td className="px-3 py-2">
                              {row.longShare?.ge5 ?? 0}
                            </td>
                            <td className="px-3 py-2">
                              {row.longShare?.ge10 ?? 0}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">
                        Kombinasyon (Cihaz + Tarayıcı)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Etiket: {item.label || "—"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowBestComboOnly((prev) => !prev)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                    >
                      {showBestComboOnly
                        ? "Tüm kombinasyonlar"
                        : "En iyi kombinasyon"}
                    </button>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-xs text-slate-600">
                      <thead className="border-b border-slate-200 bg-white text-[11px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Kombinasyon</th>
                          <th className="px-3 py-2">Session</th>
                            <th className="px-3 py-2">1 sn altı %</th>
                            <th className="px-3 py-2">3 sn altı %</th>
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
                        {(showBestComboOnly
                          ? (result?.combos ?? []).slice(0, 1)
                          : result?.combos ?? []
                        ).map((row) => (
                          <tr
                            key={`${item.id}-combo-${row.label}`}
                            className="border-b border-slate-100"
                          >
                            <td className="px-3 py-2 font-semibold text-slate-800">
                              {row.label.replace("|", " + ")}
                            </td>
                            <td className="px-3 py-2">{row.totalSessions}</td>
                            <td className="px-3 py-2">
                                {row.longShare?.lt1 ?? 0}
                              </td>
                              <td className="px-3 py-2">
                                {row.longShare?.lt3 ?? 0}
                              </td>
                              <td className="px-3 py-2">
                                {row.longShare?.ge5 ?? 0}
                              </td>
                              <td className="px-3 py-2">
                                {row.longShare?.ge10 ?? 0}
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
