"use client";
import { useSyncExternalStore } from "react";
import { emptyWorkspace } from "./empty";
import { isWorkspace } from "./logic";
import type { Workspace } from "./model";
let cached = emptyWorkspace;
let revision = 0;
let initialized = false;
let loading: Promise<void> | undefined;
let saving = false;
let pending = false;
let blocked = false;
let storageError = "";
let status = "Loading local database…";
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const draftKey = "career-compass:unsaved:v2";
export function initializeWorkspace() {
  if (loading) return loading;
  loading = (async () => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !isWorkspace(data.workspace))
        throw new Error(data.error || "Could not load the database.");
      cached = data.workspace;
      revision = data.revision;
      initialized = true;
      status = "Saved to local database";
      try {
        if (localStorage.getItem(draftKey))
          storageError =
            "A browser backup of unsaved edits exists. Export it from Settings before making new edits.";
      } catch {
        /* Database persistence does not depend on browser storage. */
      }
    } catch (error) {
      storageError =
        error instanceof Error ? error.message : "Could not load database.";
      status = "Database unavailable";
    }
    emit();
  })();
  return loading;
}
async function flush() {
  if (saving || blocked || !pending) return;
  saving = true;
  while (pending && !blocked) {
    pending = false;
    const workspace = cached;
    try {
      const response = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace, revision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Database save failed.");
      revision = data.revision;
      if (!pending) {
        status = "Saved to local database";
        storageError = "";
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* Optional recovery copy. */
        }
      }
    } catch (error) {
      blocked = true;
      pending = true;
      status = "Unsaved edits";
      storageError =
        (error instanceof Error ? error.message : "Save failed.") +
        " Export your records from Settings before reloading.";
    }
  }
  saving = false;
  emit();
}
export function updateWorkspace(updater: (state: Workspace) => Workspace) {
  if (!initialized || blocked) {
    storageError ||= "Database is not ready. Reload before editing.";
    emit();
    return;
  }
  const next = updater(cached);
  if (!isWorkspace(next)) {
    storageError = "Invalid edit was not saved.";
    emit();
    return;
  }
  cached = next;
  pending = true;
  status = "Saving…";
  try {
    localStorage.setItem(draftKey, JSON.stringify(next));
  } catch {
    /* The server remains the source of truth. */
  }
  emit();
  void flush();
}
export function hasUnsavedChanges() {
  return pending || saving;
}
export function workspaceRevision() {
  return revision;
}
export function useWorkspace() {
  return useSyncExternalStore(
    subscribe,
    () => cached,
    () => emptyWorkspace,
  );
}
export function useStorageError() {
  return useSyncExternalStore(
    subscribe,
    () => storageError,
    () => "",
  );
}
export function useStorageStatus() {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => "Loading local database…",
  );
}
export function resetWorkspace() {
  updateWorkspace(() => structuredClone(emptyWorkspace));
}

// Pull external agent changes only when there are no local edits in flight.
export async function refreshWorkspace() {
  if (!initialized || saving || pending || blocked) return;
  const before = revision;
  try {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !isWorkspace(data.workspace)) return;
    if (
      !saving &&
      !pending &&
      !blocked &&
      revision === before &&
      data.revision > revision
    ) {
      cached = data.workspace;
      revision = data.revision;
      emit();
    }
  } catch {
    /* Next poll retries without replacing local state. */
  }
}
