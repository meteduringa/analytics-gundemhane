  "use client";

  import { useEffect, useState } from "react";

  type LiveEvent = {
    id: string;
    type: string;
    url: string;
    createdAt: string;
    eventName?: string | null;
  };

  type LivePayload = {
    onlineCount: number;
    pageviewsCount: number;
    recentEvents: LiveEvent[];
    now: number;
  };

  const formatIstanbulTime = (value: string) =>
    new Date(value).toLocaleTimeString("tr-TR", {
      timeZone: "Europe/Istanbul",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  export default function LivePanel({ websiteId }: { websiteId: string }) {
    const [live, setLive] = useState<LivePayload | null>(null);

    useEffect(() => {
      const source = new EventSource(
        `/api/analytics/realtime?websiteId=${websiteId}`
      );

      const handler = (event: MessageEvent) => {
        const payload = JSON.parse(event.data) as LivePayload;
        setLive(payload);
      };

      source.addEventListener("update", handler);

      source.onerror = () => {
        source.close();
      };

      return () => {
        source.removeEventListener("update", handler);
        source.close();
      };
    }, [websiteId]);

    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Canlı
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Son güncelleme:{" "}
              {live?.now
                ? new Date(live.now).toLocaleTimeString("tr-TR", {
                    timeZone: "Europe/Istanbul",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "bekleniyor"}
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            {live?.onlineCount ?? "--"} aktif
          </span>
        </header>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Son 5-10 Etkinlik
          </div>
          <div className="mt-3 space-y-2">
            {live?.recentEvents?.length ? (
              live.recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                >
                  <span className="truncate">
                    {event.type === "EVENT"
                      ? `event:${event.eventName ?? "custom"}`
                      : "pageview"}{" "}
                    • {event.url}
                  </span>
                  <span className="shrink-0 text-slate-400">
                    {formatIstanbulTime(event.createdAt)}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                Henüz veri yok
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

