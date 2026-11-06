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
                <button
                  className="button primary"
                  disabled={busy || cloud}
                  onClick={() => connect(actor)}
                >
                  {cloud ? "Use browser workbench below" : a?.localCredential ? "Check local connection setup" : "Prepare local connection"}
                </button>
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
      <p className="info-note"><Link href="/agent-workbench" className="text-link">Open browser workbench →</Link> For Muse without local command execution, pair the authorized browser session here, then use Check my queue. Computer-control permissions still need to work in Muse. This is separate from the local command credential.</p>
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
            Paste into the named agent. Local credentials stay encrypted on this Mac.
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
