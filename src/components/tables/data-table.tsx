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
    <div className="rq-data-table max-w-full overflow-hidden">
      <div className="rq-data-table__toolbar flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder="搜索期号、公式、结果..."
          className="rq-field h-10 w-full border px-3 text-sm outline-none sm:max-w-sm"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 sm:justify-end">
          <span className="sm:hidden">横向滑动查看更多列</span>
          <span className="shrink-0">显示 {table.getFilteredRowModel().rows.length} / {data.length}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="rq-button rq-button--secondary h-10 rounded-md border px-3 text-[13px] disabled:opacity-40">上一页</button>
            <span className="min-w-16 text-center">第 {table.getState().pagination.pageIndex + 1}/{Math.max(table.getPageCount(), 1)} 页</span>
            <button type="button" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="rq-button rq-button--secondary h-10 rounded-md border px-3 text-[13px] disabled:opacity-40">下一页</button>
          </div>
        </div>
      </div>
      <div className="rq-scrollbar overflow-x-auto overflow-y-visible [-webkit-overflow-scrolling:touch]">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs sm:min-w-[760px] sm:text-sm">
          <thead className="rq-data-table__head backdrop-blur">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="border-b border-white/[0.08] px-2 py-2 text-xs font-medium text-slate-500 sm:px-3 sm:py-3">
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn("inline-flex min-w-0 items-center gap-1 text-left", header.column.getCanSort() && "hover:text-slate-200")}
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
              <tr key={row.id} className="rq-data-table__row border-b transition">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={cn("px-2 align-top text-slate-200 sm:px-3", dense ? "py-2" : "py-2.5 sm:py-3")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
