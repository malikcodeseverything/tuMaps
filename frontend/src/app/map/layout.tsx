import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Route map",
  description:
    "Plan a walking route around Temple University's Main Campus, compare options by time and nearby reported incidents, and start walking navigation.",
  alternates: { canonical: "/map" },
};

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
