> Current behavior: see COLLABORATION_WORKFLOW.md policy 2026-11-05.5 for daily routines, batch review, application form states, native schedule approvals and current transport instructions. Earlier sections below describe historical MVP stages.

> 2026-11-05 更新：已加入网站任务队列、发现批次、执行领取、审核提交和 LinkedIn Agent 发送/读取任务。以 [COLLABORATION_WORKFLOW.md](COLLABORATION_WORKFLOW.md) 为当前操作说明。下方为前一版实现记录，状态快照不代表当前数据。

# Personal-agent portal MVP — 2026-11-04

This document supersedes older plans for a website-owned model API or autonomous outreach. The site has no model API dependency. Muse and ChatGPT Dot perform research, drafting and semantic interpretation in their existing products. Career Compass stores shared records, shows progress, accepts edits and offers user-triggered Gmail sending.

## Run and connect

1. Run `npm run dev` with Node.js 24+. Open http://127.0.0.1:3000.
2. Open **Agents** at http://127.0.0.1:3000/agents. Create separate connection instructions for Dot and Muse; privately paste each into the corresponding existing task conversation. Each instruction contains an individual revocable bearer token. Do not publish it or commit it.
3. The agent must be able to make authenticated HTTP requests to this computer. Opening the site alone is insufficient. A cloud-only environment's `127.0.0.1` is not this Mac. No native Muse/Dot connector or remote tunnel has been verified or installed. Do not weaken the loopback guards to publish this build.
4. A successful authenticated request changes **Not connected / Awaiting check-in** to **Check-in received**. Ask the agent to report actual authorized discoveries, current drafts and historical outreach from its task. No sample contacts are inserted. A check-in is not continuous background execution.
5. Verify a real contact in **People**, its provenance and draft owner, then its draft in **Outreach**. Edit and save it if necessary.
6. Existing Gmail authorization is read-only. In **Settings → Enable Gmail sending**, grant the added sending permission. This does not require a model API key. An authorized draft can then be sent by clicking **Send this draft**. This implementation has not been validated with a real outbound email yet.

An external agent must cooperate with this reporting contract; the site cannot inspect another product's private chat, reasoning or every browser action automatically. Reported steps update the visible portal every five seconds. This is direct event reporting, not Markdown snapshot import.

## Responsibilities and state

| Owner | Responsibility |
| --- | --- |
| Muse / Dot | Find jobs and people; cite identity, relationship and fit evidence; produce drafts; interpret messages with exact original evidence |
| Website | Canonical identities, ownership, duplicate prevention, draft edits, user-triggered sending, timeline and dashboard |
| Gmail API | Read original mail, sent-message evidence, incoming messages and delivery reports; supply exact original-message links |
| User | Review/edit/send; resolve ambiguous identities or application matches; send LinkedIn messages in LinkedIn |

- Dot owns drafting for every contact Dot discovered, including shared discoveries. Muse owns Muse-only discoveries. Agents must refresh before drafting. An owner change blocks sending an old-owner draft; edited drafts are protected from replacement and may need resolution before sending.
- Exact canonical LinkedIn profile URLs merge contact discoveries. Same name/company only yields duplicate candidates; guessed email is not an identity key. Agent-specific external IDs resolve repeat discoveries. Opportunities deduplicate canonical JD URLs; alternate URLs for the same role still need review.
- Every write carries an `eventId`. Retries with the same actor/event ID return the first result without repeating the operation. Manual workspace edits use existing revision checks; draft editing/sending uses a version check.
- The agents do not need shared conversation history. They do need shared contact IDs, draft owner, latest draft/version and contact history. The API supplies that business state.
- Historical sends reported by an agent remain labelled as reports until Gmail supplies evidence. The send guard checks previous contact/address activity to prevent another first outreach. Automatic follow-up sending is not implemented.

## Screens and message handling

- **Overview:** submitted-application stage totals and contact-level outreach totals. Saved / To apply are opportunities, not submitted applications. Email-event counts are separate from unique application counts.
- **Opportunities:** all retained leads, with filters, employer JD and related people. A lead is not a verified eligible 2027 full-time vacancy.
- **People:** profile photo when a real permitted LinkedIn image URL exists (otherwise initials), name/title/company, relationship/reason, email source and bounce status, separate LinkedIn status, exact corresponding email link when available, and an expandable communication timeline. An inferred address is not labelled verified; successful submission to Gmail does not prove delivery.
- **Outreach:** agent drafts only; edit, save, copy or send. LinkedIn opens externally for manual sending. Old template drafts remain readable but are not silently converted into agent output.
- **Agents:** actual check-in time and reported actions. No fake online indicator or fabricated work history.
- **Data:** http://127.0.0.1:3000/data shows saved jobs and people in readable tables.

