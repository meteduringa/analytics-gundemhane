import { getServerSession } from "next-auth";
  import { redirect } from "next/navigation";
  import { authOptions } from "@/lib/auth";
  import { prisma } from "@/lib/prisma";
  import AdminWebsites from "@/components/analytics/AdminWebsites";
  import AdminUsers from "@/components/analytics/AdminUsers";
  import AdminAlarms from "@/components/analytics/AdminAlarms";
  import MetricCard from "@/components/analytics/ui/MetricCard";
  import { getLast24HoursRange } from "@/lib/analytics-time";

  export default async function AnalyticsAdminPage() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      redirect("/account/sign-in?callbackUrl=/analytics/admin");
    }
    if (session.user.role !== "ADMIN") {
      redirect("/analytics");
    }

    const last24Range = getLast24HoursRange();

    const [websites, users, alarms, dailyVisitors] = await Promise.all([
      prisma.analyticsWebsite.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.findMany({
        where: { role: "CUSTOMER" },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          userWebsites: {
            include: {
              website: {
                select: { id: true, name: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.analyticsAlarm.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.analyticsEvent.count({
        where: {
          type: "PAGEVIEW",
          createdAt: {
            gte: last24Range.startUtc,
            lt: last24Range.endUtc,
          },
        },
      }),
    ]);

    type WebsiteRow = (typeof websites)[number];
    type UserRow = (typeof users)[number];
    type AlarmRow = (typeof alarms)[number];

    const websitesForClient = websites.map((website: WebsiteRow) => ({
      ...website,
      createdAt: website.createdAt.toISOString(),
    }));

    const usersForClient = users.map((user: UserRow) => ({
      ...user,
      createdAt: user.createdAt.toISOString(),
    }));

    const alarmsForClient = alarms.map((alarm: AlarmRow) => ({
      ...alarm,
      createdAt: alarm.createdAt.toISOString(),
    }));

    return (
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Analytics Admin
          </p>
          <h1 className="text-3xl font-semibold text-slate-900">
            Dashboard & Yönetim
          </h1>
          <p className="text-sm text-slate-600">
            Siteleri yönet, kullanıcıları ekle, takip kodunu üret.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard title="Toplam Site" value={websites.length} />
          <MetricCard
            title="Günlük Ziyaretçi"
            value={dailyVisitors}
            subtitle="Son 24 saat"
          />
          <MetricCard title="Müşteri Sayısı" value={users.length} />
        </section>

        <section id="sites">
          <AdminWebsites initialWebsites={websitesForClient} />
        </section>

        <section id="users">
          <AdminUsers initialUsers={usersForClient} websites={websitesForClient} />
        </section>

        <section id="alarms">
          <AdminAlarms initialAlarms={alarmsForClient} websites={websitesForClient} />
        </section>
      </main>
    );
  }
