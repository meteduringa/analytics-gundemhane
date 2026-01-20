  import Link from "next/link";
  import { getServerSession } from "next-auth";
  import { authOptions } from "@/lib/auth";

  export default async function AnalyticsLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    const session = await getServerSession(authOptions);
    const isAdmin = session?.user?.role === "ADMIN";

    const adminNav = [
      { label: "Dashboard", href: "/analytics/admin" },
      { label: "Siteler", href: "/analytics/admin#sites" },
      { label: "Kullanıcılar", href: "/analytics/admin#users" },
    ];

    const customerNav = [
      { label: "Genel Bakış", href: "/analytics" },
      { label: "İçerikler", href: "#" },
      { label: "Ayarlar", href: "#" },
    ];

    const navItems = isAdmin ? adminNav : customerNav;

    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <aside className="hidden h-screen w-64 flex-col border-r border-slate-200 bg-white px-5 py-6 lg:fixed lg:inset-y-0 lg:left-0 lg:flex">
          <Link href="/analytics" className="text-lg font-semibold text-slate-900">
            Gundemhane Analytics
          </Link>
          <p className="mt-2 text-xs text-slate-500">
            Dashboard-first, hızlı raporlama
          </p>
          <nav className="mt-8 space-y-2 text-sm">
            {navItems.map((item) => {
              const disabled = item.href === "#";
              return disabled ? (
                <span
                  key={item.label}
                  className="flex items-center rounded-lg px-3 py-2 text-slate-400"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center rounded-lg px-3 py-2 text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            {session?.user?.email ?? "Signed out"}
          </div>
        </aside>

        <div className="lg:pl-64">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Analytics
                </div>
                <div className="text-lg font-semibold text-slate-900">
                  {isAdmin ? "Admin Panel" : "Customer Panel"}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 lg:hidden">
                {navItems.map((item) =>
                  item.href === "#" ? (
                    <span
                      key={item.label}
                      className="rounded-full border border-slate-200 px-3 py-1"
                    >
                      {item.label}
                    </span>
                  ) : (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="rounded-full border border-slate-200 px-3 py-1 text-slate-700"
                    >
                      {item.label}
                    </Link>
                  )
                )}
              </div>
            </div>
          </header>
          <div className="px-6 py-8">{children}</div>
        </div>
      </div>
    );
  }

