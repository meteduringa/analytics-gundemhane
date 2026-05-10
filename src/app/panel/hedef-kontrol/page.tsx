"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type TargetRow = {
  websiteId: string;
  websiteName: string;
  date: string;
  telegramChatId: string | null;
  dailyUniqueTarget: number | null;
  dailyDirectUniqueTarget: number | null;
  dailyPageviewTarget: number | null;
  currentUnique: number;
  currentDirectUnique: number;
  currentPageviews: number;
  remainingUnique: number | null;
  remainingDirectUnique: number | null;
  remainingPageviews: number | null;
  progressUniquePercent: number | null;
  progressDirectUniquePercent: number | null;
  progressPageviewsPercent: number | null;
  projectedUniqueAtMidnight: number | null;
  projectedDirectUniqueAtMidnight: number | null;
  projectedPageviewsAtMidnight: number | null;
  uniqueRisk: "green" | "yellow" | "red" | "none";
  directRisk: "green" | "yellow" | "red" | "none";
  pageviewRisk: "green" | "yellow" | "red" | "none";
  recordUpdatedAt: string | null;
};

const formatDateInput = (date: Date) => date.toISOString().split("T")[0];

const formatIstanbulDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const riskTone = (risk: TargetRow["uniqueRisk"]) => {
  switch (risk) {
    case "green":
      return "bg-emerald-100 text-emerald-700";
    case "yellow":
      return "bg-amber-100 text-amber-700";
    case "red":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-500";
  }
};