Gmail continues to import recent application mail using the existing 30-day flow. Agents can retrieve an original cached recent message and submit `application_analysis` with an exact quote, relevance and stage. A verified existing `jobId` may create an Agent-origin application. Newer evidence updates Agent-origin records; older evidence cannot regress their stage, and manual records/classifications are preserved. Without a confident existing job match, the result stays an email event rather than inflating unique application totals.

Contact-mail syncing processes one contact/page per request, up to 25 messages and a 30-day window, with a persisted cursor. It runs each minute while a portal page is visible and Gmail reads are enabled, or from **People → Sync contact mail**. Incoming mail is initially **Incoming · review needed**, not a human reply. A matching permanent address failure (`5.1.1`) marks the address invalid; temporary/other delivery issues stay reviewable. Agents can interpret synced events with a quote. This is polling, not Gmail push or an always-running cloud job.

## Integration contract and files

Read the live examples at http://127.0.0.1:3000/api/agents/guide.

- `GET /api/agents`: authenticated profile, jobs, canonical contacts/owners, applications, drafts, events and recent application-mail metadata.
- `GET /api/agents?applicationMail=<id>`: authenticated original recent cached mail body (respects paused reads).
- `POST /api/agents`: `progress`, `opportunity`, `contact`, `draft`, `outreach_report`, `interpretation`, or `application_analysis`.
- `GET /api/portal`: local UI snapshot; `POST /api/portal`: same-origin connection management, draft edit/send and mail sync.

Core implementation:

- `app/lib/server/portal.ts`, `app/api/agents/{route.ts,guide/route.ts}`: tokens, deduplication, reporting, ownership and payload examples.
- `app/lib/server/portal-mail.ts`, `app/lib/server/gmail.ts`, `app/api/gmail/connect/route.ts`: Gmail evidence, scope upgrade and send protection. A timeout/uncertain send is marked unknown and blocked from automatic retry.
- `app/lib/server/agent-mail.ts`, `app/lib/mail.ts`: original-mail access and agent classifications alongside the existing rule fallback.
- `app/lib/portal.ts`, `app/lib/model.ts`, `app/lib/logic.ts`, `app/lib/store.ts`: shared models, validation, contact metrics and workspace refresh.
- `app/components/{agent-connections,portal-data,people,dashboard,outreach,jobs,applications,email-review,integrations,shell}.tsx`, `app/agents/page.tsx`, `app/globals.css`: screens and polling.
- `tests/portal.test.mjs`: isolated database and mocked Gmail tests. Tests do not send real messages or change production credentials.

## Storage and limits

Database: `.data/career-compass.sqlite`, still local SQLite, no Supabase registration required. Existing `workspace` JSON remains authoritative for jobs, people and applications; SQL `jobs`/`people` views project it. New tables are `portal_events`, `portal_drafts`, `agent_contacts` and `agent_receipts`. Gmail OAuth tokens remain encrypted; agent tokens are stored as hashes. Unlike the older application-only importer, contact-event evidence stores bounded message text in this local database; connected agents can read it. Preserve the database and encryption key together in private backups. A pre-change SQLite backup was created under `.data/backups/`.

The Settings workspace JSON export does not include these new event/draft tables; use a full SQLite backup for complete recovery. Existing workspace-clear behavior is not a full purge of integration history.

Validation for this revision: ESLint, TypeScript, all 69 tests and the production build passed. Eight UI routes and the integration guide returned HTTP 200; unauthenticated agent reads returned 401 and cross-origin portal writes returned 403. The production snapshot still has both agents unconfigured, zero portal drafts/events, and Gmail sending disabled. No real email was sent, and no sample contacts were inserted.

Not completed: verified Muse/Dot end-to-end reporting, live send acceptance, browser click/visual acceptance, native agent connectors, public hosting/authentication, push sync, automatic follow-ups, LinkedIn account/message sync. Browser control returned `browser access host is unavailable`. Local HTTP/API checks and isolated tests cannot establish those external integrations. Closing the server/computer stops the portal and its polling.
