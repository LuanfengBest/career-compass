# Private Railway deployment

This release keeps Next.js + Node 24 + SQLite. GitHub holds source code; Railway runs the website and the read-only Gmail worker. Dot and Muse still run in their own products. Deploying this website does not activate their schedules or move their browser sessions.

## Short setup

1. Sign in at https://railway.com using your GitHub account.
2. Create **New Project → Deploy from GitHub repo**. Grant access to the private `LuanfengBest/career-compass` repository and select it. Railway uses the committed Dockerfile. The first start may fail until the configuration below is complete; no private data is exposed.
3. Attach a **Volume** to the website service, mount path **`/data`**. Keep **one replica**; do not use an ephemeral disk for SQLite.
4. In the service's **Variables → RAW Editor**, paste the contents of the local `.data/deploy/railway.env`. It contains secrets: paste only into Railway Variables, never into GitHub or chat. Generate it if missing with `node scripts/prepare-cloud-env.mjs`. Existing local Gmail encryption keys are preserved. The generated website password is in `.data/deploy/workspace-login.txt`.
5. In **Settings → Networking → Public Networking**, generate a domain with target port **3000**. Set `APP_URL` in Variables to that exact **HTTPS origin**, without a path. The launcher can also derive it from Railway's `RAILWAY_PUBLIC_DOMAIN`. Apply changes / redeploy.
6. Open the domain. You should see a password login. Sign in using the private password file. `/api/health` is public and contains no personal data; business pages and APIs require authentication.
7. In Google Cloud's existing OAuth Web Client, add **`https://YOUR-DOMAIN/api/gmail/callback`** to Authorized redirect URIs. Keep the local callback until migration is finished. Connect Gmail from the cloud site's Settings. Gmail sending needs its separate send permission; read-only OAuth cannot send.

Official instructions: https://docs.railway.com/quick-start, https://docs.railway.com/volumes, https://docs.railway.com/variables. Hosting is billed according to your Railway plan and resource use; check the displayed cost before subscribing.

## Existing data and cutover

**A new deployment starts with an empty database. Pushing GitHub does not copy your local contacts, drafts, messages, tasks, or Gmail tokens.** Keep the local website as the active workspace until a deliberate cutover.

After the domain works:

1. Finish or reconcile in-flight agent work; briefly stop writes to the local portal for the final snapshot. Keep the agents' daily search schedules intact. Searches can retain pending results for later upload.
2. Create a consistent SQLite backup using the SQLite backup API (not a naked copy while WAL writes continue). Transfer the backup privately to the Railway volume while the cloud website and worker are stopped. Never commit or embed it in a Docker image. This step requires authenticated hosting access and is not performed by the deployment script.
3. Use the same `TOKEN_ENCRYPTION_KEY` to preserve encrypted OAuth tokens. Verify jobs, people, drafts, applications and coordination batches against the local snapshot before restarting writes. Review any expired claims or uncertain sends; never reset them into automatic resend tasks.
4. Change both agents' native schedule instructions to the cloud HTTPS URL, keep the same coordination rules and round keys, and explicitly stop writes to the old local database. Local and cloud databases do not replicate.
5. Sign in to the cloud website and pair each agent's own browser session in `/agent-workbench`. Browser pairs expire after 12 hours; renewal still needs a working authenticated browser. Opening the homepage is not an authenticated queue test. Separate browser profiles/sessions avoid overwriting the other agent's pairing.
6. Confirm one authenticated read, one real result upload and its read-back receipt per agent, then a genuine scheduled run. A saved schedule or worker registration alone is not proof of execution.

Cloud hosting keeps the website and Gmail worker available when your Mac is off. An agent workflow that still needs your Mac's Chrome cannot run those local steps while the Mac is off.

## Implementation and limits

- `Dockerfile`, `railway.json`, `scripts/start-cloud.mjs`: Node 24 build, one web process plus Gmail worker, health check, shutdown and crash restart behavior.
- `proxy.ts`, `app/lib/server/owner-auth.ts`, `app/api/auth/*`, `app/login/page.tsx`: private owner login, salted scrypt password hash, signed 12-hour HttpOnly/Secure session, SQLite-backed login throttling, logout. This is a single-owner MVP, not multi-user IAM.
- `app/lib/server/http.ts`: cloud HTTPS/Host/Origin validation; local loopback restrictions remain. Explicit agent endpoints additionally verify their bearer token or paired browser session.
- `.data/`, `.env.local` and generated deployment secrets are excluded from Git and Docker build contexts. Persistent disk is not a backup: enable Railway volume backups after the first data migration.
- No website model API or public job crawler is introduced. No email, LinkedIn message or application is sent merely by deploying.
- There is no automatic local-to-cloud migration, no automatic external agent activation, and no verified cloud deployment until the real domain and persistence check succeed.
