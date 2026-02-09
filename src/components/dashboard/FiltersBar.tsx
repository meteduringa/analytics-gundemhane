"use client";

import { ChangeEvent } from "react";

type FiltersBarProps = {
  dateValue: string;
  onDateChange: (value: string) => void;
  onFilter: () => void;
  onRefresh: () => void;
  disableDate?: boolean;
};

const FiltersBar = ({
  dateValue,
  onDateChange,
  onFilter,
  onRefresh,
  disableDate = false,
}: FiltersBarProps) => {
  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm shadow-slate-900/5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-xs font-semibold text-slate-500">
          Gün
          <input
            type="date"
            value={dateValue}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onDateChange(event.target.value)
            }
            disabled={disableDate}
            className="mt-2 rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500 disabled:cursor-not-allowed disabled:bg-slate-100"
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
          onClick={onRefresh}
          className="rounded-2xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
        >
          Yenile
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
    </div>
  );
};

export default FiltersBar;
