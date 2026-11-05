"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import { editApplication, safeJobUrl, validDate } from "../lib/logic";
import { stages, type Application, type Job, type Stage } from "../lib/model";
import { updateWorkspace, useWorkspace } from "../lib/store";
import { Avatar, Badge, Heading } from "./ui";
import { ApplicationForm } from "./application-form";
import { EmailReview } from "./email-review";
function EditableCell({
  value,
  label,
  onChange,
  type = "text",
  required = false,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      className="cell-input"
      aria-label={label}
      defaultValue={value}
      type={type}
      required={required}
      onChange={(e) => {
        const next = e.target.value;
        const error =
          required && !next.trim()
            ? "This field is required."
            : type === "url" && next && !safeJobUrl(next)
              ? "Enter an http or https URL."
              : type === "date" && !validDate(next)
                ? "Enter a valid date."
                : "";
        e.target.setCustomValidity(error);
        if (!error) onChange(next);
      }}
      onBlur={(e) => e.target.reportValidity()}
    />
  );
}
import { Pagination, usePagination } from "./pagination";
export function Applications() {
  const state = useWorkspace();
  const [mode, setMode] = useState("Table");
  const [adding, setAdding] = useState(false);
  const [stageFilter, setStageFilter] = useState("All statuses");
  const submitted = state.applications.filter(
    (a) => !["Saved", "To apply"].includes(a.stage),
  );
  const filtered = submitted.filter(
    (a) => stageFilter === "All statuses" || a.stage === stageFilter,
  );
  const pagination = usePagination(filtered, 20, stageFilter);
  const change = (
    id: string,
    changes: Partial<Pick<Application, "stage" | "appliedAt" | "notes">>,
    jobChanges: Partial<
      Pick<Job, "company" | "role" | "location" | "deadline" | "jdUrl">
    > = {},
  ) => updateWorkspace((s) => editApplication(s, id, changes, jobChanges));
  const stageSelect = (a: Application, company: string) => (
    <select
      aria-label={`${company} application stage`}
      value={a.stage}
      onChange={(e) => change(a.jobId, { stage: e.target.value as Stage })}
    >
      {stages.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </select>
  );
  return (
    <div className="applications-page">
      <Heading
        eyebrow="EVERY STEP COUNTS"
        title="Your application workspace"
        description="Edit your table. Your board and Overview stay in sync, automatically."
        action={
          <div className="button-row">
            <Link className="button secondary" href="/jobs">
              Add opportunity <ArrowUpRight size={16} />
            </Link>
            <button
              className="button primary"
              onClick={() => setAdding(!adding)}
            >
              <Plus size={16} />
              Add manually
            </button>
          </div>
        }
      />
      {adding && <ApplicationForm onClose={() => setAdding(false)} />}
      <div
        className="outreach-summary"
        aria-label="Tracked application metrics"
      >
        {[
          "Total",
          "Applied",
          "Assessment",
          "Interview",
          "Offer",
          "Rejected",
        ].map((stage) => (
          <div key={stage}>
            <strong>
              {stage === "Total"
                ? submitted.length
                : submitted.filter((a) => a.stage === stage).length}
            </strong>
            <span>{stage}</span>
          </div>
        ))}
      </div>
      <EmailReview />
      <div className="toolbar">
        <label className="filter-label">
          Tracker status
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
          >
            {[
              "All statuses",
              ...stages.filter((s) => !["Saved", "To apply"].includes(s)),
            ].map((stage) => (
              <option key={stage}>{stage}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="results-row">
        <div className="segmented">
          {["Table", "Board"].map((m) => (
            <button
              key={m}
              aria-pressed={mode === m}
              className={mode === m ? "selected" : ""}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="autosave-note">
          <span className="tiny-dot" />
          Changes save locally · {submitted.length} records
        </span>
      </div>
      {mode === "Table" ? (
        <section className="panel tracker-panel">
          <div className="table-scroll">
            <table className="editable-table">
              <caption>
                Edit any cell. Valid changes update your board immediately.
              </caption>
              <thead>
                <tr>
                  {[
                    "Company",
                    "Role",
                    "Location",
                    "Stage",
                    "Deadline",
                    "Date applied",
                    "Original JD",
                    "Notes / next step",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagination.items.map((a) => {
                  const j = state.jobs.find((j) => j.id === a.jobId);
                  return j ? (
                    <tr key={a.jobId}>
                      <td>
                        <EditableCell
                          required
                          label={`${j.company} company`}
                          value={j.company}
                          onChange={(v) => change(j.id, {}, { company: v })}
                        />
                        <Badge tone={j.demo ? "amber" : "blue"}>
                          {j.demo ? "Demo" : "User added"}
                        </Badge>
                      </td>
                      <td>
                        <EditableCell
                          required
                          label={`${j.company} role`}
                          value={j.role}
                          onChange={(v) => change(j.id, {}, { role: v })}
                        />
                      </td>
                      <td>
                        <EditableCell
                          label={`${j.company} location`}
                          value={j.location}
                          onChange={(v) => change(j.id, {}, { location: v })}
                        />
                      </td>
                      <td>{stageSelect(a, j.company)}</td>
                      <td>
                        <EditableCell
                          label={`${j.company} deadline`}
                          type="date"
                          value={j.deadline}
                          onChange={(v) => change(j.id, {}, { deadline: v })}
                        />
                      </td>
                      <td>
                        <EditableCell
                          label={`${j.company} date applied`}
                          type="date"
                          value={a.appliedAt}
                          onChange={(v) => change(j.id, { appliedAt: v })}
                        />
                      </td>
                      <td>
                        <EditableCell
                          label={`${j.company} original JD URL`}
                          type="url"
                          value={j.jdUrl}
                          onChange={(v) => change(j.id, {}, { jdUrl: v })}
                        />
                        {safeJobUrl(j.jdUrl) && (
                          <a
                            className="text-link"
                            href={safeJobUrl(j.jdUrl)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open JD <ArrowUpRight size={13} />
                          </a>
                        )}
                      </td>
                      <td>
                        <EditableCell
                          label={`${j.company} notes`}
                          value={a.notes}
                          onChange={(v) => change(j.id, { notes: v })}
                        />
                      </td>
                    </tr>
                  ) : null;
                })}
              </tbody>
            </table>
          </div>
          <div className="tracker-guide">
            <strong>Saved</strong> is a shortlist. <strong>To apply</strong> is
            your next action. Move to <strong>Applied</strong> only after
            submission.
          </div>
        </section>
      ) : (
        <div className="board">
          {stages
            .filter((s) => !["Saved", "To apply"].includes(s))
            .filter(
              (stage) =>
                stageFilter === "All statuses" || stage === stageFilter,
            )
            .map((stage, i) => (
              <section className="board-column" key={stage}>
                <div className="board-heading">
                  <span className={`stage-dot stage-${i}`} />
                  <h2>{stage}</h2>
                  <span>
                    {submitted.filter((a) => a.stage === stage).length}
                  </span>
                </div>
                {pagination.items
                  .filter((a) => a.stage === stage)
                  .map((a) => {
                    const j = state.jobs.find((j) => j.id === a.jobId);
                    return j ? (
                      <article className="application-card" key={a.jobId}>
                        <Avatar name={j.company} color={j.color} />
                        <h3>{j.role}</h3>
                        <p>
                          {j.company} · {j.location || "Location not specified"}
                        </p>
                        <Badge tone={j.demo ? "amber" : "blue"}>
                          {j.demo ? "Demo" : a.origin}
                        </Badge>
                        {j.deadline && <p>Deadline: {j.deadline}</p>}
                        {a.notes && <p className="board-notes">{a.notes}</p>}
                        <label className="stage-field">
                          Stage{stageSelect(a, j.company)}
                        </label>
                        <small>
                          Updated{" "}
                          {new Date(a.updatedAt).toLocaleDateString("en-US", {
                            timeZone: "America/New_York",
                          })}
                        </small>
                        {safeJobUrl(j.jdUrl) && (
                          <a
                            className="text-link"
                            href={safeJobUrl(j.jdUrl)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {j.jdLinkKind === "source"
                              ? "Source listing"
                              : "Original JD"}{" "}
                            <ArrowUpRight size={14} />
                          </a>
                        )}
                      </article>
                    ) : null;
                  })}
                {!pagination.items.some((a) => a.stage === stage) && (
                  <div className="column-empty">
                    No applications on this page
                  </div>
                )}
              </section>
            ))}
        </div>
      )}
      <Pagination {...pagination} label="tracked applications" />
      <p className="footnote">
        Tracker stages are editable. Email status labels are managed separately
        and do not silently change your tracker.
      </p>
    </div>
  );
}
