import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminBikDiagnostics from "@/components/analytics/AdminBikDiagnostics";

export default async function BikDiagnosticsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/account/sign-in?callbackUrl=/analytics/admin/diagnostics");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/analytics");
  }

  const websites = await prisma.analyticsWebsite.findMany({
    orderBy: { createdAt: "desc" },
  });

  const websitesForClient = websites.map((website) => ({
    ...website,
    createdAt: website.createdAt.toISOString(),
  }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Analytics Admin
        </p>
        <h1 className="text-3xl font-semibold text-slate-900">
          BIK-like Diagnostics
        </h1>
        <p className="text-sm text-slate-600">
          Sayaç kaybının nerede oluştuğunu metriklerle takip et.
        </p>
      </header>

      <AdminBikDiagnostics websites={websitesForClient} />
    </main>
  );
}
