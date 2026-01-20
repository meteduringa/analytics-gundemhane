  "use client";

  import type { ReactNode } from "react";

  export default function DataTable({
    headers,
    rows,
    empty,
  }: {
    headers: string[];
    rows: ReactNode[][];
    empty: ReactNode;
  }) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.length ? (
              rows.map((row, index) => (
                <tr key={`row-${index}`} className="text-slate-700">
                  {row.map((cell, cellIndex) => (
                    <td key={`cell-${index}-${cellIndex}`} className="px-4 py-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={headers.length} className="px-4 py-8">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }
