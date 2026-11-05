import type {
  Application,
  Contact,
  Job,
  Outreach,
  Purpose,
  Workspace,
} from "./model";
import { discoveryMix, outreachStatuses, stages } from "./model";

export function exclusionReason(
  job: Job,
  preferences: Workspace["preferences"],
) {
  if (preferences.excludeTikTok && /\btiktok\b/i.test(job.company))
    return "Company exclusion preference: TikTok";
  if (
    preferences.hideNoSponsor &&
    job.region === "United States" &&
    job.sponsorship.status === "Not supported"
  )
    return job.sponsorship.quote;
  return "";
}
export function filterJobs(
  jobs: Job[],
  filters: {
    query: string;
    region: string;
    family: string;
    excluded: boolean | "all";
    category?: string;
    postedWithin?: string;
  },
  preferences: Workspace["preferences"],
) {
  return jobs.filter(
    (job) =>
      (filters.excluded === "all" ||
        Boolean(exclusionReason(job, preferences)) === filters.excluded) &&
      (filters.region === "All regions" || job.region === filters.region) &&
      (filters.family === "All roles" || job.family === filters.family) &&
      (!filters.category ||
        filters.category === "All companies" ||
        job.category === filters.category) &&
      matchesPostedWindow(job.published, filters.postedWithin || "All dates") &&
      `${job.company} ${job.role} ${job.location}`
        .toLowerCase()
        .includes(filters.query.trim().toLowerCase()),
  );
}
export function postingTime(value: string) {
  return /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) &&
    Number.isFinite(Date.parse(value))
    ? Date.parse(value)
    : null;
}
export function matchesPostedWindow(
  value: string,
  window: string,
  now = Date.now(),
) {
  if (window === "All dates") return true;
  const date = postingTime(value);
  if (window === "Unknown date") return date === null;
  const days = { "Last 24 hours": 1, "Last 7 days": 7, "Last 30 days": 30 }[
    window
  ];
  return (
    !!days && date !== null && date >= now - days * 86400000 && date <= now
  );
}
export function saveJob(state: Workspace, jobId: string): Workspace {
  if (state.applications.some((item) => item.jobId === jobId)) return state;
  return {
    ...state,
    applications: [
      ...state.applications,
      {
        jobId,
        stage: "Saved",
        origin: "Manual",
        updatedAt: new Date().toISOString(),
        appliedAt: "",
        notes: "",
      },
    ],
  };
}
export function updateOutreach(state: Workspace, record: Outreach): Workspace {
  const next = {
    ...record,
    followUp: record.status === "Do not contact" ? "" : record.followUp,
  };
  return {
    ...state,
    outreach: [
      ...state.outreach.filter((o) => o.contactId !== next.contactId),
      next,
    ],
  };
}
export function safeLinkedInUrl(value: string) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return !url.port &&
      url.protocol === "https:" &&
      ["linkedin.com", "www.linkedin.com"].includes(url.hostname) &&
      /^\/in\/[^/]+\/?$/.test(url.pathname) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function createDraft(
  contact: Contact,
  job: Job,
  purpose: Purpose,
  profile: Workspace["profile"],
) {
  if (
    !profile.name.trim() ||
    !profile.background.trim() ||
    !contact.evidence.trim()
  )
    return "";
  const request =
    purpose === "referral"
      ? `Would you be comfortable considering a referral for the ${job.role} role at ${job.company}?`
      : `Would you be open to a brief coffee chat about your work at ${contact.company} and the skills relevant to the ${job.role} role?`;
  const highlight = profile.highlights?.find(
    (h) => h.family === job.family,
  )?.text;
  return `Hi ${contact.name},\n\nI'm ${profile.name.trim()}. ${profile.background.trim()}${highlight ? `\n\n${highlight}` : ""}\n\nI came across your profile listing ${contact.title} at ${contact.company}. I'm exploring the ${job.role} opportunity at ${job.company}.\n\n${request}\n\nThank you for your time!\n${profile.name.trim()}`;
}
// Browser storage is untrusted. Reject incomplete or incompatible snapshots as a whole.
export function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== "object") return false;
  const v = value as Workspace;
  const string = (x: unknown) => typeof x === "string";
  const timestamp = (x: unknown) =>
    string(x) && Number.isFinite(Date.parse(x as string));
  return (
    v.version === 2 &&
    Array.isArray(v.jobs) &&
    v.jobs.every(isJob) &&
    new Set(v.jobs.map((j) => j.id)).size === v.jobs.length &&
    typeof v.emailPaused === "boolean" &&
    !!v.profile &&
    string(v.profile.name) &&
    string(v.profile.background) &&
    (v.profile.highlights === undefined ||
      (Array.isArray(v.profile.highlights) &&
        v.profile.highlights.every(
          (h) =>
            !!h &&
            ["PM", "DS", "DA"].includes(h.family) &&
            string(h.text) &&
            string(h.source),
        ))) &&
    (v.profile.sources === undefined ||
      (Array.isArray(v.profile.sources) && v.profile.sources.every(string))) &&
    (v.profile.caution === undefined || string(v.profile.caution)) &&
    !!v.preferences &&
    typeof v.preferences.excludeTikTok === "boolean" &&
    typeof v.preferences.hideNoSponsor === "boolean" &&
    Array.isArray(v.applications) &&
    v.applications.every(
      (a) =>
        a &&
        string(a.jobId) &&
        stages.includes(a.stage) &&
        timestamp(a.updatedAt) &&
        validDate(a.appliedAt) &&
        string(a.notes) &&
        v.jobs.some((j) => j.id === a.jobId) &&
        ["Demo", "Manual", "Agent"].includes(a.origin),
    ) &&
    new Set(v.applications.map((a) => a.jobId)).size ===
      v.applications.length &&
    Array.isArray(v.contacts) &&
    v.contacts.every(
      (c) =>
        c &&
        [
          c.id,
          c.name,
          c.title,
          c.company,
          c.relationship,
          c.evidence,
          c.source,
          c.linkedin,
        ].every(string) &&
        typeof c.demo === "boolean" &&
        [c.email, c.photoUrl].every(
          (x) => x === undefined || typeof x === "string",
        ) &&
        (c.emailSource === undefined ||
          ["Public", "Inferred"].includes(c.emailSource)) &&
        (c.draftAssignment === undefined ||
          ["dot", "muse"].includes(c.draftAssignment)) &&
        (c.discoveredBy === undefined ||
          (Array.isArray(c.discoveredBy) &&
            c.discoveredBy.every((x) => ["dot", "muse"].includes(x)))) &&
        (c.connectionStatus === undefined ||
          ["To Be Connect", "Connected"].includes(c.connectionStatus)) &&
        Array.isArray(c.jobIds) &&
        c.jobIds.every(string) &&
        ["Not contacted", "Sent", "Replied", "Stopped"].includes(c.emailStatus),
    ) &&
    Array.isArray(v.outreach) &&
    v.outreach.every(
      (o) =>
        o &&
        [o.contactId, o.jobId, o.draft, o.followUp, o.updatedAt].every(
          string,
        ) &&
        ["referral", "coffee"].includes(o.purpose) &&
        outreachStatuses.includes(o.status),
    )
  );
}

