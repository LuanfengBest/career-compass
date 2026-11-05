"use client";
import { useState } from "react";
export function usePagination<T>(all: T[], size: number, key = "") {
  const [selection, setSelection] = useState({ key, page: 1 });
  const pages = Math.max(1, Math.ceil(all.length / size));
  const page = Math.min(selection.key === key ? selection.page : 1, pages);
  return {
    items: all.slice((page - 1) * size, page * size),
    total: all.length,
    size,
    page,
    pages,
    onPage: (value: number) =>
      setSelection({ key, page: Math.max(1, Math.min(value, pages)) }),
  };
}
export function Pagination({
  page,
  pages,
  total,
  size,
  onPage,
  label,
}: {
  page: number;
  pages: number;
  total: number;
  size: number;
  onPage: (page: number) => void;
  label: string;
}) {
  return (
    <nav className="pagination" aria-label={`${label} pagination`}>
      <span>
        {total ? (page - 1) * size + 1 : 0}–{Math.min(page * size, total)} of{" "}
        {total} {label}
      </span>
      <div className="button-row">
        <button
          className="button secondary"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <label>
          Page{" "}
          <select
            aria-label={`${label} page`}
            value={page}
            onChange={(e) => onPage(Number(e.target.value))}
          >
            {Array.from({ length: pages }, (_, i) => (
              <option key={i + 1}>{i + 1}</option>
            ))}
          </select>{" "}
          of {pages}
        </label>
        <button
          className="button secondary"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
