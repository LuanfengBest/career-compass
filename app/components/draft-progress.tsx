"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { TaskSnapshot } from "../lib/tasks";
import { taskStatusLabel } from "../lib/tasks";

export function DraftProgress({ contactId }: { contactId: string }) {
  const [data, setData] = useState<TaskSnapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true, loading = false;
    async function refresh() {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const r = await fetch("/api/tasks", { cache: "no-store" });
        if (!r.ok) throw new Error("Could not read draft task status.");
        const snapshot = await r.json();
        if (alive) { setData(snapshot); setError(""); }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "Queue unavailable"); }
      finally { loading = false; }
    }
    void refresh();
    const timer = setInterval(refresh, 5000);
    window.addEventListener("tasks-refresh", refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("tasks-refresh", refresh); };
  }, []);
  const task = data?.tasks.find(t => t.kind === "draft" && t.entityId === contactId && t.status !== "cancelled");
  const batch = data?.batches.find(b => b.status !== "cancelled" && b.status !== "released" && data.discoveries.some(d => d.batchId === b.id && d.entityId === contactId && d.kind === "contact"));
  const pending = data?.tasks.filter(t => t.batchId === batch?.id && t.kind === "discover" && t.status !== "completed");
  return <div className="panel">
    <h2>{task ? `Draft: ${taskStatusLabel(task.status)}` : batch ? "Waiting for discovery completion" : "No draft task yet"}</h2>
    {error ? <p role="alert">{error}</p> : !data ? <p>Checking task status…</p> : task ? <>
      <p>Owner: {task.owner}. {task.status === "queued" ? "Assigned and ready. The agent must pick this up on its next queue check; no further approval is required to draft." : task.status === "claimed" ? "The agent has claimed this draft. Waiting for its saved result." : task.result?.summary || "See the task for details."}</p>
      <Link className="text-link" href={`/tasks#task-${task.id}`}>View draft task ↗</Link>
    </> : batch ? <>
      <p>{batch.title}. {pending?.map(t => `${t.owner}: ${taskStatusLabel(t.status)}`).join(" · ") || "Discovery reports complete."}</p>
      <p>{batch.autoRelease ? "Once both agents submit their completion reports, the website automatically merges discoveries and queues the owner's draft. No release click is needed." : "This older round requires execution release in Tasks."}</p>
      <Link className="text-link" href="/tasks">View discovery round ↗</Link>
    </> : <><p>No active draft assignment was found. Check contact history before requesting a new draft.</p><Link className="text-link" href="/tasks">Create a draft task ↗</Link></>}
  </div>;
}
