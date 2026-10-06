import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Listing Quality Reviewer",
  description:
    "Review marketplace listings against policy with cited findings, suggested rewrites, and an approval history.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
