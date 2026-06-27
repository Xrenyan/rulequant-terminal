"use client";

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";

type DataTableProps<T> = {
  data: T[];
  columns: ColumnDef<T>[];
  dense?: boolean;
};

export function DataTable<T>({ data, columns, dense = false }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="max-w-full overflow-hidden rounded-xl border border-white/[0.10] bg-white/[0.035] shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 border-b border-white/[0.08] bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder="搜索期号、公式、结果..."
          className="h-10 w-full max-w-sm rounded-lg border border-white/10 bg-white/[0.055] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/10"
        />
        <span className="shrink-0 text-xs text-slate-500">显示 {table.getFilteredRowModel().rows.length} / {data.length}</span>
      </div>
      <div className="max-h-[560px] overflow-auto [-webkit-overflow-scrolling:touch]">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm sm:min-w-[760px]">
          <thead className="sticky top-0 z-10 bg-[#0b0f1a]/95 backdrop-blur">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="border-b border-white/[0.08] px-3 py-3 text-xs font-medium text-slate-500">
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn("inline-flex items-center gap-1 text-left", header.column.getCanSort() && "hover:text-slate-200")}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" && <span>↑</span>}
                        {header.column.getIsSorted() === "desc" && <span>↓</span>}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-white/[0.05] transition hover:bg-white/[0.035]">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={cn("px-3 text-slate-200", dense ? "py-2" : "py-3")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>第 {table.getState().pagination.pageIndex + 1} / {Math.max(table.getPageCount(), 1)} 页，每页 20 条</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="rounded-md border border-white/10 bg-white/[0.06] px-3 py-1 text-slate-100 disabled:opacity-40"
          >
            上一页
          </button>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="rounded-md border border-white/10 bg-white/[0.06] px-3 py-1 text-slate-100 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
