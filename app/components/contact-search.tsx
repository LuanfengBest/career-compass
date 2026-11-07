"use client";
import type { Contact } from "../lib/model";

export function searchContacts(contacts: Contact[], query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return contacts.filter((contact) => {
    const text = [contact.name, contact.company, contact.title, contact.email,
      contact.linkedin, contact.relationship].join(" ").toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function ContactSearch({ query, onChange, count, total }: {
  query: string;
  onChange: (value: string) => void;
  count: number;
  total: number;
}) {
  return (
    <div className="contact-search">
      <label>
        Search contacts
        <input type="search" value={query} onChange={(e) => onChange(e.target.value)}
          placeholder="Name, company, role or email" />
      </label>
      <div className="contact-search-summary">
        <span className="muted" role="status">{count} of {total} contacts</span>
        {query && <button type="button" className="text-link" onClick={() => onChange("")}>Clear search</button>}
      </div>
    </div>
  );
}
