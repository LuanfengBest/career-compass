# ChatGPT Dot: remote MCP with OAuth

The cloud portal exposes a stateless Streamable HTTP MCP server at:

`https://career-compass-production-afa2.up.railway.app/mcp`

This does not call a model API. Muse's existing HTTPS credential connector remains separate.

## Connect once

1. In ChatGPT's custom MCP/plugin connection screen, enter the server URL and choose **OAuth**. Leave client ID and secret empty when automatic client registration is available. Do not enter a Google OAuth secret or the website password as an API key.
2. Follow the authorization link. Sign in to Career Compass using the workspace password, then select **Allow Dot connection**. This grants the fixed `dot` identity, not owner administration.
3. Ask Dot to call `career_connection`, `career_guide`, then `career_tasks`. Verify `actor: dot` and the actual existing queue. No Mac computer control or browser workbench is required for these calls.
4. Continue an existing assigned discovery round, save a genuine record, read it back with `career_workspace`, and complete the task. Do not fabricate a contact or send a test outreach email.
5. Run one independent scheduled execution that uses this installed connection. Only after that succeeds, update existing native schedules to use MCP. Do not create duplicate schedules. A successful interactive call does not prove scheduled reuse.

The authorization screen may still need an initial owner login. Routine tool calls use OAuth access and refresh tokens held by ChatGPT, not the owner's browser cookie. If the client's UI requires a manually supplied client ID, or uses an unrecognized callback, report the exact error; do not disable authentication.

## Tools and permissions

- `career_connection`: authenticated actor and connection expiry.
- `career_guide`: current payload schemas and collaboration policy.
- `career_tasks`: Dot queue, batches and latest profile.
- `career_workspace`: paginated canonical jobs, contacts, applications, drafts, events or profile.
- `career_application_email`: imported application email evidence by ID.
- `career_task_action`: authorized discovery rounds, claim, eligible recovery, heartbeat, report and worker registration.
- `career_submit_report`: one genuine opportunity/contact/draft/evidence record, with stable event ID.

The connector cannot approve, cancel, retry or manually release tasks, change owner configuration, or directly send Gmail. Existing separately approved submission/LinkedIn-send tasks retain their original approval checks. Employer forms and LinkedIn require the agent's own external browser/account access; this MCP connection does not provide it.

## Claims and deduplication

Pass `taskId` to writes, omit `claimToken` and `batchId`. The server stores the claim privately under the OAuth grant and injects it into existing handlers. Call heartbeat every two minutes while working with a new event ID per renewal. Access-token refresh retains the same grant and claim context. A new authorization is a different context.

The existing task and portal handlers continue to enforce deduplication, actor ownership, optimistic versions, live claims and idempotent receipts. Both agents search the full scope. Shared and Dot-only discoveries go to Dot; Muse-only discoveries go to Muse. This adapter does not implement a second assignment engine.

Expired or externally uncertain tasks do not auto-retry. Eligible live read/draft tasks can use the existing explicit `recover_claim` action after stopping their prior context. External form/send/submit recovery still requires reconciliation.

## Security and persistence

- OAuth authorization code + S256 PKCE; one-use, two-minute codes; ten-minute consent nonce bound to the owner session; same-origin approval POST.
- Dynamic registration accepts official ChatGPT HTTPS connector callbacks only. No supplied client URL is fetched.
- Exact resource audience and scope `career:agent`; fixed Dot identity. Legacy bearer credentials and owner cookies are not MCP credentials.
- Access tokens expire after one hour; rotating refresh tokens after 30 days of inactivity; authorization expires after 90 days. Refresh-token replay revokes the grant. Reconnect after expiry/revocation.
- Token and code hashes, grants, registrations and private claims persist in the existing SQLite volume, in `mcp_oauth`. Back up that table with the rest of the database. Never export credentials to a task or chat.
- Revoke all Dot OAuth grants in **Agents → ChatGPT Dot OAuth → Revoke Dot OAuth access**. Muse's connector is unaffected. Revocation stops new API access; it does not undo an external action already taken.
- Exact public route allowlist, host/origin checks and request/rate limits protect the OAuth/MCP entry points. All other website pages remain owner-authenticated.

## Verification

`tests/mcp-oauth.test.mjs` uses an isolated SQLite database to check callbacks, PKCE, code replay, consent binding, audience, token expiry/rotation/replay, client isolation, revocation, private claim retention, ownership/deduplication and actual SDK initialization/tool calls. Deployment probes must also check real HTTP discovery, authorization, refresh and MCP calls. User consent and a genuine independent Dot scheduled run are separate acceptance steps.

Official protocol integration reference: https://developers.openai.com/plugins/build/auth
