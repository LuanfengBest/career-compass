"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { usePortal, portalAction } from "./portal-data";
import { Badge, Heading } from "./ui";
import { agentPolicy, agentTaskInstructions } from "../lib/agent-policy";
const subscribeOrigin = () => () => {};
export function AgentConnections() {
  const { data, error } = usePortal();
  const origin = useSyncExternalStore(subscribeOrigin, () => window.location.origin, () => "http://127.0.0.1:3000");
  const cloud = origin.startsWith("https:");
  const [instructions, setInstructions] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [cadence, setCadence] = useState(
      "every 10 minutes, 08:00–24:00 America/New_York",
    );
  const [cloudSecret, setCloudSecret] = useState<{actor:string;token:string}|null>(null);
  async function cloudConnect(actor:"dot"|"muse") {
    setBusy(true);setNotice("");setCloudSecret(null);
    try {
      const result=await portalAction({action:"cloud-connect",actor});
      setCloudSecret({actor,token:result.token});
      setNotice(`New HTTPS API credential created for ${actor}. Its previous cloud credential is revoked; local helper and browser credentials are unchanged.`);
    } catch(e) {setNotice(e instanceof Error?e.message:"Connection failed");}
    finally {setBusy(false);}
  }
  async function connect(actor: "dot" | "muse") {
    setBusy(true);
    setNotice("");
    try {
      const result = await portalAction({ action: "local-connect", actor });
      setInstructions(agentTaskInstructions(actor, cadence, origin));
      setNotice(`Local encrypted credential ready for ${actor}. ${result.replaced ? "Previous bearer token was replaced." : "Existing local credential reused."} No token needs to be pasted into chat.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="SHARED WORK, CLEAR OWNERSHIP"
        title="Agent connections"
        description="Direct progress reports from Muse and ChatGPT Dot. No model API is called by this website."
      />
      <div className="agent-grid">
        {(["dot", "muse"] as const).map((actor) => {
          const a = data.agents.find((x) => x.actor === actor);
          return (
            <section className="panel" key={actor}>
              <div className="section-title">
                <h2>{actor === "dot" ? "ChatGPT Dot" : "Muse"}</h2>
                <Badge tone={a?.lastSeen && a.configured ? "green" : "amber"}>
                  {a?.lastSeen && a.configured
                    ? "Check-in received"
                    : a?.configured
                      ? "Awaiting check-in"
                      : "Not connected"}
                </Badge>
              </div>
              <p>
                {actor === "dot"
                  ? "Draft owner for every contact found by Dot, including shared discoveries."
                  : "Draft owner for contacts found only by Muse."}
              </p>
              <p className="muted">
                Last check-in:{" "}
                {a?.lastSeen ? new Date(a.lastSeen).toLocaleString() : "Never"}.
                A check-in is not proof of an active background session.
              </p>
              <div className="button-row">
                {cloud?<a href="#background-api" className="button primary">Configure background API</a>:<button
                  className="button primary"
                  disabled={busy}
                  onClick={() => connect(actor)}
                >
                  {a?.localCredential ? "Check local connection setup" : "Prepare local connection"}
                </button>}
                {a?.configured && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      portalAction({ action: "disconnect", actor }).catch((e) =>
                        setNotice(e.message),
                      )
                    }
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <section className="panel" id="background-api">
        <h2>Background HTTPS API access</h2>
        <p>Read the queue and upload findings through authenticated HTTP, without controlling your Mac. This requires a deployed HTTPS portal and an agent-supported secure credential connection usable by its scheduled runs. A saved token alone does not prove that capability. The credential grants this agent access to shared profile, jobs, contacts, drafts, imported email evidence and its assigned tasks; it does not grant owner administration or direct Gmail sending.</p>
        <p>Muse reports a secure API credential flow: <code>credentials.request_api_access</code>, followed by <code>custom_connector_setup</code>. Ask Muse to open that secure entry point; enter the credential there yourself. Confirm it works from a scheduled run before relying on it.</p>
        {!cloud&&<p className="info-note">Local mode: Muse cannot reach 127.0.0.1 from its cloud environment. Cloud credential creation is disabled until deployment. Keep search results pending; using your foreground Chrome is an optional fallback, not a requirement for routine synchronization.</p>}
        {(["dot","muse"] as const).map(actor=>{
          const a=data.agents.find(x=>x.actor===actor);
          return <article key={actor}><h3>{actor==='dot'?'ChatGPT Dot':'Muse'}</h3>
            <p>Cloud API credential: {a?.cloudCredential?'Configured':'Not configured'} · Last authenticated API diagnostic: {a?.cloudCheck?new Date(a.cloudCheck).toLocaleString():'Not verified'}. This timestamp does not verify a scheduled run.</p>
            <div className="button-row"><button className="button secondary" disabled={busy||!cloud} onClick={()=>void cloudConnect(actor)}>{a?.cloudCredential?'Replace':'Create'} {actor} cloud API credential</button>
            {a?.cloudCredential&&<button className="button secondary" disabled={busy} onClick={()=>void portalAction({action:'cloud-disconnect',actor}).then(()=>{setCloudSecret(null);setNotice(`${actor} cloud API credential revoked.`);}).catch(e=>setNotice(e.message))}>Revoke cloud access</button>}</div>
          </article>;
        })}
        {cloudSecret&&<div className="info-note"><strong>{cloudSecret.actor} credential · shown only in this page session</strong>
          <p>Paste only into that agent’s supported private credential setting. Do not paste into chat, task instructions or a schedule. If no secure setting exists, stop setup and report that limitation.</p>
          <label>Private Bearer token<input type="password" autoComplete="off" readOnly value={cloudSecret.token}/></label>
          <div className="button-row"><button className="button secondary" onClick={()=>void navigator.clipboard.writeText(cloudSecret.token).then(()=>setNotice('Credential copied. Paste only into the private credential setting.')).catch(()=>setNotice('Clipboard unavailable; use the private credential field.'))}>Copy private credential</button><button className="button secondary" onClick={()=>setCloudSecret(null)}>Hide credential</button></div></div>}
        <p>Connection URL: <code>{origin}</code>. Header: <code>Authorization: Bearer &lt;private credential&gt;</code>. First call <code>GET /api/agents/connection</code>, then <code>GET /api/agents/tasks</code>. Writes use the API guide. Repeat the diagnostic from a separate scheduled run before declaring unattended access ready.</p>
        <p>Use <code>usesLocalBrowser: false</code> for work performed entirely through HTTP or an isolated cloud browser. If an employer form or LinkedIn needs your Mac session, report that separately. Hosting this portal does not provide an external browser or account login.</p>
      </section>
      <p className="info-note"><Link href="/agent-workbench" className="text-link">Open browser workbench →</Link> Optional browser fallback. Use only when you have agreed to foreground computer use. Live read/draft claims can be recovered in another authorized tab; old claim credentials are invalidated. Form preparation and sends require reconciliation instead.</p>
      <p className="info-note">
        Portal address: {origin}. {cloud ? "Use this address in both agents; do not write to the old local database." : "This address requires access to this Mac; cloud-only browsers cannot reach it."} The portal displays reported
        steps, not a live mirror of another product’s screen or hidden
        reasoning. Updates refresh every 5 seconds while open.
      </p>
      <section className="panel">
        <h2>Shared collaboration rules</h2>
        <p>
          Policy {agentPolicy.version}. Both agents receive these rules through
          the API. Create work in Tasks. Agents pick it up when they check the
          queue; this website does not wake their sessions.
        </p>
        <p>
          Both agents search all target companies, jobs and contacts. After
          reconciliation, Dot handles shared and Dot-only discoveries; Muse
          handles Muse-only discoveries. No company-type split.
        </p>
        <p>
          Both discovery reports must finish. New daily and one-off batches automatically assign preparation; older manual batches still need release in Tasks. Claims prevent concurrent execution. Application answers
          require your review before a submission task is created.
        </p>
        <p>
          Assign each Gmail backfill to one owner. Do not ask both agents
          to repeat it. Agents check canonical records before writing; the
          server deduplicates exact identities and flags ambiguous matches.
        </p>
        <p>
          <Link href="/tasks" className="text-link">
            Open Tasks →
          </Link>
        </p>
        <label>
          Queue-check setup
          <select value={cadence} onChange={(e) => setCadence(e.target.value)}>
            <option value="manual">
              Check once now; no recurring schedule
            </option>
            <option value="every 10 minutes, 08:00–24:00 America/New_York">
              Every 10 minutes · 08:00–24:00 New York
            </option>
            <option value="every 30 minutes, 08:00–24:00 America/New_York">
              Every 30 minutes · 08:00–24:00 New York
            </option>
          </select>
        </label>
        <p className="muted">
          Copy once into each agent. A recurring schedule must be saved in that
          agent’s product; choosing it here does not schedule anything.
        </p>
        <div className="button-row">
          {(["dot", "muse"] as const).map((actor) => (
            <button
              key={actor}
              className="button secondary"
              onClick={() => {
                setInstructions(agentTaskInstructions(actor, cadence, origin));
                return navigator.clipboard
                  .writeText(agentTaskInstructions(actor, cadence, origin))
                  .then(() =>
                    setNotice(
                      `${actor} setup rules copied; paste into that agent's existing conversation.`,
                    ),
                  )
                  .catch(() =>
                    setNotice("Clipboard unavailable; select and copy the instructions displayed below."),
                  );
              }}
            >
              Copy {actor === "dot" ? "Dot" : "Muse"} setup rules
            </button>
          ))}
        </div>
        <details>
          <summary>Input, output and shared rules</summary>
          <ul>
            {agentPolicy.common.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </details>
      </section>
      {instructions && (
        <section className="panel">
          <h2>Connection instructions (no secret)</h2>
          <p>
            Paste these secret-free rules into the named agent. Credentials stay in the configured private connection, never in the instructions.
            A successful queue read is required before attempting a recurring schedule.
          </p>
          <textarea
            className="agent-instructions"
            value={instructions}
            readOnly
            aria-label="Private agent connection instructions"
          />
          <button
            className="button secondary"
            onClick={() =>
              navigator.clipboard
                .writeText(instructions)
                .then(() => setNotice("Copied."))
                .catch(() => setNotice("Select and copy the text manually."))
            }
          >
            Copy instructions
          </button>
        </section>
      )}
      {(notice || error) && (
        <p role="status" className="info-note">
          {notice || error}
        </p>
      )}
      <section className="panel">
        <h2>Reported activity</h2>
        <p className="muted">
          Agent reports and Gmail evidence remain distinct. No fabricated
          activity is shown.
        </p>
        {data.events
          .filter((e) => e.actor === "dot" || e.actor === "muse")
          .slice(0, 30)
          .map((e) => (
            <article className="activity-row" key={e.id}>
              <Badge>{e.actor}</Badge>
              <strong>{e.kind}</strong>
              <time>{new Date(e.at).toLocaleString()}</time>
              <p>{e.text}</p>
            </article>
          ))}
        {!data.events.some((e) => e.actor === "dot" || e.actor === "muse") && (
          <p>
            No agent reports yet. Connect each agent and send its first
            check-in.
          </p>
        )}
      </section>
    </>
  );
}
