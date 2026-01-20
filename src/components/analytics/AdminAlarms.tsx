"use client";

import { useEffect, useMemo, useState } from "react";

type Website = {
  id: string;
  name: string;
};

type Alarm = {
  id: string;
  websiteId: string;
  name: string;
  type: "EVENT_THRESHOLD" | "ONLINE_BELOW";
  threshold: number;
  windowSeconds: number;
  isActive: boolean;
  createdAt: string;
};

type AlarmStatus = {
  alarmId: string;
  triggered: boolean;
  value: number;
};

export default function AdminAlarms({
  initialAlarms,
  websites,
}: {
  initialAlarms: Alarm[];
  websites: Website[];
}) {
  const [alarms, setAlarms] = useState(initialAlarms);
  const [statusMap, setStatusMap] = useState<Record<string, AlarmStatus>>({});
  const [name, setName] = useState("");
  const [type, setType] = useState<Alarm["type"]>("EVENT_THRESHOLD");
  const [threshold, setThreshold] = useState(100);
  const [windowSeconds, setWindowSeconds] = useState(60);
  const [websiteId, setWebsiteId] = useState(websites[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (websites.length === 0) {
    return (
      <section className="space-y-4 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Create a website before adding alarms.
      </section>
    );
  }

  const websitesById = useMemo(
    () =>
      websites.reduce<Record<string, Website>>((acc, site) => {
        acc[site.id] = site;
        return acc;
      }, {}),
    [websites]
  );

  useEffect(() => {
    const uniqueWebsiteIds = Array.from(
      new Set(alarms.map((alarm) => alarm.websiteId))
    );

    const loadStatuses = async () => {
      const results = await Promise.all(
        uniqueWebsiteIds.map(async (siteId) => {
          const response = await fetch(
            `/api/analytics/alarms?websiteId=${siteId}`
          );
          if (!response.ok) return [];
          const payload = await response.json();
          return payload.statuses as AlarmStatus[];
        })
      );
      const merged = results.flat().reduce<Record<string, AlarmStatus>>(
        (acc, status) => {
          acc[status.alarmId] = status;
          return acc;
        },
        {}
      );
      setStatusMap(merged);
    };

    if (!uniqueWebsiteIds.length) return;

    loadStatuses();
    const interval = setInterval(loadStatuses, 5000);
    return () => clearInterval(interval);
  }, [alarms]);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/analytics/admin/alarms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          threshold,
          windowSeconds,
          websiteId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create alarm.");
      }
      setAlarms((prev) => [payload.alarm, ...prev]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create alarm.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (alarm: Alarm) => {
    const response = await fetch(`/api/analytics/admin/alarms/${alarm.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !alarm.isActive }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to update alarm.");
      return;
    }
    setAlarms((prev) =>
      prev.map((item) => (item.id === alarm.id ? payload.alarm : item))
    );
  };

  const handleDelete = async (alarmId: string) => {
    if (!confirm("Delete this alarm?")) return;
    const response = await fetch(`/api/analytics/admin/alarms/${alarmId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? "Failed to delete alarm.");
      return;
    }
    setAlarms((prev) => prev.filter((alarm) => alarm.id !== alarmId));
  };

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900">Alarms</h2>
        <p className="text-sm text-slate-500">
          Basic threshold rules for events or online users.
        </p>
      </header>

      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Alarm name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={websiteId}
            onChange={(event) => setWebsiteId(event.target.value)}
          >
            {websites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={type}
            onChange={(event) => setType(event.target.value as Alarm["type"])}
          >
            <option value="EVENT_THRESHOLD">
              Events over threshold (window)
            </option>
            <option value="ONLINE_BELOW">Online users below</option>
          </select>
          <input
            type="number"
            min={1}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
          />
          <input
            type="number"
            min={30}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={windowSeconds}
            onChange={(event) => setWindowSeconds(Number(event.target.value))}
          />
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "Creating..." : "Add alarm"}
        </button>
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        {alarms.map((alarm) => {
          const status = statusMap[alarm.id];
          return (
            <div
              key={alarm.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {alarm.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {websitesById[alarm.websiteId]?.name ?? "Website"} •{" "}
                    {alarm.type === "EVENT_THRESHOLD"
                      ? `>${alarm.threshold} events in ${alarm.windowSeconds}s`
                      : `Online below ${alarm.threshold}`}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
                    onClick={() => handleToggle(alarm)}
                  >
                    {alarm.isActive ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600"
                    onClick={() => handleDelete(alarm.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500">
                Status:{" "}
                {status
                  ? status.triggered
                    ? `Triggered (value: ${status.value})`
                    : `Normal (value: ${status.value})`
                  : "Unknown"}
              </div>
            </div>
          );
        })}
        {alarms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No alarms yet.
          </div>
        ) : null}
      </div>
    </section>
  );
}
