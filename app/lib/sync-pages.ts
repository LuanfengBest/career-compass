// Sequential pages use durable server checkpoints. Stop only between requests.
export async function syncPages(
  fetchPage: () => Promise<{ imported: number; more: boolean }>,
  stopped: () => boolean,
  progress: (pages: number, imported: number, more: boolean) => void,
) {
  let pages = 0;
  let imported = 0;
  let more = true;
  while (more && !stopped()) {
    const result = await fetchPage();
    pages++;
    imported += result.imported;
    more = result.more;
    progress(pages, imported, more);
  }
  return { pages, imported, more };
}
