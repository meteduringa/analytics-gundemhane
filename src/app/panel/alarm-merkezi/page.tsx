"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Site = {
  id: string;
  name: string;
  dailyUniqueTarget?: number | null;
  dailyPageviewTarget?: number | null;
  telegramChatId?: string | null;
};

type AlertType =
  | "TARGET_PACE_BELOW"
  | "PROJECTED_MISS"
  | "STAGNATION"
  | "CACHE_STALE"
  | "TRAFFIC_DROP";

type AlertRule = {
  id: string;
  websiteId: string;
  name: string;
  type: AlertType;
  config: Record<string, unknown>;
  telegramEnabled: boolean;
  telegramChatId: string | null;
  cooldownSeconds: number;
  isActive: boolean;
  lastTriggeredAt: string | null;
  website: Site;
};

type AlertStatus = {
  ruleId: string;
  websiteId: string;
  triggered: boolean;
  title: string;
  description: string;
  value?: number | null;
  threshold?: number | null;
};

type AlertEvent = {
  id: string;
  message: string;
  deliveredToTelegram: boolean;
  telegramChatId: string | null;
  telegramError: string | null;
  triggeredAt: string;
  website: { id: string; name: string };
  alertRule: { id: string; name: string; type: AlertType };
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

const alertTypeOptions: { value: AlertType; label: string }[] = [
  { value: "TARGET_PACE_BELOW", label: "Hedef temposu geride" },
  { value: "PROJECTED_MISS", label: "00:00 tahmini hedef altında" },
  { value: "STAGNATION", label: "Duraklama alarmı" },
  { value: "CACHE_STALE", label: "Cache eski alarmı" },
  { value: "TRAFFIC_DROP", label: "Ani düşüş alarmı" },
];

const defaultConfigForType = (type: AlertType) => {
  switch (type) {
    case "TARGET_PACE_BELOW":
      return { metric: "unique", lagPercent: 15, startsAtHour: 12 };
    case "PROJECTED_MISS":
      return { metric: "unique", shortfallPercent: 0, startsAtHour: 14 };
    case "STAGNATION":
      return { lookbackMinutes: 10, minUniqueDelta: 50, minPageviewDelta: 200 };
    case "CACHE_STALE":
      return { maxAgeMinutes: 10 };
    case "TRAFFIC_DROP":
      return { metric: "pageview", lookbackMinutes: 15, dropPercent: 30 };
  }
};

const configSummary = (rule: AlertRule) => {
  const config = rule.config ?? {};
  switch (rule.type) {
    case "TARGET_PACE_BELOW":
      return `${String(config.metric ?? "unique")} • lag %${String(
        config.lagPercent ?? 15
      )}`;
    case "PROJECTED_MISS":
      return `${String(config.metric ?? "unique")} • ${String(
        config.startsAtHour ?? 14
      )}:00 sonrası`;
    case "STAGNATION":
      return `Son ${String(config.lookbackMinutes ?? 10)} dk • min ${
        String(config.minUniqueDelta ?? 0)
      } tekil / ${String(config.minPageviewDelta ?? 0)} pv`;
    case "CACHE_STALE":
      return `Max ${String(config.maxAgeMinutes ?? 10)} dk`;
    case "TRAFFIC_DROP":
      return `${String(config.metric ?? "pageview")} • ${
        String(config.lookbackMinutes ?? 15)
      } dk • %${String(config.dropPercent ?? 30)} düşüş`;
  }
};

export default function AlarmCenterPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AlertStatus>>({});
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [dateInput, setDateInput] = useState(() => formatDateInput(new Date()));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const [form, setForm] = useState<{
    websiteId: string;
    name: string;
    type: AlertType;
    telegramEnabled: boolean;
    telegramChatId: string;
    cooldownSeconds: string;
    config: Record<string, unknown>;
  }>({
    websiteId: "",
    name: "",
    type: "TARGET_PACE_BELOW",
    telegramEnabled: true,
    telegramChatId: "",
    cooldownSeconds: "900",
    config: defaultConfigForType("TARGET_PACE_BELOW"),
  });

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

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [sitesRes, rulesRes, statusesRes, eventsRes] = await Promise.all([
        fetch("/api/panel/sites"),
        fetch("/api/panel/alert-rules"),
        fetch(`/api/panel/alert-status?date=${dateInput}`),
        fetch("/api/panel/alert-events"),
      ]);
      const [sitesPayload, rulesPayload, statusesPayload, eventsPayload] =
        await Promise.all([
          sitesRes.json(),
          rulesRes.json(),
          statusesRes.json(),
          eventsRes.json(),
        ]);
      if (!sitesRes.ok || !rulesRes.ok || !statusesRes.ok || !eventsRes.ok) {
        throw new Error(
          sitesPayload.error ||
            rulesPayload.error ||
            statusesPayload.error ||
            eventsPayload.error ||
            "Alarm verileri alınamadı."
        );
      }

      const nextSites = (sitesPayload.sites ?? []) as Site[];
      setSites(nextSites);
      setRules((rulesPayload.rules ?? []) as AlertRule[]);
      setStatuses(
        ((statusesPayload.statuses ?? []) as AlertStatus[]).reduce<
          Record<string, AlertStatus>
        >((acc, item) => {
          acc[item.ruleId] = item;
          return acc;
        }, {})
      );
      setEvents((eventsPayload.events ?? []) as AlertEvent[]);

      if (!form.websiteId && nextSites.length > 0) {
        setForm((prev) => ({ ...prev, websiteId: nextSites[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Alarm verileri alınamadı.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    void loadAll();
  }, [ready, dateInput]);

  const createRule = async () => {
    setError("");
    try {
      const response = await fetch("/api/panel/alert-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteId: form.websiteId,
          name: form.name,
          type: form.type,
          config: form.config,
          telegramEnabled: form.telegramEnabled,
          telegramChatId: form.telegramChatId,
          cooldownSeconds: Number(form.cooldownSeconds || 900),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Alarm oluşturulamadı.");
      }
      setForm((prev) => ({
        ...prev,
        name: "",
        config: defaultConfigForType(prev.type),
      }));
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Alarm oluşturulamadı.");
    }
  };

  const toggleRule = async (rule: AlertRule) => {
    await fetch(`/api/panel/alert-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rule.isActive }),
    });
    await loadAll();
  };

  const deleteRule = async (ruleId: string) => {
    if (!confirm("Bu alarm silinsin mi?")) return;
    await fetch(`/api/panel/alert-rules/${ruleId}`, { method: "DELETE" });
    await loadAll();
  };

  const runNow = async () => {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/panel/alert-runner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateInput }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Alarm çalıştırılamadı.");
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Alarm çalıştırılamadı.");
    } finally {
      setRunning(false);
    }
  };

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === form.websiteId) ?? null,
    [form.websiteId, sites]
  );

  const updateConfig = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        [key]: value === "" ? "" : Number.isNaN(Number(value)) ? value : Number(value),
      },
    }));
  };

  if (!ready) return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Alarm Merkezi
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            Telegram Alarm ve Uyarılar
          </h1>
          <p className="text-sm text-slate-500">
            Hedef, tempo, duraklama ve cache sağlığı için alarm kurallarını buradan
            yönet.
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
              onClick={() => void loadAll()}
              className="h-10 rounded-2xl border border-slate-200 px-6 text-sm font-semibold text-slate-700"
            >
              {loading ? "Yükleniyor..." : "Durumları Yenile"}
            </button>

            <button
              type="button"
              onClick={() => void runNow()}
              className="h-10 rounded-2xl bg-slate-900 px-6 text-sm font-semibold text-white"
            >
              {running ? "Çalışıyor..." : "Alarmları Şimdi Çalıştır"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
          <h2 className="text-lg font-semibold text-slate-900">Yeni Alarm</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs font-semibold text-slate-500">
              Site
              <select
                value={form.websiteId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, websiteId: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              >
                <option value="">Seçiniz</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Alarm Adı
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Alarm Tipi
              <select
                value={form.type}
                onChange={(event) => {
                  const nextType = event.target.value as AlertType;
                  setForm((prev) => ({
                    ...prev,
                    type: nextType,
                    config: defaultConfigForType(nextType),
                  }));
                }}
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              >
                {alertTypeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Cooldown (sn)
              <input
                type="number"
                min={60}
                value={form.cooldownSeconds}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    cooldownSeconds: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.telegramEnabled}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    telegramEnabled: event.target.checked,
                  }))
                }
                className="h-4 w-4"
              />
              Telegram gönder
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Telegram Chat ID
              <input
                value={form.telegramChatId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    telegramChatId: event.target.value,
                  }))
                }
                placeholder={selectedSite?.telegramChatId ?? "Opsiyonel override"}
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {(form.type === "TARGET_PACE_BELOW" ||
              form.type === "PROJECTED_MISS" ||
              form.type === "TRAFFIC_DROP") && (
              <label className="text-xs font-semibold text-slate-500">
                Metrik
                <select
                  value={String(form.config.metric ?? "unique")}
                  onChange={(event) => updateConfig("metric", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                >
                  <option value="unique">Tekil</option>
                  <option value="pageview">Pageview</option>
                </select>
              </label>
            )}

            {form.type === "TARGET_PACE_BELOW" && (
              <>
                <label className="text-xs font-semibold text-slate-500">
                  Lag %
                  <input
                    type="number"
                    value={String(form.config.lagPercent ?? 15)}
                    onChange={(event) => updateConfig("lagPercent", event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Başlangıç Saati
                  <input
                    type="number"
                    value={String(form.config.startsAtHour ?? 12)}
                    onChange={(event) => updateConfig("startsAtHour", event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
              </>
            )}

            {form.type === "PROJECTED_MISS" && (
              <>
                <label className="text-xs font-semibold text-slate-500">
                  Shortfall %
                  <input
                    type="number"
                    value={String(form.config.shortfallPercent ?? 0)}
                    onChange={(event) =>
                      updateConfig("shortfallPercent", event.target.value)
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Başlangıç Saati
                  <input
                    type="number"
                    value={String(form.config.startsAtHour ?? 14)}
                    onChange={(event) => updateConfig("startsAtHour", event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
              </>
            )}

            {form.type === "STAGNATION" && (
              <>
                <label className="text-xs font-semibold text-slate-500">
                  Lookback (dk)
                  <input
                    type="number"
                    value={String(form.config.lookbackMinutes ?? 10)}
                    onChange={(event) =>
                      updateConfig("lookbackMinutes", event.target.value)
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Min Tekil Artış
                  <input
                    type="number"
                    value={String(form.config.minUniqueDelta ?? 50)}
                    onChange={(event) =>
                      updateConfig("minUniqueDelta", event.target.value)
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Min PV Artış
                  <input
                    type="number"
                    value={String(form.config.minPageviewDelta ?? 200)}
                    onChange={(event) =>
                      updateConfig("minPageviewDelta", event.target.value)
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
              </>
            )}

            {form.type === "CACHE_STALE" && (
              <label className="text-xs font-semibold text-slate-500">
                Max Cache Yaşı (dk)
                <input
                  type="number"
                  value={String(form.config.maxAgeMinutes ?? 10)}
                  onChange={(event) =>
                    updateConfig("maxAgeMinutes", event.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                />
              </label>
            )}

            {form.type === "TRAFFIC_DROP" && (
              <>
                <label className="text-xs font-semibold text-slate-500">
                  Lookback (dk)
                  <input
                    type="number"
                    value={String(form.config.lookbackMinutes ?? 15)}
                    onChange={(event) =>
                      updateConfig("lookbackMinutes", event.target.value)
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Düşüş %
                  <input
                    type="number"
                    value={String(form.config.dropPercent ?? 30)}
                    onChange={(event) => updateConfig("dropPercent", event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => void createRule()}
            className="mt-5 rounded-2xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white"
          >
            Alarm Oluştur
          </button>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Alarm Tanımları</h2>
          <div className="space-y-3">
            {rules.map((rule) => {
              const status = statuses[rule.id];
              return (
                <div
                  key={rule.id}
                  className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5"
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-900">
                        {rule.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {rule.website.name} • {configSummary(rule)}
                      </div>
                      <div className="text-xs text-slate-500">
                        Son tetiklenme: {formatIstanbulDateTime(rule.lastTriggeredAt)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          rule.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {rule.isActive ? "Aktif" : "Pasif"}
                      </span>
                      <button
                        type="button"
                        onClick={() => void toggleRule(rule)}
                        className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                      >
                        {rule.isActive ? "Kapat" : "Aç"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteRule(rule.id)}
                        className="rounded-xl border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600"
                      >
                        Sil
                      </button>
                    </div>
                  </div>

                  {status ? (
                    <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                      <p className="font-semibold text-slate-900">
                        {status.triggered ? "Tetiklenmiş" : "Normal"} — {status.title}
                      </p>
                      <p className="mt-1 text-slate-600">{status.description}</p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Alarm Olayları</h2>
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5"
              >
                <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {event.website.name} • {event.alertRule.name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatIstanbulDateTime(event.triggeredAt)}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      event.deliveredToTelegram
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {event.deliveredToTelegram
                      ? "Telegram gönderildi"
                      : "Telegram gönderilemedi"}
                  </span>
                </div>
                <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-700">
                  {event.message}
                </pre>
                {event.telegramError ? (
                  <div className="mt-2 text-xs text-rose-600">
                    Hata: {event.telegramError}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