export function safeJobUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function validDate(value: unknown): value is string {
  if (value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function isJob(value: unknown): value is Job {
  if (!value || typeof value !== "object") return false;
  const j = value as Job;
  const evidence = (e: Job["opt"]) =>
    e &&
    ["Supported", "Not supported", "Unknown"].includes(e.status) &&
    typeof e.quote === "string";
  return (
    (j.applicationOwner === undefined ||
      ["dot", "muse"].includes(j.applicationOwner)) &&
    (j.discoveredBy === undefined ||
      (Array.isArray(j.discoveredBy) &&
        j.discoveredBy.every((x) => ["dot", "muse"].includes(x)))) &&
    [
      j.id,
      j.company,
      j.role,
      j.family,
      j.region,
      j.location,
      j.category,
      j.color,
      j.published,
      j.discovered,
      j.source,
      j.fit,
      j.gap,
      j.jdUrl,
      j.summary,
    ].every((x) => typeof x === "string") &&
    ["PM", "DS", "DA"].includes(j.family) &&
    ["United States", "Hong Kong", "Singapore", "Europe", "Unknown"].includes(
      j.region,
    ) &&
    (j.jdLinkKind === undefined ||
      ["employer", "source"].includes(j.jdLinkKind)) &&
    [
      j.sourceId,
      j.sourceUrl,
      j.sourceEvidence,
      j.collectedAt,
      j.employerCheck,
      j.employerCheckedAt,
      j.categoryReason,
      j.sourceCheckedAt,
    ].every((v) => v === undefined || typeof v === "string") &&
    (j.sourcePresence === undefined ||
      ["Listed", "Not in latest source"].includes(j.sourcePresence)) &&
    (!j.sourceUrl || !!safeJobUrl(j.sourceUrl)) &&
    validDate(j.deadline) &&
    (j.jdUrl === "" || !!safeJobUrl(j.jdUrl)) &&
    typeof j.demo === "boolean" &&
    (j.verified === null || typeof j.verified === "string") &&
    evidence(j.opt) &&
    evidence(j.stem) &&
    evidence(j.sponsorship)
  );
}
// Smooth weighted ordering: a full five-role cycle contains 3 / 1 / 1 when all buckets have supply.
// Missing buckets are skipped; IDs never occupy two slots and no roles are invented to fill a target.
export function rankJobs(candidates: Job[]): Job[] {
  const unique = [...new Map(candidates.map((j) => [j.id, j])).values()];
  const buckets = discoveryMix.map((item) => ({
    ...item,
    score: 0,
    jobs: unique.filter((j) => j.category === item.category),
  }));
  const result: Job[] = [];
  while (buckets.some((b) => b.jobs.length)) {
    const active = buckets.filter((b) => b.jobs.length);
    const total = active.reduce((sum, b) => sum + b.weight, 0);
    active.forEach((b) => {
      b.score += b.weight;
    });
    const chosen = active.reduce((best, b) =>
      b.score > best.score ? b : best,
    );
    result.push(chosen.jobs.shift()!);
    chosen.score -= total;
  }
  return [
    ...result,
    ...unique.filter(
      (j) => !discoveryMix.some((b) => b.category === j.category),
    ),
  ];
}
export function editApplication(
  state: Workspace,
  jobId: string,
  changes: Partial<Pick<Application, "stage" | "appliedAt" | "notes">>,
  jobChanges: Partial<
    Pick<
      Job,
      | "company"
      | "role"
      | "location"
      | "deadline"
      | "jdUrl"
      | "summary"
      | "fit"
      | "gap"
      | "sponsorship"
    >
  > = {},
): Workspace {
  if (!state.applications.some((a) => a.jobId === jobId)) return state;
  if (changes.stage && !stages.includes(changes.stage)) return state;
  if (changes.appliedAt !== undefined && !validDate(changes.appliedAt))
    return state;
  if (jobChanges.deadline !== undefined && !validDate(jobChanges.deadline))
    return state;
  if (jobChanges.jdUrl && !safeJobUrl(jobChanges.jdUrl)) return state;
  if (
    [jobChanges.company, jobChanges.role].some(
      (x) => x !== undefined && !x.trim(),
    )
  )
    return state;
  return {
    ...state,
    jobs: state.jobs.map((j) => (j.id === jobId ? { ...j, ...jobChanges } : j)),
    applications: state.applications.map((a) =>
      a.jobId === jobId
        ? {
            ...a,
            ...changes,
            origin: "Manual",
            updatedAt: new Date().toISOString(),
          }
        : a,
    ),
  };
}
export function addManualApplication(
  state: Workspace,
  job: Job,
  application: Application,
): Workspace {
  if (
    !isJob(job) ||
    !job.company.trim() ||
    !job.role.trim() ||
    !stages.includes(application.stage) ||
    !validDate(application.appliedAt)
  )
    return state;
  if (
    state.jobs.some((j) => j.id === job.id) ||
    state.applications.some((a) => a.jobId === job.id)
  )
    return state;
  // Different roles at a company remain separate; only the exact original posting URL is a duplicate.
  if (
    job.jdUrl &&
    state.jobs.some(
      (j) => j.jdUrl && safeJobUrl(j.jdUrl) === safeJobUrl(job.jdUrl),
    )
  )
    return state;
  return {
    ...state,
    jobs: [...state.jobs, job],
    applications: [...state.applications, application],
  };
}
