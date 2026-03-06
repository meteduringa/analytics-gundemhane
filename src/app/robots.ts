import type { MetadataRoute } from "next";

const siteUrl = (
  process.env.NEXT_PUBLIC_HOST_URL ?? "https://giris.elmasistatistik.com.tr"
).replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
