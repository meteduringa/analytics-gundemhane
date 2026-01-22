"use client";

type StatsCardProps = {
  title: string;
  value: string;
  accent?: string;
  detail?: string;
  tone?: string;
};

const StatsCard = ({ title, value, accent, detail, tone }: StatsCardProps) => {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border border-white/40 p-5 shadow-sm shadow-slate-900/5 ${
        tone ?? "bg-white"
      }`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
        {title}
      </span>
      <p className={`text-3xl font-semibold text-slate-900 ${accent ?? ""}`}>
        {value}
      </p>
      {detail && <p className="text-xs text-slate-500">{detail}</p>}
    </div>
  );
};

export default StatsCard;