export default function TargetControlPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [dateInput, setDateInput] = useState(() => formatDateInput(new Date()));
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        dailyUniqueTarget: string;
        dailyDirectUniqueTarget: string;
        dailyPageviewTarget: string;
        telegramChatId: string;
      }
    >
  >({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isAuthorized = window.localStorage.getItem("auth") === "1";
    const rawUser = window.localStorage.getItem("user");
    if (!isAuthorized || !rawUser) {
      router.replace("/login");
      return;
    }
    const parsed = JSON.parse(rawUser) as { role?: "ADMIN" | "CUSTOMER" };
    if (parsed.role !== "ADMIN") {
      router.replace("/panel");
      return;
    }
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [router]);

  const loadRows = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/panel/target-board?date=${dateInput}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Hedef verileri alınamadı.");
      }
      const nextRows = (payload.rows ?? []) as TargetRow[];
      setRows(nextRows);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const row of nextRows) {
          next[row.websiteId] ??= {
            dailyUniqueTarget:
              row.dailyUniqueTarget !== null ? String(row.dailyUniqueTarget) : "",
            dailyDirectUniqueTarget:
              row.dailyDirectUniqueTarget !== null
                ? String(row.dailyDirectUniqueTarget)
                : "",
            dailyPageviewTarget:
              row.dailyPageviewTarget !== null
                ? String(row.dailyPageviewTarget)
                : "",
            telegramChatId: row.telegramChatId ?? "",
          };
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hedef verileri alınamadı.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    void loadRows();
  }, [ready, dateInput]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.currentUnique += row.currentUnique;
        acc.currentDirectUnique += row.currentDirectUnique;
        acc.currentPageviews += row.currentPageviews;
        acc.projectedUnique += row.projectedUniqueAtMidnight ?? 0;
        acc.projectedDirectUnique += row.projectedDirectUniqueAtMidnight ?? 0;
        acc.projectedPageviews += row.projectedPageviewsAtMidnight ?? 0;
        return acc;
      },
      {
        currentUnique: 0,
        currentDirectUnique: 0,
        currentPageviews: 0,
        projectedUnique: 0,
        projectedDirectUnique: 0,
        projectedPageviews: 0,
      }
    );
  }, [rows]);

  const updateDraft = (
    websiteId: string,
    key:
      | "dailyUniqueTarget"
      | "dailyDirectUniqueTarget"
      | "dailyPageviewTarget"
      | "telegramChatId",
    value: string
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [websiteId]: {
        dailyUniqueTarget: prev[websiteId]?.dailyUniqueTarget ?? "",
        dailyDirectUniqueTarget: prev[websiteId]?.dailyDirectUniqueTarget ?? "",
        dailyPageviewTarget: prev[websiteId]?.dailyPageviewTarget ?? "",
        telegramChatId: prev[websiteId]?.telegramChatId ?? "",
        [key]: value,
      },
    }));
  };

  const saveTargets = async (websiteId: string) => {
    setSavingId(websiteId);
    setError("");
    try {
      const draft = drafts[websiteId] ?? {
        dailyUniqueTarget: "",
        dailyDirectUniqueTarget: "",
        dailyPageviewTarget: "",
        telegramChatId: "",
      };
      const response = await fetch("/api/panel/target-board", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteId,
          dailyUniqueTarget: draft.dailyUniqueTarget,
          dailyDirectUniqueTarget: draft.dailyDirectUniqueTarget,
          dailyPageviewTarget: draft.dailyPageviewTarget,
          telegramChatId: draft.telegramChatId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Hedef kaydedilemedi.");
      }
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hedef kaydedilemedi.");
    } finally {
      setSavingId(null);
    }
  };

  if (!ready) return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Hedef Kontrol
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            00:00 Hedef Takibi
          </h1>
          <p className="text-sm text-slate-500">
            Günlük hedefi, şu anki sayı, kalan fark ve 00:00 tahminini tek ekranda
            gösterir.
          </p>
        </header>

        <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-xs font-semibold text-slate-500">
              Gün
              <input
                type="date"
                value={dateInput}
                onChange={(event) => setDateInput(event.target.value)}
                className="mt-2 rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <button
              type="button"
              onClick={() => void loadRows()}
              className="h-10 rounded-2xl bg-slate-900 px-6 text-sm font-semibold text-white"
            >
              {loading ? "Yükleniyor..." : "Tabloyu Yenile"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              Toplam Tekil
            </p>
            <div className="mt-3 text-3xl font-bold text-slate-900">
              {totals.currentUnique}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              Toplam Direct Tekil
            </p>
            <div className="mt-3 text-3xl font-bold text-slate-900">
              {totals.currentDirectUnique}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              Toplam Pageview
            </p>
            <div className="mt-3 text-3xl font-bold text-slate-900">
              {totals.currentPageviews}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              00:00 Tekil Tahmini
            </p>
            <div className="mt-3 text-3xl font-bold text-slate-900">
              {totals.projectedUnique}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              00:00 Direct Tahmini
            </p>
            <div className="mt-3 text-3xl font-bold text-slate-900">
              {totals.projectedDirectUnique}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              00:00 PV Tahmini
            </p>
            <div className="mt-3 text-3xl font-bold text-slate-900">
              {totals.projectedPageviews}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/90 shadow-sm shadow-slate-900/5">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Site</th>
                  <th className="px-4 py-3">Şu An Tekil</th>
                  <th className="px-4 py-3">Tekil Hedef</th>
                  <th className="px-4 py-3">00:00 Tekil</th>
                  <th className="px-4 py-3">Tekil Risk</th>
                  <th className="px-4 py-3">Şu An Direct</th>
                  <th className="px-4 py-3">Direct Hedef</th>
                  <th className="px-4 py-3">00:00 Direct</th>
                  <th className="px-4 py-3">Direct Risk</th>
                  <th className="px-4 py-3">Şu An PV</th>
                  <th className="px-4 py-3">PV Hedef</th>
                  <th className="px-4 py-3">00:00 PV</th>
                  <th className="px-4 py-3">PV Risk</th>
                  <th className="px-4 py-3">Son Cache</th>
                  <th className="px-4 py-3">Ayarlar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.websiteId} className="text-slate-700 align-top">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {row.websiteName}
                    </td>
                    <td className="px-4 py-3">{row.currentUnique}</td>
                    <td className="px-4 py-3">{row.dailyUniqueTarget ?? "-"}</td>
                    <td className="px-4 py-3">
                      {row.projectedUniqueAtMidnight ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${riskTone(
                          row.uniqueRisk
                        )}`}
                      >
                        {row.uniqueRisk}
                      </span>
                    </td>
                    <td className="px-4 py-3">{row.currentDirectUnique}</td>
                    <td className="px-4 py-3">{row.dailyDirectUniqueTarget ?? "-"}</td>
                    <td className="px-4 py-3">
                      {row.projectedDirectUniqueAtMidnight ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${riskTone(
                          row.directRisk
                        )}`}
                      >
                        {row.directRisk}
                      </span>
                    </td>
                    <td className="px-4 py-3">{row.currentPageviews}</td>
                    <td className="px-4 py-3">{row.dailyPageviewTarget ?? "-"}</td>
                    <td className="px-4 py-3">
                      {row.projectedPageviewsAtMidnight ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${riskTone(
                          row.pageviewRisk
                        )}`}
                      >
                        {row.pageviewRisk}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatIstanbulDateTime(row.recordUpdatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="grid gap-2">
                        <input
                          type="number"
                          placeholder="Tekil hedef"
                          value={drafts[row.websiteId]?.dailyUniqueTarget ?? ""}
                          onChange={(event) =>
                            updateDraft(
                              row.websiteId,
                              "dailyUniqueTarget",
                              event.target.value
                            )
                          }
                          className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                        />
                        <input
                          type="number"
                          placeholder="PV hedef"
                          value={drafts[row.websiteId]?.dailyPageviewTarget ?? ""}
                          onChange={(event) =>
                            updateDraft(
                              row.websiteId,
                              "dailyPageviewTarget",
                              event.target.value
                            )
                          }
                          className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                        />
                        <input
                          type="number"
                          placeholder="Direct hedef"
                          value={drafts[row.websiteId]?.dailyDirectUniqueTarget ?? ""}
                          onChange={(event) =>
                            updateDraft(
                              row.websiteId,
                              "dailyDirectUniqueTarget",
                              event.target.value
                            )
                          }
                          className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Telegram chat id"
                          value={drafts[row.websiteId]?.telegramChatId ?? ""}
                          onChange={(event) =>
                            updateDraft(
                              row.websiteId,
                              "telegramChatId",
                              event.target.value
                            )
                          }
                          className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => void saveTargets(row.websiteId)}
                          disabled={savingId === row.websiteId}
                          className="rounded-xl bg-slate-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {savingId === row.websiteId ? "Kaydediliyor..." : "Kaydet"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
