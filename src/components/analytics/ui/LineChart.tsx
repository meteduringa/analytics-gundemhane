  "use client";

  import EmptyState from "./EmptyState";

  export default function LineChart({ hasData }: { hasData: boolean }) {
    if (!hasData) {
      return (
        <EmptyState
          title="Henüz veri yok"
          description="İzleme kodu yerleştirildikten sonra grafikler burada görünecek."
        />
      );
    }

    return (
      <div className="relative h-[260px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Ziyaretçi / Gösterim
        </div>
        <div className="mt-4 h-[180px] rounded-xl bg-gradient-to-br from-slate-50 via-white to-slate-100">
          <svg
            viewBox="0 0 600 200"
            className="h-full w-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0f172a" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,140 C80,110 140,100 200,120 C260,140 320,90 380,100 C440,110 500,70 600,80"
              fill="none"
              stroke="#0f172a"
              strokeWidth="2.5"
            />
            <path
              d="M0,140 C80,110 140,100 200,120 C260,140 320,90 380,100 C440,110 500,70 600,80 L600,200 L0,200 Z"
              fill="url(#lineFill)"
            />
          </svg>
        </div>
        <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-slate-900" />
            Ziyaretçi
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            Gösterim
          </span>
        </div>
      </div>
    );
  }
