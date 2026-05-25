import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TuMaps — Temple Campus Safety Routes",
  description: "Estimate route safety around Temple University campus",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="overflow-hidden bg-gray-950 text-white">{children}</body>
    </html>
  );
}
