import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "./components/shell";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Career Compass · Your career workspace",
  description:
    "Discover opportunities, track applications, and build meaningful professional connections.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Shell cloud={process.env.DEPLOYMENT_MODE === "cloud"}>{children}</Shell>
      </body>
    </html>
  );
}
