// Shared by browser imports and server agent imports. Never merge by title alone.
export function canonicalJobUrl(value: string): string {
  try {
    const u = new URL(value.replace(/^<|>$/g, "").replace(/&amp;/g, "&"));
    if (u.protocol !== "https:" || u.username || u.password) return "";
    if (/^(www\.)?linkedin\.com$/.test(u.hostname)) {
      const id = u.pathname.match(/^\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/)?.[1];
      if (id) return `https://www.linkedin.com/jobs/view/${id}`;
    }
    for (const key of [...u.searchParams.keys()])
      if (
        /^utm_|^(ref|source|referral|gh_src|trackingId|refId|position|pageNum)$/i.test(
          key,
        )
      )
        u.searchParams.delete(key);
    u.hash = "";
    u.searchParams.sort();
    return u.href;
  } catch {
    return "";
  }
}
