  "use client";

  export default function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={`skeleton-${index}`}
            className="h-4 w-full animate-pulse rounded-full bg-slate-200"
          />
        ))}
      </div>
    );
  }
