import type { Stage } from "./model";
export type EmailEvent = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  receivedAt: string;
  snippet: string;
  suggestedStage: Stage | null;
  reason: string;
  reviewed: boolean;
  jobId?: string;
  manuallyLabeled?: boolean;
  agentReviewedBy?: "dot" | "muse";
  recruitingEvidence?: boolean;
  classificationVersion?: number;
  rfcMessageId?: string;
  mailboxEmail?: string;
  originalUrl?: string;
};
export const mailClassificationVersion = 3;
export function mailInWindow(receivedAt: string, now = Date.now()) {
  const date = Date.parse(receivedAt);
  return (
    Number.isFinite(date) && date >= now - 30 * 86400000 && date <= now + 60000
  );
}
// Bulk/news content must be rejected BEFORE looking for application keywords.
function unrelatedMail(subject: string, text: string, from: string, bulk: boolean) {
  return bulk ||
    /@(?:[^>\s]+\.)?(?:substack\.com|morningbrew\.com|managementconsulted\.com)|mba\.admissions@|admissions@/i.test(from) ||
    /student panel|career panel|webinar|information session|info session|pro bono|newsletter|digest|job alerts?|jobs? you may|earnings|price target|CDOConnect|career fair|networking event|interview (?:tips|prep|guide)|how to (?:apply|interview)/i.test(subject) ||
    /view (?:this email )?(?:online|in (?:your|a) browser).{0,100}(?:newsletter|subscribe)|newsletter logo|sponsored newsletter/i.test(text);
}
function applicationContext(subject: string, text: string) {
  // A mention of "submit your application" in a career guide is not a receipt.
  return /your (?:job )?application|application (?:received|submitted|status|update|follow[- ]?up)|interview (?:invitation|confirmation|availability|scheduled|confirmed)|(?:online|coding|technical) assessment|assessments?|offer of employment|offer letter/i.test(subject) ||
    /(?:received|reviewed|reviewing) your application|thank(?:s| you) for (?:applying|your application)|your application (?:has|was|is|will)|your candidacy|you(?: have|'ve)? (?:successfully )?applied|we.{0,35}(?:invite|inviting) you.{0,50}interview|your interview.{0,50}(?:scheduled|confirmed)|(?:please |invite you to )complete.{0,50}(?:online|coding|technical) assessment|offer of employment|offer letter/i.test(text);
}
export function isRecruitingMail(subject: string, text: string, from = "", bulk = false) {
  if (unrelatedMail(subject, text, from, bulk)) return false;
  if (classifyMail(subject, text, from, bulk).stage !== null) return true;
  // Keep a genuine application-in-review update even when no pipeline stage
  // can be inferred. A recruiter address or general career vocabulary is insufficient.
  return /your (?:job )?application.{0,80}(?:under review|being reviewed|reviewing|in progress|on hold)|(?:reviewing|received an update (?:on|regarding)).{0,40}your (?:job )?application/i.test(`${subject}\n${text}`);
}
export function classifyMail(
  subject: string,
  text: string,
  from = "",
  bulk = false,
): { stage: Stage | null; reason: string } {
  const value = `${subject}\n${text}`.split(/\nOn [^\n]{0,200}wrote:\s*\n/i)[0];
  if (unrelatedMail(subject, value, from, bulk) || !applicationContext(subject, value))
    return { stage: null, reason: "No direct application acknowledgement or personal application-status update." };
  const rules: [RegExp, Stage][] = [
    [
      /\b(regret to inform|sorry to inform|unable to (?:proceed|move forward|progress)|not (?:be )?(?:moving|move) forward|not (?:been )?selected|not a match for (?:the|this) (?:position|role)|no longer (?:under consideration|being considered)|not (?:be )?advancing|unable to offer|cannot proceed|will not (?:be (?:moving|proceeding)|proceed)|decided (?:not to (?:proceed|move forward)|to (?:pursue|proceed with) other)|pursu(?:e|ing) other candidates|(?:move|moving) forward with other (?:candidates|applicants)|position has been filled|role (?:has )?closed|application (?:was|has been) unsuccessful|not (?:been )?successful|not progress(?:ing)? (?:your|with your)|do not (?:meet|match) (?:the|our)|does not (?:meet|match) (?:the|our))\b/i,
      "Rejected",
    ],
    [
      /\b(pleased to (?:offer|extend)|offer of employment|offer letter|delighted to offer)\b/i,
      "Offer",
    ],
    [
      /\b((?:please|can you|could you|we would like to).{0,40}(?:schedule|scheduling).{0,60}interview|interview (?:invitation|scheduled|confirmed)|interview availability|invit(?:e|ing) you.{0,60}interview|your interview.{0,40}(?:scheduled|confirmed)|next (?:round|stage).{0,50}interview)\b/i,
      "Interview",
    ],
    [
      /\b(online assessment|coding assessment|recorded competency interview|take.home assignment|complet(?:e|ed|ing).{0,40}assessment|finished (?:the |your )?assessment)\b/i,
      "Assessment",
    ],
    [
      /\b(application (?:received|submitted)|received your application|thank you for applying|thanks for applying|thank you for your application|your application (?:has been |was )?(?:successfully )?(?:submitted|received))\b/i,
      "Applied",
    ],
  ];
  const matches = rules.flatMap(([pattern, stage]) => {
    for (const found of value.matchAll(new RegExp(pattern.source, "gi"))) {
      const start = Math.max(0, value.lastIndexOf(".", found.index) + 1, value.lastIndexOf("\n", found.index) + 1);
      const prefix = value.slice(start, found.index);
      // "If you are not selected..." is a disclaimer, not a rejection.
      // Search subsequent matches too, in case a later sentence is decisive.
      if (stage !== "Applied" && /\bif\b|\bshould you\b|\b(?:may|might|could|would) be\b/i.test(prefix)) continue;
      return [{
        stage,
        reason: value.slice(start, Math.min(value.length, found.index + found[0].length + 100))
          .replace(/\s+/g, " ").trim().slice(0, 280),
      }];
    }
    return [];
  });
  // A thank-you / application acknowledgement often precedes a later decision.
  const decisive = matches.filter((m) => m.stage !== "Applied");
  if (
    decisive.some((m) => m.stage === "Rejected") &&
    decisive.some((m) => m.stage === "Offer")
  )
    return {
      stage: null,
      reason:
        "Conflicting offer and rejection evidence; review the original message.",
    };
  if (decisive.length) return decisive[0];
  return (
    matches[0] || {
      stage: null,
      reason: "No clear application stage in the available message content.",
    }
  );
}
export function gmailMessageUrl(
  event: Pick<EmailEvent, "id" | "threadId" | "rfcMessageId" | "mailboxEmail">,
  fallbackAccount = "",
) {
  const url = new URL("https://mail.google.com/mail/");
  const account = event.mailboxEmail || fallbackAccount;
  if (account) url.searchParams.set("authuser", account);
  // Exact Message-ID search avoids assumptions about the user's default Gmail account.
  const rfc = event.rfcMessageId?.trim().replace(/^<|>$/g, "");
  url.hash = rfc
    ? `search/${encodeURIComponent(`rfc822msgid:${rfc}`)}`
    : `all/${encodeURIComponent(event.threadId || event.id)}`;
  return url.href;
}
