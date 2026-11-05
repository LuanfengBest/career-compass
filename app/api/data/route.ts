import { archivedJobs } from "../../lib/server/archive-jobs";
import { readWorkspace } from "../../lib/server/database";
import { failure, guard, json } from "../../lib/server/http";
import { screenJob } from "../../lib/eligibility";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    guard(request);
    const { workspace, revision } = readWorkspace();
    return json({
      revision,
      jobs: workspace.jobs.map((j) => ({
        id: j.id,
        company: j.company,
        role: j.role,
        location: j.location,
        company_bucket: j.category,
        screening: screenJob(j).status,
        screening_reason: screenJob(j).reason,
        posted_at: j.published,
        collected_at: j.collectedAt || "",
        source: j.discoveredBy?.join(" + ") || j.source,
        application_owner: j.applicationOwner || "Unassigned",
        sponsorship: j.sponsorship.status,
        jd_url: j.jdUrl,
      })),
      archived: archivedJobs().map(j=>({id:j.id,company:j.company,role:j.role,location:j.location,source:j.source,jd_url:j.jdUrl,reason:"Legacy website feed; not an agent discovery"})),
      people: workspace.contacts.map((p) => ({
        id: p.id,
        name: p.name,
        company: p.company,
        title: p.title,
        connection_status: p.connectionStatus || "To Be Connect",
        email_status: p.emailStatus,
        linkedin: p.linkedin,
        evidence: p.evidence,
        found_by: p.discoveredBy?.join(" + ") || "Manual",
        draft_owner: p.draftAssignment || "Not released",
      })),
    });
  } catch (e) {
    return failure(e);
  }
}
