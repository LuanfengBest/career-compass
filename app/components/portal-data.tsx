"use client";
import { useEffect, useState } from "react";
import type { PortalSnapshot } from "../lib/portal";
export const emptyPortal: PortalSnapshot = {
  drafts: [],
  events: [],
  agents: [],
  sendEnabled: false,
  syncAt: null,
};
export async function portalAction(payload: Record<string, unknown>) {
  const r = await fetch("/api/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Operation failed");
  window.dispatchEvent(new Event("portal-refresh"));
  return data;
}
export function usePortal() {
  const [data, setData] = useState(emptyPortal),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true,
      loading = false;
    async function refresh() {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const r = await fetch("/api/portal", { cache: "no-store" });
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (live) {
          setData(v);
          setError("");
        }
      } catch (e) {
        if (live)
          setError(e instanceof Error ? e.message : "Portal unavailable");
      } finally {
        loading = false;
      }
    }
    void refresh();
    const timer = setInterval(refresh, 5000);
    window.addEventListener("portal-refresh", refresh);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("portal-refresh", refresh);
    };
  }, []);
  return { data, error };
}

export function ContactMailSync() {
  useEffect(() => {
    let stopped = false,
      active = false;
    async function tick() {
      if (stopped || active || document.visibilityState !== "visible") return;
      active = true;
      try {
        const status = await fetch("/api/integrations", {
          cache: "no-store",
        }).then((r) => r.json());
        if (
          status.gmail?.connected &&
          !status.gmail?.paused &&
          !stopped &&
          !(
            status.worker &&
            Date.parse(status.worker.nextCheck) + 120000 > Date.now()
          )
        )
          await portalAction({ action: "sync" });
      } catch {
        /* Manual sync displays the error; retry next minute. */
      } finally {
        active = false;
      }
    }
    const timer = setInterval(tick, 60000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);
  return null;
}
