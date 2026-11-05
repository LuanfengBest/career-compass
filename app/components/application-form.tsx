"use client";
import { useState } from "react";
import { addManualApplication, safeJobUrl } from "../lib/logic";
import { discoveryMix, stages, type Job, type Stage } from "../lib/model";
import { updateWorkspace, useWorkspace } from "../lib/store";
import { companyBucket } from "../lib/companies";
export function ApplicationForm({ onClose }: { onClose: () => void }) {
  const state = useWorkspace();
  const [error, setError] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const get = (key: string) => String(data.get(key) ?? "").trim();
    if (!get("company") || !get("role")) {
      setError("Company and role are required.");
      return;
    }
    const jdUrl = safeJobUrl(get("jdUrl"));
    if (get("jdUrl") && !jdUrl) {
      setError("Enter a valid http or https URL for the original job posting.");
      return;
    }
    if (
      jdUrl &&
      state.jobs.some((j) => j.jdUrl && safeJobUrl(j.jdUrl) === jdUrl)
    ) {
      setError(
        "This posting is already in your workspace. Edit its existing record or save it from Opportunities.",
      );
      return;
    }
    const unknown = {
      status: "Unknown" as const,
      quote: "No source evidence provided.",
    };
    const job: Job = {
      id: crypto.randomUUID(),
      company: get("company"),
      role: get("role"),
      location: get("location"),
      family: get("family") as Job["family"],
      region: get("region") as Job["region"],
      category: get("category") || companyBucket(get("company")).category,
      categoryReason: get("category")
        ? "Company bucket selected manually."
        : companyBucket(get("company")).reason,
      color: "blue",
      published: "",
      discovered: new Date().toISOString().slice(0, 10),
      verified: null,
      source: "User provided · Unverified",
      opt: unknown,
      stem: unknown,
      sponsorship: {
        status: get("sponsorship") as Job["sponsorship"]["status"],
        quote:
          get("evidence") ||
          "User provided status; source evidence still needed.",
      },
      fit: get("fit"),
      gap: "Verify requirements against your background.",
      deadline: get("deadline"),
      jdUrl,
      summary: get("summary"),
      demo: false,
    };
    const application = {
      jobId: job.id,
      stage: get("stage") as Stage,
      updatedAt: new Date().toISOString(),
      origin: "Manual" as const,
      appliedAt: get("appliedAt"),
      notes: get("notes"),
    };
    const next = addManualApplication(state, job, application);
    if (next === state) {
      setError("Check the dates and required fields before saving.");
      return;
    }
    updateWorkspace((s) => addManualApplication(s, job, application));
    onClose();
  }
  return (
    <form className="panel application-form" onSubmit={submit}>
      <div className="section-title">
        <div>
          <span className="eyebrow">ADD YOUR OWN OPPORTUNITY</span>
          <h2>New application</h2>
        </div>
        <button type="button" className="text-link" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="form-grid three-columns">
        <label>
          Company *<input name="company" required maxLength={120} autoFocus />
        </label>
        <label>
          Role *<input name="role" required maxLength={180} />
        </label>
        <label>
          Location
          <input
            name="location"
            placeholder="City, country or remote"
            maxLength={180}
          />
        </label>
        <label>
          Stage
          <select name="stage" defaultValue="To apply">
            {stages.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Application deadline
          <input name="deadline" type="date" />
        </label>
        <label>
          Date applied
          <input name="appliedAt" type="date" />
        </label>
        <label>
          Role family
          <select name="family">
            {["PM", "DS", "DA"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Region
          <select name="region">
            {[
              "United States",
              "Hong Kong",
              "Singapore",
              "Europe",
              "Unknown",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Company category
          <select name="category">
            <option value="">Auto classify company</option>
            <option>Other established companies</option>
            <option>Other / review needed</option>
            {discoveryMix.map((b) => (
              <option key={b.category}>{b.category}</option>
            ))}
          </select>
        </label>
        <label className="full">
          Original JD URL
          <input
            name="jdUrl"
            type="url"
            placeholder="https://company.com/careers/role"
          />
        </label>
        <label>
          Sponsorship
          <select name="sponsorship" defaultValue="Unknown">
            {["Unknown", "Supported", "Not supported"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="span-two">
          Sponsorship evidence
          <input
            name="evidence"
            placeholder="Paste the relevant wording from the posting"
          />
        </label>
        <label>
          Core JD
          <textarea
            name="summary"
            placeholder="Key responsibilities and requirements"
            maxLength={4000}
          />
        </label>
        <label>
          Why it fits you
          <textarea
            name="fit"
            placeholder="Relevant experience, skills or interests"
            maxLength={2000}
          />
        </label>
        <label>
          Notes / next step
          <textarea
            name="notes"
            placeholder="What would move this forward?"
            maxLength={2000}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
      <div className="job-footer">
        <small>
          Starts in To apply. Adding a record never submits an application.
        </small>
        <button className="button primary" type="submit">
          Add application
        </button>
      </div>
    </form>
  );
}
