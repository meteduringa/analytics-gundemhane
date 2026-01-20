import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AnalyticsRootPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/account/sign-in?callbackUrl=/analytics");
  }

  if (session.user.role === "ADMIN") {
    redirect("/analytics/admin");
  }

  const link = await prisma.analyticsUserWebsite.findFirst({
    where: { userId: session.user.id },
    include: { website: true },
  });

  if (!link) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">
          No website assigned
        </h1>
        <p className="text-sm text-slate-500">
          Ask your administrator to assign a website to your account.
        </p>
      </main>
    );
  }

  redirect(`/analytics/sites/${link.websiteId}`);
}
