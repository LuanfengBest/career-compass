import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  filterJobs,
  exclusionReason,
  saveJob,
  safeLinkedInUrl,
  createDraft,
  isWorkspace,
  updateOutreach,
} = require("../.test-build/logic.js");
const { jobs, initialWorkspace } = require("../.test-build/demo.js");
const filters = {
  query: "",
  region: "All regions",
  family: "All roles",
  excluded: false,
};
test("all imported view has no result cap and preserves preference exclusions for the matched view", () => {
  const many = Array.from({ length: 120 }, (_, i) => ({
    ...jobs[i % jobs.length],
    id: `all-${i}`,
  }));
  const all = filterJobs(
    many,
    { ...filters, excluded: "all" },
    initialWorkspace.preferences,
  );
  assert.equal(all.length, 120);
  const matched = filterJobs(many, filters, initialWorkspace.preferences);
  const excluded = filterJobs(
    many,
    { ...filters, excluded: true },
    initialWorkspace.preferences,
  );
  assert.equal(matched.length + excluded.length, all.length);
  const us = filterJobs(
    many,
    { ...filters, excluded: "all", region: "United States" },
    initialWorkspace.preferences,
  );
  assert.equal(
    us.length,
    many.filter((j) => j.region === "United States").length,
  );
});
test("default filters keep unknown sponsorship and exclude explicit negatives and TikTok", () => {
  const visible = filterJobs(jobs, filters, initialWorkspace.preferences);
  assert.ok(visible.some((j) => j.sponsorship.status === "Unknown"));
  assert.ok(
    !visible.some((j) => j.id === "sample-da" || j.company === "TikTok"),
  );
  const excluded = filterJobs(
    jobs,
    { ...filters, excluded: true },
    initialWorkspace.preferences,
  );
  assert.equal(excluded.length, 2);
  assert.ok(
    exclusionReason(
      excluded.find((j) => j.id === "sample-da"),
      initialWorkspace.preferences,
    ).includes("We do not offer"),
  );
});
test("region, role and case-insensitive search actually intersect", () => {
  const visible = filterJobs(
    jobs,
    { ...filters, region: "Hong Kong", family: "DA", query: "TENCENT" },
    initialWorkspace.preferences,
  );
  assert.deepEqual(
    visible.map((j) => j.id),
    ["tencent-da"],
  );
  assert.equal(
    filterJobs(
      jobs,
      { ...filters, region: "Hong Kong", family: "DS" },
      initialWorkspace.preferences,
    ).length,
    0,
  );
});
test("company exclusion is reversible and OPT filtering never applies to non-US roles", () => {
  assert.ok(
    filterJobs(jobs, filters, {
      ...initialWorkspace.preferences,
      excludeTikTok: false,
    }).some((j) => j.company === "TikTok"),
  );
  const nonUS = {
    ...jobs[3],
    sponsorship: { status: "Not supported", quote: "local policy" },
  };
  assert.equal(exclusionReason(nonUS, initialWorkspace.preferences), "");
});
test("saving existing application cannot duplicate or regress its interview stage", () => {
  const next = saveJob(initialWorkspace, "notion-apm");
  assert.equal(next.applications.length, initialWorkspace.applications.length);
  assert.equal(
    next.applications.find((a) => a.jobId === "notion-apm").stage,
    "Interview",
  );
  const added = saveJob(initialWorkspace, "sea-pm");
  assert.equal(added.applications.at(-1).stage, "Saved");
  assert.equal(
    saveJob(added, "sea-pm").applications.length,
    added.applications.length,
  );
});
test("LinkedIn URLs reject script schemes, lookalike hosts and non-profile pages", () => {
  for (const value of [
    "javascript:alert(1)",
    "https://linkedin.com.evil.test/in/person",
    "http://linkedin.com/in/person",
    "https://www.linkedin.com/feed/",
    "https://evil@linkedin.com/in/person",
  ])
    assert.equal(safeLinkedInUrl(value), "");
  assert.equal(
    safeLinkedInUrl("https://www.linkedin.com/in/example"),
    "https://www.linkedin.com/in/example",
  );
});
test("draft requires supplied background and keeps one main request without invented education", () => {
  const c = initialWorkspace.contacts[0];
  assert.equal(
    createDraft(c, jobs[0], "referral", initialWorkspace.profile),
    "",
  );
  const profile = {
    name: "Applicant",
    background: "I build analytics projects.",
  };
  const referral = createDraft(c, jobs[0], "referral", profile);
  assert.ok(referral.includes(jobs[0].role));
  assert.ok(referral.includes("referral"));
  assert.ok(!referral.includes("coffee chat"));
  assert.ok(!referral.includes("Yale"));
  const coffee = createDraft(c, jobs[0], "coffee", profile);
  assert.ok(coffee.includes("coffee chat"));
  assert.ok(!coffee.includes("referral"));
  assert.equal(
    createDraft({ ...c, evidence: "" }, jobs[0], "referral", profile),
    "",
  );
});
test("storage schema rejects partial snapshots and invalid workflow states", () => {
  assert.equal(isWorkspace(initialWorkspace), true);
  assert.equal(isWorkspace(null), false);
  assert.equal(isWorkspace({ version: 1 }), false);
  assert.equal(
    isWorkspace({
      ...initialWorkspace,
      applications: [{ jobId: "x", stage: "fake" }],
    }),
    false,
  );
  assert.equal(isWorkspace({ ...initialWorkspace, contacts: [null] }), false);
});

