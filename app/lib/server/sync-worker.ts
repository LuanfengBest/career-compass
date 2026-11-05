import {
  acquireLease,
  releaseLease,
  readSetting,
  setSetting,
} from "./database";
import { gmailStatus, syncGmail } from "./gmail";
import { syncContactMail } from "./portal-mail";
export type WorkerHealth = {
  state: "running" | "idle" | "paused" | "disconnected" | "backoff";
  checkedAt: string;
  lastSuccess?: string;
  nextCheck: string;
  failures: number;
  message: string;
};
// Read-only Gmail polling. The loop runs outside Next.js so closing the page does not stop it.
export async function syncWorkerTick() {
  const previous = readSetting<WorkerHealth>("sync_worker");
  if (previous?.nextCheck && Date.parse(previous.nextCheck) > Date.now())
    return;
  if (!acquireLease("sync_worker", 1200)) return;
  const now = new Date().toISOString();
  let health: WorkerHealth = {
    state: "running",
    checkedAt: now,
    nextCheck: now,
    failures: previous?.failures || 0,
    lastSuccess: previous?.lastSuccess,
    message: "Reading Gmail application and known-contact evidence.",
  };
  try {
    const status = gmailStatus();
    if (!status.connected || status.paused) {
      health = {
        ...health,
        state: status.paused ? "paused" : "disconnected",
        failures: 0,
        message: status.paused
          ? "Gmail sync paused in Settings."
          : "Connect Gmail to start reading.",
      };
    } else {
      setSetting("sync_worker", health);
      const application = await syncGmail();
      const contacts = await syncContactMail();
      health = {
        ...health,
        state: "idle",
        lastSuccess: new Date().toISOString(),
        failures: 0,
        message: `Application page checked (${application.imported} new events). ${contacts.message}`,
      };
    }
    health.nextCheck = new Date(Date.now() + 60000).toISOString();
  } catch (e) {
    const failures = Math.min(health.failures + 1, 5);
    health = {
      ...health,
      state: "backoff",
      failures,
      message:
        e instanceof Error
          ? e.message
          : "Gmail sync failed; checkpoint retained.",
      nextCheck: new Date(
        Date.now() + Math.min(15 * 60000, 60000 * 2 ** (failures - 1)),
      ).toISOString(),
    };
  } finally {
    health.checkedAt = new Date().toISOString();
    setSetting("sync_worker", health);
    releaseLease("sync_worker");
  }
  return health;
}
