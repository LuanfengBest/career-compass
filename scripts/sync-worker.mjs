import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
const require = createRequire(import.meta.url);
const { syncWorkerTick } = require("../.worker-build/server/sync-worker.js");
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
console.log(
  "Career Compass Gmail worker: read-only, 60-second checks; Settings controls pause.",
);
while (!stopping) {
  try {
    const result = await syncWorkerTick();
    if (result)
      console.log(
        `${result.checkedAt} ${result.state}; next check ${result.nextCheck}`,
      );
  } catch {
    console.error("Worker storage failure. Retrying; no messages sent.");
  }
  if (!stopping) await delay(10000);
}
