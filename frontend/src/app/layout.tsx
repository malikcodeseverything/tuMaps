import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TuMaps: Temple Campus Safety Routes",
  description: "Estimate route safety around Temple University campus",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@500;600;700&display=swap"
        />
      </head>
      <body className="bg-gray-950 text-white font-sans antialiased">{children}</body>
    </html>
  );
}
