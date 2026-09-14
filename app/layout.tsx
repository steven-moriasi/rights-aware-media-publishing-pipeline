import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./styles.css";

export const metadata: Metadata = {
  title: "Rights-Aware Media Pipeline",
  description:
    "Synthetic reference implementation for verified media lineage and rights-aware publishing.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="brand" href="/">
            FrameRights
          </Link>
          <nav aria-label="Primary">
            <Link href="/assets">Assets</Link>
            <Link href="/uploads">Ingest</Link>
            <Link href="/publishing">Publishing</Link>
            <Link href="/operations">Operations</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          Synthetic media only. Local and deterministic publisher adapters.
        </footer>
      </body>
    </html>
  );
}
