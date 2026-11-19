import type { Metadata } from "next";
import "./globals.css";

const SITE = "https://tumaps.hamzayasir.com";
const DESCRIPTION =
  "Compare walking routes around Temple University's Main Campus by travel time and nearby reported incidents, with turn-by-turn walking navigation.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "TuMaps: Safer walking routes around Temple University",
    template: "%s · TuMaps",
  },
  description: DESCRIPTION,
  applicationName: "TuMaps",
  authors: [{ name: "Hamza Malik", url: "https://hamzayasir.com/" }],
  creator: "Hamza Malik",
  keywords: ["Temple University", "campus safety", "walking routes", "Philadelphia", "safe route map", "North Philadelphia"],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, "max-image-preview": "large" },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "TuMaps",
    title: "TuMaps: Safer walking routes around Temple University",
    description: DESCRIPTION,
    images: [{ url: "/campus-map-preview.jpg", width: 1280, height: 720, alt: "TuMaps route map of Temple University's Main Campus" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TuMaps: Safer walking routes around Temple University",
    description: DESCRIPTION,
    images: ["/campus-map-preview.jpg"],
  },
};

// Structured data so search engines and AI assistants can describe the app.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "TuMaps",
  url: `${SITE}/`,
  image: `${SITE}/campus-map-preview.jpg`,
  description: DESCRIPTION,
  applicationCategory: "TravelApplication",
  operatingSystem: "Any (web browser)",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  areaServed: { "@type": "Place", name: "Temple University Main Campus, Philadelphia, PA" },
  author: { "@type": "Person", "@id": "https://hamzayasir.com/#person", name: "Hamza Malik", url: "https://hamzayasir.com/" },
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
      <body className="bg-gray-950 text-white font-sans antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {children}
      </body>
    </html>
  );
}