test("stopping LinkedIn outreach clears reminders without changing application or email state", () => {
  const record = {
    contactId: "demo-alex",
    jobId: "notion-apm",
    purpose: "referral",
    draft: "Edited draft",
    status: "Sent",
    followUp: "2026-11-10",
    updatedAt: "2026-11-03T14:00:00Z",
  };
  const active = updateOutreach(initialWorkspace, record);
  const stopped = updateOutreach(active, {
    ...record,
    status: "Do not contact",
  });
  assert.equal(stopped.outreach.length, 1);
  assert.equal(stopped.outreach[0].followUp, "");
  assert.equal(stopped.outreach[0].draft, "Edited draft");
  assert.deepEqual(stopped.applications, initialWorkspace.applications);
  assert.deepEqual(stopped.contacts, initialWorkspace.contacts);
});

const {
  rankJobs,
  addManualApplication,
  editApplication,
  safeJobUrl,
  validDate,
} = require("../.test-build/logic.js");
const { discoveryMix, stages } = require("../.test-build/model.js");
const { migrateWorkspace } = require("../.test-build/migration.js");

test("discovery ordering follows 60/20/20 when every bucket has supply", () => {
  const candidates = discoveryMix.flatMap(({ category }, bucket) =>
    Array.from({ length: 10 }, (_, index) => ({
      ...jobs[0],
      id: `${bucket}-${index}`,
      category,
    })),
  );
  const firstTen = rankJobs(candidates).slice(0, 10);
  assert.deepEqual(
    discoveryMix.map(
      (b) => firstTen.filter((j) => j.category === b.category).length,
    ),
    [6, 2, 2],
  );
  assert.equal(
    new Set(rankJobs([...candidates, candidates[0]]).map((j) => j.id)).size,
    30,
  );
});
test("missing discovery buckets never create placeholder roles or discard valid candidates", () => {
  const candidates = jobs.filter(
    (j) => j.category === "Startups & small companies",
  );
  assert.deepEqual(
    rankJobs(candidates).map((j) => j.id),
    candidates.map((j) => j.id),
  );
  assert.deepEqual(rankJobs([]), []);
});
const manualJob = {
  ...jobs[0],
  id: "manual-role",
  company: "Test company",
  role: "Product analyst",
  demo: false,
  jdUrl: "https://example.com/careers/analyst",
  deadline: "2026-12-10",
};
const manualApplication = {
  jobId: manualJob.id,
  stage: "To apply",
  updatedAt: "2026-11-03T14:00:00Z",
  origin: "Manual",
  appliedAt: "",
  notes: "Prepare a resume",
};
test("manual applications share the same job record across table, board and discovery", () => {
  const added = addManualApplication(
    initialWorkspace,
    manualJob,
    manualApplication,
  );
  assert.equal(added.jobs.at(-1).id, added.applications.at(-1).jobId);
  assert.equal(added.applications.at(-1).stage, "To apply");
  assert.equal(isWorkspace(JSON.parse(JSON.stringify(added))), true);
  const edited = editApplication(
    added,
    manualJob.id,
    {
      stage: "Applied",
      notes: "Submitted via careers site",
      appliedAt: "2026-11-03",
    },
    {
      role: "Product analytics associate",
      deadline: "2026-12-11",
      location: "New York",
    },
  );
  assert.equal(
    edited.jobs.find((j) => j.id === manualJob.id).role,
    "Product analytics associate",
  );
  assert.equal(
    edited.jobs.find((j) => j.id === manualJob.id).deadline,
    "2026-12-11",
  );
  assert.equal(
    edited.applications.filter((a) => a.stage === "Applied").length,
    2,
  );
  assert.equal(edited.applications.at(-1).notes, "Submitted via careers site");
  assert.deepEqual(edited.outreach, initialWorkspace.outreach);
  assert.equal(isWorkspace(edited), true);
});
test("different roles at one company remain separate but duplicate posting URLs do not", () => {
  const added = addManualApplication(
    initialWorkspace,
    manualJob,
    manualApplication,
  );
  assert.equal(
    addManualApplication(
      added,
      { ...manualJob, id: "duplicate" },
      { ...manualApplication, jobId: "duplicate" },
    ),
    added,
  );
  const another = addManualApplication(
    added,
    {
      ...manualJob,
      id: "another",
      role: "Data scientist",
      jdUrl: "https://example.com/careers/scientist",
    },
    { ...manualApplication, jobId: "another" },
  );
  assert.equal(another.applications.length, added.applications.length + 1);
});
test("invalid edits never corrupt an existing record or create unsafe JD links", () => {
  assert.equal(
    editApplication(
      initialWorkspace,
      "notion-apm",
      {},
      { jdUrl: "javascript:alert(1)" },
    ),
    initialWorkspace,
  );
  assert.equal(
    editApplication(initialWorkspace, "notion-apm", {}, { company: "  " }),
    initialWorkspace,
  );
  assert.equal(
    editApplication(initialWorkspace, "notion-apm", { stage: "Withdrawn" }),
    initialWorkspace,
  );
  assert.equal(
    editApplication(
      initialWorkspace,
      "notion-apm",
      {},
      { deadline: "2026-02-30" },
    ),
    initialWorkspace,
  );
  assert.equal(validDate("2028-02-29"), true);
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(safeJobUrl("data:text/html,hello"), "");
  assert.equal(
    safeJobUrl("https://example.com/job?id=123"),
    "https://example.com/job?id=123",
  );
  assert.ok(
    stages.includes("Saved") &&
      stages.includes("To apply") &&
      !stages.includes("Withdrawn"),
  );
});
test("v1 migration preserves user profile, contacts and drafts, including legacy withdrawn records", () => {
  const legacy = {
    version: 1,
    profile: { name: "Applicant", background: "My real background" },
    preferences: { excludeTikTok: false, hideNoSponsor: true },
    emailPaused: true,
    applications: [
      {
        jobId: "notion-apm",
        stage: "撤回",
        origin: "人工记录",
        updatedAt: "2026-11-03T14:00:00Z",
      },
    ],
    contacts: [
      {
        ...initialWorkspace.contacts[0],
        id: "user-contact",
        demo: false,
        relationship: "用户提供",
        evidence: "My original evidence",
        source: "https://www.linkedin.com/in/example",
        emailStatus: "未联系",
      },
    ],
    outreach: [
      {
        contactId: "user-contact",
        jobId: "notion-apm",
        purpose: "coffee",
        draft: "Do not overwrite my edited draft",
        status: "已回复",
        followUp: "2026-11-10",
        updatedAt: "2026-11-03T14:00:00Z",
      },
    ],
  };
  const result = migrateWorkspace(legacy);
  assert.equal(result.version, 2);
  assert.deepEqual(result.profile, legacy.profile);
  assert.deepEqual(result.preferences, legacy.preferences);
  assert.equal(result.applications[0].stage, "Saved");
  assert.ok(result.applications[0].notes.includes("Withdrawn"));
  assert.equal(result.contacts[0].evidence, "My original evidence");
  assert.equal(result.outreach[0].draft, legacy.outreach[0].draft);
  assert.equal(result.outreach[0].status, "Replied");
  assert.equal(result.outreach[0].followUp, "2026-11-10");
  assert.equal(isWorkspace(result), true);
  assert.equal(migrateWorkspace(result), result);
  assert.equal(migrateWorkspace({ ...legacy, contacts: [null] }), null);
});

