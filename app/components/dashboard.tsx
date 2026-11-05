"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCheck,
  Linkedin,
  UsersRound,
} from "lucide-react";
import { exclusionReason, rankJobs } from "../lib/logic";
import { stages } from "../lib/model";
import { outreachCounts } from "../lib/portal";
import { usePortal } from "./portal-data";
import { useWorkspace } from "../lib/store";
import { Avatar, Badge, Heading } from "./ui";
export function Dashboard() {
  const state = useWorkspace();
  const { data: portal } = usePortal();
  const submitted = state.applications.filter((a) =>
    ["Applied", "Assessment", "Interview", "Offer", "Rejected"].includes(
      a.stage,
    ),
  );
  const reminders = state.outreach
    .filter((o) => o.followUp && o.status !== "Do not contact")
    .sort((a, b) => a.followUp.localeCompare(b.followUp));
  const visibleJobs = rankJobs(
    state.jobs.filter((j) => !exclusionReason(j, state.preferences)),
  );
  const pending = state.applications.filter(
    (a) => a.stage === "To apply",
  ).length;
  return (
    <div className="overview-page">
      <Heading
        eyebrow="YOUR NEXT CHAPTER"
        title="Make every opportunity count"
        description="A clear view of your applications, opportunities, and next conversations."
      />
      <div className="metrics">
        {[
          {
            label: "Applied",
            value: submitted.length,
            caption: "Submitted applications, across all outcomes",
            icon: BriefcaseBusiness,
          },
          {
            label: "Interviewing",
            value: state.applications.filter((a) => a.stage === "Interview")
              .length,
            caption: "Conversations moving you forward",
            icon: UsersRound,
          },
          {
            label: "Offers",
            value: state.applications.filter((a) => a.stage === "Offer").length,
            caption: "Your next chapter is taking shape",
            icon: CheckCheck,
          },
          {
            label: "Target contacts",
            value: state.contacts.length,
            caption: "Unique contacts across agents",
            icon: Linkedin,
          },
        ].map(({ label, value, caption, icon: Icon }) => (
          <article className="metric" key={label}>
            <div>
              {label}
              <Icon size={20} />
            </div>
            <strong>
              {typeof value === "number"
                ? String(value).padStart(2, "0")
                : value}
            </strong>
            <small>{caption}</small>
          </article>
        ))}
      </div>
      <section className="panel overview-pipeline">
        <div className="section-title">
          <div>
            <span className="eyebrow">FROM INTEREST TO OFFER</span>
            <h2>Application progress</h2>
          </div>
          <Link className="text-link" href="/applications">
            View applications <ArrowRight size={16} />
          </Link>
        </div>
        <div className="pipeline">
          {stages
            .filter((stage) => !["Saved", "To apply"].includes(stage))
            .map((stage, i) => (
              <Link href="/applications" key={stage}>
                <span className="pipeline-number">0{i + 1}</span>
                <strong>
                  {state.applications.filter((a) => a.stage === stage).length}
                </strong>
                <span>{stage}</span>
              </Link>
            ))}
        </div>
      </section>
      <section className="panel overview-pipeline">
        <div className="section-title">
          <div>
            <span className="eyebrow">FROM DISCOVERY TO CONVERSATION</span>
            <h2>Outreach progress</h2>
          </div>
          <Link className="text-link" href="/people">
            View people <ArrowRight size={16} />
          </Link>
        </div>
        <div className="portal-metrics">
          {outreachCounts(state, portal).map(([label, value]) => (
            <Link href="/people" key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </Link>
          ))}
        </div>
        <p className="muted">
          Counts are contacts, not messages. Contacted includes recorded sends;
          incoming mail is not a confirmed human reply until reviewed.
        </p>
      </section>
      <section className="panel overview-actions">
        <div className="section-title">
          <div>
            <span className="eyebrow">FOCUS YOUR ENERGY</span>
            <h2>Your next moves</h2>
          </div>
          <Badge tone="blue">Action list</Badge>
        </div>
        <div className="action-grid">
          <Link href="/applications" className="action-row">
            <span className="action-icon peach">
              <BriefcaseBusiness size={20} />
            </span>
            <div>
              <strong>
                {pending
                  ? `${pending} applications to prepare`
                  : "Plan your next application"}
              </strong>
              <p>Update your tracker and choose what comes next.</p>
            </div>
            <ArrowUpRight size={18} />
          </Link>
          <Link href="/outreach" className="action-row">
            <span className="action-icon blue">
              <Linkedin size={20} />
            </span>
            <div>
              <strong>Start a meaningful conversation</strong>
              <p>{state.contacts.length} contacts in your network.</p>
            </div>
            <ArrowUpRight size={18} />
          </Link>
          {reminders.length
            ? reminders.slice(0, 2).map((o) => (
                <Link
                  className="action-row"
                  href={`/outreach?contact=${o.contactId}`}
                  key={o.contactId}
                >
                  <span className="action-icon mint">
                    <UsersRound size={20} />
                  </span>
                  <div>
                    <strong>
                      Follow up with{" "}
                      {state.contacts.find((c) => c.id === o.contactId)?.name}
                    </strong>
                    <p>
                      {o.followUp} · {o.status}
                    </p>
                  </div>
                  <ArrowUpRight size={18} />
                </Link>
              ))
            : null}
        </div>
      </section>
      <section className="panel overview-opportunities">
        <div className="section-title">
          <div>
            <span className="eyebrow">WORTH A CLOSER LOOK</span>
            <h2>Opportunities for you</h2>
          </div>
          <Link className="text-link" href="/jobs">
            All opportunities <ArrowRight size={16} />
          </Link>
        </div>
        {visibleJobs.slice(0, 3).map((j) => (
          <Link className="opportunity-row" href="/jobs" key={j.id}>
            <Avatar name={j.company} color={j.color} />
            <div>
              <strong>{j.role}</strong>
              <p>
                {j.company} · {j.location}
              </p>
            </div>
            <span className="row-detail">
              Deadline: {j.deadline || "Not listed"}
            </span>
            <Badge>{j.family} · Verify eligibility</Badge>
            <ArrowUpRight size={18} />
          </Link>
        ))}
        <div className="panel-footnote">
          Discovery target: 60% mid-to-large tech · 20% Chinese global companies
          · 20% startups & small companies. Availability may vary.
        </div>
      </section>
      <section className="panel overview-people">
        <div className="section-title">
          <div>
            <span className="eyebrow">BUILD YOUR NETWORK</span>
            <h2>People to connect with</h2>
          </div>
          <Link href="/people" className="text-link">
            All contacts <ArrowRight size={16} />
          </Link>
        </div>
        {state.contacts.slice(0, 3).map((c) => (
          <Link
            href={`/outreach?contact=${c.id}`}
            className="opportunity-row network-row"
            key={c.id}
          >
            <Avatar name={c.name} color="purple" />
            <div>
              <strong>{c.name}</strong>
              <p>
                {c.title} · {c.company}
              </p>
            </div>
            <span className="row-detail">{c.relationship}</span>
            <Badge tone="blue">
              {state.outreach.find((o) => o.contactId === c.id)?.status ??
                "Not sent"}
            </Badge>
            <ArrowUpRight size={18} />
          </Link>
        ))}
      </section>
    </div>
  );
}
