"use client";
import { useEffect, useState } from "react";
import { Pagination, usePagination } from "../components/pagination";
import { Heading } from "../components/ui";
type Row = Record<string, string>;
type Snapshot = { revision: number; jobs: Row[]; people: Row[]; archived: Row[] };
export default function Page() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [table, setTable] = useState<"jobs" | "people" | "archived">("jobs");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    fetch("/api/data", { cache: "no-store" }).then(async (r) => {
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      if (active) { setData(result); setError(""); }
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [refresh]);
  const rows = (data?.[table] || []).filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(query.toLowerCase())));
  const pagination = usePagination(rows, 30, `${table}:${query}`);
  const columns = Object.keys(data?.[table]?.[0] || {});
  return <div>
    <Heading eyebrow="LOCAL DATABASE" title="Browse saved data" description="Read-only SQLite snapshot. Jobs and People are saved workspace records; legacy website feeds are archived separately. Refresh to read the latest saved revision." />
    <div className="flat-filters">
      <label>Table <select value={table} onChange={(e) => setTable(e.target.value as "jobs" | "people" | "archived")}><option value="jobs">Jobs ({data?.jobs.length ?? "…"})</option><option value="people">People ({data?.people.length ?? "…"})</option><option value="archived">Archived website feeds ({data?.archived.length ?? "…"})</option></select></label>
      <label>Search <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search any column" /></label>
      <button className="button secondary" onClick={() => setRefresh((v) => v + 1)}>Refresh data</button>
      <span>Saved revision {data?.revision ?? "…"}</span>
    </div>
    {error && <p role="alert">{error}</p>}
    <Pagination {...pagination} label={table} />
    <div className="data-browser-table" tabIndex={0} role="region" aria-label={`${table} data table`}>
      <table><thead><tr>{columns.map((c) => <th key={c}>{c.replaceAll("_", " ")}</th>)}</tr></thead>
      <tbody>{pagination.items.map((row) => <tr key={row.id}>{columns.map((c) => <td key={c}>{row[c] || "—"}</td>)}</tr>)}</tbody></table>
    </div>
    {!rows.length && data && <p>No saved records match this view.</p>}
    <p className="collection-note">SQLite views: SELECT * FROM jobs; · SELECT * FROM people; · Edits belong in Opportunities and People.</p>
  </div>;
}
