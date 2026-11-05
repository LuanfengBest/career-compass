"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CalendarDays, Plus, Search } from "lucide-react";
import {
  exclusionReason,
  filterJobs,
  rankJobs,
  safeJobUrl,
  saveJob,
  postingTime,
} from "../lib/logic";
import { discoveryMix, type Job } from "../lib/model";
import { updateWorkspace, useWorkspace } from "../lib/store";
import { Avatar, Badge, Empty, Heading } from "./ui";
import { ApplicationForm } from "./application-form";
import { Pagination, usePagination } from "./pagination";
import { DetailDialog } from "./detail-dialog";
import { screenJob, eligibilityLabels } from "../lib/eligibility";

const categories = [
  "All companies",
  ...discoveryMix.map((b) => b.category),
  "Other established companies",
  "Other / review needed",
];
export function Jobs() {
  const state = useWorkspace();
  const [screen, setScreen] = useState("All leads"),
    [query, setQuery] = useState(""),
    [origin, setOrigin] = useState("All sources"),
    [region, setRegion] = useState("All regions"),
    [family, setFamily] = useState("All roles"),
    [category, setCategory] = useState("All companies"),
    [postedWithin, setPostedWithin] = useState("All dates"),
    [excluded, setExcluded] = useState<boolean | "all">("all"),
    [adding, setAdding] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const filtered = rankJobs(
    filterJobs(
      state.jobs,
      { query, region, family, category, postedWithin, excluded },
      state.preferences,
    )
      .filter(
        (job) =>
          origin === "All sources" ||
          (origin === "Agent discoveries"
            ? !!job.discoveredBy?.length
            : !job.discoveredBy?.length),
      )
      .filter(
        (job) => screen === "All leads" || screenJob(job).status === screen,
      )
      .sort(
        (a, b) =>
          (postingTime(b.published) || 0) - (postingTime(a.published) || 0),
      ),
  );
  const pagination = usePagination(
    filtered,
    30,
    JSON.stringify([
      screen,
      origin,
      query,
      region,
      family,
      category,
      postedWithin,
      excluded,
    ]),
  );
  const selectedJob = state.jobs.find((j) => j.id === selected);
  return (
    <div className="jobs-page compact-collection">
      <Heading
        eyebrow="OPPORTUNITIES"
        title="Find your next opportunity"
        description="2027 new-grad / entry-level full-time search. Candidate evidence is not confirmed eligibility."
        action={
          <button className="button primary" onClick={() => setAdding(!adding)}>
            <Plus size={16} />
            Add a job
          </button>
        }
      />
      {adding && <ApplicationForm onClose={() => setAdding(false)} />}
      <p className="collection-note">Agent discoveries and manually saved jobs only. Website feed collection has been removed. <Link className="text-link" href="/tasks">Ask agents to find opportunities →</Link></p>
      <div className="flat-filters" aria-label="Opportunity filters">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search opportunities"
            placeholder="Company, role or location"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Origin
          <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
            {["All sources", "Agent discoveries", "Manual / retained records"].map(
              (v) => (
                <option key={v}>{v}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Evidence screen
          <select value={screen} onChange={(e) => setScreen(e.target.value)}>
            {[...eligibilityLabels, "All leads"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Role
          <select value={family} onChange={(e) => setFamily(e.target.value)}>
            {["All roles", "PM", "DS", "DA"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Region
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            {[
              "All regions",
              "United States",
              "Hong Kong",
              "Singapore",
              "Europe",
              "Unknown",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Company
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Posted
          <select
            value={postedWithin}
            onChange={(e) => setPostedWithin(e.target.value)}
          >
            {[
              "All dates",
              "Last 24 hours",
              "Last 7 days",
              "Last 30 days",
              "Unknown date",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Preferences
          <select
            value={String(excluded)}
            onChange={(e) =>
              setExcluded(
                e.target.value === "all" ? "all" : e.target.value === "true",
              )
            }
          >
            <option value="all">All imported</option>
            <option value="false">Matches preferences</option>
            <option value="true">Excluded</option>
          </select>
        </label>
      </div>
      <p className="collection-note">
        {eligibilityLabels
          .map(
            (label) =>
              `${state.jobs.filter((j) => screenJob(j).status === label).length} ${label.toLowerCase()}`,
          )
          .join(" · ")}
        . Target mix 60% tech · 20% Chinese global · 20% startups. Date filters
        exclude unknown posting dates; collection date is not publication date.
      </p>
      <Pagination {...pagination} label="opportunities" />
      <div className="job-grid compact-grid">
        {pagination.items.map((job) => {
          const saved = state.applications.some((a) => a.jobId === job.id),
            url = safeJobUrl(job.jdUrl),
            date = postingTime(job.published),
            flag = exclusionReason(job, state.preferences);
          return (
            <article className="panel job-card compact-card" key={job.id}>
              <div className="compact-card-heading">
                <Avatar name={job.company} color={job.color} />
                <div>
                  <strong className="one-line" title={job.company}>
                    {job.company}
                  </strong>
                  <span className="one-line muted" title={job.location}>
                    {job.location || "Location unknown"}
                  </span>
                </div>
                <Badge>{job.family}</Badge>
              </div>
              <h2 className="two-lines" title={job.role}>
                <button
                  className="card-title-button"
                  onClick={() => setSelected(job.id)}
                >
                  {job.role}
                </button>
              </h2>
              <p className="card-meta one-line" title={job.category}>
                {job.category}
              </p>
              <div className="card-facts">
                <span>
                  Posted{" "}
                  <strong>
                    {date !== null
                      ? new Date(date).toISOString().slice(0, 10)
                      : "Unknown"}
                  </strong>
                </span>
                <span>
                  Deadline <strong>{job.deadline || "Not listed"}</strong>
                </span>
                <span>
                  Sponsor <strong>{job.sponsorship.status}</strong>
                </span>
              </div>
              <p
                className={`card-verdict one-line ${flag ? "flagged" : ""}`}
                title={flag || screenJob(job).reason}
              >
                {job.sourcePresence === "Not in latest source"
                  ? "Not in latest source · verify availability"
                  : flag
                    ? "Preference restriction · see details"
                    : screenJob(job).status}
              </p>
              <p
                className="two-lines job-evidence"
                title={screenJob(job).reason}
              >
                {screenJob(job).reason}
              </p>
              <p className="two-lines job-fit" title={job.fit}>
                <strong>Fit:</strong>{" "}
                {job.fit || "Personal fit has not been assessed."}
              </p>
              <p className="card-meta one-line" title={job.source}>
                Source:{" "}
                {job.discoveredBy?.length
                  ? job.discoveredBy.join(" + ")
                  : job.source}
              </p>
              <p className="card-meta">
                Owner:{" "}
                {job.applicationOwner ||
                  (job.discoveredBy?.length
                    ? "Awaiting batch assignment"
                    : "Unassigned · manually retained")}
              </p>
              {state.contacts.some((c) => c.jobIds.includes(job.id)) && (
                <p className="one-line muted">
                  Contacts:{" "}
                  {state.contacts
                    .filter((c) => c.jobIds.includes(job.id))
                    .map((c) => c.name)
                    .join(", ")}
                </p>
              )}
              <div className="compact-card-actions">
                <button
                  className="button secondary"
                  onClick={() => setSelected(job.id)}
                >
                  Details
                </button>
                {url && (
                  <a
                    className="text-link"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {job.jdLinkKind === "source" ? "Listing" : "JD"}
                    <ArrowUpRight size={14} />
                  </a>
                )}
                <button
                  className="button primary"
                  disabled={saved}
                  onClick={() => updateWorkspace((s) => saveJob(s, job.id))}
                >
                  {saved ? "Saved" : "Save"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <Pagination {...pagination} label="opportunities" />
      {!filtered.length && (
        <Empty
          title={
            screen === "Target candidates"
              ? "No leads have enough target evidence yet"
              : "No matching opportunities"
          }
        >
          {screen === "Target candidates" && (
            <p>
              Existing leads are retained. Review missing employment type,
              graduation dates and employer requirements in Needs verification.
            </p>
          )}
          {screen === "Target candidates" && (
            <button
              className="button secondary"
              onClick={() => setScreen("Needs verification")}
            >
              Review unverified leads
            </button>
          )}
          <button
            className="text-link"
            onClick={() => {
              setScreen("All leads");
              setQuery("");
              setRegion("All regions");
              setFamily("All roles");
              setCategory("All companies");
              setPostedWithin("All dates");
              setExcluded("all");
            }}
          >
            Reset filters
          </button>
        </Empty>
      )}
      {selectedJob && (
        <DetailDialog
          title={`${selectedJob.company} · ${selectedJob.role}`}
          onClose={() => setSelected(null)}
        >
          <JobDetails job={selectedJob} />
        </DetailDialog>
      )}
    </div>
  );
}
function JobDetails({ job }: { job: Job }) {
  const state = useWorkspace();
  return (
    <div className="job-detail-body">
      <section className="info-note">
        <strong>{screenJob(job).status}</strong>
        <p>{screenJob(job).reason}</p>
      </section>
      <div className="job-details">
        <Badge>{job.family} · Verify level in original JD</Badge>
        <Badge>{job.category}</Badge>
      </div>
      {job.sourceId && (
        <label className="filter-label">
          Company bucket
          <select
            aria-label={`Company category for ${job.company} ${job.role}`}
            value={job.category}
            onChange={(e) =>
              updateWorkspace((s) => ({
                ...s,
                jobs: s.jobs.map((j) =>
                  j.id === job.id
                    ? {
                        ...j,
                        category: e.target.value,
                        categoryReason: "Company bucket selected manually.",
                      }
                    : j,
                ),
              }))
            }
          >
            <option>Other established companies</option>
            <option>Other / review needed</option>
            {discoveryMix.map((bucket) => (
              <option key={bucket.category}>{bucket.category}</option>
            ))}
          </select>
        </label>
      )}
      <div className="job-essentials">
        <div>
          <span>
            <CalendarDays size={15} />
            Application deadline
          </span>
          <strong>{job.deadline || "Not listed"}</strong>
        </div>
        <div>
          <span>
            {job.region === "United States"
              ? "Visa sponsorship"
              : "Local sponsorship"}
          </span>
          <strong>{job.sponsorship.status}</strong>
        </div>
      </div>
      <section className="jd-summary">
        <h3>Core responsibilities & requirements</h3>
        {job.employerCheck && (
          <small>
            {job.employerCheck} Checked {job.employerCheckedAt?.slice(0, 10)}.
          </small>
        )}
        <p>
          {job.summary ||
            "No job description provided yet. Check the original posting before applying."}
        </p>
      </section>
      <div className="fit-grid">
        <div>
          <span className="eyebrow">WHY IT MAY FIT</span>
          <p>
            {job.fit ||
              "Add your relevant experience to assess this opportunity."}
          </p>
          {!state.profile.background && (
            <small>
              Add your background in Settings for a personal assessment.
            </small>
          )}
        </div>
        <div>
          <span className="eyebrow">TO CONFIRM</span>
          <p>{job.gap}</p>
        </div>
      </div>
      {job.categoryReason && (
        <small className="muted">{job.categoryReason}</small>
      )}
      <details className="evidence">
        <summary>Work authorization & source evidence</summary>
        {job.region === "United States" ? (
          <div className="evidence-grid">
            {[
              { name: "OPT", evidence: job.opt },
              { name: "STEM OPT", evidence: job.stem },
              { name: "Future sponsorship", evidence: job.sponsorship },
            ].map(({ name, evidence }) => (
              <div key={name}>
                <strong>
                  {name} · {evidence.status}
                </strong>
                <p>{evidence.quote}</p>
              </div>
            ))}
          </div>
        ) : (
          <p>
            {job.localAuthorization || "Verify local work authorization."} US
            OPT rules do not apply.
            <br />
            {job.sponsorship.quote}
          </p>
        )}
        <p>
          Source:{" "}
          {job.discoveredBy?.length === 2
            ? "Dot + Muse"
            : job.discoveredBy?.[0] || job.source}
          {job.sourceUrl && safeJobUrl(job.sourceUrl) && (
            <>
              {" "}
              ·{" "}
              <a
                href={safeJobUrl(job.sourceUrl)}
                target="_blank"
                rel="noreferrer"
              >
                Source record ↗
              </a>
            </>
          )}
          <br />
          Published: {job.published || "Not listed"} · Discovered:{" "}
          {job.discovered} · Verified: {job.verified ?? "Not yet verified"}
          {job.demo ? " (demo dates)" : ""}
        </p>
        {job.sourceEvidence && <p>Source listing: {job.sourceEvidence}</p>}
      </details>
      {exclusionReason(job, state.preferences) && (
        <p className="warning">
          Preference flag: {exclusionReason(job, state.preferences)}
        </p>
      )}
      <p className="muted">
        Last collected: {job.collectedAt || "Unknown"} ·{" "}
        {job.sourcePresence || "Availability not rechecked"}
      </p>
      {safeJobUrl(job.jdUrl) && (
        <a
          className="button primary"
          href={safeJobUrl(job.jdUrl)}
          target="_blank"
          rel="noreferrer"
        >
          {job.jdLinkKind === "source"
            ? "Open source listing"
            : "Open original JD"}{" "}
          <ArrowUpRight size={16} />
        </a>
      )}
    </div>
  );
}
