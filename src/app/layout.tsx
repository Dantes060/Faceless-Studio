import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Faceless Studio — story to shotlist to finished video",
  description:
    "Self-hosted faceless video studio: story engine, scene prompts, asset pipeline, credit ledger.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
