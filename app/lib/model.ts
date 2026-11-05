export const stages = [
  "Saved",
  "To apply",
  "Applied",
  "Assessment",
  "Interview",
  "Offer",
  "Rejected",
] as const;
export type Stage = (typeof stages)[number];
export const outreachStatuses = [
  "Not sent",
  "Sent",
  "Replied",
  "Meeting booked",
  "Do not contact",
] as const;
export type OutreachStatus = (typeof outreachStatuses)[number];
export type Purpose = "referral" | "coffee";
export type Evidence = {
  status: "Supported" | "Not supported" | "Unknown";
  quote: string;
};
export type Job = {
  alternateSources?: {
    id: string;
    source: string;
    url: string;
    sourceId?: string;
  }[];
  discoveredBy?: ("dot" | "muse")[];
  applicationOwner?: "dot" | "muse";
  id: string;
  company: string;
  role: string;
  family: "PM" | "DS" | "DA";
  region: "United States" | "Hong Kong" | "Singapore" | "Europe" | "Unknown";
  location: string;
  category: string;
  categoryReason?: string;
  color: string;
  published: string;
  discovered: string;
  verified: string | null;
  source: string;
  opt: Evidence;
  stem: Evidence;
  sponsorship: Evidence;
  localAuthorization?: string;
  fit: string;
  gap: string;
  deadline: string;
  jdUrl: string;
  jdLinkKind?: "employer" | "source";
  summary: string;
  demo: boolean;
  sourceId?: string;
  sourceUrl?: string;
  sourceEvidence?: string;
  collectedAt?: string;
  employerCheckedAt?: string;
  employerCheck?: string;
  sourcePresence?: "Listed" | "Not in latest source";
  sourceCheckedAt?: string;
};
export type Application = {
  jobId: string;
  stage: Stage;
  updatedAt: string;
  origin: "Demo" | "Manual" | "Agent";
  evidenceAt?: string;
  sourceMessageId?: string;
  appliedAt: string;
  notes: string;
};
export type Contact = {
  draftAssignment?: "dot" | "muse";
  id: string;
  name: string;
  title: string;
  company: string;
  relationship: string;
  evidence: string;
  source: string;
  jobIds: string[];
  linkedin: string;
  demo: boolean;
  emailStatus: "Not contacted" | "Sent" | "Replied" | "Stopped";
  connectionStatus?: "To Be Connect" | "Connected";
  email?: string;
  emailSource?: "Public" | "Inferred";
  photoUrl?: string;
  discoveredBy?: ("dot" | "muse")[];
};
export type Outreach = {
  contactId: string;
  jobId: string;
  purpose: Purpose;
  draft: string;
  status: OutreachStatus;
  followUp: string;
  updatedAt: string;
};
export type Workspace = {
  version: 2;
  jobs: Job[];
  applications: Application[];
  contacts: Contact[];
  outreach: Outreach[];
  profile: {
    name: string;
    background: string;
    highlights?: { family: "PM" | "DS" | "DA"; text: string; source: string }[];
    sources?: string[];
    caution?: string;
  };
  preferences: { excludeTikTok: boolean; hideNoSponsor: boolean };
  emailPaused: boolean;
};

export const discoveryMix = [
  { category: "Mid-to-large tech", weight: 60 },
  { category: "Chinese global companies", weight: 20 },
  { category: "Startups & small companies", weight: 20 },
] as const;
