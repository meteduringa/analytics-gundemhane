"use client";

import { Diamond, LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";

const menuItems = [
  { label: "Anasayfa", href: "/panel" },
  { label: "Ziyaretçi (Anlık)", href: "/panel" },
  { label: "Ziyaretçi (Günlük)", href: "/panel" },
  { label: "Ayarlar", href: "/panel/ayarlar" },
];

type LayoutProps = PropsWithChildren;

const DashboardLayout = ({ children }: LayoutProps) => {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-20">
        <div className="flex items-center justify-between bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 px-6 py-4 text-white shadow-lg shadow-purple-600/30">
          <div className="flex items-center gap-3 text-sm font-semibold tracking-[0.2em]">
            <Diamond className="h-5 w-5" />
            Elmas İstatistik
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-white/90">
              Hoş geldiniz
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-white/60 px-4 py-1 text-sm font-semibold text-white transition hover:bg-white/10"
              onClick={() => {
                window.localStorage.removeItem("auth");
                window.localStorage.removeItem("user");
                window.location.href = "/login";
              }}
            >
              <LogOut className="h-4 w-4" />
              Çıkış
            </button>
          </div>
        </div>
      </div>

      <div className="lg:grid lg:min-h-[calc(100vh-72px)] lg:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-slate-200/70 bg-white/80 p-6 shadow-lg shadow-slate-900/5 lg:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-400">
            MENU
          </p>
          <nav className="mt-6 flex flex-col gap-3 text-sm font-semibold text-slate-800">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
              <Link
                href={item.href}
                key={item.label}
                className={`flex items-center justify-between rounded-2xl px-4 py-3 transition ${
                  isActive
                    ? "bg-slate-100 text-slate-900 shadow-sm shadow-slate-900/10"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <span>{item.label}</span>
                <Menu className="h-3 w-3" />
              </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-h-screen bg-slate-50 px-6 py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
