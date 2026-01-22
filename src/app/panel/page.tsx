"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import FiltersBar from "@/components/dashboard/FiltersBar";
import StatsCard from "@/components/dashboard/StatsCard";
import { formatDuration } from "@/lib/formatDuration";
import { visitEvents } from "@/lib/mockVisits";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const parseFilterDate = (value: string | undefined, endOfDay = false) => {
  if (!value) {
    return null;
  }
  const iso = `${value}T${endOfDay ? "23:59:59" : "00:00:00"}+03:00`;
  return new Date(iso).getTime();
};

const formatDateInput = (date: Date) => {
  return date.toISOString().split("T")[0];
};

const getIstanbulDayRange = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayString = formatter.format(date);
  const start = new Date(`${dayString}T00:00:00+03:00`).getTime();
  const end = new Date(`${dayString}T23:59:59+03:00`).getTime();
  return { start, end };
};

const PanelPage = () => {
  const router = useRouter();
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return formatDateInput(date);
  });
  const [endDate, setEndDate] = useState(formatDateInput(new Date()));
  const [hideShortReads, setHideShortReads] = useState(true);
  const [ready, setReady] = useState(false);
  const [liveWindowStart, setLiveWindowStart] = useState(
    () => Date.now() - 5 * 60 * 1000
  );

  useEffect(() => {
    const isAuthorized =
      typeof window !== "undefined" &&
      window.localStorage.getItem("auth") === "1";
    if (!isAuthorized) {
      router.replace("/login");
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [router]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLiveWindowStart(Date.now() - 5 * 60 * 1000);
    }, 30 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  const filteredEvents = useMemo(() => {
    const startTs = parseFilterDate(startDate);
    const endTs = parseFilterDate(endDate, true);
    return visitEvents.filter((event) => {
      const timestamp = new Date(event.timestamp).getTime();
      if (startTs && timestamp < startTs) {
        return false;
      }
      if (endTs && timestamp > endTs) {
        return false;
      }
      if (hideShortReads && event.durationSec < 1) {
        return false;
      }
      return true;
    });
  }, [startDate, endDate, hideShortReads]);

  const totalPageviews = useMemo(
    () => filteredEvents.reduce((sum, event) => sum + event.pageviewCount, 0),
    [filteredEvents]
  );

  const totalDuration = useMemo(
    () => filteredEvents.reduce((sum, event) => sum + event.durationSec, 0),
    [filteredEvents]
  );

  const dailyRange = useMemo(() => getIstanbulDayRange(), []);

  const dailyUniqueVisitors = useMemo(() => {
    const visitors = new Set<string>();
    visitEvents.forEach((event) => {
      const timestamp = new Date(event.timestamp).getTime();
      if (timestamp >= dailyRange.start && timestamp <= dailyRange.end) {
        visitors.add(event.visitorId);
      }
    });
    return visitors.size;
  }, [dailyRange.end, dailyRange.start]);

  const liveEvents = useMemo(() => {
    return visitEvents.filter(
      (event) => new Date(event.timestamp).getTime() >= liveWindowStart
    );
  }, [liveWindowStart]);

  const liveVisitors = useMemo(() => {
    return new Set(liveEvents.map((event) => event.visitorId)).size;
  }, [liveEvents]);

  if (!ready) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Dashboard
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            Ziyaretçi Özeti
          </h1>
        </header>

        <FiltersBar
          startValue={startDate}
          endValue={endDate}
          hideShortReads={hideShortReads}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          onToggleShortReads={setHideShortReads}
          onFilter={() => null}
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatsCard
            title="Anlık Tekil Ziyaretçi"
            value={`${liveVisitors}`}
            detail="Son 5 dakika"
            accent="text-indigo-700"
            tone="bg-indigo-50"
          />
          <StatsCard
            title="Günlük Tekil Ziyaretçi"
            value={`${dailyUniqueVisitors}`}
            detail="Bugün"
            accent="text-emerald-700"
            tone="bg-emerald-50"
          />
          <StatsCard
            title="Toplam Görüntülenme"
            value={`${totalPageviews}`}
            detail="Seçilen tarih aralığı"
            accent="text-slate-900"
            tone="bg-amber-50"
          />
          <StatsCard
            title="Okunma Süresi"
            value={formatDuration(totalDuration)}
            detail="Toplam süre"
            accent="text-rose-600"
            tone="bg-rose-50"
          />
        </div>

        <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm shadow-slate-900/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                Özet
              </p>
              <h2 className="text-lg font-semibold text-slate-900">
                Son Oturumlar
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              {filteredEvents.length} kayıt
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {filteredEvents.slice(0, 4).map((event) => (
              <div
                key={event.id}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm md:flex-row md:items-center"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {event.pageCaption}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(event.timestamp).toLocaleString("tr-TR")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-700">
                    {event.pageviewCount} görüntülenme
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatDuration(event.durationSec)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
};

export default PanelPage;
