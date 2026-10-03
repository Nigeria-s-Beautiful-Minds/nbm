import type { MetadataRoute } from "next";
import { baseUrl, isProductionStage } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  // Staging is closed to crawlers entirely.
  if (!isProductionStage) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api", "/login", "/join", "/checkout", "/verify-email", "/reset-password", "/forgot-password", "/scholarships?"] },
    sitemap: `${baseUrl()}/sitemap.xml`
  };
}
