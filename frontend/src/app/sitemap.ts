import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = "https://tumaps.hamzayasir.com";
  return [
    { url: `${site}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${site}/map`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
