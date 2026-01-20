  "use client";

  export default function EmptyState({
    title,
    description,
  }: {
    title: string;
    description: string;
  }) {
    return (
      <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <p className="mt-2 text-xs text-slate-500">{description}</p>
      </div>
    );
  }
