import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminWebsites from "@/components/analytics/AdminWebsites";
import AdminUsers from "@/components/analytics/AdminUsers";
import AdminAlarms from "@/components/analytics/AdminAlarms";

export default async function AnalyticsAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/account/sign-in?callbackUrl=/analytics/admin");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/analytics");
  }

  const [websites, users, alarms] = await Promise.all([
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
  ]);

  const websitesForClient = websites.map((website) => ({
    ...website,
    createdAt: website.createdAt.toISOString(),
  }));

  const usersForClient = users.map((user) => ({
    ...user,
    createdAt: user.createdAt.toISOString(),
  }));

  const alarmsForClient = alarms.map((alarm) => ({
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
          Manage websites & customers
        </h1>
        <p className="text-sm text-slate-600">
          Create websites, generate tracking snippets, and assign customers.
        </p>
      </header>
      <AdminWebsites initialWebsites={websitesForClient} />
      <AdminUsers initialUsers={usersForClient} websites={websitesForClient} />
      <AdminAlarms initialAlarms={alarmsForClient} websites={websitesForClient} />
    </main>
  );
}
