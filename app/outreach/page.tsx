import { OutreachCenter } from "../components/outreach";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ contact?: string }>;
}) {
  const { contact } = await searchParams;
  return <OutreachCenter initialContact={contact} />;
}
