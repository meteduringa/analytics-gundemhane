"use client";

import { Checkbox } from "@/components/dashboard/Checkbox";
import { ChangeEvent } from "react";

type FiltersBarProps = {
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onToggleShortReads: (value: boolean) => void;
  hideShortReads: boolean;
  onFilter: () => void;
};

const FiltersBar = ({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  onToggleShortReads,
  hideShortReads,
  onFilter,
}: FiltersBarProps) => {
  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm shadow-slate-900/5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-xs font-semibold text-slate-500">
          Başlangıç
          <input
            type="date"
            value={startValue}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onStartChange(event.target.value)
            }
            className="mt-2 rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
          />
        </label>

        <label className="flex flex-col text-xs font-semibold text-slate-500">
          Bitiş
          <input
            type="date"
            value={endValue}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onEndChange(event.target.value)
            }
            className="mt-2 rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
          />
        </label>

        <button
          type="button"
          onClick={onFilter}
          className="rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 px-5 py-2 text-xs font-semibold uppercase tracking-widest text-white shadow-md shadow-purple-500/30 transition hover:brightness-95"
        >
          Filtrele
        </button>
        <button
          type="button"
          className="rounded-2xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500"
          disabled
          title="Yayında değil"
        >
          Excel İndir
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-1 text-xs text-slate-400 sm:flex-row sm:items-center sm:gap-3">
        <Checkbox
          label="1 sn altı okumaları gizle"
          checked={hideShortReads}
          onChange={() => onToggleShortReads(!hideShortReads)}
        />
        <span>1 saniyeden kısa oturumları istatistiklerden çıkarır.</span>
      </div>
    </div>
  );
};

export default FiltersBar;
