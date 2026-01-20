import { AnalyticsEventType, Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getIstanbulTodayRange, getLast24HoursRange } from "@/lib/analytics-time";
import LivePanel from "@/components/analytics/LivePanel";

type Range = { startUtc: Date; endUtc: Date };

type CountRow = { count: bigint };

type AvgRow = { avg_seconds: number | null };

const formatDuration = (seconds: number) => {
  if (!seconds || Number.isNaN(seconds)) {
    return "0m 0s";
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
};

const getRangeMetrics = async (websiteId: string, range: Range) => {
  const where = {
    websiteId,
    createdAt: {
      gte: range.startUtc,
      lt: range.endUtc,
    },
  };

  const [pageviews, visitorRows, avgRows] = await Promise.all([
    prisma.analyticsEvent.count({
      where: { ...where, type: AnalyticsEventType.PAGEVIEW },
    }),
    prisma.$queryRaw<CountRow[]>(
      Prisma.sql`
        SELECT COUNT(DISTINCT "visitorId") AS count
        FROM "analytics_events"
        WHERE "websiteId" = ${websiteId}
          AND "createdAt" >= ${range.startUtc}
          AND "createdAt" < ${range.endUtc}
          AND "type" = ${AnalyticsEventType.PAGEVIEW}::"AnalyticsEventType"::"AnalyticsEventType"::"AnalyticsEventType"
      `
    ),
    prisma.$queryRaw<AvgRow[]>(
      Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM ("lastSeenAt" - "startedAt"))) AS avg_seconds
        FROM "analytics_sessions"
        WHERE "websiteId" = ${websiteId}
          AND "startedAt" >= ${range.startUtc}
          AND "startedAt" < ${range.endUtc}
      `
    ),
  ]);

  const avgSeconds = avgRows[0]?.avg_seconds ?? 0;
  const visitors = Number(visitorRows[0]?.count ?? 0);

  return {
    pageviews,
    visitors,
    avgSeconds,
  };
};

export default async function AnalyticsWebsitePage({
  params,
}: {
  params: { id?: string } | Promise<{ id?: string }>;
}) {
  const resolvedParams = await Promise.resolve(params as { id?: string });
  const websiteId = resolvedParams?.id;

  if (!websiteId) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Website not found</h1>
        <p className="text-sm text-slate-500">
          Invalid website identifier.
        </p>
      </main>
    );
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(`/account/sign-in?callbackUrl=/analytics/sites/${websiteId}`);
  }

  if (session.user.role !== "ADMIN") {
    const link = await prisma.analyticsUserWebsite.findUnique({
      where: {
        userId_websiteId: {
          userId: session.user.id,
          websiteId,
        },
      },
    });
    if (!link) {
      return (
        <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Access denied</h1>
          <p className="text-sm text-slate-500">
            You do not have access to this website.
          </p>
        </main>
      );
    }
  }

  const website = await prisma.analyticsWebsite.findUnique({
    where: { id: websiteId },
  });

  if (!website) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Website not found</h1>
        <p className="text-sm text-slate-500">
          This analytics property could not be located.
        </p>
      </main>
    );
  }

  const todayRange = getIstanbulTodayRange();
  const last24Range = getLast24HoursRange();

  const [today, last24] = await Promise.all([
    getRangeMetrics(websiteId, todayRange),
    getRangeMetrics(websiteId, last24Range),
  ]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
          {website.name}
        </p>
        <h1 className="text-3xl font-semibold text-slate-900">
          Real-time Analytics
        </h1>
        <p className="text-sm text-slate-600">
          All date ranges are aligned to Istanbul time.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Today (Istanbul)
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Visitors
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {today.visitors}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Pageviews
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {today.pageviews}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Avg Session
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {formatDuration(today.avgSeconds)}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Last 24 Hours</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Visitors
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {last24.visitors}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Pageviews
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {last24.pageviews}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Avg Session
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {formatDuration(last24.avgSeconds)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <LivePanel websiteId={websiteId} />
    </main>
  );
}
