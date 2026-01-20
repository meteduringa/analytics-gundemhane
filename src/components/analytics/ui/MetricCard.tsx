  "use client";

  import type { ReactNode } from "react";

  type MetricCardProps = {
    title: string;
    value: ReactNode;
    subtitle?: string;
  };

  export default function MetricCard({ title, value, subtitle }: MetricCardProps) {
    return (
      <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {title}
        </div>
        <div className="mt-3 text-3xl font-semibold text-slate-900">{value}</div>
        {subtitle ? (
          <div className="mt-2 text-xs text-slate-500">{subtitle}</div>
        ) : null}
      </div>
    );
  }

