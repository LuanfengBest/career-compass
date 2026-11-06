# Historical data and cloud cutover

`scripts/import-history.mjs` imports a reviewed manifest into an **offline SQLite snapshot**. It does not fetch jobs, send messages, or submit applications. Run `npm test` first to compile the workspace validator, then:

```sh
node scripts/import-history.mjs OFFLINE_SNAPSHOT REVIEWED_MANIFEST
```

Keep the manifest, source documents, databases, tokens and migration receipts under the ignored `.data/` directory. Never commit these files.

The importer preserves canonical IDs and stronger existing evidence. Reviewed identity aliases merge historical records with live records. Repeated imports reuse stable IDs. Historical sending, replies and bounces are labeled as user-supplied reports, separately from Gmail verification. LinkedIn replies do not make a bounced email valid. Historical submitted applications hold obsolete preparation/submission tasks to prevent reapplication.

Before cloud cutover, stop the local server and worker, create a consistent SQLite backup, import into a separate copy and run `PRAGMA integrity_check`. Back up the cloud database as well. Stop cloud writers before replacing the database and its WAL/SHM files. Preserve both rollback snapshots. Invalidate old browser claims and connections when moving environments; never retry an uncertain external send or submission automatically.

After restart, compare workspace jobs, contacts and applications plus every persisted table's row count. Confirm the persistent volume path and matching encryption key without printing secrets. Resume Gmail only after verifying migration. Create separate HTTPS credentials for each external agent through the owner-authenticated portal. Updating a website credential does not update external schedules or transfer LinkedIn browser sessions.

Only the cloud database should receive new writes after cutover. Native agent routines must switch to the cloud origin and verify a real authenticated round trip before being described as connected.
