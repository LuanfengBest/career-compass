import type { ReactNode } from "react";
export function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>
          {title}
          <span className="accent">.</span>
        </h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Avatar({
  name,
  color = "blue",
}: {
  name: string;
  color?: string;
}) {
  return (
    <span className={`avatar avatar-${color}`} aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "blue" | "green" | "amber";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
