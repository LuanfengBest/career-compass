// One-time strong-identity migration. No company/title fuzzy merges.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { backup } from "node:sqlite";
const require = createRequire(import.meta.url);
const {
  db,
  readWorkspace,
  writeWorkspace,
} = require("../.test-build/server/database.js");
const { canonicalJobUrl } = require("../.test-build/job-identity.js");
const d = db();
mkdirSync(".data/backups", { recursive: true });
const file = `.data/backups/before-job-identity-${Date.now()}.sqlite`;
await backup(d, file);
d.exec("BEGIN IMMEDIATE");
try {
  const { workspace: w, revision } = readWorkspace();
  // Current migration targets a pre-task catalogue; do not silently rewrite task evidence.
  const taskCount = Number(
    d.prepare("SELECT count(*) AS n FROM execution_tasks").get().n,
  );
  if (taskCount)
    throw new Error(
      "Task history exists; canonical ID migration needs explicit task-reference reconciliation.",
    );
  const index = new Map(),
    aliases = new Map(),
    jobs = [];
  for (const j of w.jobs) {
    const key = canonicalJobUrl(j.jdUrl) || j.id,
      existing = index.get(key);
    if (!existing) {
      index.set(key, j);
      jobs.push(j);
      continue;
    }
    // Conflicting assignments/application records require a deliberate review.
    if (
      (existing.applicationOwner &&
        j.applicationOwner &&
        existing.applicationOwner !== j.applicationOwner) ||
      w.applications.some((a) => a.jobId === j.id)
    )
      throw new Error("Protected duplicate requires manual reconciliation.");
    aliases.set(j.id, existing.id);
    existing.alternateSources = [
      ...(existing.alternateSources || []),
      { id: j.id, source: j.source, url: j.jdUrl, sourceId: j.sourceId },
      ...(j.alternateSources || []),
    ];
    const actors = [
      ...new Set([...(existing.discoveredBy || []), ...(j.discoveredBy || [])]),
    ];
    if (actors.length) existing.discoveredBy = actors;
  }
  for (const c of w.contacts)
    c.jobIds = [...new Set(c.jobIds.map((id) => aliases.get(id) || id))];
  w.jobs = jobs;
  if (!writeWorkspace(w, revision)) throw new Error("Revision changed");
  d.exec("COMMIT");
  console.log(
    JSON.stringify({
      before: jobs.length + aliases.size,
      after: jobs.length,
      removedExactDuplicates: aliases.size,
      backup: file,
    }),
  );
} catch (e) {
  d.exec("ROLLBACK");
  throw e;
} finally {
  d.close();
}
