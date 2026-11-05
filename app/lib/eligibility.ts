import type { Job } from "./model";

export const eligibilityLabels = ["Target candidates", "Needs verification", "Not a match"] as const;
export type EligibilityLabel = (typeof eligibilityLabels)[number];

// A conservative evidence screen, not an eligibility guarantee. Never infer a
// graduation cohort from the repository name, collection date, or company.
export function screenJob(job: Job): { status: EligibilityLabel; reason: string } {
  const title = job.role;
  const text = `${title}\n${job.sourceEvidence || ""}\n${job.summary}`;
  const reject = (reason: string) => ({ status: "Not a match" as const, reason });
  const review = (reason: string) => ({ status: "Needs verification" as const, reason });
  if (/\b(intern|internship|co-op|contractor|contract|temporary|part[- ]time)\b/i.test(title))
    return reject("Role title specifies internship, contract, temporary or part-time work.");
  if (/\b(senior|sr\.?|staff|principal|lead|director|head|manager ii|manager iii)\b/i.test(title))
    return reject("Role title specifies a level above entry level.");
  if (/employment type:\s*(intern|part[-_ ]?time|contract|temporary)/i.test(text))
    return reject("Employer employment type is not permanent full-time.");
  // Only explicit cohort labels count. A posting date is not a cohort.
  const cohorts = [...text.matchAll(/(?:class of|graduat(?:e|es|ing|ion)(?:\s+(?:in|date|year|cohort|class))?|new[- ]grad(?:uate)?(?:\s+class)?)\s*[:,-]?\s*(20\d{2})(?:\s*(?:-|–|to|or|\/)\s*(20\d{2}))?/gi)];
  const ranges = cohorts.map((m) => [Number(m[1]), Number(m[2] || m[1])]);
  for (const match of title.matchAll(/\b(20\d{2})\s+(?:new[- ]grad|graduate|university grad)/gi))
    ranges.push([Number(match[1]), Number(match[1])]);
  if (ranges.length && ranges.every(([from, to]) => !(from <= 2027 && 2027 <= to)))
    return reject("The explicit graduation cohort does not include 2027.");
  if (job.sourcePresence === "Not in latest source")
    return review("No longer present in the latest completed source fetch; verify availability.");
  if (job.sponsorship.status === "Not supported")
    return review("Source flags a work-authorization restriction; verify your eligibility in the employer JD.");
  if (/verify exact title|Program lead only|does not supply an exact job title/i.test(text))
    return review("Program directory only: verify that a specific full-time vacancy is open for 2027 graduates.");
  if (/currently enrolled in (?:a |an )?(?:full[- ]time )?(?:MBA|Ph\.?D)|(?:MBA|Ph\.?D) (?:degree )?required/i.test(text))
    return review("An MBA / PhD-specific requirement appears; verify whether your Yale master's degree qualifies.");
  if (/(?:transition|moving|placed|land).{0,85}full[- ]time|full[- ]time.{0,85}(?:after (?:the |completion)|afterwards)/i.test(text))
    return review("Full-time wording may describe conversion after a program, not the current employment type.");
  const early = /\b(new[- ]grad(?:uate)?s?|entry[- ]level|early[- ]career|university graduate|recent graduate|associate product manager|apm)\b/i.test(text);
  const fullTime = /\bfull[-_ ]?time\b(?!\s+(?:MBA|student|degree|education|study|studies))/i.test(text);
  // Conflicting or complex qualification paths remain reviewable rather than
  // deciding that a preferred qualification is a mandatory minimum.
  if (/\b(?:[3-9]|[1-9]\d)\+?\s*(?:-|–|to)?\s*\d*\s*years?(?:\s+of)?\s+(?:\w+\s+){0,3}experience\b/i.test(text))
    return review("Experience above entry level appears in the text; inspect mandatory versus preferred requirements.");
  if (!early || !fullTime)
    return review(`Missing explicit ${[!early && "new-grad / entry-level", !fullTime && "full-time"].filter(Boolean).join(" and ")} evidence.`);
  return {
    status: "Target candidates",
    reason: "Early-career and full-time wording found. Verify June 2027 start/graduation compatibility, full qualifications, availability and sponsorship in the employer JD.",
  };
}
