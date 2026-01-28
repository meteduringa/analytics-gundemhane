import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminSimpleMetrics from "@/components/analytics/AdminSimpleMetrics";

export default async function AnalyticsSimpleAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/account/sign-in?callbackUrl=/analytics/admin/simple");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/analytics");
  }

  const websites = await prisma.analyticsWebsite.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Simple Analytics
        </p>
        <h1 className="text-3xl font-semibold text-slate-900">
          Günlük Basit Metrikler
        </h1>
        <p className="text-sm text-slate-600">
          Tekil, direct, pageview ve ortalama süre metriklerini izleyin.
        </p>
      </header>

      <AdminSimpleMetrics websites={websites} />
    </main>
  );
}