test("outreach selects the factual evidence for the job family", () => {
  const contact = initialWorkspace.contacts[0];
  const text = createDraft(contact, { ...jobs[0], family: "DS" }, "coffee", {
    name: "Candidate",
    background: "Provided background.",
    highlights: [
      {
        family: "DS",
        text: "Provided causal analysis experience.",
        source: "resume.pdf",
      },
      { family: "PM", text: "Provided PRD experience.", source: "pm.pdf" },
    ],
  });
  assert.match(text, /Provided causal analysis experience/);
  assert.doesNotMatch(text, /Provided PRD experience/);
});

test("company and publication filters intersect without treating collection date as posting date", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const {
    matchesPostedWindow,
    postingTime,
  } = require("../.test-build/logic.js");
  assert.equal(
    matchesPostedWindow("2026-11-03T13:00:00Z", "Last 24 hours", now),
    true,
  );
  assert.equal(
    matchesPostedWindow("2022-05-04T12:00:00Z", "Last 30 days", now),
    false,
  );
  assert.equal(matchesPostedWindow("", "Last 30 days", now), false);
  assert.equal(matchesPostedWindow("", "Unknown date", now), true);
  assert.equal(postingTime("2 days ago"), null);
  const sample = [
    { ...jobs[0], category: "Chinese global companies", published: "" },
    {
      ...jobs[1],
      category: "Mid-to-large tech",
      published: "2022-05-04T12:00:00Z",
    },
  ];
  assert.equal(
    filterJobs(
      sample,
      {
        ...filters,
        excluded: "all",
        category: "Chinese global companies",
        postedWithin: "Unknown date",
      },
      initialWorkspace.preferences,
    ).length,
    1,
  );
});
const { screenJob } = require("../.test-build/eligibility.js");
const screeningJob = (role, summary = "", extra = {}) => ({
  ...jobs[0],
  role,
  summary,
  sourceEvidence: "",
  sponsorship: { status: "Unknown", quote: "" },
  ...extra,
});
test("2027 full-time screening needs positive evidence rather than a feed name or collection date", () => {
  assert.equal(
    screenJob(
      screeningJob("Data Analyst", "", { source: "2027 New Grad Jobs" }),
    ).status,
    "Needs verification",
  );
  assert.equal(
    screenJob(
      screeningJob("2027 New Grad Data Analyst", "Full-time employment"),
    ).status,
    "Target candidates",
  );
  assert.equal(
    screenJob(screeningJob("Entry Level Data Analyst", "Full-time employment"))
      .status,
    "Target candidates",
  );
  assert.equal(
    screenJob(screeningJob("Entry Level Data Analyst")).status,
    "Needs verification",
  );
});
test("screen separates internships, wrong cohorts, advanced experience and unavailable roles", () => {
  assert.equal(
    screenJob(screeningJob("2027 Data Analyst Intern", "Full-time")).status,
    "Not a match",
  );
  assert.equal(
    screenJob(screeningJob("2026 New Grad Data Scientist", "Full-time")).status,
    "Not a match",
  );
  assert.equal(
    screenJob(
      screeningJob("Data Analyst", "Entry-level full-time. Class of 2026."),
    ).status,
    "Not a match",
  );
  assert.equal(
    screenJob(
      screeningJob(
        "Data Analyst",
        "Entry-level full-time. Class of 2026-2027.",
      ),
    ).status,
    "Target candidates",
  );
  assert.equal(
    screenJob(
      screeningJob(
        "Data Analyst",
        "Entry-level full-time. Prefer 3 years of experience.",
      ),
    ).status,
    "Needs verification",
  );
  assert.equal(
    screenJob(
      screeningJob("New Grad Data Scientist", "Full-time", {
        sourcePresence: "Not in latest source",
      }),
    ).status,
    "Needs verification",
  );
});
test("full-time education, future conversion and directory programs do not establish current full-time eligibility", () => {
  assert.equal(
    screenJob(
      screeningJob(
        "Product Manager New Grad",
        "Currently enrolled in a full-time MBA program and graduating in 2027.",
      ),
    ).status,
    "Needs verification",
  );
  assert.equal(
    screenJob(
      screeningJob(
        "New Grad Analyst",
        "The goal is transitioning into a permanent full-time position after the program.",
      ),
    ).status,
    "Needs verification",
  );
  assert.equal(
    screenJob(
      screeningJob(
        "New Grad PM",
        "Full-time. Program lead only; exact title unverified.",
      ),
    ).status,
    "Needs verification",
  );
});

test("LinkedIn tracking URLs share a job identity; distinct posting IDs and employer query IDs stay distinct", () => {
  const { canonicalJobUrl } = require("../.test-build/job-identity.js");
  const a = {
    ...jobs[0],
    id: "old",
    sourceId: "linkedin",
    jdUrl:
      "https://www.linkedin.com/jobs/view/analyst-at-example-4478110837?position=1&refId=one",
    summary: "old evidence",
  };
  const b = {
    ...a,
    id: "new-hash",
    jdUrl:
      "https://linkedin.com/jobs/view/4478110837?position=2&trackingId=two",
    summary: "fresh evidence",
  };
  assert.equal(canonicalJobUrl(a.jdUrl), canonicalJobUrl(b.jdUrl));
  assert.notEqual(canonicalJobUrl(a.jdUrl),canonicalJobUrl("https://www.linkedin.com/jobs/view/4478110838"));
  assert.notEqual(
    canonicalJobUrl("https://example.com/jobs?jobId=1"),
    canonicalJobUrl("https://example.com/jobs?jobId=2"),
  );
  assert.equal(
    canonicalJobUrl("https://example.com/jobs?jobId=1&utm_source=feed"),
    "https://example.com/jobs?jobId=1",
  );
});
